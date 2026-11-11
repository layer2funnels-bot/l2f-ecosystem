// Tasks: list/get/create/update/move/bulk/duplicate/trash/restore/purge, repeat handling.
import { asUser } from '../db.ts';
import type { Tx } from '../db.ts';
import { ApiError } from '../errors.ts';
import { fileCols, fileJoin } from '../files.ts';
import * as V from '../validate.ts';
import type { Ops, OpName, Priority, RepeatRule, TaskDetail, BulkTaskPatch, TaskPatch, TaskStatus, TimeEntry, Comment, Attachment, ChecklistItem, TaskRef, StatusSpan, TaskLink } from '../../shared/api.ts';
import { PRIORITIES, TASK_STATUSES } from '../../shared/api.ts';
import type { FieldValue } from '../../shared/api.ts';
import { applyFieldChanges, copyTaskFieldValues, planFieldChanges } from './fields.ts';
import {
  MAX_ASSIGNEES, actorName, activity, addDays, addMonths, all, assertAssignable, assigneeIdsOf, diffDays, follow, followerIds, insertAssignees, needRole, notify, one, person, personCols,
  personOrThrow, prettyDate, projectRole, roleRank, run, taskRowById, taskRows, today, type Ctx, type Row,
} from './util.ts';

const REPEATS = ['daily', 'weekdays', 'weekly', 'biweekly', 'monthly', 'yearly'] as const;

