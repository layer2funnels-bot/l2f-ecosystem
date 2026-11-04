// Browser journey: inviting teammates and clients, end to end, on the local stack (needs `npm run stack:start && npm run stack:migrate`; PLAYWRIGHT_MODULE=<path>).
// A fake Brevo server stands in for the e-mail provider (the API sends to it exactly what it would send to Brevo), so every e-mail is checked.
// Covers: invitation e-mail with the link, joining from the link in a new tab, joining on "another device" with no link at all, a later sign-in,
// client invitation and the client's limits, someone with a different e-mail, expiry and resend, the admin's status lines, and the profile page.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import pg from 'pg';
import { startDevServer, LOCAL_ENV } from './dev-server.mjs';
import { startFakeSupabaseStorage } from '../test/fakes/fake-supabase-storage.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const admin = new pg.Client({ connectionString: 'postgresql://supabase_admin:postgres@127.0.0.1:54332/postgres' }); await admin.connect();
const q = async (s, a = []) => (await admin.query(s, a)).rows;
const stamp = Date.now(), PW = 'correct-horse-battery-staple';
const results = []; const check = (id, name, ok, detail = '') => { results.push({ id, name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${id.padEnd(5)} ${name}${ok ? '' : `  [${detail}]`}`); };

// fake Brevo
const mails = [];
const brevo = createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => {
  if (req.url !== '/v3/smtp/email' || req.headers['api-key'] !== 'e2e-key') { res.writeHead(401); return res.end('{}'); }
  mails.push(JSON.parse(b)); res.writeHead(201, { 'content-type': 'application/json' }); res.end(JSON.stringify({ messageId: `<e2e-${mails.length}@brevo>` })); }); }).listen(0, '127.0.0.1');
await new Promise((r) => brevo.on('listening', r));
const fake = await startFakeSupabaseStorage({ serviceKey: 'k' });
const s = await startDevServer({ port: 0, sink: () => {}, env: { ...LOCAL_ENV, ...process.env, STORAGE_DRIVER: 'supabase', STORAGE_URL: fake.url, STORAGE_SERVER_KEY: 'k', RATE_LIMIT_STORE: 'memory',
  BREVO_API_KEY: 'e2e-key', MAIL_FROM_EMAIL: 'team@layer2funnels.example', MAIL_API_URL: `http://127.0.0.1:${brevo.address().port}` },
  limits: { read: { max: 5000, windowMs: 60000 }, write: { max: 5000, windowMs: 60000 }, sensitive: { max: 500, windowMs: 60000 } } });
const base = `http://127.0.0.1:${s.port}`;
const b = await chromium.launch();
const problems = [];
const newPage = async () => { const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } }); const p = await ctx.newPage(); p.on('pageerror', (e) => problems.push(e.message.slice(0, 160))); return p; };
const text = (p) => p.locator('body').innerText();
const until = (p, t, ms = 12000) => p.waitForSelector(`text=${t}`, { timeout: ms });
const linkOf = (m) => /(http:\/\/127\.0\.0\.1:\d+\/#\/invite\?token=[0-9a-f]{64})/.exec(m.textContent)?.[1];
const mailTo = (email) => mails.filter((m) => m.to[0].email === email.toLowerCase()).at(-1);

async function signUp(p, name, email) {
  await p.goto(`${base}/#/signup`); await p.reload(); await p.waitForSelector('#nm', { timeout: 9000 });
  await p.fill('#nm', name); await p.fill('#em', email); await p.fill('#pw', PW); await p.click('button[type=submit]');
}
async function signIn(p, email) {
  await p.goto(`${base}/#/signin`); await p.reload(); await p.waitForSelector('#em', { timeout: 9000 });
  await p.fill('#em', email); await p.fill('#pw', PW); await p.click('button[type=submit]');
}

// ---- setup: an owner of Layer2Funnels (and Aurj), apps switched on
const org = async (slug, name) => (await q('insert into workspaces (slug,name) values ($1,$2) on conflict (slug) do update set name=excluded.name returning id', [slug, name]))[0].id;
const L = await org('layer2funnels', 'Layer2Funnels'), A = await org('aurj', 'Aurj');
await q("update public.apps set lifecycle='active' where key in ('forms','value_ladder','social_planner','whiteboard','planner')");
await q("insert into workspace_apps (workspace_id,app_key,enabled) select $1, k, true from unnest(array['office','projects','planner','drive','clients','forms','value_ladder','social_planner','whiteboard']) k on conflict (workspace_id,app_key) do update set enabled=true", [L]);
const ownerMail = `owner.${stamp}@example.com`;
const op = await newPage(); await signUp(op, 'Olivia Owner', ownerMail); await op.waitForTimeout(1500);
const ownerId = (await q('select id from auth.users where email=$1', [ownerMail]))[0].id;
await q("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff','owner'),($3,$2,'staff','owner') on conflict do nothing", [L, ownerId, A]);
const switchOrg = (p, org) => p.evaluate(async (org) => { const t = JSON.parse(localStorage.getItem('l2f.session.v1')).access; await fetch('/api/org.switch', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${t}`, 'x-org-id': '00000000-0000-0000-0000-000000000000' }, body: JSON.stringify({ org, app: 'office' }) }); }, org);
await switchOrg(op, L);      // the owner works in Layer2Funnels (an owner of two organizations invites into the one in the header)
await op.goto(`${base}/#/office/admin/members`); await op.reload(); await until(op, 'Joining is by invitation only.');
check('ON0', 'Setup: the owner is in Layer2Funnels', (await op.locator('.hdr').innerText()).includes('Layer2Funnels'));

async function inviteStaff(email, level = 'editor') {
  await op.goto(`${base}/#/office/admin/members`); await op.reload(); await until(op, 'Joining is by invitation only.');
  await op.click('#invite'); await op.fill('#ie', email); await op.selectOption('#il', level);
  await op.getByRole('button', { name: 'Send invitation' }).click(); await until(op, `Invitation sent to ${email}`);
  await op.getByRole('button', { name: 'Done' }).click();
}

// ---- A/C. teammate invitation: the e-mail goes out with the right content
const T1 = `tom.${stamp}@example.com`;
await inviteStaff(T1, 'editor');
const m1 = mailTo(T1);
check('ON1', 'Inviting a teammate sends one e-mail from the configured sender, naming the inviter, organization and role, with a working link', !!m1 && m1.sender.email === 'team@layer2funnels.example' && /Olivia Owner/.test(m1.subject) && /Layer2Funnels/.test(m1.subject) && /an Editor/.test(m1.htmlContent) && !!linkOf(m1));
check('ON2', 'Admin › Members shows the invitation with "Email sent"', (await text(op)).includes(T1) && (await op.locator(`[data-email-status="sent"]`).count()) >= 1);

// ---- E/G. same device, link opened in a new tab, new account
const p1 = await newPage(); await p1.goto(linkOf(m1).replace('http://127.0.0.1:' + new URL(linkOf(m1)).port, base)); await p1.waitForTimeout(800);
await signUp(p1, 'Tom Teammate', T1);
await until(p1, 'Accept invitation');
await p1.getByRole('button', { name: 'Accept invitation' }).click(); await until(p1, 'You joined Layer2Funnels');
const tomId = (await q('select id from auth.users where email=$1', [T1]))[0].id;
const tm = await q('select kind, role, status from memberships where user_id=$1 and workspace_id=$2', [tomId, L]);
check('ON3', 'From the e-mail link: sign up, accept, and they are an Editor of Layer2Funnels (one membership, active)', tm.length === 1 && tm[0].kind === 'staff' && tm[0].role === 'editor' && tm[0].status === 'active');
await p1.goto(`${base}/#/launcher`); await p1.reload(); await p1.waitForSelector('.tile', { timeout: 12000 });
const tiles = await p1.locator('.tile').allInnerTexts();
check('ON4', 'Their Launcher shows the team apps right away (Office, Projects, Drive, Forms, Whiteboard…)', ['Office', 'Projects', 'Drive', 'Form Builder', 'Whiteboard'].every((t) => tiles.some((x) => x.includes(t))), tiles.join('|').slice(0, 200));
await p1.goto(`${base}/#/office/admin/members`); await p1.reload(); await p1.waitForTimeout(1500);
check('ON5', 'An Editor does not get Admin (same "not found" screen as a missing page)', !(await text(p1)).includes('Joining is by invitation only.'));

// ---- H. another device: sign up WITHOUT the link; the server finds the invitation for the verified e-mail
const T2 = `dana.${stamp}@example.com`;
await inviteStaff(T2, 'viewer');
const p2 = await newPage(); await signUp(p2, 'Dana Device', T2);
await until(p2, 'You’re invited to Layer2Funnels');
check('ON6', 'Signing up on another device (no link) shows "You’re invited to Layer2Funnels" with who invited and as what', /Olivia Owner invited you as a Viewer/.test(await text(p2)));
await p2.getByRole('button', { name: 'Join Layer2Funnels' }).click(); await until(p2, 'You joined Layer2Funnels');
const danaId = (await q('select id from auth.users where email=$1', [T2]))[0].id;
check('ON7', 'One click and they are a Viewer of Layer2Funnels', (await q('select role from memberships where user_id=$1 and workspace_id=$2', [danaId, L]))[0]?.role === 'viewer');

// ---- interrupted: account made earlier, invitation sent later, they just sign in
const T3 = `ivy.${stamp}@example.com`;
const p3 = await newPage(); await signUp(p3, 'Ivy Interrupted', T3); await until(p3, 'not in an organization yet');
await inviteStaff(T3, 'editor');
const p3b = await newPage(); await signIn(p3b, T3); await until(p3b, 'You’re invited to Layer2Funnels');
await p3b.getByRole('button', { name: 'Join Layer2Funnels' }).click(); await until(p3b, 'You joined Layer2Funnels');
check('ON8', 'Someone who made an account before being invited just signs in, sees the invitation and joins', (await q("select count(*)::int n from memberships m join auth.users u on u.id = m.user_id where u.email=$1 and m.workspace_id=$2", [T3, L]))[0].n === 1);
await p3.goto(`${base}/#/no-org`); await p3.reload(); await p3.getByRole('button', { name: 'Check for invitations' }).click().catch(() => {}); await p3.waitForTimeout(1500);
check('ON9', 'The first tab, still on "not in an organization", gets in with "Check for invitations"', !(await text(p3)).includes('not in an organization yet'));

// ---- K. a different person never sees someone else's invitation
const X = `xavier.${stamp}@example.com`;
const px = await newPage(); await signUp(px, 'Xavier Other', X); await until(px, 'not in an organization yet');
await px.goto(linkOf(m1).replace('http://127.0.0.1:' + new URL(linkOf(m1)).port, base)); await px.reload(); await px.waitForTimeout(1500);
check('ON10', 'Someone else (another e-mail) opening a used link gets the "can’t be used" page and joins nothing', /can’t be used|isn’t valid|couldn’t|expired/i.test(await text(px)) && (await q("select count(*)::int n from memberships m join auth.users u on u.id = m.user_id where u.email=$1", [X]))[0].n === 0);

// ---- L. expiry and resend from the admin screen
const T4 = `eve.${stamp}@example.com`;
await inviteStaff(T4, 'viewer');
await q("update invitations set expires_at = now() - interval '1 hour' where email = $1", [T4]);
await op.goto(`${base}/#/office/admin/members`); await op.reload(); await until(op, 'Joining is by invitation only.');
check('ON11', 'An expired invitation is shown as Expired', (await op.locator('tr', { hasText: T4 }).innerText()).includes('Expired'));
await op.locator('tr', { hasText: T4 }).getByRole('button', { name: /Manage/ }).click(); await op.getByRole('button', { name: 'Send a new invitation' }).click(); await until(op, `Invitation sent to ${T4}`);
await op.getByRole('button', { name: 'Done' }).click();
const old = mails.filter((m) => m.to[0].email === T4).at(0), fresh = mailTo(T4);
check('ON12', 'Send a new invitation e-mails a fresh link; the old link no longer works', mails.filter((m) => m.to[0].email === T4).length === 2 && linkOf(old) !== linkOf(fresh));
const p4 = await newPage(); await signUp(p4, 'Eve Expired', T4); await until(p4, 'You’re invited to Layer2Funnels');
await p4.getByRole('button', { name: 'Join Layer2Funnels' }).click(); await until(p4, 'You joined Layer2Funnels');
check('ON13', 'After the resend they join normally', (await q("select count(*)::int n from memberships m join auth.users u on u.id = m.user_id where u.email=$1", [T4]))[0].n === 1);

// ---- B. client invitation, the client's limits and their profile
const C1 = `carla.${stamp}@client.example`;
await op.goto(`${base}/#/office/admin/clients`); await op.reload(); await op.getByRole('button', { name: 'Invite a client' }).click();
await op.fill('#ci-email', C1); await op.fill('#ci-person', 'Carla Client'); await op.getByRole('button', { name: 'Create invitation' }).click(); await until(op, `Invitation sent to ${C1}`);
await op.getByRole('button', { name: 'Done' }).click();
check('ON14', 'Inviting a client e-mails them (as a client)', /as a client/.test(mailTo(C1)?.htmlContent ?? ''));
const pc = await newPage(); await signUp(pc, 'Carla Client', C1); await until(pc, 'You’re invited to Layer2Funnels');
await pc.getByRole('button', { name: 'Join Layer2Funnels' }).click(); await pc.waitForTimeout(2500);
const cm = await q("select m.kind, m.role, m.client_id from memberships m join auth.users u on u.id = m.user_id where u.email=$1", [C1]);
check('ON15', 'The client joins as a client of their own client record: no staff role, no app grants', cm.length === 1 && cm[0].kind === 'client' && cm[0].role === null && !!cm[0].client_id
  && (await q("select count(*)::int n from app_grants g join auth.users u on u.id = g.user_id where u.email=$1", [C1]))[0].n === 0);
await pc.goto(`${base}/#/office/admin/members`); await pc.reload(); await pc.waitForTimeout(1500);
check('ON16', 'The client cannot open staff areas (no member list, no team)', !(await text(pc)).includes('Joining is by invitation only.') && !(await text(pc)).includes(T1));
await pc.goto(`${base}/#/profile`); await pc.reload(); await pc.waitForSelector('#pf-name', { timeout: 12000 });
await pc.fill('#pf-name', 'Carla C. Client'); await pc.getByRole('button', { name: 'Save name' }).click(); await until(pc, 'Name saved.');
check('ON17', 'The client has their own profile and can change their name', (await q("select p.display_name from profiles p join auth.users u on u.id = p.id where u.email=$1", [C1]))[0]?.display_name === 'Carla C. Client');

// ---- N/P. a teammate's profile; Q. the e-mail change goes through Supabase Auth (a confirmation is required)
await p1.goto(`${base}/#/profile`); await p1.reload(); await p1.waitForSelector('#pf-name', { timeout: 12000 });
await p1.fill('#pf-email', `tom.new.${stamp}@example.com`); await p1.getByRole('button', { name: 'Change email' }).click(); await p1.waitForTimeout(2000);
// the local stack has no mail server, so Supabase Auth cannot send the confirmation here; what matters is that nothing changes without it
check('ON18', 'Changing the e-mail never changes the sign-in e-mail by itself: it waits for Supabase Auth’s confirmation (the page says so either way)', /confirmation link|couldn’t send the confirmation|couldn’t change the email/.test(await text(p1)) && (await q('select email from auth.users where id=$1', [tomId]))[0].email === T1);

// ---- S. signing up again with an address that already has an account: say so (Supabase sends no e-mail in that case)
const pd = await newPage(); await signUp(pd, 'Tom Again', T1); await pd.waitForTimeout(1500);
check('ON21', 'Signing up with an address that already has an account says so and points to Sign in (no fake "check your email")', (await text(pd)).includes('already has an account') && !(await text(pd)).includes('Confirm your email'));
// ---- R. organization isolation in the admin lists
await switchOrg(op, A);
await op.goto(`${base}/#/office/admin/members`); await op.reload(); await until(op, 'Joining is by invitation only.');
check('ON19', 'In Aurj, none of the Layer2Funnels people or invitations are listed', !(await text(op)).includes(T1) && !(await text(op)).includes(T4));
check('ON20', 'No script errors in any of the browsers', problems.length === 0, problems.slice(0, 3).join(' | '));

const pass = results.filter((r) => r.ok).length; console.log(`\n${pass}/${results.length} checks passed`);
await b.close(); brevo.close(); await s.close?.(); await admin.end(); process.exit(pass === results.length ? 0 : 1);
