set check_function_bodies = off;
-- 0013 · Projects data layer (Phase 5, data and API only; the screens come with their own design).
-- Same rules as Funnels (0006) and Clients (0008): one organization per row, the shared permission engine (organization-wide, on one client, or
-- on one project), audited without long text, archive before delete, client_visible only where a client may ever see the record,
-- composite foreign keys so a row can never point into another organization, Data API roles have no access (0010).
--
-- Tables: projects (extended), project_tasks, task_checklist_items, time_entries.
-- Time is taken from the SERVER clock: a running timer starts when the database says so and stops when the database says so.

-- ------------------------------------------------------------------ permissions (app: projects)
insert into public.permissions (key, app_key, description, floor_role, default_role, scopes, sensitive) values
  ('projects.task.view',     'projects', 'View tasks in a project',                                   'viewer', 'admin', '{workspace,client,project}', false),
  ('projects.task.create',   'projects', 'Add tasks to a project',                                    'editor', 'admin', '{workspace,client,project}', false),
  ('projects.task.edit',     'projects', 'Edit, assign, complete or archive tasks',                   'editor', 'admin', '{workspace,client,project}', false),
  ('projects.task.delete',   'projects', 'Permanently delete an ARCHIVED task',                       'admin',  'owner', '{workspace}', true),
  ('projects.time.view',     'projects', 'See time logged on a project',                              'viewer', 'admin', '{workspace,client,project}', false),
  ('projects.time.create',   'projects', 'Log your own time and run your own timer',                  'editor', 'admin', '{workspace,client,project}', false),
  ('projects.time.edit',     'projects', 'Change, archive or log time for other people',              'editor', 'admin', '{workspace,client,project}', true),
  ('projects.time.delete',   'projects', 'Permanently delete an ARCHIVED time entry',                 'admin',  'owner', '{workspace}', true),
  ('projects.record.share',  'projects', 'Make a project or task visible to its client',              'editor', 'admin', '{workspace,client,project}', true);

-- ------------------------------------------------------------------ projects: the fields a project needs to be run
alter table public.projects
  add column description text check (length(description) <= 8000),
  add column status text not null default 'planned' check (status in ('planned', 'active', 'on_hold', 'done')),
  add column owner_id uuid,
  add column start_on date,
  add column due_on date,
  add column created_by uuid,
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now(),
  add constraint projects_name_length check (length(name) between 1 and 200),
  add constraint projects_dates check (due_on is null or start_on is null or due_on >= start_on),
  add constraint projects_owner_fk foreign key (workspace_id, owner_id) references public.memberships (workspace_id, user_id);
create index projects_workspace_client on public.projects (workspace_id, client_id) where archived_at is null;

-- ------------------------------------------------------------------ tasks, checklist items, time entries
create table public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null,
  client_id uuid,                                    -- copied from the project by the guard; callers never set it
  title text not null check (length(title) between 1 and 300),
  notes text check (length(notes) <= 20000),
  status text not null default 'todo' check (status in ('todo', 'doing', 'blocked', 'done')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  assignee_id uuid,
  due_on date,
  position int not null default 0 check (position between 0 and 100000),
  completed_at timestamptz,                           -- set by the database when status becomes done
  client_visible boolean not null default false,
  archived_at timestamptz,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, project_id) references public.projects (workspace_id, id),
  foreign key (workspace_id, assignee_id) references public.memberships (workspace_id, user_id)
);
create index project_tasks_project on public.project_tasks (workspace_id, project_id) where archived_at is null;
create index project_tasks_assignee on public.project_tasks (workspace_id, assignee_id) where archived_at is null and status <> 'done';

create table public.task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id uuid not null,
  project_id uuid,                                    -- copied from the task by the guard
  client_id uuid,
  label text not null check (length(label) between 1 and 500),
  done boolean not null default false,
  position int not null default 0 check (position between 0 and 100000),
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (workspace_id, task_id) references public.project_tasks (workspace_id, id) on delete cascade
);
create index task_checklist_task on public.task_checklist_items (workspace_id, task_id);

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null,
  client_id uuid,
  task_id uuid,
  user_id uuid not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,                               -- null while the timer runs
  note text check (length(note) <= 500),
  billable boolean not null default true,
  archived_at timestamptz,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (ended_at is null or ended_at > started_at),
  check (ended_at is null or ended_at - started_at <= interval '24 hours'),
  foreign key (workspace_id, project_id) references public.projects (workspace_id, id),
  foreign key (workspace_id, task_id) references public.project_tasks (workspace_id, id),
  foreign key (workspace_id, user_id) references public.memberships (workspace_id, user_id)
);
create unique index time_entries_one_running on public.time_entries (workspace_id, user_id) where ended_at is null and archived_at is null;
create index time_entries_project on public.time_entries (workspace_id, project_id, started_at desc);
create index time_entries_user on public.time_entries (workspace_id, user_id, started_at desc);

