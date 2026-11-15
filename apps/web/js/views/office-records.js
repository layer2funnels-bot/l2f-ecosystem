// Office › Funnels › Stories and Brand Kits, V8 (prototype office5.js `stories`, office6.js `storyNew`, `brandkits`, `brandkit`, `brandkitNew`, funnels5.js `brandKit`).
// Real data through funnels.stories.* / funnels.brand_kits.*; row rules decide. Every V4 action stays (edit, share, archive / restore, delete permanently).
import { h, put, icon, btn, toast, errorState, notFoundState, skeleton, emptyState, seg } from '../ui.js';
import { hrefFor } from '../routes.js';
import { messageFor } from '../messages.js';
import { dirty } from '../dirty.js';
import { v8head, recordManager } from './funnels.js';
import { backLink } from './office-offers.js';
import { saveCopy } from '../modules/mediaio.js';

const KINDS = [['case_study', 'Case study'], ['testimonial', 'Testimonial'], ['origin', 'Origin story']];
const KIND_LABEL = { case_study: 'Case study', testimonial: 'Testimonial', origin: 'Origin story', analogy: 'Analogy', other: 'Story' };
const PERMS = [['given', 'Consent given'], ['ask', 'Ask consent'], ['anonymous', 'Anonymous only']];
const USES = ['Sales page', 'Emails', 'Ads', 'Webinar', 'Checkout'];
const HEAD_FONTS = ['Bricolage Grotesque', 'Montserrat', 'Playfair Display', 'Newsreader', 'Geist'];
const BODY_FONTS = ['Geist', 'Inter', 'Newsreader'];
const HEX = /^#[0-9a-f]{6}$/i;

const consentPill = (s) => (s.permission === 'given' ? h('span', { class: 'pill blue', style: 'height:22px' }, icon('check'), 'Consent')
  : s.permission === 'anonymous' ? h('span', { class: 'pill', style: 'height:22px' }, 'Anonymous') : h('span', { class: 'pill warn', style: 'height:22px' }, icon('alert'), 'Ask consent'));
const field = (lbl, el, req) => h('div', { class: 'field' }, h('label', {}, lbl, req ? h('i', { class: 'req' }, ' *') : null), el);
const seg3 = (opts, cur, on, onDirty = () => {}) => { const box = h('div', { class: 'seg3', role: 'radiogroup' });
  const paint = (v) => box.replaceChildren(...opts.map(([k, l]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(k === v), onclick: () => { paint(k); on(k); onDirty(); } }, l))); paint(cur); return box; };
