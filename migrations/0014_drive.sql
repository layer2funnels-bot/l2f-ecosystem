set check_function_bodies = off;
-- 0014 · Drive data layer (Phase 5, data and API only; the screens come with their own design).
-- Spaces:  shared   the organization's curated Drive (folders, files, first-party documents, protected SOPs)
--          personal one person's own space: owner-only, an admin may open it only by "break-glass" (reason, log, notice to the owner)
--          client   a client's own file workspace; owned by the Clients app and NEVER listed in the shared Drive (owner decision, Clients spec 22 Oct)
-- Rules as everywhere: one organization per row, the shared permission engine, audited without content, archive (trash) before delete,
-- composite keys, storage paths that start with the organization (and name the space), Data API roles have no access (0010).
-- Real file bytes live in storage that is NOT switched on here: this layer records metadata and versions; the signed-URL module
-- (packages/core/storage.mjs) is prepared and tested with a fake client only.

-- ------------------------------------------------------------------ permissions (app: drive)
insert into public.permissions (key, app_key, description, floor_role, default_role, scopes, sensitive) values
  ('drive.folder.manage',          'drive', 'Create, rename, move and archive folders',                           'editor', 'editor', '{workspace,client}', false),
  ('drive.file.edit',              'drive', 'Rename, move and add versions to files uploaded by others',          'editor', 'editor', '{workspace,client}', false),
  ('drive.sop.manage',             'drive', 'Create, edit, archive or delete protected SOP documents',            'admin',  'owner',  '{workspace}', true),
  ('drive.personal.break_glass',   'drive', 'Open another person''s personal space (reason, log and notice)',      'owner',  'owner',  '{workspace}', true);

-- ------------------------------------------------------------------ folders
create table public.drive_folders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  space text not null check (space in ('shared', 'personal', 'client')),
  client_id uuid,
  owner_id uuid,
  parent_id uuid,
  name text not null check (length(name) between 1 and 200) check (name !~ '[/\\]'),
  archived_at timestamptz,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  check ((space = 'shared' and client_id is null and owner_id is null)
      or (space = 'client' and client_id is not null and owner_id is null)
      or (space = 'personal' and client_id is null and owner_id is not null)),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id),
  foreign key (workspace_id, owner_id) references public.memberships (workspace_id, user_id),
  foreign key (workspace_id, parent_id) references public.drive_folders (workspace_id, id)
);
create unique index drive_folders_unique_name on public.drive_folders
  (workspace_id, space, coalesce(client_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid),
   coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name)) where archived_at is null;
create index drive_folders_parent on public.drive_folders (workspace_id, parent_id) where archived_at is null;

-- ------------------------------------------------------------------ files: extend the table from 0001
alter table public.files
  add column space text not null default 'shared' check (space in ('shared', 'personal', 'client')),
  add column owner_id uuid,
  add column folder_id uuid,
  add column name text not null default 'Untitled' check (length(name) between 1 and 200) check (name !~ '[/\\]'),
  add column kind text not null default 'file' check (kind in ('file', 'document')),
  add column mime_type text check (length(mime_type) <= 120),
  add column size_bytes bigint check (size_bytes between 0 and 5368709120),
  add column current_version int not null default 1,
  add column protected_sop boolean not null default false,
  add column sop_key text check (sop_key ~ '^[a-z][a-z0-9_]{1,40}$'),
  add column archived_at timestamptz,
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now();
alter table public.files alter column name drop default;
alter table public.files alter column space drop default;                            -- the guard picks it (a client's file is a client file) when the insert does not say
alter table public.files alter column storage_path drop not null;                    -- first-party documents have no stored file
update public.files set space = 'client' where client_id is not null;
alter table public.files
  add constraint files_space_shape check ((space = 'shared' and client_id is null and owner_id is null)
      or (space = 'client' and client_id is not null and owner_id is null)
      or (space = 'personal' and client_id is null and owner_id is not null)),
  add constraint files_kind_path check ((kind = 'file' and storage_path is not null) or (kind = 'document' and storage_path is null)),
  add constraint files_sop_shape check ((not protected_sop and sop_key is null) or (protected_sop and space = 'shared' and kind = 'document')),
  add foreign key (workspace_id, owner_id) references public.memberships (workspace_id, user_id),
  add foreign key (workspace_id, folder_id) references public.drive_folders (workspace_id, id);
create unique index files_sop_key on public.files (workspace_id, sop_key) where sop_key is not null and archived_at is null;
create index files_folder on public.files (workspace_id, space, folder_id) where archived_at is null;
create index files_owner on public.files (workspace_id, owner_id) where space = 'personal';

-- ------------------------------------------------------------------ versions (immutable)
create table public.file_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  file_id uuid not null,
  version int not null check (version >= 1),
  storage_path text,
  body text check (length(body) <= 200000),            -- first-party documents keep their text here
  size_bytes bigint check (size_bytes between 0 and 5368709120),
  note text check (length(note) <= 300),
  created_by uuid, created_at timestamptz not null default now(),
  unique (file_id, version),
  check ((storage_path is not null) <> (body is not null)),
  foreign key (workspace_id, file_id) references public.files (workspace_id, id) on delete cascade
);
create index file_versions_file on public.file_versions (workspace_id, file_id, version desc);

