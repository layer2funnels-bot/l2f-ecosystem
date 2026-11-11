// Glue between the shortcut registry, the List/Board views and the open task drawer.
// - List and Board publish the order of the tasks they currently show, so J/K in the drawer follows what you were looking at.
// - The open drawer registers the few actions that need its state (step to another task, complete, copy link).

let published: { projectId: string; ids: string[] } | null = null;

export function publishTaskOrder(projectId: string, ids: string[]): void { published = { projectId, ids }; }
export function clearTaskOrder(projectId: string): void { if (published?.projectId === projectId) published = null; }
export function publishedTaskOrder(projectId: string): string[] | null { return published?.projectId === projectId ? published.ids : null; }

export interface TaskPanelApi {
  /** Open the previous (-1) or next (1) task in the current ordering. */
  step: (dir: -1 | 1) => void;
  toggleComplete: () => void;
  copyLink: () => void;
}
let panel: TaskPanelApi | null = null;
export function registerTaskPanel(api: TaskPanelApi | null): void { panel = api; }
export function taskPanel(): TaskPanelApi | null { return panel; }

// A task just created from a menu (e.g. "Create follow-up task") opens with its title selected for editing.
let wantTitleEdit: string | null = null;
export function requestTitleEdit(taskId: string): void { wantTitleEdit = taskId; }
export function consumeTitleEdit(taskId: string): boolean { if (wantTitleEdit !== taskId) return false; wantTitleEdit = null; return true; }