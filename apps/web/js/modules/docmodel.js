// Document model for first-party Docs (Drive documents of kind "document"). The text lives in file_versions.body (1,000,000 characters at most).
// The stored format is JSON, never HTML: nothing the server returns is ever parsed as markup, so a hostile body cannot inject script or styles.
//
// Format v2 (v1 documents open unchanged and become v2 on their next save):
//   { v: 2, page: { size: 'a4' | 'letter', margin: 'normal' | 'narrow' | 'wide' }, tabs: [ { id, title, icon?, blocks: [block...], children: [tab...] } ] }
//   (a v1 body or a v2 body without tabs opens as one tab "Tab 1")
//   text block: { t: 'p'|'title'|'subtitle'|'h1'|'h2'|'h3'|'quote'|'code', c: [run...], al?: 'c'|'r'|'j', ls?: line spacing 0.8-4, sb?: points before, sa?: points after, ind?: 1-8 }
//   list:       { t: 'list', items: [ { k: 'ul'|'ol'|'cl', lv: 0-8, c: [run...], ck?: 1 (checked) } ] }
//   table:      { t: 'table', hdr?: 1, rows: [ [ { c: [run...], al?: 'c'|'r' } ] ] }
//   image:      { t: 'img', f: Drive file id, alt?: text, w?: width in px, al?: 'c'|'r' }
//   { t: 'hr' }  { t: 'pb' } (page break)
//   run: { x: text ('\n' is a line break), b?, i?, u?, s?, sup?, sub?, cd? (code): 1, a?: web or mail link, f?: font key, z?: size in points, c?: '#rrggbb', hl?: '#rrggbb' }
// Everything read back from the editing surface, pasted or imported goes through normalize(): an allow-list that cuts, never throws.
export const MAX_CHARS = 1000000, MAX_BLOCKS = 20000, MAX_RUNS = 5000, MAX_ITEMS = 10000, MAX_LINK = 2000, MAX_ROWS = 500, MAX_COLS = 20, MAX_LEVEL = 8, MAX_ALT = 500, MAX_TABS = 100, MAX_TAB_DEPTH = 3, MAX_TITLE = 120, MAX_NOTE = 1000, MAX_HF = 300;
export const TEXT_BLOCKS = ['p', 'title', 'subtitle', 'h1', 'h2', 'h3', 'quote', 'code'];
const TEXT = new Set(TEXT_BLOCKS);
// Fonts: the self-hosted families plus system stacks. The key is stored; the stack is only used by the editor and the exports.
export const FONTS = {
  geist: { label: 'Geist', css: '"Geist", system-ui, sans-serif', docx: 'Arial', g: 'Sans-serif' },
  inter: { label: 'Inter', css: '"Inter", system-ui, sans-serif', docx: 'Arial', g: 'Sans-serif' },
  roboto: { label: 'Roboto', css: '"Roboto", system-ui, sans-serif', docx: 'Arial', g: 'Sans-serif' },
  opensans: { label: 'Open Sans', css: '"Open Sans", system-ui, sans-serif', docx: 'Arial', g: 'Sans-serif' },
  lato: { label: 'Lato', css: '"Lato", system-ui, sans-serif', docx: 'Arial', g: 'Sans-serif' },
  montserrat: { label: 'Montserrat', css: '"Montserrat", system-ui, sans-serif', docx: 'Arial', g: 'Sans-serif' },
  poppins: { label: 'Poppins', css: '"Poppins", system-ui, sans-serif', docx: 'Arial', g: 'Sans-serif' },
  nunito: { label: 'Nunito', css: '"Nunito", system-ui, sans-serif', docx: 'Arial', g: 'Sans-serif' },
  raleway: { label: 'Raleway', css: '"Raleway", system-ui, sans-serif', docx: 'Arial', g: 'Sans-serif' },
  oswald: { label: 'Oswald', css: '"Oswald", Impact, sans-serif', docx: 'Arial Narrow', g: 'Sans-serif' },
  bricolage: { label: 'Bricolage Grotesque', css: '"Bricolage Grotesque", "Geist", system-ui, sans-serif', docx: 'Arial', g: 'Sans-serif' },
  sans: { label: 'System sans-serif', css: 'Arial, Helvetica, sans-serif', docx: 'Arial', g: 'Sans-serif' },
  merriweather: { label: 'Merriweather', css: '"Merriweather", Georgia, serif', docx: 'Georgia', g: 'Serif' },
  lora: { label: 'Lora', css: '"Lora", Georgia, serif', docx: 'Georgia', g: 'Serif' },
  playfair: { label: 'Playfair Display', css: '"Playfair Display", Georgia, serif', docx: 'Georgia', g: 'Serif' },
  sourceserif: { label: 'Source Serif 4', css: '"Source Serif 4", Georgia, serif', docx: 'Georgia', g: 'Serif' },
  baskerville: { label: 'Libre Baskerville', css: '"Libre Baskerville", Baskerville, Georgia, serif', docx: 'Georgia', g: 'Serif' },
  serif: { label: 'System serif', css: 'Georgia, "Times New Roman", Times, serif', docx: 'Times New Roman', g: 'Serif' },
  mono: { label: 'Geist Mono', css: '"Geist Mono", ui-monospace, Menlo, Consolas, monospace', docx: 'Courier New', g: 'Monospace' },
  courierprime: { label: 'Courier Prime', css: '"Courier Prime", "Courier New", monospace', docx: 'Courier New', g: 'Monospace' },
  courier: { label: 'System typewriter', css: '"Courier New", Courier, monospace', docx: 'Courier New', g: 'Monospace' },
  nastaliq: { label: 'Nastaliq (Urdu)', css: '"Noto Nastaliq Urdu", serif', docx: 'Noto Nastaliq Urdu', g: 'Urdu and Arabic' },
  naskh: { label: 'Naskh (Urdu, Arabic)', css: '"Noto Naskh Arabic", "Noto Nastaliq Urdu", serif', docx: 'Noto Naskh Arabic', g: 'Urdu and Arabic' },
};
export const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];
export const DEFAULT_SIZE = 11;
export const PAGES = { a4: { label: 'A4', w: 210, h: 297 }, letter: { label: 'Letter', w: 215.9, h: 279.4 } };
export const MARGINS = { normal: { label: 'Normal', mm: 25.4 }, narrow: { label: 'Narrow', mm: 12.7 }, wide: { label: 'Wide', mm: 38.1 } };
export const emptyDoc = () => ({ v: 2, page: { size: 'a4', margin: 'normal' }, tabs: [{ id: 't1', title: 'Tab 1', blocks: [{ t: 'p', c: [] }], children: [] }] });

