-- Office > Team (Design v4): a directory every active staff member of an organization may read.
-- members_list() stays the admin table (e-mail, invitations); this one shows names and levels only, and e-mail only to owners and admins.
-- Additive and local-only until the owner approves the go-live package.
create or replace function public.team_list()
returns table (user_id uuid, display_name text, email text, role text, is_you boolean)
language plpgsql stable security definer set search_path = '' as $$
declare ws uuid; r text := private.request_org();
begin
  if r is null or r !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return; end if;
  ws := r::uuid;
  if not private.is_staff(ws) then return; end if;
  return query
    select m.user_id, coalesce(p.display_name, 'Member ' || left(m.user_id::text, 4)),
           case when private.has_role(ws, 'admin') then p.email else null end,
           m.role, m.user_id = private.current_user_id()
      from public.memberships m left join public.profiles p on p.id = m.user_id
     where m.workspace_id = ws and m.kind = 'staff' and m.status = 'active'
     order by lower(coalesce(p.display_name, 'zz')), m.user_id;
end $$;
revoke all on function public.team_list() from public;
grant execute on function public.team_list() to app_user;
