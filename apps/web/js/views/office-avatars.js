// Office › Funnels › Customer Avatars, V8 Avatar Studio (prototype avatar5.js `avatarStudio`, office6.js `avatars`, `avatarNew`, `avatarEdit`).
// Flexible sections (owner, 15 Nov 2026): an avatar has as many sections as its document has — 2, 5, 12, 20 — and any can be added, renamed, edited,
// reordered or removed. The Full profile shows every section; the Profile shows only the cards chosen for it (a whole section or one sub-heading).
// Organization defaults for NEW avatars live in Avatar Studio settings (0060). The model is modules/avatarmodel.js; the import reads Word/PDF in the browser.
import { h, put, icon, btn, toast, dialog, skeleton, errorState, notFoundState, emptyState, seg } from '../ui.js';
import { hrefFor } from '../routes.js';
import { messageFor } from '../messages.js';
import { dirty } from '../dirty.js';
import { recordManager } from './funnels.js';
import { saveCopy } from '../modules/mediaio.js';
import { readAvatarFile } from '../modules/avatarimport.js';
import { TYPES, typeTitle, matchType, cleanHeading, newId, suggestMapping, buildSections, nameFromOutline, DEFAULT_SETTINGS, sectionsFromSettings, defaultCards,
  subHeadings, cardBlocks, cardTitle, hasContent, completeness, glanceRows, normalize, useAngles, blocksText } from '../modules/avatarmodel.js';

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

const copy = async (text) => { try { await navigator.clipboard.writeText(text); toast('Copied.'); } catch { toast('Couldn’t copy. Select the text instead.', false); } };
const ring = (v, cls = 'xs', c) => h('span', { class: `ring ${cls}`, style: `--v:${v}${c ? `;--rc:${c}` : ''}`, title: `${v}% complete` }, cls === 'sm' ? h('b', {}, `${v}%`) : null);
const base = (id) => `#/office/funnels/avatars/${id}`;
const ago = (iso) => { const d = Math.round((Date.now() - new Date(iso)) / 864e5); return d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : d < 7 ? `${d} days ago` : new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); };
const TYPE_OPTS = TYPES.map(([k, l]) => [k, l]);
const settingsOf = async (ctx) => { const r = await ctx.api.call('office.avatar.settings', {}); return r.ok && r.data?.[0]?.sections?.length ? { sections: r.data[0].sections } : DEFAULT_SETTINGS; };

/** Section content as page elements: sub-headings, paragraphs, lists (consecutive items together) and tables (first row = header). Text only, never HTML. */
export function renderBlocks(blocks, { empty = 'Not filled yet.' } = {}) {
  const out = []; let ul = null;
  for (const b of blocks ?? []) {
    if (b.t === 'li') { if (!ul) { ul = h('ul', { class: 'ticks dots' }); out.push(ul); } ul.append(h('li', {}, b.x)); continue; }
    ul = null;
    if (b.t === 'h') out.push(h('h4', { class: 'avb-h' }, b.x));
    else if (b.t === 'p') out.push(h('p', { class: 'avb-p' }, b.x));
    else if (b.t === 'table' && b.rows?.length) {
      const [head, ...rows] = b.rows; const n = Math.max(...b.rows.map((r) => r.length));
      out.push(h('div', { class: 'tblwrap' }, h('table', { class: 'tbl avb-t' }, h('thead', {}, h('tr', {}, ...Array.from({ length: n }, (_, i) => h('th', {}, head[i] ?? '')))),
        h('tbody', {}, ...rows.map((r) => h('tr', {}, ...Array.from({ length: n }, (_, i) => h('td', { 'data-l': head[i] ?? '' }, r[i] ?? ''))))))));
    }
  }
  return out.length ? out : [h('p', { class: 'hint' }, empty)];
}

