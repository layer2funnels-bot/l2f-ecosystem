// The single keyboard-shortcut registry. The global key handler, the help modal and the command palette
// all read SHORTCUTS, so what is documented, what is listed and what actually works cannot drift apart.
import { useEffect, useRef } from 'react';
import type { ProjectKind } from '../../shared/api.ts';
import { links, navigate } from '../router.ts';
import type { Route } from '../router.ts';
import type { IconName } from '../ui/icons.tsx';
import { toast } from '../ui/Toast.tsx';
import { taskPanel } from '../task/panelNav.ts';
import { domRoot, activeEl } from '../lib/dom.ts';

export const isMac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);

export type ShortcutGroup = 'General' | 'Navigation' | 'Project views' | 'List view' | 'Task panel';
export const GROUP_ORDER: ShortcutGroup[] = ['General', 'Navigation', 'Project views', 'List view', 'Task panel'];

/** What a shortcut can do to the app. Supplied by the shell. */
export interface ShortcutCtx {
  canCreate: boolean;
  route: () => Route;
  togglePalette: () => void;
  openHelp: () => void;
  openQuickAdd: () => void;
  openNewProject: (opts?: { kind?: ProjectKind; templateId?: string }) => void;
  toggleSidebar: () => void;
  toggleTheme: () => void;
}

interface Matcher {
  /** Lower-case `KeyboardEvent.key`. */
  key: string;
  /** Ctrl on Windows/Linux, Cmd on Mac. */
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** Second key of a sequence such as G then H. */
  after?: string;
}

export interface ShortcutDef {
  id: string;
  group: ShortcutGroup;
  label: string;
  /** Display alternatives, e.g. [['Q'], ['T']] or [['G', 'then', 'H']]. 'Mod' renders as Cmd or Ctrl. */
  keys: string[][];
  /** Omitted for shortcuts a view handles itself (documented here so the help stays complete). */
  match?: Matcher[];
  /** Return false to say nothing happened (the key then keeps its browser default). */
  run?: (c: ShortcutCtx) => void | boolean;
  when?: (c: ShortcutCtx) => boolean;
  palette?: { title: string; group: 'Go to' | 'Actions'; icon: IconName };
  /** Still fires while a dialog is open (never while typing). */
  allowOverlay?: boolean;
  /** A mod shortcut that must still stay quiet while a text field has focus (mod shortcuts normally fire inside inputs). */
  typingBlocks?: boolean;
}

const inProject = (c: ShortcutCtx) => c.route().name === 'project';

const go = (id: string, key: string, label: string, href: string, icon: IconName, title: string): ShortcutDef => ({
  id: `go-${id}`, group: 'Navigation', label, keys: [['G', 'then', key.toUpperCase()]],
  match: [{ key, after: 'g' }], run: () => navigate(href), palette: { title, group: 'Go to', icon },
});

// ---- task panel helpers ----
const taskPanelEl = () => domRoot().querySelector<HTMLElement>('.pm-task[role="dialog"]');
/** The drawer is the top-most modal layer and no menu or picker is open on top of it. */
function taskPanelActive(): boolean {
  const el = taskPanelEl();
  if (!el) return false;
  const dialogs = domRoot().querySelectorAll('[role="dialog"][aria-modal="true"]');
  return dialogs[dialogs.length - 1] === el && !domRoot().querySelector('.pm-pop');
}
/** Opens the picker of one field in the drawer by activating its trigger, so it anchors to the field exactly like a click. */
const taskField = (id: string, label: string, field: string, key: string): ShortcutDef => ({
  id, group: 'Task panel', label, keys: [['Shift', key.toUpperCase()]], match: [{ key, shift: true }], when: taskPanelActive, allowOverlay: true,
  run: () => {
    const row = taskPanelEl()?.querySelector(`[data-field="${field}"]`);
    const trigger = row?.querySelector<HTMLButtonElement>('[data-primary]:not([disabled])') ?? row?.querySelector<HTMLButtonElement>('button:not([disabled])');
    if (!trigger) { toast.info('You have view-only access to this task.'); return; }
    trigger.scrollIntoView({ block: 'nearest' });
    trigger.click();
  },
});

const VIEW_KEYS: [string, string, string][] = [
  ['1', 'overview', 'Overview'], ['2', 'list', 'List'], ['3', 'board', 'Board'], ['4', 'calendar', 'Calendar'],
  ['5', 'timeline', 'Timeline'], ['6', 'report', 'Report'], ['7', 'docs', 'Docs & links'],
];

