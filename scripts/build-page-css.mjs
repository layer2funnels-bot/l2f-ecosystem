// Builds the V8 stylesheet of one rebuilt page from the V8 prototype's own CSS (never retyped): every rule of every prototype layer
// (base, v4, extra, v5, v6, v7, v8, in that order, media queries included) whose selector touches one of the page's classes, scoped
// to the page's root element so it can never style another screen. Pages are built with the prototype's own markup and class names,
// so the cascade inside the page is the prototype's cascade. Colour token blocks stay in tokens.css.
// Scoping: ancestors outside the page (.shell, .content, [data-app] …) are dropped and the page root put in their place; a rule that
// needs a DIRECT parent outside the page (".shell>.main") is skipped; theme/organization prefixes ([data-theme], [data-org]) are kept.
// Config: PAGES below. Run: node scripts/build-page-css.mjs [--check]   (CI: npm run check:pages)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const PAGES = {
  // P01 Office Home (V8 #/office/home): classes measured in the prototype's DOM at 1440 and 390
  // ancestors: the real chain above the page in the prototype (captured with Chromium), so rules meant for other screens are left out
  // P01 Office (all 39 pages): every class used in the prototype's Office sources (office5.js, office6.js, avatar5.js, funnels5.js)
  'tasks': { root: '.v8p-tasks', ancestors: [{ tag: 'div', cls: ['content'] }, { tag: 'div', cls: ['main'] }, { tag: 'div', cls: ['shell'], attrs: { 'data-app': 'tasks' } }, { tag: 'main', attrs: { id: 'view' } }, { tag: 'body' }, { tag: 'html', attrs: { lang: 'en', 'data-concept': 'signal' } }],
    classes: ['addblock','addrow','addt','av-stack','backlink','big','blue','c6','cal','capture','card6','cardgrid','chip','chiprow','cnt','count','ctx','dc','dh','dn','due-c','ev','field','foot','grid-h','grip','grow','hint','inp','k6','k6c','kanban','kcard','kcol','kcol-h','kpi','kpirow','linkrow','main','mng','mrow','muted','notice','ol-cb','ol-i','ol-more','ol-row','ol-t','ol-timer','ol-tw','outline','pad-s','pflag','ph6','pill','plain','pplist','pprow','row2','seg3','sel','showdone','tabs6','tb-h','tb6','tbl6','tblock','tdoc','thd','tl-head','tl-ic','tr','two','upc','vsw','done','on','today','od','soon','t1','t1c','sm','xs','iconbtn','btn','primary','ghost','quiet','link','lede'] },
  'tasks-side': { root: '.tside', ancestors: [{ tag: 'aside', cls: ['side'] }, { tag: 'div', cls: ['shell'], attrs: { 'data-app': 'tasks' } }, { tag: 'main', attrs: { id: 'view' } }, { tag: 'body' }, { tag: 'html', attrs: { lang: 'en', 'data-concept': 'signal' } }],
    classes: ['coll', 'side-sec', 'sx', 'side-list', 'tl-ic', 'count', 'addrow', 'fold'] },
  'office': { root: '.v8p-office', ancestors: [{ tag: 'div', cls: ['content'] }, { tag: 'div', cls: ['main'] }, { tag: 'div', cls: ['shell'], attrs: { 'data-app': 'office' } }, { tag: 'main', attrs: { id: 'view' } }, { tag: 'body' }, { tag: 'html', attrs: { lang: 'en', 'data-concept': 'signal' } }],
    classes: ['pagehead', 'lede', 'backlink', 'a3d', 'a3d-badge', 'a3d-fig', 'a3d-ped', 'a3d-ring', 'a3d-sky', 'acc-row', 'accm', 'acts', 'add', 'addrow', 'addsec', 'askbar', 'av-cards', 'avatar', 'avc', 'avc-art', 'avc-b', 'avc-badge', 'avc-body', 'avc-foot', 'avc-role', 'avc-stage', 'avcard', 'avgrid', 'best', 'bk-sw', 'bkc', 'blink', 'blue', 'bp', 'brand', 'brandprev', 'btn', 'bust', 'cagrid', 'cahead', 'callout', 'card', 'card6', 'cardgrid', 'carow', 'cbx', 'chap', 'chap-body', 'chapters', 'checkl', 'chedit', 'chip', 'chiprow', 'chips6', 'chipsel', 'chk', 'client', 'cnt', 'colrows', 'core', 'csw', 'danger', 'dark', 'deep', 'des', 'dirty', 'doc', 'docc', 'docic', 'docpage', 'docrow', 'docsec', 'dotc', 'dots', 'drop', 'drop6', 'due', 'ed-tools', 'edbody', 'edhead', 'edr', 'edtable', 'ext', 'facts', 'fcol', 'fcount', 'feat', 'feed', 'field', 'fitem', 'flat', 'fmp', 'fn-arrow', 'fn-map', 'fn-node', 'fname', 'foot', 'formcol', 'formpage', 'formprev', 'fsec6', 'ft', 'full', 'fut', 'ghost', 'grid-h', 'grid2', 'grid3', 'grip', 'grow', 'h1', 'h2', 'hide-m', 'hint', 'iconbtn', 'in', 'ink', 'inp', 'int', 'kv', 'kv2', 'lede', 'left', 'legend', 'light', 'linkbtn', 'linkrow', 'logodrop', 'orbit', 'o0', 'o1', 'o2', 'o3', 'pick', 'specs', 'on', 'ok', 'done', 'lk', 'lp-steps', 'main', 'mini-bar', 'mm', 'mm-l', 'mm-n', 'mmap', 'mono', 'mrow', 'muted', 'n', 'narrow', 'nm', 'notice', 'now', 'num', 'o-grid', 'o-hero', 'okline', 'okr', 'oneliner', 'outline', 'over', 'owner', 'pad-s', 'panel', 'pdf', 'pdot', 'ph-cover', 'ph-name', 'ph-row', 'ph6', 'pickgrid', 'pill', 'pipe4', 'plain', 'pmx', 'primary', 'proc', 'profile-hero', 'prog', 'pulse', 'qcard', 'quiet', 'quote', 'r1', 'r2', 'rel', 'relcard', 'relcards', 'req', 'right', 'ring', 'rng', 'roles', 'rootbelief', 'row', 'row2', 'rowh', 'rows', 'rte', 'rte-b', 'savest', 'sec-h', 'sec-t', 'seg3', 'sel', 'side-panel', 'sm', 'sm-in', 'sp', 'specs', 'spin', 'split', 'stack-bar', 'stackcol', 'startc', 'stg-edit', 'stg-row', 'stmt', 'studio', 'studio-body', 'studio-c', 'studio-tabs', 'studio-wrap', 'sub', 'swatch', 't1', 't1c', 't2', 'tabs6', 'tag', 'tb6', 'tbl', 'tbl6', 'tblwrap', 'team', 'tg-row', 'thd', 'ticks', 'tm', 'tm-cover', 'toggle', 'toolbar', 'tp-title', 'tplprev', 'tr', 'tx2', 'ver', 'vs', 'vsw', 'warn', 'why', 'wic', 'wide', 'wizsteps', 'worst', 'ws-bar', 'xs'] },
};

