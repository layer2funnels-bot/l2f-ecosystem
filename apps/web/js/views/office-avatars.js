// Office › Funnels › Customer Avatars, V8 Avatar Studio (prototype avatar5.js `avatarStudio`, office6.js `avatars`, `avatarNew`, `avatarEdit`).
// One copy of the data (funnel_avatars.profile, migration 0057): the Profile tab shows summaries, the Full profile shows every chapter, Use it turns it into
// copy angles, Evidence holds proof, interviews and saved versions. Edit mode changes any chapter; the import reads Word/PDF in the browser.
import { h, put, icon, btn, toast, dialog, skeleton, errorState, emptyState, seg } from '../ui.js';
import { hrefFor } from '../routes.js';
import { messageFor } from '../messages.js';
import { dirty } from '../dirty.js';
import { recordManager } from './funnels.js';
import { saveCopy } from '../modules/mediaio.js';
import { CHAPTERS, matchChapter, readAvatarFile, sectionsToProfile } from '../modules/avatarimport.js';

// V8's ten 3D looks (office6 AVPICK): card colour, skin, hair, shirt, hair style
export const AVPICK = [['#FFB547', '#E8B894', '#3A2418', '#2B63F6', 'short'], ['#FF8A6B', '#E9BC98', '#3A2418', '#13A592', 'long'], ['#A898FF', '#8D5A3B', '#141414', '#16171B', 'short'], ['#5FDCCB', '#C68A5E', '#1D1A18', '#F07C1A', 'short'],
  ['#FF9CC8', '#F1C9A5', '#6B3A1E', '#7E5BF2', 'long'], ['#9CC8FF', '#6E4428', '#0F0F0F', '#EF5235', 'long'], ['#D3F38A', '#E8B894', '#B07A3E', '#2B5CF0', 'short'], ['#FFD27A', '#A86B47', '#2A1810', '#0EA5A4', 'long'],
  ['#C3B0FF', '#F5D2B8', '#8C5A2B', '#E9488F', 'short'], ['#7DD3FC', '#D9A57B', '#3B2A1E', '#C99500', 'long']];
const lookOf = (n) => AVPICK[Number.isInteger(n) && n >= 0 && n < 10 ? n : 0];
let figN = 0;
/** The V8 figure. Built from constants only (the ten looks), never from user text. */
export function figure(look) {
  const [, skin, hair, shirt, hs] = lookOf(look); const g = `fg${++figN}`; const span = document.createElement('span'); span.style.display = 'contents';
  span.innerHTML = `<svg viewBox="0 0 200 230" aria-hidden="true"><defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shirt}"/><stop offset="1" stop-color="#0d0e12" stop-opacity=".55"/></linearGradient><radialGradient id="${g}f" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>${hs === 'long' ? `<path d="M58 92c-4-40 18-60 42-60s48 18 42 62c4 30-4 52-10 62H68c-8-12-14-34-10-64z" fill="${hair}"/>` : ''}<path d="M20 230c4-46 38-72 80-72s76 26 80 72z" fill="${shirt}"/><path d="M20 230c4-46 38-72 80-72s76 26 80 72z" fill="url(#${g})"/><path d="M82 158l18 18 18-18" stroke="#fff" stroke-width="3" fill="none" opacity=".5" stroke-linecap="round"/><rect x="85" y="118" width="30" height="44" rx="14" fill="${skin}"/><rect x="85" y="126" width="30" height="13" fill="#000" opacity=".1"/><ellipse cx="100" cy="88" rx="34" ry="40" fill="${skin}"/><ellipse cx="100" cy="88" rx="34" ry="40" fill="url(#${g}f)"/>${hs === 'long' ? `<path d="M66 86c0-30 16-46 34-46s33 16 33 44c-10-14-22-22-36-20-12 2-22 10-31 22z" fill="${hair}"/>` : `<path d="M65 84c0-31 16-46 35-46 20 0 35 14 35 42-6-12-18-19-35-19s-27 8-35 23z" fill="${hair}"/>`}<g class="blink"><circle cx="88" cy="92" r="3.6" fill="#231F1A"/><circle cx="112" cy="92" r="3.6" fill="#231F1A"/></g><path d="M89 108q11 8 22 0" stroke="#231F1A" stroke-width="3" fill="none" stroke-linecap="round"/><ellipse cx="80" cy="102" rx="6" ry="3.5" fill="#FF7A6B" opacity=".22"/><ellipse cx="120" cy="102" rx="6" ry="3.5" fill="#FF7A6B" opacity=".22"/></svg>`;
  return span;
}

// ---- the chapters: what each holds (field specs drive the Full profile, edit mode and how complete an avatar is)
const L = (k, label) => ({ k, label, kind: 'list' }); const T = (k, label) => ({ k, label, kind: 'text' }); const R = (k, label, cols) => ({ k, label, kind: 'rows', cols });
const VERDICT = [['T', 'True · honour it'], ['F', 'False · break gently'], ['C', 'Cultural']]; const WHEN = [['week', 'This week'], ['month', 'Next 30 days']];
export const SPEC = {
  market: [T('market_core', 'Core market'), T('market_sub', 'Submarket'), R('niches', 'Niches', [['Niche', 'text'], ['Why', 'text'], ['Chosen', 'check']])],
  qual: [R('qual', 'Questions', [['Question', 'text'], ['Answer', 'text']])],
  basic: [R('facts', 'Facts', [['Field', 'text'], ['Value', 'text']]), T('now', 'Where they are now'), L('pays', 'Pays for'), L('reach', 'Where to reach them'), T('studying', 'Studying')],
  drives: [L('wants', 'Wants'), L('scared', 'Scared of'), L('values', 'Values'), T('identity', 'Who they want to be'), T('learn', 'How they learn')],
  beliefs: [T('root', 'Root belief'), R('beliefs', 'Beliefs', [['About', 'text'], ['Belief', 'text'], ['Verdict', VERDICT]])],
  desires: [L('ext', 'External · says out loud'), L('int', 'Internal · feels, rarely says')],
  filter: [R('best', 'Best customer', [['Trait', 'text'], ['Why', 'text']]), R('worst', 'Worst customer', [['Trait', 'text'], ['Why', 'text']])],
  problems: [R('problems', 'Problems', [['Area', 'text'], ['Now', 'text'], ['If nothing changes', 'text']])],
  niche: [R('niche', 'Statements', [['Version', 'text'], ['Statement', 'text']]), T('oneliner', 'One-line version')],
  next: [R('next', 'Actions', [['Action', 'text'], ['When', WHEN], ['Done', 'check']])],
  notes: [T('notes', 'Notes')],
  evidence: [R('ev', 'How sure are we?', [['Claim', 'text'], ['Status', 'text'], ['Kind', [['a', 'Assumption'], ['v', 'Verified']]]])],
};
const filled = (p, f) => (f.kind === 'text' ? Boolean(String(p[f.k] ?? '').trim()) : (p[f.k] ?? []).some((x) => (Array.isArray(x) ? x.some((c) => c !== '' && c !== false && c != null) : String(x).trim())));
export const completeness = (p = {}) => Math.round((CHAPTERS.filter(([k]) => SPEC[k].some((f) => filled(p, f))).length / CHAPTERS.length) * 100);
const titleOf = (p, k) => p.titles?.[k] || (CHAPTERS.find(([x]) => x === k)?.[1] ?? (k === 'evidence' ? 'Evidence' : p.custom?.[Number(k.slice(1))]?.title ?? 'Chapter'));
const tick = (list) => h('ul', { class: 'ticks dots' }, ...list.map((x) => h('li', {}, x)));
const copy = async (text) => { try { await navigator.clipboard.writeText(text); toast('Copied.'); } catch { toast('Couldn’t copy. Select the text instead.', false); } };
const ring = (v, cls = 'xs', c) => h('span', { class: `ring ${cls}`, style: `--v:${v}${c ? `;--rc:${c}` : ''}`, title: `${v}% complete` }, cls === 'sm' ? h('b', {}, `${v}%`) : null);
const base = (id) => `#/office/funnels/avatars/${id}`;
const ago = (iso) => { const d = Math.round((Date.now() - new Date(iso)) / 864e5); return d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : d < 7 ? `${d} days ago` : new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); };

