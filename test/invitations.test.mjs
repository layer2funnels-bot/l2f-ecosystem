// Invitation onboarding (migration 0042): e-mail delivery, joining without the link (verified e-mail only), resend, duplicates, already-members,
// expired / cancelled / someone else's invitations, staff vs client access, and the other organization never seeing any of it.
import { randomUUID as id } from 'node:crypto';
import { openDb, migrate, recorder } from './lib.mjs';
import { createApi } from '../packages/core/api.mjs';
import { createPgExecutor } from '../packages/core/pg-executor.mjs';
import { createRateLimiter } from '../packages/core/rate-limit.mjs';
import { createSafeLogger } from '../packages/core/safe-log.mjs';
import { mailerFromEnv, invitationEmail } from '../packages/core/mailer.mjs';

const db = await openDb(); await migrate(db);
const { results, check } = recorder();
let chain = Promise.resolve();
const acquire = () => { const prev = chain; let release; chain = new Promise((r) => { release = r; }); return prev.then(() => ({ query: (s, p) => db.query(s, p), release })); };
const BIG = { read: { max: 1e6, windowMs: 6e4 }, write: { max: 1e6, windowMs: 6e4 }, sensitive: { max: 1e6, windowMs: 6e4 } };

// a fake Brevo: records requests; can be told to fail
const sent = []; let brevoMode = 'ok';
const fakeFetch = async (url, init) => {
  const body = JSON.parse(init.body); sent.push({ url, key: init.headers['api-key'], body });
  if (brevoMode === 'down') throw new Error('network');
  if (brevoMode === 'reject') return { status: 400, json: async () => ({ code: 'invalid_parameter', message: 'x' }) };
  return { status: 201, json: async () => ({ messageId: `<msg-${sent.length}@brevo>` }) };
};
const mkApi = (mailer) => createApi({ executor: createPgExecutor({ acquire, role: 'app_user' }), logger: createSafeLogger(() => {}), limiter: createRateLimiter({ limits: BIG }), mailer });
const withMail = mkApi(mailerFromEnv({ BREVO_API_KEY: 'test-key', MAIL_FROM_EMAIL: 'team@layer2funnels.example' }, fakeFetch));
const noMail = mkApi(mailerFromEnv({}));
const call = (api) => async (op, input, u, org, email = 'x@example.com', verified = true) => {
  const r = await api.handle({ operation: op, input, auth: { userId: u, email, emailVerified: verified }, headers: { 'x-org-id': org }, origin: 'https://app.example' });
  return { ...r, row: r.body?.data?.[0], rows: r.body?.data ?? [] };
};
const J = call(withMail), N = call(noMail);
const NO_ORG = '00000000-0000-0000-0000-000000000000';

await db.exec('reset role');
const ORG = { L: id(), A: id() }; const U = { LO: id(), LAD: id(), LED: id(), AO: id(), NEW: id(), NEW2: id(), OTHER: id(), MEM: id(), CL: id() };
await db.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','Layer2Funnels'),($2,'aurj','Aurj')", [ORG.L, ORG.A]);
const staff = (u, ws, r, status = 'active') => db.query("insert into memberships (workspace_id,user_id,kind,role,status) values ($1,$2,'staff',$3,$4)", [ws, u, r, status]);
await staff(U.LO, ORG.L, 'owner'); await staff(U.LAD, ORG.L, 'admin'); await staff(U.LED, ORG.L, 'editor'); await staff(U.AO, ORG.A, 'owner'); await staff(U.MEM, ORG.L, 'viewer');
for (const [u, n, e] of [[U.LO, 'Olivia Owner', 'olivia@l2f.example'], [U.LAD, 'Adam Admin', 'adam@l2f.example'], [U.MEM, 'Mo Member', 'mo@l2f.example']]) await db.query('insert into profiles (id, email, display_name) values ($1,$2,$3) on conflict (id) do update set display_name = excluded.display_name, email = excluded.email', [u, e, n]);
await db.query("update apps set lifecycle = 'active' where key in ('forms','value_ladder','social_planner','whiteboard')");
await db.query("insert into workspace_apps (workspace_id, app_key, enabled) select $1, k, true from unnest(array['office','projects','planner','drive','clients','forms','value_ladder','social_planner','whiteboard']) k on conflict (workspace_id, app_key) do update set enabled = true", [ORG.L]);
await db.query("insert into workspace_apps (workspace_id, app_key, enabled) values ($1, 'portal', true) on conflict (workspace_id, app_key) do update set enabled = true", [ORG.L]);

