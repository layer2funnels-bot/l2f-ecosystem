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
