set check_function_bodies = off;
-- 0016 · Who is calling: staff or client. The API uses this to keep every staff operation away from client accounts (gate G2, deny by default).
-- A client account may only call operations that are marked for clients (the Portal family); everything else answers "not found" before any
-- query runs. This is a second wall behind row security, not a replacement: row security still decides every row.
create or replace function public.my_audience(p_org uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.memberships m where m.workspace_id = p_org and m.user_id = private.current_user_id() and m.kind = 'staff' and m.status = 'active') then 'staff'
    when exists (select 1 from public.memberships m where m.workspace_id = p_org and m.user_id = private.current_user_id() and m.kind = 'client' and m.status = 'active') then 'client'
    else null end
$$;
revoke all on function public.my_audience(uuid) from public;
grant execute on function public.my_audience(uuid) to app_user;
