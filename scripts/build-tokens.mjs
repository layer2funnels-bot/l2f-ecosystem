// Single source of truth for design tokens: packages/ui/tokens.json -> packages/ui/tokens.css.
// --check: fail if tokens.css is stale or any documented text pair drops below WCAG AA.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const dir = new URL('../packages/ui/', import.meta.url);
const t = JSON.parse(readFileSync(new URL('tokens.json', dir), 'utf8'));
const col = t.color.tokens, themes = t.color.themes.map(x => x.id);
const val = (tk, th) => typeof tk.value === 'object' ? tk.value[th] : tk.value;
const lines = ['/* GENERATED from tokens.json by scripts/build-tokens.mjs. Do not edit by hand. */'];
for (const th of themes) {
  lines.push(`${th === themes[0] ? ':root, ' : ''}[data-theme="${th}"] {`);
  for (const tk of col) if (th === themes[0] || typeof tk.value === 'object') lines.push(`  --${tk.name}: ${val(tk, th)};`);
  lines.push(`  --font-display: var(--font-display-${th});`, '}');
}
lines.push(':root {');
for (const g of ['spacing', 'radius', 'shadow']) for (const tk of t[g].tokens) lines.push(`  --${tk.name}: ${tk.value};`);
for (const [k, v] of Object.entries(t.type.families)) lines.push(`  --font-${k}: ${v};`);
// Added by the audit (rules in the Phase 3 handoff that had no token): focus, targets, motion, layers, breakpoints.
lines.push('  --focus-ring: 0 0 0 3px var(--primary);', '  --target-min: 44px;',
  '  --motion-fast: 120ms;', '  --motion-base: 200ms;', '  --ease: cubic-bezier(.2,.0,.2,1);',
  '  --z-sticky: 10;', '  --z-menu: 100;', '  --z-dialog: 200;', '  --z-toast: 300;',
  '  /* breakpoints (use in media queries): tablet <= 900px, mobile <= 600px */', '}',
  '@media (prefers-reduced-motion: reduce) { :root { --motion-fast: 0ms; --motion-base: 0ms; } }');
const css = lines.join('\n') + '\n';
const out = new URL('tokens.css', dir);
const L = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(x => x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
const cr = (a, b) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
const get = (n, th) => val(col.find(c => c.name === n), th);
const pairs = [['on-primary', 'primary', 4.5], ['primary', 'surface', 4.5], ['on-accent', 'accent', 4.5], ['accent-text', 'surface', 4.5], ['muted', 'panel', 4.5], ['muted', 'shell', 4.5], ['warn-text', 'warn-tint', 4.5], ['success', 'success-tint', 4.5], ['danger', 'danger-tint', 4.5], ['ink', 'surface', 4.5], ['control-border', 'surface', 3]];
const bad = themes.flatMap(th => pairs.filter(([a, b, n]) => cr(get(a, th), get(b, th)) < n).map(([a, b]) => `${th}: ${a} on ${b}`));
if (process.argv.includes('--check')) {
  const stale = !existsSync(out) || readFileSync(out, 'utf8') !== css;
  if (stale || bad.length) { console.log(`FAIL tokens${stale ? ' (tokens.css stale: run npm run tokens:build)' : ''} ${bad.join('; ')}`); process.exit(1); }
  console.log(`PASS tokens: css up to date, ${pairs.length * themes.length} contrast pairs meet WCAG AA`);
} else { writeFileSync(out, css); console.log('wrote packages/ui/tokens.css'); if (bad.length) { console.log('contrast failures: ' + bad.join('; ')); process.exit(1); } }
