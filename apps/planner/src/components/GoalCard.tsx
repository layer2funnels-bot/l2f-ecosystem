// Goal card for the Strategy map, plus the shared goal actions (menu, move, align, archive) that the map, tree and timeline all use.
import { createContext, useCallback, useContext, useMemo, useState, type DragEvent, type ReactNode } from 'react';
import type { Goal } from '../api/types.ts';
import { usePlanner } from '../state/PlannerContext.tsx';
import { useDialogs } from './Dialogs.tsx';
import { Avatar, Button, Chip, ProgressBar, SelectField, StatusBadge, cx } from '../ui/primitives.tsx';
import { Dialog, MenuButton, MenuItem } from '../ui/overlay.tsx';
import { MAX_DEPTH, ancestors, byPosition, descendantIds, moveProblem, type GoalNode } from '../lib/tree.ts';
import { expectedProgress, scheduleState } from '../lib/schedule.ts';
import { formatDate, formatNumber, plural } from '../lib/format.ts';

// ------------------------------------------------------------------ shared actions
interface MoveOptions { focusId: string | null; parentId: string | null; order?: string[] }
interface ActionsCtx {
  announce(text: string): void;
  move(goal: Goal, o: MoveOptions): Promise<boolean>;
  moveToFocus(goal: Goal): void;
  alignUnder(goal: Goal): void;
  archive(goal: Goal): Promise<void>;
}
const Ctx = createContext<ActionsCtx | null>(null);
export const useGoalMove = () => useActions().move;
const useActions = () => { const c = useContext(Ctx); if (!c) throw new Error('GoalActionsProvider missing'); return c; };

export function GoalActionsProvider({ announce, children }: { announce: (t: string) => void; children: ReactNode }) {
  const { plan, client, run, toast } = usePlanner();
  const dialogs = useDialogs();
  const [moving, setMoving] = useState<Goal | null>(null);
  const [aligning, setAligning] = useState<Goal | null>(null);
  const goals = plan?.goals ?? [];

  const move = useCallback(async (goal: Goal, o: MoveOptions) => {
    const problem = moveProblem(goals, goal.id, o.parentId);
    if (problem) { toast(problem, 'error'); announce(`Could not move: ${problem}`); return false; }
    const focusId = o.parentId ? null : (o.focusId ?? goal.focus_area_id);
    const order = o.order ?? [...goals.filter((g) => g.id !== goal.id && !g.archived_at && g.parent_goal_id === o.parentId && (o.parentId || g.focus_area_id === focusId)).sort(byPosition).map((g) => g.id), goal.id];
    const parent = o.parentId ? goals.find((g) => g.id === o.parentId) : null;
    const area = plan?.focus_areas.find((f) => f.id === (parent?.focus_area_id ?? focusId));
    const msg = parent ? `“${goal.title}” is now a sub-objective of “${parent.title}”.` : `Moved “${goal.title}” to ${area?.name ?? 'the focus area'}.`;
    const ok = await run(() => client.moveGoal(goal.id, focusId, o.parentId, order), { success: msg });
    announce(ok ? msg : `Could not move “${goal.title}”.`);
    return !!ok;
  }, [goals, plan, client, run, toast, announce]);

  const archive = useCallback(async (goal: Goal) => {
    const restoring = !!goal.archived_at;
    const yes = await dialogs.confirm(restoring
      ? { title: 'Restore this objective?', body: <p>“{goal.title}” will appear on the map and in lists again.</p>, confirmLabel: 'Restore objective' }
      : { title: 'Archive this objective?', body: <p>“{goal.title}” will be hidden from the map and lists, but keeps its history. You can restore it later.</p>, confirmLabel: 'Archive objective', danger: true });
    if (!yes) return;
    const ok = await run(() => client.setGoalArchived(goal.id, !restoring), { success: restoring ? `Restored “${goal.title}”.` : `Archived “${goal.title}”.` });
    if (ok) announce(restoring ? `Restored ${goal.title}` : `Archived ${goal.title}`);
  }, [dialogs, run, client, announce]);

  const value = useMemo<ActionsCtx>(() => ({ announce, move, archive, moveToFocus: setMoving, alignUnder: setAligning }), [announce, move, archive]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {moving && <MoveFocusDialog goal={moving} onClose={() => setMoving(null)} />}
      {aligning && <AlignDialog goal={aligning} onClose={() => setAligning(null)} />}
    </Ctx.Provider>
  );
}

