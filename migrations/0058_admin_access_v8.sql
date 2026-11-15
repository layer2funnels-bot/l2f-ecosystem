-- 0058 · Office V8 (P01) Admin & Access: per-person app access and feature switches, last-used dates for the access review, the Client Access
-- Matrix and organization branding. 01_APPLICATIONS/01_OFFICE "Admin". Additive and reversible (rollback: migrations/rollback/0058_admin_access_v8.down.sql).
--
-- Who may do what (enforced here, not only in the browser):
--   • teammate apps and features: owners and admins (platform.members.manage), never on themselves or on an owner; an admin cannot switch on a
--     permission whose floor is owner.
--   • Client Access Matrix: owners AND admins (owner decision, 15 Nov 2026 — overrides V8's owner-only note); others only if explicitly granted
--     clients.apps.manage.
--   • branding: owners only (V8).
-- Every change is written to audit_events by the existing triggers or by the functions below.

insert into public.permissions (key, app_key, description, floor_role, default_role, scopes, sensitive) values
  ('clients.apps.manage', 'clients', 'Choose which apps each client gets (Client Access Matrix)', 'admin', 'admin', '{workspace}', true)
on conflict (key) do nothing;

-- ---- last time each person opened each app (for the access review). Kept apart from app_grants so opening an app never writes an audit row.
create table if not exists public.app_usage (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null,
  app_key text not null references public.apps(key),
  last_used_at timestamptz not null default now(),
  reviewed_at timestamptz,
  primary key (workspace_id, user_id, app_key)
);
alter table public.app_usage enable row level security;
alter table public.app_usage force row level security;
drop policy if exists sel on public.app_usage;
create policy sel on public.app_usage for select using (user_id = private.current_user_id() or private.has_permission(workspace_id, 'platform.access.review'));
drop policy if exists org_scope on public.app_usage;
create policy org_scope on public.app_usage as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
grant select on public.app_usage to app_user;   -- written only through app_touch() / access_review_keep()

create or replace function public.app_touch(p_app text) returns void
language plpgsql security definer set search_path = '' as $$
declare ws uuid := nullif(private.request_org(), '')::uuid; uid uuid := private.current_user_id();
begin
  if ws is null or uid is null or not private.is_staff(ws) or not exists (select 1 from public.apps a where a.key = p_app) then return; end if;
  insert into public.app_usage (workspace_id, user_id, app_key) values (ws, uid, p_app)
  on conflict (workspace_id, user_id, app_key) do update set last_used_at = now() where public.app_usage.last_used_at < now() - interval '10 minutes';
end $$;

-- ---- teammate app access (app_grants) and feature switches (permission_overrides)
create or replace function private.can_manage_teammate(ws uuid, target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_permission(ws, 'platform.members.manage') and target is distinct from private.current_user_id()
     and exists (select 1 from public.memberships m where m.workspace_id = ws and m.user_id = target and m.kind = 'staff' and m.role <> 'owner')
$$;

create or replace function public.access_app_set(p_user uuid, p_app text, p_on boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare ws uuid := nullif(private.request_org(), '')::uuid;
begin
  if ws is null or not private.can_manage_teammate(ws, p_user) then raise exception 'not found' using errcode = '42501'; end if;
  if not exists (select 1 from public.workspace_apps wa join public.apps a on a.key = wa.app_key where wa.workspace_id = ws and wa.app_key = p_app and wa.enabled and a.scope <> 'portal') then
    raise exception 'that app is not on for this organization' using errcode = '22023'; end if;
  if p_on then insert into public.app_grants (workspace_id, user_id, app_key, granted_by) values (ws, p_user, p_app, private.current_user_id()) on conflict do nothing;
  else delete from public.app_grants where workspace_id = ws and user_id = p_user and app_key = p_app; end if;
  return p_on;
end $$;

-- p_effect: 'allow', 'deny' or null (back to what the role gives). Only the org-wide override this screen manages is touched (no client/project scope).
create or replace function public.access_feature_set(p_user uuid, p_permission text, p_effect text) returns text
language plpgsql security definer set search_path = '' as $$
declare ws uuid := nullif(private.request_org(), '')::uuid; fl text;
begin
  if ws is null or not private.can_manage_teammate(ws, p_user) then raise exception 'not found' using errcode = '42501'; end if;
  select floor_role into fl from public.permissions where key = p_permission;
  if fl is null then raise exception 'unknown permission' using errcode = '22023'; end if;
  if p_effect is not null and p_effect not in ('allow', 'deny') then raise exception 'effect must be allow or deny' using errcode = '22023'; end if;
  if p_effect = 'allow' and fl = 'owner' and not private.has_role(ws, 'owner') then raise exception 'only an owner can give that' using errcode = '42501'; end if;
  delete from public.permission_overrides where workspace_id = ws and principal_type = 'user' and principal_id = p_user and permission_key = p_permission
    and client_id is null and project_id is null and reason like 'v8-admin:%';
  if p_effect is not null then
    insert into public.permission_overrides (workspace_id, principal_type, principal_id, permission_key, effect, granted_by, reason)
    values (ws, 'user', p_user, p_permission, p_effect, private.current_user_id(), 'v8-admin:feature switch');
  end if;
  insert into public.audit_events (workspace_id, actor_id, action, subject_type, subject_id, origin, detail)
  values (ws, private.current_user_id(), 'access.feature.' || coalesce(p_effect, 'reset'), 'membership', p_user, 'app', jsonb_build_object('permission', p_permission));
  return coalesce(p_effect, 'reset');
end $$;

-- the switches this screen set for one person (to show "From role" vs "Changed")
create or replace function public.access_feature_overrides(p_user uuid) returns table (permission_key text, effect text)
language sql stable security definer set search_path = '' as $$
  select o.permission_key, o.effect from public.permission_overrides o
  where o.workspace_id = nullif(private.request_org(), '')::uuid and o.principal_type = 'user' and o.principal_id = p_user and o.client_id is null and o.project_id is null
    and o.reason like 'v8-admin:%' and (private.has_permission(o.workspace_id, 'platform.access.review') or p_user = private.current_user_id())
$$;

-- ---- access review: every teammate's app grants with when they last used them (owners/admins: platform.access.review)
create or replace function public.access_review_list() returns table (user_id uuid, display_name text, role text, app_key text, granted_at timestamptz, last_used_at timestamptz, reviewed_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select g.user_id, coalesce(nullif(p.display_name, ''), 'Someone'), m.role, g.app_key, g.granted_at, u.last_used_at, u.reviewed_at
  from public.app_grants g join public.memberships m on m.workspace_id = g.workspace_id and m.user_id = g.user_id and m.kind = 'staff' and m.status = 'active'
  left join public.profiles p on p.id = g.user_id left join public.app_usage u on u.workspace_id = g.workspace_id and u.user_id = g.user_id and u.app_key = g.app_key
  where g.workspace_id = nullif(private.request_org(), '')::uuid and m.role <> 'owner' and private.has_permission(g.workspace_id, 'platform.access.review')
  order by u.last_used_at nulls first, p.display_name
$$;
create or replace function public.access_review_keep(p_user uuid, p_app text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare ws uuid := nullif(private.request_org(), '')::uuid;
begin
  if ws is null or not private.can_manage_teammate(ws, p_user) then raise exception 'not found' using errcode = '42501'; end if;
  insert into public.app_usage (workspace_id, user_id, app_key, last_used_at, reviewed_at) values (ws, p_user, p_app, '-infinity', now())
  on conflict (workspace_id, user_id, app_key) do update set reviewed_at = now();
  insert into public.audit_events (workspace_id, actor_id, action, subject_type, subject_id, origin, detail)
  values (ws, private.current_user_id(), 'access.review.keep', 'membership', p_user, 'app', jsonb_build_object('app', p_app));
  return true;
end $$;

-- ---- Client Access Matrix: which apps each client gets. Defaults per organization; a row per client overrides one app.
create table if not exists public.client_app_defaults (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  app_key text not null references public.apps(key),
  primary key (workspace_id, app_key)
);
create table if not exists public.client_app_access (
  workspace_id uuid not null,
  client_id uuid not null,
  app_key text not null references public.apps(key),
  enabled boolean not null,
  changed_by uuid, changed_at timestamptz not null default now(),
  primary key (client_id, app_key),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id) on delete cascade
);
do $$
declare t text;
begin
  foreach t in array array['client_app_defaults', 'client_app_access'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists sel on public.%I', t);
    execute format('create policy sel on public.%I for select using (private.has_permission(workspace_id, %L))', t, 'clients.apps.manage');
    execute format('drop policy if exists mng on public.%I', t);
    execute format('create policy mng on public.%I for all using (private.has_permission(workspace_id, %L)) with check (private.has_permission(workspace_id, %L))', t, 'clients.apps.manage', 'clients.apps.manage');
    execute format('drop policy if exists org_scope on public.%I', t);
    execute format('create policy org_scope on public.%I as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id))', t);
    execute format('grant select, insert, update, delete on public.%I to app_user', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I for each row execute function private.audit_change(%2$L, %3$L)', t, 'app_key', case when t = 'client_app_access' then 'enabled' else 'app_key' end);
  end loop;
end $$;
-- for the Client Portal (P-phase): is this app on for that client? (defaults, then the per-client choice)
create or replace function private.client_app_enabled(ws uuid, p_client uuid, p_app text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select c.enabled from public.client_app_access c where c.workspace_id = ws and c.client_id = p_client and c.app_key = p_app),
                  exists (select 1 from public.client_app_defaults d where d.workspace_id = ws and d.app_key = p_app))
$$;

-- ---- branding (V8 Admin › Branding): a square icon, a wordmark for light and dark backgrounds, a favicon. Small images kept inline (like profile photos).
alter table public.workspaces
  add column if not exists brand_icon text check (brand_icon ~ '^data:image/(png|webp|jpeg|svg\+xml);base64,[A-Za-z0-9+/=]+$' and length(brand_icon) <= 300000),
  add column if not exists brand_wordmark text check (brand_wordmark ~ '^data:image/(png|webp|jpeg|svg\+xml);base64,[A-Za-z0-9+/=]+$' and length(brand_wordmark) <= 300000),
  add column if not exists brand_wordmark_dark text check (brand_wordmark_dark ~ '^data:image/(png|webp|jpeg|svg\+xml);base64,[A-Za-z0-9+/=]+$' and length(brand_wordmark_dark) <= 300000),
  add column if not exists brand_favicon text check (brand_favicon ~ '^data:image/(png|webp|jpeg|svg\+xml);base64,[A-Za-z0-9+/=]+$' and length(brand_favicon) <= 100000);

create or replace function public.workspace_branding() returns table (brand_icon text, brand_wordmark text, brand_wordmark_dark text, brand_favicon text)
language sql stable security definer set search_path = '' as $$
  select w.brand_icon, w.brand_wordmark, w.brand_wordmark_dark, w.brand_favicon from public.workspaces w
  where w.id = nullif(private.request_org(), '')::uuid and private.is_staff(w.id)
$$;
create or replace function public.workspace_branding_set(p_slot text, p_data text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare ws uuid := nullif(private.request_org(), '')::uuid;
begin
  if ws is null or not private.has_role(ws, 'owner') then raise exception 'not found' using errcode = '42501'; end if;
  if p_slot not in ('icon', 'wordmark', 'wordmark_dark', 'favicon') then raise exception 'unknown slot' using errcode = '22023'; end if;
  execute format('update public.workspaces set %I = $1 where id = $2', 'brand_' || p_slot) using nullif(p_data, ''), ws;
  insert into public.audit_events (workspace_id, actor_id, action, subject_type, subject_id, origin, detail)
  values (ws, private.current_user_id(), 'branding.' || case when coalesce(p_data, '') = '' then 'remove' else 'replace' end, 'workspace', ws, 'app', jsonb_build_object('slot', p_slot));
  return true;
end $$;

revoke execute on function public.app_touch(text), public.access_app_set(uuid, text, boolean), public.access_feature_set(uuid, text, text), public.access_feature_overrides(uuid),
  public.access_review_list(), public.access_review_keep(uuid, text), public.workspace_branding(), public.workspace_branding_set(text, text), private.can_manage_teammate(uuid, uuid), private.client_app_enabled(uuid, uuid, text) from public;
grant execute on function public.app_touch(text), public.access_app_set(uuid, text, boolean), public.access_feature_set(uuid, text, text), public.access_feature_overrides(uuid),
  public.access_review_list(), public.access_review_keep(uuid, text), public.workspace_branding(), public.workspace_branding_set(text, text) to app_user;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on table public.app_usage, public.client_app_defaults, public.client_app_access from %I', r);
      execute format('revoke execute on function public.app_touch(text), public.access_app_set(uuid, text, boolean), public.access_feature_set(uuid, text, text), public.access_feature_overrides(uuid), public.access_review_list(), public.access_review_keep(uuid, text), public.workspace_branding(), public.workspace_branding_set(text, text) from %I', r);
    end if;
  end loop;
end $$;
