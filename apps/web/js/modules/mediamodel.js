// Pure helpers for the image editor and the PDF editor (no DOM, no network): which files open in which editor, crop / resize / rotate geometry,
// colour matrices for adjustments and filters, blur and sharpen on raw pixel data, annotation hit-testing, PDF page operations (delete, reorder,
// rotate, merge, extract), page-range parsing and the translation of an on-screen annotation into PDF drawing commands. Tested in test/media.test.mjs.

// ---------------------------------------------------------------- which editor opens a file
export const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const norm = (m) => String(m ?? '').split(';')[0].trim().toLowerCase();
export const isImageMime = (m) => IMAGE_MIMES.includes(norm(m));
export const isPdfMime = (m) => norm(m) === 'application/pdf';
/** The editor address for a stored file (kind "file"), or null when the file has no editor (Drive then downloads it). */
export const mediaHref = (f) => (!f || f.kind !== 'file' || !f.id ? null : isImageMime(f.mime_type) ? `#/image/${f.id}` : isPdfMime(f.mime_type) ? `#/pdf/${f.id}` : null);

// ---------------------------------------------------------------- file names and formats
export const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'application/pdf': 'pdf' };
/** The name with the extension of `mime` (replacing a known image extension; keeping other dots in the name). */
export function withExt(name, mime) {
  const ext = EXT[norm(mime)]; const base = String(name ?? 'image').replace(/\.(png|jpe?g|webp|gif|pdf)$/i, '') || 'image';
  return ext ? `${base}.${ext}` : String(name ?? base);
}
export function copyName(name, mime) { const base = String(name ?? 'file').replace(/\.(png|jpe?g|webp|gif|pdf)$/i, '') || 'file'; return withExt(`${base} (copy)`, mime); }
/** What "Save" can write for a given original: the same format when the browser can encode it, nothing for GIF (only a copy as PNG). */
export function saveFormat(origMime) { const m = norm(origMime); return m === 'image/png' ? 'image/png' : m === 'image/jpeg' ? 'image/jpeg' : m === 'image/webp' ? 'image/webp' : null; }

