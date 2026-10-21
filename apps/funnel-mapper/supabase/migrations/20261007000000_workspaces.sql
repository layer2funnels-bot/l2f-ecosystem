-- Workspaces: the Layer2Funnels team workspace plus isolated personal workspaces for independent users.
-- See docs/concepts/workspaces-and-team.md.
--
-- Additive and safe on a live database:
--   * new tables `workspaces` and `workspace_signups`, new nullable-then-backfilled `workspace_id` columns;
--   * every existing row is backfilled to the team workspace, so the current team keeps exactly what it sees;
--   * functions are replaced in place and policies changed with ALTER POLICY (nothing is removed);
--   * the old single-row `workspace` table is kept (frozen, team-only) and no longer used by the app.

-- ---------------------------------------------------------------------------
-- workspaces
-- ---------------------------------------------------------------------------
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'personal' check (kind in ('team', 'personal')),
  agency_name text not null default 'My workspace',
  agency_logo_url text,
  default_currency text not null default 'GBP',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists workspaces_one_team on public.workspaces (kind) where kind = 'team';
create trigger workspaces_updated_at before update on public.workspaces for each row execute function public.set_updated_at();

-- the team workspace keeps the existing branding
insert into public.workspaces (id, kind, agency_name, agency_logo_url, default_currency)
select '00000000-0000-4000-a000-000000000001', 'team', coalesce(w.agency_name, 'Layer2Funnels'), w.agency_logo_url, coalesce(w.default_currency, 'GBP')
from (select 1) one left join public.workspace w on w.id = 1
on conflict (id) do nothing;

create or replace function public.team_workspace_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.workspaces where kind = 'team' limit 1
$$;

-- ---------------------------------------------------------------------------
-- membership: one workspace per account, on the profile (next to role and active)
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists workspace_id uuid references public.workspaces (id);
update public.profiles set workspace_id = public.team_workspace_id() where workspace_id is null;
alter table public.profiles alter column workspace_id set not null;
create index if not exists profiles_workspace_idx on public.profiles (workspace_id);

-- the caller's workspace, or null when signed out or deactivated
create or replace function public.current_workspace_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select workspace_id from public.profiles where id = (select auth.uid()) and active
$$;
revoke all on function public.current_workspace_id() from public;
revoke all on function public.team_workspace_id() from public;
grant execute on function public.current_workspace_id() to authenticated;
grant execute on function public.team_workspace_id() to authenticated;

-- ---------------------------------------------------------------------------
-- workspace_id on every data table (backfilled to the team workspace)
-- ---------------------------------------------------------------------------
alter table public.clients add column if not exists workspace_id uuid references public.workspaces (id);
alter table public.funnels add column if not exists workspace_id uuid references public.workspaces (id);
alter table public.funnel_versions add column if not exists workspace_id uuid references public.workspaces (id);
alter table public.funnel_actuals add column if not exists workspace_id uuid references public.workspaces (id);
alter table public.share_links add column if not exists workspace_id uuid references public.workspaces (id);
alter table public.share_comments add column if not exists workspace_id uuid references public.workspaces (id);
alter table public.products add column if not exists workspace_id uuid references public.workspaces (id);
alter table public.templates add column if not exists workspace_id uuid references public.workspaces (id);

update public.clients set workspace_id = public.team_workspace_id() where workspace_id is null;
update public.funnels set workspace_id = public.team_workspace_id() where workspace_id is null;
update public.funnel_versions set workspace_id = public.team_workspace_id() where workspace_id is null;
update public.funnel_actuals set workspace_id = public.team_workspace_id() where workspace_id is null;
update public.share_links set workspace_id = public.team_workspace_id() where workspace_id is null;
update public.share_comments set workspace_id = public.team_workspace_id() where workspace_id is null;
update public.products set workspace_id = public.team_workspace_id() where workspace_id is null;
-- built-in templates (owner_id null) belong to no workspace
update public.templates set workspace_id = public.team_workspace_id() where workspace_id is null and owner_id is not null;