const sections = (list) => list.map(([t, c], i) => h('section', { class: 'fsec6' }, h('h3', {}, h('span', {}, String(i + 1)), t), ...c));
/** "Belongs to": organization-wide or a client the user may create for (new records only — moving a record between owners is not allowed). */
const belongsTo = (ctx, perm) => { const s = h('select', {}, h('option', { value: '' }, ctx.orgName), ...ctx.clientsWhere(perm).map(([i, n]) => h('option', { value: i }, `A client: ${n}`))); return s; };
const focusedActions = (root, acts) => { root.__focused.actions.splice(0, root.__focused.actions.length, ...acts); document.querySelector('.focusbar-acts')?.replaceChildren(...acts); };
const detailActs = (ctx, r, m, perm, editHref) => {
  const canEdit = ctx.can(`funnels.${perm}.edit`, r.client_id); const canDel = ctx.can(`funnels.${perm}.delete`, r.client_id); const cn = r.client_id ? ctx.clients.get(r.client_id) ?? 'the client' : null;
  return [canEdit && !r.archived_at ? h('a', { class: 'btn ink sm', href: editHref }, icon('edit'), 'Edit') : null,
    ctx.can('funnels.record.share', r.client_id) && r.client_id && !r.archived_at ? (r.client_visible ? btn('Stop sharing', () => m.unshare(r, cn), 'ghost sm') : btn('Share with client', () => m.share(r), 'ghost sm')) : null,
    canEdit ? (r.archived_at ? btn([icon('undo'), 'Restore'], () => m.act(r, 'restore', 'Restored.'), 'ghost sm') : btn([icon('archive'), 'Archive'], () => m.confirmArchive(r), 'ghost sm')) : null,
    canDel && r.archived_at ? btn([icon('trash'), 'Delete permanently'], () => m.del(r), 'dng sm') : null].filter(Boolean);
};
const listPage = (ctx, { type, title, lede, perm, newHref, newLabel, card, empty, extra }) => {
  const root = h('div', { class: 'v8p-office' }); const grid = h('div', { class: 'cardgrid' }, skeleton(3)); let show = 'active';
  const canNew = ctx.canAnywhere(`funnels.${perm}.create`);
  const newBtn = () => h('a', { class: 'btn primary', href: newHref }, icon('plus'), newLabel);
  const load = async () => {
    const r = await ctx.api.call(`funnels.${type}.list`, { archived: show === 'archived' }); if (!ctx.live()) return;
    if (!r.ok) return grid.replaceChildren(errorState(load));
    if (!r.data.length) return grid.replaceChildren(emptyState({ title: show === 'archived' ? 'Nothing archived' : empty, body: lede, action: canNew && show !== 'archived' ? newBtn() : null }));
    grid.replaceChildren(...r.data.map(card), ...(extra && canNew && show !== 'archived' ? [extra()] : []));
  };
  put(root, v8head(title, lede, canNew ? [newBtn()] : []), h('div', { class: 'toolbar' }, seg([['active', 'Active'], ['archived', 'Archived']], show, (k) => { show = k; grid.replaceChildren(skeleton(3)); load(); }, 'Show')), grid);
  load(); return root;
};

// ---------------- Stories
export const storiesListView = (ctx) => listPage(ctx, { type: 'stories', perm: 'story', title: 'Stories', lede: 'Case studies, origin stories and testimonials, with permission status.', newHref: '#/office/funnels/stories/new', newLabel: 'New story', empty: 'No stories yet',
  card: (s) => h('a', { class: 'card', href: hrefFor.record('stories', s.id) }, h('span', { class: 'tag', style: 'justify-self:start' }, KIND_LABEL[s.kind] ?? 'Story'),
    h('h3', { style: "font:600 22px/1.25 'Newsreader',serif" }, s.title), s.before_text || s.after_text ? h('p', {}, [s.before_text, s.after_text].filter(Boolean).join(' → ')) : s.body ? h('p', {}, s.body.slice(0, 160)) : null,
    h('div', { class: 'foot' }, icon('map'), s.client_id ? ctx.clients.get(s.client_id) ?? 'Client' : ctx.orgName, h('span', { style: 'margin-left:auto' }, consentPill(s)))) });

