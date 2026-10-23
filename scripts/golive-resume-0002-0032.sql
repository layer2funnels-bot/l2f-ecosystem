-- Resume script for the NEW Supabase project l2f-ecosystem only. Finishes migration 0002 (first half is already applied) and applies 0003-0032 in order.
-- Run once in the Supabase SQL Editor. It is all-or-nothing: any error rolls everything back. Refuses to run if the database is not in the expected state.
-- The editor will warn about "destructive" statements (policy/constraint replacements, no data is deleted). Confirm to run.
do $guard$ begin
  if to_regclass('public.workspaces') is null or to_regclass('public.apps') is null or to_regclass('public.invitations') is not null
     or exists (select 1 from information_schema.columns where table_schema='public' and table_name='workspaces' and column_name='kind')
     or exists (select 1 from public.workspaces) then
    raise exception 'unexpected database state: this script resumes 0002 on an empty, half-migrated project only';
  end if;
end $guard$;
set check_function_bodies = off;
-- ===== 0002 (second half) =====
alter table public.workspaces drop constraint workspaces_slug_check;
alter table public.workspaces add constraint workspaces_slug_format check (slug ~ '^[a-z][a-z0-9-]{1,40}$');
alter table public.workspaces add column kind text not null default 'internal' check (kind in ('internal', 'external'));
drop policy ws_delete on public.workspaces;  -- deletion is a server-side, owner-approved operation only
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
alter table public.projects add column client_visible boolean not null default false;
alter table public.files add column client_visible boolean not null default false;
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
alter table public.apps enable row level security;
alter table public.apps force row level security;
alter table public.workspace_apps enable row level security;
alter table public.workspace_apps force row level security;
alter table public.app_grants enable row level security;
alter table public.app_grants force row level security;
create policy apps_select on public.apps for select using (exists (
  select 1 from public.workspace_apps wa
  where wa.app_key = apps.key and wa.enabled and private.is_member(wa.workspace_id)));
create policy wsapps_select on public.workspace_apps for select
  using (private.is_staff(workspace_id) and (enabled or private.has_role(workspace_id, 'admin')));
create policy wsapps_update on public.workspace_apps for update
  using (private.has_role(workspace_id, 'admin') and app_key not in ('portal', 'funnel_mapper_pro'))
  with check (private.has_role(workspace_id, 'admin') and app_key not in ('portal', 'funnel_mapper_pro'));
create policy wsapps_owner_update on public.workspace_apps for update
  using (private.has_role(workspace_id, 'owner')) with check (private.has_role(workspace_id, 'owner'));
create policy grants_select on public.app_grants for select
  using (private.is_staff(workspace_id) or user_id = private.current_user_id());
create policy grants_insert on public.app_grants for insert
  with check (private.has_role(workspace_id, 'admin') and granted_by = private.current_user_id());
create policy grants_delete on public.app_grants for delete using (private.has_role(workspace_id, 'admin'));
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
drop policy appr_insert on public.approvals;
create policy appr_insert on public.approvals for insert with check (
  private.has_role(workspace_id, 'editor') and requested_by = private.current_user_id()
  and status = 'pending' and decided_by is null and decided_at is null);
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
create table public.profiles (
  id uuid primary key,                     -- equals the auth user id
  display_name text check (char_length(display_name) <= 120),
  avatar_path text,
  active_workspace_id uuid references public.workspaces(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
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
create policy profiles_update on public.profiles for update using (id = private.current_user_id())
  with check (id = private.current_user_id()
              and (active_workspace_id is null or private.is_member(active_workspace_id)));
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
create policy inv_update on public.invitations for update
  using (private.has_role(workspace_id, 'admin') and accepted_at is null)
  with check (private.has_role(workspace_id, 'admin'));
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
grant select, insert, update, delete on all tables in schema public to app_user;
revoke all on all functions in schema private from public;
revoke all on function public.create_invitation(uuid, text, text, text, uuid, text[]) from public;
revoke all on function public.accept_invitation(text) from public;
revoke all on function public.launcher_apps(uuid) from public;
grant execute on all functions in schema private to app_user;   -- needed to evaluate policies
grant execute on function public.create_invitation(uuid, text, text, text, uuid, text[]) to app_user;
grant execute on function public.accept_invitation(text) to app_user;
grant execute on function public.launcher_apps(uuid) to app_user;
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
-- ===== 0003_integration_foundation.sql =====
set check_function_bodies = off;
create table public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null check (provider ~ '^[a-z][a-z0-9_]{1,40}$'),
  status text not null default 'disabled' check (status in ('active', 'disabled')),
  scopes text[] not null default '{}',
  secret_ref text check (secret_ref is null or secret_ref ~ '^[A-Z][A-Z0-9_]{2,80}$'),  -- a NAME, never a key
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, provider)
);
create table public.external_refs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null,
  entity_type text not null,
  entity_id uuid not null,
  external_id text not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, provider, entity_type, external_id),
  unique (workspace_id, provider, entity_type, entity_id)
);
create table public.webhook_inbox (
  id bigint generated always as identity primary key,
  workspace_id uuid not null,
  connection_id uuid not null,
  provider text not null,
  delivery_id text not null,
  received_at timestamptz not null default now(),
  payload jsonb not null,
  status text not null default 'received' check (status in ('received', 'processed', 'failed')),
  processed_at timestamptz,
  attempts int not null default 0 check (attempts between 0 and 3),
  unique (provider, delivery_id),
  foreign key (workspace_id, connection_id)
    references public.integration_connections (workspace_id, id) on delete cascade
);
create table public.outbox_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  type text not null,
  subject_type text not null,
  subject_id uuid,
  payload jsonb not null default '{}',
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts int not null default 0 check (attempts between 0 and 3),
  unique (workspace_id, idempotency_key)
);
do $$
declare t text;
begin
  foreach t in array array['integration_connections','external_refs','webhook_inbox','outbox_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;
create policy conn_select on public.integration_connections for select using (private.has_role(workspace_id, 'admin'));
create policy conn_insert on public.integration_connections for insert
  with check (private.has_role(workspace_id, 'admin') and created_by = private.current_user_id());
create policy conn_update on public.integration_connections for update
  using (private.has_role(workspace_id, 'admin')) with check (private.has_role(workspace_id, 'admin'));
create policy conn_delete on public.integration_connections for delete using (private.has_role(workspace_id, 'admin'));
create policy xref_select on public.external_refs for select using (private.is_staff(workspace_id));
create policy xref_insert on public.external_refs for insert with check (private.has_role(workspace_id, 'editor'));
create policy xref_delete on public.external_refs for delete using (private.has_role(workspace_id, 'editor'));
create policy inbox_select on public.webhook_inbox for select using (private.has_role(workspace_id, 'admin'));
create policy outbox_select on public.outbox_events for select using (private.has_role(workspace_id, 'admin'));
create trigger audit_connections after insert or update or delete on public.integration_connections
  for each row execute function private.audit_change('provider', 'status', 'scopes', 'secret_ref');
grant select, insert, update, delete on public.integration_connections, public.external_refs to app_user;
grant select on public.webhook_inbox, public.outbox_events to app_user;
revoke insert, update, delete on public.webhook_inbox, public.outbox_events from app_user;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update, delete on public.integration_connections, public.external_refs to authenticated;
    grant select on public.webhook_inbox, public.outbox_events to authenticated;
    revoke insert, update, delete on public.webhook_inbox, public.outbox_events from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.integration_connections, public.external_refs, public.webhook_inbox, public.outbox_events from anon;
  end if;
end $$;
-- ===== 0004_authorization_foundation.sql =====
set check_function_bodies = off;
alter table public.apps add column lifecycle text not null default 'active'
  check (lifecycle in ('active', 'coming_soon', 'deprecated', 'retired'));
insert into public.apps (key, name, scope, standalone_capable, sort_order, lifecycle) values
  ('forms',          'Form Builder',   'shared', true,  45, 'coming_soon'),
  ('value_ladder',   'Value Ladder',   'shared', false, 55, 'coming_soon'),
  ('social_planner', 'Social Planner', 'shared', true,  65, 'coming_soon'),
  ('whiteboard',     'Whiteboard',     'shared', true,  70, 'coming_soon'),
  ('layer2_agents',  'Layer 2 Agents', 'shared', false, 95, 'coming_soon');
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
alter table public.clients add column archived_at timestamptz;
alter table public.projects add column archived_at timestamptz;
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
-- ===== 0005_org_switching.sql =====
set check_function_bodies = off;
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
-- ===== 0006_funnels_foundation.sql =====
set check_function_bodies = off;
insert into public.permissions (key, app_key, description, floor_role, default_role, scopes, sensitive) values
  ('funnels.avatar.view',    'office', 'View customer avatars',                         'viewer', 'viewer', '{workspace,client}', false),
  ('funnels.avatar.create',  'office', 'Create customer avatars',                       'editor', 'editor', '{workspace,client}', false),
  ('funnels.avatar.edit',    'office', 'Edit or archive customer avatars',              'editor', 'editor', '{workspace,client}', false),
  ('funnels.avatar.delete',  'office', 'Permanently delete an ARCHIVED, unreferenced avatar', 'admin', 'owner', '{workspace}', true),
  ('funnels.offer.view',     'office', 'View offers and products',                      'viewer', 'viewer', '{workspace,client}', false),
  ('funnels.offer.create',   'office', 'Create offers and products',                    'editor', 'editor', '{workspace,client}', false),
  ('funnels.offer.edit',     'office', 'Edit or archive offers and products',           'editor', 'editor', '{workspace,client}', false),
  ('funnels.offer.delete',   'office', 'Permanently delete an ARCHIVED, unreferenced offer', 'admin', 'owner', '{workspace}', true),
  ('funnels.story.view',     'office', 'View the story bank',                           'viewer', 'viewer', '{workspace,client}', false),
  ('funnels.story.create',   'office', 'Add stories',                                   'editor', 'editor', '{workspace,client}', false),
  ('funnels.story.edit',     'office', 'Edit or archive stories',                       'editor', 'editor', '{workspace,client}', false),
  ('funnels.story.delete',   'office', 'Permanently delete an ARCHIVED, unreferenced story', 'admin', 'owner', '{workspace}', true),
  ('funnels.brandkit.view',  'office', 'View brand kits',                               'viewer', 'viewer', '{workspace,client}', false),
  ('funnels.brandkit.create','office', 'Create brand kits',                             'editor', 'editor', '{workspace,client}', false),
  ('funnels.brandkit.edit',  'office', 'Edit or archive brand kits',                    'editor', 'editor', '{workspace,client}', false),
  ('funnels.brandkit.delete','office', 'Permanently delete an ARCHIVED, unreferenced brand kit', 'admin', 'owner', '{workspace}', true),
  ('funnels.record.share',   'office', 'Make a funnel record visible to its client',    'editor', 'admin',  '{workspace,client}', true),
  ('funnels.reference.view', 'office', 'See which apps reference funnel records',       'viewer', 'viewer', '{workspace,client}', false),
  ('funnels.reference.manage','office','Link or unlink funnel records from Clients and Value Ladder', 'editor', 'editor', '{workspace,client}', false);
create table public.funnel_avatars (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid,
  name text not null check (length(name) between 1 and 200),
  summary text check (length(summary) <= 4000),
  pains text check (length(pains) <= 8000),
  desires text check (length(desires) <= 8000),
  objections text check (length(objections) <= 8000),
  client_visible boolean not null default false,
  archived_at timestamptz,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id),
  check (not client_visible or client_id is not null)
);
create table public.funnel_offers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid,
  kind text not null default 'offer' check (kind in ('offer', 'product')),
  name text not null check (length(name) between 1 and 200),
  promise text check (length(promise) <= 4000),
  description text check (length(description) <= 8000),
  price_amount numeric(12, 2) check (price_amount >= 0),
  currency text check (currency ~ '^[A-Z]{3}$'),
  avatar_id uuid,
  client_visible boolean not null default false,
  archived_at timestamptz,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id),
  foreign key (workspace_id, avatar_id) references public.funnel_avatars (workspace_id, id),
  check (not client_visible or client_id is not null),
  check ((price_amount is null) = (currency is null))
);
create table public.funnel_stories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid,
  kind text not null default 'other' check (kind in ('origin', 'case_study', 'testimonial', 'analogy', 'other')),
  title text not null check (length(title) between 1 and 200),
  body text check (length(body) <= 20000),
  avatar_id uuid, offer_id uuid,
  client_visible boolean not null default false,
  archived_at timestamptz,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id),
  foreign key (workspace_id, avatar_id) references public.funnel_avatars (workspace_id, id),
  foreign key (workspace_id, offer_id) references public.funnel_offers (workspace_id, id),
  check (not client_visible or client_id is not null)
);
create table public.funnel_brand_kits (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid,
  name text not null check (length(name) between 1 and 200),
  voice text check (length(voice) <= 8000),
  colors jsonb not null default '[]' check (jsonb_typeof(colors) = 'array' and jsonb_array_length(colors) <= 24),
  fonts jsonb not null default '[]' check (jsonb_typeof(fonts) = 'array' and jsonb_array_length(fonts) <= 12),
  logo_file_id uuid,
  notes text check (length(notes) <= 8000),
  client_visible boolean not null default false,
  archived_at timestamptz,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id),
  check (not client_visible or client_id is not null)
);
alter table public.files add constraint files_workspace_id_id_key unique (workspace_id, id);
alter table public.funnel_brand_kits add foreign key (workspace_id, logo_file_id) references public.files (workspace_id, id);
create table public.funnel_references (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid,
  referrer_app text not null check (referrer_app in ('clients', 'value_ladder')),
  referrer_type text not null check (referrer_type ~ '^[a-z][a-z_]{1,40}$'),
  referrer_id uuid not null,
  avatar_id uuid, offer_id uuid, story_id uuid, brand_kit_id uuid,
  created_by uuid, created_at timestamptz not null default now(),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id),
  foreign key (workspace_id, avatar_id) references public.funnel_avatars (workspace_id, id),
  foreign key (workspace_id, offer_id) references public.funnel_offers (workspace_id, id),
  foreign key (workspace_id, story_id) references public.funnel_stories (workspace_id, id),
  foreign key (workspace_id, brand_kit_id) references public.funnel_brand_kits (workspace_id, id),
  check (num_nonnulls(avatar_id, offer_id, story_id, brand_kit_id) = 1)
);
create unique index funnel_references_once on public.funnel_references
  (workspace_id, referrer_app, referrer_type, referrer_id, coalesce(avatar_id, offer_id, story_id, brand_kit_id));
create or replace function private.funnels_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id();
begin
  if tg_op = 'INSERT' then
    if uid is not null then new.created_by := uid; end if;
  else
    if new.workspace_id is distinct from old.workspace_id or new.client_id is distinct from old.client_id
       or new.created_by is distinct from old.created_by then
      raise exception 'records do not move' using errcode = 'P0001';
    end if;
    new.updated_at := now();
  end if;
  if uid is not null and new.client_visible and (tg_op = 'INSERT' or not old.client_visible)
     and not private.has_permission(new.workspace_id, 'funnels.record.share', new.client_id) then
    raise exception 'not found' using errcode = '42501';
  end if;
  if uid is not null and tg_op = 'UPDATE' and old.client_visible and not new.client_visible
     and not private.has_permission(new.workspace_id, 'funnels.record.share', new.client_id) then
    raise exception 'not found' using errcode = '42501';
  end if;
  return new;
end $$;
create or replace function private.funnels_refuse_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.archived_at is null then
    raise exception 'archive this record instead' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.funnel_references r where r.workspace_id = old.workspace_id
              and old.id in (r.avatar_id, r.offer_id, r.story_id, r.brand_kit_id))
     or (tg_table_name = 'funnel_avatars' and (exists (select 1 from public.funnel_offers o where o.avatar_id = old.id)
                                               or exists (select 1 from public.funnel_stories s where s.avatar_id = old.id)))
     or (tg_table_name = 'funnel_offers' and exists (select 1 from public.funnel_stories s where s.offer_id = old.id)) then
    raise exception 'still referenced: archive it instead' using errcode = 'P0001';
  end if;
  return old;
end $$;
do $$
declare t text; obj text; cols text;
begin
  for t, obj, cols in values
    ('funnel_avatars', 'avatar', '''name'', ''client_id'', ''client_visible'', ''archived_at'''),
    ('funnel_offers', 'offer', '''name'', ''kind'', ''client_id'', ''client_visible'', ''archived_at'', ''price_amount'', ''currency'''),
    ('funnel_stories', 'story', '''title'', ''kind'', ''client_id'', ''client_visible'', ''archived_at'''),
    ('funnel_brand_kits', 'brandkit', '''name'', ''client_id'', ''client_visible'', ''archived_at'', ''logo_file_id''')
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('create policy org_scope on public.%I as restrictive for all
      using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id))', t);
    execute format('create policy %1$s_select on public.%1$I for select using (
      private.has_permission(workspace_id, %2$L, client_id)
      or (client_visible and archived_at is null and client_id is not null and private.client_of(workspace_id, client_id)))', t, 'funnels.' || obj || '.view');
    execute format('create policy %1$s_insert on public.%1$I for insert with check (private.has_permission(workspace_id, %2$L, client_id))', t, 'funnels.' || obj || '.create');
    execute format('create policy %1$s_update on public.%1$I for update
      using (private.has_permission(workspace_id, %2$L, client_id)) with check (private.has_permission(workspace_id, %2$L, client_id))', t, 'funnels.' || obj || '.edit');
    execute format('create policy %1$s_delete on public.%1$I for delete using (private.has_permission(workspace_id, %2$L))', t, 'funnels.' || obj || '.delete');
    execute format('create trigger %1$s_guard before insert or update on public.%1$I for each row execute function private.funnels_guard()', t);
    execute format('create trigger %1$s_refuse_delete before delete on public.%1$I for each row execute function private.funnels_refuse_delete()', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I for each row execute function private.audit_change(%2$s)', t, cols);
    execute format('create index %1$s_org on public.%1$I (workspace_id, client_id) where archived_at is null', t);
  end loop;
end $$;
alter table public.funnel_references enable row level security;
alter table public.funnel_references force row level security;
create policy org_scope on public.funnel_references as restrictive for all
  using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
create policy funnel_references_select on public.funnel_references for select using (private.has_permission(workspace_id, 'funnels.reference.view', client_id));
create policy funnel_references_insert on public.funnel_references for insert with check (private.has_permission(workspace_id, 'funnels.reference.manage', client_id));
create policy funnel_references_update on public.funnel_references for update
  using (private.has_permission(workspace_id, 'funnels.reference.manage', client_id)) with check (private.has_permission(workspace_id, 'funnels.reference.manage', client_id));
create policy funnel_references_delete on public.funnel_references for delete using (private.has_permission(workspace_id, 'funnels.reference.manage', client_id));
create trigger audit_funnel_references after insert or delete on public.funnel_references
  for each row execute function private.audit_change('referrer_app', 'referrer_type', 'referrer_id', 'avatar_id', 'offer_id', 'story_id', 'brand_kit_id');
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
    or exists (select 1 from public.approvals a join public.files f on f.id = a.subject_id where f.client_id = old.id)) then
    raise exception 'archive this client instead: it still has work' using errcode = 'P0001';
  end if;
  return old;
end $$;
insert into public.app_pages (app_key, page_key, title, kind, permission_key, parent_page_key) values
  ('office', 'funnels',              'Funnels',          'page',   null, 'home'),
  ('office', 'funnels.avatars',      'Avatars',          'page',   'funnels.avatar.view', 'funnels'),
  ('office', 'funnels.avatar',       'Avatar',           'record', 'funnels.avatar.view', 'funnels.avatars'),
  ('office', 'funnels.offers',       'Offers & products','page',   'funnels.offer.view', 'funnels'),
  ('office', 'funnels.offer',        'Offer',            'record', 'funnels.offer.view', 'funnels.offers'),
  ('office', 'funnels.stories',      'Story bank',       'page',   'funnels.story.view', 'funnels'),
  ('office', 'funnels.story',        'Story',            'record', 'funnels.story.view', 'funnels.stories'),
  ('office', 'funnels.brand_kits',   'Brand kits',       'page',   'funnels.brandkit.view', 'funnels'),
  ('office', 'funnels.brand_kit',    'Brand kit',        'record', 'funnels.brandkit.view', 'funnels.brand_kits');
create or replace function private.seed_funnel_levels(ws uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare lvl uuid;
begin
  insert into public.access_levels (workspace_id, app_key, name, description, is_template)
  values (ws, 'office', 'Funnels · edit', 'See, create and edit funnel records (not sharing with clients, not deleting)', true) returning id into lvl;
  insert into public.access_level_permissions (workspace_id, access_level_id, permission_key)
  select ws, lvl, k from unnest(array[
    'funnels.avatar.view','funnels.avatar.create','funnels.avatar.edit','funnels.offer.view','funnels.offer.create','funnels.offer.edit',
    'funnels.story.view','funnels.story.create','funnels.story.edit','funnels.brandkit.view','funnels.brandkit.create','funnels.brandkit.edit',
    'funnels.reference.view','funnels.reference.manage']) k;
  insert into public.access_levels (workspace_id, app_key, name, description, is_template)
  values (ws, 'office', 'Funnels · read', 'See funnel records, change nothing', true) returning id into lvl;
  insert into public.access_level_permissions (workspace_id, access_level_id, permission_key)
  select ws, lvl, k from unnest(array['funnels.avatar.view','funnels.offer.view','funnels.story.view','funnels.brandkit.view','funnels.reference.view']) k;
end $$;
create or replace function private.workspace_seed_funnel_levels() returns trigger
language plpgsql security definer set search_path = '' as $$
begin perform private.seed_funnel_levels(new.id); return new; end $$;
create trigger workspaces_seed_funnel_levels after insert on public.workspaces
  for each row execute function private.workspace_seed_funnel_levels();
select private.seed_funnel_levels(id) from public.workspaces;
revoke all on all functions in schema private from public;
grant select, insert, update, delete on public.funnel_avatars, public.funnel_offers, public.funnel_stories,
  public.funnel_brand_kits, public.funnel_references to app_user;
grant execute on all functions in schema private to app_user;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update, delete on public.funnel_avatars, public.funnel_offers, public.funnel_stories,
      public.funnel_brand_kits, public.funnel_references to authenticated;
    grant execute on all functions in schema private to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.funnel_avatars, public.funnel_offers, public.funnel_stories,
      public.funnel_brand_kits, public.funnel_references from anon;
  end if;
end $$;
-- ===== 0007_my_organizations.sql =====
set check_function_bodies = off;
create or replace function public.my_organizations()
returns table (org_id uuid, name text, slug text, member_kind text, role text, is_active boolean)
language sql stable security definer set search_path = '' as $$
  select w.id, w.name, w.slug, m.kind, m.role,
         coalesce(p.active_workspace_id = w.id, false)
  from public.memberships m
  join public.workspaces w on w.id = m.workspace_id
  left join public.profiles p on p.id = m.user_id
  where m.user_id = private.current_user_id() and m.status = 'active'
  order by w.name
$$;
revoke all on function public.my_organizations() from public;
grant execute on function public.my_organizations() to app_user;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.my_organizations() to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.my_organizations() from anon;
  end if;
end $$;
-- ===== 0008_clients_foundation.sql =====
set check_function_bodies = off;
insert into public.permissions (key, app_key, description, floor_role, default_role, scopes, sensitive) values
  ('clients.stage.manage',    'clients', 'Define the organization''s client stages',            'admin',  'admin', '{workspace}', false),
  ('clients.note.view',       'clients', 'Read team notes on a client (always internal)',        'viewer', 'admin', '{workspace,client}', true),
  ('clients.note.create',     'clients', 'Add team notes',                                       'editor', 'admin', '{workspace,client}', false),
  ('clients.note.edit',       'clients', 'Edit or archive team notes',                           'editor', 'admin', '{workspace,client}', false),
  ('clients.note.delete',     'clients', 'Permanently delete an ARCHIVED team note',             'admin',  'owner', '{workspace}', true),
  ('clients.request.view',    'clients', 'View requests to a client',                            'viewer', 'admin', '{workspace,client}', false),
  ('clients.request.create',  'clients', 'Create requests to a client',                          'editor', 'admin', '{workspace,client}', false),
  ('clients.request.edit',    'clients', 'Edit or archive requests',                             'editor', 'admin', '{workspace,client}', false),
  ('clients.request.delete',  'clients', 'Permanently delete an ARCHIVED request',               'admin',  'owner', '{workspace}', true),
  ('clients.update.view',     'clients', 'View updates written for a client',                    'viewer', 'admin', '{workspace,client}', false),
  ('clients.update.create',   'clients', 'Write updates for a client',                           'editor', 'admin', '{workspace,client}', false),
  ('clients.update.edit',     'clients', 'Edit or archive updates',                              'editor', 'admin', '{workspace,client}', false),
  ('clients.update.delete',   'clients', 'Permanently delete an ARCHIVED update',                'admin',  'owner', '{workspace}', true),
  ('clients.record.share',    'clients', 'Make a request or update visible to its client',       'editor', 'admin', '{workspace,client}', true);
create table public.client_stages (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,30}$'),
  label text not null check (length(label) between 1 and 60),
  position int not null check (position between 0 and 100),
  progress_only boolean not null default false,   -- the client sees progress, not detail, while in this stage
  created_at timestamptz not null default now(),
  primary key (workspace_id, key)
);
create table public.client_profiles (
  client_id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  business_name text check (length(business_name) <= 200),
  niche text check (length(niche) <= 200),
  email text check (length(email) <= 320),
  phone text check (length(phone) <= 40),
  website text check (website is null or (length(website) <= 300 and website ~ '^https?://')),
  country text check (length(country) <= 80),
  currency text check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'lead' check (status in ('lead', 'proposal', 'active', 'paused', 'past')),
  stage_key text,
  tags text[] not null default '{}' check (cardinality(tags) <= 20),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id) on delete cascade,
  foreign key (workspace_id, stage_key) references public.client_stages (workspace_id, key)
);
create table public.client_notes (            -- Team Notes: internal only, by construction
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null,
  body text not null check (length(body) between 1 and 20000),
  archived_at timestamptz,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id)
);
create table public.client_requests (          -- "request info" and similar asks of the client
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null,
  kind text not null default 'info' check (kind in ('info', 'approval')),
  title text not null check (length(title) between 1 and 200),
  body text check (length(body) <= 8000),
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  response text check (length(response) <= 8000),   -- logged by staff until Portal replies are designed (Phase 6)
  due_on date,
  client_visible boolean not null default false,
  archived_at timestamptz,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id)
);
create table public.client_updates (           -- "share update" step action
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null,
  title text not null check (length(title) between 1 and 200),
  body text check (length(body) <= 20000),
  client_visible boolean not null default false,
  archived_at timestamptz,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id)
);
create or replace function private.client_profile_seed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.client_profiles (workspace_id, client_id) values (new.workspace_id, new.id) on conflict do nothing;
  return new;
