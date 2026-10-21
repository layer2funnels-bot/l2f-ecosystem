-- Production hardening.
--
-- 1. Workspace membership is invite-only at the database level, not just because sign-up is switched off:
--    - the very first account becomes the (active) admin;
--    - invited accounts become active when the invite is sent (Supabase sets auth.users.invited_at in a
--      separate UPDATE after creating the user, hence the second trigger);
--    - any other new account (e.g. created by hand in the dashboard, or a self sign-up if sign-ups were ever
--      switched on by mistake) starts with NO access until an admin activates it in Settings → Team.
-- 2. Explicit table privileges, so the app never depends on a project's default grants. RLS still decides rows.

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  first_account boolean := not exists (select 1 from public.profiles where role = 'admin');
begin
  insert into public.profiles (id, full_name, email, role, active)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), coalesce(new.email, ''),
          case when first_account then 'admin' else 'member' end,
          first_account or new.invited_at is not null)
  on conflict (id) do nothing;
  return new;
end $$;

create or replace function public.handle_user_invited() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.invited_at is null and new.invited_at is not null then
    update public.profiles set active = true where id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_invited on auth.users;
create trigger on_auth_user_invited after update of invited_at on auth.users
  for each row execute function public.handle_user_invited();

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
