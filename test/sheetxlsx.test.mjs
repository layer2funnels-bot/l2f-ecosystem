// Excel looks and rules on import (OR-36/OR-37): the owner's Aurj Dream 100 Tracker keeps its fonts, colours, borders, widths, frozen panes,
// filters, dropdowns (lists read from the Lists sheet), number/date rules and conditional formats — and they work in the editor's model.
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { recorder } from './lib.mjs';
import { readXlsxLooks, numberFormat } from '../apps/web/js/modules/sheetxlsx.js';
import * as M from '../apps/web/js/modules/sheetmodel.js';
const { results, check } = recorder();

// a minimal .zip reader (central directory; stored or deflated entries) — enough for an .xlsx
function unzip(buf) {
  const out = {}; let e = buf.length - 22; while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  let p = buf.readUInt32LE(e + 16); const n = buf.readUInt16LE(e + 10);
  for (let i = 0; i < n; i++) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen); const lstart = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
    const data = buf.subarray(lstart, lstart + csize); out[name] = (method === 8 ? inflateRawSync(data) : data).toString('utf8');
    p += 46 + nlen + xlen + clen;
  }
  return out;
}
const files = unzip(readFileSync(new URL('./fixtures/Aurj_Dream100_Tracker.xlsx', import.meta.url)));
const looks = readXlsxLooks(files);
check('XL1', 'All seven sheets are read, in order', [...looks.keys()].join() === 'Instructions,Dashboard,Prospects,Interaction Log,Scoring Guide,Target Map,Lists');
const P = looks.get('Prospects'), I = looks.get('Interaction Log');
check('XL2', 'Header cells keep bold white Arial on navy, borders, centre alignment and wrap', JSON.stringify(P.sty.A1) === JSON.stringify({ b: 1, fs: 13, fc: '#ffffff', ff: 'sans', bg: '#1f3864', bd: { t: 1, r: 1, b: 1, l: 1 }, ha: 'c', va: 't', wr: 1 }), JSON.stringify(P.sty.A1));
check('XL3', 'Column widths come across (readable columns, not all 100 px)', P.cw[1] === 187 && P.cw[6] === 341 && Object.keys(P.cw).length >= 20);
check('XL4', 'Frozen panes (Prospects: header row + 2 columns; Interaction Log: header row) and filters', JSON.stringify(P.freeze) === '{"r":1,"c":2}' && JSON.stringify(I.freeze) === '{"r":1,"c":0}' && P.filter?.c2 === 23 && P.filter?.r2 === 150 && I.filter?.c2 === 7);
const lists = [...P.dv, ...I.dv].filter((d) => d.src); const nums = [...P.dv, ...I.dv].filter((d) => d.kind);
check('XL5', 'All 9 dropdowns are read with their source ranges (the Lists sheet; prospect names from Prospects), and number/date rules with their limits', lists.length === 9 && lists.every((d) => /^(Lists!\$[A-G]|Prospects!\$A)\$2:\$[A-G]\$\d+$/.test(d.src)) && lists.some((d) => d.src.startsWith('Prospects!')) && nums.some((d) => d.kind === 'whole' && d.op === 'ge' && d.a === 0) && nums.some((d) => d.kind === 'date' && d.op === 'gt' && d.a === 36526), JSON.stringify(nums));
check('XL6', 'Conditional formats: score bands, the priority colour scale, tier and follow-up formula rules', P.cf.some((c) => c.type === 'le' && c.a === '2' && c.bg) && P.cf.some((c) => c.type === 'scale' && c.pts.length === 3)
  && P.cf.some((c) => c.type === 'formula' && /LEFT\(\$W2,1\)="A"/.test(c.a) && c.bold) && P.cf.some((c) => c.type === 'formula' && /\$U2<TODAY\(\)/.test(c.a)));
check('XL7', 'Number formats map to the editor’s kinds', numberFormat('#,##0')?.k === 'num' && numberFormat('0%')?.k === 'pct' && numberFormat('dd\\-mmm\\-yyyy')?.k === 'date' && numberFormat('"Rs"#,##0.00')?.sym === 'Rs' && numberFormat('General') === null);

// applied to a book built from the workbook's values: rules work in the model, through the calculation engine
const fx = JSON.parse(readFileSync(new URL('./fixtures/dream100.cells.json', import.meta.url), 'utf8'));
const book = { v: 2, styles: [], n: 0, sheets: fx.sheets.map((s) => ({ ...M.emptySheet(s.name), cells: { ...s.cells } })) };
book.n = book.sheets.reduce((n, s) => n + Object.keys(s.cells).length, 0);
const calc = M.createCalc(book, { now: () => new Date(2026, 10, 5, 12).getTime() });
fx.sheets.forEach((s, i) => M.applyImportedLooks(book, i, looks.get(s.name), calc));
const pi = 2, ps = book.sheets[pi];
const statusRule = M.dvRule(ps, 17, 5);   // R6: relationship status
const statusList = M.dvValues(statusRule, calc, pi);
check('XL8', 'A dropdown cell offers the values from the Lists sheet (read through the engine)', Array.isArray(statusList) && statusList.includes('Collaborating') && statusList.includes('Not a Fit') && statusList.length >= 5, JSON.stringify(statusList));
const wRule = M.dvRule(ps, 9, 5);       // J6: whole number >= 0
check('XL9', 'A whole-number rule accepts 3 and refuses -1 and 2.5, with the workbook’s own message', M.dvAccepts(wRule, 3) && !M.dvAccepts(wRule, -1) && !M.dvAccepts(wRule, 2.5) && /whole number/.test(wRule.msg));
const v2 = calc.get(pi, 'V2'); const scale = M.cfStyle(ps, 21, 1, v2, String(v2), { calc, si: pi });
check('XL10', 'The priority score cell is coloured by the colour scale', typeof v2 === 'number' && /^#[0-9a-f]{6}$/.test(scale?.bg ?? ''), `${v2} ${JSON.stringify(scale)}`);
const tier = calc.get(pi, 'W2'); const tierLook = M.cfStyle(ps, 22, 1, tier, String(tier), { calc, si: pi });
check('XL11', 'The tier formula rule (shifted to the row) colours the tier cell', /^B/.test(String(tier)) && tierLook?.bg === '#ffeb9c', `${tier} ${JSON.stringify(tierLook)}`);
const stored = M.parseBook(M.serializeBook(book));
check('XL12', 'Everything survives save and reopen (styles, widths, frozen panes, filter, rules)', stored.sheets[pi].freeze.c === 2 && stored.sheets[pi].cw[6] === 341 && stored.sheets[pi].dv.length === ps.dv.length && stored.sheets[pi].cf.length === ps.cf.length
  && JSON.stringify(M.styleOf(stored, stored.sheets[pi], 'A1')) === JSON.stringify(M.styleOf(book, ps, 'A1')) && stored.sheets[pi].filter?.c2 === 23);
check('XL13', 'The stored workbook fits comfortably (≤ 40% of the save limit)', M.serializeBook(book).length < M.MAX_CHARS * 0.4, String(M.serializeBook(book).length));

for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}${x.ok ? '' : `  [${x.detail}]`}`);
const pc = results.filter((x) => x.ok).length; console.log(`\n${pc}/${results.length} checks passed`); process.exit(pc === results.length ? 0 : 1);
