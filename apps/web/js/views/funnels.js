// Office → Funnels (design 06): home, list, record, edit, share with a client, archive / restore, delete permanently (type the name).
// The business records live here in Office; Funnel Mapper keeps its own data in this phase. The database decides who may do what; the
// buttons only follow `ctx.can`, which comes from the same permission engine (organization-wide or on one client).
import { h, put, icon, pill, btn, link, dialog, toast, field, notice, skeleton, errorState, emptyState, notFoundState, readOnlyNotice, plate, initials } from '../ui.js';
import { FUNNEL_TYPES, hrefFor } from '../routes.js';
import { fieldLabel, messageFor } from '../messages.js';
import { dirty } from '../dirty.js';

const TYPE = Object.fromEntries(FUNNEL_TYPES.map((t) => [t.key, t]));
const nameOf = (type, r) => (type === 'stories' ? r.title : r.name);
const when = (iso) => { const d = new Date(iso); const days = Math.round((Date.now() - d) / 86400000); return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : days < 14 ? `${days} days ago` : d.toLocaleDateString(); };

// ---- field definitions per type (the server validates again; the database decides who may do what)
export const FIELD_DEFS = {
  avatars: [
    { k: 'name', label: 'Name', req: true }, { k: 'summary', label: 'Short summary', hint: 'One line so people can tell it apart in a list.' },
    { k: 'pains', label: 'Pains', rows: 4 }, { k: 'desires', label: 'Desires', rows: 4 }, { k: 'objections', label: 'Objections', rows: 4 },
  ],
  offers: [
    { k: 'name', label: 'Name', req: true }, { k: 'kind', label: 'Type', options: [['offer', 'Offer'], ['product', 'Product']] },
    { k: 'promise', label: 'Promise', rows: 2 }, { k: 'description', label: 'Description', rows: 4 },
    { k: 'price_amount', label: 'Price', num: true }, { k: 'currency', label: 'Currency (for example USD)', hint: 'Three capital letters. Needed when a price is set.' },
    { k: 'avatar_id', label: 'Avatar', ref: 'avatars' },
  ],
  stories: [
    { k: 'title', label: 'Title', req: true }, { k: 'kind', label: 'Type', options: [['origin', 'Origin'], ['case_study', 'Case study'], ['testimonial', 'Testimonial'], ['analogy', 'Analogy'], ['other', 'Other']] },
    { k: 'body', label: 'Story', rows: 10 }, { k: 'avatar_id', label: 'Avatar', ref: 'avatars' }, { k: 'offer_id', label: 'Offer', ref: 'offers' },
  ],
  brand_kits: [
    { k: 'name', label: 'Name', req: true }, { k: 'voice', label: 'Voice and tone', rows: 4 },
    { k: 'colors', label: 'Colours', list: true, hint: 'Comma-separated hex codes, for example #173a8f, #ff7a59.' },
    { k: 'fonts', label: 'Fonts', list: true, hint: 'Comma-separated font names.' }, { k: 'notes', label: 'Notes', rows: 4 },
  ],
};
const showValue = (f, r, refs) => {
  const v = r[f.k];
  if (f.list) return (v ?? []).join(', ');
  if (f.ref) { const x = (refs[f.ref] ?? []).find((o) => o.id === v); return x ? nameOf(f.ref, x) : ''; }
  if (f.options) return (f.options.find(([k]) => k === v) ?? [])[1] ?? '';
  if (f.k === 'price_amount') return v == null ? '' : `${v} ${r.currency ?? ''}`.trim();
  if (f.k === 'currency') return '';
  return v ?? '';
};
const run = (ctx, op, input) => ctx.api.call(op, input);
const subnav = (current) => h('div', { hidden: true },   // the sections are the sub-menu of Funnels in the side rail (appnav.js)
  h('a', { class: 'btn', href: hrefFor.funnels(), ...(current === 'home' ? { 'aria-current': 'page' } : {}), style: current === 'home' ? 'background:var(--primary);color:var(--on-primary);border-color:var(--primary)' : '' }, 'Home'),
  ...FUNNEL_TYPES.map((t) => h('a', { class: 'btn', href: hrefFor.list(t.key), ...(current === t.key ? { 'aria-current': 'page' } : {}), style: current === t.key ? 'background:var(--primary);color:var(--on-primary);border-color:var(--primary)' : '' }, t.label)),
  h('a', { class: 'btn', href: '#/office/funnels/strategies' }, 'Funnel Strategies'));