// ---------------------------------------------------------------- geometry
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
/** Largest size that fits inside maxW x maxH keeping the ratio (never enlarges unless `grow`). */
export function fitSize(w, h, maxW, maxH, grow = false) { const s = Math.min(maxW / w, maxH / h); const k = grow ? s : Math.min(1, s); return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)), scale: k }; }
export const CROP_PRESETS = [{ key: 'free', label: 'Free', ratio: null }, { key: '1:1', label: '1:1', ratio: 1 }, { key: '4:3', label: '4:3', ratio: 4 / 3 }, { key: '16:9', label: '16:9', ratio: 16 / 9 }, { key: '9:16', label: '9:16', ratio: 9 / 16 }];
/** The biggest centred rectangle of the given ratio (w/h) inside an image; null ratio = the whole image. */
export function cropForRatio(w, h, ratio) {
  if (!ratio) return { x: 0, y: 0, w, h };
  let cw = w, ch = Math.round(w / ratio); if (ch > h) { ch = h; cw = Math.round(h * ratio); }
  return { x: Math.round((w - cw) / 2), y: Math.round((h - ch) / 2), w: Math.max(1, cw), h: Math.max(1, ch) };
}
export function clampRect(r, w, h, min = 8) {
  const rw = clamp(Math.round(r.w), Math.min(min, w), w), rh = clamp(Math.round(r.h), Math.min(min, h), h);
  return { x: clamp(Math.round(r.x), 0, w - rw), y: clamp(Math.round(r.y), 0, h - rh), w: rw, h: rh };
}
/** Drag one handle of the crop rectangle by (dx, dy). Handles: n s e w ne nw se sw, or "move". A ratio (w/h) keeps the shape. */
export function dragCrop(rect, handle, dx, dy, bounds, ratio = null, min = 8) {
  let { x, y, w, h } = rect; const right = x + w, bottom = y + h;
  if (handle === 'move') return clampRect({ x: x + dx, y: y + dy, w, h }, bounds.w, bounds.h, min);
  let l = x, t = y, r = right, b = bottom;
  if (handle.includes('w')) l = clamp(x + dx, 0, right - min); if (handle.includes('e')) r = clamp(right + dx, x + min, bounds.w);
  if (handle.includes('n')) t = clamp(y + dy, 0, bottom - min); if (handle.includes('s')) b = clamp(bottom + dy, y + min, bounds.h);
  if (ratio) {
    let nw = r - l, nh = b - t;
    const fromWidth = handle.length === 2 ? Math.abs(dx) >= Math.abs(dy) : 'ew'.includes(handle);
    if (fromWidth) nh = nw / ratio; else nw = nh * ratio;
    // keep the opposite corner fixed, then shrink to stay inside the image
    const anchorX = handle.includes('w') ? right : handle.includes('e') ? x : x + w / 2, anchorY = handle.includes('n') ? bottom : handle.includes('s') ? y : y + h / 2;
    const maxW = handle.includes('w') ? anchorX : handle.includes('e') ? bounds.w - anchorX : 2 * Math.min(anchorX, bounds.w - anchorX);
    const maxH = handle.includes('n') ? anchorY : handle.includes('s') ? bounds.h - anchorY : 2 * Math.min(anchorY, bounds.h - anchorY);
    const k = Math.min(1, maxW / nw, maxH / nh); nw *= k; nh *= k;
    l = handle.includes('w') ? anchorX - nw : handle.includes('e') ? anchorX : anchorX - nw / 2; t = handle.includes('n') ? anchorY - nh : handle.includes('s') ? anchorY : anchorY - nh / 2;
    return clampRect({ x: l, y: t, w: nw, h: nh }, bounds.w, bounds.h, 1);
  }
  return clampRect({ x: l, y: t, w: r - l, h: b - t }, bounds.w, bounds.h, min);
}
/** New size after the person edits one of width / height; `lock` keeps the ratio. */
export function resizeDims(orig, edited, value, lock = true) {
  const v = Math.max(1, Math.min(16000, Math.round(Number(value) || 1)));
  if (!lock) return edited === 'w' ? { w: v, h: orig.h } : { w: orig.w, h: v };
  return edited === 'w' ? { w: v, h: Math.max(1, Math.round((v * orig.h) / orig.w)) } : { w: Math.max(1, Math.round((v * orig.w) / orig.h)), h: v };
}
/** Canvas size that holds the whole image after turning it by `deg` degrees. */
export function rotatedSize(w, h, deg) { const a = (deg * Math.PI) / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a)); return { w: Math.max(1, Math.round(w * c + h * s)), h: Math.max(1, Math.round(w * s + h * c)) }; }
/** A point on a pointer-event surface expressed in image pixels. */
export const toImagePoint = (clientX, clientY, box, imgW, imgH) => ({ x: ((clientX - box.left) / box.width) * imgW, y: ((clientY - box.top) / box.height) * imgH });

