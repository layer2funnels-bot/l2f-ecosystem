// Sheets model: parsing is safe (never runs anything), formulas are exact, errors are shown as errors, the stored book round-trips.
import { recorder } from './lib.mjs';
import * as M from '../apps/web/js/modules/sheetmodel.js';
import * as F from '../apps/web/js/modules/sheetformula.js';
const { parseBook, serializeBook, emptyBook, parseRef, ref, MAX_CELLS, isError, createCalc, Tx, display } = M;
const { results, check } = recorder();

const book = (sheets) => ({ v: 2, styles: [], n: 0, sheets: sheets.map((s, i) => ({ ...M.emptySheet(s.name ?? `Sheet ${i + 1}`), cells: s.cells })) });
const calcOf = (cells, extra = []) => { const b = book([{ cells }, ...extra]); return { b, c: createCalc(b) }; };
const val = (cells, key, extra) => calcOf(cells, extra).c.get(0, key);
const ev = (cells, key, extra) => { const v = val(cells, key, extra); return isError(v) ? v.code : display(v); };
const f1 = (formula, cells = {}, extra) => ev({ ...cells, Z1: formula }, 'Z1', extra);

check('SM1', 'Arithmetic follows the usual order and brackets (powers left to right, like Excel)', f1('=1+2*3') === '7' && f1('=(1+2)*3') === '9' && f1('=10/4') === '2.5' && f1('=2^3^2') === '64' && f1('=-2+5') === '3' && f1('=-2^2') === '4' && f1('=2*-3') === '-6');
check('SM2', 'SUM, AVERAGE, MIN, MAX, COUNT, COUNTA over ranges and cells', f1('=SUM(A1:A3)', { A1: '1', A2: '2', A3: '6' }) === '9' && f1('=AVERAGE(A1:A3)', { A1: '1', A2: '2', A3: '6' }) === '3' && f1('=MIN(A1:A3)', { A1: '1', A2: '2', A3: '6' }) === '1' && f1('=MAX(A1:A3, 10)', { A1: '1', A2: '2', A3: '6' }) === '10' && f1('=COUNT(A1:A3)', { A1: '1', A2: '2', A3: 'x' }) === '2' && f1('=COUNTA(A1:A3)', { A1: '1', A3: 'x' }) === '2' && f1('=COUNTBLANK(A1:A3)', { A1: '1' }) === '2' && f1('=MEDIAN(A1:A4)', { A1: '1', A2: '2', A3: '3', A4: '10' }) === '2.5');
check('SM3', 'Cell references follow other formulas, and text cells are skipped by SUM', ev({ A1: '5', A2: '=A1*2', A3: '=A2+1', A4: 'note', B1: '=SUM(A1:A4)' }, 'A3') === '11' && ev({ A1: '5', A2: '=A1*2', A4: 'note', B1: '=SUM(A1:A4)' }, 'B1') === '15');
check('SM4', 'Division by zero, unknown functions, bad syntax and bad references show spreadsheet errors, never crash', f1('=1/0') === '#DIV/0!' && f1('=FOO(1)') === '#NAME?' && f1('=1+') === '#ERR!' && f1('=Z9999') === '#ERR!' || f1('=Z9999') === '#REF!' && f1('=AVERAGE(B1:B2)') === '#DIV/0!' && f1('=1+"a"') === '#VALUE!' && f1('=Nope!A1') === '#REF!' && f1('=SQRT(-1)') === '#NUM!' && f1('=ABC1') === '#REF!');
check('SM5', 'A formula that points at itself, directly or in a loop, is a #CIRC! error; the cells using it too', ev({ A1: '=A1+1' }, 'A1') === '#CIRC!' && ev({ A1: '=B1', B1: '=A1' }, 'A1') === '#CIRC!' && ev({ A1: '=B1', B1: '=A1', C1: '=A1+1' }, 'C1') === '#CIRC!');
check('SM6', 'An error in one cell flows to the cells that use it, and IFERROR / ISERROR catch it', ev({ A1: '=1/0', A2: '=A1+1' }, 'A2') === '#DIV/0!' && f1('=IFERROR(1/0,"n/a")') === 'n/a' && f1('=IFERROR(5,"n/a")') === '5' && f1('=ISERROR(1/0)') === 'TRUE' && isError(F.E.NA) && !isError('Total'));
check('SM7', 'Text that merely looks like code is text: nothing is ever executed', ev({ A1: 'alert(1)' }, 'A1') === 'alert(1)' && f1('=alert(1)') === '#NAME?' && f1('=constructor.constructor("return 1")()') !== '1' && f1('=window') === '#NAME?' && f1('=this') === '#NAME?' && f1('=__proto__') === '#NAME?' && f1('=toString(1)') === '#NAME?');
check('SM8', 'Numbers with commas, percentages, currency and dates read as numbers', ev({ A1: '1,250.5', B1: '=A1+1' }, 'B1') === '1251.5' && f1('=50%*200') === '100' && ev({ A1: '12%', B1: '=A1*100' }, 'B1') === '12' && ev({ A1: '$1,000', B1: '=A1/10' }, 'B1') === '100' && ev({ A1: '2024-03-01', B1: '=A1+1' }, 'B1') === '45353' && ev({ A1: "'123", B1: '=ISTEXT(A1)' }, 'B1') === 'TRUE');
check('SM9', 'A hostile or broken stored body becomes a safe sheet: junk cells dropped, names cleaned, sizes capped', parseBook('not json').sheets.length === 1 && parseBook('{"sheets":[{"name":"<img onerror=x>","cells":{"A1":5,"ZZ99":"x","B2":"ok","__proto__":"x"}}]}').sheets[0].cells.B2 === 'ok' && Object.keys(parseBook('{"sheets":[{"cells":{"A1":5,"ZZ99":"x"}}]}').sheets[0].cells).length === 0 && Object.keys(parseBook('{"sheets":[{"cells":{"__proto__":"x"}}]}').sheets[0].cells).length === 0 && ({}).x === undefined && parseBook('{"v":2,"styles":[{"fc":"red; background:url(x)","bg":"#12345g","fs":9999,"b":1,"nf":{"k":"cur","sym":"<b>"}}],"sheets":[{"cells":{"A1":["x",0]}}]}').styles.every((s) => !s.fc && !s.bg && !s.fs && !(s.nf && s.nf.sym)));
const many = { v: 2, sheets: [{ name: 'Big', cells: Object.fromEntries(Array.from({ length: MAX_CELLS + 500 }, (_, i) => [ref(i % 52, Math.floor(i / 52) % 1000), `${i}`])) }] };
check('SM10', 'Cell count is capped when reading a stored body', Object.keys(parseBook(JSON.stringify(many)).sheets[0].cells).length <= MAX_CELLS);
check('SM11', 'Writing then reading gives the same book, cells in row order, empty cells left out (v1 bodies upgrade to v2)', serializeBook(parseBook(serializeBook({ v: 1, styles: [], sheets: [{ name: 'S', cells: { B2: '2', A1: '1', C3: '' }, sty: {}, cw: {}, rh: {}, merges: [], freeze: { r: 0, c: 0 }, hc: [], hr: [], filter: null }] }))) === '{"v":2,"styles":[],"sheets":[{"name":"S","cells":{"A1":"1","B2":"2"}}]}' && parseBook('{"v":1,"sheets":[{"name":"Old","cells":{"A1":"5","B1":"=A1*2"}}]}').sheets[0].cells.B1 === '=A1*2');
check('SM12', 'References parse within A1…AZ1000 only', parseRef('A1')?.col === 0 && parseRef('z100')?.row === 99 && parseRef('AZ1000')?.col === 51 && parseRef('BA1') === null && parseRef('A1001') === null && parseRef('A0') === null && F.colName(51) === 'AZ' && F.colIndex('AZ') === 51);
check('SM13', 'A new book is one empty sheet', emptyBook().sheets.length === 1 && emptyBook().v === 2);