export function storyView(ctx, id) {
  const root = h('div', { class: 'v8p-office' }, skeleton(4));
  const view = async (pre) => {
    const r = pre ? { ok: true, data: [pre] } : await ctx.api.call('funnels.stories.get', { id }); if (!ctx.live()) return;
    if (!r.ok || !r.data?.[0]) return put(root, r.ok || r.status === 404 ? notFoundState(hrefFor.funnels(), 'Back to Funnels') : errorState(() => view()));
    const s = r.data[0]; const m = recordManager(ctx, 'stories', { view: (x) => view(x), backTo: hrefFor.list('stories') });
    const acts = detailActs(ctx, s, m, 'story', `#/office/funnels/stories/${s.id}/edit`);
    put(root, h('div', { class: 'pagehead' }, backLink(hrefFor.list('stories'), 'All stories'), acts.length ? h('div', { class: 'acts' }, ...acts) : null),
      h('div', { class: 'split', style: 'margin-top:12px' },
        h('div', { class: 'stackcol' }, h('section', { class: 'panel', style: 'padding:26px' },
          h('p', { class: 'over' }, `${KIND_LABEL[s.kind] ?? 'Story'}${s.archived_at ? ' · archived' : ''}`), h('h1', { class: 'h1', style: "margin:8px 0;font:600 34px/1.2 'Newsreader',serif", 'data-page-title': true }, s.title),
          s.best_quote ? h('p', { style: 'font:italic 400 22px/1.35 var(--font)' }, `“${s.best_quote.replace(/^[“"]|[”"]$/g, '')}”`) : null,
          s.body ? h('p', { class: 'tx2', style: 'white-space:pre-wrap;margin-top:14px' }, s.body) : null)),
        h('div', { class: 'stackcol' }, h('section', { class: 'panel', style: 'padding:18px 20px' }, h('dl', { class: 'kv2' },
          h('dt', {}, 'About'), h('dd', {}, s.client_id ? ctx.clients.get(s.client_id) ?? 'A client' : ctx.orgName),
          h('dt', {}, 'Before'), h('dd', {}, s.before_text || '—'), h('dt', {}, 'After'), h('dd', {}, s.after_text || '—'),
          h('dt', {}, 'Permission'), h('dd', {}, consentPill(s)), h('dt', {}, 'Use in'), h('dd', {}, s.use_in?.length ? s.use_in.join(', ') : '—'))))));
  };
  view(); return root;
}

export function storyFormView(ctx, id = null) {
  const root = h('div', { class: 'v8p-office' }, skeleton(4)); const back = id ? hrefFor.record('stories', id) : hrefFor.list('stories');
  root.__focused = { title: id ? 'Edit story' : 'New story', sub: 'Office › Funnels › Stories', back, actions: [h('a', { class: 'btn quiet sm', href: back }, 'Cancel')] };
  (async () => {
    const cur = id ? await ctx.api.call('funnels.stories.get', { id }) : { ok: true, data: [{}] }; if (!ctx.live()) return;
    if (!cur.ok || !cur.data?.[0]) return put(root, cur.ok || cur.status === 404 ? notFoundState(hrefFor.funnels(), 'Back to Funnels') : errorState(() => ctx.rerender()));
    const markDirty = () => dirty.set(id ? 'this story' : 'the new story', () => save(true));
    const s = cur.data[0]; const st = { kind: KINDS.some(([k]) => k === s.kind) ? s.kind : 'case_study', permission: s.permission ?? 'given', use_in: [...(s.use_in ?? [])], consent: s.consent_file_id ?? null };
    const title = h('input', { value: s.title ?? '', placeholder: 'From 0 to 41 booked calls', maxlength: 200 });
    const who = id ? null : belongsTo(ctx, 'funnels.story.create');
    const body = h('textarea', { rows: 5, maxlength: 20000 }); body.value = s.body ?? '';
    const before = h('input', { value: s.before_text ?? '', placeholder: '2 calls a week', maxlength: 500 }); const after = h('input', { value: s.after_text ?? '', placeholder: '41 calls in 30 days', maxlength: 500 });
    const quote = h('input', { value: s.best_quote ?? '', placeholder: '“It finally sounds like me.”', maxlength: 1000 });
    const consentName = h('small', { class: 'muted', style: 'margin-left:8px' }, st.consent ? 'Consent attached.' : '');
    const pick = h('input', { type: 'file', hidden: true, accept: '.pdf,.png,.jpg,.jpeg,.eml,.txt,.docx', onchange: async (e) => {
      const f = e.target.files?.[0]; if (!f) return; consentName.textContent = 'Uploading…';
      const r = await saveCopy(ctx.api, { space: 'shared', client_id: who?.value || s.client_id || null }, f, f.type || 'application/octet-stream', f.name);
      if (!r.ok) { consentName.textContent = ''; return toast(r.message ?? messageFor(r.error?.code), false); }
      st.consent = r.data[0].id; consentName.textContent = `${f.name} attached.`; markDirty(); } });
    const chips = h('div', { class: 'chipsel' }, ...USES.map((u) => h('button', { type: 'button', class: `chip ${st.use_in.includes(u) ? 'on' : ''}`.trim(), 'aria-pressed': String(st.use_in.includes(u)),
      onclick: (e) => { const on = !st.use_in.includes(u); st.use_in = on ? [...st.use_in, u] : st.use_in.filter((x) => x !== u); e.currentTarget.classList.toggle('on', on); e.currentTarget.setAttribute('aria-pressed', String(on)); markDirty(); } }, u)));
    for (const el of [title, body, before, after, quote]) el.addEventListener('input', () => markDirty());
    const save = async (leaving = false) => {
      if (!title.value.trim()) { title.focus(); return toast('Give the story a headline.', false); }
      const b = { title: title.value.trim(), kind: st.kind, body: body.value, before_text: before.value.trim(), after_text: after.value.trim(), best_quote: quote.value.trim(), permission: st.permission, use_in: st.use_in, ...(st.consent ? { consent_file_id: st.consent } : {}) };
      const r = await ctx.api.call(id ? 'funnels.stories.update' : 'funnels.stories.create', id ? { id, ...b } : { ...b, ...(who?.value ? { client: who.value } : {}) });
      if (!r.ok) return toast(messageFor(r.error?.code), false);
      dirty.clear(); toast('Story saved.'); if (!leaving) ctx.go(hrefFor.record('stories', r.data[0].id)); return true;
    };
    focusedActions(root, [h('a', { class: 'btn quiet sm', href: back }, 'Cancel'), btn('Save story', save, 'primary sm')]);
    put(root, h('div', { class: 'formpage' }, h('div', { class: 'formcol' }, ...sections([
      ['The story', [seg3(KINDS, st.kind, (k) => { st.kind = k; }, markDirty), field('Headline', title, true), who ? field('Who is it about?', who) : null, field('The story', body)].filter(Boolean)],
      ['Before → after', [h('div', { class: 'row2' }, field('Before', before), field('After', after)), field('Best quote', quote)]],
      ['Permission', [seg3(PERMS, st.permission, (k) => { st.permission = k; }, markDirty), h('div', { style: 'margin-top:8px;display:flex;align-items:center' }, btn([icon('upload'), 'Attach consent (email or form)'], () => pick.click(), 'ghost sm'), consentName, pick)]],
      ['Where to use it', [chips]]]))));
    title.focus();
  })();
  return root;
}

