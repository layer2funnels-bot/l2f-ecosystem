// Browser end-to-end for P02 Tasks on the LOCAL stack (real Chromium → our app → /api → Supabase Auth + Postgres with migration 0059).
// V8 04_TASKS flows 1–5 and acceptance 1–6, at desktop 1280 (mouse) and tablet 834 / phone 390 (touch: controls 44 px), no sideways scroll.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import pg from 'pg';
import { startDevServer, LOCAL_ENV } from './dev-server.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright');
const SHOTS = process.env.SHOTS || 'e2e-shots'; mkdirSync(SHOTS, { recursive: true });
const results = []; const check = (id, n, ok, d = '') => { results.push({ id, n, ok: !!ok, d }); if (!ok) console.log(`FAIL ${id}: ${n} ${d}`); };
const admin = new pg.Client({ connectionString: 'postgresql://supabase_admin:postgres@127.0.0.1:54332/postgres' }); await admin.connect();
const q = async (sql, a = []) => (await admin.query(sql, a)).rows;
const s = await startDevServer({ port: 0, sink: () => {}, env: { ...LOCAL_ENV, ...process.env }, limits: { read: { max: 2000, windowMs: 60_000 }, write: { max: 500, windowMs: 60_000 }, sensitive: { max: 200, windowMs: 60_000 } } });   // room above production limits (the limits are tested in api.test)
const base = `http://127.0.0.1:${s.port}`;
const browser = await chromium.launch();
const touch = await chromium.launch({ args: ['--blink-settings=primaryPointerType=2,availablePointerTypes=2,primaryHoverType=1,availableHoverTypes=1'] });
const problems = [];
const apiErr = [];
const watch = (p) => { p.on('response', async (r) => { if (r.url().includes('/api/') && r.status() >= 400) apiErr.push(`${r.status()} ${r.url().split('/api/')[1]} ${(await r.text().catch(() => '')).slice(0, 160)}`); }); p.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource: the server responded with a status of 4\d\d/.test(m.text())) problems.push(m.text().slice(0, 200)); }); return p; };
const shot = (p, n) => p.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true });
const wait = (p, t) => p.waitForSelector(`text=${t}`, { timeout: 9000 }).catch(async (e) => { await shot(p, 'TASKS-FAILED'); console.log(`--- waiting for "${t}"\n${(await p.locator('body').innerText()).slice(0, 600)}\n--- ${problems.slice(-3).join(' | ')}`); throw e; });
const toast = (p) => p.locator('.toast[data-show=true]').last().innerText().catch(() => '');

// ---- people: an owner (Tabish) and three teammates, all in Layer2Funnels
const L = (await q("select id from workspaces where slug = 'layer2funnels'"))[0].id;
await q("update memberships set status = 'deactivated' where workspace_id = $1 and role <> 'owner' and user_id in (select id from auth.users where email like 'tk.%@example.com')", [L]);   // earlier local runs' people (same names)
await q("update profiles set display_name = 'Old run' where id in (select id from auth.users where email like 'tk.%@example.com')");   // earlier local runs' people (same names)
const stamp = Date.now(); const PW = 'correct-horse-battery-staple';
async function person(name, role) {
  const email = `tk.${name.split(' ')[0].toLowerCase()}.${stamp}@example.com`; const ctxB = await browser.newContext(); const p = await ctxB.newPage();
  await p.goto(`${base}/#/signup`); await p.fill('#nm', name); await p.fill('#em', email); await p.fill('#pw', PW); await p.click('button[type=submit]'); await p.waitForTimeout(1200); await ctxB.close();
  const id = (await q('select id from auth.users where email = $1', [email]))[0].id;
  await q("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff',$3) on conflict do nothing", [L, id, role]); await q('update profiles set active_workspace_id = $1, display_name = $3 where id = $2', [L, id, name]);
  if (role !== 'owner' && role !== 'admin') for (const a of ['tasks', 'projects']) await q('insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,$3) on conflict do nothing', [L, id, a]);
  return { id, email, name };
}
await q("insert into workspace_apps (workspace_id, app_key, enabled) values ($1, 'tasks', true) on conflict (workspace_id, app_key) do update set enabled = true", [L]);
const O = await person('Tabish Riaz', 'owner'); const S = await person('Sana Noor', 'editor'); const B = await person('Bilal Khan', 'editor'); const F = await person('Farah Ahmed', 'editor');
async function signIn(u, { w = 1280, h = 860, touchScreen = false } = {}) {
  const p = watch(await (await (touchScreen ? touch : browser).newContext({ viewport: { width: w, height: h }, hasTouch: touchScreen })).newPage());
  await p.goto(`${base}/#/signin`); await p.fill('#em', u.email); await p.fill('#pw', PW); await p.click('button[type=submit]'); await p.waitForTimeout(1500); return p;
}
const page = await signIn(O);

