-- 0059 · P02 Tasks (V8 01_APPLICATIONS/04_TASKS): personal and team lists, folders, blocks, tasks with sub-tasks and several assignees,
-- list/folder access, private tasks, a timer per task. Additive and reversible (rollback: migrations/rollback/0059_tasks.down.sql).
--
-- Who sees what (decided here):
--   • personal list: its owner only (teammates with "See teammates' tasks" read the non-private tasks through tasks_person_items()).
--   • team list: its owner, people given access on the list or on its folder (edit|view), and owners/admins of the organization.
--   • a task assigned to you is visible to you (and you can tick it) even in a list you cannot open.
--   • a private task (personal lists only): its creator only — others get a count from tasks_private_count().
--   • every table is organization-scoped; Layer2Funnels and Aurj never mix.

insert into public.apps (key, name, scope, standalone_capable, sort_order, lifecycle) values ('tasks', 'Tasks', 'shared', true, 25, 'active')
on conflict (key) do nothing;
insert into public.workspace_apps (workspace_id, app_key, enabled) select w.id, 'tasks', true from public.workspaces w
on conflict (workspace_id, app_key) do nothing;
insert into public.permissions (key, app_key, description, floor_role, default_role, scopes, sensitive) values
  ('tasks.team.create',    'tasks', 'Create team lists and folders',                 'editor', 'editor', '{workspace}', false),
  ('tasks.teammates.view', 'tasks', 'See teammates’ tasks (their lists and open work)', 'viewer', 'admin',  '{workspace}', false)
on conflict (key) do nothing;

create table if not exists public.task_folders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null,
  space text not null check (space in ('personal', 'team')),
  name text not null check (length(btrim(name)) between 1 and 120),
  icon text not null default 'folder' check (length(icon) <= 40),
  colour text not null default '#0EA5A4' check (colour ~ '^#[0-9A-Fa-f]{6}$'),
  position double precision not null default 0,
  archived_at timestamptz, created_at timestamptz not null default now(),
  unique (workspace_id, id)
);
create table if not exists public.task_lists (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  folder_id uuid,
  owner_id uuid not null,
  space text not null check (space in ('personal', 'team')),
  name text not null check (length(btrim(name)) between 1 and 120),
  icon text not null default 'tasks' check (length(icon) <= 40),
  colour text not null default '#0EA5A4' check (colour ~ '^#[0-9A-Fa-f]{6}$'),
  is_default boolean not null default false,
  position double precision not null default 0,
  archived_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, folder_id) references public.task_folders (workspace_id, id) on delete set null (folder_id),
  check (not is_default or space = 'personal')
);
create unique index if not exists task_lists_one_default on public.task_lists (workspace_id, owner_id) where is_default;
create table if not exists public.task_list_access (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  list_id uuid references public.task_lists(id) on delete cascade,
  folder_id uuid references public.task_folders(id) on delete cascade,
  user_id uuid not null,
  level text not null check (level in ('edit', 'view')),
  created_at timestamptz not null default now(),
  check ((list_id is null) <> (folder_id is null))
);
create unique index if not exists task_list_access_list on public.task_list_access (list_id, user_id) where list_id is not null;
create unique index if not exists task_list_access_folder on public.task_list_access (folder_id, user_id) where folder_id is not null;
create table if not exists public.task_blocks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  list_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 120),
  position double precision not null default 0,
  collapsed boolean not null default false,
  unique (workspace_id, id),
  foreign key (workspace_id, list_id) references public.task_lists (workspace_id, id) on delete cascade
);
create table if not exists public.task_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  list_id uuid,                      -- null = Inbox (unsorted capture of its creator)
  block_id uuid,
  parent_id uuid,
  position double precision not null default 0,
  title text not null check (length(btrim(title)) between 1 and 500),
  done_at timestamptz,
  due_date date, due_time time,
  priority text not null default 'normal' check (priority in ('normal', 'high')),
  private boolean not null default false,
  notes text not null default '' check (length(notes) <= 20000),
  source_app text check (length(source_app) <= 40), source_ref text check (length(source_ref) <= 300),
  project_task_id uuid,              -- set by "Send to a project": the Projects task it became
  project_id uuid,                   -- …and its project (for the link back)
  created_by uuid not null default private.current_user_id(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, list_id) references public.task_lists (workspace_id, id) on delete cascade,
  foreign key (workspace_id, block_id) references public.task_blocks (workspace_id, id) on delete set null (block_id),
  foreign key (workspace_id, parent_id) references public.task_items (workspace_id, id) on delete cascade,
  check (due_time is null or due_date is not null)
);
create index if not exists task_items_list on public.task_items (list_id, block_id, position);
create index if not exists task_items_due on public.task_items (workspace_id, due_date) where done_at is null;
create table if not exists public.task_assignees (
  workspace_id uuid not null,
  item_id uuid not null,
  user_id uuid not null,
  assigned_by uuid default private.current_user_id(),
  added_at timestamptz not null default now(),
  primary key (item_id, user_id),
  foreign key (workspace_id, item_id) references public.task_items (workspace_id, id) on delete cascade
);
create index if not exists task_assignees_user on public.task_assignees (workspace_id, user_id);
create table if not exists public.task_time_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  item_id uuid not null,
  user_id uuid not null default private.current_user_id(),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  foreign key (workspace_id, item_id) references public.task_items (workspace_id, id) on delete cascade,
  check (ended_at is null or ended_at >= started_at)
);
create unique index if not exists task_one_running_timer on public.task_time_entries (workspace_id, user_id) where ended_at is null;