end $$;
create trigger clients_profile_seed after insert on public.clients
  for each row execute function private.client_profile_seed();
insert into public.client_profiles (workspace_id, client_id) select workspace_id, id from public.clients on conflict do nothing;
create or replace function private.clients_child_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.current_user_id();
  nv boolean := (to_jsonb(new) ->> 'client_visible')::boolean;
  ov boolean := case when tg_op = 'UPDATE' then (to_jsonb(old) ->> 'client_visible')::boolean end;
begin
  if tg_op = 'INSERT' then
    if uid is not null then new.created_by := uid; end if;
  else
    if new.workspace_id is distinct from old.workspace_id or new.client_id is distinct from old.client_id or new.created_by is distinct from old.created_by then
      raise exception 'records do not move' using errcode = 'P0001';
    end if;
    new.updated_at := now();
  end if;
  if uid is not null and nv is not null and (nv is distinct from coalesce(ov, false))
     and not private.has_permission(new.workspace_id, 'clients.record.share', new.client_id) then
    raise exception 'not found' using errcode = '42501';
  end if;
  return new;
end $$;
create or replace function private.client_profile_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.client_id is distinct from old.client_id or new.workspace_id is distinct from old.workspace_id) then
    raise exception 'records do not move' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger client_profiles_guard before update on public.client_profiles for each row execute function private.client_profile_guard();
create or replace function private.archive_before_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.archived_at is null then raise exception 'archive this record instead' using errcode = 'P0001'; end if;
  return old;
end $$;
create or replace function private.client_stage_in_use() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.client_profiles p where p.workspace_id = old.workspace_id and p.stage_key = old.key) then
    raise exception 'stage is in use: move those clients first' using errcode = 'P0001';
  end if;
  return old;
