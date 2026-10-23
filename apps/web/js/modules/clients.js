// Clients (v4): client list (table, grid, pipeline), the client page (Overview, Work, Requests & Approvals, Documents, Team Notes) and the
// client-specific Strategy copies. Everything goes through the permission-checked API; buttons follow `ctx.can(permission, clientId)`, the database decides.
import { h, put, icon, btn, chip, dialog, toast, field, notice, skeleton, emptyState, errorState, noAccessState, seg, tabs, readOnlyNotice, avatar } from '../ui.js';
import { createBoard, BOARD_MIME } from './whiteboard.js';
import { builderView } from './formbuilder.js';
import { emptyDoc, serialize } from './docmodel.js';

const DOC_MIME = 'application/vnd.l2f.doc+json';
export const hrefs = { list: (q = '') => `#/clients${q}`, client: (id, tab) => `#/clients/c/${id}${tab && tab !== 'overview' ? `?tab=${tab}` : ''}` };
const STATUS = [['lead', 'Lead'], ['proposal', 'Proposal'], ['active', 'Active'], ['paused', 'Paused'], ['past', 'Past']];
const KINDS = [['avatars', 'Customer avatar', 'name'], ['offers', 'Offer or product', 'name'], ['stories', 'Story', 'title'], ['brand_kits', 'Brand kit', 'name'], ['strategies', 'Funnel Strategy', 'name'], ['ladders', 'Value Ladder', 'name']];
const statusLabel = (s) => (STATUS.find(([k]) => k === s) ?? [s, s ?? 'No status'])[1];
const when = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const statusChip = (s) => chip(statusLabel(s), s === 'active' ? 'ok' : s === 'paused' ? 'warn' : '');

