// Shared pieces of the optional views: the view catalogue, routes, a hook for the added views, uploads and small formatters.
import type { OptionalViewKind } from '../../../shared/api.ts';
import type { Resource } from '../../../shared/api.ts';
import { call, uploadToDrive } from '../../api/client.ts';
import { useQuery } from '../../api/store.ts';
import type { IconName } from '../../ui/icons.tsx';

export interface ViewMeta { kind: OptionalViewKind; /** route segment: #/p/<id>/<route> */ route: string; label: string; icon: IconName; description: string }
/** The route for Docs is "pages" because #/p/<id>/docs is the existing "Docs & links" tab. */
export const OPTIONAL_VIEWS: ViewMeta[] = [
  { kind: 'gallery', route: 'gallery', label: 'Gallery', icon: 'image', description: 'Images and videos from this project' },
  { kind: 'activity', route: 'activity', label: 'Activity', icon: 'activity', description: 'Everything that happened, newest first' },
  { kind: 'docs', route: 'pages', label: 'Docs', icon: 'doc', description: 'Documents, whiteboards and spreadsheets for this project' },
  { kind: 'collection', route: 'collection', label: 'Collection', icon: 'layers', description: 'Files, links and embeds in organised collections' },
];
export const viewByRoute = (route: string | null) => OPTIONAL_VIEWS.find((v) => v.route === route);
export const viewByKind = (kind: OptionalViewKind) => OPTIONAL_VIEWS.find((v) => v.kind === kind)!;

export function useProjectViews(projectId: string) {
  return useQuery(`views:${projectId}`, () => call('views.list', { projectId }), []);
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export function mediaKind(mime: string | null | undefined): 'image' | 'video' | 'audio' | 'pdf' | 'other' {
  if (!mime) return 'other';
  if (/^image\/(png|jpeg|gif|webp|avif|bmp|svg\+xml)$/.test(mime)) return 'image';
  if (/^video\/(mp4|webm|ogg|quicktime)$/.test(mime)) return 'video';
  if (/^audio\/(mpeg|ogg|wav|webm|mp4)$/.test(mime)) return 'audio';
  if (mime === 'application/pdf') return 'pdf';
  return 'other';
}

export function hostOf(url: string | null): string {
  if (!url) return '';
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

export const PROVIDER_LABEL: Record<string, string> = {
  youtube: 'YouTube', vimeo: 'Vimeo', loom: 'Loom', google_docs: 'Google Docs', google_sheets: 'Google Sheets', google_slides: 'Google Slides',
  google_calendar: 'Google Calendar', figma: 'Figma', website: 'Website',
};

/** Uploads one file into Drive and adds it to the project's Collection. Resolves with the new resource. */
export async function uploadResource(projectId: string, collectionId: string | null, file: File, onProgress: (pct: number) => void): Promise<Resource> {
  const fileId = await uploadToDrive(projectId, file, onProgress);
  return call('resources.addFile', { projectId, collectionId, fileId });
}

/** Opens an authorised file in a new tab using a fresh signed address. */
export async function freshFileUrl(op: 'resources.fileUrl' | 'attachments.fileUrl', id: string, download = false): Promise<string> {
  const r = await call(op, { id });
  return download ? `${r.url}&dl=1` : r.url;
}