// ---------------------------------------------------------------- colour matrices (4 rows R,G,B,A; 5 columns: R G B A + offset in 0..255)
export const IDENT = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
/** Matrix that applies `a` first and then `b`. */
export function mulMatrix(a, b) {
  const o = new Array(20).fill(0);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) {
    let s = c === 4 ? b[r * 5 + 4] : 0;
    for (let k = 0; k < 4; k++) s += b[r * 5 + k] * a[k * 5 + c];
    o[r * 5 + c] = s;
  }
  return o;
}
const satMatrix = (s) => { const lr = 0.299, lg = 0.587, lb = 0.114; return [lr * (1 - s) + s, lg * (1 - s), lb * (1 - s), 0, 0, lr * (1 - s), lg * (1 - s) + s, lb * (1 - s), 0, 0, lr * (1 - s), lg * (1 - s), lb * (1 - s) + s, 0, 0, 0, 0, 0, 1, 0]; };
const gainMatrix = (r, g, b, off = 0) => [r, 0, 0, 0, off, 0, g, 0, 0, off, 0, 0, b, 0, off, 0, 0, 0, 1, 0];
const contrastMatrix = (c) => { const k = clamp(c, -99, 99) * 2.55; const f = (259 * (k + 255)) / (255 * (259 - k)); return gainMatrix(f, f, f, 128 * (1 - f)); };
export const ADJUST_DEFAULTS = { brightness: 0, contrast: 0, saturation: 0, exposure: 0, warmth: 0, blur: 0, sharpen: 0 };
export const isNeutral = (adj) => Object.keys(ADJUST_DEFAULTS).every((k) => !Number(adj?.[k]));
/** Each slider runs -100..100 (blur and sharpen 0..100). */
export function adjustMatrix(adj = {}) {
  const a = { ...ADJUST_DEFAULTS, ...adj }; let m = IDENT;
  if (a.exposure) { const g = 2 ** (a.exposure / 60); m = mulMatrix(m, gainMatrix(g, g, g)); }
  if (a.warmth) { const w = a.warmth / 100; m = mulMatrix(m, gainMatrix(1 + 0.22 * w, 1 + 0.02 * w, 1 - 0.22 * w)); }
  if (a.saturation) m = mulMatrix(m, satMatrix(1 + a.saturation / 100));
  if (a.contrast) m = mulMatrix(m, contrastMatrix(a.contrast));
  if (a.brightness) m = mulMatrix(m, gainMatrix(1, 1, 1, a.brightness * 1.275));
  return m;
}
export const FILTERS = {
  none: { label: 'Original', matrix: IDENT },
  grayscale: { label: 'Grayscale', matrix: satMatrix(0) },
  sepia: { label: 'Sepia', matrix: [0.393, 0.769, 0.189, 0, 0, 0.349, 0.686, 0.168, 0, 0, 0.272, 0.534, 0.131, 0, 0, 0, 0, 0, 1, 0] },
  vintage: { label: 'Vintage', matrix: mulMatrix(mulMatrix([0.5 + 0.393 * 0.5, 0.769 * 0.5, 0.189 * 0.5, 0, 0, 0.349 * 0.5, 0.5 + 0.686 * 0.5, 0.168 * 0.5, 0, 0, 0.272 * 0.5, 0.534 * 0.5, 0.5 + 0.131 * 0.5, 0, 0, 0, 0, 0, 1, 0], contrastMatrix(-15)), gainMatrix(1, 1, 1, 14)) },
  contrast: { label: 'High contrast', matrix: mulMatrix(contrastMatrix(55), satMatrix(1.15)) },
  invert: { label: 'Invert', matrix: [-1, 0, 0, 0, 255, 0, -1, 0, 0, 255, 0, 0, -1, 0, 255, 0, 0, 0, 1, 0] },
};
/** Apply a 4x5 matrix to RGBA bytes in place (a Uint8ClampedArray clamps for us; plain arrays are clamped here). */
export function applyMatrix(data, m) {
  const [a0, a1, a2, a3, a4, b0, b1, b2, b3, b4, c0, c1, c2, c3, c4] = m;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], al = data[i + 3];
    data[i] = clamp(a0 * r + a1 * g + a2 * b + a3 * al + a4, 0, 255); data[i + 1] = clamp(b0 * r + b1 * g + b2 * b + b3 * al + b4, 0, 255); data[i + 2] = clamp(c0 * r + c1 * g + c2 * b + c3 * al + c4, 0, 255);
  }
  return data;
}
/** Separable box blur on RGBA bytes (two passes approximate a soft blur). Returns a new array. */
export function boxBlur(src, w, h, radius) {
  const r = Math.round(radius); if (r < 1) return Uint8ClampedArray.from(src);
  let a = Uint8ClampedArray.from(src), b = new Uint8ClampedArray(src.length);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) for (let ch = 0; ch < 4; ch++) {            // horizontal
      let sum = 0, cnt = 0; const row = y * w * 4 + ch;
      for (let x = -r; x <= r; x++) { const xi = clamp(x, 0, w - 1); sum += a[row + xi * 4]; cnt++; }
      for (let x = 0; x < w; x++) { b[row + x * 4] = sum / cnt; sum += a[row + clamp(x + r + 1, 0, w - 1) * 4] - a[row + clamp(x - r, 0, w - 1) * 4]; }
    }
    for (let x = 0; x < w; x++) for (let ch = 0; ch < 4; ch++) {            // vertical
      let sum = 0, cnt = 0; const col = x * 4 + ch;
      for (let y = -r; y <= r; y++) { const yi = clamp(y, 0, h - 1); sum += b[col + yi * w * 4]; cnt++; }
      for (let y = 0; y < h; y++) { a[col + y * w * 4] = sum / cnt; sum += b[col + clamp(y + r + 1, 0, h - 1) * w * 4] - b[col + clamp(y - r, 0, h - 1) * w * 4]; }
    }
  }
  return a;
}
/** Run the whole adjustment pipeline on RGBA bytes in place. `scale` shrinks pixel-based radii when working on a smaller preview. */
export function processPixels(data, w, h, { adj = {}, filter = 'none', scale = 1 } = {}) {
  const a = { ...ADJUST_DEFAULTS, ...adj };
  let m = adjustMatrix(a); const f = FILTERS[filter]; if (f && filter !== 'none') m = mulMatrix(m, f.matrix);
  if (m.some((v, i) => Math.abs(v - IDENT[i]) > 1e-9)) applyMatrix(data, m);
  if (a.blur > 0) { const out = boxBlur(data, w, h, (a.blur / 100) * 12 * scale); data.set(out); }
  if (a.sharpen > 0) { const blurred = boxBlur(data, w, h, Math.max(1, 1.5 * scale)); const k = (a.sharpen / 100) * 1.6; for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) data[i + c] = clamp(data[i + c] + k * (data[i + c] - blurred[i + c]), 0, 255); }
  return data;
}

