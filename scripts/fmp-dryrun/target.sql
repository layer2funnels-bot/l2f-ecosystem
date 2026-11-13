-- TARGET shape for the dry run: Funnel Mapper Pro tables in their own schema (`fmp`) inside the ecosystem database, one row per organization,
-- clients live in the ecosystem Clients tables, access follows the shared permission engine. This is a SPIKE (not a migration of the repository).
-- Permissions, schema `fmp`, `fmp.client_commercial` and `fmp.id_map` come from the real migration 0052; the rest is still the spike.
create schema if not exists fmp;
create table fmp.products (id uuid primary key, workspace_id uuid not null references public.workspaces(id), client_id uuid, name text not null, type text not null, params jsonb not null, notes text not null default '', created_at timestamptz not null default now(), unique (workspace_id, id),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id));
create table fmp.funnels (id uuid primary key, workspace_id uuid not null references public.workspaces(id), client_id uuid not null, name text not null, description text not null default '', status text not null, graph jsonb not null, settings jsonb not null, summary jsonb not null,
  thumbnail_path text, archived_at timestamptz, created_at timestamptz not null, updated_at timestamptz not null, unique (workspace_id, id),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id));
create table fmp.funnel_versions (id uuid primary key, workspace_id uuid not null, funnel_id uuid not null, graph jsonb not null, settings jsonb not null, label text not null, auto boolean not null, created_at timestamptz not null,
  foreign key (workspace_id, funnel_id) references fmp.funnels (workspace_id, id));
create table fmp.funnel_actuals (id uuid primary key, workspace_id uuid not null, funnel_id uuid not null, period_start date not null, period_end date not null, node_id text not null, visitors numeric, conversions numeric, revenue numeric, spend numeric, source text not null,
  unique (funnel_id, period_start, period_end, node_id), foreign key (workspace_id, funnel_id) references fmp.funnels (workspace_id, id));
create table fmp.share_links (id uuid primary key, workspace_id uuid not null, funnel_id uuid not null, token_hash text not null unique, can_edit boolean not null, hide_numbers boolean not null, allow_comments boolean not null, expires_at timestamptz, created_at timestamptz not null,
  unique (workspace_id, id), foreign key (workspace_id, funnel_id) references fmp.funnels (workspace_id, id));
create table fmp.share_comments (id uuid primary key, workspace_id uuid not null, share_link_id uuid not null, funnel_id uuid not null, node_id text, author_name text not null, body text not null, resolved boolean not null, created_at timestamptz not null,
  foreign key (workspace_id, share_link_id) references fmp.share_links (workspace_id, id), foreign key (workspace_id, funnel_id) references fmp.funnels (workspace_id, id));
create table fmp.templates (id uuid primary key, workspace_id uuid references public.workspaces(id), builtin_key text unique, name text not null, category text not null, description text not null, graph jsonb not null, settings jsonb not null);
do $$
declare t text;
begin
  foreach t in array array['products', 'funnels', 'funnel_versions', 'funnel_actuals', 'share_links', 'share_comments'] loop
    execute format('alter table fmp.%I enable row level security', t); execute format('alter table fmp.%I force row level security', t);
    execute format('create policy org_scope on fmp.%I as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id))', t);
  end loop;
end $$;
create policy funnels_select on fmp.funnels for select using (private.has_permission(workspace_id, 'fmp.funnel.view', client_id));
create policy versions_select on fmp.funnel_versions for select using (exists (select 1 from fmp.funnels f where f.workspace_id = funnel_versions.workspace_id and f.id = funnel_versions.funnel_id));
create policy products_select on fmp.products for select using (private.has_permission(workspace_id, 'fmp.funnel.view', client_id));
create policy share_links_select on fmp.share_links for select using (private.has_permission(workspace_id, 'fmp.funnel.share'));
create policy actuals_select on fmp.funnel_actuals for select using (exists (select 1 from fmp.funnels f where f.workspace_id = funnel_actuals.workspace_id and f.id = funnel_actuals.funnel_id));
create policy comments_select on fmp.share_comments for select using (private.has_permission(workspace_id, 'fmp.funnel.share'));
grant usage on schema fmp to app_user;
grant select on all tables in schema fmp to app_user;
