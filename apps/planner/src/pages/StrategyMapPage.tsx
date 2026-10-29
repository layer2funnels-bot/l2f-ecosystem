import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import type { FocusArea, Goal } from '../api/types.ts';
import { usePlanner } from '../state/PlannerContext.tsx';
import { useDialogs } from '../components/Dialogs.tsx';
import { FilterBar, useGoalView, type ViewState } from '../components/FilterBar.tsx';
import { GoalActionsProvider, GoalCard, useGoalMove, type CardDnd } from '../components/GoalCard.tsx';
import { GoalTree, type TreeGroup } from '../components/GoalTree.tsx';
import { Timeline } from '../components/Timeline.tsx';
import { Button, Chip, EmptyState, ProgressBar, Segmented, cx } from '../ui/primitives.tsx';
import { STATUS_META } from '../lib/status.ts';
import { activeFilterCount, buildTree, filterGoals, groupGoals, sortGoals, type GoalGroup, type GoalNode } from '../lib/tree.ts';

type Mode = 'map' | 'tree' | 'timeline';

const read = (k: string): string | null => { try { return window.localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { window.localStorage.setItem(k, v); } catch { /* the choice is just not remembered */ } };

/** Re-applies the chosen sort to every level of the tree (buildTree itself orders by position). */
function orderTree(nodes: GoalNode[], rank: Map<string, number>): GoalNode[] {
  const sorted = [...nodes].sort((a, b) => (rank.get(a.goal.id) ?? 0) - (rank.get(b.goal.id) ?? 0));
  sorted.forEach((n) => { n.children = orderTree(n.children, rank); });
  return sorted;
}

const PRIORITY_ACCENT: Record<Goal['priority'], string> = { critical: 'var(--danger)', high: 'var(--st-warn)', medium: 'var(--primary)', low: 'var(--seg-not_started)' };
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');

interface Over { col: string; index: number; sub: string | null }

export default function StrategyMapPage() {
  const { plan, planId, me, can, route } = usePlanner();
  const dialogs = useDialogs();
  const { view, setView, reset } = useGoalView('map');
  const focusParam = route.params.focus;
  useEffect(() => { if (focusParam) setView({ ...view, filters: { ...view.filters, focusAreas: [focusParam] } }); }, [focusParam]); // eslint-disable-line react-hooks/exhaustive-deps -- a link from Home narrows to one focus area
  const modeKey = `planner.map.mode.${me.id}.${planId}`;
  const treeKey = `planner.map.tree.${me.id}.${planId}`;
  const [listMode, setModeState] = useState<Mode>(() => { const m = read(modeKey) as Mode | null; return m === 'map' ? 'map' : 'tree'; });
  const mode: Mode = route.params.view === 'timeline' ? 'timeline' : listMode;
  const [collapsed, setCollapsedState] = useState<Set<string>>(() => { try { return new Set(JSON.parse(read(treeKey) ?? '[]') as string[]); } catch { return new Set(); } });
  const [live, setLive] = useState('');
  const announce = useCallback((t: string) => setLive(t), []);

  const setMode = (m: Mode) => { setModeState(m); write(modeKey, m); };
  const setCollapsed = (s: Set<string>) => { setCollapsedState(s); write(treeKey, JSON.stringify([...s])); };

  if (!plan) return null;
  const archivedPlan = !!plan.plan.archived_at;
  const canCreate = can['goal.create'] && !archivedPlan;

  return (
    <GoalActionsProvider announce={announce}>
      <div className="stack map">
        <header className="pagehead">
          <div>
            <h2 className="page-title">{mode === 'timeline' ? 'Timeline' : 'Planner'}</h2>
            <p className="page-lede">{mode === 'timeline' ? 'See when each objective starts and ends.' : `Everything in ${plan.plan.name}, grouped by focus area. Click an objective to open it.`}</p>
          </div>
          <div className="row">
            {can['plan.manage'] && !archivedPlan && <Button onClick={() => dialogs.newFocus()}>Add focus area</Button>}
            {mode !== 'timeline' && <Segmented label="Show as" value={listMode} onChange={setMode} options={[{ value: 'tree', label: 'List' }, { value: 'map', label: 'Board' }]} />}
            <Button variant="primary" disabled={!canCreate} title={!canCreate ? (archivedPlan ? 'This plan is archived' : 'You can’t add objectives') : undefined} onClick={() => dialogs.newGoal({})}>Add objective</Button>
          </div>
        </header>
        {archivedPlan && <div className="map__banner" role="status"><strong>This plan is archived.</strong> It is read-only: restore it from Plan settings to make changes.</div>}
        <div className="stack map__main">
          <FilterBar view={view} onChange={setView} onReset={reset} showColor={mode === 'map'} showGroup={mode !== 'timeline'} showSort={mode !== 'timeline'} />
          <Body mode={mode} view={view} onReset={reset} collapsed={collapsed} setCollapsed={setCollapsed} announce={announce} />
        </div>
        <div className="sr-only" role="status" aria-live="polite">{live}</div>
      </div>
    </GoalActionsProvider>
  );
}

// ------------------------------------------------------------------ body
function Body({ mode, view, onReset, collapsed, setCollapsed, announce }: {
  mode: Mode; view: ViewState; onReset: () => void; collapsed: Set<string>; setCollapsed: (s: Set<string>) => void; announce: (t: string) => void;
}) {
  const { plan, can, today } = usePlanner();
  const dialogs = useDialogs();
  const p = plan!;
  const archivedPlan = !!p.plan.archived_at;
  const filters = view.filters;

  const filtered = useMemo(() => filterGoals(p.goals, filters, today), [p.goals, filters, today]);
  const sorted = useMemo(() => sortGoals(filtered, view.sort, view.dir), [filtered, view.sort, view.dir]);
  const roots = useMemo(() => {
    const tree = buildTree(sorted);
    return view.sort === 'manual' ? tree : orderTree(tree, new Map(sorted.map((g, i) => [g.id, i] as const)));
  }, [sorted, view.sort]);
  const nodeById = useMemo(() => {
    const m = new Map<string, GoalNode>();
    const walk = (n: GoalNode) => { m.set(n.goal.id, n); n.children.forEach(walk); };
    roots.forEach(walk);
    return m;
  }, [roots]);
  const typeNames = useMemo(() => Object.fromEntries(p.goal_types.map((t) => [t.id, t.name])), [p.goal_types]);
  const groups = useMemo<GoalGroup[]>(() => {
    const raw = groupGoals(sorted, view.groupBy, { focusAreas: p.focus_areas, values: p.values, typeNames });
    const grouped = raw.map((g) => (view.groupBy === 'status' || view.groupBy === 'priority') ? { ...g, label: titleCase(view.groupBy === 'status' ? STATUS_META[g.key as Goal['status']].label : g.label) } : g);
    if (view.groupBy !== 'focus') return grouped;
    const byKey = new Map(grouped.map((g) => [g.key, g] as const));
    return p.focus_areas
      .filter((a) => (!a.archived_at || byKey.has(a.id)) && (!filters.focusAreas.length || filters.focusAreas.includes(a.id)))
      .map((a) => byKey.get(a.id) ?? { key: a.id, label: a.name, color: a.color, goals: [] });
  }, [sorted, view.groupBy, p.focus_areas, p.values, typeNames, filters.focusAreas]);

  const activeAreas = p.focus_areas.filter((a) => !a.archived_at);
  if (activeAreas.length === 0) {
    return (
      <EmptyState title="No focus areas yet" action={can['plan.manage'] && !archivedPlan ? <Button variant="primary" onClick={() => dialogs.newFocus()}>Add your first focus area</Button> : undefined}>
        Focus areas are the themes your objectives are grouped under, such as Growth or Customers. {can['plan.manage'] ? 'Add your first one here, or later in Plan settings.' : 'Ask a plan manager to add them.'}
      </EmptyState>
    );
  }
  if (sorted.length === 0 && activeFilterCount(filters) > 0) {
    return <EmptyState title="No objectives match your filters" action={<Button onClick={onReset}>Clear filters</Button>}>Try removing a filter or changing the search.</EmptyState>;
  }
  if (mode === 'timeline' && p.goals.length === 0) {
    return <EmptyState title="No objectives yet" action={can['goal.create'] && !archivedPlan ? <Button variant="primary" onClick={() => dialogs.newGoal({})}>Add the first objective</Button> : undefined}>Objectives you add will appear here.</EmptyState>;
  }

  if (mode === 'tree') {
    const tg: TreeGroup[] = groups.map((g) => ({ key: g.key, label: g.label, color: g.color, nodes: g.goals.map((x) => nodeById.get(x.id)).filter((n): n is GoalNode => !!n) }));
    return <>
      <GoalTree groups={tg} collapsed={collapsed} onCollapsedChange={setCollapsed} showHeaders={view.groupBy !== 'none'} />
      {view.groupBy === 'focus' && <button type="button" className="fa-add" disabled={!can['plan.manage'] || archivedPlan} title={can['plan.manage'] ? undefined : 'You need permission to manage this plan'} onClick={() => dialogs.newFocus()}>+ Add focus area</button>}
    </>;
  }
  if (mode === 'timeline') {
    return <Timeline roots={roots} focusAreas={p.focus_areas} periodStart={p.plan.period_start} periodEnd={p.plan.period_end} />;
  }
  return <Board groups={groups} nodeById={nodeById} view={view} announce={announce} areas={p.focus_areas} />;
}

// ------------------------------------------------------------------ map
function Board({ groups, nodeById, view, announce, areas }: { groups: GoalGroup[]; nodeById: Map<string, GoalNode>; view: ViewState; announce: (t: string) => void; areas: FocusArea[] }) {
  const { plan, can } = usePlanner();
  const dialogs = useDialogs();
  const p = plan!;
  const archivedPlan = !!p.plan.archived_at;
  const byFocus = view.groupBy === 'focus';
  const dndOn = can['goal.edit'] && !archivedPlan && byFocus;
  const canAdd = can['goal.create'] && !archivedPlan;
  const move = useGoalMove();

  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<Over | null>(null);
  const overRef = useRef<Over | null>(null);
  const setOverBoth = (o: Over | null) => {
    const cur = overRef.current;
    if (cur?.col === o?.col && cur?.index === o?.index && cur?.sub === o?.sub) return;
    overRef.current = o; setOver(o);
  };

  const accent = useCallback((g: Goal) => {
    if (view.colorBy === 'focus') { const a = areas.find((x) => x.id === g.focus_area_id); return a ? `var(--fa-${a.color})` : 'var(--line)'; }
    if (view.colorBy === 'priority') return PRIORITY_ACCENT[g.priority];
    return `var(--seg-${g.status})`;
  }, [view.colorBy, areas]);

  const dnd: CardDnd | undefined = dndOn ? {
    draggingId: dragId,
    subTargetId: over?.sub ?? null,
    onDragStart: (e: DragEvent, g: Goal) => {
      e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', g.id);
      setDragId(g.id);
      announce(`Picked up ${g.title}. Drop it on a column to move it, or onto another card to make it a sub-goal. With a keyboard, use the card's actions menu instead.`);
    },
    onDragEnd: () => { setDragId(null); setOverBoth(null); },
  } : undefined;

  const target = (e: DragEvent<HTMLElement>, col: GoalGroup): Over => {
    const els = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('.map__cards > [data-top-card]')).filter((el) => el.dataset.cardId !== dragId);
    const hit = (e.target as HTMLElement).closest<HTMLElement>('[data-top-card]');
    if (hit && hit.dataset.cardId !== dragId && e.currentTarget.contains(hit)) {
      const r = hit.getBoundingClientRect(), ratio = (e.clientY - r.top) / Math.max(1, r.height);
      const i = els.indexOf(hit);
      if (ratio > 0.28 && ratio < 0.72) return { col: col.key, index: i, sub: hit.dataset.cardId ?? null };
      return { col: col.key, index: ratio >= 0.72 ? i + 1 : i, sub: null };
    }
    let index = els.length;
    for (let i = 0; i < els.length; i++) { const r = els[i]!.getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) { index = i; break; } }
    return { col: col.key, index, sub: null };
  };

  const onDrop = (e: DragEvent<HTMLElement>, col: GoalGroup) => {
    e.preventDefault();
    const o = overRef.current, id = dragId;
    setDragId(null); setOverBoth(null);
    if (!id || !o) return;
    const goal = p.goals.find((g) => g.id === id);
    if (!goal) return;
    if (o.sub) { void move(goal, { focusId: null, parentId: o.sub }); return; }
    const ids = col.goals.map((g) => g.id).filter((x) => x !== id);
    const same = goal.focus_area_id === col.key && !goal.parent_goal_id;
    if (view.sort !== 'manual' && same) { announce('Sorting is not manual, so the order cannot be changed.'); return; }
    const at = view.sort === 'manual' ? o.index : ids.length;
    const order = [...ids.slice(0, at), id, ...ids.slice(at)];
    if (same && col.goals.map((g) => g.id).join() === order.join()) return;
    void move(goal, { focusId: col.key, parentId: null, order });
  };

  return (
    <div className="stack">
      <p className="map__hint muted">
        {dndOn ? 'Drag a card to another column to move it, between cards to reorder, or onto the middle of a card to make it a sub-objective. On a keyboard or phone, use the ⋯ menu on a card.'
          : archivedPlan ? 'This plan is archived, so objectives can’t be moved.'
          : !can['goal.edit'] ? 'You can view the map but not rearrange it.'
          : 'Group by focus area to drag objectives between columns. You can still use the ⋯ menu on any card.'}
      </p>
      <div className="map__board">
        {groups.map((col) => {
          const live = col.goals.filter((g) => !g.archived_at);
          const avg = live.length ? Math.round(live.reduce((n, g) => n + Number(g.progress), 0) / live.length) : 0;
          const shown = col.goals.filter((g) => g.id !== dragId);
          let n = 0;
          const marker = (i: number) => over && over.col === col.key && !over.sub && over.index === i ? <div key={`m${i}`} className="map__insert" aria-hidden="true" /> : null;
          return (
            <section key={col.key} className={cx('map__col', over?.col === col.key && 'is-over')} aria-labelledby={`col-${col.key}`}
              style={col.color ? { ['--col-color' as string]: `var(--fa-${col.color})` } : undefined}
              onDragOver={dndOn && dragId ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOverBoth(target(e, col)); } : undefined}
              onDragLeave={dndOn && dragId ? (e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOverBoth(null); } : undefined}
              onDrop={dndOn && dragId ? (e) => onDrop(e, col) : undefined}>
              <header className="map__colhead">
                <div className="map__coltitle"><h2 id={`col-${col.key}`} className="map__colname">{col.label}</h2><Chip>{col.goals.length}</Chip>{byFocus && can['plan.manage'] && !archivedPlan && <Button size="sm" variant="ghost" onClick={() => { const fa = areas.find((x) => x.id === col.key); if (fa) dialogs.editFocus(fa); }}>Edit<span className="sr-only"> {col.label}</span></Button>}</div>
                <div className="map__colstats muted">
                  {col.goals.length > 0 ? <><span>Average</span><div className="map__avg"><ProgressBar value={avg} thin label={`Average progress of ${col.label}`} /></div><span className="mono">{avg}%</span></> : <span>Empty</span>}
                </div>
              </header>
              <div className="map__cards">
                {col.goals.length === 0 && <p className="map__empty muted">{byFocus ? 'No objectives in this area yet.' : 'No objectives.'}</p>}
                {col.goals.map((g) => {
                  const node = nodeById.get(g.id);
                  if (!node) return null;
                  const isDrag = g.id === dragId;
                  const m = isDrag ? null : marker(n);
                  if (!isDrag) n++;
                  return <Fragment key={g.id}>{m}<GoalCard node={node} dnd={dnd} accent={accent} /></Fragment>;
                })}
                {shown.length > 0 && marker(n)}
              </div>
              {byFocus && <Button size="sm" variant="ghost" className="map__add" disabled={!canAdd} title={!canAdd ? (archivedPlan ? 'This plan is archived' : 'You can’t add objectives') : undefined}
                onClick={() => dialogs.newGoal({ focusAreaId: col.key })}>+ Add objective<span className="sr-only"> to {col.label}</span></Button>}
            </section>
          );
        })}
        {byFocus && can['plan.manage'] && !archivedPlan && <button type="button" className="fa-add fa-add--col" onClick={() => dialogs.newFocus()}>+ Add focus area</button>}
      </div>
    </div>
  );
}
