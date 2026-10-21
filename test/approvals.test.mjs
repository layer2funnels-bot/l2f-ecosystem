// Approvals v2 (migration 0017): requests with typed subjects, decided once by someone else, withdraw, resubmit with history, scope, isolation, audit without text. Database and API.
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
const U = { OWN: id(), ADM: id(), ED: id(), ED2: id(), VW: id(), AOWN: id(), CL1: id() };
await db.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','L'),($2,'aurj','A')", [L, A]);
const staff = (u, ws, r) => db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff',$3)", [ws, u, r]);
await staff(U.OWN, L, 'owner'); await staff(U.ADM, L, 'admin'); await staff(U.ED, L, 'editor'); await staff(U.ED2, L, 'editor'); await staff(U.VW, L, 'viewer'); await staff(U.AOWN, A, 'owner');
for (const u of [U.ED, U.ED2, U.VW]) for (const a of ['drive', 'projects', 'clients']) await db.query("insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,$3)", [L, u, a]);
const C1 = id(), C2 = id(), CA = id();
await db.query("insert into clients (id,workspace_id,name) values ($1,$3,'Client One'),($2,$3,'Client Two')", [C1, C2, L]);
await db.query("insert into clients (id,workspace_id,name) values ($1,$2,'Aurj client')", [CA, A]);
await db.query("insert into memberships (workspace_id,user_id,kind,client_id) values ($1,$2,'client',$3)", [L, U.CL1, C1]);
const lvl = async (n) => (await rows('select id from access_levels where workspace_id=$1 and name=$2', [L, n]))[0].id;
const assign = async (u, name) => db.query("insert into access_assignments (workspace_id,access_level_id,principal_type,principal_id) values ($1,$2,'user',$3)", [L, await lvl(name), u]);
await assign(U.ED, 'All clients · edit'); await assign(U.ED2, 'All clients · edit'); await assign(U.VW, 'All clients · read');
const F1 = id(), F2 = id(), F0 = id(), FA = id();
const mkfile = async (id_, ws, client, space, name, up) => db.query("insert into files (id,workspace_id,client_id,space,name,kind,mime_type,size_bytes,storage_path,uploaded_by) values ($1,$2,$3,$4,$5,'file','application/pdf',10,$6,$7)",
  [id_, ws, client, space, name, `${ws}/${client ? `clients/${client}` : 'shared'}/${name}`, up]);
await mkfile(F1, L, C1, 'client', 'a.pdf', U.ED); await mkfile(F2, L, C2, 'client', 'b.pdf', U.ED); await mkfile(F0, L, null, 'shared', 'c.pdf', U.ED); await mkfile(FA, A, CA, 'client', 'z.pdf', U.AOWN);
const P1 = id(); await db.query("insert into projects (id,workspace_id,client_id,name) values ($1,$2,$3,'P1')", [P1, L, C1]);

// ---- A. requesting
const req = (u, over = {}, org = L) => J('approvals.request', { subject_type: 'deliverable', subject: F1, title: 'Logo files', note: 'Please check', ...over }, u, org);
let r = await req(U.ED);
const AP1 = r.row?.id;
check('AP1', 'An editor requests approval of a file; the request is pending, version 1, and takes the client from the file', r.status === 200 && r.row.status === 'pending' && r.row.version === 1 && r.row.client_id === C1 && r.row.requested_by === U.ED, JSON.stringify(r.body));
r = await req(U.ED, { subject: id() });
check('AP2', 'A subject that does not exist is refused as not found', r.status === 404);
r = await req(U.ED, { subject: FA });
check('AP3', 'A file of another organization is refused as not found (cannot be named)', r.status === 404);
r = await req(U.ED2);
check('AP4', 'A second request for the same item while one is pending is refused', r.status === 422 && r.code === 'invalid', JSON.stringify(r.body));
r = await req(U.VW, { subject: F2 });
check('AP5', 'A viewer cannot request approval', r.status === 404);
r = await req(U.ED, { subject: F0, client: C2 });
check('AP6', 'A shared (client-less) item may name a client; the request then belongs to that client', r.status === 200 && r.row.client_id === C2);
r = await req(U.ED, { subject: F2, client: C1 });
check('AP7', 'A request cannot name a different client than the item belongs to', r.status === 422);
r = await req(U.ED, { subject_type: 'other', subject: id(), client_visible: true });
check('AP8', 'Only a client\'s request can be shown to the client', r.status === 422);
r = await req(U.ED, { subject_type: 'bogus' });
check('AP9', 'An unknown subject type is refused by the typed input', r.status === 422 && r.code === 'invalid');
r = await req(U.ADM, { subject_type: 'project', subject: P1, title: 'Plan' });
const APP = r.row?.id;
check('AP10', 'Projects can be approved too, with the client copied from the project', r.status === 200 && r.row.client_id === C1);

// ---- B. deciding
r = await J('approvals.decide', { id: AP1, decision: 'approved' }, U.ED);
check('AP11', 'The requester cannot decide their own request', r.status === 404 || r.status === 422, JSON.stringify(r.body));
r = await J('approvals.decide', { id: AP1, decision: 'approved' }, U.ED2);
check('AP12', 'An editor cannot decide by default (deciding is an admin right)', r.status === 404);
r = await J('approvals.decide', { id: AP1, decision: 'rejected' }, U.ADM);
check('AP13', 'A rejection needs a reason', r.status === 422, JSON.stringify(r.body));
r = await J('approvals.decide', { id: AP1, decision: 'rejected', note: 'Wrong colours' }, U.ADM);
check('AP14', 'An admin rejects with a reason; the decider and time are recorded by the database', r.status === 200 && r.row.status === 'rejected' && r.row.decided_by === U.ADM && r.row.decided_at, JSON.stringify(r.body));
r = await J('approvals.decide', { id: AP1, decision: 'approved' }, U.OWN);
check('AP15', 'A decided request cannot be decided again', r.status === 422 || r.status === 404);
r = await J('approvals.withdraw', { id: AP1 }, U.ED);
check('AP16', 'A decided request cannot be withdrawn', r.status === 422 || r.status === 404);

