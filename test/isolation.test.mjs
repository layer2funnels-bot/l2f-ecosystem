// Phase 4 isolation and authorization tests (original 47 checks, assertions unchanged).
// Runs every migration on a fresh database and executes each check as the non-owner role `app_user`,
// so row-level security really applies. DB_DRIVER=pglite (PostgreSQL 17) or pg (real server).
// Audit 20 Oct 2026: ported to the shared harness; fixtures now grant app access (F6), switch the
// Client Portal on for the client checks (G2 kill switch) and mark client deliverables client-visible (F5).
import { randomUUID } from 'node:crypto';
import { openDb, migrate } from './lib.mjs';

const db = await openDb();
await migrate(db);

const results = [];
const check = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

const asUser = async (uid) => {
  await db.exec('reset role; set role app_user;');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
};
const asSuper = async () => {
  await db.exec('reset role;');
  await db.query("select set_config('request.jwt.claim.sub', '', false)");
};
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const affected = async (sql, params = []) => (await db.query(sql, params)).affectedRows;
const errCode = async (fn) => { try { await fn(); return 'no-error'; } catch (e) { return e.code ?? String(e.message); } };

// ---- Fixtures (superuser) ----
await asSuper();
const id = () => randomUUID();
const L2F = id(), AUR = id();
await db.query("insert into workspaces (id, slug, name) values ($1,'layer2funnels','Layer2Funnels'),($2,'aurj','Aurj')", [L2F, AUR]);
const U = { O1: id(), A1: id(), E1: id(), E2: id(), V1: id(), C1: id(), CAR: id(), AO: id(), AE: id(), NONE: id() };
const CL_A = id(), CL_B = id(), CL_AUR = id();
await db.query(`insert into clients (id, workspace_id, name) values
  ($1,$4,'Acme Coaching'),($2,$4,'Beta Consulting'),($3,$5,'Aurj Partner School')`, [CL_A, CL_B, CL_AUR, L2F, AUR]);
const staff = (uid, ws, role) => db.query(
  "insert into memberships (workspace_id, user_id, kind, role) values ($1,$2,'staff',$3)", [ws, uid, role]);
await staff(U.O1, L2F, 'owner'); await staff(U.A1, L2F, 'admin'); await staff(U.E1, L2F, 'editor');
await staff(U.E2, L2F, 'editor'); await staff(U.V1, L2F, 'viewer'); await staff(U.CAR, L2F, 'editor');
await staff(U.CAR, AUR, 'editor'); await staff(U.AO, AUR, 'owner'); await staff(U.AE, AUR, 'editor');
await db.query("insert into memberships (workspace_id, user_id, kind, client_id) values ($1,$2,'client',$3)", [L2F, U.C1, CL_A]);
// F6: editors and viewers need an app grant; owners and admins use every enabled app.
for (const [uid, ws] of [[U.E1, L2F], [U.E2, L2F], [U.V1, L2F], [U.CAR, L2F], [U.CAR, AUR], [U.AE, AUR]])
  for (const app of ['clients', 'projects', 'drive'])
    await db.query('insert into app_grants (workspace_id, user_id, app_key) values ($1,$2,$3)', [ws, uid, app]);
await db.query("update workspace_apps set enabled = true where workspace_id = $1 and app_key = 'portal'", [L2F]);
// 0004 (WCIGA: access to one client never grants another): editors/viewers need an access level.
const level = async (ws, name) => (await db.query('select id from access_levels where workspace_id=$1 and name=$2', [ws, name])).rows[0].id;
const assign = async (ws, uid, name) => db.query("insert into access_assignments (workspace_id, access_level_id, principal_type, principal_id) values ($1,$2,'user',$3)", [ws, await level(ws, name), uid]);
for (const [uid, ws] of [[U.E1, L2F], [U.E2, L2F], [U.CAR, L2F], [U.CAR, AUR], [U.AE, AUR]]) { await assign(ws, uid, 'All clients · edit'); await assign(ws, uid, 'All projects · edit'); }
await assign(L2F, U.V1, 'All clients · read'); await assign(L2F, U.V1, 'All projects · read');
const PR_A = id(), PR_B = id(), PR_AUR = id();
await db.query(`insert into projects (id, workspace_id, client_id, name) values
  ($1,$4,$5,'Acme funnel'),($2,$4,$6,'Beta funnel'),($3,$7,$8,'Aurj course')`,
  [PR_A, PR_B, PR_AUR, L2F, CL_A, CL_B, AUR, CL_AUR]);
