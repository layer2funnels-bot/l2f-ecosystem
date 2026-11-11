// Storage and Drive visibility are separate (migration 0025, owner decision 23 Oct 2026), for EVERY organization: the same scenarios run for
// Layer2Funnels and for Aurj. A file is stored once under its organization's prefix. Whether it appears in the organization's Drive is the library flag:
// files created in Drive are in the library; files that belong to an app's own records (projects, whiteboards, forms, portal ...) are stored but not listed
// until someone adds them; client and personal files can never be. Permissions, the storage cap and the backup do not look at the flag.
import { randomUUID as id } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, migrate, session, recorder } from './lib.mjs';
import { createApi } from '../packages/core/api.mjs';
import { createPgExecutor } from '../packages/core/pg-executor.mjs';
import { createRateLimiter } from '../packages/core/rate-limit.mjs';
import { createSafeLogger } from '../packages/core/safe-log.mjs';
import { createMemoryStorage } from '../packages/core/storage-adapter.mjs';
import { backupStorage, restoreStorage } from '../scripts/lib/storage-backup.mjs';

const db = await openDb(); await migrate(db);
const { asUser, asSuper } = session(db); const { results, check, errCode } = recorder();
const rows = async (s, p = []) => (await db.query(s, p)).rows;
let chain = Promise.resolve();
const acquire = () => { const prev = chain; let release; chain = new Promise((r) => { release = r; }); return prev.then(() => ({ query: (s, p) => db.query(s, p), release })); };
const BIG = { read: { max: 1e6, windowMs: 6e4 }, write: { max: 1e6, windowMs: 6e4 }, sensitive: { max: 1e6, windowMs: 6e4 } };
const storage = createMemoryStorage();
const api = createApi({ executor: createPgExecutor({ acquire, role: 'app_user' }), logger: createSafeLogger(() => {}), limiter: createRateLimiter({ limits: BIG }), storage });
const J = async (op, input, u, org) => { const r = await api.handle({ operation: op, input, auth: { userId: u, email: 'x@example.com' }, headers: { 'x-org-id': org } }); return { ...r, row: r.body?.data?.[0], rows: r.body?.data ?? [] }; };
const BOARD = 'application/vnd.excalidraw+json';

await asSuper();
const ORGS = { L: { id: id(), slug: 'layer2funnels', name: 'Layer2Funnels' }, A: { id: id(), slug: 'aurj', name: 'Aurj' } };
for (const o of Object.values(ORGS)) await db.query('insert into workspaces (id,slug,name) values ($1,$2,$3)', [o.id, o.slug, o.name]);
const BOTH = id();
const lvl = async (ws, name) => (await rows('select id from access_levels where workspace_id=$1 and name=$2', [ws, name]))[0].id;
for (const k of Object.keys(ORGS)) {
  const o = ORGS[k]; o.U = { OWN: id(), ED: id(), VW: id() }; o.C = id(); o.PI = id();
  await db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff','owner'),($1,$3,'staff','editor'),($1,$4,'staff','viewer'),($1,$5,'staff','owner')", [o.id, o.U.OWN, o.U.ED, o.U.VW, BOTH]);
  for (const u of [o.U.ED, o.U.VW]) for (const app of ['drive', 'projects', 'clients']) await db.query('insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,$3)', [o.id, u, app]);
  await db.query("insert into clients (id,workspace_id,name) values ($1,$2,'A client')", [o.C, o.id]);
  await db.query("insert into pm_projects (id,workspace_id,client_id,name,visibility) values ($1,$2,null,'Internal','organization')", [o.PI, o.id]);
  for (const n of ['All clients · edit', 'All projects · edit']) await db.query("insert into access_assignments (workspace_id,access_level_id,principal_type,principal_id) values ($1,$2,'user',$3)", [o.id, await lvl(o.id, n), o.U.ED]);
  for (const n of ['All clients · read', 'All projects · read']) await db.query("insert into access_assignments (workspace_id,access_level_id,principal_type,principal_id) values ($1,$2,'user',$3)", [o.id, await lvl(o.id, n), o.U.VW]);
}
const names = (r) => r.rows.map((x) => x.name).sort().join('|');
const made = {};

