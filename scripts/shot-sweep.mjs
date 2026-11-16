// Visual sweep of every screen changed in the recovery, signed in as an owner, with real-looking data (the owner's reference avatar imported).
// Writes screenshots to $SHOTS (default e2e-shots/sweep) at desktop 1440 and phone 390 for a human (or Claude) to look at. Not a pass/fail test.
//   WEB_ROOT=dist/web node scripts/shot-sweep.mjs
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import pg from 'pg';
import { startDevServer, LOCAL_ENV } from './dev-server.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright');
const OUT = process.env.SHOTS || 'e2e-shots/sweep'; mkdirSync(OUT, { recursive: true });
const DOCX = new URL('../docs/implementation/recovery/Dream_Customer_Avatar_Farhat_V1.0.docx', import.meta.url).pathname;
const admin = new pg.Client({ connectionString: 'postgresql://supabase_admin:postgres@127.0.0.1:54332/postgres' }); await admin.connect();
const q = async (sql, a = []) => (await admin.query(sql, a)).rows;
const s = await startDevServer({ port: 0, sink: () => {}, env: { ...LOCAL_ENV, ...process.env }, limits: { read: { max: 5000, windowMs: 60_000 }, write: { max: 500, windowMs: 60_000 }, sensitive: { max: 200, windowMs: 60_000 } } });
const base = `http://127.0.0.1:${s.port}`; const browser = await chromium.launch();
const L = (await q("select id from workspaces where slug = 'layer2funnels'"))[0].id; const stamp = Date.now(); const PW = 'correct-horse-battery-staple';
const errors = [];
async function person(name, role) {
  const email = `sw.${name.replace(/\s+/g, '').toLowerCase()}.${stamp}@example.com`; const c = await browser.newContext(); const p = await c.newPage();
  await p.goto(`${base}/#/signup`); await p.fill('#nm', name); await p.fill('#em', email); await p.fill('#pw', PW); await p.click('button[type=submit]'); await p.waitForTimeout(1200); await c.close();
  const id = (await q('select id from auth.users where email = $1', [email]))[0].id;
  await q("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff',$3) on conflict do nothing", [L, id, role]); await q('update profiles set active_workspace_id = $1, display_name = $3 where id = $2', [L, id, name]);
  return { id, email };
}
const O = await person('Sweep Owner', 'owner'); const E = await person('Sweep Editor', 'editor');
await q("insert into workspace_apps (workspace_id, app_key, enabled) values ($1, 'tasks', true) on conflict (workspace_id, app_key) do update set enabled = true", [L]);
const open = async (w, h) => { const p = await (await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 800 })).newPage(); p.on('pageerror', (e) => errors.push(`${p.url()} ${e.message}`));
  p.on('response', async (r) => { if (r.url().includes('/api/') && r.status() >= 400 && r.status() !== 503) errors.push(`${r.status()} ${r.url().split('/api/')[1]} ${(await r.text().catch(() => '')).slice(0, 120)}`); });
  await p.goto(`${base}/#/signin`); await p.fill('#em', O.email); await p.fill('#pw', PW); await p.click('button[type=submit]'); await p.waitForTimeout(1500); return p; };
const page = await open(1440, 900);
const shot = async (p, name, url, sel, full = true) => { if (url) { await p.goto(`${base}/#${url}`); } if (sel) await p.waitForSelector(sel, { timeout: 15000 }).catch(() => errors.push(`missing ${sel} on ${url}`)); await p.waitForTimeout(900); await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }); };

