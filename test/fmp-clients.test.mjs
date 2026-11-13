// Funnel Mapper ↔ Clients: one client list (migration 0052, packages/core/fmp-operations.mjs).
// Allow and deny per role, app access, client scope (SDOR), organization isolation (WCIGA), duplicate handling (never automatic),
// commercial terms, the id map, audit. Through the real database and through the API layer.
import { randomUUID as id } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { openDb, migrate, session, recorder } from './lib.mjs';
import { createApi } from '../packages/core/api.mjs';
import { createPgExecutor } from '../packages/core/pg-executor.mjs';
import { createRateLimiter } from '../packages/core/rate-limit.mjs';
import { createSafeLogger } from '../packages/core/safe-log.mjs';
import { normEmail, normName } from '../packages/core/fmp-operations.mjs';

const db = await openDb(); await migrate(db);
const { asUser, asSuper } = session(db); const { results, check, errCode } = recorder();
const rows = async (s, p = []) => (await db.query(s, p)).rows;

let chain = Promise.resolve();
const acquire = () => { const prev = chain; let release; chain = new Promise((r) => { release = r; }); return prev.then(() => ({ query: (s, p) => db.query(s, p), release })); };
const BIG = { read: { max: 1e6, windowMs: 6e4 }, write: { max: 1e6, windowMs: 6e4 }, sensitive: { max: 1e6, windowMs: 6e4 } };
const api = createApi({ executor: createPgExecutor({ acquire, role: 'app_user' }), logger: createSafeLogger(() => {}), limiter: createRateLimiter({ limits: BIG }) });
const call = (op, input, user, org = L) => api.handle({ operation: op, input, auth: { userId: user, email: 'x@example.com' }, headers: { 'x-org-id': org } });
const data = (r) => r.body?.data ?? [];

await asSuper();
const L = id(), A = id();
const U = { OWN: id(), ED: id(), VW: id(), NOFMP: id(), SCOPED: id(), AOWN: id() };
await db.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','L'),($2,'aurj','A')", [L, A]);
await db.query("insert into workspace_apps (workspace_id, app_key, enabled) values ($1, 'funnel_mapper_pro', true) on conflict (workspace_id, app_key) do update set enabled = true", [L]);
const staff = (u, ws, r) => db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff',$3)", [ws, u, r]);
await staff(U.OWN, L, 'owner'); await staff(U.ED, L, 'editor'); await staff(U.VW, L, 'viewer'); await staff(U.NOFMP, L, 'editor'); await staff(U.SCOPED, L, 'editor'); await staff(U.AOWN, A, 'owner');
for (const u of [U.ED, U.VW, U.NOFMP, U.SCOPED]) await db.query("insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,'clients')", [L, u]);
for (const u of [U.ED, U.VW, U.SCOPED]) await db.query("insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,'funnel_mapper_pro')", [L, u]);
const lvl = async (name) => (await rows('select id from access_levels where workspace_id=$1 and name=$2', [L, name]))[0].id;
const assign = (u, level, client = null) => db.query("insert into access_assignments (workspace_id,access_level_id,principal_type,principal_id,client_id) values ($1,$2,'user',$3,$4)", [L, level, u, client]);
const C1 = id(), C2 = id(), CA = id();
await db.query("insert into clients (id,workspace_id,name) values ($1,$4,'Sam Carter'),($2,$4,'Priya Nair'),($3,$5,'Aurj Student Co')", [C1, C2, CA, L, A]);
await db.query("update client_profiles set email='sam@carterstrength.test', business_name='Carter Strength' where client_id=$1", [C1]);
await db.query("update client_profiles set email='priya@calmmind.test' where client_id=$1", [C2]);
await db.query("update client_profiles set email='hello@aurj.test' where client_id=$1", [CA]);
await assign(U.ED, await lvl('All clients · edit'));
await assign(U.NOFMP, await lvl('All clients · edit'));
await assign(U.VW, await lvl('All clients · read'));
await assign(U.SCOPED, await lvl('Client team'), C1);

// ---- A. migration
const sql = readFileSync(new URL('../migrations/0052_funnel_mapper_clients.sql', import.meta.url), 'utf8');
check('FM1', 'The app is called "Funnel Mapper" everywhere users see it; its internal key stays funnel_mapper_pro', (await rows("select name from apps where key='funnel_mapper_pro'"))[0]?.name === 'Funnel Mapper');
check('FM2', 'Five fmp.* permissions exist on the Funnel Mapper app (sharing and delete are sensitive)', (await rows("select key, sensitive from permissions where app_key='funnel_mapper_pro' order by key")).map((r) => `${r.key}:${r.sensitive}`).join() === 'fmp.funnel.create:false,fmp.funnel.delete:true,fmp.funnel.edit:false,fmp.funnel.share:true,fmp.funnel.view:false');
check('FM3', 'The migration adds no second client table: client identity stays in public.clients (no create table for clients in fmp)', !/create table fmp\.clients/i.test(sql) && /references public\.clients/.test(sql));
check('FM4', 'The migration moves no data and enables no app for any organization (switching it on is an owner step)', !/workspace_apps/.test(sql) && !/insert into public\.clients/.test(sql) && !/delete from/i.test(sql));

