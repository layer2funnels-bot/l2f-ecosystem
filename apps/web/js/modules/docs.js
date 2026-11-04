// Docs: the shared word processor for first-party documents (Drive documents of kind "document"). One module, mounted wherever a document opens
// (Drive, Office > Documents, a project's Docs, a client's Documents); the document's context (project, client, shared Drive) comes from the
// record itself, so the breadcrumb and the permissions follow it. Storage is the one Drive path: each save is a new version (history,
// restore, audit), checked against the version the editor started from so two people never overwrite each other silently.
// Model and safety rules: docmodel.js (JSON v2 with tabs, never HTML; links, colours, sizes, ids filtered). Surface <-> model: docdom.js.
// Editing engine (formatting on the model, paste, find, tables, images): docedit.js. Downloads and printing: docexport.js.
import { h, icon, toast, dialog, drawer, btn, notice, skeleton, errorState, noAccessState, readOnlyNotice, field } from '../ui.js';
import { dirty } from '../dirty.js';
import { parseBody, serialize, normalize, wordCount, charCount, outline, sizeOf, safeHref, MAX_CHARS, FONTS, SIZES, PAGES, MARGINS, DEFAULT_SIZE, MAX_TAB_DEPTH, MAX_TABS,
  flatTabs, findTab, tabCount, addTab, updateTab, duplicateTab, deleteTab, moveTab, moveTabTo, indentTab, outdentTab, contentOf, tabWords, spaceLeft, toText, toMarkdown, toHtml,
  findRegex, replaceInBlocks, countInBlocks, normBlocks, isEmpty, pageSize, marginsOf, notesOf } from './docmodel.js';
import { blocksFromHtml, fillToc, fillNotes, dataUrlToBlob } from './docdom.js';
import { blocksFromMarkdown, blocksFromText } from './docmd.js';
import { createEditor } from './docedit.js';
import { download, safeName, loadIo, printBlocks } from './docexport.js';
import { LANGS, SPEAKER_COLOURS, MAX_SPEAKERS, isUrdu, fmtClock, nextSpeaker, turnChanged, applyVoiceCommands, withSpacing, createRecognizer, voiceSupported, ERRORS } from './docvoice.js';

