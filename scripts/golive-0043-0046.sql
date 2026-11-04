-- LIVE database: apply 0043–0046 in ONE step (Client Portal tile for all staff; documents up to 1,000,000 characters; new versions of
-- stored files; Drive sharing, owner lock and folder passwords). Refuses any database that is not at exactly 0042. All or nothing.
begin;
do $guard$ begin
  if (select count(*) from public.workspaces where slug in ('layer2funnels', 'aurj')) <> 2 then raise exception 'unexpected database: Layer2Funnels and Aurj organizations not found'; end if;
  if (select max(version) from supabase_migrations.schema_migrations) <> '20261102120042' then raise exception 'unexpected database: last migration is not 0042_invitation_onboarding'; end if;
end $guard$;
set local check_function_bodies = off;
-- ====================================================================== 0043_portal_tile_for_all_staff.sql
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
-- ====================================================================== 0044_larger_documents.sql
-- 0044: first-party documents (Docs, Sheets, boards) may be up to 1,000,000 characters (was 200,000), so long formatted documents and
-- larger spreadsheets can be saved. Additive: the check only widens; no row changes.
alter table public.file_versions drop constraint file_versions_body_check;
alter table public.file_versions add constraint file_versions_body_check check (length(body) <= 1000000);
-- ====================================================================== 0045_file_version_storage_path.sql
-- 0045: a new version of a stored file (image or PDF edited in Drive) points at a new stored copy, so the file row's storage_path must follow the newest version.
-- The file_versions_after trigger already does `update files set storage_path = ...`, but the 0002 guard refused every storage_path change (so
-- drive.files.versions.add failed for stored files). The guard now lets the path change ONLY when the update comes from inside another trigger
-- (the version trigger, pg_trigger_depth() > 1); a direct UPDATE by a person or the API still cannot change workspace, path or uploader.
-- Idempotent (create or replace); no rows change.
create or replace function private.files_immutable_keys() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.workspace_id is distinct from old.workspace_id or new.uploaded_by is distinct from old.uploaded_by
     or (new.storage_path is distinct from old.storage_path and pg_trigger_depth() < 2) then
    raise exception 'file identity cannot change' using errcode = '42501';
  end if;
  return new;
end $$;
-- ====================================================================== 0046_drive_sharing_locks.sql
-- Drive: sharing with people and by link, owner locks, folder passwords (owner decision, Nov 2026).
-- Everything here is enforced in the database: row-level security on files and folders gets (a) extra PERMISSIVE policies that grant what a share grants and
-- (b) RESTRICTIVE gates that take away what a lock or an un-opened password takes away. A restrictive policy is ANDed with everything else, so no
-- permission, role, API operation or search can see past it. Only the organization owner (role = owner) bypasses a lock; nobody bypasses a password.
-- Shares, locks and passwords apply to the shared space only (personal files stay private to the person; client files are never shared with staff by this).

-- ------------------------------------------------------------------ owner check
create or replace function private.is_org_owner(ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m where m.workspace_id = ws and m.user_id = private.current_user_id()
                  and m.kind = 'staff' and m.role = 'owner' and m.status = 'active')
$$;

-- ------------------------------------------------------------------ columns and tables
alter table public.files add column locked_at timestamptz, add column locked_by uuid;
alter table public.drive_folders add column locked_at timestamptz, add column locked_by uuid;

-- password hashes, unlock grants and wrong-attempt log: row security on and NO policy, so only the functions below (security definer) can touch them
create table public.drive_folder_passwords (
  folder_id uuid primary key references public.drive_folders (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  hash text not null check (length(hash) between 20 and 400),
  set_by uuid, set_at timestamptz not null default now()
);
create table public.drive_unlocks (
  folder_id uuid not null references public.drive_folders (id) on delete cascade,
  user_id uuid not null,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  expires_at timestamptz not null,
  primary key (folder_id, user_id)
);
create table public.drive_unlock_attempts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  folder_id uuid not null references public.drive_folders (id) on delete cascade,
  user_id uuid not null, at timestamptz not null default now(), ok boolean not null
);
create index drive_unlock_attempts_recent on public.drive_unlock_attempts (folder_id, user_id, at desc);

