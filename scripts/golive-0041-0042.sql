-- Layer2Funnels + Aurj: bring the LIVE database from migration 0040 to 0042 in ONE step (all or nothing).
--   0041 profiles: own name and photo for everyone (team and clients), photos only inside the same organization
--   0042 invitation onboarding: invitations found by verified e-mail (no link needed), e-mail delivery records, resend, duplicate guard,
--        already-members handled, every switched-on app for new teammates, admin lists with status
-- Checked on 2 Nov 2026: the live history ends at 0040_planner_measure_cadence (0034-0040 were applied on 1 Nov). Nothing here deletes data.
-- Run it in the Supabase SQL Editor of project l2f-ecosystem (paste everything, press Run). It refuses to run twice or on the wrong database.
-- Every statement below is the unchanged migration file from the repository; the only additions are the guard and the history rows.
begin;
do $guard$ begin
  if to_regclass('public.project_rules') is null or to_regclass('public.comments') is null then raise exception 'unexpected database: 0034-0040 are not all applied'; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'avatar_data')
     or to_regclass('public.invitation_deliveries') is not null then
    raise exception 'unexpected database: 0041 or 0042 is already applied';
  end if;
end $guard$;
set local check_function_bodies = off;

-- ====================================================================== 0041_profiles.sql
-- 0041: profiles. Every person (team member or client) can keep their own display name and a small photo.
-- The photo is a small square JPEG stored as a data URL (at most 12,000 characters; the browser shrinks it before sending), so no storage bucket is needed.
-- Additive. Nothing here grants anything to anon or authenticated; the API runs these functions as app_user.
alter table public.profiles add column avatar_data text
  check (avatar_data is null or (avatar_data like 'data:image/jpeg;base64,%' and length(avatar_data) <= 12000));

