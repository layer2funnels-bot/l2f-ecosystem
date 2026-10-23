// Office pages built from the approved v4 screens: Documents (the organization library), Team (directory + what each person is working on that you may see)
// and Apps (what is on, locked or coming for this organization). Every list comes from the permission-checked API; what a person may not see is not there.
import { h, put, icon, btn, chip, dialog, drawer, toast, field, skeleton, emptyState, errorState, readOnlyNotice, initials, avatar, roleLabel } from '../ui.js';
import { hrefFor } from './../routes.js';
import { plateOf } from '../registry.js';
import { emptyDoc, serialize } from '../modules/docmodel.js';

const DOC_MIME = 'application/vnd.l2f.doc+json'; const BOARD_MIME = 'application/vnd.excalidraw+json';
const when = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const head = (org, title, sub, ...actions) => h('div', { class: 'pj-head' }, h('div', {}, h('div', { class: 'crumb' }, `Office · ${org}`), h('h1', { 'data-page-title': true }, title), sub ? h('p', { class: 'sub' }, sub) : null), actions.length ? h('div', { class: 'pj-actions' }, ...actions) : null);
const linkFor = (f) => (f.mime_type === BOARD_MIME ? `#/board/${f.id}` : `#/doc/${f.id}`);

// ---------------------------------------------------------------- Documents
export function documentsView({ api, ctx }) {
  const canCreate = ctx.canAnywhere('drive.file.upload');
  const root = h('section', { class: 'office-docs' });
  const list = h('div', { class: 'card' }, skeleton(4)); const sops = h('div', {});
  const q = h('input', { type: 'search', id: 'docs-find', placeholder: 'Search documents', 'aria-label': 'Search documents', autocomplete: 'off' });
  const row = (f) => h('li', {}, icon(f.mime_type === BOARD_MIME ? 'wb' : 'doc'), h('a', { class: 'pj-title', href: linkFor(f) }, f.name), f.protected_sop ? chip('Approved SOP', 'ok') : null, h('span', { class: 'fine muted' }, `Version ${f.current_version ?? 1} · ${when(f.updated_at)}`));
  async function load() {
    const [d, s] = await Promise.all([api.call('drive.files.list', { space: 'shared', anywhere: true, kind: 'document', ...(q.value.trim() ? { q: q.value.trim() } : {}) }), q.value.trim() ? Promise.resolve(null) : api.call('drive.sops.list', {})]);
    if (!ctx.live()) return;
    if (!d.ok) return put(list, errorState(load));
    const docs = d.data.filter((f) => !f.protected_sop);
    put(sops, ...(s?.ok && s.data.length ? [h('h2', { class: 'pj-gh' }, 'Approved SOPs'), h('p', { class: 'fine muted' }, 'Owner-protected procedures. Everyone on the team can read them; changing one needs the right access.'), h('ul', { class: 'rows card' }, ...s.data.map(row))] : []));
    put(list, docs.length ? h('ul', { class: 'rows' }, ...docs.map(row))
      : emptyState({ title: q.value.trim() ? 'No document matches' : 'No documents yet', body: q.value.trim() ? 'Try another word.' : canCreate ? `Write the first document for ${ctx.orgName}. It goes in the organization library, which Drive also shows.` : `Documents your team adds to ${ctx.orgName} appear here.`, ic: 'doc', first: !q.value.trim(), action: canCreate && !q.value.trim() ? btn('New document', create, 'pri') : null }));
  }
  function create() {
    const name = field({ id: 'nd-name', label: 'Document name', value: 'Untitled document', maxlength: 200 });
    dialog({ title: 'New document', body: name.el, actions: [{ label: 'Create', cls: 'pri', on: async () => {
      const nm = name.input.value.trim(); if (!nm || /[\/\\]/.test(nm)) return name.error('Use a name without slashes.');
      const r = await api.call('drive.files.create', { space: 'shared', name: nm, kind: 'document', mime_type: DOC_MIME, body: serialize(emptyDoc()) });
      if (!r.ok) { toast('Couldn’t create it here.', false); return false; } ctx.go(`#/doc/${r.data[0].id}`);
    } }, { label: 'Cancel' }] });
  }
  let t = null; q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 200); });
  put(root, head(ctx.orgName, 'Documents', `The ${ctx.orgName} library: procedures, plans and notes the whole team can find. Project and client files stay with their own app.`, canCreate ? btn('New document', create, 'pri') : null),
    !canCreate ? readOnlyNotice('You can read the library but not add to it', '') : null, h('div', { class: 'findwrap' }, h('label', {}, icon('search'), h('span', { class: 'sr' }, 'Search documents'), q)), sops, list);
  load(); return root;
}

