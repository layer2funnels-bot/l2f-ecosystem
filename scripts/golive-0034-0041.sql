-- Layer2Funnels + Aurj: bring the LIVE database from migration 0033 to 0041 in ONE step (all or nothing).
-- Contents: 0034 collaboration (comments, activity, notifications), 0035 projects organize, 0036 repeatable work, 0037 oversight, 0038 project rules,
-- 0039 client access event order, 0040 planner measure cadence, 0041 profiles (photo + own name).
-- Run it in the Supabase SQL Editor of project l2f-ecosystem (paste everything, press Run). It refuses to run twice or on the wrong database.
-- Every statement below is the unchanged migration file from the repository; the only additions are the guard and the history rows at the end.
begin;
do $guard$ begin
  if to_regclass('public.planner_strategies') is null then raise exception 'unexpected database: 0033 (Planner strategy) is not applied yet'; end if;
  if to_regclass('public.comments') is not null or exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'avatar_data') then
    raise exception 'unexpected database: part of 0034-0041 is already applied';
  end if;
end $guard$;
set local check_function_bodies = off;

-- ====================================================================== 0034_collaboration.sql
set check_function_bodies = off;
-- 0034 · Working together: comments with mentions, activity history, followers and notifications, as ONE shared service (ARCHITECTURE ER1:
-- "comments/activity, notifications … exist once and are reused"), used first by Projects tasks; plus subtasks.
-- Rules:
-- * a record type joins by adding one line to private.collab_scope() and to the entity_type checks; the service itself never changes.
-- * You see comments, activity and followers of a record exactly when you may see the record (its app's own view permission at its scope).
-- * Notifications are pointers (record type + id), never a copy of the text; the list re-checks the record under the reader's own rules,
--   so losing access to a task also hides its notifications (ER7). Nobody is notified about a record they cannot open, and never by themselves.
-- * History and notifications have a sequence number, so steps written in one transaction keep their order.
-- * Staff only (the API's default audience); comments are internal: nothing here is shown to clients.

-- ------------------------------------------------------------------ permission
insert into public.permissions (key, app_key, description, floor_role, default_role, scopes, sensitive) values
  ('projects.task.comment', 'projects', 'Comment on tasks and mention people', 'viewer', 'admin', '{workspace,client,project}', false);

-- ------------------------------------------------------------------ subtasks: real tasks under a task (one level, same project)
alter table public.project_tasks add column parent_task_id uuid,
  add constraint project_tasks_parent_fk foreign key (workspace_id, parent_task_id) references public.project_tasks (workspace_id, id),
  add constraint project_tasks_not_own_parent check (parent_task_id is distinct from id);
create index project_tasks_parent on public.project_tasks (workspace_id, parent_task_id) where parent_task_id is not null;

create or replace function private.project_tasks_parent_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare pp uuid; pparent uuid; found boolean;
begin
  if new.parent_task_id is null then return new; end if;
  select true, t.project_id, t.parent_task_id into found, pp, pparent from public.project_tasks t where t.workspace_id = new.workspace_id and t.id = new.parent_task_id;
  if found is not true then raise exception 'not found' using errcode = '42501'; end if;
  if pp is distinct from new.project_id then raise exception 'a subtask belongs to the same project as its task' using errcode = 'P0001'; end if;
  if pparent is not null then raise exception 'a subtask cannot have subtasks of its own' using errcode = 'P0001'; end if;
  if tg_op = 'UPDATE' and exists (select 1 from public.project_tasks c where c.workspace_id = new.workspace_id and c.parent_task_id = new.id) then
    raise exception 'a task with subtasks cannot become a subtask' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger project_tasks_parent_guard before insert or update of parent_task_id on public.project_tasks for each row execute function private.project_tasks_parent_guard();

-- ------------------------------------------------------------------ which records take part, and who may see one
-- Returns the record's client and project (for permission checks) and the app's view permission; null when the record does not exist.
create or replace function private.collab_scope(p_ws uuid, p_type text, p_id uuid, out client_id uuid, out project_id uuid, out view_perm text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_type = 'project_task' then
    select t.client_id, t.project_id, 'projects.task.view' into client_id, project_id, view_perm from public.project_tasks t where t.workspace_id = p_ws and t.id = p_id;
  end if;
end $$;
-- May this person (not necessarily the caller) see the record? Used to decide who is notified.
create or replace function private.collab_user_can_view(p_ws uuid, p_uid uuid, p_type text, p_id uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare s record;
begin
  s := private.collab_scope(p_ws, p_type, p_id);
  return s.view_perm is not null and private.permission_decision(p_ws, p_uid, s.view_perm, s.client_id, s.project_id) like 'allow:%';
end $$;

-- ------------------------------------------------------------------ tables
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_type text not null check (entity_type in ('project_task')),
  entity_id uuid not null,
  client_id uuid, project_id uuid,                     -- copied from the record by the guard; callers never set them
  author_id uuid not null,
  body text not null check (length(btrim(body)) >= 1 and length(body) <= 10000),   -- a blank comment is refused
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, author_id) references public.memberships (workspace_id, user_id)
);
create index comments_entity on public.comments (workspace_id, entity_type, entity_id, seq);

create table public.comment_mentions (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  comment_id uuid not null,
  user_id uuid not null,
  primary key (workspace_id, comment_id, user_id),
  foreign key (workspace_id, comment_id) references public.comments (workspace_id, id) on delete cascade,
  foreign key (workspace_id, user_id) references public.memberships (workspace_id, user_id)
);

create table public.activity_events (                  -- append-only: written only by triggers, never updated or deleted
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_type text not null check (entity_type in ('project_task')),
  entity_id uuid not null,
  client_id uuid, project_id uuid,
  actor_id uuid,
  action text not null check (action in ('created', 'status', 'assigned', 'unassigned', 'due', 'renamed', 'priority', 'archived', 'restored', 'commented', 'subtask_added')),
  detail jsonb check (detail is null or pg_column_size(detail) <= 2000),   -- codes, dates and ids only; never task notes or comment text
  created_at timestamptz not null default now()
);
create index activity_entity on public.activity_events (workspace_id, entity_type, entity_id, seq);

create table public.follows (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_type text not null check (entity_type in ('project_task')),
  entity_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, entity_type, entity_id, user_id),
  foreign key (workspace_id, user_id) references public.memberships (workspace_id, user_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null,
  kind text not null check (kind in ('assigned', 'mentioned', 'commented', 'completed')),
  entity_type text not null check (entity_type in ('project_task')),
  entity_id uuid not null,
  actor_id uuid,
  comment_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, user_id) references public.memberships (workspace_id, user_id) on delete cascade
);
create index notifications_mine on public.notifications (workspace_id, user_id, seq desc);
create index notifications_unread on public.notifications (workspace_id, user_id) where read_at is null;

-- ------------------------------------------------------------------ the service: follow, notify, record activity
create or replace function private.collab_follow(p_ws uuid, p_type text, p_id uuid, p_uid uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.follows (workspace_id, entity_type, entity_id, user_id)
  select p_ws, p_type, p_id, p_uid where p_uid is not null and private.collab_user_can_view(p_ws, p_uid, p_type, p_id)
  on conflict do nothing
$$;
-- one notification, only for someone else who may open the record
create or replace function private.collab_notify(p_ws uuid, p_uid uuid, p_kind text, p_type text, p_id uuid, p_comment uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.current_user_id();
begin
  if p_uid is null or p_uid is not distinct from actor or not private.collab_user_can_view(p_ws, p_uid, p_type, p_id) then return; end if;
  insert into public.notifications (workspace_id, user_id, kind, entity_type, entity_id, actor_id, comment_id) values (p_ws, p_uid, p_kind, p_type, p_id, actor, p_comment);
end $$;
create or replace function private.collab_notify_followers(p_ws uuid, p_kind text, p_type text, p_id uuid, p_comment uuid default null, p_except uuid[] default '{}') returns void
language plpgsql security definer set search_path = '' as $$
declare f record;
begin
  for f in select user_id from public.follows where workspace_id = p_ws and entity_type = p_type and entity_id = p_id and not (user_id = any (p_except)) loop
    perform private.collab_notify(p_ws, f.user_id, p_kind, p_type, p_id, p_comment);
  end loop;
end $$;
create or replace function private.collab_activity(p_ws uuid, p_type text, p_id uuid, p_action text, p_detail jsonb default null) returns void
language plpgsql security definer set search_path = '' as $$
declare s record;
begin
  s := private.collab_scope(p_ws, p_type, p_id);
  insert into public.activity_events (workspace_id, entity_type, entity_id, client_id, project_id, actor_id, action, detail)
  values (p_ws, p_type, p_id, s.client_id, s.project_id, private.current_user_id(), p_action, p_detail);
end $$;

-- tasks: history, followers (creator, assignee) and notifications (assigned, completed)
create or replace function private.project_tasks_collab() returns trigger
language plpgsql security definer set search_path = '' as $$
declare ws uuid := new.workspace_id; actor uuid := private.current_user_id();
begin
  if tg_op = 'INSERT' then
    perform private.collab_activity(ws, 'project_task', new.id, 'created');
    perform private.collab_follow(ws, 'project_task', new.id, actor);
    if new.parent_task_id is not null then perform private.collab_activity(ws, 'project_task', new.parent_task_id, 'subtask_added', jsonb_build_object('task', new.id)); end if;
    if new.assignee_id is not null then
      perform private.collab_follow(ws, 'project_task', new.id, new.assignee_id);
      perform private.collab_notify(ws, new.assignee_id, 'assigned', 'project_task', new.id);
    end if;
    return new;
  end if;
  if new.status is distinct from old.status then
    perform private.collab_activity(ws, 'project_task', new.id, 'status', jsonb_build_object('from', old.status, 'to', new.status));
    if new.status = 'done' then perform private.collab_notify_followers(ws, 'completed', 'project_task', new.id); end if;
  end if;
  if new.assignee_id is distinct from old.assignee_id then
    perform private.collab_activity(ws, 'project_task', new.id, case when new.assignee_id is null then 'unassigned' else 'assigned' end, jsonb_build_object('to', new.assignee_id, 'from', old.assignee_id));
    if new.assignee_id is not null then
      perform private.collab_follow(ws, 'project_task', new.id, new.assignee_id);
      perform private.collab_notify(ws, new.assignee_id, 'assigned', 'project_task', new.id);
    end if;
  end if;
  if new.due_on is distinct from old.due_on then perform private.collab_activity(ws, 'project_task', new.id, 'due', jsonb_build_object('from', old.due_on, 'to', new.due_on)); end if;
  if new.title is distinct from old.title then perform private.collab_activity(ws, 'project_task', new.id, 'renamed'); end if;   -- the title itself is not copied
  if new.priority is distinct from old.priority then perform private.collab_activity(ws, 'project_task', new.id, 'priority', jsonb_build_object('from', old.priority, 'to', new.priority)); end if;
  if new.archived_at is distinct from old.archived_at then perform private.collab_activity(ws, 'project_task', new.id, case when new.archived_at is null then 'restored' else 'archived' end); end if;
  return new;
end $$;
create trigger project_tasks_zcollab after insert or update on public.project_tasks for each row execute function private.project_tasks_collab();

-- comments: the record decides the scope; the author is the caller; only the text can change (and says it was edited)
create or replace function private.comments_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); s record;
begin
  if tg_op = 'INSERT' then
    s := private.collab_scope(new.workspace_id, new.entity_type, new.entity_id);
    if s.view_perm is null then raise exception 'not found' using errcode = '42501'; end if;
    new.client_id := s.client_id; new.project_id := s.project_id;
    if uid is not null then new.author_id := uid; end if;
    new.edited_at := null; new.created_at := now();
  else
    if new.workspace_id is distinct from old.workspace_id or new.entity_type is distinct from old.entity_type or new.entity_id is distinct from old.entity_id
       or new.author_id is distinct from old.author_id or new.client_id is distinct from old.client_id or new.project_id is distinct from old.project_id or new.created_at is distinct from old.created_at then
      raise exception 'records do not move' using errcode = 'P0001';
    end if;
    if new.body is distinct from old.body then new.edited_at := now(); end if;
  end if;
  return new;
end $$;
create trigger comments_guard before insert or update on public.comments for each row execute function private.comments_guard();

create or replace function private.comments_collab() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.collab_activity(new.workspace_id, new.entity_type, new.entity_id, 'commented', jsonb_build_object('comment', new.id));
  perform private.collab_notify_followers(new.workspace_id, 'commented', new.entity_type, new.entity_id, new.id);
  perform private.collab_follow(new.workspace_id, new.entity_type, new.entity_id, new.author_id);
  return new;
end $$;
create trigger comments_zcollab after insert on public.comments for each row execute function private.comments_collab();

-- a mention follows the person and tells them (and is dropped for someone who cannot open the record)
create or replace function private.comment_mentions_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c record;
begin
  select cm.entity_type, cm.entity_id, cm.author_id into c from public.comments cm where cm.workspace_id = new.workspace_id and cm.id = new.comment_id;
  if c.author_id is distinct from private.current_user_id() and private.current_user_id() is not null then raise exception 'not found' using errcode = '42501'; end if;
  if not private.collab_user_can_view(new.workspace_id, new.user_id, c.entity_type, c.entity_id) then return null; end if;   -- silently skipped
  return new;
end $$;
create trigger comment_mentions_guard before insert on public.comment_mentions for each row execute function private.comment_mentions_guard();
create or replace function private.comment_mentions_collab() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c record;
begin
  select cm.entity_type, cm.entity_id into c from public.comments cm where cm.workspace_id = new.workspace_id and cm.id = new.comment_id;
  perform private.collab_follow(new.workspace_id, c.entity_type, c.entity_id, new.user_id);
  perform private.collab_notify(new.workspace_id, new.user_id, 'mentioned', c.entity_type, c.entity_id, new.comment_id);
  return new;
end $$;
create trigger comment_mentions_zcollab after insert on public.comment_mentions for each row execute function private.comment_mentions_collab();

-- notifications: the reader may only mark them read
create or replace function private.notifications_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (to_jsonb(new) - 'read_at') is distinct from (to_jsonb(old) - 'read_at') then raise exception 'records do not move' using errcode = 'P0001'; end if;
  return new;
end $$;
create trigger notifications_guard before update on public.notifications for each row execute function private.notifications_guard();

-- ------------------------------------------------------------------ the API's entry points (security invoker: the caller's own rules apply)
-- Adds a comment and its mentions in one step; answers which mentioned people were told (the others cannot open the record).
create or replace function public.comment_add(p_type text, p_id uuid, p_body text, p_mentions uuid[] default '{}')
returns table (id uuid, mentioned uuid[])
language plpgsql security invoker set search_path = '' as $$
declare ws uuid := private.request_org()::uuid; cid uuid;
begin
  insert into public.comments (workspace_id, entity_type, entity_id, author_id, body) values (ws, p_type, p_id, private.current_user_id(), p_body) returning comments.id into cid;
  insert into public.comment_mentions (workspace_id, comment_id, user_id)
  select ws, cid, m from (select distinct unnest(coalesce(p_mentions, '{}')) m) x
  where exists (select 1 from public.memberships ms where ms.workspace_id = ws and ms.user_id = x.m and ms.kind = 'staff' and ms.status = 'active');
  return query select cid, coalesce((select array_agg(cm.user_id order by cm.user_id) from public.comment_mentions cm where cm.workspace_id = ws and cm.comment_id = cid), '{}');
end $$;

-- The reader's notifications for this organization, newest first, only for records they can still open (the join runs under their own rules).
create or replace function public.my_notifications(p_limit int default 30)
returns table (id uuid, kind text, entity_type text, entity_id uuid, title text, project_id uuid, project_name text, actor_id uuid, actor_name text, comment_id uuid, read_at timestamptz, created_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select n.id, n.kind, n.entity_type, n.entity_id, t.title, t.project_id, p.name, n.actor_id, coalesce(nullif(pr.display_name, ''), 'Someone'), n.comment_id, n.read_at, n.created_at
  from public.notifications n
  join public.project_tasks t on n.entity_type = 'project_task' and t.workspace_id = n.workspace_id and t.id = n.entity_id
  join public.projects p on p.workspace_id = t.workspace_id and p.id = t.project_id
  left join public.profiles pr on pr.id = n.actor_id
  where n.user_id = private.current_user_id()
  order by n.seq desc limit least(greatest(coalesce(p_limit, 30), 1), 100)
$$;

-- ------------------------------------------------------------------ policies
do $$
declare t text;
begin
  foreach t in array array['comments', 'comment_mentions', 'activity_events', 'follows', 'notifications'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('create policy org_scope on public.%I as restrictive for all
      using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id))', t);
  end loop;
end $$;

-- comments: seen with the task; written by people who may comment there; changed or removed only by their author
create policy comments_select on public.comments for select using (private.has_permission(workspace_id, 'projects.task.view', client_id, project_id));
create policy comments_insert on public.comments for insert with check (
  author_id = private.current_user_id()
  and private.has_permission(workspace_id, 'projects.task.view', client_id, project_id)
  and private.has_permission(workspace_id, 'projects.task.comment', client_id, project_id));
create policy comments_update on public.comments for update
  using (author_id = private.current_user_id() and private.has_permission(workspace_id, 'projects.task.comment', client_id, project_id))
  with check (author_id = private.current_user_id());
create policy comments_delete on public.comments for delete using (author_id = private.current_user_id());

create policy comment_mentions_select on public.comment_mentions for select using (
  exists (select 1 from public.comments c where c.workspace_id = comment_mentions.workspace_id and c.id = comment_mentions.comment_id));
create policy comment_mentions_insert on public.comment_mentions for insert with check (
  exists (select 1 from public.comments c where c.workspace_id = comment_mentions.workspace_id and c.id = comment_mentions.comment_id and c.author_id = private.current_user_id()));

create policy activity_select on public.activity_events for select using (private.has_permission(workspace_id, 'projects.task.view', client_id, project_id));

-- follows: your own; you may follow only what you can see
create policy follows_select on public.follows for select using (user_id = private.current_user_id());
create policy follows_insert on public.follows for insert with check (
  user_id = private.current_user_id() and private.collab_user_can_view(workspace_id, user_id, entity_type, entity_id));
create policy follows_delete on public.follows for delete using (user_id = private.current_user_id());

create policy notifications_select on public.notifications for select using (user_id = private.current_user_id());
create policy notifications_update on public.notifications for update using (user_id = private.current_user_id()) with check (user_id = private.current_user_id());

-- ------------------------------------------------------------------ starter levels learn to comment
insert into public.access_level_permissions (workspace_id, access_level_id, permission_key)
select l.workspace_id, l.id, 'projects.task.comment' from public.access_levels l
where l.app_key = 'projects' and l.is_template and l.name in ('Project member', 'All projects · edit')
on conflict do nothing;
create or replace function private.grant_project_child_permissions(ws uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.access_level_permissions (workspace_id, access_level_id, permission_key)
  select l.workspace_id, l.id, k from public.access_levels l
  cross join unnest(case l.name
      when 'Project member'      then array['projects.task.view','projects.task.create','projects.task.edit','projects.time.view','projects.time.create','projects.task.comment']
      when 'All projects · edit' then array['projects.task.view','projects.task.create','projects.task.edit','projects.time.view','projects.time.create','projects.time.edit','projects.task.comment']
      when 'All projects · read' then array['projects.task.view','projects.time.view']
      else array[]::text[] end) k
  where l.workspace_id = ws and l.app_key = 'projects' and l.is_template
  on conflict do nothing;
end $$;

-- ------------------------------------------------------------------ audit (no comment text) and grants
create trigger audit_comments after update or delete on public.comments for each row execute function private.audit_change('entity_type', 'entity_id', 'author_id');

revoke all on all functions in schema private from public;   -- re-asserts the foundation rule F4b for the helpers above
do $$ declare f record; begin for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname like 'collab\_%' loop execute format('grant execute on function %s to app_user', f.sig); end loop; end $$;   -- only this service's helpers (the follows policy calls one)
revoke all on function public.comment_add(text, uuid, text, uuid[]), public.my_notifications(int) from public;
grant execute on function public.comment_add(text, uuid, text, uuid[]), public.my_notifications(int) to app_user;
grant select, insert, update, delete on public.comments, public.follows to app_user;
grant select, insert on public.comment_mentions to app_user;
grant select on public.activity_events to app_user;
grant select, update on public.notifications to app_user;

-- ------------------------------------------------------------------ API role lockdown (as migration 0010): browser roles get nothing
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

-- ====================================================================== 0035_projects_organize.sql
set check_function_bodies = off;
-- 0035 · Projects R2, organizing work: sections inside a project, organization tags on tasks, and Drive files attached to a task.
-- Same rules as 0013: one organization per row (composite keys, org_scope), the record's project decides who may see and change it,
-- callers never set the client or project of a child row (guards copy them), Data API roles get nothing.
-- Attachments follow SDOR: the file stays in Drive in the project's own place (0024); the task only points at a file of ITS project,
-- and someone sees the link only when they may see both the task and the file.

-- ------------------------------------------------------------------ sections
create table public.project_sections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null,
  client_id uuid,                                      -- copied from the project by the guard
  name text not null check (length(btrim(name)) between 1 and 100),
  position int not null default 0 check (position between 0 and 100000),
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, project_id, id),
  foreign key (workspace_id, project_id) references public.projects (workspace_id, id)
);
create index project_sections_project on public.project_sections (workspace_id, project_id, position);

alter table public.project_tasks add column section_id uuid,
  -- the section must be in the task's own project: the key includes the project
  add constraint project_tasks_section_fk foreign key (workspace_id, project_id, section_id) references public.project_sections (workspace_id, project_id, id) on delete set null (section_id);

create or replace function private.project_sections_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); pc uuid; found boolean;
begin
  select true, p.client_id into found, pc from public.projects p where p.workspace_id = new.workspace_id and p.id = new.project_id;
  if found is not true then raise exception 'not found' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    if uid is not null then new.created_by := uid; end if;
    new.client_id := pc;
  else
    if new.workspace_id is distinct from old.workspace_id or new.project_id is distinct from old.project_id or new.client_id is distinct from old.client_id or new.created_by is distinct from old.created_by then
      raise exception 'records do not move' using errcode = 'P0001';
    end if;
    new.updated_at := now();
  end if;
  new.name := btrim(new.name);
  return new;