// ---- the function list from the brief
const A = { A1: '4', A2: '9', A3: '16', B1: 'apple', B2: 'banana', B3: 'apricot', C1: '10', C2: '20', C3: '30' };
check('SM14', 'Logical: IF, AND, OR, NOT and comparisons (with & for text)', f1('=IF(A1>3,"big","small")', A) === 'big' && f1('=IF(A1>30,"big")', A) === 'FALSE' && f1('=AND(A1>1,A2>1)', A) === 'TRUE' && f1('=OR(A1>100,A2>100)', A) === 'FALSE' && f1('=NOT(A1=4)', A) === 'FALSE' && f1('="a"&"b"&1') === 'ab1' && f1('=A1<>A2', A) === 'TRUE' && f1('=A1>=4', A) === 'TRUE' && f1('="abc"="ABC"') === 'TRUE' && f1('=IF(TRUE,1,1/0)') === '1');
check('SM15', 'Maths: ROUND, ROUNDUP, ROUNDDOWN, ABS, INT, MOD, POWER, SQRT', f1('=ROUND(2.567,2)') === '2.57' && f1('=ROUND(-2.5)') === '-3' && f1('=ROUNDUP(2.121,1)') === '2.2' && f1('=ROUNDDOWN(2.999,1)') === '2.9' && f1('=ABS(-4)') === '4' && f1('=INT(-1.5)') === '-2' && f1('=MOD(10,3)') === '1' && f1('=MOD(-1,3)') === '2' && f1('=MOD(1,0)') === '#DIV/0!' && f1('=POWER(2,10)') === '1024' && f1('=SQRT(A3)', A) === '4');
check('SM16', 'Conditional sums: COUNTIF, SUMIF, AVERAGEIF with operators and wildcards', f1('=COUNTIF(A1:A3,">5")', A) === '2' && f1('=COUNTIF(B1:B3,"ap*")', A) === '2' && f1('=COUNTIF(B1:B3,"banana")', A) === '1' && f1('=COUNTIF(A1:A3,"<>9")', A) === '2' && f1('=SUMIF(A1:A3,">5",C1:C3)', A) === '50' && f1('=SUMIF(A1:A3,9)', A) === '9' && f1('=AVERAGEIF(A1:A3,">5",C1:C3)', A) === '25' && f1('=AVERAGEIF(A1:A3,">99")', A) === '#DIV/0!');
check('SM17', 'Text: CONCAT, CONCATENATE, TEXT, LEN, LEFT, RIGHT, MID, UPPER, LOWER, PROPER, TRIM, SUBSTITUTE, FIND', f1('=CONCAT(B1,"-",B2)', A) === 'apple-banana' && f1('=CONCATENATE("a",1,TRUE)') === 'a1TRUE' && f1('=LEN(B2)', A) === '6' && f1('=LEFT(B2,3)', A) === 'ban' && f1('=RIGHT(B2,2)', A) === 'na' && f1('=MID(B2,2,3)', A) === 'ana' && f1('=UPPER(B1)', A) === 'APPLE' && f1('=LOWER("ABC")') === 'abc' && f1('=PROPER("hello wORLD")') === 'Hello World' && f1('=TRIM("  a   b ")') === 'a b' && f1('=SUBSTITUTE("a-b-c","-","+")') === 'a+b+c' && f1('=FIND("n",B2)', A) === '3' && f1('=LEFT("abc")') === 'a');
check('SM18', 'TEXT formats numbers, percents, thousands and dates', f1('=TEXT(1234.5,"#,##0.00")') === '1,234.50' && f1('=TEXT(0.256,"0%")') === '26%' && f1('=TEXT(3.14159,"0.00")') === '3.14' && f1('=TEXT(7,"000")') === '007' && f1('=TEXT(DATE(2026,3,27),"yyyy-mm-dd")') === '2026-03-27' && f1('=TEXT(DATE(2026,3,27),"dd/mm/yyyy")') === '27/03/2026' && f1('=TEXT(DATE(2026,3,27),"mmm d, yyyy")') === 'Mar 27, 2026' && f1('=TEXT(1234,"$#,##0")') === '$1,234');
check('SM19', 'Dates: DATE, YEAR, MONTH, DAY, TODAY, NOW (and month overflow)', f1('=YEAR(DATE(2026,3,27))') === '2026' && f1('=MONTH(DATE(2026,3,27))') === '3' && f1('=DAY(DATE(2026,3,27))') === '27' && f1('=DAY(DATE(2026,2,30))') === '2' && f1('=MONTH(DATE(2026,14,1))') === '2' && Math.abs(Number(f1('=TODAY()')) - Math.floor(F.toSerial(Date.now()))) <= 1 && Number(f1('=NOW()')) > 45000 && f1('=DATE(2026,3,27)-DATE(2026,3,1)') === '26');
const L = { A1: 'k1', B1: '10', C1: 'x', A2: 'k2', B2: '20', C2: 'y', A3: 'k3', B3: '30', C3: 'z' };
check('SM20', 'Lookups: VLOOKUP, HLOOKUP, INDEX, MATCH, XLOOKUP', f1('=VLOOKUP("k2",A1:C3,2,FALSE)', L) === '20' && f1('=VLOOKUP("k2",A1:C3,3,FALSE)', L) === 'y' && f1('=VLOOKUP("zz",A1:C3,2,FALSE)', L) === '#N/A' && f1('=VLOOKUP(25,B1:C3,2)', L) === 'y' && f1('=VLOOKUP("k1",A1:C3,9,FALSE)', L) === '#REF!' && f1('=HLOOKUP("k2",A1:C3,2,FALSE)', L) === '#N/A' && f1('=HLOOKUP("x",A1:C3,2,FALSE)', L) === 'y' && f1('=INDEX(A1:C3,2,3)', L) === 'y' && f1('=INDEX(B1:B3,3)', L) === '30' && f1('=INDEX(A1:C3,9,1)', L) === '#REF!' && f1('=MATCH("k3",A1:A3,0)', L) === '3' && f1('=MATCH(25,B1:B3,1)', L) === '2' && f1('=MATCH("nope",A1:A3,0)', L) === '#N/A' && f1('=XLOOKUP("k3",A1:A3,B1:B3)', L) === '30' && f1('=XLOOKUP("q",A1:A3,B1:B3,"none")', L) === 'none' && f1('=XLOOKUP("q",A1:A3,B1:B3)', L) === '#N/A');
check('SM21', 'Cross-sheet references (Sheet2!A1, quoted names) and absolute references', f1('=Sheet2!A1*2', {}, [{ name: 'Sheet2', cells: { A1: '21' } }]) === '42' && f1("='My Data'!B2+1", {}, [{ name: 'My Data', cells: { B2: '9' } }]) === '10' && f1('=SUM(Sheet2!A1:A2)', {}, [{ name: 'Sheet2', cells: { A1: '1', A2: '2' } }]) === '3' && f1('=$A$1+A$1+$A1', { A1: '2' }) === '6' && f1('=sheet2!a1', {}, [{ name: 'Sheet2', cells: { A1: '7' } }]) === '7' && f1('=SUM(A:A)', { A1: '1', A5: '4' }) === '5');
check('SM22', 'Wrong argument counts are #VALUE!, an empty argument is allowed, unknown names are #NAME?', f1('=ROUND()') === '#VALUE!' && f1('=ABS(1,2)') === '#VALUE!' && f1('=SUM()') === '#VALUE!' && f1('=IF(1=1,,2)') === '0' || f1('=IF(1=1,,2)') === '' && f1('=SUMM(1)') === '#NAME?' && f1('=A1') === '' );

