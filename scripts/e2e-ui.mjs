// Browser end-to-end on the LOCAL stack: real Chromium -> our static app -> our /api routes -> real Supabase Auth and Postgres.
// Covers the screens built to the approved designs 01 to 07: auth (8 screens), Launcher, Office Home, Admin (Members, Access), Funnels, the six
// organization-switch outcomes, unsaved changes, scoped buttons, shared states; at phone (390), tablet (768) and desktop (1280) widths, with the
// keyboard only, and with reduced motion. Needs `npm run stack:migrate` and Playwright (global install; not a project dependency).
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
await admin.query('truncate value_ladder_rungs, funnel_references, funnel_brand_kits, funnel_stories, funnel_offers, funnel_avatars');   // clean slate (local database only)
const stamp = Date.now(); const EMAIL = `ui.${stamp}@example.com`, PW = 'correct-horse-battery-staple'; const NAME = 'Una Owner';
const GUEST = `guest.ui.${stamp}@example.com`, OUTSIDER = `outsider.ui.${stamp}@example.com`;

// every page load is several API calls; the browser run loads many pages as one person, so it gets room above the production limits (the limits themselves are tested in api.test)
const s = await startDevServer({ port: 0, sink: () => {}, limits: { read: { max: 2000, windowMs: 60_000 }, write: { max: 500, windowMs: 60_000 }, sensitive: { max: 100, windowMs: 60_000 } } });
const base = `http://127.0.0.1:${s.port}`;
const browser = await chromium.launch();
const problems = []; const net = [];
const watch = (p) => {
  // expected 4xx answers to deliberate bad input are not defects; script errors and CSP violations are
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/Failed to load resource: (the server responded with a status of 4\d\d|net::ERR_FAILED)/.test(m.text())) problems.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
  p.on('response', (r) => { if (r.status() >= 400 && r.url().includes('/api/')) net.push(`${r.status()} ${r.url().split('/api/')[1]}`); });
  p.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  return p;
};
const newPage = async (w = 1280, h = 800, opts = {}) => watch(await (await browser.newContext({ viewport: { width: w, height: h }, ...opts })).newPage());
const page = await newPage();
page.route('https://example.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Funnel Mapper Pro (stub)</h1>' }));
const shot = (p, n) => p.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true });
const h1 = (p = page) => p.locator('h1').first().innerText();
const wait = (t, p = page) => p.waitForSelector(`text=${t}`, { timeout: 9000 }).catch(async (e) => { await shot(p, 'FAILED'); console.log(`--- waiting for "${t}"; page text ---\n` + (await p.locator('body').innerText()).slice(0, 700) + '\n--- problems: ' + problems.slice(0, 3).join(' | ') + '\n--- api errors: ' + net.slice(-6).join(' | ')); throw e; });
const toastText = (p = page) => p.locator('.toast[data-show=true]').innerText();
const theme = (p = page) => p.getAttribute('html', 'data-theme');
const inMenu = async (p, name) => { await p.click('#org-switcher'); await p.locator('#org-menu .opt', { hasText: name }).click(); };
// a hash-only change does not reload; visit() always shows the screen fresh
const visit = async (p, url) => { await p.goto(url); await p.reload(); };
const q = async (sql, args = []) => (await admin.query(sql, args)).rows;

// ---- a screen must not scroll sideways, and every control must be at least 44px (design 10)
async function layout(p, label) {
  const r = await p.evaluate(() => {
    const out = { over: document.documentElement.scrollWidth - document.documentElement.clientWidth, small: [] };
    for (const e of document.querySelectorAll('button, a[href], select, input:not([type=hidden]), textarea, [role=tab]')) {
      if (e.closest('.sr, .skip, .search, .chk, .toast') || e.matches('input[type=checkbox]')) continue;
      const b = e.getBoundingClientRect(); if (!b.width || !b.height) continue;
      const st = getComputedStyle(e); if (st.visibility === 'hidden' || st.display === 'none' || e.closest('[hidden], .menu[data-open=false]')) continue;
      if (b.height < 43.5 || b.width < 43.5) out.small.push(`${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]}:"${(e.innerText || e.getAttribute('aria-label') || '').trim().slice(0, 20)}" ${Math.round(b.width)}x${Math.round(b.height)}`);
    }
    return out;
  });
  return { ok: r.over <= 1 && r.small.length === 0, d: `${label}: overflow ${r.over}px; small: ${r.small.slice(0, 4).join(' | ')}` };
}
async function layouts(p, label) { const a = await layout(p, label); if (!a.ok) console.log('  layout:', a.d); return a.ok; }

