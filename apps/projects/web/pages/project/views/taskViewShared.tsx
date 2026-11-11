// Shared helpers for the List and Board views: view state (filters / grouping / sort, persisted per project),
// the toolbar, optimistic task writes, and the small cell renderers both views use.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { BulkTaskPatch, CustomField, FieldFilter, FieldValue, Person, Priority, ProjectDetail, Tag, TaskFilters, TaskRow, TaskStatus, ViewPrefs } from '../../../../shared/api.ts';
import { PRIORITIES, TASK_STATUSES } from '../../../../shared/api.ts';
import { call } from '../../../api/client.ts';
import { invalidateWork, setQueryData } from '../../../api/store.ts';
import { usePeople } from '../../../lib/data.ts';
import { MAX_ASSIGNEES, patchAssignees } from '../../../lib/people.ts';
import { addDays, cx, fmtDate, lsGet, lsSet, parseYmd, PRIORITY_META, startOfWeek, TASK_STATUS_META, todayYmd } from '../../../lib/util.ts';
import { Avatar, AssigneeStack, Chip } from '../../../ui/Badges.tsx';
import { Checkbox, Input } from '../../../ui/Form.tsx';
import { Icon } from '../../../ui/icons.tsx';
import { Menu } from '../../../ui/Menu.tsx';
import type { MenuItem } from '../../../ui/Menu.tsx';
import { Popover } from '../../../ui/Overlay.tsx';
import { PeoplePicker } from '../../../ui/PeoplePicker.tsx';
import { toast } from '../../../ui/Toast.tsx';
import { applyFieldsToRow, compareByField, fieldMap, filterIsActive, matchesFieldFilter, OPS_BY_TYPE } from '../../../fields/fieldKit.tsx';
import { FieldFilterButton } from '../../../fields/FieldFilters.tsx';

// ---------------------------------------------------------------------------------------------
// View state
// ---------------------------------------------------------------------------------------------
export type GroupBy = 'section' | 'status' | 'assignee' | 'priority' | 'none' | `field:${string}`;
export type SortKey = 'manual' | 'due' | 'priority' | 'title' | 'created' | `field:${string}`;
export type DueFilter = NonNullable<TaskFilters['due']>;
export const UNASSIGNED = '__unassigned';

export interface ViewState {
  q: string;
  assigneeIds: string[];
  tagIds: string[];
  statuses: TaskStatus[];
  priorities: Priority[];
  due: DueFilter | null;
  hideDone: boolean;
  groupBy: GroupBy;
  sort: SortKey;
  /** Custom field filters (client side). */
  fieldFilters: FieldFilter[];
  /** List: visible optional columns ('tags','who','due','f:<fieldId>'); null = default. */
  columns: string[] | null;
  /** Board: field ids shown on cards. */
  cardFields: string[];
}

const BASE: Record<'list' | 'board', ViewState> = {
  list: { q: '', assigneeIds: [], tagIds: [], statuses: [], priorities: [], due: null, hideDone: false, groupBy: 'section', sort: 'manual', fieldFilters: [], columns: null, cardFields: [] },
  board: { q: '', assigneeIds: [], tagIds: [], statuses: [], priorities: [], due: null, hideDone: false, groupBy: 'status', sort: 'manual', fieldFilters: [], columns: null, cardFields: [] },
};

type ListPrefs = NonNullable<ViewPrefs['list']>;
type PrefsEx = ViewPrefs & { board?: ListPrefs };

const GROUPS: GroupBy[] = ['section', 'status', 'assignee', 'priority', 'none'];
const SORTS: SortKey[] = ['manual', 'due', 'priority', 'title', 'created'];
const DUES: DueFilter[] = ['overdue', 'today', 'week', 'none'];
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

function fromPrefs(raw: ListPrefs | undefined, base: ViewState): ViewState {
  if (!raw || typeof raw !== 'object') return base;
  const f = (raw.filters ?? {}) as TaskFilters;
  return {
    q: typeof f.q === 'string' ? f.q : '',
    assigneeIds: strArr(f.assigneeIds),
    tagIds: strArr(f.tagIds),
    statuses: strArr(f.statuses).filter((s): s is TaskStatus => (TASK_STATUSES as string[]).includes(s)),
    priorities: strArr(f.priorities).filter((s): s is Priority => (PRIORITIES as string[]).includes(s)),
    due: DUES.includes(f.due as DueFilter) ? (f.due as DueFilter) : null,
    hideDone: raw.hideDone === true,
    groupBy: GROUPS.includes(raw.groupBy as GroupBy) || /^field:[0-9a-f-]{36}$/i.test(String(raw.groupBy)) ? (raw.groupBy as GroupBy) : base.groupBy,
    sort: SORTS.includes(raw.sort as SortKey) || /^field:[0-9a-f-]{36}(:desc)?$/i.test(String(raw.sort)) ? (raw.sort as SortKey) : base.sort,
    fieldFilters: Array.isArray(f.fields) ? f.fields.filter((x) => x && typeof x.fieldId === 'string' && typeof x.op === 'string') : [],
    columns: Array.isArray(raw.columns) ? strArr(raw.columns) : null,
    cardFields: strArr((raw as { cardFields?: unknown }).cardFields),
  };
}
function toPrefs(s: ViewState): ListPrefs & { cardFields?: string[] } {
  return {
    groupBy: s.groupBy, sort: s.sort, hideDone: s.hideDone,
    filters: { q: s.q || undefined, assigneeIds: s.assigneeIds, tagIds: s.tagIds, statuses: s.statuses, priorities: s.priorities, due: s.due ?? undefined, fields: s.fieldFilters },
    columns: s.columns ?? undefined, cardFields: s.cardFields,
  };
}

