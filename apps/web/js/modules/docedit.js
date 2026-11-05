// Docs editing engine: wraps one contenteditable surface. Typing, caret movement, spell-check and IME stay native; every formatting command is done on the
// MODEL of the blocks the selection touches (read the blocks, change them, render them again, put the caret back), so results are the same in every
// browser, never depend on execCommand's inline styles (the page policy forbids them), and undo is a snapshot stack kept by the caller.
import { splitRuns, mapRange, allRuns, runsText, pasteBlocks, normBlocks, safeHref, TEXT_BLOCKS } from './docmodel.js';
import { renderBlock, renderBlocks, readBlock, readBlocks, fixRoot, getPos, setPos, offsetIn, blockOfNode, marksAt, runNode, blocksFromHtml, containersOf, blockLength, dataUrlToBlob } from './docdom.js';

const MARKS = ['b', 'i', 'u', 's', 'sup', 'sub', 'cd', 'a', 'f', 'z', 'c', 'hl'];
const TEXTY = new Set(TEXT_BLOCKS);
const rlen = (rs) => rs.reduce((n, r) => n + r.x.length, 0);
/** Applies f(runs, from, to) to every text container of a block (paragraph, list item, table cell) that the character range from..to touches. */
function mapC(b, from, to, f) {
  let off = 0;
  const hit = (rs) => { const len = rlen(rs); const a = Math.max(from - off, 0), z = Math.min(to - off, len); const out = z > a ? f(rs, a, z) : rs; off += len; return out; };
  if (b.t === 'list') return { ...b, items: b.items.map((it) => ({ ...it, c: hit(it.c) })) };
  if (b.t === 'table') return { ...b, rows: b.rows.map((r) => r.map((c) => ({ ...c, c: hit(c.c) }))) };
  return b.c ? { ...b, c: hit(b.c) } : b;
}
/** Applies f(runs, localOffset) to the one container holding character offset `at`. */
function atC(b, at, f, ci = -1) {
  let off = 0; let done = false; let n = 0;       // ci: the index of the container the caret is really in (offsets alone are ambiguous where an item is empty)
  const hit = (rs) => { const len = rlen(rs); const mine = !done && (ci >= 0 ? n === ci : at >= off && at <= off + len); n += 1; const out = mine ? f(rs, at - off) : rs; if (mine) done = true; off += len; return out; };
  if (b.t === 'list') return { ...b, items: b.items.map((it) => ({ ...it, c: hit(it.c) })) };
  if (b.t === 'table') return { ...b, rows: b.rows.map((r) => r.map((c) => ({ ...c, c: hit(c.c) }))) };
  return b.c ? { ...b, c: hit(b.c) } : b;
}
const cellOffset = (rows, r, c) => { let n = 0; for (let i = 0; i < rows.length; i += 1) for (let j = 0; j < rows[i].length; j += 1) { if (i === r && j === c) return n; n += rlen(rows[i][j].c); } return n; };

