// Alignment: how plans connect (a plan can sit under a bigger plan), and, for one plan, how its objectives connect.
// A left-to-right tree: click a box to open it; "Expand all" and "Collapse all" show or hide branches.
import { useMemo, useState, type ReactNode } from 'react';
import type { FocusArea, Goal, PlanSummary } from '../api/types.ts';
import { usePlanner } from '../state/PlannerContext.tsx';
import { Button, Checkbox, EmptyState, ProgressBar, Segmented, StatusBadge, Avatar, Chip, cx } from '../ui/primitives.tsx';
import { StatusBar } from '../ui/charts.tsx';
import { Icon } from '../ui/icons.tsx';
import { buildTree, type GoalNode } from '../lib/tree.ts';
import { TreeBranch } from '../components/TreeBranch.tsx';
import { percent, plural } from '../lib/format.ts';

type Mode = 'plans' | 'objectives';
interface PlanNode { plan: PlanSummary; children: PlanNode[] }

function buildPlanTree(plans: PlanSummary[]): PlanNode[] {
  const nodes = new Map(plans.map((p) => [p.id, { plan: p, children: [] as PlanNode[] }] as const));
  const roots: PlanNode[] = [];
  for (const p of [...plans].sort((a, b) => a.name.localeCompare(b.name))) {
    const n = nodes.get(p.id)!;
    const parent = p.parent_plan_id ? nodes.get(p.parent_plan_id) : undefined;
    if (parent) parent.children.push(n); else roots.push(n);
  }
  return roots;
}