end $$;
create trigger client_stages_in_use before delete on public.client_stages for each row execute function private.client_stage_in_use();
do $$
declare t text; obj text; cols text;
begin
  for t, obj, cols in values
    ('client_notes', 'note', '''client_id'', ''archived_at'''),                                   -- never the body
    ('client_requests', 'request', '''kind'', ''title'', ''status'', ''client_visible'', ''archived_at'', ''due_on'''),
    ('client_updates', 'update', '''title'', ''client_visible'', ''archived_at''')
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('create policy org_scope on public.%I as restrictive for all
      using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id))', t);
    if t = 'client_notes' then   -- internal only: no client path exists
      execute format('create policy %1$s_select on public.%1$I for select using (private.has_permission(workspace_id, %2$L, client_id))', t, 'clients.' || obj || '.view');
    else
      execute format('create policy %1$s_select on public.%1$I for select using (
        private.has_permission(workspace_id, %2$L, client_id)
        or (client_visible and archived_at is null and private.client_of(workspace_id, client_id)))', t, 'clients.' || obj || '.view');
    end if;
    execute format('create policy %1$s_insert on public.%1$I for insert with check (private.has_permission(workspace_id, %2$L, client_id))', t, 'clients.' || obj || '.create');
    execute format('create policy %1$s_update on public.%1$I for update
      using (private.has_permission(workspace_id, %2$L, client_id)) with check (private.has_permission(workspace_id, %2$L, client_id))', t, 'clients.' || obj || '.edit');
    execute format('create policy %1$s_delete on public.%1$I for delete using (private.has_permission(workspace_id, %2$L))', t, 'clients.' || obj || '.delete');
    execute format('create trigger %1$s_guard before insert or update on public.%1$I for each row execute function private.clients_child_guard()', t);
    execute format('create trigger %1$s_refuse_delete before delete on public.%1$I for each row execute function private.archive_before_delete()', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I for each row execute function private.audit_change(%2$s)', t, cols);
    execute format('create index %1$s_client on public.%1$I (workspace_id, client_id) where archived_at is null', t);
  end loop;
end $$;
alter table public.client_profiles enable row level security;
alter table public.client_profiles force row level security;
create policy org_scope on public.client_profiles as restrictive for all
  using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
create policy client_profiles_select on public.client_profiles for select using (private.has_permission(workspace_id, 'clients.client.view', client_id));
create policy client_profiles_update on public.client_profiles for update
  using (private.has_permission(workspace_id, 'clients.client.edit', client_id)) with check (private.has_permission(workspace_id, 'clients.client.edit', client_id));
create trigger audit_client_profiles after update on public.client_profiles
  for each row execute function private.audit_change('status', 'stage_key', 'tags');
alter table public.client_stages enable row level security;
alter table public.client_stages force row level security;
create policy org_scope on public.client_stages as restrictive for all
  using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
create policy client_stages_select on public.client_stages for select using (private.is_staff(workspace_id) and private.can_use_app(workspace_id, 'clients'));
create policy client_stages_insert on public.client_stages for insert with check (private.has_permission(workspace_id, 'clients.stage.manage'));
create policy client_stages_update on public.client_stages for update
  using (private.has_permission(workspace_id, 'clients.stage.manage')) with check (private.has_permission(workspace_id, 'clients.stage.manage'));
create policy client_stages_delete on public.client_stages for delete using (private.has_permission(workspace_id, 'clients.stage.manage'));
create trigger audit_client_stages after insert or update or delete on public.client_stages
  for each row when (private.current_user_id() is not null)   -- the default pipeline seeded for a new organization is not a person's decision
  execute function private.audit_change('key', 'label', 'position', 'progress_only');
create trigger audit_clients_archive after update on public.clients
  for each row when (old.archived_at is distinct from new.archived_at or old.name is distinct from new.name)
  execute function private.audit_change('name', 'archived_at');
create trigger clients_zarchive_before_delete before delete on public.clients
  for each row execute function private.archive_before_delete();
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
create or replace function private.seed_client_stages(ws uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.client_stages (workspace_id, key, label, position, progress_only) values
    (ws, 'onboarding', 'Onboarding', 1, false), (ws, 'strategy', 'Strategy', 2, false), (ws, 'build', 'Build', 3, true),
    (ws, 'launch', 'Launch', 4, false), (ws, 'optimise', 'Optimise', 5, false)
  on conflict do nothing;
end $$;
create or replace function private.workspace_seed_client_stages() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.seed_client_stages(new.id);
  perform private.grant_client_child_permissions(new.id);
  return new;
end $$;
create or replace function private.grant_client_child_permissions(ws uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.access_level_permissions (workspace_id, access_level_id, permission_key)
  select l.workspace_id, l.id, k from public.access_levels l
  cross join unnest(case l.name
      when 'Client team'         then array['clients.note.view','clients.note.create','clients.note.edit','clients.request.view','clients.request.create','clients.request.edit','clients.update.view','clients.update.create','clients.update.edit']
      when 'All clients · edit'  then array['clients.note.view','clients.note.create','clients.note.edit','clients.request.view','clients.request.create','clients.request.edit','clients.update.view','clients.update.create','clients.update.edit']
      when 'All clients · read'  then array['clients.note.view','clients.request.view','clients.update.view']
      else array[]::text[] end) k
  where l.workspace_id = ws and l.app_key = 'clients' and l.is_template
  on conflict do nothing;
end $$;
create trigger workspaces_seed_zclients after insert on public.workspaces
  for each row execute function private.workspace_seed_client_stages();
select private.seed_client_stages(id) from public.workspaces;
select private.grant_client_child_permissions(id) from public.workspaces;
insert into public.app_pages (app_key, page_key, title, kind, permission_key, parent_page_key) values
  ('clients', 'record',  'Client', 'record', 'clients.client.view', 'list')
on conflict do nothing;
revoke all on all functions in schema private from public;
grant select, insert, update, delete on public.client_notes, public.client_requests, public.client_updates, public.client_stages to app_user;
grant select, update on public.client_profiles to app_user;
grant execute on all functions in schema private to app_user;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update, delete on public.client_notes, public.client_requests, public.client_updates, public.client_stages to authenticated;
    grant select, update on public.client_profiles to authenticated;
    grant execute on all functions in schema private to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.client_notes, public.client_requests, public.client_updates, public.client_stages, public.client_profiles from anon;
  end if;
end $$;
-- ===== 0009_rate_limit_store.sql =====
set check_function_bodies = off;
create unlogged table private.api_rate_limits (        -- unlogged: counters need not survive a crash and cost no WAL
  key text not null check (length(key) <= 80),
  cls text not null check (cls in ('read', 'write', 'sensitive')),
  window_start timestamptz not null,
  hits int not null,
  primary key (key, cls)
);
create or replace function private.rate_limit_take(p_key text, p_class text, p_max int, p_window_seconds int)
returns table (allowed boolean, retry_after_seconds int)
language plpgsql security definer set search_path = '' as $$
declare r record; win interval := make_interval(secs => p_window_seconds);
begin
  if p_max < 1 or p_window_seconds < 1 then raise exception 'invalid limit' using errcode = '22023'; end if;
  insert into private.api_rate_limits as t (key, cls, window_start, hits) values (p_key, p_class, now(), 1)
  on conflict (key, cls) do update set
    window_start = case when t.window_start + win <= now() then now() else t.window_start end,
    hits = case when t.window_start + win <= now() then 1 else least(t.hits + 1, p_max + 1) end   -- capped: a flood cannot grow the number
  returning t.hits, t.window_start into r;
  if random() < 0.01 then delete from private.api_rate_limits where window_start < now() - interval '1 hour'; end if;   -- opportunistic tidy-up, no scheduler needed
  allowed := r.hits <= p_max;
  retry_after_seconds := greatest(1, ceil(extract(epoch from (r.window_start + win - now())))::int);
  return next;
end $$;
revoke all on all functions in schema private from public;
revoke all on private.api_rate_limits from public;
-- ===== 0010_api_role_lockdown.sql =====
set check_function_bodies = off;
do $$
declare r text; c text; s text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    continue when not exists (select 1 from pg_roles where rolname = r);
    execute format('revoke all on all tables in schema public from %I', r);
    execute format('revoke all on all sequences in schema public from %I', r);
    execute format('revoke all on all functions in schema public from %I', r);
    execute format('revoke all on all tables in schema private from %I', r);
    execute format('revoke all on all functions in schema private from %I', r);
    execute format('revoke all on schema private from %I', r);
    foreach s in array array['tables', 'sequences', 'functions'] loop
      execute format('alter default privileges in schema public revoke all on %s from %I', s, r);
      foreach c in array array['postgres', 'supabase_admin'] loop
        continue when not exists (select 1 from pg_roles where rolname = c);
        begin
          execute format('alter default privileges for role %I in schema public revoke all on %s from %I', c, s, r);
          execute format('alter default privileges for role %I in schema private revoke all on %s from %I', c, s, r);
        exception when others then null;   -- not permitted to change another role's defaults: the schema-level revoke above still applies
        end;
      end loop;
    end loop;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'postgres') then
    begin execute 'grant app_user to postgres with set true, inherit true';
    exception when others then begin execute 'grant app_user to postgres'; exception when others then null; end; end;
  end if;
end $$;
-- ===== 0011_my_permissions.sql =====
set check_function_bodies = off;
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
revoke all on function public.my_permissions() from public;
grant execute on function public.my_permissions() to app_user;
-- ===== 0012_shell_admin_backend.sql =====
set check_function_bodies = off;
update public.apps set sort_order = v.o from (values ('office',10),('projects',20),('clients',30),('portal',40),('drive',50),('planner',60),
  ('forms',70),('value_ladder',80),('social_planner',90),('whiteboard',100),('layer2_agents',110),('funnel_mapper_pro',120)) v(k, o) where apps.key = v.k;
create or replace function public.launcher_catalog()
returns table (app_key text, name text, scope text, lifecycle text, sort_order int, launch_url text, state text, other_org text)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); r text := private.request_org(); ws uuid; adm boolean;
begin
  if uid is null or r is null or r !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return; end if;
  ws := r::uuid;
  if private.is_staff(ws) then
    adm := private.has_role(ws, 'admin');
    return query
      select t.k, t.n, t.s, t.l, t.o, t.u, t.st, t.oo from (
        select a.key k, a.name n, a.scope s, a.lifecycle l, a.sort_order o, wa.launch_url u,
          case
            when a.lifecycle = 'coming_soon' then 'coming_soon'
            when a.scope = 'portal' then case when coalesce(wa.enabled, false) then 'available' else 'locked' end
            when coalesce(wa.enabled, false) and private.can_use_app(ws, a.key) then 'available'
            when exists (select 1 from public.workspace_apps wo join public.memberships mo on mo.workspace_id = wo.workspace_id
                          where wo.app_key = a.key and wo.enabled and wo.workspace_id <> ws and mo.user_id = uid and mo.kind = 'staff'
                            and mo.status = 'active' and private.can_use_app(wo.workspace_id, a.key)) then 'not_set_up'
            else 'hidden' end st,
          (select w.name from public.workspace_apps wo join public.memberships mo on mo.workspace_id = wo.workspace_id
             join public.workspaces w on w.id = wo.workspace_id
            where wo.app_key = a.key and wo.enabled and wo.workspace_id <> ws and mo.user_id = uid and mo.kind = 'staff' and mo.status = 'active'
              and private.can_use_app(wo.workspace_id, a.key) order by w.name limit 1) oo
        from public.apps a left join public.workspace_apps wa on wa.app_key = a.key and wa.workspace_id = ws
        where a.key <> 'platform' and a.lifecycle in ('active', 'coming_soon', 'deprecated') and (a.scope <> 'portal' or adm)
      ) t where t.st <> 'hidden' order by t.o;
  elsif exists (select 1 from public.memberships m where m.workspace_id = ws and m.user_id = uid and m.kind = 'client' and m.status = 'active') then
    return query
      select a.key, a.name, a.scope, a.lifecycle, a.sort_order, wa.launch_url, 'available'::text, null::text
        from public.apps a join public.workspace_apps wa on wa.app_key = a.key and wa.workspace_id = ws and wa.enabled
       where a.scope = 'portal' and a.lifecycle = 'active';
  end if;
end $$;
alter table public.profiles add column email text check (email is null or length(email) <= 320);
create or replace function public.profile_touch(p_name text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id();
begin
  if uid is null then return; end if;
  insert into public.profiles (id, email, display_name) values (uid, private.current_user_email(), nullif(left(trim(coalesce(p_name, '')), 120), ''))
  on conflict (id) do update set email = coalesce(excluded.email, public.profiles.email),
                                 display_name = coalesce(public.profiles.display_name, excluded.display_name);
end $$;
alter table public.invitations add column declined_at timestamptz;
create or replace function public.invitation_preview(p_token text)
returns table (org_name text, org_slug text, kind text, role text, inviter_name text, email text)
language sql stable security definer set search_path = '' as $$
  select w.name, w.slug, i.kind, i.role, coalesce(p.display_name, 'Someone'), i.email
    from public.invitations i join public.workspaces w on w.id = i.workspace_id left join public.profiles p on p.id = i.invited_by
   where i.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
     and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
     and i.email = private.current_user_email()       -- anyone else gets zero rows: a token reveals nothing
$$;
create or replace function public.invitation_decline(p_token text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.invitations i set revoked_at = now(), declined_at = now()
   where i.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
     and i.accepted_at is null and i.revoked_at is null and i.expires_at > now() and i.email = private.current_user_email();
  get diagnostics n = row_count;
  return n = 1;
end $$;
create or replace function public.members_list()
returns table (row_kind text, user_id uuid, invitation_id uuid, display_name text, email text, role text, status text, since timestamptz, is_you boolean)
language plpgsql stable security definer set search_path = '' as $$
declare ws uuid; r text := private.request_org();
begin
  if r is null or r !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return; end if;
  ws := r::uuid;
  if not private.has_role(ws, 'admin') then return; end if;
  return query
    select 'member'::text, m.user_id, null::uuid, p.display_name, p.email, m.role, case when m.status = 'active' then 'active' else 'deactivated' end,
           null::timestamptz, m.user_id = private.current_user_id()
      from public.memberships m left join public.profiles p on p.id = m.user_id
     where m.workspace_id = ws and m.kind = 'staff'
    union all
    select 'invitation', null::uuid, i.id, null::text, i.email, i.role, 'invited', i.created_at, false
      from public.invitations i
     where i.workspace_id = ws and i.kind = 'staff' and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
     order by 2 nulls last, 5;
end $$;
create or replace function private.member_target(p_user uuid, p_new_role text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare r text := private.request_org(); ws uuid; trole text;
begin
  if r is null or r !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'not found' using errcode = '42501'; end if;
  ws := r::uuid;
  if not private.has_role(ws, 'admin') then raise exception 'not found' using errcode = '42501'; end if;
  select m.role into trole from public.memberships m where m.workspace_id = ws and m.user_id = p_user and m.kind = 'staff';
  if trole is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if (trole = 'owner' or p_new_role = 'owner') and not private.has_role(ws, 'owner') then raise exception 'not found' using errcode = '42501'; end if;
  return ws;
end $$;
create or replace function public.member_set_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare ws uuid;
begin
  if p_role not in ('owner', 'admin', 'editor', 'viewer') then raise exception 'invalid role' using errcode = 'P0001'; end if;
  ws := private.member_target(p_user, p_role);
  update public.memberships set role = p_role where workspace_id = ws and user_id = p_user and kind = 'staff';
end $$;
create or replace function public.member_set_status(p_user uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare ws uuid;
begin
  if p_status not in ('active', 'deactivated') then raise exception 'invalid status' using errcode = 'P0001'; end if;
  ws := private.member_target(p_user, null);
  update public.memberships set status = p_status where workspace_id = ws and user_id = p_user and kind = 'staff';
end $$;
create or replace function public.member_remove(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare ws uuid;
begin
  ws := private.member_target(p_user, null);
  delete from public.access_assignments where workspace_id = ws and principal_type = 'user' and principal_id = p_user;
  delete from public.permission_overrides where workspace_id = ws and principal_type = 'user' and principal_id = p_user;
  delete from public.group_members where workspace_id = ws and user_id = p_user;
  delete from public.app_grants where workspace_id = ws and user_id = p_user;
  delete from public.memberships where workspace_id = ws and user_id = p_user and kind = 'staff';   -- last-owner guard applies
end $$;
create or replace function public.invitation_cancel(p_invitation uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r text := private.request_org(); ws uuid; n int;
begin
  if r is null or r !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'not found' using errcode = '42501'; end if;
  ws := r::uuid;
  if not private.has_role(ws, 'admin') then raise exception 'not found' using errcode = '42501'; end if;
  update public.invitations set revoked_at = now() where id = p_invitation and workspace_id = ws and accepted_at is null and revoked_at is null
     and (role <> 'owner' or private.has_role(ws, 'owner'));
  get diagnostics n = row_count;
  if n = 0 then raise exception 'not found' using errcode = 'P0002'; end if;
end $$;
revoke all on all functions in schema private from public;
revoke all on function public.launcher_catalog(), public.profile_touch(text), public.invitation_preview(text), public.invitation_decline(text),
  public.members_list(), public.member_set_role(uuid, text), public.member_set_status(uuid, text), public.member_remove(uuid), public.invitation_cancel(uuid) from public;
grant execute on function public.launcher_catalog(), public.profile_touch(text), public.invitation_preview(text), public.invitation_decline(text),
  public.members_list(), public.member_set_role(uuid, text), public.member_set_status(uuid, text), public.member_remove(uuid), public.invitation_cancel(uuid) to app_user;
-- ===== 0013_projects.sql =====
set check_function_bodies = off;
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
create policy task_checklist_select on public.task_checklist_items for select using (private.has_permission(workspace_id, 'projects.task.view', client_id, project_id));
create policy task_checklist_insert on public.task_checklist_items for insert with check (
  private.has_permission(workspace_id, 'projects.task.edit',
    (select t.client_id from public.project_tasks t where t.workspace_id = task_checklist_items.workspace_id and t.id = task_checklist_items.task_id),
    (select t.project_id from public.project_tasks t where t.workspace_id = task_checklist_items.workspace_id and t.id = task_checklist_items.task_id)));
create policy task_checklist_update on public.task_checklist_items for update
  using (private.has_permission(workspace_id, 'projects.task.edit', client_id, project_id)) with check (private.has_permission(workspace_id, 'projects.task.edit', client_id, project_id));
create policy task_checklist_delete on public.task_checklist_items for delete using (private.has_permission(workspace_id, 'projects.task.edit', client_id, project_id));
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
create trigger audit_projects after update or delete on public.projects
  for each row execute function private.audit_change('name', 'status', 'owner_id', 'due_on', 'client_visible', 'archived_at');
create trigger audit_project_tasks after insert or update or delete on public.project_tasks
  for each row execute function private.audit_change('project_id', 'title', 'status', 'priority', 'assignee_id', 'due_on', 'client_visible', 'archived_at');
create trigger audit_task_checklist after delete on public.task_checklist_items
  for each row execute function private.audit_change('task_id');
create trigger audit_time_entries after insert or update or delete on public.time_entries
  for each row execute function private.audit_change('project_id', 'task_id', 'user_id', 'started_at', 'ended_at', 'billable', 'archived_at');
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
create trigger workspaces_seed_zprojects after insert on public.workspaces
  for each row execute function private.workspace_seed_project_levels();
select private.grant_project_child_permissions(id) from public.workspaces;
insert into public.app_pages (app_key, page_key, title, kind, permission_key, parent_page_key) values
  ('projects', 'time', 'Time', 'page', 'projects.time.view', 'home')
on conflict do nothing;
revoke all on all functions in schema private from public;
grant select, insert, update, delete on public.project_tasks, public.task_checklist_items, public.time_entries to app_user;
-- ===== 0014_drive.sql =====
set check_function_bodies = off;
insert into public.permissions (key, app_key, description, floor_role, default_role, scopes, sensitive) values
  ('drive.folder.manage',          'drive', 'Create, rename, move and archive folders',                           'editor', 'editor', '{workspace,client}', false),
  ('drive.file.edit',              'drive', 'Rename, move and add versions to files uploaded by others',          'editor', 'editor', '{workspace,client}', false),
  ('drive.sop.manage',             'drive', 'Create, edit, archive or delete protected SOP documents',            'admin',  'owner',  '{workspace}', true),
  ('drive.personal.break_glass',   'drive', 'Open another person''s personal space (reason, log and notice)',      'owner',  'owner',  '{workspace}', true);
create table public.drive_folders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  space text not null check (space in ('shared', 'personal', 'client')),
  client_id uuid,
  owner_id uuid,
  parent_id uuid,
  name text not null check (length(name) between 1 and 200) check (name !~ '[/\\]'),
  archived_at timestamptz,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  check ((space = 'shared' and client_id is null and owner_id is null)
      or (space = 'client' and client_id is not null and owner_id is null)
      or (space = 'personal' and client_id is null and owner_id is not null)),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id),
  foreign key (workspace_id, owner_id) references public.memberships (workspace_id, user_id),
  foreign key (workspace_id, parent_id) references public.drive_folders (workspace_id, id)
);
create unique index drive_folders_unique_name on public.drive_folders
  (workspace_id, space, coalesce(client_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid),
   coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name)) where archived_at is null;
create index drive_folders_parent on public.drive_folders (workspace_id, parent_id) where archived_at is null;
alter table public.files
  add column space text not null default 'shared' check (space in ('shared', 'personal', 'client')),
  add column owner_id uuid,
  add column folder_id uuid,
  add column name text not null default 'Untitled' check (length(name) between 1 and 200) check (name !~ '[/\\]'),
  add column kind text not null default 'file' check (kind in ('file', 'document')),
  add column mime_type text check (length(mime_type) <= 120),
  add column size_bytes bigint check (size_bytes between 0 and 5368709120),
  add column current_version int not null default 1,
  add column protected_sop boolean not null default false,
  add column sop_key text check (sop_key ~ '^[a-z][a-z0-9_]{1,40}$'),
  add column archived_at timestamptz,
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now();
alter table public.files alter column name drop default;
alter table public.files alter column space drop default;                            -- the guard picks it (a client's file is a client file) when the insert does not say
alter table public.files alter column storage_path drop not null;                    -- first-party documents have no stored file
update public.files set space = 'client' where client_id is not null;
alter table public.files
  add constraint files_space_shape check ((space = 'shared' and client_id is null and owner_id is null)
      or (space = 'client' and client_id is not null and owner_id is null)
      or (space = 'personal' and client_id is null and owner_id is not null)),
  add constraint files_kind_path check ((kind = 'file' and storage_path is not null) or (kind = 'document' and storage_path is null)),
  add constraint files_sop_shape check ((not protected_sop and sop_key is null) or (protected_sop and space = 'shared' and kind = 'document')),
  add foreign key (workspace_id, owner_id) references public.memberships (workspace_id, user_id),
  add foreign key (workspace_id, folder_id) references public.drive_folders (workspace_id, id);
create unique index files_sop_key on public.files (workspace_id, sop_key) where sop_key is not null and archived_at is null;
create index files_folder on public.files (workspace_id, space, folder_id) where archived_at is null;
create index files_owner on public.files (workspace_id, owner_id) where space = 'personal';
create table public.file_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  file_id uuid not null,
  version int not null check (version >= 1),
  storage_path text,
  body text check (length(body) <= 200000),            -- first-party documents keep their text here
  size_bytes bigint check (size_bytes between 0 and 5368709120),
  note text check (length(note) <= 300),
  created_by uuid, created_at timestamptz not null default now(),
  unique (file_id, version),
  check ((storage_path is not null) <> (body is not null)),
  foreign key (workspace_id, file_id) references public.files (workspace_id, id) on delete cascade
);
create index file_versions_file on public.file_versions (workspace_id, file_id, version desc);
create table public.drive_share_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  file_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  use_count int not null default 0,
  last_used_at timestamptz,
  created_by uuid, created_at timestamptz not null default now(),
  check (expires_at > created_at and expires_at <= created_at + interval '31 days'),
  foreign key (workspace_id, file_id) references public.files (workspace_id, id) on delete cascade
);
create index drive_share_links_file on public.drive_share_links (workspace_id, file_id);
create table public.drive_break_glass (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  accessed_by uuid not null,
  owner_id uuid not null,
  reason text not null check (length(reason) between 10 and 500),
  files_seen int not null default 0,
  accessed_at timestamptz not null default now(),
  foreign key (workspace_id, accessed_by) references public.memberships (workspace_id, user_id),
  foreign key (workspace_id, owner_id) references public.memberships (workspace_id, user_id)
);
create table public.drive_notices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null,
  kind text not null check (kind in ('personal_space_opened')),
  break_glass_id uuid references public.drive_break_glass (id),
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  foreign key (workspace_id, user_id) references public.memberships (workspace_id, user_id)
);
create index drive_notices_user on public.drive_notices (workspace_id, user_id, created_at desc);
create or replace function private.can_read_file(ws uuid, p_space text, p_client uuid, p_owner uuid, p_client_visible boolean, p_archived boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select case p_space
    when 'personal' then p_owner = private.current_user_id() and private.can_use_app(ws, 'drive')
    when 'shared'   then private.has_permission(ws, 'drive.file.view')
    else (private.has_permission(ws, 'drive.file.view', p_client) and private.has_permission(ws, 'clients.client.view', p_client))
         or (p_client_visible and not p_archived and private.client_of(ws, p_client)) end
$$;
create or replace function private.can_write_file(ws uuid, p_space text, p_client uuid, p_owner uuid, p_uploaded_by uuid, p_protected boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when p_protected then private.has_permission(ws, 'drive.sop.manage')
    when p_space = 'personal' then p_owner = private.current_user_id() and private.can_use_app(ws, 'drive')
    else private.has_permission(ws, 'drive.file.delete_any')
      or private.has_permission(ws, 'drive.file.edit', p_client)
      or (p_uploaded_by = private.current_user_id() and private.has_permission(ws, 'drive.file.upload', p_client)) end
$$;
create or replace function private.can_delete_file(ws uuid, p_space text, p_client uuid, p_owner uuid, p_uploaded_by uuid, p_protected boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when p_protected then private.has_permission(ws, 'drive.sop.manage')
    when p_space = 'personal' then p_owner = private.current_user_id() and private.can_use_app(ws, 'drive')
    else private.has_permission(ws, 'drive.file.delete_any') or (p_uploaded_by = private.current_user_id() and private.has_permission(ws, 'drive.file.upload', p_client)) end
$$;
create or replace function private.drive_path_ok(ws uuid, p_space text, p_client uuid, p_owner uuid, p_path text) returns boolean
language sql immutable set search_path = '' as $$
  select p_path is null or (not p_path like '%..%' and length(p_path) <= 600 and case p_space
    when 'personal' then starts_with(p_path, ws::text || '/personal/' || p_owner::text || '/')
    when 'client'   then starts_with(p_path, ws::text || '/clients/' || p_client::text || '/')
    else starts_with(p_path, ws::text || '/') and not starts_with(p_path, ws::text || '/personal/') and not starts_with(p_path, ws::text || '/clients/') end)   -- new files use ws/shared/; older paths (ws/...) stay valid
$$;
create or replace function private.drive_folders_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); pf public.drive_folders; depth int := 0; cur uuid;
begin
  if tg_op = 'INSERT' then
    if uid is not null then new.created_by := uid; end if;
  else
    if new.workspace_id is distinct from old.workspace_id or new.space is distinct from old.space or new.client_id is distinct from old.client_id
       or new.owner_id is distinct from old.owner_id or new.created_by is distinct from old.created_by then
      raise exception 'records do not move' using errcode = 'P0001';
    end if;
    new.updated_at := now();
  end if;
  if new.parent_id is not null then
    select * into pf from public.drive_folders f where f.workspace_id = new.workspace_id and f.id = new.parent_id;
    if pf.id is null or pf.space is distinct from new.space or pf.client_id is distinct from new.client_id or pf.owner_id is distinct from new.owner_id then
      raise exception 'that folder belongs somewhere else' using errcode = 'P0001';
    end if;
    if tg_op = 'UPDATE' then       -- no loops, and a sensible depth
      cur := new.parent_id;
      while cur is not null and depth < 20 loop
        if cur = new.id then raise exception 'a folder cannot go inside itself' using errcode = 'P0001'; end if;
        select f.parent_id into cur from public.drive_folders f where f.id = cur; depth := depth + 1;
      end loop;
    end if;
  end if;
  return new;
end $$;
create trigger drive_folders_guard before insert or update on public.drive_folders for each row execute function private.drive_folders_guard();
create or replace function private.files_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); pf public.drive_folders; op boolean := false; ov boolean := false;
begin
  if tg_op = 'INSERT' then
    if uid is not null then new.uploaded_by := uid; end if;
    new.space := coalesce(new.space, case when new.client_id is not null then 'client' else 'shared' end);
    new.name := coalesce(new.name, 'Untitled');
    new.current_version := 1;
    if new.space = 'personal' and uid is not null then new.owner_id := coalesce(new.owner_id, uid); end if;
  else
    if new.workspace_id is distinct from old.workspace_id or new.space is distinct from old.space or new.client_id is distinct from old.client_id
       or new.owner_id is distinct from old.owner_id or new.uploaded_by is distinct from old.uploaded_by or new.kind is distinct from old.kind then
      raise exception 'records do not move' using errcode = 'P0001';
    end if;
    new.updated_at := now();
    op := old.protected_sop; ov := old.client_visible;
    if old.protected_sop and uid is not null and not private.has_permission(new.workspace_id, 'drive.sop.manage') then
      raise exception 'not found' using errcode = '42501';
    end if;
  end if;
  if new.protected_sop is distinct from op and uid is not null
     and not private.has_permission(new.workspace_id, 'drive.sop.manage') then
    raise exception 'not found' using errcode = '42501';
  end if;
  if not private.drive_path_ok(new.workspace_id, new.space, new.client_id, new.owner_id, new.storage_path) then
    raise exception 'that storage path is not allowed here' using errcode = 'P0001';
  end if;
  if new.folder_id is not null then
    select * into pf from public.drive_folders f where f.workspace_id = new.workspace_id and f.id = new.folder_id;
    if pf.id is null or pf.space is distinct from new.space or pf.client_id is distinct from new.client_id or pf.owner_id is distinct from new.owner_id then
      raise exception 'that folder belongs somewhere else' using errcode = 'P0001';
    end if;
  end if;
  if new.client_visible and new.space <> 'client' then raise exception 'only a client''s own files can be shared with the client' using errcode = 'P0001'; end if;
  if uid is not null and new.client_visible is distinct from ov
     and not private.has_permission(new.workspace_id, 'drive.file.share', new.client_id) then
    raise exception 'not found' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger files_guard before insert or update on public.files for each row execute function private.files_guard();
create or replace function private.file_versions_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); f public.files;
begin
  if tg_op <> 'INSERT' then raise exception 'versions are history and cannot change' using errcode = 'P0001'; end if;
  select * into f from public.files x where x.workspace_id = new.workspace_id and x.id = new.file_id;
  if f.id is null then raise exception 'not found' using errcode = '42501'; end if;
  if uid is not null then
    new.created_by := uid;
    if not private.can_write_file(f.workspace_id, f.space, f.client_id, f.owner_id, f.uploaded_by, f.protected_sop) then raise exception 'not found' using errcode = '42501'; end if;
  end if;
  if f.archived_at is not null then raise exception 'restore this file before adding a version' using errcode = 'P0001'; end if;
  if (f.kind = 'document') <> (new.body is not null) then raise exception 'a document keeps text, a file keeps a stored copy' using errcode = 'P0001'; end if;
  if not private.drive_path_ok(f.workspace_id, f.space, f.client_id, f.owner_id, new.storage_path) then raise exception 'that storage path is not allowed here' using errcode = 'P0001'; end if;
  new.version := coalesce((select max(v.version) from public.file_versions v where v.file_id = new.file_id), 0) + 1;
  return new;
end $$;
create trigger file_versions_guard before insert or update on public.file_versions for each row execute function private.file_versions_guard();
create or replace function private.file_versions_after() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.files set current_version = new.version, storage_path = coalesce(new.storage_path, storage_path), size_bytes = new.size_bytes, updated_at = now()
   where workspace_id = new.workspace_id and id = new.file_id;
  return new;
end $$;
create trigger file_versions_after after insert on public.file_versions for each row execute function private.file_versions_after();
create or replace function private.drive_links_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); f public.files;
begin
  if tg_op = 'INSERT' then
    select * into f from public.files x where x.workspace_id = new.workspace_id and x.id = new.file_id;
    if f.id is null then raise exception 'not found' using errcode = '42501'; end if;
    if f.space <> 'shared' or f.protected_sop or f.archived_at is not null then raise exception 'this file cannot be shared by link' using errcode = 'P0001'; end if;
    if uid is not null then
      new.created_by := uid;
      if not private.has_permission(new.workspace_id, 'drive.file.share') then raise exception 'not found' using errcode = '42501'; end if;
    end if;
  else
    if new.workspace_id is distinct from old.workspace_id or new.file_id is distinct from old.file_id or new.token_hash is distinct from old.token_hash
       or new.expires_at is distinct from old.expires_at or new.created_by is distinct from old.created_by then
      raise exception 'a link can only be revoked' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger drive_links_guard before insert or update on public.drive_share_links for each row execute function private.drive_links_guard();
create trigger drive_folders_refuse_delete before delete on public.drive_folders for each row execute function private.archive_before_delete();
create trigger files_refuse_delete before delete on public.files for each row execute function private.archive_before_delete();
create or replace function private.drive_folder_empty() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.files where folder_id = old.id) or exists (select 1 from public.drive_folders where parent_id = old.id) then
    raise exception 'empty this folder first' using errcode = 'P0001';
  end if;
  return old;
end $$;
create trigger drive_folders_empty before delete on public.drive_folders for each row execute function private.drive_folder_empty();
do $$
declare t text;
begin
  foreach t in array array['drive_folders', 'file_versions', 'drive_share_links', 'drive_break_glass', 'drive_notices'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('create policy org_scope on public.%I as restrictive for all
      using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id))', t);
  end loop;
end $$;
drop policy files_select on public.files;  drop policy files_insert on public.files;
drop policy files_update on public.files;  drop policy files_delete on public.files;
create policy files_select on public.files for select using (private.can_read_file(workspace_id, space, client_id, owner_id, client_visible, archived_at is not null));
create policy files_insert on public.files for insert with check (
  uploaded_by = private.current_user_id() and not protected_sop and (
    (space = 'shared'   and private.has_permission(workspace_id, 'drive.file.upload'))
 or (space = 'client'   and private.has_permission(workspace_id, 'drive.file.upload', client_id) and private.has_permission(workspace_id, 'clients.client.view', client_id))
 or (space = 'personal' and owner_id = private.current_user_id() and private.can_use_app(workspace_id, 'drive'))));
create policy files_update on public.files for update
  using (private.can_read_file(workspace_id, space, client_id, owner_id, false, archived_at is not null) and private.can_write_file(workspace_id, space, client_id, owner_id, uploaded_by, protected_sop))
  with check (private.can_write_file(workspace_id, space, client_id, owner_id, uploaded_by, protected_sop));
create policy files_delete on public.files for delete using (
  private.can_read_file(workspace_id, space, client_id, owner_id, false, archived_at is not null)
  and private.can_delete_file(workspace_id, space, client_id, owner_id, uploaded_by, protected_sop));
create policy drive_folders_select on public.drive_folders for select using (private.can_read_file(workspace_id, space, client_id, owner_id, false, false));
create policy drive_folders_insert on public.drive_folders for insert with check (
  (space = 'shared'   and private.has_permission(workspace_id, 'drive.folder.manage'))
 or (space = 'client' and private.has_permission(workspace_id, 'drive.folder.manage', client_id) and private.has_permission(workspace_id, 'clients.client.view', client_id))
 or (space = 'personal' and owner_id = private.current_user_id() and private.can_use_app(workspace_id, 'drive')));
create policy drive_folders_update on public.drive_folders for update
  using (private.can_read_file(workspace_id, space, client_id, owner_id, false, false) and (
    (space = 'personal' and owner_id = private.current_user_id()) or (space <> 'personal' and private.has_permission(workspace_id, 'drive.folder.manage', client_id))))
  with check ((space = 'personal' and owner_id = private.current_user_id()) or (space <> 'personal' and private.has_permission(workspace_id, 'drive.folder.manage', client_id)));
create policy drive_folders_delete on public.drive_folders for delete using (
  (space = 'personal' and owner_id = private.current_user_id()) or (space <> 'personal' and private.has_permission(workspace_id, 'drive.folder.manage', client_id) and private.has_permission(workspace_id, 'drive.file.delete_any')));
create policy file_versions_select on public.file_versions for select using (exists (select 1 from public.files f where f.workspace_id = file_versions.workspace_id and f.id = file_versions.file_id));
create policy file_versions_insert on public.file_versions for insert with check (exists (select 1 from public.files f where f.workspace_id = file_versions.workspace_id and f.id = file_versions.file_id));
create policy drive_share_links_select on public.drive_share_links for select using (private.has_permission(workspace_id, 'drive.file.share'));
create policy drive_share_links_insert on public.drive_share_links for insert with check (private.has_permission(workspace_id, 'drive.file.share'));
create policy drive_share_links_update on public.drive_share_links for update using (private.has_permission(workspace_id, 'drive.file.share')) with check (private.has_permission(workspace_id, 'drive.file.share'));
create policy drive_break_glass_select on public.drive_break_glass for select using (private.has_permission(workspace_id, 'drive.personal.break_glass') or owner_id = private.current_user_id());
create policy drive_notices_select on public.drive_notices for select using (user_id = private.current_user_id());
create policy drive_notices_update on public.drive_notices for update using (user_id = private.current_user_id()) with check (user_id = private.current_user_id());
create or replace function private.drive_notices_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.workspace_id is distinct from old.workspace_id or new.user_id is distinct from old.user_id or new.kind is distinct from old.kind
     or new.break_glass_id is distinct from old.break_glass_id or new.created_at is distinct from old.created_at then
    raise exception 'a notice can only be marked as seen' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger drive_notices_guard before update on public.drive_notices for each row execute function private.drive_notices_guard();
create or replace function public.drive_break_glass_open(p_owner uuid, p_reason text)
returns table (id uuid, name text, kind text, folder_id uuid, mime_type text, size_bytes bigint, current_version int, updated_at timestamptz, archived_at timestamptz, storage_path text, body text)
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); r text := private.request_org(); ws uuid; n int; log_id uuid;
begin
  if uid is null or r is null or r !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return; end if;
  ws := r::uuid;
  if not private.has_permission(ws, 'drive.personal.break_glass') or p_owner is null or p_owner = uid
     or not exists (select 1 from public.memberships m where m.workspace_id = ws and m.user_id = p_owner and m.kind = 'staff') then return; end if;
  if p_reason is null or length(btrim(p_reason)) < 10 or length(p_reason) > 500 then
    raise exception 'say why, in a sentence' using errcode = 'P0001';
  end if;
  select count(*) into n from public.files f where f.workspace_id = ws and f.space = 'personal' and f.owner_id = p_owner;
  insert into public.drive_break_glass (workspace_id, accessed_by, owner_id, reason, files_seen) values (ws, uid, p_owner, btrim(p_reason), n) returning drive_break_glass.id into log_id;
  insert into public.drive_notices (workspace_id, user_id, kind, break_glass_id) values (ws, p_owner, 'personal_space_opened', log_id);
  return query
    select f.id, f.name, f.kind, f.folder_id, f.mime_type, f.size_bytes, f.current_version, f.updated_at, f.archived_at, v.storage_path, v.body
      from public.files f left join public.file_versions v on v.file_id = f.id and v.version = f.current_version
     where f.workspace_id = ws and f.space = 'personal' and f.owner_id = p_owner order by f.name;
