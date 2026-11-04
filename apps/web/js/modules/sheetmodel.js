// Sheets: the stored model (v2) and the editing operations on it. Pure functions, no DOM, no eval. The body is JSON, never HTML:
//   { v: 2, styles: [ {b,i,u,st,fs,fc,bg,ha,va,wr,nf,bd} ], sheets: [ { name, cells: { A1: "raw" | ["raw", styleIndex] }, cw, rh, merges, freeze, hc, hr, filter } ] }
// v1 bodies ({ v: 1, sheets: [{ name, cells: { A1: "raw" } }] }) still open and are written as v2 on the next save. Formulas live in sheetformula.js.
import { COLS, ROWS, colName, ref, parseRef, parseRange, rangeLabel, translateFormula, shiftFormula, renameSheetInFormula, dropSheetInFormula, parseLiteral, formatValue, impliedFormat, isError, createCalc, generalNumber, compareValues, fromSerial, NF_KINDS, FUNCTION_NAMES, FUNCTION_DOCS, CalcError, E, parseFormula } from './sheetformula.js';
export { COLS, ROWS, colName, ref, parseRef, parseRange, rangeLabel, isError, createCalc, FUNCTION_NAMES, FUNCTION_DOCS, formatValue, parseLiteral, impliedFormat, translateFormula, CalcError, E, parseFormula };

export const MIME = 'application/vnd.l2f.sheet+json';
export const MAX_CELLS = 60000, MAX_SHEETS = 20, MAX_RAW = 4000, MAX_CHARS = 1000000, MAX_STYLES = 400, MAX_MERGES = 2000;
export const DEFAULT_COL_W = 100, DEFAULT_ROW_H = 26, MIN_COL_W = 24, MAX_COL_W = 600, MIN_ROW_H = 16, MAX_ROW_H = 400;

