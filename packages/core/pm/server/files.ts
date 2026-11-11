// Drive files linked to tasks (pm_attachments) and collections (pm_resources kind 'file'). Drive owns the file (name, type,
// size, bytes, trash); Projects V2 only points at it. Every read below runs under the CALLER's row rules on public.files,
// so a file the person may not open simply does not appear.
import type { Tx } from './db.ts';
import { ApiError } from './errors.ts';
import type { SignedUrl } from '../shared/api.ts';

/** Join a Drive file on `${alias}.file_id`; exposes df_name, df_mime, df_size, df_kind. */
export const fileJoin = (alias: string) => `join public.files df on df.workspace_id = ${alias}.workspace_id and df.id = ${alias}.file_id and df.archived_at is null`;
export const fileCols = `df.name df_name, coalesce(df.mime_type, 'application/octet-stream') df_mime, coalesce(df.size_bytes, 0)::float8 df_size, df.kind df_kind, df.id df_id`;

export interface StorageAdapter { signDownload(o: { path: string; seconds: number; fileName?: string }): Promise<{ url: string }> }
const SECONDS = 600;

/** A short-lived address for a Drive file the caller can read. Documents and sheets open in the ecosystem editors instead. */
export async function signedUrlFor(tx: Tx, storage: StorageAdapter | null | undefined, fileId: string): Promise<SignedUrl> {
  const r = (await tx.query<{ name: string; kind: string; mime_type: string | null; storage_path: string | null }>(
    'select f.name, f.kind, f.mime_type, f.storage_path from public.files f where f.id = $1 and f.archived_at is null', [fileId])).rows[0];
  if (!r) throw new ApiError('not_found', 'File not found');
  const expiresAt = new Date(Date.now() + SECONDS * 1000).toISOString();
  if (r.kind === 'document') return { url: /sheet/.test(r.mime_type ?? '') ? `#/sheet/${fileId}` : /excalidraw/.test(r.mime_type ?? '') ? `#/board/${fileId}` : `#/doc/${fileId}`, expiresAt };
  if (!r.storage_path) throw new ApiError('not_found', 'File not found');
  if (!storage) throw new ApiError('invalid', 'File storage is not available right now. Try again in a minute.');
  return { url: (await storage.signDownload({ path: r.storage_path, seconds: SECONDS, fileName: r.name })).url, expiresAt };
}

/** The caller must be able to read the file (row rules on public.files); the database guard checks it belongs here. */
export async function assertReadableFile(tx: Tx, fileId: string): Promise<void> {
  if (!(await tx.query('select 1 from public.files where id = $1 and archived_at is null', [fileId])).rows.length) throw new ApiError('not_found', 'File not found');
}
