set check_function_bodies = off;
-- 0004 · Shared authorization foundation (Owner-Controlled App-Level Authorization rule), client/project
-- scoping (WCIGA: access to one client never grants another), data protection (App Foundation rule:
-- no silent loss), actor attribution (integration vs user), and the full 11-app registry with lifecycle.
-- Terminology: a row in `workspaces` is an ORGANIZATION context (Layer2Funnels, Aurj). See docs/ARCHITECTURE.md.
--
-- Decision order for private.has_permission (documented in docs/ARCHITECTURE.md §3, tested AZ*):
--   0 not an active staff member, or the app is not usable  -> deny
--   1 membership role below the permission's FLOOR          -> deny   (a viewer can never write)
--   2 owner + platform.* permission                         -> allow  (lockout recovery)
--   3 any explicit DENY at the same or a broader scope      -> deny   (restrictions beat convenience roles)
--   4 any explicit ALLOW (access level or override) in scope -> allow
--   5 role >= the permission's DEFAULT role                 -> allow
--   6 otherwise                                             -> deny   (new permissions default to owner only)
-- Scopes: workspace (whole organization) > client > project. A client-scoped grant covers that client's projects.

-- ------------------------------------------------------------------ app registry: all 11 apps + lifecycle
alter table public.apps add column lifecycle text not null default 'active'
  check (lifecycle in ('active', 'coming_soon', 'deprecated', 'retired'));
insert into public.apps (key, name, scope, standalone_capable, sort_order, lifecycle) values
  ('forms',          'Form Builder',   'shared', true,  45, 'coming_soon'),
  ('value_ladder',   'Value Ladder',   'shared', false, 55, 'coming_soon'),
  ('social_planner', 'Social Planner', 'shared', true,  65, 'coming_soon'),
  ('whiteboard',     'Whiteboard',     'shared', true,  70, 'coming_soon'),
  ('layer2_agents',  'Layer 2 Agents', 'shared', false, 95, 'coming_soon');

-- A retired or coming-soon app never grants data access; disabling an app never deletes its data.
create or replace function private.can_use_app(ws uuid, app text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workspace_apps wa join public.apps a on a.key = wa.app_key
                 where wa.workspace_id = ws and wa.app_key = app and wa.enabled
                   and a.lifecycle in ('active', 'deprecated'))
     and (private.has_role(ws, 'admin')
          or (private.has_role(ws, 'viewer') and exists (
                select 1 from public.app_grants g
                where g.workspace_id = ws and g.user_id = private.current_user_id() and g.app_key = app)))
$$;

drop function public.launcher_apps(uuid);
create function public.launcher_apps(p_workspace uuid)
returns table (app_key text, name text, scope text, launch_url text, lifecycle text)
language sql stable security definer set search_path = '' as $$
  select a.key, a.name, a.scope, wa.launch_url, a.lifecycle
  from public.apps a join public.workspace_apps wa on wa.app_key = a.key and wa.workspace_id = p_workspace
  where wa.enabled and (
        (a.lifecycle = 'coming_soon' and private.is_staff(p_workspace))
     or (a.lifecycle in ('active', 'deprecated') and a.scope <> 'portal' and private.can_use_app(p_workspace, a.key))
     or (a.lifecycle = 'active' and a.scope = 'portal' and exists (select 1 from public.memberships m
           where m.workspace_id = p_workspace and m.user_id = private.current_user_id()
             and m.kind = 'client' and m.status = 'active')))
  order by a.sort_order
$$;

