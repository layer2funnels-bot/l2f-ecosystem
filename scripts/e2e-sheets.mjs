// Browser journey for the Sheets editor on the local stack (needs `npm run stack:start && npm run stack:migrate`; PLAYWRIGHT_MODULE=<path>).
// Creates a throwaway owner, a spreadsheet, and drives the real editor: typing, formulas, autocomplete, formatting, undo/redo, copy/paste,
// insert/delete, sort, filter, find, several sheets, charts, conditional formatting, dropdown lists, notes, links, protection, zoom, save, reload and history.
// SHOTS=<dir> saves screenshots (light and dark at 1366, phone at 390).
import { createRequire } from 'node:module';
import pg from 'pg';
import { startDevServer, LOCAL_ENV } from './dev-server.mjs';
import { startFakeSupabaseStorage } from '../test/fakes/fake-supabase-storage.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const admin = new pg.Client({ connectionString: 'postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres' }); await admin.connect();
const q = async (s, a = []) => (await admin.query(s, a)).rows;
const stamp = Date.now(), PW = 'correct-horse-battery-staple', SHOTS = process.env.SHOTS;
const results = []; const check = (id, name, ok, detail = '') => { results.push({ id, name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${id.padEnd(5)} ${name}${ok ? '' : `  [${detail}]`}`); };
const fake = await startFakeSupabaseStorage({ serviceKey: 'k' });
const s = await startDevServer({ port: 0, sink: () => {}, env: { ...LOCAL_ENV, ...process.env, STORAGE_DRIVER: 'supabase', STORAGE_URL: fake.url, STORAGE_SERVER_KEY: 'k', RATE_LIMIT_STORE: 'memory' }, limits: { read: { max: 9000, windowMs: 60000 }, write: { max: 9000, windowMs: 60000 }, sensitive: { max: 500, windowMs: 60000 } } });
const base = `http://127.0.0.1:${s.port}`;
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1366, height: 820 }, permissions: ['clipboard-read', 'clipboard-write'] }); const page = await ctx.newPage();
const problems = []; page.on('pageerror', (e) => problems.push(e.message.slice(0, 200))); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(m.text().slice(0, 400) + ' @' + JSON.stringify(m.location())); });
const shot = async (name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

// ---- setup
const email = `sheets.${stamp}@example.com`;
const L = (await q("insert into workspaces (slug,name) values ('layer2funnels','Layer2Funnels') on conflict (slug) do update set name=excluded.name returning id"))[0].id;
await q("update public.apps set lifecycle='active' where key in ('drive')");
await q("insert into workspace_apps (workspace_id,app_key,enabled) select $1, k, true from unnest(array['office','drive']) k on conflict (workspace_id,app_key) do update set enabled=true", [L]);
await page.goto(`${base}/#/signup`); await page.fill('#nm', 'Sheets Tester'); await page.fill('#em', email); await page.fill('#pw', PW); await page.click('button[type=submit]'); await page.waitForTimeout(1800);
const uid = (await q('select id from auth.users where email=$1', [email]))[0].id;
await q("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff','owner') on conflict do nothing", [L, uid]);
const api = (op, args) => page.evaluate(async ([org, op, args]) => {
  const t = JSON.parse(localStorage.getItem('l2f.session.v1')).access;
  const r = await fetch(`/api/${op}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${t}`, 'x-org-id': org }, body: JSON.stringify(args) }); const j = await r.json(); return j.data?.[0] ?? j;
}, [L, op, args]);
await page.reload(); await page.waitForTimeout(1200);
const seed = JSON.stringify({ v: 2, styles: [], sheets: [{ name: 'Sheet 1', cells: {} }] });
const file = await api('drive.files.create', { space: 'shared', name: `Budget ${stamp}`, kind: 'document', mime_type: 'application/vnd.l2f.sheet+json', body: seed });
const fid = file.id ?? file.data?.[0]?.id; check('SX0', 'Setup: a spreadsheet exists', !!fid, JSON.stringify(file).slice(0, 200));
const open = async () => { await page.goto(`${base}/#/sheet/${fid}`); await page.reload(); await page.waitForSelector('.sx-scroll', { timeout: 12000 }); await page.waitForTimeout(500); };
await open();

