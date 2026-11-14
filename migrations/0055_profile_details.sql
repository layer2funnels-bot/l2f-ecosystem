-- 0055 · Your profile, V8 (02 §7 "Profile": full name, display name, job title, time zone, about).
-- display_name (0012/0041) stays the name shown everywhere; the new columns are optional and belong to the person only.
-- Each person reads and changes only their own row (no person argument). Teammates already see profiles in their own
-- organization through the existing profiles policy (audit F8), which is the V8 rule: "shown to the people you work with".
-- Additive and reversible: drop the two functions and the four columns.

alter table public.profiles
  add column if not exists full_name text check (full_name is null or length(full_name) between 1 and 120),
  add column if not exists job_title text check (job_title is null or length(job_title) between 1 and 80),
  add column if not exists time_zone text check (time_zone is null or (length(time_zone) <= 64 and time_zone ~ '^[A-Za-z]+(/[A-Za-z0-9_+-]+){0,2}$')),
  add column if not exists about text check (about is null or length(about) between 1 and 600);

create or replace function public.profile_details()
returns table (full_name text, job_title text, time_zone text, about text)
language sql stable security definer set search_path = '' as $$
  select p.full_name, p.job_title, p.time_zone, p.about from public.profiles p where p.id = private.current_user_id()
$$;

-- an empty value clears the field; null leaves it as it is
create or replace function public.profile_details_set(p_full_name text default null, p_job_title text default null, p_time_zone text default null, p_about text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id();
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_time_zone is not null and btrim(p_time_zone) <> '' and not exists (select 1 from pg_catalog.pg_timezone_names where name = btrim(p_time_zone)) then
    raise exception 'unknown time zone' using errcode = '22023';
  end if;
  insert into public.profiles (id, email) values (uid, private.current_user_email()) on conflict (id) do nothing;
  update public.profiles set
    full_name = case when p_full_name is null then full_name else nullif(left(btrim(p_full_name), 120), '') end,
    job_title = case when p_job_title is null then job_title else nullif(left(btrim(p_job_title), 80), '') end,
    time_zone = case when p_time_zone is null then time_zone else nullif(btrim(p_time_zone), '') end,
    about     = case when p_about is null then about else nullif(left(btrim(p_about), 600), '') end
  where id = uid;
end $$;

revoke all on function public.profile_details(), public.profile_details_set(text, text, text, text) from public;
grant execute on function public.profile_details(), public.profile_details_set(text, text, text, text) to app_user;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on function public.profile_details() from %I', r);
      execute format('revoke all on function public.profile_details_set(text, text, text, text) from %I', r);
    end if;
  end loop;
end $$;
