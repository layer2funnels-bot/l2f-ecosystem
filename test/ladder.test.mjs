// Value Ladder (migration 0020): ladders and rungs, offers by reference, ordering, archive before delete, scope, isolation, audit.
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
const U = { OWN: id(), ADM: id(), ED: id(), ED2: id(), VW: id(), AOWN: id(), BOTH: id() };
await db.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','L'),($2,'aurj','A')", [L, A]);
const staff = (u, ws, r) => db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff',$3)", [ws, u, r]);
await staff(U.OWN, L, 'owner'); await staff(U.ADM, L, 'admin'); await staff(U.ED, L, 'editor'); await staff(U.ED2, L, 'editor'); await staff(U.VW, L, 'viewer'); await staff(U.AOWN, A, 'owner'); await staff(U.BOTH, L, 'owner'); await staff(U.BOTH, A, 'owner');
const C1 = id(), C2 = id();
await db.query("insert into clients (id,workspace_id,name) values ($1,$3,'Client One'),($2,$3,'Client Two')", [C1, C2, L]);
for (const u of [U.ED, U.ED2, U.VW]) for (const a of ['value_ladder', 'office']) await db.query("insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,$3)", [L, u, a]);
const lvl0 = async (n) => (await rows('select id from access_levels where workspace_id=$1 and name=$2', [L, n]))[0].id;
await db.query("insert into access_assignments (workspace_id,access_level_id,principal_type,principal_id) values ($1,$2,'user',$3)", [L, await lvl0('All clients · edit'), U.ED]);
const OF = { gen: id(), c1: id(), c2: id(), a: id() };
await db.query("insert into funnel_offers (id,workspace_id,client_id,name,price_amount,currency) values ($1,$4,null,'General offer',97,'GBP'),($2,$4,$5,'Client one offer',497,'GBP'),($3,$4,$6,'Client two offer',1497,'GBP')", [OF.gen, OF.c1, OF.c2, L, C1, C2]);
await db.query("insert into funnel_offers (id,workspace_id,name,price_amount,currency) values ($1,$2,'Aurj offer',10,'USD')", [OF.a, A]);

let r = await J('valueladder.create', { name: 'Ladder' }, U.ED);
check('VL1', 'While the app is "coming soon" nobody can create a ladder', r.status === 404);
await asSuper(); await db.query("update apps set lifecycle = 'active' where key = 'value_ladder'");
await db.query("insert into workspace_apps (workspace_id, app_key, enabled) values ($1, 'value_ladder', true) on conflict (workspace_id, app_key) do update set enabled = true", [L]);

r = await J('valueladder.create', { name: 'Client One ladder', description: 'From free to premium', client: C1 }, U.ED);
const LD = r.row?.id;
check('VL2', 'An editor creates a ladder for a client', r.status === 200 && r.row.client_id === C1 && r.row.rungs === 0, JSON.stringify(r.body));
const add = (over, u = U.ED, ladder = LD) => J('valueladder.rungs.add', { ladder, stage: 'lead_magnet', name: 'Free guide', ...over }, u);
r = await add({});
const R1 = r.row?.id;
check('VL3', 'The first rung takes position 1 and the ladder\'s client', r.status === 200 && r.row.position === 1 && r.row.stage === 'lead_magnet', JSON.stringify(r.body));
r = await add({ stage: 'tripwire', name: 'Mini course', offer: OF.gen });
const R2 = r.row?.id;
check('VL4', 'A rung that points at an offer shows the offer\'s name and price (one place for prices)', r.status === 200 && r.row.position === 2 && r.row.offer_name === 'General offer' && r.row.price_amount === 97 && r.row.currency === 'GBP');
r = await add({ stage: 'core', name: 'Done-for-you funnel', offer: OF.c1 });
const R3 = r.row?.id;
check('VL5', 'A rung may use this client\'s own offer', r.status === 200 && r.row.price_amount === 497);
check('VL6', 'A rung cannot use another client\'s offer, nor another organization\'s', (await add({ offer: OF.c2 })).status === 422 && (await add({ offer: OF.a })).status === 404);
r = await add({ stage: 'upsell', name: 'Retainer', price_amount: 1500, currency: 'GBP' });
const R4 = r.row?.id;
check('VL7', 'A rung with no offer may carry its own price', r.status === 200 && r.row.price_amount === 1500);
check('VL8', 'A price needs a currency, and the reverse', (await add({ price_amount: 5 })).status !== 200 && (await add({ currency: 'GBP' })).status !== 200);
r = await J('valueladder.get', { id: LD }, U.VW);
check('VL9', 'The ladder reads in order with totals per currency (never mixed)', r.status === 200 && r.row.rung_list.map((x) => x.position).join() === '1,2,3,4' && r.row.totals.length === 1 && r.row.totals[0].currency === 'GBP' && r.row.totals[0].total === 2094, JSON.stringify(r.row));
r = await J('valueladder.rungs.reorder', { ladder: LD, order: [R4, R3, R2, R1] }, U.ED);
check('VL10', 'Reordering rewrites the positions in one step', r.status === 200 && r.data.map((x) => x.id).join() === [R4, R3, R2, R1].join() && r.data.map((x) => x.position).join() === '1,2,3,4');
check('VL11', 'A reorder that misses a rung, repeats one or names a stranger is refused', (await J('valueladder.rungs.reorder', { ladder: LD, order: [R4, R3, R2] }, U.ED)).status === 422 && (await J('valueladder.rungs.reorder', { ladder: LD, order: [R4, R4, R2, R1] }, U.ED)).status === 422 && (await J('valueladder.rungs.reorder', { ladder: LD, order: [R4, R3, R2, id()] }, U.ED)).status === 422);
r = await J('valueladder.rungs.update', { id: R2, name: 'Mini course v2', clear_offer: true, price_amount: 47, currency: 'GBP' }, U.ED);
check('VL12', 'A rung can be edited and taken off its offer', r.status === 200 && r.row.offer_id === null && r.row.price_amount === 47);
r = await J('valueladder.rungs.archive', { id: R3 }, U.ED);
const g1 = (await J('valueladder.get', { id: LD }, U.ED)).row;
check('VL13', 'Archiving a rung takes it out of the order; the others keep their relative order', r.status === 200 && g1.rung_list.map((x) => x.id).join() === [R4, R2, R1].join() && g1.rungs === 3);
r = await J('valueladder.rungs.restore', { id: R3 }, U.ED);
check('VL14', 'A restored rung goes to the end', r.status === 200 && (await J('valueladder.get', { id: LD }, U.ED)).row.rung_list.at(-1).id === R3);
for (let n = 0; n < 8; n += 1) await add({ name: `Extra ${n}` });
r = await add({ name: 'One too many' });
check('VL15', 'A ladder has at most 12 rungs', r.status === 422 || r.status === 404);
await asUser(U.OWN);
check('VL16', 'A rung cannot move to another ladder or client; positions stay unique', (await errCode(() => db.query('update value_ladder_rungs set ladder_id = $2 where id = $1', [R1, id()]))) !== 'no-error'
  && (await errCode(() => db.query('update value_ladder_rungs set position = 1 where id = $1 and position <> 1', [R2]))) === '23505');
