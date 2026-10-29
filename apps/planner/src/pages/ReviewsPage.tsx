import { useEffect, useMemo, useRef, useState } from 'react';
import type { Cadence, Goal, PlanDetail, Review, ReviewSnapshot, Status } from '../api/types.ts';
import { usePlanner } from '../state/PlannerContext.tsx';
import { buildHash } from '../state/route.ts';
import { useDialogs } from '../components/Dialogs.tsx';
import { Button, Card, Checkbox, Chip, EmptyState, ErrorState, Section, Skeleton, StatusBadge, TextArea, TextField } from '../ui/primitives.tsx';
import { Dialog } from '../ui/overlay.tsx';
import { Ring, StatusBar, StatusLegend } from '../ui/charts.tsx';
import { reviewState } from '../lib/schedule.ts';
import { summarise } from '../lib/tree.ts';
import { CADENCE_LABEL } from '../lib/status.ts';
import { formatDate, formatDateTime, plural, relativeDay } from '../lib/format.ts';
import { addDays, addMonths } from '../lib/templates.ts';

const stepFor = (cadence: Cadence, from: string): string | null =>
  cadence === 'weekly' ? addDays(from, 7) : cadence === 'fortnightly' ? addDays(from, 14) : cadence === 'monthly' ? addMonths(from, 1) : cadence === 'quarterly' ? addMonths(from, 3) : null;

function suggestion(reviews: Review[], cadence: Cadence, today: string): { title: string; due: string } | null {
  const dates = reviews.filter((r) => r.status === 'scheduled').map((r) => r.due_on);
  const lastHeld = reviews.filter((r) => r.status === 'held').map((r) => (r.held_at ?? r.due_on).slice(0, 10));
  const anchor = [...dates, ...lastHeld, today].sort().pop()!;
  const due = stepFor(cadence, anchor);
  if (!due) return null;
  return { title: `${CADENCE_LABEL[cadence].replace('Every two weeks', 'Fortnightly')} review - ${formatDate(due)}`, due };
}

/** Same arithmetic as the snapshot taken when a review is held, so "then" and "now" compare like with like. */
function liveFocusRollup(detail: PlanDetail) {
  const out = new Map<string, { name: string; goals: number; progress: number }>();
  for (const f of detail.focus_areas.filter((x) => !x.archived_at)) {
    const top = detail.goals.filter((g) => g.focus_area_id === f.id && !g.parent_goal_id && !g.archived_at);
    const w = top.reduce((n, g) => n + g.weight, 0);
    out.set(f.id, { name: f.name, goals: top.length, progress: w ? Math.round((top.reduce((n, g) => n + Number(g.progress) * g.weight, 0) / w) * 10) / 10 : 0 });
  }
  return out;
}

function Delta({ from, to, unit = 'points' }: { from: number; to: number; unit?: string }) {
  const d = Math.round((to - from) * 10) / 10;
  const dir = d > 0 ? 'up' : d < 0 ? 'down' : 'flat';
  return (
    <span className={`rv-delta rv-delta--${dir}`}>
      <span aria-hidden="true">{dir === 'up' ? '↑' : dir === 'down' ? '↓' : '→'}</span>{' '}
      {dir === 'flat' ? 'no change' : `${dir} ${Math.abs(d)} ${unit}`}
    </span>
  );
}

