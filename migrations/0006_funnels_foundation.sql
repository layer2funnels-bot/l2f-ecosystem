set check_function_bodies = off;
-- 0006 · Office → Funnels data foundation (owner ruling 21 Oct 2026, decisions FMP-1 and FMP-2).
-- Funnel business records live HERE, in the ecosystem database, under Office → Funnels:
--   avatars · offers and products · story bank · brand kits (+ references from Clients and Value Ladder).
-- NOTHING in this migration touches Funnel Mapper Pro, its data or its database. FMP keeps funnel mapping only.
-- Every record: belongs to one organization, optionally to one client; is governed by funnels.* permissions on
-- the shared engine; is audited; is archived instead of deleted; carries client_visible (default internal).
-- Other apps (Clients, Value Ladder) point at records by ID through funnel_references; they never copy them.

-- ------------------------------------------------------------------ permissions (app: office)
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

-- ------------------------------------------------------------------ tables
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
-- Logos are Drive files: reference only, never copied.
alter table public.files add constraint files_workspace_id_id_key unique (workspace_id, id);
alter table public.funnel_brand_kits add foreign key (workspace_id, logo_file_id) references public.files (workspace_id, id);

-- Clients and Value Ladder point at a record by ID. Exactly one target per row; same organization enforced by the FKs.
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

-- ------------------------------------------------------------------ rules shared by the four record tables
-- Records do not move between organizations or clients; sharing with the client needs its own permission.
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

-- Archive before delete: only an archived record can be deleted, and only when nothing points at it.
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
    -- staff: by permission at organization or client scope; the client: only visible, unarchived rows of their own client
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

-- references: staff by permission; hard-delete of a reference is fine (it holds no business content)
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

-- A client with funnel records cannot be deleted either (archive it). Same function as 0004, extended.
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

-- ------------------------------------------------------------------ page registry (Office → Funnels)
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

-- ------------------------------------------------------------------ starter access levels per organization
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

-- ------------------------------------------------------------------ grants
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
