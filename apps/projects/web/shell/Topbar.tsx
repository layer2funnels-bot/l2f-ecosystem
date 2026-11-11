import { useProject } from '../lib/data.ts';
import { isPersonal } from '../lib/projectKind.ts';
import { links, useRoute } from '../router.ts';
import { IconButton } from '../ui/Button.tsx';
import { Icon } from '../ui/icons.tsx';
import { Kbd } from '../ui/Feedback.tsx';
import { QuickActions } from './QuickActions.tsx';
import { useShell } from './ShellContext.tsx';
import { isMac } from './shortcuts.ts';
import { TimerPill } from './TimerPill.tsx';

const TITLES: Record<string, string> = {
  home: 'Home', 'my-work': 'My Work', projects: 'Projects', workload: 'Workload', portfolio: 'Portfolio', search: 'Search', trash: 'Trash', 'not-found': 'Not found',
};

function Breadcrumb() {
  const route = useRoute();
  const project = useProject(route.name === 'project' ? route.projectId : null);
  return (
    <nav className="pm-crumbs" aria-label="Breadcrumb">
      <ol>
        {route.name === 'project' ? (
          <>
            <li><a href={links.projects}>Projects</a></li>
            <li aria-current="page" className="pm-truncate">
              {project.data ? (<><span className="pm-dot" style={{ background: project.data.color }} />{project.data.name}{isPersonal(project.data) && <span className="pm-faint pm-crumbs__lock" role="img" aria-label="Personal project, private to you" title="Personal project, private to you"><Icon name="lock" size={12} /></span>}</>) : 'Project'}
            </li>
          </>
        ) : (
          <li aria-current="page">{TITLES[route.name] ?? 'Projects'}</li>
        )}
      </ol>
    </nav>
  );
}

export function Topbar({ onMenu, menuLabel }: { onMenu: () => void; menuLabel: string }) {
  const { openPalette } = useShell();
  return (
    <div className="pm-topbar">
      <IconButton icon="menu" label={menuLabel} onClick={onMenu} className="pm-topbar__menu" aria-keyshortcuts="[" />
      <Breadcrumb />
      <div className="pm-topbar__spacer" />
      <button type="button" className="pm-searchbtn" onClick={openPalette} aria-label="Search (command palette)" aria-keyshortcuts="Control+K Meta+K">
        <Icon name="search" size={14} />
        <span className="pm-searchbtn__text">Search projects and tasks</span>
        <span className="pm-searchbtn__keys"><Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd><Kbd>K</Kbd></span>
      </button>
      <TimerPill />
      <QuickActions />
    </div>
  );
}
