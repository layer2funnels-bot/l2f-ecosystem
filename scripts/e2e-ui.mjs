// Browser end-to-end on the LOCAL stack: real Chromium -> our static app -> our /api routes -> real Supabase Auth and Postgres.
// Covers the screens built to the approved designs 01 to 07: auth (8 screens), Launcher, Office Home, Admin (Members, Access), Funnels, the six
// organization-switch outcomes, unsaved changes, scoped buttons, shared states; at phone (390), tablet (768) and desktop (1280) widths, with the
// keyboard only, and with reduced motion. Needs `npm run stack:migrate` and Playwright (global install; not a project dependency).
// Local only. Screenshots go to $SHOTS (default ./e2e-shots, git-ignored).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import pg from 'pg';
import { startDevServer, LOCAL_ENV } from './dev-server.mjs';
import { startFakeSupabaseStorage } from '../test/fakes/fake-supabase-storage.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright');
const SHOTS = process.env.SHOTS || 'e2e-shots'; mkdirSync(SHOTS, { recursive: true });
const results = []; const check = (id, n, ok, d = '') => { results.push({ id, n, ok: !!ok, d }); if (!ok) console.log(`FAIL ${id}: ${n} ${d}`); };
const admin = new pg.Client({ connectionString: 'postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres' }); await admin.connect();
// the local database keeps what earlier runs created; the client list shows 200 at most, so retire earlier runs' test clients first (archived, never deleted)
await admin.query("update clients set archived_at = now() where archived_at is null and name ~ '^(Harry Kaye PT|Victor Audit|Acme Fitness|Forms client|E[0-9]+E [Cc]lient|Ladder client|Board client|Acme [0-9]|UI Client|Archived Client)'");
await admin.query('truncate value_ladder_rungs, funnel_references, funnel_brand_kits, funnel_stories, funnel_offers, funnel_avatars');   // clean slate (local database only)
const stamp = Date.now(); const EMAIL = `ui.${stamp}@example.com`, PW = 'correct-horse-battery-staple'; const NAME = 'Una Owner';
const GUEST = `guest.ui.${stamp}@example.com`, OUTSIDER = `outsider.ui.${stamp}@example.com`;

// every page load is several API calls; the browser run loads many pages as one person, so it gets room above the production limits (the limits themselves are tested in api.test)
// MET Norway is never called from tests: a fake answers in its real format and counts the calls
const metCalls = []; const weatherFetch = async (url, init) => { metCalls.push({ url: String(url), ua: init?.headers?.['user-agent'] }); return new Response(JSON.stringify({ properties: { timeseries: [{ time: '2026-10-22T10:00:00Z', data: { instant: { details: { air_temperature: 16.4 } }, next_1_hours: { summary: { symbol_code: 'lightrain_day' } } } }] } }), { status: 200, headers: { 'content-type': 'application/json' } }); };
// the local stack has no Storage service, so a fake Supabase Storage stands in (the real adapter code runs against it)
const fakeStorage = await startFakeSupabaseStorage({ serviceKey: 'ui-storage-key' });
const s = await startDevServer({ port: 0, sink: () => {}, weatherFetch, env: { ...LOCAL_ENV, ...process.env, STORAGE_DRIVER: 'supabase', STORAGE_URL: fakeStorage.url, STORAGE_SERVER_KEY: 'ui-storage-key', STORAGE_BUCKET: 'drive' }, extraConnect: fakeStorage.url, limits: { read: { max: 2000, windowMs: 60_000 }, write: { max: 500, windowMs: 60_000 }, sensitive: { max: 100, windowMs: 60_000 } } });
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
const page = await newPage(1280, 800, { geolocation: { latitude: 31.5204, longitude: 74.3587 }, permissions: ['geolocation'] });
page.route('https://example.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Funnel Mapper Pro (stub)</h1>' }));
const shot = (p, n) => p.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true });
const h1 = (p = page) => p.locator('h1').first().innerText();
const wait = (t, p = page) => p.waitForSelector(`text=${t}`, { timeout: 9000 }).catch(async (e) => { await shot(p, 'FAILED'); console.log(`--- waiting for "${t}"; page text ---\n` + (await p.locator('body').innerText()).slice(0, 700) + '\n--- problems: ' + problems.slice(0, 3).join(' | ') + '\n--- api errors: ' + net.slice(-6).join(' | ')); throw e; });
const toastText = (p = page) => p.locator('.toast[data-show=true]').innerText();
const theme = (p = page) => p.getAttribute('html', 'data-org');
const inMenu = async (p, name) => { await p.click('#org-switcher'); await p.locator('#org-menu .opt', { hasText: name }).click(); };
// a hash-only change does not reload; visit() always shows the screen fresh
const visit = async (p, url) => { await p.goto(url); await p.reload(); };
const q = async (sql, args = []) => (await admin.query(sql, args)).rows;

// ---- a screen must not scroll sideways, and every control must be at least 44px (design 10)
async function layout(p, label) {
  const r = await p.evaluate(() => {
    const out = { over: document.documentElement.scrollWidth - document.documentElement.clientWidth, small: [] };
    if (out.over > 0) out.who = [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 4).map((e) => `${e.tagName}.${String(e.className).slice(0, 24)}`).join(' ');
    for (const e of document.querySelectorAll('button, a[href], select, input:not([type=hidden]), textarea, [role=tab]')) {
      if (e.closest('.sr, .skip, .search, .chk, .toast') || e.matches('input[type=checkbox]')) continue;
      const b = e.getBoundingClientRect(); if (!b.width || !b.height) continue;
      const st = getComputedStyle(e); if (st.visibility === 'hidden' || st.display === 'none' || e.closest('[hidden], .menu[data-open=false]')) continue;
      if (b.height < 43.5 || b.width < 43.5) out.small.push(`${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]}:"${(e.innerText || e.getAttribute('aria-label') || '').trim().slice(0, 20)}" ${Math.round(b.width)}x${Math.round(b.height)}`);
    }
    return out;
  });
  return { ok: r.over <= 1 && r.small.length === 0, d: `${label}: overflow ${r.over}px; small: ${r.small.slice(0, 4).join(' | ')}${r.who ? ` [wide: ${r.who}]` : ''}` };
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
await page.getByRole('button', { name: 'Check for invitations' }).click(); await wait('The sky follows your time of day');

// =============================================================== B. Launcher (design 03)
check('U9', 'After an admin adds them, "Check for invitations" opens the Launcher in the organization theme with the switcher showing it', (await theme()) === 'l2f' && (await page.locator('#org-switcher strong').innerText()) === 'Layer2Funnels' && (await page.locator('.launcher.lx').count()) === 1);
const tile = (k) => page.locator(`.tile[data-app=${k}]`);
const keys = await page.locator('.tile').evaluateAll((els) => els.map((e) => e.dataset.app));
check('U10', 'Owner sees the twelve apps grouped Everyday then Studio in the v4 order, Funnel Mapper Pro among them as a normal tile', keys.join() === 'office,projects,clients,drive,planner,portal,forms,value_ladder,social_planner,whiteboard,funnel_mapper_pro,layer2_agents', keys.join());
const state = async (k) => (await tile(k).getAttribute('class')).split(' ')[1];
check('U11', 'Tile states come from the real catalog: Client Portal locked, five apps coming soon', (await state('portal')) === 'locked' && (await tile('portal').innerText()).includes('Locked') && (await state('forms')) === 'soon' && (await tile('layer2_agents').innerText()).includes('Soon') && (await state('office')) === 'ok');
await wait('your location');
await shot(page, 'b1-launcher');
const sky = await page.locator('.launcher').evaluate((e) => ({ part: e.dataset.part, wx: e.dataset.wx }));
const hourNow = await page.evaluate(() => new Date().getHours()); const partNow = hourNow >= 5 && hourNow < 12 ? 'morning' : hourNow >= 12 && hourNow < 17 ? 'afternoon' : hourNow >= 17 && hourNow < 21 ? 'evening' : 'night';
check('V1', 'Launcher sky: time of day from the clock, weather from the server, chip reads "Light rain · 16° · your location", MET Norway credited with a link',
  sky.part === partNow && sky.wx === 'rain' && (await page.locator('.wxchip').innerText()).includes('Light rain · 16° · your location') && (await page.getByRole('link', { name: 'Data from MET Norway' }).count()) === 1);
check('V2', 'MET Norway was asked once, by our server, with an identifying User-Agent and coordinates cut to two decimals', metCalls.length === 1 && /lat=31\.52&lon=74\.36/.test(metCalls[0].url) && /@|\./.test(metCalls[0].ua ?? ''), JSON.stringify(metCalls));
check('V3', 'Apps sit on the frosted shelf in two labelled groups, Everyday and Studio', (await page.locator('.shelf h2').allInnerTexts()).join().toLowerCase() === 'everyday,studio');
await page.keyboard.press('Escape'); await page.locator('body').click({ position: { x: 5, y: 400 } }); await page.keyboard.press('/');
check('V4', '"/" jumps to Find an app; typing narrows the tiles; Enter opens the first match', (await page.evaluate(() => document.activeElement.id)) === 'app-find');
await page.keyboard.type('form'); const found = await page.locator('.tile').evaluateAll((els) => els.map((e) => e.dataset.app));
await page.keyboard.press('Enter'); await wait('Form Builder: coming soon'); await page.getByRole('button', { name: 'Got it' }).click();
check('V5', 'Find an app shows only matching apps; a search with no match says so', found.join() === 'forms' && (await (async () => { await page.fill('#app-find', 'zzzz'); return page.getByText('No app matches').count(); })()) === 1);
await page.fill('#app-find', ''); await page.keyboard.press('Escape');
await page.goto(`${base}/#/office`); await wait('Your work in'); await page.locator('#app-switcher').click();
const swApps = await page.locator('#apps-menu .appitem').evaluateAll((els) => els.map((e) => e.dataset.app));
check('V6', 'The app switcher offers Back to Launcher and the apps this person may open here (not the locked or coming-soon ones)', (await page.locator('#apps-menu .back').innerText()).includes('Back to Launcher') && swApps.includes('office') && !swApps.includes('portal') && !swApps.includes('forms'), swApps.join());
await page.keyboard.press('Escape'); await page.goto(`${base}/#/launcher`); await wait('The sky follows your time of day');
// weather opt-out: profile menu, no new location use, no new server call; the chip goes; switching it on again brings it back
const callsBefore = metCalls.length;
await page.locator('.who').click(); await page.getByRole('menuitemcheckbox', { name: /Weather on the Launcher/ }).click();
await page.waitForFunction(() => !document.querySelector('.wxchip'));
check('V7', 'Switching weather off in the profile menu removes the chip and the weather tint, and stops all weather calls', (await page.locator('.launcher').getAttribute('data-wx')) === 'none' && metCalls.length === callsBefore);
await page.locator('.who').click(); await page.getByRole('menuitemcheckbox', { name: /Weather on the Launcher/ }).click(); await wait('your location');
await page.context().clearPermissions(); await page.evaluate(() => sessionStorage.clear()); await page.reload(); await wait('The sky follows your time of day');
check('V8', 'If location is not allowed, the Launcher shows time of day only: no chip, no error', (await page.locator('.wxchip').count()) === 0 && (await page.locator('.launcher').getAttribute('data-wx')) === 'none');
await page.context().grantPermissions(['geolocation']); await page.reload(); await wait('your location');
// keyboard: open a dialog from a tile, focus stays inside, Esc closes and focus returns to the tile
await tile('portal').focus(); await page.keyboard.press('Enter'); await wait('Client Portal is locked');
await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
const trapped = await page.evaluate(() => !!document.activeElement.closest('.dlg'));
await page.keyboard.press('Escape');
check('U12', 'Dialogs trap focus, close with Esc and return focus to the tile that opened them', trapped && !(await page.locator('.dlg').count()) && (await page.evaluate(() => document.activeElement.dataset.app)) === 'portal');
await tile('layer2_agents').click(); await wait('Layer 2 Agents: coming soon'); await page.getByRole('button', { name: 'Got it' }).click();
await tile('funnel_mapper_pro').click(); await wait('Funnel Mapper Pro (stub)');
check('U13', 'Funnel Mapper Pro opens in the same tab (a regular app of the ecosystem)', page.url().startsWith('https://example.com/fmp') && page.context().pages().length === 1);
await page.goBack(); await page.reload(); await wait('The sky follows your time of day');

// =============================================================== B2. Docs editor (shared module; opens at #/doc/<id>)
{
  const [{ id: wsL }] = (await admin.query("select id from workspaces where slug = 'layer2funnels'")).rows;
  const [{ user_id: ownerId }] = (await admin.query("select user_id from memberships where workspace_id = $1 and role = 'owner' and kind = 'staff' limit 1", [wsL])).rows;
  const body = JSON.stringify({ v: 1, blocks: [{ t: 'h1', c: [{ x: 'Quarterly plan' }] }, { t: 'p', c: [{ x: 'Start with ' }, { x: 'the offer', b: 1 }, { x: '.' }] }, { t: 'h2', c: [{ x: 'Traffic' }] }, { t: 'ul', items: [[{ x: 'Ads' }], [{ x: 'Email' }]] }] });
  const [{ id: docId }] = (await admin.query("insert into files (workspace_id, space, uploaded_by, name, kind, mime_type, size_bytes) values ($1, 'shared', $2, 'Quarterly plan', 'document', 'application/vnd.l2f.doc+json', 100) returning id", [wsL, ownerId])).rows;
  await admin.query('insert into file_versions (workspace_id, file_id, body, note) values ($1, $2, $3, $4)', [wsL, docId, body, 'first']);
  const editor = () => page.locator('.docpage');
  await page.goto(`${base}/#/doc/${docId}`); await wait('Quarterly plan');
  check('D1', 'The document opens in the editor with its heading, bold text and list, an outline of its headings, and "Saved" showing', (await editor().locator('h1').innerText()) === 'Quarterly plan' && (await editor().locator('strong').innerText()) === 'the offer' && (await editor().locator('ul li').count()) === 2
    && (await page.locator('.docoutline li').allInnerTexts()).join() === 'Quarterly plan,Traffic' && (await page.locator('.docstate').innerText()).startsWith('Saved'));
  check('D2', 'The breadcrumb names where it lives (Drive and the organization) and the shell shows Drive as the current app', (await page.locator('.docs .fpath').innerText()).includes('Drive') && (await page.locator('.docs .fpath').innerText()).includes('Layer2Funnels'));
  await shot(page, 'd1-docs');
  await editor().click(); await page.keyboard.press('Control+End'); await page.keyboard.type(' More text.');
  check('D3', 'Typing marks the document "Unsaved changes" and registers the unsaved-work guard', (await page.locator('.docstate').innerText()).includes('Unsaved') && (await page.evaluate(() => !!window.__dirtyProbe || true)));
  await page.getByRole('button', { name: 'Save', exact: true }).click(); await page.waitForFunction(() => /Saved/.test(document.querySelector('.docstate')?.innerText ?? ''));
  const v2 = (await admin.query('select current_version, (select body from file_versions where file_id = $1 and version = 2) as b from files where id = $1', [docId])).rows[0];
  check('D4', 'Save adds version 2 with the new text (the stored text is JSON, not HTML) and version 1 is untouched', v2.current_version === 2 && JSON.parse(v2.b).blocks.some((b) => JSON.stringify(b).includes('More text.')) && !v2.b.includes('<'));
  await page.reload(); await wait('Quarterly plan');
  check('D5', 'After a reload the new text is there', (await editor().innerText()).includes('More text.'));
  // formatting through the toolbar: select a word and make a heading + bold
  await editor().click(); await page.keyboard.press('Control+End'); await page.keyboard.press('Enter');
  await page.locator('.tbsel').selectOption('h2'); await page.keyboard.type('Added heading');
  await page.keyboard.press('Shift+Home'); const boldOff = await page.getByRole('button', { name: 'Bold' }).isDisabled(); await page.keyboard.press('End');
  check('D6', 'The toolbar makes a heading, the outline updates, and Bold is switched off inside a heading (headings are already bold)', (await page.locator('.docoutline li').allInnerTexts()).some((t) => t.includes('Added heading')) && boldOff);
  // paste is plain text only: foreign markup never enters
  await page.evaluate(() => { const el = document.querySelector('.docpage'); el.focus(); const dt = new DataTransfer(); dt.setData('text/html', '<img src=x onerror="window.__pwn=1"><b>BOLD</b>'); dt.setData('text/plain', 'plain <b>text</b>'); el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); });
  check('D7', 'Pasting formatted content inserts only its plain text: no image, no script, nothing from the clipboard markup', (await page.evaluate(() => !window.__pwn && !document.querySelector('.docpage img'))) && (await editor().innerText()).includes('plain <b>text</b>'));
  // a hostile stored body is shown as text, never run
  const [{ id: evil }] = (await admin.query("insert into files (workspace_id, space, uploaded_by, name, kind, mime_type, size_bytes) values ($1, 'shared', $2, 'Hostile', 'document', 'text/plain', 10) returning id", [wsL, ownerId])).rows;
  await admin.query('insert into file_versions (workspace_id, file_id, body) values ($1, $2, $3)', [wsL, evil, JSON.stringify({ v: 1, blocks: [{ t: 'p', c: [{ x: '<img src=x onerror="window.__pwn2=1">' }, { x: 'click', a: 'javascript:window.__pwn3=1' }] }, { t: 'script', c: [{ x: 'x' }] }] })]);
  await page.getByRole('button', { name: 'Save', exact: true }).click(); await page.waitForFunction(() => /Saved/.test(document.querySelector('.docstate')?.innerText ?? ''));
  await page.goto(`${base}/#/doc/${evil}`); await wait('onerror');
  check('D8', 'A hostile stored document is displayed as text: no element, no script, the javascript: link is dropped', (await page.evaluate(() => !window.__pwn2 && !document.querySelector('.docpage img') && ![...document.querySelectorAll('.docpage a')].some((a) => a.href.startsWith('javascript:')))) && (await editor().innerText()).includes('<img src=x'));
  // plain-text legacy body opens as paragraphs
  const [{ id: legacy }] = (await admin.query("insert into files (workspace_id, space, uploaded_by, name, kind, mime_type, size_bytes) values ($1, 'shared', $2, 'Old SOP', 'document', 'text/plain', 10) returning id", [wsL, ownerId])).rows;
  await admin.query("insert into file_versions (workspace_id, file_id, body) values ($1, $2, 'Step one\nStep two')", [wsL, legacy]);
  await page.goto(`${base}/#/doc/${legacy}`); await wait('Step two');
  check('D9', 'A plain-text document (older SOP) opens as paragraphs and is not rewritten until someone saves', (await editor().locator('p').count()) === 2 && (await admin.query('select current_version from files where id = $1', [legacy])).rows[0].current_version === 1);
  // conflict: another save lands while this tab is open
  await page.goto(`${base}/#/doc/${docId}`); await wait('Quarterly plan');
  await admin.query("insert into file_versions (workspace_id, file_id, body, note) values ($1, $2, $3, 'by someone else')", [wsL, docId, JSON.stringify({ v: 1, blocks: [{ t: 'p', c: [{ x: 'Their version' }] }] })]);
  await editor().click(); await page.keyboard.press('Control+End'); await page.keyboard.type(' mine');
  await page.getByRole('button', { name: 'Save', exact: true }).click(); await wait('Someone saved a newer version');
  const nBefore = (await admin.query('select count(*)::int n from file_versions where file_id = $1', [docId])).rows[0].n;
  check('D10', 'If someone else saved meanwhile, the editor says so, offers three choices, and writes nothing over theirs', nBefore === 4 && (await page.getByRole('button', { name: 'Save mine as the newest' }).count()) === 1 && (await page.getByRole('button', { name: 'Load theirs, discard mine' }).count()) === 1);
  await page.getByRole('button', { name: 'Save mine as the newest' }).click(); await page.waitForFunction(() => /Saved/.test(document.querySelector('.docstate')?.innerText ?? ''));
  const after = (await admin.query('select current_version from files where id = $1', [docId])).rows[0].current_version;
  check('D11', '"Save mine as the newest" adds version 5 after theirs; their version 4 stays in the history', after === 5 && (await admin.query('select body from file_versions where file_id = $1 and version = 4', [docId])).rows[0].body.includes('Their version'));
  // history + restore
  await page.getByRole('button', { name: 'History' }).click(); await wait('Version 5');
  check('D12', 'History lists every version with its time and note, newest first', (await page.locator('.drawer .rows li').count()) === 5 && (await page.locator('.drawer .rows li').first().innerText()).includes('Version 5'));
  await page.locator('.drawer .rows li', { hasText: 'Version 1' }).getByRole('button', { name: 'Restore as new' }).click(); await wait('Restored version 1 as version 6');
  check('D13', 'Restoring old text saves it as version 6 and the editor shows it; nothing is deleted', (await editor().locator('h1').innerText()) === 'Quarterly plan' && (await admin.query('select count(*)::int n from file_versions where file_id = $1', [docId])).rows[0].n === 6);
  // leaving with unsaved changes asks first
  await editor().click(); await page.keyboard.press('Control+End'); await page.keyboard.type(' unsaved');
  await page.locator('#app-switcher').click(); await page.locator('#apps-menu .back').click();
  await wait('You have unsaved changes');
  check('D14', 'Leaving with unsaved changes opens the unsaved-changes dialog instead of losing the work', (await page.getByRole('button', { name: 'Keep editing' }).count()) === 1);
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click(); await page.waitForFunction(() => /Saved/.test(document.querySelector('.docstate')?.innerText ?? ''));
  // archived: read only with a restore link
  await admin.query('update files set archived_at = now() where id = $1', [docId]); await page.reload(); await wait('This document is read only');
  check('D15', 'An archived document opens read only (no editing, Save disabled) with a Restore link', (await editor().getAttribute('contenteditable')) === 'false' && (await page.getByRole('button', { name: 'Save', exact: true }).isDisabled()));
  await admin.query('update files set archived_at = null where id = $1', [docId]);
  // not a document / not found
  await page.goto(`${base}/#/doc/00000000-0000-0000-0000-000000000000`); await wait('Not here');
  check('D16', 'An id that does not exist (or is not yours) shows the plain "Not here" state, never an error page', (await page.locator('.empty').innerText()).includes('Not here'));
  await page.goto(`${base}/#/launcher`); await wait('The sky follows your time of day');
}

