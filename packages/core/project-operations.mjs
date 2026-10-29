// Projects API operations (migration 0013): projects, tasks, checklist items, time, and "my work".
// Same conventions as the other operation files: column names are constants (never from the request), permissions are decided by row
// policies and triggers in the database, and a refusal reads as "not found". Data and API only: the screens come with their own design.
import { defineOperation } from './define.mjs';

const T = (max = 8000) => ({ type: 'text', min: 0, max });
const id = { id: { type: 'uuid', required: true } };
const like = (q) => `%${String(q).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
const PROJECT_STATUS = ['planned', 'active', 'on_hold', 'done'];
const TASK_STATUS = ['todo', 'doing', 'blocked', 'done'];

// ------------------------------------------------------------------ projects
const PROJECT = { name: { type: 'text', required: true, max: 200 }, description: T(8000), status: { type: 'enum', values: PROJECT_STATUS }, owner: { type: 'uuid' }, start_on: { type: 'date' }, due_on: { type: 'date' } };
const PCOL = { name: 'name', description: 'description', status: 'status', owner: 'owner_id', start_on: 'start_on', due_on: 'due_on' };
const PSELECT = `select p.id, p.client_id, p.name, p.description, p.status, p.owner_id, p.start_on, p.due_on, p.client_visible, p.archived_at, p.is_template, p.created_at, p.updated_at,
    (select count(*)::int from project_tasks t where t.project_id = p.id and t.archived_at is null) as tasks_total,
    (select count(*)::int from project_tasks t where t.project_id = p.id and t.archived_at is null and t.status = 'done') as tasks_done
  from projects p`;

const projectOps = [
  defineOperation({
    name: 'projects.list', class: 'read',
    // scope: 'client' = projects tied to a client, 'internal' = the organization's own projects (no client). Never mixed unless 'all' is asked for.
    input: { client: { type: 'uuid' }, scope: { type: 'enum', values: ['all', 'client', 'internal'] }, status: { type: 'enum', values: PROJECT_STATUS }, archived: { type: 'bool' }, q: { type: 'text', max: 100 }, templates: { type: 'bool' } },
    run: (q, _c, i) => q(`${PSELECT} where ($1::uuid is null or p.client_id = $1) and ($2::text is null or p.status = $2) and ((p.archived_at is not null) = $3) and p.is_template = $6
      and ($4::text is null or p.name ilike $4) and ($5::text is null or $5 = 'all' or ($5 = 'client' and p.client_id is not null) or ($5 = 'internal' and p.client_id is null)) order by p.name limit 200`,
    [i.client ?? null, i.status ?? null, i.archived ?? false, i.q ? like(i.q) : null, i.scope ?? null, i.templates ?? false]),
  }),
  defineOperation({ name: 'projects.get', class: 'read', single: true, input: id, run: (q, _c, i) => q(`${PSELECT} where p.id = $1`, [i.id]) }),
  defineOperation({
    name: 'projects.create', class: 'write', single: true, input: { ...PROJECT, client: { type: 'uuid' } },
    run: async (q, ctx, i) => {
      const used = Object.keys(PCOL).filter((k) => i[k] !== undefined);
      const [r] = await q(`insert into projects (workspace_id, client_id${used.map((k) => `, ${PCOL[k]}`).join('')}) values ($1, $2${used.map((_, n) => `, $${n + 3}`).join('')}) returning id`, [ctx.orgId, i.client ?? null, ...used.map((k) => i[k])]);
      return q(`${PSELECT} where p.id = $1`, [r.id]);
    },
  }),
  defineOperation({
    name: 'projects.update', class: 'write', single: true, input: { ...id, ...Object.fromEntries(Object.entries(PROJECT).map(([k, f]) => [k, { ...f, required: false }])) },
    run: async (q, _c, i) => {
      const used = Object.keys(PCOL).filter((k) => i[k] !== undefined);
      if (used.length && !(await q(`update projects set ${used.map((k, n) => `${PCOL[k]} = $${n + 2}`).join(', ')} where id = $1 returning id`, [i.id, ...used.map((k) => i[k])])).length) return [];
      return q(`${PSELECT} where p.id = $1`, [i.id]);
    },
  }),
  defineOperation({ name: 'projects.archive', class: 'write', single: true, input: id, run: (q, _c, i) => q('update projects set archived_at = now() where id = $1 and archived_at is null returning id, archived_at', [i.id]) }),
  defineOperation({ name: 'projects.restore', class: 'write', single: true, input: id, run: (q, _c, i) => q('update projects set archived_at = null where id = $1 and archived_at is not null returning id, archived_at', [i.id]) }),
  defineOperation({ name: 'projects.share', class: 'write', single: true, input: { ...id, visible: { type: 'bool', required: true } }, run: (q, _c, i) => q('update projects set client_visible = $2 where id = $1 returning id, client_visible', [i.id, i.visible]) }),
  defineOperation({ name: 'projects.delete', class: 'write', single: true, input: id, run: (q, _c, i) => q('delete from projects where id = $1 returning id', [i.id]) }),
  defineOperation({
    name: 'projects.overview', class: 'read',
    run: (q) => q(`select status, count(*)::int as n from projects where archived_at is null group by status order by status`),
  }),
];

// ------------------------------------------------------------------ smart search (Projects header, Ctrl/Cmd-K): projects, tasks and project documents in one list
// Active records only unless `archived` is true (archived projects, and everything inside them, are found only when asked for). Row policies decide what is visible.
const searchOps = [
  defineOperation({
    name: 'projects.search', class: 'read',
    input: { q: { type: 'text', max: 100 }, kind: { type: 'enum', values: ['all', 'projects', 'tasks', 'docs'] }, archived: { type: 'bool' }, mine: { type: 'bool' }, overdue: { type: 'bool' } },
    run: (q, ctx, i) => q(`select * from (
        select 'project' as kind, p.id, p.id as project_id, p.name as label, p.status as sub, p.client_id, (p.archived_at is not null) as archived, p.updated_at, null::text as mime_type
          from projects p where $2::text in ('all', 'projects') and ((p.archived_at is not null) = $3) and ($1::text is null or p.name ilike $1) and not $4 and not $5
        union all
        select 'task', t.id, t.project_id, t.title, p.name, t.client_id, (t.archived_at is not null or p.archived_at is not null), t.updated_at, null::text
          from project_tasks t join projects p on p.workspace_id = t.workspace_id and p.id = t.project_id
         where $2::text in ('all', 'tasks') and (($3 and (t.archived_at is not null or p.archived_at is not null)) or (not $3 and t.archived_at is null and p.archived_at is null))
           and ($1::text is null or t.title ilike $1) and (not $4 or t.assignee_id = $6) and (not $5 or (t.due_on < current_date and t.status <> 'done'))
        union all
        select 'doc', f.id, f.project_id, f.name, p.name, f.client_id, (f.archived_at is not null or p.archived_at is not null), f.updated_at, f.mime_type
          from files f join projects p on p.workspace_id = f.workspace_id and p.id = f.project_id
         where $2::text in ('all', 'docs') and f.kind = 'document' and (($3 and (f.archived_at is not null or p.archived_at is not null)) or (not $3 and f.archived_at is null and p.archived_at is null))
           and ($1::text is null or f.name ilike $1) and not $4 and not $5
      ) r order by case kind when 'project' then 0 when 'task' then 1 else 2 end, updated_at desc limit 50`,
    [i.q ? like(i.q) : null, i.kind ?? 'all', i.archived ?? false, i.mine ?? false, i.overdue ?? false, ctx.userId]),
  }),
];

// People who can be given work: the active staff of the organization (names from their profiles). Only for people who may see projects.
const peopleOps = [
  defineOperation({
    name: 'projects.people', class: 'read',
    run: (q, ctx) => q(`select m.user_id, coalesce(nullif(pr.display_name, ''), 'Member ' || left(m.user_id::text, 4)) as display_name, (m.user_id = $1) as is_you
      from memberships m left join profiles pr on pr.id = m.user_id where m.kind = 'staff' and m.status = 'active' order by (m.user_id = $1) desc, lower(coalesce(pr.display_name, '')) limit 200`, [ctx.userId]),
  }),
];

// ------------------------------------------------------------------ tasks
const TASK = {
  title: { type: 'text', required: true, max: 300 }, notes: T(20000), status: { type: 'enum', values: TASK_STATUS }, priority: { type: 'enum', values: ['low', 'normal', 'high', 'urgent'] },
  assignee: { type: 'uuid' }, due_on: { type: 'date' }, position: { type: 'int', min: 0, max: 100000 },
  parent: { type: 'uuid' },                          // a subtask: the task it belongs to (same project, one level; the database checks)
  section: { type: 'uuid' },                         // a section of the same project (the foreign key includes the project)
  start_on: { type: 'date' }, repeat: { type: 'enum', values: ['daily', 'weekdays', 'weekly', 'biweekly', 'monthly', 'yearly'] },
};
const TCOL = { title: 'title', notes: 'notes', status: 'status', priority: 'priority', assignee: 'assignee_id', due_on: 'due_on', position: 'position', parent: 'parent_task_id', section: 'section_id', start_on: 'start_on', repeat: 'repeat' };
const TSELECT = `select t.id, t.project_id, t.client_id, t.parent_task_id, t.section_id, t.start_on, t.repeat, t.title, t.notes, t.status, t.priority, t.assignee_id, t.due_on, t.position, t.completed_at, t.client_visible, t.archived_at, t.created_at, t.updated_at,
    (select count(*)::int from project_tasks s where s.parent_task_id = t.id and s.archived_at is null) as subtasks_total,
    (select count(*)::int from project_tasks s where s.parent_task_id = t.id and s.archived_at is null and s.status = 'done') as subtasks_done,
    coalesce((select json_agg(json_build_object('id', g.id, 'name', g.name, 'color', g.color) order by lower(g.name)) from task_tags tt join project_tags g on g.workspace_id = tt.workspace_id and g.id = tt.tag_id where tt.task_id = t.id), '[]') as tags,
    (select count(*)::int from task_files tf where tf.task_id = t.id) as files_total,
    (select count(*)::int from task_dependencies d join project_tasks b on b.id = d.depends_on_id where d.task_id = t.id and b.status <> 'done' and b.archived_at is null) as waiting_on,
    (select count(*)::int from task_checklist_items c where c.task_id = t.id) as checklist_total,
    (select count(*)::int from task_checklist_items c where c.task_id = t.id and c.done) as checklist_done
  from project_tasks t`;

const taskOps = [
  defineOperation({
    name: 'tasks.list', class: 'read',
    input: { project: { type: 'uuid' }, assignee: { type: 'uuid' }, status: { type: 'enum', values: TASK_STATUS }, archived: { type: 'bool' }, open_only: { type: 'bool' }, parent: { type: 'uuid' }, top_only: { type: 'bool' } },
    run: (q, _c, i) => q(`${TSELECT} where ($1::uuid is null or t.project_id = $1) and ($2::uuid is null or t.assignee_id = $2) and ($3::text is null or t.status = $3)
      and ((t.archived_at is not null) = $4) and (not $5 or t.status <> 'done') and ($6::uuid is null or t.parent_task_id = $6) and (not $7 or t.parent_task_id is null)
      order by t.position, t.due_on nulls last, t.created_at limit 500`,
    [i.project ?? null, i.assignee ?? null, i.status ?? null, i.archived ?? false, i.open_only ?? false, i.parent ?? null, i.top_only ?? false]),
  }),
  defineOperation({ name: 'tasks.get', class: 'read', single: true, input: id, run: (q, _c, i) => q(`${TSELECT} where t.id = $1`, [i.id]) }),
  defineOperation({
    name: 'tasks.create', class: 'write', single: true, input: { project: { type: 'uuid', required: true }, ...TASK },
    run: async (q, ctx, i) => {
      const used = Object.keys(TCOL).filter((k) => i[k] !== undefined);
      const [r] = await q(`insert into project_tasks (workspace_id, project_id${used.map((k) => `, ${TCOL[k]}`).join('')}) values ($1, $2${used.map((_, n) => `, $${n + 3}`).join('')}) returning id`, [ctx.orgId, i.project, ...used.map((k) => i[k])]);
      return q(`${TSELECT} where t.id = $1`, [r.id]);
    },
  }),
  defineOperation({
    name: 'tasks.update', class: 'write', single: true, input: { ...id, ...Object.fromEntries(Object.entries(TASK).map(([k, f]) => [k, { ...f, required: false }])), clear_assignee: { type: 'bool' }, clear_due: { type: 'bool' }, clear_section: { type: 'bool' }, clear_start: { type: 'bool' }, clear_repeat: { type: 'bool' } },
    run: async (q, _c, i) => {
      const used = Object.keys(TCOL).filter((k) => i[k] !== undefined);
      const sets = used.map((k, n) => `${TCOL[k]} = $${n + 2}`);
      if (i.clear_assignee) sets.push('assignee_id = null');
      if (i.clear_due) sets.push('due_on = null');
      if (i.clear_section) sets.push('section_id = null');
      if (i.clear_start) sets.push('start_on = null');
      if (i.clear_repeat) sets.push('repeat = null');
      if (sets.length && !(await q(`update project_tasks set ${sets.join(', ')} where id = $1 returning id`, [i.id, ...used.map((k) => i[k])])).length) return [];
      return q(`${TSELECT} where t.id = $1`, [i.id]);
    },
  }),
  defineOperation({ name: 'tasks.archive', class: 'write', single: true, input: id, run: (q, _c, i) => q('update project_tasks set archived_at = now() where id = $1 and archived_at is null returning id, archived_at', [i.id]) }),
  defineOperation({ name: 'tasks.restore', class: 'write', single: true, input: id, run: (q, _c, i) => q('update project_tasks set archived_at = null where id = $1 and archived_at is not null returning id, archived_at', [i.id]) }),
  defineOperation({ name: 'tasks.share', class: 'write', single: true, input: { ...id, visible: { type: 'bool', required: true } }, run: (q, _c, i) => q('update project_tasks set client_visible = $2 where id = $1 returning id, client_visible', [i.id, i.visible]) }),
  defineOperation({ name: 'tasks.delete', class: 'write', single: true, input: id, run: (q, _c, i) => q('delete from project_tasks where id = $1 returning id', [i.id]) }),
  // "My work": what is assigned to the caller, across every project they may see, in one query. The row policies decide what is visible.
  defineOperation({
    name: 'my.work', class: 'read', input: { limit: { type: 'int', min: 1, max: 200 } },
    run: (q, ctx, i) => q(`select t.id, t.project_id, p.name as project_name, t.client_id, t.title, t.status, t.priority, t.due_on,
        (t.due_on is not null and t.due_on < current_date) as overdue
      from project_tasks t join projects p on p.workspace_id = t.workspace_id and p.id = t.project_id
      where t.assignee_id = $1 and t.archived_at is null and p.archived_at is null and t.status <> 'done'
      order by t.due_on nulls last, case t.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end, t.created_at limit $2`, [ctx.userId, i.limit ?? 100]),
  }),
  // Deadlines in the next days across the projects the caller may see: tasks assigned to anyone, and projects with a due date.
  defineOperation({
    name: 'projects.deadlines', class: 'read', input: { days: { type: 'int', min: 1, max: 90 } },
    run: (q, _c, i) => q(`select * from (
        select 'task' as kind, t.id, t.title as label, t.due_on, t.project_id from project_tasks t join projects p on p.workspace_id = t.workspace_id and p.id = t.project_id
         where t.archived_at is null and p.archived_at is null and t.status <> 'done' and t.due_on between current_date and current_date + $1::int
        union all
        select 'project', p.id, p.name, p.due_on, p.id from projects p where p.archived_at is null and p.status <> 'done' and p.due_on between current_date and current_date + $1::int
      ) d order by due_on, label limit 100`, [i.days ?? 14]),
  }),
];

// ------------------------------------------------------------------ checklist items (part of the task: same permissions, removed directly)
const checklistOps = [
  defineOperation({ name: 'checklist.list', class: 'read', input: { task: { type: 'uuid', required: true } }, run: (q, _c, i) => q('select id, task_id, label, done, position from task_checklist_items where task_id = $1 order by position, created_at', [i.task]) }),
  defineOperation({
    name: 'checklist.add', class: 'write', single: true, input: { task: { type: 'uuid', required: true }, label: { type: 'text', required: true, min: 1, max: 500 }, position: { type: 'int', min: 0, max: 100000 } },
    run: (q, ctx, i) => q('insert into task_checklist_items (workspace_id, task_id, label, position) values ($1, $2, $3, $4) returning id, task_id, label, done, position', [ctx.orgId, i.task, i.label, i.position ?? 0]),
  }),
  defineOperation({
    name: 'checklist.update', class: 'write', single: true, input: { ...id, label: { type: 'text', min: 1, max: 500 }, done: { type: 'bool' }, position: { type: 'int', min: 0, max: 100000 } },
    run: (q, _c, i) => q('update task_checklist_items set label = coalesce($2, label), done = coalesce($3, done), position = coalesce($4, position) where id = $1 returning id, task_id, label, done, position', [i.id, i.label ?? null, i.done ?? null, i.position ?? null]),
  }),
  defineOperation({ name: 'checklist.delete', class: 'write', single: true, input: id, run: (q, _c, i) => q('delete from task_checklist_items where id = $1 returning id', [i.id]) }),
];

// ------------------------------------------------------------------ time (the database clock starts and stops timers)
const ESELECT = `select e.id, e.project_id, e.client_id, e.task_id, e.user_id, e.started_at, e.ended_at, e.note, e.billable, e.archived_at,
    case when e.ended_at is null then null else extract(epoch from (e.ended_at - e.started_at))::int end as seconds from time_entries e`;
const timeOps = [
  defineOperation({
    name: 'time.list', class: 'read',
    input: { project: { type: 'uuid' }, task: { type: 'uuid' }, user: { type: 'uuid' }, from: { type: 'date' }, to: { type: 'date' }, archived: { type: 'bool' } },
    run: (q, _c, i) => q(`${ESELECT} where ($1::uuid is null or e.project_id = $1) and ($2::uuid is null or e.task_id = $2) and ($3::uuid is null or e.user_id = $3)
      and ($4::date is null or e.started_at >= $4::date) and ($5::date is null or e.started_at < $5::date + 1) and ((e.archived_at is not null) = $6)
      order by e.started_at desc limit 500`, [i.project ?? null, i.task ?? null, i.user ?? null, i.from ?? null, i.to ?? null, i.archived ?? false]),
  }),
  defineOperation({ name: 'time.running', class: 'read', run: (q, ctx) => q(`${ESELECT} where e.user_id = $1 and e.ended_at is null and e.archived_at is null`, [ctx.userId]) }),
  defineOperation({
    name: 'time.start', class: 'write', single: true, input: { project: { type: 'uuid', required: true }, task: { type: 'uuid' }, note: T(500), billable: { type: 'bool' } },
    run: (q, ctx, i) => q('insert into time_entries (workspace_id, project_id, task_id, user_id, note, billable) values ($1,$2,$3,$4,$5,$6) returning id, project_id, task_id, user_id, started_at, ended_at, note, billable',
      [ctx.orgId, i.project, i.task ?? null, ctx.userId, i.note ?? null, i.billable ?? true]),
  }),
  defineOperation({
    name: 'time.stop', class: 'write', single: true, input: { note: T(500) },
    run: (q, ctx, i) => q(`update time_entries set ended_at = now(), note = coalesce($2, note) where user_id = $1 and ended_at is null and archived_at is null
      returning id, project_id, task_id, user_id, started_at, ended_at, note, billable`, [ctx.userId, i.note ?? null]),
  }),
  defineOperation({
    // a finished entry typed in by hand (for yourself; for someone else it needs projects.time.edit)
    name: 'time.log', class: 'write', single: true,
    input: { project: { type: 'uuid', required: true }, task: { type: 'uuid' }, user: { type: 'uuid' }, started_at: { type: 'timestamp', required: true }, ended_at: { type: 'timestamp', required: true }, note: T(500), billable: { type: 'bool' } },
    run: (q, ctx, i) => q('insert into time_entries (workspace_id, project_id, task_id, user_id, started_at, ended_at, note, billable) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id, project_id, task_id, user_id, started_at, ended_at, note, billable',
      [ctx.orgId, i.project, i.task ?? null, i.user ?? ctx.userId, i.started_at, i.ended_at, i.note ?? null, i.billable ?? true]),
  }),
  defineOperation({
    name: 'time.update', class: 'write', single: true,
    input: { ...id, started_at: { type: 'timestamp' }, ended_at: { type: 'timestamp' }, note: T(500), billable: { type: 'bool' }, task: { type: 'uuid' } },
    run: (q, _c, i) => q(`update time_entries set started_at = coalesce($2, started_at), ended_at = coalesce($3, ended_at), note = coalesce($4, note), billable = coalesce($5, billable), task_id = coalesce($6, task_id)
      where id = $1 returning id, project_id, task_id, user_id, started_at, ended_at, note, billable`, [i.id, i.started_at ?? null, i.ended_at ?? null, i.note ?? null, i.billable ?? null, i.task ?? null]),
  }),
  defineOperation({ name: 'time.archive', class: 'write', single: true, input: id, run: (q, _c, i) => q('update time_entries set archived_at = now() where id = $1 and archived_at is null returning id, archived_at', [i.id]) }),
  defineOperation({ name: 'time.restore', class: 'write', single: true, input: id, run: (q, _c, i) => q('update time_entries set archived_at = null where id = $1 and archived_at is not null returning id, archived_at', [i.id]) }),
  defineOperation({ name: 'time.delete', class: 'write', single: true, input: id, run: (q, _c, i) => q('delete from time_entries where id = $1 returning id', [i.id]) }),
  defineOperation({
    // hours per person and project for a period (what the policies let the caller see)
    name: 'time.summary', class: 'read', input: { project: { type: 'uuid' }, from: { type: 'date', required: true }, to: { type: 'date', required: true } },
    run: (q, _c, i) => q(`select e.project_id, e.user_id, sum(extract(epoch from (e.ended_at - e.started_at)))::int as seconds,
        sum(case when e.billable then extract(epoch from (e.ended_at - e.started_at)) else 0 end)::int as billable_seconds
      from time_entries e where e.ended_at is not null and e.archived_at is null and ($1::uuid is null or e.project_id = $1)
        and e.started_at >= $2::date and e.started_at < $3::date + 1 group by e.project_id, e.user_id order by seconds desc`, [i.project ?? null, i.from, i.to]),
  }),
];


// ------------------------------------------------------------------ R2: sections, tags, bulk changes, files on a task (migration 0035)
const organizeOps = [
  defineOperation({ name: 'sections.list', class: 'read', input: { project: { type: 'uuid', required: true } },
    run: (q, _c, i) => q('select id, project_id, name, position from project_sections where project_id = $1 order by position, created_at', [i.project]) }),
  defineOperation({ name: 'sections.create', class: 'write', single: true, input: { project: { type: 'uuid', required: true }, name: { type: 'text', required: true, max: 100 } },
    run: (q, ctx, i) => q(`insert into project_sections (workspace_id, project_id, name, position)
      values ($1, $2, $3, (select coalesce(max(position) + 1, 0) from project_sections where project_id = $2)) returning id, project_id, name, position`, [ctx.orgId, i.project, i.name]) }),
  defineOperation({ name: 'sections.update', class: 'write', single: true, input: { ...id, name: { type: 'text', max: 100 }, position: { type: 'int', min: 0, max: 100000 } },
    run: (q, _c, i) => q('update project_sections set name = coalesce($2, name), position = coalesce($3, position) where id = $1 returning id, project_id, name, position', [i.id, i.name ?? null, i.position ?? null]) }),
  defineOperation({ name: 'sections.delete', class: 'write', single: true, input: id, run: (q, _c, i) => q('delete from project_sections where id = $1 returning id', [i.id]) }),
  defineOperation({ name: 'tags.list', class: 'read', run: (q) => q('select id, name, color from project_tags order by lower(name) limit 500') }),
  defineOperation({ name: 'tasks.tags.add', class: 'write', single: true, input: { task: { type: 'uuid', required: true }, name: { type: 'text', required: true, max: 40 } },
    run: (q, _c, i) => q('select id, name, color from task_tag_add($1, $2)', [i.task, i.name]) }),
  defineOperation({ name: 'tasks.tags.remove', class: 'write', single: true, input: { task: { type: 'uuid', required: true }, tag: { type: 'uuid', required: true } },
    run: (q, _c, i) => q('delete from task_tags where task_id = $1 and tag_id = $2 returning tag_id', [i.task, i.tag]) }),
  defineOperation({
    // many tasks at once: row policies skip the ones the person may not edit; the answer is how many changed
    name: 'tasks.bulk', class: 'write', single: true,
    input: { ids: { type: 'list', items: 'uuid', max: 200, required: true }, status: { type: 'enum', values: TASK_STATUS }, priority: { type: 'enum', values: ['low', 'normal', 'high', 'urgent'] },
      assignee: { type: 'uuid' }, clear_assignee: { type: 'bool' }, due_on: { type: 'date' }, clear_due: { type: 'bool' }, section: { type: 'uuid' }, clear_section: { type: 'bool' }, archive: { type: 'bool' } },
    run: (q, _c, i) => {
      const sets = []; const args = [i.ids];
      const put = (col, v) => { args.push(v); sets.push(`${col} = $${args.length}`); };
      if (i.status) put('status', i.status);
      if (i.priority) put('priority', i.priority);
      if (i.assignee) put('assignee_id', i.assignee); else if (i.clear_assignee) sets.push('assignee_id = null');
      if (i.due_on) put('due_on', i.due_on); else if (i.clear_due) sets.push('due_on = null');
      if (i.section) put('section_id', i.section); else if (i.clear_section) sets.push('section_id = null');
      if (i.archive) sets.push('archived_at = now()');
      if (!sets.length) return [{ n: 0 }];
      return q(`with done as (update project_tasks set ${sets.join(', ')} where id = any ($1::uuid[])${i.archive ? ' and archived_at is null' : ''} returning 1) select count(*)::int as n from done`, args);
    },
  }),
  // ---- R3 (migration 0036): what a task waits on, and copying a project (template or duplicate)
  defineOperation({ name: 'tasks.deps.list', class: 'read', input: { task: { type: 'uuid', required: true } },
    run: (q, _c, i) => q(`select b.id, b.title, b.status, b.due_on, b.assignee_id from task_dependencies d join project_tasks b on b.workspace_id = d.workspace_id and b.id = d.depends_on_id
      where d.task_id = $1 order by b.due_on nulls last, b.title`, [i.task]) }),
  defineOperation({ name: 'tasks.deps.add', class: 'write', single: true, input: { task: { type: 'uuid', required: true }, depends_on: { type: 'uuid', required: true } },
    run: (q, ctx, i) => q('insert into task_dependencies (workspace_id, task_id, depends_on_id) values ($1, $2, $3) on conflict do nothing returning depends_on_id', [ctx.orgId, i.task, i.depends_on]) }),
  defineOperation({ name: 'tasks.deps.remove', class: 'write', single: true, input: { task: { type: 'uuid', required: true }, depends_on: { type: 'uuid', required: true } },
    run: (q, _c, i) => q('delete from task_dependencies where task_id = $1 and depends_on_id = $2 returning depends_on_id', [i.task, i.depends_on]) }),
  defineOperation({
    name: 'projects.duplicate', class: 'write', single: true,
    input: { ...id, name: { type: 'text', required: true, max: 200 }, start_on: { type: 'date' }, client: { type: 'uuid' }, template: { type: 'bool' } },
    run: async (q, _c, i) => { const [r] = await q('select project_duplicate($1, $2, $3, $4, $5) as id', [i.id, i.name, i.start_on ?? null, i.client ?? null, i.template ?? false]); return q(`${PSELECT} where p.id = $1`, [r.id]); },
  }),
  defineOperation({ name: 'tasks.files.list', class: 'read', input: { task: { type: 'uuid', required: true } },
    run: (q, _c, i) => q(`select f.id, f.name, f.kind, f.mime_type, f.size_bytes, f.updated_at, tf.created_at as attached_at
      from task_files tf join files f on f.workspace_id = tf.workspace_id and f.id = tf.file_id where tf.task_id = $1 and f.archived_at is null order by tf.created_at`, [i.task]) }),
  defineOperation({ name: 'tasks.files.attach', class: 'write', single: true, input: { task: { type: 'uuid', required: true }, file: { type: 'uuid', required: true } },
    run: (q, ctx, i) => q('insert into task_files (workspace_id, task_id, file_id) values ($1, $2, $3) on conflict do nothing returning file_id', [ctx.orgId, i.task, i.file]) }),
  defineOperation({ name: 'tasks.files.detach', class: 'write', single: true, input: { task: { type: 'uuid', required: true }, file: { type: 'uuid', required: true } },
    run: (q, _c, i) => q('delete from task_files where task_id = $1 and file_id = $2 returning file_id', [i.task, i.file]) }),
];

export const projectsOperations = [...projectOps, ...searchOps, ...peopleOps, ...taskOps, ...checklistOps, ...timeOps, ...organizeOps];
