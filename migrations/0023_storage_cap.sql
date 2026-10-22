set check_function_bodies = off;
-- 0023 · Hard storage cap and usage counter. The application (not the storage provider) refuses to register a stored file once the total of
-- ALL stored file versions, across every organization, would pass the cap (default 8,000,000,000 bytes, below the 10 GB free allowance of
-- the planned storage service so a counting error cannot cost money). Documents kept as text in the database are not counted here.
-- The check lives in the database so no route can skip it; inserts are serialized (advisory lock) so two uploads cannot both slip under.

create table public.storage_settings (
  singleton boolean primary key default true check (singleton),
  cap_bytes bigint not null default 8000000000 check (cap_bytes between 0 and 10000000000000),
  updated_at timestamptz not null default now()
);
insert into public.storage_settings (singleton) values (true);
alter table public.storage_settings enable row level security; alter table public.storage_settings force row level security;
create policy storage_settings_select on public.storage_settings for select using (exists (select 1 from public.memberships m where m.user_id = private.current_user_id() and m.kind = 'staff' and m.status = 'active'));
-- no insert, update or delete policy: the cap is changed by the platform owner in SQL, never from the app

create or replace function private.storage_used_bytes() returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(size_bytes), 0)::bigint from public.file_versions where storage_path is not null
$$;

create or replace function private.file_versions_cap() returns trigger
language plpgsql security definer set search_path = '' as $$
declare cap bigint; used bigint;
begin
  if new.storage_path is null then return new; end if;
  if new.size_bytes is null then raise exception 'a stored file needs its size' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(7230001);                      -- one registration at a time
  select s.cap_bytes into cap from public.storage_settings s;
  used := private.storage_used_bytes();
  if used + coalesce(new.size_bytes, 0) > cap then
    raise exception 'storage limit reached' using errcode = 'P0001', hint = 'storage_limit';
  end if;
  return new;
end $$;
create trigger file_versions_cap before insert on public.file_versions for each row execute function private.file_versions_cap();

-- what an organization admin sees in Admin: the whole application's use against the cap, and this organization's share
create or replace function public.storage_usage()
returns table (total_bytes bigint, cap_bytes bigint, org_bytes bigint, files int, versions int, by_space jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare r text := private.request_org(); ws uuid;
begin
  if r is null or r !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return; end if;
  ws := r::uuid;
  if not private.has_role(ws, 'admin') then return; end if;
  return query select private.storage_used_bytes(), (select s.cap_bytes from public.storage_settings s),
    coalesce((select sum(v.size_bytes) from public.file_versions v where v.workspace_id = ws and v.storage_path is not null), 0)::bigint,
    (select count(*)::int from public.files f where f.workspace_id = ws and f.kind = 'file'),
    (select count(*)::int from public.file_versions v where v.workspace_id = ws and v.storage_path is not null),
    coalesce((select jsonb_object_agg(x.space, x.bytes) from (select f.space, sum(v.size_bytes)::bigint as bytes from public.file_versions v join public.files f on f.id = v.file_id where v.workspace_id = ws and v.storage_path is not null group by f.space) x), '{}'::jsonb);
end $$;
revoke all on function public.storage_usage() from public;
grant execute on function public.storage_usage() to app_user;

revoke all on all functions in schema private from public;
grant select on public.storage_settings to app_user;
grant execute on function private.storage_used_bytes() to app_user;   -- the API checks room before it signs an upload
