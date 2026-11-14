-- 0056 · Office V8 (P01): New offer, New story, several brand kits, the default strategy template, document sections.
-- 01_APPLICATIONS/01_OFFICE/FEATURES_AND_FUNCTIONALITY.md §2. Additive and reversible (rollback: migrations/rollback/0056_office_v8.down.sql).
-- New columns follow the existing row rules of their tables (funnels.<kind>.view/edit, client rows); new tables have their own,
-- organization-scoped. Nothing is granted to the Data API roles.

-- ---- offers: the New offer form (01_OFFICE "New offer")
alter table public.funnel_offers
  add column if not exists offer_type text check (offer_type in ('service', 'course', 'coaching', 'digital', 'physical')),
  add column if not exists status text not null default 'active' check (status in ('draft', 'active')),
  add column if not exists billing text check (billing in ('one_off', 'recurring', 'payment_plan')),
  add column if not exists guarantee text check (length(guarantee) <= 300),
  add column if not exists delivery_time text check (length(delivery_time) <= 120),
  add column if not exists included jsonb not null default '[]' check (jsonb_typeof(included) = 'array' and jsonb_array_length(included) <= 50),
  add column if not exists bonuses text check (length(bonuses) <= 2000),
  add column if not exists avatar_ids uuid[] not null default '{}' check (cardinality(avatar_ids) <= 20),
  add column if not exists ladder_step text check (length(ladder_step) <= 120),
  add column if not exists internal_notes text check (length(internal_notes) <= 8000);

-- ---- stories: the New story form
alter table public.funnel_stories
  add column if not exists before_text text check (length(before_text) <= 500),
  add column if not exists after_text text check (length(after_text) <= 500),
  add column if not exists best_quote text check (length(best_quote) <= 1000),
  add column if not exists permission text not null default 'ask' check (permission in ('given', 'ask', 'anonymous')),
  add column if not exists consent_file_id uuid,
  add column if not exists use_in text[] not null default '{}' check (cardinality(use_in) <= 12);

-- ---- brand kits: many per organization, one of them the main kit
alter table public.funnel_brand_kits
  add column if not exists is_main boolean not null default false,
  add column if not exists logo_dark_file_id uuid,
  add column if not exists icon_file_id uuid,
  add column if not exists voice_say text check (length(voice_say) <= 2000),
  add column if not exists voice_never text check (length(voice_never) <= 2000),
  add column if not exists asset_file_ids uuid[] not null default '{}' check (cardinality(asset_file_ids) <= 50);
create unique index if not exists funnel_brand_kits_one_main on public.funnel_brand_kits (workspace_id) where is_main and client_id is null and archived_at is null;

-- ---- default strategy template: versioned; a strategy keeps the version it was made from (new documents only)
create table if not exists public.strategy_templates (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  version int not null check (version >= 1),
  sections jsonb not null check (jsonb_typeof(sections) = 'array' and jsonb_array_length(sections) between 1 and 40),
  created_by uuid, created_at timestamptz not null default now(),
  primary key (workspace_id, version)
);
alter table public.funnel_strategies add column if not exists template_version int;
alter table public.strategy_templates enable row level security;
alter table public.strategy_templates force row level security;
drop policy if exists sel on public.strategy_templates;
create policy sel on public.strategy_templates for select using (private.has_permission(workspace_id, 'funnels.strategy.view'));
drop policy if exists ins on public.strategy_templates;
create policy ins on public.strategy_templates for insert with check (private.has_permission(workspace_id, 'funnels.strategy.edit') and created_by = private.current_user_id());
drop policy if exists org_scope on public.strategy_templates;
create policy org_scope on public.strategy_templates as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
grant select, insert on public.strategy_templates to app_user;   -- versions are never edited or deleted: a new version is a new row

-- ---- document sections: Office › Documents (folders in the shared Drive with who-can-see and owner-protected)
create table if not exists public.doc_sections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  visibility text not null default 'everyone' check (visibility in ('everyone', 'admins')),
  owner_protected boolean not null default false,
  folder_id uuid,
  position int not null default 0,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);
alter table public.doc_sections enable row level security;
alter table public.doc_sections force row level security;
-- staff see sections meant for everyone; admins-only sections need owner/admin. Managing sections is for owners and admins.
drop policy if exists sel on public.doc_sections;
create policy sel on public.doc_sections for select using (private.is_staff(workspace_id) and (visibility = 'everyone' or private.has_role(workspace_id, 'admin')));
drop policy if exists mng on public.doc_sections;
create policy mng on public.doc_sections for all using (private.has_role(workspace_id, 'admin')) with check (private.has_role(workspace_id, 'admin'));
drop policy if exists org_scope on public.doc_sections;
create policy org_scope on public.doc_sections as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
grant select, insert, update, delete on public.doc_sections to app_user;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on table public.strategy_templates from %I', r);
      execute format('revoke all on table public.doc_sections from %I', r);
    end if;
  end loop;
end $$;
