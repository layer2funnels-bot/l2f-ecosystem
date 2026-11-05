// The public viewer for share links (#/s/<token>): no sign-in, no app navigation, read-only. It asks the one public endpoint for the file, then shows
// documents and spreadsheets from their text (rendered by building DOM nodes, never from HTML), pictures, video, audio and PDFs from short-lived storage
// addresses, and anything else as a download. Every failure reads the same: the link does not work (expired, withdrawn, or never existed).
import { h, put, icon } from '../ui.js';
import { parseBody, flatTabs, contentOf } from './docmodel.js';
import { renderBlocks } from './docdom.js';
import { parseBook, createCalc, cellText, usedRange, colName, MIME as SHEET_MIME } from './sheetmodel.js';
import { DOC_MIME, fileType, formatSize } from './driveutil.js';

const BRANDS = { l2f: 'Layer2Funnels', aurj: 'Aurj' };
const MAX_ROWS = 300, MAX_COLS = 40;

function docBody(text) {
  const doc = parseBody(text); const tabs = flatTabs(doc); const page = h('div', { class: 'docpage dx-doc pv-docpage' }); let cur = tabs[0]?.tab.id;
  const paint = () => { renderBlocks(page, contentOf(doc, cur).blocks); for (const f of page.querySelectorAll('.dx-img')) f.hidden = true; for (const a of page.querySelectorAll('a')) { a.target = '_blank'; a.rel = 'noopener noreferrer nofollow'; } };
  const strip = tabs.length > 1 ? h('div', { class: 'pv-tabs', role: 'tablist', 'aria-label': 'Document tabs' }, ...tabs.map(({ tab, depth }) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(tab.id === cur), style: `--d:${depth}`, onclick: (e) => { cur = tab.id; strip.querySelectorAll('[role=tab]').forEach((b) => b.setAttribute('aria-selected', String(b === e.currentTarget))); paint(); } }, tab.title || 'Untitled'))) : null;
  paint(); return h('div', { class: 'pv-doc' }, strip, page);
}
function sheetBody(text) {
  const book = parseBook(text); const calc = createCalc(book); let cur = 0; const wrap = h('div', { class: 'pv-sheet tblwrap' });
  const paint = () => {
    const s = book.sheets[cur]; const u = usedRange(s); if (!u) return put(wrap, h('p', { class: 'muted' }, 'This sheet is empty.'));
    const c2 = Math.min(u.c2, MAX_COLS - 1), r2 = Math.min(u.r2, MAX_ROWS - 1);
    const head = h('tr', {}, h('th', { scope: 'col', class: 'corner' }), ...Array.from({ length: c2 + 1 }, (_, c) => h('th', { scope: 'col' }, colName(c))));
    const body = Array.from({ length: r2 + 1 }, (_, r) => h('tr', {}, h('th', { scope: 'row' }, String(r + 1)), ...Array.from({ length: c2 + 1 }, (_, c) => { const t = cellText(book, cur, calc, c, r); return h('td', { class: /^-?[\d.,%$€£ ]+$/.test(t) && t.trim() ? 'num' : '' }, t); })));
    put(wrap, h('table', { class: 'pv-table' }, h('thead', {}, head), h('tbody', {}, ...body)), (u.r2 > r2 || u.c2 > c2) ? h('p', { class: 'fine muted' }, `Showing the first ${MAX_ROWS} rows and ${MAX_COLS} columns.`) : null);
  };
  const strip = book.sheets.length > 1 ? h('div', { class: 'pv-tabs', role: 'tablist', 'aria-label': 'Sheets' }, ...book.sheets.map((s, i) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(i === 0), onclick: (e) => { cur = i; strip.querySelectorAll('[role=tab]').forEach((b) => b.setAttribute('aria-selected', String(b === e.currentTarget))); paint(); } }, s.name))) : null;
  paint(); return h('div', {}, strip, wrap);
}
function fileBody(d) {
  const ty = fileType(d); const save = d.download_url ? h('a', { class: 'btn primary', href: d.download_url, rel: 'noopener' }, icon('download'), 'Download') : null;
  if (ty.key === 'image' && d.url) return h('div', { class: 'pv-media' }, h('img', { class: 'pv-img', src: d.url, alt: d.name }));
  if (ty.key === 'pdf' && d.url) return h('div', { class: 'pv-pdf' }, h('iframe', { title: d.name, src: d.url }), h('p', { class: 'fine muted' }, 'If the PDF does not show, ', h('a', { href: d.download_url ?? d.url, rel: 'noopener' }, 'download it'), '.'));
  if (ty.key === 'video' && d.url) return h('div', { class: 'pv-media' }, h('video', { controls: true, preload: 'metadata', src: d.url, class: 'pv-vid' }));
  if (ty.key === 'audio' && d.url) return h('div', { class: 'pv-media' }, h('audio', { controls: true, src: d.url }));
  return h('div', { class: 'pv-card' }, h('span', { class: `ftile ft-${ty.key}`, 'aria-hidden': 'true' }, icon('doc')), h('h2', {}, d.name), h('p', { class: 'muted' }, [ty.name, formatSize(d.size_bytes)].filter(Boolean).join(' · ')), save);
}

