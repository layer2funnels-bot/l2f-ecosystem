// Context link for Drive documents (migration 0024, V4-4): a document or whiteboard can belong to a project and then opens inside it.
// Same-organization link, client files stay in the client's space, internal project files in the shared Drive, personal never, the link is
// fixed, visibility needs the project too, and saves that would overwrite a newer version are refused.
import { randomUUID as id } from 'node:crypto';
import { openDb, migrate, session, recorder } from './lib.mjs';
import { createApi } from '../packages/core/api.mjs';
import { createPgExecutor } from '../packages/core/pg-executor.mjs';
import { createRateLimiter } from '../packages/core/rate-limit.mjs';
import { createSafeLogger } from '../packages/core/safe-log.mjs';

const db = await openDb(); await migrate(db);
const { asUser, asSuper } = session(db); const { results, check, errCode } = recorder();
const rows = async (s, p = []) => (await db.query(s, p)).rows;
let chain = Promise.resolve();
const acquire = () => { const prev = chain; let release; chain = new Promise((r) => { release = r; }); return prev.then(() => ({ query: (s, p) => db.query(s, p), release })); };
const BIG = { read: { max: 1e6, windowMs: 6e4 }, write: { max: 1e6, windowMs: 6e4 }, sensitive: { max: 1e6, windowMs: 6e4 } };
const api = createApi({ executor: createPgExecutor({ acquire, role: 'app_user' }), logger: createSafeLogger(() => {}), limiter: createRateLimiter({ limits: BIG }) });
const J = async (op, input, u, org = L) => { const r = await api.handle({ operation: op, input, auth: { userId: u, email: 'x@example.com' }, headers: { 'x-org-id': org } }); return { ...r, row: r.body?.data?.[0], rows: r.body?.data }; };

await asSuper();
const L = id(), A = id();
const U = { OWN: id(), ED: id(), PM: id(), VW: id(), CL1: id(), AOWN: id() };
await db.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','L'),($2,'aurj','A')", [L, A]);
const staff = (u, ws, r) => db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff',$3)", [ws, u, r]);
await staff(U.OWN, L, 'owner'); await staff(U.ED, L, 'editor'); await staff(U.PM, L, 'editor'); await staff(U.VW, L, 'viewer'); await staff(U.AOWN, A, 'owner');
for (const u of [U.ED, U.PM, U.VW]) for (const app of ['drive', 'projects', 'clients']) await db.query("insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,$3)", [L, u, app]);
const lvl = async (name) => (await rows('select id from access_levels where workspace_id=$1 and name=$2', [L, name]))[0].id;
const assign = async (u, l) => db.query("insert into access_assignments (workspace_id,access_level_id,principal_type,principal_id) values ($1,$2,'user',$3)", [L, l, u]);
const C1 = id(), C2 = id(), PI = id(), P1 = id(), P2 = id(), PA = id();
await db.query("insert into clients (id,workspace_id,name) values ($1,$3,'Client One'),($2,$3,'Client Two')", [C1, C2, L]);
await db.query("insert into projects (id,workspace_id,client_id,name) values ($1,$5,null,'Internal'),($2,$5,$6,'One'),($3,$5,$7,'Two'),($4,$8,null,'Aurj project')", [PI, P1, P2, PA, L, C1, C2, A]);
await db.query("insert into memberships (workspace_id,user_id,kind,client_id) values ($1,$2,'client',$3)", [L, U.CL1, C1]);
await db.query("update workspace_apps set enabled=true where workspace_id=$1 and app_key='portal'", [L]);
await assign(U.ED, await lvl('All clients · edit')); await assign(U.ED, await lvl('All projects · edit'));
await assign(U.VW, await lvl('All projects · read')); await assign(U.VW, await lvl('All clients · read'));
const BOARD = 'application/vnd.excalidraw+json';

// ---- A. creating inside a project
let r = await J('drive.files.create', { space: 'shared', project: PI, name: 'Kickoff board', kind: 'document', mime_type: BOARD, body: '{"elements":[]}' }, U.ED);
const board = r.row;
check('FC1', 'A document is created inside an internal project (shared Drive, no client); it carries the project and its first version', r.status === 200 && board?.project_id === PI && board.space === 'shared' && board.current_version === 1);
r = await J('drive.files.create', { space: 'client', client: C1, project: P1, name: 'Client One map', kind: 'document', mime_type: BOARD, body: '{}' }, U.ED);
const cboard = r.row;
check('FC2', 'A document in a CLIENT project lives in that client’s own space, never in the shared Drive', r.status === 200 && cboard.space === 'client' && cboard.client_id === C1 && cboard.project_id === P1);
check('FC3', 'A client project cannot hold a shared-Drive document (it would put client work where everyone can see it)', (await J('drive.files.create', { space: 'shared', project: P1, name: 'x', kind: 'document', body: 'x' }, U.ED)).status === 422);
check('FC4', 'An internal project cannot hold a client-space document, and a document cannot sit in another client’s project', (await J('drive.files.create', { space: 'client', client: C1, project: PI, name: 'x', kind: 'document', body: 'x' }, U.ED)).status === 422
  && (await J('drive.files.create', { space: 'client', client: C1, project: P2, name: 'x', kind: 'document', body: 'x' }, U.ED)).status === 422);
