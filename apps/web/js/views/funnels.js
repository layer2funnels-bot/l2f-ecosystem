// Office → Funnels screens: the business records live here, never inside Funnel Mapper Pro. Needs design (structure only).
import { h } from '../dom.js';
import { FUNNEL_TYPES, hrefFor } from '../routes.js';
import { fieldLabel, messageFor } from '../messages.js';
import { button, chip, emptyState, errorState, field, needsDesign, notFoundState, pageTitle, skeleton } from './common.js';

const TYPE = Object.fromEntries(FUNNEL_TYPES.map((t) => [t.key, t]));
const nameOf = (type, r) => (type === 'stories' ? r.title : r.name);
const scopeLabel = (r, clients) => (r.client_id ? (clients.get(r.client_id) ?? 'A client') : 'Organization-wide');
const audience = (r) => (r.client_visible ? chip('Shared with client', 'info') : chip('Internal'));

// ---- field definitions per type (the server validates again; the database decides who may do what)
export const FIELD_DEFS = {
  avatars: [
    { k: 'name', label: 'Name', req: true }, { k: 'summary', label: 'Summary', rows: 3 }, { k: 'pains', label: 'Pains', rows: 4 },
    { k: 'desires', label: 'Desires', rows: 4 }, { k: 'objections', label: 'Objections', rows: 4 },
  ],
  offers: [
    { k: 'name', label: 'Name', req: true }, { k: 'kind', label: 'Type', options: [['offer', 'Offer'], ['product', 'Product']] },
    { k: 'promise', label: 'Promise', rows: 2 }, { k: 'description', label: 'Description', rows: 4 },
    { k: 'price_amount', label: 'Price', num: true }, { k: 'currency', label: 'Currency (e.g. USD)', hint: 'Three capital letters. Needed when a price is set.' },
    { k: 'avatar_id', label: 'Avatar', ref: 'avatars' },
  ],
  stories: [
    { k: 'title', label: 'Title', req: true }, { k: 'kind', label: 'Type', options: [['origin', 'Origin'], ['case_study', 'Case study'], ['testimonial', 'Testimonial'], ['analogy', 'Analogy'], ['other', 'Other']] },
    { k: 'body', label: 'Story', rows: 10 }, { k: 'avatar_id', label: 'Avatar', ref: 'avatars' }, { k: 'offer_id', label: 'Offer', ref: 'offers' },
  ],
  brand_kits: [
    { k: 'name', label: 'Name', req: true }, { k: 'voice', label: 'Voice', rows: 4 },
    { k: 'colors', label: 'Colours', list: true, hint: 'Comma-separated hex codes, for example #173a8f, #ff7a59.' },
    { k: 'fonts', label: 'Fonts', list: true, hint: 'Comma-separated font names.' }, { k: 'notes', label: 'Notes', rows: 4 },
  ],
};

const run = async (ctx, op, input) => ctx.api.call(op, input);
const fail = (res) => (res.error?.code ?? 'failed');

