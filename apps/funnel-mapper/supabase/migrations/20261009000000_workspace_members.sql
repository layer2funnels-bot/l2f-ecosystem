-- Several workspaces per person. Admins create workspaces; each has its own data and its own teammates; people
-- switch only between workspaces they're active members of. See docs/concepts/workspaces-and-team.md.
--
-- * workspace_members: one row per (workspace, person) with that person's role and active flag there. Backfilled
--   from profiles, so everyone keeps exactly the access they have today.
-- * profiles.workspace_id now means "the workspace this person is working in right now". current_workspace_id()
--   only returns it while they're an active member of it, so every existing data policy (workspace_id =
--   current_workspace_id()) keeps isolating workspaces unchanged.
-- * profiles.role / profiles.active are no longer used for access (kept, not removed).
-- Additive: nothing is removed; functions replaced in place; policies changed with ALTER POLICY.

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  -- references auth.users (not profiles) so profiles → workspaces stays a single, unambiguous relationship for the API
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index if not exists workspace_members_user_idx on public.workspace_members (user_id);

insert into public.workspace_members (workspace_id, user_id, role, active, created_at)
select workspace_id, id, role, active, created_at from public.profiles
on conflict (workspace_id, user_id) do nothing;

-- ---------------------------------------------------------------------------
-- access helpers now follow membership of the selected workspace
-- ---------------------------------------------------------------------------
create or replace function public.current_workspace_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.workspace_id from public.profiles p
  join public.workspace_members m on m.workspace_id = p.workspace_id and m.user_id = p.id and m.active
  where p.id = (select auth.uid())
$$;

create or replace function public.is_team_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.current_workspace_id() is not null
$$;

-- admin of the workspace they're working in
create or replace function public.is_team_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    join public.workspace_members m on m.workspace_id = p.workspace_id and m.user_id = p.id
    where p.id = (select auth.uid()) and m.active and m.role = 'admin')
$$;

-- workspaces the caller may see and switch to
create or replace function public.my_workspace_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select workspace_id from public.workspace_members where user_id = (select auth.uid()) and active
$$;
revoke all on function public.my_workspace_ids() from public;
grant execute on function public.my_workspace_ids() to authenticated;

-- ---------------------------------------------------------------------------
-- policies
-- ---------------------------------------------------------------------------
alter table public.workspace_members enable row level security;
revoke all on public.workspace_members from anon, authenticated;
grant select on public.workspace_members to authenticated;
grant update (role, active) on public.workspace_members to authenticated;
-- your own memberships (for the switcher) and the members of the workspace you're working in
create policy "workspace_members: read" on public.workspace_members for select to authenticated
  using (user_id = (select auth.uid()) or workspace_id = public.current_workspace_id());
create policy "workspace_members: admins manage" on public.workspace_members for update to authenticated
  using (workspace_id = public.current_workspace_id() and public.is_team_admin())
  with check (workspace_id = public.current_workspace_id() and public.is_team_admin());
-- adding and removing members happens on the server (service role) or through create_workspace()

alter policy "workspaces: members read" on public.workspaces using (id in (select public.my_workspace_ids()));

-- people see themselves and the members of the workspace they're working in
alter policy "profiles: team reads" on public.profiles
  using (id = (select auth.uid()) or id in (select m.user_id from public.workspace_members m where m.workspace_id = public.current_workspace_id()));
-- roles and activation now live on workspace_members; nobody edits other people's profiles
alter policy "profiles: admins update members" on public.profiles using (false) with check (false);

