// Development-only page: every shared component in every state, so the visual tests can check them in each theme and organization.
// Not part of the production build (scripts/build-web.mjs removes it). Query: ?org=l2f|aurj&theme=light|dark
import { h, put, icon, btn, pill, chip, avatar, notice, seg, tabs, field, skeleton, emptyState, errorState, noAccessState, readOnlyNotice, previewRibbon, dialog, drawer, toast, offlineNotice } from './ui.js';
import { loadRegistry, plateOf } from './registry.js';
import { skyScene, weatherChip } from './views/launcher.js';
import { PARTS, greeting } from './sky.js';
import { docView } from './modules/docs.js';
import { serialize } from './modules/docmodel.js';

const q = new URLSearchParams(location.search);
document.documentElement.dataset.org = q.get('org') === 'aurj' ? 'aurj' : 'l2f';
document.documentElement.dataset.theme = q.get('theme') === 'dark' ? 'dark' : 'light';
const reg = await loadRegistry();
const sec = (title, ...kids) => h('section', { class: 'card', style: 'padding:var(--space-5);margin-bottom:var(--space-4)' }, h('h2', {}, title), h('div', { class: 'grid', style: 'margin-top:var(--space-3)' }, ...kids));
const row = (...k) => h('div', { style: 'display:flex;gap:var(--space-2);flex-wrap:wrap;align-items:center' }, ...k);

// The Docs editor against an in-memory Drive (no server): the same module the app mounts, so the visual and keyboard checks cover the real thing.
const demoBody = serialize({ blocks: [{ t: 'h1', c: [{ x: 'Quarterly plan' }] }, { t: 'p', c: [{ x: 'Start with ' }, { x: 'the offer', b: 1 }, { x: ', then ' }, { x: 'the traffic', i: 1 }, { x: ' and a ' }, { x: 'link', a: 'https://example.com' }, { x: '.' }] }, { t: 'quote', c: [{ x: 'Measure what you change.' }] }, { t: 'h2', c: [{ x: 'Traffic' }] }, { t: 'ul', items: [[{ x: 'Ads' }], [{ x: 'Email' }]] }] });
const store = { file: { id: 'demo', name: 'Quarterly plan', kind: 'document', mime_type: 'application/vnd.l2f.doc+json', space: 'shared', client_id: null, project_id: null, archived_at: null, current_version: 1 }, versions: [{ version: 1, body: demoBody, created_at: new Date().toISOString(), note: null }] };
const fakeApi = { async call(op, i) {
  const ok = (data) => ({ ok: true, status: 200, data: [data] });
  if (op === 'drive.files.get') return ok(store.file);
  if (op === 'drive.files.version') return ok(store.versions.at(-1));
  if (op === 'drive.files.versions') return { ok: true, status: 200, data: [...store.versions].reverse().map((v) => ({ ...v, size_bytes: v.body.length })) };
  if (op === 'drive.files.versions.add') { if (i.expected !== undefined && i.expected !== store.file.current_version) return { ok: false, status: 409 }; store.versions.push({ version: store.file.current_version + 1, body: i.body, created_at: new Date().toISOString(), note: i.note ?? null }); store.file = { ...store.file, current_version: store.file.current_version + 1 }; return ok(store.file); }
  if (op === 'drive.files.update') { store.file = { ...store.file, name: i.name }; return ok(store.file); }
  return { ok: false, status: 404 };
} };
const docCtx = { live: () => true, announce() {}, can: () => true, clients: new Map(), orgName: 'Layer2Funnels' };

