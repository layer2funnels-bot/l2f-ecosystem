import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { ProjectKind, ProjectSummary } from '../../shared/api.ts';
import { FAVORITES_NOTE, useFavorites } from '../lib/favorites.ts';
import { useProjects } from '../lib/data.ts';
import { useSession } from '../lib/session.tsx';
import { cx, lsGet, lsSet } from '../lib/util.ts';
import { links, useRoute } from '../router.ts';
import { Icon } from '../ui/icons.tsx';
import type { IconName } from '../ui/icons.tsx';
import { IconButton } from '../ui/Button.tsx';
import { Skeleton } from '../ui/Feedback.tsx';
import { Input } from '../ui/Form.tsx';

import { openMenuFrom } from '../ui/ContextMenu.tsx';
import { projectMenuProps, spaceMenuProps } from '../lib/projectMenu.tsx';
import { useShell } from './ShellContext.tsx';

const NAV: { id: string; label: string; icon: IconName; href: string; match: string }[] = [
  { id: 'home', label: 'Home', icon: 'home', href: links.home, match: 'home' },
  { id: 'my-work', label: 'My Work', icon: 'checkCircle', href: links.myWork, match: 'my-work' },
  { id: 'workload', label: 'Workload', icon: 'workload', href: links.workload, match: 'workload' },
  { id: 'portfolio', label: 'Portfolio', icon: 'bars', href: links.portfolio, match: 'portfolio' },
];

/** Above this many projects the filter box is always visible; below it hides behind a search icon. */
const FILTER_ALWAYS_AT = 8;
const openKey = (orgId: string) => `pm.sidebar.open.${orgId}`;
const byName = (a: ProjectSummary, b: ProjectSummary) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

function loadOpen(orgId: string): Record<string, boolean> {
  try {
    const parsed: unknown = JSON.parse(lsGet(openKey(orgId)) ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, boolean>) : {};
  } catch { return {}; }
}