-- ------------------------------------------------------------------ guards
-- Records do not move; the author is the signed-in person; the client comes from the project, never from the caller.
create or replace function private.projects_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); ov boolean := false;
begin
  if tg_op = 'INSERT' then
    if uid is not null then new.created_by := uid; end if;
  else
    if new.workspace_id is distinct from old.workspace_id or new.client_id is distinct from old.client_id or new.created_by is distinct from old.created_by then
      raise exception 'records do not move' using errcode = 'P0001';
    end if;
    new.updated_at := now();
    ov := old.client_visible;
  end if;
  if new.owner_id is not null and not exists (select 1 from public.memberships m where m.workspace_id = new.workspace_id and m.user_id = new.owner_id and m.kind = 'staff') then
    raise exception 'the owner must be a member of this organization' using errcode = 'P0001';
  end if;
  if new.client_visible and new.client_id is null then raise exception 'only a project that belongs to a client can be shared' using errcode = 'P0001'; end if;
  if uid is not null and new.client_visible is distinct from ov
     and not private.has_permission(new.workspace_id, 'projects.record.share', new.client_id, new.id) then
    raise exception 'not found' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger projects_guard before insert or update on public.projects for each row execute function private.projects_guard();

create or replace function private.project_tasks_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); pc uuid; found boolean; ov boolean := false;
begin
  select true, p.client_id into found, pc from public.projects p where p.workspace_id = new.workspace_id and p.id = new.project_id;
  if found is not true then raise exception 'not found' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    if uid is not null then new.created_by := uid; end if;
    new.client_id := pc;
  else
    ov := old.client_visible;
    if new.workspace_id is distinct from old.workspace_id or new.project_id is distinct from old.project_id or new.client_id is distinct from old.client_id or new.created_by is distinct from old.created_by then
      raise exception 'records do not move' using errcode = 'P0001';
    end if;
    new.updated_at := now();
  end if;
  if new.assignee_id is not null and not exists (select 1 from public.memberships m where m.workspace_id = new.workspace_id and m.user_id = new.assignee_id and m.kind = 'staff') then
    raise exception 'the assignee must be a member of this organization' using errcode = 'P0001';
  end if;
  new.completed_at := case when new.status = 'done' then coalesce(case when tg_op = 'UPDATE' and old.status = 'done' then old.completed_at end, now()) else null end;
  if new.client_visible and pc is null then raise exception 'only a task in a project that belongs to a client can be shared' using errcode = 'P0001'; end if;
  if uid is not null and new.client_visible is distinct from ov
     and not private.has_permission(new.workspace_id, 'projects.record.share', pc, new.project_id) then
    raise exception 'not found' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger project_tasks_guard before insert or update on public.project_tasks for each row execute function private.project_tasks_guard();

create or replace function private.task_checklist_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); tp uuid; tc uuid; found boolean;
begin
  select true, t.project_id, t.client_id into found, tp, tc from public.project_tasks t where t.workspace_id = new.workspace_id and t.id = new.task_id;
  if found is not true then raise exception 'not found' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    if uid is not null then new.created_by := uid; end if;
    new.project_id := tp; new.client_id := tc;
  else
    if new.workspace_id is distinct from old.workspace_id or new.task_id is distinct from old.task_id or new.project_id is distinct from old.project_id or new.created_by is distinct from old.created_by then
      raise exception 'records do not move' using errcode = 'P0001';
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;
create trigger task_checklist_guard before insert or update on public.task_checklist_items for each row execute function private.task_checklist_guard();