// =============================================================== flow 1: capture and finish today's tasks (acceptance 1)
await page.goto(`${base}/#/tasks/today`); await wait(page, 'From your lists');
check('T1', 'Tasks opens on Today: the title, the capture bar, "From your lists" and "From other apps"; menu Today · Upcoming · Inbox · Teammates', (await page.locator('.side .nav a').allInnerTexts()).map((x) => x.replace(/\d+/g, '').trim()).join() === 'Today,Upcoming,Inbox,Teammates'
  && await page.locator('#tcapi').isVisible() && (await page.locator('main').innerText()).includes('From other apps'));
for (const t of ['Call Harry tomorrow 3pm @Sana !high', 'Plan webinar tomorrow', 'Reply to DMs', 'Update tracker', 'Send invoice', 'Book dentist']) { await page.fill('#tcapi', t); await page.press('#tcapi', 'Enter'); await page.waitForTimeout(450); }
const harry = (await q("select i.due_date::text d, i.due_time::text t, i.priority, (select array_agg(user_id) from task_assignees a where a.item_id = i.id) who from task_items i where title = 'Call Harry' and created_by = $1", [O.id]))[0];
const tomorrow = new Date(Date.now() + 864e5); const tomISO = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
check('T2', 'The capture bar understands "tomorrow 3pm", @person and !high', harry?.d === tomISO && harry.t === '15:00:00' && harry.priority === 'high' && harry.who?.includes(S.id));
check('T3', 'Captured tasks without a date are due today and listed in "From your lists"', (await page.locator('.tblock').first().locator('.ol-i').count()) >= 4);
await shot(page, 'tk1-today');
const mineId = (await q('select id from task_lists where owner_id = $1 and is_default', [O.id]))[0].id;
await page.goto(`${base}/#/tasks/list/${mineId}`); await page.reload(); await page.waitForSelector('.tdoc .ol-i', { timeout: 9000 });
for (const t of ['Reply to DMs', 'Update tracker', 'Send invoice']) { await page.locator('.ol-i', { hasText: t }).locator('.ol-cb').click(); await page.waitForTimeout(900); }
const visible = await page.locator('.tdoc .ol-i .ol-t').allInnerTexts();
check('T4', 'Completing three tasks hides them in place; the toast says Show completed brings them back', !visible.some((t) => ['Reply to DMs', 'Update tracker', 'Send invoice'].includes(t)) && await page.getByRole('button', { name: 'Show completed (3)' }).isVisible());
await page.getByRole('button', { name: 'Show completed (3)' }).click(); await page.waitForTimeout(400);
const order = (await page.locator('.tdoc .ol-i .ol-t').allInnerTexts()).filter((t) => ['Reply to DMs', 'Update tracker', 'Send invoice', 'Book dentist'].includes(t));
check('T5', 'Show completed (3) puts them back in their original places, ticked; it then reads Hide completed (3)', order.join() === 'Reply to DMs,Update tracker,Send invoice,Book dentist' && (await page.locator('.tdoc .ol-i.done').count()) === 3 && await page.getByRole('button', { name: 'Hide completed (3)' }).isVisible());
await shot(page, 'tk2-show-completed');
await page.getByRole('button', { name: 'Hide completed (3)' }).click(); await page.waitForTimeout(300);
check('T6', 'Hide completed (3) hides them again', (await page.locator('.tdoc .ol-i.done').count()) === 0);

