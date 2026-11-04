// Builds the Word (.docx) export/import bundle for the Docs editor (apps/docs-io/src/docsio.js) into apps/web/docs-io/docsio.js (one ES module,
// loaded only when someone downloads or opens a Word file). Build-time dependencies live in apps/docs-io (its own lockfile):
//   npm ci --prefix apps/docs-io && node scripts/build-docs-io.mjs
// Libraries: docx (MIT), mammoth (BSD-2-Clause) and their dependencies (licences travel in NOTICES.txt). Returns quietly when the dependencies are
// not installed (build-web then ships without Word support; the Docs menu says so).
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const at = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
export const OUT = at('apps/web/docs-io');
export async function buildDocsIo({ quiet = false } = {}) {
  const pkg = at('apps/docs-io/package.json');
  if (!existsSync(at('apps/docs-io/node_modules/esbuild'))) { if (!quiet) console.log('docs-io: dependencies not installed (npm ci --prefix apps/docs-io); skipped'); return false; }
  const { build } = createRequire(pkg)('esbuild');
  rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
  const stubs = { name: 'node-stubs', setup(b) { b.onResolve({ filter: /^(buffer|fs|path|stream|util|os|crypto|zlib|events|assert|url|http|https)$/ }, (a) => ({ path: a.path, namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'module.exports = {};', loader: 'js' })); } };
  await build({ plugins: [stubs], entryPoints: [at('apps/docs-io/src/docsio.js')], outfile: join(OUT, 'docsio.js'), bundle: true, format: 'esm', platform: 'browser', target: ['es2020'], minify: true, sourcemap: false, legalComments: 'none', logLevel: 'error', define: { 'process.env.NODE_ENV': '"production"' } });
  // the licences of everything that went into the bundle (MIT and BSD require the notice to travel with the code)
  const nm = at('apps/docs-io/node_modules'); const rows = [];
  for (const d of readdirSync(nm)) {
    const dirs = d.startsWith('@') ? readdirSync(join(nm, d)).map((x) => join(nm, d, x)) : [join(nm, d)];
    for (const dir of dirs) { try { const j = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')); if (j.name === 'esbuild' || j.name?.startsWith('@esbuild/')) continue; const lic = readdirSync(dir).find((f) => /^licen[cs]e/i.test(f)); rows.push(`--- ${j.name} ${j.version} (${typeof j.license === 'string' ? j.license : j.license?.type ?? j.licenses?.[0]?.type ?? 'see package'}) ---\n${lic ? readFileSync(join(dir, lic), 'utf8').trim() : ''}`); } catch { /* not a package */ } }
  }
  writeFileSync(join(OUT, 'NOTICES.txt'), `Docs editor, Word support: third-party notices\n\nBundled in docsio.js: docx (MIT), mammoth (BSD-2-Clause) and their dependencies.\n\n${rows.join('\n\n')}\n`);
  if (!quiet) console.log(`docs-io: docsio.js ${(statSync(join(OUT, 'docsio.js')).size / 1e6).toFixed(2)} MB`);
  return true;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) { const ok = await buildDocsIo(); process.exit(ok || process.env.DOCS_IO_OPTIONAL === '1' ? 0 : 1); }
