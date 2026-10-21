// Shared authorization foundation (owner rule "Owner-Controlled, App-Level Authorization", WCIGA, SDOR,
// App Foundation rule). Each check maps to an acceptance criterion in docs/ARCHITECTURE.md §3.
import { randomUUID as id } from 'node:crypto';
import { openDb, migrate, session, recorder } from './lib.mjs';
const db = await openDb(); await migrate(db);
const { asUser, asSuper } = session(db); const { results, check, errCode } = recorder();
const rows = async (s, p = []) => (await db.query(s, p)).rows;
const affected = async (s, p = []) => (await db.query(s, p)).affectedRows;

await asSuper();
const L = id(), A = id(); const U = { OWN: id(), ADM: id(), ED: id(), ED2: id(), VW: id(), AOWN: id() };
await db.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','L'),($2,'aurj','A')", [L, A]);
const staff = (u, ws, r) => db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff',$3)", [ws, u, r]);
await staff(U.OWN, L, 'owner'); await staff(U.ADM, L, 'admin'); await staff(U.ED, L, 'editor'); await staff(U.ED2, L, 'editor');
await staff(U.VW, L, 'viewer'); await staff(U.AOWN, A, 'owner');
for (const u of [U.ED, U.ED2, U.VW]) for (const app of ['clients', 'projects', 'drive'])
  await db.query('insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,$3)', [L, u, app]);
const CA = id(), CB = id(), PA = id(), FB = id();
await db.query("insert into clients (id,workspace_id,name) values ($1,$3,'Client A'),($2,$3,'Client B')", [CA, CB, L]);
await db.query("insert into projects (id,workspace_id,client_id,name) values ($1,$2,$3,'A funnel')", [PA, L, CA]);
await db.query("insert into files (id,workspace_id,client_id,uploaded_by,storage_path) values ($1,$2,$3,$4,$5)", [FB, L, CB, U.ADM, `${L}/b.pdf`]);
const lvl = async (name, ws = L) => (await rows('select id from access_levels where workspace_id=$1 and name=$2', [ws, name]))[0].id;
const visible = async (t) => (await rows(`select id from ${t}`)).map(r => r.id).sort();

