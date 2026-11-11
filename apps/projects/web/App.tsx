import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import { useMedia, useStoredBool } from './lib/hooks.ts';
import { SessionProvider } from './lib/session.tsx';
import { toggleTheme } from './lib/theme.ts';
import { closeTask, parseHash, useRoute } from './router.ts';
import { HomePage } from './pages/HomePage.tsx';
import { MyWorkPage } from './pages/MyWorkPage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';
import { PortfolioPage } from './pages/PortfolioPage.tsx';
import { ProjectPage } from './pages/project/ProjectPage.tsx';
import { ProjectFormModal } from './pages/projects/ProjectFormModal.tsx';
import { ProjectsPage } from './pages/projects/ProjectsPage.tsx';
import { SearchPage } from './pages/SearchPage.tsx';
import { TrashPage } from './pages/TrashPage.tsx';
import { WorkloadPage } from './pages/WorkloadPage.tsx';
import { CommandPalette } from './shell/CommandPalette.tsx';
import { QuickAddTask } from './shell/QuickAddTask.tsx';
import { ShellContext } from './shell/ShellContext.tsx';
import type { NewProjectOpts, ShellApi } from './shell/ShellContext.tsx';
import { ShortcutsHelp } from './shell/ShortcutsHelp.tsx';
import { useGlobalShortcuts } from './shell/shortcuts.ts';
import type { ShortcutCtx } from './shell/shortcuts.ts';
import { Sidebar } from './shell/Sidebar.tsx';
import { Topbar } from './shell/Topbar.tsx';
import { TaskDrawer } from './task/TaskDrawer.tsx';
import { ToastHost } from './ui/Toast.tsx';
import { setMe } from './lib/me.ts';
import { setShellBridge } from './lib/shellBridge.ts';
import { EditProject } from './pages/projects/EditProject.tsx';
import { ContextMenuHost } from './ui/ContextMenu.tsx';
import { PromptHost } from './ui/Prompt.tsx';
import { cx } from './lib/util.ts';
import { useSession } from './lib/session.tsx';

function RouteView() {
  const route = useRoute();
  switch (route.name) {
    case 'home': return <HomePage />;
    case 'projects': return <ProjectsPage />;
    case 'project': return <ProjectPage key={route.projectId} projectId={route.projectId as string} view={route.view} />;
    case 'my-work': return <MyWorkPage />;
    case 'workload': return <WorkloadPage />;
    case 'portfolio': return <PortfolioPage />;
    case 'search': return <SearchPage />;
    case 'trash': return <TrashPage />;
    default: return <NotFoundPage />;
  }
}

function Shell() {
  const route = useRoute();
  const { canCreate, user } = useSession();
  const mobile = useMedia('(max-width: 767px)');
  const [collapsed, setCollapsed] = useStoredBool('pm.nav.collapsed', false);
  const [navOpen, setNavOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);
  const [quickAdd, setQuickAdd] = useState<{ projectId?: string } | null>(null);
  const [newProject, setNewProject] = useState<NewProjectOpts | null>(null);
  const [editProjectId, setEditProjectId] = useState<string | null>(null);
  const main = useRef<HTMLElement>(null);

  useEffect(() => { setNavOpen(false); }, [route.path, mobile]);
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setNavOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);

  const hidden = mobile ? !navOpen : collapsed;
  const toggleNav = () => { if (mobile) setNavOpen((o) => !o); else setCollapsed(!collapsed); };

  const openNewProject = useCallback((o?: NewProjectOpts) => { if (canCreate) setNewProject(o ?? {}); }, [canCreate]);
  useEffect(() => { setMe(user, canCreate); return () => setMe(null); }, [user, canCreate]);
  useEffect(() => {
    setShellBridge({ openQuickAdd: (o) => setQuickAdd(o ?? {}), openEditProject: setEditProjectId, openNewProject });
    return () => setShellBridge(null);
  }, [openNewProject]);
  const toggleSidebarRef = useRef(toggleNav);
  toggleSidebarRef.current = toggleNav;

  const ctx = useMemo<ShortcutCtx>(() => ({
    canCreate,
    route: () => parseHash(window.location.hash),
    togglePalette: () => setPalette((p) => !p),
    openHelp: () => setHelp((h) => !h),
    openQuickAdd: () => setQuickAdd({}),
    openNewProject,
    toggleSidebar: () => toggleSidebarRef.current(),
    toggleTheme,
  }), [canCreate, openNewProject]);
  useGlobalShortcuts(ctx);

  const api = useMemo<ShellApi>(() => ({
    openNewProject,
    openPalette: () => setPalette(true),
    openQuickAdd: (o) => setQuickAdd(o ?? {}),
    openShortcuts: () => setHelp(true),
    toggleSidebar: () => toggleSidebarRef.current(),
    ctx,
  }), [openNewProject, ctx]);

  return (
    <ShellContext.Provider value={api}>
      <div className={cx('pm-app', hidden && 'is-nav-hidden', mobile && 'is-mobile', navOpen && 'is-nav-open')}>
        <button type="button" className="pm-skip" onClick={() => main.current?.focus()}>Skip to content</button>
        <div className="pm-sidebar-wrap" aria-hidden={hidden || undefined} {...(hidden ? { inert: '' } : {})}>
          <Sidebar mobile={mobile} onNavigate={() => setNavOpen(false)} onCollapse={() => setCollapsed(true)} />
        </div>
        {mobile && navOpen && <div className="pm-scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />}
        <div className="pm-col">
          <Topbar onMenu={toggleNav} menuLabel={mobile ? (navOpen ? 'Close menu' : 'Open menu') : collapsed ? 'Show sidebar' : 'Hide sidebar'} />
          <main id="main-content" ref={main} className="pm-main" tabIndex={-1}>
            <RouteView />
          </main>
        </div>
      </div>
      {route.task && <TaskDrawer key={route.task} taskId={route.task} onClose={closeTask} />}
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      <ShortcutsHelp open={help} onClose={() => setHelp(false)} />
      {quickAdd && <QuickAddTask open presetProjectId={quickAdd.projectId} onClose={() => setQuickAdd(null)} />}
      {editProjectId && <EditProject id={editProjectId} onClose={() => setEditProjectId(null)} />}
      {newProject && <ProjectFormModal open templateId={newProject.templateId} kind={newProject.kind} clientId={newProject.clientId} onClose={() => setNewProject(null)} />}
    </ShellContext.Provider>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <SessionProvider>
        <Shell />
      </SessionProvider>
      <PromptHost />
      <ContextMenuHost />
      <ToastHost />
    </ErrorBoundary>
  );
}
