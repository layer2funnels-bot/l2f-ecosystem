// Optional "Gallery" view: every image and video in the project (task attachments and Collection files), with a lightbox.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GalleryItem, ProjectDetail } from '../../../../shared/api.ts';
import { call } from '../../../api/client.ts';
import { useQuery } from '../../../api/store.ts';
import { cx, relTime } from '../../../lib/util.ts';
import { links, navigate } from '../../../router.ts';
import { Button, IconButton } from '../../../ui/Button.tsx';
import { EmptyState, ErrorState, Skeleton } from '../../../ui/Feedback.tsx';
import { Icon } from '../../../ui/icons.tsx';
import { Portal, useFocusTrap, useScrollLock } from '../../../ui/Overlay.tsx';
import { fmtBytes, freshFileUrl } from '../resourceKit.tsx';

type Filter = 'all' | 'image' | 'video';

export function GalleryView({ project: p }: { project: ProjectDetail }) {
  const q = useQuery(`gallery:${p.id}`, () => call('gallery.list', { projectId: p.id }), [], { refetchInterval: 8 * 60_000 });
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<number | null>(null);
  const items = q.data ?? [];
  const shown = useMemo(() => items.filter((i) => filter === 'all' || i.media === filter), [items, filter]);
  const counts = { all: items.length, image: items.filter((i) => i.media === 'image').length, video: items.filter((i) => i.media === 'video').length };

  return (
    <div className="pm-gal">
      <div className="pm-gal__bar">
        <div className="pm-seg" role="group" aria-label="Show">
          {([['all', 'All'], ['image', 'Images'], ['video', 'Videos']] as [Filter, string][]).map(([k, label]) => (
            <button key={k} type="button" className={cx('pm-seg__btn', filter === k && 'is-on')} aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}<span className="pm-faint"> {counts[k]}</span></button>
          ))}
        </div>
        <span className="pm-faint pm-gal__hint">Task attachments and Collection files</span>
      </div>
      {q.loading && !q.data ? (
        <div className="pm-gal__grid" role="status" aria-label="Loading gallery">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} height={200} radius={10} />)}</div>
      ) : q.error && !q.data ? (
        <ErrorState title="Couldn't load the gallery" message={q.error.message} onRetry={() => void q.refetch()} />
      ) : shown.length === 0 ? (
        <EmptyState icon="image" title={items.length ? `No ${filter === 'image' ? 'images' : 'videos'} here` : 'No images or videos yet'}
          text="Images and videos attached to tasks, or uploaded to this project’s Collection, show up here automatically." />
      ) : (
        <ul className="pm-gal__grid">
          {shown.map((it, i) => (
            <li key={`${it.source}-${it.id}`}>
              <button type="button" className="pm-gal__tile" onClick={() => setOpen(i)} aria-label={`Open ${it.name}`}>
                <span className="pm-gal__media">
                  {!it.url
                    ? <span className="pm-gal__play" aria-hidden="true"><Icon name={it.media === 'image' ? 'image' : 'video'} size={22} /></span>
                    : it.media === 'image'
                    ? <img src={it.url} alt={it.name} loading="lazy" />
                    : <><video src={`${it.url}#t=0.1`} preload="metadata" muted playsInline tabIndex={-1} /><span className="pm-gal__play"><Icon name="play" size={18} /></span></>}
                </span>
                <span className="pm-gal__cap">
                  <span className="pm-gal__name pm-truncate">{it.name}</span>
                  <span className="pm-faint pm-truncate">{it.source === 'task' ? `Task: ${it.taskTitle}` : `Collection: ${it.collectionName ?? 'Unsorted'}`}</span>
                  <span className="pm-faint pm-truncate">{it.uploadedBy?.name ?? 'Someone'} · {relTime(it.createdAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open !== null && shown[open] && <Lightbox items={shown} index={open} projectId={p.id} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Lightbox({ items, index, projectId, onIndex, onClose }: { items: GalleryItem[]; index: number; projectId: string; onIndex: (i: number) => void; onClose: () => void }) {
  const it = items[index];
  const ref = useRef<HTMLDivElement>(null);
  const [fresh, setFresh] = useState<{ id: string; url: string; dl: string } | null>(null);
  useFocusTrap(ref, true);
  useScrollLock(true);

  useEffect(() => {
    let live = true;
    const op = it.source === 'task' ? 'attachments.fileUrl' : 'resources.fileUrl';
    void Promise.all([freshFileUrl(op, it.id), freshFileUrl(op, it.id, true)]).then(([url, dl]) => { if (live) setFresh({ id: it.id, url, dl }); }).catch(() => {});
    return () => { live = false; };
  }, [it.id, it.source]);

  const go = (d: number) => onIndex((index + d + items.length) % items.length);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  });

  const cur = fresh && fresh.id === it.id ? fresh : null;
  const src = cur?.url ?? it.url ?? undefined;
  const openSource = () => {
    onClose();
    if (it.source === 'task' && it.taskId) navigate(links.project(projectId, 'list', it.taskId));
    else navigate(`${links.project(projectId, 'collection')}?c=${it.collectionId ?? 'unsorted'}&r=${it.id}`);
  };
  return (
    <Portal>
      <div className="pm-lb" role="dialog" aria-modal="true" aria-label={`Viewing ${it.name}`} ref={ref} tabIndex={-1}>
        <div className="pm-lb__bar">
          <div className="pm-lb__title">
            <strong className="pm-truncate">{it.name}</strong>
            <span className="pm-truncate">{index + 1} of {items.length} · {fmtBytes(it.sizeBytes)} · {it.uploadedBy?.name ?? 'Someone'} · {relTime(it.createdAt)}</span>
          </div>
          <Button size="sm" icon={it.source === 'task' ? 'checkCircle' : 'layers'} onClick={openSource}>{it.source === 'task' ? 'Open task' : 'Open in Collection'}</Button>
          {cur ? <a className="pm-btn pm-btn--secondary pm-btn--sm" href={cur.dl} download={it.name}><Icon name="download" /><span className="pm-btn__label">Download</span></a>
            : <Button size="sm" icon="download" disabled>Download</Button>}
          <IconButton icon="x" label="Close" onClick={onClose} />
        </div>
        <div className="pm-lb__stage" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
          {items.length > 1 && <button type="button" className="pm-lb__nav pm-lb__nav--prev" aria-label="Previous (left arrow)" onClick={() => go(-1)}><Icon name="chevronLeft" size={22} /></button>}
          {it.media === 'image'
            ? <img key={it.id} src={src} alt={it.name} className="pm-lb__img" />
            : <video key={it.id} src={src} controls autoPlay className="pm-lb__img" />}
          {items.length > 1 && <button type="button" className="pm-lb__nav pm-lb__nav--next" aria-label="Next (right arrow)" onClick={() => go(1)}><Icon name="chevronRight" size={22} /></button>}
        </div>
        <p className="pm-lb__cap">{it.source === 'task' ? `On task: ${it.taskTitle}` : `In Collection: ${it.collectionName ?? 'Unsorted'}`}</p>
      </div>
    </Portal>
  );
}
