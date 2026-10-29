set check_function_bodies = off;
-- 0036 · Projects R3, repeatable work: start dates, dependencies ("waiting on"), recurring tasks, project templates and duplicating a project.
-- Same rules as 0013/0035: the task's project decides access, nothing points into another project or organization, Data API roles get nothing.
-- Copying a project (project_duplicate) is security invoker: it reads the source and writes the copy under the caller's own rules.

-- ------------------------------------------------------------------ start dates and repeating
alter table public.project_tasks
  add column start_on date,
  add column repeat text check (repeat in ('daily', 'weekdays', 'weekly', 'biweekly', 'monthly', 'yearly')),
  add constraint project_tasks_dates check (start_on is null or due_on is null or start_on <= due_on),
  add constraint project_tasks_repeat_needs_due check (repeat is null or due_on is not null);

-- the next date of a repeating task (monthly keeps to the month's end: 31 Jan → 28 Feb)
create or replace function private.next_occurrence(d date, rule text) returns date
language sql immutable set search_path = '' as $$
  select case rule
    when 'daily' then d + 1
    when 'weekdays' then d + case extract(isodow from d)::int when 5 then 3 when 6 then 2 else 1 end
    when 'weekly' then d + 7
    when 'biweekly' then d + 14
    when 'monthly' then (d + interval '1 month')::date
    when 'yearly' then (d + interval '1 year')::date
  end
$$;

-- Finishing a repeating task creates the next one (same person, priority, section, tags; dates moved on) and hands the rule to it,
-- so reopening and finishing the old one again creates nothing more.
create or replace function private.project_tasks_repeat() returns trigger
language plpgsql security definer set search_path = '' as $$
declare nd date; nid uuid;
begin
  if new.status = 'done' and old.status is distinct from 'done' and new.repeat is not null and new.due_on is not null and new.archived_at is null then
    nd := private.next_occurrence(new.due_on, new.repeat);
    insert into public.project_tasks (workspace_id, project_id, parent_task_id, section_id, title, notes, priority, assignee_id, start_on, due_on, repeat, position)
    values (new.workspace_id, new.project_id, new.parent_task_id, new.section_id, new.title, new.notes, new.priority, new.assignee_id,
            case when new.start_on is null then null else new.start_on + (nd - new.due_on) end, nd, new.repeat, new.position)
    returning id into nid;
    insert into public.task_tags (workspace_id, task_id, tag_id) select new.workspace_id, nid, tt.tag_id from public.task_tags tt where tt.workspace_id = new.workspace_id and tt.task_id = new.id;
    new.repeat := null;
  end if;
  return new;
end $$;
create trigger project_tasks_repeat before update on public.project_tasks for each row execute function private.project_tasks_repeat();

-- ------------------------------------------------------------------ dependencies: a task waits on other tasks of its project
create table public.task_dependencies (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id uuid not null,                               -- the task that waits
  depends_on_id uuid not null,                         -- the task it waits on
  project_id uuid, client_id uuid,                     -- copied from the task by the guard
  created_by uuid, created_at timestamptz not null default now(),
  primary key (workspace_id, task_id, depends_on_id),
  check (task_id <> depends_on_id),
  foreign key (workspace_id, task_id) references public.project_tasks (workspace_id, id) on delete cascade,
  foreign key (workspace_id, depends_on_id) references public.project_tasks (workspace_id, id) on delete cascade
);
create index task_dependencies_on on public.task_dependencies (workspace_id, depends_on_id);

create or replace function private.task_dependencies_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare tp uuid; tc uuid; dp uuid; found boolean;
begin
  select true, t.project_id, t.client_id into found, tp, tc from public.project_tasks t where t.workspace_id = new.workspace_id and t.id = new.task_id;
  if found is not true then raise exception 'not found' using errcode = '42501'; end if;
  select d.project_id into dp from public.project_tasks d where d.workspace_id = new.workspace_id and d.id = new.depends_on_id;
  if dp is distinct from tp then raise exception 'a task can only wait on a task of its own project' using errcode = 'P0001'; end if;
  -- no loops: the task it waits on must not (directly or indirectly) wait on this task
  if exists (with recursive up(id) as (select new.depends_on_id union select d.depends_on_id from public.task_dependencies d join up on d.task_id = up.id where d.workspace_id = new.workspace_id)
             select 1 from up where id = new.task_id) then
    raise exception 'that would make the tasks wait on each other' using errcode = 'P0001';
  end if;
  new.project_id := tp; new.client_id := tc; new.created_by := private.current_user_id();
  return new;
end $$;
create trigger task_dependencies_guard before insert on public.task_dependencies for each row execute function private.task_dependencies_guard();

-- when the last task something waits on is done, the waiting task's assignee is told it can start
alter table public.activity_events drop constraint activity_events_action_check,
  add constraint activity_events_action_check check (action in ('created', 'status', 'assigned', 'unassigned', 'due', 'renamed', 'priority', 'archived', 'restored', 'commented', 'subtask_added', 'unblocked'));
alter table public.notifications drop constraint notifications_kind_check,
  add constraint notifications_kind_check check (kind in ('assigned', 'mentioned', 'commented', 'completed', 'unblocked'));
create or replace function private.project_tasks_unblock() returns trigger
language plpgsql security definer set search_path = '' as $$
declare w record;
begin
  if new.status = 'done' and old.status is distinct from 'done' then
    for w in select t.id, t.assignee_id from public.task_dependencies d join public.project_tasks t on t.workspace_id = d.workspace_id and t.id = d.task_id
             where d.workspace_id = new.workspace_id and d.depends_on_id = new.id and t.status <> 'done' and t.archived_at is null
               and not exists (select 1 from public.task_dependencies d2 join public.project_tasks b on b.workspace_id = d2.workspace_id and b.id = d2.depends_on_id
                               where d2.workspace_id = d.workspace_id and d2.task_id = d.task_id and b.id <> new.id and b.status <> 'done' and b.archived_at is null) loop
      perform private.collab_activity(new.workspace_id, 'project_task', w.id, 'unblocked', jsonb_build_object('by', new.id));
      perform private.collab_notify(new.workspace_id, w.assignee_id, 'unblocked', 'project_task', w.id);
    end loop;
  end if;
  return new;
end $$;
create trigger project_tasks_zunblock after update of status on public.project_tasks for each row execute function private.project_tasks_unblock();

-- ------------------------------------------------------------------ templates and copying a project
alter table public.projects add column is_template boolean not null default false;

-- Copies a project's sections, open tasks (with subtasks, checklists, tags and the dependencies between copied tasks), as a new project or
-- template. Dates move by the difference between the new start and the source's start. Runs as the caller: the source must be visible to them
-- and every row of the copy passes their own write rules.
create or replace function public.project_duplicate(p_source uuid, p_name text, p_start date default null, p_client uuid default null, p_template boolean default false)
returns uuid
language plpgsql security invoker set search_path = '' as $$
declare ws uuid := private.request_org()::uuid; src record; base date; shift int := 0; nid uuid; secmap jsonb := '{}'; taskmap jsonb := '{}'; r record; x uuid;
begin
  select * into src from public.projects p where p.workspace_id = ws and p.id = p_source;
  if src.id is null then raise exception 'not found' using errcode = '42501'; end if;
  base := coalesce(src.start_on, (select min(coalesce(t.start_on, t.due_on)) from public.project_tasks t where t.project_id = src.id and t.archived_at is null and t.status <> 'done'));
  if p_start is not null and base is not null then shift := p_start - base; end if;
  insert into public.projects (workspace_id, client_id, name, description, status, start_on, due_on, is_template)
  values (ws, p_client, btrim(p_name), src.description, 'planned', coalesce(p_start, src.start_on), src.due_on + shift, coalesce(p_template, false))
  returning id into nid;
  for r in select * from public.project_sections s where s.project_id = src.id order by s.position loop
    insert into public.project_sections (workspace_id, project_id, name, position) values (ws, nid, r.name, r.position) returning id into x;
    secmap := secmap || jsonb_build_object(r.id::text, x);
  end loop;
  -- tasks first, then subtasks (their parent must exist)
  for r in select * from public.project_tasks t where t.project_id = src.id and t.archived_at is null and t.status <> 'done'
           order by (t.parent_task_id is not null), t.position, t.created_at loop
    if r.parent_task_id is not null and not (taskmap ? r.parent_task_id::text) then continue; end if;
    insert into public.project_tasks (workspace_id, project_id, parent_task_id, section_id, title, notes, priority, assignee_id, start_on, due_on, repeat, position)
    values (ws, nid, (taskmap ->> r.parent_task_id::text)::uuid, (secmap ->> r.section_id::text)::uuid, r.title, r.notes, r.priority, r.assignee_id,
            r.start_on + shift, r.due_on + shift, r.repeat, r.position)
    returning id into x;
    taskmap := taskmap || jsonb_build_object(r.id::text, x);
    insert into public.task_checklist_items (workspace_id, task_id, label, position)
      select ws, x, c.label, c.position from public.task_checklist_items c where c.task_id = r.id;
    insert into public.task_tags (workspace_id, task_id, tag_id) select ws, x, tt.tag_id from public.task_tags tt where tt.task_id = r.id;
  end loop;
  insert into public.task_dependencies (workspace_id, task_id, depends_on_id)
    select ws, (taskmap ->> d.task_id::text)::uuid, (taskmap ->> d.depends_on_id::text)::uuid from public.task_dependencies d
    where d.project_id = src.id and taskmap ? d.task_id::text and taskmap ? d.depends_on_id::text;
  return nid;
end $$;

-- ------------------------------------------------------------------ policies and grants
alter table public.task_dependencies enable row level security;
alter table public.task_dependencies force row level security;
create policy org_scope on public.task_dependencies as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
create policy task_dependencies_select on public.task_dependencies for select using (private.has_permission(workspace_id, 'projects.task.view', client_id, project_id));
create policy task_dependencies_insert on public.task_dependencies for insert with check (
  private.has_permission(workspace_id, 'projects.task.edit',
    (select t.client_id from public.project_tasks t where t.workspace_id = task_dependencies.workspace_id and t.id = task_dependencies.task_id),
    (select t.project_id from public.project_tasks t where t.workspace_id = task_dependencies.workspace_id and t.id = task_dependencies.task_id)));
create policy task_dependencies_delete on public.task_dependencies for delete using (private.has_permission(workspace_id, 'projects.task.edit', client_id, project_id));

create trigger audit_task_dependencies after insert or delete on public.task_dependencies for each row execute function private.audit_change('task_id', 'depends_on_id');

revoke all on all functions in schema private from public;
revoke all on function public.project_duplicate(uuid, text, date, uuid, boolean) from public;
grant execute on function public.project_duplicate(uuid, text, date, uuid, boolean) to app_user;
grant select, insert, delete on public.task_dependencies to app_user;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all tables in schema public from %I', r);
      execute format('revoke all on all functions in schema public from %I', r);
      execute format('revoke all on all tables in schema private from %I', r);
      execute format('revoke all on all functions in schema private from %I', r);
      execute format('revoke all on all sequences in schema public from %I', r);
    end if;
  end loop;
end $$;
