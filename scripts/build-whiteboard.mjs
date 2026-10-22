// Builds the whiteboard editor bundle (apps/whiteboard/src/board.jsx) into apps/web/whiteboard/: board.js (one ES module), board.css and the
// fonts the editor needs (no CJK set: 13 MB; those characters use the system font). Build-time dependencies live in apps/whiteboard (its own
// lockfile), so the API and the rest of the repository stay dependency light:  npm ci --prefix apps/whiteboard && node scripts/build-whiteboard.mjs
// Returns quietly when the dependencies are not installed (build-web then ships without the editor; the board page says so).
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const at = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
export const OUT = at('apps/web/whiteboard');
export async function buildWhiteboard({ quiet = false } = {}) {
  const pkg = at('apps/whiteboard/package.json');
  if (!existsSync(at('apps/whiteboard/node_modules/esbuild'))) { if (!quiet) console.log('whiteboard: dependencies not installed (npm ci --prefix apps/whiteboard); skipped'); return false; }
  const { build } = createRequire(pkg)('esbuild');
  // The editor adds a fallback address (esm.sh) to every font and asset lookup. The page policy forbids it and this site serves its own copies,
  // so the fallback is cut out at build time. The pattern belongs to the pinned version; if an upgrade changes it the build stops here for a look.
  let cut = 0;
  const noFallback = { name: 'no-remote-fallback', setup(b) { b.onLoad({ filter: /@excalidraw[\\/]excalidraw[\\/]dist[\\/]prod[\\/].*\.js$/ }, async (a) => {
    const { readFile } = await import('node:fs/promises'); let t = await readFile(a.path, 'utf8');
    t = t.replace(/return (\w+)\.push\(new URL\((\w+),(\w+)\.ASSETS_FALLBACK_URL\)\),\1\}/g, (_m, r) => { cut++; return `return ${r}}`; });
    return { contents: t, loader: 'js' };
  }); } };
  rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
  await build({
    entryPoints: [at('apps/whiteboard/src/board.jsx')], outdir: OUT, entryNames: 'board', chunkNames: 'chunks/[name]-[hash]', splitting: true, bundle: true, format: 'esm', platform: 'browser', target: ['es2020'], minify: true, sourcemap: false, jsx: 'automatic', conditions: ['production'],
    loader: { '.woff2': 'file', '.svg': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"', 'process.env.IS_PREACT': '"false"' }, legalComments: 'none', logLevel: 'error', plugins: [noFallback],
  });
  if (cut < 1) throw new Error('whiteboard: the editor changed how it falls back to a remote address; review before upgrading (scripts/build-whiteboard.mjs)');
  const fonts = at('apps/whiteboard/node_modules/@excalidraw/excalidraw/dist/prod/fonts');
  mkdirSync(join(OUT, 'fonts'), { recursive: true });
  for (const d of readdirSync(fonts)) if (d !== 'Xiaolai') cpSync(join(fonts, d), join(OUT, 'fonts', d), { recursive: true });
  // the licences travel with the editor (MIT requires the notice): Excalidraw, React, React DOM, and a note on the fonts
  const read = (p) => { try { return readFileSync(at(`apps/whiteboard/node_modules/${p}`), 'utf8').trim(); } catch { return ''; } };
  const ex = JSON.parse(readFileSync(at('apps/whiteboard/node_modules/@excalidraw/excalidraw/package.json'), 'utf8'));
  writeFileSync(join(OUT, 'NOTICES.txt'), [
    'Whiteboard editor: third-party notices', '',
    `Excalidraw (@excalidraw/excalidraw ${ex.version}), ${ex.license} licence. Copyright (c) 2020 Excalidraw. https://github.com/excalidraw/excalidraw`,
    'Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.', '',
    '--- React ---', read('react/LICENSE'), '', '--- React DOM ---', read('react-dom/LICENSE'), '',
    'Fonts in the fonts folder come with the Excalidraw package and are open-licence fonts (SIL Open Font License 1.1 for Excalifont, Virgil, Cascadia Code, Nunito, Lilita One, Liberation and Assistant; MIT for Comic Shanns). The full list of bundled packages and their licences is in apps/whiteboard/package-lock.json.', '',
  ].join('\n'));
  const js = statSync(join(OUT, 'board.js')).size;
  if (!quiet) console.log(`whiteboard: board.js ${(js / 1e6).toFixed(2)} MB${existsSync(join(OUT, 'board.css')) ? `, board.css ${(statSync(join(OUT, 'board.css')).size / 1e3).toFixed(0)} KB` : ''}`);
  return true;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) { const ok = await buildWhiteboard(); process.exit(ok || process.env.WHITEBOARD_OPTIONAL === '1' ? 0 : 1); }
