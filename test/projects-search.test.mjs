// Projects: the client/internal split and the smart search (projects.list scope, projects.search). Allow and deny, both organizations, archived rules.
import { randomUUID as id } from 'node:crypto';
import { openDb, migrate, recorder } from './lib.mjs';
import { createApi } from '../packages/core/api.mjs';
import { createPgExecutor } from '../packages/core/pg-executor.mjs';
import { createRateLimiter } from '../packages/core/rate-limit.mjs';
import { createSafeLogger } from '../packages/core/safe-log.mjs';

const db = await openDb(); await migrate(db);
const { results, check } = recorder();
const rows = async (s, p = []) => (await db.query(s, p)).rows;
let chain = Promise.resolve();
const acquire = () => { const prev = chain; let release; chain = new Promise((r) => { release = r; }); return prev.then(() => ({ query: (s, p) => db.query(s, p), release })); };
const BIG = { read: { max: 1e6, windowMs: 6e4 }, write: { max: 1e6, windowMs: 6e4 }, sensitive: { max: 1e6, windowMs: 6e4 } };
const api = createApi({ executor: createPgExecutor({ acquire, role: 'app_user' }), logger: createSafeLogger(() => {}), limiter: createRateLimiter({ limits: BIG }) });
const J = async (op, input, u, org) => { const r = await api.handle({ operation: op, input, auth: { userId: u, email: 'x@example.com' }, headers: { 'x-org-id': org } }); return { ...r, row: r.body?.data?.[0], rows: r.body?.data ?? [] }; };

await db.exec('reset role');
const ORG = { L: id(), A: id() }; const U = { LO: id(), LED: id(), LPM: id(), LVW: id(), AO: id(), BOTH: id() };
await db.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','L'),($2,'aurj','A')", [ORG.L, ORG.A]);
const staff = (u, ws, r) => db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff',$3)", [ws, u, r]);
await staff(U.LO, ORG.L, 'owner'); await staff(U.LED, ORG.L, 'editor'); await staff(U.LPM, ORG.L, 'editor'); await staff(U.LVW, ORG.L, 'viewer'); await staff(U.AO, ORG.A, 'owner'); await staff(U.BOTH, ORG.L, 'owner'); await staff(U.BOTH, ORG.A, 'owner');
for (const u of [U.LED, U.LPM, U.LVW]) for (const app of ['projects', 'clients', 'drive']) await db.query('insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,$3)', [ORG.L, u, app]);
const lvl = async (ws, n) => (await rows('select id from access_levels where workspace_id=$1 and name=$2', [ws, n]))[0].id;
const assign = (ws, l, u) => db.query("insert into access_assignments (workspace_id,access_level_id,principal_type,principal_id) values ($1,$2,'user',$3)", [ws, l, u]);
await assign(ORG.L, await lvl(ORG.L, 'All projects · edit'), U.LED); await assign(ORG.L, await lvl(ORG.L, 'All clients · edit'), U.LED); await assign(ORG.L, await lvl(ORG.L, 'All projects · read'), U.LVW);
const C1 = id(), C2 = id(), CA = id(); await db.query("insert into clients (id,workspace_id,name) values ($1,$4,'One'),($2,$4,'Two'),($3,$5,'A client')", [C1, C2, CA, ORG.L, ORG.A]);
const P = { INT: id(), INT2: id(), C1: id(), C2: id(), ARCH: id(), AINT: id(), ACL: id() };
await db.query(`insert into projects (id,workspace_id,client_id,name,status) values ($1,$7,null,'Internal ops','active'),($2,$7,null,'Internal hiring','planned'),($3,$7,$8,'Client One launch','active'),($4,$7,$9,'Client Two audit','active'),($5,$7,null,'Old internal',  'done'),($6,$10,null,'Aurj internal','active')`, [P.INT, P.INT2, P.C1, P.C2, P.ARCH, P.AINT, ORG.L, C1, C2, ORG.A]);
await db.query("insert into projects (id,workspace_id,client_id,name) values ($1,$2,$3,'Aurj client work')", [P.ACL, ORG.A, CA]);
await db.query("update projects set archived_at = now() where id = $1", [P.ARCH]);
const T = (p, title, extra = '') => db.query(`insert into project_tasks (workspace_id, project_id, title ${extra ? ', ' + extra.split('|')[0] : ''}) values ((select workspace_id from projects where id=$1), $1, $2 ${extra ? ', ' + extra.split('|')[1] : ''})`, [p, title]);
await T(P.INT, 'Write the onboarding checklist');
await db.query("insert into project_tasks (workspace_id, project_id, title, assignee_id, due_on) values ($1,$2,'Draft the launch email',$3,current_date - 3)", [ORG.L, P.C1, U.LED]);
await db.query("insert into project_tasks (workspace_id, project_id, title) values ($1,$2,'Hide this archived task')", [ORG.L, P.ARCH]);
await db.query("insert into project_tasks (workspace_id, project_id, title, assignee_id) values ($1,$2,'Aurj private task',$3)", [ORG.A, P.AINT, U.AO]);
const uploader = U.LED;
for (const [n, p, org] of [['Project brief', P.INT, ORG.L], ['Launch plan board', P.C1, ORG.L], ['Archived brief', P.ARCH, ORG.L]]) {
  const cl = (await rows('select client_id from projects where id=$1', [p]))[0].client_id;
  const f = (await db.query("insert into files (workspace_id, space, client_id, project_id, name, kind, uploaded_by) values ($1, $2, $3, $4, $5, 'document', $6) returning id", [org, cl ? 'client' : 'shared', cl, p, n, uploader])).rows[0].id;
  await db.query("insert into file_versions (workspace_id, file_id, body) values ($1,$2,'x')", [org, f]);
}
const names = (r) => r.rows.map((x) => x.name ?? x.label).sort().join('|');