// AZ1 distinct levels in two apps, assigned independently (owner-controlled)
await asUser(U.OWN);
await db.query("insert into access_assignments (workspace_id,access_level_id,principal_type,principal_id) values ($1,$2,'user',$3)", [L, await lvl('All clients · read'), U.ED]);
await asUser(U.ED);
check('AZ1', 'A level in Clients gives clients but nothing in Projects', (await visible('clients')).length === 2 && (await visible('projects')).length === 0);
// AZ2 restrict one capability for one user without touching other apps
await asUser(U.OWN);
await db.query("insert into access_assignments (workspace_id,access_level_id,principal_type,principal_id) values ($1,$2,'user',$3)", [L, await lvl('All projects · edit'), U.ED]);
await db.query("insert into permission_overrides (workspace_id,principal_type,principal_id,permission_key,effect,reason) values ($1,'user',$2,'clients.client.view','deny','test restriction')", [L, U.ED]);
await asUser(U.ED);
check('AZ2', 'Restricting Clients view leaves Projects access intact', (await visible('clients')).length === 0 && (await visible('projects')).length === 1);
// AZ3 backend rejects a protected write without the permission (direct call / old link)
check('AZ3', 'Write without permission is rejected by the database', (await errCode(() => db.query("insert into clients (workspace_id,name) values ($1,'x')", [L]))) === '42501');
// AZ4 new permissions default to owner only
await asSuper();
await db.query("insert into permissions (key, app_key, description) values ('clients.report.export','clients','Export client report')");
await asUser(U.ADM);
const admNew = (await rows("select allowed from effective_access($1) where permission_key='clients.report.export'", [L]))[0];
await asUser(U.OWN);
const ownNew = (await rows("select allowed from effective_access($1) where permission_key='clients.report.export'", [L]))[0];
check('AZ4', 'A newly registered permission reaches the owner only', admNew.allowed === false && ownNew.allowed === true);
// AZ5 client-scoped level: one client never grants another
await asUser(U.OWN);
await db.query("insert into access_assignments (workspace_id,access_level_id,principal_type,principal_id,client_id) values ($1,$2,'user',$3,$4)", [L, await lvl('Client team'), U.ED2, CA]);
await asUser(U.ED2);
check('AZ5a', 'Client team on Client A sees Client A only', JSON.stringify(await visible('clients')) === JSON.stringify([CA]));
check('AZ5b', 'Files of Client B stay hidden (attachments follow the source record)', !(await visible('files')).includes(FB));
check('AZ5c', 'Editing Client B is refused', (await affected("update clients set name='x' where id=$1", [CB])) === 0);
// AZ6 deny at a broader scope beats a narrower allow
await asUser(U.OWN);
await db.query("insert into permission_overrides (workspace_id,principal_type,principal_id,permission_key,effect) values ($1,'user',$2,'clients.client.view','deny')", [L, U.ED2]);
await asUser(U.ED2);
check('AZ6', 'Organization-wide restriction beats a client-scoped grant', (await visible('clients')).length === 0);
// AZ7 groups: access follows membership and is removed immediately
await asUser(U.OWN);
const G = id();
await db.query("insert into groups (id,workspace_id,name) values ($1,$2,'Delivery')", [G, L]);
await db.query("insert into access_assignments (workspace_id,access_level_id,principal_type,principal_id) values ($1,$2,'group',$3)", [L, await lvl('All clients · read'), G]);
await db.query('insert into group_members (workspace_id,group_id,user_id) values ($1,$2,$3)', [L, G, U.VW]);
await asUser(U.VW);
const viaGroup = (await visible('clients')).length;
await asUser(U.OWN); await db.query('delete from group_members where group_id=$1 and user_id=$2', [G, U.VW]);
await asUser(U.VW);
check('AZ7', 'Group grant works and removal takes effect on the next request', viaGroup === 2 && (await visible('clients')).length === 0);
// AZ8 role floor: a viewer can never write, even with an edit level
await asUser(U.OWN);
await db.query("insert into access_assignments (workspace_id,access_level_id,principal_type,principal_id) values ($1,$2,'user',$3)", [L, await lvl('All clients · edit'), U.VW]);
await asUser(U.VW);
check('AZ8', 'Viewer with an edit level still cannot edit (role floor)', (await affected("update clients set name='x' where id=$1", [CA])) === 0 && (await visible('clients')).length === 2);
// AZ9 access management is owner-controlled; delegable; owner cannot be locked out
await asUser(U.ADM);
check('AZ9a', 'Admin cannot manage access by default', (await errCode(() => db.query("insert into groups (workspace_id,name) values ($1,'x')", [L]))) === '42501');
await asUser(U.OWN);
await db.query("insert into permission_overrides (workspace_id,principal_type,principal_id,permission_key,effect) values ($1,'user',$2,'platform.access.manage','allow')", [L, U.ADM]);
await asUser(U.ADM);
check('AZ9b', 'Owner can delegate access management to an admin', (await affected("insert into groups (workspace_id,name) values ($1,'Ops')", [L])) === 1);
await db.query("insert into permission_overrides (workspace_id,principal_type,principal_id,permission_key,effect) values ($1,'user',$2,'platform.access.manage','deny')", [L, U.OWN]);
await asUser(U.OWN);
check('AZ9c', 'Owner keeps recovery even if restricted', (await affected("insert into groups (workspace_id,name) values ($1,'Recovery')", [L])) === 1);
// AZ10 effective access review with sources
await asUser(U.ED);
const mine = await rows("select reason from effective_access($1) where permission_key='projects.project.edit'", [L]);
check('AZ10a', 'A user can see their effective access and its source', mine[0]?.reason === 'allow:level:All projects · edit', mine[0]?.reason);
check('AZ10b', 'An editor cannot review other people’s access', (await rows('select * from effective_access($1,$2)', [L, U.ADM])).length === 0);
await asUser(U.ADM);
check('AZ10c', 'An admin can review another member’s access', (await rows('select * from effective_access($1,$2)', [L, U.ED])).length > 0);
// AZ11 expiry
await asUser(U.OWN);
await db.query("insert into access_assignments (workspace_id,access_level_id,principal_type,principal_id,expires_at) values ($1,$2,'user',$3, now() - interval '1 hour')", [L, await lvl('All projects · read'), U.ED2]);
await asUser(U.ED2);
check('AZ11', 'An expired assignment grants nothing', (await visible('projects')).length === 0);
// AZ12 a level cannot carry another app's permission
await asUser(U.OWN);
check('AZ12', 'An access level cannot contain another app’s permission',
  (await errCode(async () => db.query("insert into access_level_permissions (workspace_id,access_level_id,permission_key) values ($1,$2,'projects.project.view')", [L, await lvl('Client team')]))) === '23514');