-- ------------------------------------------------------------------ share links (by token; only the hash is stored)
create table public.drive_share_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  file_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  use_count int not null default 0,
  last_used_at timestamptz,
  created_by uuid, created_at timestamptz not null default now(),
  check (expires_at > created_at and expires_at <= created_at + interval '31 days'),
  foreign key (workspace_id, file_id) references public.files (workspace_id, id) on delete cascade
);
create index drive_share_links_file on public.drive_share_links (workspace_id, file_id);

-- ------------------------------------------------------------------ break-glass log and notices to the owner of a personal space
create table public.drive_break_glass (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  accessed_by uuid not null,
  owner_id uuid not null,
  reason text not null check (length(reason) between 10 and 500),
  files_seen int not null default 0,
  accessed_at timestamptz not null default now(),
  foreign key (workspace_id, accessed_by) references public.memberships (workspace_id, user_id),
  foreign key (workspace_id, owner_id) references public.memberships (workspace_id, user_id)
);
create table public.drive_notices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null,
  kind text not null check (kind in ('personal_space_opened')),
  break_glass_id uuid references public.drive_break_glass (id),
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  foreign key (workspace_id, user_id) references public.memberships (workspace_id, user_id)
);
create index drive_notices_user on public.drive_notices (workspace_id, user_id, created_at desc);