export const BOARD_MIME = 'application/vnd.excalidraw+json';
const AUTOSAVE_IDLE_MS = 8000, AUTOSAVE_MIN_MS = 30000;      // every save is a version, so autosave is slow on purpose; Save and leaving are immediate
const CHECK_IDLE_MS = 700, CHECK_MAX_MS = 5000;               // the model is read from the page when typing pauses, not on every key
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const timeOf = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const IMG_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '');
const MOD = mac ? '⌘' : 'Ctrl+';
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* private window */ } } };
const TEXT_COLOURS = ['#000000', '#404040', '#737373', '#a3a3a3', '#d4d4d4', '#ffffff', '#b91c1c', '#c2410c', '#a16207', '#15803d', '#0e7490', '#1d4ed8', '#6d28d9', '#be185d', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#fecaca', '#fed7aa', '#fef08a', '#bbf7d0', '#a5f3fc', '#bfdbfe', '#ddd6fe', '#fbcfe8'];
const HIGHLIGHTS = ['#fef08a', '#bbf7d0', '#a5f3fc', '#bfdbfe', '#ddd6fe', '#fbcfe8', '#fed7aa', '#fecaca', '#e5e5e5', '#fde047'];
const SPECIALS = [['Punctuation', '… – — ‘ ’ “ ” « » ‹ › ¡ ¿ § ¶ † ‡ • · ° ′ ″ © ® ™ №'], ['Currency', '$ € £ ¥ ¢ ₹ ₩ ₪ ₺ ₽ ฿ ₫ ₦ ₱'], ['Math', '± × ÷ ≠ ≈ ≤ ≥ ∞ √ ∑ ∏ ∂ ∫ ∆ π µ ‰ ¼ ½ ¾ ² ³ ¹'], ['Arrows', '← → ↑ ↓ ↔ ↕ ⇐ ⇒ ⇑ ⇓ ⇔ ↩ ↪ ➜'], ['Symbols', '✓ ✔ ✗ ✘ ★ ☆ ♥ ♦ ♣ ♠ ☀ ☁ ☎ ✉ ⚑ ⚠ ☐ ☑ ☒'], ['Letters', 'á à â ä ã å æ ç é è ê ë í ì î ï ñ ó ò ô ö õ ø œ ú ù û ü ý ÿ ß ð þ Á É Í Ó Ú Ñ Ç Ö Ü Å Æ Ø']];
const recent = (k) => { try { const v = JSON.parse(store.get(`dx-recent-${k}`) ?? '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 8) : []; } catch { return []; } };
const pushRecent = (k, v) => store.set(`dx-recent-${k}`, JSON.stringify([v, ...recent(k).filter((x) => x !== v)].slice(0, 8)));
const SHORTCUTS = [['Bold, italic, underline', `${MOD}B · ${MOD}I · ${MOD}U`], ['Link', `${MOD}K`], ['Undo · redo', `${MOD}Z · ${MOD}Y or ${MOD}Shift+Z`], ['Find · find and replace', `${MOD}F · ${MOD}H`], ['Save', `${MOD}S`], ['Print', `${MOD}P`],
  ['Clear formatting', `${MOD}\\`], ['Normal text · heading 1, 2, 3', `${MOD}Alt+0 · ${MOD}Alt+1, 2, 3`], ['Numbered · bulleted · checklist', `${MOD}Shift+7 · 8 · 9`], ['Align left · centre · right · justify', `${MOD}Shift+L · E · R · J`],
  ['Indent · outdent (lists and at the start of a line)', 'Tab · Shift+Tab'], ['Next · previous table cell (a new row at the end)', 'Tab · Shift+Tab'], ['Leave the page with the keyboard', 'Esc, then Tab'], ['Open a link in the text', `${MOD}Click`], ['Line break inside a paragraph', 'Shift+Enter'], ['Select all', `${MOD}A`]];

// ---- small floating panels: menus, colour pickers, the context menu
let openPop = null;
const closePop = () => openPop?.close();
function pop(anchor, content, { role = 'menu', label, at, onClose } = {}) {
  closePop();
  const el = h('div', { class: `dx-pop${role === 'menu' ? ' dx-menu' : ''}`, role, 'aria-label': label ?? false }, content);
  el.addEventListener('mousedown', (e) => { if (!e.target.closest('input,select,textarea')) e.preventDefault(); });
  document.body.append(el);
  const place = () => {
    const r = at ? { left: at.x, bottom: at.y, top: at.y } : anchor.getBoundingClientRect(); const w = el.offsetWidth, hh = el.offsetHeight;
    el.style.left = `${Math.max(8, Math.min(r.left, innerWidth - w - 8))}px`;
    const below = r.bottom + (at ? 0 : 2); el.style.top = `${Math.max(8, below + hh > innerHeight - 8 && r.top - hh - 2 > 8 ? r.top - hh - 2 : Math.min(below, innerHeight - hh - 8))}px`;
  };
  place();
  const outside = (e) => { if (!el.contains(e.target) && !(anchor?.contains?.(e.target))) close(); };
  const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(true); } };
  const nav = (e) => {
    if (role !== 'menu' || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const items = [...el.querySelectorAll('[role^=menuitem]:not(:disabled)')].filter((x) => !x.closest('[hidden]')); if (!items.length) return; e.preventDefault();
    const i = items.indexOf(document.activeElement);
    items[e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
  };
  document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', key, true); el.addEventListener('keydown', nav); addEventListener('resize', close);
  function close(refocus) { if (openPop !== self) return; el.remove(); document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', key, true); removeEventListener('resize', close); openPop = null; if (refocus === true) anchor?.focus?.(); onClose?.(); }
  const self = { close, el, place }; openPop = self;
  (el.querySelector('[role^=menuitem]:not(:disabled), button, input, select') ?? el).focus?.({ preventScroll: true });
  return self;
}
function menuItems(items, close, place) {
  return items.filter(Boolean).flatMap((it) => {
    if (it.sep) return h('div', { class: 'dx-sep', role: 'separator' });
    if (it.group) {
      const sub = h('div', { class: 'dx-subgroup', role: 'group', 'aria-label': it.group, hidden: !it.open }, ...menuItems(it.items, close, place));
      const b = h('button', { type: 'button', class: 'dx-mi dx-mg', role: 'menuitem', 'aria-haspopup': 'true', 'aria-expanded': String(Boolean(it.open)), onclick: () => { const open = sub.hidden; sub.hidden = !open; b.setAttribute('aria-expanded', String(open)); b.lastChild.textContent = open ? '▾' : '▸'; place?.(); } },
        h('span', { class: 'dx-mc', 'aria-hidden': 'true' }), h('span', { class: 'dx-ml' }, it.group), h('span', { class: 'dx-mk', 'aria-hidden': 'true' }, it.open ? '▾' : '▸'));
      return [b, sub];
    }
    if (it.heading) return h('div', { class: 'dx-mh', role: 'presentation' }, it.heading);
    const role = it.checked === undefined ? 'menuitem' : 'menuitemcheckbox';
    return h('button', { type: 'button', class: 'dx-mi', role, 'aria-checked': it.checked === undefined ? false : String(Boolean(it.checked)), disabled: Boolean(it.disabled), onclick: () => { close(); it.run?.(); } },
      h('span', { class: 'dx-mc', 'aria-hidden': 'true' }, it.checked ? '✓' : ''), h('span', { class: 'dx-ml' }, it.label), it.shortcut ? h('span', { class: 'dx-mk' }, it.shortcut) : null);
  });
}

// ---- the view
/** `opts.crumbs(meta)` replaces the breadcrumb parts; `opts.side(meta)` adds a side panel next to the page (Funnel Strategies use both). */
export function docView({ api, id, ctx, opts = {} }) {
  const root = h('section', { class: 'docs ed-full' }, skeleton(4));
  const load = async () => {
    const f = await api.call('drive.files.get', { id });
    if (!ctx.live()) return;
    if (!f.ok) { root.replaceChildren(f.status === 404 ? noAccessState({ action: h('a', { class: 'btn', href: '#/launcher' }, 'Back to the Launcher') }) : errorState(() => { root.replaceChildren(skeleton(4)); load(); })); return; }
    const file = f.data[0];
    if (file.kind !== 'document') { root.replaceChildren(h('div', { class: 'empty', role: 'status' }, icon('doc'), h('h2', { 'data-page-title': true }, file.name), h('p', { class: 'muted' }, 'This is a stored file, not a document, so it has no editor. Download it from Drive.'))); return; }
    if (file.mime_type === BOARD_MIME) { root.replaceChildren(h('div', { class: 'empty', role: 'status' }, icon('wb'), h('h2', { 'data-page-title': true }, file.name), h('p', { class: 'muted' }, 'This is a whiteboard. It opens in the Whiteboard editor.'), h('a', { class: 'btn primary', href: `#/board/${file.id}` }, 'Open the whiteboard'))); return; }
    const v = await api.call('drive.files.version', { file: id });
    if (!ctx.live()) return;
    if (!v.ok) { root.replaceChildren(errorState(() => { root.replaceChildren(skeleton(4)); load(); })); return; }
    mount(file, v.data[0]);
  };

  function mount(file, ver) {
    let meta = file, version = ver.version, status = 'saved', savedAt = ver.created_at, lastAuto = 0, timer = null, saving = false, readOnly = Boolean(file.archived_at) || !ctx.can('drive.file.upload', file.client_id);
    let doc = parseBody(ver.body ?? ''); let activeTab = doc.tabs[0].id; let savedBody = serialize(doc); let lastBody = savedBody;
    let spell = store.get('dx-spell') !== '0'; let outlineOpen = store.get('dx-outline') !== '0'; let mode = '';
    let zoom = Number(store.get('dx-zoom')) || 100; let tabsOpen = store.get('dx-tabs') ? store.get('dx-tabs') === '1' : innerWidth >= 900;
    const collapsed = new Set();
    const gone = () => !root.isConnected;

    const page = h('div', { class: 'docpage dx-doc', contenteditable: readOnly ? 'false' : 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Document text', spellcheck: 'true' });
    const hdrEl = h('div', { class: 'dx-hdr', 'aria-label': 'Page header' }), ftrEl = h('div', { class: 'dx-ftr', 'aria-label': 'Page footer' }), notesEl = h('div', { class: 'dx-notes', hidden: true, 'aria-label': 'Footnotes' });
    const paper = h('div', { class: 'dx-paper docsheet' }, hdrEl, page, notesEl, ftrEl);
    const statusEl = h('span', { class: 'docstate', role: 'status', 'aria-live': 'polite' });
    const outlineEl = h('div', { class: 'docoutline' });
    const tabsEl = h('div', { class: 'dx-tabs-list' });
    const counter = h('span', { class: 'docstat' }); const spaceEl = h('span', { class: 'docstat dx-space' });
    const saveBtn = btn('Save', () => save({ manual: true }), 'primary');
    const titleIn = h('input', { class: 'doctitle', value: meta.name, 'aria-label': 'Document name', maxlength: '200', ...(readOnly ? { readonly: true } : {}) });
    const backA = h('a', { class: 'dx-back', href: '#/drive', 'aria-label': 'Back to Drive', title: 'Back' }, icon('arrow'));
    const tools = [];                                          // toolbar controls that edit (disabled when read only)

    // ---- images (stored as Drive files; the document keeps only the file id)
    const srcCache = new Map();
    const blobToUrl = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
    const imageSrc = (f) => {
      if (!srcCache.has(f)) srcCache.set(f, (async () => {
        const r = await api.call('drive.files.download', { id: f }); const u = r.ok ? r.data[0]?.url : null; if (!u) return null;
        try { const res = await fetch(u); if (res.ok) return await blobToUrl(await res.blob()); } catch { /* the bucket may not allow reads from this page: show the signed address directly */ }
        return u;
      })());
      return srcCache.get(f);
    };
    async function uploadImage(blob, name = 'image') {
      if (readOnly) return null;
      const mime = blob.type; if (!IMG_TYPES[mime]) { toast('Only PNG, JPEG, GIF and WebP pictures can be added.', false); return null; }
      if (blob.size > 10 * 1024 * 1024) { toast('That picture is over 10 MB. Resize it first.', false); return null; }
      const id2 = await uploadBlob(blob, name, mime, IMG_TYPES[mime]); if (id2) srcCache.set(id2, blobToUrl(blob)); return id2;
    }
    /** Stores bytes as a Drive file next to this document (same space, client, folder and project) and returns the new file's id. */
    async function uploadBlob(blob, name, mime, ext) {
      if (readOnly) return null;
      const fname = (/\.[a-z0-9]{2,4}$/i.test(name) ? name : `${name}-${Date.now()}.${ext}`).replace(/[\/\\]/g, '-').slice(0, 180);
      const where = meta.client_id ? { space: 'client', client: meta.client_id } : { space: meta.space === 'personal' ? 'personal' : 'shared' };
      const s = await api.call('drive.uploads.sign', { ...where, name: fname, size_bytes: Math.max(1, blob.size), mime_type: mime });
      if (!s.ok || !s.data[0]) { toast(s.status === 422 ? 'The storage limit is reached.' : 'You can’t add pictures here.', false); return null; }
      const sent = await fetch(s.data[0].url, { method: s.data[0].method || 'PUT', headers: s.data[0].headers ?? {}, body: blob }).then((x) => x.ok, () => false);
      if (!sent) { toast('The upload failed. Try again.', false); return null; }
      const c = await api.call('drive.files.create', { ...where, ...(meta.folder_id ? { folder: meta.folder_id } : {}), ...(meta.project_id ? { project: meta.project_id } : {}), name: fname, kind: 'file', mime_type: mime, size_bytes: Math.max(1, blob.size), storage_path: s.data[0].path });
      if (!c.ok || !c.data[0]) { toast('The picture was uploaded but could not be added.', false); return null; }
      return c.data[0].id;
    }
    async function insertImageFile(file) {
      toast(`Adding ${file.name || 'picture'}…`);
      const f = await uploadImage(file, file.name || 'image'); if (!f) return;
      let w; try { const bmp = await createImageBitmap(file); w = Math.min(bmp.width, 480); bmp.close?.(); } catch { w = 480; }
      ed.insertBlocks([{ t: 'img', f, alt: (file.name || '').replace(/\.[a-z0-9]+$/i, '').slice(0, 200), w }]);
    }

    // ---- the editing engine and the undo history (snapshots of the whole document, taken when typing pauses and around every command)
    const canEdit = () => !readOnly;
    const ed = createEditor({ page, canEdit, imageSrc, uploadImage, insertImageFile, onChange: (kind) => onChange(kind), beforeEdit: () => checkpoint(), undo: () => undo(), redo: () => redo(), editNote: (el) => editNote(el) });
    const stack = []; let at = -1; let stackBytes = 0; let checkTimer = null, checkFirst = 0;
    const commit = () => { const blocks = normBlocks(ed.blocks()); doc = updateTab(doc, activeTab, { blocks }); };
    const currentBody = () => { commit(); return JSON.stringify(doc); };
    function checkpoint() {
      clearTimeout(checkTimer); checkTimer = null; checkFirst = 0;
      if (gone()) return;
      const body = currentBody();
      if (body !== lastBody || at < 0) {
        stack.length = at + 1; stackBytes = stack.reduce((n, e) => n + e.body.length, 0);
        stack.push({ body, tab: activeTab, pos: ed.getPos() ?? ed.lastPos() }); at = stack.length - 1; stackBytes += body.length;
        while (stack.length > 2 && (stack.length > 300 || stackBytes > 80e6)) { stackBytes -= stack.shift().body.length; at -= 1; }
        lastBody = body;
      }
      if (!readOnly) {
        if (body !== savedBody && status === 'saved') { status = 'dirty'; dirty.set(meta.name, () => save({ manual: true })); addEventListener('beforeunload', warn); paintStatus(); }
        else if (body === savedBody && status === 'dirty') { status = 'saved'; dirty.clear(); removeEventListener('beforeunload', warn); paintStatus(); }
      }
      paintStats(body.length); paintOutline(); paintTabs();
    }
    function restore(e) {
      doc = normalize(JSON.parse(e.body)); activeTab = findTab(doc, e.tab) ? e.tab : doc.tabs[0].id; lastBody = e.body;
      ed.load(findTab(doc, activeTab).tab.blocks); ed.setPos(e.pos);
      const body = e.body; if (body !== savedBody && status !== 'dirty') { status = 'dirty'; dirty.set(meta.name, () => save({ manual: true })); addEventListener('beforeunload', warn); } else if (body === savedBody && status === 'dirty') { status = 'saved'; dirty.clear(); }
      paintStatus(); paintStats(body.length); paintOutline(); paintTabs(); schedule();
    }
    function undo() { if (readOnly) return; checkpoint(); if (at > 0) { at -= 1; restore(stack[at]); } }
    function redo() { if (readOnly) return; checkpoint(); if (at < stack.length - 1) { at += 1; restore(stack[at]); } }
    function onChange(kind) {
      if (gone() || readOnly) { if (kind === 'state') paintTools(); return; }
      if (kind === 'state') { paintTools(); return; }
      if (status === 'saved') { status = 'dirty'; dirty.set(meta.name, () => save({ manual: true })); addEventListener('beforeunload', warn); paintStatus(); }
      schedule();
      if (kind === 'edit') { checkpoint(); paintTools(); return; }
      checkFirst ||= Date.now(); clearTimeout(checkTimer);
      checkTimer = setTimeout(checkpoint, Math.max(0, Math.min(CHECK_IDLE_MS, checkFirst + CHECK_MAX_MS - Date.now())));
    }
    const warn = (e) => { if (status === 'dirty' || status === 'failed') { e.preventDefault(); e.returnValue = ''; } };

    // ---- saving
    const paintStatus = () => {
      const t = { saved: `Saved ${timeOf(savedAt)}`, dirty: 'Unsaved changes', saving: 'Saving…', failed: 'Couldn’t save. Your changes are still here.', readonly: 'Read only' }[status];
      statusEl.replaceChildren(...[h('span', { class: `dot ${status}` }), t, status === 'failed' ? btn('Retry', () => save({ manual: true }), 'link') : null].filter(Boolean));
      saveBtn.disabled = readOnly || status === 'saved' || saving;
    };
    function paintStats(size) {
      const words = wordCount(doc, activeTab), total = wordCount(doc);
      counter.textContent = tabCount(doc) > 1 ? `${words.toLocaleString()} word${words === 1 ? '' : 's'} here · ${total.toLocaleString()} in all` : `${words.toLocaleString()} word${words === 1 ? '' : 's'}`;
      const left = spaceLeft(size); const used = size / MAX_CHARS;
      spaceEl.textContent = `Space left: ${left.toLocaleString()} of ${MAX_CHARS.toLocaleString()} characters`; spaceEl.classList.toggle('warn', used > 0.9); spaceEl.title = `${Math.round(used * 100)}% of this document’s space is used. Every save is also kept in History.`;
    }
    const schedule = () => { clearTimeout(timer); if (readOnly) return; timer = setTimeout(() => { if (gone()) return; const wait = lastAuto + AUTOSAVE_MIN_MS - Date.now(); if (wait > 0) { schedule2(wait); return; } save({ manual: false }); }, AUTOSAVE_IDLE_MS); };
    const schedule2 = (ms) => { clearTimeout(timer); timer = setTimeout(() => { if (!gone()) save({ manual: false }); }, ms); };
    async function save({ manual, note }) {
      if (readOnly || saving) return false;
      const body = currentBody();
      if (body === savedBody) { status = 'saved'; paintStatus(); return true; }
      if (body.length > MAX_CHARS) { status = 'failed'; paintStatus(); toast(`This document is ${(body.length - MAX_CHARS).toLocaleString()} characters over the ${MAX_CHARS.toLocaleString()} limit. Shorten it or move part of it into a new document.`, false); return false; }
      saving = true; status = 'saving'; paintStatus();
      const r = await api.call('drive.files.versions.add', { id, body, expected: version, ...(note ? { note } : manual ? {} : { note: 'Autosave' }) });
      saving = false;
      if (gone()) return false;
      if (r.ok) {
        version = r.data[0].current_version; savedBody = body; savedAt = new Date().toISOString(); if (!manual) lastAuto = Date.now();
        status = currentBody() !== savedBody ? 'dirty' : 'saved'; if (status === 'saved') { dirty.clear(); removeEventListener('beforeunload', warn); }
        paintStatus(); ctx.announce('Saved.'); return true;
      }
      if (r.status === 409) { status = 'failed'; paintStatus(); conflict(); return false; }
      if (r.status === 404) { status = 'readonly'; readOnly = true; page.setAttribute('contenteditable', 'false'); paintStatus(); toast('You can read this document but not change it, so your last edit was not saved.', false); lockTools(); return false; }
      status = 'failed'; paintStatus(); toast(r.message ?? 'Couldn’t save. Try again.', false); return false;
    }
    function useBody(text, savedAtIso) {
      doc = parseBody(text); activeTab = doc.tabs[0].id; savedBody = serialize(doc); lastBody = savedBody; ed.load(doc.tabs[0].blocks); stack.length = 0; at = -1; checkpoint();
      status = 'saved'; savedAt = savedAtIso; dirty.clear(); removeEventListener('beforeunload', warn); applyPage(); paintStatus(); paintStats(savedBody.length);
    }
    function conflict() {
      dialog({ title: 'Someone saved a newer version', body: [h('p', {}, 'While you were writing, another version was saved. Nothing has been overwritten. Choose what happens to your changes.'), h('p', { class: 'fine muted' }, 'Both versions stay in History either way.')],
        actions: [
          { label: 'Save mine as the newest', cls: 'primary', on: async () => { const cur = await api.call('drive.files.get', { id }); if (!cur.ok) { toast('Couldn’t check the latest version. Try again.', false); return false; } version = cur.data[0].current_version; await save({ manual: true }); } },
          { label: 'Load theirs, discard mine', on: async () => { const cur = await api.call('drive.files.version', { file: id }); if (!cur.ok) { toast('Couldn’t load it. Try again.', false); return false; } version = cur.data[0].version; useBody(cur.data[0].body ?? '', cur.data[0].created_at); } },
          { label: 'Keep editing', focus: true },
        ] });
    }

    // ---- commands shared by the toolbar, the menus, the keyboard and the context menu
    let savedPos = null; const keepSel = () => { savedPos = ed.getPos() ?? ed.lastPos(); };
    const back = () => { ed.focus(); if (savedPos) ed.setPos(savedPos); };
    const C = (fn) => (...a) => { if (readOnly) return; ed.focus(); fn(...a); paintTools(); };
    const link = () => {
      if (readOnly) return;
      keepSel(); const cur = ed.linkAtCaret(); const withText = ed.state().collapsed && !cur;
      const u = field({ id: 'dx-link', label: 'Web address', value: cur?.getAttribute('href') ?? 'https://', hint: 'Web (https, http) and e-mail (mailto:) addresses only.' });
      const t = withText ? field({ id: 'dx-link-text', label: 'Text to show', value: '' }) : null;
      dialog({ title: cur ? 'Edit link' : 'Add a link', body: [u.el, t?.el], actions: [
        { label: cur ? 'Update link' : 'Add link', cls: 'primary', on: () => { const href = safeHref(u.input.value); if (!href) return u.error('Enter an address that starts with https:// or http://, or a mailto: address.'); back(); ed.setLink(href, t?.input.value.trim()); paintTools(); } },
        cur ? { label: 'Remove link', on: () => { back(); ed.setLink(null); paintTools(); } } : null, { label: 'Cancel' }].filter(Boolean) });
    };
    const insertTable = () => {
      if (readOnly) return; keepSel();
      const r = field({ id: 'dx-t-r', label: 'Rows', type: 'number', value: '3' }), c = field({ id: 'dx-t-c', label: 'Columns', type: 'number', value: '3' });
      const hd = h('input', { type: 'checkbox', id: 'dx-t-h', checked: true });
      dialog({ title: 'Insert table', body: [h('div', { class: 'dx-two' }, r.el, c.el), h('label', { class: 'dx-check', for: 'dx-t-h' }, hd, ' First row is a header')], actions: [{ label: 'Insert', cls: 'primary', on: () => {
        const rows = Math.round(Number(r.input.value)), cols = Math.round(Number(c.input.value));
        if (!(rows >= 1 && rows <= 50)) return r.error('Use 1 to 50 rows.'); if (!(cols >= 1 && cols <= 10)) return c.error('Use 1 to 10 columns.');
        back(); ed.insertTable(rows, cols, hd.checked); } }, { label: 'Cancel' }] });
    };
    const pickImage = () => { if (readOnly) return; keepSel(); const inp = h('input', { type: 'file', accept: Object.keys(IMG_TYPES).join(','), class: 'sr', tabindex: '-1', 'aria-hidden': 'true' }); inp.addEventListener('change', () => { const f = inp.files[0]; inp.remove(); if (f) { back(); insertImageFile(f); } }); document.body.append(inp); inp.click(); };
    const imageDetails = () => {
      const fig = ed.selectedImage(); if (!fig) return;
      const alt = field({ id: 'dx-alt', label: 'Description (alt text)', value: fig.dataset.alt ?? '', hint: 'Read aloud by screen readers and shown if the picture cannot load.', maxlength: 500 });
      const w = field({ id: 'dx-w', label: 'Width in pixels', type: 'number', value: String(fig.dataset.w ?? Math.round(fig.querySelector('img').getBoundingClientRect().width)) });
      dialog({ title: 'Picture details', body: [alt.el, w.el], actions: [{ label: 'Apply', cls: 'primary', on: () => { const n = Math.round(Number(w.input.value)); if (!(n >= 24 && n <= 2400)) return w.error('Use a width between 24 and 2400.'); ed.setImage({ alt: alt.input.value.trim(), w: n }); } }, { label: 'Cancel' }] });
    };
    // a hover grid (up to 10 x 10) for new tables
    function gridPicker(onPick, onMore) {
      const info = h('div', { class: 'dx-gridinfo', 'aria-live': 'polite' }, 'Pick a size'); const cells = [];
      const hi = (r, c) => { info.textContent = `${r} × ${c} table`; for (const x of cells) x.el.classList.toggle('on', x.r <= r && x.c <= c); };
      const grid = h('div', { class: 'dx-grid', role: 'group', 'aria-label': 'Table size, rows by columns' });
      for (let r = 1; r <= 10; r += 1) for (let c = 1; c <= 10; c += 1) {
        const el = h('button', { type: 'button', class: 'dx-gc', 'aria-label': `${r} rows by ${c} columns`, tabindex: r === 1 && c === 1 ? '0' : '-1', onmouseenter: () => hi(r, c), onfocus: () => hi(r, c), onclick: () => onPick(r, c) });
        el.addEventListener('keydown', (e) => { const d = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] }[e.key]; if (!d) return; e.preventDefault(); const nr = Math.min(10, Math.max(1, r + d[0])), nc = Math.min(10, Math.max(1, c + d[1])); const t = cells.find((x) => x.r === nr && x.c === nc).el; for (const x of cells) x.el.tabIndex = -1; t.tabIndex = 0; t.focus(); });
        cells.push({ r, c, el }); grid.append(el);
      }
      return h('div', { class: 'dx-gridwrap' }, info, grid, h('button', { type: 'button', class: 'btn dx-gridmore', onclick: onMore }, 'More options…'));
    }
    function tablePicker(anchor, at) {
      if (readOnly) return; keepSel();
      pop(at ? null : anch(anchor), gridPicker((r, c) => { closePop(); back(); ed.insertTable(r, c, true); }, () => { closePop(); insertTable(); }), { role: 'dialog', label: 'Insert table', at });
    }
    const convertToTable = () => { if (readOnly) return; ed.focus(); if (!ed.textToTable()) toast('Select the lines first. Cells are separated by tabs, commas or | signs.', false); };
    const specials = () => {
      if (readOnly) return; keepSel();
      let close; const body = SPECIALS.map(([name, chars]) => h('div', { class: 'dx-sp' }, h('h3', {}, name), h('div', { class: 'dx-spg' }, ...chars.split(' ').map((ch) => h('button', { type: 'button', class: 'dx-spb', 'aria-label': `Insert ${ch}`, onclick: () => { back(); ed.insertText(ch); } }, ch)))));
      close = dialog({ title: 'Special characters', wide: true, body, actions: [{ label: 'Done' }] }); void close;
    };
    const insertDate = () => { if (readOnly) return; ed.focus(); ed.insertText(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })); };
    const pageSetup = (focusHeader) => {
      const pg = doc.page; const mgNow = marginsOf(pg);
      const size = field({ id: 'dx-ps', label: 'Paper size', value: pg.size, options: Object.entries(PAGES).map(([k, v]) => [k, `${v.label} (${v.w} × ${v.h} mm)`]), readonly: readOnly });
      const orient = field({ id: 'dx-po', label: 'Orientation', value: pg.orient ?? 'p', options: [['p', 'Portrait'], ['l', 'Landscape']], readonly: readOnly });
      const preset = field({ id: 'dx-pm', label: 'Margins', value: pg.mg ? 'custom' : pg.margin, options: [...Object.entries(MARGINS).map(([k, v]) => [k, `${v.label} (${v.mm} mm)`]), ['custom', 'Custom']], readonly: readOnly });
      const sides = ['Top', 'Right', 'Bottom', 'Left'].map((n, i) => field({ id: `dx-pg${i}`, label: `${n} (mm)`, type: 'number', value: String(mgNow[i]), readonly: readOnly }));
      preset.input.addEventListener('change', () => { if (MARGINS[preset.input.value]) sides.forEach((f) => { f.input.value = String(MARGINS[preset.input.value].mm); }); });
      for (const f of sides) f.input.addEventListener('input', () => { preset.input.value = 'custom'; });
      const hdr = field({ id: 'dx-ph', label: 'Header (printed at the top of every page)', value: pg.hdr ?? '', maxlength: 300, readonly: readOnly });
      const ftr = field({ id: 'dx-pf', label: 'Footer (printed at the bottom of every page)', value: pg.ftr ?? '', maxlength: 300, readonly: readOnly });
      const pn = field({ id: 'dx-pn', label: 'Page numbers', value: pg.pn ?? '', options: [['', 'None'], ['l', 'Bottom left'], ['c', 'Bottom centre'], ['r', 'Bottom right']], readonly: readOnly });
      const first = h('input', { type: 'checkbox', id: 'dx-pfirst', checked: Boolean(pg.first), disabled: readOnly });
      dialog({ title: 'Page setup', wide: true, body: [h('div', { class: 'dx-two' }, size.el, orient.el), preset.el, h('div', { class: 'dx-four' }, ...sides.map((f) => f.el)), hdr.el, ftr.el, h('div', { class: 'dx-two' }, pn.el, h('div', { class: 'fld' }, h('label', { for: 'dx-pfirst' }, 'First page'), h('label', { class: 'dx-check', for: 'dx-pfirst' }, first, ' Different first page (no header, footer or number)'))),
        h('p', { class: 'fine muted' }, 'These settings are saved with the document and used for the page view, printing, PDF and Word downloads.')],
      actions: readOnly ? [{ label: 'Close' }] : [{ label: 'Apply', cls: 'primary', on: () => {
        const mg = sides.map((f) => Number(f.input.value)); if (mg.some((n) => !(n >= 5 && n <= 80))) { const bad = sides.find((f) => !(Number(f.input.value) >= 5 && Number(f.input.value) <= 80)); return bad.error('Use 5 to 80 mm.'); }
        const mm = MARGINS[preset.input.value]?.mm; const isPreset = mm !== undefined && mg.every((n) => n === mm);
        commit(); doc = normalize({ ...doc, page: { size: size.input.value, orient: orient.input.value, margin: isPreset ? preset.input.value : 'normal', ...(isPreset ? {} : { mg }), hdr: hdr.input.value, ftr: ftr.input.value, pn: pn.input.value, first: first.checked ? 1 : 0 } }); applyPage(); onChange('edit'); } }, { label: 'Cancel' }] });
      if (focusHeader === 'hdr') hdr.input.focus(); else if (focusHeader === 'ftr') ftr.input.focus();
    };
    function applyPage() {
      const pg = doc.page; const sz = pageSize(pg); const [mt, mr, mb, ml] = marginsOf(pg);
      paper.style.setProperty('--dx-w', `${sz.w}mm`); paper.style.setProperty('--dx-h', `${sz.h}mm`);
      for (const [k, v] of [['mt', mt], ['mr', mr], ['mb', mb], ['ml', ml]]) paper.style.setProperty(`--dx-${k}`, `${v}mm`);
      paper.style.zoom = zoom === 100 ? '' : String(zoom / 100); zoomSel.value = String(zoom);
      hdrEl.textContent = pg.hdr ?? ''; hdrEl.hidden = !pg.hdr;
      ftrEl.replaceChildren(...(pg.ftr ? [h('span', { class: 'dx-ftxt' }, pg.ftr)] : []), ...(pg.pn ? [h('span', { class: `dx-pn dx-pn-${pg.pn}`, title: 'The page number is added when you print or download' }, '1')] : [])); ftrEl.hidden = !pg.ftr && !pg.pn;
      pageInfo.textContent = `${PAGES[pg.size].label}${pg.orient === 'l' ? ' landscape' : ''}`;
    }
    const countDialog = () => {
      commit(); const sel = ed.selectedText(); const rows = flatTabs(doc);
      const stat = (a, b) => h('tr', {}, h('th', { scope: 'row' }, a), h('td', {}, b));
      const size = JSON.stringify(doc).length;
      dialog({ title: 'Word count', body: [
        h('table', { class: 'dx-stats' }, stat('Words', wordCount(doc).toLocaleString()), stat('Characters', charCount(doc).toLocaleString()), stat('Characters without spaces', charCount(doc, false).toLocaleString()), sel ? stat('Selected words', ((sel.match(/\S+/g) ?? []).length).toLocaleString()) : null,
          stat('Space used', `${size.toLocaleString()} of ${MAX_CHARS.toLocaleString()} characters (${Math.round((100 * size) / MAX_CHARS)}%)`), stat('Space left', spaceLeft(size).toLocaleString())),
        rows.length > 1 ? h('div', {}, h('h3', { class: 'dx-h3' }, 'By tab'), h('table', { class: 'dx-stats' }, ...rows.map((x) => stat(`${'· '.repeat(x.depth)}${x.tab.icon ? `${x.tab.icon} ` : ''}${x.tab.title}`, `${tabWords(x.tab).toLocaleString()} words`)))) : null], actions: [{ label: 'Close' }] });
    };
    const shortcuts = () => dialog({ title: 'Keyboard shortcuts', wide: true, body: h('table', { class: 'dx-stats' }, ...SHORTCUTS.map(([a, b]) => h('tr', {}, h('th', { scope: 'row' }, a), h('td', {}, h('kbd', {}, b))))), actions: [{ label: 'Close' }] });

    // ---- clipboard (menu versions; Ctrl+V keeps working natively)
    async function pasteFromClipboard(plain) {
      if (readOnly) return; ed.focus();
      try {
        const items = await navigator.clipboard.read(); let html = '', text = ''; const files = [];
        for (const it of items) for (const type of it.types) { const blob = await it.getType(type); if (type === 'text/html') html = await blob.text(); else if (type === 'text/plain') text = await blob.text(); else if (type.startsWith('image/')) files.push(new File([blob], 'pasted-image', { type })); }
        await ed.pasteContent({ html, text, files, plain }); return;
      } catch { /* not allowed or not supported: try plain text */ }
      try { const text = await navigator.clipboard.readText(); await ed.pasteContent({ text, plain: true }); } catch { toast(`Your browser did not allow pasting from the menu. Press ${mac ? '⌘V' : 'Ctrl+V'} instead.`, false); }
    }
    const clip = (c) => { ed.focus(); if (!document.execCommand(c)) toast(`Your browser did not allow that. Press ${mac ? '⌘' : 'Ctrl+'}${c === 'cut' ? 'X' : 'C'} instead.`, false); };

    // ---- find and replace
    const fs = { open: false, scope: 'tab', q: '', r: '', mc: false, ww: false, ranges: [], cur: 0 };
    const findInfo = h('span', { class: 'fine muted', role: 'status', 'aria-live': 'polite' });
    const fIn = h('input', { class: 'dx-fi', 'aria-label': 'Find', placeholder: 'Find', autocomplete: 'off' }), rIn = h('input', { class: 'dx-fi', 'aria-label': 'Replace with', placeholder: 'Replace with', autocomplete: 'off' });
    const regex = () => findRegex(fs.q, { matchCase: fs.mc, whole: fs.ww });
    function runFind(keep) {
      const re = regex(); fs.ranges = re ? ed.findRanges(re) : []; fs.cur = keep ? Math.min(fs.cur, Math.max(0, fs.ranges.length - 1)) : 0;
      ed.highlight(fs.ranges, fs.cur);
      let extra = ''; if (re && fs.scope === 'all') { commit(); const others = flatTabs(doc).filter((x) => x.tab.id !== activeTab).reduce((n, x) => n + countInBlocks(x.tab.blocks, re), 0); extra = others ? ` · ${others} in other tabs` : ''; }
      findInfo.textContent = !fs.q ? '' : fs.ranges.length ? `${fs.cur + 1} of ${fs.ranges.length}${extra}` : (extra ? `None here${extra}` : 'No matches');
    }
    function goto() { const rr = fs.ranges[fs.cur]; if (!rr) return; ed.highlight(fs.ranges, fs.cur); ed.reveal(rr); findInfo.textContent = `${fs.cur + 1} of ${fs.ranges.length}`; }
    function step(dir) {
      if (!fs.q) return; runFind(true);
      const n = fs.ranges.length;
      if (fs.scope === 'all') {
        const next = fs.cur + dir;
        if (n === 0 || next < 0 || next >= n) {
          commit(); const re = regex(); const list = flatTabs(doc); const i0 = list.findIndex((x) => x.tab.id === activeTab);
          for (let k = 1; k <= list.length; k += 1) {
            const t = list[(i0 + dir * k + list.length * 2) % list.length].tab;
            if (t.id !== activeTab && countInBlocks(t.blocks, re)) { openTab(t.id); runFind(); fs.cur = dir > 0 ? 0 : fs.ranges.length - 1; goto(); return; }
            if (t.id === activeTab && n) break;
          }
          if (!n) return;
        }
      }
      if (!n) return; fs.cur = (fs.cur + dir + n) % n; goto();
    }
    function replaceOne() { if (readOnly || !fs.ranges[fs.cur]) { step(1); return; } checkpoint(); ed.replaceRange(fs.ranges[fs.cur], fs.r); runFind(true); goto(); }
    function replaceAll() {
      if (readOnly) return; const re = regex(); if (!re) return; checkpoint(); commit(); let count = 0;
      const ids = fs.scope === 'all' ? flatTabs(doc).map((x) => x.tab.id) : [activeTab];
      for (const tid of ids) { const t = findTab(doc, tid).tab; const res = replaceInBlocks(t.blocks, re, fs.r); count += res.count; if (res.count) doc = updateTab(doc, tid, { blocks: res.blocks }); }
      if (count) { ed.load(findTab(doc, activeTab).tab.blocks); onChange('edit'); }
      runFind(); findInfo.textContent = count ? `Replaced ${count}` : 'No matches'; ctx.announce(count ? `Replaced ${count}.` : 'No matches.');
    }
    const findBar = h('div', { class: 'dx-find', role: 'search', hidden: true },
      fIn, rIn,
      h('label', { class: 'dx-check' }, h('input', { type: 'checkbox', onchange: (e) => { fs.mc = e.target.checked; runFind(); } }), ' Match case'),
      h('label', { class: 'dx-check' }, h('input', { type: 'checkbox', onchange: (e) => { fs.ww = e.target.checked; runFind(); } }), ' Whole word'),
      h('select', { class: 'dx-sel', 'aria-label': 'Where to search', onchange: (e) => { fs.scope = e.target.value; runFind(); } }, h('option', { value: 'tab' }, 'This tab'), h('option', { value: 'all' }, 'All tabs')),
      h('button', { type: 'button', class: 'btn', onclick: () => step(-1) }, 'Previous'), h('button', { type: 'button', class: 'btn', onclick: () => step(1) }, 'Next'),
      h('button', { type: 'button', class: 'btn', onclick: replaceOne, 'data-edit': true }, 'Replace'), h('button', { type: 'button', class: 'btn', onclick: replaceAll, 'data-edit': true }, 'Replace all'),
      findInfo, h('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Close find', onclick: () => closeFind() }, icon('cross')));
    fIn.addEventListener('input', () => { fs.q = fIn.value; runFind(); if (fs.ranges.length) goto(); });
    rIn.addEventListener('input', () => { fs.r = rIn.value; });
    findBar.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); closeFind(); } else if (e.key === 'Enter' && e.target === fIn) { e.preventDefault(); step(e.shiftKey ? -1 : 1); } else if (e.key === 'Enter' && e.target === rIn) { e.preventDefault(); replaceOne(); } });
    function openFind(withReplace) {
      findBar.hidden = false; rIn.hidden = !withReplace; for (const b of findBar.querySelectorAll('[data-edit]')) b.hidden = !withReplace;
      const s = ed.selectedText(); if (s && s.length < 200 && !/\n/.test(s)) { fIn.value = s; fs.q = s; }
      (withReplace && fs.q ? rIn : fIn).focus(); fIn.select?.(); runFind();
    }
    function closeFind() { findBar.hidden = true; ed.highlight([], 0); fs.ranges = []; ed.focus(); }

    // ---- toolbar and menus
    const btnOn = (b, on) => b.setAttribute('aria-pressed', String(Boolean(on)));
    const tbtn = (label, content, run, { key, pri = 1, cls = '' } = {}) => {
      const b = h('button', { type: 'button', class: `dx-tb ${cls}`.trim(), 'aria-label': label, title: label, 'data-pri': pri, 'data-k': key ?? false, onmousedown: (e) => e.preventDefault(), onclick: (e) => run(b, e) }, content);
      tools.push(b); return b;
    };
    const sel = (label, options, onpick, cls = '', pri = 1) => { const s = h('select', { class: `dx-sel ${cls}`, 'aria-label': label, title: label, 'data-pri': pri, onchange: () => { const v = s.value; onpick(v); } }, ...options.map(([v, t]) => h('option', { value: v }, t))); tools.push(s); return s; };
    const sep = (pri = 1) => h('span', { class: 'dx-tsep', 'data-pri': pri, 'aria-hidden': 'true' });
    const styleSel = sel('Text style', [['p', 'Normal'], ['title', 'Title'], ['subtitle', 'Subtitle'], ['h1', 'Heading 1'], ['h2', 'Heading 2'], ['h3', 'Heading 3'], ['quote', 'Quote'], ['code', 'Code']], C((v) => ed.setBlockType(v)), 'dx-w-style');
    const fontSel = h('select', { class: 'dx-sel dx-w-font', 'aria-label': 'Font', title: 'Font', 'data-pri': 2, onchange: () => { const v = fontSel.value; if (v) pushRecent('f', v); C(() => ed.setMark('f', v || null))(); fillFonts(); fontSel.value = v; } });
    function fillFonts() {
      const rec = recent('f').filter((k) => FONTS[k]); const opt = (k) => h('option', { value: k }, FONTS[k].label);
      fontSel.replaceChildren(h('option', { value: '' }, 'Default'), ...(rec.length ? [h('optgroup', { label: 'Recent' }, ...rec.map(opt))] : []), ...['Sans-serif', 'Serif', 'Monospace', 'Urdu and Arabic'].map((g) => h('optgroup', { label: g }, ...Object.keys(FONTS).filter((k) => FONTS[k].g === g).map(opt))));
    }
    fillFonts(); tools.push(fontSel);
    const sizeSel = sel('Font size', SIZES.map((n) => [String(n), String(n)]), C((v) => ed.setMark('z', Number(v) === DEFAULT_SIZE ? null : Number(v))), 'dx-w-size', 2);
    const markBtn = (label, content, key, cls = '', pri = 1) => tbtn(label, content, C(() => ed.toggleMark(key)), { key, cls, pri });
    const colourBtn = (label, glyph, markKey, palette, pri = 2) => {
      const swatch = h('span', { class: 'dx-cbar', 'aria-hidden': 'true' }); const b = tbtn(label, [h('span', { class: 'dx-cg', 'aria-hidden': 'true' }, glyph), swatch], () => {
        keepSel(); const pick = (c) => { closePop(); back(); ed.setMark(markKey, c); pushRecent(markKey, c); swatch.style.background = c; paintTools(); };
        const sw = (c) => { const s = h('button', { type: 'button', class: 'dx-sw', 'aria-label': c, title: c, onclick: () => pick(c) }); s.style.background = c; return s; };
        const rec = recent(markKey); const grid = h('div', { class: 'dx-pal' }, ...palette.map(sw));
        const none = h('button', { type: 'button', class: 'btn', onclick: () => { closePop(); back(); ed.setMark(markKey, null); paintTools(); } }, markKey === 'c' ? 'Automatic' : 'No highlight');
        const custom = h('input', { type: 'color', 'aria-label': `Custom ${label.toLowerCase()}`, value: '#1d4ed8', onchange: () => pick(custom.value) });
        pop(anch(b), h('div', { class: 'dx-palwrap' }, grid, rec.length ? h('div', { class: 'dx-recent' }, h('span', { class: 'fine muted' }, 'Recent'), ...rec.map(sw)) : null, h('div', { class: 'dx-palrow' }, none, h('label', { class: 'fine' }, 'Custom ', custom))), { role: 'dialog', label });
      }, { pri }); return b;
    };
    const spacingPop = (b) => {
      keepSel(); const st = ed.state();
      const opt = [1, 1.15, 1.5, 2, 2.5, 3].map((n) => h('button', { type: 'button', class: 'dx-mi', role: 'menuitemradio', 'aria-checked': String(Math.abs(st.ls - n) < 0.01), onclick: () => { closePop(); back(); ed.setSpacing({ ls: n === 1.15 ? null : n }); paintTools(); } }, h('span', { class: 'dx-mc' }, Math.abs(st.ls - n) < 0.01 ? '✓' : ''), h('span', { class: 'dx-ml' }, n === 1.15 ? '1.15 (default)' : String(n))));
      const num = (lab, key, val) => { const i = h('input', { type: 'number', min: '0', max: '200', value: String(val), 'aria-label': lab, class: 'dx-num', onchange: () => { back(); ed.setSpacing({ [key]: Math.max(0, Math.min(200, Math.round(Number(i.value) || 0))) }); paintTools(); } }); return h('label', { class: 'dx-numrow' }, lab, i); };
      pop(anch(b), h('div', {}, h('div', { class: 'dx-mh' }, 'Line spacing'), ...opt, h('div', { class: 'dx-sep' }), h('div', { class: 'dx-mh' }, 'Paragraph spacing (points)'), num('Before', 'sb', st.sb), num('After', 'sa', st.sa)), { role: 'dialog', label: 'Spacing' });
    };
    const alignBtn = (al, label, glyph) => tbtn(label, glyph, C(() => (ed.state().table && !ed.state().collapsed === false && ed.state().type === 'p' && false ? 0 : ed.setAlign(al))), { key: `al-${al}`, pri: 2 });
    const undoBtn = tbtn('Undo', icon('undo'), () => { ed.focus(); undo(); }, { key: 'undo' }); const redoBtn = tbtn('Redo', icon('redo'), () => { ed.focus(); redo(); }, { key: 'redo' });
    const imgBar = h('div', { class: 'dx-imgtools', hidden: true, role: 'toolbar', 'aria-label': 'Picture' },
      ...[['l', 'Align picture left', '◧'], ['c', 'Centre picture', '▣'], ['r', 'Align picture right', '◨']].map(([a, lab, g]) => tbtn(lab, g, () => ed.setImage({ al: a }))),
      ...[[25, '25%'], [50, '50%'], [100, '100%']].map(([p, t]) => tbtn(`Picture width ${t} of the page`, t, () => ed.setImage({ w: Math.round((page.clientWidth * p) / 100) }))),
      ...[['', 'In line with text', 'In line'], ['l', 'Wrap text around, picture on the left', 'Wrap L'], ['r', 'Wrap text around, picture on the right', 'Wrap R'], ['b', 'Break text above and below', 'Break']].map(([w, lab, t]) => tbtn(lab, t, () => ed.setImage({ wr: w || null }), { cls: 'dx-txt' })),
      tbtn('Picture description and width', 'Alt text', imageDetails), tbtn('Remove picture', icon('trash'), () => ed.removeFig()));
    const ovf = h('div', { class: 'dx-ovf' });
    const moreBtn = h('button', { type: 'button', class: 'dx-tb dx-more', 'aria-label': 'More formatting tools', 'aria-haspopup': 'dialog', title: 'More tools', hidden: true, onclick: () => pop(moreBtn, ovf, { role: 'dialog', label: 'More formatting tools' }) }, icon('more'));
    const toolbar = h('div', { class: 'dx-toolbar doctools', role: 'toolbar', 'aria-label': 'Formatting' },
      undoBtn, redoBtn, sep(), styleSel, fontSel, sizeSel, sep(2),
      markBtn('Bold', icon('bold'), 'b'), markBtn('Italic', icon('italic'), 'i'), markBtn('Underline', icon('under'), 'u'), markBtn('Strikethrough', h('s', {}, 'S'), 's', '', 2),
      markBtn('Superscript', h('span', {}, 'x', h('sup', {}, '2')), 'sup', '', 2), markBtn('Subscript', h('span', {}, 'x', h('sub', {}, '2')), 'sub', '', 2), markBtn('Code', '</>', 'cd', 'dx-mono', 2),
      colourBtn('Text colour', 'A', 'c', TEXT_COLOURS), colourBtn('Highlight colour', '▮', 'hl', HIGHLIGHTS),
      tbtn('Clear formatting', 'T×', C(() => ed.clearFormat()), { pri: 2 }), sep(2),
      alignBtn('l', 'Align left', '≡'), alignBtn('c', 'Centre', '☰'), alignBtn('r', 'Align right', '≣'), alignBtn('j', 'Justify', '▤'),
      tbtn('Line and paragraph spacing', '↕', (b) => spacingPop(b), { pri: 2 }),
      tbtn('Outdent', '⇤', C(() => ed.indent(-1)), { pri: 2 }), tbtn('Indent', '⇥', C(() => ed.indent(1)), { pri: 2 }), sep(2),
      tbtn('Bulleted list', icon('ul'), C(() => ed.toggleList('ul')), { key: 'list-ul' }), tbtn('Numbered list', '1.', C(() => ed.toggleList('ol')), { key: 'list-ol' }), tbtn('Checklist', '☑', C(() => ed.toggleList('cl')), { key: 'list-cl' }), sep(),
      tbtn('Link', icon('link'), link, { key: 'link' }), tbtn('Picture', icon('imgI'), pickImage), tbtn('Table', icon('table'), (b) => tablePicker(b)), tbtn('Voice typing', '🎤', () => openVoice(), { key: 'voice' }), tbtn('Horizontal line', '—', C(() => ed.insertBlocks([{ t: 'hr' }])), { pri: 2 }),
      moreBtn);
    const tbItems = [...toolbar.children].filter((x) => x !== moreBtn);
    function fitToolbar() {
      if (gone() || !toolbar.clientWidth) return;
      for (const it of tbItems) toolbar.insertBefore(it, moreBtn);
      moreBtn.hidden = true;
      const avail = toolbar.clientWidth - 16; const widths = tbItems.map((i) => i.offsetWidth + 2);
      if (widths.reduce((a, b) => a + b, 0) <= avail) return;
      moreBtn.hidden = false; const limit = avail - (moreBtn.offsetWidth || 40) - 4; let used = 0, cut = tbItems.length;
      for (let i = 0; i < tbItems.length; i += 1) { used += widths[i]; if (used > limit) { cut = i; break; } }
      while (cut > 0 && tbItems[cut - 1].classList.contains('dx-tsep')) cut -= 1;
      for (let i = cut; i < tbItems.length; i += 1) ovf.append(tbItems[i]);
    }
    const anch = (b) => (b.isConnected ? b : moreBtn);
    const lockTools = () => { for (const c of tools) c.disabled = true; for (const c of findBar.querySelectorAll('[data-edit]')) c.disabled = true; rIn.readOnly = true; titleIn.readOnly = true; paintTabs(); };
    function paintTools() {
      if (gone()) return; const st = ed.state(); const m = st.marks;
      for (const b of [...toolbar.querySelectorAll('[data-k]'), ...ovf.querySelectorAll('[data-k]')]) { const k = b.dataset.k; if (['b', 'i', 'u', 's', 'sup', 'sub', 'cd'].includes(k)) btnOn(b, m[k]); else if (k.startsWith('list-')) btnOn(b, st.list === k.slice(5)); else if (k.startsWith('al-')) btnOn(b, st.al === k.slice(3) || (k === 'al-l' && st.al === 'l')); else if (k === 'link') btnOn(b, st.link); }
      styleSel.value = st.type === 'list' ? 'p' : st.type; fontSel.value = m.f ?? ''; const z = String(m.z ?? DEFAULT_SIZE);
      if (![...sizeSel.options].some((o) => o.value === z)) sizeSel.append(h('option', { value: z }, z)); sizeSel.value = z;
      imgBar.hidden = !st.fig; fitHeight(); paintTableBar(); undoBtn.disabled = readOnly || at <= 0; redoBtn.disabled = readOnly || at >= stack.length - 1;
    }
    // ---- voice typing and conversation transcripts
    const vs = { open: false, mode: 'dictate', lang: store.get('dx-vlang') || 'en-US', rec: null, listening: false, speakers: [{ name: 'Person 1' }, { name: 'Person 2' }], cur: 0, auto: false, pause: 3, record: false, start: 0, lastAt: 0, lastEl: null, mr: null, chunks: [], stream: null, headerEl: null };
    const vInterim = h('span', { class: 'dx-vint' }); const vMsg = h('p', { class: 'fine dx-vmsg', role: 'status', 'aria-live': 'polite' });
    const vMic = h('button', { type: 'button', class: 'btn primary dx-vmic', 'aria-pressed': 'false', onmousedown: (e) => e.preventDefault(), onclick: () => (vs.listening ? voiceStop() : voiceStart()) }, '🎤 Start');
    const vLang = h('select', { class: 'dx-sel', 'aria-label': 'Speech language', onchange: () => { vs.lang = vLang.value; store.set('dx-vlang', vs.lang); vs.rec?.setLang(vs.lang); } }, ...LANGS.map(([v, t]) => h('option', { value: v }, t)));
    vLang.value = vs.lang;
    const vModes = h('div', { class: 'dx-vmodes', role: 'group', 'aria-label': 'Mode' }, ...[['dictate', 'Dictation'], ['talk', 'Conversation']].map(([m, t]) => h('button', { type: 'button', class: 'btn', 'data-m': m, 'aria-pressed': String(m === vs.mode), onmousedown: (e) => e.preventDefault(), onclick: () => { vs.mode = m; paintVoice(); } }, t)));
    const vSpk = h('div', { class: 'dx-vspk', role: 'group', 'aria-label': 'Speakers' });
    const vTalk = h('div', { class: 'dx-vtalk' });
    const vPanel = h('section', { class: 'dx-voice', 'aria-label': 'Voice typing', hidden: true },
      h('div', { class: 'dx-vrow' }, vMic, vLang, vModes, h('span', { class: 'dx-spacer' }), h('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Close voice panel', onclick: () => closeVoice() }, icon('cross'))),
      h('div', { class: 'dx-vrow dx-vline', 'aria-live': 'off' }, h('span', { class: 'fine muted' }, 'Hearing: '), vInterim), vTalk, vMsg,
      h('p', { class: 'fine muted dx-vnote' }, 'Speech recognition runs in your browser. In Chrome and Edge the audio may be sent to the browser maker’s speech service. English commands: “comma”, “full stop”, “question mark”, “new line”, “new paragraph”.'));
    function paintVoice() {
      for (const b of vModes.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.m === vs.mode));
      vMic.textContent = vs.listening ? '⏹ Stop' : '🎤 Start'; vMic.setAttribute('aria-pressed', String(vs.listening)); vMic.classList.toggle('on', vs.listening);
      vTalk.hidden = vs.mode !== 'talk'; vSpk.replaceChildren(...vs.speakers.map((sp, i) => {
        const col = SPEAKER_COLOURS[i % SPEAKER_COLOURS.length];
        const b = h('button', { type: 'button', class: 'dx-spk', 'aria-pressed': String(i === vs.cur), title: `Speaker ${i + 1}: press Alt+${i + 1}`, onmousedown: (e) => e.preventDefault(), onclick: () => { vs.cur = i; paintVoice(); } }, h('span', { class: 'dx-dot', 'aria-hidden': 'true' }), `${sp.name} `, h('kbd', {}, String(i + 1)));
        b.firstChild.style.background = col;
        return h('span', { class: 'dx-spkw' }, b, h('button', { type: 'button', class: 'dx-spkren', 'aria-label': `Rename ${sp.name}`, title: 'Rename', onmousedown: (e) => e.preventDefault(), onclick: () => renameSpeaker(i) }, '✎'));
      }), ...(vs.speakers.length < MAX_SPEAKERS ? [h('button', { type: 'button', class: 'btn dx-addspk', onmousedown: (e) => e.preventDefault(), onclick: () => { vs.speakers.push({ name: `Person ${vs.speakers.length + 1}` }); paintVoice(); } }, '+ Speaker')] : []));
    }
    vTalk.append(vSpk,
      h('div', { class: 'dx-vrow' }, h('label', { class: 'dx-check' }, h('input', { type: 'checkbox', onchange: (e) => { vs.auto = e.target.checked; } }), ' Switch speaker after a pause of'), h('input', { type: 'number', class: 'dx-num', min: '1', max: '30', value: String(vs.pause), 'aria-label': 'Pause in seconds', onchange: (e) => { vs.pause = Math.max(1, Math.min(30, Number(e.target.value) || 3)); } }), h('span', { class: 'fine' }, 'seconds'),
        h('label', { class: 'dx-check' }, h('input', { type: 'checkbox', onchange: (e) => { vs.record = e.target.checked; } }), ' Also record the audio and save it to Drive')),
      h('p', { class: 'fine muted' }, 'The free browser mode cannot tell voices apart. Choose who is speaking with the buttons or Alt+1 to Alt+9; “switch after a pause” only alternates the speakers when someone stops talking for that long.'));
    function renameSpeaker(i) {
      const f = field({ id: 'dx-sn', label: 'Speaker name', value: vs.speakers[i].name, maxlength: 40 });
      dialog({ title: 'Rename speaker', body: f.el, actions: [{ label: 'Save', cls: 'primary', on: () => { const v = f.input.value.trim(); if (!v) return f.error('Enter a name.'); vs.speakers[i].name = v; paintVoice(); } }, { label: 'Cancel' }] });
    }
    function openVoice() {
      if (vs.open) { vPanel.hidden = false; return; }
      vs.open = true; vPanel.hidden = false; paintVoice(); fitHeight();
      if (!voiceSupported()) { vMic.disabled = true; vMsg.textContent = 'Voice typing needs a browser with speech recognition, such as Chrome or Edge. This browser does not have it, so you can still type as usual.'; }
      else vMsg.textContent = readOnly ? 'This document is read only, so nothing can be dictated into it.' : 'Click in the text where the words should go, then press Start.';
    }
    function closeVoice() { voiceStop(); vs.open = false; vPanel.hidden = true; fitHeight(); ed.focus(); }
    function voiceErr(code) { vMsg.textContent = ERRORS[code] ?? `Speech recognition stopped (${code}).`; }
    function lineRuns(text, sp, idx) {
      const urdu = isUrdu(vs.lang); const t = applyVoiceCommands(text, vs.lang).replace(/\u0001/g, '\n');
      return [{ x: sp.name, b: 1, c: SPEAKER_COLOURS[idx % SPEAKER_COLOURS.length] }, { x: ` (${fmtClock(Date.now() - vs.start)}): `, c: '#737373' }, { x: t, ...(urdu ? { f: 'nastaliq' } : {}) }];
    }
    function onFinal(text) {
      if (readOnly) return; const now = Date.now(); const urdu = isUrdu(vs.lang);
      if (vs.mode === 'talk') {
        if (vs.auto && turnChanged(vs.lastAt, now, vs.pause)) vs.cur = nextSpeaker(vs.cur, vs.speakers.length);
        vs.lastAt = now; paintVoice(); const runs = lineRuns(text, vs.speakers[vs.cur], vs.cur); const dir = urdu ? { dir: 'rtl' } : {};
        if (!vs.lastEl || !vs.lastEl.isConnected) {
          const head = [{ x: `Conversation transcript, ${new Date().toLocaleString()}`, b: 1 }, ...(vs.record ? [{ x: ' · audio is being recorded and will be saved in Drive next to this document', i: 1, c: '#737373' }] : [])];
          if (!ed.blockIsEmpty()) ed.insertBlocks([{ t: 'p', c: [] }, { t: 'p', c: [] }]);
          ed.insertBlocks([{ t: 'p', c: head }, { t: 'p', ...dir, c: runs }]); vs.headerEl = ed.currentBlockEl()?.previousElementSibling ?? null; vs.lastEl = ed.currentBlockEl();
        } else vs.lastEl = ed.appendAfter(vs.lastEl, { t: 'p', ...dir, c: runs }) ?? vs.lastEl;
        return;
      }
      if (urdu && ed.blockIsEmpty()) ed.setDirection('rtl'); else if (!urdu && ed.blockIsEmpty()) ed.setDirection('ltr');
      const parts = applyVoiceCommands(text, vs.lang).split('\u0001');
      parts.forEach((part, i) => {
        if (i) ed.insertBlocks([{ t: 'p', c: [] }, { t: 'p', c: [] }]);
        if (part) ed.insertBlocks([{ t: 'p', c: [{ x: withSpacing(part, i ? '' : ed.charBefore()), ...(urdu ? { f: 'nastaliq' } : {}) }] }]);
      });
    }
    async function voiceStart() {
      if (readOnly) return; if (!voiceSupported()) return;
      vMsg.textContent = ''; ed.focus();
      if (!vs.rec) vs.rec = createRecognizer({ lang: vs.lang, onFinal: (t) => onFinal(t), onInterim: (t) => { vInterim.textContent = t; }, onState: (s) => { vs.listening = s === 'listening' || (s !== 'stopped' && vs.listening); if (s === 'stopped' && !vs.rec?.active) { vs.listening = false; } paintVoice(); }, onError: (c) => { voiceErr(c); } });
      vs.start = Date.now(); vs.lastAt = 0; if (vs.mode === 'talk') vs.lastEl = null;
      if (vs.mode === 'talk' && vs.record) await startAudio();
      vs.rec.setLang?.(vs.lang); vs.rec.start(); vs.listening = true; paintVoice();
    }
    function voiceStop() { vs.rec?.stop(); vs.listening = false; vInterim.textContent = ''; paintVoice(); stopAudio(); }
    async function startAudio() {
      try {
        vs.stream = await navigator.mediaDevices.getUserMedia({ audio: true }); vs.chunks = [];
        vs.mr = new MediaRecorder(vs.stream, MediaRecorder.isTypeSupported?.('audio/webm;codecs=opus') ? { mimeType: 'audio/webm;codecs=opus' } : undefined);
        vs.mr.ondataavailable = (e) => { if (e.data?.size) vs.chunks.push(e.data); };
        vs.mr.onstop = async () => {
          const blob = new Blob(vs.chunks, { type: 'audio/webm' }); vs.stream?.getTracks().forEach((t) => t.stop()); vs.stream = null; vs.mr = null; if (!blob.size) return;
          const fid = await uploadBlob(blob, `Recording of ${meta.name}`, 'audio/webm', 'webm');
          if (fid && vs.headerEl?.isConnected) { checkpoint(); vs.headerEl.append(document.createTextNode(' — audio saved in Drive next to this document as “Recording of ' + meta.name + '”')); onChange('edit'); }
          vMsg.textContent = fid ? 'The audio was saved in Drive next to this document.' : 'The audio could not be saved.';
        };
        vs.mr.start(1000);
      } catch { vMsg.textContent = ERRORS['not-allowed']; vs.mr = null; }
    }
    function stopAudio() { if (vs.mr && vs.mr.state !== 'inactive') vs.mr.stop(); }
    root.addEventListener('keydown', (e) => { if (vs.open && vs.mode === 'talk' && e.altKey && !e.ctrlKey && !e.metaKey && /^Digit[1-9]$/.test(e.code)) { const i = Number(e.code.slice(5)) - 1; if (i < vs.speakers.length) { e.preventDefault(); vs.cur = i; paintVoice(); } } });
    document.addEventListener('visibilitychange', () => { if (gone()) voiceStop(); });

    // ---- the "/" menu: type / at the start of an empty line to insert a block
    const SLASH = [
      ['Heading 1', 'h1 title', () => ed.setBlockType('h1')], ['Heading 2', 'h2 subheading', () => ed.setBlockType('h2')], ['Heading 3', 'h3', () => ed.setBlockType('h3')],
      ['Bulleted list', 'bullet ul', () => ed.toggleList('ul')], ['Numbered list', 'number ol', () => ed.toggleList('ol')], ['Checklist', 'todo task check', () => ed.toggleList('cl')],
      ['Table', 'grid', () => { const r = (getSelection().rangeCount ? getSelection().getRangeAt(0).getBoundingClientRect() : page.getBoundingClientRect()); tablePicker(null, { x: r.left, y: r.bottom + 4 }); }],
      ['Picture', 'image photo', () => pickImage()], ['Quote', 'blockquote', () => ed.setBlockType('quote')], ['Code block', 'code', () => ed.setBlockType('code')],
      ['Divider', 'line rule hr', () => ed.insertBlocks([{ t: 'hr' }])], ['Page break', 'break', () => ed.insertBlocks([{ t: 'pb' }])], ['Table of contents', 'toc contents', () => { ed.insertBlocks([{ t: 'toc' }]); paintOutline(); }],
      ['Footnote', 'note', () => addNote()], ['Today’s date', 'date', () => insertDate()], ['Voice typing', 'voice mic dictate speech', () => openVoice()]];
    let slash = null;
    function closeSlash() { if (!slash) return; slash.el.remove(); slash = null; page.removeAttribute('aria-activedescendant'); }
    function slashChoose(item) { closeSlash(); ed.mutate((models, _r, pos) => ({ blocks: [{ ...models[0], c: [] }], sel: { s: { b: pos.b0, o: 0 }, e: { b: pos.b0, o: 0 } } }), { start: true }); item[2](); paintTools(); }
    function slashUpdate() {
      if (readOnly || mode === 'read') return closeSlash();
      const p = ed.getPos(); if (!p || p.s.b !== p.e.b || p.s.o !== p.e.o) return closeSlash();
      const blk = page.children[p.s.b]; const m = blk && blk.tagName === 'P' ? /^\/([a-z0-9 ]{0,20})$/i.exec(blk.textContent) : null; if (!m || p.s.o !== blk.textContent.length) return closeSlash();
      const q = m[1].toLowerCase(); const items = SLASH.filter((i) => i[0].toLowerCase().includes(q) || i[1].includes(q)); if (!items.length) return closeSlash();
      const idx = slash ? Math.min(slash.idx, items.length - 1) : 0; const rr = getSelection().getRangeAt(0).getBoundingClientRect(); const box = rr.width || rr.height ? rr : blk.getBoundingClientRect();
      const el = slash?.el ?? h('div', { class: 'dx-slash', role: 'listbox', 'aria-label': 'Insert a block' }); if (!slash) document.body.append(el);
      el.replaceChildren(...items.map((it, i) => h('div', { class: `dx-slashi${i === idx ? ' on' : ''}`, role: 'option', id: `dx-sl-${i}`, 'aria-selected': String(i === idx), onmousedown: (e) => { e.preventDefault(); slashChoose(it); } }, it[0])));
      el.style.left = `${Math.max(8, Math.min(box.left, innerWidth - 240))}px`; const below = box.bottom + 6; el.style.top = `${below + el.offsetHeight > innerHeight - 8 ? Math.max(8, box.top - el.offsetHeight - 6) : below}px`;
      slash = { el, items, idx }; page.setAttribute('aria-activedescendant', `dx-sl-${idx}`);
    }
    page.addEventListener('input', () => slashUpdate());
    page.addEventListener('blur', () => setTimeout(closeSlash, 120));
    page.addEventListener('keydown', (e) => {
      if (!slash) return; const n = slash.items.length;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); slash.idx = (slash.idx + (e.key === 'ArrowDown' ? 1 : n - 1)) % n; slashUpdate(); }
      else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); slashChoose(slash.items[slash.idx]); }
      else if (e.key === 'Escape') { e.stopPropagation(); closeSlash(); }
    }, true);

    // ---- floating toolbar while the caret is in a table
    const tbarBtn = (label, text, run) => h('button', { type: 'button', class: 'dx-tbb', title: label, 'aria-label': label, onmousedown: (e) => e.preventDefault(), onclick: (e) => run(e.currentTarget) }, text);
    const cellColours = ['#fef9c3', '#dcfce7', '#cffafe', '#dbeafe', '#ede9fe', '#fce7f3', '#ffedd5', '#fee2e2', '#e5e5e5', '#ffffff'];
    const tbar = h('div', { class: 'dx-tbar', role: 'toolbar', 'aria-label': 'Table tools', contenteditable: 'false', hidden: true },
      tbarBtn('Insert row above', 'Row ↑', () => ed.tableOp('rowAbove')), tbarBtn('Insert row below', 'Row ↓', () => ed.tableOp('rowBelow')), tbarBtn('Insert column left', 'Col ←', () => ed.tableOp('colLeft')), tbarBtn('Insert column right', 'Col →', () => ed.tableOp('colRight')),
      tbarBtn('Delete row', 'Del row', () => ed.tableOp('delRow')), tbarBtn('Delete column', 'Del col', () => ed.tableOp('delCol')), h('span', { class: 'dx-tsep', 'aria-hidden': 'true' }),
      tbarBtn('Header row on or off', 'Header', () => ed.tableOp('header')), tbarBtn('Align cell left', '⇤', () => ed.setCellAlign('l')), tbarBtn('Centre cell', '↔', () => ed.setCellAlign('c')), tbarBtn('Align cell right', '⇥', () => ed.setCellAlign('r')),
      tbarBtn('Cell colour', 'Colour', (b) => { keepSel(); const sw = (c) => { const s = h('button', { type: 'button', class: 'dx-sw', 'aria-label': c, title: c, onclick: () => { closePop(); back(); ed.tableOp('bg', c === '#ffffff' ? null : c); } }); s.style.background = c; return s; }; pop(b, h('div', { class: 'dx-palwrap' }, h('div', { class: 'dx-pal' }, ...cellColours.map(sw))), { role: 'dialog', label: 'Cell colour' }); }),
      tbarBtn('Borders on or off', 'Borders', () => ed.tableOp('nb')), tbarBtn('Delete table', 'Delete', () => ed.tableOp('delTable')));
    paper.append(tbar);
    function paintTableBar() {
      const c = readOnly || mode === 'read' ? null : ed.tableCell(); if (!c) { tbar.hidden = true; return; }
      tbar.hidden = false; tbar.style.top = `${Math.max(2, c.table.offsetTop - 34)}px`; tbar.style.left = `${Math.max(2, c.table.offsetLeft)}px`;
    }
    let toolRaf = 0; document.addEventListener('selectionchange', function f() { if (gone()) { document.removeEventListener('selectionchange', f); return; } if (toolRaf) return; toolRaf = requestAnimationFrame(() => { toolRaf = 0; if (page.contains(getSelection()?.anchorNode)) paintTools(); }); });
    if (readOnly) lockTools();

    // ---- footnotes, copies, folders, named versions, preview, modes
    function addNote() {
      if (readOnly) return; keepSel(); const f = field({ id: 'dx-fn', label: 'Footnote text', rows: 3, maxlength: 1000, hint: 'Numbered automatically and listed under the page.' });
      dialog({ title: 'Insert footnote', body: f.el, actions: [{ label: 'Insert', cls: 'primary', on: () => { if (!f.input.value.trim()) return f.error('Write the note.'); back(); ed.insertFootnote(f.input.value); paintOutline(); } }, { label: 'Cancel' }] });
    }
    function editNote(el) {
      const f = field({ id: 'dx-fn', label: 'Footnote text', rows: 3, maxlength: 1000, value: el.dataset.fn ?? '', readonly: readOnly });
      dialog({ title: 'Footnote', body: f.el, actions: readOnly ? [{ label: 'Close' }] : [{ label: 'Update', cls: 'primary', on: () => { const v = f.input.value.trim(); if (!v) return f.error('Write the note, or remove the footnote.'); checkpoint(); el.dataset.fn = v; el.title = v; onChange('edit'); paintOutline(); } },
        { label: 'Remove footnote', on: () => { checkpoint(); el.remove(); onChange('edit'); paintOutline(); } }, { label: 'Cancel' }] });
    }
    async function makeCopy() {
      const body = currentBody(); const where = meta.client_id ? { space: 'client', client: meta.client_id } : { space: meta.space === 'personal' ? 'personal' : 'shared' };
      const r = await api.call('drive.files.create', { ...where, ...(meta.folder_id ? { folder: meta.folder_id } : {}), ...(meta.project_id ? { project: meta.project_id } : {}), name: `Copy of ${meta.name}`.slice(0, 200), kind: 'document', mime_type: meta.mime_type ?? undefined, body, note: `Copy of ${meta.name}`.slice(0, 300) });
      if (!r.ok) { toast('Couldn’t make a copy here.', false); return; }
      toast('Copy made. Opening it.'); ctx.go(`#/doc/${r.data[0].id}`);
    }
    async function moveToFolder() {
      const where = meta.client_id ? { space: 'client', client: meta.client_id } : { space: meta.space === 'personal' ? 'personal' : 'shared' };
      const r = await api.call('drive.folders.list', where); if (!r.ok) { toast('Couldn’t load the folders.', false); return; }
      const byId = new Map(r.data.map((x) => [x.id, x])); const label = (x) => { const parts = [x.name]; for (let p = byId.get(x.parent_id), n = 0; p && n < 8; p = byId.get(p.parent_id), n += 1) parts.unshift(p.name); return parts.join(' / '); };
      const f = field({ id: 'dx-mv', label: 'Folder', value: meta.folder_id ?? '', options: [['', 'Top level (no folder)'], ...r.data.filter((x) => !x.archived_at).map((x) => [x.id, label(x)]).sort((a, b) => a[1].localeCompare(b[1]))] });
      dialog({ title: 'Move to folder', body: f.el, actions: [{ label: 'Move', cls: 'primary', on: async () => { const to = f.input.value; const x = await api.call('drive.files.update', { id, ...(to ? { folder: to } : { to_root: true }) }); if (!x.ok) { toast('Couldn’t move it.', false); return false; } meta = { ...meta, folder_id: to || null }; toast('Moved.'); } }, { label: 'Cancel' }] });
    }
    function saveNamed() {
      const f = field({ id: 'dx-nv', label: 'Name for this version', maxlength: 120, hint: 'For example “Sent to client” or “Final draft”. It is saved now and marked in History.' });
      dialog({ title: 'Save a named version', body: f.el, actions: [{ label: 'Save version', cls: 'primary', on: async () => { const n = f.input.value.trim(); if (!n) return f.error('Give the version a name.'); const ok = await save({ manual: true, note: `★ ${n}` }); if (!ok) return false; toast('Named version saved.'); } }, { label: 'Cancel' }] });
    }
    async function preview(scope) {
      commit(); const c = contentOf(doc, scopeTab(scope), { headers: true });
      let frame; const done = dialog({ title: 'Print preview', wide: true, body: h('div', { class: 'dx-previewhost' }), actions: [{ label: 'Print…', cls: 'primary', on: () => { frame?.contentWindow?.focus(); frame?.contentWindow?.print(); return false; } }, { label: 'Close' }] });
      void done; const host = document.querySelector('.dx-previewhost');
      try { frame = await printBlocks({ blocks: c.blocks, page: c.page, imageSrc, title: meta.name, preview: host }); } catch { host.textContent = 'Couldn’t build the preview.'; }
    }
    function setMode(m) {
      mode = mode === m ? '' : m; root.classList.toggle('dx-focus', mode === 'focus'); root.classList.toggle('dx-reading', mode === 'read');
      page.setAttribute('contenteditable', readOnly || mode === 'read' ? 'false' : 'true');
      if (mode) { exitBtn.hidden = false; exitBtn.focus(); } else { exitBtn.hidden = true; ed.focus(); }
      if (mode) toast(mode === 'focus' ? 'Focus mode. Press Esc or use the button to leave.' : 'Reading mode. Press Esc or use the button to leave.');
    }
    const exitBtn = h('button', { type: 'button', class: 'btn dx-exit', hidden: true, onclick: () => setMode(mode) }, 'Leave ', 'focus / reading mode');
    root.addEventListener('keydown', (e) => { if (e.key === 'Escape' && mode && !openPop && !document.querySelector('.ovl')) setMode(mode); });
    function toggleOutline() { outlineOpen = !outlineOpen; store.set('dx-outline', outlineOpen ? '1' : '0'); outlineEl.hidden = !outlineOpen; }

    // ---- exports
    const scopeTab = (scope) => (scope === 'all' ? 'all' : activeTab);
    const contentFor = (scope) => { commit(); return contentOf(doc, scopeTab(scope), { headers: true }); };
    async function imagesFor(blocks) {
      const out = {};
      for (const b of blocks) {
        if (b.t !== 'img' || out[b.f]) continue;
        try { const src = await imageSrc(b.f); if (!src) continue; const blob = src.startsWith('data:') ? dataUrlToBlob(src) : await (await fetch(src)).blob(); const bmp = await createImageBitmap(blob); let type = IMG_TYPES[blob.type] ?? 'png'; let bytes = new Uint8Array(await blob.arrayBuffer());
          if (type === 'webp') { const cv = new OffscreenCanvas(bmp.width, bmp.height); cv.getContext('2d').drawImage(bmp, 0, 0); bytes = new Uint8Array(await (await cv.convertToBlob({ type: 'image/png' })).arrayBuffer()); type = 'png'; }
          out[b.f] = { data: bytes, type, w: bmp.width, h: bmp.height }; bmp.close?.(); } catch { /* the picture is left out of the file */ }
      }
      return out;
    }
    const exporters = {
      txt: (s) => { commit(); download(`${safeName(meta.name)}.txt`, 'text/plain;charset=utf-8', toText(doc, scopeTab(s))); },
      md: (s) => { commit(); download(`${safeName(meta.name)}.md`, 'text/markdown;charset=utf-8', toMarkdown(doc, scopeTab(s))); },
      html: async (s) => { commit(); const c = contentOf(doc, scopeTab(s)); const imgs = {}; for (const [k, v] of Object.entries(await imagesFor(c.blocks))) imgs[k] = `data:image/${v.type === 'jpg' ? 'jpeg' : v.type};base64,${btoa(String.fromCharCode(...v.data))}`; download(`${safeName(meta.name)}.html`, 'text/html;charset=utf-8', toHtml(doc, { tab: scopeTab(s), title: meta.name, images: imgs })); },
      docx: async (s) => {
        const io = await loadIo(); if (!io) { toast('Word files are not part of this build yet.', false); return; }
        toast('Preparing the Word file…'); const c = contentFor(s);
        try { download(`${safeName(meta.name)}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', await io.buildDocx(c, await imagesFor(c.blocks))); } catch { toast('Couldn’t make the Word file.', false); }
      },
      pdf: async (s) => { toast('In the print window, choose “Save as PDF” as the destination.'); await exporters.print(s); },
      odt: async (s) => { const io = await loadIo(); if (!io) return toast('OpenDocument files are not part of this build yet.', false); toast('Preparing the file…'); const c = contentFor(s); try { download(`${safeName(meta.name)}.odt`, 'application/vnd.oasis.opendocument.text', io.buildOdt(c, await imagesFor(c.blocks), meta.name)); } catch { toast('Couldn’t make the .odt file.', false); } },
      rtf: async (s) => { const io = await loadIo(); if (!io) return toast('Rich Text files are not part of this build yet.', false); const c = contentFor(s); try { download(`${safeName(meta.name)}.rtf`, 'application/rtf', io.buildRtf(c, await imagesFor(c.blocks))); } catch { toast('Couldn’t make the .rtf file.', false); } },
      epub: async (s) => { const io = await loadIo(); if (!io) return toast('EPUB files are not part of this build yet.', false); toast('Preparing the book…'); const c = contentFor(s); commit();
        const chapters = s === 'all' ? flatTabs(doc).map((x) => ({ id: x.tab.id, title: x.tab.title })) : [{ id: activeTab, title: findTab(doc, activeTab).tab.title }];
        try { download(`${safeName(meta.name)}.epub`, 'application/epub+zip', io.buildEpub(doc, chapters, await imagesFor(c.blocks), meta.name)); } catch { toast('Couldn’t make the .epub file.', false); } },
      zip: async (s) => { const io = await loadIo(); if (!io) return toast('Zipped web pages are not part of this build yet.', false); const c = contentFor(s); try { download(`${safeName(meta.name)}-web-page.zip`, 'application/zip', io.buildHtmlZip(doc, scopeTab(s), await imagesFor(c.blocks), meta.name)); } catch { toast('Couldn’t make the zip file.', false); } },
      print: async (s) => { commit(); const c = contentFor(s); try { await printBlocks({ blocks: c.blocks, page: c.page, imageSrc, title: meta.name }); } catch { toast('Couldn’t open the print view.', false); } },
    };
    async function openFile() {
      if (readOnly) return;
      const inp = h('input', { type: 'file', accept: '.docx,.md,.markdown,.txt,.html,.htm,text/plain,text/markdown,text/html,application/vnd.openxmlformats-officedocument.wordprocessingml.document', class: 'sr', tabindex: '-1', 'aria-hidden': 'true' });
      inp.addEventListener('change', async () => {
        const f = inp.files[0]; inp.remove(); if (!f) return;
        if (f.size > 25 * 1024 * 1024) { toast('That file is over 25 MB.', false); return; }
        const ext = (/\.([a-z0-9]+)$/i.exec(f.name)?.[1] ?? '').toLowerCase(); toast(`Opening ${f.name}…`);
        try {
          let list;
          if (ext === 'docx') { const io = await loadIo(); if (!io) return toast('Word files are not part of this build yet.', false); list = blocksFromHtml(await io.importDocx(await f.arrayBuffer())); }
          else if (ext === 'md' || ext === 'markdown') list = blocksFromMarkdown(await f.text());
          else if (ext === 'html' || ext === 'htm') list = blocksFromHtml(await f.text());
          else if (ext === 'txt' || f.type.startsWith('text/')) list = blocksFromText(await f.text());
          else return toast('Open a .docx, .md, .txt or .html file.', false);
          const out = [];
          for (const b of list) { if (b.t === 'img' && !b.f) { const blob = dataUrlToBlob(b.src); const fid = blob ? await uploadImage(blob, 'imported-image') : null; if (fid) out.push({ t: 'img', f: fid, alt: b.alt }); } else out.push(b); }
          if (!out.length) { toast('That file has no text to import.', false); return; }
          const apply = () => { checkpoint(); ed.load(normBlocks(out)); onChange('edit'); toast('Imported. Check the layout, then save.'); };
          if (isEmpty({ blocks: ed.blocks() })) apply(); else dialog({ title: 'Replace this tab with the file?', body: h('p', {}, `The content of “${f.name}” will replace what is in this tab. You can undo it, and the earlier version stays in History.`), actions: [{ label: 'Replace', cls: 'primary', on: apply }, { label: 'Cancel' }] });
        } catch { toast('Couldn’t read that file.', false); }
      });
      document.body.append(inp); inp.click();
    }
    const multi = () => tabCount(doc) > 1;
    const FORMATS = [['docx', 'Word (.docx)'], ['pdf', 'PDF (.pdf, via Save as PDF)'], ['odt', 'OpenDocument text (.odt)'], ['rtf', 'Rich Text (.rtf)'], ['txt', 'Plain text (.txt)'], ['html', 'Web page (.html)'], ['zip', 'Web page with pictures (.zip)'], ['epub', 'EPUB book (.epub)'], ['md', 'Markdown (.md)']];
    const dl = ([k, label]) => (multi() ? [{ label: `${label} · this tab`, run: () => exporters[k]('tab') }, { label: `${label} · all tabs`, run: () => exporters[k]('all') }] : [{ label, run: () => exporters[k]('tab') }]);
    const E = readOnly;
    const menus = () => {
      const st = ed.state();
      return {
        File: [{ label: 'Save', shortcut: `${MOD}S`, disabled: E, run: () => save({ manual: true }) }, { label: 'Version history', run: openHistory }, { label: 'Rename', disabled: E, run: () => { titleIn.focus(); titleIn.select(); } }, { sep: true },
          { label: 'Make a copy', disabled: !ctx.can('drive.file.upload', meta.client_id), run: makeCopy }, { label: 'Move to folder…', disabled: E, run: moveToFolder }, { label: 'Save named version…', disabled: E, run: saveNamed }, { sep: true }, { label: 'Open file (.docx, .md, .txt, .html)…', disabled: E, run: openFile }, { group: 'Download as', items: FORMATS.flatMap(dl) }, { sep: true },
          { label: 'Print preview…', run: () => preview(multi() ? 'tab' : 'tab') }, { label: multi() ? 'Print this tab…' : 'Print…', shortcut: `${MOD}P`, run: () => exporters.print('tab') }, multi() ? { label: 'Print all tabs…', run: () => exporters.print('all') } : null, { label: 'Page setup…', run: () => pageSetup() }],
        Edit: [{ label: 'Undo', shortcut: `${MOD}Z`, disabled: E || at <= 0, run: () => { ed.focus(); undo(); } }, { label: 'Redo', shortcut: `${MOD}Y`, disabled: E || at >= stack.length - 1, run: () => { ed.focus(); redo(); } }, { sep: true },
          { label: 'Cut', shortcut: `${MOD}X`, disabled: E, run: () => clip('cut') }, { label: 'Copy', shortcut: `${MOD}C`, run: () => clip('copy') }, { label: 'Paste', shortcut: `${MOD}V`, disabled: E, run: () => pasteFromClipboard(false) }, { label: 'Paste as plain text', shortcut: `${MOD}Shift+V`, disabled: E, run: () => pasteFromClipboard(true) },
          { label: 'Select all', shortcut: `${MOD}A`, run: () => { ed.focus(); document.execCommand('selectAll'); } }, { sep: true }, { label: 'Find…', shortcut: `${MOD}F`, run: () => openFind(false) }, { label: 'Find and replace…', shortcut: `${MOD}H`, disabled: E, run: () => openFind(true) }],
        View: [{ label: 'Document tabs', checked: tabsOpen, run: () => toggleTabs() }, { label: 'Outline of headings', checked: outlineOpen, run: () => toggleOutline() }, { label: 'Focus mode', run: () => setMode('focus') }, { label: 'Reading mode', run: () => setMode('read') }, { sep: true }, { label: 'Zoom in', run: () => setZoom(zoom + 10) }, { label: 'Zoom out', run: () => setZoom(zoom - 10) }, { label: 'Zoom 100%', run: () => setZoom(100) }, { sep: true }, { label: 'Page setup…', run: () => pageSetup() }],
        Insert: [{ label: 'Picture…', disabled: E, run: pickImage }, { label: 'Table…', disabled: E, run: insertTable }, { label: 'Convert selected text to table', disabled: E, run: convertToTable }, { label: 'Link…', shortcut: `${MOD}K`, disabled: E, run: link }, { label: 'Horizontal line', disabled: E, run: C(() => ed.insertBlocks([{ t: 'hr' }])) }, { label: 'Page break', disabled: E, run: C(() => ed.insertBlocks([{ t: 'pb' }])) }, { sep: true },
          { label: 'Table of contents', disabled: E, run: C(() => { ed.insertBlocks([{ t: 'toc' }]); paintOutline(); }) }, { label: 'Footnote…', disabled: E, run: addNote }, { label: 'Special characters…', disabled: E, run: specials }, { label: 'Today’s date', disabled: E, run: insertDate }, { sep: true }, { label: 'New tab', disabled: E, run: () => newTab(null) }, { label: 'New sub-tab', disabled: E || findTab(doc, activeTab).depth + 1 >= MAX_TAB_DEPTH, run: () => newTab(activeTab) }],
        Format: [{ heading: 'Text' }, { label: 'Bold', shortcut: `${MOD}B`, checked: Boolean(st.marks.b), disabled: E, run: C(() => ed.toggleMark('b')) }, { label: 'Italic', shortcut: `${MOD}I`, checked: Boolean(st.marks.i), disabled: E, run: C(() => ed.toggleMark('i')) }, { label: 'Underline', shortcut: `${MOD}U`, checked: Boolean(st.marks.u), disabled: E, run: C(() => ed.toggleMark('u')) },
          { label: 'Strikethrough', checked: Boolean(st.marks.s), disabled: E, run: C(() => ed.toggleMark('s')) }, { label: 'Superscript', checked: Boolean(st.marks.sup), disabled: E, run: C(() => ed.toggleMark('sup')) }, { label: 'Subscript', checked: Boolean(st.marks.sub), disabled: E, run: C(() => ed.toggleMark('sub')) }, { label: 'Code', checked: Boolean(st.marks.cd), disabled: E, run: C(() => ed.toggleMark('cd')) }, { sep: true },
          { group: 'Paragraph style', items: [['p', 'Normal text', '0'], ['title', 'Title'], ['subtitle', 'Subtitle'], ['h1', 'Heading 1', '1'], ['h2', 'Heading 2', '2'], ['h3', 'Heading 3', '3'], ['quote', 'Quote'], ['code', 'Code block']].map(([t, l, k]) => ({ label: l, shortcut: k ? `${MOD}Alt+${k}` : undefined, checked: st.type === t, disabled: E, run: C(() => ed.setBlockType(t)) })) },
          { group: 'Align and indent', items: [...[['l', 'Left'], ['c', 'Centre'], ['r', 'Right'], ['j', 'Justify']].map(([a, l]) => ({ label: l, shortcut: `${MOD}Shift+${{ l: 'L', c: 'E', r: 'R', j: 'J' }[a]}`, checked: st.al === a, disabled: E, run: C(() => ed.setAlign(a)) })), { label: 'Increase indent', disabled: E, run: C(() => ed.indent(1)) }, { label: 'Decrease indent', disabled: E, run: C(() => ed.indent(-1)) }] },
          { group: 'Lists', items: [{ label: 'Bulleted list', shortcut: `${MOD}Shift+8`, checked: st.list === 'ul', disabled: E, run: C(() => ed.toggleList('ul')) }, { label: 'Numbered list', shortcut: `${MOD}Shift+7`, checked: st.list === 'ol', disabled: E, run: C(() => ed.toggleList('ol')) }, { label: 'Checklist', shortcut: `${MOD}Shift+9`, checked: st.list === 'cl', disabled: E, run: C(() => ed.toggleList('cl')) }] },
          { group: 'Text direction', items: [{ label: 'Left to right', disabled: E, run: C(() => ed.setDirection('ltr')) }, { label: 'Right to left (Urdu, Arabic)', disabled: E, run: C(() => ed.setDirection('rtl')) }] },
          { group: 'Change case', items: [['upper', 'UPPERCASE'], ['lower', 'lowercase'], ['title', 'Title Case'], ['sentence', 'Sentence case']].map(([k, l]) => ({ label: l, disabled: E, run: C(() => ed.changeCase(k)) })) },
          { label: 'Bigger text', disabled: E, run: C(() => ed.setMark('z', Math.min(200, (st.marks.z ?? DEFAULT_SIZE) + 1))) }, { label: 'Smaller text', disabled: E, run: C(() => ed.setMark('z', Math.max(6, (st.marks.z ?? DEFAULT_SIZE) - 1))) }, { sep: true },
          { label: 'Clear formatting', shortcut: `${MOD}\\`, disabled: E, run: C(() => ed.clearFormat()) }, { label: 'Page setup…', run: () => pageSetup() }],
        Tools: [{ label: 'Word count…', run: countDialog }, { label: 'Voice typing and transcripts…', run: () => openVoice() }, { label: 'Check spelling as I type', checked: spell, run: () => { spell = !spell; page.spellcheck = spell; store.set('dx-spell', spell ? '1' : '0'); } }, { label: 'Find and replace…', shortcut: `${MOD}H`, disabled: E, run: () => openFind(true) }, { sep: true }, { label: 'Keyboard shortcuts…', run: shortcuts }],
      };
    };
    const menubar = h('div', { class: 'dx-menubar', role: 'menubar', 'aria-label': 'Document menu' });
    const narrowMq = matchMedia('(max-width: 700px)'); let menuBtns = [];
    function buildMenubar() {
      if (gone()) return;
      if (narrowMq.matches) {
        const b = h('button', { type: 'button', class: 'dx-mb', role: 'menuitem', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'Menu' }, '☰ Menu');
        b.addEventListener('click', () => { const self = pop(b, [], { role: 'menu', label: 'Menu', onClose: () => b.setAttribute('aria-expanded', 'false') }); self.el.replaceChildren(...menuItems(Object.entries(menus()).map(([group, items]) => ({ group, items })), self.close, self.place)); self.place(); b.setAttribute('aria-expanded', 'true'); self.el.querySelector('[role^=menuitem]')?.focus(); });
        menuBtns = [b]; menubar.replaceChildren(b); return;
      }
      menuBtns = Object.keys(menus()).map((name) => {
        const b = h('button', { type: 'button', class: 'dx-mb', role: 'menuitem', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, name);
        const open = () => { const self = pop(b, [], { role: 'menu', label: name, onClose: () => b.setAttribute('aria-expanded', 'false') }); const items = menus()[name]; self.el.replaceChildren(...menuItems(items, self.close, self.place)); self.place(); b.setAttribute('aria-expanded', 'true'); self.el.querySelector('[role^=menuitem]:not(:disabled)')?.focus(); };
        b.addEventListener('click', () => (b.getAttribute('aria-expanded') === 'true' ? closePop() : open()));
        b.addEventListener('mouseenter', () => { if (openPop && menuBtns.some((x) => x.getAttribute('aria-expanded') === 'true') && b.getAttribute('aria-expanded') !== 'true') open(); });
        b.addEventListener('keydown', (e) => { const i = menuBtns.indexOf(b); if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } else if (e.key === 'ArrowRight') { e.preventDefault(); menuBtns[(i + 1) % menuBtns.length].focus(); } else if (e.key === 'ArrowLeft') { e.preventDefault(); menuBtns[(i + menuBtns.length - 1) % menuBtns.length].focus(); } });
        return b;
      });
      menubar.replaceChildren(...menuBtns);
    }
    buildMenubar(); narrowMq.addEventListener('change', buildMenubar);
    // F10, or Alt pressed on its own, moves focus to the menu bar
    let altOnly = false;
    root.addEventListener('keydown', (e) => { if (e.key === 'F10') { e.preventDefault(); menuBtns[0]?.focus(); } altOnly = e.key === 'Alt'; });
    root.addEventListener('keyup', (e) => { if (e.key === 'Alt' && altOnly) { menuBtns[0]?.focus(); } altOnly = false; });
    // the Left/Right arrows inside an open menu move to the neighbouring menu
    document.addEventListener('keydown', function f(e) { if (gone()) { document.removeEventListener('keydown', f); return; } if (!openPop || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return; const i = menuBtns.findIndex((b) => b.getAttribute('aria-expanded') === 'true'); if (i < 0) return; e.preventDefault(); const n = menuBtns[(i + (e.key === 'ArrowRight' ? 1 : menuBtns.length - 1)) % menuBtns.length]; n.focus(); n.click(); });

    // ---- right-click menu inside the page
    page.addEventListener('contextmenu', (e) => {
      e.preventDefault(); const fig = e.target.closest?.('figure.dx-img'); if (fig) ed.selectFig(fig);
      keepSel(); const st = ed.state(); const hasSel = ed.hasSelection();
      let at = { x: e.clientX, y: e.clientY };
      if (e.clientX === 0 && e.clientY === 0) { const r = getSelection().rangeCount ? getSelection().getRangeAt(0).getBoundingClientRect() : page.getBoundingClientRect(); at = { x: r.left, y: r.bottom }; }
      const items = [
        { label: 'Cut', shortcut: `${MOD}X`, disabled: readOnly || !hasSel, run: () => clip('cut') }, { label: 'Copy', shortcut: `${MOD}C`, disabled: !hasSel, run: () => clip('copy') },
        { label: 'Paste', shortcut: `${MOD}V`, disabled: readOnly, run: () => pasteFromClipboard(false) }, { label: 'Paste as plain text', shortcut: `${MOD}Shift+V`, disabled: readOnly, run: () => pasteFromClipboard(true) }, { sep: true },
        { label: 'Select all', shortcut: `${MOD}A`, run: () => { ed.focus(); document.execCommand('selectAll'); } }, { sep: true },
        { label: st.link ? 'Edit link…' : 'Link…', shortcut: `${MOD}K`, disabled: readOnly, run: link }, st.link ? { label: 'Open link', run: () => { const h2 = safeHref(st.link); if (h2) open(h2, '_blank', 'noopener,noreferrer'); } } : null,
        { label: 'Clear formatting', disabled: readOnly, run: C(() => ed.clearFormat()) },
        ...(st.table ? [{ sep: true }, { heading: 'Table' }, { label: 'Insert row above', disabled: readOnly, run: () => ed.tableOp('rowAbove') }, { label: 'Insert row below', disabled: readOnly, run: () => ed.tableOp('rowBelow') }, { label: 'Insert column left', disabled: readOnly, run: () => ed.tableOp('colLeft') }, { label: 'Insert column right', disabled: readOnly, run: () => ed.tableOp('colRight') },
          { label: 'Header row', checked: Boolean(ed.tableCell()?.table.rows[0]?.cells[0]?.tagName === 'TH'), disabled: readOnly, run: () => ed.tableOp('header') }, { label: 'Align cell left', disabled: readOnly, run: () => ed.setCellAlign('l') }, { label: 'Centre cell', disabled: readOnly, run: () => ed.setCellAlign('c') }, { label: 'Align cell right', disabled: readOnly, run: () => ed.setCellAlign('r') },
          { label: 'Delete row', disabled: readOnly, run: () => ed.tableOp('delRow') }, { label: 'Delete column', disabled: readOnly, run: () => ed.tableOp('delCol') }, { label: 'Delete table', disabled: readOnly, run: () => ed.tableOp('delTable') }] : []),
        ...(st.fig ? [{ sep: true }, { heading: 'Picture' }, { label: 'Picture details…', disabled: readOnly, run: imageDetails }, { label: 'Align left', disabled: readOnly, run: () => ed.setImage({ al: 'l' }) }, { label: 'Centre', disabled: readOnly, run: () => ed.setImage({ al: 'c' }) }, { label: 'Align right', disabled: readOnly, run: () => ed.setImage({ al: 'r' }) }, { label: 'Remove picture', disabled: readOnly, run: () => ed.removeFig() }] : []),
      ];
      const self = pop(null, [], { role: 'menu', label: 'Edit menu', at }); self.el.replaceChildren(...menuItems(items, self.close, self.place)); self.place();
      self.el.querySelector('[role^=menuitem]:not(:disabled)')?.focus();
    });

    // ---- keyboard shortcuts for the whole editor
    root.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey; if (!mod || e.target.closest?.('.dlg, .dx-pop')) return;
      const k = e.key.toLowerCase(); const inPage = page.contains(e.target);
      const go = (fn) => { e.preventDefault(); fn(); };
      if (k === 's' && !e.shiftKey) return go(() => save({ manual: true }));
      if (k === 'p' && !e.shiftKey) return go(() => exporters.print('tab'));
      if (k === 'f' && !e.shiftKey && !e.altKey) return go(() => openFind(false));
      if (k === 'h' && !e.shiftKey && !e.altKey) return go(() => openFind(true));
      if (!inPage || readOnly) return;
      if (e.altKey && /^[0-3]$/.test(e.code.slice(-1)) && !e.shiftKey) return go(() => ed.setBlockType(['p', 'h1', 'h2', 'h3'][Number(e.code.slice(-1))]));
      if (k === 'b' && !e.shiftKey) return go(() => ed.toggleMark('b')); if (k === 'i' && !e.shiftKey) return go(() => ed.toggleMark('i')); if (k === 'u' && !e.shiftKey) return go(() => ed.toggleMark('u'));
      if (k === 'k' && !e.shiftKey) return go(link);
      if (k === 'z' && !e.shiftKey) return go(undo); if (k === 'y' || (k === 'z' && e.shiftKey)) return go(redo);
      if (k === '\\') return go(() => ed.clearFormat());
      if (e.shiftKey && e.code === 'Digit7') return go(() => ed.toggleList('ol')); if (e.shiftKey && e.code === 'Digit8') return go(() => ed.toggleList('ul')); if (e.shiftKey && e.code === 'Digit9') return go(() => ed.toggleList('cl'));
      if (e.shiftKey && ['l', 'e', 'r', 'j'].includes(k)) return go(() => ed.setAlign({ l: 'l', e: 'c', r: 'r', j: 'j' }[k]));
      if (k === 'v' && e.shiftKey) { e.preventDefault(); pasteFromClipboard(true); }
    });

    // ---- zoom
    const pageInfo = h('span', { class: 'docstat' });
    const zoomSel = h('select', { class: 'dx-sel', 'aria-label': 'Zoom', onchange: () => setZoom(Number(zoomSel.value)) }, ...[50, 75, 90, 100, 110, 125, 150, 200].map((n) => h('option', { value: String(n) }, `${n}%`)));
    function setZoom(n) { zoom = Math.max(50, Math.min(200, Math.round(n))); if (![...zoomSel.options].some((o) => o.value === String(zoom))) zoomSel.append(h('option', { value: String(zoom) }, `${zoom}%`)); store.set('dx-zoom', String(zoom)); applyPage(); }

    // ---- tabs (pages and sub-pages) and the outline of the open tab
    const parentIdOf = (tid) => { const f = findTab(doc, tid); return flatTabs(doc).find((x) => x.tab.children === f.parent)?.tab.id ?? null; };
    function openTab(tid, { focus = false } = {}) {
      if (!findTab(doc, tid)) return; checkpoint(); if (tid === activeTab) return;
      closeFindHighlight(); activeTab = tid; ed.load(findTab(doc, tid).tab.blocks); lastBody = JSON.stringify(doc); paper.scrollTop = 0; window.scrollTo?.({ top: Math.max(0, root.getBoundingClientRect().top + scrollY - 8), behavior: 'auto' });
      stack.length = at + 1; stack.push({ body: lastBody, tab: tid, pos: null }); at = stack.length - 1;
      paintTabs(); paintOutline(); paintStats(lastBody.length); paintTools(); if (focus) ed.focus();
    }
    const closeFindHighlight = () => { if (!findBar.hidden) { ed.highlight([], 0); } };
    function structural(next, focusId) { checkpoint(); doc = next; if (focusId) activeTab = focusId; ed.load(findTab(doc, activeTab).tab.blocks); onChange('edit'); if (!findBar.hidden) runFind(); }
    function newTab(parentId) {
      if (readOnly) return; commit(); const r = addTab(doc, parentId, undefined);
      if (!r) { toast(parentId ? `Sub-tabs go ${MAX_TAB_DEPTH} levels deep at most, and a document can have ${MAX_TABS} tabs.` : `A document can have ${MAX_TABS} tabs.`, false); return; }
      if (parentId) collapsed.delete(parentId); structural(r.doc, r.id); renameTab(r.id, true);
    }
    function renameTab(tid, isNew) {
      const t = findTab(doc, tid)?.tab; if (!t) return; const f = field({ id: 'dx-tn', label: 'Tab name', value: t.title, maxlength: 120 });
      dialog({ title: isNew ? 'Name the new tab' : 'Rename tab', onClose: () => { if (isNew) setTimeout(() => ed.focus(), 0); }, body: f.el, actions: [{ label: 'Save', cls: 'primary', on: () => { const v = f.input.value.trim(); if (!v) return f.error('Enter a name.'); commit(); doc = updateTab(doc, tid, { title: v }); onChange('edit'); } }, { label: isNew ? 'Keep the default' : 'Cancel' }] });
      f.input.select();
    }
    function tabIcon(tid) {
      const t = findTab(doc, tid)?.tab; if (!t) return; const f = field({ id: 'dx-ti', label: 'Emoji or symbol', value: t.icon ?? '', maxlength: 8, hint: 'One emoji or a short symbol shown before the name.' });
      const quick = h('div', { class: 'dx-spg' }, ...['📄', '📌', '💡', '✅', '📊', '🎯', '🧩', '📝', '⭐', '🔒'].map((e) => h('button', { type: 'button', class: 'dx-spb', 'aria-label': `Use ${e}`, onclick: () => { f.input.value = e; } }, e)));
      dialog({ title: 'Tab icon', body: [f.el, quick], actions: [{ label: 'Apply', cls: 'primary', on: () => { commit(); doc = updateTab(doc, tid, { icon: f.input.value.trim() }); onChange('edit'); } }, { label: 'Remove icon', on: () => { commit(); doc = updateTab(doc, tid, { icon: '' }); onChange('edit'); } }, { label: 'Cancel' }] });
    }
    function removeTab(tid) {
      const f = findTab(doc, tid); if (!f) return; const n = flatTabs({ tabs: [f.tab] }).length - 1;
      if (doc.tabs.length === 1 && f.depth === 0) { toast('A document needs at least one tab.', false); return; }
      dialog({ title: `Delete “${f.tab.title}”?`, body: [h('p', {}, n ? `This also deletes its ${n} sub-tab${n === 1 ? '' : 's'}.` : 'Its text is deleted with it.'), h('p', { class: 'fine muted' }, 'You can undo this, and earlier saved versions stay in History.')], actions: [{ label: 'Delete tab', cls: 'danger', on: () => {
        commit(); const inside = flatTabs({ tabs: [f.tab] }).some((x) => x.tab.id === activeTab); const next = deleteTab(doc, tid); if (!next) return;
        const sib = f.parent[f.index + 1] ?? f.parent[f.index - 1]; const target = inside ? (sib?.id ?? parentIdOf(tid) ?? next.tabs[0].id) : activeTab;
        structural(next, findTab(next, target) ? target : next.tabs[0].id); } }, { label: 'Keep it', focus: true }] });
    }
    const tabMenu = (anchor, tid) => {
      const f = findTab(doc, tid); const items = [
        { label: 'Add sub-tab', disabled: readOnly || f.depth + 1 >= MAX_TAB_DEPTH, run: () => newTab(tid) }, { label: 'Rename', disabled: readOnly, run: () => renameTab(tid) }, { label: 'Change icon…', disabled: readOnly, run: () => tabIcon(tid) }, { label: 'Duplicate', disabled: readOnly, run: () => { commit(); const r = duplicateTab(doc, tid); if (!r) toast(`A document can have ${MAX_TABS} tabs.`, false); else structural(r.doc, r.id); } }, { sep: true },
        { label: 'Move up', disabled: readOnly || f.index === 0, run: () => { commit(); structural(moveTab(doc, tid, 'up')); } }, { label: 'Move down', disabled: readOnly || f.index === f.parent.length - 1, run: () => { commit(); structural(moveTab(doc, tid, 'down')); } },
        { label: 'Make sub-tab of the one above', disabled: readOnly || f.index === 0 || indentTab(doc, tid) === doc, run: () => { commit(); structural(indentTab(doc, tid)); } }, { label: 'Move out one level', disabled: readOnly || f.depth === 0, run: () => { commit(); structural(outdentTab(doc, tid)); } }, { sep: true },
        { label: 'Delete…', disabled: readOnly || (doc.tabs.length === 1 && f.depth === 0), run: () => removeTab(tid) }];
      const self = pop(anchor, [], { role: 'menu', label: 'Tab actions' }); self.el.replaceChildren(...menuItems(items, self.close, self.place)); self.place(); self.el.querySelector('[role^=menuitem]:not(:disabled)')?.focus();
    };
    let dragId = null;
    function paintTabs() {
      if (gone()) return;
      const active = document.activeElement; const refocus = tabsEl.contains(active) && active.dataset?.tab ? active.dataset.tab : null;
      const rowsOf = (list, depth) => list.map((tab) => {
        const kids = tab.children; const open = !collapsed.has(tab.id); const isActive = tab.id === activeTab;
        const main = h('button', { type: 'button', class: 'dx-tabbtn', 'data-tab': tab.id, tabindex: isActive ? '0' : '-1', 'aria-current': isActive ? 'page' : false, title: `${tab.title} · ${tabWords(tab).toLocaleString()} words`, onclick: () => openTab(tab.id, { focus: true }) },
          tab.icon ? h('span', { class: 'dx-ticon', 'aria-hidden': 'true' }, tab.icon) : icon('doc'), h('span', { class: 'dx-ttitle' }, tab.title));
        const more = readOnly ? null : h('button', { type: 'button', class: 'dx-tabmore', 'aria-label': `Actions for ${tab.title}`, 'aria-haspopup': 'menu', onclick: (e) => tabMenu(e.currentTarget, tab.id) }, icon('more'));
        const toggle = kids.length ? h('button', { type: 'button', class: 'dx-twist', 'aria-label': `${open ? 'Collapse' : 'Expand'} ${tab.title}`, 'aria-expanded': String(open), onclick: () => { if (open) collapsed.add(tab.id); else collapsed.delete(tab.id); paintTabs(); } }, open ? '▾' : '▸') : h('span', { class: 'dx-twist dx-nobtn', 'aria-hidden': 'true' });
        const row = h('div', { class: `dx-tabrow${isActive ? ' on' : ''}`, draggable: readOnly ? false : 'true' }, toggle, main, more);
        row.addEventListener('dragstart', (e) => { dragId = tab.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', `tab:${tab.id}`); });
        row.addEventListener('dragend', () => { dragId = null; for (const x of tabsEl.querySelectorAll('.dx-drop')) x.classList.remove('dx-drop', 'dx-before', 'dx-after', 'dx-in'); });
        row.addEventListener('dragover', (e) => { if (!dragId || dragId === tab.id) return; e.preventDefault(); const r = row.getBoundingClientRect(); const y = (e.clientY - r.top) / r.height; row.className = `dx-tabrow${isActive ? ' on' : ''} dx-drop ${y < 0.28 ? 'dx-before' : y > 0.72 ? 'dx-after' : 'dx-in'}`; });
        row.addEventListener('dragleave', () => { row.className = `dx-tabrow${isActive ? ' on' : ''}`; });
        row.addEventListener('drop', (e) => {
          e.preventDefault(); const r = row.getBoundingClientRect(); const y = (e.clientY - r.top) / r.height; row.className = `dx-tabrow${isActive ? ' on' : ''}`; const from = dragId; dragId = null; if (!from || from === tab.id) return;
          commit(); const t = findTab(doc, tab.id); let next;
          if (y < 0.28) next = moveTabTo(doc, from, parentIdOf(tab.id), t.index); else if (y > 0.72) next = moveTabTo(doc, from, parentIdOf(tab.id), t.index + 1); else { collapsed.delete(tab.id); next = moveTabTo(doc, from, tab.id, t.tab.children.length); }
          if (next === doc) toast('Tabs go three levels deep at most, and a tab can’t go inside itself.', false); else structural(next);
        });
        row.addEventListener('keydown', (e) => {
          if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && !readOnly) { e.preventDefault(); commit(); structural(moveTab(doc, tab.id, e.key === 'ArrowUp' ? 'up' : 'down')); return; }
          if (e.key === 'ArrowRight' && kids.length && !open) { collapsed.delete(tab.id); paintTabs(); } else if (e.key === 'ArrowLeft' && kids.length && open) { collapsed.add(tab.id); paintTabs(); }
          else if ((e.key === 'F2') && !readOnly) renameTab(tab.id); else if (e.key === 'Delete' && !readOnly) removeTab(tab.id);
          else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { const all = [...tabsEl.querySelectorAll('.dx-tabbtn')]; const i = all.findIndex((b) => b.dataset.tab === tab.id); all[i + (e.key === 'ArrowDown' ? 1 : -1)]?.focus(); e.preventDefault(); }
        });
        const li = h('li', { role: 'none', 'data-depth': String(depth) }, row);
        if (isActive) li.append(outlineEl);
        if (kids.length && open) li.append(h('ul', { role: 'group', class: 'dx-tabsub' }, ...rowsOf(kids, depth + 1)));
        return li;
      });
      tabsEl.replaceChildren(h('ul', { role: 'tree', class: 'dx-tabtree', 'aria-label': 'Tabs' }, ...rowsOf(doc.tabs, 0)));
      if (refocus) tabsEl.querySelector(`[data-tab="${refocus}"]`)?.focus();
    }
    function paintOutline() {
      fillToc(page, (i) => page.children[i]?.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' })); fillNotes(page, notesEl);
      const o = outline({ blocks: ed.blocks() }); outlineEl.replaceChildren(o.length ? h('ul', { class: 'dx-ol' }, ...o.map((x) => h('li', { class: `l${x.level}` }, h('button', { type: 'button', class: 'lnk', onclick: () => { const el = page.children[x.index]; el?.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' }); } }, x.text)))) : h('p', { class: 'fine muted dx-olnone' }, 'Headings you add appear here.'));
    }
    function toggleTabs() { tabsOpen = !tabsOpen; store.set('dx-tabs', tabsOpen ? '1' : '0'); body.classList.toggle('no-tabs', !tabsOpen); tabsToggle.setAttribute('aria-expanded', String(tabsOpen)); }
    const tabsToggle = h('button', { type: 'button', class: 'dx-mb dx-tabsbtn', 'aria-expanded': String(tabsOpen), 'aria-controls': 'dx-tabs-panel', onclick: toggleTabs }, icon('layers'), ' Tabs');

    // ---- title, history, breadcrumb
    const rename = async () => {
      const name = titleIn.value.trim();
      if (readOnly || name === meta.name) { titleIn.value = meta.name; return; }
      if (!name || /[\/\\]/.test(name)) { toast('A name can’t be empty or contain a slash.', false); titleIn.value = meta.name; return; }
      const r = await api.call('drive.files.update', { id, name });
      if (r.ok) { meta = { ...meta, name }; document.title = `${name} · Docs`; toast('Renamed.'); } else { toast(r.message ?? 'Couldn’t rename.', false); titleIn.value = meta.name; }
    };
    titleIn.addEventListener('change', rename); titleIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); titleIn.blur(); } });
    async function openHistory() {
      const r = await api.call('drive.files.versions', { file: id });
      if (!r.ok) return toast('Couldn’t load the history.', false);
      const list = h('ul', { class: 'rows' }, ...r.data.map((x) => h('li', {}, h('div', {}, h('b', {}, `Version ${x.version}`, x.version === version ? ' · newest' : ''), h('div', { class: 'fine muted' }, new Date(x.created_at).toLocaleString(), x.note ? ` · ${x.note}` : '')),
        x.version === version || readOnly ? null : btn('Restore as new', () => restoreVersion(x.version, close), ''))));
      const close = drawer({ title: 'History', body: [h('p', { class: 'fine muted' }, 'Restoring never deletes anything: it saves the old document, with all its tabs, as a new version.'), list] });
    }
    async function restoreVersion(n, close) {
      if (currentBody() !== savedBody) { toast('Save or discard your current changes first.', false); return; }
      const old = await api.call('drive.files.version', { file: id, version: n });
      if (!old.ok) return toast('Couldn’t load that version.', false);
      const text = serialize(parseBody(old.data[0].body ?? ''));
      const r = await api.call('drive.files.versions.add', { id, body: text, expected: version, note: `Restored version ${n}` });
      if (!r.ok) return toast(r.status === 409 ? 'A newer version was saved. Reopen the history.' : 'Couldn’t restore.', false);
      version = r.data[0].current_version; useBody(text, new Date().toISOString()); close(); toast(`Restored version ${n} as version ${version}.`);
    }
    (async () => {
      let parts = [];
      if (opts.crumbs) parts = opts.crumbs(meta);
      else if (meta.project_id) { const p = await api.call('projects.get', { id: meta.project_id }); parts = [h('a', { href: '#/projects' }, 'Projects'), p.ok ? p.data[0].name : 'Project', 'Docs']; }
      else if (meta.client_id) parts = [h('a', { href: '#/clients' }, 'Clients'), h('a', { href: `#/clients/c/${meta.client_id}?tab=documents` }, ctx.clients?.get?.(meta.client_id) ?? 'Client'), 'Documents'];
      else parts = [h('a', { href: '#/drive' }, 'Drive'), meta.space === 'personal' ? 'Personal' : ctx.orgName];
      if (gone()) return; const anchors = parts.filter((x) => x?.tagName === 'A'); const last = anchors.at(-1);
      const where = parts.map((x) => (typeof x === 'string' ? x : x.textContent)).join(' / ');
      if (last) backA.href = last.getAttribute('href'); backA.setAttribute('aria-label', `Back to ${last?.textContent ?? 'Drive'}`); backA.title = `Back · ${where}`; titleIn.title = where;
    })();

    // ---- assemble
    function fitHeight() { if (gone() || !root.isConnected) return; const top = root.getBoundingClientRect().top + scrollY; root.style.height = `max(420px, calc(100dvh - ${Math.max(0, Math.round(top))}px))`; }
    const addTabBtn = readOnly ? null : h('button', { type: 'button', class: 'btn dx-addtab', onclick: () => newTab(null) }, icon('plus'), ' New tab');
    const tabsPanel = h('aside', { class: 'dx-tabs', id: 'dx-tabs-panel', 'aria-label': 'Document tabs' }, h('div', { class: 'dx-tabshead' }, h('h2', {}, 'Tabs'), addTabBtn), tabsEl);
    const bar = h('div', { class: 'docbar dx-top' }, backA, h('span', { class: 'dx-docico', 'aria-hidden': 'true' }, icon('doc')), titleIn, h('span', { class: 'dx-spacer' }), statusEl, btn('History', openHistory), saveBtn);
    const chrome = h('div', { class: 'dx-chrome' }, h('div', { class: 'dx-menurow' }, menubar, tabsToggle), toolbar, imgBar, findBar);
    const workspace = h('div', { class: 'dx-work' }, h('div', { class: 'dx-canvas' }, paper));
    const body = h('div', { class: `docbody dx-body${opts.side ? ' has-side' : ''}${tabsOpen ? '' : ' no-tabs'}` }, tabsPanel, workspace, opts.side ? opts.side(meta) : null);
    const statusbar = h('div', { class: 'dx-statusbar' }, counter, spaceEl, h('span', { class: 'dx-spacer' }), h('span', { class: 'docstat' }, pageInfo), h('label', { class: 'docstat' }, 'Zoom ', zoomSel));
    const banners = [];
    if (meta.archived_at) banners.push(notice('info', 'eye', [h('b', {}, 'Archived.'), ' This document is read only. ', btn('Restore', async () => { const r = await api.call('drive.files.restore', { id }); if (r.ok) { toast('Restored.'); load(); } else toast('You can’t restore this document.', false); }, 'link')]));
    else if (readOnly) banners.push(readOnlyNotice('You can read this document but not change it'));
    root.replaceChildren(...banners, bar, chrome, body, vPanel, statusbar, exitBtn);
    page.spellcheck = spell; outlineEl.hidden = !outlineOpen;
    const ro = new ResizeObserver(() => { fitToolbar(); fitHeight(); }); ro.observe(chrome); addEventListener('resize', fitHeight); document.fonts?.ready.then(() => { fitToolbar(); fitHeight(); });
    hdrEl.addEventListener('click', () => pageSetup('hdr')); ftrEl.addEventListener('click', () => pageSetup('ftr'));
    document.title = `${meta.name} · Docs`;
    ed.load(findTab(doc, activeTab).tab.blocks); applyPage(); checkpoint(); paintStatus(); paintTools(); if (readOnly) { status = 'readonly'; paintStatus(); }
    if (!readOnly && isEmpty({ blocks: ed.blocks() })) page.focus();
  }
  load();            // fills the section in when the document arrives; the screen shows its loading state meanwhile
  return root;
}