-- New rows default to the caller's workspace. Requests without a user (migrations, seed, service role) fall
-- back to the team workspace, as before; signed-in users without an active profile get the team id too, but
-- RLS then refuses the row because it isn't *their* workspace.
alter table public.clients alter column workspace_id set default coalesce(public.current_workspace_id(), public.team_workspace_id());
alter table public.funnels alter column workspace_id set default coalesce(public.current_workspace_id(), public.team_workspace_id());
alter table public.funnel_versions alter column workspace_id set default coalesce(public.current_workspace_id(), public.team_workspace_id());
alter table public.funnel_actuals alter column workspace_id set default coalesce(public.current_workspace_id(), public.team_workspace_id());
alter table public.share_links alter column workspace_id set default coalesce(public.current_workspace_id(), public.team_workspace_id());
alter table public.share_comments alter column workspace_id set default coalesce(public.current_workspace_id(), public.team_workspace_id());
alter table public.products alter column workspace_id set default coalesce(public.current_workspace_id(), public.team_workspace_id());
alter table public.templates alter column workspace_id set default coalesce(public.current_workspace_id(), public.team_workspace_id());

alter table public.clients alter column workspace_id set not null;
alter table public.funnels alter column workspace_id set not null;
alter table public.funnel_versions alter column workspace_id set not null;
alter table public.funnel_actuals alter column workspace_id set not null;
alter table public.share_links alter column workspace_id set not null;
alter table public.share_comments alter column workspace_id set not null;
alter table public.products alter column workspace_id set not null;
alter table public.templates add constraint templates_workspace_check check ((owner_id is null) = (workspace_id is null));

create index if not exists clients_workspace_idx on public.clients (workspace_id, updated_at desc);
create index if not exists funnels_workspace_idx on public.funnels (workspace_id, updated_at desc);
create index if not exists funnel_versions_workspace_idx on public.funnel_versions (workspace_id);
create index if not exists funnel_actuals_workspace_idx on public.funnel_actuals (workspace_id);
create index if not exists share_links_workspace_idx on public.share_links (workspace_id);
create index if not exists share_comments_workspace_idx on public.share_comments (workspace_id);
create index if not exists products_workspace_idx on public.products (workspace_id);
create index if not exists templates_workspace_idx on public.templates (workspace_id);

-- Child rows always live in their parent's workspace, whatever the caller sends. Combined with the RLS check
-- below, nobody can attach a funnel, version, link or product to another workspace's client or funnel.
create or replace function public.inherit_workspace_id() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'funnels' then
    select c.workspace_id into new.workspace_id from public.clients c where c.id = new.client_id;
  elsif tg_table_name = 'products' then
    if new.client_id is not null then
      select c.workspace_id into new.workspace_id from public.clients c where c.id = new.client_id;
    end if;
  elsif tg_table_name = 'templates' then
    if new.owner_id is null then
      new.workspace_id := null;
    end if;
  else
    select f.workspace_id into new.workspace_id from public.funnels f where f.id = new.funnel_id;
  end if;
  return new;
end $$;

create trigger funnels_workspace before insert or update on public.funnels for each row execute function public.inherit_workspace_id();
create trigger funnel_versions_workspace before insert or update on public.funnel_versions for each row execute function public.inherit_workspace_id();
create trigger funnel_actuals_workspace before insert or update on public.funnel_actuals for each row execute function public.inherit_workspace_id();
create trigger share_links_workspace before insert or update on public.share_links for each row execute function public.inherit_workspace_id();
create trigger share_comments_workspace before insert or update on public.share_comments for each row execute function public.inherit_workspace_id();
create trigger products_workspace before insert or update on public.products for each row execute function public.inherit_workspace_id();
create trigger templates_workspace before insert or update on public.templates for each row execute function public.inherit_workspace_id();