for (const k of ['L', 'A']) {
  const o = ORGS[k]; const U = o.U; const T = `${k}`;
  const drive = (extra = {}, u = U.ED, org = o.id) => J('drive.files.list', { space: 'shared', anywhere: true, ...extra }, u, org);
  // ---- creation: library by default, app-owned when an app owns it
  const lib = (await J('drive.files.create', { space: 'shared', name: `${T} library doc`, kind: 'document', body: 'hello' }, U.ED, o.id)).row;
  check(`LB1${T}`, `${o.name}: a document created in Drive is in the library and listed`, lib?.in_library === true && lib.managed_by === null && names(await drive()).includes(`${T} library doc`));
  const forms = (await J('drive.files.create', { space: 'shared', app: 'forms', name: `${T} form attachment`, kind: 'document', body: 'x' }, U.ED, o.id)).row;
  const projDoc = (await J('drive.files.create', { space: 'shared', project: o.PI, name: `${T} project doc`, kind: 'document', body: 'x' }, U.ED, o.id)).row;
  const board = (await J('drive.files.create', { space: 'shared', app: 'whiteboard', name: `${T} loose board`, kind: 'document', mime_type: BOARD, body: '{}' }, U.ED, o.id)).row;
  check(`LB2${T}`, `${o.name}: files owned by an app (forms, a project, the whiteboard) are stored but not in the library`, [forms, projDoc, board].every((f) => f && f.in_library === false) && forms.managed_by === 'forms' && projDoc.managed_by === 'projects' && board.managed_by === 'whiteboard');
  const all = names(await drive());
  check(`LB3${T}`, `${o.name}: none of them appears in Drive, at the root or searching everywhere or by name`, all === `${T} library doc` && names(await drive({ q: 'project' })) === '' && names(await J('drive.files.list', { space: 'shared' }, U.ED, o.id)) === `${T} library doc`);
  check(`LB4${T}`, `${o.name}: the owning apps still reach them (open by id, project list, boards list), with the owner's permissions`, (await J('drive.files.get', { id: forms.id }, U.ED, o.id)).status === 200 && names(await J('drive.project.files', { project: o.PI }, U.ED, o.id)) === `${T} project doc` && names(await J('drive.boards.list', {}, U.ED, o.id)) === `${T} loose board` && (await J('drive.files.version', { file: projDoc.id }, U.VW, o.id)).status === 200);
  // ---- a stored file: the bytes sit in storage the whole time, only the flag changes
  const path = `${o.id}/shared/${id()}/scan.pdf`; await storage.put(path, Buffer.from(`%PDF bytes of ${T}`));
  const stored = (await J('drive.files.create', { space: 'shared', app: 'portal', name: `${T} scan.pdf`, kind: 'file', mime_type: 'application/pdf', storage_path: path, size_bytes: 1 }, U.ED, o.id)).row;
  check(`LB5${T}`, `${o.name}: an uploaded file owned by an app is registered with its real stored size and is not listed in Drive`, stored?.in_library === false && Number(stored.size_bytes) === Buffer.from(`%PDF bytes of ${T}`).length && !names(await drive()).includes('scan.pdf'));
  const before = (await rows('select storage_path from files where id=$1', [stored.id]))[0].storage_path; const headBefore = await storage.head(path);
  let r = await J('drive.files.setLibrary', { id: stored.id, in_library: true }, U.ED, o.id);
  check(`LB6${T}`, `${o.name}: adding it to the library lists it in Drive, and moves nothing: same storage path, same stored object`, r.status === 200 && r.row.in_library === true && names(await drive()).includes('scan.pdf') && (await rows('select storage_path from files where id=$1', [stored.id]))[0].storage_path === before && (await storage.head(path)).size === headBefore.size);
  r = await J('drive.files.setLibrary', { id: stored.id, in_library: false }, U.ED, o.id);
  check(`LB7${T}`, `${o.name}: taking it out hides it again; the file and its bytes stay`, r.row.in_library === false && !names(await drive()).includes('scan.pdf') && (await storage.head(path)) !== null);
  check(`LB8${T}`, `${o.name}: a viewer cannot change what is in the library`, (await J('drive.files.setLibrary', { id: forms.id, in_library: true }, U.VW, o.id)).status === 404 && !names(await drive()).includes('form attachment'));
  // ---- client and personal files can never be library files
  const cdoc = (await J('drive.files.create', { space: 'client', client: o.C, app: 'clients', name: `${T} client doc`, kind: 'document', body: 'x' }, U.ED, o.id)).row;
  const pdoc = (await J('drive.files.create', { space: 'personal', name: `${T} personal doc`, kind: 'document', body: 'x' }, U.ED, o.id)).row;
  check(`LB9${T}`, `${o.name}: a client file and a personal file refuse to join the shared library, with a clear message`, (await J('drive.files.setLibrary', { id: cdoc.id, in_library: true }, U.ED, o.id)).status === 422 && (await J('drive.files.setLibrary', { id: pdoc.id, in_library: true }, U.ED, o.id)).status === 422 && cdoc.in_library === false && pdoc.in_library === false);
  check(`LB10${T}`, `${o.name}: they still list in their own spaces (client Documents, My Drive) and never in the shared Drive`, names(await J('drive.files.list', { space: 'client', client: o.C }, U.ED, o.id)).includes('client doc') && names(await J('drive.files.list', { space: 'personal' }, U.ED, o.id)).includes('personal doc') && !names(await drive()).includes('client doc') && !names(await drive()).includes('personal doc'));
  // ---- protected SOPs always stay in the library
  await asSuper(); await db.query("update files set protected_sop = true, sop_key = $2 where id = $1", [lib.id, `sop_${T.toLowerCase()}`]);
  check(`LB11${T}`, `${o.name}: a protected SOP is always in the library and cannot be taken out`, (await rows('select in_library from files where id=$1', [lib.id]))[0].in_library === true && (await errCode(() => db.query('update files set in_library = false where id = $1', [lib.id]))) === 'P0001');
  Object.assign(made, { [k]: { lib, forms, projDoc, board, stored, cdoc, pdoc, path } });
}