// keyboard: Enter adds below, Tab indents (sub-task), Ctrl Enter completes
await page.locator('.ol-i', { hasText: 'Book dentist' }).locator('.ol-t').click(); await page.keyboard.press('End'); await page.keyboard.press('Enter'); await page.waitForTimeout(700);
await page.keyboard.type('Find insurance card'); await page.keyboard.press('Tab'); await page.waitForTimeout(900);
const subRow = (await q("select parent_id, (select title from task_items p where p.id = i.parent_id) parent from task_items i where title = 'Find insurance card' and created_by = $1", [O.id]))[0];
check('T7', 'Keyboard: Enter adds a task below, Tab makes it a sub-task of the one above', subRow?.parent === 'Book dentist');
await page.locator('.ol-i', { hasText: 'Find insurance card' }).locator('.ol-t').click(); await page.keyboard.press('Control+Enter'); await page.waitForTimeout(900);
check('T8', 'Ctrl Enter completes the task being edited', (await q("select done_at from task_items where title = 'Find insurance card'"))[0].done_at != null);

// =============================================================== flow 2: run a team list (acceptance 4)
await page.locator('.tside .addrow').click(); await page.waitForSelector('.dlg');
check('T8b', 'New list or folder: People is hidden while the list is personal (V8 “team only”)', !(await page.locator('.dlg .ppchips').isVisible()));
await page.locator('.dlg').getByLabel('Name').fill('Build team'); await page.locator('.dlg').getByLabel('Where').selectOption('team');
check('T8c', 'New list or folder: choosing Team shows people as V8 chips, without you in the list', await page.locator('.dlg .ppchips').isVisible() && (await page.locator('.dlg .ppchips .chip', { hasText: O.name.split(' ')[0] }).count()) === 0);
for (const u of [S, B]) await page.locator('.dlg .ppchips .chip', { hasText: u.name.split(' ')[0] }).click();
await page.locator('.dlg .pplv-row', { hasText: B.name }).getByRole('radio', { name: 'Can view' }).click();
await page.getByRole('button', { name: 'Create', exact: true }).click(); await page.waitForSelector('.tl-head .mng', { timeout: 9000 });
const teamId = (await q("select id from task_lists where owner_id = $1 and name = 'Build team' order by created_at desc limit 1", [O.id]))[0].id;
const acc = await q('select user_id, level from task_list_access where list_id = $1', [teamId]);
check('T9', 'New list or folder: a Team list with two people picked at once (Can edit / Can view); the header says Manage access', acc.length === 2 && acc.find((a) => a.user_id === B.id)?.level === 'view' && (await page.locator('.tl-head').innerText()).includes('Shared with 3 people'));
await page.locator('.tl-head .mng').click(); await page.locator('.dlg .ppchips .chip', { hasText: F.name.split(' ')[0] }).click(); await page.getByRole('button', { name: 'Save access' }).click(); await page.waitForTimeout(600);
check('T10', 'Manage access adds a third person; folders and lists pass access to every block and task', (await q('select count(*)::int n from task_list_access where list_id = $1', [teamId]))[0].n === 3);
await page.locator('.tl-head .mng').click(); await page.locator('.dlg .ppchips .chip', { hasText: F.name.split(' ')[0] }).click(); await page.getByRole('button', { name: 'Save access' }).click(); await page.waitForTimeout(600);
await page.getByRole('button', { name: 'Add block' }).click(); await page.waitForTimeout(600);
check('T11', '"+ Add block" adds a block to the list', (await q('select count(*)::int n from task_blocks where list_id = $1', [teamId]))[0].n === 2);
await page.locator('.tblock').first().getByRole('button', { name: 'Add task' }).click(); await page.waitForTimeout(600); await page.keyboard.type('Set up quiz scoring'); await page.keyboard.press('Escape'); await page.locator('h1').click(); await page.waitForTimeout(500);
check('T12', 'Add task in a block, typed inline', (await q("select count(*)::int n from task_items where list_id = $1 and title = 'Set up quiz scoring'", [teamId]))[0].n === 1);
for (const [v, sel] of [['Board', '.kanban'], ['Calendar', '.cal.c6'], ['List', '.tdoc']]) { await page.locator('.vsw button', { hasText: v }).click(); await page.waitForSelector(sel, { timeout: 9000 }); }
check('T13', 'List · Board · Calendar views (no Table, no Mind map)', (await page.locator('.vsw button').allInnerTexts()).map((x) => x.trim()).join() === 'List,Board,Calendar');
const fourth = await signIn(F);
await fourth.goto(`${base}/#/tasks/list/${teamId}`); await fourth.reload(); await wait(fourth, 'We couldn’t find that');
check('T14', 'A fourth person (not given access) gets the not-found screen for the list (API 404)', !(await fourth.locator('main').innerText()).includes('Set up quiz scoring'));

