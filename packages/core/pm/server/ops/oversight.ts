// Cross-project views: my work, workload, portfolio, reports, search, activity.
import { asUser } from '../db.ts';
import { ApiError } from '../errors.ts';
import * as V from '../validate.ts';
import type { Ops, OpName, Person, Priority, ProjectAnalytics, ProjectReport, TaskStatus, Workload, WorkloadCell } from '../../shared/api.ts';
import { PRIORITIES, TASK_STATUSES } from '../../shared/api.ts';
import { addDays, all, assignedTo, diffDays, mondayOf, needRole, one, person, personCols, personOrThrow, projectSummaries, taskRows, today, type Ctx, type Row } from './util.ts';

const CAPACITY_MINUTES_PER_WEEK = 2400;
const MAX_RANGE_DAYS = 730;
const ACTIVE_PROJECT = 'p.deleted_at is null and not p.is_template';

export const oversightOps = {
  'mywork.list': async (ctx, args) => {
    let since: string | null = null;
    if (args.doneSince !== undefined) {
      const d = new Date(V.str(args.doneSince, 'doneSince', { min: 10, max: 40 }));
      if (Number.isNaN(d.getTime())) throw new ApiError('invalid', 'doneSince must be an ISO timestamp', 'doneSince');
      since = d.toISOString();
    }
    return asUser(ctx, (tx) => taskRows(tx,
      `${assignedTo('pm.uid()')} and t.deleted_at is null and ${ACTIVE_PROJECT}
       and (t.status <> 'done' or ($1::timestamptz is not null and t.completed_at >= $1::timestamptz))`, [since],
      'order by t.due_on nulls last, t.number, t.id'));
  },

  'portfolio.get': async (ctx) => asUser(ctx, (tx) => projectSummaries(tx,
    'p.archived_at is null and p.deleted_at is null and not p.is_template', [], 'order by p.due_on nulls last, lower(p.name), p.id')),

  'workload.get': async (ctx, args) => {
    const weeks = args.weeks === undefined ? 6 : V.int(args.weeks, 'weeks', 1, 12);
    const projectId = V.optNull(args, 'projectId', V.uuid) ?? null;
    return asUser(ctx, async (tx): Promise<Workload> => {
      if (projectId) await needRole(tx, projectId, 'viewer');
      const monday = mondayOf(await today(tx));
      const starts = Array.from({ length: weeks }, (_, i) => addDays(monday, i * 7));
      const members = await all(tx, `select ${personCols('u', 'u')} from pm_members m join pm_people u on u.id = m.user_id
        where m.workspace_id = pm.org() order by lower(u.name), u.id`);
      // A task with several assignees counts its FULL estimate (and one task) for every assignee: the load is per person, not split.
      // The sum over people can therefore exceed the sum of the task estimates; the Workload page says so in its legend.
      const tasks = await all(tx, `select ta.user_id assignee_id, t.due_on, t.estimate_minutes from pm_tasks t join pm_task_assignees ta on ta.task_id = t.id
        join pm_projects p on p.id = t.project_id
        where t.status <> 'done' and t.deleted_at is null and p.archived_at is null and ${ACTIVE_PROJECT}
        ${projectId ? 'and t.project_id = $1' : ''}`, projectId ? [projectId] : []);
      const cell = (): WorkloadCell => ({ minutes: 0, tasks: 0 });
      const rows = new Map(members.map((m) => [m.u_id as string, {
        person: personOrThrow(m, 'u'), overdue: cell(), noDate: cell(), byWeek: starts.map(cell), unestimated: 0,
      }]));
      for (const t of tasks) {
        const row = rows.get(t.assignee_id);
        if (!row) continue;
        const est = (t.estimate_minutes as number | null) ?? 0;
        if (t.estimate_minutes === null) row.unestimated++;
        let c: WorkloadCell | null = null;
        if (!t.due_on) c = row.noDate;
        else if (t.due_on < monday) c = row.overdue;
        else { const i = Math.floor(diffDays(t.due_on, monday) / 7); c = i < weeks ? row.byWeek[i] : null; }
        if (c) { c.minutes += est; c.tasks += 1; }
      }
      return { weeks: starts, people: [...rows.values()], capacityMinutesPerWeek: CAPACITY_MINUTES_PER_WEEK };
    });
  },

  'report.get': async (ctx, args) => {
    const projectId = V.uuid(args.projectId, 'projectId');
    return asUser(ctx, async (tx): Promise<ProjectReport> => {
      await needRole(tx, projectId, 'viewer');
      const [summary] = await projectSummaries(tx, 'p.id = $1', [projectId]);
      if (!summary) throw new ApiError('not_found', 'Project not found');
      const top = `t.project_id = $1 and t.parent_id is null and t.deleted_at is null`;
      const x = (await one<Row>(tx, `select count(*) filter (where t.completed_at >= now() - interval '7 days') d7,
          count(*) filter (where t.completed_at >= now() - interval '30 days') d30,
          coalesce(sum(t.estimate_minutes) filter (where t.status <> 'done'), 0) est_left
        from pm_tasks t where ${top}`, [projectId]))!;
      const logged = (await one<Row>(tx, `select coalesce(round(sum(extract(epoch from (e.ended_at - e.started_at))) / 60), 0) m
        from pm_time_entries e join pm_tasks t on t.id = e.task_id where e.project_id = $1 and e.ended_at is not null and t.deleted_at is null`, [projectId]))!;
      const statusCounts = await all(tx, `select t.status k, count(*) n from pm_tasks t where ${top} group by t.status`, [projectId]);
      const prioCounts = await all(tx, `select t.priority k, count(*) n from pm_tasks t where ${top} group by t.priority`, [projectId]);
      const byStatus = TASK_STATUSES.map((status: TaskStatus) => ({ status, count: (statusCounts.find((r) => r.k === status)?.n as number) ?? 0 }));
      const byPriority = PRIORITIES.map((priority: Priority) => ({ priority, count: (prioCounts.find((r) => r.k === priority)?.n as number) ?? 0 }));

      // One row per assignee (a task with two assignees appears in both rows); tasks nobody is assigned to form the person = null row.
      const perAssignee = await all(tx, `select ${personCols('a', 'a')},
          count(*) filter (where t.status <> 'done') open,
          count(*) filter (where t.status <> 'done' and t.due_on < current_date) overdue,
          count(*) filter (where t.status = 'done') done,
          coalesce(sum(t.estimate_minutes) filter (where t.status <> 'done'), 0) est_left
        from pm_tasks t left join pm_task_assignees ta on ta.task_id = t.id left join pm_people a on a.id = ta.user_id
        where ${top} group by a.id, a.name, a.email, a.color`, [projectId]);
      const perLogger = await all(tx, `select ${personCols('u', 'u')},
          coalesce(round(sum(extract(epoch from (e.ended_at - e.started_at))) filter (where e.billable) / 60), 0) billable,
          coalesce(round(sum(extract(epoch from (e.ended_at - e.started_at))) filter (where not e.billable) / 60), 0) other
        from pm_time_entries e join pm_people u on u.id = e.user_id join pm_tasks t on t.id = e.task_id
        where e.project_id = $1 and e.ended_at is not null and t.deleted_at is null group by u.id, u.name, u.email, u.color`, [projectId]);
      const people = new Map<string, ProjectReport['people'][number]>();
      const slot = (p: Person | null) => {
        const key = p?.id ?? 'none';
        let s = people.get(key);
        if (!s) { s = { person: p, open: 0, overdue: 0, done: 0, estimateLeftMinutes: 0, billableMinutes: 0, otherMinutes: 0 }; people.set(key, s); }
        return s;
      };
      for (const r of perAssignee) { const s = slot(person(r, 'a')); s.open = r.open; s.overdue = r.overdue; s.done = r.done; s.estimateLeftMinutes = r.est_left; }
      for (const r of perLogger) { const s = slot(person(r, 'u')); s.billableMinutes = r.billable; s.otherMinutes = r.other; }
      const peopleList = [...people.values()].sort((a, b) => (a.person ? 0 : 1) - (b.person ? 0 : 1) || (a.person?.name ?? '').localeCompare(b.person?.name ?? ''));

      const monday = mondayOf(await today(tx));
      const starts = Array.from({ length: 8 }, (_, i) => addDays(monday, (i - 7) * 7));
      const done = await all(tx, `select (t.completed_at at time zone 'UTC')::date d from pm_tasks t where ${top} and t.status = 'done' and t.completed_at is not null
        and (t.completed_at at time zone 'UTC')::date >= $2::date`, [projectId, starts[0]]);
      const completedPerWeek = starts.map((weekStart) => ({
        weekStart, count: done.filter((r) => r.d >= weekStart && r.d < addDays(weekStart, 7)).length,
      }));
      return {
        stats: { ...summary.stats, doneLast7: x.d7, doneLast30: x.d30, estimateLeftMinutes: x.est_left, loggedMinutes: logged.m },
        byStatus, byPriority, people: peopleList, completedPerWeek,
      };
    });
  },

  'analytics.project': async (ctx, args) => {
    const projectId = V.uuid(args.projectId, 'projectId');
    const wantFrom = V.opt(args, 'from', V.date), wantTo = V.opt(args, 'to', V.date);
    const rawIds = V.opt(args, 'assigneeIds', (x, f) => V.arr(x, f, 60, (v, g) => (v === 'unassigned' ? 'unassigned' : V.uuid(v, g))));
    const includeSubtasks = V.opt(args, 'includeSubtasks', V.bool) ?? false;
    const filterOn = rawIds !== undefined && rawIds.length > 0;
    const wantsNobody = filterOn && rawIds.includes('unassigned');
    const ids = filterOn ? [...new Set(rawIds.filter((x) => x !== 'unassigned'))] : [];
    if (wantFrom && wantTo && wantFrom > wantTo) throw new ApiError('invalid', 'from must be on or before to', 'from');

    return asUser(ctx, async (tx): Promise<ProjectAnalytics> => {
      await needRole(tx, projectId, 'viewer');
      const proj = await one<Row>(tx, 'select start_on, due_on from pm_projects where id = $1', [projectId]);
      if (!proj) throw new ApiError('not_found', 'Project not found');
      const now = await today(tx);
      const to = wantTo ?? now;
      let from = wantFrom;
      if (!from) {
        // The project's whole span: its start date or its first task, whichever is earlier; 30 days back for an empty, undated project.
        const first = (await one<Row>(tx, `select min((created_at at time zone 'UTC')::date) d from pm_tasks where project_id = $1 and deleted_at is null`, [projectId]))?.d as string | null | undefined;
        const starts = [proj.start_on as string | null, first ?? null].filter((x): x is string => !!x).sort();
        from = starts[0] ?? addDays(now, -30);
        if (from > to) from = to;
        if (diffDays(to, from) > MAX_RANGE_DAYS) from = addDays(to, -MAX_RANGE_DAYS);
      } else if (diffDays(to, from) > MAX_RANGE_DAYS) {
        throw new ApiError('invalid', 'The range can be at most 2 years', 'to');
      }
      if (from > to) throw new ApiError('invalid', 'from must be on or before to', 'from');
      const days = diffDays(to, from) + 1;
      const bucket: 'day' | 'week' = days > 92 ? 'week' : 'day';
      const step = bucket === 'week' ? 7 : 1;

      // Parameters: $1 project, $2 from, $3 to, ($4 the chosen people when a people filter is on).
      const params: unknown[] = [projectId, from, to];
      let who = '';
      if (filterOn) {
        params.push(ids);
        const has = `exists (select 1 from pm_task_assignees f where f.task_id = t.id and f.user_id = any($4::uuid[]))`;
        const none = `not exists (select 1 from pm_task_assignees f where f.task_id = t.id)`;
        who = `and (${has}${wantsNobody ? ` or ${none}` : ''})`;
      }
      const base = `select t.id, t.section_id, t.status, t.priority, t.due_on, t.estimate_minutes,
          (t.created_at at time zone 'UTC')::date cd,
          case when t.status = 'done' then (coalesce(t.completed_at, t.updated_at) at time zone 'UTC')::date end dd,
          exists (select 1 from pm_task_assignees x where x.task_id = t.id) assigned
        from pm_tasks t where t.project_id = $1 and t.deleted_at is null ${includeSubtasks ? '' : 'and t.parent_id is null'} ${who}`;
      const scoped = `b as (${base}), s as (select * from b where cd <= $3::date and (dd is null or dd >= $2::date))`;
      const q = `with ${scoped}`;

      const x = (await one<Row>(tx, `${q} select count(*) total, count(*) filter (where status <> 'done') open, count(*) filter (where status = 'done') done,
          count(*) filter (where status <> 'done' and due_on < current_date) overdue, count(*) filter (where status = 'blocked') blocked,
          count(*) filter (where not assigned) unassigned, coalesce(sum(estimate_minutes), 0) est,
          coalesce(sum(estimate_minutes) filter (where status = 'done'), 0) est_done from s`, params))!;
      const inRange = `e.ended_at is not null and (e.started_at at time zone 'UTC')::date between $2::date and $3::date`;
      const minutes = `coalesce(round(sum(extract(epoch from (e.ended_at - e.started_at))) / 60), 0)`;
      const logged = (await one<Row>(tx, `${q} select ${minutes} m from pm_time_entries e join s on s.id = e.task_id where ${inRange}`, params))!;

      const byStatusRows = await all(tx, `${q} select status k, count(*) n, coalesce(sum(estimate_minutes), 0) est from s group by status`, params);
      const byPriorityRows = await all(tx, `${q} select priority k, count(*) n, coalesce(sum(estimate_minutes), 0) est from s group by priority`, params);
      const byStatus = TASK_STATUSES.map((status: TaskStatus) => {
        const r = byStatusRows.find((y) => y.k === status);
        return { status, count: (r?.n as number) ?? 0, estimateMinutes: (r?.est as number) ?? 0 };
      });
      const byPriority = PRIORITIES.map((priority: Priority) => {
        const r = byPriorityRows.find((y) => y.k === priority);
        return { priority, count: (r?.n as number) ?? 0, estimateMinutes: (r?.est as number) ?? 0 };
      });

      // A task is listed for every person assigned to it (the full estimate counts for each); nobody-assigned tasks form the person = null row.
      const people = new Map<string, ProjectAnalytics['byAssignee'][number]>();
      const slot = (p: Person | null) => {
        const key = p?.id ?? 'none';
        let r = people.get(key);
        if (!r) { r = { person: p, open: 0, done: 0, overdue: 0, estimateOpenMinutes: 0, loggedMinutes: 0 }; people.set(key, r); }
        return r;
      };
      if (!filterOn || ids.length > 0) {
        const rows = await all(tx, `${q} select ${personCols('a', 'a')}, count(*) filter (where s.status <> 'done') open, count(*) filter (where s.status = 'done') done,
            count(*) filter (where s.status <> 'done' and s.due_on < current_date) overdue,
            coalesce(sum(s.estimate_minutes) filter (where s.status <> 'done'), 0) est_open
          from s join pm_task_assignees ta on ta.task_id = s.id join pm_people a on a.id = ta.user_id ${filterOn ? 'where ta.user_id = any($4::uuid[])' : ''}
          group by a.id, a.name, a.email, a.color`, params);
        for (const r of rows) Object.assign(slot(person(r, 'a')), { open: r.open, done: r.done, overdue: r.overdue, estimateOpenMinutes: r.est_open });
        const loggers = await all(tx, `${q} select ${personCols('u', 'u')}, ${minutes} m from pm_time_entries e join s on s.id = e.task_id join pm_people u on u.id = e.user_id
          where ${inRange} ${filterOn ? 'and e.user_id = any($4::uuid[])' : ''} group by u.id, u.name, u.email, u.color`, params);
        for (const r of loggers) slot(person(r, 'u')).loggedMinutes = r.m;
      }
      if (!filterOn || wantsNobody) {
        const r = (await one<Row>(tx, `${q} select count(*) filter (where status <> 'done') open, count(*) filter (where status = 'done') done,
            count(*) filter (where status <> 'done' and due_on < current_date) overdue, coalesce(sum(estimate_minutes) filter (where status <> 'done'), 0) est_open
          from s where not assigned`, params))!;
        if (r.open + r.done > 0) Object.assign(slot(null), { open: r.open, done: r.done, overdue: r.overdue, estimateOpenMinutes: r.est_open });
      }
      const byAssignee = [...people.values()].sort((a, b) => (a.person ? 0 : 1) - (b.person ? 0 : 1) || (a.person?.name ?? '').localeCompare(b.person?.name ?? '') || (a.person?.id ?? '').localeCompare(b.person?.id ?? ''));

      const bySection = (await all(tx, `${q} select s.section_id, sec.name, count(*) n, count(*) filter (where s.status <> 'done') open, count(*) filter (where s.status = 'done') done
          from s left join pm_sections sec on sec.id = s.section_id group by s.section_id, sec.name, sec.position order by sec.position nulls last, lower(sec.name)`, params))
        .map((r) => ({ sectionId: (r.section_id ?? null) as string | null, name: (r.name ?? 'No section') as string, count: r.n as number, open: r.open as number, done: r.done as number }));

      // Series ignore the date scope (they ARE the time axis) but honour the people / subtask filters.
      const seriesParams = [...params, step];
      const sp = `$${seriesParams.length}`;
      // The extra columns (totalAtEnd .. loggedMinutes) feed the KPI sparklines and use the same scope as the totals (s).
      const series = await all(tx, `with ${scoped}, pts as (
          select g::date ps, least(g::date + (${sp}::int - 1), $3::date) pe from generate_series($2::date, $3::date, make_interval(days => ${sp}::int)) g)
        select pts.ps::text date, pts.pe::text pend,
          (select count(*) from b where b.cd between pts.ps and pts.pe) created,
          (select count(*) from b where b.dd between pts.ps and pts.pe) completed,
          (select count(*) from b where b.cd <= pts.pe and (b.dd is null or b.dd > pts.pe)) open_at_end,
          (select count(*) from s where s.cd <= pts.pe) total_at_end,
          (select count(*) from s where s.cd <= pts.pe and (s.dd is null or s.dd > pts.pe) and s.due_on < pts.pe) overdue_at_end,
          (select coalesce(sum(s.estimate_minutes), 0) from s where s.cd <= pts.pe and (s.dd is null or s.dd > pts.pe)) est_left,
          (select ${minutes} from pm_time_entries e join s on s.id = e.task_id
            where e.ended_at is not null and (e.started_at at time zone 'UTC')::date between pts.ps and pts.pe) logged
        from pts order by pts.ps`, seriesParams);
      const completionSeries = series.map((r) => ({
        date: r.date as string, created: r.created as number, completed: r.completed as number, openAtEnd: r.open_at_end as number,
        totalAtEnd: r.total_at_end as number, overdueAtEnd: r.overdue_at_end as number, estimateLeftAtEnd: r.est_left as number, loggedMinutes: r.logged as number,
      }));
      const remainingSeries = completionSeries.map((p) => ({ date: p.date, value: p.openAtEnd }));

      let idealSeries: ProjectAnalytics['idealSeries'] = [];
      const dueOn = (proj.due_on ?? null) as string | null;
      if (dueOn) {
        const startOpen = (await one<Row>(tx, `${q} select count(*) n from b where cd < $2::date and (dd is null or dd >= $2::date) and $3::date >= $2::date`, params))!.n as number;
        const span = diffDays(dueOn, from);
        idealSeries = series.map((r) => {
          const left = span <= 0 ? 0 : Math.max(0, Math.min(1, diffDays(dueOn, r.pend as string) / span));
          return { date: r.date as string, value: Math.round(startOpen * left * 100) / 100 };
        });
      }

      const inScope = `t.id in (with ${scoped} select id from s)`;
      const dueSoon = await taskRows(tx, `${inScope} and t.status <> 'done' and t.due_on >= current_date`, params, 'order by t.due_on, t.number', 'limit 10');
      const overdueList = await taskRows(tx, `${inScope} and t.status <> 'done' and t.due_on < current_date`, params, 'order by t.due_on, t.number', 'limit 10');

      return {
        range: { from, to, bucket }, distinctTasks: x.total,
        totals: { total: x.total, open: x.open, done: x.done, overdue: x.overdue, blocked: x.blocked, unassigned: x.unassigned, estimateMinutes: x.est, estimateDoneMinutes: x.est_done, loggedMinutes: logged.m },
        byStatus, byPriority, byAssignee, bySection, completionSeries, remainingSeries, idealSeries, dueOn, dueSoon, overdueList,
      };
    });
  },

  'search.query': async (ctx, args) => {
    const q = V.str(args.q, 'q', { min: 1, max: 100 });
    const pattern = '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
    return asUser(ctx, async (tx) => ({
      projects: await projectSummaries(tx, `p.deleted_at is null and p.name ilike $1 escape '\\'`, [pattern], 'order by lower(p.name), p.id', 'limit 20'),
      tasks: await taskRows(tx, `t.deleted_at is null and p.deleted_at is null and t.title ilike $1 escape '\\'`, [pattern], 'order by t.updated_at desc, t.id', 'limit 20'),
    }));
  },

  'activity.project': async (ctx, args) => {
    const projectId = V.uuid(args.projectId, 'projectId');
    const limit = args.limit === undefined ? 50 : V.int(args.limit, 'limit', 1, 200);
    return asUser(ctx, async (tx) => {
      await needRole(tx, projectId, 'viewer');
      return (await all(tx, `select a.id, a.kind, a.data, a.created_at, a.task_id, t.title task_title, ${personCols('u', 'u')}
        from pm_activity a left join pm_people u on u.id = a.actor_id left join pm_tasks t on t.id = a.task_id
        where a.project_id = $1 order by a.id desc limit $2`, [projectId, limit]))
        .map((r) => ({ id: r.id as number, actor: person(r, 'u'), kind: r.kind as string, data: (r.data ?? {}) as Record<string, unknown>, createdAt: r.created_at as string,
          taskId: (r.task_id ?? null) as string | null, taskTitle: (r.task_title ?? null) as string | null }));
    });
  },
} satisfies Partial<{ [K in OpName]: (ctx: Ctx, args: Ops[K][0]) => Promise<Ops[K][1]> }>;