// ---------------------------------------------------------------- list
export function avatarsListView(ctx) {
  const root = h('div', { class: 'v8p-office' }); const grid = h('div', { class: 'avgrid' }, skeleton(3)); const canNew = ctx.canAnywhere('funnels.avatar.create');
  let show = 'active'; let rows = []; const q = h('input', { placeholder: 'Search avatars', 'aria-label': 'Search avatars', type: 'search' });
  const paint = () => { const t = q.value.trim().toLowerCase(); const list = rows.filter((a) => !t || `${a.name} ${a.tagline ?? ''} ${a.role ?? ''}`.toLowerCase().includes(t));
    grid.replaceChildren(...list.map((a) => { const [c] = lookOf(a.look); const done = completeness(a.profile);
      return h('a', { class: 'avcard', href: base(a.id), style: `--c:${c}` }, h('span', { class: 'avc-art' }, figure(a.look), h('span', { class: 'avc-badge' }, `${a.version ?? 'v1.0'} · ${a.stage === 'validated' ? 'Validated' : 'Draft'}`)),
        h('span', { class: 'avc-body' }, h('b', {}, a.name), h('small', {}, a.tagline ?? ''), a.role ? h('span', { class: 'avc-role' }, a.role) : null,
          h('span', { class: 'avc-foot' }, ring(done, 'xs', c), `${done}% complete`, h('span', { class: 'grow' }), ago(a.updated_at ?? a.created_at)))); }),
    ...(canNew && show !== 'archived' && !t ? [h('a', { class: 'avcard add', href: `${base('new')}` }, icon('plus'), h('b', {}, 'New avatar'), h('small', {}, 'Import a Word or PDF, or start blank'))] : []));
    if (!grid.childElementCount) grid.replaceChildren(emptyState({ title: t ? 'No avatar matches' : 'Nothing here', body: t ? 'Try another word.' : 'Archived avatars appear here.' })); };
  const load = async () => {
    const r = show === 'all' ? await Promise.all([ctx.api.call('funnels.avatars.list', {}), ctx.api.call('funnels.avatars.list', { archived: true })]).then(([a, b]) => ({ ok: a.ok && b.ok, data: [...(a.data ?? []), ...(b.data ?? [])] }))
      : await ctx.api.call('funnels.avatars.list', { archived: show === 'archived' }); if (!ctx.live()) return;
    if (!r.ok) return grid.replaceChildren(errorState(load)); rows = r.data; paint();
  };
  q.addEventListener('input', paint);
  put(root, h('div', { class: 'ph6' }, h('div', {}, h('h1', { class: 't1', 'data-page-title': true }, 'Customer Avatars'), h('p', { class: 'hint' }, 'The people your funnels speak to. Import your research or build one from scratch.')),
    canNew ? h('a', { class: 'btn primary sm', href: base('new') }, icon('plus'), 'New avatar') : null),
  h('div', { class: 'tb6' }, h('label', { class: 'inp sm' }, icon('search'), q), seg([['active', 'Active'], ['archived', 'Archived'], ['all', 'All']], show, (k) => { show = k; grid.replaceChildren(skeleton(3)); load(); }, 'Show')), grid);
  load(); return root;
}