await db.query('update projects set client_visible = true where id = $1', [PR_A]);
const F_E1 = id(), F_E2 = id(), F_AUR = id(), F_CLIENT = id();
await db.query(`insert into files (id, workspace_id, client_id, uploaded_by, storage_path) values
  ($1,$2,null,$3,$4),($5,$2,null,$6,$7),($8,$9,null,$10,$11),($12,$2,$13,$3,$14)`,
  [F_E1, L2F, U.E1, `${L2F}/e1.pdf`,
   F_E2, U.E2, `${L2F}/e2.pdf`,
   F_AUR, AUR, U.AE, `${AUR}/aur.pdf`,
   F_CLIENT, CL_A, `${L2F}/acme-deliverable.pdf`]);
await db.query('update files set client_visible = true where id = $1', [F_CLIENT]);
const BB = id();
await db.query("insert into brand_base_answers (id, workspace_id, client_id, section, question, answer) values ($1,$2,$3,'Offer','Core promise','...')", [BB, L2F, CL_A]);
const APPR_E1 = id();
await db.query("insert into approvals (id, workspace_id, subject_type, subject_id, requested_by) values ($1,$2,'deliverable',$3,$4)", [APPR_E1, L2F, F_CLIENT, U.E1]);

// ---- T11: RLS coverage ----
await asSuper();
const cov = await rows(`select c.relname, c.relrowsecurity, c.relforcerowsecurity,
  (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'`);
const uncovered = cov.filter(r => !r.relrowsecurity || !r.relforcerowsecurity || Number(r.policies) === 0).map(r => r.relname);
check('T11', 'RLS enabled, forced, and has policies on every public table', uncovered.length === 0,
  uncovered.length ? `gaps: ${uncovered.join(', ')}` : `${cov.length} tables`);

// ---- T1 / T2: cross-workspace reads and writes (E1 is L2F-only) ----
await asUser(U.E1);
check('T1a', 'Direct id read of other workspace client returns nothing',
  (await rows('select id from clients where id = $1', [CL_AUR])).length === 0);
const e1Clients = (await rows('select workspace_id from clients')).map(r => r.workspace_id);
check('T1b', 'Unfiltered list shows only own workspace clients',
  e1Clients.length === 2 && e1Clients.every(w => w === L2F), `saw ${e1Clients.length}`);
check('T1c', 'Search by name cannot reach other workspace',
  (await rows("select id from clients where name ilike 'aurj%'")).length === 0);
check('T1d', 'Files of other workspace are invisible',
  (await rows('select id from files where workspace_id = $1', [AUR])).length === 0);
check('T1e', 'Cross-workspace insert is refused',
  (await errCode(() => db.query("insert into clients (workspace_id, name) values ($1,'x')", [AUR]))) === '42501');

// ---- T4: denied and not-found are indistinguishable ----
const denied = await rows('select * from clients where id = $1', [CL_AUR]);
const missing = await rows('select * from clients where id = $1', [id()]);
check('T4a', 'Existing-but-denied and non-existent ids return identical empty results',
  JSON.stringify(denied) === JSON.stringify(missing) && denied.length === 0);
const denyInsert = await errCode(() => db.query("insert into clients (workspace_id, name) values ($1,'x')", [AUR]));
const missInsert = await errCode(() => db.query("insert into clients (workspace_id, name) values ($1,'x')", [id()]));
check('T4b', 'Denied write to existing and non-existent workspace return the same error', denyInsert === missInsert, `${denyInsert} vs ${missInsert}`);

// ---- Role matrix (editor, viewer, admin) ----
await asUser(U.E1);
check('D3', 'Editor can create a client in own workspace',
  (await affected("insert into clients (workspace_id, name) values ($1,'New L2F client')", [L2F])) === 1);
check('D2a', 'Editor cannot delete a client (silently filtered, 0 rows)',
  (await affected('delete from clients where id = $1', [CL_B])) === 0);