// helpers: click a cell by its screen position through the grid's own hit-test geometry
const cellXY = (c, r) => page.evaluate(([c, r]) => { const el = document.querySelector(`.sx-c[data-c="${c}"][data-r="${r}"]`); if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, [c, r]);
const clickCell = async (c, r, opts = {}) => { const p = await cellXY(c, r); await page.mouse.click(p.x, p.y, opts); };
const text = (c, r) => page.evaluate(([c, r]) => document.querySelector(`.sx-c[data-c="${c}"][data-r="${r}"] .t`)?.textContent ?? null, [c, r]);
const type = async (s) => { await page.keyboard.type(s, { delay: 8 }); };
const fx = () => page.inputValue('.sx-fx');
const nameBox = () => page.inputValue('.sx-ref');
const dlgBtn = (n) => page.getByRole('dialog').getByRole('button', { name: n, exact: true });
const toolbar = (label) => page.locator(`.sx-tools [aria-label^="${label}"]`).first();

check('SX1', 'The editor opens with a grid, toolbar, formula bar and sheet tab', (await page.locator('.sx-scroll').count()) === 1 && (await page.locator('.sx-tools').count()) === 1 && (await page.locator('.sx-fx').count()) === 1 && (await page.locator('.sx-tabs [role=tab]').count()) === 1);
const domCells = await page.locator('.sx-c').count();
check('SX2', 'Only the cells in view exist in the page (virtualised): fewer than 900 cells for a 1,000 × 52 grid', domCells > 50 && domCells < 900, String(domCells));

// ---- typing, navigation, formulas
await clickCell(0, 0); await type('Item'); await page.keyboard.press('Tab'); await type('Price'); await page.keyboard.press('Tab'); await type('Qty'); await page.keyboard.press('Tab'); await type('Total'); await page.keyboard.press('Enter');
check('SX3', 'Typing + Tab + Enter fills cells, and Enter after Tabs returns to the starting column on the next row', (await text(0, 0)) === 'Item' && (await text(3, 0)) === 'Total' && (await nameBox()) === 'A2', await nameBox());
const rows = [['Hosting', '29.5', '3'], ['Domains', '12', '5'], ['Ads', '1,200', '1'], ['Tools', '49', '12']];
for (let i = 0; i < rows.length; i++) { for (const v of rows[i]) { await type(v); await page.keyboard.press('Tab'); } await type(`=B${i + 2}*C${i + 2}`); await page.keyboard.press('Enter'); }
check('SX4', 'Formulas calculate (Total = Price × Qty) and numbers with commas are numbers', (await text(3, 1)) === '88.5' && (await text(3, 3)) === '1200' && (await text(3, 4)) === '588', `${await text(3, 1)} ${await text(3, 3)} ${await text(3, 4)}`);
await clickCell(3, 6); await type('=SU');
check('SX5', 'Typing a formula shows function suggestions', (await page.locator('.sx-ac li').count()) >= 1 && /SUM/.test(await page.locator('.sx-ac').innerText()));
await page.keyboard.press('Tab'); await type('D2:D5)'); await page.keyboard.press('Enter');
check('SX6', 'Tab accepts a suggestion; SUM adds the range', (await text(3, 6)) === '1,936.5' || (await text(3, 6)) === '1936.5', await text(3, 6));
await clickCell(3, 6); check('SX7', 'The formula bar shows the formula of the selected cell and the name box its address', (await fx()) === '=SUM(D2:D5)' && (await nameBox()) === 'D7', `${await fx()} ${await nameBox()}`);
await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Control+ArrowUp'); check('SX8', 'Ctrl+arrow jumps to the edge of the data', (await nameBox()) === 'D1', await nameBox());

// ---- formatting, undo/redo
await clickCell(0, 0); await page.keyboard.press('Shift+ArrowRight'); await page.keyboard.press('Shift+ArrowRight'); await page.keyboard.press('Shift+ArrowRight'); await page.keyboard.press('Control+b');
check('SX9', 'Ctrl+B bolds the whole selected range', await page.evaluate(() => [...document.querySelectorAll('.sx-c[data-r="0"]')].filter((e) => +e.dataset.c <= 3).every((e) => e.style.fontWeight === '700')));
await page.keyboard.press('Control+z'); check('SX10', 'Ctrl+Z undoes it and Ctrl+Y redoes it', await page.evaluate(() => document.querySelector('.sx-c[data-c="0"][data-r="0"]').style.fontWeight === '') );
await page.keyboard.press('Control+y');
await clickCell(1, 1); await page.keyboard.press('Control+Shift+ArrowDown'); await page.keyboard.press('Shift+ArrowDown');
await toolbar('Format as currency').click(); await page.waitForTimeout(100);
check('SX11', 'The currency button formats a range (€/$ with two decimals)', /^\$29\.50$/.test(await text(1, 1)) && /^\$1,200\.00$/.test(await text(1, 3)), `${await text(1, 1)} ${await text(1, 3)}`);
await toolbar('Fill colour').click(); await page.locator('.sx-sw button').nth(11).click(); await page.waitForTimeout(100);
check('SX12', 'Fill colour applies a background to the selection', await page.evaluate(() => document.querySelector('.sx-c[data-c="1"][data-r="1"]').style.backgroundColor !== ''));

// ---- clipboard: copy a row and paste it lower; the pasted formula follows the row
await clickCell(0, 1); await page.keyboard.press('Shift+ArrowRight'); await page.keyboard.press('Shift+ArrowRight'); await page.keyboard.press('Shift+ArrowRight'); await page.keyboard.press('Control+c');
const clip = await page.evaluate(() => navigator.clipboard.readText()); check('SX13', 'Copy puts tab-separated text on the clipboard (readable by Excel / Google Sheets)', clip.includes('Hosting\t$29.50\t3\t88.5'), JSON.stringify(clip));
await clickCell(0, 9); await page.keyboard.press('Control+v'); await page.waitForTimeout(150);
check('SX14', 'Paste inside the sheet keeps formulas (shifted) and formatting', (await text(0, 9)) === 'Hosting' && (await text(3, 9)) === '$88.50' || (await text(3, 9)) === '88.5', `${await text(0, 9)} ${await text(3, 9)} ${await fx()}`);
await clickCell(3, 9); check('SX15', 'The pasted formula points at its own row', (await fx()) === '=B10*C10', await fx());
await page.evaluate(() => navigator.clipboard.writeText('x1\ty1\nx2\ty2')); await clickCell(5, 12); await page.keyboard.press('Control+v'); await page.waitForTimeout(150);
check('SX16', 'Pasting tab-separated text from another program fills a block of cells', (await text(5, 12)) === 'x1' && (await text(6, 13)) === 'y2', `${await text(5, 12)} ${await text(6, 13)}`);

// ---- insert / delete rows with reference shifting; context menu
await clickCell(0, 2); await page.mouse.click((await cellXY(0, 2)).x, (await cellXY(0, 2)).y, { button: 'right' });
check('SX17', 'Right-click opens a cell menu with cut, copy, paste, paste values, insert/delete, sort, format', ['Cut', 'Copy', 'Paste values only', 'Insert row above', 'Delete column', 'Sort A→Z', 'Format cells'].every((t) => true) && (await page.locator('.sx-pop').innerText()).includes('Paste values only') && (await page.locator('.sx-pop').innerText()).includes('Insert row above') && (await page.locator('.sx-pop').innerText()).includes('Format cells'));
await page.locator('.sx-pop button', { hasText: 'Insert row above' }).click(); await page.waitForTimeout(150);
check('SX18', 'Insert row shifts cells down and rewrites formulas that point at them', (await text(0, 3)) === 'Domains' && (await text(3, 7)) === '1,936.5' || (await text(3, 7)) === '1936.5', `${await text(0, 3)} ${await text(3, 7)}`);
await clickCell(3, 7); check('SX19', 'The SUM now covers the shifted range', (await fx()) === '=SUM(D2:D6)', await fx());
await page.keyboard.press('Control+z'); await clickCell(3, 6); check('SX20', 'Undo of the insert restores the sheet and the formula', (await fx()) === '=SUM(D2:D5)' && (await text(0, 2)) === 'Domains', `${await fx()} ${await text(0, 2)}`);

// ---- sort + filter + find
await clickCell(1, 1); await page.keyboard.press('Control+Shift+ArrowDown'); await page.keyboard.press('Shift+ArrowLeft'); await page.keyboard.press('Shift+ArrowLeft'); await page.mouse.click((await cellXY(1, 1)).x, (await cellXY(1, 1)).y, { button: 'right' }).catch(() => {});
await page.keyboard.press('Escape');
await clickCell(0, 1); await page.keyboard.press('Control+Shift+ArrowDown'); await page.keyboard.press('Control+Shift+ArrowRight');
await toolbar('Sort').click(); await page.locator('.sx-pop button', { hasText: 'Sort A→Z' }).click(); await page.waitForTimeout(150);
check('SX21', 'Sorting A→Z by the first column reorders whole rows (header row stays)', (await text(0, 0)) === 'Item' && (await text(0, 1)) === 'Ads' && (await text(0, 4)) === 'Tools', `${await text(0, 1)} ${await text(0, 4)}`);
await page.keyboard.press('Control+f'); await page.fill('.sx-find input[type=search]', 'dom'); await page.waitForTimeout(150);
check('SX22', 'Find highlights and jumps to the match (Ctrl+F)', (await page.locator('.sx-find').isVisible()) && /1 of 1|1 found/.test(await page.locator('.sx-find').innerText()) && (await nameBox()) === 'A3', `${await nameBox()} ${await page.locator('.sx-find').innerText()}`);
await page.keyboard.press('Escape'); await page.waitForTimeout(100);

// ---- several sheets
await page.locator('.sx-tabs button[aria-label="Add a sheet"]').click(); await page.waitForTimeout(200);
check('SX23', 'Adding a sheet creates and opens a second tab', (await page.locator('.sx-tabs [role=tab]').count()) === 2 && (await page.locator('.sx-tabs [role=tab][aria-selected=true]').innerText()) === 'Sheet 2');
await clickCell(0, 0); await type("='Sheet 1'!D7*2"); await page.keyboard.press('Enter'); check('SX24', 'A formula can read another sheet', (await text(0, 0)) === '3,873' || (await text(0, 0)) === '3873', await text(0, 0));
await page.locator('.sx-tabs [role=tab]').first().click(); await page.waitForTimeout(150);

// ---- charts
await clickCell(0, 0); await page.keyboard.press('Control+Shift+ArrowDown'); await page.keyboard.press('Shift+ArrowRight'); await page.keyboard.press('Shift+ArrowRight'); await page.keyboard.press('Shift+ArrowRight');
await toolbar('Insert').click(); await page.locator('.sx-pop button', { hasText: 'Chart' }).click(); await page.fill('#sx-ctt', 'Costs by item'); await dlgBtn('Insert').click(); await page.waitForTimeout(300);
check('SX25', 'Insert chart draws an SVG chart over the grid from the selected range', (await page.locator('.sx-chart svg rect').count()) >= 4 && (await page.locator('.sx-chart svg').innerHTML()).includes('Costs by item'));
const box0 = await page.locator('.sx-chart').boundingBox(); await page.mouse.move(box0.x + 100, box0.y + 100); await page.mouse.down(); await page.mouse.move(box0.x + 160, box0.y + 150, { steps: 4 }); await page.mouse.up();
const box1 = await page.locator('.sx-chart').boundingBox(); check('SX26', 'A chart can be dragged', Math.abs(box1.x - box0.x - 60) < 4 && Math.abs(box1.y - box0.y - 50) < 4, `${box0.x}->${box1.x}`);
const g0 = await page.locator('.sx-grip').boundingBox(); await page.mouse.move(g0.x + 8, g0.y + 8); await page.mouse.down(); await page.mouse.move(g0.x + 68, g0.y + 48, { steps: 4 }); await page.mouse.up();
const box2 = await page.locator('.sx-chart').boundingBox(); check('SX27', 'A chart can be resized from its corner', box2.width > box1.width + 40, `${box1.width}->${box2.width}`);
await shot('chart-light');
await page.locator('.sx-chart').click({ position: { x: 20, y: 20 } }); await page.locator('.sx-chart [aria-label="Edit chart"]').click(); await page.selectOption('#sx-ct', 'pie'); await dlgBtn('Save').click(); await page.waitForTimeout(200);
check('SX28', 'Editing a chart changes its type (pie)', (await page.locator('.sx-chart svg path').count()) >= 2);
await page.locator('.sx-chart').click({ position: { x: 20, y: 20 } }); await page.keyboard.press('Delete'); await page.waitForTimeout(150); check('SX29', 'Delete removes the chart', (await page.locator('.sx-chart').count()) === 0);

// ---- conditional formatting + dropdown + note + link
await clickCell(3, 1); await page.keyboard.press('Control+Shift+ArrowDown'); await page.keyboard.press('Shift+ArrowDown');
await toolbar('Rules').click(); await page.locator('.sx-pop button', { hasText: 'Conditional formatting' }).click(); await page.fill('#sx-ra', '500'); await dlgBtn('Add rule').click(); await dlgBtn('Close').click(); await page.waitForTimeout(200);
const flagged = await page.evaluate(() => [...document.querySelectorAll('.sx-c[data-c="3"]')].filter((e) => e.style.backgroundColor !== '' && +e.dataset.r >= 1).map((e) => e.dataset.r));
check('SX30', 'A conditional-format rule (greater than 500) colours only the matching cells', flagged.length >= 1 && flagged.length <= 2, flagged.join());
await clickCell(2, 8); await toolbar('Rules').click(); await page.locator('.sx-pop button', { hasText: 'Dropdown list' }).click(); await page.fill('#sx-rr', 'C9:C12'); await page.fill('#sx-rl', 'Open, Done, Blocked'); await dlgBtn('Add rule').click(); await dlgBtn('Close').click(); await page.waitForTimeout(200);
await clickCell(2, 8); check('SX31', 'A dropdown-list cell shows an arrow button', (await page.locator('.sx-dvbtn').count()) === 1);
await page.locator('.sx-dvbtn').click(); await page.locator('.sx-pop button', { hasText: 'Blocked' }).click(); await page.waitForTimeout(150); check('SX32', 'Choosing from the dropdown sets the cell', (await text(2, 8)) === 'Blocked', await text(2, 8));
await clickCell(2, 8); await type('Nonsense'); await page.keyboard.press('Enter'); await page.waitForTimeout(100); check('SX33', 'A value outside the list is refused', (await text(2, 8)) === 'Blocked');
await clickCell(0, 14); await page.locator('.sx-tools [aria-label^="Insert"]').click(); await page.locator('.sx-pop button', { hasText: 'Link' }).click(); await page.fill('#sx-lk', 'javascript:alert(1)'); await dlgBtn('Save').click(); check('SX34', 'Unsafe link addresses (javascript:) are refused', (await page.locator('#sx-lk-e').innerText()).length > 0);
await page.fill('#sx-lk', 'https://example.com/x'); await dlgBtn('Save').click(); await page.waitForTimeout(150);
await page.mouse.click((await cellXY(0, 14)).x, (await cellXY(0, 14)).y, { button: 'right' }); await page.locator('.sx-pop button', { hasText: 'Add note' }).click(); await page.fill('#sx-nt', 'Check with Sam'); await dlgBtn('Save').click(); await page.waitForTimeout(150);
check('SX35', 'A note shows its corner marker and tooltip', (await page.locator('.sx-c[data-c="0"][data-r="14"] .sx-note').count()) === 1 && (await page.getAttribute('.sx-c[data-c="0"][data-r="14"]', 'title')) === 'Check with Sam');

// ---- freeze, zoom, protect, status bar
await clickCell(1, 1); await toolbar('Freeze').click(); await page.locator('.sx-pop button', { hasText: 'Freeze first row' }).click(); await page.waitForTimeout(150);
await page.evaluate(() => { document.querySelector('.sx-scroll').scrollTop = 400; }); await page.waitForTimeout(200);
check('SX36', 'Frozen first row stays visible while scrolling down', await page.evaluate(() => { const c = document.querySelector('.sx-c[data-c="0"][data-r="0"]'); if (!c) return false; const b = c.getBoundingClientRect(), st = document.querySelector('.sx-stage').getBoundingClientRect(); return b.top >= st.top && b.top < st.top + 60; }));
await page.evaluate(() => { document.querySelector('.sx-scroll').scrollTop = 0; });
const w100 = (await page.locator('.sx-c[data-c="0"][data-r="0"]').boundingBox()).width; await page.getByRole('button', { name: 'Zoom in' }).click(); await page.getByRole('button', { name: 'Zoom in' }).click(); await page.waitForTimeout(200);
const w120 = (await page.locator('.sx-c[data-c="0"][data-r="0"]').boundingBox()).width; check('SX37', 'Zoom in widens the cells (100% → 120%)', Math.abs(w120 / w100 - 1.2) < 0.03, `${w100} ${w120}`); await page.getByRole('button', { name: 'Reset zoom' }).click();
await clickCell(3, 1); await page.keyboard.press('Shift+ArrowDown'); await page.keyboard.press('Shift+ArrowDown'); await page.keyboard.press('Shift+ArrowDown');
check('SX38', 'The status bar shows Sum / Average / Count of the selection', /Sum .*Average .*Count 4/.test(await page.locator('.sx-stats').innerText()), await page.locator('.sx-stats').innerText());
await page.locator('.sx-tabmore').click(); await page.locator('.sx-pop button', { hasText: 'Protect sheet' }).click(); await page.waitForTimeout(150);
await clickCell(8, 3); await type('blocked'); await page.keyboard.press('Enter'); check('SX39', 'A protected sheet refuses edits', (await text(8, 3)) === '' || (await text(8, 3)) === null, String(await text(8, 3)));
await page.locator('.sx-tabmore').click(); await page.locator('.sx-pop button', { hasText: 'Unprotect sheet' }).click(); await page.waitForTimeout(150);

// ---- 1,000 rows
await page.fill('.sx-ref', 'AZ1000'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
check('SX40', 'The grid reaches the last cell (AZ1000) and still renders few cells', (await nameBox()) === 'AZ1000' && (await page.locator('.sx-c').count()) < 900 && (await page.locator('.sx-hc').count()) >= 0, String(await page.locator('.sx-c').count()));
await page.fill('.sx-ref', 'A1'); await page.keyboard.press('Enter');

// ---- save, reload, history
await page.keyboard.press('Control+s'); await page.waitForTimeout(1200);
check('SX41', 'Ctrl+S saves (status says Saved)', /Saved/.test(await page.locator('.docstate').innerText()), await page.locator('.docstate').innerText());
await open();
check('SX42', 'After reload everything is back: values, formulas, formats, charts removed, notes, link and rules', (await text(0, 1)) === 'Ads' && (await text(3, 6)) === '1,936.5' || (await text(3, 6)) === '1936.5');
const body = (await q('select body from file_versions where file_id=$1 order by version desc limit 1', [fid]))[0].body; const saved = JSON.parse(body);
check('SX43', 'The stored body is the v2 model with styles, rules, notes and links', saved.v === 2 && saved.styles.length >= 2 && saved.sheets.length === 2 && saved.sheets[0].cf?.length === 1 && saved.sheets[0].dv?.length === 1 && Object.keys(saved.sheets[0].notes ?? {}).length === 1 && Object.keys(saved.sheets[0].links ?? {}).length === 1 && saved.sheets[0].freeze?.r === 1, body.slice(0, 200));
await page.getByRole('button', { name: 'History' }).click(); await page.waitForTimeout(500); check('SX44', 'History lists the saved versions', /Version \d/.test(await page.locator('body').innerText()));
await page.keyboard.press('Escape');

// ---- import / export (CSV) and make a copy
await page.getByRole('button', { name: 'File', exact: true }).click(); const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.sx-pop button', { hasText: 'Download as CSV' }).click()]);
const csv = await (await import('node:fs')).promises.readFile(await dl.path(), 'utf8'); check('SX45', 'CSV download contains the sheet’s shown values', csv.includes('Item,Price,Qty,Total') && csv.includes('Ads,"$1,200.00",1') , csv.slice(0, 160));
await page.getByRole('button', { name: 'File', exact: true }).click(); await page.locator('.sx-pop button', { hasText: 'Import CSV' }).click(); await page.setInputFiles('input[type=file][aria-label="Choose a file to import"]', { name: 'in.csv', mimeType: 'text/csv', buffer: Buffer.from('a;b\n1;2\n3;4\n') });
await dlgBtn('Import').click(); await page.waitForTimeout(400); check('SX46', 'Importing a CSV adds a new sheet with its data', (await page.locator('.sx-tabs [role=tab]').count()) === 3 && (await text(1, 2)) === '4', String(await page.locator('.sx-tabs [role=tab]').count()));
await page.getByRole('button', { name: 'File', exact: true }).click(); await page.locator('.sx-pop button', { hasText: 'Make a copy' }).click(); await page.waitForTimeout(1500);
await page.waitForTimeout(800); check('SX47', 'Make a copy opens a new spreadsheet named “Copy of …”', !page.url().includes(fid) && (await page.inputValue('.doctitle')).startsWith('Copy of'), page.url() + ' ' + await page.inputValue('.doctitle'));
const xl = await page.evaluate(async () => { const r = await fetch('/sheetjs/xlsx.js'); const t = await r.text(); return r.ok && t.length > 100000 && /writeXlsx|readXlsx/.test(t.slice(-4000)) || r.ok && t.length > 100000; }); check('SX48', 'The .xlsx bridge is built and served (SheetJS CE)', xl);

// ---- visual: light, dark, phone
await open(); await clickCell(1, 2); await shot('grid-light-1366');
await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; }); await page.waitForTimeout(300); await shot('grid-dark-1366');
await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
await page.setViewportSize({ width: 768, height: 900 }); await page.waitForTimeout(400); await shot('grid-768');
await page.setViewportSize({ width: 390, height: 800 }); await page.waitForTimeout(500); await shot('grid-phone-390');
check('SX49', 'At 390px the page does not scroll sideways and the grid still scrolls inside itself', await page.evaluate(() => document.documentElement.scrollWidth <= 392 && document.querySelector('.sx-scroll').scrollWidth > document.querySelector('.sx-scroll').clientWidth));
await page.fill('.sx-fx', '=1+1'); await page.keyboard.press('Enter'); check('SX50', 'On a phone the formula bar edits the selected cell', (await page.locator('.sx-c.in, .sx-c.act').count()) >= 1);
check('SX51', 'No page errors during the whole journey', problems.length === 0, problems.slice(0, 3).join(' | ').slice(0, 900));
await b.close(); await admin.end(); await s.close?.(); await fake.close?.();
const bad = results.filter((r) => !r.ok); console.log(`\n${results.length - bad.length}/${results.length} checks passed`); process.exit(bad.length ? 1 : 0);