end $$;
create trigger project_sections_guard before insert or update on public.project_sections for each row execute function private.project_sections_guard();

-- ------------------------------------------------------------------ tags (one list per organization; a tag is reused by name, any capitals)
create table public.project_tags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 40),
  color text not null default 'slate' check (color in ('slate', 'blue', 'green', 'amber', 'red', 'violet', 'teal', 'pink')),
  created_by uuid, created_at timestamptz not null default now(),
  unique (workspace_id, id)
);
create unique index project_tags_name on public.project_tags (workspace_id, lower(btrim(name)));

create table public.task_tags (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id uuid not null,
  tag_id uuid not null,
  project_id uuid, client_id uuid,                     -- copied from the task by the guard
  created_at timestamptz not null default now(),
  primary key (workspace_id, task_id, tag_id),
  foreign key (workspace_id, task_id) references public.project_tasks (workspace_id, id) on delete cascade,
  foreign key (workspace_id, tag_id) references public.project_tags (workspace_id, id) on delete cascade
);
create index task_tags_tag on public.task_tags (workspace_id, tag_id);

-- ------------------------------------------------------------------ Drive files attached to a task
create table public.task_files (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id uuid not null,
  file_id uuid not null,
  project_id uuid, client_id uuid,                     -- copied from the task by the guard
  created_by uuid, created_at timestamptz not null default now(),
  primary key (workspace_id, task_id, file_id),
  foreign key (workspace_id, task_id) references public.project_tasks (workspace_id, id) on delete cascade,
  foreign key (workspace_id, file_id) references public.files (workspace_id, id) on delete cascade
);

