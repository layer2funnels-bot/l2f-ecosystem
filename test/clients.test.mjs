// Clients app data layer and API (migration 0008). Allow + deny per role, client scope, client visibility, isolation, audit,
// archive before delete, stages. Through the real database, and through the API layer for the operations.
import { randomUUID as id } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { openDb, migrate, session, recorder } from './lib.mjs';
import { createApi, NO_ORG } from '../packages/core/api.mjs';
import { createPgExecutor } from '../packages/core/pg-executor.mjs';
import { createRateLimiter } from '../packages/core/rate-limit.mjs';
import { createSafeLogger } from '../packages/core/safe-log.mjs';

const db = await openDb(); await migrate(db);
const { asUser, asSuper } = session(db); const { results, check, errCode } = recorder();
const rows = async (s, p = []) => (await db.query(s, p)).rows;
const affected = async (s, p = []) => (await db.query(s, p)).affectedRows;

// API over the same connection
let chain = Promise.resolve();
const acquire = () => { const prev = chain; let release; chain = new Promise((r) => { release = r; }); return prev.then(() => ({ query: (s, p) => db.query(s, p), release })); };
const BIG = { read: { max: 1e6, windowMs: 6e4 }, write: { max: 1e6, windowMs: 6e4 }, sensitive: { max: 1e6, windowMs: 6e4 } };
const api = createApi({ executor: createPgExecutor({ acquire, role: 'app_user' }), logger: createSafeLogger(() => {}), limiter: createRateLimiter({ limits: BIG }) });
const call = (op, input, user, org = L) => api.handle({ operation: op, input, auth: { userId: user, email: 'x@example.com' }, headers: { 'x-org-id': org } });

await asSuper();
const L = id(), A = id();
const U = { OWN: id(), ADM: id(), ED: id(), ED2: id(), VW: id(), NOAPP: id(), AOWN: id(), CL1: id(), CL2: id() };
await db.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','L'),($2,'aurj','A')", [L, A]);
const staff = (u, ws, r) => db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff',$3)", [ws, u, r]);
await staff(U.OWN, L, 'owner'); await staff(U.ADM, L, 'admin'); await staff(U.ED, L, 'editor'); await staff(U.ED2, L, 'editor'); await staff(U.VW, L, 'viewer');
await staff(U.NOAPP, L, 'editor'); await staff(U.AOWN, A, 'owner');
for (const u of [U.ED, U.ED2, U.VW]) await db.query("insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,'clients')", [L, u]);
const lvl = async (name, ws = L) => (await rows('select id from access_levels where workspace_id=$1 and name=$2', [ws, name]))[0].id;
const assign = (u, level, client = null) => db.query("insert into access_assignments (workspace_id,access_level_id,principal_type,principal_id,client_id) values ($1,$2,'user',$3,$4)", [L, level, u, client]);
const C1 = id(), C2 = id(), CA = id();
await db.query("insert into clients (id,workspace_id,name) values ($1,$4,'Client One'),($2,$4,'Client Two'),($3,$5,'Aurj client')", [C1, C2, CA, L, A]);
await db.query("insert into memberships (workspace_id,user_id,kind,client_id) values ($1,$2,'client',$3),($1,$4,'client',$5)", [L, U.CL1, C1, U.CL2, C2]);
await assign(U.ED, await lvl('All clients · edit'));
await assign(U.VW, await lvl('All clients · read'));
await assign(U.ED2, await lvl('Client team'), C1);

// ---- A. profile and stages
await asSuper();
check('CT1', 'Every client has an internal profile from the moment it exists (status lead, no stage)', (await rows('select status, stage_key from client_profiles where client_id=$1', [C1]))[0].status === 'lead' && (await rows('select count(*)::int n from client_profiles'))[0].n === 3);
check('CT2', 'Every organization, including new ones, starts with five editable stages', (await rows("select count(*)::int n from client_stages where workspace_id=$1", [L]))[0].n === 5 && (await rows("select count(*)::int n from client_stages where workspace_id=$1", [A]))[0].n === 5
  && await (async () => { const N = id(); await db.query("insert into workspaces (id,slug,name) values ($1,'new-org','N')", [N]); return (await rows('select count(*)::int n from client_stages where workspace_id=$1', [N]))[0].n === 5; })());
await asUser(U.ED);
check('CT3', 'An editor with “All clients · edit” creates a client and edits its profile (status, stage, tags)', await (async () => {
  const c = (await db.query("insert into clients (workspace_id,name) values ($1,'Edited') returning id", [L])).rows[0].id;
  return (await affected("update client_profiles set status='active', stage_key='strategy', tags='{vip,uk}' where client_id=$1", [c])) === 1; })());
