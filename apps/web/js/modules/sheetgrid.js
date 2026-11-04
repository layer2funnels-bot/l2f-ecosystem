// Sheets grid view: a virtualised grid (only the cells in view exist in the page), with frozen rows/columns, headers, resize, and pointer selection.
// The scroller owns the scroll bars; a sticky "stage" holds four panes (corner, top, left, main) whose layers are moved with transforms, so a
// 1,000 x 52 sheet scrolls as smoothly as a small one. All cell state comes from the editor object `ed`; this file never changes the book.
import { h } from '../dom.js';
import { COLS, ROWS, DEFAULT_COL_W, DEFAULT_ROW_H, colName, ref, styleOf, cellText } from './sheetmodel.js';

export const HW = 48, HH = 26, OVER = 3;
const bisect = (arr, v, n) => { let lo = 0, hi = n; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (arr[mid] <= v) lo = mid; else hi = mid - 1; } return lo; };
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(n >> 16) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255); };

export function createGrid(ed) {
  const editor = h('textarea', { class: 'sx-edit', rows: '1', 'aria-label': 'Edit cell', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off', hidden: true });
  const stage = h('div', { class: 'sx-stage' });
  const sizer = h('div', { class: 'sx-sizer' }, stage);
  const scroller = h('div', { class: 'sx-scroll', tabindex: '0', role: 'grid', 'aria-label': 'Spreadsheet. Arrow keys move, Enter or F2 edits, Delete clears.', 'aria-rowcount': String(ROWS), 'aria-colcount': String(COLS) }, sizer);
  const panes = {};
  for (const n of ['corner', 'top', 'left', 'main']) { const layer = h('div', { class: 'sx-layer' }); panes[n] = { el: h('div', { class: `sx-pane sx-${n}` }, layer), layer, pool: new Map(), left: 0, top: 0 }; stage.append(panes[n].el); }
  const chartLayer = h('div', { class: 'sx-chartlayer' }); const chartPane = h('div', { class: 'sx-chartpane' }, chartLayer);
  stage.append(chartPane, editor);
  let colLeft = new Float64Array(COLS + 1), rowTop = new Float64Array(ROWS + 1);
  let fc = 0, fr = 0, fw = 0, fh = 0, W = 600, H = 400, anchors = new Map(), covered = new Set(), last = '';
  const stageSize = () => ({ W, H });

  function layout() {
    const s = ed.sheet(); const z = ed.zoom(); const hr = new Set(s.hr); for (const r of ed.filtered()) hr.add(r); const hc = new Set(s.hc);
    for (let c = 0; c < COLS; c++) colLeft[c + 1] = colLeft[c] + (hc.has(c) ? 0 : (s.cw[c] ?? DEFAULT_COL_W) * z);
    for (let r = 0; r < ROWS; r++) rowTop[r + 1] = rowTop[r] + (hr.has(r) ? 0 : (s.rh[r] ?? DEFAULT_ROW_H) * z);
    fc = s.freeze.c; fr = s.freeze.r;
    while (fc > 0 && colLeft[fc] > W * 0.6 - HW) fc -= 1; while (fr > 0 && rowTop[fr] > H * 0.6 - HH) fr -= 1;     // never freeze more than fits
    fw = colLeft[fc]; fh = rowTop[fr];
    anchors = new Map(); covered = new Set();
    for (const m of s.merges) { anchors.set(m.r1 * 64 + m.c1, m); for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) if (r !== m.r1 || c !== m.c1) covered.add(r * 64 + c); }
    sizer.style.width = `${HW + colLeft[COLS] + 80}px`; sizer.style.height = `${HH + rowTop[ROWS] + 80}px`;
    const set = (n, l, t, w, hh) => { const p = panes[n]; p.left = l; p.top = t; const st = p.el.style; st.left = `${l}px`; st.top = `${t}px`; st.width = `${Math.max(0, w)}px`; st.height = `${Math.max(0, hh)}px`; };
    set('corner', 0, 0, HW + fw, HH + fh); set('top', HW + fw, 0, W - HW - fw, HH + fh); set('left', 0, HH + fh, HW + fw, H - HH - fh); set('main', HW + fw, HH + fh, W - HW - fw, H - HH - fh);
    const cp = chartPane.style; cp.left = `${HW}px`; cp.top = `${HH}px`; cp.width = `${Math.max(0, W - HW)}px`; cp.height = `${Math.max(0, H - HH)}px`; ed.chartsMoved?.();
    last = '';
  }
  const colAt = (v) => { const c = bisect(colLeft, v, COLS); return Math.min(COLS - 1, c); };
  const rowAt = (v) => { const r = bisect(rowTop, v, ROWS); return Math.min(ROWS - 1, r); };

  /** Page-to-sheet: where is this point? kinds: cell, col, row, corner, colEdge, rowEdge, fill */
  function hit(clientX, clientY) {
    const b = stage.getBoundingClientRect(); const x = clientX - b.left, y = clientY - b.top; const sx = scroller.scrollLeft, sy = scroller.scrollTop;
    const toCol = (px) => { const a = px - HW; return a < fw ? colAt(a) : colAt(a + sx); }; const toRow = (py) => { const a = py - HH; return a < fh ? rowAt(a) : rowAt(a + sy); };
    const screenX = (c) => HW + colLeft[c] - (c >= fc ? sx : 0), screenY = (r) => HH + rowTop[r] - (r >= fr ? sy : 0);
    const f = ed.fillPoint?.(); if (f) { const px = screenX(f.c + 1), py = screenY(f.r + 1); if (Math.abs(x - px) <= 6 && Math.abs(y - py) <= 6 && x > HW && y > HH) return { kind: 'fill' }; }
    if (x < HW && y < HH) return { kind: 'corner' };
    if (y < HH) { const c = toCol(x); if (x > HW && Math.abs(x - screenX(c + 1)) <= 4) return { kind: 'colEdge', c }; if (c > 0 && x > HW && Math.abs(x - screenX(c)) <= 4) return { kind: 'colEdge', c: c - 1 }; return { kind: 'col', c }; }
    if (x < HW) { const r = toRow(y); const edge = screenY(r + 1); if (Math.abs(y - edge) <= 3 && y > HH) return { kind: 'rowEdge', r }; return { kind: 'row', r }; }
    return { kind: 'cell', c: toCol(x), r: toRow(y), x, y };
  }
  /** Stage-relative rectangle of a cell (merged cells span their area), or null when it is hidden. */
  function box(c, r) {
    const m = ed.sheet().merges.find((g) => c >= g.c1 && c <= g.c2 && r >= g.r1 && r <= g.r2); const c1 = m?.c1 ?? c, r1 = m?.r1 ?? r, c2 = m?.c2 ?? c, r2 = m?.r2 ?? r;
    const w = colLeft[c2 + 1] - colLeft[c1], hh = rowTop[r2 + 1] - rowTop[r1]; if (w <= 0 || hh <= 0) return null;
    return { x: HW + colLeft[c1] - (c1 >= fc ? scroller.scrollLeft : 0), y: HH + rowTop[r1] - (r1 >= fr ? scroller.scrollTop : 0), w, h: hh };
  }
  function scrollTo(c, r) {
    const sx = scroller.scrollLeft, sy = scroller.scrollTop; const viewW = W - HW - fw, viewH = H - HH - fh;
    if (c >= fc) { const l = colLeft[c] - fw, rr = colLeft[c + 1] - fw; if (l < sx) scroller.scrollLeft = l; else if (rr > sx + viewW) scroller.scrollLeft = Math.min(rr - viewW, l); }
    if (r >= fr) { const t = rowTop[r] - fh, bb = rowTop[r + 1] - fh; if (t < sy) scroller.scrollTop = t; else if (bb > sy + viewH) scroller.scrollTop = Math.min(bb - viewH, t); }
  }
  const zoomNow = () => ed.zoom();
  const visibleRows = () => Math.max(1, Math.floor((H - HH - fh) / DEFAULT_ROW_H) - 1);

  // ---- painting
  function paintHeader(el, kind, i, hot, whole) {
    el.className = `sx-h sx-h${kind}${hot ? ' hot' : ''}${whole ? ' whole' : ''}`; el.textContent = kind === 'c' ? colName(i) : String(i + 1);
    el.setAttribute('role', kind === 'c' ? 'columnheader' : 'rowheader');
    if (kind === 'c' && ed.filterOn(i)) { /* filter dropdown lives on the header row cell of the filter, not here */ }
  }
  function paintCell(el, c, r, m, rng, act) {
    const book = ed.book(), si = ed.si(), calc = ed.calc(); const key = ref(c, r);
    const v = calc.value(si, c, r); const text = cellText(book, si, calc, c, r); const st = styleOf(book, ed.sheet(), key);
    const inR = rng && c >= rng.c1 && c <= rng.c2 && r >= rng.r1 && r <= rng.r2; const mm = m ? { c1: m.c1, c2: m.c2, r1: m.r1, r2: m.r2 } : { c1: c, c2: c, r1: r, r2: r };
    const touchesR = rng && !(mm.c2 < rng.c1 || mm.c1 > rng.c2 || mm.r2 < rng.r1 || mm.r1 > rng.r2);
    const eT = touchesR && mm.r1 <= rng.r1, eB = touchesR && mm.r2 >= rng.r2, eL = touchesR && mm.c1 <= rng.c1, eR = touchesR && mm.c2 >= rng.c2;
    const isAct = act && act.c >= mm.c1 && act.c <= mm.c2 && act.r >= mm.r1 && act.r <= mm.r2;
    const z = ed.zoom(); const cf = ed.cfFor(c, r, v, text); const note = ed.noteAt(key); const link = ed.linkAt(key); const dv = isAct && ed.dvAt(c, r);
    const kind = v instanceof Object ? 'err' : typeof v === 'number' ? 'num' : typeof v === 'boolean' ? 'bool' : '';
    const fb = ed.filterBtnAt(c, r); const fill = ed.fillPoint?.(); const hasFill = fill && fill.c === c && fill.r === r;
    const flags = (touchesR ? 'R' : '') + (eT ? 'T' : '') + (eB ? 'B' : '') + (eL ? 'L' : '') + (eR ? 'r' : '') + (isAct ? 'A' : '') + (fb ? 'F' : '') + (hasFill ? 'H' : '') + (ed.matchAt(c, r) ? 'M' : '') + (dv ? 'D' : '') + (note ? 'N' : '') + (link ? 'L' : '') + z + (cf ? `${cf.fc ?? ''}${cf.bg ?? ''}` : '');
    const w = colLeft[mm.c2 + 1] - colLeft[mm.c1], hh = rowTop[mm.r2 + 1] - rowTop[mm.r1];
    const sig = `${text}|${ed.sheet().sty[key] ?? ''}|${flags}|${w}|${hh}|${kind}|${fb ?? ''}`;
    if (el._sig === sig) return; el._sig = sig;
    el.className = `sx-c${kind ? ` ${kind}` : ''}${inR || touchesR ? ' in' : ''}${eT ? ' eT' : ''}${eB ? ' eB' : ''}${eL ? ' eL' : ''}${eR ? ' eR' : ''}${isAct ? ' act' : ''}${ed.matchAt(c, r) ? ' match' : ''}${st?.wr ? ' wrap' : ''}${link ? ' link' : ''}`;
    el.setAttribute('aria-selected', isAct ? 'true' : 'false');
    const s = el.style; s.width = `${w}px`; s.height = `${hh}px`;
    s.fontSize = st?.fs || z !== 1 ? `${(st?.fs ?? 14) * z}px` : ''; s.fontWeight = st?.b ? '700' : ''; s.fontStyle = st?.i ? 'italic' : '';
    s.textDecoration = [st?.u ? 'underline' : '', st?.st ? 'line-through' : ''].filter(Boolean).join(' ');
    const fg = cf?.fc ?? st?.fc, bgc = cf?.bg ?? st?.bg;
    s.color = fg ?? (bgc ? (lum(bgc) > 0.4 ? '#14161c' : '#ffffff') : '');
    s.backgroundColor = bgc ?? '';
    const ha = st?.ha ?? (kind === 'num' ? 'r' : kind === 'bool' || kind === 'err' ? 'c' : 'l'); const va = st?.va ?? 'b';
    s.justifyContent = { l: 'flex-start', c: 'center', r: 'flex-end' }[ha]; s.alignItems = { t: 'flex-start', m: 'center', b: 'flex-end' }[va]; s.textAlign = { l: 'left', c: 'center', r: 'right' }[ha];
    const bd = st?.bd; const sh = []; if (bd) { const col = 'var(--text)'; if (bd.t) sh.push(`inset 0 1px 0 0 ${col}`); if (bd.b) sh.push(`inset 0 -1px 0 0 ${col}`); if (bd.l) sh.push(`inset 1px 0 0 0 ${col}`); if (bd.r) sh.push(`inset -1px 0 0 0 ${col}`); }
    s.boxShadow = sh.join(',');
    const t = el.firstChild ?? el.appendChild(h('span', { class: 't' })); t.textContent = text;
    while (el.childNodes.length > 1) el.lastChild.remove();
    if (fb) el.append(h('button', { type: 'button', class: 'sx-fbtn', 'aria-label': `Filter column ${colName(c)}`, 'data-fc': String(c), title: 'Filter' }, '▾'));
    if (note) { el.append(h('i', { class: 'sx-note', 'aria-hidden': 'true' })); el.title = note; } else el.removeAttribute('title');
    if (dv) el.append(h('button', { type: 'button', class: 'sx-dvbtn', 'aria-label': 'Choose from the list', title: 'Choose from the list', 'data-dv': '1' }, '▾'));
    if (hasFill) el.append(h('i', { class: 'sx-fh', 'aria-hidden': 'true' }));
  }
  function render() {
    const sx = scroller.scrollLeft, sy = scroller.scrollTop; const s = ed.sheet(); const rng = ed.range(); const act = ed.active();
    chartLayer.style.transform = `translate(${-sx}px,${-sy}px)`;
    panes.main.layer.style.transform = `translate(${-sx}px,${-sy}px)`; panes.top.layer.style.transform = `translate(${-sx}px,0)`; panes.left.layer.style.transform = `translate(0,${-sy}px)`;
    const viewW = W - HW - fw, viewH = H - HH - fh;
    const c0 = Math.max(fc, colAt(fw + sx) - OVER), c1 = Math.min(COLS - 1, colAt(fw + sx + viewW) + OVER), r0 = Math.max(fr, rowAt(fh + sy) - OVER), r1 = Math.min(ROWS - 1, rowAt(fh + sy + viewH) + OVER);
    const cols = (a, b) => { const o = []; for (let c = a; c <= b; c++) if (colLeft[c + 1] > colLeft[c]) o.push(c); return o; }; const rows = (a, b) => { const o = []; for (let r = a; r <= b; r++) if (rowTop[r + 1] > rowTop[r]) o.push(r); return o; };
    const colsF = cols(0, fc - 1), colsS = cols(c0, c1), rowsF = rows(0, fr - 1), rowsS = rows(r0, r1);
    const sigAll = `${c0}-${c1}-${r0}-${r1}-${W}x${H}`;
    const hotC = (c) => rng && c >= rng.c1 && c <= rng.c2, hotR = (r) => rng && r >= rng.r1 && r <= rng.r2;
    const wholeC = (c) => hotC(c) && rng.r1 === 0 && rng.r2 === ROWS - 1, wholeR = (r) => hotR(r) && rng.c1 === 0 && rng.c2 === COLS - 1;
    const build = (name, cs, rs, withColHead, withRowHead) => {
      const p = panes[name]; const need = new Set();
      const place = (el, x, y, w, hh) => { const st = el.style; st.left = `${x - p.left}px`; st.top = `${y - p.top}px`; if (w !== undefined) { st.width = `${w}px`; st.height = `${hh}px`; } };
      const get = (k, make) => { let el = p.pool.get(k); if (!el) { el = make(); p.pool.set(k, el); p.layer.append(el); } need.add(k); return el; };
      if (withColHead) for (const c of cs) { const el = get(`h${c}`, () => h('div', { 'data-c': String(c) })); paintHeader(el, 'c', c, hotC(c), wholeC(c)); place(el, HW + colLeft[c], 0, colLeft[c + 1] - colLeft[c], HH); }
      if (withRowHead) for (const r of rs) { const el = get(`r${r}`, () => h('div', { 'data-r': String(r) })); paintHeader(el, 'r', r, hotR(r), wholeR(r)); place(el, 0, HH + rowTop[r], HW, rowTop[r + 1] - rowTop[r]); }
      if (name === 'corner') { const el = get('x', () => h('div', { class: 'sx-h sx-hx', 'aria-label': 'Select all', role: 'columnheader' })); place(el, 0, 0, HW, HH); }
      const draw = (c, r) => {
        if (covered.has(r * 64 + c)) return; const m = anchors.get(r * 64 + c);
        const el = get(`${r},${c}`, () => h('div', { role: 'gridcell', 'data-c': String(c), 'data-r': String(r), 'aria-colindex': String(c + 1), 'aria-rowindex': String(r + 1) }));
        const w = m ? colLeft[m.c2 + 1] - colLeft[m.c1] : colLeft[c + 1] - colLeft[c], hh = m ? rowTop[m.r2 + 1] - rowTop[m.r1] : rowTop[r + 1] - rowTop[r];
        paintCell(el, c, r, m, rng, act); place(el, HW + colLeft[c], HH + rowTop[r], undefined, undefined); void w; void hh;
      };
      if (cs.length && rs.length) {
        for (const r of rs) for (const c of cs) draw(c, r);
        for (const m of s.merges) {                                   // a merged cell whose top-left is off screen but whose body is in view
          const inPane = (m.c1 >= fc) === (name === 'top' || name === 'main') && (m.r1 >= fr) === (name === 'left' || name === 'main');
          if (!inPane || need.has(`${m.r1},${m.c1}`)) continue;
          const vis = (list, a, b) => list.length && !(list[list.length - 1] < a || list[0] > b);
          if (vis(cs, m.c1, m.c2) && vis(rs, m.r1, m.r2)) draw(m.c1, m.r1);
        }
      }
      for (const [k, el] of p.pool) if (!need.has(k)) { el.remove(); p.pool.delete(k); }
    };
    build('corner', colsF, rowsF, true, true); build('top', colsS, rowsF, true, false); build('left', colsF, rowsS, false, true); build('main', colsS, rowsS, false, false);
    last = sigAll;
  }
  let raf = 0; const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); ed.afterScroll?.(); }); };
  scroller.addEventListener('scroll', () => {
    const sx = scroller.scrollLeft, sy = scroller.scrollTop;
    chartLayer.style.transform = `translate(${-sx}px,${-sy}px)`;
    panes.main.layer.style.transform = `translate(${-sx}px,${-sy}px)`; panes.top.layer.style.transform = `translate(${-sx}px,0)`; panes.left.layer.style.transform = `translate(0,${-sy}px)`;
    ed.afterScroll?.(); schedule();
  }, { passive: true });
  const ro = new ResizeObserver(() => { const nw = scroller.clientWidth, nh = scroller.clientHeight; if (!nw || !nh || (nw === W && nh === H)) return; W = nw; H = nh; stage.style.width = `${W}px`; stage.style.height = `${H}px`; layout(); schedule(); });
  function relayout() { layout(); render(); }
  function refresh() { render(); }
  function attach() { ro.observe(scroller); W = scroller.clientWidth || 600; H = scroller.clientHeight || 400; stage.style.width = `${W}px`; stage.style.height = `${H}px`; layout(); render(); }

  // ---- pointer
  let drag = null; let lastPt = null; let scrollTimer = 0;
  const autoScroll = () => {
    if (!drag || !lastPt) { scrollTimer = 0; return; }
    const b = stage.getBoundingClientRect(); const dx = lastPt.x > b.right - 18 ? 24 : lastPt.x < b.left + HW + fw + 6 ? -24 : 0; const dy = lastPt.y > b.bottom - 18 ? 24 : lastPt.y < b.top + HH + fh + 6 ? -24 : 0;
    if (drag.type === 'select' || drag.type === 'fill') { if (dx || dy) { scroller.scrollLeft += dx; scroller.scrollTop += dy; const t = hit(lastPt.x, lastPt.y); if (t.kind === 'cell') (drag.type === 'select' ? ed.dragTo : ed.fillTo)(t.c, t.r); } }
    scrollTimer = requestAnimationFrame(autoScroll);
  };
  stage.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    if (e.target.closest?.('.sx-chart')) return;
    if (e.target.closest?.('.sx-dvbtn')) { e.preventDefault(); ed.dvMenu(e.target.closest('.sx-dvbtn')); return; }
    if (e.target.closest?.('.sx-fbtn')) { e.preventDefault(); ed.filterMenu(Number(e.target.closest('.sx-fbtn').dataset.fc), e.target.closest('.sx-fbtn')); return; }
    const t = hit(e.clientX, e.clientY); ed.focusGrid();
    if (t.kind === 'fill') { drag = { type: 'fill' }; ed.fillStart(); }
    else if (t.kind === 'colEdge') { drag = { type: 'resize', axis: 'c', idx: t.c, x0: e.clientX, w0: colLeft[t.c + 1] - colLeft[t.c] }; ed.resizeStart('c', t.c); }
    else if (t.kind === 'rowEdge') { drag = { type: 'resize', axis: 'r', idx: t.r, y0: e.clientY, w0: rowTop[t.r + 1] - rowTop[t.r] }; ed.resizeStart('r', t.r); }
    else if (t.kind === 'cell') { ed.pointerCell(t.c, t.r, { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey }); drag = { type: 'select' }; }
    else if (t.kind === 'col') { ed.pointerHead('c', t.c, { shift: e.shiftKey }); drag = { type: 'select', head: 'c' }; }
    else if (t.kind === 'row') { ed.pointerHead('r', t.r, { shift: e.shiftKey }); drag = { type: 'select', head: 'r' }; }
    else if (t.kind === 'corner') { ed.selectAll(); return; }
    else return;
    e.preventDefault(); try { stage.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    lastPt = { x: e.clientX, y: e.clientY }; if (!scrollTimer) scrollTimer = requestAnimationFrame(autoScroll);
  });
  stage.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return; lastPt = { x: e.clientX, y: e.clientY };
    if (!drag) { const t = hit(e.clientX, e.clientY); stage.style.cursor = t.kind === 'colEdge' ? 'col-resize' : t.kind === 'rowEdge' ? 'row-resize' : t.kind === 'fill' ? 'crosshair' : ''; return; }
    if (drag.type === 'resize') { if (drag.axis === 'c') ed.resize('c', drag.idx, drag.w0 + e.clientX - drag.x0); else ed.resize('r', drag.idx, drag.w0 + e.clientY - drag.y0); return; }
    const t = hit(e.clientX, e.clientY);
    if (drag.type === 'select') { if (drag.head === 'c') { if (t.c !== undefined) ed.dragHead('c', t.c); } else if (drag.head === 'r') { if (t.r !== undefined) ed.dragHead('r', t.r); } else if (t.kind === 'cell') ed.dragTo(t.c, t.r); else if (t.kind === 'col') ed.dragTo(t.c, scroller.scrollTop > 0 ? rowAt(fh + scroller.scrollTop) : 0); else if (t.kind === 'row') ed.dragTo(0, t.r); }
    else if (drag.type === 'fill' && t.kind === 'cell') ed.fillTo(t.c, t.r);
  });
  const end = (e) => { if (!drag) return; const d = drag; drag = null; lastPt = null; try { stage.releasePointerCapture(e.pointerId); } catch { /* released */ } if (d.type === 'resize') ed.resizeEnd(); else if (d.type === 'fill') ed.fillEnd(); else ed.pointerUp(); };
  stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
  stage.addEventListener('click', (e) => {
    if (e.target.closest?.('.sx-chart, .sx-dvbtn, .sx-fbtn')) return;                              // touch and pen: a tap selects; a second tap on the active cell edits
    if (e.pointerType === 'mouse' || !e.pointerType) return;
    const t = hit(e.clientX, e.clientY);
    if (t.kind === 'cell') { const a = ed.active(); if (a.c === t.c && a.r === t.r) ed.edit(); else ed.pointerCell(t.c, t.r, {}); ed.pointerUp(); }
    else if (t.kind === 'col') { ed.pointerHead('c', t.c, {}); ed.pointerUp(); } else if (t.kind === 'row') { ed.pointerHead('r', t.r, {}); ed.pointerUp(); } else if (t.kind === 'corner') ed.selectAll();
  });
  stage.addEventListener('dblclick', (e) => {
    if (e.target.closest?.('.sx-chart')) return; const t = hit(e.clientX, e.clientY); if (t.kind === 'cell') ed.edit(); else if (t.kind === 'colEdge') ed.autofit(t.c); });
  stage.addEventListener('contextmenu', (e) => { if (e.target.closest?.('.sx-chart')) return; e.preventDefault(); const t = hit(e.clientX, e.clientY); ed.context(e.clientX, e.clientY, t); });
  // Mouse wheel: the scroller scrolls natively because the stage sits inside it (position: sticky); nothing to do.

  function placeEditor(c, r) {
    const b = box(c, r); if (!b) { editor.hidden = true; return false; }
    const st = editor.style; st.left = `${b.x}px`; st.top = `${b.y}px`; st.minWidth = `${b.w}px`; st.minHeight = `${b.h}px`; st.height = `${Math.max(b.h, 24)}px`; st.fontSize = `${14 * ed.zoom()}px`; return true;
  }
  return { el: scroller, stage, chartLayer, editor, layout, relayout, refresh, attach, hit, box, scrollTo, placeEditor, visibleRows, colAt, rowAt, stageSize, colLeft: () => colLeft, rowTop: () => rowTop, destroy() { ro.disconnect(); cancelAnimationFrame(raf); cancelAnimationFrame(scrollTimer); } };
}