-- children of a task: project and client come from the task; a file must belong to the task's own project
create or replace function private.task_children_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare tp uuid; tc uuid; found boolean; fp uuid;
begin
  select true, t.project_id, t.client_id into found, tp, tc from public.project_tasks t where t.workspace_id = new.workspace_id and t.id = new.task_id;
  if found is not true then raise exception 'not found' using errcode = '42501'; end if;
  new.project_id := tp; new.client_id := tc;
  if tg_table_name = 'task_files' then
    select f.project_id into fp from public.files f where f.workspace_id = new.workspace_id and f.id = new.file_id;
    if fp is distinct from tp then raise exception 'only a file of this task''s project can be attached' using errcode = 'P0001'; end if;
    new.created_by := private.current_user_id();
  end if;
  return new;
end $$;
create trigger task_tags_guard before insert on public.task_tags for each row execute function private.task_children_guard();
create trigger task_files_guard before insert on public.task_files for each row execute function private.task_children_guard();

-- Adds a tag to a task by name (creating the organization tag the first time). Security invoker: the caller must be able to edit the task.
create or replace function public.task_tag_add(p_task uuid, p_name text)
returns table (id uuid, name text, color text)
language plpgsql security invoker set search_path = '' as $$
declare ws uuid := private.request_org()::uuid; t record; tid uuid; nm text := btrim(coalesce(p_name, ''));
begin
  if length(nm) not between 1 and 40 then raise exception 'a tag needs a name of 1 to 40 characters' using errcode = 'P0001'; end if;
  select pt.client_id, pt.project_id into t from public.project_tasks pt where pt.workspace_id = ws and pt.id = p_task;
  if t.project_id is null or not private.has_permission(ws, 'projects.task.edit', t.client_id, t.project_id) then raise exception 'not found' using errcode = '42501'; end if;
  tid := private.project_tag_ensure(ws, nm);
  insert into public.task_tags (workspace_id, task_id, tag_id) values (ws, p_task, tid) on conflict do nothing;
  return query select g.id, g.name, g.color from public.project_tags g where g.workspace_id = ws and g.id = tid;
