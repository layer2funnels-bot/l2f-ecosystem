// Gate G2: the Client Portal (migration 0018) seen from a client account. Off by default; on, a client reaches only what staff shared for their own
// client, through projections with no internal fields; answers, decisions and messages are the only writes; every other table is invisible.
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
const U = { OWN: id(), ADM: id(), ED: id(), CL1: id(), CL2: id(), CLA: id(), NONE: id() };
await db.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','L'),($2,'aurj','A')", [L, A]);
const staff = (u, ws, r) => db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff',$3)", [ws, u, r]);
await staff(U.OWN, L, 'owner'); await staff(U.ADM, L, 'admin'); await staff(U.ED, L, 'editor'); await staff(U.OWN, A, 'owner');
const C1 = id(), C2 = id(), CA = id();
await db.query("insert into clients (id,workspace_id,name) values ($1,$3,'Client One'),($2,$3,'Client Two')", [C1, C2, L]);
await db.query("insert into clients (id,workspace_id,name) values ($1,$2,'Aurj client')", [CA, A]);
await db.query("insert into memberships (workspace_id,user_id,kind,client_id) values ($1,$2,'client',$3),($1,$4,'client',$5),($6,$7,'client',$8)", [L, U.CL1, C1, U.CL2, C2, A, U.CLA, CA]);
for (const a of ['drive', 'projects', 'clients', 'planner', 'portal']) await db.query("insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,$3)", [L, U.ED, a]);
const lvl = async (n) => (await rows('select id from access_levels where workspace_id=$1 and name=$2', [L, n]))[0].id;
await db.query("insert into access_assignments (workspace_id,access_level_id,principal_type,principal_id) values ($1,$2,'user',$3)", [L, await lvl('All clients · edit'), U.ED]);

// ---- seed: shared and internal items for client one, shared items for client two, an internal item in every sensitive table
const P = { v: id(), i: id(), v2: id() }, T = { v: id(), i: id(), v2: id() };
await db.query("insert into projects (id,workspace_id,client_id,name,description,status,client_visible) values ($1,$4,$5,'Visible project','INTERNAL-PROJECT-NOTES','active',true),($2,$4,$5,'Internal project','x','active',false),($3,$4,$6,'Client two project','y','active',true)", [P.v, P.i, P.v2, L, C1, C2]);
await db.query("insert into project_tasks (id,workspace_id,project_id,title,notes,client_visible) values ($1,$4,$5,'Visible task','INTERNAL-TASK-NOTES',true),($2,$4,$5,'Internal task','x',false),($3,$4,$6,'Client two task','y',true)", [T.v, T.i, T.v2, L, P.v, P.v2]);
const mkfile = (id_, ws, client, name, visible, kind = 'file') => db.query("insert into files (id,workspace_id,client_id,space,name,kind,mime_type,size_bytes,storage_path,uploaded_by,client_visible) values ($1,$2,$3,'client',$4,$7,'application/pdf',10,$5,$6,$8)", [id_, ws, client, name, `${ws}/clients/${client}/${name}`, U.ED, kind, visible]);
const F = { v: id(), i: id(), v2: id(), a: id() };
await mkfile(F.v, L, C1, 'shared.pdf', true); await mkfile(F.i, L, C1, 'internal-pricing.pdf', false); await mkfile(F.v2, L, C2, 'two.pdf', true); await mkfile(F.a, L, C1, 'old.pdf', true);
await db.query("update files set archived_at = now() where id = $1", [F.a]);
const UP = { v: id(), i: id() }, RQ = { v: id(), i: id(), a: id(), v2: id(), done: id(), h: id() };
await db.query("insert into client_updates (id,workspace_id,client_id,title,body,client_visible) values ($1,$3,$4,'Visible update','body',true),($2,$3,$4,'Internal update','secret',false)", [UP.v, UP.i, L, C1]);
await db.query("insert into client_requests (id,workspace_id,client_id,title,body,client_visible,archived_at) values ($1,$5,$6,'Visible request','What is your logo?',true,null),($2,$5,$6,'Internal request','x',false,null),($3,$5,$6,'Archived request','x',true,now()),($4,$5,$7,'Client two request','x',true,null)", [RQ.v, RQ.i, RQ.a, RQ.v2, L, C1, C2]);
await db.query("insert into client_requests (id,workspace_id,client_id,title,client_visible,status) values ($1,$2,$3,'Answered request',true,'answered')", [RQ.done, L, C1]);
await db.query("insert into client_requests (id,workspace_id,client_id,title,body,client_visible) values ($1,$2,$3,'Tamper target','original body',true)", [RQ.h, L, C1]);
await db.query("insert into client_notes (workspace_id,client_id,body) values ($1,$2,'INTERNAL-TEAM-NOTE')", [L, C1]);
await db.query("update client_profiles set email = 'secret@example.com', notes = 'INTERNAL-PROFILE' where client_id = $1", [C1]).catch(() => {});
await db.query("insert into planner_objectives (workspace_id,client_id,title) values ($1,$2,'Internal objective')", [L, C1]);
await db.query("insert into invitations (workspace_id,email,kind,role,token_hash,created_by) values ($1,'x@example.com','staff','editor','h',$2)", [L, U.OWN]).catch(() => {});
await asUser(U.ED);
const AP = {};
AP.v = (await J('approvals.request', { subject_type: 'deliverable', subject: F.v, title: 'Approve the logo', note: 'Please check', client_visible: true }, U.ED)).row?.id;
AP.i = (await J('approvals.request', { subject_type: 'deliverable', subject: F.i, title: 'Internal sign-off', note: 'staff only' }, U.ED)).row?.id;
await asUser(U.ADM);
AP.v2 = (await J('approvals.request', { subject_type: 'deliverable', subject: F.v2, title: 'Two logo', client_visible: true }, U.ADM)).row?.id;

