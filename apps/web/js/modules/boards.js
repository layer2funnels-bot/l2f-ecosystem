// Whiteboard app home: "All boards", the lens over every whiteboard the person may open, wherever it lives (the organization's Drive, a client, a project).
// Boards are Drive documents with a context (V4-4); this list only ever shows what the permission-checked API returns. Creating a board asks where it belongs.
import { h, put, icon, btn, chip, dialog, toast, field, skeleton, emptyState, errorState } from '../ui.js';
import { createBoard } from './whiteboard.js';
import { BOARD_TEMPLATES } from './boardmodel.js';

export const boardsHref = () => '#/whiteboards';
const when = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export function boardsView({ api, ctx, route = {} }) {
  const root = h('section', { class: 'wbs' }); const live = () => ctx.live() && root.isConnected;
  const state = { q: '', scope: 'all', show: 'active' }; let projects = new Map(); let t = null;
  const body = h('div', {}, skeleton(3));
  const where = (f) => (f.project_id ? { label: projects.get(f.project_id) ?? 'A project', href: `#/projects/p/${f.project_id}?tab=whiteboards`, kind: 'Project' } : f.client_id ? { label: ctx.clients?.get(f.client_id) ?? 'A client', href: `#/clients/c/${f.client_id}?tab=documents`, kind: 'Client' } : { label: f.space === 'personal' ? 'Personal' : ctx.orgName, href: '#/drive', kind: f.space === 'personal' ? 'Personal' : 'Organization' });
  async function load() {
    const [r, p] = await Promise.all([api.call('drive.boards.list', { archived: state.show === 'archived', ...(state.q ? { q: state.q } : {}) }), projects.size ? Promise.resolve(null) : api.call('projects.list', { scope: 'all' })]);
    if (!live()) return;
    if (p?.ok) projects = new Map(p.data.map((x) => [x.id, x.name]));
    if (!r.ok) return put(body, r.status === 404 ? emptyState({ title: 'Whiteboard isn’t switched on for you', body: 'Ask an admin to turn it on for your access level.', ic: 'wb' }) : errorState(load));
    const rows = r.ok ? r.data.filter((f) => state.scope === 'all' || (state.scope === 'project' ? !!f.project_id : state.scope === 'client' ? !f.project_id && f.space === 'client' : !f.project_id && f.space === 'shared')) : [];
    put(body, rows.length ? h('div', { class: 'tblwrap' }, h('table', { class: 'tbl stk' }, h('caption', { class: 'sr' }, 'Whiteboards'),
      h('thead', {}, h('tr', {}, ...['Board', 'Where it lives', 'Updated'].map((x) => h('th', { scope: 'col' }, x)))),
      h('tbody', {}, ...rows.map((f) => { const w = where(f); return h('tr', {}, h('td', {}, icon('wb'), ' ', h('a', { href: `#/board/${f.id}` }, f.name)), h('td', {}, chip(w.kind), ' ', h('a', { href: w.href }, w.label)), h('td', {}, when(f.updated_at))); }))))
      : emptyState({ title: state.q ? 'No board matches' : state.show === 'archived' ? 'Nothing archived' : 'No whiteboards yet', body: state.q ? 'Try another word.' : 'Boards you can open appear here, wherever they live. Boards that belong to a project or a client are also reachable from there.', ic: 'wb', first: !state.q && state.show === 'active', action: !state.q && state.show === 'active' ? btn('New whiteboard', () => create(), 'pri') : null }));
  }
  function create(tpl = BOARD_TEMPLATES[0]) {
    const name = field({ id: 'nb-name', label: 'Whiteboard name', value: tpl.key === 'blank' ? 'New whiteboard' : tpl.name, maxlength: 200 });
    const kind = h('select', { id: 'nb-kind', 'aria-label': 'Where does it belong?' }, h('option', { value: 'org' }, `${ctx.orgName} (organization)`), h('option', { value: 'client' }, 'A client'), h('option', { value: 'project' }, 'A project'));
    const clientSel = h('select', { id: 'nb-client', 'aria-label': 'Client' }, ...ctx.clientsWhere('drive.file.upload').map(([cid, n]) => h('option', { value: cid }, n)));
    const projSel = h('select', { id: 'nb-project', 'aria-label': 'Project' }, ...[...projects].map(([pid, n]) => h('option', { value: pid }, n)));
    const clientBox = h('div', { class: 'fld', hidden: true }, h('label', { for: 'nb-client' }, 'Client'), clientSel); const projBox = h('div', { class: 'fld', hidden: true }, h('label', { for: 'nb-project' }, 'Project'), projSel);
    kind.addEventListener('change', () => { clientBox.hidden = kind.value !== 'client'; projBox.hidden = kind.value !== 'project'; });
    dialog({ title: 'New whiteboard', body: [name.el, h('div', { class: 'fld' }, h('label', { for: 'nb-kind' }, 'Where does it belong?'), kind, h('p', { class: 'fine muted' }, 'A board always lives somewhere, so the right people can open it and nobody else can.')), clientBox, projBox], actions: [{ label: 'Create', cls: 'pri', on: async () => {
      const n = name.input.value.trim(); if (!n || /[\/\\]/.test(n)) return name.error('Use a name without slashes.');
      let context = { space: 'shared' };
      if (kind.value === 'client') { if (!clientSel.value) { toast('Choose a client.', false); return false; } context = { space: 'client', client: clientSel.value }; }
      if (kind.value === 'project') { if (!projSel.value) { toast('Choose a project.', false); return false; } const pr = await api.call('projects.get', { id: projSel.value }); const cid = pr.ok ? pr.data[0].client_id : null; context = cid ? { space: 'client', client: cid, project: projSel.value } : { space: 'shared', project: projSel.value }; }
      const r = await createBoard(api, n, context, tpl.scene()); if (!r.ok) { toast('You can’t add boards there.', false); return false; } ctx.go(`#/board/${r.data[0].id}`); } }, { label: 'Cancel' }] });
  }
  if (route.query?.view === 'templates') {
    put(root, h('div', { class: 'pj-head' }, h('div', {}, h('h1', { 'data-page-title': true }, 'Templates'), h('p', { class: 'sub' }, 'Start a board from a layout. You choose where it lives, then edit it freely. Starting from a template never changes the template.'))),
      h('div', { class: 'cardgrid' }, ...BOARD_TEMPLATES.map((tpl) => h('button', { type: 'button', class: 'card', 'data-template': tpl.key, onclick: () => create(tpl) }, h('h3', {}, tpl.name), h('p', {}, tpl.desc), h('span', { class: 'foot' }, icon('plus'), 'Use this template')))));
    return root;
  }
  const search = h('input', { type: 'search', placeholder: 'Search boards', 'aria-label': 'Search boards', autocomplete: 'off' }); search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { state.q = search.value.trim(); load(); }, 200); });
  const sc = h('select', { 'aria-label': 'Where it lives' }, ...[['all', 'Everywhere'], ['shared', `${ctx.orgName} Drive`], ['client', 'Clients'], ['project', 'Projects']].map(([k, l]) => h('option', { value: k }, l))); sc.addEventListener('change', () => { state.scope = sc.value; load(); });
  const sh = h('select', { 'aria-label': 'Show' }, h('option', { value: 'active' }, 'Active'), h('option', { value: 'archived' }, 'Archived')); sh.addEventListener('change', () => { state.show = sh.value; load(); });
  put(root, h('div', { class: 'pj-head' }, h('div', {}, h('div', { class: 'crumbs fine' }, 'Whiteboard'), h('h1', { 'data-page-title': true }, 'All boards'), h('p', { class: 'sub' }, 'Every whiteboard you can open, wherever it lives. Boards inside a project or a client open there too.')), btn('New whiteboard', () => create(), 'pri')), h('div', { class: 'toolbar' }, search, sc, sh), body);
  load(); return root;
}
