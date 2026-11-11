set check_function_bodies = off;
-- 0051 · Projects cutover (owner decision 11 Nov 2026: one project system; V2 replaces the old Projects data).
-- 1. Copies every old Projects record into Projects V2 with THE SAME IDs: projects, sections, tasks (with parents),
--    assignees, tags, checklists, dependencies, time, task files (Drive links), rules and followers.
-- 2. Points everything that referred to the old tables at Projects V2: Drive (files.project_id), the permission system
--    (project-scoped grants and overrides, project scope in permission checks and "my permissions"), Planner (goals,
--    actions, objective links), Approvals / Forms / Social (subjects), the Client Portal (shared projects, tasks, messages)
--    and the "a client with work cannot be deleted" rule.
-- 3. KEEPS the old tables and their data untouched as a backup (no drop, no delete). Undo: scripts/rollback-0051.sql.
-- Runs as the migration role (no request organization, row security bypassed), in one transaction: all or nothing.

-- ───────────── 1. data, same IDs ─────────────
-- Rule automation must not act on records being moved: the after-trigger is deferred to commit; make it run at once
-- (there are no V2 rules yet when tasks are copied; the old rules are copied last).
set constraints pm_tasks_automate_after immediate;

insert into public.pm_projects (id, workspace_id, client_id, name, description, color, status, visibility, owner_id, start_on, due_on,
                                is_template, is_personal, archived_at, created_by, created_at, updated_at, client_visible)
select p.id, p.workspace_id, p.client_id, left(btrim(p.name), 120), coalesce(p.description, ''), '#2b5ce6',
       case p.status when 'on_hold' then 'on_hold' when 'done' then 'complete' else 'on_track' end,
       'organization',                                  -- everyone with the Projects app saw these before; they still do
       coalesce(p.owner_id, p.created_by), p.start_on, case when p.start_on is not null and p.due_on < p.start_on then p.start_on else p.due_on end,
       coalesce(p.is_template, false), false, p.archived_at, p.created_by, p.created_at, p.updated_at,
       coalesce(p.client_visible, false) and p.client_id is not null
from public.projects p
where not exists (select 1 from public.pm_projects x where x.id = p.id);

-- the owner (or creator) manages each moved project, when they are still a member of the organization
insert into public.pm_project_members (workspace_id, project_id, user_id, role)
select p.workspace_id, p.id, p.owner_id, 'manager' from public.pm_projects p
where p.owner_id is not null and exists (select 1 from public.projects o where o.id = p.id)
  and exists (select 1 from public.memberships m where m.workspace_id = p.workspace_id and m.user_id = p.owner_id)
on conflict do nothing;

insert into public.pm_sections (id, workspace_id, project_id, name, position, created_at)
select s.id, s.workspace_id, s.project_id, left(btrim(s.name), 80), s.position, s.created_at
from public.project_sections s where not exists (select 1 from public.pm_sections x where x.id = s.id);

-- tasks: parents first, then subtasks (numbers follow creation order within each project)
insert into public.pm_tasks (id, workspace_id, project_id, section_id, parent_id, number, title, description, status, priority, start_on, due_on,
                             estimate_minutes, repeat_rule, position, deleted_at, created_by, created_at, updated_at, client_visible)
select t.id, t.workspace_id, t.project_id, t.section_id, null, 0, left(btrim(t.title), 300), coalesce(t.notes, ''),
       case t.status when 'doing' then 'in_progress' else t.status end,
       case t.priority when 'normal' then 'medium' else t.priority end,
       case when t.start_on is not null and t.due_on is not null and t.start_on > t.due_on then t.due_on else t.start_on end, t.due_on,
       t.estimate_minutes, t.repeat, t.position, t.archived_at, t.created_by, t.created_at, t.updated_at,
       coalesce(t.client_visible, false) and exists (select 1 from public.pm_projects pp where pp.id = t.project_id and pp.client_visible)
