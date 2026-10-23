// Renders a form for filling in (Preview and "Record a submission"). Questions show and hide with the show-if rules as answers change; checks use the same
// plain-word messages as the builder. Files are uploaded by the caller's `uploadFile(file)` and kept as file ids.
import { h, put } from '../ui.js';
import { visible, checkAnswers, answersFor, fileProblem, MAX_FILES } from './formmodel.js';

export function renderForm({ fields, uploadFile = null, disabled = false }) {
  const values = {}; const files = {}; const wraps = new Map(); const errs = new Map();
  const root = h('form', { class: 'fr', novalidate: true, onsubmit: (e) => e.preventDefault() });
  const refresh = () => { for (const f of fields) { const w = wraps.get(f.key); if (w) w.hidden = !visible(f, values); } };
  const set = (k, v) => { values[k] = v; errs.get(k)?.replaceChildren(); refresh(); };
  for (const f of fields) {
    const id = `fr-${f.key}`; const err = h('p', { class: 'err', role: 'alert', id: `${id}-e` }); errs.set(f.key, err);
    const label = h('label', { for: id }, f.label, f.required && f.type !== 'checkbox' ? h('span', { class: 'req' }, ' (required)') : null);
    const common = { id, ...(disabled ? { disabled: true } : {}), 'aria-describedby': `${id}-e` };
    let control;
    if (f.type === 'textarea') control = h('textarea', { ...common, rows: 4, oninput: (e) => set(f.key, e.target.value) });
    else if (f.type === 'select') control = h('select', { ...common, onchange: (e) => set(f.key, e.target.value) }, h('option', { value: '' }, 'Choose…'), ...(f.options ?? []).map((o) => h('option', { value: o }, o)));
    else if (f.type === 'multi_select') { values[f.key] = []; control = h('fieldset', { class: 'fr-group', id }, h('legend', { class: 'sr' }, f.label), ...(f.options ?? []).map((o, i) => h('label', { class: 'fr-opt' }, h('input', { type: 'checkbox', ...(disabled ? { disabled: true } : {}), onchange: (e) => { const cur = new Set(values[f.key]); e.target.checked ? cur.add(o) : cur.delete(o); set(f.key, [...cur]); } }), ` ${o}`))); }
    else if (f.type === 'checkbox') control = h('label', { class: 'fr-opt' }, h('input', { type: 'checkbox', ...common, onchange: (e) => set(f.key, e.target.checked) }), ` ${f.label}`);
    else if (f.type === 'file') {
      const list = h('ul', { class: 'fr-files' }); files[f.key] = [];
      const paintFiles = () => { put(list, ...files[f.key].map((file, i) => h('li', {}, file.name, ' ', h('button', { type: 'button', class: 'btn link', onclick: () => { files[f.key].splice(i, 1); paintFiles(); set(f.key, files[f.key].map((x) => x.name)); } }, ['Remove', h('span', { class: 'sr' }, ` ${file.name}`)])))); };
      const pick = h('input', { type: 'file', multiple: true, ...common, ...(f.accept?.length ? { accept: f.accept.map((x) => `.${x}`).join(',') } : {}), onchange: (e) => {
        const msgs = []; for (const file of e.target.files) { const p = fileProblem(f, file); if (p) msgs.push(`${file.name}: ${p}`); else if (files[f.key].length < MAX_FILES) files[f.key].push(file); }
        e.target.value = ''; paintFiles(); set(f.key, files[f.key].map((x) => x.name)); put(err, msgs.join(' ')); } });
      control = h('div', {}, pick, list);
    } else control = h('input', { ...common, type: { email: 'email', phone: 'tel', url: 'url', number: 'number', date: 'date' }[f.type] ?? 'text', ...(f.type === 'number' && f.min !== undefined ? { min: String(f.min) } : {}), ...(f.type === 'number' && f.max !== undefined ? { max: String(f.max) } : {}), ...(f.max !== undefined && f.type !== 'number' ? { maxlength: String(f.max) } : {}), oninput: (e) => set(f.key, e.target.value) });
    const wrap = h('div', { class: 'fld fr-q' }, f.type === 'checkbox' ? null : label, f.help ? h('p', { class: 'fine muted' }, f.help) : null, control, err); wraps.set(f.key, wrap); root.append(wrap);
  }
  refresh();
  return {
    el: root,
    /** Shows problems next to the questions; returns the answers to store (files uploaded) or null when something is wrong. */
    async collect() {
      const raw = { ...values }; const errors = checkAnswers(fields, raw);
      for (const [k, e] of errs) put(e, errors[k] ?? '');
      if (Object.keys(errors).length) { root.querySelector('.err:not(:empty)')?.closest('.fr-q')?.querySelector('input,select,textarea')?.focus(); return null; }
      for (const f of fields) if (f.type === 'file' && visible(f, raw)) {
        if (!files[f.key]?.length) { delete raw[f.key]; continue; }
        if (!uploadFile) { put(errs.get(f.key), 'Files are not saved in a preview.'); return null; }
        const ids = []; for (const file of files[f.key]) { const id = await uploadFile(file, f); if (!id) { put(errs.get(f.key), `Couldn’t upload ${file.name}. Try again.`); return null; } ids.push(id); }
        raw[f.key] = ids;
      }
      return answersFor(fields, raw);
    },
  };
}
