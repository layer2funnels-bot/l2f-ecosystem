// Client access, Door A (migration 0032): invite-first onboarding of Client Portal contacts. Idempotent, workspace-aware, no duplicate clients or memberships,
// suspend / restore / revoke, failure recorded and recoverable, nothing granted by signing up, Portal still locked (G2).
import { randomUUID as id } from 'node:crypto';
import { openDb, migrate, session, recorder } from './lib.mjs';
import { createApi } from '../packages/core/api.mjs';
import { createPgExecutor } from '../packages/core/pg-executor.mjs';
import { createRateLimiter } from '../packages/core/rate-limit.mjs';
import { createSafeLogger } from '../packages/core/safe-log.mjs';

const db = await openDb(); await migrate(db);
const { results, check } = recorder();
const rows = async (s, p = []) => (await db.query(s, p)).rows;
let chain = Promise.resolve();
const acquire = () => { const prev = chain; let release; chain = new Promise((r) => { release = r; }); return prev.then(() => ({ query: (s, p) => db.query(s, p), release })); };
const BIG = { read: { max: 1e6, windowMs: 6e4 }, write: { max: 1e6, windowMs: 6e4 }, sensitive: { max: 1e6, windowMs: 6e4 } };
const api = createApi({ executor: createPgExecutor({ acquire, role: 'app_user' }), logger: createSafeLogger(() => {}), limiter: createRateLimiter({ limits: BIG }) });
const EM = {}; const J = async (op, input, u, org) => { const r = await api.handle({ operation: op, input, auth: { userId: u, email: EM[u] ?? 'x@example.com' }, headers: { 'x-org-id': org } }); return { ...r, row: r.body?.data?.[0], rows: r.body?.data ?? [] }; };
await db.exec('reset role');

const { asUser, asSuper } = session(db);
const ORG = { L: id(), A: id() };
const U = { BOTH: id(), LO: id(), LAD: id(), LED: id(), LVW: id(), AO: id(), AAD: id(), K1: id(), K2: id(), K3: id() };
EM[U.LO] = 'owner@l2f.test'; EM[U.LAD] = 'admin@l2f.test'; EM[U.LED] = 'editor@l2f.test'; EM[U.LVW] = 'viewer@l2f.test'; EM[U.AO] = 'owner@aurj.test'; EM[U.AAD] = 'admin@aurj.test';
EM[U.K1] = 'anna@acme.test'; EM[U.K2] = 'ben@beta.test'; EM[U.K3] = 'cara@carbon.test';
await db.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','L'),($2,'aurj','A')", [ORG.L, ORG.A]);
const staff = (u, ws, r) => db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff',$3)", [ws, u, r]);
await staff(U.BOTH, ORG.L, 'owner'); await staff(U.BOTH, ORG.A, 'owner'); await staff(U.LO, ORG.L, 'owner'); await staff(U.LAD, ORG.L, 'admin'); await staff(U.LED, ORG.L, 'editor'); await staff(U.LVW, ORG.L, 'viewer'); await staff(U.AO, ORG.A, 'owner'); await staff(U.AAD, ORG.A, 'admin');
for (const u of [U.LO, U.LAD, U.LED, U.LVW, U.AO, U.AAD]) await db.query('insert into profiles (id, email, display_name) values ($1,$2,$3)', [u, EM[u], 'Staff']);
for (const u of [U.LED, U.LVW]) await db.query('insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,$3)', [ORG.L, u, 'clients']);
const CL = id(); await db.query("insert into clients (id,workspace_id,name) values ($1,$2,'Existing client')", [CL, ORG.L]);
const CA2 = id(); await db.query("insert into clients (id,workspace_id,name) values ($1,$2,'Aurj client')", [CA2, ORG.A]);
const count = async (sql, p = []) => (await rows(sql, p))[0].c;
const inv = async (email, extra = {}, u = U.LAD, org = ORG.L) => { const r = await J('clients.access.invite', { email, ...extra }, u, org); if (process.env.DBG) console.log('INV', email, r.status, JSON.stringify(r.row)?.slice(0, 160)); return r; };

