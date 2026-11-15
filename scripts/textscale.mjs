// Readable text everywhere (owner, 15 Nov 2026: "text on all the apps is a bit small and hard to read").
// Every pixel font size in our stylesheets becomes calc(<size> * var(--ts, 1)); --ts is set on <html> (v8-base.css):
// Standard 1 · Large 1.07 (default) · Larger 1.14, chosen in Profile › Appearance. Only text grows: layout sizes, icons and
// positions stay as V8 drew them, so menus and popovers placed at the pointer stay put. Idempotent.
// Usage: node scripts/textscale.mjs [--check]   (also imported by the CSS generators)
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';

const px = (n) => `calc(${n}px * var(--ts, 1))`;
export function scaleText(css) {
  return css
    // font-size: 14px
    .replace(/(^|[;{\s])font-size\s*:\s*([0-9.]+)px(?=\s*(!important)?\s*[;}])/g, (m, pre, n) => `${pre}font-size:${px(n)}`)
    // font: 600 14px/1.2 …  ·  font: 14px/20px …  (the size, and a pixel line height with it)
    .replace(/(^|[;{\s])font\s*:\s*([^;{}]*?)(?<![\w.(-])([0-9.]+)px(\s*\/\s*([0-9.]+)px)?(?=[\s/])/g, (m, pre, before, n, lh, lhn) => `${pre}font:${before}${px(n)}${lh ? `/${px(lhn)}` : ''}`)
    // the body size token
    .replace(/(--fs\s*:\s*)([0-9.]+)px/g, (m, pre, n) => `${pre}${px(n)}`);
}

const FILES = ['ui.css', 'v8-base.css', 'shell-v8.css', 'clients.css', 'docs.css', 'drive.css', 'forms.css', 'imageeditor.css', 'ladder.css', 'office.css', 'pdfeditor.css', 'portal.css',
  'projects.css', 'public.css', 'sheets.css', 'sky.css', 'social.css', 'whiteboard.css'].map((f) => new URL(`../apps/web/${f}`, import.meta.url))
  // the embedded apps (Projects, Planner) inherit --ts through the page; Funnel Mapper Pro is a verified pristine copy and is not touched
  .concat(['projects/web/styles', 'planner/src/styles'].flatMap((d) => { const dir = new URL(`../apps/${d}/`, import.meta.url); return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.css')).map((f) => new URL(f, dir)) : []; }));
if (import.meta.url === `file://${process.argv[1]}`) {
  const check = process.argv.includes('--check'); let bad = 0;
  for (const f of FILES) { if (!existsSync(f)) continue; const a = readFileSync(f, 'utf8'); const b = scaleText(a); if (a !== b) { bad++; if (!check) writeFileSync(f, b); } }
  console.log(check ? (bad ? `FAIL ${bad} stylesheet(s) have unscaled font sizes: run node scripts/textscale.mjs` : 'PASS every font size follows the text-size setting') : `scaled ${bad} stylesheet(s)`);
  if (check && bad) process.exit(1);
}
