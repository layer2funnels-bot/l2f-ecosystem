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
