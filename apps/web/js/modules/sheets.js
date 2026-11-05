// Sheets (our own editor): a virtualised grid up to 1,000 rows x 52 columns, formatting, formulas with autocomplete, undo/redo, clipboard that talks to Excel and
// Google Sheets (tab-separated text), fill, insert/delete, sort, filter, find and replace, several sheets, CSV / XLSX import and export, print.
// It runs on the shared saved-document session (versions, conflict handling, history, unsaved guard). The stored body is JSON (sheetmodel.js v2); formulas are
// evaluated by sheetformula.js, never by eval. Cell colours and sizes are set through the CSSOM, because the page policy forbids inline style attributes.
import { h, put, icon, btn, dialog, toast, field, notice, skeleton, errorState, noAccessState, readOnlyNotice } from '../ui.js';
import { createSession } from './session.js';
import { fromDrive } from './driveutil.js';
import { createGrid } from './sheetgrid.js';
import { drawChart } from './sheetchart.js';
import { MIME, COLS, ROWS, MAX_CHARS, MAX_SHEETS, MAX_CELLS, DEFAULT_COL_W, DEFAULT_ROW_H, MIN_COL_W, MAX_COL_W, MIN_ROW_H, MAX_ROW_H, colName, ref, parseRef, parseRange, rangeLabel, parseBook, serializeBook, emptySheet, createCalc, cellText, formatValue, impliedFormat, parseLiteral, patchStyle, internStyle, styleOf, Tx, insertLines, deleteLines, renameSheet, removeSheet, duplicateSheet, uniqueName, mergeAt, mergeRange, unmergeRange, sortRange, fillRange, filteredRows, dataRegion, usedRange, countCells, chartData, cfStyle, dvList, linkOf, safeLink, parseCSV, toCSV, toTSV, parseTSV, csvCell, translateFormula, FUNCTION_NAMES, FUNCTION_DOCS, isError } from './sheetmodel.js';

export { MIME };
const timeOf = (iso) => { try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
const NS = 'http://www.w3.org/2000/svg';
const svg = (d) => { const s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'i'); s.setAttribute('aria-hidden', 'true'); const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); s.append(p); return s; };
const ICON = { l: 'M4 6h16M4 10h10M4 14h16M4 18h10', c: 'M4 6h16M7 10h10M4 14h16M7 18h10', r: 'M4 6h16M10 10h10M4 14h16M10 18h10', t: 'M4 4h16M12 20V9m-4 4l4-4 4 4', m: 'M4 12h16M12 3v6m0 6v6', b: 'M4 20h16M12 4v11m-4-4l4 4 4-4',
  wrap: 'M4 6h16M4 12h11a3 3 0 010 6h-3m0 0l2-2m-2 2l2 2M4 18h4', border: 'M4 4h16v16H4zM4 12h16M12 4v16', merge: 'M4 5v14M20 5v14M8 12h8m-3-3l3 3-3 3m-2-6l-3 3 3 3', freeze: 'M4 4h16v16H4zM4 9h16M9 4v16', sort: 'M7 4v16m0 0l-3-3m3 3l3-3M17 20V4m0 0l-3 3m3-3l3 3',
  fill: 'M5 12l7-8 7 8-7 8zM20 15c1.5 2 1.5 3 0 4s-3 0-1.5-4', paint: 'M16 3l5 5-9 9H7v-5zM6 17c0 2-1 3-3 4 3 0 5-1 5-4', clear: 'M5 5l14 14M9 6h9M13 6l-3 12', file: 'M6 3h8l5 5v13H6zM14 3v5h5' };
const SWATCHES = ['#000000', '#434343', '#666666', '#999999', '#cccccc', '#efefef', '#f3f3f3', '#ffffff', '#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff',
  '#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc', '#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd'];
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48];
const SYMBOLS = ['$', '€', '£', '¥', 'CHF', 'R$', '₹'];
const normNL = (t) => String(t).replace(/\r\n?/g, '\n').replace(/\n$/, '');
let clipboardMemory = null;                                  // the last copy made inside the app: keeps formulas and formatting when pasted back

