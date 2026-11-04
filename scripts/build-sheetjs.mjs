// Builds the .xlsx bridge (apps/sheetjs/src/xlsx-bridge.js + SheetJS Community Edition, Apache-2.0) into apps/web/sheetjs/xlsx.js (one ES module,
// lazy-loaded by the Sheets editor only when someone imports or exports .xlsx). The dependency is SheetJS's OFFICIAL tarball (cdn.sheetjs.com,
// version pinned in apps/sheetjs/package.json and package-lock.json), NOT the outdated, vulnerable npm "xlsx" 0.18.x. Build-time only:
//   npm ci --prefix apps/sheetjs && node scripts/build-sheetjs.mjs
// Returns quietly when the dependencies are not installed (the site then ships without .xlsx; CSV keeps working and the editor says so).
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const at = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
export const OUT = at('apps/web/sheetjs');
export async function buildSheetjs({ quiet = false } = {}) {
  const pkg = at('apps/sheetjs/package.json');
  if (!existsSync(at('apps/sheetjs/node_modules/esbuild')) || !existsSync(at('apps/sheetjs/node_modules/xlsx'))) { if (!quiet) console.log('sheetjs: dependencies not installed (npm ci --prefix apps/sheetjs); skipped'); return false; }
  const { build } = createRequire(pkg)('esbuild');
  rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
  await build({ entryPoints: [at('apps/sheetjs/src/xlsx-bridge.js')], outfile: join(OUT, 'xlsx.js'), bundle: true, format: 'esm', platform: 'browser', target: ['es2020'], minify: true, legalComments: 'none', logLevel: 'error' });
  const x = JSON.parse(readFileSync(at('apps/sheetjs/node_modules/xlsx/package.json'), 'utf8'));
  let lic = ''; try { lic = readFileSync(at('apps/sheetjs/node_modules/xlsx/LICENSE'), 'utf8').trim(); } catch { /* not shipped in some versions */ }
  writeFileSync(join(OUT, 'NOTICES.txt'), `Spreadsheet import/export: third-party notices\n\nSheetJS Community Edition (xlsx ${x.version}), ${x.license} licence. Copyright (C) 2012-present SheetJS LLC. https://sheetjs.com\nObtained from the official tarball https://cdn.sheetjs.com/xlsx-${x.version}/xlsx-${x.version}.tgz\n\n${lic}\n`);
  if (!quiet) console.log(`sheetjs: xlsx.js ${(statSync(join(OUT, 'xlsx.js')).size / 1e3).toFixed(0)} KB (xlsx ${x.version})`);
  return true;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) { const ok = await buildSheetjs(); process.exit(ok || process.env.SHEETJS_OPTIONAL === '1' ? 0 : 1); }