// ---------------------------------------------------------------- list
export function avatarsListView(ctx) {
  const root = h('div', { class: 'v8p-office' }); const grid = h('div', { class: 'avgrid' }, skeleton(3)); const canNew = ctx.canAnywhere('funnels.avatar.create');
  let show = 'active'; let rows = []; const q = h('input', { placeholder: 'Search avatars', 'aria-label': 'Search avatars', type: 'search' });
  const paint = () => { const t = q.value.trim().toLowerCase(); const list = rows.filter((a) => !t || `${a.name} ${a.tagline ?? ''} ${a.role ?? ''}`.toLowerCase().includes(t));
    grid.replaceChildren(...list.map((a) => { const [c] = lookOf(a.look); const done = completeness(a.profile ?? {});
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
    h('div', { class: 'acts' }, ctx.isAdmin || ctx.isOwner ? h('a', { class: 'btn ghost sm', href: base('settings') }, icon('gear'), 'Avatar settings') : null, canNew ? h('a', { class: 'btn primary sm', href: base('new') }, icon('plus'), 'New avatar') : null)),
  h('div', { class: 'tb6' }, h('label', { class: 'inp sm' }, icon('search'), q), seg([['active', 'Active'], ['archived', 'Archived'], ['all', 'All']], show, (k) => { show = k; grid.replaceChildren(skeleton(3)); load(); }, 'Show')), grid);
  load(); return root;
}

// ---------------------------------------------------------------- New customer avatar (5 steps)
const wiz = { step: 1, pick: 0, file: null, read: null, map: [], err: '' };
export function avatarNewView(ctx) {
  const wrap = h('div', { class: 'studio-wrap' }); const root = h('div', { class: 'v8p-office' }, wrap); root.__focused = { title: 'New customer avatar', sub: 'Office › Funnels › Customer Avatars', back: hrefFor.list('avatars'), actions: [] };
  if (!ctx.canAnywhere('funnels.avatar.create')) { put(wrap, emptyState({ title: 'You can’t add avatars here', body: 'Ask an owner or admin for access.' })); return root; }
  const settingsP = settingsOf(ctx);
  const steps = ['Start', 'Read the file', 'Check the sections', 'Choose a look', 'Name it'];
  const go = (s) => { wiz.step = s; paint(); };
  const targetOpts = [...TYPE_OPTS, ['custom', 'Its own section (as in the file)'], ['skip', 'Leave out']];
  const paint = () => {
    wrap.style.setProperty('--c', lookOf(wiz.pick)[0]); let b;
    if (wiz.step === 1) {
      const inp = h('input', { type: 'file', hidden: true, accept: '.docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document', onchange: () => take(inp.files?.[0]) });
      const take = (f) => { if (!f) return; wiz.file = f; wiz.read = null; wiz.err = ''; go(2); read(); };
      const imp = h('button', { class: 'startc', type: 'button', onclick: () => inp.click() }, icon('upload'), h('b', {}, 'Import a Word or PDF'), h('small', {}, 'We keep your document’s own sections and suggest where each part belongs. You check everything before it’s saved.'), h('span', { class: 'drop6' }, 'Drop .docx or .pdf here · up to 20 MB'), inp);
      imp.addEventListener('dragover', (e) => e.preventDefault()); imp.addEventListener('drop', (e) => { e.preventDefault(); take(e.dataTransfer?.files?.[0]); });
      b = h('div', { class: 'grid2' }, imp, h('button', { class: 'startc', type: 'button', onclick: () => { wiz.file = null; wiz.read = null; go(4); } }, icon('edit'), h('b', {}, 'Start blank'), h('small', {}, 'Starts with your organization’s default sections. Fill them at your own pace.')));
    } else if (wiz.step === 2) {
      const r = wiz.read; const st = r ? 3 : 1;
      b = h('div', { class: 'proc' }, h('span', { class: 'docic', style: '--c:#2B63F6;width:56px;height:56px' }, icon('doc')), h('b', {}, wiz.file?.name ?? ''), h('small', { class: 'muted' }, r ? `${r.words.toLocaleString()} words · ${r.outline.length} sections found` : wiz.err || 'Reading…'),
        h('div', { class: 'lp-steps' }, ...['Reading the document', 'Finding sections, sub-headings and tables', 'Suggesting where each part belongs'].map((x, i) => h('span', { class: i < st ? 'ok' : wiz.err ? '' : 'now' }, i < st ? icon('check') : wiz.err ? icon('x') : h('i', { class: 'spin' }), x))),
        h('span', { class: 'prog', style: `--v:${r ? 100 : wiz.err ? 0 : 40}%;width:320px` }, h('i')),
        r ? btn('Continue', () => go(3), 'primary sm') : wiz.err ? btn('Choose another file', () => go(1), 'ghost sm') : null,
        h('p', { class: 'hint' }, `Your file is read in this browser. Nothing leaves ${ctx.orgName}.`));
    } else if (wiz.step === 3) {
      const count = () => wiz.read.outline.filter((_, i) => wiz.map[i].target !== 'skip').length;
      const sum = h('b', {}, '');
      const updateSum = () => { sum.textContent = `${count()} of ${wiz.read.outline.length} sections will be created.`; };
      const rows = wiz.read.outline.map((s, i) => {
        const m = wiz.map[i]; const conf = m.confidence;
        const sel = h('select', { class: 'sel sm', 'aria-label': `Where “${cleanHeading(s.heading)}” goes`, onchange: (e) => { m.target = e.target.value; updateSum(); partsBox.hidden = m.target === 'skip'; } }, ...targetOpts.map(([k, l]) => h('option', { value: k }, l))); sel.value = m.target;
        const words = s.parts.reduce((n, p) => n + blocksText(p.blocks).split(/\s+/).filter(Boolean).length, 0);
        const partsBox = h('div', { class: 'imp-parts', hidden: m.target === 'skip' }, ...s.parts.map((p, j) => (!p.heading ? null : h('div', { class: 'imp-part' }, h('span', { class: 'grow' }, icon('right'), ' ', p.heading),
          (() => { const ps = h('select', { class: 'sel sm', 'aria-label': `Where the part “${p.heading}” goes`, onchange: (e) => { m.parts[j] = e.target.value; } }, h('option', { value: 'same' }, 'Stays in this section'), ...TYPE_OPTS.map(([k, l]) => h('option', { value: k }, `Move to: ${l}`)), h('option', { value: 'skip' }, 'Leave out'));
            ps.value = m.parts[j]; return ps; })()))));
        const prev = h('details', { class: 'imp-prev' }, h('summary', {}, `Show what was found (${words.toLocaleString()} words)`), h('div', { class: 'avb' }, ...s.parts.flatMap((p) => [p.heading ? h('h4', { class: 'avb-h' }, p.heading) : null, ...renderBlocks(p.blocks, { empty: '' })].filter(Boolean))));
        return h('div', { class: 'imp-row card6 pad-s' }, h('div', { class: 'imp-head' }, h('span', { class: 'imp-n mono' }, String(i + 1)), h('b', { class: 'grow' }, cleanHeading(s.heading)),
          h('span', { class: `pill ${conf === 'High' ? 'blue' : conf === 'Medium' ? 'warn' : ''}`.trim(), title: 'How sure the suggestion is' }, conf === 'Low' ? 'No match: kept as is' : `${conf} match`), sel), partsBox, prev);
      });
      updateSum();
      b = [h('p', { class: 'tx2', style: 'margin-bottom:12px' }, 'Each section of your file becomes a section of the avatar. Choose what kind of section it is, move a part to another section, or leave something out. Open “Show what was found” to check the text.'),
        h('div', { class: 'stackcol' }, ...rows),
        h('div', { class: 'tb6', style: 'margin-top:12px' }, sum, h('span', { class: 'grow' }), btn('Back', () => go(1), 'quiet sm'), btn('Looks right', () => { if (!count()) return toast('Keep at least one section.', false); go(4); }, 'primary sm'))];
    } else if (wiz.step === 4) {
      b = [h('p', { class: 'tx2', style: 'margin-bottom:12px' }, 'Pick the 3D avatar that feels like this customer. You can change it later.'),
        h('div', { class: 'pickgrid' }, ...AVPICK.map((x, i) => h('button', { type: 'button', class: `pick ${wiz.pick === i ? 'on' : ''}`.trim(), 'aria-pressed': String(wiz.pick === i), 'aria-label': `Look ${i + 1}`, style: `--c:${x[0]}`, onclick: () => { wiz.pick = i; paint(); } }, h('span', { class: 'avc-art sm' }, figure(i))))),
        h('div', { class: 'tb6', style: 'margin-top:14px' }, h('span', { class: 'grow' }), btn('Back', () => go(wiz.read ? 3 : 1), 'quiet sm'), btn('Next', () => go(5), 'primary sm'))];
    } else {
      const name = h('input', { placeholder: 'John', maxlength: 200, value: wiz.read ? nameFromOutline(wiz.read.outline) : '' }); const tag = h('input', { placeholder: 'the One Comma Club chaser', maxlength: 200 }); const role = h('input', { placeholder: 'Course creator · coach · consultant', maxlength: 200 });
      const market = h('select', {}, ...['Wealth', 'Health', 'Relationships'].map((m) => h('option', {}, m)));
      const who = h('select', {}, h('option', { value: '' }, `${ctx.orgName} (internal)`), ...ctx.clientsWhere('funnels.avatar.create').map(([i, n]) => h('option', { value: i }, `A client: ${n}`)));
      const nm = h('b', { style: 'font:700 22px var(--font-d)' }, name.value || 'Your avatar'); name.addEventListener('input', () => { nm.textContent = name.value || 'Your avatar'; });
      const f = (l, el, req) => h('div', { class: 'field' }, h('label', {}, l, req ? h('i', { class: 'req' }, ' *') : null), el);
      const create = async (e) => {
        const button = e.currentTarget; if (!name.value.trim()) { name.focus(); return toast('Give the avatar a name.', false); }
        button.disabled = true;
        const settings = await settingsP;
        let profile;
        if (wiz.read) { const sections = buildSections(wiz.read.outline, wiz.map); profile = { v: 2, sections, cards: defaultCards(sections, settings) }; }
        else { const { sections, cards } = sectionsFromSettings(settings); profile = { v: 2, sections, cards }; }
        let source; if (wiz.file && wiz.read) { const up = await saveCopy(ctx.api, { space: 'shared', client_id: who.value || null }, wiz.file, wiz.file.type || 'application/octet-stream', wiz.file.name); if (up.ok) source = up.data[0].id; }
        const r = await ctx.api.call('funnels.avatars.create', { name: name.value.trim(), tagline: tag.value.trim(), role: role.value.trim(), market: market.value, look: wiz.pick, profile, ...(source ? { source_file_id: source } : {}), ...(who.value ? { client: who.value } : {}) });
        if (!r.ok || !r.data?.[0]) { button.disabled = false; return toast(messageFor(r.error?.code), false); }
        Object.assign(wiz, { step: 1, pick: 0, file: null, read: null, map: [] }); toast('Avatar created.'); ctx.go(base(r.data[0].id));
      };
      b = h('div', { class: 'split' }, h('section', { class: 'card6 pad-s' }, h('div', { class: 'row2' }, f('Avatar name', name, true), f('Short description', tag)), h('div', { class: 'row2' }, f('Role', role), f('Market', market)), f('Used for', who),
        h('div', { class: 'tb6' }, h('span', { class: 'grow' }), btn('Back', () => go(4), 'quiet sm'), btn('Create avatar', create, 'primary sm'))),
      h('aside', { class: 'card6 pad-s', style: 'text-align:center' }, h('span', { class: 'avc-art', style: `--c:${lookOf(wiz.pick)[0]};display:block;max-width:220px;margin:0 auto` }, figure(wiz.pick)), nm,
        h('p', { class: 'hint' }, wiz.read ? `${wiz.read.outline.filter((_, i) => wiz.map[i].target !== 'skip').length} sections from your file` : 'Your organization’s default sections, ready to fill')));
      setTimeout(() => name.focus(), 0);
    }
    put(wrap, h('div', { class: 'studio-body narrow' }, h('ol', { class: 'wizsteps' }, ...steps.map((x, i) => h('li', { class: i + 1 < wiz.step ? 'done' : i + 1 === wiz.step ? 'now' : '' }, i + 1 < wiz.step ? icon('check') : String(i + 1), h('span', {}, x)))), ...[b].flat()));
  };
  const read = async () => { try { const r = await readAvatarFile(wiz.file); if (!ctx.live()) return; if (!r.outline.length) throw new Error('We couldn’t find any text in that file.');
    wiz.read = r; wiz.map = suggestMapping(r.outline); } catch (e) { wiz.err = e.message || 'We couldn’t read that file.'; } if (wiz.step === 2) paint(); };
  if (wiz.step > 1 && !wiz.file && wiz.step < 4) wiz.step = 1;
  paint(); return root;
}

// ---------------------------------------------------------------- the studio (Profile · Full profile · Use it · Evidence)
export function avatarStudioView(ctx, id, tab = 'profile') {
  if (id === 'settings') return avatarSettingsView(ctx);
  const wrap = h('div', { class: 'studio-wrap' }, skeleton(4)); const root = h('div', { class: 'v8p-office' }, wrap);
  root.__focused = { title: 'Customer avatar', sub: 'Office › Funnels › Customer Avatars', back: hrefFor.list('avatars'), actions: [] };
  const setBar = (acts) => { root.__focused.actions = acts; document.querySelector('.focusbar-acts')?.replaceChildren(...acts); const t = document.querySelector('.focusbar .hdr-ttl b'); if (t) t.textContent = root.__focused.title; };
  const view = async (pre) => {
    const [r, offers] = await Promise.all([pre ? { ok: true, data: [pre] } : ctx.api.call('funnels.avatars.get', { id }), tab === 'profile' ? ctx.api.call('funnels.offers.list', {}) : { ok: true, data: [] }]); if (!ctx.live()) return;
    if (!r.ok || !r.data?.[0]) return put(wrap, r.ok || (r.status >= 400 && r.status < 500 && ![401, 408, 429].includes(r.status)) ? notFoundState(hrefFor.list('avatars'), 'Back to Customer Avatars') : errorState(() => view()));
    const a = r.data[0]; a.version ??= 'v1.0'; a.stage ??= 'draft'; const p = normalize(a.profile ?? {}); const [c] = lookOf(a.look); const done = completeness(p); wrap.style.setProperty('--c', c);
    const canEdit = ctx.can('funnels.avatar.edit', a.client_id) && !a.archived_at; const m = recordManager(ctx, 'avatars', { view: (x) => view(x), backTo: hrefFor.list('avatars') });
    const used = (offers.data ?? []).filter((o) => (o.avatar_ids ?? []).includes(a.id) || o.avatar_id === a.id);
    root.__focused.title = [a.name, a.tagline].filter(Boolean).join(', ');
    const saveProfile = async (next, msg) => { const x = await ctx.api.call('funnels.avatars.update', { id: a.id, profile: next }); if (!ctx.live()) return false; if (!x.ok) { toast(messageFor(x.error?.code), false); return false; } toast(msg); view(x.data[0]); return true; };
    const more = () => { const cn = a.client_id ? ctx.clients.get(a.client_id) ?? 'the client' : null; const can = ctx.can('funnels.avatar.edit', a.client_id); const canDel = ctx.can('funnels.avatar.delete', a.client_id);
      dialog({ title: 'Avatar', body: h('p', { class: 'hint' }, a.archived_at ? 'This avatar is archived.' : 'Share, archive or change its status.'), actions: [
        ...(can && !a.archived_at ? [{ label: a.stage === 'validated' ? 'Mark as draft' : 'Mark validated', cls: 'ghost', on: async () => { const x = await ctx.api.call('funnels.avatars.update', { id: a.id, stage: a.stage === 'validated' ? 'draft' : 'validated' }); if (!x.ok) return toast(messageFor(x.error?.code), false); toast('Status changed.'); view(x.data[0]); } }] : []),
        ...(ctx.can('funnels.record.share', a.client_id) && a.client_id && !a.archived_at ? [{ label: a.client_visible ? 'Stop sharing' : 'Share with client', cls: 'ghost', on: () => (a.client_visible ? m.unshare(a, cn) : m.share(a)) }] : []),
        ...(can ? [{ label: a.archived_at ? 'Restore' : 'Archive', cls: 'ghost', on: () => (a.archived_at ? m.act(a, 'restore', 'Restored.') : m.confirmArchive(a)) }] : []),
        ...(canDel && a.archived_at ? [{ label: 'Delete permanently', cls: 'dng', on: () => m.del(a) }] : []), { label: 'Close' }] }); };
    setBar([!canEdit && !a.archived_at ? h('span', { class: 'pill', title: 'You can view this avatar but not change it' }, icon('eye'), 'Read only') : null, h('span', { class: `pill ${a.stage === 'validated' ? 'blue' : 'warn'}` }, `${a.version} · ${a.stage === 'validated' ? 'Validated' : 'Draft'}`), h('span', { class: 'hide-m' }, ring(done, 'sm')),
      btn([icon('download'), 'Export'], () => exportPdf(a, p), 'ghost sm hide-m'), canEdit ? h('a', { class: 'btn primary sm', href: `${base(a.id)}/edit` }, icon('edit'), 'Edit') : null,
      h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'More actions', onclick: more }, icon('more'))].filter(Boolean));
    const tabs = h('div', { class: 'studio-tabs', role: 'tablist' }, ...[['profile', 'Profile'], ['deep', 'Full profile'], ['use', 'Use it'], ['evidence', 'Evidence']].map(([k, l]) => h('a', { href: k === 'profile' ? base(a.id) : `${base(a.id)}/${k}`, role: 'tab', 'aria-selected': String(k === tab) }, l)));
    const body = h('div', { class: 'studio-body' }); put(wrap, tabs, body);
    const byId = new Map(p.sections.map((s) => [s.id, s]));
    if (tab === 'profile') {
      // the facts circling the figure: short rows from the first facts table (never more than 3, never long sentences — they would cover the face)
      const orbit = glanceRows(p).filter((r) => String(r[1]).length <= 36 && String(r[0]).length <= 28).slice(0, 3);
      const stage = h('div', { class: 'a3d', style: `--c:${c}`, 'data-tilt': '' }, h('div', { class: 'a3d-sky' }), h('div', { class: 'a3d-ring r1' }), h('div', { class: 'a3d-ring r2' }), h('div', { class: 'a3d-fig' }, figure(a.look)), h('div', { class: 'a3d-ped' }, h('i')),
        ...orbit.map((x, i) => h('span', { class: `orbit o${i}` }, h('b', {}, x[1]), h('small', {}, x[0]))), h('span', { class: 'a3d-badge' }, `${a.version} · ${a.stage === 'validated' ? 'Validated' : 'Draft'}`));
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) stage.addEventListener('pointermove', (e) => { const b = stage.getBoundingClientRect(); stage.style.setProperty('--tx', `${((e.clientX - b.left) / b.width - 0.5) * 14}deg`); stage.style.setProperty('--ty', `${(-(e.clientY - b.top) / b.height + 0.5) * 10}deg`); });
      const cards = p.cards.filter((k) => byId.has(k.sid));
      const cardEl = (k, i) => { const s = byId.get(k.sid); const bl = cardBlocks(s, k.sub);
        return h('section', { class: 'sp avcardp', style: `--i:${i}` }, h('h3', {}, icon(k.sub === '#table' ? 'user' : 'target'), h('span', { class: 'grow' }, cardTitle(s, k.sub)),
          canEdit ? h('button', { class: 'iconbtn xs', type: 'button', 'aria-label': `Remove “${cardTitle(s, k.sub)}” from the profile`, title: 'Remove from the profile (the content stays in the Full profile)', onclick: () => saveProfile({ ...p, cards: p.cards.filter((x) => x !== k) }, 'Removed from the profile. It’s still in the Full profile.') }, icon('x')) : null),
          clampBox(renderBlocks(bl)));
      };
      const left = cards.filter((_, i) => i % 2 === 0); const right = cards.filter((_, i) => i % 2 === 1);
      put(body, h('div', { class: 'studio' },
        h('div', { class: 'specs left' }, ...left.map((k) => cardEl(k, cards.indexOf(k)))),
        h('div', { class: 'studio-c' }, stage, h('h1', {}, a.name), a.role ? h('p', { class: 'over' }, a.role) : null, used.length ? h('div', { class: 'chiprow', style: 'justify-content:center' }, ...used.map((o) => h('a', { class: 'tag', href: hrefFor.record('offers', o.id) }, icon('funnels'), ` ${o.name}`))) : null),
        h('div', { class: 'specs right' }, ...right.map((k) => cardEl(k, cards.indexOf(k))))),
      !cards.length ? h('div', { class: 'notice plain', style: 'margin-top:16px' }, icon('info'), h('span', {}, 'Nothing is on the profile yet. ', canEdit ? 'Choose sections from the Full profile to show here.' : '')) : null,
      canEdit ? h('div', { class: 'tb6', style: 'margin-top:16px;justify-content:center' }, btn([icon('plus'), 'Choose what the profile shows'], () => pickCards(p, saveProfile, a), 'ghost sm'), h('a', { class: 'btn quiet sm', href: `${base(a.id)}/edit/new` }, icon('plus'), 'Add a new section')) : null,
      !done && canEdit ? h('div', { class: 'notice plain', style: 'margin-top:16px' }, icon('info'), h('span', {}, 'This avatar is empty. ', h('a', { href: `${base(a.id)}/edit` }, 'Fill its sections'), ' and the profile builds itself.')) : null);
    } else if (tab === 'deep') {
      const onProfile = new Set(p.cards.map((k) => k.sid));
      const sec = (s, i) => h('section', { id: `c-${s.id}`, class: 'chap' }, h('div', { class: 'chap-h' }, h('h2', { class: 'grow' }, `${i + 1}. ${s.title}`), onProfile.has(s.id) ? h('span', { class: 'pill blue', style: 'height:20px' }, 'On the profile') : null,
        canEdit ? h('a', { class: 'btn quiet sm', href: `${base(a.id)}/edit/${s.id}` }, icon('edit'), 'Edit') : null), ...renderBlocks(s.blocks));
      put(body, p.sections.length ? h('div', { class: 'deep' }, h('nav', { class: 'chapters', 'aria-label': 'Sections' }, h('p', { class: 'over' }, `Sections · ${p.sections.length}`), ...p.sections.map((s, i) => h('a', { href: `#c-${s.id}`, onclick: (e) => { e.preventDefault(); root.querySelector(`#c-${CSS.escape(s.id)}`)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); } },
        ring(hasContent(s) ? 100 : 0), `${i + 1}. ${s.title}`)),
        canEdit ? h('a', { class: 'addrow', href: `${base(a.id)}/edit/new` }, icon('plus'), 'Add a section') : null), h('div', { class: 'chap-body' }, ...p.sections.map(sec)))
        : emptyState({ title: 'No sections yet', body: 'Add the first section to start the profile.', action: canEdit ? h('a', { class: 'btn primary', href: `${base(a.id)}/edit/new` }, 'Add a section') : null }));
      const jump = new URLSearchParams(location.hash.split('?')[1] ?? '').get('c'); if (jump && /^[a-z0-9]+$/i.test(jump)) setTimeout(() => root.querySelector(`#c-${CSS.escape(jump)}`)?.scrollIntoView({ block: 'start' }), 0);
    } else if (tab === 'use') {
      const angles = useAngles(p);
      put(body, h('p', { class: 'lede', style: 'margin:-6px 0 18px' }, 'Turn the profile into copy angles. Each card points back to the research it came from.'),
        angles.length ? h('div', { class: 'cardgrid' }, ...angles.map(([t, s, txt, ic]) => h('div', { class: 'card' }, h('span', { style: 'display:flex;gap:8px;align-items:center' }, icon(ic), h('b', {}, t), h('span', { class: 'pill', style: 'margin-left:auto' }, s)),
          h('p', { style: "font:italic 400 17px/1.45 'Newsreader',serif;color:var(--text)" }, txt), h('div', { class: 'foot' }, btn([icon('copy'), 'Copy'], () => copy(txt), 'quiet sm')))))
          : emptyState({ title: 'Nothing to use yet', body: 'Fill the desires, beliefs, best vs worst customer and where to reach them, and copy angles appear here.' }));
    } else {
      const vers = h('div', {}, skeleton(2)); const ints = p.interviews ?? [];
      const loadVers = async () => { const v = await ctx.api.call('office.avatar.versions', { avatar: a.id }); if (!ctx.live()) return;
        put(vers, ...(v.ok && v.data.length ? v.data.map((x) => h('div', { class: 'ver', style: 'margin-bottom:8px' }, h('b', { class: 'mono' }, x.version), h('span', { style: 'flex:1' }, `${new Date(x.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} · ${x.note || x.by_name}`),
          btn('Compare', () => compare(a, p, x), 'quiet sm'), canEdit ? btn('Restore', () => restore(a, x), 'quiet sm') : null)) : [h('p', { class: 'hint' }, 'No saved versions yet.')])); };
      const saveVer = () => { const note = h('input', { maxlength: 300, placeholder: 'What changed' }); const major = h('input', { type: 'checkbox' });
        dialog({ title: `Save ${a.version}`, body: [h('div', { class: 'fld' }, h('label', {}, 'Note'), note), h('label', { class: 'chk' }, major, ' A big change (next whole version)')], actions: [{ label: 'Save version', cls: 'primary', on: async () => {
          const r = await ctx.api.call('office.avatar.versions.save', { avatar: a.id, note: note.value.trim(), major: major.checked }); if (!r.ok || !r.data?.[0]) { toast('Couldn’t save the version.', false); return false; } toast(`Saved. Now on ${r.data[0].version}.`); view(); } }, { label: 'Cancel' }] }); };
      const logInterview = () => { const who = h('input', { maxlength: 120, placeholder: 'Who you spoke to' }); const when = h('input', { type: 'date', value: new Date().toISOString().slice(0, 10) }); const note = h('textarea', { rows: 4, maxlength: 4000, placeholder: 'What they said, in their words' });
        dialog({ title: 'Log an interview', body: [h('div', { class: 'fld' }, h('label', {}, 'Who'), who), h('div', { class: 'fld' }, h('label', {}, 'Date'), when), h('div', { class: 'fld' }, h('label', {}, 'Notes'), note)], actions: [{ label: 'Add interview', cls: 'primary', on: async () => {
          if (!note.value.trim()) { toast('Add what they said.', false); return false; }
          return saveProfile({ ...p, interviews: [{ who: who.value.trim(), on: when.value, note: note.value.trim() }, ...ints].slice(0, 200) }, 'Interview note added.'); } }, { label: 'Cancel' }] }); };
      put(body, h('div', { class: 'split' }, h('div', { class: 'stackcol' }, h('section', { class: 'panel', style: 'padding:20px' }, h('p', { class: 'sec-t', style: 'margin-top:0' }, icon('shield'), 'How sure are we?'),
        ...((p.ev ?? []).length ? p.ev.map(([e, v, t]) => h('div', { class: 'why' }, h('b', {}, e), h('span', { class: `pill ${t === 'v' ? 'blue' : 'warn'}` }, v || (t === 'v' ? 'Verified' : 'Assumption')))) : [h('p', { class: 'hint' }, 'No evidence listed yet. Add it in Edit › Evidence.')]),
        a.stage !== 'validated' ? h('div', { class: 'notice', style: 'margin-top:12px' }, icon('alert'), h('span', {}, h('b', {}, 'Draft.'), ` Confirm with real customers before marking ${a.name} validated.`)) : null,
        canEdit ? btn([icon('plus'), 'Log an interview'], logInterview, 'primary') : null),
      ints.length ? h('section', { class: 'panel', style: 'padding:20px' }, h('p', { class: 'sec-t', style: 'margin-top:0' }, icon('mic'), `Interviews · ${ints.length}`), ...ints.slice(0, 20).map((x) => h('div', { class: 'why', style: 'display:block' }, h('b', {}, x.who || 'Interview'), h('small', { class: 'muted' }, ` ${x.on ?? ''}`), h('p', { class: 'tx2', style: 'white-space:pre-wrap' }, x.note)))) : null),
      h('section', { class: 'panel', style: 'padding:20px' }, h('p', { class: 'sec-t', style: 'margin-top:0' }, icon('hist'), 'Versions'), h('div', { class: 'ver', style: 'margin-bottom:8px' }, h('b', { class: 'mono' }, a.version), h('span', { style: 'flex:1' }, 'Current'), canEdit ? btn('Save version', saveVer, 'ghost sm') : null), vers)));
      loadVers();
    }
  };
  const compare = (a, cur, v) => { const s = v.snapshot ?? {}; const old = normalize(s.profile ?? {});
    const key = (x) => JSON.stringify([x.title, x.blocks]); const oldT = new Map(old.sections.map((x) => [x.title, key(x)])); const curT = new Map(cur.sections.map((x) => [x.title, key(x)]));
    const changes = [...cur.sections.filter((x) => !oldT.has(x.title)).map((x) => `Added: ${x.title}`), ...old.sections.filter((x) => !curT.has(x.title)).map((x) => `Removed: ${x.title}`),
      ...cur.sections.filter((x) => oldT.has(x.title) && oldT.get(x.title) !== key(x)).map((x) => `Changed: ${x.title}`)];
    const basics = ['name', 'tagline', 'role', 'market', 'look', 'stage'].filter((k) => (s[k] ?? null) !== (a[k] ?? null));
    dialog({ title: `${v.version} compared with now`, wide: true, body: changes.length || basics.length ? [h('p', {}, 'Changed since this version:'), h('ul', { class: 'ticks dots' }, ...basics.map((k) => h('li', {}, `${k[0].toUpperCase()}${k.slice(1)}: “${s[k] ?? '—'}” → “${a[k] ?? '—'}”`)), ...changes.map((x) => h('li', {}, x)))] : h('p', {}, 'Nothing has changed since this version.'), actions: [{ label: 'Close' }] }); };
  const restore = (a, v) => dialog({ title: `Restore ${v.version}?`, body: h('p', {}, `The current profile is saved as ${a.version} first, so nothing is lost.`), actions: [{ label: 'Restore', cls: 'primary', on: async () => {
    const s = v.snapshot ?? {}; const sv = await ctx.api.call('office.avatar.versions.save', { avatar: a.id, note: `Before restoring ${v.version}` }); if (!sv.ok) { toast('Couldn’t save the current version.', false); return false; }
    const r = await ctx.api.call('funnels.avatars.update', { id: a.id, name: s.name, ...(s.tagline != null ? { tagline: s.tagline } : {}), ...(s.role != null ? { role: s.role } : {}), ...(s.market != null ? { market: s.market } : {}), look: s.look ?? 0, profile: normalize(s.profile ?? {}) });
    if (!r.ok) { toast(messageFor(r.error?.code), false); return false; } toast(`Restored ${v.version}.`); view(r.data[0]); } }, { label: 'Cancel' }] });
  const exportPdf = async (a, p) => { const { printBlocks } = await import('../modules/docexport.js'); const t = (x) => [{ x: String(x) }];
    const blocks = [{ t: 'title', c: t([a.name, a.tagline].filter(Boolean).join(', ')) }, ...(a.role ? [{ t: 'subtitle', c: t(a.role) }] : [])];
    for (const s of p.sections) { if (!hasContent(s)) continue; blocks.push({ t: 'h1', c: t(s.title) });
      for (const b of s.blocks) { if (b.t === 'h') blocks.push({ t: 'h3', c: t(b.x) }); else if (b.t === 'table') for (const r of b.rows) blocks.push({ t: 'p', c: t(r.filter(Boolean).join(' — ')) }); else blocks.push({ t: 'p', c: t(b.t === 'li' ? `• ${b.x}` : b.x) }); } }
    try { await printBlocks({ blocks, page: { size: 'a4', margin: 'normal' }, title: a.name, imageSrc: async () => null }); } catch { toast('Couldn’t open the print window.', false); } };
  view(); return root;
}

