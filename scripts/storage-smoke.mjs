// Smoke test for a configured storage service: signed upload, size check, signed download, listing, delete. Leaves nothing behind.
// Use it (1) against the local stack, (2) right after the switch-over to Cloudflare R2, (3) after go-live. Needs the same variables the API uses:
//   STORAGE_DRIVER=supabase STORAGE_URL=... STORAGE_SERVER_KEY=... [STORAGE_BUCKET=drive]
//   STORAGE_DRIVER=s3 S3_ENDPOINT=... S3_BUCKET=... S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... [S3_REGION=auto]
//   node scripts/storage-smoke.mjs        (exit 0 = every step worked)
import { storageFromEnv } from '../packages/core/storage-adapter.mjs';
import { newObjectPath } from '../packages/core/storage.mjs';

const storage = storageFromEnv(process.env);
if (!storage) { console.error('No storage configured (set STORAGE_DRIVER and its variables).'); process.exit(2); }
const org = process.env.SMOKE_ORG || '00000000-0000-4000-8000-0000000000ff';          // a throw-away organization prefix: nothing real is touched
const path = newObjectPath({ workspaceId: org, space: 'shared' }, 'smoke test.txt');
const body = Buffer.from(`smoke ${new Date().toISOString()}`);
const steps = []; const step = async (name, f) => { try { const r = await f(); steps.push([name, r === false ? 'FAIL' : 'ok']); } catch (e) { steps.push([name, `FAIL (${e.message})`]); } };
await step('signed upload address', async () => { const u = await storage.signUpload({ path, size: body.length, contentType: 'text/plain' }); const r = await fetch(u.url, { method: u.method, body, headers: u.headers }); return r.ok; });
await step('stored size is measured (head)', async () => (await storage.head(path))?.size === body.length);
await step('signed download returns the bytes', async () => { const d = await storage.signDownload({ path, seconds: 60, fileName: 'smoke.txt' }); const r = await fetch(d.url); return r.ok && Buffer.from(await r.arrayBuffer()).equals(body); });
await step('listing finds it', async () => { for await (const o of storage.list(`${org}/`)) if (o.path === path && o.size === body.length) return true; return false; });
await step('delete', async () => { await storage.remove(path); return (await storage.head(path)) === null; });
for (const [n, r] of steps) console.log(`${r === 'ok' ? 'PASS' : 'FAIL'}  ${n}${r === 'ok' ? '' : `  ${r}`}`);
process.exit(steps.every(([, r]) => r === 'ok') ? 0 : 1);