// ---- A. staff invitation, e-mail requested from the provider
let r = await J('invitation.create', { email: 'New.Person@Example.com', kind: 'staff', role: 'editor' }, U.LAD, ORG.L);
const inv1 = r.row?.invitation_id;
check('IV1', 'An admin invites a teammate: the invitation is created and the e-mail is accepted by the provider', r.status === 200 && r.row.email_status === 'sent' && r.row.token === null && sent.length === 1);
const m1 = sent[0];
check('IV2', 'The e-mail goes to the invited address, from the configured sender, with the server-side key, and names the inviter, the organization and the role', m1.key === 'test-key' && m1.body.to[0].email === 'new.person@example.com' && m1.body.sender.email === 'team@layer2funnels.example'
  && m1.body.subject.includes('Adam Admin') && m1.body.subject.includes('Layer2Funnels') && m1.body.htmlContent.includes('an Editor') && /https:\/\/app\.example\/#\/invite\?token=[0-9a-f]{64}/.test(m1.body.textContent));
const tok1 = /token=([0-9a-f]{64})/.exec(m1.body.textContent)[1];
check('IV3', 'The delivery is recorded (status, provider id), never the token or the message', (await db.query("select status, provider, provider_message_id, error_code from invitation_deliveries where invitation_id = $1", [inv1])).rows.some((d) => d.status === 'sent' && d.provider === 'brevo' && d.provider_message_id && !d.error_code)
  && !JSON.stringify((await db.query('select * from invitation_deliveries')).rows).includes(tok1));
check('IV4', 'By default a teammate gets every app switched on in the organization (not the Portal)', JSON.stringify((await db.query('select apps from invitations where id = $1', [inv1])).rows[0].apps.sort()) === JSON.stringify(['clients', 'drive', 'forms', 'office', 'planner', 'projects', 'social_planner', 'value_ladder', 'whiteboard']));

// ---- D. delivery failures are told plainly and recorded
brevoMode = 'reject'; r = await J('invitation.create', { email: 'bounce@example.com', kind: 'staff', role: 'viewer' }, U.LAD, ORG.L);
check('IV5', 'A provider refusal is reported as failed (with a short code), and the admin gets the link to pass on', r.status === 200 && r.row.email_status === 'failed' && /^http_400/.test(r.row.email_error) && /^[0-9a-f]{64}$/.test(r.row.token));
brevoMode = 'down'; r = await J('invitations.resend', { id: r.row.invitation_id }, U.LAD, ORG.L);
check('IV6', 'A network failure is reported as failed too, never as sent', r.status === 200 && r.row.email_status === 'failed' && r.row.email_error === 'network');
brevoMode = 'ok';
r = await N('invitation.create', { email: 'nomail@example.com', kind: 'staff', role: 'viewer' }, U.LAD, ORG.L);
check('IV7', 'Without e-mail settings nothing is claimed: status "not_configured" and the link comes back', r.row.email_status === 'not_configured' && /^[0-9a-f]{64}$/.test(r.row.token));
const ml = (await J('members.list', {}, U.LAD, ORG.L)).rows;
check('IV8', 'Admin › Members shows each invitation with its e-mail status, and never a token', ml.find((x) => x.email === 'bounce@example.com')?.email_status === 'failed' && ml.find((x) => x.email === 'new.person@example.com')?.email_status === 'sent' && ml.find((x) => x.email === 'nomail@example.com')?.email_status === 'not_configured' && !JSON.stringify(ml).includes(tok1));
check('IV9', 'Mail status tells admins whether e-mail is switched on, without any secret', (await J('mail.status', {}, U.LAD, ORG.L)).row.configured === true && !JSON.stringify((await J('mail.status', {}, U.LAD, ORG.L)).body).includes('test-key') && (await N('mail.status', {}, U.LAD, ORG.L)).row.configured === false);

// ---- M. duplicates and conflicts
r = await J('invitation.create', { email: 'new.person@example.com', kind: 'staff', role: 'admin' }, U.LAD, ORG.L);
check('IV10', 'A second open invitation for the same e-mail is refused (use Resend instead), and nothing is e-mailed', r.status === 422 && sent.length === 3);
r = await J('invitation.create', { email: 'mo@l2f.example', kind: 'staff', role: 'editor' }, U.LAD, ORG.L);
check('IV11', 'Inviting someone who is already on the team is refused', r.status === 422);
check('IV12', 'An editor cannot invite anyone (not found), and an admin cannot invite an owner', [403, 404].includes((await J('invitation.create', { email: 'z@example.com', kind: 'staff', role: 'viewer' }, U.LED, ORG.L)).status) && [403, 404].includes((await J('invitation.create', { email: 'z@example.com', kind: 'staff', role: 'owner' }, U.LAD, ORG.L)).status));

// ---- H/E/J. the invitee joins WITHOUT the link (other device): verified e-mail only
const NEWMAIL = 'new.person@example.com';
let mine = await J('invitations.mine', {}, U.NEW, NO_ORG, NEWMAIL, false);
check('IV13', 'Before the e-mail is confirmed, nothing is offered', mine.status === 200 && mine.rows.length === 0);
mine = await J('invitations.mine', {}, U.NEW, NO_ORG, NEWMAIL, true);
check('IV14', 'After confirming, the person sees the invitation (organization, role, who invited) with no token', mine.rows.length === 1 && mine.row.org_name === 'Layer2Funnels' && mine.row.role === 'editor' && mine.row.inviter_name === 'Adam Admin' && !('token' in mine.row));
check('IV15', 'An unverified account with the same e-mail cannot accept it', (await J('invitation.accept_mine', { id: inv1 }, U.OTHER, NO_ORG, NEWMAIL, false)).status === 404);
check('IV16', 'Someone else (a different e-mail) cannot accept it, even with its id', (await J('invitation.accept_mine', { id: inv1 }, U.OTHER, NO_ORG, 'other@example.com', true)).status === 404);
r = await J('invitation.accept_mine', { id: inv1 }, U.NEW, NO_ORG, NEWMAIL, true);
check('IV17', 'The invited person joins with one click', r.status === 200 && r.row.membership_id);
const mem = (await db.query("select kind, role, status, client_id from memberships where user_id = $1 and workspace_id = $2", [U.NEW, ORG.L])).rows;
check('IV18', 'They are a staff member of exactly that organization, with exactly the invited role', mem.length === 1 && mem[0].kind === 'staff' && mem[0].role === 'editor' && mem[0].status === 'active' && mem[0].client_id === null
  && (await db.query('select count(*)::int n from memberships where user_id = $1', [U.NEW])).rows[0].n === 1);
const cat = (await J('launcher.catalog', {}, U.NEW, ORG.L, NEWMAIL)).rows.filter((a) => a.state === 'available').map((a) => a.app_key).sort();
const grants = (await db.query('select app_key from app_grants where user_id = $1 and workspace_id = $2', [U.NEW, ORG.L])).rows.map((g) => g.app_key);
check('IV19', 'They can open every app they were given (and the Launcher shows them); the invitation grants no Client Portal access (its tile is shown to every team member, 0043)', ['clients', 'drive', 'forms', 'office', 'planner', 'projects', 'social_planner', 'value_ladder', 'whiteboard'].every((k) => cat.includes(k)) && !grants.includes('portal'), cat.join(','));
check('IV20', 'They did not get admin rights: Admin › Members stays empty for them', (await J('members.list', {}, U.NEW, ORG.L, NEWMAIL)).rows.length === 0);
check('IV21', 'The invitation is used up: the link and the id no longer work', (await J('invitation.accept', { token: tok1 }, U.NEW, NO_ORG, NEWMAIL)).status === 404 && (await J('invitation.accept_mine', { id: inv1 }, U.NEW, NO_ORG, NEWMAIL, true)).status === 404);

// ---- I. an existing user is invited to a second organization; already-members are not turned away
r = await J('invitation.create', { email: 'adam@l2f.example', kind: 'staff', role: 'viewer' }, U.AO, ORG.A);
const tokA = r.row.token ?? /token=([0-9a-f]{64})/.exec(sent.at(-1).body.textContent)[1];
r = await J('invitation.accept', { token: tokA }, U.LAD, NO_ORG, 'adam@l2f.example');
check('IV22', 'An existing user accepts an invitation to another organization and keeps their first one unchanged', r.status === 200 && (await db.query("select workspace_id, role from memberships where user_id = $1 order by role", [U.LAD])).rows.length === 2
  && (await db.query("select role from memberships where user_id = $1 and workspace_id = $2", [U.LAD, ORG.L])).rows[0].role === 'admin');
check('IV23', 'Inviting someone into Aurj never shows anything of Layer2Funnels: Aurj’s member list has only Aurj people and invitations', !(await J('members.list', {}, U.AO, ORG.A)).rows.some((x) => /new\.person|bounce|nomail/.test(x.email ?? '')));
await db.query("insert into invitations (workspace_id, email, kind, role, token_hash, invited_by) values ($1, 'mo@l2f.example', 'staff', 'admin', encode(sha256(convert_to('already-member-token', 'UTF8')), 'hex'), $2)", [ORG.L, U.LO]);
r = await J('invitation.accept', { token: 'already-member-token' }, U.MEM, NO_ORG, 'mo@l2f.example');
check('IV24', 'Someone already in the organization who opens an invitation is let in as they are: no error, and NO role change', r.status === 200 && (await db.query("select role from memberships where user_id = $1 and workspace_id = $2", [U.MEM, ORG.L])).rows[0].role === 'viewer');

// ---- L. expired and cancelled invitations
r = await J('invitation.create', { email: 'late@example.com', kind: 'staff', role: 'viewer' }, U.LAD, ORG.L);
const invLate = r.row.invitation_id; const tokLate = /token=([0-9a-f]{64})/.exec(sent.at(-1).body.textContent)[1];
await db.query("update invitations set expires_at = now() - interval '1 hour' where id = $1", [invLate]);
check('IV25', 'An expired invitation is refused by link and by id, and is not offered', (await J('invitation.accept', { token: tokLate }, U.OTHER, NO_ORG, 'late@example.com')).status === 404 && (await J('invitation.accept_mine', { id: invLate }, U.OTHER, NO_ORG, 'late@example.com', true)).status === 404 && (await J('invitations.mine', {}, U.OTHER, NO_ORG, 'late@example.com', true)).rows.length === 0);
check('IV26', 'Admins see it as expired', (await J('members.list', {}, U.LAD, ORG.L)).rows.find((x) => x.invitation_id === invLate)?.status === 'expired');
r = await J('invitations.resend', { id: invLate }, U.LAD, ORG.L);
const tokLate2 = /token=([0-9a-f]{64})/.exec(sent.at(-1).body.textContent)[1];
check('IV27', 'Resend gives an expired invitation a fresh link and a new e-mail; the old link stays dead', r.status === 200 && r.row.email_status === 'sent' && tokLate2 !== tokLate && (await J('invitation.accept', { token: tokLate }, U.OTHER, NO_ORG, 'late@example.com')).status === 404);
check('IV28', 'An editor cannot resend', [403, 404].includes((await J('invitations.resend', { id: invLate }, U.LED, ORG.L)).status));
check('IV29', 'Another organization cannot resend it (not found)', [403, 404].includes((await J('invitations.resend', { id: invLate }, U.AO, ORG.A)).status));
await J('invitations.cancel', { id: invLate }, U.LAD, ORG.L);
check('IV30', 'A cancelled invitation cannot be accepted, by link or by id', (await J('invitation.accept', { token: tokLate2 }, U.OTHER, NO_ORG, 'late@example.com')).status === 404 && (await J('invitation.accept_mine', { id: invLate }, U.OTHER, NO_ORG, 'late@example.com', true)).status === 404);

// ---- B. client invitation: client access only, never staff
r = await J('clients.access.invite', { email: 'carla@client.example', client_name: 'Carla Co', person_name: 'Carla' }, U.LAD, ORG.L);
check('IV31', 'An admin invites a client: the client record and the invitation are made and the e-mail goes out (as a client)', r.status === 200 && r.row.ok === true && r.row.email_status === 'sent' && r.row.token === null && sent.at(-1).body.htmlContent.includes('as a client'));
const clientMine = await J('invitations.mine', {}, U.CL, NO_ORG, 'carla@client.example', true);
r = await J('invitation.accept_mine', { id: clientMine.row.id }, U.CL, NO_ORG, 'carla@client.example', true);
const cm = (await db.query("select kind, role, client_id from memberships where user_id = $1", [U.CL])).rows;
check('IV32', 'The client joins as a client of their own client record: no staff role, no app grants', r.status === 200 && cm.length === 1 && cm[0].kind === 'client' && cm[0].role === null && cm[0].client_id && (await db.query('select count(*)::int n from app_grants where user_id = $1', [U.CL])).rows[0].n === 0);
check('IV33', 'A client cannot read staff areas: the team directory and member list are refused or empty', [403, 404].includes((await J('team.list', {}, U.CL, ORG.L, 'carla@client.example')).status) && [403, 404].includes((await J('members.list', {}, U.CL, ORG.L, 'carla@client.example')).status));
check('IV34', 'Admin › Client access shows the client as active, with the e-mail status of the invitation', (await J('clients.access.list', {}, U.LAD, ORG.L)).rows.find((x) => x.email === 'carla@client.example')?.status === 'active');
check('IV35', 'Nobody can join an organization by naming it: there is no organization or role in any join request, and unknown fields are rejected', (await J('invitation.accept_mine', { id: clientMine.row.id, role: 'owner' }, U.CL, NO_ORG, 'carla@client.example', true)).status === 422 && (await J('invitation.accept', { token: 'x', org: ORG.A }, U.CL, NO_ORG, 'carla@client.example')).status === 422);
check('IV36', 'Declining an invitation closes it for good', await (async () => {
  const x = await J('invitation.create', { email: 'decline@example.com', kind: 'staff', role: 'viewer' }, U.LAD, ORG.L);
  const d = await J('invitation.decline_mine', { id: x.row.invitation_id }, U.OTHER, NO_ORG, 'decline@example.com', true);
  return d.status === 200 && (await J('invitation.accept_mine', { id: x.row.invitation_id }, U.OTHER, NO_ORG, 'decline@example.com', true)).status === 404;
})());
check('IV37', 'The browser roles get nothing on the delivery log', (await db.query("select count(*)::int n from information_schema.role_table_grants where table_name = 'invitation_deliveries' and grantee in ('anon','authenticated')")).rows[0].n === 0);
const em = invitationEmail({ link: 'https://x/#/invite?token=<b>', orgName: '<script>', inviterName: 'A & B', kind: 'staff', role: 'admin', email: 'e@x.y' });
check('IV38', 'The e-mail escapes names (no HTML injection through an organization or person name)', !em.html.includes('<script>') && em.html.includes('&lt;script&gt;') && em.html.includes('A &amp; B'));

for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}`);
const pc = results.filter((x) => x.ok).length; console.log(`\n${pc}/${results.length} checks passed`); await db.close(); process.exit(pc === results.length ? 0 : 1);