from public.project_tasks t
where t.parent_task_id is null and not exists (select 1 from public.pm_tasks x where x.id = t.id)
order by t.project_id, t.created_at, t.id;
insert into public.pm_tasks (id, workspace_id, project_id, section_id, parent_id, number, title, description, status, priority, start_on, due_on,
                             estimate_minutes, repeat_rule, position, deleted_at, created_by, created_at, updated_at, client_visible)
select t.id, t.workspace_id, t.project_id, t.section_id, t.parent_task_id, 0, left(btrim(t.title), 300), coalesce(t.notes, ''),
       case t.status when 'doing' then 'in_progress' else t.status end,
       case t.priority when 'normal' then 'medium' else t.priority end,
       case when t.start_on is not null and t.due_on is not null and t.start_on > t.due_on then t.due_on else t.start_on end, t.due_on,
       t.estimate_minutes, t.repeat, t.position, t.archived_at, t.created_by, t.created_at, t.updated_at,
       coalesce(t.client_visible, false) and exists (select 1 from public.pm_projects pp where pp.id = t.project_id and pp.client_visible)
from public.project_tasks t
where t.parent_task_id is not null and not exists (select 1 from public.pm_tasks x where x.id = t.id)
order by t.project_id, t.created_at, t.id;
-- the guard numbers tasks on insert and stamps completed_at/updated_at; keep the original timestamps
update public.pm_tasks n set completed_at = o.completed_at, updated_at = o.updated_at
from public.project_tasks o where o.id = n.id and n.status = 'done';

insert into public.pm_task_assignees (workspace_id, project_id, task_id, user_id)
select t.workspace_id, t.project_id, t.id, t.assignee_id from public.project_tasks t
where t.assignee_id is not null and exists (select 1 from public.memberships m where m.workspace_id = t.workspace_id and m.user_id = t.assignee_id)
on conflict do nothing;

insert into public.pm_tags (id, workspace_id, name, color)
select g.id, g.workspace_id, left(btrim(g.name), 40),
       case g.color when 'blue' then '#2b5ce6' when 'green' then '#1d6b52' when 'amber' then '#b07a00' when 'red' then '#b42318'
                    when 'violet' then '#6a3fc9' when 'teal' then '#0e7c86' when 'pink' then '#a33b6b' else '#64748b' end   -- the old app named its eight colours
from public.project_tags g
where not exists (select 1 from public.pm_tags x where x.id = g.id)
  and not exists (select 1 from public.pm_tags x where x.workspace_id = g.workspace_id and lower(x.name) = lower(btrim(g.name)));
insert into public.pm_task_tags (task_id, tag_id)
select tt.task_id, tt.tag_id from public.task_tags tt where exists (select 1 from public.pm_tags g where g.id = tt.tag_id)
on conflict do nothing;

insert into public.pm_checklist_items (id, task_id, label, done, position, created_at)
select c.id, c.task_id, left(btrim(c.label), 500), c.done, c.position, c.created_at from public.task_checklist_items c
where not exists (select 1 from public.pm_checklist_items x where x.id = c.id);

insert into public.pm_dependencies (task_id, depends_on_id)
select d.task_id, d.depends_on_id from public.task_dependencies d on conflict do nothing;

-- time: finished entries only (a running old timer is closed at its start; nothing is invented)
insert into public.pm_time_entries (id, task_id, user_id, started_at, ended_at, note, billable, created_at)
select e.id, e.task_id, e.user_id, e.started_at,
       least(coalesce(e.ended_at, e.started_at), e.started_at + interval '24 hours'), coalesce(e.note, ''), e.billable, e.created_at
from public.time_entries e
where e.task_id is not null and not exists (select 1 from public.pm_time_entries x where x.id = e.id);

