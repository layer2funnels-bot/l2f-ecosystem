// Production bundle for the web app (performance audit, 15 Nov 2026). The sign-in page used to load 73 scripts and 24 stylesheets one by one, each
// re-checked on every visit (Cache-Control: no-cache). This step, run by build-web.mjs on the copied site in dist/web:
//   • bundles js/app.js and everything it imports into content-hashed, minified files under /assets (each app's code stays its own chunk, loaded
//     only when that app opens — app.js imports them lazily), so a returning visitor downloads nothing that hasn't changed;
//   • joins the stylesheets index.html links, in the same order, into one hashed file;
//   • marks /assets/* as cacheable for a year (the names change whenever the content does). Everything else keeps no-cache.
// Absolute imports (/planner/embed.js, /media/…, /packages/core/…) stay separate files, loaded as before. Development (dev-server) is unchanged.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

export async function bundleWeb(out, { quiet = false } = {}) {
  let esbuild; try { esbuild = await import('esbuild'); } catch { if (!quiet) console.warn('esbuild not installed: the site ships unbundled (npm ci installs it).'); return false; }
  const absoluteStays = { name: 'absolute-stays', setup(b) { b.onResolve({ filter: /^\// }, (a) => (a.kind === 'entry-point' ? undefined : { path: a.path, external: true })); } };
  const res = await esbuild.build({ entryPoints: [join(out, 'js/app.js')], bundle: true, splitting: true, format: 'esm', minify: true, target: 'es2020', outdir: join(out, 'assets'),
    entryNames: 'app-[hash]', chunkNames: 'c-[hash]', metafile: true, logLevel: 'silent', legalComments: 'none', plugins: [absoluteStays] });
  const entry = Object.entries(res.metafile.outputs).find(([f, o]) => /(^|\/)js\/app\.js$/.test(o.entryPoint ?? '') && f.endsWith('.js'))?.[0]; if (!entry) throw new Error('bundle: no entry output');
  const entryUrl = `/assets/${entry.split('/').pop()}`;
  let html = readFileSync(join(out, 'index.html'), 'utf8');
  // stylesheets: the same files, same order, one request
  const links = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">\n?/g)];
  const css = links.map(([, href]) => `/* ${href} */\n${readFileSync(join(out, href.replace(/^\//, '')), 'utf8')}`).join('\n');
  const min = (await esbuild.transform(css, { loader: 'css', minify: true, legalComments: 'none' })).code;
  const cssName = `app-${createHash('sha256').update(min).digest('hex').slice(0, 10)}.css`; mkdirSync(join(out, 'assets'), { recursive: true }); writeFileSync(join(out, 'assets', cssName), min);
  links.forEach(([tag], i) => { html = html.replace(tag, i === 0 ? `<link rel="stylesheet" href="/assets/${cssName}">\n` : ''); });
  // start fetching the app's first scripts while the page parses
  const firstChunks = Object.keys(res.metafile.outputs[entry].imports ?? {}).length ? res.metafile.outputs[entry].imports.filter((x) => x.kind === 'import-statement').map((x) => `  <link rel="modulepreload" href="/assets/${x.path.split('/').pop()}">\n`).join('') : '';
  html = html.replace('<script type="module" src="/js/app.js"></script>', `<script type="module" src="${entryUrl}"></script>`).replace('</head>', `${firstChunks}</head>`);
  if (!html.includes(entryUrl)) throw new Error('bundle: index.html script tag not found');
  writeFileSync(join(out, 'index.html'), html);
  writeFileSync(join(out, '_headers'), `${readFileSync(join(out, '_headers'), 'utf8').trimEnd()}\n\n# content-hashed bundles: a new name for every change, so browsers may keep them\n/assets/*\n  ! Cache-Control\n  Cache-Control: public, max-age=31536000, immutable\n`);
  if (!quiet) { const kb = (f) => Math.round(res.metafile.outputs[f].bytes / 1024); console.log(`bundled ${entryUrl} (${kb(entry)} KB, ${Object.keys(res.metafile.outputs).length} files) and /assets/${cssName} (${Math.round(min.length / 1024)} KB from ${links.length} stylesheets)`); }
  return true;
}
