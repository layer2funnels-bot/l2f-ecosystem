// Browser journey for Drive on the local stack (needs `npm run stack:start && npm run stack:migrate`; PLAYWRIGHT_MODULE=<path>).
// Covers: uploads (one, many, with overall progress), the reason shown for every kind of failure (storage refuses the PUT, storage unreachable, no permission, storage not set up,
// limit, not enough room found before uploading), retry, cancel, uploading a whole folder, dropping onto a folder, grid/list toggle (remembered), sort, image thumbnails,
// file-type tiles and plain type names. Screenshots go to $SHOTS when it is set.
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { startDevServer, LOCAL_ENV } from './dev-server.mjs';
import { startFakeSupabaseStorage } from '../test/fakes/fake-supabase-storage.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const SHOTS = process.env.SHOTS;
const admin = new pg.Client({ connectionString: 'postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres' }); await admin.connect();
const q = async (s, a = []) => (await admin.query(s, a)).rows;
const stamp = Date.now(), PW = 'correct-horse-battery-staple';
const results = []; const check = (id, name, ok, detail = '') => { results.push({ id, name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${id.padEnd(5)} ${name}${ok ? '' : `  [${detail}]`}`); };

const fake = await startFakeSupabaseStorage({ serviceKey: 'k' });
const s = await startDevServer({ port: 0, sink: () => {}, env: { ...LOCAL_ENV, ...process.env, STORAGE_DRIVER: 'supabase', STORAGE_URL: fake.url, STORAGE_SERVER_KEY: 'k', STORAGE_BUCKET: 'drive', RATE_LIMIT_STORE: 'memory' }, extraConnect: fake.url,
  limits: { read: { max: 9000, windowMs: 60000 }, write: { max: 9000, windowMs: 60000 }, sensitive: { max: 900, windowMs: 60000 } } });
const base = `http://127.0.0.1:${s.port}`; const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } }); const p = await ctx.newPage(); const problems = [];
p.on('pageerror', (e) => problems.push(e.message.slice(0, 200)));
p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|CORS|Access-Control/.test(m.text())) problems.push(m.text().slice(0, 200)); });
if (process.env.DEBUG_NET) { p.on('response', async (r) => { if (/drive.files.download|object\/sign/.test(r.url())) console.log('RESP', r.status(), r.url().slice(0, 150), r.url().includes('/api/') ? (await r.text()).slice(0, 200) : ''); }); p.on('requestfailed', (r) => console.log('REQFAIL', r.url().slice(0, 120), r.failure()?.errorText)); p.on('console', (m) => console.log('CON', m.text().slice(0, 200))); }
const shot = async (n) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/${n}.png` }); };
const org = async (slug, name) => (await q('insert into workspaces (slug,name) values ($1,$2) on conflict (slug) do update set name=excluded.name returning id', [slug, name]))[0].id;
const L = await org('layer2funnels', 'Layer2Funnels');
const email = `drvt.${stamp}@example.com`;
await p.goto(`${base}/#/signup`); await p.reload(); await p.waitForSelector('#nm', { timeout: 12000 }); await p.fill('#nm', 'Dee Drive'); await p.fill('#em', email); await p.fill('#pw', PW); await p.click('button[type=submit]'); await p.waitForTimeout(1500);
const uid = (await q('select id from auth.users where email=$1', [email]))[0].id;
await q("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff','owner') on conflict do nothing", [L, uid]);
await q("insert into workspace_apps (workspace_id,app_key,enabled) values ($1,'drive',true) on conflict (workspace_id,app_key) do update set enabled=true", [L]);
await p.evaluate(async (org) => { const t = JSON.parse(localStorage.getItem('l2f.session.v1')).access; await fetch('/api/org.switch', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${t}`, 'x-org-id': '00000000-0000-0000-0000-000000000000' }, body: JSON.stringify({ org, app: 'drive' }) }); }, L);
const go = async (hash) => { await p.goto(`${base}/${hash}`); await p.reload(); await p.waitForSelector('.drv-main', { timeout: 12000 }); await p.waitForSelector('.drv-list .tblwrap, .drv-list .dgrid, .drv-list .empty', { timeout: 12000 }); };
const dbFile = async (name) => (await q('select f.id, f.name, f.folder_id, f.size_bytes from files f where f.workspace_id = $1 and f.name = $2 and f.uploaded_by = $3 and f.archived_at is null', [L, name, uid]))[0];
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC', 'base64');
const U = (n) => `${n}-${stamp}`; const status = (name) => p.locator('.up-row', { hasText: name }).locator('.up-state');
const clearPanel = async () => { const c = p.locator('.drv-up-panel').getByRole('button', { name: 'Clear' }); if (await c.count()) await c.click(); };
const pick = async (files) => p.locator('input[type=file]').setInputFiles(files);
const tiles = async () => p.evaluate(() => [...document.querySelectorAll('.drv-tbl .ftile')].map((e) => e.className.replace('ftile ', '')));

await go('#/drive');
check('DR0', 'Drive Home opens in the list view with the toolbar: search, type, sort, direction and the list/grid switch', (await p.locator('.drv-tbl').count()) === 1 && (await p.locator('select[aria-label="Sort by"]').count()) === 1 && (await p.getByRole('button', { name: 'Grid view' }).count()) === 1 && (await p.locator('.drv-dir').count()) === 1);

// ---- success: one file
const A1 = `${U('one')}.txt`;
await pick({ name: A1, mimeType: 'text/plain', buffer: Buffer.from('hello') });
await p.locator('.up-row', { hasText: A1 }).locator('.up-state', { hasText: 'done' }).waitFor({ timeout: 15000 });
check('DR1', 'Uploading a file shows it in the panel as done and lists it in the library', (await dbFile(A1)) && (await p.locator('.drv-up-panel [data-up-title]').innerText()).includes('uploaded'));
await shot('upload-done');
await p.getByRole('button', { name: `Actions for ${A1}` }).waitFor({ timeout: 9000 });
await clearPanel();

// ---- several files, overall progress
const M = [1, 2, 3].map((n) => `${U('multi' + n)}.bin`);
await p.route(`${fake.url}/**`, async (r) => { if (r.request().method() === 'PUT') await new Promise((x) => setTimeout(x, 900)); await r.continue(); });
await pick(M.map((name, i) => ({ name, mimeType: 'application/octet-stream', buffer: Buffer.alloc(2000 * (i + 1), 1) })));
await p.waitForSelector('.up-row progress:not([hidden])', { timeout: 5000 });
const during = await p.locator('.drv-up-panel [data-up-title]').innerText(); const overall = await p.locator('.up-all').count();
await shot('upload-progress');
await p.locator('.drv-up-panel [data-up-title]', { hasText: '3 files uploaded' }).waitFor({ timeout: 20000 });
await p.unroute(`${fake.url}/**`);
check('DR2', 'Several files upload together with one overall progress bar and a count; all three are stored', /Uploading \d of 3/.test(during) && overall === 1 && (await q('select count(*)::int n from files where uploaded_by = $1 and name = any($2)', [uid, M]))[0].n === 3, during);
await clearPanel();

// ---- storage refuses the PUT (500) -> reason shown, no file created, retry button; then fixed -> retry works
const R1 = `${U('refused')}.txt`;
await p.route(`${fake.url}/**`, (r) => (r.request().method() === 'PUT' ? r.fulfill({ status: 500, body: 'boom' }) : r.continue()));
await pick({ name: R1, mimeType: 'text/plain', buffer: Buffer.from('x') });
await status(R1).filter({ hasText: 'error 500' }).waitFor({ timeout: 15000 });
check('DR3', 'When storage refuses the PUT the row says why (with the error number), offers Retry, and no file is created', (await p.getByRole('button', { name: `Retry ${R1}` }).count()) === 1 && !(await dbFile(R1)) && (await p.locator('.drv-up-panel [data-up-title]').innerText()).includes('did not finish'));
await shot('upload-error-put');
await p.unroute(`${fake.url}/**`);
await p.getByRole('button', { name: `Retry ${R1}` }).click();
await status(R1).filter({ hasText: 'done' }).waitFor({ timeout: 15000 });
check('DR4', 'Retry uploads the file after the problem is fixed', !!(await dbFile(R1)));
await clearPanel();

// ---- storage unreachable (the browser gets no answer: what a missing CORS rule looks like)
const R2 = `${U('cors')}.txt`;
await p.route(`${fake.url}/**`, (r) => (r.request().method() === 'PUT' ? r.abort('failed') : r.continue()));
await pick({ name: R2, mimeType: 'text/plain', buffer: Buffer.from('x') });
await status(R2).filter({ hasText: 'could not reach file storage' }).waitFor({ timeout: 15000 });
check('DR5', 'When the browser cannot reach storage the row says so and mentions that storage may not allow this address yet', /tell an admin/.test(await status(R2).innerText()) && !(await dbFile(R2)));
await p.unroute(`${fake.url}/**`); await clearPanel();

// ---- the server says no (sign step): permission, storage off, limit
const sign = async (name, status_, code, expect, id, label, retry) => {
  await p.route('**/api/drive.uploads.sign', (r) => r.fulfill({ status: status_, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { code, message: 'x' } }) }));
  await pick({ name, mimeType: 'text/plain', buffer: Buffer.from('x') }); await status(name).filter({ hasText: expect }).waitFor({ timeout: 9000 });
  check(id, label, (await p.getByRole('button', { name: `Retry ${name}` }).count()) === (retry ? 1 : 0) && !(await dbFile(name))); await p.unroute('**/api/drive.uploads.sign'); await clearPanel();
};
await sign(`${U('deny')}.txt`, 404, 'not_found', 'do not have permission', 'DR6', 'No permission (404 from the sign step) says so and offers no Retry', false);
await sign(`${U('off')}.txt`, 503, 'storage_unavailable', 'not set up', 'DR7', 'Storage not configured (503) says to tell an admin and can be retried', true);
await sign(`${U('lim')}.txt`, 507, 'storage_limit', 'storage limit', 'DR8', 'The storage limit (507) is named and not retried', false);
await sign(`${U('big')}.txt`, 422, 'invalid', 'does not accept', 'DR9', 'A refused name or size (422) is explained', false);

// ---- not enough room is found before any bytes move
let puts = 0; await p.route(`${fake.url}/**`, (r) => { if (r.request().method() === 'PUT') puts += 1; return r.continue(); });
await p.route('**/api/storage.usage', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [{ total_bytes: 1000, cap_bytes: 1010 }] }) }));
const FULL = `${U('room')}.bin`; await pick({ name: FULL, mimeType: 'application/octet-stream', buffer: Buffer.alloc(500, 1) });
await status(FULL).filter({ hasText: 'Not enough storage left' }).waitFor({ timeout: 9000 }); await p.waitForTimeout(400);
check('DR10', 'A file that cannot fit is refused before uploading (no request reaches storage)', puts === 0 && !(await dbFile(FULL)));
await p.unroute('**/api/storage.usage'); await p.unroute(`${fake.url}/**`); await clearPanel();

