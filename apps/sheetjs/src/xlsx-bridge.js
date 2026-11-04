// Bridge between the Sheets model and SheetJS CE. Only reads values / formulas / basic number formats: styles are not carried (CE does not write them).
import * as XLSX from 'xlsx';

/** ArrayBuffer -> [{ name, rows: [[{ v, f, z }|null]] }] (v: value, f: formula text without '=', z: number format) */
export function readXlsx(buf, { maxRows = 1000, maxCols = 52 } = {}) {
  const wb = XLSX.read(buf, { type: 'array', cellFormula: true, cellDates: true, cellNF: true });
  return wb.SheetNames.slice(0, 20).map((name) => {
    const ws = wb.Sheets[name]; const rows = [];
    const ref = ws['!ref']; if (!ref) return { name, rows, merges: [] };
    const rg = XLSX.utils.decode_range(ref);
    for (let r = rg.s.r; r <= Math.min(rg.e.r, maxRows - 1); r++) {
      const row = [];
      for (let c = rg.s.c; c <= Math.min(rg.e.c, maxCols - 1); c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        row[c] = cell ? { v: cell.v instanceof Date ? cell.v.toISOString().slice(0, 10) : cell.v, t: cell.t, f: cell.f, z: cell.z } : null;
      }
      rows[r] = row;
    }
    const merges = (ws['!merges'] || []).filter((m) => m.e.r < maxRows && m.e.c < maxCols).map((m) => ({ r1: m.s.r, c1: m.s.c, r2: m.e.r, c2: m.e.c }));
    return { name, rows, merges };
  });
}

/** [{ name, rows: [[value|{f}|null]] }] -> Uint8Array (.xlsx). Cell: string | number | boolean | { f: 'SUM(A1:A2)', v: cachedValue }. */
export function writeXlsx(sheets) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = {}; let maxR = 0, maxC = 0;
    s.rows.forEach((row, r) => (row || []).forEach((cell, c) => {
      if (cell === null || cell === undefined || cell === '') return;
      const addr = XLSX.utils.encode_cell({ r, c });
      if (typeof cell === 'object') ws[addr] = { t: typeof cell.v === 'number' ? 'n' : 's', v: cell.v ?? 0, f: cell.f };
      else if (typeof cell === 'number') ws[addr] = { t: 'n', v: cell };
      else if (typeof cell === 'boolean') ws[addr] = { t: 'b', v: cell };
      else ws[addr] = { t: 's', v: String(cell) };
      maxR = Math.max(maxR, r); maxC = Math.max(maxC, c);
    }));
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } });
    if (s.merges?.length) ws['!merges'] = s.merges.map((m) => ({ s: { r: m.r1, c: m.c1 }, e: { r: m.r2, c: m.c2 } }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet');
  }
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}
