// Document model for first-party Docs (Drive documents of kind "document"). The text lives in file_versions.body (200,000 characters at most).
// Format v1 is JSON, never HTML: nothing the server returns is ever parsed as markup, so a hostile body cannot inject script or styles.
//   { v: 1, blocks: [ { t: 'p' | 'h1' | 'h2' | 'h3' | 'quote', c: [run...] } | { t: 'ul' | 'ol', items: [[run...], ...] } | { t: 'hr' } ] }
//   run: { x: 'text', b?: 1, i?: 1, u?: 1, s?: 1, a?: a web or mail link }
// Older documents (protected SOPs and anything written as plain text) open as paragraphs and become v1 on their next save.
export const MAX_CHARS = 200000, MAX_BLOCKS = 5000, MAX_RUNS = 2000, MAX_ITEMS = 2000, MAX_LINK = 2000;
const BLOCKS = new Set(['p', 'h1', 'h2', 'h3', 'quote']);
export const emptyDoc = () => ({ v: 1, blocks: [{ t: 'p', c: [] }] });

/** Only web and mail links; anything else (javascript:, data:, file:) is dropped. Relative and bare text is not a link. */
export function safeHref(h) {
  const s = String(h ?? '').trim();
  if (!s || s.length > MAX_LINK || /[\u0000-\u001f\u007f\s]/.test(s)) return null;
  try { const u = new URL(s); return ['http:', 'https:', 'mailto:'].includes(u.protocol) ? u.href : null; } catch { return null; }
}
function runs(list) {
  const out = [];
  for (const r of Array.isArray(list) ? list.slice(0, MAX_RUNS) : []) {
    if (!r || typeof r.x !== 'string' || r.x === '') continue;
    const o = { x: r.x };
    if (r.b) o.b = 1; if (r.i) o.i = 1; if (r.u) o.u = 1; if (r.s) o.s = 1;
    const a = r.a ? safeHref(r.a) : null; if (a) o.a = a;
    const last = out[out.length - 1];
    if (last && ['b', 'i', 'u', 's', 'a'].every((k) => last[k] === o[k])) last.x += o.x; else out.push(o);       // neighbours with the same look merge
  }
  return out;
}
/** Anything in, a valid v1 document out. Unknown block types become paragraphs; limits are enforced by cutting, never by throwing. */
export function normalize(doc) {
  const blocks = [];
  for (const b of Array.isArray(doc?.blocks) ? doc.blocks.slice(0, MAX_BLOCKS) : []) {
    if (b?.t === 'hr') blocks.push({ t: 'hr' });
    else if (b?.t === 'ul' || b?.t === 'ol') blocks.push({ t: b.t, items: (Array.isArray(b.items) ? b.items.slice(0, MAX_ITEMS) : []).map(runs) });
    else blocks.push({ t: BLOCKS.has(b?.t) ? b.t : 'p', c: runs(b?.c) });
  }
  return { v: 1, blocks: blocks.length ? blocks : emptyDoc().blocks };
}
/** The stored text to a document. Plain text (legacy) becomes one paragraph per line; a v1 JSON body is validated. Never throws. */
export function parseBody(text) {
  const s = String(text ?? '');
  if (s.startsWith('{')) { try { const j = JSON.parse(s); if (j && j.v === 1) return normalize(j); } catch { /* plain text that happens to start with a brace */ } }
  return normalize({ blocks: s.split(/\r?\n/).map((line) => ({ t: 'p', c: line ? [{ x: line }] : [] })) });
}
export const serialize = (doc) => JSON.stringify(normalize(doc));
const blockRuns = (b) => (b.t === 'ul' || b.t === 'ol' ? b.items.flat() : b.c ?? []);
export function plainText(doc) {
  return normalize(doc).blocks.map((b) => (b.t === 'hr' ? '' : b.t === 'ul' || b.t === 'ol' ? b.items.map((it) => it.map((r) => r.x).join('')).join('\n') : blockRuns(b).map((r) => r.x).join(''))).join('\n');
}
export const wordCount = (doc) => (plainText(doc).trim().match(/\S+/g) ?? []).length;
/** Headings for the outline: [{ level, text, index }] where index is the block position (the editor scrolls to it). */
export function outline(doc) {
  return normalize(doc).blocks.map((b, index) => ({ b, index })).filter(({ b }) => /^h[123]$/.test(b.t)).map(({ b, index }) => ({ level: Number(b.t[1]), text: blockRuns(b).map((r) => r.x).join('').trim() || 'Untitled heading', index }));
}
export const isEmpty = (doc) => plainText(doc).trim() === '' && !normalize(doc).blocks.some((b) => b.t === 'hr');
/** Same content? (ignores how the runs happen to be split) */
export const sameDoc = (a, b) => serialize(a) === serialize(b);
/** Characters the saved text will take; the editor warns before the 200,000 limit. */
export const sizeOf = (doc) => serialize(doc).length;