// ---------------------------------------------------------------- styles
const HEX = /^#[0-9a-fA-F]{6}$/;
const isInt = (n, a, b) => Number.isInteger(n) && n >= a && n <= b;
/** Normalises a cell style to the allowed fields and values (anything else is dropped), or null when it has no effect. */
export function cleanStyle(o) {
  if (!o || typeof o !== 'object') return null;
  const s = {};
  for (const k of ['b', 'i', 'u', 'st', 'wr']) if (o[k]) s[k] = 1;
  if (isInt(o.fs, 8, 72)) s.fs = o.fs;
  if (typeof o.fc === 'string' && HEX.test(o.fc)) s.fc = o.fc.toLowerCase();
  if (typeof o.bg === 'string' && HEX.test(o.bg)) s.bg = o.bg.toLowerCase();
  if (['l', 'c', 'r'].includes(o.ha)) s.ha = o.ha;
  if (['t', 'm', 'b'].includes(o.va)) s.va = o.va;
  if (o.nf && typeof o.nf === 'object' && NF_KINDS.includes(o.nf.k) && o.nf.k !== 'gen') {
    const nf = { k: o.nf.k };
    if (isInt(o.nf.d, 0, 10)) nf.d = o.nf.d;
    if (typeof o.nf.sym === 'string' && o.nf.sym.length >= 1 && o.nf.sym.length <= 3 && !/[\u0000-\u001f<>&"]/.test(o.nf.sym)) nf.sym = o.nf.sym;
    if (o.nf.th === false) nf.th = false;
    if (['iso', 'us', 'eu', 'long'].includes(o.nf.f)) nf.f = o.nf.f;
    s.nf = nf;
  }
  if (o.bd && typeof o.bd === 'object') { const bd = {}; for (const k of ['t', 'r', 'b', 'l']) if (o.bd[k]) bd[k] = 1; if (Object.keys(bd).length) s.bd = bd; }
  return Object.keys(s).length ? s : null;
}
const stableKey = (s) => JSON.stringify(s, Object.keys(s).sort());
/** Returns the index of this style in the book's shared table, adding it when new; -1 for "no style". */
export function internStyle(book, style) {
  const s = cleanStyle(style); if (!s) return -1;
  const k = stableKey(s); book._sk ??= new Map(book.styles.map((x, i) => [stableKey(x), i]));
  if (book._sk.has(k)) return book._sk.get(k);
  if (book.styles.length >= MAX_STYLES) return -1;
  book.styles.push(s); book._sk.set(k, book.styles.length - 1); return book.styles.length - 1;
}
/** The style index you get by applying `patch` (a field -> value map; null/false removes a field; { bd: {...} } replaces borders) on top of style index `idx`. */
export function patchStyle(book, idx, patch) {
  const base = { ...(idx >= 0 ? book.styles[idx] : {}) };
  for (const [k, v] of Object.entries(patch)) { if (v === null || v === false || v === undefined) delete base[k]; else base[k] = v; }
  return internStyle(book, base);
}
export const styleOf = (book, sheet, key) => { const i = sheet.sty[key]; return i === undefined ? null : book.styles[i] ?? null; };

// ---------------------------------------------------------------- the book
export const emptySheet = (name = 'Sheet 1') => ({ name, cells: {}, sty: {}, cw: {}, rh: {}, merges: [], freeze: { r: 0, c: 0 }, hc: [], hr: [], filter: null });
export const emptyBook = () => ({ v: 2, styles: [], sheets: [emptySheet()], n: 0 });
const cleanName = (n, i) => { const t = String(n ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40); return t || `Sheet ${i + 1}`; };
export function uniqueName(sheets, want, except = -1) {
  let name = want, k = 2; const taken = () => sheets.some((s, i) => i !== except && s.name.toLowerCase() === name.toLowerCase());
  while (taken()) { const suffix = ` (${k++})`; name = want.slice(0, 40 - suffix.length) + suffix; } return name;
}
const dict = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? o : {});
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/** Reads any stored text into a safe book: unknown shapes become an empty sheet, junk cells are dropped, sizes are capped. */
export function parseBook(text) {
  let raw; try { raw = JSON.parse(text); } catch { raw = null; }
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.sheets)) return emptyBook();
  const book = { v: 2, styles: [], sheets: [], n: 0 };
  const map = [];                                              // stored style index -> index in the clean table
  if (raw.v === 2 && Array.isArray(raw.styles)) for (const st of raw.styles.slice(0, MAX_STYLES)) map.push(internStyle(book, st));
  for (const [i, s] of raw.sheets.slice(0, MAX_SHEETS).entries()) {
    const sh = emptySheet(uniqueName(book.sheets, cleanName(s?.name, i)));
    for (const [k, v] of Object.entries(dict(s?.cells))) {
      if (!own(s.cells, k) || !parseRef(k) || book.n >= MAX_CELLS) continue;
      const key = k.toUpperCase(); let rawText, si = -1;
      if (typeof v === 'string') rawText = v;
      else if (raw.v === 2 && Array.isArray(v) && typeof v[0] === 'string') { rawText = v[0]; si = isInt(v[1], 0, MAX_STYLES) ? (map[v[1]] ?? -1) : -1; } else continue;
      if (rawText === '' && si < 0) continue;
      if (rawText !== '') sh.cells[key] = rawText.slice(0, MAX_RAW);
      if (si >= 0) sh.sty[key] = si;
      book.n += 1;
    }
    if (raw.v === 2) {
      for (const [k, w] of Object.entries(dict(s?.cw))) { const c = Number(k); if (own(s.cw, k) && isInt(c, 0, COLS - 1) && Number.isFinite(w)) sh.cw[c] = Math.max(MIN_COL_W, Math.min(MAX_COL_W, Math.round(w))); }
      for (const [k, w] of Object.entries(dict(s?.rh))) { const r = Number(k); if (own(s.rh, k) && isInt(r, 0, ROWS - 1) && Number.isFinite(w)) sh.rh[r] = Math.max(MIN_ROW_H, Math.min(MAX_ROW_H, Math.round(w))); }
      const taken = new Set();
      for (const m of Array.isArray(s?.merges) ? s.merges.slice(0, MAX_MERGES) : []) {
        const g = typeof m === 'string' ? parseRange(m) : null; if (!g || (g.c1 === g.c2 && g.r1 === g.r2)) continue;
        let clash = false; for (let r = g.r1; r <= g.r2 && !clash; r++) for (let c = g.c1; c <= g.c2; c++) if (taken.has(r * 64 + c)) { clash = true; break; }
        if (clash) continue; for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) taken.add(r * 64 + c); sh.merges.push(g);
      }
      if (s?.freeze && typeof s.freeze === 'object') sh.freeze = { r: isInt(s.freeze.r, 0, 30) ? s.freeze.r : 0, c: isInt(s.freeze.c, 0, 10) ? s.freeze.c : 0 };
      sh.hc = (Array.isArray(s?.hc) ? s.hc : []).filter((x) => isInt(x, 0, COLS - 1)).slice(0, COLS);
      sh.hr = (Array.isArray(s?.hr) ? s.hr : []).filter((x) => isInt(x, 0, ROWS - 1)).slice(0, ROWS);
      const f = s?.filter;
      if (f && typeof f === 'object' && isInt(f.c1, 0, COLS - 1) && isInt(f.c2, f.c1, COLS - 1) && isInt(f.r1, 0, ROWS - 1) && isInt(f.r2, f.r1, ROWS - 1)) {
        const hide = {}; for (const [k, list] of Object.entries(dict(f.hide))) { const c = Number(k); if (own(f.hide, k) && isInt(c, f.c1, f.c2) && Array.isArray(list)) hide[c] = list.filter((x) => typeof x === 'string').slice(0, 2000); }
        sh.filter = { c1: f.c1, c2: f.c2, r1: f.r1, r2: f.r2, hide };
      }
    }
    book.sheets.push(sh);
  }
  return book.sheets.length ? book : emptyBook();
}
const rc = (k) => parseRef(k);
export function serializeBook(book) {
  const used = new Map(); const styles = [];
  const remap = (i) => { if (!used.has(i)) { used.set(i, styles.length); styles.push(book.styles[i]); } return used.get(i); };
  const sheets = book.sheets.map((s) => {
    const keys = new Set([...Object.keys(s.cells), ...Object.keys(s.sty)]);
    const cells = {};
    for (const k of [...keys].filter((k) => rc(k)).sort((a, b) => (rc(a).row - rc(b).row) || (rc(a).col - rc(b).col))) {
      const raw = s.cells[k] ?? ''; const si = s.sty[k];
      if (si !== undefined && book.styles[si]) cells[k] = [raw, remap(si)]; else if (raw !== '') cells[k] = raw;
    }
    const o = { name: s.name, cells };
    if (Object.keys(s.cw).length) o.cw = s.cw; if (Object.keys(s.rh).length) o.rh = s.rh;
    if (s.merges.length) o.merges = s.merges.map(rangeLabel);
    if (s.freeze.r || s.freeze.c) o.freeze = { r: s.freeze.r, c: s.freeze.c };
    if (s.hc.length) o.hc = s.hc; if (s.hr.length) o.hr = s.hr;
    if (s.filter) o.filter = s.filter;
    return o;
  });
  return JSON.stringify({ v: 2, styles, sheets });
}
export const countCells = (book) => book.sheets.reduce((n, s) => n + new Set([...Object.keys(s.cells), ...Object.keys(s.sty)]).size, 0);
export const usedRange = (s) => {
  let r2 = -1, c2 = -1; for (const k of new Set([...Object.keys(s.cells), ...Object.keys(s.sty)])) { const p = rc(k); if (!p) continue; if (s.cells[k] === undefined && s.sty[k] === undefined) continue; r2 = Math.max(r2, p.row); c2 = Math.max(c2, p.col); }
  for (const m of s.merges) { r2 = Math.max(r2, m.r2); c2 = Math.max(c2, m.c2); }
  return r2 < 0 ? null : { c1: 0, r1: 0, c2, r2 };
};
/** The block of non-empty cells around a cell (what Ctrl+A or "sort" treats as the data), or just that cell. */
export function dataRegion(s, col, row) {
  const has = (c, r) => c >= 0 && r >= 0 && c < COLS && r < ROWS && (s.cells[ref(c, r)] ?? '') !== '';
  if (![[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]].some(([dc, dr]) => has(col + dc, row + dr))) return { c1: col, r1: row, c2: col, r2: row };
  let c1 = col, c2 = col, r1 = row, r2 = row, grew = true;
  const colTouches = (c) => { for (let r = r1 - 1; r <= r2 + 1; r++) if (has(c, r)) return true; return false; };
  const rowTouches = (r) => { for (let c = c1 - 1; c <= c2 + 1; c++) if (has(c, r)) return true; return false; };
  while (grew) {
    grew = false;
    if (c1 > 0 && colTouches(c1 - 1)) { c1 -= 1; grew = true; } if (c2 < COLS - 1 && colTouches(c2 + 1)) { c2 += 1; grew = true; }
    if (r1 > 0 && rowTouches(r1 - 1)) { r1 -= 1; grew = true; } if (r2 < ROWS - 1 && rowTouches(r2 + 1)) { r2 += 1; grew = true; }
  }
  return { c1, r1, c2, r2 };
}

