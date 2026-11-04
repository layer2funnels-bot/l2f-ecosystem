// Browser journey for the Docs word processor on the local stack (needs `npm run stack:start && npm run stack:migrate`; PLAYWRIGHT_MODULE=<path>).
// Creates a throwaway owner, opens a stored v1 document, edits it through menus, toolbar, keyboard and right-click, uses tabs, tables, pictures
// (fake storage), find and replace, page setup, Word and text downloads, print preview, saves, reloads, checks version history, and takes screenshots.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import pg from 'pg';
import { startDevServer, LOCAL_ENV } from './dev-server.mjs';
import { startFakeSupabaseStorage } from '../test/fakes/fake-supabase-storage.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const SHOTS = process.env.SHOTS ?? '/tmp/claude-0/-home-user/ab44cf5d-5e81-5a14-b767-4c6a8e5c0226/scratchpad/docs'; mkdirSync(SHOTS, { recursive: true });
const admin = new pg.Client({ connectionString: 'postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres' }); await admin.connect();
const q = async (s, a = []) => (await admin.query(s, a)).rows;
const stamp = Date.now(), PW = 'correct-horse-battery-staple';
let seenP = 0; const results = []; const check = (id, name, ok, detail = '') => { if (problems.length > seenP) { console.log('  (console problem logged before', id, ')'); seenP = problems.length; } results.push({ id, name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${id.padEnd(5)} ${name}${ok ? '' : `  [${detail}]`}`); };

const fake = await startFakeSupabaseStorage({ serviceKey: 'k' });
const s = await startDevServer({ port: 0, sink: () => {}, extraConnect: fake.url, env: { ...LOCAL_ENV, ...process.env, STORAGE_DRIVER: 'supabase', STORAGE_URL: fake.url, STORAGE_SERVER_KEY: 'k', RATE_LIMIT_STORE: 'memory' },
  limits: { read: { max: 5000, windowMs: 60000 }, write: { max: 5000, windowMs: 60000 }, sensitive: { max: 500, windowMs: 60000 } } });
const base = `http://127.0.0.1:${s.port}`;
const b = await chromium.launch();
const problems = [];
const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true }); const page = await ctx.newPage();
page.on('pageerror', (e) => problems.push(e.message.slice(0, 200))); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text()) && /\.(js|mjs|html)/.test(m.location().url)) problems.push(`console: ${m.text().slice(0, 100)} @${m.location().url.split('/').pop()}:${m.location().lineNumber}`); });