// ---------------------------------------------------------------- annotations (image editor): hit-testing and bounds, all in image pixels
const segDist = (px, py, x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy; const t = l2 ? clamp(((px - x1) * dx + (py - y1) * dy) / l2, 0, 1) : 0; return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)); };
export function annBounds(a) {
  if (a.t === 'pen' || a.t === 'hl') { const xs = a.pts.map((p) => p[0]), ys = a.pts.map((p) => p[1]); const pad = (a.size ?? 4) / 2; return { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(...xs) - Math.min(...xs) + 2 * pad, h: Math.max(...ys) - Math.min(...ys) + 2 * pad }; }
  if (a.t === 'text') return { x: a.x, y: a.y, w: a.w ?? a.text.length * a.size * 0.6, h: a.h ?? a.size * 1.3 * (String(a.text).split('\n').length) };
  const x = Math.min(a.x1, a.x2), y = Math.min(a.y1, a.y2); return { x, y, w: Math.abs(a.x2 - a.x1), h: Math.abs(a.y2 - a.y1) };
}
export function hitAnnotation(a, x, y, tol = 6) {
  if (a.t === 'pen' || a.t === 'hl') { const r = (a.size ?? 4) / 2 + tol; if (a.pts.length === 1) return Math.hypot(x - a.pts[0][0], y - a.pts[0][1]) <= r; for (let i = 1; i < a.pts.length; i++) if (segDist(x, y, a.pts[i - 1][0], a.pts[i - 1][1], a.pts[i][0], a.pts[i][1]) <= r) return true; return false; }
  if (a.t === 'line' || a.t === 'arrow') return segDist(x, y, a.x1, a.y1, a.x2, a.y2) <= (a.size ?? 4) / 2 + tol;
  const b = annBounds(a); return x >= b.x - tol && x <= b.x + b.w + tol && y >= b.y - tol && y <= b.y + b.h + tol;
}
export function moveAnnotation(a, dx, dy) {
  if (a.pts) return { ...a, pts: a.pts.map((p) => [p[0] + dx, p[1] + dy]) };
  if (a.t === 'text') return { ...a, x: a.x + dx, y: a.y + dy };
  return { ...a, x1: a.x1 + dx, y1: a.y1 + dy, x2: a.x2 + dx, y2: a.y2 + dy };
}
/** The two barbs of an arrow head at (x2, y2), pointing away from (x1, y1). */
export function arrowHead(x1, y1, x2, y2, size) {
  const ang = Math.atan2(y2 - y1, x2 - x1), len = Math.max(10, size * 4), spread = Math.PI / 7;
  return [[x2 - len * Math.cos(ang - spread), y2 - len * Math.sin(ang - spread)], [x2 - len * Math.cos(ang + spread), y2 - len * Math.sin(ang + spread)]];
}
/** Undo / redo history over immutable snapshots. */
export function createHistory(initial, limit = 60) {
  let stack = [initial], at = 0;
  return {
    push(s) { stack = stack.slice(0, at + 1); stack.push(s); if (stack.length > limit) stack.shift(); at = stack.length - 1; return s; },
    undo() { if (at > 0) at--; return stack[at]; }, redo() { if (at < stack.length - 1) at++; return stack[at]; },
    canUndo: () => at > 0, canRedo: () => at < stack.length - 1, current: () => stack[at], size: () => stack.length, reset(s) { stack = [s]; at = 0; },
  };
}

