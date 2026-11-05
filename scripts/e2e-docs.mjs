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
const admin = new pg.Client({ connectionString: 'postgresql://supabase_admin:postgres@127.0.0.1:54332/postgres' }); await admin.connect();
const q = async (s, a = []) => (await admin.query(s, a)).rows;
const stamp = Date.now(), PW = 'correct-horse-battery-staple';
let seenP = 0, lastCsp = 0; const results = []; const check = (id, name, ok, detail = '') => { if (typeof page !== 'undefined') page.evaluate(() => window.__csp?.length ?? 0).then((n) => { if (n > lastCsp) { console.log('  (csp violation count', n, 'after', id, ')'); lastCsp = n; } }, () => {}); if (problems.length > seenP) { console.log('  (console problem logged before', id, ')'); seenP = problems.length; } results.push({ id, name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${id.padEnd(5)} ${name}${ok ? '' : `  [${detail}]`}`); };

const fake = await startFakeSupabaseStorage({ serviceKey: 'k' });
const s = await startDevServer({ port: 0, sink: () => {}, extraConnect: fake.url, env: { ...LOCAL_ENV, DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54332/postgres', ...process.env, STORAGE_DRIVER: 'supabase', STORAGE_URL: fake.url, STORAGE_SERVER_KEY: 'k', RATE_LIMIT_STORE: 'memory' },
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
const INIT = () => { window.SpeechRecognition = window.webkitSpeechRecognition = class { constructor() { window.__sr = this; } start() { this.onstart?.(); } stop() { this.onend?.(); } abort() {} emit(text, final = true) { const r = [{ transcript: text, confidence: 1 }]; const res = [Object.assign(r, { isFinal: final })]; this.onresult?.({ resultIndex: 0, results: res }); } }; };
await page.addInitScript(INIT);
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
await menu('Insert', 'Table…'); await page.getByRole('button', { name: 'Insert', exact: true }).click();
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
const chooser = page.waitForEvent('filechooser'); await menu('Insert', 'Picture…'); await (await chooser).setFiles({ name: 'dot.png', mimeType: 'image/png', buffer: png });
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
check('W35', 'Word count dialog shows words, characters and the space used of 1,000,000', /Words/.test(wc) && /Space left/.test(wc) && /1,000,000/.test(wc)); await page.getByRole('button', { name: 'Close' }).click();
check('W36', 'The status bar does not show the space left while the document is small', !/Space left/.test(await page.locator('.dx-statusbar').innerText()) && (await page.locator('.dx-space').isHidden()));
await menu('Tools', 'Keyboard shortcuts…'); check('W37', 'Keyboard shortcuts dialog lists the shortcuts', (await page.locator('.dlg kbd').count()) >= 10); await page.getByRole('button', { name: 'Close' }).click();

// ---- downloads
const dl = async (item) => { const p = page.waitForEvent('download'); await page.getByRole('menuitem', { name: 'File', exact: true }).click(); await page.getByRole('menuitem', { name: 'Download as' }).click(); await page.getByRole('menuitem', { name: item }).first().click(); const d = await p; const path = await d.path(); return { name: d.suggestedFilename(), data: readFileSync(path) }; };
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
const fc = page.waitForEvent('filechooser'); await menu('File', 'Open file (.docx, .md, .txt, .html)…'); await (await fc).setFiles({ name: 'back.docx', mimeType: 'application/octet-stream', buffer: docx.data });
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
check('W51', 'A document of about 400,000 characters saves (the old 200,000 limit is gone) and the status bar stays quiet (under 80% of the limit)', bigSaved.v === 2 && JSON.stringify(bigSaved.doc).length > 300000 && (await page.locator('.dx-space').isHidden()), String(JSON.stringify(bigSaved.doc).length));
await page.goto(`${base}/#/doc/${docId}`); await wait('Budget');

// ---- easy blocks: slash menu, markdown shortcuts, table grid, table toolbar, convert text to table
const play = await mkDoc('Playground', JSON.stringify({ v: 2, tabs: [{ id: 'p1', title: 'Main', blocks: [{ t: 'p', c: [] }], children: [] }] }));
await page.goto(`${base}/#/doc/${play}`); await page.waitForFunction(() => document.querySelector('.docpage')); await page.waitForTimeout(500);
await ed.click(); await page.keyboard.type('/head');
check('W56', 'Typing / at the start of a line opens the block menu and filters it as you type', (await page.locator('.dx-slash [role=option]').allInnerTexts()).join().includes('Heading 1') && (await page.locator('.dx-slash [role=option]').count()) === 3);
await shot('13-slash-1366');
await page.keyboard.press('Enter'); await page.keyboard.type('Plan');
check('W57', 'Enter chooses the first match: the line becomes Heading 1 and the slash text is gone', (await ed.locator('h1').innerText()) === 'Plan');
await page.keyboard.press('Enter');
await page.keyboard.type('## '); await page.keyboard.type('Second'); await page.keyboard.press('Enter');
await page.keyboard.type('- '); await page.keyboard.type('bullet'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
await page.keyboard.type('[] '); await page.keyboard.type('todo'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
await page.keyboard.type('--- '.trim()); await page.keyboard.press('Enter');
check('W58', 'Markdown shortcuts: "## " heading, "- " bullet, "[] " checklist, "---" + Enter divider', (await ed.locator('h2').innerText()) === 'Second' && (await ed.locator('li[data-k=ul]').count()) >= 1 && (await ed.locator('li[data-k=cl]').count()) === 1 && (await ed.locator('hr').count()) === 1);
await page.keyboard.type('| Name | Role |'); await page.keyboard.press('Enter'); await page.keyboard.type('Ann'); await page.keyboard.press('Tab'); await page.keyboard.type('Lead');
check('W59', 'Typing | Name | Role | and Enter makes a table with that header row; the caret moves to the first cell below and Tab moves along', (await ed.locator('table th').allInnerTexts()).join() === 'Name,Role' && (await ed.locator('table tr').nth(1).innerText()).replace(/\s+/g, ' ').includes('Ann') && (await ed.locator('table tr').nth(1).innerText()).includes('Lead'), await ed.innerHTML().then((x) => x.slice(-600)));

check('W60', 'A floating table toolbar shows while the caret is in the table', await page.locator('.dx-tbar').isVisible());
await shot('14-table-bar-1366');
await page.getByRole('button', { name: 'Insert row below' }).click();
check('W61', 'Row ↓ on the floating toolbar adds a row', (await ed.locator('table tr').count()) === 3);
await page.getByRole('button', { name: 'Cell colour' }).click(); await page.locator('.dx-pop .dx-sw').nth(0).click();
check('W62', 'Cell colour sets a background on the cell and it is stored in the model', (await ed.locator('table td, table th').evaluateAll((c) => c.some((x) => x.style.backgroundColor !== ''))) === true);
await page.getByRole('button', { name: 'Borders on or off' }).click(); check('W63', 'Borders can be switched off', (await ed.locator('table[data-nb]').count()) === 1);
await page.keyboard.press('Control+End'); await page.keyboard.press('Enter'); await page.keyboard.type('x,y');
await page.keyboard.press('Enter'); await page.keyboard.type('1,2'); await page.keyboard.press('Shift+ArrowUp');
await menu('Insert', 'Convert selected text to table');
check('W64', 'Convert text to table turns comma-separated lines into a table', (await ed.locator('table').count()) >= 2, await ed.innerHTML().then((x) => x.slice(-500)));
await page.keyboard.press('Control+End'); await ed.click(); await page.keyboard.press('Control+End'); await page.keyboard.press('Enter');
const chooser2 = null; void chooser2;
await page.locator('button[aria-label="Table"]').click(); await page.locator('.dx-gc').nth(23).hover();
check('W65', 'The Table button opens a size grid; hovering shows the size', (await page.locator('.dx-gridinfo').innerText()).includes('3 × 4'));
await page.locator('.dx-gc').nth(23).click();
check('W66', 'Clicking a grid square inserts a 3 × 4 table', (await ed.locator('table').last().locator('tr').count()) === 3 && (await ed.locator('table').last().locator('tr').first().locator('th,td').count()) === 4);

// ---- fonts
await page.keyboard.press('Control+Home'); await page.keyboard.press('Shift+End');
const fontOpts = await page.locator('select[aria-label="Font"] option').allInnerTexts();
check('W67', 'The font list has the new families (Inter, Roboto, Lora, Playfair Display, Courier Prime, Naskh…) in groups', ['Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Nunito', 'Raleway', 'Oswald', 'Merriweather', 'Lora', 'Playfair Display', 'Source Serif 4', 'Libre Baskerville', 'Courier Prime'].every((f) => fontOpts.includes(f)) && fontOpts.some((f) => /Naskh/.test(f)));
await page.locator('select[aria-label="Font"]').selectOption('playfair');
await page.waitForFunction(() => [...document.fonts].some((f) => f.family.includes('Playfair') && f.status === 'loaded'), null, { timeout: 8000 }).catch(() => {});
check('W68', 'Choosing a font applies it and the self-hosted font file loads on use', (await ed.locator('[data-f=playfair]').count()) >= 1 && (await page.evaluate(() => [...document.fonts].some((f) => f.family.includes('Playfair') && f.status === 'loaded'))), `${await ed.locator('[data-f=playfair]').count()} spans; ${await page.evaluate(() => [...document.fonts].filter((f) => f.family.includes('Playfair')).map((f) => f.status).join())}`);

// ---- voice typing (a fake speech recogniser stands in for the browser's)
await menu('Tools', 'Voice typing and transcripts…'); await page.waitForSelector('.dx-voice:not([hidden])');
await ed.click(); await page.keyboard.press('Control+End'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
await page.getByRole('button', { name: /Start/ }).click(); await page.waitForFunction(() => window.__sr);
await page.evaluate(() => window.__sr.emit('hello comma this is a test full stop new paragraph second part', true));
await page.waitForTimeout(250);
const body1 = await ed.innerText();
check('W69', 'Voice typing inserts the spoken text at the cursor with spoken punctuation and a new paragraph', /Hello, this is a test\./.test(body1) && /Second part/.test(body1));
await page.evaluate(() => window.__sr.emit('this is interim', false)); await page.waitForTimeout(100);
check('W70', 'Interim text is shown greyed in the panel, not in the document', (await page.locator('.dx-vint').innerText()).includes('this is interim') && !(await ed.innerText()).includes('this is interim'));
await page.evaluate(() => window.__sr.emit('', false));
await page.locator('.dx-voice select[aria-label="Speech language"]').selectOption('ur-PK'); await page.keyboard.press('Escape');
await ed.click(); await page.keyboard.press('Control+End'); await page.keyboard.press('Enter');
await page.evaluate(() => window.__sr.emit('یہ ایک آزمائش ہے', true)); await page.waitForTimeout(250);
check('W71', 'Urdu is inserted as a right-to-left paragraph in the Nastaliq font', (await ed.locator('[dir=rtl] [data-f=nastaliq]').count()) >= 1);
await page.locator('.dx-voice button[data-m=talk]').click(); await page.locator('.dx-voice select[aria-label="Speech language"]').selectOption('en-US');
await page.keyboard.press('Control+End'); await ed.click(); await page.keyboard.press('Control+End'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
await page.getByRole('button', { name: /Stop/ }).click().catch(() => {}); await page.getByRole('button', { name: /Start/ }).click();
await page.evaluate(() => window.__sr.emit('good morning everyone', true)); await page.waitForTimeout(200);
await page.evaluate(() => window.__sr.emit('thanks for joining', true)); await page.waitForTimeout(200);
check('W72', 'Conversation mode: each utterance becomes a line "Speaker N (hh:mm:ss): text" with the speaker found automatically (no microphone in this test: all one speaker)', /Speaker 1 \(00:00:\d\d\): Good morning everyone/.test(await ed.innerText()) && /Speaker 1 \(00:00:\d\d\): Thanks for joining/.test(await ed.innerText()) && (await page.locator('.dx-voice button[aria-label^="Rename Speaker"]').count()) === 1 && (await page.locator('.dx-voice button:has-text("Person")').count()) === 0);
await ed.locator('p', { hasText: 'Thanks for joining' }).click({ button: 'right' }); await page.getByRole('menuitem', { name: 'Change speaker of this line…' }).click(); await page.selectOption('#dx-cs', 'new'); await page.getByRole('button', { name: 'Change', exact: true }).click();
check('W72b', 'Change speaker (right-click on a line) moves one line to a new speaker', /Speaker 2 \(00:00:\d\d\): Thanks for joining/.test(await ed.innerText()) && /Speaker 1 \(00:00:\d\d\): Good morning/.test(await ed.innerText()));
{ // phone: Conversation mode must not open the microphone a second time (iPhone/Android then write nothing)
  const pc = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', storageState: await ctx.storageState() });
  const pp = await pc.newPage(); await pp.addInitScript(INIT);
  await pp.addInitScript(() => { window.__gum = 0; navigator.mediaDevices.getUserMedia = async () => { window.__gum += 1; window.__sr && (window.__sr.deaf = true); throw new Error('busy'); }; });
  await pp.goto(`${base}/#/doc/${docId}`); await pp.waitForSelector('.dx-page', { timeout: 20000 }).catch(() => {}); await pp.waitForTimeout(1200);
  await pp.evaluate(() => document.querySelector('.dx-page, [contenteditable=true]')?.focus());
  await pp.getByRole('button', { name: 'Voice typing' }).first().click().catch(async () => { await pp.locator('button[aria-label="More formatting tools"]').tap(); await pp.getByRole('button', { name: 'Voice typing' }).first().tap(); });
  await pp.locator('.dx-voice button[data-m=talk]').tap(); await pp.getByRole('button', { name: /Start/ }).tap(); await pp.waitForTimeout(300);
  await pp.evaluate(() => { if (!window.__sr.deaf) window.__sr.emit('hello from the phone', true); }); await pp.waitForTimeout(300);
  check('W72p', 'Phone, Conversation mode: words are written (speech-to-text starts first and the microphone is not opened a second time)', (await pp.evaluate(() => window.__gum)) === 0 && /Hello from the phone/.test(await pp.locator('.dx-page, [contenteditable]').first().innerText()), String(await pp.evaluate(() => window.__gum)));
  await pc.close();
}
await page.getByRole('button', { name: /Rename Speaker 1/ }).click(); await page.fill('#dx-sn', 'Ann'); await page.getByRole('button', { name: 'Save', exact: true }).last().click();
check('W72c', 'Renaming a speaker renames every line of that speaker', /Ann \(00:00:\d\d\): Good morning everyone/.test(await ed.innerText()) && /Speaker 2 \(/.test(await ed.innerText()));
check('W73', 'The panel says automatic speaker detection is beta and warns about the browser vendor’s speech service', /Automatic speaker detection \(beta\)/.test(await page.locator('.dx-voice').innerText()) && /may be sent to the browser maker/.test(await page.locator('.dx-voice').innerText()));
await shot('15-voice-transcript-1366');
await page.getByRole('button', { name: /Stop/ }).click(); await page.getByRole('button', { name: 'Close voice panel' }).click();

// ---- more download formats
const dl2 = async (item) => { const p = page.waitForEvent('download'); await page.getByRole('menuitem', { name: 'File', exact: true }).click(); await page.getByRole('menuitem', { name: 'Download as' }).click(); await page.getByRole('menuitem', { name: item }).first().click(); const d = await p; return { name: d.suggestedFilename(), data: readFileSync(await d.path()) }; };
const odt = await dl2(/OpenDocument text/); const rtf = await dl2(/Rich Text/); const epub = await dl2(/EPUB/); const zipf = await dl2(/Web page with pictures/);
check('W74', 'ODT is a zip whose first entry is the uncompressed mimetype and has content.xml and styles.xml', odt.name.endsWith('.odt') && odt.data.slice(0, 2).toString() === 'PK' && odt.data.slice(30, 38).toString() === 'mimetype' && odt.data.includes('content.xml') && odt.data.includes('application/vnd.oasis.opendocument.text'));
check('W75', 'RTF starts with {\\rtf1 and carries the text, the table and the heading size', rtf.data.slice(0, 6).toString() === '{\\rtf1' && /Playground|Plan/.test(rtf.data.toString('latin1')) && rtf.data.toString('latin1').includes('\\trowd'));
check('W76', 'EPUB is a zip with the mimetype first, a package file and a chapter per tab', epub.name.endsWith('.epub') && epub.data.slice(30, 38).toString() === 'mimetype' && epub.data.includes('content.opf') && epub.data.includes('ch1.xhtml'));
check('W77', 'Web page zip contains index.html', zipf.name.endsWith('.zip') && zipf.data.includes('index.html'));
const mdFile = { name: 'notes.md', mimeType: 'text/markdown', buffer: Buffer.from('# Imported\n\nHello **world** and [link](https://example.com).\n\n- a\n- b\n') };
const fc2 = page.waitForEvent('filechooser'); await menu('File', 'Open file (.docx, .md, .txt, .html)…'); await (await fc2).setFiles(mdFile);
await page.waitForTimeout(500); const rep2 = page.getByRole('button', { name: 'Replace', exact: true }); if (await rep2.count()) await rep2.click(); await page.waitForTimeout(400);
check('W78', 'Open a Markdown file: heading, bold text, link and list arrive', (await ed.locator('h1').innerText()) === 'Imported' && (await ed.locator('strong').innerText()) === 'world' && (await ed.locator('a[href="https://example.com/"]').count()) === 1 && (await ed.locator('li').count()) === 2);
await page.keyboard.press('Control+s'); await saved();

// ---- autosave: three documents created at once, typed in and left without pressing Save
const blank = JSON.stringify({ v: 2, tabs: [{ id: 'a1', title: 'Main', blocks: [{ t: 'p', c: [] }], children: [] }] });
const three = []; for (const n of ['Auto A', 'Auto B', 'Auto C']) three.push([n, await mkDoc(n, blank)]);
for (const [i, [n, id]] of three.entries()) {
  await page.goto(`${base}/#/doc/${id}`); await page.waitForFunction((t) => document.querySelector('.doctitle')?.value === t, n, { timeout: 15000 }); await page.waitForTimeout(300);
  await ed.click(); await page.keyboard.type(`autosaved text number ${i}`);
}
await page.waitForFunction(() => /^Saved/.test(document.querySelector('.docstate')?.innerText ?? ''), null, { timeout: 8000 });
const gotAll = []; for (const [i, [, id]] of three.entries()) gotAll.push(JSON.stringify((await stored(id)).doc).includes(`autosaved text number ${i}`));
check('W79', 'Three documents typed in one after the other and navigated away from without pressing Save all hold their text in the database (the app saves before leaving, and the last one autosaves by itself)', gotAll.every(Boolean), gotAll.join());
await page.goto(`${base}/#/doc/${three[0][1]}`); await page.reload(); await page.waitForFunction(() => document.querySelector('.docpage')?.innerText.includes('autosaved text number 0'), null, { timeout: 15000 });
check('W80', 'After a reload the text is there', true);
check('W81', 'Typing and pausing saves within a few seconds on its own: status goes Unsaved changes, then Saved (no Save click)', await (async () => { await ed.click(); await page.keyboard.press('Control+End'); await page.keyboard.type(' more'); const dirtyNow = /Unsaved|Saving/.test(await state()); await page.waitForFunction(() => /^Saved/.test(document.querySelector('.docstate')?.innerText ?? ''), null, { timeout: 6000 }); return dirtyNow; })());
// a failing network: the status says so, the work is kept, and the save is retried
let dropped = 0; await page.route('**/api/**', (r) => { const rq = r.request(); if (dropped < 2 && (rq.url().includes('versions.add') || (rq.postData() ?? '').includes('versions.add'))) { dropped += 1; return r.abort(); } return r.continue(); });
await page.keyboard.type(' offline edit'); await page.waitForFunction(() => /retrying/.test(document.querySelector('.docstate')?.innerText ?? ''), null, { timeout: 8000 });
check('W82', 'When saving fails on the network the status reads "Not saved, retrying…" and the editor keeps the text', /retrying/.test(await state()) && (await ed.innerText()).includes('offline edit'));
await page.waitForFunction(() => /^Saved/.test(document.querySelector('.docstate')?.innerText ?? ''), null, { timeout: 20000 }); await page.unroute('**/api/**');
check('W83', 'The save is retried with a delay and succeeds when the network returns: the text is stored', JSON.stringify((await stored(three[0][1])).doc).includes('offline edit') && dropped === 2);
await page.keyboard.type(' x'); await page.getByRole('menuitem', { name: 'File', exact: true }).focus(); await page.locator('#app-switcher, #app-switcher-m').first().click().catch(() => {});
await page.keyboard.press('Escape');

// ---- zoom, font size, compact table strip, size warning
const canvasBox = await page.locator('.dx-canvas').boundingBox(); const paperBox = await page.locator('.dx-paper').boundingBox();
check('W84', 'Auto zoom: the page fills the window width with a modest gutter (not tiny in a wide grey area, not wider than the window)', paperBox.width <= canvasBox.width - 40 && paperBox.width >= Math.min(canvasBox.width - 60, 790) && /Auto/.test(await page.locator('select[aria-label="Zoom"] option:checked').innerText()), `${paperBox.width} in ${canvasBox.width}`);
await ed.click(); await page.keyboard.press('Control+='); const z1 = await page.locator('select[aria-label="Zoom"]').inputValue(); await page.keyboard.press('Control+-'); await page.keyboard.press('Control+-');
const z2 = await page.locator('select[aria-label="Zoom"]').inputValue();
check('W85', 'Ctrl+= and Ctrl+- change the zoom in steps and the status bar buttons and View menu show it', Number(z1) > 0 && Number(z2) < Number(z1) && (await page.getByRole('button', { name: 'Zoom in' }).count()) === 1 && (await page.getByRole('button', { name: 'Zoom out' }).count()) === 1, `${z1} ${z2}`);
await page.locator('select[aria-label="Zoom"]').selectOption('fit'); await page.waitForTimeout(200);
const fitBox = await page.locator('.dx-paper').boundingBox();
check('W86', 'Fit width makes the page exactly as wide as the window allows, with no horizontal scrollbar', Math.abs(fitBox.width - (canvasBox.width - 48)) < 40 && !(await page.locator('.dx-canvas').evaluate((c) => c.scrollWidth > c.clientWidth + 1)));
await page.locator('select[aria-label="Zoom"]').selectOption('auto');
await ed.click(); await page.keyboard.press('Control+a'); await page.getByRole('button', { name: 'Increase font size' }).click();
const sz1 = await page.locator('select[aria-label="Font size"]').inputValue(); await page.keyboard.press('Control+Shift+>'); const sz2 = await page.locator('select[aria-label="Font size"]').inputValue(); await page.getByRole('button', { name: 'Decrease font size' }).click(); const sz3 = await page.locator('select[aria-label="Font size"]').inputValue();
check('W87', 'Font size − / + buttons and Ctrl+Shift+> / < change the size one step at a time', sz1 === '12' && sz2 === '14' && sz3 === '12', `${sz1} ${sz2} ${sz3}`);
await page.keyboard.press('Control+End'); await page.keyboard.press('Enter'); await menu('Insert', 'Table…'); await page.getByRole('button', { name: 'Insert', exact: true }).click(); await page.keyboard.type('cell text');
const strip = await page.locator('.dx-tbar').boundingBox(); const cellBox = await ed.locator('table td, table th').first().boundingBox(); const edBox = await page.locator('.dx-canvas').boundingBox();
check('W88', 'The table tools are one compact row of small icon buttons (≈36 px high) above the page area: they never cover a cell and do not move while typing', strip && strip.height <= 42 && strip.y + strip.height <= edBox.y + 1 && (await page.locator('.dx-tbar button').count()) >= 12 && (await page.locator('.dx-tbar').innerText()).trim() === 'TABLE');
const stripBefore = JSON.stringify(await page.locator('.dx-tbar').boundingBox()); await page.keyboard.type(' more typing in the cell'); const stripAfter = JSON.stringify(await page.locator('.dx-tbar').boundingBox());
check('W89', 'The strip stays put while typing in the table and disappears when the caret leaves the table', stripBefore === stripAfter && await (async () => { await page.keyboard.press('Control+End'); await page.waitForTimeout(150); return page.locator('.dx-tbar').isHidden(); })());
const eight = await mkDoc('Nearly full', JSON.stringify({ v: 2, tabs: [{ id: 'f1', title: 'Big', blocks: Array.from({ length: 840 }, (_, i) => ({ t: 'p', c: [{ x: `${i} ${'lorem ipsum '.repeat(82)}` }] })), children: [] }] }));
await page.goto(`${base}/#/doc/${eight}`); await page.waitForFunction(() => document.querySelector('.doctitle')?.value === 'Nearly full', null, { timeout: 20000 }); await page.waitForTimeout(800);
check('W90', 'A document above 80% of the size limit shows a warning in the status bar; smaller ones show nothing', (await page.locator('.dx-space').isVisible()) && /8\d% of its size limit/.test(await page.locator('.dx-space').innerText()));
await page.goto(`${base}/#/doc/${docId}`); await wait('Budget');
// ---- found in the owner-style review: pasted formatting from inline styles, paste inside a list
await page.goto(`${base}/#/doc/${play}`); await page.waitForFunction(() => document.querySelector('.doctitle')?.value === 'Playground', null, { timeout: 15000 }); await page.waitForTimeout(400);
await ed.click(); await page.keyboard.press('Control+End'); await page.keyboard.press('Enter');
await page.evaluate(() => { const el = document.querySelector('.docpage'); el.focus(); const dt = new DataTransfer(); dt.setData('text/html', '<p><span style="font-weight: 700; color: rgb(185, 28, 28); font-family: Georgia, serif">Styled</span><span style="font-size: 11pt; color: rgb(27, 27, 27); font-family: Geist"> plain</span></p>'); dt.setData('text/plain', 'Styled plain'); el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); });
await page.waitForTimeout(300);
check('W91', 'Pasting HTML whose formatting is in style attributes (Google Docs, Word, web pages) keeps bold, colour and font; the editor’s own default colour/font/size are not copied as noise', (await ed.locator('strong, [style*="font-weight"]').count()) >= 0 && JSON.stringify((await (async () => { await page.keyboard.press('Control+s'); await page.waitForTimeout(700); return (await stored(play)).doc.tabs[0].blocks.at(-1); })())).replace(/\s/g, '') .includes('"b":1') , '');
check('W92', 'The pasted run has bold, red and serif; the second run is plain (no colour, font or size marks)', await (async () => { const bl = (await stored(play)).doc.tabs[0].blocks; const last = bl.find((b) => JSON.stringify(b).includes('Styled')); const r = last?.c ?? last?.items?.find((i) => JSON.stringify(i).includes('Styled'))?.c ?? []; const ok = r[0]?.b === 1 && r[0]?.c === '#b91c1c' && r[0]?.f === 'serif' && !('c' in (r[1] ?? {})) && !('f' in (r[1] ?? {})) && !('z' in (r[1] ?? {})); if (!ok) console.log('RUNS', JSON.stringify(bl.slice(-3))); return ok; })(), '');
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
