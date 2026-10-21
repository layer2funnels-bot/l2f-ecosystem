// Browser end-to-end on the LOCAL stack: real Chromium -> our static app -> our /api routes -> real Supabase Auth and Postgres.
// Needs `npm run stack:start`, `npm run stack:migrate` and Playwright (global install; not a project dependency).
// Local only. Screenshots go to $SHOTS (default ./e2e-shots, git-ignored).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import pg from 'pg';
import { startDevServer } from './dev-server.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright');
const SHOTS = process.env.SHOTS || 'e2e-shots'; mkdirSync(SHOTS, { recursive: true });
const results = []; const check = (id, n, ok, d = '') => results.push({ id, n, ok: !!ok, d });
const admin = new pg.Client({ connectionString: 'postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres' }); await admin.connect();
await admin.query('truncate funnel_references, funnel_brand_kits, funnel_stories, funnel_offers, funnel_avatars');   // clean slate (local database only)
const stamp = Date.now(); const EMAIL = `ui.${stamp}@example.com`, PW = 'correct-horse-battery-staple';

const s = await startDevServer({ port: 0, sink: () => {} });
const base = `http://127.0.0.1:${s.port}`;
const browser = await chromium.launch(process.env.PLAYWRIGHT_BROWSERS_PATH ? {} : {});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const problems = [];
// expected 4xx answers to deliberate bad input are not defects; script errors and CSP violations are
page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/Failed to load resource: the server responded with a status of 4\d\d/.test(m.text())) problems.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
const shot = (n) => page.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true });
const h1 = () => page.locator('h1').first().innerText();
const wait = (t) => page.waitForSelector(`text=${t}`, { timeout: 8000 }).catch(async (e) => { await shot('FAILED'); console.log('--- page text at failure ---\n' + (await page.locator('body').innerText()).slice(0, 600) + '\n--- problems: ' + problems.slice(0, 3).join(' | ')); throw e; });

// ---- auth shell
await page.goto(base + '/'); await wait('Sign in');
check('U1', 'Signed out, the app shows Sign in, in the neutral theme', (await h1()) === 'Sign in' && (await page.getAttribute('html', 'data-theme')) === 'neutral');
await shot('01-signin');
await page.getByText('Create an account').first().click(); await wait('Create your account');
await page.fill('#email', EMAIL); await page.fill('#password', 'short'); await page.click('button[type=submit]');
check('U2', 'A short password is refused in plain words', await page.getByText('at least 12 characters').first().isVisible());
await page.fill('#password', PW); await page.click('button[type=submit]');
await wait("You don't have access to a workspace yet");
check('U3', 'A new account lands on "no workspace yet" with no data', true);
await shot('02-no-org');

const uid = (await admin.query('select id from auth.users where email = $1', [EMAIL])).rows[0].id;
const org = async (slug, name) => (await admin.query('insert into workspaces (slug,name) values ($1,$2) on conflict (slug) do update set name = excluded.name returning id', [slug, name])).rows[0].id;
const L = await org('layer2funnels', 'Layer2Funnels'), A = await org('aurj', 'Aurj');
await admin.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff','owner'),($3,$2,'staff','editor') on conflict do nothing", [L, uid, A]);
await admin.query("insert into workspace_apps (workspace_id,app_key,enabled,launch_url) values ($1,'funnel_mapper_pro',true,'https://example.com/fmp') on conflict (workspace_id, app_key) do update set launch_url = excluded.launch_url", [L]);
await admin.query("insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,'office'),($1,$2,'projects') on conflict do nothing", [A, uid]);

await page.getByText('Check again').click(); await wait('Your apps');
check('U4', 'After an admin adds them, "Check again" shows the Launcher with the organization in the header', (await page.locator('.org-name').innerText()) === 'Layer2Funnels' && (await page.getAttribute('html', 'data-theme')) === 'l2f');
const fmp = page.locator('.tile', { hasText: 'Funnel Mapper Pro' });
check('U5', 'Funnel Mapper Pro is a plain link tile: new tab, noopener, "own sign-in for now"', (await fmp.innerText()).includes('Opens in a new tab · own sign-in for now') && (await fmp.locator('a').getAttribute('target')) === '_blank' && (await fmp.locator('a').getAttribute('rel')).includes('noopener'));
check('U6', 'Apps with no screens yet say so; the "Needs design" marker is visible', (await page.locator('.tile', { hasText: 'Projects' }).innerText()).includes('Not built yet') && await page.locator('.needs-design').first().isVisible());
await shot('03-launcher');

