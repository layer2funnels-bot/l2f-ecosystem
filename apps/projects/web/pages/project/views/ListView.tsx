import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, KeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import type { BulkTaskPatch, CustomField, FieldValue, Person, Priority, ProjectDetail, Section, TaskRow, TaskStatus } from '../../../../shared/api.ts';
import { PRIORITIES, TASK_STATUSES } from '../../../../shared/api.ts';
import { call } from '../../../api/client.ts';
import { invalidateWork, setQueryData, useQuery } from '../../../api/store.ts';
import { useTasks } from '../../../lib/data.ts';
import { MAX_ASSIGNEES, useAssignable } from '../../../lib/people.ts';
import { cx, PRIORITY_META, TASK_STATUS_META } from '../../../lib/util.ts';
import { openTask } from '../../../router.ts';
import { clearTaskOrder, publishTaskOrder } from '../../../task/panelNav.ts';
import { PriorityMenu, StatusMenu } from '../../../ui/Badges.tsx';
import { PeoplePickerPanel } from '../../../ui/PeoplePicker.tsx';
import { Button } from '../../../ui/Button.tsx';
import { ConfirmDialog } from '../../../ui/Dialog.tsx';
import { EmptyState, ErrorState, Skeleton } from '../../../ui/Feedback.tsx';
import { Checkbox } from '../../../ui/Form.tsx';
import { Icon } from '../../../ui/icons.tsx';
import { DatePicker } from '../../../ui/DatePicker.tsx';
import { Menu } from '../../../ui/Menu.tsx';
import type { MenuItem, TriggerProps } from '../../../ui/Menu.tsx';
import { toast } from '../../../ui/Toast.tsx';
import { contextMenuProps, openMenuFrom } from '../../../ui/ContextMenu.tsx';
import type { CtxItem } from '../../../ui/ContextMenu.tsx';
import { askForm } from '../../../ui/Prompt.tsx';
import { taskMenuProps } from '../../../task/taskMenu.tsx';
import { FieldEditor } from '../../../fields/FieldEditors.tsx';
import { ColumnsMenu, DEFAULT_COLUMNS, FieldsButton } from '../../../fields/FieldFilters.tsx';
import { FieldTypeIcon, setTaskField } from '../../../fields/fieldKit.tsx';
import {
  AddTaskInput, buildTree, daysLate, DueText, dueTone, endPosition, AssigneesCell, Indicators, MiniIcon, positionBetween, sortTasks, TagChips, useTaskActions, useViewState, ViewToolbar, write,
} from './taskViewShared.tsx';
import type { CreateInit, GroupBy, MoveSpec, ViewState } from './taskViewShared.tsx';
import { activeFilterCount, sanitizeState } from './taskViewShared.tsx';
import { domRoot, realTarget } from '../../../lib/dom.ts';

// ---------------------------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------------------------
interface Group {
  key: string;
  kind: GroupBy | 'field';
  fieldId?: string;
  title: string;
  color?: string;
  /** sectionId / status / assignee id / priority; null = the "none" bucket. */
  value: string | null;
  section: Section | null;
  tasks: TaskRow[];
}

function buildGroups(top: TaskRow[], project: ProjectDetail, s: ViewState): Group[] {
  const filtering = activeFilterCount(s) > 0;
  const sort = (l: TaskRow[]) => sortTasks(l, s.sort, project.fields);
  const out: Group[] = [];
  if (s.groupBy === 'none') {
    out.push({ key: 'all', kind: 'none', title: 'All tasks', value: null, section: null, tasks: sort(top) });
    return out;
  }
  if (s.groupBy.startsWith('field:')) {
    const fd = project.fields.find((x) => x.id === s.groupBy.slice(6));
    if (fd) {
      for (const o of fd.options) out.push({ key: `fd:${o.id}`, kind: 'field', fieldId: fd.id, title: o.label, color: o.color, value: o.id, section: null, tasks: sort(top.filter((t) => t.fields[fd.id] === o.id)) });
      out.push({ key: 'fd:none', kind: 'field', fieldId: fd.id, title: `No ${fd.name}`, value: null, section: null, tasks: sort(top.filter((t) => !fd.options.some((o) => o.id === t.fields[fd.id]))) });
      return filtering ? out.filter((g) => g.tasks.length > 0) : out;
    }
  }
  if (s.groupBy === 'section') {
    const secs = [...project.sections].sort((a, b) => a.position - b.position);
    const known = new Set(secs.map((x) => x.id));
    const none = top.filter((t) => !t.sectionId || !known.has(t.sectionId));
    if (none.length > 0 || secs.length === 0) out.push({ key: 'sec:none', kind: 'section', title: 'No section', value: null, section: null, tasks: sort(none) });
    for (const sec of secs) out.push({ key: `sec:${sec.id}`, kind: 'section', title: sec.name, value: sec.id, section: sec, tasks: sort(top.filter((t) => t.sectionId === sec.id)) });
  } else if (s.groupBy === 'status') {
    for (const st of TASK_STATUSES) {
      if (st === 'done' && s.hideDone) continue;
      out.push({ key: `st:${st}`, kind: 'status', title: TASK_STATUS_META[st].label, color: TASK_STATUS_META[st].color, value: st, section: null, tasks: sort(top.filter((t) => t.status === st)) });
    }
  } else if (s.groupBy === 'priority') {
    for (const p of [...PRIORITIES].reverse()) {
      out.push({ key: `pr:${p}`, kind: 'priority', title: PRIORITY_META[p].label, color: PRIORITY_META[p].color, value: p, section: null, tasks: sort(top.filter((t) => t.priority === p)) });
    }
  } else {
    // A task with several assignees appears under each of them.
    const un = top.filter((t) => t.assignees.length === 0);
    out.push({ key: 'as:none', kind: 'assignee', title: 'Unassigned', value: null, section: null, tasks: sort(un) });
    const who = new Map<string, Person>(project.members.map((m) => [m.id, m]));
    for (const t of top) for (const a of t.assignees) if (!who.has(a.id)) who.set(a.id, a);
    for (const m of [...who.values()].sort((a, b) => a.name.localeCompare(b.name))) {
      const mine = top.filter((t) => t.assignees.some((a) => a.id === m.id));
      if (mine.length) out.push({ key: `as:${m.id}`, kind: 'assignee', title: m.name, color: m.color, value: m.id, section: null, tasks: sort(mine) });
    }
  }
  return filtering ? out.filter((g) => g.tasks.length > 0) : out;
}