// ---------------------------------------------------------------- transactions (undo / redo)
/** Records cell changes so they can be undone. Every editing operation writes through one Tx. */
export class Tx {
  constructor(book) { this.book = book; this.p = new Map(); }
  _p(si, key) { const id = `${si}|${key}`; let p = this.p.get(id); if (!p) { const s = this.book.sheets[si]; p = { si, key, r0: s.cells[key], s0: s.sty[key], r1: s.cells[key], s1: s.sty[key] }; this.p.set(id, p); } return p; }
  /** Sets a cell's raw text ('' clears). Returns false when the sheet is full. */
  raw(si, key, val) {
    const s = this.book.sheets[si]; const v = val === '' || val === undefined || val === null ? undefined : String(val).slice(0, MAX_RAW);
    if (s.cells[key] === v) return true;
    if (v !== undefined && s.cells[key] === undefined && s.sty[key] === undefined && this.book.n >= MAX_CELLS) return false;
    const p = this._p(si, key); const had = s.cells[key] !== undefined || s.sty[key] !== undefined;
    if (v === undefined) delete s.cells[key]; else s.cells[key] = v; p.r1 = v;
    this._count(had, s, key); return true;
  }
  /** Sets a cell's style index (-1 or undefined removes it). */
  style(si, key, idx) {
    const s = this.book.sheets[si]; const v = idx === undefined || idx < 0 ? undefined : idx;
    if (s.sty[key] === v) return true;
    if (v !== undefined && s.cells[key] === undefined && s.sty[key] === undefined && this.book.n >= MAX_CELLS) return false;
    const p = this._p(si, key); const had = s.cells[key] !== undefined || s.sty[key] !== undefined;
    if (v === undefined) delete s.sty[key]; else s.sty[key] = v; p.s1 = v; this._count(had, s, key); return true;
  }
  _count(had, s, key) { const has = s.cells[key] !== undefined || s.sty[key] !== undefined; if (had && !has) this.book.n -= 1; else if (!had && has) this.book.n += 1; }
  get empty() { return [...this.p.values()].every((p) => p.r0 === p.r1 && p.s0 === p.s1); }
  get cells() { return [...this.p.values()].filter((p) => p.r0 !== p.r1 || p.s0 !== p.s1); }
  /** Applies the recorded changes in one direction (to `book`, which may have been reloaded since). Returns the cells touched. */
  apply(dir, book = this.book) {
    this.book = book; const out = [];
    for (const p of this.p.values()) {
      const s = this.book.sheets[p.si]; if (!s) continue; const had = s.cells[p.key] !== undefined || s.sty[p.key] !== undefined;
      const r = dir === 'undo' ? p.r0 : p.r1, st = dir === 'undo' ? p.s0 : p.s1;
      if (r === undefined) delete s.cells[p.key]; else s.cells[p.key] = r; if (st === undefined) delete s.sty[p.key]; else s.sty[p.key] = st;
      this._count(had, s, p.key); out.push(p);
    }
    return out;
  }
}

