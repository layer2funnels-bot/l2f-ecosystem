// Nightly backup of the stored FILES (PREPARED; the database backup is scripts/backup-supabase.sh). Reads every object from the configured storage, checks them
// against the database's list of registered files (optional), writes a manifest with SHA-256s, and produces ONE encrypted archive.
//   STORAGE_DRIVER=... (same variables as the API)   AGE_RECIPIENT=age1...   [SUPABASE_DB_URL=... to cross-check]   [BACKUP_MAX_BYTES=400000000]
//   [BACKUP_S3_ENDPOINT/BACKUP_S3_BUCKET/BACKUP_S3_ACCESS_KEY_ID/BACKUP_S3_SECRET_ACCESS_KEY: upload the archive to a second S3-compatible bucket instead of keeping a file]
// Exit codes: 0 ok · 1 failed · 3 a registered file is MISSING from storage (the backup is written but the job fails loudly) · 4 backup larger than its budget.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { storageFromEnv, createS3Storage } from '../packages/core/storage-adapter.mjs';
import { backupStorage } from './lib/storage-backup.mjs';

const storage = storageFromEnv(process.env);
if (!storage) { console.error('No storage configured.'); process.exit(1); }
if (!process.env.AGE_RECIPIENT) { console.error('AGE_RECIPIENT (the public key) is required: backups are always encrypted.'); process.exit(1); }
const work = mkdtempSync(join(tmpdir(), 'l2f-storage-backup-')); const stamp = new Date().toISOString().replace(/[-:]|\.\d{3}/g, '');
try {
  let dbRows = null;
  if (process.env.SUPABASE_DB_URL) {
    const pg = (await import('pg')).default; const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL }); await c.connect();
    dbRows = (await c.query('select storage_path as path, size_bytes::float8 as size from file_versions where storage_path is not null')).rows; await c.end();
  }
  const maxBytes = Number(process.env.BACKUP_MAX_BYTES ?? 400000000);
  let manifest;
  try { manifest = await backupStorage({ storage, dir: join(work, 'files'), dbRows, maxBytes }); }
  catch (e) { if (e.code === 'BACKUP_TOO_LARGE') { console.error(`${e.message}. Choose a backup destination for large files (docs/GO_LIVE_RUNBOOK.md, "Storage backup").`); process.exit(4); } throw e; }
  const out = `l2f-storage-backup-${stamp}.tar.age`;
  const tar = spawnSync('bash', ['-c', `tar -C "${work}/files" -cf - . | age -r "$AGE_RECIPIENT" > "${out}"`], { stdio: 'inherit' });
  if (tar.status !== 0) { console.error('encryption failed'); process.exit(1); }
  console.log(`wrote ${out}: ${manifest.count} files, ${manifest.bytes} bytes; missing ${manifest.report.missing.length}, orphans ${manifest.report.orphans.length}, size mismatches ${manifest.report.sizeMismatch.length}`);
  if (process.env.BACKUP_S3_ENDPOINT) {
    const dest = createS3Storage({ endpoint: process.env.BACKUP_S3_ENDPOINT, bucket: process.env.BACKUP_S3_BUCKET, accessKeyId: process.env.BACKUP_S3_ACCESS_KEY_ID, secretAccessKey: process.env.BACKUP_S3_SECRET_ACCESS_KEY, region: process.env.BACKUP_S3_REGION || 'auto' });
    await dest.put(`storage-backups/${out}`, readFileSync(out), 'application/octet-stream'); console.log(`uploaded to the backup bucket as storage-backups/${out}`);
  }
  if (manifest.report.missing.length) { console.error(`MISSING from storage: ${manifest.report.missing.slice(0, 5).join(', ')}${manifest.report.missing.length > 5 ? ' …' : ''}`); process.exit(3); }
} finally { rmSync(work, { recursive: true, force: true }); }
