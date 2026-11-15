-- Rollback of 0060 (quality recovery). Linked documents, the launcher order and avatar settings are dropped (the Drive files themselves stay).
-- Access Review comes back as it was in 0058 (functions and the reviewed_at column, empty).
drop table if exists public.doc_links;
drop table if exists public.avatar_settings;
drop function if exists public.my_org_icons();
drop function if exists public.workspace_rename(text);
drop function if exists public.launcher_order_set(text[]);
drop table if exists public.workspace_app_order;
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
alter table public.app_usage add column if not exists reviewed_at timestamptz;
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
revoke execute on function public.access_review_list(), public.access_review_keep(uuid, text) from public;
grant execute on function public.access_review_list(), public.access_review_keep(uuid, text) to app_user;