const pageHead = (crumb, title, sub, right) => [h('div', { class: 'crumb' }, crumb),
  h('div', { class: 'page-actions' }, h('div', {}, h('h1', { 'data-page-title': true }, title), sub ? h('p', { class: 'sub' }, sub) : null), right ? h('div', { class: 'acts' }, ...right) : null)];

// ---- Customer Avatar: the portrait profile (Design v4, `.ava`). Only the fields this record really has are shown; nothing is invented.
// The illustration is drawn from the name (the same name always gets the same face), as the design's portraits are drawn from their profile.
const PAL = { c: ['#FF8A6B', '#5FDCCB', '#A898FF', '#4CC6DC', '#E0638A', '#F5C84C'], skin: ['#E9BC98', '#C68A5E', '#8D5A3B', '#F1C9A8'], hair: ['#3A2418', '#1D1A18', '#141414', '#2A1810'], shirt: ['#2B63F6', '#F07C1A', '#16171B', '#B0305A', '#0C7F95'] };
const hashOf = (s) => [...String(s ?? '')].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7);
const NS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}, ...kids) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); e.append(...kids); return e; };
function face(name) {
  const n = hashOf(name); const pick = (list, i) => list[Math.floor(n / (i + 1)) % list.length];
  const skin = pick(PAL.skin, 1); const hair = pick(PAL.hair, 2); const shirt = pick(PAL.shirt, 3); const long = n % 2 === 0; const id = `g${n}`;
  return sv('svg', { viewBox: '0 0 200 200', 'aria-hidden': 'true' },
    sv('defs', {}, sv('linearGradient', { id, x1: '0', y1: '0', x2: '0', y2: '1' }, sv('stop', { offset: '0', 'stop-color': shirt }), sv('stop', { offset: '1', 'stop-color': `color-mix(in srgb,${shirt} 60%,#000)` }))),
    long ? sv('path', { d: 'M58 92c-4-40 18-60 42-60s48 18 42 62c4 30-4 52-10 62H68c-8-12-14-34-10-64z', fill: hair }) : null,
    sv('path', { d: 'M26 206c4-40 36-62 74-62s70 22 74 62z', fill: shirt }), sv('path', { d: 'M26 206c4-40 36-62 74-62s70 22 74 62z', fill: `url(#${id})`, opacity: '.55' }),
    sv('rect', { x: '86', y: '112', width: '28', height: '38', rx: '13', fill: skin }), sv('rect', { x: '86', y: '118', width: '28', height: '12', fill: '#000', opacity: '.08' }),
    sv('ellipse', { cx: '100', cy: '88', rx: '33', ry: '39', fill: skin }),
    long ? sv('path', { d: 'M67 86c0-30 16-46 34-46s33 16 33 44c-10-14-22-22-36-20-12 2-22 10-31 22z', fill: hair }) : sv('path', { d: 'M66 84c0-30 16-45 35-45 20 0 34 14 34 42-6-12-18-19-34-19s-27 8-35 22z', fill: hair }),
    sv('circle', { cx: '88', cy: '92', r: '3.4', fill: '#231F1A' }), sv('circle', { cx: '112', cy: '92', r: '3.4', fill: '#231F1A' }),
    sv('path', { d: 'M90 108q10 8 20 0', stroke: '#231F1A', 'stroke-width': '3', fill: 'none', 'stroke-linecap': 'round' }),
    sv('ellipse', { cx: '80', cy: '102', rx: '6', ry: '3.5', fill: '#FF7A6B', opacity: '.25' }), sv('ellipse', { cx: '120', cy: '102', rx: '6', ry: '3.5', fill: '#FF7A6B', opacity: '.25' }));
}
function portrait(r, clientName) {
  const c = PAL.c[hashOf(r.name) % PAL.c.length];
  const lines = (s) => String(s ?? '').split(/\n+/).map((x) => x.trim()).filter(Boolean);
  const sp = (i, title, ic, body) => h('section', { class: 'sp', style: `--i:${i};--c:${c}` }, h('h3', {}, icon(ic), title), body);
  const list = (s, empty = 'Not filled in yet.') => (lines(s).length ? h('ul', {}, ...lines(s).map((x) => h('li', {}, x))) : h('p', { class: 'muted', style: 'font-size:14px' }, empty));
  return h('div', { class: 'ava', 'aria-label': `Profile of ${r.name}` },
    h('div', { class: 'specs left' }, sp(0, 'Who they are', 'user', r.summary ? h('p', { style: 'font-size:14.5px' }, r.summary) : h('p', { class: 'muted', style: 'font-size:14px' }, 'No summary yet.')), sp(1, 'Pains', 'alert', list(r.pains))),
    h('div', { class: 'ava-center' }, h('div', { class: 'portrait', style: `--c:${c}` }, face(r.name), h('span', { class: 'ring' }), h('span', { class: 'badge' }, 'Customer avatar')),
      h('h2', { class: 'ava-name' }, r.name), r.summary ? h('q', {}, r.summary) : null, clientName ? h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;justify-content:center' }, h('span', { class: 'tag' }, icon('clients'), clientName)) : null),
    h('div', { class: 'specs right' }, sp(2, 'Desires', 'heart', list(r.desires)), sp(3, 'Objections', 'xcircle', list(r.objections))));
}

// ---- Funnels home
export function funnelsHomeView(ctx) {
  const box = h('div', {}, skeleton(3));
  const stratBox = h('section', { class: 'card pad', 'aria-labelledby': 'fs-h' }, h('h3', { id: 'fs-h' }, 'Funnel Strategies'), skeleton(1));
  run(ctx, 'funnels.strategies.list', { library: true }).then((r) => { if (!ctx.live()) return; const list = r.ok ? r.data.slice(0, 4) : [];
    put(stratBox, h('h3', { id: 'fs-h' }, 'Funnel Strategies'), list.length ? h('ul', { class: 'rows', style: 'margin:var(--space-2) calc(var(--space-5)*-1) 0' }, ...list.map((x) => h('li', {}, h('a', { href: `#/office/funnels/strategy/${x.id}` }, x.name), pill(x.status === 'approved' ? 'Approved' : x.status === 'in_review' ? 'In review' : 'Draft')))) : h('p', { class: 'fine', style: 'margin:var(--space-2) 0' }, 'No strategies yet. Write one per funnel.'), h('a', { class: 'btn link', href: '#/office/funnels/strategies' }, 'See all Funnel Strategies')); });
  (async () => {
    const [ov, ...lists] = await Promise.all([run(ctx, 'funnels.overview'), ...FUNNEL_TYPES.map((t) => run(ctx, `funnels.${t.key}.list`, {}).then((r) => [t, r]))]);
    if (!ctx.live()) return;
    if (!ov.ok) return put(box, errorState(() => ctx.rerender()));
    const n = Object.fromEntries(ov.data.map((x) => [x.type, x.n]));
    const recent = lists.flatMap(([t, r]) => (r.ok ? r.data.map((x) => ({ t, x })) : [])).sort((a, b) => new Date(b.x.updated_at) - new Date(a.x.updated_at)).slice(0, 4);
    put(box, h('div', { class: 'grid g4' }, ...FUNNEL_TYPES.map((t) => h('a', { class: 'tile2', href: hrefFor.list(t.key), style: 'text-decoration:none;color:inherit' },
      h('span', { class: 'fine' }, t.full), h('span', { class: 'num' }, String(n[t.key] ?? 0)), h('span', { class: 'link', style: 'min-height:0' }, `Open ${t.label}`)))),
    h('div', { class: 'split', style: 'margin-top:var(--space-4)' },
      h('section', { class: 'card' }, h('h3', { style: 'padding:var(--space-4) var(--space-5) 0' }, 'Recently changed'),
        recent.length ? h('ul', { class: 'rows' }, ...recent.map(({ t, x }) => h('li', {}, h('span', {}, h('b', {}, nameOf(t.key, x) || '(untitled)'), h('br'), h('span', { class: 'fine' }, `${t.one.toLowerCase()} · ${when(x.updated_at)}`)), h('a', { class: 'btn', href: hrefFor.record(t.key, x.id) }, 'Open'))))
          : emptyState({ title: 'Nothing here yet', body: 'Records you create appear here.', ic: 'doc' })),
      stratBox,
      h('section', { class: 'card pad' }, h('h3', {}, 'Funnel maps'), h('p', { class: 'fine', style: 'margin:var(--space-2) 0 var(--space-3)' }, 'Funnel maps live in the Funnel Mapper app. How they appear here needs a deliberate design first.'), pill('Link design pending', 'warn'))));
  })();
  return h('section', {}, subnav('home'), ...pageHead('Office · Funnels', 'Funnels', `Your ${ctx.orgName} funnel assets in one place.`), box);
}

// ---- list
export function funnelListView(ctx, typeKey) {
  const t = TYPE[typeKey]; const o = t.obj; const state = { q: '', show: 'active' };
  const body = h('div', {}); let rows = [];
  const canNew = ctx.canAnywhere(`funnels.${o}.create`);
  const q = h('input', { id: 'q', type: 'search', placeholder: `Search ${t.label.toLowerCase()}`, autocomplete: 'off', oninput: (e) => { state.q = e.target.value; paint(); } });
  const sel = h('select', { id: 'fl', 'aria-label': 'Show', onchange: (e) => { state.show = e.target.value; load(); } }, ...[['active', 'Active'], ['archived', 'Archived'], ['all', 'All']].map(([v, l]) => h('option', { value: v }, l)));
  const scopeText = (r) => (r.client_id ? (r.client_visible ? pill(`Shared · ${ctx.clients.get(r.client_id) ?? 'client'}`, 'primary', 'share') : pill(ctx.clients.get(r.client_id) ?? 'Client')) : pill('Internal'));
  function paint() {
    const list = rows.filter((r) => `${nameOf(typeKey, r)} ${r.summary ?? r.promise ?? ''}`.toLowerCase().includes(state.q.toLowerCase()));
    if (!list.length) {
      put(body, h('div', { class: 'card pad' }, emptyState({ first: !state.q && state.show === 'active',
        title: state.q ? 'No matches' : state.show === 'archived' ? 'Nothing archived' : `No ${t.label.toLowerCase()} yet`,
        body: state.q ? 'Try a different word, or clear the search.' : state.show === 'archived' ? 'Archived items wait here until you restore or delete them.' : canNew ? `Create your first ${t.one.toLowerCase()} to start building your library.` : 'When someone adds one, you’ll see it here.',
        action: state.q ? btn('Clear search', () => { state.q = ''; q.value = ''; paint(); }) : canNew && state.show === 'active' ? h('a', { class: 'btn primary', href: hrefFor.record(typeKey, 'new') }, `New ${t.one.toLowerCase()}`) : null })));
      return;
    }
    put(body, h('div', { class: 'card tbl-wrap' }, h('table', { class: 'tbl stk' }, h('caption', { class: 'sr' }, t.full),
      h('thead', {}, h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'Sharing'), h('th', {}, 'Updated'), h('th', {}, h('span', { class: 'sr' }, 'Actions')))),
      h('tbody', {}, ...list.map((r) => h('tr', {},
        h('td', {}, h('a', { class: 'link', href: hrefFor.record(typeKey, r.id) }, h('b', {}, nameOf(typeKey, r) || '(untitled)')), h('div', { class: 'fine' }, r.summary ?? r.promise ?? '')),
        h('td', { 'data-l': 'Sharing' }, r.archived_at ? pill('Archived') : scopeText(r)), h('td', { 'data-l': 'Updated', class: 'muted' }, when(r.updated_at)),
        h('td', {}, h('div', { class: 'acts' }, h('a', { class: 'btn', href: hrefFor.record(typeKey, r.id) }, 'Open', h('span', { class: 'sr' }, ` ${nameOf(typeKey, r)}`)),
          ctx.can(`funnels.${o}.edit`, r.client_id) ? (r.archived_at ? btn(['Restore', h('span', { class: 'sr' }, ` ${nameOf(typeKey, r)}`)], () => act(r, 'restore', 'Restored.')) : btn(['Archive', h('span', { class: 'sr' }, ` ${nameOf(typeKey, r)}`)], () => confirmArchive(r))) : null))))))));
  }
  async function load() {
    put(body, skeleton(4));
    const modes = state.show === 'all' ? [false, true] : [state.show === 'archived'];
    const res = await Promise.all(modes.map((a) => run(ctx, `funnels.${typeKey}.list`, { archived: a })));
    if (!ctx.live()) return;
    const bad = res.find((r) => !r.ok); if (bad) return put(body, errorState(load));
    rows = res.flatMap((r) => r.data); paint();
  }
  function confirmArchive(r) {
    dialog({ title: `Archive “${nameOf(typeKey, r)}”?`, body: h('p', {}, `It disappears from lists${r.client_visible ? ` and ${ctx.clients.get(r.client_id) ?? 'the client'} can no longer see it` : ''}. Nothing is deleted. You can restore it any time.`),
      actions: [{ label: 'Archive', cls: 'primary', on: () => act(r, 'archive', 'Archived. Restore it from the Archived list.') }, { label: 'Cancel', focus: true }] });
  }
  async function act(r, verb, done) {
    const res = await run(ctx, `funnels.${typeKey}.${verb}`, { id: r.id });
    if (!ctx.live()) return;
    toast(res.ok ? done : messageFor(res.error?.code), res.ok); load();
  }
  load();
  return h('section', {}, subnav(typeKey), ...pageHead(`Office · Funnels · ${t.label}`, t.full, null, canNew ? [h('a', { class: 'btn primary', href: hrefFor.record(typeKey, 'new') }, icon('plus'), `New ${t.one.toLowerCase()}`)] : null),
    !canNew ? readOnlyNotice('You can view these', 'Ask an editor to change them.') : null,
    h('div', { class: 'tools' }, h('label', { class: 'search' }, icon('search'), h('span', { class: 'sr' }, `Search ${t.label}`), q), h('label', { class: 'sr', for: 'fl' }, 'Show'), sel), body);
}

