-- Roles: Owner / Admin / Editor / Viewer, per workspace membership (workspace_members.role). See docs/concepts/roles.md.
--
--   owner   one per workspace (its first admin; whoever created it). Everything an admin can do, plus creating
--           independent accounts (team workspace) and handing ownership to someone else. Nobody else can demote,
--           deactivate or remove the owner.
--   admin   manages members (invite, roles, deactivate, remove) and branding, creates workspaces, edits all data.
--   editor  edits all data (clients, funnels, versions, actuals, share links, products, templates). Was "member".
--   viewer  reads everything in the workspace; writes nothing. Enforced here, in RLS: the UI only mirrors it.
--
-- Safe on a live database: members become editors (the same rights as before), the earliest active admin of each
-- workspace becomes its owner, other admins stay admins. Policies are changed in place (ALTER POLICY) and read-only
-- policies are added next to them; functions are replaced in place. profiles.role stays as it is (legacy, unused
-- for access since 20261009000000_workspace_members.sql). The one structural change is the role check constraint
-- on workspace_members, which has to be replaced to allow the new values: apply with the Supabase CLI
-- (`supabase db push`) or the SQL editor.

-- ---------------------------------------------------------------------------
-- role values
-- ---------------------------------------------------------------------------
alter table public.workspace_members drop constraint if exists workspace_members_role_check;
update public.workspace_members set role = 'editor' where role = 'member';
update public.workspace_members w set role = 'owner'
 where (w.workspace_id, w.user_id) in (
   select distinct on (workspace_id) workspace_id, user_id from public.workspace_members
    where role = 'admin' and active
    order by workspace_id, created_at, user_id)
   and not exists (select 1 from public.workspace_members o where o.workspace_id = w.workspace_id and o.role = 'owner');
alter table public.workspace_members add constraint workspace_members_role_check check (role in ('owner', 'admin', 'editor', 'viewer'));
alter table public.workspace_members alter column role set default 'editor';
create unique index if not exists workspace_members_one_owner on public.workspace_members (workspace_id) where role = 'owner';

-- ---------------------------------------------------------------------------
-- role helpers (security definer: they read the caller's own membership of the workspace they're working in)
-- ---------------------------------------------------------------------------
create or replace function public.my_role() returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.profiles p
  join public.workspace_members m on m.workspace_id = p.workspace_id and m.user_id = p.id and m.active
  where p.id = (select auth.uid())
$$;
-- owner or admin: member management, branding, new workspaces
create or replace function public.is_team_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.my_role() in ('owner', 'admin'), false)
$$;
-- may change data: everyone but viewers
create or replace function public.can_write() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.my_role() in ('owner', 'admin', 'editor'), false)
$$;
create or replace function public.is_workspace_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.my_role() = 'owner', false)
$$;
revoke all on function public.my_role() from public;
revoke all on function public.can_write() from public;
revoke all on function public.is_workspace_owner() from public;
grant execute on function public.my_role() to authenticated;
grant execute on function public.can_write() to authenticated;
grant execute on function public.is_workspace_owner() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: members read their workspace; only owners, admins and editors write
-- ---------------------------------------------------------------------------
alter policy "clients: team" on public.clients
  using (workspace_id = public.current_workspace_id() and public.can_write())
  with check (workspace_id = public.current_workspace_id() and public.can_write());
alter policy "funnels: team" on public.funnels
  using (workspace_id = public.current_workspace_id() and public.can_write())
  with check (workspace_id = public.current_workspace_id() and public.can_write());
alter policy "funnel_versions: team" on public.funnel_versions
  using (workspace_id = public.current_workspace_id() and public.can_write())
  with check (workspace_id = public.current_workspace_id() and public.can_write());
alter policy "funnel_actuals: team" on public.funnel_actuals
  using (workspace_id = public.current_workspace_id() and public.can_write())
  with check (workspace_id = public.current_workspace_id() and public.can_write());
alter policy "share_links: team" on public.share_links
  using (workspace_id = public.current_workspace_id() and public.can_write())
  with check (workspace_id = public.current_workspace_id() and public.can_write());
