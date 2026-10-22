// Single source of truth for design tokens (Design v4 "Signal"): packages/ui/tokens.json -> packages/ui/tokens.css.
// Themes are data-theme="light|dark" on <html>; the organization is data-org="l2f|aurj". --check fails if tokens.css is stale or a contrast pair fails.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tokens as t, THEMES, ORGS, resolve, failures } from '../packages/ui/tokens-lib.mjs';
const out = new URL('../packages/ui/tokens.css', import.meta.url);
const lines = ['/* GENERATED from tokens.json by scripts/build-tokens.mjs. Do not edit by hand. */'];
const block = (sel, vars) => { lines.push(`${sel} {`); for (const [k, v] of Object.entries(vars)) lines.push(`  --${k}: ${v};`); lines.push('}'); };
const neutralVars = (theme) => Object.fromEntries(t.color.neutrals.map((n) => [n.name, n[theme]]));
const orgVars = (org, theme) => ({ ...(t.color.orgNeutrals[org]?.[theme] ?? {}), ...t.color.org[org][theme] });
// default: Layer2Funnels, light
block(':root,\n:root[data-theme="light"]', { ...neutralVars('light'), ...orgVars('l2f', 'light') });
block(':root[data-theme="dark"]', { ...neutralVars('dark'), ...orgVars('l2f', 'dark') });
for (const org of ORGS.filter((o) => o !== 'l2f'))
  for (const theme of THEMES) block(`:root[data-org="${org}"]${theme === 'light' ? '' : `[data-theme="${theme}"]`}`.replace(/^(:root\[data-org="\w+"\])$/, `$1,\n:root[data-org="${org}"][data-theme="light"]`), orgVars(org, theme));
lines.push(':root {', '  color-scheme: light;');
for (const g of ['spacing', 'radius', 'shadow']) for (const tk of t[g].tokens) lines.push(`  --${tk.name}: ${tk.value};`);
for (const [k, v] of Object.entries(t.v4.radius)) lines.push(`  --${k}: ${v};`);
for (const [k, v] of Object.entries(t.v4.shadow)) lines.push(`  --${k}: ${v};`);
for (const [k, v] of Object.entries(t.v4.ease)) lines.push(`  --${k}: ${v};`);
for (const [k, v] of Object.entries(t.type.families)) lines.push(`  --${k}: ${v};`);
lines.push('  --focus-ring: 0 0 0 3px var(--action);', '  --target-min: 44px;', '  --motion-fast: 120ms;', '  --motion-base: 200ms;', '  --ease: var(--e-out);',
  '  --z-sticky: 10;', '  --z-menu: 100;', '  --z-dialog: 200;', '  --z-toast: 300;',
  '  /* breakpoints (use in media queries): phone <= 600px, tablet <= 900px */',
  '  /* compatibility names used by screens built before v4; new code uses the v4 names above */',
  '  --primary: var(--action); --on-primary: var(--action-ink); --accent: var(--brand); --on-accent: var(--brand-ink); --accent-text: var(--brand-deep);',
  '  --tint: var(--action-tint); --control-border: var(--control); --ink: var(--text); --panel: var(--surface); --shell: var(--bg);',
  '  --success: var(--ok); --success-tint: var(--ok-tint); --warn-text: var(--warn); --line-soft: var(--line);',
  '  --font-body: var(--font); --font-display: var(--font-d);', '}',
  ':root[data-theme="dark"] { color-scheme: dark; }',
  '@media (prefers-reduced-motion: reduce) { :root { --motion-fast: 0ms; --motion-base: 0ms; } }');
const css = lines.join('\n') + '\n';
const bad = failures();
if (process.argv.includes('--check')) {
  const stale = !existsSync(out) || readFileSync(out, 'utf8') !== css;
  if (stale || bad.length) { console.log(`FAIL tokens${stale ? ' (tokens.css stale: run npm run tokens:build)' : ''} ${bad.join('; ')}`); process.exit(1); }
  console.log(`PASS tokens: css up to date, ${ORGS.length * THEMES.length} theme/organization sets meet their contrast pairs`);
} else { writeFileSync(out, css); console.log('wrote packages/ui/tokens.css'); if (bad.length) { console.log('contrast failures: ' + bad.join('; ')); process.exit(1); } }
