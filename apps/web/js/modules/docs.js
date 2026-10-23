// Docs: the shared editor for first-party documents (Drive documents of kind "document"). One module, mounted wherever a document opens
// (Drive, Office > Documents, a project's Docs, a client's Documents); the document's context (project, client, shared Drive) comes from the
// record itself, so the breadcrumb and the permissions follow it. Storage is the one Drive path: each save is a new version (history,
// restore, audit), checked against the version the editor started from so two people never overwrite each other silently.
// Text format and its safety rules: docmodel.js (JSON, never HTML; links filtered). The editing surface is a contenteditable region driven
// by execCommand (deprecated but universal); every edit is read back through an allow-list into the model before anything is stored.
import { h, icon, toast, dialog, drawer, btn, notice, skeleton, errorState, noAccessState, readOnlyNotice, chip, field } from '../ui.js';
import { dirty } from '../dirty.js';
import { parseBody, serialize, normalize, outline, wordCount, sizeOf, safeHref, MAX_CHARS, sameDoc, isEmpty } from './docmodel.js';

export const BOARD_MIME = 'application/vnd.excalidraw+json';
const AUTOSAVE_IDLE_MS = 8000, AUTOSAVE_MIN_MS = 30000;      // every save is a version, so autosave is slow on purpose; Save and leaving are immediate
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const timeOf = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// ---- model <-> DOM
function inline(run) {
  let node = document.createTextNode('');
  const parts = String(run.x).split('\n'); const frag = document.createDocumentFragment();
  parts.forEach((t, i) => { if (i) frag.append(document.createElement('br')); if (t) frag.append(document.createTextNode(t)); });
  node = frag;
  const wrap = (tag, attrs) => { const el = document.createElement(tag); for (const [k, v] of Object.entries(attrs ?? {})) el.setAttribute(k, v); el.append(node); node = el; };
  if (run.b) wrap('strong'); if (run.i) wrap('em'); if (run.u) wrap('u'); if (run.s) wrap('s');
  if (run.a) wrap('a', { href: run.a, target: '_blank', rel: 'noopener noreferrer' });
  return node;
}
const fill = (el, runs) => { if (!runs.length) el.append(document.createElement('br')); for (const r of runs) el.append(inline(r)); return el; };
export function renderDoc(root, doc) {
  root.replaceChildren(...normalize(doc).blocks.map((b) => {
    if (b.t === 'hr') return document.createElement('hr');
    if (b.t === 'ul' || b.t === 'ol') { const l = document.createElement(b.t); for (const it of b.items) l.append(fill(document.createElement('li'), it)); return l; }
    return fill(document.createElement(b.t === 'quote' ? 'blockquote' : b.t), b.c);
  }));
}
const STYLE = { B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u', S: 's', STRIKE: 's', DEL: 's' };
function readRuns(node, style, out) {
  for (const n of node.childNodes) {
    if (n.nodeType === 3) { if (n.data) out.push({ x: n.data, ...style }); }
    else if (n.nodeType === 1) {
      if (n.tagName === 'BR') { out.push({ x: '\n', ...style }); continue; }
      const st = { ...style }; if (STYLE[n.tagName]) st[STYLE[n.tagName]] = 1;
      if (n.tagName === 'A') { const a = safeHref(n.getAttribute('href')); if (a) st.a = a; }
      if (/^(UL|OL|P|DIV|H[1-6]|BLOCKQUOTE|LI)$/.test(n.tagName)) { if (out.length && !String(out.at(-1).x).endsWith('\n')) out.push({ x: '\n' }); }
      readRuns(n, st, out);
    }
  }
  return out;
}
const blockRuns = (el) => { const r = readRuns(el, {}, []); const last = el.lastChild; if (last && last.nodeType === 1 && last.tagName === 'BR' && r.at(-1)?.x === '\n') r.pop(); return r; };
export function readDoc(root) {
  const blocks = [];
  for (const n of root.childNodes) {
    if (n.nodeType === 3) { if (n.data.trim()) blocks.push({ t: 'p', c: [{ x: n.data }] }); continue; }
    if (n.nodeType !== 1) continue;
    const tag = n.tagName;
    if (tag === 'HR') blocks.push({ t: 'hr' });
    else if (tag === 'UL' || tag === 'OL') blocks.push({ t: tag.toLowerCase(), items: [...n.children].filter((c) => c.tagName === 'LI').map(blockRuns) });
    else if (/^H[1-6]$/.test(tag)) blocks.push({ t: `h${Math.min(3, Number(tag[1]))}`, c: blockRuns(n) });
    else if (tag === 'BLOCKQUOTE') blocks.push({ t: 'quote', c: blockRuns(n) });
    else blocks.push({ t: 'p', c: blockRuns(n) });
  }
  return normalize({ blocks });
}

// ---- the view
export function docView({ api, id, ctx }) {
  const root = h('section', { class: 'docs' }, skeleton(4));
  const load = async () => {
    const f = await api.call('drive.files.get', { id });
    if (!ctx.live()) return;
    if (!f.ok) { root.replaceChildren(f.status === 404 ? noAccessState({ action: h('a', { class: 'btn', href: '#/launcher' }, 'Back to the Launcher') }) : errorState(() => { root.replaceChildren(skeleton(4)); load(); })); return; }
    const file = f.data[0];
    if (file.kind !== 'document') { root.replaceChildren(h('div', { class: 'empty', role: 'status' }, icon('doc'), h('h2', { 'data-page-title': true }, file.name), h('p', { class: 'muted' }, 'This is a stored file, not a document, so it has no editor. Download it from Drive.'))); return; }
    if (file.mime_type === BOARD_MIME) { root.replaceChildren(h('div', { class: 'empty', role: 'status' }, icon('wb'), h('h2', { 'data-page-title': true }, file.name), h('p', { class: 'muted' }, 'This is a whiteboard. It opens in the Whiteboard editor.'), h('a', { class: 'btn pri', href: `#/board/${file.id}` }, 'Open the whiteboard'))); return; }
    const v = await api.call('drive.files.version', { file: id });
    if (!ctx.live()) return;
    if (!v.ok) { root.replaceChildren(errorState(() => { root.replaceChildren(skeleton(4)); load(); })); return; }
    mount(file, v.data[0]);
  };

  function mount(file, ver) {
    let meta = file, version = ver.version, savedBody = serialize(parseBody(ver.body ?? '')), status = 'saved', savedAt = ver.created_at, lastAuto = 0, timer = null, saving = false, readOnly = Boolean(file.archived_at) || !ctx.can('drive.file.upload', file.client_id);
    const page = h('div', { class: 'docpage', contenteditable: readOnly ? 'false' : 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Document text', spellcheck: 'true' });
    renderDoc(page, parseBody(ver.body ?? ''));
    const statusEl = h('span', { class: 'docstate', role: 'status', 'aria-live': 'polite' });
    const outlineEl = h('nav', { class: 'docoutline', 'aria-label': 'Outline' });
    const counter = h('span', { class: 'docstat muted' });
    const saveBtn = btn('Save', () => save({ manual: true }), 'pri');
    const titleIn = h('input', { class: 'doctitle', value: meta.name, 'aria-label': 'Document name', maxlength: '200', ...(readOnly ? { readonly: true } : {}) });
    const crumb = h('nav', { class: 'crumbs fine', 'aria-label': 'Where this document lives' });
    const bar = h('div', { class: 'docbar' });
    const tb = h('div', { class: 'doctools', role: 'toolbar', 'aria-label': 'Formatting' });

    const gone = () => !root.isConnected;
    const model = () => readDoc(page);
    const isDirty = () => !sameDoc(model(), parseBody(savedBody)) || serialize(model()) !== savedBody;
    const paintStatus = () => {
      const t = { saved: `Saved ${timeOf(savedAt)}`, dirty: 'Unsaved changes', saving: 'Saving…', failed: 'Couldn’t save. Your changes are still here.', readonly: 'Read only' }[status];
      statusEl.replaceChildren(...[h('span', { class: `dot ${status}` }), t, status === 'failed' ? btn('Retry', () => save({ manual: true }), 'link') : null].filter(Boolean));
      saveBtn.disabled = readOnly || status === 'saved' || saving;
    };
    const paintOutline = () => {
      const o = outline(model());
      outlineEl.replaceChildren(h('h2', {}, 'Outline'), o.length ? h('ul', {}, ...o.map((x) => h('li', { class: `l${x.level}` }, h('button', { type: 'button', class: 'lnk', onclick: () => { const el = page.children[x.index]; el?.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' }); } }, x.text)))) : h('p', { class: 'fine muted' }, 'Headings you add appear here.'));
      const words = wordCount(model()); const size = sizeOf(model());
      counter.textContent = `${words} word${words === 1 ? '' : 's'}${size > MAX_CHARS * 0.9 ? ` · ${Math.round(size / 1000)}k of ${MAX_CHARS / 1000}k characters` : ''}`;
      counter.classList.toggle('warn', size > MAX_CHARS * 0.9);
    };
    const schedule = () => {
      clearTimeout(timer);
      if (readOnly) return;
      timer = setTimeout(() => { if (gone()) return; const wait = lastAuto + AUTOSAVE_MIN_MS - Date.now(); if (wait > 0) { schedule2(wait); return; } save({ manual: false }); }, AUTOSAVE_IDLE_MS);
    };
    const schedule2 = (ms) => { clearTimeout(timer); timer = setTimeout(() => { if (!gone()) save({ manual: false }); }, ms); };
    const markDirty = () => {
      if (gone()) return;
      if (isDirty()) { if (status !== 'dirty') { status = 'dirty'; dirty.set(meta.name, () => save({ manual: true })); window.addEventListener('beforeunload', warn); } schedule(); }
      else if (status === 'dirty') { status = 'saved'; dirty.clear(); window.removeEventListener('beforeunload', warn); }
      paintStatus(); paintOutline();
    };
    const warn = (e) => { if (status === 'dirty' || status === 'failed') { e.preventDefault(); e.returnValue = ''; } };
    async function save({ manual }) {
      if (readOnly || saving) return false;
      const d = model(); const body = serialize(d);
      if (body === savedBody) { status = 'saved'; paintStatus(); return true; }
      if (body.length > MAX_CHARS) { status = 'failed'; paintStatus(); toast('This document is too long to save. Shorten it first.', false); return false; }
      saving = true; status = 'saving'; paintStatus();
      const r = await api.call('drive.files.versions.add', { id, body, expected: version, ...(manual ? {} : { note: 'Autosave' }) });
      saving = false;
      if (gone()) return false;
      if (r.ok) {
        version = r.data[0].current_version; savedBody = body; savedAt = new Date().toISOString(); if (!manual) lastAuto = Date.now();
        status = isDirty() ? 'dirty' : 'saved'; if (status === 'saved') { dirty.clear(); window.removeEventListener('beforeunload', warn); }
        paintStatus(); ctx.announce('Saved.'); return true;
      }
      if (r.status === 409) { status = 'failed'; paintStatus(); conflict(); return false; }
      if (r.status === 404) { status = 'readonly'; readOnly = true; page.setAttribute('contenteditable', 'false'); paintStatus(); toast('You can read this document but not change it, so your last edit was not saved.', false); lockTools(); return false; }
      status = 'failed'; paintStatus(); toast(r.message ?? 'Couldn’t save. Try again.', false); return false;
    }
    function conflict() {
      dialog({ title: 'Someone saved a newer version', body: [h('p', {}, 'While you were writing, another version was saved. Nothing has been overwritten. Choose what happens to your changes.'), h('p', { class: 'fine muted' }, 'Both versions stay in History either way.')],
        actions: [
          { label: 'Save mine as the newest', cls: 'pri', on: async (close) => { const cur = await api.call('drive.files.get', { id }); if (!cur.ok) { toast('Couldn’t check the latest version. Try again.', false); return false; } version = cur.data[0].current_version; await save({ manual: true }); },  },
          { label: 'Load theirs, discard mine', on: async () => { const cur = await api.call('drive.files.version', { file: id }); if (!cur.ok) { toast('Couldn’t load it. Try again.', false); return false; } version = cur.data[0].version; savedBody = serialize(parseBody(cur.data[0].body ?? '')); renderDoc(page, parseBody(cur.data[0].body ?? '')); status = 'saved'; savedAt = cur.data[0].created_at; dirty.clear(); paintStatus(); paintOutline(); } },
          { label: 'Keep editing', focus: true },
        ] });
    }

    // ---- toolbar
    // Headings are bold by design: toggling bold there makes the browser write an inline style (blocked by our policy and pointless), so Bold is off inside headings
    const inHeading = () => { const n = getSelection()?.anchorNode; const el = n?.nodeType === 1 ? n : n?.parentElement; return Boolean(el && page.contains(el) && el.closest('h1,h2,h3')); };
    const exec = (cmd, arg) => { if (cmd === 'bold' && inHeading()) return; page.focus(); document.execCommand('styleWithCSS', false, false); document.execCommand(cmd, false, arg); markDirty(); syncTools(); };
    const tbtn = (label, text, cmd, arg, cls = '') => h('button', { type: 'button', class: `tb ${cls}`.trim(), 'aria-label': label, title: label, 'data-cmd': cmd, onmousedown: (e) => e.preventDefault(), onclick: () => exec(cmd, arg) }, text);
    const block = h('select', { class: 'tbsel', 'aria-label': 'Text style', onchange: () => { exec('formatBlock', block.value); } },
      ...[['p', 'Paragraph'], ['h1', 'Heading 1'], ['h2', 'Heading 2'], ['h3', 'Heading 3'], ['blockquote', 'Quote']].map(([v, t]) => h('option', { value: v }, t)));
    const linkBtn = h('button', { type: 'button', class: 'tb', 'aria-label': 'Link', title: 'Link', 'data-cmd': 'link', onmousedown: (e) => e.preventDefault(), onclick: () => {
      const sel = getSelection(); const range = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
      const f = field({ id: 'doc-link', label: 'Web address', value: 'https://', hint: 'Only web (https, http) and e-mail (mailto:) links are kept.' });
      dialog({ title: 'Add a link', body: f.el, actions: [{ label: 'Add link', cls: 'pri', on: () => { const href = safeHref(f.input.value); if (!href) return f.error('Enter a web address that starts with https:// or http://, or a mailto: address.'); if (range) { sel.removeAllRanges(); sel.addRange(range); } exec('createLink', href); }, }, { label: 'Remove link', on: () => { if (range) { sel.removeAllRanges(); sel.addRange(range); } exec('unlink'); } }, { label: 'Cancel' }] });
    } }, icon('ext'));
    tb.append(block, tbtn('Bold', 'B', 'bold', null, 'b'), tbtn('Italic', 'I', 'italic', null, 'i'), tbtn('Underline', 'U', 'underline', null, 'u'), tbtn('Strikethrough', 'S', 'strikeThrough', null, 's'), linkBtn,
      tbtn('Bulleted list', '•', 'insertUnorderedList'), tbtn('Numbered list', '1.', 'insertOrderedList'), tbtn('Divider', '—', 'insertHorizontalRule'), tbtn('Undo', '↶', 'undo'), tbtn('Redo', '↷', 'redo'));
    const lockTools = () => { for (const c of tb.querySelectorAll('button,select')) c.disabled = true; titleIn.readOnly = true; };
    function syncTools() {
      if (gone()) return;
      const bold = tb.querySelector('[data-cmd=bold]'); if (bold && !readOnly) { bold.disabled = inHeading(); bold.title = bold.disabled ? 'Headings are already bold' : 'Bold'; }
      for (const b of tb.querySelectorAll('[data-cmd]')) { const c = b.dataset.cmd; if (['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList'].includes(c)) { let on = false; try { on = document.queryCommandState(c); } catch { /* not supported */ } b.setAttribute('aria-pressed', String(on)); } }
      let fb = 'p'; try { fb = String(document.queryCommandValue('formatBlock') || 'p').toLowerCase().replace(/[<>]/g, ''); } catch { /* none */ }
      block.value = ['h1', 'h2', 'h3', 'blockquote'].includes(fb) ? fb : 'p';
    }
    document.addEventListener('selectionchange', function f() { if (gone()) document.removeEventListener('selectionchange', f); else if (page.contains(getSelection()?.anchorNode)) syncTools(); });
    if (readOnly) lockTools();

    // ---- editing events
    page.addEventListener('input', markDirty);
    page.addEventListener('paste', (e) => { e.preventDefault(); const t = e.clipboardData?.getData('text/plain') ?? ''; if (t) { document.execCommand('insertText', false, t); markDirty(); } });   // formatted paste is plain text: foreign markup never enters
    page.addEventListener('drop', (e) => e.preventDefault());
    page.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save({ manual: true }); } });
    page.addEventListener('click', (e) => { const a = e.target.closest?.('a'); if (a && (e.ctrlKey || e.metaKey || readOnly)) { window.open(a.href, '_blank', 'noopener,noreferrer'); } });

    // ---- title, history, breadcrumb
    const rename = async () => {
      const name = titleIn.value.trim();
      if (readOnly || name === meta.name) { titleIn.value = meta.name; return; }
      if (!name || /[\/\\]/.test(name)) { toast('A name can’t be empty or contain a slash.', false); titleIn.value = meta.name; return; }
      const r = await api.call('drive.files.update', { id, name });
      if (r.ok) { meta = { ...meta, name }; document.title = `${name} · Docs`; toast('Renamed.'); } else { toast(r.message ?? 'Couldn’t rename.', false); titleIn.value = meta.name; }
    };
    titleIn.addEventListener('change', rename); titleIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); titleIn.blur(); } });
    const openHistory = async () => {
      const r = await api.call('drive.files.versions', { file: id });
      if (!r.ok) return toast('Couldn’t load the history.', false);
      const list = h('ul', { class: 'rows' }, ...r.data.map((x) => h('li', {}, h('div', {}, h('b', {}, `Version ${x.version}`, x.version === version ? ' · newest' : ''), h('div', { class: 'fine muted' }, new Date(x.created_at).toLocaleString(), x.note ? ` · ${x.note}` : '')),
        x.version === version || readOnly ? null : btn('Restore as new', () => restore(x.version, close), ''))));
      const close = drawer({ title: 'History', body: [h('p', { class: 'fine muted' }, 'Restoring never deletes anything: it saves the old text as a new version.'), list] });
    };
    const restore = async (n, close) => {
      if (isDirty()) { toast('Save or discard your current changes first.', false); return; }
      const old = await api.call('drive.files.version', { file: id, version: n });
      if (!old.ok) return toast('Couldn’t load that version.', false);
      const r = await api.call('drive.files.versions.add', { id, body: serialize(parseBody(old.data[0].body ?? '')), expected: version, note: `Restored version ${n}` });
      if (!r.ok) return toast(r.status === 409 ? 'A newer version was saved. Reopen the history.' : 'Couldn’t restore.', false);
      version = r.data[0].current_version; savedBody = serialize(parseBody(old.data[0].body ?? '')); renderDoc(page, parseBody(old.data[0].body ?? '')); savedAt = new Date().toISOString(); status = 'saved'; paintStatus(); paintOutline(); close(); toast(`Restored version ${n} as version ${version}.`);
    };
    (async () => {
      let parts = [];
      if (meta.project_id) { const p = await api.call('projects.get', { id: meta.project_id }); parts = [h('a', { href: '#/projects' }, 'Projects'), p.ok ? p.data[0].name : 'Project', 'Docs']; }
      else if (meta.client_id) parts = [h('a', { href: '#/clients' }, 'Clients'), h('a', { href: `#/clients/c/${meta.client_id}?tab=documents` }, ctx.clients?.get?.(meta.client_id) ?? 'Client'), 'Documents'];
      else parts = [h('a', { href: '#/app/drive' }, 'Drive'), meta.space === 'personal' ? 'Personal' : ctx.orgName];
      if (gone()) return; crumb.replaceChildren(...parts.flatMap((x, i) => (i ? [h('span', { 'aria-hidden': 'true' }, ' / '), x] : [x])));
    })();

    bar.append(crumb, h('div', { class: 'docrow' }, titleIn, h('div', { class: 'docacts' }, statusEl, counter, btn('History', openHistory), saveBtn)));
    const banners = [];
    if (meta.archived_at) banners.push(notice('info', 'eye', [h('b', {}, 'Archived.'), ' This document is read only. ', btn('Restore', async () => { const r = await api.call('drive.files.restore', { id }); if (r.ok) { toast('Restored.'); load(); } else toast('You can’t restore this document.', false); }, 'link')]));
    else if (readOnly) banners.push(readOnlyNotice('You can read this document but not change it'));
    root.replaceChildren(...banners, bar, tb, h('div', { class: 'docbody' }, h('details', { class: 'docoutline-wrap', open: window.innerWidth >= 900 }, h('summary', {}, 'Outline'), outlineEl), h('article', { class: 'docsheet' }, page)));
    document.title = `${meta.name} · Docs`;
    paintStatus(); paintOutline(); if (readOnly) { status = 'readonly'; paintStatus(); }
    if (!readOnly && isEmpty(model())) page.focus();
  }
  load();            // fills the section in when the document arrives; the screen shows its loading state meanwhile
  return root;
}
