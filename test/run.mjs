// Runs every suite on every requested engine. DRIVERS=pglite (default) | pg | pglite,pg
import { spawnSync } from 'node:child_process';
const drivers = (process.env.DRIVERS || 'pglite').split(',');
const suites = ['test/isolation.test.mjs', 'test/audit.test.mjs', 'test/authz.test.mjs', 'test/switch.test.mjs', 'test/api.test.mjs', 'test/funnels.test.mjs', 'test/funnels-api.test.mjs', 'test/clients.test.mjs', 'test/rate-limit-store.test.mjs', 'test/direct-access.test.mjs', 'test/permissions-scope.test.mjs', 'test/shell-admin.test.mjs', 'test/projects.test.mjs', 'test/drive.test.mjs', 'test/planner.test.mjs', 'test/audience.test.mjs', 'test/approvals.test.mjs', 'test/portal.test.mjs', 'test/forms.test.mjs', 'test/ladder.test.mjs', 'test/social.test.mjs', 'test/whiteboard-spike.test.mjs', 'test/storage-cap.test.mjs', 'test/drive-context.test.mjs', 'test/drive-library.test.mjs', 'test/projects-search.test.mjs', 'test/design-v4.test.mjs', 'test/weather.test.mjs', 'test/office-team.test.mjs', 'test/client-strategy.test.mjs', 'test/funnel-strategies.test.mjs', 'test/forms-v4.test.mjs', 'test/ladder-v4.test.mjs'];
let failed = 0;
for (const d of drivers) for (const s of suites) {
  const r = spawnSync(process.execPath, [s], { env: { ...process.env, DB_DRIVER: d }, encoding: 'utf8' });
  const fails = r.stdout.split('\n').filter(l => l.startsWith('FAIL'));
  const tally = (r.stdout.match(/(\d+)\/(\d+) checks passed/) || [])[0] || 'no result';
  console.log(`${r.status === 0 ? 'PASS' : 'FAIL'}  [${d.padEnd(6)}] ${s.padEnd(26)} ${tally}`);
  for (const f of fails) console.log(`        ${f}`);
  if (r.status !== 0) failed++;
}
for (const f of ['test/errors.test.mjs', 'test/storage-adapter.test.mjs', 'test/storage-backup.test.mjs', 'test/http.test.mjs', 'test/web.test.mjs', 'test/launcher.test.mjs', 'test/docs.test.mjs', 'test/board.test.mjs', 'test/projectmodel.test.mjs', 'test/sheetmodel.test.mjs', 'test/formmodel.test.mjs', 'test/laddermodel.test.mjs']) {
  const e = spawnSync(process.execPath, [f], { encoding: 'utf8' });
  console.log(`${e.status === 0 ? 'PASS' : 'FAIL'}  [api   ] ${f.padEnd(26)} ${(e.stdout.match(/\d+\/\d+ checks passed/) || [''])[0]}`);
  for (const l of e.stdout.split('\n').filter(l => l.startsWith('FAIL'))) console.log(`        ${l}`);
  if (e.status !== 0) failed++;
}
process.exit(failed ? 1 : 0);