function MoveFocusDialog({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  const { plan } = usePlanner();
  const { move } = useActions();
  const areas = (plan?.focus_areas ?? []).filter((f) => !f.archived_at || f.id === goal.focus_area_id);
  const [target, setTarget] = useState(goal.focus_area_id);
  const [busy, setBusy] = useState(false);
  const sub = !!goal.parent_goal_id;
  const unchanged = target === goal.focus_area_id && !sub;
  return (
    <Dialog open title="Move to focus area" onClose={onClose} description={goal.title}
      footer={<><Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" busy={busy} disabled={unchanged} onClick={async () => { setBusy(true); const ok = await move(goal, { focusId: target, parentId: null }); setBusy(false); if (ok) onClose(); }}>Move objective</Button></>}>
      <SelectField label="Focus area" value={target} onChange={(e) => setTarget(e.target.value)}
        hint={sub ? 'This sub-objective will become a top-level objective in the chosen area.' : 'Its sub-objectives move with it.'}>
        {areas.map((a) => <option key={a.id} value={a.id}>{a.name}{a.archived_at ? ' (archived)' : ''}</option>)}
      </SelectField>
    </Dialog>
  );
}

function AlignDialog({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  const { plan } = usePlanner();
  const { move } = useActions();
  const goals = plan?.goals ?? [];
  const options = useMemo(() => {
    const blocked = descendantIds(goals, goal.id);
    return goals
      .filter((g) => g.id !== goal.id && !blocked.has(g.id) && !g.archived_at && moveProblem(goals, goal.id, g.id) === null)
      .map((g) => ({ g, depth: ancestors(goals, g.id).length, area: plan?.focus_areas.find((f) => f.id === g.focus_area_id)?.name ?? '' }))
      .sort((a, b) => a.area.localeCompare(b.area) || a.g.title.localeCompare(b.g.title));
  }, [goals, goal.id, plan]);
  const [parent, setParent] = useState(goal.parent_goal_id ?? '');
  const [busy, setBusy] = useState(false);
  const own = plan?.focus_areas.find((f) => f.id === goal.focus_area_id)?.name ?? 'its focus area';
  return (
    <Dialog open title="Align under another objective" onClose={onClose} description={goal.title}
      footer={<><Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" busy={busy} disabled={parent === (goal.parent_goal_id ?? '')} onClick={async () => {
          setBusy(true); const ok = await move(goal, { focusId: goal.focus_area_id, parentId: parent || null }); setBusy(false); if (ok) onClose();
        }}>Align objective</Button></>}>
      <SelectField label="Parent objective" value={parent} onChange={(e) => setParent(e.target.value)}
        hint={`A sub-objective always shares its parent's focus area. Alignment goes up to ${MAX_DEPTH} levels. Choose the top option to make it a top-level goal.`}>
        <option value="">No parent: top level in {own}</option>
        {options.map(({ g, depth, area }) => <option key={g.id} value={g.id}>{`${'– '.repeat(depth)}${g.title} (${area})`}</option>)}
      </SelectField>
    </Dialog>
  );
}

// ------------------------------------------------------------------ menu
export function useGoalPermissions(goal: Goal) {
  const { can, plan } = usePlanner();
  const archivedPlan = !!plan?.plan.archived_at;
  const depth = ancestors(plan?.goals ?? [], goal.id).length + 1;
  const why = (ok: boolean, need: string) => (archivedPlan ? 'This plan is archived' : ok ? null : need);
  return {
    archivedPlan,
    edit: why(can['goal.edit'], 'You can’t edit goals') ?? (goal.archived_at ? 'Restore this goal to edit it' : null),
    create: archivedPlan ? 'This plan is archived' : goal.archived_at ? 'Restore this objective first' : !can['goal.create'] ? 'You can’t add goals' : depth >= MAX_DEPTH ? `Alignment is limited to ${MAX_DEPTH} levels` : null,
    archive: why(can['goal.archive'], 'You can’t archive goals'),
  };
}

function Item({ reason, onClick, children, danger }: { reason: string | null; onClick: () => void; children: ReactNode; danger?: boolean }) {
  return <MenuItem disabled={!!reason} danger={danger && !reason} onClick={onClick}><span title={reason ?? undefined}>{children}{reason && <span className="menu__why"> ({reason})</span>}</span></MenuItem>;
}

export function GoalMenu({ goal }: { goal: Goal }) {
  const dialogs = useDialogs();
  const { moveToFocus, alignUnder, archive } = useActions();
  const p = useGoalPermissions(goal);
  return (
    <MenuButton variant="ghost" size="sm" label={<><span aria-hidden="true">⋯</span><span className="sr-only">Actions for {goal.title}</span></>}>
      {() => <>
        <Item reason={p.edit} onClick={() => dialogs.editGoal(goal)}>Edit</Item>
        <Item reason={p.create} onClick={() => dialogs.newGoal({ parentId: goal.id })}>Add sub-objective</Item>
        <Item reason={p.edit} onClick={() => moveToFocus(goal)}>Move to focus area…</Item>
        <Item reason={p.edit} onClick={() => alignUnder(goal)}>Align under…</Item>
        <Item reason={p.archive} danger={!goal.archived_at} onClick={() => void archive(goal)}>{goal.archived_at ? 'Restore' : 'Archive'}</Item>
      </>}
    </MenuButton>
  );
}

// ------------------------------------------------------------------ card
export interface CardDnd {
  draggingId: string | null;
  subTargetId: string | null;
  onDragStart(e: DragEvent, goal: Goal): void;
  onDragEnd(): void;
}

export function DueText({ goal, today }: { goal: Goal; today: string }) {
  if (!goal.due_date) return <span className="muted">No due date</span>;
  const late = scheduleState(goal, today) === 'overdue';
  return <span className={cx('gcard__due', late && 'is-late')}>Due {formatDate(goal.due_date)}{late && <strong> · Overdue</strong>}</span>;
}

export function ScheduleNote({ goal, today }: { goal: Goal; today: string }) {
  const s = scheduleState(goal, today);
  if (s === 'overdue') return <Chip tone="bad">Overdue</Chip>;
  if (s === 'behind') return <Chip tone="warn">Behind</Chip>;
  return null;
}

export function GoalCard({ node, dnd, nested, accent }: { node: GoalNode; dnd?: CardDnd; nested?: boolean; accent?: (g: Goal) => string }) {
  const { openGoal, today } = usePlanner();
  const [open, setOpen] = useState(false);
  const g = node.goal;
  const exp = expectedProgress(g, today);
  const draggable = !!dnd && !nested && !g.archived_at;
  const kids = node.children;
  return (
    <article
      className={cx('gcard', nested && 'gcard--nested', g.archived_at && 'is-archived', dnd?.draggingId === g.id && 'is-dragging', draggable && 'is-draggable')}
      style={accent ? { ['--card-accent' as string]: accent(g) } : undefined}
      data-card-id={nested ? undefined : g.id} data-top-card={nested ? undefined : ''}
      draggable={draggable || undefined}
      onDragStart={draggable ? (e) => dnd.onDragStart(e, g) : undefined}
      onDragEnd={draggable ? () => dnd.onDragEnd() : undefined}
      onClick={(e) => { if (!(e.target as HTMLElement).closest('button, a, input, select, [role="menu"]')) openGoal(g.id); }}
    >
      {dnd?.subTargetId === g.id && <div className="gcard__drop" aria-hidden="true">Make sub-goal of “{g.title}”</div>}
      <div className="gcard__top">
        <span className="gcard__chips">
          <Chip tone="accent">{g.type_name ?? 'Objective'}</Chip>
          {g.archived_at && <Chip>Archived</Chip>}
        </span>
        <GoalMenu goal={g} />
      </div>
      <h3 className="gcard__title"><button type="button" className="gcard__open" onClick={() => openGoal(g.id)}>{g.title}</button></h3>
      <div className="gcard__meta">
        <span className="gcard__owner"><Avatar name={g.owner_name} size={24} /><span className="gcard__ownername">{g.owner_name ?? 'No owner'}</span></span>
        <StatusBadge status={g.status} />
      </div>
      <div className="gcard__progress">
        <ProgressBar value={g.progress} status={g.status} expected={exp} label={`Progress of ${g.title}`} thin />
        <span className="mono gcard__pct">{Math.round(Number(g.progress))}%</span>
        <ScheduleNote goal={g} today={today} />
      </div>
      <div className="gcard__row"><DueText goal={g} today={today} /></div>
      {g.measure && <div className="gcard__row muted" title={g.measure.name}>{g.measure.name}: <strong className="mono">{formatNumber(g.measure.current, g.measure.unit)}</strong> of {formatNumber(g.measure.target, g.measure.unit)}</div>}
      <div className="gcard__counts muted">
        <span>{plural(g.open_actions, 'open action')}</span>
        <span className={cx(g.open_risks > 0 && 'gcard__riskcount')}>{plural(g.open_risks, 'open risk')}</span>
      </div>
      {kids.length > 0 && (
        <>
          <button type="button" className="gcard__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
            <span aria-hidden="true">{open ? '▾' : '▸'}</span> {plural(kids.length, 'sub-goal')}
          </button>
          {open && <div className="gcard__kids">{kids.map((k) => <GoalCard key={k.goal.id} node={k} nested accent={accent} />)}</div>}
        </>
      )}
    </article>
  );
}
