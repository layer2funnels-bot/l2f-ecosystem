// Forms app (v4): the list of forms and templates, and the builder page. The builder itself is formbuilder.js (also used as an overlay in Clients).
import { h, put, icon, btn, chip, dialog, toast, field, notice, skeleton, emptyState, errorState, seg } from '../ui.js';
import { builderView } from './formbuilder.js';

export const formsHref = (view, id) => (view === 'f' ? `#/forms/f/${id}` : view === 'templates' ? '#/forms/templates' : view === 'submissions' ? '#/forms/submissions' : '#/forms');
const when = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export function formsView({ api, ctx, route }) {
  if (route.view === 'f') return builderView({ api, ctx, id: route.id });
  const root = h('section', { class: 'forms' }); const live = () => ctx.live() && root.isConnected;
  if (route.view === 'submissions') { submissionsPage({ api, ctx, root, live }); return root; }
  const templates = route.view === 'templates'; let q = ''; let status = ''; let show = 'active'; let t = null;
  const canNew = ctx.canAnywhere('forms.form.create');
  const body = h('div', {}, skeleton(3));
  async function load() {
    const r = await api.call('forms.list', { ...(templates ? { templates: true } : {}), archived: show === 'archived', ...(status ? { status } : {}), ...(q ? { q } : {}) }); if (!live()) return;
    if (!r.ok) return put(body, r.status === 404 ? emptyState({ title: 'Forms isn’t switched on for you', body: 'Ask an admin to turn Forms on for your access level.', ic: 'frm' }) : errorState(load));
    put(body, r.data.length ? h('div', { class: 'tblwrap' }, h('table', { class: 'tbl stk' }, h('caption', { class: 'sr' }, templates ? 'Templates' : 'Forms'),
      h('thead', {}, h('tr', {}, ...['Form', 'Belongs to', 'Status', 'Version', 'Updated'].map((x) => h('th', { scope: 'col' }, x)))),
      h('tbody', {}, ...r.data.map((f) => h('tr', {}, h('td', {}, icon('frm'), ' ', h('a', { href: formsHref('f', f.id) }, f.name), f.is_template ? chip('Template', 'act') : null), h('td', {}, f.client_id ? (ctx.clients?.get?.(f.client_id) ?? 'A client') : ctx.orgName), h('td', {}, chip(f.status === 'published' ? 'Published' : 'Draft', f.status === 'published' ? 'ok' : '')), h('td', {}, f.current_version ? `v${f.current_version}` : '—'), h('td', {}, when(f.updated_at)))))))
      : emptyState({ title: q || status ? 'No form matches' : templates ? 'No templates yet' : show === 'archived' ? 'Nothing archived' : 'No forms yet', body: q || status ? 'Try another word or status.' : templates ? 'Mark an organization form as a template in its Settings to reuse it.' : canNew ? 'Build a form to collect information from clients, such as the Brand Base questions.' : 'Forms your team builds appear here.', ic: 'frm', first: !q && !status && show === 'active' && !templates, action: canNew && !templates && !q ? btn('New form', create, 'primary') : null }));
  }
  async function create() {
    const name = field({ id: 'nf-name', label: 'Form name', maxlength: 200 });
    const scope = h('select', { id: 'nf-scope', 'aria-label': 'Belongs to' }, ...(ctx.can('forms.form.create') ? [h('option', { value: '' }, ctx.orgName)] : []), ...ctx.clientsWhere('forms.form.create').map(([cid, n]) => h('option', { value: cid }, n)));
    const tr = await api.call('forms.list', { templates: true }); const tpl = h('select', { id: 'nf-tpl', 'aria-label': 'Start from' }, h('option', { value: '' }, 'A blank form'), ...(tr.ok ? tr.data : []).map((x) => h('option', { value: x.id }, `Template: ${x.name}`)));
    dialog({ title: 'New form', body: [name.el, h('div', { class: 'fld' }, h('label', { for: 'nf-scope' }, 'Belongs to'), scope), h('div', { class: 'fld' }, h('label', { for: 'nf-tpl' }, 'Start from'), tpl)], actions: [{ label: 'Create form', cls: 'primary', on: async () => {
      const n = name.input.value.trim(); if (!n) return name.error('Give the form a name.');
      const r = tpl.value ? await api.call('forms.duplicate', { id: tpl.value, name: n, ...(scope.value ? { client: scope.value } : {}) }) : await api.call('forms.create', { name: n, ...(scope.value ? { client: scope.value } : {}) });
      if (!r.ok) { toast('You can’t create forms here.', false); return false; } ctx.go(formsHref('f', r.data[0].id)); } }, { label: 'Cancel' }] });
  }
  const search = h('input', { type: 'search', placeholder: 'Search forms', 'aria-label': 'Search forms', autocomplete: 'off' }); search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { q = search.value.trim(); load(); }, 200); });
  const st = h('select', { 'aria-label': 'Status' }, h('option', { value: '' }, 'All statuses'), h('option', { value: 'draft' }, 'Draft'), h('option', { value: 'published' }, 'Published')); st.addEventListener('change', () => { status = st.value; load(); });
  const sh = h('select', { 'aria-label': 'Show' }, h('option', { value: 'active' }, 'Active'), h('option', { value: 'archived' }, 'Archived')); sh.addEventListener('change', () => { show = sh.value; load(); });
  put(root, h('div', { class: 'pj-head' }, h('div', {}, h('div', { class: 'crumbs fine' }, 'Forms'), h('h1', { 'data-page-title': true }, templates ? 'Templates' : 'Forms'), h('p', { class: 'sub' }, 'Build forms, record answers and keep every version. Public sharing is switched off until it has been reviewed.')), canNew ? btn('New form', create, 'primary') : null),
    h('div', { class: 'toolbar' }, search, st, sh), body);
  load(); return root;
}

