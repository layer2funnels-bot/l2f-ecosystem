// Image and PDF editors (V8 05_DRIVE, 03 §5): a file keeps its ORIGINAL upload and its latest edit. "Reset to original" (confirmation, logged) makes the
// original the newest version again — the same stored bytes, so it is byte-identical. "Edited | Original" shows the upload next to the work.
import { h, icon, toast, dialog } from '../ui.js';

let busy = false;
/** Confirms, resets on the server, then hands the original's bytes and the new version number to onDone(blob, version). */
export function resetToOriginal({ api, file, version, isDirty = () => false, onDone }) {
  dialog({ title: 'Reset to original?', key: 'reset-original', body: h('p', {}, 'This brings back the file exactly as it was uploaded and removes every edit. You can’t undo this.'),
    actions: [{ label: 'Reset to original', cls: 'dng', on: async () => {
      if (busy) return false; busy = true;
      try {
        if (isDirty()) { toast('Save or undo your current changes first.', false); return false; }
        const r = await api.call('drive.files.resetOriginal', { id: file.id, expected: version() });
        if (!r.ok) { toast(r.status === 409 ? 'A newer version was saved. Reopen the file and try again.' : r.status === 404 ? 'You can’t change this file.' : 'Couldn’t reset. Try again.', false); return false; }
        const o = await api.call('drive.files.original', { id: file.id }); const u = o.ok && o.data[0]?.url;
        const blob = u ? await fetch(u).then((x) => (x.ok ? x.blob() : null), () => null) : null;
        if (!blob) { toast('Reset. Reopen the file to see the original.'); return; }
        await onDone(blob, r.data[0].current_version); toast('Reset. The file is back to the original upload.');
      } finally { busy = false; }
    } }, { label: 'Cancel', focus: true }] });
}

/** The "Edited | Original" switch: shows the original upload over `stage` (read only) until "Edited" is chosen again. */
export function originalSwitch({ api, file, stage }) {
  let overlay = null;
  const set = async (orig) => {
    sw.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.k === 'orig') === orig)));
    overlay?.remove(); overlay = null; if (!orig) return;
    const o = await api.call('drive.files.original', { id: file.id }); const u = o.ok && o.data[0]?.url; if (!u) { toast('The original isn’t available.', false); set(false); return; }
    const host = stage(); if (!host) return; if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    overlay = h('div', { class: 'orig-ov', style: 'position:absolute;inset:0;z-index:5;display:grid;place-items:center;background:var(--sunk)' }, h('img', { src: u, alt: 'The original upload', style: 'max-width:100%;max-height:100%;object-fit:contain' }),
      h('span', { class: 'pill', style: 'position:absolute;left:12px;top:12px' }, o.data[0].edited ? 'Original (as uploaded)' : 'Original · no edits saved yet'));
    host.append(overlay);
  };
  const sw = h('div', { class: 'vsw sm', role: 'group', 'aria-label': 'Show' }, ...[['ed', 'Edited'], ['orig', 'Original']].map(([k, l]) => h('button', { type: 'button', 'data-k': k, 'aria-pressed': String(k === 'ed'), onclick: () => set(k === 'orig') }, l)));
  return sw;
}
export const resetButton = (on) => h('button', { type: 'button', class: 'btn quiet sm', onclick: on }, icon('restore'), 'Reset to original');
