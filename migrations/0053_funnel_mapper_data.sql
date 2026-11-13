-- Funnel Mapper on the ecosystem database (stage 2, docs/implementation/FUNNEL_MAPPER_PLAN.md; owner decisions 13 Nov 2026).
-- Funnel Mapper's own records move into schema `fmp`, one organization per row, clients from the shared `clients` list (0052).
-- Access is decided here (WCIGA organization scope + SDOR client scope through private.has_permission, default deny):
--   view   fmp.funnel.view  (client scope)     create fmp.funnel.create     edit fmp.funnel.edit
--   share  fmp.funnel.share (share links)       delete fmp.funnel.delete (permanent delete of something already in the trash)
-- Public share links: the raw token is never stored (SHA-256 only); visitors are served by security-definer functions that return
-- only what the link allows (same rules as Funnel Mapper's get_shared_funnel / save_shared_funnel / add_share_comment).
-- Additive and local-only until the owner approves go-live.

-- ------------------------------------------------------------------ tables
create table fmp.funnels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null,
  name text not null default 'Untitled funnel' check (length(name) between 1 and 200),
  description text not null default '' check (length(description) <= 4000),
  status text not null default 'draft' check (status in ('draft', 'proposed', 'live', 'archived')),
  graph jsonb not null default '{"nodes":[],"edges":[],"view":{"x":60,"y":40,"k":1}}'::jsonb check (pg_column_size(graph) < 4000000),
  settings jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  thumbnail_path text check (thumbnail_path is null or length(thumbnail_path) <= 400),
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  trashed_at timestamptz, trashed_by uuid,
  unique (workspace_id, id),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id) on delete cascade
);
create table fmp.funnel_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null, funnel_id uuid not null,
  graph jsonb not null, settings jsonb not null default '{}'::jsonb,
  label text not null default '' check (length(label) <= 200), auto boolean not null default false,
  created_by uuid, created_at timestamptz not null default now(),
  foreign key (workspace_id, funnel_id) references fmp.funnels (workspace_id, id) on delete cascade
);
create table fmp.funnel_actuals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null, funnel_id uuid not null,
  period_start date not null, period_end date not null check (period_end >= period_start),
  node_id text not null check (length(node_id) <= 100),
  visitors numeric, conversions numeric, revenue numeric, spend numeric,
  source text not null default 'manual' check (length(source) <= 40), source_ref text check (source_ref is null or length(source_ref) <= 400),
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (funnel_id, period_start, period_end, node_id),
  foreign key (workspace_id, funnel_id) references fmp.funnels (workspace_id, id) on delete cascade
);
create table fmp.products (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid,                                  -- null = an organization-wide product
  name text not null check (length(name) between 1 and 200), type text not null default 'product' check (length(type) <= 40),
  params jsonb not null default '{}'::jsonb, notes text not null default '' check (length(notes) <= 20000),
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id) on delete cascade
);
create table fmp.share_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null, funnel_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  can_edit boolean not null default false, hide_numbers boolean not null default false, allow_comments boolean not null default true,
  expires_at timestamptz, created_by uuid, created_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, funnel_id) references fmp.funnels (workspace_id, id) on delete cascade
);
create table fmp.share_comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null, share_link_id uuid not null, funnel_id uuid not null,
  node_id text check (node_id is null or length(node_id) <= 100),
  author_name text not null default '' check (length(author_name) <= 120),
  body text not null check (char_length(body) between 1 and 4000),
  resolved boolean not null default false, created_at timestamptz not null default now(),
  foreign key (workspace_id, share_link_id) references fmp.share_links (workspace_id, id) on delete cascade,
  foreign key (workspace_id, funnel_id) references fmp.funnels (workspace_id, id) on delete cascade
);
create table fmp.templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,   -- null = built-in template (read-only, everyone with the app)
  builtin_key text unique,
  name text not null check (length(name) between 1 and 200), category text not null default 'Custom' check (length(category) <= 60),
  description text not null default '' check (length(description) <= 4000),
  graph jsonb not null, settings jsonb not null default '{}'::jsonb,
  created_by uuid, created_at timestamptz not null default now(),
  check ((workspace_id is null) = (builtin_key is not null))
);
create table fmp.assets (                         -- saved styles and blocks (Funnel Mapper "workspace assets")
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('style', 'block')),
  name text not null check (char_length(name) between 1 and 60),
  data jsonb not null check (pg_column_size(data) < 200000),
  created_by uuid, created_at timestamptz not null default now()
);
create table fmp.org_settings (                   -- per organization: default currency for new clients and funnels
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  default_currency text not null default 'GBP' check (default_currency ~ '^[A-Z]{3}$'),
  updated_by uuid, updated_at timestamptz not null default now()
);
-- Funnel Mapper's own trash for clients (separate from the Clients app's archive)
alter table fmp.client_commercial add column trashed_at timestamptz, add column trashed_by uuid,
  add column notes text not null default '' check (length(notes) <= 50000);   -- Funnel Mapper's own notes about a client (V7 03 §3: notes stay with Funnel Mapper)

