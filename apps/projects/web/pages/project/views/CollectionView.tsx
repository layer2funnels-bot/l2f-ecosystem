// Optional "Collection" view: a file browser for the project. Folders (collections) open into their contents; files, links
// and embeds sit in a table with type filters, search, sort, bulk actions and a secondary grid layout.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, ReactNode } from 'react';
import type { Collection, LinkDetection, ProjectDetail, Resource } from '../../../../shared/api.ts';
import { call } from '../../../api/client.ts';
import type { ApiError } from '../../../api/client.ts';
import { invalidate, useQuery } from '../../../api/store.ts';
import { absoluteLink, copyText, openInNewTab } from '../../../lib/clipboard.ts';
import { cx, fmtDate, lsGet, lsSet, relTime } from '../../../lib/util.ts';
import { links, setHashParam, useRoute } from '../../../router.ts';
import { Button, IconButton } from '../../../ui/Button.tsx';
import { contextMenuProps, openMenuFrom } from '../../../ui/ContextMenu.tsx';
import type { CtxItem } from '../../../ui/ContextMenu.tsx';
import { Modal } from '../../../ui/Dialog.tsx';
import { EmptyState, ErrorState, Skeleton } from '../../../ui/Feedback.tsx';
import { Field, Input } from '../../../ui/Form.tsx';
import { Icon } from '../../../ui/icons.tsx';
import type { IconName } from '../../../ui/icons.tsx';
import { Menu, Select } from '../../../ui/Menu.tsx';
import type { MenuItem } from '../../../ui/Menu.tsx';
import { askConfirm, askForm } from '../../../ui/Prompt.tsx';
import { toast } from '../../../ui/Toast.tsx';
import { fmtBytes, freshFileUrl, hostOf, MAX_FILE_BYTES, mediaKind, PROVIDER_LABEL, uploadResource } from '../resourceKit.tsx';

const refresh = () => invalidate('collections', 'resources', 'gallery', 'storage');
const SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-presentation';

type Layout = 'grid' | 'list';
type SortKey = 'name' | 'type' | 'date';

// ───────────── classification ─────────────
export const TYPE_TABS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'collections', label: 'Collections' }, { key: 'images', label: 'Images' }, { key: 'videos', label: 'Videos' },
  { key: 'documents', label: 'Documents' }, { key: 'pdfs', label: 'PDFs' }, { key: 'spreadsheets', label: 'Spreadsheets' }, { key: 'presentations', label: 'Presentations' },
  { key: 'audio', label: 'Audio' }, { key: 'archives', label: 'Archives' }, { key: 'code', label: 'Code' }, { key: 'links', label: 'Links' }, { key: 'embeds', label: 'Embeds' },
];
const ext = (name: string | null) => ((name ?? '').includes('.') ? (name ?? '').split('.').pop()!.toLowerCase() : '');

