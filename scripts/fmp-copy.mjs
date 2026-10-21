// Funnel Mapper Pro code copy (owner approval 21 Oct 2026): provenance and verification.
//   node scripts/fmp-copy.mjs verify                      tag fmp-copy-pristine == manifest; every change since the tag is recorded in docs/FMP_CHANGES.md
//   node scripts/fmp-copy.mjs manifest <path-to-source-clone>   (re)writes the manifest from a clean clone's HEAD (read-only on the clone)
// The copy is code only: no data, no environment files, no git history, no CI or agent configuration.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const copy = join(root, 'apps/funnel-mapper');
const manifestPath = join(root, 'docs/fmp-copy-manifest.json');
const EXCLUDED = ['.github', '.claude', 'CLAUDE.md', 'AGENTS.md', 'PROJECT_STATUS.md', 'Funnel_Mapper_Pro_Master_Claude_Code_Handoff.docx', 'docs'];
const GENERATED = ['node_modules', '.next', 'test-results', 'playwright-report', 'coverage', '.scratch', '.deploy', 'tests/e2e/.auth', 'supabase/.temp', 'supabase/.branches', 'tsconfig.tsbuildinfo', 'next-env.d.ts', '.env.local'];
const sha = (b) => createHash('sha256').update(b).digest('hex');
const isGenerated = (p) => GENERATED.some((g) => p === g || p.startsWith(`${g}/`));

const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });

const [cmd, src] = process.argv.slice(2);
if (cmd === 'manifest') {
  const git = (...a) => execFileSync('git', ['-C', src, ...a], { maxBuffer: 1 << 28 });
  const commit = git('rev-parse', 'HEAD').toString().trim();
  if (git('status', '--porcelain').toString().trim()) { console.error('Source clone has uncommitted changes; refusing.'); process.exit(1); }
  const files = {};
  for (const f of git('ls-files', '-z').toString().split('\0').filter(Boolean)) {
    if (EXCLUDED.some((e) => f === e || f.startsWith(`${e}/`))) continue;
    files[f] = sha(git('show', `HEAD:${f}`));
  }
  writeFileSync(manifestPath, JSON.stringify({ source: 'github.com/layer2funnels-bot/Funnel-Mapper', commit, copiedOn: '2026-10-21', excluded: EXCLUDED, files }, null, 1) + '\n');
  console.log(`manifest: ${Object.keys(files).length} files from ${commit.slice(0, 7)}`);
} else if (cmd === 'verify') {
  // Two checks. (1) The PRISTINE record never moves: the git tag `fmp-copy-pristine` must still equal the manifest.
  // (2) The working copy may now differ from the tag (reshaping is approved), but every difference must be recorded in
  // docs/FMP_CHANGES.md (path in backticks), and the ledger may not name files that did not change.
  const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
  // The tag is the primary reference. If the remote refused to carry it (tag pushes can be blocked), the manifest records the exact
  // pristine commit, which is immutable history, so the check works either way.
  let TAG = 'fmp-copy-pristine';
  let ok = true; const say = (pass, msg) => { ok &&= pass; console.log(`${pass ? 'PASS' : 'FAIL'} ${msg}`); };
  const gitShow = (f) => execFileSync('git', ['-C', root, 'show', `${TAG}:apps/funnel-mapper/${f}`], { maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] });
  const has = (ref) => { try { execFileSync('git', ['-C', root, 'rev-parse', '--verify', `${ref}^{commit}`], { stdio: 'ignore' }); return true; } catch { return false; } };
  if (!has(TAG)) {
    if (m.pristineCommit && has(m.pristineCommit)) { console.log(`NOTE tag ${TAG} is not in this checkout; using the pristine commit ${m.pristineCommit.slice(0, 7)} recorded in the manifest`); TAG = m.pristineCommit; }
    else { console.log(`FAIL neither tag ${TAG} nor the recorded pristine commit exists (CI must fetch full history: actions/checkout fetch-depth: 0)`); process.exit(1); }
  }
  const badTag = [];
  for (const [f, h] of Object.entries(m.files)) { try { if (sha(gitShow(f)) !== h) badTag.push(f); } catch { badTag.push(`${f} (missing in tag)`); } }
  say(!badTag.length, `pristine reference (${TAG.length > 20 ? TAG.slice(0, 7) : TAG}) still equals the pristine manifest: ${Object.keys(m.files).length} files, ${badTag.length} different`);
  for (const f of badTag.slice(0, 10)) console.log(`  tag differs: ${f}`);

  const have = walk(copy).map((p) => relative(copy, p)).filter((p) => !isGenerated(p));
  const changed = [], missing = [], added = have.filter((p) => !(p in m.files));
  for (const [f, h] of Object.entries(m.files)) { const p = join(copy, f); if (!existsSync(p)) missing.push(f); else if (sha(readFileSync(p)) !== h) changed.push(f); }
  const ledgerPath = join(root, 'docs/FMP_CHANGES.md');
  const ledger = existsSync(ledgerPath) ? readFileSync(ledgerPath, 'utf8') : '';
  const recorded = new Set([...ledger.matchAll(/`([^`\s]+)`/g)].map((x) => x[1]));
  const diffs = [...changed, ...missing, ...added];
  const unrecorded = diffs.filter((f) => !recorded.has(f));
  const touched = new Set(diffs);
  const stale = [...ledger.matchAll(/^\|\s*`([^`\s]+)`\s*\|/gm)].map((x) => x[1]).filter((f) => !touched.has(f));
  say(!unrecorded.length, `every difference from the tag is recorded in docs/FMP_CHANGES.md: ${changed.length} changed, ${missing.length} deleted, ${added.length} added, ${unrecorded.length} unrecorded`);
  say(!stale.length, `the ledger names no file that is unchanged: ${stale.length} stale`);
  for (const [l, a] of [['unrecorded', unrecorded], ['stale ledger entry', stale]]) for (const f of a.slice(0, 10)) console.log(`  ${l}: ${f}`);
  // what git will actually commit must contain every file of the working copy (a .gitignore rule must not silently drop files)
  let ignored = [];
  try {
    const tracked = new Set(execFileSync('git', ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard', 'apps/funnel-mapper'], { maxBuffer: 1 << 28 }).toString().split('\0').filter(Boolean).map((p) => p.replace(/^apps\/funnel-mapper\//, '')));
    ignored = have.filter((f) => !tracked.has(f));
  } catch { /* not a git checkout */ }
  say(!ignored.length, `git sees every file of the copy: ${ignored.length} ignored`);
  for (const f of ignored.slice(0, 10)) console.log(`  ignored by git: ${f}`);
  process.exit(ok ? 0 : 1);
} else { console.error('usage: fmp-copy.mjs verify | manifest <source-clone>'); process.exit(2); }
