// Slides: the stored model. JSON only (never HTML), checked on every load; text is plain text.
//   { v: 1, theme: 'ledger'|'light'|'dark', slides: [ { id, layout: 'title'|'title-body'|'blank', title, body, notes,
//       boxes: [ { id, k: 'text'|'shape'|'img', x, y, w, h (percent of the slide), text?, fill?: '#rrggbb', a?: attachment id } ] } ] }
export const MIME = 'application/vnd.l2f.slides+json';
export const THEMES = [['ledger', 'Ledger (dark)'], ['light', 'Light'], ['dark', 'Night']];
export const LAYOUTS = [['title', 'Title'], ['title-body', 'Title and body'], ['blank', 'Blank']];
export const MAX_SLIDES = 200, MAX_BOXES = 40, MAX_TEXT = 4000;
const HEX = /^#[0-9a-f]{6}$/i; const UUIDISH = /^[0-9a-f-]{36}$/i;
const str = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, n) : '');
const pct = (v, d) => (Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v * 10) / 10)) : d);
let seq = 0; export const newId = () => `s${Date.now().toString(36)}${(seq++).toString(36)}`;

export const emptySlide = (layout = 'title-body') => ({ id: newId(), layout, title: '', body: '', notes: '', boxes: [] });
export const emptyDeck = () => ({ v: 1, theme: 'ledger', slides: [{ ...emptySlide('title'), title: 'Title', body: 'Subtitle' }] });

function cleanBox(b) {
  if (!b || !['text', 'shape', 'img'].includes(b.k)) return null;
  const o = { id: str(b.id, 24) || newId(), k: b.k, x: pct(b.x, 10), y: pct(b.y, 10), w: Math.max(2, pct(b.w, 30)), h: Math.max(2, pct(b.h, 20)) };
  if (b.k === 'text') o.text = str(b.text, MAX_TEXT);
  if (b.k === 'shape') o.fill = HEX.test(b.fill ?? '') ? b.fill.toLowerCase() : '#ffc633';
  if (b.k === 'img') { if (!UUIDISH.test(b.a ?? '')) return null; o.a = b.a; }
  return o;
}
export function parseDeck(text) {
  let raw; try { raw = JSON.parse(text); } catch { raw = null; }
  if (!raw || !Array.isArray(raw.slides)) return emptyDeck();
  const deck = { v: 1, theme: THEMES.some(([k]) => k === raw.theme) ? raw.theme : 'ledger', slides: [] };
  for (const s of raw.slides.slice(0, MAX_SLIDES)) {
    deck.slides.push({ id: str(s?.id, 24) || newId(), layout: LAYOUTS.some(([k]) => k === s?.layout) ? s.layout : 'title-body', title: str(s?.title, 300), body: str(s?.body, MAX_TEXT), notes: str(s?.notes, MAX_TEXT),
      boxes: (Array.isArray(s?.boxes) ? s.boxes : []).slice(0, MAX_BOXES).map(cleanBox).filter(Boolean) });
  }
  if (!deck.slides.length) deck.slides.push(emptySlide('title'));
  return deck;
}
export const serializeDeck = (d) => JSON.stringify(d);
/** The attachment ids a deck uses (they stay referenced for every version). */
export const assetsOf = (d) => [...new Set(d.slides.flatMap((s) => s.boxes.filter((b) => b.k === 'img').map((b) => b.a)))];
export function moveSlide(d, from, to) { if (to < 0 || to >= d.slides.length || from === to) return false; const [s] = d.slides.splice(from, 1); d.slides.splice(to, 0, s); return true; }
export function duplicateSlide(d, i) { if (d.slides.length >= MAX_SLIDES) return -1; const c = structuredClone(d.slides[i]); c.id = newId(); c.boxes.forEach((b) => { b.id = newId(); }); d.slides.splice(i + 1, 0, c); return i + 1; }
