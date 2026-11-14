// Builds apps/web/v8-ledger.css: the Design V8 "Ledger" stylesheet, derived from the V8 prototype (never retyped).
// The prototype's own cascade is base.css -> v4.css -> extra.css -> v5.css -> v6.css -> v7.css -> v8.css (08_PROTOTYPE_AND_SOURCE/README).
// This file is that cascade, in that order, so every rule ends at its V8 value. Owner, 14 Nov 2026: "we are removing v4 completely,
// V8 100%" — the separate v4.css and the unloaded v8.css are replaced by this one file.
// Two filters keep it safe for the live app:
//   * the prototype's demo controls, global reset and colour token blocks are dropped (tokens.css owns colours, contrast-checked);
//   * a later-layer (v5–v8) rule is kept only for selectors the base layers already style. Prototype class names the app uses
//     for other things (.shell, .main, .bar, .qa …) collided when v8.css was loaded whole (whiteboard W6), so new selectors are adopted
//     component by component in apps/web/v8-base.css and the app stylesheets instead.
// Funnel Mapper styles stay confined to `.fmpx` (port of prototype-source/scope.py). Run: node scripts/build-ledger-css.mjs [--check]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const dir = new URL('../docs/design/v8/Layer2Funnels_V8_Developer_Handoff/08_PROTOTYPE_AND_SOURCE/prototype-source/', import.meta.url);
const read = (f) => readFileSync(new URL(f, dir), 'utf8');

// ---- port of scope.py ----
const SKIP = new Set(['fmpx', 'shell', 'ed', 'on', 'new', 'live', 'sm', 'big', 'six', 'three', 'no', 'd', 'grow']);
function pref(s, fm) {
  s = s.trim();
  if (!s || s.startsWith('.fmpx') || s.startsWith('.shell.fmpx')) return s;
  if (fm) { const m = /^\.([\w-]+)/.exec(s); if (!m || !fm.has(m[1])) return s; }
  return '.fmpx ' + s;
}
const scopeRules = (css, fm) => css.replace(/([^{}]+)\{([^{}]*)\}/g, (_, sel, body) => sel.split(',').map((x) => pref(x, fm)).join(',') + '{' + body + '}');
function scopeMedia(css, fm) {
  let out = ''; let i = 0;
  const re = /@media[^{]*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g; let m;
  while ((m = re.exec(css))) { const s = m.index + m[0].indexOf('{') + 1; out += css.slice(i, s) + scopeRules(m[1], fm); i = s + m[1].length; }
  return out + css.slice(i);
}
function fmScoped(v6, v7) {
  let L = v6.split('\n');
  let a = L.findIndex((l) => l.includes('FMP v6: its own dark identity'));
  let b = L.findIndex((l) => l.includes('Whiteboard full page'));
  const sec = L.slice(a + 1, b).join('\n');
  const fm = new Set([...sec.replace(/\{[^}]*\}/g, '{}').matchAll(/\.([\w-]+)/g)].map((x) => x[1]).filter((x) => !SKIP.has(x)));
  v6 = [...L.slice(0, a + 1), scopeRules(sec), ...L.slice(b)].join('\n');
  L = v7.split('\n');
  a = L.findIndex((l) => l.includes('Funnel Mapper: one step larger'));
  b = L.findIndex((l, i) => i > a && l.startsWith('/*'));
  v7 = [...L.slice(0, a + 1), scopeRules(L.slice(a + 1, b).join('\n')), ...L.slice(b)].join('\n');
  return [scopeMedia(v6, fm), scopeMedia(v7, fm)];
}


