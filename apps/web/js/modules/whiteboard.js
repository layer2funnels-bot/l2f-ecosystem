// Whiteboard: the shared board editor, mounted wherever a board opens (Projects > Whiteboards, a client's Whiteboards, Drive, the All boards
// list). A board is a Drive document with the whiteboard mime type; its context (a project, a client, or the shared Drive) comes from the record,
// so the breadcrumb and the permissions follow it. The drawing editor is a self-hosted bundle (apps/whiteboard, Excalidraw, MIT) loaded only
// when a board opens. Saving, conflicts, history and the unsaved-work guard are the shared session (session.js).
import { h, icon, btn, notice, skeleton, errorState, noAccessState, readOnlyNotice, toast } from '../ui.js';
import { BOARD_MIME, parseBoard, serializeBoard, signature, countLive, MAX_CHARS, emptyBoard } from './boardmodel.js';
import { createSession } from './session.js';

export { BOARD_MIME };
const BASE = '/whiteboard/';
let loading = null;
/** Loads the editor bundle once. Resolves to its module, or throws when this build shipped without it. */
export function loadEditor() {
  if (!loading) {
    window.EXCALIDRAW_ASSET_PATH = BASE;
    if (!document.querySelector('link[data-l2f-board]')) document.head.append(h('link', { rel: 'stylesheet', href: `${BASE}board.css`, 'data-l2f-board': '' }));
    loading = import(`${BASE}board.js`).catch((e) => { loading = null; throw e; });
  }
  return loading;
}
const theme = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
const timeOf = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** Creates a board in a context. context: { space: 'shared' } | { space: 'client', client } | { space: 'client'|'shared', project[, client] }. Returns the API result. */
export const createBoard = (api, name, context = { space: 'shared' }) =>
  api.call('drive.files.create', { app: 'whiteboard', space: context.space, ...(context.client ? { client: context.client } : {}), ...(context.project ? { project: context.project } : {}), name, kind: 'document', mime_type: BOARD_MIME, body: emptyBoard() });