export default function ReviewsPage() {
  const { plan, planId, can, today, route, navigate, run, client, members } = usePlanner();
  const dialogs = useDialogs();
  const [schedule, setSchedule] = useState<{ review: Review | null; title: string; due: string } | null>(null);
  const [hold, setHold] = useState<Review | null>(null);
  const [detail, setDetail] = useState<Review | null>(null);
  const handledNew = useRef(false);

  const archived = !!plan?.plan.archived_at;
  const manage = can['review.manage'] && !archived;
  const reviews = plan?.reviews;
  const cadence = plan?.plan.review_cadence ?? 'none';
  const next = useMemo(() => suggestion(reviews ?? [], cadence, today), [reviews, cadence, today]);

  useEffect(() => {
    if (route.params.new !== '1' || !planId || !plan) return;
    if (!handledNew.current) {
      handledNew.current = true;
      if (manage) setSchedule({ review: null, title: next?.title ?? 'Review', due: next?.due ?? today });
    }
    navigate('reviews', { plan: planId });
  }, [route.params.new, planId, plan, manage, next, today, navigate]);
  useEffect(() => { if (route.params.new !== '1') handledNew.current = false; }, [route.params.new]);

  if (!plan || !planId) return null;
  const all = plan.reviews;
  const open = all.filter((r) => r.status === 'scheduled').sort((a, b) => a.due_on.localeCompare(b.due_on));
  const overdue = open.filter((r) => reviewState(r.due_on, today) === 'overdue');
  const upcoming = open.filter((r) => reviewState(r.due_on, today) !== 'overdue');
  const history = all.filter((r) => r.status !== 'scheduled').sort((a, b) => (b.held_at ?? b.due_on).localeCompare(a.held_at ?? a.due_on));
  const lastHeld = history.find((r) => r.status === 'held');
  const whyNot = archived ? 'This plan is archived, so reviews are read-only.' : 'Only people who manage reviews can schedule or hold them.';
  const who = (id: string | null) => (id ? members.find((m) => m.user_id === id)?.name ?? 'a former member' : 'unknown');

  const skip = async (r: Review) => {
    const ok = await dialogs.confirm({ title: 'Skip this review?', body: <p>"{r.title}" will move to the history as skipped. This does not take a snapshot.</p>, confirmLabel: 'Skip review' });
    if (ok) await run(() => client.saveReview(planId, r.id, { status: 'skipped' }), { success: 'Review skipped.' });
  };

  const row = (r: Review) => {
    const st = reviewState(r.due_on, today);
    return (
      <li key={r.id} className="rv-row">
        <div className="rv-row__main">
          <strong>{r.title}</strong>
          <span className="muted">{formatDate(r.due_on, { year: true })} · {relativeDay(r.due_on, today)}</span>
        </div>
        <div className="rv-row__chips">{st === 'overdue' ? <Chip tone="bad">Overdue</Chip> : st === 'due_soon' ? <Chip tone="warn">Due soon</Chip> : <Chip>Upcoming</Chip>}</div>
        {manage && (
          <div className="rv-row__actions">
            <Button size="sm" variant="primary" onClick={() => setHold(r)}>Hold review</Button>
            <Button size="sm" onClick={() => setSchedule({ review: r, title: r.title, due: r.due_on })}>Reschedule</Button>
            <Button size="sm" variant="ghost" onClick={() => skip(r)}>Skip</Button>
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="stack">
      <div className="row row--between">
        <div>
          <h2 className="page-title">Reviews</h2>
          <p className="page-lede">Regular check-ins where the team looks at progress together. Holding a review freezes a snapshot so you can see later what changed.</p>
        </div>
        <Button variant="primary" disabled={!manage} title={manage ? undefined : whyNot} onClick={() => setSchedule({ review: null, title: next?.title ?? 'Review', due: next?.due ?? today })}>Schedule a review</Button>
      </div>
      {!manage && <p className="muted" role="note">{whyNot} You can still read every review.</p>}

      <Card>
        <div className="rv-rhythm">
          <div>
            <h2 className="section__title">Review rhythm</h2>
            <p>{cadence === 'none' ? 'No regular rhythm is set for this plan.' : `${CADENCE_LABEL[cadence]}.`}
              {can['plan.manage'] && !archived && <> <a href={buildHash('settings', { plan: planId })}>Change rhythm</a></>}</p>
            <p className="muted">{lastHeld ? `Last held ${formatDate((lastHeld.held_at ?? lastHeld.due_on).slice(0, 10), { year: true })}.` : 'No review has been held yet.'} {open[0] ? `Next due ${formatDate(open[0].due_on, { year: true })}.` : 'Nothing is scheduled.'}</p>
          </div>
          {next && <Button disabled={!manage} title={manage ? undefined : whyNot} onClick={() => setSchedule({ review: null, ...next })}>Schedule next: {formatDate(next.due, { year: true })}</Button>}
        </div>
      </Card>

      <Section title={`Overdue (${overdue.length})`} id="rv-over">
        {overdue.length ? <Card className="rv-card"><ul className="rv-list">{overdue.map(row)}</ul></Card> : <p className="muted">No overdue reviews.</p>}
      </Section>
      <Section title={`Upcoming (${upcoming.length})`} id="rv-up">
        {upcoming.length ? <Card className="rv-card"><ul className="rv-list">{upcoming.map(row)}</ul></Card>
          : <EmptyState title="No upcoming reviews" action={manage ? <Button variant="primary" onClick={() => setSchedule({ review: null, title: next?.title ?? 'Review', due: next?.due ?? today })}>Schedule a review</Button> : undefined}>
            Put the next check-in in the calendar so progress is looked at on a regular beat.
          </EmptyState>}
      </Section>
      <Section title={`History (${history.length})`} id="rv-hist">
        {history.length === 0 ? <p className="muted">Held reviews appear here with the snapshot they froze.</p> : (
          <Card className="rv-card">
            <ul className="rv-list">
              {history.map((r) => (
                <li key={r.id} className="rv-row">
                  <div className="rv-row__main">
                    <strong>{r.title}</strong>
                    {r.status === 'held'
                      ? <span className="muted">Held {formatDateTime(r.held_at)} by {who(r.held_by)}</span>
                      : <span className="muted">Was due {formatDate(r.due_on, { year: true })}</span>}
                    {r.summary && <span className="rv-row__summary">{r.summary}</span>}
                  </div>
                  <div className="rv-row__chips">{r.status === 'held' ? <Chip tone="accent">Held</Chip> : <Chip>Skipped</Chip>}</div>
                  <div className="rv-row__actions">{r.status === 'held' && <Button size="sm" onClick={() => setDetail(r)}>View what changed</Button>}</div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </Section>

      {schedule && <ScheduleDialog init={schedule} today={today} onClose={() => setSchedule(null)} onSave={async (title, due) => {
        const data = { title, due_on: due };
        const ok = await run(() => client.saveReview(planId, schedule.review?.id ?? null, data), { success: schedule.review ? 'Review updated.' : 'Review scheduled.' });
        if (ok) setSchedule(null);
      }} />}
      {hold && <HoldDialog review={hold} plan={plan} onClose={() => setHold(null)} onHold={async (summary, decisions) => {
        const ok = await run(() => client.holdReview(hold.id, summary, decisions), { success: 'Review held. The snapshot is saved.' });
        if (ok) setHold(null);
      }} />}
      {detail && <DetailDialog review={detail} plan={plan} who={who} onClose={() => setDetail(null)} />}
    </div>
  );
}

function ScheduleDialog({ init, today, onClose, onSave }: { init: { review: Review | null; title: string; due: string }; today: string; onClose: () => void; onSave: (title: string, due: string) => Promise<void> }) {
  const [title, setTitle] = useState(init.title);
  const [due, setDue] = useState(init.due);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'Give the review a title.';
    if (!due) e.due = 'Choose the date of the review.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true); await onSave(title.trim(), due); setBusy(false);
  };
  return (
    <Dialog open title={init.review ? 'Reschedule review' : 'Schedule a review'} onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={busy} onClick={submit}>{init.review ? 'Save changes' : 'Schedule review'}</Button></>}>
      <form className="form-grid" noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div className="span-2"><TextField label="Title" required maxLength={120} value={title} error={errors.title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div className="span-2"><TextField label="Due date" required type="date" value={due} error={errors.due} hint={due && due < today ? 'This date has passed, so the review will show as overdue.' : undefined} onChange={(e) => setDue(e.target.value)} /></div>
      </form>
    </Dialog>
  );
}

function HoldDialog({ review, plan, onClose, onHold }: { review: Review; plan: PlanDetail; onClose: () => void; onHold: (summary: string, decisions: string) => Promise<void> }) {
  const { today } = usePlanner();
  const [summary, setSummary] = useState('');
  const [decisions, setDecisions] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sum = useMemo(() => summarise(plan.goals, today), [plan.goals, today]);
  const focusCount = plan.focus_areas.filter((f) => !f.archived_at).length;
  const submit = async () => {
    if (!summary.trim()) { setError('Write a short summary of the discussion.'); return; }
    setError(null); setBusy(true); await onHold(summary.trim(), decisions.trim()); setBusy(false);
  };
  return (
    <Dialog open wide title={`Hold review: ${review.title}`} onClose={onClose}
      description="Holding a review is permanent: its summary, decisions and snapshot cannot be edited or deleted afterwards."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={busy} onClick={submit}>Hold review</Button></>}>
      <div className="rv-hold">
        <form className="stack" noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <TextArea label="Summary" required rows={4} maxLength={4000} value={summary} error={error} hint="What was discussed and how the plan is doing." onChange={(e) => setSummary(e.target.value)} />
          <TextArea label="Decisions" rows={4} maxLength={4000} value={decisions} hint="What was decided, and who does what next. Optional." onChange={(e) => setDecisions(e.target.value)} />
        </form>
        <aside className="rv-preview" aria-label="Snapshot preview">
          <h3>Snapshot that will be frozen</h3>
          <p className="muted">How the plan stands right now.</p>
          <div className="rv-preview__ring"><Ring value={Number(plan.plan.progress)} size={88} label="Overall progress" /></div>
          <StatusBar counts={sum.byStatus} total={sum.total} />
          <StatusLegend counts={sum.byStatus} />
          <p className="muted">{plural(sum.total, 'goal')} across {plural(focusCount, 'focus area')}.</p>
        </aside>
      </div>
    </Dialog>
  );
}

function DetailDialog({ review, plan, who, onClose }: { review: Review; plan: PlanDetail; who: (id: string | null) => string; onClose: () => void }) {
  const { client, openGoal, today } = usePlanner();
  const [full, setFull] = useState<Review | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setState('loading');
    client.getReview(review.id).then((r) => { if (live) { setFull(r); setState(r ? 'ready' : 'error'); } }).catch(() => { if (live) setState('error'); });
    return () => { live = false; };
  }, [client, review.id, attempt]);

  const snap: ReviewSnapshot | null = full?.snapshot ?? null;
  const live = useMemo(() => summarise(plan.goals, today), [plan.goals, today]);
  const nowFocus = useMemo(() => liveFocusRollup(plan), [plan]);
  const nowGoals = useMemo(() => new Map(plan.goals.filter((g) => !g.archived_at).map((g) => [g.id, g] as const)), [plan.goals]);

  const goalRows = useMemo(() => {
    if (!snap) return [];
    return snap.goals.map((s) => {
      const g: Goal | undefined = nowGoals.get(s.id);
      const delta = g ? Number(g.progress) - Number(s.progress) : 0;
      const changed = !g || g.status !== s.status || Math.abs(delta) >= 0.05;
      return { s, g, delta, changed };
    }).sort((a, b) => Number(b.changed) - Number(a.changed) || Math.abs(b.delta) - Math.abs(a.delta));
  }, [snap, nowGoals]);
  const newGoals = useMemo(() => (snap ? [...nowGoals.values()].filter((g) => !snap.goals.some((s) => s.id === g.id)) : []), [snap, nowGoals]);
  const shownGoals = onlyChanged ? goalRows.filter((r) => r.changed) : goalRows;

  return (
    <Dialog open wide title={review.title} onClose={onClose} description={`Held ${formatDateTime(review.held_at)} by ${who(review.held_by)}. Held reviews are permanent.`}
      footer={<Button onClick={onClose}>Close</Button>}>
      <div className="stack">
        <section aria-labelledby="rv-sum"><h3 id="rv-sum">Summary</h3><p className="rv-text">{review.summary || 'No summary was written.'}</p></section>
        <section aria-labelledby="rv-dec"><h3 id="rv-dec">Decisions</h3><p className="rv-text">{review.decisions || 'No decisions were recorded.'}</p></section>

        <section aria-labelledby="rv-then" aria-live="polite">
          <h3 id="rv-then">What changed since this review</h3>
          {state === 'loading' && <Skeleton lines={4} />}
          {state === 'error' && <ErrorState title="The snapshot could not be loaded" onRetry={() => setAttempt((n) => n + 1)}>Try again in a moment.</ErrorState>}
          {state === 'ready' && !snap && <p className="muted">This review has no snapshot.</p>}
          {state === 'ready' && snap && (
            <div className="stack">
              <div className="rv-compare">
                <div className="rv-compare__col">
                  <span className="muted">Then ({formatDate(snap.taken_at.slice(0, 10), { year: true })})</span>
                  <Ring value={Number(snap.progress)} size={72} label="Overall progress then" />
                  <StatusBar counts={snap.status_counts} />
                </div>
                <div className="rv-compare__col">
                  <span className="muted">Now</span>
                  <Ring value={Number(plan.plan.progress)} size={72} label="Overall progress now" />
                  <StatusBar counts={live.byStatus} total={live.total} />
                </div>
                <div className="rv-compare__col rv-compare__delta">
                  <span className="muted">Overall progress</span>
                  <strong><Delta from={Number(snap.progress)} to={Number(plan.plan.progress)} /></strong>
                </div>
              </div>

              <h4>By focus area</h4>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th scope="col">Focus area</th><th scope="col" className="num">Then</th><th scope="col" className="num">Now</th><th scope="col">Change</th></tr></thead>
                  <tbody>
                    {snap.focus_areas.map((f) => {
                      const n = nowFocus.get(f.id);
                      return (
                        <tr key={f.id}>
                          <th scope="row">{f.name}</th>
                          <td className="num">{Math.round(Number(f.progress))}%</td>
                          <td className="num">{n ? `${Math.round(n.progress)}%` : '-'}</td>
                          <td>{n ? <Delta from={Number(f.progress)} to={n.progress} /> : <span className="muted">Focus area no longer active</span>}</td>
                        </tr>
                      );
                    })}
                    {[...nowFocus.entries()].filter(([id]) => !snap.focus_areas.some((f) => f.id === id)).map(([id, n]) => (
                      <tr key={id}><th scope="row">{n.name}</th><td className="num">-</td><td className="num">{Math.round(n.progress)}%</td><td><Chip tone="accent">New since this review</Chip></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="row row--between">
                <h4>By goal ({plural(snap.goals.length, 'goal')} then)</h4>
                <Checkbox label="Only objectives that changed" checked={onlyChanged} onChange={setOnlyChanged} />
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th scope="col">Objective</th><th scope="col">Status then</th><th scope="col">Status now</th><th scope="col" className="num">Progress</th><th scope="col">Change</th></tr></thead>
                  <tbody>
                    {shownGoals.length === 0 && <tr><td colSpan={5} className="muted">No objectives changed.</td></tr>}
                    {shownGoals.map(({ s, g }) => (
                      <tr key={s.id}>
                        <th scope="row">{g ? <button type="button" className="link-btn" onClick={() => { onClose(); openGoal(g.id); }}>{g.title}</button> : s.title}</th>
                        <td><StatusBadge status={s.status as Status} /></td>
                        <td>{g ? <StatusBadge status={g.status} /> : <span className="muted">-</span>}</td>
                        <td className="num">{Math.round(Number(s.progress))}% {'→'} {g ? `${Math.round(Number(g.progress))}%` : '-'}</td>
                        <td>{g ? <Delta from={Number(s.progress)} to={Number(g.progress)} /> : <Chip tone="warn">Objective no longer exists</Chip>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {newGoals.length > 0 && (
                <div>
                  <h4>New since this review ({newGoals.length})</h4>
                  <ul className="rv-newlist">
                    {newGoals.map((g) => <li key={g.id}><button type="button" className="link-btn" onClick={() => { onClose(); openGoal(g.id); }}>{g.title}</button> <StatusBadge status={g.status} /></li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </Dialog>
  );
}
