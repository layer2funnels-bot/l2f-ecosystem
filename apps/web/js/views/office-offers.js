// Office › Funnels › Offers & Products, V8 (prototype office5.js `offers`/`offer`, office6.js `offerNew`): card list, detail, New offer / edit.
// Markup and class names from the prototype (styles: pages/office.css, root .v8p-office). Real data through funnels.offers.*; the row rules
// decide who may see and change what. Every V4 action stays: edit, share with the client, archive / restore, delete permanently.
import { h, put, icon, btn, toast, errorState, notFoundState, skeleton, emptyState, seg } from '../ui.js';
import { hrefFor } from '../routes.js';
import { messageFor } from '../messages.js';
import { dirty } from '../dirty.js';
import { v8head, recordManager } from './funnels.js';

const TYPES = [['service', 'Service'], ['course', 'Course'], ['coaching', 'Coaching'], ['digital', 'Digital product'], ['physical', 'Physical product']];
const BILLING = [['one_off', 'One-off'], ['recurring', 'Recurring'], ['payment_plan', 'Payment plan']];
const STEPS = ['Not on a ladder', 'Free (lead magnet)', 'Low-ticket', 'Core offer', 'Premium'];
const CURRENCIES = ['USD', 'GBP', 'EUR', 'PKR', 'AED'];
const TONES = ['#E8B820', '#FF8A6B', '#A898FF', '#5FDCCB', '#9CC8FF', '#FF9CC8', '#D3F38A', '#FFD27A'];
export const tone = (id) => TONES[[...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0) % TONES.length];
const label = (list, k) => (list.find(([v]) => v === k) ?? [k, ''])[1];
export const price = (o) => (o.price_amount == null ? '—' : new Intl.NumberFormat(undefined, { style: 'currency', currency: o.currency || 'USD', maximumFractionDigits: 0 }).format(o.price_amount));
export const backLink = (href, text) => h('a', { class: 'btn quiet sm backlink', href }, h('span', { style: 'display:inline-flex;transform:scaleX(-1)' }, icon('right')), text);

export function offersListView(ctx) {
  const root = h('div', { class: 'v8p-office' }); const grid = h('div', { class: 'cardgrid' }, skeleton(3));
  const canNew = ctx.canAnywhere('funnels.offer.create'); let show = 'active';
  const load = async () => {
    const r = await ctx.api.call('funnels.offers.list', { archived: show === 'archived' }); if (!ctx.live()) return;
    if (!r.ok) return grid.replaceChildren(errorState(load));
    if (!r.data.length) return grid.replaceChildren(emptyState({ title: show === 'archived' ? 'Nothing archived' : 'No offers yet', body: 'What you sell, from free to premium.', action: canNew && show !== 'archived' ? h('a', { class: 'btn primary', href: '#/office/funnels/offers/new' }, icon('plus'), 'New offer') : null }));
    grid.replaceChildren(...r.data.map((o) => h('a', { class: 'card', href: hrefFor.record('offers', o.id) },
      h('span', { style: 'display:flex;justify-content:space-between;align-items:center' }, h('span', { class: 'wic', style: `--c:${tone(o.id)};color:#16171B` }, icon('offer')), h('b', { style: 'font:700 28px/1 var(--font-d)' }, price(o))),
      h('h3', {}, o.name), o.promise ? h('p', {}, o.promise) : null,
      h('div', { class: 'foot' }, [label(TYPES, o.offer_type) || (o.kind === 'product' ? 'Product' : 'Offer'), o.client_id ? ctx.clients.get(o.client_id) ?? 'Client' : ctx.orgName, o.status === 'draft' ? 'Draft' : null].filter(Boolean).join(' · ')))));
  };
  put(root, v8head('Offers & Products', 'What you sell, from free to premium. Value Ladders and funnel strategies link here.', canNew ? [h('a', { class: 'btn primary', href: '#/office/funnels/offers/new' }, icon('plus'), 'New offer')] : []),
    h('div', { class: 'toolbar' }, seg([['active', 'Active'], ['archived', 'Archived']], show, (k) => { show = k; grid.replaceChildren(skeleton(3)); load(); }, 'Show')), grid);
  load(); return root;
}