-- Drive files attached to tasks stay the same Drive files (task_files → pm_attachments)
insert into public.pm_attachments (task_id, file_id, uploaded_by, created_at)
select tf.task_id, tf.file_id, coalesce(tf.created_by, f.uploaded_by), tf.created_at
from public.task_files tf join public.files f on f.workspace_id = tf.workspace_id and f.id = tf.file_id
where f.kind in ('file', 'document') and f.space <> 'personal'
on conflict (task_id, file_id) do nothing;

-- followers: the shared service, same task ids, now as Projects V2 tasks
insert into public.follows (workspace_id, entity_type, entity_id, user_id, created_at)
select f.workspace_id, 'pm_task', f.entity_id, f.user_id, f.created_at from public.follows f
where f.entity_type = 'project_task' and exists (select 1 from public.pm_tasks t where t.id = f.entity_id)
on conflict do nothing;

-- comments on old tasks (the shared service) move with their task; notifications and history follow
update public.comments c set entity_type = 'pm_task' where c.entity_type = 'project_task' and exists (select 1 from public.pm_tasks t where t.id = c.entity_id);
update public.notifications n set entity_type = 'pm_task' where n.entity_type = 'project_task' and exists (select 1 from public.pm_tasks t where t.id = n.entity_id);
update public.activity_events a set entity_type = 'pm_task' where a.entity_type = 'project_task' and exists (select 1 from public.pm_tasks t where t.id = a.entity_id);

-- rules last (copying them must not act on the moved tasks); a section rule needs its section
-- The rules guard asks "can the assignee see this project?" for the signed-in organization, which a migration has none of;
-- these rules were checked when they were made, and the assignee must still be a member (below and by foreign key).
alter table public.pm_rules disable trigger pm_rules_guard;
insert into public.pm_rules (id, workspace_id, project_id, trigger, trigger_status, trigger_section, action, assignee_id, priority, due_in_days, tag_id, enabled, created_by, created_at, updated_at)
select r.id, r.workspace_id, r.project_id, r.trigger,
       case r.trigger_status when 'doing' then 'in_progress' else r.trigger_status end, r.trigger_section, r.action, r.assignee_id,
       case r.priority when 'normal' then 'medium' else r.priority end, r.due_in_days,
       case when exists (select 1 from public.pm_tags g where g.id = r.tag_id) then r.tag_id end, r.enabled, r.created_by, r.created_at, r.updated_at
from public.project_rules r
where not exists (select 1 from public.pm_rules x where x.id = r.id)
  and (r.action <> 'tag' or exists (select 1 from public.pm_tags g where g.id = r.tag_id))
  and (r.assignee_id is null or exists (select 1 from public.memberships m where m.workspace_id = r.workspace_id and m.user_id = r.assignee_id));

alter table public.pm_rules enable trigger pm_rules_guard;

set constraints pm_tasks_automate_after deferred;

-- ───────────── 2. references now point at Projects V2 ─────────────
alter table public.files drop constraint files_project_fk,
  add constraint files_project_fk foreign key (workspace_id, project_id) references public.pm_projects (workspace_id, id);
alter table public.access_assignments drop constraint access_assignments_workspace_id_project_id_fkey,
  add constraint access_assignments_workspace_id_project_id_fkey foreign key (workspace_id, project_id) references public.pm_projects (workspace_id, id) on delete cascade;
alter table public.permission_overrides drop constraint permission_overrides_workspace_id_project_id_fkey,
  add constraint permission_overrides_workspace_id_project_id_fkey foreign key (workspace_id, project_id) references public.pm_projects (workspace_id, id) on delete cascade;
alter table public.planner_goals drop constraint planner_goals_workspace_id_project_id_fkey,
  add constraint planner_goals_workspace_id_project_id_fkey foreign key (workspace_id, project_id) references public.pm_projects (workspace_id, id);
alter table public.planner_actions drop constraint planner_actions_workspace_id_project_id_fkey,
  add constraint planner_actions_workspace_id_project_id_fkey foreign key (workspace_id, project_id) references public.pm_projects (workspace_id, id);
