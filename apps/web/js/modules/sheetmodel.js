// Sheets: the stored model and the formula engine. Pure functions, no DOM, no eval: a formula is tokenised and evaluated by a small parser,
// so a stored sheet can never run code. The body is JSON ({ v: 1, sheets: [{ name, cells: { A1: 'raw text or =formula' } }] }), never HTML.
export const MIME = 'application/vnd.l2f.sheet+json';
export const COLS = 26, ROWS = 100, MAX_CELLS = 20000, MAX_SHEETS = 20, MAX_RAW = 2000, MAX_CHARS = 200000;
export const colName = (i) => String.fromCharCode(65 + i);
export const ref = (col, row) => `${colName(col)}${row + 1}`;
export function parseRef(s) { const m = /^([A-Z])([1-9]\d{0,2})$/.exec(String(s).toUpperCase()); if (!m) return null; const col = m[1].charCodeAt(0) - 65; const row = Number(m[2]) - 1; return col < COLS && row < ROWS ? { col, row } : null; }

export const emptySheet = (name = 'Sheet 1') => ({ name, cells: {} });
export const emptyBook = () => ({ v: 1, sheets: [emptySheet()] });
const cleanName = (n, i) => { const t = String(n ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40); return t || `Sheet ${i + 1}`; };

/** Reads any stored text into a safe book: unknown shapes become an empty sheet, junk cells are dropped, sizes are capped. */
export function parseBook(text) {
  let raw; try { raw = JSON.parse(text); } catch { raw = null; }
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.sheets)) return emptyBook();
  let total = 0;
  const sheets = raw.sheets.slice(0, MAX_SHEETS).map((s, i) => {
    const cells = {};
    for (const [k, v] of Object.entries(s?.cells && typeof s.cells === 'object' ? s.cells : {})) {
      if (!parseRef(k) || typeof v !== 'string' || v === '' || total >= MAX_CELLS) continue;
      cells[k.toUpperCase()] = v.slice(0, MAX_RAW); total += 1;
    }
    return { name: cleanName(s?.name, i), cells };
  });
  return sheets.length ? { v: 1, sheets } : emptyBook();
}
export function serializeBook(book) {
  const sheets = book.sheets.map((s) => ({ name: s.name, cells: Object.fromEntries(Object.entries(s.cells).filter(([, v]) => v !== '').sort(([a], [b]) => (parseRef(a).row - parseRef(b).row) || (parseRef(a).col - parseRef(b).col))) }));
  return JSON.stringify({ v: 1, sheets });
}

// ---------------------------------------------------------------- formulas
const TOKEN = /\s*(?:(\d+(?:\.\d+)?|\.\d+)|([A-Za-z]+\d+:[A-Za-z]+\d+)|([A-Za-z]+\d+)|([A-Za-z][A-Za-z0-9_]*)|(.))/y;
function tokenize(src) {
  const out = []; TOKEN.lastIndex = 0; let m;
  while (TOKEN.lastIndex < src.length && (m = TOKEN.exec(src))) {
    if (m[1] !== undefined) out.push({ t: 'num', v: Number(m[1]) });
    else if (m[2]) out.push({ t: 'range', v: m[2].toUpperCase() });
    else if (m[3]) out.push({ t: 'ref', v: m[3].toUpperCase() });
    else if (m[4]) out.push({ t: 'name', v: m[4].toUpperCase() });
    else if (m[5] !== undefined) { if (!'+-*/(),^%'.includes(m[5]) || m[5].trim() === '') { if (m[5].trim() === '') break; throw new FormulaError('#ERR!'); } out.push({ t: 'op', v: m[5] }); }
    else break;
  }
  return out;
}
class FormulaError extends Error { constructor(code) { super(code); this.code = code; } }
const FUNCS = {
  SUM: (xs) => xs.reduce((a, b) => a + b, 0),
  AVERAGE: (xs) => { if (!xs.length) throw new FormulaError('#DIV/0!'); return xs.reduce((a, b) => a + b, 0) / xs.length; },
  MIN: (xs) => (xs.length ? Math.min(...xs) : 0), MAX: (xs) => (xs.length ? Math.max(...xs) : 0), COUNT: (xs) => xs.length,
  ROUND: (xs) => { const [x, d = 0] = xs; return Math.round(x * 10 ** d) / 10 ** d; }, ABS: (xs) => Math.abs(xs[0]),
};
export const FUNCTION_NAMES = Object.keys(FUNCS);