const initFor = (g: Group): CreateInit => {
  switch (g.kind) {
    case 'section': return { sectionId: g.value };
    case 'status': return { status: g.value as TaskStatus };
    case 'assignee': return { assigneeIds: g.value ? [g.value] : [] };
    case 'priority': return { priority: g.value as Priority };
    case 'field': return g.value ? { fields: { [g.fieldId as string]: g.value } } : {};
    default: return {};
  }
};

// ---------------------------------------------------------------------------------------------
// ListView
// ---------------------------------------------------------------------------------------------
export function ListView({ project }: { project: ProjectDetail }) {
  return <ListViewInner key={project.id} project={project} />;
}

type Drag = { kind: 'task' | 'section'; id: string; fromKey?: string };
interface DropAt { key: string; beforeId: string | null }
interface SecDrop { id: string; after: boolean }

function ListViewInner({ project }: { project: ProjectDetail }) {
  const pid = project.id;
  const canEdit = project.myRole !== 'viewer' && !project.deletedAt;
  const tasksQ = useTasks(pid, true);
  const tagsQ = useQuery('tags', () => call('tags.list', {}), []);
  const prefsQ = useQuery(`viewprefs:${pid}`, () => call('viewprefs.get', { projectId: pid }), []);
  const { state: rawState, update: setState, clear } = useViewState(pid, 'list', prefsQ.data);
  const state = useMemo(() => sanitizeState(rawState, project.fields, 'list'), [rawState, project.fields]);
  const act = useTaskActions(project);
  const people = useAssignable(project);

  const all = useMemo(() => tasksQ.data ?? [], [tasksQ.data]);
  const byId = useMemo(() => new Map(all.map((t) => [t.id, t])), [all]);
  const tree = useMemo(() => buildTree(all, state, project.fields), [all, state, project.fields]);
  const groups = useMemo(() => buildGroups(tree.top, project, state), [tree.top, project, state]);
  const filtering = activeFilterCount(state) > 0;

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focusId, setFocusId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [renamingSec, setRenamingSec] = useState<string | null>(null);
  const [addTokens, setAddTokens] = useState<Record<string, number>>({});
  const [confirmSec, setConfirmSec] = useState<Section | null>(null);
  const [confirmTrash, setConfirmTrash] = useState(false);
  const [firstAdd, setFirstAdd] = useState(false);
  const [addingSection, setAddingSection] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const lastSel = useRef<string | null>(null);

  // drag state
  const dragRef = useRef<Drag | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const dropRef = useRef<DropAt | null>(null);
  const [drop, setDropState] = useState<DropAt | null>(null);
  const secDropRef = useRef<SecDrop | null>(null);
  const [secDrop, setSecDropState] = useState<SecDrop | null>(null);
  const setDrop = (d: DropAt | null) => {
    const c = dropRef.current;
    if (c?.key === d?.key && c?.beforeId === d?.beforeId) return;
    dropRef.current = d; setDropState(d);
  };
  const setSecDrop = (d: SecDrop | null) => {
    const c = secDropRef.current;
    if (c?.id === d?.id && c?.after === d?.after) return;
    secDropRef.current = d; setSecDropState(d);
  };
  const endDrag = () => { dragRef.current = null; setDragId(null); setDrop(null); setSecDrop(null); };

  const sortedSections = useMemo(() => [...project.sections].sort((a, b) => a.position - b.position), [project.sections]);

  // Visible rows in order (for keyboard + shift-select).
  const flatIds = useMemo(() => {
    const ids: string[] = [];
    for (const g of groups) {
      if (collapsed.has(g.key)) continue;
      for (const t of g.tasks) {
        ids.push(t.id);
        if (expanded.has(t.id) || state.q.trim()) for (const k of tree.kids.get(t.id) ?? []) ids.push(k.id);
      }
    }
    return [...new Set(ids)]; // grouped by assignee, a shared task shows up once per assignee
  }, [groups, collapsed, expanded, tree.kids, state.q]);

  const selIds = useMemo(() => [...selected].filter((id) => byId.has(id)), [selected, byId]);

  // Tell the task drawer the order we are showing, so J / K there walks this list.
  useEffect(() => { publishTaskOrder(pid, flatIds); }, [pid, flatIds]);
  useEffect(() => () => clearTaskOrder(pid), [pid]);

  // Escape clears the selection (unless a menu / dialog / input owns the key).
  useEffect(() => {
    if (!selIds.length) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const tg = realTarget(e) as HTMLElement | null;
      if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA')) return;
      if (domRoot().querySelector('[role="dialog"], .pm-pop')) return;
      setSelected(new Set());
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selIds.length]);

  const toggleSelect = useCallback((id: string, on: boolean, shift: boolean) => {
    const from = lastSel.current;
    setSelected((cur) => {
      const next = new Set(cur);
      if (shift && from && from !== id) {
        const a = flatIds.indexOf(from), b = flatIds.indexOf(id);
        if (a >= 0 && b >= 0) {
          for (let i = Math.min(a, b); i <= Math.max(a, b); i++) { if (on) next.add(flatIds[i]); else next.delete(flatIds[i]); }
          return next;
        }
      }
      if (on) next.add(id); else next.delete(id);
      return next;
    });
    lastSel.current = id;
  }, [flatIds]);

  const focusRow = (id: string | undefined) => {
    if (!id) return;
    setFocusId(id);
    rootRef.current?.querySelector<HTMLElement>(`[data-row-id="${id}"]`)?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement;
    const id = el.dataset?.rowId;
    if (!id) return;
    // Ctrl/Cmd+Enter toggles complete on the focused row.
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.altKey) {
      if (!canEdit) return;
      e.preventDefault();
      const row = byId.get(id);
      if (row) void act.toggleDone(row);
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const idx = flatIds.indexOf(id);
    switch (e.key) {
      case 'j': case 'ArrowDown': e.preventDefault(); focusRow(flatIds[Math.min(flatIds.length - 1, idx + 1)]); break;
      case 'k': case 'ArrowUp': e.preventDefault(); focusRow(flatIds[Math.max(0, idx - 1)]); break;
      case 'Enter':
        e.preventDefault();
        if (!e.shiftKey) openTask(id);
        else if (canEdit) void addBelow(id);
        break;
      case 'x': case ' ': if (canEdit) { e.preventDefault(); toggleSelect(id, !selected.has(id), e.shiftKey); } break;
      default: break;
    }
  };

  // ------ writes ------
  const projectKey = `project:${pid}`;
  const sectionWrite = (apply: (s: Section[]) => Section[], fn: () => Promise<unknown>) =>
    write(() => setQueryData<ProjectDetail>(projectKey, (old) => ({ ...old, sections: apply(old.sections) })), fn);

  const renameSection = (sec: Section, name: string) => {
    const n = name.trim();
    if (!n || n === sec.name) return;
    void sectionWrite((l) => l.map((x) => (x.id === sec.id ? { ...x, name: n } : x)), () => call('sections.update', { id: sec.id, name: n }));
  };
  const addSection = async (name: string) => {
    try { await call('sections.create', { projectId: pid, name }); invalidateWork(); } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not add the section'); }
  };
  const placeSection = (id: string, insertAt: (others: Section[]) => number) => {
    const others = sortedSections.filter((x) => x.id !== id);
    const at = Math.max(0, Math.min(others.length, insertAt(others)));
    const prev = others[at - 1], next = others[at];
    const position = prev && next ? (prev.position + next.position) / 2 : prev ? prev.position + 1000 : next ? next.position - 1000 : 1000;
    void sectionWrite((l) => l.map((x) => (x.id === id ? { ...x, position } : x)), () => call('sections.update', { id, position }));
  };
  const moveSection = (sec: Section, dir: -1 | 1) => {
    const i = sortedSections.findIndex((x) => x.id === sec.id);
    placeSection(sec.id, () => i + dir);
  };
  const addSectionAt = async (ref: Section, after: boolean) => {
    const r = await askForm({ title: after ? 'Add section below' : 'Add section above', fields: [{ name: 'name', label: 'Section name', required: true, maxLength: 80 }], confirmLabel: 'Add section' });
    if (!r) return;
    try {
      const made = await call('sections.create', { projectId: pid, name: r.name });
      const others = sortedSections.filter((x) => x.id !== made.id);
      const i = others.findIndex((x) => x.id === ref.id) + (after ? 1 : 0);
      const prev = others[i - 1], next = others[i];
      const position = prev && next ? (prev.position + next.position) / 2 : prev ? prev.position + 1000 : next ? next.position - 1000 : 1000;
      await call('sections.update', { id: made.id, position });
      invalidateWork();
    } catch (e) { invalidateWork(); toast.error(e instanceof Error ? e.message : 'Could not add the section'); }
  };
  const groupMenu = (g: Group): CtxItem[] => {
    const sec = g.section;
    const idx = sec ? sortedSections.findIndex((x) => x.id === sec.id) : -1;
    const items: CtxItem[] = [];
    if (canEdit) items.push({ id: 'add', icon: 'plus', label: 'Add task', onSelect: () => { setCollapsed((c) => { const n = new Set(c); n.delete(g.key); return n; }); setAddTokens((a) => ({ ...a, [g.key]: (a[g.key] ?? 0) + 1 })); } });
    if (canEdit && sec) {
      items.push(
        { id: 'rename', icon: 'edit', label: 'Rename', onSelect: () => setRenamingSec(sec.id) },
        { id: 'above', icon: 'chevronUp', label: 'Add section above', separatorBefore: true, onSelect: () => void addSectionAt(sec, false) },
        { id: 'below', icon: 'chevronDown', label: 'Add section below', onSelect: () => void addSectionAt(sec, true) },
        { id: 'up', icon: 'arrowRight', label: 'Move up', disabled: idx <= 0, disabledReason: 'Already the first section', onSelect: () => moveSection(sec, -1) },
        { id: 'down', icon: 'arrowRight', label: 'Move down', disabled: idx >= sortedSections.length - 1, disabledReason: 'Already the last section', onSelect: () => moveSection(sec, 1) },
      );
    }
    items.push(
      { id: 'collapse', icon: 'chevronRight', label: 'Collapse all', separatorBefore: items.length > 0, onSelect: () => setCollapsed(new Set(groups.map((x) => x.key))) },
      { id: 'expand', icon: 'chevronDown', label: 'Expand all', disabled: collapsed.size === 0, disabledReason: 'Nothing is collapsed', onSelect: () => setCollapsed(new Set()) },
    );
    if (canEdit && sec) items.push({ id: 'del', icon: 'trash', label: 'Delete section…', danger: true, separatorBefore: true, onSelect: () => setConfirmSec(sec) });
    return items;
  };
  const deleteSection = async (sec: Section) => {
    await write(
      () => {
        const undoSec = setQueryData<ProjectDetail>(projectKey, (old) => ({ ...old, sections: old.sections.filter((x) => x.id !== sec.id) }));
        const undoTasks = setQueryData<TaskRow[]>(`tasks:${pid}`, (old) => old.map((t) => (t.sectionId === sec.id ? { ...t, sectionId: null } : t)));
        return () => { undoSec(); undoTasks(); };
      },
      () => call('sections.delete', { id: sec.id }),
    );
    setConfirmSec(null);
  };

  // Shift+Enter on a row: a new task directly below it (same group / section / status, or a sibling subtask), ready to be named.
  const freshId = useRef<string | null>(null);
  const addBelow = async (id: string) => {
    const t = byId.get(id);
    if (!t) return;
    let row: TaskRow | undefined;
    if (t.parentId) {
      const sibs = tree.kids.get(t.parentId) ?? [];
      const i = sibs.findIndex((x) => x.id === id);
      row = await act.create('New task', { parentId: t.parentId, position: positionBetween(sibs[i], sibs[i + 1]) });
      if (row) setExpanded((cur) => new Set(cur).add(t.parentId as string));
    } else {
      const g = groups.find((x) => x.tasks.some((y) => y.id === id));
      if (!g) return;
      const manual = sortTasks(g.tasks, 'manual');
      const i = manual.findIndex((x) => x.id === id);
      row = await act.create('New task', { ...initFor(g), position: positionBetween(manual[i], manual[i + 1]) });
    }
    if (!row) return;
    freshId.current = row.id;
    setFocusId(row.id);
    setEditingId(row.id);
  };
  const discardFresh = async (t: TaskRow) => {
    const rollback = setQueryData<TaskRow[]>(`tasks:${pid}`, (old) => old.filter((x) => x.id !== t.id));
    try { await call('tasks.trash', { ids: [t.id] }); invalidateWork(); } catch (e) { rollback(); toast.error(e instanceof Error ? e.message : 'Could not remove the new task'); }
  };

  const commitTitle = (t: TaskRow, title: string | null) => {
    setEditingId(null);
    if (freshId.current === t.id) {
      freshId.current = null;
      if (title === null) { void discardFresh(t); return; }   // Escape on a task you just created = never mind
      window.setTimeout(() => focusRow(t.id), 0);             // keep the keyboard flow: Shift+Enter again for the next one
    }
    const v = title?.trim();
    if (!v || v === t.title) { if (title !== null && !v) toast.error('A task needs a title.'); return; }
    void act.update([t.id], { title: v });
  };

  // ------ drag & drop ------
  const performDrop = () => {
    const d = dragRef.current;
    const dp = dropRef.current;
    const sd = secDropRef.current;
    endDrag();
    if (!d) return;
    if (d.kind === 'section') {
      if (sd && sd.id !== d.id) placeSection(d.id, (others) => others.findIndex((x) => x.id === sd.id) + (sd.after ? 1 : 0));
      return;
    }
    const t = byId.get(d.id);
    const g = dp ? groups.find((x) => x.key === dp.key) : undefined;
    if (!t || !dp || !g) return;
    const sibs = sortTasks(g.tasks, 'manual').filter((x) => x.id !== t.id);
    let idx = dp.beforeId ? sibs.findIndex((x) => x.id === dp.beforeId) : -1;
    if (idx < 0) idx = sibs.length;
    const spec: MoveSpec = { position: positionBetween(sibs[idx - 1], sibs[idx]) };
    let changed = false;
    if (g.kind === 'section' && (t.sectionId ?? null) !== g.value) { spec.sectionId = g.value; changed = true; }
    if (g.kind === 'status' && t.status !== g.value) { spec.status = g.value as TaskStatus; changed = true; }
    if (g.kind === 'assignee' && g.key !== d.fromKey) {
      // Moving between assignee groups hands the task over: the new person is added, the one whose group it came from is removed.
      const from = d.fromKey?.startsWith('as:') && d.fromKey !== 'as:none' ? d.fromKey.slice(3) : undefined;
      const add = g.value && !t.assignees.some((a) => a.id === g.value) ? g.value : undefined;
      const remove = from && from !== g.value && t.assignees.some((a) => a.id === from) ? from : undefined;
      if (add || remove) { spec.assignees = { add, remove }; changed = true; }
    }
    if (g.kind === 'priority' && t.priority !== g.value) { spec.priority = g.value as Priority; changed = true; }
    if (g.kind === 'field' && g.fieldId && (t.fields[g.fieldId] ?? null) !== g.value) { spec.fields = { [g.fieldId]: g.value }; changed = true; }
    if (state.sort !== 'manual' && !changed) return;
    void act.move(t, spec);
  };

  const rowDragStart = (e: DragEvent, t: TaskRow, fromKey: string) => {
    dragRef.current = { kind: 'task', id: t.id, fromKey };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', t.title);
    window.setTimeout(() => setDragId(t.id), 0);
  };
  const rowDragOver = (e: DragEvent, g: Group, t: TaskRow, nextId: string | null) => {
    if (dragRef.current?.kind !== 'task') return;
    e.preventDefault(); e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (state.sort !== 'manual') { setDrop({ key: g.key, beforeId: null }); return; }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDrop({ key: g.key, beforeId: e.clientY < r.top + r.height / 2 ? t.id : nextId });
  };
  const groupDragOver = (e: DragEvent, g: Group) => {
    const d = dragRef.current;
    if (!d) return;
    if (d.kind === 'task') {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDrop({ key: g.key, beforeId: null });
    } else if (g.section && g.section.id !== d.id) {
      e.preventDefault();
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setSecDrop({ id: g.section.id, after: e.clientY > r.top + r.height / 2 });
    }
  };

  // ------ bulk ------
  const bulkPatch = (patch: BulkTaskPatch, label: string) => {
    void act.update(selIds, patch).then((ok) => { if (ok) toast.success(`${label} for ${selIds.length} task${selIds.length === 1 ? '' : 's'}`); });
  };
  const bulkTrash = async () => {
    const ids = selIds;
    const ok = await act.trash(ids);
    if (ok) setSelected(new Set());
    setConfirmTrash(false);
  };

  // ------ render ------
  const toolbar = (
    <ViewToolbar
      state={state} onChange={setState} onClear={clear} members={people} tags={tagsQ.data ?? []}
      groupOptions={['section', 'status', 'assignee', 'priority', 'none']} showSort shown={tree.top.length} total={tree.total} fields={project.fields}
      rightExtra={<><ColumnsMenu columns={state.columns} fields={project.fields} onChange={(columns) => setState({ columns })} /><FieldsButton projectId={pid} count={project.fields.length} /></>}
    />
  );

  if (tasksQ.loading && !tasksQ.data) {
    return (
      <div className="lb-view" aria-busy="true">
        {toolbar}
        <div className="lb-skeleton" role="status" aria-label="Loading tasks">
          {Array.from({ length: 9 }, (_, i) => <Skeleton key={i} height={36} radius={6} style={{ opacity: 1 - i * 0.08 }} />)}
        </div>
      </div>
    );
  }
  if (tasksQ.error && !tasksQ.data) {
    return <div className="lb-view"><ErrorState title="Couldn't load tasks" message={tasksQ.error.message} onRetry={() => void tasksQ.refetch()} /></div>;
  }

  const colIds = state.columns ?? DEFAULT_COLUMNS;
  const show = { tags: colIds.includes('tags'), who: colIds.includes('who'), due: colIds.includes('due') };
  const fieldCols = project.fields.filter((f) => colIds.includes(`f:${f.id}`));
  const fw = (f: CustomField) => ({ text: 180, number: 110, currency: 130, select: 150, multiselect: 200, date: 140, checkbox: 90, url: 180 }[f.type]);
  const widths = [20, 28, 0, show.tags ? 150 : 0, show.who ? 80 : 0, show.due ? 176 : 0, 44, 128, ...fieldCols.map(fw), 30].filter((w, i) => i === 2 || w > 0);
  const template = widths.map((w, i) => (i === 2 ? 'minmax(240px, 1fr)' : `${w}px`)).join(' ');
  const minWidth = widths.reduce((a, w, i) => a + (i === 2 ? 240 : w), 0) + (widths.length - 1) * 8 + 20;
  const tableStyle = { ['--lb-cols-d' as string]: template, ['--lb-minw' as string]: `${minWidth}px` };
  const sortField = state.sort.startsWith('field:') ? state.sort.split(':')[1] : null;
  const sortDesc = state.sort.endsWith(':desc');
  const sectionsEmpty = project.sections.length === 0;
  const projectEmpty = tree.total === 0 && sectionsEmpty;
  const noResults = tree.total > 0 && tree.top.length === 0;
  const selRows = selIds.map((id) => byId.get(id)).filter((r): r is TaskRow => !!r);
  const rowFor = (t: TaskRow, g: Group, depth: 0 | 1, nextId: string | null, parent?: TaskRow) => {
    const kids = depth === 0 ? tree.kids.get(t.id) ?? [] : [];
    const dragT = parent ?? t;
    return (
      <TaskRowView
        key={t.id}
        task={t}
        depth={depth}
        canEdit={canEdit}
        show={show}
        fieldCols={fieldCols}
        ctx={taskMenuProps(t, { project, selection: selRows, onRename: canEdit ? () => setEditingId(t.id) : undefined })}
        people={people}
        selected={selected.has(t.id)}
        tabbable={(focusId ?? flatIds[0]) === t.id}
        editing={editingId === t.id}
        expanded={expanded.has(t.id) || (!!state.q.trim() && kids.length > 0)}
        hasKids={kids.length > 0}
        dragging={dragId === t.id}
        dropBefore={!!drop && drop.key === g.key && drop.beforeId === dragT.id && depth === 0}
        onFocusRow={() => setFocusId(t.id)}
        onToggleExpand={() => setExpanded((cur) => { const n = new Set(cur); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; })}
        onSelect={(on, shift) => toggleSelect(t.id, on, shift)}
        onStartEdit={() => setEditingId(t.id)}
        onCommitTitle={(title) => commitTitle(t, title)}
        onToggleDone={() => void act.toggleDone(t)}
        onUpdate={(patch) => void act.update([t.id], patch)}
        onTrash={() => void act.trash([t.id], t.title)}
        onDuplicate={() => void act.duplicate(t.id)}
        onDragStart={(e) => rowDragStart(e, t, g.key)}
        onDragOver={(e) => rowDragOver(e, g, dragT, nextId)}
        onDragEnd={endDrag}
      />
    );
  };

  return (
    <div className="lb-view">
      {toolbar}

      {projectEmpty ? (
        <EmptyState
          icon="list"
          title="No tasks yet"
          text={canEdit ? 'Add the first task to get this project moving. You can group them into sections later.' : 'Nothing has been added to this project yet.'}
          action={canEdit ? (firstAdd
            ? <div className="lb-firstadd"><AddTaskInput autoFocus placeholder="Name your first task…" onCreate={async (title) => { await act.create(title); }} /></div>
            : <Button variant="primary" icon="plus" onClick={() => setFirstAdd(true)}>Add your first task</Button>) : undefined}
        />
      ) : noResults ? (
        <EmptyState
          icon="search"
          title="No tasks match"
          text={filtering ? 'Nothing fits the current search and filters.' : 'Every task here is done and hidden.'}
          action={<Button onClick={() => { clear(); setState({ hideDone: false }); }}>{filtering ? 'Clear filters' : 'Show done tasks'}</Button>}
        />
      ) : (
        <div className="lb-scroll" style={tableStyle}>
        <div ref={rootRef} className="lb-list" role="grid" aria-label={`Tasks in ${project.name}`} aria-rowcount={flatIds.length} onKeyDown={onKeyDown} onDragEnd={endDrag}>
          <div className="lb-colhead" role="row">
            <span className="lb-cell lb-cell--grip" />
            <span className="lb-cell lb-cell--sel">
              {canEdit && flatIds.length > 0 && (
                <Checkbox
                  checked={selIds.length > 0 && selIds.length >= flatIds.length}
                  indeterminate={selIds.length > 0 && selIds.length < flatIds.length}
                  onChange={(on) => setSelected(on ? new Set(flatIds) : new Set())}
                  label={<span className="pm-sr-only">Select all visible tasks</span>}
                />
              )}
            </span>
            <span className="lb-cell lb-cell--title" role="columnheader">Name</span>
            {show.tags && <span className="lb-cell lb-cell--tags" role="columnheader">Tags</span>}
            {show.who && <span className="lb-cell lb-cell--who" role="columnheader">Assignees</span>}
            {show.due && <span className="lb-cell lb-cell--due" role="columnheader">Due</span>}
            <span className="lb-cell lb-cell--prio" role="columnheader"><Icon name="flag" size={12} /></span>
            <span className="lb-cell lb-cell--status" role="columnheader">Status</span>
            {fieldCols.map((f) => (
              <span key={f.id} className="lb-cell lb-cell--field" role="columnheader" aria-sort={sortField === f.id ? (sortDesc ? 'descending' : 'ascending') : undefined}>
                <button type="button" className="fv-colhead" title={`${f.name}: click to sort`} onClick={() => setState({ sort: (sortField === f.id && !sortDesc ? `field:${f.id}:desc` : sortField === f.id ? 'manual' : `field:${f.id}`) as ViewState['sort'] })}>
                  <FieldTypeIcon type={f.type} size={12} /><span className="pm-truncate">{f.name}</span>{sortField === f.id && <Icon name={sortDesc ? 'chevronDown' : 'chevronUp'} size={11} />}
                </button>
              </span>
            ))}
            <span className="lb-cell lb-cell--act" />
          </div>

          {groups.map((g) => {
            const isCollapsed = collapsed.has(g.key);
            const dropHere = drop?.key === g.key;
            const secLine = secDrop && g.section && secDrop.id === g.section.id ? (secDrop.after ? 'is-secdrop-after' : 'is-secdrop-before') : '';
            return (
              <section
                key={g.key}
                className={cx('lb-group', secLine, dropHere && 'is-dropping')}
                role="rowgroup"
                aria-label={g.title}
                onDragOver={(e) => groupDragOver(e, g)}
                onDrop={(e) => { e.preventDefault(); performDrop(); }}
              >
                {g.kind !== 'none' && (
                  <div
                    className="lb-ghead"
                    {...contextMenuProps(() => groupMenu(g), { label: `${g.title} actions` })}
                    draggable={canEdit && !!g.section && renamingSec !== g.section.id}
                    onDragStart={(e) => {
                      if (!g.section) return;
                      dragRef.current = { kind: 'section', id: g.section.id };
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', g.title);
                    }}
                  >
                    <button
                      type="button"
                      className="lb-ghead__toggle"
                      aria-expanded={!isCollapsed}
                      aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${g.title}`} title={`${isCollapsed ? 'Expand' : 'Collapse'} ${g.title}`}
                      onClick={() => setCollapsed((c) => { const n = new Set(c); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })}
                    >
                      <Icon name={isCollapsed ? 'chevronRight' : 'chevronDown'} size={14} />
                    </button>
                    {g.color && g.kind !== 'assignee' && <span className="pm-dot" style={{ background: g.color }} />}
                    {g.kind === 'priority' && g.value && <Icon name="flag" size={13} style={{ color: g.color }} />}
                    {renamingSec && g.section && renamingSec === g.section.id ? (
                      <SectionRename name={g.section.name} onDone={(v) => { setRenamingSec(null); if (v !== null && g.section) renameSection(g.section, v); }} />
                    ) : (
                      <h3
                        className="lb-ghead__name pm-truncate"
                        title={g.section && canEdit ? 'Double-click to rename' : g.title}
                        onDoubleClick={() => { if (canEdit && g.section) setRenamingSec(g.section.id); }}
                      >{g.title}</h3>
                    )}
                    <span className="lb-ghead__count" aria-label={`${g.tasks.length} tasks`}>{g.tasks.length}</span>
                    {canEdit && (
                      <span className="lb-ghead__actions">
                        <button
                          type="button" className="lb-iconbtn" aria-label={`Add task to ${g.title}`} title="Add task"
                          onClick={() => { setCollapsed((c) => { const n = new Set(c); n.delete(g.key); return n; }); setAddTokens((a) => ({ ...a, [g.key]: (a[g.key] ?? 0) + 1 })); }}
                        ><Icon name="plus" size={14} /></button>
                        {g.section && (
                          <button type="button" className="lb-iconbtn" aria-haspopup="menu" aria-label={`${g.title} section actions`} title={`${g.title} section actions`} onClick={(e) => openMenuFrom(e.currentTarget)}><Icon name="more" size={14} /></button>
                        )}
                      </span>
                    )}
                  </div>
                )}

                {!isCollapsed && (
                  <div className="lb-gbody">
                    {g.tasks.length === 0 && !canEdit && <div className="lb-gempty pm-faint">No tasks</div>}
                    {g.tasks.map((t, i) => {
                      const nextId = g.tasks[i + 1]?.id ?? null;
                      const showKids = expanded.has(t.id) || !!state.q.trim();
                      return (
                        <div key={t.id} className="lb-rowwrap">
                          {rowFor(t, g, 0, nextId)}
                          {showKids && (tree.kids.get(t.id) ?? []).map((k) => rowFor(k, g, 1, nextId, t))}
                        </div>
                      );
                    })}
                    {dropHere && drop?.beforeId === null && <div className="lb-dropend" aria-hidden="true" />}
                    {canEdit && (
                      <div className="lb-addrow">
                        <AddTaskInput
                          openToken={addTokens[g.key]}
                          allowAbove
                          onCreate={async (title, o) => {
                            let position = endPosition(g.tasks);
                            if (o?.above) {
                              // Shift+Enter: above the row that last had focus in this group (else above the first row).
                              const manual = sortTasks(g.tasks, 'manual');
                              const refIdx = Math.max(0, manual.findIndex((x) => x.id === focusId));
                              if (manual[refIdx]) position = positionBetween(manual[refIdx - 1], manual[refIdx]);
                            }
                            await act.create(title, { ...initFor(g), position });
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}

          {canEdit && state.groupBy === 'section' && (
            <div className="lb-addsection">
              {addingSection ? (
                <SectionRename
                  name="" placeholder="Section name"
                  onDone={(v) => { if (v) void addSection(v.trim()); else setAddingSection(false); }}
                />
              ) : (
                <button type="button" className="lb-addbtn" onClick={() => setAddingSection(true)}><Icon name="plus" size={14} /><span>Add section</span></button>
              )}
            </div>
          )}
        </div>
        </div>
      )}

      {canEdit && selIds.length > 0 && (
        <BulkBar
          count={selIds.length}
          people={people}
          selRows={selRows}
          sections={sortedSections}
          fields={project.fields}
          onPatch={bulkPatch}
          onTrash={() => setConfirmTrash(true)}
          onClear={() => setSelected(new Set())}
        />
      )}

      <ConfirmDialog
        open={!!confirmSec}
        danger
        title="Delete this section?"
        message={confirmSec ? <>“{confirmSec.name}” will be removed. Its {all.filter((t) => t.sectionId === confirmSec.id && !t.parentId).length} task(s) are kept and move to “No section”.</> : null}
        confirmLabel="Delete section"
        onClose={() => setConfirmSec(null)}
        onConfirm={() => (confirmSec ? deleteSection(confirmSec) : undefined)}
      />
      <ConfirmDialog
        open={confirmTrash}
        danger
        title={`Move ${selIds.length} task${selIds.length === 1 ? '' : 's'} to trash?`}
        message="Subtasks go with them. You can undo right after, or restore them from Trash later."
        confirmLabel="Move to trash"
        onClose={() => setConfirmTrash(false)}
        onConfirm={bulkTrash}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------------------------
function SectionRename({ name, onDone, placeholder, keepOpen }: { name: string; onDone: (v: string | null) => void; placeholder?: string; keepOpen?: boolean }) {
  const [v, setV] = useState(name);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const finish = (val: string | null) => { if (done.current) return; done.current = true; onDone(val); };
  return (
    <input
      ref={ref}
      className="lb-secinput"
      value={v}
      maxLength={80}
      placeholder={placeholder}
      aria-label={placeholder ?? 'Section name'}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => finish(v.trim() ? v : null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); if (v.trim()) { if (keepOpen) { onDone(v); setV(''); } else finish(v); } else finish(null); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(null); }
      }}
    />
  );
}

interface RowProps {
  task: TaskRow;
  depth: 0 | 1;
  canEdit: boolean;
  show: { tags: boolean; who: boolean; due: boolean };
  fieldCols: CustomField[];
  ctx: ReturnType<typeof contextMenuProps>;
  people: Person[];
  selected: boolean;
  tabbable: boolean;
  editing: boolean;
  expanded: boolean;
  hasKids: boolean;
  dragging: boolean;
  dropBefore: boolean;
  onFocusRow: () => void;
  onToggleExpand: () => void;
  onSelect: (on: boolean, shift: boolean) => void;
  onStartEdit: () => void;
  onCommitTitle: (title: string | null) => void;
  onToggleDone: () => void;
  onUpdate: (patch: BulkTaskPatch) => void;
  onTrash: () => void;
  onDuplicate: () => void;
  onDragStart: (e: DragEvent) => void;
  onDragOver: (e: DragEvent) => void;
  onDragEnd: () => void;
}

function TaskRowView(p: RowProps) {
  const { task: t, depth, canEdit } = p;
  const [armed, setArmed] = useState(false);
  const shift = useRef(false);
  const clickTimer = useRef<number | undefined>(undefined);
  const done = t.status === 'done';
  const tone = dueTone(t);
  const late = tone === 'late';

  const onTitleClick = (e: ReactMouseEvent) => {
    if (e.detail > 1) return;
    window.clearTimeout(clickTimer.current);
    clickTimer.current = window.setTimeout(() => openTask(t.id), canEdit ? 190 : 0);
  };
  const onTitleDouble = () => {
    window.clearTimeout(clickTimer.current);
    if (canEdit) p.onStartEdit();
  };
  return (
    <div
      role="row"
      {...p.ctx}
      data-row-id={t.id}
      tabIndex={p.tabbable ? 0 : -1}
      aria-selected={p.selected}
      aria-level={depth + 1}
      className={cx('lb-row', depth === 1 && 'is-sub', p.selected && 'is-selected', done && 'is-done', p.dragging && 'is-dragging', p.dropBefore && 'is-drop-before')}
      draggable={canEdit && depth === 0 && armed && !p.editing}
      onFocus={(e) => { if (e.target === e.currentTarget) p.onFocusRow(); }}
      onDragStart={(e) => { if (!armed) { e.preventDefault(); return; } p.onDragStart(e); }}
      onDragOver={p.onDragOver}
      onDragEnd={() => { setArmed(false); p.onDragEnd(); }}
      onMouseUp={() => setArmed(false)}
    >
      <span className="lb-cell lb-cell--grip" role="gridcell">
        {canEdit && depth === 0 && (
          <span className="lb-grip" title="Drag to reorder" aria-hidden="true" onMouseDown={() => setArmed(true)}><MiniIcon name="grip" size={14} /></span>
        )}
      </span>
      <span className="lb-cell lb-cell--sel" role="gridcell">
        {canEdit && (
          <span onClickCapture={(e) => { shift.current = e.shiftKey; }}>
            <Checkbox checked={p.selected} onChange={(on) => p.onSelect(on, shift.current)} label={<span className="pm-sr-only">Select “{t.title}”</span>} />
          </span>
        )}
      </span>
      <span className="lb-cell lb-cell--title" role="gridcell">
        {depth === 1 && <span className="lb-indent" aria-hidden="true" />}
        {depth === 0 && (
          p.hasKids
            ? <button type="button" className="lb-expander" aria-expanded={p.expanded} aria-label={`${p.expanded ? 'Hide' : 'Show'} subtasks of ${t.title}`} title={`${p.expanded ? 'Hide' : 'Show'} subtasks of ${t.title}`} onClick={p.onToggleExpand}><Icon name={p.expanded ? 'chevronDown' : 'chevronRight'} size={13} /></button>
            : <span className="lb-expander lb-expander--none" aria-hidden="true" />
        )}
        <button
          type="button"
          className={cx('lb-done', done && 'is-on')}
          disabled={!canEdit}
          aria-pressed={done}
          aria-label={done ? `Mark “${t.title}” as not done` : `Mark “${t.title}” as done`}
          title={done ? 'Reopen' : 'Mark complete'}
          onClick={p.onToggleDone}
        >
          <Icon name="check" size={12} strokeWidth={2.4} />
        </button>
        {p.editing ? (
          <TitleInput initial={t.title} onDone={p.onCommitTitle} />
        ) : (
          <>
            <button type="button" className="lb-title pm-truncate" title={t.title} onClick={onTitleClick} onDoubleClick={onTitleDouble}>{t.title}</button>
            {canEdit && <button type="button" className="lb-pencil" aria-label={`Rename “${t.title}”`} title="Rename" onClick={p.onStartEdit}><Icon name="edit" size={12} /></button>}
            <Indicators t={t} />
          </>
        )}
      </span>
      {p.show.tags && <span className="lb-cell lb-cell--tags" role="gridcell"><TagChips tags={t.tags} /></span>}
      {p.show.who && <span className="lb-cell lb-cell--who" role="gridcell">
        <AssigneesCell people={p.people.length ? p.people : t.assignees} value={t.assignees} disabled={!canEdit} onChange={(ids) => p.onUpdate({ assigneeIds: ids })} />
      </span>}
      {p.show.due && <span className="lb-cell lb-cell--due" role="gridcell">
        {canEdit ? (
          <span className={cx('lb-due', tone === 'today' && 'is-today', late && 'is-late', !t.dueOn && 'is-empty')}>
            <DatePicker
              variant="plain" size="sm" value={t.dueOn} placeholder="Add date" ariaLabel="Due date" overdue={late}
              onChange={(d) => p.onUpdate({ dueOn: d })}
            />
            {late && t.dueOn && <span className="lb-duetext__late" title="Overdue">{daysLate(t.dueOn)}d late</span>}
          </span>
        ) : <DueText t={t} />}
      </span>}
      <span className="lb-cell lb-cell--prio" role="gridcell">
        <PriorityMenu value={t.priority} showLabel={false} disabled={!canEdit} onChange={(priority) => p.onUpdate({ priority })} />
      </span>
      <span className="lb-cell lb-cell--status" role="gridcell">
        <StatusMenu value={t.status} compact disabled={!canEdit} onChange={(status) => p.onUpdate({ status })} />
      </span>
      {p.fieldCols.map((f) => (
        <span key={f.id} className={cx('lb-cell lb-cell--field', `fv-cellwrap fv-${f.type}`)} role="gridcell">
          <FieldEditor field={f} value={t.fields[f.id]} readOnly={!canEdit} variant="cell" onChange={(v) => void setTaskField(t, f.id, v)} />
        </span>
      ))}
      <span className="lb-cell lb-cell--act" role="gridcell">
        <button type="button" className="lb-iconbtn lb-rowmenu" aria-haspopup="menu" aria-label={`Actions for “${t.title}”`} title={`Actions for “${t.title}”`} onClick={(e) => openMenuFrom(e.currentTarget)}><Icon name="more" size={14} /></button>
      </span>
    </div>
  );
}

function TitleInput({ initial, onDone }: { initial: string; onDone: (v: string | null) => void }) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const finish = (val: string | null) => { if (finished.current) return; finished.current = true; onDone(val); };
  return (
    <input
      ref={ref}
      className="lb-titleinput"
      value={v}
      maxLength={300}
      aria-label="Task title"
      onChange={(e) => setV(e.target.value)}
      onBlur={() => finish(v)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); finish(v); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(null); }
        e.stopPropagation();
      }}
    />
  );
}

/** "Assignees" in the bulk bar: add people, remove a person, replace everyone, or unassign all. Each opens the multi-select picker. */
function BulkAssign({ people, selRows, onPatch, trig }: {
  people: Person[]; selRows: TaskRow[]; onPatch: (patch: BulkTaskPatch, label: string) => void; trig: (t: TriggerProps, open: boolean) => ReactNode;
}) {
  const [mode, setMode] = useState<'add' | 'remove' | 'replace' | null>(null);
  const wrap = useRef<HTMLSpanElement>(null);
  const current = useMemo(() => {
    const m = new Map<string, Person>();
    for (const t of selRows) for (const a of t.assignees) m.set(a.id, a);
    return [...m.values()];
  }, [selRows]);
  const n = selRows.length;
  const items: MenuItem[] = [
    { id: 'add', label: 'Add assignees…', icon: 'plus', onSelect: () => setMode('add') },
    { id: 'remove', label: 'Remove assignee…', icon: 'x', disabled: current.length === 0, onSelect: () => setMode('remove') },
    { id: 'replace', label: 'Replace assignees…', icon: 'user', onSelect: () => setMode('replace') },
    { id: 'clear', label: 'Unassign everyone', icon: 'trash', separatorBefore: true, disabled: current.length === 0, onSelect: () => onPatch({ assigneeIds: [] }, 'Unassigned') },
  ];
  const labelOf = (ids: string[]) => (ids.length === 1 ? (people.find((p) => p.id === ids[0])?.name.split(' ')[0] ?? '1 person') : `${ids.length} people`);
  return (
    <span ref={wrap} className="lb-bulk__who">
      <Menu items={items} label={`Assignees of ${n} tasks`} role="menu" trigger={trig} />
      <PeoplePickerPanel
        anchor={wrap.current}
        open={mode !== null}
        onClose={() => setMode(null)}
        people={mode === 'remove' ? current : people}
        value={[]}
        max={MAX_ASSIGNEES}
        title={mode === 'add' ? `Add assignees to ${n} task${n === 1 ? '' : 's'}` : mode === 'remove' ? 'Remove assignees' : `Replace assignees of ${n} task${n === 1 ? '' : 's'}`}
        commitLabel={mode === 'add' ? 'Add' : mode === 'remove' ? 'Remove' : 'Replace'}
        onCommit={(ids) => {
          if (mode === 'add') onPatch({ addAssigneeIds: ids }, `Added ${labelOf(ids)}`);
          else if (mode === 'remove') onPatch({ removeAssigneeIds: ids }, `Removed ${labelOf(ids)}`);
          else onPatch({ assigneeIds: ids }, `Assigned ${labelOf(ids)}`);
        }}
      />
    </span>
  );
}

function BulkBar({ count, people, selRows, sections, fields, onPatch, onTrash, onClear }: {
  fields: CustomField[]; count: number; people: Person[]; selRows: TaskRow[]; sections: Section[]; onPatch: (patch: BulkTaskPatch, label: string) => void; onTrash: () => void; onClear: () => void;
}) {
  const statusItems: MenuItem[] = TASK_STATUSES.map((s) => ({ id: s, label: TASK_STATUS_META[s].label, leading: <span className="pm-dot" style={{ background: TASK_STATUS_META[s].color }} />, onSelect: () => onPatch({ status: s }, 'Status updated') }));
  const prioItems: MenuItem[] = [...PRIORITIES].reverse().map((p) => ({ id: p, label: PRIORITY_META[p].label, leading: <Icon name="flag" size={14} style={{ color: PRIORITY_META[p].color }} />, onSelect: () => onPatch({ priority: p }, 'Priority updated') }));
  const secItems: MenuItem[] = [
    { id: '__none', label: 'No section', onSelect: () => onPatch({ sectionId: null }, 'Moved to No section') },
    ...sections.map((s) => ({ id: s.id, label: s.name, onSelect: () => onPatch({ sectionId: s.id }, `Moved to ${s.name}`) })),
  ];
  const trig = (icon: 'check' | 'flag' | 'user' | 'folder', label: string) => (t: TriggerProps, open: boolean) => (
    <button type="button" className={cx('lb-fbtn', open && 'is-open')} {...t}><Icon name={icon} size={13} /><span>{label}</span><Icon name="chevronDown" size={12} /></button>
  );
  return (
    <div className="lb-bulk" role="region" aria-label="Bulk actions">
      <span className="lb-bulk__count">{count} selected</span>
      <Menu items={statusItems} label="Set status" role="listbox" trigger={trig('check', 'Status')} />
      <Menu items={prioItems} label="Set priority" role="listbox" trigger={trig('flag', 'Priority')} />
      <BulkAssign people={people} selRows={selRows} onPatch={onPatch} trig={trig('user', 'Assignees')} />
      <span className="lb-bulk__date"><DatePicker size="sm" value={null} placeholder="Due date" ariaLabel="Set due date" onChange={(d) => onPatch({ dueOn: d }, d ? 'Due date set' : 'Due date cleared')} /></span>
      <Menu items={secItems} label="Move to section" role="listbox" trigger={trig('folder', 'Section')} />
      {fields.length > 0 && <BulkField fields={fields} count={count} onPatch={onPatch} />}
      <button type="button" className="lb-fbtn lb-fbtn--danger" onClick={onTrash}><Icon name="trash" size={13} /><span>Move to trash</span></button>
      <button type="button" className="lb-fbtn" onClick={onClear} aria-label="Clear selection"><Icon name="x" size={13} /><span>Clear</span></button>
    </div>
  );
}

/** "Field" in the bulk bar: pick a custom field, then a value (or clear it) for every selected task. */
function BulkField({ fields, count, onPatch }: { fields: CustomField[]; count: number; onPatch: (patch: BulkTaskPatch, label: string) => void }) {
  const [fieldId, setFieldId] = useState<string | null>(null);
  const [draft, setDraft] = useState<FieldValue | undefined>(undefined);
  const f = fields.find((x) => x.id === fieldId);
  const items: MenuItem[] = fields.map((x) => ({ id: x.id, label: x.name, leading: <FieldTypeIcon type={x.type} size={13} />, onSelect: () => { setFieldId(x.id); setDraft(undefined); } }));
  const apply = (v: FieldValue | null) => { if (f) { onPatch({ fields: { [f.id]: v } }, v === null ? `${f.name} cleared` : `${f.name} set`); setFieldId(null); } };
  return (
    <>
      <Menu items={items} label="Set a custom field" role="listbox" trigger={(t, open) => (
        <button type="button" className={cx('lb-fbtn', open && 'is-open')} {...t}><FieldTypeIcon type="text" size={13} /><span>Field</span><Icon name="chevronDown" size={12} /></button>
      )} />
      {f && (
        <div className="fv-bulkdlg" role="dialog" aria-label={`Set ${f.name}`}>
          <strong className="pm-truncate">{f.name} for {count} task{count === 1 ? '' : 's'}</strong>
          <FieldEditor field={f} value={draft} variant="row" onChange={(v) => { if (f.type === 'select' || f.type === 'checkbox' || f.type === 'date') apply(v); else setDraft(v ?? undefined); }} />
          <div className="fv-bulkdlg__foot">
            <Button size="sm" variant="primary" disabled={draft === undefined} onClick={() => draft !== undefined && apply(draft)}>Set</Button>
            <Button size="sm" onClick={() => apply(null)}>Clear value</Button>
            <Button size="sm" variant="ghost" onClick={() => setFieldId(null)}>Cancel</Button>
          </div>
        </div>
      )}
    </>
  );
}