create table public.drive_shares (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  file_id uuid, folder_id uuid,
  user_id uuid not null,
  role text not null check (role in ('viewer', 'editor')),
  link_id uuid references public.drive_share_links (id) on delete cascade,      -- set when the person got access by opening a share link
  expires_at timestamptz,
  created_by uuid, created_at timestamptz not null default now(),
  check (num_nonnulls(file_id, folder_id) = 1),
  foreign key (workspace_id, file_id) references public.files (workspace_id, id) on delete cascade,
  foreign key (workspace_id, folder_id) references public.drive_folders (workspace_id, id) on delete cascade,
  foreign key (workspace_id, user_id) references public.memberships (workspace_id, user_id) on delete cascade
);
create unique index drive_shares_file_user on public.drive_shares (workspace_id, file_id, user_id) where file_id is not null and link_id is null;
create unique index drive_shares_folder_user on public.drive_shares (workspace_id, folder_id, user_id) where folder_id is not null and link_id is null;
create unique index drive_shares_link_user on public.drive_shares (link_id, user_id) where link_id is not null;
create index drive_shares_user on public.drive_shares (workspace_id, user_id);

-- share links: a right (view / edit) and an optional expiry (up to a year)
alter table public.drive_share_links add column role text not null default 'viewer' check (role in ('viewer', 'editor'));
alter table public.drive_share_links alter column expires_at drop not null;
alter table public.drive_share_links drop constraint drive_share_links_check;
alter table public.drive_share_links add constraint drive_share_links_expiry check (expires_at is null or (expires_at > created_at and expires_at <= created_at + interval '366 days'));

