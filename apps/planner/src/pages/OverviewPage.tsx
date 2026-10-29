import { useEffect, useMemo, useState } from 'react';
import type { FocusArea, Goal, MyWork, Status } from '../api/types.ts';
import { usePlanner } from '../state/PlannerContext.tsx';
import { buildHash } from '../state/route.ts';
import { Button, Card, Chip, EmptyState, Section, Skeleton } from '../ui/primitives.tsx';
import { Ring, StatusBar, StatusLegend } from '../ui/charts.tsx';
import { daysBetween, nextUpdateDue, reviewState, scheduleState } from '../lib/schedule.ts';
import { summarise } from '../lib/tree.ts';
import { STATUS_META } from '../lib/status.ts';
import { formatDate, plural, relativeDay } from '../lib/format.ts';

const STALE_DAYS = 30;

interface Attention { goal: Goal; reasons: { key: string; label: string; tone: 'bad' | 'warn' | 'neutral' }[]; score: number }

function attentionFor(goals: Goal[], today: string): Attention[] {
  const out: Attention[] = [];
  for (const goal of goals) {
    if (goal.archived_at || goal.status === 'completed') continue;
    const reasons: Attention['reasons'] = [];
    let score = 0;
    const sched = scheduleState(goal, today);
    if (sched === 'overdue') { reasons.push({ key: 'overdue', label: `Overdue by ${plural(daysBetween(goal.due_date!, today), 'day')}`, tone: 'bad' }); score += 40; }
    if (goal.status === 'off_track') { reasons.push({ key: 'off', label: 'Off track', tone: 'bad' }); score += 30; }
    else if (goal.status === 'at_risk') { reasons.push({ key: 'risk', label: 'At risk', tone: 'warn' }); score += 20; }
    if (goal.status !== 'on_hold') {
      const last = (goal.last_update_at ?? goal.created_at).slice(0, 10);
      const age = daysBetween(last, today);
      if (age >= STALE_DAYS) { reasons.push({ key: 'stale', label: goal.last_update_at ? `No update in ${age} days` : 'Never updated', tone: 'neutral' }); score += 8; }
    }
    const due = nextUpdateDue(goal);
    if (due && due < today && goal.status !== 'on_hold') { reasons.push({ key: 'cadence', label: `Update was due ${plural(daysBetween(due, today), 'day')} ago`, tone: 'warn' }); score += 10; }
    if (!goal.owner_id) { reasons.push({ key: 'owner', label: 'No owner', tone: 'neutral' }); score += 6; }
    if (reasons.length) out.push({ goal, reasons, score });
  }
  return out.sort((a, b) => b.score - a.score || (a.goal.due_date ?? '9999').localeCompare(b.goal.due_date ?? '9999'));
}

function focusRollup(fa: FocusArea, goals: Goal[]) {
  const live = goals.filter((g) => g.focus_area_id === fa.id && !g.archived_at);
  const top = live.filter((g) => !g.parent_goal_id || !live.some((p) => p.id === g.parent_goal_id));
  const weight = top.reduce((n, g) => n + (g.weight || 1), 0);
  const progress = weight ? top.reduce((n, g) => n + Number(g.progress) * (g.weight || 1), 0) / weight : 0;
  const counts: Partial<Record<Status, number>> = {};
  for (const g of live) counts[g.status] = (counts[g.status] ?? 0) + 1;
  return { progress, total: live.length, counts };
}

