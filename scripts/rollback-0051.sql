-- Rollback of migration 0051 (Projects cutover). NOT a migration: run by hand, only with the owner's explicit approval,
-- in one transaction, if the cutover must be undone. The old Projects tables were never changed by 0051, so they need
-- nothing; this puts every reference and function back exactly as before 0051 and removes ONLY the rows 0051 copied
-- (Projects V2 projects whose id is also an old project id, which cascades to their tasks and everything under them).
-- Anything created in Projects V2 after the cutover is NOT removed. Re-run 0051 afterwards to redo the copy.
begin;

-- the old app's comments, notifications and history go back to their old tasks
update public.comments c set entity_type = 'project_task' where c.entity_type = 'pm_task' and exists (select 1 from public.project_tasks t where t.id = c.entity_id);
update public.notifications n set entity_type = 'project_task' where n.entity_type = 'pm_task' and exists (select 1 from public.project_tasks t where t.id = n.entity_id);
update public.activity_events a set entity_type = 'project_task' where a.entity_type = 'pm_task' and exists (select 1 from public.project_tasks t where t.id = a.entity_id);
delete from public.follows f where f.entity_type = 'pm_task' and exists (select 1 from public.project_tasks t where t.id = f.entity_id);

-- references back to the old tables
alter table public.files drop constraint files_project_fk,
  add constraint files_project_fk foreign key (workspace_id, project_id) references public.projects (workspace_id, id);
alter table public.access_assignments drop constraint access_assignments_workspace_id_project_id_fkey,
  add constraint access_assignments_workspace_id_project_id_fkey foreign key (workspace_id, project_id) references public.projects (workspace_id, id) on delete cascade;
alter table public.permission_overrides drop constraint permission_overrides_workspace_id_project_id_fkey,
  add constraint permission_overrides_workspace_id_project_id_fkey foreign key (workspace_id, project_id) references public.projects (workspace_id, id) on delete cascade;
alter table public.planner_goals drop constraint planner_goals_workspace_id_project_id_fkey,
  add constraint planner_goals_workspace_id_project_id_fkey foreign key (workspace_id, project_id) references public.projects (workspace_id, id);
alter table public.planner_actions drop constraint planner_actions_workspace_id_project_id_fkey,
  add constraint planner_actions_workspace_id_project_id_fkey foreign key (workspace_id, project_id) references public.projects (workspace_id, id);
alter table public.planner_objective_tasks drop constraint planner_objective_tasks_workspace_id_task_id_fkey,
  add constraint planner_objective_tasks_workspace_id_task_id_fkey foreign key (workspace_id, task_id) references public.project_tasks (workspace_id, id);

-- functions and row rules exactly as they were before 0051

create or replace function private.permission_decision(ws uuid, uid uuid, perm text, p_client uuid default null, p_project uuid default null)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  p public.permissions; mrole text; pclient uuid := p_client; v_src text;
begin
  select * into p from public.permissions where key = perm;
  if p.key is null then return 'deny:unknown-permission'; end if;
  select m.role into mrole from public.memberships m
   where m.workspace_id = ws and m.user_id = uid and m.kind = 'staff' and m.status = 'active';
  if mrole is null then return 'deny:not-a-member'; end if;
  if p.app_key <> 'platform' and not exists (
       select 1 from public.workspace_apps wa join public.apps a on a.key = wa.app_key
       where wa.workspace_id = ws and wa.app_key = p.app_key and wa.enabled and a.lifecycle in ('active', 'deprecated'))
     or (p.app_key <> 'platform' and private.role_rank(mrole) < 3 and not exists (
       select 1 from public.app_grants g where g.workspace_id = ws and g.user_id = uid and g.app_key = p.app_key)) then
    return 'deny:app-not-available';
  end if;
  if private.role_rank(mrole) < private.role_rank(p.floor_role) then return 'deny:role-floor-' || p.floor_role; end if;
  if mrole = 'owner' and p.app_key = 'platform' and perm like 'platform.%' then return 'allow:owner-recovery'; end if;
  if p_project is not null and pclient is null then
    select pr.client_id into pclient from public.projects pr where pr.workspace_id = ws and pr.id = p_project;
  end if;

  with principals as (
         select 'user'::text t, uid id
         union all select 'group', gm.group_id from public.group_members gm where gm.workspace_id = ws and gm.user_id = uid),
       grants as (
         select o.effect, 'override' || coalesce(':' || o.reason, '') src, o.client_id, o.project_id
           from public.permission_overrides o join principals pr on pr.t = o.principal_type and pr.id = o.principal_id
          where o.workspace_id = ws and o.permission_key = perm and (o.expires_at is null or o.expires_at > now())
         union all
         select alp.effect, 'level:' || l.name, a.client_id, a.project_id
           from public.access_assignments a join principals pr on pr.t = a.principal_type and pr.id = a.principal_id
           join public.access_levels l on l.id = a.access_level_id and l.retired_at is null
           join public.access_level_permissions alp on alp.access_level_id = l.id and alp.permission_key = perm
          where a.workspace_id = ws and (a.expires_at is null or a.expires_at > now())),
       applicable as (   -- a grant applies when its scope contains the requested resource
         select * from grants g
          where (g.client_id is null and g.project_id is null)
             or (g.client_id is not null and g.client_id = pclient)
             or (g.project_id is not null and g.project_id = p_project))
  select case when exists (select 1 from applicable where effect = 'deny')
              then 'deny:' || (select src from applicable where effect = 'deny' limit 1)
              when exists (select 1 from applicable where effect = 'allow')
              then 'allow:' || (select src from applicable where effect = 'allow' limit 1) end
    into v_src;
  if v_src is not null then return v_src; end if;
  if private.role_rank(mrole) >= private.role_rank(p.default_role) then return 'allow:role-' || mrole; end if;
  return 'deny:no-grant';
