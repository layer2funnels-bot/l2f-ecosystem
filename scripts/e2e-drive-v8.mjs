// Browser end-to-end for Drive V8 (P04) on the LOCAL stack, with PRODUCTION rate limits (the live "Not saved, retrying…" only shows under them):
// real Chromium → our app → /api → Supabase Auth + Postgres (0061). Every check reads the database after the UI says it saved.
// Run: node scripts/e2e-drive-v8.mjs   (WEB_ROOT=dist/web for the production bundle; SLOW=1 adds 400 ms to every API call)
import { createRequire } from 'node:module';
import { mkdirSync, copyFileSync } from 'node:fs';
import pg from 'pg';
import { startDevServer, LOCAL_ENV } from './dev-server.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright');
const SHOTS = process.env.SHOTS || 'e2e-shots'; mkdirSync(SHOTS, { recursive: true });
// the owner's fixture is never edited: the test imports a temporary copy
const D100 = `${SHOTS}/dream100-copy.xlsx`; copyFileSync(new URL('../test/fixtures/Aurj_Dream100_Tracker.xlsx', import.meta.url), D100);
const results = []; const check = (id, n, ok, d = '') => { results.push({ id, n, ok: !!ok, d }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${id} ${n}${ok ? '' : `  [${String(d).slice(0, 300)}]`}`); };
const admin = new pg.Client({ connectionString: 'postgresql://supabase_admin:postgres@127.0.0.1:54332/postgres' }); await admin.connect();
const q = async (sql, a = []) => (await admin.query(sql, a)).rows;
const s = await startDevServer({ port: 0, sink: () => {}, env: { ...LOCAL_ENV, ...process.env }, root: process.env.WEB_ROOT });   // default (production) limits
const base = `http://127.0.0.1:${s.port}`;
const browser = await chromium.launch();
const problems = []; const status = [];
const watch = (p) => {
  p.on('response', (r) => { if (r.url().includes('/api/')) status.push(`${r.status()} ${r.url().split('/api/')[1]}`); });
  p.on('pageerror', (e) => problems.push(`pageerror ${e.message}`)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(`console ${m.text().slice(0, 200)}`); });
  if (process.env.SLOW) p.route('**/api/**', async (r) => { await new Promise((x) => setTimeout(x, 400)); r.continue(); });
  return p;
};
const shot = (p, n) => p.screenshot({ path: `${SHOTS}/${n}.png` });
const toastText = (p) => p.locator('.toast[data-show=true]').last().innerText().catch(() => '');
const A = (await q("select id from workspaces where slug = 'aurj'"))[0].id;           // the workbook belongs to Aurj: it is tested in Aurj only
const stamp = Date.now(); const PW = 'correct-horse-battery-staple';
async function person(name, role, ws) {
  const email = `dv.${name.split(' ')[0].toLowerCase()}.${stamp}@example.com`; const c = await browser.newContext(); const p = await c.newPage();
  await p.goto(`${base}/#/signup`); await p.fill('#nm', name); await p.fill('#em', email); await p.fill('#pw', PW); await p.click('button[type=submit]'); await p.waitForTimeout(1200); await c.close();
  const id = (await q('select id from auth.users where email = $1', [email]))[0].id;
  await q("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff',$3) on conflict do nothing", [ws, id, role]); await q('update profiles set active_workspace_id = $1, display_name = $3 where id = $2', [ws, id, name]);
  return { id, email, name };
}
async function signIn(u, { w = 1440, h = 900 } = {}) {
  const p = watch(await (await browser.newContext({ viewport: { width: w, height: h } })).newPage());
  await p.goto(`${base}/#/signin`); await p.fill('#em', u.email); await p.fill('#pw', PW); await p.click('button[type=submit]'); await p.waitForTimeout(1500); return p;
}
const waitFor = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 300)); } return null; };
const AO = await person('Ayesha Aurj', 'owner', A);