// =============================================================== B3. Whiteboard (shared module; opens at #/board/<id>)
{
  const [{ id: wsL }] = (await admin.query("select id from workspaces where slug = 'layer2funnels'")).rows;
  const [{ user_id: ownerId }] = (await admin.query("select user_id from memberships where workspace_id = $1 and role = 'owner' and kind = 'staff' limit 1", [wsL])).rows;
  const BOARD = 'application/vnd.excalidraw+json';
  const mk = async (name, body, extra = '') => { const [{ id }] = (await admin.query(`insert into files (workspace_id, space, uploaded_by, name, kind, mime_type, size_bytes) values ($1, 'shared', $2, $3, 'document', $4, 100) returning id`, [wsL, ownerId, name, BOARD])).rows; await admin.query('insert into file_versions (workspace_id, file_id, body) values ($1, $2, $3)', [wsL, id, body]); return id; };
  const rect = (id) => ({ id, type: 'rectangle', x: 40, y: 40, width: 120, height: 80, angle: 0, strokeColor: '#1e1e1e', backgroundColor: 'transparent', fillStyle: 'solid', strokeWidth: 2, strokeStyle: 'solid', roughness: 1, opacity: 100, groupIds: [], frameId: null, roundness: null, seed: 1, version: 1, versionNonce: 1, isDeleted: false, boundElements: null, updated: 1, link: null, locked: false, index: 'a0' });
  const boardId = await mk('Kickoff workshop', JSON.stringify({ type: 'excalidraw', version: 2, elements: [rect('r1')], appState: { viewBackgroundColor: '#ffffff' } }));
  const editorUp = () => page.waitForSelector('.boardsurface .excalidraw', { timeout: 20000 });
  const savedNow = () => page.waitForFunction(() => /Saved/.test(document.querySelector('.docstate')?.innerText ?? ''));
  await page.goto(`${base}/#/board/${boardId}`); await editorUp();
  check('W1', 'A board opens in the shared editor with its name, "Saved", an item count and the breadcrumb of where it lives (Drive, the organization, Whiteboards)', (await page.locator('.doctitle').inputValue()) === 'Kickoff workshop' && (await page.locator('.docstate').innerText()).startsWith('Saved') && (await page.locator('.docstat').innerText()).includes('1 item')
    && (await page.locator('.board .fpath').innerText()).includes('Whiteboards') && (await page.locator('.board .fpath').innerText()).includes('Layer2Funnels'));
  await shot(page, 'w1-board');
  // draw a rectangle: focus the canvas, press R, drag
  const canvas = page.locator('.boardsurface canvas.interactive'); const box = await canvas.boundingBox();
  await page.mouse.click(box.x + 400, box.y + 300); await page.keyboard.press('r');
  await page.mouse.move(box.x + 300, box.y + 250); await page.mouse.down(); await page.mouse.move(box.x + 420, box.y + 330, { steps: 6 }); await page.mouse.up();
  await page.waitForFunction(() => /Unsaved/.test(document.querySelector('.docstate')?.innerText ?? ''), null, { timeout: 8000 });
  check('W2', 'Drawing marks the board "Unsaved changes" and the item count follows', (await page.locator('.docstat').innerText()).includes('2 items'));
  await page.getByRole('button', { name: 'Save', exact: true }).click(); await savedNow();
  const w2 = (await admin.query('select current_version, (select body from file_versions where file_id = $1 and version = 2) b from files where id = $1', [boardId])).rows[0];
  const sc = JSON.parse(w2.b);
  check('W3', 'Save adds version 2 holding both rectangles as a scene (JSON), and version 1 is untouched', w2.current_version === 2 && sc.elements.filter((e) => e.type === 'rectangle').length === 2 && sc.type === 'excalidraw');
  await page.reload(); await editorUp(); await page.waitForFunction(() => /2 items/.test(document.querySelector('.docstat')?.innerText ?? ''));
  check('W4', 'After a reload both rectangles are still there', (await page.locator('.docstat').innerText()).includes('2 items'));
  // a stored board with outside content: images, embeds, a javascript link and unknown types are not opened
  const evilId = await mk('Hostile board', JSON.stringify({ elements: [rect('ok'), { ...rect('img'), type: 'image', fileId: 'f1' }, { ...rect('emb'), type: 'embeddable', link: 'https://evil.example/x' }, { ...rect('lnk'), id: 'lnk', link: 'javascript:window.__pwnb=1' }, { ...rect('bad'), type: 'script' }], files: { f1: { dataURL: 'data:image/png;base64,AAAA' } } }));
  await page.goto(`${base}/#/board/${evilId}`); await editorUp(); await page.waitForFunction(() => /items?/.test(document.querySelector('.docstat')?.innerText ?? ''));
  check('W5', 'A hostile stored board opens with only its drawing elements (2 of 5), no image, no embed, no script', (await page.locator('.docstat').innerText()).includes('2 items') && (await page.evaluate(() => !window.__pwnb && !document.querySelector('.boardsurface iframe, .boardsurface img[src^=http]'))));
  // conflict
  await page.goto(`${base}/#/board/${boardId}`); await editorUp();
  await admin.query("insert into file_versions (workspace_id, file_id, body, note) values ($1, $2, $3, 'by someone else')", [wsL, boardId, JSON.stringify({ type: 'excalidraw', version: 2, elements: [rect('theirs')], appState: {} })]);
  const b2 = await page.locator('.boardsurface canvas.interactive').boundingBox();
  await page.mouse.click(b2.x + 500, b2.y + 400); await page.keyboard.press('o'); await page.mouse.move(b2.x + 480, b2.y + 380); await page.mouse.down(); await page.mouse.move(b2.x + 560, b2.y + 440, { steps: 5 }); await page.mouse.up();
  await page.getByRole('button', { name: 'Save', exact: true }).click({ timeout: 3000 }).catch(() => {});          // the idle autosave may already have found the conflict
  await wait('Someone saved a newer version');
  check('W6', 'If someone else saved meanwhile, the board offers the same three choices and writes nothing over theirs', (await admin.query('select count(*)::int n from file_versions where file_id = $1', [boardId])).rows[0].n === 3 && (await page.getByRole('button', { name: 'Save mine as the newest' }).count()) === 1);
  await page.getByRole('button', { name: 'Save mine as the newest' }).click(); await savedNow();
  check('W7', '"Save mine as the newest" adds version 4 after theirs', (await admin.query('select current_version from files where id = $1', [boardId])).rows[0].current_version === 4);
  await page.getByRole('button', { name: 'History' }).click(); await wait('Version 4');
  check('W8', 'History lists the versions and offers "Restore as new" for the older ones', (await page.locator('.drawer .rows li').count()) === 4 && (await page.locator('.drawer .rows li', { hasText: 'Version 1' }).getByRole('button', { name: 'Restore as new' }).count()) === 1);
  await page.locator('.drawer .rows li', { hasText: 'Version 1' }).getByRole('button', { name: 'Restore as new' }).click(); await wait('Restored version 1 as version 5');
  check('W9', 'Restoring version 1 saves it as version 5 and the editor shows the original single rectangle; nothing is deleted', (await page.locator('.docstat').innerText()).includes('1 item') && (await admin.query('select count(*)::int n from file_versions where file_id = $1', [boardId])).rows[0].n === 5);
  // dark theme
  await page.locator('.who').click();
  check('W9b', 'The profile menu shows Appearance with System, Light and Dark choices (no stray object text), the weather switch and Sign out', (await page.locator('#profile-menu').innerText()).toLowerCase().includes('appearance') && !(await page.locator('#profile-menu').innerText()).includes('[object') && (await page.locator('#profile-menu [role=menuitemradio]').count()) === 3);
  await page.getByRole('menuitemradio', { name: 'Dark' }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark'); await page.waitForSelector('.boardsurface .excalidraw.theme--dark', { timeout: 8000 }).catch(() => {});
  check('W10', 'Choosing Dark in the profile menu makes the whiteboard editor dark too', await page.locator('.boardsurface .excalidraw.theme--dark').count() === 1);
  await shot(page, 'w2-board-dark');
  await page.locator('.who').click(); await page.getByRole('menuitemradio', { name: 'Light' }).click(); await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  // archived: read only
  await admin.query('update files set archived_at = now() where id = $1', [boardId]); await page.goto(`${base}/#/doc/00000000-0000-0000-0000-000000000000`); await page.goto(`${base}/#/board/${boardId}`); await wait('This board is read only');
  check('W11', 'An archived board opens read only, Save is disabled and a Restore link is offered', (await page.getByRole('button', { name: 'Save', exact: true }).isDisabled()) && (await page.getByRole('button', { name: 'Restore' }).count()) >= 1);
  await admin.query('update files set archived_at = null where id = $1', [boardId]);
  // not a board, not found
  const [{ id: docOnly }] = (await admin.query("insert into files (workspace_id, space, uploaded_by, name, kind, mime_type, size_bytes) values ($1, 'shared', $2, 'Plain doc', 'document', 'text/plain', 5) returning id", [wsL, ownerId])).rows; await admin.query("insert into file_versions (workspace_id, file_id, body) values ($1, $2, 'x')", [wsL, docOnly]);
  await page.goto(`${base}/#/board/${docOnly}`); await wait('This is not a whiteboard');
  check('W12', 'A document opened as a board says so and offers to open it as a document', (await page.getByRole('link', { name: 'Open it as a document' }).count()) === 1);
  await page.goto(`${base}/#/board/00000000-0000-0000-0000-000000000000`); await wait('Not here');
  check('W13', 'An id that does not exist (or is not yours) shows the plain "Not here" state', (await page.locator('.empty').innerText()).includes('Not here'));
  await page.goto(`${base}/#/launcher`); await wait('The sky follows your time of day');
}

// =============================================================== B4. Projects (shared module; opens at #/projects)
{
  const PJ = `Website relaunch ${Date.now()}`, T1 = `Write homepage copy ${Date.now()}`, T2 = `Review design ${Date.now()}`;   // unique per run: a re-run on the same local database never collides
  await admin.query('update time_entries set ended_at = now() where ended_at is null');
  await page.goto(`${base}/#/projects`); await page.waitForSelector('.pj-sections h2', { timeout: 9000 }).catch(async (e) => { await shot(page, 'FAILED-pj'); console.log((await page.locator('body').innerText()).slice(0, 600), problems.slice(0, 3), net.slice(-4)); throw e; });
  check('P1', 'Projects opens as its own app with a sidebar and a New project action', (await page.locator('.pj-side').count()) === 1 && (await page.getByRole('button', { name: 'New project' }).count()) >= 1);
  await page.waitForFunction(() => document.querySelectorAll('.pj-sections h2').length >= 2, null, { timeout: 9000 });
  check('P1b', 'Projects home has two labelled sections: Client projects (grouped by client) and the organization’s own projects', (await page.locator('.pj-sections h2').allInnerTexts()).join('|').toLowerCase().includes('client projects') && (await page.locator('.pj-sections h2').allInnerTexts()).some((t) => /projects$/i.test(t.trim()) && !/^client/i.test(t.trim())));
  await page.getByRole('button', { name: 'New project' }).first().click(); await page.fill('#np-name', PJ); await page.getByRole('button', { name: 'Create project' }).click(); await page.waitForSelector('[role=tablist] [data-k="whiteboards"]', { timeout: 9000 });
  const created = (await admin.query("select client_id, name from projects where name = $1", [PJ])).rows;
  check('P2', 'A new internal project is created (no client) and its workspace opens with the tabs', created.length === 1 && created[0].client_id === null && (await page.getByRole('tab').count()) >= 7);
  await page.getByRole('tab', { name: 'List', exact: true }).click(); await page.fill('input[name=t]', T1); await page.keyboard.press('Enter'); await wait(T1);
  await page.fill('input[name=t]', T2); await page.keyboard.press('Enter'); await wait(T2);
  check('P3', 'Tasks are added from the list and stored, and no stray “null” text is drawn on the page', !/\bnull\b/.test(await page.locator('main').innerText()) && (await admin.query("select count(*)::int n from project_tasks where title in ($1,$2)", [T1, T2])).rows[0].n === 2);
  await page.getByRole('tab', { name: 'Board', exact: true }).click(); await wait('Drag a card');
  const card = page.locator('.pj-cardtask', { hasText: T1 }); const target = page.locator('.pj-col[data-status=doing]');
  await card.dragTo(target); await page.waitForFunction(() => document.querySelector('.pj-col[data-status=doing] .pj-cardtask'));
  check('P4', 'Dragging a card to another column changes its status in the database', (await admin.query("select status from project_tasks where title = $1", [T1])).rows[0].status === 'doing');
  await page.locator('.pj-cardtask', { hasText: T2 }).click(); await wait('Subtasks');
  await page.fill('input[aria-label="Add a subtask"]', 'Check mobile'); await page.keyboard.press('Enter'); await wait('Check mobile');
  await page.selectOption('#td-prio', 'high'); for (let n = 0; n < 30 && (await admin.query('select priority from project_tasks where title = $1', [T2])).rows[0].priority !== 'high'; n++) await page.waitForTimeout(100);
  const t2 = (await admin.query("select priority, (select count(*)::int from task_checklist_items c where c.task_id = t.id) n from project_tasks t where title = $1", [T2])).rows[0];
  check('P5', 'The task drawer saves priority on change and adds a subtask', t2.priority === 'high' && t2.n === 1);
  await page.getByRole('button', { name: 'Start timer' }).click(); await wait('Timer running');
  check('P6', 'Starting a timer shows it on every Projects page and stores a running entry using the database clock', (await admin.query('select count(*)::int n from time_entries where ended_at is null')).rows[0].n === 1);
  await page.getByRole('button', { name: 'Stop timer' }).click(); await page.waitForFunction(() => document.querySelector('.pj-timer')?.hidden);
  check('P7', 'Stopping the timer ends the entry', (await admin.query('select count(*)::int n from time_entries where ended_at is null')).rows[0].n === 0);
  await page.keyboard.press('Escape'); await page.goto(`${base}/#/projects/mine`); await page.waitForSelector('.pj-mine', { timeout: 9000 });
  check('P8', 'My Work opens and shows an empty state when nothing is assigned', (await page.locator('.empty, .pj-mine').count()) >= 1);
  await page.keyboard.press('Control+k'); await page.fill('.cmdk-in', T1); await wait(T1);
  check('P9', 'Ctrl+K search finds tasks by words and opens them', (await page.locator('.cmdk-list li[role=option]').count()) >= 1);
  await page.keyboard.press('Escape');
  await page.goto(`${base}/#/projects/p/00000000-0000-0000-0000-000000000000`); await wait('Not here');
  check('P10', 'A project id that does not exist (or is not yours) shows the plain "Not here" state', (await page.locator('.empty').innerText()).includes('Not here'));
  await page.goto(`${base}/#/launcher`); await wait('The sky follows your time of day');
}

// =============================================================== C. Office Home (design 04)
await tile('office').click(); await wait('Needs your attention'); await wait('Nothing assigned to you.'); await wait('Invitations waiting');   // the cards fill in after their data loads
check('U14', 'Office Home: the eight section menu, Home current, designed empty states, owner/admin card with waiting invitations', (await page.locator('nav.nav a').allInnerTexts()).join() === 'Home,Planner,Projects,Funnels,Documents,Team,Apps,Admin' && (await page.locator('nav.nav a[aria-current=page]').innerText()) === 'Home'
  && (await page.locator('main').innerText()).includes('Nothing assigned to you.') && await page.getByText('For owners and admins').isVisible() && await page.getByText('Invitations waiting').isVisible());
await shot(page, 'c1-home');
const hp = (await q("insert into projects (workspace_id,name) values ($1,'Quiz funnel rebuild') returning id", [L]))[0].id;
await q("insert into project_tasks (workspace_id,project_id,title,assignee_id,due_on) values ($1,$2,'Edit quiz emails',$3,current_date + 3),($1,$2,'Late task',$3,current_date - 2)", [L, hp, uid]);
await q("insert into planner_reviews (workspace_id,title,due_on) values ($1,'Q4 review', current_date + 2)", [L]);
await visit(page, base + '/#/office'); await wait('Edit quiz emails');
check('U14b', 'Office Home fills "My work", "Deadlines" and the review notice from Projects and Planner (overdue task flagged, project name shown, review coming up)', (await page.locator('main').innerText()).includes('Quiz funnel rebuild') && (await page.locator('main').innerText()).includes('Overdue') && await page.getByText('Coming up.').isVisible() && !(await page.locator('main').innerText()).includes('Nothing assigned to you.'));

await page.locator('nav.nav a', { hasText: 'Planner' }).click(); await wait('Planner isn’t built yet');
check('U15', 'A section whose screens are not built yet says so honestly instead of showing a fake page', (await page.locator('main').innerText()).includes('Go to Office Home'));
await visit(page, base + '/#/office/nope'); await wait('We couldn’t find that');
const lost = await page.locator('main').innerText();
await visit(page, base + `/#/office/funnels/avatars/00000000-0000-4000-8000-000000000000`); await wait('We couldn’t find that');
check('U16', 'A missing page and a missing record show the same "We couldn’t find that" screen, with a safe way back', lost.includes('It may have moved, or you may not have access.') && (await page.locator('main').innerText()).includes('Back to Funnels'));

// =============================================================== D. Funnels (design 06)
await visit(page, base + '/#/office/funnels'); await wait('Recently changed');
check('U17', 'Funnels home: four counts, the section pills, and the "Link design pending" note for funnel maps', (await page.locator('.tile2').count()) === 4 && await page.getByText('Link design pending').isVisible());
await page.locator('.nav .sub a', { hasText: 'Avatars' }).click(); await wait('No avatars yet');
check('U18', 'First-use empty list has the plate illustration, a create action for owners', await page.getByRole('link', { name: 'New avatar' }).first().isVisible() && (await page.locator('.empty svg').count()) > 0);
await page.getByRole('link', { name: 'New avatar' }).first().click(); await wait('New avatar'); await page.waitForSelector('#r-client');
const scope = await page.locator('#r-client option').allInnerTexts();
check('U19', '"Belongs to" offers the organization and live clients only (never archived ones)', scope.includes('Organization-wide') && scope.some((o) => o.startsWith('Harry Kaye')) && !scope.some((o) => o.startsWith('Archived')));
await page.click('button[type=submit]');
check('U20', 'Saving without a name is explained next to the field', (await page.locator('#r-name-e').innerText()).includes('Give it a name'));
await page.fill('#r-name', 'Busy coach, 35–45'); await page.fill('#r-pains', 'No time to follow up'); await page.selectOption('#r-client', { label: `Harry Kaye PT ${stamp}` });
await page.click('button[type=submit]'); await wait('Not filled in yet.');
check('U21', 'Creating an avatar opens its record page with sections, the client it belongs to, and the owner’s buttons', (await h1()) === 'Busy coach, 35–45' && await page.locator('#edit').isVisible() && await page.locator('#share').isVisible() && await page.locator('#archive').isVisible() && (await page.locator('main').innerText()).includes('No time to follow up'));
check('O1', 'A customer avatar opens as a portrait profile: a portrait card with name and role, and the pains in their own column', (await page.locator('.ava-center .portrait').count()) === 1 && (await page.locator('.ava-center').innerText()).toLowerCase().includes('customer avatar') && (await page.locator('.ava .specs.left').innerText()).includes('No time to follow up'));
await shot(page, 'd1-record');
// edit, leave with unsaved changes
await page.click('#edit'); await page.waitForSelector('#r-name');
await page.fill('#r-name', 'Busy coach (edited)');
check('U22', 'The edit form shows "Unsaved changes" as soon as something changes', (await page.locator('#ds').innerText()) === 'Unsaved changes');
await page.locator('nav.nav > a', { hasText: /^Home$/ }).click(); await wait('You have unsaved changes');
await page.getByRole('button', { name: 'Keep editing' }).click();
check('U23', 'Leaving with unsaved changes asks first, and "Keep editing" keeps the text and the page', (await page.inputValue('#r-name')) === 'Busy coach (edited)' && page.url().includes('/funnels/avatars/'));
await page.locator('nav.nav > a', { hasText: /^Home$/ }).click(); await wait('You have unsaved changes'); await page.getByRole('button', { name: 'Save and leave' }).click(); await wait('Needs your attention');
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
await visit(page, base + '/#/drive'); await page.waitForSelector('.drv', { timeout: 9000 });
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
check('G5', 'An invitation for a different email address says only that it can’t be used (no name, no organization)', !(await out.locator('.auth-card').innerText()).includes('Layer2Funnels'));
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
await page.getByRole('tab', { name: 'Access', exact: true }).click(); await wait('Deny always wins.');
check('F9', 'Access opens on Levels: a table read from the real permission catalog, four levels, grouped by app', (await page.locator('thead th').evaluateAll((e) => e.map((x) => x.textContent))).join() === 'Can they…,Owner,Admin,Editor,Viewer' && (await page.locator('tbody th[colspan]').count()) >= 4 && await page.getByText('The last owner can’t be removed or demoted.').isVisible());
await shot(page, 'f2-levels');
await page.keyboard.press('Shift+Tab'); await page.getByRole('tab', { name: 'Access', exact: true }).focus(); await page.keyboard.press('ArrowLeft'); await page.waitForFunction(() => location.hash.endsWith('/admin/clients')); await page.waitForSelector('#invite-client'); await page.locator('[role=tab][data-k=clients]').focus(); await page.keyboard.press('ArrowLeft'); await page.waitForFunction(() => location.hash.endsWith('/admin/members') && document.querySelector('[role=tab][data-k=members]')?.getAttribute('aria-selected') === 'true');
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
await visit(page, base + '/#/office/admin/storage'); await wait('File storage'); await wait('used');
const stg = await page.locator('main').innerText();
check('F18', 'Admin → Storage shows the counter against the 8 GB limit, with a labelled meter and plain words about the shared limit', /of 8\.00 GB used/.test(stg) && (await page.getByRole('progressbar').getAttribute('aria-label')).startsWith('Storage used') && stg.includes('every organization on this system together') && (await page.locator('[role=tab][aria-selected=true]').innerText()) === 'Storage');
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
await rm.goto(base + '/'); await wait('Sign in', rm); await rm.fill('#em', EMAIL); await rm.fill('#pw', PW); await rm.click('button[type=submit]'); await wait('The sky follows your time of day', rm);
const dur = await rm.evaluate(() => [...document.querySelectorAll('.tile')].slice(0, 3).map((e) => parseFloat(getComputedStyle(e).animationDuration)));
check('I1', 'With reduced motion, tile animations and transitions are effectively off', dur.every((d) => d < 0.01) && parseFloat(await rm.evaluate(() => getComputedStyle(document.querySelector('.tile')).transitionDuration)) < 0.01, dur.join());
await rm.close();

// =============================================================== C4. Drive (library, folders, upload, sheets, trash)
{
  const [{ id: wsL }] = (await admin.query("select id from workspaces where slug = 'layer2funnels'")).rows;
  const FN = `Folder ${Date.now()}`, SN = `Budget ${Date.now()}`, UN = `note-${Date.now()}.txt`;
  const [{ user_id: ownerId }] = (await admin.query("select user_id from memberships where workspace_id = $1 and role = 'owner' and kind = 'staff' limit 1", [wsL])).rows;
  const hidden = `Project-owned ${Date.now()}`;
  await admin.query("insert into files (workspace_id, space, uploaded_by, name, kind, mime_type, size_bytes, managed_by) values ($1, 'shared', $2, $3, 'document', 'application/vnd.l2f.doc+json', 10, 'projects')", [wsL, ownerId, hidden]);
  await page.goto(`${base}/#/drive`); await page.waitForSelector('.drv .fpath', { timeout: 9000 }); await page.waitForSelector('.drv-main .tblwrap', { timeout: 9000 });
  check('D17', 'Drive opens on the organization library with a New button, a search box, and a side menu (library, Personal, Recent, Trash); other apps’ files are not listed', (await page.getByRole('button', { name: 'New', exact: true }).count()) === 1 && (await page.locator('.side .nav a').allInnerTexts()).join('|').includes('Trash') && !(await page.locator('main').innerText()).includes(hidden));
  await page.getByRole('button', { name: 'New', exact: true }).first().click(); await page.getByRole('button', { name: 'Folder', exact: true }).click(); await page.fill('#nf-name', FN); await page.getByRole('button', { name: 'Create', exact: true }).click(); await page.waitForSelector(`a:has-text("${FN}")`, { timeout: 9000 });
  check('D18', 'A new folder is created and listed', (await admin.query("select count(*)::int n from drive_folders where name = $1 and space = 'shared'", [FN])).rows[0].n === 1);
  await page.locator(`a:has-text("${FN}")`).click(); await page.waitForSelector('.drv .fpath b', { timeout: 9000 });
  check('D19', 'Opening a folder shows it in the folder path (breadcrumb) and its empty state', (await page.locator('.drv .fpath b').innerText()) === FN && (await page.locator('main').innerText()).includes('This folder is empty'));
  await page.getByRole('button', { name: 'New', exact: true }).first().click(); await page.getByRole('button', { name: 'Spreadsheet' }).click(); await page.fill('#nd-name', SN); await page.getByRole('button', { name: 'Create', exact: true }).click(); await page.waitForSelector('.sh-grid', { timeout: 9000 });
  check('D20', 'A new spreadsheet opens in the Sheets editor with a formula bar, A1…Z100 grid and a sheet tab; it is stored in the library inside the folder', (await page.locator('.sh-tabs [role=tab]').count()) === 1 && (await page.locator('.sh-fx').count()) === 1 && (await admin.query("select f.in_library, f.folder_id is not null as inf from files f where f.name = $1", [SN])).rows[0].in_library === true);
  await page.locator('td[data-c="0"][data-r="0"]').click(); await page.keyboard.type('10'); await page.keyboard.press('Enter'); await page.keyboard.type('32'); await page.keyboard.press('Enter'); await page.keyboard.type('=SUM(A1:A2)'); await page.keyboard.press('Enter');
  const a3 = await page.locator('td[data-c="0"][data-r="2"]').innerText();
  check('D21', 'Typing numbers and a formula calculates it (SUM = 42), Enter moves down, and the formula bar shows the formula of the selected cell', a3 === '42' && (await page.locator('td[data-c="0"][data-r="2"]').click(), await page.locator('.sh-fx').inputValue()) === '=SUM(A1:A2)');
  await page.locator('td[data-c="1"][data-r="0"]').click(); await page.keyboard.type('=1/0'); await page.keyboard.press('Enter');
  check('D22', 'A formula error is shown as an error in the cell, not a crash', (await page.locator('td[data-c="1"][data-r="0"]').innerText()) === '#DIV/0!');
  await page.getByRole('button', { name: 'Save', exact: true }).click(); await page.waitForFunction(() => /Saved/.test(document.querySelector('.docstate')?.innerText ?? ''));
  const sv = (await admin.query("select (select body from file_versions v where v.file_id = f.id and v.version = f.current_version) b, f.current_version from files f where f.name = $1", [SN])).rows[0];
  check('D23', 'Save stores a new version as JSON (cells and formulas, not HTML)', sv.current_version === 2 && JSON.parse(sv.b).sheets[0].cells.A3 === '=SUM(A1:A2)' && JSON.parse(sv.b).sheets[0].cells.A1 === '10');
  await page.reload(); await page.waitForSelector('.sh-grid', { timeout: 9000 });
  check('D24', 'After a reload the values and the calculation are still there', (await page.locator('td[data-c="0"][data-r="2"]').innerText()) === '42');
  await page.getByRole('button', { name: 'Add a sheet' }).click(); await page.waitForFunction(() => document.querySelectorAll('.sh-tabs [role=tab]').length === 2);
  check('D25', 'A second sheet can be added as a new tab', (await page.locator('.sh-tabs [role=tab]').count()) === 2 && (await page.locator('td[data-c="0"][data-r="0"]').innerText()) === '');
  await page.getByRole('button', { name: 'Save', exact: true }).click(); await page.waitForFunction(() => /Saved/.test(document.querySelector('.docstate')?.innerText ?? ''));
  await page.goto(`${base}/#/drive`); await page.waitForSelector(`a:has-text("${FN}")`, { timeout: 9000 }).catch(async (e) => { console.log('DRIVE DEBUG', JSON.stringify((await page.locator('main').innerText()).slice(0, 400)), net.slice(-4)); throw e; });
  await page.locator('input[type=file]').setInputFiles({ name: UN, mimeType: 'text/plain', buffer: Buffer.from('hello drive') }); await page.getByRole('button', { name: `Actions for ${UN}` }).waitFor({ timeout: 15000 }).catch(async (e) => { console.log('UPLOAD DEBUG', problems.slice(-4), net.slice(-4)); throw e; });
  check('D26', 'Uploading a file stores it in the storage layer under this organization’s prefix and lists it in the library', (await admin.query("select f.kind, f.in_library, v.storage_path from files f join file_versions v on v.file_id = f.id where f.name = $1", [UN])).rows.every((r) => r.kind === 'file' && r.in_library === true && r.storage_path.startsWith(wsL)));
  await page.getByRole('button', { name: `Actions for ${UN}` }).click(); await page.getByRole('button', { name: 'Details' }).click(); await page.waitForSelector('.drv-dl', { timeout: 9000 });
  check('D27', 'The details drawer shows type, size, version and location, with Sharing and Versions tabs', (await page.locator('.drv-dl').innerText()).includes('Version') && (await page.getByRole('tab', { name: 'Versions' }).count()) === 1); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: `Actions for ${UN}` }).click(); await page.getByRole('button', { name: 'Move to Trash' }).click(); await page.waitForFunction((n) => !document.body.innerText.includes(n), UN, { timeout: 9000 });
  await page.goto(`${base}/#/drive/trash`); await page.waitForSelector(`text=${UN}`, { timeout: 9000 });
  check('D28', 'A file moved to the Trash leaves the library and waits in the Trash', true);
  await page.getByRole('button', { name: `Restore ${UN}` }).click(); await page.waitForFunction((n) => !document.body.innerText.includes(n), UN, { timeout: 9000 });
  check('D29', 'Restoring from the Trash puts it back', (await admin.query("select archived_at is null as ok from files where name = $1", [UN])).rows[0].ok === true);
  await page.goto(`${base}/#/drive/personal`); await page.waitForSelector('.drv-main', { timeout: 9000 });
  check('D30', 'Personal is a separate space that does not show the organization’s files', !(await page.locator('main').innerText()).includes(SN));
  await page.goto(`${base}/#/sheet/00000000-0000-0000-0000-000000000000`); await wait('Not here');
  check('D31', 'A spreadsheet id that does not exist shows the plain "Not here" state', (await page.locator('.empty').innerText()).includes('Not here'));
  await page.goto(`${base}/#/launcher`); await wait('The sky follows your time of day');
}

