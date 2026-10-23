// Value Ladder model: step types, ordering and the compare of two snapshots. Pure functions (no DOM).
export const STEP_TYPES = [['lead_magnet', 'Lead magnet'], ['tripwire', 'Front-end offer'], ['core', 'Core offer'], ['upsell', 'Upsell'], ['downsell', 'Downsell'], ['continuity', 'Continuity'], ['premium', 'High-ticket']];
export const stepLabel = (k) => (STEP_TYPES.find(([x]) => x === k) ?? [k, k])[1];
const money = (n, cur) => (n == null ? '—' : `${new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(n)}${cur ? ` ${cur}` : ''}`);
export const priceOf = (s) => money(s.price_amount, s.currency);
/** Height of a step in the rising map, 0.2 … 1, from its place in the order (the ladder rises from free to premium). */
export const riseOf = (i, n) => (n <= 1 ? 1 : 0.25 + (0.75 * i) / (n - 1));
export const brokenLink = (s) => Boolean(s.offer_id && s.offer_archived_at);
const FIELDS = [['stage', 'Step type', (v) => stepLabel(v)], ['name', 'Name'], ['offer_name', 'Linked offer'], ['price_amount', 'Price', (v, s) => money(v, s.currency)], ['conversion_pct', 'Conversion', (v) => (v == null ? '—' : `${v}%`)], ['audience', 'Audience'], ['assumption_notes', 'Notes']];
/**
 * What changed between two snapshots (arrays of steps with ids, in order): added, removed, moved and changed steps, each change in plain words.
 * `a` is the earlier version, `b` the later one (or the current ladder).
 */
export function diffLadders(a, b) {
  const byA = new Map(a.map((s, i) => [s.id, { s, i }])); const byB = new Map(b.map((s, i) => [s.id, { s, i }])); const out = [];
  for (const [id, { s, i }] of byB) if (!byA.has(id)) out.push({ kind: 'added', step: s, text: `Added “${s.name}” as step ${i + 1}.` });
  for (const [id, { s }] of byA) if (!byB.has(id)) out.push({ kind: 'removed', step: s, text: `Removed “${s.name}”.` });
  for (const [id, { s: x, i: xi }] of byA) {
    const y = byB.get(id); if (!y) continue; const ch = [];
    for (const [k, label, fmt] of FIELDS) { const f = fmt ?? ((v) => (v == null || v === '' ? '—' : String(v))); const before = f(x[k], x); const after = f(y.s[k], y.s); if (before !== after) ch.push(`${label}: ${before} → ${after}`); }
    if (xi !== y.i) ch.push(`Position: ${xi + 1} → ${y.i + 1}`);
    if (ch.length) out.push({ kind: 'changed', step: y.s, text: `“${y.s.name}” — ${ch.join('; ')}.` });
  }
  return out;
}
/** Totals per currency (never mixed). */
export function totals(steps) { const t = new Map(); for (const s of steps) if (s.price_amount != null && s.currency) t.set(s.currency, (t.get(s.currency) ?? 0) + s.price_amount); return [...t].map(([currency, total]) => ({ currency, total })); }
