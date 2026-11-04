// Docs editing surface <-> model. The model (docmodel.js) is JSON; this file builds DOM from it with createElement (never innerHTML), reads the DOM back
// through an allow-list (tags, data attributes and CSSOM values it knows; everything else is ignored), converts pasted/imported HTML the same way,
// and maps selections to (block, character offset) positions so edits can be done on the model and the caret put back afterwards.
// Inline styles are only ever written through CSSOM (el.style.x = ...), which the page policy allows; the style attribute is never set from text.
import { normRuns, safeHref, safeColor, FONTS, DEFAULT_SIZE } from './docmodel.js';

const SEP = /^(P|DIV|H[1-6]|BLOCKQUOTE|PRE|FIGURE|ADDRESS|ARTICLE|SECTION)$/;
const SKIP = /^(SCRIPT|STYLE|IMG|SVG|CANVAS|IFRAME|OBJECT|EMBED|INPUT|BUTTON|SELECT|TEXTAREA|HEAD|META|LINK|NOSCRIPT|TEMPLATE|VIDEO|AUDIO)$/;
export const LEAF_BLOCKS = new Set(['hr', 'pb', 'img']);

// ---- model -> DOM
function runNode(d, r) {
  const frag = d.createDocumentFragment();
  r.x.split('\n').forEach((t, i) => { if (i) frag.append(d.createElement('br')); if (t) frag.append(d.createTextNode(t)); });
  let node = frag;
  const wrap = (tag, set) => { const el = d.createElement(tag); set?.(el); el.append(node); node = el; };
  if (r.fn) wrap('sup', (el) => { el.className = 'dx-fn'; el.dataset.fn = r.fn; el.title = r.fn; }); if (r.cd) wrap('code'); if (r.b) wrap('strong'); if (r.i) wrap('em'); if (r.u) wrap('u'); if (r.s) wrap('s'); if (r.sup && !r.fn) wrap('sup'); if (r.sub) wrap('sub');
  if (r.f || r.z || r.c || r.hl) wrap('span', (el) => { if (r.f) el.dataset.f = r.f; if (r.z) el.style.fontSize = `${r.z}pt`; if (r.c) el.style.color = r.c; if (r.hl) el.style.backgroundColor = r.hl; });
  if (r.a) wrap('a', (el) => { el.setAttribute('href', r.a); el.target = '_blank'; el.rel = 'noopener noreferrer'; });
  return node;
}
const fillRuns = (el, rs) => { const d = el.ownerDocument; if (!rs.length) el.append(d.createElement('br')); for (const r of rs) el.append(runNode(d, r)); return el; };
function attrs(el, b) {
  if (b.al) el.dataset.al = b.al;
  if (b.ls) el.style.lineHeight = String(b.ls);
  if (b.sb) el.style.marginTop = `${b.sb}pt`;
  if (b.sa) el.style.marginBottom = `${b.sa}pt`;
  if (b.ind) el.style.marginLeft = `${b.ind * 36}pt`;
  return el;
}
function renderList(d, b) {
  const root = d.createElement('ul'); root.className = 'dx-list';
  const stack = [root]; let last = null;
  for (const it of b.items) {
    while (stack.length - 1 > it.lv) stack.pop();
    while (stack.length - 1 < it.lv) { const u = d.createElement('ul'); u.className = 'dx-list'; (last ?? stack[stack.length - 1].lastElementChild ?? stack[stack.length - 1]).append(u); stack.push(u); }
    const li = d.createElement('li'); li.dataset.k = it.k; if (it.ck) li.dataset.ck = '1';
    fillRuns(li, it.c); stack[stack.length - 1].append(li); last = li;
  }
  return root;
}
export function renderBlock(d, b) {
  switch (b.t) {
    case 'hr': return d.createElement('hr');
    case 'pb': { const e = d.createElement('div'); e.className = 'dx-pb'; e.dataset.t = 'pb'; e.contentEditable = 'false'; e.textContent = 'Page break'; return e; }
    case 'list': return renderList(d, b);
    case 'toc': { const e = d.createElement('div'); e.className = 'dx-toc'; e.dataset.t = 'toc'; e.contentEditable = 'false'; return e; }
    case 'table': {
      const t = d.createElement('table'); t.className = 'dx-table'; const body = d.createElement('tbody'); t.append(body);
      b.rows.forEach((r, ri) => { const tr = d.createElement('tr'); for (const c of r) { const td = d.createElement(b.hdr && ri === 0 ? 'th' : 'td'); if (c.al) td.dataset.al = c.al; fillRuns(td, c.c); tr.append(td); } body.append(tr); });
      return t;
    }
    case 'img': {
      const f = d.createElement('figure'); f.className = 'dx-img'; f.contentEditable = 'false'; f.dataset.f = b.f; if (b.al) f.dataset.al = b.al; if (b.wr) f.dataset.wr = b.wr; if (b.alt) f.dataset.alt = b.alt;
      const im = d.createElement('img'); im.alt = b.alt ?? ''; im.draggable = false; if (b.w) { f.dataset.w = String(b.w); im.style.width = `${b.w}px`; }
      f.append(im, Object.assign(d.createElement('span'), { className: 'dx-handle' })); f.lastChild.setAttribute('aria-hidden', 'true'); return f;
    }
    case 'h1': case 'h2': case 'h3': return attrs(fillRuns(d.createElement(b.t), b.c), b);
    case 'quote': return attrs(fillRuns(d.createElement('blockquote'), b.c), b);
    case 'code': { const e = fillRuns(d.createElement('div'), b.c); e.className = 'dx-code'; e.dataset.t = 'code'; return attrs(e, b); }
    default: { const e = fillRuns(d.createElement('p'), b.c); if (b.t === 'title' || b.t === 'subtitle') e.dataset.t = b.t; return attrs(e, b); }
  }
}
export function renderBlocks(root, blocks) { const d = root.ownerDocument; root.replaceChildren(...blocks.map((b) => renderBlock(d, b))); }

