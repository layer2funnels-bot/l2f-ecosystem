// Optional project views, collections (Drive files, links, embeds), file addresses, gallery and the activity feed.
// Collection files are Drive files (owner decision 11 Nov 2026): the item points at files.id; Drive owns name, type, size and bytes.
import { asUser } from '../db.ts';
import type { Tx } from '../db.ts';
import { ApiError } from '../errors.ts';
import { assertReadableFile, signedUrlFor } from '../files.ts';
import * as V from '../validate.ts';
import { FEED_TYPES, OPTIONAL_VIEW_KINDS, VIEW_IDS } from '../../shared/api.ts';
import type { Collection, FeedItem, FeedType, GalleryItem, LinkDetection, Ops, OpName, OptionalViewKind, Resource, SignedUrl, ViewId, ViewsInfo } from '../../shared/api.ts';
import { activity, all, needRole, one, person, personCols, run, type Ctx, type Row } from './util.ts';

// ───────────── link detection (pure) ─────────────
const PROVIDER_LABEL: Record<string, string> = {
  youtube: 'YouTube', vimeo: 'Vimeo', loom: 'Loom', google_docs: 'Google Docs', google_sheets: 'Google Sheets', google_slides: 'Google Slides',
  google_calendar: 'Google Calendar', figma: 'Figma', website: 'Website',
};
const GOOGLE_NOTE = 'Shows only if the file is shared as ‘Anyone with the link’ or published. This is a live view, not a synced copy.';
const WEBSITE_NOTE = 'Many websites refuse to load inside other pages. If this stays blank, use Open in new tab.';
const bad = (message: string): never => { throw new ApiError('invalid', message, 'url'); };

/** True for localhost, internal names, IP literals in private / loopback / link-local ranges and every IPv6 literal. */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  if (!h || h.includes(':') || h.startsWith('[')) return true;
  if (!h.includes('.')) return true;
  if (['.localhost', '.local', '.internal', '.lan', '.home', '.corp', '.intranet', '.home.arpa'].some((s) => h.endsWith(s))) return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  return false;
}

interface Embed { provider: string; embedUrl: string | null; embedError: string | null; access: LinkDetection['embedAccess']; note: string | null; title: string }

function youtube(u: URL, host: string): Embed {
  const seg = u.pathname.split('/').filter(Boolean);
  let id: string | undefined;
  if (host === 'youtu.be') id = seg[0];
  else if (seg[0] === 'watch') id = u.searchParams.get('v') ?? undefined;
  else if (['shorts', 'embed', 'live', 'v'].includes(seg[0])) id = seg[1];
  const ok = !!id && /^[A-Za-z0-9_-]{11}$/.test(id);
  return {
    provider: 'youtube', title: 'YouTube video', access: 'works', note: null,
    embedUrl: ok ? `https://www.youtube-nocookie.com/embed/${id}` : null,
    embedError: ok ? null : 'Paste a link to one video (youtube.com/watch?v=…, youtu.be/… or /shorts/…).',
  };
}

function vimeo(u: URL, host: string): Embed {
  const seg = u.pathname.split('/').filter(Boolean);
  const player = host === 'player.vimeo.com';
  const i = player ? seg.indexOf('video') : seg.findIndex((s) => /^\d+$/.test(s));
  const id = i < 0 ? undefined : seg[player ? i + 1 : i];
  const ok = !!id && /^\d{3,12}$/.test(id);
  const hash = player ? u.searchParams.get('h') : i >= 0 ? seg[i + 1] : undefined;
  const h = hash && /^[a-f0-9]{6,20}$/i.test(hash) ? `?h=${hash}` : '';
  return {
    provider: 'vimeo', title: 'Vimeo video', access: 'works', note: null,
    embedUrl: ok ? `https://player.vimeo.com/video/${id}${h}` : null,
    embedError: ok ? null : 'Paste a link to one video (vimeo.com/123456789).',
  };
}

function loom(u: URL): Embed {
  const seg = u.pathname.split('/').filter(Boolean);
  const id = ['share', 'embed'].includes(seg[0]) ? seg[1] : undefined;
  const ok = !!id && /^[a-f0-9]{32}$/i.test(id);
  return {
    provider: 'loom', title: 'Loom video', access: 'works', note: null,
    embedUrl: ok ? `https://www.loom.com/embed/${id}` : null,
    embedError: ok ? null : 'Paste a Loom share link (loom.com/share/…).',
  };
}

