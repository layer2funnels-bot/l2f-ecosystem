// Image editor for stored Drive files (png, jpeg, webp, gif first frame). Everything happens on <canvas> in the browser:
//   base picture (changed by crop / turn / flip / resize) + live adjustments and one filter + a list of annotations (pen, highlighter, text, shapes).
// Adjustments, filters and annotations stay editable until the picture is saved or downloaded; every step is an undo/redo snapshot.
// Nothing is stored until Save (a new version of the same file) or Save as copy (a new file next to it); the original is untouched until then.
// The maths (crop, resize, colour matrices, hit-testing) is pure and tested: mediamodel.js. File input/output: mediaio.js.
import { h, icon, toast, dialog, btn, notice, skeleton, errorState, noAccessState, readOnlyNotice } from '../ui.js';
import { dirty } from '../dirty.js';
import * as M from './mediamodel.js';
import { readStored, saveVersion, saveCopy, downloadBlob, versionsDrawer } from './mediaio.js';

const PREVIEW = 2400;          // longest side of the working preview (the saved picture always uses the full size)
const MAX_PIXELS = 64e6;
const FONTS = [['sans', 'Sans', 'Geist, system-ui, sans-serif'], ['display', 'Display', '"Bricolage Grotesque", Geist, system-ui, sans-serif'], ['serif', 'Serif', 'Georgia, "Times New Roman", serif'], ['mono', 'Mono', '"Geist Mono", ui-monospace, monospace']];
const fontCss = (key) => FONTS.find((f) => f[0] === key)?.[2] ?? FONTS[0][2];
const mkCanvas = (w, hh) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(hh)); return c; };
const timeOf = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
let baseSeq = 0; const tag = (c) => { c.__id = ++baseSeq; return c; };
const SLIDERS = [['brightness', 'Brightness', -100, 100], ['contrast', 'Contrast', -100, 100], ['saturation', 'Saturation', -100, 100], ['exposure', 'Exposure', -100, 100], ['warmth', 'Warmth', -100, 100], ['blur', 'Blur', 0, 100], ['sharpen', 'Sharpen', 0, 100]];

/** Draw annotations onto a context whose pixels are `k` times the image pixels. */
export function drawAnnotations(c, anns, k) {
  for (const a of anns) {
    c.save(); c.scale(k, k); c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = a.color; c.fillStyle = a.color; c.lineWidth = a.size ?? 4;
    if (a.t === 'pen' || a.t === 'hl') {
      if (a.t === 'hl') c.globalAlpha = 0.35;
      c.beginPath(); c.moveTo(a.pts[0][0], a.pts[0][1]); if (a.pts.length === 1) c.lineTo(a.pts[0][0] + 0.01, a.pts[0][1]); for (const p of a.pts.slice(1)) c.lineTo(p[0], p[1]); c.stroke();
    } else if (a.t === 'rect') { if (a.fill) { c.fillStyle = a.fill; c.fillRect(Math.min(a.x1, a.x2), Math.min(a.y1, a.y2), Math.abs(a.x2 - a.x1), Math.abs(a.y2 - a.y1)); } c.strokeRect(Math.min(a.x1, a.x2), Math.min(a.y1, a.y2), Math.abs(a.x2 - a.x1), Math.abs(a.y2 - a.y1)); }
    else if (a.t === 'ellipse') { c.beginPath(); c.ellipse((a.x1 + a.x2) / 2, (a.y1 + a.y2) / 2, Math.max(0.5, Math.abs(a.x2 - a.x1) / 2), Math.max(0.5, Math.abs(a.y2 - a.y1) / 2), 0, 0, Math.PI * 2); if (a.fill) { c.fillStyle = a.fill; c.fill(); } c.stroke(); }
    else if (a.t === 'line' || a.t === 'arrow') {
      c.beginPath(); c.moveTo(a.x1, a.y1); c.lineTo(a.x2, a.y2); c.stroke();
      if (a.t === 'arrow') { const [p, q] = M.arrowHead(a.x1, a.y1, a.x2, a.y2, a.size ?? 4); c.beginPath(); c.moveTo(a.x2, a.y2); c.lineTo(p[0], p[1]); c.lineTo(q[0], q[1]); c.closePath(); c.fill(); }
    } else if (a.t === 'text') {
      c.font = `${a.size}px ${fontCss(a.font)}`; c.textBaseline = 'top'; const lines = String(a.text).split('\n');
      if (a.bg) { c.fillStyle = a.bg; c.fillRect(a.x - a.size * 0.2, a.y - a.size * 0.1, (a.w ?? 0) + a.size * 0.4, (a.h ?? a.size * 1.3) + a.size * 0.1); }
      c.fillStyle = a.color; lines.forEach((ln, i) => c.fillText(ln, a.x, a.y + i * a.size * 1.3));
    }
    c.restore();
  }
}
const measureText = (a) => { const c = mkCanvas(1, 1).getContext('2d'); c.font = `${a.size}px ${fontCss(a.font)}`; const lines = String(a.text).split('\n'); return { ...a, w: Math.max(...lines.map((l) => c.measureText(l).width)), h: lines.length * a.size * 1.3 }; };
const clone = (v) => JSON.parse(JSON.stringify(v));

