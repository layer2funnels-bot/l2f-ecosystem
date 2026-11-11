// Time tracking. Timers use the database clock; viewers may track their own time.
import { asUser } from '../db.ts';
import type { Tx } from '../db.ts';
import { ApiError } from '../errors.ts';
import * as V from '../validate.ts';
import type { Ops, OpName, RunningTimer, TimeEntry } from '../../shared/api.ts';
import { needRole, one, personCols, personOrThrow, run, taskScope, type Ctx, type Row } from './util.ts';
import { MINUTES_SQL } from './tasks.ts';

async function running(tx: Tx): Promise<RunningTimer | null> {
  const r = await one<Row>(tx, `select e.id, e.task_id, e.project_id, e.started_at, t.title from pm_time_entries e join pm_tasks t on t.id = e.task_id
    where e.user_id = pm.uid() and e.ended_at is null`);
  return r ? { entryId: r.id, taskId: r.task_id, taskTitle: r.title, projectId: r.project_id, startedAt: r.started_at } : null;
}

const stopMine = (tx: Tx) => run(tx, `update pm_time_entries set ended_at = least(now(), started_at + interval '24 hours')
  where user_id = pm.uid() and ended_at is null`);

async function entry(tx: Tx, ctx: Ctx, id: string): Promise<TimeEntry> {
  const r = await one<Row>(tx, `select e.id, e.user_id, e.started_at, e.ended_at, e.note, e.billable, ${personCols('u', 'u')}, ${MINUTES_SQL} minutes
    from pm_time_entries e join pm_people u on u.id = e.user_id where e.id = $1`, [id]);
  if (!r) throw new ApiError('not_found', 'Time entry not found');
  return { id: r.id, user: personOrThrow(r, 'u'), startedAt: r.started_at, endedAt: r.ended_at, minutes: r.minutes, note: r.note, billable: r.billable, mine: r.user_id === ctx.userId };
}

export const timeOps = {
  'time.start': async (ctx, args) => {
    const taskId = V.uuid(args.taskId, 'taskId');
    return asUser(ctx, async (tx) => {
      const t = await taskScope(tx, taskId);
      await needRole(tx, t.project_id, 'viewer');
      if (t.deleted_at) throw new ApiError('invalid', 'This task is in the trash. Restore it first.');
      await stopMine(tx);
      await run(tx, 'insert into pm_time_entries (task_id, user_id, started_at) values ($1, pm.uid(), now())', [taskId]);
      return (await running(tx))!;
    });
  },

  'time.stop': async (ctx) => asUser(ctx, async (tx) => { await stopMine(tx); return { ok: true } as const; }),

  'time.running': async (ctx) => asUser(ctx, (tx) => running(tx)),

  'time.log': async (ctx, args) => {
    const taskId = V.uuid(args.taskId, 'taskId');
    const minutes = V.int(args.minutes, 'minutes', 1, 1440);
    const date = V.date(args.date, 'date');
    const note = args.note === undefined ? '' : V.str(args.note, 'note', { max: 500 });
    const billable = args.billable === undefined ? false : V.bool(args.billable, 'billable');
    return asUser(ctx, async (tx) => {
      const t = await taskScope(tx, taskId);
      await needRole(tx, t.project_id, 'viewer');
      if (t.deleted_at) throw new ApiError('invalid', 'This task is in the trash. Restore it first.');
      if ((await one<Row>(tx, "select ($1::date > (now() at time zone 'utc')::date + 1) future", [date]))!.future) throw new ApiError('invalid', 'The date cannot be in the future', 'date');
      const r = await one<Row>(tx, `insert into pm_time_entries (task_id, user_id, started_at, ended_at, note, billable)
        values ($1, pm.uid(), ($2::date + time '09:00')::timestamp at time zone 'UTC', ($2::date + time '09:00')::timestamp at time zone 'UTC' + make_interval(mins => $3::int), $4, $5)
        returning id`, [taskId, date, minutes, note, billable]);
      return entry(tx, ctx, r!.id);
    });
  },

  'time.remove': async (ctx, args) => {
    const id = V.uuid(args.id, 'id');
    return asUser(ctx, async (tx) => {
      const e = await one<Row>(tx, 'select user_id, project_id from pm_time_entries where id = $1', [id]);
      if (!e) throw new ApiError('not_found', 'Time entry not found');
      if (e.user_id !== ctx.userId) await needRole(tx, e.project_id, 'manager');
      if ((await run(tx, 'delete from pm_time_entries where id = $1', [id])) === 0) throw new ApiError('not_found', 'Time entry not found');
      return { ok: true } as const;
    });
  },
} satisfies Partial<{ [K in OpName]: (ctx: Ctx, args: Ops[K][0]) => Promise<Ops[K][1]> }>;