// ---- setup: owner of Layer2Funnels with Drive switched on
const org = async (slug, name) => (await q('insert into workspaces (slug,name) values ($1,$2) on conflict (slug) do update set name=excluded.name returning id', [slug, name]))[0].id;
const L = await org('layer2funnels', 'Layer2Funnels'); await org('aurj', 'Aurj');
await q("update public.apps set lifecycle='active' where key in ('forms','value_ladder','social_planner','whiteboard','planner')");
await q("insert into workspace_apps (workspace_id,app_key,enabled) select $1, k, true from unnest(array['office','projects','planner','drive','clients']) k on conflict (workspace_id,app_key) do update set enabled=true", [L]);
const mail = `docs.${stamp}@example.com`;
await page.goto(`${base}/#/signup`); await page.reload(); await page.waitForSelector('#nm', { timeout: 9000 });
await page.fill('#nm', 'Dana Docs'); await page.fill('#em', mail); await page.fill('#pw', PW); await page.click('button[type=submit]'); await page.waitForTimeout(1800);
const uid = (await q('select id from auth.users where email=$1', [mail]))[0].id;
await q("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff','owner') on conflict do nothing", [L, uid]);
await page.evaluate(async (org) => { const t = JSON.parse(localStorage.getItem('l2f.session.v1')).access; await fetch('/api/org.switch', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${t}`, 'x-org-id': '00000000-0000-0000-0000-000000000000' }, body: JSON.stringify({ org, app: 'office' }) }); }, L);

await page.reload(); await page.waitForTimeout(1200);
const v1 = JSON.stringify({ v: 1, blocks: [{ t: 'h1', c: [{ x: 'Quarterly plan' }] }, { t: 'p', c: [{ x: 'Start with ' }, { x: 'the offer', b: 1 }, { x: '.' }] }, { t: 'h2', c: [{ x: 'Traffic' }] }, { t: 'ul', items: [[{ x: 'Ads' }], [{ x: 'Email' }]] }] });
const mkDoc = async (name, body) => { const id = (await q("insert into files (workspace_id, space, uploaded_by, name, kind, mime_type, size_bytes) values ($1,'shared',$2,$3,'document','application/vnd.l2f.doc+json',100) returning id", [L, uid, name]))[0].id; await q('insert into file_versions (workspace_id, file_id, body, note) values ($1,$2,$3,$4)', [L, id, body, 'first']); return id; };
const docId = await mkDoc('Quarterly plan', v1);
page.setDefaultTimeout(9000);
await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.sourceFile?.split('/').pop()}:${e.lineNumber}:${e.columnNumber} sample=${e.sample}`)); });
process.on('uncaughtException', async (e) => { console.log('FATAL', String(e.message).split('\n')[0], problems.slice(0, 2), await page.evaluate(() => window.__csp?.slice(0, 5)).catch(() => 'n/a')); try { await page.screenshot({ path: `${SHOTS}/fail.png` }); } catch {} process.exit(1); });
const ed = page.locator('.docpage'); const wait = (t, ms = 12000) => page.waitForSelector(`text=${t}`, { timeout: ms }).catch(async (e) => { console.log('WAIT FAILED', t, problems.slice(0, 5)); await page.screenshot({ path: `${SHOTS}/fail.png` }); throw e; });
const saved = () => page.waitForFunction(() => /^Saved/.test(document.querySelector('.docstate')?.innerText ?? ''), null, { timeout: 15000 });
const state = () => page.locator('.docstate').innerText();
const menu = async (name, item) => { await page.getByRole('menuitem', { name, exact: true }).first().click(); await page.getByRole('menuitem', { name: item }).first().click(); };
const shot = (n) => page.screenshot({ path: `${SHOTS}/${n}.png` });
const stored = async (id = docId) => { const r = (await q('select f.current_version, v.body from files f join file_versions v on v.file_id = f.id and v.version = f.current_version where f.id = $1', [id]))[0]; return { v: r.current_version, doc: JSON.parse(r.body) }; };

await page.goto(`${base}/#/doc/${docId}`); await wait('Quarterly plan');
check('W1', 'A stored v1 document opens: heading, bold text and list are there, the outline lists the headings, one tab "Tab 1", "Saved" shows',
  (await ed.locator('h1').innerText()) === 'Quarterly plan' && (await ed.locator('strong').innerText()) === 'the offer' && (await ed.locator('li').count()) === 2 && (await page.locator('.docoutline li').allInnerTexts()).join() === 'Quarterly plan,Traffic'
  && (await page.locator('.dx-tabbtn').allInnerTexts()).join() === 'Tab 1' && (await state()).startsWith('Saved'));
check('W2', 'The menu bar has File, Edit, View, Insert, Format and Tools, and the toolbar has style, font, size and the basic formatting buttons',
  (await page.getByRole('menuitem', { name: /^(File|Edit|View|Insert|Format|Tools)$/ }).count()) === 6 && (await page.locator('.dx-toolbar [aria-label="Bold"]').count()) === 1 && (await page.locator('select[aria-label="Font"]').count()) === 1);
await shot('01-open-1366');

