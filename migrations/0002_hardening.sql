set check_function_bodies = off;
-- 0002 · Audit corrections to the Phase 4 foundation (see docs/AUDIT_REPORT.md, findings F1–F10).
-- Additive and non-destructive: no table or column is dropped, no data is deleted.
--   F1  identity works with both PostgREST claim formats (current Supabase uses request.jwt.claims)
--   F2  references can never cross a workspace (composite foreign keys)
--   F3  permission changes and approval decisions are audited automatically and cannot be forged
--   F4  policy helpers live in a private, non-API schema; PUBLIC cannot execute them
--   F5  clients see only items explicitly marked client-visible (allowlist)
--   F6  per-app access and the Launcher registry (Funnel Mapper Pro entitlement, Client Portal kill switch)
--   F7  approvals are decided once, by someone else, and only their status changes
--   F8  profiles (same-workspace visibility), verified active workspace, invitation-only membership
--   F9  workspaces are not deletable through the API; slug and kind allow future external tenants

-- ---------------------------------------------------------------- F4: private schema for helpers
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to app_user;

alter function public.current_user_id() set schema private;
alter function public.role_rank(text) set schema private;
alter function public.has_role(uuid, text) set schema private;
alter function public.is_staff(uuid) set schema private;
alter function public.is_member(uuid) set schema private;
alter function public.client_of(uuid, uuid) set schema private;
alter function public.guard_last_owner() set schema private;
-- Policies reference functions by OID, so existing policies keep working after the move.

-- ---------------------------------------------------------------- F1: identity
-- Same resolution order as Supabase's auth.uid(): legacy claim first, then the claims JSON.
create or replace function private.current_user_id() returns uuid
language sql stable set search_path = '' as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;

create or replace function private.current_user_email() returns text
language sql stable set search_path = '' as $$
  select lower(coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email'
  ))
$$;

create or replace function private.role_rank(r text) returns int
language sql immutable set search_path = '' as $$
  select case r when 'viewer' then 1 when 'editor' then 2 when 'admin' then 3 when 'owner' then 4 else 0 end
$$;

create or replace function private.has_role(ws uuid, min_role text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.workspace_id = ws and m.user_id = private.current_user_id()
      and m.kind = 'staff' and m.status = 'active'
      and private.role_rank(m.role) >= private.role_rank(min_role))
$$;

