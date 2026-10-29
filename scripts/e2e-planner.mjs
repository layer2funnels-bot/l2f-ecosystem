// Browser journey for Planner on the local stack (needs `npm run stack:start && npm run stack:migrate` and `npm run build:web`; PLAYWRIGHT_MODULE=<path>).
// Real sign-ups, two organizations, the Planner served at /planner/ by the dev server. Checks loading cost and speed, a direct plan address,
// token expiry (the "needs a refresh" cause), organization isolation and a member without the Planner grant.
import { createRequire } from 'node:module';
import pg from 'pg';
import { startDevServer, LOCAL_ENV } from './dev-server.mjs';
import { startFakeSupabaseStorage } from '../test/fakes/fake-supabase-storage.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const admin = new pg.Client({ connectionString: 'postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres' }); await admin.connect();
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
  const t = JSON.parse(localStorage.getItem('l2f.session.v1')).access;
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
const sw = (pg, org) => pg.evaluate(async (org) => { const t = JSON.parse(localStorage.getItem('l2f.session.v1')).access;
  const r = await fetch('/api/org.switch', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${t}`, 'x-org-id': '00000000-0000-0000-0000-000000000000' }, body: JSON.stringify({ org, app: 'planner' }) }); return (await r.json()).data?.[0]?.outcome; }, org);
check('PB0b', 'The ecosystem switch makes Layer2Funnels the active organization', (await sw(owner.page, L)) === 'same_page');

// ---- A. open Planner signed in: cost, speed, errors
const page = owner.page; const reqs = []; const problems = [];
page.on('response', async (r) => { const u = new URL(r.url()); if (u.origin === base) reqs.push({ path: u.pathname, status: r.status(), ms: 0, size: Number(r.headers()['content-length'] ?? 0), t: Date.now() }); });
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) problems.push(`${m.type()}: ${m.text().slice(0, 160)}`); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message.slice(0, 160)}`));
const t0 = Date.now(); await page.goto(`${base}/planner/`); await page.waitForSelector('nav, [role=navigation], .rail', { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(1500);
const loadMs = Date.now() - t0; const text0 = await page.locator('body').innerText();
check('PB1', 'Planner opens from the ecosystem session with no second sign-in and shows its menu', /Plans/.test(text0) && /My work/.test(text0) && !/Sign in first/.test(text0), text0.slice(0, 120));
check('PB2', 'Loading Planner downloads no database engine or WebAssembly (the old cause of slow loads)', !reqs.some((r) => /pglite|\.wasm|\.data$/.test(r.path)), reqs.map((r) => r.path).filter((p) => /pglite|wasm/.test(p)).join(','));
const apiCalls = reqs.filter((r) => /\/api\//.test(r.path));
check('PB3', 'Every API call on first load succeeds', apiCalls.length > 0 && apiCalls.every((r) => r.status === 200), JSON.stringify(apiCalls.filter((r) => r.status !== 200)));
check('PB4', 'First load is fast on the local stack (under 4 s to a usable menu)', loadMs < 4000, `${loadMs} ms`);
check('PB5', 'No script errors, warnings or Content-Security-Policy violations while loading', problems.length === 0, problems.slice(0, 3).join(' | '));
const fontCss = reqs.some((r) => r.path === '/fonts.css') && !reqs.some((r) => /googleapis|gstatic/.test(r.path));
check('PB6', 'Fonts come from the site (self-hosted), none from Google', fontCss);

// ---- B. direct plan address on a fresh page load, no refresh needed
await page.goto(`${base}/planner/#/planner/map?plan=${plan}`); await page.waitForTimeout(2500);
const t1 = await page.locator('body').innerText();
check('PB7', 'A plan address opened directly loads the plan (no extra refresh)', t1.includes(`Q4 social ${stamp}`) || /Publish 30 videos/.test(t1), t1.slice(0, 160));
await page.goto(`${base}/planner/#/planner/plans`); await page.waitForTimeout(1800);
check('PB8', 'The plans list shows the plan', (await page.locator('body').innerText()).includes(`Q4 social ${stamp}`));

// ---- C. token expiry: the shell is not open, the token ran out
const before = await page.evaluate(() => JSON.parse(localStorage.getItem('l2f.session.v1')));
await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('l2f.session.v1')); s.expiresAt = Date.now() - 5000; localStorage.setItem('l2f.session.v1', JSON.stringify(s)); });
let refreshed = false; page.on('request', (r) => { if (/\/auth\/v1\/token\?grant_type=refresh_token/.test(r.url())) refreshed = true; });
await page.reload(); await page.waitForTimeout(2500);
const after = await page.evaluate(() => JSON.parse(localStorage.getItem('l2f.session.v1')));
check('PB9', 'An expired token is refreshed by Planner itself and the page loads without a manual refresh', refreshed && after.expiresAt > Date.now() && after.access !== before.access && (await page.locator('body').innerText()).includes(`Q4 social ${stamp}`), `refreshed=${refreshed}`);

// ---- C2. the shell and Planner agree on the active organization
await sw(owner.page, A); await page.goto(`${base}/planner/#/planner/plans`); await page.reload(); await page.waitForTimeout(2200);
check('PB9b', 'After switching to Aurj in the ecosystem, Planner opens Aurj (and shows nothing of Layer2Funnels)', !(await page.locator('body').innerText()).includes(`Q4 social ${stamp}`));
await sw(owner.page, L);

// ---- D. isolation and grants
await aurj.page.goto(`${base}/planner/`); await aurj.page.waitForTimeout(2000);
await aurj.page.goto(`${base}/planner/#/planner/plans`); await aurj.page.waitForTimeout(1800);
const at = await aurj.page.locator('body').innerText();
check('PB10', 'An Aurj-only owner sees nothing of Layer2Funnels', !at.includes(`Q4 social ${stamp}`) && !/Publish 30 videos/.test(at));
const leak = await api(aurj.page, A, 'planner.strategy.get_plan', { p_plan: plan });
check('PB11', 'Asking for the Layer2Funnels plan by its id from Aurj returns nothing', leak === null || leak?.ok === false || !leak?.plan);
const both = await api(owner.page, A, 'planner.strategy.get_plan', { p_plan: plan });
check('PB12', 'An owner of both organizations also gets nothing of it while Aurj is the active organization', both === null || both?.ok === false || !both?.plan);
await noapp.page.goto(`${base}/planner/#/planner/plans`); await noapp.page.waitForTimeout(2200);
const nt = await noapp.page.locator('body').innerText();
check('PB13', 'A member without the Planner grant sees no plans and no crash', !nt.includes(`Q4 social ${stamp}`) && !/TypeError|undefined/.test(nt), nt.slice(0, 120));

const failed = results.filter((r) => !r.ok); console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
await b.close(); await s.close?.(); await admin.end(); process.exit(failed.length ? 1 : 0);