-- the caller's own profile
create or replace function public.profile_get()
returns table (id uuid, display_name text, email text, avatar_data text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name, p.email, p.avatar_data from public.profiles p where p.id = private.current_user_id()
$$;

-- change the caller's own name and/or photo. There is no person argument: nobody can change anybody else's profile through this.
create or replace function public.profile_update(p_name text default null, p_photo text default null, p_clear_photo boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); n text := nullif(left(btrim(coalesce(p_name, '')), 120), '');
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_name is not null and n is null then raise exception 'a name is required' using errcode = '22023'; end if;
  if p_photo is not null and (p_photo not like 'data:image/jpeg;base64,%' or length(p_photo) > 12000) then
    raise exception 'the photo must be a small JPEG' using errcode = '22023';
  end if;
  insert into public.profiles (id, email) values (uid, private.current_user_email()) on conflict (id) do nothing;
  update public.profiles set display_name = coalesce(n, display_name),
         avatar_data = case when p_clear_photo then null when p_photo is not null then p_photo else avatar_data end
   where id = uid;
end $$;

-- a team member's photo: only for someone active in the same organization (the one in the request header), or yourself
create or replace function public.profile_photo(p_user uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare r text := private.request_org(); ws uuid;
begin
  if p_user = private.current_user_id() then return (select avatar_data from public.profiles where id = p_user); end if;
  if r is null or r !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
  ws := r::uuid;
  if not private.is_staff(ws) then return null; end if;
  return (select p.avatar_data from public.profiles p join public.memberships m on m.user_id = p.id
           where p.id = p_user and m.workspace_id = ws and m.kind = 'staff' and m.status = 'active');
end $$;

-- the team directory says who has a photo (the photo itself is fetched one person at a time)
drop function public.team_list();
create function public.team_list()
returns table (user_id uuid, display_name text, email text, role text, is_you boolean, has_photo boolean)
language plpgsql stable security definer set search_path = '' as $$
declare ws uuid; r text := private.request_org();
begin
  if r is null or r !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return; end if;
  ws := r::uuid;
  if not private.is_staff(ws) then return; end if;
  return query
    select m.user_id, coalesce(p.display_name, 'Member ' || left(m.user_id::text, 4)),
           case when private.has_role(ws, 'admin') then p.email else null end,
           m.role, m.user_id = private.current_user_id(), p.avatar_data is not null
      from public.memberships m left join public.profiles p on p.id = m.user_id
     where m.workspace_id = ws and m.kind = 'staff' and m.status = 'active'
     order by lower(coalesce(p.display_name, 'zz')), m.user_id;
end $$;

revoke all on function public.profile_get(), public.profile_update(text, text, boolean), public.profile_photo(uuid), public.team_list() from public;
grant execute on function public.profile_get(), public.profile_update(text, text, boolean), public.profile_photo(uuid), public.team_list() to app_user;

-- ====================================================================== 0042_invitation_onboarding.sql
-- 0042: invitation onboarding that cannot get lost.
-- Why: on the live system two invitees confirmed their accounts but their invitations were never accepted, because the invitation was only
-- remembered by the browser tab that opened the link. From now on a signed-in person with a VERIFIED e-mail can see and accept the invitations
-- addressed to that e-mail, without the link (another tab, another device, a later sign-in). The link still works as before.
-- Also: e-mail delivery attempts are recorded (no token, no message content), staff invitations can be re-sent with a fresh link, duplicate staff
-- invitations are refused with a clear reason, a person who is already a member is not turned away, and staff get access to every app that is
-- switched on for the organization unless the inviter chose fewer.
-- Additive. Nothing is granted to anon or authenticated; the API runs as app_user. Tokens stay hashed; a raw token is returned once to the API only.

-- ------------------------------------------------------------------ verified e-mail of the caller
-- Supabase marks a confirmed address in auth.users.email_confirmed_at. Where that table does not exist (the test database) the signed claims decide.
create or replace function private.email_verified() returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare ok boolean; claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
begin
  if private.current_user_id() is null or private.current_user_email() is null then return false; end if;
  if to_regclass('auth.users') is not null then
    execute 'select exists (select 1 from auth.users u where u.id = $1 and u.email_confirmed_at is not null and lower(u.email) = $2)'
      into ok using private.current_user_id(), private.current_user_email();
    return ok;
  end if;
  return coalesce((claims -> 'user_metadata' ->> 'email_verified')::boolean, (claims ->> 'email_verified')::boolean, false);
end $$;

-- ------------------------------------------------------------------ delivery attempts and "opened"
alter table public.invitations add column opened_at timestamptz;

create table public.invitation_deliveries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  status text not null check (status in ('sent', 'failed', 'not_configured')),
  provider text check (provider is null or length(provider) <= 40),
  provider_message_id text check (provider_message_id is null or length(provider_message_id) <= 200),
  error_code text check (error_code is null or length(error_code) <= 80),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index invitation_deliveries_inv on public.invitation_deliveries (invitation_id, created_at desc);
alter table public.invitation_deliveries enable row level security;
alter table public.invitation_deliveries force row level security;
create policy org_scope on public.invitation_deliveries as restrictive for all
  using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
create policy invdel_select on public.invitation_deliveries for select
  using (private.has_role(workspace_id, 'admin') or private.has_permission(workspace_id, 'clients.access.manage'));
grant select on public.invitation_deliveries to app_user;

-- the latest delivery of an invitation, for the admin lists
create or replace function private.invitation_last_delivery(p_inv uuid)
returns table (status text, at timestamptz, error_code text)
language sql stable security definer set search_path = '' as $$
  select d.status, d.created_at, d.error_code from public.invitation_deliveries d where d.invitation_id = p_inv order by d.created_at desc limit 1
$$;

-- The API records what the e-mail provider answered. Only someone who may manage that invitation can record it, in their own organization.
create or replace function public.invitation_delivery_record(p_invitation uuid, p_status text, p_provider text default null, p_message_id text default null, p_error text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r text := private.request_org(); ws uuid; inv public.invitations;
begin
  if r is null or r !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'not found' using errcode = '42501'; end if;
  ws := r::uuid;
  select * into inv from public.invitations where id = p_invitation and workspace_id = ws;
  if inv.id is null or not ((inv.kind = 'staff' and private.has_role(ws, 'admin')) or (inv.kind = 'client' and private.has_permission(ws, 'clients.access.manage'))) then
    raise exception 'not found' using errcode = '42501';
  end if;
  insert into public.invitation_deliveries (workspace_id, invitation_id, status, provider, provider_message_id, error_code, created_by)
  values (ws, inv.id, p_status, left(p_provider, 40), left(p_message_id, 200), left(p_error, 80), private.current_user_id());
end $$;

-- what the e-mail needs: organization, inviter, kind, role. Same permission as recording a delivery.
create or replace function public.invitation_mail_facts(p_invitation uuid)
returns table (email text, kind text, role text, org_name text, org_slug text, inviter_name text, expires_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare r text := private.request_org(); ws uuid; inv public.invitations;
begin
  if r is null or r !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'not found' using errcode = '42501'; end if;
  ws := r::uuid;
  select * into inv from public.invitations where id = p_invitation and workspace_id = ws;
  if inv.id is null or not ((inv.kind = 'staff' and private.has_role(ws, 'admin')) or (inv.kind = 'client' and private.has_permission(ws, 'clients.access.manage'))) then
    raise exception 'not found' using errcode = '42501';
  end if;
  return query select inv.email, inv.kind, inv.role, w.name, w.slug, coalesce(nullif(btrim(p.display_name), ''), 'Your administrator'), inv.expires_at
    from public.workspaces w left join public.profiles p on p.id = private.current_user_id() where w.id = ws;
end $$;

-- the invited person opened the link (stamped once; only for the person it was sent to)
create or replace function public.invitation_mark_opened(p_token text) returns void
language sql security definer set search_path = '' as $$
  update public.invitations i set opened_at = now()
   where i.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
     and i.opened_at is null and i.email = private.current_user_email()
$$;

-- ------------------------------------------------------------------ creating: default apps, duplicates, existing members
-- Unchanged signature. New: refuses a second pending invitation for the same e-mail (P0001 'duplicate_invitation'), refuses someone who is already
-- on the team ('already_member'), and when no apps are chosen it grants every app switched on for this organization (not the Portal).
create or replace function public.create_invitation(
  p_workspace uuid, p_email text, p_kind text, p_role text default null,
  p_client uuid default null, p_apps text[] default null) returns text
language plpgsql security definer set search_path = '' as $$
declare tok text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''); v_email text := lower(btrim(coalesce(p_email, ''))); v_apps text[];
begin
  if not private.has_role(p_workspace, 'admin')
     or (p_role = 'owner' and not private.has_role(p_workspace, 'owner')) then
    raise exception 'not found' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace::text || ':' || v_email, 7042));
  if p_kind = 'staff' and exists (select 1 from public.memberships m join public.profiles pr on pr.id = m.user_id
                                   where m.workspace_id = p_workspace and m.kind = 'staff' and lower(pr.email) = v_email) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.invitations i where i.workspace_id = p_workspace and i.email = v_email and i.kind = p_kind
               and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()) then
    raise exception 'duplicate_invitation' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(a.key order by a.sort_order), '{}') into v_apps from public.apps a join public.workspace_apps wa on wa.app_key = a.key
   where wa.workspace_id = p_workspace and wa.enabled and a.scope <> 'portal' and a.key <> 'platform' and a.lifecycle in ('active', 'deprecated')
     and (p_apps is null or a.key = any (p_apps));
  insert into public.invitations (workspace_id, email, kind, role, client_id, apps, token_hash, invited_by)
  values (p_workspace, v_email, p_kind, p_role, p_client, v_apps,
          encode(sha256(convert_to(tok, 'UTF8')), 'hex'), private.current_user_id());
  return tok;
