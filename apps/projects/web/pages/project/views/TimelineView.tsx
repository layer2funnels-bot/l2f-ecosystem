import { taskMenuProps } from '../../../task/taskMenu.tsx';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { ProjectDetail, Section, TaskRow } from '../../../../shared/api.ts';
import { useTasks } from '../../../lib/data.ts';
import { useMedia } from '../../../lib/hooks.ts';
import { cx, lsGet, lsSet, TASK_STATUS_META, todayYmd } from '../../../lib/util.ts';
import { openTask } from '../../../router.ts';
import { AssigneeStack } from '../../../ui/Badges.tsx';
import { Button } from '../../../ui/Button.tsx';
import { EmptyState, ErrorState, Skeleton } from '../../../ui/Feedback.tsx';
import { Icon } from '../../../ui/icons.tsx';
import {
  canEditProject, dayOfMonth, daysInMonth, diffDays, fmtMonthShortYear, fmtMonthYear, fmtShort, fmtShortYear, fmtWeekdayShort,
  shiftDays, useTaskScheduler, weekStart,
} from './dateViewShared.ts';

type Zoom = 'week' | 'month' | 'quarter';
const ZOOMS: { id: Zoom; label: string; px: number; minDays: number }[] = [
  { id: 'week', label: 'Week', px: 40, minDays: 98 },
  { id: 'month', label: 'Month', px: 16, minDays: 210 },
  { id: 'quarter', label: 'Quarter', px: 6, minDays: 420 },
];
const ROW_H = 36;

type Mode = 'move' | 'start' | 'end';
interface Drag { id: string; mode: Mode; x0: number; scroll0: number; s0: string; e0: string; start: string; end: string; moved: boolean }
interface Create { id: string; a: number; b: number; moved: boolean }
type Row = { kind: 'group'; id: string; name: string; count: number } | { kind: 'task'; task: TaskRow; depth: number };

export function TimelineView({ project }: { project: ProjectDetail }) {
  const q = useTasks(project.id);
  if (q.loading && !q.data) {
    return (
      <div className="pm-tl-loading" role="status" aria-label="Loading timeline">
        <Skeleton width={220} height={32} />
        <div style={{ height: 12 }} />
        <Skeleton height={360} radius={12} />
      </div>
    );
  }
  if (q.error && !q.data) return <ErrorState title="Couldn't load tasks" message={q.error.message} onRetry={() => void q.refetch()} />;
  const tasks = q.data ?? [];
  if (tasks.length === 0) {
    return <EmptyState icon="timeline" title="No tasks with dates yet" text="No tasks with dates yet — add start and due dates to see them here." />;
  }
  return <TimelineBody project={project} tasks={tasks} />;
}

const hasDates = (t: TaskRow) => !!(t.startOn || t.dueOn);
/** Normalised [start, end] of a dated task (swapped if the data is inconsistent). */
function span(t: TaskRow): [string, string] {
  const s = t.startOn ?? (t.dueOn as string), e = t.dueOn ?? (t.startOn as string);
  return s <= e ? [s, e] : [e, s];
}

