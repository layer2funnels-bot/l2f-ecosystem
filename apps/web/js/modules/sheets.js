// Sheets (our own editor, v4): a grid with a formula bar, cell references, SUM / AVERAGE / MIN / MAX / COUNT / ROUND / ABS and arithmetic, sheet tabs, and the shared
// saved-document session (versions, conflict handling, history, unsaved guard). The stored body is JSON; formulas are evaluated by sheetmodel.js, never by eval.
import { h, put, icon, btn, dialog, toast, field, notice, skeleton, errorState, noAccessState, readOnlyNotice } from '../ui.js';
import { createSession } from './session.js';
import { MIME, COLS, ROWS, MAX_CHARS, MAX_SHEETS, colName, ref, parseBook, serializeBook, emptySheet, evaluateSheet, display, isError } from './sheetmodel.js';

const timeOf = (iso) => { try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
export { MIME };

export function sheetView({ api, id, ctx }) {
  const root = h('section', { class: 'sheets', 'aria-busy': 'true' }, skeleton(4));
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
    let meta = file; let book = parseBook(ver.body ?? ''); let cur = 0; let sel = { col: 0, row: 0 }; let editing = null; let body = serializeBook(book); let dirtyBody = true;
    const readOnly = Boolean(file.archived_at) || !ctx.can('drive.file.upload', file.client_id);
    const getBody = () => { if (dirtyBody) { body = serializeBook(book); dirtyBody = false; } return body; };
    const sheet = () => book.sheets[cur];
    let calc = evaluateSheet(sheet());
    const statusEl = h('span', { class: 'docstate', role: 'status', 'aria-live': 'polite' }); const counter = h('span', { class: 'docstat muted' });
    const saveBtn = btn('Save', () => sess.save({ manual: true }), 'primary');
    const titleIn = h('input', { class: 'doctitle', value: meta.name, 'aria-label': 'Spreadsheet name', maxlength: '200', ...(readOnly ? { readonly: true } : {}) });
    const crumb = h('nav', { class: 'fpath fine', 'aria-label': 'Where this spreadsheet lives' });
    const paint = ({ status, savedAt, readOnly: ro, saving }) => {
      const t = { saved: `Saved ${timeOf(savedAt)}`, dirty: 'Unsaved changes', saving: 'Saving…', failed: 'Couldn’t save. Your changes are still here.', readonly: 'Read only' }[status];
      put(statusEl, h('span', { class: `dot ${status}` }), t, status === 'failed' ? btn('Retry', () => sess.save({ manual: true }), 'link') : null); saveBtn.disabled = ro || status === 'saved' || saving;
    };
    const sess = createSession({ api, id, ctx, version: ver.version, savedBody: null, savedAt: ver.created_at, readOnly, getBody, label: () => meta.name, onStatus: paint,
      setBody: (b) => { book = parseBook(b); dirtyBody = true; cur = Math.min(cur, book.sheets.length - 1); recalc(); drawTabs(); drawGrid(); }, maxChars: MAX_CHARS });
    sess.reset({ version: ver.version, savedAt: ver.created_at });

    // ---- grid
    const refLabel = h('output', { class: 'sh-ref', 'aria-label': 'Selected cell' }, 'A1');
    const fbar = h('input', { class: 'sh-fx', 'aria-label': 'Formula bar', placeholder: 'Type a value or a formula such as =SUM(A1:A5)', autocomplete: 'off', spellcheck: 'false', ...(readOnly ? { readonly: true } : {}) });
    const table = h('table', { class: 'sh-grid', role: 'grid', 'aria-label': 'Spreadsheet cells', 'aria-rowcount': String(ROWS), 'aria-colcount': String(COLS) });
    const wrap = h('div', { class: 'sh-wrap', tabindex: '0', 'aria-label': 'Spreadsheet. Arrow keys move, Enter edits, Delete clears.' }, table);
    const tabsEl = h('div', { class: 'sh-tabs', role: 'tablist', 'aria-label': 'Sheets' });
    const keyOf = (c, r) => ref(c, r);
    const raw = (c, r) => sheet().cells[keyOf(c, r)] ?? '';
    const recalc = () => { calc = evaluateSheet(sheet()); };
    const cellText = (c, r) => display(calc.get(keyOf(c, r)));
    function drawCell(td, c, r) {
      const k = keyOf(c, r); const val = calc.get(k); const txt = display(val);
      td.className = `${isError(val) ? 'err' : typeof val === 'number' ? 'num' : ''}${c === sel.col && r === sel.row ? ' sel' : ''}`; td.textContent = txt;
      td.setAttribute('aria-selected', String(c === sel.col && r === sel.row)); td.title = raw(c, r)[0] === '=' ? raw(c, r) : '';
    }
    function drawGrid() {
      const head = h('tr', {}, h('th', { class: 'corner', scope: 'col' }), ...Array.from({ length: COLS }, (_, c) => h('th', { scope: 'col', class: c === sel.col ? 'hot' : '' }, colName(c))));
      const rows = Array.from({ length: ROWS }, (_, r) => { const tr = h('tr', { 'aria-rowindex': String(r + 1) }, h('th', { scope: 'row', class: r === sel.row ? 'hot' : '' }, String(r + 1)));
        for (let c = 0; c < COLS; c++) { const td = h('td', { role: 'gridcell', 'data-c': String(c), 'data-r': String(r), 'aria-colindex': String(c + 1) }); drawCell(td, c, r); tr.append(td); } return tr; });
      put(table, h('thead', {}, head), h('tbody', {}, ...rows)); syncBar();
    }
    const cellEl = (c, r) => table.querySelector(`td[data-c="${c}"][data-r="${r}"]`);
    function syncBar() { refLabel.textContent = keyOf(sel.col, sel.row); fbar.value = raw(sel.col, sel.row); table.querySelectorAll('th.hot').forEach((x) => x.classList.remove('hot')); table.querySelector(`thead th:nth-child(${sel.col + 2})`)?.classList.add('hot'); table.querySelector(`tbody tr:nth-child(${sel.row + 1}) th`)?.classList.add('hot'); }
    function select(c, r, { scroll = true } = {}) {
      c = Math.max(0, Math.min(COLS - 1, c)); r = Math.max(0, Math.min(ROWS - 1, r));
      cellEl(sel.col, sel.row)?.classList.remove('sel'); cellEl(sel.col, sel.row)?.setAttribute('aria-selected', 'false');
      sel = { col: c, row: r }; const td = cellEl(c, r); td?.classList.add('sel'); td?.setAttribute('aria-selected', 'true'); syncBar(); if (scroll) td?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    const countCells = () => Object.keys(sheet().cells).length;
    function setRaw(c, r, value) {
      if (readOnly) return; const k = keyOf(c, r); const v = String(value).slice(0, 2000);
      if ((sheet().cells[k] ?? '') === v) return;
      if (v === '') delete sheet().cells[k]; else sheet().cells[k] = v;
      dirtyBody = true; recalc(); refreshAll(); sess.markChanged(); paintCount();
    }
    function refreshAll() { table.querySelectorAll('td').forEach((td) => drawCell(td, Number(td.dataset.c), Number(td.dataset.r))); }
    const paintCount = () => { const size = getBody().length; counter.textContent = `${countCells()} cell${countCells() === 1 ? '' : 's'}${size > MAX_CHARS * 0.8 ? ` · ${Math.round(size / 1000)}k of ${MAX_CHARS / 1000}k characters` : ''}`; counter.classList.toggle('warn', size > MAX_CHARS * 0.8); };
    function edit(initial) {
      if (readOnly || editing) return; const { col, row } = sel; const td = cellEl(col, row); if (!td) return;
      const input = h('input', { class: 'sh-in', 'aria-label': `Edit ${keyOf(col, row)}`, autocomplete: 'off', spellcheck: 'false' }); input.value = initial ?? raw(col, row);
      editing = { col, row }; td.textContent = ''; td.append(input); input.focus(); if (initial === undefined) input.select();
      input.addEventListener('input', () => { fbar.value = input.value; });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(input.value); select(col, row + 1); wrap.focus(); }
        else if (e.key === 'Tab') { e.preventDefault(); commit(input.value); select(col + (e.shiftKey ? -1 : 1), row); wrap.focus(); }
        else if (e.key === 'Escape') { e.preventDefault(); cancel(); wrap.focus(); }
      });
      input.addEventListener('blur', () => { if (editing) commit(input.value); });
    }
    function commit(value) { const e = editing; editing = null; if (!e) return; setRaw(e.col, e.row, value); const td = cellEl(e.col, e.row); if (td) drawCell(td, e.col, e.row); syncBar(); }
    function cancel() { const e = editing; editing = null; if (!e) return; const td = cellEl(e.col, e.row); if (td) drawCell(td, e.col, e.row); syncBar(); }
    table.addEventListener('mousedown', (e) => { const td = e.target.closest('td'); if (!td) return; if (editing) commit(editing && table.querySelector('.sh-in')?.value); select(Number(td.dataset.c), Number(td.dataset.r), { scroll: false }); });
    table.addEventListener('dblclick', (e) => { if (e.target.closest('td')) edit(); });
    wrap.addEventListener('keydown', (e) => {
      if (editing) return; const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); sess.save({ manual: true }); return; }
      const move = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
      if (move) { e.preventDefault(); select(sel.col + move[0], sel.row + move[1]); }
      else if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); edit(); }
      else if (e.key === 'Tab') { e.preventDefault(); select(sel.col + (e.shiftKey ? -1 : 1), sel.row); }
      else if (e.key === 'Home') { e.preventDefault(); select(0, sel.row); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); setRaw(sel.col, sel.row, ''); syncBar(); }
      else if (!mod && e.key.length === 1) { e.preventDefault(); edit(e.key); }
    });
    fbar.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); setRaw(sel.col, sel.row, fbar.value); select(sel.col, sel.row + 1); wrap.focus(); } else if (e.key === 'Escape') { fbar.value = raw(sel.col, sel.row); wrap.focus(); } });
    fbar.addEventListener('change', () => setRaw(sel.col, sel.row, fbar.value));

    // ---- sheet tabs
    function drawTabs() {
      put(tabsEl, ...book.sheets.map((s, i) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(i === cur), tabindex: i === cur ? 0 : -1, class: i === cur ? 'on' : '', onclick: () => { if (editing) commit(table.querySelector('.sh-in')?.value); cur = i; sel = { col: 0, row: 0 }; recalc(); drawGrid(); drawTabs(); paintCount(); }, ondblclick: () => renameSheet(i) }, s.name)),
        !readOnly && book.sheets.length < MAX_SHEETS ? btn('+', addSheet, '', { 'aria-label': 'Add a sheet', title: 'Add a sheet' }) : null,
        !readOnly ? btn('Rename', () => renameSheet(cur), 'link') : null, !readOnly && book.sheets.length > 1 ? btn('Delete sheet', deleteSheet, 'link') : null);
    }
    function addSheet() { let n = book.sheets.length + 1; while (book.sheets.some((s) => s.name === `Sheet ${n}`)) n += 1; book.sheets.push(emptySheet(`Sheet ${n}`)); cur = book.sheets.length - 1; sel = { col: 0, row: 0 }; dirtyBody = true; recalc(); drawGrid(); drawTabs(); sess.markChanged(); paintCount(); }
    function renameSheet(i) {
      if (readOnly) return; const f = field({ id: 'sh-name', label: 'Sheet name', value: book.sheets[i].name, maxlength: 40 });
      dialog({ title: 'Rename sheet', body: f.el, actions: [{ label: 'Rename', cls: 'primary', on: () => { const n = f.input.value.trim(); if (!n) return f.error('A sheet needs a name.'); if (book.sheets.some((s, j) => j !== i && s.name === n)) return f.error('Another sheet already has that name.'); book.sheets[i].name = n; dirtyBody = true; drawTabs(); sess.markChanged(); } }, { label: 'Cancel' }] });
    }
    function deleteSheet() {
      dialog({ title: `Delete “${sheet().name}”?`, body: h('p', {}, 'Its cells are removed from this version. Earlier versions keep them: you can restore from History.'), actions: [{ label: 'Delete sheet', cls: 'primary', on: () => { book.sheets.splice(cur, 1); cur = Math.max(0, cur - 1); sel = { col: 0, row: 0 }; dirtyBody = true; recalc(); drawGrid(); drawTabs(); sess.markChanged(); paintCount(); } }, { label: 'Cancel', focus: true }] });
    }
    const rename = async () => {
      const name = titleIn.value.trim(); if (readOnly || name === meta.name) { titleIn.value = meta.name; return; }
      if (!name || /[\/\\]/.test(name)) { toast('A name can’t be empty or contain a slash.', false); titleIn.value = meta.name; return; }
      const r = await api.call('drive.files.update', { id, name }); if (r.ok) { meta = { ...meta, name }; document.title = `${name} · Sheets`; toast('Renamed.'); } else { toast(r.message ?? 'Couldn’t rename.', false); titleIn.value = meta.name; }
    };
    titleIn.addEventListener('change', rename); titleIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); titleIn.blur(); } });
    (async () => {
      let parts;
      if (meta.project_id) { const p = await api.call('projects.get', { id: meta.project_id }); parts = [h('a', { href: '#/projects' }, 'Projects'), p.ok ? p.data[0].name : 'Project', 'Sheets']; }
      else if (meta.client_id) parts = [h('a', { href: '#/clients' }, 'Clients'), h('a', { href: `#/clients/c/${meta.client_id}?tab=documents` }, ctx.clients?.get?.(meta.client_id) ?? 'Client'), 'Sheets'];
      else parts = [h('a', { href: '#/drive' }, 'Drive'), meta.space === 'personal' ? 'Personal' : ctx.orgName];
      if (root.isConnected) put(crumb, ...parts.flatMap((x, i) => (i ? [h('span', { 'aria-hidden': 'true' }, ' / '), x] : [x])));
    })();
    const banners = [];
    if (meta.archived_at) banners.push(notice('info', 'eye', [h('b', {}, 'In the trash.'), ' This spreadsheet is read only. ', btn('Restore', async () => { const r = await api.call('drive.files.restore', { id }); if (r.ok) { toast('Restored.'); load(); } else toast('You can’t restore this spreadsheet.', false); }, 'link')]));
    else if (readOnly) banners.push(readOnlyNotice('You can look at this spreadsheet but not change it'));
    put(root, ...banners, h('div', { class: 'docbar' }, crumb, h('div', { class: 'docrow' }, titleIn, h('div', { class: 'docacts' }, statusEl, counter, btn('History', () => sess.openHistory(!readOnly)), saveBtn))), h('div', { class: 'sh-bar' }, refLabel, h('span', { class: 'sh-fxl', 'aria-hidden': 'true' }, 'fx'), fbar), wrap, tabsEl);
    root.removeAttribute('aria-busy'); document.title = `${meta.name} · Sheets`;
    drawGrid(); drawTabs(); paintCount(); wrap.focus();
    const leave = () => { if (location.hash.startsWith(`#/sheet/${id}`)) return; window.removeEventListener('hashchange', leave); sess.destroy(); };
    window.addEventListener('hashchange', leave);
  }
  load();
  return root;
}