/** A card body that shows its start; when the content is longer, clicking or pressing Enter on it opens the rest in place (no extra buttons). */
function clampBox(kids) {
  const box = h('div', { class: 'avb clamp' }, ...kids);
  requestAnimationFrame(() => { if (box.scrollHeight <= box.clientHeight + 4) { box.classList.remove('clamp'); return; }
    box.tabIndex = 0; box.setAttribute('role', 'button'); box.setAttribute('aria-expanded', 'false'); box.title = 'Show all';
    const toggle = () => { const open = box.classList.toggle('open'); box.setAttribute('aria-expanded', String(open)); box.title = open ? 'Show less' : 'Show all'; };
    box.addEventListener('click', (e) => { if (!e.target.closest('a')) toggle(); }); box.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }); });
  return box;
}

/** Choose the Profile cards: any section, its first table, or any of its sub-headings. Removing a card never deletes content. */
function pickCards(p, saveProfile, a) {
  const chosen = new Set(p.cards.map((k) => `${k.sid}|${k.sub}`)); const order = p.cards.map((k) => `${k.sid}|${k.sub}`);
  const box = (key, label, small) => { const i = h('input', { type: 'checkbox', ...(chosen.has(key) ? { checked: true } : {}), onchange: () => { if (i.checked) { chosen.add(key); if (!order.includes(key)) order.push(key); } else chosen.delete(key); } });
    return h('label', { class: `chk ${small ? 'sub' : ''}`.trim() }, i, ' ', label); };
  const list = h('div', { class: 'cardpick' }, ...p.sections.map((s) => h('div', { class: 'cp-sec' }, box(`${s.id}|`, h('b', {}, s.title)),
    s.blocks.some((b) => b.t === 'table') ? box(`${s.id}|#table`, 'Its first table (At a glance)', true) : null, ...subHeadings(s).map((x) => box(`${s.id}|${x}`, x, true)))));
  dialog({ title: `What ${a.name}’s profile shows`, wide: true, body: [h('p', { class: 'hint' }, 'Tick a section to show all of it, or tick parts of it. Unticking only takes it off the profile; the Full profile keeps everything.'), list],
    actions: [{ label: 'Save', cls: 'primary', on: () => saveProfile({ ...p, cards: order.filter((k) => chosen.has(k)).map((k) => { const i = k.indexOf('|'); return { sid: k.slice(0, i), sub: k.slice(i + 1) }; }) }, 'Profile updated.') }, { label: 'Cancel' }] });
}

