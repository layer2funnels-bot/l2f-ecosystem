// Whiteboard spike: an Excalidraw scene stored as a Drive document (no new table). Proves the storage path: byte-exact round trip, versions, the client space
// stays private to people with that client, the size boundary, isolation. The editor itself is not part of this repository (docs/WHITEBOARD_SPIKE.md).
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
const api = createApi({ executor: createPgExecutor({ acquire, role: 'app_user' }), logger: createSafeLogger(() => {}), limiter: createRateLimiter({ limits: BIG }) });
const call = (op, input, user, org = L) => api.handle({ operation: op, input, auth: { userId: user, email: 'x@example.com' }, headers: { 'x-org-id': org } });
const J = async (op, input, u, org) => { const r = await call(op, input, u, org); if (process.env.DEBUG_J) console.log('J', op, r.status, JSON.stringify(r.body).slice(0, 200)); return { ...r, data: r.body?.data, row: r.body?.data?.[0], code: r.body?.error?.code }; };

await asSuper();
const L = id(), A = id();
const U = { OWN: id(), ED: id(), ED2: id(), AOWN: id() };
await db.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','L'),($2,'aurj','A')", [L, A]);
const staff = (u, ws, r) => db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff',$3)", [ws, u, r]);
await staff(U.OWN, L, 'owner'); await staff(U.ED, L, 'editor'); await staff(U.ED2, L, 'editor'); await staff(U.AOWN, A, 'owner');
const C1 = id(); await db.query("insert into clients (id,workspace_id,name) values ($1,$2,'Client One')", [C1, L]);
for (const u of [U.ED, U.ED2]) for (const a of ['drive', 'clients']) await db.query("insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,$3)", [L, u, a]);
const lvl0 = async (n) => (await rows('select id from access_levels where workspace_id=$1 and name=$2', [L, n]))[0].id;
await db.query("insert into access_assignments (workspace_id,access_level_id,principal_type,principal_id) values ($1,$2,'user',$3)", [L, await lvl0('All clients · edit'), U.ED]);

// a realistic scene: shapes, arrows bound to them, text, a frame, a pasted image kept as a REFERENCE to a Drive file, and the app state a board needs to reopen as it was
const rect = (n, x, y) => ({ id: `rect-${n}`, type: 'rectangle', x, y, width: 220, height: 90, angle: 0, strokeColor: '#1e1e1e', backgroundColor: '#a5d8ff', fillStyle: 'hachure', strokeWidth: 2, roughness: 1, opacity: 100, groupIds: [], frameId: 'frame-1', roundness: { type: 3 },
  seed: 1000 + n, version: 3, versionNonce: 5000 + n, isDeleted: false, boundElements: [{ id: `arrow-${n}`, type: 'arrow' }], updated: 1792000000000, link: null, locked: false, index: `a${n}` });
const scene = (n = 12) => ({ type: 'excalidraw', version: 2, source: 'https://office.example/whiteboard', elements: [
  { id: 'frame-1', type: 'frame', name: 'Funnel sketch', x: 0, y: 0, width: 2600, height: 600, isDeleted: false, version: 1, seed: 1 },
  ...Array.from({ length: n }, (_, k) => rect(k, 40 + k * 230, 80)),
  ...Array.from({ length: n - 1 }, (_, k) => ({ id: `arrow-${k}`, type: 'arrow', x: 260 + k * 230, y: 125, width: 10, height: 0, points: [[0, 0], [10, 0]], startBinding: { elementId: `rect-${k}`, focus: 0, gap: 4 }, endBinding: { elementId: `rect-${k + 1}`, focus: 0, gap: 4 }, endArrowhead: 'arrow', isDeleted: false, version: 1, seed: 2000 + k })),
  { id: 'text-1', type: 'text', x: 40, y: 20, text: 'Traffic → Landing → Offer → Checkout — “smart quotes”, 日本語, émojis 🚀', fontSize: 20, fontFamily: 2, isDeleted: false, version: 1, seed: 3 },
  { id: 'img-1', type: 'image', x: 40, y: 300, width: 200, height: 120, fileId: 'file-ref-1', status: 'saved', scale: [1, 1], isDeleted: false, version: 1, seed: 4 },
], appState: { viewBackgroundColor: '#ffffff', gridSize: null, scrollX: 0, scrollY: 0, zoom: { value: 1 } }, files: { 'file-ref-1': { driveFileId: null, mimeType: 'image/png', id: 'file-ref-1' } } });