/** Evaluates one sheet. Returns { values: { A1: number|string|error }, errors: Set } — numbers are numbers, text stays text, errors are '#...' strings. */
export function evaluateSheet(sheet) {
  const cache = new Map(); const stack = new Set();
  const cellValue = (key) => {
    if (cache.has(key)) return cache.get(key);
    if (stack.has(key)) throw new FormulaError('#CYCLE!');
    const raw = sheet.cells[key];
    let val;
    if (raw === undefined || raw === '') val = null;
    else if (raw[0] === '=') {
      stack.add(key);
      try { val = evalFormula(raw.slice(1)); } catch (e) { val = e instanceof FormulaError ? e.code : '#ERR!'; } finally { stack.delete(key); }
    } else if (raw.trim() !== '' && Number.isFinite(Number(raw.replace(/,/g, '')))) val = Number(raw.replace(/,/g, ''));
    else val = raw;
    cache.set(key, val); return val;
  };
  const num = (key) => { const v = cellValue(key); if (typeof v === 'string' && v[0] === '#') throw new FormulaError(v); return typeof v === 'number' ? v : (v === null ? 0 : NaN); };
  function evalFormula(src) {
    const toks = tokenize(src); let i = 0;
    const peek = () => toks[i]; const take = () => toks[i++];
    const expect = (v) => { const t = take(); if (!t || t.t !== 'op' || t.v !== v) throw new FormulaError('#ERR!'); };
    const rangeCells = (r) => { const [a, b] = r.split(':').map(parseRef); if (!a || !b) throw new FormulaError('#REF!'); const out = []; for (let c = Math.min(a.col, b.col); c <= Math.max(a.col, b.col); c++) for (let w = Math.min(a.row, b.row); w <= Math.max(a.row, b.row); w++) out.push(ref(c, w)); return out; };
    function primary() {
      const t = take(); if (!t) throw new FormulaError('#ERR!');
      if (t.t === 'num') { let v = t.v; while (peek()?.t === 'op' && peek().v === '%') { take(); v /= 100; } return v; }
      if (t.t === 'ref') { if (!parseRef(t.v)) throw new FormulaError('#REF!'); const v = num(t.v); if (Number.isNaN(v)) throw new FormulaError('#VALUE!'); return v; }
      if (t.t === 'op' && t.v === '(') { const v = sum(); expect(')'); return v; }
      if (t.t === 'op' && t.v === '-') return -power();
      if (t.t === 'op' && t.v === '+') return power();
      if (t.t === 'name') {
        const f = FUNCS[t.v]; if (!f) throw new FormulaError('#NAME?');
        expect('('); const args = [];
        if (!(peek()?.t === 'op' && peek().v === ')')) {
          for (;;) {
            const p = peek();
            if (p?.t === 'range') { take(); for (const k of rangeCells(p.v)) { const v = cellValue(k); if (typeof v === 'string' && v[0] === '#') throw new FormulaError(v); if (typeof v === 'number') args.push(v); } }
            else args.push(sum());
            if (peek()?.t === 'op' && peek().v === ',') { take(); continue; }
            break;
          }
        }
        expect(')'); return f(args);
      }
      throw new FormulaError('#ERR!');
    }
    function power() { const base = primary(); if (peek()?.t === 'op' && peek().v === '^') { take(); return base ** power(); } return base; }
    function product() { let v = power(); while (peek()?.t === 'op' && (peek().v === '*' || peek().v === '/')) { const op = take().v; const r = power(); if (op === '/') { if (r === 0) throw new FormulaError('#DIV/0!'); v /= r; } else v *= r; } return v; }
    function sum() { let v = product(); while (peek()?.t === 'op' && (peek().v === '+' || peek().v === '-')) { const op = take().v; const r = product(); v = op === '+' ? v + r : v - r; } return v; }
    const v = sum(); if (i < toks.length) throw new FormulaError('#ERR!');
    if (!Number.isFinite(v)) throw new FormulaError('#NUM!');
    return Math.round(v * 1e10) / 1e10;
  }
  const values = {};
  for (const key of Object.keys(sheet.cells)) values[key] = cellValue(key);
  return { values, get: cellValue };
}
export const isError = (v) => typeof v === 'string' && /^#[A-Z/0!?]+!?$|^#NAME\?$/.test(v);
export function display(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6);
  return String(v);
}
