-- Funnel Mapper Pro: core schema, Row Level Security, storage buckets and share-link RPCs.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  agency_name text not null default 'Layer2Funnels',
  agency_logo_url text,
  default_currency text not null default 'GBP',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  business_name text not null default '',
  niche text not null default '',
  email text not null default '',
  phone text not null default '',
  website text not null default '',
  country text not null default '',
  currency text not null default 'GBP',
  logo_url text,
  status text not null default 'lead' check (status in ('lead', 'proposal', 'active', 'paused', 'past')),
  monthly_retainer numeric(12, 2) not null default 0,
  notes text not null default '',
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index clients_owner_idx on public.clients (owner_id, updated_at desc);
create index clients_tags_idx on public.clients using gin (tags);
create trigger clients_updated_at before update on public.clients for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- funnels
-- ---------------------------------------------------------------------------
create table public.funnels (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default 'Untitled funnel',
  description text not null default '',
  status text not null default 'draft' check (status in ('draft', 'proposed', 'live', 'archived')),
  graph jsonb not null default '{"nodes":[],"edges":[],"view":{"x":60,"y":40,"k":1}}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  -- cached key numbers (revenue, profit, ROAS, CPA, MRR…) for list views; recomputed on every save
  summary jsonb not null default '{}'::jsonb,
  thumbnail_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index funnels_client_idx on public.funnels (client_id, updated_at desc);
create index funnels_owner_idx on public.funnels (owner_id, updated_at desc);
create trigger funnels_updated_at before update on public.funnels for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- funnel_versions
-- ---------------------------------------------------------------------------
create table public.funnel_versions (
  id uuid primary key default gen_random_uuid(),
  funnel_id uuid not null references public.funnels (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  graph jsonb not null,
  settings jsonb not null,
  label text not null default '',
  auto boolean not null default false,
  created_at timestamptz not null default now()
);
create index funnel_versions_funnel_idx on public.funnel_versions (funnel_id, created_at desc);

-- ---------------------------------------------------------------------------
-- funnel_actuals (planned vs actual)
-- ---------------------------------------------------------------------------
create table public.funnel_actuals (
  id uuid primary key default gen_random_uuid(),
  funnel_id uuid not null references public.funnels (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  node_id text not null,
  visitors numeric,
  conversions numeric,
  revenue numeric,
  spend numeric,
  created_at timestamptz not null default now(),
  check (period_end >= period_start),
  unique (funnel_id, period_start, period_end, node_id)
);
create index funnel_actuals_funnel_idx on public.funnel_actuals (funnel_id, period_start);

-- ---------------------------------------------------------------------------
-- share_links
-- ---------------------------------------------------------------------------
create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  funnel_id uuid not null references public.funnels (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  can_edit boolean not null default false,
  hide_numbers boolean not null default false,
  allow_comments boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index share_links_funnel_idx on public.share_links (funnel_id);

-- ---------------------------------------------------------------------------
-- share_comments (client feedback left on the public share page)
-- ---------------------------------------------------------------------------
create table public.share_comments (
  id uuid primary key default gen_random_uuid(),
  share_link_id uuid not null references public.share_links (id) on delete cascade,
  funnel_id uuid not null references public.funnels (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  node_id text,
  author_name text not null default '',
  body text not null check (char_length(body) between 1 and 4000),
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);
create index share_comments_funnel_idx on public.share_comments (funnel_id, created_at desc);

-- ---------------------------------------------------------------------------
-- templates (owner_id null = built-in, visible to everyone signed in)
-- ---------------------------------------------------------------------------
create table public.templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete cascade,
  builtin_key text unique,
  name text not null,
  category text not null default 'Custom',
  description text not null default '',
  graph jsonb not null,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index templates_owner_idx on public.templates (owner_id);

-- ---------------------------------------------------------------------------
-- products (reusable offers; client_id null = agency-wide)
-- ---------------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id uuid references public.clients (id) on delete cascade,
  name text not null,
  type text not null default 'product',
  params jsonb not null default '{}'::jsonb,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_owner_idx on public.products (owner_id, client_id);
create trigger products_updated_at before update on public.products for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security: every row belongs to its owner.
-- Child rows must also point at a parent the user owns.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.funnels enable row level security;
alter table public.funnel_versions enable row level security;
alter table public.funnel_actuals enable row level security;
alter table public.share_links enable row level security;
alter table public.share_comments enable row level security;
alter table public.templates enable row level security;
alter table public.products enable row level security;

create or replace function public.owns_client(cid uuid) returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists (select 1 from public.clients c where c.id = cid and c.owner_id = (select auth.uid()))
$$;
create or replace function public.owns_funnel(fid uuid) returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists (select 1 from public.funnels f where f.id = fid and f.owner_id = (select auth.uid()))
$$;

create policy "profiles: own row" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "profiles: insert own" on public.profiles for insert to authenticated with check (id = (select auth.uid()));

create policy "clients: own" on public.clients for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "funnels: own" on public.funnels for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and public.owns_client(client_id));

create policy "funnel_versions: own" on public.funnel_versions for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and public.owns_funnel(funnel_id));

create policy "funnel_actuals: own" on public.funnel_actuals for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and public.owns_funnel(funnel_id));

create policy "share_links: own" on public.share_links for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and public.owns_funnel(funnel_id));

-- comments are inserted through add_share_comment(); owners read / resolve / delete
create policy "share_comments: owner reads" on public.share_comments for select to authenticated using (owner_id = (select auth.uid()));
create policy "share_comments: owner updates" on public.share_comments for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "share_comments: owner deletes" on public.share_comments for delete to authenticated using (owner_id = (select auth.uid()));

create policy "templates: read own and built-in" on public.templates for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));
create policy "templates: write own" on public.templates for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "templates: update own" on public.templates for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "templates: delete own" on public.templates for delete to authenticated using (owner_id = (select auth.uid()));