await asUser(U.VW);
check('CT4', 'A viewer with “All clients · read” sees clients and profiles but cannot create or edit', (await rows('select id from clients')).length >= 3 && (await rows('select client_id from client_profiles')).length >= 3
  && (await errCode(() => db.query("insert into clients (workspace_id,name) values ($1,'x')", [L]))) === '42501' && (await affected("update client_profiles set status='past' where client_id=$1", [C1])) === 0);
await asUser(U.NOAPP);
check('CT5', 'An editor without the Clients app sees nothing, not even stages', (await rows('select client_id from client_profiles')).length === 0 && (await rows('select key from client_stages')).length === 0);
await asUser(U.ED2);
check('CT6', 'A person assigned “Client team” on one client sees that client’s profile and nothing of the other', (await rows('select client_id from client_profiles')).map((r) => r.client_id).join() === C1);
await asUser(U.AOWN);
check('CT7', 'Another organization sees none of it and cannot write into this one', (await rows('select client_id from client_profiles where workspace_id=$1', [L])).length === 0 && (await errCode(() => db.query("insert into client_notes (workspace_id,client_id,body) values ($1,$2,'x')", [L, C1]))) === '42501');
await asUser(U.ED);
check('CT8', 'A client cannot be given another organization’s stage or client (composite keys)', (await errCode(() => db.query("update client_profiles set stage_key='nope' where client_id=$1", [C1]))) === '23503'
  && (await errCode(() => db.query("insert into client_requests (workspace_id,client_id,title) values ($1,$2,'x')", [L, CA]))) === '23503');
check('CT9', 'An editor cannot manage the stage list; an admin can', (await errCode(() => db.query("insert into client_stages (workspace_id,key,label,position) values ($1,'extra','Extra',6)", [L]))) === '42501');
await asUser(U.ADM);
check('CT10', 'Admin adds, renames and removes an unused stage', (await affected("insert into client_stages (workspace_id,key,label,position) values ($1,'extra','Extra',6)", [L])) === 1
  && (await affected("update client_stages set label='Extras' where workspace_id=$1 and key='extra'", [L])) === 1 && (await affected("delete from client_stages where workspace_id=$1 and key='extra'", [L])) === 1);
await asUser(U.ED); await db.query("update client_profiles set stage_key='build' where client_id=$1", [C1]);
await asUser(U.ADM);
check('CT11', 'A stage that clients are in cannot be deleted', (await errCode(() => db.query("delete from client_stages where workspace_id=$1 and key='build'", [L]))) === 'P0001');

// ---- B. notes: always internal
await asUser(U.ED);
const note = (await db.query("insert into client_notes (workspace_id,client_id,body,created_by) values ($1,$2,'SECRET-NOTE-TEXT-7',$3) returning id, created_by", [L, C1, U.OWN])).rows[0];
check('CT12', 'created_by is the signed-in person, never what the caller sends', note.created_by === U.ED);
await asSuper(); await db.query("update workspace_apps set enabled=true where workspace_id=$1 and app_key='portal'", [L]);
await asUser(U.CL1);
check('CT13', 'A client contact sees their client’s name but never the profile or any team note', (await rows('select id from clients')).map((r) => r.id).join() === C1 && (await rows('select 1 from client_profiles')).length === 0 && (await rows('select 1 from client_notes')).length === 0);
await asSuper();
const polText = (await rows("select string_agg(coalesce(qual,'') || coalesce(with_check,''), ' ') t from pg_policies where tablename in ('client_notes','client_profiles')"))[0].t;
const noteCols = (await rows("select column_name from information_schema.columns where table_name='client_notes'")).map((r) => r.column_name);
check('CT14', 'By construction: team notes have no client_visible column, and no note or profile policy mentions client access', !noteCols.includes('client_visible') && !/client_of/.test(polText));
await asUser(U.ED2);
check('CT15', 'Client-scoped access reaches notes of that client only', (await rows('select id from client_notes')).length === 1 && (await errCode(() => db.query("insert into client_notes (workspace_id,client_id,body) values ($1,$2,'n')", [L, C2]))) === '42501');

// ---- C. requests and updates: client_visible
await asUser(U.ED);
const rq = (await db.query("insert into client_requests (workspace_id,client_id,title,kind) values ($1,$2,'Send logo','info') returning id", [L, C1])).rows[0].id;
const up = (await db.query("insert into client_updates (workspace_id,client_id,title,body) values ($1,$2,'Week 1','Going well') returning id", [L, C1])).rows[0].id;
check('CT16', 'An editor cannot make a request or update visible to the client (sharing is its own permission)', (await errCode(() => db.query('update client_requests set client_visible=true where id=$1', [rq]))) === '42501'
  && (await errCode(() => db.query('update client_updates set client_visible=true where id=$1', [up]))) === '42501');