export function Sidebar({ onNavigate, onCollapse, mobile }: { onNavigate: () => void; onCollapse: () => void; mobile: boolean }) {
  const { org, user, canCreate } = useSession();
  const route = useRoute();
  const { openNewProject } = useShell();
  const projects = useProjects('active');
  const favs = useFavorites(user.id, org.id);

  // ---- collapsed / expanded state, per organization ----
  const [open, setOpenMap] = useState<Record<string, boolean>>(() => loadOpen(org.id));
  const isOpen = (key: string, fallback: boolean) => open[key] ?? fallback;
  const setOpen = useCallback((key: string, value: boolean) => {
    setOpenMap((cur) => {
      if ((cur[key] ?? undefined) === value) return cur;
      const next = { ...cur, [key]: value };
      lsSet(openKey(org.id), JSON.stringify(next));
      return next;
    });
  }, [org.id]);

  // ---- filter ----
  const [filter, setFilter] = useState('');
  const [filterShown, setFilterShown] = useState(false);
  const total = projects.data?.length ?? 0;
  const needle = filter.trim().toLowerCase();
  const showFilter = total > FILTER_ALWAYS_AT || filterShown || needle !== '';

  const all = projects.data ?? [];
  const shown = useMemo(() => all.filter((p) => !needle || p.name.toLowerCase().includes(needle) || (p.clientName ?? '').toLowerCase().includes(needle)), [all, needle]);
  const groups = useMemo(() => {
    const clients = new Map<string, { id: string; name: string; list: ProjectSummary[] }>();
    const internal: ProjectSummary[] = [];
    const personal: ProjectSummary[] = [];
    for (const p of shown) {
      if (p.kind === 'personal') personal.push(p);
      else if (p.kind === 'internal') internal.push(p);
      else {
        const id = p.clientId ?? p.clientName ?? 'unknown';
        const g = clients.get(id) ?? { id, name: p.clientName ?? 'No client', list: [] };
        g.list.push(p);
        clients.set(id, g);
      }
    }
    const folders = [...clients.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    for (const f of folders) f.list.sort(byName);
    return {
      folders, clientCount: folders.reduce((n, f) => n + f.list.length, 0),
      internal: internal.sort(byName), personal: personal.sort(byName),
      favorites: shown.filter((p) => favs.ids.includes(p.id)).sort(byName),
    };
  }, [shown, favs.ids]);

  // The project you are looking at: make sure its space and client folder are open.
  const active = all.find((p) => p.id === route.projectId) ?? null;
  const activeId = active?.id;
  useEffect(() => {
    if (!active) return;
    setOpen(active.kind === 'personal' ? 'space:personal' : active.kind === 'internal' ? 'space:internal' : 'space:clients', true);
    if (active.kind === 'client') setOpen(`folder:${active.clientId ?? active.clientName ?? 'unknown'}`, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);


  const add = (kind: ProjectKind) => { openNewProject({ kind }); onNavigate(); };
  const everyKey = ['space:fav', 'space:clients', 'space:internal', 'space:personal', ...groups.folders.map((f) => `folder:${f.id}`)];
  const expandAll = () => { for (const k of everyKey) setOpen(k, true); };
  const collapseAll = () => { for (const k of everyKey) setOpen(k, false); };
  const spaceMenu = (label: string, kind: ProjectKind, key: string, fallback: boolean, clientId?: string) =>
    spaceMenuProps({ label, kind, clientId, open: isOpen(key, fallback), onToggle: (v) => setOpen(key, v), onExpandAll: expandAll, onCollapseAll: collapseAll, onNavigate });
  const row = (p: ProjectSummary, key: string) => (
    <ProjectRow key={key} p={p} active={route.projectId === p.id} favorite={favs.isFavorite(p.id)} onFavorite={() => favs.toggle(p.id)} onNavigate={onNavigate} />
  );
  const filtering = needle !== '';
  const loading = projects.loading && !projects.data;
  const nothingMatches = filtering && !!projects.data && shown.length === 0;

  return (
    <aside className="pm-sidebar" aria-label="Sidebar">
      <div className="pm-sidebar__top">
        {/* the shell's header names the app and the organization (and switches it); the sidebar starts with its pages */}
        <span className="pm-sidebar__spacer" />
        {!mobile && <IconButton icon="panelLeft" label="Collapse sidebar" tooltip="Collapse sidebar ([)" size="sm" onClick={onCollapse} />}
      </div>

      <nav className="pm-sidebar__nav" aria-label="Primary">
        <ul className="pm-nav">
          {NAV.map((n) => (
            <li key={n.id}>
              <a href={n.href} className={cx('pm-nav__item', route.name === n.match && 'is-active')} aria-current={route.name === n.match ? 'page' : undefined} onClick={onNavigate}>
                <Icon name={n.icon} />
                <span>{n.label}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="pm-sidebar__projects">
        <div className="pm-nav__section">
          <a href={links.projects} className={cx('pm-nav__heading', route.name === 'projects' && 'is-active')} onClick={onNavigate}>Projects</a>
          <span className="pm-nav__tools">
            {total <= FILTER_ALWAYS_AT && !filtering && (
              <IconButton icon="search" label={filterShown ? 'Hide project filter' : 'Filter projects'} size="sm" className="pm-sbrow__btn pm-reveal" aria-expanded={filterShown} onClick={() => setFilterShown((s) => !s)} />
            )}
            {canCreate && <IconButton icon="plus" label="New project" size="sm" className="pm-sbrow__btn pm-reveal" onClick={() => add('client')} />}
          </span>
        </div>
        {showFilter && (
          <div className="pm-sbfilter">
            <Input
              size="sm"
              data-sidebar-filter
              autoFocus={filterShown && total <= FILTER_ALWAYS_AT}
              leading={<Icon name="search" size={14} />}
              value={filter}
              placeholder="Filter projects"
              aria-label="Filter projects"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (filter) setFilter(''); else { setFilterShown(false); (e.target as HTMLElement).blur(); } }
              }}
              trailing={filter ? <button type="button" className="pm-sbfilter__clear" aria-label="Clear filter" title="Clear filter" onClick={() => setFilter('')}><Icon name="x" size={12} /></button> : undefined}
            />
          </div>
        )}

        <div className="pm-sidebar__scroll" role="presentation">
          {projects.error && !projects.data && <p className="pm-nav__note">Couldn&apos;t load projects. <button type="button" className="pm-linkbtn" onClick={() => void projects.refetch()}>Retry</button></p>}
          {nothingMatches && <p className="pm-nav__note" role="status">No matching projects</p>}

          {(groups.favorites.length > 0 || (loading && favs.ids.length > 0)) && (
            <Space
              id="fav" icon="star" label="Favorites" count={groups.favorites.length} loading={loading}
              open={filtering || isOpen('space:fav', true)} onToggle={(v) => setOpen('space:fav', v)}
              note={FAVORITES_NOTE} filled
            >
              {loading ? <RowSkeleton rows={Math.min(favs.ids.length, 3)} /> : <ul className="pm-nav">{groups.favorites.map((p) => row(p, `fav-${p.id}`))}</ul>}
            </Space>
          )}

          {!nothingMatches && (!filtering || groups.clientCount > 0) && (
            <Space
              id="clients" menu={spaceMenu('Clients', 'client', 'space:clients', true)} icon="users" label="Clients" count={groups.clientCount} loading={loading}
              open={filtering || isOpen('space:clients', true)} onToggle={(v) => setOpen('space:clients', v)}
              onAdd={canCreate ? () => add('client') : undefined} addLabel="New client project"
            >
              {loading ? <RowSkeleton rows={3} /> : groups.folders.length === 0 ? <p className="pm-nav__note">No client projects yet.</p> : groups.folders.map((f) => {
                const key = `folder:${f.id}`;
                const fopen = filtering || isOpen(key, false);
                return (
                  <div key={f.id} className="pm-folder">
                    <button type="button" className="pm-folder__toggle" {...spaceMenu(f.name, 'client', key, false, f.id)} aria-expanded={fopen} onClick={() => setOpen(key, !fopen)} title={f.name}>
                      <Icon name="chevronRight" size={12} className={cx('pm-chev', fopen && 'is-open')} />
                      <Icon name="folder" size={14} />
                      <span className="pm-truncate">{f.name}</span>
                      <span className="pm-count pm-num">{f.list.length}</span>
                    </button>
                    {fopen && <ul className="pm-nav pm-folder__list">{f.list.map((p) => row(p, p.id))}</ul>}
                  </div>
                );
              })}
            </Space>
          )}

          {!nothingMatches && (!filtering || groups.internal.length > 0) && (
            <Space
              id="internal" menu={spaceMenu(org.name, 'internal', 'space:internal', true)} icon="building" label={org.name} count={groups.internal.length} loading={loading}
              open={filtering || isOpen('space:internal', true)} onToggle={(v) => setOpen('space:internal', v)}
              onAdd={canCreate ? () => add('internal') : undefined} addLabel={`New ${org.name} project`}
            >
              {loading ? <RowSkeleton rows={2} /> : groups.internal.length === 0 ? <p className="pm-nav__note">No internal projects yet.</p> : <ul className="pm-nav">{groups.internal.map((p) => row(p, p.id))}</ul>}
            </Space>
          )}

          {!nothingMatches && (!filtering || groups.personal.length > 0) && (
            <Space
              id="personal" menu={spaceMenu('Personal', 'personal', 'space:personal', true)} icon="lock" label="Personal" count={groups.personal.length} loading={loading}
              open={filtering || isOpen('space:personal', true)} onToggle={(v) => setOpen('space:personal', v)}
              onAdd={canCreate ? () => add('personal') : undefined} addLabel="New personal project"
              note="Only you can see these"
            >
              <p className="pm-nav__caption"><Icon name="lock" size={11} /> Only you can see these</p>
              {loading ? <RowSkeleton rows={1} /> : groups.personal.length === 0 ? <p className="pm-nav__note">Nothing here yet.</p> : <ul className="pm-nav">{groups.personal.map((p) => row(p, p.id))}</ul>}
            </Space>
          )}
        </div>
      </div>

      <div className="pm-sidebar__foot">
        <ul className="pm-nav">
          <li>
            <a href={links.trash} className={cx('pm-nav__item', route.name === 'trash' && 'is-active')} aria-current={route.name === 'trash' ? 'page' : undefined} onClick={onNavigate}>
              <Icon name="trash" /><span>Trash</span>
            </a>
          </li>
        </ul>
      </div>
    </aside>
  );
}

function RowSkeleton({ rows }: { rows: number }) {
  return <div className="pm-nav__skeleton" aria-hidden="true">{Array.from({ length: Math.max(rows, 1) }, (_, i) => <Skeleton key={i} height={24} />)}</div>;
}

/** A collapsible space: icon, label, count, and a hover "+". */
function Space({ id, icon, label, count, open, onToggle, onAdd, addLabel, note, filled, loading, menu, children }: {
  id: string; icon: IconName; label: string; count: number; open: boolean; onToggle: (open: boolean) => void; menu?: ReturnType<typeof spaceMenuProps>;
  onAdd?: () => void; addLabel?: string; note?: string; filled?: boolean; loading?: boolean; children: ReactNode;
}) {
  return (
    <section className="pm-space" aria-label={label}>
      <div className="pm-space__head" {...menu}>
        <button type="button" className="pm-space__toggle" aria-expanded={open} aria-controls={`pm-space-${id}`} onClick={() => onToggle(!open)} title={note ? `${label}. ${note}` : label}>
          <Icon name="chevronRight" size={12} className={cx('pm-chev', open && 'is-open')} />
          <Icon name={icon} size={15} className={cx('pm-space__icon', filled && 'is-filled')} fill={filled ? 'currentColor' : undefined} />
          <span className="pm-truncate">{label}</span>
          {loading ? <Skeleton width={16} height={12} className="pm-space__countskel" /> : <span className="pm-count pm-num">{count}</span>}
        </button>
        {onAdd && <IconButton icon="plus" label={addLabel ?? 'New project'} size="sm" className="pm-space__add pm-sbrow__btn" onClick={onAdd} />}
      </div>
      {open && <div id={`pm-space-${id}`} className="pm-space__body">{children}</div>}
    </section>
  );
}

function ProjectRow({ p, active, favorite, onFavorite, onNavigate }: {
  p: ProjectSummary; active: boolean; favorite: boolean; onFavorite: () => void; onNavigate: () => void;
}) {
  const overdue = p.stats.overdue;
  const open = p.stats.open;
  const favLabel = favorite ? `Remove ${p.name} from favorites` : `Add ${p.name} to favorites`;
  return (
    <li className={cx('pm-sbrow', active && 'is-active', favorite && 'has-fav')} {...projectMenuProps(p, { onNavigate })}>
      <a href={links.project(p.id)} className="pm-sbrow__link" title={p.name} aria-current={active ? 'page' : undefined} onClick={onNavigate}>
        <span className="pm-dot pm-dot--lg" style={{ background: p.color }} aria-hidden="true" />
        <span className="pm-truncate">{p.name}</span>
        {overdue === 0 && open > 0 && <span className="pm-sbrow__count pm-num" title={`${open} open ${open === 1 ? 'task' : 'tasks'}`} aria-label={`${open} open ${open === 1 ? 'task' : 'tasks'}`}>{open}</span>}
        {overdue > 0 && <span className="pm-sbrow__badge pm-num" title={`${overdue} overdue ${overdue === 1 ? 'task' : 'tasks'}`} aria-label={`${overdue} overdue ${overdue === 1 ? 'task' : 'tasks'}`}>{overdue}</span>}
      </a>
      <span className="pm-sbrow__actions">
        <IconButton
          icon="star" size="sm" className={cx('pm-sbrow__btn pm-sbrow__star', favorite && 'is-fav')} aria-pressed={favorite}
          label={favLabel} tooltip={`${favorite ? 'Remove from favorites' : 'Add to favorites'} (${FAVORITES_NOTE.toLowerCase()})`}
          onClick={onFavorite}
        />
        <IconButton icon="more" size="sm" className="pm-sbrow__btn pm-sbrow__more" aria-haspopup="menu" label={`Actions for ${p.name}`} onClick={(e) => openMenuFrom(e.currentTarget)} />
      </span>
    </li>
  );
}
