// Reports: a printable snapshot of the selected plan as of today.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Goal, Risk, Status } from '../api/types.ts';
import { usePlanner } from '../state/PlannerContext.tsx';
import { downloadCsv, fileSlug } from '../components/ImportDialog.tsx';
import { Button, Chip, EmptyState, ProgressBar, Skeleton, StatusBadge } from '../ui/primitives.tsx';
import { Pie, StackedBars, StatusBar, StatusLegend } from '../ui/charts.tsx';
import { goalsToCsv } from '../lib/csv.ts';
import { daysBetween, scheduleState } from '../lib/schedule.ts';
import { formatDate, percent, plural, relativeTime } from '../lib/format.ts';
import { STATUS_META, STATUS_ORDER } from '../lib/status.ts';
import { summarise } from '../lib/tree.ts';

const STALE_DAYS = 30;
type Counts = Partial<Record<Status, number>>;
interface RiskRow extends Risk { goalTitle: string }

const avg = (goals: Goal[]) => (goals.length ? goals.reduce((n, g) => n + Number(g.progress), 0) / goals.length : 0);
const mix = (goals: Goal[]): Counts => { const c: Counts = {}; for (const g of goals) c[g.status] = (c[g.status] ?? 0) + 1; return c; };

export default function ReportsPage() {
  const { plan, planId, today, client, revision, workspace, toast, plans } = usePlanner();
  const live = useMemo(() => (plan?.goals ?? []).filter((g) => !g.archived_at), [plan]);
  const withRisks = useMemo(() => live.filter((g) => g.open_risks > 0), [live]);
  const riskKey = withRisks.map((g) => `${g.id}:${g.open_risks}:${g.max_risk}`).join('|');

  const [risks, setRisks] = useState<RiskRow[] | null>(null);
  const [riskError, setRiskError] = useState(false);
  useEffect(() => {
    let alive = true;
    setRiskError(false);
    if (withRisks.length === 0) { setRisks([]); return; }
    setRisks(null);
    (async () => {
      const out: RiskRow[] = [];
      for (let i = 0; i < withRisks.length; i += 4) {
        const batch = await Promise.all(withRisks.slice(i, i + 4).map((g) => client.goal(g.id)));
        for (const d of batch) if (d) for (const r of d.risks) if (r.status !== 'closed' && !r.archived_at) out.push({ ...r, goalTitle: d.goal.title });
        if (!alive) return;
      }
      out.sort((a, b) => b.severity - a.severity || a.goalTitle.localeCompare(b.goalTitle));
      if (alive) setRisks(out);
    })().catch(() => { if (alive) { setRiskError(true); setRisks([]); } });
    return () => { alive = false; };
    // the goals list is summarised by riskKey so the register reloads only when risk counts change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, riskKey, revision]);

  if (!plan || !planId) return null;
  const p = plan.plan;
  const typeNames = Object.fromEntries(plan.goal_types.map((t) => [t.id, t.name]));
  const sum = summarise(plan.goals, today);
  const focusRows = plan.focus_areas.filter((f) => !f.archived_at).map((f) => {
    const gs = live.filter((g) => g.focus_area_id === f.id);
    return { id: f.id, name: f.name, goals: gs, avg: avg(gs), counts: mix(gs), overdue: gs.filter((g) => scheduleState(g, today) === 'overdue').length };
  });
  const ownerMap = new Map<string, { name: string; goals: Goal[] }>();
  for (const g of live) { const k = g.owner_id ?? 'none'; (ownerMap.get(k) ?? ownerMap.set(k, { name: g.owner_name ?? 'No owner', goals: [] }).get(k)!).goals.push(g); }
  const ownerRows = [...ownerMap.entries()].map(([id, o]) => ({
    id, name: o.name, goals: o.goals, avg: avg(o.goals), trouble: o.goals.filter((g) => g.status === 'at_risk' || g.status === 'off_track').length,
    overdue: o.goals.filter((g) => scheduleState(g, today) === 'overdue').length,
  })).sort((a, b) => a.name.localeCompare(b.name));
  const overdue = live.filter((g) => scheduleState(g, today) === 'overdue').sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''));
  const stale = live.filter((g) => g.status !== 'completed' && daysBetween((g.last_update_at ?? g.created_at).slice(0, 10), today) >= STALE_DAYS)
    .sort((a, b) => (a.last_update_at ?? a.created_at).localeCompare(b.last_update_at ?? b.created_at));
  const held = plan.reviews.filter((r) => r.status === 'held').sort((a, b) => (b.held_at ?? b.due_on).localeCompare(a.held_at ?? a.due_on));
  const period = p.period_start || p.period_end ? `${formatDate(p.period_start, { year: true })} – ${formatDate(p.period_end, { year: true })}` : 'No period set';

  const exportCsv = () => {
    downloadCsv(`${fileSlug(p.name)}-goals-${today}.csv`, goalsToCsv(plan.goals.filter((g) => !g.archived_at), { focusAreas: plan.focus_areas, typeNames }));
    toast(`Exported ${plural(live.length, 'goal')}.`, 'success');
  };

  return (
    <div className="stack report">
      <div className="row row--between no-print">
        <div><h2 className="page-title">Reports</h2><p className="muted">A snapshot of this plan as of {formatDate(today, { year: true })}.</p></div>
        <div className="row">
          <Button onClick={exportCsv} disabled={live.length === 0}>Export objectives (CSV)</Button>
          <Button variant="primary" onClick={() => window.print()}>Print or save as PDF</Button>
        </div>
      </div>

      <header className="report__head card">
        <p className="muted">{workspace?.name} · Plan report as of {formatDate(today, { year: true })}</p>
        <h2 className="report__title">{p.name}</h2>
        {p.vision && <p className="report__vision">{p.vision}</p>}
        <dl className="report__facts">
          <div><dt>Period</dt><dd>{period}</dd></div>
          <div><dt>Objectives</dt><dd>{live.length}</dd></div>
          <div><dt>Overall progress</dt><dd>{percent(p.progress)}</dd></div>
          <div><dt>Overdue</dt><dd>{sum.overdue}</dd></div>
          <div><dt>With open risks</dt><dd>{sum.withRisks}</dd></div>
        </dl>
        <ProgressBar value={p.progress} label="Overall plan progress" />
        <StatusBar counts={mix(live)} />
        <StatusLegend counts={mix(live)} />
      </header>

      {live.length === 0 ? <EmptyState title="No objectives to report on yet">Add objectives to this plan and this report fills in.</EmptyState> : (
        <>
          <ReportSection title="Health">
            <div className="report-charts">
              <div className="card"><h4 className="section__title">Objectives by plan</h4>
                <StackedBars label="Objectives by plan, by status" groups={plans.filter((x) => !x.archived_at).map((x) => ({ name: x.name, counts: x.status_counts as Record<string, number> }))}
                  keys={STATUS_ORDER.map((s) => ({ key: s, label: STATUS_META[s].label, color: `var(--seg-${s})` }))} /></div>
              <div className="card"><h4 className="section__title">Objectives health</h4>
                <Pie label="Objectives health" slices={STATUS_ORDER.map((s) => ({ key: s, label: STATUS_META[s].label, value: mix(live)[s] ?? 0, color: `var(--seg-${s})` }))} /></div>
              <div className="card"><h4 className="section__title">Tasks</h4>
                <Pie label="Tasks" slices={[
                  { key: 'done', label: 'Done', value: live.reduce((n, g) => n + (g.total_actions - g.open_actions), 0), color: 'var(--seg-completed)' },
                  { key: 'open', label: 'Open', value: live.reduce((n, g) => n + g.open_actions, 0), color: 'var(--seg-on_track)' },
                ]} /></div>
            </div>
          </ReportSection>
          {live.some((g) => g.measure) && <ReportSection title="Key measures">
            <div className="kpi-cards">
              {live.filter((g) => g.measure).slice(0, 8).map((g) => (
                <div key={g.id} className="card kpi-card">
                  <span className="muted">{g.measure!.name}</span>
                  <strong className="kpi-card__value">{Number(g.measure!.current).toLocaleString()}{g.measure!.unit && ` ${g.measure!.unit}`}</strong>
                  <span className="muted">target {Number(g.measure!.target).toLocaleString()} · {g.title}</span>
                  <ProgressBar value={g.progress} status={g.status} thin label={`${g.title} progress`} />
                </div>))}
            </div>
          </ReportSection>}
          <ReportSection title="By focus area">
            <Table head={['Focus area', 'Objectives', 'Average progress', 'Status mix', 'Overdue']} numeric={[1, 2, 4]}>
              {focusRows.map((r) => (
                <tr key={r.id}><th scope="row">{r.name}</th><td className="num">{r.goals.length}</td><td className="num">{percent(r.avg)}</td>
                  <td className="report__mix"><StatusBar counts={r.counts} /><span className="muted">{STATUS_ORDER.filter((s) => r.counts[s]).map((s) => `${r.counts[s]} ${s.replace('_', ' ')}`).join(', ') || 'No objectives'}</span></td>
                  <td className="num">{r.overdue}</td></tr>))}
            </Table>
          </ReportSection>

          <ReportSection title="By owner">
            <Table head={['Owner', 'Objectives', 'Average progress', 'At risk or off track', 'Overdue']} numeric={[1, 2, 3, 4]}>
              {ownerRows.map((r) => (
                <tr key={r.id}><th scope="row">{r.name}</th><td className="num">{r.goals.length}</td><td className="num">{percent(r.avg)}</td><td className="num">{r.trouble}</td><td className="num">{r.overdue}</td></tr>))}
            </Table>
          </ReportSection>

          <ReportSection title="Open risks">
            {risks === null ? <div role="status" aria-live="polite"><span className="muted">Loading the risk register…</span><Skeleton lines={3} height={28} /></div>
              : riskError ? <p className="field__error" role="alert">The risk details could not be loaded. {withRisks.length} {withRisks.length === 1 ? 'objective has' : 'objectives have'} open risks; try again in a moment.</p>
              : risks.length === 0 ? <p className="muted">No open risks.</p> : (
                <Table head={['Risk', 'Objective', 'Severity', 'Status', 'Owner', 'Mitigation']} numeric={[2]}>
                  {risks.map((r) => (
                    <tr key={r.id}><th scope="row">{r.title}</th><td>{r.goalTitle}</td>
                      <td className="num"><Chip tone={r.severity >= 15 ? 'bad' : r.severity >= 8 ? 'warn' : 'neutral'} title={`Likelihood ${r.likelihood} × impact ${r.impact}`}>{r.severity} of 25</Chip></td>
                      <td>{r.status === 'open' ? 'Open' : 'Being reduced'}</td><td>{r.owner_name ?? '—'}</td><td>{r.mitigation ?? <span className="muted">None recorded</span>}</td></tr>))}
                </Table>)}
          </ReportSection>

          <ReportSection title="Overdue objectives">
            {overdue.length === 0 ? <p className="muted">Nothing is overdue.</p> : (
              <Table head={['Objective', 'Owner', 'Status', 'Progress', 'Due', 'Days late']} numeric={[3, 5]}>
                {overdue.map((g) => (
                  <tr key={g.id}><th scope="row">{g.title}</th><td>{g.owner_name ?? '—'}</td><td><StatusBadge status={g.status} /></td><td className="num">{percent(g.progress)}</td>
                    <td>{formatDate(g.due_date, { year: true })}</td><td className="num">{daysBetween(g.due_date!, today)}</td></tr>))}
              </Table>)}
          </ReportSection>

          <ReportSection title={`Not updated in ${STALE_DAYS} days`}>
            {stale.length === 0 ? <p className="muted">Every open objective has been updated recently.</p> : (
              <Table head={['Objective', 'Owner', 'Status', 'Progress', 'Last update']} numeric={[3]}>
                {stale.map((g) => (
                  <tr key={g.id}><th scope="row">{g.title}</th><td>{g.owner_name ?? '—'}</td><td><StatusBadge status={g.status} /></td><td className="num">{percent(g.progress)}</td>
                    <td>{g.last_update_at ? `${relativeTime(g.last_update_at)} (${formatDate(g.last_update_at, { year: true })})` : 'Never updated'}</td></tr>))}
              </Table>)}
          </ReportSection>
        </>)}

      <ReportSection title="Review history">
        {held.length === 0 ? <p className="muted">No reviews have been held yet.</p> : (
          <Table head={['Held on', 'Review', 'Summary']}>
            {held.map((r) => <tr key={r.id}><td>{formatDate(r.held_at ?? r.due_on, { year: true })}</td><th scope="row">{r.title}</th><td>{r.summary || <span className="muted">No summary recorded</span>}</td></tr>)}
          </Table>)}
      </ReportSection>
    </div>
  );
}

function ReportSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="report__section"><h3 className="section__title">{title}</h3>{children}</section>;
}

function Table({ head, numeric = [], children }: { head: string[]; numeric?: number[]; children: ReactNode }) {
  return (
    <div className="table-wrap report__table">
      <table className="table">
        <thead><tr>{head.map((h, i) => <th key={h} scope="col" className={numeric.includes(i) ? 'num' : undefined}>{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