// =============================================================== A. Auth screens (design 02)
await visit(page, base + '/'); await wait('Sign in');
check('U1', 'Signed out: Sign in is shown in the Layer2Funnels theme, with the Google note and the invitation reminder', (await h1()) === 'Sign in' && (await theme()) === 'l2f' && await page.getByText('Membership is by invitation').isVisible());
await shot(page, 'a1-signin');
await page.click('button[type=submit]');
const e1 = await page.locator('#em-e').innerText();
await page.fill('#em', 'a@b.co'); await page.click('button[type=submit]');
check('U2', 'Empty sign-in explains each field in plain words and moves focus to it', e1.includes('Enter your email') && (await page.locator('#pw-e').innerText()).includes('Enter your password') && await page.evaluate(() => document.activeElement.id) === 'pw');
await page.fill('#pw', 'abc'); await page.getByRole('button', { name: 'Show password' }).click();
check('U3', 'Show password toggles the field and its label state', (await page.getAttribute('#pw', 'type')) === 'text' && (await page.getByRole('button', { name: 'Hide password' }).getAttribute('aria-pressed')) === 'true');
await page.fill('#em', 'nobody@example.com'); await page.fill('#pw', 'wrong-password-wrong'); await page.click('button[type=submit]'); await wait('That email and password don’t match.');
check('U4', 'A wrong password gives one plain line that does not reveal whether the email exists', true);
await page.getByRole('button', { name: 'Forgot password?' }).click(); await wait('Reset your password');
// the view swaps its form just after the heading shows; fill again if the swap ate the first fill (slow runners)
await page.fill('#em', 'nobody@example.com'); await page.waitForTimeout(250); if ((await page.inputValue('#em')) !== 'nobody@example.com') await page.fill('#em', 'nobody@example.com'); await page.click('button[type=submit]'); await wait('Check your email');
check('U5', 'Reset shows the same "check your email" answer for any address, with a 30 second resend wait', (await page.locator('main').innerText()).includes('If an account exists for') && (await page.getByRole('button', { name: /Resend email in \d+s/ }).getAttribute('aria-disabled')) === 'true');
await shot(page, 'a2-check-email');
await page.getByRole('button', { name: 'Use a different email' }).click(); await wait('Reset your password');
await page.getByRole('button', { name: 'Back to sign in' }).click(); await wait('Sign in');
await page.getByRole('button', { name: 'Create an account' }).click(); await wait('Create your account');
await page.fill('#nm', NAME); await page.fill('#em', EMAIL); await page.fill('#pw', 'short'); await page.click('button[type=submit]');
check('U6', 'A short password is refused with the design wording (10 characters)', (await page.locator('#pw-e').innerText()).includes('Use at least 10 characters.'));
await page.fill('#pw', PW); await page.click('button[type=submit]');
await wait('You’re signed in, but not in an organization yet');
check('U7', 'A new account lands on "not in an organization yet", showing the email and three next steps, and no data', (await page.locator('main').innerText()).includes(EMAIL) && (await page.locator('ol li').count()) === 3);
await shot(page, 'a3-no-org');
await page.getByRole('button', { name: 'Check for invitations' }).click(); await wait('No invitations yet. We checked just now.');
check('U8', '"Check for invitations" says plainly when there is nothing yet', true);

// ---- an admin adds the person (database, as the real invite flow will do)
const uid = (await q('select id from auth.users where email = $1', [EMAIL]))[0].id;
const org = async (slug, name) => (await q('insert into workspaces (slug,name) values ($1,$2) on conflict (slug) do update set name = excluded.name returning id', [slug, name]))[0].id;
const L = await org('layer2funnels', 'Layer2Funnels'), A = await org('aurj', 'Aurj');
// leftovers of earlier runs (people, invitations, access rows) would change the counts: clear them first (local database only; triggers off for this one clean-up)
await admin.query('set session_replication_role = replica');
for (const t of ['invitations', 'access_assignments', 'permission_overrides', 'group_members', 'app_grants', 'memberships']) await admin.query(`delete from ${t} where workspace_id = any($1)`, [[L, A]]);
await admin.query('delete from access_levels where workspace_id = any($1) and not is_template', [[L, A]]);
await admin.query('set session_replication_role = origin');
await q("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff','owner'),($3,$2,'staff','editor') on conflict do nothing", [L, uid, A]);
await q("insert into workspace_apps (workspace_id,app_key,enabled,launch_url) values ($1,'funnel_mapper_pro',true,'https://example.com/fmp'),($1,'drive',true,null),($1,'projects',true,null) on conflict (workspace_id, app_key) do update set enabled = true, launch_url = excluded.launch_url", [L]);
await q("insert into workspace_apps (workspace_id,app_key,enabled) values ($1,'projects',true) on conflict (workspace_id, app_key) do update set enabled = true", [A]);
await q("insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,'office'),($1,$2,'projects') on conflict do nothing", [A, uid]);
const C1 = (await q('insert into clients (workspace_id,name) values ($1,$2) returning id', [L, `Harry Kaye PT ${stamp}`]))[0].id;
const C2 = (await q('insert into clients (workspace_id,name) values ($1,$2) returning id', [L, `Victor Audit ${stamp}`]))[0].id;
await q('insert into clients (workspace_id,name,archived_at) values ($1,$2,now())', [L, `Archived Client ${stamp}`]);
await page.getByRole('button', { name: 'Check for invitations' }).click(); await wait('Your apps in Layer2Funnels');

// =============================================================== B. Launcher (design 03)
check('U9', 'After an admin adds them, "Check for invitations" opens the Launcher in the organization theme with the switcher showing it', (await theme()) === 'l2f' && (await page.locator('#org-switcher strong').innerText()) === 'Layer2Funnels' && (await page.locator('.bar4').count()) === 1);
const tile = (k) => page.locator(`.tile[data-app=${k}]`);
const keys = await page.locator('.tile').evaluateAll((els) => els.map((e) => e.dataset.app));
check('U10', 'Owner sees the twelve apps in the designed order, Funnel Mapper Pro among them as a normal tile', keys.join() === 'office,projects,clients,portal,drive,planner,forms,value_ladder,social_planner,whiteboard,layer2_agents,funnel_mapper_pro', keys.join());
const state = async (k) => (await tile(k).getAttribute('class')).split(' ')[1];
check('U11', 'Tile states come from the real catalog: Client Portal locked, five apps coming soon', (await state('portal')) === 'locked' && (await tile('portal').innerText()).includes('Locked') && (await state('forms')) === 'soon' && (await tile('layer2_agents').innerText()).includes('Coming soon') && (await state('office')) === 'ok');
await shot(page, 'b1-launcher');
// keyboard: open a dialog from a tile, focus stays inside, Esc closes and focus returns to the tile
await tile('portal').focus(); await page.keyboard.press('Enter'); await wait('Client Portal is locked');
await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
const trapped = await page.evaluate(() => !!document.activeElement.closest('.dlg'));
await page.keyboard.press('Escape');
check('U12', 'Dialogs trap focus, close with Esc and return focus to the tile that opened them', trapped && !(await page.locator('.dlg').count()) && (await page.evaluate(() => document.activeElement.dataset.app)) === 'portal');
await tile('layer2_agents').click(); await wait('Layer 2 Agents: coming soon'); await page.getByRole('button', { name: 'Got it' }).click();
await tile('funnel_mapper_pro').click(); await wait('Funnel Mapper Pro (stub)');
check('U13', 'Funnel Mapper Pro opens in the same tab (a regular app of the ecosystem)', page.url().startsWith('https://example.com/fmp') && page.context().pages().length === 1);
await page.goBack(); await page.reload(); await wait('Your apps in Layer2Funnels');

