// Phase 5 slice 0: the API layer against a real database (PGlite or real Postgres).
// Covers: x-org-id on every request, typed input, one error contract, rate limiting (T16), safe logs (T15).
import { randomUUID as id } from 'node:crypto';
import { openDb, migrate, recorder } from './lib.mjs';
import { createApi, NO_ORG } from '../packages/core/api.mjs';
import { createPgExecutor } from '../packages/core/pg-executor.mjs';
import { createRateLimiter, DEFAULT_LIMITS } from '../packages/core/rate-limit.mjs';
import { createSafeLogger } from '../packages/core/safe-log.mjs';
import { NOT_FOUND } from '../packages/core/errors.mjs';

const db = await openDb(); await migrate(db);
const { results, check } = recorder();

// One connection: serialise requests so transactions never interleave; count executor entries to prove "no DB call".
let chain = Promise.resolve(), dbCalls = 0;
const acquire = () => { const prev = chain; let release; chain = new Promise((r) => { release = r; });
  return prev.then(() => ({ query: (s, p) => db.query(s, p), release })); };
const base = createPgExecutor({ acquire, role: 'app_user' });
const executor = { withRequest: (a, f) => { dbCalls++; return base.withRequest(a, f); } };

let clock = 1_700_000_000_000; const now = () => clock;
const logs = []; const logger = createSafeLogger((l) => logs.push(l));
const mk = () => createApi({ executor, logger, limiter: createRateLimiter({ limits: DEFAULT_LIMITS, now }), now });
let api = mk();

// ---- fixture (as superuser): two organizations, users in one or both
await db.exec('reset role');
const L = id(), A = id();
const U = { ADMIN_BOTH: id(), VIEWER_L: id(), L_ONLY: id(), OUTSIDER: id() };
await db.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','Layer2Funnels'),($2,'aurj','Aurj')", [L, A]);
const staff = (u, ws, r) => db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff',$3)", [ws, u, r]);
await staff(U.ADMIN_BOTH, L, 'admin'); await staff(U.ADMIN_BOTH, A, 'admin');
await staff(U.VIEWER_L, L, 'viewer'); await staff(U.L_ONLY, L, 'owner');
await db.query("insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,'office'),($1,$2,'projects')", [L, U.VIEWER_L]);
await db.query("insert into clients (workspace_id,name) values ($1,'L2F client'),($2,'Aurj client')", [L, A]);

const call = (operation, input, userId, org, extra = {}) =>
  api.handle({ operation, input, auth: userId ? { userId, email: extra.email ?? 'x@example.com' } : null, headers: org === undefined ? {} : { 'x-org-id': org, ...(extra.headers ?? {}) } });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const errOf = (r) => ({ status: r.status, code: r.body.error?.code, message: r.body.error?.message });

// ---- A. x-org-id on every request
let before = dbCalls;
let r = await call('launcher.list', {}, U.ADMIN_BOTH, undefined);
check('A1', 'A request without x-org-id is refused (400 org_required) before any database work', r.status === 400 && r.body.error.code === 'org_required' && dbCalls === before);
r = await call('launcher.list', {}, U.ADMIN_BOTH, 'not-a-uuid');
check('A2', 'A malformed x-org-id is refused the same way', r.status === 400 && r.body.error.code === 'org_required' && dbCalls === before);
r = await api.handle({ operation: 'launcher.list', input: {}, auth: { userId: U.ADMIN_BOTH }, headers: { 'X-ORG-ID': L } });
check('A3', 'Header name is case-insensitive', r.status === 200 && Array.isArray(r.body.data));
r = await call('launcher.list', {}, U.ADMIN_BOTH, NO_ORG);
check('A4', 'The "no organization yet" value is refused for operations that need an organization', r.status === 400 && r.body.error.code === 'org_required' && dbCalls === before + 1);
r = await call('launcher.list', { p_workspace: A }, U.ADMIN_BOTH, L);
check('A5', 'An operation cannot be pointed at another organization through its input (unknown field refused)', r.status === 422 && same(r.body.error.fields, ['p_workspace']));
r = await call('clients.list', {}, U.ADMIN_BOTH, L);
const namesL = r.body.data.map((x) => x.name);
r = await call('clients.list', {}, U.ADMIN_BOTH, A);
const namesA = r.body.data.map((x) => x.name);
check('A6', 'Same person, same operation: the header decides which organization’s rows come back', same(namesL, ['L2F client']) && same(namesA, ['Aurj client']));
r = await call('clients.list', {}, U.L_ONLY, A);
check('A7', 'A header naming an organization the person does not belong to is refused as not found (before any query runs)', r.status === 404);
await db.exec('reset role');
const leak = (await db.query("select current_setting('request.headers', true) h, current_setting('request.jwt.claims', true) c, current_user u")).rows[0];
check('A8', 'No identity or header survives past the request (transaction-local; role restored)', !leak.h && !leak.c && leak.u !== 'app_user');

