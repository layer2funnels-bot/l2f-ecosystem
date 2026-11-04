// PDF viewer and editor for stored Drive files (application/pdf).
//   Reading and drawing pages: pdf.js (Apache-2.0), loaded on demand from /media/pdfjs.js with its worker /media/pdf.worker.js (self-hosted, built by scripts/build-media.mjs).
//   Writing: pdf-lib (MIT), loaded on demand from /media/pdflib.js. Edits (text, highlight, rectangle, drawing, signature, pictures) are kept as a small list per page
//   on screen and written into a new PDF only when the person saves or downloads. Page operations (delete, reorder, rotate, merge, extract) work on a page list.
//   Save = a new version of the same Drive file (checked against the version the editor started from); Save as copy = a new Drive file. The original stays untouched until then.
// Pure helpers (page operations, ranges, coordinate transforms, drawing plans): mediamodel.js.
import { h, icon, toast, dialog, btn, notice, skeleton, errorState, noAccessState, readOnlyNotice } from '../ui.js';
import { dirty } from '../dirty.js';
import * as M from './mediamodel.js';
import { readStored, saveVersion, saveCopy, downloadBlob, versionsDrawer } from './mediaio.js';
import { menuBar, topBar, backFor } from './edchrome.js';

const BASE = '/media/';
let libs = null, libsP = null, pdfjsP = null;
const loadPdfjs = () => (pdfjsP ??= import(`${BASE}pdfjs.js`).then((m) => { m.GlobalWorkerOptions.workerSrc = `${BASE}pdf.worker.js`; return m; }).catch((e) => { pdfjsP = null; throw e; }));
const loadLib = () => (libsP ??= import(`${BASE}pdflib.js`).then((m) => (libs = m)).catch((e) => { libsP = null; throw e; }));
const MAX_BYTES = 80e6;
const timeOf = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const aid = () => `a${Math.random().toString(36).slice(2, 9)}`;
const TOOL_LIST = [['select', 'cursor', 'Select'], ['text', 'text', 'Text'], ['hl', 'sticky', 'Highlight'], ['rect', 'shape', 'Rectangle'], ['pen', 'edit', 'Draw'], ['sign', 'user', 'Signature'], ['img', 'imgI', 'Picture'], ['redact', 'lock', 'Redact']];
const KEYS = { select: 'V', text: 'T', hl: 'H', rect: 'R', pen: 'D', sign: 'S', img: 'I', redact: 'X' };
const mk = (w, hh) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(hh)); return c; };
const measure = (a) => { const c = mk(1, 1).getContext('2d'); c.font = `${a.bold ? 'bold ' : ''}${a.size}px Helvetica, Arial, sans-serif`; const lines = String(a.text).split('\n'); return { w: Math.max(...lines.map((l) => c.measureText(l).width)), h: lines.length * a.size * 1.2 }; };
const b64ToBytes = (dataUrl) => { const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1)); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };
const hex = (s) => s;                                               // colours stay as #rrggbb strings in the model

/** Executes the drawing commands of mediamodel.planAnnotation with pdf-lib. */
async function paint(out, page, ox, oy, cmds, fonts, embedded) {
  const { rgb, degrees, BlendMode, LineCapStyle } = libs; const col = (c) => rgb(c[0], c[1], c[2]);
  for (const c of cmds) {
    if (c.op === 'rect') page.drawRectangle({ x: c.x + ox, y: c.y + oy, width: c.w, height: c.h, rotate: degrees(c.rotate || 0), opacity: c.opacity ?? 1, ...(c.fill ? { color: col(c.fill) } : {}), ...(c.border ? { borderColor: col(c.border), borderWidth: c.borderWidth || 1, borderOpacity: 1 } : {}), ...(c.multiply ? { blendMode: BlendMode.Multiply } : {}) });
    else if (c.op === 'line') page.drawLine({ start: { x: c.x1 + ox, y: c.y1 + oy }, end: { x: c.x2 + ox, y: c.y2 + oy }, thickness: c.width, color: col(c.color), lineCap: LineCapStyle.Round });
    else if (c.op === 'text') {
      const font = c.bold ? fonts.bold : fonts.reg; let txt = c.text; try { font.encodeText(txt); } catch { txt = [...txt].map((ch) => { try { font.encodeText(ch); return ch; } catch { return '?'; } }).join(''); }
      page.drawText(txt, { x: c.x + ox, y: c.y + oy, size: c.size, font, color: col(c.color), rotate: degrees(c.rotate || 0), opacity: c.opacity ?? 1 });
    } else if (c.op === 'image') {
      let img = embedded.get(c.src); if (!img) { const bytes = b64ToBytes(c.src); img = c.mime === 'image/jpeg' ? await out.embedJpg(bytes) : await out.embedPng(bytes); embedded.set(c.src, img); }
      page.drawImage(img, { x: c.x + ox, y: c.y + oy, width: c.w, height: c.h, rotate: degrees(c.rotate || 0), opacity: c.opacity ?? 1 });
    }
  }
}

