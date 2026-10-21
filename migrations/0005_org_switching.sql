set check_function_bodies = off;
-- 0005 · Organization switching that keeps the user in the same app (owner requirement, 21 Oct 2026).
-- 1. Request organization scope: every request from the app carries the active organization (header x-org-id,
--    or app.org_id for server code). A RESTRICTIVE policy on every organization-owned table then hides all rows of
--    any other organization, even for people who belong to both. The header can only NARROW access, never widen it
--    (permissive policies still decide membership and permissions). A malformed header shows nothing (fail closed).
--    No header = no narrowing (used only by the grouped "My work" reads and server jobs).
-- 2. Page registry: every page declares the permission it needs and whether it shows one record.
-- 3. resolve_org_switch(): verifies membership, sets the active organization, and answers where the user lands
--    in the SAME app. It never sends anyone to the Launcher; it returns an outcome the interface must explain.

create or replace function private.request_org() returns text
language sql stable set search_path = '' as $$
  select coalesce(
    nullif(current_setting('app.org_id', true), ''),
    nullif(current_setting('request.headers', true), '')::json ->> 'x-org-id')
$$;

create or replace function private.org_in_scope(ws uuid) returns boolean
language sql stable set search_path = '' as $$
  select case
    when private.request_org() is null then true
    when private.request_org() !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then false
    else ws = private.request_org()::uuid end
$$;

do $$
declare t text;
begin
  foreach t in array array['clients','memberships','projects','files','brand_base_answers','approvals','audit_events',
    'workspace_apps','app_grants','invitations','integration_connections','external_refs','webhook_inbox','outbox_events',
    'groups','group_members','access_levels','access_level_permissions','access_assignments','permission_overrides'] loop
    execute format('create policy org_scope on public.%I as restrictive for all
      using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id))', t);
  end loop;
end $$;
create policy org_scope on public.workspaces as restrictive for all
  using (private.org_in_scope(id)) with check (private.org_in_scope(id));

-- ------------------------------------------------------------------ page registry
insert into public.permissions (key, app_key, description, floor_role, default_role, scopes, sensitive) values
  ('platform.members.manage', 'platform', 'Invite members, change roles, deactivate', 'admin', 'admin', '{workspace}', true),
  ('platform.apps.manage',    'platform', 'Switch apps on or off for the organization', 'admin', 'admin', '{workspace}', true);

create table public.app_pages (
  app_key text not null references public.apps(key),
  page_key text not null check (page_key ~ '^[a-z][a-z0-9_.]{1,60}$'),
  title text not null,
  kind text not null default 'page' check (kind in ('home', 'page', 'record')),
  permission_key text references public.permissions(key),
  parent_page_key text,
  primary key (app_key, page_key)
);
alter table public.app_pages enable row level security;
alter table public.app_pages force row level security;
create policy pages_select on public.app_pages for select using (exists (
  select 1 from public.memberships m where m.user_id = private.current_user_id() and m.status = 'active'));
insert into public.app_pages (app_key, page_key, title, kind, permission_key, parent_page_key) values
  ('office',   'home',            'Home',            'home',   null, null),
  ('office',   'documents',       'Documents',       'page',   'drive.file.view', 'home'),
  ('office',   'admin.members',   'Admin · Members', 'page',   'platform.members.manage', 'home'),
  ('office',   'admin.access',    'Admin · Access',  'page',   'platform.access.review', 'home'),
  ('office',   'admin.apps',      'Admin · Apps',    'page',   'platform.apps.manage', 'home'),
  ('projects', 'home',            'Home',            'home',   null, null),
  ('projects', 'list',            'Projects',        'page',   null, 'home'),
  ('projects', 'project',         'Project',         'record', 'projects.project.view', 'list'),
  ('clients',  'list',            'Clients',         'home',   null, null),
  ('clients',  'record',          'Client',          'record', 'clients.client.view', 'list'),
  ('clients',  'requests',        'Requests & Approvals', 'page', null, 'list'),
  ('drive',    'home',            'Home',            'home',   null, null),
  ('drive',    'shared',          'Shared drives',   'page',   'drive.file.view', 'home'),
  ('drive',    'file',            'File',            'record', 'drive.file.view', 'shared'),
  ('planner',  'overview',        'Overview',        'home',   null, null),
  ('planner',  'goal',            'Goal',            'record', null, 'overview');

-- ------------------------------------------------------------------ the resolver
-- outcome:
--   same_page          stay on the equivalent page in the new organization
--   record_not_carried the old page showed one record of the old organization; land on its list page instead
--   page_unavailable   the page needs a permission you lack there; land on the app's home page
--   app_unavailable    the app is off or not granted there; stay put, explain, offer next steps (no redirect)
--   not_available      not a member (or no such organization); nothing changes; identical for both cases
create or replace function public.resolve_org_switch(p_org uuid, p_app text, p_page text default null)
returns table (outcome text, org_id uuid, org_name text, app_key text, page_key text, message text)
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.current_user_id();
  orgname text; appname text; pg public.app_pages; home public.app_pages;
begin
  if uid is null or p_org is null or not private.is_member(p_org) then
    return query select 'not_available'::text, null::uuid, null::text, p_app, p_page,
      'You don''t have access to that organization. Nothing was changed.'::text;
    return;
  end if;
  select w.name into orgname from public.workspaces w where w.id = p_org;
  insert into public.profiles (id, active_workspace_id) values (uid, p_org)
  on conflict (id) do update set active_workspace_id = excluded.active_workspace_id;

  select a.name into appname from public.apps a where a.key = p_app;
  if appname is null or not private.can_use_app(p_org, p_app) then
    return query select 'app_unavailable'::text, p_org, orgname, p_app, null::text,
      format('%s isn''t available to you in %s. You can ask an admin there for access, switch back, or open another app.',
             coalesce(appname, 'This app'), orgname);
    return;
  end if;

  select * into home from public.app_pages ap where ap.app_key = p_app and ap.kind = 'home' limit 1;
  select * into pg from public.app_pages ap where ap.app_key = p_app and ap.page_key = p_page;
  if pg.page_key is null then
    return query select 'same_page'::text, p_org, orgname, p_app, home.page_key, null::text;
    return;
  end if;
  if pg.kind = 'record' then
    return query select 'record_not_carried'::text, p_org, orgname, p_app, coalesce(pg.parent_page_key, home.page_key),
      format('That item belongs to the organization you left, so you are now on %s in %s.',
             (select ap.title from public.app_pages ap where ap.app_key = p_app and ap.page_key = coalesce(pg.parent_page_key, home.page_key)),
             orgname);
    return;
  end if;
  if pg.permission_key is not null and not private.has_permission(p_org, pg.permission_key) then
    return query select 'page_unavailable'::text, p_org, orgname, p_app, home.page_key,
      format('You don''t have access to %s in %s, so you are on %s. Ask an admin there if you need it.', pg.title, orgname, home.title);
    return;
  end if;
  return query select 'same_page'::text, p_org, orgname, p_app, pg.page_key, null::text;
end $$;

revoke all on function public.resolve_org_switch(uuid, text, text) from public;
revoke all on all functions in schema private from public;
grant execute on all functions in schema private to app_user;
grant execute on function public.resolve_org_switch(uuid, text, text) to app_user;
grant select on public.app_pages to app_user;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on all functions in schema private to authenticated;
    grant execute on function public.resolve_org_switch(uuid, text, text) to authenticated;
    grant select on public.app_pages to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.resolve_org_switch(uuid, text, text) from anon;
    revoke all on public.app_pages from anon;
  end if;
end $$;