const dir = new URL('../docs/design/v8/Layer2Funnels_V8_Developer_Handoff/08_PROTOTYPE_AND_SOURCE/prototype-source/', import.meta.url);
const LAYERS = ['base.css', 'v4.css', 'extra.css', 'v5.css', 'v6.css', 'v7.css', 'v8.css'].map((f) => readFileSync(new URL(f, dir), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''));

function parse(css) {
  const out = []; let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i); if (open < 0) break;
    const prelude = css.slice(i, open).trim();
    let depth = 1, j = open + 1; while (j < css.length && depth) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++; }
    const inner = css.slice(open + 1, j - 1);
    if (/^@(media|supports)/.test(prelude)) out.push({ at: prelude, kids: parse(inner) });
    else if (!prelude.startsWith('@')) out.push({ sel: prelude, body: inner.trim() });
    i = j;
  }
  return out;
}
const splitList = (s) => { const parts = []; let d = 0, cur = ''; for (const c of s) { if ('(['.includes(c)) d++; if (')]'.includes(c)) d--; if (c === ',' && !d) { parts.push(cur); cur = ''; } else cur += c; } parts.push(cur); return parts.map((x) => x.trim().replace(/\s+/g, ' ')).filter(Boolean); };
// a selector as compounds and combinators: ".a .b>.c" -> [".a", " ", ".b", ">", ".c"]
const tokens = (sel) => { const t = []; let cur = '', d = 0; for (let k = 0; k < sel.length; k++) { const c = sel[k]; if ('(['.includes(c)) d++; if (')]'.includes(c)) d--; if (!d && (c === ' ' || c === '>' || c === '+' || c === '~')) { if (cur) t.push(cur); cur = ''; if (c !== ' ' || (t.length && !/^[ >+~]$/.test(t[t.length - 1]))) { if (c === ' ') t.push(' '); else { if (t[t.length - 1] === ' ') t.pop(); t.push(c); } } continue; } cur += c; } if (cur) t.push(cur); return t.filter((x, n, a) => !(x === ' ' && /^[>+~]$/.test(a[n + 1] ?? ''))); };
const PREFIX = /^(:root|html)?(\[data-(theme|org)[^\]]*\])+$|^:root$|^html$/;