-- ------------------------------------------------------------------ who may read / write a file (one definition, used by every policy)
create or replace function private.can_read_file(ws uuid, p_space text, p_client uuid, p_owner uuid, p_client_visible boolean, p_archived boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select case p_space
    when 'personal' then p_owner = private.current_user_id() and private.can_use_app(ws, 'drive')
    when 'shared'   then private.has_permission(ws, 'drive.file.view')
    else (private.has_permission(ws, 'drive.file.view', p_client) and private.has_permission(ws, 'clients.client.view', p_client))
         or (p_client_visible and not p_archived and private.client_of(ws, p_client)) end
$$;
create or replace function private.can_write_file(ws uuid, p_space text, p_client uuid, p_owner uuid, p_uploaded_by uuid, p_protected boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when p_protected then private.has_permission(ws, 'drive.sop.manage')
    when p_space = 'personal' then p_owner = private.current_user_id() and private.can_use_app(ws, 'drive')
    else private.has_permission(ws, 'drive.file.delete_any')
      or private.has_permission(ws, 'drive.file.edit', p_client)
      or (p_uploaded_by = private.current_user_id() and private.has_permission(ws, 'drive.file.upload', p_client)) end
$$;

-- Deleting is narrower than editing: administrators with drive.file.delete_any, or the uploader; never "anyone who may edit".
create or replace function private.can_delete_file(ws uuid, p_space text, p_client uuid, p_owner uuid, p_uploaded_by uuid, p_protected boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when p_protected then private.has_permission(ws, 'drive.sop.manage')
    when p_space = 'personal' then p_owner = private.current_user_id() and private.can_use_app(ws, 'drive')
    else private.has_permission(ws, 'drive.file.delete_any') or (p_uploaded_by = private.current_user_id() and private.has_permission(ws, 'drive.file.upload', p_client)) end
$$;

-- ------------------------------------------------------------------ guards
create or replace function private.drive_path_ok(ws uuid, p_space text, p_client uuid, p_owner uuid, p_path text) returns boolean
language sql immutable set search_path = '' as $$
  select p_path is null or (not p_path like '%..%' and length(p_path) <= 600 and case p_space
    when 'personal' then starts_with(p_path, ws::text || '/personal/' || p_owner::text || '/')
    when 'client'   then starts_with(p_path, ws::text || '/clients/' || p_client::text || '/')
    else starts_with(p_path, ws::text || '/') and not starts_with(p_path, ws::text || '/personal/') and not starts_with(p_path, ws::text || '/clients/') end)   -- new files use ws/shared/; older paths (ws/...) stay valid
$$;

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
create trigger drive_folders_guard before insert or update on public.drive_folders for each row execute function private.drive_folders_guard();

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
create trigger files_guard before insert or update on public.files for each row execute function private.files_guard();

-- Versions: numbered by the database, immutable, and the file's "current version" follows.
create or replace function private.file_versions_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); f public.files;
begin
  if tg_op <> 'INSERT' then raise exception 'versions are history and cannot change' using errcode = 'P0001'; end if;
  select * into f from public.files x where x.workspace_id = new.workspace_id and x.id = new.file_id;
  if f.id is null then raise exception 'not found' using errcode = '42501'; end if;
  if uid is not null then
    new.created_by := uid;
    if not private.can_write_file(f.workspace_id, f.space, f.client_id, f.owner_id, f.uploaded_by, f.protected_sop) then raise exception 'not found' using errcode = '42501'; end if;
  end if;
  if f.archived_at is not null then raise exception 'restore this file before adding a version' using errcode = 'P0001'; end if;
  if (f.kind = 'document') <> (new.body is not null) then raise exception 'a document keeps text, a file keeps a stored copy' using errcode = 'P0001'; end if;
  if not private.drive_path_ok(f.workspace_id, f.space, f.client_id, f.owner_id, new.storage_path) then raise exception 'that storage path is not allowed here' using errcode = 'P0001'; end if;
  new.version := coalesce((select max(v.version) from public.file_versions v where v.file_id = new.file_id), 0) + 1;
  return new;
end $$;
create trigger file_versions_guard before insert or update on public.file_versions for each row execute function private.file_versions_guard();
create or replace function private.file_versions_after() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.files set current_version = new.version, storage_path = coalesce(new.storage_path, storage_path), size_bytes = new.size_bytes, updated_at = now()
   where workspace_id = new.workspace_id and id = new.file_id;
  return new;
end $$;
create trigger file_versions_after after insert on public.file_versions for each row execute function private.file_versions_after();

-- A file's first version is created with it, so every file has version 1 (the body or path arrives with the insert via these session settings).
-- Callers add the first version explicitly through drive.files.create; nothing is implied here.

-- Share links: only for files in the shared space that are not protected or archived, never longer than 31 days.
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
      if not private.has_permission(new.workspace_id, 'drive.file.share') then raise exception 'not found' using errcode = '42501'; end if;
    end if;
  else
    if new.workspace_id is distinct from old.workspace_id or new.file_id is distinct from old.file_id or new.token_hash is distinct from old.token_hash
       or new.expires_at is distinct from old.expires_at or new.created_by is distinct from old.created_by then
      raise exception 'a link can only be revoked' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger drive_links_guard before insert or update on public.drive_share_links for each row execute function private.drive_links_guard();

-- Archive (trash) before delete; folders also refuse while they still hold anything.
create trigger drive_folders_refuse_delete before delete on public.drive_folders for each row execute function private.archive_before_delete();
create trigger files_refuse_delete before delete on public.files for each row execute function private.archive_before_delete();
create or replace function private.drive_folder_empty() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.files where folder_id = old.id) or exists (select 1 from public.drive_folders where parent_id = old.id) then
    raise exception 'empty this folder first' using errcode = 'P0001';
  end if;
  return old;
end $$;
create trigger drive_folders_empty before delete on public.drive_folders for each row execute function private.drive_folder_empty();

-- ------------------------------------------------------------------ policies
do $$
declare t text;
begin
  foreach t in array array['drive_folders', 'file_versions', 'drive_share_links', 'drive_break_glass', 'drive_notices'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('create policy org_scope on public.%I as restrictive for all
      using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id))', t);
  end loop;
end $$;

drop policy files_select on public.files;  drop policy files_insert on public.files;
drop policy files_update on public.files;  drop policy files_delete on public.files;
create policy files_select on public.files for select using (private.can_read_file(workspace_id, space, client_id, owner_id, client_visible, archived_at is not null));
create policy files_insert on public.files for insert with check (
  uploaded_by = private.current_user_id() and not protected_sop and (
    (space = 'shared'   and private.has_permission(workspace_id, 'drive.file.upload'))
 or (space = 'client'   and private.has_permission(workspace_id, 'drive.file.upload', client_id) and private.has_permission(workspace_id, 'clients.client.view', client_id))
 or (space = 'personal' and owner_id = private.current_user_id() and private.can_use_app(workspace_id, 'drive'))));
create policy files_update on public.files for update
  using (private.can_read_file(workspace_id, space, client_id, owner_id, false, archived_at is not null) and private.can_write_file(workspace_id, space, client_id, owner_id, uploaded_by, protected_sop))
  with check (private.can_write_file(workspace_id, space, client_id, owner_id, uploaded_by, protected_sop));
create policy files_delete on public.files for delete using (
  private.can_read_file(workspace_id, space, client_id, owner_id, false, archived_at is not null)
  and private.can_delete_file(workspace_id, space, client_id, owner_id, uploaded_by, protected_sop));

-- Protected SOP documents are created by promoting a shared document: the insert policy refuses protected_sop, the update path requires drive.sop.manage (guard).

create policy drive_folders_select on public.drive_folders for select using (private.can_read_file(workspace_id, space, client_id, owner_id, false, false));
create policy drive_folders_insert on public.drive_folders for insert with check (
  (space = 'shared'   and private.has_permission(workspace_id, 'drive.folder.manage'))
 or (space = 'client' and private.has_permission(workspace_id, 'drive.folder.manage', client_id) and private.has_permission(workspace_id, 'clients.client.view', client_id))
 or (space = 'personal' and owner_id = private.current_user_id() and private.can_use_app(workspace_id, 'drive')));
create policy drive_folders_update on public.drive_folders for update
  using (private.can_read_file(workspace_id, space, client_id, owner_id, false, false) and (
    (space = 'personal' and owner_id = private.current_user_id()) or (space <> 'personal' and private.has_permission(workspace_id, 'drive.folder.manage', client_id))))
  with check ((space = 'personal' and owner_id = private.current_user_id()) or (space <> 'personal' and private.has_permission(workspace_id, 'drive.folder.manage', client_id)));
create policy drive_folders_delete on public.drive_folders for delete using (
  (space = 'personal' and owner_id = private.current_user_id()) or (space <> 'personal' and private.has_permission(workspace_id, 'drive.folder.manage', client_id) and private.has_permission(workspace_id, 'drive.file.delete_any')));

-- versions follow their file: readable where the file is readable; added where the file may be written (the guard checks again)
create policy file_versions_select on public.file_versions for select using (exists (select 1 from public.files f where f.workspace_id = file_versions.workspace_id and f.id = file_versions.file_id));
create policy file_versions_insert on public.file_versions for insert with check (exists (select 1 from public.files f where f.workspace_id = file_versions.workspace_id and f.id = file_versions.file_id));

create policy drive_share_links_select on public.drive_share_links for select using (private.has_permission(workspace_id, 'drive.file.share'));
create policy drive_share_links_insert on public.drive_share_links for insert with check (private.has_permission(workspace_id, 'drive.file.share'));
create policy drive_share_links_update on public.drive_share_links for update using (private.has_permission(workspace_id, 'drive.file.share')) with check (private.has_permission(workspace_id, 'drive.file.share'));

-- the log is append-only (no update or delete policy): administrators with the permission read it, and so does the person whose space was opened
create policy drive_break_glass_select on public.drive_break_glass for select using (private.has_permission(workspace_id, 'drive.personal.break_glass') or owner_id = private.current_user_id());
create policy drive_notices_select on public.drive_notices for select using (user_id = private.current_user_id());
create policy drive_notices_update on public.drive_notices for update using (user_id = private.current_user_id()) with check (user_id = private.current_user_id());
create or replace function private.drive_notices_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.workspace_id is distinct from old.workspace_id or new.user_id is distinct from old.user_id or new.kind is distinct from old.kind
     or new.break_glass_id is distinct from old.break_glass_id or new.created_at is distinct from old.created_at then
    raise exception 'a notice can only be marked as seen' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger drive_notices_guard before update on public.drive_notices for each row execute function private.drive_notices_guard();

-- ------------------------------------------------------------------ break-glass: the only way into someone else's personal space
create or replace function public.drive_break_glass_open(p_owner uuid, p_reason text)
returns table (id uuid, name text, kind text, folder_id uuid, mime_type text, size_bytes bigint, current_version int, updated_at timestamptz, archived_at timestamptz, storage_path text, body text)
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); r text := private.request_org(); ws uuid; n int; log_id uuid;
begin
  if uid is null or r is null or r !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return; end if;
  ws := r::uuid;
  if not private.has_permission(ws, 'drive.personal.break_glass') or p_owner is null or p_owner = uid
     or not exists (select 1 from public.memberships m where m.workspace_id = ws and m.user_id = p_owner and m.kind = 'staff') then return; end if;
  if p_reason is null or length(btrim(p_reason)) < 10 or length(p_reason) > 500 then
    raise exception 'say why, in a sentence' using errcode = 'P0001';
  end if;
  select count(*) into n from public.files f where f.workspace_id = ws and f.space = 'personal' and f.owner_id = p_owner;
  insert into public.drive_break_glass (workspace_id, accessed_by, owner_id, reason, files_seen) values (ws, uid, p_owner, btrim(p_reason), n) returning drive_break_glass.id into log_id;
  insert into public.drive_notices (workspace_id, user_id, kind, break_glass_id) values (ws, p_owner, 'personal_space_opened', log_id);
  return query
    select f.id, f.name, f.kind, f.folder_id, f.mime_type, f.size_bytes, f.current_version, f.updated_at, f.archived_at, v.storage_path, v.body
      from public.files f left join public.file_versions v on v.file_id = f.id and v.version = f.current_version
     where f.workspace_id = ws and f.space = 'personal' and f.owner_id = p_owner order by f.name;
