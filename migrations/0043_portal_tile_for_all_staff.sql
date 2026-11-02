-- 0043: the Client Portal tile is shown to every team member (owner decision, 2 Nov 2026), not only owners and admins.
-- Only the Launcher list changes. The Portal itself is unchanged: while it is switched off the tile reads "locked" and opens the preview,
-- which reads client data through each person's own permissions (an editor sees only the clients they may see). Clients still cannot
-- sign in until an owner switches the Portal on, and only an owner can do that.
create or replace function public.launcher_catalog()
returns table (app_key text, name text, scope text, lifecycle text, sort_order int, launch_url text, state text, other_org text)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); r text := private.request_org(); ws uuid;
begin
  if uid is null or r is null or r !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return; end if;
  ws := r::uuid;
  if private.is_staff(ws) then
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
        where a.key <> 'platform' and a.lifecycle in ('active', 'coming_soon', 'deprecated')
      ) t where t.st <> 'hidden' order by t.o;
  elsif exists (select 1 from public.memberships m where m.workspace_id = ws and m.user_id = uid and m.kind = 'client' and m.status = 'active') then
    return query
      select a.key, a.name, a.scope, a.lifecycle, a.sort_order, wa.launch_url, 'available'::text, null::text
        from public.apps a join public.workspace_apps wa on wa.app_key = a.key and wa.workspace_id = ws and wa.enabled
       where a.scope = 'portal' and a.lifecycle = 'active';
  end if;
end $$;

revoke all on function public.launcher_catalog() from public;
grant execute on function public.launcher_catalog() to app_user;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then execute format('revoke all on function public.launcher_catalog() from %I', r); end if;
  end loop;
end $$;