// -- patch parsing --
export function parseTaskPatch(x: unknown, field = 'patch', bulk = false): BulkTaskPatch {
  const o = V.object(x, field);
  V.noUnknown(o, ['title', 'description', 'status', 'priority', 'assigneeIds', 'startOn', 'dueOn', 'estimateMinutes', 'repeatRule', 'sectionId', 'parentId', 'fields',
    ...(bulk ? ['addAssigneeIds', 'removeAssigneeIds'] : [])], field);
  const p: BulkTaskPatch = {};
  if (o.title !== undefined) p.title = V.str(o.title, 'title', { min: 1, max: 300 });
  if (o.description !== undefined) p.description = V.str(o.description, 'description', { max: 50000, trim: false });
  if (o.status !== undefined) p.status = V.oneOf(o.status, 'status', TASK_STATUSES);
  if (o.priority !== undefined) p.priority = V.oneOf(o.priority, 'priority', PRIORITIES);
  if (o.assigneeIds !== undefined) p.assigneeIds = V.uuidList(o.assigneeIds, 'assigneeIds', MAX_ASSIGNEES);
  if (o.addAssigneeIds !== undefined) p.addAssigneeIds = V.uuidList(o.addAssigneeIds, 'addAssigneeIds', MAX_ASSIGNEES);
  if (o.removeAssigneeIds !== undefined) p.removeAssigneeIds = V.uuidList(o.removeAssigneeIds, 'removeAssigneeIds', MAX_ASSIGNEES);
  if (o.startOn !== undefined) p.startOn = V.nullable(o.startOn, 'startOn', V.date);
  if (o.dueOn !== undefined) p.dueOn = V.nullable(o.dueOn, 'dueOn', V.date);
  if (o.estimateMinutes !== undefined) p.estimateMinutes = V.nullable(o.estimateMinutes, 'estimateMinutes', (v, f) => V.int(v, f, 0, 100000));
  if (o.repeatRule !== undefined) p.repeatRule = V.nullable(o.repeatRule, 'repeatRule', (v, f) => V.oneOf(v, f, REPEATS));
  if (o.sectionId !== undefined) p.sectionId = V.nullable(o.sectionId, 'sectionId', V.uuid);
  if (o.parentId !== undefined) p.parentId = V.nullable(o.parentId, 'parentId', V.uuid);
  if (o.fields !== undefined) {
    const fo = V.object(o.fields, 'fields');
    if (Object.keys(fo).length > 60) throw new ApiError('invalid', 'Too many custom fields in one change', 'fields');
    const out: Record<string, FieldValue | null> = {};
    for (const [k, v] of Object.entries(fo)) {
      if (v !== null && typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean' && !Array.isArray(v)) throw new ApiError('invalid', 'A custom field value has the wrong shape', 'fields');
      out[V.uuid(k, 'fields')] = v as FieldValue | null;
    }
    p.fields = out;
  }
  return p;
}

interface Change extends BulkTaskPatch { position?: number }
type ColumnField = Exclude<keyof TaskPatch, 'assigneeIds' | 'fields'>;
const FIELDS: Record<ColumnField, { col: string; name: string }> = {
  title: { col: 'title', name: 'title' }, description: { col: 'description', name: 'description' }, status: { col: 'status', name: 'status' },
  priority: { col: 'priority', name: 'priority' }, startOn: { col: 'start_on', name: 'startOn' },
  dueOn: { col: 'due_on', name: 'dueOn' }, estimateMinutes: { col: 'estimate_minutes', name: 'estimateMinutes' },
  repeatRule: { col: 'repeat_rule', name: 'repeatRule' }, sectionId: { col: 'section_id', name: 'section' },
  parentId: { col: 'parent_id', name: 'parent' },
};

// -- repeating tasks --
export function nextByRule(rule: RepeatRule, d: string): string {
  switch (rule) {
    case 'daily': return addDays(d, 1);
    case 'weekdays': {
      let n = addDays(d, 1);
      for (;;) { const dow = new Date(n + 'T00:00:00Z').getUTCDay(); if (dow !== 0 && dow !== 6) return n; n = addDays(n, 1); }
    }
    case 'weekly': return addDays(d, 7);
    case 'biweekly': return addDays(d, 14);
    case 'monthly': return addMonths(d, 1);
    case 'yearly': return addMonths(d, 12);
  }
}

async function spawnNextOccurrence(tx: Tx, cur: Row, rule: RepeatRule, userId: string): Promise<string> {
  const base = cur.due_on ?? (await today(tx));
  const dueOn = nextByRule(rule, base);
  let startOn: string | null = null;
  if (cur.start_on) {
    startOn = cur.due_on ? addDays(dueOn, -diffDays(cur.due_on, cur.start_on)) : nextByRule(rule, cur.start_on);
    if (startOn > dueOn) startOn = dueOn;
  }
  const r = await one<Row>(tx, `insert into pm_tasks (workspace_id, project_id, section_id, parent_id, title, description, status, priority,
      start_on, due_on, estimate_minutes, repeat_rule, position, created_by)
    values (pm.org(), $1, $2, $3, $4, $5, 'todo', $6, $7, $8, $9, $10, $11, pm.uid()) returning id`,
    [cur.project_id, cur.section_id, cur.parent_id, cur.title, cur.description, cur.priority, startOn, dueOn, cur.estimate_minutes, rule, cur.position]);
  const nid = r!.id as string;
  // The next occurrence keeps everyone who is assigned right now (changes of this very update are already applied).
  await insertAssignees(tx, cur.project_id, nid, await assigneeIdsOf(tx, cur.id));
  await run(tx, `insert into pm_task_tags (task_id, tag_id) select $1, tag_id from pm_task_tags where task_id = $2`, [nid, cur.id]);
  await copyTaskFieldValues(tx, cur.project_id, cur.id, nid); // custom field values repeat with the task
  await run(tx, `insert into pm_checklist_items (task_id, label, done, position) select $1, label, false, position from pm_checklist_items where task_id = $2`, [nid, cur.id]);
  await activity(tx, cur.project_id, nid, 'task.created', { repeatedFrom: cur.id });
  await follow(tx, cur.project_id, nid, userId);
  await activity(tx, cur.project_id, cur.id, 'task.repeated', { nextTaskId: nid, dueOn });
  return nid;
}

// -- core update --
/** Applies a change to one task with all side effects. Returns false only in lenient mode when the task is skipped. */
export async function changeTask(tx: Tx, ctx: Ctx, id: string, ch: Change, o: { version?: number; lenient?: boolean } = {}): Promise<boolean> {
  const cur = await one<Row>(tx, `select t.*, s.name section_name from pm_tasks t left join pm_sections s on s.id = t.section_id where t.id = $1`, [id]);
  if (!cur) { if (o.lenient) return false; throw new ApiError('not_found', 'Task not found'); }
  const role = await projectRole(tx, cur.project_id);
  if (roleRank(role) < 2) { if (o.lenient) return false; throw new ApiError('forbidden', 'You need editor access to this project'); }
  if (cur.deleted_at) { if (o.lenient) return false; throw new ApiError('invalid', 'This task is in the trash. Restore it first.'); }
  if (o.version !== undefined && o.version !== cur.version) {
    throw new ApiError('conflict', 'This task was changed by someone else. Reload to see the latest.');
  }

  const diffs: { key: ColumnField; from: unknown; to: unknown }[] = [];
  for (const key of Object.keys(FIELDS) as ColumnField[]) {
    const next = ch[key];
    if (next === undefined) continue;
    const prev = cur[FIELDS[key].col];
    if (next !== prev) diffs.push({ key, from: prev, to: next });
  }
  // Assignees: replace first, then add, then remove. The result is compared with the stored set.
  const before = await assigneeIdsOf(tx, id);
  let target = ch.assigneeIds ? [...ch.assigneeIds] : [...before];
  if (ch.addAssigneeIds) target = [...new Set([...target, ...ch.addAssigneeIds])];
  if (ch.removeAssigneeIds) target = target.filter((u) => !ch.removeAssigneeIds!.includes(u));
  const addedIds = target.filter((u) => !before.includes(u));
  const removedIds = before.filter((u) => !target.includes(u));
  const assigneesChanged = addedIds.length > 0 || removedIds.length > 0;
  const posChanged = ch.position !== undefined && ch.position !== cur.position;
  // Custom field values live in their own table (like tags): they do not move the task's version. In bulk mode a task of another project is skipped.
  const fieldPlan = ch.fields ? await planFieldChanges(tx, cur.project_id, id, ch.fields, o.lenient) : [];
  if (fieldPlan === 'skip') return false;
  const rowChanged = diffs.length > 0 || posChanged || assigneesChanged;
  if (!rowChanged && !fieldPlan.length) return true;
  if (!rowChanged) { await applyFieldChanges(tx, cur.project_id, id, fieldPlan); return true; }
  if (target.length > MAX_ASSIGNEES) throw new ApiError('invalid', `A task can have at most ${MAX_ASSIGNEES} assignees`, 'assigneeIds');

  const start = ch.startOn !== undefined ? ch.startOn : cur.start_on;
  const due = ch.dueOn !== undefined ? ch.dueOn : cur.due_on;
  if (start && due && due < start) throw new ApiError('invalid', 'The due date must be on or after the start date', 'dueOn');
  if (ch.sectionId) {
    if (!(await one(tx, 'select 1 x from pm_sections where id = $1 and project_id = $2', [ch.sectionId, cur.project_id]))) throw new ApiError('invalid', 'Section not found in this project', 'sectionId');
  }
  await assertAssignable(tx, cur.project_id, addedIds);
  if (ch.parentId) {
    if (ch.parentId === id) throw new ApiError('invalid', 'A task cannot be its own subtask', 'parentId');
    const parent = await one<Row>(tx, 'select project_id, parent_id, deleted_at from pm_tasks where id = $1', [ch.parentId]);
    if (!parent || parent.project_id !== cur.project_id || parent.deleted_at) throw new ApiError('invalid', 'Parent task not found in this project', 'parentId');
    if (parent.parent_id) throw new ApiError('invalid', 'Subtasks cannot have their own subtasks', 'parentId');
    if (await one(tx, 'select 1 x from pm_tasks where parent_id = $1 limit 1', [id])) throw new ApiError('invalid', 'A task that has subtasks cannot become a subtask', 'parentId');
  }

  const params: unknown[] = [id];
  const sets: string[] = [];
  for (const d of diffs) { params.push(d.to); sets.push(`${FIELDS[d.key].col} = $${params.length}`); }
  if (posChanged) { params.push(ch.position); sets.push(`position = $${params.length}`); }
  if (!sets.length) sets.push('title = title'); // assignees live in their own table: a no-op write still bumps version and updated_at via the guard trigger
  let cond = '';
  if (o.version !== undefined) { params.push(o.version); cond = ` and version = $${params.length}`; }
  const n = await run(tx, `update pm_tasks set ${sets.join(', ')} where id = $1${cond}`, params);
  if (n === 0) {
    if (o.version !== undefined) throw new ApiError('conflict', 'This task was changed by someone else. Reload to see the latest.');
    throw new ApiError('not_found', 'Task not found');
  }

  await applyFieldChanges(tx, cur.project_id, id, fieldPlan);
  if (removedIds.length) await run(tx, 'delete from pm_task_assignees where task_id = $1 and user_id = any($2::uuid[])', [id, removedIds]);
  await insertAssignees(tx, cur.project_id, id, addedIds);

  const me = await actorName(tx, ctx);
  const names = async (table: 'pm_people' | 'pm_sections', v: unknown) => (v ? (await one<Row>(tx, `select name from ${table} where id = $1`, [v]))?.name ?? null : null);
  for (const d of diffs) {
    let { from, to } = d;
    if (d.key === 'sectionId') { from = cur.section_name ?? null; to = await names('pm_sections', to); }
    else if (d.key === 'parentId') {
      const title = async (v: unknown) => (v ? (await one<Row>(tx, 'select title from pm_tasks where id = $1', [v]))?.title ?? null : null);
      from = await title(from); to = await title(to);
    }
    else if (d.key === 'description') { from = String(from ?? '').slice(0, 200); to = String(to ?? '').slice(0, 200); }
    await activity(tx, cur.project_id, id, 'task.updated', { field: FIELDS[d.key].name, from, to });
  }

  const title = ch.title ?? cur.title;
  const diff = (k: ColumnField) => diffs.find((d) => d.key === k);
  if (assigneesChanged) {
    const nameOf = async (ids: string[]) => ids.length
      ? (await all<{ name: string }>(tx, 'select name from pm_people where id = any($1::uuid[]) order by lower(name), id', [ids])).map((r) => r.name) : [];
    await activity(tx, cur.project_id, id, 'task.updated', { field: 'assignees', added: await nameOf(addedIds), removed: await nameOf(removedIds) });
    // Only people who were not assigned before hear about it (the actor never does: notify() skips them).
    await notify(tx, ctx, { userIds: addedIds, projectId: cur.project_id, taskId: id, kind: 'assigned', summary: `${me} assigned you “${title}”` });
  }
  const dueDiff = diff('dueOn');
  const stillAssigned = target.filter((u) => !addedIds.includes(u));
  if (dueDiff && stillAssigned.length) {
    const summary = dueDiff.to ? `${me} changed the due date of “${title}” to ${prettyDate(dueDiff.to as string)}` : `${me} removed the due date from “${title}”`;
    await notify(tx, ctx, { userIds: stillAssigned, projectId: cur.project_id, taskId: id, kind: 'due_changed', summary });
  }
  const st = diff('status');
  if (st && st.to === 'done') {
    await notify(tx, ctx, { userIds: await followerIds(tx, id), projectId: cur.project_id, taskId: id, kind: 'completed', summary: `${me} completed “${title}”` });
    const rule = (ch.repeatRule !== undefined ? ch.repeatRule : cur.repeat_rule) as RepeatRule | null;
    if (rule) await spawnNextOccurrence(tx, { ...cur, title, due_on: due, start_on: start, section_id: ch.sectionId !== undefined ? ch.sectionId : cur.section_id, priority: ch.priority ?? cur.priority, description: ch.description ?? cur.description, estimate_minutes: ch.estimateMinutes !== undefined ? ch.estimateMinutes : cur.estimate_minutes }, rule, ctx.userId);
  }
  return true;
}

async function insertTaskCopy(tx: Tx, src: Row, parentId: string | null, title: string, position: number): Promise<string> {
  const r = await one<Row>(tx, `insert into pm_tasks (workspace_id, project_id, section_id, parent_id, title, description, status, priority,
      start_on, due_on, estimate_minutes, repeat_rule, position, created_by)
    values (pm.org(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, pm.uid()) returning id`,
    [src.project_id, src.section_id, parentId, title, src.description, src.status, src.priority, src.start_on, src.due_on,
      src.estimate_minutes, src.repeat_rule, position]);
  const nid = r!.id as string;
  await insertAssignees(tx, src.project_id, nid, await assigneeIdsOf(tx, src.id));
  await run(tx, `insert into pm_checklist_items (task_id, label, done, position) select $1, label, done, position from pm_checklist_items where task_id = $2`, [nid, src.id]);
  await run(tx, `insert into pm_task_tags (task_id, tag_id) select $1, tag_id from pm_task_tags where task_id = $2`, [nid, src.id]);
  await copyTaskFieldValues(tx, src.project_id, src.id, nid);
  await run(tx, `insert into pm_task_links (task_id, title, url, created_by) select $1, title, url, pm.uid() from pm_task_links where task_id = $2`, [nid, src.id]);
  return nid;
}

// -- detail --
export async function taskDetail(tx: Tx, ctx: Ctx, id: string): Promise<TaskDetail> {
  const base = await taskRowById(tx, id);
  const extra = (await one<Row>(tx, `select t.description, ${personCols('cb', 'cb')} from pm_tasks t left join pm_people cb on cb.id = t.created_by where t.id = $1`, [id]))!;
  const myRole = (await projectRole(tx, base.projectId))!;
  const subtasks = await taskRows(tx, 't.parent_id = $1 and t.deleted_at is null', [id]);
  const checklist = (await all(tx, 'select id, label, done, position from pm_checklist_items where task_id = $1 order by position, created_at, id', [id])) as ChecklistItem[];
  const ref = (r: Row): TaskRef => ({ id: r.id, number: r.number, title: r.title, status: r.status });
  const waitingOn = (await all(tx, `select w.id, w.number, w.title, w.status from pm_dependencies d join pm_tasks w on w.id = d.depends_on_id
    where d.task_id = $1 and w.deleted_at is null order by w.number`, [id])).map(ref);
  const blocking = (await all(tx, `select w.id, w.number, w.title, w.status from pm_dependencies d join pm_tasks w on w.id = d.task_id
    where d.depends_on_id = $1 and w.deleted_at is null order by w.number`, [id])).map(ref);
  const comments = (await all(tx, `select c.id, c.body, c.created_at, c.edited_at, c.author_id, ${personCols('u', 'u')},
    coalesce((select array_agg(m.user_id order by m.user_id) from public.comment_mentions m where m.workspace_id = c.workspace_id and m.comment_id = c.id), '{}') mentions
    from public.comments c join pm_people u on u.id = c.author_id where c.entity_type = 'pm_task' and c.entity_id = $1 order by c.seq limit 500`, [id]))
    .map((r): Comment => ({ id: r.id, author: personOrThrow(r, 'u'), body: r.body, mentions: uuidArray(r.mentions), createdAt: r.created_at, editedAt: r.edited_at, mine: r.author_id === ctx.userId }));
  const attachments = (await all(tx, `select f.id, f.file_id, f.created_at, ${fileCols}, ${personCols('u', 'u')}
    from pm_attachments f ${fileJoin('f')} left join pm_people u on u.id = f.uploaded_by where f.task_id = $1 and f.deleted_at is null order by f.created_at, f.id`, [id]))
    .map((r): Attachment => ({ id: r.id, fileId: r.file_id, name: r.df_name, mime: r.df_mime, sizeBytes: r.df_size, kind: r.df_kind, uploadedBy: personOrThrow(r, 'u'), createdAt: r.created_at }));
  const links = (await all(tx, `select l.id, l.title, l.url, l.created_at, ${personCols('u', 'u')} from pm_task_links l left join pm_people u on u.id = l.created_by
    where l.task_id = $1 order by l.created_at, l.id`, [id]))
    .map((r): TaskLink => ({ id: r.id, title: r.title, url: r.url, createdBy: person(r, 'u'), createdAt: r.created_at }));
  const time = (await all(tx, `select e.id, e.user_id, e.started_at, e.ended_at, e.note, e.billable, ${personCols('u', 'u')}, ${MINUTES_SQL} minutes
    from pm_time_entries e join pm_people u on u.id = e.user_id where e.task_id = $1 order by e.started_at, e.id`, [id]))
    .map((r): TimeEntry => ({ id: r.id, user: personOrThrow(r, 'u'), startedAt: r.started_at, endedAt: r.ended_at, minutes: r.minutes, note: r.note, billable: r.billable, mine: r.user_id === ctx.userId }));
  const totalMinutes = time.filter((e) => e.endedAt).reduce((s, e) => s + e.minutes, 0);
  const activityItems = (await all(tx, `select a.id, a.kind, a.data, a.created_at, ${personCols('u', 'u')} from pm_activity a left join pm_people u on u.id = a.actor_id
    where a.task_id = $1 order by a.id desc limit 100`, [id]))
    .map((r) => ({ id: r.id as number, actor: person(r, 'u'), kind: r.kind as string, data: (r.data ?? {}) as Record<string, unknown>, createdAt: r.created_at as string }));
  const followers = (await all(tx, `select ${personCols('u', 'u')} from unnest(pm.follower_ids($1)) f(user_id) join pm_people u on u.id = f.user_id order by lower(u.name), u.id`, [id]))
    .map((r) => personOrThrow(r, 'u'));
  return {
    ...base, description: extra.description, createdBy: person(extra, 'cb'), subtasks, checklist, waitingOn, blocking, comments, attachments, links,
    time, totalMinutes, activity: activityItems, followers, following: followers.some((f) => f.id === ctx.userId), myRole,
  };
}

export const MINUTES_SQL = `(case when e.ended_at is null then floor(extract(epoch from (now() - e.started_at)) / 60)
  else round(extract(epoch from (e.ended_at - e.started_at)) / 60) end)`;

export function uuidArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string') return v.replace(/^\{|\}$/g, '').split(',').filter(Boolean);
  return [];
}