// ---- the split
check('PS1', 'Scope "internal" lists only projects with no client; "client" only projects tied to a client; "all" lists both', names(await J('projects.list', { scope: 'internal' }, U.LO, ORG.L)) === 'Internal hiring|Internal ops' && names(await J('projects.list', { scope: 'client' }, U.LO, ORG.L)) === 'Client One launch|Client Two audit' && (await J('projects.list', { scope: 'all' }, U.LO, ORG.L)).rows.length === 4 && (await J('projects.list', {}, U.LO, ORG.L)).rows.length === 4);
check('PS2', 'Internal projects never appear in a client’s list, and a client’s projects never appear in the internal list', !names(await J('projects.list', { client: C1 }, U.LO, ORG.L)).includes('Internal') && names(await J('projects.list', { client: C1 }, U.LO, ORG.L)) === 'Client One launch' && !names(await J('projects.list', { scope: 'internal' }, U.LO, ORG.L)).includes('Client'));
check('PS3', 'Archived projects are in neither list unless archived is asked for', !names(await J('projects.list', { scope: 'internal' }, U.LO, ORG.L)).includes('Old internal') && names(await J('projects.list', { scope: 'internal', archived: true }, U.LO, ORG.L)) === 'Old internal');
check('PS4', 'Each organization has its own internal projects: Layer2Funnels never sees Aurj’s and the other way round; a person in both sees the one the request names', names(await J('projects.list', { scope: 'internal' }, U.AO, ORG.A)) === 'Aurj internal' && names(await J('projects.list', { scope: 'internal' }, U.BOTH, ORG.L)) === 'Internal hiring|Internal ops' && names(await J('projects.list', { scope: 'internal' }, U.BOTH, ORG.A)) === 'Aurj internal');
check('PS5', 'Project visibility still follows permissions: an editor with no level sees none, a read-only level sees all', (await J('projects.list', { scope: 'all' }, U.LPM, ORG.L)).rows.length === 0 && (await J('projects.list', { scope: 'internal' }, U.LVW, ORG.L)).rows.length === 2);
// ---- search
const S = (input, u = U.LO, o = ORG.L) => J('projects.search', input, u, o);
const labels = (r) => r.rows.map((x) => `${x.kind}:${x.label}`).sort().join('|');
check('PS6', 'Search finds projects, tasks and project documents by name, in that order', labels(await S({ q: 'launch' })) === 'doc:Launch plan board|project:Client One launch|task:Draft the launch email' && (await S({ q: 'launch' })).rows[0].kind === 'project');
check('PS7', 'Search can be limited to projects, tasks or docs', labels(await S({ q: 'launch', kind: 'projects' })) === 'project:Client One launch' && labels(await S({ q: 'launch', kind: 'tasks' })) === 'task:Draft the launch email' && labels(await S({ q: 'launch', kind: 'docs' })) === 'doc:Launch plan board');
check('PS8', 'Archived projects and everything inside them are found only when archived is asked for', !labels(await S({ q: 'old' })).includes('Old internal') && !labels(await S({ q: 'archived' })).includes('Hide this') && !labels(await S({ q: 'brief' })).includes('Archived brief') && labels(await S({ q: 'old', archived: true })) === 'project:Old internal' && labels(await S({ q: 'archived', archived: true })) === 'doc:Archived brief|task:Hide this archived task');
check('PS9', 'Search for tasks assigned to me, and for overdue tasks', labels(await S({ mine: true }, U.LED)) === 'task:Draft the launch email' && labels(await S({ overdue: true })) === 'task:Draft the launch email' && (await S({ mine: true }, U.LO)).rows.length === 0);
check('PS10', 'Search shows only what the person may open: a person with no project level finds nothing; a viewer with read levels finds the projects and tasks but not a client document they cannot read', (await S({ q: 'launch' }, U.LPM)).rows.length === 0 && labels(await S({ q: 'launch' }, U.LVW)) === 'project:Client One launch|task:Draft the launch email');
check('PS11', 'Search never crosses organizations: Aurj finds none of Layer2Funnels’ records and the other way round', labels(await S({ q: 'launch' }, U.AO, ORG.A)) === '' && labels(await S({ q: 'private' }, U.AO, ORG.A)) === 'task:Aurj private task' && labels(await S({ q: 'private' })) === '' && labels(await S({ q: 'task' }, U.BOTH, ORG.L)).includes('Aurj') === false);
check('PS12', 'Characters that mean something to a database pattern are searched as plain text', (await S({ q: '%' })).rows.length === 0 && (await S({ q: '_' })).rows.length === 0 && (await S({ q: "'; drop table projects; --" })).rows.length === 0 && (await rows('select count(*)::int n from projects'))[0].n === 7);
check('PS13', 'An empty search lists the newest records (so the palette opens with something useful), capped at 50', (await S({})).rows.length > 0 && (await S({})).rows.length <= 50);
check('PS14', 'A made-up kind is refused before it reaches the database', (await S({ q: 'x', kind: 'everything' })).status === 422 || (await S({ q: 'x', kind: 'everything' })).status === 400);
check('PS15', 'The people list shows the active staff of this organization only (with names or a safe fallback) and marks the caller', (await J('projects.people', {}, U.LED, ORG.L)).rows.length === 5 && (await J('projects.people', {}, U.LED, ORG.L)).rows[0].is_you === true && (await J('projects.people', {}, U.AO, ORG.A)).rows.length === 2 && !(await J('projects.people', {}, U.AO, ORG.A)).rows.some((r) => [U.LO, U.LED].includes(r.user_id)) && (await J('projects.people', {}, U.LED, ORG.L)).rows.every((r) => r.display_name.length > 0));
check('PS16', 'Search results for documents carry the type, so a whiteboard opens as a whiteboard', (await S({ q: 'brief', kind: 'docs' })).rows.every((r) => 'mime_type' in r));
for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}`);
const pc = results.filter((x) => x.ok).length; console.log(`\n${pc}/${results.length} checks passed`); await db.close(); process.exit(pc === results.length ? 0 : 1);