// ---- the invite creates everything it needs, once
const r1 = await inv('anna@acme.test', { client_name: 'Acme Ltd', person_name: 'Anna' });
const a1 = r1.row;
const cprof = (await rows("select c.name, p.email, p.status, p.stage_key from clients c join client_profiles p on p.client_id = c.id where c.id = $1", [a1?.client_id]))[0];
check('CA1', 'An admin invites a client by e-mail: the client record is created in their workspace (lead, Onboarding stage), the invitation is issued once, and the access is "invited"', r1.status === 200 && a1.ok === true && a1.client_created === true && a1.reused === false && a1.token?.length > 30 && cprof?.name === 'Acme Ltd' && cprof.email === 'anna@acme.test' && cprof.status === 'lead' && cprof.stage_key === 'onboarding' && (await count("select count(*)::int c from client_access where workspace_id = $1 and status = 'invited'", [ORG.L])) === 1);
const r1b = await inv('Anna@Acme.test ', { client_name: 'Something else' });
check('CA2', 'Asking again for the same person (any capitalisation) is safe: same access and client record, the old link is cancelled, a new one is issued, and no second client appears', r1b.row?.ok === true && r1b.row.reused === true && r1b.row.access_id === a1.access_id && r1b.row.client_id === a1.client_id && r1b.row.token !== a1.token && r1b.row.client_created === false
  && (await count("select count(*)::int c from clients where workspace_id = $1 and name in ('Acme Ltd','Something else')", [ORG.L])) === 1 && (await count("select count(*)::int c from invitations where workspace_id = $1 and email = 'anna@acme.test' and revoked_at is null and accepted_at is null", [ORG.L])) === 1);
const r3 = await inv('ben@beta.test', { client: CL, person_name: 'Ben' });
check('CA3', 'An invite can link an existing client record instead of creating one', r3.row?.ok === true && r3.row.client_id === CL && r3.row.client_created === false && (await count("select count(*)::int c from clients where workspace_id = $1", [ORG.L])) === 2);
await db.query("insert into clients (id,workspace_id,name) values ($1,$2,'Carbon Inc')", [id(), ORG.L]);
const carbon = (await rows("select id from clients where name = 'Carbon Inc'"))[0].id; await db.query("update client_profiles set email = 'cara@carbon.test' where client_id = $1", [carbon]);
const r4 = await inv('cara@carbon.test');
check('CA4', 'A client record that already carries that e-mail is linked, not duplicated', r4.row?.ok === true && r4.row.client_id === carbon && r4.row.client_created === false);
await db.query("insert into clients (id,workspace_id,name) values ($1,$2,'Dup A'), ($3,$2,'Dup B')", [id(), ORG.L, id()]);
for (const n of ['Dup A', 'Dup B']) await db.query("update client_profiles set email = 'dupe@x.test' where client_id = (select id from clients where name = $1)", [n]);
check('CA5', 'Two client records with the same e-mail are refused with a plain code (choose one)', (await inv('dupe@x.test')).row?.code === 'several_clients');
check('CA6', 'A team member\'s e-mail, a bad e-mail and an over-long name are refused with plain codes and write nothing', (await inv('editor@l2f.test')).row?.code === 'team_member' && (await inv('not-an-email')).row?.code === 'bad_email' && (await inv('long@x.test', { client_name: 'x'.repeat(201) })).status !== 200
  && (await count("select count(*)::int c from client_access where email in ('editor@l2f.test','long@x.test')")) === 0);

// ---- who may do this
check('CA7', 'Only people with clients.access.manage can invite or list: an owner and an admin can; an editor, a viewer and a client cannot', (await inv('o@x.test', {}, U.LO)).row?.ok === true && (await inv('e@x.test', {}, U.LED)).status === 404 && (await inv('v@x.test', {}, U.LVW)).status === 404 && (await J('clients.access.list', {}, U.LED, ORG.L)).status === 404 && (await J('clients.access.list', {}, U.LVW, ORG.L)).status === 404);
check('CA8', 'Another organization cannot see, list, invite into or change this one: an Aurj admin sees only Aurj, cannot name a Layer2Funnels client, and cannot send requests to Layer2Funnels', (await J('clients.access.list', {}, U.AAD, ORG.A)).rows.length === 0
  && (await inv('z@x.test', { client: CL }, U.AAD, ORG.A)).status === 404 && (await inv('z@x.test', {}, U.AAD, ORG.L)).status === 404 && (await J('clients.access.set_status', { id: a1.access_id, status: 'revoked' }, U.AAD, ORG.A)).status === 404 && (await J('clients.access.set_status', { id: a1.access_id, status: 'revoked' }, U.AAD, ORG.L)).status === 404);
const aur = await inv('anna@acme.test', { client_name: 'Acme (Aurj)' }, U.AAD, ORG.A);
check('CA9', 'The same person can be invited by both organizations: two separate client records, two separate accesses', aur.row?.ok === true && aur.row.client_id !== a1.client_id && (await count("select count(*)::int c from client_access where email = 'anna@acme.test'")) === 2);

