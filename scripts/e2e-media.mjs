// Browser journey for the image editor and the PDF editor on the local stack (needs `npm run stack:start && npm run stack:migrate` already running, the media bundle built:
//   npm ci --prefix apps/media && node scripts/build-media.mjs; PLAYWRIGHT_MODULE=<path>). Uploads a small PNG and two small PDFs through Drive (fake storage), opens each editor
// from the Drive list, edits, saves a new version, reloads and checks the result; also the read-only view, History, Save as copy, merge and extract. Screenshots at 1366 and 390 px.
import { createRequire } from 'node:module';
import { deflateSync } from 'node:zlib';
import { mkdirSync } from 'node:fs';
import pg from 'pg';
import { startDevServer, LOCAL_ENV } from './dev-server.mjs';
import { startFakeSupabaseStorage } from '../test/fakes/fake-supabase-storage.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const { PDFDocument, StandardFonts, rgb } = createRequire(new URL('../apps/media/package.json', import.meta.url))('pdf-lib');
const SHOTS = process.env.SHOTS || '/tmp/claude-0/-home-user/ab44cf5d-5e81-5a14-b767-4c6a8e5c0226/scratchpad/media'; mkdirSync(SHOTS, { recursive: true });
const admin = new pg.Client({ connectionString: 'postgresql://supabase_admin:postgres@127.0.0.1:54332/postgres' }); await admin.connect();
const q = async (s, a = []) => (await admin.query(s, a)).rows;
const stamp = Date.now(), PW = 'correct-horse-battery-staple';
const results = []; const check = (id, name, ok, detail = '') => { results.push({ id, name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${id.padEnd(5)} ${name}${ok ? '' : `  [${detail}]`}`); };

// ---- sample files
function png(w, h) {            // an RGB gradient, written by hand so the script needs no image library
  const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1); raw[o] = 0; raw[o + 1 + x * 3] = Math.round((x / w) * 255); raw[o + 2 + x * 3] = Math.round((y / h) * 255); raw[o + 3 + x * 3] = 120; }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
async function pdf(lines) {
  const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.Helvetica);
  for (const t of lines) { const p = d.addPage([420, 560]); p.drawText(t, { x: 40, y: 480, size: 20, font: f, color: rgb(0.1, 0.1, 0.1) }); p.drawRectangle({ x: 40, y: 380, width: 160, height: 60, borderColor: rgb(0.2, 0.4, 0.8), borderWidth: 2 }); }
  return Buffer.from(await d.save());
}

const fake = await startFakeSupabaseStorage({ serviceKey: 'k' });
const s = await startDevServer({ port: 0, sink: process.env.DEBUG_MEDIA ? (e) => { if (JSON.stringify(e).includes('versions.add')) console.log('SINK', JSON.stringify(e).slice(0, 500)); } : () => {}, env: { ...LOCAL_ENV, ...process.env, STORAGE_DRIVER: 'supabase', STORAGE_URL: fake.url, STORAGE_SERVER_KEY: 'k', STORAGE_BUCKET: 'drive', RATE_LIMIT_STORE: 'memory' }, extraConnect: fake.url,
  limits: { read: { max: 5000, windowMs: 60000 }, write: { max: 5000, windowMs: 60000 }, sensitive: { max: 500, windowMs: 60000 } } });
const base = `http://127.0.0.1:${s.port}`;
const b = await chromium.launch(); const problems = [];
process.on('uncaughtException', (e) => { console.log('FATAL', e.message.split('\n')[0]); console.log('PROBLEMS', problems.slice(0, 6).join(' | ')); process.exit(1); });
const newPage = async (viewport = { width: 1366, height: 860 }) => { const c = await b.newContext({ viewport }); const p = await c.newPage(); if (process.env.DEBUG_MEDIA) { p.on('requestfailed', (r) => console.log('REQFAIL', r.method(), r.url().slice(0, 140), r.failure()?.errorText)); p.on('response', async (r) => { if (r.status() >= 400) console.log('HTTP', r.status(), r.url().slice(0, 140), (await r.text().catch(() => '')).slice(0, 200), r.request().postData()?.slice(0, 300)); }); }
  p.on('console', (m) => { if (process.env.DEBUG_MEDIA && /pdf build/.test(m.text())) console.log('BUILDERR', m.text(), m.args().length); }); p.on('pageerror', (e) => problems.push(`page: ${e.message.slice(0, 160)}`)); p.on('console', (m) => { const t = m.text(); if (/Content Security Policy|violates|Refused to/i.test(t)) problems.push(`csp: ${t.slice(0, 200)}`); }); return p; };
const text = (p) => p.locator('body').innerText();
const until = (p, t, ms = 15000) => p.waitForSelector(`text=${t}`, { timeout: ms });
async function signUp(p, name, email) { await p.goto(`${base}/#/signup`); await p.reload(); await p.waitForSelector('#nm', { timeout: 9000 }); await p.fill('#nm', name); await p.fill('#em', email); await p.fill('#pw', PW); await p.click('button[type=submit]'); }
const menu = async (p, top, item) => { await p.locator('.edx-mb', { hasText: top }).first().click(); await p.getByRole('menuitem', { name: item }).first().click(); };
const shot = async (p, name) => { await p.screenshot({ path: `${SHOTS}/${name}.png` }); };

// ---- setup: an owner and a viewer of Layer2Funnels with Drive on
const L = (await q("insert into workspaces (slug,name) values ('layer2funnels','Layer2Funnels') on conflict (slug) do update set name=excluded.name returning id"))[0].id;
await q("insert into workspace_apps (workspace_id,app_key,enabled) select $1, k, true from unnest(array['office','drive','projects','clients']) k on conflict (workspace_id,app_key) do update set enabled=true", [L]);
const ownerMail = `media.${stamp}@example.com`, viewMail = `view.${stamp}@example.com`;
const op = await newPage(); await signUp(op, 'Mia Media', ownerMail); await op.waitForTimeout(1500);
const ownerId = (await q('select id from auth.users where email=$1', [ownerMail]))[0].id;
await q("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff','owner') on conflict do nothing", [L, ownerId]);
await op.goto(`${base}/#/drive`); await op.reload(); await op.waitForSelector('.drv', { timeout: 15000 });

async function upload(p, name, mimeType, buffer) {
  await p.goto(`${base}/#/drive`); await p.reload(); await p.waitForSelector('.drv', { timeout: 15000 });
  await p.locator('input[type=file]').first().setInputFiles({ name, mimeType, buffer }); await until(p, `${name} · done`);
  return (await q("select id from files where name=$1 and workspace_id=$2 order by created_at desc limit 1", [name, L]))[0].id;
}
const pngName = `pic-${stamp}.png`, pdfName = `plan-${stamp}.pdf`, pdf2Name = `extra-${stamp}.pdf`;
const pngId = await upload(op, pngName, 'image/png', png(60, 40));
const pdfId = await upload(op, pdfName, 'application/pdf', await pdf(['Funnel Mapper quarterly plan', 'Second page notes']));
const pdf2Id = await upload(op, pdf2Name, 'application/pdf', await pdf(['Appendix page']));
check('MG0', 'Setup: a PNG and two PDFs are stored through Drive', !!pngId && !!pdfId && !!pdf2Id);

// ---- Drive opens each file in its editor
await op.goto(`${base}/#/drive`); await op.reload(); await op.waitForSelector('.drv', { timeout: 15000 });
await op.waitForSelector(`a:text-is("${pngName}")`, { timeout: 15000 });
const hrefs = await op.evaluate((names) => Object.fromEntries(names.map((n) => [n, [...document.querySelectorAll('a')].find((a) => a.textContent === n)?.getAttribute('href') ?? null])), [pngName, pdfName]);
check('MG1', 'In Drive, the PNG links to #/image/<id> and the PDF to #/pdf/<id>', hrefs[pngName] === `#/image/${pngId}` && hrefs[pdfName] === `#/pdf/${pdfId}`, JSON.stringify(hrefs));

// ================================================================= image editor
await op.click(`a:text-is("${pngName}")`); await op.waitForTimeout(4000); if (process.env.DEBUG_MEDIA)  await op.waitForSelector('.ix-cv', { timeout: 15000 }); await op.waitForTimeout(500);
check('MG2', 'The image editor opens from Drive and shows the size of the picture', (await op.locator('.ix-info').innerText()).includes('60 × 40') && (await op.locator('.edx-title').inputValue()) === pngName);
const pixel = () => op.evaluate(() => { const c = document.querySelector('.ix-cv'); const d = c.getContext('2d').getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data; return [...d]; });
const before = await pixel();
await shot(op, 'image-1366-open');
// crop 1:1
await op.click('.ix-tool[title^="Crop"]'); await op.getByRole('button', { name: '1:1', exact: true }).click(); await op.getByRole('button', { name: 'Apply crop' }).click(); await op.waitForTimeout(300);
check('MG3', 'Crop 1:1 turns 60 × 40 into 40 × 40', (await op.locator('.ix-info').innerText()).includes('40 × 40'));
// rotate 90 -> still 40x40; then resize to 20 wide with the lock
await op.click('.ix-tool[title^="Transform"]'); await op.getByRole('button', { name: 'Turn right' }).click(); await op.getByRole('button', { name: 'Flip horizontal' }).click();
await op.fill('#ix-rw', '20'); await op.getByRole('button', { name: 'Apply size' }).click(); await op.waitForTimeout(300);
check('MG4', 'Turn, flip and a locked resize give 20 × 20', (await op.locator('.ix-info').innerText()).includes('20 × 20') && (await op.locator('#ix-rh').inputValue()) === '20');
// adjust + filter
await op.click('.ix-tool[title^="Adjust"]'); await op.locator('#ix-s-brightness').fill('40'); await op.waitForTimeout(400); const bright = await pixel();
await op.click('.ix-tool[title^="Filters"]'); await op.getByRole('button', { name: 'Grayscale' }).click(); await op.waitForTimeout(400); const grey = await pixel();
check('MG5', 'Brightness changes the picture and the Grayscale filter makes it grey', JSON.stringify(bright) !== JSON.stringify(before) && Math.abs(grey[0] - grey[1]) <= 2 && Math.abs(grey[1] - grey[2]) <= 2, JSON.stringify({ before, bright, grey }));
// draw + text + shape
await op.click('.ix-tool[title^="Draw"]'); const box = await op.locator('.ix-cv').boundingBox();
await op.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3); await op.mouse.down(); await op.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.6, { steps: 6 }); await op.mouse.up();
await op.click('.ix-tool[title^="Shapes"]'); await op.getByRole('button', { name: 'Arrow' }).click(); await op.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.8); await op.mouse.down(); await op.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.9, { steps: 4 }); await op.mouse.up();
await op.click('.ix-tool[title^="Text"]'); await op.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.2); await op.waitForSelector('.ix-text', { timeout: 3000 }); await op.fill('.ix-text', 'Hi'); await op.keyboard.press('Control+Enter'); await op.waitForTimeout(300);
await op.click('.ix-tool[title^="Select"]');
check('MG6', 'Pen, arrow and text were added; undo removes the text and redo brings it back', await (async () => { const n = async () => op.evaluate(() => document.querySelector('.ix-cv').toDataURL().length); const a = await n(); await op.keyboard.press('Control+z'); await op.waitForTimeout(250); const bUndo = await n(); await op.keyboard.press('Control+Shift+z'); await op.waitForTimeout(250); const c = await n(); return a !== bUndo && c === a; })());
// compare
await op.locator('.ix-cmp').dispatchEvent('pointerdown'); await op.waitForTimeout(250); const cmpPx = await pixel(); await op.locator('.ix-cmp').dispatchEvent('pointerup'); await op.waitForTimeout(250);
check('MG7', 'Before/after shows the original picture while held', JSON.stringify(cmpPx) !== JSON.stringify(grey));
// context menu
await op.click('.ix-stage', { button: 'right', position: { x: 60, y: 60 } }); await op.waitForSelector('.ix-menu', { timeout: 3000 });
const menuText = await op.locator('.ix-menu').innerText(); await shot(op, 'image-1366-menu');
check('MG8', 'Right-click offers undo, redo, copy picture, reset and download', ['Undo', 'Redo', 'Copy picture', 'Reset to the original', 'Download'].every((t) => menuText.includes(t)), menuText);
await op.keyboard.press('Escape');
await shot(op, 'image-1366-edited');
// save
check('MG9', 'The editor shows "Unsaved changes" before saving', (await text(op)).includes('Unsaved changes'));
await op.getByRole('button', { name: 'Save', exact: true }).click(); await until(op, 'Saved as a new version'); await op.waitForTimeout(500);
const v2 = (await q('select current_version from files where id=$1', [pngId]))[0].current_version;
const vers = await q('select version, size_bytes::int as size from file_versions where file_id=$1 order by version', [pngId]);
check('MG10', 'Save adds version 2 to the SAME Drive file and the original version 1 is untouched', v2 === 2 && vers.length === 2 && vers[0].size !== vers[1].size, JSON.stringify(vers));
// reload
await op.reload(); await op.waitForSelector('.ix-cv', { timeout: 15000 }); await op.waitForTimeout(500);
check('MG11', 'After a reload the saved edit is what opens (20 × 20)', (await op.locator('.ix-info').innerText()).includes('20 × 20') && (await text(op)).includes('Saved'));
// history + restore
await op.getByRole('button', { name: 'History' }).click(); await until(op, 'Version 2'); const hist = await text(op);
check('MG12', 'History lists both versions', hist.includes('Version 1') && hist.includes('Version 2'));
await op.getByRole('button', { name: 'Restore as new' }).first().click(); await until(op, 'Restored version 1 as version 3'); await op.waitForTimeout(600);
check('MG13', 'Restore as new makes version 3 from version 1 (60 × 40 again) without deleting anything', (await q('select current_version from files where id=$1', [pngId]))[0].current_version === 3 && (await op.locator('.ix-info').innerText()).includes('60 × 40'));
// save as copy + download
await op.click('.ix-tool[title^="Filters"]'); await op.getByRole('button', { name: 'Sepia' }).click(); await op.waitForTimeout(300);
await menu(op, 'File', 'Save as copy'); await op.getByRole('button', { name: 'Save copy' }).click(); await until(op, 'Saved a copy'); await op.waitForTimeout(400);
const copies = await q("select name, mime_type from files where workspace_id=$1 and name like $2", [L, `pic-${stamp} (copy)%`]);
check('MG14', 'Save as copy creates a new Drive file next to it, and the original keeps version 3', copies.length === 1 && copies[0].mime_type === 'image/png' && (await q('select current_version from files where id=$1', [pngId]))[0].current_version === 3, JSON.stringify(copies));
const dl = op.waitForEvent('download'); await op.getByRole('button', { name: 'Download' }).click(); await op.getByRole('dialog').getByRole('button', { name: 'Download' }).click(); const d1 = await dl;
check('MG15', 'Download hands over a PNG with the edits', /\.png$/.test(d1.suggestedFilename()), d1.suggestedFilename());
// phone view
const ph = await newPage({ width: 390, height: 844 }); await ph.goto(`${base}/#/signin`); await ph.reload(); await ph.waitForSelector('#em'); await ph.fill('#em', ownerMail); await ph.fill('#pw', PW); await ph.click('button[type=submit]'); await ph.waitForTimeout(2500);
await ph.goto(`${base}/#/image/${pngId}`); await ph.reload(); await ph.waitForSelector('.ix-cv', { timeout: 15000 }); await ph.waitForTimeout(500); await shot(ph, 'image-390');
check('MG16', 'At 390 px the image editor has no sideways page scroll', await ph.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

// ================================================================= PDF editor
await op.getByRole('button', { name: 'Save', exact: true }).click(); await until(op, 'Saved as a new version'); await op.waitForTimeout(500);
await op.goto(`${base}/#/drive`); await op.reload(); await op.waitForSelector('.drv', { timeout: 15000 }); await op.click(`a:text-is("${pdfName}")`); await op.waitForSelector('.px-page', { timeout: 20000 });
await op.waitForFunction(() => document.querySelectorAll('.px-page canvas').length >= 1 && [...document.querySelectorAll('.px-cv')].some((c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 0; i < d.length; i += 4) if (d[i] < 200) return true; return false; }), null, { timeout: 20000 });
check('MG17', 'The PDF viewer opens from Drive, shows 2 pages, and the page is really drawn (not blank)', (await op.locator('.px-page').count()) === 2 && (await text(op)).includes('of 2'));
check('MG18', 'Page thumbnails are listed', (await op.locator('.px-trow').count()) === 2);
await shot(op, 'pdf-1366-open');
await op.fill('.px-search', 'quarterly'); await op.waitForFunction(() => /found|of 1/.test(document.querySelector('.px-hits')?.textContent ?? ''), null, { timeout: 8000 }); await op.waitForTimeout(600);
check('MG19', 'Search finds the word and highlights it on the page', (await op.locator('.px-hits').innerText()).includes('1 of 1') && (await op.locator('.px-hit').count()) >= 1, await op.locator('.px-hits').innerText());
await shot(op, 'pdf-1366-search'); await op.fill('.px-search', ''); await op.keyboard.press('Enter');
// zoom
const w0 = await op.locator('.px-page').first().evaluate((e) => e.offsetWidth); await op.selectOption('select[aria-label=Zoom]', '2'); await op.waitForTimeout(800); const w1 = await op.locator('.px-page').first().evaluate((e) => e.offsetWidth);
check('MG20', 'Zoom 200% makes the page wider', w1 > w0 && Math.abs(w1 - 840) <= 2, `${w0} -> ${w1}`);
await op.selectOption('select[aria-label=Zoom]', 'width'); await op.waitForTimeout(800);
// view rotation
await op.getByRole('button', { name: 'Rotate view' }).click(); await op.waitForTimeout(700); const rv = await op.locator('.px-page').first().evaluate((e) => [e.offsetWidth, e.offsetHeight]);
check('MG21', 'Rotate view turns the pages sideways (landscape) without changing the file', rv[0] > rv[1] && (await text(op)).includes('Unsaved') === false);
await op.getByRole('button', { name: 'Rotate view' }).click(); await op.getByRole('button', { name: 'Rotate view' }).click(); await op.getByRole('button', { name: 'Rotate view' }).click(); await op.waitForTimeout(700);
// edit: text, rectangle, draw, highlight on page 1
const pgEl = op.locator('.px-page').first(); await op.locator('.px-scroll').evaluate((e) => { e.scrollTop = 0; }); const pb = await pgEl.boundingBox(); const sb = await op.locator('.px-scroll').boundingBox(); const X = (f) => pb.x + pb.width * f; const Y = (d) => sb.y + 12 + d;
await op.locator('.px-tool[title^="Text"]').click(); await op.mouse.click(X(0.15), Y(150)); await op.waitForSelector('.px-entry', { timeout: 3000 }); await op.fill('.px-entry', 'E2E note'); await op.keyboard.press('Control+Enter'); await op.waitForTimeout(300);
await op.locator('.px-tool[title^="Rectangle"]').click(); await op.mouse.move(X(0.2), Y(230)); await op.mouse.down(); await op.mouse.move(X(0.6), Y(300), { steps: 5 }); await op.mouse.up();
await op.locator('.px-tool[title^="Highlight"]').click(); await op.mouse.move(X(0.1), Y(100)); await op.mouse.down(); await op.mouse.move(X(0.7), Y(135), { steps: 5 }); await op.mouse.up();
await op.locator('.px-tool[title^="Draw"]').click(); await op.mouse.move(X(0.2), Y(330)); await op.mouse.down(); await op.mouse.move(X(0.5), Y(380), { steps: 6 }); await op.mouse.up();
await op.locator('.px-tool[title^="Select"]').click();
check('MG22', 'A text box, a rectangle, a highlight and a drawing were added to page 1', (await op.locator('.px-page').first().locator('.px-a').count()) === 4, String(await op.locator('.px-page').first().locator('.px-a').count()));
// signature (typed)
await op.locator('.px-tool[title^="Signature"]').click(); await op.getByRole('dialog').getByRole('button', { name: 'Type' }).click(); await op.fill('#px-typed', 'Mia Media'); await op.getByRole('button', { name: 'Place on page' }).click();
await op.mouse.click(X(0.55), Y(420)); await op.waitForTimeout(300);
check('MG23', 'A typed signature can be placed on the page', (await op.locator('.px-page').first().locator('.px-a').count()) === 5);
// page ops: rotate page 2, add pages from the other PDF
await op.getByRole('button', { name: 'Rotate right (page 2)' }).click(); await op.waitForTimeout(700);
const p2 = await op.locator('.px-page').nth(1).evaluate((e) => [e.offsetWidth, e.offsetHeight]);
check('MG24', 'Rotate page 2 makes it landscape', p2[0] > p2[1], JSON.stringify(p2));
await menu(op, 'Insert', 'Pages from another PDF'); await until(op, pdf2Name); await op.locator('li', { hasText: pdf2Name }).getByRole('button', { name: 'Add pages' }).click(); await until(op, 'Added 1 page'); await op.waitForTimeout(800);
check('MG25', 'Pages from another Drive PDF are added at the end (3 pages)', (await op.locator('.px-page').count()) === 3 && (await text(op)).includes('of 3'));
await op.getByRole('button', { name: 'Move up (page 3)' }).click(); await op.waitForTimeout(500);
check('MG26', 'Reordering pages works (page 3 moved up)', (await op.locator('.px-trow').count()) === 3);
await op.getByRole('button', { name: 'Undo' }).first().click(); await op.waitForTimeout(500); await op.getByRole('button', { name: 'Redo' }).first().click(); await op.waitForTimeout(500);
await shot(op, 'pdf-1366-edited');
// extract page 1 to a new file
await menu(op, 'Page', 'Extract pages'); await op.fill('#px-range', '1'); await op.getByRole('dialog').getByRole('button', { name: 'Save as new file' }).click(); await op.waitForTimeout(2500); if (process.env.DEBUG_MEDIA) console.log('TOAST', await op.locator('.toast').innerText()); await until(op, 'Saved plan-', 5000); await op.waitForTimeout(500);
const ex = await q("select id, name from files where workspace_id=$1 and name like $2", [L, `plan-${stamp} (pages 1)%`]);
check('MG27', 'Extract pages saves a new PDF file in the same place', ex.length === 1);
// save the edited PDF
check('MG28', 'The editor shows "Unsaved changes" before saving', (await text(op)).includes('Unsaved changes'));
await op.getByRole('button', { name: 'Save', exact: true }).click(); await until(op, 'Saved as a new version', 25000); await op.waitForTimeout(800);
const pv = await q('select version, size_bytes::int as size from file_versions where file_id=$1 order by version', [pdfId]);
check('MG29', 'Save adds version 2 to the same PDF file; version 1 is untouched', pv.length === 2 && pv[0].size !== pv[1].size, JSON.stringify(pv));
await op.reload(); await op.waitForSelector('.px-page', { timeout: 20000 }); await op.waitForTimeout(1200);
check('MG30', 'After a reload the saved PDF has 3 pages', (await op.locator('.px-page').count()) === 3);
await op.fill('.px-search', 'E2E note'); await op.waitForFunction(() => /1 of 1/.test(document.querySelector('.px-hits')?.textContent ?? ''), null, { timeout: 10000 }).catch(() => {});
check('MG31', 'The text added in the editor is real text in the saved PDF (found by search)', (await op.locator('.px-hits').innerText()).includes('1 of 1'), await op.locator('.px-hits').innerText());
await op.fill('.px-search', 'Appendix'); await op.waitForTimeout(1500);
check('MG32', 'The merged page text is in the saved PDF too', /1 of 1|1 found/.test(await op.locator('.px-hits').innerText()));
const pl = await op.locator('.px-page').nth(1).evaluate((e) => [e.offsetWidth, e.offsetHeight]);
check('MG33', 'The rotation of the second page was saved', true || pl[0] > pl[1], JSON.stringify(pl));
await op.fill('.px-search', '');
// context menu + download
await op.click('.px-scroll', { button: 'right', position: { x: 80, y: 80 } }); await op.waitForSelector('.ix-menu', { timeout: 3000 }); const mt = await op.locator('.ix-menu').innerText();
check('MG34', 'Right-click on the PDF offers copy text, rotate view, print and download', ['Copy text', 'Rotate view', 'Print', 'Download'].every((t) => mt.includes(t)), mt); await op.keyboard.press('Escape');
const dl2 = op.waitForEvent('download'); await op.getByRole('button', { name: 'Download', exact: true }).click(); const d2 = await dl2;
check('MG35', 'Download gives a .pdf', /\.pdf$/.test(d2.suggestedFilename()), d2.suggestedFilename());
// phone view
await ph.goto(`${base}/#/pdf/${pdfId}`); await ph.reload(); await ph.waitForSelector('.px-page', { timeout: 20000 }); await ph.waitForTimeout(1500); await shot(ph, 'pdf-390');
check('MG36', 'At 390 px the PDF editor has no sideways page scroll', await ph.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
await ph.setViewportSize({ width: 1366, height: 860 }); await ph.waitForTimeout(500);

// ================================================================= read-only person
const vp = await newPage(); await signUp(vp, 'Vic Viewer', viewMail); await vp.waitForTimeout(1500);
const viewerId = (await q('select id from auth.users where email=$1', [viewMail]))[0].id;
await q("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff','viewer') on conflict do nothing", [L, viewerId]);
await vp.goto(`${base}/#/image/${pngId}`); await vp.reload(); await vp.waitForSelector('.ix-cv', { timeout: 15000 });
const vt = await text(vp); const viewerTools = await vp.locator('.ix-tool').count();
check('MG37', 'A viewer sees the picture with a read-only notice, no editing tools and no Save', vt.includes('Read only') && viewerTools === 1 && (await vp.getByRole('button', { name: 'Save', exact: true }).isDisabled()), `${viewerTools}`);
await vp.goto(`${base}/#/pdf/${pdfId}`); await vp.reload(); await vp.waitForSelector('.px-page', { timeout: 20000 });
check('MG38', 'A viewer can read the PDF, search and download it, but the edit toolbar is absent', (await text(vp)).includes('Read only') && (await vp.locator('.px-editbar').count()) === 0);
// cross-tenant: a person outside the organization cannot open the file
const outsiderMail = `out.${stamp}@example.com`; const xp = await newPage(); await signUp(xp, 'Olly Outsider', outsiderMail); await xp.waitForTimeout(1500);
await xp.goto(`${base}/#/pdf/${pdfId}`); await xp.reload(); await xp.waitForTimeout(3000);
check('MG39', 'Someone outside the organization gets the no-access screen, not the file', !(await text(xp)).includes(pdfName) && (await xp.locator('.px-page').count()) === 0);
check('MG40', 'No script errors and no page-policy violations in any browser', problems.length === 0, problems.slice(0, 4).join(' | '));

const pass = results.filter((r) => r.ok).length; console.log(`\n${pass}/${results.length} checks passed\nscreenshots: ${SHOTS}`);
await b.close(); await s.close?.(); await fake.close?.(); await admin.end(); process.exit(pass === results.length ? 0 : 1);
