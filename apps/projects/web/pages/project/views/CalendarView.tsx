import { taskMenuProps } from '../../../task/taskMenu.tsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, DragEvent, KeyboardEvent } from 'react';
import type { ProjectDetail, TaskRow } from '../../../../shared/api.ts';
import { useTasks } from '../../../lib/data.ts';
import { useMedia, useStoredBool } from '../../../lib/hooks.ts';
import { cx, lsGet, lsSet, TASK_STATUS_META, todayYmd } from '../../../lib/util.ts';
import { openTask } from '../../../router.ts';
import { AssigneeStack } from '../../../ui/Badges.tsx';
import { Button, IconButton } from '../../../ui/Button.tsx';
import { EmptyState, ErrorState, Skeleton } from '../../../ui/Feedback.tsx';
import { Icon } from '../../../ui/icons.tsx';
import { Popover } from '../../../ui/Overlay.tsx';
import {
  addMonths, canEditProject, compareForDay, daysInMonth, diffDays, fmtAgenda, fmtLong, fmtMonthYear, fmtShort, fmtShortYear,
  monthEnd, monthStart, shiftDays, useTaskCreator, useTaskScheduler, weekdayIdx, weekStart, isWeekend, dayOfMonth,
} from './dateViewShared.ts';

type Mode = 'month' | 'week';
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_CHIPS = 3;
const WEEK_CHIPS = 12;

export function CalendarView({ project }: { project: ProjectDetail }) {
  const q = useTasks(project.id);
  if (q.loading && !q.data) {
    return (
      <div className="pm-cv" role="status" aria-label="Loading calendar">
        <Skeleton width={260} height={32} />
        <div style={{ height: 12 }} />
        <Skeleton height={420} radius={12} />
      </div>
    );
  }
  if (q.error && !q.data) {
    return <ErrorState title="Couldn't load tasks" message={q.error.message} onRetry={() => void q.refetch()} />;
  }
  return <CalendarBody project={project} tasks={q.data ?? []} />;
}

