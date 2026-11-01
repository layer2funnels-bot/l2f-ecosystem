// Office > Funnels > Funnel Strategies (v4 final): one written strategy per funnel. List with search and status filter; the page is the Docs editor
// with a side panel for status, the funnel map link (a link only, never copied), linked library records (by reference) and internal notes.
import { h, put, icon, btn, chip, dialog, toast, field, notice, skeleton, emptyState, errorState, notFoundState, readOnlyNotice } from '../ui.js';
import { docView } from '../modules/docs.js';
import { emptyDoc, serialize } from '../modules/docmodel.js';

const DOC_MIME = 'application/vnd.l2f.doc+json';
const STATUS = [['draft', 'Draft'], ['in_review', 'In review'], ['approved', 'Approved']];
const statusChip = (s) => chip((STATUS.find(([k]) => k === s) ?? [s, s])[1], s === 'approved' ? 'ok' : s === 'in_review' ? 'warn' : '');
const when = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
export const strategyHref = (id) => `#/office/funnels/strategy/${id}`;
export const strategiesHref = () => '#/office/funnels/strategies';
const KINDS = [['avatar', 'avatars', 'Customer avatar', 'name'], ['offer', 'offers', 'Offer or product', 'name'], ['story', 'stories', 'Story', 'title'], ['brand_kit', 'brand_kits', 'Brand kit', 'name']];

export function strategiesListView(ctx) {
  const { api } = ctx; const root = h('section', {}); const body = h('div', {}, skeleton(3));
  const canNew = ctx.canAnywhere('funnels.strategy.create');
  let q = ''; let status = ''; let show = 'active'; let t = null;
  async function load() {
    const r = await api.call('funnels.strategies.list', { library: true, archived: show === 'archived', ...(status ? { status } : {}), ...(q ? { q } : {}) }); if (!ctx.live()) return;
    if (!r.ok) return put(body, errorState(load));
    put(body, r.data.length ? h('div', { class: 'card tbl-wrap' }, h('table', { class: 'tbl' }, h('caption', { class: 'sr' }, 'Funnel strategies'),
      h('thead', {}, h('tr', {}, ...['Strategy', 'Status', 'Map', 'Updated'].map((x) => h('th', { scope: 'col' }, x)))),
      h('tbody', {}, ...r.data.map((s) => h('tr', {}, h('td', {}, icon('doc'), ' ', h('a', { href: strategyHref(s.id) }, s.name)), h('td', {}, statusChip(s.status)), h('td', {}, s.map_url ? chip('Linked', 'act', 'map') : chip('No map yet')), h('td', {}, when(s.doc_updated_at ?? s.updated_at)))))))
      : emptyState({ title: q || status ? 'No strategy matches' : show === 'archived' ? 'Nothing archived' : 'No funnel strategies yet', body: q || status ? 'Try another word or status.' : canNew ? 'Write one strategy per funnel: who it is for, the offer, the journey and what success looks like.' : 'Strategies your team writes appear here.', ic: 'doc', first: !q && !status && show === 'active', action: canNew && show === 'active' && !q && !status ? btn('New Funnel Strategy', create, 'primary') : null }));
  }
  function create() {
    const name = field({ id: 'ns-name', label: 'Funnel name', maxlength: 200, hint: 'For example: Webinar funnel' });
    dialog({ title: 'New Funnel Strategy', body: [name.el, h('p', { class: 'fine muted' }, 'One strategy per funnel. The map stays in Funnel Mapper Pro; you can link it from the strategy.')], actions: [{ label: 'Create', cls: 'primary', on: async () => {
      const nm = name.input.value.trim(); if (!nm || /[\/\\]/.test(nm)) return name.error('Give it a name without slashes.');
      const d = await api.call('drive.files.create', { app: 'funnels', space: 'shared', name: nm, kind: 'document', mime_type: DOC_MIME, body: serialize({ v: 1, blocks: [{ t: 'h1', c: [{ x: nm }] }, { t: 'h2', c: [{ x: 'Funnel overview' }] }, { t: 'p', c: [] }, { t: 'h2', c: [{ x: 'Target audience' }] }, { t: 'p', c: [] }, { t: 'h2', c: [{ x: 'Offer and value' }] }, { t: 'p', c: [] }, { t: 'h2', c: [{ x: 'Customer journey' }] }, { t: 'p', c: [] }, { t: 'h2', c: [{ x: 'Messaging direction' }] }, { t: 'p', c: [] }, { t: 'h2', c: [{ x: 'Success criteria' }] }, { t: 'p', c: [] }] }) });
      if (!d.ok) { toast('Couldn’t create the document here. Strategies need Drive access to write.', false); return false; }
      const s = await api.call('funnels.strategies.create', { name: nm, file: d.data[0].id });
      if (!s.ok) { toast('Couldn’t create the strategy.', false); return false; } ctx.go(strategyHref(s.data[0].id)); } }, { label: 'Cancel' }] });
  }
  const search = h('input', { type: 'search', placeholder: 'Search strategies', 'aria-label': 'Search strategies', autocomplete: 'off' });
  search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { q = search.value.trim(); load(); }, 200); });
  const st = h('select', { 'aria-label': 'Status' }, h('option', { value: '' }, 'All statuses'), ...STATUS.map(([k, l]) => h('option', { value: k }, l))); st.addEventListener('change', () => { status = st.value; load(); });
  const sh = h('select', { 'aria-label': 'Show' }, h('option', { value: 'active' }, 'Active'), h('option', { value: 'archived' }, 'Archived')); sh.addEventListener('change', () => { show = sh.value; load(); });
  put(root, h('div', { class: 'crumb' }, 'Office · Funnels'), h('div', { class: 'pj-head' }, h('div', {}, h('h1', { 'data-page-title': true }, 'Funnel Strategies'), h('p', { class: 'sub' }, 'One written strategy per funnel. Maps stay in Funnel Mapper Pro.')), canNew ? btn('New Funnel Strategy', create, 'primary') : null),
    h('div', { class: 'toolbar' }, search, st, sh), body);
  load(); return root;
}

