// Projects inside the ecosystem: every call goes through the shell's API client (same sign-in, token refresh and
// "session expired" screen as every other app; the organization is the shell's active one). A Projects V2 operation
// `x.y` is the ecosystem operation `pm.x.y` with one `args` object; its answer comes back as [{ r }].
import type { Attachment, OpArgs, OpName, OpResult } from '../../shared/api.ts';

export interface Host {
  org: string;
  me: { id: string; name?: string; email?: string } & Record<string, unknown>;
  orgs: { org_id: string; name: string; role?: string; slug?: string }[];
  call: (op: string, input?: unknown, orgId?: string) => Promise<{ ok: boolean; status: number; data?: unknown; error?: { code?: string; message?: string; fields?: string[] } }>;
}

let host: Host | null = null;
export function setHost(h: Host | null): void { host = h; }
export function getHost(): Host { if (!host) throw new ApiError('internal', 'Projects is not connected to the ecosystem yet.'); return host; }
export function getOrgId(): string | null { return host?.org ?? null; }

export class ApiError extends Error {
  code: string;
  field: string | undefined;
  status: number;
  constructor(code: string, message: string, extra: { field?: string; status?: number } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.field = extra.field;
    this.status = extra.status ?? 0;
  }
}

const NETWORK_MESSAGE = "Can't reach the server. Check your connection and try again.";

/** Any ecosystem operation (drive.*, notifications.*); errors become ApiError with the server's plain-language message. */
export async function callEco<T = unknown>(op: string, input: unknown = {}): Promise<T> {
  const h = getHost();
  const res = await h.call(op, input, h.org);
  if (res.ok) return res.data as T;
  const e = res.error ?? {};
  if (res.status === 0 || e.code === 'offline') throw new ApiError('network', NETWORK_MESSAGE);
  if (res.status === 401) throw new ApiError('unauthenticated', 'Your session has ended. Sign in again.', { status: 401 });
  const code = res.status === 404 ? 'not_found' : (e.code ?? 'internal');
  const message = res.status === 404 ? 'This was not found, or you no longer have access to it.' : (e.message ?? 'Something went wrong. Nothing was changed.');
  throw new ApiError(code, message, { field: e.fields?.[0], status: res.status });
}

export async function call<K extends OpName>(op: K, args?: OpArgs<K>): Promise<OpResult<K>> {
  const rows = await callEco<{ r: OpResult<K> }[]>(`pm.${op}`, { args: args ?? {} });
  if (!Array.isArray(rows) || !rows.length) throw new ApiError('internal', 'The server sent a response we could not read.');
  return rows[0].r;
}

// ───────────── files go through Drive (owner decision: Drive owns storage, limits and permissions) ─────────────
/** Upload a file into Drive (the shared library, where every staff member with the task can open it) and return its id.
 *  Drive checks the storage cap before any bytes move and takes the real size from the stored copy. Files are filed under
 *  the project once the project move (cutover migration) points Drive's project link at Projects V2. */
export async function uploadToDrive(_projectId: string, file: File, onProgress?: (pct: number) => void): Promise<string> {
  const mime = file.type || 'application/octet-stream';
  const signed = await callEco<{ path: string; url: string; method?: string; headers?: Record<string, string> }[]>(
    'drive.uploads.sign', { space: 'shared', name: file.name, size_bytes: Math.max(1, file.size), mime_type: mime });
  const s = signed?.[0];
  if (!s?.url) throw new ApiError('storage_unavailable', 'File storage is not available right now. Try again in a minute.');
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(s.method ?? 'PUT', s.url);
    for (const [k, v] of Object.entries(s.headers ?? {})) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onerror = () => reject(new ApiError('network', NETWORK_MESSAGE));
    xhr.onabort = () => reject(new ApiError('network', 'Upload cancelled.'));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new ApiError('internal', 'The upload did not finish. Nothing was saved.')));
    xhr.send(file);
  });
  const made = await callEco<{ id: string }[]>('drive.files.create', { space: 'shared', name: file.name, kind: 'file', mime_type: mime, size_bytes: file.size, storage_path: s.path });
  const id = made?.[0]?.id;
  if (!id) throw new ApiError('internal', 'Drive did not keep the file. Nothing was attached.');
  return id;
}

/** Upload into Drive under the task's project, then attach the Drive file to the task. */
export async function uploadFile(taskId: string, file: File, onProgress?: (pct: number) => void, projectId?: string): Promise<Attachment> {
  if (!projectId) throw new ApiError('invalid', 'Open the task inside its project to attach files.');
  const fileId = await uploadToDrive(projectId, file, onProgress);
  return call('attachments.add', { taskId, fileId });
}

/** Open a Drive file: documents open in the ecosystem editors, other files download through a short-lived address. */
export async function downloadFile(attachmentId: string, _name: string): Promise<void> {
  const { url } = await call('attachments.fileUrl', { id: attachmentId });
  if (url.startsWith('#/')) { window.location.hash = url.slice(1); return; }
  window.open(url, '_blank', 'noopener');
}