export function activeFilterCount(s: ViewState): number {
  return (s.q.trim() ? 1 : 0) + (s.assigneeIds.length ? 1 : 0) + (s.tagIds.length ? 1 : 0) + (s.statuses.length ? 1 : 0) + (s.priorities.length ? 1 : 0) + (s.due ? 1 : 0) + s.fieldFilters.filter(filterIsActive).length;
}

/** Drops saved settings that point at fields that no longer exist (or have the wrong type). */
export function sanitizeState(s: ViewState, fields: CustomField[], kind: 'list' | 'board'): ViewState {
  const fm = fieldMap(fields);
  const fid = (x: string) => fm.get(x.split(':')[1]);
  let n = s;
  if (s.groupBy.startsWith('field:') && fid(s.groupBy)?.type !== 'select') n = { ...n, groupBy: BASE[kind].groupBy };
  if (s.sort.startsWith('field:') && !fid(s.sort)) n = { ...n, sort: 'manual' };
  const ff = s.fieldFilters.filter((x) => { const f = fm.get(x.fieldId); return f && OPS_BY_TYPE[f.type].includes(x.op); });
  if (ff.length !== s.fieldFilters.length) n = { ...n, fieldFilters: ff };
  if (s.columns && s.columns.some((c) => c.startsWith('f:') && !fm.has(c.slice(2)))) n = { ...n, columns: s.columns.filter((c) => !c.startsWith('f:') || fm.has(c.slice(2))) };
  const cf = s.cardFields.filter((x) => { const t = fm.get(x)?.type; return t === 'select' || t === 'multiselect'; }).slice(0, 2);
  if (cf.length !== s.cardFields.length) n = { ...n, cardFields: cf };
  return n;
}

/** Toolbar state per project. Seeds from localStorage, upgrades from viewprefs.get, saves back (debounced). Never throws. */
export function useViewState(projectId: string, kind: 'list' | 'board', serverPrefs: ViewPrefs | undefined) {
  const base = BASE[kind];
  const lsKey = `pm.view.${kind}.${projectId}`;
  const [state, setState] = useState<ViewState>(() => {
    const raw = lsGet(lsKey);
    if (raw) { try { return fromPrefs(JSON.parse(raw) as ListPrefs, base); } catch { /* ignore */ } }
    return base;
  });
  const touched = useRef(false);
  const applied = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!serverPrefs || applied.current || touched.current) return;
    applied.current = true;
    const raw = kind === 'board' ? (serverPrefs as PrefsEx).board : serverPrefs.list;
    if (raw) setState(fromPrefs(raw, base));
  }, [serverPrefs, kind, base]);

  const save = useCallback((next: ViewState) => {
    lsSet(lsKey, JSON.stringify(toPrefs(next)));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void (async () => {
        try {
          const cur = (await call('viewprefs.get', { projectId })) as PrefsEx;
          await call('viewprefs.set', { projectId, prefs: { ...cur, [kind]: toPrefs(next) } as ViewPrefs });
        } catch { /* keep the local copy; the server is a bonus */ }
      })();
    }, 700);
  }, [lsKey, projectId, kind]);

  const update = useCallback((patch: Partial<ViewState>) => {
    touched.current = true;
    setState((s) => { const next = { ...s, ...patch }; save(next); return next; });
  }, [save]);
  const clear = useCallback(() => update({ q: '', assigneeIds: [], tagIds: [], statuses: [], priorities: [], due: null, fieldFilters: [] }), [update]);
  return { state, update, clear };
}

// ---------------------------------------------------------------------------------------------
// Filtering / sorting
// ---------------------------------------------------------------------------------------------
const PRIO_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };

