// Right-click menu of a project (sidebar row, Projects page, Portfolio, Home recent cards, search results).
import type { ProjectSummary } from '../../shared/api.ts';
import { call, getOrgId } from '../api/client.ts';
import { invalidate } from '../api/store.ts';
import { links, navigate, parseHash } from '../router.ts';
import { contextMenuProps } from '../ui/ContextMenu.tsx';
import type { CtxItem } from '../ui/ContextMenu.tsx';
import { askConfirm, askForm } from '../ui/Prompt.tsx';
import { toast } from '../ui/Toast.tsx';
import { absoluteLink, copyText, openInNewTab } from './clipboard.ts';
import { isFavoriteNow, toggleFavoriteNow } from './favorites.ts';
import { getCanCreate, getMe } from './me.ts';
import { shell } from './shellBridge.ts';

const KEYS = ['projects', 'project', 'portfolio', 'workload'];
const errText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Please try again.');

export function projectMenuItems(p: ProjectSummary, o: { onNavigate?: () => void } = {}): CtxItem[] {
  const me = getMe();
  const orgId = getOrgId();
  const manager = p.myRole === 'manager';
  const editor = p.myRole !== 'viewer';
  const trashed = !!p.deletedAt;
  const archived = !!p.archivedAt;
  const fav = me && orgId ? isFavoriteNow(me.id, orgId, p.id) : false;
  const canCreate = getCanCreate();
  const mine = 'Managers only';
  const items: CtxItem[] = [
    { id: 'open', icon: 'arrowRight', label: 'Open', onSelect: () => { navigate(links.project(p.id)); o.onNavigate?.(); } },
    { id: 'newtab', icon: 'external', label: 'Open in new tab', onSelect: () => openInNewTab(links.project(p.id)) },
  ];
  if (me && orgId) {
    items.push({
      id: 'fav', icon: 'star', label: fav ? 'Remove from favorites' : 'Add to favorites', shortcut: 'This browser',
      onSelect: () => { const on = toggleFavoriteNow(me.id, orgId, p.id); toast.success(on ? 'Added to favorites' : 'Removed from favorites'); },
    });
  }
  items.push({ id: 'copy', icon: 'link', label: 'Copy link', onSelect: () => void copyText(absoluteLink(links.project(p.id)), 'Link copied') });
  if (trashed) return items;

  items.push(
    { id: 'newtask', icon: 'taskAdd', label: 'New task in project', separatorBefore: true, disabled: !editor || archived, disabledReason: archived ? 'This project is archived' : 'View-only access', onSelect: () => shell()?.openQuickAdd({ projectId: p.id }) },
    { id: 'edit', icon: 'edit', label: 'Edit details', disabled: !manager, disabledReason: mine, onSelect: () => shell()?.openEditProject(p.id) },
    {
      id: 'rename', icon: 'edit', label: 'Rename…', disabled: !manager, disabledReason: mine,
      onSelect: () => void askForm({ title: 'Rename project', fields: [{ name: 'name', label: 'Project name', initial: p.name, required: true, maxLength: 120 }], confirmLabel: 'Rename' }).then(async (r) => {
        if (!r || r.name === p.name) return;
        try { await call('projects.update', { id: p.id, patch: { name: r.name } }); invalidate(...KEYS); toast.success('Project renamed'); } catch (e) { toast.error(errText(e)); }
      }),
    },
  );
  if (canCreate) {
    items.push(
      {
        id: 'dup', icon: 'copy', label: 'Duplicate…',
        onSelect: () => void askForm({ title: 'Duplicate project', description: 'Copies tasks, sections and settings into a new project.', fields: [{ name: 'name', label: 'Name', initial: `${p.name} (copy)`, required: true, maxLength: 120 }], confirmLabel: 'Duplicate' }).then(async (r) => {
          if (!r) return;
          try { const np = await call('projects.duplicate', { id: p.id, name: r.name }); invalidate(...KEYS); toast.success(`Created “${np.name}”`); navigate(links.project(np.id)); } catch (e) { toast.error(errText(e)); }
        }),
      },
      {
        id: 'tpl', icon: 'star', label: 'Save as template…',
        onSelect: () => void askForm({ title: 'Save as template', description: 'Templates keep the structure so new projects can start from it.', fields: [{ name: 'name', label: 'Template name', initial: `${p.name} template`, required: true, maxLength: 120 }], confirmLabel: 'Save template' }).then(async (r) => {
          if (!r) return;
          try { await call('projects.duplicate', { id: p.id, name: r.name, asTemplate: true }); invalidate('projects'); toast.success('Saved as template', { action: { label: 'View templates', onClick: () => navigate(links.projects + '?tab=templates') } }); } catch (e) { toast.error(errText(e)); }
        }),
      },
    );
  }
  items.push(
    archived
      ? {
        id: 'arch', icon: 'archive', label: 'Unarchive', separatorBefore: true, disabled: !manager, disabledReason: mine,
        onSelect: () => void call('projects.unarchive', { id: p.id }).then(() => { invalidate(...KEYS); toast.success('Project unarchived'); }).catch((e) => toast.error(errText(e))),
      }
      : {
        id: 'arch', icon: 'archive', label: 'Archive', separatorBefore: true, disabled: !manager, disabledReason: mine,
        onSelect: () => void call('projects.archive', { id: p.id }).then(() => {
          invalidate(...KEYS);
          toast.success(`Archived “${p.name}”`, { action: { label: 'Undo', onClick: () => void call('projects.unarchive', { id: p.id }).then(() => invalidate(...KEYS)).catch((e) => toast.error(errText(e))) } });
        }).catch((e) => toast.error(errText(e))),
      },
    {
      id: 'trash', icon: 'trash', label: 'Move to trash…', danger: true, disabled: !manager, disabledReason: mine,
      onSelect: () => void askConfirm({ title: 'Move this project to trash?', message: <>“{p.name}” will leave your lists and become read-only. You can restore it from Trash at any time.</>, confirmLabel: 'Move to trash', danger: true }).then(async (ok) => {
        if (!ok) return;
        try {
          await call('projects.trash', { id: p.id });
          invalidate(...KEYS);
          if (parseHash(window.location.hash).projectId === p.id) navigate(links.projects);
          toast.success(`Moved “${p.name}” to trash`, { action: { label: 'Undo', onClick: () => void call('projects.restore', { id: p.id }).then(() => invalidate(...KEYS)).catch((e) => toast.error(errText(e))) } });
        } catch (e) { toast.error(errText(e)); }
      }),
    },
  );
  return items;
}