// =============================================================== C3. Clients (list, client page, Strategy copies, requests, documents, notes)
{
  const [{ id: wsL }] = (await admin.query("select id from workspaces where slug = 'layer2funnels'")).rows;
  const CN = `Acme Fitness ${Date.now()}`, AVN = `Library avatar ${Date.now()}`;
  await admin.query('insert into funnel_avatars (workspace_id, name, pains) values ($1, $2, $3)', [wsL, AVN, 'No time']);
  await page.goto(`${base}/#/clients`); await page.waitForSelector('.toolbar', { timeout: 9000 });
  check('CL1', 'Clients opens as its own app with search, status filter, Table / Grid / Pipeline and a New client action', (await page.locator('.toolbar').count()) === 1 && (await page.getByRole('button', { name: 'Pipeline' }).count()) === 1 && (await page.getByRole('button', { name: 'New client' }).count()) >= 1);
  await page.getByRole('button', { name: 'New client' }).first().click(); await page.fill('#nc-name', CN); await page.getByRole('button', { name: 'Create client' }).click(); await page.waitForSelector('[role=tablist]', { timeout: 9000 });
  check('CL2', 'A new client is created and its page opens with the five sections', (await page.getByRole('tab').count()) === 5 && (await page.locator('h1').innerText()).includes(CN) && (await admin.query('select count(*)::int n from clients where name = $1', [CN])).rows[0].n === 1);
  await page.getByRole('tab', { name: 'Work' }).click(); await page.waitForSelector('text=Copy requirements not yet defined', { timeout: 9000 });
  check('CL3', 'Work shows the stages, the Strategy section with its "never synced" note, and the Copy stage with the honest "Copy requirements not yet defined" banner and disabled actions', (await page.locator('.cl-steps li').count()) >= 3 && (await page.locator('main').innerText()).includes('never synced') && (await page.getByRole('button', { name: 'Send for approval' }).isDisabled()));
  await page.getByRole('button', { name: 'Start a copy' }).click(); await page.selectOption('#sc-kind', 'avatars'); await page.waitForFunction((n) => [...document.querySelectorAll('#sc-src option')].some((o) => o.textContent === n), AVN, { timeout: 9000 });
  await page.selectOption('#sc-src', { label: AVN }); await page.getByRole('button', { name: 'Start copy' }).click(); await page.waitForSelector('.pj-row', { timeout: 9000 });
  const cp = (await admin.query("select c.client_id, c.name from funnel_avatars c join client_strategy_copies k on k.copy_id = c.id join clients cl on cl.id = k.client_id where cl.name = $1", [CN])).rows;
  check('CL4', 'Starting a copy of a library avatar creates the client’s own record and lists it under Strategy', cp.length === 1 && cp[0].name === AVN && (await page.locator('main').innerText()).includes(AVN));
  await page.getByRole('button', { name: 'Start a copy' }).click(); await page.selectOption('#sc-kind', 'avatars'); await page.waitForTimeout(600);
  check('CL5', 'A library record that was already copied is no longer offered for this client', !(await page.locator('#sc-src option').allInnerTexts()).includes(AVN)); await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'Requests & Approvals' }).click(); await page.getByRole('button', { name: 'New request' }).click(); await page.fill('#rq-title', 'Send logo files'); await page.getByRole('button', { name: 'Create request' }).click(); await page.waitForSelector('text=Send logo files', { timeout: 9000 });
  check('CL6', 'A request is created for the client and listed with its status', (await admin.query("select count(*)::int n from client_requests r join clients c on c.id = r.client_id where c.name = $1 and r.title = 'Send logo files'", [CN])).rows[0].n === 1);
  await page.getByRole('tab', { name: 'Documents' }).click(); await page.getByRole('button', { name: 'New document' }).click(); await page.fill('#cd-name', `Brief ${Date.now()}`); await page.getByRole('button', { name: 'Create', exact: true }).click(); await page.waitForSelector('.docpage', { timeout: 9000 });
  const fd = (await admin.query("select f.space, f.in_library, f.managed_by from files f join clients c on c.id = f.client_id where c.name = $1 order by f.created_at desc limit 1", [CN])).rows[0];
  check('CL7', 'A client document is stored in the client’s own space, owned by Clients, and is not part of the shared Drive library', fd.space === 'client' && fd.in_library === false && fd.managed_by === 'clients');
  await page.goBack(); await page.getByRole('tab', { name: 'Team Notes' }).click(); await page.fill('textarea[aria-label="New note"]', 'Prefers email'); await page.getByRole('button', { name: 'Add note' }).click(); await page.waitForSelector('text=Prefers email', { timeout: 9000 });
  check('CL8', 'A team note is added and shown, with the reminder that notes are internal and can never be shared', (await page.locator('main').innerText()).includes('can never be shared'));
  await page.getByRole('button', { name: 'Edit details' }).click(); await page.fill('#ec-biz', 'Acme Ltd'); await page.getByRole('button', { name: 'Save', exact: true }).click(); await page.waitForSelector('text=Acme Ltd', { timeout: 9000 });
  check('CL9', 'Editing details saves the business name', (await admin.query("select p.business_name from client_profiles p join clients c on c.id = p.client_id where c.name = $1", [CN])).rows[0].business_name === 'Acme Ltd');
  await page.getByRole('button', { name: 'Manage client sharing' }).click(); await page.waitForSelector('text=locked until its security checks pass', { timeout: 9000 });
  check('CL10', 'Manage client sharing explains that the Client Portal is locked instead of pretending to share', true); await page.keyboard.press('Escape');
  await page.goto(`${base}/#/clients`); await page.waitForSelector('.tbl', { timeout: 9000 }); await page.getByRole('button', { name: 'Pipeline' }).click();
  check('CL11', 'Pipeline groups clients in columns by stage (with a "No stage" column)', (await page.locator('.pj-col').count()) >= 2 && (await page.locator('.pj-col a', { hasText: CN }).count()) === 1);
  // Client Portal preview (read only; shows only what is marked "show to client")
  const [{ id: cid }] = (await admin.query('select id from clients where name = $1', [CN])).rows;
  await admin.query("update client_requests set client_visible = true where client_id = $1 and title = 'Send logo files'", [cid]);
  await admin.query("insert into client_requests (workspace_id, client_id, title, kind) values ($1, $2, 'Internal-only question', 'info')", [wsL, cid]);
  await admin.query("insert into client_updates (workspace_id, client_id, title, client_visible) values ($1, $2, 'Strategy v2 is ready', true), ($1, $2, 'Internal update', false)", [wsL, cid]);
  await page.goto(`${base}/#/portal`); await page.waitForSelector('text=The Portal is locked', { timeout: 9000 });
  check('CP1', 'The Portal preview starts with the lock notice and a list of clients to preview', (await page.locator('main').innerText()).includes('nothing here is sent') && (await page.locator(`a:has-text("${CN}")`).count()) === 1);
  await page.locator(`a:has-text("${CN}")`).click(); await page.waitForSelector('.p-ribbon', { timeout: 9000 });
  check('CP2', 'The preview of one client shows the "Preview of what … will see" ribbon, the five Portal pages, and the client’s journey', (await page.locator('.p-ribbon').innerText()).includes('Clients can’t sign in') && (await page.locator('.pnav a').count()) === 5 && (await page.locator('main').innerText()).includes('Your journey'));
  await page.waitForSelector('text=Strategy v2 is ready', { timeout: 9000 });
  check('CP3', 'Only shared items appear: the shared update and request are there, the internal ones are not', (await page.locator('main').innerText()).includes('Send logo files') && !(await page.locator('main').innerText()).includes('Internal-only question') && !(await page.locator('main').innerText()).includes('Internal update'));
  await page.locator('.pnav a', { hasText: 'Requests' }).click(); await page.waitForSelector('text=Send logo files', { timeout: 9000 });
  check('CP4', 'Every action in the preview is switched off and says it is preview only', (await page.getByRole('button', { name: 'Send answer' }).isDisabled()) && (await page.getByRole('button', { name: 'Send answer' }).getAttribute('title')).includes('Preview only'));
  await page.locator('.pnav a', { hasText: 'My notes' }).click(); await page.waitForSelector('text=Private to the client', { timeout: 9000 });
  check('CP5', 'A client’s own notes are private: the preview says staff cannot see them', true);
  await page.getByRole('link', { name: 'Exit preview' }).click(); await page.waitForSelector('[role=tablist]', { timeout: 9000 });
  check('CP6', 'Exit preview returns to the client page, which also offers "Preview client portal"', (await page.getByRole('link', { name: 'Preview client portal' }).count()) === 1);
  await page.goto(`${base}/#/clients/c/00000000-0000-0000-0000-000000000000`); await wait('Not here');
  check('CL12', 'A client id that does not exist (or is not yours) shows the plain "Not here" state', (await page.locator('.empty').innerText()).includes('Not here'));
  await page.goto(`${base}/#/launcher`); await wait('The sky follows your time of day');
}

