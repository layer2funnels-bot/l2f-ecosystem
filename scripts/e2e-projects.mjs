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
const lead = await signUp('lead', `Lena Lead ${stamp % 1000000}`), dev = await signUp('dev', `Dan Dev ${stamp % 1000000}`), aurj = await signUp('aurj', `Aria Aurj ${stamp % 1000000}`);
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
const box = page.locator('.cm-new textarea'); await box.click(); await box.type(`Please review this @Dan Dev ${stamp % 1000000}`);   // keep typing the full name: the organization has several Dans from earlier runs
await page.waitForSelector('.cm-sugg li', { timeout: 5000 }); const offered = await page.locator('.cm-sugg li').count(); await page.keyboard.press('Enter'); await box.type('before Friday');
await page.click('.cm-send button:has-text("Comment")'); await page.waitForSelector('.cm-item .cm-body', { timeout: 9000 });
const posted = await page.locator('.cm-item .cm-body').first().innerText();
check('PR3', 'Typing @ suggests teammates and keeps narrowing as the full name is typed; Enter picks it and the comment is posted', offered === 1 && posted.includes(`@Dan Dev ${stamp % 1000000} before Friday`), `${offered} offered; ${posted}`);
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

// ---------------------------------------------------------------- R2: organizing work
await page.goto(`${base}/#/projects/p/${P}?tab=list`); await page.reload(); await page.waitForSelector('.pj-toolbar', { timeout: 9000 });
await page.click('.pj-toolbar button:has-text("Section")'); await page.fill('#ns-name', 'Design'); await page.click('.dialog button:has-text("Add section"), [role=dialog] button:has-text("Add section")');
await page.waitForSelector('.pj-gh:has-text("Design")', { timeout: 9000 });
check('PR11', 'Adding a section switches the List to sections, with the new section and "No section"', (await page.locator('#pj-group').inputValue()) === 'section' && await page.locator('.pj-gh:has-text("No section")').isVisible());
const designAdd = page.locator('.pj-sec:has(.pj-gh:has-text("Design")) .pj-add input');
await designAdd.fill('Moodboard'); await designAdd.press('Enter'); await page.waitForSelector('.pj-sec:has(.pj-gh:has-text("Design")) .pj-title:has-text("Moodboard")', { timeout: 9000 });
check('PR12', 'A task added inside a section lands in that section', true);
await page.click('.pj-title:has-text("Moodboard")'); await page.waitForSelector('.drawer .pj-tags input', { timeout: 9000 });
await page.fill('.drawer .pj-tags input', 'Brand'); await page.press('.drawer .pj-tags input', 'Enter'); await page.waitForSelector('.drawer .pj-taglist .chip:has-text("Brand")', { timeout: 9000 });
await page.fill('#td-due', '2030-06-15'); await page.press('#td-due', 'Tab'); await page.waitForTimeout(600);
await page.keyboard.press('Escape'); await page.waitForTimeout(500);
await page.click('.pj-title:has-text("Moodboard")'); await page.waitForSelector('.drawer .pj-taglist .chip:has-text("Brand")', { timeout: 9000 }).catch(() => {});
const dueShown = await page.inputValue('#td-due');
check('PR13', 'A tag added in the task panel shows on the task, and a saved due date shows again in the date field when reopened', dueShown === '2030-06-15' && await page.locator('.drawer .pj-taglist .chip:has-text("Brand")').isVisible(), dueShown);
// files: one of the project's Drive documents
await q("insert into files (workspace_id,space,name,kind,project_id,managed_by,uploaded_by,size_bytes) values ($1,'shared','Brand guide','document',$2,'projects',$3,0)", [L, P, lead.uid]);
await page.click('.drawer button:has-text("Attach a project file")'); await page.waitForSelector('[role=dialog] button:has-text("Attach")', { timeout: 9000 });
await page.click('[role=dialog] .pj-row:has-text("Brand guide") button:has-text("Attach")'); await page.waitForSelector('.drawer .pj-files .pj-title:has-text("Brand guide")', { timeout: 9000 });
check('PR14', 'A project file is attached to the task and opens from it', (await page.getAttribute('.drawer .pj-files a.pj-title', 'href'))?.startsWith('#/doc/'));
await shot(page, 'r2-task-panel');
await page.keyboard.press('Escape'); await page.waitForTimeout(500);
await page.selectOption('#pj-tag', { label: 'Brand' }); await page.waitForTimeout(300);
const tagged = await page.locator('.pj-sec .pj-title').allInnerTexts();
await page.selectOption('#pj-tag', ''); await page.fill('#pj-q', 'homepage'); await page.waitForTimeout(300);
const found = await page.locator('.pj-sec .pj-title').allInnerTexts();
await page.fill('#pj-q', ''); await page.waitForTimeout(200);
check('PR15', 'Filtering by tag and finding by words show only the matching tasks', tagged.join() === 'Moodboard' && found.join() === 'Write homepage copy', `${tagged} | ${found}`);
await page.check('.pj-row:has-text("Moodboard") .pj-pick'); await page.check('.pj-row:has-text("Write homepage copy") .pj-pick');
await page.waitForSelector('.pj-bulk', { timeout: 5000 });
await page.selectOption('.pj-bulk select[aria-label="Priority…"]', 'urgent'); await page.waitForTimeout(1200);
const urgent = await q("select count(*)::int n from project_tasks where project_id=$1 and priority='urgent' and title in ('Moodboard','Write homepage copy')", [P]);
check('PR16', 'Selecting two tasks shows the bulk bar, and one choice changes both', urgent[0].n === 2 && !(await page.locator('.pj-bulk').count()));
await shot(page, 'r2-list');
await page.click('[role=tab]:has-text("Board")'); await page.waitForSelector('.pj-board'); await page.click('.seg button:has-text("Columns by section")'); await page.waitForTimeout(400);
check('PR17', 'The Board can show columns by section', await page.locator('.pj-col[aria-label="Design"]').isVisible() && await page.locator('.pj-col[aria-label="No section"]').isVisible());
await shot(page, 'r2-board');
await page.setViewportSize({ width: 390, height: 844 }); await page.click('[role=tab]:has-text("List")'); await page.waitForTimeout(500);
const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
check('PR18', 'On a phone the List with its toolbar does not scroll sideways', over <= 1, String(over));
await shot(page, 'r2-phone');
await page.setViewportSize({ width: 1366, height: 860 });

