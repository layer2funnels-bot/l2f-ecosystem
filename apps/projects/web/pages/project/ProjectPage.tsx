import { useEffect, useRef, useState } from 'react';
import type { ProjectDetail, ProjectPatch, ViewKind, ViewPrefs } from '../../../shared/api.ts';
import { call } from '../../api/client.ts';
import { invalidate, setQueryData, useMutation, useQuery } from '../../api/store.ts';
import { absoluteLink, copyText, openInNewTab } from '../../lib/clipboard.ts';
import { contextMenuProps } from '../../ui/ContextMenu.tsx';
import type { CtxItem } from '../../ui/ContextMenu.tsx';
import { useProject } from '../../lib/data.ts';
import { FAVORITES_NOTE, useFavorites } from '../../lib/favorites.ts';
import { isPersonal, PERSONAL_TIP } from '../../lib/projectKind.ts';
import { useSession } from '../../lib/session.tsx';
import { cx, fmtDate, isOverdue } from '../../lib/util.ts';
import { links, navigate, PROJECT_VIEWS } from '../../router.ts';
import type { ProjectViewId as RouterViewId } from '../../router.ts';
import { AvatarStack, StatusMenu } from '../../ui/Badges.tsx';
import { Button, IconButton } from '../../ui/Button.tsx';
import { ConfirmDialog } from '../../ui/Dialog.tsx';
import { EmptyState, ErrorState, Skeleton } from '../../ui/Feedback.tsx';
import { openMenuFrom } from '../../ui/ContextMenu.tsx';
import { Icon } from '../../ui/icons.tsx';
import { Input } from '../../ui/Form.tsx';
import { Menu } from '../../ui/Menu.tsx';
import type { MenuItem } from '../../ui/Menu.tsx';
import { Tooltip } from '../../ui/Overlay.tsx';
import { Tabs } from '../../ui/Tabs.tsx';
import type { TabItem } from '../../ui/Tabs.tsx';
import { toast } from '../../ui/Toast.tsx';
import { NotFoundPage } from '../NotFoundPage.tsx';
import { ProjectFormModal } from '../projects/ProjectFormModal.tsx';
import { MembersModal } from './MembersModal.tsx';
import { NamePromptModal } from './NamePromptModal.tsx';
import { BoardView, CalendarView, DocsView, ListView, OverviewView, ReportView, TimelineView } from './views/index.ts';
import { ActivityView } from './views/ActivityView.tsx';
import { CollectionView } from './views/CollectionView.tsx';
import { DocsPagesView } from './views/DocsPagesView.tsx';
import { GalleryView } from './views/GalleryView.tsx';
import { OPTIONAL_VIEWS, useProjectViews, viewByRoute } from './resourceKit.tsx';
import { ViewGalleryButton } from './ViewGallery.tsx';
import type { OptionalViewKind, ViewId } from '../../../shared/api.ts';

type ProjectViewId = RouterViewId | 'report';
const TABS: (TabItem & { id: ProjectViewId })[] = [
  { id: 'overview', label: 'Overview', icon: 'overview' },
  { id: 'list', label: 'List', icon: 'list' },
  { id: 'board', label: 'Board', icon: 'board' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'timeline', label: 'Timeline', icon: 'timeline' },
  { id: 'report', label: 'Report', icon: 'bars' },
  { id: 'docs', label: 'Docs & links', icon: 'doc' },
];
const VIEW_LABEL = Object.fromEntries([...TABS.map((t) => [t.id, t.label]), ...OPTIONAL_VIEWS.map((v) => [v.route, v.label])]) as Record<string, string>;
const isViewKind = (v: string): v is ViewKind => (['overview', 'list', 'board', 'calendar', 'timeline'] as string[]).includes(v);

type Dialog = null | 'edit' | 'members' | 'duplicate' | 'template' | 'trash';