end $$;
create or replace function private.project_tag_ensure(p_ws uuid, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare tid uuid;
begin
  if p_ws is distinct from private.request_org()::uuid or not private.can_use_app(p_ws, 'projects') then raise exception 'not found' using errcode = '42501'; end if;   -- only in the request's own organization
  select g.id into tid from public.project_tags g where g.workspace_id = p_ws and lower(btrim(g.name)) = lower(btrim(p_name));
  if tid is null then
    insert into public.project_tags (workspace_id, name, created_by) values (p_ws, btrim(p_name), private.current_user_id())
    on conflict (workspace_id, lower(btrim(name))) do nothing returning project_tags.id into tid;
    if tid is null then select g.id into tid from public.project_tags g where g.workspace_id = p_ws and lower(btrim(g.name)) = lower(btrim(p_name)); end if;
  end if;
  return tid;
end $$;

-- ------------------------------------------------------------------ policies
do $$
declare t text;
begin
  foreach t in array array['project_sections', 'project_tags', 'task_tags', 'task_files'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('create policy org_scope on public.%I as restrictive for all
      using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id))', t);
  end loop;
end $$;

create policy project_sections_select on public.project_sections for select using (private.has_permission(workspace_id, 'projects.task.view', client_id, project_id));
create policy project_sections_insert on public.project_sections for insert with check (
  private.has_permission(workspace_id, 'projects.task.edit', (select p.client_id from public.projects p where p.workspace_id = project_sections.workspace_id and p.id = project_sections.project_id), project_id));
create policy project_sections_update on public.project_sections for update
  using (private.has_permission(workspace_id, 'projects.task.edit', client_id, project_id)) with check (private.has_permission(workspace_id, 'projects.task.edit', client_id, project_id));
create policy project_sections_delete on public.project_sections for delete using (private.has_permission(workspace_id, 'projects.task.edit', client_id, project_id));

-- tag names are labels, not data: everyone who can use Projects here sees the list; tags are created only through task_tag_add
create policy project_tags_select on public.project_tags for select using (private.can_use_app(workspace_id, 'projects'));

create policy task_tags_select on public.task_tags for select using (private.has_permission(workspace_id, 'projects.task.view', client_id, project_id));
create policy task_tags_insert on public.task_tags for insert with check (
  private.has_permission(workspace_id, 'projects.task.edit',
    (select t.client_id from public.project_tasks t where t.workspace_id = task_tags.workspace_id and t.id = task_tags.task_id),
    (select t.project_id from public.project_tasks t where t.workspace_id = task_tags.workspace_id and t.id = task_tags.task_id)));
create policy task_tags_delete on public.task_tags for delete using (private.has_permission(workspace_id, 'projects.task.edit', client_id, project_id));

-- a link is seen only with BOTH the task and the file (the files subquery runs under the reader's own Drive rules)
create policy task_files_select on public.task_files for select using (
  private.has_permission(workspace_id, 'projects.task.view', client_id, project_id)
  and exists (select 1 from public.files f where f.workspace_id = task_files.workspace_id and f.id = task_files.file_id));
create policy task_files_insert on public.task_files for insert with check (
  private.has_permission(workspace_id, 'projects.task.edit',
    (select t.client_id from public.project_tasks t where t.workspace_id = task_files.workspace_id and t.id = task_files.task_id),
    (select t.project_id from public.project_tasks t where t.workspace_id = task_files.workspace_id and t.id = task_files.task_id))
  and exists (select 1 from public.files f where f.workspace_id = task_files.workspace_id and f.id = task_files.file_id));
create policy task_files_delete on public.task_files for delete using (private.has_permission(workspace_id, 'projects.task.edit', client_id, project_id));

-- ------------------------------------------------------------------ audit and grants
create trigger audit_project_sections after insert or update or delete on public.project_sections for each row execute function private.audit_change('project_id', 'name');
create trigger audit_task_files after insert or delete on public.task_files for each row execute function private.audit_change('task_id', 'file_id');

revoke all on all functions in schema private from public;
grant execute on function private.project_tag_ensure(uuid, text) to app_user;   -- called by task_tag_add after it checked the right to edit the task
revoke all on function public.task_tag_add(uuid, text) from public;
grant execute on function public.task_tag_add(uuid, text) to app_user;
grant select, insert, update, delete on public.project_sections to app_user;
grant select on public.project_tags to app_user;
grant select, insert, delete on public.task_tags, public.task_files to app_user;

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

-- ====================================================================== 0036_projects_repeatable.sql
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

-- ====================================================================== 0037_projects_oversight.sql
set check_function_bodies = off;
-- 0037 · Projects R4, oversight: a time estimate on each task. Workload, the project report and the portfolio are read-only operations
-- (packages/core/project-operations.mjs) over tables that already have their row rules, so every number is computed under the reader's own access.
alter table public.project_tasks add column estimate_minutes int check (estimate_minutes between 0 and 100000);
create index project_tasks_open_due on public.project_tasks (workspace_id, assignee_id, due_on) where archived_at is null and status <> 'done';

-- ====================================================================== 0038_projects_rules.sql
set check_function_bodies = off;
-- 0038 · Projects R5, simple rules: "when a task is created / moves to a status / moves into a section, then assign it, set its
-- priority, set its due date N days ahead, or add a tag". One rule = one trigger + one action, per project.
-- Rules run inside the database (BEFORE/AFTER triggers on project_tasks), so the screen, bulk changes and recurring copies all follow them.
-- Actions never change status or section, so a rule can never start another rule (no loops).
-- Managing rules needs projects.project.edit on the project; reading them needs projects.task.view. Same org fence as every table.

create table public.project_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null,
  client_id uuid,                                      -- copied from the project by the guard
  trigger text not null check (trigger in ('created', 'status', 'section')),
  trigger_status text check (trigger_status in ('todo', 'doing', 'blocked', 'done')),
  trigger_section uuid,
  action text not null check (action in ('assign', 'priority', 'due_in', 'tag')),
  assignee_id uuid,
  priority text check (priority in ('low', 'normal', 'high', 'urgent')),
  due_in_days int check (due_in_days between 0 and 365),
  tag_id uuid,
  enabled boolean not null default true,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, project_id) references public.projects (workspace_id, id) on delete cascade,
  -- the section must be in the rule's own project; deleting the section removes the rule
  foreign key (workspace_id, project_id, trigger_section) references public.project_sections (workspace_id, project_id, id) on delete cascade,
  foreign key (workspace_id, tag_id) references public.project_tags (workspace_id, id) on delete cascade,
  constraint project_rules_trigger_complete check (
    (trigger = 'created' and trigger_status is null and trigger_section is null)
    or (trigger = 'status' and trigger_status is not null and trigger_section is null)
    or (trigger = 'section' and trigger_section is not null and trigger_status is null)),
  constraint project_rules_action_complete check (
    (action = 'assign' and assignee_id is not null)
    or (action = 'priority' and priority is not null)
    or (action = 'due_in' and due_in_days is not null)
    or (action = 'tag' and tag_id is not null))
);
create index project_rules_project on public.project_rules (workspace_id, project_id) where enabled;