export function clientsView({ api, ctx, route }) {
  const root = h('section', { class: 'cl' }); const main = h('div', { class: 'cl-main' });
  const live = () => ctx.live() && root.isConnected;
  const fail = (r, what = 'do that') => toast(r?.status === 404 ? `You can’t ${what} here.` : (r?.message ?? 'Something went wrong. Try again.'), false);
  let stages = [];
  const head = (title, sub, ...actions) => h('div', { class: 'pj-head' }, h('div', {}, h('div', { class: 'crumbs fine' }, 'Clients'), h('h1', { 'data-page-title': true }, title), sub ? h('p', { class: 'sub' }, sub) : null), actions.filter(Boolean).length ? h('div', { class: 'pj-actions' }, ...actions) : null);
  const stageLabel = (k) => stages.find((s) => s.key === k)?.label ?? (k ? k : 'No stage');
  const loadStages = async () => { const r = await api.call('clients.stages.list', {}); if (r.ok) stages = r.data; };

  // ---------------------------------------------------------------- list
  async function list() {
    put(main, head('Clients', null), skeleton(4));
    const [r] = await Promise.all([api.call('clients.list', { archived: route.query.show === 'archived' }), loadStages()]); if (!live()) return;
    if (!r.ok) return put(main, head('Clients', null), errorState(list));
    const canCreate = ctx.canAnywhere('clients.client.create');
    let view = ['table', 'grid', 'pipeline'].includes(route.query.view) ? route.query.view : 'table'; let q = ''; let status = ''; let show = route.query.show === 'archived' ? 'archived' : 'active';
    const body = h('div', {});
    const search = h('input', { type: 'search', placeholder: 'Search clients', 'aria-label': 'Search clients', autocomplete: 'off' });
    const draw = () => {
      const rows = r.data.filter((c) => (!q || `${c.name} ${c.business_name ?? ''}`.toLowerCase().includes(q)) && (!status || c.status === status));
      if (!r.data.length) return put(body, emptyState({ title: show === 'archived' ? 'No archived clients' : 'No clients yet', body: canCreate ? 'Add the first client to start planning their work.' : 'Clients you can open appear here.', ic: 'cli', first: show !== 'archived', action: canCreate && show !== 'archived' ? btn('New client', newClient, 'pri') : null }));
      if (!rows.length) return put(body, emptyState({ title: 'No client matches', body: 'Try another word or filter.', ic: 'search' }));
      if (view === 'grid') return put(body, h('div', { class: 'pj-cards' }, ...rows.map((c) => h('a', { class: 'pj-card', href: hrefs.client(c.id) }, h('div', { class: 'pj-card-top' }, h('strong', {}, c.name), statusChip(c.status)), h('div', { class: 'fine muted' }, c.business_name ?? c.niche ?? ''), h('div', { class: 'pj-card-sub' }, chip(stageLabel(c.stage_key)))))));
      if (view === 'pipeline') return put(body, h('div', { class: 'pj-board' }, ...[...stages.map((s) => [s.key, s.label]), ['', 'No stage']].map(([k, label]) => h('div', { class: 'pj-col', role: 'group', 'aria-label': label }, h('h2', { class: 'pj-gh' }, label, h('span', { class: 'fine muted' }, ` ${rows.filter((c) => (c.stage_key ?? '') === k).length}`)),
        ...rows.filter((c) => (c.stage_key ?? '') === k).map((c) => h('a', { class: 'pj-cardtask', href: hrefs.client(c.id) }, h('strong', {}, c.name), h('span', { class: 'fine muted' }, statusLabel(c.status))))))));
      put(body, h('div', { class: 'card tbl-wrap' }, h('table', { class: 'tbl' }, h('caption', { class: 'sr' }, 'Clients'), h('thead', {}, h('tr', {}, ...['Client', 'Business', 'Status', 'Stage'].map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', {}, ...rows.map((c) => h('tr', {}, h('td', {}, avatar(c.name, 28), ' ', h('a', { href: hrefs.client(c.id) }, c.name)), h('td', {}, c.business_name ?? ''), h('td', {}, statusLabel(c.status)), h('td', {}, stageLabel(c.stage_key))))))));
    };
    search.addEventListener('input', () => { q = search.value.trim().toLowerCase(); draw(); });
    const stSel = h('select', { 'aria-label': 'Status' }, h('option', { value: '' }, 'Any status'), ...STATUS.map(([k, t]) => h('option', { value: k }, t))); stSel.addEventListener('change', () => { status = stSel.value; draw(); });
    put(main, head('Clients', 'Everyone you work for. You see only the clients your access allows.', canCreate ? btn('New client', newClient, 'pri') : null),
      h('div', { class: 'cl-bar' }, search, stSel, seg([['table', 'Table'], ['grid', 'Grid'], ['pipeline', 'Pipeline']], view, (k) => { view = k; draw(); }, 'View'),
        seg([['active', 'Active'], ['archived', 'Archived']], show, (k) => ctx.go(hrefs.list(k === 'archived' ? '?show=archived' : '')), 'Show')), body); draw();
  }
  function newClient() {
    const name = field({ id: 'nc-name', label: 'Client name', maxlength: 200 }); const biz = field({ id: 'nc-biz', label: 'Business (optional)', maxlength: 200 });
    dialog({ title: 'New client', body: [name.el, biz.el], actions: [{ label: 'Create client', cls: 'pri', on: async () => {
      const nm = name.input.value.trim(); if (!nm) return name.error('Give the client a name.');
      const r = await api.call('clients.create', { name: nm, ...(biz.input.value.trim() ? { business_name: biz.input.value.trim() } : {}) });
      if (!r.ok) { fail(r, 'add clients'); return false; } toast('Client added.'); ctx.go(hrefs.client(r.data[0].id));
    } }, { label: 'Cancel' }] });
  }

  // ---------------------------------------------------------------- client page
  async function client() {
    put(main, skeleton(4));
    const [r] = await Promise.all([api.call('clients.get', { id: route.id }), loadStages()]); if (!live()) return;
    if (!r.ok || !r.data[0]) return put(main, r.status === 404 || r.ok ? noAccessState({ action: h('a', { class: 'btn', href: hrefs.list() }, 'Back to Clients') }) : errorState(client));
    const c = r.data[0]; const archived = Boolean(c.archived_at); const id = c.id;
    const can = (p) => !archived && ctx.can(p, id);
    const TABS = [['overview', 'Overview'], ['work', 'Work'], ['requests', 'Requests & Approvals'], ['documents', 'Documents'], ['notes', 'Team Notes']];
    let tab = TABS.some(([k]) => k === route.query.tab) ? route.query.tab : 'overview';
    const body = h('div', { class: 'pj-body' });
    const tabBar = tabs(TABS, tab, (k) => { tab = k; history.replaceState(null, '', hrefs.client(id, k)); draw(); }, 'Client sections');
    const preview = h('a', { class: 'btn', href: `#/portal/${id}` }, 'Preview client portal');
    const share = btn('Manage client sharing', () => dialog({ title: 'Client sharing', body: h('p', {}, 'Sharing with the client goes through the Client Portal, which is locked until its security checks pass. Items marked “Show to client” are saved but nobody outside your team sees them yet.'), actions: [{ label: 'Close', focus: true }] }), '');
    put(main, h('div', { class: 'pj-head' }, h('div', {}, h('div', { class: 'crumbs fine' }, h('a', { href: hrefs.list() }, 'Clients'), ' / ', c.name),
      h('div', { class: 'cl-title' }, avatar(c.name, 48), h('div', {}, h('h1', { 'data-page-title': true }, c.name), h('div', { class: 'pj-meta' }, statusChip(c.status), chip(stageLabel(c.stage_key)), archived ? chip('Archived', 'warn') : null, c.business_name ? h('span', { class: 'fine muted' }, c.business_name) : null)))),
      h('div', { class: 'pj-actions' }, preview, share, can('clients.client.edit') ? btn('Edit details', edit, '') : null,
        archived ? (ctx.can('clients.client.edit', id) ? btn('Restore client', async () => { const x = await api.call('clients.restore', { id }); if (x.ok) { toast('Client restored.'); client(); } else fail(x, 'restore this client'); }) : null)
          : (ctx.can('clients.client.edit', id) ? btn('Archive', () => dialog({ title: `Archive ${c.name}?`, body: h('p', {}, 'They leave the lists. Nothing is deleted and you can restore them from Archived.'), actions: [{ label: 'Archive', cls: 'pri', on: async () => { const x = await api.call('clients.archive', { id }); if (!x.ok) { fail(x, 'archive this client'); return false; } toast('Client archived.'); ctx.go(hrefs.list()); } }, { label: 'Cancel', focus: true }] })) : null))), tabBar, body);

    function edit() {
      const f = { name: field({ id: 'ec-name', label: 'Name', value: c.name, maxlength: 200 }), business_name: field({ id: 'ec-biz', label: 'Business', value: c.business_name ?? '', maxlength: 200 }), niche: field({ id: 'ec-niche', label: 'Niche', value: c.niche ?? '', maxlength: 200 }),
        email: field({ id: 'ec-email', label: 'Email', type: 'email', value: c.email ?? '' }), phone: field({ id: 'ec-phone', label: 'Phone', value: c.phone ?? '', maxlength: 40 }), website: field({ id: 'ec-web', label: 'Website', value: c.website ?? '', maxlength: 300 }), country: field({ id: 'ec-country', label: 'Country', value: c.country ?? '', maxlength: 80 }) };
      const st = h('select', { id: 'ec-status', 'aria-label': 'Status' }, ...STATUS.map(([k, t]) => h('option', { value: k, ...(k === c.status ? { selected: true } : {}) }, t)));
      dialog({ title: 'Edit client', wide: true, body: [...Object.values(f).map((x) => x.el), h('div', { class: 'fld' }, h('label', { for: 'ec-status' }, 'Status'), st)], actions: [{ label: 'Save', cls: 'pri', on: async () => {
        const nm = f.name.input.value.trim(); if (!nm) return f.name.error('A client needs a name.');
        const input = { id, name: nm, status: st.value }; for (const k of ['business_name', 'niche', 'email', 'phone', 'website', 'country']) if (f[k].input.value.trim()) input[k] = f[k].input.value.trim();
        const x = await api.call('clients.update', input); if (!x.ok) { fail(x, 'change this client'); return false; } toast('Saved.'); client();
      } }, { label: 'Cancel' }] });
    }
    function draw() {
      tabBar.querySelectorAll('[role=tab]').forEach((b) => { b.setAttribute('aria-selected', String(b.dataset.k === tab)); b.tabIndex = b.dataset.k === tab ? 0 : -1; });
      ({ overview, work, requests, documents, notes })[tab]();
    }
    const banner = () => (archived ? readOnlyNotice('This client is archived') : null);

    function overview() {
      const row = (k, v) => v ? h('div', { class: 'dl' }, h('span', { class: 'muted' }, k), h('span', {}, v)) : null;
      put(body, banner(), h('section', { class: 'card pad' }, h('h2', { class: 'pj-gh' }, 'Details'), row('Business', c.business_name), row('Niche', c.niche), row('Email', c.email), row('Phone', c.phone), row('Website', c.website), row('Country', c.country), row('Currency', c.currency), row('Status', statusLabel(c.status)), row('Stage', stageLabel(c.stage_key)), row('Tags', (c.tags ?? []).join(', ')),
        ![c.business_name, c.niche, c.email, c.phone, c.website].some(Boolean) ? h('p', { class: 'muted' }, 'No details yet. Use Edit details to add them.') : null));
    }

    // ---- Work: stages, Strategy copies, Copy shell
    async function work() {
      put(body, banner(), skeleton(3)); const cp = await api.call('clients.strategy.list', { client: id }); if (!live()) return;
      const canEdit = can('clients.stage.manage') || can('clients.client.edit');
      const steps = h('ol', { class: 'cl-steps' }, ...stages.map((s) => h('li', { class: s.key === c.stage_key ? 'now' : '' }, canEdit ? h('button', { type: 'button', 'aria-pressed': String(s.key === c.stage_key), onclick: async () => { const x = await api.call('clients.stage.set', { id, stage: s.key }); if (x.ok) { toast(`Moved to ${s.label}.`); client(); } else fail(x, 'move this client'); } }, s.label) : h('span', {}, s.label), s.progress_only ? h('small', { class: 'fine muted' }, 'progress only') : null)));
      const copies = cp.ok ? cp.data : [];
      const strategy = h('section', { class: 'card pad' }, h('div', { class: 'pj-calbar' }, h('h2', { class: 'pj-gh' }, 'Strategy'), can('clients.client.edit') ? btn('Start a copy', startCopy, 'pri') : null),
        notice('info', 'info', 'These are client-specific copies, started from Office › Funnels. They are never synced: changing the library later does not change them, and editing a copy does not change the library.'),
        copies.length ? h('ul', { class: 'pj-rows' }, ...copies.map((k) => h('li', { class: 'pj-row' }, icon('doc'), h('a', { class: 'pj-title', href: k.kind === 'strategies' ? `#/office/funnels/strategy/${k.copy_id}` : k.kind === 'ladders' ? `#/ladder/l/${k.copy_id}` : `#/office/funnels/${k.kind}/${k.copy_id}` }, k.copy_name ?? 'Copy'), chip(KINDS.find(([x]) => x === k.kind)?.[1] ?? k.kind), h('span', { class: 'fine muted' }, `from “${k.source_name ?? 'a library record'}” · ${when(k.created_at)}`))))
          : emptyState({ title: 'No copies yet', body: 'Start a copy of an avatar, offer, story or the brand kit from the organization library for this client.', ic: 'doc' }));
      const later = (title, why) => h('section', { class: 'card pad' }, h('h2', { class: 'pj-gh' }, title), h('p', { class: 'muted' }, why));
      const fr = await api.call('forms.list', { client: id });
      const forms = fr.ok ? fr.data : [];
      const brand = h('section', { class: 'card pad' }, h('div', { class: 'pj-calbar' }, h('h2', { class: 'pj-gh' }, 'Brand Base'), can('forms.form.create') ? btn('Add a form', addForm, 'pri') : null),
        h('p', { class: 'fine muted' }, 'The client’s questionnaire. Forms for this client open here in the builder, and answers are recorded against the version they answered. The Brand Kit itself lives in Strategy.'),
        fr.ok ? (forms.length ? h('ul', { class: 'pj-rows' }, ...forms.map((f) => h('li', { class: 'pj-row' }, icon('frm'), h('button', { type: 'button', class: 'pj-title', onclick: () => overlay(f.id) }, f.name), chip(f.status === 'published' ? 'Published' : 'Draft', f.status === 'published' ? 'ok' : ''), h('span', { class: 'fine muted' }, f.current_version ? `v${f.current_version}` : 'no version yet')))) : emptyState({ title: 'No forms yet', body: 'Add a form to ask this client for information. Nothing reaches them until the Portal is on.', ic: 'frm' }))
          : notice('info', 'info', 'Forms isn’t switched on for you yet, so Brand Base forms can’t be listed.'));
      put(body, banner(), h('section', { class: 'card pad' }, h('h2', { class: 'pj-gh' }, 'Stage'), steps, !stages.length ? h('p', { class: 'muted' }, 'No stages are set up for this organization.') : null), brand, strategy,
        h('section', { class: 'card pad' }, h('h2', { class: 'pj-gh' }, 'Copy'), notice('warn', 'info', [h('b', {}, 'Copy requirements not yet defined.'), ' Versions, internal review, sending an exact version and the client’s approve or request-changes answer will be built on Approvals once the requirements are written.']), h('div', { class: 'pj-actions' }, btn('Add a version', null, '', { disabled: true, 'aria-disabled': 'true', title: 'Waiting for the Copy requirements' }), btn('Send for approval', null, '', { disabled: true, 'aria-disabled': 'true', title: 'Waiting for the Copy requirements' }))),
        later('Build', 'Progress only: the funnel is built elsewhere and moved here by stage.'), later('Marketing', 'Placeholder: Marketing will connect to Social Planner and reporting later.'));
    }
    function overlay(formId) {
      const prev = document.activeElement; const root2 = h('div', { class: 'fb-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Form builder' });
      const close = () => { root2.remove(); document.body.classList.remove('noscroll'); prev?.focus?.(); work(); };
      root2.append(h('div', { class: 'fb-ov-panel' }, builderView({ api, ctx, id: formId, embedded: true, onClose: close }))); document.body.append(root2); document.body.classList.add('noscroll');
      root2.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); root2.querySelector('.pj-actions .btn:last-child')?.click(); } });
      root2.querySelector('button, input')?.focus();
    }
    async function addForm() {
      const name = field({ id: 'bf-name', label: 'Form name', value: 'Brand Base questions', maxlength: 200 });
      const tr = await api.call('forms.list', { templates: true }); const tpl = h('select', { id: 'bf-tpl', 'aria-label': 'Start from' }, h('option', { value: '' }, 'A blank form'), ...(tr.ok ? tr.data : []).map((x) => h('option', { value: x.id }, `Template: ${x.name}`)));
      dialog({ title: 'Add a form', body: [name.el, h('div', { class: 'fld' }, h('label', { for: 'bf-tpl' }, 'Start from'), tpl)], actions: [{ label: 'Create and open', cls: 'pri', on: async () => { const n = name.input.value.trim(); if (!n) return name.error('Give the form a name.');
        const r = tpl.value ? await api.call('forms.duplicate', { id: tpl.value, name: n, client: id }) : await api.call('forms.create', { name: n, client: id }); if (!r.ok) { fail(r, 'add forms'); return false; } overlay(r.data[0].id); } }, { label: 'Cancel' }] });
    }
    async function startCopy() {
      const kind = h('select', { id: 'sc-kind', 'aria-label': 'What to copy' }, ...KINDS.map(([k, t]) => h('option', { value: k }, t))); const pick = h('select', { id: 'sc-src', 'aria-label': 'Library record' }); const hint = h('p', { class: 'fine muted' });
      const cp = await api.call('clients.strategy.list', { client: id }); const done = new Set((cp.ok ? cp.data : []).map((k) => k.source_id));
      const fill = async () => { put(pick, h('option', { value: '' }, 'Loading…')); const r = kind.value === 'strategies' ? await api.call('funnels.strategies.list', { library: true }) : kind.value === 'ladders' ? await api.call('valueladder.list', {}) : await api.call(`funnels.${kind.value}.list`, {}); const key = KINDS.find(([k]) => k === kind.value)[2];
        const opts = (r.ok ? r.data : []).filter((x) => !x.client_id && !done.has(x.id)); put(pick, ...(opts.length ? opts.map((x) => h('option', { value: x.id }, x[key])) : [h('option', { value: '' }, 'Nothing left to copy')]));
        hint.textContent = kind.value === 'brand_kits' ? 'A client has one brand kit.' : ''; };
      kind.addEventListener('change', fill); fill();
      dialog({ title: 'Start a copy for this client', body: [h('div', { class: 'fld' }, h('label', { for: 'sc-kind' }, 'What to copy'), kind), h('div', { class: 'fld' }, h('label', { for: 'sc-src' }, 'From the library'), pick), hint, h('p', { class: 'fine muted' }, 'The copy is started once. After that it is the client’s own and is never synced.')],
        actions: [{ label: 'Start copy', cls: 'pri', on: async () => { if (!pick.value) return false;
          const x = await api.call('clients.strategy.copy', { client: id, kind: kind.value, source: pick.value }); if (!x.ok || !x.data[0]) { toast(x.status === 409 || x.status === 422 ? 'That one is already copied (or the client already has a brand kit).' : 'Couldn’t start the copy here.', false); return false; }
          toast('Copy started.'); work(); } }, { label: 'Cancel' }] });
    }

    // ---- Requests & Approvals
    async function requests() {
      put(body, banner(), skeleton(3)); const [rq, ap] = await Promise.all([api.call('clients.requests.list', { client: id }), api.call('approvals.list', { client: id })]); if (!live()) return;
      const reqs = rq.ok ? rq.data : []; const apps = ap.ok ? ap.data : [];
      const canShare = ctx.can('clients.record.share', id) && !archived;
      put(body, banner(), h('section', { class: 'card pad' }, h('div', { class: 'pj-calbar' }, h('h2', { class: 'pj-gh' }, 'Requests'), can('clients.request.create') ? btn('New request', newRequest, 'pri') : null),
        reqs.length ? h('ul', { class: 'pj-rows' }, ...reqs.map((x) => h('li', { class: 'pj-row' }, h('b', { class: 'pj-title' }, x.title), chip(x.kind === 'approval' ? 'Approval' : 'Info'), chip(x.status === 'open' ? 'Open' : x.status === 'answered' ? 'Answered' : 'Closed', x.status === 'open' ? 'warn' : 'ok'), x.due_on ? h('span', { class: 'fine muted' }, `Due ${when(x.due_on)}`) : null,
          canShare ? h('label', { class: 'pj-share' }, h('input', { type: 'checkbox', checked: x.client_visible, onchange: async (e) => { const y = await api.call('clients.requests.share', { id: x.id, visible: e.target.checked }); if (!y.ok) { e.target.checked = !e.target.checked; fail(y, 'share that request'); } } }), ' Show to client') : (x.client_visible ? chip('Shown to client') : null))))
          : emptyState({ title: 'No requests yet', body: 'Ask the client for information or an approval. Nothing reaches them until the Client Portal is on.', ic: 'check' })),
        h('section', { class: 'card pad' }, h('h2', { class: 'pj-gh' }, 'Approvals'), apps.length ? h('ul', { class: 'pj-rows' }, ...apps.map((a) => h('li', { class: 'pj-row' }, h('b', { class: 'pj-title' }, a.title), chip(a.status === 'pending' ? 'Waiting' : a.status === 'approved' ? 'Approved' : a.status === 'rejected' ? 'Changes requested' : 'Withdrawn', a.status === 'approved' ? 'ok' : a.status === 'pending' ? 'warn' : ''), h('span', { class: 'fine muted' }, `Version ${a.version} · ${when(a.created_at)}`))))
          : emptyState({ title: 'No approvals yet', body: 'Approvals asked of this client, with the exact version sent, appear here.', ic: 'check' })));
    }
    function newRequest() {
      const title = field({ id: 'rq-title', label: 'What do you need?', maxlength: 200 }); const bodyF = field({ id: 'rq-body', label: 'Details (optional)', rows: 4, maxlength: 8000 }); const due = field({ id: 'rq-due', label: 'Due date (optional)', type: 'date' });
      const kind = h('select', { id: 'rq-kind', 'aria-label': 'Kind' }, h('option', { value: 'info' }, 'Information'), h('option', { value: 'approval' }, 'Approval'));
      dialog({ title: 'New request', body: [title.el, bodyF.el, h('div', { class: 'fld' }, h('label', { for: 'rq-kind' }, 'Kind'), kind), due.el], actions: [{ label: 'Create request', cls: 'pri', on: async () => {
        const t = title.input.value.trim(); if (!t) return title.error('Say what you need.');
        const x = await api.call('clients.requests.create', { client: id, title: t, kind: kind.value, ...(bodyF.input.value.trim() ? { body: bodyF.input.value.trim() } : {}), ...(due.input.value ? { due_on: due.input.value } : {}) });
        if (!x.ok) { fail(x, 'add requests'); return false; } toast('Request created.'); requests(); } }, { label: 'Cancel' }] });
    }

    // ---- Documents (this client's own workspace; never in the shared Drive)
    async function documents() {
      put(body, banner(), skeleton(3)); const r2 = await api.call('drive.files.list', { space: 'client', client: id, anywhere: true, kind: 'document' }); if (!live()) return;
      if (!r2.ok) return put(body, errorState(documents));
      const canNew = ctx.can('drive.file.upload', id) && !archived;
      const make = (isBoard) => { const nm = field({ id: 'cd-name', label: isBoard ? 'Whiteboard name' : 'Document name', value: isBoard ? 'New whiteboard' : 'Untitled document', maxlength: 200 });
        dialog({ title: isBoard ? 'New whiteboard' : 'New document', body: nm.el, actions: [{ label: 'Create', cls: 'pri', on: async () => { const name = nm.input.value.trim(); if (!name || /[\/\\]/.test(name)) return nm.error('Use a name without slashes.');
          const x = isBoard ? await createBoard(api, name, { space: 'client', client: id }) : await api.call('drive.files.create', { app: 'clients', space: 'client', client: id, name, kind: 'document', mime_type: DOC_MIME, body: serialize(emptyDoc()) });
          if (!x.ok) { fail(x, 'add files'); return false; } ctx.go(isBoard ? `#/board/${x.data[0].id}` : `#/doc/${x.data[0].id}`); } }, { label: 'Cancel' }] }); };
      put(body, banner(), h('section', { class: 'card pad' }, h('div', { class: 'pj-calbar' }, h('h2', { class: 'pj-gh' }, 'Documents and whiteboards'), canNew ? h('div', { class: 'pj-actions' }, btn('New document', () => make(false), 'pri'), btn('New whiteboard', () => make(true))) : null),
        h('p', { class: 'fine muted' }, 'This is the client’s own workspace. Files here are never listed in the shared Drive.'),
        r2.data.length ? h('ul', { class: 'pj-rows' }, ...r2.data.map((f) => h('li', { class: 'pj-row' }, icon(f.mime_type === BOARD_MIME ? 'wb' : 'doc'), h('a', { class: 'pj-title', href: f.mime_type === BOARD_MIME ? `#/board/${f.id}` : `#/doc/${f.id}` }, f.name), h('span', { class: 'fine muted' }, `Version ${f.current_version} · ${when(f.updated_at)}`))))
          : emptyState({ title: 'No documents yet', body: 'Notes, plans and whiteboards for this client live here.', ic: 'doc', first: true })));
    }

    // ---- Team Notes (internal only; no client path exists)
    async function notes() {
      put(body, banner(), skeleton(2)); const r2 = await api.call('clients.notes.list', { client: id }); if (!live()) return;
      if (!r2.ok) return put(body, errorState(notes));
      const box = h('textarea', { rows: 3, maxlength: '20000', 'aria-label': 'New note', placeholder: 'Write a note for your team' });
      put(body, banner(), notice('info', 'info', 'Team notes are internal. They can never be shared with the client.'),
        can('clients.note.create') ? h('form', { class: 'pj-add', onsubmit: async (e) => { e.preventDefault(); const t = box.value.trim(); if (!t) return; const x = await api.call('clients.notes.create', { client: id, body: t }); if (x.ok) { toast('Note added.'); notes(); } else fail(x, 'add notes'); } }, box, btn('Add note', null, 'pri', { type: 'submit' })) : null,
        r2.data.length ? h('ul', { class: 'pj-rows' }, ...r2.data.map((n) => h('li', { class: 'pj-row cl-note' }, h('p', { class: 'pj-title' }, n.body), h('span', { class: 'fine muted' }, when(n.created_at)),
          can('clients.note.edit') ? btn(['Archive', h('span', { class: 'sr' }, ' note')], async () => { const x = await api.call('clients.notes.archive', { id: n.id }); if (x.ok) notes(); else fail(x, 'archive notes'); }, 'link') : null))) : emptyState({ title: 'No notes yet', body: 'Quick notes about this client for your team.', ic: 'doc' }));
    }
    draw();
  }

  root.append(main);
  (route.view === 'client' ? client : list)();
  return root;
}