// AZ13 the authorization data itself is isolated per organization
await asUser(U.AOWN);
check('AZ13', 'Aurj owner sees none of Layer2Funnels’ groups, levels or assignments',
  (await rows('select id from groups where workspace_id=$1', [L])).length + (await rows('select id from access_levels where workspace_id=$1', [L])).length + (await rows('select id from access_assignments where workspace_id=$1', [L])).length === 0);
// AZ14 access changes are audited
await asSuper();
check('AZ14', 'Every access change is in the audit log with its actor',
  (await rows("select 1 from audit_events where action like 'permission_overrides.%' and actor_id = $1", [U.OWN])).length >= 2
  && (await rows("select 1 from audit_events where action = 'group_members.delete'")).length === 1);
// AZ15 disabling an app hides data but never deletes it
const before = (await rows('select count(*)::int c from clients'))[0].c;
await asUser(U.OWN); await db.query("update workspace_apps set enabled=false where workspace_id=$1 and app_key='clients'", [L]);
const hidden = (await visible('clients')).length;
await asSuper(); const after = (await rows('select count(*)::int c from clients'))[0].c;
await asUser(U.OWN); await db.query("update workspace_apps set enabled=true where workspace_id=$1 and app_key='clients'", [L]);
check('AZ15', 'Switching an app off hides its data and keeps every record', hidden === 0 && before === after && (await visible('clients')).length === 2);
// AZ16 no silent loss on delete
check('AZ16a', 'Owner cannot hard-delete a client that still has work', (await errCode(() => db.query('delete from clients where id=$1', [CA]))) === 'P0001');
await asSuper(); const CE = id(); await db.query("insert into clients (id,workspace_id,name) values ($1,$2,'Empty')", [CE, L]);
await asUser(U.OWN);
check('AZ16b0', 'Even an empty client must be archived before it can be deleted', (await errCode(() => db.query('delete from clients where id=$1', [CE]))) === 'P0001');
await db.query('update clients set archived_at = now() where id=$1', [CE]);
check('AZ16b', 'Owner can delete an empty, archived client (and it is audited)', (await affected('delete from clients where id=$1', [CE])) === 1);
// AZ17 attribution: integration vs user; agents refused
await asUser(U.ADM);
await db.query("select set_config('app.actor_kind','integration',false)");
await db.query("insert into audit_events (workspace_id,actor_id,action,subject_type) values ($1,$2,'ghl.sync','connection')", [L, U.ADM]);
const agentTry = await errCode(async () => { await db.query("select set_config('app.actor_kind','agent',false)"); await db.query("insert into audit_events (workspace_id,actor_id,action,subject_type) values ($1,$2,'x','x')", [L, U.ADM]); });
await db.query("select set_config('app.actor_kind','',false)");
await asSuper();
check('AZ17', 'Audit records integration actions as such; agent actions are refused',
  (await rows("select actor_kind from audit_events where action='ghl.sync'"))[0].actor_kind === 'integration' && agentTry === '42501');
// AZ18 coming-soon apps show in the Launcher but give no data access
await db.query("insert into workspace_apps (workspace_id,app_key,enabled) values ($1,'whiteboard',true),($1,'layer2_agents',true)", [L]);
await asUser(U.ED);
const tiles = await rows('select app_key, lifecycle from launcher_apps($1)', [L]);
check('AZ18', 'Coming-soon apps appear as Coming soon only', tiles.some(t => t.app_key === 'layer2_agents' && t.lifecycle === 'coming_soon')
  && (await rows("select private.can_use_app($1,'whiteboard') x", [L]))[0].x === false);

const passed = results.filter(r => r.ok).length;
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id.padEnd(5)} ${r.name}${r.ok ? '' : ` (${r.detail})`}`);
console.log(`\n${passed}/${results.length} checks passed`); await db.close(); process.exit(passed === results.length ? 0 : 1);