// =============================================================== C. Office Home (design 04)
await tile('office').click(); await wait('Needs your attention'); await wait('Nothing assigned to you.'); await wait('0 invitations waiting');   // the cards fill in after their data loads
check('U14', 'Office Home: the eight section menu, Home current, designed empty states, owner/admin card with waiting invitations', (await page.locator('nav.nav a').allInnerTexts()).join() === 'Home,Planner,Projects,Funnels,Documents,Team,Apps,Admin' && (await page.locator('nav.nav a[aria-current=page]').innerText()) === 'Home'
  && (await page.locator('main').innerText()).includes('Nothing assigned to you.') && await page.getByText('For owners and admins').isVisible() && await page.getByText('0 invitations waiting').isVisible());
await shot(page, 'c1-home');
const hp = (await q("insert into projects (workspace_id,name) values ($1,'Quiz funnel rebuild') returning id", [L]))[0].id;
await q("insert into project_tasks (workspace_id,project_id,title,assignee_id,due_on) values ($1,$2,'Edit quiz emails',$3,current_date + 3),($1,$2,'Late task',$3,current_date - 2)", [L, hp, uid]);
await q("insert into planner_reviews (workspace_id,title,due_on) values ($1,'Q4 review', current_date + 2)", [L]);
await visit(page, base + '/#/office'); await wait('Edit quiz emails');
check('U14b', 'Office Home fills "My work", "Deadlines" and the review notice from Projects and Planner (overdue task flagged, project name shown, review coming up)', (await page.locator('main').innerText()).includes('Quiz funnel rebuild') && (await page.locator('main').innerText()).includes('Overdue') && await page.getByText('Coming up:').isVisible() && !(await page.locator('main').innerText()).includes('Nothing assigned to you.'));

await page.locator('nav.nav a', { hasText: 'Planner' }).click(); await wait('Planner isn’t built yet');
check('U15', 'A section whose screens are not built yet says so honestly instead of showing a fake page', (await page.locator('main').innerText()).includes('Go to Office Home'));
await visit(page, base + '/#/office/nope'); await wait('We couldn’t find that');
const lost = await page.locator('main').innerText();
await visit(page, base + `/#/office/funnels/avatars/00000000-0000-4000-8000-000000000000`); await wait('We couldn’t find that');
check('U16', 'A missing page and a missing record show the same "We couldn’t find that" screen, with a safe way back', lost.includes('It may have moved, or you may not have access.') && (await page.locator('main').innerText()).includes('Back to Funnels'));

// =============================================================== D. Funnels (design 06)
await visit(page, base + '/#/office/funnels'); await wait('Recently changed');
check('U17', 'Funnels home: four counts, the section pills, and the "Link design pending" note for funnel maps', (await page.locator('.tile2').count()) === 4 && await page.getByText('Link design pending').isVisible());
await page.locator('.subnav a', { hasText: 'Avatars' }).click(); await wait('No avatars yet');
check('U18', 'First-use empty list has the plate illustration, a create action for owners', await page.getByRole('link', { name: 'New avatar' }).first().isVisible() && (await page.locator('.empty svg').count()) > 0);
await page.getByRole('link', { name: 'New avatar' }).first().click(); await wait('New avatar'); await page.waitForSelector('#r-client');
const scope = await page.locator('#r-client option').allInnerTexts();
check('U19', '"Belongs to" offers the organization and live clients only (never archived ones)', scope.includes('Organization-wide') && scope.some((o) => o.startsWith('Harry Kaye')) && !scope.some((o) => o.startsWith('Archived')));
await page.click('button[type=submit]');
check('U20', 'Saving without a name is explained next to the field', (await page.locator('#r-name-e').innerText()).includes('Give it a name'));
await page.fill('#r-name', 'Busy coach, 35–45'); await page.fill('#r-pains', 'No time to follow up'); await page.selectOption('#r-client', { label: `Harry Kaye PT ${stamp}` });
await page.click('button[type=submit]'); await wait('Not filled in yet.');
check('U21', 'Creating an avatar opens its record page with sections, the client it belongs to, and the owner’s buttons', (await h1()) === 'Busy coach, 35–45' && await page.locator('#edit').isVisible() && await page.locator('#share').isVisible() && await page.locator('#archive').isVisible() && (await page.locator('main').innerText()).includes('No time to follow up'));
await shot(page, 'd1-record');
// edit, leave with unsaved changes
await page.click('#edit'); await page.waitForSelector('#r-name');
await page.fill('#r-name', 'Busy coach (edited)');
check('U22', 'The edit form shows "Unsaved changes" as soon as something changes', (await page.locator('#ds').innerText()) === 'Unsaved changes');
await page.locator('nav.nav a', { hasText: 'Home' }).click(); await wait('You have unsaved changes');
await page.getByRole('button', { name: 'Keep editing' }).click();
check('U23', 'Leaving with unsaved changes asks first, and "Keep editing" keeps the text and the page', (await page.inputValue('#r-name')) === 'Busy coach (edited)' && page.url().includes('/funnels/avatars/'));
await page.locator('nav.nav a', { hasText: 'Home' }).click(); await wait('You have unsaved changes'); await page.getByRole('button', { name: 'Save and leave' }).click(); await wait('Needs your attention');
check('U24', '"Save and leave" saves the change, then goes', (await q('select name from funnel_avatars where workspace_id = $1', [L]))[0].name === 'Busy coach (edited)');
// share / unshare / archive / restore / delete
await visit(page, base + '/#/office/funnels/avatars'); await wait('Busy coach (edited)'); await page.getByRole('link', { name: 'Open Busy coach (edited)' }).click(); await page.waitForSelector('#share');
await page.click('#share'); await wait('The Client Portal is locked for now.'); await page.getByRole('button', { name: 'Share', exact: true }).click(); await wait('Stop sharing');
check('U25', 'Share with client saves the choice, says the Portal is locked, and lists the client with "Stop sharing"', (await q('select client_visible from funnel_avatars where workspace_id = $1', [L]))[0].client_visible === true && (await toastText()).startsWith('Shared with Harry'));
await page.getByRole('button', { name: /Stop sharing/ }).click(); await page.getByRole('button', { name: 'Stop sharing', exact: true }).last().click(); await wait('Not shared yet.');
await page.click('#archive'); await wait('Archive “Busy coach (edited)”?'); await page.getByRole('button', { name: 'Archive', exact: true }).last().click(); await wait('This avatar is archived.');
check('U26', 'Archive names what it does, and an archived record shows the banner with Restore and Delete permanently (owner)', await page.locator('#restore').isVisible() && await page.locator('#delete').isVisible() && (await page.locator('#edit').count()) === 0);
await page.click('#delete'); await wait('This can’t be undone.');
await page.fill('#cf', 'wrong name'); await page.getByRole('button', { name: 'Delete permanently' }).last().click();
check('U27', 'Permanent delete needs the exact name typed first', (await page.locator('#cf-e').innerText()).includes('doesn’t match') && (await q('select count(*)::int n from funnel_avatars where workspace_id = $1', [L]))[0].n === 1);
await page.fill('#cf', 'Busy coach (edited)'); await page.getByRole('button', { name: 'Delete permanently' }).last().click(); await wait('No avatars yet');
check('U28', 'Typing the name deletes it for good and returns to the list', (await q('select count(*)::int n from funnel_avatars where workspace_id = $1', [L]))[0].n === 0);
// records used by later steps: one per client, one organization-wide
await q("insert into funnel_avatars (workspace_id, name, client_id) values ($1,'Avatar for C1',$2),($1,'Avatar for C2',$3),($1,'Organization avatar',null)", [L, C1, C2]);
await q("insert into funnel_avatars (workspace_id, name, client_id, archived_at) values ($1,'Old avatar',null,now())", [L]);
await visit(page, base + '/#/office/funnels/avatars'); await wait('Avatar for C1');
await page.selectOption('#fl', 'archived'); await wait('Old avatar'); await page.selectOption('#fl', 'all'); await wait('Avatar for C1');
await page.fill('#q', 'victor'); await page.waitForTimeout(100);
check('U29', 'The Show filter (Active, Archived, All) and the search box work; a search with no result says so', (await page.locator('tbody tr').count()) === 0 && await page.getByText('No matches').isVisible());
await page.fill('#q', ''); await page.selectOption('#fl', 'active');
await shot(page, 'd2-list');