alter policy "products: team" on public.products
  using (workspace_id = public.current_workspace_id() and public.can_write())
  with check (workspace_id = public.current_workspace_id() and public.can_write());

create policy "clients: members read" on public.clients for select to authenticated using (workspace_id = public.current_workspace_id());
create policy "funnels: members read" on public.funnels for select to authenticated using (workspace_id = public.current_workspace_id());
create policy "funnel_versions: members read" on public.funnel_versions for select to authenticated using (workspace_id = public.current_workspace_id());
create policy "funnel_actuals: members read" on public.funnel_actuals for select to authenticated using (workspace_id = public.current_workspace_id());
create policy "share_links: members read" on public.share_links for select to authenticated using (workspace_id = public.current_workspace_id());
create policy "products: members read" on public.products for select to authenticated using (workspace_id = public.current_workspace_id());

alter policy "share_comments: team updates" on public.share_comments
  using (workspace_id = public.current_workspace_id() and public.can_write())
  with check (workspace_id = public.current_workspace_id() and public.can_write());
alter policy "share_comments: team deletes" on public.share_comments
  using (workspace_id = public.current_workspace_id() and public.can_write());

alter policy "templates: team adds" on public.templates
  with check (owner_id is not null and workspace_id = public.current_workspace_id() and public.can_write());
alter policy "templates: team edits" on public.templates
  using (owner_id is not null and workspace_id = public.current_workspace_id() and public.can_write())
  with check (owner_id is not null and workspace_id = public.current_workspace_id() and public.can_write());
alter policy "templates: team deletes" on public.templates
  using (owner_id is not null and workspace_id = public.current_workspace_id() and public.can_write());

alter policy "storage: team uploads" on storage.objects
  with check (bucket_id in ('logos', 'thumbnails', 'screenshots') and public.current_workspace_id() is not null and public.can_write() and (
    (bucket_id = 'thumbnails' and public.storage_object_in_my_workspace(bucket_id, name))
    or (bucket_id <> 'thumbnails' and (storage.foldername(name))[1] = (select auth.uid())::text)));
alter policy "storage: team updates" on storage.objects
  using (bucket_id in ('logos', 'thumbnails', 'screenshots') and public.can_write() and public.storage_object_in_my_workspace(bucket_id, name));
alter policy "storage: team deletes" on storage.objects
  using (bucket_id in ('logos', 'thumbnails', 'screenshots') and public.can_write() and public.storage_object_in_my_workspace(bucket_id, name));

-- ---------------------------------------------------------------------------
-- membership changes: admins manage roles below owner; the owner is protected; ownership moves only by handover
-- ---------------------------------------------------------------------------
create or replace function public.guard_member_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.workspace_id is distinct from old.workspace_id or new.user_id is distinct from old.user_id then
    raise exception 'memberships can''t move' using errcode = '42501';
  end if;
  -- the service role, migrations and the seed (no auth.uid()) and the handover function aren't restricted
  if (select auth.uid()) is null or current_setting('app.ownership_handover', true) = 'on' then
    return new;
  end if;
  if (new.role = 'owner' and old.role is distinct from 'owner')
     or (old.role = 'owner' and (new.role is distinct from old.role or new.active is distinct from old.active)) then
    raise exception 'ownership only moves by handover from the owner' using errcode = '42501';
  end if;
  if old.role in ('owner', 'admin') and old.active and (new.role not in ('owner', 'admin') or not new.active)
     and not exists (select 1 from public.workspace_members m
                     where m.workspace_id = old.workspace_id and m.role in ('owner', 'admin') and m.active and m.user_id <> old.user_id) then
    raise exception 'the workspace needs at least one active admin' using errcode = '42501';
  end if;
  return new;
end $$;

