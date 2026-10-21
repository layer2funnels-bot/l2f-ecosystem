// V13: free licence scanner. Fails the build if any installed dependency is outside the allowlist.
// Copyleft (GPL/AGPL/LGPL/SSPL/EUPL) needs an explicit review entry in docs/DECISIONS.md first.
import { readFileSync } from 'node:fs';
const ALLOW = new Set(['MIT', 'Apache-2.0', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'BlueOak-1.0.0', 'CC0-1.0', 'Unlicense', 'Python-2.0']);
const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const bad = [];
let n = 0;
for (const [path, meta] of Object.entries(lock.packages || {})) {
  if (!path) continue; n++;
  const lic = String(meta.license ?? 'UNKNOWN');
  const parts = lic.replace(/[()]/g, '').split(/\s+OR\s+/);
  if (!parts.some(p => ALLOW.has(p.trim()))) bad.push(`${path.replace(/^node_modules\//, '')}: ${lic}`);
}
if (bad.length) { console.log('FAIL licence check:\n  ' + bad.join('\n  ')); process.exit(1); }
console.log(`PASS licence check: ${n} packages, all on the allowlist`);

// Funnel Mapper Pro code copy: its own dependency tree (not installed or shipped by the ecosystem). Reported, not failing:
// anything listed here needs a review entry in docs/DECISIONS.md BEFORE the copy is reshaped into the ecosystem or deployed.
try {
  const fmp = JSON.parse(readFileSync(new URL('../apps/funnel-mapper/package-lock.json', import.meta.url), 'utf8'));
  const flagged = new Map(); let total = 0;
  for (const [path, meta] of Object.entries(fmp.packages || {})) {
    if (!path) continue; total++;
    const lic = String(meta.license ?? 'UNKNOWN');
    if (!lic.replace(/[()]/g, '').split(/\s+OR\s+/).some((p) => ALLOW.has(p.trim()))) flagged.set(lic, [...(flagged.get(lic) ?? []), path.replace(/^.*node_modules\//, '')]);
  }
  console.log(`INFO FMP copy: ${total} packages, ${[...flagged.values()].flat().length} outside the allowlist (review before reshaping or deploying)`);
  for (const [lic, pk] of flagged) console.log(`  ${lic}: ${[...new Set(pk)].slice(0, 6).join(', ')}${pk.length > 6 ? ', …' : ''}`);
} catch { /* copy not present */ }