// ---------------- Brand Kits
const swatches = (k) => h('span', { class: 'bk-sw' }, ...(k.colors ?? []).slice(0, 6).map((c) => h('i', { style: `--c:${c}` })));
const fileImg = async (ctx, fid, alt) => { if (!fid) return null; const r = await ctx.api.call('drive.files.download', { id: fid }); return r.ok && r.data?.[0]?.url ? h('img', { src: r.data[0].url, alt, style: 'max-width:100%;max-height:72px;object-fit:contain' }) : null; };

export const brandKitsListView = (ctx) => listPage(ctx, { type: 'brand_kits', perm: 'brandkit', title: 'Brand Kits', lede: `One kit per brand: ${ctx.orgName}, each product line, or a client you manage.`, newHref: '#/office/funnels/brand_kits/new', newLabel: 'New brand kit', empty: 'No brand kits yet',
  card: (k) => h('a', { class: 'card6 bkc', href: hrefFor.record('brand_kits', k.id) }, swatches(k), h('b', {}, k.name, k.is_main ? h('span', { class: 'pill', style: 'height:20px;margin-left:6px' }, 'Main') : null),
    h('small', { class: 'muted' }, [(k.fonts ?? []).join(' · '), k.client_id ? ctx.clients.get(k.client_id) ?? 'Client' : null].filter(Boolean).join(' · ') || ' ')),
  extra: () => h('a', { class: 'card6 bkc add', href: '#/office/funnels/brand_kits/new' }, icon('plus'), h('b', {}, 'New brand kit')) });