// ---------------------------------------------------------------- New customer avatar (5 steps)
const wiz = { step: 1, pick: 0, file: null, read: null, map: [], err: '' };
export function avatarNewView(ctx) {
  const wrap = h('div', { class: 'studio-wrap' }); const root = h('div', { class: 'v8p-office' }, wrap); root.__focused = { title: 'New customer avatar', sub: 'Office › Funnels › Customer Avatars', back: hrefFor.list('avatars'), actions: [] };
  if (!ctx.canAnywhere('funnels.avatar.create')) { put(wrap, emptyState({ title: 'You can’t add avatars here', body: 'Ask an owner or admin for access.' })); return root; }
  const steps = ['Start', 'Read the file', 'Check the sections', 'Choose a look', 'Name it'];
  const go = (s) => { wiz.step = s; paint(); };
  const paint = () => {
    wrap.style.setProperty('--c', lookOf(wiz.pick)[0]); let b;
    if (wiz.step === 1) {
      const inp = h('input', { type: 'file', hidden: true, accept: '.docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document', onchange: () => take(inp.files?.[0]) });
      const take = (f) => { if (!f) return; wiz.file = f; wiz.read = null; wiz.err = ''; go(2); read(); };
      const imp = h('button', { class: 'startc', type: 'button', onclick: () => inp.click() }, icon('upload'), h('b', {}, 'Import a Word or PDF'), h('small', {}, 'We read your research and sort it into the avatar’s chapters. You check everything before it’s saved.'), h('span', { class: 'drop6' }, 'Drop .docx or .pdf here · up to 20 MB'), inp);
      imp.addEventListener('dragover', (e) => e.preventDefault()); imp.addEventListener('drop', (e) => { e.preventDefault(); take(e.dataTransfer?.files?.[0]); });
      b = h('div', { class: 'grid2' }, imp, h('button', { class: 'startc', type: 'button', onclick: () => { wiz.file = null; wiz.read = null; go(4); } }, icon('edit'), h('b', {}, 'Start blank'), h('small', {}, 'Choose a look, give it a name, then fill chapters at your own pace.')));
    } else if (wiz.step === 2) {
      const r = wiz.read; const st = r ? 3 : 1;
      b = h('div', { class: 'proc' }, h('span', { class: 'docic', style: '--c:#2B63F6;width:56px;height:56px' }, icon('doc')), h('b', {}, wiz.file?.name ?? ''), h('small', { class: 'muted' }, r ? `${r.words.toLocaleString()} words · ${r.sections.length} sections found` : wiz.err || 'Reading…'),
        h('div', { class: 'lp-steps' }, ...['Reading the document', 'Finding sections and tables', 'Matching them to chapters'].map((x, i) => h('span', { class: i < st ? 'ok' : wiz.err ? '' : 'now' }, i < st ? icon('check') : wiz.err ? icon('x') : h('i', { class: 'spin' }), x))),
        h('span', { class: 'prog', style: `--v:${r ? 100 : wiz.err ? 0 : 40}%;width:320px` }, h('i')),
        r ? btn('Continue', () => go(3), 'primary sm') : wiz.err ? btn('Choose another file', () => go(1), 'ghost sm') : null,
        h('p', { class: 'hint' }, `Your file is read in this browser. Nothing leaves ${ctx.orgName}.`));
    } else if (wiz.step === 3) {
      const opts = [...CHAPTERS, ['custom', 'Custom section'], ['skip', 'Skip']];
      b = [h('p', { class: 'tx2', style: 'margin-bottom:12px' }, 'Each part of your file is matched to a chapter. Change any match, or keep text as a custom section.'),
        h('div', { class: 'tbl6' }, h('div', { class: 'thd' }, ...['From your file', 'Goes to chapter', 'Confidence', 'Items', '', ''].map((x) => h('span', {}, x))),
          ...wiz.read.sections.map((s, i) => { const m = matchChapter(s.heading); const sel = h('select', { class: 'sel sm', 'aria-label': `Chapter for ${s.heading}`, onchange: (e) => { wiz.map[i] = e.target.value; } }, ...opts.map(([k, l]) => h('option', { value: k }, k === 'custom' ? `New section: ${s.heading.slice(0, 40)}` : l))); sel.value = wiz.map[i];
            return h('div', { class: 'tr' }, h('span', { class: 't1c' }, h('b', {}, s.heading)), h('span', {}, sel), h('span', {}, h('span', { class: `pill ${m.confidence === 'High' ? 'blue' : m.confidence === 'Medium' ? 'warn' : ''}`.trim() }, m.confidence)), h('span', {}, String(s.lines.length + s.rows.length)), h('span'), h('span')); })),
        h('div', { class: 'tb6', style: 'margin-top:12px' }, h('span', { class: 'grow' }), btn('Back', () => go(1), 'quiet sm'), btn('Looks right', () => go(4), 'primary sm'))];
    } else if (wiz.step === 4) {
      b = [h('p', { class: 'tx2', style: 'margin-bottom:12px' }, 'Pick the 3D avatar that feels like this customer. You can change it later.'),
        h('div', { class: 'pickgrid' }, ...AVPICK.map((x, i) => h('button', { type: 'button', class: `pick ${wiz.pick === i ? 'on' : ''}`.trim(), 'aria-pressed': String(wiz.pick === i), 'aria-label': `Look ${i + 1}`, style: `--c:${x[0]}`, onclick: () => { wiz.pick = i; paint(); } }, h('span', { class: 'avc-art sm' }, figure(i))))),
        h('div', { class: 'tb6', style: 'margin-top:14px' }, h('span', { class: 'grow' }, ), btn('Back', () => go(wiz.read ? 3 : 1), 'quiet sm'), btn('Next', () => go(5), 'primary sm'))];
    } else {
      const name = h('input', { placeholder: 'John', maxlength: 200 }); const tag = h('input', { placeholder: 'the One Comma Club chaser', maxlength: 200 }); const role = h('input', { placeholder: 'Course creator · coach · consultant', maxlength: 200 });
      const market = h('select', {}, ...['Wealth', 'Health', 'Relationships'].map((m) => h('option', {}, m)));
      const who = h('select', {}, h('option', { value: '' }, `${ctx.orgName} (internal)`), ...ctx.clientsWhere('funnels.avatar.create').map(([i, n]) => h('option', { value: i }, `A client: ${n}`)));
      const nm = h('b', { style: 'font:700 22px var(--font-d)' }, 'Your avatar'); name.addEventListener('input', () => { nm.textContent = name.value || 'Your avatar'; });
      const f = (l, el, req) => h('div', { class: 'field' }, h('label', {}, l, req ? h('i', { class: 'req' }, ' *') : null), el);
      const create = async (e) => {
        if (!name.value.trim()) { name.focus(); return toast('Give the avatar a name.', false); }
        e.currentTarget.disabled = true;
        const profile = wiz.read ? sectionsToProfile(wiz.read.sections, wiz.map) : {};
        let source; if (wiz.file && wiz.read) { const up = await saveCopy(ctx.api, { space: 'shared', client_id: who.value || null }, wiz.file, wiz.file.type || 'application/octet-stream', wiz.file.name); if (up.ok) source = up.data[0].id; }
        const r = await ctx.api.call('funnels.avatars.create', { name: name.value.trim(), tagline: tag.value.trim(), role: role.value.trim(), market: market.value, look: wiz.pick, profile, ...(source ? { source_file_id: source } : {}), ...(who.value ? { client: who.value } : {}) });
        if (!r.ok) { e.currentTarget.disabled = false; return toast(messageFor(r.error?.code), false); }
        Object.assign(wiz, { step: 1, pick: 0, file: null, read: null, map: [] }); toast('Avatar created.'); ctx.go(base(r.data[0].id));
      };
      b = h('div', { class: 'split' }, h('section', { class: 'card6 pad-s' }, h('div', { class: 'row2' }, f('Avatar name', name, true), f('Short description', tag)), h('div', { class: 'row2' }, f('Role', role), f('Market', market)), f('Used for', who),
        h('div', { class: 'tb6' }, h('span', { class: 'grow' }), btn('Back', () => go(4), 'quiet sm'), btn('Create avatar', create, 'primary sm'))),
      h('aside', { class: 'card6 pad-s', style: 'text-align:center' }, h('span', { class: 'avc-art', style: `--c:${lookOf(wiz.pick)[0]};display:block;max-width:220px;margin:0 auto` }, figure(wiz.pick)), nm,
        h('p', { class: 'hint' }, wiz.read ? `${new Set(wiz.map.filter((k) => k !== 'skip')).size} chapters filled from your file` : 'Empty chapters ready to fill')));
      setTimeout(() => name.focus(), 0);
    }
    put(wrap, h('div', { class: 'studio-body narrow' }, h('ol', { class: 'wizsteps' }, ...steps.map((x, i) => h('li', { class: i + 1 < wiz.step ? 'done' : i + 1 === wiz.step ? 'now' : '' }, i + 1 < wiz.step ? icon('check') : String(i + 1), h('span', {}, x)))), ...[b].flat()));
  };
  const read = async () => { try { const r = await readAvatarFile(wiz.file); if (!ctx.live()) return; if (!r.sections.length) throw new Error('We couldn’t find any sections in that file.');
    wiz.read = r; wiz.map = r.sections.map((s) => { const m = matchChapter(s.heading); return m.key; }); } catch (e) { wiz.err = e.message || 'We couldn’t read that file.'; } if (wiz.step === 2) paint(); };
  if (wiz.step > 1 && !wiz.file && wiz.step < 4) wiz.step = 1;
  paint(); return root;
}

