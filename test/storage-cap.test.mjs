// Storage cap and usage (migration 0023) and the upload operations: the application refuses to register a stored file past the cap, counts the REAL size, signs uploads
// only for people who may upload, and shows admins the counter. Storage is a fake (memory driver); the real drivers are tested in storage-adapter.test.mjs.
import { randomUUID as id } from 'node:crypto';
import { openDb, migrate, session, recorder } from './lib.mjs';
import { createApi } from '../packages/core/api.mjs';
import { createPgExecutor } from '../packages/core/pg-executor.mjs';
import { createRateLimiter } from '../packages/core/rate-limit.mjs';
import { createSafeLogger } from '../packages/core/safe-log.mjs';

const db = await openDb(); await migrate(db);
const rawQuery = db.query.bind(db); db.query = async (s, p) => { try { return await rawQuery(s, p); } catch (e) { e.message += `   [SQL: ${String(s).slice(0, 110).replace(/\s+/g, ' ')}]`; throw e; } };
const { asUser, asSuper } = session(db); const { results, check, errCode } = recorder();
const rows = async (s, p = []) => (await db.query(s, p)).rows;
const affected = async (s, p = []) => (await db.query(s, p)).affectedRows;

let chain = Promise.resolve();
const acquire = () => { const prev = chain; let release; chain = new Promise((r) => { release = r; }); return prev.then(() => ({ query: (s, p) => db.query(s, p), release })); };
const BIG = { read: { max: 1e6, windowMs: 6e4 }, write: { max: 1e6, windowMs: 6e4 }, sensitive: { max: 1e6, windowMs: 6e4 } };
import { createMemoryStorage } from '../packages/core/storage-adapter.mjs';
const store = createMemoryStorage();
const api = createApi({ executor: createPgExecutor({ acquire, role: 'app_user' }), logger: createSafeLogger(() => {}), limiter: createRateLimiter({ limits: BIG }), storage: store });
const apiNoStorage = createApi({ executor: createPgExecutor({ acquire, role: 'app_user' }), logger: createSafeLogger(() => {}), limiter: createRateLimiter({ limits: BIG }) });
const call = (op, input, user, org = L) => api.handle({ operation: op, input, auth: { userId: user, email: 'x@example.com' }, headers: { 'x-org-id': org } });
const J = async (op, input, u, org) => { const r = await call(op, input, u, org); if (process.env.DEBUG_J) console.log('J', op, r.status, JSON.stringify(r.body).slice(0, 200)); return { ...r, data: r.body?.data, row: r.body?.data?.[0], code: r.body?.error?.code }; };

await asSuper();
const L = id(), A = id();
const U = { OWN: id(), ADM: id(), ED: id(), VW: id(), AOWN: id(), AED: id() };
await db.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','L'),($2,'aurj','A')", [L, A]);
const staff = (u, ws, r) => db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff',$3)", [ws, u, r]);
await staff(U.OWN, L, 'owner'); await staff(U.ADM, L, 'admin'); await staff(U.ED, L, 'editor'); await staff(U.VW, L, 'viewer'); await staff(U.AOWN, A, 'owner'); await staff(U.AED, A, 'editor');
const C1 = id(); await db.query("insert into clients (id,workspace_id,name) values ($1,$2,'Client One')", [C1, L]);
for (const u of [U.ED, U.VW]) for (const a of ['drive', 'clients']) await db.query("insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,$3)", [L, u, a]);
const lvl0 = async (n) => (await rows('select id from access_levels where workspace_id=$1 and name=$2', [L, n]))[0].id;
await db.query("insert into access_assignments (workspace_id,access_level_id,principal_type,principal_id) values ($1,$2,'user',$3)", [L, await lvl0('All clients · edit'), U.ED]);
await db.query("insert into access_assignments (workspace_id,access_level_id,principal_type,principal_id) values ($1,$2,'user',$3)", [L, await lvl0('All clients · read'), U.VW]);
await db.query("insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,'drive')", [A, U.AED]);

// the full upload path the browser follows: sign -> PUT the bytes -> register the path
const upload = async (u, bytes, { space = 'shared', client, name = 'report.pdf', org = L, claim = bytes } = {}) => {
  const s = await J('drive.uploads.sign', { space, ...(client ? { client } : {}), name, size_bytes: claim.length || 1, mime_type: 'application/pdf' }, u, org);
  if (s.status !== 200) return { sign: s };
  const path = s.row.path; await store.put(path, bytes);
  const c = await J('drive.files.create', { space, ...(client ? { client } : {}), name, kind: 'file', mime_type: 'application/pdf', storage_path: path, size_bytes: claim.length || 1 }, u, org);
  return { sign: s, create: c, path };
};

