// Drive (v4): the organization library and each person's Personal space. Folders, files, documents and spreadsheets in one list, uploads by drag and drop,
// a details drawer (Details, Sharing, Versions), Trash. Files that belong to another app (project, client, whiteboard…) are stored in the same place but are not
// listed here unless someone adds them to the library. Everything goes through the permission-checked API; the database decides.
import { inp, h, put, icon, btn, chip, dialog, drawer, toast, field, notice, skeleton, emptyState, errorState, noAccessState, seg, readOnlyNotice } from '../ui.js';
import { emptyDoc, serialize } from './docmodel.js';
import { emptyBook, serializeBook, MIME as SHEET_MIME } from './sheetmodel.js';

const DOC_MIME = 'application/vnd.l2f.doc+json'; const BOARD_MIME = 'application/vnd.excalidraw+json';
export const driveHref = (space, folder) => `#/drive${space === 'personal' ? '/personal' : ''}${folder ? `/f/${folder}` : ''}`;
const when = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const size = (n) => (n == null ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(2)} GB`);
const kindOf = (f) => (f.mime_type === DOC_MIME ? 'Document' : f.mime_type === SHEET_MIME ? 'Spreadsheet' : f.mime_type === BOARD_MIME ? 'Whiteboard' : f.kind === 'document' ? 'Text' : (f.mime_type ?? 'File').split('/').pop());
const TILE = { Document: ['DOC', '#2B5CF0'], Spreadsheet: ['XLS', '#13A592'], Whiteboard: ['WB', '#1B1D23'], Text: ['TXT', '#6B4FF0'] };
/** The file-type tile (Design v4): three letters on the type's colour. */
const ftile = (f) => { const [t, c] = TILE[kindOf(f)] ?? ['FILE', '#7D8190']; return h('span', { class: 'ftile', style: `--c:${c}`, 'aria-hidden': 'true' }, t); };
const iconOf = (f) => (f.mime_type === BOARD_MIME ? 'wb' : f.kind === 'document' ? 'doc' : 'drv');
export const openHref = (f) => (f.mime_type === SHEET_MIME ? `#/sheet/${f.id}` : f.mime_type === BOARD_MIME ? `#/board/${f.id}` : f.kind === 'document' ? `#/doc/${f.id}` : null);