// ---------------------------------------------------------------- the studio (Profile · Full profile · Use it · Evidence)
export function avatarStudioView(ctx, id, tab = 'profile') {
  const wrap = h('div', { class: 'studio-wrap' }, skeleton(4)); const root = h('div', { class: 'v8p-office' }, wrap);
  root.__focused = { title: 'Customer avatar', sub: 'Office › Funnels › Customer Avatars', back: hrefFor.list('avatars'), actions: [] };
  const setBar = (acts) => { root.__focused.actions = acts; document.querySelector('.focusbar-acts')?.replaceChildren(...acts); const t = document.querySelector('.focusbar .hdr-ttl b'); if (t) t.textContent = root.__focused.title; };
  const view = async (pre) => {
    const [r, offers] = await Promise.all([pre ? { ok: true, data: [pre] } : ctx.api.call('funnels.avatars.get', { id }), ctx.api.call('funnels.offers.list', {})]); if (!ctx.live()) return;
    if (!r.ok || !r.data?.[0]) return put(wrap, errorState(() => view()));
    const a = r.data[0]; const p = a.profile ?? {}; const [c] = lookOf(a.look); const done = completeness(p); wrap.style.setProperty('--c', c);
    const canEdit = ctx.can('funnels.avatar.edit', a.client_id) && !a.archived_at; const m = recordManager(ctx, 'avatars', { view: (x) => view(x), backTo: hrefFor.list('avatars') });
    const used = (offers.data ?? []).filter((o) => (o.avatar_ids ?? []).includes(a.id) || o.avatar_id === a.id);
    root.__focused.title = [a.name, a.tagline].filter(Boolean).join(', ');
    const more = () => { const cn = a.client_id ? ctx.clients.get(a.client_id) ?? 'the client' : null; const can = ctx.can('funnels.avatar.edit', a.client_id); const canDel = ctx.can('funnels.avatar.delete', a.client_id);
      dialog({ title: 'Avatar', body: h('p', { class: 'hint' }, a.archived_at ? 'This avatar is archived.' : 'Share, archive or change its status.'), actions: [
        ...(can && !a.archived_at ? [{ label: a.stage === 'validated' ? 'Mark as draft' : 'Mark validated', cls: 'ghost', on: async () => { const x = await ctx.api.call('funnels.avatars.update', { id: a.id, stage: a.stage === 'validated' ? 'draft' : 'validated' }); if (!x.ok) return toast(messageFor(x.error?.code), false); toast('Status changed.'); view(x.data[0]); } }] : []),
        ...(can && a.client_id && !a.archived_at ? [{ label: a.client_visible ? 'Stop sharing' : 'Share with client', cls: 'ghost', on: () => (a.client_visible ? m.unshare(a, cn) : m.share(a)) }] : []),
        ...(can ? [{ label: a.archived_at ? 'Restore' : 'Archive', cls: 'ghost', on: () => (a.archived_at ? m.act(a, 'restore', 'Restored.') : m.confirmArchive(a)) }] : []),
        ...(canDel && a.archived_at ? [{ label: 'Delete permanently', cls: 'dng', on: () => m.del(a) }] : []), { label: 'Close' }] }); };
    setBar([h('span', { class: `pill ${a.stage === 'validated' ? 'blue' : 'warn'}` }, `${a.version} · ${a.stage === 'validated' ? 'Validated' : 'Draft'}`), h('span', { class: 'hide-m' }, ring(done, 'sm')),
      btn([icon('download'), 'Export'], () => exportPdf(a), 'ghost sm hide-m'), canEdit ? h('a', { class: 'btn primary sm', href: `${base(a.id)}/edit` }, icon('edit'), 'Edit') : null,
      h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'More actions', onclick: more }, icon('more'))].filter(Boolean));
    const tabs = h('div', { class: 'studio-tabs', role: 'tablist' }, ...[['profile', 'Profile'], ['deep', 'Full profile'], ['use', 'Use it'], ['evidence', 'Evidence']].map(([k, l]) => h('a', { href: k === 'profile' ? base(a.id) : `${base(a.id)}/${k}`, role: 'tab', 'aria-selected': String(k === tab) }, l)));
    const body = h('div', { class: 'studio-body' }); put(wrap, tabs, body);
    const hide = new Set(p.hide ?? []); const card = (i, ic, t, cnt) => h('section', { class: 'sp', style: `--i:${i}` }, h('h3', {}, icon(ic), t), cnt);
    const none = h('p', { class: 'hint' }, 'Not filled yet.');
    if (tab === 'profile') {
      const facts = (p.facts ?? []).filter((f) => f[0] || f[1]); const stage = h('div', { class: 'a3d', style: `--c:${c}`, 'data-tilt': '' }, h('div', { class: 'a3d-sky' }), h('div', { class: 'a3d-ring r1' }), h('div', { class: 'a3d-ring r2' }), h('div', { class: 'a3d-fig' }, figure(a.look)), h('div', { class: 'a3d-ped' }, h('i')),
        ...facts.slice(0, 4).map((x, i) => h('span', { class: `orbit o${i}` }, h('b', {}, x[1]), h('small', {}, x[0]))), h('span', { class: 'a3d-badge' }, `${a.version} · ${a.stage === 'validated' ? 'Validated' : 'Draft'}`));
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) stage.addEventListener('pointermove', (e) => { const b = stage.getBoundingClientRect(); stage.style.setProperty('--tx', `${((e.clientX - b.left) / b.width - 0.5) * 14}deg`); stage.style.setProperty('--ty', `${(-(e.clientY - b.top) / b.height + 0.5) * 10}deg`); });
      put(body, h('div', { class: 'studio' },
        h('div', { class: 'specs left' }, !hide.has('basic') ? card(0, 'user', 'At a glance', facts.length ? h('dl', { class: 'facts' }, ...facts.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])) : none) : null,
          !hide.has('basic') ? card(1, 'compass', 'Where they are now', p.now ? h('p', {}, p.now) : none) : null, !hide.has('basic') ? card(2, 'dollar', 'Pays for', p.pays?.length ? tick(p.pays) : none) : null),
        h('div', { class: 'studio-c' }, stage, h('h1', {}, a.name), a.role ? h('p', { class: 'over' }, a.role) : null, used.length ? h('div', { class: 'chiprow', style: 'justify-content:center' }, ...used.map((o) => h('a', { class: 'tag', href: hrefFor.record('offers', o.id) }, icon('funnels'), ` ${o.name}`))) : null),
        h('div', { class: 'specs right' }, !hide.has('drives') ? card(3, 'target', 'Wants', p.wants?.length ? tick(p.wants) : none) : null, !hide.has('drives') ? card(4, 'alert', 'Scared of', p.scared?.length ? tick(p.scared) : none) : null,
          !hide.has('basic') ? card(5, 'globe', 'Where to reach them', p.reach?.length ? tick(p.reach) : none) : null)),
      p.root && !hide.has('beliefs') ? h('div', { class: 'rootbelief' }, h('span', { class: 'over' }, 'Root belief · break it gently'), h('q', {}, p.root), h('a', { class: 'btn ghost sm', href: `${base(a.id)}/deep?c=beliefs` }, 'All beliefs')) : null,
      p.oneliner && !hide.has('niche') ? h('div', { class: 'oneliner' }, h('span', { class: 'over' }, 'One-line version'), h('p', {}, p.oneliner), btn([icon('copy'), 'Copy'], () => copy(p.oneliner), 'quiet sm')) : null,
      !done && canEdit ? h('div', { class: 'notice plain', style: 'margin-top:16px' }, icon('info'), h('span', {}, 'This avatar is empty. ', h('a', { href: `${base(a.id)}/edit` }, 'Fill the chapters'), ' and the profile builds itself.')) : null);
    } else if (tab === 'deep') {
      const chs = [...CHAPTERS.map(([k]) => k), ...(p.custom ?? []).map((_, i) => `c${i}`)];
      const sec = (k, i) => h('section', { id: `c-${k}`, class: 'chap' }, h('h2', {}, `${i + 1}. ${titleOf(p, k)}`), ...deepChapter(k, p, a));
      put(body, h('div', { class: 'deep' }, h('nav', { class: 'chapters', 'aria-label': 'Chapters' }, h('p', { class: 'over' }, 'Chapters'), ...chs.map((k, i) => h('a', { href: `#c-${k}`, onclick: (e) => { e.preventDefault(); root.querySelector(`#c-${k}`)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); } },
        ring(k[0] === 'c' && k.length < 4 && /^c\d+$/.test(k) ? (p.custom[Number(k.slice(1))]?.text ? 100 : 0) : SPEC[k].filter((f) => filled(p, f)).length ? Math.round((SPEC[k].filter((f) => filled(p, f)).length / SPEC[k].length) * 100) : 0), `${i + 1}. ${titleOf(p, k)}`)),
        canEdit ? h('a', { class: 'addrow', href: `${base(a.id)}/edit/new` }, icon('plus'), 'Add a chapter') : null), h('div', { class: 'chap-body' }, ...chs.map(sec))));
      const jump = new URLSearchParams(location.hash.split('?')[1] ?? '').get('c'); if (jump && /^[a-z0-9]+$/.test(jump)) setTimeout(() => root.querySelector(`#c-${jump}`)?.scrollIntoView({ block: 'start' }), 0);
    } else if (tab === 'use') {
      const fb = (p.beliefs ?? []).find((b) => b[2] === 'F');
      const angles = [['Hook', 'External desire', p.ext?.[0], 'megaphone'], ['Story', 'Internal desire', p.int?.[0], 'heart'], ['Objection', `False belief${fb?.[1] ? `: ${fb[1].slice(0, 40)}` : ''}`, fb ? `Break it gently: “${fb[1]}”` : null, 'xcircle'],
        ['Proof', 'Best-customer trait', p.best?.[0]?.[0], 'star'], ['Channel', 'Where to reach them', p.reach?.[0], 'globe'], ['Filter question', 'Worst-customer trait', p.worst?.[0]?.[0] ? `Ask early: does this sound like you? “${p.worst[0][0]}”` : null, 'filter']].filter((x) => x[2]);
      put(body, h('p', { class: 'lede', style: 'margin:-6px 0 18px' }, 'Turn the profile into copy angles. Each card points back to the research it came from.'),
        angles.length ? h('div', { class: 'cardgrid' }, ...angles.map(([t, s, txt, ic]) => h('div', { class: 'card' }, h('span', { style: 'display:flex;gap:8px;align-items:center' }, icon(ic), h('b', {}, t), h('span', { class: 'pill', style: 'margin-left:auto' }, s)),
          h('p', { style: "font:italic 400 17px/1.45 'Newsreader',serif;color:var(--text)" }, txt), h('div', { class: 'foot' }, btn([icon('copy'), 'Copy'], () => copy(txt), 'quiet sm')))))
          : emptyState({ title: 'Nothing to use yet', body: 'Fill Desires, Beliefs, Best vs worst and Where to reach them, and copy angles appear here.' }));
    } else {
      const vers = h('div', {}, skeleton(2)); const ints = p.interviews ?? [];
      const loadVers = async () => { const v = await ctx.api.call('office.avatar.versions', { avatar: a.id }); if (!ctx.live()) return;
        put(vers, ...(v.ok && v.data.length ? v.data.map((x) => h('div', { class: 'ver', style: 'margin-bottom:8px' }, h('b', { class: 'mono' }, x.version), h('span', { style: 'flex:1' }, `${new Date(x.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} · ${x.note || x.by_name}`),
          btn('Compare', () => compare(a, x), 'quiet sm'), canEdit ? btn('Restore', () => restore(a, x), 'quiet sm') : null)) : [h('p', { class: 'hint' }, 'No saved versions yet.')])); };
      const saveVer = () => { const note = h('input', { maxlength: 300, placeholder: 'What changed' }); const major = h('input', { type: 'checkbox' });
        dialog({ title: `Save ${a.version}`, body: [h('div', { class: 'fld' }, h('label', {}, 'Note'), note), h('label', { class: 'chk' }, major, ' A big change (next whole version)')], actions: [{ label: 'Save version', cls: 'primary', on: async () => {
          const r = await ctx.api.call('office.avatar.versions.save', { avatar: a.id, note: note.value.trim(), major: major.checked }); if (!r.ok || !r.data?.[0]) { toast('Couldn’t save the version.', false); return false; } toast(`Saved. Now on ${r.data[0].version}.`); view(); } }, { label: 'Cancel' }] }); };
      const logInterview = () => { const who = h('input', { maxlength: 120, placeholder: 'Who you spoke to' }); const when = h('input', { type: 'date', value: new Date().toISOString().slice(0, 10) }); const note = h('textarea', { rows: 4, maxlength: 4000, placeholder: 'What they said, in their words' });
        dialog({ title: 'Log an interview', body: [h('div', { class: 'fld' }, h('label', {}, 'Who'), who), h('div', { class: 'fld' }, h('label', {}, 'Date'), when), h('div', { class: 'fld' }, h('label', {}, 'Notes'), note)], actions: [{ label: 'Add interview', cls: 'primary', on: async () => {
          if (!note.value.trim()) { toast('Add what they said.', false); return false; }
          const r = await ctx.api.call('funnels.avatars.update', { id: a.id, profile: { ...p, interviews: [{ who: who.value.trim(), on: when.value, note: note.value.trim() }, ...ints].slice(0, 200) } });
          if (!r.ok) { toast(messageFor(r.error?.code), false); return false; } toast('Interview note added.'); view(r.data[0]); } }, { label: 'Cancel' }] }); };
      put(body, h('div', { class: 'split' }, h('div', { class: 'stackcol' }, h('section', { class: 'panel', style: 'padding:20px' }, h('p', { class: 'sec-t', style: 'margin-top:0' }, icon('shield'), 'How sure are we?'),
        ...((p.ev ?? []).length ? p.ev.map(([e, v, t]) => h('div', { class: 'why' }, h('b', {}, e), h('span', { class: `pill ${t === 'v' ? 'blue' : 'warn'}` }, v || (t === 'v' ? 'Verified' : 'Assumption')))) : [h('p', { class: 'hint' }, 'No evidence listed yet. Add it in Edit › Evidence.')]),
        a.stage !== 'validated' ? h('div', { class: 'notice', style: 'margin-top:12px' }, icon('alert'), h('span', {}, h('b', {}, 'Draft.'), ` Confirm with real customers before marking ${a.name} validated.`)) : null,
        canEdit ? btn([icon('plus'), 'Log an interview'], logInterview, 'primary') : null),
      ints.length ? h('section', { class: 'panel', style: 'padding:20px' }, h('p', { class: 'sec-t', style: 'margin-top:0' }, icon('mic'), `Interviews · ${ints.length}`), ...ints.slice(0, 20).map((x) => h('div', { class: 'why', style: 'display:block' }, h('b', {}, x.who || 'Interview'), h('small', { class: 'muted' }, ` ${x.on ?? ''}`), h('p', { class: 'tx2', style: 'white-space:pre-wrap' }, x.note)))) : null),
      h('section', { class: 'panel', style: 'padding:20px' }, h('p', { class: 'sec-t', style: 'margin-top:0' }, icon('hist'), 'Versions'), h('div', { class: 'ver', style: 'margin-bottom:8px' }, h('b', { class: 'mono' }, a.version), h('span', { style: 'flex:1' }, 'Current'), canEdit ? btn('Save version', saveVer, 'ghost sm') : null), vers)));
      loadVers();
    }
  };
  const compare = (a, v) => { const s = v.snapshot ?? {}; const cur = a.profile ?? {}; const old = s.profile ?? {};
    const keys = [...CHAPTERS.map(([k]) => k), 'evidence']; const diff = keys.filter((k) => SPEC[k].some((f) => JSON.stringify(cur[f.k] ?? null) !== JSON.stringify(old[f.k] ?? null)));
    const basics = ['name', 'tagline', 'role', 'market', 'look', 'stage'].filter((k) => (s[k] ?? null) !== (a[k] ?? null));
    dialog({ title: `${v.version} compared with now`, wide: true, body: diff.length || basics.length ? [h('p', {}, 'Changed since this version:'), h('ul', { class: 'ticks dots' }, ...basics.map((k) => h('li', {}, `${k[0].toUpperCase()}${k.slice(1)}: “${s[k] ?? '—'}” → “${a[k] ?? '—'}”`)), ...diff.map((k) => h('li', {}, titleOf(cur, k))))] : h('p', {}, 'Nothing has changed since this version.'), actions: [{ label: 'Close' }] }); };
  const restore = (a, v) => dialog({ title: `Restore ${v.version}?`, body: h('p', {}, `The current profile is saved as ${a.version} first, so nothing is lost.`), actions: [{ label: 'Restore', cls: 'primary', on: async () => {
    const s = v.snapshot ?? {}; const sv = await ctx.api.call('office.avatar.versions.save', { avatar: a.id, note: `Before restoring ${v.version}` }); if (!sv.ok) { toast('Couldn’t save the current version.', false); return false; }
    const r = await ctx.api.call('funnels.avatars.update', { id: a.id, name: s.name, ...(s.tagline != null ? { tagline: s.tagline } : {}), ...(s.role != null ? { role: s.role } : {}), ...(s.market != null ? { market: s.market } : {}), look: s.look ?? 0, profile: s.profile ?? {} });
    if (!r.ok) { toast(messageFor(r.error?.code), false); return false; } toast(`Restored ${v.version}.`); view(r.data[0]); } }, { label: 'Cancel' }] });
  const exportPdf = async (a) => { const { printBlocks } = await import('../modules/docexport.js'); const p = a.profile ?? {}; const t = (x) => [{ x: String(x) }];
    const blocks = [{ t: 'title', c: t([a.name, a.tagline].filter(Boolean).join(', ')) }, ...(a.role ? [{ t: 'subtitle', c: t(a.role) }] : [])];
    for (const k of [...CHAPTERS.map(([x]) => x), 'evidence']) { const fs = SPEC[k].filter((f) => filled(p, f)); if (!fs.length) continue; blocks.push({ t: 'h1', c: t(titleOf(p, k)) });
      for (const f of fs) { blocks.push({ t: 'h3', c: t(f.label) }); if (f.kind === 'text') blocks.push({ t: 'p', c: t(p[f.k]) }); else for (const x of p[f.k]) blocks.push({ t: 'p', c: t(Array.isArray(x) ? x.map((v, i) => (Array.isArray(f.cols[i][1]) ? (f.cols[i][1].find(([o]) => o === v)?.[1] ?? v) : v === true ? '✓' : v === false ? '' : v)).filter(Boolean).join(' — ') : `• ${x}`) }); } }
    for (const cc of p.custom ?? []) { blocks.push({ t: 'h1', c: t(cc.title) }, { t: 'p', c: t(cc.text ?? '') }); }
    try { await printBlocks({ blocks, page: { size: 'a4', margin: 'normal' }, title: a.name, imageSrc: async () => null }); } catch { toast('Couldn’t open the print window.', false); } };
  view(); return root;
}