// =============================================================== E. Switching organization: six outcomes (design 01)
// 1 same page
await wait('Avatar for C1');
await inMenu(page, 'Aurj'); await page.waitForFunction(() => document.querySelector('#org-switcher strong')?.textContent === 'Aurj');
await wait('No avatars yet');
check('E1', 'Outcome 1: the same page in the other organization, new colours, a "Now in Aurj · Funnels" confirmation, none of the old data, never the Launcher',
  (await h1()) === 'Customer avatars' && (await theme()) === 'aurj' && !(await page.locator('main').innerText()).includes('Avatar for C1') && (await toastText()).includes('Now in Aurj · Funnels') && !page.url().includes('launcher'));
await shot(page, 'e1-aurj');
await inMenu(page, 'Layer2Funnels'); await wait('Avatar for C1'); check('E1b', 'Switching back restores that organization’s records and theme', (await theme()) === 'l2f');
// 2 record not carried
await page.getByRole('link', { name: 'Open Avatar for C1' }).click(); await page.waitForSelector('#edit');
await inMenu(page, 'Aurj'); await wait('That item belongs to Layer2Funnels, so it isn’t here.');
check('E2', 'Outcome 2: a record that is not in the other organization lands on that organization’s list, with a plain notice and a way back', (await page.locator('.notice').innerText()).includes('Switch back to Layer2Funnels') && (await h1()) === 'Customer avatars');
await page.getByRole('button', { name: 'Switch back to Layer2Funnels' }).click(); await page.waitForFunction(() => document.querySelector('#org-switcher strong')?.textContent === 'Layer2Funnels');
// 3 app not turned on
await visit(page, base + '/#/app/drive'); await wait('Drive isn’t built yet');
await inMenu(page, 'Aurj'); await wait('isn’t turned on for Aurj');
check('E3', 'Outcome 3: an app that is not on in the other organization is explained in place, with three next steps and nothing from the old organization', (await page.locator('.unavail').innerText()).includes('Nothing from Layer2Funnels is on this screen.')
  && await page.getByRole('button', { name: 'Switch back to Layer2Funnels' }).isVisible() && await page.getByRole('button', { name: 'Ask an Aurj admin' }).isVisible() && await page.getByRole('link', { name: 'Browse all apps' }).isVisible());