function buildRows(tasks: TaskRow[], sections: Section[], collapsed: Set<string>): Row[] {
  const ids = new Set(tasks.map((t) => t.id));
  const kids = new Map<string, TaskRow[]>();
  const tops: TaskRow[] = [];
  for (const t of tasks) {
    if (t.parentId && ids.has(t.parentId)) {
      const l = kids.get(t.parentId);
      if (l) l.push(t); else kids.set(t.parentId, [t]);
    } else tops.push(t);
  }
  const byPos = (a: TaskRow, b: TaskRow) => a.position - b.position || a.number - b.number;
  const groups = new Map<string, TaskRow[]>();
  const known = new Set(sections.map((s) => s.id));
  for (const t of tops) {
    const key = t.sectionId && known.has(t.sectionId) ? t.sectionId : '_none';
    const l = groups.get(key);
    if (l) l.push(t); else groups.set(key, [t]);
  }
  const order: { id: string; name: string }[] = [...sections].sort((a, b) => a.position - b.position).map((s) => ({ id: s.id, name: s.name }));
  order.push({ id: '_none', name: sections.length ? 'No section' : 'Tasks' });
  const rows: Row[] = [];
  for (const g of order) {
    const list = groups.get(g.id);
    if (!list?.length) continue;
    list.sort(byPos);
    let count = 0;
    const body: Row[] = [];
    for (const t of list) {
      count++;
      body.push({ kind: 'task', task: t, depth: 0 });
      for (const c of (kids.get(t.id) ?? []).sort(byPos)) { count++; body.push({ kind: 'task', task: c, depth: 1 }); }
    }
    rows.push({ kind: 'group', id: g.id, name: g.name, count });
    if (!collapsed.has(g.id)) rows.push(...body);
  }
  return rows;
}