// ---- Funnels home
export function funnelsHomeView(ctx) {
  const box = h('div', {}, skeleton(2));
  (async () => {
    const res = await run(ctx, 'funnels.overview');
    if (!ctx.live()) return;
    if (!res.ok) { box.replaceChildren(errorState(fail(res), () => ctx.rerender())); return; }
    const n = Object.fromEntries(res.data.map((x) => [x.type, x.n]));
    box.replaceChildren(h('ul', { class: 'tiles' }, ...FUNNEL_TYPES.map((t) => h('li', { class: 'tile' }, h('h2', {}, t.label),
      h('p', { class: 'big' }, String(n[t.key] ?? 0)), h('a', { class: 'btn secondary', href: hrefFor.list(t.key) }, 'Open ', t.label)))),
    h('section', { class: 'fmp-note' }, h('h2', {}, 'Funnel Mapper Pro'),
      h('p', { class: 'muted' }, 'Funnel maps are built in Funnel Mapper Pro, a separate product with its own sign-in. These records are managed here, not there.'),
      ctx.fmpUrl ? h('a', { class: 'btn secondary', href: ctx.fmpUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Open Funnel Mapper Pro', h('span', { class: 'sr-only' }, ' (new tab)')) : h('p', { class: 'muted' }, 'Its link has not been set yet.')));
  })();
  return h('section', {}, needsDesign(), pageTitle('Funnels', `Business records for ${ctx.orgName}.`), box);
}

// ---- list
export function funnelListView(ctx, typeKey) {
  const t = TYPE[typeKey]; const o = t.obj;
  const state = { client: '', archived: false };
  const body = h('div', {});
  const clientSel = h('select', { id: 'f-client', 'aria-label': 'Filter by client', onchange: (e) => { state.client = e.target.value; load(); } },
    h('option', { value: '' }, 'All scopes'), ...[...ctx.clients].map(([id, n]) => h('option', { value: id }, n)));
  const arch = h('label', { class: 'inline' }, h('input', { type: 'checkbox', onchange: (e) => { state.archived = e.target.checked; load(); } }), ' Show archived');
  async function load() {
    body.replaceChildren(skeleton());
    const res = await run(ctx, `funnels.${typeKey}.list`, { ...(state.client ? { client: state.client } : {}), archived: state.archived });
    if (!ctx.live()) return;
    if (!res.ok) { body.replaceChildren(errorState(fail(res), load)); return; }
    if (!res.data.length) {
      body.replaceChildren(emptyState(state.archived ? 'Nothing archived' : `No ${t.label.toLowerCase()} yet`,
        state.archived ? null : (ctx.can(`funnels.${o}.create`) ? 'Create the first one.' : 'You can view this area, but nothing has been added.'),
        !state.archived && ctx.can(`funnels.${o}.create`) ? h('a', { class: 'btn primary', href: hrefFor.record(typeKey, 'new') }, `New ${t.one.toLowerCase()}`) : null));
      return;
    }
    body.replaceChildren(h('div', { class: 'table-wrap' }, h('table', { class: 'table' }, h('caption', { class: 'sr-only' }, t.label),
      h('thead', {}, h('tr', {}, ...['Name', 'Scope', 'Audience', 'Updated'].map((x) => h('th', { scope: 'col' }, x)))),
      h('tbody', {}, ...res.data.map((r) => h('tr', {},
        h('th', { scope: 'row' }, h('a', { href: hrefFor.record(typeKey, r.id) }, nameOf(typeKey, r) || '(untitled)'), r.archived_at ? [' ', chip('Archived')] : null),
        h('td', {}, scopeLabel(r, ctx.clients)), h('td', {}, audience(r)), h('td', {}, new Date(r.updated_at).toLocaleDateString())))))));
  }
  load();
  return h('section', {}, needsDesign(), pageTitle(t.label, `In ${ctx.orgName}.`),
    h('div', { class: 'toolbar' }, clientSel, arch, h('span', { class: 'spacer' }),
      ctx.can(`funnels.${o}.create`) ? h('a', { class: 'btn primary', href: hrefFor.record(typeKey, 'new') }, `New ${t.one.toLowerCase()}`) : null), body);
}

// ---- record
export function funnelRecordView(ctx, typeKey, id) {
  const t = TYPE[typeKey]; const o = t.obj; const isNew = id === 'new';
  const root = h('div', {}, skeleton(5));
  const back = h('a', { class: 'btn secondary', href: hrefFor.list(typeKey) }, `Back to ${t.label}`);
  let refs = {};

  async function open() {
    const [rec, ...lists] = await Promise.all([
      isNew ? Promise.resolve({ ok: true, data: [{}] }) : run(ctx, `funnels.${typeKey}.get`, { id }),
      ...[...new Set(FIELD_DEFS[typeKey].filter((f) => f.ref).map((f) => f.ref))].map((k) => run(ctx, `funnels.${k}.list`, {}).then((r) => [k, r])),
    ]);
    if (!ctx.live()) return;
    if (!rec.ok) { root.replaceChildren(rec.error?.code === 'not_found' ? notFoundState(back) : errorState(fail(rec), open)); return; }
    refs = Object.fromEntries(lists.map(([k, r]) => [k, r.ok ? r.data : []]));
    draw(rec.data[0]);
  }

  function draw(r, flash) {
    const archived = Boolean(r.archived_at);
    const canEdit = isNew ? ctx.can(`funnels.${o}.create`) : ctx.can(`funnels.${o}.edit`);
    const msg = h('div', { class: 'form-msg', role: 'status', 'aria-live': 'polite' }, flash ?? '');
    const fields = FIELD_DEFS[typeKey].map((f) => {
      const v = r[f.k];
      const base = { id: `r-${f.k}`, label: f.label, required: f.req, hint: f.hint, readonly: !canEdit || archived };
      if (f.options) return field({ ...base, options: f.options, value: v ?? f.options[0][0] });
      if (f.ref) return field({ ...base, options: [['', '— none —'], ...(refs[f.ref] ?? []).map((x) => [x.id, nameOf(f.ref, x)])], value: v ?? '' });
      if (f.list) return field({ ...base, value: (v ?? []).join(', ') });
      if (f.num) return field({ ...base, type: 'number', value: v ?? '' });
      return field({ ...base, rows: f.rows, value: v ?? '', maxlength: f.rows ? 20000 : 200 });
    });
    const scope = isNew ? field({ id: 'r-client', label: 'Belongs to', options: [['', 'Organization-wide'], ...[...ctx.clients].map(([i, n]) => [i, n])], value: '', hint: 'Only records that belong to a client can be shared with that client.' })
      : h('p', {}, h('strong', {}, 'Belongs to: '), scopeLabel(r, ctx.clients), ' ', audience(r));
    const form = h('form', { novalidate: true, onsubmit: (e) => { e.preventDefault(); save(r, form, msg); } }, scope, ...fields,
      canEdit && !archived ? h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'btn primary' }, isNew ? `Create ${t.one.toLowerCase()}` : 'Save'), back) : h('div', { class: 'actions' }, back), msg);
    const side = [];
    if (!isNew) {
      if (!archived && ctx.can(`funnels.${o}.edit`)) side.push(button('Archive', () => act(`funnels.${typeKey}.archive`, { id }, 'Archived.', r), 'secondary'));
      if (archived && ctx.can(`funnels.${o}.edit`)) side.push(button('Restore', () => act(`funnels.${typeKey}.restore`, { id }, 'Restored.', r), 'secondary'));
      if (r.client_id && !archived && ctx.can('funnels.record.share'))
        side.push(button(r.client_visible ? 'Stop sharing with client' : 'Share with client', () => act(`funnels.${typeKey}.share`, { id, visible: !r.client_visible }, r.client_visible ? 'No longer shared.' : 'Shared with the client.', r), 'secondary'));
      if (archived && ctx.can(`funnels.${o}.delete`))
        side.push(button('Delete permanently', () => { if (confirm('Delete this permanently? This cannot be undone.')) act(`funnels.${typeKey}.delete`, { id }, null, r, true); }, 'danger'));
    }
    root.replaceChildren(...[
      archived ? h('p', { class: 'banner', role: 'note' }, 'This record is archived. Restore it to edit.') : null,
      !canEdit && !archived ? h('p', { class: 'banner', role: 'note' }, 'You can view this record but not change it.') : null,
      h('div', { class: 'record' }, form, side.length ? h('aside', { class: 'side', 'aria-label': 'Record actions' }, ...side) : null)].filter(Boolean));   // replaceChildren(null) would print "null"
  }

  async function save(r, form, msg) {
    const data = Object.fromEntries(new FormData(form).entries());
    const input = {};
    for (const f of FIELD_DEFS[typeKey]) {
      const raw = data[`r-${f.k}`] ?? data[f.k]; if (raw === undefined) continue;
      if (f.list) input[f.k] = raw.split(',').map((x) => x.trim()).filter(Boolean);
      else if (f.num) { if (raw !== '') input[f.k] = Number(raw); }
      else if (f.ref || f.k === 'currency') { if (raw !== '') input[f.k] = raw; }
      else input[f.k] = raw;
    }
    if (isNew && data['r-client']) input.client = data['r-client'];
    if (typeKey === 'offers' && (input.price_amount === undefined) !== (input.currency === undefined)) {   // same rule the database enforces, said in plain words first
      const missing = input.price_amount === undefined ? 'price_amount' : 'currency';
      msg.textContent = `Check: ${fieldLabel(missing)}. A price and a currency go together.`; form.querySelector(`#r-${missing}`)?.setAttribute('aria-invalid', 'true'); form.querySelector(`#r-${missing}`)?.focus(); return;
    }
    const btn = form.querySelector('button[type=submit]'); btn.disabled = true; msg.textContent = 'Saving…';
    const res = await run(ctx, isNew ? `funnels.${typeKey}.create` : `funnels.${typeKey}.update`, isNew ? input : { id, ...input });
    if (!ctx.live()) return;
    btn.disabled = false;
    if (res.ok) { ctx.announce(isNew ? `${t.one} created.` : 'Saved.'); if (isNew) ctx.go(hrefFor.record(typeKey, res.data[0].id)); else draw(res.data[0], 'Saved.'); return; }
    const code = fail(res);
    msg.textContent = code === 'invalid' && res.error?.fields ? `Check: ${res.error.fields.map(fieldLabel).join(', ')}.` : messageFor(code);
    if (code === 'invalid') for (const f of res.error?.fields ?? []) form.querySelector(`#r-${f}`)?.setAttribute('aria-invalid', 'true');
  }

  async function act(op, input, done, r, leave) {
    const res = await run(ctx, op, input);
    if (!ctx.live()) return;
    if (!res.ok) { draw(r, messageFor(fail(res))); return; }
    if (leave) { ctx.announce('Deleted.'); ctx.go(hrefFor.list(typeKey)); return; }
    ctx.announce(done); draw(res.data[0], done);
  }

  open();
  return h('section', {}, needsDesign(), pageTitle(isNew ? `New ${t.one.toLowerCase()}` : t.one, ctx.orgName), root);
}