function matches(t: TaskRow, s: ViewState, today: string, weekStart: string, weekEnd: string, fm: Map<string, CustomField>): boolean {
  if (s.hideDone && t.status === 'done') return false;
  const q = s.q.trim().toLowerCase();
  if (q && !t.title.toLowerCase().includes(q)) return false;
  if (s.assigneeIds.length) {
    // ANY of the chosen people (or 'Unassigned' for tasks nobody is assigned to).
    const hit = t.assignees.length ? t.assignees.some((a) => s.assigneeIds.includes(a.id)) : s.assigneeIds.includes(UNASSIGNED);
    if (!hit) return false;
  }
  if (s.tagIds.length && !t.tags.some((g) => s.tagIds.includes(g.id))) return false;
  if (s.statuses.length && !s.statuses.includes(t.status)) return false;
  if (s.priorities.length && !s.priorities.includes(t.priority)) return false;
  for (const flt of s.fieldFilters) { const f = fm.get(flt.fieldId); if (f && !matchesFieldFilter(t, flt, f)) return false; }
  switch (s.due) {
    case 'overdue': if (!(t.dueOn && t.dueOn < today && t.status !== 'done')) return false; break;
    case 'today': if (t.dueOn !== today) return false; break;
    case 'week': if (!(t.dueOn && t.dueOn >= weekStart && t.dueOn <= weekEnd)) return false; break;
    case 'none': if (t.dueOn) return false; break;
    default: break;
  }
  return true;
}

const byPosition = (a: TaskRow, b: TaskRow) => a.position - b.position || a.number - b.number;

export function sortTasks(list: TaskRow[], sort: SortKey, fields: CustomField[] = []): TaskRow[] {
  const out = [...list];
  if (sort.startsWith('field:')) {
    const [, id, dir] = sort.split(':');
    const f = fields.find((x) => x.id === id);
    if (f) { out.sort((a, b) => compareByField(f, a, b, dir === 'desc') || byPosition(a, b)); return out; }
  }
  switch (sort) {
    case 'due': out.sort((a, b) => (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999') || byPosition(a, b)); break;
    case 'priority': out.sort((a, b) => PRIO_RANK[a.priority] - PRIO_RANK[b.priority] || byPosition(a, b)); break;
    case 'title': out.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) || byPosition(a, b)); break;
    case 'created': out.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.number - a.number); break;
    default: out.sort(byPosition);
  }
  return out;
}

export interface TaskTree { top: TaskRow[]; kids: Map<string, TaskRow[]>; total: number }

/** Top-level tasks that pass the filters (or have a subtask that does), plus the subtasks to show under each. */
export function buildTree(all: TaskRow[], s: ViewState, fields: CustomField[] = []): TaskTree {
  const fm = fieldMap(fields);
  const today = todayYmd();
  const weekStart = startOfWeek(today);
  const weekEnd = addDays(weekStart, 6);
  const children = new Map<string, TaskRow[]>();
  for (const t of all) if (t.parentId) { const l = children.get(t.parentId); if (l) l.push(t); else children.set(t.parentId, [t]); }
  const filtering = activeFilterCount(s) > 0;
  const top: TaskRow[] = [];
  const kids = new Map<string, TaskRow[]>();
  let total = 0;
  for (const t of all) {
    if (t.parentId) continue;
    total++;
    const sub = (children.get(t.id) ?? []).sort(byPosition);
    const selfOk = matches(t, s, today, weekStart, weekEnd, fm);
    if (selfOk) {
      top.push(t);
      kids.set(t.id, s.hideDone ? sub.filter((k) => k.status !== 'done') : sub);
    } else if (filtering && !(s.hideDone && t.status === 'done')) {
      const hit = sub.filter((k) => matches(k, s, today, weekStart, weekEnd, fm));
      if (hit.length) { top.push(t); kids.set(t.id, hit); }
    }
  }
  return { top, kids, total };
}

/** Position that sorts after every task in the list. */
export function endPosition(list: TaskRow[]): number { return list.reduce((m, t) => Math.max(m, t.position), 0) + 1000; }

/** Position for dropping between neighbours (midpoint, or +/-1000 at the ends). */
export function positionBetween(prev: TaskRow | undefined, next: TaskRow | undefined): number {
  if (prev && next) return (prev.position + next.position) / 2;
  if (prev) return prev.position + 1000;
  if (next) return next.position - 1000;
  return 1000;
}

// ---------------------------------------------------------------------------------------------
// Writes (optimistic, then invalidateWork so every view agrees)
// ---------------------------------------------------------------------------------------------
const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Please try again.');
const short = (s: string) => (s.length > 40 ? `${s.slice(0, 39)}…` : s);

/** members is the pool that resolves assignee ids to people (project members + organization people). */
export function applyPatch(t: TaskRow, p: BulkTaskPatch, members: Person[]): TaskRow {
  const n: TaskRow = { ...t };
  if (p.title !== undefined) n.title = p.title;
  if (p.status !== undefined) { n.status = p.status; n.completedAt = p.status === 'done' ? (t.completedAt ?? new Date().toISOString()) : null; }
  if (p.priority !== undefined) n.priority = p.priority;
  n.assignees = patchAssignees(t.assignees, p, members);
  if (p.startOn !== undefined) n.startOn = p.startOn;
  if (p.dueOn !== undefined) n.dueOn = p.dueOn;
  if (p.estimateMinutes !== undefined) n.estimateMinutes = p.estimateMinutes;
  if (p.repeatRule !== undefined) n.repeatRule = p.repeatRule;
  if (p.sectionId !== undefined) n.sectionId = p.sectionId;
  if (p.parentId !== undefined) n.parentId = p.parentId;
  if (p.fields) return applyFieldsToRow(n, p.fields);
  return n;
}

