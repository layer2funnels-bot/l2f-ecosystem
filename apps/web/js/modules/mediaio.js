// Stored-file input/output shared by the image and PDF editors: read a file (or one of its versions) through a short-lived signed address, and write
// bytes back as a new version of the same file or as a new file next to it. The same three calls as an upload in Drive: drive.uploads.sign, a PUT to the
// signed address, then drive.files.create / drive.files.versions.add (which looks at the stored copy and takes its real size).
import { h, toast, drawer, btn } from '../ui.js';
import { copyName } from './mediamodel.js';

/** The file's bytes (current version, or `version`). Returns { blob, name, mime, version } or { error }. */
export async function readStored(api, id, version) {
  const r = await api.call('drive.files.download', { id, ...(version ? { version } : {}) });
  if (!r.ok || !r.data[0]) return { error: r.status === 404 ? 'missing' : 'failed' };
  try {
    const res = await fetch(r.data[0].url); if (!res.ok) return { error: 'failed' };
    return { blob: await res.blob(), name: r.data[0].name, mime: r.data[0].mime_type, version: r.data[0].version };
  } catch { return { error: 'failed' }; }
}

const putBlob = (target, blob) => new Promise((resolve, reject) => {
  const x = new XMLHttpRequest(); x.open(target.method || 'PUT', target.url); for (const [k, v] of Object.entries(target.headers ?? {})) x.setRequestHeader(k, v);
  x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new Error('The upload failed.'))); x.onerror = () => reject(new Error('The upload failed.')); x.send(blob);
});
async function sign(api, file, name, blob, mime) {
  const s = await api.call('drive.uploads.sign', { space: file.space, ...(file.client_id ? { client: file.client_id } : {}), name, size_bytes: Math.max(1, blob.size), mime_type: mime });
  if (!s.ok || !s.data[0]) throw new Error(s.status === 422 ? 'The storage limit is reached.' : 'You can’t add files here.');
  await putBlob(s.data[0], blob);
  return s.data[0].path;
}
/** Save `blob` as the next version of `file`. `expected` is the version the editor started from. Returns the api result (status 409 = someone saved first). */
export async function saveVersion(api, file, blob, mime, expected, note) {
  let path; try { path = await sign(api, file, file.name, blob, mime); } catch (e) { return { ok: false, status: 0, message: e.message }; }
  return api.call('drive.files.versions.add', { id: file.id, storage_path: path, size_bytes: Math.max(1, blob.size), expected, ...(note ? { note } : {}) });
}
/** Save `blob` as a new file in the same place as `file` (same space, client, folder, project). */
export async function saveCopy(api, file, blob, mime, name = copyName(file.name, mime)) {
  let path; try { path = await sign(api, file, name, blob, mime); } catch (e) { return { ok: false, status: 0, message: e.message }; }
  return api.call('drive.files.create', { space: file.space, ...(file.client_id ? { client: file.client_id } : {}), ...(file.folder_id ? { folder: file.folder_id } : {}), ...(file.project_id ? { project: file.project_id } : {}),
    ...(file.managed_by ? { app: file.managed_by } : {}), name, kind: 'file', mime_type: mime, size_bytes: Math.max(1, blob.size), storage_path: path });
}
/**
 * The version history of a stored file. "Restore as new" downloads that version and saves it as the newest one (nothing is deleted).
 * `current()` is the version the editor is on; `onRestored(blob, version)` lets the editor show the restored file.
 */
export async function versionsDrawer({ api, file, current, readOnly, canRestore, onRestored }) {
  const r = await api.call('drive.files.versions', { file: file.id });
  if (!r.ok) return toast('Couldn’t load the history.', false);
  let close = () => {};
  const restore = async (n) => {
    const old = await readStored(api, file.id, n); if (old.error) return toast('Couldn’t load that version.', false);
    const saved = await saveVersion(api, file, old.blob, old.mime || file.mime_type, current(), `Restored version ${n}`);
    if (!saved.ok) return toast(saved.status === 409 ? 'A newer version was saved. Reopen the history.' : (saved.message ?? 'Couldn’t restore.'), false);
    close(); onRestored(old.blob, saved.data[0].current_version); toast(`Restored version ${n} as version ${saved.data[0].current_version}.`);
  };
  const list = h('ul', { class: 'rows' }, ...r.data.map((x) => h('li', {}, h('div', {}, h('b', {}, `Version ${x.version}`, x.version === current() ? ' · newest' : ''), h('div', { class: 'fine muted' }, new Date(x.created_at).toLocaleString(), x.note ? ` · ${x.note}` : '')),
    x.version === current() || readOnly || !canRestore ? null : btn('Restore as new', () => restore(x.version), ''))));
  close = drawer({ title: 'History', body: [h('p', { class: 'fine muted' }, 'Restoring never deletes anything: it saves the old version as a new one.'), list] });
}
/** "Autosave" choice, remembered in this browser (on unless switched off). */
export const autosavePref = { get() { try { return localStorage.getItem('l2f.media.autosave') !== '0'; } catch { return true; } }, set(on) { try { localStorage.setItem('l2f.media.autosave', on ? '1' : '0'); } catch { /* private mode: lasts for this page only */ } } };
/** Saves a new version after a short idle time once the person has edited. Each autosave is a stored version, so it is slow on purpose (idle, and not more often than minMs). */
export function createAutosave({ ok, busy, run }) {
  let t = 0, last = 0;
  const idle = () => (typeof window !== 'undefined' && Number(window.__AUTOSAVE_MS)) || 8000;
  const kick = () => { clearTimeout(t); if (!ok()) return; const wait = Math.max(idle(), last + idle() * 2.5 - Date.now()); t = setTimeout(async () => { if (!ok()) return; if (busy()) { kick(); return; } last = Date.now(); await run(); }, wait); };
  return { kick, cancel: () => clearTimeout(t) };
}
/** Hand a blob to the browser as a download. */
export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.rel = 'noopener'; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