export function sheetView({ api, id, ctx }) {
  const root = h('section', { class: 'sheets ed-full', 'aria-busy': 'true' }, skeleton(4));
  const load = async () => {
    const f = await api.call('drive.files.get', { id }); if (!ctx.live()) return;
    if (!f.ok) return put(root, f.status === 404 ? noAccessState({ action: h('a', { class: 'btn', href: '#/launcher' }, 'Back to the Launcher') }) : errorState(() => { put(root, skeleton(4)); load(); }));
    const file = f.data[0];
    if (file.kind !== 'document' || file.mime_type !== MIME) return put(root, h('div', { class: 'empty', role: 'status' }, icon('doc'), h('h2', { 'data-page-title': true }, file.name), h('p', { class: 'muted' }, 'This is not a spreadsheet.'), file.kind === 'document' ? h('a', { class: 'btn primary', href: `#/doc/${file.id}` }, 'Open it as a document') : null));
    const v = await api.call('drive.files.version', { file: id }); if (!ctx.live()) return;
    if (!v.ok) return put(root, errorState(() => { put(root, skeleton(4)); load(); }));
    mount(file, v.data[0]);
  };

  function mount(file, ver) {
    let meta = file; const book = parseBook(ver.body ?? ''); let si = 0; let calc = createCalc(book);
    const readOnly = Boolean(file.archived_at) || !(ctx.can('drive.file.upload', file.client_id) || file.my_role === 'editor');
    let sel = { a: { c: 0, r: 0 }, f: { c: 0, r: 0 }, kind: 'cell' }; let editing = null; let hidden = { rows: new Set(), cols: new Set() }; let filtered = new Set(); let matches = new Set();
    let body = ''; let dirtyBody = true; const memo = new Map(); let painter = null; let fillSrc = null; let resizing = null;
    const sheet = () => book.sheets[si];
    const denied = () => { if (readOnly) return true; if (sheet().lock) { toast('This sheet is protected. Choose “Unprotect sheet” in the sheet menu (⋯) to edit it.', false); return true; } return false; };
    let zoomPct = 100; try { zoomPct = Math.max(50, Math.min(200, Number(localStorage.getItem(`sx.zoom.${id}`)) || 100)); } catch { /* storage unavailable */ }
    const zoom = () => zoomPct / 100;
    const getBody = () => { if (dirtyBody) { body = serializeBook(book); dirtyBody = false; } return body; };
    const statusEl = h('span', { class: 'docstate', role: 'status', 'aria-live': 'polite' }); const counter = h('span', { class: 'docstat muted' });
    const saveBtn = btn('Save', () => sess.save({ manual: true }), 'primary');
    const titleIn = h('input', { class: 'doctitle', value: meta.name, 'aria-label': 'Spreadsheet name', maxlength: '200', ...(readOnly ? { readonly: true } : {}) });
    const paintStatus = ({ status, savedAt, readOnly: ro, saving }) => {
      const t = { saved: `Saved ${timeOf(savedAt)}`, dirty: 'Unsaved changes', saving: 'Saving…', retrying: 'Not saved, retrying…', failed: 'Couldn’t save. Your changes are still here.', readonly: 'Read only' }[status];
      put(statusEl, h('span', { class: `dot ${status}` }), t, status === 'failed' ? btn('Retry', () => sess.save({ manual: true }), 'link') : null); saveBtn.disabled = ro || status === 'saved' || saving;
    };
    const sess = createSession({ api, id, ctx, version: ver.version, savedBody: null, savedAt: ver.created_at, readOnly, getBody, label: () => meta.name, onStatus: paintStatus, maxChars: MAX_CHARS,
      setBody: (b) => { replaceBook(parseBook(b)); undo.length = 0; redo.length = 0; } });
    sess.reset({ version: ver.version, savedAt: ver.created_at });

    // ------------------------------------------------------------ the editor object the grid talks to
    const ed = {
      zoom, cfFor: (c, r, v, t) => cfStyle(sheet(), c, r, v, t), noteAt: (k) => sheet().notes[k] ?? null, linkAt: (k) => linkOf(sheet(), k), dvAt: (c, r) => Boolean(dvList(sheet(), c, r)), dvMenu: (a) => dvMenu(a), chartsMoved: () => drawCharts(),
      sheet: () => sheet(), book: () => book, si: () => si, calc: () => calc, range: () => range(), active: () => activeCell(), filtered: () => filtered, fillPoint: () => fillPoint(),
      filterOn: () => false, matchAt: (c, r) => matches.size > 0 && matches.has(ref(c, r)), focusGrid: () => { if (pointMode()) return; commitEditing(); focusGrid(); },
      filterBtnAt: (c, r) => { const f = sheet().filter; return f && r === f.r1 && c >= f.c1 && c <= f.c2 ? ((f.hide[c]?.length ?? 0) > 0 ? 'on' : 'off') : null; },
      pointerCell(c, r, { shift, ctrl }) {
        tabOrigin = null; selectChart(null); { const u = linkOf(sheet(), ref(c, r)); if (ctrl && u) { window.open(u, '_blank', 'noopener,noreferrer'); } }
        if (pointMode()) { const t = grid.editor; t.setRangeText(ref(c, r), t.selectionStart, t.selectionEnd, 'end'); t.dispatchEvent(new Event('input')); t.focus(); return; } commitEditing();
        if (painter) painter.active = true;
        if (shift) { sel = { ...sel, f: { c, r }, kind: 'cell' }; selectionChanged({ scroll: false }); } else setSel({ c, r }, { c, r }, 'cell', { scroll: false });
      },
      dragTo(c, r) { if (sel.f.c === c && sel.f.r === r) return; sel = { ...sel, f: { c, r } }; selectionChanged({ scroll: false }); },
      pointerHead(axis, i, { shift }) {
        commitEditing();
        if (axis === 'c') { if (shift && sel.kind === 'col') sel = { ...sel, f: { c: i, r: ROWS - 1 } }; else sel = { a: { c: i, r: 0 }, f: { c: i, r: ROWS - 1 }, kind: 'col' }; }
        else if (shift && sel.kind === 'row') sel = { ...sel, f: { c: COLS - 1, r: i } }; else sel = { a: { c: 0, r: i }, f: { c: COLS - 1, r: i }, kind: 'row' };
        selectionChanged({ scroll: false });
      },
      dragHead(axis, i) { if (axis === 'c' && sel.kind === 'col') sel = { ...sel, f: { c: i, r: ROWS - 1 } }; else if (axis === 'r' && sel.kind === 'row') sel = { ...sel, f: { c: COLS - 1, r: i } }; else return; selectionChanged({ scroll: false }); },
      pointerUp() { if (painter?.active) { const idx = painter.idx; painter = null; grid.el.classList.remove('painting'); applyStyleIndex(idx); } },
      selectAll() { commitEditing(); sel = { a: { c: 0, r: 0 }, f: { c: COLS - 1, r: ROWS - 1 }, kind: 'all' }; selectionChanged({ scroll: false }); focusGrid(); },
      edit: () => startEdit(), context: (x, y, t) => contextMenu(x, y, t), filterMenu: (c, a) => filterMenu(c, a), autofit: (c) => autofit(c),
      fillStart() { const g = range(); fillSrc = { ...g }; }, fillTo: (c, r) => fillTo(c, r), fillEnd: () => fillEnd(),
      resizeStart(axis, i) { if (denied()) { resizing = null; return; } commitEditing(); resizing = { axis, i, before: serializeBook(book) }; const g = range(); resizing.group = (axis === 'c' && sel.kind === 'col' && i >= g.c1 && i <= g.c2) ? [g.c1, g.c2] : (axis === 'r' && sel.kind === 'row' && i >= g.r1 && i <= g.r2) ? [g.r1, g.r2] : [i, i]; },
      resize(axis, i, size0) { if (!resizing) return; const size = size0 / zoom(); const v = axis === 'c' ? Math.max(MIN_COL_W, Math.min(MAX_COL_W, Math.round(size))) : Math.max(MIN_ROW_H, Math.min(MAX_ROW_H, Math.round(size))); for (let k = resizing.group[0]; k <= resizing.group[1]; k++) (axis === 'c' ? sheet().cw : sheet().rh)[k] = v; grid.relayout(); },
      resizeEnd() { if (!resizing) return; const before = resizing.before; resizing = null; pushSnap(before); grid.relayout(); },
      afterScroll() { if (editing) grid.placeEditor(editing.c, editing.r); },
    };
    const grid = createGrid(ed);


    // ------------------------------------------------------------ selection
    const mergeOf = (c, r) => mergeAt(sheet(), c, r);
    const activeCell = () => { const m = mergeOf(sel.a.c, sel.a.r); return m ? { c: m.c1, r: m.r1 } : { ...sel.a }; };
    function range() {
      let g = { c1: Math.min(sel.a.c, sel.f.c), c2: Math.max(sel.a.c, sel.f.c), r1: Math.min(sel.a.r, sel.f.r), r2: Math.max(sel.a.r, sel.f.r) };
      if (sel.kind === 'col' || sel.kind === 'all') { g.r1 = 0; g.r2 = ROWS - 1; } if (sel.kind === 'row' || sel.kind === 'all') { g.c1 = 0; g.c2 = COLS - 1; }
      for (let again = true; again;) { again = false; for (const m of sheet().merges) if (!(m.c2 < g.c1 || m.c1 > g.c2 || m.r2 < g.r1 || m.r1 > g.r2) && (m.c1 < g.c1 || m.c2 > g.c2 || m.r1 < g.r1 || m.r2 > g.r2)) { g = { c1: Math.min(g.c1, m.c1), c2: Math.max(g.c2, m.c2), r1: Math.min(g.r1, m.r1), r2: Math.max(g.r2, m.r2) }; again = true; } }
      return g;
    }
    const isMulti = () => { const g = range(); return g.c1 !== g.c2 || g.r1 !== g.r2; };
    const rawAt = (c, r) => sheet().cells[ref(c, r)] ?? '';
    function refreshHidden() { hidden = { rows: new Set([...sheet().hr, ...filtered]), cols: new Set(sheet().hc) }; }
    function recalcFilter() { filtered = filteredRows(book, si, calc); refreshHidden(); }

    function selectionChanged({ scroll = true } = {}) {
      syncBar(); syncTools(); grid.refresh(); if (editing) grid.placeEditor(editing.c, editing.r);
      if (scroll) { const f = sel.f; grid.scrollTo(f.c, f.r); }
      paintStats(); live.textContent = `${ref(activeCell().c, activeCell().r)} ${cellText(book, si, calc, activeCell().c, activeCell().r)}`;
    }
    function setSel(a, f = a, kind = 'cell', opts) { sel = { a: { ...a }, f: { ...f }, kind }; selectionChanged(opts); }

    // ------------------------------------------------------------ history
    const undo = [], redo = []; let snapBytes = 0;
    const trim = () => { while (undo.length > 200 || snapBytes > 30e6) { const e = undo.shift(); if (!e) break; if (e.snap) snapBytes -= e.snap.before.length + e.snap.after.length; } };
    function changed() { dirtyBody = true; sess.markChanged(); paintCount(); }
    function afterTx(cells) { for (const p of cells) { const q = parseRef(p.key); if (q) calc.invalidate(p.si, q.col, q.row); } recalcFilter(); grid.relayout(); drawCharts(); changed(); syncBar(); syncTools(); paintStats(); }
    function commitTx(tx) { if (tx.empty) return false; undo.push({ tx }); redo.length = 0; trim(); afterTx(tx.cells); return true; }
    function replaceBook(next, keepSel = false) {
      const keep = sel;
      book.styles = next.styles; book.sheets = next.sheets; book.n = next.n; delete book._sk;
      si = Math.min(si, book.sheets.length - 1); calc = createCalc(book); recalcFilter(); sel = keepSel ? keep : { a: { c: 0, r: 0 }, f: { c: 0, r: 0 }, kind: 'cell' };
      grid.relayout(); drawTabs(); syncBar(); syncTools(); dirtyBody = true; paintCount(); paintStats();
    }
    /** Runs a structural change (rows, sizes, merges, sheets…) and records a snapshot so it can be undone. */
    function structural(fn, opts = {}) {
      if (!opts.force && denied()) return false; if (readOnly) return false; commitEditing(); const before = serializeBook(book); const res = fn(); const after = serializeBook(book);
      if (res === false || before === after) return res !== false; undo.push({ snap: { before, after } }); snapBytes += before.length + after.length; redo.length = 0; trim();
      calc.reset(); recalcFilter(); grid.relayout(); drawCharts(); drawTabs(); syncBar(); syncTools(); changed(); paintStats(); return true;
    }
    function doUndo() { commitEditing(); const e = undo.pop(); if (!e) return; if (e.tx) { afterTx(e.tx.apply('undo', book)); } else { snapBytes -= e.snap.before.length + e.snap.after.length; replaceBook(parseBook(e.snap.before), true); changed(); } redo.push(e); selectionChanged({ scroll: false }); }
    function doRedo() { commitEditing(); const e = redo.pop(); if (!e) return; if (e.tx) { afterTx(e.tx.apply('redo', book)); } else { replaceBook(parseBook(e.snap.after), true); changed(); } undo.push(e); if (e.snap) snapBytes += e.snap.before.length + e.snap.after.length; selectionChanged({ scroll: false }); }
    function pushSnap(before) { const after = serializeBook(book); if (before === after) return false; undo.push({ snap: { before, after } }); snapBytes += before.length + after.length; redo.length = 0; trim(); changed(); return true; }
    function edit(fn) {                                          // cell-level change set
      if (denied()) return false; const tx = new Tx(book); const ok = fn(tx); commitTx(tx); if (ok === false) { toast('This sheet is full, so some cells were not changed. Delete some cells first.', false); return false; } return true;
    }

    // ------------------------------------------------------------ writing cells
    const rawOf = (v) => { if (v === null || v === undefined) return ''; if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'; if (typeof v === 'number') return String(v); if (typeof v === 'string') { if (v === '') return ''; const p = parseLiteral(v); return typeof p.v !== 'string' || v[0] === '=' || v[0] === "'" ? `'${v}` : v; } return ''; };
    function setCell(c, r, text) {
      const list = dvList(sheet(), c, r); if (list && text !== '' && !list.some((x) => x.toLowerCase() === String(text).toLowerCase())) { toast(`Choose one of the listed values: ${list.slice(0, 6).join(', ')}${list.length > 6 ? '…' : ''}`, false); return; }
      edit((tx) => { if (mergeOf(c, r) && !(mergeOf(c, r).c1 === c && mergeOf(c, r).r1 === r)) return true; return tx.raw(si, ref(c, r), text); }); }
    function clearContents() { const g = range(); edit((tx) => { for (const k of Object.keys(sheet().cells)) { const p = parseRef(k); if (p.col >= g.c1 && p.col <= g.c2 && p.row >= g.r1 && p.row <= g.r2) tx.raw(si, k, ''); } return true; }); }
    function clearFormats() { const g = range(); edit((tx) => { for (const k of Object.keys(sheet().sty)) { const p = parseRef(k); if (p.col >= g.c1 && p.col <= g.c2 && p.row >= g.r1 && p.row <= g.r2) tx.style(si, k, -1); } return true; }); }
    /** Cells a format applies to: the selection, but a whole column/row/sheet only covers what is in use. */
    function formatCells(g) {
      const out = []; const u = usedRange(sheet()); let { c1, c2, r1, r2 } = g;
      if (sel.kind === 'all') { if (!u) return out; c2 = Math.min(c2, u.c2); r2 = Math.min(r2, u.r2); } else if (sel.kind === 'row') { c2 = Math.min(c2, Math.max(u?.c2 ?? 0, 25)); }
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) out.push(ref(c, r)); return out;
    }
    function applyStyle(patchOf) {                                 // patchOf(currentStyle) -> patch
      const g = range(); const keys = formatCells(g);
      return edit((tx) => { let ok = true; for (const k of keys) { const cur = sheet().sty[k] ?? -1; const idx = patchStyle(book, cur, patchOf(cur >= 0 ? book.styles[cur] : {}, k)); if (idx !== cur && tx.style(si, k, idx) === false) ok = false; } return ok; });
    }
    const pointMode = () => { if (!editing) return false; const v = grid.editor.value; return v[0] === '=' && /[=+\-*/^&(,<>;:]$/.test(v.slice(0, grid.editor.selectionStart ?? v.length)); };
    function applyStyleIndex(idx) { const keys = formatCells(range()); edit((tx) => { let ok = true; for (const k of keys) if (tx.style(si, k, idx) === false) ok = false; return ok; }); }
    const activeStyle = () => { const k = ref(activeCell().c, activeCell().r); return styleOf(book, sheet(), k) ?? {}; };
    const toggle = (field) => { const on = !activeStyle()[field]; applyStyle(() => ({ [field]: on ? 1 : null })); };
    function setBorders(mode) {
      const g = range();
      applyStyle((st, k) => {
        const p = parseRef(k); if (mode === 'none') return { bd: null };
        const bd = { ...(st.bd ?? {}) };
        if (mode === 'all') { bd.r = 1; bd.b = 1; if (p.row === g.r1) bd.t = 1; if (p.col === g.c1) bd.l = 1; }
        else if (mode === 'outer') { if (p.row === g.r1) bd.t = 1; if (p.row === g.r2) bd.b = 1; if (p.col === g.c1) bd.l = 1; if (p.col === g.c2) bd.r = 1; }
        else if (mode === 'bottom') bd.b = 1; else if (mode === 'top') bd.t = 1;
        return { bd };
      });
    }
    function changeDecimals(delta) {
      const st = activeStyle(); const ac = activeCell(); const v = calc.value(si, ac.c, ac.r); const imp = impliedFormat(rawAt(ac.c, ac.r));
      let nf = st.nf ?? imp ?? (typeof v === 'number' ? { k: 'num', d: Math.min(6, (String(v).split('.')[1] ?? '').length), th: false } : null); if (!nf || !['num', 'cur', 'pct'].includes(nf.k)) return;
      const d = Math.max(0, Math.min(10, (nf.d ?? (nf.k === 'pct' ? 0 : 2)) + delta)); applyStyle(() => ({ nf: { ...nf, d } }));
    }

    // ------------------------------------------------------------ editing in the cell
    const fbar = h('input', { class: 'sx-fx', 'aria-label': 'Formula bar', placeholder: 'Type a value or a formula such as =SUM(A1:A5)', autocomplete: 'off', spellcheck: 'false', ...(readOnly ? { readonly: true } : {}) });
    const nameBox = h('input', { class: 'sx-ref', 'aria-label': 'Selected cell. Type a cell such as C12 and press Enter to go there', value: 'A1', autocomplete: 'off', spellcheck: 'false' });
    const hint = h('div', { class: 'sx-hint fine muted', 'aria-live': 'polite' });
    const acBox = h('ul', { class: 'sx-ac', role: 'listbox', 'aria-label': 'Functions', hidden: true }); let acIdx = -1; let acItems = [];
    const live = h('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
    const stats = h('span', { class: 'sx-stats fine muted' });
    function syncBar() {
      const g = range(); const ac = activeCell(); nameBox.value = isMulti() && sel.kind === 'cell' ? rangeLabel(g) : sel.kind === 'col' ? `${colName(g.c1)}${g.c1 !== g.c2 ? `:${colName(g.c2)}` : ''}` : sel.kind === 'row' ? `${g.r1 + 1}${g.r1 !== g.r2 ? `:${g.r2 + 1}` : ''}` : sel.kind === 'all' ? 'All' : ref(ac.c, ac.r);
      if (!editing) fbar.value = rawAt(ac.c, ac.r); hideAc(); hint.textContent = '';
    }
    function startEdit(initial, opts = {}) {
      if (denied()) return; commitEditing(); const ac = activeCell(); const el = grid.editor;
      editing = { c: ac.c, r: ac.r, typed: initial !== undefined, original: rawAt(ac.c, ac.r) }; el.value = initial ?? editing.original; el.hidden = false;
      const st = styleOf(book, sheet(), ref(ac.c, ac.r)); el.classList.toggle('sx-wrap', Boolean(st?.wr)); grid.scrollTo(ac.c, ac.r); grid.placeEditor(ac.c, ac.r); el.focus({ preventScroll: true });
      const n = el.value.length; el.setSelectionRange(n, n); sizeEditor(); fbar.value = el.value; void opts;
    }
    function sizeEditor() {
      const el = grid.editor; const { W } = grid.stageSize(); const lines = el.value.split('\n'); const longest = Math.max(...lines.map((x) => x.length)); const st = el.style;
      st.width = `${Math.min(W - 60, Math.max(parseFloat(st.minWidth) || 80, longest * 8.4 + 24))}px`; st.height = `${Math.max(parseFloat(st.minHeight) || 0, lines.length * 20 + 6, parseFloat(st.height) || 0)}px`;
    }
    function commitEditing(move) {
      if (!editing) return; const e = editing; editing = null; const el = grid.editor; const val = el.value; el.hidden = true; el.value = ''; hideAc();
      setCell(e.c, e.r, val);
      if (move) {                                                     // after a run of Tabs, Enter returns to the column the run began in
        const tab = move[1] === 0 && move[0] === 1; const origin = tabOrigin; if (tab && tabOrigin === null) tabOrigin = e.c; else if (!tab) tabOrigin = null;
        moveBy(move[0], move[1], {}); if (!tab && origin !== null && move[1] === 1) setSel({ c: origin, r: activeCell().r });
      } else { syncBar(); grid.refresh(); }
    }
    function cancelEditing() { if (!editing) return; editing = null; grid.editor.hidden = true; grid.editor.value = ''; hideAc(); syncBar(); grid.refresh(); focusGrid(); }
    let tabOrigin = null;
    const focusGrid = () => grid.el.focus({ preventScroll: true });
    grid.editor.addEventListener('input', () => { fbar.value = grid.editor.value; sizeEditor(); acUpdate(grid.editor); });
    grid.editor.addEventListener('blur', () => { setTimeout(() => { if (editing && document.activeElement !== grid.editor && !popup.open && !acBox.contains(document.activeElement)) commitEditing(); }, 0); });
    grid.editor.addEventListener('keydown', (e) => {
      if (acKey(e, grid.editor)) return;
      if (e.key === 'Enter' && !e.altKey) { e.preventDefault(); commitEditing([0, e.shiftKey ? -1 : 1]); focusGrid(); }
      else if (e.key === 'Enter' && e.altKey) { e.preventDefault(); const t = grid.editor; const i = t.selectionStart; t.setRangeText('\n', i, t.selectionEnd, 'end'); t.dispatchEvent(new Event('input')); }
      else if (e.key === 'Tab') { e.preventDefault(); commitEditing([e.shiftKey ? -1 : 1, 0]); focusGrid(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancelEditing(); }
      else if (editing?.typed && !grid.editor.value.startsWith('=') && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); const d = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key]; commitEditing(d); focusGrid(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); commitEditing(); sess.save({ manual: true }); }
    });
    grid.editor.addEventListener('mousedown', (e) => e.stopPropagation());
    fbar.addEventListener('focus', () => { if (readOnly) return; if (editing) return; });
    fbar.addEventListener('input', () => { if (editing) { grid.editor.value = fbar.value; sizeEditor(); } acUpdate(fbar); });
    fbar.addEventListener('keydown', (e) => {
      if (acKey(e, fbar)) return;
      if (e.key === 'Enter') { e.preventDefault(); const ac = activeCell(); if (editing) editing = null, grid.editor.hidden = true; setCell(ac.c, ac.r, fbar.value); moveBy(0, 1, {}); focusGrid(); }
      else if (e.key === 'Escape') { e.preventDefault(); if (editing) cancelEditing(); fbar.value = rawAt(activeCell().c, activeCell().r); hideAc(); focusGrid(); }
    });
    nameBox.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { syncBar(); focusGrid(); } if (e.key !== 'Enter') return; e.preventDefault();
      const g = parseRange(nameBox.value.trim().toUpperCase()); if (!g) { toast('Type a cell such as C12, or a range such as A1:C5.', false); return; }
      setSel({ c: g.c1, r: g.r1 }, { c: g.c2, r: g.r2 }); focusGrid();
    });
    nameBox.addEventListener('focus', () => nameBox.select());

    // function autocomplete + signature hint
    function acUpdate(input) {
      const v = input.value; const pos = input.selectionStart ?? v.length; if (v[0] !== '=') { hideAc(); hint.textContent = ''; return; }
      const before = v.slice(0, pos); const m = /([A-Za-z][A-Za-z0-9.]*)$/.exec(before); const prev = m ? before[m.index - 1] : undefined;
      if (m && (prev === undefined || /[=+\-*/^&(,<>;: ]/.test(prev))) {
        const q = m[1].toUpperCase(); acItems = FUNCTION_NAMES.filter((n) => n.startsWith(q)).slice(0, 7);
        if (acItems.length && !(acItems.length === 1 && acItems[0] === q && before.endsWith('('))) { acIdx = -1; showAc(input, m); } else hideAc();
      } else hideAc();
      let depth = 0; let name = ''; for (let i = before.length - 1; i >= 0; i--) { const ch = before[i]; if (ch === ')') depth++; else if (ch === '(') { if (depth === 0) { name = /([A-Za-z][A-Za-z0-9.]*)$/.exec(before.slice(0, i))?.[1]?.toUpperCase() ?? ''; break; } depth--; } }
      hint.textContent = FUNCTION_DOCS[name] ? `${FUNCTION_DOCS[name][0]} — ${FUNCTION_DOCS[name][1]}` : '';
    }
    function showAc(input, m) {
      put(acBox, ...acItems.map((n, i) => h('li', { role: 'option', 'aria-selected': String(i === acIdx), class: i === acIdx ? 'sx-on' : '' }, h('button', { type: 'button', tabindex: '-1', onmousedown: (e) => { e.preventDefault(); acAccept(input, m, n); } }, h('b', {}, n), h('span', { class: 'fine muted' }, ` ${FUNCTION_DOCS[n][1]}`)))));
      acBox.hidden = false; acBox._m = m; acBox._input = input;
    }
    function hideAc() { acBox.hidden = true; acIdx = -1; acItems = []; }
    function acAccept(input, m, name) { const pos = input.selectionStart ?? input.value.length; const start = pos - m[1].length; input.setRangeText(`${name}(`, start, pos, 'end'); input.dispatchEvent(new Event('input')); input.focus(); }
    function acKey(e, input) {
      if (acBox.hidden || !acItems.length) return false;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); acIdx = (acIdx + (e.key === 'ArrowDown' ? 1 : -1) + acItems.length) % acItems.length; showAc(input, acBox._m); return true; }
      if (e.key === 'Tab' || (e.key === 'Enter' && acIdx >= 0)) { e.preventDefault(); acAccept(input, acBox._m, acItems[Math.max(0, acIdx)]); return true; }
      if (e.key === 'Escape') { e.preventDefault(); hideAc(); return true; }
      return false;
    }

    // ------------------------------------------------------------ movement
    const hiddenCol = (c) => hidden.cols.has(c), hiddenRow = (r) => hidden.rows.has(r);
    function moveBy(dc, dr, { extend = false, jump = false } = {}) {
      const ac = activeCell(); const base = extend ? { ...sel.f } : { ...ac }; let { c, r } = base;
      const filled = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS && rawAt(x, y) !== '';
      if (!extend) { const m = mergeOf(ac.c, ac.r); if (m) { if (dc > 0) c = m.c2; if (dc < 0) c = m.c1; if (dr > 0) r = m.r2; if (dr < 0) r = m.r1; } }
      if (jump) {
        const startFilled = filled(c, r), nextFilled = filled(c + dc, r + dr);
        if (startFilled && nextFilled) { while (filled(c + dc, r + dr)) { c += dc; r += dr; } }
        else { c += dc; r += dr; while (c >= 0 && r >= 0 && c < COLS && r < ROWS && !filled(c, r)) { c += dc; r += dr; } }
        c = Math.max(0, Math.min(COLS - 1, c)); r = Math.max(0, Math.min(ROWS - 1, r));
      } else { do { c += dc; r += dr; } while (((dc && hiddenCol(c)) || (dr && hiddenRow(r))) && c >= 0 && c < COLS && r >= 0 && r < ROWS); c = Math.max(0, Math.min(COLS - 1, c)); r = Math.max(0, Math.min(ROWS - 1, r)); }
      if (extend) { sel = { ...sel, f: { c, r }, kind: sel.kind === 'all' ? 'cell' : sel.kind }; selectionChanged(); } else setSel({ c, r });
    }
    /** Enter / Tab inside a multi-cell selection walk through it instead of leaving it. */
    function stepWithin(forward, horizontal) {
      const g = range(); const ac = activeCell(); let { c, r } = ac;
      if (horizontal) { c += forward ? 1 : -1; if (c > g.c2) { c = g.c1; r += 1; } if (c < g.c1) { c = g.c2; r -= 1; } if (r > g.r2) r = g.r1; if (r < g.r1) r = g.r2; }
      else { r += forward ? 1 : -1; if (r > g.r2) { r = g.r1; c += 1; } if (r < g.r1) { r = g.r2; c -= 1; } if (c > g.c2) c = g.c1; if (c < g.c1) c = g.c2; }
      sel = { ...sel, a: { c, r } }; selectionChanged();
    }

    // ------------------------------------------------------------ clipboard
    const sourceCells = (g) => { const rows = []; for (let r = g.r1; r <= g.r2; r++) { const row = []; for (let c = g.c1; c <= g.c2; c++) { const k = ref(c, r); row.push({ raw: sheet().cells[k], sty: sheet().sty[k] !== undefined ? book.styles[sheet().sty[k]] : null, v: calc.value(si, c, r), text: cellText(book, si, calc, c, r) }); } rows.push(row); } return rows; };
    function copyData(cut) {
      const g = range(); const u = usedRange(sheet()); const gg = { ...g, c2: Math.min(g.c2, u?.c2 ?? 0), r2: Math.min(g.r2, u?.r2 ?? 0) }; if (!u) return null;
      const cells = sourceCells(gg); const text = toTSV(cells.map((row) => row.map((x) => x.text)));
      clipboardMemory = { text: normNL(text), cells, c0: gg.c1, r0: gg.r1, si, cut: Boolean(cut), range: gg };
      const html = `<table>${cells.map((row) => `<tr>${row.map((x) => `<td>${String(x.text).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]))}</td>`).join('')}</tr>`).join('')}</table>`;
      return { text, html };
    }
    function doCopy(cut, e) {
      if (cut && readOnly) { toast('This spreadsheet is read only.', false); return; } const d = copyData(cut); if (!d) { if (e) { e.clipboardData.setData('text/plain', ''); e.preventDefault(); } return; }
      if (e) { e.clipboardData.setData('text/plain', d.text); e.clipboardData.setData('text/html', d.html); e.preventDefault(); }
      else navigator.clipboard?.writeText(d.text).catch(() => toast('Your browser did not allow copying. Use Ctrl+C.', false));
      toast(cut ? 'Cut. Choose where to paste.' : 'Copied.');
    }
    function pasteInto(text, mode) {
      if (denied()) return; const g = range(); const ac = { c: g.c1, r: g.r1 }; const mem = clipboardMemory && normNL(text) === clipboardMemory.text ? clipboardMemory : null;
      let grid2; // rows of { raw, sty }
      if (mem) {
        grid2 = mem.cells.map((row, i) => row.map((x, j) => {
          if (mode === 'values') return { raw: rawOf(x.v), sty: null };
          const raw = x.raw !== undefined && x.raw[0] === '=' && !mem.cut ? `=${translateFormula(x.raw.slice(1), ac.r + i - (mem.r0 + i), ac.c + j - (mem.c0 + j))}` : x.raw;
          return { raw: raw ?? '', sty: x.sty };
        }));
      } else grid2 = parseTSV(text).map((row) => row.map((v) => ({ raw: mode === 'values' ? v : v, sty: null })));
      if (!grid2.length) return;
      const h1 = grid2.length, w1 = Math.max(...grid2.map((x) => x.length));
      const tg = (h1 === 1 && w1 === 1 && isMulti()) ? { c1: g.c1, c2: g.c2, r1: g.r1, r2: g.r2 } : { c1: ac.c, r1: ac.r, c2: Math.min(COLS - 1, ac.c + w1 - 1), r2: Math.min(ROWS - 1, ac.r + h1 - 1) };
      const ok = edit((tx) => {
        let good = true;
        for (let r = tg.r1; r <= tg.r2; r++) for (let c = tg.c1; c <= tg.c2; c++) {
          const cell = grid2[(r - tg.r1) % h1]?.[(c - tg.c1) % w1]; if (!cell) continue; const k = ref(c, r);
          if (!tx.raw(si, k, cell.raw ?? '')) good = false;
          if (mode !== 'values' && mem) { if (tx.style(si, k, cell.sty ? internStyle(book, cell.sty) : -1) === false) good = false; }
        }
        if (mem?.cut && mode !== 'values') { const s0 = mem.range; for (let r = s0.r1; r <= s0.r2; r++) for (let c = s0.c1; c <= s0.c2; c++) if (!(c >= tg.c1 && c <= tg.c2 && r >= tg.r1 && r <= tg.r2) && mem.si === si) { tx.raw(si, ref(c, r), ''); tx.style(si, ref(c, r), -1); } clipboardMemory = { ...mem, cut: false }; }
        return good;
      });
      if (ok) setSel({ c: tg.c1, r: tg.r1 }, { c: tg.c2, r: tg.r2 });
    }
    async function pasteFromClipboard(mode) {
      try { const t = await navigator.clipboard.readText(); pasteInto(t, mode); } catch { toast('Your browser keeps the clipboard private here. Press Ctrl+V to paste.', false); }
    }
    document.addEventListener('copy', onCopy); document.addEventListener('cut', onCopy); document.addEventListener('paste', onPaste);
    const inGrid = (e) => root.contains(e.target) && (e.target === grid.el || grid.el.contains(e.target) && e.target !== grid.editor);
    function onCopy(e) { if (!inGrid(e) || editing) return; doCopy(e.type === 'cut', e); }
    function onPaste(e) { if (!inGrid(e) || editing) return; const t = e.clipboardData?.getData('text/plain'); if (t === undefined) return; e.preventDefault(); pasteInto(t, 'all'); }

    // ------------------------------------------------------------ fill
    const fillPoint = () => (readOnly || editing || sel.kind === 'all' ? null : { c: range().c2, r: range().r2 });
    function fillDown(right) {
      const g = range(); if (readOnly) return;
      if (!right) { if (g.r1 === g.r2) return; edit((tx) => { fillRange(book, si, { ...g, r2: g.r1 }, { ...g, r1: g.r1 + 1 }, 'down', tx, false); return true; }); }
      else { if (g.c1 === g.c2) return; edit((tx) => { fillRange(book, si, { ...g, c2: g.c1 }, { ...g, c1: g.c1 + 1 }, 'right', tx, false); return true; }); }
    }
    function fillTo(c, r) {
      if (!fillSrc) return; const s = fillSrc; const dr = r > s.r2 ? r - s.r2 : r < s.r1 ? r - s.r1 : 0, dc = c > s.c2 ? c - s.c2 : c < s.c1 ? c - s.c1 : 0;
      let tgt = null, dir = null;
      if (Math.abs(dr) >= Math.abs(dc) && dr) { dir = dr > 0 ? 'down' : 'up'; tgt = dr > 0 ? { c1: s.c1, c2: s.c2, r1: s.r2 + 1, r2: r } : { c1: s.c1, c2: s.c2, r1: r, r2: s.r1 - 1 }; }
      else if (dc) { dir = dc > 0 ? 'right' : 'left'; tgt = dc > 0 ? { r1: s.r1, r2: s.r2, c1: s.c2 + 1, c2: c } : { r1: s.r1, r2: s.r2, c1: c, c2: s.c1 - 1 }; }
      fillSrc.tgt = tgt; fillSrc.dir = dir; const u = tgt ? { c1: Math.min(s.c1, tgt.c1), c2: Math.max(s.c2, tgt.c2), r1: Math.min(s.r1, tgt.r1), r2: Math.max(s.r2, tgt.r2) } : s;
      sel = { a: { c: u.c1, r: u.r1 }, f: { c: u.c2, r: u.r2 }, kind: 'cell' }; grid.refresh();
    }
    function fillEnd() {
      const s = fillSrc; fillSrc = null; if (!s?.tgt) { selectionChanged({ scroll: false }); return; }
      edit((tx) => { fillRange(book, si, { c1: s.c1, c2: s.c2, r1: s.r1, r2: s.r2 }, s.tgt, s.dir, tx); return true; }); selectionChanged({ scroll: false });
    }

    // ------------------------------------------------------------ rows, columns, sort, filter
    const lineSel = (axis) => { const g = range(); return axis === 'r' ? [g.r1, g.r2 - g.r1 + 1] : [g.c1, g.c2 - g.c1 + 1]; };
    function insertAt(axis, after) { const [start, n] = lineSel(axis); const at = after ? start + n : start; structural(() => { const res = insertLines(book, si, axis, at, n); if (!res.ok) { toast(res.why, false); return false; } return true; }); }
    function deleteSel(axis) {
      const [start, n] = lineSel(axis); const label = axis === 'r' ? `row${n > 1 ? 's' : ''} ${start + 1}${n > 1 ? `–${start + n}` : ''}` : `column${n > 1 ? 's' : ''} ${colName(start)}${n > 1 ? `–${colName(start + n - 1)}` : ''}`;
      const go = () => structural(() => deleteLines(book, si, axis, start, n).ok);
      let any = false; for (const k of Object.keys(sheet().cells)) { const p = parseRef(k); if ((axis === 'r' ? p.row : p.col) >= start && (axis === 'r' ? p.row : p.col) < start + n) { any = true; break; } }
      if (!any) { go(); return; }
      dialog({ title: `Delete ${label}?`, body: h('p', {}, 'The cells in it are removed and formulas that point at them show #REF!. You can undo this.'), actions: [{ label: 'Delete', cls: 'primary', on: () => { go(); } }, { label: 'Cancel', focus: true }] });
    }
    const looksLikeHeader = (g) => { if (g.r2 <= g.r1) return false; for (let c = g.c1; c <= g.c2; c++) { const a = calc.value(si, c, g.r1), b = calc.value(si, c, g.r1 + 1); if (typeof a === 'string' && a !== '' && typeof b === 'number') return true; } return false; };
    function sortSel(dir, colOverride) {
      let g = range(); if (!isMulti() || (sel.kind !== 'cell' && sel.kind !== 'col')) { const a = activeCell(); g = dataRegion(sheet(), a.c, a.r); }
      if (sel.kind === 'col') { const u = usedRange(sheet()); g = { ...g, r2: Math.min(g.r2, u?.r2 ?? 0) }; }
      const col = Math.max(g.c1, Math.min(g.c2, colOverride ?? activeCell().c)); const body = { ...g, r1: g.r1 + (looksLikeHeader(g) ? 1 : 0) };
      if (body.r2 <= body.r1) { toast('Select two or more rows of data to sort.', false); return; }
      edit((tx) => { sortRange(book, si, body, col, dir, tx, calc); return true; }); setSel({ c: g.c1, r: g.r1 }, { c: g.c2, r: g.r2 });
    }
    function toggleFilter() {
      if (sheet().filter) { structural(() => { sheet().filter = null; return true; }); return; }
      let g = range(); if (!isMulti()) { const a = activeCell(); g = dataRegion(sheet(), a.c, a.r); } if (g.c1 === g.c2 && g.r1 === g.r2 && rawAt(g.c1, g.r1) === '') { toast('Click inside your data first, or select the cells to filter.', false); return; }
      structural(() => { sheet().filter = { c1: g.c1, c2: g.c2, r1: g.r1, r2: g.r2, hide: {} }; return true; });
    }
    function filterMenu(c, anchor) {
      const f = sheet().filter; if (!f) return; const counts = new Map();
      for (let r = f.r1 + 1; r <= f.r2; r++) { const t = cellText(book, si, calc, c, r); counts.set(t, (counts.get(t) ?? 0) + 1); }
      const values = [...counts.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })); const off = new Set(f.hide[c] ?? []);
      const search = h('input', { class: 'sx-search', type: 'search', placeholder: 'Search values', 'aria-label': 'Search values' });
      const list = h('div', { class: 'sx-flist' });
      const draw = () => { const q = search.value.trim().toLowerCase(); put(list, ...values.filter((v) => v.toLowerCase().includes(q)).map((v) => { const cb = h('input', { type: 'checkbox', ...(off.has(v) ? {} : { checked: true }) }); cb.addEventListener('change', () => { if (cb.checked) off.delete(v); else off.add(v); }); return h('label', { class: 'sx-fv' }, cb, h('span', {}, v === '' ? '(Blank)' : v), h('span', { class: 'fine muted' }, String(counts.get(v)))); })); };
      search.addEventListener('input', draw); draw();
      popup.show(anchor, (close) => h('div', { class: 'sx-fmenu' },
        h('div', { class: 'sx-frow' }, btn('Sort A→Z', () => { close(); sortSel('asc', c); }, 'link'), btn('Sort Z→A', () => { close(); sortSel('desc', c); }, 'link')),
        search, h('div', { class: 'sx-frow' }, btn('Select all', () => { off.clear(); draw(); }, 'link'), btn('Clear', () => { values.forEach((v) => off.add(v)); draw(); }, 'link')), list,
        h('div', { class: 'sx-frow end' }, btn('Cancel', close), btn('Apply', () => { close(); structural(() => { if (off.size) sheet().filter.hide[c] = [...off]; else delete sheet().filter.hide[c]; return true; }); }, 'primary'))), { wide: true });
    }
    function freeze(mode) {
      const ac = activeCell(); structural(() => { sheet().freeze = mode === 'none' ? { r: 0, c: 0 } : mode === 'row' ? { r: 1, c: sheet().freeze.c } : mode === 'col' ? { r: sheet().freeze.r, c: 1 } : { r: Math.min(30, ac.r), c: Math.min(10, ac.c) }; return true; });
    }
    function hideLines(axis, show) {
      const [start, n] = lineSel(axis); const key = axis === 'r' ? 'hr' : 'hc'; structural(() => { const set = new Set(sheet()[key]); for (let i = start - (show ? 1 : 0); i < start + n + (show ? 1 : 0); i++) { if (i < 0) continue; if (show) set.delete(i); else set.add(i); } sheet()[key] = [...set].sort((a, b) => a - b); return true; });
    }
    function merge(on) { const g = range(); structural(() => { if (on) mergeRange(book, si, g, new Tx(book)); else unmergeRange(book, si, g); return true; }); }
    function autofit(c) {
      const ctx2 = document.createElement('canvas').getContext('2d'); ctx2.font = `14px ${getComputedStyle(root).fontFamily}`; let w = 40;
      for (let r = 0; r < ROWS; r++) { const t = cellText(book, si, calc, c, r); if (t) w = Math.max(w, ctx2.measureText(t.split('\n')[0]).width + 24); }
      structural(() => { sheet().cw[c] = Math.max(MIN_COL_W, Math.min(MAX_COL_W, Math.ceil(w))); return true; });
    }

    // ------------------------------------------------------------ find and replace
    const findBar = h('div', { class: 'sx-find', role: 'search', hidden: true });
    const fq = h('input', { type: 'search', 'aria-label': 'Find', placeholder: 'Find' }), fr = h('input', { type: 'text', 'aria-label': 'Replace with', placeholder: 'Replace with', ...(readOnly ? { disabled: true } : {}) });
    const fCase = h('input', { type: 'checkbox', 'aria-label': 'Match case' }), fWhole = h('input', { type: 'checkbox', 'aria-label': 'Match entire cell' }), fForm = h('input', { type: 'checkbox', 'aria-label': 'Search in formulas' }), fAll = h('input', { type: 'checkbox', 'aria-label': 'All sheets' });
    const fCount = h('span', { class: 'fine muted', role: 'status', 'aria-live': 'polite' }); let found = [], foundAt = -1;
    function testFn() {
      const q = fq.value; if (!q) return null; const cs = fCase.checked; const needle = cs ? q : q.toLowerCase();
      return (t) => { const x = cs ? t : t.toLowerCase(); return fWhole.checked ? x === needle : x.includes(needle); };
    }
    function runFind(jump = true) {
      const ok = testFn(); found = []; matches = new Set(); if (!ok) { fCount.textContent = ''; grid.refresh(); return; }
      const sheets = fAll.checked ? book.sheets.map((_, i) => i) : [si];
      for (const s of sheets) for (const k of Object.keys(book.sheets[s].cells).sort((a, b) => (parseRef(a).row - parseRef(b).row) || (parseRef(a).col - parseRef(b).col))) { const p = parseRef(k); const t = fForm.checked ? book.sheets[s].cells[k] : cellText(book, s, calc, p.col, p.row); if (ok(t)) { found.push({ s, c: p.col, r: p.row }); if (s === si) matches.add(k); } }
      fCount.textContent = found.length ? `${found.length} found` : 'No matches'; foundAt = -1; if (jump && found.length) goFind(1); else grid.refresh();
    }
    function goFind(dir) {
      if (!found.length) return; foundAt = (foundAt + dir + found.length) % found.length; const m = found[foundAt];
      if (m.s !== si) switchSheet(m.s); setSel({ c: m.c, r: m.r }); fCount.textContent = `${foundAt + 1} of ${found.length}`;
    }
    function replaceIn(text) {
      const q = fq.value; const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), `g${fCase.checked ? '' : 'i'}`);
      return fWhole.checked ? fr.value : text.replace(re, () => fr.value);
    }
    function replaceOne() {
      if (readOnly || !found.length) return; if (foundAt < 0) { goFind(1); return; } const m = found[foundAt]; const k = ref(m.c, m.r); const cur = book.sheets[m.s].cells[k] ?? '';
      if (m.s !== si) return; edit((tx) => tx.raw(m.s, k, replaceIn(cur))); runFind(false); if (found.length) { foundAt = Math.min(foundAt, found.length) - 1; goFind(1); }
    }
    function replaceAll() {
      if (readOnly || !found.length) return; let n = 0;
      edit((tx) => { for (const m of found) { const k = ref(m.c, m.r); const cur = book.sheets[m.s].cells[k] ?? ''; const next = replaceIn(cur); if (next !== cur) { tx.raw(m.s, k, next); n++; } } return true; });
      toast(n ? `Replaced in ${n} cell${n === 1 ? '' : 's'}.` : 'Nothing to replace. Matches that come from a formula’s result can’t be replaced.', n > 0); runFind(false);
    }
    put(findBar, fq, fr, h('label', { class: 'sx-chk' }, fCase, ' Aa'), h('label', { class: 'sx-chk' }, fWhole, ' Whole cell'), h('label', { class: 'sx-chk' }, fForm, ' Formulas'), h('label', { class: 'sx-chk' }, fAll, ' All sheets'),
      btn('Previous', () => goFind(-1), '', { 'aria-label': 'Previous match' }), btn('Next', () => goFind(1), '', { 'aria-label': 'Next match' }), ...(readOnly ? [] : [btn('Replace', replaceOne), btn('Replace all', replaceAll)]), fCount, btn('Close', () => closeFind(), 'link'));
    fq.addEventListener('input', () => runFind()); [fCase, fWhole, fForm, fAll].forEach((x) => x.addEventListener('change', () => runFind()));
    fq.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); goFind(e.shiftKey ? -1 : 1); } if (e.key === 'Escape') closeFind(); }); fr.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); replaceOne(); } if (e.key === 'Escape') closeFind(); });
    function openFind() { findBar.hidden = false; fq.focus(); fq.select(); if (fq.value) runFind(false); }
    function closeFind() { findBar.hidden = true; matches = new Set(); found = []; grid.refresh(); focusGrid(); }

    // ------------------------------------------------------------ popups and menus
    const popup = (() => {
      let el = null, off = null; const api2 = { open: false };
      const close = () => { if (!el) return; el.remove(); el = null; api2.open = false; document.removeEventListener('pointerdown', off, true); document.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', close); };
      let sideCb = null;
      const onKey = (e) => {
        if (sideCb && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); e.stopPropagation(); const cb = sideCb; close(); cb(e.key === 'ArrowRight' ? 1 : -1); return; }
        if (e.key === 'Escape') { e.stopPropagation(); close(); focusGrid(); return; }
        if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && el) { const items = [...el.querySelectorAll('button:not([disabled])')]; if (!items.length || e.target.matches('input')) return; e.preventDefault(); const i = items.indexOf(document.activeElement); items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus(); }
      };
      api2.close = close;
      api2.show = (anchor, build, { wide = false, at, onSide } = {}) => {
        close(); sideCb = onSide ?? null; const content = build(close); el = h('div', { class: `sx-pop${wide ? ' wide' : ''}`, role: 'menu' }, content); document.body.append(el); api2.open = true;
        const r = at ?? anchor.getBoundingClientRect(); const pw = el.offsetWidth, ph = el.offsetHeight; const x = at ? at.x : r.left, y = at ? at.y : r.bottom + 4;
        el.style.left = `${Math.max(8, Math.min(innerWidth - pw - 8, x))}px`; el.style.top = `${Math.max(8, y + ph > innerHeight - 8 ? (at ? Math.max(8, innerHeight - ph - 8) : r.top - ph - 4) : y)}px`;
        off = (e) => { if (!el?.contains(e.target) && !(anchor?.contains?.(e.target))) close(); }; document.addEventListener('pointerdown', off, true); document.addEventListener('keydown', onKey, true); window.addEventListener('resize', close);
        (el.querySelector('button, input') ?? el).focus?.({ preventScroll: true }); return close;
      };
      return api2;
    })();
    const giveBack = () => setTimeout(() => { if (!popup.open && !editing && !document.querySelector('.ovl') && !findBar.contains(document.activeElement)) focusGrid(); }, 0);
    const menuList = (items) => (close) => h('div', { class: 'sx-menu' }, ...items.map((it) => it === '-' ? h('hr', {}) : h('button', { type: 'button', role: 'menuitem', class: '', disabled: it.disabled, onclick: () => { close(); it.on(); giveBack(); } }, h('span', { class: 'sx-ck', 'aria-hidden': 'true' }, it.checked ? '✓' : ''), h('span', { class: 'sx-lb' }, it.label), it.hint ? h('span', { class: 'fine muted sx-hk' }, it.hint) : null)));
    const menuBtn = (anchor, items, opts) => popup.show(anchor, menuList(items.filter(Boolean)), opts);
    function colorMenu(anchor, field, label) {
      popup.show(anchor, (close) => {
        const pick = (hex) => { close(); applyStyle(() => ({ [field]: hex })); };
        const custom = h('input', { type: 'color', 'aria-label': `Custom ${label}`, value: activeStyle()[field] ?? (field === 'fc' ? '#000000' : '#ffff00') }); custom.addEventListener('change', () => pick(custom.value));
        return h('div', { class: 'sx-colors' }, h('button', { type: 'button', class: 'sx-none', onclick: () => pick(null) }, field === 'fc' ? 'Automatic' : 'No fill'),
          h('div', { class: 'sx-sw' }, ...SWATCHES.map((hex) => { const b = h('button', { type: 'button', 'aria-label': hex, title: hex, onclick: () => pick(hex) }); b.style.background = hex; return b; })), h('label', { class: 'sx-custom' }, 'Custom ', custom));
      });
    }
    const nfItems = () => {
      const cur = activeStyle().nf?.k ?? 'gen'; const set = (nf) => () => applyStyle(() => ({ nf }));
      return [{ label: 'General', checked: cur === 'gen', on: set(null) }, { label: 'Number  1,234.56', checked: cur === 'num', on: set({ k: 'num', d: 2 }) }, { label: 'Currency  $1,234.56', checked: cur === 'cur', on: set({ k: 'cur', d: 2, sym: activeStyle().nf?.sym ?? '$' }) }, { label: 'Percent  12%', checked: cur === 'pct', on: set({ k: 'pct', d: 0 }) }, '-',
        { label: 'Date  2026-03-27', checked: cur === 'date', on: set({ k: 'date', f: 'iso' }) }, { label: 'Date  03/27/2026', on: set({ k: 'date', f: 'us' }) }, { label: 'Date  27/03/2026', on: set({ k: 'date', f: 'eu' }) }, { label: 'Date  Mar 27, 2026', on: set({ k: 'date', f: 'long' }) }, { label: 'Time  14:30:00', checked: cur === 'time', on: set({ k: 'time' }) }, { label: 'Date and time', checked: cur === 'datetime', on: set({ k: 'datetime', f: 'iso' }) }, { label: 'Plain text', checked: cur === 'text', on: set({ k: 'text' }) }, '-',
        ...SYMBOLS.slice(0, 4).map((s) => ({ label: `Currency symbol ${s}`, checked: activeStyle().nf?.k === 'cur' && (activeStyle().nf.sym ?? '$') === s, on: set({ k: 'cur', d: activeStyle().nf?.d ?? 2, sym: s }) })), '-', { label: 'More formats…', on: () => formatDialog() }];
    };
    function formatDialog() {
      const nf = activeStyle().nf ?? { k: 'gen' }; const cat = field({ id: 'sx-cat', label: 'Category', value: nf.k, options: [['gen', 'General'], ['num', 'Number'], ['cur', 'Currency'], ['pct', 'Percent'], ['date', 'Date'], ['time', 'Time'], ['datetime', 'Date and time'], ['text', 'Plain text']] });
      const dec = field({ id: 'sx-dec', label: 'Decimal places', type: 'number', value: String(nf.d ?? (nf.k === 'pct' ? 0 : 2)) }); const sym = field({ id: 'sx-sym', label: 'Currency symbol', value: nf.sym ?? '$', options: SYMBOLS.map((s) => [s, s]) });
      const dform = field({ id: 'sx-df', label: 'Date style', value: nf.f ?? 'iso', options: [['iso', '2026-03-27'], ['us', '03/27/2026'], ['eu', '27/03/2026'], ['long', 'Mar 27, 2026']] });
      const ac = activeCell(); const sample = h('p', { class: 'sx-sample', 'aria-live': 'polite' });
      const build = () => { const k = cat.input.value; const d = Math.max(0, Math.min(10, Number(dec.input.value) || 0)); return k === 'gen' ? null : { k, ...(['num', 'cur', 'pct'].includes(k) ? { d } : {}), ...(k === 'cur' ? { sym: sym.input.value } : {}), ...(k === 'date' || k === 'datetime' ? { f: dform.input.value } : {}) }; };
      const upd = () => { const v = calc.value(si, ac.c, ac.r); sample.textContent = `Sample: ${typeof v === 'number' ? formatValue(v, build() ?? undefined) : cellText(book, si, calc, ac.c, ac.r)}`; }; [cat, dec, sym, dform].forEach((f) => f.input.addEventListener('input', upd)); upd();
      dialog({ title: 'Format cells', body: h('div', { class: 'sx-fdlg' }, cat.el, dec.el, sym.el, dform.el, sample), actions: [{ label: 'Apply', cls: 'primary', on: () => { const nf2 = build(); applyStyle(() => ({ nf: nf2 })); } }, { label: 'Cancel' }] });
    }
    function contextMenu(x, y, t) {
      const ro = readOnly || sheet().lock; let items;
      if (t.kind === 'cell') { const g = range(); if (!(t.c >= g.c1 && t.c <= g.c2 && t.r >= g.r1 && t.r <= g.r2)) setSel({ c: t.c, r: t.r }, { c: t.c, r: t.r }, 'cell', { scroll: false }); }
      else if (t.kind === 'col') { const g = range(); if (!(sel.kind === 'col' && t.c >= g.c1 && t.c <= g.c2)) setSel({ c: t.c, r: 0 }, { c: t.c, r: ROWS - 1 }, 'col', { scroll: false }); }
      else if (t.kind === 'row') { const g = range(); if (!(sel.kind === 'row' && t.r >= g.r1 && t.r <= g.r2)) setSel({ c: 0, r: t.r }, { c: COLS - 1, r: t.r }, 'row', { scroll: false }); }
      const base = [{ label: 'Cut', hint: 'Ctrl+X', disabled: ro, on: () => doCopy(true) }, { label: 'Copy', hint: 'Ctrl+C', on: () => doCopy(false) }, { label: 'Paste', hint: 'Ctrl+V', disabled: ro, on: () => pasteFromClipboard('all') }, { label: 'Paste values only', disabled: ro, on: () => pasteFromClipboard('values') }, '-'];
      const [rs, rn] = lineSel('r'), [cs, cn] = lineSel('c');
      if (t.kind === 'col') items = [...base, { label: `Insert ${cn} column${cn > 1 ? 's' : ''} left`, disabled: ro, on: () => insertAt('c', false) }, { label: `Insert ${cn} column${cn > 1 ? 's' : ''} right`, disabled: ro, on: () => insertAt('c', true) }, { label: `Delete column${cn > 1 ? 's' : ''}`, disabled: ro, on: () => deleteSel('c') }, { label: 'Clear contents', disabled: ro, on: clearContents }, '-', { label: 'Sort A→Z', disabled: ro, on: () => sortSel('asc') }, { label: 'Sort Z→A', disabled: ro, on: () => sortSel('desc') }, '-', { label: `Hide column${cn > 1 ? 's' : ''}`, disabled: ro, on: () => hideLines('c', false) }, { label: 'Unhide hidden columns here', disabled: ro, on: () => hideLines('c', true) }, { label: 'Reset width', disabled: ro, on: () => structural(() => { for (let c = cs; c < cs + cn; c++) delete sheet().cw[c]; return true; }) }];
      else if (t.kind === 'row') items = [...base, { label: `Insert ${rn} row${rn > 1 ? 's' : ''} above`, disabled: ro, on: () => insertAt('r', false) }, { label: `Insert ${rn} row${rn > 1 ? 's' : ''} below`, disabled: ro, on: () => insertAt('r', true) }, { label: `Delete row${rn > 1 ? 's' : ''}`, disabled: ro, on: () => deleteSel('r') }, { label: 'Clear contents', disabled: ro, on: clearContents }, '-', { label: `Hide row${rn > 1 ? 's' : ''}`, disabled: ro, on: () => hideLines('r', false) }, { label: 'Unhide hidden rows here', disabled: ro, on: () => hideLines('r', true) }, { label: 'Reset height', disabled: ro, on: () => structural(() => { for (let r = rs; r < rs + rn; r++) delete sheet().rh[r]; return true; }) }];
      else items = [...base, { label: 'Insert row above', disabled: ro, on: () => insertAt('r', false) }, { label: 'Insert row below', disabled: ro, on: () => insertAt('r', true) }, { label: 'Insert column left', disabled: ro, on: () => insertAt('c', false) }, { label: 'Insert column right', disabled: ro, on: () => insertAt('c', true) }, { label: 'Delete row', disabled: ro, on: () => deleteSel('r') }, { label: 'Delete column', disabled: ro, on: () => deleteSel('c') }, '-', { label: 'Clear contents', hint: 'Delete', disabled: ro, on: clearContents }, { label: 'Clear formatting', disabled: ro, on: clearFormats }, '-', ...cellExtras(ro), '-', { label: 'Sort A→Z by this column', disabled: ro, on: () => sortSel('asc') }, { label: 'Sort Z→A by this column', disabled: ro, on: () => sortSel('desc') }, '-', { label: 'Format cells…', disabled: ro, on: formatDialog }];
      popup.show(null, menuList(items), { at: { x, y } });
    }

    // ------------------------------------------------------------ charts
    const chartEls = new Map(); let chartSi = -1; let selChart = null;
    function selectChart(id) { if (selChart === id) return; selChart = id; for (const [k, f] of chartEls) f.el.classList.toggle('sx-sel', k === id); if (id) chartEls.get(id)?.el.focus({ preventScroll: true }); }
    function drawCharts() {
      if (chartSi !== si) { for (const f of chartEls.values()) f.el.remove(); chartEls.clear(); chartSi = si; selChart = null; }
      const z = zoom(); const ids = new Set(sheet().charts.map((c) => c.id));
      for (const [k, f] of chartEls) if (!ids.has(k)) { f.el.remove(); chartEls.delete(k); }
      for (const ch of sheet().charts) {
        let f = chartEls.get(ch.id); if (!f) { f = makeFrame(ch.id); chartEls.set(ch.id, f); grid.chartLayer.append(f.el); }
        const st = f.el.style; st.left = `${ch.x * z}px`; st.top = `${ch.y * z}px`; st.width = `${ch.w * z}px`; st.height = `${ch.h * z}px`; f.el.setAttribute('aria-label', `Chart: ${ch.title || ch.type}`);
        f.el.classList.toggle('sx-sel', selChart === ch.id); drawChart(f.svg, ch, chartData(book, si, calc, ch), ch.w * z, ch.h * z);
      }
    }
    function makeFrame(cid) {
      const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svgEl.setAttribute('class', 'sx-chsvg');
      const chart = () => sheet().charts.find((x) => x.id === cid);
      const bar = h('div', { class: 'sx-chbar' }, h('button', { type: 'button', 'aria-label': 'Edit chart', title: 'Edit chart', onclick: () => chartDialog(chart()) }, '✎'), h('button', { type: 'button', 'aria-label': 'Delete chart', title: 'Delete chart', onclick: () => deleteChart(cid) }, '✕'));
      const grip = h('div', { class: 'sx-grip', 'aria-hidden': 'true' });
      const el = h('div', { class: 'sx-chart', tabindex: '0', role: 'group' }, svgEl, bar, grip);
      el.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.sx-chbar') || e.button > 0) return; selectChart(cid); e.preventDefault(); el.focus({ preventScroll: true }); const ch = chart(); if (!ch || denied2()) return;
        const mode = e.target === grip ? 'resize' : 'move'; const before = serializeBook(book); const z = zoom(); const o = { x: ch.x, y: ch.y, w: ch.w, h: ch.h }; const x0 = e.clientX, y0 = e.clientY; el.setPointerCapture(e.pointerId);
        const move = (ev) => { const dx = (ev.clientX - x0) / z, dy = (ev.clientY - y0) / z; if (mode === 'move') { ch.x = Math.max(0, Math.round(o.x + dx)); ch.y = Math.max(0, Math.round(o.y + dy)); } else { ch.w = Math.max(160, Math.min(1200, Math.round(o.w + dx))); ch.h = Math.max(120, Math.min(900, Math.round(o.h + dy))); } drawCharts(); };
        const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); pushSnap(before); }; el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
      });
      el.addEventListener('keydown', (e) => {
        const ch = chart(); if (!ch) return;
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteChart(cid); } else if (e.key === 'Enter') { e.preventDefault(); chartDialog(ch); } else if (e.key === 'Escape') { selectChart(null); focusGrid(); }
        else if (e.key.startsWith('Arrow') && !denied2()) { e.preventDefault(); const before = serializeBook(book); const d = e.shiftKey ? 1 : 10; if (e.key === 'ArrowLeft') ch.x = Math.max(0, ch.x - d); if (e.key === 'ArrowRight') ch.x += d; if (e.key === 'ArrowUp') ch.y = Math.max(0, ch.y - d); if (e.key === 'ArrowDown') ch.y += d; drawCharts(); pushSnap(before); }
      });
      return { el, svg: svgEl };
    }
    const denied2 = () => readOnly || sheet().lock;
    function deleteChart(cid) { structural(() => { sheet().charts = sheet().charts.filter((x) => x.id !== cid); selChart = null; return true; }); focusGrid(); }
    function chartDialog(ch) {
      if (denied()) return; const g = range(); const ac = activeCell();
      const def = ch ? ch.range : isMulti() ? rangeLabel(g) : usedRange(sheet()) ? rangeLabel(dataRegion(sheet(), ac.c, ac.r)) : 'A1:B5';
      const type = field({ id: 'sx-ct', label: 'Chart type', value: ch?.type ?? 'column', options: [['column', 'Column'], ['bar', 'Bar'], ['line', 'Line'], ['pie', 'Pie']] });
      const title = field({ id: 'sx-ctt', label: 'Title', value: ch?.title ?? '', maxlength: 80 });
      const rng = field({ id: 'sx-ctr', label: 'Data range', value: def, hint: 'For example A1:C6. The first column holds the labels and the first row the names.' });
      const head = h('input', { type: 'checkbox', id: 'sx-cth', ...(ch?.head === false ? {} : { checked: true }) }), legend = h('input', { type: 'checkbox', id: 'sx-ctl', ...(ch?.legend === false ? {} : { checked: true }) });
      dialog({ title: ch ? 'Edit chart' : 'Insert chart', body: h('div', { class: 'sx-fdlg' }, type.el, title.el, rng.el, h('label', { class: 'sx-chk', for: 'sx-cth' }, head, ' First row holds the series names'), h('label', { class: 'sx-chk', for: 'sx-ctl' }, legend, ' Show a legend')),
        actions: [{ label: ch ? 'Save' : 'Insert', cls: 'primary', on: () => {
          const gg = parseRange(rng.input.value.trim().toUpperCase()); if (!gg) return rng.error('Type a range such as A1:C6.');
          const spec = { type: type.input.value, title: title.input.value.trim(), range: rangeLabel(gg), head: head.checked, legend: legend.checked };
          structural(() => { if (ch) Object.assign(sheet().charts.find((x) => x.id === ch.id) ?? {}, spec); else { if (sheet().charts.length >= 20) { toast('A sheet holds up to 20 charts.', false); return false; } const z = zoom(); const id = `c${Date.now().toString(36)}`; sheet().charts.push({ id, ...spec, x: Math.round(grid.el.scrollLeft / z + 60), y: Math.round(grid.el.scrollTop / z + 40), w: 420, h: 280 }); selChart = id; } return true; });
          if (selChart) chartEls.get(selChart)?.el.focus({ preventScroll: true }); } }, { label: 'Cancel' }] });
    }

    // ------------------------------------------------------------ rules: conditional formatting and dropdown lists
    const PRESETS = { red: ['Red fill', { bg: '#f4c7c3', fc: '#7a1c14' }], green: ['Green fill', { bg: '#cdebd2', fc: '#14532d' }], yellow: ['Yellow fill', { bg: '#fdeeb0', fc: '#5c4400' }], blue: ['Blue fill', { bg: '#cfe0fc', fc: '#12306b' }], redtext: ['Red text', { fc: '#c5221f' }], greentext: ['Green text', { fc: '#188038' }] };
    const COND = [['gt', 'Greater than'], ['lt', 'Less than'], ['between', 'Between'], ['eq', 'Equal to'], ['contains', 'Text contains'], ['empty', 'Is empty'], ['notempty', 'Is not empty']];
    function ruleDialog(kind) {
      if (readOnly) { toast('This spreadsheet is read only.', false); return; }
      const isCf = kind === 'cf'; const g0 = range(); const def = rangeLabel(isMulti() || sel.kind !== 'cell' ? { c1: g0.c1, c2: g0.c2, r1: g0.r1, r2: Math.min(g0.r2, Math.max(g0.r1, usedRange(sheet())?.r2 ?? g0.r2)) } : { c1: g0.c1, c2: g0.c1, r1: 0, r2: Math.max(9, usedRange(sheet())?.r2 ?? 9) });
      const rng = field({ id: 'sx-rr', label: 'Apply to range', value: def });
      const list = h('ul', { class: 'sx-rules', 'aria-label': 'Existing rules' });
      const draw = () => put(list, ...(isCf ? sheet().cf : sheet().dv).map((r, i) => h('li', {}, h('span', {}, `${rangeLabel(r.g)}: ${isCf ? `${COND.find((x) => x[0] === r.type)[1]}${r.a ? ` ${r.a}` : ''}${r.type === 'between' ? ` and ${r.b}` : ''}` : r.list.slice(0, 5).join(', ') + (r.list.length > 5 ? '…' : '')}`),
        btn('Remove', () => { structural(() => { (isCf ? sheet().cf : sheet().dv).splice(i, 1); return true; }, { force: true }); draw(); }, 'link', { 'aria-label': `Remove rule ${i + 1}` }))), (isCf ? sheet().cf : sheet().dv).length ? null : h('li', { class: 'muted fine' }, 'No rules yet.'));
      draw();
      let body;
      if (isCf) {
        const cond = field({ id: 'sx-rc', label: 'When the cell is', value: 'gt', options: COND }); const a = field({ id: 'sx-ra', label: 'Value' }); const b = field({ id: 'sx-rb', label: 'and' }); const fmt = field({ id: 'sx-rf', label: 'Then show it as', value: 'red', options: Object.entries(PRESETS).map(([k, v]) => [k, v[0]]) });
        const vis = () => { const t = cond.input.value; a.el.hidden = t === 'empty' || t === 'notempty'; b.el.hidden = t !== 'between'; }; cond.input.addEventListener('change', vis); vis();
        body = h('div', { class: 'sx-fdlg' }, list, rng.el, cond.el, a.el, b.el, fmt.el); ruleDialog.add = () => { const gg = parseRange(rng.input.value.trim().toUpperCase()); if (!gg) return rng.error('Type a range such as B2:B20.'); const t = cond.input.value; if ((t === 'gt' || t === 'lt' || t === 'between') && Number.isNaN(Number(a.input.value))) return a.error('Type a number.'); if (t === 'between' && Number.isNaN(Number(b.input.value))) return b.error('Type a number.'); if ((t === 'contains' || t === 'eq') && !a.input.value) return a.error('Type a value.');
          structural(() => { sheet().cf.push({ g: gg, type: t, a: a.input.value.slice(0, 100), b: b.input.value.slice(0, 100), ...PRESETS[fmt.input.value][1] }); return true; }, { force: true }); draw(); return false; };
      } else {
        const items = field({ id: 'sx-rl', label: 'Allowed values', rows: 4, value: '', hint: 'One per line, or separated by commas.' });
        body = h('div', { class: 'sx-fdlg' }, list, rng.el, items.el); ruleDialog.add = () => { const gg = parseRange(rng.input.value.trim().toUpperCase()); if (!gg) return rng.error('Type a range such as C2:C20.'); const vals = [...new Set(items.input.value.split(/[\n,]/).map((x) => x.trim()).filter(Boolean))].slice(0, 100); if (!vals.length) return items.error('Type at least one value.');
          structural(() => { sheet().dv.push({ g: gg, list: vals }); return true; }, { force: true }); items.input.value = ''; draw(); return false; };
      }
      dialog({ title: isCf ? 'Conditional formatting' : 'Dropdown list', body, wide: true, actions: [{ label: 'Add rule', cls: 'primary', keep: true, on: () => ruleDialog.add() }, { label: 'Close' }] });
    }
    const cfDialog = () => { if (denied()) return; ruleDialog('cf'); }, dvDialog = () => { if (denied()) return; ruleDialog('dv'); };
    function dvMenu(anchor) {
      const a = activeCell(); const list = dvList(sheet(), a.c, a.r); if (!list) return;
      menuBtn(anchor, list.map((x) => ({ label: x, checked: rawAt(a.c, a.r) === x, on: () => { setCell(a.c, a.r, x); focusGrid(); } })));
    }

    // ------------------------------------------------------------ notes and links
    const keyOfActive = () => ref(activeCell().c, activeCell().r);
    function noteDialog() {
      if (denied()) return; const k = keyOfActive(); const f = field({ id: 'sx-nt', label: `Note on ${k}`, rows: 4, value: sheet().notes[k] ?? '', maxlength: 1000 });
      dialog({ title: 'Cell note', body: f.el, actions: [{ label: 'Save', cls: 'primary', on: () => { const t = f.input.value.trim(); structural(() => { if (t) sheet().notes[k] = t; else delete sheet().notes[k]; return true; }); } }, ...(sheet().notes[k] ? [{ label: 'Delete note', on: () => { structural(() => { delete sheet().notes[k]; return true; }); } }] : []), { label: 'Cancel' }] });
    }
    function linkDialog() {
      if (denied()) return; const k = keyOfActive(); const f = field({ id: 'sx-lk', label: `Link for ${k}`, value: sheet().links[k] ?? '', hint: 'A web address (https://…) or an e-mail link (mailto:…). Leave empty to remove the link. Ctrl+click a linked cell to open it.' });
      dialog({ title: 'Cell link', body: f.el, actions: [{ label: 'Save', cls: 'primary', on: () => { const t = f.input.value.trim(); if (t && !safeLink(t)) return f.error('Use a web address that starts with https:// or http://, or mailto:'); structural(() => { if (t) sheet().links[k] = safeLink(t); else delete sheet().links[k]; return true; }); } }, { label: 'Cancel' }] });
    }
    function cellExtras(ro) {
      const k = keyOfActive(); const u = linkOf(sheet(), k);
      return [{ label: 'Insert link…', disabled: ro, on: linkDialog }, ...(u ? [{ label: 'Open link', on: () => window.open(u, '_blank', 'noopener,noreferrer') }] : []), { label: sheet().notes[k] ? 'Edit note…' : 'Add note…', disabled: ro, on: noteDialog }, ...(sheet().notes[k] ? [{ label: 'Delete note', disabled: ro, on: () => structural(() => { delete sheet().notes[k]; return true; }) }] : [])];
    }

    // ------------------------------------------------------------ sheet options: tab colour, page setup, copy, zoom
    function tabColor(anchor, i) {
      popup.show(anchor, (close) => { const pick = (hex) => { close(); structural(() => { book.sheets[i].tab = hex; return true; }); };
        return h('div', { class: 'sx-colors' }, h('button', { type: 'button', class: 'sx-none', onclick: () => pick(null) }, 'No colour'), h('div', { class: 'sx-sw' }, ...SWATCHES.slice(8, 26).map((hex) => { const b = h('button', { type: 'button', 'aria-label': hex, title: hex, onclick: () => pick(hex) }); b.style.background = hex; return b; }))); });
    }
    function pageSetup() {
      const s = sheet(); const orient = field({ id: 'sx-po', label: 'Orientation', value: s.print.orient, options: [['portrait', 'Portrait'], ['landscape', 'Landscape']] }); const fit = h('input', { type: 'checkbox', id: 'sx-pf', ...(s.print.fit ? { checked: true } : {}) });
      dialog({ title: `Page setup: ${s.name}`, body: h('div', { class: 'sx-fdlg' }, orient.el, h('label', { class: 'sx-chk', for: 'sx-pf' }, fit, ' Shrink to fit the page width')), actions: [{ label: 'Save', cls: 'primary', on: () => { structural(() => { sheet().print = { fit: fit.checked, orient: orient.input.value }; return true; }, { force: true }); } }, { label: 'Cancel' }] });
    }
    async function makeCopy() {
      commitEditing(); const r = await api.call('drive.files.create', { space: meta.space, ...(meta.client_id ? { client: meta.client_id } : {}), ...(meta.project_id ? { project: meta.project_id } : {}), ...(meta.folder_id ? { folder: meta.folder_id } : {}), name: `Copy of ${meta.name}`.slice(0, 200), kind: 'document', mime_type: MIME, body: getBody() });
      if (!r.ok) { toast(r.message ?? 'Couldn’t make a copy.', false); return; } toast('Copy created. Opening it…'); await sess.save({ manual: true }); ctx.go?.(`#/sheet/${r.data[0].id}`);
    }
    const zoomLbl = h('button', { type: 'button', class: 'sx-zlbl', 'aria-label': 'Reset zoom to 100%', title: 'Reset zoom', onclick: () => setZoom(100) }, '100%');
    const zoomBox = h('div', { class: 'sx-zoom', role: 'group', 'aria-label': 'Zoom' }, h('button', { type: 'button', 'aria-label': 'Zoom out', title: 'Zoom out', onclick: () => setZoom(zoomPct - 10) }, '−'), zoomLbl, h('button', { type: 'button', 'aria-label': 'Zoom in', title: 'Zoom in', onclick: () => setZoom(zoomPct + 10) }, '+'));
    function setZoom(p) {
      zoomPct = Math.max(50, Math.min(200, Math.round(p / 10) * 10)); zoomLbl.textContent = `${zoomPct}%`; try { localStorage.setItem(`sx.zoom.${id}`, String(zoomPct)); } catch { /* storage unavailable */ }
      grid.relayout(); if (editing) grid.placeEditor(editing.c, editing.r); drawCharts();
    }
    zoomLbl.textContent = `${zoomPct}%`;

    // ------------------------------------------------------------ keyboard
    grid.el.addEventListener('keydown', (e) => {
      if (editing || e.target !== grid.el) return; const mod = e.ctrlKey || e.metaKey; const k = e.key;
      if (mod && k.toLowerCase() === 's') { e.preventDefault(); sess.save({ manual: true }); return; }
      if (mod && !e.shiftKey && k.toLowerCase() === 'z') { e.preventDefault(); doUndo(); return; } if (mod && (k.toLowerCase() === 'y' || (e.shiftKey && k.toLowerCase() === 'z'))) { e.preventDefault(); doRedo(); return; }
      if (mod && k.toLowerCase() === 'a') { e.preventDefault(); ed.selectAll(); return; } if (mod && k.toLowerCase() === 'f') { e.preventDefault(); openFind(); return; } if (mod && k.toLowerCase() === 'h') { e.preventDefault(); openFind(); fr.focus(); return; }
      if (mod && k.toLowerCase() === 'd') { e.preventDefault(); fillDown(false); return; } if (mod && k.toLowerCase() === 'r') { e.preventDefault(); fillDown(true); return; }
      if (mod && ['b', 'i', 'u'].includes(k.toLowerCase())) { e.preventDefault(); toggle(k.toLowerCase()); return; }
      if (mod && k === '\\') { e.preventDefault(); clearFormats(); return; }
      if (mod && (k === 'c' || k === 'x' || k === 'v')) return;                             // the browser's copy / cut / paste events do the work
      if (mod && k === 'Home') { e.preventDefault(); setSel({ c: 0, r: 0 }); return; }
      if (mod && k === 'End') { e.preventDefault(); const u = usedRange(sheet()); setSel({ c: u?.c2 ?? 0, r: u?.r2 ?? 0 }); return; }
      const dirs = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
      if (dirs[k]) { tabOrigin = null; e.preventDefault(); moveBy(dirs[k][0], dirs[k][1], { extend: e.shiftKey, jump: mod }); return; }
      if (k === 'Enter') { e.preventDefault(); if (isMulti() && sel.kind === 'cell') stepWithin(!e.shiftKey, false); else if (e.shiftKey) moveBy(0, -1); else startEdit(); return; }
      if (k === 'F2') { e.preventDefault(); startEdit(); return; }
      if (k === 'Tab') { e.preventDefault(); if (isMulti() && sel.kind === 'cell') stepWithin(!e.shiftKey, true); else moveBy(e.shiftKey ? -1 : 1, 0); return; }
      if (k === 'Home') { e.preventDefault(); setSel({ c: 0, r: activeCell().r }); return; }
      if (k === 'End') { e.preventDefault(); const u = usedRange(sheet()); setSel({ c: u?.c2 ?? 0, r: activeCell().r }); return; }
      if (k === 'PageDown' || k === 'PageUp') { e.preventDefault(); const n = grid.visibleRows() * (k === 'PageUp' ? -1 : 1); const f = e.shiftKey ? sel.f : activeCell(); const r = Math.max(0, Math.min(ROWS - 1, f.r + n)); if (e.shiftKey) { sel = { ...sel, f: { c: f.c, r } }; selectionChanged(); } else setSel({ c: f.c, r }); return; }
      if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); clearContents(); return; }
      if (k === 'Escape') { if (clipboardMemory?.cut) clipboardMemory = { ...clipboardMemory, cut: false }; return; }
      if (!mod && !e.altKey && k.length === 1) { e.preventDefault(); startEdit(k); }
    });

    // ------------------------------------------------------------ toolbar
    const tb = (label, child, on, extra = {}) => h('button', { type: 'button', class: 'sx-tb', 'aria-label': label, title: label, onclick: (e) => { on(e); giveBack(); }, ...(readOnly && !extra.alwaysOn ? { disabled: true } : {}), ...extra.attrs }, child);
    const letter = (ch, cls) => h('span', { class: `sx-glyph ${cls ?? ''}`, 'aria-hidden': 'true' }, ch);
    const bBold = tb('Bold (Ctrl+B)', letter('B', 'b'), () => toggle('b')), bItal = tb('Italic (Ctrl+I)', letter('I', 'i'), () => toggle('i')), bUnder = tb('Underline (Ctrl+U)', letter('U', 'u'), () => toggle('u')), bStrike = tb('Strikethrough', letter('S', 's'), () => toggle('st'));
    const barFc = h('i', { class: 'sx-bar' }), barBg = h('i', { class: 'sx-bar' });
    const bFc = tb('Text colour', h('span', { class: 'sx-colbtn' }, letter('A'), barFc), (e) => colorMenu(e.currentTarget, 'fc', 'text colour'));
    const bBg = tb('Fill colour', h('span', { class: 'sx-colbtn' }, svg(ICON.fill), barBg), (e) => colorMenu(e.currentTarget, 'bg', 'fill colour'));
    const sizeSel = h('select', { class: 'sx-fs', 'aria-label': 'Font size', ...(readOnly ? { disabled: true } : {}) }, ...FONT_SIZES.map((n) => h('option', { value: String(n) }, String(n)))); sizeSel.value = '14';
    sizeSel.addEventListener('change', () => { const n = Number(sizeSel.value); applyStyle(() => ({ fs: n === 14 ? null : n })); focusGrid(); });
    const hBtns = { l: tb('Align left', svg(ICON.l), () => applyStyle(() => ({ ha: 'l' }))), c: tb('Align centre', svg(ICON.c), () => applyStyle(() => ({ ha: 'c' }))), r: tb('Align right', svg(ICON.r), () => applyStyle(() => ({ ha: 'r' }))) };
    const vBtn = tb('Vertical alignment', svg(ICON.m), (e) => menuBtn(e.currentTarget, [{ label: 'Top', checked: activeStyle().va === 't', on: () => applyStyle(() => ({ va: 't' })) }, { label: 'Middle', checked: activeStyle().va === 'm', on: () => applyStyle(() => ({ va: 'm' })) }, { label: 'Bottom', checked: !activeStyle().va || activeStyle().va === 'b', on: () => applyStyle(() => ({ va: 'b' })) }]));
    const bWrap = tb('Wrap text', svg(ICON.wrap), () => toggle('wr'));
    const bBorder = tb('Borders', svg(ICON.border), (e) => menuBtn(e.currentTarget, [{ label: 'All borders', on: () => setBorders('all') }, { label: 'Outer borders', on: () => setBorders('outer') }, { label: 'Bottom border', on: () => setBorders('bottom') }, { label: 'Top border', on: () => setBorders('top') }, { label: 'No borders', on: () => setBorders('none') }]));
    const bMerge = tb('Merge cells', svg(ICON.merge), (e) => menuBtn(e.currentTarget, [{ label: 'Merge cells', disabled: !isMulti(), on: () => merge(true) }, { label: 'Unmerge', disabled: !sheet().merges.some((m) => { const g = range(); return !(m.c2 < g.c1 || m.c1 > g.c2 || m.r2 < g.r1 || m.r1 > g.r2); }), on: () => merge(false) }]));
    const bFmt = tb('Number format', h('span', { class: 'sx-fmtlbl' }, '123 ▾'), (e) => menuBtn(e.currentTarget, nfItems(), { wide: true }));
    const bCur = tb('Format as currency', letter('$'), () => applyStyle(() => ({ nf: { k: 'cur', d: 2, sym: activeStyle().nf?.sym ?? '$' } }))), bPct = tb('Format as percent', letter('%'), () => applyStyle(() => ({ nf: { k: 'pct', d: 0 } })));
    const bDec1 = tb('Fewer decimal places', letter('.0', 'sm'), () => changeDecimals(-1)), bDec2 = tb('More decimal places', letter('.00', 'sm'), () => changeDecimals(1));
    const bFreeze = tb('Freeze panes', svg(ICON.freeze), (e) => menuBtn(e.currentTarget, [{ label: 'Freeze first row', checked: sheet().freeze.r === 1 && !sheet().freeze.c, on: () => freeze('row') }, { label: 'Freeze first column', checked: sheet().freeze.c === 1 && !sheet().freeze.r, on: () => freeze('col') }, { label: 'Freeze up to this cell', on: () => freeze('cell') }, { label: 'Unfreeze', disabled: !sheet().freeze.r && !sheet().freeze.c, on: () => freeze('none') }]));
    const bSort = tb('Sort', svg(ICON.sort), (e) => menuBtn(e.currentTarget, [{ label: 'Sort A→Z by this column', on: () => sortSel('asc') }, { label: 'Sort Z→A by this column', on: () => sortSel('desc') }]));
    const bFilter = tb('Filter', icon('filter'), () => toggleFilter());
    const bFind = tb('Find and replace (Ctrl+F)', icon('search'), () => openFind(), { alwaysOn: true });
    const bInsert = tb('Insert: chart, link, note, conditional formatting, dropdown list', h('span', { class: 'sx-fmtlbl' }, 'Insert ▾'), (e) => menuBtn(e.currentTarget, [{ label: 'Chart…', on: () => chartDialog() }, { label: 'Link…', on: () => linkDialog() }, { label: sheet().notes[ref(activeCell().c, activeCell().r)] ? 'Edit note…' : 'Note…', on: () => noteDialog() }, '-', { label: 'Conditional formatting…', on: () => cfDialog() }, { label: 'Dropdown list (data validation)…', on: () => dvDialog() }]));
    const bClearFmt = tb('Clear formatting (Ctrl+\\)', svg(ICON.clear), () => clearFormats());
    const bPaint = tb('Paint format: copy the look of this cell, then click where to use it', svg(ICON.paint), () => { painter = painter ? null : { idx: sheet().sty[ref(activeCell().c, activeCell().r)] ?? -1 }; grid.el.classList.toggle('painting', Boolean(painter)); if (painter) toast('Now click the cells to format.'); });
    const bMore = tb('More: vertical alignment, paint format, clear formatting, format cells', h('span', { class: 'sx-fmtlbl' }, '⋯'), (e) => menuBtn(e.currentTarget, [{ label: 'Align top', checked: activeStyle().va === 't', on: () => applyStyle(() => ({ va: 't' })) }, { label: 'Align middle', checked: activeStyle().va === 'm', on: () => applyStyle(() => ({ va: 'm' })) }, { label: 'Align bottom', checked: !activeStyle().va || activeStyle().va === 'b', on: () => applyStyle(() => ({ va: 'b' })) }, '-', { label: 'Paint format', on: () => bPaint.click() }, { label: 'Clear formatting', hint: 'Ctrl+\\', on: () => clearFormats() }, { label: 'Format cells…', on: () => formatDialog() }]));
    const bUndo = tb('Undo (Ctrl+Z)', icon('undo'), () => doUndo()), bRedo = tb('Redo (Ctrl+Y)', icon('redo'), () => doRedo());
    const sep = () => h('span', { class: 'sx-sep', role: 'separator' });
    const tools = h('div', { class: 'sx-tools', role: 'toolbar', 'aria-label': 'Formatting' }, bUndo, bRedo, sep(), sizeSel, bBold, bItal, bUnder, bStrike, bFc, bBg, sep(), bBorder, bMerge, hBtns.l, hBtns.c, hBtns.r, bWrap, sep(), bFmt, bCur, bPct, bDec1, bDec2, sep(), bFreeze, bSort, bFilter, bFind, sep(), bInsert, bMore);
    function syncTools() {
      const st = activeStyle(); const press = (b, on) => b.setAttribute('aria-pressed', String(Boolean(on)));
      press(bBold, st.b); press(bItal, st.i); press(bUnder, st.u); press(bStrike, st.st); press(bWrap, st.wr); press(bFilter, sheet().filter); for (const k of ['l', 'c', 'r']) press(hBtns[k], st.ha === k);
      sizeSel.value = String(st.fs ?? 14); if (![...sizeSel.options].some((o) => o.value === sizeSel.value)) sizeSel.value = '14';
      barFc.style.background = st.fc ?? 'var(--text)'; barBg.style.background = st.bg ?? 'transparent'; bUndo.disabled = readOnly || !undo.length; bRedo.disabled = readOnly || !redo.length;
    }
    const pasteBtn = null; void pasteBtn;

    // ------------------------------------------------------------ sheets (tabs)
    const tabsEl = h('div', { class: 'sx-tabs', role: 'tablist', 'aria-label': 'Sheets' }); const memoSel = new Map();
    function switchSheet(i) {
      if (i === si || !book.sheets[i]) return; commitEditing(); memoSel.set(si, { sel, sx: grid.el.scrollLeft, sy: grid.el.scrollTop }); si = i; recalcFilter(); const m = memoSel.get(i);
      sel = m ? m.sel : { a: { c: 0, r: 0 }, f: { c: 0, r: 0 }, kind: 'cell' }; matches = new Set(); grid.relayout(); grid.el.scrollLeft = m?.sx ?? 0; grid.el.scrollTop = m?.sy ?? 0; drawTabs(); syncBar(); syncTools(); grid.refresh(); paintStats(); paintCount(); if (!findBar.hidden && fq.value) runFind(false);
    }
    const tabStyle = (s, b) => { if (s.tab) { b.style.borderBottom = `4px solid ${s.tab}`; } return b; };
    function drawTabs() {
      put(tabsEl, ...book.sheets.map((s, i) => tabStyle(s, h('button', { type: 'button', role: 'tab', 'aria-selected': String(i === si), tabindex: i === si ? 0 : -1, class: '', onclick: () => switchSheet(i), ondblclick: () => renameDialog(i), oncontextmenu: (e) => { e.preventDefault(); tabMenu(e.currentTarget, i, { x: e.clientX, y: e.clientY }); } }, s.lock ? [svg('M7 11V8a5 5 0 0110 0v3M5 11h14v10H5z'), ' ', s.name] : s.name))),
        !readOnly && book.sheets.length < MAX_SHEETS ? btn('+', addSheet, '', { 'aria-label': 'Add a sheet', title: 'Add a sheet' }) : null,
        h('button', { type: 'button', class: 'sx-tabmore', 'aria-label': 'Sheet options', title: 'Sheet options', onclick: (e) => tabMenu(e.currentTarget, si) }, '⋯'));
    }
    function tabMenu(anchor, i, at) {
      const ro = readOnly; const n = book.sheets.length;
      menuBtn(anchor, [{ label: 'Rename', disabled: ro, on: () => renameDialog(i) }, { label: 'Duplicate', disabled: ro || n >= MAX_SHEETS, on: () => structural(() => { si = duplicateSheet(book, i); return true; }) }, { label: book.sheets[i].lock ? 'Unprotect sheet' : 'Protect sheet', disabled: readOnly, on: () => structural(() => { book.sheets[i].lock = !book.sheets[i].lock; return true; }, { force: true }) }, { label: 'Tab colour…', disabled: ro, on: () => tabColor(anchor, i) }, { label: 'Move left', disabled: ro || i === 0, on: () => moveSheet(i, -1) }, { label: 'Move right', disabled: ro || i === n - 1, on: () => moveSheet(i, 1) }, '-', { label: 'Delete', disabled: ro || n < 2, on: () => deleteSheet(i) }], at ? { at } : undefined);
    }
    function moveSheet(i, d) { structural(() => { const [s] = book.sheets.splice(i, 1); book.sheets.splice(i + d, 0, s); si = i + d; memoSel.clear(); return true; }); }
    function addSheet() { structural(() => { let n = book.sheets.length + 1; while (book.sheets.some((s) => s.name === `Sheet ${n}`)) n += 1; book.sheets.push(emptySheet(`Sheet ${n}`)); si = book.sheets.length - 1; sel = { a: { c: 0, r: 0 }, f: { c: 0, r: 0 }, kind: 'cell' }; return true; }); }
    function renameDialog(i) {
      if (readOnly) return; const f = field({ id: 'sx-name', label: 'Sheet name', value: book.sheets[i].name, maxlength: 40 });
      dialog({ title: 'Rename sheet', body: f.el, actions: [{ label: 'Rename', cls: 'primary', on: () => { const n = f.input.value.trim(); if (!n) return f.error('A sheet needs a name.'); if (book.sheets.some((s, j) => j !== i && s.name.toLowerCase() === n.toLowerCase())) return f.error('Another sheet already has that name.'); structural(() => { renameSheet(book, i, n); return true; }); } }, { label: 'Cancel' }] });
    }
    function deleteSheet(i) {
      dialog({ title: `Delete “${book.sheets[i].name}”?`, body: h('p', {}, 'Its cells are removed from this version. Formulas that used it show #REF!. Earlier versions keep it: you can restore from History.'), actions: [{ label: 'Delete sheet', cls: 'primary', on: () => { structural(() => { removeSheet(book, i); if (i < si) si -= 1; si = Math.max(0, Math.min(si, book.sheets.length - 1)); memoSel.clear(); return true; }); } }, { label: 'Cancel', focus: true }] });
    }

    // ------------------------------------------------------------ import, export, print
    const download = (name, blob) => { const a = h('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
    const baseName = () => meta.name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Spreadsheet';
    function sheetRows(s) {
      const u = usedRange(book.sheets[s]); if (!u) return []; const rows = [];
      for (let r = 0; r <= u.r2; r++) { const row = []; for (let c = 0; c <= u.c2; c++) { const v = calc.value(s, c, r); const t = cellText(book, s, calc, c, r); row.push(csvCell(v, t)); } rows.push(row); } return rows;
    }
    function exportCSV() { const rows = sheetRows(si); download(`${baseName()} - ${sheet().name}.csv`, new Blob(['﻿', toCSV(rows)], { type: 'text/csv;charset=utf-8' })); toast('Downloaded as CSV (the current sheet).'); }
    function exportTSV() { download(`${baseName()} - ${sheet().name}.tsv`, new Blob([toTSV(sheetRows(si))], { type: 'text/tab-separated-values;charset=utf-8' })); toast('Downloaded as TSV (the current sheet).'); }
    function exportHTML() {
      const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); const rows = sheetRows(si).map((r) => r.map((t) => String(t).replace(/^'(?=[=+\-@\t\r])/, '')));
      const html = `<!doctype html><meta charset="utf-8"><title>${esc(meta.name)}</title><h1>${esc(meta.name)} — ${esc(sheet().name)}</h1><table border="1" cellspacing="0" cellpadding="4">${rows.map((r) => `<tr>${r.map((t) => `<td>${esc(t)}</td>`).join('')}</tr>`).join('')}</table>`;
      download(`${baseName()} - ${sheet().name}.html`, new Blob([html], { type: 'text/html;charset=utf-8' })); toast('Downloaded as a web page (the current sheet).');
    }
    const excelFormat = (nf) => !nf ? undefined : nf.k === 'pct' ? `0${nf.d ? `.${'0'.repeat(nf.d)}` : ''}%` : nf.k === 'cur' ? `"${nf.sym ?? '$'}"#,##0${(nf.d ?? 2) ? `.${'0'.repeat(nf.d ?? 2)}` : ''}` : nf.k === 'num' ? `${nf.th === false ? '0' : '#,##0'}${(nf.d ?? 2) ? `.${'0'.repeat(nf.d ?? 2)}` : ''}` : nf.k === 'date' ? ({ iso: 'yyyy-mm-dd', us: 'mm/dd/yyyy', eu: 'dd/mm/yyyy', long: 'mmm d, yyyy' }[nf.f ?? 'iso']) : nf.k === 'time' ? 'hh:mm:ss' : nf.k === 'datetime' ? 'yyyy-mm-dd hh:mm' : undefined;
    const nfFromExcel = (z, isDate) => {
      if (!z || z === 'General') return isDate ? { k: 'date', f: 'iso' } : null; const dec = (z.split('.')[1] ?? '').replace(/[^0]/g, '').length; const sym = /\[\$([^\]-]+)|"([$€£¥])"|([$€£¥])/.exec(z); const s = sym ? (sym[1] || sym[2] || sym[3]) : null;
      if (/%/.test(z)) return { k: 'pct', d: dec }; if (/[ymd]/i.test(z.replace(/"[^"]*"|\[[^\]]*\]/g, '')) && /y|d/i.test(z) && !/^0/.test(z)) return /h/i.test(z) ? { k: 'datetime', f: 'iso' } : { k: 'date', f: /dd?\/mm?\//i.test(z) ? 'eu' : /mm?\/dd?\//i.test(z) ? 'us' : /mmm/i.test(z) ? 'long' : 'iso' };
      if (/h+:mm/i.test(z)) return { k: 'time' }; if (s) return { k: 'cur', d: dec, sym: s.length > 3 ? '$' : s }; if (/0|#/.test(z)) return { k: 'num', d: dec, ...(/,/.test(z) ? {} : { th: false }) }; return null;
    };
    async function exportXLSX(type = 'xlsx') {
      let bridge; try { bridge = await import('/sheetjs/xlsx.js'); } catch { toast('Excel export isn’t available in this build. Use CSV instead.', false); return; }
      const sheets = book.sheets.map((s, i) => { const u = usedRange(s); const rows = []; if (u) for (let r = 0; r <= u.r2; r++) { const row = []; for (let c = 0; c <= u.c2; c++) { const k = ref(c, r); const raw = s.cells[k]; const v = calc.value(i, c, r); const st = s.sty[k] !== undefined ? book.styles[s.sty[k]] : null; const z = excelFormat(st?.nf ?? impliedFormat(raw));
        if (raw === undefined || raw === '') { row.push(null); continue; } if (isError(v)) { row.push(String(v)); continue; }
        if (raw[0] === '=' && raw.length > 1) row.push({ f: raw.slice(1), v: v === null ? '' : v, z }); else if (typeof v === 'number') row.push({ v, z }); else if (typeof v === 'boolean') row.push(v); else row.push(v === null ? null : String(v)); } rows.push(row); }
        return { name: s.name, rows, merges: s.merges.map((m) => ({ r1: m.r1, c1: m.c1, r2: m.r2, c2: m.c2 })) }; });
      try { const bytes = bridge.writeXlsx(sheets, type); download(`${baseName()}.${type}`, new Blob([bytes], { type: type === 'ods' ? 'application/vnd.oasis.opendocument.spreadsheet' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); toast(`Downloaded as ${type === 'ods' ? 'OpenDocument (.ods)' : 'Excel (.xlsx)'}: values, formulas and number formats; colours and fonts stay in this app.`); } catch { toast('Couldn’t create the Excel file.', false); }
    }
    function importFile() {
      const inp = h('input', { type: 'file', accept: '.csv,.tsv,.txt,.xlsx,text/csv', hidden: true, 'aria-label': 'Choose a file to import' }); document.body.append(inp);
      inp.addEventListener('change', () => { const f = inp.files?.[0]; inp.remove(); if (f) readFile(f, (n, parts) => confirmImport(n, parts)); }); inp.click();
    }
    async function readFile(f, done) {
        if (f.size > 8e6) { toast('That file is over 8 MB. Split it first.', false); return; }
        try {
          const head = new Uint8Array(await f.slice(0, 4).arrayBuffer());                    // an .xlsx file is a zip archive (starts with PK)
          if (/\.xlsx$/i.test(f.name) || (head[0] === 0x50 && head[1] === 0x4b)) {
            let bridge; try { bridge = await import('/sheetjs/xlsx.js'); } catch { toast('Excel import isn’t available in this build. Save the file as CSV and import that.', false); return; }
            const parts = bridge.readXlsx(await f.arrayBuffer(), { maxRows: ROWS, maxCols: COLS });
            const made = parts.map((p) => ({ name: p.name, rows: p.rows.map((row) => (row ?? []).map((cell) => { if (!cell) return { raw: '' }; let raw; if (cell.f) raw = `=${cell.f}`; else if (typeof cell.v === 'number') raw = String(cell.v); else if (typeof cell.v === 'boolean') raw = cell.v ? 'TRUE' : 'FALSE'; else raw = rawOf(String(cell.v ?? '')); return { raw, nf: nfFromExcel(cell.z, cell.t === 'd' || /^\d{4}-\d\d-\d\d$/.test(String(cell.v))) }; })), merges: p.merges }));
            done(f.name, made);
          } else done(f.name, [{ name: f.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Imported', rows: parseCSV(await f.text()).map((row) => row.map((raw) => ({ raw }))), merges: [] }]);
        } catch { toast('Couldn’t read that file.', false); }
    }
    function confirmImport(name, parts) {
      const total = parts.reduce((n, p) => n + p.rows.reduce((m, r) => m + r.length, 0), 0);
      const over = parts.some((p) => p.rows.length > ROWS || p.rows.some((r) => r.length > COLS));
      const mode = h('select', { 'aria-label': 'How to import' }, h('option', { value: 'new' }, 'Add as new sheet(s)'), h('option', { value: 'replace' }, 'Replace everything in this spreadsheet'));
      dialog({ title: `Import ${name}`, body: h('div', {}, h('p', {}, `${parts.length} sheet${parts.length === 1 ? '' : 's'}, about ${total.toLocaleString()} cells. Formulas, values and number formats come across; colours and fonts do not.`), over ? notice('warn', 'warn', `Only the first ${ROWS.toLocaleString()} rows and ${COLS} columns fit. The rest is left out.`) : null, h('label', { class: 'fine' }, 'Where should it go? ', mode)),
        actions: [{ label: 'Import', cls: 'primary', on: () => { runImport(parts, mode.value); } }, { label: 'Cancel' }] });
    }
    function runImport(parts, mode) {
      structural(() => {
        if (mode === 'replace') { book.sheets = []; book.styles = []; delete book._sk; book.n = 0; si = 0; } else if (book.sheets.length + parts.length > MAX_SHEETS) { toast(`A spreadsheet holds up to ${MAX_SHEETS} sheets.`, false); return false; }
        let first = -1;
        for (const p of parts) {
          const s = emptySheet(uniqueName(book.sheets, p.name.slice(0, 40) || 'Imported')); book.sheets.push(s); if (first < 0) first = book.sheets.length - 1;
          p.rows.slice(0, ROWS).forEach((row, r) => row.slice(0, COLS).forEach((cell, c) => {
            if (book.n >= MAX_CELLS) return; const k = ref(c, r); const hasNf = cell.nf && cell.nf.k !== 'gen';
            if (cell.raw === '' && !hasNf) return; if (cell.raw !== '') s.cells[k] = String(cell.raw).slice(0, 4000); if (hasNf) { const idx = internStyle(book, { nf: cell.nf }); if (idx >= 0) s.sty[k] = idx; } book.n += 1;
          }));
          s.merges = (p.merges ?? []).filter((m) => m.r2 < ROWS && m.c2 < COLS).map((m) => ({ c1: m.c1, r1: m.r1, c2: m.c2, r2: m.r2 }));
        }
        if (!book.sheets.length) book.sheets.push(emptySheet()); si = first >= 0 ? first : 0; sel = { a: { c: 0, r: 0 }, f: { c: 0, r: 0 }, kind: 'cell' }; memoSel.clear(); return true;
      });
      toast('Imported.');
    }
    function printSheet() {
      commitEditing(); const s = sheet(); const u = usedRange(s); if (!u) { toast('There is nothing to print on this sheet yet.', false); return; }
      const table = h('table', { class: 'sx-ptable' }); const hiddenRows = hidden.rows, hiddenCols = hidden.cols; const covered = new Set(); const anchors = new Map();
      for (const m of s.merges) { anchors.set(m.r1 * 64 + m.c1, m); for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) if (r !== m.r1 || c !== m.c1) covered.add(r * 64 + c); }
      for (let r = 0; r <= u.r2; r++) {
        if (hiddenRows.has(r)) continue; const tr = h('tr', {}); if (s.rh[r]) tr.style.height = `${s.rh[r] * 0.75}pt`;
        for (let c = 0; c <= u.c2; c++) {
          if (hiddenCols.has(c) || covered.has(r * 64 + c)) continue; const k = ref(c, r); const st = s.sty[k] !== undefined ? book.styles[s.sty[k]] : null; const v = calc.value(si, c, r); const m = anchors.get(r * 64 + c);
          const td = h('td', m ? { colspan: String(m.c2 - m.c1 + 1), rowspan: String(m.r2 - m.r1 + 1) } : {}, cellText(book, si, calc, c, r)); td.style.width = `${(s.cw[c] ?? DEFAULT_COL_W) * 0.75}pt`;
          td.style.textAlign = { l: 'left', c: 'center', r: 'right' }[st?.ha ?? (typeof v === 'number' ? 'r' : 'l')]; if (st?.b) td.style.fontWeight = '700'; if (st?.i) td.style.fontStyle = 'italic'; td.style.textDecoration = [st?.u ? 'underline' : '', st?.st ? 'line-through' : ''].filter(Boolean).join(' ');
          if (st?.fs) td.style.fontSize = `${st.fs * 0.75}pt`; if (st?.fc) td.style.color = st.fc; if (st?.bg) { td.style.backgroundColor = st.bg; if (!st.fc) td.style.color = '#111'; } if (st?.wr) td.style.whiteSpace = 'normal';
          if (st?.bd) for (const [side, name] of [['t', 'Top'], ['b', 'Bottom'], ['l', 'Left'], ['r', 'Right']]) if (st.bd[side]) td.style[`border${name}`] = '1px solid #000';
          tr.append(td);
        } table.append(tr);
      }
      const pr = h('div', { class: 'sx-print' }, h('h1', {}, `${meta.name} — ${s.name}`), table); document.body.append(pr); document.documentElement.classList.add('sx-printing');
      const land = s.print.orient === 'landscape'; let totalPt = 0; for (let c = 0; c <= u.c2; c++) if (!hiddenCols.has(c)) totalPt += (s.cw[c] ?? DEFAULT_COL_W) * 0.75; const avail = land ? 760 : 520; if (s.print.fit && totalPt > avail) table.style.zoom = String(avail / totalPt);
      const css = new CSSStyleSheet(); css.replaceSync(`@page{size:${land ? 'landscape' : 'portrait'};margin:12mm}`); document.adoptedStyleSheets = [...document.adoptedStyleSheets, css];
      const done = () => { pr.remove(); document.documentElement.classList.remove('sx-printing'); document.adoptedStyleSheets = document.adoptedStyleSheets.filter((x) => x !== css); window.removeEventListener('afterprint', done); }; window.addEventListener('afterprint', done); setTimeout(() => window.print(), 50);
    }
    const fileMenu = (e) => menuBtn(e.currentTarget, [{ label: 'Import CSV or Excel…', disabled: readOnly, on: importFile }, { label: 'Download as CSV (this sheet)', on: exportCSV }, { label: 'Download as Excel (.xlsx)', on: exportXLSX }, '-', { label: 'Page setup (orientation, fit to width)…', on: pageSetup }, { label: 'Print or save as PDF…', on: printSheet }, '-', { label: 'Make a copy', on: makeCopy }], { wide: true });

    // ------------------------------------------------------------ footer pieces
    function paintCount() {
      const size = getBody().length; const warn = size > MAX_CHARS * 0.8; const n = book.n;
      counter.textContent = `${n.toLocaleString()} cell${n === 1 ? '' : 's'}${warn ? ` · ${Math.round(size / 1000)}k of ${MAX_CHARS / 1000}k characters` : ''}`; counter.classList.toggle('warn', warn);
      if (size > MAX_CHARS) counter.textContent += ' · too big to save: remove some content';
    }
    function paintStats() {
      const g = range(); if (!isMulti() || sel.kind === 'all') { stats.textContent = ''; return; } let n = 0, sum = 0, cnt = 0; const lim = 20000;
      const u = usedRange(sheet()); const r2 = Math.min(g.r2, u?.r2 ?? 0), c2 = Math.min(g.c2, u?.c2 ?? 0);
      for (let r = g.r1; r <= r2 && n < lim; r++) for (let c = g.c1; c <= c2; c++) { const v = calc.value(si, c, r); if (v !== null && v !== '') cnt++; if (typeof v === 'number') { sum += v; n++; } }
      stats.textContent = n ? `Sum ${formatValue(Math.round(sum * 1e8) / 1e8)} · Average ${formatValue(Math.round(sum / n * 1e8) / 1e8)} · Count ${cnt}` : cnt ? `Count ${cnt}` : '';
    }

    // ------------------------------------------------------------ rename + breadcrumb + layout
    const rename = async () => {
      const name = titleIn.value.trim(); if (readOnly || name === meta.name) { titleIn.value = meta.name; return; }
      if (!name || /[\/\\]/.test(name)) { toast('A name can’t be empty or contain a slash.', false); titleIn.value = meta.name; return; }
      const r = await api.call('drive.files.update', { id, name }); if (r.ok) { meta = { ...meta, name }; document.title = `${name} · Sheets`; toast('Renamed.'); } else { toast(r.message ?? 'Couldn’t rename.', false); titleIn.value = meta.name; }
    };
    titleIn.addEventListener('change', rename); titleIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); titleIn.blur(); } });
    const backHref = meta.project_id ? '#/projects' : meta.client_id ? `#/clients/c/${meta.client_id}?tab=documents` : meta.space === 'personal' ? '#/drive/personal' : '#/drive';
    const backLabel = meta.project_id ? 'Back to Projects' : meta.client_id ? 'Back to the client' : 'Back to Drive';
    // ---- menu bar: every command is reachable from here; the toolbar keeps the frequent ones
    const sub = (n) => ({ label: n, disabled: true, on: () => {} });
    const colorFrom = (field, label) => () => colorMenu(anchorNow(), field, label);
    const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';
    const NAMES = ['File', 'Edit', 'View', 'Insert', 'Format', 'Data', 'Help'];
    const menuItems = {
      File: () => [{ label: 'Import CSV or Excel…', disabled: readOnly, on: importFile }, '-', { label: 'Download as Excel (.xlsx)', on: () => exportXLSX('xlsx') }, { label: 'Download as OpenDocument (.ods)', on: () => exportXLSX('ods') }, { label: 'Download as CSV (this sheet)', on: exportCSV }, { label: 'Download as TSV (this sheet)', on: exportTSV }, { label: 'Download as web page (.html)', on: exportHTML }, { label: 'Download as PDF (print)…', on: printSheet }, '-', { label: 'Make a copy', on: makeCopy }, { label: 'Version history', on: () => sess.openHistory(!readOnly) }, { label: 'Save now', hint: `${mod}S`, disabled: readOnly, on: () => sess.save({ manual: true }) }, '-', { label: 'Page setup…', on: pageSetup }, { label: 'Print or save as PDF…', on: printSheet }],
      Edit: () => [{ label: 'Undo', hint: `${mod}Z`, disabled: readOnly || !undo.length, on: doUndo }, { label: 'Redo', hint: `${mod}Y`, disabled: readOnly || !redo.length, on: doRedo }, '-', { label: 'Cut', hint: `${mod}X`, disabled: readOnly, on: () => doCopy(true) }, { label: 'Copy', hint: `${mod}C`, on: () => doCopy(false) }, { label: 'Paste', hint: `${mod}V`, disabled: readOnly, on: () => pasteFromClipboard('all') }, { label: 'Paste values only', disabled: readOnly, on: () => pasteFromClipboard('values') }, '-',
        { label: 'Select all', hint: `${mod}A`, on: () => ed.selectAll() }, { label: 'Find and replace…', hint: `${mod}F`, on: openFind }, '-', { label: 'Fill down', hint: `${mod}D`, disabled: readOnly, on: () => fillDown(false) }, { label: 'Fill right', hint: `${mod}R`, disabled: readOnly, on: () => fillDown(true) }, { label: 'Clear contents', hint: 'Delete', disabled: readOnly, on: clearContents }, { label: 'Clear formatting', hint: `${mod}\\`, disabled: readOnly, on: clearFormats }, '-',
        { label: 'Delete row(s)', disabled: readOnly, on: () => deleteSel('r') }, { label: 'Delete column(s)', disabled: readOnly, on: () => deleteSel('c') }],
      View: () => [{ label: 'Zoom in', on: () => setZoom(zoomPct + 10) }, { label: 'Zoom out', on: () => setZoom(zoomPct - 10) }, { label: 'Reset zoom (100%)', on: () => setZoom(100) }, '-', { label: 'Freeze first row', checked: sheet().freeze.r === 1 && !sheet().freeze.c, on: () => freeze('row') }, { label: 'Freeze first column', checked: sheet().freeze.c === 1 && !sheet().freeze.r, on: () => freeze('col') }, { label: 'Freeze up to this cell', on: () => freeze('cell') }, { label: 'Unfreeze', disabled: !sheet().freeze.r && !sheet().freeze.c, on: () => freeze('none') }, '-',
        { label: 'Hide row(s)', disabled: readOnly, on: () => hideLines('r', false) }, { label: 'Unhide rows here', disabled: readOnly, on: () => hideLines('r', true) }, { label: 'Hide column(s)', disabled: readOnly, on: () => hideLines('c', false) }, { label: 'Unhide columns here', disabled: readOnly, on: () => hideLines('c', true) }, '-', { label: 'Page setup…', on: pageSetup }],
      Insert: () => [{ label: 'Chart…', disabled: readOnly, on: () => chartDialog() }, { label: 'Link…', disabled: readOnly, on: () => linkDialog() }, { label: sheet().notes[keyOfActive()] ? 'Edit note…' : 'Note…', disabled: readOnly, on: () => noteDialog() }, '-', { label: 'Row above', disabled: readOnly, on: () => insertAt('r', false) }, { label: 'Row below', disabled: readOnly, on: () => insertAt('r', true) }, { label: 'Column left', disabled: readOnly, on: () => insertAt('c', false) }, { label: 'Column right', disabled: readOnly, on: () => insertAt('c', true) }, '-', { label: 'New sheet', disabled: readOnly || book.sheets.length >= MAX_SHEETS, on: addSheet }],
      Format: () => [{ label: 'Bold', hint: `${mod}B`, checked: Boolean(activeStyle().b), disabled: readOnly, on: () => toggle('b') }, { label: 'Italic', hint: `${mod}I`, checked: Boolean(activeStyle().i), disabled: readOnly, on: () => toggle('i') }, { label: 'Underline', hint: `${mod}U`, checked: Boolean(activeStyle().u), disabled: readOnly, on: () => toggle('u') }, { label: 'Strikethrough', checked: Boolean(activeStyle().st), disabled: readOnly, on: () => toggle('st') }, '-',
        ...nfItems().map((x) => (x === '-' ? x : { ...x, disabled: readOnly })), '-',
        { label: 'Align left', checked: activeStyle().ha === 'l', disabled: readOnly, on: () => applyStyle(() => ({ ha: 'l' })) }, { label: 'Align centre', checked: activeStyle().ha === 'c', disabled: readOnly, on: () => applyStyle(() => ({ ha: 'c' })) }, { label: 'Align right', checked: activeStyle().ha === 'r', disabled: readOnly, on: () => applyStyle(() => ({ ha: 'r' })) }, { label: 'Align top', disabled: readOnly, on: () => applyStyle(() => ({ va: 't' })) }, { label: 'Align middle', disabled: readOnly, on: () => applyStyle(() => ({ va: 'm' })) }, { label: 'Align bottom', disabled: readOnly, on: () => applyStyle(() => ({ va: 'b' })) }, { label: 'Wrap text', checked: Boolean(activeStyle().wr), disabled: readOnly, on: () => toggle('wr') }, '-',
        { label: 'Borders: all', disabled: readOnly, on: () => setBorders('all') }, { label: 'Borders: outer', disabled: readOnly, on: () => setBorders('outer') }, { label: 'Borders: none', disabled: readOnly, on: () => setBorders('none') }, { label: 'Merge cells', disabled: readOnly || !isMulti(), on: () => merge(true) }, { label: 'Unmerge cells', disabled: readOnly, on: () => merge(false) }, '-',
        { label: 'Text colour…', disabled: readOnly, on: colorFrom('fc', 'text colour') }, { label: 'Fill colour…', disabled: readOnly, on: colorFrom('bg', 'fill colour') }, { label: 'Conditional formatting…', disabled: readOnly, on: () => cfDialog() }, { label: 'Format cells…', disabled: readOnly, on: formatDialog }, { label: 'Clear formatting', disabled: readOnly, on: clearFormats }],
      Data: () => [{ label: 'Sort A→Z by this column', disabled: readOnly, on: () => sortSel('asc') }, { label: 'Sort Z→A by this column', disabled: readOnly, on: () => sortSel('desc') }, { label: sheet().filter ? 'Remove filter' : 'Create a filter', disabled: readOnly, on: toggleFilter }, '-', { label: 'Dropdown list (data validation)…', disabled: readOnly, on: () => dvDialog() }, { label: 'Conditional formatting…', disabled: readOnly, on: () => cfDialog() }, '-',
        { label: sheet().lock ? 'Unprotect sheet' : 'Protect sheet', disabled: readOnly, on: () => structural(() => { sheet().lock = !sheet().lock; return true; }, { force: true }) }, { label: 'Sheet tab colour…', disabled: readOnly, on: () => tabColor(anchorNow(), si) }],
      Help: () => [{ label: 'Keyboard shortcuts', on: shortcutsDialog }, { label: 'Formula functions', on: functionsDialog }],
    };
    void sub;
    function shortcutsDialog() {
      const rows = [['Move', 'Arrow keys, Tab, Enter, Home, End, PageUp/PageDown'], ['Jump to the edge of data', `${mod}Arrow`], ['Select a range', 'Shift+Arrow, or drag'], ['Edit a cell', 'F2, Enter, or just type'], ['New line in a cell', 'Alt+Enter'], ['Undo / Redo', `${mod}Z / ${mod}Y`], ['Copy / Cut / Paste', `${mod}C / ${mod}X / ${mod}V`], ['Fill down / right', `${mod}D / ${mod}R`], ['Bold / Italic / Underline', `${mod}B / ${mod}I / ${mod}U`], ['Find and replace', `${mod}F / ${mod}H`], ['Select all', `${mod}A`], ['Save', `${mod}S`], ['Open a link in a cell', `${mod}click`], ['Menu bar', 'Alt or F10, then arrows']];
      dialog({ title: 'Keyboard shortcuts', body: h('table', { class: 'sx-keys' }, ...rows.map(([a, b]) => h('tr', {}, h('th', { scope: 'row' }, a), h('td', {}, b)))), actions: [{ label: 'Close', focus: true }] });
    }
    function functionsDialog() {
      dialog({ title: 'Formula functions', wide: true, body: h('div', {}, h('p', { class: 'fine muted' }, 'Start a cell with = . Ranges like A1:B5, other sheets like Sheet2!A1, and $A$1 for fixed references work.'), h('table', { class: 'sx-keys' }, ...Object.values(FUNCTION_DOCS).map(([sig, d]) => h('tr', {}, h('th', { scope: 'row' }, sig), h('td', {}, d))))), actions: [{ label: 'Close', focus: true }] });
    }
    let menuIdx = 0; const anchorNow = () => (mbBtns[menuIdx].offsetParent ? mbBtns[menuIdx] : burger);
    const mbBtns = NAMES.map((n, i) => h('button', { type: 'button', role: 'menuitem', class: 'sx-mb', 'aria-haspopup': 'menu', tabindex: i === 0 ? 0 : -1, onclick: () => openMenu(i) }, n));
    function openMenu(i) {
      menuIdx = i; mbBtns.forEach((x, j) => { x.tabIndex = j === i ? 0 : -1; }); const b = mbBtns[i]; b.focus();
      popup.show(b, menuList(menuItems[NAMES[i]]().filter(Boolean)), { wide: true, onSide: (d) => openMenu((i + d + NAMES.length) % NAMES.length) });
    }
    const menubar = h('nav', { class: 'sx-menubar', role: 'menubar', 'aria-label': 'Spreadsheet menus' }, ...mbBtns);
    menubar.addEventListener('keydown', (e) => {
      const i = mbBtns.indexOf(document.activeElement); if (i < 0) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); const j = (i + (e.key === 'ArrowRight' ? 1 : -1) + NAMES.length) % NAMES.length; mbBtns.forEach((x, k) => { x.tabIndex = k === j ? 0 : -1; }); mbBtns[j].focus(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); openMenu(i); } else if (e.key === 'Escape') focusGrid();
    });
    let altDown = false;
    const menuKeys = (e) => { if (!root.isConnected) return; if (e.key === 'Alt') { altDown = true; return; } altDown = false; if (e.key === 'F10' && !e.shiftKey) { e.preventDefault(); mbBtns[menuIdx].focus(); } };
    const menuKeyUp = (e) => { if (e.key === 'Alt' && altDown && root.isConnected && !document.querySelector('.ovl')) { altDown = false; mbBtns[menuIdx].focus(); } };
    document.addEventListener('keydown', menuKeys, true); document.addEventListener('keyup', menuKeyUp, true);
    const burger = h('button', { type: 'button', class: 'sx-burger', 'aria-label': 'Menu', 'aria-haspopup': 'menu', title: 'Menu', onclick: (e) => popup.show(e.currentTarget, (close) => h('div', { class: 'sx-menu' }, ...NAMES.flatMap((n) => [h('div', { class: 'sx-mh' }, n), ...menuList(menuItems[n]().filter(Boolean))(close).children])), { wide: true }) }, '☰');
    const banners = [];
    if (meta.archived_at) banners.push(notice('info', 'eye', [h('b', {}, 'In the trash.'), ' This spreadsheet is read only. ', btn('Restore', async () => { const r = await api.call('drive.files.restore', { id }); if (r.ok) { toast('Restored.'); load(); } else toast('You can’t restore this spreadsheet.', false); }, 'link')]));
    else if (readOnly) banners.push(readOnlyNotice('You can look at this spreadsheet but not change it'));
    const back = h('a', { class: 'sx-back', href: backHref, 'aria-label': backLabel, title: backLabel }, icon('arrow'));
    const histBtn = btn('History', () => sess.openHistory(!readOnly), 'sx-hist');
    const top = h('header', { class: 'sx-topbar' }, back, h('span', { class: 'sx-ficon', 'aria-hidden': 'true' }, icon('sheetI')), titleIn, statusEl, h('span', { class: 'sx-grow' }), histBtn, saveBtn, burger);
    const bar = h('div', { class: 'sx-bar-row' }, nameBox, h('span', { class: 'sx-fxl', 'aria-hidden': 'true' }, 'fx'), h('div', { class: 'sx-fxwrap' }, fbar, acBox));
    put(root, ...banners, top, menubar, tools, bar, hint, findBar, grid.el, h('div', { class: 'sx-tabsbar' }, tabsEl), h('div', { class: 'sx-status' }, stats, h('span', { class: 'sx-grow' }), counter, zoomBox), live);
    root.removeAttribute('aria-busy'); document.title = `${meta.name} · Sheets`;
    
    const fit = () => { const top = Math.max(0, root.getBoundingClientRect().top); root.style.height = `${Math.max(360, window.innerHeight - top)}px`; };
    fit(); window.addEventListener('resize', fit); setTimeout(fit, 300);
    recalcFilter(); drawTabs(); grid.attach(); syncBar(); syncTools(); paintCount(); focusGrid();
    const leave = () => { if (location.hash.startsWith(`#/sheet/${id}`)) return; window.removeEventListener('hashchange', leave); window.removeEventListener('resize', fit); document.removeEventListener('keydown', menuKeys, true); document.removeEventListener('keyup', menuKeyUp, true); document.removeEventListener('copy', onCopy); document.removeEventListener('cut', onCopy); document.removeEventListener('paste', onPaste); popup.close(); grid.destroy(); sess.destroy(); };
    window.addEventListener('hashchange', leave);
    { const src = new URLSearchParams(location.hash.split('?')[1] ?? '').get('import');   // opened from Drive: "Open in Sheets" on an uploaded Excel/CSV file
      if (src) { history.replaceState(null, '', location.hash.split('?')[0]); if (!readOnly) fromDrive(api, src).then((f) => { if (!f) return toast('Couldn’t read the original file. Use File › Import to try again.', false); readFile(f, async (n, parts) => { runImport(parts, 'replace'); await sess.save({ manual: true }); }); }); } }
    root.sxTest = { book, get calc() { return calc; }, get sel() { return sel; }, select: (c, r) => setSel({ c, r }), setCell, doUndo, doRedo, grid };
  }
  load();
  return root;
}
