// Lets non-React code (context-menu actions) reach the shell's modals.
import type { NewProjectOpts } from '../shell/ShellContext.tsx';

export interface ShellBridge {
  openQuickAdd: (o?: { projectId?: string }) => void;
  openEditProject: (id: string) => void;
  openNewProject: (o?: NewProjectOpts) => void;
}
let bridge: ShellBridge | null = null;
export const setShellBridge = (b: ShellBridge | null) => { bridge = b; };
export const shell = (): ShellBridge | null => bridge;
