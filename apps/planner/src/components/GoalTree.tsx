// Tree view of the alignment: one indented row per goal, with the same actions as a map card.
import { useMemo } from 'react';
import type { FocusArea, Goal } from '../api/types.ts';
import { usePlanner } from '../state/PlannerContext.tsx';
import { useDialogs } from './Dialogs.tsx';
import { GoalMenu, useGoalPermissions } from './GoalCard.tsx';
import { MenuButton, MenuItem } from '../ui/overlay.tsx';
import { Avatar, Button, Chip, ProgressBar, StatusBadge, cx } from '../ui/primitives.tsx';
import { flatten, type GoalNode } from '../lib/tree.ts';
import { SCHEDULE_LABEL, expectedProgress, focusTimeState, scheduleState } from '../lib/schedule.ts';
import { formatDate } from '../lib/format.ts';

export interface TreeGroup { key: string; label: string; color?: string; nodes: GoalNode[] }

function AddSub({ goal }: { goal: Goal }) {
  const dialogs = useDialogs();
  const p = useGoalPermissions(goal);
  const { openGoal } = usePlanner();
  return (
    <MenuButton variant="ghost" size="sm" label={<span aria-label={`Add to ${goal.title}`}>+</span>}>
      {() => <>
        <MenuItem disabled={!!p.create} hint={p.create ?? undefined} onClick={() => dialogs.newGoal({ parentId: goal.id })}>Sub-objective</MenuItem>
        <MenuItem onClick={() => openGoal(goal.id, 'measures')}>KPI (success measure)</MenuItem>
        <MenuItem onClick={() => openGoal(goal.id, 'actions')}>Task</MenuItem>
      </>}
    </MenuButton>
  );
}

const TIME_LABEL = { upcoming: 'Upcoming', current: 'Current', ended: 'Ended' } as const;

