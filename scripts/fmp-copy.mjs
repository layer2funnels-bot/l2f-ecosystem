// Funnel Mapper Pro code copy (owner approval 21 Oct 2026): provenance and verification.
//   node scripts/fmp-copy.mjs verify                      checks apps/funnel-mapper against docs/fmp-copy-manifest.json (no edits allowed)
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
  const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const have = walk(copy).map((p) => relative(copy, p)).filter((p) => !isGenerated(p));
  const changed = [], missing = [], extra = have.filter((p) => !(p in m.files));
  for (const [f, h] of Object.entries(m.files)) {
    const p = join(copy, f);
    if (!existsSync(p)) missing.push(f); else if (sha(readFileSync(p)) !== h) changed.push(f);
  }
  // what git will actually commit must equal the manifest (a .gitignore rule must not silently drop copied files)
  let notTracked = [];
  try {
    const tracked = new Set(execFileSync('git', ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard', 'apps/funnel-mapper'], { maxBuffer: 1 << 28 }).toString().split('\0').filter(Boolean).map((p) => p.replace(/^apps\/funnel-mapper\//, '')));
    notTracked = Object.keys(m.files).filter((f) => !tracked.has(f));
  } catch { /* not a git checkout */ }
  if (notTracked.length) extra.push(...notTracked.map((f) => `${f} (ignored by git)`));
  const ok = !changed.length && !missing.length && !extra.length;
  console.log(`${ok ? 'PASS' : 'FAIL'} FMP copy is ${ok ? 'identical to' : 'different from'} source ${m.commit.slice(0, 7)}: ${Object.keys(m.files).length} files, ${changed.length} changed, ${missing.length} missing, ${extra.length} extra`);
  for (const [l, a] of [['changed', changed], ['missing', missing], ['extra', extra]]) for (const f of a.slice(0, 10)) console.log(`  ${l}: ${f}`);
  process.exit(ok ? 0 : 1);
} else { console.error('usage: fmp-copy.mjs verify | manifest <source-clone>'); process.exit(2); }
