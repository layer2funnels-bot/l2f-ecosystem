-- 0061 · Drive V8 (P04, 15 Nov 2026). Additive; rollback: migrations/rollback/0061_drive_v8.down.sql.
--   1. Saving: autosave thinning (one autosave per person per 10 minutes is kept; manual and named versions are kept forever, 03 §5 / D9).
--      Images and PDFs keep the original upload + the latest edit only; "Reset to original" points back at the original's stored bytes.
--   2. Move / Copy between Library and Personal (03 §4): stored bytes never move or duplicate; rows change place inside one audited function.
--   3. Stars and opens per person (Starred page, Recent, "You opened …"), presence heartbeat for the editors (D5: no fake presence).
--   4. Document pictures as attachments: content-addressed per organization, never listed in Drive, referenced by every document that used them.

-- ---------------------------------------------------------------- 0. one switch for the transfer function (transaction-local)
-- Only drive_transfer() and drive_reset_original() turn it on. The guards below let rows change space/owner and keep their stored path
-- while it is on; everything else they check stays.
create or replace function private.drive_transfer_on() returns boolean language sql stable set search_path = '' as $$
  select coalesce(current_setting('l2f.drive_transfer', true), '') = 'on'
$$;

create or replace function private.files_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); pf public.drive_folders; op boolean := false; ov boolean := false; tr boolean := private.drive_transfer_on();
begin
  if tg_op = 'INSERT' then
    if uid is not null then new.uploaded_by := uid; end if;
    new.space := coalesce(new.space, case when new.client_id is not null then 'client' else 'shared' end);
    new.name := coalesce(new.name, 'Untitled');
    new.current_version := 1;
    if new.space = 'personal' and uid is not null then new.owner_id := coalesce(new.owner_id, uid); end if;
  else
    if new.workspace_id is distinct from old.workspace_id or new.client_id is distinct from old.client_id or new.uploaded_by is distinct from old.uploaded_by
       or new.kind is distinct from old.kind or (not tr and (new.space is distinct from old.space or new.owner_id is distinct from old.owner_id)) then
      raise exception 'records do not move' using errcode = 'P0001';
    end if;
    new.updated_at := now();
    op := old.protected_sop; ov := old.client_visible;
    if old.protected_sop and uid is not null and not private.has_permission(new.workspace_id, 'drive.sop.manage') then
      raise exception 'not found' using errcode = '42501';
    end if;
  end if;
  if new.protected_sop is distinct from op and uid is not null
     and not private.has_permission(new.workspace_id, 'drive.sop.manage') then
    raise exception 'not found' using errcode = '42501';
  end if;
  -- the stored path is checked when it is set (a moved or copied file keeps the bytes where they are)
  if not tr and (tg_op = 'INSERT' or new.storage_path is distinct from old.storage_path)
     and not private.drive_path_ok(new.workspace_id, new.space, new.client_id, new.owner_id, new.storage_path) then
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

create or replace function private.drive_folders_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); pf public.drive_folders; depth int := 0; cur uuid; tr boolean := private.drive_transfer_on();
begin
  if tg_op = 'INSERT' then
    if uid is not null then new.created_by := uid; end if;
  else
    if new.workspace_id is distinct from old.workspace_id or new.client_id is distinct from old.client_id or new.created_by is distinct from old.created_by
       or (not tr and (new.space is distinct from old.space or new.owner_id is distinct from old.owner_id)) then
      raise exception 'records do not move' using errcode = 'P0001';
    end if;
    new.updated_at := now();
  end if;
  if new.parent_id is not null then
    select * into pf from public.drive_folders f where f.workspace_id = new.workspace_id and f.id = new.parent_id;
    if pf.id is null or pf.space is distinct from new.space or pf.client_id is distinct from new.client_id or pf.owner_id is distinct from new.owner_id then
      raise exception 'that folder belongs somewhere else' using errcode = 'P0001';
    end if;
    if tg_op = 'UPDATE' then
      cur := new.parent_id;
      while cur is not null and depth < 20 loop
        if cur = new.id then raise exception 'a folder cannot go inside itself' using errcode = 'P0001'; end if;
        select f.parent_id into cur from public.drive_folders f where f.id = cur; depth := depth + 1;
      end loop;
    end if;
  end if;
  return new;
end $$;