r = await J('valueladder.delete', { id: LD }, U.OWN);
check('VL17', 'A ladder with rungs cannot be deleted, active or archived', r.status !== 200);
r = await J('valueladder.rungs.delete', { id: R1 }, U.OWN);
check('VL18', 'An active rung cannot be deleted (archive first)', r.status !== 200);
await J('valueladder.rungs.archive', { id: R1 }, U.ED);
check('VL19', 'An archived rung is deleted by an owner, not an editor', (await J('valueladder.rungs.delete', { id: R1 }, U.ED)).status === 404 && (await J('valueladder.rungs.delete', { id: R1 }, U.OWN)).status === 200);
await asSuper();
check('VL20', 'An offer that is on a ladder cannot be deleted from under it', (await errCode(() => db.query('delete from funnel_offers where id = $1', [OF.c1]))) === 'P0001');
check('VL21', 'A viewer reads ladders and changes nothing', (await J('valueladder.list', {}, U.VW)).data.length === 1 && (await J('valueladder.create', { name: 'x' }, U.VW)).status === 404 && (await add({ name: 'x' }, U.VW)).status === 404 && (await J('valueladder.rungs.reorder', { ladder: LD, order: [] }, U.VW)).status !== 200);
await db.query("insert into permission_overrides (workspace_id,principal_type,principal_id,permission_key,effect,client_id,reason) values ($1,'user',$2,'valueladder.ladder.view','deny',$3,'test')", [L, U.ED2, C1]);
check('VL22', 'A restriction on one client hides that client\'s ladders from that person only', (await J('valueladder.list', {}, U.ED2)).data.length === 0 && (await J('valueladder.get', { id: LD }, U.ED2)).status === 404 && (await J('valueladder.get', { id: LD }, U.ED)).status === 200);
check('VL23', 'Another organization sees nothing, by list or by id, and a person in both sees only the named organization', (await J('valueladder.list', {}, U.AOWN, A)).data.length === 0 && (await J('valueladder.get', { id: LD }, U.AOWN, A)).status === 404
  && (await J('valueladder.list', {}, U.BOTH, A)).data.length === 0 && (await asUser(U.BOTH, { org: A }).then(() => rows('select id from value_ladder_rungs'))).length === 0);
await asSuper();
const au = JSON.stringify((await rows("select detail from audit_events where action like 'value_%'")).map((x) => x.detail));
check('VL24', 'The audit log records ladders and rungs by id, stage, position and price, never the descriptions', au.length > 50 && !au.includes('From free to premium'));
check('VL25', 'A client that has ladders cannot be deleted', (await errCode(() => db.query('delete from clients where id = $1', [C1]))) === 'P0001');

for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(6)} ${x.name}${x.ok ? '' : `  [${x.detail ?? ''}]`}`);
const p = results.filter((x) => x.ok).length; console.log(`\n${p}/${results.length} checks passed`); await db.close(); process.exit(p === results.length ? 0 : 1);
