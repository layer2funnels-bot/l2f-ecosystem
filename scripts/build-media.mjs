// Builds the PDF viewer/editor libraries into apps/web/media/: pdfjs.js + pdf.worker.js (pdf.js, Apache-2.0: reading and drawing pages), pdflib.js (pdf-lib, MIT: writing PDFs),
// pdf.js's standard font and character-map data (it needs them for PDFs that do not embed their fonts) and the licence notices. Build-time dependencies live in apps/media
// (its own lockfile), so the API and the rest of the repository stay dependency light:  npm ci --prefix apps/media && node scripts/build-media.mjs
// Returns quietly when the dependencies are not installed (build-web then ships without them; the PDF editor says so). The image editor needs none of this.
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const at = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
export const OUT = at('apps/web/media');
export async function buildMedia({ quiet = false } = {}) {
  const pkg = at('apps/media/package.json');
  if (!existsSync(at('apps/media/node_modules/esbuild'))) { if (!quiet) console.log('media: dependencies not installed (npm ci --prefix apps/media); skipped'); return false; }
  const { build } = createRequire(pkg)('esbuild');
  rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
  await build({
    entryPoints: { pdfjs: at('apps/media/src/pdfjs.js'), 'pdf.worker': at('apps/media/node_modules/pdfjs-dist/build/pdf.worker.mjs'), pdflib: at('apps/media/src/pdflib.js') },
    outdir: OUT, bundle: true, format: 'esm', platform: 'browser', target: ['es2022'], minify: true, sourcemap: false, legalComments: 'none', logLevel: 'error',
    external: ['canvas', 'fs', 'path', 'http', 'https', 'url', 'zlib', 'module', 'node:*'],
  });
  const pj = at('apps/media/node_modules/pdfjs-dist');
  cpSync(join(pj, 'standard_fonts'), join(OUT, 'standard_fonts'), { recursive: true });
  cpSync(join(pj, 'cmaps'), join(OUT, 'cmaps'), { recursive: true });
  const read = (p) => { try { return readFileSync(at(`apps/media/node_modules/${p}`), 'utf8').trim(); } catch { return ''; } };
  const ver = (p) => JSON.parse(readFileSync(at(`apps/media/node_modules/${p}/package.json`), 'utf8')).version;
  writeFileSync(join(OUT, 'NOTICES.txt'), [
    'PDF viewer and editor: third-party notices', '',
    `pdf.js (pdfjs-dist ${ver('pdfjs-dist')}), Apache-2.0 licence. Copyright Mozilla Foundation and contributors. https://github.com/mozilla/pdf.js`, read('pdfjs-dist/LICENSE'), '',
    `pdf-lib ${ver('pdf-lib')}, MIT licence. Copyright (c) 2019 Andrew Dillon. https://github.com/Hopding/pdf-lib`, read('pdf-lib/LICENSE.md'), '',
    'The standard_fonts folder (Foxit and Liberation fonts) and cmaps folder come with pdfjs-dist and carry their own licences (see LICENSE_FOXIT and LICENSE_LIBERATION inside standard_fonts).', '',
  ].join('\n'));
  if (!quiet) console.log(`media: pdfjs.js ${(statSync(join(OUT, 'pdfjs.js')).size / 1e3).toFixed(0)} KB, pdf.worker.js ${(statSync(join(OUT, 'pdf.worker.js')).size / 1e3).toFixed(0)} KB, pdflib.js ${(statSync(join(OUT, 'pdflib.js')).size / 1e3).toFixed(0)} KB`);
  return true;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) { const ok = await buildMedia(); process.exit(ok || process.env.MEDIA_OPTIONAL === '1' ? 0 : 1); }