// ---- typing, shortcuts, styles
await ed.click(); await page.keyboard.press('Control+End'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
await page.keyboard.type('Plain then '); await page.keyboard.press('Control+b'); await page.keyboard.type('bold'); await page.keyboard.press('Control+b'); await page.keyboard.type(' and '); await page.keyboard.press('Control+i'); await page.keyboard.type('italic'); await page.keyboard.press('Control+i');
await page.waitForTimeout(900);
const lastP = ed.locator('> p, > div').last();
check('W3', 'Ctrl+B and Ctrl+I toggle formatting for the next typed text (caret formatting) and the status shows unsaved changes',
  (await ed.locator('strong', { hasText: /^bold$/ }).count()) === 1 && (await ed.locator('em', { hasText: /^italic$/ }).count()) === 1 && (await state()).includes('Unsaved') && /Plain then/.test(await lastP.innerText()));
await page.keyboard.press('Home'); await page.keyboard.press('Shift+End');
await page.locator('select[aria-label="Text style"]').selectOption('h2');
check('W4', 'The style list turns the line into Heading 2 and the outline follows', (await ed.locator('h2').count()) === 2 && (await page.locator('.docoutline li').allInnerTexts()).some((t) => t.startsWith('Plain then')));
await page.keyboard.press('Control+z');
check('W5', 'Ctrl+Z undoes the style change in one step', (await ed.locator('h2').count()) === 1);
await page.keyboard.press('Control+y');
check('W6', 'Ctrl+Y redoes it', (await ed.locator('h2').count()) === 2);
// select the line, size + colour + highlight + font through the toolbar
await page.locator('select[aria-label="Text style"]').selectOption('p');
await page.keyboard.press('Home'); await page.keyboard.press('Shift+End');
await page.locator('select[aria-label="Font size"]').selectOption('18'); await page.locator('select[aria-label="Font"]').selectOption('serif');
await page.locator('button[aria-label="Text colour"]').click(); await page.locator('.dx-pop .dx-sw').nth(6).click();
await page.locator('button[aria-label="Highlight colour"]').click(); await page.locator('.dx-pop .dx-sw').nth(0).click();
const span = ed.locator('span[data-f=serif]').first();
check('W7', 'Font family, size, text colour and highlight apply to the selection (and are read back from the page, not stored as markup)',
  (await span.count()) === 1 && /18pt/.test(await span.evaluate((e) => e.style.fontSize)) && (await span.evaluate((e) => e.style.color)) !== '' && (await span.evaluate((e) => e.style.backgroundColor)) !== '');
await shot('02-formatted-1366');
// lists + checklist
await page.keyboard.press('End'); await page.keyboard.press('Enter'); await page.keyboard.type('First task');
await page.keyboard.press('Control+Shift+9'); await page.keyboard.press('Enter'); await page.keyboard.type('Second task'); await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); await page.keyboard.type('Nested');
check('W8', 'Checklist: Ctrl+Shift+9 makes a checklist, Enter adds an item, Tab nests it', (await ed.locator('li[data-k=cl]').count()) === 3 && (await ed.locator('li li[data-k=cl]').count()) === 2);
const bx = await ed.locator('li[data-k=cl]').first().boundingBox(); await page.mouse.click(bx.x - 14, bx.y + 10);
check('W9', 'Clicking the box checks the item', (await ed.locator('li[data-ck]').count()) >= 1);

// ---- link dialog, find and replace
await page.keyboard.press('Control+End');
await page.keyboard.press('Control+k'); await page.fill('#dx-link', 'https://example.com/docs'); await page.fill('#dx-link-text', 'Example'); await page.getByRole('button', { name: 'Add link' }).click();
check('W10', 'Ctrl+K inserts a link with text; only web addresses are accepted', (await ed.locator('a[href="https://example.com/docs"]').count()) === 1);
await page.keyboard.press('Enter'); await page.keyboard.press('Control+k'); await page.fill('#dx-link', 'javascript:alert(1)'); await page.getByRole('button', { name: 'Add link' }).click();
check('W11', 'A javascript: address is refused with a message', (await page.locator('#dx-link-e').innerText()).length > 5); await page.getByRole('button', { name: 'Cancel' }).click();
await page.keyboard.press('Control+h'); await page.fill('.dx-find input[aria-label=Find]', 'offer'); await page.fill('.dx-find input[aria-label="Replace with"]', 'proposal');
await page.waitForTimeout(200); await page.getByRole('button', { name: 'Replace all' }).click();
check('W12', 'Find and replace all changes the text and keeps its formatting (bold stays bold)', (await ed.locator('strong').first().innerText()) === 'the proposal');
await page.keyboard.press('Escape');