// ---------------------------------------------------------------- structural edits (rows and columns)
/** Inserts n lines before index `at` (axis 'r' rows | 'c' columns) on sheet si, moving cells and rewriting formulas in every sheet. Returns { ok, why? }. */
export function insertLines(book, si, axis, at, n) { return moveLines(book, si, axis, at, n); }
export function deleteLines(book, si, axis, at, n) { return moveLines(book, si, axis, at, -n); }
function moveLines(book, si, axis, at, n) {
  const s = book.sheets[si]; const lim = axis === 'r' ? ROWS : COLS; const isR = axis === 'r';
  if (n > 0) { for (const k of new Set([...Object.keys(s.cells), ...Object.keys(s.sty)])) { const p = rc(k); if (p && (isR ? p.row : p.col) >= lim - n && (s.cells[k] ?? '') !== '') return { ok: false, why: `There isn’t room: that would push data past the last ${isR ? 'row' : 'column'}.` }; } }
  const del = n < 0 ? -n : 0; const first = at, last = at + del - 1;
  const mv = (i) => (n > 0 ? (i >= at ? i + n : i) : (i < first ? i : i > last ? i + n : -1));
  const cells = {}, sty = {};
  for (const k of new Set([...Object.keys(s.cells), ...Object.keys(s.sty)])) {
    const p = rc(k); if (!p) continue; const idx = mv(isR ? p.row : p.col); if (idx < 0 || idx >= lim) continue;
    const nk = isR ? ref(p.col, idx) : ref(idx, p.row); if (s.cells[k] !== undefined) cells[nk] = s.cells[k]; if (s.sty[k] !== undefined) sty[nk] = s.sty[k];
  }
  s.cells = cells; s.sty = sty;
  const size = isR ? s.rh : s.cw; const moved = {}; for (const [k, v] of Object.entries(size)) { const i = mv(Number(k)); if (i >= 0 && i < lim) moved[i] = v; } if (isR) s.rh = moved; else s.cw = moved;
  const hid = (isR ? s.hr : s.hc).map(mv).filter((i) => i >= 0 && i < lim); if (isR) s.hr = hid; else s.hc = hid;
  const k1 = isR ? 'r1' : 'c1', k2 = isR ? 'r2' : 'c2';
  const fixSpan = (g) => {
    if (n > 0) { const a = g[k1] >= at ? g[k1] + n : g[k1]; const b = g[k2] >= at ? g[k2] + n : g[k2]; return b >= lim ? null : { ...g, [k1]: a, [k2]: b }; }
    const a = g[k1] < first ? g[k1] : g[k1] > last ? g[k1] + n : first; const b = g[k2] < first ? g[k2] : g[k2] > last ? g[k2] + n : first - 1;
    return a > b ? null : { ...g, [k1]: a, [k2]: b };
  };
  s.merges = s.merges.map(fixSpan).filter((g) => g && (g.c1 !== g.c2 || g.r1 !== g.r2));
  if (s.filter) { const f = fixSpan(s.filter); s.filter = f; if (f) { const hide = {}; for (const [c, list] of Object.entries(s.filter.hide)) { const nc = isR ? Number(c) : mv(Number(c)); if (nc >= f.c1 && nc <= f.c2) hide[nc] = list; } f.hide = hide; } }
  const fk = isR ? 'r' : 'c'; if (s.freeze[fk] > at) s.freeze[fk] = Math.max(at, s.freeze[fk] + n);
  // formulas everywhere that point at this sheet
  for (const sh of book.sheets) for (const [k, raw] of Object.entries(sh.cells)) if (raw[0] === '=' && raw.length > 1) { const next = `=${shiftFormula(raw.slice(1), sh.name, s.name, axis, at, n)}`; if (next !== raw) sh.cells[k] = next; }
  book.n = countCells(book); return { ok: true };
}
export function renameSheet(book, si, name) {
  const s = book.sheets[si]; const old = s.name; const next = uniqueName(book.sheets, cleanName(name, si), si); if (next === old) return old;
  for (const sh of book.sheets) for (const [k, raw] of Object.entries(sh.cells)) if (raw[0] === '=' && raw.length > 1) { const t = `=${renameSheetInFormula(raw.slice(1), old, next)}`; if (t !== raw) sh.cells[k] = t; }
  s.name = next; return next;
}
export function removeSheet(book, si) {
  const name = book.sheets[si].name; book.sheets.splice(si, 1);
  for (const sh of book.sheets) for (const [k, raw] of Object.entries(sh.cells)) if (raw[0] === '=' && raw.length > 1) { const t = `=${dropSheetInFormula(raw.slice(1), name)}`; if (t !== raw) sh.cells[k] = t; }
  book.n = countCells(book);
}
export function duplicateSheet(book, si) {
  const s = book.sheets[si]; const copy = JSON.parse(JSON.stringify(s)); copy.name = uniqueName(book.sheets, `${s.name} copy`.slice(0, 40));
  book.sheets.splice(si + 1, 0, copy); book.n = countCells(book); return si + 1;
}