// ---- DOM -> model
const fontKey = (css) => {
  const first = String(css ?? '').split(',')[0].replace(/["']/g, '').trim().toLowerCase();
  if (!first) return null;
  if (['georgia', 'times new roman', 'times', 'cambria', 'garamond', 'serif', 'palatino', 'book antiqua', 'noto serif'].includes(first)) return 'serif';
  if (['courier new', 'courier'].includes(first)) return 'courier';
  if (['consolas', 'menlo', 'monaco', 'monospace', 'ui-monospace', 'lucida console', 'geist mono'].includes(first)) return 'mono';
  if (first === 'geist') return 'geist';
  if (first === 'bricolage grotesque') return 'bricolage';
  return null;
};
const sizePt = (v) => { const m = /^([\d.]+)(pt|px)$/.exec(String(v ?? '').trim()); if (!m) return null; const n = m[2] === 'px' ? Number(m[1]) * 0.75 : Number(m[1]); return Math.round(n * 2) / 2; };
function enter(el, st, paste) {
  const tag = el.tagName; let n = null; const set = (k, v) => { n ??= { ...st }; n[k] = v; };
  const css = el.style;
  const fw = css?.fontWeight;
  if (tag === 'B' || tag === 'STRONG') { if (!(fw === 'normal' || fw === '400')) set('b', 1); }
  else if (tag === 'I' || tag === 'EM') set('i', 1);
  else if (tag === 'U') set('u', 1);
  else if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') set('s', 1);
  else if (tag === 'SUP') { if (el.dataset?.fn) set('fn', el.dataset.fn); else set('sup', 1); }
  else if (tag === 'SUB') set('sub', 1);
  else if (tag === 'CODE' || tag === 'TT' || tag === 'KBD') set('cd', 1);
  else if (tag === 'A') { const a = safeHref(el.getAttribute('href')); if (a) set('a', a); }
  if (css) {
    if (!/^(B|STRONG)$/.test(tag) && !/^H[1-6]$/.test(tag) && fw && (fw === 'bold' || fw === 'bolder' || Number(fw) >= 600)) set('b', 1);
    if (css.fontStyle === 'italic') set('i', 1);
    const td = css.textDecorationLine || css.textDecoration || ''; if (/underline/.test(td)) set('u', 1); if (/line-through/.test(td)) set('s', 1);
    if (css.verticalAlign === 'super') set('sup', 1); else if (css.verticalAlign === 'sub') set('sub', 1);
    const f = el.dataset?.f && Object.hasOwn(FONTS, el.dataset.f) ? el.dataset.f : fontKey(css.fontFamily); if (f) set('f', f);
    const z = sizePt(css.fontSize); if (z && (!paste || z !== DEFAULT_SIZE)) set('z', z);
    const c = safeColor(css.color); if (c && !(paste && (c === '#000000' || c === '#ffffff'))) set('c', c);
    const bg = safeColor(css.backgroundColor); if (bg && !(paste && bg === '#ffffff')) set('hl', bg);
  }
  return n ?? st;
}
function trailing(br, stop) {
  for (let n = br; n && n !== stop; n = n.parentNode) { let s = n.nextSibling; while (s && s.nodeType === 3 && !s.data) s = s.nextSibling; if (s) return false; }
  return true;
}
/** Walks one text container (a block, list item or table cell) in the order the model counts characters. `cx` has text(node, str, style), br(node, style), sep(node, style). */
function scan(el, st, cx) {
  let i = 0;
  for (let n = el.firstChild; n; n = n.nextSibling, i += 1) {
    if (cx.target && cx.target.node === el && cx.target.offset === i) cx.found(cx.count);
    if (n.nodeType === 3) { if (n.data) { if (cx.pending && cx.has) { cx.sep(n, st); } cx.pending = false; cx.text(n, n.data, st); cx.has = true; } continue; }
    if (n.nodeType !== 1) continue;
    const tag = n.tagName;
    if (SKIP.test(tag)) continue;
    if (tag === 'BR') { if (cx.pending && cx.has) cx.sep(n, st); cx.pending = false; if (!trailing(n, cx.root)) { cx.br(n, st); cx.has = true; } continue; }
    if (tag === 'UL' || tag === 'OL') { if (cx.skipLists) continue; }
    const block = SEP.test(tag);
    if (block && cx.has && !cx.lastNewline()) { cx.sep(n, st); }
    scan(n, enter(n, st, cx.paste), cx);
    if (block) cx.pending = true;
  }
  if (cx.target && cx.target.node === el && cx.target.offset >= i) cx.found(cx.count);
}
function runsOf(container, { skipLists = false, paste = false } = {}) {
  const out = []; let lastNl = false;
  const push = (x, st) => { out.push({ x, ...st }); lastNl = x.endsWith('\n'); };
  const cx = { root: container, skipLists, paste, has: false, pending: false, lastNewline: () => lastNl,
    text: (n, s, st) => push(s.replace(/ /g, ' '), st), br: (n, st) => push('\n', st), sep: (n, st) => { cx.pending = false; push('\n', st); } };
  scan(container, {}, cx);
  return normRuns(out);
}
const alignOf = (el) => { const a = el.dataset?.al ?? ({ center: 'c', right: 'r', justify: 'j' })[el.style?.textAlign] ?? ({ center: 'c', right: 'r', justify: 'j' })[el.getAttribute?.('align')]; return a; };
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : undefined; };
function textAttrs(el, paste) {
  const o = {}; const al = alignOf(el); if (al) o.al = al;
  if (!paste) {
    const ls = num(el.style.lineHeight); if (ls) o.ls = ls;
    const pt = (v) => (String(v).endsWith('pt') ? num(v) : String(v).endsWith('px') ? num(v) * 0.75 : undefined);
    const sb = pt(el.style.marginTop); if (sb) o.sb = sb; const sa = pt(el.style.marginBottom); if (sa) o.sa = sa;
    const ind = pt(el.style.marginLeft); if (ind) o.ind = Math.round(ind / 36);
  }
  return o;
}
function readList(ul, lv, items, paste) {
  for (const li of ul.children) {
    if (li.tagName === 'UL' || li.tagName === 'OL') { readList(li, lv + 1, items, paste); continue; }
    if (li.tagName !== 'LI') continue;
    const box = paste ? li.querySelector('input[type=checkbox]') : null;
    const k = box ? 'cl' : (['ul', 'ol', 'cl'].includes(li.dataset?.k) ? li.dataset.k : ul.tagName === 'OL' ? 'ol' : 'ul');
    const it = { k, lv, c: runsOf(li, { skipLists: true, paste }) }; if (k === 'cl' && (li.dataset?.ck || box?.checked || box?.hasAttribute('checked'))) it.ck = 1;
    items.push(it);
    for (const sub of li.children) if (sub.tagName === 'UL' || sub.tagName === 'OL') readList(sub, lv + 1, items, paste);
  }
  return items;
}
/** One top-level element of the editing surface (or of pasted HTML) to a model block. */
export function readBlock(el, paste = false) {
  const tag = el.tagName;
  if (el.dataset?.t === 'pb') return { t: 'pb' };
  if (el.dataset?.t === 'toc') return { t: 'toc' };
  if (tag === 'HR') return { t: 'hr' };
  if (tag === 'FIGURE' && el.dataset?.f) return { t: 'img', f: el.dataset.f, alt: el.dataset.alt, w: num(el.dataset.w), al: el.dataset.al, wr: el.dataset.wr };
  if (tag === 'UL' || tag === 'OL') return { t: 'list', items: readList(el, 0, [], paste) };
  if (tag === 'TABLE') {
    const rows = [...el.rows].map((tr) => [...tr.cells].map((c) => { const o = { c: runsOf(c, { paste }) }; const al = alignOf(c); if (al === 'c' || al === 'r') o.al = al; return o; }));
    const hdr = el.rows[0] && [...el.rows[0].cells].every((c) => c.tagName === 'TH');
    return { t: 'table', ...(hdr ? { hdr: 1 } : {}), rows };
  }
  const c = runsOf(el, { paste });
  if (/^H[1-6]$/.test(tag)) return { t: `h${Math.min(3, Number(tag[1]))}`, ...textAttrs(el, paste), c };
  if (tag === 'BLOCKQUOTE') return { t: 'quote', ...textAttrs(el, paste), c };
  if (tag === 'PRE' || el.dataset?.t === 'code') return { t: 'code', ...textAttrs(el, paste), c };
  const t = el.dataset?.t === 'title' || el.dataset?.t === 'subtitle' ? el.dataset.t : 'p';
  return { t, ...textAttrs(el, paste), c };
}
/** Everything in the editing surface as model blocks. Stray text or inline elements at the top level count as paragraphs. */
export function readBlocks(root) {
  const blocks = []; let loose = null;
  const flush = () => { if (loose) { blocks.push(readBlock(loose)); loose = null; } };
  for (const n of root.childNodes) {
    if (n.nodeType === 1 && (SEP.test(n.tagName) || /^(UL|OL|TABLE|HR)$/.test(n.tagName) || n.dataset?.t === 'pb' || n.dataset?.t === 'toc')) { flush(); blocks.push(readBlock(n)); }
    else if ((n.nodeType === 3 && n.data.trim()) || (n.nodeType === 1 && !SKIP.test(n.tagName))) { loose ??= root.ownerDocument.createElement('p'); loose.append(n.cloneNode(true)); }
  }
  flush();
  return blocks.length ? blocks : [{ t: 'p', c: [] }];
}
/** Wraps stray top-level text/inline nodes in paragraphs so every child of the surface is one block. */
export function fixRoot(root) {
  let changed = false;
  for (const n of [...root.childNodes]) {
    const ok = n.nodeType === 1 && (SEP.test(n.tagName) || /^(UL|OL|TABLE|HR)$/.test(n.tagName));
    if (ok) continue;
    changed = true;
    if (n.nodeType === 1 && SKIP.test(n.tagName)) { n.remove(); continue; }
    const p = root.ownerDocument.createElement('p'); n.replaceWith(p); p.append(n);
    if (n.nodeType === 3 && !n.data) p.append(root.ownerDocument.createElement('br'));
  }
  return changed;
}

// ---- selection <-> (block, offset)
export const containersOf = (blk) => (blk.tagName === 'UL' || blk.tagName === 'OL' ? [...blk.querySelectorAll('li')] : blk.tagName === 'TABLE' ? [...blk.querySelectorAll('th,td')] : [blk]);
const isLeaf = (blk) => blk.tagName === 'HR' || blk.tagName === 'FIGURE' || blk.dataset?.t === 'pb' || blk.dataset?.t === 'toc';
function counter(root, target, skipLists) {
  let lastNl = false; let found = null;
  const cx = { root, skipLists, paste: false, has: false, pending: false, count: 0, target, lastNewline: () => lastNl, found: (v) => { found ??= v; },
    text(n, s) { if (target && target.node === n && found === null) found = cx.count + Math.min(target.offset, s.length); cx.count += s.length; lastNl = s.endsWith('\n'); },
    br() { cx.count += 1; lastNl = true; }, sep() { cx.pending = false; cx.count += 1; lastNl = true; } };
  scan(root, {}, cx); return { len: cx.count, found };
}
export function containerLength(c) { return counter(c, null, c.tagName === 'LI').len; }
/** Where a DOM point is, as a character offset in its top-level block. */
export function offsetIn(blk, node, offset) {
  if (isLeaf(blk)) return 0;
  let acc = 0; const cs = containersOf(blk);
  let mine = -1; cs.forEach((c, i) => { if (c === node || c.contains(node)) mine = i; });       // the innermost container (a nested list item sits inside its parent item)
  for (let i = 0; i < cs.length; i += 1) {
    if (i === mine) { const r = counter(cs[i], { node, offset }, cs[i].tagName === 'LI'); return acc + (r.found ?? r.len); }
    acc += containerLength(cs[i]);
  }
  // the point is on the block element itself (or between containers): everything before the child at `offset`
  if (node === blk) { let a = 0; const kids = [...blk.childNodes]; const cs = containersOf(blk); for (const c of cs) { const idx = kids.findIndex((k) => k === c || k.contains(c)); if (idx >= offset) break; a += containerLength(c); } return a; }
  return acc;
}
/** The DOM point for a character offset in a block. */
export function pointIn(blk, offset) {
  if (isLeaf(blk)) return { node: blk.parentNode, offset: [...blk.parentNode.childNodes].indexOf(blk) };
  let acc = 0; const cs = containersOf(blk);
  for (let ci = 0; ci < cs.length; ci += 1) {
    const c = cs[ci]; const len = containerLength(c);
    if (offset > acc + len && ci < cs.length - 1) { acc += len; continue; }
    let need = Math.max(0, offset - acc); let at = null; let lastNl = false; let pos = 0;
    const cx = { root: c, skipLists: c.tagName === 'LI', paste: false, has: false, pending: false, count: 0, lastNewline: () => lastNl, found() {},
      text(n, s) { if (!at && need <= pos + s.length) at = { node: n, offset: need - pos }; pos += s.length; lastNl = s.endsWith('\n'); },
      br(n) { if (!at && need === pos) at = { node: n.parentNode, offset: [...n.parentNode.childNodes].indexOf(n) }; pos += 1; lastNl = true; },
      sep(n) { cx.pending = false; pos += 1; lastNl = true; } };
    scan(c, {}, cx);
    if (at) return at;
    // past the last token: the end of the container (after a trailing break, if that is where the content ends)
    const kids = [...c.childNodes]; const nested = kids.findIndex((k) => k.tagName === 'UL' || k.tagName === 'OL'); const end = nested >= 0 ? nested : kids.length;
    return { node: c, offset: Math.max(0, end - (kids[end - 1]?.tagName === 'BR' ? 1 : 0)) };
  }
  return { node: blk, offset: blk.childNodes.length };
}
export const blockOfNode = (root, node) => { let n = node; while (n && n.parentNode !== root) n = n.parentNode; return n && n.parentNode === root ? n : null; };
/** The selection as { s:{b,o}, e:{b,o} } (b = index of the top-level block), or null when it is outside the surface. */
export function getPos(root) {
  const sel = root.ownerDocument.defaultView.getSelection(); if (!sel || !sel.rangeCount) return null;
  const r = sel.getRangeAt(0); if (!root.contains(r.startContainer) || !root.contains(r.endContainer)) return null;
  const kids = [...root.children];
  const at = (node, off) => { const blk = node === root ? kids[Math.min(off, kids.length - 1)] : blockOfNode(root, node); if (!blk) return null; return { b: kids.indexOf(blk), o: node === root ? (off >= kids.length ? containersOf(blk).reduce((a, c) => a + containerLength(c), 0) : 0) : offsetIn(blk, node, off) }; };
  const s = at(r.startContainer, r.startOffset); const e = r.collapsed ? s : at(r.endContainer, r.endOffset);
  return s && e ? { s, e } : null;
}
export function setPos(root, pos) {
  if (!pos) return;
  const kids = [...root.children]; if (!kids.length) return;
  const pt = (p) => pointIn(kids[Math.min(p.b, kids.length - 1)], p.o);
  const a = pt(pos.s), b = pos.e === pos.s ? a : pt(pos.e);
  const r = root.ownerDocument.createRange();
  try { r.setStart(a.node, a.offset); r.setEnd(b.node, b.offset); } catch { return; }
  const sel = root.ownerDocument.defaultView.getSelection(); sel.removeAllRanges(); sel.addRange(r);
}
/** Text length of a block as the model counts it. */
export const blockLength = (blk) => (isLeaf(blk) ? 0 : containersOf(blk).reduce((a, c) => a + containerLength(c), 0));
export const posCompare = (a, b) => (a.b - b.b) || (a.o - b.o);

// ---- pasted / imported HTML -> blocks (images come back as { t:'img', f:null, src } for the caller to upload)
const BLOCKY = /^(P|DIV|H[1-6]|BLOCKQUOTE|PRE|UL|OL|TABLE|HR|SECTION|ARTICLE|HEADER|FOOTER|MAIN|FIGURE|FIGCAPTION|ADDRESS|DL|FORM)$/;
const IMG_SRC = /^data:image\/(png|jpe?g|gif|webp);base64,/i;
export function blocksFromHtml(html) {
  const doc = new DOMParser().parseFromString(String(html ?? ''), 'text/html');
  const blocks = []; let loose = null;
  const flush = () => { if (loose) { const b = readBlock(loose, true); if (b.c.length) blocks.push(b); loose = null; } };
  const images = (el) => { for (const im of el.querySelectorAll('img')) { const src = im.getAttribute('src') ?? ''; if (IMG_SRC.test(src)) { flush(); blocks.push({ t: 'img', f: null, src, alt: im.getAttribute('alt') ?? '' }); } } };
  const walk = (parent) => {
    for (const n of parent.childNodes) {
      if (n.nodeType === 3) { if (n.data.trim() || loose) { loose ??= doc.createElement('p'); loose.append(n.cloneNode(true)); } continue; }
      if (n.nodeType !== 1 || /^(SCRIPT|STYLE|HEAD|META|LINK|NOSCRIPT|TEMPLATE|IFRAME|OBJECT|EMBED)$/.test(n.tagName)) continue;
      const tag = n.tagName;
      if (tag === 'IMG') { const src = n.getAttribute('src') ?? ''; if (IMG_SRC.test(src)) { flush(); blocks.push({ t: 'img', f: null, src, alt: n.getAttribute('alt') ?? '' }); } continue; }
      if (!BLOCKY.test(tag)) { loose ??= doc.createElement('p'); loose.append(n.cloneNode(true)); continue; }
      flush();
      if (/^(UL|OL|TABLE)$/.test(tag)) { images(n); const b = readBlock(n, true); if (b.t !== 'list' || b.items.some((i) => i.c.length)) blocks.push(b); continue; }
      if (tag === 'HR') { blocks.push({ t: 'hr' }); continue; }
      if (!/^(H[1-6]|P|BLOCKQUOTE|PRE)$/.test(tag) && [...n.children].some((c) => BLOCKY.test(c.tagName) || c.tagName === 'IMG')) { walk(n); flush(); continue; }
      images(n); const b = readBlock(n, true); blocks.push(b);
    }
  };
  walk(doc.body); flush();
  return blocks;
}

export { runNode };
/** A data: address of a picture to a Blob (decoded here: the page policy does not let fetch() read data: addresses). */
export function dataUrlToBlob(u) {
  const m = /^data:([^;,]+);base64,([\s\S]*)$/.exec(String(u ?? '')); if (!m) return null;
  const bin = atob(m[2]); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i += 1) a[i] = bin.charCodeAt(i);
  return new Blob([a], { type: m[1] });
}
/** The text marks in force at a DOM point (what typing there would produce). */
export function marksAt(root, node) {
  const chain = []; for (let n = node?.nodeType === 3 ? node.parentNode : node; n && n !== root; n = n.parentNode) chain.unshift(n);
  let st = {}; for (const el of chain) st = enter(el, st, false); return st;
}

