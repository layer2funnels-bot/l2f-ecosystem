// Shell, auth and Admin backend (migration 0012): launcher tile states, profile, invitation preview/decline, members, access levels,
// assignments, denials. Through the API layer on a real database; allow + deny per role; audit; isolation.
import { randomUUID as id } from 'node:crypto';
import { openDb, migrate, recorder } from './lib.mjs';
import { createApi, NO_ORG } from '../packages/core/api.mjs';
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
const EM = {};   // user -> verified e-mail (as the token would carry it)
const call = (op, input, user, org) => api.handle({ operation: op, input, auth: { userId: user, email: EM[user] ?? `${user.slice(0, 8)}@example.com` }, headers: { 'x-org-id': org } });
const body = (r) => r.body.data;

await db.exec('reset role');
const L = id(), A = id();
const U = { OWN: id(), OWN2: id(), ADM: id(), ED: id(), VW: id(), NOGRANT: id(), AOWN: id(), CL: id(), NEW: id() };
await db.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','Layer2Funnels'),($2,'aurj','Aurj')", [L, A]);
const staff = (u, ws, r) => db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff',$3)", [ws, u, r]);
await staff(U.OWN, L, 'owner'); await staff(U.ADM, L, 'admin'); await staff(U.ED, L, 'editor'); await staff(U.VW, L, 'viewer'); await staff(U.NOGRANT, L, 'editor');
await staff(U.OWN, A, 'owner'); await staff(U.AOWN, A, 'owner'); await staff(U.ADM, A, 'editor');
for (const u of [U.ED, U.VW]) for (const app of ['office', 'projects', 'clients']) await db.query('insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,$3)', [L, u, app]);
await db.query("insert into workspace_apps (workspace_id,app_key,enabled) values ($1,'funnel_mapper_pro',true) on conflict (workspace_id, app_key) do update set enabled = true", [L]);
const C1 = id(); await db.query("insert into clients (id,workspace_id,name) values ($1,$2,'Client One')", [C1, L]);
await db.query("insert into memberships (workspace_id,user_id,kind,client_id) values ($1,$2,'client',$3)", [L, U.CL, C1]);
for (const [u, n, e] of [[U.OWN, 'Olivia Owner', 'olivia@example.com'], [U.ADM, 'Adam Admin', 'adam@example.com'], [U.ED, 'Eve Editor', 'eve@example.com'], [U.VW, 'Vic Viewer', 'vic@example.com']]) await db.query('insert into profiles (id, display_name, email) values ($1,$2,$3) on conflict (id) do update set display_name=$2, email=$3', [u, n, e]);

// ---- A. launcher tiles
const tiles = async (u, org) => { const r = await call('launcher.catalog', {}, u, org); return r.status === 200 ? r.body.data : null; };
const st = (d, k) => d.find((t) => t.app_key === k)?.state;
let d = await tiles(U.OWN, L);
check('LC1', 'Owner in Layer2Funnels: core apps and Funnel Mapper Pro available, Client Portal locked, five apps coming soon, in the designed order',
  ['office', 'projects', 'clients', 'drive', 'planner', 'funnel_mapper_pro'].every((k) => st(d, k) === 'available') && st(d, 'portal') === 'locked'
  && ['forms', 'value_ladder', 'social_planner', 'whiteboard', 'layer2_agents'].every((k) => st(d, k) === 'coming_soon')
  && d.map((t) => t.app_key).join() === 'office,projects,clients,portal,drive,planner,forms,value_ladder,social_planner,whiteboard,layer2_agents,funnel_mapper_pro');
d = await tiles(U.OWN, A);
check('LC2', 'The same owner in Aurj: Funnel Mapper Pro is "not set up here" and names the organization where it is on', st(d, 'funnel_mapper_pro') === 'not_set_up' && d.find((t) => t.app_key === 'funnel_mapper_pro').other_org === 'Layer2Funnels');
d = await tiles(U.ED, L);
check('LC3', 'Editor: only the apps granted to them (Office, Projects, Clients), plus coming-soon tiles; no Client Portal, no Drive, no Funnel Mapper Pro',
  st(d, 'office') === 'available' && st(d, 'clients') === 'available' && !d.some((t) => ['portal', 'drive', 'funnel_mapper_pro', 'planner'].includes(t.app_key)) && st(d, 'layer2_agents') === 'coming_soon');
