// Shared rate-limit store (migration 0009, prepared, off by default): counters, hashing, privacy, fallback, and the cross-instance proof.
import { randomUUID as id } from 'node:crypto';
import { openDb, migrate, session, recorder } from './lib.mjs';
import { createPgRateLimiter, createTieredLimiter, hashKey } from '../packages/core/rate-limit-store.mjs';
import { createRateLimiter } from '../packages/core/rate-limit.mjs';
import { createApi, NO_ORG } from '../packages/core/api.mjs';
import { createPgExecutor } from '../packages/core/pg-executor.mjs';
import { createSafeLogger } from '../packages/core/safe-log.mjs';

const db = await openDb(); await migrate(db);
const { asUser, asSuper } = session(db); const { results, check, errCode } = recorder();
const rows = async (s, p = []) => (await db.query(s, p)).rows;
await asSuper();
const query = async (s, p) => (await db.query(s, p)).rows;
const LIM = { read: { max: 3, windowMs: 60_000 }, write: { max: 3, windowMs: 60_000 }, sensitive: { max: 2, windowMs: 60_000 } };
const shared = createPgRateLimiter({ query, limits: LIM });
const U = id(), V = id();

let out = []; for (let i = 0; i < 5; i++) out.push(await shared.take(U, 'write'));
check('RS1', 'Allows the configured number, then blocks with a retry time', out.map((x) => x.allowed).join() === 'true,true,true,false,false' && out[3].retryAfterSeconds >= 1 && out[3].retryAfterSeconds <= 60);
check('RS2', 'Counters are per person and per class', (await shared.take(V, 'write')).allowed && (await shared.take(U, 'sensitive')).allowed && (await shared.take(U, 'read')).allowed);
check('RS3', 'The stored count is capped, so a flood cannot grow it', (await rows('select max(hits)::int m from private.api_rate_limits'))[0].m <= 4);
await db.query("update private.api_rate_limits set window_start = now() - interval '2 minutes'");
check('RS4', 'A new window starts after the old one ends', (await shared.take(U, 'write')).allowed);
const keys = (await rows('select key from private.api_rate_limits')).map((r) => r.key);
check('RS5', 'The table holds only hashed keys: no user id appears', keys.every((k) => k.startsWith('u:') && k.length <= 80) && !keys.some((k) => k.includes(U)) && hashKey(U) === hashKey(U) && hashKey(U) !== hashKey(V));
check('RS6', 'Nonsense limits are refused', (await errCode(() => db.query("select * from private.rate_limit_take('k','write',0,60)"))) === '22023');
await asUser(U);
check('RS7', 'Browser roles cannot call it or read the table', (await errCode(() => db.query("select * from private.rate_limit_take('k','write',5,60)"))) === '42501' && (await errCode(() => db.query('select * from private.api_rate_limits'))) === '42501');
await asSuper();
await db.query("insert into private.api_rate_limits (key, cls, window_start, hits) values ('u:old','read', now() - interval '3 hours', 1)");
for (let i = 0; i < 400; i++) await db.query("select * from private.rate_limit_take('u:x','read',1000,60)");
check('RS8', 'Expired counters tidy themselves up (no scheduler needed)', (await rows("select 1 from private.api_rate_limits where key='u:old'")).length === 0);

// ---- tiered behaviour
let calls = 0; const counting = { take: async (u, c) => { calls++; return shared.take(u, c); } };
const local = createRateLimiter({ limits: LIM });
const tier = createTieredLimiter({ local, shared: counting });
const W = id(); await db.query('delete from private.api_rate_limits');
for (let i = 0; i < 3; i++) await tier.take(W, 'read');
check('RS9', 'Reads never touch the shared store', calls === 0);
const t = []; for (let i = 0; i < 4; i++) t.push((await tier.take(W, 'write')).allowed);
check('RS10', 'Writes consult it, and the in-memory limiter stops a flood before the database is asked', t.join() === 'true,true,true,false' && calls === 3);
let errs = 0; const broken = createTieredLimiter({ local: createRateLimiter({ limits: LIM }), shared: { take: async () => { throw new Error('db down'); } }, onError: () => { errs++; } });
check('RS11', 'If the shared store fails, the in-memory answer stands and the failure is reported', (await broken.take(W, 'write')).allowed === true && errs === 1);

// ---- the point of it all: two instances, one budget
const BIGL = { read: { max: 1e6, windowMs: 6e4 }, write: { max: 1e6, windowMs: 6e4 }, sensitive: { max: 5, windowMs: 6e4 } };
await db.exec('reset role'); await db.query('delete from private.api_rate_limits');
const L = id(); const OWNER = id();
await db.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','L')", [L]);
let chain = Promise.resolve();
const acquire = () => { const prev = chain; let release; chain = new Promise((r) => { release = r; }); return prev.then(() => ({ query: (s, p) => db.query(s, p), release })); };
const instance = () => createApi({ executor: createPgExecutor({ acquire, role: 'app_user' }), logger: createSafeLogger(() => {}),
  limiter: createTieredLimiter({ local: createRateLimiter({ limits: BIGL }), shared: createPgRateLimiter({ query: async (s, p) => { await db.exec('reset role'); return (await db.query(s, p)).rows; }, limits: BIGL }) }) });
const a = instance(), b = instance();   // two separate "isolates": each with its own memory
const hit = (api, tok) => api.handle({ operation: 'invitation.accept', input: { token: tok }, auth: { userId: OWNER, email: 'x@example.com' }, headers: { 'x-org-id': NO_ORG } });
const codes = []; for (let i = 0; i < 8; i++) codes.push((await hit(i % 2 ? a : b, `t${i}`)).status);
check('RS12', 'Two instances share one budget: 5 attempts per minute in total, not 5 each', codes.filter((c) => c === 429).length === 3 && codes.slice(0, 5).every((c) => c === 404));
const memOnly = createApi({ executor: createPgExecutor({ acquire, role: 'app_user' }), logger: createSafeLogger(() => {}), limiter: createRateLimiter({ limits: BIGL }) });
const memOnly2 = createApi({ executor: createPgExecutor({ acquire, role: 'app_user' }), logger: createSafeLogger(() => {}), limiter: createRateLimiter({ limits: BIGL }) });
const NEW = id(); const c2 = [];
for (let i = 0; i < 8; i++) c2.push((await (i % 2 ? memOnly : memOnly2).handle({ operation: 'invitation.accept', input: { token: `m${i}` }, auth: { userId: NEW, email: 'x@example.com' }, headers: { 'x-org-id': NO_ORG } })).status);
check('RS13', 'Control: with memory-only limiters, the same traffic gets through (this is the gap the store closes)', c2.filter((c) => c === 429).length === 0);

for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}`);
const p = results.filter((x) => x.ok).length; console.log(`\n${p}/${results.length} checks passed`);
await db.close(); process.exit(p === results.length ? 0 : 1);
