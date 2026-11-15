// Office › Documents, V8 (prototype office6.js `documents`, dialog `docsec`): the organization's handbook in sections. Each section is a folder in the
// shared Drive (office.sections.*); "Approved SOPs" also lists Drive's protected SOPs. Owners and admins manage sections; who can add documents is
// Drive's own rule (drive.file.upload), and an owner-protected section takes new documents from owners only. V4 search across the library stays.
import { h, put, icon, btn, dialog, toast, field, skeleton, errorState, emptyState } from '../ui.js';
import { plateOf } from '../registry.js';
import { openHref, driveHref } from '../modules/drive.js';
import { serialize, emptyDoc } from '../modules/docmodel.js';
import { saveCopy } from '../modules/mediaio.js';
import { MAX_FILE_BYTES } from '../modules/driveutil.js';

const DOC_MIME = 'application/vnd.l2f.doc+json'; const BOARD_MIME = 'application/vnd.excalidraw+json';
const DOC_TONES = ['#2B63F6', '#13A592', '#E8B820', '#FF8A6B', '#A898FF', '#5FDCCB'];
const ago = (iso) => { if (!iso) return ''; const d = Math.round((Date.now() - new Date(iso)) / 864e5); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 7 ? `${d} days ago` : d < 14 ? 'last week' : new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); };
const kindOf = (f) => (f.kind === 'document' ? (f.mime_type === BOARD_MIME ? 'Board' : 'Document') : /pdf/.test(f.mime_type ?? '') ? 'PDF' : /word|officedocument\.wordprocessing/.test(f.mime_type ?? '') ? 'Word' : /sheet|excel/.test(f.mime_type ?? '') ? 'Excel' : /^image\//.test(f.mime_type ?? '') ? 'Image' : 'File');
const hrefOf = (f) => openHref(f) ?? driveHref('shared', f.folder_id);
const docIc = (i) => h('span', { class: 'docic', style: `--c:${DOC_TONES[i % DOC_TONES.length]}` }, icon('doc'));
const ICON = (s) => (s.owner_protected ? 'sop' : /polic/i.test(s.name) ? 'shield' : /templ/i.test(s.name) ? 'copy' : 'folder');

export function documentsView({ api, ctx }) {
  const root = h('div', { class: 'v8p-office' }); const body = h('div', {}, skeleton(3));
  const canFiles = ctx.canAnywhere('drive.file.upload'); const isAdmin = ctx.isOwner || ctx.isAdmin === true;
  const q = h('input', { type: 'search', placeholder: 'Search documents', 'aria-label': 'Search documents', autocomplete: 'off' });
  const canAdd = (s) => canFiles && (!s.owner_protected || ctx.isOwner);

  const newDoc = (s) => { const name = field({ id: 'nd-name', label: 'Document name', value: 'Untitled document', maxlength: 200 });
    dialog({ title: `New document in ${s.name}`, body: name.el, actions: [{ label: 'Create', cls: 'primary', on: async () => {
      const nm = name.input.value.trim(); if (!nm || /[\/\\]/.test(nm)) return name.error('Use a name without slashes.');
      const r = await api.call('drive.files.create', { space: 'shared', ...(s.folder_id ? { folder: s.folder_id } : {}), name: nm, kind: 'document', mime_type: DOC_MIME, body: serialize(emptyDoc()) });
      if (!r.ok) { toast('Couldn’t create it here.', false); return false; } ctx.go(`#/doc/${r.data[0].id}`); } }, { label: 'Cancel' }] }); };
  const upload = async (s, files) => {
    let n = 0; for (const f of files) { if (f.size > MAX_FILE_BYTES) { toast(`${f.name} is too large.`, false); continue; }
      const r = await saveCopy(api, { space: 'shared', folder_id: s.folder_id }, f, f.type || 'application/octet-stream', f.name); if (r.ok) n++; else toast(r.message ?? `Couldn’t upload ${f.name}.`, false); }
    if (n) { toast(`${n} file${n > 1 ? 's' : ''} uploaded to ${s.name}.`); load(); }
  };
  const pickFiles = (s) => { const i = h('input', { type: 'file', multiple: true, hidden: true, accept: '.doc,.docx,.pdf,.xls,.xlsx,.csv,.ppt,.pptx,.txt,image/*', onchange: () => upload(s, [...i.files]) }); document.body.append(i); i.click(); setTimeout(() => i.remove(), 60000); };
  const sectionDialog = (s = null) => {
    const name = field({ id: 'ds-name', label: 'Section name', value: s?.name ?? '', maxlength: 80, placeholder: 'e.g. Training' });
    const vis = h('select', { id: 'ds-vis' }, h('option', { value: 'everyone' }, `Everyone in ${ctx.orgName}`), h('option', { value: 'admins' }, 'Admins only')); vis.value = s?.visibility ?? 'everyone';
    const prot = h('input', { type: 'checkbox', ...(s?.owner_protected ? { checked: true } : {}), ...(ctx.isOwner ? {} : { disabled: true }) });
    dialog({ title: s ? 'Section settings' : 'New document section', body: [name.el, h('div', { class: 'fld' }, h('label', { for: 'ds-vis' }, 'Who can see it'), vis), h('label', { class: 'chk' }, prot, ' Owner protected (only owners edit)'),
      s ? h('p', { class: 'fine muted' }, 'Renaming also renames its folder in Drive.') : null],
    actions: [{ label: s ? 'Save' : 'Create section', cls: 'primary', on: async () => {
      const nm = name.input.value.trim(); if (!nm) return name.error('Give the section a name.');
      const r = await api.call(s ? 'office.sections.update' : 'office.sections.create', { ...(s ? { id: s.id } : {}), name: nm, visibility: vis.value, owner_protected: prot.checked });
      if (!r.ok || !r.data?.[0]) { toast(r.status === 409 ? 'A folder with that name already exists in Drive.' : 'Couldn’t save the section.', false); return false; }
      toast(s ? 'Section saved.' : 'Section created.'); load(); } },
    ...(s ? [{ label: 'Delete section', cls: 'dng', on: () => { dialog({ title: `Delete “${s.name}”?`, body: h('p', {}, 'The section leaves Documents. Its folder and every file stay in Drive.'), actions: [{ label: 'Delete section', cls: 'dng', on: async () => {
      const r = await api.call('office.sections.delete', { id: s.id }); if (!r.ok || !r.data?.[0]) { toast('Couldn’t delete the section.', false); return false; } toast('Section deleted. Its files are still in Drive.'); load(); } }, { label: 'Cancel' }] }); } }] : []),
    { label: 'Cancel' }] });
  };
  const sectionEl = async (s, si) => {
    const [files, sops] = await Promise.all([s.folder_id ? api.call('drive.files.list', { space: 'shared', folder: s.folder_id }) : { ok: true, data: [] }, s.owner_protected ? api.call('drive.sops.list', {}) : null]);
    const list = [...(sops?.ok ? sops.data : []), ...(files.ok ? files.data : [])].filter((f, i, a) => a.findIndex((x) => x.id === f.id) === i);
    const drop = canAdd(s) ? h('button', { class: 'docc drop', type: 'button', onclick: () => pickFiles(s) }, icon('upload'), h('span', {}, 'Drop Word or PDF files')) : null;
    if (drop) { drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('on'); }); drop.addEventListener('dragleave', () => drop.classList.remove('on'));
      drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('on'); upload(s, [...(e.dataTransfer?.files ?? [])]); }); }
    return h('section', { class: 'card6 docsec' }, h('header', {}, h('h2', {}, icon(ICON(s)), ' ', s.name), h('span', { class: 'cnt' }, String(list.length)), s.visibility === 'admins' ? h('span', { class: 'pill', style: 'height:20px' }, 'Admins only') : null, h('span', { class: 'grow' }),
      canAdd(s) ? btn([icon('plus'), 'New document'], () => newDoc(s), 'quiet sm') : null, canAdd(s) ? btn([icon('upload'), 'Upload'], () => pickFiles(s), 'quiet sm') : null,
      isAdmin ? h('button', { class: 'iconbtn xs', type: 'button', 'aria-label': `${s.name} section settings`, onclick: () => sectionDialog(s) }, icon('more')) : null),
    h('div', { class: 'docrow' }, ...list.map((f, j) => h('a', { class: 'docc', href: hrefOf(f) }, docIc(si * 3 + j), h('span', {}, h('b', {}, f.name), h('small', {}, `${f.protected_sop ? 'Owner protected · ' : ''}${kindOf(f)} · updated ${ago(f.updated_at)}`)))),
      !list.length && !drop ? h('p', { class: 'hint', style: 'padding:6px 2px' }, 'Nothing here yet.') : null, drop));
  };
  async function load() {
    const term = q.value.trim();
    if (term) {   // search the whole library (V4)
      const r = await api.call('drive.files.list', { space: 'shared', anywhere: true, q: term }); if (!ctx.live()) return;
      if (!r.ok) return put(body, errorState(load));
      return put(body, r.data.length ? h('section', { class: 'card6 docsec' }, h('header', {}, h('h2', {}, icon('search'), ` Results for “${term}”`), h('span', { class: 'cnt' }, String(r.data.length))),
        h('div', { class: 'docrow' }, ...r.data.map((f, j) => h('a', { class: 'docc', href: hrefOf(f) }, docIc(j), h('span', {}, h('b', {}, f.name), h('small', {}, `${kindOf(f)} · updated ${ago(f.updated_at)}`))))))
        : emptyState({ title: 'No document matches', body: 'Try another word.', ic: 'doc' }));
    }
    const r = await api.call('office.sections.list', {}); if (!ctx.live()) return;
    if (!r.ok) return put(body, errorState(load));
    if (!r.data.length) return put(body, emptyState({ title: 'No sections yet', body: isAdmin ? 'Make a section for anything your team needs to find.' : 'An owner or admin sets up the sections.', ic: 'doc', action: isAdmin ? btn('New section', () => sectionDialog(), 'primary') : null }));
    const els = await Promise.all(r.data.map(sectionEl));
    // V4: library documents that are in no section stay findable here
    const loose = await api.call('drive.files.list', { space: 'shared', kind: 'document' }); if (!ctx.live()) return;
    const other = (loose.ok ? loose.data : []).filter((f) => !f.folder_id);
    if (other.length) els.push(h('section', { class: 'card6 docsec' }, h('header', {}, h('h2', {}, icon('doc'), ' Other documents'), h('span', { class: 'cnt' }, String(other.length)), h('span', { class: 'grow' }),
      canFiles ? btn([icon('plus'), 'New document'], () => newDoc({ name: 'the library', folder_id: null }), 'quiet sm') : null),
      h('div', { class: 'docrow' }, ...other.map((f, j) => h('a', { class: 'docc', href: hrefOf(f) }, docIc(j), h('span', {}, h('b', {}, f.name), h('small', {}, `${f.protected_sop ? 'Owner protected · ' : ''}${kindOf(f)} · updated ${ago(f.updated_at)}`)))))));
    put(body, ...els);
  }
  let t = null; q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 200); });
  const drive = h('a', { class: 'btn ghost sm', href: '#/drive' }, plateOf({ id: 'drive', plate: ctx.catalog?.find?.((a) => a.key === 'drive' || a.id === 'drive')?.plate }, 18), 'Open Drive');
  put(root, h('div', { class: 'ph6' }, h('div', {}, h('h1', { class: 't1', 'data-page-title': true }, 'Documents'), h('p', { class: 'hint' }, `${ctx.orgName}’s handbook. Make a section for anything your team needs to find.`)),
    h('div', { class: 'acts' }, drive, isAdmin ? btn('New section', () => sectionDialog(), 'primary sm') : null)),
  h('div', { class: 'toolbar' }, h('label', { class: 'inp grow' }, icon('search'), q)), body);
  load(); return root;
}
