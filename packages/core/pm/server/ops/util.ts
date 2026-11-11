// Shared helpers for ops: typed queries, row mappers, permission checks, activity and notifications.
import type { Session, Tx } from '../db.ts';
import { ApiError } from '../errors.ts';
import type { Person, ProjectRole, ProjectSummary, Tag, TaskRow, Ops, OpName } from '../../shared/api.ts';

export type Ctx = Session;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;
export type Handler<K extends OpName> = (ctx: Ctx, args: Ops[K][0]) => Promise<Ops[K][1]>;
export type Registry = { [K in OpName]: Handler<K> };

// ───────────── queries ─────────────
// Dates stay 'YYYY-MM-DD' strings, timestamps become ISO strings, bigint/numeric become numbers.
function ts(v: string): string {
  const s = v.replace(' ', 'T');
  return new Date(/[zZ]$/.test(s) ? s : /[+-]\d\d(:?\d\d)?$/.test(s) ? s.replace(/([+-]\d\d)$/, '$1:00') : s + 'Z').toISOString();
}
const parsers = { 1082: (v: string) => v, 1184: ts, 20: Number, 1700: Number };

export async function all<T = Row>(tx: Tx, sql: string, p: unknown[] = []): Promise<T[]> {
  return (await tx.query<T>(sql, p, { parsers })).rows;
}
export async function one<T = Row>(tx: Tx, sql: string, p: unknown[] = []): Promise<T | undefined> {
  return (await all<T>(tx, sql, p))[0];
}
export async function run(tx: Tx, sql: string, p: unknown[] = []): Promise<number> {
  return (await tx.query(sql, p, { parsers })).affectedRows ?? 0;
}

// ───────────── dates (UTC calendar arithmetic on 'YYYY-MM-DD') ─────────────
const toUtc = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const fromUtc = (t: number) => new Date(t).toISOString().slice(0, 10);
export const addDays = (s: string, n: number) => fromUtc(toUtc(s) + n * 86400000);
export const diffDays = (a: string, b: string) => Math.round((toUtc(a) - toUtc(b)) / 86400000);
export function addMonths(s: string, n: number): string {
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return fromUtc(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), Math.min(d, last)));
}
export function mondayOf(s: string): string {
  const dow = new Date(toUtc(s)).getUTCDay(); // 0 = Sunday
  return addDays(s, -((dow + 6) % 7));
}
export const today = async (tx: Tx): Promise<string> => (await one<{ d: string }>(tx, 'select current_date d'))!.d;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const prettyDate = (s: string) => `${MONTHS[Number(s.slice(5, 7)) - 1]} ${Number(s.slice(8, 10))}`;

// ───────────── people ─────────────
export const personCols = (alias: string, prefix: string) =>
  `${alias}.id ${prefix}_id, ${alias}.name ${prefix}_name, ${alias}.email ${prefix}_email, ${alias}.color ${prefix}_color`;
export function person(r: Row, prefix: string): Person | null {
  return r[`${prefix}_id`] ? { id: r[`${prefix}_id`], name: r[`${prefix}_name`], email: r[`${prefix}_email`], color: r[`${prefix}_color`] } : null;
}
export const personOrThrow = (r: Row, prefix: string): Person =>
  person(r, prefix) ?? { id: '', name: 'Unknown', email: '', color: '#64748b' };

export async function actorName(tx: Tx, ctx: Ctx): Promise<string> {
  return (await one<{ name: string }>(tx, 'select name from pm_people where id = $1', [ctx.userId]))?.name ?? 'Someone';
}

/** Is this person an active-organization member (as far as the caller may see)? */
export async function isOrgMember(tx: Tx, userId: string): Promise<boolean> {
  return (await one(tx, 'select 1 x from pm_members where user_id = $1 and workspace_id = pm.org()', [userId])) !== undefined;
}

// ───────────── permissions ─────────────
const RANK: Record<ProjectRole, number> = { viewer: 1, editor: 2, manager: 3 };
export const roleRank = (r: ProjectRole | null) => (r ? RANK[r] : 0);

export async function projectRole(tx: Tx, projectId: string): Promise<ProjectRole | null> {
  return (await one<{ r: ProjectRole | null }>(tx, 'select pm.project_role($1::uuid) r', [projectId]))?.r ?? null;
}

/** Throws not_found when the caller has no access at all (indistinguishable from "does not exist"), forbidden when too low. */
export async function needRole(tx: Tx, projectId: string, need: ProjectRole): Promise<ProjectRole> {
  const role = await projectRole(tx, projectId);
  if (!role) throw new ApiError('not_found', 'Project not found');
  if (roleRank(role) < RANK[need]) throw new ApiError('forbidden', `You need ${need} access to this project`);
  return role;
}

export async function orgRole(tx: Tx): Promise<string | null> {
  return (await one<{ r: string | null }>(tx, 'select pm.org_role() r'))?.r ?? null;
}