create index fmp_funnels_client on fmp.funnels (workspace_id, client_id);
create index fmp_funnels_updated on fmp.funnels (workspace_id, updated_at desc);
create index fmp_versions_funnel on fmp.funnel_versions (funnel_id, created_at desc);
create index fmp_actuals_funnel on fmp.funnel_actuals (funnel_id);
create index fmp_products_client on fmp.products (workspace_id, client_id);
create index fmp_share_links_funnel on fmp.share_links (funnel_id);
create index fmp_share_comments_link on fmp.share_comments (share_link_id);

-- ------------------------------------------------------------------ stamps (who and when come from the session, never from the request)
create or replace function private.fmp_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(private.current_user_id(), new.created_by);
  else
    new.created_by := old.created_by;
  end if;
  if tg_table_name in ('funnels', 'funnel_actuals', 'products') then new.updated_at := now(); end if;
  if tg_table_name = 'funnels' then
    if new.trashed_at is null then new.trashed_by := null;
    elsif tg_op = 'INSERT' or old.trashed_at is null then new.trashed_by := private.current_user_id();
    else new.trashed_by := old.trashed_by; end if;
  end if;
  return new;
end $$;
revoke all on function private.fmp_stamp() from public;
do $$
declare t text;
begin
  foreach t in array array['funnels', 'funnel_versions', 'funnel_actuals', 'products', 'share_links', 'templates', 'assets'] loop
    execute format('create trigger fmp_stamp before insert or update on fmp.%I for each row execute function private.fmp_stamp()', t);
  end loop;
end $$;
create or replace function private.fmp_org_settings_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
begin new.updated_by := private.current_user_id(); new.updated_at := now(); return new; end $$;
revoke all on function private.fmp_org_settings_stamp() from public;
create trigger fmp_org_settings_stamp before insert or update on fmp.org_settings for each row execute function private.fmp_org_settings_stamp();

-- A funnel's client can't change to another organization's client (composite FK) and a version/actual/link can't move between funnels.
create or replace function private.fmp_child_immutable() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.funnel_id is distinct from old.funnel_id or new.workspace_id is distinct from old.workspace_id then
    raise exception 'records do not move between funnels' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function private.fmp_child_immutable() from public;
create trigger fmp_versions_fixed before update on fmp.funnel_versions for each row execute function private.fmp_child_immutable();
create trigger fmp_actuals_fixed before update on fmp.funnel_actuals for each row execute function private.fmp_child_immutable();
create trigger fmp_links_fixed before update on fmp.share_links for each row execute function private.fmp_child_immutable();

-- ------------------------------------------------------------------ row security
do $$
declare t text;
begin
  foreach t in array array['funnels', 'funnel_versions', 'funnel_actuals', 'products', 'share_links', 'share_comments', 'assets', 'org_settings'] loop
    execute format('alter table fmp.%I enable row level security', t);
    execute format('alter table fmp.%I force row level security', t);
    execute format('create policy org_scope on fmp.%I as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id))', t);
  end loop;
end $$;
alter table fmp.templates enable row level security;
alter table fmp.templates force row level security;
create policy org_scope on fmp.templates as restrictive for all
  using (workspace_id is null or private.org_in_scope(workspace_id)) with check (workspace_id is not null and private.org_in_scope(workspace_id));