// ---- base layers (base.css, v4.css, extra.css): the same filters as before
const dropBase = (l) => /^\[data-concept/.test(l) || /\[data-concept="(paper|glass|blocks)"\]/.test(l)
  || /^(:root\{|html\{|\[data-theme=|\[data-org="(l2f|aurj)"\]\[data-theme|\[data-org="(l2f|aurj)"\]\{|\*\{|body\{|button,input\{|button\{|a\{|img,svg\{|:focus-visible\{|\[hidden\]\{|\.sr\{)/.test(l)
  || /^\.(demo|demo-fab)\b/.test(l) || /^\.demo[ .:{\[]/.test(l);
// the app builds its own drawer, toast and scrim (the prototype's are demo-shaped); its navigation items are links, so every `.nav button` / `.bbar button` rule also covers `a`
const ownBase = (l) => /^\s*\.(drawer|toast|scrim)\b/.test(l) || /^\s*#toasts\b/.test(l);
const navA = (l) => (/\.(nav|bbar|appmenu \.grid)(\s\.sub)? button/.test(l) && /^[.@ ]/.test(l) && !l.startsWith('@') ? [l, l.replace(/\.(nav|bbar|appmenu \.grid)(\s\.sub)? button/g, '.$1$2 a')] : [l]);
const base = ['base.css', 'v4.css', 'extra.css'].map((f) => read(f).split('\n')).flat().filter((l) => !dropBase(l) && !ownBase(l)).flatMap(navA).join('\n');

// ---- later layers (v5–v8): colour blocks and demo controls dropped, Funnel Mapper scoped
const [v6, v7] = fmScoped(read('v6.css'), read('v7.css'));
const colourBlock = (l) => /^(\[data-theme="(light|dark)"\]|\[data-org="(l2f|aurj)"\](\[data-theme="(light|dark)"\])?)\{--(bg|surface|text|brand|action)/.test(l);
const dropLater = (l) => colourBlock(l) || /^\.(demo|demo-fab)\b/.test(l) || /^\.demo[ .:{[]/.test(l) || (/#demofab\b/.test(l) && /^#demofab/.test(l));
const ownLater = (l) => /^\s*\.(toast|scrim)\b/.test(l) || /^\s*#toasts\b/.test(l);
const later = [read('v5.css'), v6, v7, read('v8.css')].map((css) => css.split('\n').filter((l) => !dropLater(l) && !ownLater(l)).flatMap(navA).join('\n'));

// ---- a small CSS reader: rules, @media/@supports blocks (recursive), other at-rules kept whole
function parse(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = []; let i = 0;
  const skipWs = () => { while (i < css.length && /\s/.test(css[i])) i++; };
  while (i < css.length) {
    skipWs(); if (i >= css.length) break;
    const open = css.indexOf('{', i); if (open < 0) break;
    const prelude = css.slice(i, open).trim();
    let depth = 1, j = open + 1; while (j < css.length && depth) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++; }
    const inner = css.slice(open + 1, j - 1);
    if (/^@(media|supports)/.test(prelude)) out.push({ at: prelude, kids: parse(inner) });
    else if (prelude.startsWith('@')) out.push({ raw: `${prelude}{${inner}}`, name: prelude });
    else out.push({ sel: prelude, body: inner.trim() });
    i = j;
  }
  return out;
}
const splitSel = (s) => { const parts = []; let d = 0, cur = ''; for (const c of s) { if (c === '(' || c === '[') d++; if (c === ')' || c === ']') d--; if (c === ',' && !d) { parts.push(cur); cur = ''; } else cur += c; } parts.push(cur); return parts.map((x) => x.trim().replace(/\s+/g, ' ')).filter(Boolean); };
const known = new Set(); const knownAt = new Set();
(function collect(nodes) { for (const n of nodes) { if (n.kids) collect(n.kids); else if (n.sel) splitSel(n.sel).forEach((x) => known.add(x)); else if (n.name) knownAt.add(n.name.replace(/\s+/g, ' ')); } })(parse(base));
function keep(nodes) {
  const out = [];
  for (const n of nodes) {
    if (n.kids) { const k = keep(n.kids); if (k.length) out.push(`${n.at}{${k.join('')}}`); }
    else if (n.name) { if (knownAt.has(n.name.replace(/\s+/g, ' '))) out.push(n.raw); }
    else { const sels = splitSel(n.sel).filter((x) => known.has(x)); if (sels.length && n.body) out.push(`${sels.join(',')}{${n.body}}`); }
  }
  return out;
}
let kept = 0;
const folded = later.map((css, k) => { const rules = keep(parse(css)); kept += rules.length; return `/* ===== V8 prototype ${['v5', 'v6', 'v7', 'v8'][k]}.css (rules for selectors above) ===== */\n${rules.join('\n')}`; }).join('\n');

const head = `/* GENERATED by scripts/build-ledger-css.mjs from the Design V8 prototype (prototype-source: base, v4, extra, v5, v6, v7, v8). Do not edit by hand. */
:root{--bw:1px;--blur:none;--stage:#0D0E12}
:root[data-org="l2f"]{--brand-soft:rgba(255,198,51,.2);--glow:255,198,51;--l1:#1B1D23;--l2:#2B63F6;--l3:#F3F1EB;--l4:#FFC633}
:root[data-org="aurj"]{--brand-soft:rgba(176,48,90,.13);--glow:224,99,138;--l1:#2A1621;--l2:#0E8BA3;--l3:#F6F0EB;--l4:#C2416B}
:root[data-org="aurj"][data-theme="dark"]{--brand-soft:rgba(224,99,138,.16)}
`;
const css = head + base + '\n' + folded + '\n';
const out = new URL('../apps/web/v8-ledger.css', import.meta.url);
if (process.argv.includes('--check')) { const ok = existsSync(out) && readFileSync(out, 'utf8') === css; console.log(ok ? 'PASS v8-ledger.css up to date' : 'FAIL v8-ledger.css stale: run node scripts/build-ledger-css.mjs'); process.exit(ok ? 0 : 1); }
writeFileSync(out, css);
console.log(`v8-ledger.css: base layers + ${kept} V8 rules folded in`);