// ---- accepting
const tokOld = a1.token, tokNew = r1b.row.token;
check('CA10', 'The cancelled link no longer works, and a link used with a different sign-in e-mail does not work either', (await J('invitation.accept', { token: tokOld }, U.K1, ORG.L)).status === 404 && (await J('invitation.accept', { token: tokNew }, U.K2, ORG.L)).status === 404 && (await count("select count(*)::int c from memberships where kind = 'client'")) === 0);
const acc = await J('invitation.accept', { token: tokNew }, U.K1, ORG.L);
const mem = (await rows("select kind, role, client_id, status from memberships where user_id = $1 and workspace_id = $2", [U.K1, ORG.L]))[0];
const row1 = (await rows("select status, user_id from client_access where id = $1", [a1.access_id]))[0];
check('CA11', 'Accepting with the invited e-mail creates the client membership bound to that one client record and makes the access active', acc.status === 200 && mem?.kind === 'client' && mem.role === null && mem.client_id === a1.client_id && mem.status === 'active' && row1.status === 'active' && row1.user_id === U.K1);
check('CA12', 'Accepting again changes nothing and creates no second membership', (await J('invitation.accept', { token: tokNew }, U.K1, ORG.L)).status === 404 && (await count("select count(*)::int c from memberships where user_id = $1", [U.K1])) === 1);
check('CA13', 'The same e-mail can no longer be invited while the access is active (plain code), so no second access or client appears', (await inv('anna@acme.test')).row?.code === 'already_has_access' && (await count("select count(*)::int c from client_access where workspace_id = $1 and email = 'anna@acme.test'", [ORG.L])) === 1);

// ---- what a client account can reach
await asUser(U.K1, { email: EM[U.K1], org: ORG.L }); const apps0 = (await rows('select app_key from launcher_apps($1)', [ORG.L])).map((x) => x.app_key); await asSuper();
check('CA16', 'While the Portal is locked (G2) an active client is offered no app at all', apps0.length === 0);
check('CA16b', 'While the Portal is locked, even an active client\'s Portal calls are refused', (await J('portal.me', {}, U.K1, ORG.L)).status === 404);
await db.query("insert into workspace_apps (workspace_id, app_key, enabled) values ($1, 'portal', true) on conflict (workspace_id, app_key) do update set enabled = true", [ORG.L]);   // gate G2: the owner's per-organization switch
const me = await J('portal.me', {}, U.K1, ORG.L);
check('CA14', 'The client account reaches only the Portal family, and only its own client record', me.status === 200 && me.rows.length === 1 && me.rows[0].id === a1.client_id && (await J('clients.list', {}, U.K1, ORG.L)).status === 404 && (await J('clients.access.list', {}, U.K1, ORG.L)).status === 404 && (await inv('k@x.test', {}, U.K1, ORG.L)).status === 404 && (await J('invitation.create', { email: 'k2@x.test', kind: 'staff', role: 'admin' }, U.K1, ORG.L)).status === 404);
check('CA15', 'The client account cannot see the other organization', (await J('portal.me', {}, U.K1, ORG.A)).status === 404);
await asUser(U.K1, { email: EM[U.K1], org: ORG.L }); const apps1 = (await rows('select app_key from launcher_apps($1)', [ORG.L])).map((x) => x.app_key); await asSuper();
check('CA17', 'Only when the owner opens the Portal for that organization does the client see it (the registry did not open it)', apps1.join() === 'portal');

