// My goals: everything assigned to the signed-in person across all plans of the organization.
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import type { Action, Goal, MyWork } from '../api/types.ts';
import { usePlanner } from '../state/PlannerContext.tsx';
import { Button, Chip, EmptyState, ErrorState, PageLoading, PriorityBadge, ProgressBar, Segmented, StatusBadge } from '../ui/primitives.tsx';
import { formatDate, percent, plural } from '../lib/format.ts';
import { daysUntil, scheduleState, SCHEDULE_LABEL } from '../lib/schedule.ts';
import { STATUS_ORDER } from '../lib/status.ts';

type ActionStatus = Action['status'];
const ACTION_COLUMNS: { status: ActionStatus; label: string }[] = [{ status: 'todo', label: 'To do' }, { status: 'doing', label: 'In progress' }, { status: 'on_hold', label: 'On hold' }, { status: 'done', label: 'Done' }, { status: 'wont_do', label: 'Won’t do' }];
const byDue = (a: Action, b: Action) => Number(a.status === 'done') - Number(b.status === 'done') || (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31') || a.title.localeCompare(b.title);

export default function MyGoalsPage() {
  const { client, workspace, revision, can, run, today, selectPlan, planId, openGoal } = usePlanner();
  const [data, setData] = useState<MyWork | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<'goals' | 'actions'>('goals');
  const [layout, setLayout] = useState<'list' | 'board'>('list');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [weekOnly, setWeekOnly] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const wsId = workspace?.id;

  useEffect(() => {
    if (!wsId) return;
    let live = true;
    setFailed(false);
    client.myWork(wsId).then((d) => { if (live) setData(d); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [client, wsId, revision, attempt]);
  useEffect(() => { setData(null); }, [wsId]);

  const open = useCallback((g: { id: string; plan_id?: string }) => {
    if (g.plan_id && g.plan_id !== planId) selectPlan(g.plan_id);
    openGoal(g.id);
  }, [planId, selectPlan, openGoal]);

  const goals = data?.goals ?? [];
  const actions = useMemo(() => [...(data?.actions ?? [])].sort(byDue), [data]);
  const isOverdue = (a: Action) => a.status !== 'done' && !!a.due_date && a.due_date < today;
  const isSoon = (a: Action) => { if (a.status === 'done') return false; const d = daysUntil(a.due_date, today); return d !== null && d >= 0 && d < 7; };
  const shown = actions.filter((a) => (!overdueOnly || isOverdue(a)) && (!weekOnly || isSoon(a)));
  const openCount = actions.filter((a) => a.status !== 'done').length;
  const grouped = useMemo(() => STATUS_ORDER.map((s) => ({ status: s, goals: goals.filter((g) => g.status === s) })).filter((x) => x.goals.length), [goals]);

  const setActionStatus = (a: Action, status: ActionStatus) =>
    run(() => client.saveAction(a.goal_id, a.id, { status }), { success: status === 'done' ? `“${a.title}” marked done.` : `“${a.title}” moved to ${ACTION_COLUMNS.find((c) => c.status === status)!.label.toLowerCase()}.` });

  const tabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const next = tab === 'goals' ? 'actions' : 'goals'; setTab(next);
    document.getElementById(`mine-tab-${next}`)?.focus();
  };

  if (!workspace) return null;
  if (failed && !data) return <ErrorState title="Your objectives could not be loaded" onRetry={() => setAttempt((n) => n + 1)}>Check your connection and try again.</ErrorState>;
  if (!data) return <PageLoading label="Loading your objectives" />;

  const nothing = goals.length === 0 && actions.length === 0;
  const manageTitle = can['action.manage'] ? undefined : 'You don’t have permission to change actions.';

  return (
    <div className="stack mine">
      <div>
        <h2 className="page-title">My objectives</h2>
        <p className="muted">Everything assigned to you in {workspace.name}, across all of its plans.</p>
      </div>
      {nothing ? (
        <EmptyState title={`Nothing is assigned to you in ${workspace.name}`}>When someone makes you the owner of a objective, or assigns you an action, it appears here.</EmptyState>
      ) : (
        <>
          <div className="tabs" role="tablist" aria-label="My work">
            {(['goals', 'actions'] as const).map((t) => (
              <button key={t} id={`mine-tab-${t}`} type="button" role="tab" className="tabs__tab" aria-selected={tab === t} aria-controls={`mine-panel-${t}`} tabIndex={tab === t ? 0 : -1}
                onClick={() => setTab(t)} onKeyDown={tabKey}>{t === 'goals' ? 'Objectives' : 'Actions'} <span className="chip">{t === 'goals' ? goals.length : actions.length}</span></button>))}
          </div>

          {tab === 'goals' && (
            <div id="mine-panel-goals" role="tabpanel" aria-labelledby="mine-tab-goals" className="stack">
              {goals.length === 0 ? <EmptyState title="You don’t own any objectives yet">Objectives you own appear here, grouped by status.</EmptyState> : grouped.map(({ status, goals: list }) => (
                <section key={status} className="stack" aria-labelledby={`mine-grp-${status}`}>
                  <h3 id={`mine-grp-${status}`} className="mine-group"><StatusBadge status={status} /> <span className="muted">{plural(list.length, 'goal')}</span></h3>
                  <ul className="mine-list">
                    {list.map((g) => <GoalItem key={g.id} g={g} today={today} canPost={can['update.post']} onOpen={() => open(g)} />)}
                  </ul>
                </section>))}
            </div>)}

          {tab === 'actions' && (
            <div id="mine-panel-actions" role="tabpanel" aria-labelledby="mine-tab-actions" className="stack">
              <div className="row">
                <Segmented label="Layout" value={layout} onChange={setLayout} options={[{ value: 'list', label: 'List' }, { value: 'board', label: 'Board' }]} />
                <Button size="sm" aria-pressed={overdueOnly} className={overdueOnly ? 'is-active' : undefined} onClick={() => setOverdueOnly(!overdueOnly)}>Overdue</Button>
                <Button size="sm" aria-pressed={weekOnly} className={weekOnly ? 'is-active' : undefined} title="Due in the next 7 days" onClick={() => setWeekOnly(!weekOnly)}>Due this week</Button>
                <span className="muted" role="status" aria-live="polite">{openCount} open · showing {shown.length} of {actions.length}</span>
                {!can['action.manage'] && <span className="muted">You can see your actions but not change them.</span>}
              </div>
              {actions.length === 0 ? <EmptyState title="You have no actions">Actions assigned to you appear here.</EmptyState>
                : shown.length === 0 ? <EmptyState title="No actions match" action={<Button onClick={() => { setOverdueOnly(false); setWeekOnly(false); }}>Show all actions</Button>}>Nothing is overdue or due this week with these filters.</EmptyState>
                : layout === 'list' ? (
                  <ul className="mine-list">
                    {shown.map((a) => <ActionItem key={a.id} a={a} overdue={isOverdue(a)} soon={isSoon(a)} disabled={!can['action.manage']} title={manageTitle} onStatus={(s) => void setActionStatus(a, s)} onOpen={() => open({ id: a.goal_id, plan_id: a.plan_id })} />)}
                  </ul>
                ) : (
                  <div className="board">
                    {ACTION_COLUMNS.map((c) => {
                      const col = shown.filter((a) => a.status === c.status);
                      return (
                        <section key={c.status} className="board__col" aria-labelledby={`board-${c.status}`}>
                          <h3 id={`board-${c.status}`} className="board__head">{c.label} <span className="chip">{col.length}</span></h3>
                          <ul className="mine-list">
                            {col.map((a) => <ActionItem key={a.id} a={a} compact overdue={isOverdue(a)} soon={isSoon(a)} disabled={!can['action.manage']} title={manageTitle} onStatus={(s) => void setActionStatus(a, s)} onOpen={() => open({ id: a.goal_id, plan_id: a.plan_id })} />)}
                          </ul>
                          {col.length === 0 && <p className="muted">Nothing here.</p>}
                        </section>);
                    })}
                  </div>)}
            </div>)}
        </>)}
    </div>
  );
}

function GoalItem({ g, today, canPost, onOpen }: { g: Goal; today: string; canPost: boolean; onOpen(): void }) {
  const state = scheduleState(g, today);
  return (
    <li className="mine-item">
      <div className="mine-item__main">
        <button type="button" className="link-btn mine-item__title" onClick={onOpen}>{g.title}</button>
        <span className="muted">{g.plan_name ?? 'Plan'}</span>
      </div>
      <div className="mine-item__prog"><ProgressBar value={g.progress} status={g.status} thin label={`Progress of ${g.title}`} /><span className="mono">{percent(g.progress)}</span></div>
      <div className="mine-item__meta">
        <span className={state === 'overdue' ? 'goals-overdue' : undefined}>Due {formatDate(g.due_date)}</span>
        <Chip tone={state === 'overdue' ? 'bad' : state === 'behind' ? 'warn' : undefined}>{SCHEDULE_LABEL[state]}</Chip>
      </div>
      <Button size="sm" onClick={onOpen} disabled={!canPost} title={canPost ? 'Opens the objective so you can post an update' : 'You don’t have permission to post updates.'}>Post update</Button>
    </li>
  );
}

function ActionItem({ a, overdue, soon, disabled, title, compact, onStatus, onOpen }: {
  a: Action; overdue: boolean; soon: boolean; disabled: boolean; title?: string; compact?: boolean; onStatus(s: ActionStatus): void; onOpen(): void;
}) {
  const done = a.status === 'done';
  return (
    <li className={compact ? 'mine-item mine-item--card' : 'mine-item'}>
      <label className="check mine-item__check" title={title}>
        <input type="checkbox" checked={done} disabled={disabled} aria-label={`Mark “${a.title}” ${done ? 'not done' : 'done'}`} onChange={(e) => onStatus(e.target.checked ? 'done' : 'todo')} />
      </label>
      <div className="mine-item__main">
        <span className={done ? 'mine-item__done' : undefined}>{a.title}</span>
        <span className="muted"><button type="button" className="link-btn" onClick={onOpen}>{a.goal_title ?? 'Objective'}</button> · {a.plan_name ?? 'Plan'}</span>
      </div>
      <div className="mine-item__meta">
        <PriorityBadge priority={a.priority} />
        <span className={overdue ? 'goals-overdue' : undefined}>{a.due_date ? `Due ${formatDate(a.due_date)}` : 'No due date'}</span>
        {overdue && <Chip tone="bad">Overdue</Chip>}
        {!overdue && soon && <Chip tone="warn">Due soon</Chip>}
      </div>
      <div className="mine-item__ctl">
        <label className="sr-only" htmlFor={`as-${a.id}`}>Status of {a.title}</label>
        <select id={`as-${a.id}`} className="input goals-status" value={a.status} disabled={disabled} title={title} onChange={(e) => onStatus(e.target.value as ActionStatus)}>
          {ACTION_COLUMNS.map((c) => <option key={c.status} value={c.status}>{c.label}</option>)}
        </select>
        {compact && !disabled && a.status !== 'done' && <Button size="sm" onClick={() => onStatus(a.status === 'todo' ? 'doing' : 'done')}>{a.status === 'todo' ? 'Start' : 'Done'}</Button>}
      </div>
    </li>
  );
}