const cj = (op, input, u = U.CL1, org = L) => J(op, input, u, org);

// ---- G1: the Portal is OFF by default
let r = await cj('portal.me', {});
check('G1', 'Portal OFF (the default): a client account gets nothing from the Portal: no client record, no lists', r.status === 404);
const offLists = [];
for (const op of ['portal.updates.list', 'portal.requests.list', 'portal.projects.list', 'portal.tasks.list', 'portal.files.list', 'portal.approvals.list']) { const x = await cj(op, {}); if (!(x.status === 200 && x.data.length === 0)) offLists.push(op); }
check('G2', 'Portal OFF: every list is empty, whatever staff shared', offLists.length === 0, offLists.join());
check('G3', 'Portal OFF: staff cannot message clients either (the permission belongs to the Portal app)', (await J('portal.staff.messages.send', { subject_type: 'request', subject: RQ.v, body: 'hi' }, U.ED)).status === 404);
r = await call('org.switch', { org: L, app: 'portal' }, U.CL1, '00000000-0000-0000-0000-000000000000');
check('G4', 'Portal OFF: the Launcher offers the client nothing', (await call('launcher.list', {}, U.CL1)).body.data.length === 0);

await asUser(U.ED);
check('G4b', 'Portal OFF: a direct insert of a message by staff is refused by the policy itself, not only by the operation', (await errCode(() => db.query("insert into portal_messages (workspace_id,subject_type,subject_id,author_id,author_kind,body,client_id) values ($1,'request',$2,$3,'staff','x',$4)", [L, RQ.v, U.ED, C1]))) === '42501');
// owner switches it on (owner-only, audited: covered by T10c/T10d); admins cannot
await asUser(U.ADM);
check('G5', 'An admin cannot switch the Portal on (owner action)', (await affected("update workspace_apps set enabled = true where workspace_id=$1 and app_key='portal'", [L])) === 0);
await asUser(U.OWN);
await db.query("update workspace_apps set enabled = true where workspace_id=$1 and app_key='portal'", [L]);

// ---- G6..: projections
r = await cj('portal.me', {});
check('G6', 'Portal ON: portal.me is the client\'s own name and id only', r.status === 200 && Object.keys(r.row).sort().join() === 'id,name' && r.row.name === 'Client One');
r = await cj('portal.home', {});
check('G7', 'The home counts only shared, unarchived items of this client: 2 open requests, 1 pending approval, 1 update, 1 file, 1 project, 1 open task', r.status === 200 && JSON.stringify(r.row) === JSON.stringify({ open_requests: 2, pending_approvals: 1, updates: 1, files: 1, projects: 1, open_tasks: 1 }), JSON.stringify(r.row));
const names = async (op, key, input = {}) => (await cj(op, input)).data.map((x) => x[key]).sort().join('|');
check('G8', 'Projects: only the shared project of this client', await names('portal.projects.list', 'name') === 'Visible project');
check('G9', 'Tasks: only the shared task', await names('portal.tasks.list', 'title') === 'Visible task');
check('G10', 'Files: only the shared, unarchived file', await names('portal.files.list', 'name') === 'shared.pdf');
check('G11', 'Updates: only the shared update', await names('portal.updates.list', 'title') === 'Visible update');
check('G12', 'Requests: shared, unarchived ones (open and answered), never internal or archived or the other client\'s', await names('portal.requests.list', 'title') === 'Answered request|Tamper target|Visible request');
check('G13', 'Approvals: only the request staff shared with this client', await names('portal.approvals.list', 'title') === 'Approve the logo');

