set check_function_bodies = off;
-- 0012 · Backend for the approved shell, auth and Admin designs (01 switcher, 02 auth, 03 launcher, 05 admin; 21 Oct 2026).
-- All functions answer for the CURRENT organization (x-org-id) and the CALLER, are security definer with their own checks, are
-- revoked from PUBLIC and granted to app_user only (migration 0010: the Data API roles can call none of them).

-- ------------------------------------------------------------------ launcher: all twelve tiles, in the designed order
update public.apps set sort_order = v.o from (values ('office',10),('projects',20),('clients',30),('portal',40),('drive',50),('planner',60),
  ('forms',70),('value_ladder',80),('social_planner',90),('whiteboard',100),('layer2_agents',110),('funnel_mapper_pro',120)) v(k, o) where apps.key = v.k;

-- Tile states (design 03): available · locked (Client Portal, owners and admins only) · coming_soon · not_set_up (the app is on in
-- another organization the person belongs to, but not here). Apps nobody may use are hidden, not shown greyed.
create or replace function public.launcher_catalog()
returns table (app_key text, name text, scope text, lifecycle text, sort_order int, launch_url text, state text, other_org text)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); r text := private.request_org(); ws uuid; adm boolean;
begin
  if uid is null or r is null or r !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return; end if;
  ws := r::uuid;
  if private.is_staff(ws) then
    adm := private.has_role(ws, 'admin');
    return query
      select t.k, t.n, t.s, t.l, t.o, t.u, t.st, t.oo from (
        select a.key k, a.name n, a.scope s, a.lifecycle l, a.sort_order o, wa.launch_url u,
          case
            when a.lifecycle = 'coming_soon' then 'coming_soon'
            when a.scope = 'portal' then case when coalesce(wa.enabled, false) then 'available' else 'locked' end
            when coalesce(wa.enabled, false) and private.can_use_app(ws, a.key) then 'available'
            when exists (select 1 from public.workspace_apps wo join public.memberships mo on mo.workspace_id = wo.workspace_id
                          where wo.app_key = a.key and wo.enabled and wo.workspace_id <> ws and mo.user_id = uid and mo.kind = 'staff'
                            and mo.status = 'active' and private.can_use_app(wo.workspace_id, a.key)) then 'not_set_up'
            else 'hidden' end st,
          (select w.name from public.workspace_apps wo join public.memberships mo on mo.workspace_id = wo.workspace_id
             join public.workspaces w on w.id = wo.workspace_id
            where wo.app_key = a.key and wo.enabled and wo.workspace_id <> ws and mo.user_id = uid and mo.kind = 'staff' and mo.status = 'active'
              and private.can_use_app(wo.workspace_id, a.key) order by w.name limit 1) oo
        from public.apps a left join public.workspace_apps wa on wa.app_key = a.key and wa.workspace_id = ws
        where a.key <> 'platform' and a.lifecycle in ('active', 'coming_soon', 'deprecated') and (a.scope <> 'portal' or adm)
      ) t where t.st <> 'hidden' order by t.o;
  elsif exists (select 1 from public.memberships m where m.workspace_id = ws and m.user_id = uid and m.kind = 'client' and m.status = 'active') then
    return query
      select a.key, a.name, a.scope, a.lifecycle, a.sort_order, wa.launch_url, 'available'::text, null::text
        from public.apps a join public.workspace_apps wa on wa.app_key = a.key and wa.workspace_id = ws and wa.enabled
       where a.scope = 'portal' and a.lifecycle = 'active';
  end if;
end $$;