/** The header of one focus area in the list: colour, name, dates, how many objectives and how far along, with its own actions. */
function FocusBand({ grp, area, today, canManage, canAdd, canWork, addLabel, onEdit, onAdd, onWork }: {
  grp: TreeGroup; area?: FocusArea; today: string; canManage: boolean; canAdd: boolean; canWork: boolean; addLabel: string; onEdit: (a: FocusArea) => void; onAdd: (focusAreaId: string) => void; onWork: (focusAreaId: string) => void;
}) {
  const live = grp.nodes.filter((n) => !n.goal.archived_at);
  const wsum = live.reduce((s, n) => s + (n.goal.weight || 1), 0);   // weighted, like the plan and the Home roll-ups
  const avg = wsum ? Math.round(live.reduce((s, n) => s + Number(n.goal.progress) * (n.goal.weight || 1), 0) / wsum) : 0;
  const state = area ? focusTimeState(area, today) : null;
  return (
    <div className="fa-band">
      <div className="fa-band__main">
        <span className="fa-band__name">{grp.label}</span>
        {state && <Chip tone={state === 'ended' ? 'warn' : state === 'current' ? 'accent' : 'neutral'}>{TIME_LABEL[state]}</Chip>}
        {area && (area.start_date || area.end_date) && <span className="muted fa-band__dates">{formatDate(area.start_date, { year: true })} to {formatDate(area.end_date, { year: true })}</span>}
      </div>
      <div className="fa-band__stats muted">
        <span>{live.length === 1 ? '1 objective' : `${live.length} objectives`}</span>
        {live.length > 0 && <span className="fa-band__avg"><ProgressBar value={avg} thin label={`Average progress of ${grp.label}`} /><span className="mono">{avg}%</span></span>}
      </div>
      {area && (
        <div className="fa-band__actions">
          <Button size="sm" disabled={!canAdd} onClick={() => onAdd(area.id)}>+ {addLabel}<span className="sr-only"> to {grp.label}</span></Button>
          <Button size="sm" variant="ghost" disabled={live.length === 0 || !canWork} title={canWork ? undefined : 'You need permission to manage tasks'} onClick={() => onWork(area.id)}>Turn into work<span className="sr-only"> for {grp.label}</span></Button>
          <Button size="sm" variant="ghost" disabled={!canManage} title={canManage ? undefined : 'You need permission to manage this plan'} onClick={() => onEdit(area)}>Edit<span className="sr-only"> {grp.label}</span></Button>
        </div>)}
    </div>
  );
}
export function GoalTree({ groups, collapsed, onCollapsedChange, showHeaders }: {
  groups: TreeGroup[]; collapsed: Set<string>; onCollapsedChange: (next: Set<string>) => void; showHeaders: boolean;
}) {
  const { openGoal, today, plan, can } = usePlanner();
  const dialogs = useDialogs();
  const archived = !!plan?.plan.archived_at;
  const canManage = can['plan.manage'] && !archived;
  const canAdd = can['goal.create'] && !archived;
  const parents = useMemo(() => {
    const ids: string[] = [];
    const walk = (n: GoalNode) => { if (n.children.length) ids.push(n.goal.id); n.children.forEach(walk); };
    groups.forEach((g) => g.nodes.forEach(walk));
    return ids;
  }, [groups]);
  const toggle = (id: string) => { const n = new Set(collapsed); if (n.has(id)) n.delete(id); else n.add(id); onCollapsedChange(n); };

  return (
    <div className="stack">
      <div className="row">
        <Button size="sm" onClick={() => onCollapsedChange(new Set())} disabled={!parents.some((id) => collapsed.has(id))}>Expand all</Button>
        <Button size="sm" onClick={() => onCollapsedChange(new Set(parents))} disabled={parents.every((id) => collapsed.has(id))}>Collapse all</Button>
      </div>
      <div className="table-wrap">
        <table className="table gtree">
          <thead><tr><th scope="col">Objective</th><th scope="col">Kind</th><th scope="col">Owner</th><th scope="col">Status</th><th scope="col">Progress</th><th scope="col">Schedule</th><th scope="col">Due</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
          {groups.map((grp) => (
            <tbody key={grp.key}>
              {showHeaders && <tr className="gtree__group"><th scope="rowgroup" colSpan={8} style={grp.color ? { borderInlineStartColor: `var(--fa-${grp.color})` } : undefined}><FocusBand grp={grp} area={plan?.focus_areas.find((a) => a.id === grp.key)} today={today} canManage={canManage} canAdd={canAdd} canWork={can['action.manage'] && !archived} onEdit={(a) => dialogs.editFocus(a)} addLabel="Add objective" onAdd={(id) => dialogs.newGoal({ focusAreaId: id })} onWork={(id) => dialogs.turnIntoWork({ focusAreaId: id })} /></th></tr>}
              {grp.nodes.length === 0 && <tr><td colSpan={8} className="muted">Nothing here yet.{canAdd && grp.color ? ' Use "Add objective" above.' : ''}</td></tr>}
              {flatten(grp.nodes, collapsed).map((n) => {
                const g = n.goal, sched = scheduleState(g, today), late = sched === 'overdue';
                const has = n.children.length > 0, isCollapsed = collapsed.has(g.id);
                return (
                  <tr key={g.id} className={cx(g.archived_at && 'is-archived')}>
                    <td>
                      <div className="gtree__title" style={{ paddingInlineStart: n.depth * 22 }}>
                        {has
                          ? <button type="button" className="icon-btn gtree__toggle" aria-expanded={!isCollapsed} aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${g.title}`} onClick={() => toggle(g.id)}>{isCollapsed ? '▸' : '▾'}</button>
                          : <span className="gtree__spacer" aria-hidden="true" />}
                        <button type="button" className="gcard__open" onClick={() => openGoal(g.id)}>{g.title}</button>
                        {g.archived_at && <Chip>Archived</Chip>}
                      </div>
                    </td>
                    <td><Chip tone="accent">{g.type_name ?? 'Objective'}</Chip></td>
                    <td><span className="gcard__owner"><Avatar name={g.owner_name} size={24} /><span className="gcard__ownername">{g.owner_name ?? 'No owner'}</span></span></td>
                    <td><StatusBadge status={g.status} /></td>
                    <td><div className="gtree__progress"><ProgressBar value={g.progress} status={g.status} expected={expectedProgress(g, today)} thin label={`Progress of ${g.title}`} /><span className="mono">{Math.round(Number(g.progress))}%</span></div></td>
                    <td className={cx(late && 'gcard__due is-late')}>{SCHEDULE_LABEL[sched]}</td>
                    <td className={cx('mono', late && 'gcard__due is-late')}>{formatDate(g.due_date)}</td>
                    <td><div className="row gtree__actions"><AddSub goal={g} /><GoalMenu goal={g} /></div></td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  );
}