await asUser(U.V1);
check('V1a', 'Viewer cannot write a client', (await errCode(() => db.query("insert into clients (workspace_id,name) values ($1,'v')", [L2F]))) === '42501');
check('D6', 'Viewer sees no Brand Base answers', (await rows('select id from brand_base_answers')).length === 0);
check('V1b', 'Viewer can read staff files', (await rows('select id from files where workspace_id = $1', [L2F])).length === 3);
await asUser(U.A1);
// Changed 21 Oct 2026 by the owner's App Foundation rule ("never silently lose records"): hard delete is
// owner-only and refused while work exists; archive instead. Was: 'Admin can delete a client' === 1.
check('D2b', 'Admin cannot hard-delete a client (owner-only; archive instead)', (await affected('delete from clients where id = $1', [CL_B])) === 0);
check('D6b', 'Admin can read Brand Base answers', (await rows('select id from brand_base_answers')).length === 1);

// ---- D2 file deletion ----
await asUser(U.E1);
check('D2c', 'Editor cannot delete another editor\'s file', (await affected('delete from files where id = $1', [F_E2])) === 0);
check('D2d', 'Editor can delete their own upload', (await affected('delete from files where id = $1', [F_E1])) === 1);

// ---- D4 approvals ----
await asUser(U.E1);
check('D4a', 'Requester cannot approve own request', (await affected("update approvals set status='approved' where id=$1", [APPR_E1])) === 0);
await asUser(U.A1);
check('D4b', 'Admin can approve a request raised by another user', (await affected("update approvals set status='approved' where id=$1", [APPR_E1])) === 1);

