// Development-only page: every shared component in every state, so the visual tests can check them in each theme and organization.
// Not part of the production build (scripts/build-web.mjs removes it). Query: ?org=l2f|aurj&theme=light|dark
import { h, put, icon, btn, pill, chip, avatar, notice, seg, tabs, field, skeleton, emptyState, errorState, noAccessState, readOnlyNotice, previewRibbon, dialog, drawer, toast, offlineNotice } from './ui.js';
import { loadRegistry, plateOf } from './registry.js';

const q = new URLSearchParams(location.search);
document.documentElement.dataset.org = q.get('org') === 'aurj' ? 'aurj' : 'l2f';
document.documentElement.dataset.theme = q.get('theme') === 'dark' ? 'dark' : 'light';
const reg = await loadRegistry();
const sec = (title, ...kids) => h('section', { class: 'card', style: 'padding:var(--space-5);margin-bottom:var(--space-4)' }, h('h2', {}, title), h('div', { class: 'grid', style: 'margin-top:var(--space-3)' }, ...kids));
const row = (...k) => h('div', { style: 'display:flex;gap:var(--space-2);flex-wrap:wrap;align-items:center' }, ...k);

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
  sec('Table that stacks on phones', h('table', { class: 'tbl stack' }, h('thead', {}, h('tr', {}, ...['Step', 'Visitors', 'Revenue'].map((t) => h('th', {}, t)))),
    h('tbody', {}, ...[['Landing', '2,500', '$0'], ['Checkout', '150', '$4,199']].map((r) => h('tr', {}, ...r.map((c, i) => h('td', { 'data-l': ['Step', 'Visitors', 'Revenue'][i] }, c))))))),
  sec('Overlays', row(btn('Open dialog', () => dialog({ title: 'A dialog', body: h('p', {}, 'Esc closes it and focus returns.'), actions: [{ label: 'Close', focus: true }] })),
    btn('Open drawer', () => drawer({ title: 'A drawer', body: h('p', {}, 'Side panel content.'), actions: [{ label: 'Done', cls: 'pri' }] })), btn('Show toast', () => toast('Saved', true)))));
document.title = 'Component gallery';