put(document.getElementById('gallery'),
  previewRibbon(),
  h('h1', { 'data-page-title': true }, 'Component gallery'),
  h('p', { class: 'muted' }, 'Muted text sits here. ', h('span', { class: 'mono' }, '1,234.50 USD'), ' ', h('span', { lang: 'ur', dir: 'rtl' }, 'اردو متن کی مثال')),
  sec('Buttons', row(btn('Primary', () => {}, 'pri'), btn('Secondary', () => {}), btn('Danger', () => {}, 'dng'), btn('Link', () => {}, 'link'), btn('Disabled', () => {}, '', { disabled: true }), btn('Disabled with reason', () => {}, '', { 'aria-disabled': 'true', title: 'Needs the backend first' }),
    h('button', { type: 'button', class: 'iconbtn', 'aria-label': 'More' }, icon('more')))),
  sec('Segmented, tabs, chips, pills', row(seg([['a', 'Day'], ['b', 'Week'], ['c', 'Month']], 'b', () => {}, 'Range')), tabs([['o', 'Overview'], ['l', 'List'], ['b', 'Board']], 'o', () => {}, 'Views'),
    row(chip('Neutral'), chip('Done', 'ok', 'check'), chip('Careful', 'warn', 'warn'), chip('Failed', 'bad', 'cross'), chip('Active', 'act'), pill('Locked', 'warn', 'lock'), avatar('Una Owner'))),
  sec('Notices', notice('info', 'info', 'Information that helps.'), notice('warn', 'warn', 'Something to check.'), notice('err', 'cross', 'Something went wrong.'), readOnlyNotice('This record is archived'), offlineNotice()),
  sec('Fields', field({ id: 'g-name', label: 'Name', value: 'Una' }).el, (() => { const f = field({ id: 'g-bad', label: 'Email', value: 'nope', hint: 'Use your work email' }); queueMicrotask(() => { f.error('That doesn’t look like an email address.'); document.getElementById('main').focus?.(); }); return f.el; })(), field({ id: 'g-area', label: 'Notes', rows: 3 }).el),
  sec('Shared states', skeleton(3), emptyState({ title: 'Nothing here yet', body: 'Create the first one.', ic: 'plus', first: true }), errorState(() => {}), noAccessState()),
  sec('App plates', row(...[...reg.values()].map((m, i) => plateOf(m, 56, i % 4 === 3 ? 'locked' : 'available')))),
  sec('Launcher sky: time of day and weather', ...[['morning', 'clear', 'Clear', 21], ['afternoon', 'cloudy', 'Cloudy', 24], ['evening', 'rain', 'Light rain', 16], ['night', 'cold', 'Snow', -2], ['afternoon', 'hot', 'Clear', 38], ['night', 'clear', 'Clear', 14]].map(([part, wx, label, tempC]) => {
    const box = h('div', { class: 'launcher', 'data-part': part, 'data-wx': wx, style: 'min-height:0;padding:var(--space-3)' }, skyScene(),
      h('div', { class: 'skyhead' }, h('div', {}, h('p', { class: 'hi' }, greeting(part, 'Una Owner')), h('strong', {}, `${part} · ${wx}`)), weatherChip({ condition: wx, label, tempC })));
    return box;
  })),
  h('section', { class: 'card', style: 'padding:var(--space-5);margin-bottom:var(--space-4)', 'data-gallery': 'docs' }, h('h2', {}, 'Docs editor (shared module)'), docView({ api: fakeApi, id: 'demo', ctx: docCtx })),
  sec('Table that stacks on phones', h('table', { class: 'tbl stack' }, h('thead', {}, h('tr', {}, ...['Step', 'Visitors', 'Revenue'].map((t) => h('th', {}, t)))),
    h('tbody', {}, ...[['Landing', '2,500', '$0'], ['Checkout', '150', '$4,199']].map((r) => h('tr', {}, ...r.map((c, i) => h('td', { 'data-l': ['Step', 'Visitors', 'Revenue'][i] }, c))))))),
  sec('Overlays', row(btn('Open dialog', () => dialog({ title: 'A dialog', body: h('p', {}, 'Esc closes it and focus returns.'), actions: [{ label: 'Close', focus: true }] })),
    btn('Open drawer', () => drawer({ title: 'A drawer', body: h('p', {}, 'Side panel content.'), actions: [{ label: 'Done', cls: 'pri' }] })), btn('Show toast', () => toast('Saved', true)))));
document.title = 'Component gallery';
