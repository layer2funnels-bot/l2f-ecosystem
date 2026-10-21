set check_function_bodies = off;
-- 0007 · "Which organizations am I in?" for the organization switcher and the "no workspace yet" screen.
-- The request-scope policy (0005) hides every organization row when no organization is chosen, so this question needs
-- its own function. It only ever answers about the caller: their own active memberships, nothing about anyone else.
create or replace function public.my_organizations()
returns table (org_id uuid, name text, slug text, member_kind text, role text, is_active boolean)
language sql stable security definer set search_path = '' as $$
  select w.id, w.name, w.slug, m.kind, m.role,
         coalesce(p.active_workspace_id = w.id, false)
  from public.memberships m
  join public.workspaces w on w.id = m.workspace_id
  left join public.profiles p on p.id = m.user_id
  where m.user_id = private.current_user_id() and m.status = 'active'
  order by w.name
$$;
revoke all on function public.my_organizations() from public;
grant execute on function public.my_organizations() to app_user;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.my_organizations() to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.my_organizations() from anon;
  end if;
end $$;