// ---- isolation between the two organizations
const L = ORGS.L, A = ORGS.A, mL = made.L, mA = made.A;
check('LB12', 'Neither organization’s Drive shows the other’s files, library or app-owned, and opening them by id is "not found"',
  names(await J('drive.files.list', { space: 'shared', anywhere: true }, A.U.OWN, A.id)).includes('A library doc') && !names(await J('drive.files.list', { space: 'shared', anywhere: true }, A.U.OWN, A.id)).includes('L ')
  && (await J('drive.files.get', { id: mL.lib.id }, A.U.OWN, A.id)).status === 404 && (await J('drive.files.get', { id: mA.forms.id }, L.U.OWN, L.id)).status === 404
  && (await J('drive.files.get', { id: mL.lib.id }, A.U.OWN, L.id)).status === 404);
const asL = await J('drive.files.list', { space: 'shared', anywhere: true }, BOTH, L.id), asA = await J('drive.files.list', { space: 'shared', anywhere: true }, BOTH, A.id);
check('LB13', 'A person who belongs to both organizations sees only the organization the request names, and only its library', names(asL) === 'L library doc' && names(asA) === 'A library doc');
check('LB14', 'The app lists are separated the same way (boards and project files of one organization never show in the other)', names(await J('drive.boards.list', {}, BOTH, L.id)) === 'L loose board' && names(await J('drive.boards.list', {}, BOTH, A.id)) === 'A loose board' && (await J('drive.project.files', { project: L.PI }, BOTH, A.id)).rows.length === 0);
check('LB15', 'A project of one organization cannot be used to attach a file in the other', (await J('drive.files.create', { space: 'shared', project: L.PI, name: 'x', kind: 'document', body: 'x' }, A.U.ED, A.id)).status === 404);
await asSuper();
check('LB16', 'Storage paths keep the organizations apart whatever the visibility: every file’s stored object lives under its own organization', (await rows('select f.workspace_id, f.storage_path from files f where f.storage_path is not null')).every((x) => x.storage_path.startsWith(`${x.workspace_id}/`)));
check('LB17', 'A stored path of the other organization is refused', (await J('drive.files.create', { space: 'shared', app: 'portal', name: 'sneaky.pdf', kind: 'file', storage_path: `${L.id}/shared/${id()}/sneaky.pdf`, size_bytes: 1 }, A.U.ED, A.id)).status >= 400);