// ---------------------------------------------------------------- edit mode: any section — add, rename, retype, reorder, delete; edit its content
const drafts = new Map();   // id → unsaved draft, kept while moving between sections
const BLOCK_KINDS = [['h', 'Sub-heading'], ['p', 'Paragraph'], ['li', 'List item'], ['table', 'Table']];
export function avatarEditView(ctx, id, chapter = 'about') {
  const wrap = h('div', { class: 'studio-wrap' }, skeleton(4)); const root = h('div', { class: 'v8p-office' }, wrap);
  root.__focused = { title: 'Editing avatar', sub: 'Changes update the profile and the full profile together', back: base(id), actions: [h('a', { class: 'btn quiet sm', href: base(id) }, 'Cancel')] };
  (async () => {
    let d = drafts.get(id);
    if (!d) { const r = await ctx.api.call('funnels.avatars.get', { id }); if (!ctx.live()) return; if (!r.ok || !r.data?.[0]) return put(wrap, r.ok || (r.status >= 400 && r.status < 500 && ![401, 408, 429].includes(r.status)) ? notFoundState(hrefFor.list('avatars'), 'Back to Customer Avatars') : errorState(() => ctx.rerender()));
      const a = r.data[0]; if (!ctx.can('funnels.avatar.edit', a.client_id) || a.archived_at) return put(wrap, emptyState({ title: 'You can’t edit this avatar', body: a.archived_at ? 'Restore it first.' : 'Ask an owner or admin for access.' }));
      d = { a, p: normalize(structuredClone(a.profile ?? {})), changed: false }; drafts.set(id, d); }
    const { a, p } = d; wrap.style.setProperty('--c', lookOf(a.look)[0]);
    const st = h('span', { class: `savest ${d.changed ? 'dirty' : ''}`.trim() }, h('i'), d.changed ? 'Unsaved changes' : 'Saved');
    const touch = () => { d.changed = true; dirty.set(`changes to ${a.name}`, () => save(true)); st.className = 'savest dirty'; st.lastChild.textContent = 'Unsaved changes'; };
    const goto = (k) => { dirty.clear(); ctx.go(`${base(id)}/edit/${k}`); };
    async function save(leaving = false) {
      const saveBtn = acts[2]; if (saveBtn) saveBtn.disabled = true;
      const r = await ctx.api.call('funnels.avatars.update', { id, name: a.name, tagline: a.tagline ?? '', role: a.role ?? '', market: a.market ?? '', look: a.look ?? 0, profile: p });
      if (saveBtn) saveBtn.disabled = false;
      if (!r.ok) { toast(messageFor(r.error?.code), false); return false; }   // stays on the form: nothing is lost
      drafts.delete(id); dirty.clear(); toast('Saved. The profile is up to date.');
      if (!leaving) ctx.go(/^s/.test(chapter) && p.sections.some((s) => s.id === chapter) ? `${base(id)}/deep?c=${chapter}` : base(id)); return true;
    }
    function newSection() {
      const title = h('input', { maxlength: 120, placeholder: 'e.g. Objections', 'aria-label': 'Section name' }); const kind = h('select', { 'aria-label': 'Kind of section' }, h('option', { value: 'custom' }, 'Custom section'), ...TYPE_OPTS.map(([k, l]) => h('option', { value: k }, l)));
      const prof = h('input', { type: 'checkbox' });
      kind.addEventListener('change', () => { if (!title.value.trim() && kind.value !== 'custom') title.value = typeTitle(kind.value); });
      dialog({ title: 'Add a section', body: [h('div', { class: 'fld' }, h('label', {}, 'Kind'), kind), h('div', { class: 'fld' }, h('label', {}, 'Name'), title), h('label', { class: 'chk' }, prof, ' Show it on the profile'),
        h('p', { class: 'hint' }, 'A known kind helps the Use it tab find copy angles. A custom section can hold anything.')],
      actions: [{ label: 'Add section', cls: 'primary', on: () => { const nm = title.value.trim() || (kind.value === 'custom' ? '' : typeTitle(kind.value)); if (!nm) { title.focus(); toast('Give the section a name.', false); return false; }
        const s = { id: newId(), type: kind.value, title: nm.slice(0, 120), blocks: [{ t: 'p', x: '' }] }; p.sections.push(s); if (prof.checked) p.cards.push({ sid: s.id, sub: '' }); touch(); history.replaceState(null, '', `${base(id)}/edit/${s.id}`); chapter = s.id; paint(); } },
      { label: 'Cancel', on: () => { if (chapter === 'new') { chapter = p.sections[0]?.id ?? 'about'; history.replaceState(null, '', `${base(id)}/edit/${chapter}`); paint(); } } }] });
      if (chapter === 'new') { chapter = p.sections[0]?.id ?? 'about'; paint(); }
    }
    const acts = [st, h('a', { class: 'btn quiet sm', href: base(id), onclick: () => { drafts.delete(id); dirty.clear(); } }, 'Cancel'), btn('Save', () => save(), 'primary sm')];
    root.__focused.title = `Editing: ${a.name}`; root.__focused.actions = acts; document.querySelector('.focusbar-acts')?.replaceChildren(...acts); const tt = document.querySelector('.focusbar .hdr-ttl b'); if (tt) tt.textContent = root.__focused.title;
    if (d.changed) dirty.set(`changes to ${a.name}`, () => save(true));
    function paint() {
      if (!['about', 'evidence'].includes(chapter) && !p.sections.some((s) => s.id === chapter)) chapter = 'about';
      const move = (i, dir) => { const j = i + dir; if (j < 0 || j >= p.sections.length) return; [p.sections[i], p.sections[j]] = [p.sections[j], p.sections[i]]; touch(); paint(); };
      const nav = h('nav', { class: 'chapters' }, h('p', { class: 'over' }, 'Sections'),
        h('a', { href: `${base(id)}/edit/about`, onclick: (e) => { e.preventDefault(); chapter = 'about'; history.replaceState(null, '', `${base(id)}/edit/about`); paint(); }, ...(chapter === 'about' ? { 'aria-current': 'page' } : {}) }, 'Name and look'),
        ...p.sections.map((s, i) => h('a', { href: `${base(id)}/edit/${s.id}`, title: s.title, onclick: (e) => { e.preventDefault(); chapter = s.id; history.replaceState(null, '', `${base(id)}/edit/${s.id}`); paint(); }, ...(s.id === chapter ? { 'aria-current': 'page' } : {}) }, `${i + 1}. ${s.title}`)),
        h('a', { href: `${base(id)}/edit/evidence`, onclick: (e) => { e.preventDefault(); chapter = 'evidence'; history.replaceState(null, '', `${base(id)}/edit/evidence`); paint(); }, ...(chapter === 'evidence' ? { 'aria-current': 'page' } : {}) }, 'Evidence'),
        h('button', { class: 'addrow', type: 'button', onclick: newSection }, icon('plus'), 'Add a section'));
      const ed = h('div', {});
      if (chapter === 'about') {
        const inp = (k, lbl, ph) => { const i = h('input', { value: a[k] ?? '', placeholder: ph, maxlength: 200, oninput: () => { a[k] = i.value; touch(); } }); return h('div', { class: 'field' }, h('label', {}, lbl), i); };
        const market = h('select', { onchange: () => { a.market = market.value; touch(); } }, ...[...new Set(['Wealth', 'Health', 'Relationships', ...(a.market ? [a.market] : [])])].map((m) => h('option', {}, m))); market.value = a.market || 'Wealth';
        put(ed, h('div', { class: 'edhead' }, h('h2', { class: 'grow' }, 'Name and look')), h('div', { class: 'row2' }, inp('name', 'Avatar name', 'John'), inp('tagline', 'Short description', 'the One Comma Club chaser')), h('div', { class: 'row2' }, inp('role', 'Role', 'Course creator · coach'), h('div', { class: 'field' }, h('label', {}, 'Market'), market)),
          h('p', { class: 'sec-t' }, 'Look'), h('div', { class: 'pickgrid' }, ...AVPICK.map((x, i) => h('button', { type: 'button', class: `pick ${a.look === i ? 'on' : ''}`.trim(), 'aria-pressed': String(a.look === i), 'aria-label': `Look ${i + 1}`, style: `--c:${x[0]}`, onclick: () => { a.look = i; touch(); paint(); } }, h('span', { class: 'avc-art sm' }, figure(i))))));
      } else if (chapter === 'evidence') {
        p.ev = p.ev ?? []; const box = h('div', { class: 'edtable' });
        const paintEv = () => box.replaceChildren(...p.ev.map((row, i) => h('div', { class: 'edr' }, h('input', { value: row[0] ?? '', 'aria-label': `Claim ${i + 1}`, placeholder: 'Claim', maxlength: 500, oninput: (e) => { row[0] = e.target.value; touch(); } }),
          h('input', { value: row[1] ?? '', 'aria-label': `Status ${i + 1}`, placeholder: 'How we know', maxlength: 300, oninput: (e) => { row[1] = e.target.value; touch(); } }),
          (() => { const s = h('select', { class: 'sel sm', 'aria-label': `Kind ${i + 1}`, onchange: (e) => { row[2] = e.target.value; touch(); } }, h('option', { value: 'a' }, 'Assumption'), h('option', { value: 'v' }, 'Verified')); s.value = row[2] ?? 'a'; return s; })(),
          h('button', { class: 'iconbtn xs', type: 'button', 'aria-label': `Remove claim ${i + 1}`, onclick: () => { p.ev.splice(i, 1); touch(); paintEv(); } }, icon('trash')))),
          h('button', { class: 'addrow', type: 'button', onclick: () => { p.ev.push(['', '', 'a']); touch(); paintEv(); box.querySelector('.edr:last-of-type input')?.focus(); } }, icon('plus'), 'Add evidence'));
        paintEv(); put(ed, h('div', { class: 'edhead' }, h('h2', { class: 'grow' }, 'Evidence')), h('p', { class: 'hint' }, 'What you know for sure, and what is still a guess.'), box);
      } else {
        const i = p.sections.findIndex((s) => s.id === chapter); const s = p.sections[i];
        const onProf = p.cards.some((k) => k.sid === s.id && !k.sub);
        const title = h('input', { class: 'tp-title', 'aria-label': 'Section name', maxlength: 120, value: s.title, oninput: (e) => { s.title = e.target.value.slice(0, 120) || 'Untitled section'; touch(); nav.querySelector('[aria-current] ')?.replaceChildren(`${i + 1}. ${s.title}`); } });
        const kind = h('select', { class: 'sel sm', 'aria-label': 'Kind of section', onchange: (e) => { s.type = e.target.value; touch(); } }, h('option', { value: 'custom' }, 'Custom section'), ...TYPE_OPTS.map(([k, l]) => h('option', { value: k }, l))); kind.value = TYPES.some(([k]) => k === s.type) ? s.type : 'custom';
        const prof = h('label', { class: 'chk' }, h('input', { type: 'checkbox', ...(onProf ? { checked: true } : {}), onchange: (e) => { p.cards = p.cards.filter((k) => !(k.sid === s.id && !k.sub)); if (e.target.checked) p.cards.push({ sid: s.id, sub: '' }); touch(); } }), ' Show the whole section on the profile');
        const del = h('button', { class: 'btn quiet sm dng', type: 'button', onclick: () => dialog({ title: `Delete “${s.title}”?`, body: h('p', {}, 'The section and its content leave this avatar when you save. A saved version keeps the old copy.'),
          actions: [{ label: 'Delete section', cls: 'dng', on: () => { p.sections.splice(i, 1); p.cards = p.cards.filter((k) => k.sid !== s.id); touch(); chapter = p.sections[Math.max(0, i - 1)]?.id ?? 'about'; history.replaceState(null, '', `${base(id)}/edit/${chapter}`); paint(); } }, { label: 'Cancel' }] }) }, icon('trash'), 'Delete section');
        const preview = btn([icon('eye'), 'Preview'], () => dialog({ title: s.title, wide: true, body: h('div', { class: 'avb' }, ...renderBlocks(s.blocks)), actions: [{ label: 'Close' }] }), 'quiet sm');
        const up = btn([h('span', { style: 'display:inline-flex;transform:rotate(-90deg)' }, icon('right')), 'Move up'], () => move(i, -1), 'quiet sm', i === 0 ? { disabled: true } : {});
        const down = btn([h('span', { style: 'display:inline-flex;transform:rotate(90deg)' }, icon('right')), 'Move down'], () => move(i, 1), 'quiet sm', i === p.sections.length - 1 ? { disabled: true } : {});
        put(ed, h('div', { class: 'edhead' }, title), h('div', { class: 'tb6 edtools' }, h('label', { class: 'edkind' }, h('span', {}, 'Kind'), kind), prof, h('span', { class: 'grow' }), up, down, preview, del), blockEditor(s, touch),
          s.type === 'custom' ? null : h('p', { class: 'hint', style: 'margin-top:8px' }, `Kind: ${typeTitle(s.type)}. Sub-headings such as “External desires” or a beliefs table let the Use it tab find copy angles.`));
      }
      put(wrap, h('div', { class: 'studio-body' }, h('div', { class: 'deep' }, nav, h('div', {}, ed,
        h('div', { class: 'notice plain', style: 'margin-top:14px' }, icon('refresh'), h('span', {}, 'There is one copy of the content: the Full profile and the profile cards update as soon as you save.'))))));
    }
    if (chapter === 'new') newSection(); else paint();
  })();
  return root;
}