// ---- B. one list for both apps
let r = await call('fmp.clients.list', {}, U.ED);
check('FM5', 'Funnel Mapper lists exactly the clients the Clients app lists for the same person', r.status === 200 && data(r).map((x) => x.id).sort().join() === data(await call('clients.list', {}, U.ED)).map((x) => x.id).sort().join() && data(r).length === 2);
r = await call('fmp.clients.create', { name: 'Marcus Lee', email: 'Marcus@ScaleOps.test ', status: 'proposal', business_name: 'ScaleOps' }, U.ED);
const marcus = data(r)[0]?.client;
check('FM6', 'A new client made in Funnel Mapper is created in the shared list and appears in the Clients app with its details', data(r)[0]?.outcome === 'created'
  && data(await call('clients.get', { id: marcus?.id }, U.ED))[0]?.email === 'marcus@scaleops.test' && data(await call('clients.get', { id: marcus?.id }, U.ED))[0]?.status === 'proposal');
r = await call('clients.create', { name: 'Ayesha Khan', email: 'ayesha@glowskin.test' }, U.ED);
const ayesha = data(r)[0];
check('FM7', 'A client made in the Clients app appears in Funnel Mapper straight away (same row, same id)', data(await call('fmp.clients.list', {}, U.ED)).some((x) => x.id === ayesha.id));

// ---- C. duplicates: never automatic
const count = async () => (await rows('select count(*)::int n from clients where workspace_id=$1', [L]))[0].n;
let before = await count();
r = await call('fmp.clients.create', { name: 'S. Carter', email: '  SAM@carterstrength.TEST' }, U.ED);
check('FM8', 'Same e-mail (any case, extra spaces): nothing is created or linked; the existing client is offered for the person to decide', data(r)[0]?.outcome === 'needs_decision' && data(r)[0].reason === 'email_exact' && data(r)[0].candidates[0].id === C1 && await count() === before);
r = await call('fmp.clients.create', { name: 'priya  NAIR', email: 'priya.new@else.test' }, U.ED);
check('FM9', 'Same name only (different e-mail): flagged as a possible duplicate for review, not linked, not created', data(r)[0]?.outcome === 'needs_decision' && data(r)[0].reason === 'possible_duplicate' && data(r)[0].candidates[0].match === 'name' && await count() === before);
r = await call('fmp.clients.create', { name: 'New Person', business_name: 'carter strength' }, U.ED);
check('FM10', 'Same business name only: also a possible duplicate for review', data(r)[0]?.outcome === 'needs_decision' && data(r)[0].candidates.some((c) => c.id === C1 && c.match === 'business_name'));
await call('clients.create', { name: 'Sam Carter (gym)', email: 'sam@carterstrength.test' }, U.ED);
before = await count();
r = await call('fmp.clients.create', { name: 'Someone', email: 'sam@carterstrength.test' }, U.ED);
check('FM11', 'Two existing clients share the e-mail: "ambiguous", the person must pick one; nothing is created', data(r)[0]?.reason === 'ambiguous' && data(r)[0].candidates.filter((c) => c.match === 'email_exact').length === 2 && await count() === before);
r = await call('fmp.clients.create', { name: 'Different Name', email: 'other@x.test', decision: 'link', link_to: C1 }, U.ED);
check('FM12', 'Linking to the chosen client changes none of its details (name, e-mail stay as they were)', data(r)[0]?.outcome === 'linked' && data(r)[0].client.id === C1
  && (await rows('select c.name, p.email from clients c join client_profiles p on p.client_id=c.id where c.id=$1', [C1]))[0].name === 'Sam Carter' && (await rows('select email from client_profiles where client_id=$1', [C1]))[0].email === 'sam@carterstrength.test');
r = await call('fmp.clients.create', { name: 'Priya Nair', email: 'priya2@else.test', decision: 'new' }, U.ED);
check('FM13', 'After seeing the candidates the person may still create a separate client ("new")', data(r)[0]?.outcome === 'created' && await count() === before + 1);
check('FM14', 'Name and e-mail comparison rules', normEmail(' A@B.Com ') === 'a@b.com' && normEmail('') === null && normName('Sam  Carter Ltd.') === 'sam carter ltd' && normName('Zoë') === 'zoe');