// ───────────── activity, notifications, followers ─────────────
export async function activity(tx: Tx, projectId: string, taskId: string | null, kind: string, data: Record<string, unknown> = {}): Promise<void> {
  await run(tx, `insert into pm_activity (workspace_id, project_id, task_id, actor_id, kind, data) values (pm.org(), $1, $2, pm.uid(), $3, $4::jsonb)`,
    [projectId, taskId, kind, JSON.stringify(data)]);
}

export async function notify(tx: Tx, ctx: Ctx, o: { userIds: string[]; projectId: string; taskId: string | null; kind: 'assigned' | 'mentioned' | 'commented' | 'completed' | 'due_changed'; summary: string }): Promise<void> {
  // The shared ecosystem bell (migration 0049): each person only if they may open the task; never the actor.
  const ids = [...new Set(o.userIds)].filter((u) => u !== ctx.userId);
  if (!ids.length || !o.taskId) return;
  await run(tx, 'select pm.notify($1::uuid[], $2, $3)', [ids, o.kind, o.taskId]);
}

export async function follow(tx: Tx, projectId: string, taskId: string, userId: string): Promise<void> {
  void projectId;
  await run(tx, 'select pm.follow($1, $2)', [taskId, userId]);
}

export async function followerIds(tx: Tx, taskId: string): Promise<string[]> {
  return ((await one<{ ids: string[] }>(tx, 'select pm.follower_ids($1) ids', [taskId]))?.ids ?? []).map(String);
}

// ───────────── assignees ─────────────
export const MAX_ASSIGNEES = 20;

export async function assigneeIdsOf(tx: Tx, taskId: string): Promise<string[]> {
  return (await all<{ user_id: string }>(tx, 'select user_id from pm_task_assignees where task_id = $1', [taskId])).map((r) => r.user_id);
}

/** Every person must be a member of the active organization AND able to open the project; otherwise a clear invalid error. */
export async function assertAssignable(tx: Tx, projectId: string, userIds: string[], field = 'assigneeIds'): Promise<void> {
  if (!userIds.length) return;
  const rows = await all(tx, `select u.id, eu.name, om.user_id is not null member, pm.user_can_view($1::uuid, u.id) can_view
    from unnest($2::uuid[]) u(id) left join pm_members om on om.workspace_id = pm.org() and om.user_id = u.id left join pm_people eu on eu.id = u.id`, [projectId, userIds]);
  const personal = (await one<Row>(tx, 'select is_personal from pm_projects where id = $1', [projectId]))?.is_personal === true;
  for (const r of rows) {
    if (!r.member) throw new ApiError('invalid', 'That person is not a member of this organization', field);
    if (!r.can_view) {
      throw new ApiError('invalid', personal
        ? 'Personal projects are private: only the owner can be assigned'
        : `${r.name ?? 'That person'} cannot view this project. Add them to the project first.`, field);
    }
  }
}

/** Inserts assignee rows (the caller validated them) and makes the new assignees followers. */
export async function insertAssignees(tx: Tx, projectId: string, taskId: string, userIds: string[]): Promise<void> {
  if (!userIds.length) return;
  await run(tx, `insert into pm_task_assignees (workspace_id, project_id, task_id, user_id) select pm.org(), $1, $2, u from unnest($3::uuid[]) u on conflict do nothing`,
    [projectId, taskId, userIds]);
  for (const u of userIds) await follow(tx, projectId, taskId, u);
}

// ───────────── tasks ─────────────
const TASK_SELECT = `select t.id, t.project_id, p.name project_name, p.color project_color, t.number, t.section_id, t.parent_id, t.title, t.status, t.priority,
  t.start_on, t.due_on, t.estimate_minutes, t.repeat_rule, t.position, t.completed_at, t.deleted_at, t.version, t.updated_at, t.created_at,
  (select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name, 'email', u.email, 'color', u.color) order by lower(u.name), u.id), '[]'::jsonb)
     from pm_task_assignees ta join pm_people u on u.id = ta.user_id where ta.task_id = t.id) assignees,
  (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'color', g.color) order by g.name), '[]'::jsonb)
     from pm_task_tags tt join pm_tags g on g.id = tt.tag_id where tt.task_id = t.id) tags,
  (select coalesce(jsonb_object_agg(fv.field_id, fv.value), '{}'::jsonb)
     from pm_task_field_values fv join pm_custom_fields cf on cf.id = fv.field_id and cf.archived_at is null where fv.task_id = t.id) fields,
  (select count(*) from pm_tasks s where s.parent_id = t.id and s.deleted_at is null) c_sub,
  (select count(*) from pm_tasks s where s.parent_id = t.id and s.deleted_at is null and s.status = 'done') c_sub_done,
  (select count(*) from pm_checklist_items c where c.task_id = t.id) c_chk,
  (select count(*) from pm_checklist_items c where c.task_id = t.id and c.done) c_chk_done,
  (select count(*) from pm_attachments f where f.task_id = t.id and f.deleted_at is null) c_files,
  (select count(*) from pm_task_links l where l.task_id = t.id) c_links,
  (select count(*) from public.comments m where m.workspace_id = t.workspace_id and m.entity_type = 'pm_task' and m.entity_id = t.id) c_comments,
  (select count(*) from pm_dependencies d join pm_tasks w on w.id = d.depends_on_id where d.task_id = t.id and w.status <> 'done' and w.deleted_at is null) c_wait
  from pm_tasks t join pm_projects p on p.id = t.project_id`;