export function boardView({ api, id, ctx }) {
  const root = h('section', { class: 'board', 'aria-busy': 'true' }, skeleton(4));
  const fail = (el) => root.replaceChildren(el);
  const load = async () => {
    const f = await api.call('drive.files.get', { id });
    if (!ctx.live()) return;
    if (!f.ok) return fail(f.status === 404 ? noAccessState({ action: h('a', { class: 'btn', href: '#/launcher' }, 'Back to the Launcher') }) : errorState(() => { root.replaceChildren(skeleton(4)); load(); }));
    const file = f.data[0];
    if (file.kind !== 'document' || file.mime_type !== BOARD_MIME) return fail(h('div', { class: 'empty', role: 'status' }, icon('wb'), h('h2', { 'data-page-title': true }, file.name), h('p', { class: 'muted' }, 'This is not a whiteboard.'), file.kind === 'document' ? h('a', { class: 'btn pri', href: `#/doc/${file.id}` }, 'Open it as a document') : null));
    const v = await api.call('drive.files.version', { file: id });
    if (!ctx.live()) return;
    if (!v.ok) return fail(errorState(() => { root.replaceChildren(skeleton(4)); load(); }));
    let editor;
    try { editor = await loadEditor(); } catch { return fail(h('div', { class: 'empty', role: 'status' }, icon('warn'), h('h2', { 'data-page-title': true }, 'The whiteboard editor isn’t available in this build'), h('p', { class: 'muted' }, 'Your board is safe. The editor files were not shipped with this version of the site.'))); }
    if (!ctx.live()) return;
    mount(file, v.data[0], editor);
  };

  function mount(file, ver, editor) {
    let meta = file;
    const readOnly = Boolean(file.archived_at) || !ctx.can('drive.file.upload', file.client_id);
    const scene = parseBoard(ver.body ?? '');
    let els = scene.elements, bg = scene.background, sig = signature(els), cache = { sig, body: null };
    const getBody = () => { if (cache.sig !== sig || cache.body === null) cache = { sig, body: serializeBoard(els, bg) }; return cache.body; };
    const surface = h('div', { class: 'boardsurface', role: 'application', 'aria-label': `Whiteboard ${meta.name}` });
    const statusEl = h('span', { class: 'docstate', role: 'status', 'aria-live': 'polite' }); const counter = h('span', { class: 'docstat muted' });
    const saveBtn = btn('Save', () => sess.save({ manual: true }), 'pri');
    const titleIn = h('input', { class: 'doctitle', value: meta.name, 'aria-label': 'Board name', maxlength: '200', ...(readOnly ? { readonly: true } : {}) });
    const crumb = h('nav', { class: 'crumbs fine', 'aria-label': 'Where this board lives' });
    let board = null;
    const paint = ({ status, savedAt, readOnly: ro, saving }) => {
      const t = { saved: `Saved ${timeOf(savedAt)}`, dirty: 'Unsaved changes', saving: 'Saving…', failed: 'Couldn’t save. Your changes are still here.', readonly: 'Read only' }[status];
      statusEl.replaceChildren(...[h('span', { class: `dot ${status}` }), t, status === 'failed' ? btn('Retry', () => sess.save({ manual: true }), 'link') : null].filter(Boolean));
      saveBtn.disabled = ro || status === 'saved' || saving;
    };
    const sess = createSession({ api, id, ctx, version: ver.version, savedBody: null, savedAt: ver.created_at, readOnly, getBody, label: () => meta.name, onStatus: paint,
      setBody: (body) => { const s = parseBoard(body); els = s.elements; bg = s.background; sig = signature(els); board?.replaceScene(els, bg); paintCount(); }, maxChars: MAX_CHARS });
    // the saved baseline is what the stored text parses to, written the way we write it
    sess.reset({ version: ver.version, savedAt: ver.created_at });
    let pending = 0, touched = false;
    // until the person touches the board, whatever the editor reports is it normalising what it opened, not an edit
    for (const t of ['pointerdown', 'keydown', 'wheel', 'paste']) surface.addEventListener(t, () => { touched = true; }, { capture: true, once: false });
    const paintCount = () => { const n = countLive(els); const size = getBody().length; counter.textContent = `${n} item${n === 1 ? '' : 's'}${size > MAX_CHARS * 0.8 ? ` · ${Math.round(size / 1000)}k of ${MAX_CHARS / 1000}k characters` : ''}`; counter.classList.toggle('warn', size > MAX_CHARS * 0.8); };
    const changed = (elements, view) => {
      const s = signature(elements);
      const bgNew = view?.background ?? bg;
      if (s === sig && bgNew === bg) return;
      els = elements; bg = bgNew; sig = s;
      if (!touched) { sess.rebase(); return; }
      cancelAnimationFrame(pending); pending = requestAnimationFrame(() => { sess.markChanged(); paintCount(); });
    };
    const rename = async () => {
      const name = titleIn.value.trim();
      if (readOnly || name === meta.name) { titleIn.value = meta.name; return; }
      if (!name || /[\/\\]/.test(name)) { toast('A name can’t be empty or contain a slash.', false); titleIn.value = meta.name; return; }
      const r = await api.call('drive.files.update', { id, name });
      if (r.ok) { meta = { ...meta, name }; document.title = `${name} · Whiteboard`; toast('Renamed.'); } else { toast(r.message ?? 'Couldn’t rename.', false); titleIn.value = meta.name; }
    };
    titleIn.addEventListener('change', rename); titleIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); titleIn.blur(); } });
    surface.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); sess.save({ manual: true }); } });
    const themeWatch = new MutationObserver(() => { if (!root.isConnected) { themeWatch.disconnect(); return; } board?.setTheme(theme()); });
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    (async () => {
      let parts;
      if (meta.project_id) { const p = await api.call('projects.get', { id: meta.project_id }); parts = [h('a', { href: '#/projects' }, 'Projects'), p.ok ? p.data[0].name : 'Project', 'Whiteboards']; }
      else if (meta.client_id) parts = [h('a', { href: '#/clients' }, 'Clients'), h('a', { href: `#/clients/c/${meta.client_id}?tab=documents` }, ctx.clients?.get?.(meta.client_id) ?? 'Client'), 'Whiteboards'];
      else parts = [h('a', { href: '#/drive' }, 'Drive'), meta.space === 'personal' ? 'Personal' : ctx.orgName, 'Whiteboards'];
      if (root.isConnected) crumb.replaceChildren(...parts.flatMap((x, i) => (i ? [h('span', { 'aria-hidden': 'true' }, ' / '), x] : [x])));
    })();
    const banners = [];
    if (meta.archived_at) banners.push(notice('info', 'eye', [h('b', {}, 'Archived.'), ' This board is read only. ', btn('Restore', async () => { const r = await api.call('drive.files.restore', { id }); if (r.ok) { toast('Restored.'); load(); } else toast('You can’t restore this board.', false); }, 'link')]));
    else if (readOnly) banners.push(readOnlyNotice('You can look at this board but not change it'));
    root.replaceChildren(...banners, h('div', { class: 'docbar' }, crumb, h('div', { class: 'docrow' }, titleIn, h('div', { class: 'docacts' }, statusEl, counter, btn('History', () => sess.openHistory(!readOnly)), saveBtn))), surface);
    root.removeAttribute('aria-busy'); document.title = `${meta.name} · Whiteboard`;
    board = editor.mountBoard(surface, { elements: els, background: bg, theme: theme(), readOnly, name: meta.name, onChange: changed });
    paintCount();
    // leaving the page releases the editor and the session (the address changed away from this board)
    const leave = () => { if (location.hash.startsWith(`#/board/${id}`)) return; window.removeEventListener('hashchange', leave); themeWatch.disconnect(); board?.destroy(); sess.destroy(); };
    window.addEventListener('hashchange', leave);
  }
  load();
  return root;
}