function deepChapter(k, p) {
  const none = [h('p', { class: 'hint' }, 'Not filled yet.')]; const has = (x) => (x ?? []).length;
  if (/^c\d+$/.test(k)) { const cc = p.custom?.[Number(k.slice(1))]; return cc?.text ? [h('p', { class: 'tx2', style: 'white-space:pre-wrap' }, cc.text)] : none; }
  switch (k) {
    case 'market': return p.market_core || has(p.niches) ? [h('div', { class: 'mmap' }, h('span', { class: 'mm core' }, p.market_core || '—', h('small', {}, 'Core market')), h('span', { class: 'mm-l' }), h('span', { class: 'mm sub' }, p.market_sub || '—', h('small', {}, 'Submarket')), h('span', { class: 'mm-l' }),
      h('div', { class: 'mm-n' }, ...(p.niches ?? []).map(([n, s, on]) => h('span', { class: `mm niche ${on ? 'on' : ''}`.trim() }, n, h('small', {}, s)))))] : none;
    case 'qual': return has(p.qual) ? [h('div', { class: 'grid3' }, ...p.qual.map(([q, a]) => h('div', { class: 'qcard' }, h('span', { class: 'light' }, icon('check')), h('b', {}, q), h('p', {}, a))))] : none;
    case 'basic': return has(p.facts) || p.now || p.studying ? [has(p.facts) ? h('dl', { class: 'facts wide' }, ...p.facts.flatMap(([a, b]) => [h('dt', {}, a), h('dd', {}, b)])) : null, p.now ? h('p', {}, h('b', {}, 'Where they are now: '), p.now) : null, p.studying ? h('p', {}, h('b', {}, 'Studying: '), p.studying) : null,
      has(p.pays) ? [h('p', { class: 'sec-t' }, 'Pays for'), tick(p.pays)] : null, has(p.reach) ? [h('p', { class: 'sec-t' }, 'Where to reach them'), tick(p.reach)] : null].flat().filter(Boolean) : none;
    case 'drives': return has(p.wants) || has(p.values) || p.identity || p.learn || has(p.scared) ? [h('div', { class: 'grid2' }, h('div', {}, h('p', { class: 'sec-t' }, 'Wants'), has(p.wants) ? tick(p.wants) : h('p', { class: 'hint' }, '—')), h('div', {}, h('p', { class: 'sec-t' }, 'Values'), h('div', { class: 'chiprow' }, ...(p.values ?? []).map((v) => h('span', { class: 'tag' }, v))))),
      has(p.scared) ? h('div', {}, h('p', { class: 'sec-t' }, 'Scared of'), tick(p.scared)) : null, p.identity ? h('div', { class: 'callout' }, h('b', {}, 'Who they want to be'), h('p', {}, p.identity), h('small', {}, 'Sell the identity, never the celebrity.')) : null,
      p.learn ? h('div', { class: 'callout' }, h('b', {}, 'How they learn'), h('p', {}, p.learn), h('small', {}, 'Every lesson connects to the outcome, not the topic.')) : null].filter(Boolean) : none;
    case 'beliefs': return has(p.beliefs) || p.root ? [p.root ? h('p', {}, h('b', {}, 'Root belief: '), `“${p.root}”`) : null, has(p.beliefs) ? h('div', { class: 'tblwrap' }, h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, h('th', {}, 'About'), h('th', {}, 'Belief'), h('th', {}, 'Verdict'))),
      h('tbody', {}, ...p.beliefs.map(([a, b, v]) => h('tr', {}, h('td', { 'data-l': 'About' }, a), h('td', { class: 't1' }, `“${b}”`), h('td', { 'data-l': 'Verdict' }, h('span', { class: `pill ${v === 'T' ? 'blue' : v === 'F' ? 'danger' : ''}`.trim() }, VERDICT.find(([x]) => x === v)?.[1] ?? 'Cultural'))))))) : null,
      h('p', { class: 'hint', style: 'margin-top:8px' }, 'Rule: every ad, email and call either honours a true belief or gently breaks a false one. Never mock either.')].filter(Boolean) : none;
    case 'desires': return has(p.ext) || has(p.int) ? [h('div', { class: 'grid2' }, h('div', { class: 'des ext' }, h('p', { class: 'sec-t' }, icon('megaphone'), 'External · says out loud ', h('span', { class: 'pill' }, 'Use in ads and hooks')), ...(p.ext ?? []).map((x) => h('p', { class: 'quote' }, x))),
      h('div', { class: 'des int' }, h('p', { class: 'sec-t' }, icon('heart'), 'Internal · feels, rarely says ', h('span', { class: 'pill' }, 'Use in story and close')), ...(p.int ?? []).map((x) => h('p', { class: 'quote' }, x))))] : none;
    case 'filter': return has(p.best) || has(p.worst) ? [h('div', { class: 'grid2' }, h('div', { class: 'fcol best' }, h('p', { class: 'sec-t' }, icon('check'), 'Fight for this customer'), ...(p.best ?? []).map(([t, w]) => h('div', { class: 'fitem' }, h('b', {}, t), h('small', {}, w)))),
      h('div', { class: 'fcol worst' }, h('p', { class: 'sec-t' }, icon('x'), 'Politely refund this customer'), ...(p.worst ?? []).map(([t, w]) => h('div', { class: 'fitem' }, h('b', {}, t), h('small', {}, w)))))] : none;
    case 'problems': { if (!has(p.problems)) return none; const by = new Map(); for (const [ar, n, f] of p.problems) by.set(ar || 'General', [...(by.get(ar || 'General') ?? []), [n, f]]);
      return [h('div', { class: 'pmx' }, h('span'), h('b', {}, 'Now'), h('b', {}, 'If nothing changes'), ...[...by].flatMap(([ar, rows]) => [h('b', { class: 'rowh' }, ar), h('div', {}, ...rows.map((x) => h('p', {}, x[0]))), h('div', {}, ...rows.map((x) => h('p', { class: 'fut' }, x[1])))]))]; }
    case 'niche': return has(p.niche) || p.oneliner ? [...(p.niche ?? []), ...(p.oneliner ? [['One line', p.oneliner]] : [])].map(([k2, t]) => h('div', { class: 'stmt' }, h('span', { class: 'pill' }, k2), h('p', {}, t), h('button', { class: 'iconbtn', type: 'button', 'aria-label': `Copy ${k2}`, onclick: () => copy(t) }, icon('copy')))) : none;
    case 'next': return has(p.next) ? [h('div', { class: 'checkl' }, ...p.next.map(([t, w, d]) => h('div', { class: `row ${d ? 'done' : ''}`.trim() }, h('span', { class: 'cbx', role: 'img', 'aria-label': d ? 'Done' : 'Not done' }, h('i', {}, icon('check'))), h('div', { class: 'main' }, h('b', {}, t), h('small', {}, w === 'month' ? 'Next 30 days' : 'This week')))))] : none;
    case 'notes': return p.notes ? [h('p', { class: 'tx2', style: 'white-space:pre-wrap' }, p.notes)] : none;
    default: return none;
  }
}