export async function write<R>(optimistic: (() => () => void) | null, fn: () => Promise<R>): Promise<R | undefined> {
  const rollback = optimistic ? optimistic() : null;
  try {
    const r = await fn();
    invalidateWork();
    return r;
  } catch (e) {
    rollback?.();
    invalidateWork();
    toast.error(errMsg(e));
    return undefined;
  }
}

/** Dropping a task on another assignee's group adds that person and removes the one whose group it came from. */
export interface MoveSpec { position: number; sectionId?: string | null; status?: TaskStatus; assignees?: { add?: string; remove?: string }; priority?: Priority; fields?: Record<string, FieldValue | null> }
export interface CreateInit { sectionId?: string | null; status?: TaskStatus; priority?: Priority; assigneeIds?: string[]; parentId?: string | null; dueOn?: string | null; position?: number; fields?: Record<string, FieldValue | null> }

/**
 * Sends one task patch for one or several tasks. Single-task assignee changes use the dedicated ops; anything else that
 * adds / removes assignees goes through tasks.bulkUpdate (which skips tasks the caller cannot edit, so a single task
 * that was skipped is reported as an error).
 */
export async function sendTaskPatch(ids: string[], patch: BulkTaskPatch): Promise<unknown> {
  const { addAssigneeIds, removeAssigneeIds, ...plain } = patch;
  const touches = addAssigneeIds !== undefined || removeAssigneeIds !== undefined;
  if (ids.length === 1) {
    const id = ids[0];
    if (!touches) return call('tasks.update', { id, patch: plain });
    if (addAssigneeIds && !removeAssigneeIds && !Object.keys(plain).length && addAssigneeIds.length) return call('tasks.addAssignees', { id, userIds: addAssigneeIds });
    if (removeAssigneeIds?.length === 1 && !addAssigneeIds && !Object.keys(plain).length) return call('tasks.removeAssignee', { id, userId: removeAssigneeIds[0] });
  }
  const r = await call('tasks.bulkUpdate', { ids, patch });
  if (ids.length === 1 && r.updated === 0) throw new Error('You need editor access to change this task.');
  return r;
}

export function useTaskActions(project: ProjectDetail) {
  const pid = project.id;
  const org = usePeople().data;
  const members = useRef<Person[]>(project.members);
  members.current = [...project.members, ...(org ?? [])];
  const key = `tasks:${pid}`;

  const patchRows = useCallback((ids: string[], fn: (t: TaskRow) => TaskRow) => {
    const set = new Set(ids);
    return setQueryData<TaskRow[]>(key, (old) => old.map((t) => (set.has(t.id) ? fn(t) : t)));
  }, [key]);

  const update = useCallback(async (ids: string[], patch: BulkTaskPatch): Promise<boolean> => {
    if (!ids.length) return false;
    const r = await write(
      () => patchRows(ids, (t) => applyPatch(t, patch, members.current)),
      (): Promise<unknown> => sendTaskPatch(ids, patch),
    );
    return r !== undefined;
  }, [patchRows]);

  const toggleDone = useCallback(async (t: TaskRow) => {
    const from = t.status;
    const to: TaskStatus = from === 'done' ? 'todo' : 'done';
    const ok = await update([t.id], { status: to });
    if (ok && to === 'done') {
      toast.success(`Completed “${short(t.title)}”`, { action: { label: 'Undo', onClick: () => void update([t.id], { status: from }) } });
    }
  }, [update]);

  const move = useCallback(async (t: TaskRow, m: MoveSpec): Promise<boolean> => {
    const { assignees, priority, fields: fv, ...mv } = m;
    const local: BulkTaskPatch = {
      sectionId: m.sectionId, status: m.status, priority, fields: fv,
      addAssigneeIds: assignees?.add ? [assignees.add] : undefined, removeAssigneeIds: assignees?.remove ? [assignees.remove] : undefined,
    };
    const r = await write(
      () => patchRows([t.id], (row) => ({ ...applyPatch(row, local, members.current), position: m.position })),
      async () => {
        const moved = await call('tasks.move', { id: t.id, ...mv });
        if (assignees || priority !== undefined || fv) {
          const patch: BulkTaskPatch = {};
          if (fv) patch.fields = fv;
          if (priority !== undefined) patch.priority = priority;
          if (assignees?.add) patch.addAssigneeIds = [assignees.add];
          if (assignees?.remove) patch.removeAssigneeIds = [assignees.remove];
          return sendTaskPatch([t.id], patch);
        }
        return moved;
      },
    );
    return r !== undefined;
  }, [patchRows]);

  const create = useCallback(async (title: string, init: CreateInit = {}): Promise<TaskRow | undefined> => {
    try {
      const { fields: fv, ...rest } = init;
      let row = await call('tasks.create', { projectId: pid, title, ...rest });
      if (fv) row = await call('tasks.update', { id: row.id, patch: { fields: fv } }).then((r) => r, () => row);
      setQueryData<TaskRow[]>(key, (old) => (old.some((x) => x.id === row.id) ? old : [...old, row]));
      invalidateWork();
      return row;
    } catch (e) {
      toast.error(errMsg(e));
      return undefined;
    }
  }, [pid, key]);

  const restore = useCallback(async (ids: string[]) => {
    try { await call('tasks.restore', { ids }); } catch (e) { toast.error(errMsg(e)); }
    invalidateWork();
  }, []);

  const trash = useCallback(async (ids: string[], title?: string): Promise<boolean> => {
    const gone = new Set(ids);
    const r = await write(
      () => setQueryData<TaskRow[]>(key, (old) => old.filter((t) => !gone.has(t.id) && !(t.parentId && gone.has(t.parentId)))),
      () => call('tasks.trash', { ids }),
    );
    if (r) {
      toast.success(ids.length === 1 && title ? `Moved “${short(title)}” to trash` : `Moved ${ids.length} tasks to trash`, {
        action: { label: 'Undo', onClick: () => void restore(ids) },
      });
    }
    return !!r;
  }, [key, restore]);

  const duplicate = useCallback(async (id: string) => {
    const r = await write(null, () => call('tasks.duplicate', { id }));
    if (r) toast.success('Task duplicated');
  }, []);

  return { update, toggleDone, move, create, trash, duplicate };
}