-- ------------------------------------------------------------------ the folder chain (a folder and everything above it)
create or replace function private.drive_chain(ws uuid, p_start uuid) returns table (id uuid, locked_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with recursive up as (
    select d.id, d.parent_id, d.locked_at, 0 as depth from public.drive_folders d where d.workspace_id = ws and d.id = p_start
    union all
    select p.id, p.parent_id, p.locked_at, up.depth + 1 from public.drive_folders p join up on p.id = up.parent_id where p.workspace_id = ws and up.depth < 40)
  select up.id, up.locked_at from up
$$;
-- is anything in the chain locked (owner or not)?
create or replace function private.drive_chain_locked(ws uuid, p_start uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.drive_chain(ws, p_start) c where c.locked_at is not null)
$$;
-- the first folder in the chain whose password has not been entered by the current person (null = nothing blocks)
create or replace function private.drive_chain_password(ws uuid, p_start uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select c.id from private.drive_chain(ws, p_start) c
   where exists (select 1 from public.drive_folder_passwords w where w.folder_id = c.id)
     and not exists (select 1 from public.drive_unlocks u where u.folder_id = c.id and u.user_id = private.current_user_id() and u.expires_at > now())
   limit 1
$$;
-- THE gate: false when the item (or a folder above it) is locked and the person is not the owner, or sits inside a password folder not yet opened.
-- p_start is the folder the item lives in (for a folder row: its parent). Internal sessions without a person (migrations, backups) pass.
create or replace function private.drive_gate(ws uuid, p_own_locked boolean, p_start uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if private.current_user_id() is null then return true; end if;
  if (p_own_locked or (p_start is not null and private.drive_chain_locked(ws, p_start))) and not private.is_org_owner(ws) then return false; end if;
  if p_start is not null and private.drive_chain_password(ws, p_start) is not null then return false; end if;
  return true;
end $$;

-- ------------------------------------------------------------------ what a share grants (viewer < editor), looking at the item and every folder above it
create or replace function private.drive_share_role(ws uuid, p_file uuid, p_folder uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when bool_or(s.role = 'editor') then 'editor' when count(*) > 0 then 'viewer' end
    from public.drive_shares s
   where s.workspace_id = ws and s.user_id = private.current_user_id()
     and (s.expires_at is null or s.expires_at > now())
     and (s.link_id is null or exists (select 1 from public.drive_share_links l where l.id = s.link_id and l.revoked_at is null and (l.expires_at is null or l.expires_at > now())))
     and exists (select 1 from public.memberships m where m.workspace_id = ws and m.user_id = s.user_id and m.kind = 'staff' and m.status = 'active')
     and ((p_file is not null and s.file_id = p_file) or (s.folder_id is not null and s.folder_id in (select c.id from private.drive_chain(ws, p_folder) c)))
$$;

-- is this share still in force (not expired, its link neither revoked nor expired)? used for lists, so they match what the policies grant
create or replace function private.drive_share_live(p_share uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.drive_shares s where s.id = p_share and s.user_id = private.current_user_id() and (s.expires_at is null or s.expires_at > now())
    and (s.link_id is null or exists (select 1 from public.drive_share_links l where l.id = s.link_id and l.revoked_at is null and (l.expires_at is null or l.expires_at > now()))))
$$;

-- who may share an item: the owner, anyone with drive.file.share, or its creator; and only what they can read themselves, never a locked or protected one
create or replace function private.drive_can_share(ws uuid, p_file uuid, p_folder uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare f public.files; d public.drive_folders; uid uuid := private.current_user_id();
begin
  if uid is null or not private.org_in_scope(ws) then return false; end if;
  if p_file is not null then
    select * into f from public.files x where x.workspace_id = ws and x.id = p_file;
    if f.id is null or f.space <> 'shared' or f.protected_sop then return false; end if;
    return private.can_read_file(ws, f.space, f.client_id, f.owner_id, false, f.archived_at is not null) and private.drive_gate(ws, f.locked_at is not null, f.folder_id)
      and (private.is_org_owner(ws) or private.has_permission(ws, 'drive.file.share') or f.uploaded_by = uid);
  end if;
  select * into d from public.drive_folders x where x.workspace_id = ws and x.id = p_folder;
  if d.id is null or d.space <> 'shared' then return false; end if;
  return private.can_read_file(ws, d.space, d.client_id, d.owner_id, false, d.archived_at is not null) and private.drive_gate(ws, d.locked_at is not null, d.parent_id)
    and (private.is_org_owner(ws) or private.has_permission(ws, 'drive.file.share') or d.created_by = uid);
end $$;

-- ------------------------------------------------------------------ guards
create or replace function private.drive_lock_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.current_user_id() is null then return new; end if;
  if tg_op = 'INSERT' then new.locked_at := null; new.locked_by := null; return new; end if;
  if (new.locked_at is distinct from old.locked_at or new.locked_by is distinct from old.locked_by) and not private.is_org_owner(new.workspace_id) then
    raise exception 'not found' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger files_lock_guard before insert or update on public.files for each row execute function private.drive_lock_guard();
create trigger drive_folders_lock_guard before insert or update on public.drive_folders for each row execute function private.drive_lock_guard();

create or replace function private.drive_shares_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); sp text;
begin
  if tg_op = 'UPDATE' then
    if new.workspace_id is distinct from old.workspace_id or new.file_id is distinct from old.file_id or new.folder_id is distinct from old.folder_id or new.user_id is distinct from old.user_id
       or new.link_id is distinct from old.link_id or new.created_by is distinct from old.created_by then raise exception 'only the right can change' using errcode = 'P0001'; end if;
    return new;
  end if;
  if uid is not null then new.created_by := uid; end if;
  if not exists (select 1 from public.memberships m where m.workspace_id = new.workspace_id and m.user_id = new.user_id and m.kind = 'staff' and m.status = 'active') then
    raise exception 'only active team members can be given access' using errcode = 'P0001';
  end if;
  if new.user_id = uid and new.link_id is null then raise exception 'you already have access' using errcode = 'P0001'; end if;
  select x.space into sp from (select space from public.files where id = new.file_id union all select space from public.drive_folders where id = new.folder_id) x limit 1;
  if sp is distinct from 'shared' then raise exception 'only the shared library can be shared' using errcode = 'P0001'; end if;
  return new;
end $$;
create trigger drive_shares_guard before insert or update on public.drive_shares for each row execute function private.drive_shares_guard();

-- a link guard that knows rights, optional expiry, and the sharing rule above
create or replace function private.drive_links_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); f public.files;
begin
  if tg_op = 'INSERT' then
    select * into f from public.files x where x.workspace_id = new.workspace_id and x.id = new.file_id;
    if f.id is null then raise exception 'not found' using errcode = '42501'; end if;
    if f.space <> 'shared' or f.protected_sop or f.archived_at is not null then raise exception 'this file cannot be shared by link' using errcode = 'P0001'; end if;
    if uid is not null then
      new.created_by := uid;
      if not private.drive_can_share(new.workspace_id, new.file_id, null) then raise exception 'not found' using errcode = '42501'; end if;
    end if;
  else
    if new.workspace_id is distinct from old.workspace_id or new.file_id is distinct from old.file_id or new.token_hash is distinct from old.token_hash
       or new.expires_at is distinct from old.expires_at or new.created_by is distinct from old.created_by or new.role is distinct from old.role then
      raise exception 'a link can only be revoked' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
-- revoking a link takes back everything people got through it
create or replace function private.drive_links_revoked() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.revoked_at is not null and old.revoked_at is null then delete from public.drive_shares where link_id = new.id; end if;
  return new;
end $$;
create trigger drive_links_revoked after update on public.drive_share_links for each row execute function private.drive_links_revoked();

-- versions: a person with an Editor share may add one (everything else as before)
create or replace function private.file_versions_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); f public.files;
begin
  if tg_op <> 'INSERT' then raise exception 'versions are history and cannot change' using errcode = 'P0001'; end if;
  select * into f from public.files x where x.workspace_id = new.workspace_id and x.id = new.file_id;
  if f.id is null then raise exception 'not found' using errcode = '42501'; end if;
  if uid is not null then
    new.created_by := uid;
    if not (private.can_write_file(f.workspace_id, f.space, f.client_id, f.owner_id, f.uploaded_by, f.protected_sop)
            or (f.space = 'shared' and not f.protected_sop and coalesce(private.drive_share_role(f.workspace_id, f.id, f.folder_id) = 'editor', false))) then raise exception 'not found' using errcode = '42501'; end if;
  end if;
  if f.archived_at is not null then raise exception 'restore this file before adding a version' using errcode = 'P0001'; end if;
  if (f.kind = 'document') <> (new.body is not null) then raise exception 'a document keeps text, a file keeps a stored copy' using errcode = 'P0001'; end if;
  if not private.drive_path_ok(f.workspace_id, f.space, f.client_id, f.owner_id, new.storage_path) then raise exception 'that storage path is not allowed here' using errcode = 'P0001'; end if;
  new.version := coalesce((select max(v.version) from public.file_versions v where v.file_id = new.file_id), 0) + 1;
  return new;
end $$;

-- ------------------------------------------------------------------ policies
-- (a) restrictive gates: ANDed with every other policy
create policy drive_gate on public.files as restrictive for all
  using (private.drive_gate(workspace_id, locked_at is not null, folder_id)) with check (private.drive_gate(workspace_id, locked_at is not null, folder_id));
create policy drive_gate on public.drive_folders as restrictive for all
  using (private.drive_gate(workspace_id, locked_at is not null, parent_id)) with check (private.drive_gate(workspace_id, locked_at is not null, parent_id));
-- (b) what shares grant
create policy files_shared_select on public.files for select
  using (space = 'shared' and archived_at is null and private.drive_share_role(workspace_id, id, folder_id) is not null);
create policy files_shared_update on public.files for update
  using (space = 'shared' and archived_at is null and not protected_sop and private.drive_share_role(workspace_id, id, folder_id) = 'editor')
  with check (space = 'shared' and archived_at is null and not protected_sop and private.drive_share_role(workspace_id, id, folder_id) = 'editor');
create policy files_shared_insert on public.files for insert
  with check (uploaded_by = private.current_user_id() and space = 'shared' and not protected_sop and folder_id is not null and private.drive_share_role(workspace_id, null, folder_id) = 'editor');
create policy drive_folders_shared_select on public.drive_folders for select
  using (space = 'shared' and archived_at is null and private.drive_share_role(workspace_id, null, id) is not null);

-- shares and links: managed by whoever may share the item
alter table public.drive_shares enable row level security; alter table public.drive_shares force row level security;
create policy org_scope on public.drive_shares as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
create policy drive_shares_select on public.drive_shares for select using (user_id = private.current_user_id() or private.drive_can_share(workspace_id, file_id, folder_id));
create policy drive_shares_insert on public.drive_shares for insert with check (link_id is null and private.drive_can_share(workspace_id, file_id, folder_id));
create policy drive_shares_update on public.drive_shares for update using (link_id is null and private.drive_can_share(workspace_id, file_id, folder_id)) with check (link_id is null and private.drive_can_share(workspace_id, file_id, folder_id));
create policy drive_shares_delete on public.drive_shares for delete using (private.drive_can_share(workspace_id, file_id, folder_id));
drop policy drive_share_links_select on public.drive_share_links; drop policy drive_share_links_insert on public.drive_share_links; drop policy drive_share_links_update on public.drive_share_links;
create policy drive_share_links_select on public.drive_share_links for select using (private.drive_can_share(workspace_id, file_id, null));
create policy drive_share_links_insert on public.drive_share_links for insert with check (private.drive_can_share(workspace_id, file_id, null));
create policy drive_share_links_update on public.drive_share_links for update using (private.drive_can_share(workspace_id, file_id, null)) with check (private.drive_can_share(workspace_id, file_id, null));
-- the three secret tables have a policy that refuses everything: only the security-definer functions above can read or write them
create policy deny_all on public.drive_folder_passwords for all using (false) with check (false);
create policy deny_all on public.drive_unlocks for all using (false) with check (false);
create policy deny_all on public.drive_unlock_attempts for all using (false) with check (false);
alter table public.drive_folder_passwords enable row level security; alter table public.drive_folder_passwords force row level security;
alter table public.drive_unlocks enable row level security; alter table public.drive_unlocks force row level security;
alter table public.drive_unlock_attempts enable row level security; alter table public.drive_unlock_attempts force row level security;

create trigger audit_drive_shares after insert or update or delete on public.drive_shares
  for each row execute function private.audit_change('file_id', 'folder_id', 'user_id', 'role', 'link_id');

-- ------------------------------------------------------------------ locks (owner only)
create or replace function private.drive_set_lock(p_kind text, p_id uuid, p_lock boolean) returns table (id uuid, locked boolean)
language plpgsql security definer set search_path = '' as $$
declare ws uuid; uid uuid := private.current_user_id(); n int;
begin
  if p_kind = 'file' then select x.workspace_id into ws from public.files x where x.id = p_id;
  elsif p_kind = 'folder' then select x.workspace_id into ws from public.drive_folders x where x.id = p_id;
  else raise exception 'not found' using errcode = '42501'; end if;
  if ws is null or uid is null or not private.org_in_scope(ws) or not private.is_org_owner(ws) then raise exception 'not found' using errcode = '42501'; end if;
  if p_kind = 'file' then
    update public.files set locked_at = case when p_lock then now() end, locked_by = case when p_lock then uid end where files.id = p_id and space = 'shared' and not protected_sop;
  else
    update public.drive_folders set locked_at = case when p_lock then now() end, locked_by = case when p_lock then uid end where drive_folders.id = p_id and space = 'shared';
  end if;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'not found' using errcode = '42501'; end if;
  return query select p_id, p_lock;
end $$;

-- ------------------------------------------------------------------ folder passwords (the hash is made and checked by the API; the database keeps it, counts attempts and records grants)
create or replace function private.drive_folder_visible(d public.drive_folders) returns boolean
language sql stable security definer set search_path = '' as $$
  select d.id is not null and d.space = 'shared' and private.org_in_scope(d.workspace_id)
     and (private.can_read_file(d.workspace_id, d.space, d.client_id, d.owner_id, false, d.archived_at is not null) or private.drive_share_role(d.workspace_id, null, d.id) is not null)
     and private.drive_gate(d.workspace_id, d.locked_at is not null, d.parent_id)
$$;
create or replace function private.drive_folder_protection(p_id uuid) returns table (protected boolean, unlocked boolean, can_manage boolean)
language plpgsql stable security definer set search_path = '' as $$
declare d public.drive_folders;
begin
  select * into d from public.drive_folders x where x.id = p_id;
  if not private.drive_folder_visible(d) then raise exception 'not found' using errcode = '42501'; end if;
  return query select exists (select 1 from public.drive_folder_passwords w where w.folder_id = d.id),
    exists (select 1 from public.drive_unlocks u where u.folder_id = d.id and u.user_id = private.current_user_id() and u.expires_at > now()),
    (private.is_org_owner(d.workspace_id) or d.created_by = private.current_user_id());
end $$;
create or replace function private.drive_folder_has_password(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$ select exists (select 1 from public.drive_folder_passwords w where w.folder_id = p_id) $$;

create or replace function private.drive_unlock_begin(p_folder uuid) returns table (hash text, attempts_left int, retry_after_seconds int)
language plpgsql security definer set search_path = '' as $$
declare d public.drive_folders; uid uuid := private.current_user_id(); failures int; oldest timestamptz;
begin
  select * into d from public.drive_folders x where x.id = p_folder;
  if uid is null or not private.drive_folder_visible(d) then raise exception 'not found' using errcode = '42501'; end if;
  select count(*), min(a.at) into failures, oldest from public.drive_unlock_attempts a where a.folder_id = p_folder and a.user_id = uid and not a.ok and a.at > now() - interval '15 minutes';
  if failures >= 5 then return query select null::text, 0, greatest(1, ceil(extract(epoch from (oldest + interval '15 minutes' - now())))::int); return; end if;
  return query select w.hash, 5 - failures, 0 from public.drive_folder_passwords w where w.folder_id = p_folder;
end $$;
create or replace function private.drive_unlock_finish(p_folder uuid, p_ok boolean) returns table (unlocked boolean, attempts_left int, retry_after_seconds int)
language plpgsql security definer set search_path = '' as $$
declare d public.drive_folders; uid uuid := private.current_user_id(); failures int; oldest timestamptz;
begin
  select * into d from public.drive_folders x where x.id = p_folder;
  if uid is null or not private.drive_folder_visible(d) then raise exception 'not found' using errcode = '42501'; end if;
  insert into public.drive_unlock_attempts (workspace_id, folder_id, user_id, ok) values (d.workspace_id, p_folder, uid, p_ok);
  if p_ok then
    insert into public.drive_unlocks (folder_id, user_id, workspace_id, expires_at) values (p_folder, uid, d.workspace_id, now() + interval '12 hours')
      on conflict (folder_id, user_id) do update set expires_at = excluded.expires_at;
    delete from public.drive_unlock_attempts a where a.folder_id = p_folder and a.user_id = uid and not a.ok;
    return query select true, 5, 0; return;
  end if;
  select count(*), min(a.at) into failures, oldest from public.drive_unlock_attempts a where a.folder_id = p_folder and a.user_id = uid and not a.ok and a.at > now() - interval '15 minutes';
  return query select false, greatest(0, 5 - failures), case when failures >= 5 then greatest(1, ceil(extract(epoch from (oldest + interval '15 minutes' - now())))::int) else 0 end;
end $$;
-- set, change (p_hash = the new hash) or remove (p_hash = null) a password; the owner or the folder's creator; everyone has to enter it again afterwards (the setter is let in)
create or replace function private.drive_set_folder_password(p_folder uuid, p_hash text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare d public.drive_folders; uid uuid := private.current_user_id();
begin
  select * into d from public.drive_folders x where x.id = p_folder;
  if uid is null or not private.drive_folder_visible(d) or not (private.is_org_owner(d.workspace_id) or d.created_by = uid) then raise exception 'not found' using errcode = '42501'; end if;
  delete from public.drive_unlocks where folder_id = p_folder;
  delete from public.drive_unlock_attempts where folder_id = p_folder;
  if p_hash is null then delete from public.drive_folder_passwords where folder_id = p_folder; return false; end if;
  insert into public.drive_folder_passwords (folder_id, workspace_id, hash, set_by) values (p_folder, d.workspace_id, p_hash, uid)
    on conflict (folder_id) do update set hash = excluded.hash, set_by = excluded.set_by, set_at = now();
  insert into public.drive_unlocks (folder_id, user_id, workspace_id, expires_at) values (p_folder, uid, d.workspace_id, now() + interval '12 hours');
  return true;
end $$;

-- ------------------------------------------------------------------ opening a share link (a signed-in team member of the same organization)
-- The link turns into a normal share for that person, with the link's right and expiry; after that every existing check (RLS, versions, downloads) applies as usual.
create or replace function private.drive_link_open(p_token text) returns table (file_id uuid, role text, name text, kind text, mime_type text, protected_folder uuid)
language plpgsql security definer set search_path = '' as $$
declare l public.drive_share_links; f public.files; uid uuid := private.current_user_id(); h text; pw uuid;
begin
  if uid is null or p_token is null or length(p_token) < 32 or length(p_token) > 200 then return; end if;
  h := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  select * into l from public.drive_share_links x where x.token_hash = h and x.revoked_at is null and (x.expires_at is null or x.expires_at > now());
  if l.id is null or not private.org_in_scope(l.workspace_id) then return; end if;
  if not exists (select 1 from public.memberships m where m.workspace_id = l.workspace_id and m.user_id = uid and m.kind = 'staff' and m.status = 'active') then return; end if;
  select * into f from public.files x where x.id = l.file_id and x.workspace_id = l.workspace_id and x.space = 'shared' and not x.protected_sop and x.archived_at is null;
  if f.id is null then return; end if;
  if (f.locked_at is not null or private.drive_chain_locked(f.workspace_id, f.folder_id)) and not private.is_org_owner(f.workspace_id) then return; end if;
  pw := private.drive_chain_password(f.workspace_id, f.folder_id);
  if pw is not null then return query select null::uuid, null::text, null::text, null::text, null::text, pw; return; end if;
  insert into public.drive_shares (workspace_id, file_id, user_id, role, link_id, expires_at, created_by) values (l.workspace_id, l.file_id, uid, l.role, l.id, l.expires_at, l.created_by)
    on conflict (link_id, user_id) where link_id is not null do update set role = excluded.role, expires_at = excluded.expires_at;
  update public.drive_share_links set use_count = use_count + 1, last_used_at = now() where id = l.id;
  return query select f.id, l.role, f.name, f.kind, f.mime_type, null::uuid;
end $$;

-- the prepared token resolver learns optional expiry and never opens a locked or password-protected item
create or replace function public.drive_link_resolve(p_token text)
returns table (file_id uuid, name text, kind text, mime_type text, size_bytes bigint, version int, storage_path text, body text)
language plpgsql security definer set search_path = '' as $$
declare l public.drive_share_links; h text;
begin
  if p_token is null or length(p_token) < 32 or length(p_token) > 200 then return; end if;
  h := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  select * into l from public.drive_share_links x where x.token_hash = h and x.revoked_at is null and (x.expires_at is null or x.expires_at > now());
  if l.id is null then return; end if;
  update public.drive_share_links set use_count = use_count + 1, last_used_at = now() where id = l.id;
  return query
    select f.id, f.name, f.kind, f.mime_type, f.size_bytes, f.current_version, v.storage_path, v.body
      from public.files f join public.file_versions v on v.file_id = f.id and v.version = f.current_version
     where f.id = l.file_id and f.space = 'shared' and not f.protected_sop and f.archived_at is null and f.locked_at is null
       and not private.drive_chain_locked(f.workspace_id, f.folder_id) and not exists (select 1 from private.drive_chain(f.workspace_id, f.folder_id) c join public.drive_folder_passwords w on w.folder_id = c.id);
end $$;

-- ------------------------------------------------------------------ grants
revoke all on all functions in schema private from public;
revoke all on function public.drive_link_resolve(text) from public;
grant select, insert, update, delete on public.drive_shares to app_user;
grant execute on function public.drive_link_resolve(text) to app_user;
grant execute on function private.is_org_owner(uuid), private.drive_chain(uuid, uuid), private.drive_chain_locked(uuid, uuid), private.drive_chain_password(uuid, uuid),
  private.drive_gate(uuid, boolean, uuid), private.drive_share_role(uuid, uuid, uuid), private.drive_can_share(uuid, uuid, uuid), private.drive_share_live(uuid), private.drive_set_lock(text, uuid, boolean),
  private.drive_folder_visible(public.drive_folders), private.drive_folder_protection(uuid), private.drive_folder_has_password(uuid), private.drive_unlock_begin(uuid),
  private.drive_unlock_finish(uuid, boolean), private.drive_set_folder_password(uuid, text), private.drive_link_open(text) to app_user;
insert into supabase_migrations.schema_migrations (version, name) values ('20261102120043', '0043_portal_tile_for_all_staff'), ('20261103120044', '0044_larger_documents'), ('20261104120045', '0045_file_version_storage_path'), ('20261105120046', '0046_drive_sharing_locks');
commit;