// ---- D. permissions are decided by the server (a switch in the Funnel Mapper screen grants nothing)
r = await call('fmp.clients.list', {}, U.NOFMP);
check('FM15', 'Without Funnel Mapper access the Funnel Mapper operations return nothing, although the person can use the Clients app', data(r).length === 0 && data(await call('clients.list', {}, U.NOFMP)).length > 0);
before = await count();
r = await call('fmp.clients.create', { name: 'Sneaky', decision: 'new' }, U.NOFMP);
check('FM16', 'Without Funnel Mapper access "New client" from Funnel Mapper creates nothing', data(r).length === 0 && await count() === before);
r = await call('fmp.clients.create', { name: 'Viewer made', decision: 'new' }, U.VW);
check('FM17', 'A viewer can list clients in Funnel Mapper but cannot create one (role floor)', data(r).length === 0 && data(await call('fmp.clients.list', {}, U.VW)).length > 0 && await count() === before);
r = await call('fmp.clients.list', {}, U.SCOPED);
check('FM18', 'A person scoped to one client sees only that client in Funnel Mapper', data(r).map((x) => x.id).join() === C1);
r = await call('fmp.clients.match', { name: 'Anyone', email: 'priya@calmmind.test' }, U.SCOPED);
check('FM19', 'Duplicate checks never reveal a client the person may not see (no existence leak)', r.status === 200 && data(r)[0].exact.length === 0 && data(r)[0].possible.length === 0);
r = await call('fmp.clients.create', { name: 'x', decision: 'link', link_to: C2 }, U.SCOPED);
check('FM20', 'Linking to a client outside the person\'s scope answers "not found"', data(r).length === 0);

// ---- E. organizations never mix
r = await call('fmp.clients.list', {}, U.AOWN, A);
check('FM21', 'Aurj has no Funnel Mapper: even its owner gets nothing from the Funnel Mapper operations', data(r).length === 0);
r = await call('fmp.clients.list', {}, U.AOWN, L);
check('FM22', 'An Aurj person naming the Layer2Funnels organization gets nothing (not a member)', data(r).length === 0);
r = await call('fmp.clients.match', { name: 'Aurj Student Co', email: 'hello@aurj.test' }, U.ED);
check('FM23', 'Duplicate checks in Layer2Funnels never find Aurj clients', data(r)[0].exact.length === 0 && data(r)[0].possible.length === 0);

// ---- F. commercial terms (Funnel Mapper's own data about a shared client)
r = await call('fmp.clients.commercial.set', { client: C1, monthly_retainer: 1500, pricing_model: 'hourly', pricing_amount: 60, pricing_frequency: 'hour' }, U.ED);
check('FM24', 'An editor sets a client\'s pricing in Funnel Mapper; it is stored once and shown in the list', r.status === 200 && Number(data(r)[0]?.monthly_retainer) === 1500 && data(r)[0]?.pricing_model === 'hourly'
  && Number(data(await call('fmp.clients.list', {}, U.VW)).find((x) => x.id === C1)?.pricing_amount) === 60);
r = await call('fmp.clients.commercial.set', { client: C1, monthly_retainer: 9 }, U.VW);
check('FM25', 'A viewer cannot change pricing', data(r).length === 0 && Number((await rows('select monthly_retainer from fmp.client_commercial where client_id=$1', [C1]))[0].monthly_retainer) === 1500);
r = await call('fmp.clients.commercial.set', { client: C2, monthly_retainer: 9 }, U.SCOPED);
check('FM26', 'A person scoped to another client cannot set pricing on this one', data(r).length === 0 && (await rows('select 1 from fmp.client_commercial where client_id=$1', [C2])).length === 0);
await asUser(U.NOFMP);
check('FM27', 'Direct database read of pricing without Funnel Mapper access returns nothing', (await rows('select * from fmp.client_commercial')).length === 0);
await asUser(U.AOWN);
check('FM28', 'Aurj cannot read or write Layer2Funnels pricing directly', (await rows('select * from fmp.client_commercial')).length === 0
  && (await errCode(() => db.query('insert into fmp.client_commercial (workspace_id, client_id) values ($1,$2)', [L, C2]))) === '42501');
await asUser(U.ED);
check('FM29', 'The old-id map is never reachable by the app role (only migrations use it)', (await errCode(() => db.query('select * from fmp.id_map'))) === '42501');
check('FM30', 'Pricing cannot point at another organization\'s client (composite key)', ['23503', '42501'].includes(await errCode(() => db.query('insert into fmp.client_commercial (workspace_id, client_id) values ($1,$2)', [L, CA]))));
await asSuper();
check('FM31', 'Pricing changes are in the audit log', (await rows("select count(*)::int n from audit_events where workspace_id=$1 and action like 'client_commercial.%'", [L]))[0].n >= 1);
check('FM32', 'Archiving a client in Clients archives it in Funnel Mapper too (same row: it leaves the active list)', await (async () => {
  if (!marcus) return false; await call('clients.archive', { id: marcus.id }, U.ED);
  return !data(await call('fmp.clients.list', {}, U.ED)).some((x) => x.id === marcus.id) && data(await call('fmp.clients.list', { archived: true }, U.ED)).some((x) => x.id === marcus.id); })());

for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}${x.ok ? '' : `  [${x.detail}]`}`);
const p = results.filter((x) => x.ok).length; console.log(`\n${p}/${results.length} checks passed`);
await db.close(); process.exit(p === results.length ? 0 : 1);