// does a compound selector (".a.b[data-x=y]", "html", ":root") match one element of the real ancestor chain?
function matches(compound, el) {
  let rest = compound.replace(/^:root/, 'html');
  const tag = /^[a-z][a-z0-9]*/.exec(rest)?.[0]; if (tag && tag !== el.tag) return false; rest = rest.slice(tag?.length ?? 0);
  for (const m of rest.matchAll(/\.([\w-]+)|#([\w-]+)|\[([\w-]+)(?:([~|^$*]?=)"?([^"\]]*)"?)?\]|(:[\w-]+(?:\([^)]*\))?)/g)) {
    if (m[1] && !(el.cls ?? []).includes(m[1])) return false;
    if (m[2] && el.attrs?.id !== m[2]) return false;
    if (m[3] && /^data-(theme|org)$/.test(m[3])) continue;       // theme/organization: kept as a live prefix, not decided here
    if (m[3] && (el.attrs?.[m[3]] === undefined || (m[4] && el.attrs[m[3]] !== m[5]))) return false;
    if (m[6]) return false;                                        // :hover, :not(...) on an outside ancestor: not part of the page's resting state
  }
  return true;
}
function scope(sel, root, has, chain) {
  const t = tokens(sel); const first = t.findIndex((x, n) => n % 2 === 0 && has(x));
  if (first < 0) return null;
  if (first > 0 && t[first - 1] !== ' ') return null;            // needs a direct parent/sibling outside the page
  const outside = t.slice(0, first).filter((x, n) => n % 2 === 0);
  if (t.slice(0, first).some((x) => /^[>+~]$/.test(x))) return null;
  for (const c of outside) if (!PREFIX.test(c) && !chain.some((el) => matches(c, el))) return null;   // this rule belongs to another screen
  const pre = outside.filter((x) => PREFIX.test(x));
  return [...pre, root, ...t.slice(first)].join(' ').replace(/ ([>+~]) /g, '$1').replace(/\s+/g, ' ').replace(/ ([>+~])/g, '$1').replace(/([>+~]) /g, '$1');
}
function build(root, classes, chain = []) {
  const set = new Set(classes); const has = (compound) => [...compound.matchAll(/\.([\w-]+)/g)].some((m) => set.has(m[1]));
  const emit = (nodes) => nodes.flatMap((n) => {
    if (n.kids) { const k = emit(n.kids); return k.length ? [`${n.at}{${k.join('')}}`] : []; }
    if (/--(bg|surface|text|brand|action)\s*:/.test(n.body)) return [];   // colour tokens live in tokens.css
    const sels = splitList(n.sel).map((s) => scope(s, root, has, chain)).filter(Boolean);
    return sels.length && n.body ? [`${[...new Set(sels)].join(',')}{${n.body}}`] : [];
  });
  return LAYERS.map((css) => emit(parse(css)).join('\n')).join('\n');
}

mkdirSync(new URL('../apps/web/pages/', import.meta.url), { recursive: true });
let stale = 0;
for (const [name, { root, classes, ancestors }] of Object.entries(PAGES)) {
  const css = `/* GENERATED by scripts/build-page-css.mjs from the V8 prototype CSS for "${name}", scoped to ${root}. Do not edit by hand. */\n${build(root, classes, ancestors)}\n`;
  const out = new URL(`../apps/web/pages/${name}.css`, import.meta.url);
  if (process.argv.includes('--check')) { if (!existsSync(out) || readFileSync(out, 'utf8') !== css) { stale++; console.log(`FAIL pages/${name}.css stale`); } continue; }
  writeFileSync(out, css); console.log(`pages/${name}.css: ${css.split('\n').length} lines`);
}
if (process.argv.includes('--check')) { console.log(stale ? 'run: node scripts/build-page-css.mjs' : 'PASS page stylesheets up to date'); process.exit(stale ? 1 : 0); }
