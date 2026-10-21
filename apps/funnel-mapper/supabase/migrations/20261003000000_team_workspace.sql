-- Shared Layer2Funnels workspace.
-- Every active team member (an invited user with an active profile) can see and edit all clients, funnels,
-- templates, products, versions, actuals, share links and comments. owner_id now means "created by".
-- Sign-up is disabled, so the only way in is an invite. Admins can deactivate members.

-- ---------------------------------------------------------------------------
-- team membership on profiles
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists email text not null default '';
alter table public.profiles add column if not exists role text not null default 'member' check (role in ('admin', 'member'));
alter table public.profiles add column if not exists active boolean not null default true;

update public.profiles p set email = u.email from auth.users u where u.id = p.id and p.email = '';
-- the earliest account becomes the first admin
update public.profiles set role = 'admin' where id = (select id from public.profiles order by created_at, id limit 1);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), coalesce(new.email, ''),
          case when exists (select 1 from public.profiles where role = 'admin') then 'member' else 'admin' end)
  on conflict (id) do nothing;
  return new;
end $$;

create or replace function public.is_team_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and active)
$$;
create or replace function public.is_team_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and active and role = 'admin')
$$;
revoke all on function public.is_team_member() from public;
revoke all on function public.is_team_admin() from public;
grant execute on function public.is_team_member() to authenticated;
grant execute on function public.is_team_admin() to authenticated;

-- members may edit their own name/agency/currency, never their own role or active flag
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- requests from signed-in users carry auth.uid(); SQL migrations, the seed and the service role don't
  if (new.role is distinct from old.role or new.active is distinct from old.active or new.email is distinct from old.email)
     and (select auth.uid()) is not null and not public.is_team_admin() then
    raise exception 'only admins can change roles or deactivate members' using errcode = '42501';
  end if;
  if new.id = (select auth.uid()) and (new.active = false or new.role <> 'admin') and old.role = 'admin'
     and not exists (select 1 from public.profiles where role = 'admin' and active and id <> new.id) then
    raise exception 'the workspace needs at least one active admin' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles for each row execute function public.guard_profile_update();

-- ---------------------------------------------------------------------------
-- replace per-owner policies with workspace policies
-- ---------------------------------------------------------------------------
drop policy if exists "profiles: own row" on public.profiles;
drop policy if exists "profiles: update own" on public.profiles;
drop policy if exists "profiles: insert own" on public.profiles;
drop policy if exists "clients: own" on public.clients;
drop policy if exists "funnels: own" on public.funnels;
drop policy if exists "funnel_versions: own" on public.funnel_versions;
drop policy if exists "funnel_actuals: own" on public.funnel_actuals;
drop policy if exists "share_links: own" on public.share_links;
drop policy if exists "share_comments: owner reads" on public.share_comments;
drop policy if exists "share_comments: owner updates" on public.share_comments;
drop policy if exists "share_comments: owner deletes" on public.share_comments;
drop policy if exists "templates: read own and built-in" on public.templates;
drop policy if exists "templates: write own" on public.templates;
drop policy if exists "templates: update own" on public.templates;
drop policy if exists "templates: delete own" on public.templates;
drop policy if exists "products: own" on public.products;
drop function if exists public.owns_client(uuid);
drop function if exists public.owns_funnel(uuid);

create policy "profiles: team reads" on public.profiles for select to authenticated using (public.is_team_member());
create policy "profiles: update own" on public.profiles for update to authenticated
  using (id = (select auth.uid()) and public.is_team_member()) with check (id = (select auth.uid()));
create policy "profiles: admins update members" on public.profiles for update to authenticated
  using (public.is_team_admin()) with check (public.is_team_admin());

create policy "clients: team" on public.clients for all to authenticated using (public.is_team_member()) with check (public.is_team_member());
create policy "funnels: team" on public.funnels for all to authenticated using (public.is_team_member()) with check (public.is_team_member());
create policy "funnel_versions: team" on public.funnel_versions for all to authenticated using (public.is_team_member()) with check (public.is_team_member());
create policy "funnel_actuals: team" on public.funnel_actuals for all to authenticated using (public.is_team_member()) with check (public.is_team_member());
create policy "share_links: team" on public.share_links for all to authenticated using (public.is_team_member()) with check (public.is_team_member());
create policy "products: team" on public.products for all to authenticated using (public.is_team_member()) with check (public.is_team_member());

-- comments arrive through add_share_comment(); the team reads / resolves / deletes them
create policy "share_comments: team reads" on public.share_comments for select to authenticated using (public.is_team_member());
create policy "share_comments: team updates" on public.share_comments for update to authenticated using (public.is_team_member()) with check (public.is_team_member());
create policy "share_comments: team deletes" on public.share_comments for delete to authenticated using (public.is_team_member());