// ---------------------------------------------------------------------------------------------
// Little icons the shared set doesn't have (same 16px grid / stroke style)
// ---------------------------------------------------------------------------------------------
const MINI = {
  grip: <><circle cx="6" cy="4" r="1" fill="currentColor" stroke="none" /><circle cx="10" cy="4" r="1" fill="currentColor" stroke="none" /><circle cx="6" cy="8" r="1" fill="currentColor" stroke="none" /><circle cx="10" cy="8" r="1" fill="currentColor" stroke="none" /><circle cx="6" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="10" cy="12" r="1" fill="currentColor" stroke="none" /></>,
  paperclip: <path d="M12 7.5l-4.2 4.2a2.4 2.4 0 0 1-3.4-3.4l4.6-4.6a1.6 1.6 0 0 1 2.3 2.3L6.8 10.6a.8.8 0 0 1-1.1-1.1L9.5 5.7" />,
  comment: <path d="M2.5 3.5h11v7.2h-6l-3 2.3v-2.3h-2z" />,
  repeat: <path d="M3 7V6a2 2 0 0 1 2-2h7.5M10.5 2l2 2-2 2M13 9v1a2 2 0 0 1-2 2H3.5M5.5 14l-2-2 2-2" />,
  subtask: <path d="M4 2.5v6.5a2 2 0 0 0 2 2h5M9 8.5l2.5 2.5L9 13.5" />,
};
export function MiniIcon({ name, size = 13 }: { name: keyof typeof MINI; size?: number }) {
  return (
    <svg className="pm-icon" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {MINI[name]}
    </svg>
  );
}

const REPEAT_LABEL: Record<string, string> = { daily: 'daily', weekdays: 'on weekdays', weekly: 'weekly', biweekly: 'every 2 weeks', monthly: 'monthly', yearly: 'yearly' };

/** Subtasks / checklist / files / comments / waiting-on / repeat, only the ones that apply. */
export function Indicators({ t, withWaiting = true }: { t: TaskRow; withWaiting?: boolean }) {
  const c = t.counts;
  return (
    <span className="lb-ind">
      {c.subtasks > 0 && <span className="lb-ind__i" title={`${c.subtasksDone} of ${c.subtasks} subtasks done`}><MiniIcon name="subtask" />{c.subtasksDone}/{c.subtasks}</span>}
      {c.checklist > 0 && <span className="lb-ind__i" title={`${c.checklistDone} of ${c.checklist} checklist items done`}><Icon name="checkCircle" size={13} />{c.checklistDone}/{c.checklist}</span>}
      {c.files > 0 && <span className="lb-ind__i" title={`${c.files} attachment${c.files === 1 ? '' : 's'}`}><MiniIcon name="paperclip" />{c.files}</span>}
      {c.links > 0 && <span className="lb-ind__i" title={` link${c.links === 1 ? '' : 's'}`}><Icon name="link" size={13} />{c.links}</span>}
      {c.comments > 0 && <span className="lb-ind__i" title={`${c.comments} comment${c.comments === 1 ? '' : 's'}`}><MiniIcon name="comment" />{c.comments}</span>}
      {withWaiting && c.waitingOn > 0 && <span className="lb-ind__wait" title={`Waiting on ${c.waitingOn} unfinished task${c.waitingOn === 1 ? '' : 's'}`}><Icon name="clock" size={12} />Waiting on {c.waitingOn}</span>}
      {t.repeatRule && <span className="lb-ind__i" title={`Repeats ${REPEAT_LABEL[t.repeatRule] ?? t.repeatRule}`}><MiniIcon name="repeat" /></span>}
    </span>
  );
}