-- uploads are readable by the workspace their uploader belongs to (membership, not the uploader's current choice)
create or replace function public.storage_object_in_my_workspace(bucket text, object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when bucket = 'thumbnails' then exists (
      select 1 from public.funnels f
      where object_name ~ '^[0-9a-f-]{36}\.png$' and f.id = left(object_name, 36)::uuid and f.workspace_id = public.current_workspace_id())
    else exists (
      select 1 from public.workspace_members m
      where m.user_id::text = (storage.foldername(object_name))[1] and m.workspace_id = public.current_workspace_id())
  end
$$;

-- ---------------------------------------------------------------------------
-- guards
-- ---------------------------------------------------------------------------
-- a profile may only be pointed at a workspace its owner is an active member of
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if new.workspace_id is distinct from old.workspace_id and not (
       new.id = (select auth.uid())
       and exists (select 1 from public.workspace_members m where m.workspace_id = new.workspace_id and m.user_id = new.id and m.active)) then
    raise exception 'accounts can''t change workspace' using errcode = '42501';
  end if;
  if (new.role is distinct from old.role or new.active is distinct from old.active or new.email is distinct from old.email)
     and not public.is_team_admin() then
    raise exception 'only admins can change roles or deactivate members' using errcode = '42501';
  end if;
  return new;
end $$;

-- every workspace keeps at least one active admin
create or replace function public.guard_member_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and old.role = 'admin' and old.active and (new.role <> 'admin' or not new.active)
     and not exists (select 1 from public.workspace_members m
                     where m.workspace_id = old.workspace_id and m.role = 'admin' and m.active and m.user_id <> old.user_id) then
    raise exception 'the workspace needs at least one active admin' using errcode = '42501';
  end if;
  if new.workspace_id is distinct from old.workspace_id or new.user_id is distinct from old.user_id then
    raise exception 'memberships can''t move' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger workspace_members_guard before update on public.workspace_members for each row execute function public.guard_member_update();

-- ---------------------------------------------------------------------------
-- switching and creating workspaces
-- ---------------------------------------------------------------------------
create or replace function public.switch_workspace(p_workspace uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.workspace_members m where m.workspace_id = p_workspace and m.user_id = (select auth.uid()) and m.active) then
    raise exception 'you don''t have access to that workspace' using errcode = '42501';
  end if;
  update public.profiles set workspace_id = p_workspace where id = (select auth.uid());
  return true;
end $$;

-- admins (of the workspace they're in) create a new, empty workspace; they become its admin and switch to it
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
  insert into public.workspace_members (workspace_id, user_id, role, active) values (ws, (select auth.uid()), 'admin', true);
  update public.profiles set workspace_id = ws where id = (select auth.uid());
  return ws;
end $$;
revoke all on function public.switch_workspace(uuid) from public;
revoke all on function public.create_workspace(text) from public;
grant execute on function public.switch_workspace(uuid) to authenticated;
grant execute on function public.create_workspace(text) to authenticated;

-- ---------------------------------------------------------------------------
-- new accounts get their membership; invites into a specific workspace use a pending row with join_workspace_id
-- ---------------------------------------------------------------------------
alter table public.workspace_signups add column if not exists join_workspace_id uuid references public.workspaces (id);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  team uuid := public.team_workspace_id();
  first_account boolean := not exists (select 1 from public.workspace_members where role = 'admin' and workspace_id = team);
  pending public.workspace_signups;
  ws uuid;
  nm text := coalesce(new.raw_user_meta_data ->> 'full_name', '');
begin
  select * into pending from public.workspace_signups where email = lower(coalesce(new.email, ''));
  if found and pending.join_workspace_id is not null then
    -- invited into an existing workspace as a member
    insert into public.profiles (id, full_name, email, role, active, workspace_id)
    values (new.id, coalesce(nullif(nm, ''), pending.full_name), coalesce(new.email, ''), 'member', true, pending.join_workspace_id)
    on conflict (id) do nothing;
    insert into public.workspace_members (workspace_id, user_id, role, active) values (pending.join_workspace_id, new.id, 'member', true)
    on conflict (workspace_id, user_id) do nothing;
    return new;
  elsif found then
    -- independent sign-up: a brand-new private workspace, as its admin
    insert into public.workspaces (kind, agency_name)
    values ('personal', coalesce(nullif(trim(pending.workspace_name), ''), nullif(trim(pending.full_name), ''), 'My workspace'))
    returning id into ws;
    insert into public.profiles (id, full_name, email, role, active, workspace_id)
    values (new.id, coalesce(nullif(nm, ''), pending.full_name), coalesce(new.email, ''), 'admin', true, ws)
    on conflict (id) do nothing;
    insert into public.workspace_members (workspace_id, user_id, role, active) values (ws, new.id, 'admin', true)
    on conflict (workspace_id, user_id) do nothing;
    return new;
  end if;
  -- everyone else joins the team workspace: the first account as its admin, invited accounts active
  -- (see handle_user_invited), any other account inactive until an admin activates it
  insert into public.profiles (id, full_name, email, role, active, workspace_id)
  values (new.id, nm, coalesce(new.email, ''), case when first_account then 'admin' else 'member' end,
          first_account or new.invited_at is not null, team)
  on conflict (id) do nothing;
  insert into public.workspace_members (workspace_id, user_id, role, active)
  values (team, new.id, case when first_account then 'admin' else 'member' end, first_account or new.invited_at is not null)
  on conflict (workspace_id, user_id) do nothing;
  return new;
end $$;

create or replace function public.handle_user_invited() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.invited_at is null and new.invited_at is not null then
    update public.profiles set active = true where id = new.id;
    update public.workspace_members m set active = true
      from public.profiles p where p.id = new.id and m.user_id = p.id and m.workspace_id = p.workspace_id;
  end if;
  return new;
end $$;