export function pdfView({ api, id, ctx }) {
  const root = h('section', { class: 'px ed-full', 'aria-label': 'PDF viewer' }, skeleton(4));
  const gone = () => !root.isConnected;
  const load = async () => {
    const f = await api.call('drive.files.get', { id });
    if (!ctx.live()) return;
    if (!f.ok) { root.replaceChildren(f.status === 404 ? noAccessState({ action: h('a', { class: 'btn', href: '#/launcher' }, 'Back to the Launcher') }) : errorState(() => { root.replaceChildren(skeleton(4)); load(); })); return; }
    const file = f.data[0];
    const empty = (msg, extra) => root.replaceChildren(h('div', { class: 'empty', role: 'status' }, icon('doc'), h('h2', { 'data-page-title': true }, file.name), h('p', { class: 'muted' }, msg), extra ?? null, h('a', { class: 'btn', href: '#/drive' }, 'Back to Drive')));
    if (file.kind !== 'file' || !M.isPdfMime(file.mime_type)) return empty('This file is not a PDF.');
    if (file.size_bytes > MAX_BYTES) return empty('This PDF is larger than 80 MB, which is too big to open in the browser. You can download it from Drive.');
    let pdfjs; try { pdfjs = await loadPdfjs(); } catch { return empty('The PDF tools are not part of this build yet. You can still download the file from Drive.'); }
    const got = await readStored(api, id);
    if (!ctx.live()) return;
    if (got.error) { root.replaceChildren(errorState(() => { root.replaceChildren(skeleton(4)); load(); }, { title: 'We couldn’t open this PDF', body: 'Your file is safe. Check your connection and try again.' })); return; }
    const bytes = new Uint8Array(await got.blob.arrayBuffer());
    let doc; try { doc = await pdfjs.getDocument({ data: bytes.slice(), cMapUrl: `${BASE}cmaps/`, cMapPacked: true, standardFontDataUrl: `${BASE}standard_fonts/`, isEvalSupported: false, useSystemFonts: false }).promise; }
    catch (e) { return empty(e?.name === 'PasswordException' ? 'This PDF is password protected, so it can’t be opened here. Remove the password and upload it again.' : 'This PDF could not be read. It may be damaged.'); }
    if (!ctx.live()) return;
    mount(file, pdfjs, bytes, doc, got.version ?? file.current_version);
  };

  function mount(file, pdfjs, bytes0, doc0, firstVersion) {
    const readOnly = Boolean(file.archived_at) || !(ctx.can('drive.file.upload', file.client_id) || file.my_role === 'editor');
    let meta = file, version = firstVersion, savedAt = file.updated_at, status = readOnly ? 'readonly' : 'saved', saving = false;
    const srcs = [{ bytes: bytes0, doc: doc0, name: file.name, count: doc0.numPages }];          // source 0 is this file; merged files are added after it
    let S = { pages: M.initialPages(doc0.numPages, 0), ann: {}, form: {}, deco: {}, rev: 0 }; let rev = 0, savedRev = 0;
    const hist = M.createHistory(S);
    const st = { tool: 'select', zoom: 'width', viewRot: 0, sel: null, checked: new Set(), cur: 0, q: '', matches: [], mi: -1, color: '#111111', hlColor: '#fde047', size: 14, line: 2, drawColor: '#d33a2c', sidebar: window.innerWidth >= 900, gen: 0 };
    const pageInfo = new Map();            // `${src}:${i}` -> { w, h, rotate } at scale 1 (unrotated by the editor)
    const textCache = new Map();           // `${src}:${i}` -> text items
    const pageEls = [];                    // [{ el, uid, rebuild, paintHits, ann }]

    // ---------------------------------------------------------------- history of edits (pages + annotations)
    const dirtyNow = () => !readOnly && S.rev !== savedRev;
    function commit(next, { rebuild = false } = {}) { rev += 1; S = { ...next, rev }; hist.push(S); changed(); rebuild ? buildPages() : repaintAnn(); if (rebuild) buildThumbs(); }
    function jump(to) { S = to; st.sel = null; st.checked.clear(); changed(); buildPages(); buildThumbs(); }
    const undo = () => { if (hist.canUndo()) jump(hist.undo()); }, redo = () => { if (hist.canRedo()) jump(hist.redo()); };
    const warn = (e) => { if (status === 'dirty' || status === 'failed') { e.preventDefault(); e.returnValue = ''; } };
    function changed() {
      undoB.disabled = readOnly || !hist.canUndo(); redoB.disabled = readOnly || !hist.canRedo();
      if (!readOnly && !saving && status !== 'failed') { const was = status; status = dirtyNow() ? 'dirty' : 'saved'; if (status === 'dirty' && was !== 'dirty') { dirty.set(meta.name, () => save()); window.addEventListener('beforeunload', warn); } if (status === 'saved') { dirty.clear(); window.removeEventListener('beforeunload', warn); } }
      const t = { saved: `Saved ${timeOf(savedAt)}`, dirty: 'Unsaved changes', saving: 'Saving…', failed: 'Couldn’t save. Your changes are still here.', readonly: 'Read only' }[status];
      statusEl.replaceChildren(...[h('span', { class: `dot ${status}` }), t, status === 'failed' ? btn('Retry', () => save(), 'link') : null].filter(Boolean));
      saveBtn.disabled = readOnly || status === 'saved' || saving;
      pageNum.max = String(S.pages.length); total.textContent = `of ${S.pages.length}`; paintSize();
    }

    // ---------------------------------------------------------------- page geometry
    async function infoOf(entry) {
      if (entry.src === -1) return { w: entry.blank.w, h: entry.blank.h, rotate: 0 };
      const key = `${entry.src}:${entry.i}`; let v = pageInfo.get(key);
      if (!v) { const p = await srcs[entry.src].doc.getPage(entry.i + 1); const vp = p.getViewport({ scale: 1, rotation: 0 }); v = { w: vp.width, h: vp.height, rotate: p.rotate || 0 }; pageInfo.set(key, v); }
      return v;
    }
    const shown = (entry, v) => M.displaySize(v.w, v.h, M.effectiveRotation(v.rotate, entry.rot));     // annotation space: the page with the editor's turn, without the view turn
    function pageScale(sz) {
      const box = scroller.clientWidth - 32; const hgt = scroller.clientHeight - 24;
      const wShown = st.viewRot % 180 ? sz.h : sz.w, hShown = st.viewRot % 180 ? sz.w : sz.h;
      if (typeof st.zoom === 'number') return st.zoom;
      return st.zoom === 'page' ? Math.max(0.2, Math.min(box / wShown, hgt / hShown)) : Math.max(0.2, Math.min(4, box / wShown));
    }

    // ---------------------------------------------------------------- pieces of the page
    const statusEl = h('span', { class: 'docstate', role: 'status', 'aria-live': 'polite' });
    const scroller = h('div', { class: 'px-scroll', tabindex: '0', 'aria-label': 'Pages. Plus and minus zoom; Page Up and Page Down move between pages.' });
    const pagesEl = h('div', { class: 'px-pages' }); scroller.append(pagesEl);
    const thumbs = h('div', { class: 'px-thumbs', role: 'list', 'aria-label': 'Pages' });
    const side = h('aside', { class: 'px-side', 'aria-label': 'Page thumbnails and page tools' });
    const undoB = btn([icon('undo'), h('span', { class: 'sr' }, 'Undo')], () => undo(), 'ix-ic', { title: 'Undo (Ctrl+Z)' });
    const redoB = btn([icon('redo'), h('span', { class: 'sr' }, 'Redo')], () => redo(), 'ix-ic', { title: 'Redo (Ctrl+Shift+Z)' });
    const saveBtn = btn('Save', () => save(), 'primary');
    const pageNum = h('input', { class: 'px-pn', type: 'number', min: '1', value: '1', 'aria-label': 'Page number' });
    const total = h('span', { class: 'fine muted' }, `of ${S.pages.length}`);
    const zoomSel = h('select', { class: 'tbsel', 'aria-label': 'Zoom' }, ...[['width', 'Fit width'], ['page', 'Fit page'], ['0.5', '50%'], ['0.75', '75%'], ['1', '100%'], ['1.25', '125%'], ['1.5', '150%'], ['2', '200%'], ['3', '300%']].map(([v, t]) => h('option', { value: v }, t)));
    const searchIn = h('input', { class: 'px-search', type: 'search', placeholder: 'Find in document', 'aria-label': 'Find in document' });
    const hitInfo = h('span', { class: 'fine muted px-hits', role: 'status', 'aria-live': 'polite' });
    const sizeEl = h('span', { class: 'fine muted px-size' });
    const paintSize = () => { sizeEl.textContent = `${M.fmtBytes(meta.size_bytes)}${S.pages.length ? ` · ${S.pages.length} page${S.pages.length === 1 ? '' : 's'}` : ''}`; };
    const crumb = h('nav', { class: 'fpath fine', 'aria-label': 'Where this PDF lives' }, h('a', { href: '#/drive' }, 'Drive'), h('span', { 'aria-hidden': 'true' }, ' / '), meta.space === 'personal' ? 'Personal' : ctx.orgName);

    // ---------------------------------------------------------------- building the page column
    const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) e.target.__render?.(); }, { root: scroller, rootMargin: '700px 0px' }) : null;
    let curObs = null;
    async function buildPages() {
      const gen = ++st.gen; const keep = scroller.scrollTop / Math.max(1, scroller.scrollHeight);
      pagesEl.replaceChildren(); pageEls.length = 0; curObs?.disconnect();
      const frag = document.createDocumentFragment();
      for (let k = 0; k < S.pages.length; k++) {
        const entry = S.pages[k]; const v = await infoOf(entry); if (gen !== st.gen || gone()) return;
        const sz = shown(entry, v); const scale = pageScale(sz); const rot = (M.effectiveRotation(v.rotate, entry.rot) + st.viewRot) % 360;
        const W = (st.viewRot % 180 ? sz.h : sz.w) * scale, H = (st.viewRot % 180 ? sz.w : sz.h) * scale;
        const canvas = h('canvas', { class: 'px-cv', 'aria-hidden': 'true' }), textLayer = h('div', { class: 'px-text textLayer' }), hits = h('div', { class: 'px-hitlayer', 'aria-hidden': 'true' }), formEl = h('div', { class: 'px-forms' });
        const annEl = h('div', { class: 'px-ann' });
        const el = h('div', { class: 'px-page', 'data-k': String(k), role: 'group', 'aria-label': `Page ${k + 1} of ${S.pages.length}` }, canvas, textLayer, hits, formEl, annEl);
        el.style.width = `${Math.round(W)}px`; el.style.height = `${Math.round(H)}px`;
        // the annotation layer lives in the page's own space and is turned with the view
        annEl.style.width = `${Math.round(sz.w * scale)}px`; annEl.style.height = `${Math.round(sz.h * scale)}px`; annEl.style.transformOrigin = '0 0';
        annEl.style.transform = st.viewRot === 90 ? `translate(${Math.round(sz.h * scale)}px,0) rotate(90deg)` : st.viewRot === 180 ? `translate(${Math.round(sz.w * scale)}px,${Math.round(sz.h * scale)}px) rotate(180deg)` : st.viewRot === 270 ? `translate(0,${Math.round(sz.w * scale)}px) rotate(270deg)` : 'none';
        const rec = { el, uid: entry.uid, k, scale, sz, rot, entry, annEl, canvas, textLayer, hits, formEl, done: false };
        el.__render = () => renderPage(rec, gen); pageEls.push(rec); frag.append(el); io?.observe(el);
        paintAnn(rec); wireAnn(rec);
      }
      if (gen !== st.gen) return; pagesEl.append(frag);
      scroller.scrollTop = keep * scroller.scrollHeight; trackCurrent();
      if (!io) pageEls.forEach((r) => r.el.__render());
    }
    async function renderPage(rec, gen) {
      if (rec.done || gen !== st.gen || gone()) return; rec.done = true;
      const { entry, scale, rot } = rec;
      if (entry.src === -1) { const w = Math.round((st.viewRot % 180 ? rec.sz.h : rec.sz.w) * scale), hh = Math.round((st.viewRot % 180 ? rec.sz.w : rec.sz.h) * scale); rec.canvas.width = w; rec.canvas.height = hh; rec.vp = null; return; }
      const p = await srcs[entry.src].doc.getPage(entry.i + 1);
      const vp = p.getViewport({ scale, rotation: rot }); const dpr = Math.min(2, window.devicePixelRatio || 1); const k = Math.min(dpr, Math.sqrt(16e6 / (vp.width * vp.height)));
      rec.canvas.width = Math.floor(vp.width * k); rec.canvas.height = Math.floor(vp.height * k); rec.canvas.style.width = `${Math.floor(vp.width)}px`; rec.canvas.style.height = `${Math.floor(vp.height)}px`;
      try { await p.render({ canvasContext: rec.canvas.getContext('2d'), viewport: vp, transform: k !== 1 ? [k, 0, 0, k, 0, 0] : undefined, background: 'rgb(255,255,255)' }).promise; } catch { /* page left blank */ }
      if (gen !== st.gen) return;
      try { rec.textLayer.style.setProperty('--scale-factor', String(scale)); const tl = new pdfjs.TextLayer({ textContentSource: p.streamTextContent(), container: rec.textLayer, viewport: vp }); await tl.render(); } catch { /* no selectable text */ }
      rec.vp = vp; paintHits(rec);
      if (entry.src === 0 && !readOnly) { try { buildForm(rec, await p.getAnnotations({ intent: 'display' }), vp); } catch { /* no form on this page */ } }
    }
    function trackCurrent() {
      curObs?.disconnect(); if (!io) return;
      curObs = new IntersectionObserver((es) => { let best = null; for (const e of es) if (e.isIntersecting && (!best || e.intersectionRatio > best.intersectionRatio)) best = e; if (best) { st.cur = Number(best.target.dataset.k); if (document.activeElement !== pageNum) pageNum.value = String(st.cur + 1); markThumb(); } }, { root: scroller, threshold: [0.25, 0.5, 0.75] });
      pageEls.forEach((r) => curObs.observe(r.el));
    }
    const goTo = (k) => { k = M.clamp(k, 0, S.pages.length - 1); pageEls[k]?.el.scrollIntoView({ block: 'start', behavior: 'auto' }); st.cur = k; pageNum.value = String(k + 1); markThumb(); };

    // ---------------------------------------------------------------- thumbnails and page tools
    const thumbIo = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { e.target.__thumb?.(); thumbIo.unobserve(e.target); } }, { root: thumbs, rootMargin: '300px' }) : null;
    function buildThumbs() {
      thumbs.replaceChildren();
      S.pages.forEach((entry, k) => {
        const cv = h('canvas', { class: 'px-tcv', 'aria-hidden': 'true' });
        const open = h('button', { type: 'button', class: 'px-tbtn', 'aria-label': `Go to page ${k + 1}`, onclick: () => goTo(k) }, cv, h('span', { class: 'px-tn' }, String(k + 1)));
        const chk = h('input', { type: 'checkbox', 'aria-label': `Select page ${k + 1}`, checked: st.checked.has(k) }); chk.addEventListener('change', () => { chk.checked ? st.checked.add(k) : st.checked.delete(k); paintSideInfo(); });
        const mkb = (label, ic, on, off) => h('button', { type: 'button', class: 'px-mini', 'aria-label': `${label} (page ${k + 1})`, title: label, disabled: off || false, onclick: on }, ic === 'up' ? icon('down', 'flip') : icon(ic));
        const row = h('div', { class: 'px-trow', role: 'listitem', 'data-k': String(k), draggable: readOnly ? false : 'true' }, readOnly ? null : chk, open,
          readOnly ? null : h('div', { class: 'px-tact' }, mkb('Move up', 'up', () => pageOp((p) => M.movePage(p, k, k - 1)), k === 0), mkb('Move down', 'down', () => pageOp((p) => M.movePage(p, k, k + 1)), k === S.pages.length - 1), mkb('Rotate right', 'rotate', () => rotatePage([k], 90)), mkb('Delete page', 'trash', () => pageOp((p) => M.deletePages(p, [k])), S.pages.length < 2)));
        row.__thumb = async () => { const v = await infoOf(entry); if (entry.src === -1) { cv.width = 120; cv.height = Math.round(120 * v.h / v.w); cv.getContext('2d').fillStyle = '#fff'; cv.getContext('2d').fillRect(0, 0, cv.width, cv.height); return; } const p = await srcs[entry.src].doc.getPage(entry.i + 1); const rot = M.effectiveRotation(v.rotate, entry.rot); const sz = M.displaySize(v.w, v.h, rot); const s = 120 / sz.w; const vp = p.getViewport({ scale: s, rotation: rot }); cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height); try { await p.render({ canvasContext: cv.getContext('2d'), viewport: vp, background: 'rgb(255,255,255)' }).promise; } catch { /* blank */ } };
        if (!readOnly) {
          row.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', String(k)); e.dataTransfer.effectAllowed = 'move'; row.classList.add('drag'); }); row.addEventListener('dragend', () => row.classList.remove('drag'));
          row.addEventListener('dragover', (e) => { e.preventDefault(); row.classList.add('over'); }); row.addEventListener('dragleave', () => row.classList.remove('over'));
          row.addEventListener('drop', (e) => { e.preventDefault(); row.classList.remove('over'); const from = Number(e.dataTransfer.getData('text/plain')); if (Number.isInteger(from)) pageOp((p) => M.movePage(p, from, k)); });
        }
        thumbs.append(row); thumbIo ? thumbIo.observe(row) : row.__thumb(); if (k === st.cur) row.classList.add('cur');
      });
      paintSideInfo();
    }
    const markThumb = () => { for (const r of thumbs.children) r.classList.toggle('cur', Number(r.dataset.k) === st.cur); thumbs.children[st.cur]?.scrollIntoView?.({ block: 'nearest' }); };
    const targets = () => (st.checked.size ? [...st.checked] : [st.cur]);
    const sideInfo = h('p', { class: 'fine muted' });
    function paintSideInfo() { sideInfo.textContent = st.checked.size ? `${st.checked.size} page${st.checked.size === 1 ? '' : 's'} selected` : 'Tick pages to work on several at once. Otherwise tools apply to the page you are on.'; }
    function pageOp(fn) { const pages = fn(S.pages); if (pages === S.pages) return; st.checked.clear(); const live = new Set(pages.map((p) => p.uid)); const ann = Object.fromEntries(Object.entries(S.ann).filter(([u]) => live.has(u))); commit({ ...S, pages, ann }, { rebuild: true }); }
    async function rotatePage(idxs, delta) {
      const next = M.rotatePages(S.pages, idxs, delta); const ann = { ...S.ann };
      for (const k of idxs) { const e = S.pages[k]; const list = ann[e.uid]; if (!list?.length) continue; const sz = shown(e, await infoOf(e)); ann[e.uid] = list.map((a) => M.rotateAnnotationOnPage(a, delta > 0, sz.w, sz.h)); }
      commit({ ...S, pages: next, ann }, { rebuild: true });
    }
    async function addFrom(blob, name) {
      const pdfBytes = new Uint8Array(await blob.arrayBuffer()); let d;
      try { d = await pdfjs.getDocument({ data: pdfBytes.slice(), cMapUrl: `${BASE}cmaps/`, cMapPacked: true, standardFontDataUrl: `${BASE}standard_fonts/`, isEvalSupported: false }).promise; }
      catch (e) { toast(e?.name === 'PasswordException' ? 'That PDF is password protected, so it can’t be added.' : 'That file could not be read as a PDF.', false); return false; }
      srcs.push({ bytes: pdfBytes, doc: d, name, count: d.numPages }); const src = srcs.length - 1;
      commit({ ...S, pages: M.appendPages(S.pages, src, d.numPages) }, { rebuild: true }); toast(`Added ${d.numPages} page${d.numPages === 1 ? '' : 's'} from ${name}.`); setTimeout(() => goTo(S.pages.length - d.numPages), 200); return true;
    }
    function mergeDialog() {
      const list = h('ul', { class: 'rows px-pick', 'aria-label': 'PDFs in this space' }, h('li', { class: 'muted' }, 'Loading…'));
      const fileIn = h('input', { type: 'file', accept: 'application/pdf,.pdf', id: 'px-up', 'aria-label': 'Choose a PDF from your computer' });
      let closeDlg = () => {};
      const fill = async () => {
        const r = await api.call('drive.files.list', { space: meta.space, ...(meta.client_id ? { client: meta.client_id } : {}), anywhere: true, kind: 'file' });
        const pdfs = r.ok ? r.data.filter((f) => M.isPdfMime(f.mime_type) && f.id !== meta.id) : [];
        list.replaceChildren(...(pdfs.length ? pdfs.slice(0, 60).map((f) => h('li', {}, h('span', {}, f.name), btn('Add pages', async () => { const g = await readStored(api, f.id); if (g.error) return toast('Couldn’t open that file.', false); if (await addFrom(g.blob, f.name)) closeDlg(); }, ''))) : [h('li', { class: 'muted' }, r.ok ? 'No other PDFs in this space.' : 'Couldn’t load the list.')]));
      };
      fill();
      fileIn.addEventListener('change', async () => { const f = fileIn.files?.[0]; if (!f) return; if (f.size > MAX_BYTES) return toast('That file is too large.', false); if (await addFrom(f, f.name)) closeDlg(); });
      closeDlg = dialog({ title: 'Add pages from another PDF', wide: true, body: [h('p', { class: 'fine muted' }, 'The pages are added at the end. You can move them afterwards.'), h('h3', { class: 'px-h3' }, 'From Drive'), list, h('h3', { class: 'px-h3' }, 'From your computer'), h('label', { for: 'px-up', class: 'sr' }, 'PDF file'), fileIn], actions: [{ label: 'Close' }] });
    }
    function extractDialog() {
      const f = h('input', { id: 'px-range', class: 'px-range', type: 'text', value: st.checked.size ? [...st.checked].sort((a, b) => a - b).map((k) => k + 1).join(',') : `${st.cur + 1}`, 'aria-describedby': 'px-range-h' });
      const err = h('p', { class: 'err', role: 'alert', hidden: true });
      const pick = () => { try { return M.parsePageRange(f.value, S.pages.length); } catch (e) { err.hidden = false; err.textContent = e.message; f.setAttribute('aria-invalid', 'true'); return null; } };
      dialog({ title: 'Extract pages', body: [h('label', { for: 'px-range' }, 'Pages to extract'), f, h('p', { class: 'fine muted', id: 'px-range-h' }, `This PDF has ${S.pages.length} page${S.pages.length === 1 ? '' : 's'}. Example: 1-3, 5. Your edits to those pages are included.`), err],
        actions: [{ label: 'Save as new file', cls: 'primary', keep: true, on: async (close) => { const idx = pick(); if (!idx) return false; const bl = await buildBlob(M.extractPages(S.pages, idx)); if (!bl) return false; const r = await saveCopy(api, meta, bl, 'application/pdf', M.copyName(`${meta.name.replace(/\.pdf$/i, '')} (pages ${f.value.trim()})`, 'application/pdf')); if (r.ok) { toast(`Saved ${r.data[0].name} in the same place.`); close(); } else { toast(r.message ?? 'Couldn’t save the new file.', false); return false; } } },
          { label: 'Download', keep: true, on: async (close) => { const idx = pick(); if (!idx) return false; const bl = await buildBlob(M.extractPages(S.pages, idx)); if (!bl) return false; downloadBlob(bl, `${meta.name.replace(/\.pdf$/i, '')}-extract.pdf`); close(); } }, { label: 'Cancel' }] });
    }

    // ---------------------------------------------------------------- fill in form fields (AcroForm): inputs laid over the page where pdf.js reports each field
    let formFieldCount = 0;
    const setForm = (name, value) => { rev += 1; S = { ...S, form: { ...S.form, [name]: value }, rev }; hist.push(S); changed(); };
    function buildForm(rec, annots, vp) {
      rec.formEl.replaceChildren(); const widgets = annots.filter((a) => a.subtype === 'Widget' && a.fieldName && !a.readOnly && !a.hidden && ['Tx', 'Btn', 'Ch'].includes(a.fieldType));
      for (const a of widgets) {
        const [x1, y1, x2, y2] = vp.convertToViewportRectangle(a.rect); const x = Math.min(x1, x2), y = Math.min(y1, y2), w = Math.abs(x2 - x1), hh = Math.abs(y2 - y1); let el;
        const cur = Object.hasOwn(S.form, a.fieldName) ? S.form[a.fieldName] : a.fieldValue;
        if (a.fieldType === 'Tx') { el = a.multiLine ? h('textarea', { class: 'px-fi' }) : h('input', { type: 'text', class: 'px-fi', ...(a.password ? { type: 'password' } : {}) }); el.value = Array.isArray(cur) ? cur.join('\n') : (cur ?? ''); if (a.maxLen) el.maxLength = a.maxLen; el.addEventListener('change', () => setForm(a.fieldName, el.value)); }
        else if (a.fieldType === 'Btn' && a.pushButton) continue;
        else if (a.fieldType === 'Btn' && a.radioButton) { el = h('input', { type: 'radio', class: 'px-fi', name: `px-${a.fieldName}` }); el.checked = String(cur) === String(a.buttonValue); el.addEventListener('change', () => { if (el.checked) setForm(a.fieldName, a.buttonValue); }); }
        else if (a.fieldType === 'Btn') { el = h('input', { type: 'checkbox', class: 'px-fi' }); el.checked = typeof cur === 'boolean' ? cur : Boolean(cur) && cur !== 'Off'; el.addEventListener('change', () => setForm(a.fieldName, el.checked)); }
        else { el = h('select', { class: 'px-fi' }, h('option', { value: '' }, ''), ...(a.options ?? []).map((o) => h('option', { value: o.exportValue }, o.displayValue ?? o.exportValue))); el.value = Array.isArray(cur) ? (cur[0] ?? '') : (cur ?? ''); el.addEventListener('change', () => setForm(a.fieldName, el.value)); }
        el.setAttribute('aria-label', a.alternativeText || a.fieldName); el.title = a.alternativeText || a.fieldName; el.style.left = `${x}px`; el.style.top = `${y}px`; el.style.width = `${w}px`; el.style.height = `${hh}px`; el.style.fontSize = `${Math.max(9, Math.min(hh * 0.7, 18 * rec.scale))}px`;
        rec.formEl.append(el); formFieldCount += 1;
      }
    }

    // ---------------------------------------------------------------- annotations on the page
    const annOf = (rec) => S.ann[rec.uid] ?? [];
    function annNode(a, scale) {
      const px = (v) => `${v * scale}px`; let n;
      if (a.t === 'pen') {
        const pad = (a.size ?? 2) + 2; const xs = a.pts.map((p) => p[0]), ys = a.pts.map((p) => p[1]); const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad, w = Math.max(...xs) - x0 + pad, hh = Math.max(...ys) - y0 + pad;
        n = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); n.setAttribute('viewBox', `${x0} ${y0} ${w} ${hh}`); n.setAttribute('class', 'px-a px-pen'); n.style.left = px(x0); n.style.top = px(y0); n.style.width = px(w); n.style.height = px(hh);
        const pl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline'); pl.setAttribute('points', a.pts.map((p) => p.join(',')).join(' ')); pl.setAttribute('fill', 'none'); pl.setAttribute('stroke', a.color); pl.setAttribute('stroke-width', String(a.size ?? 2)); pl.setAttribute('stroke-linecap', 'round'); pl.setAttribute('stroke-linejoin', 'round'); n.append(pl);
      } else {
        n = document.createElement(a.t === 'img' || a.t === 'sign' ? 'img' : 'div'); n.className = `px-a px-${a.t}`;
        n.style.left = px(a.x); n.style.top = px(a.y);
        if (a.t === 'text') { n.textContent = a.text; n.style.fontSize = px(a.size); n.style.color = a.color; n.style.fontWeight = a.bold ? '700' : '400'; n.style.lineHeight = '1.2'; }
        else { n.style.width = px(a.w); n.style.height = px(a.h); if (a.t === 'hl') n.style.background = a.color; if (a.t === 'redact') n.title = 'Redaction: covered for good when saved'; if (a.t === 'rect') { n.style.border = `${Math.max(1, (a.size ?? 2) * scale)}px solid ${a.color}`; n.style.boxSizing = 'border-box'; } if (a.t === 'img' || a.t === 'sign') { n.src = a.src; n.alt = a.t === 'sign' ? 'Signature' : 'Picture'; n.draggable = false; } }
      }
      n.dataset.aid = a.id; if (a.id === st.sel) n.classList.add('sel'); return n;
    }
    function decoNodes(rec) {
      return M.decorShown(S.deco, rec.k, S.pages.length, rec.sz).map((d) => { const n = h('div', { class: `px-deco ${d.kind}`, 'aria-hidden': 'true' }, d.text); n.style.color = d.color; n.style.fontSize = `${d.size * rec.scale}px`;
        if (d.kind === 'num') { n.style.left = `${d.x * rec.scale}px`; n.style.top = `${(d.y - d.size) * rec.scale}px`; } else { n.style.left = `${d.cx * rec.scale}px`; n.style.top = `${d.cy * rec.scale}px`; n.style.opacity = String(d.opacity); n.style.transform = `translate(-50%,-50%) rotate(${-d.angle}deg)`; n.style.fontWeight = '700'; }
        return n; });
    }
    function paintAnn(rec) {
      rec.annEl.replaceChildren(...decoNodes(rec), ...annOf(rec).map((a) => annNode(a, rec.scale)));
      const a = annOf(rec).find((x) => x.id === st.sel);
      if (a && a.t !== 'pen' && a.t !== 'text' && !readOnly) { const hd = h('span', { class: 'px-resize', 'data-resize': a.id, 'aria-hidden': 'true' }); hd.style.left = `${(a.x + a.w) * rec.scale - 9}px`; hd.style.top = `${(a.y + a.h) * rec.scale - 9}px`; rec.annEl.append(hd); }
    }
    const repaintAnn = () => pageEls.forEach(paintAnn);
    const select = (idv) => { st.sel = idv; repaintAnn(); paintTools(); };
    const setAnn = (rec, list, push) => { S = { ...S, ann: { ...S.ann, [rec.uid]: list } }; if (push) { rev += 1; S = { ...S, rev }; hist.push(S); changed(); } paintAnn(rec); };
    function local(rec, e) {
      const r = rec.el.getBoundingClientRect(); const u = (e.clientX - r.left) / rec.scale, v = (e.clientY - r.top) / rec.scale;
      return M.viewToLocal(u, v, rec.sz.w, rec.sz.h, st.viewRot);
    }
    function wireAnn(rec) {
      if (readOnly) return;
      rec.annEl.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return; const p = local(rec, e); const tool = st.tool;
        const target = e.target.closest?.('[data-aid],[data-resize]');
        if (tool === 'select') {
          if (!target) { if (st.sel) select(null); return; }
          e.preventDefault(); const idv = target.dataset.resize ?? target.dataset.aid; const a = annOf(rec).find((x) => x.id === idv); if (!a) return; if (st.sel !== idv) select(idv);
          const resizing = Boolean(target.dataset.resize); const start = p; const orig = a; let moved = false; rec.annEl.setPointerCapture(e.pointerId);
          const mv = (ev) => { const q = local(rec, ev); const dx = q.x - start.x, dy = q.y - start.y; if (!moved && Math.hypot(dx, dy) < 0.5) return; moved = true;
            const upd = resizing ? { ...orig, w: Math.max(8, orig.w + dx), h: Math.max(8, orig.h + dy) } : orig.pts ? { ...orig, pts: orig.pts.map((pt) => [pt[0] + dx, pt[1] + dy]) } : { ...orig, x: orig.x + dx, y: orig.y + dy };
            setAnn(rec, annOf(rec).map((x) => (x.id === idv ? upd : x)), false); };
          const up = () => { rec.annEl.removeEventListener('pointermove', mv); rec.annEl.removeEventListener('pointerup', up); if (moved) { rev += 1; S = { ...S, rev }; hist.push(S); changed(); } };
          rec.annEl.addEventListener('pointermove', mv); rec.annEl.addEventListener('pointerup', up); return;
        }
        e.preventDefault();
        if (tool === 'text') { openTextEntry(rec, p); return; }
        if (tool === 'sign' || tool === 'img') { if (st.pending) { placePending(rec, p); } else (tool === 'sign' ? signDialog : pickImage)(); return; }
        // drag tools
        let draft = tool === 'pen' ? { id: aid(), t: 'pen', pts: [[p.x, p.y]], color: st.drawColor, size: st.line } : { id: aid(), t: tool, x: p.x, y: p.y, w: 0, h: 0, color: tool === 'hl' ? st.hlColor : tool === 'redact' ? '#000000' : st.drawColor, size: st.line };
        rec.annEl.setPointerCapture(e.pointerId); const base = annOf(rec);
        const mv = (ev) => { const q = local(rec, ev); if (draft.t === 'pen') draft = { ...draft, pts: [...draft.pts, [q.x, q.y]] }; else draft = { ...draft, x: Math.min(p.x, q.x), y: Math.min(p.y, q.y), w: Math.abs(q.x - p.x), h: Math.abs(q.y - p.y) }; setAnn(rec, [...base, draft], false); };
        const up = () => { rec.annEl.removeEventListener('pointermove', mv); rec.annEl.removeEventListener('pointerup', up);
          const ok = draft.t === 'pen' ? draft.pts.length > 1 : draft.w > 3 && draft.h > 3; if (ok) { st.sel = draft.id; setAnn(rec, [...base, draft], true); paintTools(); } else setAnn(rec, base, false); };
        rec.annEl.addEventListener('pointermove', mv); rec.annEl.addEventListener('pointerup', up);
      });
      rec.annEl.addEventListener('dblclick', (e) => { const t = e.target.closest?.('.px-text-a,[data-aid]'); const a = t && annOf(rec).find((x) => x.id === t.dataset.aid); if (a?.t === 'text' && !readOnly) openTextEntry(rec, { x: a.x, y: a.y }, a); });
    }
    function openTextEntry(rec, p, existing = null) {
      rec.annEl.querySelector('.px-entry')?.remove();
      const ta = h('textarea', { class: 'px-entry', rows: '1', 'aria-label': 'Text to add to the page' }); ta.value = existing?.text ?? '';
      const size = existing?.size ?? st.size; ta.style.left = `${p.x * rec.scale}px`; ta.style.top = `${p.y * rec.scale}px`; ta.style.fontSize = `${size * rec.scale}px`; ta.style.color = existing?.color ?? st.color;
      const grow = () => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight}px`; }; ta.addEventListener('input', grow);
      let fin = false; const done = (keep) => { if (fin) return; fin = true; const text = ta.value.replace(/\s+$/, ''); ta.remove(); if (!keep || !text) return;
        const base = { id: existing?.id ?? aid(), t: 'text', x: p.x, y: p.y, text, size, color: existing?.color ?? st.color, bold: existing?.bold ?? false }; const a = { ...base, ...measure(base) };
        st.sel = a.id; setAnn(rec, existing ? annOf(rec).map((x) => (x.id === a.id ? a : x)) : [...annOf(rec), a], true); paintTools(); };
      ta.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); done(true); } });
      ta.addEventListener('blur', () => done(true)); rec.annEl.append(ta); setTimeout(() => { ta.focus(); grow(); }, 0);
    }
    function placePending(rec, p) {
      const it = st.pending; st.pending = null; setTool('select');
      const w = Math.min(it.w, rec.sz.w * 0.6), hh = w * (it.h / it.w); const a = { id: aid(), t: it.t, src: it.src, mime: it.mime, x: Math.max(0, p.x - w / 2), y: Math.max(0, p.y - hh / 2), w, h: hh };
      st.sel = a.id; setAnn(rec, [...annOf(rec), a], true); paintTools();
    }
    function pickImage() {
      const f = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif' });
      f.addEventListener('change', async () => {
        const file = f.files?.[0]; if (!file) return; if (file.size > 12e6) return toast('That picture is too large (12 MB at most).', false);
        try { const bmp = await createImageBitmap(file); const c = mk(Math.min(bmp.width, 1600), 1); const k = c.width / bmp.width; c.height = Math.max(1, Math.round(bmp.height * k)); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
          const jpeg = file.type === 'image/jpeg'; const src = c.toDataURL(jpeg ? 'image/jpeg' : 'image/png', 0.9); st.pending = { t: 'img', src, mime: jpeg ? 'image/jpeg' : 'image/png', w: c.width * 0.5, h: c.height * 0.5 }; toast('Now click the page where the picture should go.'); }
        catch { toast('That picture could not be read.', false); }
      }); f.click();
    }
    function signDialog() {
      const cv = h('canvas', { class: 'px-signcv', width: '480', height: '180', 'aria-label': 'Draw your signature here' }); const x = cv.getContext('2d'); x.lineWidth = 3; x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#111111'; let drawing = false, any = false;
      const pt = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * (cv.width / r.width), (e.clientY - r.top) * (cv.height / r.height)]; };
      cv.addEventListener('pointerdown', (e) => { drawing = true; any = true; cv.setPointerCapture(e.pointerId); const [a, b] = pt(e); x.beginPath(); x.moveTo(a, b); x.lineTo(a + 0.1, b); x.stroke(); });
      cv.addEventListener('pointermove', (e) => { if (!drawing) return; const [a, b] = pt(e); x.lineTo(a, b); x.stroke(); }); cv.addEventListener('pointerup', () => { drawing = false; });
      const typed = h('input', { id: 'px-typed', type: 'text', placeholder: 'Type your name', maxlength: '60', class: 'px-range' });
      let mode = 'draw'; const drawBox = h('div', {}, cv, btn('Clear', () => { x.clearRect(0, 0, cv.width, cv.height); any = false; }, 'link'));
      const typeBox = h('div', { hidden: true }, h('label', { for: 'px-typed' }, 'Your name'), typed);
      const tabs = h('div', { class: 'ix-seg', role: 'group', 'aria-label': 'Signature style' }, ...[['draw', 'Draw'], ['type', 'Type']].map(([k, t]) => h('button', { type: 'button', class: 'btn', 'aria-pressed': String(k === mode), onclick: (e) => { mode = k; drawBox.hidden = k !== 'draw'; typeBox.hidden = k !== 'type'; for (const b of tabs.children) b.setAttribute('aria-pressed', String(b === e.currentTarget)); } }, t)));
      dialog({ title: 'Add a signature', body: [tabs, drawBox, typeBox, h('p', { class: 'fine muted' }, 'This is a picture of a signature placed on the page. It is not a certified digital signature.')],
        actions: [{ label: 'Place on page', cls: 'primary', on: () => {
          let out;
          if (mode === 'draw') { if (!any) { toast('Draw your signature first.', false); return false; } out = cv; }
          else { const t = typed.value.trim(); if (!t) { toast('Type your name first.', false); return false; } out = mk(480, 140); const c = out.getContext('2d'); c.fillStyle = '#111111'; c.font = 'italic 64px "Brush Script MT", "Segoe Script", "Snell Roundhand", cursive'; c.textBaseline = 'middle'; c.fillText(t, 12, 70, 456); }
          const t2 = mk(out.width, out.height); t2.getContext('2d').drawImage(out, 0, 0);
          st.pending = { t: 'sign', src: t2.toDataURL('image/png'), mime: 'image/png', w: 150, h: 150 * (out.height / out.width) }; toast('Now click the page where the signature should go.'); } }, { label: 'Cancel' }] });
    }

    // ---------------------------------------------------------------- search
    let searchRun = 0;
    async function textOf(entry) {
      const key = `${entry.src}:${entry.i}`; if (textCache.has(key)) return textCache.get(key);
      const p = await srcs[entry.src].doc.getPage(entry.i + 1); const tc = await p.getTextContent(); const items = tc.items.filter((it) => typeof it.str === 'string'); textCache.set(key, items); return items;
    }
    async function runSearch() {
      const q = searchIn.value.trim().toLowerCase(); const run = ++searchRun; st.q = q; st.matches = []; st.mi = -1;
      if (!q) { hitInfo.textContent = ''; pageEls.forEach(paintHits); return; }
      hitInfo.textContent = 'Searching…';
      for (let k = 0; k < S.pages.length; k++) {
        const items = await textOf(S.pages[k]); if (run !== searchRun || gone()) return;
        items.forEach((it, ii) => { const s = it.str.toLowerCase(); let at = s.indexOf(q); while (at >= 0) { st.matches.push({ k, ii, at, len: q.length }); at = s.indexOf(q, at + q.length); } });
      }
      hitInfo.textContent = st.matches.length ? `${st.matches.length} found` : 'No matches'; pageEls.forEach(paintHits);
      if (st.matches.length) step(1);
    }
    function step(dir) {
      if (!st.matches.length) return; st.mi = (st.mi + dir + st.matches.length) % st.matches.length; hitInfo.textContent = `${st.mi + 1} of ${st.matches.length}`;
      const m = st.matches[st.mi]; pageEls.forEach(paintHits); goTo(m.k);
      setTimeout(() => pageEls[m.k]?.hits.querySelector('.cur')?.scrollIntoView({ block: 'center', behavior: 'auto' }), 60);
    }
    async function paintHits(rec) {
      rec.hits.replaceChildren(); if (!st.q || !rec.vp) return; const mine = st.matches.map((m, i) => ({ ...m, i })).filter((m) => m.k === rec.k); if (!mine.length) return;
      const items = await textOf(rec.entry); const vp = rec.vp;
      for (const m of mine) {
        const it = items[m.ii]; if (!it) continue; const tx = pdfjs.Util.transform(vp.transform, it.transform); const fh = Math.hypot(tx[2], tx[3]); const total = Math.max(1, it.str.length); const wpx = it.width * vp.scale;
        const ang = Math.atan2(tx[1], tx[0]); const off = (m.at / total) * wpx, mw = (m.len / total) * wpx;
        const bx = tx[4] + Math.cos(ang) * off, by = tx[5] + Math.sin(ang) * off;
        const d = h('div', { class: `px-hit${m.i === st.mi ? ' cur' : ''}` }); d.style.left = `${bx}px`; d.style.top = `${by - fh}px`; d.style.width = `${mw}px`; d.style.height = `${fh * 1.1}px`; d.style.transformOrigin = '0 100%'; d.style.transform = `rotate(${ang}rad)`; rec.hits.append(d);
      }
    }
    searchIn.addEventListener('input', () => { clearTimeout(searchIn.__t); searchIn.__t = setTimeout(runSearch, 250); });
    searchIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (st.matches.length && searchIn.value.trim().toLowerCase() === st.q) step(e.shiftKey ? -1 : 1); else runSearch(); } else if (e.key === 'Escape') { searchIn.value = ''; runSearch(); scroller.focus(); } });

    // ---------------------------------------------------------------- building the output PDF
    /** A page drawn as a picture (used for redactions and for strong compression). Returns { bytes, w, h } with w x h the page as shown, in points. */
    async function rasterPage(entry, scale, quality, redacts) {
      const v = await infoOf(entry); const R = M.effectiveRotation(v.rotate, entry.rot); const sz = M.displaySize(v.w, v.h, R);
      const c = mk(sz.w * scale, sz.h * scale); const x = c.getContext('2d'); x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height);
      if (entry.src !== -1) { const p = await srcs[entry.src].doc.getPage(entry.i + 1); await p.render({ canvasContext: x, viewport: p.getViewport({ scale, rotation: R }), background: 'rgb(255,255,255)' }).promise; }
      x.fillStyle = '#000000'; for (const a of redacts ?? []) x.fillRect(a.x * scale, a.y * scale, a.w * scale, a.h * scale);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', quality)); return { bytes: new Uint8Array(await blob.arrayBuffer()), w: sz.w, h: sz.h };
    }
    function fillForm(doc) {
      let form; try { form = doc.getForm(); } catch { return false; } let any = false;
      for (const [name, val] of Object.entries(S.form)) {
        try { const f = form.getField(name); if (typeof f.setText === 'function') f.setText(String(val ?? '')); else if (typeof f.check === 'function') { val ? f.check() : f.uncheck(); } else if (typeof f.select === 'function') { if (val) f.select(String(val)); else f.clear?.(); } any = true; } catch { /* a field this editor does not know */ }
      }
      return any;
    }
    /** Writes the given page list (with its annotations, form values, page numbers and watermark) into a new PDF. opts.raster = { scale, quality } turns every page into a picture (strong compression).
     *  Pages with a redaction are always written as pictures with the covered area burned in, so the hidden content is not in the file. Returns { blob, rasterised } or null after telling the person why not. */
    async function build(pages, opts = {}) {
      try {
        await loadLib(); const { PDFDocument, StandardFonts, degrees } = libs; const redactIds = new Set(M.redactedPages(pages, S.ann)); const rasterAll = Boolean(opts.raster);
        const inPlace = !M.needsRebuild(pages, srcs[0].count) && pages === S.pages && !redactIds.size && !rasterAll;
        let out; const pageMap = []; const rasterised = [];
        const loaded = new Map(); for (const src of new Set(pages.filter((e) => e.src >= 0).map((e) => e.src))) loaded.set(src, await PDFDocument.load(srcs[src].bytes));
        if (loaded.has(0)) { const d0 = loaded.get(0); const had = d0.getForm().getFields().length > 0; const filled = fillForm(d0); if (!inPlace && had) { if (filled) d0.getForm().updateFieldAppearances(await d0.embedFont(StandardFonts.Helvetica)); d0.getForm().flatten(); } else if (filled) d0.getForm().updateFieldAppearances(await d0.embedFont(StandardFonts.Helvetica)); }
        if (inPlace) { out = loaded.get(0); out.getPages().forEach((p, i) => pageMap.push({ p, entry: pages[i], R: null })); }
        else {
          out = await PDFDocument.create(); const copied = new Map();
          for (const [src, d] of loaded) { const idx = [...new Set(pages.filter((e) => e.src === src && !rasterAll && !redactIds.has(e.uid)).map((e) => e.i))]; if (!idx.length) continue; const cp = await out.copyPages(d, idx); idx.forEach((i, n) => copied.set(`${src}:${i}`, { page: cp[n], base: d.getPage(i).getRotation().angle })); }
          for (const entry of pages) {
            if (rasterAll || redactIds.has(entry.uid)) {
              const r = await rasterPage(entry, rasterAll ? opts.raster.scale : 2, rasterAll ? opts.raster.quality : 0.9, (S.ann[entry.uid] ?? []).filter((a) => a.t === 'redact')); const page = out.addPage([r.w, r.h]);
              page.drawImage(await out.embedJpg(r.bytes), { x: 0, y: 0, width: r.w, height: r.h }); pageMap.push({ p: page, entry, R: 0 }); rasterised.push(entry.uid);
            } else if (entry.src === -1) { const page = out.addPage([entry.blank.w, entry.blank.h]); pageMap.push({ p: page, entry, R: 0 }); }
            else { const c = copied.get(`${entry.src}:${entry.i}`); c.page.setRotation(degrees((((c.base + entry.rot) % 360) + 360) % 360)); out.addPage(c.page); pageMap.push({ p: c.page, entry, R: null }); }
          }
        }
        const fonts = { reg: await out.embedFont(StandardFonts.Helvetica), bold: await out.embedFont(StandardFonts.HelveticaBold) }; const embedded = new Map();
        for (let k = 0; k < pageMap.length; k++) {
          const { p, entry, R: forced } = pageMap[k]; const box = p.getCropBox?.() ?? p.getMediaBox(); const R = forced ?? ((((p.getRotation().angle) % 360) + 360) % 360); const page = { pw: box.width, ph: box.height, R };
          for (const a of S.ann[entry.uid] ?? []) await paint(out, p, box.x, box.y, M.planAnnotation(a, page), fonts, embedded);
          await paint(out, p, box.x, box.y, M.planDecor(S.deco, k, pageMap.length, page), fonts, embedded);
        }
        const bytes = await out.save({ useObjectStreams: true }); return { blob: new Blob([bytes], { type: 'application/pdf' }), rasterised };
      } catch (e) {
        console.warn('pdf build failed', e);
        toast(/encrypt/i.test(String(e?.message)) ? 'This PDF is protected, so it can’t be edited here.' : 'Couldn’t create the PDF. Try again, or remove the last thing you added.', false); return null;
      }
    }
    const buildBlob = async (pages, opts) => (await build(pages, opts))?.blob ?? null;
    async function save() {
      if (readOnly || saving) return false; saving = true; status = 'saving'; changed();
      const made = await build(S.pages); if (!made) { saving = false; status = 'failed'; changed(); return false; } const blob = made.blob; const before = meta.size_bytes ?? 0;
      const r = await saveVersion(api, meta, blob, 'application/pdf', version, 'Edited in the PDF editor'); saving = false; if (gone()) return false;
      if (r.ok) { version = r.data[0].current_version; savedAt = new Date().toISOString(); await reloadFrom(blob, false); meta = { ...meta, size_bytes: blob.size }; status = 'saved'; changed(); ctx.announce('Saved.'); toast(`Saved as a new version. ${M.fmtBytes(blob.size)}${before ? ` (was ${M.fmtBytes(before)})` : ''}.${made.rasterised.length ? ` ${made.rasterised.length} page${made.rasterised.length === 1 ? ' was' : 's were'} saved as a picture so redacted content is gone.` : ''}`); return true; }
      if (r.status === 409) { status = 'failed'; changed(); conflict(); return false; }
      status = 'failed'; changed(); toast(r.status === 404 ? 'You can read this but not change it, so your edit was not saved.' : (r.message ?? 'Couldn’t save. Try again.'), false); return false;
    }
    /** After a save (or a restore) the file on screen is the saved PDF: edits are now part of it and the page list starts fresh. */
    async function reloadFrom(blob, keepHistory) {
      const nb = new Uint8Array(await blob.arrayBuffer()); const d = await pdfjs.getDocument({ data: nb.slice(), cMapUrl: `${BASE}cmaps/`, cMapPacked: true, standardFontDataUrl: `${BASE}standard_fonts/`, isEvalSupported: false }).promise;
      const old = srcs.splice(0, srcs.length, { bytes: nb, doc: d, name: meta.name, count: d.numPages }); old.forEach((s) => s.doc.destroy?.()); pageInfo.clear(); textCache.clear();
      rev += 1; S = { pages: M.initialPages(d.numPages, 0), ann: {}, form: {}, deco: {}, rev }; savedRev = rev; if (!keepHistory) hist.reset(S); st.sel = null; st.checked.clear(); st.cur = Math.min(st.cur, d.numPages - 1); await buildPages(); buildThumbs(); if (st.q) runSearch();
    }
    function conflict() {
      dialog({ title: 'Someone saved a newer version', body: [h('p', {}, 'While you were editing, another version of this PDF was saved. Nothing has been overwritten.'), h('p', { class: 'fine muted' }, 'Both versions stay in History either way.')],
        actions: [{ label: 'Save mine as the newest', cls: 'primary', on: async () => { const cur = await api.call('drive.files.get', { id: meta.id }); if (!cur.ok) { toast('Couldn’t check the latest version. Try again.', false); return false; } version = cur.data[0].current_version; status = 'dirty'; await save(); } },
          { label: 'Save mine as a copy', on: async () => { await saveCopyNow(); } }, { label: 'Keep editing', focus: true }] });
    }
    async function saveCopyNow() { const blob = await buildBlob(S.pages); if (!blob) return; const r = await saveCopy(api, meta, blob, 'application/pdf'); if (r.ok) toast(`Saved a copy: ${r.data[0].name}`); else toast(r.message ?? 'Couldn’t save the copy.', false); }
    async function download() { const blob = dirtyNow() || M.needsRebuild(S.pages, srcs[0].count) ? await buildBlob(S.pages) : new Blob([srcs[0].bytes], { type: 'application/pdf' }); if (blob) downloadBlob(blob, meta.name.toLowerCase().endsWith('.pdf') ? meta.name : `${meta.name}.pdf`); }

    // ---------------------------------------------------------------- print
    async function printNow() {
      toast('Preparing to print…'); let d = srcs[0].doc, temp = false, pages = S.pages;
      if (S.pages.some((p) => (S.ann[p.uid]?.length)) || S.deco.numbers || S.deco.watermark || Object.keys(S.form).length || M.needsRebuild(S.pages, srcs[0].count)) { const blob = await buildBlob(S.pages); if (!blob) return; d = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false, cMapUrl: `${BASE}cmaps/`, cMapPacked: true, standardFontDataUrl: `${BASE}standard_fonts/` }).promise; temp = true; pages = null; }
      const wrapEl = h('div', { class: 'px-printwrap' }); document.body.append(wrapEl); document.body.classList.add('px-printing');
      const n = temp ? d.numPages : S.pages.length;
      for (let k = 0; k < n; k++) {
        const p = await d.getPage(temp ? k + 1 : S.pages[k].i + 1); const rot = temp ? undefined : (M.effectiveRotation(p.rotate || 0, S.pages[k].rot) + st.viewRot) % 360;
        const vp = p.getViewport({ scale: 1.6, ...(rot != null ? { rotation: rot } : st.viewRot ? { rotation: ((p.rotate || 0) + st.viewRot) % 360 } : {}) }); const c = mk(vp.width, vp.height); c.className = 'px-printpage';
        await p.render({ canvasContext: c.getContext('2d'), viewport: vp, background: 'rgb(255,255,255)' }).promise; wrapEl.append(c);
      }
      const cleanup = () => { wrapEl.remove(); document.body.classList.remove('px-printing'); window.removeEventListener('afterprint', cleanup); if (temp) d.destroy?.(); };
      window.addEventListener('afterprint', cleanup); window.print(); setTimeout(() => { if (document.body.classList.contains('px-printing') && !matchMedia('print').matches) cleanup(); }, 60000); void pages;
    }

    // ---------------------------------------------------------------- document tools: blank page, page numbers, watermark, compress, outline
    async function blankPage() {
      const e = S.pages[st.cur]; const v = await infoOf(e); const sz = M.displaySize(v.w, v.h, M.effectiveRotation(v.rotate, e.rot));
      commit({ ...S, pages: M.insertBlank(S.pages, st.cur, sz.w, sz.h) }, { rebuild: true }); setTimeout(() => goTo(st.cur + 1), 250); toast('Blank page added after this one.');
    }
    function opt(id, label, options, value) { const sel = h('select', { id, class: 'tbsel' }, ...options.map(([v, t]) => h('option', { value: v }, t))); sel.value = value; return { sel, row: h('div', { class: 'px-frow' }, h('label', { for: id }, label), sel) }; }
    function numberInput(id, label, value, min, max) { const i = h('input', { id, type: 'number', min: String(min), max: String(max), value: String(value), class: 'px-num' }); return { i, row: h('div', { class: 'px-frow' }, h('label', { for: id }, label), i) }; }
    function numbersDialog() {
      const cur = S.deco.numbers ?? { pos: 'bc', format: 'n', start: 1, size: 10, skipFirst: false };
      const pos = opt('pn-pos', 'Position', [['bc', 'Bottom centre'], ['br', 'Bottom right'], ['bl', 'Bottom left'], ['tc', 'Top centre'], ['tr', 'Top right'], ['tl', 'Top left']], cur.pos);
      const fmt = opt('pn-fmt', 'Style', [['n', '1'], ['page', 'Page 1'], ['of', '1 of 10'], ['pageof', 'Page 1 of 10'], ['dash', '- 1 -']], cur.format);
      const start = numberInput('pn-start', 'First number', cur.start, 0, 9999), size = numberInput('pn-size', 'Size (pt)', cur.size, 6, 48);
      const skip = h('input', { id: 'pn-skip', type: 'checkbox', checked: cur.skipFirst }); const colour = h('input', { id: 'pn-col', type: 'color', value: cur.color ?? '#444444' });
      dialog({ title: 'Page numbers', body: [pos.row, fmt.row, start.row, size.row, h('div', { class: 'px-frow' }, h('label', { for: 'pn-col' }, 'Colour'), colour), h('label', { class: 'px-frow px-chk' }, skip, 'Leave the first page without a number'), h('p', { class: 'fine muted' }, 'Numbers are written onto every page when you save. The preview shows them on the pages.')],
        actions: [{ label: 'Apply', cls: 'primary', on: () => { commit({ ...S, deco: { ...S.deco, numbers: { pos: pos.sel.value, format: fmt.sel.value, start: M.clamp(Number(start.i.value) || 1, 0, 9999), size: M.clamp(Number(size.i.value) || 10, 6, 48), skipFirst: skip.checked, color: colour.value } } }); } },
          S.deco.numbers ? { label: 'Remove numbers', on: () => { commit({ ...S, deco: { ...S.deco, numbers: null } }); } } : null, { label: 'Cancel' }].filter(Boolean) });
    }
    function watermarkDialog() {
      const cur = S.deco.watermark ?? { text: 'CONFIDENTIAL', size: 64, opacity: 0.25, angle: 45, color: '#999999' };
      const text = h('input', { id: 'wm-text', type: 'text', value: cur.text, maxlength: '60', class: 'px-range' }); const size = numberInput('wm-size', 'Size (pt)', cur.size, 10, 300);
      const op = h('input', { id: 'wm-op', type: 'range', min: '5', max: '80', value: String(Math.round(cur.opacity * 100)) }); const ang = opt('wm-ang', 'Direction', [['45', 'Diagonal up'], ['0', 'Straight'], ['-45', 'Diagonal down']], String(cur.angle)); const col = h('input', { id: 'wm-col', type: 'color', value: cur.color });
      dialog({ title: 'Text watermark', body: [h('label', { for: 'wm-text' }, 'Text'), text, size.row, h('div', { class: 'px-frow' }, h('label', { for: 'wm-op' }, 'Strength'), op), ang.row, h('div', { class: 'px-frow' }, h('label', { for: 'wm-col' }, 'Colour'), col), h('p', { class: 'fine muted' }, 'Written across the middle of every page when you save.')],
        actions: [{ label: 'Apply', cls: 'primary', on: () => { const t = text.value.trim(); if (!t) { toast('Type the watermark text first.', false); return false; } commit({ ...S, deco: { ...S.deco, watermark: { text: t, size: M.clamp(Number(size.i.value) || 64, 10, 300), opacity: Number(op.value) / 100, angle: Number(ang.sel.value), color: col.value } } }); } },
          S.deco.watermark ? { label: 'Remove watermark', on: () => { commit({ ...S, deco: { ...S.deco, watermark: null } }); } } : null, { label: 'Cancel' }].filter(Boolean) });
    }
    function compressDialog() {
      const mode = opt('cp-mode', 'How small', [['standard', 'Tidy up (keeps text, lossless)'], ['print', 'Smaller (pages become pictures, good for printing)'], ['screen', 'Smallest (pages become lower-quality pictures)']], 'standard');
      const out = h('p', { class: 'fine', role: 'status', 'aria-live': 'polite' }, `Current size: ${M.fmtBytes(meta.size_bytes)}.`); let last = null;
      const run = async () => { out.textContent = 'Working…'; last = null; const o = mode.sel.value === 'standard' ? {} : { raster: mode.sel.value === 'screen' ? { scale: 1.2, quality: 0.5 } : { scale: 1.8, quality: 0.75 } }; const made = await build(S.pages, o); if (!made) { out.textContent = 'Couldn’t make the smaller file.'; return false; }
        last = made.blob; out.textContent = `New size: ${M.fmtBytes(last.size)} (now ${M.fmtBytes(meta.size_bytes)}).${last.size >= (meta.size_bytes ?? 0) ? ' That is not smaller, so keep the file as it is.' : ''}`; return true; };
      mode.sel.addEventListener('change', () => { last = null; out.textContent = `Current size: ${M.fmtBytes(meta.size_bytes)}. Choose Check size.`; });
      dialog({ title: 'File size', body: [mode.row, h('p', { class: 'fine muted' }, 'The smaller choices turn every page into a picture: text can no longer be selected or searched. Your original stays in History.'), out],
        actions: [{ label: 'Check size', keep: true, on: async () => { await run(); return false; } }, { label: 'Save as new version', cls: 'primary', on: async () => { if (!last && !(await run())) return false; const r = await saveVersion(api, meta, last, 'application/pdf', version, 'Reduced file size'); if (!r.ok) { toast(r.status === 409 ? 'A newer version was saved. Reload and try again.' : (r.message ?? 'Couldn’t save.'), false); return false; } version = r.data[0].current_version; savedAt = new Date().toISOString(); const was = meta.size_bytes; await reloadFrom(last, false); meta = { ...meta, size_bytes: last.size }; status = 'saved'; changed(); toast(`Saved. ${M.fmtBytes(last.size)} (was ${M.fmtBytes(was)}).`); } }, { label: 'Cancel' }] });
    }
    function shortcutsDialog() {
      const rows = [['V / T / H / R / D / S / I / X', 'Select, Text, Highlight, Rectangle, Draw, Signature, Picture, Redact'], ['Ctrl+F', 'Find in the document'], ['Enter / Shift+Enter', 'Next / previous match'], ['Page Up / Page Down', 'Previous / next page'], ['+ / -', 'Zoom in / out'], ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'], ['Ctrl+S', 'Save'], ['Delete', 'Remove the selected item'], ['Arrow keys', 'Nudge the selected item (Shift = bigger steps)'], ['Ctrl+Enter', 'Finish typing a text box'], ['Esc', 'Cancel / deselect'], ['Right-click', 'Menu: copy text, undo, rotate view, print, download']];
      dialog({ title: 'Keyboard shortcuts', body: h('table', { class: 'px-keys' }, h('tbody', {}, ...rows.map(([a, b]) => h('tr', {}, h('th', { scope: 'row' }, a), h('td', {}, b))))), actions: [{ label: 'Close', focus: true }] });
    }
    // outline (bookmarks) of the opened file
    const outlinePane = h('nav', { class: 'px-outline', 'aria-label': 'Bookmarks', hidden: true }); const pagesPane = h('div', { class: 'px-pane' });
    async function goOutline(it) {
      let dest = it.dest; try { if (typeof dest === 'string') dest = await srcs[0].doc.getDestination(dest); if (!Array.isArray(dest)) return; const idx = typeof dest[0] === 'object' ? await srcs[0].doc.getPageIndex(dest[0]) : dest[0]; const k = S.pages.findIndex((p) => p.src === 0 && p.i === idx); if (k >= 0) goTo(k); } catch { /* an unusable destination */ }
    }
    const outlineList = (items) => h('ul', {}, ...items.map((it) => h('li', {}, it.dest ? h('button', { type: 'button', class: 'lnk', onclick: () => goOutline(it) }, it.title || 'Untitled') : h('span', { class: 'px-otitle' }, it.title || 'Untitled'), it.items?.length ? outlineList(it.items) : null)));
    const tabs = h('div', { class: 'ix-seg px-tabs', role: 'group', 'aria-label': 'Sidebar', hidden: true });
    srcs[0].doc.getOutline().then((o) => { if (!o?.length || gone()) return; outlinePane.replaceChildren(outlineList(o));
      const mkTab = (k, label) => h('button', { type: 'button', class: 'btn', 'aria-pressed': String(k === 'pages'), onclick: () => { pagesPane.hidden = k !== 'pages'; outlinePane.hidden = k !== 'outline'; for (const b of tabs.children) b.setAttribute('aria-pressed', String(b.dataset.k === k)); } }, label);
      tabs.append(...[['pages', 'Pages'], ['outline', 'Bookmarks']].map(([k, l]) => { const b = mkTab(k, l); b.dataset.k = k; return b; })); tabs.hidden = false; }).catch(() => {});

    // ---------------------------------------------------------------- toolbar
    const toolRow = h('div', { class: 'px-edit', role: 'toolbar', 'aria-label': 'Edit tools' });
    const optRow = h('div', { class: 'px-opts' }); const hintEl = h('span', { class: 'px-hint' });
    const docRow = h('div', { class: 'px-doc', role: 'toolbar', 'aria-label': 'Document tools' }, btn('Add pages…', () => mergeDialog(), '', { title: 'Add pages from another PDF' }), btn('Blank page', () => blankPage(), '', { title: 'Insert a blank page after this one' }), btn('Extract…', () => extractDialog(), '', { title: 'Save some pages as a new PDF' }), btn('Page numbers…', () => numbersDialog(), ''), btn('Watermark…', () => watermarkDialog(), ''), btn('File size…', () => compressDialog(), '', { title: 'Check and reduce the file size' }));
    function setTool(t) { st.tool = t; if (t !== 'sign' && t !== 'img') st.pending = null; scroller.dataset.tool = t; paintTools(); if (t === 'sign') signDialog(); else if (t === 'img') pickImage(); }
    function paintTools() {
      toolRow.replaceChildren(...TOOL_LIST.map(([k, ic, label]) => h('button', { type: 'button', class: 'ix-tool px-tool', 'aria-pressed': String(st.tool === k), title: `${label} (${KEYS[k]})`, onclick: () => setTool(k) }, icon(ic), h('span', {}, label))));
      const sel = Object.values(S.ann).flat().find((a) => a.id === st.sel);
      const color = (label, value, on) => { const i = h('input', { type: 'color', value, 'aria-label': label }); i.addEventListener('input', () => on(i.value)); return h('label', { class: 'px-lbl' }, label, i); };
      const num = (label, value, min, max, on) => { const i = h('input', { type: 'number', value: String(value), min: String(min), max: String(max), 'aria-label': label, class: 'px-num' }); i.addEventListener('change', () => on(M.clamp(Number(i.value) || min, min, max))); return h('label', { class: 'px-lbl' }, label, i); };
      const upd = (patch) => { const rec = pageEls.find((r) => annOf(r).some((a) => a.id === st.sel)); if (!rec) return; setAnn(rec, annOf(rec).map((a) => (a.id === st.sel ? { ...a, ...patch, ...(a.t === 'text' ? measure({ ...a, ...patch }) : {}) } : a)), true); };
      const bits = [];
      if (sel) { bits.push(color('Colour', sel.color ?? '#000000', (v) => upd({ color: v })));
        if (sel.t === 'text') bits.push(num('Size (pt)', Math.round(sel.size), 6, 120, (v) => upd({ size: v })), h('label', { class: 'px-lbl' }, 'Bold', h('input', { type: 'checkbox', checked: Boolean(sel.bold), 'aria-label': 'Bold', onchange: (e) => upd({ bold: e.target.checked }) })));
        if (sel.t === 'pen' || sel.t === 'rect') bits.push(num('Line (pt)', sel.size ?? 2, 1, 24, (v) => upd({ size: v })));
        bits.push(btn('Delete', () => deleteSel(), '')); }
      else if (st.tool === 'text') bits.push(color('Colour', st.color, (v) => { st.color = v; }), num('Size (pt)', st.size, 6, 120, (v) => { st.size = v; }));
      else if (st.tool === 'hl') bits.push(color('Colour', st.hlColor, (v) => { st.hlColor = v; }));
      else if (st.tool === 'rect' || st.tool === 'pen') bits.push(color('Colour', st.drawColor, (v) => { st.drawColor = v; }), num('Line (pt)', st.line, 1, 24, (v) => { st.line = v; }));
      const hint = { select: 'Click an item to move, resize or delete it. Double-click text to change it.', redact: 'Drag over what must be hidden. When you save, that page is written as a flat picture with the area blacked out, so the covered text and images are gone for good. Text on that page can then no longer be selected or searched.', text: 'Click the page, type, then press Ctrl+Enter or click away.', hl: 'Drag across the text to highlight it.', rect: 'Drag to draw a rectangle.', pen: 'Draw freehand on the page.', sign: 'Make a signature, then click the page to place it.', img: 'Choose a picture, then click the page to place it.' }[st.tool];
      optRow.replaceChildren(...bits); optRow.hidden = !bits.length; hintEl.textContent = hint ?? '';
    }
    function nudge(k, d) { const rec = pageEls.find((r) => annOf(r).some((a) => a.id === st.sel)); if (!rec) return; const dx = k === 'arrowleft' ? -d : k === 'arrowright' ? d : 0, dy = k === 'arrowup' ? -d : k === 'arrowdown' ? d : 0; setAnn(rec, annOf(rec).map((a) => (a.id !== st.sel ? a : a.pts ? { ...a, pts: a.pts.map((p) => [p[0] + dx, p[1] + dy]) } : { ...a, x: a.x + dx, y: a.y + dy })), true); }
    function deleteSel() { const rec = pageEls.find((r) => annOf(r).some((a) => a.id === st.sel)); if (!rec) return; const id0 = st.sel; st.sel = null; setAnn(rec, annOf(rec).filter((a) => a.id !== id0), true); paintTools(); }
    function applyZoom(v) { st.zoom = v; zoomSel.value = typeof v === 'number' ? ([0.5, 0.75, 1, 1.25, 1.5, 2, 3].includes(v) ? String(v) : zoomSel.value) : v; buildPages(); }
    zoomSel.addEventListener('change', () => applyZoom(isNaN(Number(zoomSel.value)) ? zoomSel.value : Number(zoomSel.value)));
    const curScale = () => pageEls[st.cur]?.scale ?? 1;
    const zoomBy = (f) => { const s = M.clamp(Math.round(curScale() * f * 100) / 100, 0.25, 4); applyZoom(s); };
    pageNum.addEventListener('change', () => goTo(Number(pageNum.value) - 1));
    let rzT = 0; const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (gone()) { ro.disconnect(); return; } clearTimeout(rzT); rzT = setTimeout(() => { if (typeof st.zoom === 'string' && pageEls[0] && Math.abs(scroller.clientWidth - 32 - pageEls[0].el.offsetWidth) > 24) buildPages(); }, 200); }) : null; ro?.observe(scroller);
    pagesEl.addEventListener('pointerdown', () => { const a = document.activeElement; if (a && a !== document.body && a.matches?.('.px-entry')) return; });

    // ---------------------------------------------------------------- context menu and keys
    let menu = null; const closeMenu = () => { menu?.remove(); menu = null; document.removeEventListener('pointerdown', outside, true); }; const outside = (e) => { if (menu && !menu.contains(e.target)) closeMenu(); };
    scroller.addEventListener('contextmenu', (e) => {
      e.preventDefault(); closeMenu(); const text = String(getSelection?.() ?? '');
      const item = (label, on, off) => h('button', { type: 'button', role: 'menuitem', class: 'ix-mi', disabled: off || false, onclick: () => { closeMenu(); on(); } }, label);
      menu = h('div', { class: 'ix-menu', role: 'menu', 'aria-label': 'PDF actions' }, item('Copy text', async () => { try { await navigator.clipboard.writeText(text); toast('Copied.'); } catch { toast('Your browser didn’t allow copying.', false); } }, !text),
        readOnly ? null : item('Undo', undo, !hist.canUndo()), readOnly ? null : item('Redo', redo, !hist.canRedo()), readOnly ? null : item('Delete selected item', deleteSel, !st.sel), h('hr'),
        item('Rotate view', () => { st.viewRot = (st.viewRot + 90) % 360; buildPages(); }), item('Fit width', () => applyZoom('width')), item('Print…', printNow), item('Download', download));
      document.body.append(menu); const r = menu.getBoundingClientRect(); menu.style.left = `${Math.max(8, Math.min(e.clientX, innerWidth - r.width - 8))}px`; menu.style.top = `${Math.max(8, Math.min(e.clientY, innerHeight - r.height - 8))}px`;
      menu.querySelector('button:not(:disabled)')?.focus(); document.addEventListener('pointerdown', outside, true);
      menu.addEventListener('keydown', (ev) => { const b = [...menu.querySelectorAll('button:not(:disabled)')]; const i = b.indexOf(document.activeElement); if (ev.key === 'Escape') { closeMenu(); scroller.focus(); } else if (ev.key === 'ArrowDown') { ev.preventDefault(); b[(i + 1) % b.length]?.focus(); } else if (ev.key === 'ArrowUp') { ev.preventDefault(); b[(i - 1 + b.length) % b.length]?.focus(); } });
    });
    const onKey = (e) => {
      if (gone()) { document.removeEventListener('keydown', onKey); closeMenu(); return; }
      if (document.querySelector('.ovl, .drawer')) return; const mod = e.ctrlKey || e.metaKey; const k = e.key.toLowerCase();
      if (mod && k === 'f') { e.preventDefault(); searchIn.focus(); searchIn.select(); return; } if (mod && k === 's') { e.preventDefault(); save(); return; }
      if (e.target.closest?.('input,textarea,select')) return;
      if (mod && k === 'z' && !e.shiftKey && !readOnly) { e.preventDefault(); undo(); } else if (mod && (k === 'y' || (k === 'z' && e.shiftKey)) && !readOnly) { e.preventDefault(); redo(); }
      else if ((k === 'delete' || k === 'backspace') && st.sel && !readOnly) { e.preventDefault(); deleteSel(); } else if (k === 'escape') { st.pending = null; if (st.sel) select(null); else if (st.tool !== 'select') setTool('select'); }
      else if (!mod && !readOnly && Object.values(KEYS).some((v) => v.toLowerCase() === k)) setTool(Object.keys(KEYS).find((t) => KEYS[t].toLowerCase() === k)); else if (k === '?') shortcutsDialog();
      else if (k.startsWith('arrow') && st.sel && !readOnly) { e.preventDefault(); nudge(k, e.shiftKey ? 10 : 1); }
      else if (k === '+' || k === '=') zoomBy(1.2); else if (k === '-') zoomBy(1 / 1.2); else if (k === 'pagedown') { e.preventDefault(); goTo(st.cur + 1); } else if (k === 'pageup') { e.preventDefault(); goTo(st.cur - 1); }
    };
    document.addEventListener('keydown', onKey);

    // ---------------------------------------------------------------- assembly
    const banners = [];
    if (meta.archived_at) banners.push(notice('info', 'eye', [h('b', {}, 'Archived.'), ' This PDF is read only.']));
    else if (readOnly) banners.push(readOnlyNotice('You can read this PDF but not change it'));
    const histBtn = btn('History', () => versionsDrawer({ api, file: meta, current: () => version, readOnly, canRestore: !readOnly && !dirtyNow(), onRestored: async (blob, v) => { version = v; savedAt = new Date().toISOString(); await reloadFrom(blob, false); status = 'saved'; changed(); } }), '', { title: 'Version history' });
    const dlBtn = btn([icon('download'), h('span', { class: 'edx-lbl' }, 'Download')], () => download(), '', { title: 'Download' });
    const top = topBar({ backHref: backFor(meta), glyph: 'doc', name: meta.name, readOnly, onRename: async (name) => { const r = await api.call('drive.files.update', { id: meta.id, name }); if (r.ok) { meta = { ...meta, name }; document.title = `${name} · PDF`; toast('Renamed.'); return true; } toast(r.message ?? 'Couldn’t rename.', false); return false; }, right: [statusEl, histBtn, dlBtn, saveBtn] });
    const turnView = () => { st.viewRot = (st.viewRot + 90) % 360; buildPages(); };
    const toggleSide = () => { st.sidebar = !st.sidebar; side.hidden = !st.sidebar; sideToggle.setAttribute('aria-pressed', String(st.sidebar)); if (typeof st.zoom === 'string') setTimeout(buildPages, 50); };
    const sideToggle = btn([icon('layers'), h('span', { class: 'sr' }, 'Pages')], toggleSide, 'ix-ic', { 'aria-pressed': String(st.sidebar), title: 'Page thumbnails and bookmarks' });
    const sep = () => h('span', { class: 'edx-sep', 'aria-hidden': 'true' });
    const toolbar = h('div', { class: 'px-view', role: 'toolbar', 'aria-label': 'Tools' }, sideToggle, btn('‹', () => goTo(st.cur - 1), 'ix-ic', { 'aria-label': 'Previous page', title: 'Previous page (Page Up)' }), pageNum, total, btn('›', () => goTo(st.cur + 1), 'ix-ic', { 'aria-label': 'Next page', title: 'Next page (Page Down)' }), sep(),
      btn([icon('zout'), h('span', { class: 'sr' }, 'Zoom out')], () => zoomBy(1 / 1.2), 'ix-ic', { title: 'Zoom out (-)' }), zoomSel, btn([icon('zin'), h('span', { class: 'sr' }, 'Zoom in')], () => zoomBy(1.2), 'ix-ic', { title: 'Zoom in (+)' }),
      btn([icon('rotate'), h('span', { class: 'sr' }, 'Rotate view')], turnView, 'ix-ic', { title: 'Turn the view (does not change the file)' }), btn([icon('doc'), h('span', { class: 'sr' }, 'Print')], () => printNow(), 'ix-ic', { title: 'Print' }), sep(),
      h('label', { class: 'px-find' }, icon('search'), searchIn), btn('‹', () => step(-1), 'ix-ic', { 'aria-label': 'Previous match', title: 'Previous match (Shift+Enter)' }), btn('›', () => step(1), 'ix-ic', { 'aria-label': 'Next match', title: 'Next match (Enter)' }), hitInfo,
      ...(readOnly ? [] : [sep(), toolRow, sep(), undoB, redoB]));
    const ro2 = readOnly; const tg = (t) => () => setTool(t);
    const cur = () => targets();
    const menus = menuBar([
      { label: 'File', items: [{ label: 'Save', key: 'Ctrl+S', on: () => save(), disabled: () => ro2 || status === 'saved' }, { label: 'Save as copy', on: () => saveCopyNow(), disabled: ro2 }, { label: 'Download', on: () => download() }, { label: 'Print…', on: () => printNow() }, 'sep', { label: 'Version history', on: () => histBtn.click() }, 'sep', { label: 'Back to Drive', on: () => { location.hash = backFor(meta); } }] },
      { label: 'Edit', items: [{ label: 'Undo', key: 'Ctrl+Z', on: undo, disabled: () => ro2 || !hist.canUndo() }, { label: 'Redo', key: 'Ctrl+Shift+Z', on: redo, disabled: () => ro2 || !hist.canRedo() }, 'sep', { label: 'Delete selected item', key: 'Del', on: deleteSel, disabled: () => ro2 || !st.sel }, 'sep', { label: 'Find…', key: 'Ctrl+F', on: () => { searchIn.focus(); searchIn.select(); } }] },
      { label: 'View', items: [{ label: 'Zoom in', key: '+', on: () => zoomBy(1.2) }, { label: 'Zoom out', key: '-', on: () => zoomBy(1 / 1.2) }, { label: 'Fit width', on: () => applyZoom('width') }, { label: 'Fit page', on: () => applyZoom('page') }, { label: 'Actual size (100%)', on: () => applyZoom(1) }, 'sep', { label: 'Rotate view', on: turnView }, { label: 'Show pages and bookmarks', checked: () => st.sidebar, on: toggleSide }, 'sep', { label: 'Keyboard shortcuts', key: '?', on: shortcutsDialog }] },
      { label: 'Insert', items: [{ label: 'Text', key: 'T', on: tg('text'), disabled: ro2 }, { label: 'Highlight', key: 'H', on: tg('hl'), disabled: ro2 }, { label: 'Rectangle', key: 'R', on: tg('rect'), disabled: ro2 }, { label: 'Draw', key: 'D', on: tg('pen'), disabled: ro2 }, { label: 'Signature…', key: 'S', on: tg('sign'), disabled: ro2 }, { label: 'Picture…', key: 'I', on: tg('img'), disabled: ro2 }, 'sep', { label: 'Redact (cover for good)', key: 'X', on: tg('redact'), disabled: ro2 }, 'sep', { label: 'Blank page after this one', on: () => blankPage(), disabled: ro2 }, { label: 'Pages from another PDF…', on: () => mergeDialog(), disabled: ro2 }] },
      { label: 'Page', items: [{ label: 'Rotate right', on: () => rotatePage(cur(), 90), disabled: ro2 }, { label: 'Rotate left', on: () => rotatePage(cur(), -90), disabled: ro2 }, { label: 'Delete page', on: () => pageOp((p) => M.deletePages(p, cur())), disabled: () => ro2 || S.pages.length < 2 }, { label: 'Move up', on: () => pageOp((p) => M.movePage(p, st.cur, st.cur - 1)), disabled: () => ro2 || st.cur === 0 }, { label: 'Move down', on: () => pageOp((p) => M.movePage(p, st.cur, st.cur + 1)), disabled: () => ro2 || st.cur >= S.pages.length - 1 }, 'sep', { label: 'Extract pages…', on: () => extractDialog(), disabled: ro2 }, 'sep', { label: 'Page numbers…', on: () => numbersDialog(), disabled: ro2 }, { label: 'Watermark…', on: () => watermarkDialog(), disabled: ro2 }] },
      { label: 'Tools', items: [{ label: 'File size…', on: () => compressDialog(), disabled: ro2 }, { label: 'Find…', key: 'Ctrl+F', on: () => { searchIn.focus(); searchIn.select(); } }] },
    ], { isLive: () => !gone() });
    side.hidden = !st.sidebar;
    pagesPane.append(sideInfo, thumbs); side.append(h('h2', { class: 'px-h3' }, 'Pages'), tabs, pagesPane, outlinePane);
    const statusBar = h('footer', { class: 'edx-status' }, sizeEl, hintEl);
    root.replaceChildren(top.el, menus.el, ...banners, toolbar, readOnly ? null : optRow, h('div', { class: 'px-body' }, side, scroller), statusBar);
    document.title = `${meta.name} · PDF`;
    scroller.dataset.tool = st.tool; changed(); paintTools(); buildThumbs(); buildPages();
    void hex;
  }
  load();
  return root;
}