alter table public.planner_objective_tasks drop constraint planner_objective_tasks_workspace_id_task_id_fkey,
  add constraint planner_objective_tasks_workspace_id_task_id_fkey foreign key (workspace_id, task_id) references public.pm_tasks (workspace_id, id);

-- permission checks scoped to a project read the project's client from Projects V2
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
    select pr.client_id into pclient from public.pm_projects pr where pr.workspace_id = ws and pr.id = p_project;
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

-- "my permissions" lists project-scoped grants on Projects V2 projects
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
      from public.permissions p cross join public.pm_projects pr
     where pr.workspace_id = ws and 'project' = any (p.scopes) and not pr.is_personal
       and private.permission_decision(ws, uid, p.key, null, null) not like 'allow:%'
       and (pr.client_id is null or private.permission_decision(ws, uid, p.key, pr.client_id, null) not like 'allow:%')
       and private.permission_decision(ws, uid, p.key, null, pr.id) like 'allow:%';
end $$;

-- a client that still has projects (old or Projects V2) cannot be deleted: archive it instead
create or replace function private.refuse_delete_with_work() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'clients' and (
       exists (select 1 from public.projects where client_id = old.id)
    or exists (select 1 from public.pm_projects where client_id = old.id)
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

-- Drive: a file filed under a project belongs to a Projects V2 project (personal projects have no Drive files)
create or replace function private.files_context_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare pc uuid; found boolean := false; personal boolean;
begin
  if tg_op = 'UPDATE' and new.project_id is distinct from old.project_id then
    raise exception 'records do not move' using errcode = 'P0001';
  end if;
  if new.project_id is not null then
    select true, p.client_id, p.is_personal into found, pc, personal from public.pm_projects p where p.workspace_id = new.workspace_id and p.id = new.project_id;
    if not coalesce(found, false) or personal then raise exception 'that project is not here' using errcode = '23503'; end if;
    if new.space = 'personal' then raise exception 'a personal file cannot belong to a project' using errcode = 'P0001'; end if;
    if pc is distinct from new.client_id then
      raise exception 'a file in a project lives in the project''s own place: the client''s space for a client project, the shared Drive for an internal one' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
drop policy files_project_context on public.files;
create policy files_project_context on public.files as restrictive for all
  using (project_id is null or exists (select 1 from public.pm_projects p where p.workspace_id = files.workspace_id and p.id = files.project_id))
  with check (project_id is null or exists (select 1 from public.pm_projects p where p.workspace_id = files.workspace_id and p.id = files.project_id));

-- Planner: objectives link Projects V2 tasks; a client's objective only that client's tasks
create or replace function private.planner_links_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); oc uuid; tc uuid; ofound boolean; tfound boolean;
begin
  select true, o.client_id into ofound, oc from public.planner_objectives o where o.workspace_id = new.workspace_id and o.id = new.objective_id;
  select true, p.client_id into tfound, tc from public.pm_tasks t join public.pm_projects p on p.id = t.project_id
   where t.workspace_id = new.workspace_id and t.id = new.task_id and t.deleted_at is null;
  if ofound is not true or tfound is not true then raise exception 'not found' using errcode = '42501'; end if;
  if oc is not null and tc is distinct from oc then raise exception 'a client''s objective can only use that client''s tasks' using errcode = 'P0001'; end if;
  if uid is not null then new.created_by := uid; end if;
  return new;
end $$;
drop policy planner_links_insert on public.planner_objective_tasks;
create policy planner_links_insert on public.planner_objective_tasks for insert with check (
  private.has_permission(workspace_id, 'planner.objective.edit', (select o.client_id from public.planner_objectives o where o.workspace_id = planner_objective_tasks.workspace_id and o.id = planner_objective_tasks.objective_id))
  and exists (select 1 from public.pm_tasks t where t.workspace_id = planner_objective_tasks.workspace_id and t.id = planner_objective_tasks.task_id));      -- the person must be able to see the task they link

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
    'project', (select jsonb_build_object('id', pr.id, 'name', pr.name) from public.pm_projects pr where pr.id = g.project_id),
    'project_restricted', g.project_id is not null and not exists (select 1 from public.pm_projects pr where pr.id = g.project_id)
  )
