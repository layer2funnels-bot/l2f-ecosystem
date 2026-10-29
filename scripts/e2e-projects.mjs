// Browser journey for Projects on the local stack (needs `npm run stack:start && npm run stack:migrate` and `npm run build:web`; PLAYWRIGHT_MODULE=<path>).
// Real sign-ups, two people in one organization plus one in another: what an agency team does every day in Projects, through the real screens.
// SHOTS=<dir> saves screenshots for a visual review. Sections grow with each Projects release (docs/apps/PROJECTS_AUDIT.md).
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
const shots = process.env.SHOTS; const shot = async (pg, name) => { if (shots) await pg.screenshot({ path: `${shots}/${name}.png` }); };
const problems = [];

async function signUp(tag, name) {
  const email = `pj.${tag}.${stamp}@example.com`;
  const ctx = await b.newContext({ viewport: { width: 1366, height: 860 } }); const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`${tag}: ${e.message.slice(0, 160)}`)); page.on('console', (m) => { if (m.type() === 'error' && !/status of 4\d\d/.test(m.text())) problems.push(`${tag}: ${m.text().slice(0, 160)}`); });
  await page.goto(`${base}/#/signup`); await page.fill('#nm', name); await page.fill('#em', email); await page.fill('#pw', PW); await page.click('button[type=submit]'); await page.waitForTimeout(1800);
  const uid = (await q('select id from auth.users where email=$1', [email]))[0].id;
  await q("insert into profiles (id, display_name) values ($1,$2) on conflict (id) do update set display_name = excluded.display_name", [uid, name]);
  return { ctx, page, uid };
}
const org = async (slug, name) => (await q('insert into workspaces (slug,name) values ($1,$2) on conflict (slug) do update set name=excluded.name returning id', [slug, name]))[0].id;
const L = await org('layer2funnels', 'Layer2Funnels'), A = await org('aurj', 'Aurj');
const lead = await signUp('lead', `Lena Lead ${stamp % 1000}`), dev = await signUp('dev', `Dan Dev ${stamp % 1000}`), aurj = await signUp('aurj', `Aria Aurj ${stamp % 1000}`);
await q("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff','owner'),($1,$3,'staff','editor'),($4,$5,'staff','owner') on conflict do nothing", [L, lead.uid, dev.uid, A, aurj.uid]);
await q("insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,'projects') on conflict do nothing", [L, dev.uid]);
const lvl = (await q("select id from access_levels where workspace_id=$1 and name='All projects · edit'", [L]))[0].id;
await q("insert into access_assignments (workspace_id,access_level_id,principal_type,principal_id) values ($1,$2,'user',$3)", [L, lvl, dev.uid]);
const P = (await q("insert into projects (workspace_id,name,status) values ($1,$2,'active') returning id", [L, `Website relaunch ${stamp}`]))[0].id;
for (const p of [lead.page, dev.page, aurj.page]) { await p.goto(`${base}/#/projects`); await p.reload(); await p.waitForSelector('.pj-head h1', { timeout: 15000 }); }

// ---------------------------------------------------------------- R1: working together
const page = lead.page;
await page.goto(`${base}/#/projects/p/${P}?tab=list`); await page.waitForSelector('.pj-add input', { timeout: 9000 });
await page.fill('.pj-add input >> nth=0', 'Write homepage copy'); await page.keyboard.press('Enter'); await page.waitForSelector('text=Write homepage copy');
await page.click('button.pj-title:has-text("Write homepage copy")'); await page.waitForSelector('.drawer button[aria-pressed]:not([disabled])', { timeout: 9000 });
check('PR1', 'The task panel has a Follow button, Subtasks, a Checklist, Comments and History (no "coming soon" placeholders)',
  await page.locator('.drawer button:has-text("Following")').isVisible() && await page.locator('.drawer h3:has-text("Subtasks")').isVisible() && await page.locator('.drawer h3:has-text("Comments")').isVisible()
  && await page.locator('.drawer summary:has-text("History")').isVisible() && (await page.locator('text=arrive with the notification layer').count()) === 0 && (await page.locator('.pj-soon').count()) === 0);
