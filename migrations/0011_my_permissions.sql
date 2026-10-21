set check_function_bodies = off;
-- 0011 · What may I do, and where? (owner requirement 21 Oct: a person who holds a permission only at client or project scope must
-- see the buttons they may use.) Answers for the CURRENT organization (x-org-id) and only about the caller.
--   scope 'workspace': allowed organization-wide.
--   scope 'client':    allowed on that client only (omitted when already allowed organization-wide).
--   scope 'project':   allowed on that project only (omitted when already allowed organization-wide or on its client).
-- It reuses the one decision function (deny beats allow, role floors, app grants, groups, expiry), so the buttons can never disagree
-- with what the database will accept. It lists only clients/projects the person can already reach: it never reveals that others exist.
create or replace function public.my_permissions()
returns table (permission_key text, scope text, client_id uuid, project_id uuid)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); r text := private.request_org(); ws uuid;
begin
  if uid is null or r is null or r !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return; end if;
  ws := r::uuid;
  if not private.is_staff(ws) then return; end if;
  return query
    select p.key, 'workspace'::text, null::uuid, null::uuid
      from public.permissions p where private.permission_decision(ws, uid, p.key, null, null) like 'allow:%';
  return query
    select p.key, 'client'::text, c.id, null::uuid
      from public.permissions p cross join public.clients c
     where c.workspace_id = ws and 'client' = any (p.scopes)
       and private.permission_decision(ws, uid, p.key, null, null) not like 'allow:%'
       and private.permission_decision(ws, uid, p.key, c.id, null) like 'allow:%';
  return query
    select p.key, 'project'::text, null::uuid, pr.id
      from public.permissions p cross join public.projects pr
     where pr.workspace_id = ws and 'project' = any (p.scopes)
       and private.permission_decision(ws, uid, p.key, null, null) not like 'allow:%'
       and (pr.client_id is null or private.permission_decision(ws, uid, p.key, pr.client_id, null) not like 'allow:%')
       and private.permission_decision(ws, uid, p.key, null, pr.id) like 'allow:%';
end $$;
revoke all on function public.my_permissions() from public;
grant execute on function public.my_permissions() to app_user;