// =============================================================== flow 3: give a task to a teammate (acceptance 2)
await page.locator('#tasks-add').click(); await wait(page, 'Add a task'); await shot(page, 'tk-add-dialog');
await page.locator('.dlg').getByLabel('Task').fill('Record intro video'); for (const u of [S, B]) await page.locator('.dlg .ppchips .chip', { hasText: u.name.split(' ')[0] }).click();
await page.locator('.dlg').getByLabel('List').selectOption(teamId); const today = new Date(); const tISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
await page.locator('.dlg').getByLabel('Due').fill(tISO); await page.locator('.dlg').getByRole('button', { name: 'Add task', exact: true }).click(); await page.waitForTimeout(800);
const sana = await signIn(S); await sana.goto(`${base}/#/tasks/today`); await sana.reload(); await wait(sana, 'Record intro video');
const bilal = await signIn(B); await bilal.goto(`${base}/#/tasks/today`); await bilal.reload(); await wait(bilal, 'Record intro video');
const notes = await q("select user_id from notifications where app = 'tasks' and title = 'Record intro video' and user_id = any($1::uuid[])", [[S.id, B.id]]);
check('T15', 'Two assignees: both see it in Today and both get a notification', notes.length === 2 && notes.some((n) => n.user_id === S.id) && notes.some((n) => n.user_id === B.id));
await page.goto(`${base}/#/tasks/teammates`); await page.reload(); await wait(page, 'Teammates'); await page.getByRole('tab', { name: 'Tasks I gave' }).click(); await page.waitForSelector('.tbl6 .tr', { timeout: 9000 });
check('T16', 'Teammates › Tasks I gave lists the task with its person, list, due date and status', (await page.locator('.tbl6').innerText()).includes('Record intro video') && (await page.locator('.tbl6 .tr', { hasText: 'Record intro video' }).count()) === 2);
await page.getByRole('tab', { name: 'People' }).click(); await page.locator('.cardgrid a', { hasText: S.name }).click(); await wait(page, 'Given by others');
check('T17', 'A person’s page: their lists, "Given by others" and Give a task', (await page.locator('main').innerText()).includes('Record intro video') && await page.getByRole('button', { name: 'Give a task' }).isVisible());
await shot(page, 'tk3-person');

// =============================================================== private tasks (acceptance 5)
await sana.goto(`${base}/#/tasks/today`); await sana.fill('#tcapi', 'Doctor appointment'); await sana.press('#tcapi', 'Enter'); await sana.waitForTimeout(600);
const doc = (await q("select id from task_items where title = 'Doctor appointment' and created_by = $1", [S.id]))[0].id; await q('update task_items set private = true where id = $1', [doc]);
await page.reload(); await wait(page, 'Given by others');
check('T18', 'A private task never appears to a manager — only the count', !(await page.locator('main').innerText()).includes('Doctor appointment') && (await page.locator('main').innerText()).includes('1 private task not shown'));

// =============================================================== flow 4: time a task (acceptance 3)
await page.goto(`${base}/#/tasks/list/${teamId}`); await page.reload(); await page.waitForSelector('.tdoc .ol-i', { timeout: 9000 });
await page.locator('.ol-i', { hasText: 'Set up quiz scoring' }).locator('.ol-timer').click(); await page.waitForSelector('.tpill', { timeout: 9000 });
check('T19', 'Start timer: the pill in the app bar shows the task and a running clock', (await page.locator('.tpill').innerText()).includes('Set up quiz scoring'));
await page.goto(`${base}/#/projects`); await page.waitForTimeout(2500);
check('T20', 'The same pill shows in Projects', (await page.locator('.tpill').count()) === 1 && (await page.locator('.tpill').innerText()).includes('Set up quiz scoring'));
await page.locator('.tpill .tp-stop').click(); await page.waitForFunction(() => !document.querySelector('.tpill'), null, { timeout: 9000 }).catch(() => {});
check('T21', 'Stopping logs exactly one time entry and the pill goes away', (await q("select count(*)::int n from task_time_entries e join task_items i on i.id = e.item_id where i.title = 'Set up quiz scoring' and i.list_id = $1 and e.ended_at is not null", [teamId]))[0].n === 1 && (await page.locator('.tpill').count()) === 0, JSON.stringify(await q("select e.ended_at from task_time_entries e join task_items i on i.id = e.item_id where i.title = 'Set up quiz scoring'")));