-- ------------------------------------------------------------------ permission catalog
create table public.permissions (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  app_key text not null references public.apps(key),
  description text not null,
  floor_role text not null default 'viewer' check (floor_role in ('viewer', 'editor', 'admin', 'owner')),
  default_role text not null default 'owner' check (default_role in ('viewer', 'editor', 'admin', 'owner')),
  scopes text[] not null default '{workspace}',
  sensitive boolean not null default false,
  check (private.role_rank(default_role) >= private.role_rank(floor_role)),
  check (scopes <@ array['workspace', 'client', 'project'])
);
-- 'platform' is a pseudo-app for ecosystem-wide permissions.
insert into public.apps (key, name, scope, sort_order, lifecycle) values ('platform', 'Platform', 'shared', 0, 'active');
insert into public.permissions (key, app_key, description, floor_role, default_role, scopes, sensitive) values
  ('platform.access.manage',      'platform', 'Define access levels, groups, assignments and restrictions', 'admin', 'owner', '{workspace}', true),
  ('platform.access.review',      'platform', 'See effective access of other members',                   'admin', 'admin', '{workspace}', true),
  ('clients.client.view',         'clients',  'View a client record',                                     'viewer', 'admin', '{workspace,client}', false),
  ('clients.client.create',       'clients',  'Create a client record',                                   'editor', 'admin', '{workspace}', false),
  ('clients.client.edit',         'clients',  'Edit or archive a client record',                          'editor', 'admin', '{workspace,client}', false),
  ('clients.client.delete',       'clients',  'Permanently delete an EMPTY client record',                'admin',  'owner', '{workspace}', true),
  ('clients.brandbase.view',      'clients',  'View Brand Base answers',                                  'viewer', 'admin', '{workspace,client}', true),
  ('clients.brandbase.edit',      'clients',  'Edit Brand Base answers',                                  'editor', 'admin', '{workspace,client}', true),
  ('projects.project.view',       'projects', 'View a project',                                           'viewer', 'admin', '{workspace,client,project}', false),
  ('projects.project.create',     'projects', 'Create a project',                                         'editor', 'admin', '{workspace,client}', false),
  ('projects.project.edit',       'projects', 'Edit or archive a project',                                'editor', 'admin', '{workspace,client,project}', false),
  ('projects.project.delete',     'projects', 'Permanently delete an EMPTY project',                      'admin',  'owner', '{workspace}', true),
  ('drive.file.view',             'drive',    'View and download organization files',                     'viewer', 'viewer', '{workspace,client}', false),
  ('drive.file.upload',           'drive',    'Upload files',                                             'editor', 'editor', '{workspace,client}', false),
  ('drive.file.share',            'drive',    'Change file visibility (client sharing)',                  'editor', 'editor', '{workspace,client}', true),
  ('drive.file.delete_any',       'drive',    'Delete files uploaded by others',                          'admin',  'admin', '{workspace}', true),
  ('approvals.request.create',    'platform', 'Request an approval',                                      'editor', 'editor', '{workspace,client}', false),
  ('approvals.request.decide',    'platform', 'Approve or reject requests made by others',                'editor', 'admin', '{workspace,client}', true),
  ('integrations.connection.manage','platform','Create, change or disconnect integrations',               'admin',  'admin', '{workspace}', true);

