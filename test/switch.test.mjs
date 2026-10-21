// Organization switching keeps the user in the same app (owner requirement 21 Oct 2026).
// Part A: database resolver + request-organization scope. Part B: browser module (cache wipe, no Launcher redirect).
import { randomUUID as id } from 'node:crypto';
import { openDb, migrate, session, recorder } from './lib.mjs';
import { createOrgCache, switchOrganization } from '../packages/core/org-switch.mjs';
const db = await openDb(); await migrate(db);
const { asUser, asSuper } = session(db); const { results, check, errCode } = recorder();
const rows = async (s, p = []) => (await db.query(s, p)).rows;
const sw = async (org, app, page) => (await rows('select * from resolve_org_switch($1,$2,$3)', [org, app, page]))[0];

await asSuper();
const L = id(), A = id(); const U = { BOTH_ADMIN: id(), BOTH_MIXED: id(), L_ONLY: id() };
await db.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','Layer2Funnels'),($2,'aurj','Aurj')", [L, A]);
const staff = (u, ws, r) => db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff',$3)", [ws, u, r]);
await staff(U.BOTH_ADMIN, L, 'admin'); await staff(U.BOTH_ADMIN, A, 'admin');
await staff(U.BOTH_MIXED, L, 'admin'); await staff(U.BOTH_MIXED, A, 'editor');   // admin in L2F, editor in Aurj
await staff(U.L_ONLY, L, 'admin');
await db.query("insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,'projects'),($1,$2,'office')", [A, U.BOTH_MIXED]);
await db.query("insert into workspace_apps (workspace_id,app_key,enabled) values ($1,'funnel_mapper_pro',true)", [L]);
const CL = id(), CA = id();
await db.query("insert into clients (id,workspace_id,name) values ($1,$2,'L2F client'),($3,$4,'Aurj client')", [CL, L, CA, A]);

// ---- A. successful switches stay in the same app
await asUser(U.BOTH_ADMIN);
let r = await sw(A, 'office', 'admin.access');
check('S1', 'Office → Admin → Access stays on Admin → Access after switching to Aurj (permitted)',
  r.outcome === 'same_page' && r.app_key === 'office' && r.page_key === 'admin.access' && r.org_id === A);
check('S2', 'The active organization is updated server-side', (await rows('select active_workspace_id a from profiles where id=$1', [U.BOTH_ADMIN]))[0].a === A);
r = await sw(L, 'projects', 'list');
check('S3', 'Projects list stays on Projects list when switching back', r.outcome === 'same_page' && r.app_key === 'projects' && r.page_key === 'list');
r = await sw(A, 'clients', 'record');
check('S4', 'A single-record page never carries the record across; lands on the list in the same app',
  r.outcome === 'record_not_carried' && r.app_key === 'clients' && r.page_key === 'list' && /belongs to the organization you left/.test(r.message));
r = await sw(A, 'drive', 'no.such.page');
check('S5', 'An unknown page falls back to the same app’s home, not the Launcher', r.outcome === 'same_page' && r.app_key === 'drive' && r.page_key === 'home');
// ---- page or app not permitted: explain, stay in the app, no Launcher
await asUser(U.BOTH_MIXED);
r = await sw(A, 'office', 'admin.access');
check('S6', 'Admin → Access without permission in Aurj: same app home + explanation', r.outcome === 'page_unavailable' && r.app_key === 'office' && r.page_key === 'home' && r.message.includes('Admin · Access'));
r = await sw(A, 'clients', 'list');
check('S7', 'App not granted in the destination: explained, page null, no redirect', r.outcome === 'app_unavailable' && r.app_key === 'clients' && r.page_key === null && /ask an admin/i.test(r.message));
await asUser(U.BOTH_ADMIN);
r = await sw(A, 'funnel_mapper_pro', null);
check('S8', 'Funnel Mapper Pro is unavailable in Aurj and says so', r.outcome === 'app_unavailable' && r.message.includes('Aurj'));
// ---- unauthorized cross-organization access
await asUser(U.L_ONLY);
const before = (await rows('select active_workspace_id a from profiles where id=$1', [U.L_ONLY]))[0]?.a ?? null;
const notMember = await sw(A, 'office', 'home'); const missing = await sw(id(), 'office', 'home');
check('S9', 'Switching to an organization you are not in changes nothing', notMember.outcome === 'not_available' && notMember.org_id === null
  && ((await rows('select active_workspace_id a from profiles where id=$1', [U.L_ONLY]))[0]?.a ?? null) === before);