export function strategyView(ctx, id) {
  const { api } = ctx; const root = h('section', {}, skeleton(4));
  (async () => {
    const r = await api.call('funnels.strategies.get', { id }); if (!ctx.live()) return;
    if (!r.ok || !r.data[0]) return put(root, r.ok || r.status === 404 ? notFoundState(strategiesHref(), 'Back to Funnel Strategies') : errorState(() => ctx.rerender()));
    let s = r.data[0]; const archived = Boolean(s.archived_at); const canEdit = ctx.can('funnels.strategy.edit', s.client_id) && !archived;
    const save = async (patch, ok = 'Saved.') => { const x = await api.call('funnels.strategies.update', { id, ...patch }); if (x.ok && x.data[0]) { s = x.data[0]; toast(ok); return true; } toast(x.status === 404 ? 'You can’t change this strategy.' : 'Couldn’t save that. Check the value and try again.', false); return false; };
    const side = () => {
      const st = h('select', { id: 'st-status', 'aria-label': 'Status', ...(canEdit ? {} : { disabled: true }) }, ...STATUS.map(([k, l]) => h('option', { value: k, ...(k === s.status ? { selected: true } : {}) }, l)));
      st.addEventListener('change', () => save({ status: st.value }, `Marked ${STATUS.find(([k]) => k === st.value)[1].toLowerCase()}.`));
      const map = h('div', {}); const paintMap = () => put(map, s.map_url ? [h('p', {}, h('a', { href: s.map_url, target: '_blank', rel: 'noopener noreferrer' }, s.map_label || 'Open the funnel map'), ' ', h('span', { class: 'fine muted' }, 'in Funnel Mapper Pro')), h('p', { class: 'fine muted' }, 'A link only. The map isn’t copied or synced.'), canEdit ? btn('Remove link', async () => { if (await save({ clear_map: true }, 'Link removed.')) paintMap(); }, 'link') : null]
        : [h('p', { class: 'muted' }, 'No map linked yet.'), canEdit ? btn('Link a map', linkMap, '') : null]);
      function linkMap() {
        const url = field({ id: 'mp-url', label: 'Map address', hint: 'Starts with https://' }); const label = field({ id: 'mp-label', label: 'Name (optional)', maxlength: 200 });
        dialog({ title: 'Link a funnel map', body: [url.el, label.el], actions: [{ label: 'Save link', cls: 'primary', on: async () => { const u = url.input.value.trim(); if (!/^https:\/\/\S+$/.test(u)) return url.error('Use a web address that starts with https://'); const ok = await save({ map_url: u, ...(label.input.value.trim() ? { map_label: label.input.value.trim() } : {}) }, 'Map linked.'); if (!ok) return false; paintMap(); } }, { label: 'Cancel' }] });
      }
      paintMap();
      const links = h('div', {}); const loadLinks = async () => {
        const [l, ...libs] = await Promise.all([api.call('funnels.references.list', { referrer_app: 'funnels', referrer_id: id }), ...KINDS.map(([, plural]) => api.call(`funnels.${plural}.list`, {}))]);
        const byId = new Map(); libs.forEach((x, i) => (x.ok ? x.data : []).forEach((rec) => byId.set(rec.id, { rec, kind: KINDS[i] })));
        const rows = (l.ok ? l.data : []).map((ref) => ({ ref, hit: byId.get(ref.avatar_id ?? ref.offer_id ?? ref.story_id ?? ref.brand_kit_id) }));
        put(links, rows.length ? h('ul', { class: 'pj-rows' }, ...rows.map(({ ref, hit }) => h('li', { class: 'pj-row' }, hit ? h('a', { class: 'pj-title', href: `#/office/funnels/${hit.kind[1]}/${hit.rec.id}` }, hit.rec[hit.kind[3]]) : h('span', { class: 'pj-title muted' }, 'A record you can’t see'), h('span', { class: 'fine muted' }, hit ? hit.kind[2] : ''),
          canEdit ? btn(['Unlink', h('span', { class: 'sr' }, ` ${hit ? hit.rec[hit.kind[3]] : ''}`)], async () => { await api.call('funnels.references.unlink', { id: ref.id }); loadLinks(); }, 'link') : null))) : h('p', { class: 'muted' }, 'Nothing linked yet.'),
        canEdit ? btn('Link a record', () => linkRecord(byId, new Set(rows.map((x) => x.ref.avatar_id ?? x.ref.offer_id ?? x.ref.story_id ?? x.ref.brand_kit_id))), '') : null);
      };
      function linkRecord(byId, done) {
        const kind = h('select', { id: 'lr-kind', 'aria-label': 'Kind' }, ...KINDS.map(([t, , l]) => h('option', { value: t }, l))); const pick = h('select', { id: 'lr-rec', 'aria-label': 'Record' });
        const fill = () => { const opts = [...byId.values()].filter((x) => x.kind[0] === kind.value && !x.rec.client_id && !done.has(x.rec.id)); put(pick, ...(opts.length ? opts.map((x) => h('option', { value: x.rec.id }, x.rec[x.kind[3]])) : [h('option', { value: '' }, 'Nothing left to link')])); };
        kind.addEventListener('change', fill); fill();
        dialog({ title: 'Link a record', body: [h('div', { class: 'fld' }, h('label', { for: 'lr-kind' }, 'Kind'), kind), h('div', { class: 'fld' }, h('label', { for: 'lr-rec' }, 'From the library'), pick), h('p', { class: 'fine muted' }, 'Linking is by reference. The record is not copied.')],
          actions: [{ label: 'Link', cls: 'primary', on: async () => { if (!pick.value) return false; const x = await api.call('funnels.references.link', { referrer_app: 'funnels', referrer_type: 'strategy', referrer_id: id, target_type: kind.value, target_id: pick.value }); if (!x.ok) { toast('Couldn’t link that.', false); return false; } loadLinks(); } }, { label: 'Cancel' }] });
      }
      loadLinks();
      const notes = h('textarea', { rows: 4, maxlength: '8000', 'aria-label': 'Internal notes', ...(canEdit ? {} : { readonly: true }) }); notes.value = s.notes ?? ''; notes.addEventListener('change', () => save({ notes: notes.value }));
      return h('aside', { class: 'strat-side', 'aria-label': 'Strategy details' },
        h('section', {}, h('h3', {}, 'Status'), st, h('p', { class: 'fine muted' }, 'Draft, In review, Approved.')),
        h('section', {}, h('h3', {}, icon('map'), ' Funnel map'), map), h('section', {}, h('h3', {}, 'Linked assets'), links),
        h('section', {}, h('h3', {}, icon('lock'), ' Internal notes · never shared'), notes),
        canEdit ? h('section', {}, btn('Archive strategy', () => dialog({ title: `Archive “${s.name}”?`, body: h('p', {}, 'It leaves the list. Nothing is deleted and you can restore it from Archived.'), actions: [{ label: 'Archive', cls: 'primary', on: async () => { const x = await api.call('funnels.strategies.archive', { id }); if (!x.ok) { toast('Couldn’t archive it.', false); return false; } ctx.go(strategiesHref()); } }, { label: 'Cancel', focus: true }] }), '')) : null,
        archived && ctx.can('funnels.strategy.edit', s.client_id) ? h('section', {}, notice('info', 'archive', 'This strategy is archived.'), btn('Restore', async () => { const x = await api.call('funnels.strategies.restore', { id }); if (x.ok) { toast('Restored.'); ctx.rerender(); } }, 'primary')) : null);
    };
    put(root, docView({ api, id: s.file_id, ctx, opts: {
      crumbs: () => [h('a', { href: '#/office/funnels' }, 'Funnels'), h('a', { href: strategiesHref() }, 'Funnel Strategies'), s.name],
      side } }));
  })();
  return root;
}