function CalendarBody({ project, tasks }: { project: ProjectDetail; tasks: TaskRow[] }) {
  const canEdit = canEditProject(project);
  const mobile = useMedia('(max-width: 767px)');
  const today = todayYmd();
  const [anchor, setAnchor] = useState(today);
  const [mode, setModeState] = useState<Mode>(() => (lsGet('pm.cal.mode') === 'week' ? 'week' : 'month'));
  const [tray, setTray] = useStoredBool('pm.cal.tray', true);
  const [adding, setAdding] = useState<string | null>(null);
  const [pending, setPending] = useState<{ id: string; day: string; title: string }[]>([]);
  const [pop, setPop] = useState<{ day: string; anchor: HTMLElement } | null>(null);
  const [overDay, setOverDay] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const dragRef = useRef<TaskRow | null>(null);
  const scheduler = useTaskScheduler(project.id);
  const creator = useTaskCreator(project.id);

  const setMode = (m: Mode) => { setModeState(m); lsSet('pm.cal.mode', m); setPop(null); setAdding(null); };
  const effMode: Mode = mobile ? 'month' : mode;

  const byDay = useMemo(() => {
    const map = new Map<string, TaskRow[]>();
    for (const t of tasks) {
      if (!t.dueOn) continue;
      const list = map.get(t.dueOn);
      if (list) list.push(t); else map.set(t.dueOn, [t]);
    }
    for (const list of map.values()) list.sort(compareForDay);
    return map;
  }, [tasks]);
  const unscheduled = useMemo(
    () => tasks.filter((t) => !t.dueOn && t.status !== 'done').sort((a, b) => a.position - b.position || a.number - b.number),
    [tasks],
  );

  // ---- navigation
  const step = (dir: -1 | 1) => {
    setPop(null); setAdding(null);
    setAnchor((a) => (effMode === 'month' ? addMonths(a, dir) : shiftDays(a, dir * 7)));
  };
  const goToday = () => { setPop(null); setAdding(null); setAnchor(todayYmd()); };

  const gridStart = effMode === 'month' ? weekStart(monthStart(anchor)) : weekStart(anchor);
  const rowCount = effMode === 'month' ? Math.ceil((weekdayIdx(monthStart(anchor)) + daysInMonth(anchor)) / 7) : 1;
  const days = Array.from({ length: rowCount * 7 }, (_, i) => shiftDays(gridStart, i));
  const curMonth = anchor.slice(0, 7);
  const title = effMode === 'month' ? fmtMonthYear(anchor) : `${fmtShort(gridStart)} – ${fmtShortYear(shiftDays(gridStart, 6))}`;

  // ---- writes
  const moveTo = (task: TaskRow, day: string) => {
    if (!canEdit || task.dueOn === day) return;
    const patch: { dueOn: string; startOn?: string | null } = { dueOn: day };
    if (task.dueOn) {
      if (task.startOn) patch.startOn = shiftDays(task.startOn, diffDays(task.dueOn, day)); // keep the duration
    } else if (task.startOn && task.startOn > day) {
      patch.startOn = day; // never leave a start after the new due date
    }
    void scheduler.mutate({ task, patch });
  };
  const addTask = (day: string, title: string) => {
    const id = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setPending((p) => [...p, { id, day, title }]);
    void creator.mutate({ title, dueOn: day }).finally(() => setPending((p) => p.filter((x) => x.id !== id)));
  };

  const endDrag = () => { dragRef.current = null; setDragId(null); setOverDay(null); };
  const onChipDragStart = (t: TaskRow, e: DragEvent) => {
    dragRef.current = t;
    e.dataTransfer.setData('text/plain', t.id);
    e.dataTransfer.effectAllowed = 'move';
    setDragId(t.id);
    setPop(null);
  };
  const onDayDragOver = (day: string, e: DragEvent) => {
    if (!dragRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (overDay !== day) setOverDay(day);
  };
  const onDayDrop = (day: string, e: DragEvent) => {
    e.preventDefault();
    const t = dragRef.current;
    endDrag();
    if (t) moveTo(t, day);
  };

  const chip = (t: TaskRow, draggable = canEdit && !mobile) => (
    <TaskChip key={t.id} task={t} draggable={draggable} dragging={dragId === t.id} onDragStart={onChipDragStart} onDragEnd={endDrag} />
  );

  // ---- desktop cell
  const renderDay = (day: string) => {
    const list = byDay.get(day) ?? [];
    const pend = pending.filter((p) => p.day === day);
    const limit = effMode === 'month' ? MONTH_CHIPS : WEEK_CHIPS;
    const shown = list.length > limit ? list.slice(0, limit) : list;
    const hidden = list.length - shown.length;
    const isToday = day === today;
    const out = effMode === 'month' && day.slice(0, 7) !== curMonth;
    return (
      <div
        key={day}
        role="group"
        aria-label={`${fmtLong(day)}${list.length ? `, ${list.length} ${list.length === 1 ? 'task' : 'tasks'}` : ''}`}
        className={cx('pm-cv-day', out && 'is-out', isWeekend(day) && 'is-weekend', isToday && 'is-today', overDay === day && 'is-over')}
        onDragOver={(e) => onDayDragOver(day, e)}
        onDrop={(e) => onDayDrop(day, e)}
        onClick={(e) => {
          if (!canEdit || (e.target as HTMLElement).closest('.pm-cv-chip, button, input')) return;
          setAdding(day);
        }}
      >
        <div className="pm-cv-day__head">
          <span className={cx('pm-cv-day__num', isToday && 'is-today')}>
            {effMode === 'month' && dayOfMonth(day) === 1 ? fmtShort(day) : dayOfMonth(day)}
          </span>
          {effMode === 'week' && <span className="pm-cv-day__wd">{WEEKDAYS[weekdayIdx(day)]}</span>}
          {canEdit && (
            <button type="button" className="pm-cv-day__add" aria-label={`Add task on ${fmtLong(day)}`} title={`Add task on ${fmtLong(day)}`} onClick={(e) => { e.stopPropagation(); setAdding(day); }}>
              <Icon name="plus" size={14} />
            </button>
          )}
        </div>
        <div className="pm-cv-day__body">
          {shown.map((t) => chip(t))}
          {pend.map((p) => <div key={p.id} className="pm-cv-chip is-pending" style={{ '--st': 'var(--pm-st-todo)' } as CSSProperties}><span className="pm-cv-chip__t">{p.title}</span></div>)}
          {hidden > 0 && (
            <button type="button" className="pm-cv-more" onClick={(e) => { e.stopPropagation(); setPop({ day, anchor: e.currentTarget }); }}>
              +{hidden} more
            </button>
          )}
          {adding === day && <QuickAdd onSubmit={(t) => addTask(day, t)} onClose={() => setAdding(null)} />}
        </div>
      </div>
    );
  };

  // ---- mobile agenda
  const agendaDays = useMemo(() => {
    if (!mobile) return [];
    const from = monthStart(anchor), to = monthEnd(anchor);
    const set = new Set<string>();
    for (const d of byDay.keys()) if (d >= from && d <= to) set.add(d);
    if (adding && adding >= from && adding <= to) set.add(adding);
    return [...set].sort();
  }, [mobile, anchor, byDay, adding]);

  const addTodayInMonth = today.slice(0, 7) === curMonth ? today : monthStart(anchor);

  const trayOpen = tray;
  const trayEl = (
    <aside className="pm-cv-tray" aria-label="Unscheduled tasks">
      <div className="pm-cv-tray__head">
        <h3>Unscheduled</h3>
        <span className="pm-cv-count">{unscheduled.length}</span>
      </div>
      {canEdit && !mobile && unscheduled.length > 0 && <p className="pm-cv-tray__hint">Drag a task onto a day to give it a due date.</p>}
      <div className="pm-cv-tray__list">
        {unscheduled.map((t) => chip(t, canEdit && !mobile))}
        {unscheduled.length === 0 && <p className="pm-cv-tray__empty">Every open task has a due date.</p>}
      </div>
    </aside>
  );

  const popTasks = pop ? byDay.get(pop.day) ?? [] : [];

  return (
    <div className="pm-cv" data-project-id={project.id}>
      <div className="pm-dv-bar">
        <h2 className="pm-dv-title" aria-live="polite">{title}</h2>
        <div className="pm-dv-nav">
          <IconButton icon="chevronLeft" label={effMode === 'month' ? 'Previous month' : 'Previous week'} onClick={() => step(-1)} />
          <Button size="sm" onClick={goToday}>Today</Button>
          <IconButton icon="chevronRight" label={effMode === 'month' ? 'Next month' : 'Next week'} onClick={() => step(1)} />
        </div>
        <div className="pm-dv-spacer" />
        {!mobile && (
          <div className="pm-dv-seg" role="group" aria-label="Calendar range">
            <button type="button" aria-pressed={mode === 'month'} onClick={() => setMode('month')}>Month</button>
            <button type="button" aria-pressed={mode === 'week'} onClick={() => setMode('week')}>Week</button>
          </div>
        )}
        {mobile && canEdit && <Button size="sm" icon="plus" onClick={() => setAdding(addTodayInMonth)}>Add task</Button>}
        <Button size="sm" variant={tray ? 'secondary' : 'ghost'} aria-pressed={tray} icon="list" onClick={() => setTray(!tray)}>
          Unscheduled{unscheduled.length ? ` (${unscheduled.length})` : ''}
        </Button>
      </div>

      <div className={cx('pm-cv-main', trayOpen && !mobile && 'has-tray')}>
        {mobile ? (
          <div className="pm-cv-agenda">
            {agendaDays.length === 0 && <EmptyState icon="calendar" compact title={`Nothing due in ${fmtMonthYear(anchor)}`} text="Tasks with a due date in this month show up here." />}
            {agendaDays.map((day) => {
              const list = byDay.get(day) ?? [];
              return (
                <section key={day} className="pm-cv-ag">
                  <header className={cx('pm-cv-ag__head', day === today && 'is-today')}>
                    <h3>{fmtAgenda(day)}</h3>
                    {day === today && <span className="pm-cv-ag__today">Today</span>}
                    {canEdit && <button type="button" className="pm-cv-ag__add" aria-label={`Add task on ${fmtLong(day)}`} title={`Add task on ${fmtLong(day)}`} onClick={() => setAdding(day)}><Icon name="plus" size={14} /></button>}
                  </header>
                  <div className="pm-cv-ag__list">
                    {list.map((t) => chip(t, false))}
                    {pending.filter((p) => p.day === day).map((p) => <div key={p.id} className="pm-cv-chip is-pending" style={{ '--st': 'var(--pm-st-todo)' } as CSSProperties}><span className="pm-cv-chip__t">{p.title}</span></div>)}
                    {adding === day && <QuickAdd onSubmit={(t) => addTask(day, t)} onClose={() => setAdding(null)} />}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className={cx('pm-cv-grid', effMode === 'week' && 'is-week')} role="group" aria-label={`Calendar, ${title}`}>
            <div className="pm-cv-wdrow" aria-hidden="true">{WEEKDAYS.map((d) => <span key={d}>{d}</span>)}</div>
            <div className="pm-cv-cells" style={{ gridTemplateRows: `repeat(${rowCount}, minmax(${effMode === 'month' ? 124 : 360}px, 1fr))` }}>
              {days.map(renderDay)}
            </div>
          </div>
        )}
        {trayOpen && trayEl}
      </div>

      <Popover anchor={pop?.anchor ?? null} open={!!pop} onClose={() => setPop(null)} className="pm-cv-pop" label={pop ? `Tasks due ${fmtLong(pop.day)}` : undefined}>
        {pop && (
          <>
            <div className="pm-cv-pop__head">{fmtLong(pop.day)} <span className="pm-cv-count">{popTasks.length}</span></div>
            <div className="pm-cv-pop__list">
              {popTasks.map((t) => <TaskChip key={t.id} task={t} draggable={false} dragging={false} onDragStart={onChipDragStart} onDragEnd={endDrag} onOpen={() => setPop(null)} />)}
            </div>
          </>
        )}
      </Popover>
    </div>
  );
}

function TaskChip({ task: t, draggable, dragging, onDragStart, onDragEnd, onOpen }: {
  task: TaskRow; draggable: boolean; dragging: boolean;
  onDragStart: (t: TaskRow, e: DragEvent) => void; onDragEnd: () => void; onOpen?: () => void;
}) {
  const open = () => { onOpen?.(); openTask(t.id); };
  const done = t.status === 'done';
  return (
    <div
      {...taskMenuProps(t)}
      role="button"
      tabIndex={0}
      className={cx('pm-cv-chip', done && 'is-done', dragging && 'is-dragging', draggable && 'is-draggable')}
      style={{ '--st': TASK_STATUS_META[t.status].color } as CSSProperties}
      draggable={draggable}
      onDragStart={draggable ? (e) => onDragStart(t, e) : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      onClick={(e) => { e.stopPropagation(); open(); }}
      onKeyDown={(e: KeyboardEvent) => { if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) { taskMenuProps(t).onKeyDown(e as never); return; } if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); open(); } }}
      title={`${t.title} · ${TASK_STATUS_META[t.status].label}`}
      aria-label={`${t.title}, ${TASK_STATUS_META[t.status].label}${t.assignees.length ? `, ${t.assignees.map((a) => a.name).join(', ')}` : ''}`}
    >
      <span className="pm-cv-chip__t">{t.title}</span>
      {t.assignees.length > 0 && <span className="pm-cv-chip__av"><AssigneeStack people={t.assignees} max={2} size={16} /></span>}
    </div>
  );
}

function QuickAdd({ onSubmit, onClose }: { onSubmit: (title: string) => void; onClose: () => void }) {
  const [v, setV] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => { ref.current?.focus(); }, []);
  const submit = () => { const t = v.trim(); if (t) { onSubmit(t); setV(''); } };
  return (
    <input
      ref={ref}
      className="pm-cv-add"
      value={v}
      maxLength={300}
      placeholder="Task title, Enter to add"
      aria-label="New task title"
      onChange={(e) => setV(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); submit(); }
        else if (e.key === 'Escape') { e.preventDefault(); done.current = true; onClose(); }
      }}
      onBlur={() => { if (!done.current) submit(); onClose(); }}
    />
  );
}