export function imageView({ api, id, ctx }) {
  const root = h('section', { class: 'ix', 'aria-label': 'Image editor' }, skeleton(4));
  const gone = () => !root.isConnected;
  const load = async () => {
    const f = await api.call('drive.files.get', { id });
    if (!ctx.live()) return;
    if (!f.ok) { root.replaceChildren(f.status === 404 ? noAccessState({ action: h('a', { class: 'btn', href: '#/launcher' }, 'Back to the Launcher') }) : errorState(() => { root.replaceChildren(skeleton(4)); load(); })); return; }
    const file = f.data[0];
    if (file.kind !== 'file' || !M.isImageMime(file.mime_type)) { root.replaceChildren(h('div', { class: 'empty', role: 'status' }, icon('imgI'), h('h2', { 'data-page-title': true }, file.name), h('p', { class: 'muted' }, 'This file is not a picture the image editor can open (PNG, JPEG, WebP or GIF).'), h('a', { class: 'btn', href: '#/drive' }, 'Back to Drive'))); return; }
    const got = await readStored(api, id);
    if (!ctx.live()) return;
    if (got.error) { root.replaceChildren(errorState(() => { root.replaceChildren(skeleton(4)); load(); }, { title: 'We couldn’t open this picture', body: 'Your file is safe. Check your connection and try again.' })); return; }
    let bmp; try { bmp = await createImageBitmap(got.blob); } catch { bmp = null; }
    if (!bmp || bmp.width * bmp.height > MAX_PIXELS) { root.replaceChildren(h('div', { class: 'empty', role: 'status' }, icon('imgI'), h('h2', { 'data-page-title': true }, file.name), h('p', { class: 'muted' }, bmp ? 'This picture is too large to edit in the browser (over 64 megapixels). You can still download it from Drive.' : 'This picture could not be read. It may be damaged.'), h('a', { class: 'btn', href: '#/drive' }, 'Back to Drive'))); return; }
    const base = tag(mkCanvas(bmp.width, bmp.height)); base.getContext('2d').drawImage(bmp, 0, 0); bmp.close?.();
    mount(file, base, got.version ?? file.current_version);
  };

  function mount(file, firstBase, firstVersion) {
    const readOnly = Boolean(file.archived_at) || !ctx.can('drive.file.upload', file.client_id);
    let meta = file, version = firstVersion, savedAt = file.updated_at, status = readOnly ? 'readonly' : 'saved', saving = false;
    const orig = firstBase;                                         // "before": the picture as it was when opened
    const DEF = { ...M.ADJUST_DEFAULTS };
    let S = { base: firstBase, adj: { ...DEF }, filter: 'none', anns: [] };
    let rev = 0, savedRev = 0; S.rev = 0;
    const hist = M.createHistory(S);
    let tool = readOnly ? 'view' : 'select', sub = { draw: 'pen', shape: 'rect' }, draft = null, sel = null, compare = false, zoom = 'fit', crop = null, cropRatio = null, textEd = null;
    const opts = { color: '#e5484d', size: Math.max(3, Math.round(Math.max(firstBase.width, firstBase.height) / 220)), hlColor: '#fde047', textSize: Math.max(18, Math.round(firstBase.width / 24)), font: 'sans', textBg: false, textBgColor: '#ffffff', fill: false, lock: true };

    // ---------------------------------------------------------------- pieces of the page
    const statusEl = h('span', { class: 'docstate', role: 'status', 'aria-live': 'polite' });
    const cv = h('canvas', { class: 'ix-cv', 'aria-label': `${meta.name}, picture being edited`, role: 'img' });
    const wrap = h('div', { class: 'ix-wrap' }, cv);
    const stage = h('div', { class: 'ix-stage', tabindex: '0', 'aria-label': 'Picture. Right-click or press the menu key for actions. Plus and minus zoom.' }, wrap);
    const panel = h('div', { class: 'ix-panel' });
    const tools = h('div', { class: 'ix-tools', role: 'toolbar', 'aria-label': 'Tools' });
    const info = h('span', { class: 'fine muted ix-info' });
    const undoB = btn([icon('undo'), h('span', { class: 'sr' }, 'Undo')], () => undo(), 'ix-ic', { title: 'Undo (Ctrl+Z)' });
    const redoB = btn([icon('redo'), h('span', { class: 'sr' }, 'Redo')], () => redo(), 'ix-ic', { title: 'Redo (Ctrl+Shift+Z)' });
    const saveBtn = btn('Save', () => save(), 'primary');
    const cmpB = h('button', { type: 'button', class: 'btn ix-cmp', 'aria-pressed': 'false', title: 'Hold to see the original. Double-click or press Space to keep it on.' }, 'Before / after');
    const crumb = h('nav', { class: 'fpath fine', 'aria-label': 'Where this picture lives' }, h('a', { href: '#/drive' }, 'Drive'), h('span', { 'aria-hidden': 'true' }, ' / '), meta.space === 'personal' ? 'Personal' : ctx.orgName);

    // ---------------------------------------------------------------- rendering
    const dims = () => ({ W: S.base.width, H: S.base.height });
    const stageSize = () => ({ w: Math.max(200, stage.clientWidth - 24), h: Math.max(160, stage.clientHeight - 24) });
    const zoomValue = () => { const { W, H } = dims(); if (zoom !== 'fit') return zoom; const s = stageSize(); return Math.min(8, s.w / W, s.h / H); };
    let proc = { key: '', canvas: null };
    function processed(pw, ph) {
      const neutral = M.isNeutral(S.adj) && S.filter === 'none';
      if (neutral) return null;
      const key = `${S.base.__id}|${pw}|${JSON.stringify(S.adj)}|${S.filter}`;
      if (proc.key === key) return proc.canvas;
      const c = mkCanvas(pw, ph); const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(S.base, 0, 0, pw, ph);
      const img = x.getImageData(0, 0, pw, ph); M.processPixels(img.data, pw, ph, { adj: S.adj, filter: S.filter, scale: pw / 1000 }); x.putImageData(img, 0, 0);
      proc = { key, canvas: c }; return c;
    }
    let raf = 0;
    function render() { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; if (!gone()) paintNow(); }); }
    function paintNow() {
      const { W, H } = dims(); const k = Math.min(1, PREVIEW / Math.max(W, H)); const pw = Math.max(1, Math.round(W * k)), ph = Math.max(1, Math.round(H * k));
      if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
      const c = cv.getContext('2d'); c.clearRect(0, 0, pw, ph);
      if (compare) { const f = Math.min(pw / orig.width, ph / orig.height); const ow = orig.width * f, oh = orig.height * f; c.drawImage(orig, (pw - ow) / 2, (ph - oh) / 2, ow, oh); }
      else {
        const p = processed(pw, ph); if (p) c.drawImage(p, 0, 0); else c.drawImage(S.base, 0, 0, pw, ph);
        drawAnnotations(c, draft ? [...S.anns, draft] : S.anns, pw / W);
        if (sel != null && S.anns[sel]) { const b = M.annBounds(S.anns[sel]); c.save(); c.scale(pw / W, pw / W); c.setLineDash([6, 4]); c.lineWidth = 2 * (W / pw); c.strokeStyle = '#2b5cf0'; c.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8); c.restore(); }
      }
      layout();
    }
    function layout() {
      const { W, H } = dims(); const z = zoomValue();
      wrap.style.width = `${Math.round(W * z)}px`; wrap.style.height = `${Math.round(H * z)}px`;
      info.textContent = `${W} × ${H} px · ${Math.round(z * 100)}%`;
      if (crop) placeCrop();
    }
    const changed = () => { undoB.disabled = !hist.canUndo(); redoB.disabled = !hist.canRedo(); paintStatus(); };
    function paintStatus() {
      const isDirty = !readOnly && S.rev !== savedRev;
      if (!readOnly && !saving && status !== 'failed') { const was = status; status = isDirty ? 'dirty' : 'saved'; if (status === 'dirty' && was !== 'dirty') { dirty.set(meta.name, () => save()); window.addEventListener('beforeunload', warn); } if (status === 'saved') { dirty.clear(); window.removeEventListener('beforeunload', warn); } }
      const t = { saved: `Saved ${timeOf(savedAt)}`, dirty: 'Unsaved changes', saving: 'Saving…', failed: 'Couldn’t save. Your changes are still here.', readonly: 'Read only' }[status];
      statusEl.replaceChildren(h('span', { class: `dot ${status}` }), t, status === 'failed' ? btn('Retry', () => save(), 'link') : null);
      saveBtn.disabled = readOnly || status === 'saved' || saving || !M.saveFormat(meta.mime_type);
      saveBtn.title = !M.saveFormat(meta.mime_type) && !readOnly ? 'GIF files can’t be re-encoded here. Use Save as copy to keep a PNG.' : '';
    }
    const warn = (e) => { if (status === 'dirty' || status === 'failed') { e.preventDefault(); e.returnValue = ''; } };

    // ---------------------------------------------------------------- history
    function commit(next) { rev += 1; S = { ...next, rev }; hist.push(S); sel = sel != null && S.anns[sel] ? sel : null; changed(); render(); paintPanel(); }
    function live(patch) { S = { ...S, ...patch }; render(); }                       // while a slider moves: no history entry yet
    function settle() { if (hist.current() !== S && JSON.stringify([S.adj, S.filter, S.anns]) !== JSON.stringify([hist.current().adj, hist.current().filter, hist.current().anns])) { rev += 1; S = { ...S, rev }; hist.push(S); changed(); } }
    function undo() { if (!hist.canUndo()) return; S = hist.undo(); sel = null; crop = null; afterJump(); }
    function redo() { if (!hist.canRedo()) return; S = hist.redo(); sel = null; crop = null; afterJump(); }
    function afterJump() { changed(); render(); paintPanel(); }

    // ---------------------------------------------------------------- picture operations
    const flatten = () => { const { W, H } = dims(); const c = mkCanvas(W, H); const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(S.base, 0, 0);
      if (!M.isNeutral(S.adj) || S.filter !== 'none') { const img = x.getImageData(0, 0, W, H); M.processPixels(img.data, W, H, { adj: S.adj, filter: S.filter, scale: W / 1000 }); x.putImageData(img, 0, 0); }
      drawAnnotations(x, S.anns, 1); return tag(c); };
    function withBase(nb, op) { commit({ ...S, base: tag(nb), anns: op ? S.anns.map((a) => M.transformAnnotation(a, op)) : S.anns }); }
    function turn(cw) {
      const { W, H } = dims(); const c = mkCanvas(H, W); const x = c.getContext('2d');
      if (cw) { x.translate(H, 0); x.rotate(Math.PI / 2); } else { x.translate(0, W); x.rotate(-Math.PI / 2); }
      x.drawImage(S.base, 0, 0); withBase(c, { type: cw ? 'rot90cw' : 'rot90ccw', W, H });
    }
    function flip(horizontal) {
      const { W, H } = dims(); const c = mkCanvas(W, H); const x = c.getContext('2d');
      if (horizontal) { x.translate(W, 0); x.scale(-1, 1); } else { x.translate(0, H); x.scale(1, -1); }
      x.drawImage(S.base, 0, 0); withBase(c, { type: horizontal ? 'flipH' : 'flipV', W, H });
    }
    function rotateFree(deg) {
      if (!deg) return; const f = flatten(); const { W, H } = { W: f.width, H: f.height }; const size = M.rotatedSize(W, H, deg); const c = mkCanvas(size.w, size.h); const x = c.getContext('2d');
      x.translate(size.w / 2, size.h / 2); x.rotate((deg * Math.PI) / 180); x.drawImage(f, -W / 2, -H / 2);
      commit({ base: tag(c), adj: { ...DEF }, filter: 'none', anns: [] });
    }
    function resizeTo(nw, nh) {
      const { W, H } = dims(); if (nw === W && nh === H) return;
      let src = S.base; let cw = W, ch = H;
      while (nw < cw / 2 || nh < ch / 2) { const sw = Math.max(nw, Math.ceil(cw / 2)), sh = Math.max(nh, Math.ceil(ch / 2)); const t = mkCanvas(sw, sh); const tx = t.getContext('2d'); tx.imageSmoothingQuality = 'high'; tx.drawImage(src, 0, 0, sw, sh); src = t; cw = sw; ch = sh; }
      const c = mkCanvas(nw, nh); const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, nw, nh);
      commit({ ...S, base: tag(c), anns: S.anns.map((a) => M.transformAnnotation(a, { type: 'scale', k: nw / W })) });
    }
    function applyCrop() {
      if (!crop) return; const r = M.clampRect(crop, ...Object.values(dims()).slice(0, 2)); const c = mkCanvas(r.w, r.h); c.getContext('2d').drawImage(S.base, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      crop = null; withBase(c, { type: 'translate', dx: -r.x, dy: -r.y }); setTool('select');
    }
    function reset() { commit({ base: orig, adj: { ...DEF }, filter: 'none', anns: [] }); toast('Back to the original picture. You can undo this.'); }

    // ---------------------------------------------------------------- output
    const encode = (canvas, mime, q) => new Promise((resolve) => canvas.toBlob((b) => resolve(b), mime, q));
    async function renderOut(mime) {
      const f = flatten();
      if (mime === 'image/jpeg') { const c = mkCanvas(f.width, f.height); const x = c.getContext('2d'); x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(f, 0, 0); return c; }
      return f;
    }
    async function save() {
      const mime = M.saveFormat(meta.mime_type); if (readOnly || saving || !mime) return false;
      saving = true; status = 'saving'; paintStatus();
      const blob = await encode(await renderOut(mime), mime, 0.92);
      if (!blob || blob.type !== mime) { saving = false; status = 'failed'; paintStatus(); toast('This browser can’t save this format. Use Save as copy and choose PNG.', false); return false; }
      const r = await saveVersion(api, meta, blob, mime, version, 'Edited in the image editor');
      saving = false; if (gone()) return false;
      if (r.ok) { version = r.data[0].current_version; savedRev = S.rev; savedAt = new Date().toISOString(); status = 'saved'; paintStatus(); ctx.announce('Saved.'); toast('Saved as a new version.'); return true; }
      if (r.status === 409) { status = 'failed'; paintStatus(); conflict(); return false; }
      if (r.status === 404) { toast('You can read this but not change it, so your edit was not saved.', false); status = 'failed'; paintStatus(); return false; }
      status = 'failed'; paintStatus(); toast(r.message ?? 'Couldn’t save. Try again.', false); return false;
    }
    function conflict() {
      dialog({ title: 'Someone saved a newer version', body: [h('p', {}, 'While you were editing, another version of this picture was saved. Nothing has been overwritten.'), h('p', { class: 'fine muted' }, 'Both versions stay in History either way.')],
        actions: [{ label: 'Save mine as the newest', cls: 'primary', on: async () => { const cur = await api.call('drive.files.get', { id: meta.id }); if (!cur.ok) { toast('Couldn’t check the latest version. Try again.', false); return false; } version = cur.data[0].current_version; status = 'dirty'; await save(); } },
          { label: 'Save mine as a copy', on: async () => { await copyDialogSave(); } }, { label: 'Keep editing', focus: true }] });
    }
    async function copyDialogSave(fmt) {
      const mime = fmt || M.saveFormat(meta.mime_type) || 'image/png';
      const blob = await encode(await renderOut(mime), mime, 0.92); if (!blob) return toast('Couldn’t create the copy.', false);
      const r = await saveCopy(api, meta, blob, mime);
      if (r.ok) toast(`Saved a copy: ${r.data[0].name}`);
      else toast(r.message ?? 'Couldn’t save the copy.', false);
    }
    function saveAsCopy() {
      const fmtSel = h('select', { id: 'ix-cfmt', class: 'tbsel' }, ...[['image/png', 'PNG'], ['image/jpeg', 'JPEG'], ['image/webp', 'WebP']].map(([v, t]) => h('option', { value: v }, t))); fmtSel.value = M.saveFormat(meta.mime_type) || 'image/png';
      dialog({ title: 'Save as a copy', body: [h('p', {}, 'Creates a new file in the same place. The original stays as it is.'), h('label', { for: 'ix-cfmt' }, 'Format '), fmtSel],
        actions: [{ label: 'Save copy', cls: 'primary', on: async () => { await copyDialogSave(fmtSel.value); } }, { label: 'Cancel' }] });
    }
    function downloadDialog() {
      const fmtSel = h('select', { id: 'ix-dfmt', class: 'tbsel' }, ...[['image/png', 'PNG'], ['image/jpeg', 'JPEG'], ['image/webp', 'WebP']].map(([v, t]) => h('option', { value: v }, t)));
      const q = h('input', { id: 'ix-dq', type: 'range', min: '40', max: '100', value: '92' }); const qv = h('output', { for: 'ix-dq' }, '92%');
      const qrow = h('div', { class: 'ix-row' }, h('label', { for: 'ix-dq' }, 'Quality '), q, qv);
      q.addEventListener('input', () => { qv.textContent = `${q.value}%`; });
      const sync = () => { qrow.hidden = fmtSel.value === 'image/png'; }; fmtSel.addEventListener('change', sync); sync();
      dialog({ title: 'Download', body: [h('div', { class: 'ix-row' }, h('label', { for: 'ix-dfmt' }, 'Format '), fmtSel), qrow, h('p', { class: 'fine muted' }, 'The download includes your edits. The file in Drive is not changed.')],
        actions: [{ label: 'Download', cls: 'primary', on: async () => { const mime = fmtSel.value; const blob = await encode(await renderOut(mime), mime, Number(q.value) / 100); if (!blob) return toast('Couldn’t create the download.', false); downloadBlob(blob, M.withExt(meta.name, blob.type || mime)); } }, { label: 'Cancel' }] });
    }
    async function copyToClipboard() {
      try { const blob = await encode(await renderOut('image/png'), 'image/png'); await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); toast('Picture copied.'); }
      catch { toast('Your browser didn’t allow copying the picture. Use Download instead.', false); }
    }
    function restoredFrom(blob, newVersion) {
      createImageBitmap(blob).then((bmp) => { const b = tag(mkCanvas(bmp.width, bmp.height)); b.getContext('2d').drawImage(bmp, 0, 0); S = { base: b, adj: { ...DEF }, filter: 'none', anns: [], rev: ++rev }; savedRev = S.rev; hist.reset(S); version = newVersion; savedAt = new Date().toISOString(); status = 'saved'; sel = null; changed(); render(); paintPanel(); });
    }

    // ---------------------------------------------------------------- tools and panel
    const TOOLS = [['select', 'cursor', 'Select'], ['crop', 'crop', 'Crop'], ['transform', 'rotate', 'Rotate and resize'], ['adjust', 'sliders', 'Adjust'], ['filters', 'imgI', 'Filters'], ['draw', 'pen', 'Draw'], ['text', 'text', 'Text'], ['shape', 'shape', 'Shapes']];
    function setTool(t) {
      if (tool === 'crop' && t !== 'crop') crop = null;
      tool = t; sel = t === 'select' ? sel : null;
      if (t === 'crop') { const { W, H } = dims(); crop = M.cropForRatio(W, H, cropRatio); }
      closeTextEditor(); paintTools(); paintPanel(); render();
    }
    function paintTools() {
      tools.replaceChildren(...TOOLS.filter(([k]) => !readOnly || k === 'select').map(([k, ic, label]) => h('button', { type: 'button', class: 'ix-tool', 'aria-pressed': String(tool === k), title: label, onclick: () => setTool(k) }, icon(ic), h('span', {}, label))));
      stage.dataset.tool = tool;
    }
    const slider = (key, label, min, max, getV, onLive, onDone) => {
      const idn = `ix-s-${key}`; const out = h('output', { for: idn }, String(getV()));
      const inp = h('input', { id: idn, type: 'range', min: String(min), max: String(max), value: String(getV()) });
      inp.addEventListener('input', () => { out.textContent = inp.value; onLive(Number(inp.value)); }); inp.addEventListener('change', () => onDone?.());
      inp.addEventListener('dblclick', () => { inp.value = String(min < 0 ? 0 : min); inp.dispatchEvent(new Event('input')); inp.dispatchEvent(new Event('change')); });
      return h('div', { class: 'ix-sl' }, h('label', { for: idn }, label), inp, out);
    };
    const colorIn = (label, value, on) => { const idn = `ix-c-${label.replace(/\W/g, '')}`; const i = h('input', { id: idn, type: 'color', value }); i.addEventListener('input', () => on(i.value)); i.addEventListener('change', () => settle()); return h('div', { class: 'ix-row' }, h('label', { for: idn }, label), i); };
    const segBtns = (items, cur, on, label) => h('div', { class: 'ix-seg', role: 'group', 'aria-label': label }, ...items.map(([k, t]) => h('button', { type: 'button', class: 'btn', 'aria-pressed': String(cur === k), onclick: () => on(k) }, t)));
    function paintPanel() {
      const ro = readOnly; const kids = [];
      if (ro) kids.push(h('p', { class: 'fine muted' }, 'You can look at this picture, zoom, compare and download it. Editing needs permission to change files.'));
      else if (tool === 'select') {
        const a = sel != null ? S.anns[sel] : null;
        kids.push(h('h3', {}, 'Select'), h('p', { class: 'fine muted' }, a ? 'Drag to move. Delete removes it. Double-click text to edit it.' : 'Click something you drew or typed to move or remove it. Pick a tool on the left to change the picture.'));
        if (a) { kids.push(colorIn('Colour', a.color, (v) => { S = { ...S, anns: S.anns.map((x, i) => (i === sel ? { ...x, color: v } : x)) }; render(); }), btn('Delete', () => deleteSel(), '')); }
      } else if (tool === 'crop') {
        const { W, H } = dims(); const r = crop ?? { x: 0, y: 0, w: W, h: H };
        const num = (k, label) => { const i = h('input', { type: 'number', min: '0', max: String(k === 'x' || k === 'w' ? W : H), value: String(r[k]), 'aria-label': label }); i.addEventListener('change', () => { crop = M.clampRect({ ...crop, [k]: Number(i.value) }, W, H, 1); placeCrop(); paintPanel(); }); return h('label', { class: 'ix-num' }, label, i); };
        kids.push(h('h3', {}, 'Crop'), h('div', { class: 'ix-seg', role: 'group', 'aria-label': 'Shape' }, ...M.CROP_PRESETS.map((p) => h('button', { type: 'button', class: 'btn', 'aria-pressed': String(cropRatio === p.ratio), onclick: () => { cropRatio = p.ratio; crop = M.cropForRatio(W, H, p.ratio); placeCrop(); paintPanel(); } }, p.label))),
          h('div', { class: 'ix-grid4' }, num('x', 'Left'), num('y', 'Top'), num('w', 'Width'), num('h', 'Height')), h('div', { class: 'ix-row' }, btn('Apply crop', () => applyCrop(), 'primary'), btn('Cancel', () => setTool('select'), '')));
      } else if (tool === 'transform') {
        const { W, H } = dims(); let rw = W, rh = H; const wI = h('input', { id: 'ix-rw', type: 'number', min: '1', max: '16000', value: String(W) }), hI = h('input', { id: 'ix-rh', type: 'number', min: '1', max: '16000', value: String(H) });
        const lockI = h('input', { id: 'ix-lock', type: 'checkbox', checked: opts.lock }); lockI.addEventListener('change', () => { opts.lock = lockI.checked; });
        wI.addEventListener('input', () => { const d = M.resizeDims({ w: W, h: H }, 'w', wI.value, opts.lock); rw = d.w; rh = d.h; hI.value = String(rh); if (!opts.lock) rh = Number(hI.value); }); hI.addEventListener('input', () => { const d = M.resizeDims({ w: W, h: H }, 'h', hI.value, opts.lock); rh = d.h; rw = d.w; wI.value = String(rw); if (!opts.lock) rw = Number(wI.value); });
        const ang = h('input', { id: 'ix-ang', type: 'range', min: '-45', max: '45', step: '1', value: '0' }); const angO = h('output', { for: 'ix-ang' }, '0°'); ang.addEventListener('input', () => { angO.textContent = `${ang.value}°`; });
        kids.push(h('h3', {}, 'Rotate and flip'), h('div', { class: 'ix-row' }, btn('Turn left', () => turn(false), ''), btn('Turn right', () => turn(true), ''), btn('Flip horizontal', () => flip(true), ''), btn('Flip vertical', () => flip(false), '')),
          h('div', { class: 'ix-sl' }, h('label', { for: 'ix-ang' }, 'Any angle'), ang, angO), btn('Apply angle', () => rotateFree(Number(ang.value)), ''), h('p', { class: 'fine muted' }, 'A free angle flattens your adjustments and drawings into the picture first.'),
          h('h3', {}, 'Resize'), h('div', { class: 'ix-grid4' }, h('label', { class: 'ix-num', for: 'ix-rw' }, 'Width (px)', wI), h('label', { class: 'ix-num', for: 'ix-rh' }, 'Height (px)', hI)),
          h('label', { class: 'ix-check' }, lockI, 'Keep the shape'), btn('Apply size', () => { const w = M.clamp(Number(wI.value) || W, 1, 16000), hh = M.clamp(Number(hI.value) || H, 1, 16000); if (w * hh > MAX_PIXELS) return toast('That is too large.', false); resizeTo(Math.round(w), Math.round(hh)); }, ''));
      } else if (tool === 'adjust') {
        kids.push(h('h3', {}, 'Adjust'), ...SLIDERS.map(([k, l, lo, hi]) => slider(k, l, lo, hi, () => S.adj[k] ?? 0, (v) => live({ adj: { ...S.adj, [k]: v } }), () => settle())), btn('Reset adjustments', () => commit({ ...S, adj: { ...DEF } }), ''));
      } else if (tool === 'filters') {
        const t = M.fitSize(S.base.width, S.base.height, 96, 96);
        kids.push(h('h3', {}, 'Filters'), h('div', { class: 'ix-filters' }, ...Object.entries(M.FILTERS).map(([k, f]) => {
          const c = mkCanvas(t.w, t.h); const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(S.base, 0, 0, t.w, t.h); const img = x.getImageData(0, 0, t.w, t.h); M.processPixels(img.data, t.w, t.h, { filter: k }); x.putImageData(img, 0, 0); c.setAttribute('aria-hidden', 'true');
          return h('button', { type: 'button', class: 'ix-filter', 'aria-pressed': String(S.filter === k), onclick: () => commit({ ...S, filter: k }) }, c, h('span', {}, f.label));
        })));
      } else if (tool === 'draw') {
        kids.push(h('h3', {}, 'Draw'), segBtns([['pen', 'Pen'], ['hl', 'Highlighter'], ['eraser', 'Eraser']], sub.draw, (k) => { sub.draw = k; paintPanel(); }, 'Drawing tool'));
        if (sub.draw !== 'eraser') kids.push(colorIn('Colour', sub.draw === 'hl' ? opts.hlColor : opts.color, (v) => { if (sub.draw === 'hl') opts.hlColor = v; else opts.color = v; }));
        kids.push(slider('size', sub.draw === 'eraser' ? 'Eraser size' : 'Size', 1, 80, () => opts.size, (v) => { opts.size = v; }), h('p', { class: 'fine muted' }, sub.draw === 'eraser' ? 'Drag over drawings, text and shapes to remove them. The picture itself is not erased.' : 'Draw on the picture. Undo takes the last stroke back.'));
      } else if (tool === 'text') {
        const fsel = h('select', { id: 'ix-font', class: 'tbsel' }, ...FONTS.map(([k, l]) => h('option', { value: k }, l))); fsel.value = opts.font; fsel.addEventListener('change', () => { opts.font = fsel.value; });
        const bgC = h('input', { id: 'ix-tbg', type: 'checkbox', checked: opts.textBg }); bgC.addEventListener('change', () => { opts.textBg = bgC.checked; });
        kids.push(h('h3', {}, 'Text'), h('div', { class: 'ix-row' }, h('label', { for: 'ix-font' }, 'Font'), fsel), slider('tsize', 'Size', 8, Math.max(120, Math.round(dims().W / 6)), () => opts.textSize, (v) => { opts.textSize = v; }), colorIn('Colour', opts.color, (v) => { opts.color = v; }),
          h('label', { class: 'ix-check' }, bgC, 'Background behind text'), colorIn('Background', opts.textBgColor, (v) => { opts.textBgColor = v; }), h('p', { class: 'fine muted' }, 'Click the picture where the text should start. Ctrl+Enter or clicking away places it.'));
      } else if (tool === 'shape') {
        const fillC = h('input', { id: 'ix-fill', type: 'checkbox', checked: opts.fill }); fillC.addEventListener('change', () => { opts.fill = fillC.checked; });
        kids.push(h('h3', {}, 'Shapes'), segBtns([['rect', 'Rectangle'], ['ellipse', 'Ellipse'], ['arrow', 'Arrow'], ['line', 'Line']], sub.shape, (k) => { sub.shape = k; paintPanel(); }, 'Shape'), colorIn('Colour', opts.color, (v) => { opts.color = v; }), slider('lsize', 'Line width', 1, 60, () => opts.size, (v) => { opts.size = v; }),
          ['rect', 'ellipse'].includes(sub.shape) ? h('label', { class: 'ix-check' }, fillC, 'Fill the shape') : null, h('p', { class: 'fine muted' }, 'Drag on the picture to draw.'));
      }
      panel.replaceChildren(...kids.filter(Boolean));
    }
    function deleteSel() { if (sel == null || readOnly) return; const next = S.anns.filter((_, i) => i !== sel); sel = null; commit({ ...S, anns: next }); }

    // ---------------------------------------------------------------- crop box
    const cropBox = h('div', { class: 'ix-crop', hidden: true }, ...['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((hd) => h('span', { class: `ix-h ${hd}`, 'data-h': hd })));
    wrap.append(cropBox);
    function placeCrop() {
      cropBox.hidden = !crop; if (!crop) return; const z = zoomValue();
      cropBox.style.left = `${crop.x * z}px`; cropBox.style.top = `${crop.y * z}px`; cropBox.style.width = `${crop.w * z}px`; cropBox.style.height = `${crop.h * z}px`;
    }
    cropBox.addEventListener('pointerdown', (e) => {
      if (!crop) return; e.preventDefault(); const hd = e.target.dataset?.h || 'move'; const start = { ...crop }; const x0 = e.clientX, y0 = e.clientY, z = zoomValue(); const bounds = { w: dims().W, h: dims().H };
      cropBox.setPointerCapture(e.pointerId);
      const mv = (ev) => { crop = M.dragCrop(start, hd, (ev.clientX - x0) / z, (ev.clientY - y0) / z, { w: bounds.w, h: bounds.h }, cropRatio); placeCrop(); };
      const up = () => { cropBox.removeEventListener('pointermove', mv); cropBox.removeEventListener('pointerup', up); paintPanel(); };
      cropBox.addEventListener('pointermove', mv); cropBox.addEventListener('pointerup', up);
    });

    // ---------------------------------------------------------------- pointer work on the picture
    const imgPoint = (e) => { const r = cv.getBoundingClientRect(); const { W, H } = dims(); return M.toImagePoint(e.clientX, e.clientY, r, W, H); };
    const topHit = (p) => { for (let i = S.anns.length - 1; i >= 0; i--) if (M.hitAnnotation(S.anns[i], p.x, p.y, 8 / zoomValue())) return i; return -1; };
    let drag = null;
    cv.addEventListener('pointerdown', (e) => {
      if (readOnly || compare || e.button !== 0) return; const p = imgPoint(e);
      if (tool === 'select') { const i = topHit(p); sel = i >= 0 ? i : null; paintPanel(); render(); if (i >= 0) { drag = { kind: 'move', last: p, moved: false }; cv.setPointerCapture(e.pointerId); } }
      else if (tool === 'draw') {
        cv.setPointerCapture(e.pointerId);
        if (sub.draw === 'eraser') { drag = { kind: 'erase', removed: false, r: opts.size }; eraseAt(p); }
        else { draft = { t: sub.draw, color: sub.draw === 'hl' ? opts.hlColor : opts.color, size: sub.draw === 'hl' ? opts.size * 3 : opts.size, pts: [[p.x, p.y]] }; drag = { kind: 'draw' }; render(); }
      } else if (tool === 'shape') { cv.setPointerCapture(e.pointerId); draft = { t: sub.shape, color: opts.color, size: opts.size, x1: p.x, y1: p.y, x2: p.x, y2: p.y, ...(opts.fill && ['rect', 'ellipse'].includes(sub.shape) ? { fill: opts.color } : {}) }; drag = { kind: 'shape' }; }
      else if (tool === 'text') { e.preventDefault(); setTimeout(() => openTextEditor(p), 0); }
    });
    cv.addEventListener('pointermove', (e) => {
      if (!drag) return; const p = imgPoint(e);
      if (drag.kind === 'move') { const dx = p.x - drag.last.x, dy = p.y - drag.last.y; if (dx || dy) { S = { ...S, anns: S.anns.map((a, i) => (i === sel ? M.moveAnnotation(a, dx, dy) : a)) }; drag.last = p; drag.moved = true; render(); } }
      else if (drag.kind === 'erase') eraseAt(p);
      else if (drag.kind === 'draw') { const last = draft.pts.at(-1); if (Math.hypot(p.x - last[0], p.y - last[1]) > 0.5 / zoomValue()) { draft.pts.push([p.x, p.y]); render(); } }
      else if (drag.kind === 'shape') { draft.x2 = p.x; draft.y2 = p.y; if (e.shiftKey && ['rect', 'ellipse'].includes(draft.t)) { const s = Math.max(Math.abs(p.x - draft.x1), Math.abs(p.y - draft.y1)); draft.x2 = draft.x1 + Math.sign(p.x - draft.x1 || 1) * s; draft.y2 = draft.y1 + Math.sign(p.y - draft.y1 || 1) * s; } render(); }
    });
    const endDrag = () => {
      if (!drag) return; const d = drag; drag = null;
      if (d.kind === 'move') { if (d.moved) { rev += 1; S = { ...S, rev }; hist.push(S); changed(); } }
      else if (d.kind === 'erase') { if (d.removed) { rev += 1; S = { ...S, rev }; hist.push(S); changed(); } }
      else if (d.kind === 'draw' && draft) { const a = draft; draft = null; commit({ ...S, anns: [...S.anns, a] }); }
      else if (d.kind === 'shape' && draft) { const a = draft; draft = null; if (['line', 'arrow'].includes(a.t) ? Math.hypot(a.x2 - a.x1, a.y2 - a.y1) > 2 : Math.abs(a.x2 - a.x1) > 2 && Math.abs(a.y2 - a.y1) > 2) commit({ ...S, anns: [...S.anns, a] }); else render(); }
    };
    cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);
    function eraseAt(p) { const r = Math.max(6 / zoomValue(), drag.r / 2); const keep = S.anns.filter((a) => !M.hitAnnotation(a, p.x, p.y, r)); if (keep.length !== S.anns.length) { S = { ...S, anns: keep }; drag.removed = true; sel = null; render(); } }
    cv.addEventListener('dblclick', (e) => { if (readOnly || tool !== 'select') return; const i = topHit(imgPoint(e)); if (i >= 0 && S.anns[i].t === 'text') openTextEditor({ x: S.anns[i].x, y: S.anns[i].y }, i); });

    // ---------------------------------------------------------------- text entry
    function openTextEditor(p, editIndex = null) {
      closeTextEditor(); const z = zoomValue(); const old = editIndex != null ? S.anns[editIndex] : null;
      const ta = h('textarea', { class: 'ix-text', rows: '1', 'aria-label': 'Text to place on the picture', value: old?.text ?? '' }); ta.value = old?.text ?? '';
      ta.style.left = `${p.x * z}px`; ta.style.top = `${p.y * z}px`; ta.style.fontSize = `${Math.max(12, (old?.size ?? opts.textSize) * z)}px`; ta.style.fontFamily = fontCss(old?.font ?? opts.font); ta.style.color = old?.color ?? opts.color;
      const grow = () => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight}px`; }; ta.addEventListener('input', grow);
      ta.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeTextEditor(true); } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); closeTextEditor(); } });
      ta.addEventListener('blur', () => setTimeout(() => closeTextEditor(), 0));
      wrap.append(ta); textEd = { ta, p, editIndex, old }; ta.focus(); grow();
    }
    function closeTextEditor(discard = false) {
      if (!textEd) return; const { ta, p, editIndex, old } = textEd; textEd = null; const text = ta.value.replace(/\s+$/, ''); ta.remove();
      if (discard || !text) return;
      const ann = measureText({ t: 'text', x: p.x, y: p.y, text, size: old?.size ?? opts.textSize, font: old?.font ?? opts.font, color: old?.color ?? opts.color, ...((old ? old.bg : opts.textBg) ? { bg: old?.bg ?? opts.textBgColor } : {}) });
      commit({ ...S, anns: editIndex != null ? S.anns.map((x, i) => (i === editIndex ? ann : x)) : [...S.anns, ann] });
    }

    // ---------------------------------------------------------------- zoom, compare, menu, keys
    const setZoom = (z) => { zoom = z === 'fit' ? 'fit' : M.clamp(z, 0.05, 16); layout(); zoomOut.textContent = zoom === 'fit' ? 'Fit' : `${Math.round(zoom * 100)}%`; };
    const zoomOut = h('span', { class: 'ix-zv', 'aria-hidden': 'true' }, 'Fit');
    const zbar = h('div', { class: 'ix-zoom', role: 'group', 'aria-label': 'Zoom' }, btn([icon('zout'), h('span', { class: 'sr' }, 'Zoom out')], () => setZoom(zoomValue() / 1.25), 'ix-ic'), zoomOut, btn([icon('zin'), h('span', { class: 'sr' }, 'Zoom in')], () => setZoom(zoomValue() * 1.25), 'ix-ic'), btn('Fit', () => setZoom('fit'), ''), btn('100%', () => setZoom(1), ''));
    stage.addEventListener('wheel', (e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom(zoomValue() * (e.deltaY < 0 ? 1.1 : 1 / 1.1)); } }, { passive: false });
    const holdCompare = (on) => { compare = on; cmpB.setAttribute('aria-pressed', String(on)); render(); };
    let cmpToggle = false;
    cmpB.addEventListener('pointerdown', () => { holdCompare(true); }); cmpB.addEventListener('pointerup', () => { if (!cmpToggle) holdCompare(false); }); cmpB.addEventListener('pointerleave', () => { if (!cmpToggle) holdCompare(false); });
    cmpB.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); cmpToggle = !cmpToggle; holdCompare(cmpToggle); } });
    cmpB.addEventListener('dblclick', () => { cmpToggle = !cmpToggle; holdCompare(cmpToggle); });
    let menu = null;
    const closeMenu = () => { menu?.remove(); menu = null; document.removeEventListener('pointerdown', outside, true); };
    const outside = (e) => { if (menu && !menu.contains(e.target)) closeMenu(); };
    function openMenu(x, y) {
      closeMenu();
      const item = (label, on, off) => h('button', { type: 'button', role: 'menuitem', class: 'ix-mi', disabled: off || false, onclick: () => { closeMenu(); on(); } }, label);
      menu = h('div', { class: 'ix-menu', role: 'menu', 'aria-label': 'Picture actions' }, item('Undo', undo, !hist.canUndo() || readOnly), item('Redo', redo, !hist.canRedo() || readOnly), h('hr'), item('Copy picture', copyToClipboard), item('Reset to the original', reset, readOnly || (S.base === orig && M.isNeutral(S.adj) && S.filter === 'none' && !S.anns.length)), item('Download…', downloadDialog));
      document.body.append(menu); const r = menu.getBoundingClientRect(); menu.style.left = `${Math.max(8, Math.min(x, innerWidth - r.width - 8))}px`; menu.style.top = `${Math.max(8, Math.min(y, innerHeight - r.height - 8))}px`;
      menu.querySelector('button:not(:disabled)')?.focus(); document.addEventListener('pointerdown', outside, true);
      menu.addEventListener('keydown', (e) => { const b = [...menu.querySelectorAll('button:not(:disabled)')]; const i = b.indexOf(document.activeElement); if (e.key === 'Escape') { closeMenu(); stage.focus(); } else if (e.key === 'ArrowDown') { e.preventDefault(); b[(i + 1) % b.length]?.focus(); } else if (e.key === 'ArrowUp') { e.preventDefault(); b[(i - 1 + b.length) % b.length]?.focus(); } });
    }
    stage.addEventListener('contextmenu', (e) => { e.preventDefault(); openMenu(e.clientX, e.clientY); });
    const onKey = (e) => {
      if (gone()) { document.removeEventListener('keydown', onKey); closeMenu(); return; }
      if (e.target.closest?.('input,textarea,select,[contenteditable=true]') && !(e.ctrlKey || e.metaKey)) return;
      if (document.querySelector('.ovl, .drawer')) return;
      const mod = e.ctrlKey || e.metaKey; const k = e.key.toLowerCase();
      if (mod && k === 's') { e.preventDefault(); save(); } else if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); } else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
      else if ((k === 'delete' || k === 'backspace') && sel != null) { e.preventDefault(); deleteSel(); } else if (k === 'escape') { if (tool === 'crop' || sel != null) { sel = null; if (tool === 'crop') setTool('select'); else render(); } }
      else if (k === '+' || k === '=') setZoom(zoomValue() * 1.25); else if (k === '-') setZoom(zoomValue() / 1.25); else if (k === '0') setZoom('fit');
    };
    document.addEventListener('keydown', onKey);
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (gone()) ro.disconnect(); else if (zoom === 'fit') layout(); }) : null; ro?.observe(stage);

    // ---------------------------------------------------------------- page assembly
    const banners = [];
    if (meta.archived_at) banners.push(notice('info', 'eye', [h('b', {}, 'Archived.'), ' This picture is read only.']));
    else if (readOnly) banners.push(readOnlyNotice('You can look at this picture but not change it'));
    if (!readOnly && !M.saveFormat(meta.mime_type)) banners.push(notice('info', 'info', [h('b', {}, 'GIF picture.'), ' The first frame is shown. Use Save as copy to keep your edits as a PNG; Save is only for PNG, JPEG and WebP.']));
    const bar = h('div', { class: 'ix-bar' },
      h('div', { class: 'ix-title' }, crumb, h('h1', { 'data-page-title': true, class: 'ix-name' }, meta.name)),
      h('div', { class: 'docacts' }, statusEl, undoB, redoB, cmpB, btn('History', () => versionsDrawer({ api, file: meta, current: () => version, readOnly, canRestore: !readOnly && status !== 'dirty', onRestored: restoredFrom }), ''), btn('Download', () => downloadDialog(), ''), readOnly ? null : btn('Save as copy', () => saveAsCopy(), ''), saveBtn));
    root.replaceChildren(...banners, bar, h('div', { class: 'ix-body' }, tools, h('div', { class: 'ix-center' }, stage, h('div', { class: 'ix-foot' }, info, zbar)), h('aside', { class: 'ix-side', 'aria-label': 'Tool options' }, panel)));
    document.title = `${meta.name} · Image editor`;
    paintTools(); paintPanel(); changed(); setZoom('fit'); render();
    cmpB.hidden = false;
  }
  load();
  return root;
}