export function createEditor(o) {
  const { page } = o; const d = page.ownerDocument; const win = d.defaultView;
  let pending = null, lastPos = null, selFig = null, escaped = false;
  const edit = () => o.canEdit();
  const kids = () => [...page.children];
  const range = () => { const s = win.getSelection(); return s && s.rangeCount ? s.getRangeAt(0) : null; };
  const inside = () => { const r = range(); return r && page.contains(r.startContainer) && page.contains(r.endContainer) ? r : null; };
  const same = (a, b) => a && b && a.b === b.b && a.o === b.o;
  d.addEventListener('selectionchange', () => { const p = getPos(page); if (!p) return; lastPos = p; if (pending && !(same(p.s, p.e) && same(p.s, pending.at))) pending = null; });

  // ---- hydrate images (the signed address is fetched once per file by the caller)
  function hydrate(root) {
    for (const fig of root.querySelectorAll ? root.querySelectorAll('figure.dx-img') : []) {
      const im = fig.querySelector('img'); if (!im || im.getAttribute('src') || im.dataset.busy) continue;
      im.dataset.busy = '1';
      o.imageSrc(fig.dataset.f).then((src) => { if (src) im.src = src; else fig.classList.add('dx-broken'); }, () => fig.classList.add('dx-broken'));
    }
  }
  function load(blocks) { renderBlocks(page, blocks); hydrate(page); selFig = null; pending = null; }
  const blocks = () => { fixRoot(page); return readBlocks(page); };

  // ---- the one way every command changes the document
  function mutate(fn, { start = false, pos: given } = {}) {
    if (!edit()) return false;
    o.beforeEdit?.(); fixRoot(page);
    let pos = given ?? getPos(page) ?? lastPos ?? { s: { b: 0, o: 0 }, e: { b: 0, o: 0 } };
    if (start) pos = { s: pos.s, e: pos.s };
    const all = kids(); if (!all.length) return false;
    const b0 = Math.min(pos.s.b, all.length - 1), b1 = Math.max(b0, Math.min(pos.e.b, all.length - 1));
    const olds = all.slice(b0, b1 + 1); const models = olds.map((el) => readBlock(el));
    const r = range();
    const ranges = models.map((m, i) => {
      const x = { from: i === 0 ? pos.s.o : 0, to: i === models.length - 1 ? pos.e.o : Infinity };
      if ((olds[i].tagName === 'UL' || olds[i].tagName === 'TABLE') && r && i === 0 && olds[i].contains(r.startContainer)) { const el = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement; const cs = containersOf(olds[i]); let k = -1; cs.forEach((c, j) => { if (c === el || c.contains(el)) k = j; }); x.ci = k; }
      if (olds[i].tagName === 'UL' && r) {
        const lis = [...olds[i].querySelectorAll('li')]; const idx = (n) => lis.indexOf((n?.nodeType === 1 ? n : n?.parentElement)?.closest('li'));
        const a = i === 0 && olds[i].contains(r.startContainer) ? idx(r.startContainer) : -1; const z = i === models.length - 1 && olds[i].contains(r.endContainer) ? idx(r.endContainer) : -1;
        x.i0 = a >= 0 ? a : 0; x.i1 = z >= 0 ? z : lis.length - 1;
      }
      return x;
    });
    const res = fn(models, ranges, { ...pos, b0 }); if (!res) return false;
    const nb = normBlocks(res.blocks); const frag = d.createDocumentFragment(); for (const b of nb) frag.append(renderBlock(d, b));
    page.insertBefore(frag, olds[0]); for (const el of olds) el.remove();
    if (!page.firstChild) renderBlocks(page, [{ t: 'p', c: [] }]);
    hydrate(page); setPos(page, res.sel ?? (nb.length === models.length ? pos : { s: pos.s, e: pos.s }));
    pending = null; o.onChange('edit'); return true;
  }

  // ---- character formatting
  const collapsed = () => { const p = getPos(page) ?? lastPos; return !p || (same(p.s, p.e) ? p : null) ? (p ? { ...p } : null) : null; };
  function currentMarks() {
    const r = inside(); const p = getPos(page);
    if (pending && p && same(p.s, pending.at)) return pending.marks;
    if (!r) return {};
    let n = r.startContainer; if (r.collapsed === false && n.nodeType === 1) n = n.childNodes[r.startOffset] ?? n;
    return marksAt(page, n);
  }
  function applyMark(patchFor, test) {
    const p = getPos(page) ?? lastPos;
    if (p && same(p.s, p.e)) { const cur = currentMarks(); const all = test ? test(cur) : false; pending = { marks: { ...cur, ...patchFor(all) }, at: p.s }; Object.keys(pending.marks).forEach((k) => pending.marks[k] === undefined && delete pending.marks[k]); o.onChange('state'); return; }
    mutate((models, ranges) => {
      let all = true, any = false;
      models.forEach((b, i) => mapC(b, ranges[i].from, ranges[i].to, (rs, a, z) => { any = true; if (test && !allRuns(rs, a, z, (x) => test(x))) all = false; return rs; }));
      if (!any) return null;
      const patch = patchFor(test ? all : false);
      return { blocks: models.map((b, i) => mapC(b, ranges[i].from, ranges[i].to, (rs, a, z) => mapRange(rs, a, z, () => patch))) };
    });
  }
  const toggleMark = (key) => applyMark((all) => ({ [key]: all ? undefined : 1, ...(key === 'sup' && !all ? { sub: undefined } : {}), ...(key === 'sub' && !all ? { sup: undefined } : {}) }), (r) => Boolean(r[key]));
  const setMark = (key, value) => applyMark(() => ({ [key]: value ?? undefined }));
  function clearFormat() {
    const none = Object.fromEntries(MARKS.filter((k) => k !== 'a').map((k) => [k, undefined]));
    applyMark(() => none);
    mutate((models) => ({ blocks: models.map((b) => { if (!TEXTY.has(b.t)) return b; const { al, ls, sb, sa, ind, ...rest } = b; return rest; }) }));
  }

  // ---- change case
  const titleCase = (t) => t.toLowerCase().replace(/(^|[\s(\[{"'\u201c\u2018\-\u2014])(\p{L})/gu, (_m, a, c) => a + c.toUpperCase());
  const sentenceCase = (t) => t.toLowerCase().replace(/(^|[.!?]\s+)(\p{L})/gu, (_m, a, c) => a + c.toUpperCase());
  function changeCase(kind) {
    const f = { upper: (t) => t.toUpperCase(), lower: (t) => t.toLowerCase(), title: titleCase, sentence: sentenceCase }[kind]; if (!f) return false;
    return mutate((models, ranges) => ({ blocks: models.map((b, i) => mapC(b, ranges[i].from, ranges[i].to, (rs, a, z) => mapRange(rs, a, z, (r) => (r.fn ? {} : { x: f(r.x) })))) }));
  }
  const insertFootnote = (text) => { const t = String(text ?? '').trim(); return t ? insertRuns([{ x: '\u2063', fn: t }]) : false; };

  // ---- links
  function linkAtCaret() { const r = inside(); const a = r && (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement)?.closest('a'); return a && page.contains(a) ? a : null; }
  function setLink(href, text) {
    const a = linkAtCaret(); const p = getPos(page) ?? lastPos; const h = href ? safeHref(href) : null;
    if (href && !h) return false;
    if (a && p && same(p.s, p.e)) {          // editing the link under the caret: the whole link
      const blk = blockOfNode(page, a); const bi = kids().indexOf(blk);
      const pos = { s: { b: bi, o: offsetIn(blk, a, 0) }, e: { b: bi, o: offsetIn(blk, a, a.childNodes.length) } };
      return mutate((models, ranges) => ({ blocks: models.map((b, i) => mapC(b, ranges[i].from, ranges[i].to, (rs, x, z) => mapRange(rs, x, z, () => ({ a: h ?? undefined })))), sel: { s: pos.s, e: pos.e } }), { pos });
    }
    if (p && same(p.s, p.e)) { if (!h) return true; return insertRuns([{ x: text || h, a: h }]); }
    return mutate((models, ranges) => ({ blocks: models.map((b, i) => mapC(b, ranges[i].from, ranges[i].to, (rs, x, z) => mapRange(rs, x, z, () => ({ a: h ?? undefined })))) })) || true;
  }

  // ---- paragraphs
  const eachText = (fn) => mutate((models, ranges, pos) => ({ blocks: models.map((b, i) => (TEXTY.has(b.t) ? fn(b, ranges[i], pos) : b)) }));
  /** A paragraph style on a list item takes the item out of the list (like a word processor); the rest of the list stays a list. */
  const setBlockType = (t) => mutate((models, ranges, pos) => {
    const out = []; let last = -1;
    models.forEach((b, i) => {
      if (TEXTY.has(b.t)) { out.push({ ...b, t }); last = out.length - 1; }
      else if (b.t === 'list') {
        const { i0 = 0, i1 = b.items.length - 1 } = ranges[i]; const before = b.items.slice(0, i0), after = b.items.slice(i1 + 1);
        if (before.length) out.push({ t: 'list', items: before });
        b.items.slice(i0, i1 + 1).forEach((it) => { out.push({ t, ...(it.lv ? { ind: it.lv } : {}), c: it.c }); last = out.length - 1; });
        if (after.length) out.push({ t: 'list', items: after });
      } else out.push(b);
    });
    return { blocks: out, sel: last >= 0 ? { s: { b: pos.b0 + last, o: 1e9 }, e: { b: pos.b0 + last, o: 1e9 } } : undefined };
  });
  const setAlign = (al) => mutate((models, ranges) => ({ blocks: models.map((b, i) => {
    if (TEXTY.has(b.t)) { const { al: _x, ...rest } = b; return al && al !== 'l' ? { ...rest, al } : rest; }
    if (b.t === 'table') return mapC({ ...b, rows: b.rows.map((r) => r.map((c) => c)) }, ranges[i].from, ranges[i].to, (rs) => rs);   // cells keep their own alignment below
    return b;
  }) }));
  function setCellAlign(al) {
    const cell = tableCell(); if (!cell) return false;
    return mutate((models, _r, pos) => { const b = models[0]; const rows = structuredClone(b.rows); const c = rows[cell.row][cell.col]; if (al === 'c' || al === 'r') c.al = al; else delete c.al; return { blocks: [{ ...b, rows }], sel: { s: pos, e: pos } }; }, { start: true });
  }
  const setSpacing = (patch) => eachText((b) => { const n = { ...b }; for (const [k, v] of Object.entries(patch)) { if (v === null || v === undefined || v === 0) delete n[k]; else n[k] = v; } return n; });
  function indent(delta) {
    return mutate((models, ranges) => ({ blocks: models.map((b, i) => {
      if (b.t === 'list') { const { i0 = 0, i1 = b.items.length - 1 } = ranges[i]; return { ...b, items: b.items.map((it, k) => (k >= i0 && k <= i1 ? { ...it, lv: Math.max(0, it.lv + delta) } : it)) }; }
      if (TEXTY.has(b.t)) { const ind = Math.max(0, (b.ind ?? 0) + delta); const { ind: _x, ...rest } = b; return ind ? { ...rest, ind } : rest; }
      return b;
    }) }));
  }
  function toggleList(kind) {
    return mutate((models, ranges, pos) => {
      let all = true;
      models.forEach((b, i) => { if (b.t === 'list') { const { i0 = 0, i1 = b.items.length - 1 } = ranges[i]; b.items.slice(i0, i1 + 1).forEach((it) => { if (it.k !== kind) all = false; }); } else all = false; });
      const merged = []; const loc = []; let lastPara = -1;
      const addItem = (it) => { let last = merged[merged.length - 1]; if (last?.t !== 'list') { last = { t: 'list', items: [] }; merged.push(last); } const base = last.items.reduce((n, x) => n + rlen(x.c), 0); last.items.push(it); return { idx: merged.length - 1, base }; };
      models.forEach((b, i) => {
        if (b.t === 'list') {
          const { i0 = 0, i1 = b.items.length - 1 } = ranges[i];
          b.items.forEach((it, k) => {
            const hit = k >= i0 && k <= i1;
            if (hit && all) { merged.push({ t: 'p', ...(it.lv ? { ind: it.lv } : {}), c: it.c }); lastPara = merged.length - 1; }
            else { const l = addItem(hit ? { ...it, k: kind, ...(kind !== 'cl' ? { ck: undefined } : {}) } : it); if (k === 0) loc[i] = l; }
          });
        } else if (TEXTY.has(b.t)) loc[i] = addItem({ k: kind, lv: 0, c: b.c });
        else { merged.push(b); loc[i] = { idx: merged.length - 1, base: 0 }; }
      });
      let sel;
      if (all || !loc[0] || !loc[models.length - 1]) { const bi = pos.b0 + Math.max(0, lastPara); sel = { s: { b: bi, o: 0 }, e: { b: bi, o: 0 } }; }
      else sel = { s: { b: pos.b0 + loc[0].idx, o: loc[0].base + pos.s.o }, e: { b: pos.b0 + loc[models.length - 1].idx, o: loc[models.length - 1].base + pos.e.o } };
      return { blocks: merged, sel };
    });
  }
  function toggleCheck(li) { if (!edit()) return; if (li.dataset.ck) delete li.dataset.ck; else li.dataset.ck = '1'; o.onChange('edit'); }

  // ---- tables
  function tableCell() { const r = inside(); const el = r && (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement)?.closest('td,th'); if (!el || !page.contains(el)) return null; return { el, row: el.parentElement.rowIndex, col: el.cellIndex, table: el.closest('table') }; }
  function tableOp(op, arg) {
    const cell = tableCell(); if (!cell) return false;
    return mutate((models, _r, pos) => {
      const b = models[0]; const rows = structuredClone(b.rows); const cols = rows[0].length; const blank = () => ({ c: [] });
      let { row, col } = cell; let hdr = b.hdr; let noBorders = b.nb;
      if (op === 'rowAbove' || op === 'rowBelow') { const at = op === 'rowAbove' ? row : row + 1; if (rows.length >= 500) return null; rows.splice(at, 0, Array.from({ length: cols }, blank)); row = at; if (op === 'rowAbove' && at === 0) hdr = undefined; }
      else if (op === 'colLeft' || op === 'colRight') { const at = op === 'colLeft' ? col : col + 1; if (cols >= 20) return null; rows.forEach((r) => r.splice(at, 0, blank())); col = at; }
      else if (op === 'delRow') { if (rows.length === 1) return { blocks: [{ t: 'p', c: [] }] }; rows.splice(row, 1); row = Math.min(row, rows.length - 1); if (cell.row === 0) hdr = undefined; }
      else if (op === 'delCol') { if (cols === 1) return { blocks: [{ t: 'p', c: [] }] }; rows.forEach((r) => r.splice(col, 1)); col = Math.min(col, rows[0].length - 1); }
      else if (op === 'delTable') return { blocks: [{ t: 'p', c: [] }] };
      else if (op === 'header') hdr = hdr ? undefined : 1;
      else if (op === 'nb') noBorders = noBorders ? undefined : 1;
      else if (op === 'bg') { if (arg) rows[row][col].bg = arg; else delete rows[row][col].bg; }
      else return null;
      const nb = { t: 'table', ...(hdr ? { hdr: 1 } : {}), ...(noBorders ? { nb: 1 } : {}), rows };
      const at = cellOffset(rows, row, col);
      return { blocks: [nb], sel: { s: { b: pos.b0, o: at, n: true }, e: { b: pos.b0, o: at, n: true } } };
    }, { start: true });
  }
  function moveCell(dir) {
    const cell = tableCell(); if (!cell) return false;
    const cells = [...cell.table.querySelectorAll('th,td')]; const i = cells.indexOf(cell.el) + dir;
    if (i >= cells.length) { tableOp('rowBelow'); return true; }
    if (i < 0) return true;
    const rr = d.createRange(); rr.selectNodeContents(cells[i]); rr.collapse(true); const s = win.getSelection(); s.removeAllRanges(); s.addRange(rr); return true;
  }

  function textToTable() {
    return mutate((models, _r, pos) => {
      if (!models.every((b) => TEXTY.has(b.t))) return null;
      const lines = models.flatMap((b) => runsText(b.c).split('\n')).filter((l) => l.trim() !== '');
      const delim = lines.some((l) => l.includes('\t')) ? '\t' : lines.some((l) => l.includes('|')) ? '|' : lines.some((l) => l.includes(',')) ? ',' : null;
      if (!lines.length || (!delim && lines.length < 2)) return null;
      const rows = lines.map((l) => (delim === '|' ? l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|') : delim ? l.split(delim) : [l]).map((x) => ({ c: x.trim() ? [{ x: x.trim() }] : [] })));
      return { blocks: [{ t: 'table', hdr: 1, rows }], sel: { s: { b: pos.b0, o: 0 }, e: { b: pos.b0, o: 0 } } };
    });
  }
  const setDirection = (dir) => eachText((b) => { const { dir: _d, ...rest } = b; return dir === 'rtl' ? { ...rest, dir: 'rtl' } : rest; });
  /** Adds a block right after a given top-level element (the transcript lines use it) and puts the caret at its end. */
  function appendAfter(el, block) {
    const idx = kids().indexOf(el); if (idx < 0) return null;
    mutate((models, _r, pos) => ({ blocks: [models[0], block], sel: { s: { b: pos.b0 + 1, o: 1e9 }, e: { b: pos.b0 + 1, o: 1e9 } } }), { pos: { s: { b: idx, o: 0 }, e: { b: idx, o: 0 } } });
    return kids()[idx + 1] ?? null;
  }
  /** Typing "# ", "- ", "1. ", "[] ", "> " at the start of an empty-so-far paragraph, or "---" / "```" / "| a | b |" plus Enter, changes the block. */
  const MD_SPACE = { '#': { t: 'h1' }, '##': { t: 'h2' }, '###': { t: 'h3' }, '-': { list: 'ul' }, '*': { list: 'ul' }, '1.': { list: 'ol' }, '[]': { list: 'cl' }, '[ ]': { list: 'cl' }, '>': { t: 'quote' }, '```': { t: 'code' } };
  function markdown(trigger) {
    const p = getPos(page); if (!p || !same(p.s, p.e)) return false;
    const blk = kids()[p.s.b]; if (!blk || !(blk.tagName === 'P' || (blk.tagName === 'DIV' && !blk.className)) || blk.dataset?.t) return false;
    const text = blk.textContent.replace(/\u200b/g, ''); if (p.s.o !== text.length || !text) return false;
    let make = null;
    if (trigger === ' ') { const r = MD_SPACE[text]; if (r) make = () => (r.list ? [{ t: 'list', items: [{ k: r.list, lv: 0, c: [] }] }] : [{ t: r.t, c: [] }]); }
    else if (text === '---' || text === '***') make = () => [{ t: 'hr' }, { t: 'p', c: [] }];
    else if (text === '```') make = () => [{ t: 'code', c: [] }];
    else if (/^\|.+\|$/.test(text.trim())) {
      const cells = text.trim().replace(/^\||\|$/g, '').split('|').map((x) => ({ c: x.trim() ? [{ x: x.trim() }] : [] })).slice(0, 20);
      make = () => [{ t: 'table', hdr: 1, rows: [cells, cells.map(() => ({ c: [] }))] }];
    }
    if (!make) return false;
    const isTable = /^\|/.test(text.trim()) && trigger !== ' ';
    return mutate((models, _r, pos) => { const blocks = make(); const at = blocks.findIndex((x) => x.t === 'hp'); void at; const last = blocks.length - 1; const cellOff = isTable ? blocks[0].rows[0].reduce((n, c) => n + rlen(c.c), 0) : 0;
      const bi = pos.b0 + (blocks[0].t === 'hr' ? 1 : 0); return { blocks, sel: { s: { b: bi, o: cellOff, n: true }, e: { b: bi, o: cellOff, n: true } } }; void last; }, { start: true });
  }

  // ---- inserting content
  function deleteSel() { const r = inside(); if (r && !r.collapsed) { d.execCommand('delete'); fixRoot(page); } }
  /** Puts blocks at the caret: text blocks are split around it, anything else goes after the block the caret is in. */
  function insertBlocks(list) {
    if (!edit() || !list.length) return false;
    deleteSel();
    // pasting blocks while the caret sits in an empty list item: that empty item is replaced, not left behind
    let emptyItem = -1; { const r0 = inside(); const li0 = r0 && (r0.startContainer.nodeType === 1 ? r0.startContainer : r0.startContainer.parentElement)?.closest('li'); const top = li0 && blockOfNode(page, li0); if (li0 && top && !li0.textContent.replace(/\u200b/g, '').trim() && !li0.querySelector('ul')) emptyItem = [...top.querySelectorAll('li')].indexOf(li0); }
    return mutate((models, _r, pos) => {
      const b = models[0]; const ins = normBlocks(list); const ci = _r[0]?.ci ?? -1;
      const inline = ins.every((x) => x.t === 'p');
      if (TEXTY.has(b.t)) {
        const res = pasteBlocks(b, pos.s.o, ins); const last = res[res.length - 1]; const right = Math.max(0, rlen(b.c) - pos.s.o);
        const at = TEXTY.has(last.t) ? Math.max(0, rlen(last.c) - right) : 0; let bi = pos.b0 + res.length - 1;
        if (ins.length === 1 && ins[0].t === 'table') { bi = pos.b0 + res.findIndex((x) => x.t === 'table'); return { blocks: res, sel: { s: { b: bi, o: 0 }, e: { b: bi, o: 0 } } }; }     // a new table: the caret goes into its first cell
        return { blocks: res, sel: { s: { b: bi, o: at }, e: { b: bi, o: at } } };
      }
      if ((b.t === 'list' || b.t === 'table') && inline) {
        const rs = ins.flatMap((x, i) => (i ? [{ x: '\n' }, ...x.c] : x.c)); let end = 0;
        const nb = atC(b, pos.s.o, (c, at) => { end = at + rlen(rs); const [l, r] = splitRuns(c, at); return [...l, ...rs, ...r]; }, ci);
        return { blocks: [nb], sel: { s: { b: pos.b0, o: pos.s.o + rlen(rs) }, e: { b: pos.b0, o: pos.s.o + rlen(rs) } }, end };
      }
      const tail = ins[ins.length - 1].t === 'p' || ins[ins.length - 1].t === 'h1' ? [] : [{ t: 'p', c: [] }];
      const lead = b.t === 'list' && emptyItem >= 0 ? (b.items.length > 1 ? [{ ...b, items: b.items.filter((_, i) => i !== emptyItem) }] : []) : [b];
      const at = pos.b0 + lead.length + ins.length - 1 + (tail.length ? 1 : 0);
      return { blocks: [...lead, ...ins, ...tail], sel: { s: { b: at, o: 0 }, e: { b: at, o: 0 } } };
    }, { start: true });
  }
  const insertRuns = (rs) => insertBlocks([{ t: 'p', c: rs }]);
  function insertText(text) { if (!edit()) return; page.focus(); if (pending) { insertBlocks([{ t: 'p', c: [{ x: text, ...pending.marks }] }]); return; } deleteSel(); const r = inside(); if (!r) return;
    const t = d.createTextNode(text); r.insertNode(t); const rr = d.createRange(); rr.setStart(t, t.data.length); rr.collapse(true); const sl = win.getSelection(); sl.removeAllRanges(); sl.addRange(rr); o.onChange('type'); }
  const linesOf = (text) => String(text ?? '').replace(/\r\n?/g, '\n').split('\n').map((l) => ({ t: 'p', c: l ? [{ x: l }] : [] }));
  /** Paste or drop: images are uploaded first and become image blocks; HTML goes through the allow-list in docdom. */
  async function pasteContent({ html, text, files = [], plain = false }) {
    if (!edit()) return;
    const imgs = files.filter((f) => /^image\/(png|jpe?g|gif|webp)$/.test(f.type));
    if (imgs.length) { for (const f of imgs) await o.insertImageFile(f); return; }
    let list = [];
    if (html && !plain) { try { list = blocksFromHtml(html); } catch { list = []; } }
    if (!list.length && text) list = linesOf(text);
    if (!list.length) return;
    const out = [];
    for (const b of list) {
      if (b.t === 'img' && !b.f) { const blob = dataUrlToBlob(b.src); const f = blob ? await o.uploadImage(blob, 'pasted-image') : null; if (f) out.push({ t: 'img', f, alt: b.alt }); }
      else out.push(b);
    }
    if (out.length) insertBlocks(out);
  }

  // ---- images
  const selectedImage = () => selFig;
  function selectFig(fig) { if (selFig === fig) return; selFig?.classList.remove('dx-sel'); selFig = fig; fig?.classList.add('dx-sel'); o.onChange('state'); }
  function setImage(patch) {
    if (!selFig || !edit()) return;
    if ('al' in patch) { if (patch.al === 'c' || patch.al === 'r') selFig.dataset.al = patch.al; else delete selFig.dataset.al; }
    if ('wr' in patch) { if (patch.wr === 'l' || patch.wr === 'r' || patch.wr === 'b') selFig.dataset.wr = patch.wr; else delete selFig.dataset.wr; }
    if ('alt' in patch) { if (patch.alt) selFig.dataset.alt = patch.alt; else delete selFig.dataset.alt; selFig.querySelector('img').alt = patch.alt ?? ''; }
    if ('w' in patch) { selFig.dataset.w = String(patch.w); selFig.querySelector('img').style.width = `${patch.w}px`; }
    o.onChange('edit');
  }
  function removeFig() { if (!selFig || !edit()) return false; const next = selFig.nextElementSibling ?? selFig.previousElementSibling; selFig.remove(); selFig = null; if (!page.firstChild) renderBlocks(page, [{ t: 'p', c: [] }]); if (next) { const rr = d.createRange(); rr.selectNodeContents(next); rr.collapse(true); win.getSelection().removeAllRanges(); win.getSelection().addRange(rr); } o.onChange('edit'); return true; }

  // ---- find and replace in the page (the model-level "replace all" lives in the caller)
  function textNodesOf(c) {
    const out = []; const w = d.createTreeWalker(c, 4, { acceptNode: (n) => (c.tagName === 'LI' && n.parentElement.closest('li') !== c ? 2 : 1) });
    for (let n = w.nextNode(); n; n = w.nextNode()) if (n.data) out.push(n);
    return out;
  }
  function findRanges(re) {
    const out = []; if (!re) return out;
    for (const blk of kids()) {
      if (blk.tagName === 'FIGURE' || blk.tagName === 'HR' || blk.dataset?.t === 'pb' || blk.dataset?.t === 'toc') continue;
      for (const c of containersOf(blk)) {
        const nodes = textNodesOf(c); if (!nodes.length) continue;
        const text = nodes.map((n) => n.data).join(''); re.lastIndex = 0;
        for (const m of text.matchAll(re)) {
          if (!m[0].length) continue;
          const loc = (idx, end) => { let acc = 0; for (const n of nodes) { if (idx < acc + n.data.length || (end && idx === acc + n.data.length)) return [n, idx - acc]; acc += n.data.length; } const l = nodes[nodes.length - 1]; return [l, l.data.length]; };
          const rr = d.createRange(); const [sn, so] = loc(m.index, false); const [en, eo] = loc(m.index + m[0].length, true); rr.setStart(sn, so); rr.setEnd(en, eo); out.push(rr);
        }
      }
    }
    return out;
  }
  function highlight(ranges, cur) {
    const H = win.Highlight; const hl = win.CSS?.highlights; if (!H || !hl) return;
    if (ranges.length) { hl.set('dx-find', new H(...ranges)); if (ranges[cur]) hl.set('dx-cur', new H(ranges[cur])); } else { hl.delete('dx-find'); hl.delete('dx-cur'); }
  }
  function reveal(rr) { const el = rr.startContainer.nodeType === 1 ? rr.startContainer : rr.startContainer.parentElement; el?.scrollIntoView({ block: 'center', behavior: 'auto' }); }
  function replaceRange(rr, text) {
    if (!edit()) return; const parent = rr.startContainer.parentNode; rr.deleteContents(); if (text) rr.insertNode(d.createTextNode(text)); parent?.normalize(); o.onChange('edit');
  }

  // ---- state for the toolbar and menus
  function state() {
    const r = inside(); const p = getPos(page);
    const st = { marks: currentMarks(), type: 'p', al: 'l', ls: 1.15, sb: 0, sa: 0, list: null, table: Boolean(tableCell()), link: linkAtCaret()?.getAttribute('href') ?? null, fig: Boolean(selFig), collapsed: !r || r.collapsed, focused: d.activeElement === page || page.contains(d.activeElement) };
    if (p) {
      const blk = kids()[p.s.b];
      if (blk) {
        const tag = blk.tagName;
        if (/^H[1-3]$/.test(tag)) st.type = tag.toLowerCase(); else if (tag === 'BLOCKQUOTE') st.type = 'quote'; else if (blk.dataset.t === 'code') st.type = 'code'; else if (blk.dataset.t === 'title' || blk.dataset.t === 'subtitle') st.type = blk.dataset.t;
        if (tag === 'UL') { const li = (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement)?.closest('li'); st.list = li?.dataset.k ?? 'ul'; st.type = 'list'; }
        if (blk.dataset?.al) st.al = blk.dataset.al; if (blk.style?.lineHeight) st.ls = parseFloat(blk.style.lineHeight) || 1.15;
        if (blk.style?.marginTop) st.sb = Math.round(parseFloat(blk.style.marginTop) || 0); if (blk.style?.marginBottom) st.sa = Math.round(parseFloat(blk.style.marginBottom) || 0);
      }
    }
    return st;
  }

  // ---- native events
  page.addEventListener('beforeinput', (e) => {
    if (!edit()) return;
    const t = e.inputType;
    if (t === 'historyUndo') { e.preventDefault(); o.undo(); return; }
    if (t === 'historyRedo') { e.preventDefault(); o.redo(); return; }
    if (/^format(Bold|Italic|Underline|StrikeThrough|Superscript|Subscript)$/.test(t)) { e.preventDefault(); return; }
    if (/^(insertOrderedList|insertUnorderedList|formatJustify|formatIndent|formatOutdent|formatSetBlockTextDirection)/.test(t) || t.startsWith('formatJustify')) { e.preventDefault(); return; }
    const r = inside();
    if ((t === 'insertText' && e.data === ' ' && markdown(' ')) || (t === 'insertParagraph' && markdown('\n'))) { e.preventDefault(); return; }
    if (t === 'insertText' && pending && r && r.collapsed && !e.isComposing && e.data) {
      e.preventDefault(); const marks = pending.marks; pending = null; insertRuns([{ x: e.data, ...marks }]); return;
    }
    // leaving a list: Enter on an empty item, or Backspace at the start of an item (the browser would leave styled <font>/<span> debris that the page policy blocks)
    if ((t === 'insertParagraph' || t === 'deleteContentBackward') && r && r.collapsed) {
      const el0 = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement; const li = el0?.closest('li');
      if (li && page.contains(li)) {
        const own = d.createRange(); own.selectNodeContents(li); own.setEnd(r.startContainer, r.startOffset);
        const atStart = own.toString() === '' && !own.cloneContents().querySelector('br, ul'); const empty = !li.textContent.replace(/\u200b/g, '').trim() && !li.querySelector('ul');
        if ((t === 'insertParagraph' && empty) || (t === 'deleteContentBackward' && atStart)) { e.preventDefault(); if (li.parentElement.closest('li')) indent(-1); else toggleList(li.dataset.k ?? 'ul'); return; }
      }
    }
    if (t === 'insertParagraph' && r) {
      const el = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
      if (el?.closest('td,th')) { e.preventDefault(); d.execCommand('insertLineBreak'); return; }
      const blk = el && blockOfNode(page, el);
      if (blk?.dataset?.t === 'code') {
        const p = getPos(page);
        if (p && same(p.s, p.e) && p.s.o === blockLength(blk) && p.s.o > 0 && readBlock(blk).c.at(-1)?.x.endsWith('\n')) {   // Enter on an empty last line leaves the code block
          e.preventDefault();
          mutate((models, _r, pos) => { const b = models[0]; const [l] = splitRuns(b.c, rlen(b.c) - 1); return { blocks: [{ ...b, c: l }, { t: 'p', c: [] }], sel: { s: { b: pos.b0 + 1, o: 0 }, e: { b: pos.b0 + 1, o: 0 } } }; }, { start: true });
          return;
        }
        e.preventDefault(); d.execCommand('insertLineBreak');
      }
    }
  });
  page.addEventListener('input', (e) => {
    if (!edit()) return;
    const fixed = fixRoot(page);
    if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') {
      const r = inside(); const el = r && (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement);
      const li = el?.closest('li'); if (li?.dataset.ck) delete li.dataset.ck;
      const blk = el && blockOfNode(page, el);
      if (blk && (blk.dataset?.t === 'title' || blk.dataset?.t === 'subtitle') && blk.previousElementSibling?.dataset?.t === blk.dataset.t && !blk.textContent) delete blk.dataset.t;
    }
    hydrate(page);
    o.onChange(fixed ? 'edit' : 'type');
  });
  page.addEventListener('paste', (e) => {
    e.preventDefault(); if (!edit()) return;
    const cd = e.clipboardData; if (!cd) return;
    pasteContent({ html: cd.getData('text/html'), text: cd.getData('text/plain'), files: [...(cd.files ?? [])] });
  });
  page.addEventListener('drop', (e) => {
    e.preventDefault(); if (!edit()) return;
    const files = [...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/')); if (!files.length) return;
    const cr = d.caretRangeFromPoint?.(e.clientX, e.clientY); if (cr && page.contains(cr.startContainer)) { const s = win.getSelection(); s.removeAllRanges(); s.addRange(cr); }
    (async () => { for (const f of files) await o.insertImageFile(f); })();
  });
  page.addEventListener('dragover', (e) => e.preventDefault());
  page.addEventListener('mousedown', (e) => { const fig = e.target.closest?.('figure.dx-img'); if (!fig) selectFig(null); });
  page.addEventListener('click', (e) => {
    const fig = e.target.closest?.('figure.dx-img'); if (fig) { selectFig(fig); return; }
    const note = e.target.closest?.('sup.dx-fn'); if (note && o.editNote) { o.editNote(note); return; }
    const ul = e.target.closest?.('ul.dx-list');
    if (ul) for (const li of ul.querySelectorAll('li[data-k=cl]')) {        // the box is drawn in the margin to the left of the item's first line
      const r = li.getBoundingClientRect(); const lh = parseFloat(win.getComputedStyle(li).lineHeight) || 24;
      if (e.clientX < r.left && e.clientX > r.left - 34 && e.clientY >= r.top && e.clientY <= r.top + lh + 2) { toggleCheck(li); return; }
    }
    const a = e.target.closest?.('a'); if (a && (e.ctrlKey || e.metaKey || !edit())) { const h = safeHref(a.getAttribute('href')); if (h) win.open(h, '_blank', 'noopener,noreferrer'); }
  });
  // drag the corner of the selected image to resize it
  page.addEventListener('pointerdown', (e) => {
    const hd = e.target.closest?.('.dx-handle'); if (!hd || !edit()) return;
    e.preventDefault(); const fig = hd.closest('figure'); const im = fig.querySelector('img'); const x0 = e.clientX; const w0 = im.getBoundingClientRect().width; const max = page.clientWidth;
    const move = (ev) => { const w = Math.round(Math.min(max, Math.max(40, w0 + ev.clientX - x0))); fig.dataset.w = String(w); im.style.width = `${w}px`; };
    const up = () => { win.removeEventListener('pointermove', move); win.removeEventListener('pointerup', up); o.onChange('edit'); };
    win.addEventListener('pointermove', move); win.addEventListener('pointerup', up);
  });
  page.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { escaped = true; return; }
    if (!edit()) return;
    const mod = e.ctrlKey || e.metaKey;
    if (selFig && (e.key === 'Backspace' || e.key === 'Delete')) { e.preventDefault(); removeFig(); return; }
    if (e.key === 'Tab' && !mod && !e.altKey) {
      if (escaped) { escaped = false; return; }
      const r = inside(); if (!r) return; const el = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
      if (el?.closest('td,th')) { e.preventDefault(); moveCell(e.shiftKey ? -1 : 1); return; }
      if (el?.closest('li')) { e.preventDefault(); indent(e.shiftKey ? -1 : 1); return; }
      e.preventDefault();
      const p = getPos(page);
      if (e.shiftKey || (p && same(p.s, p.e) && p.s.o === 0)) indent(e.shiftKey ? -1 : 1); else insertText('\t');
      return;
    }
    escaped = false;
  });

  return { el: page, load, blocks, mutate, hydrate, state, focus: () => page.focus({ preventScroll: true }),
    textToTable, setDirection, appendAfter, changeCase, insertFootnote, toggleMark, setMark, clearFormat, setLink, linkAtCaret, setBlockType, setAlign, setCellAlign, setSpacing, indent, toggleList, toggleCheck,
    tableOp, tableCell, insertTable: (rows, cols, hdr) => insertBlocks([{ t: 'table', ...(hdr ? { hdr: 1 } : {}), rows: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ c: [] }))) }]),
    insertBlocks, insertRuns, insertText, pasteContent, deleteSel, selectedImage, selectFig, setImage, removeFig,
    findRanges, highlight, reveal, replaceRange, currentMarks, getPos: () => getPos(page), setPos: (p) => setPos(page, p), lastPos: () => lastPos,
    charBefore: () => { const r = inside() ?? null; if (!r || !r.collapsed) return ''; const n = r.startContainer; if (n.nodeType === 3 && r.startOffset > 0) return n.data[r.startOffset - 1]; const p = getPos(page); return p && p.s.o > 0 ? 'x' : ''; },
    currentBlock: () => { const p = getPos(page) ?? lastPos; const el = p ? kids()[Math.min(p.s.b, kids().length - 1)] : null; return el ? readBlock(el) : null; },
    currentBlockEl: () => { const p = getPos(page) ?? lastPos; return p ? kids()[Math.min(p.s.b, kids().length - 1)] ?? null : null; },
    blockIsEmpty: () => { const p = getPos(page) ?? lastPos; const el = p ? kids()[p.s.b] : null; return Boolean(el && !el.textContent.replace(/\u200b/g, '').trim() && el.tagName === 'P'); },
    selectedText: () => { const r = inside(); return r && !r.collapsed ? r.toString() : ''; }, hasSelection: () => { const r = inside(); return Boolean(r && !r.collapsed); } };
}