// -- trash helpers --
async function loadAll(tx: Tx, ids: string[], need: 'editor'): Promise<Row[]> {
  const rows = await all(tx, 'select id, project_id, parent_id, deleted_at, title from pm_tasks where id = any($1::uuid[])', [ids]);
  if (rows.length !== ids.length) throw new ApiError('not_found', 'Task not found');
  for (const pid of new Set(rows.map((r) => r.project_id as string))) await needRole(tx, pid, need);
  return rows;
}

export const taskOps = {
  'tasks.list': async (ctx, args) => {
    const projectId = V.uuid(args.projectId, 'projectId');
    const includeDone = args.includeDone === undefined ? true : V.bool(args.includeDone, 'includeDone');
    return asUser(ctx, async (tx) => {
      await needRole(tx, projectId, 'viewer');
      return taskRows(tx, `t.project_id = $1 and t.deleted_at is null${includeDone ? '' : " and t.status <> 'done'"}`, [projectId]);
    });
  },

  'tasks.get': async (ctx, args) => {
    const id = V.uuid(args.id, 'id');
    return asUser(ctx, (tx) => taskDetail(tx, ctx, id));
  },

  'tasks.create': async (ctx, args) => {
    const projectId = V.uuid(args.projectId, 'projectId');
    const title = V.str(args.title, 'title', { min: 1, max: 300 });
    const sectionId = V.optNull(args, 'sectionId', V.uuid) ?? null;
    const parentId = V.optNull(args, 'parentId', V.uuid) ?? null;
    const status: TaskStatus = V.opt(args, 'status', (x, f) => V.oneOf(x, f, TASK_STATUSES)) ?? 'todo';
    const priority: Priority = V.opt(args, 'priority', (x, f) => V.oneOf(x, f, PRIORITIES)) ?? 'none';
    const assigneeIds = V.opt(args, 'assigneeIds', (x, f) => V.uuidList(x, f, MAX_ASSIGNEES)) ?? [];
    const startOn = V.optNull(args, 'startOn', V.date) ?? null;
    const dueOn = V.optNull(args, 'dueOn', V.date) ?? null;
    const position = V.opt(args, 'position', V.num);
    if (startOn && dueOn && dueOn < startOn) throw new ApiError('invalid', 'The due date must be on or after the start date', 'dueOn');
    return asUser(ctx, async (tx) => {
      await needRole(tx, projectId, 'editor');
      if (parentId) {
        const parent = await one<Row>(tx, 'select project_id, parent_id, deleted_at from pm_tasks where id = $1', [parentId]);
        if (!parent || parent.project_id !== projectId || parent.deleted_at) throw new ApiError('invalid', 'Parent task not found in this project', 'parentId');
        if (parent.parent_id) throw new ApiError('invalid', 'Subtasks cannot have their own subtasks', 'parentId');
      }
      if (sectionId && !(await one(tx, 'select 1 x from pm_sections where id = $1 and project_id = $2', [sectionId, projectId]))) {
        throw new ApiError('invalid', 'Section not found in this project', 'sectionId');
      }
      await assertAssignable(tx, projectId, assigneeIds);
      const pos = position ?? ((await one<Row>(tx, `select coalesce(max(position), 0) + 1000 p from pm_tasks where project_id = $1 and parent_id is not distinct from $2::uuid
        and section_id is not distinct from $3::uuid`, [projectId, parentId, sectionId]))!.p as number);
      const r = await one<Row>(tx, `insert into pm_tasks (workspace_id, project_id, section_id, parent_id, title, status, priority, start_on, due_on, position, created_by)
        values (pm.org(), $1, $2, $3, $4, $5, $6, $7, $8, $9, pm.uid()) returning id`,
        [projectId, sectionId, parentId, title, status, priority, startOn, dueOn, pos]);
      const id = r!.id as string;
      await activity(tx, projectId, id, 'task.created', {});
      await follow(tx, projectId, id, ctx.userId);
      if (assigneeIds.length) {
        await insertAssignees(tx, projectId, id, assigneeIds);
        await notify(tx, ctx, { userIds: assigneeIds, projectId, taskId: id, kind: 'assigned', summary: `${await actorName(tx, ctx)} assigned you “${title}”` });
      }
      return taskRowById(tx, id);
    });
  },

  'tasks.addAssignees': async (ctx, args) => {
    const id = V.uuid(args.id, 'id');
    const userIds = V.uuidList(args.userIds, 'userIds', MAX_ASSIGNEES, 1);
    return asUser(ctx, async (tx) => {
      await changeTask(tx, ctx, id, { addAssigneeIds: userIds });
      return taskRowById(tx, id);
    });
  },

  'tasks.removeAssignee': async (ctx, args) => {
    const id = V.uuid(args.id, 'id');
    const userId = V.uuid(args.userId, 'userId');
    return asUser(ctx, async (tx) => {
      await changeTask(tx, ctx, id, { removeAssigneeIds: [userId] });
      return taskRowById(tx, id);
    });
  },

  'tasks.update': async (ctx, args) => {
    const id = V.uuid(args.id, 'id');
    const patch = parseTaskPatch(args.patch);
    const version = V.opt(args, 'version', (x, f) => V.int(x, f, 0, 2147483647));
    return asUser(ctx, async (tx) => {
      await changeTask(tx, ctx, id, patch, { version });
      return taskRowById(tx, id);
    });
  },

  'tasks.move': async (ctx, args) => {
    const id = V.uuid(args.id, 'id');
    const position = V.num(args.position, 'position');
    const sectionId = V.optNull(args, 'sectionId', V.uuid);
    const status = V.opt(args, 'status', (x, f) => V.oneOf(x, f, TASK_STATUSES));
    const ch: Change = { position };
    if (sectionId !== undefined) ch.sectionId = sectionId;
    if (status !== undefined) ch.status = status;
    return asUser(ctx, async (tx) => {
      await changeTask(tx, ctx, id, ch);
      return taskRowById(tx, id);
    });
  },

  'tasks.bulkUpdate': async (ctx, args) => {
    const ids = V.uuidList(args.ids, 'ids', 200, 1);
    const patch = parseTaskPatch(args.patch, 'patch', true);
    if (!Object.keys(patch).length) throw new ApiError('invalid', 'Nothing to change', 'patch');
    return asUser(ctx, async (tx) => {
      let updated = 0;
      for (const id of ids) if (await changeTask(tx, ctx, id, patch, { lenient: true })) updated++;
      return { updated };
    });
  },

  'tasks.duplicate': async (ctx, args) => {
    const id = V.uuid(args.id, 'id');
    return asUser(ctx, async (tx) => {
      const src = await one<Row>(tx, 'select * from pm_tasks where id = $1', [id]);
      if (!src) throw new ApiError('not_found', 'Task not found');
      await needRole(tx, src.project_id, 'editor');
      if (src.deleted_at) throw new ApiError('invalid', 'This task is in the trash. Restore it first.');
      const next = await one<Row>(tx, `select min(position) p from pm_tasks where project_id = $1 and parent_id is not distinct from $2::uuid
        and section_id is not distinct from $3::uuid and position > $4 and deleted_at is null`, [src.project_id, src.parent_id, src.section_id, src.position]);
      const pos = next?.p === null || next?.p === undefined ? src.position + 1000 : (src.position + next.p) / 2;
      const title = (src.title.length + 7 > 300 ? src.title.slice(0, 293) : src.title) + ' (copy)';
      const nid = await insertTaskCopy(tx, src, src.parent_id, title, pos);
      for (const s of await all(tx, 'select * from pm_tasks where parent_id = $1 and deleted_at is null order by number', [id])) {
        await insertTaskCopy(tx, s, nid, s.title, s.position);
      }
      await activity(tx, src.project_id, nid, 'task.created', { duplicatedFrom: id });
      await follow(tx, src.project_id, nid, ctx.userId);
      return taskRowById(tx, nid);
    });
  },

  'tasks.trash': async (ctx, args) => {
    const ids = V.uuidList(args.ids, 'ids', 200, 1);
    return asUser(ctx, async (tx) => {
      const rows = await loadAll(tx, ids, 'editor');
      await run(tx, 'update pm_tasks set deleted_at = now() where (id = any($1::uuid[]) or parent_id = any($1::uuid[])) and deleted_at is null', [ids]);
      for (const r of rows) await activity(tx, r.project_id, r.id, 'task.trashed', { title: r.title });
      return { ok: true } as const;
    });
  },

  'tasks.restore': async (ctx, args) => {
    const ids = V.uuidList(args.ids, 'ids', 200, 1);
    return asUser(ctx, async (tx) => {
      const rows = await loadAll(tx, ids, 'editor');
      for (const r of rows) {
        if (r.parent_id && !ids.includes(r.parent_id) && (await one(tx, 'select 1 x from pm_tasks where id = $1 and deleted_at is not null', [r.parent_id]))) {
          throw new ApiError('invalid', 'Restore the parent task first');
        }
      }
      // Subtasks trashed together with their parent come back with it.
      await run(tx, `update pm_tasks c set deleted_at = null from pm_tasks p where c.parent_id = p.id and p.id = any($1::uuid[]) and c.deleted_at = p.deleted_at`, [ids]);
      await run(tx, 'update pm_tasks set deleted_at = null where id = any($1::uuid[]) and deleted_at is not null', [ids]);
      for (const r of rows) await activity(tx, r.project_id, r.id, 'task.restored', { title: r.title });
      return { ok: true } as const;
    });
  },

  'tasks.purge': async (ctx, args) => {
    const ids = V.uuidList(args.ids, 'ids', 200, 1);
    return asUser(ctx, async (tx) => {
      const rows = await loadAll(tx, ids, 'editor');
      if (rows.some((r) => !r.deleted_at)) throw new ApiError('invalid', 'Only tasks in the trash can be deleted permanently');
      const n = await run(tx, 'delete from pm_tasks where id = any($1::uuid[]) and deleted_at is not null', [ids]);
      if (n !== ids.length) throw new ApiError('not_found', 'Task not found');
      return { ok: true } as const;   // linked Drive files stay in Drive
    });
  },

  // Status timeline: every stretch the task spent in a status, computed from the 'task.updated' (field = status) activity rows.
  'tasks.statusHistory': async (ctx, args) => {
    const id = V.uuid(args.id, 'id');
    return asUser(ctx, async (tx) => {
      const t = await one<Row>(tx, `select t.project_id, t.status, t.created_at, ${personCols('cb', 'cb')} from pm_tasks t
        left join pm_people cb on cb.id = t.created_by where t.id = $1`, [id]);
      if (!t) throw new ApiError('not_found', 'Task not found');
      await needRole(tx, t.project_id, 'viewer');
      const changes = await all(tx, `select a.data, a.created_at, ${personCols('u', 'u')} from pm_activity a
        left join pm_people u on u.id = a.actor_id
        where a.task_id = $1 and a.kind = 'task.updated' and a.data->>'field' = 'status' order by a.id`, [id]);
      const first = changes[0]?.data as { from?: string } | undefined;
      const spans: StatusSpan[] = [{ status: (first?.from ?? t.status) as TaskStatus, from: t.created_at as string, to: null, by: person(t, 'cb') }];
      for (const c of changes) {
        const to = (c.data as { to?: string }).to as TaskStatus | undefined;
        if (!to || !TASK_STATUSES.includes(to)) continue;
        spans[spans.length - 1].to = c.created_at as string;
        spans.push({ status: to, from: c.created_at as string, to: null, by: person(c, 'u') });
      }
      return spans;
    });
  },

  'tasks.trashList': async (ctx, args) => {
    const projectId = V.uuid(args.projectId, 'projectId');
    return asUser(ctx, async (tx) => {
      await needRole(tx, projectId, 'viewer');
      return taskRows(tx, `t.project_id = $1 and t.deleted_at is not null
        and not exists (select 1 from pm_tasks pt where pt.id = t.parent_id and pt.deleted_at is not null)`, [projectId], 'order by t.deleted_at desc, t.number desc');
    });
  },
} satisfies Partial<{ [K in OpName]: (ctx: Ctx, args: Ops[K][0]) => Promise<Ops[K][1]> }>;