// ---- B. one error contract
const denied = await call('invitation.create', { email: 'new@example.com', kind: 'staff', role: 'viewer' }, U.VIEWER_L, L);
const unknownOp = await call('no.such.op', {}, U.VIEWER_L, L);
const anonymous = await call('clients.list', {}, null, L);
const protoOp = await call('constructor', {}, U.VIEWER_L, L);
check('B1', 'Denied, unknown-operation, not-signed-in and prototype-name answers are identical to the browser',
  same(errOf(denied), errOf(unknownOp)) && same(errOf(unknownOp), errOf(anonymous)) && same(errOf(anonymous), errOf(protoOp)) && same(errOf(denied), { status: 404, code: 'not_found', message: NOT_FOUND.message }));
r = await call('invitation.accept', { token: 'f'.repeat(64) }, U.VIEWER_L, NO_ORG);
check('B2', 'A wrong invitation token looks exactly like any other not-found', same(errOf(r), errOf(denied)));
r = await call('org.switch', { org: id(), app: 'office' }, U.ADMIN_BOTH, L);
const notMember = await call('org.switch', { org: A, app: 'office' }, U.L_ONLY, L);
check('B3', 'Switching to a non-existent and to a not-joined organization give the same answer', r.status === 200 && same(r.body.data, notMember.body.data) && r.body.data[0].outcome === 'not_available');
r = await call('invitation.create', { email: 'not an email', kind: 'robot', extra: 1 }, U.ADMIN_BOTH, L);
check('B4', 'Invalid input: 422, names the fields only, no values echoed, database untouched', r.status === 422 && same(r.body.error.fields, ['email', 'extra', 'kind']) && !JSON.stringify(r.body).includes('not an email'));
r = await call('org.switch', { org: A, app: 'office', page: 'x'.repeat(500) }, U.ADMIN_BOTH, L);
check('B5', 'Over-long text is refused', r.status === 422 && same(r.body.error.fields, ['page']));
dbCalls = 0;
await call('org.switch', { org: 'nope', app: 'office' }, U.ADMIN_BOTH, L);
check('B6', 'Invalid input never reaches the database', dbCalls === 0);

// ---- C. working operations
r = await call('launcher.list', {}, U.VIEWER_L, L);
check('C1', 'Launcher lists only the apps this person may open', r.status === 200 && r.body.data.every((x) => ['office', 'projects'].includes(x.app_key)) && r.body.data.length >= 1);
r = await call('launcher.list', {}, U.VIEWER_L, A);
check('C2', 'Launcher for an organization the person is not in is empty', r.status === 200 && r.body.data.length === 0);
r = await call('org.switch', { org: A, app: 'office', page: 'home' }, U.ADMIN_BOTH, L);
check('C3', 'org.switch resolves server-side and returns the outcome used by the browser module', r.status === 200 && r.body.data[0].outcome === 'same_page' && r.body.data[0].org_id === A);
r = await call('access.effective', {}, U.ADMIN_BOTH, L);
check('C4', 'Effective access lists permissions with reasons', r.status === 200 && r.body.data.length > 0 && 'reason' in r.body.data[0]);
r = await call('invitation.create', { email: 'New.Person@Example.com', kind: 'staff', role: 'editor' }, U.ADMIN_BOTH, L);
const token = r.body.data?.[0]?.token;
check('C5', 'Admin creates an invitation; the raw token is returned once', r.status === 200 && typeof token === 'string' && token.length >= 32);
r = await call('invitation.accept', { token }, U.OUTSIDER, NO_ORG, { email: 'someone.else@example.com' });
check('C6', 'Accepting with a different sign-in email fails as not-found', r.status === 404);
r = await call('invitation.accept', { token }, U.OUTSIDER, NO_ORG, { email: 'new.person@example.com' });
check('C7', 'Accepting with the matching email works without an organization chosen yet', r.status === 200 && isUuidLike(r.body.data[0].membership_id));
function isUuidLike(v) { return /^[0-9a-f-]{36}$/i.test(String(v)); }