-- built-in templates (owner_id null) are read-only; team templates are shared
create policy "templates: team reads" on public.templates for select to authenticated using (public.is_team_member());
create policy "templates: team adds" on public.templates for insert to authenticated with check (public.is_team_member() and owner_id is not null);
create policy "templates: team edits" on public.templates for update to authenticated using (public.is_team_member() and owner_id is not null) with check (public.is_team_member() and owner_id is not null);
create policy "templates: team deletes" on public.templates for delete to authenticated using (public.is_team_member() and owner_id is not null);

-- ---------------------------------------------------------------------------
-- storage: logos stay public (they appear on client share pages);
-- thumbnails and screenshots are private to the team (served via signed URLs)
-- ---------------------------------------------------------------------------
update storage.buckets set public = false where id in ('thumbnails', 'screenshots');

drop policy if exists "storage: users write own folder" on storage.objects;
drop policy if exists "storage: users update own folder" on storage.objects;
drop policy if exists "storage: users delete own folder" on storage.objects;
drop policy if exists "storage: users list own folder" on storage.objects;

create policy "storage: team reads" on storage.objects for select to authenticated
  using (bucket_id in ('logos', 'thumbnails', 'screenshots') and public.is_team_member());
create policy "storage: team uploads" on storage.objects for insert to authenticated
  with check (bucket_id in ('logos', 'thumbnails', 'screenshots') and public.is_team_member());
create policy "storage: team updates" on storage.objects for update to authenticated
  using (bucket_id in ('logos', 'thumbnails', 'screenshots') and public.is_team_member());
create policy "storage: team deletes" on storage.objects for delete to authenticated
  using (bucket_id in ('logos', 'thumbnails', 'screenshots') and public.is_team_member());

-- ---------------------------------------------------------------------------
-- share links: never expose internal block notes or screenshots; hidden numbers stay hidden;
-- links with hidden numbers can't edit (there would be nothing to edit safely)
-- ---------------------------------------------------------------------------
create or replace function public.share_safe_graph(g jsonb, hide_numbers boolean) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_set(coalesce(g, '{}'::jsonb), '{nodes}', coalesce((
    select jsonb_agg(
      case
        when hide_numbers and n ->> 'type' not in ('note', 'label', 'frame') then (n - 'desc' - 'shot' - 'p') || '{"p":{}}'::jsonb
        else n - 'desc' - 'shot'
      end)
    from jsonb_array_elements(g -> 'nodes') n), '[]'::jsonb))
$$;

create or replace function public.get_shared_funnel(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  l public.share_links;
  f public.funnels;
  c public.clients;
  p public.profiles;
  hidden boolean;
  s jsonb;
begin
  select * into l from public.share_links where token = p_token;
  if not found or (l.expires_at is not null and l.expires_at < now()) then
    return null;
  end if;
  select * into f from public.funnels where id = l.funnel_id;
  select * into c from public.clients where id = f.client_id;
  -- branding comes from the first admin's profile (the workspace's agency details)
  select * into p from public.profiles where role = 'admin' and active order by created_at limit 1;
  if not found then
    select * into p from public.profiles where id = f.owner_id;
  end if;

  hidden := l.hide_numbers or coalesce((f.settings ->> 'hideNumbers')::boolean, false);
  s := case when hidden then jsonb_build_object('currency', f.settings -> 'currency', 'basis', f.settings -> 'basis', 'hideNumbers', true) else f.settings end;

  return jsonb_build_object(
    'funnel', jsonb_build_object('id', f.id, 'name', f.name, 'description', f.description, 'status', f.status,
                                 'graph', public.share_safe_graph(f.graph, hidden), 'settings', s, 'updated_at', f.updated_at),
    'client', jsonb_build_object('name', c.name, 'business_name', c.business_name, 'logo_url', c.logo_url),
    'agency', jsonb_build_object('name', p.agency_name, 'logo_url', p.agency_logo_url),
    'link', jsonb_build_object('can_edit', l.can_edit and not hidden, 'hide_numbers', hidden, 'allow_comments', l.allow_comments, 'expires_at', l.expires_at),
    'comments', coalesce((select jsonb_agg(jsonb_build_object('id', sc.id, 'node_id', sc.node_id, 'author_name', sc.author_name,
                                                              'body', sc.body, 'resolved', sc.resolved, 'created_at', sc.created_at)
                                           order by sc.created_at)
                          from public.share_comments sc where sc.share_link_id = l.id and l.allow_comments), '[]'::jsonb)
  );
end $$;