create or replace function private.project_rules_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); pc uuid; found boolean;
begin
  select true, p.client_id into found, pc from public.projects p where p.workspace_id = new.workspace_id and p.id = new.project_id;
  if found is not true then raise exception 'not found' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    if uid is not null then new.created_by := uid; end if;
    new.client_id := pc;
    if (select count(*) from public.project_rules r where r.workspace_id = new.workspace_id and r.project_id = new.project_id) >= 30 then
      raise exception 'a project can have at most 30 rules' using errcode = 'P0001';
    end if;
  else
    if new.workspace_id is distinct from old.workspace_id or new.project_id is distinct from old.project_id or new.client_id is distinct from old.client_id or new.created_by is distinct from old.created_by then
      raise exception 'records do not move' using errcode = 'P0001';
    end if;
    new.updated_at := now();
  end if;
  if new.assignee_id is not null and not exists (select 1 from public.memberships m where m.workspace_id = new.workspace_id and m.user_id = new.assignee_id and m.kind = 'staff') then
    raise exception 'the person must be a member of this organization' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger project_rules_guard before insert or update on public.project_rules for each row execute function private.project_rules_guard();

-- Does this change match the rule's trigger? On creation a task "arrives" in its status and section too.
create or replace function private.project_rule_fires(r public.project_rules, op text, n public.project_tasks, o public.project_tasks) returns boolean
language sql stable set search_path = '' as $$
  select case r.trigger
    when 'created' then op = 'INSERT'
    when 'status' then n.status = r.trigger_status and (op = 'INSERT' or o.status is distinct from n.status)
    when 'section' then n.section_id = r.trigger_section and (op = 'INSERT' or o.section_id is distinct from n.section_id)
  end
