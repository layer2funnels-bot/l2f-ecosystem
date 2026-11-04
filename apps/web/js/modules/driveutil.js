// Drive helpers that need no page: which kind of file something is (one icon, one colour per kind), how an upload failure is explained in plain words, a size
// check before any bytes move, and sorting. Kept apart from drive.js so each can be tested without a browser.
import { MIME as SHEET_MIME } from './sheetmodel.js';

export const DOC_MIME = 'application/vnd.l2f.doc+json';
export const BOARD_MIME = 'application/vnd.excalidraw+json';
export const MAX_FILE_BYTES = 5368709120;      // 5 GiB: the same ceiling the server enforces (drive.uploads.sign)

// ---------------------------------------------------------------- file kinds
const EXT = {
  image: 'png jpg jpeg gif webp svg avif bmp heic heif ico tif tiff', pdf: 'pdf', video: 'mp4 mov webm mkv avi m4v wmv mpeg mpg', audio: 'mp3 wav m4a ogg oga flac aac aiff opus',
  zip: 'zip rar 7z tar gz tgz bz2 xz', text: 'txt md rtf log json xml yaml yml html css js', sheet: 'csv tsv xls xlsx ods numbers', document: 'doc docx odt pages ppt pptx key odp',
};
const BY_EXT = Object.fromEntries(Object.entries(EXT).flatMap(([k, v]) => v.split(' ').map((e) => [e, k])));
/** key → [short label inside the tile, name shown in the Type column]. The colour of each key lives in drive.css (`.ft-<key>`). */
export const FILE_TYPES = {
  document: ['DOC', 'Document'], sheet: ['XLS', 'Spreadsheet'], board: ['WB', 'Whiteboard'], image: ['IMG', 'Image'], pdf: ['PDF', 'PDF'], video: ['VID', 'Video'],
  audio: ['AUD', 'Audio'], zip: ['ZIP', 'Archive'], text: ['TXT', 'Text'], other: ['FILE', 'File'],
};
const extOf = (name) => (/\.([A-Za-z0-9]{1,8})$/.exec(String(name ?? ''))?.[1] ?? '').toLowerCase();
/** The kind of a file or document record ({ name, mime_type, kind }). Our own documents are recognised by their type; uploads by their MIME type, then by the extension. */
export function fileType(f) {
  const m = String(f?.mime_type ?? '').toLowerCase(); let key = 'other';
  if (m === DOC_MIME) key = 'document'; else if (m === SHEET_MIME) key = 'sheet'; else if (m === BOARD_MIME) key = 'board';
  else if (m.startsWith('image/')) key = 'image'; else if (m === 'application/pdf') key = 'pdf'; else if (m.startsWith('video/')) key = 'video'; else if (m.startsWith('audio/')) key = 'audio';
  else if (/zip|compressed|x-tar|x-7z|x-rar|gzip/.test(m)) key = 'zip'; else if (m.startsWith('text/csv') || /spreadsheet|ms-excel/.test(m)) key = 'sheet';
  else if (/wordprocessing|msword|presentation|powerpoint/.test(m)) key = 'document'; else if (m.startsWith('text/') || m === 'application/json') key = 'text';
  else key = BY_EXT[extOf(f?.name)] ?? (f?.kind === 'document' ? 'text' : 'other');
  const [label, name] = FILE_TYPES[key];
  return { key, label, name };
}
/** Does a record match the Type filter choice? (all · Document · Spreadsheet · Whiteboard · image · pdf · media · other) */
export function matchesType(f, choice) {
  if (!choice || choice === 'all') return true; const k = fileType(f).key;
  switch (choice) {
    case 'Document': return k === 'document'; case 'Spreadsheet': return k === 'sheet'; case 'Whiteboard': return k === 'board'; case 'image': return k === 'image'; case 'pdf': return k === 'pdf';
    case 'media': return k === 'video' || k === 'audio'; case 'other': return !['document', 'sheet', 'board', 'image', 'pdf', 'video', 'audio'].includes(k); default: return true;
  }
}
export const isImage = (f) => fileType(f).key === 'image' && f.kind === 'file' && /^image\/(png|jpe?g|gif|webp|avif|bmp)$/i.test(f.mime_type ?? '') && (f.size_bytes ?? 0) <= 15 * 1048576;   // not svg: it could carry script when opened on its own