/** Type column text and the filter tabs a resource belongs to. */
export function classify(r: Resource): { label: string; keys: string[]; icon: IconName } {
  if (r.kind === 'link' || r.kind === 'embed') {
    const keys: string[] = [r.kind === 'link' ? 'links' : 'embeds'];
    if (r.provider === 'google_docs') keys.push('documents');
    if (r.provider === 'google_sheets') keys.push('spreadsheets');
    if (r.provider === 'google_slides') keys.push('presentations');
    const prov = PROVIDER_LABEL[r.provider ?? ''] ?? 'Website';
    return r.kind === 'link' ? { label: 'Link', keys, icon: 'link' } : { label: `${prov} embed`, keys, icon: 'embed' };
  }
  const m = r.mime ?? '', e = ext(r.fileName);
  if (m.startsWith('image/')) return { label: 'Image', keys: ['images'], icon: 'image' };
  if (m.startsWith('video/')) return { label: 'Video', keys: ['videos'], icon: 'video' };
  if (m.startsWith('audio/')) return { label: 'Audio', keys: ['audio'], icon: 'play' };
  if (m === 'application/pdf' || e === 'pdf') return { label: 'PDF', keys: ['pdfs'], icon: 'doc' };
  if (/spreadsheet|excel|csv/.test(m) || ['xls', 'xlsx', 'csv', 'tsv', 'ods', 'numbers'].includes(e)) return { label: 'Spreadsheet', keys: ['spreadsheets'], icon: 'sheet' };
  if (/presentation|powerpoint/.test(m) || ['ppt', 'pptx', 'key', 'odp'].includes(e)) return { label: 'Presentation', keys: ['presentations'], icon: 'doc' };
  if (/zip|compressed|tar|gzip|rar|7z/.test(m) || ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2'].includes(e)) return { label: 'Archive', keys: ['archives'], icon: 'archive' };
  if (/javascript|json|xml|x-sh|x-python/.test(m) || ['js', 'ts', 'tsx', 'jsx', 'json', 'html', 'css', 'py', 'java', 'c', 'cpp', 'go', 'rs', 'rb', 'php', 'sh', 'sql', 'xml', 'yml', 'yaml'].includes(e)) return { label: 'Code', keys: ['code'], icon: 'embed' };
  if (/msword|wordprocessing|text\/|rtf/.test(m) || ['doc', 'docx', 'txt', 'rtf', 'odt', 'md', 'pages'].includes(e)) return { label: 'Document', keys: ['documents'], icon: 'doc' };
  return { label: 'File', keys: [], icon: 'doc' };
}

/** Folders as "A / B / C" select options (indented by depth, in tree order). */
export function folderOptions(cols: Collection[], exclude: string[] = []): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const c of cols.filter((x) => x.parentId === parent)) {
      if (exclude.includes(c.id)) continue;
      out.push({ value: c.id, label: `${' '.repeat(depth)}${depth ? '↳ ' : ''}${c.name}` });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

type RowData =
  | { type: 'folder'; id: string; name: string; label: string; updated: string; folder: Collection; where: string }
  | { type: 'res'; id: string; name: string; label: string; updated: string; r: Resource; keys: string[]; icon: IconName; where: string };

export function CollectionView({ project: p }: { project: ProjectDetail }) {
  const canEdit = p.myRole !== 'viewer' && !p.deletedAt;
  const route = useRoute();
  const cParam = route.params.get('c');
  const inTrash = cParam === 'trash';
  const folderId = cParam && cParam !== 'trash' && cParam !== 'all' && cParam !== 'unsorted' ? cParam : null;
  const openId = route.params.get('r');
  const [layout, setLayoutState] = useState<Layout>(() => (lsGet('pm.res.layout') === 'grid' ? 'grid' : 'list'));
  const setLayout = (l: Layout) => { setLayoutState(l); lsSet('pm.res.layout', l); };
  const [type, setType] = useState('all');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [upload, setUpload] = useState<File[] | null>(null);
  const [adding, setAdding] = useState<'link' | 'embed' | null>(null);
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const input = useRef<HTMLInputElement>(null);

  const cols = useQuery(`collections:${p.id}`, () => call('collections.list', { projectId: p.id }), []);
  const usage = useQuery('storage', () => call('storage.usage', {}), []);
  const res = useQuery(`resources:${p.id}`, () => call('resources.list', { projectId: p.id }), [], { enabled: !inTrash, refetchInterval: 8 * 60_000 });
  const trash = useQuery(`resources-trash:${p.id}`, () => call('resources.trashList', { projectId: p.id }), [], { enabled: inTrash });

  const folders = useMemo(() => cols.data?.collections ?? [], [cols.data]);
  const current = folderId ? folders.find((c) => c.id === folderId) ?? null : null;
  const crumbs = useMemo(() => {
    const out: Collection[] = [];
    let cur = current;
    while (cur && out.length < 10) { out.unshift(cur); cur = cur.parentId ? folders.find((c) => c.id === cur!.parentId) ?? null : null; }
    return out;
  }, [current, folders]);
  const pathOf = useCallback((id: string | null) => {
    const names: string[] = [];
    let cur = id ? folders.find((c) => c.id === id) : undefined;
    while (cur && names.length < 10) { names.unshift(cur.name); cur = cur.parentId ? folders.find((c) => c.id === cur!.parentId) : undefined; }
    return names.join(' / ');
  }, [folders]);

  const go = (v: string | null) => { setHashParam('c', v); setHashParam('r', null, { replace: true }); setSelected(new Set()); setType('all'); setQuery(''); setSearching(false); };
  const openResource = (id: string | null) => setHashParam('r', id, { replace: id === null });
  useEffect(() => { if (folderId && cols.data && !current) go(null); }, [folderId, cols.data, current]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- actions ----
  const fail = (e: unknown, fallback: string) => toast.error(e instanceof Error ? e.message : fallback);
  const newFolder = async () => {
    const r = await askForm({ title: 'New folder', fields: [{ name: 'name', label: 'Name', required: true, maxLength: 80, placeholder: 'e.g. Brand assets' }], confirmLabel: 'Create' });
    if (!r) return;
    try { await call('collections.create', { projectId: p.id, name: r.name, parentId: folderId }); refresh(); } catch (e) { fail(e, 'Could not create the folder'); }
  };
  const renameFolder = async (c: Collection) => {
    const r = await askForm({ title: 'Rename folder', fields: [{ name: 'name', label: 'Name', initial: c.name, required: true, maxLength: 80 }], confirmLabel: 'Rename' });
    if (!r || r.name === c.name) return;
    try { await call('collections.rename', { id: c.id, name: r.name }); refresh(); } catch (e) { fail(e, 'Could not rename the folder'); }
  };
  const deleteFolder = async (c: Collection, quiet = false) => {
    if (!quiet) {
      const n = c.count + c.childCount;
      const ok = await askConfirm({ title: `Delete the folder “${c.name}”?`, message: n ? `Its ${n} item${n === 1 ? '' : 's'} move up one level. Nothing else is deleted.` : 'The folder is empty.', confirmLabel: 'Delete folder', danger: true });
      if (!ok) return false;
    }
    try { await call('collections.delete', { id: c.id }); refresh(); if (folderId === c.id) go(c.parentId); return true; } catch (e) { fail(e, 'Could not delete the folder'); return false; }
  };
  const moveFolder = async (c: Collection, parentId: string | null) => {
    if (c.parentId === parentId) return;
    try { await call('collections.move', { id: c.id, parentId }); refresh(); toast.success(`Moved “${c.name}”`); } catch (e) { fail(e, 'Could not move the folder'); }
  };
  const moveResource = async (r: Resource, collectionId: string | null, quiet = false) => {
    if (r.collectionId === collectionId) return;
    try { await call('resources.update', { id: r.id, collectionId }); refresh(); if (!quiet) toast.success(`Moved to ${collectionId ? folders.find((c) => c.id === collectionId)?.name ?? 'folder' : 'Collection'}`); } catch (e) { fail(e, 'Could not move it'); }
  };
  const renameResource = async (r: Resource) => {
    const f = await askForm({ title: 'Rename', fields: [{ name: 'title', label: 'Title', initial: r.title, required: true, maxLength: 200 }], confirmLabel: 'Rename' });
    if (!f || f.title === r.title) return;
    try { await call('resources.update', { id: r.id, title: f.title }); refresh(); } catch (e) { fail(e, 'Could not rename it'); }
  };
  const removeResources = async (rs: Resource[]) => {
    const done: Resource[] = [];
    for (const r of rs) { try { await call('resources.remove', { id: r.id }); done.push(r); } catch (e) { fail(e, `Could not remove “${r.title}”`); } }
    if (!done.length) return;
    refresh();
    toast.success(done.length === 1 ? `Removed “${done[0].title}”` : `Removed ${done.length} items`, {
      action: { label: 'Undo', onClick: () => void Promise.all(done.map((r) => call('resources.restore', { id: r.id }))).then(refresh).catch((e: Error) => toast.error(e.message)) },
    });
  };
  const purgeResource = async (r: Resource) => {
    const ok = await askConfirm({ title: 'Delete for good?', message: `“${r.title}” will be permanently deleted${r.kind === 'file' ? ' with its file' : ''}. This can’t be undone.`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await call('resources.purge', { id: r.id }); refresh(); } catch (e) { fail(e, 'Could not delete it'); }
  };
  const restoreResource = async (r: Resource) => { try { await call('resources.restore', { id: r.id }); refresh(); toast.success('Restored'); } catch (e) { fail(e, 'Could not restore it'); } };

  const resLink = (r: Resource) => absoluteLink(`${links.project(p.id, 'collection')}?${r.collectionId ? `c=${r.collectionId}&` : ''}r=${r.id}`);
  const folderLink = (c: Collection) => `${links.project(p.id, 'collection')}?c=${c.id}`;
  const openNewTab = (r: Resource) => {
    if (r.kind === 'file' && r.fileUrl) window.open(r.fileUrl, '_blank', 'noopener,noreferrer');
    else if (r.url) window.open(r.url, '_blank', 'noopener,noreferrer');
  };

  /** Where something can be moved: the top level and every folder (minus the excluded ones and, for folders, their own subtree). */
  const moveItems = (current: string | null, pick: (id: string | null) => void, exclude: string[] = []): CtxItem[] => [
    { id: 'm-root', label: 'Collection (top level)', checked: current === null, onSelect: () => pick(null) },
    ...folderOptions(folders, exclude).map((o): CtxItem => ({ id: `m-${o.value}`, label: o.label, text: o.label.replace(/[ ↳ ]/g, ''), checked: current === o.value, onSelect: () => pick(o.value) })),
  ];
  const descendants = (id: string): string[] => folders.filter((c) => c.parentId === id).flatMap((c) => [c.id, ...descendants(c.id)]);

  const menuFor = (row: RowData): CtxItem[] => {
    if (row.type === 'folder') {
      const c = row.folder;
      const items: CtxItem[] = [
        { id: 'open', icon: 'folder', label: 'Open', onSelect: () => go(c.id) },
        { id: 'tab', icon: 'external', label: 'Open in new tab', onSelect: () => openInNewTab(folderLink(c)) },
        { id: 'copy', icon: 'link', label: 'Copy link', onSelect: () => void copyText(absoluteLink(folderLink(c)), 'Link copied') },
      ];
      if (canEdit) items.push(
        { id: 'rename', icon: 'edit', label: 'Rename…', separatorBefore: true, onSelect: () => void renameFolder(c) },
        { id: 'move', icon: 'folder', label: 'Move to', searchable: true, searchPlaceholder: 'Find a folder…', children: moveItems(c.parentId, (t) => void moveFolder(c, t), [c.id, ...descendants(c.id)]) },
        { id: 'delete', icon: 'trash', label: 'Delete folder…', danger: true, separatorBefore: true, onSelect: () => void deleteFolder(c) },
      );
      return items;
    }
    const r = row.r;
    const items: CtxItem[] = [
      { id: 'open', icon: r.kind === 'link' ? 'external' : 'image', label: r.kind === 'link' ? 'Open link' : 'Open', onSelect: () => (r.kind === 'link' ? openNewTab(r) : openResource(r.id)) },
      { id: 'tab', icon: 'external', label: 'Open in new tab', onSelect: () => openNewTab(r) },
      { id: 'copy', icon: 'link', label: 'Copy link', onSelect: () => void copyText(r.kind === 'file' ? resLink(r) : r.url ?? '', 'Link copied') },
    ];
    if (canEdit) items.push(
      { id: 'rename', icon: 'edit', label: 'Rename…', separatorBefore: true, onSelect: () => void renameResource(r) },
      { id: 'move', icon: 'folder', label: 'Move to', searchable: true, searchPlaceholder: 'Find a folder…', children: moveItems(r.collectionId, (t) => void moveResource(r, t)) },
      { id: 'remove', icon: 'trash', label: 'Remove', danger: true, separatorBefore: true, onSelect: () => void removeResources([r]) },
    );
    return items;
  };

  // ---- rows: this folder, or everything that matches when a filter or search is active ----
  const needle = query.trim().toLowerCase();
  const flat = type !== 'all' || needle !== '';
  const rows = useMemo<RowData[]>(() => {
    const out: RowData[] = [];
    for (const c of folders) {
      if (!flat && c.parentId !== folderId) continue;
      if (flat && type !== 'all' && type !== 'collections') continue;
      if (needle && !c.name.toLowerCase().includes(needle) && !'collection'.includes(needle)) continue;
      out.push({ type: 'folder', id: `f:${c.id}`, name: c.name, label: 'Collection', updated: c.updatedAt, folder: c, where: pathOf(c.parentId) });
    }
    for (const r of res.data ?? []) {
      if (!flat && r.collectionId !== folderId) continue;
      const k = classify(r);
      if (type !== 'all' && !k.keys.includes(type)) continue;
      if (needle && !`${r.title} ${r.fileName ?? ''} ${k.label}`.toLowerCase().includes(needle)) continue;
      out.push({ type: 'res', id: `r:${r.id}`, name: r.title, label: k.label, updated: r.updatedAt, r, keys: k.keys, icon: k.icon, where: pathOf(r.collectionId) });
    }
    const dir = sort.dir === 'asc' ? 1 : -1;
    return out.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1; // folders first
      const byName = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      const v = sort.key === 'name' ? byName : sort.key === 'type' ? a.label.localeCompare(b.label) || byName : a.updated < b.updated ? -1 : a.updated > b.updated ? 1 : byName;
      return v * dir;
    });
  }, [folders, res.data, flat, type, needle, folderId, sort, pathOf]);

  const trashRows = trash.data ?? [];
  const shown = inTrash ? [] : rows;
  const selectable = canEdit ? shown : [];
  const picked = shown.filter((r) => selected.has(r.id));
  const allPicked = selectable.length > 0 && selectable.every((r) => selected.has(r.id));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const bulkMove = async (target: string | null) => {
    for (const row of picked) { if (row.type === 'res') await moveResource(row.r, target, true); else if (row.folder.id !== target) await moveFolder(row.folder, target); }
    setSelected(new Set()); refresh();
  };
  const bulkRemove = async () => {
    const fs = picked.filter((r): r is Extract<RowData, { type: 'folder' }> => r.type === 'folder');
    const rs = picked.filter((r): r is Extract<RowData, { type: 'res' }> => r.type === 'res').map((r) => r.r);
    if (fs.length) {
      const ok = await askConfirm({ title: `Delete ${fs.length} folder${fs.length === 1 ? '' : 's'}?`, message: 'Items inside move up one level. Nothing else is deleted.', confirmLabel: 'Delete', danger: true });
      if (!ok) return;
      for (const f of fs) await deleteFolder(f.folder, true);
    }
    if (rs.length) await removeResources(rs);
    setSelected(new Set());
  };

  // ---- drag and drop ----
  const hasFiles = (e: DragEvent) => [...e.dataTransfer.types].includes('Files');
  const dropProps = canEdit && !inTrash ? {
    onDragEnter: (e: DragEvent) => { if (hasFiles(e)) { e.preventDefault(); depth.current++; setDragging(true); } },
    onDragOver: (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); },
    onDragLeave: () => { depth.current = Math.max(0, depth.current - 1); if (!depth.current) setDragging(false); },
    onDrop: (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); depth.current = 0; setDragging(false); const f = [...e.dataTransfer.files]; if (f.length) setUpload(f); },
  } : {};
  const dropOnFolder = (targetId: string, payload: string) => {
    const [k, id] = [payload.slice(0, 1), payload.slice(2)];
    if (k === 'r') { const r = (res.data ?? []).find((x) => x.id === id); if (r) void moveResource(r, targetId); }
    else { const c = folders.find((x) => x.id === id); if (c && c.id !== targetId) void moveFolder(c, targetId); }
  };

  const used = usage.data?.usedBytes ?? 0;
  const limit = usage.data?.limitBytes ?? 0;
  const sortItems: MenuItem[] = [
    { id: 'h1', label: 'Sort by', heading: true },
    ...([['name', 'Name'], ['type', 'Type'], ['date', 'Date updated']] as [SortKey, string][]).map(([k, label]): MenuItem => ({ id: `k-${k}`, label, selected: sort.key === k, onSelect: () => setSort((s) => ({ ...s, key: k })) })),
    { id: 'h2', label: 'Order', heading: true, separatorBefore: true },
    { id: 'o-asc', label: sort.key === 'date' ? 'Oldest first' : 'A to Z', selected: sort.dir === 'asc', onSelect: () => setSort((s) => ({ ...s, dir: 'asc' })) },
    { id: 'o-desc', label: sort.key === 'date' ? 'Newest first' : 'Z to A', selected: sort.dir === 'desc', onSelect: () => setSort((s) => ({ ...s, dir: 'desc' })) },
  ];
  const addItems: MenuItem[] = [
    { id: 'link', icon: 'link', label: 'Add link', onSelect: () => setAdding('link') },
    { id: 'embed', icon: 'embed', label: 'Add embed', onSelect: () => setAdding('embed') },
  ];
  const q = inTrash ? trash : res;
  const loaded = inTrash ? !!trash.data : !!res.data && !!cols.data;
  const count = inTrash ? trashRows.length : shown.length;
  const opened = openId ? (res.data ?? []).find((r) => r.id === openId) ?? null : null;
  const heading = inTrash ? 'Trash' : 'Collection';

  return (
    <div className="pm-res" {...dropProps}>
      <div className="pm-res__top">
        <nav className="pm-res__crumbs" aria-label="Location">
          {inTrash ? (
            <><button type="button" className="pm-res__crumb" onClick={() => go(null)}>Collection</button><span className="pm-faint">/</span><strong>Trash</strong></>
          ) : crumbs.length === 0 ? <strong>Collection</strong> : (
            <>
              <button type="button" className="pm-res__crumb" onClick={() => go(null)}>Collection</button>
              {crumbs.map((c, i) => (
                <span key={c.id} className="pm-res__crumbwrap"><span className="pm-faint">/</span>{i === crumbs.length - 1 ? <strong>{c.name}</strong> : <button type="button" className="pm-res__crumb" onClick={() => go(c.id)}>{c.name}</button>}</span>
              ))}
            </>
          )}
        </nav>
        <div className="pm-res__storage" title="Counts task attachments and Collection files for the whole organization">
          <span>Storage used: <strong>{usage.data ? fmtBytes(used) : '…'}</strong> of {Math.round(limit / 1024 ** 3)} GB</span>
          <span className="pm-res__meter" role="progressbar" aria-label="Storage used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round((limit > 0 ? used / limit : 0) * 100))}>
            <span style={{ width: `${Math.max(used > 0 ? 1 : 0, Math.min(100, (limit > 0 ? used / limit : 0) * 100))}%` }} />
          </span>
          {!inTrash && (cols.data?.trashCount ?? 0) > 0 && <button type="button" className="pm-linkbtn" onClick={() => go('trash')}>Trash ({cols.data?.trashCount})</button>}
        </div>
      </div>
      <input ref={input} type="file" multiple hidden tabIndex={-1} aria-label="Choose files to upload" onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) setUpload(f); }} />

      {!inTrash && (
        <div className="pm-res__bar2">
          <div className="pm-res__types" role="group" aria-label="Filter by type">
            {TYPE_TABS.map((t) => (
              <button key={t.key} type="button" aria-pressed={type === t.key} className={cx('pm-res__type', type === t.key && 'is-on')} onClick={() => { setType(t.key); setSelected(new Set()); }}>{t.label}</button>
            ))}
          </div>
          <div className="pm-res__tools">
            <span className="pm-res__count pm-faint" role="status" aria-live="polite">{loaded ? `${count} result${count === 1 ? '' : 's'}` : ''}</span>
            {searching ? (
              <span className="pm-res__search">
                <Icon name="search" size={14} />
                <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search this collection" aria-label="Search this collection" onKeyDown={(e) => { if (e.key === 'Escape') { setQuery(''); setSearching(false); } }} onBlur={() => { if (!query) setSearching(false); }} />
                {query && <button type="button" className="pm-mini" aria-label="Clear search" onClick={() => { setQuery(''); setSearching(false); }}><Icon name="x" size={12} /></button>}
              </span>
            ) : <IconButton icon="search" label="Search" size="sm" onClick={() => setSearching(true)} />}
            <Menu items={sortItems} align="end" label="Sort" trigger={(t) => <IconButton icon="filter" label="Sort" tooltip="Sort" size="sm" {...t} />} />
            {canEdit && <IconButton icon="folderPlus" label="New folder" size="sm" onClick={() => void newFolder()} />}
            {canEdit && <Menu items={addItems} align="end" label="Add link or embed" trigger={(t) => <IconButton icon="filePlus" label="Add link or embed" size="sm" {...t} />} />}
            {canEdit && <IconButton icon="upload" label="Upload files" size="sm" onClick={() => input.current?.click()} />}
            <div className="pm-seg" role="group" aria-label="Layout">
              <button type="button" className={cx('pm-seg__btn', layout === 'list' && 'is-on')} aria-pressed={layout === 'list'} onClick={() => setLayout('list')} title="Table"><Icon name="list" size={14} /><span className="pm-sr-only">Table</span></button>
              <button type="button" className={cx('pm-seg__btn', layout === 'grid' && 'is-on')} aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')} title="Grid"><Icon name="grid" size={14} /><span className="pm-sr-only">Grid</span></button>
            </div>
          </div>
        </div>
      )}

      {picked.length > 0 && (
        <div className="pm-res__bulk" role="region" aria-label="Selected items">
          <strong>{picked.length} selected</strong>
          <Menu items={[{ id: 'm-root', label: 'Collection (top level)', onSelect: () => void bulkMove(null) }, ...folderOptions(folders, picked.flatMap((r) => (r.type === 'folder' ? [r.folder.id, ...descendants(r.folder.id)] : []))).map((o): MenuItem => ({ id: o.value, label: o.label, text: o.label.replace(/[ ↳ ]/g, ''), onSelect: () => void bulkMove(o.value) }))]}
            searchable searchPlaceholder="Find a folder…" label="Move selected to" trigger={(t) => <Button size="sm" icon="folder" {...t}>Move to…</Button>} />
          <Button size="sm" icon="trash" variant="danger" onClick={() => void bulkRemove()}>Remove</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      <section className="pm-res__main" aria-label={heading}>
        {q.loading && !loaded ? (
          <div className="pm-res__skel" role="status" aria-label="Loading">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} height={44} radius={8} />)}</div>
        ) : q.error && !loaded ? (
          <ErrorState title="Couldn't load this collection" message={q.error.message} onRetry={() => void q.refetch()} />
        ) : inTrash ? (
          trashRows.length === 0 ? <EmptyState icon="trash" title="Trash is empty" text="Items you remove show up here so you can restore them." /> : (
            <ul className="pm-res__trash">
              {trashRows.map((r) => (
                <li key={r.id} className="pm-res__trashrow">
                  <Icon name={classify(r).icon} /><span className="pm-truncate">{r.title}</span><span className="pm-faint">{classify(r).label}</span>
                  {canEdit && <><Button size="sm" icon="restore" onClick={() => void restoreResource(r)}>Restore</Button><Button size="sm" variant="ghost" icon="trash" onClick={() => void purgeResource(r)}>Delete</Button></>}
                </li>
              ))}
            </ul>
          )
        ) : shown.length === 0 ? (
          flat ? <EmptyState icon="search" title="No results" text="Nothing matches this type or search. Try another filter." action={<Button onClick={() => { setType('all'); setQuery(''); setSearching(false); }}>Clear filters</Button>} /> : (
            <EmptyState
              icon="layers"
              title={current ? `${current.name} is empty` : 'Nothing in the Collection yet'}
              text={canEdit ? 'Upload files, add links and embeds (YouTube, Google Docs, Figma and more), or make a folder. You can also drop files anywhere on this page.' : 'Nothing has been added here yet.'}
              action={canEdit ? <div className="pm-row"><Button variant="primary" icon="upload" onClick={() => input.current?.click()}>Upload files</Button><Button icon="link" onClick={() => setAdding('link')}>Add link</Button><Button icon="embed" onClick={() => setAdding('embed')}>Add embed</Button><Button icon="folderPlus" onClick={() => void newFolder()}>New folder</Button></div> : undefined}
            />
          )
        ) : layout === 'list' ? (
          <div className="pm-res__tablewrap">
            <table className="pm-res__table">
              <thead>
                <tr>
                  <th className="pm-res__chk">{canEdit && <input type="checkbox" aria-label="Select all" checked={allPicked} onChange={() => setSelected(allPicked ? new Set() : new Set(selectable.map((r) => r.id)))} />}</th>
                  <SortTh label="Name" k="name" sort={sort} setSort={setSort} />
                  <SortTh label="Type" k="type" sort={sort} setSort={setSort} className="pm-res__col-type" />
                  <SortTh label="Date updated" k="date" sort={sort} setSort={setSort} className="pm-res__col-date" />
                  <th className="pm-res__act"><span className="pm-sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <TableRow
                    key={row.id} row={row} canEdit={canEdit} checked={selected.has(row.id)} flat={flat} onToggle={() => toggle(row.id)} menu={() => menuFor(row)}
                    onOpen={() => (row.type === 'folder' ? go(row.folder.id) : row.r.kind === 'link' ? openNewTab(row.r) : openResource(row.r.id))}
                    onDropOnFolder={row.type === 'folder' && canEdit ? (payload) => dropOnFolder(row.folder.id, payload) : undefined}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ul className="pm-res__items">
            {shown.map((row) => (
              <li key={row.id}>
                {row.type === 'folder'
                  ? <FolderCard c={row.folder} menu={() => menuFor(row)} onOpen={() => go(row.folder.id)} canEdit={canEdit} onDropOnFolder={(payload) => dropOnFolder(row.folder.id, payload)} />
                  : <ResCard r={row.r} canEdit={canEdit} onOpen={() => (row.r.kind === 'link' ? openNewTab(row.r) : openResource(row.r.id))} menu={() => menuFor(row)} />}
              </li>
            ))}
          </ul>
        )}
      </section>

      {dragging && <div className="pm-res__drop" aria-hidden="true"><Icon name="upload" size={28} /><strong>Drop files to upload{current ? ` to ${current.name}` : ''}</strong><span>Up to 25 MB each</span></div>}

      {upload && <UploadModal projectId={p.id} files={upload} collections={folders} initial={folderId} onClose={() => { setUpload(null); refresh(); }} />}
      {adding && <AddLinkModal projectId={p.id} mode={adding} collections={folders} initial={folderId} onClose={() => setAdding(null)} />}
      {opened && <Viewer r={opened} onClose={() => openResource(null)} onOpenTab={() => openNewTab(opened)} />}
    </div>
  );
}