-- the owner hands the workspace they're working in to another active member (who becomes owner; they become admin)
create or replace function public.transfer_ownership(p_to uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  ws uuid := public.current_workspace_id();
begin
  if ws is null or not public.is_workspace_owner() then
    raise exception 'only the owner can hand over the workspace' using errcode = '42501';
  end if;
  if p_to = (select auth.uid()) or not exists (select 1 from public.workspace_members where workspace_id = ws and user_id = p_to and active) then
    raise exception 'pick an active member of this workspace' using errcode = '22023';
  end if;
  perform set_config('app.ownership_handover', 'on', true);
  update public.workspace_members set role = 'admin' where workspace_id = ws and user_id = (select auth.uid());
  update public.workspace_members set role = 'owner' where workspace_id = ws and user_id = p_to;
  perform set_config('app.ownership_handover', 'off', true);
end $$;
revoke all on function public.transfer_ownership(uuid) from public;
grant execute on function public.transfer_ownership(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- new workspaces and new accounts: creators own what they create; invited people join as editors
-- ---------------------------------------------------------------------------
create or replace function public.create_workspace(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  ws uuid;
  nm text := trim(coalesce(p_name, ''));
begin
  if not public.is_team_admin() then
    raise exception 'only admins can create workspaces' using errcode = '42501';
  end if;
  if char_length(nm) not between 1 and 120 then
    raise exception 'name the workspace (up to 120 characters)' using errcode = '22023';
  end if;
  insert into public.workspaces (kind, agency_name, default_currency)
  values ('personal', nm, coalesce((select default_currency from public.workspaces where id = public.current_workspace_id()), 'GBP'))
  returning id into ws;
  insert into public.workspace_members (workspace_id, user_id, role, active) values (ws, (select auth.uid()), 'owner', true);
  update public.profiles set workspace_id = ws where id = (select auth.uid());
  return ws;
end $$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  team uuid := public.team_workspace_id();
  first_account boolean := not exists (select 1 from public.workspace_members where role in ('owner', 'admin') and workspace_id = team);
  pending public.workspace_signups;
  ws uuid;
  nm text := coalesce(new.raw_user_meta_data ->> 'full_name', '');
begin
  select * into pending from public.workspace_signups where email = lower(coalesce(new.email, ''));
  if found and pending.join_workspace_id is not null then
    -- invited into an existing workspace as an editor (the inviting admin can pick another role)
    insert into public.profiles (id, full_name, email, role, active, workspace_id)
    values (new.id, coalesce(nullif(nm, ''), pending.full_name), coalesce(new.email, ''), 'member', true, pending.join_workspace_id)
    on conflict (id) do nothing;
    insert into public.workspace_members (workspace_id, user_id, role, active) values (pending.join_workspace_id, new.id, 'editor', true)
    on conflict (workspace_id, user_id) do nothing;
    return new;
  elsif found then
    -- independent sign-up: a brand-new private workspace, as its owner
    insert into public.workspaces (kind, agency_name)
    values ('personal', coalesce(nullif(trim(pending.workspace_name), ''), nullif(trim(pending.full_name), ''), 'My workspace'))
    returning id into ws;
    insert into public.profiles (id, full_name, email, role, active, workspace_id)
    values (new.id, coalesce(nullif(nm, ''), pending.full_name), coalesce(new.email, ''), 'admin', true, ws)
    on conflict (id) do nothing;
    insert into public.workspace_members (workspace_id, user_id, role, active) values (ws, new.id, 'owner', true)
    on conflict (workspace_id, user_id) do nothing;
    return new;
  end if;
  -- everyone else joins the team workspace: the first account as its owner, invited accounts active as editors
  -- (see handle_user_invited), any other account inactive until an admin activates it
  insert into public.profiles (id, full_name, email, role, active, workspace_id)
  values (new.id, nm, coalesce(new.email, ''), case when first_account then 'admin' else 'member' end,
          first_account or new.invited_at is not null, team)
  on conflict (id) do nothing;
  insert into public.workspace_members (workspace_id, user_id, role, active)
  values (team, new.id, case when first_account then 'owner' else 'editor' end, first_account or new.invited_at is not null)
  on conflict (workspace_id, user_id) do nothing;
  return new;
end $$;