end $$;
create or replace function public.drive_link_resolve(p_token text)
returns table (file_id uuid, name text, kind text, mime_type text, size_bytes bigint, version int, storage_path text, body text)
language plpgsql security definer set search_path = '' as $$
declare l public.drive_share_links; h text;
begin
  if p_token is null or length(p_token) < 32 or length(p_token) > 200 then return; end if;
  h := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  select * into l from public.drive_share_links x where x.token_hash = h and x.revoked_at is null and x.expires_at > now();
  if l.id is null then return; end if;
  update public.drive_share_links set use_count = use_count + 1, last_used_at = now() where id = l.id;
  return query
    select f.id, f.name, f.kind, f.mime_type, f.size_bytes, f.current_version, v.storage_path, v.body
      from public.files f join public.file_versions v on v.file_id = f.id and v.version = f.current_version
     where f.id = l.file_id and f.space = 'shared' and not f.protected_sop and f.archived_at is null;
end $$;
create trigger audit_drive_folders after insert or update or delete on public.drive_folders
  for each row execute function private.audit_change('space', 'client_id', 'owner_id', 'parent_id', 'name', 'archived_at');
create trigger audit_files after insert or update or delete on public.files
  for each row execute function private.audit_change('space', 'client_id', 'owner_id', 'folder_id', 'name', 'kind', 'protected_sop', 'sop_key', 'client_visible', 'archived_at', 'current_version');
create trigger audit_file_versions after insert on public.file_versions
  for each row execute function private.audit_change('file_id', 'version', 'size_bytes');
create trigger audit_drive_share_links after insert or update on public.drive_share_links
  for each row execute function private.audit_change('file_id', 'expires_at', 'revoked_at');
create trigger audit_drive_break_glass after insert on public.drive_break_glass
  for each row execute function private.audit_change('accessed_by', 'owner_id', 'files_seen');
insert into public.app_pages (app_key, page_key, title, kind, permission_key, parent_page_key) values
  ('drive', 'personal', 'My files', 'page', null, 'home'),
  ('drive', 'sops',     'SOPs',     'page', 'drive.file.view', 'home')
on conflict do nothing;
revoke all on all functions in schema private from public;
revoke all on function public.drive_break_glass_open(uuid, text) from public;
revoke all on function public.drive_link_resolve(text) from public;
grant select, insert, update, delete on public.drive_folders to app_user;
grant select, insert on public.file_versions to app_user;
grant select, insert, update on public.drive_share_links to app_user;
grant select on public.drive_break_glass to app_user;
grant select, update on public.drive_notices to app_user;
grant execute on function public.drive_break_glass_open(uuid, text) to app_user;
grant execute on function public.drive_link_resolve(text) to app_user;
grant execute on function private.can_read_file(uuid, text, uuid, uuid, boolean, boolean) to app_user;
grant execute on function private.can_write_file(uuid, text, uuid, uuid, uuid, boolean) to app_user;
grant execute on function private.can_delete_file(uuid, text, uuid, uuid, uuid, boolean) to app_user;
-- ===== 0015_planner.sql =====
set check_function_bodies = off;
insert into public.permissions (key, app_key, description, floor_role, default_role, scopes, sensitive) values
  ('planner.objective.view',   'planner', 'View objectives, measures and links',                       'viewer', 'viewer', '{workspace,client}', false),
  ('planner.objective.create', 'planner', 'Create objectives and measures',                            'editor', 'editor', '{workspace,client}', false),
  ('planner.objective.edit',   'planner', 'Edit, link and archive objectives and measures',            'editor', 'editor', '{workspace,client}', false),
  ('planner.objective.delete', 'planner', 'Permanently delete an ARCHIVED objective or measure',       'admin',  'owner',  '{workspace}', true),
  ('planner.measure.record',   'planner', 'Record a new value for a measure',                          'editor', 'editor', '{workspace,client}', false),
  ('planner.review.view',      'planner', 'View reviews',                                              'viewer', 'viewer', '{workspace,client}', false),
  ('planner.review.create',    'planner', 'Schedule and write reviews',                                'editor', 'editor', '{workspace,client}', false),
  ('planner.review.edit',      'planner', 'Edit, complete or archive reviews',                         'editor', 'editor', '{workspace,client}', false),
  ('planner.review.delete',    'planner', 'Permanently delete an ARCHIVED review',                     'admin',  'owner',  '{workspace}', true);
create table public.planner_objectives (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid,
  owner_id uuid,
  title text not null check (length(title) between 1 and 300),
  description text check (length(description) <= 8000),
  status text not null default 'planned' check (status in ('planned', 'active', 'achieved', 'dropped')),
  health text check (health in ('on_track', 'at_risk', 'off_track')),
  period_start date,
  period_end date,
  archived_at timestamptz,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (period_end is null or period_start is null or period_end >= period_start),
  unique (workspace_id, id),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id),
  foreign key (workspace_id, owner_id) references public.memberships (workspace_id, user_id)
);
create index planner_objectives_ws on public.planner_objectives (workspace_id, status) where archived_at is null;
create table public.planner_measures (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  objective_id uuid not null,
  client_id uuid,                                   -- copied from the objective by the guard
  name text not null check (length(name) between 1 and 200),
  unit text check (length(unit) <= 20),
  start_value numeric not null default 0 check (start_value between -1000000000000 and 1000000000000),
  target_value numeric not null check (target_value between -1000000000000 and 1000000000000),
  due_on date,
  archived_at timestamptz,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (target_value <> start_value),
  unique (workspace_id, id),
  foreign key (workspace_id, objective_id) references public.planner_objectives (workspace_id, id)
);
create index planner_measures_objective on public.planner_measures (workspace_id, objective_id) where archived_at is null;
create table public.planner_measure_values (       -- history: one row per recorded value, never edited
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  measure_id uuid not null,
  objective_id uuid,
  client_id uuid,
  value numeric not null check (value between -1000000000000 and 1000000000000),
  note text check (length(note) <= 300),
  recorded_by uuid,
  recorded_at timestamptz not null default now(),
  foreign key (workspace_id, measure_id) references public.planner_measures (workspace_id, id) on delete cascade
);
create index planner_measure_values_measure on public.planner_measure_values (workspace_id, measure_id, recorded_at desc);
create table public.planner_objective_tasks (      -- the actions that serve an objective: Projects tasks, by reference
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  objective_id uuid not null,
  task_id uuid not null,
  created_by uuid, created_at timestamptz not null default now(),
  primary key (objective_id, task_id),
  foreign key (workspace_id, objective_id) references public.planner_objectives (workspace_id, id) on delete cascade,
  foreign key (workspace_id, task_id) references public.project_tasks (workspace_id, id)
);
create index planner_objective_tasks_task on public.planner_objective_tasks (workspace_id, task_id);
create table public.planner_reviews (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid,
  objective_id uuid,
  title text not null check (length(title) between 1 and 200),
  period_start date,
  period_end date,
  due_on date,
  status text not null default 'scheduled' check (status in ('scheduled', 'done')),
  rating text check (rating in ('on_track', 'at_risk', 'off_track')),
  summary text check (length(summary) <= 10000),
  wins text check (length(wins) <= 10000),
  issues text check (length(issues) <= 10000),
  next_steps text check (length(next_steps) <= 10000),
  completed_at timestamptz,
  archived_at timestamptz,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (period_end is null or period_start is null or period_end >= period_start),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id),
  foreign key (workspace_id, objective_id) references public.planner_objectives (workspace_id, id)
);
create index planner_reviews_due on public.planner_reviews (workspace_id, due_on) where archived_at is null and status = 'scheduled';
create or replace function private.planner_objectives_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id();
begin
  if tg_op = 'INSERT' then
    if uid is not null then new.created_by := uid; end if;
  else
    if new.workspace_id is distinct from old.workspace_id or new.client_id is distinct from old.client_id or new.created_by is distinct from old.created_by then
      raise exception 'records do not move' using errcode = 'P0001';
    end if;
    new.updated_at := now();
  end if;
  if new.owner_id is not null and not exists (select 1 from public.memberships m where m.workspace_id = new.workspace_id and m.user_id = new.owner_id and m.kind = 'staff') then
    raise exception 'the owner must be a member of this organization' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger planner_objectives_guard before insert or update on public.planner_objectives for each row execute function private.planner_objectives_guard();
create or replace function private.planner_measures_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); oc uuid; found boolean;
begin
  select true, o.client_id into found, oc from public.planner_objectives o where o.workspace_id = new.workspace_id and o.id = new.objective_id;
  if found is not true then raise exception 'not found' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    if uid is not null then new.created_by := uid; end if;
    new.client_id := oc;
  else
    if new.workspace_id is distinct from old.workspace_id or new.objective_id is distinct from old.objective_id or new.client_id is distinct from old.client_id or new.created_by is distinct from old.created_by then
      raise exception 'records do not move' using errcode = 'P0001';
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;
create trigger planner_measures_guard before insert or update on public.planner_measures for each row execute function private.planner_measures_guard();
create or replace function private.planner_values_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); mo uuid; mc uuid; found boolean;
begin
  if tg_op <> 'INSERT' then raise exception 'recorded values are history and cannot change' using errcode = 'P0001'; end if;
  select true, m.objective_id, m.client_id into found, mo, mc from public.planner_measures m where m.workspace_id = new.workspace_id and m.id = new.measure_id;
  if found is not true then raise exception 'not found' using errcode = '42501'; end if;
  new.objective_id := mo; new.client_id := mc; new.recorded_at := now();
  if uid is not null then new.recorded_by := uid; end if;
  return new;
end $$;
create trigger planner_values_guard before insert or update on public.planner_measure_values for each row execute function private.planner_values_guard();
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
create trigger planner_links_guard before insert on public.planner_objective_tasks for each row execute function private.planner_links_guard();
create or replace function private.planner_reviews_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); oc uuid; found boolean;
begin
  if new.objective_id is not null then
    select true, o.client_id into found, oc from public.planner_objectives o where o.workspace_id = new.workspace_id and o.id = new.objective_id;
    if found is not true then raise exception 'not found' using errcode = '42501'; end if;
    new.client_id := oc;                           -- a review of an objective belongs to that objective's client
  end if;
  if tg_op = 'INSERT' then
    if uid is not null then new.created_by := uid; end if;
  else
    if new.workspace_id is distinct from old.workspace_id or new.client_id is distinct from old.client_id or new.objective_id is distinct from old.objective_id or new.created_by is distinct from old.created_by then
      raise exception 'records do not move' using errcode = 'P0001';
    end if;
    new.updated_at := now();
  end if;
  new.completed_at := case when new.status = 'done' then coalesce(new.completed_at, now()) else null end;
  return new;
end $$;
create trigger planner_reviews_guard before insert or update on public.planner_reviews for each row execute function private.planner_reviews_guard();
create or replace function private.planner_objective_in_use() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.planner_measures where objective_id = old.id) or exists (select 1 from public.planner_reviews where objective_id = old.id)
     or exists (select 1 from public.planner_objective_tasks where objective_id = old.id) then
    raise exception 'archive this objective instead: it still has measures, reviews or linked tasks' using errcode = 'P0001';
  end if;
  return old;
end $$;
create trigger planner_objectives_in_use before delete on public.planner_objectives for each row execute function private.planner_objective_in_use();
create trigger planner_objectives_refuse_delete before delete on public.planner_objectives for each row execute function private.archive_before_delete();
create trigger planner_measures_refuse_delete before delete on public.planner_measures for each row execute function private.archive_before_delete();
create trigger planner_reviews_refuse_delete before delete on public.planner_reviews for each row execute function private.archive_before_delete();
create or replace function private.project_task_linked() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.planner_objective_tasks where task_id = old.id) then
    raise exception 'unlink this task from its objectives first' using errcode = 'P0001';
  end if;
  return old;
end $$;
create trigger project_tasks_linked before delete on public.project_tasks for each row execute function private.project_task_linked();
do $$
declare t text;
begin
  foreach t in array array['planner_objectives', 'planner_measures', 'planner_measure_values', 'planner_objective_tasks', 'planner_reviews'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('create policy org_scope on public.%I as restrictive for all
      using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id))', t);
  end loop;
end $$;
create policy planner_objectives_select on public.planner_objectives for select using (private.has_permission(workspace_id, 'planner.objective.view', client_id));
create policy planner_objectives_insert on public.planner_objectives for insert with check (private.has_permission(workspace_id, 'planner.objective.create', client_id));
create policy planner_objectives_update on public.planner_objectives for update
  using (private.has_permission(workspace_id, 'planner.objective.edit', client_id)) with check (private.has_permission(workspace_id, 'planner.objective.edit', client_id));
create policy planner_objectives_delete on public.planner_objectives for delete using (private.has_permission(workspace_id, 'planner.objective.delete'));
create policy planner_measures_select on public.planner_measures for select using (private.has_permission(workspace_id, 'planner.objective.view', client_id));
create policy planner_measures_insert on public.planner_measures for insert with check (
  private.has_permission(workspace_id, 'planner.objective.create', (select o.client_id from public.planner_objectives o where o.workspace_id = planner_measures.workspace_id and o.id = planner_measures.objective_id)));
create policy planner_measures_update on public.planner_measures for update
  using (private.has_permission(workspace_id, 'planner.objective.edit', client_id)) with check (private.has_permission(workspace_id, 'planner.objective.edit', client_id));
create policy planner_measures_delete on public.planner_measures for delete using (private.has_permission(workspace_id, 'planner.objective.delete'));
create policy planner_values_select on public.planner_measure_values for select using (private.has_permission(workspace_id, 'planner.objective.view', client_id));
create policy planner_values_insert on public.planner_measure_values for insert with check (
  private.has_permission(workspace_id, 'planner.measure.record', (select m.client_id from public.planner_measures m where m.workspace_id = planner_measure_values.workspace_id and m.id = planner_measure_values.measure_id)));
create policy planner_links_select on public.planner_objective_tasks for select using (
  exists (select 1 from public.planner_objectives o where o.workspace_id = planner_objective_tasks.workspace_id and o.id = planner_objective_tasks.objective_id));
create policy planner_links_insert on public.planner_objective_tasks for insert with check (
  private.has_permission(workspace_id, 'planner.objective.edit', (select o.client_id from public.planner_objectives o where o.workspace_id = planner_objective_tasks.workspace_id and o.id = planner_objective_tasks.objective_id))
  and exists (select 1 from public.project_tasks t where t.workspace_id = planner_objective_tasks.workspace_id and t.id = planner_objective_tasks.task_id));      -- the person must be able to see the task they link
create policy planner_links_delete on public.planner_objective_tasks for delete using (
  private.has_permission(workspace_id, 'planner.objective.edit', (select o.client_id from public.planner_objectives o where o.workspace_id = planner_objective_tasks.workspace_id and o.id = planner_objective_tasks.objective_id)));
create policy planner_reviews_select on public.planner_reviews for select using (private.has_permission(workspace_id, 'planner.review.view', client_id));
create policy planner_reviews_insert on public.planner_reviews for insert with check (
  private.has_permission(workspace_id, 'planner.review.create', coalesce(client_id, (select o.client_id from public.planner_objectives o where o.workspace_id = planner_reviews.workspace_id and o.id = planner_reviews.objective_id))));
create policy planner_reviews_update on public.planner_reviews for update
  using (private.has_permission(workspace_id, 'planner.review.edit', client_id)) with check (private.has_permission(workspace_id, 'planner.review.edit', client_id));
create policy planner_reviews_delete on public.planner_reviews for delete using (private.has_permission(workspace_id, 'planner.review.delete'));
create trigger audit_planner_objectives after insert or update or delete on public.planner_objectives
  for each row execute function private.audit_change('client_id', 'owner_id', 'title', 'status', 'health', 'period_start', 'period_end', 'archived_at');
create trigger audit_planner_measures after insert or update or delete on public.planner_measures
  for each row execute function private.audit_change('objective_id', 'name', 'unit', 'start_value', 'target_value', 'due_on', 'archived_at');
create trigger audit_planner_values after insert on public.planner_measure_values
  for each row execute function private.audit_change('measure_id', 'value');
create trigger audit_planner_links after insert or delete on public.planner_objective_tasks
  for each row execute function private.audit_change('objective_id', 'task_id');
create trigger audit_planner_reviews after insert or update or delete on public.planner_reviews
  for each row execute function private.audit_change('objective_id', 'client_id', 'title', 'status', 'rating', 'due_on', 'archived_at');
create or replace function private.refuse_delete_planner_clients() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.planner_objectives where client_id = old.id) or exists (select 1 from public.planner_reviews where client_id = old.id) then
    raise exception 'archive this client instead: it still has work' using errcode = 'P0001';
  end if;
  return old;
end $$;
create trigger clients_refuse_delete_planner before delete on public.clients for each row execute function private.refuse_delete_planner_clients();
revoke all on all functions in schema private from public;
grant select, insert, update, delete on public.planner_objectives, public.planner_measures, public.planner_reviews to app_user;
grant select, insert on public.planner_measure_values to app_user;
grant select, insert, delete on public.planner_objective_tasks to app_user;
-- ===== 0016_api_audience.sql =====
set check_function_bodies = off;
create or replace function public.my_audience(p_org uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.memberships m where m.workspace_id = p_org and m.user_id = private.current_user_id() and m.kind = 'staff' and m.status = 'active') then 'staff'
    when exists (select 1 from public.memberships m where m.workspace_id = p_org and m.user_id = private.current_user_id() and m.kind = 'client' and m.status = 'active') then 'client'
    else null end
$$;
revoke all on function public.my_audience(uuid) from public;
grant execute on function public.my_audience(uuid) to app_user;
-- ===== 0017_approvals_v2.sql =====
set check_function_bodies = off;
insert into public.permissions (key, app_key, description, floor_role, default_role, scopes, sensitive) values
  ('approvals.request.view', 'platform', 'See approval requests and their history', 'viewer', 'viewer', '{workspace,client}', false);
alter table public.approvals
  add column client_id uuid,
  add column title text not null default '' check (length(title) <= 200),
  add column note text check (length(note) <= 4000),
  add column decision_note text check (length(decision_note) <= 4000),
  add column due_on date,
  add column client_visible boolean not null default false,
  add column previous_id uuid,
  add column updated_at timestamptz not null default now(),
  add constraint approvals_ws_id_key unique (workspace_id, id),
  add constraint approvals_client_fk foreign key (workspace_id, client_id) references public.clients (workspace_id, id),
  add constraint approvals_previous_fk foreign key (workspace_id, previous_id) references public.approvals (workspace_id, id);
alter table public.approvals drop constraint approvals_status_check;
alter table public.approvals add constraint approvals_status_check check (status in ('pending', 'approved', 'rejected', 'withdrawn'));
alter table public.approvals add constraint approvals_subject_type_check check (subject_type in
  ('deliverable', 'file', 'document', 'project', 'task', 'funnel_record', 'form', 'post', 'other'));
create index approvals_pending on public.approvals (workspace_id, created_at desc) where status = 'pending';
create index approvals_subject on public.approvals (workspace_id, subject_type, subject_id);
create table public.approval_events (                -- append-only: no update, no delete, written only by the trigger below
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  approval_id uuid not null,
  version int not null,
  event text not null check (event in ('requested', 'approved', 'rejected', 'withdrawn')),
  actor_id uuid,
  note text check (length(note) <= 4000),
  at timestamptz not null default now(),
  foreign key (workspace_id, approval_id) references public.approvals (workspace_id, id)
);
create index approval_events_approval on public.approval_events (workspace_id, approval_id, id);
create or replace function private.approval_subject(ws uuid, t text, sid uuid, out s_found boolean, out s_client uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  s_found := null; s_client := null;
  if t in ('deliverable', 'file', 'document') then select true, f.client_id into s_found, s_client from public.files f where f.workspace_id = ws and f.id = sid;
  elsif t = 'project' then select true, p.client_id into s_found, s_client from public.projects p where p.workspace_id = ws and p.id = sid;
  elsif t = 'task' then select true, k.client_id into s_found, s_client from public.project_tasks k where k.workspace_id = ws and k.id = sid;
  else s_found := true;                                  -- funnel_record, other: no table to check yet
  end if;
end $$;
create or replace function private.approvals_insert_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); sf boolean; sc uuid; pv public.approvals;
begin
  select s.s_found, s.s_client into sf, sc from private.approval_subject(new.workspace_id, new.subject_type, new.subject_id) s;
  if sf is not true then raise exception 'not found' using errcode = '42501'; end if;
  if sc is not null and new.client_id is not null and new.client_id <> sc then raise exception 'the client must be the subject''s client' using errcode = 'P0001'; end if;
  new.client_id := coalesce(sc, new.client_id);
  if new.client_visible and new.client_id is null then raise exception 'only a client''s request can be shown to the client' using errcode = 'P0001'; end if;
  if new.previous_id is not null then
    select * into pv from public.approvals a where a.workspace_id = new.workspace_id and a.id = new.previous_id;
    if pv.id is null then raise exception 'not found' using errcode = '42501'; end if;
    if pv.status <> 'rejected' then raise exception 'only a rejected request can be resubmitted' using errcode = 'P0001'; end if;
    if pv.subject_type <> new.subject_type or pv.subject_id <> new.subject_id then raise exception 'a resubmission keeps the same subject' using errcode = 'P0001'; end if;
    if exists (select 1 from public.approvals a where a.workspace_id = new.workspace_id and a.previous_id = pv.id) then raise exception 'already resubmitted' using errcode = 'P0001'; end if;
    new.version := pv.version + 1;
  else new.version := 1; end if;
  if exists (select 1 from public.approvals a where a.workspace_id = new.workspace_id and a.subject_type = new.subject_type and a.subject_id = new.subject_id and a.status = 'pending') then
    raise exception 'this item already has a pending request' using errcode = 'P0001';
  end if;
  if uid is not null then new.requested_by := uid; end if;
  new.status := 'pending'; new.decided_by := null; new.decided_at := null; new.decision_note := null;
  return new;
end $$;
create trigger approvals_insert_guard before insert on public.approvals for each row execute function private.approvals_insert_guard();
create or replace function private.approvals_decide() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id();
begin
  if old.status <> 'pending' then raise exception 'approval already decided' using errcode = 'P0001'; end if;
  if new.workspace_id is distinct from old.workspace_id or new.subject_type is distinct from old.subject_type or new.subject_id is distinct from old.subject_id
     or new.requested_by is distinct from old.requested_by or new.version is distinct from old.version or new.created_at is distinct from old.created_at
     or new.client_id is distinct from old.client_id or new.title is distinct from old.title or new.note is distinct from old.note or new.due_on is distinct from old.due_on
     or new.client_visible is distinct from old.client_visible or new.previous_id is distinct from old.previous_id
     or new.status not in ('approved', 'rejected', 'withdrawn') then
    raise exception 'only the decision can change' using errcode = 'P0001';
  end if;
  if new.status = 'withdrawn' and uid is distinct from old.requested_by then raise exception 'only the requester can withdraw' using errcode = 'P0001'; end if;
  if new.status in ('approved', 'rejected') and uid is not distinct from old.requested_by then raise exception 'someone else must decide' using errcode = 'P0001'; end if;
  if new.status = 'rejected' and length(btrim(coalesce(new.decision_note, ''))) = 0 then raise exception 'a rejection needs a reason' using errcode = 'P0001'; end if;
  new.decided_by := uid; new.decided_at := now(); new.updated_at := now();
  return new;