// ---------------------------------------------------------------- merges, sort, fill
export const mergeAt = (s, c, r) => s.merges.find((g) => c >= g.c1 && c <= g.c2 && r >= g.r1 && r <= g.r2) ?? null;
/** Merges the range (keeps the top-left value; the others are cleared through tx). */
export function mergeRange(book, si, g, tx) {
  const s = book.sheets[si]; if (g.c1 === g.c2 && g.r1 === g.r2) return;
  s.merges = s.merges.filter((m) => m.c2 < g.c1 || m.c1 > g.c2 || m.r2 < g.r1 || m.r1 > g.r2);
  for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) if (c !== g.c1 || r !== g.r1) { tx.raw(si, ref(c, r), ''); tx.style(si, ref(c, r), -1); }
  s.merges.push({ c1: g.c1, r1: g.r1, c2: g.c2, r2: g.r2 });
}
export function unmergeRange(book, si, g) { const s = book.sheets[si]; s.merges = s.merges.filter((m) => m.c2 < g.c1 || m.c1 > g.c2 || m.r2 < g.r1 || m.r1 > g.r2); }
/** Sorts the rows of range g by the values in column `col` (a number, ascending or descending). Empty cells stay last. Formulas keep pointing at the same relative cells. */
export function sortRange(book, si, g, col, dir, tx, calc) {
  const s = book.sheets[si]; const rows = [];
  for (let r = g.r1; r <= g.r2; r++) { const line = []; for (let c = g.c1; c <= g.c2; c++) line.push({ raw: s.cells[ref(c, r)], sty: s.sty[ref(c, r)] }); rows.push({ r, line, key: calc.value(si, col, r) }); }
  const order = rows.slice().sort((a, b) => {
    const ea = a.key === null || a.key === '', eb = b.key === null || b.key === ''; if (ea || eb) return ea === eb ? a.r - b.r : ea ? 1 : -1;
    const ca = isError(a.key) ? 1 : 0, cb = isError(b.key) ? 1 : 0; if (ca || cb) return ca - cb || a.r - b.r;
    return (dir === 'desc' ? -1 : 1) * compareValues(a.key, b.key) || a.r - b.r;
  });
  order.forEach((row, i) => {
    const target = g.r1 + i; row.line.forEach((cell, j) => {
      const key = ref(g.c1 + j, target); const raw = cell.raw !== undefined && cell.raw[0] === '=' ? `=${translateFormula(cell.raw.slice(1), target - row.r, 0)}` : cell.raw;
      tx.raw(si, key, raw ?? ''); tx.style(si, key, cell.sty ?? -1);
    });
  });
}
/** Hidden rows produced by the sheet's filter. */
export function filteredRows(book, si, calc) {
  const out = new Set(); const f = book.sheets[si].filter; if (!f) return out;
  for (let r = f.r1 + 1; r <= f.r2; r++) for (const [c, list] of Object.entries(f.hide)) { if (list.length && list.includes(cellText(book, si, calc, Number(c), r))) { out.add(r); break; } }
  return out;
}
const SERIES = /^(.*?)(-?\d+)$/;
/**
 * Fills the target range from the source range by repeating (and continuing number series). dir: 'down' | 'up' | 'right' | 'left'.
 * src and target are {c1,r1,c2,r2}; target lies next to src. Relative formula references move with the copy.
 */