export function offerView(ctx, id) {
  const root = h('div', { class: 'v8p-office' }, skeleton(4));
  const view = async (pre) => {
    const r = pre ? { ok: true, data: [pre] } : await ctx.api.call('funnels.offers.get', { id }); if (!ctx.live()) return;
    if (!r.ok || !r.data?.[0]) return put(root, r.ok || r.status === 404 ? notFoundState(hrefFor.funnels(), 'Back to Funnels') : errorState(() => view()));
    const o = r.data[0]; const m = recordManager(ctx, 'offers', { view: (x) => view(x), backTo: hrefFor.list('offers') });
    const canEdit = ctx.can('funnels.offer.edit', o.client_id); const canDel = ctx.can('funnels.offer.delete', o.client_id);
    const avatars = o.avatar_ids?.length ? ((await ctx.api.call('funnels.avatars.list', {})).data ?? []).filter((a) => o.avatar_ids.includes(a.id)) : [];
    const cn = o.client_id ? ctx.clients.get(o.client_id) ?? 'the client' : null;
    const acts = [canEdit && !o.archived_at ? h('a', { class: 'btn ink sm', href: `#/office/funnels/offers/${o.id}/edit` }, icon('edit'), 'Edit') : null,
      ctx.can('funnels.record.share', o.client_id) && o.client_id && !o.archived_at ? (o.client_visible ? btn('Stop sharing', () => m.unshare(o, cn), 'ghost sm') : btn('Share with client', () => m.share(o), 'ghost sm')) : null,
      canEdit ? (o.archived_at ? btn([icon('undo'), 'Restore'], () => m.act(o, 'restore', 'Restored.'), 'ghost sm') : btn([icon('archive'), 'Archive'], () => m.confirmArchive(o), 'ghost sm')) : null,
      canDel && o.archived_at ? btn([icon('trash'), 'Delete permanently'], () => m.del(o), 'dng sm') : null].filter(Boolean);
    put(root, h('div', { class: 'pagehead' }, backLink(hrefFor.list('offers'), 'All offers'), acts.length ? h('div', { class: 'acts' }, ...acts) : null),
      h('div', { class: 'split', style: 'margin-top:12px' },
        h('div', { class: 'stackcol' },
          h('section', { class: 'panel', style: `padding:26px;background:linear-gradient(140deg,color-mix(in srgb,${tone(o.id)} 22%,var(--surface)),var(--surface))` },
            h('p', { class: 'over' }, o.archived_at ? 'Offer · archived' : o.status === 'draft' ? 'Offer · draft' : 'Offer'), h('h1', { class: 'h1', style: 'margin:8px 0', 'data-page-title': true }, o.name),
            o.promise ? h('p', { style: 'font:italic 400 22px/1.35 var(--font)' }, o.promise) : null,
            h('div', { style: 'display:flex;gap:18px;align-items:baseline;margin-top:20px' }, h('b', { style: 'font:700 54px/1 var(--font-d);letter-spacing:-.04em' }, price(o)),
              h('span', { class: 'tx2' }, [label(BILLING, o.billing), label(TYPES, o.offer_type)].filter(Boolean).join(' · ')))),
          h('section', { class: 'panel', style: 'padding:20px' }, h('p', { class: 'sec-t', style: 'margin-top:0' }, 'What’s included'),
            (o.included ?? []).length ? h('ul', { class: 'ticks' }, ...o.included.map((x) => h('li', {}, icon('check'), x))) : h('p', { class: 'hint' }, 'Nothing listed yet.'),
            o.bonuses ? h('p', { class: 'hint', style: 'margin-top:10px' }, `Bonuses: ${o.bonuses}`) : null)),
        h('div', { class: 'stackcol' },
          h('section', { class: 'panel', style: 'padding:18px 20px' }, h('dl', { class: 'kv2' },
            h('dt', {}, 'Who it’s for'), h('dd', {}, cn ?? ctx.orgName),
            h('dt', {}, 'Avatar'), h('dd', {}, ...(avatars.length ? avatars.flatMap((a, i) => [i ? ', ' : '', h('a', { href: hrefFor.record('avatars', a.id) }, a.name)]) : ['—'])),
            h('dt', {}, 'Value Ladder'), h('dd', {}, o.ladder_step || 'Not on a ladder'),
            h('dt', {}, 'Guarantee'), h('dd', {}, o.guarantee || '—'), h('dt', {}, 'Delivery'), h('dd', {}, o.delivery_time || '—'))),
          o.internal_notes != null && o.internal_notes !== '' ? h('section', { class: 'panel', style: 'padding:18px 20px;background:var(--sunk);box-shadow:none' },
            h('p', { class: 'sec-t', style: 'margin-top:0' }, icon('lock'), 'Internal notes · never shared'), h('p', { class: 'hint' }, o.internal_notes)) : null)));
  };
  view(); return root;
}