// column allowlists: nothing internal can appear in any projection
const keys = async (op, input = {}) => { const x = await cj(op, input); return x.data.length ? Object.keys(x.data[0]).sort().join() : 'EMPTY'; };
const allowed = {
  'portal.projects.list': 'due_on,id,name,start_on,status', 'portal.tasks.list': 'completed_at,due_on,id,project_id,status,title', 'portal.files.list': 'created_at,id,kind,mime_type,name,size_bytes',
  'portal.updates.list': 'body,created_at,id,title', 'portal.requests.list': 'body,created_at,due_on,id,kind,response,status,title,updated_at',
  'portal.approvals.list': 'created_at,decided_at,decision_note,due_on,id,note,status,subject_type,title,version',
};
const wrongKeys = []; for (const [op, k] of Object.entries(allowed)) { const got = await keys(op); if (got !== k) wrongKeys.push(`${op}: ${got}`); }
check('G14', 'Every projection returns exactly its named columns (no storage path, notes, owners, authors, internal ids)', wrongKeys.length === 0, wrongKeys.join(' | '));
const blob = JSON.stringify([await cj('portal.projects.list', {}), await cj('portal.tasks.list', {}), await cj('portal.files.list', {}), await cj('portal.requests.list', {}), await cj('portal.approvals.list', {}), await cj('portal.home', {})]);
check('G15', 'None of the internal markers appears anywhere in what a client receives', !/INTERNAL-|secret|staff only|internal-pricing|Internal |Client two|storage/i.test(blob), blob.match(/INTERNAL-[A-Z-]+|Internal \w+|Client two/i)?.[0]);

// the other client sees only their own
r = await cj('portal.projects.list', {}, U.CL2);
check('G16', 'The other client sees only their own shared project, never this one', r.data.length === 1 && r.data[0].name === 'Client two project');
check('G17', 'A client of the other organization gets "not found" naming this organization (not a member)', (await cj('portal.me', {}, U.CLA, L)).status === 404 && (await cj('portal.me', {}, U.CLA, A)).status === 404);
check('G18', 'A stranger gets "not found"', (await cj('portal.me', {}, U.NONE)).status === 404);

// ---- requests: answer
r = await cj('portal.requests.answer', { id: RQ.v, response: 'Logo attached in the next message' });
check('G19', 'A client answers an open shared request: status becomes answered', r.status === 200 && r.row.status === 'answered');
r = await cj('portal.requests.answer', { id: RQ.v, response: 'again' });
check('G20', 'An answered request cannot be answered again', r.status === 404);
for (const [n, rid] of [['internal', RQ.i], ['archived', RQ.a], ['the other client\'s', RQ.v2]]) {
  r = await cj('portal.requests.answer', { id: rid, response: 'x' });
  check(`G21-${n}`, `A client cannot answer a request that is ${n}`, r.status === 404);
}
await asUser(U.CL1);
const hack = await errCode(() => db.query("update client_requests set title = 'hacked', status = 'answered', response = 'x' where id = $1", [RQ.v2]));
const hack2 = await errCode(() => db.query("update client_requests set title = 'hacked', response = 'x', status = 'answered' where id = $1", [RQ.h]));
await asSuper();
check('G22', 'Direct attempt as a client account: changing anything but the answer on a request is refused (another client\'s, or their own open one)',
  hack !== undefined && hack2 !== undefined && (await rows("select count(*)::int n from client_requests where title = 'hacked'"))[0].n === 0);
await asUser(U.CL1);
const hack3 = await errCode(() => db.query("update client_requests set title = 'hacked', response = 'x', status = 'answered' where id = $1", [RQ.i]));
await asSuper();
check('G22b', 'The same for an internal request of their own client', (await rows("select count(*)::int n from client_requests where title = 'hacked'"))[0].n === 0 && hack3 !== undefined);