// ---------------------------------------------------------------- PDF page operations
let uidN = 0; export const newUid = () => `p${Date.now().toString(36)}${(uidN++).toString(36)}`;
/** The page list of a freshly opened document: one entry per page, from source 0. */
export const initialPages = (count, src = 0) => Array.from({ length: count }, (_, i) => ({ uid: newUid(), src, i, rot: 0 }));
export function deletePages(pages, idxs) { const s = new Set(idxs); return pages.length - s.size < 1 ? pages : pages.filter((_, i) => !s.has(i)); }       // never delete the last page
export function movePage(pages, from, to) { if (from === to || from < 0 || to < 0 || from >= pages.length || to >= pages.length) return pages; const c = [...pages]; const [p] = c.splice(from, 1); c.splice(to, 0, p); return c; }
export function rotatePages(pages, idxs, delta) { const s = new Set(idxs); return pages.map((p, i) => (s.has(i) ? { ...p, rot: (((p.rot + delta) % 360) + 360) % 360 } : p)); }
export function appendPages(pages, src, count) { return [...pages, ...initialPages(count, src)]; }
export function extractPages(pages, idxs) { const s = new Set(idxs); return pages.filter((_, i) => s.has(i)); }
/** "1-3, 5, 8-" -> [0,1,2,4,7,...] (zero based, unique, in order). Throws a plain message for nonsense. */
export function parsePageRange(text, count) {
  const out = []; const seen = new Set(); const t = String(text ?? '').trim(); if (!t) throw new Error('Type the pages to keep, like 1-3, 5.');
  for (const part of t.split(',')) {
    const m = /^\s*(\d+)?\s*(-)?\s*(\d+)?\s*$/.exec(part); if (!m || (!m[1] && !m[3])) throw new Error(`“${part.trim()}” is not a page or a range.`);
    const a = m[1] ? Number(m[1]) : 1, b = m[2] ? (m[3] ? Number(m[3]) : count) : a;
    if (a < 1 || b < 1 || a > count || b > count) throw new Error(`This document has ${count} page${count === 1 ? '' : 's'}.`);
    if (b < a) throw new Error(`“${part.trim()}” goes backwards.`);
    for (let p = a; p <= b; p++) if (!seen.has(p)) { seen.add(p); out.push(p - 1); }
  }
  return out;
}
/** Editing in place keeps everything in the original file (bookmarks, form fields); any page operation needs a rebuilt document. */
export function needsRebuild(pages, originalCount) { return pages.length !== originalCount || pages.some((p, i) => p.src !== 0 || p.i !== i || p.rot !== 0); }

// ---------------------------------------------------------------- PDF: on-screen annotation -> PDF drawing commands
/** Effective rotation of a page as shown: the file's own /Rotate plus the editor's turn. */
export const effectiveRotation = (base, rot) => ((((base || 0) + (rot || 0)) % 360) + 360) % 360;
/** Page size as shown on screen (points) for an unrotated size (pw, ph) and rotation R. */
export const displaySize = (pw, ph, R) => (R === 90 || R === 270 ? { w: ph, h: pw } : { w: pw, h: ph });
/** A point on the shown page (points from the top-left) -> PDF user space (points from the bottom-left of the unrotated page). */
export function toPdfPoint(dx, dy, pw, ph, R) {
  switch (R) { case 90: return { x: dy, y: dx }; case 180: return { x: pw - dx, y: dy }; case 270: return { x: pw - dy, y: ph - dx }; default: return { x: dx, y: ph - dy }; }
}
const hexRgb = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '')); const n = m ? parseInt(m[1], 16) : 0; return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
/**
 * Turn one annotation (in shown-page points) into drawing commands for pdf-lib. Boxes (text, rectangles, highlights, images) are anchored at their
 * bottom-left corner on screen and turned by R, so they stay upright on the shown page whatever the page's own rotation is.
 */
