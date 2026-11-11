import { createContext, useContext } from 'react';
import type { ProjectKind } from '../../shared/api.ts';
import type { ShortcutCtx } from './shortcuts.ts';

export interface NewProjectOpts { templateId?: string; kind?: ProjectKind; /** Preselect this client (client projects). */ clientId?: string }

export interface ShellApi {
  /** Open the "New project" modal (optionally preselecting a template and/or a project type). */
  openNewProject: (opts?: NewProjectOpts) => void;
  openPalette: () => void;
  /** Open the "Quick add task" modal; `projectId` presets the project picker. */
  openQuickAdd: (opts?: { projectId?: string }) => void;
  openShortcuts: () => void;
  toggleSidebar: () => void;
  /** What the shortcut registry can drive; the palette runs registry entries through it. */
  ctx: ShortcutCtx;
}

const noop = () => {};
export const ShellContext = createContext<ShellApi>({
  openNewProject: noop, openPalette: noop, openQuickAdd: noop, openShortcuts: noop, toggleSidebar: noop,
  ctx: { canCreate: false, route: () => ({ name: 'home', path: '/home', projectId: null, view: null, task: null, q: '', params: new URLSearchParams() }), togglePalette: noop, openHelp: noop, openQuickAdd: noop, openNewProject: noop, toggleSidebar: noop, toggleTheme: noop },
});
export const useShell = () => useContext(ShellContext);