export const SHORTCUTS: ShortcutDef[] = [
  // ---- General
  { id: 'palette', group: 'General', label: 'Search and command palette', keys: [['Mod', 'K']], match: [{ key: 'k', mod: true }], run: (c) => c.togglePalette() },
  { id: 'focus-search', group: 'General', label: 'Focus the page filter or search box', keys: [['/']], match: [{ key: '/' }], run: () => focusPageSearch() },
  { id: 'help', group: 'General', label: 'Keyboard shortcuts', keys: [['?']], match: [{ key: '?' }], run: (c) => c.openHelp(), allowOverlay: true, palette: { title: 'Keyboard shortcuts', group: 'Actions', icon: 'keyboard' } },
  { id: 'quick-add', group: 'General', label: 'Quick add task', keys: [['Q'], ['T']], match: [{ key: 'q' }, { key: 't' }], run: (c) => c.openQuickAdd(), palette: { title: 'New task', group: 'Actions', icon: 'taskAdd' } },
  { id: 'new-project', group: 'General', label: 'New project', keys: [['Shift', 'P']], match: [{ key: 'p', shift: true }], run: (c) => c.openNewProject(), when: (c) => c.canCreate, palette: { title: 'New project', group: 'Actions', icon: 'folderPlus' } },
  { id: 'sidebar', group: 'General', label: 'Show or hide the sidebar', keys: [['[']], match: [{ key: '[' }], run: (c) => c.toggleSidebar() },
  { id: 'theme', group: 'General', label: 'Toggle dark mode', keys: [['Shift', 'D']], match: [{ key: 'd', shift: true }], run: (c) => c.toggleTheme(), palette: { title: 'Toggle dark mode', group: 'Actions', icon: 'moon' } },
  { id: 'escape', group: 'General', label: 'Close the top-most dialog, menu or panel', keys: [['Esc']] },
  { id: 'context-menu', group: 'General', label: 'Open the right-click menu of the focused item (long-press on touch)', keys: [['Shift', 'F10'], ['Menu']] },

  // ---- Navigation
  go('home', 'h', 'Go to Home', links.home, 'home', 'Go to Home'),
  go('mywork', 'm', 'Go to My Work', links.myWork, 'checkCircle', 'Go to My Work'),
  go('workload', 'w', 'Go to Workload', links.workload, 'workload', 'Go to Workload'),
  go('portfolio', 'p', 'Go to Portfolio', links.portfolio, 'bars', 'Go to Portfolio'),
  go('projects', 'r', 'Go to Projects list', links.projects, 'folder', 'Go to Projects'),
  go('trash', 't', 'Go to Trash', links.trash, 'trash', 'Go to Trash'),

  // ---- Project views (only inside a project)
  ...VIEW_KEYS.map<ShortcutDef>(([key, view, label]) => ({
    id: `view-${view}`, group: 'Project views', label: `${label} view`, keys: [[key]], match: [{ key }],
    when: inProject, run: (c) => { const id = c.route().projectId; if (id) navigate(links.project(id, view)); },
  })),

  // ---- List view (handled by the list itself while a row has focus)
  { id: 'list-next', group: 'List view', label: 'Next task', keys: [['J'], ['↓']] },
  { id: 'list-prev', group: 'List view', label: 'Previous task', keys: [['K'], ['↑']] },
  { id: 'list-select', group: 'List view', label: 'Select or deselect the task', keys: [['X'], ['Space']] },
  { id: 'list-open', group: 'List view', label: 'Open the task', keys: [['Enter']] },
  { id: 'list-complete', group: 'List view', label: 'Mark the task complete or reopen', keys: [['Mod', 'Enter']] },
  { id: 'list-add-below', group: 'List view', label: 'New task below the focused row', keys: [['Shift', 'Enter']] },
  { id: 'list-add-above', group: 'List view', label: 'Add task above the focused row (in the Add task field)', keys: [['Shift', 'Enter']] },

  // ---- Task panel (active only while the task drawer is the top-most layer and focus is not in a text field)
  taskField('task-status', 'Change status', 'status', 's'),
  taskField('task-assignee', 'Change assignee', 'assignee', 'a'),
  taskField('task-due', 'Change due date', 'due', 'd'),
  taskField('task-priority', 'Change priority', 'priority', 'p'),
  taskField('task-tags', 'Add or change tags', 'tags', 't'),
  {
    id: 'task-complete', group: 'Task panel', label: 'Mark complete or reopen', keys: [['Mod', 'Enter']],
    match: [{ key: 'enter', mod: true }], when: taskPanelActive, typingBlocks: true, allowOverlay: true,
    run: () => { const p = taskPanel(); if (!p) return false; p.toggleComplete(); },
  },
  {
    id: 'task-comment', group: 'Task panel', label: 'Write a comment', keys: [['Shift', 'C']],
    match: [{ key: 'c', shift: true }], when: taskPanelActive, allowOverlay: true,
    run: () => {
      const ta = taskPanelEl()?.querySelector<HTMLTextAreaElement>('textarea[aria-label="Add a comment"]');
      if (!ta || ta.disabled) { toast.info('Comments are closed on a task in the trash.'); return; }
      ta.focus();
    },
  },
  {
    id: 'task-link', group: 'Task panel', label: 'Copy the task link', keys: [['Shift', 'L']],
    match: [{ key: 'l', shift: true }], when: taskPanelActive, allowOverlay: true,
    run: () => { const p = taskPanel(); if (!p) return false; p.copyLink(); },
  },
  {
    id: 'task-next', group: 'Task panel', label: 'Next task in the list', keys: [['J'], ['Alt', '↓']],
    match: [{ key: 'j' }, { key: 'arrowdown', alt: true }], when: taskPanelActive, allowOverlay: true, typingBlocks: true,
    run: () => { const p = taskPanel(); if (!p) return false; p.step(1); },
  },
  {
    id: 'task-prev', group: 'Task panel', label: 'Previous task in the list', keys: [['K'], ['Alt', '↑']],
    match: [{ key: 'k' }, { key: 'arrowup', alt: true }], when: taskPanelActive, allowOverlay: true, typingBlocks: true,
    run: () => { const p = taskPanel(); if (!p) return false; p.step(-1); },
  },
  { id: 'task-close', group: 'Task panel', label: 'Close the panel', keys: [['Esc']] },
  { id: 'task-send', group: 'Task panel', label: 'Send the comment (while writing)', keys: [['Mod', 'Enter']] },
];