// =============================================================== flow 5: send a task to a project (acceptance 6) + right-click menu
const tok = (await (await fetch('http://127.0.0.1:54321/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH', 'content-type': 'application/json' }, body: JSON.stringify({ email: O.email, password: PW }) })).json()).access_token;
const pr = { id: (await (await fetch(`${base}/api/pm.projects.create`, { method: 'POST', headers: { authorization: `Bearer ${tok}`, 'x-org-id': L, 'content-type': 'application/json' }, body: JSON.stringify({ args: { name: 'Funnel Challenge' } }) })).json()).data?.[0]?.r?.id };   // a real project, made through the Projects API
if (!pr.id) console.log('project not created');
await page.goto(`${base}/#/tasks/list/${teamId}`); await page.reload(); await page.waitForSelector('.tdoc .ol-i', { timeout: 9000 });
await page.locator('.ol-i', { hasText: 'Record intro video' }).click({ button: 'right' }); await page.waitForSelector('.ctx');
const menu = await page.locator('.ctx button').allInnerTexts();
check('T22', 'Right-click a task: Complete, Start timer, Add sub-task, Assign people…, Due date…, Priority, Move to block/list, Send to a project, Duplicate, Copy link, Delete',
  ['Complete', 'Start timer', 'Add sub-task', 'Assign people…', 'Due date…', 'Send to a project', 'Duplicate', 'Copy link', 'Delete'].every((x) => menu.some((m) => m.includes(x))), menu.join('|'));
await page.locator('.ctx button', { hasText: 'Send to a project' }).click(); await page.waitForSelector('.dlg'); await page.locator('.dlg select').selectOption(pr.id); await page.getByRole('button', { name: 'Send', exact: true }).click(); await page.waitForTimeout(1500);
const sent = (await q("select project_task_id, project_id, done_at from task_items where title = 'Record intro video' and list_id = $1", [teamId]))[0];
check('T23', 'Send to a project creates a Projects task and leaves a link back', sent?.project_task_id && sent.project_id === pr.id && (await q('select title from pm_tasks where id = $1', [sent.project_task_id]))[0]?.title === 'Record intro video', `${await toast(page)} | ${apiErr.slice(-3).join(' | ')}`);
await page.locator('.tside a[aria-current=page]').click({ button: 'right' }); await page.waitForSelector('.ctx');
const lm = await page.locator('.ctx').innerText();
check('T24', 'Right-click a list: Rename, Icon and colour, Duplicate, Share / access, Turn into a project, Archive', ['Rename', 'Icon and colour', 'Duplicate', 'Share / access', 'Turn into a project', 'Archive'].every((x) => lm.includes(x)), lm);
await page.keyboard.press('Escape');
await page.locator('.ol-i', { hasText: 'Set up quiz scoring' }).click({ button: 'right' }); await page.locator('.ctx button', { hasText: 'Delete' }).click(); await page.waitForTimeout(600);
const gone = (await q("select count(*)::int n from task_items where title = 'Set up quiz scoring' and list_id = $1", [teamId]))[0].n === 0;
await page.locator('.toast').getByRole('button', { name: 'Undo' }).dispatchEvent('click'); await page.waitForTimeout(800);
check('T25', 'Delete removes the task with an Undo toast; Undo brings it back', gone && (await q("select count(*)::int n from task_items where title = 'Set up quiz scoring' and list_id = $1", [teamId]))[0].n === 1);