// Submissions (all forms): one list of the answers people have recorded, newest first. Each row opens the form's own Submissions tab, where the answers are read.
async function submissionsPage({ api, ctx, root, live }) {
  const head = h('div', { class: 'pj-head' }, h('div', {}, h('h1', { 'data-page-title': true }, 'Submissions'), h('p', { class: 'sub' }, 'Answers recorded on any form you can open, newest first. Each belongs to the version of the form it answered.')),
    h('div', { class: 'acts' }, h('button', { type: 'button', class: 'btn', disabled: true, 'aria-disabled': 'true', title: 'Exporting answers needs the backend export service, which is not built yet.' }, icon('download'), 'Export')));
  put(root, head, skeleton(3));
  const fr = await api.call('forms.list', {}); if (!live()) return;
  if (!fr.ok) return put(root, head, fr.status === 404 ? emptyState({ title: 'Forms isn’t switched on for you', body: 'Ask an admin to turn Forms on for your access level.', ic: 'frm' }) : errorState(() => submissionsPage({ api, ctx, root, live })));
  const results = await Promise.all(fr.data.map((f) => api.call('forms.submissions.list', { form: f.id }))); if (!live()) return;
  const rows = results.flatMap((r, i) => (r.ok ? r.data.map((s) => ({ ...s, form: fr.data[i] })) : [])).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const stamp = (iso) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  put(root, head, rows.length ? h('div', { class: 'tblwrap' }, h('table', { class: 'tbl stk' }, h('caption', { class: 'sr' }, 'Submissions'),
    h('thead', {}, h('tr', {}, ...['Form', 'Belongs to', 'Version', 'Recorded', 'Answers'].map((x) => h('th', { scope: 'col' }, x)))),
    h('tbody', {}, ...rows.slice(0, 200).map((s) => h('tr', {}, h('td', { class: 't1', 'data-l': 'Form' }, h('a', { class: 'fname', href: formsHref('f', s.form.id) }, h('span', {}, s.form.name))),
      h('td', { 'data-l': 'Belongs to' }, s.form.client_id ? (ctx.clients?.get?.(s.form.client_id) ?? 'A client') : ctx.orgName), h('td', { 'data-l': 'Version' }, s.form_version ? `v${s.form_version}` : 'Draft'), h('td', { 'data-l': 'Recorded' }, stamp(s.created_at)),
      h('td', { 'data-l': 'Answers' }, `${Object.keys(s.answers ?? {}).length} answered`))))))
    : emptyState({ title: 'No submissions yet', body: 'When someone answers a form, or you record a test answer in Preview, it shows up here.', ic: 'inbox', first: true }));
}
