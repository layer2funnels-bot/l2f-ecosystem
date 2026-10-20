set check_function_bodies = off;  -- helper SQL functions reference tables created below
-- Phase 4 (B0A-B0B) foundation. Non-production. Decisions D1-D6 applied (see docs/DECISIONS.md).
-- Auth model: current_user_id() reads the JWT subject exactly as Supabase's auth.uid() does,
-- so these policies port unchanged to Supabase (request.jwt.claim.sub is set by PostgREST).

create or replace function current_user_id() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create or replace function role_rank(r text) returns int
language sql immutable as $$
  select case r when 'viewer' then 1 when 'editor' then 2 when 'admin' then 3 when 'owner' then 4 else 0 end
$$;

-- SECURITY DEFINER so policies on memberships do not recurse into themselves.
create or replace function has_role(ws uuid, min_role text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.workspace_id = ws and m.user_id = current_user_id()
      and m.kind = 'staff' and m.status = 'active'
      and role_rank(m.role) >= role_rank(min_role))
$$;

create or replace function is_staff(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select has_role(ws, 'viewer')
$$;

create or replace function is_member(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.workspace_id = ws and m.user_id = current_user_id() and m.status = 'active')
$$;

create or replace function client_of(ws uuid, cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.workspace_id = ws and m.user_id = current_user_id()
      and m.kind = 'client' and m.status = 'active' and m.client_id = cid)
$$;

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug in ('layer2funnels', 'aurj')),
  name text not null,
  created_at timestamptz not null default now()
);

create table clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

-- One membership per user per workspace. Staff carry a role; clients carry a client_id.
create table memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null,
  kind text not null check (kind in ('staff', 'client')),
  role text check (role in ('owner', 'admin', 'editor', 'viewer')),
  client_id uuid references clients(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'deactivated')),
  unique (workspace_id, user_id),
  check ((kind = 'staff' and role is not null and client_id is null)
      or (kind = 'client' and role is null and client_id is not null))
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  name text not null
);

create table files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  uploaded_by uuid not null,
  storage_path text not null,
  check (starts_with(storage_path, workspace_id::text || '/'))
);

create table brand_base_answers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  section text not null,
  question text not null,
  answer text
);

create table approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  subject_type text not null,
  subject_id uuid not null,
  requested_by uuid not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected'))
);

-- Append-only event log. No update or delete policy exists, so app roles cannot alter it.
create table audit_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  actor_id uuid,
  action text not null,
  subject_type text not null,
  subject_id uuid,
  created_at timestamptz not null default now()
);

-- Keep at least one active owner per workspace (D1 safeguard).
create or replace function guard_last_owner() returns trigger
language plpgsql security definer set search_path = public as $$
declare remaining int;
begin
  if (tg_op = 'UPDATE' and old.role = 'owner' and old.status = 'active'
      and (new.role is distinct from 'owner' or new.status <> 'active'))
     or (tg_op = 'DELETE' and old.role = 'owner' and old.status = 'active') then
    select count(*) into remaining from memberships
      where workspace_id = old.workspace_id and role = 'owner' and status = 'active' and id <> old.id;
    if remaining = 0 then
      raise exception 'workspace must keep at least one active owner' using errcode = 'P0001';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger memberships_last_owner
  before update or delete on memberships
  for each row execute function guard_last_owner();