export const shortcutById = (id: string): ShortcutDef | undefined => SHORTCUTS.find((s) => s.id === id);
export const keyLabel = (k: string): string => (k === 'Mod' ? (isMac ? '⌘' : 'Ctrl') : k === 'Shift' && isMac ? '⇧' : k);
/** Plain-text form for tooltips, e.g. "Shift+P" or "G then H". */
export function keysText(def: ShortcutDef | undefined, alt = 0): string {
  const k = def?.keys[alt];
  if (!k) return '';
  return k.map(keyLabel).join(k.includes('then') ? ' ' : '+');
}

// ---------- page search focus ----------
export function focusPageSearch(): boolean {
  const visible = (el: HTMLInputElement | null) => !!el && el.offsetParent !== null;
  let el = domRoot().querySelector<HTMLInputElement>('.pm-main input[data-search], .pm-main [role="search"] input');
  if (!visible(el)) el = domRoot().querySelector<HTMLInputElement>('input[data-sidebar-filter]');
  if (!el || !visible(el)) return false;
  el.focus();
  el.select();
  return true;
}

// ---------- the global handler ----------
function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  if (el.tagName === 'INPUT') return !['checkbox', 'radio', 'button', 'submit', 'range'].includes((el as HTMLInputElement).type);
  return false;
}
const overlayOpen = () => !!domRoot().querySelector('[role="dialog"][aria-modal="true"], .pm-pop');

function matches(e: KeyboardEvent, m: Matcher): boolean {
  if (e.key.toLowerCase() !== m.key) return false;
  if (e.altKey !== !!m.alt) return false;
  if ((e.ctrlKey || e.metaKey) !== !!m.mod) return false;
  if (m.shift !== undefined) return e.shiftKey === m.shift;
  return /^[a-z0-9]$/.test(m.key) ? !e.shiftKey : true;
}

const SEQUENCE_STARTS = new Set(SHORTCUTS.flatMap((s) => (s.match ?? []).map((m) => m.after).filter((a): a is string => !!a)));
const SEQUENCE_HINT = 'G…  (H Home, M My Work, W Workload, P Portfolio, R Projects, T Trash)';

/** If Escape was pressed while focus sits outside the top-most dialog, close that dialog. */
function closeTopmostOverlay(e: KeyboardEvent) {
  const open = domRoot().querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]');
  const top = open[open.length - 1];
  if (!top || top.contains(activeEl())) return;
  e.preventDefault();
  top.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
}

export function useGlobalShortcuts(ctx: ShortcutCtx): void {
  const ref = useRef(ctx);
  ref.current = ctx;

  useEffect(() => {
    let pending: { first: string; timer: number; toastId: number } | null = null;
    const clearPending = () => {
      if (!pending) return;
      window.clearTimeout(pending.timer);
      toast.dismiss(pending.toastId);
      pending = null;
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return;
      if (e.key === 'Escape') { clearPending(); closeTopmostOverlay(e); return; }
      const c = ref.current;
      const typing = isTyping(e.target);
      const overlay = overlayOpen();

      if (pending) {
        const first = pending.first;
        clearPending();
        if (typing || overlay || e.ctrlKey || e.metaKey || e.altKey) return;
        const def = SHORTCUTS.find((s) => s.run && s.match?.some((m) => m.after === first && matches(e, { ...m, after: undefined })));
        if (def && def.when?.(c) !== false) { e.preventDefault(); def.run?.(c); }
        return;
      }

      if (!typing && !overlay && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && SEQUENCE_STARTS.has(e.key.toLowerCase())) {
        e.preventDefault();
        const first = e.key.toLowerCase();
        const toastId = toast.info(SEQUENCE_HINT, { duration: 0 });
        pending = { first, toastId, timer: window.setTimeout(() => { toast.dismiss(toastId); pending = null; }, 1500) };
        return;
      }

      for (const def of SHORTCUTS) {
        if (!def.run || !def.match) continue;
        for (const m of def.match) {
          if (m.after || !matches(e, m)) continue;
          if (typing && (!m.mod || def.typingBlocks)) continue;
          if (!m.mod && overlay && !def.allowOverlay) continue;
          if (def.when && !def.when(c)) continue;
          if (def.run(c) !== false) e.preventDefault();
          return;
        }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); clearPending(); };
  }, []);
}
