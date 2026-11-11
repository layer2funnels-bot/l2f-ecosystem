import { useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, KeyboardEvent } from 'react';
import type { ProjectDetail, Section, TaskRow, TaskStatus } from '../../../../shared/api.ts';
import { TASK_STATUSES } from '../../../../shared/api.ts';
import { call } from '../../../api/client.ts';
import { invalidateWork, setQueryData, useQuery } from '../../../api/store.ts';
import { contextMenuProps, openMenuFrom } from '../../../ui/ContextMenu.tsx';
import type { CtxItem } from '../../../ui/ContextMenu.tsx';
import { askConfirm, askForm } from '../../../ui/Prompt.tsx';
import { toast } from '../../../ui/Toast.tsx';
import { taskMenuProps } from '../../../task/taskMenu.tsx';
import { useTasks } from '../../../lib/data.ts';
import { cx, fmtMinutes, PROJECT_COLORS, TASK_STATUS_META } from '../../../lib/util.ts';
import { openTask } from '../../../router.ts';
import { AssigneeStack } from '../../../ui/Badges.tsx';
import { Button } from '../../../ui/Button.tsx';
import { EmptyState, ErrorState, Skeleton } from '../../../ui/Feedback.tsx';
import { Icon } from '../../../ui/icons.tsx';
import { clearTaskOrder, publishTaskOrder } from '../../../task/panelNav.ts';
import { CardFieldsMenu } from '../../../fields/FieldFilters.tsx';
import { OptionPill } from '../../../fields/FieldEditors.tsx';
import type { CustomField } from '../../../../shared/api.ts';
import { PriorityFlag } from '../../../ui/Badges.tsx';
import {
  activeFilterCount, AddTaskInput, buildTree, DueText, endPosition, Indicators, positionBetween, sortTasks, TagChips, useTaskActions, useViewState, ViewToolbar, write,
} from './taskViewShared.tsx';
import type { CreateInit, MoveSpec } from './taskViewShared.tsx';
import { sanitizeState } from './taskViewShared.tsx';

interface Column {
  key: string;
  title: string;
  color: string;
  /** status or sectionId (null = "No section"). */
  value: string | null;
  section: Section | null;
  tasks: TaskRow[];
}
interface DropAt { key: string; beforeId: string | null }
interface ColDrop { id: string; after: boolean }

export function BoardView({ project }: { project: ProjectDetail }) {
  return <BoardViewInner key={project.id} project={project} />;
}