// =============================================================== Inbox and Upcoming
await page.locator('#tasks-add').click(); await page.locator('.dlg').getByLabel('Task').fill('Idea: quiz for Aurj parents'); await page.locator('.dlg').getByLabel('List').selectOption(''); await page.locator('.dlg').getByRole('button', { name: 'Add task', exact: true }).click(); await page.waitForTimeout(700);
await page.goto(`${base}/#/tasks/inbox`); await page.reload(); await wait(page, 'Idea: quiz for Aurj parents');
await page.locator('.ol-i', { hasText: 'Idea: quiz' }).getByRole('button', { name: 'Move to list' }).click(); await page.locator('.ctx button', { hasText: 'My tasks' }).click(); await page.waitForTimeout(700);
check('T26', 'Inbox: a capture without a list; Move to list files it', (await q("select list_id from task_items where title = 'Idea: quiz for Aurj parents' and created_by = $1", [O.id]))[0].list_id === mineId);
await page.goto(`${base}/#/tasks/upcoming`); await page.reload(); await page.waitForSelector('.upc .card6', { timeout: 9000 });
check('T27', 'Upcoming: day cards from Today to Next week with counts and "+ Add"', (await page.locator('.upc .card6').count()) === 7 && (await page.locator('.upc .card6').nth(1).innerText()).includes('Plan webinar') && (await page.locator('.upc .addt').count()) === 7);

// =============================================================== responsive (V8: no sideways scroll; touch controls 44 px)
async function layout(p) {
  return p.evaluate(() => { const out = { over: document.documentElement.scrollWidth - document.documentElement.clientWidth, small: [] };
    for (const e of document.querySelectorAll('main button, main a[href], main select, main input:not([type=hidden]), .tside a, .tside button')) {
      if (e.closest('.sr, .toast') || e.matches('input[type=checkbox]')) continue; const b = e.getBoundingClientRect(); if (!b.width || !b.height) continue;
      const st = getComputedStyle(e); if (st.visibility === 'hidden' || st.display === 'none' || e.closest('[hidden]')) continue;
      const min = matchMedia('(pointer:coarse)').matches ? 43.5 : 25.5; if (b.height < min || b.width < min) out.small.push(`${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]}:"${(e.innerText || e.getAttribute('aria-label') || '').trim().slice(0, 18)}" ${Math.round(b.width)}x${Math.round(b.height)}`); }
    return out; });
}
for (const [w, label, t] of [[1280, 'desktop', false], [834, 'tablet', true], [390, 'phone', true]]) {
  const p = await signIn(O, { w, h: 900, touchScreen: t }); const bad = [];
  for (const r of ['today', 'upcoming', 'inbox', 'teammates', 'lists', `list/${mineId}`, `list/${teamId}`, `teammates/${S.id}`]) {
    await p.goto(`${base}/#/tasks/${r}`); await p.reload(); await p.waitForTimeout(1600); const l = await layout(p);
    if (l.over > 1 || l.small.length) bad.push(`${r}: over ${l.over}; ${l.small.slice(0, 3).join(' | ')}`);
  }
  check(`TR-${label}`, `At ${w}px every Tasks page has no sideways scroll and every control meets the V8 size`, bad.length === 0, bad.join(' ;; '));
  if (w === 390) { await p.goto(`${base}/#/tasks/list/${mineId}`); await p.reload(); await p.waitForTimeout(1500); await shot(p, 'tk4-phone-list');
    const bar = await p.locator('nav.bbar a, nav.bbar button').allInnerTexts();
    check('TR-bar', 'Phone: the bottom bar is Today, Upcoming, Inbox, Teammates, More', bar.map((x) => x.replace(/\d+/g, '').trim()).join() === 'Today,Upcoming,Inbox,Teammates,More', bar.join('|'));
    await p.locator('nav.bbar a', { hasText: 'More' }).click(); await p.waitForSelector('main .card6 a[href*="#/tasks/list/"]', { timeout: 9000 });
    check('TR-more', 'Phone: More shows every list and New list or folder', (await p.locator('main .card6').innerText()).includes('My tasks') && (await p.locator('main .card6').innerText()).includes('New list or folder')); }
}
check('TJ', 'No script errors during the run', problems.length === 0, problems.slice(0, 3).join(' | '));

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id.padEnd(8)} ${r.n}${r.ok ? '' : `  ${r.d}`}`);
const pass = results.filter((r) => r.ok).length; console.log(`\n${pass}/${results.length} checks passed`);
await browser.close(); await touch.close(); await s.close?.(); await admin.end(); process.exit(pass === results.length ? 0 : 1);