$$;

-- BEFORE: assign, priority, due date. Named to sort before project_tasks_guard, which then checks the result like any other change.
-- On creation a rule only fills what the person left empty; on a move it sets the value (that is what the rule is for).
create or replace function private.project_tasks_automate() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r public.project_rules; o public.project_tasks; ins boolean := tg_op = 'INSERT';
begin
  if not ins then o := old; end if;
  for r in select * from public.project_rules x where x.workspace_id = new.workspace_id and x.project_id = new.project_id and x.enabled and x.action <> 'tag' order by x.created_at, x.id loop
    if private.project_rule_fires(r, tg_op, new, o) then
      if r.action = 'assign' and (not ins or new.assignee_id is null) then new.assignee_id := r.assignee_id;
      elsif r.action = 'priority' and (not ins or new.priority = 'normal') then new.priority := r.priority;
      elsif r.action = 'due_in' and (not ins or new.due_on is null) then
        new.due_on := current_date + r.due_in_days;
        if new.start_on is not null and new.start_on > new.due_on then new.start_on := new.due_on; end if;
      end if;
    end if;
  end loop;
  return new;
end $$;
create trigger project_tasks_automate before insert or update of status, section_id on public.project_tasks for each row execute function private.project_tasks_automate();

-- AFTER: tags (the task must exist first)
create or replace function private.project_tasks_automate_tags() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r public.project_rules; o public.project_tasks;
begin
  if tg_op = 'UPDATE' then o := old; end if;
  for r in select * from public.project_rules x where x.workspace_id = new.workspace_id and x.project_id = new.project_id and x.enabled and x.action = 'tag' loop
    if private.project_rule_fires(r, tg_op, new, o) then
      insert into public.task_tags (workspace_id, task_id, tag_id) values (new.workspace_id, new.id, r.tag_id) on conflict do nothing;
    end if;
  end loop;
  return null;