d = await tiles(U.ADM, L);
check('LC4', 'Admin sees the locked Client Portal tile; an editor does not', st(d, 'portal') === 'locked');
d = await tiles(U.ADM, A);
check('LC5', 'An admin who is only an editor in Aurj does not get the Portal tile there', !d.some((t) => t.app_key === 'portal'));
await db.query("update workspace_apps set enabled = true where workspace_id = $1 and app_key = 'portal'", [L]);
check('LC6', 'A client contact sees only the Portal tile, and only when the owner has switched it on', (await tiles(U.CL, L)).map((t) => t.app_key).join() === 'portal');
await db.query("update workspace_apps set enabled = false where workspace_id = $1 and app_key = 'portal'", [L]);
check('LC7', '…and nothing while it is off. A non-member sees nothing', (await tiles(U.CL, L)).length === 0 && (await tiles(U.NEW, L)).length === 0 && (await tiles(U.OWN, NO_ORG)) === null);

// ---- B. profile
EM[U.NEW] = 'Newbie@Example.com';
let r = await call('profile.touch', { name: 'New Person' }, U.NEW, NO_ORG);
let p = (await rows('select email, display_name from profiles where id = $1', [U.NEW]))[0];
check('PT1', 'profile.touch records the VERIFIED e-mail from the token (lower-cased), works before any organization exists', r.status === 200 && p.email === 'newbie@example.com' && p.display_name === 'New Person');
await call('profile.touch', { name: 'Someone Else' }, U.NEW, NO_ORG);
check('PT2', 'A later call never overwrites the name the person chose', (await rows('select display_name from profiles where id = $1', [U.NEW]))[0].display_name === 'New Person');

// ---- C. invitations
r = await call('invitation.create', { email: 'newbie@example.com', kind: 'staff', role: 'editor' }, U.OWN, L);
const token = body(r)[0].token;
r = await call('invitation.preview', { token }, U.NEW, NO_ORG);
check('IV1', 'The invited person sees who invited them, the organization and the level', r.status === 200 && body(r)[0].org_name === 'Layer2Funnels' && body(r)[0].role === 'editor' && body(r)[0].inviter_name === 'Olivia Owner');
EM[U.VW] = 'vic@example.com';
const other = await call('invitation.preview', { token }, U.VW, NO_ORG);
const missing = await call('invitation.preview', { token: 'f'.repeat(64) }, U.VW, NO_ORG);
check('IV2', 'Anyone else (or a wrong token) gets the same plain not-found: a token reveals nothing', other.status === 404 && JSON.stringify(other.body.error) === JSON.stringify(missing.body.error));
r = await call('invitation.decline', { token }, U.VW, NO_ORG);
check('IV3', 'Someone else cannot decline it', r.status === 404);
r = await call('invitation.decline', { token }, U.NEW, NO_ORG);
check('IV4', 'The invited person declines; the invitation is then dead (preview and accept both fail)', r.status === 200 && (await call('invitation.preview', { token }, U.NEW, NO_ORG)).status === 404 && (await call('invitation.accept', { token }, U.NEW, NO_ORG)).status === 404);

// ---- D. members
r = await call('members.list', {}, U.ADM, L);
check('MB1', 'Admin lists members with names, e-mails and levels', r.status === 200 && body(r).some((m) => m.display_name === 'Eve Editor' && m.email === 'eve@example.com' && m.role === 'editor' && m.status === 'active') && body(r).find((m) => m.display_name === 'Adam Admin').is_you === true);
r = await call('invitation.create', { email: 'pending@example.com', kind: 'staff', role: 'viewer' }, U.OWN, L);
const inv = (await call('members.list', {}, U.OWN, L)).body.data.find((m) => m.row_kind === 'invitation' && m.email === 'pending@example.com');
check('MB2', 'Pending invitations appear as "invited" rows', !!inv && inv.status === 'invited' && inv.role === 'viewer');
check('MB3', 'An editor or viewer gets an empty list (the page itself shows the shared not-found screen)', body(await call('members.list', {}, U.ED, L)).length === 0 && body(await call('members.list', {}, U.VW, L)).length === 0);
check('MB4', 'Admin changes an editor to viewer, deactivates and reactivates them', (await call('members.setRole', { user: U.NOGRANT, role: 'viewer' }, U.ADM, L)).status === 200
  && (await call('members.setStatus', { user: U.NOGRANT, status: 'deactivated' }, U.ADM, L)).status === 200 && (await rows("select status from memberships where user_id = $1 and workspace_id = $2", [U.NOGRANT, L]))[0].status === 'deactivated'
  && (await call('members.setStatus', { user: U.NOGRANT, status: 'active' }, U.ADM, L)).status === 200);