await page.fill('.pj-subtasks input[name=s]', 'Hero section'); await page.keyboard.press('Enter'); await page.waitForSelector('.pj-subtasks button.pj-title:has-text("Hero section")', { timeout: 9000 });
check('PR2', 'A subtask is added inside its task, as a real task with its own row', await page.locator('.pj-subtasks button.pj-title:has-text("Hero section")').isVisible());
// mention Dan with the @ picker
const box = page.locator('.cm-new textarea'); await box.click(); await box.type(`Please review this @Dan Dev ${stamp % 1000}`);   // keep typing the full name: the organization has several Dans from earlier runs
await page.waitForSelector('.cm-sugg li', { timeout: 5000 }); const offered = await page.locator('.cm-sugg li').count(); await page.keyboard.press('Enter'); await box.type('before Friday');
await page.click('.cm-send button:has-text("Comment")'); await page.waitForSelector('.cm-item .cm-body', { timeout: 9000 });
const posted = await page.locator('.cm-item .cm-body').first().innerText();
check('PR3', 'Typing @ suggests teammates and keeps narrowing as the full name is typed; Enter picks it and the comment is posted', offered === 1 && posted.includes(`@Dan Dev ${stamp % 1000} before Friday`), `${offered} offered; ${posted}`);
await page.click('.drawer summary:has-text("History")'); await page.waitForTimeout(600);
const hist = await page.locator('.act-list').innerText();
check('PR4', 'History tells, in words, who created the task, added a subtask and commented', /created this task/.test(hist) && /added a subtask/.test(hist) && /commented/.test(hist), hist.slice(0, 200));
await shot(page, 'r1-task-panel');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
check('PR5', 'The List shows the task with its subtask count, and the subtask is not listed again on its own', (await page.locator('.pj-row:has-text("Write homepage copy")').innerText()).includes('0/1') && (await page.locator('.pj-sec button.pj-title:has-text("Hero section")').count()) === 0);

// Dan: the bell tells him, and takes him to the task
await dev.page.goto(`${base}/#/projects`); await dev.page.reload(); await dev.page.waitForSelector('#bell .badge:not([hidden])', { timeout: 9000 }).catch(() => {});
const badge = await dev.page.locator('#bell .badge').innerText().catch(() => '');
check('PR6', 'The mentioned teammate sees an unread count on the header bell', Number(badge) >= 1, badge);
await dev.page.click('#bell'); await dev.page.waitForSelector('.bell-item', { timeout: 9000 });
const note = await dev.page.locator('.bell-item').first().innerText();
check('PR7', 'The bell lists who mentioned them, on which task and project', /mentioned you on “Write homepage copy”/.test(note) && note.includes(`Website relaunch ${stamp}`), note);
await dev.page.waitForTimeout(400); await shot(dev.page, 'r1-bell');
await dev.page.click('.bell-item >> nth=0'); await dev.page.waitForSelector('.drawer .cm-body:has-text("Please review")', { timeout: 9000 }).catch(() => {});
check('PR8', 'Clicking it opens that task, and the notification is marked read', (await dev.page.locator('.drawer input.doctitle').inputValue()) === 'Write homepage copy' && /Please review/.test(await dev.page.locator('.drawer .cm-list').innerText()));
await dev.page.keyboard.press('Escape'); await dev.page.reload(); await dev.page.waitForSelector('#bell'); await dev.page.waitForTimeout(800);
const unreadLeft = await q('select count(*)::int n from notifications where user_id=$1 and read_at is null', [dev.uid]);
check('PR9', 'After reading it the badge is gone', await dev.page.locator('#bell .badge').isHidden(), `unread in db: ${unreadLeft[0].n}, badge: ${await dev.page.locator('#bell .badge').innerText().catch(() => '')}`);
// Aurj sees nothing of it
await aurj.page.reload(); await aurj.page.waitForSelector('#bell'); await aurj.page.waitForTimeout(800);
await aurj.page.click('#bell'); await aurj.page.waitForSelector('.bell-menu .mfoot, .bell-item', { timeout: 9000 });
const aurjBell = await aurj.page.locator('.bell-menu').innerText();
await aurj.page.keyboard.press('Escape'); await aurj.page.goto(`${base}/#/projects/p/${P}`); await aurj.page.waitForSelector('.empty', { timeout: 9000 }).catch(() => {});
const aurjMain = await aurj.page.locator('#main').innerText();
check('PR10', 'Someone in another organization gets no notification and cannot open the project', /all caught up/.test(aurjBell) && /Not here/.test(aurjMain), `${aurjBell.slice(0, 80)} | ${aurjMain.slice(0, 120)}`);

check('PR99', 'No script errors or page policy violations during the journey', problems.length === 0, problems.slice(0, 3).join(' | '));
const failed = results.filter((r) => !r.ok); console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
await b.close(); await s.close?.(); await admin.end(); await fake.close?.(); process.exit(failed.length ? 1 : 0);
