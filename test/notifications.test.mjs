// Notifications for every app (V8 02 §6; owner OR-05, OR-11; migration 0054): one inbox, the current organization only, never the same
// event twice, the actor never notified, per-app "in app" settings respected. First producer: a file shared in Drive.
// client's space and client-owned strategy records never come back (owner rule OR-09); other organizations never mix in.
import { randomUUID as id } from 'node:crypto';
import { openDb, migrate, recorder } from './lib.mjs';
import { createApi } from '../packages/core/api.mjs';
import { createPgExecutor } from '../packages/core/pg-executor.mjs';
import { createRateLimiter } from '../packages/core/rate-limit.mjs';
import { createSafeLogger } from '../packages/core/safe-log.mjs';

const db = await openDb(); await migrate(db);
const { results, check } = recorder();
let chain = Promise.resolve();
const acquire = () => { const prev = chain; let release; chain = new Promise((r) => { release = r; }); return prev.then(() => ({ query: (s, p) => db.query(s, p), release })); };
const BIG = { read: { max: 1e6, windowMs: 6e4 }, write: { max: 1e6, windowMs: 6e4 }, sensitive: { max: 1e6, windowMs: 6e4 } };
const api = createApi({ executor: createPgExecutor({ acquire, role: 'app_user' }), logger: createSafeLogger((l) => { if (process.env.DEBUG_LOG) console.log('LOG', JSON.stringify(l).slice(0, 600)); }), limiter: createRateLimiter({ limits: BIG }) });
const J = async (op, input, u, org) => { const r = await api.handle({ operation: op, input, auth: { userId: u, email: 'x@example.com' }, headers: { 'x-org-id': org } }); return { status: r.status, rows: r.body?.data ?? [], body: r.body }; };
const S = async (u, org, input) => (await J('search.query', input, u, org)).rows;
const titles = (rows) => rows.map((r) => r.title);

await db.exec('reset role');
const ORG = { L: id(), A: id() }; const U = { LO: id(), LV: id(), AO: id() };
await db.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','L'),($2,'aurj','A')", [ORG.L, ORG.A]);
const staff = (u, ws, r) => db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff',$3)", [ws, u, r]);
await staff(U.LO, ORG.L, 'owner'); await staff(U.LV, ORG.L, 'viewer'); await staff(U.AO, ORG.A, 'owner');
for (const app of ['clients', 'office', 'drive', 'projects', 'planner']) for (const ws of [ORG.L, ORG.A]) await db.query("insert into workspace_apps (workspace_id,app_key,enabled) values ($1,$2,true) on conflict (workspace_id,app_key) do update set enabled = true", [ws, app]);
for (const app of ['clients', 'office', 'drive', 'projects']) await db.query('insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,$3)', [ORG.L, U.LV, app]);
await db.query("insert into workspace_apps (workspace_id,app_key,enabled) values ($1,'drive',true) on conflict (workspace_id,app_key) do update set enabled = true", [ORG.L]);
const FILE = id(); await db.query(`insert into files (id,workspace_id,name,kind,mime_type,space,in_library,uploaded_by) values ($1,$2,'Launch plan','document','application/vnd.l2f.doc+json','shared',true,$3)`, [FILE, ORG.L, U.LO]);
const share = (fileId, user, role = 'viewer') => J('drive.shares.set', { file: fileId, user, role }, U.LO, ORG.L);
const inbox = async (u, org, input = {}) => (await J('notifications.inbox', input, u, org)).rows;
const unread = async (u, org) => (await J('notifications.unread', {}, u, org)).rows[0]?.n;

const s1 = await share(FILE, U.LV); if (s1.status !== 200) console.log('share:', JSON.stringify(s1));
const n1 = await inbox(U.LV, ORG.L);
check('NT1', 'Sharing a file tells the person, in one inbox, with a link that opens the document', s1.status === 200 && n1.length === 1 && n1[0].app === 'drive' && n1[0].kind === 'shared' && /Launch plan/.test(n1[0].title) && n1[0].href === `#/doc/${FILE}`, JSON.stringify(n1));
check('NT2', 'The person who shared is not notified about their own action', (await inbox(U.LO, ORG.L)).length === 0);
await db.query('delete from drive_shares where file_id = $1', [FILE]); await share(FILE, U.LV, 'editor');
check('NT3', 'The same event never arrives twice (share removed and given again: still one notice)', (await inbox(U.LV, ORG.L)).length === 1);
check('NT4', 'The badge counts unread notices in this organization', (await unread(U.LV, ORG.L)) === 1);
check('NT5', 'The other organization never sees them', (await unread(U.LV, ORG.A)) === undefined || (await unread(U.LV, ORG.A)) === 0);
check('NT6', 'Kind filters: it is an update, not a mention', (await inbox(U.LV, ORG.L, { group: 'updates' })).length === 1 && (await inbox(U.LV, ORG.L, { group: 'mentions' })).length === 0 && (await inbox(U.LV, ORG.L, { app: 'drive' })).length === 1);
await J('notifications.read', { all: true }, U.LV, ORG.L);
{ const after = await inbox(U.LV, ORG.L); check('NT7', 'Mark all read clears the badge', (await unread(U.LV, ORG.L)) === 0 && after.length === 1 && after[0].read_at, JSON.stringify(after)); }
await J('notifications.prefs.set', { app: 'drive', in_app: false }, U.LV, ORG.L);
const F2 = id(); await db.query(`insert into files (id,workspace_id,name,kind,mime_type,space,in_library,uploaded_by) values ($1,$2,'Price sheet','document','application/vnd.l2f.sheet+json','shared',true,$3)`, [F2, ORG.L, U.LO]);
await share(F2, U.LV);
check('NT8', 'Drive notices switched off in the person\'s settings: nothing new arrives', (await inbox(U.LV, ORG.L)).length === 1);
check('NT9', 'Settings are per person: the owner cannot read the viewer\'s settings', (await J('notifications.prefs', {}, U.LO, ORG.L)).rows.length === 0 && (await J('notifications.prefs', {}, U.LV, ORG.L)).rows.length === 1);
await db.exec('reset role');
check('NT10', 'Nobody can write a notice directly (only the database\'s own events do)', (await db.query("select has_function_privilege('app_user', 'private.notify(uuid,uuid,text,text,text,text,text,uuid)', 'execute') ok")).rows[0].ok === false
  && (await db.query("select has_table_privilege('app_user', 'public.notifications', 'insert') ok")).rows[0].ok === false);

const fails = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id.padEnd(5)} ${r.name}${r.ok ? '' : `  ${r.detail}`}`);
console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
process.exit(fails.length ? 1 : 0);
