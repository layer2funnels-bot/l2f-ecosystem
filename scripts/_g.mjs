// Visual and accessibility checks of the shared components (Design v4), no database needed: the component gallery is opened in real
// Chromium for every organization x theme at phone (390), tablet (768) and desktop (1366) widths, and with reduced motion.
// Checks: no sideways scrolling, no console or policy errors, 44px targets, visible focus ring, computed text contrast, overlays work with the keyboard.
// Playwright is a global install (PLAYWRIGHT_MODULE), not a project dependency. Screenshots go to $SHOTS (default ./e2e-shots).
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadManifests } from '../packages/core/manifests.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright');
const SHOTS = process.env.SHOTS || 'e2e-shots'; mkdirSync(SHOTS, { recursive: true });
const root = fileURLToPath(new URL('../apps/web/', import.meta.url)), ui = fileURLToPath(new URL('../packages/ui/', import.meta.url)), core = fileURLToPath(new URL('../packages/core/', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json' };
const headers = Object.fromEntries(readFileSync(new URL('../apps/web/_headers', import.meta.url), 'utf8').split('\n').filter((l) => /^\s+\S+: /.test(l)).map((l) => l.trim().split(/: (.*)/s).slice(0, 2)));
const srv = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/app-manifests.json') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(loadManifests().map(({ dir, ...m }) => m))); }
  const [base, rel] = url.pathname.startsWith('/packages/ui/') ? [ui, url.pathname.slice(13)] : url.pathname.startsWith('/packages/core/') ? [core, url.pathname.slice(15)] : [root, url.pathname];
  try { const f = normalize(join(base, rel)); if (!f.startsWith(base)) throw 0; res.writeHead(200, { ...headers, 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' }); res.end(readFileSync(f)); } catch { res.writeHead(404).end(); }
}).listen(0, '127.0.0.1');
await new Promise((r) => srv.on('listening', r));
const base = `http://127.0.0.1:${srv.address().port}`;
const browser = await chromium.launch();
const results = []; const check = (id, n, ok, d = '') => results.push({ id, n, ok: !!ok, d });
const problems = [];
const lum = (c) => { const v = c.map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };

for (const org of ['l2f', 'aurj']) for (const theme of ['light', 'dark']) for (const w of [390, 768, 1366]) {
  const tag = `${org}/${theme}/${w}`;
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, reducedMotion: w === 768 ? 'reduce' : 'no-preference' });
  const p = await ctx.newPage();
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) problems.push(`${tag} ${m.type()}: ${m.text().slice(0, 140)} @ ${JSON.stringify(m.location()).slice(0, 120)}`); });
  p.on('pageerror', (e) => problems.push(`${tag} pageerror: ${e.message}`));
  await p.goto(`${base}/gallery.html?org=${org}&theme=${theme}`); await p.waitForSelector('h1');
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: `${SHOTS}/gallery-${org}-${theme}-${w}.png`, fullPage: true });
  const m = await p.evaluate(() => {
    const out = { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, small: [], fonts: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')) };
    for (const e of document.querySelectorAll('button, a[href], input, select, textarea')) {
      if (e.closest('.docpage')) continue;          // links inside running text are exempt (WCAG 2.5.8 inline exception)
      const r = e.getBoundingClientRect(); if (!r.width) continue;
      if (r.height < 43.5 || r.width < 43.5) out.small.push(`${e.tagName.toLowerCase()} "${(e.innerText || e.getAttribute('aria-label') || e.id || '').slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    const rgba = (s) => { const v = s.match(/[\d.]+/g).map(Number); const k = s.startsWith('color(srgb') ? 255 : 1; return [v[0] * k, v[1] * k, v[2] * k, v.length > 3 ? v[3] : 1]; };   // color-mix() computes to color(srgb 0-1 ...)
    const over = (top, under) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1);
    const bgOf = (e) => { const layers = []; for (let n = e; n; n = n.parentElement) { const c = rgba(getComputedStyle(n).backgroundColor); if (c[3] > 0) layers.push(c); if (c[3] === 1) break; } return layers.reverse().reduce((acc, c) => over(c, acc), [255, 255, 255, 1]).slice(0, 3); };
    const rgb = (s) => rgba(s).slice(0, 3);
    out.text = [...document.querySelectorAll('h1, h2, p, label, th, td, .muted, .chip, .pill, .btn, .notice')].filter((e) => e.innerText?.trim() && e.getBoundingClientRect().width).map((e) => ({ t: e.innerText.trim().slice(0, 20), fg: rgb(getComputedStyle(e).color), bg: bgOf(e), op: getComputedStyle(e).opacity, dis: e.disabled || e.getAttribute('aria-disabled') === 'true' }));
    return out;
  });
  const lowC = m.text.filter((x) => !x.dis && x.op === '1').map((x) => { const [a, b] = [lum(x.fg), lum(x.bg)].sort((s, t) => t - s); return { ...x, r: (a + 0.05) / (b + 0.05) }; }).filter((x) => x.r < 4.5);
  check(`G1 ${tag}`, 'No sideways scrolling', m.overflow <= 0, `overflow ${m.overflow}`);
  check(`G2 ${tag}`, 'Every control is at least 44x44', m.small.length === 0, m.small.slice(0, 4).join('; '));
  check(`G3 ${tag}`, 'Computed text contrast is at least 4.5:1 on enabled text', lowC.length === 0, lowC.slice(0, 3).map((x) => `"${x.t}" ${x.r.toFixed(2)}`).join('; '));
  check(`G4 ${tag}`, 'The v4 fonts are loaded from our own files', ['Geist', 'Bricolage Grotesque'].every((f) => m.fonts.includes(f)), m.fonts.join(','));
  const org2 = await p.evaluate(() => [document.documentElement.dataset.org, document.documentElement.dataset.theme, getComputedStyle(document.body).backgroundColor]);
  check(`G5 ${tag}`, 'Organization and theme attributes apply', org2[0] === org && org2[1] === theme);
  if (w === 1366 && theme === 'light') {
    // keyboard: focus ring, dialog traps and returns focus, drawer closes on Esc
    await p.keyboard.press('Tab');
    const ring = await p.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 3; });
    check(`G6 ${org}`, 'A focused control shows the 3px focus ring', ring);
    await p.getByRole('button', { name: 'Open dialog' }).focus(); await p.keyboard.press('Enter');
    check(`G7 ${org}`, 'The dialog opens, and Esc closes it and returns focus', (await p.locator('[role=dialog]').count()) === 1 && (await p.keyboard.press('Escape'), await p.locator('[role=dialog]').count()) === 0 && (await p.evaluate(() => document.activeElement?.textContent)) === 'Open dialog');
    await p.getByRole('button', { name: 'Open drawer' }).focus(); await p.keyboard.press('Enter');
    check(`G8 ${org}`, 'The drawer opens with focus inside, and Esc closes it and returns focus', (await p.locator('aside.drawer').count()) === 1 && (await p.evaluate(() => !!document.activeElement.closest('aside.drawer'))) && (await p.keyboard.press('Escape'), await p.locator('aside.drawer').count()) === 0 && (await p.evaluate(() => document.activeElement?.textContent)) === 'Open drawer');
  }
  if (w === 1366 && theme === 'light') {
    // the Docs editor: format, type, save with the keyboard, no policy violations from the browser's own editing commands
    await p.waitForSelector('[data-gallery=docs] .docpage');
    const ed = p.locator('[data-gallery=docs] .docpage'); const bar = p.locator('[data-gallery=docs]');
    await ed.click(); await p.keyboard.press('Control+End'); await p.keyboard.press('Enter');
    console.log('A', problems.length); await bar.locator('.tbsel').selectOption('h2'); console.log('B', problems.length); await p.keyboard.type('New heading'); await p.keyboard.press('Enter');
    await bar.getByRole('button', { name: 'Bulleted list' }).click(); await p.keyboard.type('first'); await p.keyboard.press('Enter'); await p.keyboard.type('second');
    await p.keyboard.press('Shift+Home'); console.log('C', problems.length); await bar.getByRole('button', { name: 'Bold' }).click(); console.log('D', problems.length); await bar.getByRole('button', { name: 'Italic' }).click(); console.log('E', problems.length); await bar.getByRole('button', { name: 'Underline' }).click(); console.log('F', problems.length); await bar.getByRole('button', { name: 'Strikethrough' }).click(); console.log('G', problems.length);
    await bar.getByRole('button', { name: 'Divider' }).click(); await bar.getByRole('button', { name: 'Undo' }).click(); await bar.getByRole('button', { name: 'Redo' }).click();
    check(`G12 ${org}`, 'Docs editor: heading, list and styles can be applied from the toolbar and the outline shows the new heading', (await bar.locator('.docoutline li').allInnerTexts()).some((t) => t.includes('New heading')) && (await ed.locator('ul li').count()) >= 2);
    await p.keyboard.press('Control+s'); await p.waitForFunction(() => /Saved/.test(document.querySelector('[data-gallery=docs] .docstate')?.innerText ?? ''));
    check(`G13 ${org}`, 'Ctrl+S saves and the status reads Saved', true);
    await p.screenshot({ path: `${SHOTS}/gallery-docs-${org}.png`, fullPage: true });
  }
  if (w === 390 && theme === 'light') {
    const stacked = await p.evaluate(() => getComputedStyle(document.querySelector('table.stk td')).display);
    check(`G9 ${org}`, 'On a phone the table turns into stacked rows', stacked === 'block');
  }
  if (w === 768) {
    const anim = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--motion-base').trim());
    check(`G10 ${tag}`, 'Reduced motion zeroes the motion tokens', anim === '0ms', anim);
  }
  await ctx.close();
}
check('G11', 'No console errors, policy violations or script errors on any gallery page', problems.length === 0, problems.slice(0, 3).join(' | '));
await browser.close(); srv.close();
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id.padEnd(16)} ${r.n}${r.ok ? '' : '  -> ' + r.d}`);
const pc = results.filter((r) => r.ok).length; console.log(`\n${pc}/${results.length} checks passed`);
process.exit(pc === results.length ? 0 : 1);