create policy "products: own" on public.products for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and (client_id is null or public.owns_client(client_id)));

-- ---------------------------------------------------------------------------
-- Public share links. Anonymous visitors never touch tables directly: these
-- SECURITY DEFINER functions check the token (and expiry) and return only
-- what the share page needs. Called from the Next.js server route /api/share/[token].
-- ---------------------------------------------------------------------------
create or replace function public.get_shared_funnel(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  l public.share_links;
  f public.funnels;
  c public.clients;
  p public.profiles;
begin
  select * into l from public.share_links where token = p_token;
  if not found or (l.expires_at is not null and l.expires_at < now()) then
    return null;
  end if;
  select * into f from public.funnels where id = l.funnel_id;
  select * into c from public.clients where id = f.client_id;
  select * into p from public.profiles where id = f.owner_id;
  return jsonb_build_object(
    'funnel', jsonb_build_object('id', f.id, 'name', f.name, 'description', f.description, 'status', f.status,
                                 'graph', f.graph, 'settings', f.settings, 'updated_at', f.updated_at),
    'client', jsonb_build_object('name', c.name, 'business_name', c.business_name, 'logo_url', c.logo_url),
    'agency', jsonb_build_object('name', p.agency_name, 'logo_url', p.agency_logo_url),
    'link', jsonb_build_object('can_edit', l.can_edit, 'hide_numbers', l.hide_numbers, 'allow_comments', l.allow_comments, 'expires_at', l.expires_at),
    'comments', coalesce((select jsonb_agg(jsonb_build_object('id', sc.id, 'node_id', sc.node_id, 'author_name', sc.author_name,
                                                              'body', sc.body, 'resolved', sc.resolved, 'created_at', sc.created_at)
                                           order by sc.created_at)
                          from public.share_comments sc where sc.share_link_id = l.id and l.allow_comments), '[]'::jsonb)
  );
end $$;

create or replace function public.add_share_comment(p_token text, p_node_id text, p_author text, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  l public.share_links;
  f public.funnels;
  new_id uuid;
begin
  select * into l from public.share_links where token = p_token;
  if not found or (l.expires_at is not null and l.expires_at < now()) or not l.allow_comments then
    raise exception 'invalid share link' using errcode = '42501';
  end if;
  select * into f from public.funnels where id = l.funnel_id;
  insert into public.share_comments (share_link_id, funnel_id, owner_id, node_id, author_name, body)
  values (l.id, f.id, f.owner_id, nullif(p_node_id, ''), left(coalesce(p_author, ''), 120), left(p_body, 4000))
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.save_shared_funnel(p_token text, p_graph jsonb, p_settings jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  l public.share_links;
begin
  select * into l from public.share_links where token = p_token;
  if not found or (l.expires_at is not null and l.expires_at < now()) or not l.can_edit then
    raise exception 'invalid share link' using errcode = '42501';
  end if;
  if jsonb_typeof(p_graph -> 'nodes') <> 'array' or jsonb_typeof(p_graph -> 'edges') <> 'array' then
    raise exception 'invalid graph' using errcode = '22023';
  end if;
  update public.funnels set graph = p_graph, settings = coalesce(p_settings, settings) where id = l.funnel_id;
  return true;
end $$;

revoke all on function public.get_shared_funnel(text) from public;
revoke all on function public.add_share_comment(text, text, text, text) from public;
revoke all on function public.save_shared_funnel(text, jsonb, jsonb) from public;
grant execute on function public.get_shared_funnel(text) to anon, authenticated;
grant execute on function public.add_share_comment(text, text, text, text) to anon, authenticated;
grant execute on function public.save_shared_funnel(text, jsonb, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage: public-read buckets, writes limited to the user's own folder (<uid>/...)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('logos', 'logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif']),
  ('thumbnails', 'thumbnails', true, 2097152, array['image/png', 'image/jpeg', 'image/webp']),
  ('screenshots', 'screenshots', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "storage: users write own folder" on storage.objects for insert to authenticated
  with check (bucket_id in ('logos', 'thumbnails', 'screenshots') and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "storage: users update own folder" on storage.objects for update to authenticated
  using (bucket_id in ('logos', 'thumbnails', 'screenshots') and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "storage: users delete own folder" on storage.objects for delete to authenticated
  using (bucket_id in ('logos', 'thumbnails', 'screenshots') and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "storage: users list own folder" on storage.objects for select to authenticated
  using (bucket_id in ('logos', 'thumbnails', 'screenshots') and (storage.foldername(name))[1] = (select auth.uid())::text);