let r = await J('storage.usage', {}, U.ADM);
check('SC1', 'An admin sees the counter at zero against the default cap of 8,000,000,000 bytes', r.status === 200 && r.row.total_bytes === 0 && r.row.cap_bytes === 8000000000 && r.row.files === 0, JSON.stringify(r.body));
check('SC2', 'Editors and viewers do not see the counter (admins only), and another organization\'s admin sees only its own', (await J('storage.usage', {}, U.ED)).status === 404 && (await J('storage.usage', {}, U.VW)).status === 404 && (await J('storage.usage', {}, U.AOWN, A)).row.org_bytes === 0);

let u1 = await upload(U.ED, Buffer.alloc(1000, 'x'));
check('SC3', 'A normal upload: sign, put, register; the file is in Drive with its real size', u1.sign.status === 200 && u1.create.status === 200 && u1.create.row.size_bytes === 1000 && u1.sign.row.path.startsWith(`${L}/shared/`), JSON.stringify(u1.create?.body ?? u1.sign?.body));
r = await J('storage.usage', {}, U.ADM);
check('SC4', 'The counter now shows 1,000 bytes, one file, one stored version, and the space split', r.row.total_bytes === 1000 && r.row.org_bytes === 1000 && r.row.files === 1 && r.row.versions === 1 && r.row.by_space.shared === 1000, JSON.stringify(r.row));

// the size is the REAL size: a caller who claims less cannot hide bytes from the cap
const sneaky = await upload(U.ED, Buffer.alloc(5000, 'y'), { claim: Buffer.alloc(1) });
check('SC5', 'A caller who claims 1 byte but stored 5,000 is recorded at 5,000 (the stored copy is measured, not trusted)', sneaky.create.status === 200 && sneaky.create.row.size_bytes === 5000);
const ghost = await J('drive.files.create', { space: 'shared', name: 'ghost.pdf', kind: 'file', storage_path: `${L}/shared/${id()}/ghost.pdf`, size_bytes: 10 }, U.ED);
check('SC6', 'Registering a path where nothing was uploaded is refused', ghost.status === 422);
check('SC7', 'A viewer cannot get an upload address; neither can a person of another organization name this one', (await J('drive.uploads.sign', { space: 'shared', name: 'a.pdf', size_bytes: 5 }, U.VW)).status === 404 && (await J('drive.uploads.sign', { space: 'shared', name: 'a.pdf', size_bytes: 5 }, U.AED, L)).status === 404);
check('SC8', 'A client upload needs the client, and the right on that client', (await J('drive.uploads.sign', { space: 'client', name: 'a.pdf', size_bytes: 5 }, U.ED)).status === 422 && (await J('drive.uploads.sign', { space: 'client', client: C1, name: 'a.pdf', size_bytes: 5 }, U.ED)).status === 200 && (await J('drive.uploads.sign', { space: 'client', client: C1, name: 'a.pdf', size_bytes: 5 }, U.AED, A)).status === 404);
check('SC9', 'An upload path cannot be registered in another organization or space than it was signed for (the database checks the path)', (await J('drive.files.create', { space: 'shared', name: 'x.pdf', kind: 'file', storage_path: u1.path, size_bytes: 1000 }, U.AED, A)).status !== 200);

// ---- the cap
await asSuper(); await db.query('update storage_settings set cap_bytes = 10000');
let before = (await J('storage.usage', {}, U.ADM)).row.total_bytes;
const fits = await upload(U.ED, Buffer.alloc(4000, 'z'));
check('SC10', 'Up to the cap an upload works (total now 10,000 of 10,000)', fits.create.status === 200 && (await J('storage.usage', {}, U.ADM)).row.total_bytes === 10000);
const over = await upload(U.ED, Buffer.alloc(1, 'q'));
check('SC11', 'One byte over: signing is refused with the clear "storage limit" answer (507), before any bytes move', over.sign.status === 507 && over.sign.code === 'storage_limit' && /limit/i.test(over.sign.body.error.message), JSON.stringify(over.sign.body));
await store.put(`${L}/shared/${id()}/direct.bin`, Buffer.alloc(1)); const direct = `${L}/shared/${id()}/late.pdf`; await store.put(direct, Buffer.alloc(50));
const late = await J('drive.files.create', { space: 'shared', name: 'late.pdf', kind: 'file', storage_path: direct, size_bytes: 1 }, U.ED);
check('SC12', 'Even if bytes were put there some other way, registering is refused by the database itself (507), claim or no claim', late.status === 507 && late.code === 'storage_limit');
await asSuper();
check('SC13', 'The database trigger refuses a stored file version past the cap even without the API', (await errCode(() => db.query("insert into file_versions (workspace_id,file_id,storage_path,size_bytes) values ($1,(select id from files limit 1),$2,10)", [L, `${L}/shared/x/y`]))) === 'P0001');
check('SC14', 'A stored version must state its size (no free riders with an empty size)', (await errCode(() => db.query("insert into file_versions (workspace_id,file_id,storage_path) values ($1,(select id from files limit 1),$2)", [L, `${L}/shared/x/y`]))) === 'P0001');
check('SC15', 'Text documents kept in the database are not counted and are not blocked by the cap', (await J('drive.files.create', { space: 'shared', name: 'notes.md', kind: 'document', body: 'hello' }, U.ED)).status === 200);
r = await J('storage.usage', {}, U.ADM);
check('SC16', 'The counter still says 10,000 of 10,000 (nothing past the cap was recorded)', r.row.total_bytes === 10000 && r.row.cap_bytes === 10000 && r.row.versions === 3);