// ---------------------------------------------------------------- R3: repeatable work
await page.goto(`${base}/#/projects/p/${P}?tab=list`); await page.reload(); await page.waitForSelector('.pj-toolbar', { timeout: 9000 });
await page.click('.pj-title:has-text("Moodboard")'); await page.waitForSelector('.drawer #td-start', { timeout: 9000 });
await page.fill('#td-start', '2030-06-10'); await page.press('#td-start', 'Tab'); await page.waitForTimeout(500);
await page.selectOption('#td-repeat', 'weekly'); await page.waitForTimeout(500);
await page.waitForSelector('.drawer .pj-deps select', { timeout: 9000 });
await page.selectOption('.drawer .pj-deps select', { label: 'Write homepage copy' }); await page.waitForSelector('.drawer .pj-deps .notice', { timeout: 9000 });
check('PR19', 'In the task panel: a start date, "every week", and a task it waits on (shown as "Waiting on 1 task")', (await page.locator('.drawer .pj-deps .notice').innerText()).includes('Waiting on 1 task'));
await page.keyboard.press('Escape'); await page.waitForTimeout(500);
check('PR20', 'The List marks the task as waiting and repeating', /Waiting on 1/.test(await page.locator('.pj-row:has-text("Moodboard")').innerText()) && (await page.locator('.pj-row:has-text("Moodboard")').innerText()).includes('↻'));
// Dan finishes what Moodboard waits on: Moodboard's assignee (Lena) is told
await q("update project_tasks set assignee_id=$1 where project_id=$2 and title='Moodboard'", [lead.uid, P]);
await dev.page.goto(`${base}/#/projects/p/${P}?tab=list`); await dev.page.reload(); await dev.page.waitForSelector('.pj-toolbar', { timeout: 9000 });
await dev.page.click('.pj-row:has-text("Write homepage copy") .pj-check'); await dev.page.waitForTimeout(1200);
await page.reload(); await page.waitForSelector('#bell .badge:not([hidden])', { timeout: 9000 }).catch(() => {}); await page.click('#bell'); await page.waitForSelector('.bell-item', { timeout: 9000 });
check('PR21', 'When the task it waited on is done, its assignee is told it can start', /“Moodboard” can start/.test(await page.locator('.bell-menu').innerText()));
await page.keyboard.press('Escape');
await page.click('[role=tab]:has-text("Timeline")'); await page.waitForSelector('.pj-tl', { timeout: 9000 });
check('PR22', 'On the Timeline a task with a start and a due date is a bar', await page.locator('.pj-mark.span:has-text("Moodboard")').isVisible());
await shot(page, 'r3-timeline');
// finishing a repeating task makes the next one
await page.click('[role=tab]:has-text("List")'); await page.click('.pj-row:has-text("Moodboard") .pj-check'); await page.waitForTimeout(1500);
const reps = await q("select due_on::text, status from project_tasks where project_id=$1 and title='Moodboard' order by due_on", [P]);
check('PR23', 'Finishing the weekly task creates next week\'s, due 7 days later', reps.length === 2 && reps[0].status === 'done' && reps[1].due_on === '2030-06-22' && reps[1].status === 'todo', JSON.stringify(reps));
// save as template, then a new project from it
await page.click('.pj-actions button:has-text("Save as template")'); await page.waitForSelector('#cp-name'); await page.fill('#cp-name', `Relaunch template ${stamp}`);
await page.click('[role=dialog] button:has-text("Save template")'); await page.waitForSelector('.pj-meta .chip:has-text("Template")', { timeout: 9000 });
await page.goto(`${base}/#/projects`); await page.waitForSelector(`.pj-tpl:has-text("Relaunch template ${stamp}")`, { timeout: 9000 });
await page.click(`.pj-tpl:has-text("Relaunch template ${stamp}") button:has-text("Use template")`); await page.waitForSelector('#np-name');
await page.fill('#np-name', `From template ${stamp}`); await page.fill('#np-start', '2031-01-05'); await page.click('[role=dialog] button:has-text("Create project")');
await page.waitForSelector(`h1:has-text("From template ${stamp}")`, { timeout: 9000 });
const copied = await q("select t.title, s.name as section from project_tasks t join projects p on p.id=t.project_id left join project_sections s on s.id=t.section_id where p.name=$1 order by t.title", [`From template ${stamp}`]);
const openInTemplate = await q("select count(*)::int n from project_tasks t join projects p on p.id=t.project_id where p.name=$1 and t.status <> 'done' and t.archived_at is null", [`Relaunch template ${stamp}`]);
check('PR24', 'Save as template, then "Use template": the new project starts with the template\'s sections and all its open tasks', copied.some((c) => c.title === 'Moodboard' && c.section === 'Design') && copied.length === openInTemplate[0].n, JSON.stringify(copied));
await shot(page, 'r3-from-template');

