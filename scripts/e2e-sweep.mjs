// Interaction sweep over the four editors (Docs, Sheets, Image, PDF) at desktop (1366, mouse) and phone (390, touch) size, on the local stack.
// Presses every visible toolbar button and opens every menu, one at a time, and after each step checks for the kind of bug people find by hand:
//   S1 a dropdown list (<select>) took focus by itself (on phones that pops its picker open over what was just opened)
//   S2 a script error
//   S3 the page scrolls sideways (something is wider than the screen)
//   S4 a button whose label is cut off
//   S5 something left on screen after Escape / after the step finished (open popover or menu, a crop box outside the Crop tool)
//   S6 a menu or popover that sticks out of the screen
// Needs `npm run stack:start && npm run stack:migrate`, built bundles, PLAYWRIGHT_MODULE. Prints PASS/FAIL lines; exit 1 on any FAIL.
import { createRequire } from 'node:module';
import { deflateSync } from 'node:zlib';
import pg from 'pg';
import { startDevServer, LOCAL_ENV } from './dev-server.mjs';
import { startFakeSupabaseStorage } from '../test/fakes/fake-supabase-storage.mjs';
import { emptyDoc, serialize } from '../apps/web/js/modules/docmodel.js';
import { DOC_MIME } from '../apps/web/js/modules/driveutil.js';
import { emptyBook, serializeBook, MIME as SHEET_MIME } from '../apps/web/js/modules/sheetmodel.js';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const { PDFDocument, StandardFonts } = createRequire(new URL('../apps/media/package.json', import.meta.url))('pdf-lib');
const admin = new pg.Client({ connectionString: 'postgresql://supabase_admin:postgres@127.0.0.1:54332/postgres' }); await admin.connect();
const q = async (s, a = []) => (await admin.query(s, a)).rows;
const stamp = Date.now(), PW = 'correct-horse-battery-staple';
const fails = []; let passes = 0;
const check = (id, name, ok, detail = '') => { if (ok) passes++; else fails.push(id); console.log(`${ok ? 'PASS' : 'FAIL'}  ${id.padEnd(6)} ${name}${ok ? '' : `  [${detail}]`}`); };

function png(w, h) {
  const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1); raw[o + 1 + x * 3] = (x * 4) & 255; raw[o + 2 + x * 3] = (y * 4) & 255; raw[o + 3 + x * 3] = 128; }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const fake = await startFakeSupabaseStorage({ serviceKey: 'k' });
const s = await startDevServer({ port: 0, sink: () => {}, env: { ...LOCAL_ENV, ...process.env, STORAGE_DRIVER: 'supabase', STORAGE_URL: fake.url, STORAGE_SERVER_KEY: 'k', STORAGE_BUCKET: 'drive', RATE_LIMIT_STORE: 'memory' }, extraConnect: fake.url,
  limits: { read: { max: 9000, windowMs: 60000 }, write: { max: 9000, windowMs: 60000 }, sensitive: { max: 500, windowMs: 60000 } } });
const base = `http://127.0.0.1:${s.port}`;
const b = await chromium.launch();