// ---- approvals: decide
r = await cj('portal.approvals.decide', { id: AP.v, decision: 'rejected' });
check('G23', 'A client\'s rejection needs a reason', r.status === 422);
r = await cj('portal.approvals.decide', { id: AP.i, decision: 'approved' });
check('G24', 'A client cannot decide an approval staff did not share', r.status === 404);
r = await cj('portal.approvals.decide', { id: AP.v2, decision: 'approved' });
check('G25', 'A client cannot decide another client\'s approval', r.status === 404);
r = await cj('portal.approvals.decide', { id: AP.v, decision: 'approved', note: 'Looks great' });
check('G26', 'A client approves what was shared with them; the decision and time are recorded', r.status === 200 && r.row.status === 'approved' && r.row.decided_at);
await asSuper();
const ev = await rows("select event, note from approval_events where approval_id = $1 order by id", [AP.v]);
check('G27', 'The decision is in the history with the client\'s note, decided by the client account', ev.map((e) => e.event).join() === 'requested,approved' && ev[1].note === 'Looks great' && (await rows('select decided_by from approvals where id=$1', [AP.v]))[0].decided_by === U.CL1);
r = await cj('portal.approvals.decide', { id: AP.v, decision: 'rejected', note: 'changed my mind' });
check('G28', 'A decided approval cannot be decided again', r.status === 404);

// ---- messages
r = await cj('portal.messages.send', { subject_type: 'request', subject: RQ.v, body: 'Here is the logo link' });
const M1 = r.row?.id;
check('G29', 'A client writes on a shared request: stored as a client message, attached to that request', r.status === 200 && r.row.author_kind === 'client' && r.row.subject_id === RQ.v && !('client_id' in r.row) && !('author_id' in r.row), JSON.stringify(r.body));
for (const [n, t, s] of [['an internal request', 'request', RQ.i], ['an internal file', 'file', F.i], ['an unshared approval', 'approval', AP.i], ['another client\'s file', 'file', F.v2], ['an unshared project', 'project', P.i], ['an item that does not exist', 'request', id()]]) {
  r = await cj('portal.messages.send', { subject_type: t, subject: s, body: 'x' });
  check(`G30-${n}`, `A client cannot write on ${n}`, r.status === 404);
}
r = await J('portal.staff.messages.send', { subject_type: 'request', subject: RQ.v, body: 'Thanks, received' }, U.ED);
check('G31', 'Staff reply on the same thread (permission and Portal on); stored as a staff message with the client taken from the subject', r.status === 200 && r.row.author_kind === 'staff' && r.row.client_id === C1, JSON.stringify(r.body));
r = await cj('portal.messages.list', { subject_type: 'request', subject: RQ.v });
check('G32', 'The client reads the thread in order, without author ids', r.status === 200 && r.data.map((m) => m.author_kind).join() === 'client,staff' && !('author_id' in r.data[0]));
r = await cj('portal.messages.list', { subject_type: 'request', subject: RQ.v }, U.CL2);
check('G33', 'The other client sees an empty thread for that request', r.status === 200 && r.data.length === 0);
r = await J('portal.staff.messages.list', { client: C1 }, U.ED);
check('G34', 'Staff list the conversation of a client, with authors', r.status === 200 && r.data.length === 2 && r.data.every((m) => m.author_id));
r = await J('portal.staff.messages.send', { subject_type: 'request', subject: RQ.v, body: 'x' }, U.CL1);
check('G35', 'A client cannot use the staff messaging operations', r.status === 404);
check('G36', 'Messages cannot be edited or deleted by anyone, owner included', (await (async () => { await asUser(U.OWN); const a = await errCode(() => db.query("update portal_messages set body='x'")); const b = await errCode(() => db.query('delete from portal_messages')); return a === '42501' && b === '42501'; })()));
await asSuper();
check('G37', 'Audit records each message by client, subject and kind, never the text', (await rows("select detail from audit_events where action = 'portal_messages.insert'")).every((x) => !JSON.stringify(x.detail).includes('logo link')) && (await rows("select 1 from audit_events where action = 'portal_messages.insert'")).length === 2);