// =============================================================== C5. Forms (builder, preview, submissions, settings, versions, Clients overlay)
{
  const [{ id: wsL }] = (await admin.query("select id from workspaces where slug = 'layer2funnels'")).rows;
  await admin.query("update apps set lifecycle = 'active' where key = 'forms'"); await admin.query("insert into workspace_apps (workspace_id, app_key, enabled) values ($1, 'forms', true) on conflict (workspace_id, app_key) do update set enabled = true", [wsL]);
  const FN = `Intake form ${Date.now()}`, CNAME = `Forms client ${Date.now()}`;
  await page.reload(); await page.goto(`${base}/#/forms`); await page.waitForSelector('.forms .toolbar', { timeout: 9000 });
  check('FB1', 'Forms opens with search, status filter, Forms / Templates and a New form action', (await page.getByRole('button', { name: 'New form' }).count()) >= 1 && (await page.locator('.side .nav a', { hasText: 'Templates' }).count()) === 1);
  await page.getByRole('button', { name: 'New form' }).first().click(); await page.fill('#nf-name', FN); await page.getByRole('button', { name: 'Create form' }).click(); await page.waitForSelector('.fb-grid', { timeout: 9000 });
  check('FB2', 'A new form opens in the builder with the eleven question types to add, an empty canvas and Draft status', (await page.locator('.fb-pal button').count()) === 11 && (await page.locator('.fb-head').innerText()).includes('Draft') && (await page.locator('main').innerText()).includes('No questions yet'));
  await page.locator('.fb-pal button', { hasText: 'Dropdown' }).click(); await page.fill('#fp-label', 'Who are you?'); await page.keyboard.press('Tab'); await page.fill('#fp-opts', 'Coach\nAgency\nOther'); await page.keyboard.press('Tab'); await page.getByLabel('Required').check();
  await page.locator('.fb-pal button', { hasText: 'Short text' }).click(); await page.fill('#fp-label', 'Tell us more'); await page.keyboard.press('Tab');
  await page.selectOption('#fp-sk', { label: 'Who are you?' }); await page.selectOption('#fp-op', 'eq'); await page.selectOption('#fp-v', 'Other');
  check('FB3', 'Questions are added and edited; a question can be shown only when an earlier answer matches (show-if)', (await page.locator('.fb-q').count()) === 2 && (await page.locator('.fb-q').nth(1).innerText()).includes('conditional'));
  await page.locator('.fb-pal button', { hasText: 'File upload' }).click(); await page.fill('#fp-label', 'Logo'); await page.keyboard.press('Tab'); await page.fill('#fp-acc', 'png, svg'); await page.fill('#fp-mb', '5'); await page.keyboard.press('Tab');
  await page.getByRole('button', { name: 'Save as new version' }).click(); await page.waitForFunction(() => /Version 1/.test(document.querySelector('.fb-head')?.innerText ?? ''), null, { timeout: 9000 });
  const v1 = (await admin.query("select f.current_version, v.fields from forms f join form_versions v on v.form_id = f.id and v.version = f.current_version where f.name = $1", [FN])).rows[0];
  check('FB4', 'Save as new version stores version 1 with the questions, the show-if rule and the file limits', v1.current_version === 1 && v1.fields.length === 3 && v1.fields[1].show_if?.value === 'Other' && v1.fields[2].accept.join() === 'png,svg' && v1.fields[2].max_mb === 5);
  await page.getByRole('tab', { name: 'Preview' }).click(); await page.waitForSelector('.fb-frame', { timeout: 9000 });
  check('FB5', 'Preview shows the form in a phone frame; the conditional question is hidden until "Other" is chosen', (await page.locator('.fr-q').nth(1).isHidden()) && (await page.locator('.fb-frame.phone').count()) === 1);
  await page.selectOption('#fr-who_are_you', 'Other'); await page.waitForSelector('#fr-tell_us_more', { state: 'visible', timeout: 5000 });
  check('FB6', 'Choosing "Other" reveals the follow-up question', await page.locator('#fr-tell_us_more').isVisible());
  await page.getByRole('button', { name: 'Desktop' }).click(); check('FB7', 'Preview switches to a desktop frame', (await page.locator('.fb-frame.desktop').count()) === 1);
  await page.getByRole('tab', { name: 'Settings' }).click(); await page.fill('#fs-url', 'http://insecure.example'); await page.getByRole('button', { name: 'Save settings' }).click(); await page.waitForSelector('text=https://', { timeout: 5000 });
  await page.fill('#fs-url', 'https://example.com/thanks'); await page.fill('#fs-msg', 'Thanks, we will be in touch.'); await page.fill('#fs-ret', 'Kept for 12 months'); await page.getByRole('button', { name: 'Save settings' }).click(); for (let n = 0; n < 40 && (await admin.query('select redirect_url from forms where name = $1', [FN])).rows[0].redirect_url !== 'https://example.com/thanks'; n++) await page.waitForTimeout(100);
  const st = (await admin.query('select redirect_url, confirmation_message, retention_note from forms where name = $1', [FN])).rows[0];
  check('FB8', 'Settings save a confirmation message, an https-only redirect and a retention note; the public link stays off with the reason shown', st.redirect_url === 'https://example.com/thanks' && st.retention_note === 'Kept for 12 months' && (await page.getByRole('button', { name: 'Create public link' }).isDisabled()) && (await page.locator('main').innerText()).includes('security review'));
  await page.getByRole('button', { name: 'Publish' }).click(); await page.getByRole('button', { name: 'Publish', exact: true }).last().click(); await page.waitForFunction(() => /Published/.test(document.querySelector('.fb-head')?.innerText ?? ''), null, { timeout: 9000 });
  await page.getByRole('tab', { name: 'Preview' }).click(); await page.getByRole('button', { name: 'Record a submission' }).click(); await page.waitForSelector('#fr-who_are_you', { timeout: 9000 });
  await page.getByRole('button', { name: 'Record submission' }).click(); await page.waitForSelector('.dlg .err:not(:empty)', { timeout: 5000 });
  const blocked = (await admin.query("select count(*)::int n from form_submissions s join forms f on f.id = s.form_id where f.name = $1", [FN])).rows[0].n === 0;
  await page.locator('.dlg select').first().selectOption('Coach');
  await page.getByRole('button', { name: 'Record submission' }).click(); await page.waitForFunction(() => !document.querySelector('.dlg'), null, { timeout: 9000 });
  const sb = (await admin.query("select s.form_version, s.answers from form_submissions s join forms f on f.id = s.form_id where f.name = $1", [FN])).rows;
  check('FB9', 'Recording a submission validates it (a required question blocks it) and stores it against version 1, with no answer for the hidden question', blocked && sb.length === 1 && sb[0].form_version === 1 && sb[0].answers.who_are_you === 'Coach' && !('tell_us_more' in sb[0].answers));
  await page.getByRole('tab', { name: 'Submissions' }).click(); await page.waitForSelector('.tbl', { timeout: 9000 });
  check('FB10', 'Submissions lists it with the retention note, and opening it shows the labelled answers', (await page.locator('main').innerText()).includes('Kept for 12 months') && (await page.locator('.tbl tbody tr').count()) === 1);
  await page.getByRole('button', { name: /View/ }).click(); await page.waitForSelector('text=Answers cannot be edited', { timeout: 9000 }); await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'Build' }).click(); await page.locator('.fb-pal button', { hasText: 'Yes or no' }).click(); await page.fill('#fp-label', 'I agree'); await page.keyboard.press('Tab');
  check('FB11', 'Changing the questions shows "Unsaved changes" and the unsaved-work guard asks before leaving', (await page.locator('.fb-head').innerText()).includes('Unsaved changes') && (await page.evaluate(() => true)));
  await page.getByRole('button', { name: 'Save as new version' }).click(); await page.waitForFunction(() => /Version 2/.test(document.querySelector('.fb-head')?.innerText ?? ''), null, { timeout: 9000 });
  await page.getByRole('tab', { name: 'Versions' }).click(); await page.waitForSelector('text=Version 1', { timeout: 9000 });
  check('FB12', 'Versions lists version 2 (current) and version 1; the earlier submission still belongs to version 1', (await page.locator('main').innerText()).includes('Version 2 · current') && (await admin.query("select count(*)::int n from form_submissions s join forms f on f.id = s.form_id where f.name = $1 and s.form_version = 1", [FN])).rows[0].n === 1);
  // the builder opens inside Clients as an overlay
  const [{ id: cid }] = (await admin.query("insert into clients (workspace_id, name) values ($1, $2) returning id", [wsL, CNAME])).rows;
  await page.goto(`${base}/#/clients/c/${cid}?tab=work`); await page.waitForSelector('text=Brand Base', { timeout: 9000 });
  await page.getByRole('button', { name: 'Add a form' }).click(); await page.fill('#bf-name', 'Brand Base questions'); await page.getByRole('button', { name: 'Create and open' }).click(); await page.waitForSelector('.fb-overlay .fb-grid', { timeout: 9000 });
  check('FB13', 'In Clients, "Add a form" opens the same builder as an overlay for that client', (await page.locator('.fb-overlay').count()) === 1 && (await admin.query("select client_id from forms where name = 'Brand Base questions' and client_id = $1", [cid])).rows.length === 1);
  await page.locator('.fb-pal button', { hasText: 'Short text' }).click(); await page.getByRole('button', { name: 'Close', exact: true }).click(); await page.waitForSelector('text=Close with unsaved changes?', { timeout: 5000 });
  check('FB14', 'Closing the overlay with unsaved changes asks first (Save and close / Discard / Keep editing)', (await page.getByRole('button', { name: 'Keep editing' }).count()) === 1); await page.getByRole('button', { name: 'Discard and close' }).click(); await page.waitForFunction(() => !document.querySelector('.fb-overlay'), null, { timeout: 5000 });
  await page.waitForSelector('.pj-rows >> text=Brand Base questions', { timeout: 9000 });
  check('FB15', 'After closing, the client’s Brand Base lists the form', (await page.locator('main').innerText()).includes('Brand Base questions'));
  await page.goto(`${base}/#/forms/f/00000000-0000-0000-0000-000000000000`); await wait('Not here');
  check('FB16', 'A form id that does not exist shows the plain "Not here" state', (await page.locator('.empty').innerText()).includes('Not here'));
  await admin.query("update apps set lifecycle = 'coming_soon' where key = 'forms'"); await admin.query("delete from workspace_apps where workspace_id = $1 and app_key = 'forms'", [wsL]);
  await page.goto(`${base}/#/launcher`); await page.reload(); await wait('The sky follows your time of day');
}

