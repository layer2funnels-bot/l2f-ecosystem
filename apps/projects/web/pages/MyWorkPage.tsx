import { taskMenuProps } from '../task/taskMenu.tsx';
import { useCallback, useMemo, useState } from 'react';
import type { Priority, TaskRow, TaskStatus } from '../../shared/api.ts';
import { PRIORITIES } from '../../shared/api.ts';
import { call } from '../api/client.ts';
import { invalidateWork, setQueryData } from '../api/store.ts';
import { useMyWork, useProjects } from '../lib/data.ts';
import { daysLate } from '../lib/oversight.tsx';
import { useSession } from '../lib/session.tsx';
import { addDays, cx, fmtDate, lsGet, lsSet, PRIORITY_META, startOfWeek, todayYmd } from '../lib/util.ts';
import { links, navigate, openTask, useRoute } from '../router.ts';
import { getMe } from '../lib/me.ts';
import { AssigneeStack, PriorityFlag, StatusMenu } from '../ui/Badges.tsx';
import { EmptyState, ErrorState, PageHeader, SkeletonRows } from '../ui/Feedback.tsx';
import { Toggle } from '../ui/Form.tsx';
import { Icon } from '../ui/icons.tsx';
import { Select } from '../ui/Menu.tsx';
import type { SelectOption } from '../ui/Menu.tsx';
import { toast } from '../ui/Toast.tsx';
import { MyWorkBoard } from './MyWorkBoard.tsx';
import type { BoardColId } from './MyWorkBoard.tsx';

type DueFocus = 'overdue' | 'week' | 'done';
const FOCUS_LABEL: Record<DueFocus, string> = { overdue: 'Overdue tasks', week: 'Due this week', done: 'Completed today' };
const VIEW_KEY = 'pm.mywork.view';
type GroupId = 'overdue' | 'today' | 'week' | 'later' | 'none' | 'done';
const GROUP_LABEL: Record<GroupId, string> = { overdue: 'Overdue', today: 'Today', week: 'This week', later: 'Later', none: 'No date', done: 'Completed today' };