// ---------------------------------------------------------------- edit mode: any chapter, heading or line; add chapters
const drafts = new Map();   // id → unsaved draft, kept while moving between chapters
export function avatarEditView(ctx, id, chapter = 'about') {
  const wrap = h('div', { class: 'studio-wrap' }, skeleton(4)); const root = h('div', { class: 'v8p-office' }, wrap);
  root.__focused = { title: 'Editing avatar', sub: 'Changes update the profile and the full profile together', back: base(id), actions: [h('a', { class: 'btn quiet sm', href: base(id) }, 'Cancel')] };
  (async () => {
    let d = drafts.get(id);
    if (!d) { const r = await ctx.api.call('funnels.avatars.get', { id }); if (!ctx.live()) return; if (!r.ok || !r.data?.[0]) return put(wrap, errorState(() => ctx.rerender()));
      const a = r.data[0]; if (!ctx.can('funnels.avatar.edit', a.client_id) || a.archived_at) return put(wrap, emptyState({ title: 'You can’t edit this avatar', body: a.archived_at ? 'Restore it first.' : 'Ask an owner or admin for access.' }));
      d = { a, p: structuredClone(a.profile ?? {}), changed: false }; drafts.set(id, d); }
    const { a, p } = d; wrap.style.setProperty('--c', lookOf(a.look)[0]);
    const st = h('span', { class: `savest ${d.changed ? 'dirty' : ''}`.trim() }, h('i'), d.changed ? 'Unsaved changes' : 'Saved');
    const touch = () => { d.changed = true; dirty.set(true); st.className = 'savest dirty'; st.lastChild.textContent = 'Unsaved changes'; };
    if (chapter === 'new') {   // Add chapter
      p.custom = [...(p.custom ?? []), { title: 'New chapter', text: '' }]; touch(); history.replaceState(null, '', `${base(id)}/edit/c${p.custom.length - 1}`); chapter = `c${p.custom.length - 1}`;
    }
    const save = async () => {
      const r = await ctx.api.call('funnels.avatars.update', { id, name: a.name, tagline: a.tagline ?? '', role: a.role ?? '', market: a.market ?? '', look: a.look ?? 0, profile: p });
      if (!r.ok) return toast(messageFor(r.error?.code), false);
      drafts.delete(id); dirty.set(false); toast('Saved. The profile is up to date.'); ctx.go(base(id));
    };
    const acts = [st, h('a', { class: 'btn quiet sm', href: base(id), onclick: () => { drafts.delete(id); dirty.set(false); } }, 'Cancel'), btn('Save', save, 'primary sm')];
    root.__focused.title = `Editing: ${a.name}`; root.__focused.actions = acts; document.querySelector('.focusbar-acts')?.replaceChildren(...acts); const tt = document.querySelector('.focusbar .hdr-ttl b'); if (tt) tt.textContent = root.__focused.title;
    const chs = [['about', 'Name and look'], ...CHAPTERS, ...(p.custom ?? []).map((c, i) => [`c${i}`, c.title]), ['evidence', 'Evidence']];
    if (!chs.some(([k]) => k === chapter)) chapter = 'about';
    const nav = h('nav', { class: 'chapters' }, h('p', { class: 'over' }, 'Chapters'), ...chs.map(([k]) => h('a', { href: `${base(id)}/edit/${k}`, ...(k === chapter ? { 'aria-current': 'page' } : {}) }, k === 'about' ? 'Name and look' : titleOf(p, k))),
      h('a', { class: 'addrow', href: `${base(id)}/edit/new` }, icon('plus'), 'Add chapter'));
    const ed = h('div', {}); const isCustom = /^c\d+$/.test(chapter); const ci = isCustom ? Number(chapter.slice(1)) : -1;
    const title = h('input', { class: 'tp-title', 'aria-label': 'Chapter heading', maxlength: 120, value: chapter === 'about' ? 'Name and look' : titleOf(p, chapter), disabled: chapter === 'about' || chapter === 'evidence',
      oninput: (e) => { if (isCustom) p.custom[ci].title = e.target.value; else p.titles = { ...(p.titles ?? {}), [chapter]: e.target.value }; touch(); } });
    const summaryChk = ['basic', 'drives', 'beliefs', 'niche'].includes(chapter) ? h('label', { class: 'chk' }, h('input', { type: 'checkbox', ...(!(p.hide ?? []).includes(chapter) ? { checked: true } : {}), onchange: (e) => { const s = new Set(p.hide ?? []); if (e.target.checked) s.delete(chapter); else s.add(chapter); p.hide = [...s]; touch(); } }), ' Show a summary on the profile') : null;
    const delBtn = isCustom ? h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Delete this chapter', onclick: () => dialog({ title: `Delete “${p.custom[ci].title}”?`, body: h('p', {}, 'It is removed when you save.'), actions: [{ label: 'Delete chapter', cls: 'dng', on: () => { p.custom.splice(ci, 1); touch(); ctx.go(`${base(id)}/edit/about`); } }, { label: 'Cancel' }] }) }, icon('trash')) : null;
    const fieldEl = (f) => {
      if (f.kind === 'text') { const t = h('textarea', { rows: f.k === 'notes' || f.k === 'now' ? 5 : 2, maxlength: 8000 }); t.value = p[f.k] ?? ''; t.addEventListener('input', () => { p[f.k] = t.value; touch(); }); return h('div', { class: 'field' }, h('label', {}, f.label), t); }
      const box = h('div', { class: 'edtable' }); const blank = () => (f.kind === 'list' ? '' : f.cols.map(([, ty]) => (ty === 'check' ? false : Array.isArray(ty) ? ty[0][0] : '')));
      const paint = () => { const list = p[f.k] ?? []; box.replaceChildren(...list.map((row, i) => {
        const cells = f.kind === 'list' ? [h('input', { value: row, 'aria-label': `${f.label} ${i + 1}`, maxlength: 1000, oninput: (e) => { p[f.k][i] = e.target.value; touch(); } })]
          : f.cols.map(([lb, ty], j) => (ty === 'check' ? h('label', { class: 'chk' }, h('input', { type: 'checkbox', ...(row[j] ? { checked: true } : {}), onchange: (e) => { p[f.k][i][j] = e.target.checked; touch(); } }), ` ${lb}`)
            : Array.isArray(ty) ? (() => { const s = h('select', { class: 'sel sm', 'aria-label': `${lb} ${i + 1}`, onchange: (e) => { p[f.k][i][j] = e.target.value; touch(); } }, ...ty.map(([v, l]) => h('option', { value: v }, l))); s.value = row[j] ?? ty[0][0]; return s; })()
              : h('input', { value: row[j] ?? '', 'aria-label': `${lb} ${i + 1}`, placeholder: lb, maxlength: 1000, class: j === 0 && f.cols.length > 1 ? 'sm-in' : '', style: j === 0 && f.cols.length > 1 ? 'width:160px' : '', oninput: (e) => { p[f.k][i][j] = e.target.value; touch(); } })));
        return h('div', { class: 'edr' }, h('span', { class: 'grip', style: 'display:flex;flex-direction:column' }, h('button', { class: 'iconbtn xs', type: 'button', 'aria-label': `Move ${f.label} ${i + 1} up`, disabled: i === 0, onclick: () => { [list[i - 1], list[i]] = [list[i], list[i - 1]]; touch(); paint(); } }, h('span', { style: 'display:inline-flex;transform:rotate(-90deg)' }, icon('right')))),
          ...cells, h('button', { class: 'iconbtn xs', type: 'button', 'aria-label': `Remove ${f.label} ${i + 1}`, onclick: () => { list.splice(i, 1); touch(); paint(); } }, icon('trash'))); }),
      h('button', { class: 'addrow', type: 'button', onclick: () => { p[f.k] = [...(p[f.k] ?? []), blank()]; touch(); paint(); box.querySelector('.edr:last-of-type input')?.focus(); } }, icon('plus'), `Add ${f.label.toLowerCase().replace(/^(how sure are we\?|beliefs|actions|statements|questions|niches|facts|problems)$/, (m) => ({ 'how sure are we?': 'evidence', beliefs: 'belief', actions: 'action', statements: 'statement', questions: 'question', niches: 'niche', facts: 'field', problems: 'problem' })[m])}`)); };
      paint(); return h('div', { class: 'field' }, h('label', {}, f.label), box);
    };
    if (chapter === 'about') {
      const inp = (k, lbl, ph) => { const i = h('input', { value: a[k] ?? '', placeholder: ph, maxlength: 200, oninput: () => { a[k] = i.value; touch(); } }); return h('div', { class: 'field' }, h('label', {}, lbl), i); };
      const market = h('select', { onchange: () => { a.market = market.value; touch(); } }, ...[...new Set(['Wealth', 'Health', 'Relationships', ...(a.market ? [a.market] : [])])].map((m) => h('option', {}, m))); market.value = a.market || 'Wealth';
      put(ed, h('div', { class: 'row2' }, inp('name', 'Avatar name', 'John'), inp('tagline', 'Short description', 'the One Comma Club chaser')), h('div', { class: 'row2' }, inp('role', 'Role', 'Course creator · coach'), h('div', { class: 'field' }, h('label', {}, 'Market'), market)),
        h('p', { class: 'sec-t' }, 'Look'), h('div', { class: 'pickgrid' }, ...AVPICK.map((x, i) => h('button', { type: 'button', class: `pick ${a.look === i ? 'on' : ''}`.trim(), 'aria-pressed': String(a.look === i), 'aria-label': `Look ${i + 1}`, style: `--c:${x[0]}`, onclick: () => { a.look = i; touch(); ctx.rerender(); } }, h('span', { class: 'avc-art sm' }, figure(i))))));
    } else if (isCustom) { const t = h('textarea', { rows: 12, maxlength: 20000, class: 'rte-b' }); t.value = p.custom[ci].text ?? ''; t.addEventListener('input', () => { p.custom[ci].text = t.value; touch(); }); put(ed, t); }
    else put(ed, ...SPEC[chapter].map(fieldEl));
    put(wrap, h('div', { class: 'studio-body' }, h('div', { class: 'deep' }, nav, h('div', {}, h('div', { class: 'edhead' }, title, summaryChk, delBtn), h('p', { class: 'hint', style: 'margin:-4px 0 12px' }, 'Edit text directly. Use the arrows to reorder rows.'), ed,
      h('div', { class: 'notice plain', style: 'margin-top:14px' }, icon('refresh'), h('span', {}, 'The profile shows a summary of this chapter. It updates as soon as you save; there is only one copy of the data.'))))));
  })();
  return root;
}