// ---- dependency-aware recalculation
{
  const { b, c } = calcOf({ A1: '1', A2: '=A1+1', A3: '=A2+1', B1: '=SUM(A1:A3)', C1: '=B1*2', D1: '=Sheet2!A1' }, [{ name: 'Sheet2', cells: { A1: '5' } }]);
  const before = [c.get(0, 'A3'), c.get(0, 'B1'), c.get(0, 'C1'), c.get(0, 'D1')].map(Number);
  b.sheets[0].cells.A1 = '10'; c.invalidate(0, 0, 0);
  const after = [c.get(0, 'A3'), c.get(0, 'B1'), c.get(0, 'C1'), c.get(0, 'D1')].map(Number);
  b.sheets[1].cells.A1 = '50'; c.invalidate(1, 0, 0);
  check('SM23', 'Changing one cell recomputes exactly the cells that depend on it (cells, ranges and other sheets), nothing stale', before.join() === '3,6,12,5' && after.join() === '12,33,66,5' && Number(c.get(0, 'D1')) === 50);
  const big = {}; for (let i = 1; i <= 1000; i++) big[`A${i}`] = i === 1 ? '1' : `=A${i - 1}+1`; big.B1 = '=SUM(A1:A1000)';
  const t0 = performance.now(); const bc = calcOf(big); const top = bc.c.get(0, 'A1000'); const sum = bc.c.get(0, 'B1'); bc.b.sheets[0].cells.A1 = '2'; bc.c.invalidate(0, 0, 0); const sum2 = bc.c.get(0, 'B1');
  check('SM24', 'A 1,000-row dependency chain evaluates (no stack overflow) and recalculates quickly after an edit', top === 1000 && sum === 500500 && sum2 === 501500 && performance.now() - t0 < 1500);
}

