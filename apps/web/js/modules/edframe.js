// The V8 editor frame (05_DRIVE "Editor frame", prototype drive6.js edFrame): one 52 px top bar — Back, Apps, type tile, name edited in place with its
// location, star, save state, presence, History, Share — then the 46 px menu + toolbar row, the body (left panel · canvas · right panel) and the status bar.
// No rail, no app sidebar, no second header (the shell's editor mode, shell.js `__editor`). Used by Slides; Docs, Sheets, Image and PDF move onto it.
import { h, icon, toast } from '../ui.js';
import { menuBar } from './edchrome.js';

const TILE = { doc: 'DOC', sheet: 'XLS', slides: 'PPT', image: 'IMG', pdf: 'PDF' };
export const backHrefFor = (f) => (f.project_id ? '#/projects' : f.client_id ? `#/clients/c/${f.client_id}` : f.space === 'personal' ? `#/drive/personal${f.folder_id ? `/f/${f.folder_id}` : ''}` : f.folder_id ? `#/drive/f/${f.folder_id}` : '#/drive/home');
const where = (f, orgName) => (f.client_id ? 'Client files' : f.space === 'personal' ? 'Personal' : `${orgName} Library`);
const initials = (n) => String(n ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || '?';

/**
 * edFrame({ api, ctx, file, type, menus, tools, body, status, readOnly, onRename, onHistory, onShare, actions }) -> { root, setSave(text, kind), setStatus(...nodes), destroy() }
 * root carries __editor and __appsSlot for the shell. Presence is real (drive.presence.beat every 20 s); with nobody else there it says "Last edited by …".
 */
export function edFrame({ api, ctx, file, type, menus, tools, body, status = [], readOnly = false, onRename, onHistory, onShare, actions = [], appsEl }) {
  const apps = appsEl ?? h('span', { class: 'r-wrap' });   // the shell fills it with the app switcher (pass the one the page already handed to the shell)
  const name = h('input', { value: file.name, 'aria-label': 'File name', maxlength: '200', spellcheck: 'false', ...(readOnly ? { readonly: true } : {}) });
  let current = file.name; let renaming = false;
  const commit = async () => {
    const v = name.value.trim(); if (readOnly || v === current || renaming) { name.value = current; return; }
    if (!v || /[\/\\]/.test(v)) { toast('A name can’t be empty or contain a slash.', false); name.value = current; return; }
    renaming = true; try { const ok = await onRename?.(v); if (ok !== false) current = v; else name.value = current; } finally { renaming = false; }
  };
  name.addEventListener('change', commit); name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); name.blur(); } else if (e.key === 'Escape') { name.value = current; name.blur(); } });
  let starred = false;
  const star = h('button', { type: 'button', class: 'iconbtn xs', 'aria-label': 'Star', 'aria-pressed': 'false', title: 'Star', onclick: async () => { const on = !starred; const r = await api.call('drive.stars.set', { file: file.id, on }); if (r.ok) { starred = on; paintStar(); } else toast('Couldn’t change the star.', false); } }, icon('star'));
  const paintStar = () => { star.setAttribute('aria-pressed', String(starred)); star.classList.toggle('on', starred); star.style.color = starred ? '#E6A700' : ''; };
  api.call('drive.stars.list', {}).then((r) => { if (r.ok) { starred = r.data.some((x) => x.file_id === file.id); paintStar(); } });
  const save = h('span', { class: 'savest', role: 'status', 'aria-live': 'polite' }, h('i'), 'Saved');
  const presence = h('span', { class: 'presence' });
  const top = h('header', { class: 'edx-top' },
    h('a', { class: 'iconbtn sm', href: backHrefFor(file), 'aria-label': 'Back to Drive', title: 'Back to Drive' }, icon('right', 'edx-flip')), apps,
    h('span', { class: `ft ${type} edx-ic`, 'aria-hidden': 'true' }, TILE[type]), h('div', { class: 'edx-name' }, name, h('small', {}, where(file, ctx.orgName))), star, save, h('span', { class: 'grow' }), presence,
    onHistory ? h('button', { type: 'button', class: 'btn quiet sm', onclick: onHistory }, icon('hist'), 'History') : null, ...actions,
    onShare ? h('button', { type: 'button', class: 'btn primary sm', onclick: onShare }, icon('share'), 'Share') : null);
  const mb = menuBar(menus, { isLive: () => root.isConnected });
  const bar = h('div', { class: 'edx-bar' }, h('nav', { class: 'menus' }, mb.el), h('span', { class: 'vs' }), h('div', { class: 'tools', role: 'toolbar', 'aria-label': 'Tools' }, ...tools));
  const statusEl = h('footer', { class: 'edx-status' }, ...status);
  const edx = h('div', { class: `edx ed-${type}` }, top, bar, h('div', { class: 'edx-body' }, ...body), statusEl);
  const root = h('section', { class: 'v8p-ed' }, edx); root.__editor = true; root.__appsSlot = apps;
  // presence: a real heartbeat while the page is open; "Last edited by" when nobody else is here (D5)
  let beat = null; let last = null;
  const paintPresence = (others) => {
    if (others.length) { presence.replaceChildren(...others.slice(0, 3).map((p) => h('span', { class: 'avatar', title: `${p.name} is ${p.mode}`, style: 'width:26px;height:26px;font-size:10px' }, initials(p.name))), h('small', {}, `${others[0].name.split(' ')[0]} is ${others[0].mode}${others.length > 1 ? ` · +${others.length - 1}` : ''}`)); return; }
    presence.replaceChildren(last ? h('small', {}, `Last edited by ${last.name}`) : '');
  };
  const pulse = async () => { if (!root.isConnected) { clearInterval(beat); return; } if (document.hidden) return; const r = await api.call('drive.presence.beat', { file: file.id, mode: readOnly ? 'viewing' : 'editing' }); if (r.ok) paintPresence(r.data); };
  api.call('drive.files.lastEdit', { file: file.id }).then((r) => { if (r.ok && r.data[0]) { last = r.data[0]; if (!presence.childNodes.length) paintPresence([]); } });
  pulse(); beat = setInterval(pulse, 20000);
  return {
    root, menuBar: mb, nameInput: name,
    setSave(text, kind = 'saved') { save.replaceChildren(h('i'), text); save.dataset.k = kind; },
    setStatus(...nodes) { statusEl.replaceChildren(...nodes); },
    destroy() { clearInterval(beat); api.call('drive.presence.beat', { file: file.id, leave: true }); mb.destroy?.(); },
  };
}
