// Office > Team and Admin > Access history (migration 0026): who can read the directory, what it shows, what stays out of it.
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
const J = async (op, input, u, org) => { const r = await api.handle({ operation: op, input, auth: { userId: u, email: 'x@example.com' }, headers: { 'x-org-id': org } }); return { ...r, row: r.body?.data?.[0], rows: r.body?.data ?? [] }; };

await db.exec('reset role');
const ORG = { L: id(), A: id() }; const U = { LO: id(), LAD: id(), LED: id(), LVW: id(), LOFF: id(), AO: id(), CL: id() };
await db.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','L'),($2,'aurj','A')", [ORG.L, ORG.A]);
const staff = (u, ws, r, status = 'active') => db.query("insert into memberships (workspace_id,user_id,kind,role,status) values ($1,$2,'staff',$3,$4)", [ws, u, r, status]);
await staff(U.LO, ORG.L, 'owner'); await staff(U.LAD, ORG.L, 'admin'); await staff(U.LED, ORG.L, 'editor'); await staff(U.LVW, ORG.L, 'viewer'); await staff(U.LOFF, ORG.L, 'editor', 'deactivated'); await staff(U.AO, ORG.A, 'owner');
const C1 = id(); await db.query("insert into clients (id,workspace_id,name) values ($1,$2,'One')", [C1, ORG.L]);
await db.query("insert into memberships (workspace_id,user_id,kind,client_id) values ($1,$2,'client',$3)", [ORG.L, U.CL, C1]);
for (const [u, n] of [[U.LO, 'Olivia Owner'], [U.LAD, 'Adam Admin'], [U.LED, 'Edda Editor'], [U.AO, 'Aurj Owner']]) await db.query('insert into profiles (id, email, display_name) values ($1,$2,$3) on conflict (id) do update set display_name = excluded.display_name', [u, `${n.split(' ')[0].toLowerCase()}@example.com`, n]);

const T = (u, org) => J('team.list', {}, u, org);
check('TM1', 'An editor reads the team directory: every active member of this organization, with names and levels', (await T(U.LED, ORG.L)).rows.length === 4 && (await T(U.LED, ORG.L)).rows.some((r) => r.display_name === 'Olivia Owner' && r.role === 'owner'));
check('TM2', 'A viewer may read it too (the directory is for everyone on the team)', (await T(U.LVW, ORG.L)).rows.length === 4);
check('TM3', 'E-mail addresses are shown to owners and admins only', (await T(U.LED, ORG.L)).rows.every((r) => r.email === null) && (await T(U.LVW, ORG.L)).rows.every((r) => r.email === null) && (await T(U.LAD, ORG.L)).rows.some((r) => r.email === 'olivia@example.com') && (await T(U.LO, ORG.L)).rows.some((r) => r.email));
check('TM4', 'Deactivated members are not listed', !(await T(U.LED, ORG.L)).rows.some((r) => r.user_id === U.LOFF));
check('TM5', 'A member without a profile name shows a safe fallback, never an empty line', (await T(U.LED, ORG.L)).rows.filter((r) => !r.display_name).length === 0 && (await T(U.LED, ORG.L)).rows.some((r) => r.display_name.startsWith('Member ')));
check('TM6', 'The caller is marked as "you" exactly once', (await T(U.LED, ORG.L)).rows.filter((r) => r.is_you).length === 1 && (await T(U.LED, ORG.L)).rows.find((r) => r.is_you).user_id === U.LED);
check('TM7', 'The other organization sees only its own team, and Layer2Funnels people never appear there', (await T(U.AO, ORG.A)).rows.length === 1 && (await T(U.AO, ORG.A)).rows[0].user_id === U.AO);
check('TM8', 'Naming an organization you are not in answers "not found", not an empty list', [404, 403].includes((await T(U.AO, ORG.L)).status));
check('TM9', 'A client account gets nothing from the staff directory (plain not-found)', [404, 403].includes((await T(U.CL, ORG.L)).status) || (await T(U.CL, ORG.L)).rows.length === 0);

const A = (u, org, limit) => J('audit.recent', limit ? { limit } : {}, u, org);
await db.query("insert into audit_events (workspace_id, actor_id, action, subject_type) values ($1,$2,'update','clients'),($3,$4,'update','marker_aurj')", [ORG.L, U.LO, ORG.A, U.AO]);
check('TM10', 'Owners and admins read the recent changes of this organization (who, what kind, when; no content)', (await A(U.LO, ORG.L)).rows.length >= 1 && (await A(U.LAD, ORG.L)).rows.length >= 1 && (await A(U.LO, ORG.L)).rows.every((r) => !('details' in r) && !('before' in r) && !('after' in r)));
check('TM11', 'An editor or viewer gets an empty history (the table’s own rule), never someone else’s changes', (await A(U.LED, ORG.L)).rows.length === 0 && (await A(U.LVW, ORG.L)).rows.length === 0);
check('TM12', 'The history of one organization never includes the other’s events', (await A(U.AO, ORG.A)).rows.some((r) => r.subject_type === 'marker_aurj') && !(await A(U.LO, ORG.L)).rows.some((r) => r.subject_type === 'marker_aurj'));
check('TM13', 'The limit is honoured and a silly one is refused', (await A(U.LO, ORG.L, 1)).rows.length === 1 && [400, 422].includes((await A(U.LO, ORG.L, 100000)).status));
for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}`);
const pc = results.filter((x) => x.ok).length; console.log(`\n${pc}/${results.length} checks passed`); await db.close(); process.exit(pc === results.length ? 0 : 1);