await asUser(U.ADM);
await db.query('update client_requests set client_visible=true where id=$1', [rq]); await db.query('update client_updates set client_visible=true where id=$1', [up]);
const hiddenUp = (await db.query("insert into client_updates (workspace_id,client_id,title) values ($1,$2,'Internal draft') returning id", [L, C1])).rows[0].id;
const otherReq = (await db.query("insert into client_requests (workspace_id,client_id,title,client_visible) values ($1,$2,'For two',true) returning id", [L, C2])).rows[0].id;
await asUser(U.CL1);
check('CT17', 'A client sees only the visible, unarchived requests and updates of their own client', (await rows('select id from client_requests')).map((r) => r.id).join() === rq && (await rows('select id from client_updates')).map((r) => r.id).join() === up);
check('CT18', 'A client cannot create, change or delete any of it', (await errCode(() => db.query("insert into client_requests (workspace_id,client_id,title) values ($1,$2,'x')", [L, C1]))) === '42501'
  && ['42501', 'no-error'].includes(await errCode(() => db.query("update client_requests set response='hi' where id=$1", [rq]))) && (await rows('select response from client_requests where id=$1', [rq]))[0].response === null && (await affected('delete from client_updates where id=$1', [up])) === 0);
await asUser(U.CL2);
check('CT19', 'Another client sees only their own', (await rows('select id from client_requests')).map((r) => r.id).join() === otherReq && (await rows('select id from client_updates')).length === 0);
await asUser(U.ADM); await db.query('update client_updates set archived_at=now() where id=$1', [up]);
await asUser(U.CL1);
check('CT20', 'Archiving an update hides it from the client', (await rows('select id from client_updates')).length === 0);
await asSuper(); await db.query("update workspace_apps set enabled=false where workspace_id=$1 and app_key='portal'", [L]);
await asUser(U.CL1);
check('CT21', 'With the Client Portal switched off a client sees nothing', (await rows('select id from client_requests')).length === 0 && (await rows('select id from clients')).length === 0);

// ---- D. archive before delete, immutability
await asUser(U.OWN);
check('CT22', 'Notes, requests, updates and clients cannot be deleted before they are archived', (await errCode(() => db.query('delete from client_notes where id=$1', [note.id]))) === 'P0001'
  && (await errCode(() => db.query('delete from client_requests where id=$1', [rq]))) === 'P0001' && (await errCode(() => db.query('delete from clients where id=$1', [C2]))) === 'P0001');
await db.query('update client_requests set archived_at=now() where id=$1', [rq]);
await asUser(U.ADM);
check('CT23', 'An admin cannot permanently delete (owner only)', (await affected('delete from client_requests where id=$1', [rq])) === 0);
await asUser(U.OWN);
check('CT24', 'Owner deletes an archived request', (await affected('delete from client_requests where id=$1', [rq])) === 1);
await db.query('update clients set archived_at=now() where id=$1', [C1]);
check('CT25', 'An archived client that still has notes cannot be deleted', (await errCode(() => db.query('delete from clients where id=$1', [C1]))) === 'P0001');
await db.query('update clients set archived_at=null where id=$1', [C1]);
await asUser(U.ED);
check('CT26', 'Records do not move between clients or organizations', (await errCode(() => db.query('update client_notes set client_id=$1 where id=$2', [C2, note.id]))) === 'P0001'
  && (await errCode(() => db.query('update client_updates set workspace_id=$1 where id=$2', [A, hiddenUp]))) === 'P0001');

// ---- E. audit
await asUser(U.ADM);
await db.query("update client_profiles set status='active', tags='{a}' where client_id=$1", [C1]);
await db.query("update client_notes set body='CHANGED-NOTE-BODY-9' where id=$1", [note.id]);
await db.query('update clients set archived_at=now() where id=$1', [C2]);
await asUser(U.OWN);
const au = await rows("select action, detail, actor_id from audit_events where action like 'client%' order by created_at");
const acts = new Set(au.map((a) => a.action)); const aj = JSON.stringify(au);
check('CT27', 'Profile changes, client archive, stage changes and request/update/note lifecycle are audited with the actor',
  ['client_profiles.update', 'clients.update', 'client_stages.insert', 'client_stages.delete', 'client_notes.insert', 'client_requests.insert', 'client_requests.delete', 'client_updates.update'].every((a) => acts.has(a)) && au.every((a) => a.actor_id));