end $$;

-- ------------------------------------------------------------------ share-link resolver (prepared: no API operation exposes it yet)
-- Given the secret token, returns the shared file's newest version if the link is live, and counts the use. Nothing else is reachable with a token.
create or replace function public.drive_link_resolve(p_token text)
returns table (file_id uuid, name text, kind text, mime_type text, size_bytes bigint, version int, storage_path text, body text)
language plpgsql security definer set search_path = '' as $$
declare l public.drive_share_links; h text;
begin
  if p_token is null or length(p_token) < 32 or length(p_token) > 200 then return; end if;
  h := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  select * into l from public.drive_share_links x where x.token_hash = h and x.revoked_at is null and x.expires_at > now();
  if l.id is null then return; end if;
  update public.drive_share_links set use_count = use_count + 1, last_used_at = now() where id = l.id;
  return query
    select f.id, f.name, f.kind, f.mime_type, f.size_bytes, f.current_version, v.storage_path, v.body
      from public.files f join public.file_versions v on v.file_id = f.id and v.version = f.current_version
     where f.id = l.file_id and f.space = 'shared' and not f.protected_sop and f.archived_at is null;
end $$;

-- ------------------------------------------------------------------ audit: names, places and flags, never content
create trigger audit_drive_folders after insert or update or delete on public.drive_folders
  for each row execute function private.audit_change('space', 'client_id', 'owner_id', 'parent_id', 'name', 'archived_at');