/** Fills every table-of-contents block from the headings of the surface (entries are buttons; `go(index)` scrolls to the heading). */
export function fillToc(root, go) {
  const tocs = root.querySelectorAll(':scope > .dx-toc'); if (!tocs.length) return;
  const d = root.ownerDocument; const kids = [...root.children];
  const heads = kids.map((el, i) => ({ el, i })).filter((x) => /^H[1-3]$/.test(x.el.tagName) && x.el.textContent.trim());
  for (const t of tocs) {
    const entries = heads.map(({ el, i }) => { const b = d.createElement('button'); b.type = 'button'; b.className = `dx-tocb l${el.tagName[1]}`; b.textContent = el.textContent.trim(); b.addEventListener('click', () => go?.(i)); return b; });
    const title = d.createElement('div'); title.className = 'dx-toc-h'; title.textContent = 'Contents';
    t.replaceChildren(title, ...(entries.length ? entries : [Object.assign(d.createElement('div'), { className: 'dx-toc-none', textContent: 'Add headings to build the contents.' })]));
  }
}
/** The numbered footnote list shown under the page (the markers are CSS-counted superscripts in the text). */
export function fillNotes(root, into) {
  const d = root.ownerDocument; const sups = [...root.querySelectorAll('sup.dx-fn')];
  if (!sups.length) { into.replaceChildren(); into.hidden = true; return; }
  into.hidden = false; const ol = d.createElement('ol'); const h2 = d.createElement('div'); h2.className = 'dx-notes-h'; h2.textContent = 'Notes';
  for (const s2 of sups) { const li = d.createElement('li'); li.textContent = s2.dataset.fn ?? ''; ol.append(li); }
  into.replaceChildren(h2, ol);
}
