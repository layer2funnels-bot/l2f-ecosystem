-- Rollback of 0061_drive_v8.sql. Moved/copied rows stay where they are now (a later move is data, not schema); stars, opens, presence and
-- attachment records are dropped (attachment bytes stay in storage). Pictures marked app-owned ('docs') go back to plain Drive files.
do $$ begin
  perform set_config('l2f.drive_transfer', 'on', true);
  update public.files set managed_by = null, in_library = (space = 'shared') where managed_by = 'docs';
  perform set_config('l2f.drive_transfer', '', true);
end $$;
alter table public.files drop constraint if exists files_managed_by_check;
alter table public.files add constraint files_managed_by_check check (managed_by in ('projects', 'clients', 'portal', 'whiteboard', 'forms', 'social_planner', 'value_ladder', 'funnels', 'planner'));
drop trigger if exists file_versions_thin on public.file_versions;
drop trigger if exists file_versions_assets on public.file_versions;
drop function if exists private.file_versions_assets();
drop function if exists private.file_versions_thin();
drop function if exists public.drive_transfer(uuid[], uuid[], text, uuid, boolean);
drop function if exists public.drive_transfer_preview(uuid[], uuid[]);
drop function if exists public.drive_reset_original(uuid, int);
drop function if exists public.drive_asset_register(uuid, text, text, text, bigint, int, int);
drop table if exists public.doc_asset_refs, public.doc_assets, public.drive_presence, public.drive_opens, public.drive_stars;
-- the guards as they were (0014 files_guard / drive_folders_guard, 0025 files_library_guard, 0046 file_versions_guard)
create or replace function private.drive_folders_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); pf public.drive_folders; depth int := 0; cur uuid;
begin
  if tg_op = 'INSERT' then
    if uid is not null then new.created_by := uid; end if;
  else
    if new.workspace_id is distinct from old.workspace_id or new.space is distinct from old.space or new.client_id is distinct from old.client_id
       or new.owner_id is distinct from old.owner_id or new.created_by is distinct from old.created_by then
      raise exception 'records do not move' using errcode = 'P0001';
    end if;
    new.updated_at := now();
  end if;
  if new.parent_id is not null then
    select * into pf from public.drive_folders f where f.workspace_id = new.workspace_id and f.id = new.parent_id;
    if pf.id is null or pf.space is distinct from new.space or pf.client_id is distinct from new.client_id or pf.owner_id is distinct from new.owner_id then
      raise exception 'that folder belongs somewhere else' using errcode = 'P0001';
    end if;
    if tg_op = 'UPDATE' then       -- no loops, and a sensible depth
      cur := new.parent_id;
      while cur is not null and depth < 20 loop
        if cur = new.id then raise exception 'a folder cannot go inside itself' using errcode = 'P0001'; end if;
        select f.parent_id into cur from public.drive_folders f where f.id = cur; depth := depth + 1;
      end loop;
    end if;
  end if;
  return new;
end $$;
create or replace function private.files_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); pf public.drive_folders; op boolean := false; ov boolean := false;
begin
  if tg_op = 'INSERT' then
    if uid is not null then new.uploaded_by := uid; end if;
    new.space := coalesce(new.space, case when new.client_id is not null then 'client' else 'shared' end);
    new.name := coalesce(new.name, 'Untitled');
    new.current_version := 1;
    if new.space = 'personal' and uid is not null then new.owner_id := coalesce(new.owner_id, uid); end if;
  else
    if new.workspace_id is distinct from old.workspace_id or new.space is distinct from old.space or new.client_id is distinct from old.client_id
       or new.owner_id is distinct from old.owner_id or new.uploaded_by is distinct from old.uploaded_by or new.kind is distinct from old.kind then
      raise exception 'records do not move' using errcode = 'P0001';
    end if;
    new.updated_at := now();
    op := old.protected_sop; ov := old.client_visible;
    -- protected SOP documents: only drive.sop.manage may change, archive or un-protect them
    if old.protected_sop and uid is not null and not private.has_permission(new.workspace_id, 'drive.sop.manage') then
      raise exception 'not found' using errcode = '42501';
    end if;
  end if;
  if new.protected_sop is distinct from op and uid is not null
     and not private.has_permission(new.workspace_id, 'drive.sop.manage') then
    raise exception 'not found' using errcode = '42501';
  end if;
  if not private.drive_path_ok(new.workspace_id, new.space, new.client_id, new.owner_id, new.storage_path) then
    raise exception 'that storage path is not allowed here' using errcode = 'P0001';
  end if;
  if new.folder_id is not null then
    select * into pf from public.drive_folders f where f.workspace_id = new.workspace_id and f.id = new.folder_id;
    if pf.id is null or pf.space is distinct from new.space or pf.client_id is distinct from new.client_id or pf.owner_id is distinct from new.owner_id then
      raise exception 'that folder belongs somewhere else' using errcode = 'P0001';
    end if;
  end if;
  if new.client_visible and new.space <> 'client' then raise exception 'only a client''s own files can be shared with the client' using errcode = 'P0001'; end if;
  if uid is not null and new.client_visible is distinct from ov
     and not private.has_permission(new.workspace_id, 'drive.file.share', new.client_id) then
    raise exception 'not found' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function private.files_library_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id();
begin
  if tg_op = 'INSERT' then
    if new.managed_by is null and new.project_id is not null then new.managed_by := 'projects'; end if;
    if new.in_library is null then new.in_library := (new.space = 'shared' and new.managed_by is null); end if;
  else
    if new.managed_by is distinct from old.managed_by then raise exception 'records do not move' using errcode = 'P0001'; end if;
    if new.protected_sop and not old.protected_sop then new.in_library := true; end if;          -- promoting a document to a protected SOP puts it in the library
    if new.in_library is distinct from old.in_library and uid is not null and not private.has_permission(new.workspace_id, 'drive.file.edit', new.client_id) then
      raise exception 'not found' using errcode = '42501';
    end if;
  end if;
  if new.protected_sop and new.in_library is not true then raise exception 'a protected SOP always stays in the library' using errcode = 'P0001'; end if;
  if new.in_library and new.space <> 'shared' then
    raise exception 'client and personal files are never part of the shared Drive library' using errcode = 'P0001';
  end if;
  return new;
end $$;
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
drop function if exists private.drive_transfer_on();
