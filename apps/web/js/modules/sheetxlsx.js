// What an .xlsx file says about LOOKS and RULES, read straight from its XML parts (SheetJS Community Edition reads values and formulas only):
// cell styles (font, size, bold/italic/underline/strike, colours, fill, borders, alignment, wrap), column widths, row heights, hidden
// columns/rows, frozen panes, the filter range, tab colours, data validation (dropdown lists — fixed or read from a range — and whole-number,
// decimal and date rules) and conditional formats (value rules, formula rules, colour scales). Pure functions, no DOM: tested in Node.
//   readXlsxLooks(files) -> Map(sheetName -> { sty: { A1: style }, cw: { col: px }, rh: { row: px }, hc: [], hr: [], freeze, filter, tab, dv: [], cf: [] })
//   files: { 'xl/workbook.xml': text, 'xl/_rels/workbook.xml.rels': text, 'xl/styles.xml': text, 'xl/theme/theme1.xml': text, 'xl/worksheets/sheet1.xml': text, … }
import { parseRange, colIndex } from './sheetformula.js';

const attrs = (tag) => { const o = {}; for (const m of tag.matchAll(/([\w:]+)="([^"]*)"/g)) o[m[1]] = unxml(m[2]); return o; };
const unxml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const blocks = (xml, tag) => [...String(xml ?? '').matchAll(new RegExp(`<${tag}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${tag}>)`, 'g'))].map((m) => ({ a: attrs(m[1]), inner: m[2] ?? '' }));
const one = (xml, tag) => blocks(xml, tag)[0] ?? null;
const section = (xml, tag) => { const m = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`).exec(String(xml ?? '')); return m ? m[1] : ''; };
const on = (b) => b && b.a.val !== '0' && b.a.val !== 'false';

// Excel's theme colour order (index 0 = light 1, 1 = dark 1, 2 = light 2, 3 = dark 2, then accents) and the built-in fallbacks
const THEME_DEFAULT = ['FFFFFF', '000000', 'E7E6E6', '44546A', '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47', '0563C1', '954F72'];
function themeColours(xml) {
  const sch = section(xml, 'a:clrScheme'); if (!sch) return THEME_DEFAULT;
  const val = (n) => { const m = new RegExp(`<a:${n}>[\\s\\S]*?(?:srgbClr val="([0-9A-Fa-f]{6})"|sysClr[^>]*lastClr="([0-9A-Fa-f]{6})")`).exec(sch); return m ? (m[1] ?? m[2]) : null; };
  const order = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];
  return order.map((n, i) => val(n) ?? THEME_DEFAULT[i]);
}
const INDEXED = ['000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF', '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF',
  '800000', '008000', '000080', '808000', '800080', '008080', 'C0C0C0', '808080', '9999FF', '993366', 'FFFFCC', 'CCFFFF', '660066', 'FF8080', '0066CC', 'CCCCFF'];
const tint = (hex, t) => { if (!t) return hex; const c = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)); return c.map((x) => Math.round(t < 0 ? x * (1 + t) : x + (255 - x) * t).toString(16).padStart(2, '0')).join('').toUpperCase(); };
function colour(b, theme) {
  if (!b) return null; const a = b.a;
  let hex = null;
  if (a.rgb && /^[0-9A-Fa-f]{6,8}$/.test(a.rgb)) hex = a.rgb.slice(-6);
  else if (a.theme !== undefined) hex = theme[Number(a.theme)] ?? null;
  else if (a.indexed !== undefined) hex = INDEXED[Number(a.indexed)] ?? null;
  if (!hex) return null; hex = tint(hex.toUpperCase(), Number(a.tint) || 0);
  return `#${hex.toLowerCase()}`;
}
// Excel font names -> the editor's font keys (FONTS in docmodel.js)
const FONT_MAP = [[/^(arial|helvetica|calibri|aptos|segoe ui|verdana|tahoma)/i, 'sans'], [/^(times|cambria|georgia|garamond|book antiqua)/i, 'serif'], [/^(courier|consolas|lucida console)/i, 'courier'],
  [/^inter$/i, 'inter'], [/^roboto$/i, 'roboto'], [/^open sans$/i, 'opensans'], [/^lato$/i, 'lato'], [/^montserrat$/i, 'montserrat'], [/^poppins$/i, 'poppins'], [/^geist$/i, 'geist']];
const fontKey = (name) => { for (const [re, k] of FONT_MAP) if (re.test(name ?? '')) return k; return null; };

/** The number formats an import can carry, as the editor's { k, d, sym } (same rules as the old importer's nfFromExcel). */
export function numberFormat(code) {
  if (!code || code === 'General' || code === '@') return null;
  const c = code.replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"/g, '').replace(/\\./g, '');
  const dec = (/\.(0+)/.exec(c)?.[1] ?? '').length;
  if (/[yd]/i.test(c) && /[md]/i.test(c)) return { k: /h/i.test(c) ? 'datetime' : 'date' };
  if (/h+:mm|mm:ss/i.test(c)) return { k: 'time' };
  if (/%/.test(c)) return { k: 'pct', d: dec };
  const sym = /[$€£¥₨]|Rs/.exec(code)?.[0];
  if (sym) return { k: 'cur', d: dec, sym };
  if (/[0#]/.test(c)) return { k: 'num', d: dec, ...(/,/.test(c) ? {} : { th: false }) };
  return null;
}
const BUILTIN_NF = { 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 14: 'dd-mm-yyyy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss', 22: 'm/d/yy h:mm' };

function readStyles(xml, theme) {
  const nf = { ...BUILTIN_NF }; for (const b of blocks(section(xml, 'numFmts'), 'numFmt')) nf[b.a.numFmtId] = b.a.formatCode;
  const fonts = blocks(section(xml, 'fonts'), 'font').map((f) => {
    const o = {}; const i = f.inner;
    if (on(one(i, 'b'))) o.b = 1; if (on(one(i, 'i'))) o.i = 1; if (one(i, 'u') && one(i, 'u').a.val !== 'none') o.u = 1; if (on(one(i, 'strike'))) o.st = 1;
    const sz = Number(one(i, 'sz')?.a.val); if (sz && sz !== 11) o.fs = Math.max(8, Math.min(72, Math.round(sz * 4 / 3)));   // Excel points -> the grid's pixels (11 pt = the editor's normal text)
    const fc = colour(one(i, 'color'), theme); if (fc && fc !== '#000000') o.fc = fc;
    const ff = fontKey(one(i, 'name')?.a.val); if (ff) o.ff = ff;
    return o;
  });
  const fills = blocks(section(xml, 'fills'), 'fill').map((f) => { const p = one(f.inner, 'patternFill'); if (!p || p.a.patternType !== 'solid') return null; return colour(one(p.inner, 'fgColor'), theme); });
  const borders = blocks(section(xml, 'borders'), 'border').map((b) => { const o = {}; for (const [tag, k] of [['top', 't'], ['right', 'r'], ['bottom', 'b'], ['left', 'l']]) { const e = one(b.inner, tag); if (e?.a.style && e.a.style !== 'none') o[k] = 1; } return Object.keys(o).length ? o : null; });
  const xfs = blocks(section(xml, 'cellXfs'), 'xf').map((x) => {
    const st = { ...(fonts[Number(x.a.fontId)] ?? {}) };
    const bg = fills[Number(x.a.fillId)]; if (bg) st.bg = bg;
    const bd = borders[Number(x.a.borderId)]; if (bd) st.bd = bd;
    const al = one(x.inner, 'alignment')?.a ?? {};
    if (['left', 'center', 'right'].includes(al.horizontal)) st.ha = al.horizontal[0]; if (al.horizontal === 'centerContinuous') st.ha = 'c';
    if (al.vertical === 'top') st.va = 't'; else if (al.vertical === 'center') st.va = 'm'; else if (al.vertical === 'bottom') st.va = 'b';
    if (al.wrapText === '1' || al.wrapText === 'true') st.wr = 1;
    const n = numberFormat(nf[x.a.numFmtId]); if (n) st.nf = n;
    return st;
  });
  const dxfs = blocks(section(xml, 'dxfs'), 'dxf').map((d) => {
    const o = {}; const f = one(d.inner, 'font'); if (f) { const fc = colour(one(f.inner, 'color'), theme); if (fc) o.fc = fc; if (on(one(f.inner, 'b'))) o.bold = true; }
    const p = one(d.inner, 'patternFill'); if (p) { const fg = colour(one(p.inner, 'fgColor'), theme), bgc = colour(one(p.inner, 'bgColor'), theme); const bg = p.a.patternType === 'solid' && fg ? fg : bgc ?? fg; if (bg) o.bg = bg; }
    return o;
  });
  return { xfs, dxfs };
}

const OP = { greaterThan: 'gt', lessThan: 'lt', greaterThanOrEqual: 'ge', lessThanOrEqual: 'le', equal: 'eq', notEqual: 'ne', between: 'between' };
const rangesOf = (sqref) => String(sqref ?? '').split(/\s+/).map((x) => parseRange(x)).filter(Boolean).map((g) => ({ ...g }));
const label = (g) => `${colName(g.c1)}${g.r1 + 1}:${colName(g.c2)}${g.r2 + 1}`;
const colName = (i) => { let s = ''; let n = i + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const literal = (f) => { const t = String(f ?? '').trim(); if (/^".*"$/.test(t)) return t.slice(1, -1).replace(/""/g, '"'); return t; };

function readSheet(xml, styles, theme, maxRows, maxCols) {
  const out = { sty: {}, cw: {}, rh: {}, hc: [], hr: [], freeze: { r: 0, c: 0 }, filter: null, tab: null, dv: [], cf: [] };
  const tab = one(one(xml, 'sheetPr')?.inner ?? '', 'tabColor'); const tc = colour(tab, theme); if (tc) out.tab = tc;
  for (const c of blocks(section(xml, 'cols'), 'col')) {
    const a = c.a; for (let i = Number(a.min) - 1; i <= Math.min(Number(a.max) - 1, maxCols - 1); i++) {
      if (a.hidden === '1' || a.hidden === 'true') out.hc.push(i);
      else if (a.width && a.customWidth !== '0') out.cw[i] = Math.round(Number(a.width) * 7 + 5);
    }
  }
  for (const r of String(xml).matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const a = attrs(r[1]); const ri = Number(a.r) - 1; if (!(ri >= 0) || ri >= maxRows) continue;
    if (a.hidden === '1' || a.hidden === 'true') out.hr.push(ri); else if (a.ht && (a.customHeight === '1' || a.customHeight === 'true')) out.rh[ri] = Math.round(Number(a.ht) * 4 / 3);
    for (const c of (r[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>)/g)) {
      const ca = attrs(c[1]); if (ca.s === undefined || ca.s === '0') continue;
      const m = /^([A-Z]{1,3})(\d+)$/.exec(ca.r ?? ''); if (!m) continue; if (colIndex(m[1]) >= maxCols) continue;
      const st = styles.xfs[Number(ca.s)]; if (st && Object.keys(st).length) out.sty[ca.r] = st;
    }
  }
  const pane = one(section(xml, 'sheetViews') || xml, 'pane');
  if (pane && (pane.a.state === 'frozen' || pane.a.state === 'frozenSplit')) out.freeze = { r: Math.min(30, Number(pane.a.ySplit) || 0), c: Math.min(10, Number(pane.a.xSplit) || 0) };
  const af = one(xml, 'autoFilter'); const fg = af ? parseRange(af.a.ref) : null; if (fg) out.filter = { c1: fg.c1, c2: fg.c2, r1: fg.r1, r2: Math.min(fg.r2, maxRows - 1), hide: {} };
  for (const v of blocks(section(xml, 'dataValidations'), 'dataValidation')) {
    const msg = v.a.error ?? ''; const f1 = unxml(one(v.inner, 'formula1')?.inner ?? ''), f2 = unxml(one(v.inner, 'formula2')?.inner ?? '');
    for (const g of rangesOf(v.a.sqref)) {
      if (v.a.type === 'list') {
        const t = f1.trim();
        if (/^".*"$/.test(t)) out.dv.push({ range: label(g), list: literal(t).split(',').map((x) => x.trim()).filter(Boolean), msg });
        else if (t) out.dv.push({ range: label(g), src: t.replace(/^=/, ''), msg });
      } else if (['whole', 'decimal', 'date'].includes(v.a.type) && Number.isFinite(Number(f1))) {
        out.dv.push({ range: label(g), kind: v.a.type, op: OP[v.a.operator ?? 'between'] ?? 'between', a: Number(f1), ...(Number.isFinite(Number(f2)) && (v.a.operator ?? 'between') === 'between' ? { b: Number(f2) } : {}), msg });
      }
    }
  }
  for (const c of blocks(xml, 'conditionalFormatting')) {
    const gs = rangesOf(c.a.sqref);
    for (const rule of blocks(c.inner, 'cfRule')) {
      const fs = blocks(rule.inner, 'formula').map((x) => unxml(x.inner));
      const look = styles.dxfs[Number(rule.a.dxfId)] ?? {};
      for (const g of gs) {
        if (rule.a.type === 'colorScale') {
          const vos = blocks(rule.inner, 'cfvo').map((x) => x.a); const cols = blocks(rule.inner, 'color').map((x) => colour(x, theme));
          const pts = vos.map((x, i) => ({ v: x.type === 'num' || x.type === 'percent' || x.type === 'percentile' ? Number(x.val) : x.type === 'min' ? -Infinity : x.type === 'max' ? Infinity : NaN, c: cols[i] }));
          if (pts.every((p) => p.c && !Number.isNaN(p.v))) out.cf.push({ range: label(g), type: 'scale', pts });
        } else if (rule.a.type === 'cellIs' && OP[rule.a.operator] && (look.fc || look.bg || look.bold)) {
          out.cf.push({ range: label(g), type: OP[rule.a.operator], a: literal(fs[0]), b: literal(fs[1] ?? ''), ...look });
        } else if (rule.a.type === 'expression' && fs[0] && (look.fc || look.bg || look.bold)) {
          out.cf.push({ range: label(g), type: 'formula', a: fs[0], ...look });
        } else if (rule.a.type === 'containsText' && rule.a.text && (look.fc || look.bg || look.bold)) {
          out.cf.push({ range: label(g), type: 'contains', a: rule.a.text, ...look });
        }
      }
    }
  }
  return out;
}

export function readXlsxLooks(files, { maxRows = 1000, maxCols = 52 } = {}) {
  const get = (p) => files[p] ?? files[`/${p}`] ?? '';
  const theme = themeColours(get('xl/theme/theme1.xml'));
  const styles = readStyles(get('xl/styles.xml'), theme);
  const rels = {}; for (const r of blocks(get('xl/_rels/workbook.xml.rels'), 'Relationship')) rels[r.a.Id] = r.a.Target;
  const out = new Map();
  for (const s of blocks(section(get('xl/workbook.xml'), 'sheets'), 'sheet')) {
    const target = rels[s.a['r:id']]; if (!target) continue;
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    const xml = get(path); if (!xml) continue;
    out.set(s.a.name, readSheet(xml, styles, theme, maxRows, maxCols));
  }
  return out;
}