function googleDocs(u: URL): Embed {
  let seg = u.pathname.split('/').filter(Boolean);
  if (seg[1] === 'u' && /^\d+$/.test(seg[2] ?? '')) seg = [seg[0], ...seg.slice(3)];
  const kinds: Record<string, { provider: string; title: string }> = {
    document: { provider: 'google_docs', title: 'Google Doc' }, spreadsheets: { provider: 'google_sheets', title: 'Google Sheet' }, presentation: { provider: 'google_slides', title: 'Google Slides' },
  };
  const k = kinds[seg[0]];
  if (!k) return { provider: 'website', title: 'Google file', embedUrl: null, embedError: 'Only Google Docs, Sheets and Slides links can be embedded.', access: null, note: null };
  const base = { ...k, access: 'needs_sharing' as const, note: GOOGLE_NOTE };
  if (seg[1] === 'd' && seg[2] === 'e' && /^[A-Za-z0-9_-]{10,300}$/.test(seg[3] ?? '')) {
    const pub = seg[3];
    const tail = seg[0] === 'document' ? 'pub?embedded=true' : seg[0] === 'spreadsheets' ? 'pubhtml?widget=true&headers=false' : 'embed?start=false&loop=false';
    return { ...base, embedUrl: `https://docs.google.com/${seg[0]}/d/e/${pub}/${tail}`, embedError: null };
  }
  if (seg[1] === 'd' && /^[A-Za-z0-9_-]{10,200}$/.test(seg[2] ?? '')) return { ...base, embedUrl: `https://docs.google.com/${seg[0]}/d/${seg[2]}/preview`, embedError: null };
  return { ...base, embedUrl: null, embedError: 'This does not look like a link to one Google file.' };
}