/** New offer, or edit one (same form). Focused layout: Cancel · Save draft · Create offer, numbered sections, sticky live preview. */
export function offerFormView(ctx, id = null) {
  const root = h('div', { class: 'v8p-office' }, skeleton(4));
  const back = id ? hrefFor.record('offers', id) : hrefFor.list('offers');
  root.__focused = { title: id ? 'Edit offer' : 'New offer or product', sub: 'Office › Funnels › Offers & Products', back, actions: [h('a', { class: 'btn quiet sm', href: back }, 'Cancel')] };
  (async () => {
    const [cur, avs] = await Promise.all([id ? ctx.api.call('funnels.offers.get', { id }) : { ok: true, data: [{}] }, ctx.api.call('funnels.avatars.list', {})]);
    if (!ctx.live()) return;
    if (!cur.ok || !cur.data?.[0]) return put(root, cur.ok || cur.status === 404 ? notFoundState(hrefFor.funnels(), 'Back to Funnels') : errorState(() => ctx.rerender()));
    const markDirty = () => dirty.set(id ? 'this offer' : 'the new offer', () => save(!id, true));   // leaving: a new offer is kept as a draft
    const o = cur.data[0]; const st = { included: [...(o.included ?? [])], avatar_ids: [...(o.avatar_ids ?? [])], billing: o.billing ?? 'one_off' };
    const inp = (lbl, val = '', attrs = {}) => { const i = h('input', { value: val ?? '', ...attrs }); return [h('div', { class: 'field' }, h('label', {}, lbl, attrs.required ? h('i', { class: 'req' }, ' *') : null), i), i]; };
    const sel = (lbl, opts, val) => { const s = h('select', {}, ...opts.map(([v, l]) => h('option', { value: v }, l))); if (val) s.value = val; return [h('div', { class: 'field' }, h('label', {}, lbl), s), s]; };
    const [fName, name] = inp('Name', o.name, { placeholder: 'e.g. Funnel Done-For-You', required: true, maxlength: 200 });
    const [fType, type] = sel('Type', TYPES, o.offer_type ?? 'service'); const [fStat, status] = sel('Status', [['draft', 'Draft'], ['active', 'Active']], o.status ?? 'draft');
    const who = id ? null : h('select', {}, h('option', { value: '' }, ctx.orgName), ...ctx.clientsWhere('funnels.offer.create').map(([i, n]) => h('option', { value: i }, `A client: ${n}`)));
    const [fProm, promise] = inp('Promise (one line)', o.promise, { placeholder: 'A finished funnel that books calls, in 30 days.', maxlength: 400 });
    const [fPrice, priceIn] = inp('Price', o.price_amount ?? '', { placeholder: '3,000', inputmode: 'decimal' }); const [fCur, cur2] = sel('Currency', CURRENCIES.map((c) => [c, c]), o.currency ?? 'USD');
    const billing = h('div', { class: 'seg3', role: 'radiogroup', 'aria-label': 'Billing' });
    const paintBill = () => billing.replaceChildren(...BILLING.map(([k, l]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(k === st.billing), onclick: () => { st.billing = k; paintBill(); paintPrev(); markDirty(); } }, l))); paintBill();
    const [fGuar, guarantee] = inp('Guarantee', o.guarantee, { placeholder: '30 days of fixes', maxlength: 300 }); const [fDel, delivery] = inp('Delivery time', o.delivery_time, { placeholder: '30 days', maxlength: 120 });
    const incl = h('div', { class: 'edtable' });
    const paintIncl = () => incl.replaceChildren(...st.included.map((x, i) => { const v = h('input', { value: x, 'aria-label': `Included item ${i + 1}`, maxlength: 300, oninput: (e) => { st.included[i] = e.target.value; markDirty(); } });
      return h('div', { class: 'edr' }, h('span', { class: 'grip' }, icon('grip')), v, h('button', { class: 'iconbtn xs', type: 'button', 'aria-label': `Remove ${x || 'item'}`, onclick: () => { st.included.splice(i, 1); paintIncl(); markDirty(); } }, icon('trash'))); }),
    h('button', { class: 'addrow', type: 'button', onclick: () => { st.included.push(''); paintIncl(); incl.querySelector('.edr:last-of-type input')?.focus(); } }, icon('plus'), 'Add item'));
    paintIncl();
    const [fBon, bonuses] = inp('Bonuses', o.bonuses, { placeholder: 'Optional', maxlength: 2000 });
    const chips = h('div', { class: 'chipsel' }, ...((avs.ok ? avs.data : []).map((a) => h('button', { type: 'button', class: `chip ${st.avatar_ids.includes(a.id) ? 'on' : ''}`.trim(), 'aria-pressed': String(st.avatar_ids.includes(a.id)),
      onclick: (e) => { const on = !st.avatar_ids.includes(a.id); st.avatar_ids = on ? [...st.avatar_ids, a.id] : st.avatar_ids.filter((x) => x !== a.id); e.currentTarget.classList.toggle('on', on); e.currentTarget.setAttribute('aria-pressed', String(on)); markDirty(); } }, a.name))));
    const [fLad, ladder] = sel('Value Ladder step', STEPS.map((s) => [s, s]), o.ladder_step ?? 'Not on a ladder');
    const notes = h('textarea', { placeholder: 'Never shared with clients', maxlength: 8000 }); notes.value = o.internal_notes ?? '';
    const prev = h('div', { class: 'card6 pad-s', style: 'background:linear-gradient(140deg,color-mix(in srgb,#FFC633 20%,var(--surface)),var(--surface))' });
    const paintPrev = () => prev.replaceChildren(h('b', { style: 'font:700 20px var(--font-d)' }, name.value || 'Your offer'), h('p', { style: 'font:italic 16px var(--font)' }, promise.value || 'The one-line promise.'),
      h('b', { class: 'mono', style: 'font-size:28px' }, priceIn.value ? price({ price_amount: Number(String(priceIn.value).replace(/[^0-9.]/g, '')) || 0, currency: cur2.value }) : '—'),
      h('small', { class: 'muted' }, [label(BILLING, st.billing), label(TYPES, type.value)].join(' · ')));
    for (const el of [name, promise, priceIn, cur2, type]) el.addEventListener('input', () => { paintPrev(); markDirty(); });
    paintPrev();
    const sections = [['Basics', [fName, h('div', { class: 'row2' }, fType, fStat), fProm, ...(who ? [h('div', { class: 'field' }, h('label', {}, 'Belongs to'), who)] : [])]], ['Price and terms', [h('div', { class: 'row2' }, fPrice, fCur), billing, h('div', { class: 'row2' }, fGuar, fDel)]],
      ['What’s included', [incl, fBon]], ['Who it’s for', [h('div', { class: 'field' }, h('label', {}, 'Customer avatars'), chips.childElementCount ? chips : h('p', { class: 'hint' }, 'No customer avatars yet.')), fLad]],
      ['Internal notes', [h('div', { class: 'field' }, notes)]]];
    const save = async (asDraft, leaving = false) => {
      if (!name.value.trim()) { name.focus(); toast('Give the offer a name.', false); return; }
      const amount = String(priceIn.value).trim() ? Number(String(priceIn.value).replace(/[^0-9.]/g, '')) : null;
      const body = { name: name.value.trim(), offer_type: type.value, status: asDraft ? 'draft' : status.value === 'draft' && !id ? 'active' : status.value, promise: promise.value.trim(), billing: st.billing, guarantee: guarantee.value.trim(), delivery_time: delivery.value.trim(),
        included: st.included.map((x) => x.trim()).filter(Boolean), bonuses: bonuses.value.trim(), avatar_ids: st.avatar_ids, ladder_step: ladder.value, internal_notes: notes.value, ...(amount != null && !Number.isNaN(amount) ? { price_amount: amount, currency: cur2.value } : {}) };
      const r = await ctx.api.call(id ? 'funnels.offers.update' : 'funnels.offers.create', id ? { id, ...body } : { kind: 'offer', ...body, ...(who?.value ? { client: who.value } : {}) });
      if (!r.ok) return toast(messageFor(r.error?.code), false);
      dirty.clear(); toast(id ? 'Offer saved.' : asDraft ? 'Saved as draft.' : 'Offer created.'); if (!leaving) ctx.go(hrefFor.record('offers', r.data[0].id)); return true;
    };
    root.__focused.actions.splice(0, root.__focused.actions.length, h('a', { class: 'btn quiet sm', href: back }, 'Cancel'), ...(id ? [] : [btn('Save draft', () => save(true), 'ghost sm')]), btn(id ? 'Save offer' : 'Create offer', () => save(false), 'primary sm'));
    document.querySelector('.focusbar-acts')?.replaceChildren(...root.__focused.actions);
    put(root, h('div', { class: 'formpage' }, h('div', { class: 'formcol' }, ...sections.map(([t, c], i) => h('section', { class: 'fsec6' }, h('h3', {}, h('span', {}, String(i + 1)), t), ...c))),
      h('aside', { class: 'formprev' }, h('p', { class: 'over' }, 'Preview'), prev)));
    name.focus();
  })();
  return root;
}
