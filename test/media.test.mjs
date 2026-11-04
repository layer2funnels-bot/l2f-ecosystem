// Image and PDF editors: the pure helpers (mediamodel.js). Which file opens where, crop / resize / rotate geometry, colour matrices and filters,
// blur and sharpen, annotation hit-testing, undo history, PDF page operations, page ranges and the translation of on-screen edits into PDF drawing commands.
import { readFileSync } from 'node:fs';
import { recorder } from './lib.mjs';
import * as M from '../apps/web/js/modules/mediamodel.js';
import { parseRoute, pageKeyFor } from '../apps/web/js/routes.js';

const { results, check } = recorder();
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// ---- routing
check('MD1', 'Image mimes open the image editor, PDFs the PDF editor, anything else has no editor', M.mediaHref({ id: 'a', kind: 'file', mime_type: 'image/png' }) === '#/image/a' && M.mediaHref({ id: 'b', kind: 'file', mime_type: 'image/jpeg' }) === '#/image/b'
  && M.mediaHref({ id: 'c', kind: 'file', mime_type: 'image/webp' }) === '#/image/c' && M.mediaHref({ id: 'd', kind: 'file', mime_type: 'image/gif' }) === '#/image/d' && M.mediaHref({ id: 'e', kind: 'file', mime_type: 'application/pdf' }) === '#/pdf/e'
  && M.mediaHref({ id: 'f', kind: 'file', mime_type: 'application/zip' }) === null && M.mediaHref({ id: 'g', kind: 'document', mime_type: 'image/png' }) === null && M.mediaHref(null) === null && M.mediaHref({ id: 'h', kind: 'file', mime_type: 'image/svg+xml' }) === null);
check('MD2', 'Mime matching ignores case and parameters', M.isImageMime('IMAGE/PNG; charset=binary') && M.isPdfMime('Application/PDF') && !M.isPdfMime('application/pdfx'));
check('MD3', 'The editor addresses are real routes in the Drive app', parseRoute('#/image/abc').name === 'image' && parseRoute('#/image/abc').params.id === 'abc' && parseRoute('#/pdf/abc').name === 'pdf' && parseRoute('#/pdf/abc/extra').name !== 'pdf'
  && pageKeyFor(parseRoute('#/pdf/abc')).app === 'drive' && pageKeyFor(parseRoute('#/image/abc')).app === 'drive');