-- ------------------------------------------------------------------ principals, levels, assignments, overrides
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null, description text,
  created_at timestamptz not null default now(),
  unique (workspace_id, name), unique (workspace_id, id)
);
create table public.group_members (
  workspace_id uuid not null,
  group_id uuid not null,
  user_id uuid not null,
  added_by uuid,
  primary key (group_id, user_id),
  foreign key (workspace_id, group_id) references public.groups (workspace_id, id) on delete cascade
);
create table public.access_levels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  app_key text not null references public.apps(key),
  name text not null, description text,
  is_template boolean not null default false,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, app_key, name), unique (workspace_id, id)
);
create table public.access_level_permissions (
  workspace_id uuid not null,
  access_level_id uuid not null,
  permission_key text not null references public.permissions(key),
  effect text not null default 'allow' check (effect in ('allow', 'deny')),
  primary key (access_level_id, permission_key),
  foreign key (workspace_id, access_level_id) references public.access_levels (workspace_id, id) on delete cascade
);
create table public.access_assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  access_level_id uuid not null,
  principal_type text not null check (principal_type in ('user', 'group')),
  principal_id uuid not null,
  client_id uuid, project_id uuid,
  granted_by uuid, reason text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  check (project_id is null or client_id is null),
  foreign key (workspace_id, access_level_id) references public.access_levels (workspace_id, id) on delete cascade,
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id) on delete cascade
);
create table public.permission_overrides (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  principal_type text not null check (principal_type in ('user', 'group')),
  principal_id uuid not null,
  permission_key text not null references public.permissions(key),
  effect text not null check (effect in ('allow', 'deny')),
  client_id uuid, project_id uuid,
  granted_by uuid, reason text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  check (project_id is null or client_id is null),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id) on delete cascade
);
alter table public.projects add constraint projects_workspace_id_id_key unique (workspace_id, id);
alter table public.access_assignments add foreign key (workspace_id, project_id) references public.projects (workspace_id, id) on delete cascade;
alter table public.permission_overrides add foreign key (workspace_id, project_id) references public.projects (workspace_id, id) on delete cascade;
create index on public.access_assignments (workspace_id, principal_id);
create index on public.permission_overrides (workspace_id, principal_id, permission_key);
create index on public.group_members (user_id);

-- An access level may only contain permissions of its own app (platform levels may hold platform permissions).
create or replace function private.alp_same_app() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.access_levels l join public.permissions p on p.key = new.permission_key
                 where l.id = new.access_level_id and p.app_key = l.app_key) then
    raise exception 'permission does not belong to this app' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger alp_same_app before insert or update on public.access_level_permissions
  for each row execute function private.alp_same_app();

-- ------------------------------------------------------------------ decision engine
-- Returns the reason for a decision, so the same code answers "may I?" and "why?" (effective access review).
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

