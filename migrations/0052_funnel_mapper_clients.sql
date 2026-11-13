-- Funnel Mapper (formerly Funnel Mapper Pro), stage 1 of the move into the ecosystem (Design V7, docs/apps/16_FUNNEL_MAPPER.md;
-- docs/implementation/FUNNEL_MAPPER_PLAN.md). Additive and local-only until the owner approves the go-live package.
--  * The user-facing name becomes "Funnel Mapper". The app key stays `funnel_mapper_pro` (internal id; changing it would touch
--    entitlements, grants and the live original for no user benefit).
--  * One client list: Funnel Mapper uses the ecosystem `clients` rows (the Clients app owns client identity). Funnel Mapper keeps
--    only what is its own: the commercial terms it shows (retainer, pricing model, logo), in `fmp.client_commercial`.
--  * `fmp.id_map` remembers old Funnel Mapper ids -> ecosystem ids for the later data move, its verification and its rollback.
--  * Permission catalogue rows for the app (`fmp.*`). Access to a row is always decided here, in the database (default deny);
--    any switch in the Funnel Mapper interface only chooses a code path and grants nothing.
-- Funnel tables (funnels, versions, actuals, products, share links, comments, templates) are NOT created here: they arrive with the
-- stage 2 migration that also moves the code onto them, so no table exists in production without the code and tests that use it.

update public.apps set name = 'Funnel Mapper' where key = 'funnel_mapper_pro';

insert into public.permissions (key, app_key, description, floor_role, default_role, scopes, sensitive) values
  ('fmp.funnel.view',   'funnel_mapper_pro', 'View funnel maps and the clients they belong to', 'viewer', 'viewer', '{workspace,client}', false),
  ('fmp.funnel.create', 'funnel_mapper_pro', 'Create funnel maps (and add a client from Funnel Mapper)', 'editor', 'editor', '{workspace,client}', false),
  ('fmp.funnel.edit',   'funnel_mapper_pro', 'Edit funnel maps, versions and a client''s commercial terms', 'editor', 'editor', '{workspace,client}', false),
  ('fmp.funnel.delete', 'funnel_mapper_pro', 'Permanently delete an archived funnel map', 'admin', 'owner', '{workspace}', true),
  ('fmp.funnel.share',  'funnel_mapper_pro', 'Create share links to a funnel map', 'editor', 'admin', '{workspace,client}', true)
on conflict (key) do nothing;

create schema if not exists fmp;
revoke all on schema fmp from public;

-- ------------------------------------------------------------------ commercial terms per client (Funnel Mapper's own data about a shared client)
create table fmp.client_commercial (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null,
  monthly_retainer numeric(12, 2) not null default 0 check (monthly_retainer >= 0),
  pricing_model text not null default 'retainer'
    check (pricing_model in ('retainer', 'fixed_project', 'one_time', 'hourly', 'revenue_share', 'other')),
  pricing_amount numeric(12, 2) not null default 0 check (pricing_amount >= 0),
  pricing_frequency text check (pricing_frequency is null or pricing_frequency in ('once', 'hour', 'week', 'month', 'quarter', 'year')),
  logo_path text check (logo_path is null or length(logo_path) <= 400),
  notes text not null default '' check (length(notes) <= 20000),
  updated_by uuid, updated_at timestamptz not null default now(),
  primary key (workspace_id, client_id),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id) on delete cascade
);

create or replace function private.fmp_commercial_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_by := private.current_user_id(); new.updated_at := now();
  return new;
end $$;
revoke all on function private.fmp_commercial_stamp() from public;
create trigger fmp_client_commercial_stamp before insert or update on fmp.client_commercial for each row execute function private.fmp_commercial_stamp();

alter table fmp.client_commercial enable row level security;
alter table fmp.client_commercial force row level security;
create policy org_scope on fmp.client_commercial as restrictive for all
  using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
-- Reading needs the app AND the client (SDOR client scope); changing needs edit rights on both.
create policy commercial_select on fmp.client_commercial for select
  using (private.has_permission(workspace_id, 'fmp.funnel.view', client_id) and private.has_permission(workspace_id, 'clients.client.view', client_id));
create policy commercial_insert on fmp.client_commercial for insert
  with check (private.has_permission(workspace_id, 'fmp.funnel.edit', client_id) and private.has_permission(workspace_id, 'clients.client.view', client_id));
create policy commercial_update on fmp.client_commercial for update
  using (private.has_permission(workspace_id, 'fmp.funnel.edit', client_id) and private.has_permission(workspace_id, 'clients.client.view', client_id))
  with check (private.has_permission(workspace_id, 'fmp.funnel.edit', client_id) and private.has_permission(workspace_id, 'clients.client.view', client_id));
create trigger audit_fmp_client_commercial after insert or update or delete on fmp.client_commercial
  for each row execute function private.audit_change('client_id', 'pricing_model', 'monthly_retainer', 'pricing_amount');

-- ------------------------------------------------------------------ old id -> new id (data move, verification, rollback). Never reachable by the app role.
create table fmp.id_map (
  kind text not null check (kind in ('client', 'workspace', 'user', 'funnel', 'product', 'share_link', 'template')),
  old_id uuid not null,
  new_id uuid not null,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  match_rule text check (match_rule is null or match_rule in ('new', 'email_exact', 'owner_decision')),
  created_at timestamptz not null default now(),
  primary key (kind, old_id),
  unique (kind, new_id)
);
alter table fmp.id_map enable row level security;
alter table fmp.id_map force row level security;   -- no policies and no grants: only migrations (table owner) touch it

grant usage on schema fmp to app_user;
grant select, insert, update on fmp.client_commercial to app_user;
create index fmp_client_commercial_client on fmp.client_commercial (client_id);
