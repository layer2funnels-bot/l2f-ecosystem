// Drive (v4): the organization library and each person's Personal space. Folders, files, documents and spreadsheets in one list or grid, uploads by drag and drop
// (files and whole folders) with a progress panel, a details drawer (Details, Sharing, Versions), Trash. Files that belong to another app (project, client, whiteboard…) are
// stored in the same place but are not listed here unless someone adds them to the library. Everything goes through the permission-checked API; the database decides.
import { inp, h, put, icon, btn, dialog, drawer, toast, field, notice, skeleton, emptyState, errorState, noAccessState, readOnlyNotice } from '../ui.js';
import { emptyDoc, serialize } from './docmodel.js';
import { emptyBook, serializeBook, MIME as SHEET_MIME } from './sheetmodel.js';
import { mediaHref } from './mediamodel.js';
import { emptyBoard } from './boardmodel.js';
import { ICONS } from '../icons.js';
import { SLIDES_MIME, v8Type, v8Tile } from './driveutil.js';
import { templatesFor } from './drivetemplates.js';
import { DOC_MIME, BOARD_MIME, CORS_HINT, previewKind, convertTarget, opensInEditor, fileType, matchesType, isImage, formatSize, classifyUploadError, precheckUploads, sortRows } from './driveutil.js';

export const driveHref = (space, folder) => (space === 'personal' ? `#/drive/personal${folder ? `/f/${folder}` : ''}` : folder ? `#/drive/f/${folder}` : '#/drive/mydrive');
const when = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode: the choice lasts for this page only */ } };
/** The file-type tile (Design v4): the type's short label on its own colour (one colour per kind, see drive.css). */
// a drawing per kind, in the same line style as the icon set (document, file, picture, video, audio are drawn here; the rest reuse the set)
Object.assign(ICONS, {
  'dr-doc': [['path', { d: 'M6 3h8l4 4v14H6z' }], ['path', { d: 'M14 3v4h4M9 12h6M9 15.5h6' }]], 'dr-file': [['path', { d: 'M6 3h8l4 4v14H6z' }], ['path', { d: 'M14 3v4h4' }]],
  'dr-image': [['rect', { x: '3.5', y: '5', width: '17', height: '14', rx: '2.4' }], ['circle', { cx: '9', cy: '10', r: '1.6' }], ['path', { d: 'M4 17l5-4.5 3.5 3 3-2.5L20 16' }]],
  'dr-video': [['rect', { x: '3.5', y: '6', width: '12', height: '12', rx: '2.4' }], ['path', { d: 'M15.5 11l5-3v8l-5-3z' }]],
  'dr-audio': [['path', { d: 'M9 17V6l10-2v11' }], ['circle', { cx: '6.5', cy: '17.5', r: '2.5' }], ['circle', { cx: '16.5', cy: '15.5', r: '2.5' }]],
});
const KIND_ICON = { document: 'dr-doc', sheet: 'table', board: 'board', image: 'dr-image', pdf: 'dr-doc', video: 'dr-video', audio: 'dr-audio', zip: 'archive', text: 'list', other: 'dr-file' };
const ftile = (f) => { const t = fileType(f); return h('span', { class: `ftile ft-${t.key}`, 'aria-hidden': 'true' }, icon(KIND_ICON[t.key])); };
const folderTile = () => h('span', { class: 'ftile folder', 'aria-hidden': 'true' }, icon('folder'));
/** The one tag/chip used in Drive: never wider than its box, cut with an ellipsis, full text on hover. */
const tag = (text, kind = '') => h('span', { class: `drv-tag${kind ? ` ${kind}` : ''}`, title: text }, text);
const srOnly = (t) => h('span', { class: 'sr' }, t);
export const openHref = (f) => (mediaHref(f) ?? (f.mime_type === SHEET_MIME ? `#/sheet/${f.id}` : f.mime_type === SLIDES_MIME ? `#/slides/${f.id}` : f.mime_type === BOARD_MIME ? `#/board/${f.id}` : f.kind === 'document' ? `#/doc/${f.id}` : null));
const SORTS = [['name', 'Name'], ['modified', 'Last modified'], ['size', 'Size']];
const TYPES = [['all', 'All types'], ['Document', 'Documents'], ['Spreadsheet', 'Spreadsheets'], ['Whiteboard', 'Whiteboards'], ['image', 'Images'], ['pdf', 'PDFs'], ['media', 'Video and audio'], ['other', 'Other files']];

let openPop = null;       // the one open pop-up menu (closing it is idempotent)
const closePop = () => { openPop?.(); openPop = null; };

