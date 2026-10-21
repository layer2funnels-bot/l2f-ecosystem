// access.mine / my_permissions(): the buttons a person may use, including permissions held ONLY at client or project scope.
import { randomUUID as id } from 'node:crypto';
import { openDb, migrate, session, recorder } from './lib.mjs';
import { createApi, NO_ORG } from '../packages/core/api.mjs';
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
const mine = async (user, org) => (await api.handle({ operation: 'access.mine', input: {}, auth: { userId: user, email: 'x@example.com' }, headers: { 'x-org-id': org } }));

await asSuper();
const L = id(), A = id();
const U = { OWN: id(), ADM: id(), ED: id(), SC: id(), PR: id(), VW: id(), NOAPP: id(), OTHER: id(), CL: id() };
await db.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','L'),($2,'aurj','A')", [L, A]);
const staff = (u, ws, r) => db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff',$3)", [ws, u, r]);
await staff(U.OWN, L, 'owner'); await staff(U.ADM, L, 'admin'); await staff(U.ED, L, 'editor'); await staff(U.SC, L, 'editor'); await staff(U.PR, L, 'editor');
await staff(U.VW, L, 'viewer'); await staff(U.NOAPP, L, 'editor'); await staff(U.OTHER, A, 'owner');
for (const u of [U.ED, U.SC, U.PR, U.VW]) for (const app of ['clients', 'projects']) await db.query('insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,$3)', [L, u, app]);
const C1 = id(), C2 = id(), C3 = id(), P1 = id(), P2 = id();
await db.query("insert into clients (id,workspace_id,name) values ($1,$4,'C1'),($2,$4,'C2'),($3,$4,'C3')", [C1, C2, C3, L]);
await db.query("insert into memberships (workspace_id,user_id,kind,client_id) values ($1,$2,'client',$3)", [L, U.CL, C3]);
await db.query("insert into projects (id,workspace_id,client_id,name) values ($1,$3,$4,'P1'),($2,$3,$4,'P2')", [P1, P2, L, C2]);
const lvl = async (n) => (await rows('select id from access_levels where workspace_id=$1 and name=$2', [L, n]))[0].id;
const assign = (u, level, client = null, project = null) => db.query("insert into access_assignments (workspace_id,access_level_id,principal_type,principal_id,client_id,project_id) values ($1,$2,'user',$3,$4,$5)", [L, level, u, client, project]);
await assign(U.ED, await lvl('All clients · edit'));
await assign(U.VW, await lvl('All clients · read'));
await assign(U.SC, await lvl('Client team'), C1);
await assign(U.PR, await lvl('Project member'), null, P1);

const asRows = async (u, org = L) => { const r = await mine(u, org); return r.status === 200 ? r.body.data : null; };
const has = (d, k, scope, client = null, project = null) => d.some((r) => r.permission_key === k && r.scope === scope && (r.client_id ?? null) === client && (r.project_id ?? null) === project);

let d = await asRows(U.ED);
check('PS1', 'Organization-wide editor: gets workspace-scope rows (edit clients) and no client-scope rows', has(d, 'clients.client.edit', 'workspace') && !d.some((r) => r.scope === 'client'));
d = await asRows(U.SC);
check('PS2', 'Client-scoped editor: no workspace row for client work, but client rows for THEIR client only', !d.some((r) => r.permission_key.startsWith('clients.') && r.scope === 'workspace')
  && has(d, 'clients.client.edit', 'client', C1) && has(d, 'clients.note.create', 'client', C1) && !d.some((r) => r.client_id === C2 || r.client_id === C3));
check('PS3', 'Nothing in the answer reveals that other clients exist: the only client id that appears is their own', new Set(d.filter((r) => r.client_id).map((r) => r.client_id)).size === 1);
check('PS4', 'A client-scoped editor cannot create a client (organization-level permission): not offered', !has(d, 'clients.client.create', 'workspace') && !d.some((r) => r.permission_key === 'clients.client.create'));
d = await asRows(U.PR);
check('PS5', 'Project-scoped person: project rows for that project only', has(d, 'projects.project.edit', 'project', null, P1) && !d.some((r) => r.project_id === P2));
d = await asRows(U.VW);
check('PS6', 'Viewer with the read level: view permissions only, never create/edit/delete', has(d, 'clients.client.view', 'workspace') && !d.some((r) => /\.(create|edit|delete)$/.test(r.permission_key) && r.permission_key.startsWith('clients.')));
d = await asRows(U.NOAPP);
check('PS7', 'An editor without the Clients app gets nothing for it', !d.some((r) => r.permission_key.startsWith('clients.')));
d = await asRows(U.OWN);
check('PS8', 'Owner: organization-wide everything, no client rows (they would be redundant)', d.length > 50 && !d.some((r) => r.scope !== 'workspace') && has(d, 'platform.access.manage', 'workspace'));
check('PS9', 'Other organization header, an outsider, and a client contact all get an empty answer; "no organization chosen" is refused', (await asRows(U.SC, A)).length === 0 && (await asRows(U.OTHER, L)).length === 0 && (await asRows(U.CL, L)).length === 0 && (await mine(U.SC, NO_ORG)).status === 400);

// deny beats a narrower allow, expiry, and agreement with what the database really accepts
await asSuper();
await db.query("insert into permission_overrides (workspace_id,principal_type,principal_id,permission_key,effect,reason) values ($1,'user',$2,'clients.note.edit','deny','test')", [L, U.SC]);
d = await asRows(U.SC);
check('PS10', 'An organization-wide deny removes the narrower client allow for that permission only', !d.some((r) => r.permission_key === 'clients.note.edit') && has(d, 'clients.note.create', 'client', C1));
await db.query("update access_assignments set expires_at = now() - interval '1 minute' where principal_id = $1", [U.PR]);
d = await asRows(U.PR);
check('PS11', 'An expired assignment disappears at once', !d.some((r) => r.scope === 'project'));
d = await asRows(U.SC);
const offered = (k, c) => has(d, k, 'client', c);
await asUser(U.SC, { org: L });
const tryNote = (c) => errCode(() => db.query("insert into client_notes (workspace_id,client_id,body) values ($1,$2,'n')", [L, c]));
const okC1 = offered('clients.note.create', C1), okC2 = offered('clients.note.create', C2);
check('PS12', 'Agreement: what is offered is exactly what the database accepts (allowed on C1, refused on C2)', okC1 && !okC2 && (await tryNote(C1)) === 'no-error' && (await tryNote(C2)) === '42501');
await asSuper();
check('PS13', 'The function is not reachable through the Data API roles (lockdown)', (await rows("select has_function_privilege('authenticated','public.my_permissions()','execute') a, has_function_privilege('anon','public.my_permissions()','execute') b"))[0].a === false);
const bad = await mine(U.SC, 'not-a-uuid');
check('PS14', 'A request without a valid x-org-id is refused before the database is asked', bad.status === 400);

for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}`);
const p = results.filter((x) => x.ok).length; console.log(`\n${p}/${results.length} checks passed`);
await db.close(); process.exit(p === results.length ? 0 : 1);