export function TagChips({ tags, max = 2 }: { tags: Tag[]; max?: number }) {
  if (!tags.length) return null;
  const shown = tags.slice(0, max);
  const extra = tags.length - shown.length;
  return (
    <span className="lb-tags">
      {shown.map((g) => <span key={g.id} className="lb-tag" style={{ ['--tag' as string]: g.color }} title={g.name}>{g.name}</span>)}
      {extra > 0 && <span className="lb-tag lb-tag--more" title={tags.slice(max).map((g) => g.name).join(', ')}>+{extra}</span>}
    </span>
  );
}

/** Days between today and a due date; positive = overdue. */
export function daysLate(due: string, today = todayYmd()): number {
  return Math.round((parseYmd(today).getTime() - parseYmd(due).getTime()) / 86_400_000);
}
export function dueTone(t: Pick<TaskRow, 'dueOn' | 'status'>): 'late' | 'today' | 'normal' {
  if (!t.dueOn || t.status === 'done') return 'normal';
  const today = todayYmd();
  return t.dueOn < today ? 'late' : t.dueOn === today ? 'today' : 'normal';
}
export function DueText({ t }: { t: Pick<TaskRow, 'dueOn' | 'status'> }) {
  if (!t.dueOn) return null;
  const tone = dueTone(t);
  const n = daysLate(t.dueOn);
  return (
    <span className={cx('lb-duetext', tone === 'late' && 'is-late', tone === 'today' && 'is-today')} title={tone === 'late' ? `${n} day${n === 1 ? '' : 's'} overdue` : undefined}>
      <Icon name="calendar" size={12} />{tone === 'today' ? 'Today' : fmtDate(t.dueOn)}{tone === 'late' && <span className="lb-duetext__late"> · {n}d</span>}
    </span>
  );
}

/** Avatar stack (max 3 + "+N") of a task's assignees; for editors a click opens the multi-select people picker. */
export function AssigneesCell({ people, value, onChange, disabled, label = 'Assignees', size = 22 }: {
  people: Person[]; value: Person[]; onChange: (ids: string[]) => void; disabled?: boolean; label?: string; size?: number;
}) {
  if (disabled) return <span className="lb-avatarbtn is-static"><AssigneeStack people={value} size={size} /></span>;
  return (
    <PeoplePicker
      people={people}
      value={value.map((p) => p.id)}
      onChange={onChange}
      max={MAX_ASSIGNEES}
      ariaLabel={label}
      title="Assign people"
      trigger={(t) => (
        <button type="button" className="lb-avatarbtn" aria-label={`${label}: ${value.length ? value.map((p) => p.name).join(', ') : 'Unassigned'}. Change`} {...t}>
          <AssigneeStack people={value} size={size} />
        </button>
      )}
    />
  );
}

// ---------------------------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------------------------
interface Opt { id: string; label: string; leading?: ReactNode }