export function driveView({ api, ctx, route }) {
  const root = h('section', { class: 'drv v8p-drive' }); const main = h('div', { class: 'drv-main' });
  const live = () => ctx.live() && root.isConnected;
  const space = route.space === 'personal' ? 'personal' : 'shared'; const view = route.view ?? 'files'; const folderId = route.folder ?? null;
  const canWriteLibrary = ctx.can('drive.file.upload');
  // Personal: anyone with Drive may keep files there (the database decides); the Library needs the right to add files
  const canWrite = space === 'personal' ? true : canWriteLibrary || ctx.canAnywhere('drive.file.upload');
  const isOwner = !!ctx.isOwner; const myId = ctx.userId;
  const fail = (r, what = 'do that') => toast(r?.status === 404 ? `You can’t ${what} here.` : (r?.error?.message ?? 'Something went wrong. Try again.'), false);
  const state = { q: '', type: 'all', sort: SORTS.some(([k]) => k === lsGet('l2f.drive.sort')) ? lsGet('l2f.drive.sort') : 'name', dir: lsGet('l2f.drive.dir') === 'desc' ? -1 : 1, mode: lsGet('l2f.drive.view') === 'grid' ? 'grid' : 'list', starOnly: false, folders: [], files: [], selected: new Set() };
  // stars are kept per person on the server (every device sees them); stars from the old browser-only list are moved there once
  const stars = new Set(); const folderStars = new Set();
  const starsReady = (async () => {
    const r = await api.call('drive.stars.list', {}); if (r.ok) for (const x of r.data) x.file_id ? stars.add(x.file_id) : folderStars.add(x.folder_id);
    const oldKey = `l2f.drive.stars.${ctx.orgName}`; let old = []; try { old = JSON.parse(lsGet(oldKey) ?? '[]'); } catch { old = []; }
    if (Array.isArray(old) && old.length) { for (const id of old.slice(-200)) if (!stars.has(id)) { const x = await api.call('drive.stars.set', { file: id, on: true }); if (x.ok) stars.add(id); } try { localStorage.removeItem(oldKey); } catch { /* private mode */ } }
  })();
  const toggleStar = async (ids, on) => {
    const want = on ?? !ids.every((id) => stars.has(id));
    for (const id of ids) want ? stars.add(id) : stars.delete(id); paintStars(ids);
    const res = await Promise.all(ids.map((id) => api.call('drive.stars.set', { file: id, on: want })));
    if (res.some((r) => !r.ok)) { for (const id of ids) want ? stars.delete(id) : stars.add(id); toast('Couldn’t change the star. Try again.', false); paintStars(ids); }
  };
  const paintStars = (ids) => { for (const id of ids) for (const b of root.querySelectorAll(`[data-star="${id}"]`)) { const on = stars.has(id); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-label', `${on ? 'Remove star from' : 'Star'} ${byId.get(id)?.file?.name ?? 'file'}`); } if (state.starOnly && view === 'files') paint(); };

  // ---------------------------------------------------------------- navigation
  // the spaces (library, Personal, Recent, Trash) live in the app's side rail (appnav.js)
  const crumb = h('nav', { class: 'fpath fine', 'aria-label': 'Folder path' });

  // ---------------------------------------------------------------- pop-up menu (row actions, New)
  function popMenu(anchor, items, label) {
    closePop();
    const menu = h('div', { class: 'drv-pop', role: 'group', 'aria-label': label }, ...items.filter(Boolean).map((a) => h('button', { type: 'button', class: `drv-pop-i${a.danger ? ' danger' : ''}`, onclick: () => { closePop(); a.on(); } }, a.ic ? icon(a.ic) : null, h('span', {}, a.label))));
    document.body.append(menu);
    const r = anchor.getBoundingClientRect(); const mw = menu.offsetWidth; const mh = menu.offsetHeight;
    const left = Math.max(8, Math.min(innerWidth - mw - 8, r.right - mw)); const below = r.bottom + 6 + mh <= innerHeight - 8; const top = below ? r.bottom + 6 : Math.max(8, r.top - 6 - mh);
    menu.style.left = `${left}px`; menu.style.top = `${top}px`;
    const btns = [...menu.querySelectorAll('button')]; btns[0]?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closePop(); anchor.focus?.(); } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const i = btns.indexOf(document.activeElement); btns[(i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length]?.focus(); }
      else if (e.key === 'Tab') closePop();
    };
    const onDown = (e) => { if (!menu.contains(e.target) && !anchor.contains(e.target)) closePop(); };
    document.addEventListener('keydown', onKey, true); document.addEventListener('pointerdown', onDown, true); window.addEventListener('resize', closePop); window.addEventListener('hashchange', closePop);
    openPop = () => { menu.remove(); document.removeEventListener('keydown', onKey, true); document.removeEventListener('pointerdown', onDown, true); window.removeEventListener('resize', closePop); window.removeEventListener('hashchange', closePop); };
  }

  // ---------------------------------------------------------------- loading
  async function load() {
    if (view === 'files') { /* keep the toolbar, replace only the list */ list.replaceChildren(skeleton(3)); } else if (!main.firstChild) put(main, skeleton(4));
    if (view === 'trash') return trash();
    if (view === 'recent') return recent();
    if (view === 'home') return homePage();
    if (view === 'type') return typePage();
    if (view === 'starred') return starredPage();
    if (view === 'shared') return sharedWithMe();
    if (view === 'open') return openLink();
    const arg = { space, ...(folderId ? { parent: folderId } : {}) };
    const [fo, fi, path, prot] = await Promise.all([api.call('drive.folders.list', arg), api.call('drive.files.list', { space, ...(folderId ? { folder: folderId } : {}), ...(state.q ? { q: state.q } : {}), ...(state.q || state.starOnly ? { anywhere: true } : {}) }), folderId ? api.call('drive.folders.path', { id: folderId }) : Promise.resolve({ ok: true, data: [] }), folderId ? api.call('drive.folders.protection', { id: folderId }) : Promise.resolve({ ok: true, data: [] })]);
    if (!live()) return;
    if (!fo.ok || !fi.ok) return put(view === 'files' ? list : main, fi.status === 404 || fo.status === 404 ? noAccessState({ action: h('a', { class: 'btn', href: driveHref(space) }, 'Back to Drive') }) : errorState(load));
    if (folderId && !path.data.length) return put(list, noAccessState({ title: 'Folder not found', action: h('a', { class: 'btn', href: driveHref(space) }, 'Back to Drive') }));
    const gate = prot.ok && prot.data[0]; const crumbs = () => put(crumb, h('a', { href: driveHref(space) }, space === 'personal' ? 'Personal' : `${ctx.orgName} library`), ...path.data.flatMap((p) => [h('span', { class: 'sep', 'aria-hidden': 'true' }, '/'), p.id === folderId ? h('b', { title: p.name }, p.name) : h('a', { href: driveHref(space, p.id), title: p.name }, p.name)]));
    if (gate && gate.protected && !gate.unlocked) { state.folders = []; state.files = []; state.selected.clear(); crumbs(); put(list, unlockPrompt(path.data.at(-1)?.name ?? 'This folder')); paintSel(); return; }
    crumb.hidden = !folderId; crumbName = path.data?.at(-1)?.name ?? null; if (folderId) refreshTools();
    state.folders = state.q || state.starOnly ? [] : fo.data; state.files = fi.data; state.selected.clear();
    put(crumb, h('a', { href: driveHref(space) }, space === 'personal' ? 'Personal' : `${ctx.orgName} library`), ...path.data.flatMap((p) => [h('span', { class: 'sep', 'aria-hidden': 'true' }, '/'), p.id === folderId ? h('b', { title: p.name }, p.name) : h('a', { href: driveHref(space, p.id), title: p.name }, p.name)]));
    paint();
  }
  const bar = h('div', { class: 'selbar drv-sel', hidden: true, role: 'region', 'aria-label': 'Selected items' });
  const list = h('div', { class: 'drv-list' });

  // ---------------------------------------------------------------- toolbar: search, type, sort, view
  const search = h('input', { type: 'search', placeholder: space === 'personal' ? 'Search your files' : 'Search the library', 'aria-label': 'Search files', autocomplete: 'off' }); let t = null;
  search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { state.q = search.value.trim(); load(); }, 250); });
  const typeSel = h('select', { class: 'sel', 'aria-label': 'Type', onchange: (e) => { state.type = e.target.value; paint(); } }, ...TYPES.map(([k, x]) => h('option', { value: k }, x)));
  const sortSel = h('select', { class: 'sel', 'aria-label': 'Sort by', onchange: (e) => { state.sort = e.target.value; lsSet('l2f.drive.sort', state.sort); paint(); } }, ...SORTS.map(([k, x]) => h('option', { value: k, ...(k === state.sort ? { selected: true } : {}) }, x)));
  const dirBtn = h('button', { type: 'button', class: 'btn ghost drv-dir', onclick: () => { state.dir = -state.dir; lsSet('l2f.drive.dir', state.dir < 0 ? 'desc' : 'asc'); dirState(); paint(); } }, icon('down'));
  const dirState = () => { dirBtn.setAttribute('aria-label', state.dir > 0 ? 'Sorted ascending. Switch to descending' : 'Sorted descending. Switch to ascending'); dirBtn.title = state.dir > 0 ? 'Ascending' : 'Descending'; dirBtn.dataset.dir = state.dir > 0 ? 'asc' : 'desc'; }; dirState();
  const starBtn = h('button', { type: 'button', class: 'btn ghost drv-starbtn', 'aria-pressed': 'false', title: 'Show only starred files', onclick: () => { state.starOnly = !state.starOnly; starBtn.setAttribute('aria-pressed', String(state.starOnly)); load(); } }, icon('star'), h('span', { class: 'lbl' }, 'Starred'));
  const modeBtn = (k, ic, label) => h('button', { type: 'button', 'data-k': k, 'aria-pressed': String(state.mode === k), 'aria-label': label, title: `${label}`, onclick: () => { state.mode = k; lsSet('l2f.drive.view', k); modes.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === k))); paint(); } }, icon(ic));
  const modes = h('div', { class: 'vsw drv-modes', role: 'group', 'aria-label': 'View' }, modeBtn('list', 'list', 'List view'), modeBtn('grid', 'tiles', 'Grid view'));

  // ---------------------------------------------------------------- thumbnails (images, in the grid and on Home), fetched only when they scroll into view
  const thumbUrls = new Map();
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((entries) => { for (const e of entries) if (e.isIntersecting) { io.unobserve(e.target); fillThumb(e.target); } }, { rootMargin: '200px' }) : null;
  async function fillThumb(art) {
    const f = art.__file; if (!f || !live()) return;
    let url = thumbUrls.get(f.id);
    if (!url) { const r = await api.call('drive.files.download', { id: f.id }); url = r.ok && r.data?.[0]?.url; if (!url) return; thumbUrls.set(f.id, url); }
    if (!art.isConnected) return;
    const img = h('img', { alt: '', decoding: 'async', draggable: 'false' }); img.onload = () => { art.replaceChildren(img); art.classList.add('has-img'); }; img.onerror = () => { thumbUrls.delete(f.id); }; img.src = url;
  }
  const art = (f, big) => { const el = h('span', { class: `drv-art${big ? ' xl' : ''}`, 'aria-hidden': 'true' }, ftile(f)); if (isImage(f)) { el.__file = f; io ? io.observe(el) : fillThumb(el); } return el; };

  // ---------------------------------------------------------------- list and grid
  function visibleRows() {
    const files = state.files.filter((f) => matchesType(f, state.type) && (!state.starOnly || stars.has(f.id)) && owned(f));
    return sortRows([...(state.type !== 'all' ? [] : state.folders).map((d) => ({ folder: d })), ...files.map((f) => ({ file: f }))], state.sort, state.dir);
  }
  function paint() {
    const rows = visibleRows(); byId.clear(); for (const r of rows) byId.set((r.folder ?? r.file).id, r);
    const folders = rows.filter((r) => r.folder); const files = rows.filter((r) => r.file);
    let body;
    if (!rows.length) body = emptyState({ title: state.starOnly ? 'No starred files' : state.q ? 'No file matches' : state.type !== 'all' ? 'Nothing of this type here' : folderId ? 'This folder is empty' : space === 'personal' ? 'Your personal space is empty' : `${ctx.orgName} library is empty`,
      body: state.starOnly ? 'Star a file to find it here quickly.' : state.q ? 'Try another word.' : state.type !== 'all' ? 'Choose “All types” to see everything.' : canWrite ? 'Drop files or folders anywhere on this page, or use New.' : 'Nothing has been added here yet.', ic: 'drv', first: !state.q && !state.starOnly && state.type === 'all' && canWrite, action: canWrite && !state.q ? btn('New', (e) => newMenu(e.currentTarget), 'primary') : null });
    else body = h('div', { class: 'drv-home' }, folders.length ? folderTiles(folders.map((r) => r.folder)) : null, files.length ? (state.mode === 'grid' ? fileGrid(files.map((r) => r.file)) : fileTable(files.map((r) => r.file))) : null);
    put(list, body, state.files.length >= 500 || state.folders.length >= 500 ? notice('info', 'info', 'Showing the first 500 items. Use search to find the rest.') : null); paintSel();
    const first = list.querySelector('[data-item]'); if (first) first.tabIndex = 0;
  }
  // ---------------------------------------------------------------- V8 building blocks (prototype drive5.js / drive6.js markup)
  let people = null; const peopleReady = (async () => { const r = await api.call('projects.people', {}); people = r.ok ? r.data : []; })();
  const initials = (n) => String(n ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || '?';
  const ownerOf = (f) => { if (f.space === 'personal') return { name: 'You', you: true }; const m = people?.find((x) => x.user_id === f.uploaded_by); return m ? { name: m.is_you ? 'You' : m.display_name, you: !!m.is_you } : { name: 'A teammate' }; };
  const ownerChip = (f) => { const o = ownerOf(f); return h('span', { class: 'avatar', title: o.name, 'aria-label': `Owner: ${o.name}`, style: 'width:30px;height:30px;font-size:11px' }, initials(o.name)); };
  const ftV8 = (f, big) => { const [cls, label] = v8Tile(f); return h('span', { class: `ft ${cls}${big ? ' big' : ''}`, 'aria-hidden': 'true' }, label); };
  const rel = (iso) => { if (!iso) return ''; const d = new Date(iso); const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 864e5);
    return days === 0 ? `Today, ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : days === 1 ? 'Yesterday' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) }); };
  const starToggle = (f) => h('button', { type: 'button', 'data-star': f.id, class: `iconbtn star${stars.has(f.id) ? ' on' : ''}`, 'aria-pressed': String(stars.has(f.id)), 'aria-label': stars.has(f.id) ? `Remove star from ${f.name}` : `Star ${f.name}`, title: 'Star', onclick: () => toggleStar([f.id]) }, icon('star'));
  const detailsBtn = (f) => h('button', { type: 'button', class: 'iconbtn', 'aria-label': `Details of ${f.name}`, title: 'Details', onclick: () => details(f) }, icon('info'));
  function folderTiles(ds) {
    return h('div', { class: 'folders', role: 'list', 'aria-label': 'Folders' }, ...ds.map((d) => h('a', { class: 'folder', role: 'listitem', href: driveHref(d.space ?? space, d.id), 'data-item': d.id, 'data-drop-folder': d.id, tabindex: '-1', draggable: 'true', title: d.name, 'aria-label': `Folder ${d.name}` },
      icon('folder'), h('span', { class: 'fn' }, d.name), d.locked ? icon('lock') : null, d.protected ? icon('key') : null, folderStars.has(d.id) ? icon('star') : null)));
  }
  function fileTable(fs) {
    return h('div', { class: 'tblwrap' }, h('table', { class: 'tbl ftab' }, h('caption', { class: 'sr' }, 'Files'),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col', style: 'width:52px' }, selectAll()), h('th', { scope: 'col' }, 'Name'), h('th', { scope: 'col', class: 'hide-m' }, 'Owner'), h('th', { scope: 'col' }, 'Modified'), h('th', { scope: 'col', class: 'hide-m' }, 'Size'), h('th', { scope: 'col', style: 'width:132px' }, srOnly('Actions')))),
      h('tbody', {}, ...fs.map(fileRow))));
  }
  function fileRow(f) {
    return h('tr', { 'data-item': f.id, tabindex: '-1', draggable: 'true', 'aria-selected': String(state.selected.has(f.id)), 'aria-label': `${fileType(f).name} ${f.name}` },
      h('td', {}, pick(f)), h('td', { class: 't1' }, h('span', { class: 'fname' }, ftV8(f), nameOf(f), lockMark(f), f.protected_sop ? tag('Approved SOP', 'ok') : null)),
      h('td', { class: 'hide-m', 'data-l': 'Owner' }, ownerChip(f)), h('td', { 'data-l': 'Modified' }, rel(f.opened_at && view === 'recent' ? f.opened_at : f.updated_at)), h('td', { class: 'hide-m mono', 'data-l': 'Size', style: 'font-size:13px' }, formatSize(f.size_bytes)),
      h('td', { 'data-l': '' }, h('span', { style: 'display:flex;justify-content:flex-end' }, starToggle(f), detailsBtn(f), moreBtn(f, false))));
  }
  function fileGrid(fs) {
    return h('div', { class: 'fgrid', role: 'list', 'aria-label': 'Files' }, ...fs.map((f) => { const href = openHref(f); const t = v8Type(f) ?? 'doc';
      const thumb = h('div', { class: 'thumb', 'data-t': t }); if (isImage(f)) { thumb.__file = f; io ? io.observe(thumb) : fillThumb(thumb); }
      const inner = [thumb, h('div', { class: 'meta' }, ftV8(f), h('div', { style: 'min-width:0' }, h('b', { title: f.name }, f.name), h('small', {}, rel(f.updated_at))))];
      return h('div', { role: 'listitem', 'data-item': f.id, tabindex: '-1', draggable: 'true', style: 'position:relative' }, href ? h('a', { class: 'fcard', href, title: f.name }, ...inner) : h('button', { type: 'button', class: 'fcard', title: f.name, onclick: () => openFile(f) }, ...inner)); }));
  }
  /** "Suggested for you": the files you opened last, as light cards of one height (V8 bug fix #1). */
  function suggested(fs) {
    return h('div', { class: 'sugg' }, ...fs.map((f) => { const href = openHref(f); const t = v8Type(f) ?? 'doc'; const thumb = h('div', { class: 'thumb', 'data-t': t }); if (isImage(f)) { thumb.__file = f; io ? io.observe(thumb) : fillThumb(thumb); }
      const inner = [thumb, h('div', { class: 'meta' }, ftV8(f), h('div', { style: 'min-width:0' }, h('b', { title: f.name }, f.name), h('small', {}, f.opened_at ? `You opened ${rel(f.opened_at).replace(/^Today/, 'today').replace(/^Yesterday/, 'yesterday')}` : `Edited ${rel(f.updated_at).replace(/^Today/, 'today').replace(/^Yesterday/, 'yesterday')}`)))];
      return href ? h('a', { class: 'fcard', href, title: f.name }, ...inner) : h('button', { type: 'button', class: 'fcard', title: f.name, onclick: () => openFile(f) }, ...inner); }));
  }
  const byId = new Map();
  const selectAll = () => { const files = visibleRows(); if (!files.length) return srOnly('Select'); return h('input', { type: 'checkbox', 'aria-label': 'Select all', onchange: (e) => { for (const r of files) e.target.checked ? state.selected.add((r.file ?? r.folder).id) : state.selected.delete((r.file ?? r.folder).id); list.querySelectorAll('.drv-pick').forEach((c) => { c.checked = e.target.checked; }); paintSel(); } }); };
  const pick = (f) => h('input', { type: 'checkbox', class: 'drv-pick', 'aria-label': `Select ${f.name}`, ...(state.selected.has(f.id) ? { checked: true } : {}), onchange: (e) => { e.target.checked ? state.selected.add(f.id) : state.selected.delete(f.id); e.target.closest('tr')?.setAttribute('aria-selected', String(e.target.checked)); paintSel(); } });
  const moreBtn = (item, isFolder) => h('button', { type: 'button', class: 'btn quiet drv-more', 'aria-label': `Actions for ${item.name}`, title: 'Actions (Shift+F10)', 'aria-haspopup': 'true', onclick: (e) => rowMenu(e.currentTarget, item, isFolder) }, icon('more'));
  const nameOf = (f) => { const href = openHref(f); return href ? h('a', { href, title: f.name }, f.name) : h('button', { type: 'button', class: 'linklike', title: f.name, onclick: () => openFile(f) }, f.name); };
  const starMark = (f) => (stars.has(f.id) ? h('span', { class: 'drv-star', title: 'Starred', role: 'img', 'aria-label': 'Starred' }, icon('star')) : null);
  const lockMark = (it) => (it.locked ? h('span', { class: 'drv-lock', title: 'Locked: only owners can see this', role: 'img', 'aria-label': 'Locked' }, icon('lock')) : null);
  const pwMark = (d) => (d.protected ? h('span', { class: 'drv-lock pw', title: 'Password protected', role: 'img', 'aria-label': 'Password protected' }, icon('key')) : null);
  const fileCount = (d) => `${d.files} file${d.files === 1 ? '' : 's'}`;
  function paintSel() {
    const n = state.selected.size; bar.hidden = n === 0; if (!n) return;
    const recs = () => [...state.selected].map((id) => byId.get(id)).filter(Boolean); const files = () => recs().filter((r) => r.file).map((r) => r.file);
    put(bar, h('b', {}, `${n} selected`), files().length ? btn('Download', async () => { for (const f of files()) if (f.kind === 'file') await download(f); }, 'ghost') : null,
      files().length ? btn('Star', () => { const ids = files().map((f) => f.id); const on = !ids.every((id) => stars.has(id)); toggleStar(ids, on); toast(on ? 'Starred.' : 'Stars removed.'); }, 'ghost') : null,
      canWrite ? btn('Move to…', () => transferDialog(recs(), false), 'ghost') : null, btn('Copy to…', () => transferDialog(recs(), true), 'ghost'), canWrite ? btn('Move to Trash', () => trashRecs(recs()), 'ghost') : null, btn('Clear', () => { state.selected.clear(); paint(); }, 'quiet'));
  }
  async function download(f) {
    if (f.kind !== 'file') { const h2 = openHref(f); if (h2) ctx.go(h2); return; }
    const r = await api.call('drive.files.download', { id: f.id }); if (!r.ok || !r.data[0]) return fail(r, 'download that file');
    window.open(r.data[0].url, '_blank', 'noopener');
  }

  // ---------------------------------------------------------------- row menu
  function rowMenu(anchor, item, isFolder) {
    const mutable = canWrite && !item.protected_sop; const href = isFolder ? null : openHref(item); const pv = !isFolder && !href && previewKind(item);
    popMenu(anchor, [
      isFolder ? { label: 'Open', ic: 'folder', on: () => ctx.go(driveHref(space, item.id)) } : { label: href || (opensInEditor(item) && canWrite) ? 'Open' : pv ? 'Preview' : 'Download', ic: href || pv || opensInEditor(item) ? 'eye' : 'download', on: () => openFile(item) },
      ...(!isFolder && href && previewKind(item) ? [{ label: 'Preview', ic: 'eye', on: () => preview(item) }] : []),
      ...(!isFolder && convertTarget(item) && !opensInEditor(item) && canWrite ? [{ label: convertTarget(item) === 'doc' ? 'Open in Docs' : 'Open in Sheets', ic: convertTarget(item) === 'doc' ? 'doc' : 'table', on: () => openInEditor(item) }] : []),
      ...(!isFolder && opensInEditor(item) && previewKind(item) ? [{ label: 'Preview', ic: 'eye', on: () => preview(item) }] : []),
      !isFolder && !href ? { label: 'Download', ic: 'download', on: () => download(item) } : null,
      isFolder ? null : { label: stars.has(item.id) ? 'Remove star' : 'Star', ic: 'star', on: () => toggleStar([item.id]) },
      isFolder ? null : { label: 'Details', ic: 'info', on: () => details(item) },
      sharable(item) ? { label: 'Share…', ic: 'share', on: () => shareDialog(item, isFolder) } : null,
      sharable(item) && isOwner ? { label: item.locked ? 'Unlock' : 'Lock (owners only)', ic: 'lock', on: () => setLock(item, isFolder) } : null,
      isFolder && space === 'shared' && (isOwner || item.created_by === myId) ? { label: item.protected ? 'Change or remove password…' : 'Set password…', ic: 'key', on: () => passwordDialog(item) } : null,
      mutable ? { label: 'Rename', ic: 'edit', on: () => rename(item, isFolder) } : null,
      ...(item.client_id || item.managed_by ? [] : [
        mutable || (item.space ?? space) === 'personal' ? { label: 'Move to…', ic: 'move', on: () => transferDialog([isFolder ? { folder: item } : { file: item }], false) } : null,
        { label: 'Copy to…', ic: 'copy', on: () => transferDialog([isFolder ? { folder: item } : { file: item }], true) },
        (item.space ?? space) === 'personal' && canWriteLibrary ? { label: 'Move to Library', ic: 'layers', on: () => quickMove([isFolder ? { folder: item } : { file: item }], 'shared') } : null,
        (item.space ?? space) === 'shared' && !item.protected_sop && (isOwner || ctx.can('drive.file.delete_any') || (isFolder ? item.created_by : item.uploaded_by) === myId) ? { label: 'Move to Personal', ic: 'lock', on: () => quickMove([isFolder ? { folder: item } : { file: item }], 'personal') } : null]),
      canWrite && !isFolder ? { label: 'Make a copy', ic: 'copy', on: () => copyItem(item) } : null,
      isFolder ? { label: folderStars.has(item.id) ? 'Remove star' : 'Star', ic: 'star', on: async () => { const on = !folderStars.has(item.id); const r = await api.call('drive.stars.set', { folder: item.id, on }); if (r.ok) { on ? folderStars.add(item.id) : folderStars.delete(item.id); toast(on ? 'Starred.' : 'Star removed.'); } else fail(r, 'star that'); } } : null,
      mutable ? { label: 'Move to Trash', ic: 'trash', danger: true, on: () => (isFolder ? trashFolder(item) : trashMany([item])) } : null], `Actions for ${item.name}`);
  }
  const openFile = (f) => { const href = openHref(f); if (href) ctx.go(href); else if (opensInEditor(f) && canWrite) openInEditor(f); else if (previewKind(f)) preview(f); else download(f); };
  /** "Open in Docs / Sheets": an editable copy next to the uploaded file (the original stays as it is), filled from the file by the editor. */
  async function openInEditor(f) {
    const t = convertTarget(f); if (!t) return; if (!canWrite) return toast('You can view this file but not add files here, so it can’t be opened in the editor. Download it instead.', false);
    const name = (f.name.replace(/\.[^.]+$/, '') || f.name).slice(0, 200); toast(`Opening ${f.name} in ${t === 'doc' ? 'Docs' : 'Sheets'}…`);
    const r = await api.call('drive.files.create', { space, name, kind: 'document', mime_type: t === 'doc' ? DOC_MIME : SHEET_MIME, body: t === 'doc' ? serialize(emptyDoc()) : serializeBook(emptyBook()), ...(f.folder_id ? { folder: f.folder_id } : {}) });
    if (!r.ok) return fail(r, 'open that file in the editor');
    ctx.go(`${openHref(r.data[0])}?import=${f.id}`);
  }
  /** Opens the menu where the pointer is (right-click) or under the item (menu key). */
  function menuAt(itemEl, x, y) {
    const rec = byId.get(itemEl.dataset.item); if (!rec) return;
    const at = x == null ? itemEl.getBoundingClientRect() : { left: x, right: x + 210, top: y, bottom: y };
    rowMenu({ getBoundingClientRect: () => at, contains: () => false, focus: () => itemEl.focus() }, rec.folder ?? rec.file, !!rec.folder);
  }
  /** "Make a copy": a server-side copy next to the original (the stored bytes are reused, nothing is downloaded or uploaded again). */
  async function copyItem(f) {
    const r = await api.call('drive.transfer', { files: [f.id], to: (f.space ?? space) === 'personal' ? 'personal' : 'shared', ...(f.folder_id ? { folder: f.folder_id } : {}), copy: true });
    if (!r.ok) return fail(r, 'copy that'); toast('Copy made.'); load();
  }
  /** A short-lived address for showing a file in the page (no forced download). */
  async function signedUrl(f, version) {
    const r = await api.call('drive.files.download', { id: f.id, ...(version ? { version } : {}) }); const u = r.ok && r.data?.[0]?.url; if (!u) return null;
    try { const x = new URL(u); x.searchParams.delete('download'); return x.toString(); } catch { return u; }
  }

  // ---------------------------------------------------------------- preview (image, PDF, video, audio, text) with next/previous
  async function preview(start) {
    let files = visibleRows().map((r) => r.file).filter((x) => x && previewKind(x)); let idx = files.findIndex((x) => x.id === start.id); if (idx < 0) { files = [start]; idx = 0; }
    const prevFocus = document.activeElement; const title = h('b', { class: 'lb-title' }); const stage = h('div', { class: 'lb-stage' }); const count = h('span', { class: 'lb-count fine' });
    const mk = (label, ic, fn, extra = {}) => h('button', { type: 'button', class: 'btn quiet lb-btn', 'aria-label': label, title: label, onclick: fn, ...extra }, icon(ic));
    const prev = mk('Previous (Left arrow)', 'arrow', () => go(-1), { class: 'btn quiet lb-btn lb-prev' }); const next = mk('Next (Right arrow)', 'arrow', () => go(1), { class: 'btn quiet lb-btn lb-next' });
    const dl = h('button', { type: 'button', class: 'btn ghost', onclick: () => download(files[idx]) }, icon('download'), 'Download'); const x = mk('Close (Esc)', 'x', () => close());
    const box = h('div', { class: 'drv-lb', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Preview' }, h('div', { class: 'lb-top' }, title, count, dl, x), stage, files.length > 1 ? prev : null, files.length > 1 ? next : null);
    let token = 0;
    async function show() {
      const f = files[idx]; const my = ++token; title.textContent = f.name; title.title = f.name; count.textContent = files.length > 1 ? `${idx + 1} of ${files.length}` : '';
      stage.replaceChildren(h('p', { class: 'lb-msg', role: 'status' }, 'Loading…')); const url = await signedUrl(f); if (my !== token) return;
      const bad = (m) => stage.replaceChildren(h('div', { class: 'lb-msg' }, h('p', {}, m), h('button', { type: 'button', class: 'btn primary', onclick: () => download(f) }, 'Download instead')));
      if (!url) return bad('This file could not be opened.');
      const k = previewKind(f); let el;
      if (k === 'image') { el = h('img', { alt: f.name, class: 'lb-img' }); el.onerror = () => my === token && bad('The picture could not be shown.'); el.src = url; }
      else if (k === 'pdf') el = h('iframe', { class: 'lb-frame', title: f.name, src: url });
      else if (k === 'video') el = h('video', { class: 'lb-media', controls: true, preload: 'metadata', src: url });
      else if (k === 'audio') el = h('div', { class: 'lb-audio' }, ftile(f), h('audio', { controls: true, src: url }));
      else { try { const res = await fetch(url); if (!res.ok) throw new Error('x'); const t = (await res.text()).slice(0, 200000); if (my !== token) return; el = h('pre', { class: 'lb-text', tabindex: '0' }, t); } catch { if (my === token) bad('The text could not be loaded here.'); return; } }
      stage.replaceChildren(el);
    }
    const go = (d) => { idx = (idx + d + files.length) % files.length; show(); };
    function close() { document.removeEventListener('keydown', onKey, true); box.remove(); if (prevFocus?.isConnected) prevFocus.focus?.(); }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } else if (files.length > 1 && !/^(INPUT|TEXTAREA|VIDEO|AUDIO)$/.test(document.activeElement?.tagName) && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); go(e.key === 'ArrowLeft' ? -1 : 1); }
      else if (e.key === 'Tab') { const f = [...box.querySelectorAll('button')]; if (!f.length) return; const i = f.indexOf(document.activeElement); if (e.shiftKey && i <= 0) { e.preventDefault(); f.at(-1).focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } }
    }
    document.addEventListener('keydown', onKey, true); document.body.append(box); x.focus(); show();
  }
  const sharable = (it) => space === 'shared' && !it.protected_sop && (canWrite || isOwner);
  async function setLock(it, isFolder) {
    const lock = !it.locked; const r = await api.call('drive.items.lock', { kind: isFolder ? 'folder' : 'file', id: it.id, locked: lock });
    if (!r.ok) return fail(r, lock ? 'lock that' : 'unlock that');
    toast(lock ? 'Locked. Only owners can see it now.' : 'Unlocked.'); load();
  }
  const when2 = (iso) => (iso ? `until ${when(iso)}` : 'no expiry');
  const linkUrl = (token, pub) => `${location.origin}${location.pathname}#/${pub ? 's' : 'drive/open'}/${token}`;
  async function copyText(text) { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } }
  /** Share with people of the organization (view or edit) and, for a file, by link. Everything is checked by the database; a refusal reads as "not allowed". */
  async function shareDialog(item, isFolder) {
    const body = h('div', { class: 'drv-share' }); const key = isFolder ? { folder: item.id } : { file: item.id }; let fresh = null;
    const draw = async () => {
      const [pp, sh, lk] = await Promise.all([api.call('drive.people', {}), api.call('drive.shares.list', key), isFolder ? Promise.resolve({ ok: true, data: [] }) : api.call('drive.links.list', { file: item.id })]);
      if (!sh.ok) return put(body, notice('warn', 'lock', 'You can’t manage sharing for this. Only an owner, people with sharing rights, and the person who created it can.'));
      const direct = sh.data.filter((x) => !x.via_link); const have = new Set(direct.map((x) => x.user_id));
      const people = (pp.ok ? pp.data : []).filter((p) => !p.is_you && !have.has(p.user_id));
      const who = h('select', { id: 'sh-who', 'aria-label': 'Person' }, h('option', { value: '' }, 'Choose a person…'), ...people.map((p) => h('option', { value: p.user_id }, p.display_name)));
      const role = h('select', { id: 'sh-role', 'aria-label': 'What they can do' }, h('option', { value: 'viewer' }, 'Can view'), h('option', { value: 'editor' }, 'Can edit'));
      const add = btn('Add', async () => { if (!who.value) return toast('Choose a person first.', false); const r = await api.call('drive.shares.set', { ...key, user: who.value, role: role.value }); if (!r.ok) return fail(r, 'share that'); toast('Shared.'); draw(); }, 'primary');
      const setRole = (row) => h('select', { 'aria-label': `What ${row.display_name} can do`, onchange: async (e) => { const r = await api.call('drive.shares.set', { ...key, user: row.user_id, role: e.target.value }); if (!r.ok) fail(r, 'change that'); else toast('Updated.'); } },
        h('option', { value: 'viewer', ...(row.role === 'viewer' ? { selected: true } : {}) }, 'Can view'), h('option', { value: 'editor', ...(row.role === 'editor' ? { selected: true } : {}) }, 'Can edit'));
      const people$ = h('section', { 'aria-labelledby': 'sh-h1' }, h('h3', { id: 'sh-h1' }, 'People'),
        h('p', { class: 'fine muted' }, `Only members of ${ctx.orgName} can be added. ${isFolder ? 'They get everything in this folder, including files added later.' : ''}`),
        h('div', { class: 'drv-share-add' }, who, role, add),
        direct.length ? h('ul', { class: 'drv-share-list' }, ...direct.map((x) => h('li', {}, h('span', { class: 'sh-name', title: x.display_name }, x.display_name), setRole(x), h('button', { type: 'button', class: 'btn quiet', 'aria-label': `Remove ${x.display_name}`, title: 'Remove access', onclick: async () => { const r = await api.call('drive.shares.remove', { id: x.id }); if (!r.ok) fail(r, 'change that'); else { toast('Access removed.'); draw(); } } }, icon('x')))))
          : h('p', { class: 'fine muted' }, 'Not shared with anyone yet.'));
      const parts = [people$];
      if (!isFolder) {
        const live = lk.ok ? lk.data.filter((l) => !l.revoked_at && (!l.expires_at || new Date(l.expires_at) > new Date())) : [];
        const lrole = h('select', { id: 'lk-role', 'aria-label': 'Link rights' }, h('option', { value: 'public' }, 'Anyone with the link can view'), h('option', { value: 'viewer' }, `${ctx.orgName} members with the link can view`), h('option', { value: 'editor' }, `${ctx.orgName} members with the link can edit`));
        const lexp = h('select', { id: 'lk-exp', 'aria-label': 'Link expires' }, ...[['7', 'Expires in 7 days'], ['1', 'Expires in 1 day'], ['30', 'Expires in 30 days'], ['90', 'Expires in 90 days'], ['365', 'Expires in 1 year'], ['never', 'Never expires']].map(([k, l]) => h('option', { value: k }, l)));
        const make = btn('Create link', async () => { const isPub = lrole.value === 'public'; const r = await api.call('drive.links.create', { file: item.id, ...(isPub ? { audience: 'public' } : { role: lrole.value }), ...(lexp.value === 'never' ? { never: true } : { days: Number(lexp.value) }) }); if (!r.ok) return fail(r, 'make a link for that'); fresh = linkUrl(r.data[0].token, isPub); await copyText(fresh); toast('Link created and copied.'); draw(); }, '');
        const freshBox = fresh ? h('div', { class: 'drv-newlink', role: 'status' }, h('input', { readonly: true, value: fresh, 'aria-label': 'The new link', onfocus: (e) => e.target.select() }), btn('Copy', async () => toast((await copyText(fresh)) ? 'Copied.' : 'Select the link and copy it.', true), 'ghost'), h('p', { class: 'fine muted' }, 'Copy it now: for safety it is shown only once.')) : null;
        parts.push(h('section', { 'aria-labelledby': 'sh-h2' }, h('h3', { id: 'sh-h2' }, 'Link'),
          h('p', { class: 'fine muted' }, 'Choose who can open the link. A public link can be posted anywhere: anyone who has it can look at the file (not change it) until you revoke it or it expires. Team links need a sign-in; clients never get one.'),
          h('div', { class: 'drv-share-add' }, lrole, lexp, make), freshBox,
          live.length ? h('ul', { class: 'drv-share-list' }, ...live.map((l) => h('li', {}, h('span', { class: 'sh-name' }, `${l.audience === 'public' ? 'Anyone · can view' : l.role === 'editor' ? 'Team · can edit' : 'Team · can view'} · ${when2(l.expires_at)} · opened ${l.use_count}×`), h('button', { type: 'button', class: 'btn quiet', 'aria-label': 'Revoke this link', onclick: async () => { const r = await api.call('drive.links.revoke', { id: l.id }); if (!r.ok) fail(r, 'change that'); else { toast('Link revoked.'); fresh = null; draw(); } } }, 'Revoke'))))
            : h('p', { class: 'fine muted' }, 'No active links.')));
      }
      put(body, ...parts);
    };
    dialog({ title: `Share “${item.name}”`, body, wide: true, actions: [{ label: 'Done', cls: 'primary' }] }); draw();
  }
  /** Set, change or remove a folder password. The password is hashed on the server; the folder asks for it before showing anything inside. */
  function passwordDialog(d) {
    const a = field({ id: 'pw-new', label: 'New password', type: 'password', autocomplete: 'new-password', hint: 'At least 8 characters. Write it down somewhere safe: nobody can read it back.', maxlength: 200 });
    const b = field({ id: 'pw-new2', label: 'Type it again', type: 'password', autocomplete: 'new-password', maxlength: 200 });
    const actions = [{ label: 'Save password', cls: 'primary', on: async () => { a.error?.(''); const v = a.input.value;
      if (v.length < 8) return a.error('Use at least 8 characters.'); if (v !== b.input.value) return b.error('The two passwords are different.');
      const r = await api.call('drive.folders.setPassword', { id: d.id, password: v }); if (!r.ok) { fail(r, 'set a password for that'); return false; } toast('Password set. Everyone has to enter it again.'); load(); } }];
    if (d.protected) actions.push({ label: 'Remove password', cls: 'dng', on: async () => { const r = await api.call('drive.folders.setPassword', { id: d.id }); if (!r.ok) { fail(r, 'change that'); return false; } toast('Password removed.'); load(); } });
    actions.push({ label: 'Cancel' });
    dialog({ title: d.protected ? `Password for “${d.name}”` : `Protect “${d.name}” with a password`, body: [h('p', { class: 'fine muted' }, 'Everything in this folder, and in the folders below it, stays hidden (also from search and Recent) until someone enters the password. It stays open for 12 hours on that device’s sign-in.'), a.el, b.el], actions });
  }
  /** The screen shown instead of a protected folder's contents. */
  function unlockPrompt(name) { return unlockPromptFor(folderId, () => load(), name); }
  function unlockPromptFor(fid, done, name = 'This folder') {
    const pw = field({ id: 'dp-pw', label: 'Password', type: 'password', autocomplete: 'off', maxlength: 200 }); const msg = h('p', { class: 'fine', id: 'dp-msg', role: 'alert' });
    const go = async (e) => {
      e?.preventDefault(); if (!pw.input.value) { msg.textContent = 'Enter the password.'; return; }
      const r = await api.call('drive.folders.unlock', { id: fid, password: pw.input.value }); if (!live()) return;
      if (!r.ok) { msg.textContent = r.status === 404 ? 'You can’t open this folder.' : 'Something went wrong. Try again.'; return; }
      const x = r.data[0]; if (x.unlocked) { toast('Unlocked for 12 hours.'); done(); return; }
      pw.input.value = ''; msg.textContent = x.retry_after_seconds > 0 ? `Too many wrong passwords. Try again in ${Math.max(1, Math.ceil(x.retry_after_seconds / 60))} minute${x.retry_after_seconds > 90 ? 's' : ''}.` : `That password is not right. ${x.attempts_left} ${x.attempts_left === 1 ? 'try' : 'tries'} left.`;
    };
    return h('form', { class: 'empty drv-gate', onsubmit: go, 'aria-labelledby': 'dp-h' }, h('span', { class: 'ftile folder lg' }, icon('key')), h('h3', { id: 'dp-h' }, 'This folder is password protected'),
      h('p', {}, `“${name}” stays closed until you enter its password. Ask the owner if you don’t have it.`), h('div', { class: 'drv-gate-f' }, pw.el, btn('Unlock', go, 'primary', { type: 'submit' })), msg);
  }
  function rename(item, isFolder) {
    const f = field({ id: 'dr-name', label: 'Name', value: item.name, maxlength: 200 });
    dialog({ title: `Rename ${isFolder ? 'folder' : 'file'}`, body: f.el, actions: [{ label: 'Rename', cls: 'primary', on: async () => { const n = f.input.value.trim(); if (!n || /[\/\\]/.test(n)) return f.error('Use a name without slashes.');
      const r = await api.call(isFolder ? 'drive.folders.update' : 'drive.files.update', { id: item.id, name: n }); if (!r.ok) { fail(r, 'rename that'); return false; } toast('Renamed.'); load(); } }, { label: 'Cancel' }] });
  }
  async function moveDialog(items) {
    const ids = new Set(items.filter((x) => x.folder).map((x) => x.folder.id)); const at = { id: null, trail: [] };
    const listEl = h('ul', { class: 'drv-pick-list' }); const trailEl = h('nav', { class: 'drv-pick-trail fine', 'aria-label': 'Destination' }); const rootName = space === 'personal' ? 'Personal' : `${ctx.orgName} library`;
    const showAt = async () => {
      listEl.replaceChildren(h('li', { class: 'fine muted' }, 'Loading…'));
      put(trailEl, h('button', { type: 'button', class: 'linklike', onclick: () => { at.id = null; at.trail = []; showAt(); } }, rootName), ...at.trail.flatMap((t, i) => [h('span', { 'aria-hidden': 'true' }, ' / '), h('button', { type: 'button', class: 'linklike', onclick: () => { at.trail = at.trail.slice(0, i + 1); at.id = t.id; showAt(); } }, t.name)]));
      const r = await api.call('drive.folders.list', { space, ...(at.id ? { parent: at.id } : {}) }); const rows = (r.ok ? r.data : []).filter((d) => !ids.has(d.id));
      listEl.replaceChildren(...(rows.length ? rows.map((d) => h('li', {}, h('button', { type: 'button', class: 'drv-pick-i', onclick: () => { at.id = d.id; at.trail = [...at.trail, { id: d.id, name: d.name }]; showAt(); } }, icon('folder'), h('span', {}, d.name), icon('arrow')))) : [h('li', { class: 'fine muted' }, 'No folders here.')]));
    };
    dialog({ title: `Move ${items.length} item${items.length === 1 ? '' : 's'}`, body: [h('p', { class: 'fine muted' }, 'Open a folder, then choose Move here.'), trailEl, listEl], actions: [{ label: 'Move here', cls: 'primary', on: async () => {
      if ((at.id ?? null) === (folderId ?? null)) { toast('It is already here.', false); return false; }
      for (const it of items) { const input = it.folder ? { id: it.folder.id, ...(at.id ? { parent: at.id } : { to_root: true }) } : { id: it.file.id, ...(at.id ? { folder: at.id } : { to_root: true }) };
        const x = await api.call(it.folder ? 'drive.folders.update' : 'drive.files.update', input); if (!x.ok) { fail(x, 'move that'); return false; } }
      toast('Moved.'); load(); } }, { label: 'Cancel' }] });
    showAt();
  }
  async function trashRecs(recs) {
    for (const r of recs) { const x = await api.call(r.folder ? 'drive.folders.archive' : 'drive.files.archive', { id: (r.folder ?? r.file).id }); if (!x.ok) return fail(x, 'move that to the Trash'); }
    toast(`${recs.length === 1 ? 'Moved' : `${recs.length} items moved`} to the Trash.`); load();
  }
  async function trashMany(files) {
    for (const f of files) { const r = await api.call('drive.files.archive', { id: f.id }); if (!r.ok) return fail(r, 'move that to the Trash'); }
    toast(`${files.length === 1 ? 'Moved' : `${files.length} items moved`} to the Trash.`); load();
  }
  function trashFolder(d) {
    dialog({ title: `Move “${d.name}” to the Trash?`, body: h('p', {}, 'The folder leaves the list. Files inside it stay where they are and keep their place if you restore the folder.'), actions: [{ label: 'Move to Trash', cls: 'primary', on: async () => { const r = await api.call('drive.folders.archive', { id: d.id }); if (!r.ok) { fail(r, 'move that to the Trash'); return false; } toast('Moved to the Trash.'); load(); } }, { label: 'Cancel', focus: true }] });
  }

  // ---------------------------------------------------------------- Move / Copy between Library and Personal (03 §4): server-side, nothing downloaded or uploaded
  const itemIds = (items) => ({ files: items.filter((x) => x.file).map((x) => x.file.id), folders: items.filter((x) => x.folder).map((x) => x.folder.id) });
  const libName = () => `${ctx.orgName} Library`;
  const consequence = (to, copy, lose) => (copy ? 'The copy starts with no sharing and with only the current version. The original stays where it is.'
    : to === 'shared' ? `Everyone in ${ctx.orgName} will be able to find it, and ${ctx.orgName} becomes the owner. You keep editing it. Version history moves with it.`
      : `Only you will see it.${lose?.people ? ` ${lose.people} ${lose.people === 1 ? 'person it is' : 'people it is'} shared with will lose access.` : ''}${lose?.links ? ` ${lose.links} share link${lose.links === 1 ? '' : 's'} will stop working.` : ''} Version history moves with it.`);
  let transferring = false;
  async function runTransfer(items, to, folder, copy) {
    if (transferring) return false; transferring = true;
    try {
      const r = await api.call('drive.transfer', { ...itemIds(items), to, ...(folder ? { folder } : {}), ...(copy ? { copy: true } : {}) });
      if (!r.ok) { fail(r, copy ? 'copy that there' : 'move that there'); return false; }
      const x = r.data[0]; const n = (x.files ?? 0) + (x.folders ?? 0);
      toast(copy ? `Copied${n > 1 ? ` (${n} items)` : ''}. No download or upload needed.` : `Moved to ${to === 'shared' ? 'the Library' : 'Personal'}${n > 1 ? ` (${n} items)` : ''}.${x.shares_removed ? ` ${x.shares_removed} share${x.shares_removed === 1 ? '' : 's'} removed.` : ''}`);
      state.selected.clear(); load(); return true;
    } finally { transferring = false; }
  }
  async function quickMove(items, to) {
    const lose = to === 'personal' ? await api.call('drive.transfer.details', itemIds(items)) : null;
    dialog({ title: `Move to ${to === 'shared' ? 'Library' : 'Personal'}?`, body: h('p', {}, consequence(to, false, lose?.ok ? lose.data[0] : null)),
      actions: [{ label: 'Move', cls: 'primary', on: () => runTransfer(items, to, null, false) }, { label: 'Cancel', focus: true }] });
  }
  async function transferDialog(items, copy) {
    if (!items.length) return;
    const chosen = { space: null, folder: null };
    const note = h('div', { class: 'notice plain', style: 'font-size:13px;margin-top:10px' }, icon('info'), h('span', {}, consequence('shared', copy) + ' ' + consequence('personal', copy)));
    const lose = !copy ? await api.call('drive.transfer.details', itemIds(items)) : null; const moving = new Set(itemIds(items).folders);
    const pickRow = (sp, d, depth) => { const b = h('button', { type: 'button', class: `linkrow${d ? ' sub' : ''}`, 'aria-pressed': 'false', style: `padding-left:${8 + depth * 18}px`, 'data-sp': sp, 'data-f': d?.id ?? '' },
      icon(d ? 'folder' : sp === 'shared' ? 'layers' : 'lock'), h('span', { class: 'main' }, d ? d.name : h('b', {}, sp === 'shared' ? libName() : 'Personal')), d ? h('span', { class: 'tw', 'aria-hidden': 'true' }, '›') : null);
      b.addEventListener('click', async () => {
        tree.querySelectorAll('[aria-pressed="true"]').forEach((x) => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); chosen.space = sp; chosen.folder = d?.id ?? null;
        put(note, icon('info'), h('span', {}, consequence(sp, copy, sp === 'personal' && lose?.ok ? lose.data[0] : null)));
        if (!b.dataset.open) { b.dataset.open = '1'; const r = await api.call('drive.folders.list', { space: sp, ...(d ? { parent: d.id } : {}) }); const kids = (r.ok ? r.data : []).filter((x) => !moving.has(x.id));
          let at = b; for (const k of kids) { const row = pickRow(sp, k, depth + 1); at.after(row); at = row; } }
      }); return b; };
    const tree = h('div', { class: 'dtree', style: 'margin-top:10px;max-height:46vh;overflow:auto' }, ...(canWriteLibrary ? [pickRow('shared', null, 0)] : []), pickRow('personal', null, 0));
    const n = items.length; const what = n === 1 ? `“${(items[0].file ?? items[0].folder).name}”` : `${n} items`;
    return dialog({ title: `${copy ? 'Copy' : 'Move'} ${what} to…`, key: 'drive-transfer', body: [h('p', { class: 'fine muted' }, 'Choose Library or Personal, or a folder inside them.'), tree, note],
      actions: [{ label: copy ? 'Copy here' : 'Move here', cls: 'primary', on: async () => { if (!chosen.space) { toast('Choose where it goes first.', false); return false; } return (await runTransfer(items, chosen.space, chosen.folder, copy)) ? undefined : false; } }, { label: 'Cancel' }] });
  }
  // drag a row or folder onto Library or Personal in the sidebar (V8: "Drag a file onto Library or Personal to move it"), or onto a folder tile
  const DRAG = 'application/x-l2f-drive';
  root.addEventListener('dragstart', (e) => {
    const it = e.target.closest?.('[data-item]'); if (!it || !e.dataTransfer) return; const rec = byId.get(it.dataset.item); if (!rec) return;
    const sel = state.selected.has(it.dataset.item) && state.selected.size > 1 ? [...state.selected].map((id) => byId.get(id)).filter(Boolean) : [rec];
    e.dataTransfer.setData(DRAG, JSON.stringify(itemIds(sel))); e.dataTransfer.effectAllowed = 'move'; dragging = sel;
  });
  let dragging = null; root.addEventListener('dragend', () => { dragging = null; document.querySelectorAll('.dropon').forEach((x) => x.classList.remove('dropon')); });
  const sideTarget = (e) => e.target.closest?.('.side .nav a[data-key="files"], .side .nav a[data-key="personal"]');
  const onSideOver = (e) => { const a = sideTarget(e); if (!a || !dragging || !live()) return; e.preventDefault(); a.classList.add('dropon'); };
  const onSideLeave = (e) => sideTarget(e)?.classList.remove('dropon');
  const onSideDrop = (e) => { const a = sideTarget(e); if (!a || !dragging || !live()) return; e.preventDefault(); a.classList.remove('dropon'); const items = dragging; dragging = null; quickMove(items, a.dataset.key === 'personal' ? 'personal' : 'shared'); };
  document.addEventListener('dragover', onSideOver); document.addEventListener('dragleave', onSideLeave); document.addEventListener('drop', onSideDrop);
  window.addEventListener('hashchange', function off() { if (live()) return; document.removeEventListener('dragover', onSideOver); document.removeEventListener('dragleave', onSideLeave); document.removeEventListener('drop', onSideDrop); window.removeEventListener('hashchange', off); });

  // ---------------------------------------------------------------- New
  function newMenu(anchor) {
    popMenu(anchor, [{ label: 'Folder', ic: 'folder', on: newFolder }, { label: 'Document', ic: 'doc', on: () => newFile('Document', DOC_MIME, serialize(emptyDoc())) }, { label: 'Spreadsheet', ic: 'table', on: () => newFile('Spreadsheet', SHEET_MIME, serializeBook(emptyBook())) }, { label: 'Slides', ic: 'slideI', on: () => newFile('Slides', SLIDES_MIME, templatesFor('slides')[0].body()) }, { label: 'Whiteboard', ic: 'board', on: () => newFile('Whiteboard', BOARD_MIME, emptyBoard()) },
      { label: 'Upload files', ic: 'upload', on: () => picker.click() }, { label: 'Upload folder', ic: 'upload', on: pickFolder }], 'New');
  }
  function newFolder() {
    const f = field({ id: 'nf-name', label: 'Folder name', value: 'New folder', maxlength: 200 });
    dialog({ title: 'New folder', body: f.el, actions: [{ label: 'Create', cls: 'primary', on: async () => { const n = f.input.value.trim(); if (!n || /[\/\\]/.test(n)) return f.error('Use a name without slashes.');
      const r = await api.call('drive.folders.create', { space, name: n, ...(folderId ? { parent: folderId } : {}) }); if (!r.ok) { fail(r, 'add folders'); return false; } toast('Folder created.'); load(); } }, { label: 'Cancel' }] });
  }
  function newFile(label, mime, body) {
    const f = field({ id: 'nd-name', label: `${label} name`, value: `Untitled ${label.toLowerCase()}`, maxlength: 200 });
    dialog({ title: `New ${label.toLowerCase()}`, body: f.el, actions: [{ label: 'Create', cls: 'primary', on: async () => { const n = f.input.value.trim(); if (!n || /[\/\\]/.test(n)) return f.error('Use a name without slashes.');
      const r = await api.call('drive.files.create', { space, name: n, kind: 'document', mime_type: mime, body, ...(folderId ? { folder: folderId } : {}) }); if (!r.ok) { fail(r, 'add files'); return false; }
      ctx.go(openHref(r.data[0])); } }, { label: 'Cancel' }] });
  }

  // ---------------------------------------------------------------- uploads: queue, progress panel, retry, cancel
  const picker = h('input', { type: 'file', multiple: true, class: 'sr', tabindex: '-1', 'aria-hidden': 'true' }); picker.addEventListener('change', () => { upload([...picker.files].map((file) => ({ file, rel: [] }))); picker.value = ''; });
  function pickFolder() {     // created on demand so the page keeps a single file input
    const i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.webkitdirectory = true;
    i.addEventListener('change', () => { upload([...i.files].map((file) => ({ file, rel: String(file.webkitRelativePath || '').split('/').slice(0, -1) }))); });
    i.click();
  }
  const up = { items: [], seq: 0, running: 0, usage: undefined, folders: new Map(), hideTimer: null };
  const panel = h('section', { class: 'drv-up-panel', role: 'region', 'aria-label': 'Uploads', hidden: true });
  const panelHead = h('div', { class: 'up-head' }); const panelBar = h('progress', { class: 'up-all', max: '100', value: '0', 'aria-label': 'Overall upload progress' }); const panelRows = h('ul', { class: 'up-rows' });
  panel.append(panelHead, panelBar, panelRows);
  const isLive = (i) => i.status === 'queued' || i.status === 'working';
  function paintPanel() {
    const items = up.items; panel.hidden = items.length === 0; if (!items.length) return;
    const total = items.reduce((s, i) => s + (i.status === 'cancelled' ? 0 : Math.max(1, i.file.size)), 0); const done = items.reduce((s, i) => s + (i.status === 'cancelled' ? 0 : i.status === 'done' ? Math.max(1, i.file.size) : Math.min(i.loaded, i.file.size)), 0);
    const pct = total ? Math.round((100 * done) / total) : 100; const n = (s) => items.filter((i) => i.status === s).length; const active = items.filter(isLive).length; const errs = n('error');
    panelBar.value = pct; panelBar.hidden = !active;
    const ended = items.length - active; const title = active ? `Uploading ${Math.min(ended + 1, items.length - n('cancelled'))} of ${items.length - n('cancelled')} · ${pct}%` : errs ? `${errs} upload${errs === 1 ? '' : 's'} did not finish` : n('done') ? `${n('done')} file${n('done') === 1 ? '' : 's'} uploaded` : 'Uploads stopped';
    put(panelHead, h('b', { 'data-up-title': true }, title), h('span', { class: 'up-acts' }, active ? btn('Cancel all', cancelAll, 'quiet') : null, active ? null : btn('Clear', clearPanel, 'quiet')));
    const keep = new Set(items.map((i) => i.id));
    for (const el of [...panelRows.children]) if (!keep.has(el.dataset.id)) el.remove();
    items.forEach((i, ix) => { let el = panelRows.children[ix]; if (!el || el.dataset.id !== i.id) { const fresh = rowUp(i); el ? panelRows.insertBefore(fresh, el) : panelRows.append(fresh); el = fresh; } updRow(el, i); });
  }
  const rowUp = (i) => h('li', { class: 'up-row', 'data-id': i.id }, ftile({ name: i.file.name, mime_type: i.file.type, kind: 'file' }), h('div', { class: 'up-main' }, h('span', { class: 'up-name', title: i.file.name }, i.rel.length ? `${i.rel.join('/')}/${i.file.name}` : i.file.name), h('span', { class: 'up-state fine' }), h('progress', { max: '100', value: '0', 'aria-label': `Uploading ${i.file.name}` })), h('span', { class: 'up-btns' }));
  function updRow(el, i) {
    el.dataset.status = i.status; const st = el.querySelector('.up-state'); const pr = el.querySelector('progress'); const bt = el.querySelector('.up-btns');
    const msg = i.status === 'queued' ? 'Waiting…' : i.status === 'working' ? (i.pct >= 100 ? 'Finishing…' : `${formatSize(Math.min(i.loaded, i.file.size))} of ${formatSize(i.file.size)} · ${Math.round(i.pct)}%`) : i.status === 'done' ? `${formatSize(i.file.size)} · done` : i.status === 'cancelled' ? 'Cancelled' : i.error?.message ?? 'Failed';
    if (st.textContent !== msg) st.textContent = msg; st.classList.toggle('err', i.status === 'error'); pr.hidden = i.status !== 'working' && i.status !== 'queued'; pr.value = i.pct;
    if (el.dataset.btn !== `${i.status}${i.error?.retryable}`) { el.dataset.btn = `${i.status}${i.error?.retryable}`; bt.replaceChildren(
      ...(isLive(i) ? [h('button', { type: 'button', class: 'btn quiet up-x', 'aria-label': `Cancel upload of ${i.file.name}`, title: 'Cancel', onclick: () => cancelItem(i) }, icon('x'))]
        : i.status === 'done' ? [] : [...(i.status === 'cancelled' || i.error?.retryable ? [h('button', { type: 'button', class: 'btn ghost up-retry', 'aria-label': `Retry ${i.file.name}`, onclick: () => retryItem(i) }, 'Retry')] : []), h('button', { type: 'button', class: 'btn quiet up-x', 'aria-label': `Dismiss ${i.file.name}`, title: 'Dismiss', onclick: () => { up.items = up.items.filter((x) => x !== i); paintPanel(); } }, icon('x'))])); }
  }
  const clearPanel = () => { up.items = []; paintPanel(); };
  const cancelItem = (i) => { if (i.status === 'working') { i.cancelled = true; i.xhr?.abort(); } else if (i.status === 'queued') { i.status = 'cancelled'; } paintPanel(); };
  const cancelAll = () => { for (const i of up.items) if (isLive(i)) cancelItem(i); };
  const retryItem = (i) => { i.status = 'queued'; i.error = null; i.pct = 0; i.loaded = 0; i.cancelled = false; paintPanel(); pump(); };
  const fail2 = (i, e) => { i.status = 'error'; i.error = e; i.pct = 0; };

  async function usageOnce() { if (up.usage === undefined) { const r = await api.call('storage.usage', {}); up.usage = r.ok && r.data?.[0] ? r.data[0] : null; } return up.usage; }
  async function upload(entries, targetFolder = folderId) {
    if (!canWrite) return toast('You can’t add files here.', false);
    entries = entries.filter((e) => e.file); if (!entries.length) return;
    clearTimeout(up.hideTimer); up.items = up.items.filter((i) => i.status !== 'done'); up.usage = undefined;
    const added = entries.map(({ file, rel }) => ({ id: `u${++up.seq}`, file, rel, parent: targetFolder, status: 'queued', pct: 0, loaded: 0, error: null, xhr: null, stored: null }));
    up.items.push(...added); paintPanel();
    const usage = await usageOnce(); const checks = precheckUploads(added.map((i) => i.file.size), usage);
    added.forEach((i, ix) => { if (checks[ix]) fail2(i, { ...checks[ix], retryable: false }); }); paintPanel(); pump();
  }
  function pump() {
    while (up.running < 3) { const next = up.items.find((i) => i.status === 'queued'); if (!next) break; next.status = 'working'; up.running += 1; runItem(next).finally(() => { up.running -= 1; paintPanel(); pump(); }); }
    if (!up.running && !up.items.some(isLive)) finished();
  }
  function finished() {
    if (up.items.some((i) => i.status === 'done') && live() && !up.refreshed) { up.refreshed = true; load(); }
    if (!up.items.some((i) => i.status === 'error' || i.status === 'cancelled')) { clearTimeout(up.hideTimer); up.hideTimer = setTimeout(() => { if (!up.items.some(isLive)) clearPanel(); }, 4000); }
  }
  /** Finds or makes the folder `name` inside `parent` (same name = same folder), remembering the answer for the rest of the drop. */
  function ensureFolder(parent, name) {
    const key = `${parent ?? ''}/${name.toLowerCase()}`; if (up.folders.has(key)) return up.folders.get(key);
    const p = (async () => {
      const l = await api.call('drive.folders.list', { space, ...(parent ? { parent } : {}) }); const hit = l.ok && l.data.find((d) => d.name.toLowerCase() === name.toLowerCase()); if (hit) return { id: hit.id };
      const c = await api.call('drive.folders.create', { space, name, ...(parent ? { parent } : {}) }); return c.ok && c.data?.[0] ? { id: c.data[0].id } : { error: classifyUploadError('create', c) };
    })(); up.folders.set(key, p); p.then((r) => { if (r.error) up.folders.delete(key); }); return p;
  }
  async function runItem(i) {
    up.refreshed = false; const { file } = i; const mime = file.type || 'application/octet-stream'; const size = Math.max(1, file.size);
    try {
      let parent = i.parent;
      for (const name of i.rel) { const r = await ensureFolder(parent, name); if (r.error) return fail2(i, r.error); parent = r.id; }
      if (!i.stored) {
        const s = await api.call('drive.uploads.sign', { space, name: file.name, size_bytes: size, mime_type: mime });
        if (!s.ok || !s.data?.[0]) return fail2(i, classifyUploadError('sign', s, { size }));
        const r = await putBytes(i, s.data[0], file); if (r.cancelled) { i.status = 'cancelled'; return; } if (r.error) return fail2(i, r.error);
        i.stored = s.data[0].path;
      }
      const c = await api.call('drive.files.create', { space, name: file.name, kind: 'file', mime_type: mime, size_bytes: size, storage_path: i.stored, ...(parent ? { folder: parent } : {}) });
      if (!c.ok) return fail2(i, classifyUploadError('create', c, { size }));
      i.status = 'done'; i.pct = 100; i.loaded = file.size;
    } catch { fail2(i, { kind: 'failed', message: 'Something went wrong while uploading. Try again.', retryable: true }); }
  }
  const putBytes = (i, target, file) => new Promise((resolve) => {
    const x = new XMLHttpRequest(); i.xhr = x; x.open(target.method || 'PUT', target.url); for (const [k, v] of Object.entries(target.headers ?? {})) x.setRequestHeader(k, v);
    let raf = 0; x.upload.onprogress = (e) => { if (!e.lengthComputable) return; i.loaded = e.loaded; i.pct = (100 * e.loaded) / e.total; if (!raf) raf = requestAnimationFrame(() => { raf = 0; paintPanel(); }); };
    x.onload = () => resolve(x.status >= 200 && x.status < 300 ? {} : { error: classifyUploadError('put', { status: x.status }) });
    x.onerror = () => resolve({ error: classifyUploadError('put', { status: 0 }) }); x.onabort = () => resolve({ cancelled: true }); x.ontimeout = () => resolve({ error: classifyUploadError('put', { status: 0 }) });
    x.send(file);
  });

  // ---------------------------------------------------------------- drag and drop: files, whole folders, or onto a folder in the list
  const readAll = (reader) => new Promise((ok, no) => { const all = []; const go = () => reader.readEntries((b) => { if (!b.length) ok(all); else { all.push(...b); go(); } }, no); go(); });
  async function walk(entry, rel, out) {
    if (entry.isFile) { const file = await new Promise((ok, no) => entry.file(ok, no)); out.push({ file, rel }); }
    else if (entry.isDirectory) { const kids = await readAll(entry.createReader()); if (!kids.length) out.push({ dir: [...rel, entry.name] }); for (const k of kids) await walk(k, [...rel, entry.name], out); }
  }
  async function dropped(dt, targetFolder) {
    const entries = [...(dt.items ?? [])].map((it) => it.webkitGetAsEntry?.()).filter(Boolean);    // must be read synchronously, before the event ends
    if (!entries.length || !entries.some((e) => e.isDirectory)) return upload([...dt.files].map((file) => ({ file, rel: [] })), targetFolder);
    const out = []; try { for (const e of entries) await walk(e, [], out); } catch { toast('Some of the dropped items could not be read.', false); }
    for (const d of out.filter((x) => x.dir)) { let parent = targetFolder; for (const n of d.dir) { const r = await ensureFolder(parent, n); if (r.error) { toast(r.error.message, false); break; } parent = r.id; } }
    if (out.some((x) => x.dir) && live()) load();
    const files = out.filter((x) => x.file); if (files.length) upload(files, targetFolder);
  }
  const dropZone = () => {
    let depth = 0; const hint = h('div', { class: 'drv-drop', hidden: true, 'aria-hidden': 'true' }, h('span', {}, 'Drop files or folders to upload')); root.append(hint);
    const isFiles = (e) => e.dataTransfer?.types?.includes('Files'); const folderEl = (e) => e.target.closest?.('[data-drop-folder]');
    const clearHot = () => root.querySelectorAll('.drop-hot').forEach((x) => x.classList.remove('drop-hot'));
    root.addEventListener('dragenter', (e) => { if (!isFiles(e)) return; depth += 1; hint.hidden = !canWrite; });
    root.addEventListener('dragover', (e) => { if (!isFiles(e)) return; e.preventDefault(); clearHot(); const f = folderEl(e); if (f && canWrite) { f.classList.add('drop-hot'); hint.classList.add('over-folder'); } else hint.classList.remove('over-folder'); });
    root.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) { hint.hidden = true; clearHot(); } });
    root.addEventListener('drop', (e) => { if (!isFiles(e)) return; e.preventDefault(); depth = 0; hint.hidden = true; hint.classList.remove('over-folder'); const f = folderEl(e); clearHot(); dropped(e.dataTransfer, f?.dataset.dropFolder ?? folderId); });
  };

  // ---------------------------------------------------------------- details drawer
  async function ownerName(f) {
    if (f.space === 'personal') return 'You';
    await peopleReady;
    const m = people.find((x) => x.user_id === f.uploaded_by); return m ? (m.is_you ? 'You' : m.display_name) : 'A teammate';
  }
  let body$ = null;
  async function details(f) {
    const tab = { cur: 'details' }; const body = h('div', {}); body$ = body;
    const draw = async () => {
      if (tab.cur === 'details') {
        const canLib = f.space === 'shared' && f.managed_by && ctx.can('drive.file.edit'); const prev = isImage(f) ? art(f, true) : null; const who = await ownerName(f);
        put(body, prev ? h('div', { class: 'drv-prev' }, prev) : null, h('dl', { class: 'drv-dl' }, ...[['Name', f.name], ['Type', fileType(f).name], ['Size', formatSize(f.size_bytes)], ['Version', String(f.current_version)], ['Location', f.space === 'personal' ? 'Personal' : f.space === 'client' ? 'A client’s own space' : `${ctx.orgName} library`], ['Added by', who], ['Added', when(f.created_at)], ['Updated', when(f.updated_at)], ['Belongs to', f.managed_by ? `the ${f.managed_by.replace(/_/g, ' ')} app` : 'Drive']].flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
          f.protected_sop ? notice('info', 'lock', 'This is an approved SOP. It is protected: only owners change it.') : null,
          f.managed_by && f.space === 'shared' ? h('div', { class: 'fld' }, h('label', {}, h('input', { type: 'checkbox', checked: f.in_library, ...(canLib ? {} : { disabled: true }), onchange: async (e) => { const r = await api.call('drive.files.setLibrary', { id: f.id, in_library: e.target.checked }); if (!r.ok) { e.target.checked = !e.target.checked; fail(r, 'change that'); } else { f = { ...f, in_library: e.target.checked }; toast(e.target.checked ? 'Added to the library.' : 'Removed from the library.'); load(); } } }), ' Show in the library'),
            h('p', { class: 'fine muted' }, 'This file belongs to another app and is stored safely either way. Showing it here does not move it.')) : null);
      } else if (tab.cur === 'sharing') {
        if (f.space === 'shared' && !f.protected_sop) { await sharingTab(f); return; }
        put(body, f.space === 'client' ? h('div', {}, h('label', {}, h('input', { type: 'checkbox', checked: f.client_visible, ...(ctx.can('drive.file.share', f.client_id) ? {} : { disabled: true }), onchange: async (e) => { const r = await api.call('drive.files.share', { id: f.id, visible: e.target.checked }); if (!r.ok) { e.target.checked = !e.target.checked; fail(r, 'share that'); } else f = { ...f, client_visible: e.target.checked }; } }), ' Shareable with the client'), h('p', { class: 'fine muted' }, 'The Client Portal is locked, so nothing reaches the client yet.'))
          : h('div', {}, h('p', {}, f.space === 'personal' ? 'Only you can open your personal files. Administrators cannot, except through a logged emergency access that names a reason and tells you.' : `Everyone in ${ctx.orgName} with Drive access can open this file. What each person can change follows their access level in Admin.`), h('p', { class: 'fine muted' }, 'Share links need a public viewer page, which arrives with the Client Portal.')));
      } else {
        put(body, skeleton(2)); const r = await api.call('drive.files.versions', { file: f.id }); if (!live()) return;
        put(body, r.ok ? h('ul', { class: 'drv-vers' }, ...r.data.map((x) => h('li', {}, h('div', {}, h('b', {}, `Version ${x.version}${x.version === f.current_version ? ' · newest' : ''}`), h('div', { class: 'fine muted' }, `${when(x.created_at)}${x.note ? ` · ${x.note}` : ''}`)), f.kind === 'file' ? btn(['Download', srOnly(` version ${x.version}`)], async () => { const d = await api.call('drive.files.download', { id: f.id, version: x.version }); if (d.ok && d.data[0]) window.open(d.data[0].url, '_blank', 'noopener'); else fail(d, 'download that'); }, 'ghost') : null))) : errorState(draw));
        if (r.ok && f.kind === 'document') body.append(h('p', { class: 'fine muted' }, 'To restore an older version, open the file and use History.'));
      }
    };
    const strip = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Details' }, ...[['details', 'Details'], ['sharing', 'Sharing'], ['versions', 'Versions']].map(([k, l]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(k === tab.cur), 'data-k': k, onclick: () => { tab.cur = k; strip.querySelectorAll('[role=tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.k === k))); draw(); } }, l)));
    drawer({ title: f.name, label: `Details of ${f.name}`, body: [strip, body], actions: [{ label: 'Close', cls: 'primary' }] }); draw();
  }

  /** The Sharing tab of the details drawer for a file in the library: who has it, the way in, and (for owners) the lock. */
  async function sharingTab(f) {
    const [sh, lk] = await Promise.all([api.call('drive.shares.list', { file: f.id }), api.call('drive.links.list', { file: f.id })]); if (!live()) return;
    const direct = sh.ok ? sh.data.filter((x) => !x.via_link) : []; const links = lk.ok ? lk.data.filter((l) => !l.revoked_at && (!l.expires_at || new Date(l.expires_at) > new Date())) : [];
    put(body$, h('div', {}, h('p', {}, `Everyone in ${ctx.orgName} with Drive access can open this file. What each person can change follows their access level in Admin.`),
      h('h3', { class: 'over' }, 'Shared with'), direct.length ? h('ul', { class: 'drv-share-list' }, ...direct.map((x) => h('li', {}, h('span', { class: 'sh-name', title: x.display_name }, x.display_name), tag(x.role === 'editor' ? 'Can edit' : 'Can view')))) : h('p', { class: 'fine muted' }, 'Nobody in particular.'),
      h('p', { class: 'fine muted' }, links.length ? `${links.length} active link${links.length === 1 ? '' : 's'}.` : 'No active links.'),
      sharable(f) ? btn('Share…', () => shareDialog(f, false), 'primary') : null,
      isOwner ? h('div', { class: 'drv-lockbox' }, h('h3', { class: 'over' }, 'Owner lock'), h('p', { class: 'fine muted' }, 'A locked file disappears for everyone except owners: nobody else can see, open, download, change, share or delete it. Only an owner can unlock it.'), btn(f.locked ? 'Unlock' : 'Lock this file', async () => { await setLock(f, false); f = { ...f, locked: !f.locked }; sharingTab(f); }, f.locked ? 'ghost' : '')) : null));
  }

  // ---------------------------------------------------------------- shared with me, opening a link
  async function sharedWithMe() {
    refreshTools(['Shared with me', '']);
    const r = await api.call('drive.shares.mine', {}); await Promise.all([starsReady, peopleReady]); if (!live()) return;
    const rows = r.ok ? r.data : []; const folders = rows.filter((x) => x.kind === 'folder'); const files = rows.filter((x) => x.kind !== 'folder').map((x) => ({ ...x, kind: x.file_kind })).filter(owned);
    state.files = files; state.folders = folders; byId.clear(); for (const f of files) byId.set(f.id, { file: f }); for (const d of folders) byId.set(d.id, { folder: d });
    put(main, typeChips('all'), toolsEl, bar, h('div', { class: 'drv-list' }, folders.length ? folderTiles(folders.map((d) => ({ ...d, space: 'shared' }))) : null, files.length ? (state.mode === 'grid' ? fileGrid(files) : fileTable(files)) : null,
      !rows.length ? emptyState({ title: 'Nothing shared with you yet', body: 'When someone shares a file or folder with you, or you open a share link, it appears here.', ic: 'team' }) : null));
    paintSel();
  }
  async function openLink() {
    const r = await api.call('drive.links.open', { token: route.token ?? '' }); if (!live()) return;
    const back = h('a', { class: 'btn', href: driveHref('shared') }, 'Go to Drive');
    if (!r.ok) return put(main, noAccessState({ title: 'This link doesn’t work for you', body: `It may have expired or been withdrawn, or it belongs to another organization (check the organization at the top). Only signed-in members of ${ctx.orgName} can open share links.`, action: back }));
    const x = r.data[0];
    if (x.protected_folder) {
      const pr = await api.call('drive.folders.protection', { id: x.protected_folder }); if (!live()) return;
      if (!pr.ok) return put(main, noAccessState({ title: 'This file is in a protected folder', body: 'Ask the owner for access to the folder and its password, then open the link again.', action: back }));
      return put(main, head('Protected folder', null), h('div', { class: 'drv-gate-wrap' }, unlockPromptFor(x.protected_folder, () => openLink())));
    }
    const href = openHref(x); if (href) { ctx.go(href); return; }
    put(main, head(x.name, x.role === 'editor' ? 'You can edit this file.' : 'You can view this file.'), previewKind(x) ? btn('Preview', () => openFile(x), 'primary') : btn('Download', () => download(x), 'primary'));
  }

  // ---------------------------------------------------------------- recent, trash
  const itemRow = (it, isFolder, ...end) => h('li', { class: 'drv-it' }, isFolder ? folderTile() : ftile(it), h('div', { class: 'drv-it-main' }, isFolder ? h('a', { class: 'pj-title', href: driveHref('shared', it.id), title: it.name }, it.name) : openHref(it) ? h('a', { class: 'pj-title', href: openHref(it), title: it.name }, it.name) : h('span', { class: 'pj-title', title: it.name }, it.name), h('span', { class: 'drv-sub on' }, end[0])), h('span', { class: 'drv-it-acts' }, ...end.slice(1)));
  async function recent() {
    refreshTools(['Recent', '']);
    const r = await api.call('drive.recent', { limit: 60 }); await Promise.all([starsReady, peopleReady]); if (!live()) return;
    if (!r.ok) return put(main, typeChips('all'), toolsEl, errorState(load));
    const files = r.data.filter((f) => matchesType(f, state.type) && owned(f)); state.files = files; state.folders = []; byId.clear(); for (const f of files) byId.set(f.id, { file: f });
    put(main, typeChips('all'), toolsEl, h('p', { class: 'hint', style: 'margin:-6px 0 12px' }, 'What you opened last, then what changed most recently.'), bar, h('div', { class: 'drv-list' }, files.length ? (state.mode === 'grid' ? fileGrid(files) : fileTable(files)) : emptyState({ title: 'Nothing recent', body: 'Files you open appear here.', ic: 'clock' })));
    paintSel();
  }
  async function trash() {
    const [fi, fo, fp, fop] = await Promise.all([api.call('drive.files.list', { space: 'shared', anywhere: true, archived: true }), api.call('drive.folders.list', { space: 'shared', archived: true }), api.call('drive.files.list', { space: 'personal', anywhere: true, archived: true }), api.call('drive.folders.list', { space: 'personal', archived: true })]); if (!live()) return;
    const rows = [...(fo.ok ? fo.data : []), ...(fop.ok ? fop.data : [])].map((d) => ({ folder: d })).concat([...(fi.ok ? fi.data : []), ...(fp.ok ? fp.data : [])].map((f) => ({ file: f })));
    const canDelete = ctx.canAnywhere('drive.file.delete_any') || ctx.can('drive.file.delete_any');
    refreshTools(['Trash', '']); const ago = (iso) => { const d = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5); return d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : `${d} days ago`; };
    const restoreBtn = (r, it) => (canWrite ? h('button', { type: 'button', class: 'btn ghost sm', 'aria-label': `Restore ${it.name}`, onclick: async (e) => { e.currentTarget.disabled = true; const x = await api.call(r.folder ? 'drive.folders.restore' : 'drive.files.restore', { id: it.id }); if (x.ok) { toast('Restored to its folder.'); trash(); } else { e.currentTarget.disabled = false; fail(x, 'restore that'); } } }, icon('restore'), 'Restore') : null);
    const delBtn = (r, it) => (canDelete ? h('button', { type: 'button', class: 'btn quiet sm drv-del', 'aria-label': `Delete ${it.name} forever`, onclick: () => dialog({ title: `Delete “${it.name}” forever?`, body: notice('err', 'warn', [h('b', {}, 'This can’t be undone.'), r.folder ? ' The folder is removed; anything still inside it moves up one level.' : ' The file and all its versions are removed.']),
      actions: [{ label: 'Delete forever', cls: 'dng', on: async () => { const x = await api.call(r.folder ? 'drive.folders.delete' : 'drive.files.delete', { id: it.id }); if (!x.ok) { fail(x, 'delete that'); return false; } toast('Deleted forever.', false); trash(); } }, { label: 'Cancel', focus: true }] }) }, 'Delete forever') : null);
    put(main, h('div', { class: 'dtools' }, h('h1', { 'data-page-title': true }, 'Trash')), h('p', { class: 'hint', style: 'margin:-6px 0 14px' }, 'Deleted items stay here, with their history and owner, until they are restored or deleted forever.'),
      rows.length ? h('div', { class: 'tblwrap' }, h('table', { class: 'tbl ftab' }, h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Name'), h('th', { scope: 'col' }, 'Deleted'), h('th', { scope: 'col' }, srOnly('Actions')))),
        h('tbody', {}, ...rows.map((r) => { const it = r.folder ?? r.file;
          return h('tr', {}, h('td', { class: 't1' }, h('span', { class: 'fname' }, r.folder ? h('span', { class: 'ft', style: 'background:var(--muted)' }, icon('folder')) : ftV8(it), h('span', {}, it.name))), h('td', { 'data-l': 'Deleted' }, ago(it.archived_at)),
            h('td', { 'data-l': '' }, h('span', { style: 'display:flex;gap:6px;justify-content:flex-end' }, restoreBtn(r, it), delBtn(r, it)))); }))))
        : emptyState({ title: 'The Trash is empty', body: 'Things you move to the Trash wait here until someone restores them or deletes them forever.', ic: 'trash' }));
  }
  const head = (title, sub, ...acts) => h('div', { class: 'pj-head' }, h('div', {}, h('div', { class: 'crumbs fine' }, 'Drive'), h('h1', { 'data-page-title': true }, title), sub ? h('p', { class: 'sub' }, sub) : null), acts.filter(Boolean).length ? h('div', { class: 'pj-actions' }, ...acts) : null);

  // ---------------------------------------------------------------- shell
  // ---------------------------------------------------------------- sidebar: New (above the menu), storage meter, the drag hint (V8 drive6.js dShell)
  const usageEl = h('div', { hidden: true });
  const meter = h('a', { class: 'storage', href: '#/office/admin/storage', hidden: true });
  root.__sideTop = h('div', { class: 'dside' }, canWrite || canWriteLibrary ? h('button', { type: 'button', class: 'btn primary', style: 'margin-bottom:10px;width:100%', onclick: (e) => newMenu(e.currentTarget) }, icon('plus'), 'New') : null);
  root.__side = h('div', { class: 'dside' }, meter, h('p', { class: 'hint', style: 'padding:10px 6px 0' }, 'Drag a file onto ', h('b', {}, 'Library'), ' or ', h('b', {}, 'Personal'), ' to move it.'));
  async function loadUsage() {
    const r = await api.call('storage.usage', {}); const u = r.ok && r.data?.[0]; if (!u || !live() || !(u.cap_bytes > 0)) return;
    const pct = Math.min(100, Math.round((100 * u.total_bytes) / u.cap_bytes)); meter.hidden = false;
    put(meter, h('b', { style: 'color:var(--text)' }, 'Storage'), h('div', { class: 'bar', role: 'progressbar', 'aria-label': 'Storage used', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) }, h('i', { style: `width:${pct}%${pct >= 90 ? ';background:var(--danger, #d9412b)' : ''}` })),
      `${formatSize(u.total_bytes)} of ${formatSize(u.cap_bytes)}`, pct >= 90 ? h('span', { class: 'fine', style: 'display:block;color:var(--danger, #d9412b)' }, 'Almost full') : null);
  }
  (async () => { const r = await api.call('drive.shares.mine', {}); const n = r.ok ? r.data.length : 0; const a = document.querySelector('.side .nav a[data-key="shared"]'); if (a && live()) { a.querySelector('.count')?.remove(); if (n) a.append(h('span', { class: 'count' }, String(n))); } })();
  // keyboard: arrows move between items, Enter opens, Space selects, F2 renames, Delete moves to the Trash, the menu key (or Shift+F10) opens the menu; right-click does too
  list.addEventListener('keydown', (e) => {
    const it = e.target.closest?.('[data-item]'); if (!it || e.target !== it) return; const rec = byId.get(it.dataset.item); if (!rec) return;
    const items = [...list.querySelectorAll('[data-item]')]; const i = items.indexOf(it); const cols = state.mode === 'grid' ? getComputedStyle(list.querySelector('.fgrid') ?? list).gridTemplateColumns.split(' ').length : 1;
    const go = (n) => { const t = items[Math.max(0, Math.min(items.length - 1, n))]; if (t) { items.forEach((x) => { x.tabIndex = -1; }); t.tabIndex = 0; t.focus(); } };
    const k = e.key; const folder = rec.folder; const file = rec.file;
    if (k === 'ArrowDown') { e.preventDefault(); go(i + cols); } else if (k === 'ArrowUp') { e.preventDefault(); go(i - cols); } else if (k === 'ArrowRight' && cols > 1) { e.preventDefault(); go(i + 1); } else if (k === 'ArrowLeft' && cols > 1) { e.preventDefault(); go(i - 1); }
    else if (k === 'Home') { e.preventDefault(); go(0); } else if (k === 'End') { e.preventDefault(); go(items.length); }
    else if (k === 'Enter') { e.preventDefault(); folder ? ctx.go(driveHref(space, folder.id)) : openFile(file); }
    else if (k === ' ') { e.preventDefault(); const c = it.querySelector('.drv-pick'); if (c) { c.checked = !c.checked; c.dispatchEvent(new Event('change')); } }
    else if (k === 'F2' && canWrite && !(folder ?? file).protected_sop) { e.preventDefault(); rename(folder ?? file, !!folder); }
    else if ((k === 'Delete' || k === 'Backspace') && canWrite && !(folder ?? file).protected_sop) { e.preventDefault(); state.selected.size > 1 && state.selected.has((folder ?? file).id) ? trashRecs([...state.selected].map((id) => byId.get(id)).filter(Boolean)) : folder ? trashFolder(folder) : trashMany([file]); }
    else if (k === 'ContextMenu' || (k === 'F10' && e.shiftKey)) { e.preventDefault(); menuAt(it); }
  });
  list.addEventListener('contextmenu', (e) => { const it = e.target.closest?.('[data-item]'); if (!it) return; e.preventDefault(); menuAt(it, e.clientX, e.clientY); });
  // ---------------------------------------------------------------- V8 page header: type chips, title, Type / People, list|grid, New folder, Upload
  const CHIPS = [['all', 'All', null], ['doc', 'Docs', 'doc'], ['sheet', 'Sheets', 'sheet'], ['slides', 'Slides', 'slides'], ['pdf', 'PDFs', 'pdf'], ['image', 'Images', 'image'], ['form', 'Forms', 'forms']];
  const CHIP_ICON = { doc: 'doc', sheet: 'sheetI', slides: 'slideI', pdf: 'pdfI', image: 'imgI', forms: 'forms' };
  const typeChips = (cur = 'all') => h('div', { class: 'typechips', role: 'tablist', 'aria-label': 'File type' }, ...CHIPS.map(([k, l, c]) => h('a', { role: 'tab', 'aria-selected': String(cur === k), href: k === 'all' ? '#/drive/home' : `#/drive/type/${k}`, class: 'chipbtn' },
    c ? h('span', { class: `ft ${c}` }, icon(CHIP_ICON[c])) : icon('layers'), l)));
  const people$ = { who: null };
  const peopleChip = () => h('button', { type: 'button', class: `chip hide-m${people$.who ? ' on' : ''}`, 'aria-haspopup': 'true', onclick: async (e) => { await peopleReady; const a = e.currentTarget;
    popMenu(a, [{ label: 'Anyone', ic: people$.who ? null : 'check', on: () => { people$.who = null; refreshTools(); paint(); } }, ...(people ?? []).slice(0, 30).map((p) => ({ label: p.is_you ? `${p.display_name} (you)` : p.display_name, ic: people$.who === p.user_id ? 'check' : 'user', on: () => { people$.who = p.user_id; refreshTools(); paint(); } }))], 'People'); } },
    icon('team'), people$.who ? (people?.find((p) => p.user_id === people$.who)?.display_name ?? 'People') : 'People');
  const typeChip = () => h('button', { type: 'button', class: `chip${state.type !== 'all' ? ' on' : ''}`, 'aria-haspopup': 'true', onclick: (e) => popMenu(e.currentTarget, TYPES.map(([k, x]) => ({ label: x, ic: state.type === k ? 'check' : null, on: () => { state.type = k; typeSel.value = k; refreshTools(); paint(); } })), 'Type') },
    icon('filter'), state.type === 'all' ? 'Type' : TYPES.find(([k]) => k === state.type)?.[1] ?? 'Type');
  const tog = () => h('div', { class: 'tog', role: 'group', 'aria-label': 'View' }, ...[['list', 'list', 'List view'], ['grid', 'tiles', 'Grid view']].map(([k, ic, l]) => h('button', { type: 'button', 'aria-pressed': String(state.mode === k), 'aria-label': l, title: l, onclick: () => { state.mode = k; lsSet('l2f.drive.view', k); refreshTools(); paint(); } }, icon(ic))));
  const toolsEl = h('div', { class: 'dtools' });
  const titleOf = () => (space === 'personal' ? ['My Drive', 'Personal'] : [folderId ? (crumbName ?? 'Folder') : 'My Drive', folderId ? 'Library' : ctx.orgName]);
  let crumbName = null;
  function refreshTools(title) {
    const [t1, t2] = title ?? titleOf();
    put(toolsEl, h('h1', { 'data-page-title': true }, t1, ' ', h('span', {}, t2)), typeChip(), peopleChip(), tog(),
      canWrite && view === 'files' ? h('button', { type: 'button', class: 'btn ghost', onclick: newFolder }, icon('fplus'), h('span', { class: 'hide-m' }, 'New folder')) : null,
      canWrite && view === 'files' ? h('button', { type: 'button', class: 'btn ink', onclick: () => picker.click() }, icon('upload'), h('span', { class: 'hide-m' }, 'Upload')) : null);
  }
  const owned = (f) => !people$.who || f.uploaded_by === people$.who || (f.space === 'personal' && f.owner_id === people$.who);
  const filesShell = () => { refreshTools();
    put(main, typeChips('all'), toolsEl, space === 'personal' ? h('div', { class: 'notice plain', style: 'margin-bottom:16px' }, icon('lock'), h('span', {}, 'Your Personal space is private: only you can open it. Move or copy a file to the Library to let your team in.')) : null,
      !canWrite ? readOnlyNotice('You can look at the library but not add to it', '') : null, crumb, h('div', { class: 'toolbar drv-tools' }, inp(search), h('span', { class: 'drv-sortbox' }, sortSel, dirBtn)), bar, list, usageEl); };

  // ---------------------------------------------------------------- Home: Suggested for you · Folders · Recent files
  async function homePage() {
    refreshTools(['Home', '']);
    const [rc, fo] = await Promise.all([api.call('drive.recent', { limit: 30 }), api.call('drive.folders.list', { space: 'shared' }), starsReady, peopleReady]); if (!live()) return;
    if (!rc.ok) return put(main, typeChips('all'), toolsEl, rc.status === 404 ? noAccessState({}) : errorState(load));
    const files = rc.data.filter(owned); const opened = files.filter((f) => f.opened_at).slice(0, 4); const sug = opened.length ? opened : files.slice(0, 4);
    state.files = files; state.folders = fo.ok ? fo.data : []; byId.clear(); for (const f of files) byId.set(f.id, { file: f }); for (const d of state.folders) byId.set(d.id, { folder: d });
    const recentFiles = files.filter((f) => matchesType(f, state.type)).slice(0, 20);
    put(main, typeChips('all'), toolsEl,
      sug.length ? h('h2', { class: 'over', style: 'margin-bottom:12px' }, 'Suggested for you') : null, sug.length ? suggested(sug) : null,
      state.folders.length ? h('h2', { class: 'over', style: 'margin-bottom:12px' }, 'Folders') : null, state.folders.length ? h('div', { class: 'drv-list' }, folderTiles(state.folders)) : null,
      h('h2', { class: 'over', style: 'margin-bottom:12px' }, 'Recent files'), bar,
      h('div', { class: 'drv-list', 'data-home': '1' }, recentFiles.length ? (state.mode === 'grid' ? fileGrid(recentFiles) : fileTable(recentFiles)) : emptyState({ title: 'Nothing here yet', body: canWrite ? 'Create a document or upload files to get started.' : 'Files you can open will appear here.', ic: 'drv', action: canWrite ? btn('New', (e) => newMenu(e.currentTarget), 'primary') : null })), usageEl);
    paintSel();
  }

  // ---------------------------------------------------------------- a type's own page: header, templates, only that type (no "Suggested for you")
  const CAT = { doc: ['Docs', 'doc', 'Document', 'doc'], sheet: ['Sheets', 'sheet', 'Spreadsheet', 'sheetI'], slides: ['Slides', 'slides', 'Presentation', 'slideI'], pdf: ['PDFs', 'pdf', 'PDF', 'pdfI'], image: ['Images', 'image', 'Image', 'imgI'], form: ['Forms', 'forms', 'Form', 'forms'] };
  const cat = { where: 'anywhere', sort: 'modified' };
  async function typePage() {
    const t = route.type; const T = CAT[t]; refreshTools([T[0], '']);
    if (t === 'form') {
      const r = await api.call('forms.list', {}); if (!live()) return;
      const forms = r.ok ? r.data : [];
      return put(main, typeChips(t), h('div', { class: 'cathead' }, h('span', { class: 'ft forms big' }, icon('forms')), h('div', {}, h('h1', { class: 't1', 'data-page-title': true }, 'Forms'), h('p', { class: 'hint' }, `${forms.length} form${forms.length === 1 ? '' : 's'} in the Forms app`)), h('span', { class: 'grow' }), h('a', { class: 'btn primary sm', href: '#/forms' }, icon('forms'), 'Open Forms')),
        forms.length ? h('div', { class: 'tblwrap' }, h('table', { class: 'tbl ftab' }, h('thead', {}, h('tr', {}, h('th', {}, 'Form'), h('th', {}, 'Status'), h('th', { class: 'hide-m' }, 'Updated'))), h('tbody', {}, ...forms.map((f) => h('tr', {}, h('td', { class: 't1' }, h('span', { class: 'fname' }, h('span', { class: 'ft forms' }, icon('forms')), h('a', { href: `#/forms/${f.id}` }, f.name ?? f.title ?? 'Form'))), h('td', {}, f.status ?? (f.published_at ? 'Published' : 'Draft')), h('td', { class: 'hide-m' }, rel(f.updated_at)))))))
        : h('div', { class: 'empty' }, h('h3', {}, 'Forms live in the Forms app'), h('p', {}, 'They’re listed here so you can find them.'), h('a', { class: 'btn ghost sm', href: '#/forms' }, 'Open Forms')));
    }
    const calls = [cat.where === 'anywhere' || cat.where === 'shared' ? api.call('drive.files.list', { space: 'shared', anywhere: true }) : null, cat.where === 'anywhere' || cat.where === 'personal' ? api.call('drive.files.list', { space: 'personal', anywhere: true }) : null, cat.where === 'anywhere' || cat.where === 'mine' ? api.call('drive.shares.mine', {}) : null];
    const [a, b, c] = await Promise.all([...calls.map((x) => x ?? Promise.resolve({ ok: true, data: [] })), starsReady, peopleReady]); if (!live()) return;
    const sharedToMe = (c.ok ? c.data : []).filter((x) => x.kind !== 'folder').map((x) => ({ ...x, kind: x.file_kind }));
    const seen = new Set(); let files = [...(a.ok ? a.data : []), ...(b.ok ? b.data : []), ...sharedToMe].filter((f) => (seen.has(f.id) ? false : seen.add(f.id)) && v8Type(f) === t && owned(f));
    files = cat.sort === 'name' ? files.sort((x, y) => x.name.localeCompare(y.name)) : files.sort((x, y) => String(y.updated_at).localeCompare(String(x.updated_at)));
    state.files = files; state.folders = []; byId.clear(); for (const f of files) byId.set(f.id, { file: f });
    const TPL = templatesFor(t); const where = t === 'pdf' || t === 'image' ? null : t;
    const newBtn = ['pdf', 'image'].includes(t) ? (canWrite ? h('button', { type: 'button', class: 'btn primary sm', onclick: () => picker.click() }, icon('upload'), 'Upload') : null)
      : canWrite ? h('button', { type: 'button', class: 'btn primary sm', onclick: () => createFrom(t, null) }, icon('plus'), `New ${T[2].toLowerCase()}`) : null;
    const whereSel = h('select', { class: 'sel sm', 'aria-label': 'Where', onchange: (e) => { cat.where = e.target.value; typePage(); } }, ...[['anywhere', 'Anywhere'], ['shared', 'Library'], ['personal', 'Personal'], ['mine', 'Shared with me']].map(([k, l]) => h('option', { value: k, ...(cat.where === k ? { selected: true } : {}) }, l)));
    const sortS = h('select', { class: 'sel sm', 'aria-label': 'Sort', onchange: (e) => { cat.sort = e.target.value; typePage(); } }, ...[['modified', 'Last modified'], ['name', 'Name']].map(([k, l]) => h('option', { value: k, ...(cat.sort === k ? { selected: true } : {}) }, l)));
    put(main, typeChips(t), h('div', { class: 'cathead' }, h('span', { class: `ft ${T[1]} big` }, icon(T[3])), h('div', {}, h('h1', { class: 't1', 'data-page-title': true }, T[0]), h('p', { class: 'hint' }, `${files.length} ${files.length === 1 ? T[2].toLowerCase() : T[0].toLowerCase()} you can open in Library, Personal and shared with you`)), newBtn),
      where && TPL.length && canWrite ? h('h2', { class: 'over', style: 'margin:4px 0 8px' }, `Start a new ${T[2].toLowerCase()}`) : null,
      where && TPL.length && canWrite ? h('div', { class: 'tpl-row' }, ...TPL.map((x, i) => h('button', { type: 'button', class: `tpl${i ? '' : ' new'}`, onclick: () => createFrom(t, x) }, i ? h('span', { class: 'thumb', 'data-t': T[1] }) : icon('plus'), h('b', {}, x.name)))) : null,
      h('div', { class: 'tb6', style: 'margin-top:6px' }, h('span', { class: 'over' }, `All ${T[0].toLowerCase()}`), h('span', { class: 'grow' }), whereSel, sortS), bar,
      h('div', { class: 'drv-list' }, files.length ? fileTable(files) : emptyState({ title: `No ${T[0].toLowerCase()} yet`, body: where ? 'Start one above or upload.' : 'Upload one to see it here.', ic: 'drv' })));
    paintSel();
  }

  // a new file from a category page or template; one at a time (a double click never makes two)
  let creating = false;
  async function createFrom(t, tpl) {
    if (creating) return; creating = true;
    try {
      const mime = t === 'doc' ? DOC_MIME : t === 'sheet' ? SHEET_MIME : SLIDES_MIME; const T = CAT[t];
      const body = (tpl ?? templatesFor(t)[0]).body(); const name = tpl && tpl.name !== 'Blank' ? tpl.name : `Untitled ${T[2].toLowerCase()}`;
      const where = canWrite ? 'shared' : 'personal';
      const r = await api.call('drive.files.create', { space: where, name, kind: 'document', mime_type: mime, body }); if (!r.ok) { fail(r, 'create files'); return; }
      ctx.go(openHref(r.data[0]));
    } finally { creating = false; }
  }

  // ---------------------------------------------------------------- Starred (files and folders you starred, on every device)
  async function starredPage() {
    refreshTools(['Starred', '']); await starsReady;
    const r = await api.call('drive.starred', {}); if (!live()) return;
    if (!r.ok) return put(main, typeChips('all'), toolsEl, errorState(load));
    const files = r.data.filter((x) => x.kind !== 'folder' && owned(x)); const folders = r.data.filter((x) => x.kind === 'folder');
    state.files = files; state.folders = folders; byId.clear(); for (const f of files) byId.set(f.id, { file: f }); for (const d of folders) byId.set(d.id, { folder: d });
    put(main, typeChips('all'), toolsEl, bar, h('div', { class: 'drv-list' }, folders.length ? folderTiles(folders) : null,
      files.length ? (state.mode === 'grid' ? fileGrid(files) : fileTable(files)) : folders.length ? null : emptyState({ title: 'Nothing starred yet', body: 'Star a file or folder (★ in the list, or from its menu) to keep it here on every device.', ic: 'star' })));
    paintSel();
  }

  put(root, h('div', { class: 'pj-grid' }, main), picker, panel); dropZone();
  if (view === 'files') filesShell();
  loadUsage();
  load();
  return root;
}