// ---- the cap and the usage counter count every stored byte, visible or not
const usage = await J('storage.usage', {}, L.U.OWN, L.id);
check('LB18', 'The usage counter and the cap count app-owned files too (they are stored bytes)', Number(usage.row.org_bytes) >= Buffer.from('%PDF bytes of L').length && Number(usage.row.files) >= 1);

// ---- backup and restore see objects, not visibility
const objects = [...(await (async () => { const out = []; for await (const o of storage.list('')) out.push(o); return out; })())];
const dbRows = (await rows('select storage_path as path, size_bytes::float8 as size from file_versions where storage_path is not null'));
const dir = await mkdtemp(join(tmpdir(), 'lib-bk-'));
const m = await backupStorage({ storage, dir, dbRows });
const target = createMemoryStorage(); const back = await restoreStorage({ storage: target, dir });
const same = await Promise.all(objects.map(async (o) => Buffer.compare(await storage.get(o.path), await target.get(o.path)) === 0));
check('LB19', 'The storage backup copies every stored object of both organizations, hidden or listed, and reports nothing missing or orphaned', m.count === objects.length && m.count >= 2 && m.report.missing.length === 0 && m.report.orphans.length === 0 && objects.some((o) => o.path.startsWith(`${L.id}/`)) && objects.some((o) => o.path.startsWith(`${A.id}/`)));
check('LB20', 'Restore brings back every object byte for byte, so the app-owned files that never showed in Drive are back too', back.restored === m.count && same.every(Boolean));
check('LB21', 'The backup manifest keeps the organizations apart by prefix and holds no flag: it does not know what Drive shows', m.objects.every((x) => x.path.startsWith(`${L.id}/`) || x.path.startsWith(`${A.id}/`)) && !JSON.stringify(m).includes('in_library'));
await rm(dir, { recursive: true, force: true });

// ---- the database itself
check('LB22', 'The database refuses a library file in a client or personal space, and a change of the owning app', (await errCode(() => db.query("update files set in_library = true where id = $1", [mL.cdoc.id]))) === 'P0001' && (await errCode(() => db.query("update files set managed_by = 'portal' where id = $1", [mL.forms.id]))) === 'P0001' && (await errCode(() => db.query("update files set managed_by = null where id = $1", [mL.projDoc.id]))) === 'P0001');
const au = JSON.stringify((await rows("select detail from audit_events where action like 'files.%'")).map((x) => x.detail));
check('LB23', 'Audit names the owning app and the library flag, never the content', au.includes('in_library') && au.includes('managed_by') && !au.includes('hello') && !au.includes('PDF bytes'));
const dbL = await rows('select count(*)::int n from files f where f.workspace_id = $1 and not f.in_library', [L.id]);
check('LB24', 'The new columns carry the rule for old data too: nothing owned by a project or client is in the library', (await rows("select count(*)::int n from files where (project_id is not null or space <> 'shared') and in_library"))[0].n === 0 && dbL[0].n >= 4);

for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(6)} ${x.name}`);
const pc = results.filter((x) => x.ok).length; console.log(`\n${pc}/${results.length} checks passed`); await db.close(); process.exit(pc === results.length ? 0 : 1);
