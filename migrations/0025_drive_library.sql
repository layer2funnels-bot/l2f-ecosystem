-- 0025 · Storage and Drive visibility are separate (owner decision, 23 Oct 2026; applies to every organization, Layer2Funnels and Aurj alike).
-- Every file is stored once, in the one storage layer, under its own organization's prefix (that rule is unchanged: private.drive_path_ok).
-- WHETHER it shows in the organization's main Drive is a separate setting: `in_library`.
--   * Drive (and Office > Documents) lists only the organization LIBRARY: documents and files created there, or intentionally added to it.
--   * A file that belongs to an app's own records (project documents and boards, client files, Client Portal, forms, whiteboards, social media,
--     funnel assets) carries `managed_by` = that app. It stays reachable through the owning app and its permissions, and never appears in
--     the Drive listing on its own. Adding it to the library is an explicit act (`drive.files.setLibrary`, needs drive.file.edit) and changes
--     only this flag: the bytes, the storage path and the backup are untouched.
--   * Client and personal files are never part of the shared library (they have their own spaces). Protected SOPs always are.
--   * Storage cap, backup/restore and permissions do not look at this flag; they work on the stored object and the record as before.
alter table public.files add column managed_by text check (managed_by in ('projects', 'clients', 'portal', 'whiteboard', 'forms', 'social_planner', 'value_ladder', 'funnels', 'planner'));
alter table public.files add column in_library boolean;

-- backfill with the same rule the guard applies to new rows
update public.files set managed_by = 'projects' where project_id is not null and managed_by is null;
update public.files set managed_by = 'whiteboard' where managed_by is null and mime_type = 'application/vnd.excalidraw+json';
update public.files set in_library = (space = 'shared' and managed_by is null) or protected_sop;
alter table public.files alter column in_library set not null;
alter table public.files add constraint files_library_shape check (not in_library or space = 'shared'),
  add constraint files_sop_in_library check (not protected_sop or in_library);
create index files_library on public.files (workspace_id, folder_id) where in_library and archived_at is null;

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
create trigger files_library_guard before insert or update on public.files for each row execute function private.files_library_guard();
revoke all on function private.files_library_guard() from public;

-- the audit of files also names the owning app and the library flag (names and flags, never content)
drop trigger audit_files on public.files;
create trigger audit_files after insert or update or delete on public.files
  for each row execute function private.audit_change('space', 'client_id', 'owner_id', 'folder_id', 'project_id', 'name', 'kind', 'protected_sop', 'sop_key', 'client_visible', 'archived_at', 'current_version', 'managed_by', 'in_library');