export function ProjectPage({ projectId, view }: { projectId: string; view: string | null }) {
  const q = useProject(projectId);
  if (q.loading && !q.data) return <ProjectSkeleton />;
  if (q.error && !q.data) {
    if (q.error.code === 'not_found') return <NotFoundPage kind="project" />;
    if (q.error.code === 'forbidden') return <NotFoundPage kind="forbidden" />;
    return <div className="pm-page"><ErrorState title="Couldn't load this project" message={q.error.message} onRetry={() => void q.refetch()} /></div>;
  }
  if (!q.data) return <ProjectSkeleton />;
  return <ProjectFrame project={q.data} view={view} />;
}

function ProjectSkeleton() {
  return (
    <div className="pm-page" role="status" aria-label="Loading project">
      <Skeleton width={280} height={28} />
      <div style={{ height: 12 }} />
      <Skeleton width={420} height={18} />
      <div style={{ height: 24 }} />
      <Skeleton height={300} radius={12} />
    </div>
  );
}

function ProjectFrame({ project: p, view }: { project: ProjectDetail; view: string | null }) {
  const manager = p.myRole === 'manager';
  const personal = isPersonal(p);
  const { user, org } = useSession();
  const favs = useFavorites(user.id, org.id);
  const favorite = favs.isFavorite(p.id);
  const trashed = !!p.deletedAt;
  const archived = !!p.archivedAt;
  const readOnly = trashed;
  const active: string = ([...PROJECT_VIEWS, 'report', ...OPTIONAL_VIEWS.map((v) => v.route)] as readonly string[]).includes(view ?? '') ? (view as string) : p.defaultView;
  const activeOptional = viewByRoute(active);
  const viewsQ = useProjectViews(p.id);
  const addedKinds: OptionalViewKind[] = viewsQ.data?.kinds ?? [];
  const labelOf = (id: string): string => viewsQ.data?.labels[id as ViewId] ?? VIEW_LABEL[id];
  const [renamingTab, setRenamingTab] = useState<string | null>(null);
  const renameTab = async (id: string, raw: string) => {
    setRenamingTab(null);
    const label = raw.trim().slice(0, 40);
    if (label === labelOf(id)) return;
    if (label === VIEW_LABEL[id] && !viewsQ.data?.labels[id as ViewId]) return;
    try {
      await call('views.rename', { projectId: p.id, view: id as ViewId, label: label && label !== VIEW_LABEL[id] ? label : null });
      invalidate('views');
      toast.success(label && label !== VIEW_LABEL[id] ? 'View renamed' : 'View name reset');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not rename the view'); }
  };
  const canEditViews = p.myRole !== 'viewer' && !readOnly;
  const [removingView, setRemovingView] = useState<OptionalViewKind | null>(null);
  const [viewBusy, setViewBusy] = useState(false);
  const addView = async (kind: OptionalViewKind) => {
    const meta = OPTIONAL_VIEWS.find((v) => v.kind === kind)!;
    if (!addedKinds.includes(kind)) {
      setViewBusy(true);
      try {
        await call('views.add', { projectId: p.id, kind });
        invalidate('views', 'activity');
        toast.success(`${meta.label} view added to this project`);
      } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not add the view'); setViewBusy(false); return; }
      setViewBusy(false);
    }
    navigate(links.project(p.id, meta.route));
  };
  const removeView = async (kind: OptionalViewKind) => {
    const meta = OPTIONAL_VIEWS.find((v) => v.kind === kind)!;
    try {
      await call('views.remove', { projectId: p.id, kind });
      invalidate('views', 'activity');
      toast.success(`${meta.label} view removed. Its data is kept.`);
      if (active === meta.route) navigate(links.project(p.id, p.defaultView));
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not remove the view'); }
  };
  const [dialog, setDialog] = useState<Dialog>(null);
  const [renaming, setRenaming] = useState(false);

  const keys = ['project', 'projects', 'portfolio'];
  const update = useMutation((patch: ProjectPatch) => call('projects.update', { id: p.id, patch }), {
    onMutate: (patch) => {
      const { clientId: _c, ownerId: _o, ...plain } = patch;
      return setQueryData<ProjectDetail>(`project:${p.id}`, (old) => ({ ...old, ...plain }));
    },
    invalidate: keys,
  });
  const archive = useMutation((on: boolean) => call(on ? 'projects.archive' : 'projects.unarchive', { id: p.id }), {
    invalidate: [...keys, 'workload'],
    onSuccess: (_r, on) => toast.success(on ? 'Project archived' : 'Project unarchived', {
      action: { label: 'Undo', onClick: () => void call(on ? 'projects.unarchive' : 'projects.archive', { id: p.id }).then(() => invalidate(...keys)).catch((e: Error) => toast.error(e.message)) },
    }),
  });
  const trash = useMutation(() => call('projects.trash', { id: p.id }), {
    invalidate: [...keys, 'workload'],
    onSuccess: () => {
      toast.success(`Moved “${p.name}” to trash`, {
        action: { label: 'Undo', onClick: () => void call('projects.restore', { id: p.id }).then(() => invalidate(...keys, 'workload')).catch((e: Error) => toast.error(e.message)) },
      });
      navigate(links.projects);
    },
  });
  const restore = useMutation(() => call('projects.restore', { id: p.id }), { invalidate: [...keys, 'workload'], success: 'Project restored' });

  const setView = (id: string) => navigate(links.project(p.id, id));
  const setDefault = (id: string) => { if (isViewKind(id)) void update.mutate({ defaultView: id }).then((r) => { if (r) toast.success(`${labelOf(id)} is now the default view`); }); };

  const menuItems: MenuItem[] = trashed
    ? [{ id: 'restore', icon: 'restore', label: 'Restore project', onSelect: () => void restore.mutate(undefined) }]
    : [
        { id: 'copylink', icon: 'link', label: 'Copy link', onSelect: () => void copyText(absoluteLink(links.project(p.id, active)), 'Link copied') },
        { id: 'edit', icon: 'edit', label: 'Edit details', separatorBefore: true, disabled: !manager, hint: manager ? undefined : 'Managers only', onSelect: () => setDialog('edit') },
        { id: 'members', icon: 'users', label: manager ? 'Manage members' : 'View members', disabled: personal, hint: personal ? 'Private to you' : undefined, onSelect: () => setDialog('members') },
        { id: 'dup', icon: 'copy', label: 'Duplicate…', separatorBefore: true, onSelect: () => setDialog('duplicate') },
        { id: 'tpl', icon: 'star', label: 'Save as template…', onSelect: () => setDialog('template') },
        { id: 'def', icon: 'overview', label: `Set ${labelOf(active)} as default view`, disabled: !manager || !isViewKind(active) || p.defaultView === active, hint: p.defaultView === active ? 'Current' : undefined, onSelect: () => setDefault(active) },
        archived
          ? { id: 'unarch', icon: 'archive', label: 'Unarchive', separatorBefore: true, disabled: !manager, onSelect: () => void archive.mutate(false) }
          : { id: 'arch', icon: 'archive', label: 'Archive', separatorBefore: true, disabled: !manager, onSelect: () => void archive.mutate(true) },
        { id: 'trash', icon: 'trash', label: 'Move to trash…', danger: true, disabled: !manager, onSelect: () => setDialog('trash') },
      ];

  // Per-person pinned views live in viewprefs (shared cache key with List / Board).
  const prefsQ = useQuery(`viewprefs:${p.id}`, () => call('viewprefs.get', { projectId: p.id }), []);
  const pinned: string[] = (prefsQ.data?.pinned ?? []) as string[];
  const togglePin = async (id: string) => {
    const on = !pinned.includes(id);
    const next = on ? [...pinned, id] : pinned.filter((x) => x !== id);
    const undo = setQueryData<ViewPrefs>(`viewprefs:${p.id}`, (old) => ({ ...old, pinned: next as ViewPrefs['pinned'] }));
    try {
      const cur = await call('viewprefs.get', { projectId: p.id });
      await call('viewprefs.set', { projectId: p.id, prefs: { ...cur, pinned: next as ViewPrefs['pinned'] } });
      toast.success(on ? `${labelOf(id)} pinned for you` : `${labelOf(id)} unpinned`);
    } catch (e) { undo(); toast.error(e instanceof Error ? e.message : 'Could not save your pinned views'); }
  };
  const tabItemsFor = (id: string): CtxItem[] => {
    const opt = viewByRoute(id);
    if (opt) {
      const out: CtxItem[] = [
        ...(canEditViews ? [{ id: 'rename', icon: 'edit' as const, label: 'Rename view', onSelect: () => setRenamingTab(id) }] : []),
        { id: 'copy', icon: 'link', label: 'Copy link to this view', separatorBefore: canEditViews, onSelect: () => void copyText(absoluteLink(links.project(p.id, id)), 'Link copied') },
        { id: 'newtab', icon: 'external', label: 'Open in new tab', onSelect: () => openInNewTab(links.project(p.id, id)) },
      ];
      if (canEditViews) out.push({ id: 'remove', icon: 'trash', label: 'Remove view…', danger: true, separatorBefore: true, onSelect: () => setRemovingView(opt.kind) });
      return out;
    }
    const items: CtxItem[] = [];
    if (canEditViews) items.push({ id: 'rename', icon: 'edit', label: 'Rename view', onSelect: () => setRenamingTab(id) });
    if (manager && !readOnly && isViewKind(id)) {
      items.push(p.defaultView === id
        ? { id: 'default', icon: 'check', label: 'Default view', disabled: true, disabledReason: `${labelOf(id)} is already the default view` }
        : { id: 'default', icon: 'overview', label: 'Set as default view', onSelect: () => setDefault(id) });
    }
    items.push(
      { id: 'pin', icon: 'pin', label: pinned.includes(id) ? 'Unpin view for me' : 'Pin view for me', onSelect: () => void togglePin(id) },
      { id: 'copy', icon: 'link', label: 'Copy link to this view', separatorBefore: true, onSelect: () => void copyText(absoluteLink(links.project(p.id, id)), 'Link copied') },
      { id: 'newtab', icon: 'external', label: 'Open in new tab', onSelect: () => openInNewTab(links.project(p.id, id)) },
    );
    return items;
  };

  const late = isOverdue(p.dueOn, p.status === 'complete');
  const editProps = (id: string) => ({ initial: labelOf(id), onCommit: (v: string) => void renameTab(id, v), onCancel: () => setRenamingTab(null) });
  const tabsWithBadges: TabItem[] = [
    ...TABS.map((t) => ({
      ...t,
      label: labelOf(t.id),
      ...(renamingTab === t.id ? { edit: editProps(t.id) } : {}),
      ...(t.id === 'docs' && p.links.length ? { badge: p.links.length } : {}),
      mark: (
        <>
          {pinned.includes(t.id) && <Icon name="pin" size={11} className="pm-tab__pin" aria-label="Pinned" />}
          {isViewKind(t.id) && p.defaultView === t.id && <span className="pm-tab-default" title="The default view of this project">Default</span>}
        </>
      ),
    })),
    ...addedKinds.map((k) => OPTIONAL_VIEWS.find((v) => v.kind === k)!).map((v): TabItem => ({
      id: v.route, label: labelOf(v.route), icon: v.icon,
      ...(renamingTab === v.route ? { edit: editProps(v.route) } : {}),
      mark: (
        <span
          className="pm-tab__more" role="presentation" title="More actions (or right-click)"
          onClick={(e) => { e.stopPropagation(); openMenuFrom(e.currentTarget.parentElement as HTMLElement); }}
        ><Icon name="more" size={13} /></span>
      ),
    })),
  ];

  return (
    <div className="pm-project">
      {trashed && (
        <div className="pm-banner pm-banner--danger" role="status">
          <Icon name="trash" /><span><strong>This project is in the trash.</strong> It's read-only until restored.</span>
          <Button size="sm" icon="restore" loading={restore.loading} onClick={() => void restore.mutate(undefined)}>Restore</Button>
        </div>
      )}
      {archived && !trashed && (
        <div className="pm-banner" role="status">
          <Icon name="archive" /><span><strong>This project is archived.</strong> It stays readable but is hidden from active lists.</span>
          {manager && <Button size="sm" loading={archive.loading} onClick={() => void archive.mutate(false)}>Unarchive</Button>}
        </div>
      )}

      <header className="pm-phead">
        <div className="pm-phead__row">
          <span className="pm-phead__swatch" style={{ background: p.color }} aria-hidden="true" />
          <ProjectTitle name={p.name} editing={renaming} canEdit={manager && !readOnly} onEdit={() => setRenaming(true)} onDone={() => setRenaming(false)} onSave={(name) => void update.mutate({ name })} />
          <IconButton
            icon="star"
            className={cx('pm-phead__fav', favorite && 'is-fav')}
            aria-pressed={favorite}
            label={favorite ? 'Remove from favorites' : 'Add to favorites'}
            tooltip={`${favorite ? 'Remove from favorites' : 'Add to favorites'} (${FAVORITES_NOTE.toLowerCase()})`}
            onClick={() => favs.toggle(p.id)}
          />
          <div className="pm-phead__spacer" />
          <Menu
            items={menuItems}
            align="end"
            label="Project actions"
            trigger={(t) => <IconButton icon="more" label="Project actions" {...t} />}
          />
        </div>
        <div className="pm-phead__meta">
          <StatusMenu kind="project" value={p.status} onChange={(status) => void update.mutate({ status })} disabled={!manager || readOnly} />
          {personal ? (
            <Tooltip label={PERSONAL_TIP}><span className="pm-phead__badge pm-phead__badge--personal"><Icon name="lock" size={12} />Personal · private</span></Tooltip>
          ) : p.clientName ? (
            <span className="pm-phead__badge pm-phead__badge--client" title={`Client: ${p.clientName}`}><Icon name="building" size={12} /><span className="pm-truncate">{p.clientName}</span></span>
          ) : (
            <span className="pm-phead__badge"><Icon name="folder" size={12} />Internal</span>
          )}
          <span className={cx('pm-phead__item', late ? 'pm-danger-text' : 'pm-muted')}>
            <Icon name="calendar" size={14} />
            {p.dueOn ? `Due ${fmtDate(p.dueOn)}${late ? ' · overdue' : ''}` : 'No due date'}
          </span>
          {personal ? (
            <Tooltip label={PERSONAL_TIP}><span className="pm-phead__item pm-muted"><Icon name="lock" size={14} />Private to you</span></Tooltip>
          ) : (
            <span className="pm-phead__item pm-muted">
              <Icon name={p.visibility === 'members' ? 'users' : 'globe'} size={14} />
              {p.visibility === 'members' ? 'Members only' : 'Whole organization'}
            </span>
          )}
          <Tooltip label={personal ? PERSONAL_TIP : undefined}>
            <button
              type="button"
              className="pm-phead__members"
              aria-disabled={personal || undefined}
              onClick={() => { if (!personal) setDialog('members'); }}
              aria-label={personal ? `Members: only you. ${PERSONAL_TIP}` : `Members (${p.members.length}). ${manager ? 'Manage' : 'View'}`}
            >
              <AvatarStack people={p.members} max={5} size={24} />
              <span className="pm-muted">{personal ? 'Only you' : manager ? 'Manage' : 'Members'}</span>
            </button>
          </Tooltip>
        </div>
      </header>

      <Tabs
        ariaLabel="Project views" items={tabsWithBadges} value={active} onChange={setView} className="pm-project__tabs"
        itemProps={(id) => contextMenuProps(() => tabItemsFor(id), { label: `${labelOf(id)} view options` })}
        trailing={canEditViews ? <ViewGalleryButton added={addedKinds} busy={viewBusy} onPick={(k) => void addView(k)} /> : undefined}
      />

      <div className="pm-project__body" role="tabpanel" aria-label={labelOf(active)}>
        {active === 'overview' && <OverviewView project={p} />}
        {active === 'list' && <ListView project={p} />}
        {active === 'board' && <BoardView project={p} />}
        {active === 'calendar' && <CalendarView project={p} />}
        {active === 'timeline' && <TimelineView project={p} />}
        {active === 'docs' && <DocsView project={p} />}
        {active === 'report' && <ReportView project={p} />}
        {activeOptional && !viewsQ.data && !viewsQ.error && <ProjectSkeleton />}
        {activeOptional && (viewsQ.data || viewsQ.error) && !addedKinds.includes(activeOptional.kind) && (
          <EmptyState
            icon={activeOptional.icon} title={`${activeOptional.label} isn’t added to this project`} text={activeOptional.description}
            action={canEditViews ? <Button variant="primary" icon="plus" loading={viewBusy} onClick={() => void addView(activeOptional.kind)}>Add {activeOptional.label} view</Button> : <span className="pm-faint">Ask an editor to add it.</span>}
          />
        )}
        {activeOptional?.kind === 'gallery' && addedKinds.includes('gallery') && <GalleryView project={p} />}
        {activeOptional?.kind === 'activity' && addedKinds.includes('activity') && <ActivityView project={p} />}
        {activeOptional?.kind === 'docs' && addedKinds.includes('docs') && <DocsPagesView project={p} />}
        {activeOptional?.kind === 'collection' && addedKinds.includes('collection') && <CollectionView project={p} />}
      </div>

      {dialog === 'edit' && <ProjectFormModal open project={p} onClose={() => setDialog(null)} />}
      {dialog === 'members' && !personal && <MembersModal open project={p} canManage={manager && !readOnly} onClose={() => setDialog(null)} />}
      {dialog === 'duplicate' && (
        <NamePromptModal
          open title="Duplicate project" description="Copies tasks, sections and settings into a new project." confirmLabel="Duplicate" initial={`${p.name} (copy)`}
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            try {
              const np = await call('projects.duplicate', { id: p.id, name });
              invalidate('projects', 'portfolio', 'workload');
              toast.success(`Created “${np.name}”`);
              navigate(links.project(np.id));
              return true;
            } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not duplicate'); return false; }
          }}
        />
      )}
      {dialog === 'template' && (
        <NamePromptModal
          open title="Save as template" description="Templates keep the structure so new projects can start from it." confirmLabel="Save template" initial={`${p.name} template`}
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            try {
              await call('projects.duplicate', { id: p.id, name, asTemplate: true });
              invalidate('projects');
              toast.success('Saved as template', { action: { label: 'View templates', onClick: () => navigate(links.projects + '?tab=templates') } });
              return true;
            } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save the template'); return false; }
          }}
        />
      )}
      <ConfirmDialog
        open={removingView !== null}
        danger
        title={`Remove the ${removingView ? labelOf(OPTIONAL_VIEWS.find((v) => v.kind === removingView)!.route) : ''} view?`}
        message="The view disappears from this project’s tabs. Nothing it shows is deleted, and you can add it back at any time."
        confirmLabel="Remove view"
        onClose={() => setRemovingView(null)}
        onConfirm={async () => { if (removingView) await removeView(removingView); setRemovingView(null); }}
      />
      <ConfirmDialog
        open={dialog === 'trash'}
        danger
        title="Move this project to trash?"
        message={<>“{p.name}” will leave your lists and become read-only. You can restore it from Trash at any time.</>}
        confirmLabel="Move to trash"
        onClose={() => setDialog(null)}
        onConfirm={async () => { await trash.mutate(undefined); setDialog(null); }}
      />
    </div>
  );
}

function ProjectTitle({ name, editing, canEdit, onEdit, onDone, onSave }: { name: string; editing: boolean; canEdit: boolean; onEdit: () => void; onDone: () => void; onSave: (n: string) => void }) {
  const [value, setValue] = useState(name);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) { setValue(name); ref.current?.focus(); ref.current?.select(); } }, [editing, name]);
  const commit = () => {
    const v = value.trim();
    onDone();
    if (!v) { toast.error('A project needs a name.'); return; }
    if (v !== name) onSave(v);
  };
  if (editing) {
    return (
      <Input
        ref={ref}
        wrapClassName="pm-phead__rename"
        value={value}
        aria-label="Project name"
        maxLength={140}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onDone(); }
        }}
      />
    );
  }
  if (!canEdit) return <h1 className="pm-phead__name pm-truncate">{name}</h1>;
  return (
    <h1 className="pm-phead__name pm-truncate">
      <button type="button" className="pm-phead__namebtn" onClick={onEdit} aria-label={`${name}. Rename project`} title="Click to rename">
        <span className="pm-truncate">{name}</span>
        <Icon name="edit" size={13} className="pm-phead__pencil" />
      </button>
    </h1>
  );
}
