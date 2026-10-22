// Backup and restore of stored files through the adapter, with fake S3 servers on both sides (source and a fresh target): everything arrives byte for byte,
// a tampered backup is refused, missing files are reported, orphans are listed, and an over-budget backup fails with its own error. No database.
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recorder } from './lib.mjs';
import { createS3Storage } from '../packages/core/storage-adapter.mjs';
import { backupStorage, restoreStorage } from '../scripts/lib/storage-backup.mjs';
import { startFakeS3 } from './fakes/fake-s3.mjs';

const { results, check } = recorder();
const mkS3 = (f) => createS3Storage({ endpoint: f.endpoint, bucket: f.bucket, accessKeyId: f.accessKeyId, secretAccessKey: f.secretAccessKey });
const src = await startFakeS3({ pageSize: 3 }); const dst = await startFakeS3({ pageSize: 3 });
const S = mkS3(src), D = mkS3(dst);
const files = { 'o1/shared/a/readme.txt': Buffer.from('hello'), 'o1/clients/c1/b/logo.png': Buffer.from([0, 1, 2, 3, 255, 254]), 'o1/clients/c1/b/big.bin': Buffer.alloc(100000, 7), 'o2/shared/c/x y.txt': Buffer.from('spaces'), 'o2/personal/u/d/n.txt': Buffer.from('mine') };
for (const [p, b] of Object.entries(files)) await S.put(p, b);
const dir = await mkdtemp(join(tmpdir(), 'sb-'));
const db = [...Object.entries(files)].map(([path, b]) => ({ path, size: b.length }));

const m = await backupStorage({ storage: S, dir, dbRows: db });
check('SB1', 'Backup reads every object (paged listing) and records count, total size and a SHA-256 for each', m.count === 5 && m.bytes === Object.values(files).reduce((a, b) => a + b.length, 0) && m.objects.every((o) => /^[0-9a-f]{64}$/.test(o.sha256)));
check('SB2', 'Nothing missing, no orphans, no size mismatches when the database and storage agree', m.report.missing.length === 0 && m.report.orphans.length === 0 && m.report.sizeMismatch.length === 0);
const r = await restoreStorage({ storage: D, dir });
check('SB3', 'Restore into a fresh bucket brings back every file', r.restored === 5 && dst.objects.size === 5);
check('SB4', 'Every restored file is byte for byte the original (including binary and names with spaces)', Object.entries(files).every(([p, b]) => dst.objects.get(p)?.equals(b)));

// tampering
const target = join(dir, 'objects', 'o1/shared/a/readme.txt'); const orig = await readFile(target);
await writeFile(target, Buffer.from('hellO')); const dst2 = await startFakeS3();
check('SB5', 'A backup file that was changed is refused before anything is uploaded (checksum)', await restoreStorage({ storage: mkS3(dst2), dir }).then(() => false, (e) => /checksum mismatch/.test(e.message)) && dst2.objects.size === 0);
await writeFile(target, orig);
await writeFile(join(dir, 'objects', 'o1', 'smuggled.txt'), 'extra');
check('SB6', 'A file added to the backup that the manifest does not list is refused', await restoreStorage({ storage: mkS3(dst2), dir }).then(() => false, (e) => /not in the manifest/.test(e.message)) && dst2.objects.size === 0);
await rm(join(dir, 'objects', 'o1', 'smuggled.txt'));
const mf = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8')); mf.objects[0].path = '../escape.txt'; await writeFile(join(dir, 'manifest.json'), JSON.stringify(mf));
check('SB7', 'A manifest that names a path outside the bucket is refused', await restoreStorage({ storage: mkS3(dst2), dir }).then(() => false, (e) => /unsafe path|checksum|not in the manifest/.test(e.message)) && dst2.objects.size === 0);

// reports
const dir2 = await mkdtemp(join(tmpdir(), 'sb-'));
const m2 = await backupStorage({ storage: S, dir: dir2, dbRows: [...db, { path: 'o1/shared/gone/lost.pdf', size: 10 }, { path: 'o1/shared/a/readme.txt', size: 999 }].filter((x) => x.path !== 'o2/personal/u/d/n.txt') });
check('SB8', 'A file the database registered but storage lacks is reported as MISSING', m2.report.missing.length === 1 && m2.report.missing[0] === 'o1/shared/gone/lost.pdf');
check('SB9', 'Objects in storage the database does not know are listed as orphans; a size that disagrees is flagged', m2.report.orphans.join() === 'o2/personal/u/d/n.txt' && m2.report.sizeMismatch.join() === 'o1/shared/a/readme.txt');
const dir3 = await mkdtemp(join(tmpdir(), 'sb-'));
check('SB10', 'A backup over its budget stops with its own error instead of filling the disk', await backupStorage({ storage: S, dir: dir3, maxBytes: 1000 }).then(() => false, (e) => e.code === 'BACKUP_TOO_LARGE'));
const empty = await startFakeS3(); const dir4 = await mkdtemp(join(tmpdir(), 'sb-'));
const m4 = await backupStorage({ storage: mkS3(empty), dir: dir4 });
check('SB11', 'An empty bucket backs up as an empty, valid backup (and restores to nothing)', m4.count === 0 && (await restoreStorage({ storage: mkS3(await startFakeS3()), dir: dir4 })).restored === 0);

for (const d of [dir, dir2, dir3, dir4]) await rm(d, { recursive: true, force: true });
for (const s of [src, dst, dst2, empty]) await s.close();
for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}${x.ok ? '' : `  [${x.detail ?? ''}]`}`);
const p = results.filter((x) => x.ok).length; console.log(`\n${p}/${results.length} checks passed`); process.exit(p === results.length ? 0 : 1);