// ---------------------------------------------------------------- Team
export function teamView({ api, ctx }) {
  const root = h('section', { class: 'office-team' }); const list = h('div', { class: 'card' }, skeleton(4));
  async function load() {
    const r = await api.call('team.list', {}); if (!ctx.live()) return;
    if (!r.ok) return put(list, errorState(load));
    put(list, r.data.length ? h('ul', { class: 'rows team' }, ...r.data.map((m) => h('li', {}, avatar(m.display_name, 40),
      h('button', { type: 'button', class: 'pj-title', onclick: () => profile(m) }, m.display_name, m.is_you ? h('span', { class: 'fine muted' }, ' (you)') : null), chip(roleLabel(m.role))))) : emptyState({ title: 'No one here yet', body: 'Active team members appear here.', ic: 'user' }));
  }
  async function profile(m) {
    const body = h('div', {}, skeleton(2)); drawer({ title: m.display_name, label: `Profile of ${m.display_name}`, body: [h('div', { class: 'team-id' }, avatar(m.display_name, 56), h('div', {}, h('b', {}, m.display_name), h('br'), chip(roleLabel(m.role)), m.email ? h('div', { class: 'fine muted' }, m.email) : null)), h('h3', {}, 'Open work you can see'), body], actions: [{ label: 'Close', cls: 'pri' }] });
    const [t, p] = await Promise.all([api.call('tasks.list', { assignee: m.user_id, open_only: true }), api.call('projects.list', { scope: 'all' })]);
    const names = new Map((p.ok ? p.data : []).map((x) => [x.id, x.name]));
    const rows = t.ok ? t.data.filter((x) => names.has(x.project_id)) : [];
    put(body, rows.length ? h('ul', { class: 'pj-rows' }, ...rows.slice(0, 20).map((x) => h('li', { class: 'pj-row' }, h('a', { class: 'pj-title', href: `#/projects/p/${x.project_id}?task=${x.id}` }, x.title), h('span', { class: 'fine muted' }, names.get(x.project_id)), x.due_on ? h('span', { class: 'fine' }, when(x.due_on)) : null)))
      : h('p', { class: 'muted' }, 'No open tasks that you have access to. Work in projects you can’t open is not shown.'));
  }
  put(root, head(ctx.orgName, 'Team', `The people on the ${ctx.orgName} team. You see their work only where your own access allows it.`), list); load(); return root;
}

// ---------------------------------------------------------------- Apps
export function appsView({ catalog, registry, org, orgs, onSwitch }) {
  const reason = { locked: 'Locked: an owner turns it on when ready', coming_soon: 'Coming soon', not_set_up: `Not set up for ${org.name}` };
  const rows = catalog.map((a) => {
    const man = registry?.get(a.app_key); const open = a.state === 'available';
    const href = a.app_key === 'office' ? hrefFor.office() : a.app_key === 'funnel_mapper_pro' && a.launch_url ? a.launch_url : hrefFor.app(a.app_key);
    return h('li', { class: 'app-row' }, plateOf(man ?? { id: a.app_key }, 40, a.state), h('div', { class: 'grow' }, h('b', {}, a.name), h('div', { class: 'fine muted' }, man?.description ?? '')),
      open ? h('a', { class: 'btn', href }, ['Open ', h('span', { class: 'sr' }, a.name)]) : chip(reason[a.state] ?? 'Unavailable', a.state === 'locked' ? 'warn' : ''));
  });
  return h('section', {}, head(org.name, 'Apps', `The apps on for you in ${org.name}. Locked and coming-soon apps are shown so you know what is planned; nothing in them is live yet.`),
    rows.length ? h('ul', { class: 'rows card' }, ...rows) : emptyState({ title: 'No apps yet', body: 'No app is switched on for you here. Ask an admin.', ic: 'grid' }));
}

