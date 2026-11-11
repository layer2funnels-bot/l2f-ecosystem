// The five old Projects operations that other screens still call, now answered from Projects V2 (migration 0051):
//   projects.list / projects.get  — Planner's project picker, Whiteboard and Docs breadcrumbs, Boards' project filter
//   projects.people               — Drive's people list (unchanged: it reads memberships)
//   my.work / projects.deadlines  — Office Home's "assigned to you" and "coming up" cards
//   tasks.list                    — the Team page's "open work" for one person
// Same names, same answer shapes and the old wording (status planned/active/on_hold/done for projects, todo/doing/blocked/done
// for tasks, priority low/normal/high/urgent), so their callers did not change. Read-only: every change to a project or task
// goes through Projects V2 (pm.*). The old app's write operations are retired with it; its tables stay as the backup.
// Row rules decide what anyone sees (Projects V2 roles; personal projects are their owner's only).
import { defineOperation } from './define.mjs';

const PROJECT_STATUS = `case p.status when 'complete' then 'done' when 'on_hold' then 'on_hold' else 'active' end`;
const TASK_STATUS = `case t.status when 'in_progress' then 'doing' when 'in_review' then 'doing' else t.status end`;
const TASK_PRIORITY = `case t.priority when 'none' then 'normal' when 'medium' then 'normal' else t.priority end`;
const like = (s) => `%${String(s).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const PSELECT = `select p.id, p.client_id, p.name, p.description, ${PROJECT_STATUS} as status, p.owner_id, p.start_on, p.due_on, p.client_visible, p.archived_at, p.is_template, p.created_at, p.updated_at,
    (select count(*)::int from pm_tasks t where t.project_id = p.id and t.deleted_at is null and t.parent_id is null) as tasks_total,
    (select count(*)::int from pm_tasks t where t.project_id = p.id and t.deleted_at is null and t.parent_id is null and t.status = 'done') as tasks_done
  from pm_projects p`;

export const projectsCompatOperations = [
  defineOperation({
    name: 'projects.list', class: 'read',
    // scope: 'client' = projects tied to a client, 'internal' = the organization's own projects (no client). Personal projects are never listed here.
    input: { client: { type: 'uuid' }, scope: { type: 'enum', values: ['all', 'client', 'internal'] }, archived: { type: 'bool' }, q: { type: 'text', max: 100 }, templates: { type: 'bool' } },
    run: (q, _c, i) => q(`${PSELECT} where p.deleted_at is null and not p.is_personal and ($1::uuid is null or p.client_id = $1) and ((p.archived_at is not null) = $2) and p.is_template = $5
      and ($3::text is null or p.name ilike $3) and ($4::text is null or $4 = 'all' or ($4 = 'client' and p.client_id is not null) or ($4 = 'internal' and p.client_id is null)) order by p.name limit 200`,
    [i.client ?? null, i.archived ?? false, i.q ? like(i.q) : null, i.scope ?? null, i.templates ?? false]),
  }),
  defineOperation({ name: 'projects.get', class: 'read', single: true, input: { id: { type: 'uuid', required: true } }, run: (q, _c, i) => q(`${PSELECT} where p.id = $1 and p.deleted_at is null`, [i.id]) }),
  defineOperation({
    name: 'projects.people', class: 'read',
    run: (q, ctx) => q(`select m.user_id, coalesce(nullif(pr.display_name, ''), 'Member ' || left(m.user_id::text, 4)) as display_name, (m.user_id = $1) as is_you
      from memberships m left join profiles pr on pr.id = m.user_id where m.kind = 'staff' and m.status = 'active' order by (m.user_id = $1) desc, lower(coalesce(pr.display_name, '')) limit 200`, [ctx.userId]),
  }),
  defineOperation({
    name: 'tasks.list', class: 'read',
    input: { project: { type: 'uuid' }, assignee: { type: 'uuid' }, archived: { type: 'bool' }, open_only: { type: 'bool' }, top_only: { type: 'bool' } },
    run: (q, _c, i) => q(`select t.id, t.project_id, p.client_id, t.title, ${TASK_STATUS} as status, ${TASK_PRIORITY} as priority, t.due_on, t.start_on, t.parent_id as parent_task_id,
        t.deleted_at as archived_at, t.completed_at, t.created_at, t.updated_at,
        (select a.user_id from pm_task_assignees a where a.task_id = t.id order by a.added_at, a.user_id limit 1) as assignee_id
      from pm_tasks t join pm_projects p on p.id = t.project_id
      where ($1::uuid is null or t.project_id = $1) and ($2::uuid is null or exists (select 1 from pm_task_assignees a where a.task_id = t.id and a.user_id = $2))
        and ((t.deleted_at is not null) = $3) and (not $4 or t.status <> 'done') and (not $5 or t.parent_id is null) and p.deleted_at is null
      order by t.position, t.due_on nulls last, t.created_at limit 500`,
    [i.project ?? null, i.assignee ?? null, i.archived ?? false, i.open_only ?? false, i.top_only ?? false]),
  }),
  defineOperation({
    name: 'my.work', class: 'read', input: { limit: { type: 'int', min: 1, max: 200 } },
    run: (q, ctx, i) => q(`select t.id, t.project_id, p.name as project_name, p.client_id, t.title, ${TASK_STATUS} as status, ${TASK_PRIORITY} as priority, t.due_on,
        (t.due_on is not null and t.due_on < current_date) as overdue
      from pm_task_assignees a join pm_tasks t on t.id = a.task_id join pm_projects p on p.workspace_id = t.workspace_id and p.id = t.project_id
      where a.user_id = $1 and t.deleted_at is null and p.deleted_at is null and p.archived_at is null and t.status <> 'done'
      order by t.due_on nulls last, case t.priority when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 else 3 end, t.created_at limit $2`, [ctx.userId, i.limit ?? 100]),
  }),
  defineOperation({
    name: 'projects.deadlines', class: 'read', input: { days: { type: 'int', min: 1, max: 90 } },
    run: (q, _c, i) => q(`select * from (
        select 'task' as kind, t.id, t.title as label, t.due_on, t.project_id from pm_tasks t join pm_projects p on p.workspace_id = t.workspace_id and p.id = t.project_id
         where t.deleted_at is null and p.deleted_at is null and p.archived_at is null and t.status <> 'done' and t.due_on between current_date and current_date + $1::int
        union all
        select 'project', p.id, p.name, p.due_on, p.id from pm_projects p where p.deleted_at is null and p.archived_at is null and p.status <> 'complete' and p.due_on between current_date and current_date + $1::int
      ) d order by due_on, label limit 100`, [i.days ?? 14]),
  }),
];
