// Drive V8 (P04, migration 0061): Move/Copy between Library and Personal, stars, opens (Recent, "You opened …"), presence heartbeat,
// Reset to original, and document attachments (pictures inside Docs/Slides, stored once per organization by content hash).
// Every rule lives in the database (security-definer functions and row security); these operations only shape input and output.
import { defineOperation } from './define.mjs';

const ids = (max = 500) => ({ type: 'list', items: 'uuid', max });
const bad = (message) => Object.assign(new Error(message), { code: 'P0001' });
const needStorage = (ctx) => { if (!ctx.storage) throw { code: 'STORAGE_OFF' }; return ctx.storage; };
const SHA = /^[0-9a-f]{64}$/;
const IMG = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const FCOLS = `f.id, f.space, f.client_id, f.owner_id, f.folder_id, f.name, f.kind, f.mime_type, f.size_bytes::float8 as size_bytes, f.current_version, f.protected_sop,
  f.in_library, f.uploaded_by, f.archived_at, f.created_at, f.updated_at, (f.locked_at is not null) as locked`;

export const driveV8Operations = [
  // ---------------------------------------------------------------- Move / Copy
  defineOperation({
    name: 'drive.transfer.preview', class: 'read', single: true, input: { files: ids(), folders: ids() },
    run: async (q, _c, i) => [(await q('select public.drive_transfer_preview($1::uuid[], $2::uuid[]) as p', [i.files ?? [], i.folders ?? []]))[0].p],
  }),
  defineOperation({
    name: 'drive.transfer', class: 'write', single: true,
    input: { files: ids(), folders: ids(), to: { type: 'enum', values: ['shared', 'personal'], required: true }, folder: { type: 'uuid' }, copy: { type: 'bool' } },
    run: async (q, _c, i) => {
      if (!(i.files?.length || i.folders?.length)) throw bad('choose something to move');
      return [(await q('select public.drive_transfer($1::uuid[], $2::uuid[], $3, $4, $5) as r', [i.files ?? [], i.folders ?? [], i.to, i.folder ?? null, !!i.copy]))[0].r];
    },
  }),

  // ---------------------------------------------------------------- stars (per person, every device)
  defineOperation({ name: 'drive.stars.list', class: 'read', run: (q) => q('select file_id, folder_id, created_at from drive_stars order by created_at desc limit 2000') }),
  defineOperation({
    name: 'drive.stars.set', class: 'write', single: true, input: { file: { type: 'uuid' }, folder: { type: 'uuid' }, on: { type: 'bool', required: true } },
    run: async (q, ctx, i) => {
      if (!i.file === !i.folder) throw bad('star one file or one folder');
      if (i.on) await q('insert into drive_stars (workspace_id, file_id, folder_id) values ($1, $2, $3) on conflict do nothing', [ctx.orgId, i.file ?? null, i.folder ?? null]);
      else await q('delete from drive_stars where file_id is not distinct from $1 and folder_id is not distinct from $2', [i.file ?? null, i.folder ?? null]);
      return [{ file_id: i.file ?? null, folder_id: i.folder ?? null, on: i.on }];
    },
  }),

  // ---------------------------------------------------------------- opens: Recent and "You opened …"
  defineOperation({
    name: 'drive.opens.touch', class: 'save', single: true, input: { file: { type: 'uuid', required: true } },
    run: (q, ctx, i) => q('insert into drive_opens (workspace_id, file_id) values ($1, $2) on conflict (user_id, file_id) do update set opened_at = now() returning file_id, opened_at', [ctx.orgId, i.file]),
  }),
  defineOperation({
    name: 'drive.recent', class: 'read', input: { limit: { type: 'int', min: 1, max: 200 } },
    // files you opened (newest first), then files changed recently that you can see; never client files (search and suggestions exclude them, C4)
    run: (q, _c, i) => q(`select ${FCOLS}, o.opened_at from files f left join drive_opens o on o.file_id = f.id
      where f.archived_at is null and f.client_id is null and f.managed_by is null and (f.space = 'personal' or f.in_library)
      order by o.opened_at desc nulls last, f.updated_at desc limit $1`, [i.limit ?? 50]),
  }),

  // ---------------------------------------------------------------- presence (D5: real heartbeats only; nothing is shown that did not happen)
  defineOperation({
    name: 'drive.presence.beat', class: 'save', input: { file: { type: 'uuid', required: true }, mode: { type: 'enum', values: ['viewing', 'editing'] }, leave: { type: 'bool' } },
    run: async (q, ctx, i) => {
      if (i.leave) { await q('delete from drive_presence where file_id = $1 and user_id = private.current_user_id()', [i.file]); return []; }
      await q(`insert into drive_presence (workspace_id, file_id, mode) values ($1, $2, $3)
        on conflict (file_id, user_id) do update set mode = excluded.mode, seen_at = now()`, [ctx.orgId, i.file, i.mode ?? 'viewing']);
      return q(`select p.user_id, p.mode, p.seen_at, coalesce(pr.display_name, 'Someone') as name from drive_presence p left join profiles pr on pr.id = p.user_id
        where p.file_id = $1 and p.seen_at > now() - interval '45 seconds' and p.user_id <> private.current_user_id() order by p.seen_at desc limit 12`, [i.file]);
    },
  }),
  defineOperation({
    name: 'drive.files.lastEdit', class: 'read', single: true, input: { file: { type: 'uuid', required: true } },
    run: (q, _c, i) => q(`select v.created_by as user_id, coalesce(pr.display_name, 'Someone') as name, v.created_at from file_versions v left join profiles pr on pr.id = v.created_by
      where v.file_id = $1 order by v.version desc limit 1`, [i.file]),
  }),

  // ---------------------------------------------------------------- Image / PDF: original + latest edit, Reset to original
  defineOperation({
    name: 'drive.files.resetOriginal', class: 'write', single: true, input: { id: { type: 'uuid', required: true }, expected: { type: 'int', min: 1 } },
    run: async (q, _c, i) => { await q('select public.drive_reset_original($1, $2)', [i.id, i.expected ?? null]); return q(`select ${FCOLS} from files f where f.id = $1`, [i.id]); },
  }),
  defineOperation({
    name: 'drive.files.original', class: 'read', single: true, input: { id: { type: 'uuid', required: true } },
    run: async (q, ctx, i) => {
      const storage = needStorage(ctx);
      const [v] = await q(`select v.version, v.storage_path, v.size_bytes::float8 as size_bytes, f.name, f.current_version from files f join file_versions v on v.file_id = f.id
        where f.id = $1 and f.kind = 'file' order by v.version limit 1`, [i.id]);
      if (!v?.storage_path) return [];
      const r = await storage.signDownload({ path: v.storage_path, seconds: 300, fileName: v.name });
      return [{ url: r.url, version: v.version, size_bytes: v.size_bytes, edited: v.current_version !== v.version }];
    },
  }),

  // ---------------------------------------------------------------- document attachments
  // 1) sign: the editor sends the picture's SHA-256 first. Known in this organization -> it is reused at once (no upload). Otherwise a signed address.
  defineOperation({
    name: 'drive.assets.sign', class: 'save', single: true,
    input: { file: { type: 'uuid', required: true }, sha256: { type: 'text', required: true, min: 64, max: 64 }, mime_type: { type: 'text', required: true, max: 40 }, size_bytes: { type: 'int', required: true, min: 1, max: 10485760 } },
    run: async (q, ctx, i) => {
      if (!SHA.test(i.sha256) || !IMG[i.mime_type]) throw bad('only PNG, JPEG, GIF and WebP pictures');
      const [known] = await q('select public.drive_asset_register($1, $2, null, null, null, null, null) as id', [i.file, i.sha256]);
      if (known?.id) return [{ asset: known.id, reused: true }];
      const [room] = await q('select (private.storage_used_bytes() + $1 <= (select cap_bytes from storage_settings)) as fits', [i.size_bytes]);
      if (!room?.fits) throw bad('storage limit reached');
      const path = `${ctx.orgId}/assets/${i.sha256}.${IMG[i.mime_type]}`;
      const r = await needStorage(ctx).signUpload({ path, size: i.size_bytes, contentType: i.mime_type });
      return [{ path, url: r.url, method: r.method ?? 'PUT', headers: r.headers ?? {} }];
    },
  }),
  // 2) register: the server reads the stored bytes and checks their hash (a wrong hash would let one picture stand in for another)
  defineOperation({
    name: 'drive.assets.register', class: 'save', single: true,
    input: { file: { type: 'uuid', required: true }, sha256: { type: 'text', required: true, min: 64, max: 64 }, path: { type: 'text', required: true, max: 600 },
      mime_type: { type: 'text', required: true, max: 40 }, width: { type: 'int', min: 1, max: 20000 }, height: { type: 'int', min: 1, max: 20000 } },
    run: async (q, ctx, i) => {
      if (!SHA.test(i.sha256) || !IMG[i.mime_type] || i.path !== `${ctx.orgId}/assets/${i.sha256}.${IMG[i.mime_type]}`) throw bad('that picture does not match its upload');
      const storage = needStorage(ctx);
      const bytes = await storage.get(i.path).catch(() => null);
      if (!bytes) throw bad('the upload was not found');
      if (bytes.length > 10485760) throw bad('pictures can be up to 10 MB');
      if (hex(await crypto.subtle.digest('SHA-256', bytes)) !== i.sha256) { await storage.remove?.(i.path).catch(() => {}); throw bad('that picture does not match its upload'); }
      const [r] = await q('select public.drive_asset_register($1, $2, $3, $4, $5, $6, $7) as id', [i.file, i.sha256, i.path, i.mime_type, bytes.length, i.width ?? null, i.height ?? null]);
      return [{ asset: r.id }];
    },
  }),
  // 3) url: a short-lived address for an attachment of a document the caller can open
  defineOperation({
    name: 'drive.assets.url', class: 'read', input: { file: { type: 'uuid', required: true }, assets: { type: 'list', items: 'uuid', max: 200, required: true } },
    run: async (q, ctx, i) => {
      const storage = needStorage(ctx);
      const rows = await q(`select a.id, a.storage_path, a.mime_type, a.width, a.height from doc_asset_refs r join doc_assets a on a.id = r.asset_id
        where r.file_id = $1 and a.id = any($2::uuid[])`, [i.file, i.assets]);
      return Promise.all(rows.map(async (a) => ({ id: a.id, url: (await storage.signDownload({ path: a.storage_path, seconds: 300 })).url, mime_type: a.mime_type, width: a.width, height: a.height })));
    },
  }),
];