function TimelineBody({ project, tasks }: { project: ProjectDetail; tasks: TaskRow[] }) {
  const canEdit = canEditProject(project);
  const mobile = useMedia('(max-width: 767px)');
  const today = todayYmd();
  const [zoom, setZoomState] = useState<Zoom>(() => {
    const z = lsGet('pm.tl.zoom');
    return z === 'month' || z === 'quarter' || z === 'week' ? z : 'week';
  });
  const zc = ZOOMS.find((z) => z.id === zoom) as (typeof ZOOMS)[number];
  const px = zc.px;
  const leftW = mobile ? 148 : 280;
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [drag, setDrag] = useState<Drag | null>(null);
  const [create, setCreate] = useState<Create | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const createRef = useRef<Create | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scheduler = useTaskScheduler(project.id);

  // ---- visible range (always starts on a Monday so week/weekend shading is a repeating pattern)
  const { rangeStart, total } = useMemo(() => {
    let lo = today, hi = today;
    const see = (d: string | null | undefined) => { if (d) { if (d < lo) lo = d; if (d > hi) hi = d; } };
    for (const t of tasks) { see(t.startOn); see(t.dueOn); }
    see(project.startOn); see(project.dueOn);
    const start = weekStart(shiftDays(lo, -14));
    const end = shiftDays(hi, 28);
    let n = diffDays(start, end) + 1;
    n = Math.max(n, zc.minDays);
    return { rangeStart: start, total: Math.ceil(n / 7) * 7 };
  }, [tasks, project.startOn, project.dueOn, today, zc.minDays]);
  const idxOf = useCallback((d: string) => diffDays(rangeStart, d), [rangeStart]);
  const trackW = total * px;

  // ---- scrolling: keep the centre date stable across zoom changes and range shifts
  const centerRef = useRef<string>(today);
  const prevStart = useRef(rangeStart);
  const scrollToDate = useCallback((date: string, smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    const x = (diffDays(rangeStart, date) + 0.5) * px;
    const left = Math.max(0, x - (el.clientWidth - leftW) / 2);
    el.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
  }, [rangeStart, px, leftW]);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && prevStart.current !== rangeStart) {
      el.scrollLeft += diffDays(rangeStart, prevStart.current) * px;
      prevStart.current = rangeStart;
    }
  }, [rangeStart, px]);
  useLayoutEffect(() => { scrollToDate(centerRef.current); }, [zoom, scrollToDate]); // eslint-disable-line react-hooks/exhaustive-deps
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const idx = Math.floor((el.scrollLeft + (el.clientWidth - leftW) / 2) / px);
    centerRef.current = shiftDays(rangeStart, Math.max(0, Math.min(total - 1, idx)));
  };
  const setZoom = (z: Zoom) => { setZoomState(z); lsSet('pm.tl.zoom', z); };

  // ---- rows
  const rows = useMemo(() => buildRows(tasks, project.sections, collapsed), [tasks, project.sections, collapsed]);
  const datedCount = useMemo(() => tasks.filter(hasDates).length, [tasks]);
  const toggleGroup = (id: string) => setCollapsed((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // ---- header cells
  const header = useMemo(() => {
    const months: { idx: number; len: number; label: string }[] = [];
    for (let i = 0; i < total;) {
      const date = shiftDays(rangeStart, i);
      const len = Math.min(daysInMonth(date) - dayOfMonth(date) + 1, total - i);
      months.push({ idx: i, len, label: len * px >= 110 ? fmtMonthYear(date) : fmtMonthShortYear(date) });
      i += len;
    }
    const weeks = Array.from({ length: total / 7 }, (_, w) => {
      const d = shiftDays(rangeStart, w * 7);
      return { date: d, label: zoom === 'quarter' ? String(dayOfMonth(d)) : fmtShort(d) };
    });
    const days = zoom === 'week'
      ? Array.from({ length: total }, (_, i) => { const d = shiftDays(rangeStart, i); return { date: d, n: dayOfMonth(d), wd: fmtWeekdayShort(d).slice(0, 1) }; })
      : [];
    return { months, weeks, days };
  }, [rangeStart, total, px, zoom]);

  const todayIdx = idxOf(today);
  const todayInRange = todayIdx >= 0 && todayIdx < total;

  // ---- persist helpers
  const commit = (t: TaskRow, start: string, end: string) => {
    const both = !!(t.startOn && t.dueOn);
    const [s0, e0] = span(t);
    if (start === s0 && end === e0) return;
    const patch = both ? { startOn: start, dueOn: end } : t.dueOn ? { dueOn: start } : { startOn: start };
    void scheduler.mutate({ task: t, patch });
  };

  // ---- bar pointer handling
  const onBarDown = (e: ReactPointerEvent<HTMLDivElement>, t: TaskRow) => {
    if (!canEdit || e.button !== 0) return;
    const edge = (e.target as HTMLElement).dataset.edge as 'start' | 'end' | undefined;
    const [s, en] = span(t);
    const single = !(t.startOn && t.dueOn);
    const d: Drag = { id: t.id, mode: single ? 'move' : edge ?? 'move', x0: e.clientX, scroll0: scrollRef.current?.scrollLeft ?? 0, s0: s, e0: en, start: s, end: en, moved: false };
    dragRef.current = d;
    setDrag(d);
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onBarMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const sc = scrollRef.current;
    const dx = e.clientX - d.x0 + ((sc?.scrollLeft ?? 0) - d.scroll0);
    const delta = Math.round(dx / px);
    let start = d.s0, end = d.e0;
    if (d.mode === 'move') {
      const c = Math.max(-idxOf(d.s0), Math.min(total - 1 - idxOf(d.e0), delta));
      start = shiftDays(d.s0, c); end = shiftDays(d.e0, c);
    } else if (d.mode === 'start') {
      const c = Math.max(-idxOf(d.s0), Math.min(diffDays(d.s0, d.e0), delta));
      start = shiftDays(d.s0, c);
    } else {
      const c = Math.max(-diffDays(d.s0, d.e0), Math.min(total - 1 - idxOf(d.e0), delta));
      end = shiftDays(d.e0, c);
    }
    if (Math.abs(e.clientX - d.x0) > 3) d.moved = true;
    if (start === d.start && end === d.end) return;
    const nd = { ...d, start, end };
    dragRef.current = nd;
    setDrag(nd);
  };
  const onBarUp = (e: ReactPointerEvent<HTMLDivElement>, t: TaskRow) => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    setDrag(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!d.moved || (d.start === d.s0 && d.end === d.e0)) { if (!d.moved) openTask(t.id); return; }
    commit(t, d.start, d.end);
  };
  const onBarCancel = () => { dragRef.current = null; setDrag(null); };
  const onBarKey = (e: ReactKeyboardEvent<HTMLDivElement>, t: TaskRow) => {
    if (e.key === 'Enter') { e.preventDefault(); openTask(t.id); return; }
    if (!canEdit || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    const dir = e.key === 'ArrowLeft' ? -1 : 1;
    const [s, en] = span(t);
    const both = !!(t.startOn && t.dueOn);
    if (e.shiftKey && both) {
      const ne = shiftDays(en, dir);
      if (ne >= s) commit(t, s, ne);
    } else commit(t, shiftDays(s, dir), shiftDays(en, dir));
  };

  // ---- drag-to-create on undated rows
  const idxFromEvent = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(total - 1, Math.floor((e.clientX - r.left) / px)));
  };
  const onTrackDown = (e: ReactPointerEvent<HTMLDivElement>, t: TaskRow) => {
    if (!canEdit || e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    const i = idxFromEvent(e);
    const c: Create = { id: t.id, a: i, b: i, moved: false };
    createRef.current = c;
    setCreate(c);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onTrackMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const c = createRef.current;
    if (!c) return;
    const i = idxFromEvent(e);
    if (i === c.b) return;
    const nc = { ...c, b: i, moved: true };
    createRef.current = nc;
    setCreate(nc);
  };
  const onTrackUp = (e: ReactPointerEvent<HTMLDivElement>, t: TaskRow) => {
    const c = createRef.current;
    createRef.current = null;
    setCreate(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!c || !c.moved) return;
    const s = shiftDays(rangeStart, Math.min(c.a, c.b)), en = shiftDays(rangeStart, Math.max(c.a, c.b));
    void scheduler.mutate({ task: t, patch: { startOn: s, dueOn: en } });
  };
  const scheduleOn = (t: TaskRow, date: string) => void scheduler.mutate({ task: t, patch: { startOn: date, dueOn: date } });

  // ---- render pieces
  const tipText = (s: string, en: string) => {
    const n = diffDays(s, en) + 1;
    return `${s === en ? fmtShortYear(s) : `${fmtShortYear(s)} – ${fmtShortYear(en)}`} · ${n} ${n === 1 ? 'day' : 'days'}`;
  };

  const renderBar = (t: TaskRow) => {
    const dragging = drag?.id === t.id;
    const [s, en] = dragging && drag ? [drag.start, drag.end] : span(t);
    const single = !(t.startOn && t.dueOn);
    const left = idxOf(s) * px;
    const width = (diffDays(s, en) + 1) * px;
    const color = TASK_STATUS_META[t.status].color;
    const done = t.status === 'done';
    const label = `${t.title}, ${tipText(s, en)}, ${TASK_STATUS_META[t.status].label}${t.assignees.length ? `, ${t.assignees.map((a) => a.name).join(', ')}` : ''}`;
    const handlers = {
      onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => onBarDown(e, t),
      onPointerMove: onBarMove,
      onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => onBarUp(e, t),
      onPointerCancel: onBarCancel,
      onKeyDown: (e: ReactKeyboardEvent<HTMLDivElement>) => onBarKey(e, t),
    };
    const common = { role: 'button', tabIndex: 0, 'aria-label': `${label}. Enter to open${canEdit ? ', arrow keys to move' : ''}.`, title: dragging ? undefined : tipText(s, en) };
    const tip = dragging && <div className="pm-tl-tip" style={{ left: left + Math.max(width, 14) + 8 }}>{tipText(s, en)}</div>;
    if (single) {
      return (
        <>
          <div {...common} {...handlers} className={cx('pm-tl-ms', done && 'is-done', dragging && 'is-dragging', canEdit && 'is-editable')} style={{ left: left + px / 2 - 9, '--st': color } as CSSProperties}>
            <span className="pm-tl-ms__shape" />
          </div>
          {!dragging && <span className={cx('pm-tl-out', done && 'is-done')} style={{ left: left + px / 2 + 14 }}>{t.title}</span>}
          {tip}
        </>
      );
    }
    const barAvatars = Math.min(t.assignees.length, 2) + (t.assignees.length > 2 ? 1 : 0);
    const fits = width >= t.title.length * 6.6 + 22 + (barAvatars ? 12 + barAvatars * 12 : 0);
    return (
      <>
        <div {...common} {...handlers} className={cx('pm-tl-bar', done && 'is-done', dragging && 'is-dragging', canEdit && 'is-editable')} style={{ left, width: Math.max(width, 4), '--st': color } as CSSProperties}>
          {canEdit && width >= 14 && <span className="pm-tl-bar__h pm-tl-bar__h--s" data-edge="start" />}
          {fits && <span className="pm-tl-bar__t">{t.title}</span>}
          {fits && t.assignees.length > 0 && <span className="pm-tl-bar__av"><AssigneeStack people={t.assignees} max={2} size={18} /></span>}
          {canEdit && width >= 14 && <span className="pm-tl-bar__h pm-tl-bar__h--e" data-edge="end" />}
        </div>
        {!fits && !dragging && <span className={cx('pm-tl-out', done && 'is-done')} style={{ left: left + width + 6 }}>{t.title}</span>}
        {tip}
      </>
    );
  };

  const projStartIdx = project.startOn ? idxOf(project.startOn) : null;
  const projDueIdx = project.dueOn ? idxOf(project.dueOn) + 1 : null;

  return (
    <div className="pm-tl" data-project-id={project.id}>
      <div className="pm-dv-bar">
        <h2 className="pm-dv-title">Timeline</h2>
        <Button size="sm" icon="calendar" onClick={() => scrollToDate(today, true)}>Today</Button>
        <div className="pm-dv-spacer" />
        <div className="pm-dv-seg" role="group" aria-label="Zoom">
          {ZOOMS.map((z) => <button key={z.id} type="button" aria-pressed={zoom === z.id} onClick={() => setZoom(z.id)}>{z.label}</button>)}
        </div>
      </div>

      {datedCount === 0 && (
        <div className="pm-tl-note" role="status">
          <Icon name="info" size={14} /> No tasks with dates yet — add start and due dates to see them here.
          {canEdit && ' Drag across the empty row next to a task to schedule it.'}
        </div>
      )}

      <div
        ref={scrollRef}
        className={cx('pm-tl__scroll', `is-${zoom}`)}
        style={{ '--px': `${px}px`, '--left': `${leftW}px` } as CSSProperties}
        onScroll={onScroll}
      >
        <div className="pm-tl__inner" style={{ width: leftW + trackW }}>
          <div className="pm-tl__head">
            <div className="pm-tl__corner"><span>Task</span><span className="pm-muted pm-tl__cnt">{tasks.length}</span></div>
            <div className="pm-tl__hdr" style={{ width: trackW }}>
              <div className="pm-tl__hrow">
                {header.months.map((m) => (
                  <div key={m.idx} className="pm-tl__hcell pm-tl__hcell--month" style={{ width: m.len * px }}>
                    <span style={{ left: leftW + 8 }}>{m.label}</span>
                  </div>
                ))}
              </div>
              <div className="pm-tl__hrow">
                {header.weeks.map((w) => {
                  const cur = today >= w.date && today <= shiftDays(w.date, 6);
                  return <div key={w.date} className={cx('pm-tl__hcell', cur && 'is-today')} style={{ width: 7 * px }}><span>{w.label}</span></div>;
                })}
              </div>
              {header.days.length > 0 && (
                <div className="pm-tl__hrow pm-tl__hrow--days">
                  {header.days.map((d) => (
                    <div key={d.date} className={cx('pm-tl__hcell pm-tl__hcell--day', d.date === today && 'is-today')} style={{ width: px }}>
                      <span>{d.wd}</span><b>{d.n}</b>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="pm-tl__body">
            <div className="pm-tl__bg" style={{ left: leftW, width: trackW }} aria-hidden="true">
              {projStartIdx !== null && projStartIdx >= 0 && projStartIdx < total && (
                <div className="pm-tl__mark" style={{ left: projStartIdx * px }}><span>Start</span></div>
              )}
              {projDueIdx !== null && projDueIdx > 0 && projDueIdx <= total && (
                <div className="pm-tl__mark pm-tl__mark--end" style={{ left: projDueIdx * px }}><span>Due</span></div>
              )}
              {todayInRange && <div className="pm-tl__today" style={{ left: todayIdx * px + px / 2 }} />}
            </div>

            {rows.map((r) => {
              if (r.kind === 'group') {
                const open = !collapsed.has(r.id);
                return (
                  <div key={`g-${r.id}`} className="pm-tl__row pm-tl__row--group" style={{ gridTemplateColumns: `${leftW}px ${trackW}px` }}>
                    <button type="button" className="pm-tl__left pm-tl__gl" aria-expanded={open} onClick={() => toggleGroup(r.id)}>
                      <Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} />
                      <span className="pm-truncate">{r.name}</span>
                      <span className="pm-tl__cnt">{r.count}</span>
                    </button>
                    <div className="pm-tl__track" />
                  </div>
                );
              }
              const t = r.task;
              const dated = hasDates(t);
              const done = t.status === 'done';
              const ghost = create && create.id === t.id ? create : null;
              return (
                <div key={t.id} className="pm-tl__row" {...taskMenuProps(t, { project })} style={{ gridTemplateColumns: `${leftW}px ${trackW}px`, height: ROW_H }}>
                  <div className="pm-tl__left" style={{ paddingLeft: 10 + r.depth * 16 }}>
                    <span className="pm-tl__dot" style={{ background: TASK_STATUS_META[t.status].color }} title={TASK_STATUS_META[t.status].label} />
                    <button type="button" className={cx('pm-tl__title pm-truncate', done && 'is-done')} onClick={() => openTask(t.id)} title={t.title}>{t.title}</button>
                    {!dated && canEdit && <button type="button" className="pm-tl__sched" onClick={() => scheduleOn(t, today)} title="Give this task a one-day schedule starting today">Schedule</button>}
                    {t.assignees.length > 0 && !mobile && <AssigneeStack people={t.assignees} max={3} size={20} />}
                  </div>
                  <div
                    className={cx('pm-tl__track', !dated && canEdit && 'is-open')}
                    onPointerDown={!dated ? (e) => onTrackDown(e, t) : undefined}
                    onPointerMove={!dated ? onTrackMove : undefined}
                    onPointerUp={!dated ? (e) => onTrackUp(e, t) : undefined}
                    onPointerCancel={!dated ? () => { createRef.current = null; setCreate(null); } : undefined}
                    onDoubleClick={!dated && canEdit ? (e) => {
                      const r2 = e.currentTarget.getBoundingClientRect();
                      scheduleOn(t, shiftDays(rangeStart, Math.max(0, Math.min(total - 1, Math.floor((e.clientX - r2.left) / px)))));
                    } : undefined}
                  >
                    {dated && renderBar(t)}
                    {!dated && !ghost && canEdit && <span className="pm-tl__hint">Drag across days to schedule</span>}
                    {ghost && (
                      <>
                        <div className="pm-tl-bar is-ghost" style={{ left: Math.min(ghost.a, ghost.b) * px, width: (Math.abs(ghost.a - ghost.b) + 1) * px }} />
                        <div className="pm-tl-tip" style={{ left: (Math.max(ghost.a, ghost.b) + 1) * px + 8 }}>
                          {tipText(shiftDays(rangeStart, Math.min(ghost.a, ghost.b)), shiftDays(rangeStart, Math.max(ghost.a, ghost.b)))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