create or replace function private.files_library_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); tr boolean := private.drive_transfer_on();
begin
  if tg_op = 'INSERT' then
    if new.managed_by is null and new.project_id is not null then new.managed_by := 'projects'; end if;
    if new.in_library is null then new.in_library := (new.space = 'shared' and new.managed_by is null); end if;
  else
    if new.managed_by is distinct from old.managed_by and not tr then raise exception 'records do not move' using errcode = 'P0001'; end if;
    if new.protected_sop and not old.protected_sop then new.in_library := true; end if;
    if new.in_library is distinct from old.in_library and uid is not null and not tr and not private.has_permission(new.workspace_id, 'drive.file.edit', new.client_id) then
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
declare uid uuid := private.current_user_id(); f public.files; tr boolean := private.drive_transfer_on();
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
  if not tr and not private.drive_path_ok(f.workspace_id, f.space, f.client_id, f.owner_id, new.storage_path) then raise exception 'that storage path is not allowed here' using errcode = 'P0001'; end if;
  new.version := coalesce((select max(v.version) from public.file_versions v where v.file_id = new.file_id), 0) + 1;
  return new;
end $$;

-- ---------------------------------------------------------------- 1. saving: thinning
-- Documents: a new autosave replaces the same person's earlier autosaves of the same 10-minute window (version 1 and every manual,
-- named or restored version stay). Version numbers keep rising, so "someone saved a newer version" detection is unchanged.
-- Images and PDFs (files with stored bytes): only the original upload (lowest version) and the latest edit are kept.
create or replace function private.file_versions_thin() returns trigger
language plpgsql security definer set search_path = '' as $$
declare first_v int;
begin
  select min(v.version) into first_v from public.file_versions v where v.file_id = new.file_id;
  if new.body is not null then
    if new.note = 'Autosave' then
      delete from public.file_versions v where v.file_id = new.file_id and v.version < new.version and v.version > first_v and v.note = 'Autosave'
        and v.created_by is not distinct from new.created_by and v.created_at >= date_bin('10 minutes', new.created_at, timestamptz '2000-01-01');
    end if;
  elsif new.storage_path is not null then
    if exists (select 1 from public.files f where f.id = new.file_id and (f.mime_type like 'image/%' or f.mime_type = 'application/pdf')) then
      delete from public.file_versions v where v.file_id = new.file_id and v.version <> first_v and v.version <> new.version;
    end if;
  end if;
  return null;
end $$;
create trigger file_versions_thin after insert on public.file_versions for each row execute function private.file_versions_thin();

-- Reset to original (Image and PDF editors): a new version that points at the original upload's stored bytes (byte-identical by construction).
create or replace function public.drive_reset_original(p_file uuid, p_expected int) returns int
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); f public.files; o public.file_versions; n int;
begin
  select * into f from public.files x where x.id = p_file;
  if f.id is null or uid is null or f.workspace_id is distinct from nullif(private.request_org(), '')::uuid or f.kind <> 'file'
     or not (f.mime_type like 'image/%' or f.mime_type = 'application/pdf') then raise exception 'not found' using errcode = '42501'; end if;
  if not (private.can_write_file(f.workspace_id, f.space, f.client_id, f.owner_id, f.uploaded_by, f.protected_sop)
          or (f.space = 'shared' and coalesce(private.drive_share_role(f.workspace_id, f.id, f.folder_id) = 'editor', false)))
     or not private.drive_gate(f.workspace_id, f.locked_at is not null, f.folder_id) then raise exception 'not found' using errcode = '42501'; end if;
  if p_expected is not null and p_expected <> f.current_version then raise exception 'a newer version was saved' using errcode = '40001'; end if;
  select * into o from public.file_versions v where v.file_id = f.id order by v.version limit 1;
  if o.version = f.current_version then return f.current_version; end if;
  perform set_config('l2f.drive_transfer', 'on', true);
  insert into public.file_versions (workspace_id, file_id, storage_path, size_bytes, note) values (f.workspace_id, f.id, o.storage_path, o.size_bytes, 'Reset to original')
    returning version into n;
  perform set_config('l2f.drive_transfer', '', true);
  insert into public.audit_events (workspace_id, actor_id, action, subject_type, subject_id, origin, detail)
  values (f.workspace_id, uid, 'drive.reset_original', 'file', f.id, 'app', jsonb_build_object('original_version', o.version, 'new_version', n));
  return n;
