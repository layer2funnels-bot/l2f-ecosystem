set check_function_bodies = off;
-- 0008 · Clients app data layer (Phase 5 slice 1, data and API only; screens wait for approved designs).
-- Same rules as Office → Funnels (0006): one organization per row, shared permission engine, audited, archive before delete,
-- client_visible only where a client may ever see the record. Nothing here touches Funnel Mapper Pro (FMP-2): FMP has its own
-- client list in its own database; how the two relate is an open, approval-gated design (docs/FMP_INVENTORY.md §8).
--
-- Why a separate profile table: `clients` is readable by that client's own portal contact (0004 clients_select). Contact details,
-- relationship status, stage and tags are internal, so they live in client_profiles, which has NO client-facing policy at all.
-- Team notes are always internal: client_notes has no client_visible column and no client policy, so they can never be shared.

-- ------------------------------------------------------------------ permissions (app: clients)
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

-- ------------------------------------------------------------------ stages: the organization's own pipeline
create table public.client_stages (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,30}$'),
  label text not null check (length(label) between 1 and 60),
  position int not null check (position between 0 and 100),
  progress_only boolean not null default false,   -- the client sees progress, not detail, while in this stage
  created_at timestamptz not null default now(),
  primary key (workspace_id, key)
);

-- ------------------------------------------------------------------ internal profile (never client-readable)
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

-- ------------------------------------------------------------------ child records
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

-- ------------------------------------------------------------------ helpers and guards
create or replace function private.client_profile_seed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.client_profiles (workspace_id, client_id) values (new.workspace_id, new.id) on conflict do nothing;
  return new;
end $$;
create trigger clients_profile_seed after insert on public.clients
  for each row execute function private.client_profile_seed();
insert into public.client_profiles (workspace_id, client_id) select workspace_id, id from public.clients on conflict do nothing;

-- Records do not move; the author is the signed-in person; sharing needs its own permission (only tables that have client_visible).
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

-- Archive before delete (generic): only an archived record can be deleted.
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

-- ------------------------------------------------------------------ policies, triggers, audit
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

-- client_visible only makes sense for staff-authored items; archived items vanish for clients (policy above).
-- profile: staff only, by the client permissions
alter table public.client_profiles enable row level security;
alter table public.client_profiles force row level security;
create policy org_scope on public.client_profiles as restrictive for all
  using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
create policy client_profiles_select on public.client_profiles for select using (private.has_permission(workspace_id, 'clients.client.view', client_id));
create policy client_profiles_update on public.client_profiles for update
  using (private.has_permission(workspace_id, 'clients.client.edit', client_id)) with check (private.has_permission(workspace_id, 'clients.client.edit', client_id));
-- no insert/delete policy: created with the client (trigger), removed with it (cascade)
create trigger audit_client_profiles after update on public.client_profiles
  for each row execute function private.audit_change('status', 'stage_key', 'tags');

-- stages: any staff member using Clients can read the organization's pipeline; managing it is a permission
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

-- archiving a client itself is audited too (0004 audited only deletion)
create trigger audit_clients_archive after update on public.clients
  for each row when (old.archived_at is distinct from new.archived_at or old.name is distinct from new.name)
  execute function private.audit_change('name', 'archived_at');

-- a client can only be deleted once archived, and only when it holds no work
create trigger clients_zarchive_before_delete before delete on public.clients
  for each row execute function private.archive_before_delete();

-- a client that has any of this work cannot be deleted: archive it (same function as 0004/0006, extended)
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

-- ------------------------------------------------------------------ default pipeline per organization (owner-editable)
-- PLACEHOLDER NAMES: the specs say "5 stages" and "Build = progress only" but do not list the names. Confirm with the owner.
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
  -- starter levels learn the new permissions (levels are seeded by an earlier trigger, 0004)
  perform private.grant_client_child_permissions(new.id);
  return new;
end $$;

-- Starter levels: "Client team" and "All clients · edit" get notes/requests/updates; "All clients · read" can view them.
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
-- named so it runs after workspaces_seed_levels (0004): triggers on one event fire in name order
create trigger workspaces_seed_zclients after insert on public.workspaces
  for each row execute function private.workspace_seed_client_stages();
select private.seed_client_stages(id) from public.workspaces;
select private.grant_client_child_permissions(id) from public.workspaces;

-- ------------------------------------------------------------------ page registry (Clients) and grants
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
