// Design v4 tokens: resolve the colours of one (organization, theme) pair and measure contrast. Shared by the generator and the contrast test.
import { readFileSync } from 'node:fs';
export const tokens = JSON.parse(readFileSync(new URL('tokens.json', import.meta.url), 'utf8'));
export const THEMES = tokens.color.themes.map((x) => x.id);
export const ORGS = tokens.color.orgs.map((x) => x.id);
export function resolve(org, theme) {
  const m = {};
  for (const n of tokens.color.neutrals) m[n.name] = n[theme];
  Object.assign(m, tokens.color.orgNeutrals[org]?.[theme] ?? {}, tokens.color.org[org][theme]);
  return m;
}
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
/** A colour as solid RGB; an rgba() value is blended over `under` (a hex). */
export function solid(v, under) {
  if (v.startsWith('#')) return hex(v);
  const [r, g, b, a = 1] = v.match(/[\d.]+/g).map(Number);
  const u = hex(under);
  return [r, g, b].map((c, i) => Math.round(c * a + u[i] * (1 - a)));
}
const lum = (rgb) => { const c = rgb.map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
export function ratio(a, b) { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); }
/** Pairs that must hold in every theme and organization: [foreground, background, minimum ratio]. */
export const PAIRS = [
  ['text', 'bg', 4.5], ['text', 'surface', 4.5], ['text', 'sunk', 4.5], ['text2', 'bg', 4.5], ['text2', 'surface', 4.5], ['text2', 'sunk', 4.5],
  ['muted', 'bg', 4.5], ['muted', 'surface', 4.5], ['muted', 'surface2', 4.5], ['muted', 'sunk', 4.5],
  ['brand-ink', 'brand', 4.5], ['action-ink', 'action', 4.5], ['action', 'surface', 4.5], ['action', 'bg', 4.5],
  ['warn', 'warn-tint', 4.5], ['danger', 'danger-tint', 4.5], ['ok', 'ok-tint', 4.5], ['warn', 'surface', 4.5], ['danger', 'surface', 4.5], ['ok', 'surface', 4.5],
  ['control', 'surface', 3], ['control', 'bg', 3],
];
export function failures() {
  const bad = [];
  for (const org of ORGS) for (const theme of THEMES) {
    const m = resolve(org, theme); const base = m.surface;
    for (const [a, b, min] of PAIRS) {
      const r = ratio(solid(m[a], base), solid(m[b], base));
      if (r < min) bad.push(`${org}/${theme}: ${a} on ${b} = ${r.toFixed(2)} (needs ${min})`);
    }
  }
  return bad;
}