await page.getByRole('button', { name: 'Ask an Aurj admin' }).click();
check('E3b', '"Ask an admin" is message only and says so', (await toastText()).includes('No request was sent'));
await page.getByRole('button', { name: 'Go to Aurj Office Home' }).click(); await wait('Needs your attention');
// 4 not a member (the menu was loaded before the membership ended)
await inMenu(page, 'Layer2Funnels'); await page.waitForFunction(() => document.querySelector('#org-switcher strong')?.textContent === 'Layer2Funnels'); await wait('Needs your attention');
await q('delete from memberships where workspace_id = $1 and user_id = $2', [A, uid]);
await inMenu(page, 'Aurj'); await wait('You’re not a member of Aurj.');
check('E4', 'Outcome 4: switching to an organization you are no longer in changes nothing and says why, in words', (await page.locator('#org-switcher strong').innerText()) === 'Layer2Funnels' && (await theme()) === 'l2f' && (await page.locator('.notice[role=alert]').innerText()).includes('nothing has changed'));
await q("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff','editor')", [A, uid]);
// 5 the switch could not finish
await page.route('**/api/org.switch', (r) => r.abort());
await inMenu(page, 'Aurj'); await wait('Couldn’t switch to Aurj.');
check('E5', 'Outcome 5: when the connection drops nothing changes, and the screen says so with Try again', (await page.locator('#org-switcher strong').innerText()) === 'Layer2Funnels' && (await theme()) === 'l2f' && await page.getByRole('button', { name: 'Try again' }).isVisible());
await page.unroute('**/api/org.switch');
await page.getByRole('button', { name: 'Try again' }).click(); await page.waitForFunction(() => document.querySelector('#org-switcher strong')?.textContent === 'Aurj');
check('E5b', '"Try again" completes the switch', (await theme()) === 'aurj');
await inMenu(page, 'Layer2Funnels'); await page.waitForFunction(() => document.querySelector('#org-switcher strong')?.textContent === 'Layer2Funnels');
// 6 unsaved changes
await visit(page, base + '/#/office/funnels/avatars'); await wait('Avatar for C1');
await page.getByRole('link', { name: 'New avatar' }).first().click(); await page.waitForSelector('#r-name'); await page.fill('#r-name', 'Typed before switching');
await inMenu(page, 'Aurj'); await wait('Save your changes before switching?');
check('E6a', 'Outcome 6: the dialog names the page and offers Save and switch, Discard and switch, Stay here', (await page.locator('.dlg').innerText()).includes('They can’t come with you to Aurj') && await page.getByRole('button', { name: 'Stay here' }).isVisible());
await page.getByRole('button', { name: 'Stay here' }).click();
check('E6b', '"Stay here" keeps the organization, the page and the typed text', (await page.locator('#org-switcher strong').innerText()) === 'Layer2Funnels' && (await page.inputValue('#r-name')) === 'Typed before switching');
await inMenu(page, 'Aurj'); await wait('Save your changes before switching?'); await page.getByRole('button', { name: 'Save and switch' }).click();
await page.waitForFunction(() => document.querySelector('#org-switcher strong')?.textContent === 'Aurj');
check('E6c', '"Save and switch" saves in the old organization first, then switches', (await q('select count(*)::int n from funnel_avatars where workspace_id = $1 and name = $2', [L, 'Typed before switching']))[0].n === 1 && (await h1()) === 'Customer avatars');
await inMenu(page, 'Layer2Funnels'); await wait('Typed before switching');
await page.getByRole('link', { name: 'New avatar' }).first().click(); await page.waitForSelector('#r-name'); await page.fill('#r-name', 'Thrown away');
await inMenu(page, 'Aurj'); await wait('Save your changes before switching?'); await page.getByRole('button', { name: 'Discard and switch' }).click();
await page.waitForFunction(() => document.querySelector('#org-switcher strong')?.textContent === 'Aurj'); await wait('No avatars yet');
check('E6d', '"Discard and switch" drops the draft and switches', (await q('select count(*)::int n from funnel_avatars where name = $1', ['Thrown away']))[0].n === 0);
// keyboard: the switcher menu
await inMenu(page, 'Layer2Funnels'); await wait('Typed before switching');
await page.focus('#org-switcher'); await page.keyboard.press('Enter');
const open = (await page.getAttribute('#org-switcher', 'aria-expanded')) === 'true'; await page.keyboard.press('ArrowDown'); const moved = await page.evaluate(() => document.activeElement.classList.contains('opt')); await page.keyboard.press('Escape');
check('E7', 'The switcher works from the keyboard: Enter opens, arrows move, Esc closes and returns focus to it', open && moved && (await page.getAttribute('#org-switcher', 'aria-expanded')) === 'false' && (await page.evaluate(() => document.activeElement.id)) === 'org-switcher');
await page.focus('.skip'); const hashBefore = page.url(); await page.keyboard.press('Enter');
check('E8', 'The "Skip to content" link moves focus to the main area and leaves the address (the route) alone', (await page.evaluate(() => document.activeElement.id)) === 'main' && page.url() === hashBefore);

// =============================================================== F. Admin → Members and Access (design 05)
await visit(page, base + '/#/office/admin'); await wait('Joining is by invitation only.');
check('F1', 'Admin opens on Members: you, marked "(you)", as Owner and Active, in a table with a Manage button', (await page.locator('tbody tr').count()) === 1 && (await page.locator('tbody').innerText()).includes(`${NAME} (you)`) && (await page.locator('tbody').innerText()).includes('Owner') && (await page.getAttribute('[role=tab][data-k=members]', 'aria-selected')) === 'true');
await shot(page, 'f1-members');
await page.getByRole('button', { name: 'Invite someone' }).click(); await page.getByRole('button', { name: 'Send invitation' }).click();
check('F2', 'Inviting with a bad email is explained in the dialog', (await page.locator('#ie-e').innerText()).includes('Enter an email'));
await page.fill('#ie', GUEST); await page.selectOption('#il', 'editor');
check('F3', 'The level hint explains the chosen level; Owner is not offered', (await page.locator('#ild').innerText()).includes('Creates and edits records') && !(await page.locator('#il option').allInnerTexts()).includes('Owner'));
await page.getByRole('button', { name: 'Send invitation' }).click(); await wait(`Invitation saved for ${GUEST}`);
const link = await page.inputValue('#il2'); const token = new URL(link).hash.split('token=')[1];
check('F4', 'A saved invitation shows its link once (email sending is switched on at go-live) and appears as Invited', link.includes('#/invite?token=') && (await q('select count(*)::int n from invitations where workspace_id = $1 and email = $2', [L, GUEST]))[0].n === 1);
await page.getByRole('button', { name: 'Done' }).click(); await wait('Invited');
await page.getByRole('button', { name: `Manage ${GUEST}` }).click(); await wait('Invitation not accepted yet.');
await page.getByRole('button', { name: 'Cancel invitation' }).click(); await wait('1 person.');
check('F5', 'An invitation can be cancelled before it is accepted', (await q('select count(*)::int n from invitations where workspace_id = $1 and email = $2 and revoked_at is not null', [L, GUEST]))[0].n === 1);
const tok2 = (await (await fetch(`${base}/api/invitation.create`, { method: 'POST', headers: { authorization: `Bearer ${await (async () => (await (await fetch('http://127.0.0.1:54321/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH', 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PW }) })).json()).access_token)()}`, 'x-org-id': L, 'content-type': 'application/json' }, body: JSON.stringify({ email: GUEST, kind: 'staff', role: 'editor' }) })).json()).data[0].token;
// the sole owner
await page.getByRole('button', { name: `Manage ${NAME}` }).click(); await wait('is the only owner.');
check('F6', 'The only owner can’t be demoted, deactivated or removed: the level is locked and the dialog says why', (await page.locator('#ml').isDisabled()) && (await page.locator('.dlg').innerText()).includes('An organization always needs one'));
await page.getByRole('button', { name: `Remove from Layer2Funnels` }).click();
check('F6b', 'Remove on the only owner is refused in words', (await toastText()).includes('The only owner can’t be removed.'));
await page.keyboard.press('Escape');