/** SQL predicate (alias t = the task): the person given by `userSql` is one of its assignees. */
export const assignedTo = (userSql: string) => `exists (select 1 from pm_task_assignees ta where ta.task_id = t.id and ta.user_id = ${userSql})`;

export function mapTask(r: Row): TaskRow {
  return {
    id: r.id, projectId: r.project_id, projectName: r.project_name, projectColor: r.project_color,
    number: r.number, sectionId: r.section_id, parentId: r.parent_id, title: r.title, status: r.status, priority: r.priority,
    assignees: (r.assignees ?? []) as Person[], startOn: r.start_on, dueOn: r.due_on, estimateMinutes: r.estimate_minutes, repeatRule: r.repeat_rule,
    position: r.position, completedAt: r.completed_at, deletedAt: r.deleted_at, version: r.version, updatedAt: r.updated_at, createdAt: r.created_at,
    tags: (r.tags ?? []) as Tag[], fields: (r.fields ?? {}) as TaskRow['fields'],
    counts: { subtasks: r.c_sub, subtasksDone: r.c_sub_done, checklist: r.c_chk, checklistDone: r.c_chk_done, files: r.c_files, links: r.c_links, comments: r.c_comments, waitingOn: r.c_wait },
  };
}

/** `where` may use aliases t (task) and p (project). */
export async function taskRows(tx: Tx, where: string, params: unknown[] = [], order = 'order by t.position, t.number', limit = ''): Promise<TaskRow[]> {
  return (await all(tx, `${TASK_SELECT} where ${where} ${order} ${limit}`, params)).map(mapTask);
}
export async function taskRowById(tx: Tx, id: string): Promise<TaskRow> {
  const r = (await taskRows(tx, 't.id = $1', [id]))[0];
  if (!r) throw new ApiError('not_found', 'Task not found');
  return r;
}

/** Loads the task's scope (RLS-filtered). not_found when absent or not visible. */
export async function taskScope(tx: Tx, id: string): Promise<{ id: string; project_id: string; parent_id: string | null; title: string; status: string; deleted_at: string | null }> {
  const r = await one<Row>(tx, 'select id, project_id, parent_id, title, status, deleted_at from pm_tasks where id = $1', [id]);
  if (!r) throw new ApiError('not_found', 'Task not found');
  return r as never;
}

/** Task the caller may write to (editor+), alive. */
export async function editableTask(tx: Tx, id: string, need: ProjectRole = 'editor') {
  const t = await taskScope(tx, id);
  await needRole(tx, t.project_id, need);
  if (t.deleted_at) throw new ApiError('invalid', 'This task is in the trash. Restore it first.');
  return t;
}

// ───────────── projects ─────────────
const PROJECT_SELECT = `select p.id, p.name, p.color, p.status, p.description, p.client_id, c.name client_name, ${personCols('o', 'o')},
  p.start_on, p.due_on, p.visibility, p.is_template, p.is_personal, p.default_view, p.archived_at, p.deleted_at,
  greatest(p.updated_at, coalesce((select max(t.updated_at) from pm_tasks t where t.project_id = p.id), p.updated_at)) updated_at,
  pm.project_role(p.id) my_role, s.total, s.done, s.blocked, s.overdue, s.next_due
  from pm_projects p
  left join pm_clients c on c.id = p.client_id
  left join pm_people o on o.id = p.owner_id
  cross join lateral (
    select count(*) total, count(*) filter (where t.status = 'done') done, count(*) filter (where t.status = 'blocked') blocked,
      count(*) filter (where t.status <> 'done' and t.due_on < current_date) overdue,
      min(t.due_on) filter (where t.status <> 'done') next_due
    from pm_tasks t where t.project_id = p.id and t.parent_id is null and t.deleted_at is null) s`;

export function mapProject(r: Row): ProjectSummary {
  const total = r.total as number, done = r.done as number;
  return {
    id: r.id, name: r.name, color: r.color, status: r.status, description: r.description,
    clientId: r.client_id, clientName: r.client_name, owner: person(r, 'o'), startOn: r.start_on, dueOn: r.due_on,
    visibility: r.visibility, isTemplate: r.is_template, defaultView: r.default_view,
    kind: r.is_personal ? 'personal' : r.client_id ? 'client' : 'internal',
    archivedAt: r.archived_at, deletedAt: r.deleted_at, updatedAt: r.updated_at, myRole: r.my_role,
    stats: { total, done, open: total - done, overdue: r.overdue, blocked: r.blocked, progress: total ? Math.round((done * 100) / total) : 0, nextDueOn: r.next_due },
  };
}

export async function projectSummaries(tx: Tx, where: string, params: unknown[] = [], order = 'order by lower(p.name), p.id', limit = ''): Promise<ProjectSummary[]> {
  return (await all(tx, `${PROJECT_SELECT} where ${where} ${order} ${limit}`, params)).map(mapProject);
}