-- ---------------------------------------------------------------------------
-- RLS: every policy is scoped to the caller's workspace (changed in place)
-- ---------------------------------------------------------------------------
alter policy "clients: team" on public.clients using (workspace_id = public.current_workspace_id()) with check (workspace_id = public.current_workspace_id());
alter policy "funnels: team" on public.funnels using (workspace_id = public.current_workspace_id()) with check (workspace_id = public.current_workspace_id());
alter policy "funnel_versions: team" on public.funnel_versions using (workspace_id = public.current_workspace_id()) with check (workspace_id = public.current_workspace_id());
alter policy "funnel_actuals: team" on public.funnel_actuals using (workspace_id = public.current_workspace_id()) with check (workspace_id = public.current_workspace_id());
alter policy "share_links: team" on public.share_links using (workspace_id = public.current_workspace_id()) with check (workspace_id = public.current_workspace_id());
alter policy "products: team" on public.products using (workspace_id = public.current_workspace_id()) with check (workspace_id = public.current_workspace_id());

alter policy "share_comments: team reads" on public.share_comments using (workspace_id = public.current_workspace_id());
alter policy "share_comments: team updates" on public.share_comments using (workspace_id = public.current_workspace_id()) with check (workspace_id = public.current_workspace_id());
alter policy "share_comments: team deletes" on public.share_comments using (workspace_id = public.current_workspace_id());

-- built-in templates stay readable by every active account; saved templates belong to their workspace
alter policy "templates: team reads" on public.templates using (public.current_workspace_id() is not null and (owner_id is null or workspace_id = public.current_workspace_id()));
alter policy "templates: team adds" on public.templates with check (owner_id is not null and workspace_id = public.current_workspace_id());
alter policy "templates: team edits" on public.templates using (owner_id is not null and workspace_id = public.current_workspace_id()) with check (owner_id is not null and workspace_id = public.current_workspace_id());
alter policy "templates: team deletes" on public.templates using (owner_id is not null and workspace_id = public.current_workspace_id());

-- people see and manage only their own workspace's members
alter policy "profiles: team reads" on public.profiles using (workspace_id = public.current_workspace_id());
alter policy "profiles: admins update members" on public.profiles
  using (public.is_team_admin() and workspace_id = public.current_workspace_id())
  with check (public.is_team_admin() and workspace_id = public.current_workspace_id());

-- the legacy single-row branding table: Layer2Funnels team only
alter policy "workspace: team reads" on public.workspace using (public.current_workspace_id() = public.team_workspace_id());
alter policy "workspace: admins edit" on public.workspace
  using (public.is_team_admin() and public.current_workspace_id() = public.team_workspace_id())
  with check (public.is_team_admin() and public.current_workspace_id() = public.team_workspace_id());

alter table public.workspaces enable row level security;
revoke all on public.workspaces from anon, authenticated;
grant select on public.workspaces to authenticated;
grant update (agency_name, agency_logo_url, default_currency) on public.workspaces to authenticated;
create policy "workspaces: members read" on public.workspaces for select to authenticated using (id = public.current_workspace_id());
create policy "workspaces: admins edit" on public.workspaces for update to authenticated
  using (id = public.current_workspace_id() and public.is_team_admin())
  with check (id = public.current_workspace_id() and public.is_team_admin());

-- members may edit their own name; only admins change roles/activation; only the service role moves accounts
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- requests from signed-in users carry auth.uid(); SQL migrations, the seed and the service role don't
  if (select auth.uid()) is null then
    return new;
  end if;
  if new.workspace_id is distinct from old.workspace_id then
    raise exception 'accounts can''t change workspace' using errcode = '42501';
  end if;
  if (new.role is distinct from old.role or new.active is distinct from old.active or new.email is distinct from old.email)
     and not public.is_team_admin() then
    raise exception 'only admins can change roles or deactivate members' using errcode = '42501';
  end if;
  if new.id = (select auth.uid()) and (new.active = false or new.role <> 'admin') and old.role = 'admin'
     and not exists (select 1 from public.profiles where role = 'admin' and active and id <> new.id and workspace_id = old.workspace_id) then
    raise exception 'the workspace needs at least one active admin' using errcode = '42501';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- independent accounts: a pending sign-up (written only by the server with the service role) makes the new