-- Time: the server clock decides when a timer starts and stops; nobody logs time for the future; others' time needs projects.time.edit.
create or replace function private.time_entries_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); pc uuid; found boolean; editor boolean; tproj uuid;
begin
  select true, p.client_id into found, pc from public.projects p where p.workspace_id = new.workspace_id and p.id = new.project_id;
  if found is not true then raise exception 'not found' using errcode = '42501'; end if;
  if new.task_id is not null then
    select t.project_id into tproj from public.project_tasks t where t.workspace_id = new.workspace_id and t.id = new.task_id;
    if tproj is distinct from new.project_id then raise exception 'that task belongs to another project' using errcode = 'P0001'; end if;
  end if;
  editor := uid is null or private.has_permission(new.workspace_id, 'projects.time.edit', pc, new.project_id);
  if tg_op = 'INSERT' then
    if uid is not null then
      new.created_by := uid;
      if new.user_id is distinct from uid and not editor then raise exception 'not found' using errcode = '42501'; end if;
    end if;
    new.client_id := pc;
    if new.ended_at is null then new.started_at := now(); end if;      -- a running timer always starts now, by the server clock
  else
    if new.workspace_id is distinct from old.workspace_id or new.project_id is distinct from old.project_id or new.client_id is distinct from old.client_id
       or new.user_id is distinct from old.user_id or new.created_by is distinct from old.created_by then
      raise exception 'records do not move' using errcode = 'P0001';
    end if;
    new.updated_at := now();
    if not editor then
      -- the person may only stop their own running timer (and add a note); the stop time is the server's
      if old.user_id is distinct from uid or old.ended_at is not null or old.archived_at is not null
         or new.started_at is distinct from old.started_at or new.task_id is distinct from old.task_id or new.billable is distinct from old.billable or new.archived_at is distinct from old.archived_at then
        raise exception 'not found' using errcode = '42501';
      end if;
      if new.ended_at is not null then new.ended_at := now(); end if;
    end if;
  end if;
  if new.started_at > now() + interval '1 minute' or (new.ended_at is not null and new.ended_at > now() + interval '1 minute') then
    raise exception 'time cannot be logged for the future' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger time_entries_guard before insert or update on public.time_entries for each row execute function private.time_entries_guard();

-- Archive before delete (generic function from 0008).
create or replace function private.refuse_delete_projects_with_work() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.project_tasks where project_id = old.id) or exists (select 1 from public.time_entries where project_id = old.id) then
    raise exception 'archive this project instead: it still has work' using errcode = 'P0001';
  end if;
  return old;
end $$;
create trigger projects_refuse_delete before delete on public.projects for each row execute function private.refuse_delete_projects_with_work();
create trigger projects_zarchive_before_delete before delete on public.projects for each row execute function private.archive_before_delete();

-- A client that has any project work cannot be deleted either (extends the check from 0008; tasks and time hang off projects, which are already counted).

-- ------------------------------------------------------------------ policies
do $$
declare t text;
begin
  foreach t in array array['project_tasks', 'task_checklist_items', 'time_entries'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('create policy org_scope on public.%I as restrictive for all
      using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id))', t);
  end loop;
end $$;

-- tasks: the project's people see them; a client contact sees only shared, unarchived ones
create policy project_tasks_select on public.project_tasks for select using (
  private.has_permission(workspace_id, 'projects.task.view', client_id, project_id)
  or (client_visible and archived_at is null and client_id is not null and private.client_of(workspace_id, client_id)));
create policy project_tasks_insert on public.project_tasks for insert with check (
  private.has_permission(workspace_id, 'projects.task.create', (select p.client_id from public.projects p where p.workspace_id = project_tasks.workspace_id and p.id = project_tasks.project_id), project_id));
create policy project_tasks_update on public.project_tasks for update
  using (private.has_permission(workspace_id, 'projects.task.edit', client_id, project_id))
  with check (private.has_permission(workspace_id, 'projects.task.edit', client_id, project_id));
create policy project_tasks_delete on public.project_tasks for delete using (private.has_permission(workspace_id, 'projects.task.delete'));
create trigger project_tasks_refuse_delete before delete on public.project_tasks for each row execute function private.archive_before_delete();

-- checklist items are part of the task: they follow the task's permissions; staff only, never shared; removed directly (no history of their own)
create policy task_checklist_select on public.task_checklist_items for select using (private.has_permission(workspace_id, 'projects.task.view', client_id, project_id));
create policy task_checklist_insert on public.task_checklist_items for insert with check (
  private.has_permission(workspace_id, 'projects.task.edit',
    (select t.client_id from public.project_tasks t where t.workspace_id = task_checklist_items.workspace_id and t.id = task_checklist_items.task_id),
    (select t.project_id from public.project_tasks t where t.workspace_id = task_checklist_items.workspace_id and t.id = task_checklist_items.task_id)));