end $$;
create trigger project_tasks_zrules_tags after insert or update of status, section_id on public.project_tasks for each row execute function private.project_tasks_automate_tags();

-- ------------------------------------------------------------------ policies
alter table public.project_rules enable row level security;
alter table public.project_rules force row level security;
create policy org_scope on public.project_rules as restrictive for all
  using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
create policy project_rules_select on public.project_rules for select using (private.has_permission(workspace_id, 'projects.task.view', client_id, project_id));
create policy project_rules_insert on public.project_rules for insert with check (
  private.has_permission(workspace_id, 'projects.project.edit', (select p.client_id from public.projects p where p.workspace_id = project_rules.workspace_id and p.id = project_rules.project_id), project_id));
create policy project_rules_update on public.project_rules for update
  using (private.has_permission(workspace_id, 'projects.project.edit', client_id, project_id)) with check (private.has_permission(workspace_id, 'projects.project.edit', client_id, project_id));
create policy project_rules_delete on public.project_rules for delete using (private.has_permission(workspace_id, 'projects.project.edit', client_id, project_id));

create trigger audit_project_rules after insert or update or delete on public.project_rules for each row execute function private.audit_change('project_id', 'trigger', 'action', 'enabled');

revoke all on all functions in schema private from public;
grant select, insert, update, delete on public.project_rules to app_user;

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

-- ====================================================================== 0039_client_access_event_order.sql
set check_function_bodies = off;
-- 0039 · Client access history keeps the order steps happened in. Two steps of one request (created_client, invited) can share the same
-- clock_timestamp() microsecond; the tie was broken by the random id, so the history sometimes showed them swapped (CA26 failed now and then).
-- An identity column numbers events in insertion order; existing rows are numbered in their stored order.
alter table public.client_access_events add column seq bigint generated always as identity;
create index client_access_events_order on public.client_access_events (workspace_id, access_id, seq);