/** Only web and mail links; anything else (javascript:, data:, file:) is dropped. Relative and bare text is not a link. */
export function safeHref(h) {
  const s = String(h ?? '').trim();
  if (!s || s.length > MAX_LINK || /[\u0000-\u001f\u007f\s]/.test(s)) return null;
  try { const u = new URL(s); return ['http:', 'https:', 'mailto:'].includes(u.protocol) ? u.href : null; } catch { return null; }
}
/** '#abc', '#aabbcc' or 'rgb(1,2,3)' to '#aabbcc'; anything else is null. */
export function safeColor(v) {
  const s = String(v ?? '').trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(s); if (m) return `#${[...m[1]].map((c) => c + c).join('')}`;
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  m = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/.exec(s);
  if (m && (m[4] === undefined || parseFloat(m[4]) > 0)) return `#${[m[1], m[2], m[3]].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('')}`;
  return null;
}
const clampNum = (v, lo, hi, dp = 0) => { const n = Number(v); if (!Number.isFinite(n)) return null; const k = 10 ** dp; return Math.round(Math.min(hi, Math.max(lo, n)) * k) / k; };
const cleanText = (s) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​ ]/g, (c) => (c === ' ' ? ' ' : ''));
const MARK_KEYS = ['b', 'i', 'u', 's', 'sup', 'sub', 'cd', 'a', 'f', 'z', 'c', 'hl', 'fn'];
function runs(list) {
  const out = [];
  for (const r of Array.isArray(list) ? list.slice(0, MAX_RUNS) : []) {
    if (!r || typeof r.x !== 'string') continue;
    const x = cleanText(r.x); if (x === '') continue;
    const o = { x };
    if (r.b) o.b = 1; if (r.i) o.i = 1; if (r.u) o.u = 1; if (r.s) o.s = 1;
    if (r.sup) o.sup = 1; else if (r.sub) o.sub = 1;
    if (r.cd) o.cd = 1;
    const fn = typeof r.fn === 'string' ? cleanText(r.fn).slice(0, MAX_NOTE).trim() : ''; if (fn) o.fn = fn;
    const a = r.a ? safeHref(r.a) : null; if (a) o.a = a;
    if (typeof r.f === 'string' && Object.hasOwn(FONTS, r.f)) o.f = r.f;
    const z = r.z !== undefined ? clampNum(r.z, 6, 200, 1) : null; if (z && z !== DEFAULT_SIZE) o.z = z;
    const c = r.c ? safeColor(r.c) : null; if (c) o.c = c;
    const hl = r.hl ? safeColor(r.hl) : null; if (hl) o.hl = hl;
    const last = out[out.length - 1];
    if (last && !o.fn && MARK_KEYS.every((k) => last[k] === o[k])) last.x += o.x; else out.push(o);       // neighbours with the same look merge
  }
  return out;
}
const textAttrs = (b) => {
  const o = {};
  if (b.al === 'c' || b.al === 'r' || b.al === 'j') o.al = b.al;
  if (b.dir === 'rtl') o.dir = 'rtl';
  const ls = b.ls !== undefined ? clampNum(b.ls, 0.8, 4, 2) : null; if (ls && ls !== 1.15) o.ls = ls;
  const sb = b.sb !== undefined ? clampNum(b.sb, 0, 200) : null; if (sb) o.sb = sb;
  const sa = b.sa !== undefined ? clampNum(b.sa, 0, 200) : null; if (sa) o.sa = sa;
  const ind = b.ind !== undefined ? clampNum(b.ind, 0, MAX_LEVEL) : null; if (ind) o.ind = ind;
  return o;
};
const FILE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function listItems(items, kind) {
  const out = []; let prev = -1;
  for (const it of (Array.isArray(items) ? items.slice(0, MAX_ITEMS) : [])) {
    const v1 = Array.isArray(it);
    const k = v1 ? kind : (['ul', 'ol', 'cl'].includes(it?.k) ? it.k : kind ?? 'ul');
    const lv = Math.min(prev + 1, v1 ? 0 : (clampNum(it?.lv, 0, MAX_LEVEL) ?? 0));      // a level never jumps more than one deeper than the item above
    const o = { k, lv, c: runs(v1 ? it : it?.c) }; if (k === 'cl' && !v1 && it?.ck) o.ck = 1;
    out.push(o); prev = lv;
  }
  return out;
}
function table(b) {
  const rows = (Array.isArray(b.rows) ? b.rows.slice(0, MAX_ROWS) : []).map((r) => (Array.isArray(r) ? r.slice(0, MAX_COLS) : []).map((c) => { const o = { c: runs(c?.c) }; if (c?.al === 'c' || c?.al === 'r') o.al = c.al; const bg = c?.bg ? safeColor(c.bg) : null; if (bg) o.bg = bg; return o; })).filter((r) => r.length);
  if (!rows.length) return null;
  const cols = Math.max(...rows.map((r) => r.length));
  for (const r of rows) while (r.length < cols) r.push({ c: [] });
  const t = { t: 'table' }; if (b.hdr) t.hdr = 1; if (b.nb) t.nb = 1; t.rows = rows; return t;
}
const blocksOf = (list, limit) => {
  const blocks = [];
  for (const b of Array.isArray(list) ? list.slice(0, Math.max(0, limit)) : []) {
    const t = b?.t;
    if (t === 'hr' || t === 'pb' || t === 'toc') blocks.push({ t });
    else if (t === 'list' || t === 'ul' || t === 'ol') { const items = listItems(b.items, t === 'list' ? undefined : t); blocks.push({ t: 'list', items: items.length ? items : [{ k: 'ul', lv: 0, c: [] }] }); }
    else if (t === 'table') { const x = table(b); if (x) blocks.push(x); }
    else if (t === 'img') {
      if (typeof b.f !== 'string' || !FILE_ID.test(b.f)) continue;
      const o = { t: 'img', f: b.f.toLowerCase() };
      const alt = typeof b.alt === 'string' ? cleanText(b.alt).slice(0, MAX_ALT) : ''; if (alt) o.alt = alt;
      const w = b.w !== undefined ? clampNum(b.w, 24, 2400) : null; if (w) o.w = w;
      if (b.al === 'c' || b.al === 'r') o.al = b.al;
      if (b.wr === 'l' || b.wr === 'r' || b.wr === 'b') o.wr = b.wr;
      blocks.push(o);
    } else blocks.push({ t: TEXT.has(t) ? t : 'p', ...textAttrs(b ?? {}), c: runs(b?.c) });
  }
  return blocks.length ? blocks : [{ t: 'p', c: [] }];
};
export const newTabId = () => `t${Math.random().toString(36).slice(2, 9)}`;
const TAB_ID = /^[a-z0-9]{2,12}$/;
const hf = (v) => (typeof v === 'string' ? cleanText(v).replace(/\n/g, ' ').trim().slice(0, MAX_HF) : '');
const pageOf = (doc) => {
  const p = doc?.page ?? {}; const o = { size: Object.hasOwn(PAGES, p.size) ? p.size : 'a4', margin: Object.hasOwn(MARGINS, p.margin) ? p.margin : 'normal' };
  if (p.orient === 'l') o.orient = 'l';
  if (Array.isArray(p.mg) && p.mg.length === 4) { const mg = p.mg.map((n) => clampNum(n, 5, 80, 1)); if (mg.every((n) => n !== null)) o.mg = mg; }
  const hd = hf(p.hdr), ft = hf(p.ftr); if (hd) o.hdr = hd; if (ft) o.ftr = ft;
  if (p.pn === 'l' || p.pn === 'c' || p.pn === 'r') o.pn = p.pn;
  if (p.first && (o.hdr || o.ftr || o.pn)) o.first = 1;
  return o;
};
/** Page margins in mm: top, right, bottom, left. */
export const marginsOf = (page) => page.mg ?? Array(4).fill(MARGINS[page.margin ?? 'normal'].mm);
export const pageSize = (page) => { const p = PAGES[page.size]; return page.orient === 'l' ? { w: p.h, h: p.w } : { w: p.w, h: p.h }; };
/** Anything in, a valid v2 document out (v1 and tab-less bodies become one tab). Unknown block types become paragraphs; limits are enforced by cutting, never by throwing. */
export function normalize(doc) {
  let budget = MAX_BLOCKS, count = 0; const seen = new Set();
  const tab = (t, depth, n) => {
    if (!t || typeof t !== 'object' || count >= MAX_TABS) return null;
    count += 1;
    let id = typeof t.id === 'string' && TAB_ID.test(t.id) && !seen.has(t.id) ? t.id : null;
    while (!id || seen.has(id)) id = newTabId();
    seen.add(id);
    const title = (typeof t.title === 'string' ? cleanText(t.title).replace(/\n/g, ' ').trim().slice(0, MAX_TITLE) : '') || `Tab ${n}`;
    const o = { id, title };
    const icon = typeof t.icon === 'string' ? [...cleanText(t.icon).replace(/[<>&"'\s]/g, '')].slice(0, 4).join('') : ''; if (icon) o.icon = icon;
    o.blocks = blocksOf(t.blocks, budget); budget -= o.blocks.length;
    o.children = depth + 1 < MAX_TAB_DEPTH && Array.isArray(t.children) ? t.children.map((c, i) => tab(c, depth + 1, i + 1)).filter(Boolean) : [];
    return o;
  };
  let tabs = Array.isArray(doc?.tabs) ? doc.tabs.map((t, i) => tab(t, 0, i + 1)).filter(Boolean) : [];
  if (!tabs.length) tabs = [tab({ id: 't1', title: 'Tab 1', blocks: doc?.blocks }, 0, 1)];
  return { v: 2, page: pageOf(doc), tabs };
}

// ---- tabs (pages and sub-pages of one document)
/** Every tab in reading order: [{ tab, depth, parent (the array holding it), index }]. */
export function flatTabs(doc) {
  const out = []; const walk = (list, depth) => list.forEach((tab, index) => { out.push({ tab, depth, parent: list, index }); walk(tab.children ?? [], depth + 1); });
  walk(doc.tabs, 0); return out;
}
export const findTab = (doc, id) => flatTabs(doc).find((x) => x.tab.id === id) ?? null;
export const tabCount = (doc) => flatTabs(doc).length;
const clone = (d) => structuredClone(d);
const subtreeDepth = (tab) => 1 + Math.max(0, ...(tab.children ?? []).map(subtreeDepth));
/** Add a tab at the end of `parentId`'s children (or at the top level). Returns { doc, id } or null when a limit is reached. */
export function addTab(doc, parentId = null, title) {
  const d = clone(doc); if (tabCount(d) >= MAX_TABS) return null;
  const id = newTabId(); let list = d.tabs;
  if (parentId) { const f = findTab(d, parentId); if (!f || f.depth + 1 >= MAX_TAB_DEPTH) return null; list = f.tab.children; }
  list.push({ id, title: String(title ?? `Tab ${tabCount(d) + 1}`).slice(0, MAX_TITLE), blocks: [{ t: 'p', c: [] }], children: [] });
  return { doc: normalize(d), id };
}
export function updateTab(doc, id, patch) {
  const d = clone(doc); const f = findTab(d, id); if (!f) return doc;
  if (patch.title !== undefined) f.tab.title = patch.title;
  if (patch.icon !== undefined) { if (patch.icon) f.tab.icon = patch.icon; else delete f.tab.icon; }
  if (patch.blocks) f.tab.blocks = patch.blocks;
  return normalize(d);
}
export const setTabBlocks = (doc, id, blocks) => updateTab(doc, id, { blocks });
/** Deep copy next to the original, with new ids. Returns { doc, id } or null at the limit. */
export function duplicateTab(doc, id) {
  const d = clone(doc); const f = findTab(d, id); if (!f) return null;
  const size = flatTabs({ tabs: [f.tab] }).length; if (tabCount(d) + size > MAX_TABS) return null;
  const copy = clone(f.tab); const reid = (t) => { t.id = newTabId(); t.children.forEach(reid); }; reid(copy); copy.title = `${copy.title} (copy)`.slice(0, MAX_TITLE);
  f.parent.splice(f.index + 1, 0, copy); return { doc: normalize(d), id: copy.id };
}
/** Removes a tab and everything under it. The only top-level tab cannot be deleted (returns null). */
export function deleteTab(doc, id) {
  const d = clone(doc); const f = findTab(d, id); if (!f || (f.depth === 0 && d.tabs.length === 1)) return null;
  f.parent.splice(f.index, 1); return normalize(d);
}
/** Move one place up or down among its siblings. */
export function moveTab(doc, id, dir) {
  const d = clone(doc); const f = findTab(d, id); if (!f) return doc;
  const to = f.index + (dir === 'up' ? -1 : 1); if (to < 0 || to >= f.parent.length) return doc;
  [f.parent[f.index], f.parent[to]] = [f.parent[to], f.parent[f.index]]; return normalize(d);
}
/** Drag and drop: put the tab at `index` among the children of `parentId` (null = top level). Refuses to nest a tab inside itself or beyond the depth limit. */
export function moveTabTo(doc, id, parentId, index) {
  const d = clone(doc); const f = findTab(d, id); if (!f) return doc;
  let target = d.tabs; let depth = 0;
  if (parentId) {
    const p = findTab(d, parentId); if (!p || flatTabs({ tabs: [f.tab] }).some((x) => x.tab.id === parentId)) return doc;
    target = p.tab.children; depth = p.depth + 1;
  }
  if (depth + subtreeDepth(f.tab) > MAX_TAB_DEPTH) return doc;
  f.parent.splice(f.index, 1);
  let at = Math.max(0, Math.min(index, target.length)); if (target === f.parent && f.index < at) at -= 1;
  target.splice(at, 0, f.tab); return normalize(d);
}
/** Make a tab a child of the sibling above it, or lift it one level (next to its former parent). */
export function indentTab(doc, id) {
  const f = findTab(doc, id); if (!f || f.index === 0) return doc;
  const above = f.parent[f.index - 1]; return moveTabTo(doc, id, above.id, above.children.length);
}
export function outdentTab(doc, id) {
  const all = flatTabs(doc); const f = all.find((x) => x.tab.id === id); if (!f || f.depth === 0) return doc;
  const parent = all.find((x) => x.tab.children.some((c) => c.id === id));
  return moveTabTo(doc, id, all.find((x) => x.tab.children.includes(parent.tab))?.tab.id ?? null, parent.index + 1);
}
/** The blocks to work on: one tab's, or every tab's in order. With `headers`, an all-tabs view gets each tab's title as a Title block and a page break between tabs (exports and print). */
export function contentOf(doc, tabId, { headers = false, notes = false } = {}) {
  const d = normalize(doc);
  let blocks;
  if (tabId && tabId !== 'all') { const f = findTab(d, tabId); blocks = (f ?? { tab: d.tabs[0] }).tab.blocks; }
  else { const all = flatTabs(d); blocks = []; all.forEach(({ tab }, i) => { if (headers && all.length > 1) { if (i) blocks.push({ t: 'pb' }); blocks.push({ t: 'title', c: [{ x: tab.title }] }); } blocks.push(...tab.blocks); }); }
  if (headers) blocks = expandToc(blocks);
  if (notes) blocks = withPlainNotes(blocks);
  return { page: d.page, blocks };
}
/** A table of contents block becomes a plain list of the headings (exports and print have no live links). */
export function expandToc(blocks) {
  if (!blocks.some((b) => b.t === 'toc')) return blocks;
  const heads = blocks.filter((b) => /^h[123]$/.test(b.t)).map((b) => ({ k: 'ul', lv: Number(b.t[1]) - 1, c: normRuns([{ x: runsText(b.c) }]) })).filter((it) => it.c.length);
  return blocks.flatMap((b) => (b.t === 'toc' ? [{ t: 'p', c: [{ x: 'Contents', b: 1 }] }, heads.length ? { t: 'list', items: heads } : { t: 'p', c: [{ x: 'Add headings to build the contents.', i: 1 }] }] : [b]));
}
/** The footnotes of some blocks in reading order. */
export function notesOf(blocks) { const out = []; for (const b of blocks) mapBlockRuns(b, (rs) => { for (const r of rs) if (r.fn) out.push(r.fn); return rs; }); return out; }
/** Footnote markers become [1], [2]... and the notes are listed at the end (plain text, Markdown and HTML have no footnotes). */
export function withPlainNotes(blocks) {
  const notes = []; const out = blocks.map((b) => mapBlockRuns(b, (rs) => rs.map((r) => { if (!r.fn) return r; notes.push(r.fn); return { x: `[${notes.length}]` }; })));
  if (!notes.length) return blocks;
  return [...out, { t: 'p', c: [{ x: 'Notes', b: 1 }] }, { t: 'list', items: notes.map((n) => ({ k: 'ol', lv: 0, c: normRuns([{ x: n }]) })) }];
}
export const tabWords = (tab) => { let n = 0; for (const b of tab.blocks) { const m = lineText(b).match(/\S+/g); if (m) n += m.length; } return n; };

/** The stored text to a document. Plain text (legacy) becomes one paragraph per line; a v1 or v2 JSON body is validated. Never throws. */
export function parseBody(text) {
  const s = String(text ?? '');
  if (s.startsWith('{')) { try { const j = JSON.parse(s); if (j && (j.v === 1 || j.v === 2)) return normalize(j); } catch { /* plain text that happens to start with a brace */ } }
  return normalize({ blocks: s.split(/\r?\n/).map((line) => ({ t: 'p', c: line ? [{ x: line }] : [] })) });
}
export const serialize = (doc) => JSON.stringify(normalize(doc));

// ---- reading the model
export const runsText = (rs) => (rs ?? []).map((r) => r.x).join('');
/** Text of one block as the editing surface counts it (line breaks are '\n'; table cells and list items are concatenated without separators). */
export function blockText(b) {
  if (b.t === 'list') return b.items.map((it) => runsText(it.c)).join('');
  if (b.t === 'table') return b.rows.map((r) => r.map((c) => runsText(c.c)).join('')).join('');
  return b.c ? runsText(b.c) : '';
}
const lineText = (b) => (b.t === 'list' ? b.items.map((it) => runsText(it.c)).join('\n') : b.t === 'table' ? b.rows.map((r) => r.map((c) => runsText(c.c)).join('\t')).join('\n') : b.t === 'img' ? (b.alt ?? '') : b.c ? runsText(b.c) : '');
export const plainText = (doc, tab) => contentOf(doc, tab).blocks.map(lineText).join('\n');
export const wordCount = (doc, tab) => { let n = 0; for (const b of contentOf(doc, tab).blocks) { const m = lineText(b).match(/\S+/g); if (m) n += m.length; } return n; };
export const charCount = (doc, spaces = true, tab) => { let n = 0; for (const b of contentOf(doc, tab).blocks) { const t = lineText(b); n += spaces ? t.length : t.replace(/\s/g, '').length; } return n; };
/** Headings for the outline: [{ level, text, index }] where index is the block position (the editor scrolls to it). */
export function outline(doc, tab) {
  return contentOf(doc, tab).blocks.map((b, index) => ({ b, index })).filter(({ b }) => /^h[123]$/.test(b.t)).map(({ b, index }) => ({ level: Number(b.t[1]), text: runsText(b.c).trim() || 'Untitled heading', index }));
}
export const isEmpty = (doc, tab) => contentOf(doc, tab).blocks.every((b) => (TEXT.has(b.t) ? runsText(b.c).trim() === '' : b.t === 'list' ? b.items.every((it) => runsText(it.c).trim() === '') : false));
/** Same content? (ignores how the runs happen to be split) */
export const sameDoc = (a, b) => serialize(a) === serialize(b);
/** Characters the saved text will take. */
export const sizeOf = (doc) => serialize(doc).length;
export const spaceLeft = (size) => Math.max(0, MAX_CHARS - size);

// ---- run helpers used by the editor's model-level operations (formatting a selection, splitting a block on paste)
const sameMarks = (a, b) => MARK_KEYS.every((k) => a[k] === b[k]);
/** Cuts a run list at a character offset: [left, right]. */
export function splitRuns(rs, at) {
  const left = [], right = []; let n = 0;
  for (const r of rs) {
    const end = n + r.x.length;
    if (end <= at) left.push(r); else if (n >= at) right.push(r);
    else { left.push({ ...r, x: r.x.slice(0, at - n) }); right.push({ ...r, x: r.x.slice(at - n) }); }
    n = end;
  }
  return [left, right];
}
/** Applies a change to the characters from..to of a run list. `patch(run)` returns the run's new marks (a plain object merged over the run; a key set to undefined removes the mark). */
export function mapRange(rs, from, to, patch) {
  const [pre, rest] = splitRuns(rs, from); const [mid, post] = splitRuns(rest, to - from);
  return runs([...pre, ...mid.map((r) => ({ ...r, ...patch(r) })), ...post]);
}
/** True when every character from..to carries `test(run)`. */
export function allRuns(rs, from, to, test) {
  const [, rest] = splitRuns(rs, from); const [mid] = splitRuns(rest, to - from);
  return mid.length > 0 && mid.every(test);
}
export const normRuns = runs;
/** Pasting blocks into a text block at an offset: the first pasted text block joins the text before the caret, the last joins the text after it (like a word processor). Returns the blocks that replace `block`. */
export function pasteBlocks(block, at, pasted) {
  const ins = blocksOf(pasted, MAX_BLOCKS);
  const [left, right] = splitRuns(block.c ?? [], at);
  const plain = (b) => b?.t === 'p';
  if (ins.length === 1 && plain(ins[0])) return [{ ...block, c: runs([...left, ...ins[0].c, ...right]) }];
  let head = { ...block, c: left }, tail = { ...block, c: right }, headEmpty = !left.length, tailEmpty = !right.length;
  if (plain(ins[0])) { head = { ...block, c: runs([...left, ...ins[0].c]) }; ins.shift(); headEmpty = false; }
  if (ins.length && plain(ins[ins.length - 1])) { const l = ins.pop(); tail = { ...block, c: runs([...l.c, ...right]) }; tailEmpty = false; }
  const out = [];
  if (!headEmpty) out.push(head);
  out.push(...ins);
  if (!tailEmpty || !out.length || !TEXT.has(out[out.length - 1].t)) out.push(tail);
  return out;
}

// ---- exports generated from the model (never from the page's HTML)
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const LIST_PREFIX = (it, n) => (it.k === 'ol' ? `${n}. ` : it.k === 'cl' ? (it.ck ? '[x] ' : '[ ] ') : '• ');
/** Plain text: bullets, numbers and [x] boxes are written out; tables use tabs. */
export function toText(doc, tab) {
  const d = contentOf(doc, tab, { headers: true, notes: true }); const out = [];
  for (const b of d.blocks) {
    if (b.t === 'list') { const cnt = []; for (const it of b.items) { cnt.length = it.lv + 1; cnt[it.lv] = (cnt[it.lv] ?? 0) + 1; out.push(`${'  '.repeat(it.lv)}${LIST_PREFIX(it, cnt[it.lv])}${runsText(it.c)}`); } }
    else if (b.t === 'hr') out.push('------------------------------');
    else if (b.t === 'pb' || b.t === 'toc') out.push('');
    else if (b.t === 'img') out.push(b.alt ? `[Image: ${b.alt}]` : '[Image]');
    else out.push(lineText(b));
  }
  return out.join('\n');
}
function mdRun(r) {
  let t = r.x.replace(/([\\`*_[\]])/g, '\\$1').replace(/\n/g, '  \n');
  if (r.cd) t = `\`${r.x.replace(/`/g, "'")}\``;
  if (r.b) t = `**${t}**`; if (r.i) t = `*${t}*`; if (r.s) t = `~~${t}~~`;
  if (r.u) t = `<u>${t}</u>`;
  if (r.a) t = `[${t}](${r.a})`;
  return t;
}
const mdRuns = (rs, plainBold) => rs.map((r) => mdRun(plainBold ? { ...r, b: undefined } : r)).join('');
export function toMarkdown(doc, tab) {
  const d = contentOf(doc, tab, { headers: true, notes: true }); const out = [];
  for (const b of d.blocks) {
    if (b.t === 'h1' || b.t === 'title') out.push(`# ${mdRuns(b.c, 1)}`);
    else if (b.t === 'h2' || b.t === 'subtitle') out.push(`## ${mdRuns(b.c, 1)}`);
    else if (b.t === 'h3') out.push(`### ${mdRuns(b.c, 1)}`);
    else if (b.t === 'quote') out.push(mdRuns(b.c).split('\n').map((l) => `> ${l}`).join('\n'));
    else if (b.t === 'code') out.push(`\`\`\`\n${runsText(b.c)}\n\`\`\``);
    else if (b.t === 'list') { const cnt = []; out.push(b.items.map((it) => { cnt.length = it.lv + 1; cnt[it.lv] = (cnt[it.lv] ?? 0) + 1; return `${'  '.repeat(it.lv)}${it.k === 'ol' ? `${cnt[it.lv]}. ` : it.k === 'cl' ? `- [${it.ck ? 'x' : ' '}] ` : '- '}${mdRuns(it.c).replace(/\n/g, ' ')}`; }).join('\n')); }
    else if (b.t === 'table') { const row = (r) => `| ${r.map((c) => mdRuns(c.c).replace(/\n/g, ' ').replace(/\|/g, '\\|')).join(' | ')} |`; out.push([row(b.rows[0]), `| ${b.rows[0].map(() => '---').join(' | ')} |`, ...b.rows.slice(1).map(row)].join('\n')); }
    else if (b.t === 'img') out.push(`![${(b.alt ?? '').replace(/[[\]]/g, '')}](image)`);
    else if (b.t === 'hr') out.push('---');
    else if (b.t === 'pb' || b.t === 'toc') out.push('<!-- page break -->');
    else out.push(mdRuns(b.c));
  }
  return `${out.join('\n\n')}\n`;
}
function htmlRun(r) {
  let t = esc(r.x).replace(/\n/g, '<br>');
  const css = []; if (r.f) css.push(`font-family:${FONTS[r.f].css.replace(/"/g, "'")}`); if (r.z) css.push(`font-size:${r.z}pt`); if (r.c) css.push(`color:${r.c}`); if (r.hl) css.push(`background:${r.hl}`);
  if (css.length) t = `<span style="${esc(css.join(';'))}">${t}</span>`;
  if (r.cd) t = `<code>${t}</code>`; if (r.sup) t = `<sup>${t}</sup>`; if (r.sub) t = `<sub>${t}</sub>`;
  if (r.s) t = `<s>${t}</s>`; if (r.u) t = `<u>${t}</u>`; if (r.i) t = `<em>${t}</em>`; if (r.b) t = `<strong>${t}</strong>`;
  if (r.a) t = `<a href="${esc(r.a)}">${t}</a>`;
  return t;
}
const htmlRuns = (rs) => rs.map(htmlRun).join('') || '<br>';
/** A standalone HTML file generated from the model. `images` maps a file id to a data address (or leave it out and images become their alt text). */
export function toHtml(doc, { tab, title = 'Document', images = {} } = {}) {
  const d = contentOf(doc, tab, { headers: true, notes: true }); const out = [];
  const pstyle = (b) => { const css = []; if (b.al) css.push(`text-align:${{ c: 'center', r: 'right', j: 'justify' }[b.al]}`); if (b.ls) css.push(`line-height:${b.ls}`); if (b.sb) css.push(`margin-top:${b.sb}pt`); if (b.sa) css.push(`margin-bottom:${b.sa}pt`); if (b.ind) css.push(`margin-left:${b.ind * 36}pt`); return css.length ? ` style="${css.join(';')}"` : ''; };
  for (let i = 0; i < d.blocks.length; i += 1) {
    const b = d.blocks[i];
    if (b.t === 'list') {
      let html = ''; const stack = [];
      const open = (k) => { const tag = k === 'ol' ? 'ol' : 'ul'; stack.push(tag); html += `<${tag}${k === 'cl' ? ' style="list-style:none;padding-left:1.2em"' : ''}>`; };
      let depth = -1;
      for (const it of b.items) {
        while (depth > it.lv) { html += `</li></${stack.pop()}>`; depth -= 1; }
        if (depth === it.lv) html += '</li>'; else { while (depth < it.lv) { open(it.k); depth += 1; if (depth < it.lv) html += '<li style="list-style:none">'; } }
        html += `<li>${it.k === 'cl' ? (it.ck ? '&#9745; ' : '&#9744; ') : ''}${htmlRuns(it.c)}`;
      }
      while (depth >= 0) { html += `</li></${stack.pop()}>`; depth -= 1; }
      out.push(html);
    } else if (b.t === 'table') out.push(`<table style="border-collapse:collapse;width:100%">${b.rows.map((r, ri) => `<tr>${r.map((c) => { const tag = b.hdr && ri === 0 ? 'th' : 'td'; return `<${tag} style="border:1px solid #999;padding:4px 8px${c.al ? `;text-align:${c.al === 'c' ? 'center' : 'right'}` : ''}">${htmlRuns(c.c)}</${tag}>`; }).join('')}</tr>`).join('')}</table>`);
    else if (b.t === 'img') { const src = images[b.f]; out.push(src ? `<p style="text-align:${b.al === 'c' ? 'center' : b.al === 'r' ? 'right' : 'left'}"><img src="${esc(src)}" alt="${esc(b.alt ?? '')}"${b.w ? ` width="${b.w}"` : ''}></p>` : `<p><em>[Image${b.alt ? `: ${esc(b.alt)}` : ''}]</em></p>`); }
    else if (b.t === 'hr') out.push('<hr>');
    else if (b.t === 'pb' || b.t === 'toc') out.push('<div style="page-break-after:always"></div>');
    else { const tag = { title: 'h1', subtitle: 'h2', h1: 'h1', h2: 'h2', h3: 'h3', quote: 'blockquote', code: 'pre', p: 'p' }[b.t]; out.push(`<${tag}${pstyle(b)}>${b.t === 'code' ? esc(runsText(b.c)) : htmlRuns(b.c)}</${tag}>`); }
  }
  const page = pageSize(d.page);
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:11pt/1.5 Arial,Helvetica,sans-serif;max-width:${page.w}mm;margin:2rem auto;padding:0 ${marginsOf(d.page)[1]}mm;color:#1b1b1b}pre{background:#f3f3f3;padding:8px;font-family:Courier New,monospace;white-space:pre-wrap}blockquote{border-left:3px solid #aaa;margin-left:0;padding-left:1em;color:#555}img{max-width:100%}</style></head><body>\n${out.join('\n')}\n</body></html>\n`;
}

// ---- find and replace on the model (the current tab or all tabs; the editor highlights matches in the page itself)
export const normBlocks = (list) => blocksOf(list, MAX_BLOCKS);
/** A regular expression for the search box text: plain characters only (never a pattern the user typed). */
export function findRegex(q, { matchCase = false, whole = false } = {}) {
  const s = String(q ?? ''); if (!s) return null;
  const e = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(whole ? `(?<![\\p{L}\\p{N}_])${e}(?![\\p{L}\\p{N}_])` : e, matchCase ? 'gu' : 'giu');
}
/** Applies f(runs) to every text container of a block (paragraph, list item, table cell). */
export function mapBlockRuns(b, f) {
  if (b.t === 'list') return { ...b, items: b.items.map((it) => ({ ...it, c: f(it.c) })) };
  if (b.t === 'table') return { ...b, rows: b.rows.map((r) => r.map((c) => ({ ...c, c: f(c.c) }))) };
  return b.c ? { ...b, c: f(b.c) } : b;
}
export function replaceInRuns(rs, re, repl) {
  re.lastIndex = 0; const ms = [...runsText(rs).matchAll(re)].filter((m) => m[0].length);
  if (!ms.length) return { runs: rs, count: 0 };
  let out = rs;
  for (const m of ms.reverse()) {
    const [pre, rest] = splitRuns(out, m.index); const [mid, post] = splitRuns(rest, m[0].length);
    const { x, ...marks } = mid[0] ?? {};
    out = [...pre, ...(repl ? [{ ...marks, x: repl }] : []), ...post];
  }
  return { runs: runs(out), count: ms.length };
}
export function replaceInBlocks(blocks, re, repl) {
  let count = 0;
  const out = blocks.map((b) => mapBlockRuns(b, (rs) => { const r = replaceInRuns(rs, re, repl); count += r.count; return r.runs; }));
  return { blocks: out, count };
}
export function countInBlocks(blocks, re) {
  let n = 0; const f = (rs) => { re.lastIndex = 0; n += [...runsText(rs).matchAll(re)].filter((m) => m[0].length).length; return rs; };
  for (const b of blocks) mapBlockRuns(b, f);
  return n;
}