check('FC5', 'The personal space never takes a project (private stays private)', (await J('drive.files.create', { space: 'personal', project: PI, name: 'x', kind: 'document', body: 'x' }, U.ED)).status === 422);
check('FC6', 'A project of another organization is refused, as if it did not exist', (await J('drive.files.create', { space: 'shared', project: PA, name: 'x', kind: 'document', body: 'x' }, U.ED)).status === 404);
check('FC7', 'A made-up project id is refused the same way', (await J('drive.files.create', { space: 'shared', project: id(), name: 'x', kind: 'document', body: 'x' }, U.ED)).status === 404);

// ---- B. the link is fixed; listing by project
await asSuper();
check('FC8', 'The link is fixed at creation: changing or removing it is refused', (await errCode(() => db.query('update files set project_id = $2 where id = $1', [board.id, P1]))) === 'P0001' && (await errCode(() => db.query('update files set project_id = null where id = $1', [board.id]))) === 'P0001');
r = await J('drive.project.files', { project: PI }, U.ED);
check('FC9', 'A project lists its own documents and nothing else', r.status === 200 && r.rows.length === 1 && r.rows[0].id === board.id);
check('FC10', 'The list can be limited to whiteboards, and archived ones are only listed when asked', (await J('drive.project.files', { project: PI, mime: BOARD }, U.ED)).rows.length === 1 && (await J('drive.project.files', { project: PI, mime: 'text/plain' }, U.ED)).rows.length === 0 && (await J('drive.project.files', { project: PI, archived: true }, U.ED)).rows.length === 0);
r = await J('drive.project.files', { project: P1 }, U.ED);
check('FC11', 'A client project lists its client-space documents', r.rows.length === 1 && r.rows[0].id === cboard.id);
check('FC12', 'The shared Drive list never shows client documents, even those inside a project', !(await J('drive.files.list', { space: 'shared', anywhere: true }, U.ED)).rows.some((f) => f.id === cboard.id));

// ---- C. who sees what
check('FC13', 'A viewer sees a project’s documents (read only) and cannot add to a project', (await J('drive.project.files', { project: PI }, U.VW)).rows.length === 1 && (await J('drive.files.create', { space: 'shared', project: PI, name: 'v', kind: 'document', body: 'x' }, U.VW)).status === 404);
check('FC14', 'An editor with no project level cannot see the project, so cannot see its documents through it either', (await J('drive.project.files', { project: PI }, U.PM)).rows.length === 0 && (await J('drive.project.files', { project: P1 }, U.PM)).rows.length === 0);
// the restrictive policy: take the project away from a person who can still read the Drive space, and the document goes with it
await db.query("insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,'drive') on conflict do nothing", [L, U.PM]);
const sharedDoc = (await J('drive.files.create', { space: 'shared', name: 'Plain shared doc', kind: 'document', body: 'x' }, U.ED)).row;
check('FC15', 'The same person still reads a plain shared document, so the missing project is what hides the project document', (await J('drive.files.list', { space: 'shared' }, U.PM)).rows.some((f) => f.id === sharedDoc.id) && !(await J('drive.files.list', { space: 'shared', anywhere: true }, U.PM)).rows.some((f) => f.id === board.id));
check('FC16', 'Nor can they open it by id, or save over it', (await J('drive.files.get', { id: board.id }, U.PM)).status === 404 && (await J('drive.files.versions.add', { id: board.id, body: 'x' }, U.PM)).status === 404);
await asSuper();
await db.query('update files set client_visible = true where id = $1', [cboard.id]);
await asUser(U.CL1);
check('FC17', 'A client contact does not see a shared document of a project that was not shared with them', (await rows('select id from files')).length === 0);
await asSuper(); await db.query('update projects set client_visible = true where id = $1', [P1]);
await asUser(U.CL1);
check('FC18', 'Only when both the document and the project were shared does the client contact see it', (await rows('select id from files')).map((x) => x.id).join() === cboard.id);
await asSuper();
check('FC19', 'The other organization sees none of it', (await (async () => { await asUser(U.AOWN); return (await rows('select id from files where workspace_id = $1', [L])).length; })()) === 0);

// ---- D. saving: expected version
await asSuper();
r = await J('drive.files.versions.add', { id: board.id, body: '{"elements":[1]}', expected: 1 }, U.ED);
check('FC20', 'A save that names the version it started from succeeds and becomes version 2', r.status === 200 && r.row.current_version === 2);
r = await J('drive.files.versions.add', { id: board.id, body: '{"elements":[2]}', expected: 1 }, U.OWN);
check('FC21', 'A second save from the same starting version is refused as a conflict, not silently written over the first', r.status === 409 && (await rows('select count(*)::int n from file_versions where file_id=$1', [board.id]))[0].n === 2);
r = await J('drive.files.versions.add', { id: board.id, body: '{"elements":[3]}', expected: 2 }, U.OWN);
check('FC22', 'Starting from the current version works again (version 3); nothing is lost on the way', r.status === 200 && r.row.current_version === 3);
check('FC23', 'Saving without naming a version still works (older callers): it adds the next version', (await J('drive.files.versions.add', { id: board.id, body: '{"elements":[4]}' }, U.ED)).row.current_version === 4);
const au = JSON.stringify((await rows("select detail from audit_events where action like 'file_versions.%' or action like 'files.%'")).map((x) => x.detail));
check('FC24', 'Audit records the project link and sizes, never the board content', au.includes('project_id') && !au.includes('elements'));

for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}${x.ok ? '' : `  [${x.detail ?? ''}]`}`);
const p = results.filter((x) => x.ok).length; console.log(`\n${p}/${results.length} checks passed`); await db.close(); process.exit(p === results.length ? 0 : 1);