export function planAnnotation(a, page) {
  const { pw, ph, R } = page; const P = (x, y) => toPdfPoint(x, y, pw, ph, R);
  if (a.t === 'text') {
    const lines = String(a.text ?? '').split('\n'); const lh = a.size * 1.2; const cmds = [];
    if (a.bg) { const o = P(a.x, a.y + lines.length * lh); cmds.push({ op: 'rect', x: o.x, y: o.y, w: a.w ?? 100, h: lines.length * lh, rotate: R, fill: hexRgb(a.bg), opacity: 1 }); }
    lines.forEach((ln, i) => { if (!ln) return; const o = P(a.x, a.y + i * lh + a.size); cmds.push({ op: 'text', x: o.x, y: o.y, text: ln, size: a.size, rotate: R, color: hexRgb(a.color), bold: !!a.bold }); });
    return cmds;
  }
  if (a.t === 'rect' || a.t === 'hl') {
    const x = Math.min(a.x, a.x + a.w), y = Math.min(a.y, a.y + a.h), w = Math.abs(a.w), h = Math.abs(a.h); const o = P(x, y + h);
    return a.t === 'hl' ? [{ op: 'rect', x: o.x, y: o.y, w, h, rotate: R, fill: hexRgb(a.color), opacity: 0.4, multiply: true }] : [{ op: 'rect', x: o.x, y: o.y, w, h, rotate: R, border: hexRgb(a.color), borderWidth: a.size ?? 2, opacity: 1 }];
  }
  if (a.t === 'pen') { const pts = a.pts.map((p) => P(p[0], p[1])); const cmds = []; for (let i = 1; i < pts.length; i++) cmds.push({ op: 'line', x1: pts[i - 1].x, y1: pts[i - 1].y, x2: pts[i].x, y2: pts[i].y, width: a.size ?? 2, color: hexRgb(a.color) }); if (pts.length === 1) cmds.push({ op: 'line', x1: pts[0].x, y1: pts[0].y, x2: pts[0].x + 0.01, y2: pts[0].y, width: a.size ?? 2, color: hexRgb(a.color) }); return cmds; }
  if (a.t === 'img' || a.t === 'sign') { const o = P(a.x, a.y + a.h); return [{ op: 'image', x: o.x, y: o.y, w: a.w, h: a.h, rotate: R, src: a.src, mime: a.mime ?? 'image/png', opacity: a.opacity ?? 1 }]; }
  return [];
}

// ---------------------------------------------------------------- PDF viewer: view rotation and page rotation
/** A point shown on screen (u, v in points from the top-left of the shown page) -> the same point in the page's own annotation space, when the view is turned `viewRot` degrees clockwise. */
export function viewToLocal(u, v, Wd, Hd, viewRot) {
  switch (((viewRot % 360) + 360) % 360) { case 90: return { x: v, y: Hd - u }; case 180: return { x: Wd - u, y: Hd - v }; case 270: return { x: Wd - v, y: u }; default: return { x: u, y: v }; }
}
/** Turn the annotations of one page with the page itself (Wd x Hd = the page's shown size before the turn). Text stays upright. */
export function rotateAnnotationOnPage(a, cw, Wd, Hd) {
  const P = (x, y) => (cw ? { x: Hd - y, y: x } : { x: y, y: Wd - x });
  if (a.pts) return { ...a, pts: a.pts.map((p) => { const q = P(p[0], p[1]); return [q.x, q.y]; }) };
  const w = a.w ?? 0, hh = a.h ?? (a.t === 'text' ? (a.size ?? 12) * 1.2 : 0); const c1 = P(a.x, a.y), c2 = P(a.x + w, a.y + hh);
  const x = Math.min(c1.x, c2.x), y = Math.min(c1.y, c2.y);
  return a.t === 'text' ? { ...a, x, y } : { ...a, x, y, w: Math.abs(c2.x - c1.x), h: Math.abs(c2.y - c1.y) };
}
/** Size of the page after a quarter turn. */
export const turnedSize = (Wd, Hd) => ({ w: Hd, h: Wd });

// ---------------------------------------------------------------- image annotations follow the picture when it is cropped, flipped, turned or resized
const pointMap = (op) => {
  switch (op.type) {
    case 'translate': return (x, y) => ({ x: x + op.dx, y: y + op.dy });
    case 'flipH': return (x, y) => ({ x: op.W - x, y });
    case 'flipV': return (x, y) => ({ x, y: op.H - y });
    case 'rot90cw': return (x, y) => ({ x: op.H - y, y: x });
    case 'rot90ccw': return (x, y) => ({ x: y, y: op.W - x });
    case 'scale': return (x, y) => ({ x: x * op.k, y: y * op.k });
    default: return (x, y) => ({ x, y });
  }
};
export function transformAnnotation(a, op) {
  const P = pointMap(op); const k = op.type === 'scale' ? op.k : 1;
  if (a.pts) return { ...a, size: (a.size ?? 4) * k, pts: a.pts.map((p) => { const q = P(p[0], p[1]); return [q.x, q.y]; }) };
  if (a.t === 'text') {
    const b = annBounds(a); const c1 = P(b.x, b.y), c2 = P(b.x + b.w, b.y + b.h);
    return { ...a, x: Math.min(c1.x, c2.x), y: Math.min(c1.y, c2.y), size: a.size * k, w: (a.w ?? b.w) * k, h: (a.h ?? b.h) * k };
  }
  const p1 = P(a.x1, a.y1), p2 = P(a.x2, a.y2); return { ...a, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, size: (a.size ?? 4) * k };
}