export function brandKitView(ctx, id) {
  const root = h('div', { class: 'v8p-office' }, skeleton(4));
  const view = async (pre) => {
    const r = pre ? { ok: true, data: [pre] } : await ctx.api.call('funnels.brand_kits.get', { id }); if (!ctx.live()) return;
    if (!r.ok || !r.data?.[0]) return put(root, r.ok || r.status === 404 ? notFoundState(hrefFor.funnels(), 'Back to Funnels') : errorState(() => view()));
    const k = r.data[0]; const m = recordManager(ctx, 'brand_kits', { view: (x) => view(x), backTo: hrefFor.list('brand_kits') });
    const canNew = ctx.can('funnels.brandkit.create', k.client_id); const canEdit = ctx.can('funnels.brandkit.edit', k.client_id);
    const dup = async () => { const { id: _i, workspace_id: _w, created_at: _c, updated_at: _u, archived_at: _a, client_visible: _v, client_id, is_main: _m, ...rest } = k;
      const d = await ctx.api.call('funnels.brand_kits.create', { ...rest, name: `${k.name} (copy)`.slice(0, 200), ...(client_id ? { client: client_id } : {}) });
      if (!d.ok) return toast(messageFor(d.error?.code), false); toast('Duplicated.'); ctx.go(hrefFor.record('brand_kits', d.data[0].id)); };
    const makeMain = async () => { const all = await ctx.api.call('funnels.brand_kits.list', {}); for (const o of (all.data ?? []).filter((x) => x.is_main && !x.client_id && x.id !== k.id)) await ctx.api.call('funnels.brand_kits.update', { id: o.id, is_main: false });
      const u = await ctx.api.call('funnels.brand_kits.update', { id: k.id, is_main: true }); if (!u.ok) return toast(messageFor(u.error?.code), false); toast(`${k.name} is now the main kit.`); view(u.data[0]); };
    const acts = [canNew && !k.archived_at ? btn([icon('copy'), 'Duplicate'], dup, 'ghost sm') : null, canEdit && !k.client_id && !k.is_main && !k.archived_at ? btn('Make main kit', makeMain, 'ghost sm') : null, ...detailActs(ctx, k, m, 'brandkit', `#/office/funnels/brand_kits/${k.id}/edit`)].filter(Boolean);
    const names = k.color_names ?? []; const [hf, bf] = [k.fonts?.[0], k.fonts?.[1]];
    const logo = h('div', { style: 'min-width:72px' }, icon('brand')); fileImg(ctx, k.logo_file_id, `${k.name} logo`).then((i) => i && logo.replaceChildren(i));
    put(root, backLink(hrefFor.list('brand_kits'), 'Brand Kits'), h('div', { class: 'ph6', style: 'margin-top:8px' }, h('h1', { class: 't1', 'data-page-title': true }, k.name, k.is_main ? h('span', { class: 'pill', style: 'height:22px;margin-left:8px;vertical-align:middle' }, 'Main') : null), acts.length ? h('div', { class: 'acts' }, ...acts) : null),
      h('div', { class: 'grid2', style: 'margin-bottom:20px' },
        h('section', { class: 'panel', style: 'padding:20px' }, h('p', { class: 'sec-t', style: 'margin-top:0' }, 'Colours'), (k.colors ?? []).length ? h('div', { class: 'grid3', style: 'gap:12px' }, ...k.colors.map((c, i) => h('div', { class: 'swatch', style: `--c:${c}` }, h('i'), h('b', { style: 'font-size:14px' }, names[i] || `Colour ${i + 1}`), h('span', { class: 'mono muted', style: 'font-size:12px' }, c)))) : h('p', { class: 'hint' }, 'No colours yet.')),
        h('section', { class: 'panel', style: 'padding:20px' }, h('p', { class: 'sec-t', style: 'margin-top:0' }, 'Fonts'), hf ? [h('p', { style: `font:700 40px/1 '${hf}',var(--font-d);letter-spacing:-.04em` }, `Aa ${hf.split(' ')[0]}`), h('p', { class: 'muted', style: 'margin:6px 0 14px' }, 'Headlines')] : null,
          bf ? [h('p', { style: `font:500 26px/1 '${bf}',var(--font)` }, `Aa ${bf}`), h('p', { class: 'muted', style: 'margin-top:6px' }, 'Body and interface')] : null, !hf && !bf ? h('p', { class: 'hint' }, 'No fonts chosen yet.') : null)),
      h('div', { class: 'grid2' },
        h('section', { class: 'panel', style: 'padding:20px' }, h('p', { class: 'sec-t', style: 'margin-top:0' }, 'Voice and tone'),
          k.voice ? h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px' }, ...k.voice.split(/[,·]/).map((t) => t.trim()).filter(Boolean).slice(0, 8).map((t) => h('span', { class: 'tag' }, t))) : null,
          k.notes ? h('p', { class: 'tx2' }, k.notes) : null,
          h('div', { class: 'grid2', style: 'gap:10px;margin-top:14px' }, k.voice_say ? h('div', { class: 'notice blue', style: 'font-size:13.5px' }, icon('check'), h('span', {}, `“${k.voice_say}”`)) : null, k.voice_never ? h('div', { class: 'notice danger', style: 'font-size:13.5px' }, icon('x'), h('span', {}, `“${k.voice_never}”`)) : null)),
        h('section', { class: 'panel', style: 'padding:20px' }, h('p', { class: 'sec-t', style: 'margin-top:0' }, 'Logo notes'), h('div', { style: 'display:flex;gap:16px;align-items:center;margin-bottom:12px' }, logo,
          h('div', { class: 'tx2', style: 'font-size:14px' }, k.logo_file_id ? 'Logo files are kept in Drive.' : 'No logo uploaded yet.')),
          canEdit && !k.archived_at ? h('a', { class: 'btn ghost sm', href: `#/office/funnels/brand_kits/${k.id}/edit` }, icon('upload'), 'Upload logo files') : null)));
  };
  view(); return root;
}

