// Sheets formula engine. Pure functions, no DOM, no eval: a formula is tokenised, parsed into a small syntax tree and evaluated by walking it,
// so a stored sheet can never run code. Values are number | string | boolean | null (empty) | CalcError.
// createCalc(book) evaluates cells lazily with a cache and a dependency graph: changing one cell only clears the cells that (transitively) use it.
export const COLS = 52, ROWS = 1000;
export class CalcError { constructor(code) { this.code = code; } toString() { return this.code; } }
export const E = { DIV0: new CalcError('#DIV/0!'), REF: new CalcError('#REF!'), NAME: new CalcError('#NAME?'), VALUE: new CalcError('#VALUE!'), CIRC: new CalcError('#CIRC!'), ERR: new CalcError('#ERR!'), NUM: new CalcError('#NUM!'), NA: new CalcError('#N/A') };
export const isError = (v) => v instanceof CalcError;
const fail = (e) => { throw e; };

// ---------------------------------------------------------------- references
export const colName = (i) => { let s = ''; let n = i + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
export const colIndex = (letters) => { let n = 0; for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
export const ref = (col, row) => `${colName(col)}${row + 1}`;
export function parseRef(s) { const m = /^([A-Za-z]{1,2})([1-9]\d{0,3})$/.exec(String(s)); if (!m) return null; const col = colIndex(m[1]); const row = Number(m[2]) - 1; return col < COLS && row < ROWS ? { col, row } : null; }
export function parseRange(s) { const [a, b] = String(s).split(':'); const p = parseRef(a); const q = b === undefined ? p : parseRef(b); if (!p || !q) return null; return { c1: Math.min(p.col, q.col), r1: Math.min(p.row, q.row), c2: Math.max(p.col, q.col), r2: Math.max(p.row, q.row) }; }
export const rangeLabel = (g) => (g.c1 === g.c2 && g.r1 === g.r2 ? ref(g.c1, g.r1) : `${ref(g.c1, g.r1)}:${ref(g.c2, g.r2)}`);

const SHEET = "(?:'((?:[^']|'')+)'|([A-Za-z_][A-Za-z0-9_.]*))!";
const CELL = '(\\$?)([A-Za-z]{1,3})(\\$?)(\\d{1,7})';
const COLR = '(\\$?)([A-Za-z]{1,3}):(\\$?)([A-Za-z]{1,3})';
// one scanner for the tokenizer and the reference rewriters: string literal | [sheet!]cell[:cell] | [sheet!]col:col
const SCAN_SRC = `"(?:[^"]|"")*"|(?<![A-Za-z0-9_.$'])((?:${SHEET})?)(?:${CELL}(?::${CELL})?(?![A-Za-z0-9_(.])|${COLR}(?![A-Za-z0-9_(.]))`;
const mkScan = () => new RegExp(SCAN_SRC, 'g');
function unpack(m) {
  const sheet = m[2] !== undefined ? m[2].replace(/''/g, "'") : (m[3] !== undefined ? m[3] : null);
  if (m[8] !== undefined || m[4] !== undefined) {
    const a = { ac: m[4] === '$', c: colIndex(m[5]), ar: m[6] === '$', r: Number(m[7]) - 1 };
    const b = m[8] !== undefined ? { ac: m[8] === '$', c: colIndex(m[9]), ar: m[10] === '$', r: Number(m[11]) - 1 } : null;
    return { sheet, prefix: m[1] ?? '', a, b, col: false };
  }
  return { sheet, prefix: m[1] ?? '', a: { ac: m[12] === '$', c: colIndex(m[13]), ar: false, r: 0 }, b: { ac: m[14] === '$', c: colIndex(m[15]), ar: false, r: ROWS - 1 }, col: true };
}
const quoteSheet = (n) => (/^[A-Za-z_][A-Za-z0-9_.]*$/.test(n) && !/^[A-Za-z]{1,3}\d+$/.test(n) ? n : `'${n.replace(/'/g, "''")}'`);
function emit(u, a, b) {
  const pre = u.prefix;
  const one = (p) => `${p.ac ? '$' : ''}${colName(p.c)}${p.ar ? '$' : ''}${p.r + 1}`;
  if (u.col) return `${pre}${u.a.ac ? '$' : ''}${colName(a.c)}:${u.b.ac ? '$' : ''}${colName(b.c)}`;
  return b ? `${pre}${one(a)}:${one(b)}` : `${pre}${one(a)}`;
}
/** Rewrites every reference in a formula body. cb(parts) returns { a, b } (new corners) | null (turn into #REF!) | undefined (leave). Skips string literals. */
export function mapRefs(src, cb) {
  return String(src).replace(mkScan(), (all, ...g) => {
    if (all[0] === '"') return all;
    const m = [all, ...g]; const u = unpack(m);
    const r = cb(u); if (r === undefined) return all;
    return r === null ? '#REF!' : emit(u, r.a, r.b);
  });
}
const sameName = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
/** Insert (n > 0) or delete (n < 0) |n| rows/columns at index `at` of sheet `target`; formulaSheet is the sheet holding this formula. */
export function shiftFormula(src, formulaSheet, target, axis, at, n) {
  const key = axis === 'r' ? 'r' : 'c'; const lim = axis === 'r' ? ROWS : COLS;
  return mapRefs(src, (u) => {
    if (!sameName(u.sheet ?? formulaSheet, target)) return undefined;
    if (u.col && axis === 'r') return undefined;
    const a = { ...u.a }, b = u.b ? { ...u.b } : null;
    if (n > 0) { for (const p of [a, b]) if (p && p[key] >= at) p[key] += n; if ((b ?? a)[key] >= lim) return null; return { a, b }; }
    const del = -n; const end = at + del - 1;
    const fix = (p, isEnd) => (p[key] < at ? p[key] : p[key] > end ? p[key] - del : (isEnd ? at - 1 : at));
    if (!b) { if (a[key] >= at && a[key] <= end) return null; a[key] = fix(a, false); return { a, b }; }
    const lo = Math.min(a[key], b[key]), hi = Math.max(a[key], b[key]);
    const nl = fix({ [key]: lo }, false), nh = fix({ [key]: hi }, true);
    if (nl > nh) return null;
    const flip = a[key] > b[key]; a[key] = flip ? nh : nl; b[key] = flip ? nl : nh; return { a, b };
  });
}
/** Moves relative references by (dr, dc) as when a formula is copied or filled. Absolute ($) parts stay. */
export function translateFormula(src, dr, dc) {
  return mapRefs(src, (u) => {
    const mv = (p) => ({ ...p, c: p.ac ? p.c : p.c + dc, r: p.ar ? p.r : p.r + dr });
    const a = mv(u.a), b = u.b ? mv(u.b) : null;
    for (const p of [a, b]) if (p && (p.c < 0 || p.r < 0 || p.c >= COLS || p.r >= ROWS)) return null;
    return { a, b };
  });
}
/** A sheet was renamed: formulas keep pointing at it. */
export function renameSheetInFormula(src, from, to) {
  return String(src).replace(mkScan(), (all, ...g) => {
    if (all[0] === '"') return all;
    const u = unpack([all, ...g]); if (u.sheet === null || !sameName(u.sheet, from)) return all;
    return `${quoteSheet(to)}!${all.slice(u.prefix.length)}`;
  });
}
/** A sheet was deleted: references to it become #REF!. */
export function dropSheetInFormula(src, name) {
  return String(src).replace(mkScan(), (all, ...g) => { if (all[0] === '"') return all; const u = unpack([all, ...g]); return u.sheet !== null && sameName(u.sheet, name) ? '#REF!' : all; });
}

// ---------------------------------------------------------------- tokenizer + parser
const TOK = new RegExp(`\\s*(?:(\\d+(?:\\.\\d*)?(?:[eE][+-]?\\d+)?|\\.\\d+(?:[eE][+-]?\\d+)?)|"((?:[^"]|"")*)"|(?<![A-Za-z0-9_.$'])((?:${SHEET})?)(?:${CELL}(?::${CELL})?(?![A-Za-z0-9_(.])|${COLR}(?![A-Za-z0-9_(.]))|([A-Za-z_][A-Za-z0-9_.]*)|(<>|<=|>=|[-+*/^&=<>(),%:;]))`, 'y');
function tokenize(src) {
  const out = []; TOK.lastIndex = 0; const n = src.length;
  while (TOK.lastIndex < n) {
    const start = TOK.lastIndex; const m = TOK.exec(src);
    if (!m) { if (/^\s*$/.test(src.slice(start))) break; fail(E.ERR); }
    if (m[1] !== undefined) out.push({ t: 'num', v: Number(m[1]) });
    else if (m[2] !== undefined) out.push({ t: 'str', v: m[2].replace(/""/g, '"') });
    else if (m[3] !== undefined) {
      const full = m[0].trimStart(); const u = unpack([full, ...m.slice(3, 18)]);
      out.push({ t: 'ref', sheet: u.sheet, a: u.a, b: u.b, col: u.col });
    } else if (m[18] !== undefined) out.push({ t: 'name', v: m[18].toUpperCase() });
    else if (m[19] !== undefined) out.push({ t: 'op', v: m[19] });
    else break;
  }
  return out;
}
const cache = new Map();
/** Parses a formula body (without the leading =) into a tree. Throws CalcError for syntax errors. Results are cached. */
export function parseFormula(src) {
  if (cache.has(src)) { const c = cache.get(src); if (c instanceof CalcError) throw c; return c; }
  let res;
  try { res = parse(tokenize(src)); } catch (e) { res = e instanceof CalcError ? e : E.ERR; }
  if (cache.size > 4000) cache.clear();
  cache.set(src, res); if (res instanceof CalcError) throw res; return res;
}
function parse(toks) {
  let i = 0; const peek = () => toks[i]; const take = () => toks[i++];
  const isOp = (...v) => peek()?.t === 'op' && v.includes(peek().v);
  const expect = (v) => { const t = take(); if (!t || t.t !== 'op' || t.v !== v) fail(E.ERR); };
  const cmp = () => { let a = cat(); while (isOp('=', '<>', '<', '>', '<=', '>=')) { const op = take().v; a = { t: 'bin', op, a, b: cat() }; } return a; };
  const cat = () => { let a = add(); while (isOp('&')) { take(); a = { t: 'bin', op: '&', a, b: add() }; } return a; };
  const add = () => { let a = mul(); while (isOp('+', '-')) { const op = take().v; a = { t: 'bin', op, a, b: mul() }; } return a; };
  const mul = () => { let a = pow(); while (isOp('*', '/')) { const op = take().v; a = { t: 'bin', op, a, b: pow() }; } return a; };
  const pow = () => { let a = unary(); while (isOp('^')) { take(); a = { t: 'bin', op: '^', a, b: unary() }; } return a; };   // left-associative, like Excel
  const unary = () => { if (isOp('-', '+')) { const op = take().v; return { t: 'un', op, a: unary() }; } return post(); };
  const post = () => { let a = primary(); while (isOp('%')) { take(); a = { t: 'pct', a }; } return a; };
  function primary() {
    const t = take(); if (!t) fail(E.ERR);
    if (t.t === 'num') return { t: 'num', v: t.v };
    if (t.t === 'str') return { t: 'str', v: t.v };
    if (t.t === 'ref') return { t: 'ref', sheet: t.sheet, a: t.a, b: t.b, col: t.col };
    if (t.t === 'op' && t.v === '(') { const e = cmp(); expect(')'); return e; }
    if (t.t === 'name') {
      if (!isOp('(')) { if (t.v === 'TRUE') return { t: 'bool', v: true }; if (t.v === 'FALSE') return { t: 'bool', v: false }; return { t: 'name', v: t.v }; }
      take(); const args = [];
      if (!isOp(')')) for (;;) { if (isOp(',', ';', ')')) args.push({ t: 'empty' }); else args.push(cmp()); if (isOp(',', ';')) { take(); continue; } break; }
      expect(')'); return { t: 'fn', name: t.v, args };
    }
    return fail(E.ERR);
  }
  const tree = cmp(); if (i < toks.length) fail(E.ERR); return tree;
}

// ---------------------------------------------------------------- dates and number formats
const DAY = 86400000, EPOCH = 25569;
export const toSerial = (ms) => ms / DAY + EPOCH;
export const fromSerial = (s) => new Date(Math.round((s - EPOCH) * DAY));
export function dateSerial(y, m, d) { return Math.floor(Date.UTC(y, m - 1, d) / DAY) + EPOCH; }
const pad = (n, w = 2) => String(n).padStart(w, '0');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function parseDateText(s) {
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s), y, mo, d;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; } else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s))) { mo = +m[1]; d = +m[2]; y = +m[3]; } else return null;
  const dt = new Date(Date.UTC(y, mo - 1, d)); return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? dateSerial(y, mo, d) : null;
}
const group = (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
function fixed(n, d, th) { const neg = n < 0; const s = Math.abs(n).toFixed(d); const [i, f] = s.split('.'); const body = (th ? group(i) : i) + (f ? `.${f}` : ''); return neg && Number(s) !== 0 ? `-${body}` : body; }
export function generalNumber(n) {
  if (!Number.isFinite(n)) return String(n); if (n === 0) return '0';
  const a = Math.abs(n); if (a >= 1e11 || a < 1e-9) return n.toExponential(5).replace(/\.?0+e/, 'e').replace('e+', 'E+').replace('e-', 'E-');
  return String(Number(n.toPrecision(10)));
}
export const NF_KINDS = ['gen', 'num', 'cur', 'pct', 'date', 'time', 'datetime', 'text'];
export const DATE_FORMS = { iso: 'yyyy-mm-dd', us: 'mm/dd/yyyy', eu: 'dd/mm/yyyy', long: 'mmm d, yyyy' };
function dateTokens(fmt, s) {
  const dt = fromSerial(s); const Y = dt.getUTCFullYear(), Mo = dt.getUTCMonth(), D = dt.getUTCDate(), H = dt.getUTCHours(), Mi = dt.getUTCMinutes(), S = dt.getUTCSeconds();
  let prevH = false;
  return fmt.replace(/yyyy|yy|mmmm|mmm|mm|m|dd|d|hh|h|ss|s|AM\/PM|\[[^\]]*\]|"[^"]*"/gi, (t) => {
    const k = t.toLowerCase();
    if (k === 'yyyy') return String(Y); if (k === 'yy') return pad(Y % 100);
    if (k === 'mmmm') return MONL[Mo]; if (k === 'mmm') return MON[Mo];
    if (k === 'mm' || k === 'm') { const out = prevH ? (k === 'mm' ? pad(Mi) : String(Mi)) : (k === 'mm' ? pad(Mo + 1) : String(Mo + 1)); prevH = false; return out; }
    if (k === 'dd') return pad(D); if (k === 'd') return String(D);
    if (k === 'hh' || k === 'h') { prevH = true; const hh = /AM\/PM/i.test(fmt) ? (H % 12 || 12) : H; return k === 'hh' ? pad(hh) : String(hh); }
    if (k === 'ss') return pad(S); if (k === 's') return String(S);
    if (k === 'am/pm') return H < 12 ? 'AM' : 'PM';
    return t[0] === '"' || t[0] === '[' ? t.slice(1, -1) : t;
  });
}
/** Formats a value for display. nf: { k: 'num'|'cur'|'pct'|'date'|'time'|'datetime'|'text', d: decimals, sym, th, f: date form } or undefined for General. */
export function formatValue(v, nf) {
  if (v === null || v === undefined) return '';
  if (v instanceof CalcError) return v.code;
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'string') return v;
  const k = nf?.k ?? 'gen';
  const d = Math.max(0, Math.min(10, nf?.d ?? 2));
  if (k === 'num') return fixed(v, d, nf?.th !== false);
  if (k === 'cur') { const sym = nf?.sym ?? '$'; const s = fixed(Math.abs(v), d, true); return v < 0 && Number(s.replace(/,/g, '')) !== 0 ? `-${sym}${s}` : `${sym}${s}`; }
  if (k === 'pct') return `${fixed(v * 100, nf?.d ?? 0, false)}%`;
  if (k === 'date') return dateTokens(DATE_FORMS[nf?.f] ?? DATE_FORMS.iso, v);
  if (k === 'time') return dateTokens('hh:mm:ss', v);
  if (k === 'datetime') return dateTokens(`${DATE_FORMS[nf?.f] ?? DATE_FORMS.iso} hh:mm`, v);
  if (k === 'text') return generalNumber(v);
  return generalNumber(v);
}
/** TEXT(value, "format"): the common patterns (0, 0.00, #,##0.00, 0%, $#,##0, dates and times). */
export function textFormat(v, fmt) {
  if (typeof v !== 'number') return formatValue(v);
  if (/[ymdhs]/i.test(fmt.replace(/"[^"]*"/g, '')) && !/^[#0,.%$€£¥\s-]+$/.test(fmt)) return dateTokens(fmt, v);
  const m = /^([^#0]*)([#0,]*)(?:\.([0#]*))?([^#0]*)$/.exec(fmt.replace(/"([^"]*)"/g, '$1')); if (!m) return generalNumber(v);
  const [, pre, int, dec = '', post] = m; const pct = /%/.test(post) || /%/.test(pre); const x = pct ? v * 100 : v;
  const body = fixed(x, dec.length, int.includes(','));
  const lead = (int.match(/0/g) || []).length; const padded = /^-?\d+/.test(body) && lead > 1 ? body.replace(/^(-?)(\d+)/, (_a, s, n) => s + n.padStart(lead, '0')) : body;
  return `${pre}${padded}${post}`;
}
const PCT_RE = /^[-+]?\d+(?:\.\d+)?%$/;
/** Reads typed text the way a spreadsheet does: numbers (with thousands commas, a currency sign or %), TRUE/FALSE, dates, otherwise text. A leading ' forces text. */
export function parseLiteral(raw) {
  if (raw === undefined || raw === null || raw === '') return { v: null };
  if (raw[0] === "'") return { v: raw.slice(1) };
  const t = raw.trim(); if (t === '') return { v: raw };
  const up = t.toUpperCase(); if (up === 'TRUE') return { v: true }; if (up === 'FALSE') return { v: false };
  if (/^[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)?(?:\.\d+)?(?:[eE][-+]?\d+)?$/.test(t) && /\d/.test(t)) { const n = Number(t.replace(/,/g, '')); if (Number.isFinite(n)) return { v: n }; }
  if (PCT_RE.test(t)) return { v: Number(t.slice(0, -1)) / 100, nf: { k: 'pct', d: (t.split('.')[1] ?? '%').length - 1 } };
  const cur = /^(-?)([$€£¥])\s?(-?)((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)$/.exec(t);
  if (cur) { const n = Number(cur[4].replace(/,/g, '')) * (cur[1] || cur[3] ? -1 : 1); return { v: n, nf: { k: 'cur', sym: cur[2], d: (cur[4].split('.')[1] ?? '').length } }; }
  const dt = parseDateText(t); if (dt !== null) return { v: dt, nf: { k: 'date', f: t.includes('/') ? 'us' : 'iso' } };
  return { v: raw };
}
/** A format implied by what was typed (a date, a percentage…) when the cell has no format of its own. */
export function impliedFormat(raw) {
  if (!raw) return undefined;
  if (raw[0] === '=') { const m = /^=\s*(TODAY|NOW|DATE)\s*\(/i.exec(raw); return m ? { k: m[1].toUpperCase() === 'NOW' ? 'datetime' : 'date' } : undefined; }
  return parseLiteral(raw).nf;
}

// ---------------------------------------------------------------- coercion helpers
const toNum = (v) => {
  if (v instanceof CalcError) throw v; if (v === null || v === undefined) return 0; if (typeof v === 'number') return v; if (typeof v === 'boolean') return v ? 1 : 0;
  const p = parseLiteral(String(v)); if (typeof p.v === 'number') return p.v; return fail(E.VALUE);
};
const toStr = (v) => { if (v instanceof CalcError) throw v; if (v === null || v === undefined) return ''; if (typeof v === 'number') return generalNumber(v); if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'; return v; };
const toBool = (v) => { if (v instanceof CalcError) throw v; if (v === null || v === undefined) return false; if (typeof v === 'boolean') return v; if (typeof v === 'number') return v !== 0; const u = String(v).toUpperCase(); if (u === 'TRUE') return true; if (u === 'FALSE') return false; return fail(E.VALUE); };
const rank = (v) => (typeof v === 'number' ? 1 : typeof v === 'string' ? 2 : typeof v === 'boolean' ? 3 : 0);
/** Spreadsheet ordering: numbers < text < booleans; text compares without regard to case; empty equals 0 and ''. */
export function compareValues(a, b) {
  if (a === null) a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0; if (b === null) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0;
  const ra = rank(a), rb = rank(b); if (ra !== rb) return ra < rb ? -1 : 1;
  if (ra === 2) { const x = a.toLowerCase(), y = b.toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; }
  return a < b ? -1 : a > b ? 1 : 0;
}
const round10 = (n) => (Number.isFinite(n) ? Math.round(n * 1e10) / 1e10 : n);

/** COUNTIF-style criteria: ">5", "<=3", "<>x", "=abc", "ab*" (wildcards * ?), or a plain value. */
export function criterion(c) {
  if (typeof c === 'number' || typeof c === 'boolean') return (v) => (typeof c === 'number' ? v === c : v === c);
  const s = toStr(c); const m = /^(<=|>=|<>|<|>|=)?(.*)$/s.exec(s); const op = m[1] ?? '='; const rhs = m[2];
  const lit = parseLiteral(rhs).v; const isNum = typeof lit === 'number';
  const wild = /[*?]/.test(rhs) && !isNum ? new RegExp(`^${rhs.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i') : null;
  return (v) => {
    if (op === '=' || op === '<>') { const eq = wild ? typeof v === 'string' && wild.test(v) : isNum ? v === lit : rhs === '' ? v === null || v === '' : typeof v === 'string' && v.toLowerCase() === rhs.toLowerCase(); return op === '=' ? eq : !eq; }
    if (isNum ? typeof v !== 'number' : typeof v !== 'string') return false;
    const c2 = isNum ? (v < lit ? -1 : v > lit ? 1 : 0) : compareValues(v, rhs);
    return op === '<' ? c2 < 0 : op === '>' ? c2 > 0 : op === '<=' ? c2 <= 0 : c2 >= 0;
  };
}

// ---------------------------------------------------------------- functions
// name -> [min args, max args, signature, description]
export const FUNCTION_DOCS = {
  SUM: ['SUM(number1, …)', 'Adds numbers and ranges'], AVERAGE: ['AVERAGE(number1, …)', 'Mean of the numbers'], MIN: ['MIN(number1, …)', 'Smallest number'], MAX: ['MAX(number1, …)', 'Largest number'],
  COUNT: ['COUNT(value1, …)', 'How many numbers'], COUNTA: ['COUNTA(value1, …)', 'How many non-empty cells'], COUNTBLANK: ['COUNTBLANK(range)', 'How many empty cells'], MEDIAN: ['MEDIAN(number1, …)', 'Middle number'],
  COUNTIF: ['COUNTIF(range, criterion)', 'Counts cells that match'], SUMIF: ['SUMIF(range, criterion, [sum_range])', 'Adds cells that match'], AVERAGEIF: ['AVERAGEIF(range, criterion, [average_range])', 'Mean of cells that match'],
  IF: ['IF(test, if_true, [if_false])', 'Chooses between two results'], IFERROR: ['IFERROR(value, if_error)', 'Replaces an error'], AND: ['AND(test1, …)', 'All true'], OR: ['OR(test1, …)', 'Any true'], NOT: ['NOT(test)', 'Reverses true/false'],
  ROUND: ['ROUND(number, [digits])', 'Rounds to digits'], ROUNDUP: ['ROUNDUP(number, [digits])', 'Rounds away from zero'], ROUNDDOWN: ['ROUNDDOWN(number, [digits])', 'Rounds toward zero'], ABS: ['ABS(number)', 'Absolute value'], INT: ['INT(number)', 'Rounds down to a whole number'],
  MOD: ['MOD(number, divisor)', 'Remainder'], POWER: ['POWER(number, power)', 'Raises to a power'], SQRT: ['SQRT(number)', 'Square root'],
  CONCAT: ['CONCAT(text1, …)', 'Joins text'], CONCATENATE: ['CONCATENATE(text1, …)', 'Joins text'], TEXT: ['TEXT(value, format)', 'Formats a number as text, e.g. "0.00" or "yyyy-mm-dd"'], LEN: ['LEN(text)', 'Number of characters'],
  LEFT: ['LEFT(text, [count])', 'First characters'], RIGHT: ['RIGHT(text, [count])', 'Last characters'], MID: ['MID(text, start, count)', 'Characters from the middle'], UPPER: ['UPPER(text)', 'Capital letters'], LOWER: ['LOWER(text)', 'Small letters'],
  PROPER: ['PROPER(text)', 'Capitalises each word'], TRIM: ['TRIM(text)', 'Removes extra spaces'], SUBSTITUTE: ['SUBSTITUTE(text, old, new)', 'Replaces text'], FIND: ['FIND(find, within, [start])', 'Position of text (case sensitive)'], VALUE: ['VALUE(text)', 'Text to number'],
  TODAY: ['TODAY()', 'Today’s date'], NOW: ['NOW()', 'Date and time now'], DATE: ['DATE(year, month, day)', 'Builds a date'], YEAR: ['YEAR(date)', 'Year of a date'], MONTH: ['MONTH(date)', 'Month of a date'], DAY: ['DAY(date)', 'Day of a date'],
  VLOOKUP: ['VLOOKUP(key, range, column, [approximate])', 'Looks down the first column'], HLOOKUP: ['HLOOKUP(key, range, row, [approximate])', 'Looks across the first row'], INDEX: ['INDEX(range, row, [column])', 'Value at a position'],
  MATCH: ['MATCH(key, range, [type])', 'Position of a value'], XLOOKUP: ['XLOOKUP(key, lookup_range, return_range, [if_not_found])', 'Finds and returns a match'],
  ISBLANK: ['ISBLANK(value)', 'Is the cell empty'], ISNUMBER: ['ISNUMBER(value)', 'Is it a number'], ISTEXT: ['ISTEXT(value)', 'Is it text'], ISERROR: ['ISERROR(value)', 'Is it an error'],
};
export const FUNCTION_NAMES = Object.keys(FUNCTION_DOCS);

function createRuntime(host) {
  // host: { cell(si, c, r), sheetIndex(name) -> idx|-1, current: si }
  const isRange = (x) => x && x.rng === true;
  const vals = (g) => { if (g.c2 < g.c1 || g.r2 < g.r1) return []; const rows = []; for (let r = g.r1; r <= g.r2; r++) { const row = []; for (let c = g.c1; c <= g.c2; c++) row.push(host.cell(g.si, c, r)); rows.push(row); } return rows; };
  const flat = (x) => (isRange(x) ? vals(x).flat() : [x]);
  const scalar = (x) => { if (isRange(x)) { if (x.r1 === x.r2 && x.c1 === x.c2) return host.cell(x.si, x.c1, x.r1); return fail(E.VALUE); } return x; };
  const numbers = (args) => { const out = []; for (const a of args) { if (isRange(a)) { for (const v of flat(a)) { if (v instanceof CalcError) throw v; if (typeof v === 'number') out.push(v); } } else { if (a instanceof CalcError) throw a; if (a === null) continue; out.push(toNum(a)); } } return out; };
  const decimals = (d) => Math.trunc(d ?? 0);
  const rnd = (x, d, mode) => { const f = 10 ** decimals(d); const y = x * f; const z = mode === 'up' ? Math.sign(y) * Math.ceil(Math.abs(y) - 1e-9) : mode === 'down' ? Math.sign(y) * Math.floor(Math.abs(y) + 1e-9) : Math.sign(y) * Math.round(Math.abs(y) + 1e-9); return z / f; };
  const mustRange = (x) => (isRange(x) ? x : fail(E.VALUE));
  const approx = (key, list, desc) => { let best = -1; for (let i = 0; i < list.length; i++) { const c = compareValues(list[i], key); if (rank(list[i]) !== rank(key)) continue; if (desc ? c >= 0 : c <= 0) best = i; else break; } return best; };
  const exact = (key, list) => list.findIndex((v) => rank(v) === rank(key) && compareValues(v, key) === 0 && !(v === null));
  const F = {
    SUM: (a) => numbers(a).reduce((x, y) => x + y, 0),
    AVERAGE: (a) => { const n = numbers(a); if (!n.length) fail(E.DIV0); return n.reduce((x, y) => x + y, 0) / n.length; },
    MIN: (a) => { const n = numbers(a); return n.length ? Math.min(...n) : 0; }, MAX: (a) => { const n = numbers(a); return n.length ? Math.max(...n) : 0; },
    MEDIAN: (a) => { const n = numbers(a).sort((x, y) => x - y); if (!n.length) fail(E.NUM); const m = n.length >> 1; return n.length % 2 ? n[m] : (n[m - 1] + n[m]) / 2; },
    COUNT: (a) => { let k = 0; for (const x of a) for (const v of flat(x)) if (typeof v === 'number' || (!isRange(x) && v !== null && typeof parseLiteral(String(v)).v === 'number')) k++; return k; },
    COUNTA: (a) => { let k = 0; for (const x of a) for (const v of flat(x)) if (v !== null && v !== '') k++; return k; },
    COUNTBLANK: (a) => { let k = 0; for (const x of a) for (const v of flat(x)) if (v === null || v === '') k++; return k; },
    COUNTIF: (a) => { const g = mustRange(a[0]); const t = criterion(scalar(a[1])); return flat(g).filter((v) => t(v)).length; },
    SUMIF: (a) => { const g = mustRange(a[0]); const t = criterion(scalar(a[1])); const s = a[2] ? mustRange(a[2]) : g; const L = flat(g), S = vals({ ...s, c2: s.c1 + (g.c2 - g.c1), r2: s.r1 + (g.r2 - g.r1) }).flat(); let sum = 0; L.forEach((v, i) => { if (t(v) && typeof S[i] === 'number') sum += S[i]; }); return sum; },
    AVERAGEIF: (a) => { const g = mustRange(a[0]); const t = criterion(scalar(a[1])); const s = a[2] ? mustRange(a[2]) : g; const L = flat(g), S = vals({ ...s, c2: s.c1 + (g.c2 - g.c1), r2: s.r1 + (g.r2 - g.r1) }).flat(); let sum = 0, k = 0; L.forEach((v, i) => { if (t(v) && typeof S[i] === 'number') { sum += S[i]; k++; } }); if (!k) fail(E.DIV0); return sum / k; },
    AND: (a) => { let any = false; for (const x of a) for (const v of flat(x)) { if (isRange(x) && (v === null || typeof v === 'string')) continue; any = true; if (!toBool(v)) return false; } if (!any) fail(E.VALUE); return true; },
    OR: (a) => { let any = false, res = false; for (const x of a) for (const v of flat(x)) { if (isRange(x) && (v === null || typeof v === 'string')) continue; any = true; if (toBool(v)) res = true; } if (!any) fail(E.VALUE); return res; },
    NOT: (a) => !toBool(scalar(a[0])),
    ROUND: (a) => rnd(toNum(scalar(a[0])), a[1] === undefined ? 0 : toNum(scalar(a[1])), 'r'), ROUNDUP: (a) => rnd(toNum(scalar(a[0])), a[1] === undefined ? 0 : toNum(scalar(a[1])), 'up'), ROUNDDOWN: (a) => rnd(toNum(scalar(a[0])), a[1] === undefined ? 0 : toNum(scalar(a[1])), 'down'),
    ABS: (a) => Math.abs(toNum(scalar(a[0]))), INT: (a) => Math.floor(toNum(scalar(a[0]))),
    MOD: (a) => { const n = toNum(scalar(a[0])), d = toNum(scalar(a[1])); if (d === 0) fail(E.DIV0); return n - d * Math.floor(n / d); },
    POWER: (a) => toNum(scalar(a[0])) ** toNum(scalar(a[1])), SQRT: (a) => { const n = toNum(scalar(a[0])); if (n < 0) fail(E.NUM); return Math.sqrt(n); },
    CONCAT: (a) => a.map((x) => flat(x).map(toStr).join('')).join(''), CONCATENATE: (a) => a.map((x) => toStr(scalar(x))).join(''),
    TEXT: (a) => textFormat(scalar(a[0]) === null ? 0 : typeof scalar(a[0]) === 'string' && typeof parseLiteral(scalar(a[0])).v === 'number' ? parseLiteral(scalar(a[0])).v : scalar(a[0]), toStr(scalar(a[1]))),
    LEN: (a) => toStr(scalar(a[0])).length,
    LEFT: (a) => toStr(scalar(a[0])).slice(0, Math.max(0, a[1] === undefined ? 1 : toNum(scalar(a[1])))), RIGHT: (a) => { const s = toStr(scalar(a[0])); const n = Math.max(0, a[1] === undefined ? 1 : toNum(scalar(a[1]))); return n === 0 ? '' : s.slice(-n); },
    MID: (a) => { const s = toStr(scalar(a[0])); const st = toNum(scalar(a[1])); const n = toNum(scalar(a[2])); if (st < 1 || n < 0) fail(E.VALUE); return s.slice(st - 1, st - 1 + n); },
    UPPER: (a) => toStr(scalar(a[0])).toUpperCase(), LOWER: (a) => toStr(scalar(a[0])).toLowerCase(), PROPER: (a) => toStr(scalar(a[0])).toLowerCase().replace(/(^|[^A-Za-z])([a-z])/g, (_m, p, c) => p + c.toUpperCase()), TRIM: (a) => toStr(scalar(a[0])).trim().replace(/\s+/g, ' '),
    SUBSTITUTE: (a) => { const s = toStr(scalar(a[0])), o = toStr(scalar(a[1])); return o === '' ? s : s.split(o).join(toStr(scalar(a[2]))); },
    FIND: (a) => { const i = toStr(scalar(a[1])).indexOf(toStr(scalar(a[0])), a[2] === undefined ? 0 : toNum(scalar(a[2])) - 1); if (i < 0) fail(E.VALUE); return i + 1; },
    VALUE: (a) => { const v = scalar(a[0]); if (typeof v === 'number') return v; const p = parseLiteral(toStr(v)).v; return typeof p === 'number' ? p : fail(E.VALUE); },
    TODAY: () => Math.floor(toSerial(Date.now())), NOW: () => toSerial(Date.now()),
    DATE: (a) => { const y = Math.trunc(toNum(scalar(a[0]))), m = Math.trunc(toNum(scalar(a[1]))), d = Math.trunc(toNum(scalar(a[2]))); return dateSerial(y < 1900 ? y + 1900 : y, m, d); },
    YEAR: (a) => fromSerial(toNum(scalar(a[0]))).getUTCFullYear(), MONTH: (a) => fromSerial(toNum(scalar(a[0]))).getUTCMonth() + 1, DAY: (a) => fromSerial(toNum(scalar(a[0]))).getUTCDate(),
    VLOOKUP: (a) => { const g = mustRange(a[1]); const key = scalar(a[0]); const col = Math.trunc(toNum(scalar(a[2]))); if (col < 1 || col > g.c2 - g.c1 + 1) fail(E.REF); const rows = vals(g); const first = rows.map((r) => r[0]); const exactOnly = a[3] !== undefined && !toBool(scalar(a[3])); const i = exactOnly ? exact(key, first) : approx(key, first); if (i < 0) fail(E.NA); const out = rows[i][col - 1]; return out; },
    HLOOKUP: (a) => { const g = mustRange(a[1]); const key = scalar(a[0]); const row = Math.trunc(toNum(scalar(a[2]))); if (row < 1 || row > g.r2 - g.r1 + 1) fail(E.REF); const rows = vals(g); const first = rows[0]; const exactOnly = a[3] !== undefined && !toBool(scalar(a[3])); const i = exactOnly ? exact(key, first) : approx(key, first); if (i < 0) fail(E.NA); return rows[row - 1][i]; },
    INDEX: (a) => { const g = mustRange(a[0]); const rows = vals(g); let r = Math.trunc(toNum(scalar(a[1]))); let c = a[2] === undefined || a[2].t === 'empty' ? 1 : Math.trunc(toNum(scalar(a[2]))); if (rows.length === 1 && a[2] === undefined) { c = r; r = 1; } if (r < 1 || c < 1 || r > rows.length || c > rows[0].length) fail(E.REF); return rows[r - 1][c - 1]; },
    MATCH: (a) => { const g = mustRange(a[1]); const key = scalar(a[0]); const type = a[2] === undefined ? 1 : toNum(scalar(a[2])); const list = flat(g); const i = type === 0 ? (typeof key === 'string' && /[*?]/.test(key) ? list.findIndex((v) => criterion(key)(v)) : exact(key, list)) : approx(key, list, type < 0); if (i < 0) fail(E.NA); return i + 1; },
    XLOOKUP: (a) => { const L = flat(mustRange(a[1])); const R = mustRange(a[2]); const key = scalar(a[0]); const i = exact(key, L); if (i < 0) { if (a[3] !== undefined && a[3].t !== 'empty') return scalar(a[3]); fail(E.NA); } const w = R.c2 - R.c1 + 1; const h = R.r2 - R.r1 + 1; if (R.r1 === R.r2) return host.cell(R.si, R.c1 + i, R.r1); if (R.c1 === R.c2) return host.cell(R.si, R.c1, R.r1 + i); return i < w * h ? host.cell(R.si, R.c1 + (i % w), R.r1 + Math.floor(i / w)) : fail(E.REF); },
    ISBLANK: (a) => scalar(a[0]) === null, ISNUMBER: (a) => typeof scalar(a[0]) === 'number', ISTEXT: (a) => typeof scalar(a[0]) === 'string',
  };
  return { F, isRange, scalar };
}
const ARITY = { TODAY: [0, 0], NOW: [0, 0], NOT: [1, 1], ABS: [1, 1], INT: [1, 1], SQRT: [1, 1], LEN: [1, 1], UPPER: [1, 1], LOWER: [1, 1], PROPER: [1, 1], TRIM: [1, 1], YEAR: [1, 1], MONTH: [1, 1], DAY: [1, 1], VALUE: [1, 1], ISBLANK: [1, 1], ISNUMBER: [1, 1], ISTEXT: [1, 1], ISERROR: [1, 1],
  ROUND: [1, 2], ROUNDUP: [1, 2], ROUNDDOWN: [1, 2], MOD: [2, 2], POWER: [2, 2], TEXT: [2, 2], LEFT: [1, 2], RIGHT: [1, 2], MID: [3, 3], DATE: [3, 3], IF: [2, 3], IFERROR: [2, 2], COUNTIF: [2, 2], SUMIF: [2, 3], AVERAGEIF: [2, 3], VLOOKUP: [3, 4], HLOOKUP: [3, 4], INDEX: [2, 3], MATCH: [2, 3], XLOOKUP: [3, 4], SUBSTITUTE: [3, 3], FIND: [2, 3] };

/**
 * Evaluation engine for a whole book: createCalc(book) -> { get(si, key|c, r), value(si, c, r), invalidate(si, c, r), reset() }.
 * Cells are computed on demand and cached; a cell's formula records what it read so a later edit clears only what depends on it.
 */
export function createCalc(book) {
  const memo = new Map(); const dependents = new Map(); const rangeDeps = new Map(); const visiting = new Set();
  let current = -1; let names = null;
  const id = (si, c, r) => ((si * 1024 + r) * 64 + c);
  const idSheet = (x) => Math.floor(x / 65536), idRow = (x) => Math.floor((x % 65536) / 64), idCol = (x) => x % 64;
  const sheetIndex = (name) => { if (!names) { names = new Map(); book.sheets.forEach((s, i) => names.set(s.name.toLowerCase(), i)); } return names.has(String(name).toLowerCase()) ? names.get(String(name).toLowerCase()) : -1; };
  const addDep = (x) => { if (current >= 0) { let s = dependents.get(x); if (!s) dependents.set(x, s = new Set()); s.add(current); } };
  const rt = createRuntime({ cell: (si, c, r) => read(si, c, r, true) });   // cells read through a range are covered by the range subscription
  function read(si, c, r, viaRange = false) {
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS || si < 0) fail(E.REF);
    const x = id(si, c, r); if (!viaRange) addDep(x);
    if (memo.has(x)) return memo.get(x);
    if (visiting.has(x)) fail(E.CIRC);
    const raw = book.sheets[si]?.cells[ref(c, r)];
    let val;
    if (raw === undefined || raw === '') val = null;
    else if (raw[0] === '=' && raw.length > 1) {
      const prev = current; current = x; visiting.add(x);
      try { val = evalNode(parseFormula(raw.slice(1)), si); if (rt.isRange(val)) val = rt.scalar(val); if (typeof val === 'number') val = Number.isFinite(val) ? round10(val) : fail(E.NUM); }
      catch (e) { val = e instanceof CalcError ? e : (e instanceof RangeError ? E.ERR : E.ERR); }
      finally { visiting.delete(x); current = prev; }
    } else val = parseLiteral(raw).v;
    memo.set(x, val); return val;
  }
  function range(node, si) {
    const target = node.sheet === null ? si : sheetIndex(node.sheet); if (target < 0) fail(E.REF);
    const g = { rng: true, si: target, c1: Math.min(node.a.c, node.b?.c ?? node.a.c), c2: Math.max(node.a.c, node.b?.c ?? node.a.c), r1: Math.min(node.a.r, node.b?.r ?? node.a.r), r2: Math.max(node.a.r, node.b?.r ?? node.a.r) };
    if (g.c2 >= COLS || g.r2 >= ROWS) fail(E.REF);
    if (node.b || node.col) { if (current >= 0) { let l = rangeDeps.get(current); if (!l) rangeDeps.set(current, l = []); l.push(g); } }
    return g;
  }
  function evalNode(n, si) {
    switch (n.t) {
      case 'num': case 'str': case 'bool': return n.v;
      case 'empty': return null;
      case 'name': return fail(E.NAME);
      case 'ref': {
        if (n.b || n.col) return range(n, si);
        const target = n.sheet === null ? si : sheetIndex(n.sheet); if (target < 0) fail(E.REF);
        return read(target, n.a.c, n.a.r);
      }
      case 'un': { const v = toNum(rt.scalar(evalNode(n.a, si))); return n.op === '-' ? -v : v; }
      case 'pct': return toNum(rt.scalar(evalNode(n.a, si))) / 100;
      case 'bin': {
        const a = rt.scalar(evalNode(n.a, si)), b = rt.scalar(evalNode(n.b, si));
        if (a instanceof CalcError) throw a; if (b instanceof CalcError) throw b;
        switch (n.op) {
          case '+': return toNum(a) + toNum(b); case '-': return toNum(a) - toNum(b); case '*': return toNum(a) * toNum(b);
          case '/': { const d = toNum(b); if (d === 0) fail(E.DIV0); return toNum(a) / d; }
          case '^': { const r = toNum(a) ** toNum(b); return Number.isNaN(r) ? fail(E.NUM) : r; }
          case '&': return toStr(a) + toStr(b);
          default: { const c = compareValues(a, b); return n.op === '=' ? c === 0 : n.op === '<>' ? c !== 0 : n.op === '<' ? c < 0 : n.op === '>' ? c > 0 : n.op === '<=' ? c <= 0 : c >= 0; }
        }
      }
      case 'fn': return callFn(n, si);
      default: return fail(E.ERR);
    }
  }
  function callFn(n, si) {
    const name = n.name; const doc = FUNCTION_DOCS[name];
    if (name === 'IF') { checkArity(name, n.args.length); const t = toBool(rt.scalar(evalNode(n.args[0], si))); if (t) return evalNode(n.args[1], si); return n.args[2] ? evalNode(n.args[2], si) : false; }
    if (name === 'IFERROR') { checkArity(name, n.args.length); try { const v = rt.scalar(evalNode(n.args[0], si)); if (v instanceof CalcError) return evalNode(n.args[1], si); return v; } catch (e) { if (e instanceof CalcError && e !== E.CIRC) return evalNode(n.args[1], si); throw e; } }
    if (name === 'ISERROR') { try { return rt.scalar(evalNode(n.args[0], si)) instanceof CalcError; } catch (e) { if (e instanceof CalcError) return true; throw e; } }
    if (!doc) fail(E.NAME);
    checkArity(name, n.args.length);
    const args = n.args.map((x) => { const v = evalNode(x, si); if (v instanceof CalcError) throw v; return v; });
    const out = rt.F[name](args);
    return out === undefined ? null : out;
  }
  function checkArity(name, n) { const a = ARITY[name]; if (a && (n < a[0] || n > a[1])) fail(E.VALUE); if (!a && n < 1 && name !== 'TODAY' && name !== 'NOW') fail(E.VALUE); }
  function invalidate(si, c, r) {
    const stack = [id(si, c, r)]; const seen = new Set();
    while (stack.length) {
      const x = stack.pop(); if (seen.has(x)) continue; seen.add(x); memo.delete(x); rangeDeps.delete(x);
      const d = dependents.get(x); if (d) for (const y of d) if (!seen.has(y)) stack.push(y);
      const xs = idSheet(x), xr = idRow(x), xc = idCol(x);
      for (const [owner, list] of rangeDeps) { if (seen.has(owner)) continue; for (const g of list) if (g.si === xs && xc >= g.c1 && xc <= g.c2 && xr >= g.r1 && xr <= g.r2) { stack.push(owner); break; } }
    }
  }
  return {
    value: (si, c, r) => { try { return read(si, c, r); } catch (e) { return e instanceof CalcError ? e : E.ERR; } },
    get(si, key) { const p = parseRef(key); return p ? this.value(si, p.col, p.row) : null; },
    invalidate, reset() { memo.clear(); dependents.clear(); rangeDeps.clear(); visiting.clear(); names = null; },
  };
}