export function fillRange(book, si, src, target, dir, tx, series = true) {
  const s = book.sheets[si]; const vertical = dir === 'down' || dir === 'up';
  const lines = vertical ? src.c2 - src.c1 + 1 : src.r2 - src.r1 + 1; const len = vertical ? src.r2 - src.r1 + 1 : src.c2 - src.c1 + 1;
  const at = (line, i) => (vertical ? ref(src.c1 + line, src.r1 + i) : ref(src.c1 + i, src.r1 + line));
  for (let line = 0; line < lines; line++) {
    const raws = Array.from({ length: len }, (_, i) => s.cells[at(line, i)]);
    const nums = raws.map((x) => (x !== undefined && x[0] !== '=' ? parseLiteral(x).v : NaN));
    let step = null;
    if (series && raws.every((x) => x !== undefined && x[0] !== '=') && nums.every((x) => typeof x === 'number')) { if (len === 1) step = 0; else { const d = nums[1] - nums[0]; if (nums.every((x, i) => i === 0 || Math.abs(x - nums[i - 1] - d) < 1e-9)) step = d; } }
    const m1 = series && len === 1 && raws[0] !== undefined && raws[0][0] !== '=' && typeof nums[0] !== 'number' ? SERIES.exec(raws[0]) : null;
    const count = vertical ? target.r2 - target.r1 + 1 : target.c2 - target.c1 + 1;
    for (let j = 0; j < count; j++) {
      const forward = dir === 'down' || dir === 'right';
      const pos = forward ? j : count - 1 - j;                       // position along the target, counted from the source edge outward
      const dist = pos + 1; const srcIdx = forward ? (dist - 1) % len : (len - 1 - ((dist - 1) % len));
      const tgt = vertical ? ref(src.c1 + line, forward ? src.r2 + dist : src.r1 - dist) : ref(forward ? src.c2 + dist : src.c1 - dist, src.r1 + line);
      const from = at(line, srcIdx); let raw = s.cells[from];
      if (step !== null && step !== 0) { const base = forward ? nums[len - 1] : nums[0]; raw = String(Math.round((base + (forward ? dist : -dist) * step) * 1e10) / 1e10); const nf = impliedFormat(raws[0]); if (nf?.k === 'pct') raw = `${Math.round(Number(raw) * 1e8) / 1e6}%`; else if (nf?.k === 'date') raw = fromSerial(Number(raw)).toISOString().slice(0, 10); }
      else if (m1 && step === null) { raw = `${m1[1]}${Number(m1[2]) + (forward ? dist : -dist)}`; }
      else if (raw !== undefined && raw[0] === '=') { const p = rc(from), q = rc(tgt); raw = `=${translateFormula(raw.slice(1), q.row - p.row, q.col - p.col)}`; }
      tx.raw(si, tgt, raw ?? ''); tx.style(si, tgt, s.sty[from] ?? -1);
    }
  }
}