export function brandKitFormView(ctx, id = null) {
  const root = h('div', { class: 'v8p-office' }, skeleton(4)); const back = id ? hrefFor.record('brand_kits', id) : hrefFor.list('brand_kits');
  root.__focused = { title: id ? 'Edit brand kit' : 'New brand kit', sub: 'Office › Funnels › Brand Kits', back, actions: [h('a', { class: 'btn quiet sm', href: back }, 'Cancel')] };
  (async () => {
    const cur = id ? await ctx.api.call('funnels.brand_kits.get', { id }) : { ok: true, data: [{}] }; if (!ctx.live()) return;
    if (!cur.ok || !cur.data?.[0]) return put(root, cur.ok || cur.status === 404 ? notFoundState(hrefFor.funnels(), 'Back to Funnels') : errorState(() => ctx.rerender()));
    const markDirty = () => dirty.set(id ? 'this brand kit' : 'the new brand kit', () => save(true));
    const k = cur.data[0]; const fresh = !id;
    const st = { colors: fresh ? [['Primary', '#2B63F6'], ['Accent', '#FFC633'], ['Text', '#16171B'], ['Background', '#F3F1EB']] : (k.colors ?? []).map((c, i) => [k.color_names?.[i] ?? '', c]),
      logo: k.logo_file_id ?? null, dark: k.logo_dark_file_id ?? null, icon: k.icon_file_id ?? null, assets: [...(k.asset_file_ids ?? [])] };
    const name = h('input', { value: k.name ?? '', placeholder: 'e.g. Funnel Done Right Challenge', maxlength: 200 });
    const who = id ? null : belongsTo(ctx, 'funnels.brandkit.create');
    const upload = async (f) => { const r = await saveCopy(ctx.api, { space: 'shared', client_id: who?.value || k.client_id || null }, f, f.type || 'application/octet-stream', f.name); if (!r.ok) { toast(r.message ?? messageFor(r.error?.code), false); return null; } markDirty(); return r.data[0].id; };
    const drop = (lbl, key, dark) => { const box = h('label', { class: `logodrop ${dark ? 'dark' : ''}`.trim() }); const inp = h('input', { type: 'file', hidden: true, accept: 'image/svg+xml,image/png', onchange: async (e) => { const f = e.target.files?.[0]; if (!f) return; small.textContent = 'Uploading…'; const fid = await upload(f); if (fid) { st[key] = fid; small.textContent = `${f.name} uploaded.`; } else small.textContent = 'SVG or PNG, at least 512 px'; } });
      const small = h('small', {}, st[key] ? 'Uploaded. Choose a file to replace it.' : 'SVG or PNG, at least 512 px'); box.append(icon('upload'), h('b', {}, lbl), small, inp); return box; };
    const iconNote = h('small', { class: 'muted', style: 'margin-left:8px' }, st.icon ? 'Icon uploaded.' : '');
    const iconIn = h('input', { type: 'file', hidden: true, accept: 'image/svg+xml,image/png,image/x-icon', onchange: async (e) => { const f = e.target.files?.[0]; if (!f) return; const fid = await upload(f); if (fid) { st.icon = fid; iconNote.textContent = `${f.name} uploaded.`; } } });
    const assetNote = h('small', { class: 'muted', style: 'margin-left:8px' }, st.assets.length ? `${st.assets.length} file${st.assets.length > 1 ? 's' : ''} attached.` : '');
    const assetIn = h('input', { type: 'file', hidden: true, multiple: true, onchange: async (e) => { for (const f of e.target.files ?? []) { if (st.assets.length >= 50) break; const fid = await upload(f); if (fid) st.assets.push(fid); } assetNote.textContent = `${st.assets.length} file${st.assets.length === 1 ? '' : 's'} attached.`; } });
    const rows = h('div', { class: 'colrows' });
    const paintRows = () => { rows.replaceChildren(...st.colors.map(([role, c], i) => { const sw = h('span', { class: 'csw', style: `--c:${c}` });
      return h('div', { class: 'edr' }, sw, h('input', { value: role, class: 'sm-in', style: 'width:130px', 'aria-label': `Colour ${i + 1} role`, maxlength: 40, oninput: (e) => { st.colors[i][0] = e.target.value; markDirty(); } }),
        h('input', { value: c, class: 'mono', 'aria-label': `Colour ${i + 1} hex`, maxlength: 7, oninput: (e) => { st.colors[i][1] = e.target.value.trim(); if (HEX.test(st.colors[i][1])) { sw.style.setProperty('--c', st.colors[i][1]); paintPrev(); } markDirty(); } }),
        h('button', { class: 'iconbtn xs', type: 'button', 'aria-label': `Remove ${role || 'colour'}`, onclick: () => { st.colors.splice(i, 1); paintRows(); paintPrev(); markDirty(); } }, icon('trash'))); }),
    st.colors.length < 24 ? h('button', { class: 'addrow', type: 'button', onclick: () => { st.colors.push(['', '#888888']); paintRows(); } }, icon('plus'), 'Add colour') : null); };
    const fontSel = (opts, val) => { const s = h('select', {}, ...[...new Set([...(val ? [val] : []), ...opts])].map((f) => h('option', { value: f }, f))); s.value = val || opts[0]; return s; };
    const hf = fontSel(HEAD_FONTS, k.fonts?.[0]); const bf = fontSel(BODY_FONTS, k.fonts?.[1]);
    const sample = h('p', { style: `font:700 28px '${hf.value}',var(--font-d)` }, 'Aa Headline sample'); hf.addEventListener('change', () => { sample.style.fontFamily = `'${hf.value}',var(--font-d)`; paintPrev(); markDirty(); }); bf.addEventListener('change', () => { paintPrev(); markDirty(); });
    const words = h('input', { value: k.voice ?? (fresh ? '' : ''), placeholder: 'Confident, plain English, warm', maxlength: 4000 });
    const say = h('textarea', { rows: 2, maxlength: 2000, placeholder: 'Your funnel, done in 30 days.' }); say.value = k.voice_say ?? '';
    const never = h('textarea', { rows: 2, maxlength: 2000, placeholder: '10X your income overnight!!' }); never.value = k.voice_never ?? '';
    const notes = h('textarea', { rows: 2, maxlength: 4000, placeholder: 'How it sounds, in a sentence or two' }); notes.value = k.notes ?? '';
    const prev = h('div', { class: 'card6 pad-s' });
    const paintPrev = () => prev.replaceChildren(h('span', { class: 'bk-sw' }, ...st.colors.filter(([, c]) => HEX.test(c)).map(([, c]) => h('i', { style: `--c:${c}` }))),
      h('b', { style: `font:700 20px '${hf.value}',var(--font-d)` }, name.value || 'Your brand kit'), h('small', { class: 'muted' }, `${hf.value} · ${bf.value}`));
    name.addEventListener('input', () => { paintPrev(); markDirty(); }); for (const el of [words, say, never, notes]) el.addEventListener('input', () => markDirty());
    paintRows(); paintPrev();
    const save = async (leaving = false) => {
      if (!name.value.trim()) { name.focus(); return toast('Give the brand kit a name.', false); }
      const cols = st.colors.filter(([, c]) => c); const bad = cols.find(([, c]) => !HEX.test(c)); if (bad) return toast(`${bad[1]} isn’t a colour code like #2B63F6.`, false);
      const b = { name: name.value.trim(), colors: cols.map(([, c]) => c.toUpperCase()), color_names: cols.map(([r]) => r.trim().slice(0, 40)), fonts: [hf.value, bf.value], voice: words.value.trim(), voice_say: say.value.trim(), voice_never: never.value.trim(), notes: notes.value.trim(), asset_file_ids: st.assets,
        ...(st.logo ? { logo_file_id: st.logo } : {}), ...(st.dark ? { logo_dark_file_id: st.dark } : {}), ...(st.icon ? { icon_file_id: st.icon } : {}) };
      const r = await ctx.api.call(id ? 'funnels.brand_kits.update' : 'funnels.brand_kits.create', id ? { id, ...b } : { ...b, ...(who?.value ? { client: who.value } : {}) });
      if (!r.ok) return toast(messageFor(r.error?.code), false);
      dirty.clear(); toast('Brand kit saved.'); if (!leaving) ctx.go(hrefFor.record('brand_kits', r.data[0].id)); return true;
    };
    focusedActions(root, [h('a', { class: 'btn quiet sm', href: back }, 'Cancel'), btn('Save brand kit', save, 'primary sm')]);
    put(root, h('div', { class: 'formpage' }, h('div', { class: 'formcol' }, ...sections([
      ['Name', [field('Brand kit name', name, true), who ? field('Belongs to', who) : null].filter(Boolean)],
      ['Logos', [h('div', { class: 'grid2' }, drop('On light backgrounds', 'logo', false), drop('On dark backgrounds', 'dark', true)), h('div', { style: 'margin-top:8px;display:flex;align-items:center' }, btn([icon('upload'), 'Icon / favicon'], () => iconIn.click(), 'ghost sm'), iconNote, iconIn)]],
      ['Colours', [rows]], ['Fonts', [h('div', { class: 'row2' }, field('Headings', hf), field('Body', bf)), sample]],
      ['Voice and tone', [field('Words that describe it', words), h('div', { class: 'row2' }, field('We say', say), field('We never say', never)), field('How it sounds', notes)]],
      ['Assets', [h('div', { style: 'display:flex;align-items:center' }, btn([icon('upload'), 'Upload photos, icons, templates'], () => assetIn.click(), 'ghost sm'), assetNote, assetIn)]]])),
    h('aside', { class: 'formprev' }, h('p', { class: 'over' }, 'Preview'), prev)));
    name.focus();
  })();
  return root;
}
