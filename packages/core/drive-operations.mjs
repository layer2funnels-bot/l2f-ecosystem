// Drive API operations (migration 0014): folders, files and first-party documents with versions, protected SOPs, share links, the personal
// space and its break-glass access. Same conventions as the other operation files: column names are constants, permissions are decided by row
// policies and triggers in the database (a refusal reads as "not found"), data and API only. Real file bytes are not handled here: the
// browser would upload to storage through a signed address (packages/core/storage.mjs, prepared), then register the path.
import { defineOperation } from './define.mjs';

const T = (max = 500) => ({ type: 'text', min: 0, max });
const id = { id: { type: 'uuid', required: true } };
const SPACE = { type: 'enum', values: ['shared', 'personal', 'client'], required: true };
const NAME = { type: 'text', required: true, min: 1, max: 200 };
const like = (q) => `%${String(q).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
const bad = (message) => Object.assign(new Error(message), { code: 'P0001' });       // reads as "invalid" in the API contract
const toBase64Url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const byteLength = (text) => new TextEncoder().encode(text).length;
export const newLinkToken = () => toBase64Url(crypto.getRandomValues(new Uint8Array(32)));

const FSELECT = `select f.id, f.space, f.client_id, f.owner_id, f.folder_id, f.name, f.kind, f.mime_type, f.size_bytes::float8 as size_bytes, f.current_version, f.protected_sop, f.sop_key,
    f.client_visible, f.uploaded_by, f.archived_at, f.created_at, f.updated_at from files f`;
const DSELECT = `select d.id, d.space, d.client_id, d.owner_id, d.parent_id, d.name, d.archived_at, d.created_at, d.updated_at,
    (select count(*)::int from files f where f.folder_id = d.id and f.archived_at is null) as files,
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
  defineOperation({ name: 'drive.folders.archive', class: 'write', single: true, input: id, run: (q, _c, i) => q('update drive_folders set archived_at = now() where id = $1 and archived_at is null returning id, archived_at', [i.id]) }),
  defineOperation({ name: 'drive.folders.restore', class: 'write', single: true, input: id, run: (q, _c, i) => q('update drive_folders set archived_at = null where id = $1 and archived_at is not null returning id, archived_at', [i.id]) }),
  defineOperation({ name: 'drive.folders.delete', class: 'write', single: true, input: id, run: (q, _c, i) => q('delete from drive_folders where id = $1 returning id', [i.id]) }),
];

const fileOps = [
  defineOperation({
    name: 'drive.files.list', class: 'read',
    input: { space: SPACE, client: { type: 'uuid' }, folder: { type: 'uuid' }, anywhere: { type: 'bool' }, archived: { type: 'bool' }, q: { type: 'text', max: 100 }, kind: { type: 'enum', values: ['file', 'document'] } },
    run: (q, _c, i) => q(`${FSELECT} where f.space = $1 and f.client_id is not distinct from $2 and ($3::boolean or f.folder_id is not distinct from $4) and ((f.archived_at is not null) = $5)
      and ($6::text is null or f.name ilike $6) and ($7::text is null or f.kind = $7) order by lower(f.name) limit 500`,
    [i.space, i.client ?? null, i.anywhere ?? false, i.folder ?? null, i.archived ?? false, i.q ? like(i.q) : null, i.kind ?? null]),
  }),
  defineOperation({ name: 'drive.files.get', class: 'read', single: true, input: id, run: (q, _c, i) => q(`${FSELECT} where f.id = $1`, [i.id]) }),
  defineOperation({
    // a file (bytes already uploaded to the signed address, path given) or a first-party document (text given); version 1 is created with it
    name: 'drive.files.create', class: 'write', single: true,
    input: { space: SPACE, client: { type: 'uuid' }, folder: { type: 'uuid' }, name: NAME, kind: { type: 'enum', values: ['file', 'document'], required: true }, mime_type: T(120), size_bytes: { type: 'int', min: 0 },
      storage_path: T(600), body: T(200000), note: T(300) },
    run: async (q, ctx, i) => {
      if (i.kind === 'file' && (!i.storage_path || i.body !== undefined)) throw bad('a file needs the path of its stored copy');
      if (i.kind === 'document' && (i.body === undefined || i.storage_path)) throw bad('a document needs its text');
      const [f] = await q('insert into files (workspace_id, space, client_id, owner_id, folder_id, name, kind, mime_type, size_bytes, storage_path, uploaded_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id',
        [ctx.orgId, i.space, i.client ?? null, i.space === 'personal' ? ctx.userId : null, i.folder ?? null, i.name, i.kind, i.mime_type ?? null, i.size_bytes ?? (i.body !== undefined ? byteLength(i.body) : null), i.kind === 'file' ? i.storage_path : null, ctx.userId]);
      await q('insert into file_versions (workspace_id, file_id, storage_path, body, size_bytes, note) values ($1,$2,$3,$4,$5,$6)', [ctx.orgId, f.id, i.kind === 'file' ? i.storage_path : null, i.kind === 'document' ? i.body : null, i.size_bytes ?? (i.body !== undefined ? byteLength(i.body) : null), i.note ?? null]);
      return q(`${FSELECT} where f.id = $1`, [f.id]);
    },
  }),
  defineOperation({
    name: 'drive.files.versions.add', class: 'write', single: true, input: { ...id, storage_path: T(600), body: T(200000), size_bytes: { type: 'int', min: 0 }, note: T(300) },
    run: async (q, ctx, i) => {
      const [f] = await q('select kind from files where id = $1', [i.id]);
      if (!f) return [];
      if (f.kind === 'file' && (!i.storage_path || i.body !== undefined)) throw bad('a file needs the path of its stored copy');
      if (f.kind === 'document' && (i.body === undefined || i.storage_path)) throw bad('a document needs its text');
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

export const driveOperations = [...folderOps, ...fileOps, ...sopOps, ...linkOps, ...personalOps];
