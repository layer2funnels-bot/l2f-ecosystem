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