end $$;

create or replace function public.my_permissions()
returns table (permission_key text, scope text, client_id uuid, project_id uuid)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); r text := private.request_org(); ws uuid;
begin
  if uid is null or r is null or r !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return; end if;
  ws := r::uuid;
  if not private.is_staff(ws) then return; end if;
  return query
    select p.key, 'workspace'::text, null::uuid, null::uuid
      from public.permissions p where private.permission_decision(ws, uid, p.key, null, null) like 'allow:%';
  return query
    select p.key, 'client'::text, c.id, null::uuid
      from public.permissions p cross join public.clients c
     where c.workspace_id = ws and 'client' = any (p.scopes)
       and private.permission_decision(ws, uid, p.key, null, null) not like 'allow:%'
       and private.permission_decision(ws, uid, p.key, c.id, null) like 'allow:%';
  return query
    select p.key, 'project'::text, null::uuid, pr.id
      from public.permissions p cross join public.projects pr
     where pr.workspace_id = ws and 'project' = any (p.scopes)
       and private.permission_decision(ws, uid, p.key, null, null) not like 'allow:%'
       and (pr.client_id is null or private.permission_decision(ws, uid, p.key, pr.client_id, null) not like 'allow:%')
       and private.permission_decision(ws, uid, p.key, null, pr.id) like 'allow:%';
end $$;

create or replace function private.refuse_delete_with_work() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'clients' and (
       exists (select 1 from public.projects where client_id = old.id)
    or exists (select 1 from public.files where client_id = old.id)
    or exists (select 1 from public.brand_base_answers where client_id = old.id)
    or exists (select 1 from public.funnel_avatars where client_id = old.id)
    or exists (select 1 from public.funnel_offers where client_id = old.id)
    or exists (select 1 from public.funnel_stories where client_id = old.id)
    or exists (select 1 from public.funnel_brand_kits where client_id = old.id)
    or exists (select 1 from public.funnel_references where client_id = old.id)
    or exists (select 1 from public.client_notes where client_id = old.id)
    or exists (select 1 from public.client_requests where client_id = old.id)
    or exists (select 1 from public.client_updates where client_id = old.id)
    or exists (select 1 from public.approvals a join public.files f on f.id = a.subject_id where f.client_id = old.id)) then
    raise exception 'archive this client instead: it still has work' using errcode = 'P0001';
  end if;
  return old;
end $$;

create or replace function private.files_context_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare pc uuid; found boolean := false;
begin
  if tg_op = 'UPDATE' and new.project_id is distinct from old.project_id then
    raise exception 'records do not move' using errcode = 'P0001';
  end if;
  if new.project_id is not null then
    select true, p.client_id into found, pc from public.projects p where p.workspace_id = new.workspace_id and p.id = new.project_id;
    if not coalesce(found, false) then raise exception 'that project is not here' using errcode = '23503'; end if;
    if new.space = 'personal' then raise exception 'a personal file cannot belong to a project' using errcode = 'P0001'; end if;
    if pc is distinct from new.client_id then
      raise exception 'a file in a project lives in the project''s own place: the client''s space for a client project, the shared Drive for an internal one' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

create or replace function private.planner_links_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); oc uuid; tc uuid; ofound boolean; tfound boolean;
begin
  select true, o.client_id into ofound, oc from public.planner_objectives o where o.workspace_id = new.workspace_id and o.id = new.objective_id;
  select true, t.client_id into tfound, tc from public.project_tasks t where t.workspace_id = new.workspace_id and t.id = new.task_id;
  if ofound is not true or tfound is not true then raise exception 'not found' using errcode = '42501'; end if;
  if oc is not null and tc is distinct from oc then raise exception 'a client''s objective can only use that client''s tasks' using errcode = 'P0001'; end if;
  if uid is not null then new.created_by := uid; end if;
  return new;
end $$;