// ---- setup: one owner, a document, a spreadsheet, a picture and a PDF
const L = (await q("insert into workspaces (slug,name) values ('layer2funnels','Layer2Funnels') on conflict (slug) do update set name=excluded.name returning id"))[0].id;
await q("insert into workspace_apps (workspace_id,app_key,enabled) select $1, k, true from unnest(array['office','drive']) k on conflict (workspace_id,app_key) do update set enabled=true", [L]);
const mail = `sweep.${stamp}@example.com`;
const setupCtx = await b.newContext({ viewport: { width: 1366, height: 860 } }); const sp = await setupCtx.newPage();
await sp.goto(`${base}/#/signup`); await sp.reload(); await sp.waitForSelector('#nm', { timeout: 9000 });
await sp.fill('#nm', 'Sam Sweep'); await sp.fill('#em', mail); await sp.fill('#pw', PW); await sp.click('button[type=submit]'); await sp.waitForTimeout(1500);
const uid = (await q('select id from auth.users where email=$1', [mail]))[0].id;
await q("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff','owner') on conflict do nothing", [L, uid]);
const mkDoc = async (name, mime, body) => { const [{ id }] = await q("insert into files (workspace_id, space, uploaded_by, name, kind, mime_type, size_bytes) values ($1,'shared',$2,$3,'document',$4,100) returning id", [L, uid, name, mime]); await q('insert into file_versions (workspace_id, file_id, body) values ($1,$2,$3)', [L, id, body]); return id; };
const doc = emptyDoc(); doc.tabs[0].blocks = [{ t: 'h1', c: [{ x: 'Sweep heading' }] }, { t: 'p', c: [{ x: 'Some words to select and format.' }] }, { t: 'table', rows: [[{ c: [{ x: 'a' }] }, { c: [{ x: 'b' }] }], [{ c: [{ x: 'c' }] }, { c: [{ x: 'd' }] }]] }, { t: 'p', c: [{ x: 'End.' }] }];
const docId = await mkDoc(`Sweep doc ${stamp}`, DOC_MIME, serialize(doc));
const sheetId = await mkDoc(`Sweep sheet ${stamp}`, SHEET_MIME, serializeBook(emptyBook()));
async function upload(name, mimeType, buffer) {
  await sp.goto(`${base}/#/drive`); await sp.reload(); await sp.waitForSelector('.drv-main', { timeout: 15000 });
  await sp.locator('input[type=file]').first().setInputFiles({ name, mimeType, buffer });
  for (let i = 0; i < 60; i++) { const r = await q('select id from files where name=$1 and workspace_id=$2', [name, L]); if (r[0]) return r[0].id; await sp.waitForTimeout(250); }
  console.log('UPLOAD-DEBUG', (await sp.locator('body').innerText()).slice(0, 600).replace(/\n/g, ' | '));
  return null;
}
const imgId = await upload(`sweep-${stamp}.png`, 'image/png', png(64, 48));
const pd = await PDFDocument.create(); const font = await pd.embedFont(StandardFonts.Helvetica); for (const t of ['One', 'Two']) pd.addPage([420, 560]).drawText(t, { x: 40, y: 480, size: 20, font });
if (process.env.SW_STOP) { console.log('IDS', imgId); process.exit(0); }
const pdfId = await upload(`sweep-${stamp}.pdf`, 'application/pdf', Buffer.from(await pd.save()));
const docMime = (await q('select mime_type from files where id=$1', [docId]))[0].mime_type;
check('SW0', 'Setup: a document, a spreadsheet, a picture and a PDF', !!docId && !!sheetId && !!imgId && !!pdfId && !!docMime, JSON.stringify({ docId, sheetId, imgId, pdfId }));
const cookies = await setupCtx.cookies(); const storage = await setupCtx.storageState(); await setupCtx.close();

// ---- the sweep
const EDITORS = [
  { key: 'doc', hash: `#/doc/${docId}`, ready: '.docpage, [contenteditable]', bars: '.ed-full' },
  { key: 'sheet', hash: `#/sheet/${sheetId}`, ready: '.sx-topbar', bars: '.ed-full' },
  { key: 'image', hash: `#/image/${imgId}`, ready: '.ix-cv', bars: '.ed-full' },
  { key: 'pdf', hash: `#/pdf/${pdfId}`, ready: '.pdfx, .px-pages, canvas', bars: '.ed-full' },
];
const SKIP = /back|delete|remove|close|sign out|leave|discard|print|download|history|save|voice|microphone|record|upload|open file|picture$|insert picture|merge|signature|import/i;
const VIEWS = [{ name: 'desktop', opt: { viewport: { width: 1366, height: 860 } } }, { name: 'phone', opt: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 } }];

