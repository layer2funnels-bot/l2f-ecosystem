// Stack-free browser check of the Sheets editor layout and menus: serves apps/web statically and mounts sheetView with a fake API (no database).
// SHOTS=<dir> saves screenshots (light/dark at 1366, 768 and 390). Needs PLAYWRIGHT_MODULE=<path>.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const web = fileURLToPath(new URL('../apps/web/', import.meta.url)), ui = fileURLToPath(new URL('../packages/ui/', import.meta.url));
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.json': 'application/json', '.svg': 'image/svg+xml' };
const PAGE = `<!doctype html><html lang="en" data-theme="light" data-org="l2f"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/packages/ui/tokens.css"><link rel="stylesheet" href="/fonts.css"><link rel="stylesheet" href="/v4.css"><link rel="stylesheet" href="/ui.css"><link rel="stylesheet" href="/docs.css"><link rel="stylesheet" href="/sheets.css"></head>
<body><div class="app"><div class="shell"><main class="main"><div class="hdr" style="height:56px"></div><div class="content" id="c"></div></main></div></div><script type="module" src="/harness.js"></script></body></html>`;
const HARNESS = `import { sheetView } from '/js/modules/sheets.js';
const cells = {}; for (let r = 1; r <= 60; r++) { cells['A' + r] = 'Item ' + r; cells['B' + r] = String(r * 10); cells['C' + r] = '=B' + r + '*2'; }
const body = JSON.stringify({ v: 2, styles: [{ b: 1 }], sheets: [{ name: 'Budget', cells: { ...Object.fromEntries(Object.entries(cells)), A1: ['Item', 0], B1: ['Price', 0], C1: ['Double', 0] } }, { name: 'Sheet 2', cells: {} }] });
const api = { async call(op) { if (op === 'drive.files.get') return { ok: true, data: [{ id: 'f1', name: 'Budget plan', kind: 'document', mime_type: 'application/vnd.l2f.sheet+json', space: 'shared' }] }; if (op === 'drive.files.version') return { ok: true, data: [{ version: 1, body, created_at: new Date().toISOString() }] }; return { ok: true, data: [{ current_version: 2 }] }; } };
const ctx = { live: () => true, can: () => true, announce() {}, go() {}, orgName: 'Layer2Funnels' };
document.getElementById('c').append(sheetView({ api, id: 'f1', ctx })); location.hash = '#/sheet/f1';`;
const srv = createServer(async (q, res) => {
  const u = new URL(q.url, 'http://x'); if (u.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(PAGE); } if (u.pathname === '/harness.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(HARNESS); }
  const [b, rel] = u.pathname.startsWith('/packages/ui/') ? [ui, u.pathname.slice(13)] : [web, u.pathname]; const f = normalize(join(b, rel)); if (!f.startsWith(b)) { res.writeHead(404).end(); return; }
  try { res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' }); res.end(await readFile(f)); } catch { res.writeHead(404).end(); }
}).listen(0, '127.0.0.1'); await new Promise((r) => srv.on('listening', r));
const base = `http://127.0.0.1:${srv.address().port}`; const SHOTS = process.env.SHOTS;
const results = []; const check = (id, name, ok, d = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${id} ${name}${ok ? '' : `  [${d}]`}`); };
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1366, height: 820 } })).newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 200)); });
await page.goto(base); await page.waitForSelector('.sx-scroll'); await page.waitForTimeout(500);
const shot = (n) => (SHOTS ? page.screenshot({ path: `${SHOTS}/${n}.png` }) : null);
const rowsShown = await page.evaluate(() => new Set([...document.querySelectorAll('.sx-c')].filter((e) => e.getBoundingClientRect().bottom <= window.innerHeight).map((e) => e.dataset.r)).size);
check('L1', 'At 1366×820 at least 20 rows are visible', rowsShown >= 20, String(rowsShown));
check('L2', 'Menu bar: File, Edit, View, Insert, Format, Data, Help', (await page.locator('.sx-mb').allInnerTexts()).join() === 'File,Edit,View,Insert,Format,Data,Help');
check('L3', 'Top bar is compact (≤ 52px) and the toolbar is one row (≤ 48px)', (await page.locator('.sx-topbar').boundingBox()).height <= 52 && (await page.locator('.sx-tools').boundingBox()).height <= 48);
check('L4', 'The grid has no heavy outline', await page.evaluate(() => getComputedStyle(document.querySelector('.sx-scroll')).outlineStyle === 'none'));
await page.keyboard.press('F10'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown'); await page.waitForTimeout(100);
check('L5', 'F10 + arrows open the Edit menu; Right moves to View', /Find and replace/.test(await page.locator('.sx-pop').innerText()) && (await page.keyboard.press('ArrowRight'), await page.waitForTimeout(80), /Freeze first row/.test(await page.locator('.sx-pop').innerText())));
await page.keyboard.press('Escape');
await page.locator('.sx-mb', { hasText: 'File' }).click(); await page.waitForTimeout(100); await shot('menu-file-light-1366'); const fileText = await page.locator('.sx-pop').innerText();
check('L6', 'File menu lists import, .xlsx, .ods, .csv, .tsv, .html, .pdf, copy, history, print', ['Import', '.xlsx', '.ods', 'CSV', 'TSV', '.html', 'PDF', 'Make a copy', 'Version history', 'Print'].every((t) => fileText.includes(t)), fileText);
for (const [label, ext] of [['CSV', 'csv'], ['TSV', 'tsv'], ['web page', 'html']]) { if (!(await page.locator('.sx-pop').count())) await page.locator('.sx-mb', { hasText: 'File' }).click(); const [d] = await Promise.all([page.waitForEvent('download'), page.locator('.sx-pop button', { hasText: `Download as ${label}` }).click()]); const t = await (await import('node:fs')).promises.readFile(await d.path(), 'utf8'); check(`L7${ext}`, `Download .${ext}`, d.suggestedFilename().endsWith(`.${ext}`) && t.includes('Item 2'), d.suggestedFilename()); }
if (!(await page.locator('.sx-pop').count())) await page.locator('.sx-mb', { hasText: 'File' }).click(); const [od] = await Promise.all([page.waitForEvent('download'), page.locator('.sx-pop button', { hasText: 'Download as OpenDocument' }).click()]).catch(() => [null]);
check('L8', '.ods download is a zip file', od && (await (await import('node:fs')).promises.readFile(await od.path())).subarray(0, 2).toString() === 'PK');
await page.keyboard.press('Escape'); await page.locator('.sx-scroll').click({ position: { x: 200, y: 100 } }); await shot('grid-light-1366');
await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; }); await page.waitForTimeout(200); await shot('grid-dark-1366'); await page.locator('.sx-mb', { hasText: 'Format' }).click(); await shot('menu-format-dark-1366'); await page.keyboard.press('Escape');
for (const [w, h, n] of [[768, 900, '768'], [390, 800, 'phone-390']]) {
  await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(400); await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; }); await shot(`grid-dark-${n}`); await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; }); await page.waitForTimeout(150); await shot(`grid-light-${n}`);
  if (w === 390) { check('L9', 'Phone: ☰ menu replaces the menu bar and the grid shows at least 14 rows, no sideways page scroll', (await page.locator('.sx-burger').isVisible()) && !(await page.locator('.sx-menubar').isVisible()) && (await page.evaluate(() => new Set([...document.querySelectorAll('.sx-c')].filter((e) => e.getBoundingClientRect().bottom <= window.innerHeight).map((e) => e.dataset.r)).size)) >= 14 && (await page.evaluate(() => document.documentElement.scrollWidth <= 392))); await page.locator('.sx-burger').click(); await page.waitForTimeout(150); await shot('burger-phone-390'); check('L10', 'The ☰ menu lists every menu', /FILE[\s\S]*EDIT[\s\S]*VIEW[\s\S]*INSERT[\s\S]*FORMAT[\s\S]*DATA[\s\S]*HELP/i.test(await page.locator('.sx-pop').innerText())); }
}
check('L11', 'No page errors', errs.length === 0, errs.join(' | ').slice(0, 300));
await b.close(); srv.close(); const bad = results.filter((r) => !r).length; console.log(`\n${results.length - bad}/${results.length} checks passed`); process.exit(bad ? 1 : 0);
