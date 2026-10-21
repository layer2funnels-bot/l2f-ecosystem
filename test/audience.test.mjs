// Gate G2, second wall (migration 0016): a client account reaches ONLY the operations marked for clients; every other operation answers
// "not found" before any query runs. The sweep walks every registered operation, so a new operation is covered the day it is added.
import { randomUUID as id } from 'node:crypto';
import { openDb, migrate, session, recorder } from './lib.mjs';
import { createApi } from '../packages/core/api.mjs';
import { operations } from '../packages/core/operations.mjs';
import { createPgExecutor } from '../packages/core/pg-executor.mjs';
import { createRateLimiter } from '../packages/core/rate-limit.mjs';
import { createSafeLogger } from '../packages/core/safe-log.mjs';

const db = await openDb(); await migrate(db);
const { asSuper } = session(db); const { results, check } = recorder();
const rows = async (s, p = []) => (await db.query(s, p)).rows;

await asSuper();
const L = id(), A = id();
const U = { OWN: id(), ED: id(), CL: id(), NONE: id(), CLA: id() };
await db.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','L'),($2,'aurj','A')", [L, A]);
await db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff','owner'),($1,$3,'staff','editor'),($4,$2,'staff','owner')", [L, U.OWN, U.ED, A]);
const C1 = id(); await db.query("insert into clients (id,workspace_id,name) values ($1,$2,'Client One')", [C1, L]);
await db.query("insert into memberships (workspace_id,user_id,kind,client_id) values ($1,$2,'client',$3)", [L, U.CL, C1]);
await db.query("update workspace_apps set enabled = true where workspace_id = $1 and app_key = 'portal'", [L]);

let seen = []; let chain = Promise.resolve();
const acquire = () => { const prev = chain; let release; chain = new Promise((r) => { release = r; }); return prev.then(() => ({ query: (s, p) => { seen.push(String(s)); return db.query(s, p); }, release })); };
const BIG = { read: { max: 1e6, windowMs: 6e4 }, write: { max: 1e6, windowMs: 6e4 }, sensitive: { max: 1e6, windowMs: 6e4 } };
const api = createApi({ executor: createPgExecutor({ acquire, role: 'app_user' }), logger: createSafeLogger(() => {}), limiter: createRateLimiter({ limits: BIG }) });
const call = async (op, input, user, org = L) => { seen = []; const r = await api.handle({ operation: op, input, auth: { userId: user, email: 'x@example.com' }, headers: { 'x-org-id': org } }); return { ...r, ran: seen.filter((s) => !/my_audience|^begin|^commit|^rollback|set local role|set_config/.test(s)).length }; };

const sample = (f) => ({ uuid: () => id(), text: () => 'x'.repeat(Math.max(1, f.min ?? 1)), email: () => 'a@example.com', int: () => Math.max(f.min ?? 0, 1), bool: () => true, number: () => Math.max(f.min ?? 0, 1),
  currency: () => 'GBP', date: () => '2026-01-01', timestamp: () => '2026-01-01T00:00:00Z', hex: () => '#112233', enum: () => f.values[0], list: () => [] }[f.type]());
const inputFor = (op) => Object.fromEntries(Object.entries(op.input).filter(([, f]) => f.required).map(([k, f]) => [k, sample(f)]));

const all = Object.values(operations);
const orgOps = all.filter((o) => !o.allowNoOrg);
const staffOps = orgOps.filter((o) => (o.audience ?? 'staff') === 'staff');
const clientOps = orgOps.filter((o) => o.audience === 'client');
const anyOps = orgOps.filter((o) => o.audience === 'any');

check('AU1', `Every organization operation declares who may call it: ${staffOps.length} staff-only, ${clientOps.length} client, ${anyOps.length} either`, staffOps.length + clientOps.length + anyOps.length === orgOps.length && staffOps.length > 100);

// the sweep: a client account, portal ON, calling every staff operation with valid input: "not found" and no query beyond the audience check
const leaked = [], invalid = [];
for (const op of staffOps) {
  const r = await call(op.name, inputFor(op), U.CL);
  if (r.status === 422) { invalid.push(op.name); continue; }
  if (!(r.status === 404 && r.ran === 0)) leaked.push(`${op.name}:${r.status}:${r.ran}`);
}
check('AU2', `Client account (portal on): all ${staffOps.length} staff operations answer "not found" and run no query`, leaked.length === 0, leaked.slice(0, 5).join(' | '));
check('AU3', 'The sweep reached every operation with valid input (none skipped as invalid)', invalid.length === 0, invalid.slice(0, 5).join(','));

// the same sweep for a person with no membership at all, and for the other organization's owner naming this organization
const leaked2 = [];
for (const op of staffOps) {
  for (const u of [U.NONE, U.CLA]) { const r = await call(op.name, inputFor(op), u); if (!(r.status === 404 && r.ran === 0)) leaked2.push(`${op.name}:${r.status}`); }
}
check('AU4', 'A stranger gets "not found" on every staff operation too, without running a query', leaked2.length === 0, leaked2.slice(0, 5).join(' | '));
const r4 = await call('clients.list', {}, U.OWN, A);
check('AU5', 'The other organization\'s owner naming the first organization gets nothing (not a member there)', (await call('clients.list', {}, U.OWN, id())).status === 404 && r4.status !== 500);

// staff cannot use client operations as if they were clients
const wrong = [];
for (const op of clientOps) { const r = await call(op.name, inputFor(op), U.OWN); if (!(r.status === 404 && r.ran === 0)) wrong.push(op.name); }
check('AU6', `Staff accounts get "not found" on the ${clientOps.length} client operations (the Portal is a client view, not a staff one)`, wrong.length === 0, wrong.join(','));

// the Launcher is the one organization operation both audiences may use
const lc = await call('launcher.list', {}, U.CL);
check('AU7', 'The Launcher works for a client account and offers the Portal tile only', lc.status === 200 && lc.body.data.map((x) => x.app_key).join(',') === 'portal', JSON.stringify(lc.body.data));

// audience of the caller itself
const aud = async (u, org) => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: u, role: 'authenticated' })]); return (await rows('select public.my_audience($1) a', [org]))[0].a; };
check('AU8', 'my_audience: staff, client, or nobody', (await aud(U.OWN, L)) === 'staff' && (await aud(U.CL, L)) === 'client' && (await aud(U.NONE, L)) === null && (await aud(U.CL, A)) === null);
await db.query("update memberships set status = 'deactivated' where user_id = $1 and workspace_id = $2", [U.CL, L]);
const lc2 = await call('launcher.list', {}, U.CL);
check('AU9', 'A deactivated client account has no audience at all, and the Launcher shows it nothing', (await aud(U.CL, L)) === null && lc2.status === 200 && lc2.body.data.length === 0);

for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}${x.ok ? '' : `  [${x.detail ?? ''}]`}`);
const p = results.filter((x) => x.ok).length; console.log(`\n${p}/${results.length} checks passed`); await db.close(); process.exit(p === results.length ? 0 : 1);