const byDue = (a: TaskRow, b: TaskRow) => (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999') || a.number - b.number;

export function MyWorkPage() {
  const { org } = useSession();
  const today = todayYmd();
  // Local midnight, so "completed today" follows the person's own day; the server returns done tasks since then. Shared with Home.
  const q = useMyWork();
  const projectsQ = useProjects('active');
  const roles = useMemo(() => new Map((projectsQ.data ?? []).map((p) => [p.id, p.myRole])), [projectsQ.data]);
  const route = useRoute();
  const dueParam = route.params.get('due');
  const focus: DueFocus | null = dueParam === 'overdue' || dueParam === 'week' || dueParam === 'done' ? dueParam : null;
  const [view, setViewState] = useState<'list' | 'board'>(() => (lsGet(VIEW_KEY) === 'board' ? 'board' : 'list'));
  const setView = (v: 'list' | 'board') => { setViewState(v); lsSet(VIEW_KEY, v); if (focus && v === 'board') navigate(links.myWork); };
  const effView = focus ? 'list' : view;

  const [projectId, setProjectId] = useState('');
  const [priority, setPriority] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [collapsed, setCollapsed] = useState<Partial<Record<GroupId, boolean>>>({});

  const all = q.data ?? [];
  const tasks = useMemo(() => all.filter((t) => t.status !== 'done'), [all]);
  const doneList = useMemo(() => all.filter((t) => t.status === 'done'), [all]);

  const setStatus = useCallback(async (t: TaskRow, status: TaskStatus, undoTo?: TaskStatus) => {
    const rollback = setQueryData<TaskRow[]>('mywork:done', (old) => old.map((x) => (x.id === t.id
      ? { ...x, status, completedAt: status === 'done' ? new Date().toISOString() : null } : x)));
    try {
      await call('tasks.update', { id: t.id, patch: { status } });
      invalidateWork();
      if (undoTo) toast.success(`Completed “${t.title}”`, { action: { label: 'Undo', onClick: () => void setStatus({ ...t, status }, undoTo) } });
    } catch (e) {
      rollback();
      toast.error(e instanceof Error ? e.message : 'Could not update the task');
    }
  }, []);
  const complete = useCallback((t: TaskRow) => setStatus(t, 'done', t.status), [setStatus]);
  const reopen = useCallback((t: TaskRow) => setStatus(t, 'todo'), [setStatus]);

  const changeStatus = useCallback(async (t: TaskRow, status: TaskStatus) => {
    if (status === 'done') { await complete(t); return; }
    const rollback = setQueryData<TaskRow[]>('mywork:done', (old) => old.map((x) => (x.id === t.id ? { ...x, status } : x)));
    try {
      await call('tasks.update', { id: t.id, patch: { status } });
      invalidateWork();
    } catch (e) {
      rollback();
      toast.error(e instanceof Error ? e.message : 'Could not change the status');
    }
  }, [complete]);

  const projectOptions = useMemo<SelectOption<string>[]>(() => {
    const seen = new Map<string, string>();
    for (const t of all) seen.set(t.projectId, t.projectName);
    return [{ value: '', label: 'All projects' }, ...[...seen.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label }))];
  }, [all]);
  const priorityOptions = useMemo<SelectOption<string>[]>(() => [
    { value: '', label: 'Any priority' },
    ...[...PRIORITIES].reverse().map((p) => ({ value: p, label: PRIORITY_META[p].label })),
  ], []);

  const match = useCallback((t: TaskRow) => (!projectId || t.projectId === projectId) && (!priority || t.priority === (priority as Priority)), [projectId, priority]);

  const weekEnd = addDays(startOfWeek(today), 6);
  // All five date buckets (also the empty ones): the Board always shows every column.
  const buckets = useMemo(() => {
    const g: Record<BoardColId, TaskRow[]> = { overdue: [], today: [], week: [], later: [], none: [] };
    for (const t of tasks) {
      if (!match(t)) continue;
      if (!t.dueOn) g.none.push(t);
      else if (t.dueOn < today) g.overdue.push(t);
      else if (t.dueOn === today) g.today.push(t);
      else if (t.dueOn <= weekEnd) g.week.push(t);
      else g.later.push(t);
    }
    for (const k of Object.keys(g) as BoardColId[]) g[k].sort(byDue);
    return g;
  }, [tasks, today, weekEnd, match]);

  const showDoneNow = showDone || focus === 'done';
  const groups = useMemo(() => {
    const all: { id: GroupId; tasks: TaskRow[] }[] = [
      ...(['overdue', 'today', 'week', 'later', 'none'] as BoardColId[]).map((id) => ({ id: id as GroupId, tasks: buckets[id] })),
      { id: 'done', tasks: showDoneNow ? doneList.filter(match) : [] },
    ];
    const wanted: GroupId[] | null = focus === 'overdue' ? ['overdue'] : focus === 'week' ? ['today', 'week'] : focus === 'done' ? ['done'] : null;
    return all.filter((x) => x.tasks.length > 0 && (!wanted || wanted.includes(x.id)));
  }, [buckets, showDoneNow, doneList, match, focus]);

  /** Board drop / "Move to": the due date each column stands for. */
  const dateFor = useCallback((to: BoardColId): string | null => {
    if (to === 'today') return today;
    if (to === 'week') { const friday = addDays(startOfWeek(today), 4); return today > friday ? today : friday; }
    if (to === 'later') return addDays(today, 14);
    return null;
  }, [today]);
  const moveToColumn = useCallback(async (t: TaskRow, to: BoardColId) => {
    if (to === 'overdue') return;
    const dueOn = dateFor(to);
    if (dueOn === t.dueOn) return;
    const rollback = setQueryData<TaskRow[]>('mywork:done', (old) => old.map((x) => (x.id === t.id ? { ...x, dueOn } : x)));
    try {
      await call('tasks.update', { id: t.id, patch: { dueOn } });
      invalidateWork();
      toast.success(dueOn ? `“${t.title}” is now due ${dueOn === today ? 'today' : fmtDate(dueOn)}` : `Removed the due date from “${t.title}”`);
    } catch (e) {
      rollback();
      toast.error(e instanceof Error ? e.message : 'Could not change the due date');
    }
  }, [dateFor, today]);
  const filtering = !!projectId || !!priority || !!focus;

  return (
    <div className="pm-page">
      <PageHeader title="My Work" subtitle={`Open tasks assigned to you in ${org.name}${q.data ? ` · ${tasks.length} open` : ''}. Other organizations keep their own list.`} />

      <div className="pm-toolbar" role="group" aria-label="Filter my tasks">
        <div className="pm-seg pm-mw-views" role="group" aria-label="View">
          <button type="button" className={cx('pm-seg__btn', effView === 'list' && 'is-selected')} aria-pressed={effView === 'list'} title="List view" onClick={() => setView('list')}><Icon name="list" size={14} /><span>List</span></button>
          <button type="button" className={cx('pm-seg__btn', effView === 'board' && 'is-selected')} aria-pressed={effView === 'board'} title="Board view: drag cards between due-date columns" onClick={() => setView('board')}><Icon name="board" size={14} /><span>Board</span></button>
        </div>
        <Select ariaLabel="Filter by project" size="sm" value={projectId} options={projectOptions} onChange={setProjectId} matchWidth={false} className="pm-ov-select" />
        <Select ariaLabel="Filter by priority" size="sm" value={priority} options={priorityOptions} onChange={setPriority} matchWidth={false} className="pm-ov-select" />
        <span className="pm-ov-switch">
          <Toggle checked={showDone} onChange={setShowDone} label="Show completed today" />
          <span aria-hidden="true">Show completed today{doneList.length > 0 ? ` (${doneList.length})` : ''}</span>
        </span>
        {focus && <span className="pm-ov-focus" role="status">Showing: {FOCUS_LABEL[focus]}<button type="button" aria-label="Show all my tasks" title="Show all my tasks" onClick={() => navigate(links.myWork)}><Icon name="x" size={12} /></button></span>}
        {(projectId || priority) && <button type="button" className="pm-ov-link" onClick={() => { setProjectId(''); setPriority(''); }}>Clear filters</button>}
      </div>

      {q.loading && !q.data && <SkeletonRows rows={6} height={44} />}
      {q.error && !q.data && <ErrorState title="Couldn't load your tasks" message={q.error.message} onRetry={() => void q.refetch()} />}

      {q.data && effView === 'board' && (
        <MyWorkBoard
          buckets={buckets}
          roles={roles}
          onMove={(t, to) => void moveToColumn(t, to)}
          onComplete={(t) => void complete(t)}
        />
      )}

      {q.data && effView === 'list' && groups.length === 0 && (
        filtering
          ? <EmptyState icon="filter" title="No tasks match these filters" text="Try another project or priority." />
          : <EmptyState icon="checkCircle" title="You're all caught up" text={tasks.length === 0 ? `Nothing is assigned to you in ${org.name} right now. Enjoy the quiet.` : undefined} />
      )}

      {effView === 'list' && groups.map((g) => {
        const open = !collapsed[g.id];
        const panelId = `mw-${g.id}`;
        return (
          <section key={g.id} className={cx('pm-mw-group', g.id === 'overdue' && 'is-overdue')} aria-label={GROUP_LABEL[g.id]}>
            <h2 className="pm-mw-group__head">
              <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setCollapsed((c) => ({ ...c, [g.id]: open }))}>
                <Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} />
                <span>{GROUP_LABEL[g.id]}</span>
                <span className="pm-mw-count pm-num">{g.tasks.length}</span>
              </button>
            </h2>
            {open && (
              <ul id={panelId} className="pm-mw-list">
                {g.tasks.map((t) => (
                  <MyTaskRow
                    key={t.id}
                    t={t}
                    done={t.status === 'done'}
                    onToggle={() => void (t.status === 'done' ? reopen(t) : complete(t))}
                    onStatus={(s) => void changeStatus(t, s)}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function MyTaskRow({ t, done, onToggle, onStatus }: { t: TaskRow; done: boolean; onToggle: () => void; onStatus: (s: TaskStatus) => void }) {
  const today = todayYmd();
  const late = !done && !!t.dueOn && t.dueOn < today;
  const lateText = daysLate(t.dueOn, done);
  return (
    <li className={cx('pm-mw-row', done && 'is-done')} {...taskMenuProps(t)}>
      <button type="button" role="checkbox" aria-checked={done} aria-label={done ? `Reopen “${t.title}”` : `Mark “${t.title}” complete`} className={cx('pm-circle', done && 'is-done')} onClick={onToggle}>
        {done && <Icon name="check" size={12} strokeWidth={2.4} />}
      </button>
      <button type="button" className="pm-mw-row__title" onClick={() => openTask(t.id)} title={t.title}>
        <span className="pm-truncate">{t.title}</span>
        {t.assignees.length > 1 && <span className="pm-mw-row__team" title={`Shared with ${t.assignees.filter((a) => a.id !== getMe()?.id).map((a) => a.name).join(', ')}`}><AssigneeStack people={t.assignees} max={3} size={20} empty={false} /></span>}
      </button>
      <a className="pm-mw-row__proj pm-truncate" href={links.project(t.projectId)} title={`Open project ${t.projectName}`}>
        <span className="pm-dot" style={{ background: t.projectColor }} aria-hidden="true" />
        <span className="pm-truncate">{t.projectName}</span>
      </a>
      <span className={cx('pm-mw-row__due pm-num', late && 'is-late')}>
        {t.dueOn ? (t.dueOn === today ? 'Today' : fmtDate(t.dueOn)) : <span className="pm-faint">No date</span>}
        {lateText && <span className="pm-mw-row__late">{lateText}</span>}
      </span>
      <span className="pm-mw-row__prio">{t.priority === 'none' ? <span className="pm-faint" aria-label="No priority">—</span> : <PriorityFlag priority={t.priority} />}</span>
      <span className="pm-mw-row__status"><StatusMenu value={t.status} onChange={onStatus} compact disabled={done} /></span>
    </li>
  );
}
