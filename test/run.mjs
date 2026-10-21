// Runs every suite on every requested engine. DRIVERS=pglite (default) | pg | pglite,pg
import { spawnSync } from 'node:child_process';
const drivers = (process.env.DRIVERS || 'pglite').split(',');
const suites = ['test/isolation.test.mjs', 'test/audit.test.mjs', 'test/authz.test.mjs', 'test/switch.test.mjs', 'test/api.test.mjs'];
let failed = 0;
for (const d of drivers) for (const s of suites) {
  const r = spawnSync(process.execPath, [s], { env: { ...process.env, DB_DRIVER: d }, encoding: 'utf8' });
  const fails = r.stdout.split('\n').filter(l => l.startsWith('FAIL'));
  const tally = (r.stdout.match(/(\d+)\/(\d+) checks passed/) || [])[0] || 'no result';
  console.log(`${r.status === 0 ? 'PASS' : 'FAIL'}  [${d.padEnd(6)}] ${s.padEnd(26)} ${tally}`);
  for (const f of fails) console.log(`        ${f}`);
  if (r.status !== 0) failed++;
}
const e = spawnSync(process.execPath, ['test/errors.test.mjs'], { encoding: 'utf8' });
console.log(`${e.status === 0 ? 'PASS' : 'FAIL'}  [api   ] test/errors.test.mjs       ${(e.stdout.match(/\d+\/\d+ checks passed/) || [''])[0]}`);
if (e.status !== 0) failed++;
process.exit(failed ? 1 : 0);