end $$;
create or replace function private.approvals_events() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.approval_events (workspace_id, approval_id, version, event, actor_id, note)
  values (new.workspace_id, new.id, new.version, case when tg_op = 'INSERT' then 'requested' else new.status end,
          case when tg_op = 'INSERT' then new.requested_by else new.decided_by end, case when tg_op = 'INSERT' then new.note else new.decision_note end);
  return null;
end $$;
create trigger approvals_events after insert or update on public.approvals for each row execute function private.approvals_events();
alter table public.approval_events enable row level security; alter table public.approval_events force row level security;
create policy org_scope on public.approval_events as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
create policy approval_events_select on public.approval_events for select using (
  exists (select 1 from public.approvals a where a.workspace_id = approval_events.workspace_id and a.id = approval_events.approval_id));
drop policy appr_select on public.approvals;
create policy appr_select on public.approvals for select using (private.has_permission(workspace_id, 'approvals.request.view', client_id));
drop policy appr_insert on public.approvals;
create policy appr_insert on public.approvals for insert with check (
  private.has_permission(workspace_id, 'approvals.request.create', client_id) and requested_by = private.current_user_id()
  and status = 'pending' and decided_by is null and decided_at is null
  and case when subject_type in ('deliverable', 'file', 'document') then exists (select 1 from public.files f where f.workspace_id = approvals.workspace_id and f.id = approvals.subject_id)
           when subject_type = 'project' then exists (select 1 from public.projects p where p.workspace_id = approvals.workspace_id and p.id = approvals.subject_id)
           when subject_type = 'task' then exists (select 1 from public.project_tasks k where k.workspace_id = approvals.workspace_id and k.id = approvals.subject_id)
           else true end);                                -- the person must be able to see what they ask about
drop policy appr_decide on public.approvals;
create policy appr_decide on public.approvals for update
  using (private.has_permission(workspace_id, 'approvals.request.decide', client_id) and requested_by <> private.current_user_id())
  with check (private.has_permission(workspace_id, 'approvals.request.decide', client_id) and requested_by <> private.current_user_id());
create policy appr_withdraw on public.approvals for update
  using (requested_by = private.current_user_id() and status = 'pending') with check (requested_by = private.current_user_id() and status = 'withdrawn');
drop trigger audit_approvals on public.approvals;
create trigger audit_approvals after insert or update on public.approvals
  for each row execute function private.audit_change('subject_type', 'subject_id', 'client_id', 'status', 'version', 'decided_by', 'client_visible');
revoke all on all functions in schema private from public;
grant select on public.approval_events to app_user;
-- ===== 0018_portal.sql =====
set check_function_bodies = off;
insert into public.permissions (key, app_key, description, floor_role, default_role, scopes, sensitive) values
  ('portal.message.view', 'portal', 'Read the messages exchanged with a client in the Portal', 'viewer', 'editor', '{workspace,client}', false),
  ('portal.message.send', 'portal', 'Write to a client in the Portal',                        'editor', 'editor', '{workspace,client}', false);
create table public.portal_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null,                           -- from the subject; callers never set it
  subject_type text not null check (subject_type in ('request', 'file', 'approval', 'project')),
  subject_id uuid not null,
  author_id uuid not null,
  author_kind text not null check (author_kind in ('staff', 'client')),
  body text not null check (length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id)
);
create index portal_messages_subject on public.portal_messages (workspace_id, subject_type, subject_id, created_at);
create index portal_messages_client on public.portal_messages (workspace_id, client_id, created_at desc);
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
create or replace function private.portal_messages_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); ok boolean; sc uuid;
begin
  if tg_op <> 'INSERT' then raise exception 'messages cannot be changed or removed' using errcode = 'P0001'; end if;
  select s.s_ok, s.s_client into ok, sc from private.portal_subject(new.workspace_id, new.subject_type, new.subject_id) s;
  if ok is not true or sc is null then raise exception 'not found' using errcode = '42501'; end if;
  new.client_id := sc;
  if uid is not null then new.author_id := uid; end if;
  new.author_kind := case when private.client_of(new.workspace_id, sc) then 'client' else 'staff' end;
  return new;
end $$;
create trigger portal_messages_guard before insert or update or delete on public.portal_messages for each row execute function private.portal_messages_guard();
alter table public.portal_messages enable row level security; alter table public.portal_messages force row level security;
create policy org_scope on public.portal_messages as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
create policy portal_messages_select on public.portal_messages for select using (
  private.has_permission(workspace_id, 'portal.message.view', client_id) or private.client_of(workspace_id, client_id));
create policy portal_messages_insert on public.portal_messages for insert with check (
  (author_kind = 'staff' and private.has_permission(workspace_id, 'portal.message.send', client_id))
  or (author_kind = 'client' and private.client_of(workspace_id, client_id)));
create policy appr_client_select on public.approvals for select using (client_visible and private.client_of(workspace_id, client_id));
create policy appr_client_decide on public.approvals for update
  using (client_visible and status = 'pending' and private.client_of(workspace_id, client_id))
  with check (client_visible and private.client_of(workspace_id, client_id) and status in ('approved', 'rejected'));
create policy client_requests_answer on public.client_requests for update
  using (client_visible and archived_at is null and status = 'open' and private.client_of(workspace_id, client_id))
  with check (private.client_of(workspace_id, client_id) and status = 'answered');
create or replace function private.client_requests_contact_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.current_user_id() is null or private.is_staff(new.workspace_id) then return new; end if;   -- staff and server-side jobs are not limited here
  if old.status <> 'open' or not old.client_visible or old.archived_at is not null or new.status <> 'answered' or length(btrim(coalesce(new.response, ''))) = 0
     or (to_jsonb(new) - 'response' - 'status' - 'updated_at') is distinct from (to_jsonb(old) - 'response' - 'status' - 'updated_at') then
    raise exception 'not found' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger client_requests_contact_guard before update on public.client_requests for each row execute function private.client_requests_contact_guard();
create trigger audit_portal_messages after insert on public.portal_messages
  for each row execute function private.audit_change('client_id', 'subject_type', 'subject_id', 'author_kind');
revoke all on all functions in schema private from public;
grant select, insert on public.portal_messages to app_user;
-- ===== 0019_forms.sql =====
set check_function_bodies = off;
insert into public.permissions (key, app_key, description, floor_role, default_role, scopes, sensitive) values
  ('forms.form.view',         'forms', 'View forms and their versions',                       'viewer', 'viewer', '{workspace,client}', false),
  ('forms.form.create',       'forms', 'Create forms',                                        'editor', 'editor', '{workspace,client}', false),
  ('forms.form.edit',         'forms', 'Edit fields (a new version), publish, archive forms', 'editor', 'editor', '{workspace,client}', false),
  ('forms.form.delete',       'forms', 'Permanently delete an ARCHIVED form',                 'admin',  'owner',  '{workspace}', true),
  ('forms.submission.view',   'forms', 'Read submitted answers',                              'editor', 'editor', '{workspace,client}', true),
  ('forms.submission.create', 'forms', 'Record a submission on a published form',             'editor', 'editor', '{workspace,client}', false),
  ('forms.submission.delete', 'forms', 'Permanently delete an ARCHIVED submission',           'admin',  'owner',  '{workspace}', true);
create table public.forms (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid,
  name text not null check (length(name) between 1 and 200),
  description text check (length(description) <= 4000),
  status text not null default 'draft' check (status in ('draft', 'published')),
  current_version int not null default 0 check (current_version >= 0),
  archived_at timestamptz,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (status = 'draft' or current_version >= 1),
  unique (workspace_id, id),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id)
);
create index forms_ws on public.forms (workspace_id) where archived_at is null;
create table public.form_versions (                -- immutable: a change to the fields is a new version
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  form_id uuid not null,
  version int not null check (version >= 1),
  fields jsonb not null,
  created_by uuid, created_at timestamptz not null default now(),
  primary key (form_id, version),
  foreign key (workspace_id, form_id) references public.forms (workspace_id, id)
);
create table public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  form_id uuid not null,
  form_version int not null,
  client_id uuid,                                  -- from the form
  answers jsonb not null,
  submitted_by uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, form_id) references public.forms (workspace_id, id),
  foreign key (form_id, form_version) references public.form_versions (form_id, version)
);
create index form_submissions_form on public.form_submissions (workspace_id, form_id, created_at desc);
create or replace function private.form_fields_valid(f jsonb) returns text
language plpgsql immutable set search_path = '' as $$
declare e jsonb; k text; seen text[] := '{}'; t text; o jsonb;
begin
  if jsonb_typeof(f) <> 'array' then return 'fields must be a list'; end if;
  if jsonb_array_length(f) > 60 then return 'at most 60 fields'; end if;
  if octet_length(f::text) > 60000 then return 'the form is too large'; end if;
  for e in select * from jsonb_array_elements(f) loop
    if jsonb_typeof(e) <> 'object' then return 'each field must be an object'; end if;
    k := e ->> 'key'; t := e ->> 'type';
    if k is null or k !~ '^[a-z][a-z0-9_]{0,39}$' then return 'a field key is missing or invalid'; end if;
    if k = any(seen) then return 'duplicate field key ' || k; end if;
    seen := seen || k;
    if t is null or t not in ('text', 'textarea', 'email', 'number', 'date', 'select', 'multi_select', 'checkbox') then return 'unknown field type for ' || k; end if;
    if e ->> 'label' is null or length(e ->> 'label') not between 1 and 200 then return 'a field label is missing or too long'; end if;
    if jsonb_typeof(e -> 'required') not in ('boolean') and e ? 'required' then return 'required must be true or false'; end if;
    if t in ('select', 'multi_select') then
      o := e -> 'options';
      if o is null or jsonb_typeof(o) <> 'array' or jsonb_array_length(o) not between 1 and 50 then return 'choices need 1 to 50 options (' || k || ')'; end if;
      if exists (select 1 from jsonb_array_elements(o) x where jsonb_typeof(x) <> 'string' or length(x #>> '{}') not between 1 and 100) then return 'options must be short text (' || k || ')'; end if;
    end if;
  end loop;
  return null;
end $$;
create or replace function private.form_answers_valid(f jsonb, a jsonb) returns text
language plpgsql immutable set search_path = '' as $$
declare e jsonb; k text; t text; v jsonb;
begin
  if jsonb_typeof(a) <> 'object' then return 'answers must be an object'; end if;
  if octet_length(a::text) > 100000 then return 'answers are too large'; end if;
  if exists (select 1 from jsonb_object_keys(a) ak where not exists (select 1 from jsonb_array_elements(f) fe where fe ->> 'key' = ak)) then return 'an answer does not belong to this form'; end if;
  for e in select * from jsonb_array_elements(f) loop
    k := e ->> 'key'; t := e ->> 'type'; v := a -> k;
    if v is null or v = 'null'::jsonb or v = '""'::jsonb or v = '[]'::jsonb then
      if coalesce((e ->> 'required')::boolean, false) and t <> 'checkbox' then return 'required: ' || k; end if;
      continue;
    end if;
    if t in ('text', 'textarea') and (jsonb_typeof(v) <> 'string' or length(v #>> '{}') > 10000) then return 'text expected: ' || k; end if;
    if t = 'email' and (jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^[^\s@]{1,64}@[^\s@]{1,255}$') then return 'e-mail expected: ' || k; end if;
    if t = 'number' and jsonb_typeof(v) <> 'number' then return 'number expected: ' || k; end if;
    if t = 'date' and (jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$') then return 'date expected: ' || k; end if;
    if t = 'checkbox' and jsonb_typeof(v) <> 'boolean' then return 'yes or no expected: ' || k; end if;
    if t = 'select' and not (e -> 'options') @> jsonb_build_array(v) then return 'one of the options expected: ' || k; end if;
    if t = 'multi_select' and (jsonb_typeof(v) <> 'array' or exists (select 1 from jsonb_array_elements(v) x where not (e -> 'options') @> jsonb_build_array(x))) then return 'options expected: ' || k; end if;
  end loop;
  return null;
end $$;
create or replace function private.forms_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id();
begin
  if tg_op = 'INSERT' then
    if uid is not null then new.created_by := uid; end if;
    new.status := 'draft'; new.current_version := 0;
  else
    if new.workspace_id is distinct from old.workspace_id or new.client_id is distinct from old.client_id or new.created_by is distinct from old.created_by then
      raise exception 'records do not move' using errcode = 'P0001';
    end if;
    if new.current_version is distinct from old.current_version and (new.current_version <> old.current_version + 1 or pg_trigger_depth() < 2) then
      raise exception 'versions are created by saving the fields' using errcode = 'P0001';
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;
create trigger forms_guard before insert or update on public.forms for each row execute function private.forms_guard();
create or replace function private.form_versions_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); cur int; found boolean; bad text;
begin
  if tg_op <> 'INSERT' then raise exception 'versions are history and cannot change' using errcode = 'P0001'; end if;
  select true, f.current_version into found, cur from public.forms f where f.workspace_id = new.workspace_id and f.id = new.form_id and f.archived_at is null;
  if found is not true then raise exception 'not found' using errcode = '42501'; end if;
  new.version := cur + 1;
  bad := private.form_fields_valid(new.fields);
  if bad is not null then raise exception '%', bad using errcode = 'P0001'; end if;
  if uid is not null then new.created_by := uid; end if;
  return new;
end $$;
create trigger form_versions_guard before insert or update or delete on public.form_versions for each row execute function private.form_versions_guard();
create or replace function private.form_versions_after() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.forms set current_version = new.version where workspace_id = new.workspace_id and id = new.form_id;
  return null;
end $$;
create trigger form_versions_after after insert on public.form_versions for each row execute function private.form_versions_after();
create or replace function private.form_submissions_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); fc uuid; st text; cur int; arch timestamptz; found boolean; fields jsonb; bad text;
begin
  if tg_op = 'UPDATE' then
    if to_jsonb(new) - 'archived_at' is distinct from to_jsonb(old) - 'archived_at' then raise exception 'a submission cannot be edited' using errcode = 'P0001'; end if;
    return new;
  end if;
  select true, f.client_id, f.status, f.current_version, f.archived_at into found, fc, st, cur, arch from public.forms f where f.workspace_id = new.workspace_id and f.id = new.form_id;
  if found is not true then raise exception 'not found' using errcode = '42501'; end if;
  if arch is not null or st <> 'published' then raise exception 'this form is not published' using errcode = 'P0001'; end if;
  new.form_version := cur; new.client_id := fc;
  select v.fields into fields from public.form_versions v where v.form_id = new.form_id and v.version = cur;
  bad := private.form_answers_valid(fields, new.answers);
  if bad is not null then raise exception '%', bad using errcode = 'P0001'; end if;
  if uid is not null then new.submitted_by := uid; end if;
  new.archived_at := null;
  return new;
end $$;
create trigger form_submissions_guard before insert or update on public.form_submissions for each row execute function private.form_submissions_guard();
create trigger forms_refuse_delete before delete on public.forms for each row execute function private.archive_before_delete();
create trigger form_submissions_refuse_delete before delete on public.form_submissions for each row execute function private.archive_before_delete();
create or replace function private.forms_in_use() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.form_submissions where form_id = old.id) then raise exception 'archive this form instead: it has submissions' using errcode = 'P0001'; end if;
  return old;
end $$;
create trigger forms_in_use before delete on public.forms for each row execute function private.forms_in_use();
do $$
declare t text;
begin
  foreach t in array array['forms', 'form_versions', 'form_submissions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('create policy org_scope on public.%I as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id))', t);
  end loop;
end $$;
create policy forms_select on public.forms for select using (private.has_permission(workspace_id, 'forms.form.view', client_id));
create policy forms_insert on public.forms for insert with check (private.has_permission(workspace_id, 'forms.form.create', client_id));
create policy forms_update on public.forms for update using (private.has_permission(workspace_id, 'forms.form.edit', client_id)) with check (private.has_permission(workspace_id, 'forms.form.edit', client_id));
create policy forms_delete on public.forms for delete using (private.has_permission(workspace_id, 'forms.form.delete'));
create policy form_versions_select on public.form_versions for select using (exists (select 1 from public.forms f where f.workspace_id = form_versions.workspace_id and f.id = form_versions.form_id));
create policy form_versions_insert on public.form_versions for insert with check (
  private.has_permission(workspace_id, 'forms.form.edit', (select f.client_id from public.forms f where f.workspace_id = form_versions.workspace_id and f.id = form_versions.form_id)));
create policy form_submissions_select on public.form_submissions for select using (private.has_permission(workspace_id, 'forms.submission.view', client_id));
create policy form_submissions_insert on public.form_submissions for insert with check (
  private.has_permission(workspace_id, 'forms.submission.create', (select f.client_id from public.forms f where f.workspace_id = form_submissions.workspace_id and f.id = form_submissions.form_id)));
create policy form_submissions_update on public.form_submissions for update using (private.has_permission(workspace_id, 'forms.submission.view', client_id) and private.has_permission(workspace_id, 'forms.form.edit', client_id))
  with check (private.has_permission(workspace_id, 'forms.form.edit', client_id));
create policy form_submissions_delete on public.form_submissions for delete using (private.has_permission(workspace_id, 'forms.submission.delete'));
create trigger audit_forms after insert or update or delete on public.forms for each row execute function private.audit_change('client_id', 'name', 'status', 'current_version', 'archived_at');
create trigger audit_form_versions after insert on public.form_versions for each row execute function private.audit_change('form_id', 'version');
create trigger audit_form_submissions after insert or update or delete on public.form_submissions for each row execute function private.audit_change('form_id', 'form_version', 'client_id', 'archived_at');
create or replace function private.refuse_delete_forms_clients() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.forms where client_id = old.id) then raise exception 'archive this client instead: it still has work' using errcode = 'P0001'; end if;
  return old;
end $$;
create trigger clients_refuse_delete_forms before delete on public.clients for each row execute function private.refuse_delete_forms_clients();
create or replace function private.approval_subject(ws uuid, t text, sid uuid, out s_found boolean, out s_client uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  s_found := null; s_client := null;
  if t in ('deliverable', 'file', 'document') then select true, f.client_id into s_found, s_client from public.files f where f.workspace_id = ws and f.id = sid;
  elsif t = 'project' then select true, p.client_id into s_found, s_client from public.projects p where p.workspace_id = ws and p.id = sid;
  elsif t = 'task' then select true, k.client_id into s_found, s_client from public.project_tasks k where k.workspace_id = ws and k.id = sid;
  elsif t = 'form' then select true, f.client_id into s_found, s_client from public.forms f where f.workspace_id = ws and f.id = sid;
  else s_found := true;
  end if;
end $$;
revoke all on all functions in schema private from public;
grant select, insert, update, delete on public.forms to app_user;
grant select, insert on public.form_versions to app_user;
grant select, insert, update, delete on public.form_submissions to app_user;
-- ===== 0020_value_ladder.sql =====
set check_function_bodies = off;
insert into public.permissions (key, app_key, description, floor_role, default_role, scopes, sensitive) values
  ('valueladder.ladder.view',   'value_ladder', 'View value ladders and rungs',                   'viewer', 'viewer', '{workspace,client}', false),
  ('valueladder.ladder.create', 'value_ladder', 'Create value ladders',                           'editor', 'editor', '{workspace,client}', false),
  ('valueladder.ladder.edit',   'value_ladder', 'Edit ladders and rungs, reorder, archive',       'editor', 'editor', '{workspace,client}', false),
  ('valueladder.ladder.delete', 'value_ladder', 'Permanently delete an ARCHIVED ladder or rung',  'admin',  'owner',  '{workspace}', true);
create table public.value_ladders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid,
  name text not null check (length(name) between 1 and 200),
  description text check (length(description) <= 4000),
  archived_at timestamptz,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id)
);
create index value_ladders_ws on public.value_ladders (workspace_id) where archived_at is null;
create table public.value_ladder_rungs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  ladder_id uuid not null,
  client_id uuid,                                    -- from the ladder
  position int check (position between 1 and 12),   -- null while archived
  stage text not null check (stage in ('lead_magnet', 'tripwire', 'core', 'upsell', 'continuity', 'premium')),
  name text not null check (length(name) between 1 and 200),
  description text check (length(description) <= 4000),
  offer_id uuid,
  price_amount numeric(12, 2) check (price_amount >= 0),
  currency text check (currency ~ '^[A-Z]{3}$'),
  archived_at timestamptz,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((price_amount is null) = (currency is null)),
  check ((archived_at is null) = (position is not null)),
  unique (workspace_id, id),
  unique (ladder_id, position) deferrable initially deferred,
  foreign key (workspace_id, ladder_id) references public.value_ladders (workspace_id, id),
  foreign key (workspace_id, offer_id) references public.funnel_offers (workspace_id, id)
);
create or replace function private.value_ladders_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id();
begin
  if tg_op = 'INSERT' then
    if uid is not null then new.created_by := uid; end if;
  else
    if new.workspace_id is distinct from old.workspace_id or new.client_id is distinct from old.client_id or new.created_by is distinct from old.created_by then
      raise exception 'records do not move' using errcode = 'P0001';
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;
create trigger value_ladders_guard before insert or update on public.value_ladders for each row execute function private.value_ladders_guard();
create or replace function private.value_rungs_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); lc uuid; lfound boolean; larch timestamptz; oc uuid; ofound boolean; n int; cnt int;
begin
  select true, l.client_id, l.archived_at into lfound, lc, larch from public.value_ladders l where l.workspace_id = new.workspace_id and l.id = new.ladder_id;
  if lfound is not true then raise exception 'not found' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    if larch is not null then raise exception 'this ladder is archived' using errcode = 'P0001'; end if;
    if uid is not null then new.created_by := uid; end if;
    new.client_id := lc; new.archived_at := null;
  else
    if new.workspace_id is distinct from old.workspace_id or new.ladder_id is distinct from old.ladder_id or new.client_id is distinct from old.client_id or new.created_by is distinct from old.created_by then
      raise exception 'records do not move' using errcode = 'P0001';
    end if;
    new.updated_at := now();
  end if;
  if new.offer_id is not null then
    select true, o.client_id into ofound, oc from public.funnel_offers o where o.workspace_id = new.workspace_id and o.id = new.offer_id;
    if ofound is not true then raise exception 'not found' using errcode = '42501'; end if;
    if oc is not null and oc is distinct from lc then raise exception 'a rung can only use this client''s offers or general ones' using errcode = 'P0001'; end if;
  end if;
  if new.archived_at is not null then new.position := null;
  elsif new.position is null then                                     -- a new or restored rung goes to the end of the ladder
    select count(*), coalesce(max(r.position), 0) + 1 into cnt, n from public.value_ladder_rungs r where r.ladder_id = new.ladder_id and r.archived_at is null and r.id is distinct from new.id;
    if cnt >= 12 then raise exception 'a ladder has at most 12 rungs' using errcode = 'P0001'; end if;
    new.position := n;
  end if;
  return new;