function SortTh({ label, k, sort, setSort, className }: { label: string; k: SortKey; sort: { key: SortKey; dir: 'asc' | 'desc' }; setSort: (s: { key: SortKey; dir: 'asc' | 'desc' }) => void; className?: string }) {
  const on = sort.key === k;
  return (
    <th className={className} aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="pm-res__sortbtn" onClick={() => setSort({ key: k, dir: on && sort.dir === 'asc' ? 'desc' : 'asc' })}>
        {label}{on && <Icon name={sort.dir === 'asc' ? 'chevronUp' : 'chevronDown'} size={12} />}
      </button>
    </th>
  );
}

function TableRow({ row, canEdit, checked, flat, onToggle, menu, onOpen, onDropOnFolder }: {
  row: RowData; canEdit: boolean; checked: boolean; flat: boolean; onToggle: () => void; menu: () => CtxItem[]; onOpen: () => void; onDropOnFolder?: (payload: string) => void;
}) {
  const [over, setOver] = useState(false);
  const isFolder = row.type === 'folder';
  const sub = isFolder ? `${row.folder.count} item${row.folder.count === 1 ? '' : 's'}${row.folder.childCount ? ` · ${row.folder.childCount} folder${row.folder.childCount === 1 ? '' : 's'}` : ''}` : row.r.kind === 'file' ? fmtBytes(row.r.sizeBytes ?? 0) : hostOf(row.r.url);
  return (
    <tr
      className={cx('pm-res__row', checked && 'is-selected', over && 'is-over')}
      draggable={canEdit}
      onDragStart={(e) => { e.dataTransfer.setData('application/x-pm-resource', isFolder ? `f:${row.folder.id}` : `r:${row.r.id}`); e.dataTransfer.effectAllowed = 'move'; }}
      onDragOver={onDropOnFolder ? (e) => { if (e.dataTransfer.types.includes('application/x-pm-resource')) { e.preventDefault(); setOver(true); } } : undefined}
      onDragLeave={() => setOver(false)}
      onDrop={onDropOnFolder ? (e) => { const d = e.dataTransfer.getData('application/x-pm-resource'); setOver(false); if (d) { e.preventDefault(); e.stopPropagation(); onDropOnFolder(d); } } : undefined}
      {...contextMenuProps(menu, { label: `Actions for ${row.name}` })}
    >
      <td className="pm-res__chk">{canEdit && <input type="checkbox" aria-label={`Select ${row.name}`} checked={checked} onChange={onToggle} />}</td>
      <td>
        <button type="button" className="pm-res__namebtn" onClick={onOpen} title={isFolder ? `Open ${row.name}` : row.name}>
          <span className={cx('pm-res__ico', isFolder && 'is-folder')}><Icon name={isFolder ? 'folder' : row.icon} size={16} /></span>
          <span className="pm-res__nametxt">
            <span className="pm-truncate pm-res__nameline">{row.name}</span>
            <span className="pm-faint pm-truncate pm-res__sub">{flat && row.where ? `${row.where} · ` : ''}{sub}</span>
          </span>
        </button>
      </td>
      <td className="pm-res__col-type">{row.label}</td>
      <td className="pm-res__col-date pm-faint" title={new Date(row.updated).toLocaleString()}>{fmtDate(row.updated.slice(0, 10))}<span className="pm-res__ago"> · {relTime(row.updated)}</span></td>
      <td className="pm-res__act"><button type="button" className="pm-mini" aria-label={`More actions for ${row.name}`} title="More actions" onClick={(e) => openMenuFrom(e.currentTarget)}><Icon name="more" size={14} /></button></td>
    </tr>
  );
}