check('S10', 'Not-a-member and no-such-organization answers are identical', JSON.stringify(notMember) === JSON.stringify(missing));
await asUser(U.L_ONLY, { org: A });
check('S11', 'A forged organization header never widens access', (await rows('select id from clients')).length === 0 && (await rows('select id from workspaces')).length === 0);
// ---- request scope: after switching, nothing of the old organization is reachable
await asUser(U.BOTH_ADMIN, { org: A });
check('S12', 'With Aurj active, a two-org member sees only Aurj clients', JSON.stringify((await rows('select id from clients')).map(x => x.id)) === JSON.stringify([CA]));
check('S13', 'An old Layer2Funnels record id returns nothing after switching', (await rows('select id from clients where id=$1', [CL])).length === 0);
check('S14', 'Search across names cannot reach the old organization', (await rows("select id from clients where name ilike '%l2f%'")).length === 0);
check('S15', 'Writing into the old organization while Aurj is active is refused',
  (await errCode(() => db.query("insert into clients (workspace_id,name) values ($1,'x')", [L]))) === '42501');
check('S16', 'Access data (groups, levels, audit) is scoped to the active organization',
  (await rows('select distinct workspace_id w from access_levels')).every(x => x.w === A) && (await rows('select workspace_id from audit_events where workspace_id=$1', [L])).length === 0);
await asUser(U.BOTH_ADMIN, { org: 'not-a-uuid' });
check('S17', 'A malformed organization header shows nothing (fails closed)', (await rows('select id from clients')).length === 0);
await asUser(U.BOTH_ADMIN);
check('S18', 'Without a header (grouped "My work" reads) each row still carries its organization', (await rows('select distinct workspace_id from clients')).length === 2);
await asSuper(); await db.exec('set role app_user');
check('S19', 'Anonymous call cannot switch organizations', (await rows('select outcome from resolve_org_switch($1,$2,$3)', [A, 'office', 'home']))[0].outcome === 'not_available');

// ---- B. browser module
const cache = createOrgCache(L);
cache.set('clients', [{ id: CL }], L); cache.set('search:acme', ['hit'], L);
const fakeRpc = (row) => async () => [row];
let out = await switchOrganization({ rpc: fakeRpc({ outcome: 'same_page', org_id: A, org_name: 'Aurj', app_key: 'office', page_key: 'admin.access', message: null }), cache, targetOrg: A, current: { app: 'office', page: 'admin.access' } });
check('B1', 'Successful switch keeps app and page and wipes the old organization’s cache',
  out.route.app === 'office' && out.route.page === 'admin.access' && cache.size() === 0 && cache.get('clients') === undefined && out.headers['x-org-id'] === A);
check('B2', 'A late response from the old organization is refused', cache.set('clients', [{ id: CL }], L) === false && cache.get('clients') === undefined);
out = await switchOrganization({ rpc: fakeRpc({ outcome: 'app_unavailable', org_id: L, org_name: 'Layer2Funnels', app_key: 'whiteboard', page_key: null, message: 'not available' }), cache, targetOrg: L, current: { app: 'whiteboard', page: 'board' } });
check('B3', 'Unavailable app: stays in the same app with an explanation, never the Launcher', out.route.app === 'whiteboard' && out.route.explain === true && out.route.app !== 'launcher');
cache.set('x', 1, L);
out = await switchOrganization({ rpc: fakeRpc({ outcome: 'not_available', message: 'nothing changed' }), cache, targetOrg: id(), current: { app: 'projects', page: 'list' } });
check('B4', 'Refused switch keeps the current organization, page and data', out.org === L && out.route.page === 'list' && cache.get('x') === 1);

const passed = results.filter(x => x.ok).length;
for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(4)} ${x.name}${x.ok ? '' : ` (${x.detail})`}`);
console.log(`\n${passed}/${results.length} checks passed`); await db.close(); process.exit(passed === results.length ? 0 : 1);