// ---- D1 ownership rules ----
await asUser(U.A1);
check('D1a', 'Admin cannot add an owner', (await errCode(() => db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff','owner')", [L2F, id()]))) === '42501');
check('D1b', 'Admin cannot change an owner row (0 rows)', (await affected("update memberships set role='viewer' where user_id=$1 and workspace_id=$2", [U.O1, L2F])) === 0);
check('D1c', 'Admin cannot promote a member to owner', (await errCode(() => db.query("update memberships set role='owner' where user_id=$1 and workspace_id=$2", [U.E1, L2F]))) === '42501');
check('D1d', 'Admin can change an editor\'s role', (await affected("update memberships set role='viewer' where user_id=$1 and workspace_id=$2", [U.E1, L2F])) === 1);
await asUser(U.O1);
check('D1e', 'Sole owner cannot demote self (last-owner guard)',
  (await errCode(() => db.query("update memberships set role='admin' where user_id=$1 and workspace_id=$2", [U.O1, L2F]))) === 'P0001');
check('D1f', 'Owner can promote an admin to owner', (await affected("update memberships set role='owner' where user_id=$1 and workspace_id=$2", [U.A1, L2F])) === 1);
check('D1g', 'Owner can demote self once another owner exists', (await affected("update memberships set role='admin' where user_id=$1 and workspace_id=$2", [U.O1, L2F])) === 1);
await asUser(U.A1); // now owner
// restore E1 to editor for the rest of the suite
check('D1h', 'Former owner (now admin) can no longer change workspace owner rows',
  (await affected("update memberships set role='editor' where user_id=$1 and workspace_id=$2", [U.E1, L2F])) === 1);

// ---- Audit log is append-only ----
await asUser(U.E1);
check('AU1', 'Staff can append audit events for own actions (no RETURNING: needs SELECT, which non-admins lack)',
  (await affected("insert into audit_events (workspace_id, actor_id, action, subject_type) values ($1,$2,'file.delete','file')", [L2F, U.E1])) === 1);
check('AU2', 'Audit events cannot be updated', (await affected("update audit_events set action='x'")) === 0);
check('AU3', 'Audit events cannot be deleted', (await affected('delete from audit_events')) === 0);
check('AU4', 'Non-admin cannot read the audit log', (await rows('select id from audit_events')).length === 0);

// ---- T6 client isolation ----
await asUser(U.C1);
const cc = await rows('select id from clients');
check('T6a', 'Client sees only own client record', cc.length === 1 && cc[0].id === CL_A);
const cp = await rows('select id from projects');
check('T6b', 'Client sees only own client projects', cp.length === 1 && cp[0].id === PR_A);
const cf = await rows('select id from files');
check('T6c', 'Client sees only files tied to own client, no staff files', cf.length === 1 && cf[0].id === F_CLIENT);
check('T6d', 'Client sees no Brand Base answers', (await rows('select id from brand_base_answers')).length === 0);
check('T6e', 'Client sees only own membership row, no staff list', (await rows('select id from memberships')).length === 1);
check('T6f', 'Client cannot write a project',
  (await errCode(() => db.query("insert into projects (workspace_id,client_id,name) values ($1,$2,'x')", [L2F, CL_A]))) === '42501');
check('T6g', 'Client cannot change their client record', (await affected("update clients set name='hack' where id=$1", [CL_A])) === 0);
check('T6h', 'Client cannot see other workspace', (await rows('select id from workspaces')).length === 1);
// cross-client: a client linked to CL_A must not see CL_B projects (covered by T6b)

// ---- T7 deactivation is immediate ----
await asUser(U.A1);
check('T7a', 'Admin deactivates an editor', (await affected("update memberships set status='deactivated' where user_id=$1 and workspace_id=$2", [U.E2, L2F])) === 1);
await asUser(U.E2);
check('T7b', 'Deactivated member loses all workspace reads immediately', (await rows('select id from clients')).length === 0);
check('T7c', 'Deactivated member cannot write', (await errCode(() => db.query("insert into clients (workspace_id,name) values ($1,'x')", [L2F]))) === '42501');

// ---- T8 staff profiles: same-workspace only ----
await asUser(U.E1);
const profiles = (await rows('select workspace_id from memberships')).map(r => r.workspace_id);
check('T8', 'Staff profile list contains only own workspace', profiles.length > 0 && profiles.every(w => w === L2F));

// ---- T3 role change in one workspace does not affect the other ----
await asUser(U.A1);
check('T3a', 'Admin downgrades Carol to viewer in Layer2Funnels', (await affected("update memberships set role='viewer' where user_id=$1 and workspace_id=$2", [U.CAR, L2F])) === 1);
await asUser(U.CAR);
check('T3b', 'Carol cannot write in Layer2Funnels after downgrade',
  (await errCode(() => db.query("insert into clients (workspace_id,name) values ($1,'x')", [L2F]))) === '42501');
check('T3c', 'Carol still writes in Aurj (her Aurj role is unchanged)',
  (await affected("insert into clients (workspace_id,name) values ($1,'Aurj new')", [AUR])) === 1);

// ---- Anonymous / no session ----
await asSuper();
await db.exec('reset role;');
await db.exec('set role app_user;');
await db.query("select set_config('request.jwt.claim.sub', '', false)");
check('T0', 'No session sees no business data', (await rows('select id from clients')).length === 0 && (await rows('select id from workspaces')).length === 0);

// ---- Report ----
await asSuper();
const notCovered = [
  ['T2', 'Active-workspace filtering in shared apps', 'API layer not built; DB policies correctly allow both memberships'],
  ['T5', 'Drive share-link expiry and revocation', 'Storage and share links not built'],
  ['T9', 'Funnel Mapper Pro Launcher entry', 'database side covered in test/audit.test.mjs (T9a-d); Launcher UI not built'],
  ['T10', 'Client Portal gate', 'database kill switch covered in test/audit.test.mjs (T10a-b); Portal UI not built'],
  ['T12', 'Secret exposure in client bundles', 'run scripts/check-secrets.sh (no client bundle exists yet)'],
  ['T14', 'Signed file URL expiry', 'Storage signing not built'],
  ['T15', 'Logs free of cross-workspace ids', 'Logging layer not built'],
  ['T16', 'Rate limiting on denied requests', 'API layer not built'],
  ['T17', 'Restore produces passing database', 'local drill: npm run drill:restore (needs a real PostgreSQL server)'],
];
const passed = results.filter(r => r.ok).length;
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id.padEnd(4)} ${r.name}${r.detail ? ` (${r.detail})` : ''}`);
console.log('\nNOT TESTED IN THIS RUN:');
for (const [i, n, why] of notCovered) console.log(`  ${i.padEnd(4)} ${n} - ${why}`);
console.log(`\n${passed}/${results.length} checks passed`);
await db.close();
process.exit(passed === results.length ? 0 : 1);