function googleCalendar(u: URL): Embed {
  const base = { provider: 'google_calendar', title: 'Google Calendar', access: 'needs_sharing' as const, note: 'Shows only if the calendar is public. This is a live view, not a synced copy.' };
  let src = u.searchParams.get('src') ?? u.searchParams.get('cid');
  if (!src) return { ...base, embedUrl: null, embedError: 'Paste a calendar link that includes src= or cid=.' };
  if (!u.searchParams.get('src')) { // cid is the base64 of the calendar id
    try {
      const dec = Buffer.from(src.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
      if (/^[^\s@]+@[^\s@]+$/.test(dec)) src = dec;
    } catch { /* use as is */ }
  }
  if (src.length > 300 || /\s/.test(src)) return { ...base, embedUrl: null, embedError: 'That calendar address is not valid.' };
  const ctz = u.searchParams.get('ctz');
  const extra = ctz && /^[A-Za-z_]+(\/[A-Za-z_+-]+){0,2}$/.test(ctz) ? `&ctz=${encodeURIComponent(ctz)}` : '';
  return { ...base, embedUrl: `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(src)}${extra}`, embedError: null };
}

function figma(u: URL, host: string): Embed {
  const base = { provider: 'figma', title: 'Figma file', access: 'needs_sharing' as const, note: 'Shows only if the file can be viewed with the link (or the viewer has Figma access). This is a live view.' };
  if (host === 'embed.figma.com') return { ...base, embedUrl: u.href, embedError: null };
  const first = u.pathname.split('/').filter(Boolean)[0];
  if (!['file', 'design', 'proto', 'board', 'slides', 'deck', 'make'].includes(first)) return { ...base, embedUrl: null, embedError: 'Paste a link to a Figma file or prototype.' };
  return { ...base, embedUrl: `https://www.figma.com/embed?embed_host=projects-v2&url=${encodeURIComponent(u.href)}`, embedError: null };
}

/** Validates a pasted address and works out how it can be shown. Throws ApiError('invalid') for unsafe or unusable addresses. */
export function detectLink(raw: unknown): LinkDetection {
  if (typeof raw !== 'string') return bad('url must be text');
  const s = raw.trim();
  if (!s) return bad('Paste a link.');
  if (s.length > 2000) return bad('That link is too long (2000 characters at most).');
  if (/[\u0000- \u007f]/.test(s)) return bad('A link cannot contain spaces or control characters.');
  let u: URL;
  try { u = new URL(s); } catch { return bad('That does not look like a web address. Start it with https://'); }
  if (u.protocol === 'http:') return bad('Only secure links are allowed. Use https:// instead of http://');
  if (u.protocol !== 'https:') return bad('Only https:// links are allowed.');
  if (u.username || u.password) return bad('Links with a username or password are not allowed.');
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  let e: Embed;
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com' || host === 'youtu.be') e = youtube(u, host);
  else if (host === 'vimeo.com' || host === 'player.vimeo.com') e = vimeo(u, host);
  else if (host === 'loom.com') e = loom(u);
  else if (host === 'docs.google.com') e = googleDocs(u);
  else if (host === 'calendar.google.com') e = googleCalendar(u);
  else if (host === 'figma.com' || host === 'embed.figma.com') e = figma(u, host);
  else e = { provider: 'website', title: host + (u.pathname.length > 1 ? u.pathname.replace(/\/$/, '') : ''), embedUrl: u.href, embedError: null, access: 'may_refuse', note: WEBSITE_NOTE };
  if (isPrivateHost(u.hostname)) e = { ...e, embedUrl: null, embedError: 'Private, local and internal addresses cannot be embedded.', access: null, note: null };
  return {
    url: u.href, host, provider: e.provider, providerLabel: PROVIDER_LABEL[e.provider] ?? 'Website',
    embeddable: e.embedUrl !== null, embedUrl: e.embedUrl, embedError: e.embedError, embedAccess: e.embedUrl ? e.access : null,
    note: e.embedUrl ? e.note : null, suggestedTitle: e.title.slice(0, 200),
  };
}

// ───────────── shared helpers ─────────────
async function liveProject(tx: Tx, projectId: string, need: 'viewer' | 'editor'): Promise<void> {
  await needRole(tx, projectId, need);
  const p = await one<Row>(tx, 'select deleted_at from pm_projects where id = $1', [projectId]);
  if (p?.deleted_at) throw new ApiError('invalid', 'This project is in the trash. Restore it first.');
}

export const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/bmp', 'image/svg+xml'];
export const VIDEO_MIMES = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];
export const INLINE_MIMES = [...IMAGE_MIMES, ...VIDEO_MIMES, 'application/pdf', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/mp4'];

const COL_COUNTS = `(select count(*) from pm_resources x where x.collection_id = pm_collections.id and x.deleted_at is null) count,
  (select count(*) from pm_collections y where y.parent_id = pm_collections.id) child_count`;
function mapCollection(r: Row): Collection {
  return { id: r.id, name: r.name, position: r.position, parentId: r.parent_id ?? null, count: r.count ?? 0, childCount: r.child_count ?? 0, updatedAt: r.updated_at };
}

// A file item whose Drive file the reader may not open (or that was archived in Drive) is left out.
const RES_SELECT = `select r.id, r.project_id, r.collection_id, r.kind, r.title, r.description, r.url, r.provider, r.embed_url, r.file_id,
  df.name file_name, df.mime_type mime, df.size_bytes::float8 size_bytes, df.kind file_kind,
  r.position, r.created_at, r.updated_at, r.deleted_at, ${personCols('u', 'u')} from pm_resources r
  left join public.files df on df.workspace_id = r.workspace_id and df.id = r.file_id and df.archived_at is null
  left join pm_people u on u.id = r.created_by`;
const RES_VISIBLE = `(r.kind <> 'file' or df.id is not null)`;

function mapResource(r: Row): Resource {
  return {
    id: r.id, projectId: r.project_id, collectionId: r.collection_id, kind: r.kind, title: r.title, description: r.description, url: r.url, provider: r.provider,
    embedUrl: r.embed_url, fileId: r.file_id ?? null, fileName: r.file_name ?? null, mime: r.mime ?? null, sizeBytes: r.size_bytes ?? null, fileUrl: null,
    position: r.position, createdBy: person(r, 'u'), createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at,
  };
}
async function resourceById(tx: Tx, id: string): Promise<Resource> {
  const r = await one<Row>(tx, `${RES_SELECT} where r.id = $1 and ${RES_VISIBLE}`, [id]);
  if (!r) throw new ApiError('not_found', 'Item not found');
  return mapResource(r);
}
async function resourceScope(tx: Tx, id: string, need: 'viewer' | 'editor' = 'editor'): Promise<Row> {
  const r = await one<Row>(tx, 'select id, project_id, title, kind, file_id, deleted_at from pm_resources where id = $1', [id]);
  if (!r) throw new ApiError('not_found', 'Item not found');
  await liveProject(tx, r.project_id, need);
  return r;
}
async function collectionScope(tx: Tx, id: string): Promise<Row> {
  const r = await one<Row>(tx, 'select id, project_id, name, position, parent_id from pm_collections where id = $1', [id]);
  if (!r) throw new ApiError('not_found', 'Collection not found');
  await liveProject(tx, r.project_id, 'editor');
  return r;
}
async function collectionById(tx: Tx, id: string): Promise<Collection> {
  const r = await one<Row>(tx, `select id, name, position, parent_id, updated_at, ${COL_COUNTS} from pm_collections where id = $1`, [id]);
  if (!r) throw new ApiError('not_found', 'Collection not found');
  return mapCollection(r);
}
async function nextTopPosition(tx: Tx, projectId: string): Promise<number> {
  return (await one<Row>(tx, 'select coalesce(min(position), 0) - 1000 p from pm_resources where project_id = $1', [projectId]))!.p;
}
async function viewKinds(tx: Tx, projectId: string): Promise<ViewsInfo> {
  const kinds = (await all<{ kind: OptionalViewKind }>(tx, 'select kind from pm_project_views where project_id = $1 order by position, created_at', [projectId])).map((r) => r.kind);
  const labels: ViewsInfo['labels'] = {};
  for (const r of await all<{ view: ViewId; label: string }>(tx, 'select view, label from pm_project_view_labels where project_id = $1', [projectId])) labels[r.view] = r.label;
  return { kinds, labels };
}

// ───────────── activity feed ─────────────
const FEED_SQL: Record<FeedType, string> = {
  tasks: `(a.kind in ('task.created','task.trashed','task.restored','task.repeated','task.tags') or (a.kind = 'task.updated' and coalesce(a.data->>'field','') not in ('status','assignee','assignees')))`,
  comments: `a.kind = 'task.commented'`,
  status: `(a.kind = 'task.updated' and a.data->>'field' = 'status')`,
  assignments: `(a.kind like 'task.assign%' or (a.kind = 'task.updated' and a.data->>'field' in ('assignee','assignees')))`,
  files: `(a.kind like 'task.attachment%' or a.kind like 'task.link_%' or a.kind like 'resource.%' or a.kind like 'collection.%')`,
  project: `(a.kind like 'project.%' or a.kind like 'view.%')`,
};

export const resourcesOps = {
  // -- optional views --
  'views.list': async (ctx, args) => {
    const projectId = V.uuid(args.projectId, 'projectId');
    return asUser(ctx, async (tx) => { await needRole(tx, projectId, 'viewer'); return viewKinds(tx, projectId); });
  },
  'views.add': async (ctx, args) => {
    const projectId = V.uuid(args.projectId, 'projectId');
    const kind = V.oneOf(args.kind, 'kind', OPTIONAL_VIEW_KINDS);
    return asUser(ctx, async (tx) => {
      await liveProject(tx, projectId, 'editor');
      const n = await run(tx, `insert into pm_project_views (project_id, kind, position, added_by)
        select $1, $2, coalesce(max(position), 0) + 1, pm.uid() from pm_project_views where project_id = $1 on conflict do nothing`, [projectId, kind]);
      if (n > 0) await activity(tx, projectId, null, 'view.added', { view: kind });
      return viewKinds(tx, projectId);
    });
  },
  'views.remove': async (ctx, args) => {
    const projectId = V.uuid(args.projectId, 'projectId');
    const kind = V.oneOf(args.kind, 'kind', OPTIONAL_VIEW_KINDS);
    return asUser(ctx, async (tx) => {
      await liveProject(tx, projectId, 'editor');
      const n = await run(tx, 'delete from pm_project_views where project_id = $1 and kind = $2', [projectId, kind]);
      if (n > 0) await activity(tx, projectId, null, 'view.removed', { view: kind });
      return viewKinds(tx, projectId);
    });
  },

  'views.rename': async (ctx, args) => {
    const projectId = V.uuid(args.projectId, 'projectId');
    const view = V.oneOf(args.view, 'view', VIEW_IDS);
    const label = V.optNull(args, 'label', (x, f) => V.str(x, f, { min: 1, max: 40 }));
    if (label === undefined) throw new ApiError('invalid', 'label is required (use null to reset the name)', 'label');
    return asUser(ctx, async (tx) => {
      await liveProject(tx, projectId, 'editor');
      if (label === null) await run(tx, 'delete from pm_project_view_labels where project_id = $1 and view = $2', [projectId, view]);
      else await run(tx, `insert into pm_project_view_labels (project_id, view, label) values ($1, $2, $3) on conflict (project_id, view) do update set label = excluded.label`, [projectId, view, label]);
      return viewKinds(tx, projectId);
    });
  },

  // -- collections (folders) --
  'collections.list': async (ctx, args) => {
    const projectId = V.uuid(args.projectId, 'projectId');
    return asUser(ctx, async (tx) => {
      await needRole(tx, projectId, 'viewer');
      const rows = await all(tx, `select id, name, position, parent_id, updated_at, ${COL_COUNTS}
        from pm_collections where project_id = $1 order by position, created_at`, [projectId]);
      const t = (await one<Row>(tx, `select count(*) filter (where deleted_at is null) total, count(*) filter (where deleted_at is null and collection_id is null) unsorted,
        count(*) filter (where deleted_at is not null) trash from pm_resources where project_id = $1`, [projectId]))!;
      return { collections: rows.map((r) => mapCollection(r)), unsortedCount: t.unsorted, totalCount: t.total, trashCount: t.trash };
    });
  },
  'collections.create': async (ctx, args) => {
    const projectId = V.uuid(args.projectId, 'projectId');
    const name = V.str(args.name, 'name', { min: 1, max: 80 });
    const parentId = V.optNull(args, 'parentId', V.uuid) ?? null;
    return asUser(ctx, async (tx) => {
      await liveProject(tx, projectId, 'editor');
      const r = await one<Row>(tx, `insert into pm_collections (project_id, name, parent_id, position, created_by)
        select $1, $2, $3, coalesce(max(position), 0) + 1000, pm.uid() from pm_collections where project_id = $1 returning id`, [projectId, name, parentId]);
      await activity(tx, projectId, null, 'collection.created', { name });
      return collectionById(tx, r!.id);
    });
  },
  'collections.rename': async (ctx, args) => {
    const id = V.uuid(args.id, 'id');
    const name = V.str(args.name, 'name', { min: 1, max: 80 });
    return asUser(ctx, async (tx) => {
      await collectionScope(tx, id);
      await run(tx, 'update pm_collections set name = $2, updated_at = now() where id = $1', [id, name]);
      return collectionById(tx, id);
    });
  },
  'collections.move': async (ctx, args) => {
    const id = V.uuid(args.id, 'id');
    const position = V.opt(args, 'position', V.num);
    const parentId = V.optNull(args, 'parentId', V.uuid);
    if (position === undefined && parentId === undefined) throw new ApiError('invalid', 'Nothing to change', 'position');
    return asUser(ctx, async (tx) => {
      await collectionScope(tx, id);
      await run(tx, `update pm_collections set position = coalesce($2, position), parent_id = case when $3::boolean then $4::uuid else parent_id end, updated_at = now() where id = $1`,
        [id, position ?? null, parentId !== undefined, parentId ?? null]);
      return collectionById(tx, id);
    });
  },
  'collections.delete': async (ctx, args) => {
    const id = V.uuid(args.id, 'id');
    return asUser(ctx, async (tx) => {
      const c = await collectionScope(tx, id);
      // Contents move up one level (to the parent folder, or to the top level), nothing is deleted.
      const moved = await run(tx, 'update pm_resources set collection_id = $2 where collection_id = $1 and deleted_at is null', [id, c.parent_id]);
      await run(tx, 'update pm_collections set parent_id = $2 where parent_id = $1', [id, c.parent_id]);
      await run(tx, 'delete from pm_collections where id = $1', [id]); // trashed items fall back to the top level through the foreign key
      await activity(tx, c.project_id, null, 'collection.deleted', { name: c.name });
      return { ok: true, moved } as const;
    });
  },
  // -- resources --
  'resources.list': async (ctx, args) => {
    const projectId = V.uuid(args.projectId, 'projectId');
    const params: unknown[] = [projectId];
    let where = 'r.project_id = $1 and r.deleted_at is null';
    if (args.collectionId === null) where += ' and r.collection_id is null';
    else if (args.collectionId !== undefined) { params.push(V.uuid(args.collectionId, 'collectionId')); where += ' and r.collection_id = $2'; }
    return asUser(ctx, async (tx) => {
      await needRole(tx, projectId, 'viewer');
      return (await all(tx, `${RES_SELECT} where ${where} and ${RES_VISIBLE} order by r.position, r.created_at desc, r.id`, params)).map(mapResource);
    });
  },
  'resources.detect': async (ctx, args) => {
    void ctx;
    return detectLink(args.url);
  },
  'resources.addLink': async (ctx, args) => {
    V.noUnknown(args as V.Obj, ['projectId', 'collectionId', 'url', 'title', 'asEmbed'], 'request'); // embed_url can never come from the client
    const projectId = V.uuid(args.projectId, 'projectId');
    const collectionId = V.optNull(args, 'collectionId', V.uuid) ?? null;
    const asEmbed = V.bool(args.asEmbed, 'asEmbed');
    const title = V.opt(args, 'title', (x, f) => V.str(x, f, { min: 1, max: 200 }));
    const d = detectLink(args.url);
    if (asEmbed && !d.embeddable) throw new ApiError('invalid', d.embedError ?? 'This link cannot be embedded.', 'url');
    return asUser(ctx, async (tx) => {
      await liveProject(tx, projectId, 'editor');
      const pos = await nextTopPosition(tx, projectId);
      const r = await one<Row>(tx, `insert into pm_resources (project_id, collection_id, kind, title, url, provider, embed_url, position, created_by)
        values ($1, $2, $3, $4, $5, $6, $7, $8, pm.uid()) returning id`,
        [projectId, collectionId, asEmbed ? 'embed' : 'link', title ?? d.suggestedTitle, d.url, d.provider, asEmbed ? d.embedUrl : null, pos]);
      await activity(tx, projectId, null, 'resource.added', { title: title ?? d.suggestedTitle, kind: asEmbed ? 'embed' : 'link' });
      return resourceById(tx, r!.id);
    });
  },
  // A Drive file into the collection: uploaded into the project through Drive first, or an existing Drive file.
  'resources.addFile': async (ctx, args) => {
    V.noUnknown(args as V.Obj, ['projectId', 'collectionId', 'fileId', 'title'], 'request');
    const projectId = V.uuid(args.projectId, 'projectId'), fileId = V.uuid(args.fileId, 'fileId');
    const collectionId = V.optNull(args, 'collectionId', V.uuid) ?? null;
    const title = V.opt(args, 'title', (x, f) => V.str(x, f, { min: 1, max: 200 }));
    return asUser(ctx, async (tx) => {
      await liveProject(tx, projectId, 'editor');
      await assertReadableFile(tx, fileId);
      if (collectionId && !(await one(tx, 'select 1 x from pm_collections where id = $1 and project_id = $2', [collectionId, projectId]))) throw new ApiError('not_found', 'Collection not found');
      const name = (await one<Row>(tx, 'select name from public.files where id = $1', [fileId]))!.name as string;
      const pos = await nextTopPosition(tx, projectId);
      const r = await one<Row>(tx, `insert into pm_resources (project_id, collection_id, kind, title, file_id, position, created_by)
        values ($1, $2, 'file', $3, $4, $5, pm.uid()) returning id`, [projectId, collectionId, (title ?? name).slice(0, 200), fileId, pos]);
      await activity(tx, projectId, null, 'resource.file_added', { title: title ?? name });
      return resourceById(tx, r!.id);
    });
  },
  'resources.update': async (ctx, args) => {
    V.noUnknown(args as V.Obj, ['id', 'title', 'description', 'collectionId', 'position'], 'request');
    const id = V.uuid(args.id, 'id');
    const title = V.opt(args, 'title', (x, f) => V.str(x, f, { min: 1, max: 200 }));
    const description = V.opt(args, 'description', (x, f) => V.str(x, f, { max: 2000 }));
    const collectionId = V.optNull(args, 'collectionId', V.uuid);
    const position = V.opt(args, 'position', V.num);
    return asUser(ctx, async (tx) => {
      const cur = await resourceScope(tx, id);
      if (cur.deleted_at) throw new ApiError('invalid', 'This item is in the trash. Restore it first.');
      await run(tx, `update pm_resources set title = coalesce($2, title), description = coalesce($3, description), position = coalesce($4, position), updated_at = now(),
        collection_id = case when $5::boolean then $6::uuid else collection_id end where id = $1`,
        [id, title ?? null, description ?? null, position ?? null, collectionId !== undefined, collectionId ?? null]);
      return resourceById(tx, id);
    });
  },
  'resources.remove': async (ctx, args) => {
    const id = V.uuid(args.id, 'id');
    return asUser(ctx, async (tx) => {
      const r = await resourceScope(tx, id);
      if ((await run(tx, 'update pm_resources set deleted_at = now() where id = $1 and deleted_at is null', [id])) === 0) throw new ApiError('not_found', 'Item not found');
      await activity(tx, r.project_id, null, 'resource.removed', { title: r.title });
      return { ok: true } as const;
    });
  },
  'resources.restore': async (ctx, args) => {
    const id = V.uuid(args.id, 'id');
    return asUser(ctx, async (tx) => {
      const r = await resourceScope(tx, id);
      if ((await run(tx, 'update pm_resources set deleted_at = null where id = $1 and deleted_at is not null', [id])) === 0) throw new ApiError('not_found', 'Item not found in the trash');
      await activity(tx, r.project_id, null, 'resource.restored', { title: r.title });
      return { ok: true } as const;
    });
  },
  'resources.purge': async (ctx, args) => {
    const id = V.uuid(args.id, 'id');
    return asUser(ctx, async (tx) => {
      const r = await resourceScope(tx, id);
      if (!r.deleted_at) throw new ApiError('invalid', 'Only items in the trash can be deleted for good.');
      await run(tx, 'delete from pm_resources where id = $1', [id]);
      return { ok: true } as const;   // a linked Drive file stays in Drive
    });
  },
  'resources.trashList': async (ctx, args) => {
    const projectId = V.uuid(args.projectId, 'projectId');
    return asUser(ctx, async (tx) => {
      await needRole(tx, projectId, 'viewer');
      return (await all(tx, `${RES_SELECT} where r.project_id = $1 and r.deleted_at is not null and ${RES_VISIBLE} order by r.deleted_at desc`, [projectId])).map(mapResource);
    });
  },
  'resources.fileUrl': async (ctx, args) => {
    const id = V.uuid(args.id, 'id');
    return asUser(ctx, async (tx) => {
      const r = await one<Row>(tx, "select file_id from pm_resources where id = $1 and kind = 'file' and deleted_at is null", [id]);
      if (!r) throw new ApiError('not_found', 'File not found');
      return signedUrlFor(tx, ctx.storage, r.file_id);
    });
  },
  'attachments.fileUrl': async (ctx, args) => {
    const id = V.uuid(args.id, 'id');
    return asUser(ctx, async (tx) => {
      const r = await one<Row>(tx, 'select file_id from pm_attachments where id = $1 and deleted_at is null', [id]);
      if (!r) throw new ApiError('not_found', 'File not found');
      return signedUrlFor(tx, ctx.storage, r.file_id);
    });
  },

  // Drive's own storage cap (8 GB, organization-wide): the same numbers Drive and Admin show.
  'storage.usage': async (ctx) => asUser(ctx, async (tx) => {
    const u = await one<Row>(tx, 'select org_bytes::float8 used, cap_bytes::float8 cap from public.storage_usage()');
    return { usedBytes: u?.used ?? 0, limitBytes: u?.cap ?? 0, attachmentsBytes: 0, resourcesBytes: 0 };
  }),

  // -- gallery --
  'gallery.list': async (ctx, args) => {
    const projectId = V.uuid(args.projectId, 'projectId');
    const media = [...IMAGE_MIMES, ...VIDEO_MIMES];
    return asUser(ctx, async (tx) => {
      await needRole(tx, projectId, 'viewer');
      const att = await all(tx, `select a.id, a.file_id, df.name, df.mime_type mime, df.size_bytes::float8 size_bytes, a.created_at, a.task_id, t.title task_title, ${personCols('u', 'u')}
        from pm_attachments a join pm_tasks t on t.id = a.task_id
        join public.files df on df.workspace_id = a.workspace_id and df.id = a.file_id and df.archived_at is null left join pm_people u on u.id = a.uploaded_by
        where a.project_id = $1 and a.deleted_at is null and t.deleted_at is null and df.mime_type = any($2::text[])`, [projectId, media]);
      const res = await all(tx, `select r.id, r.file_id, df.name, df.mime_type mime, df.size_bytes::float8 size_bytes, r.created_at, r.collection_id, c.name collection_name, ${personCols('u', 'u')}
        from pm_resources r join public.files df on df.workspace_id = r.workspace_id and df.id = r.file_id and df.archived_at is null
        left join pm_collections c on c.id = r.collection_id left join pm_people u on u.id = r.created_by
        where r.project_id = $1 and r.kind = 'file' and r.deleted_at is null and df.mime_type = any($2::text[])`, [projectId, media]);
      const items: GalleryItem[] = [
        ...att.map((r): GalleryItem => ({
          id: r.id, source: 'task', media: r.mime.startsWith('video/') ? 'video' : 'image', name: r.name, mime: r.mime, sizeBytes: r.size_bytes ?? 0, url: null, fileId: r.file_id,
          createdAt: r.created_at, uploadedBy: person(r, 'u'), taskId: r.task_id, taskTitle: r.task_title, collectionId: null, collectionName: null,
        })),
        ...res.map((r): GalleryItem => ({
          id: r.id, source: 'collection', media: r.mime.startsWith('video/') ? 'video' : 'image', name: r.name, mime: r.mime, sizeBytes: r.size_bytes ?? 0, url: null, fileId: r.file_id,
          createdAt: r.created_at, uploadedBy: person(r, 'u'), taskId: null, taskTitle: null, collectionId: r.collection_id, collectionName: r.collection_name ?? null,
        })),
      ];
      const out = items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0)).slice(0, 500);
      // sign the first 60 at once (one storage call each, in parallel); the page asks for the rest as they scroll into view
      await Promise.all(out.slice(0, 60).map(async (g) => { try { g.url = (await signedUrlFor(tx, ctx.storage, g.fileId!)).url; } catch { g.url = null; } }));
      return out;
    });
  },

  // -- activity feed --
  'activity.feed': async (ctx, args) => {
    const projectId = V.uuid(args.projectId, 'projectId');
    const type = V.opt(args, 'type', (x, f) => V.oneOf(x, f, FEED_TYPES));
    const personId = V.opt(args, 'personId', V.uuid);
    const from = V.opt(args, 'from', V.date);
    const to = V.opt(args, 'to', V.date);
    const before = V.opt(args, 'before', (x, f) => V.int(x, f, 1, Number.MAX_SAFE_INTEGER));
    const limit = V.opt(args, 'limit', (x, f) => V.int(x, f, 1, 100)) ?? 30;
    const params: unknown[] = [projectId];
    let where = 'a.project_id = $1';
    const add = (sql: string, v: unknown) => { params.push(v); where += ` and ${sql.replace('?', `$${params.length}`)}`; };
    if (type) where += ` and ${FEED_SQL[type]}`;
    if (personId) add('a.actor_id = ?::uuid', personId);
    if (from) add('a.created_at >= ?::date', from);
    if (to) add("a.created_at < (?::date + 1)", to);
    if (before) add('a.id < ?', before);
    return asUser(ctx, async (tx) => {
      await needRole(tx, projectId, 'viewer');
      const rows = await all(tx, `select a.id, a.kind, a.data, a.created_at, a.task_id, t.title task_title, ${personCols('u', 'u')}
        from pm_activity a left join pm_people u on u.id = a.actor_id left join pm_tasks t on t.id = a.task_id
        where ${where} order by a.id desc limit ${limit + 1}`, params);
      const page = rows.slice(0, limit);
      const items: FeedItem[] = page.map((r) => ({ id: r.id, actor: person(r, 'u'), kind: r.kind, data: r.data ?? {}, createdAt: r.created_at, taskId: r.task_id, taskTitle: r.task_title ?? null }));
      return { items, next: rows.length > limit ? page[page.length - 1].id as number : null };
    });
  },
} satisfies Partial<{ [K in OpName]: (ctx: Ctx, args: Ops[K][0]) => Promise<Ops[K][1]> }>;