check('MB5', 'Only an owner changes an owner: an admin can neither demote nor promote to owner (plain not-found)', (await call('members.setRole', { user: U.OWN, role: 'viewer' }, U.ADM, L)).status === 404
  && (await call('members.setRole', { user: U.ED, role: 'owner' }, U.ADM, L)).status === 404 && (await call('members.remove', { user: U.OWN }, U.ADM, L)).status === 404);
check('MB6', 'An editor cannot manage members at all', (await call('members.setRole', { user: U.VW, role: 'admin' }, U.ED, L)).status === 404 && (await call('invitations.cancel', { id: inv.invitation_id }, U.ED, L)).status === 404);
const soleOwner = await call('members.setRole', { user: U.OWN, role: 'admin' }, U.OWN, L);
check('MB7', 'The only owner cannot be demoted, deactivated or removed (the organization keeps one)', soleOwner.status === 422 && (await call('members.setStatus', { user: U.OWN, status: 'deactivated' }, U.OWN, L)).status === 422 && (await call('members.remove', { user: U.OWN }, U.OWN, L)).status === 422);
check('MB8', 'Once there are two owners, one can step down', (await call('members.setRole', { user: U.ADM, role: 'owner' }, U.OWN, L)).status === 200 && (await call('members.setRole', { user: U.OWN, role: 'admin' }, U.ADM, L)).status === 200);
await call('members.setRole', { user: U.OWN, role: 'owner' }, U.ADM, L); await call('members.setRole', { user: U.ADM, role: 'admin' }, U.OWN, L);
check('MB9', 'Cancelling an invitation kills it', (await call('invitations.cancel', { id: inv.invitation_id }, U.ADM, L)).status === 200 && !(await call('members.list', {}, U.ADM, L)).body.data.some((m) => m.invitation_id === inv.invitation_id));
await db.query("insert into access_assignments (workspace_id, access_level_id, principal_type, principal_id) select $1, id, 'user', $2 from access_levels where workspace_id = $1 and name = 'All clients · read'", [L, U.VW]);
check('MB10', 'Removing a member loses access straight away and clears their grants and assignments; the person themselves is untouched', (await call('members.remove', { user: U.VW }, U.ADM, L)).status === 200
  && (await rows('select 1 from memberships where user_id = $1 and workspace_id = $2', [U.VW, L])).length === 0 && (await rows('select 1 from app_grants where user_id = $1 and workspace_id = $2', [U.VW, L])).length === 0
  && (await rows("select 1 from access_assignments where principal_id = $1", [U.VW])).length === 0 && (await rows('select 1 from profiles where id = $1', [U.VW])).length === 1);
check('MB11', 'Isolation: an owner of Aurj cannot touch Layer2Funnels members even with a valid user id', (await call('members.setRole', { user: U.ED, role: 'viewer' }, U.AOWN, A)).status === 404 && (await call('members.setRole', { user: U.ED, role: 'viewer' }, U.AOWN, L)).status === 404);
const au = await rows("select action, detail, actor_id from audit_events where action like 'memberships.%' order by created_at");
check('MB12', 'Role, status and removal changes are audited with the actor', au.some((a) => a.action === 'memberships.update' && a.detail?.role) && au.some((a) => a.action === 'memberships.delete') && au.filter((a) => a.action !== 'memberships.insert').every((a) => a.actor_id));