// ---- the list, status controls and history
const list = (await J('clients.access.list', {}, U.LAD, ORG.L)).rows;
const la = list.find((x) => x.id === a1.access_id);
check('CA18', 'The admin\'s list shows each person with client name, status, source and whether the Portal is open, for this organization only', list.length >= 4 && la.status === 'active' && la.client_name === 'Acme Ltd' && la.source === 'invite' && la.portal_live === true && list.every((x) => x.email !== 'anna@acme.test' || x.client_name !== 'Acme (Aurj)'));
const sus = await J('clients.access.set_status', { id: a1.access_id, status: 'suspended', note: 'Invoice dispute' }, U.LAD, ORG.L);
check('CA19', 'Suspending an active client switches the access off immediately: the client account is refused everywhere', sus.row?.status === 'suspended' && (await J('portal.me', {}, U.K1, ORG.L)).status === 404 && (await rows("select status from memberships where user_id = $1", [U.K1]))[0].status === 'deactivated');
const ev1 = (await rows('select count(*)::int c from client_access_events where access_id = $1', [a1.access_id]))[0].c;
check('CA20', 'Suspending twice is harmless: no error and no extra history', (await J('clients.access.set_status', { id: a1.access_id, status: 'suspended' }, U.LAD, ORG.L)).row?.status === 'suspended' && (await count('select count(*)::int c from client_access_events where access_id = $1', [a1.access_id])) === ev1);
check('CA21', 'Restoring brings the same access back with the same membership', (await J('clients.access.set_status', { id: a1.access_id, status: 'active' }, U.LAD, ORG.L)).row?.status === 'active' && (await J('portal.me', {}, U.K1, ORG.L)).status === 200 && (await count("select count(*)::int c from memberships where user_id = $1", [U.K1])) === 1);
check('CA22', 'An editor cannot suspend or revoke, and a made-up status or a revoked-to-active move is refused', (await J('clients.access.set_status', { id: a1.access_id, status: 'suspended' }, U.LED, ORG.L)).status === 404 && (await J('clients.access.set_status', { id: a1.access_id, status: 'banana' }, U.LAD, ORG.L)).status === 422);
const rev = await J('clients.access.set_status', { id: a1.access_id, status: 'revoked' }, U.LAD, ORG.L);
check('CA23', 'Revoking removes the membership and the client loses access; the client record and its history stay', rev.row?.status === 'revoked' && (await J('portal.me', {}, U.K1, ORG.L)).status === 404 && (await count("select count(*)::int c from memberships where user_id = $1", [U.K1])) === 0 && (await count('select count(*)::int c from clients where id = $1', [a1.client_id])) === 1);
check('CA24', 'A revoked access cannot be revived by the status call (invite again instead)', (await J('clients.access.set_status', { id: a1.access_id, status: 'active' }, U.LAD, ORG.L)).status === 422);
const again = await inv('anna@acme.test', { person_name: 'Anna' });
check('CA25', 'Inviting a revoked person again reuses their client record, starts a new access, and keeps the old one as history', again.row?.ok === true && again.row.client_id === a1.client_id && again.row.client_created === false && again.row.access_id !== a1.access_id && (await count("select count(*)::int c from client_access where workspace_id = $1 and email = 'anna@acme.test'", [ORG.L])) === 2 && (await count("select count(*)::int c from clients where workspace_id = $1 and name = 'Acme Ltd'", [ORG.L])) === 1);
await db.query("update workspace_apps set enabled = false where workspace_id = $1 and app_key = 'portal'", [ORG.L]);
check('CA25b', 'The list says the Portal is not open again once it is locked (the access itself is unchanged)', (await J('clients.access.list', {}, U.LAD, ORG.L)).rows.every((x) => x.portal_live === false));
const hist = (await J('clients.access.events', { access: a1.access_id }, U.LAD, ORG.L)).rows.map((x) => x.event);
check('CA26', 'The history lists each step in order (created, invited, reinvited, accepted, suspended, restored, revoked) without any e-mail or name', ['created_client', 'invited', 'reinvited', 'accepted', 'suspended', 'restored', 'revoked'].every((e, n) => hist[n] === e) && (await rows("select detail from client_access_events")).every((x) => !x.detail || !/@/.test(x.detail)));

// ---- failure is recorded and recoverable
await db.query("create function public.t_boom() returns trigger language plpgsql as $$ begin if new.email = 'boom@x.test' then raise exception 'boom'; end if; return new; end $$");
await db.query("create trigger t_boom before update on public.client_profiles for each row execute function public.t_boom()");
const clientsBefore = await count('select count(*)::int c from clients where workspace_id = $1', [ORG.L]); const invBefore = await count('select count(*)::int c from invitations');
const bad = await inv('boom@x.test', { client_name: 'Boom Co' });
const failed = (await rows("select event, detail from client_access_events where event = 'failed'"))[0];
check('CA27', 'If a step fails, nothing is kept (no client, no invitation, no access), one "failed" event with a code is recorded, and the caller is told so', bad.status === 200 && bad.row.ok === false && bad.row.token === null && failed?.detail?.startsWith('invite:') && (await count('select count(*)::int c from clients where workspace_id = $1', [ORG.L])) === clientsBefore && (await count('select count(*)::int c from invitations')) === invBefore && (await count("select count(*)::int c from client_access where email = 'boom@x.test'")) === 0);
await db.query('drop trigger t_boom on public.client_profiles');
const fixed = await inv('boom@x.test', { client_name: 'Boom Co' });
check('CA28', 'Retrying after the cause is fixed works and creates exactly one client and one access', fixed.row?.ok === true && (await count("select count(*)::int c from clients where name = 'Boom Co'")) === 1 && (await count("select count(*)::int c from client_access where email = 'boom@x.test'")) === 1);