/** Edit a section's content: sub-headings, paragraphs, list items and tables, in any order. */
function blockEditor(s, touch) {
  const box = h('div', { class: 'blked' });
  const paint = () => {
    box.replaceChildren(...s.blocks.map((b, i) => {
      const kind = h('select', { class: 'sel sm', 'aria-label': `Block ${i + 1} kind`, onchange: (e) => { const t = e.target.value; const text = b.t === 'table' ? blocksText([b]) : b.x ?? '';
        s.blocks[i] = t === 'table' ? { t, rows: [['Column 1', 'Column 2'], [text.split('\n')[0] ?? '', '']] } : { t, x: text }; touch(); paint(); } }, ...BLOCK_KINDS.map(([k, l]) => h('option', { value: k }, l))); kind.value = b.t;
      let field;
      if (b.t === 'table') {
        const n = Math.max(1, ...b.rows.map((r) => r.length));
        field = h('div', { class: 'tblwrap' }, h('table', { class: 'tbl edt' }, h('tbody', {}, ...b.rows.map((r, ri) => h('tr', {}, ...Array.from({ length: n }, (_, ci) => h(ri ? 'td' : 'th', {}, h('input', { value: r[ci] ?? '', 'aria-label': `${ri ? `Row ${ri}` : 'Header'}, column ${ci + 1}`, maxlength: 1000, oninput: (e) => { r[ci] = e.target.value; touch(); } }))),
          h('td', {}, ri ? h('button', { class: 'iconbtn xs', type: 'button', 'aria-label': `Remove row ${ri}`, onclick: () => { b.rows.splice(ri, 1); touch(); paint(); } }, icon('x')) : null))))),
        h('div', { class: 'tb6' }, btn([icon('plus'), 'Row'], () => { b.rows.push(Array(n).fill('')); touch(); paint(); }, 'quiet sm'), btn([icon('plus'), 'Column'], () => { b.rows.forEach((r, ri) => { r.length = n; r.push(ri ? '' : `Column ${n + 1}`); }); touch(); paint(); }, 'quiet sm'),
          n > 1 ? btn('Remove last column', () => { b.rows.forEach((r) => { r.length = n - 1; }); touch(); paint(); }, 'quiet sm') : null));
      } else if (b.t === 'p') { field = h('textarea', { rows: Math.min(10, Math.max(2, Math.ceil((b.x ?? '').length / 90))), maxlength: 8000, 'aria-label': `Paragraph ${i + 1}`, oninput: (e) => { b.x = e.target.value; touch(); } }); field.value = b.x ?? ''; }
      else field = h('input', { value: b.x ?? '', maxlength: b.t === 'h' ? 200 : 1000, class: b.t === 'h' ? 'blk-h' : '', 'aria-label': `${b.t === 'h' ? 'Sub-heading' : 'List item'} ${i + 1}`, placeholder: b.t === 'h' ? 'Sub-heading' : 'List item',
        oninput: (e) => { b.x = e.target.value; touch(); }, onkeydown: (e) => { if (e.key === 'Enter' && b.t === 'li') { e.preventDefault(); s.blocks.splice(i + 1, 0, { t: 'li', x: '' }); touch(); paint(); box.querySelectorAll('.blk')[i + 1]?.querySelector('input')?.focus(); } } });
      return h('div', { class: `blk blk-${b.t}` }, h('div', { class: 'blk-side' }, kind,
        h('button', { class: 'iconbtn xs', type: 'button', 'aria-label': `Move block ${i + 1} up`, disabled: i === 0, onclick: () => { [s.blocks[i - 1], s.blocks[i]] = [s.blocks[i], s.blocks[i - 1]]; touch(); paint(); } }, h('span', { style: 'display:inline-flex;transform:rotate(-90deg)' }, icon('right'))),
        h('button', { class: 'iconbtn xs', type: 'button', 'aria-label': `Move block ${i + 1} down`, disabled: i === s.blocks.length - 1, onclick: () => { [s.blocks[i + 1], s.blocks[i]] = [s.blocks[i], s.blocks[i + 1]]; touch(); paint(); } }, h('span', { style: 'display:inline-flex;transform:rotate(90deg)' }, icon('right'))),
        h('button', { class: 'iconbtn xs', type: 'button', 'aria-label': `Remove block ${i + 1}`, onclick: () => { s.blocks.splice(i, 1); touch(); paint(); } }, icon('trash'))), h('div', { class: 'blk-main' }, field));
    }), h('div', { class: 'tb6 blk-add' }, h('span', { class: 'hint' }, 'Add:'), ...BLOCK_KINDS.map(([k, l]) => btn([icon('plus'), l], () => { s.blocks.push(k === 'table' ? { t: 'table', rows: [['Column 1', 'Column 2'], ['', '']] } : { t: k, x: '' }); touch(); paint(); box.querySelector('.blk:last-of-type input, .blk:last-of-type textarea')?.focus(); }, 'quiet sm'))));
  };
  paint(); return box;
}