create or replace function private.has_permission(ws uuid, perm text, p_client uuid default null, p_project uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.permission_decision(ws, private.current_user_id(), perm, p_client, p_project) like 'allow:%'
$$;

-- Effective access review: yourself always; others only with platform.access.review.
create or replace function public.effective_access(p_workspace uuid, p_user uuid default null, p_client uuid default null)
returns table (permission_key text, app_key text, allowed boolean, reason text)
language sql stable security definer set search_path = '' as $$
  select p.key, p.app_key, d like 'allow:%', d
  from public.permissions p
  cross join lateral (select private.permission_decision(p_workspace, coalesce(p_user, private.current_user_id()), p.key, p_client) d) x
  where coalesce(p_user, private.current_user_id()) = private.current_user_id()
     or private.has_permission(p_workspace, 'platform.access.review')
  order by p.key
$$;

-- ------------------------------------------------------------------ RLS for the foundation tables
do $$
declare t text;
begin
  foreach t in array array['permissions','groups','group_members','access_levels','access_level_permissions',
                           'access_assignments','permission_overrides'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;
create policy perm_select on public.permissions for select using (exists (
  select 1 from public.memberships m where m.user_id = private.current_user_id() and m.kind = 'staff' and m.status = 'active'));
-- Managing access is owner-controlled (delegable via platform.access.manage). Reviewing needs platform.access.review.
do $$
declare t text;
begin
  foreach t in array array['groups','group_members','access_levels','access_level_permissions','access_assignments','permission_overrides'] loop
    execute format($f$create policy %1$s_select on public.%1$I for select using (
      private.has_permission(workspace_id, 'platform.access.review')
      %2$s)$f$, t,
      case when t in ('access_assignments','permission_overrides') then
        'or (principal_type = ''user'' and principal_id = private.current_user_id())'
      when t = 'group_members' then 'or user_id = private.current_user_id()' else '' end);
    execute format('create policy %1$s_insert on public.%1$I for insert with check (private.has_permission(workspace_id, ''platform.access.manage''))', t);
    execute format('create policy %1$s_update on public.%1$I for update using (private.has_permission(workspace_id, ''platform.access.manage'')) with check (private.has_permission(workspace_id, ''platform.access.manage''))', t);
    execute format('create policy %1$s_delete on public.%1$I for delete using (private.has_permission(workspace_id, ''platform.access.manage''))', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I for each row execute function private.audit_change(%2$s)',
      t, case t when 'groups' then '''name'''
                when 'group_members' then '''group_id'', ''user_id'''
                when 'access_levels' then '''name'', ''app_key'', ''retired_at'''
                when 'access_level_permissions' then '''access_level_id'', ''permission_key'', ''effect'''
                when 'access_assignments' then '''access_level_id'', ''principal_type'', ''principal_id'', ''client_id'', ''project_id'', ''expires_at'''
                else '''permission_key'', ''effect'', ''principal_type'', ''principal_id'', ''client_id'', ''project_id'', ''expires_at''' end);
  end loop;
end $$;

-- ------------------------------------------------------------------ starter access levels per organization
create or replace function private.seed_access_levels(ws uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare lvl uuid;
begin
  insert into public.access_levels (workspace_id, app_key, name, description, is_template)
  values (ws, 'clients', 'Client team', 'Work on the clients you are assigned to (assign at client scope)', true) returning id into lvl;
  insert into public.access_level_permissions (workspace_id, access_level_id, permission_key)
  select ws, lvl, k from unnest(array['clients.client.view','clients.client.edit','clients.brandbase.view','clients.brandbase.edit']) k;
  insert into public.access_levels (workspace_id, app_key, name, description, is_template)
  values (ws, 'clients', 'All clients · edit', 'See and edit every client in this organization', true) returning id into lvl;
  insert into public.access_level_permissions (workspace_id, access_level_id, permission_key)
  select ws, lvl, k from unnest(array['clients.client.view','clients.client.create','clients.client.edit','clients.brandbase.view','clients.brandbase.edit']) k;
  insert into public.access_levels (workspace_id, app_key, name, description, is_template)
  values (ws, 'clients', 'All clients · read', 'See every client, change nothing', true) returning id into lvl;
  insert into public.access_level_permissions (workspace_id, access_level_id, permission_key) values (ws, lvl, 'clients.client.view');
  insert into public.access_levels (workspace_id, app_key, name, description, is_template)
  values (ws, 'projects', 'Project member', 'Work in the projects you are assigned to (assign at project or client scope)', true) returning id into lvl;
  insert into public.access_level_permissions (workspace_id, access_level_id, permission_key)
  select ws, lvl, k from unnest(array['projects.project.view','projects.project.edit']) k;
  insert into public.access_levels (workspace_id, app_key, name, description, is_template)
  values (ws, 'projects', 'All projects · edit', 'See, create and edit every project', true) returning id into lvl;
  insert into public.access_level_permissions (workspace_id, access_level_id, permission_key)
  select ws, lvl, k from unnest(array['projects.project.view','projects.project.create','projects.project.edit']) k;
  insert into public.access_levels (workspace_id, app_key, name, description, is_template)
  values (ws, 'projects', 'All projects · read', 'See every project, change nothing', true) returning id into lvl;
  insert into public.access_level_permissions (workspace_id, access_level_id, permission_key) values (ws, lvl, 'projects.project.view');
end $$;
create or replace function private.workspace_seed_levels() returns trigger
language plpgsql security definer set search_path = '' as $$
begin perform private.seed_access_levels(new.id); return new; end $$;
create trigger workspaces_seed_levels after insert on public.workspaces
  for each row execute function private.workspace_seed_levels();
select private.seed_access_levels(id) from public.workspaces;

-- ------------------------------------------------------------------ module policies on the shared foundation
drop policy clients_select on public.clients;  drop policy clients_insert on public.clients;
drop policy clients_update on public.clients;  drop policy clients_delete on public.clients;
create policy clients_select on public.clients for select using (
  (private.can_use_app(workspace_id, 'clients') and private.has_permission(workspace_id, 'clients.client.view', id))
  or private.client_of(workspace_id, id));
create policy clients_insert on public.clients for insert with check (private.has_permission(workspace_id, 'clients.client.create'));
create policy clients_update on public.clients for update
  using (private.has_permission(workspace_id, 'clients.client.edit', id))
  with check (private.has_permission(workspace_id, 'clients.client.edit', id));
create policy clients_delete on public.clients for delete using (private.has_permission(workspace_id, 'clients.client.delete'));

drop policy projects_select on public.projects;  drop policy projects_insert on public.projects;
drop policy projects_update on public.projects;  drop policy projects_delete on public.projects;
create policy projects_select on public.projects for select using (
  private.has_permission(workspace_id, 'projects.project.view', client_id, id)
  or (client_visible and private.client_of(workspace_id, client_id)));
create policy projects_insert on public.projects for insert with check (private.has_permission(workspace_id, 'projects.project.create', client_id));
create policy projects_update on public.projects for update
  using (private.has_permission(workspace_id, 'projects.project.edit', client_id, id))
  with check (private.has_permission(workspace_id, 'projects.project.edit', client_id, id));
create policy projects_delete on public.projects for delete using (private.has_permission(workspace_id, 'projects.project.delete'));

drop policy files_select on public.files;  drop policy files_insert on public.files;
drop policy files_update on public.files;  drop policy files_delete on public.files;
-- A file tied to a client also needs access to that client (WCIGA: attachments reveal no more than the source).
create policy files_select on public.files for select using (
  (private.has_permission(workspace_id, 'drive.file.view', client_id)
     and (client_id is null or private.has_permission(workspace_id, 'clients.client.view', client_id)))
  or (client_visible and client_id is not null and private.client_of(workspace_id, client_id)));
create policy files_insert on public.files for insert with check (
  private.has_permission(workspace_id, 'drive.file.upload', client_id) and uploaded_by = private.current_user_id()
  and (client_id is null or private.has_permission(workspace_id, 'clients.client.view', client_id)));
create policy files_update on public.files for update
  using (private.has_permission(workspace_id, 'drive.file.delete_any')
         or (private.has_permission(workspace_id, 'drive.file.share', client_id) and uploaded_by = private.current_user_id()))
  with check (private.has_permission(workspace_id, 'drive.file.delete_any')
         or (private.has_permission(workspace_id, 'drive.file.share', client_id) and uploaded_by = private.current_user_id()));
create policy files_delete on public.files for delete using (
  private.has_permission(workspace_id, 'drive.file.delete_any')
  or (private.has_permission(workspace_id, 'drive.file.upload', client_id) and uploaded_by = private.current_user_id()));

drop policy bb_select on public.brand_base_answers; drop policy bb_insert on public.brand_base_answers;
drop policy bb_update on public.brand_base_answers; drop policy bb_delete on public.brand_base_answers;
create policy bb_select on public.brand_base_answers for select using (private.has_permission(workspace_id, 'clients.brandbase.view', client_id));
create policy bb_insert on public.brand_base_answers for insert with check (private.has_permission(workspace_id, 'clients.brandbase.edit', client_id));
create policy bb_update on public.brand_base_answers for update
  using (private.has_permission(workspace_id, 'clients.brandbase.edit', client_id))
  with check (private.has_permission(workspace_id, 'clients.brandbase.edit', client_id));
create policy bb_delete on public.brand_base_answers for delete using (private.has_permission(workspace_id, 'clients.client.delete'));

drop policy appr_insert on public.approvals; drop policy appr_decide on public.approvals;
create policy appr_insert on public.approvals for insert with check (
  private.has_permission(workspace_id, 'approvals.request.create') and requested_by = private.current_user_id()
  and status = 'pending' and decided_by is null and decided_at is null);
create policy appr_decide on public.approvals for update
  using (private.has_permission(workspace_id, 'approvals.request.decide') and requested_by <> private.current_user_id())
  with check (private.has_permission(workspace_id, 'approvals.request.decide') and requested_by <> private.current_user_id());

drop policy conn_insert on public.integration_connections; drop policy conn_update on public.integration_connections;
drop policy conn_delete on public.integration_connections;
create policy conn_insert on public.integration_connections for insert with check (
  private.has_permission(workspace_id, 'integrations.connection.manage') and created_by = private.current_user_id());
create policy conn_update on public.integration_connections for update
  using (private.has_permission(workspace_id, 'integrations.connection.manage'))
  with check (private.has_permission(workspace_id, 'integrations.connection.manage'));
create policy conn_delete on public.integration_connections for delete using (private.has_permission(workspace_id, 'integrations.connection.manage'));

-- ------------------------------------------------------------------ protect important information (no silent loss)
alter table public.clients add column archived_at timestamptz;
alter table public.projects add column archived_at timestamptz;
-- Deleting a client or project that still holds work is refused; archive it instead. Nothing cascades silently.
create or replace function private.refuse_delete_with_work() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'clients' and (
       exists (select 1 from public.projects where client_id = old.id)
    or exists (select 1 from public.files where client_id = old.id)
    or exists (select 1 from public.brand_base_answers where client_id = old.id)
    or exists (select 1 from public.approvals a join public.files f on f.id = a.subject_id where f.client_id = old.id)) then
    raise exception 'archive this client instead: it still has work' using errcode = 'P0001';
  end if;
  return old;
end $$;
create trigger clients_refuse_delete before delete on public.clients
  for each row execute function private.refuse_delete_with_work();

-- ------------------------------------------------------------------ attribution: which actor or integration
-- Server code sets these per request: select set_config('app.actor_kind','integration',true), set_config('app.via_connection', '<id>', true)
alter table public.audit_events add column actor_kind text not null default 'user'
  check (actor_kind in ('user', 'integration', 'agent', 'system')),
  add column via_connection uuid;
create or replace function private.audit_attribution() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.actor_kind := coalesce(nullif(current_setting('app.actor_kind', true), ''), case when new.actor_id is null then 'system' else 'user' end);
  new.via_connection := nullif(current_setting('app.via_connection', true), '')::uuid;
  if new.actor_kind = 'agent' then
    raise exception 'agents are not enabled' using errcode = '42501';   -- Layer 2 Agents: coming soon only
  end if;
  return new;
end $$;
create trigger audit_attribution before insert on public.audit_events
  for each row execute function private.audit_attribution();

-- ------------------------------------------------------------------ grants
grant select, insert, update, delete on public.groups, public.group_members, public.access_levels,
  public.access_level_permissions, public.access_assignments, public.permission_overrides to app_user;
grant select on public.permissions to app_user;
revoke insert, update, delete on public.permissions from app_user;
revoke all on all functions in schema private from public;
grant execute on all functions in schema private to app_user;
revoke all on function public.launcher_apps(uuid) from public;
revoke all on function public.effective_access(uuid, uuid, uuid) from public;
grant execute on function public.launcher_apps(uuid) to app_user;
grant execute on function public.effective_access(uuid, uuid, uuid) to app_user;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update, delete on public.groups, public.group_members, public.access_levels,
      public.access_level_permissions, public.access_assignments, public.permission_overrides to authenticated;
    grant select on public.permissions to authenticated;
    revoke insert, update, delete on public.permissions from authenticated;
    grant execute on all functions in schema private to authenticated;
    grant execute on function public.launcher_apps(uuid) to authenticated;
    grant execute on function public.effective_access(uuid, uuid, uuid) to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.permissions, public.groups, public.group_members, public.access_levels,
      public.access_level_permissions, public.access_assignments, public.permission_overrides from anon;
    revoke all on function public.launcher_apps(uuid) from anon;
    revoke all on function public.effective_access(uuid, uuid, uuid) from anon;
  end if;
end $$;