// ---- C. resubmission and history
r = await req(U.ED, { previous: AP1, note: 'Fixed colours' });
const AP2 = r.row?.id;
check('AP17', 'A rejected request is resubmitted as a new request (version 2) that points at the first', r.status === 200 && r.row.version === 2 && r.row.previous_id === AP1 && r.row.status === 'pending', JSON.stringify(r.body));
r = await J('approvals.decide', { id: AP2, decision: 'approved', note: 'Good' }, U.ADM);
check('AP18', 'The second version is approved with a note', r.status === 200 && r.row.status === 'approved');
r = await req(U.ED, { previous: AP2 });
check('AP19', 'Only a rejected request can be resubmitted', r.status === 422);
r = await req(U.ED, { previous: AP1 });
check('AP20', 'A request is resubmitted at most once', r.status === 422);
r = await J('approvals.get', { id: AP2 }, U.VW);
check('AP21', 'Anyone who may view reads the history: requested then approved, with the notes', r.status === 200 && r.row.events.map((e) => e.event).join() === 'requested,approved' && r.row.events[0].note === 'Fixed colours' && r.row.events[1].note === 'Good', JSON.stringify(r.body));
r = await J('approvals.get', { id: AP1 }, U.VW);
check('AP22', 'The first version keeps its own history untouched: requested then rejected with the reason', r.row.events.map((e) => e.event).join() === 'requested,rejected' && r.row.events[1].note === 'Wrong colours');

// ---- D. withdrawing
r = await J('approvals.withdraw', { id: APP }, U.ED2);
check('AP23', 'Only the requester can withdraw', r.status === 404 || r.status === 422);
r = await J('approvals.withdraw', { id: APP }, U.ADM);
check('AP24', 'The requester withdraws a pending request; it is recorded', r.status === 200 && r.row.status === 'withdrawn');
r = await J('approvals.decide', { id: APP, decision: 'approved' }, U.ADM);
check('AP25', 'A withdrawn request cannot be decided', r.status === 422 || r.status === 404);
r = await req(U.ADM, { subject_type: 'project', subject: P1, title: 'Plan again' });
check('AP26', 'After a withdrawal the item can be requested again', r.status === 200);

// ---- E. who sees what
r = await J('approvals.list', {}, U.VW);
check('AP27', 'A viewer lists every request of the organization', r.status === 200 && r.data.length >= 4, String(r.data?.length));
r = await J('approvals.list', { mine: 'to_decide' }, U.ADM);
check('AP28', 'A decider lists what waits for them (pending, made by others)', r.data.length > 0 && r.data.every((x) => x.status === 'pending' && x.requested_by !== U.ADM));
r = await J('approvals.list', { mine: 'requested', status: 'rejected' }, U.ED);
check('AP29', 'Filters combine: my rejected requests', r.data.length === 1 && r.data[0].id === AP1);
await asSuper();
await db.query("insert into permission_overrides (workspace_id,principal_type,principal_id,permission_key,effect,client_id,reason) values ($1,'user',$2,'approvals.request.view','deny',$3,'test')", [L, U.ED2, C1]);
r = await J('approvals.list', {}, U.ED2);
check('AP30', 'A restriction on one client hides that client\'s requests from that person only', r.data.length > 0 && r.data.every((x) => x.client_id !== C1));
r = await J('approvals.get', { id: AP2 }, U.ED2);
check('AP31', '…and reading one directly is "not found"', r.status === 404);
r = await J('approvals.list', {}, U.AOWN, A);
check('AP32', 'Another organization sees none of them', r.status === 200 && r.data.length === 0);
r = await J('approvals.get', { id: AP2 }, U.AOWN, A);
check('AP33', '…and cannot read one by id', r.status === 404);
r = await J('approvals.get', { id: AP2 }, U.AOWN, L);
check('AP34', '…nor by naming this organization (not a member)', r.status === 404);

// ---- F. the log cannot be rewritten
await asUser(U.OWN);
check('AP35', 'The event log cannot be changed or deleted, even by an owner', (await errCode(() => db.query("update approval_events set note='x'"))) === '42501' && (await errCode(() => db.query('delete from approval_events'))) === '42501');
const delCode = await errCode(() => db.query('delete from approvals'));
check('AP36', 'Approvals cannot be deleted at all (no delete right or policy exists)', ['42501', 'no-error'].includes(delCode) && (await rows('select id from approvals')).length >= 4);
await asSuper();
const au = (await rows("select detail from audit_events where action like 'approvals.%' order by id")).map((x) => JSON.stringify(x.detail));
check('AP37', 'The audit log records requests and decisions by status and id, never the notes', au.length >= 6 && au.every((d) => !d.includes('Wrong colours') && !d.includes('Please check') && !d.includes('Fixed colours')));
check('AP38', 'A request cannot be moved between organizations or clients after the fact', (await errCode(() => db.query("update approvals set client_id=$2 where id=$1", [AP2, C2]))) === 'P0001');

for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}${x.ok ? '' : `  [${x.detail ?? ''}]`}`);
const p = results.filter((x) => x.ok).length; console.log(`\n${p}/${results.length} checks passed`); await db.close(); process.exit(p === results.length ? 0 : 1);