// import the reference avatar through the real flow
await page.goto(`${base}/#/office/funnels/avatars/new`); await page.waitForSelector('.startc'); await page.setInputFiles('.startc input[type=file]', DOCX); await page.waitForSelector('text=sections found', { timeout: 15000 });
await page.getByRole('button', { name: 'Continue' }).click(); await page.waitForSelector('.imp-row'); await page.locator('.imp-row').nth(1).locator('details summary').click(); await page.waitForTimeout(300);
await shot(page, '01-import-review', null, '.imp-row');
await page.getByRole('button', { name: 'Looks right' }).click(); await page.getByRole('button', { name: 'Next' }).click(); await page.getByRole('button', { name: 'Create avatar' }).click();
await page.waitForURL(/avatars\/[0-9a-f-]{36}$/, { timeout: 15000 }); const avId = page.url().split('/').pop();
await shot(page, '02-avatar-profile', null, '.avcardp');
await shot(page, '03-avatar-full', `/office/funnels/avatars/${avId}/deep`, '.chap');
await shot(page, '04-avatar-edit-about', `/office/funnels/avatars/${avId}/edit/about`, '.pickgrid', false);
const p1 = (await q('select profile from funnel_avatars where id = $1', [avId]))[0].profile;
await shot(page, '05-avatar-edit-market', `/office/funnels/avatars/${avId}/edit/${p1.sections[1].id}`, '.blked', false);
await shot(page, '06-avatar-edit-basic', `/office/funnels/avatars/${avId}/edit/${p1.sections.find((x) => x.type === 'basic').id}`, '.blked', false);
await page.goto(`${base}/#/office/funnels/avatars/${avId}`); await page.waitForSelector('.avcardp'); await page.getByRole('button', { name: 'Choose what the profile shows' }).click(); await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/07-avatar-card-picker.png` }); await page.keyboard.press('Escape');
await shot(page, '08-avatar-use', `/office/funnels/avatars/${avId}/use`, '.studio-body');
await shot(page, '09-avatar-settings', '/office/funnels/avatars/settings', '.setrow');
await shot(page, '10-avatars-list', '/office/funnels/avatars', '.avcard');
await shot(page, '11-story-new', '/office/funnels/stories/new', '.formcol');
await shot(page, '12-brandkit-new', '/office/funnels/brand_kits/new', '.formcol');
await shot(page, '13-admin-people', '/office/admin/people', '.tbl6');
await shot(page, '14-admin-teammate', `/office/admin/person/${E.id}`, '.acc-row');
await shot(page, '15-admin-clients', '/office/admin/clients', '.cagrid');
await shot(page, '16-admin-organization', '/office/admin/branding', 'input[aria-label="Organization name"]');
await shot(page, '17-documents', '/office/documents', '.docsec');
await page.locator('.docsec').first().getByRole('button', { name: 'Add from Drive' }).click().catch(() => {}); await page.waitForTimeout(800); await page.screenshot({ path: `${OUT}/18-documents-from-drive.png` }); await page.keyboard.press('Escape');
await shot(page, '19-launcher', '/launcher', '.shelf .tile', false);
await page.getByRole('button', { name: 'Arrange apps' }).click().catch(() => {}); await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/20-launcher-arrange.png` });
// Tasks: a folder with a list, and the dialog
await page.goto(`${base}/#/tasks/today`); await page.waitForSelector('.tside .addrow', { timeout: 15000 });
await page.locator('.tside .addrow').click(); await page.locator('.dlg').getByRole('radio', { name: 'Folder' }).click(); await page.locator('.dlg').getByLabel('Name').fill('Clients'); await page.getByRole('button', { name: 'Create' }).click(); await page.waitForTimeout(1200);
await page.locator('.tfold-empty').first().click(); await page.locator('.dlg').getByLabel('Name').fill('Acme launch'); await page.getByRole('button', { name: 'Create' }).click(); await page.waitForTimeout(1500);
for (const t of ['Write the brief', 'Book kickoff call', 'Draft landing page']) { await page.fill('#tcapi', t).catch(() => {}); await page.press('#tcapi', 'Enter').catch(() => {}); await page.waitForTimeout(500); }
await shot(page, '21-tasks-list-folder', null, '.tdoc');
await page.locator('.tside .addrow').click(); await page.locator('.dlg').getByLabel('Where').selectOption('team').catch(() => {}); await page.locator('.dlg .ppchips .chip').nth(1).click().catch(() => {}); await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/22-tasks-new-list.png` }); await page.keyboard.press('Escape');
// phone
const ph = await open(390, 844);
await shot(ph, '30-phone-avatar-profile', `/office/funnels/avatars/${avId}`, '.avcardp');
await shot(ph, '31-phone-avatar-edit', `/office/funnels/avatars/${avId}/edit/${p1.sections[1].id}`, '.blked');
await shot(ph, '32-phone-clients-matrix', '/office/admin/clients', '.cagrid');
await shot(ph, '33-phone-launcher', '/launcher', '.shelf .tile');
await shot(ph, '34-phone-tasks', '/tasks/today', '#tcapi');
console.log(errors.length ? `problems:\n${[...new Set(errors)].join('\n')}` : 'no page errors');
await q("update memberships set status = 'deactivated' where user_id = any($1)", [[O.id, E.id]]);
await browser.close(); await s.close(); await admin.end();
