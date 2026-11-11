set check_function_bodies = off;
-- 0049 · Projects V2 joins the shared collaboration service (owner decision 11 Nov 2026: one notification bell, one comments
-- system). A Projects V2 task is entity_type 'pm_task' in public.comments / comment_mentions / follows / notifications /
-- activity_events. Who may see one is decided by Projects V2's own rule (pm.project_role / pm.user_can_view: personal
-- projects stay with their owner). V2's own pm_comments / pm_followers / pm_notifications tables stay in place, unused.
-- Adds and widens only: nothing is dropped except check constraints and policies that are re-created wider below.

-- ───────────── the record type joins (0034: "a record type joins by adding one line") ─────────────
alter table public.comments drop constraint comments_entity_type_check,
  add constraint comments_entity_type_check check (entity_type in ('project_task', 'pm_task'));
alter table public.activity_events drop constraint activity_events_entity_type_check,
  add constraint activity_events_entity_type_check check (entity_type in ('project_task', 'pm_task'));
alter table public.follows drop constraint follows_entity_type_check,
  add constraint follows_entity_type_check check (entity_type in ('project_task', 'pm_task'));
alter table public.notifications drop constraint notifications_entity_type_check,
  add constraint notifications_entity_type_check check (entity_type in ('project_task', 'pm_task'));
alter table public.notifications drop constraint notifications_kind_check,
  add constraint notifications_kind_check check (kind in ('assigned', 'mentioned', 'commented', 'completed', 'unblocked', 'due_changed'));   -- keeps 0036's 'unblocked'