export function projectMenuProps(p: ProjectSummary, o: { onNavigate?: () => void } = {}) {
  return contextMenuProps(() => projectMenuItems(p, o), { label: `Actions for ${p.name}` });
}

/** Menu of a sidebar space header or client folder. */
export function spaceMenuProps(o: { label: string; kind: 'client' | 'internal' | 'personal'; clientId?: string; open: boolean; onToggle: (open: boolean) => void; onExpandAll?: () => void; onCollapseAll?: () => void; onNavigate?: () => void }) {
  return contextMenuProps(() => {
    const items: CtxItem[] = [];
    if (getCanCreate()) {
      items.push({ id: 'new', icon: 'folderPlus', label: 'New project here', onSelect: () => { shell()?.openNewProject({ kind: o.kind, clientId: o.clientId }); o.onNavigate?.(); } });
    }
    items.push(
      { id: 'toggle', icon: o.open ? 'chevronRight' : 'chevronDown', label: o.open ? 'Collapse' : 'Expand', separatorBefore: items.length > 0, onSelect: () => o.onToggle(!o.open) },
      { id: 'expandall', icon: 'chevronDown', label: 'Expand all', onSelect: () => o.onExpandAll?.() },
      { id: 'collapseall', icon: 'chevronRight', label: 'Collapse all', onSelect: () => o.onCollapseAll?.() },
    );
    return items;
  }, { label: `${o.label} actions` });
}