end $$;

-- a fresh link for a staff invitation that is still open or has expired (not accepted, not cancelled); the old link stops working
create or replace function public.invitation_reissue(p_invitation uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare r text := private.request_org(); ws uuid; tok text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''); n int;
begin
  if r is null or r !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'not found' using errcode = '42501'; end if;
  ws := r::uuid;
  if not private.has_role(ws, 'admin') then raise exception 'not found' using errcode = '42501'; end if;
  update public.invitations set token_hash = encode(sha256(convert_to(tok, 'UTF8')), 'hex'), expires_at = now() + interval '7 days', opened_at = null
   where id = p_invitation and workspace_id = ws and kind = 'staff' and accepted_at is null and revoked_at is null
     and (role <> 'owner' or private.has_role(ws, 'owner'));
  get diagnostics n = row_count;
  if n = 0 then raise exception 'not found' using errcode = 'P0002'; end if;
  return tok;
end $$;

-- ------------------------------------------------------------------ joining (one place for the link and for "my invitations")
-- Already a member of that organization: the invitation is closed and nothing about the membership changes (no role change, no new apps).
create or replace function private.invitation_join(p_inv uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare inv public.invitations; uid uuid := private.current_user_id(); mid uuid; mstatus text; aid uuid;
begin
  select * into inv from public.invitations where id = p_inv for update;
  if uid is null or inv.id is null or inv.accepted_at is not null or inv.revoked_at is not null or inv.expires_at <= now()
     or inv.email is distinct from private.current_user_email() then
    raise exception 'invitation not valid' using errcode = 'P0002';
  end if;
  select m.id, m.status into mid, mstatus from public.memberships m where m.workspace_id = inv.workspace_id and m.user_id = uid;
  if mid is not null then
    if mstatus <> 'active' then raise exception 'invitation not valid' using errcode = 'P0002'; end if;   -- a deactivated person is let back in by an admin, not by an old e-mail
    update public.invitations set accepted_at = now(), accepted_by = uid where id = inv.id;
    return mid;
  end if;
  insert into public.memberships (workspace_id, user_id, kind, role, client_id)
  values (inv.workspace_id, uid, inv.kind, inv.role, inv.client_id) returning id into mid;
  if inv.kind = 'staff' then
    insert into public.app_grants (workspace_id, user_id, app_key, granted_by)
    select inv.workspace_id, uid, a, inv.invited_by from unnest(inv.apps) a
    where exists (select 1 from public.apps x where x.key = a and x.scope <> 'portal')
    on conflict do nothing;
  else
    update public.client_access set status = 'active', user_id = uid, decided_at = now()
     where invitation_id = inv.id and status in ('invited', 'requested') returning id into aid;
    if aid is null then raise exception 'invitation not valid' using errcode = 'P0002'; end if;
    perform private.client_access_event(inv.workspace_id, aid, 'accepted');
  end if;
  update public.invitations set accepted_at = now(), accepted_by = uid where id = inv.id;
  return mid;
end $$;

-- the link: same contract as before (every failure looks the same)
create or replace function public.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  select i.id into v from public.invitations i where i.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
  if v is null then raise exception 'invitation not valid' using errcode = 'P0002'; end if;
  return private.invitation_join(v);
end $$;

-- invitations waiting for the signed-in person (verified e-mail only). Shows no token and nothing about anyone else.
create or replace function public.my_invitations()
returns table (id uuid, org_id uuid, org_name text, org_slug text, kind text, role text, inviter_name text, expires_at timestamptz, already_member boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.email_verified() then return; end if;
  return query
    select i.id, w.id, w.name, w.slug, i.kind, i.role, coalesce(nullif(btrim(p.display_name), ''), 'An administrator'), i.expires_at,
           exists (select 1 from public.memberships m where m.workspace_id = i.workspace_id and m.user_id = private.current_user_id() and m.status = 'active')
      from public.invitations i join public.workspaces w on w.id = i.workspace_id left join public.profiles p on p.id = i.invited_by
     where i.email = private.current_user_email() and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
     order by i.created_at;
end $$;

create or replace function public.invitation_accept_mine(p_invitation uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if not private.email_verified() then raise exception 'invitation not valid' using errcode = 'P0002'; end if;
  return private.invitation_join(p_invitation);
end $$;

create or replace function public.invitation_decline_mine(p_invitation uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not private.email_verified() then return false; end if;
  update public.invitations i set revoked_at = now(), declined_at = now()
   where i.id = p_invitation and i.accepted_at is null and i.revoked_at is null and i.email = private.current_user_email();
  get diagnostics n = row_count;
  return n = 1;
end $$;

-- ------------------------------------------------------------------ admin lists: invitation status, expiry, last e-mail
drop function public.members_list();
create function public.members_list()
returns table (row_kind text, user_id uuid, invitation_id uuid, display_name text, email text, role text, status text, since timestamptz, is_you boolean,
               expires_at timestamptz, opened_at timestamptz, email_status text, email_at timestamptz, email_error text)
language plpgsql stable security definer set search_path = '' as $$
declare ws uuid; r text := private.request_org();
begin
  if r is null or r !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return; end if;
  ws := r::uuid;
  if not private.has_role(ws, 'admin') then return; end if;
  return query
    select 'member'::text, m.user_id, null::uuid, p.display_name, p.email, m.role, case when m.status = 'active' then 'active' else 'deactivated' end,
           null::timestamptz, m.user_id = private.current_user_id(), null::timestamptz, null::timestamptz, null::text, null::timestamptz, null::text
      from public.memberships m left join public.profiles p on p.id = m.user_id
     where m.workspace_id = ws and m.kind = 'staff'
    union all
    select 'invitation', null::uuid, i.id, null::text, i.email, i.role, case when i.expires_at > now() then 'invited' else 'expired' end, i.created_at, false,
           i.expires_at, i.opened_at, d.status, d.at, d.error_code
      from public.invitations i left join lateral private.invitation_last_delivery(i.id) d on true
     where i.workspace_id = ws and i.kind = 'staff' and i.accepted_at is null and i.revoked_at is null and i.expires_at > now() - interval '30 days'
     order by 2 nulls last, 5;
end $$;

drop function public.client_access_list();
create function public.client_access_list()
returns table (id uuid, client_id uuid, client_name text, email text, person_name text, source text, status text, invitation_expired boolean, portal_live boolean,
               created_at timestamptz, decided_at timestamptz, note text, email_status text, email_at timestamptz, email_error text)
language plpgsql stable security definer set search_path = '' as $$
declare ws uuid := private.client_access_org();
begin
  return query
    select a.id, a.client_id, c.name, a.email, a.person_name, a.source, a.status,
           (a.status = 'invited' and not exists (select 1 from public.invitations i where i.id = a.invitation_id and i.accepted_at is null and i.revoked_at is null and i.expires_at > now())),
           exists (select 1 from public.workspace_apps wa join public.apps x on x.key = wa.app_key where wa.workspace_id = ws and x.scope = 'portal' and wa.enabled and x.lifecycle = 'active'),
           a.created_at, a.decided_at, a.note, d.status, d.at, d.error_code
      from public.client_access a join public.clients c on c.workspace_id = a.workspace_id and c.id = a.client_id
      left join lateral private.invitation_last_delivery(a.invitation_id) d on a.invitation_id is not null
     where a.workspace_id = ws
     order by case a.status when 'requested' then 0 when 'invited' then 1 when 'active' then 2 when 'suspended' then 3 else 4 end, a.created_at desc;
end $$;

-- ------------------------------------------------------------------ grants (API role only)
revoke all on function private.email_verified(), private.invitation_last_delivery(uuid), private.invitation_join(uuid) from public;
grant execute on function private.email_verified(), private.invitation_last_delivery(uuid), private.invitation_join(uuid) to app_user;
revoke all on function public.invitation_delivery_record(uuid, text, text, text, text), public.invitation_mail_facts(uuid), public.invitation_mark_opened(text),
  public.invitation_reissue(uuid), public.my_invitations(), public.invitation_accept_mine(uuid), public.invitation_decline_mine(uuid),
  public.members_list(), public.client_access_list(), public.create_invitation(uuid, text, text, text, uuid, text[]), public.accept_invitation(text) from public;
grant execute on function public.invitation_delivery_record(uuid, text, text, text, text), public.invitation_mail_facts(uuid), public.invitation_mark_opened(text),
  public.invitation_reissue(uuid), public.my_invitations(), public.invitation_accept_mine(uuid), public.invitation_decline_mine(uuid),
  public.members_list(), public.client_access_list(), public.create_invitation(uuid, text, text, text, uuid, text[]), public.accept_invitation(text) to app_user;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.invitation_deliveries from %I', r);
      execute format('revoke all on all functions in schema public from %I', r);
      execute format('revoke all on all functions in schema private from %I', r);
    end if;
  end loop;
end $$;

-- ====================================================================== migration history
do $hist$ begin if to_regclass('supabase_migrations.schema_migrations') is not null then
  insert into supabase_migrations.schema_migrations (version, name) values ('20261102120041', '0041_profiles'), ('20261102120042', '0042_invitation_onboarding');
end if; end $hist$;
commit;