if (process.env.DBG) console.log(await ed.evaluate((e) => [...e.children].slice(3).map((c) => c.outerHTML.replace(/ style="[^"]*"/g, '').replace(/ class="dx-list"/g, '')).join('\n')));
// ---- save, reload, stored shape
await page.keyboard.press('Control+s'); await saved();
const st = await stored();
check('W13', 'Ctrl+S saves a new version in v2 format: tabs, headings, list levels, checklist, link, colours; nothing like markup is stored', st.v === 2 && st.doc.v === 2 && st.doc.tabs.length === 1 && JSON.stringify(st.doc).includes('"k":"cl"') && JSON.stringify(st.doc).includes('example.com/docs') && !JSON.stringify(st.doc).includes('<'));
await page.reload(); await wait('Quarterly plan');
check('W14', 'After a reload the formatted text is back', (await ed.locator('span[data-f=serif]').count()) >= 1 && (await ed.locator('li[data-k=cl]').count()) === 4, await ed.innerHTML().then((h) => h.slice(-900)));

// ---- table, right-click menu
await page.keyboard.press('Control+End'); await ed.click(); await page.keyboard.press('Control+End'); await page.keyboard.press('Enter');
await page.getByRole('button', { name: 'Table', exact: true }).click(); await page.getByRole('button', { name: 'Insert', exact: true }).click();
check('W15', 'Insert table makes a 3 × 3 table with a header row and the caret in it', (await ed.locator('table.dx-table').count()) === 1 && (await ed.locator('table th').count()) === 3 && (await ed.locator('table td').count()) === 6);
await page.keyboard.type('H1'); await page.keyboard.press('Tab'); await page.keyboard.type('H2'); await page.keyboard.press('Tab'); await page.keyboard.type('H3'); await page.keyboard.press('Tab'); await page.keyboard.type('cell');
await ed.locator('table td').first().click({ button: 'right' });
const ctxItems = await page.locator('.dx-pop [role^=menuitem]').allInnerTexts();
check('W16', 'Right-click shows cut, copy, paste, paste as plain text, select all, link, clear formatting and the table actions', ['Cut', 'Copy', 'Paste', 'Paste as plain text', 'Select all', 'Clear formatting', 'Insert row below', 'Delete column'].every((x) => ctxItems.some((t) => t.startsWith(x))));
await shot('03-context-menu-1366');
await page.getByRole('menuitem', { name: /Insert row below/ }).click();
check('W17', 'Insert row below from the right-click menu adds a row', (await ed.locator('table tr').count()) === 4);

// ---- tabs
await page.getByRole('button', { name: 'New tab' }).click(); await page.fill('#dx-tn', 'Budget'); await page.getByRole('button', { name: 'Save', exact: true }).last().click();
check('W18', 'New tab: named, opened empty, and listed in the sidebar', (await page.locator('.dx-tabbtn').allInnerTexts()).join() === 'Tab 1,Budget' && (await ed.innerText()).trim() === '');
await page.waitForTimeout(200); await page.keyboard.type('Budget notes for the quarter.');
await page.locator('.dx-tabrow', { hasText: 'Budget' }).locator('.dx-tabmore').click(); await page.getByRole('menuitem', { name: 'Add sub-tab' }).click(); await page.fill('#dx-tn', 'Ads spend'); await page.getByRole('button', { name: 'Save', exact: true }).last().click();
check('W19', 'Sub-tab: nested under Budget and opened', (await page.locator('.dx-tabsub .dx-tabbtn').allInnerTexts()).join() === 'Ads spend');
await page.waitForTimeout(200); await page.keyboard.type('Ads: 1200');
await page.locator('.dx-tabbtn', { hasText: 'Tab 1' }).click();
check('W20', 'Clicking a tab shows its own content; the other tab is unchanged', (await ed.locator('h1').innerText()) === 'Quarterly plan' && !(await ed.innerText()).includes('Budget notes'));
await page.locator('.dx-tabbtn', { hasText: 'Budget' }).click();
check('W21', 'The Budget tab kept its text', (await ed.innerText()).includes('Budget notes for the quarter.'));
await page.locator('.dx-tabrow', { hasText: 'Budget' }).locator('.dx-tabmore').click(); await page.getByRole('menuitem', { name: 'Duplicate' }).click();
check('W22', 'Duplicate copies a tab with its sub-tab', (await page.locator('.dx-tabbtn').allInnerTexts()).filter((t) => /Budget/.test(t)).length === 2 && (await page.locator('.dx-tabsub .dx-tabbtn').count()) === 2);
const dupRow = page.locator('.dx-tabrow', { hasText: 'Budget (copy)' });
await dupRow.locator('.dx-tabmore').click(); await page.getByRole('menuitem', { name: 'Delete…' }).click(); await page.getByRole('button', { name: 'Delete tab' }).click();
check('W23', 'Delete asks first and removes the tab with its sub-tab', (await page.locator('.dx-tabbtn').allInnerTexts()).join() === 'Tab 1,Budget,Ads spend');
await shot('04-tabs-1366');
// drag Budget above Tab 1
const from = page.locator('.dx-tabrow', { hasText: 'Budget' }).first(); const to = page.locator('.dx-tabrow', { hasText: 'Tab 1' }).first();
await from.dragTo(to, { targetPosition: { x: 40, y: 3 } });
check('W24', 'Drag and drop reorders tabs', (await page.locator('.dx-tabbtn').allInnerTexts()).join() === 'Budget,Ads spend,Tab 1');
await page.keyboard.press('Control+s'); await saved();
const st2 = await stored();
check('W25', 'Tabs are saved with the document: three tabs, the sub-tab under Budget, each with its own text', st2.doc.tabs.length === 2 && st2.doc.tabs[0].title === 'Budget' && st2.doc.tabs[0].children[0].title === 'Ads spend' && JSON.stringify(st2.doc.tabs[0].children[0]).includes('Ads: 1200') && JSON.stringify(st2.doc.tabs[1]).includes('Quarterly plan'));

// ---- find across tabs
await page.keyboard.press('Control+f'); await page.fill('.dx-find input[aria-label=Find]', 'Quarterly'); await page.selectOption('.dx-find select', 'all'); await page.waitForTimeout(300);
const info = await page.locator('.dx-find [role=status]').innerText();
check('W26', 'Find in all tabs reports matches in other tabs', /other tab/.test(info) || /1 of/.test(info), info);
await page.keyboard.press('Escape');

// ---- pictures (fake storage)
await page.locator('.dx-tabbtn', { hasText: 'Tab 1' }).click(); await ed.click(); await page.keyboard.press('Control+End');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFElEQVR42mP8z8Dwn4EIwDiqkL4KAHaiDvKLUe5CAAAAAElFTkSuQmCC', 'base64');
const chooser = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Picture', exact: true }).click(); await (await chooser).setFiles({ name: 'dot.png', mimeType: 'image/png', buffer: png });
await page.waitForSelector('figure.dx-img', { timeout: 15000 });
const fid = await ed.locator('figure.dx-img').first().getAttribute('data-f');
check('W27', 'Insert picture uploads it to Drive and stores only the file id in the document', /^[0-9a-f-]{36}$/.test(fid) && (await q('select count(*)::int n from files where id = $1 and kind = $2', [fid, 'file']))[0].n === 1);
await page.waitForFunction(() => document.querySelector('figure.dx-img img')?.getAttribute('src'), null, { timeout: 10000 });
check('W28', 'The picture loads through its signed address and shows', (await ed.locator('figure.dx-img img').evaluate((i) => i.complete && i.naturalWidth > 0)));
await ed.locator('figure.dx-img').first().click(); await page.getByRole('button', { name: 'Align picture right' }).click(); await page.getByRole('button', { name: 'Wrap text around, picture on the right' }).click();
check('W29', 'A selected picture can be aligned and set to wrap text', (await ed.locator('figure.dx-img[data-al=r][data-wr=r]').count()) === 1);
await shot('05-picture-1366');

// ---- insert menu: contents, footnote, page break; case change
await ed.click(); await page.keyboard.press('Control+Home'); await menu('Insert', 'Table of contents');
check('W30', 'Insert > Table of contents lists the headings with clickable entries', (await ed.locator('.dx-toc .dx-tocb').count()) >= 2);
await page.keyboard.press('Control+End'); await page.keyboard.type('Claim'); await menu('Insert', /Footnote/); await page.fill('#dx-fn', 'The source is the Q3 report.'); await page.getByRole('button', { name: 'Insert', exact: true }).click();
check('W31', 'Footnote: a numbered marker in the text and the note listed under the page', (await ed.locator('sup.dx-fn').count()) === 1 && (await page.locator('.dx-notes li').innerText()).includes('Q3 report'));
await page.keyboard.press('Shift+Home'); await page.getByRole('menuitem', { name: 'Format', exact: true }).click(); await page.getByRole('menuitem', { name: 'Change case' }).click(); await page.getByRole('menuitem', { name: 'UPPERCASE' }).click(); await page.keyboard.press('End');
check('W32', 'Format > Change case makes the selection uppercase', (await ed.innerText()).includes('CLAIM'));
await menu('Insert', 'Page break');
check('W33', 'Insert > Page break adds a break line', (await ed.locator('.dx-pb').count()) === 1);

if (process.env.DBG) console.log((await ed.evaluate((e) => [...e.children].slice(-6).map((c) => c.outerHTML.replace(/ style="[^"]*"/g, '').slice(0, 200)).join('\n'))));
// ---- page setup, word count, shortcuts
await menu('File', 'Page setup…'); await page.selectOption('#dx-po', 'l'); await page.selectOption('#dx-ps', 'letter'); await page.fill('#dx-ph', 'Quarterly plan header'); await page.fill('#dx-pf', 'Confidential'); await page.selectOption('#dx-pn', 'c'); await page.getByRole('button', { name: 'Apply' }).click();
const w = await page.locator('.dx-paper').evaluate((e) => e.getBoundingClientRect().width);
check('W34', 'Page setup: Letter landscape is wider than tall-portrait, the header and footer text show on the page', w > 1000 && (await page.locator('.dx-hdr').innerText()) === 'Quarterly plan header' && (await page.locator('.dx-ftr').innerText()).includes('Confidential'), String(w));
await shot('06-landscape-1366');
await menu('Tools', 'Word count…');
const wc = await page.locator('.dlg').innerText();
check('W35', 'Word count dialog shows words, characters and the space left of 1,000,000', /Words/.test(wc) && /Space left/.test(wc) && /1,000,000/.test(wc)); await page.getByRole('button', { name: 'Close' }).click();
check('W36', 'The status bar shows the space left', /Space left: \d[\d,]+ of 1,000,000/.test(await page.locator('.dx-space').innerText()));
await menu('Tools', 'Keyboard shortcuts…'); check('W37', 'Keyboard shortcuts dialog lists the shortcuts', (await page.locator('.dlg kbd').count()) >= 10); await page.getByRole('button', { name: 'Close' }).click();

// ---- downloads
const dl = async (item) => { const p = page.waitForEvent('download'); await page.getByRole('menuitem', { name: 'File', exact: true }).click(); await page.getByRole('menuitem', { name: item }).first().click(); const d = await p; const path = await d.path(); return { name: d.suggestedFilename(), data: readFileSync(path) }; };
const txt = await dl(/Plain text \(\.txt\) · all tabs/);
check('W38', 'Download as plain text (all tabs) has the tab titles, headings and the footnote', txt.name.endsWith('.txt') && /Budget/.test(txt.data.toString()) && /Quarterly plan/.test(txt.data.toString()) && /Q3 report/.test(txt.data.toString()), txt.data.toString().slice(-500));
const docx = await dl(/Word \(\.docx\) · all tabs/);
check('W39', 'Download as Word makes a real .docx (a zip with word/document.xml)', docx.name.endsWith('.docx') && docx.data.slice(0, 2).toString() === 'PK' && docx.data.includes('word/document.xml'));
const md = await dl(/Markdown \(\.md\) · this tab/); check('W40', 'Download as Markdown', md.name.endsWith('.md') && /# /.test(md.data.toString()));
await menu('File', 'Print preview…'); await page.waitForSelector('.dx-previewframe', { timeout: 10000 }); await page.waitForTimeout(800);
const pv = page.frameLocator('.dx-previewframe');
check('W41', 'Print preview draws the page content (heading, picture, footnote list) in a frame without the menus', (await pv.locator('h1').first().innerText()).length > 0 && (await pv.locator('.dx-notes li').count()) === 1 && (await pv.locator('.dx-hdr').count()) === 0, `${await pv.locator('h1').count()} h1, ${await pv.locator('.dx-notes li').count()} notes`);
await shot('07-preview-1366'); await page.getByRole('button', { name: 'Close' }).click();

// ---- open .docx (round trip of the file just made)
const fc = page.waitForEvent('filechooser'); await menu('File', 'Open Word file (.docx)…'); await (await fc).setFiles({ name: 'back.docx', mimeType: 'application/octet-stream', buffer: docx.data });
await page.waitForTimeout(600); const rep = page.getByRole('button', { name: 'Replace', exact: true }); if (await rep.count()) await rep.click();
await page.waitForTimeout(1500);
check('W42', 'Open Word file reads the .docx back: headings and text arrive as blocks', (await ed.locator('h1, h2, p').count()) >= 3 && /Quarterly|Budget/.test(await ed.innerText()));
await page.keyboard.press('Control+z'); await page.waitForTimeout(300);

// ---- modes, history, make a copy, named version
await menu('View', 'Focus mode'); check('W43', 'Focus mode hides the title bar, tabs and status bar; Esc leaves it', (await page.locator('.dx-tabs').isHidden()) && (await page.locator('.docbar').isHidden()));
await page.keyboard.press('Escape'); await page.waitForTimeout(200); check('W44', 'Esc leaves focus mode', await page.locator('.docbar').isVisible());
await menu('View', 'Reading mode'); check('W45', 'Reading mode makes the page read only and hides the toolbar', (await ed.getAttribute('contenteditable')) === 'false' && (await page.locator('.dx-chrome').isHidden())); await page.getByRole('button', { name: /Leave/ }).click();
await menu('File', 'Save named version…'); await page.fill('#dx-nv', 'Sent to client'); await page.getByRole('button', { name: 'Save version' }).click(); await saved();
const named = (await q('select note from file_versions where file_id = $1 order by version desc limit 1', [docId]))[0].note;
check('W46', 'Save named version stores the label with the version', named === '★ Sent to client', named);
await page.getByRole('button', { name: 'History' }).click(); await page.waitForSelector('.drawer');
check('W47', 'History lists the versions including the named one', (await page.locator('.drawer').innerText()).includes('Sent to client') && (await page.locator('.drawer li').count()) >= 3); await page.keyboard.press('Escape');
await menu('File', 'Make a copy'); await page.waitForFunction((n) => document.querySelector('.doctitle')?.value === n, 'Copy of Quarterly plan', { timeout: 10000 });
check('W48', 'Make a copy creates "Copy of …" with the same content and opens it', (await q("select count(*)::int n from files where name = 'Copy of Quarterly plan' and uploaded_by = $1", [uid]))[0].n >= 1);
await page.goto(`${base}/#/doc/${docId}`); await wait('Budget');

// ---- hostile stored documents and the limit
const evil = await mkDoc('Hostile', JSON.stringify({ v: 2, tabs: [{ id: 'x1', title: '<img src=x onerror=window.__pwn=1>', blocks: [{ t: 'p', c: [{ x: '<img src=x onerror="window.__pwn2=1">' }, { x: 'click', a: 'javascript:window.__pwn3=1', c: 'red;background:url(x)', z: 99999 }] }, { t: 'img', f: 'javascript:alert(1)' }] }] }));
await page.goto(`${base}/#/doc/${evil}`); await wait('onerror');
check('W49', 'A hostile stored document is shown as text: no element, no script, the javascript: link and style injection are dropped', await page.evaluate(() => !window.__pwn && !window.__pwn2 && !document.querySelector('.docpage img') && ![...document.querySelectorAll('.docpage a')].some((a) => a.href.startsWith('javascript:')) && !document.querySelector('.docpage [style*="url("]')));
const big = Array.from({ length: 3000 }, (_, i) => ({ t: 'p', c: [{ x: `Paragraph ${i} lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ${i}` }] }));
const bigDoc = await mkDoc('Long document', JSON.stringify({ v: 2, tabs: [{ id: 'b1', title: 'Big', blocks: big, children: [] }] }));
await page.goto(`${base}/#/doc/${bigDoc}`); await wait('Paragraph 2999');
await ed.click(); await page.keyboard.press('Control+End'); const t0 = Date.now(); await page.keyboard.type('typing stays quick', { delay: 0 }); const typing = Date.now() - t0;
check('W50', `A 60,000-word document opens and typing in it stays responsive (${typing} ms for 18 keys)`, typing < 4000, String(typing));
await page.keyboard.press('Control+s'); await saved();
const bigSaved = await stored(bigDoc);
check('W51', 'A document of about 400,000 characters saves (the old 200,000 limit is gone) and the status bar shows the space left', bigSaved.v === 2 && JSON.stringify(bigSaved.doc).length > 300000 && /Space left/.test(await page.locator('.dx-space').innerText()), String(JSON.stringify(bigSaved.doc).length));
await page.goto(`${base}/#/doc/${docId}`); await wait('Budget');

// ---- responsive + themes screenshots
for (const [w2, h2, n] of [[1366, 900, '1366'], [768, 1000, '768'], [390, 844, '390']]) {
  await page.setViewportSize({ width: w2, height: h2 }); await page.waitForTimeout(400); await page.locator('.dx-tabbtn', { hasText: 'Tab 1' }).click(); await page.waitForTimeout(300);
  await shot(`10-light-${n}`);
  if (w2 === 390) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    check('W52', 'At 390 px the page has no horizontal scroll and the toolbar has a "More" button', !overflow && (await page.locator('.dx-more').isVisible()), String(overflow));
    await page.locator('.dx-more').click(); await shot('11-phone-more-390'); await page.locator('.dx-more').click();
    await ed.click(); await page.keyboard.type(' phone typing'); check('W53', 'Typing works at phone width', (await ed.innerText()).includes('phone typing'));
  }
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; }); await page.waitForTimeout(250); await shot(`12-dark-${n}`);
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
}
await page.setViewportSize({ width: 1366, height: 900 });
// the menu opened with the keyboard
await page.keyboard.press('Escape'); await page.getByRole('menuitem', { name: 'Format', exact: true }).focus(); await page.keyboard.press('ArrowDown');
check('W54', 'Menus work from the keyboard: Down opens, arrows move, Esc closes and returns focus', (await page.locator('.dx-menu [role^=menuitem]').count()) > 5);
await shot('08-format-menu-1366'); await page.keyboard.press('Escape');
check('W55', 'No script errors or page-policy (CSP) violations in the browser', problems.length === 0 && (await page.evaluate(() => window.__csp.length)) === 0, problems.slice(0, 4).join(' | ') + (await page.evaluate(() => window.__csp.slice(0, 3).join(' | '))));

const pass = results.filter((r) => r.ok).length; console.log(`\n${pass}/${results.length} checks passed`);
await b.close(); await s.close?.(); await fake.close?.(); await admin.end(); process.exit(pass === results.length ? 0 : 1);