function FolderCard({ c, menu, onOpen, canEdit, onDropOnFolder }: { c: Collection; menu: () => CtxItem[]; onOpen: () => void; canEdit: boolean; onDropOnFolder: (payload: string) => void }) {
  const [over, setOver] = useState(false);
  return (
    <article
      className={cx('pm-res__card', over && 'is-over')}
      onDragOver={canEdit ? (e) => { if (e.dataTransfer.types.includes('application/x-pm-resource')) { e.preventDefault(); setOver(true); } } : undefined}
      onDragLeave={() => setOver(false)}
      onDrop={canEdit ? (e) => { const d = e.dataTransfer.getData('application/x-pm-resource'); setOver(false); if (d) { e.preventDefault(); onDropOnFolder(d); } } : undefined}
      {...contextMenuProps(menu, { label: `Actions for ${c.name}` })}
    >
      <button type="button" className="pm-res__thumb" onClick={onOpen} aria-label={`Open folder ${c.name}`}><span className="pm-res__glyph is-embed"><Icon name="folder" size={30} /><span>{c.count} item{c.count === 1 ? '' : 's'}</span></span></button>
      <div className="pm-res__info"><button type="button" className="pm-res__title pm-truncate" onClick={onOpen}>{c.name}</button><div className="pm-res__metarow"><span className="pm-res__badge">Collection</span></div></div>
      <div className="pm-res__actions"><button type="button" className="pm-mini" aria-label={`More actions for ${c.name}`} title="More actions" onClick={(e) => openMenuFrom(e.currentTarget)}><Icon name="more" size={14} /></button></div>
    </article>
  );
}

