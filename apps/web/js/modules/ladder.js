// Value Ladder (v4): the list with mini step charts, and the ladder page (Map, Table, Compare, History). A step REFERENCES an Offers & Products record: its name and
// price are read from the offer and never edited here; a broken link (archived offer) is flagged. Versions are immutable snapshots; Compare says in words what changed.
import { setCrumbs, h, put, icon, btn, chip, dialog, drawer, toast, field, notice, skeleton, emptyState, errorState, noAccessState, tabs, readOnlyNotice } from '../ui.js';
import { STEP_TYPES, stepLabel, riseOf, brokenLink, diffLadders, totals, priceOf } from './laddermodel.js';

export const ladderHref = (view, id) => (view === 'l' ? `#/ladder/l/${id}` : '#/ladder');
const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

export function ladderView({ api, ctx, route }) {
  let keepTab = null;   // the view the person is on survives a refresh of the page data
  const root = h('section', { class: 'vl' }); const live = () => ctx.live() && root.isConnected;
  const fail = (r, what = 'do that') => toast(r?.status === 404 ? `You can’t ${what} here.` : (r?.message ?? 'Something went wrong. Try again.'), false);
  const scope = (c) => (c ? (ctx.clients?.get?.(c) ?? 'A client') : ctx.orgName);
  const mini = (n) => h('div', { class: 'vl-mini', role: 'img', 'aria-label': `${n} step${n === 1 ? '' : 's'}` }, ...Array.from({ length: Math.max(n, 1) }, (_, i) => h('i', { style: `height:${Math.round(riseOf(i, Math.max(n, 1)) * 100)}%` })));

  // ---------------------------------------------------------------- list
  async function list() {
    put(root, skeleton(3)); let show = 'active'; let q = '';
    const body = h('div', {}); const canNew = ctx.canAnywhere('valueladder.ladder.create');
    const load = async () => {
      const r = await api.call('valueladder.list', { archived: show === 'archived', ...(q ? { q } : {}) }); if (!live()) return;
      if (!r.ok) return put(body, r.status === 404 ? emptyState({ title: 'Value Ladder isn’t switched on for you', body: 'Ask an admin to turn it on for your access level.', ic: 'vl' }) : errorState(load));
      put(body, r.data.length ? h('div', { class: 'pj-cards' }, ...r.data.map((l) => h('a', { class: 'pj-card', href: ladderHref('l', l.id) }, h('div', { class: 'pj-card-top' }, h('strong', {}, l.name), chip(l.status === 'approved' ? 'Approved' : 'Draft', l.status === 'approved' ? 'ok' : '')), mini(l.rungs), h('div', { class: 'fine muted' }, `${l.rungs} step${l.rungs === 1 ? '' : 's'} · ${scope(l.client_id)}`))))
        : emptyState({ title: q ? 'No ladder matches' : show === 'archived' ? 'Nothing archived' : 'No value ladders yet', body: q ? 'Try another word.' : canNew ? 'Map how customers climb from a free lead magnet to a high-ticket offer.' : 'Ladders your team builds appear here.', ic: 'vl', first: !q && show === 'active', action: canNew && !q && show === 'active' ? btn('New ladder', create, 'pri') : null }));
    };
    function create() {
      const name = field({ id: 'nl-name', label: 'Ladder name', maxlength: 200 });
      const sc = h('select', { id: 'nl-scope', 'aria-label': 'Belongs to' }, ...(ctx.can('valueladder.ladder.create') ? [h('option', { value: '' }, ctx.orgName)] : []), ...ctx.clientsWhere('valueladder.ladder.create').map(([cid, n]) => h('option', { value: cid }, n)));
      dialog({ title: 'New value ladder', body: [name.el, h('div', { class: 'fld' }, h('label', { for: 'nl-scope' }, 'Belongs to'), sc)], actions: [{ label: 'Create', cls: 'pri', on: async () => { const n = name.input.value.trim(); if (!n) return name.error('Give the ladder a name.');
        const r = await api.call('valueladder.create', { name: n, ...(sc.value ? { client: sc.value } : {}) }); if (!r.ok) { fail(r, 'add ladders'); return false; } ctx.go(ladderHref('l', r.data[0].id)); } }, { label: 'Cancel' }] });
    }
    const search = h('input', { type: 'search', placeholder: 'Search ladders', 'aria-label': 'Search ladders', autocomplete: 'off' }); let t = null; search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { q = search.value.trim(); load(); }, 200); });
    const sh = h('select', { 'aria-label': 'Show' }, h('option', { value: 'active' }, 'Active'), h('option', { value: 'archived' }, 'Archived')); sh.addEventListener('change', () => { show = sh.value; load(); });
    put(root, h('div', { class: 'pj-head' }, h('div', {}, h('div', { class: 'crumbs fine' }, 'Value Ladder'), h('h1', { 'data-page-title': true }, 'Value Ladders'), h('p', { class: 'sub' }, 'Map how customers climb from free to premium. Each step links to a real offer.')), canNew ? btn('New ladder', create, 'pri') : null), h('div', { class: 'toolbar' }, search, sh), body);
    load();
  }

  // ---------------------------------------------------------------- ladder page
  async function page() {
    put(root, skeleton(4)); const id = route.id;
    const r = await api.call('valueladder.get', { id }); if (!live()) return;
    if (!r.ok || !r.data[0]) return put(root, r.status === 404 || r.ok ? noAccessState({ action: h('a', { class: 'btn', href: ladderHref() }, 'Back to Value Ladders') }) : errorState(page));
    const L = r.data[0]; const steps = L.rung_list ?? []; const archived = Boolean(L.archived_at); const edit = !archived && ctx.can('valueladder.ladder.edit', L.client_id);
    let tab = ['map', 'table', 'compare', 'history'].includes(keepTab ?? route.query?.tab) ? (keepTab ?? route.query.tab) : 'map';
    const body = h('div', {}); const bar = tabs([['map', 'Map'], ['table', 'Table'], ['compare', 'Compare'], ['history', 'History']], tab, (k) => { tab = k; keepTab = k; history.replaceState(null, '', `${ladderHref('l', id)}${k === 'map' ? '' : `?tab=${k}`}`); draw(); }, 'Ladder views');
    const [off, team] = await Promise.all([api.call('funnels.offers.list', {}), api.call('team.list', {})]); const offers = (off.ok ? off.data : []).filter((o) => !o.client_id || o.client_id === L.client_id); const people = team.ok ? team.data : [];
    const ownerName = (uid) => people.find((p) => p.user_id === uid)?.display_name ?? 'Someone';
    setCrumbs(root, [['Value Ladders', ladderHref()], [scope(L.client_id)], [L.name]]);
    put(root, h('div', { class: 'pj-head' }, h('div', {}, h('div', { class: 'crumbs fine' }, h('a', { href: ladderHref() }, 'Value Ladders'), ' / ', scope(L.client_id)), h('h1', { 'data-page-title': true }, L.name), h('div', { class: 'pj-meta' }, chip(L.status === 'approved' ? 'Approved' : 'Draft', L.status === 'approved' ? 'ok' : ''), archived ? chip('Archived', 'warn') : null, ...totals(steps).map((t) => h('span', { class: 'fine muted' }, `Adds up to ${t.total.toLocaleString()} ${t.currency}`)))),
      h('div', { class: 'pj-actions' }, edit ? btn('Save version', saveVersion, 'pri') : null, edit ? btn(L.status === 'approved' ? 'Back to draft' : 'Approve', async () => { const x = await api.call('valueladder.update', { id, status: L.status === 'approved' ? 'draft' : 'approved' }); if (!x.ok) return fail(x, 'change this ladder'); if (L.status !== 'approved') await api.call('valueladder.versions.save', { ladder: id, note: 'Approved' }); toast(L.status === 'approved' ? 'Back to draft.' : 'Approved, and saved as a version.'); page(); }, '') : null,
        ctx.canAnywhere('valueladder.ladder.create') ? btn('Duplicate', duplicate, '') : null, edit ? btn('Archive', () => dialog({ title: `Archive “${L.name}”?`, body: h('p', {}, 'The ladder leaves the list. Nothing is deleted.'), actions: [{ label: 'Archive', cls: 'pri', on: async () => { const x = await api.call('valueladder.archive', { id }); if (!x.ok) { fail(x, 'archive this ladder'); return false; } ctx.go(ladderHref()); } }, { label: 'Cancel', focus: true }] }), '') : null,
        archived && ctx.can('valueladder.ladder.edit', L.client_id) ? btn('Restore', async () => { const x = await api.call('valueladder.restore', { id }); if (x.ok) page(); else fail(x, 'restore this ladder'); }, 'pri') : null)), bar, body);
    function saveVersion() { const note = field({ id: 'sv-note', label: 'Note (optional)', maxlength: 300 }); dialog({ title: 'Save a version', body: [note.el, h('p', { class: 'fine muted' }, 'A snapshot of the steps as they are now, with each offer’s name and price. You can compare versions later.')], actions: [{ label: 'Save version', cls: 'pri', on: async () => { const x = await api.call('valueladder.versions.save', { ladder: id, ...(note.input.value.trim() ? { note: note.input.value.trim() } : {}) }); if (!x.ok) { fail(x, 'save versions'); return false; } toast(`Saved as version ${x.data[0].version}.`); if (tab === 'history' || tab === 'compare') draw(); } }, { label: 'Cancel' }] }); }
    function duplicate() {
      const name = field({ id: 'dp-name', label: 'Name of the copy', value: `${L.name} (copy)`, maxlength: 200 }); const sc = h('select', { id: 'dp-scope', 'aria-label': 'For' }, h('option', { value: '' }, `${ctx.orgName} (library)`), ...ctx.clientsWhere('valueladder.ladder.create').map(([cid, n]) => h('option', { value: cid }, `For ${n}`)));
      dialog({ title: 'Duplicate this ladder', body: [name.el, h('div', { class: 'fld' }, h('label', { for: 'dp-scope' }, 'Copy for'), sc), h('p', { class: 'fine muted' }, 'A client copy is the client’s own: changes to the library ladder do not reach it.')], actions: [{ label: 'Duplicate', cls: 'pri', on: async () => { const n = name.input.value.trim(); if (!n) return name.error('Give the copy a name.'); const x = await api.call('valueladder.duplicate', { id, name: n, ...(sc.value ? { client: sc.value } : {}) }); if (!x.ok || !x.data[0]) { fail(x, 'duplicate ladders'); return false; } toast('Duplicated as a draft.'); ctx.go(ladderHref('l', x.data[0].id)); } }, { label: 'Cancel' }] });
    }
    function draw() {
      bar.querySelectorAll('[role=tab]').forEach((b) => { b.setAttribute('aria-selected', String(b.dataset.k === tab)); b.tabIndex = b.dataset.k === tab ? 0 : -1; });
      const ro = archived ? readOnlyNotice('This ladder is archived') : !edit ? readOnlyNotice('You can look at this ladder but not change it') : null;
      ({ map, table, compare, history: hist })[tab](ro);
    }
    const stepBtn = (s, i) => h('button', { type: 'button', class: `vl-step${brokenLink(s) ? ' broken' : ''}`, style: `--rise:${Math.round(riseOf(i, steps.length) * 100)}%`, onclick: () => stepDrawer(s), 'aria-label': `Step ${i + 1}: ${s.name}, ${stepLabel(s.stage)}${brokenLink(s) ? ', the linked offer is archived' : ''}` },
      h('span', { class: 'vl-kind' }, stepLabel(s.stage)), h('b', {}, s.name), h('span', { class: 'vl-price' }, priceOf(s)), s.offer_id ? h('span', { class: 'fine' }, `Offer: ${s.offer_name ?? ''}`) : h('span', { class: 'fine muted' }, 'No offer linked'), brokenLink(s) ? h('span', { class: 'err' }, 'Linked offer is archived') : null, s.conversion_pct != null ? h('span', { class: 'fine' }, `${s.conversion_pct}% convert`) : null);
    function map(ro) {
      put(body, ro, steps.length ? h('div', {}, h('div', { class: 'vl-map', role: 'list', 'aria-label': 'Steps from free to premium' }, ...steps.map((s, i) => h('div', { role: 'listitem' }, stepBtn(s, i)))), h('p', { class: 'fine muted' }, 'More value, higher price →')) : emptyState({ title: 'No steps yet', body: edit ? 'Add the first step, usually a free lead magnet.' : 'This ladder has no steps.', ic: 'vl', first: true }), edit ? btn('Add a step', addStep, 'pri') : null);
    }
    function table(ro) {
      const mv = async (i, d) => { const order = steps.map((s) => s.id); const j = i + d; if (j < 0 || j >= order.length) return; [order[i], order[j]] = [order[j], order[i]]; const x = await api.call('valueladder.rungs.reorder', { ladder: id, order }); if (x.ok) page(); else fail(x, 'reorder steps'); };
      put(body, ro, steps.length ? h('div', { class: 'card tbl-wrap' }, h('table', { class: 'tbl' }, h('caption', { class: 'sr' }, 'Steps'), h('thead', {}, h('tr', {}, ...['#', 'Step type', 'Name', 'Offer', 'Price', 'Converts', 'Audience', 'Owner'].map((t2) => h('th', { scope: 'col' }, t2)), h('th', { scope: 'col' }, h('span', { class: 'sr' }, 'Actions')))),
        h('tbody', {}, ...steps.map((s, i) => h('tr', {}, h('td', {}, String(i + 1)), h('td', {}, stepLabel(s.stage)), h('td', {}, h('button', { type: 'button', class: 'linklike', onclick: () => stepDrawer(s) }, s.name), brokenLink(s) ? chip('Offer archived', 'warn') : null), h('td', {}, s.offer_name ?? '—'), h('td', {}, priceOf(s)), h('td', {}, s.conversion_pct != null ? `${s.conversion_pct}%` : '—'), h('td', {}, s.audience ?? '—'), h('td', {}, s.owner_id ? ownerName(s.owner_id) : '—'),
          h('td', {}, edit ? [btn(['Move earlier', h('span', { class: 'sr' }, ` ${s.name}`)], () => mv(i, -1), 'link', { disabled: i === 0 }), btn(['Move later', h('span', { class: 'sr' }, ` ${s.name}`)], () => mv(i, 1), 'link', { disabled: i === steps.length - 1 })] : null)))))) : emptyState({ title: 'No steps yet', body: 'Add a step to start the ladder.', ic: 'vl' }), edit ? btn('Add a step', addStep, 'pri') : null);
    }
    function addStep() {
      const kind = h('select', { id: 'as-kind', 'aria-label': 'Step type' }, ...STEP_TYPES.map(([k, l]) => h('option', { value: k }, l))); const name = field({ id: 'as-name', label: 'Step name', maxlength: 200 });
      const of = h('select', { id: 'as-offer', 'aria-label': 'Linked offer' }, h('option', { value: '' }, 'No offer yet'), ...offers.map((o) => h('option', { value: o.id }, `${o.name}${o.price_amount != null ? ` · ${o.price_amount} ${o.currency}` : ''}`)));
      dialog({ title: 'Add a step', body: [h('div', { class: 'fld' }, h('label', { for: 'as-kind' }, 'Step type'), kind), name.el, h('div', { class: 'fld' }, h('label', { for: 'as-offer' }, 'Linked offer'), of, h('p', { class: 'fine muted' }, 'The step reads its name and price from the offer. The offer itself is never changed here.'))], actions: [{ label: 'Add step', cls: 'pri', on: async () => { const n = name.input.value.trim(); if (!n) return name.error('Name the step.'); if (steps.length >= 12) { toast('A ladder has at most 12 steps.', false); return false; }
        const x = await api.call('valueladder.rungs.add', { ladder: id, stage: kind.value, name: n, ...(of.value ? { offer: of.value } : {}) }); if (!x.ok) { fail(x, 'add steps'); return false; } toast('Step added.'); page(); } }, { label: 'Cancel' }] });
    }
    function stepDrawer(s) {
      const ro = !edit; const dis = ro ? { disabled: true } : {};
      const kind = h('select', { id: 'sd-kind', 'aria-label': 'Step type', ...dis }, ...STEP_TYPES.map(([k, l]) => h('option', { value: k, ...(k === s.stage ? { selected: true } : {}) }, l)));
      const name = field({ id: 'sd-name', label: 'Step name', value: s.name, maxlength: 200, ...(ro ? { readonly: true } : {}) });
      const of = h('select', { id: 'sd-offer', 'aria-label': 'Linked offer', ...dis }, h('option', { value: '' }, 'No offer'), ...offers.map((o) => h('option', { value: o.id, ...(o.id === s.offer_id ? { selected: true } : {}) }, o.name)), ...(s.offer_id && !offers.some((o) => o.id === s.offer_id) ? [h('option', { value: s.offer_id, selected: true }, s.offer_name ?? 'Linked offer')] : []));
      const aud = field({ id: 'sd-aud', label: 'Audience', value: s.audience ?? '', maxlength: 500, ...(ro ? { readonly: true } : {}) }); const conv = field({ id: 'sd-conv', label: 'Converts (%)', type: 'number', value: s.conversion_pct ?? '', ...(ro ? { readonly: true } : {}) }); const nts = field({ id: 'sd-notes', label: 'Assumptions and notes', rows: 3, value: s.assumption_notes ?? '', maxlength: 2000, ...(ro ? { readonly: true } : {}) });
      const own = h('select', { id: 'sd-owner', 'aria-label': 'Owner', ...dis }, h('option', { value: '' }, 'No owner'), ...people.map((p) => h('option', { value: p.user_id, ...(p.user_id === s.owner_id ? { selected: true } : {}) }, p.display_name)));
      const price = field({ id: 'sd-price', label: 'Price (when no offer is linked)', type: 'number', value: s.offer_id ? '' : (s.price_amount ?? ''), ...(ro || s.offer_id ? { readonly: true } : {}) }); const cur = field({ id: 'sd-cur', label: 'Currency', value: s.offer_id ? '' : (s.currency ?? ''), maxlength: 3, hint: 'Three capital letters, for example USD', ...(ro || s.offer_id ? { readonly: true } : {}) });
      drawer({ title: s.name, label: `Step ${s.name}`, body: [brokenLink(s) ? notice('warn', 'warn', [h('b', {}, 'The linked offer is archived.'), ' Restore it in Office › Funnels › Offers & Products, or link another offer.']) : null, h('div', { class: 'fld' }, h('label', { for: 'sd-kind' }, 'Step type'), kind), name.el,
        h('div', { class: 'fld' }, h('label', { for: 'sd-offer' }, 'Linked offer'), of, s.offer_id ? h('p', { class: 'fine' }, s.offer_name, ' · ', priceOf(s), ' ', h('a', { href: `#/office/funnels/offers/${s.offer_id}` }, 'Open the offer')) : null, h('p', { class: 'fine muted' }, 'Reference only. The step reads the offer’s name and price and never changes it.')), price.el, cur.el, aud.el, conv.el, nts.el, h('div', { class: 'fld' }, h('label', { for: 'sd-owner' }, 'Owner'), own)],
        actions: edit ? [{ label: 'Save step', cls: 'pri', on: async () => { const n = name.input.value.trim(); if (!n) return name.error('Name the step.'); const cv = conv.input.value;
          const input = { id: s.id, stage: kind.value, name: n, audience: aud.input.value.trim(), assumption_notes: nts.input.value.trim(), ...(cv === '' ? { clear_conversion: true } : { conversion_pct: Number(cv) }), ...(own.value ? { owner: own.value } : { clear_owner: true }) };
          if (of.value) input.offer = of.value; else if (s.offer_id) input.clear_offer = true;
          if (!of.value && price.input.value !== '') { if (!/^[A-Z]{3}$/.test(cur.input.value.trim())) return cur.error('Use three capital letters, for example USD.'); input.price_amount = Number(price.input.value); input.currency = cur.input.value.trim(); }
          const x = await api.call('valueladder.rungs.update', input); if (!x.ok) { fail(x, 'change this step'); return false; } toast('Saved.'); page(); } },
          { label: 'Remove step', on: () => dialog({ title: `Remove “${s.name}”?`, body: h('p', {}, 'The step leaves the ladder. Earlier saved versions still show it.'), actions: [{ label: 'Remove', cls: 'pri', on: async () => { const x = await api.call('valueladder.rungs.archive', { id: s.id }); if (!x.ok) { fail(x, 'remove steps'); return false; } toast('Removed.'); page(); } }, { label: 'Cancel', focus: true }] }) }, { label: 'Close' }] : [{ label: 'Close', cls: 'pri' }] });
    }
    async function compare(ro) {
      put(body, skeleton(2)); const vs = await api.call('valueladder.versions.list', { ladder: id }); if (!live() || tab !== 'compare') return;
      const list2 = vs.ok ? vs.data : [];
      if (!list2.length) return put(body, ro, emptyState({ title: 'Nothing to compare yet', body: edit ? 'Save a version to start the history, then compare it with the ladder now or with another version.' : 'No versions have been saved.', ic: 'clock', action: edit ? btn('Save version', saveVersion, 'pri') : null }));
      const opts = [['current', 'The ladder now'], ...list2.map((v) => [String(v.version), `Version ${v.version}${v.note ? ` · ${v.note}` : ''}`])];
      const a = h('select', { id: 'cmp-a', 'aria-label': 'Earlier' }, ...opts.map(([k, l]) => h('option', { value: k, ...(k === String(list2[0].version) ? { selected: true } : {}) }, l))); const b = h('select', { id: 'cmp-b', 'aria-label': 'Later' }, ...opts.map(([k, l]) => h('option', { value: k, ...(k === 'current' ? { selected: true } : {}) }, l)));
      const out = h('div', { 'aria-live': 'polite' });
      const getSteps = async (k) => { if (k === 'current') return steps; const g = await api.call('valueladder.versions.get', { ladder: id, version: Number(k) }); return g.ok ? g.data[0].rungs : []; };
      const run = async () => { const [x, y] = await Promise.all([getSteps(a.value), getSteps(b.value)]); const d = diffLadders(x, y); put(out, d.length ? h('ul', { class: 'pj-rows' }, ...d.map((c) => h('li', { class: `pj-row vl-diff ${c.kind}` }, chip(c.kind === 'added' ? 'Added' : c.kind === 'removed' ? 'Removed' : 'Changed', c.kind === 'added' ? 'ok' : c.kind === 'removed' ? 'warn' : 'act'), h('span', { class: 'pj-title' }, c.text)))) : emptyState({ title: 'No differences', body: 'These two are the same.', ic: 'check' })); };
      a.addEventListener('change', run); b.addEventListener('change', run);
      put(body, ro, h('div', { class: 'fb-two' }, h('div', { class: 'fld' }, h('label', { for: 'cmp-a' }, 'Earlier'), a), h('div', { class: 'fld' }, h('label', { for: 'cmp-b' }, 'Later'), b)), out); run();
    }
    async function hist(ro) {
      put(body, skeleton(2)); const vs = await api.call('valueladder.versions.list', { ladder: id }); if (!live() || tab !== 'history') return;
      put(body, ro, vs.ok && vs.data.length ? h('ul', { class: 'rows card' }, ...vs.data.map((v) => h('li', { class: 'pj-row' }, h('b', {}, `Version ${v.version}`), chip(v.status === 'approved' ? 'Approved' : 'Draft', v.status === 'approved' ? 'ok' : ''), h('span', { class: 'fine muted' }, `${when(v.created_at)} · ${v.rungs} step${v.rungs === 1 ? '' : 's'}${v.note ? ` · ${v.note}` : ''}`)))) : emptyState({ title: 'No versions yet', body: edit ? 'Save a version to keep a snapshot you can compare later.' : 'No versions have been saved.', ic: 'clock', action: edit ? btn('Save version', saveVersion, 'pri') : null }));
    }
    draw();
  }
  (route.view === 'l' ? page : list)();
  return root;
}