create or replace function private.is_staff(ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_role(ws, 'viewer')
$$;

create or replace function private.is_member(ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.workspace_id = ws and m.user_id = private.current_user_id() and m.status = 'active')
$$;

-- ---------------------------------------------------------------- F6: app registry and access
create table public.apps (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  name text not null,
  scope text not null check (scope in ('shared', 'per_workspace', 'portal', 'external_product')),
  standalone_capable boolean not null default false,
  sort_order int not null default 100
);
insert into public.apps (key, name, scope, standalone_capable, sort_order) values
  ('office',            'Office',            'per_workspace',    false, 10),
  ('projects',          'Projects',          'shared',           true,  20),
  ('planner',           'Planner',           'shared',           true,  30),
  ('drive',             'Drive',             'shared',           false, 40),
  ('clients',           'Clients',           'per_workspace',    false, 50),
  ('portal',            'Client Portal',     'portal',           false, 60),
  ('funnel_mapper_pro', 'Funnel Mapper Pro', 'external_product', true,  90);

create table public.workspace_apps (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  app_key text not null references public.apps(key),
  enabled boolean not null default true,
  launch_url text check (launch_url is null or launch_url ~ '^https://'),
  primary key (workspace_id, app_key)
);

create table public.app_grants (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null,
  app_key text not null references public.apps(key),
  granted_by uuid,
  granted_at timestamptz not null default now(),
  primary key (workspace_id, user_id, app_key)
);

-- Owners and admins use every enabled app; editors and viewers need an explicit grant.
create or replace function private.can_use_app(ws uuid, app text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workspace_apps wa
                 where wa.workspace_id = ws and wa.app_key = app and wa.enabled)
     and (private.has_role(ws, 'admin')
          or (private.has_role(ws, 'viewer') and exists (
                select 1 from public.app_grants g
                where g.workspace_id = ws and g.user_id = private.current_user_id() and g.app_key = app)))
$$;

-- A client account works only while the workspace's Client Portal is switched on (gate G2 kill switch).
create or replace function private.client_of(ws uuid, cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
      select 1 from public.memberships m
      where m.workspace_id = ws and m.user_id = private.current_user_id()
        and m.kind = 'client' and m.status = 'active' and m.client_id = cid)
    and exists (select 1 from public.workspace_apps wa
                where wa.workspace_id = ws and wa.app_key = 'portal' and wa.enabled)
$$;

-- New workspaces start with the core apps on, the Client Portal OFF and no external products.
create or replace function private.workspace_default_apps() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.workspace_apps (workspace_id, app_key, enabled) values
    (new.id, 'office', true), (new.id, 'projects', true), (new.id, 'planner', true),
    (new.id, 'drive', true), (new.id, 'clients', true), (new.id, 'portal', false);
  return new;
end $$;
create trigger workspaces_default_apps after insert on public.workspaces
  for each row execute function private.workspace_default_apps();
insert into public.workspace_apps (workspace_id, app_key, enabled)
  select w.id, a.key, a.key <> 'portal' from public.workspaces w
  cross join (values ('office'), ('projects'), ('planner'), ('drive'), ('clients'), ('portal')) a(key)
  on conflict do nothing;

-- ---------------------------------------------------------------- F9: workspaces
alter table public.workspaces drop constraint workspaces_slug_check;
alter table public.workspaces add constraint workspaces_slug_format check (slug ~ '^[a-z][a-z0-9-]{1,40}$');
alter table public.workspaces add column kind text not null default 'internal' check (kind in ('internal', 'external'));
drop policy ws_delete on public.workspaces;  -- deletion is a server-side, owner-approved operation only

-- ---------------------------------------------------------------- F2: no cross-workspace references
alter table public.clients add constraint clients_workspace_id_id_key unique (workspace_id, id);
alter table public.memberships drop constraint memberships_client_id_fkey,
  add constraint memberships_client_fk foreign key (workspace_id, client_id)
  references public.clients (workspace_id, id) on delete cascade;
alter table public.projects drop constraint projects_client_id_fkey,
  add constraint projects_client_fk foreign key (workspace_id, client_id)
  references public.clients (workspace_id, id) on delete cascade;
alter table public.files drop constraint files_client_id_fkey,
  add constraint files_client_fk foreign key (workspace_id, client_id)
  references public.clients (workspace_id, id) on delete cascade;
alter table public.brand_base_answers drop constraint brand_base_answers_client_id_fkey,
  add constraint brand_base_answers_client_fk foreign key (workspace_id, client_id)
  references public.clients (workspace_id, id) on delete cascade;
-- memberships cannot be moved to another workspace or another user by an update
create or replace function private.memberships_immutable_keys() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.workspace_id is distinct from old.workspace_id or new.user_id is distinct from old.user_id
     or new.kind is distinct from old.kind then
    raise exception 'membership identity cannot change' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger memberships_immutable_keys before update on public.memberships
  for each row execute function private.memberships_immutable_keys();

-- ---------------------------------------------------------------- F5: client-visible allowlist
alter table public.projects add column client_visible boolean not null default false;
alter table public.files add column client_visible boolean not null default false;

-- ---------------------------------------------------------------- module policies (F5 + F6)
drop policy clients_select on public.clients;
drop policy clients_insert on public.clients;
drop policy clients_update on public.clients;
drop policy clients_delete on public.clients;
create policy clients_select on public.clients for select
  using (private.can_use_app(workspace_id, 'clients') or private.client_of(workspace_id, id));
create policy clients_insert on public.clients for insert
  with check (private.has_role(workspace_id, 'editor') and private.can_use_app(workspace_id, 'clients'));
create policy clients_update on public.clients for update
  using (private.has_role(workspace_id, 'editor') and private.can_use_app(workspace_id, 'clients'))
  with check (private.has_role(workspace_id, 'editor') and private.can_use_app(workspace_id, 'clients'));
create policy clients_delete on public.clients for delete
  using (private.has_role(workspace_id, 'admin') and private.can_use_app(workspace_id, 'clients'));

drop policy projects_select on public.projects;
drop policy projects_insert on public.projects;
drop policy projects_update on public.projects;
drop policy projects_delete on public.projects;
create policy projects_select on public.projects for select
  using (private.can_use_app(workspace_id, 'projects')
         or (client_visible and private.client_of(workspace_id, client_id)));
create policy projects_insert on public.projects for insert
  with check (private.has_role(workspace_id, 'editor') and private.can_use_app(workspace_id, 'projects'));
create policy projects_update on public.projects for update
  using (private.has_role(workspace_id, 'editor') and private.can_use_app(workspace_id, 'projects'))
  with check (private.has_role(workspace_id, 'editor') and private.can_use_app(workspace_id, 'projects'));
create policy projects_delete on public.projects for delete
  using (private.has_role(workspace_id, 'admin') and private.can_use_app(workspace_id, 'projects'));

drop policy files_select on public.files;
drop policy files_insert on public.files;
drop policy files_delete on public.files;
create policy files_select on public.files for select
  using (private.can_use_app(workspace_id, 'drive')
         or (client_visible and client_id is not null and private.client_of(workspace_id, client_id)));
create policy files_insert on public.files for insert
  with check (private.has_role(workspace_id, 'editor') and private.can_use_app(workspace_id, 'drive')
              and uploaded_by = private.current_user_id());
-- Editors may change sharing on their own uploads; admins on any. Path and owner never change (trigger below).
create policy files_update on public.files for update
  using (private.can_use_app(workspace_id, 'drive') and (private.has_role(workspace_id, 'admin')
         or (private.has_role(workspace_id, 'editor') and uploaded_by = private.current_user_id())))
  with check (private.can_use_app(workspace_id, 'drive') and (private.has_role(workspace_id, 'admin')
         or (private.has_role(workspace_id, 'editor') and uploaded_by = private.current_user_id())));
create policy files_delete on public.files for delete
  using (private.can_use_app(workspace_id, 'drive') and (private.has_role(workspace_id, 'admin')
         or (private.has_role(workspace_id, 'editor') and uploaded_by = private.current_user_id())));
create or replace function private.files_immutable_keys() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.workspace_id is distinct from old.workspace_id or new.storage_path is distinct from old.storage_path
     or new.uploaded_by is distinct from old.uploaded_by then
    raise exception 'file identity cannot change' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger files_immutable_keys before update on public.files
  for each row execute function private.files_immutable_keys();

drop policy bb_select on public.brand_base_answers;
drop policy bb_insert on public.brand_base_answers;
drop policy bb_update on public.brand_base_answers;
drop policy bb_delete on public.brand_base_answers;
create policy bb_select on public.brand_base_answers for select
  using (private.has_role(workspace_id, 'editor') and private.can_use_app(workspace_id, 'clients'));
create policy bb_insert on public.brand_base_answers for insert
  with check (private.has_role(workspace_id, 'editor') and private.can_use_app(workspace_id, 'clients'));
create policy bb_update on public.brand_base_answers for update
  using (private.has_role(workspace_id, 'editor') and private.can_use_app(workspace_id, 'clients'))
  with check (private.has_role(workspace_id, 'editor') and private.can_use_app(workspace_id, 'clients'));
create policy bb_delete on public.brand_base_answers for delete
  using (private.has_role(workspace_id, 'admin') and private.can_use_app(workspace_id, 'clients'));

-- app registry policies
alter table public.apps enable row level security;
alter table public.apps force row level security;
alter table public.workspace_apps enable row level security;
alter table public.workspace_apps force row level security;
alter table public.app_grants enable row level security;
alter table public.app_grants force row level security;
-- An app's registry row is visible only where it is enabled for one of the person's workspaces.
create policy apps_select on public.apps for select using (exists (
  select 1 from public.workspace_apps wa
  where wa.app_key = apps.key and wa.enabled and private.is_member(wa.workspace_id)));
create policy wsapps_select on public.workspace_apps for select
  using (private.is_staff(workspace_id) and (enabled or private.has_role(workspace_id, 'admin')));
create policy wsapps_update on public.workspace_apps for update
  using (private.has_role(workspace_id, 'admin') and app_key not in ('portal', 'funnel_mapper_pro'))
  with check (private.has_role(workspace_id, 'admin') and app_key not in ('portal', 'funnel_mapper_pro'));
-- Switching the Client Portal or an external product on is an owner action (gate G2, owner decision).
create policy wsapps_owner_update on public.workspace_apps for update
  using (private.has_role(workspace_id, 'owner')) with check (private.has_role(workspace_id, 'owner'));
create policy grants_select on public.app_grants for select
  using (private.is_staff(workspace_id) or user_id = private.current_user_id());
create policy grants_insert on public.app_grants for insert
  with check (private.has_role(workspace_id, 'admin') and granted_by = private.current_user_id());
create policy grants_delete on public.app_grants for delete using (private.has_role(workspace_id, 'admin'));

-- ---------------------------------------------------------------- F7: approvals
alter table public.approvals add column decided_by uuid, add column decided_at timestamptz,
  add column version int not null default 1 check (version >= 1),
  add column created_at timestamptz not null default now();
create or replace function private.approvals_decide() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status <> 'pending' then
    raise exception 'approval already decided' using errcode = 'P0001';
  end if;
  if new.workspace_id is distinct from old.workspace_id or new.subject_type is distinct from old.subject_type
     or new.subject_id is distinct from old.subject_id or new.requested_by is distinct from old.requested_by
     or new.version is distinct from old.version or new.created_at is distinct from old.created_at
     or new.status not in ('approved', 'rejected') then
    raise exception 'only the decision can change' using errcode = 'P0001';
  end if;
  new.decided_by := private.current_user_id();
  new.decided_at := now();
  return new;
end $$;
create trigger approvals_decide before update on public.approvals
  for each row execute function private.approvals_decide();
-- F7b: a new request always starts as pending and undecided (editors could previously insert 'approved').
drop policy appr_insert on public.approvals;
create policy appr_insert on public.approvals for insert with check (
  private.has_role(workspace_id, 'editor') and requested_by = private.current_user_id()
  and status = 'pending' and decided_by is null and decided_at is null);

-- ---------------------------------------------------------------- F3: tamper-evident audit
alter table public.audit_events add column origin text not null default 'app' check (origin in ('app', 'system')),
  add column detail jsonb;
drop policy audit_insert on public.audit_events;
create policy audit_insert on public.audit_events for insert
  with check (private.is_staff(workspace_id) and actor_id = private.current_user_id() and origin = 'app');

create or replace function private.audit_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  keep text[] := tg_argv;   -- the columns worth recording for this table
  d jsonb := '{}'; k text;
begin
  foreach k in array keep loop
    if (o -> k) is distinct from (n -> k) then
      d := d || jsonb_build_object(k, jsonb_build_array(o -> k, n -> k));
    end if;
  end loop;
  insert into public.audit_events (workspace_id, actor_id, action, subject_type, subject_id, origin, detail)
  values (coalesce(n ->> 'workspace_id', o ->> 'workspace_id')::uuid, private.current_user_id(),
          tg_table_name || '.' || lower(tg_op), tg_table_name,
          case when tg_table_name = 'app_grants' then null
               else coalesce(n ->> 'id', o ->> 'id')::uuid end,
          'system', d);
  return coalesce(new, old);
end $$;
create trigger audit_memberships after insert or update or delete on public.memberships
  for each row execute function private.audit_change('user_id', 'kind', 'role', 'status', 'client_id');
create trigger audit_approvals after update on public.approvals
  for each row execute function private.audit_change('status', 'decided_by');
create trigger audit_app_grants after insert or delete on public.app_grants
  for each row execute function private.audit_change('user_id', 'app_key');
create trigger audit_workspace_apps after update on public.workspace_apps
  for each row execute function private.audit_change('app_key', 'enabled', 'launch_url');
create trigger audit_clients_delete after delete on public.clients
  for each row execute function private.audit_change('name');
create trigger audit_files_delete after delete on public.files
  for each row execute function private.audit_change('storage_path', 'client_id');

-- ---------------------------------------------------------------- F8: profiles and active workspace
create table public.profiles (
  id uuid primary key,                     -- equals the auth user id
  display_name text check (char_length(display_name) <= 120),
  avatar_path text,
  active_workspace_id uuid references public.workspaces(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
-- Visible to yourself, and to active STAFF of a workspace you are both active members of.
create or replace function private.can_see_profile(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select target = private.current_user_id() or exists (
    select 1 from public.memberships me join public.memberships them
      on them.workspace_id = me.workspace_id
    where me.user_id = private.current_user_id() and me.kind = 'staff' and me.status = 'active'
      and them.user_id = target and them.status = 'active')
$$;
create policy profiles_select on public.profiles for select using (private.can_see_profile(id));
create policy profiles_insert on public.profiles for insert with check (
  id = private.current_user_id() and (active_workspace_id is null or private.is_member(active_workspace_id)));
-- The active workspace is server-verified: it can only point at a workspace you belong to.
create policy profiles_update on public.profiles for update using (id = private.current_user_id())
  with check (id = private.current_user_id()
              and (active_workspace_id is null or private.is_member(active_workspace_id)));

-- ---------------------------------------------------------------- F8: invitation-only membership
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  kind text not null check (kind in ('staff', 'client')),
  role text check (role in ('owner', 'admin', 'editor', 'viewer')),
  client_id uuid,
  apps text[] not null default '{office,projects,planner,drive,clients}',
  token_hash text not null unique,
  invited_by uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz, accepted_by uuid, revoked_at timestamptz,
  check ((kind = 'staff' and role is not null and client_id is null)
      or (kind = 'client' and role is null and client_id is not null)),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id) on delete cascade
);
alter table public.invitations enable row level security;
alter table public.invitations force row level security;
create policy inv_select on public.invitations for select using (private.has_role(workspace_id, 'admin'));
-- Admins may only revoke (set revoked_at); creation and acceptance go through the functions below.
create policy inv_update on public.invitations for update
  using (private.has_role(workspace_id, 'admin') and accepted_at is null)
  with check (private.has_role(workspace_id, 'admin'));

-- Returns the raw token ONCE; only its SHA-256 hash is stored. Email delivery is the server's job.
create or replace function public.create_invitation(
  p_workspace uuid, p_email text, p_kind text, p_role text default null,
  p_client uuid default null, p_apps text[] default null) returns text
language plpgsql security definer set search_path = '' as $$
declare tok text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if not private.has_role(p_workspace, 'admin')
     or (p_role = 'owner' and not private.has_role(p_workspace, 'owner')) then
    raise exception 'not found' using errcode = '42501';
  end if;
  insert into public.invitations (workspace_id, email, kind, role, client_id, apps, token_hash, invited_by)
  values (p_workspace, lower(trim(p_email)), p_kind, p_role, p_client,
          coalesce(p_apps, '{office,projects,planner,drive,clients}'),
          encode(sha256(convert_to(tok, 'UTF8')), 'hex'), private.current_user_id());
  return tok;
end $$;

-- Binds the signed-in user to the invitation only if the verified sign-in email matches.
-- Every failure returns the same error, so a token reveals nothing.
create or replace function public.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  inv public.invitations;
  uid uuid := private.current_user_id();
  mid uuid;
begin
  select * into inv from public.invitations
   where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
     and accepted_at is null and revoked_at is null and expires_at > now()
   for update;
  if uid is null or inv.id is null or inv.email is distinct from private.current_user_email()
     or exists (select 1 from public.memberships m where m.workspace_id = inv.workspace_id and m.user_id = uid) then
    raise exception 'invitation not valid' using errcode = 'P0002';
  end if;
  insert into public.memberships (workspace_id, user_id, kind, role, client_id)
  values (inv.workspace_id, uid, inv.kind, inv.role, inv.client_id) returning id into mid;
  if inv.kind = 'staff' then
    insert into public.app_grants (workspace_id, user_id, app_key, granted_by)
    select inv.workspace_id, uid, a, inv.invited_by from unnest(inv.apps) a
    where exists (select 1 from public.apps x where x.key = a and x.scope <> 'portal')
    on conflict do nothing;
  end if;
  update public.invitations set accepted_at = now(), accepted_by = uid where id = inv.id;
  return mid;
end $$;

-- Launcher: the apps this person may open in this workspace. Unknown workspace = empty list.
create or replace function public.launcher_apps(p_workspace uuid)
returns table (app_key text, name text, scope text, launch_url text)
language sql stable security definer set search_path = '' as $$
  select a.key, a.name, a.scope, wa.launch_url
  from public.apps a join public.workspace_apps wa on wa.app_key = a.key and wa.workspace_id = p_workspace
  where wa.enabled and (
        (a.scope <> 'portal' and private.can_use_app(p_workspace, a.key))
     or (a.scope = 'portal' and exists (select 1 from public.memberships m
           where m.workspace_id = p_workspace and m.user_id = private.current_user_id()
             and m.kind = 'client' and m.status = 'active')))
  order by a.sort_order
$$;

-- ---------------------------------------------------------------- grants
grant select, insert, update, delete on all tables in schema public to app_user;
revoke all on all functions in schema private from public;
revoke all on function public.create_invitation(uuid, text, text, text, uuid, text[]) from public;
revoke all on function public.accept_invitation(text) from public;
revoke all on function public.launcher_apps(uuid) from public;
grant execute on all functions in schema private to app_user;   -- needed to evaluate policies
grant execute on function public.create_invitation(uuid, text, text, text, uuid, text[]) to app_user;
grant execute on function public.accept_invitation(text) to app_user;
grant execute on function public.launcher_apps(uuid) to app_user;

-- On Supabase, signed-in requests run as `authenticated` and anonymous ones as `anon`.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant usage on schema private to authenticated;
    grant execute on all functions in schema private to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on function public.create_invitation(uuid, text, text, text, uuid, text[]) to authenticated;
    grant execute on function public.accept_invitation(text) to authenticated;
    grant execute on function public.launcher_apps(uuid) to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on all tables in schema public from anon;
    revoke all on function public.create_invitation(uuid, text, text, text, uuid, text[]) from anon;
    revoke all on function public.accept_invitation(text) from anon;
    revoke all on function public.launcher_apps(uuid) from anon;
  end if;
end $$;
