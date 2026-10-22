// A saved-document session: the same save, conflict, history and unsaved-work behaviour for every Drive document the app edits in place
// (whiteboards now; Docs and Sheets use it as they are brought onto it). Every save is a new version checked against the version the editor
// started from, so two people never overwrite each other silently. Autosave is slow on purpose (each save is a stored version): idle for
// `idleMs`, at most once per `minMs`; Save is immediate; there is no save on blur, so the unsaved-changes guard in the app can ask first.
import { h, toast, dialog, drawer, btn } from '../ui.js';
import { dirty } from '../dirty.js';

export function createSession({ api, id, ctx, version, savedBody, savedAt, readOnly, getBody, setBody, label, onStatus = () => {}, idleMs = 8000, minMs = 30000, maxChars = 200000, restoreNote = (n) => `Restored version ${n}` }) {
  let status = readOnly ? 'readonly' : 'saved', timer = null, saving = false, lastAuto = 0, ro = readOnly, at = savedAt, ver = version, base = savedBody;
  const gone = () => !ctx.live();
  const warn = (e) => { if (status === 'dirty' || status === 'failed') { e.preventDefault(); e.returnValue = ''; } };
  const paint = () => onStatus({ status, savedAt: at, version: ver, readOnly: ro, saving });
  const clean = () => { dirty.clear(); window.removeEventListener('beforeunload', warn); };
  const self = {
    status: () => status, version: () => ver, readOnly: () => ro,
    isDirty: () => !ro && getBody() !== base,
    markChanged() {
      if (ro) return;
      if (getBody() !== base) { if (status !== 'dirty') { status = 'dirty'; dirty.set(label(), () => self.save({ manual: true })); window.addEventListener('beforeunload', warn); } schedule(idleMs); }
      else if (status === 'dirty') { status = 'saved'; clean(); }
      paint();
    },
    async save({ manual }) {
      if (ro || saving) return false;
      const body = getBody();
      if (body === base) { status = 'saved'; paint(); return true; }
      if (body.length > maxChars) { status = 'failed'; paint(); toast('This is too big to save. Remove some content first.', false); return false; }
      saving = true; status = 'saving'; paint();
      const r = await api.call('drive.files.versions.add', { id, body, expected: ver, ...(manual ? {} : { note: 'Autosave' }) });
      saving = false;
      if (r.ok) {
        ver = r.data[0].current_version; base = body; at = new Date().toISOString(); if (!manual) lastAuto = Date.now();
        status = getBody() !== base ? 'dirty' : 'saved'; if (status === 'saved') clean(); paint(); ctx.announce('Saved.'); return true;
      }
      if (r.status === 409) { status = 'failed'; paint(); conflict(); return false; }
      if (r.status === 404) { ro = true; status = 'readonly'; paint(); toast('You can read this but not change it, so your last edit was not saved.', false); return false; }
      status = 'failed'; paint(); toast(r.message ?? 'Couldn’t save. Try again.', false); return false;
    },
    async openHistory(canRestore = true) {
      const r = await api.call('drive.files.versions', { file: id });
      if (!r.ok) return toast('Couldn’t load the history.', false);
      let close = () => {};
      const list = h('ul', { class: 'rows' }, ...r.data.map((x) => h('li', {}, h('div', {}, h('b', {}, `Version ${x.version}`, x.version === ver ? ' · newest' : ''), h('div', { class: 'fine muted' }, new Date(x.created_at).toLocaleString(), x.note ? ` · ${x.note}` : '')),
        x.version === ver || ro || !canRestore ? null : btn('Restore as new', () => restore(x.version, () => close()), ''))));
      close = drawer({ title: 'History', body: [h('p', { class: 'fine muted' }, 'Restoring never deletes anything: it saves the old version as a new one.'), list] });
    },
    // the editor normalised what it opened (it may add fields) before the person did anything: that is not a change
    rebase() { if (status !== 'dirty' && !saving) base = getBody(); },
    destroy() { clearTimeout(timer); clean(); },
    // the content on screen (just replaced by the caller) is the new saved baseline; it may differ from the stored text only in how it is written
    reset({ version: v, savedAt: s }) { ver = v; base = getBody(); at = s ?? new Date().toISOString(); status = ro ? 'readonly' : 'saved'; clean(); paint(); },
  };
  function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(() => { if (gone()) return; const wait = lastAuto + minMs - Date.now(); if (wait > 0) schedule(wait); else self.save({ manual: false }); }, ms);
  }
  async function restore(n, close) {
    if (self.isDirty()) { toast('Save or discard your current changes first.', false); return; }
    const old = await api.call('drive.files.version', { file: id, version: n });
    if (!old.ok) return toast('Couldn’t load that version.', false);
    const body = old.data[0].body ?? '';
    const r = await api.call('drive.files.versions.add', { id, body, expected: ver, note: restoreNote(n) });
    if (!r.ok) return toast(r.status === 409 ? 'A newer version was saved. Reopen the history.' : 'Couldn’t restore.', false);
    setBody(body); self.reset({ version: r.data[0].current_version }); close(); toast(`Restored version ${n} as version ${ver}.`);
  }
  function conflict() {
    dialog({ title: 'Someone saved a newer version', body: [h('p', {}, 'While you were working, another version was saved. Nothing has been overwritten. Choose what happens to your changes.'), h('p', { class: 'fine muted' }, 'Both versions stay in History either way.')],
      actions: [
        { label: 'Save mine as the newest', cls: 'pri', on: async () => { const cur = await api.call('drive.files.get', { id }); if (!cur.ok) { toast('Couldn’t check the latest version. Try again.', false); return false; } ver = cur.data[0].current_version; await self.save({ manual: true }); } },
        { label: 'Load theirs, discard mine', on: async () => { const cur = await api.call('drive.files.version', { file: id }); if (!cur.ok) { toast('Couldn’t load it. Try again.', false); return false; } setBody(cur.data[0].body ?? ''); self.reset({ version: cur.data[0].version, savedAt: cur.data[0].created_at }); } },
        { label: 'Keep editing', focus: true },
      ] });
  }
  paint();
  return self;
}