$$;

-- Client Portal: shared Projects V2 projects (a message thread on one, too)
create or replace function private.portal_subject(ws uuid, t text, sid uuid, out s_ok boolean, out s_client uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  s_ok := null; s_client := null;
  if t = 'request' then select true, r.client_id into s_ok, s_client from public.client_requests r where r.workspace_id = ws and r.id = sid and r.client_visible and r.archived_at is null;
  elsif t = 'file' then select true, f.client_id into s_ok, s_client from public.files f where f.workspace_id = ws and f.id = sid and f.client_visible and f.archived_at is null;
  elsif t = 'approval' then select true, a.client_id into s_ok, s_client from public.approvals a where a.workspace_id = ws and a.id = sid and a.client_visible;
  elsif t = 'project' then select true, p.client_id into s_ok, s_client from public.pm_projects p where p.workspace_id = ws and p.id = sid and p.client_visible and p.archived_at is null and p.deleted_at is null;
  end if;
end $$;

-- Approvals, Forms and Social subjects: a project or task is a Projects V2 one
create or replace function private.approval_subject(ws uuid, t text, sid uuid, out s_found boolean, out s_client uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  s_found := null; s_client := null;
  if t in ('deliverable', 'file', 'document') then select true, f.client_id into s_found, s_client from public.files f where f.workspace_id = ws and f.id = sid;
  elsif t = 'project' then select true, p.client_id into s_found, s_client from public.pm_projects p where p.workspace_id = ws and p.id = sid and not p.is_personal;
  elsif t = 'task' then select true, p.client_id into s_found, s_client from public.pm_tasks k join public.pm_projects p on p.id = k.project_id where k.workspace_id = ws and k.id = sid and not p.is_personal;
  elsif t = 'form' then select true, f.client_id into s_found, s_client from public.forms f where f.workspace_id = ws and f.id = sid;
  elsif t = 'post' then select true, p.client_id into s_found, s_client from public.social_posts p where p.workspace_id = ws and p.id = sid and p.archived_at is null;
  else s_found := true;
  end if;
end $$;
drop policy appr_insert on public.approvals;
create policy appr_insert on public.approvals for insert with check (
  private.has_permission(workspace_id, 'approvals.request.create', client_id) and requested_by = private.current_user_id()
  and status = 'pending' and decided_by is null and decided_at is null
  and case when subject_type in ('deliverable', 'file', 'document') then exists (select 1 from public.files f where f.workspace_id = approvals.workspace_id and f.id = approvals.subject_id)
           when subject_type = 'project' then exists (select 1 from public.pm_projects p where p.workspace_id = approvals.workspace_id and p.id = approvals.subject_id)
           when subject_type = 'task' then exists (select 1 from public.pm_tasks k where k.workspace_id = approvals.workspace_id and k.id = approvals.subject_id)
           else true end);                                -- the person must be able to see what they ask about

-- Client Portal readers (client accounts) see what was shared with their client, and nothing else; staff rules unchanged
create policy client_read on public.pm_projects for select using (
  client_visible and archived_at is null and deleted_at is null and not is_personal and client_id is not null and private.client_of(workspace_id, client_id));
create policy client_read on public.pm_tasks for select using (
  client_visible and deleted_at is null
  and exists (select 1 from public.pm_projects p where p.id = pm_tasks.project_id and p.client_visible and p.archived_at is null and p.deleted_at is null
              and p.client_id is not null and private.client_of(p.workspace_id, p.client_id)));

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all functions in schema public from %I', r);
      execute format('revoke all on all functions in schema private from %I', r);
    end if;
  end loop;
end $$;