end $$;

-- ---------------------------------------------------------------- 2. Move / Copy (Library = space 'shared' + in_library, Personal = space 'personal')
-- p_files / p_folders: the chosen items (folders bring everything inside them). p_to_space 'shared' (Library) | 'personal'. p_to_folder: a folder in
-- that space, or null for its top. Rules (03 §4):
--   Personal -> Library (move): your own items, and you may add files to the Library (drive.file.upload). The organization owns them; shares stay.
--   Library -> Personal (move): items you uploaded/created, or you may delete anyone's (drive.file.delete_any). Shares to others and public links
--     are removed (the dialog warns first), Office document links to them are removed; protected SOPs never leave the Library.
--   Copy: new items with the same stored bytes (nothing is stored twice), no sharing, only the current version.
--   Client files and app-owned files never move this way. Locked or password folders are refused unless you may open them.
create or replace function public.drive_transfer(p_files uuid[], p_folders uuid[], p_to_space text, p_to_folder uuid, p_copy boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  ws uuid := nullif(private.request_org(), '')::uuid; uid uuid := private.current_user_id();
  tf public.drive_folders; to_owner uuid; fl uuid[]; fi uuid[]; bad int; shares int := 0; links int := 0; moved_f int := 0; moved_d int := 0;
  r record; newid uuid; map jsonb := '{}'::jsonb; top_ids uuid[] := '{}'; nm text;
begin
  if ws is null or uid is null or not private.is_staff(ws) or not private.can_use_app(ws, 'drive') then raise exception 'not found' using errcode = '42501'; end if;
  if p_to_space not in ('shared', 'personal') then raise exception 'choose Library or Personal' using errcode = '22023'; end if;
  if coalesce(cardinality(p_files), 0) + coalesce(cardinality(p_folders), 0) = 0 or coalesce(cardinality(p_files), 0) + coalesce(cardinality(p_folders), 0) > 500 then
    raise exception 'choose between 1 and 500 items' using errcode = '22023'; end if;
  to_owner := case when p_to_space = 'personal' then uid end;
  if p_to_space = 'shared' and not private.has_permission(ws, 'drive.file.upload') then raise exception 'not found' using errcode = '42501'; end if;
  if p_to_folder is not null then
    select * into tf from public.drive_folders d where d.workspace_id = ws and d.id = p_to_folder;
    if tf.id is null or tf.space <> p_to_space or tf.client_id is not null or tf.owner_id is distinct from to_owner or tf.archived_at is not null
       or not private.drive_gate(ws, tf.locked_at is not null, tf.parent_id) then raise exception 'not found' using errcode = '42501'; end if;
  end if;

  -- every folder below the chosen ones, and every file in any of them
  with recursive t(id) as (select d.id from public.drive_folders d where d.workspace_id = ws and d.id = any(coalesce(p_folders, '{}'))
                           union select d.id from public.drive_folders d join t on d.parent_id = t.id where d.workspace_id = ws)
  select coalesce(array_agg(id), '{}') into fl from t;
  if p_to_folder is not null and p_to_folder = any(fl) then raise exception 'a folder cannot go inside itself' using errcode = 'P0001'; end if;
  select coalesce(array_agg(f.id), '{}') into fi from public.files f where f.workspace_id = ws and (f.id = any(coalesce(p_files, '{}')) or f.folder_id = any(fl))
    and (not p_copy or f.archived_at is null);
  if cardinality(fi) + cardinality(fl) > 5000 then raise exception 'too many items at once' using errcode = '22023'; end if;

  -- what may be taken: Library or your own Personal items only, never client or app-owned files; folders you may open
  select count(*) into bad from public.files f where f.id = any(fi) and not (
    f.client_id is null and f.managed_by is null and f.project_id is null
    and ((f.space = 'personal' and f.owner_id = uid) or (f.space = 'shared' and f.in_library and (private.has_permission(ws, 'drive.file.view') or private.drive_share_role(ws, f.id, f.folder_id) is not null)))
    and private.drive_gate(ws, f.locked_at is not null, f.folder_id)
    and (p_copy or not (f.protected_sop and p_to_space = 'personal'))
    and (p_copy or f.space = p_to_space or (f.space = 'personal') or private.has_permission(ws, 'drive.file.delete_any') or f.uploaded_by = uid));
  if p_folders is not null and exists (select 1 from unnest(p_folders) x where not exists (select 1 from public.drive_folders d where d.workspace_id = ws and d.id = x)) then bad := bad + 1; end if;
  select bad + count(*) into bad from public.drive_folders d where d.id = any(fl) and not (
    d.client_id is null and ((d.space = 'personal' and d.owner_id = uid) or (d.space = 'shared' and private.has_permission(ws, 'drive.file.view')))
    and private.drive_gate(ws, d.locked_at is not null, d.parent_id)
    and (p_copy or d.space = p_to_space or d.space = 'personal' or private.has_permission(ws, 'drive.file.delete_any') or d.created_by = uid));
  if p_files is not null and exists (select 1 from unnest(p_files) x where not (x = any(fi))) then bad := bad + 1; end if;
  if bad > 0 then raise exception 'not found' using errcode = '42501'; end if;

  perform set_config('l2f.drive_transfer', 'on', true);
  if not p_copy then
    -- folders first, top-down, so each one's parent is already in the new place
    for r in with recursive t(id, lvl) as (select d.id, 0 from public.drive_folders d where d.id = any(coalesce(p_folders, '{}')) and d.workspace_id = ws
                                           union all select d.id, t.lvl + 1 from public.drive_folders d join t on d.parent_id = t.id where d.workspace_id = ws)
             select id, lvl from t order by lvl loop
      update public.drive_folders set space = p_to_space, owner_id = to_owner,
        parent_id = case when r.lvl = 0 then p_to_folder else parent_id end where id = r.id;
      moved_d := moved_d + 1;
    end loop;
    if p_to_space = 'personal' then
      delete from public.drive_shares s where s.workspace_id = ws and (s.file_id = any(fi) or s.folder_id = any(fl)) and s.user_id is distinct from uid;
      get diagnostics shares = row_count;
      delete from public.drive_shares s where s.workspace_id = ws and (s.file_id = any(fi) or s.folder_id = any(fl));
      update public.drive_share_links set revoked_at = now() where workspace_id = ws and file_id = any(fi) and revoked_at is null;
      get diagnostics links = row_count;
      delete from public.doc_links where workspace_id = ws and file_id = any(fi);
    end if;
    update public.files f set space = p_to_space, owner_id = to_owner, in_library = (p_to_space = 'shared'),
      folder_id = case when f.id = any(coalesce(p_files, '{}')) then p_to_folder else f.folder_id end
     where f.id = any(fi);
    get diagnostics moved_f = row_count;
    top_ids := coalesce(p_files, '{}') || coalesce(p_folders, '{}');
  else
    for r in with recursive t(id, lvl) as (select d.id, 0 from public.drive_folders d where d.id = any(coalesce(p_folders, '{}')) and d.workspace_id = ws
                                           union all select d.id, t.lvl + 1 from public.drive_folders d join t on d.parent_id = t.id where d.workspace_id = ws and d.archived_at is null)
             select t.id, t.lvl, d.name, d.parent_id from t join public.drive_folders d on d.id = t.id order by t.lvl loop
      nm := r.name;
      if r.lvl = 0 and exists (select 1 from public.drive_folders x where x.workspace_id = ws and x.space = p_to_space and x.owner_id is not distinct from to_owner and x.client_id is null
                                 and x.parent_id is not distinct from p_to_folder and lower(x.name) = lower(nm) and x.archived_at is null) then nm := left('Copy of ' || nm, 200); end if;
      insert into public.drive_folders (workspace_id, space, owner_id, parent_id, name)
        values (ws, p_to_space, to_owner, case when r.lvl = 0 then p_to_folder else (map ->> r.parent_id::text)::uuid end, nm) returning id into newid;
      map := map || jsonb_build_object(r.id::text, newid); moved_d := moved_d + 1;
      if r.lvl = 0 then top_ids := top_ids || newid; end if;
    end loop;
    for r in select f.*, v.body as v_body, v.storage_path as v_path, v.size_bytes as v_size from public.files f
               join public.file_versions v on v.file_id = f.id and v.version = f.current_version where f.id = any(fi) loop
      nm := r.name;
      if r.id = any(coalesce(p_files, '{}')) and exists (select 1 from public.files x where x.workspace_id = ws and x.space = p_to_space and x.owner_id is not distinct from to_owner
           and x.client_id is null and x.folder_id is not distinct from p_to_folder and lower(x.name) = lower(nm) and x.archived_at is null) then nm := left('Copy of ' || nm, 200); end if;
      insert into public.files (workspace_id, space, owner_id, folder_id, name, kind, mime_type, size_bytes, storage_path, in_library)
        values (ws, p_to_space, to_owner, case when r.id = any(coalesce(p_files, '{}')) then p_to_folder else (map ->> r.folder_id::text)::uuid end,
                nm, r.kind, r.mime_type, r.v_size, case when r.kind = 'file' then r.v_path end, p_to_space = 'shared') returning id into newid;
      insert into public.file_versions (workspace_id, file_id, storage_path, body, size_bytes, note)
        values (ws, newid, r.v_path, r.v_body, r.v_size, 'Copied from ' || left(r.name, 200));
      insert into public.doc_asset_refs (workspace_id, file_id, asset_id) select ws, newid, a.asset_id from public.doc_asset_refs a where a.file_id = r.id on conflict do nothing;
      moved_f := moved_f + 1;
      if r.id = any(coalesce(p_files, '{}')) then top_ids := top_ids || newid; end if;
    end loop;
  end if;
  perform set_config('l2f.drive_transfer', '', true);
  insert into public.audit_events (workspace_id, actor_id, action, subject_type, subject_id, origin, detail)
  values (ws, uid, case when p_copy then 'drive.copy' else 'drive.move' end, 'workspace', ws, 'app',
          jsonb_build_object('to', p_to_space, 'folder', p_to_folder, 'files', moved_f, 'folders', moved_d, 'shares_removed', shares, 'links_revoked', links));
  return jsonb_build_object('files', moved_f, 'folders', moved_d, 'shares_removed', shares, 'links_revoked', links, 'ids', to_jsonb(top_ids));
end $$;

-- How many people outside you would lose access if these items went to Personal (the dialog's warning). Read only.
create or replace function public.drive_transfer_preview(p_files uuid[], p_folders uuid[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare ws uuid := nullif(private.request_org(), '')::uuid; uid uuid := private.current_user_id(); fl uuid[]; fi uuid[]; ppl int; lk int; nf int;
begin
  if ws is null or uid is null or not private.is_staff(ws) then raise exception 'not found' using errcode = '42501'; end if;
  with recursive t(id) as (select d.id from public.drive_folders d where d.workspace_id = ws and d.id = any(coalesce(p_folders, '{}'))
                           union select d.id from public.drive_folders d join t on d.parent_id = t.id where d.workspace_id = ws)
  select coalesce(array_agg(id), '{}') into fl from t;
  select coalesce(array_agg(f.id), '{}') into fi from public.files f where f.workspace_id = ws and (f.id = any(coalesce(p_files, '{}')) or f.folder_id = any(fl))
    and ((f.space = 'personal' and f.owner_id = uid) or (f.space = 'shared' and private.has_permission(ws, 'drive.file.view')));
  select count(distinct s.user_id) into ppl from public.drive_shares s where s.workspace_id = ws and (s.file_id = any(fi) or s.folder_id = any(fl)) and s.user_id is distinct from uid;
  select count(*) into lk from public.drive_share_links l where l.workspace_id = ws and l.file_id = any(fi) and l.revoked_at is null;
  select count(*) into nf from public.files f where f.id = any(fi);
  return jsonb_build_object('files', nf, 'folders', cardinality(fl), 'people', ppl, 'links', lk);
end $$;

-- ---------------------------------------------------------------- 3. stars, opens, presence (each person's own)
create table if not exists public.drive_stars (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null default private.current_user_id(),
  file_id uuid, folder_id uuid, created_at timestamptz not null default now(),
  check ((file_id is null) <> (folder_id is null)),
  foreign key (workspace_id, file_id) references public.files (workspace_id, id) on delete cascade,
  foreign key (workspace_id, folder_id) references public.drive_folders (workspace_id, id) on delete cascade
);
create unique index if not exists drive_stars_one on public.drive_stars (user_id, coalesce(file_id, folder_id));
create table if not exists public.drive_opens (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null default private.current_user_id(),
  file_id uuid not null, opened_at timestamptz not null default now(),
  primary key (user_id, file_id),
  foreign key (workspace_id, file_id) references public.files (workspace_id, id) on delete cascade
);
create index if not exists drive_opens_recent on public.drive_opens (workspace_id, user_id, opened_at desc);
create table if not exists public.drive_presence (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  file_id uuid not null, user_id uuid not null default private.current_user_id(),
  mode text not null default 'viewing' check (mode in ('viewing', 'editing')), seen_at timestamptz not null default now(),
  primary key (file_id, user_id),
  foreign key (workspace_id, file_id) references public.files (workspace_id, id) on delete cascade
);
do $$
declare t text;
begin
  foreach t in array array['drive_stars', 'drive_opens', 'drive_presence'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists org_scope on public.%I', t);
    execute format('create policy org_scope on public.%I as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id))', t);
  end loop;
end $$;
-- stars and opens: only your own rows, and only for items you can see (the files/folders rules decide)
drop policy if exists own on public.drive_stars;
create policy own on public.drive_stars for all using (user_id = private.current_user_id())
  with check (user_id = private.current_user_id() and (exists (select 1 from public.files f where f.workspace_id = drive_stars.workspace_id and f.id = drive_stars.file_id)
                                                   or exists (select 1 from public.drive_folders d where d.workspace_id = drive_stars.workspace_id and d.id = drive_stars.folder_id)));
drop policy if exists own on public.drive_opens;
create policy own on public.drive_opens for all using (user_id = private.current_user_id())
  with check (user_id = private.current_user_id() and exists (select 1 from public.files f where f.workspace_id = drive_opens.workspace_id and f.id = drive_opens.file_id));
-- presence: you write your own heartbeat; you see the heartbeats of a file you can open
drop policy if exists sel on public.drive_presence;
create policy sel on public.drive_presence for select using (exists (select 1 from public.files f where f.workspace_id = drive_presence.workspace_id and f.id = drive_presence.file_id));
drop policy if exists own on public.drive_presence;
create policy own on public.drive_presence for insert with check (user_id = private.current_user_id() and exists (select 1 from public.files f where f.workspace_id = drive_presence.workspace_id and f.id = drive_presence.file_id));
drop policy if exists upd on public.drive_presence;
create policy upd on public.drive_presence for update using (user_id = private.current_user_id()) with check (user_id = private.current_user_id());
drop policy if exists del on public.drive_presence;
create policy del on public.drive_presence for delete using (user_id = private.current_user_id());
grant select, insert, delete on public.drive_stars to app_user;
grant select, insert, update, delete on public.drive_opens to app_user;
grant select, insert, update, delete on public.drive_presence to app_user;

-- ---------------------------------------------------------------- 4. document attachments (pictures inside Docs/Slides)
create table if not exists public.doc_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  storage_path text not null check (length(storage_path) <= 600 and not storage_path like '%..%'),
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'image/gif', 'image/webp')),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  width int, height int,
  created_by uuid not null default private.current_user_id(), created_at timestamptz not null default now(),
  unique (workspace_id, sha256), unique (workspace_id, id)
);
create table if not exists public.doc_asset_refs (
  workspace_id uuid not null, file_id uuid not null, asset_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (file_id, asset_id),
  foreign key (workspace_id, file_id) references public.files (workspace_id, id) on delete cascade,
  foreign key (workspace_id, asset_id) references public.doc_assets (workspace_id, id) on delete cascade
);
do $$
declare t text;
begin
  foreach t in array array['doc_assets', 'doc_asset_refs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists org_scope on public.%I', t);
    execute format('create policy org_scope on public.%I as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id))', t);
  end loop;
end $$;
-- an attachment is visible to whoever can open a document that uses it; a reference is visible with its document
drop policy if exists sel on public.doc_asset_refs;
create policy sel on public.doc_asset_refs for select using (exists (select 1 from public.files f where f.workspace_id = doc_asset_refs.workspace_id and f.id = doc_asset_refs.file_id));
drop policy if exists sel on public.doc_assets;
create policy sel on public.doc_assets for select using (created_by = private.current_user_id()
  or exists (select 1 from public.doc_asset_refs r join public.files f on f.id = r.file_id where r.asset_id = doc_assets.id and f.workspace_id = doc_assets.workspace_id));
-- registering happens in drive_asset_register (it checks the stored bytes' hash first), so no direct insert grant
grant select on public.doc_assets, public.doc_asset_refs to app_user;

-- Register (or find) an attachment for a document the caller may edit. The API computes p_sha from the stored bytes before calling.
create or replace function public.drive_asset_register(p_file uuid, p_sha text, p_path text, p_mime text, p_size bigint, p_w int, p_h int) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); ws uuid := nullif(private.request_org(), '')::uuid; f public.files; aid uuid;
begin
  select * into f from public.files x where x.id = p_file and x.workspace_id = ws;
  if f.id is null or uid is null or f.kind <> 'document' or f.archived_at is not null then raise exception 'not found' using errcode = '42501'; end if;
  if not (private.can_write_file(f.workspace_id, f.space, f.client_id, f.owner_id, f.uploaded_by, f.protected_sop)
          or (f.space = 'shared' and not f.protected_sop and coalesce(private.drive_share_role(f.workspace_id, f.id, f.folder_id) = 'editor', false)))
     or not private.drive_gate(ws, f.locked_at is not null, f.folder_id) then raise exception 'not found' using errcode = '42501'; end if;
  if p_path is not null and not starts_with(p_path, ws::text || '/assets/') then raise exception 'that storage path is not allowed here' using errcode = 'P0001'; end if;
  select id into aid from public.doc_assets a where a.workspace_id = ws and a.sha256 = p_sha;
  if aid is null then
    if p_path is null then return null; end if;                 -- nothing stored yet under this hash: the caller uploads first
    insert into public.doc_assets (workspace_id, sha256, storage_path, mime_type, size_bytes, width, height, created_by)
      values (ws, p_sha, p_path, p_mime, p_size, p_w, p_h, uid) on conflict (workspace_id, sha256) do nothing returning id into aid;
    if aid is null then select id into aid from public.doc_assets a where a.workspace_id = ws and a.sha256 = p_sha; end if;
  end if;
  insert into public.doc_asset_refs (workspace_id, file_id, asset_id) values (ws, f.id, aid) on conflict do nothing;
  return aid;
end $$;

-- Existing document pictures (Drive files referenced from a document's body as {"f": id}) stop cluttering Drive: they become app-owned
-- ('docs'), stay exactly where they are and keep opening inside their documents. Nothing is deleted.
alter table public.files drop constraint if exists files_managed_by_check;
alter table public.files add constraint files_managed_by_check check (managed_by in ('projects', 'clients', 'portal', 'whiteboard', 'forms', 'social_planner', 'value_ladder', 'funnels', 'planner', 'docs'));
do $$
begin
  perform set_config('l2f.drive_transfer', 'on', true);
  update public.files f set managed_by = 'docs', in_library = false
   where f.kind = 'file' and f.mime_type like 'image/%' and f.managed_by is null and not f.protected_sop
     and exists (select 1 from public.files d join public.file_versions v on v.file_id = d.id
                  where d.workspace_id = f.workspace_id and d.kind = 'document' and v.body like '%"f":"' || f.id::text || '"%');
  perform set_config('l2f.drive_transfer', '', true);
end $$;

-- ---------------------------------------------------------------- grants (app role only; nothing for the Data API roles)
revoke all on function public.drive_transfer(uuid[], uuid[], text, uuid, boolean), public.drive_transfer_preview(uuid[], uuid[]), public.drive_reset_original(uuid, int),
  public.drive_asset_register(uuid, text, text, text, bigint, int, int) from public;
grant execute on function public.drive_transfer(uuid[], uuid[], text, uuid, boolean), public.drive_transfer_preview(uuid[], uuid[]), public.drive_reset_original(uuid, int),
  public.drive_asset_register(uuid, text, text, text, bigint, int, int) to app_user;
grant execute on function private.drive_transfer_on() to app_user;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on table public.drive_stars, public.drive_opens, public.drive_presence, public.doc_assets, public.doc_asset_refs from %I', r);
      execute format('revoke all on function public.drive_transfer(uuid[], uuid[], text, uuid, boolean), public.drive_transfer_preview(uuid[], uuid[]), public.drive_reset_original(uuid, int), public.drive_asset_register(uuid, text, text, text, bigint, int, int) from %I', r);
    end if;
  end loop;
end $$;