// ---- record (read view, edit form)
export function funnelRecordView(ctx, typeKey, id) {
  const t = TYPE[typeKey]; const o = t.obj; const isNew = id === 'new';
  const root = h('div', {}, skeleton(5));
  let refs = {};
  const backTo = hrefFor.list(typeKey);

  async function open() {
    const [rec, ...lists] = await Promise.all([
      isNew ? Promise.resolve({ ok: true, data: [{}] }) : run(ctx, `funnels.${typeKey}.get`, { id }),
      ...[...new Set(FIELD_DEFS[typeKey].filter((f) => f.ref).map((f) => f.ref))].map((k) => run(ctx, `funnels.${k}.list`, {}).then((r) => [k, r])),
    ]);
    if (!ctx.live()) return;
    if (!rec.ok) return put(root, rec.error?.code === 'not_found' ? notFoundState(hrefFor.funnels(), 'Back to Funnels') : errorState(open));
    if (!isNew && !rec.data[0]) return put(root, notFoundState(hrefFor.funnels(), 'Back to Funnels'));
    refs = Object.fromEntries(lists.map(([k, r]) => [k, r.ok ? r.data : []]));
    isNew ? edit({ }) : view(rec.data[0]);
  }

  function view(r, flash) {
    dirty.clear();
    const archived = Boolean(r.archived_at);
    const canEdit = ctx.can(`funnels.${o}.edit`, r.client_id) && !archived;
    const canDelete = ctx.can(`funnels.${o}.delete`, r.client_id);
    const canShare = ctx.can('funnels.record.share', r.client_id) && !archived;
    const actions = [];
    if (canEdit) actions.push(btn([icon('edit'), 'Edit'], () => edit(r), '', { id: 'edit' }));
    if (canShare) actions.push(btn([icon('share'), 'Share with client'], () => share(r), '', { id: 'share' }));
    if (!archived && ctx.can(`funnels.${o}.edit`, r.client_id)) actions.push(btn([icon('archive'), 'Archive'], () => confirmArchive(r), '', { id: 'archive' }));
    if (archived && ctx.can(`funnels.${o}.edit`, r.client_id)) actions.push(btn([icon('undo'), 'Restore'], () => act(r, 'restore', 'Restored.'), '', { id: 'restore' }));
    const sections = FIELD_DEFS[typeKey].filter((f) => f.k !== 'name' && f.k !== 'title' && f.k !== 'currency');
    const clientName = r.client_id ? (ctx.clients.get(r.client_id) ?? 'A client') : null;
    put(root, 
      ...pageHead([h('a', { class: 'link', href: backTo }, t.full), ' / ', nameOf(typeKey, r) || '(untitled)'], nameOf(typeKey, r) || '(untitled)', r.summary ?? r.promise ?? null, actions),
      flash ? notice('info', 'check', flash) : null,
      !ctx.can(`funnels.${o}.edit`, r.client_id) && !archived ? readOnlyNotice(`You can view this ${t.one.toLowerCase()} but not change it`, '') : null,
      archived ? notice('warn', 'archive', [h('b', {}, `This ${t.one.toLowerCase()} is archived.`), ` It’s hidden from lists and clients can’t see it. ${canDelete ? 'You can restore it, or delete it permanently.' : 'An owner can delete it permanently.'}`],
        canDelete ? [btn([icon('trash'), 'Delete permanently'], () => del(r), 'dng', { id: 'delete' })] : []) : null,
      typeKey === 'avatars' ? portrait(r, clientName) : null,
      h('div', { class: typeKey === 'avatars' ? 'grid3' : 'split', style: typeKey === 'avatars' ? 'margin-top:24px' : '' },
        typeKey === 'avatars' ? null : h('section', { class: 'card' }, ...sections.map((f) => h('div', { class: 'sec' }, h('h4', {}, f.label), showValue(f, r, refs) ? h('p', {}, showValue(f, r, refs)) : h('p', { class: 'muted' }, 'Not filled in yet.')))),
        h('div', { class: 'grid', style: 'align-content:start' }, h('section', { class: 'card pad' }, h('h3', {}, 'Shared with clients'),
          clientName ? (r.client_visible && !archived
            ? h('ul', { class: 'rows', style: 'margin:var(--space-2) calc(var(--space-5)*-1) 0' }, h('li', {}, h('span', {}, clientName), canShare ? btn(['Stop sharing', h('span', { class: 'sr' }, ` with ${clientName}`)], () => unshare(r, clientName)) : null))
            : h('p', { class: 'fine', style: 'margin-top:var(--space-2)' }, archived && r.client_visible ? 'Paused while archived.' : `Belongs to ${clientName}. Not shared yet.`))
            : h('p', { class: 'fine', style: 'margin-top:var(--space-2)' }, 'Not shared. This record belongs to the organization, so only your team can see it.')))));
  }

  // ---- edit / create
  function edit(r) {
    const canEdit = isNew ? ctx.canAnywhere(`funnels.${o}.create`) : ctx.can(`funnels.${o}.edit`, r.client_id);
    if (!canEdit) return view(r);
    const fl = {};
    const scope = isNew ? field({ id: 'r-client', label: 'Belongs to', options: [['', 'Organization-wide'], ...ctx.clientsWhere(`funnels.${o}.create`).map(([i, n]) => [i, n])], value: '', hint: 'Only a record that belongs to a client can be shared with that client.' }) : null;
    if (scope && !ctx.can(`funnels.${o}.create`)) scope.input.querySelector('option[value=""]')?.remove();       // client-only permission: no organization-wide choice
    const parts = FIELD_DEFS[typeKey].map((f) => {
      const v = r[f.k]; const base = { id: `r-${f.k}`, label: f.label, hint: f.hint, required: f.req };
      let x;
      if (f.options) x = field({ ...base, options: f.options, value: v ?? f.options[0][0] });
      else if (f.ref) x = field({ ...base, options: [['', '— none —'], ...(refs[f.ref] ?? []).map((a) => [a.id, nameOf(f.ref, a)])], value: v ?? '' });
      else if (f.list) x = field({ ...base, value: (v ?? []).join(', ') });
      else if (f.num) x = field({ ...base, type: 'number', value: v ?? '' });
      else x = field({ ...base, rows: f.rows, value: v ?? '', maxlength: f.rows ? 20000 : 200, autocomplete: 'off' });
      fl[f.k] = x; return x;
    });
    const status = h('span', { class: 'fine', role: 'status', id: 'ds' }, 'No changes yet');
    const saveBtn = h('button', { type: 'submit', class: 'btn primary' }, 'Save');
    const msg = h('div', { id: 'form-msg' });
    const mark = () => { status.textContent = 'Unsaved changes'; dirty.set(t.label, () => save(true)); };
    async function save(quiet) {
      Object.values(fl).forEach((x) => x.ok()); put(msg, );
      const input = {};
      for (const f of FIELD_DEFS[typeKey]) {
        const raw = fl[f.k].input.value;
        if (f.list) input[f.k] = raw.split(',').map((s) => s.trim()).filter(Boolean);
        else if (f.num) { if (raw !== '') input[f.k] = Number(raw); }
        else if (f.ref || f.k === 'currency') { if (raw !== '') input[f.k] = raw; }
        else input[f.k] = raw;
      }
      const main = FIELD_DEFS[typeKey][0];
      if (!String(input[main.k] ?? '').trim()) { fl[main.k].error('Give it a name so people can find it.'); return false; }
      if (typeKey === 'offers' && (input.price_amount === undefined) !== (input.currency === undefined)) {
        const missing = input.price_amount === undefined ? 'price_amount' : 'currency'; fl[missing].error('A price and a currency go together.'); return false;
      }
      if (isNew && scope?.input.value) input.client = scope.input.value;
      saveBtn.disabled = true; status.textContent = 'Saving…';
      const res = await run(ctx, isNew ? `funnels.${typeKey}.create` : `funnels.${typeKey}.update`, isNew ? input : { id, ...input });
      if (!ctx.live()) return false;
      saveBtn.disabled = false;
      if (res.ok) { dirty.clear(); ctx.announce(isNew ? `${t.one} created.` : 'Saved.'); if (isNew) ctx.go(hrefFor.record(typeKey, res.data[0].id)); else { toast('Saved.'); view(res.data[0]); } return true; }
      status.textContent = 'Unsaved changes';
      const code = res.error?.code ?? 'failed';
      if (code === 'invalid' && res.error?.fields) { for (const f of res.error.fields) fl[f]?.error(`Check ${fieldLabel(f).toLowerCase()}.`); }
      else put(msg, notice('err', 'cross', [h('b', {}, 'Couldn’t save.'), ` ${quiet ? 'Your changes are still here. ' : ''}${messageFor(code)}`]));
      return false;
    }
    const form = h('form', { class: 'card', novalidate: true, onsubmit: (e) => { e.preventDefault(); save(); } },
      h('div', { style: 'padding:var(--space-5) var(--space-5) 0' }, scope?.el ?? null, ...parts.map((x) => x.el), msg),
      h('div', { class: 'stickybar' }, saveBtn, btn('Cancel', () => ctx.guard(() => (isNew ? ctx.go(backTo) : view(r))), ''), status));
    form.addEventListener('input', mark); form.addEventListener('change', mark);
    put(root, ...pageHead([h('a', { class: 'link', href: backTo }, t.full), ' / ', isNew ? `New ${t.one.toLowerCase()}` : 'Edit'], isNew ? `New ${t.one.toLowerCase()}` : `Edit ${nameOf(typeKey, r) || t.one.toLowerCase()}`, 'Changes aren’t saved until you press Save.'), form);
    (Object.values(fl)[0]).input.focus();
  }

  // ---- actions
  async function act(r, verb, done) {
    const res = await run(ctx, `funnels.${typeKey}.${verb}`, { id: r.id });
    if (!ctx.live()) return;
    if (!res.ok) return toast(messageFor(res.error?.code), false);
    toast(done); view(res.data[0]);
  }
  function confirmArchive(r) {
    dialog({ title: `Archive “${nameOf(typeKey, r)}”?`, body: h('p', {}, `It disappears from lists${r.client_visible ? ` and ${ctx.clients.get(r.client_id) ?? 'the client'} can no longer see it` : ''}. Nothing is deleted. You can restore it any time.`),
      actions: [{ label: 'Archive', cls: 'primary', on: () => act(r, 'archive', 'Archived. Restore it from the Archived list.') }, { label: 'Cancel', focus: true }] });
  }
  function share(r) {
    if (!r.client_id) return dialog({ title: 'Share with a client', body: h('p', {}, 'Only a record that belongs to a client can be shared with that client. This one belongs to the organization. Create it under a client to share it.'), actions: [{ label: 'Got it', focus: true }] });
    const cn = ctx.clients.get(r.client_id) ?? 'the client';
    dialog({ title: `Share with ${cn}`, wide: true, body: [h('p', { style: 'margin-bottom:var(--space-3)' }, `${cn} sees only what you share, and only in their Client Portal. They can view it, not change it.`),
      notice('info', 'info', 'The Client Portal is locked for now. This saves the choice; nothing is visible to the client until the Portal is turned on.')],
    actions: [{ label: 'Share', cls: 'primary', on: async () => { const x = await run(ctx, `funnels.${typeKey}.share`, { id: r.id, visible: true }); if (!x.ok) return toast(messageFor(x.error?.code), false); toast(`Shared with ${cn}.`); view(x.data[0]); } }, { label: 'Cancel', focus: true }] });
  }
  function unshare(r, cn) {
    dialog({ title: `Stop sharing with ${cn}?`, body: h('p', {}, `${cn} loses access right away. Your team’s copy isn’t affected.`),
      actions: [{ label: 'Stop sharing', cls: 'dng', on: async () => { const x = await run(ctx, `funnels.${typeKey}.share`, { id: r.id, visible: false }); if (!x.ok) return toast(messageFor(x.error?.code), false); toast(`Stopped sharing with ${cn}.`, false); view(x.data[0]); } }, { label: 'Keep sharing', focus: true }] });
  }
  function del(r) {
    const nm = nameOf(typeKey, r); const cf = field({ id: 'cf', label: 'Type the name to confirm', autocomplete: 'off', hint: nm });
    dialog({ title: `Delete “${nm}” permanently?`, wide: true, body: [notice('err', 'warn', [h('b', {}, 'This can’t be undone.'), ` It’s removed for everyone${r.client_visible ? ', and removed from the client’s share' : ''}.`]), cf.el],
      actions: [{ label: 'Delete permanently', cls: 'dng', keep: true, on: async (close) => {
        cf.ok(); if (cf.input.value.trim() !== nm) { cf.error('That doesn’t match the name.'); return false; }
        const x = await run(ctx, `funnels.${typeKey}.delete`, { id: r.id }); if (!x.ok) { toast(messageFor(x.error?.code), false); return false; }
        close(); toast('Deleted permanently.', false); ctx.go(backTo);
      } }, { label: 'Cancel' }] });
  }

  open();
  return h('section', {}, subnav(typeKey), root);
}