function ResCard({ r, canEdit, onOpen, menu }: { r: Resource; canEdit: boolean; onOpen: () => void; menu: () => CtxItem[] }) {
  const m = r.kind === 'file' ? mediaKind(r.mime) : null;
  const k = classify(r);
  let thumb: ReactNode;
  if (m === 'image' && r.fileUrl) thumb = <img src={r.fileUrl} alt="" loading="lazy" />;
  else if (m === 'video' && r.fileUrl) thumb = <><video src={`${r.fileUrl}#t=0.1`} preload="metadata" muted playsInline tabIndex={-1} /><span className="pm-res__play"><Icon name="play" size={16} /></span></>;
  else if (r.kind === 'file') thumb = <span className="pm-res__glyph"><Icon name={k.icon} size={26} /><span>{k.label}</span></span>;
  else if (r.kind === 'embed') thumb = <span className="pm-res__glyph is-embed"><Icon name="embed" size={26} /><span>{PROVIDER_LABEL[r.provider ?? ''] ?? 'Embed'}</span></span>;
  else thumb = <span className="pm-res__glyph is-link"><Icon name="link" size={26} /><span>{hostOf(r.url)}</span></span>;
  const badge = r.kind === 'link' ? <span className="pm-res__badge">External link</span>
    : r.kind === 'embed' ? <span className="pm-res__badge is-embed">Embed · {PROVIDER_LABEL[r.provider ?? ''] ?? 'Website'}</span>
    : <span className="pm-res__badge is-file">{k.label}</span>;
  const meta = r.kind === 'file' ? `${fmtBytes(r.sizeBytes ?? 0)} · ${r.createdBy?.name ?? 'Someone'} · ${relTime(r.createdAt)}` : `${hostOf(r.url)} · ${r.createdBy?.name ?? 'Someone'} · ${relTime(r.createdAt)}`;
  return (
    <article
      className="pm-res__card" draggable={canEdit}
      onDragStart={(e) => { e.dataTransfer.setData('application/x-pm-resource', `r:${r.id}`); e.dataTransfer.effectAllowed = 'move'; }}
      {...contextMenuProps(menu, { label: `Actions for ${r.title}` })}
    >
      <button type="button" className="pm-res__thumb" onClick={onOpen} aria-label={r.kind === 'link' ? `Open link ${r.title}` : `Open ${r.title}`}>{thumb}</button>
      <div className="pm-res__info">
        <div className="pm-res__titlerow"><button type="button" className="pm-res__title pm-truncate" title={r.title} onClick={onOpen}>{r.title}</button></div>
        <div className="pm-res__metarow">{badge}<span className="pm-faint pm-truncate">{meta}</span></div>
      </div>
      <div className="pm-res__actions">
        {r.kind === 'link' && r.url && <a className="pm-btn pm-btn--secondary pm-btn--sm" href={r.url} target="_blank" rel="noopener noreferrer"><span className="pm-btn__label">Open</span><Icon name="external" size={13} /></a>}
        <button type="button" className="pm-mini" aria-label={`More actions for ${r.title}`} title="More actions" onClick={(e) => openMenuFrom(e.currentTarget)}><Icon name="more" size={14} /></button>
      </div>
    </article>
  );
}