// ---- cancel
const C1 = `${U('cancel')}.bin`;
await p.route(`${fake.url}/**`, async (r) => { if (r.request().method() === 'PUT') await new Promise((x) => setTimeout(x, 4000)); await r.continue().catch(() => {}); });
await pick({ name: C1, mimeType: 'application/octet-stream', buffer: Buffer.alloc(3000, 1) });
await p.getByRole('button', { name: `Cancel upload of ${C1}` }).click(); await status(C1).filter({ hasText: 'Cancelled' }).waitFor({ timeout: 9000 });
check('DR11', 'Cancelling an upload stops it and offers Retry', (await p.getByRole('button', { name: `Retry ${C1}` }).count()) === 1 && !(await dbFile(C1)));
await p.unroute(`${fake.url}/**`); await clearPanel();

// ---- a whole folder (choose a folder) and a drop onto a folder row
const dir = mkdtempSync(join(tmpdir(), 'drv-')); const top = join(dir, `Pics-${stamp}`); mkdirSync(join(top, 'inner'), { recursive: true });
writeFileSync(join(top, 'a.txt'), 'a'); writeFileSync(join(top, 'inner', 'b.txt'), 'b');
await p.getByRole('button', { name: 'New', exact: true }).first().click();
const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.getByRole('button', { name: 'Upload folder' }).click()]); await chooser.setFiles(top);
await p.locator('.drv-up-panel [data-up-title]', { hasText: '2 files uploaded' }).waitFor({ timeout: 20000 });
const fold = await q("select a.name top, i.name inner, (select count(*)::int from files f where f.folder_id = a.id and f.name = 'a.txt') ta, (select count(*)::int from files f where f.folder_id = i.id and f.name = 'b.txt') ib from drive_folders a join drive_folders i on i.parent_id = a.id where a.workspace_id = $1 and a.name = $2 and a.parent_id is null and a.space = 'shared'", [L, `Pics-${stamp}`]);
check('DR12', 'Uploading a folder recreates it (and its sub-folder) and puts each file in its own folder', fold.length === 1 && fold[0].inner === 'inner' && fold[0].ta === 1 && fold[0].ib === 1, JSON.stringify(fold));
await clearPanel(); await go('#/drive');
const DROPF = `${U('dropped')}.txt`;
await p.evaluate(({ name, id }) => { const row = document.querySelector(`[data-drop-folder="${id}"]`); const dt = new DataTransfer(); dt.items.add(new File(['dropped'], name, { type: 'text/plain' })); for (const t of ['dragenter', 'dragover', 'drop']) row.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt })); }, { name: DROPF, id: (await q("select id from drive_folders where workspace_id=$1 and name=$2 and parent_id is null", [L, `Pics-${stamp}`]))[0].id });
await status(DROPF).filter({ hasText: 'done' }).waitFor({ timeout: 15000 });
check('DR13', 'Dropping a file onto a folder uploads it into that folder', (await dbFile(DROPF))?.folder_id === (await q("select id from drive_folders where workspace_id=$1 and name=$2 and parent_id is null", [L, `Pics-${stamp}`]))[0].id);
await clearPanel();

