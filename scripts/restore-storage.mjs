// Restore of a storage backup into the configured (target) storage. Decrypts with the PRIVATE age key (kept offline by the owner), checks every file against the
// manifest, then uploads. Use it on a fresh bucket; it overwrites objects with the same path.
//   AGE_IDENTITY=/path/to/key.txt  STORAGE_DRIVER=...(target)  node scripts/restore-storage.mjs l2f-storage-backup-<stamp>.tar.age
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { storageFromEnv } from '../packages/core/storage-adapter.mjs';
import { restoreStorage } from './lib/storage-backup.mjs';

const [archive] = process.argv.slice(2);
const storage = storageFromEnv(process.env);
if (!archive || !process.env.AGE_IDENTITY || !storage) { console.error('usage: AGE_IDENTITY=key.txt STORAGE_DRIVER=... node scripts/restore-storage.mjs <archive.tar.age>'); process.exit(1); }
const work = mkdtempSync(join(tmpdir(), 'l2f-storage-restore-'));
try {
  const x = spawnSync('bash', ['-c', `age -d -i "$AGE_IDENTITY" "${archive}" | tar -C "${work}" -xf -`], { stdio: 'inherit' });
  if (x.status !== 0) { console.error('could not decrypt or unpack the archive'); process.exit(1); }
  const r = await restoreStorage({ storage, dir: work });
  console.log(`restored ${r.restored} files, ${r.bytes} bytes`);
} finally { rmSync(work, { recursive: true, force: true }); }