// =============================================================== G. Invitations from the invited person's side (design 02)
const guest = await newPage(); guest.route('https://example.com/**', (r) => r.fulfill({ status: 200, body: 'x' }));
await visit(guest, `${base}/#/invite?token=${tok2}`); await wait('Sign in', guest);
check('G1', 'An invitation link signed out shows Sign in with the invitation hint, and the token leaves the address bar at once', (await guest.locator('main').innerText()).includes('Sign in with the email your invitation was sent to.') && !guest.url().includes(tok2));
await guest.getByRole('button', { name: 'Create an account' }).click(); await wait('Use the email address your invitation was sent to.', guest);
await guest.fill('#nm', 'Gus Guest'); await guest.fill('#em', GUEST); await guest.fill('#pw', PW); await guest.click('button[type=submit]');
await wait('Join Layer2Funnels', guest);
check('G2', 'After signing up, the invitation screen names the organization, the inviter, the level and the signed-in email', (await guest.locator('main').innerText()).includes(`${NAME} invited you to join Layer2Funnels as an Editor.`) && (await guest.locator('main').innerText()).includes(`Signed in as ${GUEST}`) && (await theme(guest)) === 'l2f');
await shot(guest, 'g1-invite');
await guest.getByRole('button', { name: 'Accept invitation' }).click(); await wait('Needs your attention', guest);
check('G3', 'Accepting lands in Office Home of that organization; an editor sees no Admin section', (await guest.locator('#org-switcher strong').innerText()) === 'Layer2Funnels' && !(await guest.locator('nav.nav a').allInnerTexts()).includes('Admin') && !(await guest.getByText('For owners and admins').count()));
await visit(guest, `${base}/#/office/admin/members`); await wait('We couldn’t find that', guest);
check('G4', 'An editor who opens an Admin address sees the same "We couldn’t find that" screen', (await guest.locator('main').innerText()).includes('Go to Office Home'));
const out = await newPage();
await visit(out, `${base}/#/signup`); await wait('Create your account', out); await out.fill('#nm', 'Olive Outsider'); await out.fill('#em', OUTSIDER); await out.fill('#pw', PW); await out.click('button[type=submit]'); await wait('not in an organization yet', out);
const ownerToken = (await (await fetch('http://127.0.0.1:54321/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH', 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PW }) })).json()).access_token;
const mk = async (email, role) => (await (await fetch(`${base}/api/invitation.create`, { method: 'POST', headers: { authorization: `Bearer ${ownerToken}`, 'x-org-id': L, 'content-type': 'application/json' }, body: JSON.stringify({ email, kind: 'staff', role }) })).json()).data[0].token;
const forOther = await mk(`someone.else.${stamp}@example.com`, 'viewer');
await visit(out, `${base}/#/invite?token=${forOther}`); await out.reload(); await wait('This invitation can’t be used', out);
check('G5', 'An invitation for a different email address says only that it can’t be used (no name, no organization)', !(await out.locator('.card').innerText()).includes('Layer2Funnels'));
const forOut = await mk(OUTSIDER, 'viewer');
await visit(out, `${base}/#/invite?token=${forOut}`); await out.reload(); await wait('Join Layer2Funnels', out);
await out.getByRole('button', { name: 'Decline' }).click(); await out.getByRole('button', { name: 'Decline invitation' }).click(); await wait('not in an organization yet', out);
check('G6', 'Declining asks first, then leaves the person with no organization', (await q('select count(*)::int n from memberships m join auth.users u on u.id = m.user_id where u.email = $1', [OUTSIDER]))[0].n === 0);
await out.close();

// ---- Members as owner, now with the guest
await visit(page, base + '/#/office/admin/members'); await wait('3 people.');
await page.getByRole('button', { name: 'Manage Gus Guest' }).click(); await page.selectOption('#ml', 'viewer'); await page.getByRole('button', { name: 'Save changes' }).click(); await wait('Level updated.'); await page.waitForFunction(() => document.querySelector('tbody')?.innerText.includes('Viewer'), null, { timeout: 9000 });   // the confirmation first, then the refreshed table
check('F7', 'Changing a level saves and shows at once', (await q("select role from memberships where workspace_id = $1 and role = 'viewer' and user_id = (select id from auth.users where email = $2)", [L, GUEST])).length === 1 && (await page.locator('tbody').innerText()).includes('Viewer'));
await page.getByRole('button', { name: 'Manage Gus Guest' }).click(); await page.getByRole('button', { name: 'Deactivate' }).click(); await wait('Deactivate Gus Guest?'); await page.getByRole('button', { name: 'Deactivate', exact: true }).last().click(); await wait('Deactivated');
check('F8', 'Deactivating confirms first, deletes nothing, and the row says Deactivated', (await q("select status from memberships where workspace_id = $1 and user_id = (select id from auth.users where email = $2)", [L, GUEST]))[0].status !== 'active');
await page.getByRole('button', { name: 'Manage Gus Guest' }).click(); await page.getByRole('button', { name: 'Reactivate' }).click(); await page.getByRole('button', { name: 'Reactivate', exact: true }).last().click(); await wait('Active');
await q("update memberships set role = 'editor' where workspace_id = $1 and user_id = (select id from auth.users where email = $2)", [L, GUEST]);