// ---- Office → Funnels
await page.locator('.tile', { hasText: 'Office' }).first().getByText('Open Office').click(); await wait('Open Funnels');
await page.getByText('Open Funnels').click(); await wait('Business records for Layer2Funnels.');
check('U7', 'Funnels home states that records live here and FMP is separate, with its link', (await page.locator('.fmp-note').innerText()).includes('managed here, not there'));
await shot('04-funnels-home');
await page.locator('.appnav a', { hasText: 'Avatars' }).click(); await wait('No avatars yet');
check('U8', 'Empty list is designed on purpose with a create action (owner)', await page.getByText('New avatar').first().isVisible());
await shot('05-avatars-empty');
await page.getByText('New avatar').first().click(); await wait('New avatar');
await page.fill('#r-name', 'Busy founder'); await page.fill('#r-pains', 'No time to follow up'); await page.click('button[type=submit]');
await page.waitForSelector('text=Belongs to:'); 
check('U9', 'Creating an avatar opens its record: Internal, organization-wide', (await page.locator('main').innerText()).includes('Organization-wide') && (await page.locator('main').innerText()).includes('Internal'));
await shot('06-avatar-record');
await page.fill('#r-name', 'Busy founder (edited)'); await page.click('button[type=submit]'); await wait('Saved.');
check('U10', 'Saving shows a confirmation', true);
await page.getByRole('button', { name: 'Archive' }).click(); await wait('This record is archived');
check('U11', 'Archive is reversible and the form turns read-only', (await page.locator('#r-name').getAttribute('readonly')) !== null && await page.getByRole('button', { name: 'Restore' }).isVisible());
await page.getByRole('button', { name: 'Restore' }).click(); await wait('Restored.');
await page.getByRole('link', { name: 'Back to Avatars' }).click(); await wait('Busy founder (edited)');

await page.locator('.appnav a', { hasText: 'Offers' }).click(); await wait('No offers & products yet');
await page.getByText('New offer').first().click(); await wait('New offer');
await page.fill('#r-name', 'Core offer'); await page.fill('#r-price_amount', '497'); await page.click('button[type=submit]');
await wait('Check:');
check('U12', 'A price without a currency is explained by field name, never by database words', /Check: .*(Price|Currency)/.test(await page.locator('.form-msg').innerText()) && !/constraint|violates|funnel_/.test(await page.locator('main').innerText()));
await page.fill('#r-currency', 'USD'); await page.selectOption('#r-avatar_id', { label: 'Busy founder (edited)' }); await page.click('button[type=submit]');
await page.waitForSelector('text=Belongs to:');
check('U13', 'With a currency and a linked avatar the offer is created', true);
await page.locator('.appnav a', { hasText: 'Brand kits' }).click(); await wait('No brand kits yet');
await page.getByText('New brand kit').first().click(); await wait('New brand kit');
await page.fill('#r-name', 'Main'); await page.fill('#r-colors', '#173a8f, red'); await page.click('button[type=submit]'); await wait('Check:');
check('U14', 'A bad colour is reported by field name', (await page.locator('.form-msg').innerText()).includes('Colours'));
await page.fill('#r-colors', '#173a8f, #ff7a59'); await page.click('button[type=submit]'); await page.waitForSelector('text=Belongs to:');

// ---- unknown record = same as denied
await page.goto(`${base}/#/office/funnels/avatars/${'0'.repeat(8)}-0000-4000-8000-${'0'.repeat(12)}`); await wait('Not found');
check('U15', 'A record that does not exist reads "Not found" with no hint about why', (await page.locator('.state.denied').innerText()).includes("We couldn't find that"));
await shot('07-not-found');

