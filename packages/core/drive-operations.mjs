// Drive API operations (migration 0014): folders, files and first-party documents with versions, protected SOPs, share links, the personal
// space and its break-glass access. Same conventions as the other operation files: column names are constants, permissions are decided by row
// policies and triggers in the database (a refusal reads as "not found"), data and API only. Real file bytes are not handled here: the
// browser would upload to storage through a signed address (packages/core/storage.mjs, prepared), then register the path.
import { defineOperation } from './define.mjs';
import { newObjectPath } from './storage.mjs';

const T = (max = 500) => ({ type: 'text', min: 0, max });
const id = { id: { type: 'uuid', required: true } };
/** The apps whose own records may own files. A file with an owner app is stored like any other but is not listed in the organization's Drive until someone adds it to the library. */
export const APPS = ['projects', 'clients', 'portal', 'whiteboard', 'forms', 'social_planner', 'value_ladder', 'funnels', 'planner'];
const SPACE = { type: 'enum', values: ['shared', 'personal', 'client'], required: true };
const NAME = { type: 'text', required: true, min: 1, max: 200 };
const like = (q) => `%${String(q).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
const bad = (message) => Object.assign(new Error(message), { code: 'P0001' });       // reads as "invalid" in the API contract
const toBase64Url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const MAX_FILE = 5368709120;                                   // 5 GiB, the same ceiling as file_versions.size_bytes
const needStorage = (ctx) => { if (!ctx.storage) throw { code: 'STORAGE_OFF' }; return ctx.storage; };
// a stored copy must exist, and ITS size is the size (never the caller's claim: the cap counts real bytes)
const verifyStored = async (ctx, path, claimed) => {
  if (!ctx.storage) return claimed;
  const h = await ctx.storage.head(path);
  if (!h) throw bad('the upload was not found');
  if (h.size > MAX_FILE) throw bad('file too large');
  return h.size;
};
const byteLength = (text) => new TextEncoder().encode(text).length;
export const newLinkToken = () => toBase64Url(crypto.getRandomValues(new Uint8Array(32)));

const FSELECT = `select f.id, f.space, f.client_id, f.owner_id, f.folder_id, f.name, f.kind, f.mime_type, f.size_bytes::float8 as size_bytes, f.current_version, f.protected_sop, f.sop_key,
    f.client_visible, f.project_id, f.managed_by, f.in_library, f.uploaded_by, f.archived_at, f.created_at, f.updated_at from files f`;
const DSELECT = `select d.id, d.space, d.client_id, d.owner_id, d.parent_id, d.name, d.archived_at, d.created_at, d.updated_at,
    (select count(*)::int from files f where f.folder_id = d.id and f.archived_at is null and (f.space <> 'shared' or f.in_library)) as files,
    (select count(*)::int from drive_folders c where c.parent_id = d.id and c.archived_at is null) as folders from drive_folders d`;

const folderOps = [
  defineOperation({
    name: 'drive.folders.list', class: 'read', input: { space: SPACE, client: { type: 'uuid' }, parent: { type: 'uuid' }, archived: { type: 'bool' } },
    run: (q, _c, i) => q(`${DSELECT} where d.space = $1 and d.client_id is not distinct from $2 and d.parent_id is not distinct from $3 and ((d.archived_at is not null) = $4) order by lower(d.name) limit 500`,
      [i.space, i.client ?? null, i.parent ?? null, i.archived ?? false]),
  }),
  defineOperation({
    name: 'drive.folders.create', class: 'write', single: true, input: { space: SPACE, client: { type: 'uuid' }, parent: { type: 'uuid' }, name: NAME },
    run: async (q, ctx, i) => {
      const [r] = await q('insert into drive_folders (workspace_id, space, client_id, owner_id, parent_id, name) values ($1,$2,$3,$4,$5,$6) returning id',
        [ctx.orgId, i.space, i.client ?? null, i.space === 'personal' ? ctx.userId : null, i.parent ?? null, i.name]);
      return q(`${DSELECT} where d.id = $1`, [r.id]);
    },
  }),
  defineOperation({
    name: 'drive.folders.update', class: 'write', single: true, input: { ...id, name: { type: 'text', min: 1, max: 200 }, parent: { type: 'uuid' }, to_root: { type: 'bool' } },
    run: async (q, _c, i) => {
      const sets = []; const p = [i.id];
      if (i.name !== undefined) { p.push(i.name); sets.push(`name = $${p.length}`); }
      if (i.parent !== undefined) { p.push(i.parent); sets.push(`parent_id = $${p.length}`); }
      if (i.to_root) sets.push('parent_id = null');
      if (sets.length && !(await q(`update drive_folders set ${sets.join(', ')} where id = $1 returning id`, p)).length) return [];
      return q(`${DSELECT} where d.id = $1`, [i.id]);
    },
  }),
  defineOperation({
    // the folder and every folder above it, root first (the breadcrumb); row security still decides what is readable
    name: 'drive.folders.path', class: 'read', input: id,
    run: (q, _c, i) => q(`with recursive up as (select d.id, d.name, d.parent_id, 0 as depth from drive_folders d where d.id = $1
      union all select p.id, p.name, p.parent_id, up.depth + 1 from drive_folders p join up on p.id = up.parent_id where up.depth < 30)
      select id, name, parent_id from up order by depth desc`, [i.id]),
  }),
  defineOperation({ name: 'drive.folders.archive', class: 'write', single: true, input: id, run: (q, _c, i) => q('update drive_folders set archived_at = now() where id = $1 and archived_at is null returning id, archived_at', [i.id]) }),
  defineOperation({ name: 'drive.folders.restore', class: 'write', single: true, input: id, run: (q, _c, i) => q('update drive_folders set archived_at = null where id = $1 and archived_at is not null returning id, archived_at', [i.id]) }),
  defineOperation({ name: 'drive.folders.delete', class: 'write', single: true, input: id, run: (q, _c, i) => q('delete from drive_folders where id = $1 returning id', [i.id]) }),
];

const fileOps = [
  defineOperation({
    name: 'drive.files.list', class: 'read',
    input: { space: SPACE, client: { type: 'uuid' }, folder: { type: 'uuid' }, anywhere: { type: 'bool' }, archived: { type: 'bool' }, q: { type: 'text', max: 100 }, kind: { type: 'enum', values: ['file', 'document'] } },
    run: (q, _c, i) => q(`${FSELECT} where f.space = $1 and f.client_id is not distinct from $2 and ($3::boolean or f.folder_id is not distinct from $4) and ((f.archived_at is not null) = $5) and (f.space <> 'shared' or f.in_library)
      and ($6::text is null or f.name ilike $6) and ($7::text is null or f.kind = $7) order by lower(f.name) limit 500`,
    [i.space, i.client ?? null, i.anywhere ?? false, i.folder ?? null, i.archived ?? false, i.q ? like(i.q) : null, i.kind ?? null]),
  }),
  // Everything that belongs to one project (documents and whiteboards opened inside the project). Only what the person may read comes back.
  defineOperation({
    name: 'drive.project.files', class: 'read', input: { project: { type: 'uuid', required: true }, kind: { type: 'enum', values: ['file', 'document'] }, mime: T(120), archived: { type: 'bool' }, q: { type: 'text', max: 100 } },
    run: (q, _c, i) => q(`${FSELECT} where f.project_id = $1 and ((f.archived_at is not null) = $2) and ($3::text is null or f.kind = $3) and ($4::text is null or f.mime_type = $4) and ($5::text is null or f.name ilike $5)
      order by f.updated_at desc limit 500`, [i.project, i.archived ?? false, i.kind ?? null, i.mime ?? null, i.q ? like(i.q) : null]),
  }),
  // The "All boards" lens: every whiteboard the person may open, optionally by context (shared Drive, one client, one project). Only readable records come back.
  defineOperation({
    name: 'drive.boards.list', class: 'read',
    input: { scope: { type: 'enum', values: ['all', 'shared', 'client', 'project'] }, client: { type: 'uuid' }, project: { type: 'uuid' }, q: { type: 'text', max: 100 }, archived: { type: 'bool' } },
    run: (q, _c, i) => q(`${FSELECT} where f.kind = 'document' and f.mime_type = 'application/vnd.excalidraw+json' and ((f.archived_at is not null) = $1)
      and ($2::text is null or $2 = 'all' or ($2 = 'shared' and f.space = 'shared' and f.project_id is null) or ($2 = 'client' and f.space = 'client' and f.project_id is null and f.client_id is not distinct from $3) or ($2 = 'project' and f.project_id is not distinct from $4))
      and ($5::text is null or f.name ilike $5) order by f.updated_at desc limit 500`, [i.archived ?? false, i.scope ?? null, i.client ?? null, i.project ?? null, i.q ? like(i.q) : null]),
  }),
  defineOperation({ name: 'drive.files.get', class: 'read', single: true, input: id, run: (q, _c, i) => q(`${FSELECT} where f.id = $1`, [i.id]) }),
  defineOperation({
    // a file (bytes already uploaded to the signed address, path given) or a first-party document (text given); version 1 is created with it
    name: 'drive.files.create', class: 'write', single: true,
    input: { space: SPACE, client: { type: 'uuid' }, folder: { type: 'uuid' }, project: { type: 'uuid' }, name: NAME, kind: { type: 'enum', values: ['file', 'document'], required: true }, mime_type: T(120), size_bytes: { type: 'int', min: 0 },
      storage_path: T(600), body: T(200000), note: T(300), app: { type: 'enum', values: APPS } },
    run: async (q, ctx, i) => {
      if (i.kind === 'file' && (!i.storage_path || i.body !== undefined)) throw bad('a file needs the path of its stored copy');
      if (i.kind === 'document' && (i.body === undefined || i.storage_path)) throw bad('a document needs its text');
      if (i.kind === 'file') i = { ...i, size_bytes: await verifyStored(ctx, i.storage_path, i.size_bytes) };
      const [f] = await q('insert into files (workspace_id, space, client_id, owner_id, folder_id, project_id, managed_by, name, kind, mime_type, size_bytes, storage_path, uploaded_by) values ($1,$2,$3,$4,$5,$12,$13,$6,$7,$8,$9,$10,$11) returning id',
        [ctx.orgId, i.space, i.client ?? null, i.space === 'personal' ? ctx.userId : null, i.folder ?? null, i.name, i.kind, i.mime_type ?? null, i.size_bytes ?? (i.body !== undefined ? byteLength(i.body) : null), i.kind === 'file' ? i.storage_path : null, ctx.userId, i.project ?? null, i.app ?? null]);
      await q('insert into file_versions (workspace_id, file_id, storage_path, body, size_bytes, note) values ($1,$2,$3,$4,$5,$6)', [ctx.orgId, f.id, i.kind === 'file' ? i.storage_path : null, i.kind === 'document' ? i.body : null, i.size_bytes ?? (i.body !== undefined ? byteLength(i.body) : null), i.note ?? null]);
      return q(`${FSELECT} where f.id = $1`, [f.id]);
    },
  }),
  defineOperation({
    name: 'drive.files.versions.add', class: 'write', single: true, input: { ...id, storage_path: T(600), body: T(200000), size_bytes: { type: 'int', min: 0 }, note: T(300), expected: { type: 'int', min: 1 } },
    run: async (q, ctx, i) => {
      const [f] = await q('select kind, current_version from files where id = $1', [i.id]);
      if (!f) return [];
      if (i.expected !== undefined && i.expected !== f.current_version) throw { code: '40001' };      // someone saved a newer version: the editor asks what to do instead of overwriting
      if (f.kind === 'file' && (!i.storage_path || i.body !== undefined)) throw bad('a file needs the path of its stored copy');
      if (f.kind === 'document' && (i.body === undefined || i.storage_path)) throw bad('a document needs its text');
      if (f.kind === 'file') i = { ...i, size_bytes: await verifyStored(ctx, i.storage_path, i.size_bytes) };
      await q('insert into file_versions (workspace_id, file_id, storage_path, body, size_bytes, note) values ($1,$2,$3,$4,$5,$6)', [ctx.orgId, i.id, f.kind === 'file' ? i.storage_path : null, f.kind === 'document' ? i.body : null, i.size_bytes ?? (i.body !== undefined ? byteLength(i.body) : null), i.note ?? null]);
      return q(`${FSELECT} where f.id = $1`, [i.id]);
    },
  }),
  defineOperation({ name: 'drive.files.versions', class: 'read', input: { file: { type: 'uuid', required: true } }, run: (q, _c, i) => q('select id, file_id, version, size_bytes::float8 as size_bytes, note, created_by, created_at from file_versions where file_id = $1 order by version desc', [i.file]) }),
  defineOperation({
    name: 'drive.files.version', class: 'read', single: true, input: { file: { type: 'uuid', required: true }, version: { type: 'int', min: 1 } },
    run: (q, _c, i) => q('select v.id, v.file_id, v.version, v.storage_path, v.body, v.size_bytes::float8 as size_bytes, v.note, v.created_at from file_versions v join files f on f.id = v.file_id where v.file_id = $1 and v.version = coalesce($2, f.current_version)', [i.file, i.version ?? null]),
  }),
  defineOperation({
    name: 'drive.files.update', class: 'write', single: true, input: { ...id, name: { type: 'text', min: 1, max: 200 }, folder: { type: 'uuid' }, to_root: { type: 'bool' } },
    run: async (q, _c, i) => {
      const sets = []; const p = [i.id];
      if (i.name !== undefined) { p.push(i.name); sets.push(`name = $${p.length}`); }
      if (i.folder !== undefined) { p.push(i.folder); sets.push(`folder_id = $${p.length}`); }
      if (i.to_root) sets.push('folder_id = null');
      if (sets.length && !(await q(`update files set ${sets.join(', ')} where id = $1 returning id`, p)).length) return [];
      return q(`${FSELECT} where f.id = $1`, [i.id]);
    },
  }),
  // Adds an app-owned file to the organization's Drive library, or takes it out again. Changes the flag only: the stored bytes and path stay where they are.
  defineOperation({
    name: 'drive.files.setLibrary', class: 'write', single: true, input: { ...id, in_library: { type: 'bool', required: true } },
    run: async (q, _c, i) => {
      if (!(await q('update files set in_library = $2 where id = $1 returning id', [i.id, i.in_library])).length) return [];
      return q(`${FSELECT} where f.id = $1`, [i.id]);
    },
  }),
  defineOperation({ name: 'drive.files.archive', class: 'write', single: true, input: id, run: (q, _c, i) => q('update files set archived_at = now() where id = $1 and archived_at is null returning id, archived_at', [i.id]) }),
  defineOperation({ name: 'drive.files.restore', class: 'write', single: true, input: id, run: (q, _c, i) => q('update files set archived_at = null where id = $1 and archived_at is not null returning id, archived_at', [i.id]) }),
  defineOperation({ name: 'drive.files.delete', class: 'write', single: true, input: id, run: (q, _c, i) => q('delete from files where id = $1 returning id', [i.id]) }),
  defineOperation({ name: 'drive.files.share', class: 'write', single: true, input: { ...id, visible: { type: 'bool', required: true } }, run: (q, _c, i) => q('update files set client_visible = $2 where id = $1 returning id, client_visible', [i.id, i.visible]) }),
];

// protected SOP documents: linked to from Clients, never copied
const sopOps = [
  defineOperation({ name: 'drive.sops.list', class: 'read', run: (q) => q(`${FSELECT} where f.protected_sop and f.archived_at is null order by f.sop_key, lower(f.name)`) }),
  defineOperation({
    name: 'drive.sops.protect', class: 'write', single: true, input: { ...id, protected: { type: 'bool', required: true }, sop_key: { type: 'text', min: 2, max: 41 } },
    run: (q, _c, i) => q('update files set protected_sop = $2, sop_key = case when $2 then $3 else null end where id = $1 returning id, protected_sop, sop_key', [i.id, i.protected, i.sop_key ?? null]),
  }),
];

const linkOps = [
  defineOperation({
    // the secret is returned ONCE; only its hash is stored
    name: 'drive.links.create', class: 'sensitive', single: true, input: { file: { type: 'uuid', required: true }, days: { type: 'int', min: 1, max: 31 } },
    run: async (q, ctx, i) => {
      const token = newLinkToken();
      const rows = await q(`insert into drive_share_links (workspace_id, file_id, token_hash, expires_at) values ($1, $2, encode(sha256(convert_to($3, 'UTF8')), 'hex'), now() + make_interval(days => $4::int)) returning id, file_id, expires_at`,
        [ctx.orgId, i.file, token, i.days ?? 7]);
      return rows.map((r) => ({ ...r, token }));
    },
  }),
  defineOperation({ name: 'drive.links.list', class: 'read', input: { file: { type: 'uuid', required: true } }, run: (q, _c, i) => q('select id, file_id, expires_at, revoked_at, use_count, last_used_at, created_by, created_at from drive_share_links where file_id = $1 order by created_at desc', [i.file]) }),
  defineOperation({ name: 'drive.links.revoke', class: 'write', single: true, input: id, run: (q, _c, i) => q('update drive_share_links set revoked_at = now() where id = $1 and revoked_at is null returning id, revoked_at', [i.id]) }),
];

// personal space: break-glass (reason, log, notice to the owner) and the notices
const personalOps = [
  defineOperation({
    name: 'drive.personal.open', class: 'sensitive', input: { owner: { type: 'uuid', required: true }, reason: { type: 'text', required: true, min: 10, max: 500 } },
    run: (q, _c, i) => q('select id, name, kind, folder_id, mime_type, size_bytes::float8 as size_bytes, current_version, updated_at, archived_at, storage_path, body from drive_break_glass_open($1, $2)', [i.owner, i.reason]),
  }),
  defineOperation({
    name: 'drive.breakglass.list', class: 'read',
    run: (q) => q(`select b.id, b.accessed_by, coalesce(a.display_name, a.email) as accessed_by_name, b.owner_id, coalesce(o.display_name, o.email) as owner_name, b.reason, b.files_seen, b.accessed_at
      from drive_break_glass b left join profiles a on a.id = b.accessed_by left join profiles o on o.id = b.owner_id order by b.accessed_at desc limit 200`),
  }),
  defineOperation({
    name: 'drive.notices.list', class: 'read', input: { unseen: { type: 'bool' } },
    run: (q, _c, i) => q(`select n.id, n.kind, n.created_at, n.seen_at, b.accessed_by, coalesce(a.display_name, a.email) as accessed_by_name, b.reason, b.files_seen
      from drive_notices n left join drive_break_glass b on b.id = n.break_glass_id left join profiles a on a.id = b.accessed_by
      where (not $1 or n.seen_at is null) order by n.created_at desc limit 100`, [i.unseen ?? false]),
  }),
  defineOperation({ name: 'drive.notices.seen', class: 'write', single: true, input: id, run: (q, _c, i) => q('update drive_notices set seen_at = coalesce(seen_at, now()) where id = $1 returning id, seen_at', [i.id]) }),
];

// ---- real bytes: where to put them, where to get them, and how much room is left
const uploadOps = [
  defineOperation({
    // Step 1 of an upload: the same permission as registering a file, and the cap is checked BEFORE any bytes move. The browser then PUTs the bytes to the returned
    // address and registers the path with drive.files.create (which looks at the stored copy and takes its real size).
    name: 'drive.uploads.sign', class: 'write', single: true,
    input: { space: SPACE, client: { type: 'uuid' }, name: NAME, size_bytes: { type: 'int', required: true, min: 1, max: MAX_FILE }, mime_type: T(120) },
    run: async (q, ctx, i) => {
      const storage = needStorage(ctx);
      if (i.space === 'client' && !i.client) throw bad('a client file needs its client');
      const [ok] = await q(`select case when $1 = 'shared' then private.has_permission($2, 'drive.file.upload')
        when $1 = 'client' then private.has_permission($2, 'drive.file.upload', $3) and private.has_permission($2, 'clients.client.view', $3)
        else private.can_use_app($2, 'drive') end as ok`, [i.space, ctx.orgId, i.client ?? null]);
      if (!ok?.ok) throw { code: 'PGRST116' };
      const [room] = await q('select (private.storage_used_bytes() + $1 <= (select cap_bytes from storage_settings)) as fits', [i.size_bytes]);
      if (!room?.fits) throw Object.assign(new Error('storage limit reached'), { code: 'P0001' });
      const path = newObjectPath({ workspaceId: ctx.orgId, space: i.space, clientId: i.client, ownerId: ctx.userId }, i.name);
      const r = await storage.signUpload({ path, size: i.size_bytes, contentType: i.mime_type ?? 'application/octet-stream' });
      return [{ path, url: r.url, method: r.method, headers: r.headers ?? {} }];
    },
  }),
  defineOperation({
    // A short-lived download address for the file (or one version of it). Row security decides whether the caller may read the file at all.
    name: 'drive.files.download', class: 'read', single: true, input: { ...id, version: { type: 'int', min: 1 } },
    run: async (q, ctx, i) => {
      const storage = needStorage(ctx);
      const [v] = await q(`select f.name, f.mime_type, v.storage_path, v.size_bytes::float8 as size_bytes, v.version from files f join file_versions v on v.file_id = f.id
        where f.id = $1 and f.kind = 'file' and v.version = coalesce($2, f.current_version)`, [i.id, i.version ?? null]);
      if (!v || !v.storage_path) return [];
      const r = await storage.signDownload({ path: v.storage_path, seconds: 300, fileName: v.name });
      return [{ url: r.url, expires_in_seconds: 300, name: v.name, mime_type: v.mime_type, size_bytes: v.size_bytes, version: v.version }];
    },
  }),
  defineOperation({ name: 'storage.usage', class: 'read', single: true, run: (q) => q('select total_bytes::float8 as total_bytes, cap_bytes::float8 as cap_bytes, org_bytes::float8 as org_bytes, files, versions, by_space from storage_usage()') }),
];

export const driveOperations = [...folderOps, ...fileOps, ...sopOps, ...linkOps, ...personalOps, ...uploadOps];