create or replace function private.planner_goal_row(g public.planner_goals) returns jsonb
language sql stable set search_path = '' as $$
  select to_jsonb(g) - 'created_by' || jsonb_build_object(
    'owner_name', (select coalesce(nullif(btrim(p.display_name), ''), 'Member ' || left(g.owner_id::text, 4)) from public.profiles p where p.id = g.owner_id),
    'type_name', (select t.name from public.planner_goal_types t where t.id = g.goal_type_id),
    'uses_measure', (select t.uses_measure from public.planner_goal_types t where t.id = g.goal_type_id),
    'child_count', (select count(*) from public.planner_goals c where c.parent_goal_id = g.id and c.archived_at is null),
    'open_actions', (select count(*) from public.planner_actions a where a.goal_id = g.id and a.archived_at is null and a.status <> 'done'),
    'total_actions', (select count(*) from public.planner_actions a where a.goal_id = g.id and a.archived_at is null),
    'open_risks', (select count(*) from public.planner_risks r where r.goal_id = g.id and r.archived_at is null and r.status <> 'closed'),
    'max_risk', (select max(r.severity) from public.planner_risks r where r.goal_id = g.id and r.archived_at is null and r.status <> 'closed'),
    'measure', (select jsonb_build_object('id', m.id, 'name', m.name, 'unit', m.unit, 'current', m.current_value, 'target', m.target_value,
                                           'start', m.start_value, 'direction', m.direction)
                  from public.planner_kpis m where m.goal_id = g.id and m.archived_at is null order by m.created_at limit 1),
    'project', (select jsonb_build_object('id', pr.id, 'name', pr.name) from public.projects pr where pr.id = g.project_id),
    'project_restricted', g.project_id is not null and not exists (select 1 from public.projects pr where pr.id = g.project_id)
  )
$$;

create or replace function private.portal_subject(ws uuid, t text, sid uuid, out s_ok boolean, out s_client uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  s_ok := null; s_client := null;
  if t = 'request' then select true, r.client_id into s_ok, s_client from public.client_requests r where r.workspace_id = ws and r.id = sid and r.client_visible and r.archived_at is null;
  elsif t = 'file' then select true, f.client_id into s_ok, s_client from public.files f where f.workspace_id = ws and f.id = sid and f.client_visible and f.archived_at is null;
  elsif t = 'approval' then select true, a.client_id into s_ok, s_client from public.approvals a where a.workspace_id = ws and a.id = sid and a.client_visible;
  elsif t = 'project' then select true, p.client_id into s_ok, s_client from public.projects p where p.workspace_id = ws and p.id = sid and p.client_visible and p.archived_at is null;
  end if;
end $$;

create or replace function private.approval_subject(ws uuid, t text, sid uuid, out s_found boolean, out s_client uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  s_found := null; s_client := null;
  if t in ('deliverable', 'file', 'document') then select true, f.client_id into s_found, s_client from public.files f where f.workspace_id = ws and f.id = sid;
  elsif t = 'project' then select true, p.client_id into s_found, s_client from public.projects p where p.workspace_id = ws and p.id = sid;
  elsif t = 'task' then select true, k.client_id into s_found, s_client from public.project_tasks k where k.workspace_id = ws and k.id = sid;
  elsif t = 'form' then select true, f.client_id into s_found, s_client from public.forms f where f.workspace_id = ws and f.id = sid;
  elsif t = 'post' then select true, p.client_id into s_found, s_client from public.social_posts p where p.workspace_id = ws and p.id = sid and p.archived_at is null;
  else s_found := true;
  end if;
end $$;

drop policy files_project_context on public.files;
create policy files_project_context on public.files as restrictive for all
  using (project_id is null or exists (select 1 from public.projects p where p.workspace_id = files.workspace_id and p.id = files.project_id))
  with check (project_id is null or exists (select 1 from public.projects p where p.workspace_id = files.workspace_id and p.id = files.project_id));

drop policy planner_links_insert on public.planner_objective_tasks;
create policy planner_links_insert on public.planner_objective_tasks for insert with check (
  private.has_permission(workspace_id, 'planner.objective.edit', (select o.client_id from public.planner_objectives o where o.workspace_id = planner_objective_tasks.workspace_id and o.id = planner_objective_tasks.objective_id))
  and exists (select 1 from public.project_tasks t where t.workspace_id = planner_objective_tasks.workspace_id and t.id = planner_objective_tasks.task_id));

drop policy appr_insert on public.approvals;
create policy appr_insert on public.approvals for insert with check (
  private.has_permission(workspace_id, 'approvals.request.create', client_id) and requested_by = private.current_user_id()
  and status = 'pending' and decided_by is null and decided_at is null
  and case when subject_type in ('deliverable', 'file', 'document') then exists (select 1 from public.files f where f.workspace_id = approvals.workspace_id and f.id = approvals.subject_id)
           when subject_type = 'project' then exists (select 1 from public.projects p where p.workspace_id = approvals.workspace_id and p.id = approvals.subject_id)
           when subject_type = 'task' then exists (select 1 from public.project_tasks k where k.workspace_id = approvals.workspace_id and k.id = approvals.subject_id)
           else true end);

drop policy client_read on public.pm_projects;
drop policy client_read on public.pm_tasks;

-- the copied rows only (same ids as the old records); Projects V2 work created after the cutover stays
delete from public.pm_rules r where exists (select 1 from public.project_rules o where o.id = r.id);
delete from public.pm_projects p where exists (select 1 from public.projects o where o.id = p.id);
delete from public.pm_tags g where exists (select 1 from public.project_tags o where o.id = g.id)
  and not exists (select 1 from public.pm_task_tags tt where tt.tag_id = g.id);

commit;