export default function AlignmentPage() {
  const { plans, plan, selectPlan, navigate, openGoal } = usePlanner();
  const [mode, setMode] = useState<Mode>('plans');
  const [showUnaligned, setShowUnaligned] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(1);

  const live = useMemo(() => plans.filter((p) => !p.archived_at), [plans]);
  const roots = useMemo(() => buildPlanTree(live), [live]);
  const shownRoots = showUnaligned ? roots : roots.filter((r) => r.children.length > 0);

  const allIds = useMemo(() => {
    const ids: string[] = [];
    const walk = (n: PlanNode) => { if (n.children.length) ids.push(n.plan.id); n.children.forEach(walk); };
    roots.forEach(walk);
    if (plan) { ids.push(`root:${plan.plan.id}`); plan.focus_areas.forEach((f) => ids.push(`fa:${f.id}`)); plan.goals.forEach((g) => { if (g.child_count > 0) ids.push(`g:${g.id}`); }); }
    return ids;
  }, [roots, plan]);
  const toggle = (id: string) => setCollapsed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const openPlan = (p: PlanSummary) => { selectPlan(p.id); navigate('map', { plan: p.id }); };

  const planBox = (p: PlanSummary) => (
    <button type="button" className="az-card az-card--plan" onClick={() => openPlan(p)}>
      <span className="az-card__head"><Icon name="plans" size={18} /><strong>{p.name}</strong></span>
      <span className="az-card__prog"><ProgressBar value={p.progress} thin label={`${p.name} progress`} /><span className="mono">{percent(p.progress)}</span></span>
      <StatusBar counts={p.status_counts} />
      <span className="az-card__facts">
        <span>{plural(p.focus_area_count, 'focus area')}</span><span>{plural(p.goal_count, 'objective')}</span>
        <span className={cx(p.open_risks > 0 && 'az-risk')}>{plural(p.open_risks, 'open risk')}</span>
      </span>
      <span className="az-card__owner muted">{p.owner_name ? <><Avatar name={p.owner_name} size={22} /> {p.owner_name}</> : 'No owner'}</span>
    </button>
  );

  const renderPlan = (n: PlanNode): ReactNode => (
    <TreeBranch key={n.plan.id} id={n.plan.id} box={planBox(n.plan)} collapsed={collapsed.has(n.plan.id)} onToggle={toggle}>{n.children.map(renderPlan)}</TreeBranch>
  );

  const renderGoal = (n: GoalNode): ReactNode => (
    <TreeBranch key={n.goal.id} id={`g:${n.goal.id}`} collapsed={collapsed.has(`g:${n.goal.id}`)} onToggle={toggle}
      box={<button type="button" className="az-card az-card--goal" onClick={() => openGoal(n.goal.id)}>
        <span className="az-card__head"><strong>{n.goal.title}</strong></span>
        <span className="az-card__prog"><ProgressBar value={n.goal.progress} thin status={n.goal.status} label={`${n.goal.title} progress`} /><span className="mono">{percent(n.goal.progress)}</span></span>
        <span className="az-card__facts"><StatusBadge status={n.goal.status} /><span className="muted">{n.goal.type_name}</span></span>
        <span className="az-card__owner muted">{n.goal.owner_name ? <><Avatar name={n.goal.owner_name} size={22} /> {n.goal.owner_name}</> : 'No owner'}</span>
      </button>}>
      {n.children.map(renderGoal)}
    </TreeBranch>
  );

  const objectivesTree = () => {
    if (!plan) return null;
    const goals: Goal[] = plan.goals.filter((g) => !g.archived_at);
    const roots2 = buildTree(goals);
    const byFa = (fa: FocusArea) => roots2.filter((r) => r.goal.focus_area_id === fa.id);
    const rootId = `root:${plan.plan.id}`;
    return (
      <ul className="az-children az-children--root">
        <TreeBranch id={rootId} collapsed={collapsed.has(rootId)} onToggle={toggle}
          box={<div className="az-card az-card--plan az-card--static"><span className="az-card__head"><Icon name="plans" size={18} /><strong>{plan.plan.name}</strong></span>
            <span className="az-card__prog"><ProgressBar value={plan.plan.progress} thin label="Plan progress" /><span className="mono">{percent(plan.plan.progress)}</span></span></div>}>
          {plan.focus_areas.filter((f) => !f.archived_at).map((fa) => (
            <TreeBranch key={fa.id} id={`fa:${fa.id}`} collapsed={collapsed.has(`fa:${fa.id}`)} onToggle={toggle}
              box={<div className="az-card az-card--focus" style={{ ['--col-color' as string]: `var(--fa-${fa.color})` }}><span className="az-card__head"><Icon name="tree" size={18} /><strong>{fa.name}</strong></span>
                <span className="muted">{plural(byFa(fa).length, 'objective')}</span></div>}>
              {byFa(fa).map(renderGoal)}
            </TreeBranch>))}
        </TreeBranch>
      </ul>
    );
  };

  return (
    <div className="stack az">
      <header className="pagehead">
        <div>
          <h2 className="page-title">Alignment</h2>
          <p className="page-lede">{mode === 'plans' ? 'See how your plans connect. A plan can sit under a bigger plan. Click a box to open it.' : 'See how the objectives of one plan connect, from focus area down to sub-objectives. Click a box for details.'}</p>
        </div>
      </header>
      <div className="toolbar">
        <Segmented label="Show" value={mode} onChange={setMode} options={[{ value: 'plans', label: 'Plans' }, { value: 'objectives', label: 'Objectives' }]} />
        <Button size="sm" onClick={() => setCollapsed(new Set())}>Expand all</Button>
        <Button size="sm" onClick={() => setCollapsed(new Set(allIds))}>Collapse all</Button>
        {mode === 'plans' && <Checkbox label="Show plans with no parent plan" checked={showUnaligned} onChange={setShowUnaligned} />}
        <div className="toolbar__grow" />
        <span className="az-zoom" role="group" aria-label="Zoom">
          <Button size="sm" aria-label="Zoom out" disabled={zoom <= 0.6} onClick={() => setZoom(Math.max(0.6, +(zoom - 0.1).toFixed(1)))}>−</Button>
          <span className="mono">{Math.round(zoom * 100)}%</span>
          <Button size="sm" aria-label="Zoom in" disabled={zoom >= 1.4} onClick={() => setZoom(Math.min(1.4, +(zoom + 0.1).toFixed(1)))}>+</Button>
        </span>
      </div>
      {mode === 'objectives' && plan && <p className="muted">Showing objectives of <strong>{plan.plan.name}</strong>. Change plan with the picker above.</p>}
      {mode === 'plans' && shownRoots.length === 0 ? (
        <EmptyState title={live.length ? 'No plans are connected yet' : 'No plans yet'}>
          {live.length ? <>Open a plan, choose <strong>Settings</strong>, and pick a parent plan to connect it. Or tick “Show plans with no parent plan”.</> : 'Create a plan to start.'}
        </EmptyState>
      ) : (
        <div className="az-scroll"><div className="az-canvas" style={{ zoom }}>
          {mode === 'plans'
            ? <ul className="az-children az-children--root">{shownRoots.map(renderPlan)}</ul>
            : objectivesTree()}
        </div></div>)}
      {mode === 'plans' && <p className="muted az-note"><Chip>Tip</Chip> To connect a plan, open it, choose Settings, then “Part of plan”.</p>}
    </div>
  );
}