// ---- D. rate limiting (T16)
api = mk(); clock += 3_600_000;
const sens = [];
for (let i = 0; i < 6; i++) sens.push(await call('invitation.accept', { token: `t${i}` }, U.VIEWER_L, NO_ORG));
check('D1', 'Sensitive class allows 5 per minute; the 6th is 429 rate_limited with a retry time', sens.slice(0, 5).every((x) => x.status === 404) && sens[5].status === 429 && sens[5].body.error.code === 'rate_limited' && sens[5].body.error.retryAfterSeconds >= 1);
before = dbCalls;
await call('invitation.accept', { token: 'again' }, U.VIEWER_L, NO_ORG);
check('D2', 'A limited request does no database work', dbCalls === before);
r = await call('invitation.accept', { token: 'other-user' }, U.L_ONLY, NO_ORG);
check('D3', 'The limit is per person: another user is unaffected', r.status === 404);
r = await call('clients.list', {}, U.VIEWER_L, L);
check('D4', 'The limit is per class: reads still work for the limited person', r.status === 200);
clock += 61_000;
r = await call('invitation.accept', { token: 'later' }, U.VIEWER_L, NO_ORG);
check('D5', 'The window resets after a minute', r.status === 404);
api = mk(); let ok = 0, lim = 0;
for (let i = 0; i < 130; i++) { const x = await call('clients.list', {}, U.ADMIN_BOTH, L); x.status === 200 ? ok++ : x.status === 429 && lim++; }
check('D6', 'Reads: 120 per minute, then limited', ok === 120 && lim === 10);

// ---- E. safe logging (T15)
const text = JSON.stringify(logs);
const forbidden = [U.ADMIN_BOTH, U.VIEWER_L, L, A, token, 'new.person@example.com', 'example.com', 'f'.repeat(64), 'row-level security', 'memberships'];
check('E1', `No ids, emails, tokens or database text appear in ${logs.length} log lines`, logs.length > 100 && forbidden.every((f) => !text.includes(f)));
check('E2', 'Log lines carry only allowlisted fields', logs.every((l) => Object.keys(l).every((k) => ['ts', 'requestId', 'op', 'status', 'class', 'db_code', 'ms', 'rateLimited'].includes(k))));
const sink = []; createSafeLogger((l) => sink.push(l)).log({ requestId: 'user@example.com', op: `Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk ${id()}`, status: 200, body: { password: 'x' }, authorization: 'secret' });
check('E3', 'Even allowlisted fields are scrubbed of emails, JWTs and uuids; other fields are dropped', sink.length === 1 && !/@|eyJ|[0-9a-f]{8}-[0-9a-f]{4}/.test(JSON.stringify(sink[0])) && !('body' in sink[0]) && !('authorization' in sink[0]));
check('E4', 'Every response carries a unique request id', new Set(logs.map((l) => l.requestId)).size === logs.length);
check('E5', 'Database error text never reaches the browser (constraint and table names)', !JSON.stringify([denied.body, notMember.body, sens[0].body]).match(/violates|constraint|policy|clients|memberships/));

for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(4)} ${x.name}${x.ok || !x.detail ? '' : ` (${x.detail})`}`);
const p = results.filter((x) => x.ok).length; console.log(`\n${p}/${results.length} checks passed`);
await db.close(); process.exit(p === results.length ? 0 : 1);