-- ---------- Row Level Security: enabled AND forced on every table ----------
do $$
declare t text;
begin
  foreach t in array array['workspaces','clients','memberships','projects','files',
                           'brand_base_answers','approvals','audit_events'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
  end loop;
end $$;

-- workspaces: members read; only owners change or delete (D1). Creation is server-only.
create policy ws_select on workspaces for select using (is_member(id));
create policy ws_update on workspaces for update using (has_role(id, 'owner')) with check (has_role(id, 'owner'));
create policy ws_delete on workspaces for delete using (has_role(id, 'owner'));

-- memberships: staff see their workspace's staff list; anyone sees their own row.
create policy mem_select on memberships for select using (is_staff(workspace_id) or user_id = current_user_id());
-- D1: admins manage non-owner rows; only owners touch owner rows.
create policy mem_insert on memberships for insert with check (
  has_role(workspace_id, 'admin') and (role is distinct from 'owner' or has_role(workspace_id, 'owner')));
create policy mem_update on memberships for update
  using (has_role(workspace_id, 'admin') and (role is distinct from 'owner' or has_role(workspace_id, 'owner')))
  with check (has_role(workspace_id, 'admin') and (role is distinct from 'owner' or has_role(workspace_id, 'owner')));
create policy mem_delete on memberships for delete using (
  has_role(workspace_id, 'admin') and (role is distinct from 'owner' or has_role(workspace_id, 'owner')));

-- clients: staff viewers+ read; client reads own record; editors write (D3); admins delete (D2).
create policy clients_select on clients for select using (is_staff(workspace_id) or client_of(workspace_id, id));
create policy clients_insert on clients for insert with check (has_role(workspace_id, 'editor'));
create policy clients_update on clients for update using (has_role(workspace_id, 'editor')) with check (has_role(workspace_id, 'editor'));
create policy clients_delete on clients for delete using (has_role(workspace_id, 'admin'));

-- projects: staff viewers+; client sees own client's projects (D5).
create policy projects_select on projects for select using (is_staff(workspace_id) or client_of(workspace_id, client_id));
create policy projects_insert on projects for insert with check (has_role(workspace_id, 'editor'));
create policy projects_update on projects for update using (has_role(workspace_id, 'editor')) with check (has_role(workspace_id, 'editor'));
create policy projects_delete on projects for delete using (has_role(workspace_id, 'admin'));

-- files: staff viewers+ read; client reads files tied to own client (D5).
-- D2: editors delete only their own uploads; admins delete any.
create policy files_select on files for select using (
  is_staff(workspace_id) or (client_id is not null and client_of(workspace_id, client_id)));
create policy files_insert on files for insert with check (has_role(workspace_id, 'editor') and uploaded_by = current_user_id());
create policy files_delete on files for delete using (
  has_role(workspace_id, 'admin') or (has_role(workspace_id, 'editor') and uploaded_by = current_user_id()));

-- D6: Brand Base answers readable by editors and above only. Clients and viewers see nothing.
create policy bb_select on brand_base_answers for select using (has_role(workspace_id, 'editor'));
create policy bb_insert on brand_base_answers for insert with check (has_role(workspace_id, 'editor'));
create policy bb_update on brand_base_answers for update using (has_role(workspace_id, 'editor')) with check (has_role(workspace_id, 'editor'));
create policy bb_delete on brand_base_answers for delete using (has_role(workspace_id, 'admin'));

-- D4: editors request; admins decide. Requesters cannot approve their own requests.
create policy appr_select on approvals for select using (is_staff(workspace_id));
create policy appr_insert on approvals for insert with check (has_role(workspace_id, 'editor') and requested_by = current_user_id());
create policy appr_decide on approvals for update
  using (has_role(workspace_id, 'admin') and requested_by <> current_user_id())
  with check (has_role(workspace_id, 'admin') and requested_by <> current_user_id());

-- audit: admins read; staff append their own actions; no update/delete policy => append-only.
create policy audit_select on audit_events for select using (has_role(workspace_id, 'admin'));
create policy audit_insert on audit_events for insert with check (is_staff(workspace_id) and actor_id = current_user_id());

-- Grants for the application role. The app role never owns tables and never bypasses RLS.
do $$ begin if not exists (select 1 from pg_roles where rolname = 'app_user') then create role app_user nologin; end if; end $$;  -- idempotent (audit fix: role is cluster-wide)
grant usage on schema public to app_user;
grant select, insert, update, delete on all tables in schema public to app_user;
grant usage on all sequences in schema public to app_user;
grant execute on all functions in schema public to app_user;