// ---- types, tiles, sort, grid
const IMG = `${U('pic')}.png`; const PDF = `${U('doc')}.pdf`; const ZIP = `${U('pack')}.zip`; const MP4 = `${U('clip')}.mp4`;
await pick([{ name: IMG, mimeType: 'image/png', buffer: png }, { name: PDF, mimeType: 'application/pdf', buffer: Buffer.alloc(30000, 2) }, { name: ZIP, mimeType: 'application/zip', buffer: Buffer.alloc(900, 3) }, { name: MP4, mimeType: 'video/mp4', buffer: Buffer.alloc(120000, 4) }]);
await p.locator('.drv-up-panel [data-up-title]', { hasText: '4 files uploaded' }).waitFor({ timeout: 20000 }); await clearPanel();
await go('#/drive');
const cls = await p.evaluate((n) => [...document.querySelectorAll('.drv-tbl tbody tr')].filter((tr) => tr.innerText.includes(n)).map((tr) => tr.querySelector('.ftile')?.className.replace('ftile ', '')), `-${stamp}.`);
const typeCells = await p.evaluate(() => [...document.querySelectorAll('.drv-tbl td.c-meta:nth-child(3)')].map((e) => e.innerText));
check('DR14', 'Every kind has its own tile colour class and the Type column shows plain names (Image, PDF, Archive, Video), never a raw MIME type', ['ft-image', 'ft-pdf', 'ft-zip', 'ft-video'].every((c) => cls.includes(c)) && typeCells.every((t) => !/\//.test(t) && !/octet|mpeg/.test(t)) && ['Image', 'PDF', 'Archive', 'Video'].every((t) => typeCells.includes(t)), `${cls} | ${[...new Set(typeCells)]}`);
await shot('list');
const mine = (names) => p.evaluate((ns) => [...document.querySelectorAll('.drv-tbl tbody tr .fn-line a, .drv-tbl tbody tr .fn-line button')].map((e) => e.textContent).filter((t) => ns.some((n) => t.includes(n))), names);
const stampTail = `-${stamp}`; const order = async () => (await mine([stampTail])).filter((t) => [PDF, ZIP, MP4, IMG].includes(t));
await p.selectOption('select[aria-label="Sort by"]', 'size'); const bySizeAsc = await order();
await p.locator('.drv-dir').click(); const bySizeDesc = await order();
check('DR15', 'Sorting by size orders files smallest first, and the direction button reverses it', bySizeAsc.join() === [ZIP, IMG, PDF, MP4].sort((x, y) => ({ [ZIP]: 900, [IMG]: png.length, [PDF]: 30000, [MP4]: 120000 }[x] - { [ZIP]: 900, [IMG]: png.length, [PDF]: 30000, [MP4]: 120000 }[y])).join() && bySizeDesc.join() === [...bySizeAsc].reverse().join(), `${bySizeAsc} || ${bySizeDesc}`);
await p.locator('.drv-dir').click(); await p.selectOption('select[aria-label="Sort by"]', 'name'); const byName = await order();
check('DR16', 'Sorting by name is alphabetical', byName.join() === [...byName].sort((x, y) => x.localeCompare(y)).join(), byName.join());
await p.getByRole('button', { name: 'Grid view' }).click(); await p.waitForSelector('.dgrid');
check('DR17', 'The grid view shows folders and files as cards and hides the table', (await p.locator('.drv-tbl').count()) === 0 && (await p.locator('.gcard').count()) >= 5);
await p.locator('.gcard', { hasText: IMG }).scrollIntoViewIfNeeded();
await p.waitForFunction(() => [...document.querySelectorAll('.gcard .drv-art img')].some((i) => i.complete && i.naturalWidth > 0), null, { timeout: 12000 }).catch(() => {});
check('DR18', 'Image files show their picture as the card thumbnail (loaded lazily through a signed address)', (await p.evaluate(() => [...document.querySelectorAll('.gcard .drv-art img')].filter((i) => i.naturalWidth > 0).length)) >= 1);
await shot('grid');
await p.reload(); await p.waitForSelector('.dgrid', { timeout: 12000 });
check('DR19', 'The chosen view is remembered after a reload', (await p.locator('.dgrid').count()) === 1 && (await p.getByRole('button', { name: 'Grid view' }).getAttribute('aria-pressed')) === 'true');
await p.getByRole('button', { name: 'List view' }).click(); await p.waitForSelector('.drv-tbl');
check('DR20', 'The list view comes back with the switch', (await p.locator('.dgrid').count()) === 0);

// ---- menu, details, phone layout
await p.getByRole('button', { name: `Actions for ${PDF}` }).click(); await p.getByRole('button', { name: 'Details' }).click(); await p.waitForSelector('.drv-dl');
check('DR21', 'The row menu opens as a small pop-up (not a dialog) and Details shows a plain type name', (await p.locator('.drv-dl').innerText()).includes('PDF') && !(await p.locator('.drv-dl').innerText()).includes('application'));
await p.keyboard.press('Escape');

// ---- right-click menu, preview, star, keyboard, copy, folder picker, usage, New menu
const rowOf = (name) => p.locator('tr[data-item]', { hasText: name });
await rowOf(A1).click({ button: 'right' });
const items = await p.locator('.drv-pop button').allInnerTexts();
check('DR25', 'Right-click on a file opens its menu at the pointer: Preview, Download, Star, Details, Rename, Move, Make a copy, Move to Trash', ['Preview', 'Download', 'Star', 'Details', 'Rename', 'Move', 'Make a copy', 'Move to Trash'].every((t) => items.includes(t)), items.join());
await p.getByRole('button', { name: 'Preview', exact: true }).click(); await p.waitForSelector('.drv-lb .lb-text', { timeout: 9000 });
check('DR26', 'Preview shows a text file in a viewer with Download and Close, and Esc closes it', (await p.locator('.lb-text').innerText()).includes('hello') && (await p.locator('.drv-lb').getByRole('button', { name: 'Download' }).count()) === 1);
await p.keyboard.press('Escape'); check('DR26b', 'Esc closes the preview', (await p.locator('.drv-lb').count()) === 0);
await p.getByRole('button', { name: IMG, exact: true }).click(); await p.waitForFunction(() => { const i = document.querySelector('.drv-lb .lb-img'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 12000 });
check('DR27', 'An image opens in the preview with previous/next arrows between previewable files', (await p.locator('.lb-next').count()) === 1 && /\d+ of \d+/.test(await p.locator('.lb-count').innerText()));
await shot('preview-image');
await p.keyboard.press('ArrowRight'); await p.waitForTimeout(300); await p.keyboard.press('Escape');
await rowOf(PDF).click({ button: 'right' }); await p.getByRole('button', { name: 'Preview', exact: true }).click(); await p.waitForSelector('.drv-lb .lb-frame', { timeout: 9000 }); const frameSrc = await p.locator('.lb-frame').getAttribute('src'); await p.keyboard.press('Escape');
check('DR28', 'A PDF opens in a frame served from the storage address (without the forced-download parameter)', !!frameSrc && !frameSrc.includes('download='), frameSrc);
await rowOf(A1).click({ button: 'right' }); await p.getByRole('button', { name: 'Star', exact: true }).click();
check('DR29', 'Starring marks the file, and "Starred" shows only starred files (remembered after reload)', (await rowOf(A1).locator('.drv-star').count()) === 1);
await p.getByRole('button', { name: 'Starred', exact: true }).click(); await p.waitForFunction((n) => document.querySelectorAll('.drv-tbl tbody tr').length === 1 && document.querySelector('.drv-tbl tbody tr').innerText.includes(n), A1, { timeout: 9000 });
await p.reload(); await p.waitForSelector('.drv-tbl, .empty'); await p.getByRole('button', { name: 'Starred', exact: true }).click(); await p.waitForSelector(`tr[data-item]:has-text("${A1}")`);
await p.getByRole('button', { name: 'Starred', exact: true }).click(); await p.waitForSelector(`tr[data-item]:has-text("${PDF}")`);
const A2 = `${U('renamed')}.txt`;
await rowOf(A1).focus(); await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowUp'); await p.keyboard.press('F2'); await p.waitForSelector('#dr-name'); await p.fill('#dr-name', A2); await p.getByRole('button', { name: 'Rename', exact: true }).click();
await p.waitForSelector(`tr[data-item]:has-text("${A2}")`);
check('DR30', 'Keyboard: arrows move between rows, F2 renames', !!(await dbFile(A2)));
await rowOf(A2).focus(); await p.keyboard.press('Delete'); await p.waitForFunction((n) => !document.querySelector('.drv-tbl')?.innerText.includes(n), A2, { timeout: 9000 });
check('DR31', 'Keyboard: Delete moves the focused file to the Trash', !(await dbFile(A2)));
await p.getByRole('button', { name: 'New', exact: true }).first().click(); const newItems = await p.locator('.drv-pop button').allInnerTexts();
check('DR32', 'The New menu offers Folder, Document, Spreadsheet, Whiteboard, Upload files and Upload folder', ['Folder', 'Document', 'Spreadsheet', 'Whiteboard', 'Upload files', 'Upload folder'].every((t) => newItems.includes(t)), newItems.join());
await p.getByRole('button', { name: 'Document', exact: true }).click(); await p.fill('#nd-name', `Copyme-${stamp}`); await p.getByRole('button', { name: 'Create', exact: true }).click(); await p.waitForURL(/#\/doc\//, { timeout: 9000 });
await go('#/drive'); await rowOf(`Copyme-${stamp}`).click({ button: 'right' }); await p.getByRole('button', { name: 'Make a copy' }).click(); await p.waitForSelector(`tr[data-item]:has-text("Copy of Copyme-${stamp}")`, { timeout: 9000 });
check('DR33', 'Make a copy duplicates a document with its content under "Copy of …"', !!(await dbFile(`Copy of Copyme-${stamp}`)));
await rowOf(PDF).click({ button: 'right' }); await p.getByRole('button', { name: 'Move', exact: true }).click(); await p.locator('.dlg .drv-pick-i', { hasText: `Pics-${stamp}` }).click(); await p.getByRole('button', { name: 'Move here' }).click();
await p.waitForFunction((n) => !document.querySelector('.drv-tbl')?.innerText.includes(n), PDF, { timeout: 9000 });
check('DR34', 'Move opens a folder picker (open folders, then Move here) and moves the file', (await dbFile(PDF))?.folder_id === (await q("select id from drive_folders where workspace_id=$1 and name=$2 and parent_id is null", [L, `Pics-${stamp}`]))[0].id);
check('DR35', 'A storage meter shows how much of the limit is used', (await p.locator('.drv-usage progress').count()) === 1 && /of .* storage used/.test(await p.locator('.drv-usage').innerText()));
await shot('list-final');
await p.setViewportSize({ width: 390, height: 844 }); await go('#/drive'); await shot('phone-list');
const phone = await p.evaluate(() => ({ who: document.documentElement.scrollWidth > innerWidth ? [...document.querySelectorAll('.drv *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 5).map((e) => `${e.tagName}.${String(e.className).slice(0, 30)}`) : [], over: document.documentElement.scrollWidth - document.documentElement.clientWidth, thead: getComputedStyle(document.querySelector('.drv-tbl thead')).display, small: [...document.querySelectorAll('.drv button, .drv a.btn, .drv select, .drv-pop button')].filter((e) => { const r = e.getBoundingClientRect(); const st = getComputedStyle(e); return r.width && r.height && st.visibility !== 'hidden' && (r.height < 43.5 || r.width < 43.5) && !e.closest('.sr, .tblwrap .linklike') && !e.matches('.linklike'); }).map((e) => `${e.className}:${(e.getAttribute('aria-label') || e.innerText || '').slice(0, 20)}`).slice(0, 4) }));
check('DR22', 'At phone width the table becomes a plain list (no sideways scroll) and every control is at least 44px', phone.over <= 1 && phone.thead === 'none' && phone.small.length === 0, JSON.stringify(phone));
await p.getByRole('button', { name: 'Grid view' }).click(); await p.waitForSelector('.dgrid'); await shot('phone-grid');
const phone2 = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('DR23', 'The phone grid is two columns without sideways scroll', phone2 <= 1 && (await p.evaluate(() => getComputedStyle(document.querySelector('.dgrid')).gridTemplateColumns.split(' ').length)) === 2);
check('DR24', 'No script or page errors', problems.length === 0, problems.slice(0, 3).join(' | '));

// clean up what this run made
await admin.query('set session_replication_role = replica'); await admin.query('delete from file_versions where file_id in (select id from files where uploaded_by = $1)', [uid]); await admin.query('delete from files where uploaded_by = $1', [uid]); await admin.query('delete from drive_folders where created_by = $1', [uid]); await admin.query('set session_replication_role = origin');
const pass = results.filter((r) => r.ok).length; console.log(`\n${pass}/${results.length} checks passed`);
await b.close(); await s.close?.(); await fake.close(); await admin.end(); process.exit(pass === results.length ? 0 : 1);