function BoardViewInner({ project }: { project: ProjectDetail }) {
  const pid = project.id;
  const canEdit = project.myRole !== 'viewer' && !project.deletedAt;
  const tasksQ = useTasks(pid, true);
  const tagsQ = useQuery('tags', () => call('tags.list', {}), []);
  const prefsQ = useQuery(`viewprefs:${pid}`, () => call('viewprefs.get', { projectId: pid }), []);
  const { state: rawState, update: setState, clear } = useViewState(pid, 'board', prefsQ.data);
  const state = useMemo(() => sanitizeState(rawState, project.fields, 'board'), [rawState, project.fields]);
  const cardFields = useMemo(() => project.fields.filter((f) => state.cardFields.includes(f.id)), [project.fields, state.cardFields]);
  const act = useTaskActions(project);
  const mode: 'status' | 'section' = state.groupBy === 'section' ? 'section' : 'status';

  const all = useMemo(() => tasksQ.data ?? [], [tasksQ.data]);
  const byId = useMemo(() => new Map(all.map((t) => [t.id, t])), [all]);
  const tree = useMemo(() => buildTree(all, state, project.fields), [all, state, project.fields]);
  const filtering = activeFilterCount(state) > 0;

  const columns = useMemo<Column[]>(() => {
    const top = tree.top;
    if (mode === 'status') {
      return TASK_STATUSES.filter((s) => !(s === 'done' && state.hideDone)).map((s) => ({
        key: `st:${s}`, title: TASK_STATUS_META[s].label, color: TASK_STATUS_META[s].color, value: s, section: null, tasks: sortTasks(top.filter((t) => t.status === s), 'manual'),
      }));
    }
    const secs = [...project.sections].sort((a, b) => a.position - b.position);
    const known = new Set(secs.map((s) => s.id));
    return [
      { key: 'sec:none', title: 'No section', color: 'var(--pm-border-strong)', value: null, section: null, tasks: sortTasks(top.filter((t) => !t.sectionId || !known.has(t.sectionId)), 'manual') },
      ...secs.map((s, i) => ({ key: `sec:${s.id}`, title: s.name, color: PROJECT_COLORS[(i * 3 + 1) % PROJECT_COLORS.length], value: s.id as string | null, section: s, tasks: sortTasks(top.filter((t) => t.sectionId === s.id), 'manual') })),
    ];
  }, [tree.top, mode, project.sections, state.hideDone]);

  // Tell the task drawer the order we are showing (column by column), so J / K there walks this board.
  const shownIds = useMemo(() => columns.flatMap((c) => c.tasks.map((t) => t.id)), [columns]);
  useEffect(() => { publishTaskOrder(pid, shownIds); }, [pid, shownIds]);
  useEffect(() => () => clearTaskOrder(pid), [pid]);

  const [addTokens, setAddTokens] = useState<Record<string, number>>({});
  const [firstAdd, setFirstAdd] = useState(false);
  const dragRef = useRef<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const dropRef = useRef<DropAt | null>(null);
  const [drop, setDropState] = useState<DropAt | null>(null);
  const setDrop = (d: DropAt | null) => {
    const c = dropRef.current;
    if (c?.key === d?.key && c?.beforeId === d?.beforeId) return;
    dropRef.current = d; setDropState(d);
  };
  const endDrag = () => { dragRef.current = null; setDragId(null); setDrop(null); };

  const initFor = (c: Column): CreateInit => (mode === 'status' ? { status: c.value as TaskStatus } : { sectionId: c.value });

  const performDrop = () => {
    const id = dragRef.current;
    const dp = dropRef.current;
    endDrag();
    const t = id ? byId.get(id) : undefined;
    const col = dp ? columns.find((c) => c.key === dp.key) : undefined;
    if (!t || !dp || !col) return;
    const sibs = col.tasks.filter((x) => x.id !== t.id);
    let idx = dp.beforeId ? sibs.findIndex((x) => x.id === dp.beforeId) : -1;
    if (idx < 0) idx = sibs.length;
    const spec: MoveSpec = { position: positionBetween(sibs[idx - 1], sibs[idx]) };
    if (mode === 'status' && t.status !== col.value) spec.status = col.value as TaskStatus;
    if (mode === 'section' && (t.sectionId ?? null) !== col.value) spec.sectionId = col.value;
    void act.move(t, spec);
  };

  // ------ sections (columns when grouped by section) ------
  const sortedSections = useMemo(() => [...project.sections].sort((a, b) => a.position - b.position), [project.sections]);
  const projectKey = `project:${pid}`;
  const [collapsedCols, setCollapsedCols] = useState<Set<string>>(new Set());
  const [renamingCol, setRenamingCol] = useState<string | null>(null);
  const [addingSection, setAddingSection] = useState(false);
  const colDragRef = useRef<string | null>(null);
  const colDropRef = useRef<ColDrop | null>(null);
  const [colDrop, setColDropState] = useState<ColDrop | null>(null);
  const [colDragId, setColDragId] = useState<string | null>(null);
  const setColDrop = (d: ColDrop | null) => {
    const c = colDropRef.current;
    if (c?.id === d?.id && c?.after === d?.after) return;
    colDropRef.current = d; setColDropState(d);
  };
  const endColDrag = () => { colDragRef.current = null; setColDragId(null); setColDrop(null); };

  const sectionWrite = (apply: (s: Section[]) => Section[], fn: () => Promise<unknown>) =>
    write(() => setQueryData<ProjectDetail>(projectKey, (old) => ({ ...old, sections: apply(old.sections) })), fn);
  const createSection = async (name: string): Promise<boolean> => {
    try { await call('sections.create', { projectId: pid, name }); invalidateWork(); return true; }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Could not add the section'); return false; }
  };
  const renameSection = (sec: Section, name: string) => {
    const n = name.trim();
    if (!n || n === sec.name) return;
    void sectionWrite((l) => l.map((x) => (x.id === sec.id ? { ...x, name: n } : x)), () => call('sections.update', { id: sec.id, name: n }));
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
    const r = await askForm({ title: after ? 'Add section to the right' : 'Add section to the left', fields: [{ name: 'name', label: 'Section name', required: true, maxLength: 80 }], confirmLabel: 'Add section' });
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
  const deleteSection = async (sec: Section) => {
    const n = all.filter((t) => t.sectionId === sec.id && !t.parentId).length;
    const ok = await askConfirm({
      title: 'Delete this section?', danger: true, confirmLabel: 'Delete section',
      message: <>“{sec.name}” will be removed. Its {n} task(s) are kept and move to “No section”.</>,
    });
    if (!ok) return;
    await write(
      () => {
        const undoSec = setQueryData<ProjectDetail>(projectKey, (old) => ({ ...old, sections: old.sections.filter((x) => x.id !== sec.id) }));
        const undoTasks = setQueryData<TaskRow[]>(`tasks:${pid}`, (old) => old.map((t) => (t.sectionId === sec.id ? { ...t, sectionId: null } : t)));
        return () => { undoSec(); undoTasks(); };
      },
      () => call('sections.delete', { id: sec.id }),
    );
  };
  const toggleCollapse = (key: string) => setCollapsedCols((c) => { const n = new Set(c); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  const columnMenu = (c: Column): CtxItem[] => {
    const sec = c.section;
    const idx = sec ? sortedSections.findIndex((x) => x.id === sec.id) : -1;
    const items: CtxItem[] = [];
    if (canEdit) items.push({ id: 'add', icon: 'plus', label: 'Add task', onSelect: () => { setCollapsedCols((s) => { const n = new Set(s); n.delete(c.key); return n; }); setAddTokens((a) => ({ ...a, [c.key]: (a[c.key] ?? 0) + 1 })); } });
    if (canEdit && sec) {
      items.push(
        { id: 'rename', icon: 'edit', label: 'Rename', onSelect: () => setRenamingCol(sec.id) },
        { id: 'left', icon: 'chevronLeft', label: 'Move left', separatorBefore: true, disabled: idx <= 0, disabledReason: 'Already the first section', onSelect: () => moveSection(sec, -1) },
        { id: 'right', icon: 'chevronRight', label: 'Move right', disabled: idx >= sortedSections.length - 1, disabledReason: 'Already the last section', onSelect: () => moveSection(sec, 1) },
        { id: 'addl', icon: 'plus', label: 'Add section to the left', onSelect: () => void addSectionAt(sec, false) },
        { id: 'addr', icon: 'plus', label: 'Add section to the right', onSelect: () => void addSectionAt(sec, true) },
      );
    }
    const collapsed = collapsedCols.has(c.key);
    items.push(
      { id: 'collapse', icon: collapsed ? 'chevronRight' : 'chevronLeft', label: collapsed ? 'Expand column' : 'Collapse column', separatorBefore: items.length > 0, onSelect: () => toggleCollapse(c.key) },
      { id: 'collapseall', icon: 'chevronLeft', label: 'Collapse all', onSelect: () => setCollapsedCols(new Set(columns.map((x) => x.key))) },
      { id: 'expandall', icon: 'chevronRight', label: 'Expand all', disabled: collapsedCols.size === 0, disabledReason: 'Nothing is collapsed', onSelect: () => setCollapsedCols(new Set()) },
    );
    if (mode === 'status' && c.value === 'done') items.push({ id: 'hidedone', icon: 'x', label: 'Hide done', onSelect: () => setState({ hideDone: true }) });
    if (canEdit && sec) items.push({ id: 'del', icon: 'trash', label: 'Delete section…', danger: true, separatorBefore: true, onSelect: () => void deleteSection(sec) });
    return items;
  };

  const performColDrop = () => {
    const id = colDragRef.current;
    const d = colDropRef.current;
    endColDrag();
    if (!id || !d || d.id === id) return;
    placeSection(id, (others) => others.findIndex((x) => x.id === d.id) + (d.after ? 1 : 0));
  };

  const toolbar = (
    <ViewToolbar
      state={state} onChange={setState} onClear={clear} members={project.members} tags={tagsQ.data ?? []}
      groupLabel="Columns" groupOptions={['status', 'section']} shown={tree.top.length} total={tree.total} fields={project.fields}
      rightExtra={<CardFieldsMenu value={state.cardFields} fields={project.fields} onChange={(cardFields) => setState({ cardFields })} />}
    />
  );

  if (tasksQ.loading && !tasksQ.data) {
    return (
      <div className="lb-view" aria-busy="true">
        {toolbar}
        <div className="lb-board" role="status" aria-label="Loading board">
          {Array.from({ length: 4 }, (_, i) => <div key={i} className="lb-col"><div className="lb-col__body" style={{ paddingTop: 14 }}>{Array.from({ length: 3 - (i % 2) }, (_, j) => <Skeleton key={j} height={78} radius={8} />)}</div></div>)}
        </div>
      </div>
    );
  }
  if (tasksQ.error && !tasksQ.data) {
    return <div className="lb-view"><ErrorState title="Couldn't load tasks" message={tasksQ.error.message} onRetry={() => void tasksQ.refetch()} /></div>;
  }

  const projectEmpty = tree.total === 0 && mode === 'status';
  const noResults = tree.total > 0 && tree.top.length === 0;

  return (
    <div className="lb-view">
      {toolbar}
      {projectEmpty ? (
        <EmptyState
          icon="board"
          title="No tasks yet"
          text={canEdit ? 'Add the first task and drag cards across the board as work moves along.' : 'Nothing has been added to this project yet.'}
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
        <div className="lb-board" role="list" aria-label={`Board of ${project.name}, columns by ${mode}`} onDragEnd={endDrag}>
          {columns.map((c) => {
            const est = c.tasks.reduce((n, t) => n + (t.estimateMinutes ?? 0), 0);
            const over = drop?.key === c.key;
            const isCollapsed = collapsedCols.has(c.key);
            const sec = c.section;
            const colLine = colDrop && sec && colDrop.id === sec.id ? (colDrop.after ? 'is-coldrop-after' : 'is-coldrop-before') : '';
            return (
              <section
                key={c.key}
                className={cx('lb-col', over && 'is-over', isCollapsed && 'is-collapsed', colLine, colDragId && sec?.id === colDragId && 'is-dragging')}
                role="listitem"
                aria-label={`${c.title}, ${c.tasks.length} tasks`}
                style={{ ['--col' as string]: c.color }}
                onDragOver={(e) => {
                  if (colDragRef.current) {
                    if (!sec || sec.id === colDragRef.current) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setColDrop({ id: sec.id, after: e.clientX > r.left + r.width / 2 });
                    return;
                  }
                  if (!dragRef.current) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setDrop({ key: c.key, beforeId: null });
                }}
                onDrop={(e) => { e.preventDefault(); if (colDragRef.current) performColDrop(); else performDrop(); }}
              >
                <header
                  className="lb-col__head"
                  {...contextMenuProps(() => columnMenu(c), { label: `${c.title} column actions` })}
                  draggable={canEdit && mode === 'section' && !!sec && renamingCol !== sec.id}
                  onDragStart={(e) => {
                    if (!sec) return;
                    colDragRef.current = sec.id;
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', c.title);
                    window.setTimeout(() => setColDragId(sec.id), 0);
                  }}
                  onDragEnd={endColDrag}
                >
                  {isCollapsed ? (
                    <button type="button" className="lb-col__expand" aria-label={`Expand ${c.title}`} title={`Expand ${c.title}`} onClick={() => toggleCollapse(c.key)}>
                      <Icon name="chevronRight" size={14} /><span className="lb-col__vtitle">{c.title}</span><span className="lb-col__count">{c.tasks.length}</span>
                    </button>
                  ) : (
                    <>
                      {renamingCol && sec && renamingCol === sec.id ? (
                        <ColInput
                          initial={sec.name} label="Section name"
                          onDone={(v) => { setRenamingCol(null); if (v !== null) renameSection(sec, v); }}
                        />
                      ) : (
                        <h3
                          className="lb-col__title pm-truncate" title={sec && canEdit ? `${c.title} (double-click to rename)` : c.title}
                          onDoubleClick={() => { if (canEdit && sec) setRenamingCol(sec.id); }}
                        >{c.title}</h3>
                      )}
                      <span className="lb-col__count">{c.tasks.length}</span>
                      {est > 0 && <span className="lb-col__est" title="Estimated time in this column"><Icon name="clock" size={12} />{fmtMinutes(est)}</span>}
                      <span className="lb-col__tools" style={{ marginLeft: 'auto' }}>
                        {canEdit && (
                          <button
                            type="button" className="lb-iconbtn" aria-label={`Add task to ${c.title}`} title="Add task"
                            onClick={() => setAddTokens((a) => ({ ...a, [c.key]: (a[c.key] ?? 0) + 1 }))}
                          ><Icon name="plus" size={14} /></button>
                        )}
                        <button type="button" className="lb-iconbtn" aria-haspopup="menu" aria-label={`${c.title} column actions`} title="Column actions" onClick={(e) => openMenuFrom(e.currentTarget)}><Icon name="more" size={14} /></button>
                      </span>
                    </>
                  )}
                </header>
                <div className="lb-col__body">
                  {c.tasks.length === 0 && !(over && dragId) && <div className="lb-col__empty">{canEdit ? 'No tasks. Drop one here or add below.' : 'No tasks'}</div>}
                  {c.tasks.map((t, i) => (
                    <Card
                      key={t.id}
                      task={t}
                      cardFields={cardFields}
                      canEdit={canEdit}
                      ctx={taskMenuProps(t, { project })}
                      dragging={dragId === t.id}
                      dropLine={over && drop?.beforeId === t.id && dragId !== t.id}
                      onDragStart={(e) => {
                        dragRef.current = t.id;
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', t.title);
                        window.setTimeout(() => setDragId(t.id), 0);
                      }}
                      onDragOver={(e) => {
                        if (!dragRef.current) return;
                        e.preventDefault(); e.stopPropagation();
                        e.dataTransfer.dropEffect = 'move';
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        setDrop({ key: c.key, beforeId: e.clientY < r.top + r.height / 2 ? t.id : c.tasks[i + 1]?.id ?? null });
                      }}
                    />
                  ))}
                  {over && drop?.beforeId === null && dragId && <div className="lb-dropline" aria-hidden="true" />}
                </div>
                {canEdit && (
                  <div className="lb-col__foot">
                    <AddTaskInput
                      variant="card" placeholder="Add task…" openToken={addTokens[c.key]}
                      onCreate={async (title) => { await act.create(title, { ...initFor(c), position: endPosition(c.tasks) }); }}
                    />
                  </div>
                )}
              </section>
            );
          })}
          {mode === 'section' && canEdit && (
            <section className="lb-col lb-col--add" role="listitem" aria-label="Add section">
              {addingSection ? (
                <ColInput
                  initial="" label="Section name" placeholder="Section name" keepOpen
                  onDone={(v) => { if (v) void createSection(v.trim()); else setAddingSection(false); }}
                />
              ) : (
                <button type="button" className="lb-addbtn lb-col__addsec" onClick={() => setAddingSection(true)}><Icon name="plus" size={14} /><span>Add section</span></button>
              )}
            </section>
          )}
          {mode === 'status' && canEdit && (
            <button type="button" className="lb-hintchip" onClick={() => setState({ groupBy: 'section' })} title="Switch the columns to sections, then add your own">
              <Icon name="folderPlus" size={13} /><span>Group by section to add sections</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Inline name box for a column: Enter saves, Escape cancels. With keepOpen it stays open for the next name. */
function ColInput({ initial, label, placeholder, keepOpen, onDone }: { initial: string; label: string; placeholder?: string; keepOpen?: boolean; onDone: (v: string | null) => void }) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const finish = (val: string | null) => { if (done.current) return; done.current = true; onDone(val); };
  return (
    <input
      ref={ref}
      className="lb-secinput lb-colinput"
      value={v}
      maxLength={80}
      placeholder={placeholder}
      aria-label={label}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => finish(v.trim() ? v : null)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); if (!v.trim()) { finish(null); return; } if (keepOpen) { onDone(v); setV(''); } else finish(v); }
        else if (e.key === 'Escape') { e.preventDefault(); finish(null); }
      }}
    />
  );
}

function Card({ task: t, cardFields, canEdit, ctx, dragging, dropLine, onDragStart, onDragOver }: {
  task: TaskRow;
  cardFields: CustomField[];
  canEdit: boolean;
  ctx: ReturnType<typeof contextMenuProps>;
  dragging: boolean;
  dropLine: boolean;
  onDragStart: (e: DragEvent) => void;
  onDragOver: (e: DragEvent) => void;
}) {
  const done = t.status === 'done';
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTask(t.id); }
  };
  const showMeta = t.priority !== 'none' || t.dueOn || t.assignees.length > 0 || t.counts.subtasks || t.counts.checklist || t.counts.files || t.counts.links || t.counts.comments || t.counts.waitingOn || t.repeatRule;
  return (
    <>
      {dropLine && <div className="lb-dropline" aria-hidden="true" />}
      <div
        className={cx('lb-card', done && 'is-done', dragging && 'is-dragging')}
        {...ctx}
        role="button"
        tabIndex={0}
        draggable={canEdit}
        aria-label={`${t.title}. Open task`}
        onClick={() => openTask(t.id)}
        onKeyDown={(e) => { ctx.onKeyDown(e); if (!e.defaultPrevented) onKey(e); }}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
      >
        <div className="lb-card__top">
          <h4 className="lb-card__title" title={t.title}>{t.title}</h4>
          <span onClick={(e) => e.stopPropagation()}>
            <button type="button" className="lb-iconbtn lb-card__menu" aria-haspopup="menu" aria-label={`Actions for “${t.title}”`} title={`Actions for “${t.title}”`} onClick={(e) => openMenuFrom(e.currentTarget)}><Icon name="more" size={14} /></button>
          </span>
        </div>
        <TagChips tags={t.tags} max={3} />
        {cardFields.length > 0 && (
          <div className="fv-cardchips">
            {cardFields.map((f) => {
              const v = t.fields[f.id];
              const ids = Array.isArray(v) ? v : typeof v === 'string' ? [v] : [];
              const os = ids.map((id) => f.options.find((o) => o.id === id)).filter((o) => !!o);
              if (!os.length) return null;
              return <span key={f.id} className="fv-cardchip" title={`${f.name}: ${os.map((o) => o!.label).join(', ')}`}><OptionPill option={os[0]!} />{os.length > 1 && <span className="fv-more">+{os.length - 1}</span>}</span>;
            })}
          </div>
        )}
        {showMeta && (
          <div className="lb-card__meta">
            {t.priority !== 'none' && <PriorityFlag priority={t.priority} showLabel={false} />}
            <DueText t={t} />
            <Indicators t={t} />
            {t.assignees.length > 0 && <span className="lb-card__who"><AssigneeStack people={t.assignees} max={3} size={22} /></span>}
          </div>
        )}
      </div>
    </>
  );
}
