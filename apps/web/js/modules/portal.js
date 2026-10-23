// Client Portal PREVIEW (v4, gate G2): what a client will see, built from the records the team has marked "show to client", read only.
// Clients cannot sign in until the Portal's security tests pass and an owner switches it on, so nothing here sends, saves or approves anything for real.
// The preview shows exactly the shared items for one client, using the staff screens' own permission-checked data.
import { h, put, icon, btn, chip, notice, skeleton, emptyState, errorState, noAccessState, avatar } from '../ui.js';

export const portalHref = (clientId, page) => `#/portal${clientId ? `/${clientId}${page && page !== 'home' ? `/${page}` : ''}` : ''}`;
const PAGES = [['home', 'Home', 'home'], ['requests', 'Requests', 'inbox'], ['files', 'Files', 'drv'], ['messages', 'Messages', 'msg'], ['notes', 'My notes', 'doc']];
const when = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const NOPE = { disabled: true, 'aria-disabled': 'true', title: 'Preview only. Nothing is sent or saved.' };

export function portalView({ api, ctx, route }) {
  const root = h('section', { class: 'portal-prev' });
  const live = () => ctx.live() && root.isConnected;
  async function picker() {
    put(root, h('div', { class: 'pj-head' }, h('div', {}, h('div', { class: 'crumbs fine' }, 'Client Portal'), h('h1', { 'data-page-title': true }, 'Client Portal preview'), h('p', { class: 'sub' }, 'See what a client will see once the Portal is on. Choose a client.'))), skeleton(2));
    const r = await api.call('clients.list', {}); if (!live()) return;
    put(root, h('div', { class: 'pj-head' }, h('div', {}, h('div', { class: 'crumbs fine' }, 'Client Portal'), h('h1', { 'data-page-title': true }, 'Client Portal preview'), h('p', { class: 'sub' }, 'See what a client will see once the Portal is on. Choose a client.'))),
      notice('warn', 'lock', [h('b', {}, 'The Portal is locked.'), ' Clients cannot sign in until the security checks pass and an owner switches it on. This preview shows only the items marked “Show to client”; nothing here is sent.']),
      r.ok && r.data.length ? h('ul', { class: 'rows card' }, ...r.data.map((c) => h('li', { class: 'pj-row' }, avatar(c.name, 32), h('a', { class: 'pj-title', href: portalHref(c.id) }, c.name), h('span', { class: 'fine muted' }, c.business_name ?? '')))) : emptyState({ title: 'No clients to preview', body: 'Clients you can open appear here.', ic: 'cli' }));
  }
  async function preview() {
    const id = route.client; const page = PAGES.some(([k]) => k === route.page) ? route.page : 'home';
    put(root, skeleton(4));
    const [c, st, rq, up, ap, fl] = await Promise.all([api.call('clients.get', { id }), api.call('clients.stages.list', {}), api.call('clients.requests.list', { client: id }), api.call('clients.updates.list', { client: id }), api.call('approvals.list', { client: id }), api.call('drive.files.list', { space: 'client', client: id, anywhere: true })]);
    if (!live()) return;
    if (!c.ok || !c.data[0]) return put(root, noAccessState({ action: h('a', { class: 'btn', href: portalHref() }, 'Back to the preview list') }));
    const client = c.data[0]; const stages = st.ok ? st.data : [];
    const requests = (rq.ok ? rq.data : []).filter((x) => x.client_visible && !x.archived_at); const open = requests.filter((x) => x.status === 'open');
    const updates = (up.ok ? up.data : []).filter((x) => x.client_visible && !x.archived_at);
    const approvals = (ap.ok ? ap.data : []).filter((x) => x.client_visible); const pending = approvals.filter((x) => x.status === 'pending');
    const files = (fl.ok ? fl.data : []).filter((x) => x.client_visible && x.kind === 'file' && !x.archived_at);
    const idx = Math.max(0, stages.findIndex((s) => s.key === client.stage_key)); const pct = stages.length ? Math.round(100 * (client.stage_key ? idx : 0) / stages.length) : 0;
    const nav = h('nav', { class: 'pnav', 'aria-label': 'Portal' }, ...PAGES.map(([k, l, i]) => h('a', { class: 'btn', href: portalHref(id, k), ...(k === page ? { 'aria-current': 'page' } : {}) }, icon(i), l, k === 'requests' && (open.length + pending.length) ? h('span', { class: 'bd' }, String(open.length + pending.length)) : null)));
    const frame = (...body) => [h('div', { class: 'p-ribbon', role: 'note' }, icon('lock'), h('span', {}, `Preview of what ${client.name} will see. Clients can’t sign in until the security tests pass.`)),
      h('header', { class: 'pbar' }, h('div', { class: 'p-brand' }, avatar(client.name, 40), h('div', {}, h('b', {}, client.name), h('div', { class: 'fine muted' }, `with ${ctx.orgName}`))), nav, h('a', { class: 'btn', href: `#/clients/c/${id}` }, 'Exit preview')), h('div', { class: 'portal' }, ...body)];
    const head = (t, s) => h('div', { class: 'pj-head' }, h('div', {}, h('h1', { 'data-page-title': true }, t), s ? h('p', { class: 'sub' }, s) : null));
    if (page === 'home') {
      put(root, ...frame(h('div', { class: 'p-hero' }, h('h1', { 'data-page-title': true }, `Hi ${client.name}. ${pending.length ? 'One thing needs you.' : open.length ? 'A few things need you.' : 'Everything is on track.'}`), h('p', {}, 'We update this page as work moves, so you never have to chase us.')),
        h('section', { class: 'card pad', 'aria-label': 'Your journey' }, h('h2', { class: 'pj-gh' }, 'Your journey'), stages.length ? h('ol', { class: 'cl-steps' }, ...stages.map((s, i) => h('li', { class: i === idx && client.stage_key ? 'now' : '' }, h('span', {}, `${i < idx ? '✓ ' : ''}${s.label}`), i === idx && client.stage_key ? h('small', { class: 'fine' }, 'You are here') : null))) : h('p', { class: 'muted' }, 'Stages appear once your team sets them up.'), stages.length ? h('div', { class: 'pj-progress', role: 'img', 'aria-label': `${pct} percent of the way` }, h('i', { style: `width:${pct}%` })) : null),
        pending[0] ? h('section', { class: 'card pad' }, h('p', { class: 'fine muted' }, `Your next step${pending[0].due_on ? ` · due ${when(pending[0].due_on)}` : ''}`), h('h2', {}, pending[0].title), pending[0].note ? h('p', {}, pending[0].note) : null, h('div', { class: 'pj-actions' }, btn('Approve', null, 'pri', NOPE), btn('Ask for changes', null, '', NOPE))) : null,
        h('section', { class: 'card pad' }, h('h2', { class: 'pj-gh' }, 'Waiting on you'), open.length ? h('ul', { class: 'pj-rows' }, ...open.map((x) => h('li', { class: 'pj-row' }, h('b', { class: 'pj-title' }, x.title), x.due_on ? h('span', { class: 'fine muted' }, `Due ${when(x.due_on)}`) : null))) : h('p', { class: 'muted' }, 'Nothing is waiting on you.')),
        h('section', { class: 'card pad' }, h('h2', { class: 'pj-gh' }, 'Updates from your team'), updates.length ? h('ul', { class: 'pj-rows' }, ...updates.map((x) => h('li', { class: 'pj-row' }, h('b', { class: 'pj-title' }, x.title), h('span', { class: 'fine muted' }, when(x.created_at))))) : h('p', { class: 'muted' }, 'No updates have been shared yet.'))));
    } else if (page === 'requests') {
      put(root, ...frame(head('Requests', 'Things your team needs from you. Reply right here.'),
        ...[...pending.map((a) => ({ t: a.title, ty: 'Approval', d: a.due_on, b: a.note, ap: true })), ...open.map((x) => ({ t: x.title, ty: x.kind === 'approval' ? 'Approval' : 'Information', d: x.due_on, b: x.body }))].map((x) => h('section', { class: 'card pad' }, h('div', { class: 'pj-meta' }, chip(x.ty, x.ap ? 'act' : ''), x.d ? chip(`Due ${when(x.d)}`, 'warn') : null), h('h2', {}, x.t), x.b ? h('p', {}, x.b) : null, h('div', { class: 'pj-actions' }, x.ap ? btn('Approve', null, 'pri', NOPE) : btn('Choose files', null, '', NOPE), x.ap ? btn('Request changes', null, '', NOPE) : btn('Send answer', null, 'pri', NOPE)))),
        !pending.length && !open.length ? emptyState({ title: 'No requests right now', body: 'Requests marked “Show to client” appear here.', ic: 'inbox' }) : null));
    } else if (page === 'files') {
      put(root, ...frame(head('Files', 'Everything your team has shared with you. Always the exact version.'), files.length ? h('div', { class: 'card tbl-wrap' }, h('table', { class: 'tbl' }, h('caption', { class: 'sr' }, 'Shared files'), h('thead', {}, h('tr', {}, ...['File', 'Version', 'Shared', ''].map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', {}, ...files.map((f) => h('tr', {}, h('td', {}, icon('drv'), ' ', f.name), h('td', {}, `v${f.current_version}`), h('td', {}, when(f.updated_at)), h('td', {}, btn(['Download', h('span', { class: 'sr' }, ` ${f.name}`)], null, '', NOPE))))))) : emptyState({ title: 'No files shared yet', body: 'Files marked “Shareable with the client” in the client’s documents appear here.', ic: 'drv' })));
    } else if (page === 'messages') {
      put(root, ...frame(head('Messages', 'Each conversation stays with its request.'), emptyState({ title: 'Messages arrive when the Portal is on', body: 'Conversations are tied to the requests and approvals you share. There is nothing to preview until clients can sign in.', ic: 'msg' })));
    } else {
      put(root, ...frame(head('My notes', 'Your own space for ideas, plans and practice. Only you can see these.'), emptyState({ title: 'Private to the client', body: 'A client’s own notes are theirs alone. Your team cannot see them unless the client chooses to share one.', ic: 'lock' })));
    }
    document.title = `Portal preview · ${client.name}`;
  }
  (route.client ? preview : picker)();
  return root;
}