-- account the admin of a brand-new personal workspace, in the same transaction that creates it
-- ---------------------------------------------------------------------------
create table if not exists public.workspace_signups (
  email text primary key,
  full_name text not null default '',
  workspace_name text not null default '',
  created_at timestamptz not null default now()
);
alter table public.workspace_signups enable row level security; -- no policies: service role only
revoke all on public.workspace_signups from anon, authenticated;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  team uuid := public.team_workspace_id();
  first_account boolean := not exists (select 1 from public.profiles where role = 'admin' and workspace_id = team);
  pending public.workspace_signups;
  ws uuid;
  nm text := coalesce(new.raw_user_meta_data ->> 'full_name', '');
begin
  select * into pending from public.workspace_signups where email = lower(coalesce(new.email, ''));
  if found then
    insert into public.workspaces (kind, agency_name)
    values ('personal', coalesce(nullif(trim(pending.workspace_name), ''), nullif(trim(pending.full_name), ''), 'My workspace'))
    returning id into ws;
    delete from public.workspace_signups where email = pending.email;
    insert into public.profiles (id, full_name, email, role, active, workspace_id)
    values (new.id, coalesce(nullif(nm, ''), pending.full_name), coalesce(new.email, ''), 'admin', true, ws)
    on conflict (id) do nothing;
    return new;
  end if;
  -- everyone else joins the team workspace: the first account as its admin, invited accounts active
  -- (see handle_user_invited), any other account inactive until an admin activates it
  insert into public.profiles (id, full_name, email, role, active, workspace_id)
  values (new.id, nm, coalesce(new.email, ''), case when first_account then 'admin' else 'member' end,
          first_account or new.invited_at is not null, team)
  on conflict (id) do nothing;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- storage: objects belong to the workspace of the member whose folder they're in (<uid>/…), or of the
-- funnel a thumbnail (<funnelId>.png) belongs to. No objects move.
-- ---------------------------------------------------------------------------
create or replace function public.storage_object_in_my_workspace(bucket text, object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when bucket = 'thumbnails' then exists (
      select 1 from public.funnels f
      where object_name ~ '^[0-9a-f-]{36}\.png$' and f.id = left(object_name, 36)::uuid and f.workspace_id = public.current_workspace_id())
    else exists (
      select 1 from public.profiles p
      where p.id::text = (storage.foldername(object_name))[1] and p.workspace_id = public.current_workspace_id())
  end
$$;
revoke all on function public.storage_object_in_my_workspace(text, text) from public;
grant execute on function public.storage_object_in_my_workspace(text, text) to authenticated;

alter policy "storage: team reads" on storage.objects
  using (bucket_id in ('logos', 'thumbnails', 'screenshots') and public.storage_object_in_my_workspace(bucket_id, name));
alter policy "storage: team uploads" on storage.objects
  with check (bucket_id in ('logos', 'thumbnails', 'screenshots') and public.current_workspace_id() is not null and (
    (bucket_id = 'thumbnails' and public.storage_object_in_my_workspace(bucket_id, name))
    or (bucket_id <> 'thumbnails' and (storage.foldername(name))[1] = (select auth.uid())::text)));
alter policy "storage: team updates" on storage.objects
  using (bucket_id in ('logos', 'thumbnails', 'screenshots') and public.storage_object_in_my_workspace(bucket_id, name));
alter policy "storage: team deletes" on storage.objects
  using (bucket_id in ('logos', 'thumbnails', 'screenshots') and public.storage_object_in_my_workspace(bucket_id, name));

-- ---------------------------------------------------------------------------
-- share pages are branded from the funnel's own workspace
-- ---------------------------------------------------------------------------
create or replace function public.get_shared_funnel(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  l public.share_links;
  f public.funnels;
  c public.clients;
  w public.workspaces;
  hidden boolean;
  s jsonb;
begin
  select * into l from public.share_links where token = p_token;
  if not found or (l.expires_at is not null and l.expires_at < now()) then
    return null;
  end if;
  select * into f from public.funnels where id = l.funnel_id;
  select * into c from public.clients where id = f.client_id;
  select * into w from public.workspaces where id = f.workspace_id;

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