// ---- the table's own rules, even against someone with full rights
const skip = await db.query("update client_access set status = 'suspended' where id = $1", [fixed.row.access_id]).then(() => false, () => true);
const move = await db.query("update client_access set client_id = $2 where id = $1", [fixed.row.access_id, CL]).then(() => false, () => true);
const mail = await db.query("update client_access set email = 'other@x.test' where id = $1", [fixed.row.access_id]).then(() => false, () => true);
check('CA36', 'The table itself refuses a status skip (invited straight to suspended), moving an access to another client, or changing its e-mail', skip && move && mail);
await asUser(U.BOTH, { email: 'both@x.test', org: ORG.A }); const seenA = (await rows('select distinct workspace_id from client_access')).map((x) => x.workspace_id); await asSuper();
await asUser(U.BOTH, { email: 'both@x.test', org: ORG.L }); const seenL = (await rows('select distinct workspace_id from client_access')).map((x) => x.workspace_id); await asSuper();
check('CA37', 'A person who manages both organizations sees only the organization named by the request, never both at once', seenA.length === 1 && seenA[0] === ORG.A && seenL.length === 1 && seenL[0] === ORG.L);

// ---- the registry cannot be written around the functions
await asUser(U.LO, { email: EM[U.LO], org: ORG.L });
const dInsert = await db.query("insert into client_access (workspace_id, client_id, email, status) values ($1,$2,'sneak@x.test','invited')", [ORG.L, CL]).then(() => false, () => true);
const dUpdate = await db.query("update client_access set status = 'active' where id = $1", [again.row.access_id]).then((r) => r.affectedRows === 0, () => true);
const dDelete = await db.query("delete from client_access where id = $1", [again.row.access_id]).then((r) => r.affectedRows === 0, () => true);
const dEvent = await db.query("insert into client_access_events (workspace_id, event) values ($1,'invited')", [ORG.L]).then(() => false, () => true);
await asSuper();
check('CA29', 'Even an owner cannot insert, change or delete access rows or history directly; only the functions can', dInsert && dUpdate && dDelete && dEvent);
check('CA30', 'The history cannot be rewritten or erased, even by the database owner', await db.query("update client_access_events set detail = 'x'").then(() => false, () => true) && await db.query("delete from client_access_events").then(() => false, () => true));
check('CA31', 'A second live access for one e-mail is impossible at the table level too (concurrent invites cannot duplicate)', await db.query("insert into client_access (workspace_id, client_id, email, status) values ($1,$2,'anna@acme.test','invited')", [ORG.L, CL]).then(() => false, () => true));
const leg = await J('invitation.create', { email: 'legacy@x.test', kind: 'client', client: CL }, U.LAD, ORG.L);
check('CA32', 'A staff Members list does not show clients, and a client invitation made the older way (invitation.create) still lands in the registry', (await J('members.list', {}, U.LAD, ORG.L)).rows.every((x) => !/acme|beta|carbon|legacy/.test(x.email ?? '')) && leg.status === 200 && (await count("select count(*)::int c from client_access where email = 'legacy@x.test' and status = 'invited' and client_id = $1", [CL])) === 1);
check('CA33', 'Access changes are audited with ids and statuses only, never e-mail or name', (await rows("select detail::text d from audit_events where action like 'client_access.%'")).length > 5 && (await rows("select detail::text d from audit_events where action like 'client_access.%'")).every((x) => !/@|Acme|Anna/.test(x.d)));
check('CA35', 'Removing a client member the older way (membership deleted) keeps the registry honest (revoked)', await (async () => {
  const t = await inv('dora@x.test', { person_name: 'Dora' }); if (!t.row) console.log('DORA', t.status, JSON.stringify(t.body)); const d = id(); EM[d] = 'dora@x.test';
  await J('invitation.accept', { token: t.row.token }, d, ORG.L);
  await db.query('delete from memberships where user_id = $1', [d]);
  return (await rows("select status from client_access where id = $1", [t.row.access_id]))[0].status === 'revoked'; })());
for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}`);
const pc = results.filter((x) => x.ok).length; console.log(`\n${pc}/${results.length} checks passed`); await db.close(); process.exit(pc === results.length ? 0 : 1);