// ---- E. access
r = await call('access.roles', {}, U.ADM, L);
check('AC1', 'The roles matrix is the real permission catalog (floors and defaults)', r.status === 200 && body(r).length > 50 && body(r).some((x) => x.key === 'platform.access.manage' && x.default_role === 'owner'));
r = await call('access.levels.create', { app: 'clients', name: 'Intake team', description: 'Test', permissions: ['clients.client.view', 'clients.client.create'] }, U.ADM, L);
check('AC2', 'An admin (review right only) cannot create access levels: following the catalog, managing access is an owner permission', r.status === 404);
r = await call('access.levels.create', { app: 'clients', name: 'Intake team', description: 'Test', permissions: ['clients.client.view', 'clients.client.create'] }, U.OWN, L);
const lvl = body(r)?.[0];
check('AC3', 'The owner creates a level with its permissions', r.status === 200 && lvl.name === 'Intake team');
r = await call('access.levels.list', {}, U.ADM, L);
check('AC4', 'The admin can read levels (with their permissions)', r.status === 200 && body(r).find((l) => l.name === 'Intake team').permissions.join() === 'clients.client.create,clients.client.view');
r = await call('access.levels.create', { app: 'clients', name: 'Wrong app', permissions: ['projects.project.view'] }, U.OWN, L);
check('AC5', 'A level cannot hold a permission from another app', r.status === 422);
r = await call('access.levels.update', { id: lvl.id, name: 'Intake crew', permissions: ['clients.client.view'] }, U.OWN, L);
check('AC6', 'Renaming and replacing the permission set', r.status === 200 && (await call('access.levels.list', {}, U.OWN, L)).body.data.find((l) => l.id === lvl.id).permissions.join() === 'clients.client.view');
r = await call('access.assignments.create', { user: U.NOGRANT, level: lvl.id }, U.ADM, L);
check('AC7', 'An admin cannot assign access (owner permission by default)', r.status === 404);
r = await call('access.assignments.create', { user: U.ED, level: lvl.id, client: C1, reason: 'covering' }, U.OWN, L);
const asg = body(r)?.[0];
check('AC8', 'The owner assigns the level to someone on one client', r.status === 200 && !!asg);
r = await call('access.assignments.list', {}, U.ADM, L);
check('AC9', 'The list names the person, the level and the client', body(r).some((a) => a.id === asg.id && a.person === 'Eve Editor' && a.level === 'Intake crew' && a.client_name === 'Client One'));
r = await call('access.effective', { user: U.ED, client: C1 }, U.ADM, L);
check('AC10', 'Effective access shows why: the level that grants it', body(r).some((x) => x.permission_key === 'clients.client.view' && x.allowed === true && /level:Intake crew/.test(x.reason)));
r = await call('access.denials.create', { user: U.ED, level: lvl.id, client: C1, reason: 'Conflict of interest' }, U.OWN, L);
check('AC11', '"Deny instead" creates denials from the level’s permissions', r.status === 200);
r = await call('access.effective', { user: U.ED, client: C1 }, U.ADM, L);
check('AC12', 'Deny wins, and effective access says so', body(r).some((x) => x.permission_key === 'clients.client.view' && x.allowed === false && /deny/i.test(x.reason)));
r = await call('access.denials.list', {}, U.ADM, L);
check('AC13', 'The denial reads as one row with the reason', body(r).length === 1 && body(r)[0].reason === 'Conflict of interest' && body(r)[0].level === 'Intake crew' && body(r)[0].client_name === 'Client One');
check('AC14', 'Removing the denial restores the access', (await call('access.denials.delete', { user: U.ED, level: lvl.id, client: C1 }, U.OWN, L)).status === 200
  && body(await call('access.effective', { user: U.ED, client: C1 }, U.ADM, L)).some((x) => x.permission_key === 'clients.client.view' && x.allowed === true));
check('AC15', 'Removing the assignment, and retiring the level', (await call('access.assignments.delete', { id: asg.id }, U.OWN, L)).status === 200 && (await call('access.levels.retire', { id: lvl.id }, U.OWN, L)).status === 200
  && !(await call('access.levels.list', {}, U.OWN, L)).body.data.some((l) => l.id === lvl.id));
check('AC16', 'Access data is isolated: Aurj’s owner sees none of Layer2Funnels’ assignments or levels', body(await call('access.assignments.list', {}, U.AOWN, A)).length === 0 && !body(await call('access.levels.list', {}, U.AOWN, A)).some((l) => l.name === 'Intake crew'));
const aa = await rows("select action from audit_events where action like 'access_%' or action like 'permission_overrides.%'");
check('AC17', 'Level, assignment and denial changes are audited', aa.length >= 5);

for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}`);
const pc = results.filter((x) => x.ok).length; console.log(`\n${pc}/${results.length} checks passed`);
await db.close(); process.exit(pc === results.length ? 0 : 1);
