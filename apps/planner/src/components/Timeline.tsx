// Timeline (Gantt) view. Bars are keyboard-focusable buttons; status shows as a glyph, a pattern and a label, never colour alone.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FocusArea, Goal } from '../api/types.ts';
import { usePlanner } from '../state/PlannerContext.tsx';
import { EmptyState, Segmented, cx } from '../ui/primitives.tsx';
import { STATUS_META, STATUS_ORDER } from '../lib/status.ts';
import { barGeometry, daysBetween } from '../lib/schedule.ts';
import { flatten, type GoalNode } from '../lib/tree.ts';
import { formatDate } from '../lib/format.ts';

type Zoom = 'quarter' | 'year' | 'fit';
const PX_PER_DAY: Record<Exclude<Zoom, 'fit'>, number> = { quarter: 10, year: 3 };
const LABEL_W = 240;

const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;
const addMonths = (iso: string, n: number) => { const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1 + n, 1)); return d.toISOString().slice(0, 10); };
const monthEnd = (iso: string) => { const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7), 0)); return d.toISOString().slice(0, 10); };
const monthLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: iso.slice(5, 7) === '01' ? 'numeric' : undefined, timeZone: 'UTC' });

export function Timeline({ roots, focusAreas, periodStart, periodEnd }: { roots: GoalNode[]; focusAreas: FocusArea[]; periodStart: string | null; periodEnd: string | null }) {
  const { openGoal, today } = usePlanner();
  const [zoom, setZoom] = useState<Zoom>('fit');
  const scroller = useRef<HTMLDivElement>(null);

  const all = useMemo(() => flatten(roots), [roots]);
  const dated = (g: Goal) => !!(g.start_date || g.due_date);
  const win = useMemo(() => {
    let lo = periodStart && periodEnd ? periodStart : null, hi = periodStart && periodEnd ? periodEnd : null;
    if (!lo || !hi) {
      for (const { goal: g } of all) for (const d of [g.start_date, g.due_date]) if (d) { if (!lo || d < lo) lo = d; if (!hi || d > hi) hi = d; }
    }
    if (!lo || !hi) return null;
    const start = monthStart(lo), end = monthEnd(hi < lo ? lo : hi);
    return { start, end, total: Math.max(1, daysBetween(start, end)) };
  }, [all, periodStart, periodEnd]);

  const ticks = useMemo(() => {
    if (!win) return [];
    const out: { iso: string; left: number; label: string }[] = [];
    for (let m = win.start; m <= win.end; m = addMonths(m, 1)) out.push({ iso: m, left: (daysBetween(win.start, m) / win.total) * 100, label: monthLabel(m) });
    return out;
  }, [win]);

  const todayLeft = win && today >= win.start && today <= win.end ? (daysBetween(win.start, today) / win.total) * 100 : null;
  const innerWidth = win && zoom !== 'fit' ? LABEL_W + (win.total + 1) * PX_PER_DAY[zoom] : undefined;

  useEffect(() => {
    const el = scroller.current;
    if (!el || !win) return;
    el.scrollLeft = zoom === 'fit' || todayLeft === null ? 0 : Math.max(0, (innerWidth! - LABEL_W) * (todayLeft / 100) - el.clientWidth / 3);
  }, [zoom, win, todayLeft, innerWidth]);

  const undated = all.filter((n) => !dated(n.goal));
  if (!win) {
    return (
      <div className="stack">
        {all.length === 0 ? <EmptyState title="Nothing to show">There are no objectives to place on the timeline.</EmptyState>
          : <EmptyState title="No dates set">None of these objectives has a start or due date yet, so there is nothing to draw. Add dates to a objective to see it here.</EmptyState>}
        {undated.length > 0 && <UndatedList nodes={undated} />}
      </div>
    );
  }

  const areas = focusAreas.filter((a) => roots.some((r) => r.goal.focus_area_id === a.id));
  return (
    <div className="stack">
      <div className="row row--between">
        <Segmented label="Zoom" value={zoom} onChange={setZoom} options={[{ value: 'quarter', label: 'Quarter', title: 'About three months across' }, { value: 'year', label: 'Year', title: 'About a year across' }, { value: 'fit', label: 'Fit', title: 'Fit the whole window' }]} />
        <ul className="legend" aria-label="Bar patterns">
          {STATUS_ORDER.map((s) => <li key={s} className="legend__item"><span className={cx('legend__dot', 'tl__swatch', `tl__bar--${s}`)} aria-hidden="true" /> {STATUS_META[s].label}</li>)}
        </ul>
      </div>
      <div className="tl" role="group" aria-label={`Timeline from ${formatDate(win.start, { year: true })} to ${formatDate(win.end, { year: true })}`}>
        <div className="tl__scroll" ref={scroller} tabIndex={-1}>
          <div className="tl__inner" style={innerWidth ? { inlineSize: innerWidth } : undefined}>
            <div className="tl__row tl__row--head">
              <div className="tl__label tl__label--head">Objective</div>
              <div className="tl__axis" aria-hidden="true">
                {ticks.map((t) => <span key={t.iso} className="tl__tick" style={{ insetInlineStart: `${t.left}%` }}>{t.label}</span>)}
                {todayLeft !== null && <span className="tl__todaylabel" style={{ insetInlineStart: `${todayLeft}%` }}>Today</span>}
              </div>
            </div>
            <div className="tl__body">
              <div className="tl__overlay" aria-hidden="true">
                {ticks.map((t) => <span key={t.iso} className="tl__gridline" style={{ insetInlineStart: `${t.left}%` }} />)}
                {todayLeft !== null && <span className="tl__today" style={{ insetInlineStart: `${todayLeft}%` }} />}
              </div>
              {areas.map((a) => {
                const rows = flatten(roots.filter((r) => r.goal.focus_area_id === a.id)).filter((n) => dated(n.goal));
                return (
                  <div key={a.id} role="group" aria-label={a.name}>
                    <div className="tl__row tl__row--group"><div className="tl__label tl__label--group" style={{ borderInlineStartColor: `var(--fa-${a.color})` }}>{a.name}</div><div className="tl__track" /></div>
                    {rows.map((n) => <Row key={n.goal.id} node={n} win={win} onOpen={openGoal} />)}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      {undated.length > 0 && <UndatedList nodes={undated} />}
    </div>
  );
}

function Row({ node, win, onOpen }: { node: GoalNode; win: { start: string; end: string }; onOpen: (id: string) => void }) {
  const g = node.goal;
  const geo = barGeometry(g.start_date, g.due_date, win.start, win.end);
  const meta = STATUS_META[g.status];
  const range = g.start_date && g.due_date ? `${formatDate(g.start_date, { year: true })} to ${formatDate(g.due_date, { year: true })}` : `Date ${formatDate(g.due_date ?? g.start_date, { year: true })}`;
  return (
    <div className={cx('tl__row', g.archived_at && 'is-archived')}>
      <div className="tl__label" style={{ paddingInlineStart: 8 + node.depth * 16 }}>
        <button type="button" className="gcard__open tl__name" onClick={() => onOpen(g.id)} title={g.title}>{g.title}</button>
      </div>
      <div className="tl__track">
        {geo && (
          <button type="button" className={cx('tl__bar', `tl__bar--${g.status}`, geo.clippedStart && 'is-clip-start', geo.clippedEnd && 'is-clip-end')}
            style={{ insetInlineStart: `${geo.left}%`, inlineSize: `${geo.width}%` }}
            aria-label={`${g.title}. ${meta.label}, ${Math.round(Number(g.progress))}% done. ${range}. Open details`}
            title={`${g.title}: ${meta.label}, ${Math.round(Number(g.progress))}%, ${range}`} onClick={() => onOpen(g.id)}>
            <span className="tl__fill" style={{ inlineSize: `${Math.max(0, Math.min(100, Number(g.progress)))}%` }} aria-hidden="true" />
            <span className="tl__bartext" aria-hidden="true">{meta.glyph} {meta.label}</span>
          </button>
        )}
      </div>
    </div>
  );
}

function UndatedList({ nodes }: { nodes: GoalNode[] }) {
  const { openGoal } = usePlanner();
  return (
    <section className="card" aria-labelledby="tl-undated">
      <h3 id="tl-undated" className="section__title">No dates set</h3>
      <p className="muted">These objectives have no start or due date, so they have no bar.</p>
      <ul className="tl__undated">
        {nodes.map((n) => <li key={n.goal.id}><button type="button" className="gcard__open" onClick={() => openGoal(n.goal.id)}>{n.goal.title}</button> <span className="muted">· {STATUS_META[n.goal.status].label}</span></li>)}
      </ul>
    </section>
  );
}