// ---- organization switching (UX7)
await page.locator('.appnav a', { hasText: 'Avatars' }).click(); await wait('Busy founder (edited)');
await page.selectOption('#org-switcher', { label: 'Aurj' });
await page.waitForFunction(() => document.querySelector('.org-name')?.textContent === 'Aurj');
await wait('No avatars yet');
check('U16', 'Switching to Aurj keeps the same page (Avatars), changes theme, and shows none of the old organization’s records',
  (await h1()) === 'Avatars' && (await page.getAttribute('html', 'data-theme')) === 'aurj' && !(await page.locator('main').innerText()).includes('Busy founder'));
check('U17', 'It never opened the Launcher', !page.url().includes('launcher'));
await shot('08-aurj-avatars');
await page.selectOption('#org-switcher', { label: 'Layer2Funnels' });
await wait('Busy founder (edited)');
check('U18', 'Switching back restores that organization’s records', (await page.getAttribute('html', 'data-theme')) === 'l2f');

// ---- responsive
await page.setViewportSize({ width: 375, height: 800 }); await page.waitForTimeout(150);
const over = await page.evaluate(() => [document.documentElement.scrollWidth - document.documentElement.clientWidth, ...[...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 6).map((e) => `${e.tagName}.${e.className}:${Math.round(e.getBoundingClientRect().right)}`)]);
check('U19', 'At phone width nothing scrolls sideways', over[0] <= 1, over.join(' '));
await shot('09-mobile'); await page.setViewportSize({ width: 1280, height: 800 });

// ---- sign out, sign in
await page.getByRole('button', { name: 'Sign out' }).click(); await wait('Sign in');
await page.fill('#email', EMAIL); await page.fill('#password', 'wrong-password-wrong'); await page.click('button[type=submit]');
await wait('Email or password is not right.');
check('U20', 'Wrong password gives one plain, non-revealing line', true);
await page.fill('#password', PW); await page.click('button[type=submit]'); await wait('Your apps');
check('U21', 'Signing in again lands on the Launcher', true);

// ---- session expired
await page.evaluate(() => { const k = 'l2f.session.v1'; const s = JSON.parse(localStorage.getItem(k)); s.access = 'x.y.z'; s.refresh = 'bad'; s.expiresAt = Date.now() + 3600e3; localStorage.setItem(k, JSON.stringify(s)); });
await page.reload(); await wait('Your session has ended');
check('U22', 'A dead session shows the "session has ended" screen with a way back', await page.getByRole('link', { name: 'Sign in' }).isVisible());
await shot('10-expired');

// ---- invitation by link, with a second account
const ownerSession = await (async () => {
  const r = await fetch('http://127.0.0.1:54321/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH', 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PW }) });
  return (await r.json()).access_token; })();
const guestEmail = `guest.ui.${stamp}@example.com`;
const inv = await (await fetch(`${base}/api/invitation.create`, { method: 'POST', headers: { authorization: `Bearer ${ownerSession}`, 'x-org-id': L, 'content-type': 'application/json' }, body: JSON.stringify({ email: guestEmail, kind: 'staff', role: 'editor' }) })).json();
const page2 = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
await page2.goto(`${base}/#/invite?token=${inv.data[0].token}`); await page2.waitForSelector('text=You have been invited');
check('U23', 'The invitation link strips its token from the address bar immediately', !page2.url().includes(inv.data[0].token));
await page2.getByRole('link', { name: 'Create an account' }).click(); await page2.waitForSelector('text=same email address your invitation');
await page2.fill('#email', guestEmail); await page2.fill('#password', PW); await page2.click('button[type=submit]');
await page2.waitForSelector('text=Your apps');
check('U24', 'Sign-up with the invited email joins the organization automatically', (await page2.locator('.org-name').innerText()) === 'Layer2Funnels');
await page2.screenshot({ path: `${SHOTS}/11-invited.png` });

check('U25', 'No script errors, warnings or CSP violations during the whole run (deliberate 4xx answers excluded)', problems.length === 0, problems.slice(0, 5).join(' | '));
await browser.close(); await s.close(); await admin.end();
for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(4)} ${x.n}${x.ok ? '' : `  [${x.d}]`}`);
const p = results.filter((x) => x.ok).length; console.log(`\n${p}/${results.length} checks passed`); process.exit(p === results.length ? 0 : 1);