// ---- Access
await page.getByRole('tab', { name: 'Access' }).click(); await wait('Deny always wins.');
check('F9', 'Access opens on Levels: a table read from the real permission catalog, four levels, grouped by app', (await page.locator('thead th').evaluateAll((e) => e.map((x) => x.textContent))).join() === 'Can they…,Owner,Admin,Editor,Viewer' && (await page.locator('tbody th[colspan]').count()) >= 4 && await page.getByText('The last owner can’t be removed or demoted.').isVisible());
await shot(page, 'f2-levels');
await page.keyboard.press('Shift+Tab'); await page.getByRole('tab', { name: 'Access' }).focus(); await page.keyboard.press('ArrowLeft'); await page.waitForFunction(() => location.hash.endsWith('/admin/members') && document.querySelector('[role=tab][data-k=members]')?.getAttribute('aria-selected') === 'true');
check('F10', 'Tabs work from the keyboard: arrow keys move and switch', (await page.getAttribute('[role=tab][data-k=members]', 'aria-selected')) === 'true' && page.url().endsWith('/admin/members'));
await visit(page, base + '/#/office/admin/access/assignments'); await wait('Add assignment');
check('F11', 'Assignments starts empty with an explanation, not a blank table', await page.getByText('No assignments yet').isVisible());
await page.getByRole('button', { name: 'Add assignment' }).click(); await wait('Deny instead');
await page.selectOption('#ap', { label: 'Gus Guest' }); await page.selectOption('#al', { label: 'Clients · Client team' }); await page.selectOption('#aw', { label: `Client: Harry Kaye PT ${stamp}` }); await page.getByRole('button', { name: 'Add', exact: true }).click(); await wait('Assignment added.');
check('F12', 'Adding an assignment shows it with its level and where it applies', (await page.locator('tbody').innerText()).includes('Gus Guest') && (await page.locator('tbody').innerText()).includes(`Client: Harry Kaye PT ${stamp}`));
await page.getByRole('button', { name: 'Add assignment' }).click(); await page.selectOption('#ap', { label: 'Gus Guest' }); await page.selectOption('#al', { label: 'Office · Funnels · edit' }); await page.check('#ad');
await page.getByRole('button', { name: 'Add', exact: true }).click();
check('F13', '"Deny instead" asks for a short reason (kept in the audit history)', (await page.locator('#ar-e').innerText()).includes('Say why'));
await page.fill('#ar', 'Not needed yet'); await page.getByRole('button', { name: 'Add', exact: true }).click(); await wait('Restriction added.');
check('F14', 'A denial is listed as Denied', (await page.locator('tbody').innerText()).includes('Denied: Funnels · edit'));
await visit(page, base + '/#/office/admin/access/effective'); await wait('Show access for');
await page.selectOption('#ep', { label: 'Gus Guest' }); await wait('Funnels records'); await page.waitForFunction(() => document.querySelector('tbody')?.innerText.includes('Deny wins'), null, { timeout: 9000 });
const eff = await page.locator('tbody').innerText();
check('F15', 'Effective access shows one row per area with Can edit / Can view / No access, and a denial reads "Deny wins"', eff.includes('Funnels records') && eff.includes('No access') && eff.includes('Deny wins') && eff.includes('Can edit'));
await shot(page, 'f3-effective');
await visit(page, base + '/#/office/admin/access/assignments'); await wait('Remove');
await page.getByRole('button', { name: /Remove Gus Guest Funnels · edit/ }).click(); await page.getByRole('button', { name: 'Remove', exact: true }).last().click(); await wait('Assignment removed.');
check('F16', 'Removing a denial asks first and lifts it', (await q('select count(*)::int n from permission_overrides where workspace_id = $1', [L]))[0].n === 0);

// ---- an admin cannot change an owner
await q("update memberships set role = 'admin' where workspace_id = $1 and user_id = (select id from auth.users where email = $2)", [L, GUEST]);
await visit(guest, `${base}/#/office/admin/members`); await guest.reload(); await wait('Joining is by invitation only.', guest);
await guest.getByRole('button', { name: `Manage ${NAME}` }).click(); await wait('Only an owner can change an owner.', guest);
check('F17', 'An admin sees the owner’s level but can’t change it: "Only an owner can change an owner."', await guest.locator('#ml').isDisabled());
await guest.keyboard.press('Escape');
await q("update memberships set role = 'editor' where workspace_id = $1 and user_id = (select id from auth.users where email = $2)", [L, GUEST]);

// =============================================================== H. Scoped buttons and read-only (design 06, 07)
const lvl = (await q("insert into access_levels (workspace_id, app_key, name) values ($1,'office','Share on one client') returning id", [L]))[0].id;
await q("insert into access_level_permissions (workspace_id, access_level_id, permission_key) values ($1,$2,'funnels.record.share')", [L, lvl]);
await q("insert into access_assignments (workspace_id, access_level_id, principal_type, principal_id, client_id) values ($1,$2,'user',(select id from auth.users where email = $3),$4)", [L, lvl, GUEST, C1]);
await visit(guest, `${base}/#/office/funnels/avatars`); await guest.reload(); await wait('Avatar for C1', guest);
await guest.getByRole('link', { name: 'Open Avatar for C1' }).click(); await guest.waitForSelector('#edit');
const onC1 = await guest.locator('#share').count();
await visit(guest, `${base}/#/office/funnels/avatars`); await guest.getByRole('link', { name: 'Open Avatar for C2' }).click(); await guest.waitForSelector('#edit');
check('H1', 'A person who holds a permission on one client only sees that button on that client’s records and no others', onC1 === 1 && (await guest.locator('#share').count()) === 0 && (await guest.locator('#edit').count()) === 1);
await q("update memberships set role = 'viewer' where workspace_id = $1 and user_id = (select id from auth.users where email = $2)", [L, GUEST]);
await guest.reload(); await wait('Read only.', guest);
check('H2', 'A viewer sees records read-only: a clear notice, no Edit, Archive or Share buttons', (await guest.locator('#edit').count()) === 0 && (await guest.locator('#archive').count()) === 0 && (await guest.locator('#share').count()) === 0);
await visit(guest, `${base}/#/office/funnels/avatars`); await wait('You can view these.', guest);
check('H3', 'The viewer’s list says "You can view these" and has no New button', (await guest.getByRole('link', { name: 'New avatar' }).count()) === 0);
await q("update memberships set role = 'editor' where workspace_id = $1 and user_id = (select id from auth.users where email = $2)", [L, GUEST]);