// ---------------------------------------------------------------- Avatar Studio settings: the sections NEW avatars start with (existing avatars never change)
export function avatarSettingsView(ctx) {
  const root = h('div', { class: 'v8p-office' }); const body = h('div', {}, skeleton(3)); const admin = ctx.isAdmin || ctx.isOwner;
  root.__focused = { title: 'Avatar settings', sub: 'Office › Funnels › Customer Avatars', back: hrefFor.list('avatars'), actions: [] };
  let list = []; let changed = false;
  const touch = () => { changed = true; dirty.set('Avatar settings', () => save(true)); };
  const save = async (leaving = false) => {
    if (!list.length) { toast('Keep at least one section.', false); return false; }
    const r = await ctx.api.call('office.avatar.settings.set', { sections: list }); if (!r.ok || !r.data?.[0]) { toast(r.status === 403 ? 'Only owners and admins can change these.' : 'Couldn’t save the settings.', false); return false; }
    changed = false; dirty.clear(); toast('Saved. New avatars start with these sections.'); if (!leaving) ctx.go(hrefFor.list('avatars')); return true;
  };
  const paint = () => {
    const rows = list.map((d, i) => h('div', { class: 'edr setrow' },
      h('input', { value: d.title, maxlength: 120, 'aria-label': `Section ${i + 1} name`, disabled: !admin, oninput: (e) => { d.title = e.target.value; touch(); } }),
      (() => { const s = h('select', { class: 'sel sm', 'aria-label': `Section ${i + 1} kind`, disabled: !admin, onchange: (e) => { d.type = e.target.value; touch(); } }, h('option', { value: 'custom' }, 'Custom'), ...TYPE_OPTS.map(([k, l]) => h('option', { value: k }, l))); s.value = d.type; return s; })(),
      h('label', { class: 'chk' }, h('input', { type: 'checkbox', disabled: !admin, ...(d.profile ? { checked: true } : {}), onchange: (e) => { d.profile = e.target.checked; touch(); } }), ' On the profile'),
      admin ? [h('button', { class: 'iconbtn xs', type: 'button', 'aria-label': `Move ${d.title} up`, disabled: i === 0, onclick: () => { [list[i - 1], list[i]] = [list[i], list[i - 1]]; touch(); paint(); } }, h('span', { style: 'display:inline-flex;transform:rotate(-90deg)' }, icon('right'))),
        h('button', { class: 'iconbtn xs', type: 'button', 'aria-label': `Move ${d.title} down`, disabled: i === list.length - 1, onclick: () => { [list[i + 1], list[i]] = [list[i], list[i + 1]]; touch(); paint(); } }, h('span', { style: 'display:inline-flex;transform:rotate(90deg)' }, icon('right'))),
        h('button', { class: 'iconbtn xs', type: 'button', 'aria-label': `Remove ${d.title}`, onclick: () => { list.splice(i, 1); touch(); paint(); } }, icon('trash'))] : null));
    put(body, h('section', { class: 'card6 pad-s' }, h('p', { class: 'hint', style: 'margin-bottom:10px' }, 'New avatars started blank get these sections, in this order. “On the profile” puts the section on the Profile page. An imported document keeps its own sections; these only decide which of them go on the Profile. Changing this never changes an avatar you already have.'),
      h('div', { class: 'edtable' }, ...rows), admin ? h('div', { class: 'tb6', style: 'margin-top:10px' }, btn([icon('plus'), 'Add a default section'], () => { list.push({ type: 'custom', title: 'New section', profile: false }); touch(); paint(); body.querySelector('.setrow:last-of-type input')?.focus(); }, 'ghost sm'),
        btn('Use the standard set', () => { list = structuredClone(DEFAULT_SETTINGS.sections); touch(); paint(); }, 'quiet sm'), h('span', { class: 'grow' }), btn('Save', () => save(), 'primary sm')) : h('p', { class: 'hint' }, 'Only owners and admins can change these.')));
  };
  (async () => { const s = await settingsOf(ctx); if (!ctx.live()) return; list = structuredClone(s.sections); paint();
    put(root, h('div', { class: 'ph6' }, h('div', {}, h('h1', { class: 't1', 'data-page-title': true }, 'Avatar settings'), h('p', { class: 'hint' }, 'The sections every new customer avatar starts with.'))), body); })();
  put(root, body); return root;
}