export function driveView({ api, ctx, route }) {
  const root = h('section', { class: 'drv' }); const main = h('div', { class: 'drv-main' });
  const live = () => ctx.live() && root.isConnected;
  const space = route.space === 'personal' ? 'personal' : 'shared'; const view = route.view ?? 'files'; const folderId = route.folder ?? null;
  const canWrite = ctx.can('drive.file.upload') || ctx.canAnywhere('drive.file.upload');
  const fail = (r, what = 'do that') => toast(r?.status === 404 ? `You can’t ${what} here.` : (r?.message ?? 'Something went wrong. Try again.'), false);
  const state = { q: '', folders: [], files: [], selected: new Set() };

  // ---------------------------------------------------------------- navigation
  const side = h('nav', { class: 'pj-side', 'aria-label': 'Drive' });
  const link = (href, ic, text, on) => h('a', { class: 'pj-link', href, ...(on ? { 'aria-current': 'page' } : {}) }, icon(ic), text);
  put(side, link(driveHref('shared'), 'drv', `${ctx.orgName} library`, view === 'files' && space === 'shared'), link(driveHref('personal'), 'user', 'Personal', view === 'files' && space === 'personal'),
    link('#/drive/recent', 'clock', 'Recent', view === 'recent'), link('#/drive/trash', 'trash', 'Trash', view === 'trash'));
  const crumb = h('nav', { class: 'fpath fine', 'aria-label': 'Folder path' });

  // ---------------------------------------------------------------- loading
  async function load() {
    if (view === 'files') { /* keep the toolbar, replace only the list */ list.replaceChildren(skeleton(3)); } else put(main, skeleton(4));
    if (view === 'trash') return trash();
    if (view === 'recent') return recent();
    const arg = { space, ...(folderId ? { parent: folderId } : {}) };
    const [fo, fi, path] = await Promise.all([api.call('drive.folders.list', arg), api.call('drive.files.list', { space, ...(folderId ? { folder: folderId } : {}), ...(state.q ? { q: state.q, anywhere: true } : {}) }), folderId ? api.call('drive.folders.path', { id: folderId }) : Promise.resolve({ ok: true, data: [] })]);
    if (!live()) return;
    if (!fo.ok || !fi.ok) return put(view === 'files' ? list : main, fi.status === 404 || fo.status === 404 ? noAccessState({ action: h('a', { class: 'btn', href: driveHref(space) }, 'Back to Drive') }) : errorState(load));
    if (folderId && !path.data.length) return put(list, noAccessState({ title: 'Folder not found', action: h('a', { class: 'btn', href: driveHref(space) }, 'Back to Drive') }));
    state.folders = state.q ? [] : fo.data; state.files = fi.data; state.selected.clear();
    put(crumb, h('a', { href: driveHref(space) }, space === 'personal' ? 'Personal' : `${ctx.orgName} library`), ...path.data.flatMap((p) => [h('span', { 'aria-hidden': 'true' }, ' / '), p.id === folderId ? h('b', {}, p.name) : h('a', { href: driveHref(space, p.id) }, p.name)]));
    paint();
  }
  const bar = h('div', { class: 'drv-sel', hidden: true, role: 'region', 'aria-label': 'Selected items' });
  const list = h('div', { class: 'tblwrap' });
  function paint() {
    const rows = [...state.folders.map((d) => ({ folder: d })), ...state.files.map((f) => ({ file: f }))];
    put(list, rows.length ? h('div', { class: 'tblwrap' }, h('table', { class: 'tbl drv-tbl' }, h('caption', { class: 'sr' }, 'Folders and files'),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, h('span', { class: 'sr' }, 'Select')), ...['Name', 'Type', 'Size', 'Updated'].map((x) => h('th', { scope: 'col' }, x)), h('th', { scope: 'col' }, h('span', { class: 'sr' }, 'Actions')))),
      h('tbody', {}, ...rows.map(rowEl))))
      : emptyState({ title: state.q ? 'No file matches' : folderId ? 'This folder is empty' : space === 'personal' ? 'Your personal space is empty' : `${ctx.orgName} library is empty`, body: state.q ? 'Try another word.' : canWrite ? 'Drop files anywhere on this page, or use New.' : 'Nothing has been added here yet.', ic: 'drv', first: !state.q && !folderId, action: canWrite && !state.q ? btn('New', newMenu, 'primary') : null }));
    paintSel();
  }
  function rowEl(r) {
    if (r.folder) { const d = r.folder; return h('tr', {}, h('td', {}), h('td', { class: 't1' }, h('span', { class: 'fname' }, h('span', { class: 'ftile folder', 'aria-hidden': 'true' }, icon('folder')), h('a', { href: driveHref(space, d.id) }, d.name), h('small', {}, `${d.files} file${d.files === 1 ? '' : 's'}`))), h('td', {}, 'Folder'), h('td', {}, ''), h('td', {}, when(d.updated_at)), h('td', {}, menuBtn(d, true))); }
    const f = r.file; const href = openHref(f);
    const cb = h('input', { type: 'checkbox', 'aria-label': `Select ${f.name}`, onchange: (e) => { e.target.checked ? state.selected.add(f.id) : state.selected.delete(f.id); paintSel(); } });
    return h('tr', {}, h('td', {}, cb), h('td', { class: 't1' }, h('span', { class: 'fname' }, ftile(f), href ? h('a', { href }, f.name) : h('button', { type: 'button', class: 'linklike', onclick: () => download(f) }, f.name), f.protected_sop ? chip('Approved SOP', 'ok') : null)), h('td', {}, kindOf(f)), h('td', {}, size(f.size_bytes)), h('td', {}, when(f.updated_at)), h('td', {}, menuBtn(f, false)));
  }
  function paintSel() {
    const n = state.selected.size; bar.hidden = n === 0; if (!n) return;
    put(bar, h('b', {}, `${n} selected`), btn('Download', async () => { for (const id of state.selected) { const f = state.files.find((x) => x.id === id); if (f?.kind === 'file') await download(f); } }, ''), canWrite ? btn('Move', () => moveDialog([...state.selected].map((id) => ({ file: state.files.find((x) => x.id === id) }))), '') : null, canWrite ? btn('Move to Trash', () => trashMany([...state.selected].map((id) => state.files.find((x) => x.id === id))), '') : null, btn('Clear', () => { state.selected.clear(); paint(); }, 'link'));
  }
  async function download(f) {
    if (f.kind !== 'file') { const h2 = openHref(f); if (h2) ctx.go(h2); return; }
    const r = await api.call('drive.files.download', { id: f.id }); if (!r.ok || !r.data[0]) return fail(r, 'download that file');
    window.open(r.data[0].url, '_blank', 'noopener');
  }

  // ---------------------------------------------------------------- row menu
  function menuBtn(item, isFolder) {
    const name = item.name;
    return btn(['Actions', h('span', { class: 'sr' }, ` for ${name}`)], () => {
      const acts = [];
      if (!isFolder) { const href = openHref(item); acts.push({ label: href ? 'Open' : 'Download', on: () => (href ? ctx.go(href) : download(item)) }, { label: 'Details', on: () => details(item) }); }
      if (canWrite && !item.protected_sop) acts.push({ label: 'Rename', on: () => rename(item, isFolder) }, { label: 'Move', on: () => moveDialog([isFolder ? { folder: item } : { file: item }]) });
      if (canWrite && !item.protected_sop) acts.push({ label: 'Move to Trash', on: () => (isFolder ? trashFolder(item) : trashMany([item])) });
      dialog({ title: name, body: h('p', { class: 'fine muted' }, 'Choose what to do.'), actions: [...acts.map((a) => ({ ...a, cls: '' })), { label: 'Close', focus: true }] });
    }, 'link');
  }
  function rename(item, isFolder) {
    const f = field({ id: 'dr-name', label: 'Name', value: item.name, maxlength: 200 });
    dialog({ title: `Rename ${isFolder ? 'folder' : 'file'}`, body: f.el, actions: [{ label: 'Rename', cls: 'primary', on: async () => { const n = f.input.value.trim(); if (!n || /[\/\\]/.test(n)) return f.error('Use a name without slashes.');
      const r = await api.call(isFolder ? 'drive.folders.update' : 'drive.files.update', { id: item.id, name: n }); if (!r.ok) { fail(r, 'rename that'); return false; } toast('Renamed.'); load(); } }, { label: 'Cancel' }] });
  }
  async function moveDialog(items) {
    const r = await api.call('drive.folders.list', { space }); const all = [];
    // one level at a time would need many calls; list the folders at the top and inside the current folder
    const inCurrent = folderId ? await api.call('drive.folders.list', { space, parent: folderId }) : { ok: true, data: [] };
    const ids = new Set(items.filter((x) => x.folder).map((x) => x.folder.id));
    const opts = [{ id: '', name: space === 'personal' ? 'Personal (top level)' : `${ctx.orgName} library (top level)` }, ...(r.ok ? r.data : []), ...(inCurrent.ok ? inCurrent.data : [])].filter((d) => !ids.has(d.id) && d.id !== folderId);
    const sel = h('select', { id: 'mv-to', 'aria-label': 'Move to' }, ...opts.map((d) => h('option', { value: d.id }, d.name)));
    dialog({ title: `Move ${items.length} item${items.length === 1 ? '' : 's'}`, body: [h('div', { class: 'fld' }, h('label', { for: 'mv-to' }, 'Move to'), sel)], actions: [{ label: 'Move', cls: 'primary', on: async () => {
      for (const it of items) { const input = it.folder ? { id: it.folder.id, ...(sel.value ? { parent: sel.value } : { to_root: true }) } : { id: it.file.id, ...(sel.value ? { folder: sel.value } : { to_root: true }) };
        const x = await api.call(it.folder ? 'drive.folders.update' : 'drive.files.update', input); if (!x.ok) { fail(x, 'move that'); return false; } }
      toast('Moved.'); load(); } }, { label: 'Cancel' }] });
  }
  async function trashMany(files) {
    for (const f of files) { const r = await api.call('drive.files.archive', { id: f.id }); if (!r.ok) return fail(r, 'move that to the Trash'); }
    toast(`${files.length === 1 ? 'Moved' : `${files.length} items moved`} to the Trash.`); load();
  }
  function trashFolder(d) {
    dialog({ title: `Move “${d.name}” to the Trash?`, body: h('p', {}, 'The folder leaves the list. Files inside it stay where they are and keep their place if you restore the folder.'), actions: [{ label: 'Move to Trash', cls: 'primary', on: async () => { const r = await api.call('drive.folders.archive', { id: d.id }); if (!r.ok) { fail(r, 'move that to the Trash'); return false; } toast('Moved to the Trash.'); load(); } }, { label: 'Cancel', focus: true }] });
  }

  // ---------------------------------------------------------------- New, upload
  function newMenu() {
    const make = (label, ic, fn, extra = {}) => ({ label, on: fn, ...extra });
    dialog({ title: 'New', body: h('p', { class: 'fine muted' }, 'Create something here, or drop files anywhere on this page.'), actions: [
      make('Folder', 'folder', newFolder), make('Document', 'doc', () => newFile('Document', DOC_MIME, serialize(emptyDoc()))), make('Spreadsheet', 'doc', () => newFile('Spreadsheet', SHEET_MIME, serializeBook(emptyBook()))),
      make('Upload files', 'drv', () => picker.click()), { label: 'Close', focus: true }] });
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
  const picker = h('input', { type: 'file', multiple: true, class: 'sr', tabindex: '-1', 'aria-hidden': 'true' }); picker.addEventListener('change', () => { upload([...picker.files]); picker.value = ''; });
  const progress = h('div', { class: 'drv-progress', role: 'status', 'aria-live': 'polite' });
  async function upload(files) {
    if (!canWrite) return toast('You can’t add files here.', false);
    for (const file of files) {
      const row = h('div', { class: 'drv-up' }, h('span', {}, file.name), h('progress', { max: '100', value: '0', 'aria-label': `Uploading ${file.name}` })); progress.append(row);
      try {
        const s = await api.call('drive.uploads.sign', { space, name: file.name, size_bytes: Math.max(1, file.size), mime_type: file.type || 'application/octet-stream' });
        if (!s.ok || !s.data[0]) throw new Error(s.status === 422 ? 'The storage limit is reached.' : 'Not allowed here.');
        await put2(s.data[0], file, (p) => { row.querySelector('progress').value = p; });
        const c = await api.call('drive.files.create', { space, name: file.name, kind: 'file', mime_type: file.type || 'application/octet-stream', size_bytes: Math.max(1, file.size), storage_path: s.data[0].path, ...(folderId ? { folder: folderId } : {}) });
        if (!c.ok) throw new Error('The file was uploaded but could not be added.');
        row.replaceChildren(h('span', {}, `${file.name} · done`));
      } catch (e) { row.replaceChildren(h('span', { class: 'err' }, `${file.name} · ${e.message}`)); }
    }
    setTimeout(() => progress.replaceChildren(), 4000); if (live()) load();
  }
  const put2 = (target, file, onP) => new Promise((resolve, reject) => {
    const x = new XMLHttpRequest(); x.open(target.method || 'PUT', target.url); for (const [k, v] of Object.entries(target.headers ?? {})) x.setRequestHeader(k, v);
    x.upload.onprogress = (e) => { if (e.lengthComputable) onP(Math.round((100 * e.loaded) / e.total)); };
    x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new Error('The upload failed.'))); x.onerror = () => reject(new Error('The upload failed.')); x.send(file);
  });
  const dropZone = () => {
    let depth = 0; const hint = h('div', { class: 'drv-drop', hidden: true, 'aria-hidden': 'true' }, 'Drop files to upload'); root.append(hint);
    root.addEventListener('dragenter', (e) => { if (!e.dataTransfer?.types?.includes('Files')) return; depth += 1; hint.hidden = false; });
    root.addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
    root.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) hint.hidden = true; });
    root.addEventListener('drop', (e) => { if (!e.dataTransfer?.files?.length) return; e.preventDefault(); depth = 0; hint.hidden = true; upload([...e.dataTransfer.files]); });
  };

  // ---------------------------------------------------------------- details drawer
  async function details(f) {
    const tab = { cur: 'details' }; const body = h('div', {});
    const draw = async () => {
      if (tab.cur === 'details') {
        const canLib = f.space === 'shared' && f.managed_by && ctx.can('drive.file.edit');
        put(body, h('dl', { class: 'drv-dl' }, ...[['Type', kindOf(f)], ['Size', size(f.size_bytes)], ['Version', String(f.current_version)], ['Location', f.space === 'personal' ? 'Personal' : f.space === 'client' ? 'A client’s own space' : `${ctx.orgName} library`], ['Added', when(f.created_at)], ['Updated', when(f.updated_at)], ['Belongs to', f.managed_by ? `the ${f.managed_by.replace(/_/g, ' ')} app` : 'Drive']].flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
          f.protected_sop ? notice('info', 'lock', 'This is an approved SOP. It is protected: only owners change it.') : null,
          f.managed_by && f.space === 'shared' ? h('div', { class: 'fld' }, h('label', {}, h('input', { type: 'checkbox', checked: f.in_library, ...(canLib ? {} : { disabled: true }), onchange: async (e) => { const r = await api.call('drive.files.setLibrary', { id: f.id, in_library: e.target.checked }); if (!r.ok) { e.target.checked = !e.target.checked; fail(r, 'change that'); } else { f = { ...f, in_library: e.target.checked }; toast(e.target.checked ? 'Added to the library.' : 'Removed from the library.'); load(); } } }), ' Show in the library'),
            h('p', { class: 'fine muted' }, 'This file belongs to another app and is stored safely either way. Showing it here does not move it.')) : null);
      } else if (tab.cur === 'sharing') {
        put(body, f.space === 'client' ? h('div', {}, h('label', {}, h('input', { type: 'checkbox', checked: f.client_visible, ...(ctx.can('drive.file.share', f.client_id) ? {} : { disabled: true }), onchange: async (e) => { const r = await api.call('drive.files.share', { id: f.id, visible: e.target.checked }); if (!r.ok) { e.target.checked = !e.target.checked; fail(r, 'share that'); } else f = { ...f, client_visible: e.target.checked }; } }), ' Shareable with the client'), h('p', { class: 'fine muted' }, 'The Client Portal is locked, so nothing reaches the client yet.'))
          : h('div', {}, h('p', {}, f.space === 'personal' ? 'Only you can open your personal files. Administrators cannot, except through a logged emergency access that names a reason and tells you.' : `Everyone in ${ctx.orgName} with Drive access can open this file. What each person can change follows their access level in Admin.`), h('p', { class: 'fine muted' }, 'Share links need a public viewer page, which arrives with the Client Portal.')));
      } else {
        put(body, skeleton(2)); const r = await api.call('drive.files.versions', { file: f.id }); if (!live()) return;
        put(body, r.ok ? h('ul', { class: 'rows' }, ...r.data.map((x) => h('li', {}, h('div', {}, h('b', {}, `Version ${x.version}${x.version === f.current_version ? ' · newest' : ''}`), h('div', { class: 'fine muted' }, `${when(x.created_at)}${x.note ? ` · ${x.note}` : ''}`)), f.kind === 'file' ? btn('Download', async () => { const d = await api.call('drive.files.download', { id: f.id, version: x.version }); if (d.ok && d.data[0]) window.open(d.data[0].url, '_blank', 'noopener'); else fail(d, 'download that'); }, 'link') : null))) : errorState(draw));
        if (r.ok && f.kind === 'document') body.append(h('p', { class: 'fine muted' }, 'To restore an older version, open the file and use History.'));
      }
    };
    const strip = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Details' }, ...[['details', 'Details'], ['sharing', 'Sharing'], ['versions', 'Versions']].map(([k, l]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(k === tab.cur), 'data-k': k, onclick: (e) => { tab.cur = k; strip.querySelectorAll('[role=tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.k === k))); draw(); } }, l)));
    drawer({ title: f.name, label: `Details of ${f.name}`, body: [strip, body], actions: [{ label: 'Close', cls: 'primary' }] }); draw();
  }

  // ---------------------------------------------------------------- recent, trash
  async function recent() {
    const [a, b] = await Promise.all([api.call('drive.files.list', { space: 'shared', anywhere: true }), api.call('drive.files.list', { space: 'personal', anywhere: true })]); if (!live()) return;
    const files = [...(a.ok ? a.data : []), ...(b.ok ? b.data : [])].sort((x, y) => new Date(y.updated_at) - new Date(x.updated_at)).slice(0, 25);
    state.files = files; state.folders = [];
    put(main, head('Recent', 'The files you can open that changed most recently.'), files.length ? h('div', { class: 'card' }, h('ul', { class: 'rows' }, ...files.map((f) => h('li', {}, icon(iconOf(f)), openHref(f) ? h('a', { class: 'pj-title', href: openHref(f) }, f.name) : h('button', { type: 'button', class: 'linklike pj-title', onclick: () => download(f) }, f.name), h('span', { class: 'fine muted' }, `${kindOf(f)} · ${f.space === 'personal' ? 'Personal' : ctx.orgName} · ${when(f.updated_at)}`))))) : emptyState({ title: 'Nothing recent', body: 'Files you add or change appear here.', ic: 'clock' }));
  }
  async function trash() {
    const [fi, fo, fp, fop] = await Promise.all([api.call('drive.files.list', { space: 'shared', anywhere: true, archived: true }), api.call('drive.folders.list', { space: 'shared', archived: true }), api.call('drive.files.list', { space: 'personal', anywhere: true, archived: true }), api.call('drive.folders.list', { space: 'personal', archived: true })]); if (!live()) return;
    const rows = [...(fo.ok ? fo.data : []), ...(fop.ok ? fop.data : [])].map((d) => ({ folder: d })).concat([...(fi.ok ? fi.data : []), ...(fp.ok ? fp.data : [])].map((f) => ({ file: f })));
    const canDelete = ctx.canAnywhere('drive.file.delete_any') || ctx.can('drive.file.delete_any');
    put(main, head('Trash', 'Items you moved to the Trash. Restoring puts them back where they were.'),
      rows.length ? h('div', { class: 'card' }, h('ul', { class: 'rows' }, ...rows.map((r) => { const it = r.folder ?? r.file; return h('li', {}, icon(r.folder ? 'folder' : iconOf(it)), h('span', { class: 'pj-title' }, it.name), h('span', { class: 'fine muted' }, when(it.archived_at)),
        canWrite ? btn(['Restore', h('span', { class: 'sr' }, ` ${it.name}`)], async () => { const x = await api.call(r.folder ? 'drive.folders.restore' : 'drive.files.restore', { id: it.id }); if (x.ok) { toast('Restored.'); trash(); } else fail(x, 'restore that'); }, 'link') : null,
        canDelete ? btn(['Delete for good', h('span', { class: 'sr' }, ` ${it.name}`)], () => dialog({ title: `Delete “${it.name}” for good?`, body: notice('err', 'warn', [h('b', {}, 'This can’t be undone.'), ' The item and all its versions are removed.']), actions: [{ label: 'Delete for good', cls: 'dng', on: async () => { const x = await api.call(r.folder ? 'drive.folders.delete' : 'drive.files.delete', { id: it.id }); if (!x.ok) { fail(x, 'delete that'); return false; } toast('Deleted for good.', false); trash(); } }, { label: 'Cancel', focus: true }] }), 'link') : null); }))) : emptyState({ title: 'The Trash is empty', body: 'Things you move to the Trash wait here until someone deletes them for good.', ic: 'trash' }));
  }
  const head = (title, sub, ...acts) => h('div', { class: 'pj-head' }, h('div', {}, h('div', { class: 'crumbs fine' }, 'Drive'), h('h1', { 'data-page-title': true }, title), sub ? h('p', { class: 'sub' }, sub) : null), acts.filter(Boolean).length ? h('div', { class: 'pj-actions' }, ...acts) : null);

  // ---------------------------------------------------------------- shell
  const search = h('input', { type: 'search', placeholder: 'Search the library', 'aria-label': 'Search files', autocomplete: 'off' }); let t = null;
  search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { state.q = search.value.trim(); load(); }, 250); });
  const filesShell = () => { put(main, head(space === 'personal' ? 'Personal' : 'Drive', space === 'personal' ? 'Only you can open these files.' : `The ${ctx.orgName} library: files and documents the whole team can find. Project and client files stay with their own app.`, canWrite ? btn('New', newMenu, 'primary') : null),
    !canWrite ? readOnlyNotice('You can look at the library but not add to it', '') : null, crumb, h('div', { class: 'toolbar' }, inp(search)), bar, list, progress); };
  put(root, h('div', { class: 'pj-grid' }, main), picker); dropZone();     // the spaces live in the app's side rail (appnav.js)
  if (view === 'files') filesShell();
  load();
  return root;
}
