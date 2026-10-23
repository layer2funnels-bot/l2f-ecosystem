// Form Builder (v4): build (11 question types, properties, show-if), preview (phone / desktop), submissions, settings, versions. The same builder opens as a page
// (#/forms/f/<id>) and as an overlay inside Clients (Brand Base). Saving the questions always creates a new immutable version; submissions stay tied to the
// version they answered. There is no public link or embed: forms are filled in by signed-in staff, and publishing only means "staff can record answers".
import { h, put, icon, btn, chip, dialog, toast, field, notice, skeleton, emptyState, errorState, noAccessState, seg, tabs, readOnlyNotice } from '../ui.js';
import { dirty } from '../dirty.js';
import { FIELD_TYPES, OPS, typeLabel, newField, cleanField, checkFields, keyFromLabel, MAX_FIELDS } from './formmodel.js';
import { renderForm } from './formrender.js';

const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const asDraft = (fields) => (fields ?? []).map((f) => ({ ...f, _auto: false, options: f.options ? [...f.options] : undefined, show_if: f.show_if ? { ...f.show_if } : undefined }));
const sig = (fields) => JSON.stringify(fields.map(cleanField));

export function builderView({ api, ctx, id, embedded = false, onClose = null }) {
  const root = h('section', { class: `fb${embedded ? ' fb-embedded' : ''}` }, skeleton(4));
  const live = () => ctx.live() && root.isConnected;
  const fail = (r, what = 'do that') => toast(r?.status === 404 ? `You can’t ${what} here.` : (r?.message ?? 'Something went wrong. Try again.'), false);
  let form = null; let fields = []; let saved = '[]'; let sel = null; let tab = 'build'; let device = 'phone';
  const canEdit = () => form && !form.archived_at && ctx.can('forms.form.edit', form.client_id);
  const body = h('div', { class: 'fb-body' });
  const isDirty = () => sig(fields) !== saved;
  const mark = () => { if (isDirty()) dirty.set('this form', () => saveFields()); else dirty.clear(); paintHead(); };
  const headEl = h('div', { class: 'fb-head' });
  const tabBar = tabs([['build', 'Build'], ['preview', 'Preview'], ['submissions', 'Submissions'], ['settings', 'Settings'], ['versions', 'Versions']], tab, (k) => { tab = k; draw(); }, 'Form sections');

  async function load(keep = false) {
    const r = await api.call('forms.get', { id }); if (!live()) return;
    if (!r.ok || !r.data[0]) return put(root, r.status === 404 || r.ok ? noAccessState({ action: embedded ? btn('Close', () => onClose?.(), '') : h('a', { class: 'btn', href: '#/forms' }, 'Back to Forms') }) : errorState(() => load()));
    form = r.data[0]; if (!keep) { fields = asDraft(form.fields); saved = sig(fields); sel = fields[0]?.key ?? null; }
    put(root, headEl, tabBar, body); paintHead(); draw();
  }
  function paintHead() {
    if (!form) return;
    const edit = canEdit();
    put(headEl, h('div', {}, h('div', { class: 'crumbs fine' }, embedded ? 'Form builder' : h('a', { href: '#/forms' }, 'Forms'), ' / ', form.client_id ? ctx.clients?.get?.(form.client_id) ?? 'Client' : ctx.orgName), h('h1', { 'data-page-title': !embedded }, form.name),
      h('div', { class: 'pj-meta' }, chip(form.status === 'published' ? 'Published' : 'Draft', form.status === 'published' ? 'ok' : ''), form.is_template ? chip('Template', 'act') : null, form.archived_at ? chip('Archived', 'warn') : null, h('span', { class: 'fine muted' }, form.current_version ? `Version ${form.current_version}` : 'No version yet'), isDirty() ? h('span', { class: 'fine', role: 'status' }, 'Unsaved changes') : null)),
      h('div', { class: 'pj-actions' }, edit ? btn('Save as new version', () => saveFields(), 'pri', { disabled: !isDirty() }) : null,
        edit && form.status !== 'published' ? btn('Publish', publish, '') : null, edit && form.status === 'published' ? btn('Unpublish', async () => { const r = await api.call('forms.unpublish', { id }); if (r.ok) { toast('Unpublished.'); load(true); } else fail(r, 'unpublish this form'); }, '') : null,
        embedded ? btn('Close', () => (isDirty() ? dialog({ title: 'Close with unsaved changes?', body: h('p', {}, 'Your changes to the questions have not been saved as a version.'), actions: [{ label: 'Save and close', cls: 'pri', on: async () => { if (await saveFields()) onClose?.(); else return false; } }, { label: 'Discard and close', on: () => { dirty.clear(); onClose?.(); } }, { label: 'Keep editing', focus: true }] }) : onClose?.()), '') : null));
  }
  async function saveFields() {
    const errs = checkFields(fields); const n = Object.values(errs).flat().length;
    if (n) { sel = Object.keys(errs).find((k) => k) ?? sel; tab = 'build'; draw(); toast(`Fix ${n} problem${n === 1 ? '' : 's'} first.`, false); return false; }
    const r = await api.call('forms.fields.save', { id, fields: fields.map(cleanField) });
    if (!r.ok) { fail(r, 'change this form'); return false; }
    form = r.data[0]; saved = sig(fields); dirty.clear(); toast(`Saved as version ${form.current_version}.`); paintHead(); draw(); return true;
  }
  function publish() {
    if (isDirty() || !form.current_version) return toast('Save the questions as a version first.', false);
    dialog({ title: 'Publish this form?', body: [h('p', {}, 'Published means your team can record answers to it. Each answer is saved against this version.'), notice('info', 'lock', 'There is no public link or embed. Public forms stay switched off until a security review (spam, rate limits, privacy notice) and your approval.')],
      actions: [{ label: 'Publish', cls: 'pri', on: async () => { const r = await api.call('forms.publish', { id }); if (!r.ok) { fail(r, 'publish this form'); return false; } toast('Published.'); load(true); } }, { label: 'Cancel', focus: true }] });
  }
  function draw() {
    tabBar.querySelectorAll('[role=tab]').forEach((b) => { b.setAttribute('aria-selected', String(b.dataset.k === tab)); b.tabIndex = b.dataset.k === tab ? 0 : -1; });
    const ro = form.archived_at ? readOnlyNotice('This form is archived') : !canEdit() ? readOnlyNotice('You can look at this form but not change it') : null;
    ({ build, preview, submissions, settings, versions })[tab](ro);
  }

  // ---------------------------------------------------------------- build
  function build(ro) {
    const edit = canEdit(); const errs = checkFields(fields); const cur = fields.find((f) => f.key === sel);
    const move = (i, d) => { const j = i + d; if (j < 0 || j >= fields.length) return; [fields[i], fields[j]] = [fields[j], fields[i]]; mark(); build(ro); };
    const palette = h('div', { class: 'fb-pal', role: 'group', 'aria-label': 'Add a question' }, h('h2', { class: 'pj-gh' }, 'Add a question'), ...FIELD_TYPES.map(([t, l]) => h('button', { type: 'button', class: 'btn', ...(edit && fields.length < MAX_FIELDS ? {} : { disabled: true }), onclick: () => { const f = { ...newField(t, fields), _auto: true }; fields.push(f); sel = f.key; mark(); build(ro); } }, icon('plus'), l)));
    const canvas = h('div', { class: 'fb-canvas' }, h('h2', { class: 'pj-gh' }, 'Questions'), errs[''] ? notice('warn', 'warn', errs[''][0]) : null,
      fields.length ? h('ol', { class: 'fb-list' }, ...fields.map((f, i) => h('li', { class: `fb-q${f.key === sel ? ' on' : ''}`, 'aria-current': f.key === sel ? 'true' : null },
        h('button', { type: 'button', class: 'fb-pick', onclick: () => { sel = f.key; build(ro); } }, h('b', {}, f.label || '(no label)'), h('span', { class: 'fine muted' }, `${typeLabel(f.type)}${f.required ? ' · required' : ''}${f.show_if?.key ? ' · conditional' : ''}`), errs[f.key] ? h('span', { class: 'err' }, errs[f.key][0]) : null),
        edit ? h('span', { class: 'fb-acts' }, btn(['Up', h('span', { class: 'sr' }, ` ${f.label}`)], () => move(i, -1), 'link', { disabled: i === 0 }), btn(['Down', h('span', { class: 'sr' }, ` ${f.label}`)], () => move(i, 1), 'link', { disabled: i === fields.length - 1 }),
          btn(['Duplicate', h('span', { class: 'sr' }, ` ${f.label}`)], () => { const c = { ...asDraft([f])[0], key: keyFromLabel(f.label, fields.map((x) => x.key)), label: `${f.label} (copy)` }; fields.splice(i + 1, 0, c); sel = c.key; mark(); build(ro); }, 'link', { disabled: fields.length >= MAX_FIELDS }),
          btn(['Delete', h('span', { class: 'sr' }, ` ${f.label}`)], () => { const gone = fields.splice(i, 1)[0]; fields.forEach((x) => { if (x.show_if?.key === gone.key) delete x.show_if; }); sel = fields[Math.min(i, fields.length - 1)]?.key ?? null; mark(); build(ro); }, 'link')) : null)))
        : emptyState({ title: 'No questions yet', body: edit ? 'Add a question from the list.' : 'This form has no questions.', ic: 'doc', first: true }));
    put(body, ro, h('div', { class: 'fb-grid' }, palette, canvas, h('div', { class: 'fb-props' }, cur ? props(cur, ro) : h('p', { class: 'muted' }, 'Select a question to edit it.'))));
  }
  function props(f, ro) {
    const edit = canEdit(); const idx = fields.indexOf(f); const set = (k, v, redraw = false) => { f[k] = v; mark(); if (redraw) build(ro); };
    const inp = (idn, label, key, attrs = {}) => { const x = field({ id: idn, label, value: f[key] ?? '', ...attrs, ...(edit ? {} : { readonly: true }) }); x.input.addEventListener('input', () => set(key, x.input.value)); x.input.addEventListener('change', () => build(ro)); return x.el; };
    const earlier = fields.slice(0, idx); const si = f.show_if ?? { key: '', op: 'filled' };
    const keyIn = field({ id: 'fp-key', label: 'Key', value: f.key, hint: 'Used in the saved answers. Lower-case letters, numbers and _.', ...(edit ? {} : { readonly: true }) });
    keyIn.input.addEventListener('change', () => { f._auto = false; const k = keyIn.input.value.trim(); if (!/^[a-z][a-z0-9_]{0,39}$/.test(k) || fields.some((x) => x !== f && x.key === k)) { keyIn.error('Use letters, numbers and _, starting with a letter, and not used by another question.'); return; } fields.forEach((x) => { if (x.show_if?.key === f.key) x.show_if.key = k; }); sel = k; f.key = k; mark(); build(ro); });
    const showSel = h('select', { id: 'fp-sk', 'aria-label': 'Show this question when', ...(edit ? {} : { disabled: true }) }, h('option', { value: '' }, 'Always show'), ...earlier.map((x) => h('option', { value: x.key, ...(si.key === x.key ? { selected: true } : {}) }, x.label || x.key)));
    const opSel = h('select', { id: 'fp-op', 'aria-label': 'Condition', ...(edit ? {} : { disabled: true }) }, ...OPS.map(([k, l]) => h('option', { value: k, ...(si.op === k ? { selected: true } : {}) }, l)));
    const src = earlier.find((x) => x.key === si.key); const valIn = src && ['select', 'multi_select'].includes(src.type) ? h('select', { id: 'fp-v', 'aria-label': 'Value', ...(edit ? {} : { disabled: true }) }, ...(src.options ?? []).map((o) => h('option', { value: o, ...(si.value === o ? { selected: true } : {}) }, o))) : h('input', { id: 'fp-v', 'aria-label': 'Value', value: si.value ?? '', ...(edit ? {} : { readonly: true }) });
    const upd = () => { if (!showSel.value) delete f.show_if; else { f.show_if = { key: showSel.value, op: opSel.value, ...(['eq', 'neq'].includes(opSel.value) ? { value: valIn.value || (src?.options?.[0] ?? '') } : {}) }; } mark(); build(ro); };
    showSel.addEventListener('change', upd); opSel.addEventListener('change', upd); valIn.addEventListener('change', upd);
    const opts = ['select', 'multi_select'].includes(f.type) ? (() => { const x = field({ id: 'fp-opts', label: 'Choices', rows: 5, value: (f.options ?? []).join('\n'), hint: 'One per line.', ...(edit ? {} : { readonly: true }) }); x.input.addEventListener('input', () => { f.options = x.input.value.split('\n'); mark(); }); x.input.addEventListener('change', () => build(ro)); return x.el; })() : null;
    return h('div', {}, h('h2', { class: 'pj-gh' }, 'Question'), h('p', { class: 'fine muted' }, typeLabel(f.type)), (() => { const x = field({ id: 'fp-label', label: 'Question', value: f.label ?? '', maxlength: 200, ...(edit ? {} : { readonly: true }) }); x.input.addEventListener('input', () => set('label', x.input.value)); x.input.addEventListener('change', () => { if (f._auto && f.label.trim()) { const k = keyFromLabel(f.label, fields.filter((y) => y !== f).map((y) => y.key)); fields.forEach((y) => { if (y.show_if?.key === f.key) y.show_if.key = k; }); f.key = k; sel = k; mark(); } build(ro); }); return x.el; })(), keyIn.el, inp('fp-help', 'Help text (optional)', 'help', { maxlength: 300 }),
      f.type !== 'checkbox' || true ? h('label', { class: 'fr-opt' }, h('input', { type: 'checkbox', checked: Boolean(f.required), ...(edit ? {} : { disabled: true }), onchange: (e) => set('required', e.target.checked) }), ' Required') : null, opts,
      ['number', 'text', 'textarea'].includes(f.type) ? h('div', { class: 'fb-two' }, inp('fp-min', f.type === 'number' ? 'Smallest number' : 'Fewest characters', 'min', { type: 'number' }), inp('fp-max', f.type === 'number' ? 'Largest number' : 'Most characters', 'max', { type: 'number' })) : null,
      f.type === 'file' ? h('div', {}, (() => { const x = field({ id: 'fp-acc', label: 'Accepted file types', value: (f.accept ?? []).join(', '), hint: 'For example: pdf, png, svg. Leave empty for any.', ...(edit ? {} : { readonly: true }) }); x.input.addEventListener('input', () => { f.accept = x.input.value.split(',').map((s) => s.trim()).filter(Boolean); mark(); }); return x.el; })(), inp('fp-mb', 'Largest file (MB, 1 to 25)', 'max_mb', { type: 'number' })) : null,
      h('h3', {}, 'Show this question only when…'), earlier.length ? h('div', { class: 'fb-two' }, showSel, opSel, ['eq', 'neq'].includes(si.op) && si.key ? valIn : null) : h('p', { class: 'fine muted' }, 'Add a question above this one to use conditions.'));
  }

  // ---------------------------------------------------------------- preview and recording
  function preview(ro) {
    const errs = checkFields(fields); const bad = Object.keys(errs).length;
    const r = renderForm({ fields: fields.map(cleanField), disabled: false });
    const sub = btn('Submit (preview)', async () => { const a = await r.collect(); if (a) toast('Preview only. Nothing was recorded.', true); }, 'pri');
    put(body, ro, bad ? notice('warn', 'warn', 'Fix the problems in Build to preview the final form.') : null, h('div', { class: 'pj-calbar' }, seg([['phone', 'Phone'], ['desktop', 'Desktop']], device, (k) => { device = k; preview(ro); }, 'Preview size'), form.status === 'published' && !isDirty() && ctx.can('forms.submission.create', form.client_id) ? btn('Record a submission', record, '') : null),
      fields.length ? h('div', { class: `fb-frame ${device}` }, h('h2', {}, form.name), form.description ? h('p', { class: 'muted' }, form.description) : null, r.el, sub, h('p', { class: 'fine muted' }, 'Preview only. Nothing is recorded or sent.')) : emptyState({ title: 'Nothing to preview', body: 'Add a question in Build.', ic: 'doc' }));
  }
  function record() {
    const spec = form.fields ?? []; const space = form.client_id ? 'client' : 'shared';
    const uploadFile = async (file) => {
      const s = await api.call('drive.uploads.sign', { space, ...(form.client_id ? { client: form.client_id } : {}), name: file.name, size_bytes: Math.max(1, file.size), mime_type: file.type || 'application/octet-stream' }); if (!s.ok || !s.data[0]) return null;
      const put1 = await fetch(s.data[0].url, { method: s.data[0].method || 'PUT', headers: s.data[0].headers ?? {}, body: file }).catch(() => null); if (!put1?.ok) return null;
      const c = await api.call('drive.files.create', { app: 'forms', space, ...(form.client_id ? { client: form.client_id } : {}), name: file.name, kind: 'file', mime_type: file.type || 'application/octet-stream', size_bytes: Math.max(1, file.size), storage_path: s.data[0].path }); return c.ok ? c.data[0].id : null;
    };
    const r = renderForm({ fields: spec, uploadFile });
    dialog({ title: `Record an answer · ${form.name}`, wide: true, body: [h('p', { class: 'fine muted' }, `Recorded against version ${form.current_version}.`), r.el], actions: [{ label: 'Record submission', cls: 'pri', on: async () => { const a = await r.collect(); if (!a) return false; const x = await api.call('forms.submissions.submit', { form: id, answers: a }); if (!x.ok) { fail(x, 'record answers'); return false; } toast('Submission recorded.'); tab = 'submissions'; draw(); } }, { label: 'Cancel' }] });
  }

  // ---------------------------------------------------------------- submissions
  async function submissions(ro) {
    put(body, skeleton(3)); const [r, vs] = await Promise.all([api.call('forms.submissions.list', { form: id }), api.call('forms.versions.list', { form: id })]); if (!live() || tab !== 'submissions') return;
    if (!r.ok) return put(body, errorState(() => submissions(ro)));
    const byV = new Map((vs.ok ? vs.data : []).map((v) => [v.version, v.fields])); let q = '';
    const list = h('div', {}); const search = h('input', { type: 'search', placeholder: 'Search answers', 'aria-label': 'Search answers', autocomplete: 'off' });
    const text = (s) => JSON.stringify(s.answers).toLowerCase();
    const draw2 = () => {
      const rows = r.data.filter((s) => !q || text(s).includes(q));
      put(list, rows.length ? h('div', { class: 'card tbl-wrap' }, h('table', { class: 'tbl' }, h('caption', { class: 'sr' }, 'Submissions'), h('thead', {}, h('tr', {}, ...['Received', 'Version', 'First answers'].map((t) => h('th', { scope: 'col' }, t)), h('th', { scope: 'col' }, h('span', { class: 'sr' }, 'Open')))),
        h('tbody', {}, ...rows.map((s) => h('tr', {}, h('td', {}, when(s.created_at)), h('td', {}, `v${s.form_version}`), h('td', {}, Object.values(s.answers).slice(0, 2).map((v) => (Array.isArray(v) ? `${v.length} item${v.length === 1 ? '' : 's'}` : String(v))).join(' · ').slice(0, 90)), h('td', {}, btn(['View', h('span', { class: 'sr' }, ` submission from ${when(s.created_at)}`)], () => detail(s, byV.get(s.form_version) ?? []), 'link'))))))) : emptyState({ title: q ? 'No answer matches' : 'No submissions yet', body: q ? 'Try another word.' : form.status === 'published' ? 'Use Record a submission in Preview to add one.' : 'Publish the form so your team can record answers.', ic: 'inbox' }));
    };
    search.addEventListener('input', () => { q = search.value.trim().toLowerCase(); draw2(); });
    put(body, ro, form.retention_note ? notice('info', 'info', [h('b', {}, 'Retention.'), ` ${form.retention_note}`]) : null, h('div', { class: 'cl-bar' }, search), list); draw2();
  }
  function detail(s, spec) {
    const rows = spec.map((f) => ({ f, v: s.answers[f.key] })).filter((x) => x.v !== undefined);
    const canDel = ctx.can('forms.submission.delete', form.client_id);
    dialog({ title: `Submission · ${when(s.created_at)}`, wide: true, body: [h('p', { class: 'fine muted' }, `Answered against version ${s.form_version}. Answers cannot be edited.`), rows.length ? h('dl', { class: 'drv-dl' }, ...rows.flatMap(({ f, v }) => [h('dt', {}, f.label), h('dd', {}, f.type === 'file' ? `${v.length} file${v.length === 1 ? '' : 's'} (kept in ${form.client_id ? 'the client’s documents' : 'storage'})` : f.type === 'checkbox' ? (v ? 'Yes' : 'No') : Array.isArray(v) ? v.join(', ') : String(v))])) : h('p', { class: 'muted' }, 'No answers.')],
      actions: [canDel ? { label: 'Archive', on: async () => { const x = await api.call('forms.submissions.archive', { id: s.id }); if (!x.ok) { fail(x, 'archive this'); return false; } toast('Archived.'); submissions(null); } } : null, { label: 'Close', focus: true }].filter(Boolean) });
  }

  // ---------------------------------------------------------------- settings
  function settings(ro) {
    const edit = canEdit(); const f = { name: field({ id: 'fs-name', label: 'Name', value: form.name, maxlength: 200, ...(edit ? {} : { readonly: true }) }), desc: field({ id: 'fs-desc', label: 'Description (shown above the questions)', rows: 3, value: form.description ?? '', ...(edit ? {} : { readonly: true }) }),
      msg: field({ id: 'fs-msg', label: 'Confirmation message', rows: 2, value: form.confirmation_message ?? '', maxlength: 1000, hint: 'Shown after a submission is recorded.', ...(edit ? {} : { readonly: true }) }), url: field({ id: 'fs-url', label: 'Redirect after submitting (optional)', value: form.redirect_url ?? '', hint: 'A web address starting with https://', ...(edit ? {} : { readonly: true }) }),
      ret: field({ id: 'fs-ret', label: 'Privacy and retention note', rows: 2, value: form.retention_note ?? '', maxlength: 500, hint: 'For example: Answers are kept for 12 months, then deleted.', ...(edit ? {} : { readonly: true }) }) };
    const tpl = h('label', { class: 'fr-opt' }, h('input', { type: 'checkbox', checked: form.is_template, ...(edit && !form.client_id ? {} : { disabled: true }), id: 'fs-tpl' }), ' Use as a template (organization forms only)');
    put(body, ro, h('div', { class: 'card pad' }, ...Object.values(f).map((x) => x.el), tpl,
      edit ? btn('Save settings', async () => { const n = f.name.input.value.trim(); if (!n) return f.name.error('A form needs a name.'); const u = f.url.input.value.trim(); if (u && !/^https:\/\/\S+$/.test(u)) return f.url.error('Use a web address that starts with https://');
        const r = await api.call('forms.update', { id, name: n, description: f.desc.input.value, confirmation_message: f.msg.input.value, redirect_url: u, retention_note: f.ret.input.value, is_template: tpl.querySelector('input').checked }); if (!r.ok) return fail(r, 'change this form'); toast('Saved.'); load(true); }, 'pri') : null),
      h('div', { class: 'card pad' }, h('h2', { class: 'pj-gh' }, 'Public link and embed'), notice('warn', 'lock', 'Switched off. Public forms need a security review (spam protection, rate limits, a privacy notice) and your approval first. Until then forms are filled in by signed-in staff only.'), btn('Create public link', null, '', { disabled: true, 'aria-disabled': 'true', title: 'Switched off until the security review and owner approval' })),
      h('div', { class: 'card pad' }, h('div', { class: 'pj-actions' }, ctx.can('forms.form.create', form.client_id) || ctx.canAnywhere('forms.form.create') ? btn('Duplicate', async () => { const r = await api.call('forms.duplicate', { id, ...(form.client_id ? { client: form.client_id } : {}) }); if (r.ok) { toast('Duplicated as a draft.'); ctx.go(`#/forms/f/${r.data[0].id}`); } else fail(r, 'duplicate this form'); }, '') : null,
        edit ? btn('Archive form', () => dialog({ title: `Archive “${form.name}”?`, body: h('p', {}, 'The form leaves the list and stops taking answers. Submissions are kept.'), actions: [{ label: 'Archive', cls: 'pri', on: async () => { const r = await api.call('forms.archive', { id }); if (!r.ok) { fail(r, 'archive this form'); return false; } toast('Archived.'); load(true); } }, { label: 'Cancel', focus: true }] }), '') : null,
        form.archived_at && ctx.can('forms.form.edit', form.client_id) ? btn('Restore form', async () => { const r = await api.call('forms.restore', { id }); if (r.ok) { toast('Restored.'); load(true); } else fail(r, 'restore this form'); }, 'pri') : null)));
  }

  // ---------------------------------------------------------------- versions
  async function versions(ro) {
    put(body, skeleton(2)); const r = await api.call('forms.versions.list', { form: id }); if (!live() || tab !== 'versions') return;
    if (!r.ok) return put(body, errorState(() => versions(ro)));
    put(body, ro, r.data.length ? h('ul', { class: 'rows card' }, ...r.data.map((v) => h('li', { class: 'pj-row' }, h('b', {}, `Version ${v.version}${v.version === form.current_version ? ' · current' : ''}`), h('span', { class: 'fine muted' }, `${when(v.created_at)} · ${v.fields.length} question${v.fields.length === 1 ? '' : 's'}`),
      canEdit() && v.version !== form.current_version ? btn(['Use these questions', h('span', { class: 'sr' }, ` from version ${v.version}`)], () => { fields = asDraft(v.fields); sel = fields[0]?.key ?? null; mark(); tab = 'build'; draw(); toast(`Loaded version ${v.version}. Save it to make it the newest.`); }, 'link') : null)))
      : emptyState({ title: 'No versions yet', body: 'Save the questions to create version 1. Every change after that is a new version; submissions stay with the version they answered.', ic: 'clock' }));
  }
  load();
  return root;
}