create or replace function private.collab_scope(p_ws uuid, p_type text, p_id uuid, out client_id uuid, out project_id uuid, out view_perm text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_type = 'project_task' then
    select t.client_id, t.project_id, 'projects.task.view' into client_id, project_id, view_perm from public.project_tasks t where t.workspace_id = p_ws and t.id = p_id;
  elsif p_type = 'pm_task' then
    select p.client_id, t.project_id, 'pm' into client_id, project_id, view_perm
    from public.pm_tasks t join public.pm_projects p on p.id = t.project_id
    where t.workspace_id = p_ws and t.id = p_id and t.deleted_at is null and p.deleted_at is null;
  end if;
end $$;

-- Projects V2 decides for its own tasks (project membership, organization-wide projects, personal = owner only, and the
-- person must have the Projects app).
create or replace function private.collab_user_can_view(p_ws uuid, p_uid uuid, p_type text, p_id uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare s record;
begin
  s := private.collab_scope(p_ws, p_type, p_id);
  if s.view_perm is null then return false; end if;
  if s.view_perm = 'pm' then
    return p_ws = pm.org() and pm.user_can_view(s.project_id, p_uid)
      and exists (select 1 from public.memberships m where m.workspace_id = p_ws and m.user_id = p_uid and m.kind = 'staff' and m.status = 'active'
                  and (m.role in ('owner', 'admin') or exists (select 1 from public.app_grants g where g.workspace_id = p_ws and g.user_id = p_uid and g.app_key = 'projects')));
  end if;
  return private.permission_decision(p_ws, p_uid, s.view_perm, s.client_id, s.project_id) like 'allow:%';
end $$;

-- ───────────── row rules: Projects V2 tasks follow Projects V2's roles ─────────────
drop policy comments_select on public.comments;
drop policy comments_insert on public.comments;
drop policy comments_update on public.comments;
create policy comments_select on public.comments for select using (
  case when entity_type = 'pm_task' then pm.project_role(project_id) is not null
       else private.has_permission(workspace_id, 'projects.task.view', client_id, project_id) end);
create policy comments_insert on public.comments for insert with check (
  author_id = private.current_user_id() and
  case when entity_type = 'pm_task' then pm.can(project_id, 'viewer')
       else private.has_permission(workspace_id, 'projects.task.view', client_id, project_id)
            and private.has_permission(workspace_id, 'projects.task.comment', client_id, project_id) end);
create policy comments_update on public.comments for update
  using (author_id = private.current_user_id() and
         case when entity_type = 'pm_task' then pm.can(project_id, 'viewer')
              else private.has_permission(workspace_id, 'projects.task.comment', client_id, project_id) end)
  with check (author_id = private.current_user_id());

drop policy activity_select on public.activity_events;
create policy activity_select on public.activity_events for select using (
  case when entity_type = 'pm_task' then pm.project_role(project_id) is not null
       else private.has_permission(workspace_id, 'projects.task.view', client_id, project_id) end);

-- ───────────── people: every active staff member, even one whose profile row is missing ─────────────
-- (0048 started from profiles, so a member without a profile row would vanish and break comments and assignees.)
create or replace view public.pm_people with (security_invoker = true) as
  select m.user_id as id,
         coalesce(nullif(btrim(p.display_name), ''), 'Member ' || left(m.user_id::text, 4)) as name,
         case when m.user_id = pm.uid() or private.has_role(pm.org(), 'admin') then coalesce(p.email, '') else '' end as email,
         (array['#2b5ce6','#0e7c86','#a33b6b','#7c4dd8','#b07a00','#d9622b','#3b4a6b','#5b6b2e'])[1 + (abs(hashtext(m.user_id::text)) % 8)] as color
  from public.memberships m
  left join public.profiles p on p.id = m.user_id
  where pm.org_role() is not null and m.workspace_id = pm.org() and m.kind = 'staff' and m.status = 'active';
grant select on public.pm_people to app_user;

-- ───────────── entry points for the Projects V2 operations ─────────────
-- Tell people about a task: each one only if they may open it and is not the actor (private.collab_notify decides).
create function pm.notify(p_users uuid[], p_kind text, p_task uuid, p_comment uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid;
begin
  if pm.project_role((select t.project_id from public.pm_tasks t where t.id = p_task)) is null then return; end if;   -- the caller must see the task
  foreach u in array coalesce(p_users, '{}') loop
    perform private.collab_notify(pm.org(), u, p_kind, 'pm_task', p_task, p_comment);
  end loop;
end $$;
-- Make someone follow a task (only if they may open it).
create function pm.follow(p_task uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if pm.project_role((select t.project_id from public.pm_tasks t where t.id = p_task)) is null then return; end if;
  perform private.collab_follow(pm.org(), 'pm_task', p_task, p_user);
end $$;
create function pm.follower_ids(p_task uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(f.user_id order by f.user_id), '{}') from public.follows f
  where f.workspace_id = pm.org() and f.entity_type = 'pm_task' and f.entity_id = p_task
    and pm.project_role((select t.project_id from public.pm_tasks t where t.id = p_task)) is not null
$$;

-- Rule "assign" also makes the person follow: the shared follows, not V2's own table.
create or replace function pm.tasks_automate_after() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare r pm_rules; o pm_tasks; cur pm_tasks;
begin
  select * into cur from pm_tasks where id = new.id;
  if cur.id is null or cur.parent_id is not null or cur.deleted_at is not null then return null; end if;
  if tg_op = 'UPDATE' then o := old; end if;
  for r in select * from pm_rules x where x.project_id = cur.project_id and x.enabled and x.action in ('assign', 'tag') order by x.created_at, x.id loop
    if pm.rule_fires(r, tg_op, new, o) then
      if r.action = 'tag' then
        insert into pm_task_tags (task_id, tag_id) values (cur.id, r.tag_id) on conflict do nothing;
      elsif r.action = 'assign' and (tg_op = 'UPDATE' or not exists (select 1 from pm_task_assignees a where a.task_id = cur.id))
            and pm.user_can_view(cur.project_id, r.assignee_id) then
        insert into pm_task_assignees (task_id, user_id) values (cur.id, r.assignee_id) on conflict do nothing;
        perform private.collab_follow(cur.workspace_id, 'pm_task', cur.id, r.assignee_id);
      end if;
    end if;
  end loop;
  return null;
end $$;

-- The bell: both kinds of task, newest first, only what the reader can still open (joins run under the reader's rules).
create or replace function public.my_notifications(p_limit int default 30)
returns table (id uuid, kind text, entity_type text, entity_id uuid, title text, project_id uuid, project_name text, actor_id uuid, actor_name text, comment_id uuid, read_at timestamptz, created_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select n.id, n.kind, n.entity_type, n.entity_id, coalesce(t.title, vt.title), coalesce(t.project_id, vt.project_id), coalesce(p.name, vp.name),
         n.actor_id, coalesce(nullif(pr.display_name, ''), 'Someone'), n.comment_id, n.read_at, n.created_at
  from public.notifications n
  left join public.project_tasks t on n.entity_type = 'project_task' and t.workspace_id = n.workspace_id and t.id = n.entity_id
  left join public.projects p on p.workspace_id = t.workspace_id and p.id = t.project_id
  left join public.pm_tasks vt on n.entity_type = 'pm_task' and vt.workspace_id = n.workspace_id and vt.id = n.entity_id and vt.deleted_at is null
  left join public.pm_projects vp on vp.workspace_id = vt.workspace_id and vp.id = vt.project_id and vp.deleted_at is null
  left join public.profiles pr on pr.id = n.actor_id
  where n.user_id = private.current_user_id() and (p.id is not null or vp.id is not null)
  order by n.seq desc limit least(greatest(coalesce(p_limit, 30), 1), 100)
$$;

revoke all on function pm.notify(uuid[], text, uuid, uuid), pm.follow(uuid, uuid), pm.follower_ids(uuid) from public;
grant execute on function pm.notify(uuid[], text, uuid, uuid), pm.follow(uuid, uuid), pm.follower_ids(uuid) to app_user;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all functions in schema pm from %I', r);
      execute format('revoke all on all functions in schema private from %I', r);
      execute format('revoke all on all functions in schema public from %I', r);
    end if;
  end loop;
end $$;