export function publicView({ token }) {
  const root = h('section', { class: 'pv' }); const main = h('main', { class: 'pv-main', id: 'main' }, h('p', { class: 'muted', role: 'status' }, 'Opening…'));
  const brand = h('span', { class: 'pv-brand' }, 'Shared via Layer2Funnels'); const title = h('h1', { class: 'pv-title', 'data-page-title': true }); const acts = h('div', { class: 'pv-acts' });
  put(root, h('header', { class: 'pv-top' }, h('span', { class: 'pv-mark', 'aria-hidden': 'true' }, 'L2'), h('div', { class: 'pv-head' }, brand, title), acts), main,
    h('footer', { class: 'pv-foot fine' }, h('span', { class: 'pv-foot-b' }, 'Shared via Layer2Funnels'), ' · A read-only view. Nothing here can be changed.'));
  const fail = () => { title.textContent = 'This link doesn’t work'; document.title = 'Link not available'; put(main, h('div', { class: 'pv-card' }, icon('lock'), h('h2', {}, 'This link doesn’t work'), h('p', { class: 'muted' }, 'It may have expired or been withdrawn by the person who shared it, or it may be mistyped. Ask them for a new link.'))); };
  (async () => {
    let r; try { r = await fetch(`/api/public/link?t=${encodeURIComponent(token)}`, { headers: { accept: 'application/json' }, cache: 'no-store' }); } catch { return put(main, h('div', { class: 'pv-card' }, h('h2', {}, 'Could not load'), h('p', { class: 'muted' }, 'Check your internet connection and reload this page.'))); }
    if (r.status === 429) return put(main, h('div', { class: 'pv-card' }, h('h2', {}, 'Too many visits'), h('p', { class: 'muted' }, 'Please wait a minute and reload this page.')));
    let j = null; try { j = await r.json(); } catch { /* not json */ }
    const d = r.ok && j?.ok ? j.data?.[0] : null; if (!d) return fail();
    const name = BRANDS[d.brand] ?? 'Layer2Funnels'; document.documentElement.dataset.org = d.brand === 'aurj' ? 'aurj' : 'l2f';
    brand.textContent = `Shared via ${name}`; root.querySelector('.pv-foot-b').textContent = `Shared via ${name}`; root.querySelector('.pv-mark').textContent = d.brand === 'aurj' ? 'Au' : 'L2';
    title.textContent = d.name; document.title = `${d.name} · Shared via ${name}`;
    if (d.download_url) put(acts, h('a', { class: 'btn ghost', href: d.download_url, rel: 'noopener' }, icon('download'), 'Download'));
    try {
      if (d.mime_type === DOC_MIME && d.body != null) put(main, docBody(d.body));
      else if (d.mime_type === SHEET_MIME && d.body != null) put(main, sheetBody(d.body));
      else if (d.body != null) put(main, h('pre', { class: 'pv-text' }, String(d.body).slice(0, 200000)));
      else put(main, fileBody(d));
    } catch { put(main, h('div', { class: 'pv-card' }, h('h2', {}, 'This file can’t be shown here'), h('p', { class: 'muted' }, 'Ask the person who shared it to send it another way.'))); }
  })();
  return root;
}
