// Global search (V8 02_GLOBAL_SHELL §5; owner requirements OR-08…OR-10): one search over the apps, run as the signed-in person.
// Two people in two organizations. Each finds only what they could open in the app itself; a client record can be found, but files in a
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
const api = createApi({ executor: createPgExecutor({ acquire, role: 'app_user' }), logger: createSafeLogger(() => {}), limiter: createRateLimiter({ limits: BIG }) });
const J = async (op, input, u, org) => { const r = await api.handle({ operation: op, input, auth: { userId: u, email: 'x@example.com' }, headers: { 'x-org-id': org } }); return { status: r.status, rows: r.body?.data ?? [] }; };
const S = async (u, org, input) => (await J('search.query', input, u, org)).rows;
const titles = (rows) => rows.map((r) => r.title);

await db.exec('reset role');
const ORG = { L: id(), A: id() }; const U = { LO: id(), LV: id(), AO: id() };
await db.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','L'),($2,'aurj','A')", [ORG.L, ORG.A]);
const staff = (u, ws, r) => db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff',$3)", [ws, u, r]);
await staff(U.LO, ORG.L, 'owner'); await staff(U.LV, ORG.L, 'viewer'); await staff(U.AO, ORG.A, 'owner');
for (const app of ['clients', 'office', 'drive', 'projects', 'planner']) for (const ws of [ORG.L, ORG.A]) await db.query("insert into workspace_apps (workspace_id,app_key,enabled) values ($1,$2,true) on conflict (workspace_id,app_key) do update set enabled = true", [ws, app]);
for (const app of ['clients', 'office', 'drive', 'projects']) await db.query('insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,$3)', [ORG.L, U.LV, app]);

// records named "Quarry" in both organizations, so every leak would show
const C1 = id(); await db.query("insert into clients (id,workspace_id,name) values ($1,$2,'Quarry Fitness'),($3,$4,'Quarry Aurj client')", [C1, ORG.L, id(), ORG.A]);
const file = (ws, name, extra = {}) => db.query(`insert into files (id,workspace_id,name,kind,mime_type,space,owner_id,client_id,in_library,uploaded_by)
  values ($1,$2,$3,'document','application/vnd.l2f.doc+json',$4,$5,$6,$7,$8)`, [id(), ws, name, extra.space ?? 'shared', extra.space === 'personal' ? extra.owner : null, extra.client ?? null, extra.inLibrary ?? true, ws === ORG.A ? U.AO : U.LO]);
await file(ORG.L, 'Quarry launch plan');                                              // Library: found
await file(ORG.L, 'Quarry contract (client)', { space: 'client', client: C1, inLibrary: false });   // client space: NEVER found
await file(ORG.L, 'Quarry private notes', { space: 'personal', owner: U.LO, inLibrary: false });    // owner's personal file
await file(ORG.A, 'Quarry Aurj doc');                                                 // other organization: never found from L2F
await db.query("insert into funnel_avatars (id,workspace_id,name) values ($1,$2,'Quarry avatar')", [id(), ORG.L]);
await db.query("insert into funnel_avatars (id,workspace_id,client_id,name) values ($1,$2,$3,'Quarry client-owned avatar')", [id(), ORG.L, C1]);   // client-owned: never found

const q1 = await S(U.LO, ORG.L, { q: 'quarry' });
check('SR1', 'Search finds records across apps by name: the client record, a Library document, an Office avatar', titles(q1).includes('Quarry Fitness') && titles(q1).includes('Quarry launch plan') && titles(q1).includes('Quarry avatar'), titles(q1).join(' | '));
check('SR2', 'Owner rule (OR-09): a client may be found, but files in the client\'s space and client-owned strategy records never come back', !titles(q1).includes('Quarry contract (client)') && !titles(q1).includes('Quarry client-owned avatar'));
check('SR3', 'The other organization never mixes in (Aurj records are invisible from Layer2Funnels)', !titles(q1).some((t) => /Aurj/.test(t)));
const qa = await S(U.AO, ORG.A, { q: 'quarry' });
check('SR4', 'And the other way round: Aurj sees only Aurj', titles(qa).includes('Quarry Aurj client') && titles(qa).includes('Quarry Aurj doc') && !titles(qa).some((t) => /Fitness|launch plan|avatar/.test(t)), titles(qa).join(' | '));
const qv = await S(U.LV, ORG.L, { q: 'quarry' });
check('SR5', 'Another teammate never finds someone else\'s Personal file', !titles(qv).includes('Quarry private notes') && titles(q1).includes('Quarry private notes'));
check('SR6', 'A person from another organization asking with this organization\'s id gets nothing', (await J('search.query', { q: 'quarry' }, U.AO, ORG.L)).rows.length === 0);
const scoped = await S(U.LO, ORG.L, { q: 'quarry', scope: 'clients' });
check('SR7', 'A scope searches only its app ("Search in: Clients")', scoped.length > 0 && scoped.every((r) => r.app === 'clients'));
check('SR8', 'An empty search returns nothing (the dialog shows quick actions instead)', (await S(U.LO, ORG.L, { q: '' })).length === 0);
check('SR9', 'Every result says which app and kind it is, with an id for the link', q1.every((r) => r.app && r.type && r.id && r.title));
check('SR10', 'Wildcards typed by the person are plain text ("%" finds nothing, not everything)', (await S(U.LO, ORG.L, { q: '%' })).length === 0);

const fails = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id.padEnd(5)} ${r.name}${r.ok ? '' : `  ${r.detail}`}`);
console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
process.exit(fails.length ? 1 : 0);