-- ------------------------------------------------------------------ profiles: who is who (name and verified e-mail of the caller)
alter table public.profiles add column email text check (email is null or length(email) <= 320);
create or replace function public.profile_touch(p_name text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id();
begin
  if uid is null then return; end if;
  insert into public.profiles (id, email, display_name) values (uid, private.current_user_email(), nullif(left(trim(coalesce(p_name, '')), 120), ''))
  on conflict (id) do update set email = coalesce(excluded.email, public.profiles.email),
                                 display_name = coalesce(public.profiles.display_name, excluded.display_name);
end $$;

-- ------------------------------------------------------------------ invitations: preview and decline (only for the person it was sent to)
alter table public.invitations add column declined_at timestamptz;
create or replace function public.invitation_preview(p_token text)
returns table (org_name text, org_slug text, kind text, role text, inviter_name text, email text)
language sql stable security definer set search_path = '' as $$
  select w.name, w.slug, i.kind, i.role, coalesce(p.display_name, 'Someone'), i.email
    from public.invitations i join public.workspaces w on w.id = i.workspace_id left join public.profiles p on p.id = i.invited_by
   where i.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
     and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
     and i.email = private.current_user_email()       -- anyone else gets zero rows: a token reveals nothing
$$;
create or replace function public.invitation_decline(p_token text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.invitations i set revoked_at = now(), declined_at = now()
   where i.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
     and i.accepted_at is null and i.revoked_at is null and i.expires_at > now() and i.email = private.current_user_email();
  get diagnostics n = row_count;
  return n = 1;
end $$;

-- ------------------------------------------------------------------ members (Admin → Members; owners and admins only)
create or replace function public.members_list()
returns table (row_kind text, user_id uuid, invitation_id uuid, display_name text, email text, role text, status text, since timestamptz, is_you boolean)
language plpgsql stable security definer set search_path = '' as $$
declare ws uuid; r text := private.request_org();
begin
  if r is null or r !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return; end if;
  ws := r::uuid;
  if not private.has_role(ws, 'admin') then return; end if;
  return query
    select 'member'::text, m.user_id, null::uuid, p.display_name, p.email, m.role, case when m.status = 'active' then 'active' else 'deactivated' end,
           null::timestamptz, m.user_id = private.current_user_id()
      from public.memberships m left join public.profiles p on p.id = m.user_id
     where m.workspace_id = ws and m.kind = 'staff'
    union all
    select 'invitation', null::uuid, i.id, null::text, i.email, i.role, 'invited', i.created_at, false
      from public.invitations i
     where i.workspace_id = ws and i.kind = 'staff' and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
     order by 2 nulls last, 5;
end $$;

-- Rules (design 05): only an owner changes an owner; an organization always keeps one (trigger memberships_last_owner, P0001).
create or replace function private.member_target(p_user uuid, p_new_role text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare r text := private.request_org(); ws uuid; trole text;
begin
  if r is null or r !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'not found' using errcode = '42501'; end if;
  ws := r::uuid;
  if not private.has_role(ws, 'admin') then raise exception 'not found' using errcode = '42501'; end if;
  select m.role into trole from public.memberships m where m.workspace_id = ws and m.user_id = p_user and m.kind = 'staff';
  if trole is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if (trole = 'owner' or p_new_role = 'owner') and not private.has_role(ws, 'owner') then raise exception 'not found' using errcode = '42501'; end if;
  return ws;
end $$;
create or replace function public.member_set_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare ws uuid;
begin
  if p_role not in ('owner', 'admin', 'editor', 'viewer') then raise exception 'invalid role' using errcode = 'P0001'; end if;
  ws := private.member_target(p_user, p_role);
  update public.memberships set role = p_role where workspace_id = ws and user_id = p_user and kind = 'staff';
end $$;
create or replace function public.member_set_status(p_user uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare ws uuid;
begin
  if p_status not in ('active', 'deactivated') then raise exception 'invalid status' using errcode = 'P0001'; end if;
  ws := private.member_target(p_user, null);
  update public.memberships set status = p_status where workspace_id = ws and user_id = p_user and kind = 'staff';
end $$;
create or replace function public.member_remove(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare ws uuid;
begin
  ws := private.member_target(p_user, null);
  delete from public.access_assignments where workspace_id = ws and principal_type = 'user' and principal_id = p_user;
  delete from public.permission_overrides where workspace_id = ws and principal_type = 'user' and principal_id = p_user;
  delete from public.group_members where workspace_id = ws and user_id = p_user;
  delete from public.app_grants where workspace_id = ws and user_id = p_user;
  delete from public.memberships where workspace_id = ws and user_id = p_user and kind = 'staff';   -- last-owner guard applies
end $$;
create or replace function public.invitation_cancel(p_invitation uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r text := private.request_org(); ws uuid; n int;
begin
  if r is null or r !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'not found' using errcode = '42501'; end if;
  ws := r::uuid;
  if not private.has_role(ws, 'admin') then raise exception 'not found' using errcode = '42501'; end if;
  update public.invitations set revoked_at = now() where id = p_invitation and workspace_id = ws and accepted_at is null and revoked_at is null
     and (role <> 'owner' or private.has_role(ws, 'owner'));
  get diagnostics n = row_count;
  if n = 0 then raise exception 'not found' using errcode = 'P0002'; end if;
end $$;

-- ------------------------------------------------------------------ audit for the new member operations is automatic (triggers on memberships and invitations)
revoke all on all functions in schema private from public;
revoke all on function public.launcher_catalog(), public.profile_touch(text), public.invitation_preview(text), public.invitation_decline(text),
  public.members_list(), public.member_set_role(uuid, text), public.member_set_status(uuid, text), public.member_remove(uuid), public.invitation_cancel(uuid) from public;
grant execute on function public.launcher_catalog(), public.profile_touch(text), public.invitation_preview(text), public.invitation_decline(text),
  public.members_list(), public.member_set_role(uuid, text), public.member_set_status(uuid, text), public.member_remove(uuid), public.invitation_cancel(uuid) to app_user;