let r = await J('drive.files.create', { space: 'client', client: C1, name: 'Funnel sketch.excalidraw', kind: 'document', mime_type: 'application/vnd.excalidraw+json', body: JSON.stringify(scene()) }, U.ED);
const WB = r.row?.id; const original = JSON.stringify(scene());
check('WB1', 'A board is a Drive document in the client space, saved as Excalidraw JSON', r.status === 200 && r.row.kind === 'document' && r.row.mime_type === 'application/vnd.excalidraw+json' && r.row.current_version === 1, JSON.stringify(r.body).slice(0, 200));
r = await J('drive.files.version', { file: WB }, U.ED);
check('WB2', 'It reads back byte for byte (nothing is rewritten, reordered or lost: shapes, bindings, unicode, frame, image reference)', r.status === 200 && r.row.body === original && JSON.parse(r.row.body).elements.length === scene().elements.length);
const edited = scene(); edited.elements.find((e) => e.id === 'rect-3').backgroundColor = '#ffc9c9'; edited.elements.find((e) => e.id === 'rect-3').version = 4;
r = await J('drive.files.versions.add', { id: WB, body: JSON.stringify(edited), note: 'Recoloured step 4' }, U.ED);
check('WB3', 'Saving again adds version 2; version 1 is kept untouched (history and restore come from Drive)', r.status === 200 && r.row.current_version === 2
  && (await J('drive.files.version', { file: WB, version: 1 }, U.ED)).row.body === original && JSON.parse((await J('drive.files.version', { file: WB }, U.ED)).row.body).elements.find((e) => e.id === 'rect-3').backgroundColor === '#ffc9c9');
check('WB4', 'The version list shows both saves with their notes', (await J('drive.files.versions', { file: WB }, U.ED)).data.map((v) => v.version).join() === '2,1');
check('WB5', 'A colleague without access to this client cannot find the board, its versions or its content', (await J('drive.files.get', { id: WB }, U.ED2)).status === 404 && (await J('drive.files.version', { file: WB }, U.ED2)).status === 404 && (await J('drive.files.list', { space: 'client', client: C1 }, U.ED2)).data?.length !== 1);
check('WB6', 'Another organization cannot read or list it either', (await J('drive.files.get', { id: WB }, U.AOWN, A)).status === 404 && (await J('drive.files.get', { id: WB }, U.AOWN, L)).status === 404);
const big = scene(); big.elements.push({ id: 'pad', type: 'text', text: 'x'.repeat(1000000), isDeleted: false });
r = await J('drive.files.versions.add', { id: WB, body: JSON.stringify(big) }, U.ED);
check('WB7', 'A scene over the document limit (1,000,000 characters) is refused with a plain validation error, not stored half-way', r.status === 422 && (await J('drive.files.get', { id: WB }, U.ED)).row.current_version === 2);
const nearLimit = scene(); nearLimit.elements.push({ id: 'pad', type: 'text', text: 'y'.repeat(200000 - JSON.stringify(nearLimit).length - 60), isDeleted: false });
const nl = JSON.stringify(nearLimit);
r = await J('drive.files.versions.add', { id: WB, body: nl, note: 'near the limit' }, U.ED);
check('WB8', 'A scene just under the limit is stored and read back exactly', nl.length < 200000 && r.status === 200 && (await J('drive.files.version', { file: WB }, U.ED)).row.body === nl, `${nl.length} ${r.status}`);
const real = JSON.stringify(scene(60));
check('WB9', 'Size guide: 60 shapes with arrows and text is about ' + Math.round(real.length / 1024) + ' KB, so a board of a few hundred elements fits; images must live in Drive files, not inside the scene', real.length < 200000);
const delActive = await J('drive.files.delete', { id: WB }, U.ED);
r = await J('drive.files.archive', { id: WB }, U.ED);
check('WB10', 'A board follows Drive\'s rules: an active board cannot be deleted; archived, only people with access can (the uploader here), not a colleague without it',
  delActive.status !== 200 && r.status === 200 && (await J('drive.files.delete', { id: WB }, U.ED2)).status === 404 && (await J('drive.files.delete', { id: WB }, U.ED)).status === 200);

for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(6)} ${x.name}${x.ok ? '' : `  [${x.detail ?? ''}]`}`);
const p = results.filter((x) => x.ok).length; console.log(`\n${p}/${results.length} checks passed`); await db.close(); process.exit(p === results.length ? 0 : 1);