check('CT28', 'Audit never contains note text, update text, or contact details', !/SECRET-NOTE-TEXT-7|CHANGED-NOTE-BODY-9|Going well/.test(aj));
check('CT29', 'Starter access levels learned the new permissions; “read” stays view-only', await (async () => {
  const p = async (n) => (await rows("select permission_key from access_level_permissions where access_level_id=$1", [await lvl(n)])).map((r) => r.permission_key);
  const ro = await p('All clients · read'), team = await p('Client team');
  return ro.includes('clients.note.view') && !ro.some((k) => /\.(create|edit|delete)$/.test(k) && /note|request|update/.test(k)) && team.includes('clients.update.create') && !team.includes('clients.record.share'); })());
const sql = readFileSync(new URL('../migrations/0008_clients_foundation.sql', import.meta.url), 'utf8').split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
check('CT30', 'Migration 0008 never touches Funnel Mapper Pro (FMP-2)', !/funnel_mapper/i.test(sql) && !/workspace_apps/.test(sql) && !/insert into public\.apps/.test(sql));
check('CT31', 'Every new table has forced row security and the request-scope policy', (await rows(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('client_stages','client_profiles','client_notes','client_requests','client_updates')
  and (not c.relrowsecurity or not c.relforcerowsecurity or not exists (select 1 from pg_policies p where p.tablename=c.relname and p.policyname='org_scope'))`)).length === 0);

// ---- F. the API
let r = await call('clients.create', { name: '100% Real', business_name: 'Real Co', status: 'active', stage: 'strategy', tags: ['vip'], currency: 'GBP', website: 'https://real.example' }, U.ADM);
const c100 = r.body.data?.[0];
check('CA1', 'clients.create writes the client and its profile in one step', r.status === 200 && c100.name === '100% Real' && c100.status === 'active' && c100.stage_key === 'strategy' && c100.tags[0] === 'vip');
r = await call('clients.create', { name: 'Plain' }, U.ADM);
check('CA2', 'A client with no details gets defaults (lead, no stage)', r.status === 200 && r.body.data[0].status === 'lead' && r.body.data[0].stage_key === null);
r = await call('clients.list', { q: '%' }, U.ADM);
check('CA3', 'Search treats % literally: only the client whose name contains it matches', r.status === 200 && r.body.data.length === 1 && r.body.data[0].id === c100.id);
r = await call('clients.list', { status: 'active', stage: 'strategy' }, U.ADM);
check('CA4', 'List filters by status and stage', r.body.data.every((x) => x.status === 'active' && x.stage_key === 'strategy') && r.body.data.some((x) => x.id === c100.id));
r = await call('clients.update', { id: c100.id, name: 'Hundred', phone: '123', tags: [] }, U.ED);
check('CA5', 'An editor updates name and profile', r.status === 200 && r.body.data[0].name === 'Hundred' && r.body.data[0].phone === '123' && r.body.data[0].tags.length === 0);
r = await call('clients.stage.set', { id: c100.id, stage: 'launch' }, U.ED);
check('CA6', 'Moving a client to another stage', r.status === 200 && r.body.data[0].stage_key === 'launch');
r = await call('clients.stage.set', { id: c100.id, stage: 'nowhere' }, U.ED);
check('CA7', 'An unknown stage is refused without database words', r.status === 404 && !JSON.stringify(r.body).match(/foreign|constraint|client_profiles/));
r = await call('clients.create', { name: 'x', email: 'not-an-email', website: 5, status: 'vip' }, U.ADM);
check('CA8', 'Invalid details are named by field only', r.status === 422 && r.body.error.fields.join() === 'email,status,website');
r = await call('clients.update', { id: c100.id, workspace_id: A }, U.ADM);
check('CA9', 'workspace_id (or any undeclared field) cannot be smuggled in', r.status === 422 && r.body.error.fields.join() === 'workspace_id');
r = await call('clients.create', { name: 'Nope' }, U.VW);
check('CA10', 'A viewer cannot create (plain not-found)', r.status === 404);
r = await call('clients.get', { id: c100.id }, U.NOAPP);
check('CA11', 'Someone without the Clients app gets the same not-found as for a missing client', r.status === 404 && JSON.stringify((await call('clients.get', { id: id() }, U.NOAPP)).body.error) === JSON.stringify(r.body.error));
await asSuper(); await db.query("update workspace_apps set enabled=true where workspace_id=$1 and app_key='portal'", [L]);
r = await call('clients.get', { id: C1 }, U.CL1);
check('CA12', 'A client contact calling a staff operation is refused as not found (the Portal projection replaces it, see test/portal.test.mjs)', r.status === 404);
r = await call('clients.archive', { id: c100.id }, U.ED);
const arch = r;
r = await call('clients.list', { archived: true }, U.ED);
check('CA13', 'Archive moves a client to the archived list; restore brings it back', arch.status === 200 && r.body.data.some((x) => x.id === c100.id) && (await call('clients.restore', { id: c100.id }, U.ED)).status === 200);
r = await call('clients.delete', { id: c100.id }, U.OWN);
check('CA14', 'Deleting an unarchived client is refused (422), nothing lost', r.status === 422);
await call('clients.archive', { id: c100.id }, U.ED);
check('CA15', 'An admin cannot delete; the owner can once it is archived and empty', (await call('clients.delete', { id: c100.id }, U.ADM)).status === 404 && (await call('clients.delete', { id: c100.id }, U.OWN)).status === 200);
r = await call('clients.notes.create', { client: C1, body: 'API note SECRET-API-NOTE' }, U.ED2);
const n2 = r.body.data?.[0];
check('CA16', 'Client-scoped editor adds a note to their client', r.status === 200 && n2.created_by === U.ED2);
check('CA17', 'The same person cannot add one to the other client', (await call('clients.notes.create', { client: C2, body: 'x' }, U.ED2)).status === 404);
r = await call('clients.notes.list', { client: C1 }, U.VW);
check('CA18', 'A viewer with the read level lists notes but cannot add', r.status === 200 && r.body.data.length >= 1 && (await call('clients.notes.create', { client: C1, body: 'x' }, U.VW)).status === 404);
check('CA19', 'There is no way to share a note: the operation does not exist', (await call('clients.notes.share', { id: n2.id, visible: true }, U.ADM)).status === 404);
r = await call('clients.requests.create', { client: C1, title: 'Brand assets', due_on: '2026-02-31' }, U.ED);
check('CA20', 'A date that does not exist is refused by field name', r.status === 422 && r.body.error.fields.join() === 'due_on');
r = await call('clients.requests.create', { client: C1, title: 'Brand assets', kind: 'info', due_on: '2026-11-30' }, U.ED);
const rq2 = r.body.data?.[0];
check('CA21', 'Request created, internal by default', r.status === 200 && rq2.client_visible === false && rq2.due_on !== null);
check('CA22', 'Editor cannot share it; admin can', (await call('clients.requests.share', { id: rq2.id, visible: true }, U.ED)).status === 404 && (await call('clients.requests.share', { id: rq2.id, visible: true }, U.ADM)).body.data[0].client_visible === true);
r = await call('clients.requests.update', { id: rq2.id, status: 'answered', response: 'Logo sent' }, U.ED);
check('CA23', 'A staff member logs the client’s answer', r.status === 200 && r.body.data[0].status === 'answered');
r = await call('clients.updates.create', { client: C1, title: 'Week 2', body: 'On track' }, U.ED);
check('CA24', 'Updates: create, archive, restore', r.status === 200 && (await call('clients.updates.archive', { id: r.body.data[0].id }, U.ED)).status === 200 && (await call('clients.updates.restore', { id: r.body.data[0].id }, U.ED)).status === 200);
r = await call('clients.stages.list', {}, U.ED);
check('CA25', 'Anyone using Clients reads the stage list, in order', r.status === 200 && r.body.data.map((s) => s.key).join() === 'onboarding,strategy,build,launch,optimise' && r.body.data[2].progress_only === true);
check('CA26', 'Only an admin manages stages; an in-use stage cannot be removed', (await call('clients.stages.create', { key: 'extra', label: 'Extra', position: 6 }, U.ED)).status === 404
  && (await call('clients.stages.create', { key: 'extra', label: 'Extra', position: 6 }, U.ADM)).status === 200 && (await call('clients.stages.update', { key: 'extra', label: 'More' }, U.ADM)).body.data[0].label === 'More'
  && (await call('clients.stages.delete', { key: 'extra' }, U.ADM)).status === 200 && (await call('clients.stages.delete', { key: 'build' }, U.ADM)).status === 422);
r = await call('clients.get', { id: C1 }, U.ED, A);
check('CA27', 'The same person with another organization’s header does not see the client', r.status === 404);
const logs = JSON.stringify(await rows("select detail from audit_events where subject_type='client_notes'"));
check('CA28', 'The API path is audited the same way: no note text in the audit trail', !/SECRET-API-NOTE|API note/.test(logs));

for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}`);
const p = results.filter((x) => x.ok).length; console.log(`\n${p}/${results.length} checks passed`);
await db.close(); process.exit(p === results.length ? 0 : 1);