create policy task_checklist_update on public.task_checklist_items for update
  using (private.has_permission(workspace_id, 'projects.task.edit', client_id, project_id)) with check (private.has_permission(workspace_id, 'projects.task.edit', client_id, project_id));
create policy task_checklist_delete on public.task_checklist_items for delete using (private.has_permission(workspace_id, 'projects.task.edit', client_id, project_id));

-- time: your own entries are always yours to see; everyone else's need projects.time.view; staff only, never shared
create policy time_entries_select on public.time_entries for select using (
  user_id = private.current_user_id() or private.has_permission(workspace_id, 'projects.time.view', client_id, project_id));
create policy time_entries_insert on public.time_entries for insert with check (
  private.has_permission(workspace_id, 'projects.time.create', (select p.client_id from public.projects p where p.workspace_id = time_entries.workspace_id and p.id = time_entries.project_id), project_id));
create policy time_entries_update on public.time_entries for update
  using (private.has_permission(workspace_id, 'projects.time.edit', client_id, project_id)
         or (user_id = private.current_user_id() and ended_at is null and archived_at is null and private.has_permission(workspace_id, 'projects.time.create', client_id, project_id)))
  with check (private.has_permission(workspace_id, 'projects.time.edit', client_id, project_id)
         or (user_id = private.current_user_id() and private.has_permission(workspace_id, 'projects.time.create', client_id, project_id)));
create policy time_entries_delete on public.time_entries for delete using (private.has_permission(workspace_id, 'projects.time.delete'));
create trigger time_entries_refuse_delete before delete on public.time_entries for each row execute function private.archive_before_delete();

-- ------------------------------------------------------------------ audit: short labels and flags, never notes or task text beyond the title
create trigger audit_projects after update or delete on public.projects
  for each row execute function private.audit_change('name', 'status', 'owner_id', 'due_on', 'client_visible', 'archived_at');
create trigger audit_project_tasks after insert or update or delete on public.project_tasks
  for each row execute function private.audit_change('project_id', 'title', 'status', 'priority', 'assignee_id', 'due_on', 'client_visible', 'archived_at');
create trigger audit_task_checklist after delete on public.task_checklist_items
  for each row execute function private.audit_change('task_id');
create trigger audit_time_entries after insert or update or delete on public.time_entries
  for each row execute function private.audit_change('project_id', 'task_id', 'user_id', 'started_at', 'ended_at', 'billable', 'archived_at');

-- ------------------------------------------------------------------ starter levels learn the new permissions
create or replace function private.grant_project_child_permissions(ws uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.access_level_permissions (workspace_id, access_level_id, permission_key)
  select l.workspace_id, l.id, k from public.access_levels l
  cross join unnest(case l.name
      when 'Project member'      then array['projects.task.view','projects.task.create','projects.task.edit','projects.time.view','projects.time.create']
      when 'All projects · edit' then array['projects.task.view','projects.task.create','projects.task.edit','projects.time.view','projects.time.create','projects.time.edit']
      when 'All projects · read' then array['projects.task.view','projects.time.view']
      else array[]::text[] end) k
  where l.workspace_id = ws and l.app_key = 'projects' and l.is_template
  on conflict do nothing;
end $$;
create or replace function private.workspace_seed_project_levels() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.grant_project_child_permissions(new.id);
  return new;
end $$;
-- named so it runs after the level seeding trigger (0004) and the clients one (0008): triggers on one event fire in name order
create trigger workspaces_seed_zprojects after insert on public.workspaces
  for each row execute function private.workspace_seed_project_levels();
select private.grant_project_child_permissions(id) from public.workspaces;

-- ------------------------------------------------------------------ page registry and grants
insert into public.app_pages (app_key, page_key, title, kind, permission_key, parent_page_key) values
  ('projects', 'time', 'Time', 'page', 'projects.time.view', 'home')
on conflict do nothing;

revoke all on all functions in schema private from public;
grant select, insert, update, delete on public.project_tasks, public.task_checklist_items, public.time_entries to app_user;
-- no execute grants needed: guards are security definer trigger functions, and the policies call functions app_user already holds