end $$;
create trigger value_rungs_guard before insert or update on public.value_ladder_rungs for each row execute function private.value_rungs_guard();
create trigger value_ladders_refuse_delete before delete on public.value_ladders for each row execute function private.archive_before_delete();
create trigger value_rungs_refuse_delete before delete on public.value_ladder_rungs for each row execute function private.archive_before_delete();
create or replace function private.value_ladder_in_use() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.value_ladder_rungs where ladder_id = old.id) then raise exception 'archive this ladder instead: it has rungs' using errcode = 'P0001'; end if;
  return old;
end $$;
create trigger value_ladders_in_use before delete on public.value_ladders for each row execute function private.value_ladder_in_use();
create or replace function private.offer_on_ladder() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.value_ladder_rungs where offer_id = old.id) then raise exception 'take this offer off its value ladders first' using errcode = 'P0001'; end if;
  return old;
end $$;
create trigger funnel_offers_on_ladder before delete on public.funnel_offers for each row execute function private.offer_on_ladder();
do $$
declare t text;
begin
  foreach t in array array['value_ladders', 'value_ladder_rungs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('create policy org_scope on public.%I as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id))', t);
  end loop;
end $$;
create policy value_ladders_select on public.value_ladders for select using (private.has_permission(workspace_id, 'valueladder.ladder.view', client_id));
create policy value_ladders_insert on public.value_ladders for insert with check (private.has_permission(workspace_id, 'valueladder.ladder.create', client_id));
create policy value_ladders_update on public.value_ladders for update using (private.has_permission(workspace_id, 'valueladder.ladder.edit', client_id)) with check (private.has_permission(workspace_id, 'valueladder.ladder.edit', client_id));
create policy value_ladders_delete on public.value_ladders for delete using (private.has_permission(workspace_id, 'valueladder.ladder.delete'));
create policy value_rungs_select on public.value_ladder_rungs for select using (private.has_permission(workspace_id, 'valueladder.ladder.view', client_id));
create policy value_rungs_insert on public.value_ladder_rungs for insert with check (
  private.has_permission(workspace_id, 'valueladder.ladder.edit', (select l.client_id from public.value_ladders l where l.workspace_id = value_ladder_rungs.workspace_id and l.id = value_ladder_rungs.ladder_id))
  and (offer_id is null or exists (select 1 from public.funnel_offers o where o.workspace_id = value_ladder_rungs.workspace_id and o.id = value_ladder_rungs.offer_id)));   -- the person must be able to see the offer they attach
create policy value_rungs_update on public.value_ladder_rungs for update using (private.has_permission(workspace_id, 'valueladder.ladder.edit', client_id))
  with check (private.has_permission(workspace_id, 'valueladder.ladder.edit', client_id) and (offer_id is null or exists (select 1 from public.funnel_offers o where o.workspace_id = value_ladder_rungs.workspace_id and o.id = value_ladder_rungs.offer_id)));
create policy value_rungs_delete on public.value_ladder_rungs for delete using (private.has_permission(workspace_id, 'valueladder.ladder.delete'));
create trigger audit_value_ladders after insert or update or delete on public.value_ladders for each row execute function private.audit_change('client_id', 'name', 'archived_at');
create trigger audit_value_rungs after insert or update or delete on public.value_ladder_rungs for each row execute function private.audit_change('ladder_id', 'stage', 'name', 'position', 'offer_id', 'price_amount', 'currency', 'archived_at');
create or replace function private.refuse_delete_ladder_clients() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.value_ladders where client_id = old.id) then raise exception 'archive this client instead: it still has work' using errcode = 'P0001'; end if;
  return old;
end $$;
create trigger clients_refuse_delete_ladders before delete on public.clients for each row execute function private.refuse_delete_ladder_clients();
revoke all on all functions in schema private from public;
grant select, insert, update, delete on public.value_ladders, public.value_ladder_rungs to app_user;
-- ===== 0021_social_planner.sql =====
set check_function_bodies = off;
insert into public.permissions (key, app_key, description, floor_role, default_role, scopes, sensitive) values
  ('social.post.view',     'social_planner', 'View the calendar and posts',                          'viewer', 'viewer', '{workspace,client}', false),
  ('social.post.create',   'social_planner', 'Create posts',                                         'editor', 'editor', '{workspace,client}', false),
  ('social.post.edit',     'social_planner', 'Edit posts, attach media, plan and archive',           'editor', 'editor', '{workspace,client}', false),
  ('social.post.schedule', 'social_planner', 'Schedule a post and record that it was published',     'editor', 'editor', '{workspace,client}', false),
  ('social.post.delete',   'social_planner', 'Permanently delete an ARCHIVED post',                  'admin',  'owner',  '{workspace}', true);
create table public.social_posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid,
  channel text not null check (channel in ('facebook', 'instagram', 'linkedin', 'x', 'tiktok', 'youtube', 'pinterest', 'email', 'other')),
  title text not null check (length(title) between 1 and 200),
  caption text check (length(caption) <= 5000),
  scheduled_for timestamptz,
  status text not null default 'idea' check (status in ('idea', 'draft', 'in_review', 'approved', 'scheduled', 'published')),
  published_at timestamptz,
  archived_at timestamptz,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (status <> 'scheduled' or scheduled_for is not null),
  unique (workspace_id, id),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id)
);
create index social_posts_cal on public.social_posts (workspace_id, scheduled_for) where archived_at is null;
create table public.social_post_files (              -- media: files from Drive, by reference
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  post_id uuid not null,
  file_id uuid not null,
  position int not null default 1 check (position between 1 and 10),
  created_by uuid, created_at timestamptz not null default now(),
  primary key (post_id, file_id),
  foreign key (workspace_id, post_id) references public.social_posts (workspace_id, id) on delete cascade,
  foreign key (workspace_id, file_id) references public.files (workspace_id, id)
);
create or replace function private.social_posts_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); deep boolean := pg_trigger_depth() >= 2; locked boolean;
begin
  if tg_op = 'INSERT' then
    if uid is not null then new.created_by := uid; end if;
    if new.status not in ('idea', 'draft') then raise exception 'a new post starts as an idea or a draft' using errcode = 'P0001'; end if;
    new.published_at := null; new.archived_at := null;
  else
    if new.workspace_id is distinct from old.workspace_id or new.client_id is distinct from old.client_id or new.created_by is distinct from old.created_by then
      raise exception 'records do not move' using errcode = 'P0001';
    end if;
    locked := old.status in ('in_review', 'approved', 'scheduled', 'published');
    if locked and (new.title is distinct from old.title or new.caption is distinct from old.caption or new.channel is distinct from old.channel) then
      raise exception 'send the post back to draft before changing its content' using errcode = 'P0001';
    end if;
    if new.status is distinct from old.status then
      if new.status in ('in_review', 'approved') and not deep then raise exception 'review and approval come from the approval of the post' using errcode = 'P0001'; end if;
      if old.status = 'published' then raise exception 'a published post is final (archive it)' using errcode = 'P0001'; end if;
      if old.status = 'in_review' and not deep then raise exception 'withdraw or decide the approval first' using errcode = 'P0001'; end if;
      if new.status in ('scheduled', 'published') and uid is not null and not private.has_permission(new.workspace_id, 'social.post.schedule', new.client_id) then raise exception 'not found' using errcode = '42501'; end if;
      if new.status = 'scheduled' and old.status <> 'approved' then raise exception 'only an approved post can be scheduled' using errcode = 'P0001'; end if;
      if new.status = 'published' and old.status not in ('approved', 'scheduled') then raise exception 'only an approved or scheduled post can be marked published' using errcode = 'P0001'; end if;
      if new.status = 'published' then new.published_at := now(); end if;
      if new.status in ('idea', 'draft') then new.scheduled_for := case when new.status = 'idea' then null else new.scheduled_for end; end if;
    end if;
    if new.published_at is distinct from old.published_at and new.status <> 'published' then new.published_at := old.published_at; end if;
    new.updated_at := now();
  end if;
  return new;
end $$;
create trigger social_posts_guard before insert or update on public.social_posts for each row execute function private.social_posts_guard();
create or replace function private.social_post_files_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); pc uuid; pfound boolean; fc uuid; ffound boolean; n int;
begin
  select true, p.client_id into pfound, pc from public.social_posts p where p.workspace_id = new.workspace_id and p.id = new.post_id and p.archived_at is null;
  select true, f.client_id into ffound, fc from public.files f where f.workspace_id = new.workspace_id and f.id = new.file_id and f.archived_at is null;
  if pfound is not true or ffound is not true then raise exception 'not found' using errcode = '42501'; end if;
  if fc is not null and fc is distinct from pc then raise exception 'a post can only use this client''s files or shared ones' using errcode = 'P0001'; end if;
  select count(*) into n from public.social_post_files x where x.post_id = new.post_id;
  if n >= 10 then raise exception 'a post has at most 10 media files' using errcode = 'P0001'; end if;
  if uid is not null then new.created_by := uid; end if;
  return new;
end $$;
create trigger social_post_files_guard before insert on public.social_post_files for each row execute function private.social_post_files_guard();
create trigger social_posts_refuse_delete before delete on public.social_posts for each row execute function private.archive_before_delete();
create or replace function private.social_post_files_locked() returns trigger
language plpgsql security definer set search_path = '' as $$
declare st text;
begin
  select p.status into st from public.social_posts p where p.id = coalesce(new.post_id, old.post_id);
  if st in ('in_review', 'approved', 'scheduled', 'published') then raise exception 'send the post back to draft before changing its media' using errcode = 'P0001'; end if;
  return coalesce(new, old);
end $$;
create trigger social_post_files_locked before insert or delete on public.social_post_files for each row execute function private.social_post_files_locked();
create or replace function private.social_post_follow_approval() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.subject_type <> 'post' then return null; end if;
  if tg_op = 'INSERT' then
    update public.social_posts set status = 'in_review' where workspace_id = new.workspace_id and id = new.subject_id and status = 'draft';
    if not found then raise exception 'only a draft post can be sent for review' using errcode = 'P0001'; end if;
  elsif new.status = 'approved' then
    update public.social_posts set status = 'approved' where workspace_id = new.workspace_id and id = new.subject_id and status = 'in_review';
  elsif new.status in ('rejected', 'withdrawn') then
    update public.social_posts set status = 'draft' where workspace_id = new.workspace_id and id = new.subject_id and status = 'in_review';
  end if;
  return null;
end $$;
create trigger social_post_follow_approval after insert or update on public.approvals for each row execute function private.social_post_follow_approval();
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
do $$
declare t text;
begin
  foreach t in array array['social_posts', 'social_post_files'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('create policy org_scope on public.%I as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id))', t);
  end loop;
end $$;
create policy social_posts_select on public.social_posts for select using (private.has_permission(workspace_id, 'social.post.view', client_id));
create policy social_posts_insert on public.social_posts for insert with check (private.has_permission(workspace_id, 'social.post.create', client_id));
create policy social_posts_update on public.social_posts for update using (private.has_permission(workspace_id, 'social.post.edit', client_id)) with check (private.has_permission(workspace_id, 'social.post.edit', client_id));
create policy social_posts_delete on public.social_posts for delete using (private.has_permission(workspace_id, 'social.post.delete'));
create policy social_files_select on public.social_post_files for select using (exists (select 1 from public.social_posts p where p.workspace_id = social_post_files.workspace_id and p.id = social_post_files.post_id));
create policy social_files_insert on public.social_post_files for insert with check (
  private.has_permission(workspace_id, 'social.post.edit', (select p.client_id from public.social_posts p where p.workspace_id = social_post_files.workspace_id and p.id = social_post_files.post_id))
  and exists (select 1 from public.files f where f.workspace_id = social_post_files.workspace_id and f.id = social_post_files.file_id));
create policy social_files_delete on public.social_post_files for delete using (
  private.has_permission(workspace_id, 'social.post.edit', (select p.client_id from public.social_posts p where p.workspace_id = social_post_files.workspace_id and p.id = social_post_files.post_id)));
create trigger audit_social_posts after insert or update or delete on public.social_posts for each row execute function private.audit_change('client_id', 'channel', 'title', 'status', 'scheduled_for', 'archived_at');
create trigger audit_social_files after insert or delete on public.social_post_files for each row execute function private.audit_change('post_id', 'file_id');
create or replace function private.refuse_delete_social_clients() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.social_posts where client_id = old.id) then raise exception 'archive this client instead: it still has work' using errcode = 'P0001'; end if;
  return old;
end $$;
create trigger clients_refuse_delete_social before delete on public.clients for each row execute function private.refuse_delete_social_clients();
revoke all on all functions in schema private from public;
grant select, insert, update, delete on public.social_posts to app_user;
grant select, insert, delete on public.social_post_files to app_user;
-- ===== 0022_rate_limit_grant.sql =====
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'postgres') then
    grant usage on schema private to postgres;
    grant execute on function private.rate_limit_take(text, text, int, int) to postgres;
  end if;
end $$;
-- ===== 0023_storage_cap.sql =====
set check_function_bodies = off;
create table public.storage_settings (
  singleton boolean primary key default true check (singleton),
  cap_bytes bigint not null default 8000000000 check (cap_bytes between 0 and 10000000000000),
  updated_at timestamptz not null default now()
);
insert into public.storage_settings (singleton) values (true);
alter table public.storage_settings enable row level security; alter table public.storage_settings force row level security;
create policy storage_settings_select on public.storage_settings for select using (exists (select 1 from public.memberships m where m.user_id = private.current_user_id() and m.kind = 'staff' and m.status = 'active'));
create or replace function private.storage_used_bytes() returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(size_bytes), 0)::bigint from public.file_versions where storage_path is not null
$$;
create or replace function private.file_versions_cap() returns trigger
language plpgsql security definer set search_path = '' as $$
declare cap bigint; used bigint;
begin
  if new.storage_path is null then return new; end if;
  if new.size_bytes is null then raise exception 'a stored file needs its size' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(7230001);                      -- one registration at a time
  select s.cap_bytes into cap from public.storage_settings s;
  used := private.storage_used_bytes();
  if used + coalesce(new.size_bytes, 0) > cap then
    raise exception 'storage limit reached' using errcode = 'P0001', hint = 'storage_limit';
  end if;
  return new;
end $$;
create trigger file_versions_cap before insert on public.file_versions for each row execute function private.file_versions_cap();
create or replace function public.storage_usage()
returns table (total_bytes bigint, cap_bytes bigint, org_bytes bigint, files int, versions int, by_space jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare r text := private.request_org(); ws uuid;
begin
  if r is null or r !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return; end if;
  ws := r::uuid;
  if not private.has_role(ws, 'admin') then return; end if;
  return query select private.storage_used_bytes(), (select s.cap_bytes from public.storage_settings s),
    coalesce((select sum(v.size_bytes) from public.file_versions v where v.workspace_id = ws and v.storage_path is not null), 0)::bigint,
    (select count(*)::int from public.files f where f.workspace_id = ws and f.kind = 'file'),
    (select count(*)::int from public.file_versions v where v.workspace_id = ws and v.storage_path is not null),
    coalesce((select jsonb_object_agg(x.space, x.bytes) from (select f.space, sum(v.size_bytes)::bigint as bytes from public.file_versions v join public.files f on f.id = v.file_id where v.workspace_id = ws and v.storage_path is not null group by f.space) x), '{}'::jsonb);
end $$;
revoke all on function public.storage_usage() from public;
grant execute on function public.storage_usage() to app_user;
revoke all on all functions in schema private from public;
grant select on public.storage_settings to app_user;
grant execute on function private.storage_used_bytes() to app_user;   -- the API checks room before it signs an upload
-- ===== 0024_file_context.sql =====
alter table public.files add column project_id uuid;
alter table public.files add constraint files_project_fk foreign key (workspace_id, project_id) references public.projects (workspace_id, id);
create index files_project on public.files (workspace_id, project_id) where project_id is not null and archived_at is null;
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
create trigger files_context_guard before insert or update on public.files for each row execute function private.files_context_guard();
create policy files_project_context on public.files as restrictive for all
  using (project_id is null or exists (select 1 from public.projects p where p.workspace_id = files.workspace_id and p.id = files.project_id))
  with check (project_id is null or exists (select 1 from public.projects p where p.workspace_id = files.workspace_id and p.id = files.project_id));
drop trigger audit_files on public.files;
create trigger audit_files after insert or update or delete on public.files
  for each row execute function private.audit_change('space', 'client_id', 'owner_id', 'folder_id', 'project_id', 'name', 'kind', 'protected_sop', 'sop_key', 'client_visible', 'archived_at', 'current_version');
revoke all on function private.files_context_guard() from public;
-- ===== 0025_drive_library.sql =====
alter table public.files add column managed_by text check (managed_by in ('projects', 'clients', 'portal', 'whiteboard', 'forms', 'social_planner', 'value_ladder', 'funnels', 'planner'));
alter table public.files add column in_library boolean;
update public.files set managed_by = 'projects' where project_id is not null and managed_by is null;
update public.files set managed_by = 'whiteboard' where managed_by is null and mime_type = 'application/vnd.excalidraw+json';
update public.files set in_library = (space = 'shared' and managed_by is null) or protected_sop;
alter table public.files alter column in_library set not null;
alter table public.files add constraint files_library_shape check (not in_library or space = 'shared'),
  add constraint files_sop_in_library check (not protected_sop or in_library);
create index files_library on public.files (workspace_id, folder_id) where in_library and archived_at is null;
create or replace function private.files_library_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id();
begin
  if tg_op = 'INSERT' then
    if new.managed_by is null and new.project_id is not null then new.managed_by := 'projects'; end if;
    if new.in_library is null then new.in_library := (new.space = 'shared' and new.managed_by is null); end if;
  else
    if new.managed_by is distinct from old.managed_by then raise exception 'records do not move' using errcode = 'P0001'; end if;
    if new.protected_sop and not old.protected_sop then new.in_library := true; end if;          -- promoting a document to a protected SOP puts it in the library
    if new.in_library is distinct from old.in_library and uid is not null and not private.has_permission(new.workspace_id, 'drive.file.edit', new.client_id) then
      raise exception 'not found' using errcode = '42501';
    end if;
  end if;
  if new.protected_sop and new.in_library is not true then raise exception 'a protected SOP always stays in the library' using errcode = 'P0001'; end if;
  if new.in_library and new.space <> 'shared' then
    raise exception 'client and personal files are never part of the shared Drive library' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger files_library_guard before insert or update on public.files for each row execute function private.files_library_guard();
revoke all on function private.files_library_guard() from public;
drop trigger audit_files on public.files;
create trigger audit_files after insert or update or delete on public.files
  for each row execute function private.audit_change('space', 'client_id', 'owner_id', 'folder_id', 'project_id', 'name', 'kind', 'protected_sop', 'sop_key', 'client_visible', 'archived_at', 'current_version', 'managed_by', 'in_library');
-- ===== 0026_team_directory.sql =====
create or replace function public.team_list()
returns table (user_id uuid, display_name text, email text, role text, is_you boolean)
language plpgsql stable security definer set search_path = '' as $$
declare ws uuid; r text := private.request_org();
begin
  if r is null or r !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return; end if;
  ws := r::uuid;
  if not private.is_staff(ws) then return; end if;
  return query
    select m.user_id, coalesce(p.display_name, 'Member ' || left(m.user_id::text, 4)),
           case when private.has_role(ws, 'admin') then p.email else null end,
           m.role, m.user_id = private.current_user_id()
      from public.memberships m left join public.profiles p on p.id = m.user_id
     where m.workspace_id = ws and m.kind = 'staff' and m.status = 'active'
     order by lower(coalesce(p.display_name, 'zz')), m.user_id;
end $$;
revoke all on function public.team_list() from public;
grant execute on function public.team_list() to app_user;
-- ===== 0027_client_strategy_copies.sql =====
create table public.client_strategy_copies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null,
  kind text not null check (kind in ('avatars', 'offers', 'stories', 'brand_kits')),
  source_id uuid not null,
  copy_id uuid not null,
  created_by uuid, created_at timestamptz not null default now(),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id),
  unique (workspace_id, client_id, kind, source_id),
  unique (workspace_id, copy_id)
);
create unique index client_strategy_one_brand_kit on public.client_strategy_copies (workspace_id, client_id) where kind = 'brand_kits';
create or replace function private.client_strategy_copy_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare ok boolean;
begin
  if tg_op = 'UPDATE' then raise exception 'copies are not edited here' using errcode = 'P0001'; end if;
  new.created_by := coalesce(private.current_user_id(), new.created_by);
  execute format('select exists (select 1 from public.%1$I c where c.workspace_id = $1 and c.id = $2 and c.client_id = $3)
                   and exists (select 1 from public.%1$I s where s.workspace_id = $1 and s.id = $4 and s.client_id is null)',
                 case new.kind when 'avatars' then 'funnel_avatars' when 'offers' then 'funnel_offers' when 'stories' then 'funnel_stories' else 'funnel_brand_kits' end)
    into ok using new.workspace_id, new.copy_id, new.client_id, new.source_id;
  if not ok then raise exception 'a copy must belong to this client and come from the organization library' using errcode = 'P0001'; end if;
  return new;
end $$;
create trigger client_strategy_copies_guard before insert or update on public.client_strategy_copies for each row execute function private.client_strategy_copy_guard();
revoke all on function private.client_strategy_copy_guard() from public;
alter table public.client_strategy_copies enable row level security;
alter table public.client_strategy_copies force row level security;
create policy org_scope on public.client_strategy_copies as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
create policy client_strategy_copies_select on public.client_strategy_copies for select using (private.has_permission(workspace_id, 'clients.client.view', client_id));
create policy client_strategy_copies_insert on public.client_strategy_copies for insert with check (private.has_permission(workspace_id, 'clients.client.edit', client_id));
create policy client_strategy_copies_delete on public.client_strategy_copies for delete using (private.has_permission(workspace_id, 'clients.client.edit', client_id));
create trigger audit_client_strategy_copies after insert or delete on public.client_strategy_copies
  for each row execute function private.audit_change('client_id', 'kind', 'source_id', 'copy_id');
create index client_strategy_copies_client on public.client_strategy_copies (workspace_id, client_id);
grant select, insert, delete on public.client_strategy_copies to app_user;
-- ===== 0028_funnel_strategies.sql =====
insert into public.permissions (key, app_key, description, floor_role, default_role, scopes, sensitive) values
  ('funnels.strategy.view',   'office', 'View funnel strategies',                                  'viewer', 'viewer', '{workspace,client}', false),
  ('funnels.strategy.create', 'office', 'Create funnel strategies',                                'editor', 'editor', '{workspace,client}', false),
  ('funnels.strategy.edit',   'office', 'Edit, approve or archive funnel strategies',              'editor', 'editor', '{workspace,client}', false),
  ('funnels.strategy.delete', 'office', 'Permanently delete an ARCHIVED funnel strategy',          'admin',  'owner',  '{workspace}', true);
insert into public.access_level_permissions (workspace_id, access_level_id, permission_key)
select l.workspace_id, l.id, k from public.access_levels l
  cross join unnest(case when l.name = 'Funnels · edit' then array['funnels.strategy.view', 'funnels.strategy.create', 'funnels.strategy.edit']
                         when l.name = 'Funnels · read' then array['funnels.strategy.view'] else array[]::text[] end) k
 where l.app_key = 'office' and l.is_template