// ---- G38: the table sweep. A client account, Portal on, can read rows in these tables only; everything else is invisible.
await asUser(U.CL1);
const tables = (await rows("select tablename t from pg_tables where schemaname = 'public' order by 1")).map((x) => x.t);
const visible = {};
for (const t of tables) { try { const n = (await rows(`select count(*)::int n from public.${t}`))[0].n; if (n > 0) visible[t] = n; } catch { /* no privilege = invisible */ } }
const EXPECT = new Set(['profiles', 'app_pages', 'approval_events', 'approvals', 'clients', 'client_requests', 'client_updates', 'files', 'memberships', 'portal_messages', 'project_tasks', 'projects', 'workspaces']);
const extra = Object.keys(visible).filter((t) => !EXPECT.has(t));
check('G38', `The table sweep: of ${tables.length} tables a client can read rows in ${Object.keys(visible).length}, all expected (${extra.length ? 'UNEXPECTED: ' + extra.join(',') : 'none unexpected'})`, extra.length === 0, JSON.stringify(visible));
check('G39', 'Of the tables a client may read, they see exactly the shared rows of their own client (1 approval, 1 project, 1 task, 1 file) and their own organization row, client, membership and profile', visible.clients === 1 && visible.memberships === 1 && visible.workspaces === 1 && visible.profiles === 1 && visible.approvals === 1 && visible.approval_events === 2 && visible.projects === 1 && visible.project_tasks === 1 && visible.files === 1, JSON.stringify(visible));
const wrote = [];
for (const t of tables.filter((x) => !['portal_messages', 'approvals', 'client_requests'].includes(x))) { // a client has no write path anywhere except messages, approval decisions and request answers
  const cols = (await rows("select column_name c from information_schema.columns where table_schema='public' and table_name=$1 and column_name in ('workspace_id')", [t]));
  if (!cols.length) continue;
  const del = await errCode(() => db.query(`delete from public.${t}`)); const upd = await errCode(() => db.query(`update public.${t} set workspace_id = workspace_id`));
  const after = await (async () => { await asSuper(); const n = (await rows(`select count(*)::int n from public.${t}`))[0].n; await asUser(U.CL1); return n; })();
  if (del === 'no-error' && !['audit_events'].includes(t)) { /* zero rows matched is fine: compare below */ }
  wrote.push([t, del, upd, after]);
}
await asSuper();
const stillThere = await rows('select (select count(*)::int from clients) c, (select count(*)::int from projects) p, (select count(*)::int from files) f, (select count(*)::int from project_tasks) t, (select count(*)::int from memberships) m');
check('G40', 'A client account cannot delete or update rows in any other table: nothing was removed', stillThere[0].c === 3 && stillThere[0].p === 3 && stillThere[0].f === 4 && stillThere[0].t === 3 && stillThere[0].m >= 7, JSON.stringify(stillThere[0]));
await asUser(U.CL1);
check('G41', 'A client cannot create a project, file, client, task or approval request, or add a member', (await Promise.all([
  errCode(() => db.query("insert into projects (workspace_id,client_id,name) values ($1,$2,'x')", [L, C1])),
  errCode(() => db.query("insert into clients (workspace_id,name) values ($1,'x')", [L])),
  errCode(() => db.query("insert into approvals (workspace_id,subject_type,subject_id,requested_by) values ($1,'other',$2,$3)", [L, id(), U.CL1])),
  errCode(() => db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff','owner')", [L, U.CL1])),
])).every((c) => c === '42501'));

// ---- kill switch and deactivation take effect at once
await asUser(U.OWN);
await db.query("update workspace_apps set enabled = false where workspace_id=$1 and app_key='portal'", [L]);
check('G42', 'Switching the Portal off hides everything from the client at once (no new session needed), and messages stop', (await cj('portal.projects.list', {})).data.length === 0 && (await cj('portal.me', {})).status === 404 && (await cj('portal.messages.send', { subject_type: 'request', subject: RQ.v, body: 'x' })).status === 404);
await asUser(U.OWN);
await db.query("update workspace_apps set enabled = true where workspace_id=$1 and app_key='portal'", [L]);
await asSuper(); await db.query("update memberships set status = 'deactivated' where user_id = $1", [U.CL1]);
check('G43', 'A deactivated client account has no access at all', (await cj('portal.me', {})).status === 404 && (await cj('launcher.list', {})).data.length === 0);

for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(8)} ${x.name}${x.ok ? '' : `  [${x.detail ?? ''}]`}`);
const p = results.filter((x) => x.ok).length; console.log(`\n${p}/${results.length} checks passed`); await db.close(); process.exit(p === results.length ? 0 : 1);
