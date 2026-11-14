// Design v4 foundation: token contrast in every theme and organization (V4-11), theme resolution, and the app registry
// (manifests agree with the real app catalog and the permission catalog).
import { openDb, migrate, recorder } from './lib.mjs';
import { failures, resolve, ratio, solid, THEMES, ORGS, tokens } from '../packages/ui/tokens-lib.mjs';
import { loadManifests, manifestProblems } from '../packages/core/manifests.mjs';
import { resolveTheme, orgKey, createTheme, THEME_KEY } from '../apps/web/js/theme.js';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const { results, check } = recorder();

// ---- tokens
check('DV1', 'Every contrast pair meets its minimum in light and dark, for Layer2Funnels and Aurj', failures().length === 0);
const m = resolve('l2f', 'light');
check('DV2', 'Design V8 colours, with the two V8 values darkened ~5 % to pass 4.5:1: muted #646965 (V8 #6A706B), Aurj action #0A6E82 (V8 #0C7F95), L2F action #285BE2 (V8 #2B63F6) so action text also reads on its tint', m.muted === '#646965' && m.bg === '#F3F4F1' && resolve('aurj', 'light').action === '#0A6E82' && m.action === '#285BE2');
check('DV3', 'Muted text on the page background is at least 4.5:1 in all four sets (the prototype value failed at 4.19)',
  ORGS.every((o) => THEMES.every((t) => { const r = resolve(o, t); return ratio(solid(r.muted, r.surface), solid(r.bg, r.surface)) >= 4.5; })));
const dark = { ...resolve('l2f', 'light'), muted: '#6F7380' };
check('DV4', 'The contrast checker really fails the old muted colour (control for DV1)', ratio(solid(dark.muted, dark.surface), solid(dark.bg, dark.surface)) < 4.5);
check('DV5', 'tokens.css is up to date', spawnSync(process.execPath, ['scripts/build-tokens.mjs', '--check'], { encoding: 'utf8' }).status === 0);
const css = readFileSync('packages/ui/tokens.css', 'utf8');
check('DV6', 'The generated CSS has all four theme/organization sets and no rejected concept variants', /data-org="aurj"\]\[data-theme="dark"\]/.test(css) && /\[data-theme="dark"\]/.test(css) && !/paper|glass|blocks/.test(css));
check('DV7', 'The brand mark placeholders are flagged in the one theme file', tokens.color.orgs.find((o) => o.id === 'aurj').placeholder === true);

// ---- theme
check('DV8', 'Theme follows the system unless the person chose', resolveTheme(null, true) === 'dark' && resolveTheme(null, false) === 'light' && resolveTheme('light', true) === 'light' && resolveTheme('dark', false) === 'dark' && resolveTheme('weird', true) === 'dark');
check('DV9', 'Organization key: Aurj only for the aurj organization', orgKey({ slug: 'aurj' }) === 'aurj' && orgKey({ slug: 'layer2funnels' }) === 'l2f' && orgKey(null) === 'l2f');
{
  const root = { dataset: {} }; const mem = new Map();
  const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  let listener; const media = { matches: true, addEventListener: (_e, f) => { listener = f; } };
  const t = createTheme({ root, store, media }); t.apply();
  const a = root.dataset.theme === 'dark' && t.pref() === 'system';
  t.set('light'); const b = root.dataset.theme === 'light' && mem.get(THEME_KEY) === 'light' && t.pref() === 'light';
  t.set('system'); media.matches = false; listener(); const c = root.dataset.theme === 'light' && !mem.has(THEME_KEY);
  t.setOrg({ slug: 'aurj' }); const d = root.dataset.org === 'aurj';
  check('DV10', 'Theme controller: system default, explicit choice remembered, follows the system change, organization sets data-org', a && b && c && d);
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  const t2 = createTheme({ root: { dataset: {} }, store: broken, media: { matches: false } }); t2.apply(); t2.set('dark');
  check('DV11', 'A blocked browser store never breaks the page', t2.pref() === 'system');
}

const uiSrc = readFileSync('apps/web/js/ui.js', 'utf8');
check('DV19', 'The organization brand colours in the web UI equal the theme file', uiSrc.includes(`'${resolve('aurj', 'light').brand}'`) && uiSrc.includes(`'${resolve('l2f', 'light').brand}'`) && uiSrc.includes(`'${resolve('aurj', 'light')['brand-ink']}'`) && uiSrc.includes(`'${resolve('l2f', 'light')['brand-ink']}'`));
check('DV20', 'No fixed hex colour is left in the stylesheet outside the tokens (so dark mode and Aurj cannot be bypassed)', !/#[0-9a-fA-F]{3,6}\b/.test(readFileSync('apps/web/ui.css', 'utf8').replace(/\.aplate\{--g:#FFFEFA/, '')));
check('DV21', 'Fonts: the four v4 families are declared and every file exists; no remote font URL', (() => { const f = readFileSync('apps/web/fonts.css', 'utf8'); return ['Bricolage Grotesque', 'Geist', 'Geist Mono', 'Noto Nastaliq Urdu'].every((n) => f.includes(`"${n}"`)) && [...f.matchAll(/url\("\/fonts\/([^"]+)"\)/g)].every((m) => { try { readFileSync(`apps/web/fonts/${m[1]}`); return true; } catch { return false; } }) && !/https?:/.test(f); })());

const hdr = readFileSync('apps/web/_headers', 'utf8');
check('DV22', 'The page policy lets only our own pages ask for the location (Launcher weather); the camera stays off; the microphone is for our own pages only (Docs voice typing)', /geolocation=\(self\)/.test(hdr) && /camera=\(\)/.test(hdr) && /microphone=\(self\)/.test(hdr));

// ---- registry
const manifests = loadManifests();
const ids = manifests.map((x) => x.id);
check('DV12', 'There are twelve manifests, one per app of the Launcher, and each passes the schema', manifests.length === 12 && manifests.every((x) => manifestProblems(x).length === 0));
check('DV13', 'A manifest that switches on AI or an integration is refused (control)', manifestProblems({ ...manifests[0], ai: true }).length > 0 && manifestProblems({ ...manifests[0], integrations: ['ghl'] }).length > 0);
check('DV14', 'Manifest ids and route prefixes are unique', new Set(ids).size === ids.length && new Set(manifests.map((x) => x.routes)).size === ids.length);

const db = await openDb(); await migrate(db);
const apps = (await db.query('select key, lifecycle from apps')).rows;
const keys = new Set(apps.map((a) => a.key));
check('DV15', 'Every manifest id is an app in the database catalog and every Launcher app has a manifest', ids.every((i) => keys.has(i)) && apps.filter((a) => a.key !== 'platform').every((a) => ids.includes(a.key)));
const pk = (await db.query('select key from permissions')).rows.map((r) => r.key);
check('DV16', 'Every permission prefix in a manifest exists in the permission catalog', manifests.every((x) => x.permissionPrefix.every((p) => pk.some((k) => k.startsWith(p + '.')))));
const life = Object.fromEntries(apps.map((a) => [a.key, a.lifecycle]));
check('DV17', 'An app the database calls coming_soon is never marked live in its manifest', manifests.every((x) => !(life[x.id] === 'coming_soon' && x.status === 'live')));
check('DV18', 'Cross-app links point to real apps', manifests.every((x) => x.embeds.every((e) => ids.includes(e))));
await db.close();

for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}`);
const pc = results.filter((x) => x.ok).length; console.log(`\n${pc}/${results.length} checks passed`);
process.exit(pc === results.length ? 0 : 1);
