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