// ---- freeing space
await J('drive.files.archive', { id: sneaky.create.row.id }, U.ED);
check('SC17', 'Archiving a file does not free space (it can be restored)', (await J('storage.usage', {}, U.ADM)).row.total_bytes === 10000);
r = await J('drive.files.delete', { id: sneaky.create.row.id }, U.OWN);
check('SC18', 'Deleting an archived file frees its bytes at once', r.status === 200 && (await J('storage.usage', {}, U.ADM)).row.total_bytes === 5000);
const again = await upload(U.ED, Buffer.alloc(5000, 'r'));
check('SC19', 'The freed room can be used', again.create.status === 200);
// a second version of a stored file counts too
const v2 = Buffer.alloc(100, 'v'); const path2 = `${L}/shared/${id()}/v2.pdf`; await store.put(path2, v2);
r = await J('drive.files.versions.add', { id: u1.create.row.id, storage_path: path2, size_bytes: 100 }, U.ED);
check('SC20', 'A new version of a file counts against the cap as well (old versions stay)', r.status === 507);

// ---- storage not configured
const noStore = (op, input, u) => apiNoStorage.handle({ operation: op, input, auth: { userId: u, email: 'x@example.com' }, headers: { 'x-org-id': L } });
check('SC21', 'With no storage configured, signing and downloading answer "unavailable" (503), never a crash', (await noStore('drive.uploads.sign', { space: 'shared', name: 'a.pdf', size_bytes: 5 }, U.ED)).status === 503 && (await noStore('drive.files.download', { id: u1.create.row.id }, U.ED)).status === 503);

// ---- download addresses
r = await J('drive.files.download', { id: u1.create.row.id }, U.VW);
check('SC22', 'Anyone who can read the file gets a short-lived download address (300 seconds) with its name and size', r.status === 200 && r.row.url.includes(u1.path) && r.row.expires_in_seconds === 300 && r.row.name === 'report.pdf' && r.row.size_bytes === 1000, JSON.stringify(r.body));
check('SC23', 'A person without access gets "not found", not an address', (await J('drive.files.download', { id: u1.create.row.id }, U.AED, A)).status === 404 && (await J('drive.files.download', { id: id() }, U.OWN)).status === 404);
const doc = (await J('drive.files.create', { space: 'shared', name: 'n2.md', kind: 'document', body: 'x' }, U.ED)).row;
check('SC24', 'A text document has no download address (it is read as text)', (await J('drive.files.download', { id: doc.id }, U.OWN)).status === 404);
const cf = await upload(U.ED, Buffer.alloc(0), { space: 'client', client: C1, name: 'c.pdf', claim: Buffer.alloc(1) }).catch(() => null);
await asSuper(); await db.query('update storage_settings set cap_bytes = 8000000000');
check('SC25', 'Nobody can change the cap through the application (no write path to the setting)', (await errCode(async () => { await asUser(U.OWN); return db.query('update storage_settings set cap_bytes = 1e13'); })) !== 'no-error' || (await rows('select cap_bytes from storage_settings'))[0].cap_bytes === 8000000000);
await asSuper();
const au = JSON.stringify((await rows("select detail from audit_events where action like 'file_versions.%'")).map((x) => x.detail));
check('SC26', 'Registering stored files is audited by file and size, never by content', au.length > 20 && !au.includes('xxxx'));

for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}${x.ok ? '' : `  [${x.detail ?? ''}]`}`);
const p = results.filter((x) => x.ok).length; console.log(`\n${p}/${results.length} checks passed`); await db.close(); process.exit(p === results.length ? 0 : 1);
