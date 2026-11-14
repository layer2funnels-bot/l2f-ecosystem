// Browser journey for Planner on the local stack (needs `npm run stack:start && npm run stack:migrate` and `npm run build:web`; PLAYWRIGHT_MODULE=<path>).
// Real sign-ups, two organizations. Planner is mounted inside the shell at /#/planner (apps/web/js/modules/planner.js loads /planner/embed.js).
// Checks loading cost and speed, one shared header and menu, a direct plan address, staying mounted between Planner pages, switching organization
// with the shell's switcher, the shell's theme, token expiry, organization isolation and a member without the Planner grant.
// SHOTS=<dir> saves screenshots for a visual review.
import { createRequire } from 'node:module';
import pg from 'pg';
import { startDevServer, LOCAL_ENV } from './dev-server.mjs';
import { startFakeSupabaseStorage } from '../test/fakes/fake-supabase-storage.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const admin = new pg.Client({ connectionString: 'postgresql://supabase_admin:postgres@127.0.0.1:54332/postgres' }); await admin.connect();
const q = async (s, a = []) => (await admin.query(s, a)).rows;
const stamp = Date.now(), PW = 'correct-horse-battery-staple';
const results = []; const check = (id, name, ok, detail = '') => { results.push({ id, name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${id.padEnd(4)} ${name}${ok ? '' : `  [${detail}]`}`); };
const fake = await startFakeSupabaseStorage({ serviceKey: 'k' });
const s = await startDevServer({ port: 0, sink: () => {}, env: { ...LOCAL_ENV, ...process.env, STORAGE_DRIVER: 'supabase', STORAGE_URL: fake.url, STORAGE_SERVER_KEY: 'k', RATE_LIMIT_STORE: 'memory' } });
const base = `http://127.0.0.1:${s.port}`;
const b = await chromium.launch();

async function signUp(tag) {
  const email = `pl.${tag}.${stamp}@example.com`;
  const ctx = await b.newContext({ viewport: { width: 1366, height: 860 } }); const page = await ctx.newPage();
  await page.goto(`${base}/#/signup`); await page.fill('#nm', `Planner ${tag}`); await page.fill('#em', email); await page.fill('#pw', PW); await page.click('button[type=submit]'); await page.waitForTimeout(1800);
  const uid = (await q('select id from auth.users where email=$1', [email]))[0].id;
  return { ctx, page, uid, email };
}
const org = async (slug, name) => (await q('insert into workspaces (slug,name) values ($1,$2) on conflict (slug) do update set name=excluded.name returning id', [slug, name]))[0].id;
const L = await org('layer2funnels', 'Layer2Funnels'), A = await org('aurj', 'Aurj');
await q("update public.apps set lifecycle='active' where key='planner'");
await q("insert into workspace_apps (workspace_id,app_key,enabled) select w,'planner',true from unnest($1::uuid[]) w on conflict (workspace_id,app_key) do update set enabled=true", [[L, A]]);
const owner = await signUp('owner'), aurj = await signUp('aurj'), noapp = await signUp('noapp');
await q("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff','owner'),($3,$2,'staff','owner'),($3,$4,'staff','owner'),($1,$5,'staff','editor') on conflict do nothing", [L, owner.uid, A, aurj.uid, noapp.uid]);

const api = (page, org, op, args) => page.evaluate(async ([org, op, args]) => {
  const t = JSON.parse(decodeURIComponent(document.cookie.split('; ').find((c) => c.startsWith('l2f-session=')).slice(12))).access;
  const r = await fetch(`/api/${op}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${t}`, 'x-org-id': org }, body: JSON.stringify({ args }) });
  const j = await r.json(); return j.data?.[0]?.r ?? j;
}, [org, op, args]);
// seed in Layer2Funnels as the owner: a strategy, a plan from it
const ft = (await api(owner.page, L, 'planner.strategy.save_focus_template', { p_workspace: L, p_id: null, p_data: { name: 'Content creation', color: 'teal' } })).id;
const st = (await api(owner.page, L, 'planner.strategy.save_strategy', { p_workspace: L, p_id: null, p_data: { name: 'Social growth', focus_ids: [ft] } })).id;
await api(owner.page, L, 'planner.strategy.save_strategy_item', { p_workspace: L, p_id: null, p_data: { strategy_id: st, template_id: ft, item_kind: 'objective', title: 'Publish 30 videos' } });
const plan = (await api(owner.page, L, 'planner.strategy.save_plan', { p_workspace: L, p_id: null, p_data: { name: `Q4 social ${stamp}`, strategy_id: st } })).id;
check('PB0', 'Setup: an owner of two organizations, an Aurj-only owner, an editor without the Planner grant; a plan in Layer2Funnels', !!plan);

// the owner works in Layer2Funnels: the ecosystem's own switch operation makes it the active organization (what the shell's switcher does)
const sw = (pg, org) => pg.evaluate(async (org) => { const t = JSON.parse(decodeURIComponent(document.cookie.split('; ').find((c) => c.startsWith('l2f-session=')).slice(12))).access;
  const r = await fetch('/api/org.switch', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${t}`, 'x-org-id': '00000000-0000-0000-0000-000000000000' }, body: JSON.stringify({ org, app: 'planner' }) }); return (await r.json()).data?.[0]?.outcome; }, org);
check('PB0b', 'The ecosystem switch makes Layer2Funnels the active organization', (await sw(owner.page, L)) === 'same_page');

// ---- A. open Planner signed in: cost, speed, errors
const page = owner.page; const reqs = []; const problems = [];
page.on('response', async (r) => { const u = new URL(r.url()); if (u.origin === base) reqs.push({ path: u.pathname, status: r.status(), size: Number(r.headers()['content-length'] ?? 0) }); });
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) problems.push(`${m.type()}: ${m.text().slice(0, 160)}`); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message.slice(0, 160)}`));
const shots = process.env.SHOTS; const shot = async (pg, name) => { if (shots) await pg.screenshot({ path: `${shots}/${name}.png`, fullPage: false }); };
// Planner's screen is inside a shadow root: read its text there (page text alone would not include it)
const pl = (pg) => pg.evaluate(() => document.querySelector('.planner-mount')?.shadowRoot?.textContent ?? '');
const ready = (pg) => pg.waitForFunction(() => !!document.querySelector('.planner-mount')?.shadowRoot?.querySelector('.stage'), null, { timeout: 15000 }).catch(() => {});
// memberships were added after sign-up, so the first visit is a real page load (as after accepting an invitation)
await page.goto(`${base}/#/planner`); const t0 = Date.now(); await page.reload(); await ready(page); await page.waitForTimeout(1200);
const loadMs = Date.now() - t0; const text0 = await pl(page);
check('PB1', 'Planner opens inside the shell from the ecosystem session, with no second sign-in, and shows its content', /Plans|plan/.test(text0) && !/Sign in first/.test(text0), text0.slice(0, 120));
const frame = await page.evaluate(() => { const r = document.querySelector('.planner-mount')?.shadowRoot;
  return { header: document.querySelectorAll('header.hdr').length, sw: !!document.querySelector('#org-switcher'), nav: document.querySelector('.side-top b')?.textContent, cur: document.querySelector('.nav a[aria-current=page]')?.textContent,
    rail: !!r?.querySelector('.rail'), theme: !!r?.querySelector('.themebtn'), orgSelect: !!r?.querySelector('select[aria-label=Organization]'), appCur: document.querySelector('#app-switcher') ? 'ok' : null }; });
check('PB1b', 'One header for the whole ecosystem: the shell\'s header, organization switcher and a "Planner" menu bar; no second Planner menu, organization picker or theme button', frame.header === 1 && frame.sw && frame.nav === 'Planner' && frame.cur === 'Home' && !frame.rail && !frame.theme && !frame.orgSelect, JSON.stringify(frame));
check('PB2', 'Loading Planner downloads no database engine or WebAssembly (the old cause of slow loads)', !reqs.some((r) => /pglite|\.wasm|\.data$/.test(r.path)), reqs.map((r) => r.path).filter((p) => /pglite|wasm/.test(p)).join(','));
const apiCalls = reqs.filter((r) => /\/api\//.test(r.path));
check('PB3', 'Every API call on first load succeeds', apiCalls.length > 0 && apiCalls.every((r) => r.status === 200), JSON.stringify(apiCalls.filter((r) => r.status !== 200)));
const apiRequests = reqs.filter((r) => /^\/api\//.test(r.path));
console.log(`      first load: ${apiRequests.length} API requests (${apiRequests.filter((r) => r.path === '/api/batch').length} batched), ${loadMs} ms`);
check('PB3b', 'Opening Planner sends the calls it makes together as batches: at most 8 API requests in all (each request is one database connection)', apiRequests.length <= 8 && apiRequests.some((r) => r.path === '/api/batch'), apiRequests.map((r) => r.path).join(' '));
check('PB4', 'First load is fast on the local stack (under 4 s to a usable screen)', loadMs < 4000, `${loadMs} ms`);
check('PB5', 'No script errors, warnings or Content-Security-Policy violations while loading (Planner\'s stylesheet in its shadow root included)', problems.length === 0, problems.slice(0, 3).join(' | '));
const fontCss = reqs.some((r) => r.path === '/fonts.css') && !reqs.some((r) => /googleapis|gstatic/.test(r.path));
check('PB6', 'Fonts come from the site (self-hosted), none from Google', fontCss);
const font = await page.evaluate(() => getComputedStyle(document.querySelector('.planner-mount').shadowRoot.querySelector('.stage')).fontFamily);
check('PB6b', 'Planner uses the ecosystem font (Geist) from the shared tokens', /Geist/.test(font), font);
await shot(page, '01-home-light');

// ---- A2. the old address and the Launcher both lead here
await page.goto(`${base}/planner/#/planner/plans`); await page.waitForURL(/\/#\/planner\/plans/, { timeout: 8000 }).catch(() => {});
check('PB1c', 'The old /planner/ address (and its links) opens the same page inside the shell', new URL(page.url()).pathname === '/' && /#\/planner\/plans/.test(page.url()), page.url());
await page.goto(`${base}/#/office`); await page.waitForTimeout(1200);   // the app switcher lives in the rail of every app (V8), not on the Launcher
await page.click('#app-switcher'); const appHref = await page.getAttribute('#apps-menu a[data-app=planner]', 'href').catch(() => null);
check('PB14', 'The rail\'s app switcher opens Planner (not the "isn\'t built yet" page)', appHref === '#/planner', String(appHref));
await page.click('#apps-menu a[data-app=planner]'); await ready(page); await page.waitForTimeout(800);
check('PB14b', 'Choosing Planner from the app switcher shows Planner', /plan/i.test(await pl(page)) && !/isn’t built yet/.test(await page.locator('body').innerText()));

// ---- B. direct plan address on a fresh page load, no refresh needed
await page.goto(`${base}/#/planner/map?plan=${plan}`); await ready(page); await page.waitForTimeout(1800);
const t1 = await pl(page);
check('PB7', 'A plan address opened directly loads the plan (no extra refresh)', t1.includes(`Q4 social ${stamp}`) || /Publish 30 videos/.test(t1), t1.slice(0, 160));
check('PB7b', 'The shell\'s menu marks the section (Plans) for a plan page', (await page.textContent('.nav a[aria-current=page]')) === 'Plans');
await shot(page, '02-plan-map-light');
// moving between Planner's pages keeps Planner mounted (no reload, no flash, no lost state) and moves the menu mark
await page.evaluate(() => { window.__plRoot = document.querySelector('.planner-mount').shadowRoot.querySelector('.planner-host'); });
let apiBefore = reqs.filter((r) => /planner\.strategy\.get_plan/.test(r.path)).length;
await page.click('.nav a[data-key=reports]'); await page.waitForTimeout(1200);
const kept = await page.evaluate(() => window.__plRoot === document.querySelector('.planner-mount')?.shadowRoot?.querySelector('.planner-host') && window.__plRoot.isConnected);
check('PB15', 'Going from Plans to Reports keeps Planner mounted, moves the menu mark and keeps the plan in the address', kept && (await page.textContent('.nav a[aria-current=page]')) === 'Reports' && page.url().includes(`plan=${plan}`) && /#\/planner\/reports/.test(page.url()), `${kept} ${page.url()}`);
check('PB15b', 'Changing page does not reload the plan from the server again', reqs.filter((r) => /planner\.strategy\.get_plan/.test(r.path)).length === apiBefore);
await page.goto(`${base}/#/planner/plans`); await ready(page); await page.waitForTimeout(1500);
check('PB8', 'The plans list shows the plan', (await pl(page)).includes(`Q4 social ${stamp}`));
// the Create menu is visible: the shell's own .menu rule (hidden unless open) must not reach Planner's .menu
await page.getByRole('button', { name: /^Create/ }).click(); await page.waitForTimeout(300);
check('PB18', 'Planner\'s Create menu opens and is visible (no style leaks between the shell and Planner)', await page.getByRole('menuitem', { name: 'New plan' }).isVisible().catch(() => false));
await page.keyboard.press('Escape');

// ---- B2. the shell's theme reaches Planner
await page.evaluate(() => localStorage.setItem('l2f.theme', 'dark')); await page.reload(); await ready(page); await page.waitForTimeout(1200);
const dark = await page.evaluate(() => ({ html: document.documentElement.dataset.theme, bg: getComputedStyle(document.querySelector('.planner-mount').shadowRoot.querySelector('.stage .topbar')).backgroundColor }));
check('PB17', 'Choosing dark in the shell\'s profile menu turns Planner dark too (shared tokens)', dark.html === 'dark' && dark.bg === 'rgb(14, 15, 14)'   /* V8 dark --bg #0E0F0E */, JSON.stringify(dark));
await shot(page, '03-plans-dark');
await page.evaluate(() => localStorage.removeItem('l2f.theme'));
await page.setViewportSize({ width: 390, height: 844 }); await page.reload(); await ready(page); await page.waitForTimeout(1200);
const phone = await page.evaluate(() => ({ bnav: getComputedStyle(document.querySelector('nav.bbar')).display, over: document.documentElement.scrollWidth - innerWidth }));
check('PB19', 'On a phone Planner\'s sections are in the shell\'s bottom bar and nothing scrolls sideways', phone.bnav === 'flex' && phone.over <= 1, JSON.stringify(phone));
await shot(page, '04-plans-phone');
await page.setViewportSize({ width: 1366, height: 860 });

// ---- C. token expiry: the token ran out while away
await page.goto(`${base}/#/planner/plans`); await ready(page);
const before = await page.evaluate(() => JSON.parse(decodeURIComponent(document.cookie.split('; ').find((c) => c.startsWith('l2f-session=')).slice(12))));
await page.evaluate(() => { const s = JSON.parse(decodeURIComponent(document.cookie.split('; ').find((c) => c.startsWith('l2f-session=')).slice(12))); s.expiresAt = Date.now() - 5000; document.cookie = `l2f-session=${encodeURIComponent(JSON.stringify(s))}; Path=/; SameSite=Lax; Max-Age=2592000`; });   // the shared session cookie (one sign-in for every app)
let refreshed = false; page.on('request', (r) => { if (/\/auth\/v1\/token\?grant_type=refresh_token/.test(r.url())) refreshed = true; });
await page.reload(); await ready(page); await page.waitForTimeout(1800);
const after = await page.evaluate(() => JSON.parse(decodeURIComponent(document.cookie.split('; ').find((c) => c.startsWith('l2f-session=')).slice(12))));
check('PB9', 'An expired token is refreshed (by the shell, for Planner too) and Planner loads without a manual refresh', refreshed && after.expiresAt > Date.now() && after.access !== before.access && (await pl(page)).includes(`Q4 social ${stamp}`), `refreshed=${refreshed}`);

// ---- C2. switching organization with the shell's own switcher
await page.goto(`${base}/#/planner/map?plan=${plan}`); await ready(page); await page.waitForTimeout(800);
await page.click('#org-switcher'); await page.click(`#org-menu [data-org="${A}"]`); await page.waitForTimeout(2200); await ready(page); await page.waitForTimeout(800);
const inA = await pl(page);
check('PB9b', 'Switching to Aurj in the shell\'s switcher keeps the person in Planner, now Aurj\'s, with nothing of Layer2Funnels', /#\/planner/.test(page.url()) && !inA.includes(`Q4 social ${stamp}`) && (await page.evaluate(() => document.documentElement.dataset.org)) === 'aurj', page.url());
await shot(page, '05-aurj');
check('PB9d', 'Switching while a plan is open explains that the plan stays in Layer2Funnels and offers to switch back (record not carried)', /That plan belongs to Layer2Funnels, so it isn’t here/.test(await page.locator('#main > .notice').innerText().catch(() => '')) && await page.getByRole('button', { name: 'Switch back to Layer2Funnels' }).isVisible());
await page.click('#org-switcher'); await page.click(`#org-menu [data-org="${L}"]`); await page.waitForTimeout(2200); await ready(page); await page.waitForTimeout(800);
check('PB9c', 'Switching back to Layer2Funnels shows its plans again', (await pl(page)).includes(`Q4 social ${stamp}`));

// ---- D. isolation and grants
await aurj.page.goto(`${base}/#/planner/plans`); await aurj.page.reload(); await ready(aurj.page); await aurj.page.waitForTimeout(1500);
const at = await pl(aurj.page);
check('PB10', 'An Aurj-only owner sees nothing of Layer2Funnels', !at.includes(`Q4 social ${stamp}`) && !/Publish 30 videos/.test(at));
const leak = await api(aurj.page, A, 'planner.strategy.get_plan', { p_plan: plan });
check('PB11', 'Asking for the Layer2Funnels plan by its id from Aurj returns nothing', leak === null || leak?.ok === false || !leak?.plan);
const forged = await api(aurj.page, L, 'planner.strategy.list_plans', { p_workspace: L, p_include_archived: true });
check('PB11b', 'An Aurj-only owner naming Layer2Funnels in the request is refused', forged?.ok === false || forged === null || (Array.isArray(forged) && forged.length === 0), JSON.stringify(forged).slice(0, 120));
const both = await api(owner.page, A, 'planner.strategy.get_plan', { p_plan: plan });
check('PB12', 'An owner of both organizations also gets nothing of it while Aurj is the active organization', both === null || both?.ok === false || !both?.plan);
await noapp.page.goto(`${base}/#/planner/plans`); await noapp.page.reload(); await noapp.page.waitForTimeout(2200);
const nt = await noapp.page.locator('body').innerText();
check('PB13', 'A member without the Planner grant sees the shell\'s "not available" message, no plans and no crash', /Planner isn’t available to you/.test(nt) && !nt.includes(`Q4 social ${stamp}`) && !(await pl(noapp.page)) && !/TypeError|undefined/.test(nt), nt.slice(0, 160));
const direct = await api(noapp.page, L, 'planner.strategy.list_plans', { p_workspace: L, p_include_archived: false });
check('PB13b', 'The same member calling the API directly gets no plans (the database decides, not the screen)', direct?.ok === false || direct === null || (Array.isArray(direct) && direct.length === 0), JSON.stringify(direct).slice(0, 120));

const failed = results.filter((r) => !r.ok); console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
await b.close(); await s.close?.(); await admin.end(); process.exit(failed.length ? 1 : 0);