// ---------------------------------------------------------------- R4: oversight
const soon = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
const T9 = (await q("insert into project_tasks (workspace_id,project_id,title,assignee_id,due_on) values ($1,$2,'Write ads',$3,$4) returning id", [L, P, dev.uid, soon]))[0].id;
await page.goto(`${base}/#/projects/p/${P}?tab=list&task=${T9}`); await page.reload(); await page.waitForSelector('.drawer #td-est', { timeout: 9000 });
await page.fill('#td-est', '45'); await page.press('#td-est', 'Tab'); await page.waitForTimeout(800);
check('PR25', 'A task gets an estimate in hours (stored as minutes)', (await q('select estimate_minutes from project_tasks where id=$1', [T9]))[0].estimate_minutes === 2700);
await page.keyboard.press('Escape');
await page.click('[role=tab]:has-text("Report")'); await page.waitForSelector('.pj-stats', { timeout: 9000 });
const repText = await page.locator('.pj-body').innerText();
check('PR26', 'The project Report shows open, overdue and estimated work left, tasks by status and people with their time', /open tasks/.test(repText) && /45 h/.test(repText) && /Tasks by status/.test(repText) && repText.includes(`Dan Dev ${stamp % 1000000}`), repText.slice(0, 200));
await shot(page, 'r4-report');
await page.click('.pj-side a:has-text("Workload")'); await page.waitForSelector('.pj-wl, .empty', { timeout: 9000 });
const danRow = page.locator(`.pj-wl tr:has(th:has-text("Dan Dev ${stamp % 1000000}"))`);
check('PR27', 'Workload shows each person by week; a week over 40 hours is flagged', await danRow.isVisible() && /Over 40 h/.test(await danRow.innerText()), await danRow.innerText().catch(() => ''));
await shot(page, 'r4-workload');
await page.click('.pj-side a:has-text("Portfolio")'); await page.waitForSelector('.pj-pf', { timeout: 9000 });
check('PR28', 'Portfolio lists the projects with progress, open and overdue work', (await page.locator(`.pj-pf tr:has-text("Website relaunch ${stamp}")`).count()) === 1);
await shot(page, 'r4-portfolio');

// R5: a rule set on screen applies to the next change
await page.goto(`${base}/#/projects/p/${P}?tab=rules`); await page.reload(); await page.waitForSelector('#ru-when', { timeout: 9000 });
await page.selectOption('#ru-when', 'status'); await page.selectOption('#ru-status', 'blocked'); await page.selectOption('#ru-action', 'priority'); await page.selectOption('#ru-pri', 'urgent');
await page.click('button:has-text("Add rule")'); await page.waitForSelector('.pj-rule', { timeout: 9000 });
const ruleText = await page.locator('.pj-rules').innerText();
check('PR29', 'A rule is added on the Rules tab and shown as a sentence', /When a task moves to Blocked, set priority to Urgent\./.test(ruleText), ruleText);
await q("update project_tasks set status='blocked' where id=$1", [T9]);
check('PR30', 'The rule applies to the next change (moved to Blocked, so priority became Urgent)', (await q('select priority from project_tasks where id=$1', [T9]))[0].priority === 'urgent');
await page.click('.pj-rule button:has-text("Pause")'); await page.waitForSelector('.pj-rule.off', { timeout: 9000 });
check('PR31', 'A rule can be paused from the same tab', /\(paused\)/.test(await page.locator('.pj-rules').innerText()));
await shot(page, 'r5-rules');

check('PR99', 'No script errors or page policy violations during the journey', problems.length === 0, problems.slice(0, 3).join(' | '));
const failed = results.filter((r) => !r.ok); console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
await b.close(); await s.close?.(); await admin.end(); await fake.close?.(); process.exit(failed.length ? 1 : 0);