function MultiFilter({ label, icon, options, value, onChange }: { label: string; icon?: ReactNode; options: Opt[]; value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const toggle = (id: string, on: boolean) => onChange(on ? [...value, id] : value.filter((x) => x !== id));
  return (
    <>
      <button ref={ref} type="button" className={cx('lb-fbtn', value.length > 0 && 'is-active', open && 'is-open')} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {icon}<span>{label}</span>{value.length > 0 && <span className="lb-fbtn__n">{value.length}</span>}<Icon name="chevronDown" size={12} />
      </button>
      <Popover anchor={ref.current} open={open} onClose={() => setOpen(false)} className="lb-fpop" label={`Filter by ${label.toLowerCase()}`}>
        <div className="lb-fpop__list" role="group" aria-label={label}>
          {options.length === 0 && <div className="lb-fpop__empty">Nothing to filter by yet</div>}
          {options.map((o) => (
            <div key={o.id} className="lb-fopt">
              <Checkbox checked={value.includes(o.id)} onChange={(on) => toggle(o.id, on)} label={<span className="lb-fopt__label">{o.leading}<span className="pm-truncate">{o.label}</span></span>} />
            </div>
          ))}
        </div>
        {value.length > 0 && <div className="lb-fpop__foot"><button type="button" className="lb-linkbtn" onClick={() => onChange([])}>Clear {label.toLowerCase()}</button></div>}
      </Popover>
    </>
  );
}

const GROUP_LABEL: Record<GroupBy, string> = { section: 'Section', status: 'Status', assignee: 'Assignee', priority: 'Priority', none: 'None' };
const SORT_LABEL: Record<SortKey, string> = { manual: 'Manual', due: 'Due date', priority: 'Priority', title: 'Title', created: 'Newest' };
const DUE_LABEL: Record<DueFilter, string> = { overdue: 'Overdue', today: 'Due today', week: 'This week', none: 'No date' };

export function ViewToolbar({ state, onChange, onClear, members, tags, groupLabel = 'Group', groupOptions, showSort, shown, total, fields, rightExtra }: {
  state: ViewState;
  onChange: (p: Partial<ViewState>) => void;
  onClear: () => void;
  members: Person[];
  tags: Tag[];
  groupLabel?: string;
  groupOptions?: GroupBy[];
  showSort?: boolean;
  shown: number;
  total: number;
  fields?: CustomField[];
  rightExtra?: ReactNode;
}) {
  const active = activeFilterCount(state);
  const fieldDefs = fields ?? [];
  const assigneeOpts: Opt[] = [
    { id: UNASSIGNED, label: 'Unassigned', leading: <Avatar person={null} size={18} /> },
    ...members.map((m) => ({ id: m.id, label: m.name, leading: <Avatar person={m} size={18} /> })),
  ];
  const tagOpts: Opt[] = tags.map((g) => ({ id: g.id, label: g.name, leading: <span className="pm-dot" style={{ background: g.color }} /> }));
  const statusOpts: Opt[] = TASK_STATUSES.map((s) => ({ id: s, label: TASK_STATUS_META[s].label, leading: <span className="pm-dot" style={{ background: TASK_STATUS_META[s].color }} /> }));
  const prioOpts: Opt[] = [...PRIORITIES].reverse().map((p) => ({ id: p, label: PRIORITY_META[p].label, leading: <Icon name="flag" size={13} style={{ color: PRIORITY_META[p].color }} /> }));

  const dueItems: MenuItem[] = [
    { id: 'any', label: 'Any date', selected: !state.due, onSelect: () => onChange({ due: null }) },
    ...DUES.map((d) => ({ id: d, label: DUE_LABEL[d], selected: state.due === d, onSelect: () => onChange({ due: d }) })),
  ];
  const selectFields = fieldDefs.filter((f) => f.type === 'select');
  const groupItems: MenuItem[] = [
    ...(groupOptions ?? []).map((g) => ({ id: g, label: GROUP_LABEL[g as keyof typeof GROUP_LABEL], selected: state.groupBy === g, onSelect: () => onChange({ groupBy: g }) })),
    ...(groupOptions && groupOptions.includes('section') ? selectFields.map((f, i) => ({ id: `field:${f.id}`, label: f.name, separatorBefore: i === 0, selected: state.groupBy === `field:${f.id}`, onSelect: () => onChange({ groupBy: `field:${f.id}` as GroupBy }) })) : []),
  ];
  const sortItems: MenuItem[] = [
    ...SORTS.map((s) => ({ id: s, label: SORT_LABEL[s as keyof typeof SORT_LABEL], selected: state.sort === s, onSelect: () => onChange({ sort: s }) })),
    ...fieldDefs.flatMap((f, i) => [
      { id: `field:${f.id}`, label: `${f.name} (A-Z)`, separatorBefore: i === 0, selected: state.sort === `field:${f.id}`, onSelect: () => onChange({ sort: `field:${f.id}` as SortKey }) },
      { id: `field:${f.id}:desc`, label: `${f.name} (Z-A)`, selected: state.sort === `field:${f.id}:desc`, onSelect: () => onChange({ sort: `field:${f.id}:desc` as SortKey }) },
    ]),
  ];
  const groupName = state.groupBy.startsWith('field:') ? fieldDefs.find((f) => f.id === state.groupBy.slice(6))?.name ?? 'Field' : GROUP_LABEL[state.groupBy as keyof typeof GROUP_LABEL];
  const sortName = state.sort.startsWith('field:') ? fieldDefs.find((f) => f.id === state.sort.split(':')[1])?.name ?? 'Field' : SORT_LABEL[state.sort as keyof typeof SORT_LABEL];

  return (
    <div className="lb-toolbar" role="toolbar" aria-label="Filter, group and sort tasks">
      <Input
        size="sm"
        wrapClassName="lb-search"
        leading={<Icon name="search" size={14} />}
        placeholder="Search tasks…"
        aria-label="Search tasks"
        data-search
        value={state.q}
        onChange={(e) => onChange({ q: e.target.value })}
        onKeyDown={(e) => { if (e.key === 'Escape' && state.q) { e.preventDefault(); e.stopPropagation(); onChange({ q: '' }); } }}
        trailing={state.q ? <button type="button" className="lb-iconbtn" aria-label="Clear search" title="Clear search" onClick={() => onChange({ q: '' })}><Icon name="x" size={12} /></button> : undefined}
      />
      <div className="lb-toolbar__filters">
        <MultiFilter label="Assignee" options={assigneeOpts} value={state.assigneeIds} onChange={(assigneeIds) => onChange({ assigneeIds })} />
        <MultiFilter label="Tag" options={tagOpts} value={state.tagIds} onChange={(tagIds) => onChange({ tagIds })} />
        <MultiFilter label="Status" options={statusOpts} value={state.statuses} onChange={(v) => onChange({ statuses: v as TaskStatus[] })} />
        <MultiFilter label="Priority" options={prioOpts} value={state.priorities} onChange={(v) => onChange({ priorities: v as Priority[] })} />
        <Menu
          role="listbox" items={dueItems} label="Due date"
          trigger={(t, open) => (
            <button type="button" className={cx('lb-fbtn', state.due && 'is-active', open && 'is-open')} {...t}>
              <span>{state.due ? DUE_LABEL[state.due] : 'Due'}</span><Icon name="chevronDown" size={12} />
            </button>
          )}
        />
        {fieldDefs.length > 0 && <FieldFilterButton fields={fieldDefs} value={state.fieldFilters} onChange={(v) => onChange({ fieldFilters: v })} />}
        {active > 0 && (
          <span className="lb-active" role="status">
            <span>{active} filter{active === 1 ? '' : 's'}{shown !== total ? ` · ${shown} of ${total}` : ''}</span>
            <button type="button" className="lb-linkbtn" onClick={onClear}>Clear</button>
          </span>
        )}
      </div>
      <div className="lb-toolbar__right">
        {rightExtra}
        {groupOptions && (
          <Menu
            role="listbox" items={groupItems} label={groupLabel} align="end"
            trigger={(t, open) => (
              <button type="button" className={cx('lb-fbtn lb-fbtn--view', open && 'is-open')} {...t}>
                <Icon name="board" size={13} /><span>{groupLabel}: {groupName}</span><Icon name="chevronDown" size={12} />
              </button>
            )}
          />
        )}
        {showSort && (
          <Menu
            role="listbox" items={sortItems} label="Sort" align="end"
            trigger={(t, open) => (
              <button type="button" className={cx('lb-fbtn lb-fbtn--view', state.sort !== 'manual' && 'is-active', open && 'is-open')} {...t}>
                <Icon name="chevronsUpDown" size={13} /><span>Sort: {sortName}</span>
              </button>
            )}
          />
        )}
        <Chip selected={state.hideDone} onClick={() => onChange({ hideDone: !state.hideDone })} icon={<Icon name="check" size={12} />}>Hide done</Chip>
      </div>
    </div>
  );
}

/** Inline "Add task…" row / card input. Enter creates and keeps focus; Escape cancels. */
export function AddTaskInput({ onCreate, placeholder = 'Add task…', openToken, variant = 'row', autoFocus, allowAbove }: {
  onCreate: (title: string, opts?: { above: boolean }) => Promise<unknown> | void;
  /** Shift+Enter creates the task above the focused row instead of at the end. */
  allowAbove?: boolean;
  placeholder?: string;
  openToken?: number;
  variant?: 'row' | 'card';
  autoFocus?: boolean;
}) {
  const [open, setOpen] = useState(!!autoFocus);
  const [value, setValue] = useState('');
  const valueRef = useRef('');
  const input = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const set = (v: string) => { valueRef.current = v; setValue(v); };

  useEffect(() => { if (openToken) setOpen(true); }, [openToken]);
  useEffect(() => { if (open) input.current?.focus({ preventScroll: false }); }, [open, openToken]);

  const submit = async (keepOpen: boolean, above = false) => {
    const title = valueRef.current.trim();
    if (!title || busy.current) { if (!keepOpen) setOpen(false); return; }
    busy.current = true;
    set('');
    try { await onCreate(title, allowAbove ? { above } : undefined); } finally { busy.current = false; }
    if (keepOpen) input.current?.focus({ preventScroll: true }); else setOpen(false);
  };

  if (!open) {
    return (
      <button type="button" className={cx('lb-addbtn', variant === 'card' && 'lb-addbtn--card')} onClick={() => setOpen(true)}>
        <Icon name="plus" size={14} /><span>{placeholder}</span>
      </button>
    );
  }
  return (
    <div className={cx('lb-addinput', variant === 'card' && 'lb-addinput--card')}>
      <input
        ref={input}
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        maxLength={300}
        onChange={(e) => set(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); void submit(true, allowAbove && e.shiftKey); }
          else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); set(''); setOpen(false); }
        }}
        onBlur={() => { void submit(false); }}
      />
      <span className="lb-addinput__hint pm-faint">{allowAbove ? 'Enter to add · Shift+Enter above the focused row · Esc to cancel' : 'Enter to add · Esc to cancel'}</span>
    </div>
  );
}