create or replace function public.client_access_events_list(p_access uuid)
returns table (event text, actor_id uuid, detail text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare ws uuid := private.client_access_org();
begin
  return query select e.event, e.actor_id, e.detail, e.created_at from public.client_access_events e where e.workspace_id = ws and e.access_id = p_access order by e.seq;
end $$;
revoke all on function public.client_access_events_list(uuid) from public;
grant execute on function public.client_access_events_list(uuid) to app_user;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all tables in schema public from %I', r);
      execute format('revoke all on all functions in schema public from %I', r);
      execute format('revoke all on all sequences in schema public from %I', r);
    end if;
  end loop;
end $$;

-- ====================================================================== 0040_planner_measure_cadence.sql
set check_function_bodies = off;
-- 0040 · Planner measures accept "every two weeks". The measure form offers the same check rhythms as plans and goals
-- (none, weekly, fortnightly, monthly, quarterly), but planner_kpis only allowed four of them, so choosing "Every two weeks"
-- failed with a constraint error. Plans and goals already accept fortnightly; measures now do too.
alter table public.planner_kpis drop constraint planner_kpis_cadence_check;
alter table public.planner_kpis add constraint planner_kpis_cadence_check check (cadence in ('none', 'weekly', 'fortnightly', 'monthly', 'quarterly'));

-- ====================================================================== 0041_profiles.sql
-- 0041: profiles. Every person (team member or client) can keep their own display name and a small photo.
-- The photo is a small square JPEG stored as a data URL (at most 12,000 characters; the browser shrinks it before sending), so no storage bucket is needed.
-- Additive. Nothing here grants anything to anon or authenticated; the API runs these functions as app_user.
alter table public.profiles add column avatar_data text
  check (avatar_data is null or (avatar_data like 'data:image/jpeg;base64,%' and length(avatar_data) <= 12000));

-- the caller's own profile
create or replace function public.profile_get()
returns table (id uuid, display_name text, email text, avatar_data text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name, p.email, p.avatar_data from public.profiles p where p.id = private.current_user_id()
$$;

-- change the caller's own name and/or photo. There is no person argument: nobody can change anybody else's profile through this.
create or replace function public.profile_update(p_name text default null, p_photo text default null, p_clear_photo boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); n text := nullif(left(btrim(coalesce(p_name, '')), 120), '');
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_name is not null and n is null then raise exception 'a name is required' using errcode = '22023'; end if;
  if p_photo is not null and (p_photo not like 'data:image/jpeg;base64,%' or length(p_photo) > 12000) then
    raise exception 'the photo must be a small JPEG' using errcode = '22023';
  end if;
  insert into public.profiles (id, email) values (uid, private.current_user_email()) on conflict (id) do nothing;
  update public.profiles set display_name = coalesce(n, display_name),
         avatar_data = case when p_clear_photo then null when p_photo is not null then p_photo else avatar_data end
   where id = uid;
end $$;

-- a team member's photo: only for someone active in the same organization (the one in the request header), or yourself
create or replace function public.profile_photo(p_user uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare r text := private.request_org(); ws uuid;
begin
  if p_user = private.current_user_id() then return (select avatar_data from public.profiles where id = p_user); end if;
  if r is null or r !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
  ws := r::uuid;
  if not private.is_staff(ws) then return null; end if;
  return (select p.avatar_data from public.profiles p join public.memberships m on m.user_id = p.id
           where p.id = p_user and m.workspace_id = ws and m.kind = 'staff' and m.status = 'active');
end $$;

-- the team directory says who has a photo (the photo itself is fetched one person at a time)
drop function public.team_list();
create function public.team_list()
returns table (user_id uuid, display_name text, email text, role text, is_you boolean, has_photo boolean)
language plpgsql stable security definer set search_path = '' as $$
declare ws uuid; r text := private.request_org();
begin
  if r is null or r !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return; end if;
  ws := r::uuid;
  if not private.is_staff(ws) then return; end if;
  return query
    select m.user_id, coalesce(p.display_name, 'Member ' || left(m.user_id::text, 4)),
           case when private.has_role(ws, 'admin') then p.email else null end,
           m.role, m.user_id = private.current_user_id(), p.avatar_data is not null
      from public.memberships m left join public.profiles p on p.id = m.user_id
     where m.workspace_id = ws and m.kind = 'staff' and m.status = 'active'
     order by lower(coalesce(p.display_name, 'zz')), m.user_id;
end $$;

revoke all on function public.profile_get(), public.profile_update(text, text, boolean), public.profile_photo(uuid), public.team_list() from public;
grant execute on function public.profile_get(), public.profile_update(text, text, boolean), public.profile_photo(uuid), public.team_list() to app_user;

-- ====================================================================== migration history
do $hist$ begin if to_regclass('supabase_migrations.schema_migrations') is not null then
  insert into supabase_migrations.schema_migrations (version, name) values
  ('20261023190033', '0034_collaboration'),
  ('20261023190034', '0035_projects_organize'),
  ('20261023190035', '0036_projects_repeatable'),
  ('20261023190036', '0037_projects_oversight'),
  ('20261023190037', '0038_projects_rules'),
  ('20261023190038', '0039_client_access_event_order'),
  ('20261023190039', '0040_planner_measure_cadence'),
  ('20261023190040', '0041_profiles');
end if; end $hist$;
commit;
