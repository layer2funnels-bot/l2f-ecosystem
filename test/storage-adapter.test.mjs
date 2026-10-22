// The storage adapter against fake servers: an S3-compatible one that verifies SigV4 itself (stands in for Cloudflare R2) and a fake of Supabase Storage's REST
// interface. No database. A request signed wrongly is refused by the fake exactly as the real service would refuse it.
import { recorder } from './lib.mjs';
import { createS3Storage, createSupabaseStorage, createMemoryStorage, storageFromEnv, signV4, enc } from '../packages/core/storage-adapter.mjs';
import { startFakeS3 } from './fakes/fake-s3.mjs';
import { startFakeSupabaseStorage } from './fakes/fake-supabase-storage.mjs';

const { results, check } = recorder();
const bytes = (n, fill = 'a') => Buffer.from(fill.repeat(n));

// ---- the signing algorithm itself: the published AWS test vector (get-vanilla)
const v = signV4({ method: 'GET', host: 'example.amazonaws.com', path: '/', payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY', region: 'us-east-1', service: 'service', date: new Date('2015-08-30T12:36:00Z') });
check('SA1', 'SigV4 reproduces the published AWS test vector exactly', v.signature === '5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31');
check('SA2', 'Percent-encoding follows RFC 3986 (the characters AWS singles out)', enc("a b!'()*") === 'a%20b%21%27%28%29%2A');

// ---- S3 (Cloudflare R2 later): the fake verifies signatures
const f = await startFakeS3({ pageSize: 2 });
const mk = (over = {}) => createS3Storage({ endpoint: f.endpoint, bucket: f.bucket, accessKeyId: f.accessKeyId, secretAccessKey: f.secretAccessKey, ...over });
const s3 = mk();
const P = 'org-1/clients/c-1/f1/hello world & ü+.txt';
await s3.put(P, bytes(10), 'text/plain');
check('SA3', 'Signed PUT is accepted by a server that checks signatures, and the object is stored byte for byte', f.objects.get(P)?.length === 10);
check('SA4', 'HEAD returns the real size; a missing object is null (not an error)', (await s3.head(P))?.size === 10 && (await s3.head('nope/x')) === null);
check('SA5', 'GET returns the bytes', (await s3.get(P)).equals(bytes(10)));
for (let n = 0; n < 4; n += 1) await s3.put(`org-1/shared/f${n}/file${n}.bin`, bytes(n + 1));
const listed = []; for await (const o of s3.list('org-1/')) listed.push(o);
check('SA6', 'List walks every page (page size 2 here) and returns paths and sizes, with special characters intact', listed.length === 5 && listed.some((o) => o.path === P && o.size === 10) && listed.reduce((a, o) => a + o.size, 0) === 10 + 1 + 2 + 3 + 4);
const onlyShared = []; for await (const o of s3.list('org-1/shared/')) onlyShared.push(o.path);
check('SA7', 'A prefix lists only its own objects', onlyShared.length === 4 && onlyShared.every((p) => p.startsWith('org-1/shared/')));
await s3.remove('org-1/shared/f0/file0.bin');
check('SA8', 'Delete removes the object; deleting a missing one is not an error', !f.objects.has('org-1/shared/f0/file0.bin') && (await s3.remove('org-1/shared/f0/file0.bin')) === undefined);
const bad = mk({ secretAccessKey: 'wrong' });
check('SA9', 'Wrong keys are refused by the server (403), so a mis-set secret fails loudly', await bad.head(P).then(() => false, (e) => /403/.test(e.message)));

// presigned addresses used by a plain HTTP client, like a browser
const up = await s3.signUpload({ path: 'org-1/shared/up1/new.bin', size: 6, seconds: 600 });
let r = await fetch(up.url, { method: up.method, body: bytes(6), headers: up.headers });
check('SA10', 'A presigned upload address accepts the declared size and stores the bytes', r.status === 200 && f.objects.get('org-1/shared/up1/new.bin')?.length === 6);
const up2 = await s3.signUpload({ path: 'org-1/shared/up2/big.bin', size: 6, seconds: 600 });
r = await fetch(up2.url, { method: 'PUT', body: bytes(9) });
check('SA11', 'The same address refuses a different size: the signature fixes the size, so the declared size is the real one', r.status === 403 && !f.objects.has('org-1/shared/up2/big.bin'));
r = await fetch(up.url.replace('up1/new.bin', 'up1/other.bin'), { method: 'PUT', body: bytes(6) });
check('SA12', 'An upload address is good for that path only', r.status === 403);
const dl = await s3.signDownload({ path: 'org-1/shared/up1/new.bin', seconds: 300 });
r = await fetch(dl.url);
check('SA13', 'A presigned download address returns the bytes without any key', r.status === 200 && Buffer.from(await r.arrayBuffer()).equals(bytes(6)));
r = await fetch(dl.url.replace(/X-Amz-Signature=[0-9a-f]{4}/, 'X-Amz-Signature=0000'));
check('SA14', 'A tampered address is refused', r.status === 403);
const past = mk({ now: () => new Date(Date.now() - 3600 * 1000) });
const old = await past.signDownload({ path: 'org-1/shared/up1/new.bin', seconds: 60 });
check('SA15', 'An expired address is refused', (await fetch(old.url)).status === 403);
check('SA16', 'Address lifetime is capped (a day-long request still yields at most an hour)', /X-Amz-Expires=3600/.test((await s3.signDownload({ path: 'org-1/x', seconds: 86400 })).url));

// ---- Supabase Storage (go-live default)
const sb = await startFakeSupabaseStorage();
const supa = createSupabaseStorage({ url: sb.url, serviceKey: sb.serviceKey, bucket: sb.bucket });
await supa.put('org-1/shared/a/one.txt', bytes(5)); await supa.put('org-1/clients/c-1/b/two.txt', bytes(7)); await supa.put('org-1/clients/c-1/b/three ü.txt', bytes(3));
check('SA17', 'Supabase driver: put, head, get', (await supa.head('org-1/shared/a/one.txt'))?.size === 5 && (await supa.get('org-1/clients/c-1/b/two.txt')).equals(bytes(7)) && (await supa.head('zzz')) === null);
const sup = await supa.signUpload({ path: 'org-1/shared/c/up.bin' });
r = await fetch(sup.url, { method: sup.method, body: bytes(4) });
check('SA18', 'Supabase driver: the signed upload address takes the bytes; a different path does not', r.status === 200 && sb.objects.get('org-1/shared/c/up.bin')?.length === 4 && (await fetch(sup.url.replace('c/up.bin', 'c/other.bin'), { method: 'PUT', body: bytes(1) })).status === 403);
const sd = await supa.signDownload({ path: 'org-1/shared/a/one.txt', seconds: 120, fileName: 'one.txt' });
check('SA19', 'Supabase driver: the signed download address works and names the download', (await fetch(sd.url)).status === 200 && /download=one\.txt/.test(sd.url));
const sl = []; for await (const o of supa.list('org-1/')) sl.push(o);
check('SA20', 'Supabase driver: list walks folders recursively with sizes', sl.length === 4 && sl.reduce((a, o) => a + o.size, 0) === 5 + 7 + 3 + 4, JSON.stringify(sl));
const noKey = createSupabaseStorage({ url: sb.url, serviceKey: 'wrong', bucket: sb.bucket });
check('SA21', 'Supabase driver: a wrong server key is refused', await noKey.head('org-1/shared/a/one.txt').then(() => false, (e) => /401/.test(e.message)));
await supa.remove('org-1/shared/a/one.txt');
check('SA22', 'Supabase driver: delete', !sb.objects.has('org-1/shared/a/one.txt'));

// ---- selection from the environment, and the memory driver
const mem = createMemoryStorage(); await mem.put('a/b', bytes(2));
check('SA23', 'Memory driver behaves like the others (tests only)', (await mem.head('a/b')).size === 2 && (await mem.head('x')) === null);
check('SA24', 'The driver comes from the environment: none configured is null, a bad name or missing keys throws', storageFromEnv({}) === null && storageFromEnv({ STORAGE_DRIVER: 'memory' }).driver === 'memory'
  && storageFromEnv({ STORAGE_DRIVER: 's3', S3_ENDPOINT: f.endpoint, S3_BUCKET: 'b', S3_ACCESS_KEY_ID: 'k', S3_SECRET_ACCESS_KEY: 's' }).driver === 's3'
  && (() => { try { storageFromEnv({ STORAGE_DRIVER: 's3' }); return false; } catch { return true; } })() && (() => { try { storageFromEnv({ STORAGE_DRIVER: 'dropbox' }); return false; } catch { return true; } })());

await f.close(); await sb.close();
for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}${x.ok ? '' : `  [${x.detail ?? ''}]`}`);
const p = results.filter((x) => x.ok).length; console.log(`\n${p}/${results.length} checks passed`); process.exit(p === results.length ? 0 : 1);