create trigger audit_files after insert or update or delete on public.files
  for each row execute function private.audit_change('space', 'client_id', 'owner_id', 'folder_id', 'name', 'kind', 'protected_sop', 'sop_key', 'client_visible', 'archived_at', 'current_version');
create trigger audit_file_versions after insert on public.file_versions
  for each row execute function private.audit_change('file_id', 'version', 'size_bytes');
create trigger audit_drive_share_links after insert or update on public.drive_share_links
  for each row execute function private.audit_change('file_id', 'expires_at', 'revoked_at');
create trigger audit_drive_break_glass after insert on public.drive_break_glass
  for each row execute function private.audit_change('accessed_by', 'owner_id', 'files_seen');

-- a client with files in its own space cannot be deleted (the check from 0004 counts files already)

-- ------------------------------------------------------------------ page registry and grants
insert into public.app_pages (app_key, page_key, title, kind, permission_key, parent_page_key) values
  ('drive', 'personal', 'My files', 'page', null, 'home'),
  ('drive', 'sops',     'SOPs',     'page', 'drive.file.view', 'home')
on conflict do nothing;

revoke all on all functions in schema private from public;
revoke all on function public.drive_break_glass_open(uuid, text) from public;
revoke all on function public.drive_link_resolve(text) from public;
grant select, insert, update, delete on public.drive_folders to app_user;
grant select, insert on public.file_versions to app_user;
grant select, insert, update on public.drive_share_links to app_user;
grant select on public.drive_break_glass to app_user;
grant select, update on public.drive_notices to app_user;
grant execute on function public.drive_break_glass_open(uuid, text) to app_user;
grant execute on function public.drive_link_resolve(text) to app_user;
grant execute on function private.can_read_file(uuid, text, uuid, uuid, boolean, boolean) to app_user;
grant execute on function private.can_write_file(uuid, text, uuid, uuid, uuid, boolean) to app_user;
grant execute on function private.can_delete_file(uuid, text, uuid, uuid, uuid, boolean) to app_user;