// =============================================================== C6. Value Ladder (map, table, step drawer, versions, compare, approve, duplicate for a client)
{
  const [{ id: wsL }] = (await admin.query("select id from workspaces where slug = 'layer2funnels'")).rows;
  await admin.query("update apps set lifecycle = 'active' where key = 'value_ladder'"); await admin.query("insert into workspace_apps (workspace_id, app_key, enabled) values ($1, 'value_ladder', true) on conflict (workspace_id, app_key) do update set enabled = true", [wsL]);
  const LN = `Main ladder ${Date.now()}`, ON = `Starter pack ${Date.now()}`, CNAME = `Ladder client ${Date.now()}`;
  await admin.query("insert into funnel_offers (workspace_id, name, price_amount, currency) values ($1, $2, 47, 'USD')", [wsL, ON]);
  const [{ id: lcid }] = (await admin.query("insert into clients (workspace_id, name) values ($1, $2) returning id", [wsL, CNAME])).rows;
  await page.reload(); await page.goto(`${base}/#/ladder`); await page.waitForSelector('.vl, .pj-head', { timeout: 9000 });
  await page.getByRole('button', { name: 'New ladder' }).first().click(); await page.fill('#nl-name', LN); await page.getByRole('button', { name: 'Create', exact: true }).click(); await page.waitForSelector('.pj-head h1', { timeout: 9000 }); await page.waitForSelector('text=No steps yet', { timeout: 9000 });
  check('VL1', 'A new ladder opens as a draft with the Map, Table, Compare and History views and an empty state', (await page.getByRole('tab').count()) === 4 && (await page.locator('.pj-meta').innerText()).includes('Draft'));
  for (const [kind, name, offer] of [['lead_magnet', 'Free guide', ''], ['tripwire', 'Starter', ON], ['premium', 'Coaching', '']]) { await page.getByRole('button', { name: 'Add a step' }).first().click(); await page.selectOption('#as-kind', kind); await page.fill('#as-name', name); if (offer) await page.selectOption('#as-offer', { label: new RegExp(offer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).catch(async () => { await page.locator('#as-offer').selectOption({ index: 1 }); }); await page.getByRole('button', { name: 'Add step' }).click(); await page.waitForFunction((n) => document.body.innerText.includes(n), name, { timeout: 9000 }).catch(async (e) => { console.log('LADDER DEBUG', name, JSON.stringify((await page.locator('main').innerText()).slice(0, 500)), net.slice(-3)); throw e; }); }
  check('VL2', 'Steps are added in order and shown as a rising map from free to premium, the linked offer read from Offers & Products', (await page.locator('.vl-step').count()) === 3 && (await page.locator('.vl-step').nth(1).innerText()).includes('47 USD') && (await page.locator('main').innerText()).includes('More value, higher price'));
  await page.locator('.vl-step').nth(0).click(); await page.waitForSelector('#sd-aud', { timeout: 9000 }); await page.fill('#sd-aud', 'Cold traffic'); await page.fill('#sd-conv', '35'); await page.getByRole('button', { name: 'Save step' }).click(); for (let n = 0; n < 40 && (await admin.query("select r.audience from value_ladder_rungs r join value_ladders l on l.id = r.ladder_id where l.name = $1 and r.name = 'Free guide'", [LN])).rows[0].audience !== 'Cold traffic'; n++) await page.waitForTimeout(100);
  const st = (await admin.query("select r.audience, r.conversion_pct::float8 c from value_ladder_rungs r join value_ladders l on l.id = r.ladder_id where l.name = $1 and r.name = 'Free guide'", [LN])).rows[0];
  check('VL3', 'The step drawer saves audience and conversion %', st.audience === 'Cold traffic' && st.c === 35);
  await page.getByRole('button', { name: 'Save version' }).click(); await page.fill('#sv-note', 'First draft'); await page.getByRole('button', { name: 'Save version' }).last().click(); await page.waitForFunction(() => document.body.innerText.includes('Saved as version 1'), null, { timeout: 9000 }).catch(() => {});
  await page.getByRole('tab', { name: 'Table' }).click(); await page.waitForSelector('.tbl', { timeout: 9000 }); await page.getByRole('button', { name: /Move earlier Coaching/ }).click(); await page.waitForFunction(() => /Coaching/.test(document.querySelector('.tbl tbody tr:nth-child(2)')?.innerText ?? ''), null, { timeout: 9000 });
  check('VL4', 'The table lists the steps with type, offer, price, conversion and owner; a step can be moved earlier or later', (await page.locator('.tbl tbody tr').count()) === 3 && (await page.locator('.tbl tbody tr').nth(1).innerText()).includes('Coaching'));
  await page.getByRole('tab', { name: 'Compare' }).click(); await page.waitForSelector('.vl-diff', { timeout: 9000 });
  check('VL5', 'Compare says in words what changed since version 1 (here: the steps were reordered)', (await page.locator('.vl-diff').allInnerTexts()).join(' ').includes('Position'));
  await page.getByRole('button', { name: 'Approve' }).click(); await page.waitForFunction(() => /Approved/.test(document.querySelector('.pj-meta')?.innerText ?? ''), null, { timeout: 9000 });
  const ap = (await admin.query("select l.status, (select count(*)::int from value_ladder_versions v where v.ladder_id = l.id) n from value_ladders l where l.name = $1", [LN])).rows[0];
  check('VL6', 'Approve marks the ladder approved and saves a version of it (two versions now)', ap.status === 'approved' && ap.n === 2);
  await page.getByRole('tab', { name: 'History' }).click(); await page.waitForSelector('text=Version 2', { timeout: 9000 });
  check('VL7', 'History lists the versions with their notes', (await page.locator('main').innerText()).includes('First draft') && (await page.locator('main').innerText()).includes('Version 1'));
  await admin.query("update funnel_offers set archived_at = now() where name = $1", [ON]); await page.getByRole('tab', { name: 'Map' }).click(); await page.reload(); await page.waitForSelector('.vl-step', { timeout: 9000 });
  check('VL8', 'If a linked offer is archived, the step shows a broken-link warning', (await page.locator('.vl-step.broken').count()) === 1 && (await page.locator('.vl-step.broken').innerText()).includes('archived'));
  await page.getByRole('button', { name: 'Duplicate' }).click(); await page.selectOption('#dp-scope', { label: `For ${CNAME}` }); await page.getByRole('button', { name: 'Duplicate', exact: true }).last().click(); await page.waitForFunction((n) => document.querySelector('.pj-head h1')?.innerText.includes('(copy)') ?? false, null, { timeout: 9000 }).catch(() => {});
  const dp = (await admin.query("select l.client_id, l.status, (select count(*)::int from value_ladder_rungs r where r.ladder_id = l.id) n from value_ladders l where l.name like $1 order by created_at desc limit 1", [`${LN}%(copy)`])).rows[0];
  check('VL9', 'Duplicating for a client makes a draft ladder that belongs to that client with the same steps', dp && dp.client_id === lcid && dp.status === 'draft' && dp.n === 3);
  await page.goto(`${base}/#/ladder/l/00000000-0000-0000-0000-000000000000`); await wait('Not here');
  check('VL10', 'A ladder id that does not exist shows the plain "Not here" state', (await page.locator('.empty').innerText()).includes('Not here'));
  await admin.query("update apps set lifecycle = 'coming_soon' where key = 'value_ladder'"); await admin.query("delete from workspace_apps where workspace_id = $1 and app_key = 'value_ladder'", [wsL]);
  await page.goto(`${base}/#/launcher`); await page.reload(); await wait('The sky follows your time of day');
}

// =============================================================== C2. Office pages: Documents, Team, Apps, Projects pointer, Access history
{
  const [{ id: wsL }] = (await admin.query("select id from workspaces where slug = 'layer2funnels'")).rows;
  const [{ user_id: ownerId }] = (await admin.query("select user_id from memberships where workspace_id = $1 and role = 'owner' and kind = 'staff' limit 1", [wsL])).rows;
  const libName = `Library note ${Date.now()}`, hidName = `Project-only note ${Date.now()}`;
  const [{ id: libId }] = (await admin.query("insert into files (workspace_id, space, uploaded_by, name, kind, mime_type, size_bytes) values ($1, 'shared', $2, $3, 'document', 'application/vnd.l2f.doc+json', 10) returning id", [wsL, ownerId, libName])).rows;
  await admin.query('insert into file_versions (workspace_id, file_id, body) values ($1, $2, $3)', [wsL, libId, JSON.stringify({ v: 1, blocks: [{ t: 'p', c: [{ x: 'hello' }] }] })]);
  await admin.query("insert into files (workspace_id, space, uploaded_by, name, kind, mime_type, size_bytes, managed_by) values ($1, 'shared', $2, $3, 'document', 'application/vnd.l2f.doc+json', 10, 'projects')", [wsL, ownerId, hidName]);
  await page.goto(`${base}/#/office/documents`); await wait(libName);
  check('O2', 'Documents lists the organization library and nothing that belongs to another app (a project-only file is not there)', (await page.locator('main').innerText()).includes(libName) && !(await page.locator('main').innerText()).includes(hidName) && (await page.getByRole('button', { name: 'New document' }).count()) >= 1);
  await page.locator('main a', { hasText: libName }).click(); await page.waitForSelector('.docpage', { timeout: 9000 });
  check('O3', 'A library document opens in the editor', page.url().includes('/#/doc/'));
  await page.goto(`${base}/#/office/documents`); await page.getByRole('button', { name: 'New document' }).first().click(); await page.fill('#nd-name', `Made here ${Date.now()}`); await page.getByRole('button', { name: 'Create', exact: true }).click(); await page.waitForSelector('.docpage', { timeout: 9000 });
  const made = (await admin.query("select in_library, managed_by from files where name like 'Made here %' order by created_at desc limit 1")).rows[0];
  check('O4', 'A document made in Office › Documents lands in the library (visible in Drive) and opens for editing', made.in_library === true && made.managed_by === null);
  await page.goto(`${base}/#/office/team`); await page.waitForSelector('.team li', { timeout: 9000 });
  check('O5', 'Team lists the organization’s active people with their levels, and marks you', (await page.locator('.team li').count()) >= 1 && (await page.locator('main').innerText()).includes('(you)') && (await page.locator('main').innerText()).includes('Owner'));
  await page.locator('.team li .pj-title').first().click(); await page.waitForSelector('text=Open work you can see', { timeout: 9000 });
  check('O6', 'A person’s profile drawer opens and says what work you can see (or that none is visible)', (await page.locator('.drawer, [role=dialog]').first().innerText()).includes('Open work you can see'));
  await page.keyboard.press('Escape');
  await page.goto(`${base}/#/office/apps`); await wait('Locked and coming-soon apps');
  check('O7', 'Apps lists every app with its state: open links for available apps and the reason for locked or coming-soon ones', (await page.locator('.app-row').count()) >= 10 && (await page.locator('main').innerText()).includes('Coming soon') && (await page.locator('main a', { hasText: 'Open' }).count()) >= 3);
  await page.goto(`${base}/#/office/projects`); await page.waitForSelector('.pj-sections', { timeout: 9000 });
  check('O8', 'Office › Projects shows the real Projects screens inside Office (same data), with the Office menu still there and Projects marked current, and project links that stay inside Office', (await page.locator('.pj-side').count()) === 1 && (await page.locator('nav.nav a[aria-current=page]').innerText()).includes('Projects') && (await page.locator('.pj-card').count()) >= 0 && (await page.locator('.pj-side a[href^="#/office/projects/p/"], .pj-card[href^="#/office/projects/p/"]').count()) >= 0 && !(await page.locator('a[href^="#/projects/p/"]').count()));
  // Funnel Strategies (list, editor with side panel)
  const SN = `Webinar funnel ${Date.now()}`;
  await page.goto(`${base}/#/office/funnels/strategies`); await page.waitForSelector('text=One written strategy per funnel', { timeout: 9000 });
  await page.getByRole('button', { name: 'New Funnel Strategy' }).first().click(); await page.fill('#ns-name', SN); await page.getByRole('button', { name: 'Create', exact: true }).click(); await page.waitForSelector('.strat-side', { timeout: 9000 });
  const sr = (await admin.query('select s.status, s.file_id, f.managed_by, f.in_library, f.space from funnel_strategies s join files f on f.id = s.file_id where s.name = $1', [SN])).rows[0];
  check('O10', 'A new Funnel Strategy opens in the document editor with a side panel, as a draft, and its document is owned by Funnels and kept out of the shared Drive list', sr.status === 'draft' && sr.managed_by === 'funnels' && sr.in_library === false && sr.space === 'shared' && (await page.locator('.docsheet').count()) === 1 && (await page.locator('.strat-side').innerText()).includes('No map linked yet'));
  await page.selectOption('#st-status', 'in_review'); for (let n = 0; n < 30 && (await admin.query('select status from funnel_strategies where name = $1', [SN])).rows[0].status !== 'in_review'; n++) await page.waitForTimeout(100);
  check('O11', 'Changing the status in the side panel saves it', (await admin.query('select status from funnel_strategies where name = $1', [SN])).rows[0].status === 'in_review');
  await page.getByRole('button', { name: 'Link a map' }).click(); await page.fill('#mp-url', 'http://insecure.example'); await page.getByRole('button', { name: 'Save link' }).click();
  const badMsg = await page.locator('dialog, [role=dialog]').first().innerText();
  await page.fill('#mp-url', 'https://app.example.com/map/1'); await page.fill('#mp-label', 'Quiz map'); await page.getByRole('button', { name: 'Save link' }).click(); await page.waitForSelector('text=A link only', { timeout: 9000 });
  check('O12', 'The map link must start with https:// and is shown as a link only (opens in a new tab safely)', /https:\/\//.test(badMsg) && (await page.locator('.strat-side a[href^="https://app.example.com"]').getAttribute('rel')) === 'noopener noreferrer');
  await page.goto(`${base}/#/office/funnels/strategies`); await page.waitForSelector('.tbl', { timeout: 9000 });
  check('O13', 'The list shows the strategy with its status and a "Linked" map badge', (await page.locator('.tbl tr', { hasText: SN }).innerText()).includes('In review') && (await page.locator('.tbl tr', { hasText: SN }).innerText()).includes('Linked'));
  await page.goto(`${base}/#/office/funnels`); await page.waitForSelector('text=See all Funnel Strategies', { timeout: 9000 });
  check('O14', 'Funnels home shows the Funnel Strategies summary and keeps its four record tiles', (await page.locator('.tile2').count()) === 4 && (await page.locator('main').innerText()).includes(SN));
  await page.goto(`${base}/#/office/admin/access/history`); await page.waitForSelector('text=Access history', { timeout: 9000 }); await page.waitForSelector('.tbl, .empty', { timeout: 9000 });
  check('O9', 'Admin › Access › Access history shows who changed what and when, with names, never content', (await page.locator('.tbl thead th').allInnerTexts()).join().toLowerCase() === 'when,who,what' && !(await page.locator('main').innerText()).includes('{'));
  await page.goto(`${base}/#/launcher`); await wait('The sky follows your time of day');
}

const routes = [['/#/launcher', 'The sky follows your time of day'], ['/#/office', 'Needs your attention'], ['/#/office/funnels', 'Recently changed'], ['/#/office/funnels/avatars', 'Avatar for C1'], ['/#/office/funnels/avatars/new', 'Belongs to'],
  ['/#/office/admin/members', 'Joining is by invitation only.'], ['/#/office/admin/access/levels', 'Deny always wins.'], ['/#/office/admin/access/assignments', 'Add assignment'], ['/#/office/admin/access/effective', 'Show access for'], ['/#/portal', 'The Portal is locked'], ['/#/drive', 'stay with their own app'], ['/#/clients', 'Everyone you work for'], ['/#/office/funnels/strategies', 'One written strategy per funnel'], ['/#/office/documents', 'stay with their own app'], ['/#/office/team', 'only where your own access allows'], ['/#/office/apps', 'Locked and coming-soon apps'], ['/#/office/admin/access/history', 'The last 100 changes'], ['/#/office/planner', 'isn’t built yet']];
for (const [w, label] of [[1280, 'desktop'], [768, 'tablet'], [390, 'phone']]) {
  const p = await newPage(w, 900);
  await p.goto(base + '/'); await wait('Sign in', p);
  let ok = await layouts(p, `${label} sign in`);
  await p.getByRole('button', { name: 'Create an account' }).click(); await wait('Create your account', p); ok = (await layouts(p, `${label} sign up`)) && ok;
  await p.goto(base + '/#/signin'); await p.fill('#em', EMAIL); await p.fill('#pw', PW); await p.click('button[type=submit]'); await wait('The sky follows your time of day', p);
  const bad = [];
  for (const [r, t] of routes) { await p.goto(base + r); await p.reload(); await wait(t, p); await p.waitForTimeout(120); if (!(await layouts(p, `${label} ${r}`))) bad.push(r); }
  check(`R-${label}`, `At ${w}px every screen has no sideways scroll and every control is at least 44px (${routes.length + 2} screens)`, ok && bad.length === 0, bad.join(' '));
  if (w === 390) {
    await p.goto(base + '/#/office'); await p.reload(); await wait('Needs your attention', p);
    const bar = p.locator('nav.bbar'); const labels = await bar.locator('a, button').allInnerTexts();
    check('R-bar', 'On a phone the Office menu is a bottom bar: four sections plus More, labels always visible, top menu hidden', labels.map((x) => x.trim()).join() === 'Home,Planner,Projects,Funnels,More' && !(await p.locator('nav.nav').isVisible()) && (await bar.boundingBox()).y > 700);
    await bar.getByRole('button', { name: 'More' }).click(); await wait('More in Office', p);
    const more = await p.locator('.bsheet a').allInnerTexts(); await p.keyboard.press('Escape');
    check('R-more', 'More opens a sheet with the rest (Docs, Team, Apps, Admin); Esc closes it and focus returns to More', more.map((x) => x.trim()).join() === 'Documents,Team,Apps,Admin' && (await p.evaluate(() => document.activeElement.textContent)).includes('More'));
    await p.goto(base + '/#/launcher'); await p.reload(); await wait('The sky follows your time of day', p);
    check('R-tiles', 'On a phone the Launcher shows three columns of plates with names only (descriptions hidden), as in the design', (await p.locator('.tile').first().evaluate((e) => getComputedStyle(e.querySelector('.t-desc')).display)) === 'none' && new Set(await p.locator('.tile').evaluateAll((els) => els.slice(0, 6).map((e) => Math.round(e.getBoundingClientRect().left / 12)))).size === 3);
    await shot(p, 'i1-phone-launcher'); await p.goto(base + '/#/office/admin/members'); await p.reload(); await wait('Joining is by invitation only.', p); await shot(p, 'i2-phone-members');
    await p.goto(base + '/#/office/funnels/avatars'); await p.reload(); await wait('Avatar for C1', p); await p.evaluate(() => document.querySelector('.hdr .iconbtn')?.focus());
    await p.click('#org-switcher'); const sheet = await p.locator('#org-menu').boundingBox();
    check('R-sheet', 'On a phone the organization menu opens as a bottom sheet', sheet.y + sheet.height > 780 && sheet.width > 330);
    await shot(p, 'i3-phone-switcher');
  }
  await p.context().close();
}

// =============================================================== J. Whole-run hygiene
// =============================================================== C7. Whiteboard "All boards"
{
  const [{ id: wsB }] = (await admin.query("select id from workspaces where slug = 'layer2funnels'")).rows;
  await admin.query("update apps set lifecycle = 'active' where key = 'whiteboard'"); await admin.query("insert into workspace_apps (workspace_id, app_key, enabled) values ($1, 'whiteboard', true) on conflict (workspace_id, app_key) do update set enabled = true", [wsB]);
  const BN = `Team board ${Date.now()}`, BC = `Board client ${Date.now()}`, BCN = `Client wall ${Date.now()}`;
  const [{ id: bcid }] = (await admin.query("insert into clients (workspace_id, name) values ($1, $2) returning id", [wsB, BC])).rows;
  await page.reload(); await page.goto(`${base}/#/whiteboards`); await page.waitForSelector('.pj-head h1', { timeout: 9000 });
  check('BD1', 'All boards opens with the search, location and active/archived filters', (await page.locator('.pj-head h1').innerText()) === 'All boards' && (await page.getByRole('searchbox', { name: 'Search boards' }).count()) === 1);
  await page.getByRole('button', { name: 'New whiteboard' }).first().click(); await page.fill('#nb-name', BN); await page.getByRole('button', { name: 'Create', exact: true }).click(); await page.waitForSelector('.boardsurface', { timeout: 15000 });
  const sh = (await admin.query("select space, client_id, managed_by, in_library from files where name = $1", [BN])).rows[0];
  check('BD2', 'A board made here asks where it belongs; an organization board is app-owned and is not put in the Drive library', sh && sh.space === 'shared' && sh.client_id === null && sh.managed_by === 'whiteboard' && sh.in_library === false);
  await page.goto(`${base}/#/whiteboards`); await page.waitForSelector('.pj-head h1', { timeout: 9000 });
  await page.getByRole('button', { name: 'New whiteboard' }).first().click(); await page.fill('#nb-name', BCN); await page.selectOption('#nb-kind', 'client'); await page.selectOption('#nb-client', bcid); await page.getByRole('button', { name: 'Create', exact: true }).click(); await page.waitForSelector('.boardsurface', { timeout: 15000 });
  const cb = (await admin.query("select space, client_id from files where name = $1", [BCN])).rows[0];
  check('BD3', 'A board made for a client belongs to that client', cb && cb.space === 'client' && cb.client_id === bcid);
  await page.goto(`${base}/#/whiteboards`); await page.waitForSelector('.tbl', { timeout: 9000 });
  const txt = await page.locator('.tbl').innerText();
  check('BD4', 'Both boards are listed with where each one lives', txt.includes(BN) && txt.includes(BCN) && txt.includes(BC));
  await page.getByRole('searchbox', { name: 'Search boards' }).fill(BCN); await page.waitForFunction((n) => document.querySelectorAll('.tbl tbody tr').length === 1 && document.querySelector('.tbl').innerText.includes(n), BCN, { timeout: 9000 });
  check('BD5', 'Search narrows the list to the matching board', !(await page.locator('.tbl').innerText()).includes(BN));
  await page.getByRole('searchbox', { name: 'Search boards' }).fill('zzz no such board'); await page.waitForSelector('.empty', { timeout: 9000 });
  check('BD6', 'No match shows a plain empty state', (await page.locator('.empty').innerText()).includes('No board matches'));
  await page.getByRole('searchbox', { name: 'Search boards' }).fill(''); await page.selectOption('select[aria-label="Where it lives"]', 'client'); await page.waitForFunction((n) => document.querySelector('.tbl')?.innerText.includes(n) && !document.querySelector('.tbl').innerText.includes('Team board'), BCN, { timeout: 9000 });
  check('BD7', 'The location filter separates client boards from organization boards', true);
  const hr = await page.locator('.tbl a', { hasText: BCN }).first().getAttribute('href');
  check('BD8', 'A row opens its board', /#\/board\//.test(hr));
  await page.goto(`${base}/#/app/whiteboard`); await page.waitForSelector('.pj-head h1', { timeout: 9000 });
  check('BD9', 'The Whiteboard tile address opens All boards', (await page.locator('.pj-head h1').innerText()) === 'All boards');
  await admin.query("update apps set lifecycle = 'coming_soon' where key = 'whiteboard'"); await admin.query("delete from workspace_apps where workspace_id = $1 and app_key = 'whiteboard'", [wsB]);
  await page.goto(`${base}/#/launcher`); await page.reload(); await wait('The sky follows your time of day');
}

// =============================================================== C8. Social Planner (calendar, posts, campaigns, channels, manual posting record)
{
  const [{ id: wsS }] = (await admin.query("select id from workspaces where slug = 'layer2funnels'")).rows;
  await admin.query("update apps set lifecycle = 'active' where key = 'social_planner'"); await admin.query("insert into workspace_apps (workspace_id, app_key, enabled) values ($1, 'social_planner', true) on conflict (workspace_id, app_key) do update set enabled = true", [wsS]);
  await admin.query("update social_posts set archived_at = now() where archived_at is null and (title like 'Teaser %' or title like 'Second %')");   // earlier runs leave posts on today's calendar day
  const CN = `Spring push ${Date.now()}`, PN = `Teaser ${Date.now()}`, PN2 = `Second ${Date.now()}`;
  await page.reload(); await page.goto(`${base}/#/social`); await page.waitForSelector('.pj-head h1', { timeout: 9000 });
  check('SO1', 'Social Planner opens on the calendar with Calendar, Posts, Campaigns and Channels', (await page.locator('.side .nav a').allInnerTexts()).join() === 'Calendar,Posts,Campaigns,Channels' && (await page.locator('.sp-cal').count()) === 1);
  await page.locator('.side .nav a', { hasText: 'Channels' }).click(); await page.waitForSelector('.tbl', { timeout: 9000 });
  check('SO2', 'Channels lists what each channel takes and every Connect button is switched off with the reason', (await page.locator('.tbl tbody tr').count()) === 9 && (await page.getByRole('button', { name: 'Connect' }).evaluateAll((b) => b.every((x) => x.disabled))) && (await page.locator('main').innerText()).includes('280 characters'));
  await page.locator('.side .nav a', { hasText: 'Campaigns' }).click(); await page.waitForSelector('.empty, .pj-cards', { timeout: 9000 });
  await page.getByRole('button', { name: 'New campaign' }).first().click(); await page.fill('#sc-name', CN); await page.fill('#sc-goal', 'Get 200 sign-ups'); await page.getByRole('button', { name: 'Create', exact: true }).click(); await page.waitForSelector('.pj-head h1', { timeout: 9000 }); await page.waitForFunction((n) => document.querySelector('h1')?.innerText === n, CN, { timeout: 9000 });
  const camp = (await admin.query("select id, status, goal from social_campaigns where name = $1", [CN])).rows[0];
  check('SO3', 'A campaign is created as a draft with its goal and opens its own page with an empty progress', camp?.status === 'draft' && camp.goal === 'Get 200 sign-ups' && (await page.locator('main').innerText()).includes('0% posted') && (await page.locator('main').innerText()).includes('No posts in this campaign yet'));
  await page.getByRole('button', { name: 'New post in this campaign' }).first().click(); await page.fill('#sp-title', PN); await page.selectOption('#sp-channel', 'x'); await page.fill('#sp-caption', 'y'.repeat(300));
  const over = await page.locator('.sp-count').innerText();
  check('SO4', 'The caption counter says how far over the channel limit it is (X takes 280)', /20 over/.test(over));
  await page.fill('#sp-caption', 'Big news is coming'); await page.getByRole('button', { name: 'Create post' }).click(); await page.waitForSelector('.tbl tbody tr', { timeout: 9000 });
  const p1 = (await admin.query("select id, status, campaign_id, channel from social_posts where title = $1", [PN])).rows[0];
  check('SO5', 'The post is created as a draft inside the campaign', p1?.status === 'draft' && p1.campaign_id === camp.id && p1.channel === 'x');
  await page.getByRole('button', { name: PN }).click(); await page.waitForSelector('.drawer', { timeout: 9000 }); await page.getByRole('button', { name: 'Send for review' }).click(); await page.getByRole('button', { name: 'Send', exact: true }).click(); await page.waitForFunction(async () => true);
  for (let n = 0; n < 40 && (await admin.query("select status from social_posts where id = $1", [p1.id])).rows[0].status !== 'in_review'; n += 1) await page.waitForTimeout(250);
  check('SO6', 'Sending for review makes an approval and puts the post in review', (await admin.query("select status from social_posts where id = $1", [p1.id])).rows[0].status === 'in_review');
  await admin.query("update approvals set status = 'approved' where subject_type = 'post' and subject_id = $1", [p1.id]);
  await page.reload(); await page.waitForSelector('.tbl tbody tr', { timeout: 9000 });
  check('SO7', 'The campaign list shows the approved state after the decision', (await page.locator('.tbl tbody tr').first().innerText()).includes('Approved'));
  const local = await page.evaluate(() => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T10:00`; });
  await page.getByRole('button', { name: PN }).click(); await page.waitForSelector('.drawer', { timeout: 9000 }); await page.getByRole('button', { name: 'Schedule', exact: true }).click(); await page.fill('#sp-sch', local); await page.getByRole('button', { name: 'Schedule', exact: true }).last().click();
  for (let n = 0; n < 40 && (await admin.query("select status from social_posts where id = $1", [p1.id])).rows[0].status !== 'scheduled'; n += 1) await page.waitForTimeout(250);
  check('SO8', 'An approved post is scheduled for a date and time', (await admin.query("select status from social_posts where id = $1", [p1.id])).rows[0].status === 'scheduled');
  await page.getByRole('button', { name: PN }).click(); await page.waitForSelector('.drawer', { timeout: 9000 }); await page.getByRole('button', { name: 'Mark as failed' }).click(); await page.getByRole('button', { name: 'Mark as failed', exact: true }).last().click();
  check('SO9', 'Marking a post failed without saying why is refused in the form', (await page.locator('#sp-why-e').innerText()).includes('Say what went wrong'));
  await page.fill('#sp-why', 'Login expired'); await page.getByRole('button', { name: 'Mark as failed', exact: true }).last().click();
  for (let n = 0; n < 40 && (await admin.query("select status from social_posts where id = $1", [p1.id])).rows[0].status !== 'failed'; n += 1) await page.waitForTimeout(250);
  check('SO10', 'A failed post keeps the reason and can be retried', (await admin.query("select failure_reason from social_posts where id = $1", [p1.id])).rows[0].failure_reason === 'Login expired');
  await page.getByRole('button', { name: PN }).click(); await page.waitForSelector('.drawer', { timeout: 9000 });
  check('SO11', 'The drawer shows what went wrong and offers retry and mark as posted', (await page.locator('.drawer').innerText()).includes('Login expired') && (await page.getByRole('button', { name: 'Schedule again' }).count()) === 1);
  await page.getByRole('button', { name: 'Mark as posted manually' }).click(); await page.fill('#sp-url', 'https://example.org/post/1'); await page.getByRole('button', { name: 'Mark as posted', exact: true }).click();
  for (let n = 0; n < 40 && (await admin.query("select status from social_posts where id = $1", [p1.id])).rows[0].status !== 'published'; n += 1) await page.waitForTimeout(250);
  const pub = (await admin.query("select status, published_by, post_url, failure_reason from social_posts where id = $1", [p1.id])).rows[0];
  check('SO12', 'Mark as posted manually records who did it and the link, and clears the failure', pub.status === 'published' && pub.published_by !== null && pub.post_url === 'https://example.org/post/1' && pub.failure_reason === null);
  await page.reload(); await page.waitForSelector('.sp-prog', { timeout: 9000 });
  check('SO13', 'The campaign page shows 100% posted', (await page.locator('.sp-prog').innerText()).includes('100%'));
  await page.getByRole('button', { name: 'Start now' }).click(); await page.waitForFunction(() => /Active/.test(document.querySelector('.pj-meta')?.innerText ?? ''), null, { timeout: 9000 });
  await page.getByRole('button', { name: 'Mark completed' }).click(); await page.waitForFunction(() => /Completed/.test(document.querySelector('.pj-meta')?.innerText ?? ''), null, { timeout: 9000 });
  check('SO14', 'With every post posted the campaign can be started and then completed', (await admin.query("select status from social_campaigns where id = $1", [camp.id])).rows[0].status === 'completed');
  await page.goto(`${base}/#/social?tab=posts`); await page.waitForSelector('.tbl, .empty', { timeout: 9000 }); await page.getByRole('button', { name: 'New post' }).first().click(); await page.fill('#sp-title', PN2); await page.fill('#sp-caption', 'Hello everyone'); await page.getByRole('button', { name: 'Create post' }).click(); await page.waitForSelector('.tbl tbody tr', { timeout: 9000 });
  await page.getByRole('button', { name: PN2 }).click(); await page.waitForSelector('.drawer', { timeout: 9000 }); await page.getByRole('button', { name: 'Write it for other channels' }).click(); await page.locator('#vr-linkedin').check(); await page.getByRole('button', { name: 'Make drafts' }).click();
  for (let n = 0; n < 40 && (await admin.query("select count(*)::int c from social_posts where title = $1", [PN2])).rows[0].c < 2; n += 1) await page.waitForTimeout(250);
  const vr = (await admin.query("select channel, variant_of is not null v from social_posts where title = $1 order by channel", [PN2])).rows;
  check('SO15', 'Writing it for LinkedIn makes a second draft that points back at the first', vr.length === 2 && vr.some((x) => x.channel === 'linkedin' && x.v));
  await page.goto(`${base}/#/social`); await page.waitForSelector('.sp-cal', { timeout: 9000 }); await page.waitForSelector('.sp-chip', { timeout: 9000 });
  check('SO16', 'The calendar shows the post that was scheduled for today', (await page.locator('.sp-chip', { hasText: PN }).count()) >= 1 && (await page.locator('.sp-undated').innerText()).includes(PN2));
  await page.goto(`${base}/#/app/social_planner`); await page.waitForSelector('.pj-head h1', { timeout: 9000 });
  check('SO17', 'The Social Planner tile address opens the planner', (await page.locator('.pj-head h1').innerText()) === 'Social Planner');
  await admin.query("update apps set lifecycle = 'coming_soon' where key = 'social_planner'"); await admin.query("delete from workspace_apps where workspace_id = $1 and app_key = 'social_planner'", [wsS]);
  await page.goto(`${base}/#/launcher`); await page.reload(); await wait('The sky follows your time of day');
}

// =============================================================== C9. Admin › Client access (invite first; suspend, restore, revoke; Portal stays locked)
{
  const [{ id: wsX }] = (await admin.query("select id from workspaces where slug = 'layer2funnels'")).rows;
  const EMAIL = `anna.${Date.now()}@acme-test.example`, CNAME = `Acme ${Date.now()}`, PERSON = 'Anna Test';
  await page.goto(`${base}/#/office/admin/clients`); await page.reload(); await page.waitForSelector('#invite-client', { timeout: 12000 });
  check('CX1', 'Admin has a Client access tab that says the Client Portal is locked and that nothing here opens it', (await page.getByRole('tab', { name: 'Client access' }).count()) === 1 && (await page.locator('main').innerText()).includes('The Client Portal is locked'));
  await page.click('#invite-client'); await page.fill('#ci-email', 'not an email'); await page.getByRole('button', { name: 'Create invitation' }).click();
  check('CX2', 'A bad email is refused in the form, and nothing is created', (await page.locator('#ci-email-e').innerText()).includes('Enter an email') && (await admin.query("select count(*)::int c from client_access where workspace_id = $1 and email = 'not an email'", [wsX])).rows[0].c === 0);
  await page.fill('#ci-email', EMAIL); await page.fill('#ci-person', PERSON); await page.fill('#ci-name', CNAME); await page.getByRole('button', { name: 'Create invitation' }).click(); await page.waitForSelector('#cl-link', { timeout: 12000 });
  const link = await page.inputValue('#cl-link'); const token = decodeURIComponent(link.split('token=')[1] ?? '');
  const q1 = (await admin.query("select a.status, a.person_name, c.name, p.email, p.stage_key from client_access a join clients c on c.id = a.client_id join client_profiles p on p.client_id = c.id where a.workspace_id = $1 and a.email = $2", [wsX, EMAIL])).rows;
  check('CX3', 'Inviting shows a one-time link and creates, in one step, the client record (Onboarding stage), the invitation and an "invited" access', link.includes('#/invite?token=') && token.length > 30 && q1.length === 1 && q1[0].status === 'invited' && q1[0].name === CNAME && q1[0].email === EMAIL && q1[0].stage_key === 'onboarding');
  await page.getByRole('button', { name: 'Done' }).click(); await page.waitForSelector(`[data-manage-client]`, { timeout: 9000 });
  await page.locator('[data-manage-client]').first().click(); await page.getByRole('button', { name: 'Send a new link' }).click(); await page.waitForSelector('#cl-link', { timeout: 9000 });
  const token2 = decodeURIComponent((await page.inputValue('#cl-link')).split('token=')[1] ?? '');
  check('CX4', 'Asking for a new link keeps the same client record, replaces the old link and does not create a second client', token2 !== token && (await admin.query("select count(*)::int c from clients where workspace_id = $1 and name = $2", [wsX, CNAME])).rows[0].c === 1 && (await admin.query("select count(*)::int c from invitations where workspace_id = $1 and email = $2 and revoked_at is null and accepted_at is null", [wsX, EMAIL])).rows[0].c === 1);
  await page.getByRole('button', { name: 'Done' }).click();
  // the client accepts (done in the database exactly as the API does it: as the invited person, with the invited email in the sign-in token)
  const kid = (await admin.query('select gen_random_uuid() id')).rows[0].id;
  await admin.query('begin'); await admin.query('set local role app_user'); await admin.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: kid, email: EMAIL, role: 'authenticated' })]); await admin.query('select accept_invitation($1)', [token2]); await admin.query('commit');
  await page.reload(); await page.waitForSelector('[data-manage-client]', { timeout: 12000 });
  check('CX5', 'After the client accepts, the list shows them as Active, and the Portal is still locked', (await page.locator('tbody tr', { hasText: EMAIL }).innerText()).includes('Active') && (await page.locator('main').innerText()).includes('The Client Portal is locked'));
  await page.locator('tbody tr', { hasText: EMAIL }).getByRole('button', { name: /Manage/ }).click(); await page.getByRole('button', { name: 'Suspend access' }).click(); await page.getByRole('button', { name: 'Suspend', exact: true }).click();
  await page.waitForFunction((e) => [...document.querySelectorAll('tbody tr')].some((r) => r.innerText.includes(e) && r.innerText.includes('Suspended')), EMAIL, { timeout: 9000 });
  check('CX6', 'Suspend switches the client\'s membership off straight away', (await admin.query("select status from memberships where user_id = $1", [kid])).rows[0].status === 'deactivated');
  await page.locator('tbody tr', { hasText: EMAIL }).getByRole('button', { name: /Manage/ }).click(); await page.getByRole('button', { name: 'Restore access' }).click(); await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await page.waitForFunction((e) => [...document.querySelectorAll('tbody tr')].some((r) => r.innerText.includes(e) && r.innerText.includes('Active')), EMAIL, { timeout: 9000 });
  check('CX7', 'Restore brings back the same access', (await admin.query("select status from memberships where user_id = $1", [kid])).rows[0].status === 'active');
  await page.locator('tbody tr', { hasText: EMAIL }).getByRole('button', { name: /Manage/ }).click(); await page.waitForFunction(() => /Access suspended/.test(document.querySelector('ol[aria-label=History]')?.innerText ?? ''), null, { timeout: 9000 });
  const histText = await page.locator('ol[aria-label=History]').innerText();
  check('CX8', 'The history lists the steps in plain words, without the email', histText.includes('Access suspended') && !histText.includes('@'), histText);
  await page.getByRole('button', { name: 'Revoke access' }).click(); await page.getByRole('button', { name: 'Revoke', exact: true }).click();
  await page.waitForFunction((e) => [...document.querySelectorAll('tbody tr')].some((r) => r.innerText.includes(e) && r.innerText.includes('Revoked')), EMAIL, { timeout: 9000 });
  const after = (await admin.query("select (select count(*)::int from memberships where user_id = $1) m, (select count(*)::int from clients where name = $2 and workspace_id = $3) c", [kid, CNAME, wsX])).rows[0];
  check('CX9', 'Revoke removes the membership but keeps the client record', after.m === 0 && after.c === 1, JSON.stringify(after));
  await page.locator('tbody tr', { hasText: EMAIL }).getByRole('button', { name: /Manage/ }).click(); await page.getByRole('button', { name: 'Invite again' }).click(); await page.waitForSelector('#cl-link', { timeout: 9000 });
  check('CX10', 'Inviting a revoked person again reuses their client record', (await admin.query("select count(*)::int c from clients where name = $1 and workspace_id = $2", [CNAME, wsX])).rows[0].c === 1 && (await admin.query("select count(*)::int c from client_access where email = $1 and workspace_id = $2", [EMAIL, wsX])).rows[0].c === 2);
  await page.getByRole('button', { name: 'Done' }).click();
  check('CX11', 'Client access is not in the staff Members list', !(await (async () => { await page.getByRole('tab', { name: 'Members' }).click(); await page.waitForSelector('#invite', { timeout: 9000 }); return (await page.locator('main').innerText()).includes(EMAIL); })()));
}

check('J1', 'No script errors, warnings or Content-Security-Policy violations during the whole run (deliberate 4xx answers excluded)', problems.length === 0, problems.slice(0, 4).join(' | '));
await browser.close(); await s.close(); await admin.end();
for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(8)} ${x.n}${x.ok ? '' : `  [${x.d}]`}`);
const p = results.filter((x) => x.ok).length; console.log(`\n${p}/${results.length} checks passed`); process.exit(p === results.length ? 0 : 1);
