-- 0024 · Context link for Drive documents (decision V4-4, 23 Oct 2026).
-- A whiteboard (and any document) can belong to a project: it then opens inside that project, with the project's breadcrumb, and is saved with it.
-- The link is a nullable `project_id` on `files`; there is no second table and no second storage path. The rules:
--   * the project must be in the same organization (composite foreign key);
--   * a file in a CLIENT's project lives in that client's own space (client files never appear in the shared Drive); a file in an INTERNAL project
--     (no client) lives in the shared space; the personal space never takes a project (private stays private);
--   * the link is fixed at creation ("records do not move");
--   * a person can read or write a context file only if they can also see the project (restrictive policy on top of the Drive rules), so nobody
--     gets at a document through a project they may not open. A client contact therefore sees a project file only when both the file and the
--     project were shared with them.
-- Plus optimistic concurrency for first-party documents is handled in the API (expected version), not here.

alter table public.files add column project_id uuid;
alter table public.files add constraint files_project_fk foreign key (workspace_id, project_id) references public.projects (workspace_id, id);
create index files_project on public.files (workspace_id, project_id) where project_id is not null and archived_at is null;

create or replace function private.files_context_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare pc uuid; found boolean := false;
begin
  if tg_op = 'UPDATE' and new.project_id is distinct from old.project_id then
    raise exception 'records do not move' using errcode = 'P0001';
  end if;
  if new.project_id is not null then
    select true, p.client_id into found, pc from public.projects p where p.workspace_id = new.workspace_id and p.id = new.project_id;
    if not coalesce(found, false) then raise exception 'that project is not here' using errcode = '23503'; end if;
    if new.space = 'personal' then raise exception 'a personal file cannot belong to a project' using errcode = 'P0001'; end if;
    if pc is distinct from new.client_id then
      raise exception 'a file in a project lives in the project''s own place: the client''s space for a client project, the shared Drive for an internal one' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger files_context_guard before insert or update on public.files for each row execute function private.files_context_guard();

create policy files_project_context on public.files as restrictive for all
  using (project_id is null or exists (select 1 from public.projects p where p.workspace_id = files.workspace_id and p.id = files.project_id))
  with check (project_id is null or exists (select 1 from public.projects p where p.workspace_id = files.workspace_id and p.id = files.project_id));

-- the audit of files now also names the project link (a reference, never content)
drop trigger audit_files on public.files;
create trigger audit_files after insert or update or delete on public.files
  for each row execute function private.audit_change('space', 'client_id', 'owner_id', 'folder_id', 'project_id', 'name', 'kind', 'protected_sop', 'sop_key', 'client_visible', 'archived_at', 'current_version');

-- like every private function: not executable by anyone but the table owner and the trigger machinery
revoke all on function private.files_context_guard() from public;
