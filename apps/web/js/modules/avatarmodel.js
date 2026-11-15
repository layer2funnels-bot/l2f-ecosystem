// Customer Avatar: the flexible section model (owner, 15 Nov 2026 — "do not hardcode 12 sections").
// An avatar is an ordered list of sections. Each section has a type (one of the known chapter types, or 'custom'), its own title, and its
// content as blocks: { t: 'h', x } a sub-heading · { t: 'p', x } a paragraph · { t: 'li', x } a list item · { t: 'table', rows } (first row = header).
// The Full profile shows every section; the Profile shows only the cards chosen for it (a whole section, or one sub-heading inside it).
// Stored in funnel_avatars.profile as { v: 2, sections: [...], cards: [{ sid, sub }] } next to the Evidence data (ev, interviews).
// Older avatars (fixed chapters, profile v1) are converted on read (legacyToSections) and saved in the new shape on their next save.
// Pure functions only (no DOM), so the same code runs in tests.

/** Known chapter types: the reference avatar document's chapters (Dream Customer Avatar v1.0). Titles are only the starting names. */
export const TYPES = [
  ['market', 'Market map'], ['qual', 'Qualification'], ['basic', 'Basic profile'], ['drives', 'What drives them'], ['beliefs', 'Beliefs'],
  ['desires', 'External vs internal desires'], ['filter', 'Best vs worst customer'], ['niche', 'Niche statement'], ['next', 'What to do next'],
  ['reference', 'Quick reference'], ['notes', 'Context notes'], ['problems', 'Pains and problems'],
];
export const typeTitle = (t) => TYPES.find(([k]) => k === t)?.[1] ?? 'Custom section';
// Words that identify each type in a heading. Order matters: the first strong match wins.
const RULES = [
  ['market', /market\s*map|core\s*market|sub-?markets?|niches? under|chosen niche|hierarchy/i, /\bmarket/i],
  ['qual', /qualif|3 questions|three questions|\bq[123]\b|irrational|willing (and|&) able|excited about/i, /question/i],
  ['basic', /basic profile|demograph|at a glance profile|right now|currently studying|consuming|who (is|are) (he|she|they)/i, /\bage\b|income|location|attribute/i],
  ['drives', /scared|fears?\b|values?\b|want to be|identity|how much they want to learn|motivat|what drives/i, /learn|goal|want/i],
  ['beliefs', /belie(f|ve)|worldview/i, /mindset|root/i],
  ['desires', /desires?\b/i, /external|internal/i],
  ['filter', /best\s*(vs\.?|and|or)\s*worst|best (version|customer)|worst (version|customer)|the filter/i, /\bbest\b|\bworst\b/i],
  ['niche', /niche statement|one-?line|full version|compact version|positioning/i, /statement/i],
  ['next', /what to do next|short-?term|medium-?term|longer?-?term|next steps|what'?s next after/i, /\bnext\b|to ?do/i],
  ['reference', /quick reference|at a glance/i, /summary|reference/i],
  ['notes', /context notes|important context|cultural/i, /notes?\b|context/i],
  ['problems', /pains?\b|problems?\b|challenges?|struggles?/i, /frustrat/i],
];
/** The type a heading most likely belongs to: { key, confidence: 'High' | 'Medium' | 'Low' } (Low = keep it as a custom section). */
export function matchType(heading) {
  const t = String(heading ?? '');
  for (const [k, strong] of RULES) if (strong.test(t)) return { key: k, confidence: 'High' };
  for (const [k, , weak] of RULES) if (weak.test(t)) return { key: k, confidence: 'Medium' };
  return { key: 'custom', confidence: 'Low' };
}
/** "3. AVATAR — BASIC PROFILE" → "Avatar — Basic profile" (numbering removed, shouting calmed, nothing else changed). */
export function cleanHeading(x) {
  let t = String(x ?? '').replace(/\s+/g, ' ').trim().replace(/^(chapter|section|part)?\s*\d+(\.\d+)*[.):\-–]?\s+/i, '');
  // a heading that is really a sentence ("ONE-LINE VERSION Farhat is 21…"): its title is the capitalised lead words; the full text stays as content
  if (t.length > 90) { const lead = /^((?:[A-Z0-9][A-Z0-9'’&\-–—/]*\s+){1,6})(?=[A-Z][a-z])/.exec(t); t = lead ? lead[1].trim() : `${t.slice(0, 60).replace(/\s+\S*$/, '')}…`; }
  // SHOUTED words calmed (each all-capitals word of 2+ letters), then a capital first letter: "THE MARKET MAP (3 levels deep)" → "The market map (3 levels deep)"
  if (/\b[A-Z]{3,}\b/.test(t)) t = t.replace(/\b[A-Z][A-Z'’\-]+\b/g, (w) => w.toLowerCase()).replace(/(\S) A (?=\S)/g, '$1 a ').replace(/^\p{L}/u, (c) => c.toUpperCase());
  return t.slice(0, 120) || 'Untitled section';
}
let seq = 0;
export const newId = () => `s${Date.now().toString(36)}${(++seq).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ---------------------------------------------------------------- reading a document (blocks with heading levels) → outline
/**
 * blocks: [{ t: 'h', lvl, x } | { t: 'p'|'li', x } | { t: 'table', rows }] in document order.
 * Sections start at the document's top heading level; deeper headings become parts inside them. Text before the first heading is kept as
 * its own "Document details" section (never dropped). A heading whose text is long (a sentence) keeps its text as content too.
 */
export function toOutline(blocks) {
  const levels = blocks.filter((b) => b.t === 'h').map((b) => b.lvl ?? 1); const top = levels.length ? Math.min(...levels) : 1;
  const out = []; let sec = null; let part = null;
  const startSection = (heading) => { sec = { heading, parts: [] }; part = { heading: null, blocks: [] }; sec.parts.push(part); out.push(sec); };
  for (const b of blocks) {
    if (b.t === 'h' && (b.lvl ?? 1) <= top) { startSection(b.x); if (b.x.length > 90) part.blocks.push({ t: 'p', x: b.x }); continue; }
    if (!sec) startSection('Document details');
    if (b.t === 'h') { part = { heading: b.x, blocks: [] }; sec.parts.push(part); continue; }
    part.blocks.push(b.t === 'table' ? { t: 'table', rows: b.rows } : { t: b.t, x: b.x });
  }
  for (const s of out) s.parts = s.parts.filter((p) => p.heading || p.blocks.length);
  return out.filter((s) => s.parts.length);
}
const strongFor = (type, heading) => Boolean(RULES.find(([k]) => k === type)?.[1].test(heading));
/** A suggested mapping for an outline: one target per section, and per part 'same' (stays with its section) or another type. */
export function suggestMapping(outline) {
  return outline.map((s) => {
    const m = matchType(s.heading); const target = s.heading === 'Document details' ? 'custom' : m.key;
    return { target, confidence: s.heading === 'Document details' ? 'Low' : m.confidence,
      // a part moves only when its heading clearly names another chapter and says nothing of its own section's (e.g. "What They Are Scared Of" under Basic profile)
      parts: s.parts.map((p) => { if (!p.heading || target === 'custom') return 'same'; const pm = matchType(p.heading); return pm.confidence === 'High' && pm.key !== target && !strongFor(target, p.heading) ? pm.key : 'same'; }) };
  });
}
/**
 * Build the avatar's sections from an outline and the person's mapping. Every top section of the document stays its own section (so a document with
 * five sections gives an avatar with five), typed by its target ('custom' keeps its own kind; 'skip' leaves it out, only when the person chose it).
 * A part mapped to another type joins the first section of that type, or starts one. Nothing is dropped silently.
 */
export function buildSections(outline, mapping) {
  const out = [];
  const firstOf = (type) => out.find((s) => s.type === type) ?? (() => { const s = { id: newId(), type, title: typeTitle(type), blocks: [] }; out.push(s); return s; })();
  outline.forEach((s, i) => {
    const m = mapping[i] ?? { target: 'custom', parts: [] };
    let own = null; const ownSection = () => { if (!own) { own = { id: newId(), type: m.target === 'skip' ? 'custom' : m.target, title: cleanHeading(s.heading), blocks: [] }; out.push(own); } return own; };
    s.parts.forEach((p, j) => {
      const pt = m.parts?.[j] ?? 'same'; if (pt === 'skip' || (pt === 'same' && m.target === 'skip')) return;
      const dest = pt === 'same' ? ownSection() : firstOf(pt);
      if (p.heading) dest.blocks.push({ t: 'h', x: p.heading.slice(0, 200) });
      dest.blocks.push(...p.blocks.map((b) => structuredClone(b)));
    });
  });
  return out.filter((s) => s.blocks.length);
}
/** "Avatar Name: Farhat ____" in a document's opening lines → "Farhat" (to start the name field with). */
export function nameFromOutline(outline) {
  for (const s of outline.slice(0, 2)) for (const p of s.parts) for (const b of p.blocks) { const m = /avatar\s*name\s*[:\-–]\s*([^_\[\]]{1,80}?)\s*(?:_|$|version)/i.exec(b.x ?? ''); if (m && m[1].trim()) return m[1].trim(); }
  return '';
}

// ---------------------------------------------------------------- defaults, profile cards
/** The section list a new avatar starts with when the organization has no settings of its own. */
export const DEFAULT_SETTINGS = { sections: TYPES.map(([type, title]) => ({ type, title, profile: ['basic', 'drives'].includes(type) })) };
/** New sections from settings (blank avatar): each default becomes an empty section; profile cards for those marked "on the profile". */
export function sectionsFromSettings(settings = DEFAULT_SETTINGS) {
  const sections = (settings.sections?.length ? settings.sections : DEFAULT_SETTINGS.sections).map((d) => ({ id: newId(), type: d.type || 'custom', title: (d.title || typeTitle(d.type)).slice(0, 120), blocks: [] }));
  const cards = sections.filter((s, i) => (settings.sections?.length ? settings.sections : DEFAULT_SETTINGS.sections)[i]?.profile).map((s) => ({ sid: s.id, sub: '' }));
  return { sections, cards };
}
// Sub-headings that make good Profile cards by default (per type) — used when an import arrives with no cards chosen yet.
const CARD_HINTS = { basic: [/right now|where they are/i, /studying|consuming/i, ''], drives: [/scared|fear/i, /want to be|identity/i, /values?/i], desires: [/external/i, /internal/i], niche: [/full|one-?line/i] };
export function defaultCards(sections, settings = DEFAULT_SETTINGS) {
  const onProfile = new Set((settings.sections?.length ? settings.sections : DEFAULT_SETTINGS.sections).filter((d) => d.profile).map((d) => d.type));
  const cards = [];
  for (const s of sections) {
    if (!onProfile.has(s.type)) continue;
    const subs = subHeadings(s); const hints = CARD_HINTS[s.type];
    const picked = hints ? hints.map((re) => (re === '' ? null : subs.find((x) => re.test(x)))).filter(Boolean) : [];
    if (s.type === 'basic' && s.blocks.some((b) => b.t === 'table')) cards.push({ sid: s.id, sub: '#table' });
    if (picked.length) cards.push(...picked.map((sub) => ({ sid: s.id, sub }))); else if (!cards.some((c) => c.sid === s.id)) cards.push({ sid: s.id, sub: '' });
  }
  return cards.slice(0, 8);
}
export const subHeadings = (s) => s.blocks.filter((b) => b.t === 'h').map((b) => b.x);
/** The blocks a Profile card shows: the whole section (sub ''), the first table ('#table'), or one sub-heading's part. */
export function cardBlocks(s, sub) {
  if (!s) return [];
  if (!sub) return s.blocks;
  if (sub === '#table') { const t = s.blocks.find((b) => b.t === 'table'); return t ? [t] : []; }
  const i = s.blocks.findIndex((b) => b.t === 'h' && b.x === sub); if (i < 0) return [];
  const j = s.blocks.findIndex((b, k) => k > i && b.t === 'h'); return s.blocks.slice(i + 1, j < 0 ? undefined : j);
}
export const cardTitle = (s, sub) => (!sub ? s?.title ?? 'Section' : sub === '#table' ? 'At a glance' : cleanHeading(sub));

// ---------------------------------------------------------------- content helpers
const PLACEHOLDER = /^\s*\[?\s*fill in\b[^\]]*\]?\s*$/i;
/** Real content (a template's "[FILL IN: …]" prompts and empty cells don't count). */
export function hasContent(s) {
  return (s?.blocks ?? []).some((b) => (b.t === 'table' ? b.rows.slice(1).some((r) => r.some((c) => String(c ?? '').trim() && !PLACEHOLDER.test(c))) : b.t !== 'h' && String(b.x ?? '').trim() && !PLACEHOLDER.test(b.x)));
}
export const completeness = (p) => { const ss = sectionsOf(p); return ss.length ? Math.round((ss.filter(hasContent).length / ss.length) * 100) : 0; };
export const blocksText = (blocks) => blocks.map((b) => (b.t === 'table' ? b.rows.map((r) => r.filter(Boolean).join(' — ')).join('\n') : b.t === 'li' ? `• ${b.x}` : b.x)).join('\n');
/** Rows of the first two-column table in a section, header row left out (the facts that circle the figure). */
export function glanceRows(p) {
  const ss = sectionsOf(p); const order = [...ss.filter((s) => s.type === 'basic'), ...ss.filter((s) => s.type === 'reference'), ...ss];
  for (const s of order) { const t = s.blocks.find((b) => b.t === 'table' && b.rows[0]?.length >= 2); if (t) return t.rows.slice(1).filter((r) => r[0] && r[1] && !PLACEHOLDER.test(r[1])); }
  return [];
}

// ---------------------------------------------------------------- older avatars (fixed chapters) → sections
const LEGACY = {   // v1 field specs: [field, label, kind, columns]
  market: [['market_core', 'Core market', 'text'], ['market_sub', 'Submarket', 'text'], ['niches', 'Niches', 'rows', ['Niche', 'Why', 'Chosen']]],
  qual: [['qual', 'Questions', 'rows', ['Question', 'Answer']]],
  basic: [['facts', '#table', 'rows', ['Attribute', 'Detail']], ['now', 'Where they are now', 'text'], ['pays', 'Pays for', 'list'], ['reach', 'Where to reach them', 'list'], ['studying', 'Studying', 'text']],
  drives: [['wants', 'Wants', 'list'], ['scared', 'Scared of', 'list'], ['values', 'Values', 'list'], ['identity', 'Who they want to be', 'text'], ['learn', 'How they learn', 'text']],
  beliefs: [['root', 'Root belief', 'text'], ['beliefs', 'Beliefs', 'rows', ['About', 'Belief', 'True / False / Cultural']]],
  desires: [['ext', 'External desires (said out loud)', 'list'], ['int', 'Internal desires (felt, rarely said)', 'list']],
  filter: [['best', 'Best customer', 'rows', ['Trait', 'Why']], ['worst', 'Worst customer', 'rows', ['Trait', 'Why']]],
  problems: [['problems', 'Problems', 'rows', ['Area', 'Now', 'If nothing changes']]],
  niche: [['niche', 'Statements', 'rows', ['Version', 'Statement']], ['oneliner', 'One-line version', 'text']],
  next: [['next', 'Actions', 'rows', ['Action', 'When', 'Done']]],
  notes: [['notes', 'Notes', 'text']],
};
const LEGACY_ORDER = ['market', 'qual', 'basic', 'drives', 'beliefs', 'desires', 'filter', 'problems', 'niche', 'next', 'notes'];
const LEGACY_TITLES = { market: 'Market map', qual: 'Qualification', basic: 'Basic profile', drives: 'What drives them', beliefs: 'Beliefs', desires: 'External vs internal desires', filter: 'Best vs worst customer', problems: 'Problems, now and next', niche: 'Niche statement', next: 'What to do next', notes: 'Context notes' };
const cell = (v) => (v === true ? 'Yes' : v === false ? '' : v === 'T' ? 'True' : v === 'F' ? 'False' : v === 'C' ? 'Cultural' : v === 'week' ? 'This week' : v === 'month' ? 'Next 30 days' : String(v ?? ''));
export function legacyToSections(p = {}) {
  const src = { ...p, ...(p.market && typeof p.market === 'object' && !Array.isArray(p.market) ? { niches: p.market.niches ?? p.niches } : {}) };
  const sections = []; const cards = []; const hide = new Set(p.hide ?? []);
  for (const k of LEGACY_ORDER) {
    const blocks = [];
    for (const [f, label, kind, cols] of LEGACY[k]) {
      const v = src[f]; if (v == null || (Array.isArray(v) && !v.length) || (kind === 'text' && !String(v).trim())) continue;
      if (label !== '#table') blocks.push({ t: 'h', x: label });
      if (kind === 'text') blocks.push({ t: 'p', x: String(v) });
      else if (kind === 'list') blocks.push(...v.filter((x) => String(x).trim()).map((x) => ({ t: 'li', x: String(x) })));
      else blocks.push({ t: 'table', rows: [cols, ...v.map((r) => (Array.isArray(r) ? r : [r]).map(cell))] });
    }
    if (!blocks.length) continue;
    const s = { id: newId(), type: k === 'problems' ? 'problems' : k, title: p.titles?.[k] || LEGACY_TITLES[k], blocks }; sections.push(s);
    if (k === 'basic' && !hide.has('basic')) { if (src.facts?.length) cards.push({ sid: s.id, sub: '#table' }); for (const sub of ['Where they are now', 'Pays for', 'Where to reach them']) if (blocks.some((b) => b.t === 'h' && b.x === sub)) cards.push({ sid: s.id, sub }); }
    if (k === 'drives' && !hide.has('drives')) for (const sub of ['Wants', 'Scared of']) if (blocks.some((b) => b.t === 'h' && b.x === sub)) cards.push({ sid: s.id, sub });
  }
  for (const c of p.custom ?? []) if (c?.title || c?.text) sections.push({ id: newId(), type: 'custom', title: String(c.title || 'Custom section').slice(0, 120), blocks: String(c.text ?? '').split('\n').filter((x) => x.trim()).map((x) => ({ t: 'p', x })) });
  return { sections, cards };
}
/** The sections of any stored profile (v2 as stored; v1 converted). Never throws on odd data. */
export function sectionsOf(p) {
  if (p && Array.isArray(p.sections)) return p.sections.filter((s) => s && typeof s === 'object').map((s) => ({ id: String(s.id || newId()), type: String(s.type || 'custom'), title: String(s.title || 'Untitled section'), blocks: Array.isArray(s.blocks) ? s.blocks.filter((b) => b && typeof b === 'object') : [] }));
  return legacyToSections(p ?? {}).sections;
}
/** A stored profile in the v2 shape (sections + cards), keeping Evidence data. Conversion of a v1 profile happens here, once. */
export function normalize(p = {}) {
  if (p && Array.isArray(p.sections)) {
    const sections = sectionsOf(p); const ids = new Set(sections.map((s) => s.id));
    return { ...p, v: 2, sections, cards: (Array.isArray(p.cards) ? p.cards : []).filter((c) => c && ids.has(c.sid)) };
  }
  const { sections, cards } = legacyToSections(p ?? {});
  return { v: 2, sections, cards, ...(p?.ev ? { ev: p.ev } : {}), ...(p?.interviews ? { interviews: p.interviews } : {}) };
}

// ---------------------------------------------------------------- "Use it": copy angles found in the sections (by type and sub-heading)
const partItems = (s, re) => { if (!s) return []; const subs = subHeadings(s).filter((x) => re.test(x)); const bs = subs.flatMap((x) => cardBlocks(s, x)); const pick = (t) => bs.filter((b) => b.t === t).map((b) => b.x).filter((x) => x && !PLACEHOLDER.test(x)); const li = pick('li'); return li.length ? li : pick('p'); };
export function useAngles(p) {
  const ss = sectionsOf(p); const of = (t) => ss.find((s) => s.type === t);
  const of2 = (t, re) => ss.filter((s) => s.type === t).flatMap((s) => partItems(s, re));
  const ext = of2('desires', /external/i)[0]; const int = of2('desires', /internal/i)[0];
  const bt = of('beliefs')?.blocks.find((b) => b.t === 'table'); const fb = bt?.rows.slice(1).find((r) => /false/i.test(r[r.length - 1] ?? ''));
  const ft = of('filter'); const tables = ft?.blocks.filter((b) => b.t === 'table') ?? []; const best = tables[0]?.rows[1]?.[0]; const worst = tables[1]?.rows[1]?.[0];
  const reach = of2('basic', /reach|studying|consuming/i)[0];
  const one = of2('niche', /full|one-?line|compact/i)[0];
  return [['Hook', 'External desire', ext, 'megaphone'], ['Story', 'Internal desire', int, 'heart'], ['Objection', 'False belief', fb ? `Break it gently: “${fb[1] ?? fb[0]}”` : null, 'xcircle'],
    ['Proof', 'Best-customer trait', best, 'star'], ['Channel', 'Where to reach them', reach, 'globe'], ['Filter question', 'Worst-customer trait', worst ? `Ask early: does this sound like you? “${worst}”` : null, 'filter'],
    ['One line', 'Niche statement', one, 'copy']].filter((x) => x[2] && !PLACEHOLDER.test(x[2]));
}