-- SDOR: a Funnel Mapper record that belongs to a client also needs the client itself to be visible to the person (Clients app scope).
-- The fmp.* permission alone is not enough: an editor scoped to one client must not see another client's funnels.
create or replace function private.fmp_can(ws uuid, perm text, p_client uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_permission(ws, perm, p_client) and (p_client is null or private.has_permission(ws, 'clients.client.view', p_client))
$$;
revoke all on function private.fmp_can(uuid, text, uuid) from public;
grant execute on function private.fmp_can(uuid, text, uuid) to app_user;

-- the funnel's client decides (SDOR): helper used by child tables
create or replace function private.fmp_can_funnel(p_funnel uuid, p_perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from fmp.funnels f where f.id = p_funnel and private.fmp_can(f.workspace_id, p_perm, f.client_id))
$$;
revoke all on function private.fmp_can_funnel(uuid, text) from public;
grant execute on function private.fmp_can_funnel(uuid, text) to app_user;

create policy funnels_select on fmp.funnels for select using (private.fmp_can(workspace_id, 'fmp.funnel.view', client_id));
create policy funnels_insert on fmp.funnels for insert with check (private.fmp_can(workspace_id, 'fmp.funnel.create', client_id) and trashed_at is null);
create policy funnels_update on fmp.funnels for update using (private.fmp_can(workspace_id, 'fmp.funnel.edit', client_id))
  with check (private.fmp_can(workspace_id, 'fmp.funnel.edit', client_id));
create policy funnels_delete on fmp.funnels for delete using (trashed_at is not null and private.fmp_can(workspace_id, 'fmp.funnel.delete', client_id));

create policy versions_select on fmp.funnel_versions for select using (private.fmp_can_funnel(funnel_id, 'fmp.funnel.view'));
create policy versions_insert on fmp.funnel_versions for insert with check (private.fmp_can_funnel(funnel_id, 'fmp.funnel.edit'));
create policy versions_delete on fmp.funnel_versions for delete using (private.fmp_can_funnel(funnel_id, 'fmp.funnel.edit'));
create policy actuals_select on fmp.funnel_actuals for select using (private.fmp_can_funnel(funnel_id, 'fmp.funnel.view'));
create policy actuals_insert on fmp.funnel_actuals for insert with check (private.fmp_can_funnel(funnel_id, 'fmp.funnel.edit'));
create policy actuals_update on fmp.funnel_actuals for update using (private.fmp_can_funnel(funnel_id, 'fmp.funnel.edit')) with check (private.fmp_can_funnel(funnel_id, 'fmp.funnel.edit'));
create policy actuals_delete on fmp.funnel_actuals for delete using (private.fmp_can_funnel(funnel_id, 'fmp.funnel.edit'));

create policy products_select on fmp.products for select using (private.fmp_can(workspace_id, 'fmp.funnel.view', client_id));
create policy products_insert on fmp.products for insert with check (private.fmp_can(workspace_id, 'fmp.funnel.edit', client_id));
create policy products_update on fmp.products for update using (private.fmp_can(workspace_id, 'fmp.funnel.edit', client_id)) with check (private.fmp_can(workspace_id, 'fmp.funnel.edit', client_id));
create policy products_delete on fmp.products for delete using (private.fmp_can(workspace_id, 'fmp.funnel.edit', client_id));

create policy links_select on fmp.share_links for select using (private.fmp_can_funnel(funnel_id, 'fmp.funnel.share'));
create policy links_insert on fmp.share_links for insert with check (private.fmp_can_funnel(funnel_id, 'fmp.funnel.share'));
create policy links_update on fmp.share_links for update using (private.fmp_can_funnel(funnel_id, 'fmp.funnel.share')) with check (private.fmp_can_funnel(funnel_id, 'fmp.funnel.share'));
create policy links_delete on fmp.share_links for delete using (private.fmp_can_funnel(funnel_id, 'fmp.funnel.share'));
create policy comments_select on fmp.share_comments for select using (private.fmp_can_funnel(funnel_id, 'fmp.funnel.view'));
create policy comments_update on fmp.share_comments for update using (private.fmp_can_funnel(funnel_id, 'fmp.funnel.edit')) with check (private.fmp_can_funnel(funnel_id, 'fmp.funnel.edit'));
create policy comments_delete on fmp.share_comments for delete using (private.fmp_can_funnel(funnel_id, 'fmp.funnel.edit'));

create policy templates_select on fmp.templates for select using (
  (workspace_id is null and private.request_org() ~* '^[0-9a-f-]{36}$' and private.has_permission(private.request_org()::uuid, 'fmp.funnel.view'))
  or (workspace_id is not null and private.has_permission(workspace_id, 'fmp.funnel.view')));
create policy templates_insert on fmp.templates for insert with check (private.has_permission(workspace_id, 'fmp.funnel.create'));
create policy templates_update on fmp.templates for update using (private.has_permission(workspace_id, 'fmp.funnel.edit')) with check (private.has_permission(workspace_id, 'fmp.funnel.edit'));
create policy templates_delete on fmp.templates for delete using (private.has_permission(workspace_id, 'fmp.funnel.edit'));
create policy assets_select on fmp.assets for select using (private.has_permission(workspace_id, 'fmp.funnel.view'));
create policy assets_insert on fmp.assets for insert with check (private.has_permission(workspace_id, 'fmp.funnel.edit'));
create policy assets_delete on fmp.assets for delete using (private.has_permission(workspace_id, 'fmp.funnel.edit'));
create policy org_settings_select on fmp.org_settings for select using (private.has_permission(workspace_id, 'fmp.funnel.view'));
create policy org_settings_write on fmp.org_settings for insert with check (private.has_role(workspace_id, 'admin') and private.has_permission(workspace_id, 'fmp.funnel.view'));
create policy org_settings_update on fmp.org_settings for update using (private.has_role(workspace_id, 'admin') and private.has_permission(workspace_id, 'fmp.funnel.view'))
  with check (private.has_role(workspace_id, 'admin'));
-- Funnel Mapper's trash on a shared client: edit rights on that client
create policy commercial_delete on fmp.client_commercial for delete using (private.fmp_can(workspace_id, 'fmp.funnel.delete', client_id));

create trigger audit_fmp_funnels after insert or update or delete on fmp.funnels
  for each row execute function private.audit_change('client_id', 'name', 'status', 'trashed_at');
create trigger audit_fmp_share_links after insert or update or delete on fmp.share_links
  for each row execute function private.audit_change('funnel_id', 'can_edit', 'hide_numbers', 'allow_comments', 'expires_at');

grant select, insert, update, delete on fmp.funnels, fmp.funnel_actuals, fmp.products, fmp.share_links, fmp.templates to app_user;
grant select, insert, delete on fmp.funnel_versions, fmp.assets to app_user;
grant select, update, delete on fmp.share_comments to app_user;
grant select, insert, update on fmp.org_settings to app_user;
grant delete on fmp.client_commercial to app_user;

-- ------------------------------------------------------------------ public share links (visitors without an account)
create or replace function private.fmp_share_safe_graph(g jsonb, hide_numbers boolean) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_set(coalesce(g, '{}'::jsonb), '{nodes}', coalesce((
    select jsonb_agg(case when hide_numbers and n ->> 'type' not in ('note', 'label', 'frame', 'shape', 'image', 'checklist')
                          then (n - 'desc' - 'shot' - 'checklist' - 'p') || '{"p":{}}'::jsonb
                          else n - 'desc' - 'shot' - 'checklist' end)
    from jsonb_array_elements(g -> 'nodes') n), '[]'::jsonb))
$$;

create or replace function private.fmp_share_link(p_token text) returns fmp.share_links
language sql stable security definer set search_path = '' as $$
  select l.* from fmp.share_links l join fmp.funnels f on f.id = l.funnel_id
    left join fmp.client_commercial cc on cc.workspace_id = f.workspace_id and cc.client_id = f.client_id
   where p_token is not null and length(p_token) between 16 and 200
     and l.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
     and (l.expires_at is null or l.expires_at > now())
     and f.trashed_at is null and cc.trashed_at is null
$$;

create or replace function private.fmp_shared_get(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare l fmp.share_links; f fmp.funnels; c public.clients; w public.workspaces; logo text; hidden boolean; s jsonb;
begin
  l := private.fmp_share_link(p_token);
  if l.id is null then return null; end if;
  select * into f from fmp.funnels where id = l.funnel_id;
  select * into c from public.clients where id = f.client_id;
  select * into w from public.workspaces where id = f.workspace_id;
  select cc.logo_path into logo from fmp.client_commercial cc where cc.workspace_id = f.workspace_id and cc.client_id = f.client_id;
  hidden := l.hide_numbers or coalesce((f.settings ->> 'hideNumbers')::boolean, false);
  s := case when hidden then jsonb_build_object('currency', f.settings -> 'currency', 'basis', f.settings -> 'basis', 'hideNumbers', true) else f.settings - 'notes' end;
  if coalesce((f.settings -> 'notes' ->> 'shared')::boolean, false) then s := s || jsonb_build_object('notes', f.settings -> 'notes'); end if;
  return jsonb_build_object(
    'funnel', jsonb_build_object('id', f.id, 'name', f.name, 'description', f.description, 'status', f.status,
                                 'graph', private.fmp_share_safe_graph(f.graph, hidden), 'settings', s, 'updated_at', f.updated_at),
    'client', jsonb_build_object('name', c.name, 'business_name', (select p.business_name from public.client_profiles p where p.client_id = c.id), 'logo_path', logo),
    'agency', jsonb_build_object('name', w.name, 'org', w.slug),
    'link', jsonb_build_object('can_edit', l.can_edit and not hidden, 'hide_numbers', hidden, 'allow_comments', l.allow_comments, 'expires_at', l.expires_at),
    'comments', coalesce((select jsonb_agg(jsonb_build_object('id', sc.id, 'node_id', sc.node_id, 'author_name', sc.author_name, 'body', sc.body,
                                                              'resolved', sc.resolved, 'created_at', sc.created_at) order by sc.created_at)
                          from fmp.share_comments sc where sc.share_link_id = l.id and l.allow_comments), '[]'::jsonb));
end $$;

create or replace function private.fmp_shared_save(p_token text, p_graph jsonb, p_settings jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare l fmp.share_links; f fmp.funnels; merged jsonb;
begin
  l := private.fmp_share_link(p_token);
  if l.id is null or not l.can_edit or l.hide_numbers then raise exception 'invalid share link' using errcode = '42501'; end if;
  if jsonb_typeof(p_graph -> 'nodes') <> 'array' or jsonb_typeof(p_graph -> 'edges') <> 'array' or pg_column_size(p_graph) > 4000000 then
    raise exception 'invalid graph' using errcode = '22023';
  end if;
  select * into f from fmp.funnels where id = l.funnel_id;
  if coalesce((f.settings ->> 'hideNumbers')::boolean, false) then raise exception 'invalid share link' using errcode = '42501'; end if;
  merged := jsonb_set(p_graph, '{nodes}', coalesce((
    select jsonb_agg((n - 'desc' - 'shot' - 'checklist') || coalesce((
      select jsonb_strip_nulls(jsonb_build_object('desc', o -> 'desc', 'shot', o -> 'shot', 'checklist', o -> 'checklist'))
      from jsonb_array_elements(f.graph -> 'nodes') o where o ->> 'id' = n ->> 'id' limit 1), '{}'::jsonb))
    from jsonb_array_elements(p_graph -> 'nodes') n), '[]'::jsonb));
  update fmp.funnels set graph = merged,
    settings = case when p_settings is null then settings
                    else (p_settings - 'notes') || jsonb_build_object('hideNumbers', false)
                         || case when settings ? 'notes' then jsonb_build_object('notes', settings -> 'notes') else '{}'::jsonb end end
   where id = l.funnel_id;
  return true;
end $$;

create or replace function private.fmp_shared_comment(p_token text, p_node_id text, p_author text, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare l fmp.share_links; new_id uuid;
begin
  l := private.fmp_share_link(p_token);
  if l.id is null or not l.allow_comments then raise exception 'invalid share link' using errcode = '42501'; end if;
  if p_body is null or char_length(trim(p_body)) = 0 then raise exception 'empty comment' using errcode = '22023'; end if;
  insert into fmp.share_comments (workspace_id, share_link_id, funnel_id, node_id, author_name, body)
  values (l.workspace_id, l.id, l.funnel_id, nullif(left(coalesce(p_node_id, ''), 100), ''), left(coalesce(p_author, ''), 120), left(p_body, 4000))
  returning id into new_id;
  return new_id;
end $$;
revoke all on function private.fmp_share_safe_graph(jsonb, boolean) from public;
revoke all on function private.fmp_share_link(text), private.fmp_shared_get(text), private.fmp_shared_save(text, jsonb, jsonb),
  private.fmp_shared_comment(text, text, text, text) from public;
grant execute on function private.fmp_shared_get(text), private.fmp_shared_save(text, jsonb, jsonb), private.fmp_shared_comment(text, text, text, text) to app_user;