// ---------------------------------------------------------------- text interchange: CSV and TSV
/** Parses delimited text (RFC 4180: quotes, doubled quotes, newlines inside quotes). delim is detected when not given. */
export function parseCSV(text, delim) {
  text = String(text ?? '').replace(/^﻿/, '');
  if (!delim) {
    const first = text.slice(0, 4000).split(/\r?\n/)[0] ?? ''; const count = (ch) => { let n = 0, q = false; for (const x of first) { if (x === '"') q = !q; else if (!q && x === ch) n++; } return n; };
    const best = [['\t', count('\t')], [';', count(';')], [',', count(',')]].sort((x, y) => y[1] - x[1])[0]; delim = best[1] > 0 ? best[0] : ',';
  }
  const rows = []; let row = [], field = '', q = false, i = 0; const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } q = false; i++; continue; } field += ch; i++; continue; }
    if (ch === '"' && field === '') { q = true; i++; continue; }
    if (ch === delim) { row.push(field); field = ''; i++; continue; }
    if (ch === '\r' || ch === '\n') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += ch; i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}
const needsQuote = (v, delim) => v.includes(delim) || /["\r\n]/.test(v);
export function toDelimited(rows, delim = ',') { return rows.map((r) => r.map((v) => { v = v ?? ''; return needsQuote(v, delim) ? `"${v.replace(/"/g, '""')}"` : v; }).join(delim)).join('\r\n'); }
export const toCSV = (rows) => toDelimited(rows, ',');
/** CSV cell text for a value. Text that a spreadsheet program would run as a formula (= + - @ at the start) gets a leading ' so it stays text. */
export function csvCell(v, text) { if (typeof v === 'string' && /^[=+\-@\t\r]/.test(text)) return `'${text}`; return text; }
export const toTSV = (rows) => toDelimited(rows, '\t');
export const parseTSV = (text) => { const rows = parseCSV(text, '\t'); if (rows.length > 1 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') rows.pop(); return rows; };

/** The text a cell shows: its value formatted by its number format (or the format its typed text implies). */
export function cellText(book, si, calc, c, r) {
  const s = book.sheets[si]; const key = ref(c, r); const v = calc.value(si, c, r);
  const st = s.sty[key] !== undefined ? book.styles[s.sty[key]] : null;
  if (typeof v === 'number') return formatValue(v, st?.nf ?? impliedFormat(s.cells[key]));
  if (typeof v === 'string' && st?.nf?.k === 'text') return v;
  return formatValue(v);
}
/** Compatibility with the first editor: evaluates one sheet on its own. */
export function evaluateSheet(sheet) { const book = { sheets: [{ ...emptySheet(sheet.name ?? 'Sheet 1'), cells: sheet.cells }] }; const calc = createCalc(book); return { get: (k) => calc.get(0, k), get values() { return Object.fromEntries(Object.keys(sheet.cells).map((k) => [k, calc.get(0, k)])); } }; }
export function display(v) { if (v === null || v === undefined) return ''; if (typeof v === 'number') return generalNumber(v); if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'; return String(v); }