const probe = (page) => page.evaluate(() => {
  const vis = (e) => { if (!e || e.hidden || e.closest('[hidden]')) return false; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const a = document.activeElement;
  const pops = [...document.querySelectorAll('.dx-pop, .edx-menu, .menu-pop, [role=menu], .popmenu')].filter(vis);
  const off = pops.filter((p) => { const r = p.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1 || r.top < -1; }).map((p) => p.className);
  const crop = [...document.querySelectorAll('.ix-crop')].some(vis);
  const cropTool = !!document.querySelector('[aria-pressed=true][aria-label^=Crop], [aria-pressed=true][title^=Crop], .on[aria-label^=Crop]');
  return { selFocus: a?.tagName === 'SELECT' ? (a.getAttribute('aria-label') || a.title || 'select') : null, hscroll: document.documentElement.scrollWidth > innerWidth + 1, pops: pops.length, off, crop, cropTool };
});
const clipped = (page, bars) => page.evaluate((bars) => [...document.querySelectorAll(`${bars} button`)].filter((x) => {
  if (x.hidden || x.closest('[hidden]') || !x.offsetParent) return false; const t = (x.textContent || '').trim(); if (t.length < 3 || x.querySelector('select')) return false;
  return x.scrollWidth > x.clientWidth + 2;
}).map((x) => (x.textContent || '').trim().slice(0, 30)), bars);

for (const v of VIEWS) {
  for (const ed of EDITORS) {
    const ctx = await b.newContext({ ...v.opt, storageState: storage }); const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 140))); page.on('dialog', (d) => d.dismiss().catch(() => {}));
    page.on('download', (d) => d.cancel().catch(() => {}));
    await page.goto(`${base}/${ed.hash}`); await page.reload(); await page.waitForSelector(ed.ready, { timeout: 25000 }).catch(() => {}); await page.waitForTimeout(1500);
    const id = `${ed.key}-${v.name}`; const found = { selFocus: new Set(), stuck: new Set(), off: new Set(), crop: new Set(), hscroll: new Set() };
    const p0 = await probe(page); if (p0.hscroll) found.hscroll.add('on open');
    // every toolbar button, one at a time (incl. the ⋯ overflow panel's own buttons when it is open)
    const labels = await page.evaluate((bars) => [...new Set([...document.querySelectorAll(`${bars} button`)].filter((x) => !x.disabled && x.offsetParent && !x.closest('[hidden]')).map((x) => x.getAttribute('aria-label') || x.title || (x.textContent || '').trim()).filter(Boolean))], ed.bars);
    for (const lab of labels) {
      if (SKIP.test(lab)) continue;
      if (!page.url().includes(ed.hash.slice(1))) { await page.goto(`${base}/${ed.hash}`); await page.waitForSelector(ed.ready, { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(800); }
      const ok = await page.evaluate(([bars, lab]) => { document.querySelectorAll('[data-sw]').forEach((x) => x.removeAttribute('data-sw')); const x = [...document.querySelectorAll(`${bars} button`)].find((x) => !x.disabled && x.offsetParent && !x.closest('[hidden]') && (x.getAttribute('aria-label') || x.title || (x.textContent || '').trim()) === lab); if (x) x.setAttribute('data-sw', '1'); return !!x; }, [ed.bars, lab]);
      if (!ok) continue; const el = page.locator('[data-sw="1"]');
      try { if (v.name === 'phone') await el.tap({ timeout: 2000 }); else await el.click({ timeout: 2000 }); } catch { continue; }
      await page.waitForTimeout(350);
      const p1 = await probe(page);
      if (p1.selFocus) found.selFocus.add(`${lab} → ${p1.selFocus}`);
      if (p1.off.length) found.off.add(`${lab}: ${p1.off[0]}`);
      if (p1.hscroll) found.hscroll.add(lab);
      if (p1.crop && !p1.cropTool && ed.key === 'image') found.crop.add(lab);
      await page.keyboard.press('Escape'); await page.waitForTimeout(150); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
      for (const d of await page.locator('.dialog button:text-is("Cancel"), dialog button:text-is("Cancel")').all()) await d.click().catch(() => {});
      const p2 = await probe(page); if (p2.pops) found.stuck.add(lab);
      if (p2.crop && !p2.cropTool && ed.key === 'image') found.crop.add(`${lab} (after Escape)`);
    }
    // the ⋯ "More tools" panel (phone and narrow screens): open it, then each button inside it, reopening the panel every time
    const more = page.locator('button[aria-label="More formatting tools"]:visible').first();
    if (await more.count()) {
      const openMore = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(150); if (v.name === 'phone') await more.tap(); else await more.click(); await page.waitForTimeout(400); };
      await openMore(); const pm = await probe(page); if (pm.selFocus) found.selFocus.add(`More tools → ${pm.selFocus}`);
      const inner = await page.evaluate(() => [...document.querySelectorAll('.dx-pop button')].filter((x) => !x.disabled && x.offsetParent).map((x) => x.getAttribute('aria-label') || x.title || (x.textContent || '').trim()).filter(Boolean));
      for (const lab of [...new Set(inner)]) {
        if (SKIP.test(lab)) continue; await openMore();
        const ok = await page.evaluate((lab) => { const x = [...document.querySelectorAll('.dx-pop button')].find((x) => (x.getAttribute('aria-label') || x.title || (x.textContent || '').trim()) === lab); if (x) x.setAttribute('data-sw', '2'); return !!x; }, lab);
        if (!ok) continue; try { if (v.name === 'phone') await page.locator('[data-sw="2"]').tap({ timeout: 2000 }); else await page.locator('[data-sw="2"]').click({ timeout: 2000 }); } catch { continue; }
        await page.waitForTimeout(350); const p1 = await probe(page);
        if (p1.selFocus) found.selFocus.add(`More › ${lab} → ${p1.selFocus}`); if (p1.off.length) found.off.add(`More › ${lab}: ${p1.off[0]}`); if (p1.hscroll) found.hscroll.add(`More › ${lab}`);
        await page.keyboard.press('Escape'); await page.waitForTimeout(150); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
        if ((await probe(page)).pops) found.stuck.add(`More › ${lab}`);
      }
      console.log(`      (${ed.key} ${v.name}: ${inner.length} buttons in More tools)`);
    }
    // image: crop, apply, then the box must be gone
    if (ed.key === 'image') {
      await page.goto(`${base}/${ed.hash}`); await page.waitForSelector(ed.ready, { timeout: 20000 }); await page.waitForTimeout(800);
      await page.keyboard.press('c'); await page.waitForTimeout(300);
      const apply = page.getByRole('button', { name: 'Apply crop' }).first(); if (await apply.isVisible().catch(() => false)) { try { await apply.click({ timeout: 3000 }); } catch { found.stuck.add('Apply crop is covered by an open menu'); } await page.waitForTimeout(400); }
      const after = await probe(page); check(`${id}-cr`, `${ed.key} ${v.name}: after "Apply crop" the crop box is gone`, !after.crop, JSON.stringify(after));
    }
    // menus: open each, check it fits on screen, close it
    const tops = await page.locator('.edx-mb:visible, .dx-menurow button:visible, .sx-menubar button:visible').allInnerTexts().catch(() => []);
    for (const t of tops.slice(0, 10)) {
      const m = page.locator('.edx-mb:visible, .dx-menurow button:visible, .sx-menubar button:visible').filter({ hasText: t }).first();
      try { if (v.name === 'phone') await m.tap({ timeout: 1500 }); else await m.click({ timeout: 1500 }); } catch { continue; }
      await page.waitForTimeout(300); const p1 = await probe(page); if (p1.off.length) found.off.add(`menu ${t}: ${p1.off[0]}`); if (p1.selFocus) found.selFocus.add(`menu ${t}`);
      await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    }
    const cut = await clipped(page, `${ed.bars}, .edx-top, .sx-topbar, .dx-top, .doctop, header`);
    check(`${id}-s1`, `${ed.key} ${v.name}: no dropdown list opens by itself when a button or menu is pressed`, !found.selFocus.size, [...found.selFocus].join('; '));
    check(`${id}-s2`, `${ed.key} ${v.name}: no script errors`, !errors.length, errors.slice(0, 3).join(' | '));
    check(`${id}-s3`, `${ed.key} ${v.name}: the page never scrolls sideways`, !found.hscroll.size, [...found.hscroll].slice(0, 6).join('; '));
    check(`${id}-s4`, `${ed.key} ${v.name}: no button label is cut off`, !cut.length, cut.slice(0, 6).join('; '));
    check(`${id}-s5`, `${ed.key} ${v.name}: nothing stays on screen after Escape (popovers, menus, crop box)`, !found.stuck.size && !found.crop.size, [...found.stuck, ...found.crop].slice(0, 6).join('; '));
    check(`${id}-s6`, `${ed.key} ${v.name}: menus and popovers fit on the screen`, !found.off.size, [...found.off].slice(0, 6).join('; '));
    console.log(`      (${ed.key} ${v.name}: ${labels.length} buttons, ${tops.length} menus)`);
    await ctx.close();
  }
}
await b.close(); await s.close?.(); await fake.close?.(); await admin.end();
console.log(`\n${passes}/${passes + fails.length} checks passed`); process.exit(fails.length ? 1 : 0);