// =============================================================== I. Reduced motion, widths, keyboard
const rm = await newPage(1280, 800, { reducedMotion: 'reduce' });
await rm.goto(base + '/'); await wait('Sign in', rm); await rm.fill('#em', EMAIL); await rm.fill('#pw', PW); await rm.click('button[type=submit]'); await wait('Your apps in Layer2Funnels', rm);
const dur = await rm.evaluate(() => [...document.querySelectorAll('.tile')].slice(0, 3).map((e) => parseFloat(getComputedStyle(e).animationDuration)));
check('I1', 'With reduced motion, tile animations and transitions are effectively off', dur.every((d) => d < 0.01) && parseFloat(await rm.evaluate(() => getComputedStyle(document.querySelector('.tile')).transitionDuration)) < 0.01, dur.join());
await rm.close();

const routes = [['/#/launcher', 'Your apps in'], ['/#/office', 'Needs your attention'], ['/#/office/funnels', 'Recently changed'], ['/#/office/funnels/avatars', 'Avatar for C1'], ['/#/office/funnels/avatars/new', 'Belongs to'],
  ['/#/office/admin/members', 'Joining is by invitation only.'], ['/#/office/admin/access/levels', 'Deny always wins.'], ['/#/office/admin/access/assignments', 'Add assignment'], ['/#/office/admin/access/effective', 'Show access for'], ['/#/office/planner', 'isn’t built yet']];
for (const [w, label] of [[1280, 'desktop'], [768, 'tablet'], [390, 'phone']]) {
  const p = await newPage(w, 900);
  await p.goto(base + '/'); await wait('Sign in', p);
  let ok = await layouts(p, `${label} sign in`);
  await p.getByRole('button', { name: 'Create an account' }).click(); await wait('Create your account', p); ok = (await layouts(p, `${label} sign up`)) && ok;
  await p.goto(base + '/#/signin'); await p.fill('#em', EMAIL); await p.fill('#pw', PW); await p.click('button[type=submit]'); await wait('Your apps in Layer2Funnels', p);
  const bad = [];
  for (const [r, t] of routes) { await p.goto(base + r); await p.reload(); await wait(t, p); await p.waitForTimeout(120); if (!(await layouts(p, `${label} ${r}`))) bad.push(r); }
  check(`R-${label}`, `At ${w}px every screen has no sideways scroll and every control is at least 44px (${routes.length + 2} screens)`, ok && bad.length === 0, bad.join(' '));
  if (w === 390) {
    await p.goto(base + '/#/office'); await p.reload(); await wait('Needs your attention', p);
    const bar = p.locator('nav.bnav'); const labels = await bar.locator('a, button').allInnerTexts();
    check('R-bar', 'On a phone the Office menu is a bottom bar: four sections plus More, labels always visible, top menu hidden', labels.map((x) => x.trim()).join() === 'Home,Planner,Projects,Funnels,More' && !(await p.locator('nav.nav').isVisible()) && (await bar.boundingBox()).y > 700);
    await bar.getByRole('button', { name: 'More' }).click(); await wait('More in Office', p);
    const more = await p.locator('.sheet a').allInnerTexts(); await p.keyboard.press('Escape');
    check('R-more', 'More opens a sheet with the rest (Docs, Team, Apps, Admin); Esc closes it and focus returns to More', more.map((x) => x.trim()).join() === 'Documents,Team,Apps,Admin' && (await p.evaluate(() => document.activeElement.textContent)).includes('More'));
    await p.goto(base + '/#/launcher'); await p.reload(); await wait('Your apps in', p);
    check('R-tiles', 'On a phone the Launcher shows two columns with names only (descriptions hidden)', (await p.locator('.tile').first().evaluate((e) => getComputedStyle(e.querySelector('.d')).display)) === 'none' && new Set(await p.locator('.tile').evaluateAll((els) => els.slice(0, 4).map((e) => Math.round(e.getBoundingClientRect().left)))).size === 2);
    await shot(p, 'i1-phone-launcher'); await p.goto(base + '/#/office/admin/members'); await p.reload(); await wait('Joining is by invitation only.', p); await shot(p, 'i2-phone-members');
    await p.goto(base + '/#/office/funnels/avatars'); await p.reload(); await wait('Avatar for C1', p); await p.evaluate(() => document.querySelector('.hdr .iconbtn')?.focus());
    await p.click('#org-switcher'); const sheet = await p.locator('#org-menu').boundingBox();
    check('R-sheet', 'On a phone the organization menu opens as a bottom sheet', sheet.y + sheet.height > 780 && sheet.width > 330);
    await shot(p, 'i3-phone-switcher');
  }
  await p.context().close();
}

// =============================================================== J. Whole-run hygiene
check('J1', 'No script errors, warnings or Content-Security-Policy violations during the whole run (deliberate 4xx answers excluded)', problems.length === 0, problems.slice(0, 4).join(' | '));
await browser.close(); await s.close(); await admin.end();
for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(8)} ${x.n}${x.ok ? '' : `  [${x.d}]`}`);
const p = results.filter((x) => x.ok).length; console.log(`\n${p}/${results.length} checks passed`); process.exit(p === results.length ? 0 : 1);
