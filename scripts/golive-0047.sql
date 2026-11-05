-- LIVE database: apply 0047 (public share links). Refuses any database that is not at exactly 0046. All or nothing.
-- Run in the Supabase SQL editor (or psql) AFTER 0043-0046 are live; then deploy the app (the public endpoint and viewer page).
begin;
do $guard$ begin
  if (select count(*) from public.workspaces where slug in ('layer2funnels', 'aurj')) <> 2 then raise exception 'unexpected database: Layer2Funnels and Aurj organizations not found'; end if;
  if (select max(version) from supabase_migrations.schema_migrations) <> '20261105120046' then raise exception 'unexpected database: last migration is not 0046_drive_sharing_locks'; end if;
end $guard$;
set local check_function_bodies = off;
-- ====================================================================== 0047_drive_public_links.sql
-- Drive: public share links ("anyone with the link can view", owner decision Nov 2026). Additive.
-- A public link is a share link whose audience is 'public': view only, optional expiry, revocable, token stored hashed, uses counted.
-- It is resolved by ONE dedicated security-definer function that the unauthenticated endpoint calls; the function returns only the file name, kind,
-- type, size, which brand to show and the newest version's text or stored path. It refuses locked items (and anything inside a locked folder), anything inside
-- a password-protected folder (a public visitor can never unlock), archived files, protected SOPs, whiteboards, and everything outside the shared library
-- (personal and client files). Team links (signed-in members, view or edit) work exactly as before.

alter table public.drive_share_links add column audience text not null default 'team' check (audience in ('team', 'public'));
alter table public.drive_share_links add constraint drive_share_links_public_view_only check (audience = 'team' or role = 'viewer');

-- audience is fixed when the link is made
create or replace function private.drive_links_audience_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.audience is distinct from old.audience then raise exception 'a link can only be revoked' using errcode = 'P0001'; end if;
  return new;
end $$;
revoke all on function private.drive_links_audience_guard() from public;
create trigger drive_links_audience_guard before insert or update on public.drive_share_links for each row execute function private.drive_links_audience_guard();

create or replace function private.drive_public_resolve(p_token text)
returns table (file_id uuid, name text, kind text, mime_type text, size_bytes bigint, version int, storage_path text, body text, brand text)
language plpgsql security definer set search_path = '' as $$
declare l public.drive_share_links; h text;
begin
  if p_token is null or length(p_token) < 32 or length(p_token) > 200 then return; end if;
  h := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  select * into l from public.drive_share_links x
   where x.token_hash = h and x.audience = 'public' and x.role = 'viewer' and x.revoked_at is null and (x.expires_at is null or x.expires_at > now());
  if l.id is null then return; end if;
  -- everything below must hold, otherwise the answer is empty (the caller shows the same "not found" for every reason)
  if not exists (
    select 1 from public.files f
     where f.id = l.file_id and f.workspace_id = l.workspace_id and f.space = 'shared' and not f.protected_sop and f.archived_at is null and f.locked_at is null
       and f.mime_type is distinct from 'application/vnd.excalidraw+json'
       and not private.drive_chain_locked(f.workspace_id, f.folder_id)
       and not exists (select 1 from private.drive_chain(f.workspace_id, f.folder_id) c join public.drive_folder_passwords w on w.folder_id = c.id)) then return; end if;
  update public.drive_share_links set use_count = use_count + 1, last_used_at = now() where id = l.id;
  return query
    select f.id, f.name, f.kind, f.mime_type, f.size_bytes, f.current_version, v.storage_path, v.body, case when w.slug = 'aurj' then 'aurj' else 'l2f' end
      from public.files f join public.file_versions v on v.file_id = f.id and v.version = f.current_version join public.workspaces w on w.id = f.workspace_id
     where f.id = l.file_id;
end $$;
revoke all on function private.drive_public_resolve(text) from public;
grant execute on function private.drive_public_resolve(text) to app_user;
insert into supabase_migrations.schema_migrations (version, name) values ('20261106120047', '0047_drive_public_links');
commit;