create or replace function public.save_shared_funnel(p_token text, p_graph jsonb, p_settings jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  l public.share_links;
  f public.funnels;
  merged jsonb;
begin
  select * into l from public.share_links where token = p_token;
  if not found or (l.expires_at is not null and l.expires_at < now()) or not l.can_edit or l.hide_numbers then
    raise exception 'invalid share link' using errcode = '42501';
  end if;
  if jsonb_typeof(p_graph -> 'nodes') <> 'array' or jsonb_typeof(p_graph -> 'edges') <> 'array' then
    raise exception 'invalid graph' using errcode = '22023';
  end if;
  select * into f from public.funnels where id = l.funnel_id;
  if coalesce((f.settings ->> 'hideNumbers')::boolean, false) then
    raise exception 'invalid share link' using errcode = '42501';
  end if;
  -- the client never sees internal notes/screenshots: carry them over from the saved version of each block
  merged := jsonb_set(p_graph, '{nodes}', coalesce((
    select jsonb_agg((n - 'desc' - 'shot') || coalesce((
      select jsonb_strip_nulls(jsonb_build_object('desc', o -> 'desc', 'shot', o -> 'shot'))
      from jsonb_array_elements(f.graph -> 'nodes') o where o ->> 'id' = n ->> 'id' limit 1), '{}'::jsonb))
    from jsonb_array_elements(p_graph -> 'nodes') n), '[]'::jsonb));
  update public.funnels
     set graph = merged,
         settings = case when p_settings is null then settings else p_settings || jsonb_build_object('hideNumbers', false) end
   where id = l.funnel_id;
  return true;
end $$;

revoke all on function public.get_shared_funnel(text) from public;
revoke all on function public.save_shared_funnel(text, jsonb, jsonb) from public;
grant execute on function public.get_shared_funnel(text) to anon, authenticated;
grant execute on function public.save_shared_funnel(text, jsonb, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- workspace branding (one row): agency name/logo and default currency for the whole team
-- ---------------------------------------------------------------------------
create table if not exists public.workspace (
  id smallint primary key default 1 check (id = 1),
  agency_name text not null default 'Layer2Funnels',
  agency_logo_url text,
  default_currency text not null default 'GBP',
  updated_at timestamptz not null default now()
);
insert into public.workspace (id, agency_name, agency_logo_url, default_currency)
select 1, coalesce(p.agency_name, 'Layer2Funnels'), p.agency_logo_url, coalesce(p.default_currency, 'GBP')
from (select * from public.profiles where role = 'admin' order by created_at limit 1) p
on conflict (id) do nothing;
insert into public.workspace (id) values (1) on conflict (id) do nothing;
create trigger workspace_updated_at before update on public.workspace for each row execute function public.set_updated_at();

alter table public.workspace enable row level security;
create policy "workspace: team reads" on public.workspace for select to authenticated using (public.is_team_member());
create policy "workspace: admins edit" on public.workspace for update to authenticated using (public.is_team_admin()) with check (public.is_team_admin());

-- share pages are branded from the workspace row
create or replace function public.get_shared_funnel(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  l public.share_links;
  f public.funnels;
  c public.clients;
  w public.workspace;
  hidden boolean;
  s jsonb;
begin
  select * into l from public.share_links where token = p_token;
  if not found or (l.expires_at is not null and l.expires_at < now()) then
    return null;
  end if;
  select * into f from public.funnels where id = l.funnel_id;
  select * into c from public.clients where id = f.client_id;
  select * into w from public.workspace where id = 1;

  hidden := l.hide_numbers or coalesce((f.settings ->> 'hideNumbers')::boolean, false);
  s := case when hidden then jsonb_build_object('currency', f.settings -> 'currency', 'basis', f.settings -> 'basis', 'hideNumbers', true) else f.settings end;

  return jsonb_build_object(
    'funnel', jsonb_build_object('id', f.id, 'name', f.name, 'description', f.description, 'status', f.status,
                                 'graph', public.share_safe_graph(f.graph, hidden), 'settings', s, 'updated_at', f.updated_at),
    'client', jsonb_build_object('name', c.name, 'business_name', c.business_name, 'logo_url', c.logo_url),
    'agency', jsonb_build_object('name', coalesce(w.agency_name, ''), 'logo_url', w.agency_logo_url),
    'link', jsonb_build_object('can_edit', l.can_edit and not hidden, 'hide_numbers', hidden, 'allow_comments', l.allow_comments, 'expires_at', l.expires_at),
    'comments', coalesce((select jsonb_agg(jsonb_build_object('id', sc.id, 'node_id', sc.node_id, 'author_name', sc.author_name,
                                                              'body', sc.body, 'resolved', sc.resolved, 'created_at', sc.created_at)
                                           order by sc.created_at)
                          from public.share_comments sc where sc.share_link_id = l.id and l.allow_comments), '[]'::jsonb)
  );
end $$;
revoke all on function public.get_shared_funnel(text) from public;
grant execute on function public.get_shared_funnel(text) to anon, authenticated;