export default function OverviewPage() {
  const { plan, planId, today, can, client, workspace, openGoal, revision } = usePlanner();
  const [work, setWork] = useState<MyWork | null>(null);
  const [workError, setWorkError] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const wsId = workspace?.id;

  useEffect(() => {
    if (!wsId) return;
    let live = true;
    setWorkError(false);
    client.myWork(wsId).then((w) => { if (live) setWork(w); }).catch(() => { if (live) { setWork(null); setWorkError(true); } });
    return () => { live = false; };
  }, [client, wsId, revision]);

  const goals = plan?.goals;
  const sum = useMemo(() => summarise(goals ?? [], today), [goals, today]);
  const attention = useMemo(() => attentionFor(goals ?? [], today), [goals, today]);
  if (!plan || !planId) return null;

  const { plan: p, values, focus_areas: allFocus, reviews } = plan;
  const focusAreas = allFocus.filter((f) => !f.archived_at);
  const archived = !!p.archived_at;
  const link = (page: Parameters<typeof buildHash>[0]) => buildHash(page, { plan: planId });
  const scheduled = reviews.filter((r) => r.status === 'scheduled').sort((a, b) => a.due_on.localeCompare(b.due_on));
  const nextReview = scheduled[0] ?? null;
  const nextState = nextReview ? reviewState(nextReview.due_on, today) : null;
  const shown = showAll ? attention : attention.slice(0, 8);
  const myGoals = work ? work.goals.filter((g) => !g.archived_at && g.status !== 'completed').length : null;
  const myActions = work ? work.actions.filter((a) => a.status !== 'done' && !a.archived_at).length : null;

  const checklist = [
    { key: 'vision', done: !!p.vision?.trim(), label: 'Write your vision', help: 'One or two sentences on what success looks like.', page: 'settings' as const, needs: can['plan.manage'] },
    { key: 'values', done: values.length > 0, label: 'Add your values', help: 'The principles that guide decisions.', page: 'settings' as const, needs: can['plan.manage'] },
    { key: 'focus', done: focusAreas.length > 0, label: 'Set up focus areas', help: 'The few themes your goals are grouped under.', page: 'settings' as const, needs: can['plan.manage'] },
    { key: 'goals', done: sum.total > 0, label: 'Add your first goals', help: 'Objectives, results and initiatives that make the vision real.', page: 'goals' as const, needs: can['goal.create'] },
    { key: 'review', done: scheduled.length > 0 || reviews.some((r) => r.status === 'held'), label: 'Schedule a review', help: 'A date to check progress together.', page: 'reviews' as const, needs: can['review.manage'] },
  ];
  const doneCount = checklist.filter((c) => c.done).length;
  const showChecklist = doneCount < checklist.length || sum.total < 3;

  const tiles: { label: string; value: number; tone?: string; status?: Status; hint?: string }[] = [
    { label: 'Objectives', value: sum.total },
    { label: 'On track', value: sum.byStatus.on_track, status: 'on_track' },
    { label: 'At risk', value: sum.byStatus.at_risk, status: 'at_risk' },
    { label: 'Off track', value: sum.byStatus.off_track, status: 'off_track' },
    { label: 'Overdue', value: sum.overdue, tone: sum.overdue ? 'bad' : undefined, hint: 'Past their due date and not completed' },
    { label: 'Without owner', value: sum.unowned, tone: sum.unowned ? 'warn' : undefined },
  ];

  return (
    <div className="stack ov">
      <Card className="ov-hero">
        <div className="ov-hero__text">
          <div className="row">
            <h2 className="page-title">{p.name}</h2>
            {archived && <Chip tone="warn">Archived · read-only</Chip>}
          </div>
          {p.vision?.trim()
            ? <p className="ov-vision">{p.vision}</p>
            : <p className="muted">No vision written yet.{can['plan.manage'] && !archived && <> <a href={link('settings')}>Write the vision</a>.</>}</p>}
          <p className="muted ov-period">
            {p.period_start || p.period_end ? `${formatDate(p.period_start, { year: true })} to ${formatDate(p.period_end, { year: true })}` : 'No period set'}
            {p.description ? ` · ${p.description}` : ''}
          </p>
        </div>
        <div className="ov-hero__ring">
          <Ring value={Number(p.progress)} size={112} label="Overall progress" />
          <span className="muted">Overall progress</span>
        </div>
      </Card>

      <Section title="Plan health" id="ov-health">
        <ul className="ov-tiles" aria-label="Goal counts">
          {tiles.map((t) => (
            <li key={t.label} className={`ov-tile${t.tone ? ` ov-tile--${t.tone}` : ''}`} title={t.hint}>
              <span className="ov-tile__value">{t.value}</span>
              <span className="ov-tile__label">{t.status && <span aria-hidden="true">{STATUS_META[t.status].glyph} </span>}{t.label}</span>
            </li>
          ))}
        </ul>
        <Card>
          <div className="stack">
            <StatusBar counts={sum.byStatus} total={sum.total} />
            <StatusLegend counts={sum.byStatus} />
          </div>
        </Card>
      </Section>

      {showChecklist && (
        <Section title="Getting started" id="ov-start" actions={<span className="muted">{doneCount} of {checklist.length} done</span>}>
          <Card>
            <ol className="ov-check">
              {checklist.map((c) => (
                <li key={c.key} className={c.done ? 'is-done' : undefined}>
                  <span className="ov-check__mark" aria-hidden="true">{c.done ? '✓' : '○'}</span>
                  <div className="ov-check__body">
                    <strong>{c.label}</strong><span className="sr-only">{c.done ? ' (done)' : ' (to do)'}</span>
                    <span className="muted"> {c.help}</span>
                  </div>
                  {!c.done && (c.needs && !archived
                    ? <a className="btn btn--secondary btn--sm" href={link(c.page)}>Go</a>
                    : <span className="muted ov-check__why">{archived ? 'Plan is archived' : 'Needs a plan manager'}</span>)}
                </li>
              ))}
            </ol>
          </Card>
        </Section>
      )}

      <div className="layout-rail">
        <div className="stack">
          <Section title="Needs attention" id="ov-attn" actions={attention.length > 8 && <Button size="sm" variant="ghost" onClick={() => setShowAll(!showAll)} aria-expanded={showAll}>{showAll ? 'Show fewer' : `Show all ${attention.length}`}</Button>}>
            {attention.length === 0 ? (
              <EmptyState title={sum.total ? 'Nothing needs attention' : 'No objectives yet'}>
                {sum.total ? 'Every open objective has an owner, a recent update and is not overdue or off track.' : 'Add objectives to see which ones need a look.'}
              </EmptyState>
            ) : (
              <Card className="ov-list-card">
                <ul className="ov-attn">
                  {shown.map(({ goal, reasons }) => (
                    <li key={goal.id}>
                      <button type="button" className="ov-attn__row" onClick={() => openGoal(goal.id)}>
                        <span className="ov-attn__title">{goal.title}</span>
                        <span className="ov-attn__owner muted">{goal.owner_name ?? '—'}</span>
                        <span className="ov-attn__chips">{reasons.map((r) => <Chip key={r.key} tone={r.tone === 'neutral' ? undefined : r.tone}>{r.label}</Chip>)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </Section>

          <Section title="Focus areas" id="ov-focus">
            {focusAreas.length === 0 ? (
              <EmptyState title="No focus areas yet" action={can['plan.manage'] && !archived ? <a className="btn btn--primary" href={link('settings')}>Add focus areas</a> : undefined}>
                Focus areas group goals into a few themes.
              </EmptyState>
            ) : (
              <Card className="ov-list-card">
                <ul className="ov-focus">
                  {focusAreas.map((fa) => {
                    const r = focusRollup(fa, plan.goals);
                    return (
                      <li key={fa.id} className="ov-focus__row">
                        <span className="ov-focus__swatch" style={{ background: `var(--fa-${fa.color})` }} aria-hidden="true" />
                        <div className="ov-focus__main">
                          <a href={buildHash('map', { plan: planId, focus: fa.id })}>{fa.name}</a>
                          <span className="muted"> · {plural(r.total, 'goal')}</span>
                          <StatusBar counts={r.counts} total={r.total} />
                        </div>
                        <span className="ov-focus__pct mono" aria-label={`Average progress ${Math.round(r.progress)} percent`}>{Math.round(r.progress)}%</span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}
          </Section>
        </div>

        <div className="stack">
          <Section title="Reviews" id="ov-rev">
            <Card>
              <div className="stack">
                {nextReview ? (
                  <div>
                    <strong>{nextReview.title}</strong>
                    <p>
                      {formatDate(nextReview.due_on, { year: true })} · {relativeDay(nextReview.due_on, today)}{' '}
                      {nextState === 'overdue' && <Chip tone="bad">Overdue</Chip>}
                      {nextState === 'due_soon' && <Chip tone="warn">Due soon</Chip>}
                    </p>
                  </div>
                ) : <p className="muted">No review is scheduled.</p>}
                <a className="btn btn--secondary" href={link('reviews')}>Open reviews</a>
              </div>
            </Card>
          </Section>

          <Section title="My work" id="ov-mine">
            <Card>
              {workError ? <p className="muted">Your work could not be loaded right now.</p>
                : work === null ? <Skeleton lines={2} />
                : (
                  <div className="stack">
                    <dl className="ov-mine">
                      <div><dt>My objectives</dt><dd>{myGoals}</dd></div>
                      <div><dt>Open actions</dt><dd>{myActions}</dd></div>
                    </dl>
                    <p className="muted">Across all plans in {workspace?.name}.</p>
                    <a className="btn btn--secondary" href={link('mine')}>Go to my objectives</a>
                  </div>
                )}
            </Card>
          </Section>
        </div>
      </div>
    </div>
  );
}