const drive = readFileSync('apps/web/js/modules/drive.js', 'utf8');
check('MD4', 'Drive opens files through mediaHref (the editors are reachable from the file list)', /export const openHref = \(f\) => \(mediaHref\(f\)/.test(drive) && /from '\.\/mediamodel\.js'/.test(drive));

// ---- file names and formats
check('MD5', 'Save keeps PNG, JPEG and WebP; GIF can only be saved as a copy', M.saveFormat('image/png') === 'image/png' && M.saveFormat('image/jpeg') === 'image/jpeg' && M.saveFormat('image/webp') === 'image/webp' && M.saveFormat('image/gif') === null);
check('MD6', 'File names get the right extension and copies are named "(copy)"', M.withExt('photo.JPG', 'image/png') === 'photo.png' && M.withExt('a.b.c', 'image/webp') === 'a.b.c.webp' && M.copyName('plan.pdf', 'application/pdf') === 'plan (copy).pdf' && M.copyName('shot.gif', 'image/png') === 'shot (copy).png');

// ---- crop / resize / rotate
check('MD7', 'Crop presets: the biggest centred rectangle of the ratio (1:1, 4:3, 16:9, 9:16) and free = whole picture', (() => {
  const sq = M.cropForRatio(400, 300, 1), wide = M.cropForRatio(400, 300, 16 / 9), tall = M.cropForRatio(400, 300, 9 / 16), free = M.cropForRatio(400, 300, null), r43 = M.cropForRatio(400, 300, 4 / 3);
  return sq.w === 300 && sq.h === 300 && sq.x === 50 && sq.y === 0 && wide.w === 400 && wide.h === 225 && wide.y === 38 && tall.h === 300 && tall.w === 169 && free.w === 400 && free.h === 300 && r43.w === 400 && r43.h === 300;
})());
check('MD8', 'A crop rectangle is kept inside the picture and never smaller than the minimum', (() => { const a = M.clampRect({ x: -20, y: 290, w: 500, h: 100 }, 400, 300); const b = M.clampRect({ x: 5, y: 5, w: 1, h: 1 }, 400, 300); return a.x === 0 && a.w === 400 && a.y === 200 && a.h === 100 && b.w === 8 && b.h === 8; })());
check('MD9', 'Dragging a crop handle resizes from that side, moving moves, and a locked ratio is kept', (() => {
  const r = { x: 100, y: 100, w: 100, h: 100 }, B = { w: 400, h: 300 };
  const e = M.dragCrop(r, 'e', 50, 0, B), w = M.dragCrop(r, 'w', -30, 0, B), mv = M.dragCrop(r, 'move', 500, 500, B), se = M.dragCrop(r, 'se', 60, 10, B, 2), nwOut = M.dragCrop(r, 'nw', -500, -500, B);
  return e.w === 150 && e.x === 100 && w.x === 70 && w.w === 130 && mv.x === 300 && mv.y === 200 && near(se.w / se.h, 2, 0.02) && nwOut.x === 0 && nwOut.y === 0 && nwOut.w === 200;
})());
check('MD10', 'Resize with the lock keeps the ratio from either side; unlocked changes one side only; limits apply', (() => {
  const o = { w: 400, h: 300 }; const a = M.resizeDims(o, 'w', 200, true), b = M.resizeDims(o, 'h', 150, true), c = M.resizeDims(o, 'w', 123, false), d = M.resizeDims(o, 'w', 99999, true), z = M.resizeDims(o, 'w', 0, true);
  return a.w === 200 && a.h === 150 && b.w === 200 && b.h === 150 && c.w === 123 && c.h === 300 && d.w === 16000 && z.w === 1;
})());
check('MD11', 'Free rotation gets a canvas that holds the whole picture (0, 90 and 45 degrees)', (() => { const q = M.rotatedSize(400, 300, 90), z = M.rotatedSize(400, 300, 0), d = M.rotatedSize(100, 100, 45); return q.w === 300 && q.h === 400 && z.w === 400 && z.h === 300 && d.w === 141 && d.h === 141; })());
check('MD12', 'Fit keeps the ratio and never enlarges unless asked', (() => { const a = M.fitSize(1000, 500, 100, 100), b = M.fitSize(50, 50, 100, 100), c = M.fitSize(50, 50, 100, 100, true); return a.w === 100 && a.h === 50 && b.w === 50 && c.w === 100; })());
check('MD13', 'A pointer position becomes image pixels at any zoom', (() => { const p = M.toImagePoint(150, 80, { left: 100, top: 50, width: 200, height: 100 }, 400, 200); return p.x === 100 && p.y === 60; })());

// ---- colour matrices
const px = (r, g, b, a = 255) => Uint8ClampedArray.from([r, g, b, a]);
const run = (data, m) => Array.from(M.applyMatrix(data, m));
check('MD14', 'Neutral adjustments leave the pixels alone and are detected as neutral', M.isNeutral({}) && M.isNeutral(M.ADJUST_DEFAULTS) && !M.isNeutral({ blur: 5 }) && run(px(10, 120, 250), M.adjustMatrix({})).join() === '10,120,250,255');
check('MD15', 'Brightness and exposure lighten, negative values darken; alpha is never touched', (() => { const base = [100, 100, 100, 200]; const up = run(Uint8ClampedArray.from(base), M.adjustMatrix({ brightness: 40 })), dn = run(Uint8ClampedArray.from(base), M.adjustMatrix({ brightness: -40 })), ex = run(Uint8ClampedArray.from(base), M.adjustMatrix({ exposure: 60 })); return up[0] > 100 && dn[0] < 100 && ex[0] === 200 && up[3] === 200; })());
check('MD16', 'Contrast pushes values away from mid-grey; saturation -100 gives grey; warmth moves red up and blue down', (() => {
  const hi = run(px(200, 200, 200), M.adjustMatrix({ contrast: 50 })), lo = run(px(60, 60, 60), M.adjustMatrix({ contrast: 50 })), mid = run(px(128, 128, 128), M.adjustMatrix({ contrast: 50 }));
  const grey = run(px(200, 40, 40), M.adjustMatrix({ saturation: -100 })), warm = run(px(100, 100, 100), M.adjustMatrix({ warmth: 100 }));
  return hi[0] > 200 && lo[0] < 60 && Math.abs(mid[0] - 128) <= 1 && Math.abs(grey[0] - grey[1]) <= 1 && Math.abs(grey[1] - grey[2]) <= 1 && warm[0] > 100 && warm[2] < 100;
})());
check('MD17', 'Filters: grayscale makes grey, sepia is warm, invert flips every channel, "none" is identity, and all five named filters exist', (() => {
  const g = run(px(200, 40, 40), M.FILTERS.grayscale.matrix), s = run(px(120, 120, 120), M.FILTERS.sepia.matrix), inv = run(px(10, 200, 255), M.FILTERS.invert.matrix), none = run(px(1, 2, 3), M.FILTERS.none.matrix), v = run(px(120, 120, 120), M.FILTERS.vintage.matrix), c = run(px(200, 200, 200), M.FILTERS.contrast.matrix);
  return Math.abs(g[0] - g[1]) <= 1 && s[0] > s[2] && inv.slice(0, 3).join() === '245,55,0' && none.slice(0, 3).join() === '1,2,3' && v[0] > v[2] && c[0] > 200 && ['grayscale', 'sepia', 'vintage', 'contrast', 'invert'].every((k) => M.FILTERS[k]);
})());
check('MD18', 'Matrix composition applies the first matrix first', (() => { const double = [2, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 1, 0], plus10 = [1, 0, 0, 0, 10, 0, 1, 0, 0, 10, 0, 0, 1, 0, 10, 0, 0, 0, 1, 0]; return run(px(50, 50, 50), M.mulMatrix(double, plus10))[0] === 110 && run(px(50, 50, 50), M.mulMatrix(plus10, double))[0] === 120; })());
check('MD19', 'Blur averages neighbours (a white dot spreads, total light is kept inside the picture); radius 0 changes nothing', (() => {
  const w = 9, hh = 9, d = new Uint8ClampedArray(w * hh * 4).fill(0); for (let i = 3; i < d.length; i += 4) d[i] = 255; d[(4 * w + 4) * 4] = 255;
  const b = M.boxBlur(d, w, hh, 2), centre = b[(4 * w + 4) * 4], side = b[(4 * w + 3) * 4], same = M.boxBlur(d, w, hh, 0);
  return centre < 255 && centre > 0 && side > 0 && same[(4 * w + 4) * 4] === 255 && b[3] === 255;
})());
check('MD20', 'processPixels runs matrix, blur and sharpen (sharpen raises an edge, flat areas stay flat)', (() => {
  const w = 8, hh = 1, d = new Uint8ClampedArray(w * hh * 4); for (let x = 0; x < w; x++) { const v = x < 4 ? 80 : 160; d.set([v, v, v, 255], x * 4); }
  const flat = new Uint8ClampedArray(w * 4).fill(100); const f2 = Uint8ClampedArray.from(flat);
  M.processPixels(d, w, hh, { adj: { sharpen: 100 }, scale: 1 }); M.processPixels(f2, w, 1, { adj: { sharpen: 100 }, scale: 1 });
  return d[3 * 4] < 80 + 1 && d[4 * 4] > 160 - 1 && f2.every((v, i) => v === flat[i]);
})());

// ---- annotations
check('MD21', 'Hit-testing: pen strokes by distance to the line, shapes by their box, text by its box; misses are misses', (() => {
  const pen = { t: 'pen', pts: [[0, 0], [100, 0]], size: 4 }, rect = { t: 'rect', x1: 10, y1: 10, x2: 60, y2: 40, size: 2 }, text = { t: 'text', x: 20, y: 20, text: 'Hi', size: 20, w: 30, h: 26 }, arrow = { t: 'arrow', x1: 0, y1: 0, x2: 0, y2: 100, size: 3 };
  return M.hitAnnotation(pen, 50, 3, 2) && !M.hitAnnotation(pen, 50, 30, 2) && M.hitAnnotation(rect, 30, 20, 2) && !M.hitAnnotation(rect, 200, 200, 2) && M.hitAnnotation(text, 30, 30, 0) && !M.hitAnnotation(text, 80, 80, 0) && M.hitAnnotation(arrow, 2, 50, 2);
})());
check('MD22', 'Moving an annotation moves every point of it', (() => { const a = M.moveAnnotation({ t: 'pen', pts: [[1, 1], [2, 2]] }, 10, 20), b = M.moveAnnotation({ t: 'text', x: 5, y: 5, text: 'x', size: 10 }, 1, 2), c = M.moveAnnotation({ t: 'rect', x1: 0, y1: 0, x2: 5, y2: 5 }, 3, 3); return a.pts[1].join() === '12,22' && b.x === 6 && b.y === 7 && c.x2 === 8; })());
check('MD23', 'Annotations follow the picture through crop, flips, quarter turns and resize', (() => {
  const dot = { t: 'rect', x1: 10, y1: 20, x2: 30, y2: 40, size: 2 };
  const t = M.transformAnnotation(dot, { type: 'translate', dx: -5, dy: -10 }), fh = M.transformAnnotation(dot, { type: 'flipH', W: 100, H: 50 }), cw = M.transformAnnotation(dot, { type: 'rot90cw', W: 100, H: 50 }), ccw = M.transformAnnotation(dot, { type: 'rot90ccw', W: 100, H: 50 }), sc = M.transformAnnotation(dot, { type: 'scale', k: 2 });
  const txt = M.transformAnnotation({ t: 'text', x: 10, y: 10, text: 'ab', size: 10, w: 20, h: 13 }, { type: 'scale', k: 2 });
  return t.x1 === 5 && t.y1 === 10 && fh.x1 === 90 && fh.x2 === 70 && cw.x1 === 30 && cw.y1 === 10 && ccw.x1 === 20 && ccw.y1 === 90 && sc.x2 === 60 && sc.size === 4 && txt.size === 20 && txt.w === 40 && txt.x === 20;
})());
check('MD24', 'Arrow heads sit at the tip and point back along the line', (() => { const [p, q] = M.arrowHead(0, 0, 100, 0, 4); return p[0] < 100 && q[0] < 100 && near(p[1], -q[1], 1e-6) && p[1] !== 0; })());
check('MD25', 'Undo/redo history: pushing after an undo drops the redo branch, the limit is kept', (() => {
  const hs = M.createHistory('a', 3); hs.push('b'); hs.push('c'); const u1 = hs.undo(), u2 = hs.undo(); const noMore = hs.undo(); const r = hs.redo(); hs.push('d'); const cantRedo = !hs.canRedo(); hs.push('e'); hs.push('f');
  return u1 === 'b' && u2 === 'a' && noMore === 'a' && r === 'b' && cantRedo && hs.size() === 3 && hs.current() === 'f' && !hs.canRedo() && hs.canUndo();
})());

// ---- PDF page operations
const P = (n) => M.initialPages(n);
const idsOf = (pages) => pages.map((p) => `${p.src}.${p.i}${p.rot ? `r${p.rot}` : ''}`).join();
check('MD26', 'Delete pages by position, but never the last page', idsOf(M.deletePages(P(4), [1, 2])) === '0.0,0.3' && M.deletePages(P(2), [0, 1]).length === 2 && M.deletePages(P(1), [0]).length === 1);
check('MD27', 'Reorder pages: move up, move down, to the ends; out-of-range moves change nothing', idsOf(M.movePage(P(4), 3, 0)) === '0.3,0.0,0.1,0.2' && idsOf(M.movePage(P(4), 0, 2)) === '0.1,0.2,0.0,0.3' && M.movePage(P(3), 1, 1).length === 3 && idsOf(M.movePage(P(3), 0, 9)) === '0.0,0.1,0.2');
check('MD28', 'Rotate pages by quarter turns in both directions, wrapping at 360', (() => { const a = M.rotatePages(P(3), [1], 90), b = M.rotatePages(a, [1], 270), c = M.rotatePages(P(2), [0], -90), d = M.rotatePages(M.rotatePages(a, [1], 90), [1], 180); return idsOf(a) === '0.0,0.1r90,0.2' && b[1].rot === 0 && c[0].rot === 270 && d[1].rot === 0; })());
check('MD29', 'Merging appends pages from another source after the existing ones; extract keeps the chosen pages in page order', (() => { const m = M.appendPages(P(2), 1, 3); const e = M.extractPages(m, [4, 0]); return idsOf(m) === '0.0,0.1,1.0,1.1,1.2' && idsOf(e) === '0.0,1.2'; })());
check('MD30', 'Page ids are unique so annotations stay with their page when pages move', new Set([...P(50), ...M.appendPages([], 1, 50)].map((p) => p.uid)).size === 100);
check('MD31', 'Page ranges: "1-3, 5", open ends, duplicates removed, and plain-English errors', (() => {
  const ok = M.parsePageRange('1-3, 5', 10).join() === '0,1,2,4' && M.parsePageRange('8-', 10).join() === '7,8,9' && M.parsePageRange('-2', 10).join() === '0,1' && M.parsePageRange('2,2,1-2', 5).join() === '1,0' && M.parsePageRange(' 4 ', 5).join() === '3';
  const bad = ['', 'abc', '0', '11', '5-2', '1-99'].every((t) => { try { M.parsePageRange(t, 10); return false; } catch (e) { return typeof e.message === 'string' && e.message.length > 5; } });
  return ok && bad;
})());
check('MD32', 'An untouched document is edited in place; any page operation needs a rebuilt document', !M.needsRebuild(P(3), 3) && M.needsRebuild(M.deletePages(P(3), [0]), 3) && M.needsRebuild(M.movePage(P(3), 0, 1), 3) && M.needsRebuild(M.rotatePages(P(3), [0], 90), 3) && M.needsRebuild(M.appendPages(P(3), 1, 1), 3));

// ---- PDF coordinates and drawing plans
check('MD33', 'Screen -> PDF space for each page rotation (shown point from the top-left; result from the bottom-left of the unrotated page)', (() => {
  const pw = 600, ph = 800; const a = M.toPdfPoint(100, 50, pw, ph, 0), b = M.toPdfPoint(100, 50, pw, ph, 90), c = M.toPdfPoint(100, 50, pw, ph, 180), d = M.toPdfPoint(100, 50, pw, ph, 270);
  return a.x === 100 && a.y === 750 && b.x === 50 && b.y === 100 && c.x === 500 && c.y === 50 && d.x === 550 && d.y === 700;
})());
check('MD34', 'The shown top-left and bottom-right corners map to the right PDF corners in every rotation', (() => {
  const pw = 600, ph = 800; const c = (R) => { const s = M.displaySize(pw, ph, R); return [M.toPdfPoint(0, 0, pw, ph, R), M.toPdfPoint(s.w, s.h, pw, ph, R)]; };
  const [a0, a1] = c(0), [b0, b1] = c(90), [c0, c1] = c(180), [d0, d1] = c(270);
  return a0.x === 0 && a0.y === 800 && a1.x === 600 && a1.y === 0 && b0.x === 0 && b0.y === 0 && b1.x === 600 && b1.y === 800 && c0.x === 600 && c0.y === 0 && c1.x === 0 && c1.y === 800 && d0.x === 600 && d0.y === 800 && d1.x === 0 && d1.y === 0;
})());
check('MD35', 'effectiveRotation adds the file rotation and the editor turn; displaySize swaps for 90 and 270', M.effectiveRotation(90, 270) === 0 && M.effectiveRotation(0, -90) === 270 && M.effectiveRotation(undefined, 180) === 180 && M.displaySize(600, 800, 90).w === 800 && M.displaySize(600, 800, 180).w === 600);
check('MD36', 'View turn: a click on the turned page maps back to the page\'s own space (and back again)', (() => {
  const Wd = 600, Hd = 800; const sh = (x, y, r) => (r === 90 ? { u: Hd - y, v: x } : r === 180 ? { u: Wd - x, v: Hd - y } : r === 270 ? { u: y, v: Wd - x } : { u: x, v: y });
  return [0, 90, 180, 270].every((r) => { const s = sh(120, 340, r); const p = M.viewToLocal(s.u, s.v, Wd, Hd, r); return p.x === 120 && p.y === 340; });
})());
check('MD37', 'Turning a page turns its annotations with it (four turns = identity; boxes keep their size, text stays upright)', (() => {
  const a = { t: 'rect', x: 10, y: 20, w: 100, h: 50 }; let x = a; for (let i = 0; i < 4; i++) x = M.rotateAnnotationOnPage(x, true, i % 2 ? 800 : 600, i % 2 ? 600 : 800);
  const once = M.rotateAnnotationOnPage(a, true, 600, 800), pen = M.rotateAnnotationOnPage({ t: 'pen', pts: [[0, 0], [10, 0]] }, true, 600, 800), txt = M.rotateAnnotationOnPage({ t: 'text', x: 10, y: 10, size: 10, w: 40, h: 12 }, false, 600, 800);
  return x.x === 10 && x.y === 20 && x.w === 100 && x.h === 50 && once.w === 50 && once.h === 100 && pen.pts[1].join() === '800,10' && txt.w === 40 && txt.size === 10;
})());
check('MD38', 'A rectangle plan on an upright page is anchored at its bottom-left with the PDF y axis up', (() => { const [c] = M.planAnnotation({ t: 'rect', x: 50, y: 100, w: 200, h: 60, color: '#ff0000', size: 3 }, { pw: 600, ph: 800, R: 0 }); return c.op === 'rect' && c.x === 50 && c.y === 640 && c.w === 200 && c.h === 60 && c.rotate === 0 && c.border[0] === 1 && c.borderWidth === 3; })());
check('MD39', 'On a page rotated 90 the same shown box is drawn turned so it still reads upright', (() => { const [c] = M.planAnnotation({ t: 'hl', x: 50, y: 100, w: 200, h: 60, color: '#fde047' }, { pw: 600, ph: 800, R: 90 }); return c.rotate === 90 && c.w === 200 && c.h === 60 && c.opacity === 0.4 && c.multiply === true && c.x === 160 && c.y === 50; })());
check('MD40', 'Text plans put each line on its own baseline, keep the colour, and carry the page turn', (() => { const cs = M.planAnnotation({ t: 'text', x: 10, y: 10, text: 'one\ntwo', size: 10, color: '#0000ff', w: 20, h: 24 }, { pw: 600, ph: 800, R: 0 }); return cs.length === 2 && cs[0].op === 'text' && cs[0].y === 800 - (10 + 10) && cs[1].y === 800 - (10 + 12 + 10) && cs[0].color[2] === 1 && cs[0].size === 10; })());
check('MD41', 'Freehand strokes become connected line segments; a single tap still leaves a dot; images keep their data', (() => {
  const pen = M.planAnnotation({ t: 'pen', pts: [[0, 0], [10, 10], [20, 0]], color: '#000000', size: 2 }, { pw: 100, ph: 100, R: 0 }), dot = M.planAnnotation({ t: 'pen', pts: [[5, 5]], color: '#000000', size: 2 }, { pw: 100, ph: 100, R: 0 }), img = M.planAnnotation({ t: 'sign', x: 10, y: 10, w: 40, h: 20, src: 'data:image/png;base64,AAAA' }, { pw: 100, ph: 100, R: 0 });
  return pen.length === 2 && pen[0].x2 === pen[1].x1 && dot.length === 1 && img[0].op === 'image' && img[0].y === 70 && img[0].src.startsWith('data:');
})());
check('MD42', 'Unknown annotation kinds draw nothing (never throw)', M.planAnnotation({ t: 'weird' }, { pw: 10, ph: 10, R: 0 }).length === 0);

// ---- build / shipping rules
const csp = readFileSync('apps/web/_headers', 'utf8');
check('MD43', 'The page policy still forbids remote scripts and frames (pdf.js and pdf-lib are self-hosted)', /script-src 'self';/.test(csp) && /default-src 'self'/.test(csp) && !/unsafe-eval|unsafe-inline/.test(csp));
const css = readFileSync('apps/web/index.html', 'utf8');
check('MD44', 'Both editor stylesheets are linked, and the bundles are built into apps/web/media (not committed)', /imageeditor\.css/.test(css) && /pdfeditor\.css/.test(css) && /apps\/web\/media\//.test(readFileSync('.gitignore', 'utf8')) && /buildMedia/.test(readFileSync('scripts/build-web.mjs', 'utf8')));

for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}`);
const pc = results.filter((x) => x.ok).length; console.log(`\n${pc}/${results.length} checks passed`);
process.exit(pc === results.length ? 0 : 1);