-- ---- access helpers (security definer: no policy recursion)
create or replace function private.task_list_level(p_list uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when l.id is null or not private.is_staff(l.workspace_id) or not private.can_use_app(l.workspace_id, 'tasks') then null
    when l.owner_id = private.current_user_id() then 'owner'
    when l.space = 'personal' then null
    when private.has_role(l.workspace_id, 'admin') then 'edit'
    else (select case when bool_or(a.level = 'edit') then 'edit' when count(*) > 0 then 'view' end from public.task_list_access a
          where a.user_id = private.current_user_id() and (a.list_id = l.id or (l.folder_id is not null and a.folder_id = l.folder_id)))
  end from public.task_lists l where l.id = p_list
$$;
create or replace function private.task_folder_level(p_folder uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when f.id is null or not private.is_staff(f.workspace_id) or not private.can_use_app(f.workspace_id, 'tasks') then null
    when f.owner_id = private.current_user_id() then 'owner'
    when f.space = 'personal' then null
    when private.has_role(f.workspace_id, 'admin') then 'edit'
    else (select case when bool_or(a.level = 'edit') then 'edit' when count(*) > 0 then 'view' end from public.task_list_access a where a.folder_id = f.id and a.user_id = private.current_user_id())
  end from public.task_folders f where f.id = p_folder
$$;
create or replace function private.task_is_assignee(p_item uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.task_assignees a where a.item_id = p_item and a.user_id = private.current_user_id())
$$;
create or replace function private.task_item_visible(p_item uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.task_items i where i.id = p_item and private.is_staff(i.workspace_id) and private.can_use_app(i.workspace_id, 'tasks') and
    (i.created_by = private.current_user_id() or (not i.private and (private.task_list_level(i.list_id) is not null or private.task_is_assignee(i.id)))))
$$;
create or replace function private.task_item_editable(p_item uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.task_items i where i.id = p_item and private.is_staff(i.workspace_id) and private.can_use_app(i.workspace_id, 'tasks') and
    (i.created_by = private.current_user_id() and i.list_id is null or (not i.private or i.created_by = private.current_user_id()) and private.task_list_level(i.list_id) in ('owner', 'edit')))
$$;

-- private tasks: personal lists only (or the creator's Inbox)
create or replace function private.task_items_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.private and new.list_id is not null and (select space from public.task_lists where id = new.list_id) <> 'personal' then
    raise exception 'only tasks in a personal list can be private' using errcode = '22023'; end if;
  if tg_op = 'UPDATE' and new.created_by is distinct from old.created_by then raise exception 'records do not move' using errcode = 'P0001'; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger task_items_guard before insert or update on public.task_items for each row execute function private.task_items_guard();
-- the default "My tasks" list can't be deleted or moved to the team
create or replace function private.task_lists_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.is_default then raise exception 'My tasks can’t be deleted' using errcode = 'P0001'; end if; return old; end if;
  if old.is_default and (new.archived_at is not null or new.space <> 'personal') then raise exception 'My tasks can’t be archived or shared' using errcode = 'P0001'; end if;
  if new.owner_id is distinct from old.owner_id or new.space is distinct from old.space then raise exception 'records do not move' using errcode = 'P0001'; end if;
  new.updated_at := now(); return new;
end $$;
create trigger task_lists_guard before update or delete on public.task_lists for each row execute function private.task_lists_guard();
-- someone gave you a task: one notification (never to yourself, respects your settings)
create or replace function private.task_assigned_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t text;
begin
  select title into t from public.task_items where id = new.item_id;
  perform private.notify(new.workspace_id, new.user_id, 'tasks', 'assigned', left(t, 200), '#/tasks/today', 'tasks.assigned:' || new.item_id::text || ':' || new.user_id::text);
  return new;
end $$;
create trigger task_assigned_notify after insert on public.task_assignees for each row execute function private.task_assigned_notify();

-- ---- row rules
do $$
declare t text;
begin
  foreach t in array array['task_folders', 'task_lists', 'task_list_access', 'task_blocks', 'task_items', 'task_assignees', 'task_time_entries'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists org_scope on public.%I', t);
    execute format('create policy org_scope on public.%I as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id))', t);
    execute format('grant select, insert, update, delete on public.%I to app_user', t);
  end loop;
end $$;
create policy sel on public.task_folders for select using (owner_id = private.current_user_id() and private.is_staff(workspace_id) or private.task_folder_level(id) is not null);
create policy ins on public.task_folders for insert with check (owner_id = private.current_user_id() and private.can_use_app(workspace_id, 'tasks')
  and (space = 'personal' or private.has_permission(workspace_id, 'tasks.team.create')));
create policy upd on public.task_folders for update using (private.task_folder_level(id) in ('owner', 'edit'));
create policy del on public.task_folders for delete using (private.task_folder_level(id) = 'owner');

create policy sel on public.task_lists for select using (owner_id = private.current_user_id() and private.is_staff(workspace_id) or private.task_list_level(id) is not null);
create policy ins on public.task_lists for insert with check (owner_id = private.current_user_id() and private.can_use_app(workspace_id, 'tasks')
  and (space = 'personal' or private.has_permission(workspace_id, 'tasks.team.create'))
  and (folder_id is null or private.task_folder_level(folder_id) in ('owner', 'edit')));
create policy upd on public.task_lists for update using (private.task_list_level(id) in ('owner', 'edit'));
create policy del on public.task_lists for delete using (private.task_list_level(id) = 'owner');

-- access entries: visible to whoever can open the list/folder; managed by its owner (and owners/admins)
create policy sel on public.task_list_access for select using (coalesce(private.task_list_level(list_id), private.task_folder_level(folder_id)) is not null);
create policy mng on public.task_list_access for all
  using (coalesce(private.task_list_level(list_id), private.task_folder_level(folder_id)) = 'owner' or private.has_role(workspace_id, 'admin') and coalesce(private.task_list_level(list_id), private.task_folder_level(folder_id)) is not null)
  with check ((coalesce(private.task_list_level(list_id), private.task_folder_level(folder_id)) = 'owner' or private.has_role(workspace_id, 'admin') and coalesce(private.task_list_level(list_id), private.task_folder_level(folder_id)) is not null)
    and exists (select 1 from public.memberships m where m.workspace_id = task_list_access.workspace_id and m.user_id = task_list_access.user_id and m.kind = 'staff' and m.status = 'active')
    and coalesce((select space from public.task_lists where id = list_id), (select space from public.task_folders where id = folder_id)) = 'team');

create policy sel on public.task_blocks for select using (private.task_list_level(list_id) is not null);
create policy mng on public.task_blocks for all using (private.task_list_level(list_id) in ('owner', 'edit')) with check (private.task_list_level(list_id) in ('owner', 'edit'));

create policy sel on public.task_items for select using (private.is_staff(workspace_id) and private.can_use_app(workspace_id, 'tasks')
  and (created_by = private.current_user_id() or (not private and (private.task_list_level(list_id) is not null or private.task_is_assignee(id)))));
create policy ins on public.task_items for insert with check (created_by = private.current_user_id() and private.can_use_app(workspace_id, 'tasks')
  and (list_id is null or private.task_list_level(list_id) in ('owner', 'edit')));
create policy upd on public.task_items for update using (private.task_item_editable(id) or private.task_is_assignee(id))
  with check (list_id is null and created_by = private.current_user_id() or private.task_list_level(list_id) in ('owner', 'edit') or private.task_is_assignee(id));
create policy del on public.task_items for delete using (private.task_item_editable(id));

create policy sel on public.task_assignees for select using (private.task_item_visible(item_id));
create policy mng on public.task_assignees for all using (private.task_item_editable(item_id)) with check (private.task_item_editable(item_id)
  and exists (select 1 from public.memberships m where m.workspace_id = task_assignees.workspace_id and m.user_id = task_assignees.user_id and m.kind = 'staff' and m.status = 'active'));

create policy own on public.task_time_entries for all using (user_id = private.current_user_id()) with check (user_id = private.current_user_id() and private.task_item_visible(item_id));

-- ---- read functions that cross the row rules on purpose (each checks the caller first)
create or replace function public.tasks_private_count(p_person uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.task_items i where i.workspace_id = nullif(private.request_org(), '')::uuid and i.created_by = p_person and i.private and i.done_at is null
    and (p_person = private.current_user_id() or private.has_permission(i.workspace_id, 'tasks.teammates.view'))
$$;
-- a teammate's open tasks: their own lists (never private ones) and tasks others gave them — for people with "See teammates' tasks"
create or replace function public.tasks_person_items(p_person uuid) returns table (id uuid, title text, list_name text, due_date date, given_by uuid, kind text)
language sql stable security definer set search_path = '' as $$
  with ws as (select nullif(private.request_org(), '')::uuid as id)
  select i.id, i.title, l.name, i.due_date, null::uuid, 'own' from public.task_items i join public.task_lists l on l.id = i.list_id, ws
   where i.workspace_id = ws.id and l.owner_id = p_person and i.done_at is null and not i.private and l.archived_at is null
     and (private.has_permission(ws.id, 'tasks.teammates.view') or private.task_list_level(l.id) is not null)
  union all
  select i.id, i.title, l.name, i.due_date, a.assigned_by, 'given' from public.task_assignees a join public.task_items i on i.id = a.item_id left join public.task_lists l on l.id = i.list_id, ws
   where a.workspace_id = ws.id and a.user_id = p_person and coalesce(a.assigned_by, i.created_by) <> p_person and i.done_at is null and not i.private
     and (private.has_permission(ws.id, 'tasks.teammates.view') or a.assigned_by = private.current_user_id())
$$;
-- the caller's own "My tasks" list, created (with two blocks) on first use
create or replace function public.tasks_my_default() returns uuid
language plpgsql security definer set search_path = '' as $$
declare ws uuid := nullif(private.request_org(), '')::uuid; uid uuid := private.current_user_id(); lid uuid;
begin
  if ws is null or uid is null or not private.is_staff(ws) or not private.can_use_app(ws, 'tasks') then raise exception 'not found' using errcode = '42501'; end if;
  select id into lid from public.task_lists where workspace_id = ws and owner_id = uid and is_default;
  if lid is null then
    insert into public.task_lists (workspace_id, owner_id, space, name, icon, colour, is_default) values (ws, uid, 'personal', 'My tasks', 'check', '#0EA5A4', true) returning id into lid;
    insert into public.task_blocks (workspace_id, list_id, name, position) values (ws, lid, 'Today Tasks', 0), (ws, lid, 'This week', 1);
  end if;
  return lid;
end $$;

revoke execute on function private.task_items_guard(), private.task_lists_guard(), private.task_assigned_notify() from public;
revoke execute on function public.tasks_private_count(uuid), public.tasks_person_items(uuid), public.tasks_my_default(),
  private.task_list_level(uuid), private.task_folder_level(uuid), private.task_is_assignee(uuid), private.task_item_visible(uuid), private.task_item_editable(uuid) from public;
grant execute on function public.tasks_private_count(uuid), public.tasks_person_items(uuid), public.tasks_my_default() to app_user;
grant execute on function private.task_list_level(uuid), private.task_folder_level(uuid), private.task_is_assignee(uuid), private.task_item_visible(uuid), private.task_item_editable(uuid) to app_user;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on table public.task_folders, public.task_lists, public.task_list_access, public.task_blocks, public.task_items, public.task_assignees, public.task_time_entries from %I', r);
      execute format('revoke execute on function public.tasks_private_count(uuid), public.tasks_person_items(uuid), public.tasks_my_default() from %I', r);
    end if;
  end loop;
end $$;
