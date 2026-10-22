// Backup and restore of stored FILES (the database dump does not contain them). Pure logic over the storage adapter, so it is tested with fake servers;
// the scripts around it add tar + age (encryption). A manifest records every object with its size and SHA-256; restore refuses anything that does not match.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const safe = (p) => { if (p.includes('..') || p.startsWith('/') || p.includes('\\') || p.includes('//')) throw new Error(`refusing unsafe path: ${p}`); return p; };

// dbRows: [{ path, size }] registered in the database (optional). Reports files registered but missing in storage (a real problem) and objects in storage the
// database does not know (orphans: uploaded but never registered, or left behind).
export async function backupStorage({ storage, dir, dbRows = null, maxBytes = Infinity, onProgress = () => {} }) {
  await mkdir(join(dir, 'objects'), { recursive: true });
  const objects = []; let total = 0;
  for await (const o of storage.list('')) {
    safe(o.path); total += o.size;
    if (total > maxBytes) throw Object.assign(new Error(`the files total more than the backup budget (${maxBytes} bytes)`), { code: 'BACKUP_TOO_LARGE' });
    const bytes = await storage.get(o.path);
    if (bytes.length !== o.size) throw new Error(`size changed while reading ${o.path}`);
    const target = join(dir, 'objects', o.path); await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes);
    objects.push({ path: o.path, size: bytes.length, sha256: sha(bytes) }); onProgress(objects.length);
  }
  const have = new Map(objects.map((o) => [o.path, o]));
  const report = { missing: [], orphans: [], sizeMismatch: [] };
  if (dbRows) {
    const reg = new Map(dbRows.map((r) => [r.path, r]));
    for (const r of reg.values()) { const o = have.get(r.path); if (!o) report.missing.push(r.path); else if (Number(r.size) !== o.size) report.sizeMismatch.push(r.path); }
    for (const o of objects) if (!reg.has(o.path)) report.orphans.push(o.path);
  }
  const manifest = { version: 1, driver: storage.driver, created_at: new Date().toISOString(), count: objects.length, bytes: total, objects, report };
  await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 1));
  return manifest;
}

// Puts every object of a backup directory into a (fresh) storage, after checking each file against the manifest.
export async function restoreStorage({ storage, dir, onProgress = () => {} }) {
  const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
  if (manifest.version !== 1) throw new Error('unknown backup format');
  // every file in the directory must be listed (nothing smuggled in), and every listed file must match
  const listed = new Set(manifest.objects.map((o) => o.path));
  const onDisk = []; const walk = async (d, rel) => { for (const e of await readdir(d, { withFileTypes: true })) { const p = rel ? `${rel}/${e.name}` : e.name; if (e.isDirectory()) await walk(join(d, e.name), p); else onDisk.push(p); } };
  await walk(join(dir, 'objects'), '');
  const extra = onDisk.filter((p) => !listed.has(p)); if (extra.length) throw new Error(`files not in the manifest: ${extra.slice(0, 3).join(', ')}`);
  for (const o of manifest.objects) {
    safe(o.path); const bytes = await readFile(join(dir, 'objects', o.path));
    if (bytes.length !== o.size || sha(bytes) !== o.sha256) throw new Error(`checksum mismatch: ${o.path}`);
  }
  let n = 0;
  for (const o of manifest.objects) { await storage.put(o.path, await readFile(join(dir, 'objects', o.path))); n += 1; onProgress(n); }
  return { restored: n, bytes: manifest.bytes };
}

export const dirBytes = async (dir) => { let t = 0; for (const e of await readdir(dir, { withFileTypes: true })) { const p = join(dir, e.name); t += e.isDirectory() ? await dirBytes(p) : (await stat(p)).size; } return t; };