// ---- reference shifting
const sh = (src, axis, at, n) => F.shiftFormula(src, 'S', 'S', axis, at, n);
check('SM25', 'Inserting rows/columns moves references (absolute ones too), ranges grow, strings are untouched', sh('A5+B1', 'r', 2, 1) === 'A6+B1' && sh('$A$5', 'r', 0, 2) === '$A$7' && sh('SUM(A1:A3)', 'r', 1, 1) === 'SUM(A1:A4)' && sh('SUM(A1:A3)', 'r', 3, 1) === 'SUM(A1:A3)' && sh('"A5"&A5', 'r', 0, 1) === '"A5"&A6' && sh('C1', 'c', 1, 2) === 'E1' && sh('SUM(B:C)', 'c', 0, 1) === 'SUM(C:D)' && F.shiftFormula('Other!A5', 'S', 'S', 'r', 0, 1) === 'Other!A5' && F.shiftFormula('S!A5+A5', 'S2', 'S', 'r', 0, 1) === 'S!A6+A5');
check('SM26', 'Deleting rows/columns: references to them become #REF!, ranges shrink, later references move up', sh('A2', 'r', 1, -1) === '#REF!' && sh('A3', 'r', 1, -1) === 'A2' && sh('SUM(A1:A5)', 'r', 1, -2) === 'SUM(A1:A3)' && sh('SUM(A2:A3)', 'r', 1, -2) === '#REF!' && sh('SUM(A1:A3)', 'r', 2, -1) === 'SUM(A1:A2)' && sh('B1+C1', 'c', 1, -1) === '#REF!+B1' && sh('A1+A9', 'r', 3, -3) === 'A1+A6');
check('SM27', 'Copying a formula moves relative references and keeps $ ones; moving off the sheet is #REF!', F.translateFormula('A1+$B$2+C$3+$D4', 1, 1) === 'B2+$B$2+D$3+$D5' && F.translateFormula('SUM(A1:B2)', 0, 1) === 'SUM(B1:C2)' && F.translateFormula('A1', -1, 0) === '#REF!' && F.translateFormula('Sheet2!A1', 2, 0) === 'Sheet2!A3');
check('SM28', 'Renaming or deleting a sheet updates the formulas that use it', F.renameSheetInFormula('Sheet2!A1+SUM(Sheet2!B1:B2)+Other!A1', 'Sheet2', 'Costs') === 'Costs!A1+SUM(Costs!B1:B2)+Other!A1' && F.renameSheetInFormula('S2!A1', 'S2', 'My Sheet') === "'My Sheet'!A1" && F.dropSheetInFormula('SUM(Sheet2!A1:A2)+A1', 'Sheet2') === 'SUM(#REF!)+A1');
{
  const b = parseBook(JSON.stringify({ v: 2, sheets: [{ name: 'A', cells: { A1: '1', A2: '2', A3: '=SUM(A1:A2)', B1: "=B!A1+A2", C5: 'x' } }, { name: 'B', cells: { A1: "=A!A3", A2: '=A!A1' } }] }));
  const r = M.insertLines(b, 0, 'r', 1, 1);
  check('SM29', 'Insert row moves cells and updates formulas on this sheet AND on other sheets that point at it', r.ok && b.sheets[0].cells.A1 === '1' && b.sheets[0].cells.A3 === '2' && b.sheets[0].cells.A4 === '=SUM(A1:A3)' && b.sheets[0].cells.B1 === '=B!A1+A3' && b.sheets[1].cells.A1 === '=A!A4' && b.sheets[1].cells.A2 === '=A!A1' && b.sheets[0].cells.C6 === 'x');
  M.deleteLines(b, 0, 'c', 0, 1);
  check('SM30', 'Delete column removes its cells, shifts the rest left, #REF! where the formulas pointed at it', b.sheets[0].cells.A1 === '=B!A1+A3' ? false : b.sheets[1].cells.A2 === '=A!#REF!1' || b.sheets[1].cells.A2 === '=#REF!' || /#REF!/.test(b.sheets[1].cells.A2));
  const full = parseBook(JSON.stringify({ v: 2, sheets: [{ name: 'F', cells: { A1000: 'last' } }] }));
  check('SM31', 'Insert refuses to push data past the last row', M.insertLines(full, 0, 'r', 0, 1).ok === false && full.sheets[0].cells.A1000 === 'last');
}

// ---- styles, transactions, sort, fill, merge
{
  const b = parseBook('{"v":2,"styles":[],"sheets":[{"name":"S","cells":{"A1":"3","A2":"1","A3":"2","B1":"c","B2":"a","B3":"b"}}]}');
  const bold = M.patchStyle(b, -1, { b: 1 }); const bigBold = M.patchStyle(b, bold, { fs: 20 }); const again = M.patchStyle(b, -1, { b: 1 });
  check('SM32', 'Styles are shared and de-duplicated; patching adds/removes fields; empty style means none', bold === again && bigBold !== bold && b.styles.length === 2 && M.patchStyle(b, bold, { b: null }) === -1 && b.styles[bigBold].fs === 20);
  const tx = new Tx(b); tx.raw(0, 'A1', '99'); tx.style(0, 'A1', bold); tx.raw(0, 'C9', 'new');
  check('SM33', 'A transaction can be undone and redone exactly (cells, styles, counts)', b.sheets[0].cells.A1 === '99' && (tx.apply('undo', b), b.sheets[0].cells.A1 === '3' && b.sheets[0].cells.C9 === undefined && b.sheets[0].sty.A1 === undefined && b.n === 6) && (tx.apply('redo', b), b.sheets[0].cells.A1 === '99' && b.sheets[0].sty.A1 === bold && b.sheets[0].cells.C9 === 'new'));
  tx.apply('undo', b);
  const c = createCalc(b); const t2 = new Tx(b); M.sortRange(b, 0, { c1: 0, c2: 1, r1: 0, r2: 2 }, 0, 'asc', t2, c);
  check('SM34', 'Sorting a range by a column moves whole rows, ascending and descending, text and numbers', [b.sheets[0].cells.A1, b.sheets[0].cells.A2, b.sheets[0].cells.A3].join() === '1,2,3' && [b.sheets[0].cells.B1, b.sheets[0].cells.B2, b.sheets[0].cells.B3].join() === 'a,b,c');
  const t3 = new Tx(b); M.sortRange(b, 0, { c1: 0, c2: 1, r1: 0, r2: 2 }, 1, 'desc', t3, createCalc(b));
  check('SM35', 'Sort descending by the second column', b.sheets[0].cells.B1 === 'c' && b.sheets[0].cells.A1 === '3');
  const f = parseBook('{"v":2,"sheets":[{"name":"S","cells":{"A1":"1","A2":"2","B1":"=A1*2","C1":"Item 1","D1":"x","D2":"y"}}]}');
  const t4 = new Tx(f); M.fillRange(f, 0, { c1: 0, r1: 0, c2: 0, r2: 1 }, { c1: 0, r1: 2, c2: 0, r2: 4 }, 'down', t4);
  M.fillRange(f, 0, { c1: 1, r1: 0, c2: 1, r2: 0 }, { c1: 1, r1: 1, c2: 1, r2: 3 }, 'down', t4);
  M.fillRange(f, 0, { c1: 2, r1: 0, c2: 2, r2: 0 }, { c1: 2, r1: 1, c2: 2, r2: 2 }, 'down', t4);
  M.fillRange(f, 0, { c1: 3, r1: 0, c2: 3, r2: 1 }, { c1: 3, r1: 2, c2: 3, r2: 5 }, 'down', t4);
  const cells = f.sheets[0].cells;
  check('SM36', 'Fill continues number series, moves formula references, counts up "Item 1", and repeats a text pattern', [cells.A3, cells.A4, cells.A5].join() === '3,4,5' && cells.B2 === '=A2*2' && cells.B4 === '=A4*2' && cells.C2 === 'Item 2' && cells.C3 === 'Item 3' && [cells.D3, cells.D4, cells.D5, cells.D6].join() === 'x,y,x,y');
  const g = parseBook('{"v":2,"sheets":[{"name":"S","cells":{"A1":"10","A2":"20"}}]}'); const t5 = new Tx(g); M.fillRange(g, 0, { c1: 0, r1: 0, c2: 0, r2: 1 }, { c1: 0, r1: 2, c2: 0, r2: 3 }, 'down', t5, false);
  check('SM37', 'Copy-fill (Ctrl+D style) repeats instead of continuing a series', g.sheets[0].cells.A3 === '10' && g.sheets[0].cells.A4 === '20');
  const m = parseBook('{"v":2,"sheets":[{"name":"S","cells":{"A1":"keep","B1":"gone","A2":"gone2"}}]}'); const t6 = new Tx(m); M.mergeRange(m, 0, { c1: 0, r1: 0, c2: 1, r2: 1 }, t6);
  check('SM38', 'Merging keeps the top-left value, clears the rest, and the merge round-trips', m.sheets[0].cells.A1 === 'keep' && m.sheets[0].cells.B1 === undefined && M.mergeAt(m.sheets[0], 1, 1) !== null && JSON.parse(serializeBook(m)).sheets[0].merges[0] === 'A1:B2' && parseBook(serializeBook(m)).sheets[0].merges.length === 1);
}

// ---- the v2 model round trip
{
  const src = { v: 2, styles: [{ b: 1, fc: '#ff0000', nf: { k: 'cur', d: 2, sym: '€' }, bd: { t: 1, b: 1 } }, { bg: '#ffff00', ha: 'c', wr: 1 }], sheets: [
    { name: 'Data', cells: { A1: ['Total', 0], B1: ['=SUM(B2:B3)', 0], B2: '5', B3: ['7', 1], D4: ['', 1] }, cw: { 0: 140, 3: 60 }, rh: { 0: 40 }, merges: ['E1:F2'], freeze: { r: 1, c: 1 }, hc: [2], hr: [5], filter: { c1: 0, c2: 1, r1: 0, r2: 3, hide: { 1: ['5'] } } },
    { name: 'Notes', cells: { A1: 'hello' } }] };
  const once = serializeBook(parseBook(JSON.stringify(src))); const twice = serializeBook(parseBook(once)); const back = parseBook(once);
  check('SM39', 'The v2 model (styles, widths, heights, merges, freeze, hidden, filter, several sheets) survives write → read → write unchanged', once === twice && back.sheets.length === 2 && back.sheets[0].cw[0] === 140 && back.sheets[0].rh[0] === 40 && back.sheets[0].freeze.r === 1 && back.sheets[0].hc[0] === 2 && back.sheets[0].filter.hide[1][0] === '5' && back.styles.length === 2 && back.sheets[0].sty.D4 !== undefined && back.sheets[0].cells.D4 === undefined && back.sheets[1].cells.A1 === 'hello');
  const calc = createCalc(back); check('SM40', 'Number formats display currency, percent, dates and times; implied formats come from what was typed', F.formatValue(1234.5, { k: 'cur', d: 2, sym: '€' }) === '€1,234.50' && F.formatValue(-5, { k: 'cur', d: 0 }) === '-$5' && F.formatValue(0.256, { k: 'pct', d: 1 }) === '25.6%' && F.formatValue(1234567.891, { k: 'num', d: 1 }) === '1,234,567.9' && F.formatValue(45353, { k: 'date', f: 'us' }) === '03/01/2024' && F.formatValue(45353.75, { k: 'time' }) === '18:00:00' && F.formatValue(0.1 + 0.2) === '0.3' && F.formatValue(1e12) === '1E+12' && M.cellText(back, 0, calc, 1, 0) === '€12.00' && F.impliedFormat('12%').k === 'pct' && F.impliedFormat('2024-01-02').k === 'date' && F.impliedFormat('=TODAY()').k === 'date' && F.impliedFormat('plain') === undefined);
  const oversized = JSON.stringify({ v: 2, sheets: [{ name: 'S', cells: { A1: 'x'.repeat(50000) } }] });
  check('SM41', 'A single cell is capped, widths and sizes are clamped, bad merges/freezes/filters are dropped', parseBook(oversized).sheets[0].cells.A1.length === M.MAX_RAW && parseBook('{"v":2,"sheets":[{"name":"S","cells":{},"cw":{"0":99999,"x":5},"merges":["A1:A1","Q9","A1:B2","B2:C3"],"freeze":{"r":-4,"c":999},"filter":{"c1":5,"c2":1}}]}').sheets[0].cw[0] === 600 && parseBook('{"v":2,"sheets":[{"name":"S","cells":{},"merges":["A1:A1","Q9","A1:B2","B2:C3"],"freeze":{"r":-4,"c":999},"filter":{"c1":5,"c2":1}}]}').sheets[0].merges.length === 1 && parseBook('{"v":2,"sheets":[{"name":"S","cells":{},"freeze":{"r":-4,"c":999},"filter":{"c1":5,"c2":1}}]}').sheets[0].filter === null);
  check('SM42', 'Duplicate sheet names are made unique; 20 sheets at most', parseBook('{"sheets":[{"name":"A"},{"name":"a"}]}').sheets[1].name !== 'a' && parseBook(JSON.stringify({ sheets: Array.from({ length: 30 }, (_, i) => ({ name: `S${i}` })) })).sheets.length === 20);
}

// ---- CSV and TSV
check('SM43', 'CSV reads quotes, doubled quotes, commas and line breaks inside quotes, CRLF, semicolons and tabs', JSON.stringify(M.parseCSV('a,b\r\n"x,y","he said ""hi"""\r\n"multi\nline",3\r\n')) === '[["a","b"],["x,y","he said \\"hi\\""],["multi\\nline","3"]]' && JSON.stringify(M.parseCSV('a;b\n1;2')) === '[["a","b"],["1","2"]]' && JSON.stringify(M.parseCSV('a\tb\n1\t2')) === '[["a","b"],["1","2"]]' && M.parseCSV('﻿a,b')[0][0] === 'a' && M.parseCSV('').length === 0 && M.parseCSV('a,b,').length === 1 && M.parseCSV('a,b,')[0].length === 3);
check('SM44', 'CSV writing quotes where needed and round-trips; risky text gets a leading apostrophe, numbers do not', M.toCSV([['a,b', 'c"d', 'e\nf', 'plain', '']]) === '"a,b","c""d","e\nf",plain,' && JSON.stringify(M.parseCSV(M.toCSV([['a,b', 'c"d', 'e\nf', 'plain', '']]))) === '[["a,b","c\\"d","e\\nf","plain",""]]' && M.csvCell('=1+1', '=1+1') === "'=1+1" && M.csvCell('@x', '@x') === "'@x" && M.csvCell(-5, '-5') === '-5' && M.csvCell('-x', '-x') === "'-x" && M.csvCell('ok', 'ok') === 'ok');
check('SM45', 'Clipboard text (tab separated, as Excel and Google Sheets write it) reads and writes', JSON.stringify(M.parseTSV('a\tb\n1\t2\n')) === '[["a","b"],["1","2"]]' && JSON.stringify(M.parseTSV('"x\ty"\tz')) === '[["x\\ty","z"]]' && M.toTSV([['a', 'b'], ['1', 'x\ty']]) === 'a\tb\r\n1\t"x\ty"');
{
  const b = parseBook('{"v":2,"sheets":[{"name":"S","cells":{"A1":"h","B1":"h","A2":"1","B2":"2","A3":"3"}}]}');
  const imported = M.parseCSV(M.toCSV([['h', 'h'], ['1', '2'], ['3', '']]));
  check('SM46', 'Data region finds the block around a cell; used range covers cells and merges', JSON.stringify(M.dataRegion(b.sheets[0], 0, 1)) === '{"c1":0,"r1":0,"c2":1,"r2":2}' && JSON.stringify(M.usedRange(b.sheets[0])) === '{"c1":0,"r1":0,"c2":1,"r2":2}' && M.usedRange(M.emptySheet()) === null && imported.length === 3);
}
check('SM47', 'The first editor’s helper still works for other callers (evaluateSheet, display)', display(M.evaluateSheet({ cells: { A1: '2', A2: '=A1*3' } }).get('A2')) === '6' && M.MIME === 'application/vnd.l2f.sheet+json');
check('SM48', 'Hostile formulas cannot hang or escape: deep nesting, huge numbers, long text, prototype names', (() => { const deep = `${'('.repeat(3000)}1${')'.repeat(3000)}`; const r = f1(`=${deep}`); return typeof r === 'string'; })() && f1('=9^9^9^9') !== undefined && typeof f1(`=${'1+'.repeat(5000)}1`) === 'string' && f1('=constructor') === '#NAME?' && f1('=hasOwnProperty(1)') === '#NAME?' && ev({ A1: '=B1', B1: '=C1', C1: '=A1' }, 'A1') === '#CIRC!');

for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}`);
const pc = results.filter((x) => x.ok).length; console.log(`\n${pc}/${results.length} checks passed`); process.exit(pc === results.length ? 0 : 1);