on conflict do nothing;
create or replace function private.seed_funnel_levels(ws uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare lvl uuid;
begin
  insert into public.access_levels (workspace_id, app_key, name, description, is_template)
  values (ws, 'office', 'Funnels · edit', 'See, create and edit funnel records (not sharing with clients, not deleting)', true) returning id into lvl;
  insert into public.access_level_permissions (workspace_id, access_level_id, permission_key)
  select ws, lvl, k from unnest(array[
    'funnels.avatar.view','funnels.avatar.create','funnels.avatar.edit','funnels.offer.view','funnels.offer.create','funnels.offer.edit',
    'funnels.story.view','funnels.story.create','funnels.story.edit','funnels.brandkit.view','funnels.brandkit.create','funnels.brandkit.edit',
    'funnels.strategy.view','funnels.strategy.create','funnels.strategy.edit',
    'funnels.reference.view','funnels.reference.manage']) k;
  insert into public.access_levels (workspace_id, app_key, name, description, is_template)
  values (ws, 'office', 'Funnels · read', 'See funnel records, change nothing', true) returning id into lvl;
  insert into public.access_level_permissions (workspace_id, access_level_id, permission_key)
  select ws, lvl, k from unnest(array['funnels.avatar.view','funnels.offer.view','funnels.story.view','funnels.brandkit.view','funnels.strategy.view','funnels.reference.view']) k;
end $$;
revoke all on function private.seed_funnel_levels(uuid) from public;
create table public.funnel_strategies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid,
  name text not null check (length(name) between 1 and 200),
  status text not null default 'draft' check (status in ('draft', 'in_review', 'approved')),
  file_id uuid not null,
  map_url text check (map_url ~ '^https://[^[:space:]]+$' and length(map_url) <= 500),
  map_label text check (length(map_label) <= 200),
  notes text check (length(notes) <= 8000),
  archived_at timestamptz,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, file_id),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id),
  foreign key (workspace_id, file_id) references public.files (workspace_id, id)
);
create or replace function private.funnel_strategies_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); f record;
begin
  if tg_op = 'INSERT' then
    if uid is not null then new.created_by := uid; end if;
  else
    if new.workspace_id is distinct from old.workspace_id or new.client_id is distinct from old.client_id or new.file_id is distinct from old.file_id or new.created_by is distinct from old.created_by then
      raise exception 'records do not move' using errcode = 'P0001';
    end if;
    new.updated_at := now();
  end if;
  if tg_op = 'INSERT' then
    select space, client_id, kind, managed_by into f from public.files where workspace_id = new.workspace_id and id = new.file_id;
    if f.kind is distinct from 'document' or f.managed_by is distinct from 'funnels'
       or (new.client_id is null and f.space is distinct from 'shared') or (new.client_id is not null and (f.space is distinct from 'client' or f.client_id is distinct from new.client_id)) then
      raise exception 'a strategy needs its own document in the Funnels app (organization or this client)' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.funnel_strategies_guard() from public;
create trigger funnel_strategies_guard before insert or update on public.funnel_strategies for each row execute function private.funnel_strategies_guard();
create trigger funnel_strategies_refuse_delete before delete on public.funnel_strategies for each row execute function private.archive_before_delete();
alter table public.funnel_strategies enable row level security;
alter table public.funnel_strategies force row level security;
create policy org_scope on public.funnel_strategies as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
create policy funnel_strategies_select on public.funnel_strategies for select using (private.has_permission(workspace_id, 'funnels.strategy.view', client_id));
create policy funnel_strategies_insert on public.funnel_strategies for insert with check (private.has_permission(workspace_id, 'funnels.strategy.create', client_id));
create policy funnel_strategies_update on public.funnel_strategies for update using (private.has_permission(workspace_id, 'funnels.strategy.edit', client_id)) with check (private.has_permission(workspace_id, 'funnels.strategy.edit', client_id));
create policy funnel_strategies_delete on public.funnel_strategies for delete using (private.has_permission(workspace_id, 'funnels.strategy.delete'));
create trigger audit_funnel_strategies after insert or update or delete on public.funnel_strategies
  for each row execute function private.audit_change('client_id', 'name', 'status', 'file_id', 'map_url', 'archived_at');   -- never the notes
create index funnel_strategies_scope on public.funnel_strategies (workspace_id, client_id) where archived_at is null;
alter table public.funnel_references drop constraint funnel_references_referrer_app_check;
alter table public.funnel_references add constraint funnel_references_referrer_app_check check (referrer_app in ('clients', 'value_ladder', 'funnels'));
alter table public.client_strategy_copies drop constraint client_strategy_copies_kind_check;
alter table public.client_strategy_copies add constraint client_strategy_copies_kind_check check (kind in ('avatars', 'offers', 'stories', 'brand_kits', 'strategies'));
create or replace function private.client_strategy_copy_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare ok boolean;
begin
  if tg_op = 'UPDATE' then raise exception 'copies are not edited here' using errcode = 'P0001'; end if;
  new.created_by := coalesce(private.current_user_id(), new.created_by);
  execute format('select exists (select 1 from public.%1$I c where c.workspace_id = $1 and c.id = $2 and c.client_id = $3)
                   and exists (select 1 from public.%1$I s where s.workspace_id = $1 and s.id = $4 and s.client_id is null)',
                 case new.kind when 'avatars' then 'funnel_avatars' when 'offers' then 'funnel_offers' when 'stories' then 'funnel_stories' when 'strategies' then 'funnel_strategies' else 'funnel_brand_kits' end)
    into ok using new.workspace_id, new.copy_id, new.client_id, new.source_id;
  if not ok then raise exception 'a copy must belong to this client and come from the organization library' using errcode = 'P0001'; end if;
  return new;
end $$;
revoke all on function private.client_strategy_copy_guard() from public;
grant select, insert, update, delete on public.funnel_strategies to app_user;
-- ===== 0029_forms_v4.sql =====
alter table public.forms
  add column confirmation_message text check (length(confirmation_message) <= 1000),
  add column redirect_url text check (redirect_url ~ '^https://[^[:space:]]+$' and length(redirect_url) <= 500),
  add column retention_note text check (length(retention_note) <= 500),
  add column is_template boolean not null default false;