// ───────────── viewer (file preview and embed) ─────────────
export function EmbedFrame({ src, title }: { src: string; title: string }) {
  return (
    <iframe
      className="pm-res__frame" src={src} title={title} sandbox={SANDBOX} referrerPolicy="no-referrer-when-downgrade" loading="lazy"
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write" allowFullScreen
    />
  );
}

function Viewer({ r, onClose, onOpenTab }: { r: Resource; onClose: () => void; onOpenTab: () => void }) {
  const [url, setUrl] = useState<string | null>(r.fileUrl);
  useEffect(() => {
    if (r.kind !== 'file') return;
    let live = true;
    void freshFileUrl('resources.fileUrl', r.id).then((u) => { if (live) setUrl(u); }).catch(() => {});
    return () => { live = false; };
  }, [r.id, r.kind]);
  const m = r.kind === 'file' ? mediaKind(r.mime) : null;
  const note = r.kind === 'embed' ? embedNote(r.provider) : null;
  return (
    <Modal
      open size="lg" className="pm-res__viewer" onClose={onClose} title={r.title}
      description={r.kind === 'file' ? `${r.mime} · ${fmtBytes(r.sizeBytes ?? 0)}` : undefined}
      headerExtra={<div className="pm-row">
        {r.kind === 'file' && url && <a className="pm-btn pm-btn--secondary pm-btn--sm" href={`${url}&dl=1`} download={r.fileName ?? r.title}><Icon name="download" /><span className="pm-btn__label">Download</span></a>}
        <Button size="sm" icon="external" onClick={onOpenTab}>Open in new tab</Button>
      </div>}
    >
      {r.kind === 'embed' && r.embedUrl ? (
        <div className="pm-res__embedwrap">
          <EmbedFrame src={r.embedUrl} title={r.title} />
          {note && <p className="pm-res__note"><Icon name="info" size={14} />{note}</p>}
        </div>
      ) : !url ? <Skeleton height={320} radius={10} />
        : m === 'image' ? <img className="pm-res__preview" src={url} alt={r.title} />
        : m === 'video' ? <video className="pm-res__preview" src={url} controls autoPlay />
        : m === 'audio' ? <audio className="pm-res__audio" src={url} controls autoPlay />
        : m === 'pdf' ? <iframe className="pm-res__frame" src={url} title={r.title} />
        : <EmptyState icon="doc" title="No preview for this type of file" text="Download it to open it on your computer." />}
    </Modal>
  );
}