export const formatSize = (n) => (n == null ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(2)} GB`);

// ---------------------------------------------------------------- upload errors
export const CORS_HINT = 'The browser could not reach file storage. If this keeps happening, file storage may not allow this website address yet – tell an admin.';
/**
 * Why an upload step failed, in words a person can act on. stage: 'sign' (asking for permission to upload), 'put' (sending the bytes to storage), 'create' (adding the file to Drive).
 * `res` is the API result for sign/create ({ ok:false, status, error:{ code } }) or { status } for the storage request (0 = the browser never got an answer).
 * Returns { kind, message, retryable }.
 */
export function classifyUploadError(stage, res, { size } = {}) {
  const status = Number(res?.status ?? 0); const code = String(res?.error?.code ?? '');
  if (stage === 'put') {
    if (status === 0) return { kind: 'cors', message: CORS_HINT, retryable: true };
    if (status === 413) return { kind: 'too_large', message: 'File storage says this file is too large.', retryable: false };
    if (status === 401 || status === 403) return { kind: 'put_refused', message: 'File storage refused the upload. The upload link may have expired – try again.', retryable: true };
    if (status >= 500) return { kind: 'put_failed', message: `File storage had a problem (error ${status}). Try again in a moment.`, retryable: true };
    return { kind: 'put_failed', message: `File storage refused the upload (error ${status}). Try again; if it keeps happening, tell an admin.`, retryable: true };
  }
  if (status === 0 || code === 'offline') return { kind: 'network', message: 'Could not reach the server. Check your internet connection, then try again.', retryable: true };
  if (status === 401 || code === 'session_expired') return { kind: 'session', message: 'Your session has ended. Sign in again, then retry.', retryable: true };
  if (status === 429 || code === 'rate_limited') return { kind: 'rate', message: 'Too many requests at once. Wait a moment, then retry.', retryable: true };
  if (status === 507 || code === 'storage_limit') return { kind: 'limit', message: 'The storage limit is reached, so this file was not saved. Delete files you no longer need, or ask an admin.', retryable: false };
  if (stage === 'sign') {
    if (status === 403 || status === 404) return { kind: 'denied', message: 'You do not have permission to add files here. Ask an admin for upload access.', retryable: false };
    if (status === 422 || status === 400) return size > MAX_FILE_BYTES ? { kind: 'too_large', message: `This file is over the ${formatSize(MAX_FILE_BYTES).replace('.00', '')} limit.`, retryable: false }
      : { kind: 'invalid', message: 'Drive does not accept this file (check its name and size).', retryable: false };
    if (status === 503 || code === 'storage_unavailable') return { kind: 'storage_off', message: 'File storage is not set up or is unavailable right now. Tell an admin.', retryable: true };
    return { kind: 'failed', message: 'The server could not prepare the upload. Try again.', retryable: true };
  }
  if (status === 403 || status === 404) return { kind: 'denied', message: 'The file reached storage, but you cannot add it to this place.', retryable: false };
  if (status === 422 || status === 400) return { kind: 'invalid', message: 'The file reached storage but Drive could not accept it (check its name).', retryable: false };
  if (status === 503 || code === 'storage_unavailable') return { kind: 'storage_off', message: 'File storage is unavailable right now. Retry in a moment.', retryable: true };
  return { kind: 'create_failed', message: 'The file was uploaded but could not be added to Drive. Retry to finish.', retryable: true };
}

/**
 * Before any bytes move: which files are certainly going to fail. `sizes` are byte counts; `usage` is storage.usage ({ total_bytes, cap_bytes }) when the person may read it.
 * Returns an array (same order) of null or { kind, message }.
 */
export function precheckUploads(sizes, usage) {
  let room = usage && Number.isFinite(usage.cap_bytes) && Number.isFinite(usage.total_bytes) ? usage.cap_bytes - usage.total_bytes : Infinity;
  return sizes.map((n) => {
    if (n > MAX_FILE_BYTES) return { kind: 'too_large', message: `This file is over the ${formatSize(MAX_FILE_BYTES).replace('.00', '')} limit.` };
    if (n > room) return { kind: 'limit', message: `Not enough storage left for this file (${formatSize(Math.max(0, room))} free). Delete files you no longer need, or ask an admin.` };
    room -= n; return null;
  });
}

// ---------------------------------------------------------------- sorting
const lc = (s) => String(s ?? '').toLocaleLowerCase();
/** rows are { folder } or { file }; folders stay first. key: name | modified | size; dir: 1 (ascending) or -1. */
export function sortRows(rows, key = 'name', dir = 1) {
  const it = (r) => r.folder ?? r.file; const byName = (a, b) => lc(it(a).name).localeCompare(lc(it(b).name), undefined, { numeric: true });
  const cmp = key === 'modified' ? (a, b) => String(it(a).updated_at ?? '').localeCompare(String(it(b).updated_at ?? '')) || byName(a, b)
    : key === 'size' ? (a, b) => (a.file && b.file ? (a.file.size_bytes ?? -1) - (b.file.size_bytes ?? -1) || byName(a, b) : byName(a, b)) : byName;
  return [...rows].sort((a, b) => ((a.folder ? 0 : 1) - (b.folder ? 0 : 1)) || dir * cmp(a, b));
}