create or replace function private.form_fields_valid(f jsonb) returns text
language plpgsql immutable set search_path = '' as $$
declare e jsonb; k text; seen text[] := '{}'; t text; o jsonb; s jsonb; a jsonb;
begin
  if jsonb_typeof(f) <> 'array' then return 'fields must be a list'; end if;
  if jsonb_array_length(f) > 60 then return 'at most 60 fields'; end if;
  if octet_length(f::text) > 60000 then return 'the form is too large'; end if;
  for e in select * from jsonb_array_elements(f) loop
    if jsonb_typeof(e) <> 'object' then return 'each field must be an object'; end if;
    k := e ->> 'key'; t := e ->> 'type';
    if k is null or k !~ '^[a-z][a-z0-9_]{0,39}$' then return 'a field key is missing or invalid'; end if;
    if k = any(seen) then return 'duplicate field key ' || k; end if;
    if t is null or t not in ('text', 'textarea', 'email', 'phone', 'url', 'number', 'date', 'select', 'multi_select', 'checkbox', 'file') then return 'unknown field type for ' || k; end if;
    if e ->> 'label' is null or length(e ->> 'label') not between 1 and 200 then return 'a field label is missing or too long'; end if;
    if e ? 'required' and jsonb_typeof(e -> 'required') <> 'boolean' then return 'required must be true or false'; end if;
    if e ? 'help' and (jsonb_typeof(e -> 'help') <> 'string' or length(e ->> 'help') > 300) then return 'help text is too long (' || k || ')'; end if;
    if t in ('select', 'multi_select') then
      o := e -> 'options';
      if o is null or jsonb_typeof(o) <> 'array' or jsonb_array_length(o) not between 1 and 50 then return 'choices need 1 to 50 options (' || k || ')'; end if;
      if exists (select 1 from jsonb_array_elements(o) x where jsonb_typeof(x) <> 'string' or length(x #>> '{}') not between 1 and 100) then return 'options must be short text (' || k || ')'; end if;
    end if;
    if (e ? 'min' or e ? 'max') then
      if t not in ('number', 'text', 'textarea') then return 'limits only apply to numbers and text (' || k || ')'; end if;
      if (e ? 'min' and jsonb_typeof(e -> 'min') <> 'number') or (e ? 'max' and jsonb_typeof(e -> 'max') <> 'number') then return 'limits must be numbers (' || k || ')'; end if;
      if e ? 'min' and e ? 'max' and (e ->> 'min')::numeric > (e ->> 'max')::numeric then return 'the minimum is above the maximum (' || k || ')'; end if;
      if t <> 'number' and ((e ? 'min' and ((e ->> 'min')::numeric < 0 or (e ->> 'min')::numeric > 10000)) or (e ? 'max' and ((e ->> 'max')::numeric < 1 or (e ->> 'max')::numeric > 10000))) then return 'text limits are 0 to 10000 (' || k || ')'; end if;
    end if;
    if t = 'file' then
      if e ? 'accept' then
        a := e -> 'accept';
        if jsonb_typeof(a) <> 'array' or jsonb_array_length(a) > 10 or exists (select 1 from jsonb_array_elements(a) x where jsonb_typeof(x) <> 'string' or (x #>> '{}') !~ '^[a-z0-9]{1,8}$') then return 'accepted file types are short lower-case extensions (' || k || ')'; end if;
      end if;
      if e ? 'max_mb' and (jsonb_typeof(e -> 'max_mb') <> 'number' or (e ->> 'max_mb')::numeric not between 1 and 25) then return 'file size limit is 1 to 25 MB (' || k || ')'; end if;
    elsif e ? 'accept' or e ? 'max_mb' then return 'file limits only apply to file fields (' || k || ')'; end if;
    if e ? 'show_if' then
      s := e -> 'show_if';
      if jsonb_typeof(s) <> 'object' or s ->> 'key' is null or not (s ->> 'key') = any(seen) then return 'show-if must point at an earlier field (' || k || ')'; end if;
      if (s ->> 'op') is null or (s ->> 'op') not in ('eq', 'neq', 'filled', 'empty') then return 'show-if needs an operator (' || k || ')'; end if;
      if (s ->> 'op') in ('eq', 'neq') and (not s ? 'value' or jsonb_typeof(s -> 'value') not in ('string', 'number', 'boolean') or length(s ->> 'value') > 100) then return 'show-if needs a short value (' || k || ')'; end if;
    end if;
    seen := seen || k;
  end loop;
  return null;
end $$;
create or replace function private.form_answers_valid(f jsonb, a jsonb) returns text
language plpgsql immutable set search_path = '' as $$
declare e jsonb; k text; t text; v jsonb; s jsonb; sv jsonb; vis boolean; hit boolean; n int;
begin
  if jsonb_typeof(a) <> 'object' then return 'answers must be an object'; end if;
  if octet_length(a::text) > 100000 then return 'answers are too large'; end if;
  if exists (select 1 from jsonb_object_keys(a) ak where not exists (select 1 from jsonb_array_elements(f) fe where fe ->> 'key' = ak)) then return 'an answer does not belong to this form'; end if;
  for e in select * from jsonb_array_elements(f) loop
    k := e ->> 'key'; t := e ->> 'type'; v := a -> k; vis := true;
    if e ? 'show_if' then
      s := e -> 'show_if'; sv := a -> (s ->> 'key');
      hit := case s ->> 'op'
        when 'eq' then coalesce(sv = (s -> 'value') or (jsonb_typeof(sv) = 'array' and sv @> jsonb_build_array(s -> 'value')), false)
        when 'neq' then not coalesce(sv = (s -> 'value') or (jsonb_typeof(sv) = 'array' and sv @> jsonb_build_array(s -> 'value')), false)
        when 'filled' then not (sv is null or sv = 'null'::jsonb or sv = '""'::jsonb or sv = '[]'::jsonb)
        else (sv is null or sv = 'null'::jsonb or sv = '""'::jsonb or sv = '[]'::jsonb) end;
      vis := hit;
    end if;
    if v is null or v = 'null'::jsonb or v = '""'::jsonb or v = '[]'::jsonb then
      if vis and coalesce((e ->> 'required')::boolean, false) and t <> 'checkbox' then return 'required: ' || k; end if;
      continue;
    end if;
    if not vis then return 'an answer for a hidden question: ' || k; end if;
    if t in ('text', 'textarea') and (jsonb_typeof(v) <> 'string' or length(v #>> '{}') > 10000) then return 'text expected: ' || k; end if;
    if t in ('text', 'textarea') and ((e ? 'min' and length(v #>> '{}') < (e ->> 'min')::numeric) or (e ? 'max' and length(v #>> '{}') > (e ->> 'max')::numeric)) then return 'wrong length: ' || k; end if;
    if t = 'email' and (jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^[^\s@]{1,64}@[^\s@]{1,255}$') then return 'e-mail expected: ' || k; end if;
    if t = 'phone' and (jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^[-+0-9 ()]{5,30}$') then return 'phone number expected: ' || k; end if;
    if t = 'url' and (jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^https?://[^\s]+$' or length(v #>> '{}') > 2000) then return 'web address expected: ' || k; end if;
    if t = 'number' and jsonb_typeof(v) <> 'number' then return 'number expected: ' || k; end if;
    if t = 'number' and ((e ? 'min' and (v #>> '{}')::numeric < (e ->> 'min')::numeric) or (e ? 'max' and (v #>> '{}')::numeric > (e ->> 'max')::numeric)) then return 'out of range: ' || k; end if;
    if t = 'date' and (jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$') then return 'date expected: ' || k; end if;
    if t = 'checkbox' and jsonb_typeof(v) <> 'boolean' then return 'yes or no expected: ' || k; end if;
    if t = 'select' and not (e -> 'options') @> jsonb_build_array(v) then return 'one of the options expected: ' || k; end if;
    if t = 'multi_select' and (jsonb_typeof(v) <> 'array' or exists (select 1 from jsonb_array_elements(v) x where not (e -> 'options') @> jsonb_build_array(x))) then return 'options expected: ' || k; end if;
    if t = 'file' then
      if jsonb_typeof(v) <> 'array' then return 'files expected: ' || k; end if;
      n := jsonb_array_length(v);
      if n > 10 or exists (select 1 from jsonb_array_elements(v) x where jsonb_typeof(x) <> 'string' or (x #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then return 'files expected: ' || k; end if;
    end if;
  end loop;
  return null;
end $$;
revoke all on function private.form_fields_valid(jsonb), private.form_answers_valid(jsonb, jsonb) from public;
-- ===== 0030_value_ladder_v4.sql =====
alter table public.value_ladder_rungs drop constraint value_ladder_rungs_stage_check;
alter table public.value_ladder_rungs add constraint value_ladder_rungs_stage_check check (stage in ('lead_magnet', 'tripwire', 'core', 'upsell', 'downsell', 'continuity', 'premium'));
alter table public.value_ladder_rungs
  add column audience text check (length(audience) <= 500),
  add column conversion_pct numeric(5, 2) check (conversion_pct between 0 and 100),
  add column assumption_notes text check (length(assumption_notes) <= 2000),
  add column owner_id uuid;
alter table public.value_ladders add column status text not null default 'draft' check (status in ('draft', 'approved'));
create table public.value_ladder_versions (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  ladder_id uuid not null,
  client_id uuid,
  version int not null check (version >= 1),
  name text not null,
  description text,
  status text not null,
  rungs jsonb not null check (jsonb_typeof(rungs) = 'array' and jsonb_array_length(rungs) <= 12),
  note text check (length(note) <= 300),
  created_by uuid, created_at timestamptz not null default now(),
  primary key (ladder_id, version),
  foreign key (workspace_id, ladder_id) references public.value_ladders (workspace_id, id)
);
create or replace function private.value_ladder_versions_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); lc uuid; lfound boolean; cur int;
begin
  if tg_op <> 'INSERT' then raise exception 'saved versions cannot be changed or removed' using errcode = 'P0001'; end if;
  select true, l.client_id into lfound, lc from public.value_ladders l where l.workspace_id = new.workspace_id and l.id = new.ladder_id;
  if lfound is not true then raise exception 'not found' using errcode = '42501'; end if;
  select coalesce(max(v.version), 0) into cur from public.value_ladder_versions v where v.ladder_id = new.ladder_id;
  new.version := cur + 1; new.client_id := lc; if uid is not null then new.created_by := uid; end if;
  return new;
end $$;
create trigger value_ladder_versions_guard before insert or update or delete on public.value_ladder_versions for each row execute function private.value_ladder_versions_guard();
revoke all on function private.value_ladder_versions_guard() from public;
alter table public.value_ladder_versions enable row level security;
alter table public.value_ladder_versions force row level security;
create policy org_scope on public.value_ladder_versions as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
create policy value_ladder_versions_select on public.value_ladder_versions for select using (private.has_permission(workspace_id, 'valueladder.ladder.view', client_id));
create policy value_ladder_versions_insert on public.value_ladder_versions for insert with check (private.has_permission(workspace_id, 'valueladder.ladder.edit', (select l.client_id from public.value_ladders l where l.workspace_id = value_ladder_versions.workspace_id and l.id = value_ladder_versions.ladder_id)));
create trigger audit_value_ladder_versions after insert on public.value_ladder_versions for each row execute function private.audit_change('ladder_id', 'version', 'status');
grant select, insert on public.value_ladder_versions to app_user;
alter table public.client_strategy_copies drop constraint client_strategy_copies_kind_check;
alter table public.client_strategy_copies add constraint client_strategy_copies_kind_check check (kind in ('avatars', 'offers', 'stories', 'brand_kits', 'strategies', 'ladders'));
create or replace function private.client_strategy_copy_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare ok boolean;
begin
  if tg_op = 'UPDATE' then raise exception 'copies are not edited here' using errcode = 'P0001'; end if;
  new.created_by := coalesce(private.current_user_id(), new.created_by);
  execute format('select exists (select 1 from public.%1$I c where c.workspace_id = $1 and c.id = $2 and c.client_id = $3)
                   and exists (select 1 from public.%1$I s where s.workspace_id = $1 and s.id = $4 and s.client_id is null)',
                 case new.kind when 'avatars' then 'funnel_avatars' when 'offers' then 'funnel_offers' when 'stories' then 'funnel_stories' when 'strategies' then 'funnel_strategies' when 'ladders' then 'value_ladders' else 'funnel_brand_kits' end)
    into ok using new.workspace_id, new.copy_id, new.client_id, new.source_id;
  if not ok then raise exception 'a copy must belong to this client and come from the organization library' using errcode = 'P0001'; end if;
  return new;
end $$;
revoke all on function private.client_strategy_copy_guard() from public;
-- ===== 0031_social_v4.sql =====
set check_function_bodies = off;
create table public.social_channels (
  key text primary key,
  label text not null,
  max_text int check (max_text is null or max_text > 0),      -- characters; null = no fixed limit
  max_media int not null default 10 check (max_media between 0 and 10),
  media_types text[] not null default '{image,video}',
  can_schedule boolean not null default true,                 -- the channel supports a planned time (the post is still published by a person)
  connect_state text not null default 'off' check (connect_state in ('off'))
);
insert into public.social_channels (key, label, max_text, max_media, media_types) values
  ('facebook', 'Facebook', 63206, 10, '{image,video}'),
  ('instagram', 'Instagram', 2200, 10, '{image,video}'),
  ('linkedin', 'LinkedIn', 3000, 9, '{image,video,document}'),
  ('x', 'X', 280, 4, '{image,video}'),
  ('tiktok', 'TikTok', 2200, 1, '{video}'),
  ('youtube', 'YouTube', 5000, 1, '{video}'),
  ('pinterest', 'Pinterest', 500, 1, '{image,video}'),
  ('email', 'Email', null, 10, '{image}'),
  ('other', 'Other', null, 10, '{image,video,document}');
alter table public.social_channels enable row level security; alter table public.social_channels force row level security;
create or replace function private.is_staff_anywhere() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m where m.user_id = private.current_user_id() and m.kind = 'staff' and m.status = 'active')
$$;
create policy social_channels_read on public.social_channels for select using (private.is_staff_anywhere());
create table public.social_campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid,
  name text not null check (length(name) between 1 and 200),
  goal text check (length(goal) <= 1000),
  status text not null default 'draft' check (status in ('draft', 'planned', 'active', 'paused', 'completed')),
  starts_on date, ends_on date,
  owner_id uuid,
  archived_at timestamptz,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on),
  unique (workspace_id, id),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id)
);
create index social_campaigns_list on public.social_campaigns (workspace_id, archived_at, starts_on);
alter table public.social_posts drop constraint social_posts_status_check;
alter table public.social_posts add constraint social_posts_status_check check (status in ('idea', 'draft', 'in_review', 'approved', 'scheduled', 'published', 'failed', 'cancelled'));
alter table public.social_posts
  add column campaign_id uuid,
  add column variant_of uuid,
  add column failure_reason text check (failure_reason is null or length(failure_reason) between 1 and 500),
  add column published_by uuid,
  add column post_url text check (post_url is null or (length(post_url) <= 500 and post_url ~ '^https?://[^ ]+$'));
alter table public.social_posts add constraint social_posts_campaign_fk foreign key (workspace_id, campaign_id) references public.social_campaigns (workspace_id, id);
alter table public.social_posts add constraint social_posts_variant_fk foreign key (workspace_id, variant_of) references public.social_posts (workspace_id, id) on delete set null (variant_of);
alter table public.social_posts add constraint social_posts_failed_has_reason check (status <> 'failed' or failure_reason is not null);
create index social_posts_campaign on public.social_posts (campaign_id) where campaign_id is not null;
create or replace function private.social_campaigns_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); open_posts int;
begin
  if tg_op = 'INSERT' then
    if uid is not null then new.created_by := uid; end if;
    new.status := 'draft'; new.archived_at := null;
  else
    if new.workspace_id is distinct from old.workspace_id or new.created_by is distinct from old.created_by then raise exception 'records do not move' using errcode = 'P0001'; end if;
    if new.client_id is distinct from old.client_id and exists (select 1 from public.social_posts p where p.campaign_id = old.id) then
      raise exception 'a campaign with posts stays with its client' using errcode = 'P0001';
    end if;
    if new.status is distinct from old.status then
      if not ((old.status, new.status) in (('draft', 'planned'), ('planned', 'draft'), ('planned', 'active'), ('draft', 'active'), ('active', 'paused'), ('paused', 'active'), ('active', 'completed'), ('paused', 'completed'), ('completed', 'active'))) then
        raise exception 'a campaign cannot go from % to %', old.status, new.status using errcode = 'P0001';
      end if;
      if new.status = 'completed' then
        select count(*) into open_posts from public.social_posts p where p.campaign_id = old.id and p.archived_at is null and p.status not in ('published', 'cancelled');
        if open_posts > 0 then raise exception 'finish or cancel the % post(s) still open before completing the campaign', open_posts using errcode = 'P0001'; end if;
      end if;
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;
create trigger social_campaigns_guard before insert or update on public.social_campaigns for each row execute function private.social_campaigns_guard();
create trigger social_campaigns_refuse_delete before delete on public.social_campaigns for each row execute function private.archive_before_delete();
create or replace function private.social_posts_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); deep boolean := pg_trigger_depth() >= 2; locked boolean; cc uuid; cfound boolean; carch timestamptz; mx int;
begin
  if tg_op = 'INSERT' then
    if uid is not null then new.created_by := uid; end if;
    if new.status not in ('idea', 'draft') then raise exception 'a new post starts as an idea or a draft' using errcode = 'P0001'; end if;
    new.published_at := null; new.archived_at := null; new.failure_reason := null; new.published_by := null; new.post_url := null;
  else
    if new.workspace_id is distinct from old.workspace_id or new.client_id is distinct from old.client_id or new.created_by is distinct from old.created_by then
      raise exception 'records do not move' using errcode = 'P0001';
    end if;
    locked := old.status in ('in_review', 'approved', 'scheduled', 'published', 'failed');
    if locked and (new.title is distinct from old.title or new.caption is distinct from old.caption or new.channel is distinct from old.channel) then
      raise exception 'send the post back to draft before changing its content' using errcode = 'P0001';
    end if;
    if new.status is distinct from old.status then
      if new.status in ('in_review', 'approved') and not deep then raise exception 'review and approval come from the approval of the post' using errcode = 'P0001'; end if;
      if old.status = 'published' then raise exception 'a published post is final (archive it)' using errcode = 'P0001'; end if;
      if old.status = 'in_review' and not deep then raise exception 'withdraw or decide the approval first' using errcode = 'P0001'; end if;
      if new.status in ('scheduled', 'published', 'failed') and uid is not null and not private.has_permission(new.workspace_id, 'social.post.schedule', new.client_id) then raise exception 'not found' using errcode = '42501'; end if;
      if new.status = 'scheduled' and old.status not in ('approved', 'failed') then raise exception 'only an approved post can be scheduled' using errcode = 'P0001'; end if;
      if new.status = 'published' and old.status not in ('approved', 'scheduled', 'failed') then raise exception 'only an approved or scheduled post can be marked published' using errcode = 'P0001'; end if;
      if new.status = 'failed' and old.status <> 'scheduled' then raise exception 'only a scheduled post can fail' using errcode = 'P0001'; end if;
      if new.status = 'cancelled' and old.status not in ('idea', 'draft', 'approved', 'scheduled', 'failed') then raise exception 'this post cannot be cancelled from here' using errcode = 'P0001'; end if;
      if old.status = 'cancelled' and new.status <> 'draft' then raise exception 'a cancelled post can only be reopened as a draft' using errcode = 'P0001'; end if;
      if old.status = 'failed' and new.status not in ('scheduled', 'draft', 'published', 'cancelled') then raise exception 'a failed post is retried, reopened as a draft, recorded as posted or cancelled' using errcode = 'P0001'; end if;
      if new.status = 'scheduled' then
        select c.max_text into mx from public.social_channels c where c.key = new.channel;
        if mx is not null and length(coalesce(new.caption, '')) > mx then raise exception 'the caption is longer than % allows (% characters)', new.channel, mx using errcode = 'P0001'; end if;
      end if;
      if new.status = 'published' then new.published_at := now(); new.published_by := uid; new.failure_reason := null; end if;
      if new.status = 'failed' and (new.failure_reason is null or new.failure_reason is not distinct from old.failure_reason) then raise exception 'say what went wrong' using errcode = 'P0001'; end if;
      if new.status <> 'failed' then new.failure_reason := null; end if;
      if new.status in ('idea', 'draft') then new.scheduled_for := case when new.status = 'idea' then null else new.scheduled_for end; end if;
    end if;
    if new.published_at is distinct from old.published_at and new.status <> 'published' then new.published_at := old.published_at; end if;
    if new.published_by is distinct from old.published_by and new.status <> 'published' then new.published_by := old.published_by; end if;
    if new.status <> 'published' then new.post_url := null; end if;
    new.updated_at := now();
  end if;
  if new.campaign_id is not null and (tg_op = 'INSERT' or new.campaign_id is distinct from old.campaign_id) then
    select true, c.client_id, c.archived_at into cfound, cc, carch from public.social_campaigns c where c.workspace_id = new.workspace_id and c.id = new.campaign_id;
    if cfound is not true then raise exception 'not found' using errcode = '42501'; end if;
    if carch is not null then raise exception 'this campaign is archived' using errcode = 'P0001'; end if;
    if cc is not null and cc is distinct from new.client_id then raise exception 'a campaign for a client only holds that client''s posts' using errcode = 'P0001'; end if;
  end if;
  return new;
end $$;
do $$
begin
  execute 'alter table public.social_campaigns enable row level security'; execute 'alter table public.social_campaigns force row level security';
  execute 'create policy org_scope on public.social_campaigns as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id))';
end $$;
create policy social_campaigns_select on public.social_campaigns for select using (private.has_permission(workspace_id, 'social.post.view', client_id));
create policy social_campaigns_insert on public.social_campaigns for insert with check (private.has_permission(workspace_id, 'social.post.create', client_id));
create policy social_campaigns_update on public.social_campaigns for update using (private.has_permission(workspace_id, 'social.post.edit', client_id)) with check (private.has_permission(workspace_id, 'social.post.edit', client_id));
create policy social_campaigns_delete on public.social_campaigns for delete using (private.has_permission(workspace_id, 'social.post.delete'));
create trigger audit_social_campaigns after insert or update or delete on public.social_campaigns for each row execute function private.audit_change('client_id', 'name', 'status', 'starts_on', 'ends_on', 'archived_at');
create or replace function private.refuse_delete_social_clients() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.social_posts where client_id = old.id) or exists (select 1 from public.social_campaigns where client_id = old.id) then raise exception 'archive this client instead: it still has work' using errcode = 'P0001'; end if;
  return old;
end $$;
revoke all on all functions in schema private from public;
grant select, insert, update, delete on public.social_campaigns to app_user;
grant select on public.social_channels to app_user;
grant execute on function private.is_staff_anywhere() to app_user;
-- ===== 0032_client_access.sql =====
set check_function_bodies = off;
insert into public.permissions (key, app_key, description, floor_role, default_role, scopes, sensitive) values
  ('clients.access.manage', 'clients', 'Invite clients to the Client Portal and suspend, restore or revoke their access', 'admin', 'admin', '{workspace}', true);
create table public.client_access (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null,
  email text not null check (email = lower(email) and length(email) <= 320 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  person_name text check (person_name is null or length(person_name) <= 200),
  source text not null default 'invite' check (source in ('invite', 'request')),
  status text not null default 'invited' check (status in ('requested', 'invited', 'active', 'suspended', 'rejected', 'revoked')),
  user_id uuid,                                    -- the signed-in identity, set when the person accepts
  invitation_id uuid,
  invited_by uuid,
  decided_by uuid, decided_at timestamptz,
  note text check (note is null or length(note) <= 500),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id),
  check (status not in ('active', 'suspended') or user_id is not null)
);
create unique index client_access_live_email on public.client_access (workspace_id, email) where status in ('requested', 'invited', 'active', 'suspended');
create unique index client_access_live_user on public.client_access (workspace_id, user_id) where user_id is not null and status in ('active', 'suspended');
create index client_access_client on public.client_access (workspace_id, client_id);
create index client_access_invitation on public.client_access (invitation_id) where invitation_id is not null;
create table public.client_access_events (          -- append-only: no update, no delete. No e-mail or name is stored here (codes only)
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  access_id uuid,
  event text not null check (event in ('invited', 'reinvited', 'created_client', 'linked_client', 'accepted', 'suspended', 'restored', 'revoked', 'failed')),
  actor_id uuid,
  detail text check (detail is null or length(detail) <= 120),
  created_at timestamptz not null default clock_timestamp(),     -- real time, so the steps of one request keep their order
  foreign key (workspace_id, access_id) references public.client_access (workspace_id, id)
);
create index client_access_events_access on public.client_access_events (workspace_id, access_id, created_at);
create or replace function private.client_access_events_append_only() returns trigger
language plpgsql security definer set search_path = '' as $$
begin raise exception 'the access history cannot be changed' using errcode = 'P0001'; end $$;
create trigger client_access_events_no_change before update or delete on public.client_access_events for each row execute function private.client_access_events_append_only();
create or replace function private.client_access_event(ws uuid, aid uuid, ev text, d text default null) returns void
language sql security definer set search_path = '' as $$
  insert into public.client_access_events (workspace_id, access_id, event, actor_id, detail) values (ws, aid, ev, private.current_user_id(), d)
$$;
create or replace function private.client_access_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status not in ('invited', 'requested') then raise exception 'a new access starts as invited or requested' using errcode = 'P0001'; end if;
    new.user_id := null; new.decided_by := null; new.decided_at := null;
    return new;
  end if;
  if new.workspace_id is distinct from old.workspace_id or new.client_id is distinct from old.client_id or new.email is distinct from old.email or new.source is distinct from old.source or new.created_at is distinct from old.created_at then
    raise exception 'access records do not move' using errcode = 'P0001';
  end if;
  if new.status is distinct from old.status and not ((old.status, new.status) in (
      ('requested', 'invited'), ('requested', 'rejected'), ('requested', 'revoked'),
      ('invited', 'active'), ('invited', 'revoked'),
      ('active', 'suspended'), ('active', 'revoked'), ('suspended', 'active'), ('suspended', 'revoked'))) then
    raise exception 'access cannot go from % to %', old.status, new.status using errcode = 'P0001';
  end if;
  if old.user_id is not null and new.user_id is distinct from old.user_id then raise exception 'access records do not move' using errcode = 'P0001'; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger client_access_guard before insert or update on public.client_access for each row execute function private.client_access_guard();
create or replace function private.client_access_refuse_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin raise exception 'access records are kept; revoke the access instead' using errcode = 'P0001'; end $$;
create trigger client_access_refuse_delete before delete on public.client_access for each row execute function private.client_access_refuse_delete();
create or replace function private.client_access_from_invitation() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if new.kind <> 'client' then return new; end if;
  update public.client_access set invitation_id = new.id, status = case when status = 'requested' then 'invited' else status end, updated_at = now()
   where workspace_id = new.workspace_id and email = new.email and status in ('requested', 'invited');
  get diagnostics n = row_count;
  if n = 0 and not exists (select 1 from public.client_access a where a.workspace_id = new.workspace_id and a.email = new.email and a.status in ('active', 'suspended')) then
    insert into public.client_access (workspace_id, client_id, email, source, status, invitation_id, invited_by)
    values (new.workspace_id, new.client_id, new.email, 'invite', 'invited', new.id, new.invited_by);
  end if;
  return new;
end $$;
create trigger client_access_from_invitation after insert on public.invitations for each row execute function private.client_access_from_invitation();
create or replace function private.client_access_invitation_revoked() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.revoked_at is not null and old.revoked_at is null then
    update public.client_access set status = 'revoked', decided_by = coalesce(decided_by, private.current_user_id()), decided_at = coalesce(decided_at, now())
     where invitation_id = new.id and status = 'invited';
  end if;
  return new;
end $$;
create trigger client_access_invitation_revoked after update of revoked_at on public.invitations for each row execute function private.client_access_invitation_revoked();
create or replace function private.client_access_from_membership() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.kind = 'client' then
      update public.client_access set status = 'revoked', decided_at = coalesce(decided_at, now()) where workspace_id = old.workspace_id and user_id = old.user_id and status in ('active', 'suspended');
    end if;
    return old;
  end if;
  if new.kind = 'client' and new.status is distinct from old.status then
    update public.client_access set status = case when new.status = 'active' then 'active' else 'suspended' end
     where workspace_id = new.workspace_id and user_id = new.user_id and status in ('active', 'suspended') and status is distinct from (case when new.status = 'active' then 'active' else 'suspended' end);
  end if;
  return new;
end $$;
create trigger client_access_from_membership after update or delete on public.memberships for each row execute function private.client_access_from_membership();
create or replace function public.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  inv public.invitations;
  uid uuid := private.current_user_id();
  mid uuid;
  aid uuid;
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
  else
    update public.client_access set status = 'active', user_id = uid, decided_at = now()
     where invitation_id = inv.id and status in ('invited', 'requested') returning id into aid;
    if aid is null then raise exception 'invitation not valid' using errcode = 'P0002'; end if;
    perform private.client_access_event(inv.workspace_id, aid, 'accepted');
  end if;
  update public.invitations set accepted_at = now(), accepted_by = uid where id = inv.id;
  return mid;
end $$;
create or replace function private.client_access_org() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare r text := private.request_org();
begin
  if r is null or r !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'not found' using errcode = '42501'; end if;
  if not private.has_permission(r::uuid, 'clients.access.manage') then raise exception 'not found' using errcode = '42501'; end if;
  return r::uuid;
end $$;
create or replace function public.client_access_list()
returns table (id uuid, client_id uuid, client_name text, email text, person_name text, source text, status text, invitation_expired boolean, portal_live boolean,
               created_at timestamptz, decided_at timestamptz, note text)
language plpgsql stable security definer set search_path = '' as $$
declare ws uuid := private.client_access_org();
begin
  return query
    select a.id, a.client_id, c.name, a.email, a.person_name, a.source, a.status,
           (a.status = 'invited' and not exists (select 1 from public.invitations i where i.id = a.invitation_id and i.accepted_at is null and i.revoked_at is null and i.expires_at > now())),
           exists (select 1 from public.workspace_apps wa join public.apps x on x.key = wa.app_key where wa.workspace_id = ws and x.scope = 'portal' and wa.enabled and x.lifecycle = 'active'),
           a.created_at, a.decided_at, a.note
      from public.client_access a join public.clients c on c.workspace_id = a.workspace_id and c.id = a.client_id
     where a.workspace_id = ws
     order by case a.status when 'requested' then 0 when 'invited' then 1 when 'active' then 2 when 'suspended' then 3 else 4 end, a.created_at desc;
end $$;
create or replace function public.client_access_events_list(p_access uuid)
returns table (event text, actor_id uuid, detail text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare ws uuid := private.client_access_org();
begin
  return query select e.event, e.actor_id, e.detail, e.created_at from public.client_access_events e where e.workspace_id = ws and e.access_id = p_access order by e.created_at, e.id;
end $$;
create or replace function public.client_access_invite(p_email text, p_client uuid default null, p_client_name text default null, p_person_name text default null)
returns table (ok boolean, code text, access_id uuid, client_id uuid, token text, reused boolean, client_created boolean)
language plpgsql security definer set search_path = '' as $$
declare
  ws uuid := private.client_access_org();
  v_email text := lower(btrim(coalesce(p_email, '')));
  a public.client_access; existed boolean; cid uuid; linked boolean := false; made boolean := false; tok text; inv uuid; aid uuid; n int; prev uuid; cname text;
  pname text := nullif(btrim(coalesce(p_person_name, '')), '');
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 320 then return query select false, 'bad_email'::text, null::uuid, null::uuid, null::text, false, false; return; end if;
  if length(coalesce(p_client_name, '')) > 200 or length(coalesce(pname, '')) > 200 then return query select false, 'name_too_long'::text, null::uuid, null::uuid, null::text, false, false; return; end if;
  if p_client is not null and not exists (select 1 from public.clients c where c.workspace_id = ws and c.id = p_client) then raise exception 'not found' using errcode = '42501'; end if;
  if exists (select 1 from public.memberships m join public.profiles p on p.id = m.user_id where m.workspace_id = ws and m.kind = 'staff' and lower(p.email) = v_email) then
    return query select false, 'team_member'::text, null::uuid, null::uuid, null::text, false, false; return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(ws::text || ':' || v_email, 7032));   -- two requests for the same e-mail take turns
  select * into a from public.client_access x where x.workspace_id = ws and x.email = v_email and x.status in ('requested', 'invited', 'active', 'suspended');
  existed := found;
  if existed and a.status in ('active', 'suspended') then return query select false, 'already_has_access'::text, a.id, a.client_id, null::text, false, false; return; end if;
  if existed and p_client is not null and p_client <> a.client_id then return query select false, 'pending_for_other_client'::text, a.id, a.client_id, null::text, false, false; return; end if;
  if existed then cid := a.client_id;
  elsif p_client is not null then cid := p_client; linked := true;
  else
    select x.client_id into prev from public.client_access x where x.workspace_id = ws and x.email = v_email order by x.created_at desc limit 1;
    if prev is not null then cid := prev; linked := true;
    else
      select count(*), min(p.client_id::text)::uuid into n, cid from public.client_profiles p where p.workspace_id = ws and lower(p.email) = v_email;
      if n > 1 then return query select false, 'several_clients'::text, null::uuid, null::uuid, null::text, false, false; return; end if;
      linked := n = 1;
    end if;
  end if;
  begin
    if cid is null then
      cname := coalesce(nullif(btrim(coalesce(p_client_name, '')), ''), pname, split_part(v_email, '@', 1));
      insert into public.clients (workspace_id, name) values (ws, cname) returning id into cid;
      update public.client_profiles cp set email = v_email, status = 'lead', stage_key = (select st.key from public.client_stages st where st.workspace_id = ws and st.key = 'onboarding')
       where cp.workspace_id = ws and cp.client_id = cid;      -- the profile row is created with the client
      made := true;
    end if;
    if existed and a.invitation_id is not null then
      update public.client_access set invitation_id = null where id = a.id;
      update public.invitations set revoked_at = now() where id = a.invitation_id and accepted_at is null and revoked_at is null;
    end if;
    tok := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    insert into public.invitations (workspace_id, email, kind, role, client_id, apps, token_hash, invited_by)
    values (ws, v_email, 'client', null, cid, '{}', encode(sha256(convert_to(tok, 'UTF8')), 'hex'), private.current_user_id()) returning id into inv;
    update public.client_access set person_name = coalesce(pname, person_name), invited_by = private.current_user_id() where invitation_id = inv returning id into aid;
    if aid is null then raise exception 'the invitation could not be recorded'; end if;
    if made then perform private.client_access_event(ws, aid, 'created_client');
    elsif linked then perform private.client_access_event(ws, aid, 'linked_client'); end if;
    perform private.client_access_event(ws, aid, case when existed then 'reinvited' else 'invited' end);
    return query select true, 'ok'::text, aid, cid, tok, existed, made;
    return;
  exception when others then
    perform private.client_access_event(ws, case when existed then a.id end, 'failed', 'invite:' || sqlstate);
    return query select false, sqlstate::text, null::uuid, null::uuid, null::text, false, false;
    return;
  end;
end $$;
create or replace function public.client_access_set_status(p_access uuid, p_status text, p_note text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare ws uuid := private.client_access_org(); a public.client_access; ev text;
begin
  if p_status not in ('suspended', 'active', 'revoked') then raise exception 'invalid status' using errcode = 'P0001'; end if;
  if length(coalesce(p_note, '')) > 500 then raise exception 'that note is too long' using errcode = 'P0001'; end if;
  select * into a from public.client_access x where x.id = p_access and x.workspace_id = ws for update;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  if a.status = p_status then return a.status; end if;   -- asking twice changes nothing
  if (a.status, p_status) not in (('active', 'suspended'), ('suspended', 'active'), ('invited', 'revoked'), ('active', 'revoked'), ('suspended', 'revoked')) then
    raise exception 'access cannot go from % to %', a.status, p_status using errcode = 'P0001';
  end if;
  if p_status = 'revoked' and a.invitation_id is not null then
    update public.invitations set revoked_at = now() where id = a.invitation_id and accepted_at is null and revoked_at is null;
  end if;
  if a.user_id is not null then
    if p_status = 'revoked' then delete from public.memberships where workspace_id = ws and user_id = a.user_id and kind = 'client';
    else update public.memberships set status = case when p_status = 'active' then 'active' else 'deactivated' end where workspace_id = ws and user_id = a.user_id and kind = 'client'; end if;
  end if;
  update public.client_access set status = p_status, decided_by = private.current_user_id(), decided_at = now(), note = nullif(btrim(coalesce(p_note, '')), '') where id = a.id;
  ev := case p_status when 'suspended' then 'suspended' when 'active' then 'restored' else 'revoked' end;
  perform private.client_access_event(ws, a.id, ev);
  return p_status;
end $$;
alter table public.client_access enable row level security; alter table public.client_access force row level security;
alter table public.client_access_events enable row level security; alter table public.client_access_events force row level security;
create policy org_scope on public.client_access as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
create policy org_scope on public.client_access_events as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
create policy client_access_select on public.client_access for select using (private.has_permission(workspace_id, 'clients.access.manage'));
create policy client_access_events_select on public.client_access_events for select using (private.has_permission(workspace_id, 'clients.access.manage'));
create trigger audit_client_access after insert or update or delete on public.client_access for each row execute function private.audit_change('client_id', 'status', 'source', 'user_id');
revoke all on all functions in schema private from public;
revoke all on function public.client_access_list(), public.client_access_events_list(uuid), public.client_access_invite(text, uuid, text, text), public.client_access_set_status(uuid, text, text) from public;
grant select on public.client_access, public.client_access_events to app_user;
grant execute on function public.client_access_list(), public.client_access_events_list(uuid), public.client_access_invite(text, uuid, text, text), public.client_access_set_status(uuid, text, text) to app_user;
do $hist$ begin if to_regclass('supabase_migrations.schema_migrations') is not null then
  insert into supabase_migrations.schema_migrations (version, name) values
    ('20261023190001','0002_hardening'),
    ('20261023190002','0003_integration_foundation'),
    ('20261023190003','0004_authorization_foundation'),
    ('20261023190004','0005_org_switching'),
    ('20261023190005','0006_funnels_foundation'),
    ('20261023190006','0007_my_organizations'),
    ('20261023190007','0008_clients_foundation'),
    ('20261023190008','0009_rate_limit_store'),
    ('20261023190009','0010_api_role_lockdown'),
    ('20261023190010','0011_my_permissions'),
    ('20261023190011','0012_shell_admin_backend'),
    ('20261023190012','0013_projects'),
    ('20261023190013','0014_drive'),
    ('20261023190014','0015_planner'),
    ('20261023190015','0016_api_audience'),
    ('20261023190016','0017_approvals_v2'),
    ('20261023190017','0018_portal'),
    ('20261023190018','0019_forms'),
    ('20261023190019','0020_value_ladder'),
    ('20261023190020','0021_social_planner'),
    ('20261023190021','0022_rate_limit_grant'),
    ('20261023190022','0023_storage_cap'),
    ('20261023190023','0024_file_context'),
    ('20261023190024','0025_drive_library'),
    ('20261023190025','0026_team_directory'),
    ('20261023190026','0027_client_strategy_copies'),
    ('20261023190027','0028_funnel_strategies'),
    ('20261023190028','0029_forms_v4'),
    ('20261023190029','0030_value_ladder_v4'),
    ('20261023190030','0031_social_v4'),
    ('20261023190031','0032_client_access')
  on conflict do nothing; end if; end $hist$;