function embedNote(provider: string | null): string {
  switch (provider) {
    case 'google_docs': case 'google_sheets': case 'google_slides': return 'Shows only if the file is shared as ‘Anyone with the link’ or published. This is a live view, not a synced copy.';
    case 'google_calendar': return 'Shows only if the calendar is public. This is a live view, not a synced copy.';
    case 'figma': return 'Shows only if the file can be viewed with the link (or you have Figma access). This is a live view.';
    case 'website': return 'Many websites refuse to load inside other pages. If this stays blank, use Open in new tab.';
    default: return 'This is a live view of the original, not a copy. Use Open in new tab if it does not load.';
  }
}

// ───────────── upload ─────────────
interface UpItem { key: number; file: File; pct: number; state: 'queued' | 'uploading' | 'done' | 'error'; error: string | null }
let upSeq = 0;

function UploadModal({ projectId, files, collections, initial, onClose }: { projectId: string; files: File[]; collections: Collection[]; initial: string | null; onClose: () => void }) {
  const [target, setTarget] = useState<string>(initial ?? '');
  const targetRef = useRef(initial);
  targetRef.current = target || null;
  const [items, setItems] = useState<UpItem[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const patch = useCallback((key: number, p: Partial<UpItem>) => setItems((all) => all.map((x) => (x.key === key ? { ...x, ...p } : x))), []);

  const run = useCallback((it: UpItem) => {
    chain.current = chain.current.then(async () => {
      patch(it.key, { state: 'uploading', pct: 0, error: null });
      try { await uploadResource(projectId, targetRef.current, it.file, (pct) => patch(it.key, { pct })); patch(it.key, { state: 'done', pct: 100 }); refresh(); }
      catch (e) { patch(it.key, { state: 'error', error: (e as ApiError).message ?? 'Upload failed' }); }
    });
  }, [projectId, patch]);

  const add = useCallback((list: File[]) => {
    const ok: UpItem[] = [];
    const bad: string[] = [];
    for (const f of list) {
      if (f.size > MAX_FILE_BYTES) bad.push(`“${f.name}” is ${fmtBytes(f.size)}. Files must be 25 MB or smaller.`);
      else if (f.size === 0) bad.push(`“${f.name}” is empty.`);
      else ok.push({ key: ++upSeq, file: f, pct: 0, state: 'queued', error: null });
    }
    setProblems((p) => [...p, ...bad]);
    setItems((all) => [...all, ...ok]);
    ok.forEach(run);
  }, [run]);

  const started = useRef(false);
  useEffect(() => { if (started.current) return; started.current = true; add(files); }, [add, files]);

  const busy = items.some((i) => i.state === 'queued' || i.state === 'uploading');
  const done = items.filter((i) => i.state === 'done').length;
  return (
    <Modal
      open size="md" title="Upload files" description="Files up to 25 MB each. Images, videos and PDFs can be previewed." onClose={() => { if (!busy || window.confirm('Uploads are still running. Stop waiting?')) onClose(); }}
      footer={<><span className="pm-faint pm-res__upcount">{items.length ? `${done} of ${items.length} uploaded` : ''}</span><Button variant="primary" onClick={onClose} disabled={busy}>{busy ? 'Uploading…' : 'Done'}</Button></>}
    >
      <div className="pm-prompt">
        <Field label="Upload to">
          <Select<string> value={target} options={[{ value: '', label: 'Unsorted' }, ...folderOptions(collections)]} onChange={setTarget} ariaLabel="Collection" disabled={busy} />
        </Field>
        <div
          className={cx('pm-drop pm-res__zone', dragging && 'is-over')}
          onDragEnter={(e) => { e.preventDefault(); setDragging(true); }} onDragOver={(e) => e.preventDefault()} onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDragging(false); add([...e.dataTransfer.files]); }}
        >
          <Icon name="upload" size={16} />
          <span>Drop more files here, or <button type="button" className="pm-linkbtn" onClick={() => input.current?.click()}>browse</button></span>
          <input ref={input} type="file" multiple hidden tabIndex={-1} aria-label="Choose more files" onChange={(e) => { add([...(e.target.files ?? [])]); e.target.value = ''; }} />
        </div>
        {problems.length > 0 && <ul className="pm-tf__error pm-upload-problems" role="alert">{problems.map((p, i) => <li key={`${i}-${p}`}>{p}</li>)}</ul>}
        <ul className="pm-files" aria-label="Uploads">
          {items.map((u) => (
            <li key={u.key} className="pm-file pm-file--upload">
              <div className="pm-file__text">
                <span className="pm-file__name pm-truncate">{u.file.name}</span>
                {u.state === 'error' ? <span className="pm-tf__error" role="alert">Upload failed: {u.error}</span>
                  : <span className="pm-res__bar" role="progressbar" aria-label={`Uploading ${u.file.name}`} aria-valuenow={u.pct} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${u.pct}%` }} /></span>}
              </div>
              {u.state === 'error' ? <Button size="sm" icon="restore" onClick={() => run(u)}>Retry</Button>
                : u.state === 'done' ? <span className="pm-res__ok"><Icon name="check" size={14} />Uploaded</span>
                : <span className="pm-faint pm-num">{u.state === 'queued' ? 'Waiting' : `${u.pct}%`}</span>}
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}

// ───────────── add link / embed ─────────────
function AddLinkModal({ projectId, mode: initialMode, collections, initial, onClose }: { projectId: string; mode: 'link' | 'embed'; collections: Collection[]; initial: string | null; onClose: () => void }) {
  const [mode, setMode] = useState(initialMode);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState(initial ?? '');
  const [det, setDet] = useState<LinkDetection | null>(null);
  const [detErr, setDetErr] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const v = url.trim();
    setDet(null); setDetErr(null);
    if (!v) { setChecking(false); return; }
    setChecking(true);
    const n = ++seq.current;
    const t = setTimeout(() => {
      call('resources.detect', { url: v }).then((d) => { if (n === seq.current) { setDet(d); setChecking(false); } })
        .catch((e: ApiError) => { if (n === seq.current) { setDetErr(e.message); setChecking(false); } });
    }, 350);
    return () => clearTimeout(t);
  }, [url]);

  const embedOk = mode === 'link' || !!det?.embeddable;
  const can = !!det && !detErr && embedOk && !checking;
  const submit = async () => {
    if (!can) return;
    setBusy(true);
    try {
      await call('resources.addLink', { projectId, collectionId: target || null, url: url.trim(), asEmbed: mode === 'embed', ...(title.trim() ? { title: title.trim() } : {}) });
      refresh();
      toast.success(mode === 'embed' ? 'Embed added' : 'Link added');
      onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not add it'); setBusy(false); }
  };

  return (
    <Modal
      open size="lg" title={mode === 'embed' ? 'Add embed' : 'Add link'} onClose={onClose}
      description={mode === 'embed' ? 'Show a video, document, design or page inside the project.' : 'Save a web address in this collection.'}
      onSubmit={(e) => { e.preventDefault(); void submit(); }}
      footer={<><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={busy} disabled={!can}>{mode === 'embed' ? 'Add embed' : 'Add link'}</Button></>}
    >
      <div className="pm-prompt">
        <div className="pm-seg" role="group" aria-label="Type"><button type="button" className={cx('pm-seg__btn', mode === 'link' && 'is-on')} aria-pressed={mode === 'link'} onClick={() => setMode('link')}>Link</button><button type="button" className={cx('pm-seg__btn', mode === 'embed' && 'is-on')} aria-pressed={mode === 'embed'} onClick={() => setMode('embed')}>Embed</button></div>
        <Field label="Web address" required error={detErr}>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" inputMode="url" autoComplete="off" spellCheck={false} maxLength={2000} invalid={!!detErr} data-autofocus />
        </Field>
        {checking && <p className="pm-faint pm-res__detect">Checking the address…</p>}
        {det && !detErr && (
          <div className="pm-res__detect">
            <span className="pm-res__badge is-embed">{det.providerLabel}</span>
            {mode === 'embed' ? (
              det.embeddable ? <span>{det.embedAccess === 'works' ? 'Can be shown inside the project.' : det.embedAccess === 'needs_sharing' ? 'Can be shown if the original is shared.' : 'May refuse to load.'}</span>
                : <span className="pm-danger-text">{det.embedError}</span>
            ) : (
              <span>{det.embeddable && det.provider !== 'website' ? <>This can be embedded. <button type="button" className="pm-linkbtn" onClick={() => setMode('embed')}>Add as embed instead</button></> : 'Saved as an external link that opens in a new tab.'}</span>
            )}
          </div>
        )}
        <Field label="Title" hint={det ? `Leave empty to use “${det.suggestedTitle}”` : 'Optional'}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder={det?.suggestedTitle ?? ''} />
        </Field>
        <Field label="Collection">
          <Select<string> value={target} options={[{ value: '', label: 'Unsorted' }, ...folderOptions(collections)]} onChange={setTarget} ariaLabel="Collection" />
        </Field>
        {mode === 'embed' && det?.embeddable && det.embedUrl && (
          <div className="pm-res__embedwrap">
            <p className="pm-res__preview-label">Preview</p>
            <EmbedFrame src={det.embedUrl} title="Embed preview" />
            {det.note && <p className="pm-res__note"><Icon name="info" size={14} />{det.note}</p>}
          </div>
        )}
      </div>
    </Modal>
  );
}