// =============================================================== Sheets: the Aurj Dream 100 Tracker (OR-34 … OR-37)
{
  const fid = (await q(`insert into files (workspace_id, space, owner_id, uploaded_by, name, kind, mime_type) values ($1,'shared',null,$2,'Dream 100 (test copy)','document','application/vnd.l2f.sheet+json') returning id`, [A, AO.id]))[0].id;
  await q("insert into file_versions (workspace_id,file_id,body,created_by) values ($1,$2,'{\"v\":2,\"styles\":[],\"sheets\":[{\"name\":\"Sheet 1\",\"cells\":{}}]}',$3)", [A, fid, AO.id]);
  const p = await signIn(AO);
  await p.goto(`${base}/#/sheet/${fid}`); await p.waitForSelector('.sx-tabs');
  await p.locator('.sx-mb', { hasText: 'File' }).click(); const chooser = p.waitForEvent('filechooser'); await p.locator('.sx-pop >> text=Import CSV or Excel').click(); (await chooser).setFiles(D100);
  await p.waitForSelector('text=7 sheets', { timeout: 15000 });
  await p.selectOption('select[aria-label="How to import"]', 'replace'); await p.locator('.dlg button', { hasText: 'Import' }).click();
  const saved = await waitFor(async () => { const r = await q('select body from file_versions where file_id = $1 order by version desc limit 1', [fid]); return r[0]?.body?.includes('Interaction Log') ? r[0].body : null; });
  const st = await p.locator('.docstate').innerText();
  check('SH1', 'Importing the Dream 100 workbook saves it (7 sheets in the stored body) and the status says Saved', !!saved && JSON.parse(saved).sheets.length === 7 && /Saved/.test(st), st);
  await shot(p, 'sheets-dream100-imported');
  await p.reload(); await p.waitForSelector('.sx-tabs'); await p.waitForTimeout(800);
  const tabs = await p.locator('.sx-tabs [role=tab]').allInnerTexts();
  check('SH2', 'After a reload all seven sheets are there, in order', tabs.map((t) => t.trim()).join('|') === 'Instructions|Dashboard|Prospects|Interaction Log|Scoring Guide|Target Map|Lists', tabs.join('|'));
  await p.locator('.sx-tabs [role=tab]', { hasText: 'Dashboard' }).click(); await p.waitForTimeout(400);
  const cell = (c, r) => p.locator(`[role=gridcell][data-c="${c}"][data-r="${r}"]`);
  const go = async (ref) => { await p.fill('.sx-ref', ref); await p.press('.sx-ref', 'Enter'); await p.waitForTimeout(250); };
  const dash = await Promise.all([4, 5, 6, 7, 8, 9, 10, 11, 12].map((r) => cell(1, r).innerText()));
  check('SH3', 'Dashboard numbers are calculated (prospects 1, average score 73, …) and no cell shows #NAME?', dash[0] === '1' && dash[1] === '73' && !(await p.locator('[role=gridcell]', { hasText: '#NAME?' }).count()), dash.join(','));
  await p.locator('.sx-tabs [role=tab]', { hasText: 'Prospects' }).click(); await p.waitForTimeout(500); await shot(p, 'sheets-dream100-prospects');
  const head = await cell(0, 0).evaluate((e) => ({ bg: getComputedStyle(e).backgroundColor, fg: getComputedStyle(e).color, w: e.getBoundingClientRect().width, fw: getComputedStyle(e).fontWeight }));
  check('SH4', 'Formatting is kept: the header is navy with bold white text; columns have the workbook’s widths', head.bg === 'rgb(31, 56, 100)' && head.fg === 'rgb(255, 255, 255)' && head.fw === '700' && Math.round(await cell(6, 0).evaluate((e) => e.getBoundingClientRect().width)) === 341, JSON.stringify(head));
  await go('V2'); const pr = await cell(21, 1).evaluate((e) => getComputedStyle(e).backgroundColor);
  check('SH5', 'Conditional formats work: the priority score is coloured by its scale', pr !== 'rgba(0, 0, 0, 0)' && pr !== '', pr);
  await go('R3'); await p.keyboard.type('Something else'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  check('SH6', 'A dropdown column refuses a value that is not in its list, with the workbook’s message', /choose a value from the dropdown/i.test(await toastText(p)) && (await cell(17, 2).innerText()) === '', await toastText(p));
  await go('R3'); await p.waitForTimeout(150);
  check('SH7', 'The active dropdown cell offers the Lists values', (await p.locator('[role=gridcell][data-c="17"][data-r="2"]').evaluate((e) => e.className + e.innerHTML)).length > 0);
  await go('B3'); await p.keyboard.type('Test prospect (e2e)'); await p.keyboard.press('Enter');
  await p.locator('.sx-tabs [role=tab]', { hasText: 'Dashboard' }).click(); await p.waitForTimeout(400);
  check('SH8', 'Adding a prospect updates the Dashboard count at once', (await cell(1, 4).innerText()) === '2', await cell(1, 4).innerText());
  // continuous typing for about 40 seconds: never refused, never stuck on "retrying", and history stays small
  await p.locator('.sx-tabs [role=tab]', { hasText: 'Prospects' }).click(); await p.waitForTimeout(300);
  const before = status.length;
  for (let i = 0; i < 24; i++) { await go(`J${4 + i}`); await p.keyboard.type(String(i)); await p.keyboard.press('Enter'); await p.waitForTimeout(1600); }
  const ok = await waitFor(async () => /Saved/.test(await p.locator('.docstate').innerText()), 15000);
  const r429 = status.slice(before).filter((x) => x.startsWith('429')).length;
  const nv = (await q('select count(*)::int n from file_versions where file_id = $1', [fid]))[0].n;
  check('SH9', 'Typing for ~40 s under production limits: no request refused, status returns to Saved', ok && r429 === 0, `429s ${r429}`);
  check('SH10', 'History stays small (autosaves thinned to one per 10 minutes)', nv <= 4, `${nv} versions`);
  await p.reload(); await p.waitForSelector('.sx-tabs'); await p.locator('.sx-tabs [role=tab]', { hasText: 'Prospects' }).click(); await p.waitForTimeout(500);
  await go('B3'); const b3 = await cell(1, 2).innerText(); await go('J27'); const j27 = await cell(9, 26).innerText();
  check('SH11', 'Closing and reopening keeps every change (new prospect, the typed numbers)', b3 === 'Test prospect (e2e)' && j27 === '23', `${b3} ${j27}`);
  check('SH12', 'The Aurj workbook never appears in Layer2Funnels', (await q("select count(*)::int n from files f join workspaces w on w.id = f.workspace_id where f.id = $1 and w.slug = 'aurj'", [fid]))[0].n === 1);
  await p.context().close();
}

check('Z1', 'No page errors or console errors', problems.length === 0, problems.slice(0, 5).join(' | '));
const pc = results.filter((x) => x.ok).length; console.log(`\n${pc}/${results.length} checks passed`);
await browser.close(); await admin.end(); await s.close?.(); process.exit(pc === results.length ? 0 : 1);
