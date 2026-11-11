import type { ProjectDetail, ProjectReport } from '../../../../shared/api.ts';
import { call } from '../../../api/client.ts';
import { useQuery } from '../../../api/store.ts';
import { BarChart, ChartCard, Donut, dateShort } from '../../../charts/index.ts';
import { fmtHours } from '../../../lib/oversight.tsx';
import { cx, fmtMinutes, PRIORITY_META, TASK_STATUS_META } from '../../../lib/util.ts';
import { Avatar } from '../../../ui/Badges.tsx';
import { Card, EmptyState, ErrorState, Skeleton } from '../../../ui/Feedback.tsx';

export function ReportView({ project }: { project: ProjectDetail }) {
  // Key starts with "project" so invalidateWork() refreshes it after any task change.
  const q = useQuery(`project:${project.id}:report`, () => call('report.get', { projectId: project.id }), []);

  if (q.loading && !q.data) {
    return <div className="pm-rp" role="status" aria-label="Loading report"><div className="pm-rp-tiles">{Array.from({ length: 7 }, (_, i) => <Skeleton key={i} height={74} radius={10} />)}</div><Skeleton height={220} radius={12} /></div>;
  }
  if (q.error && !q.data) return <ErrorState title="Couldn't load the report" message={q.error.message} onRetry={() => void q.refetch()} />;
  const r = q.data;
  if (!r) return null;
  if (r.stats.total === 0) {
    return <EmptyState icon="bars" title="Nothing to report yet" text="Add some tasks to this project and its numbers will show up here." />;
  }
  return <Report r={r} name={project.name} />;
}

function Report({ r, name }: { r: ProjectReport; name: string }) {
  const s = r.stats;
  const weekTotal = r.completedPerWeek.reduce((a, d) => a + d.count, 0);
  return (
    <div className="pm-rp">
      <div className="pm-rp-tiles" role="list" aria-label="Project numbers">
        <Tile label="Open" value={String(s.open)} />
        <Tile label="Overdue" value={String(s.overdue)} tone={s.overdue > 0 ? 'danger' : undefined} />
        <Tile label="Blocked" value={String(s.blocked)} tone={s.blocked > 0 ? 'danger' : undefined} />
        <Tile label="Done in 7 days" value={String(s.doneLast7)} />
        <Tile label="Done in 30 days" value={String(s.doneLast30)} />
        <Tile label="Estimated work left" value={fmtHours(s.estimateLeftMinutes)} />
        <Tile label="Time logged" value={s.loggedMinutes ? fmtMinutes(s.loggedMinutes) : '0m'} />
      </div>
      <p className="pm-faint pm-rp-note">Counts cover top-level tasks (subtasks roll up into their parent). {s.total} in total, {s.done} done.</p>

      <div className="pm-rp-grid">
        <ChartCard title="By status" subtitle="Top-level tasks in each status right now." fileBase={name}
          csv={() => [['Status', 'Tasks'], ...r.byStatus.map((x) => [TASK_STATUS_META[x.status].label, x.count])]}>
          <Donut ariaLabel="Tasks by status" data={r.byStatus.map((x) => ({ key: x.status, label: TASK_STATUS_META[x.status].label, value: x.count, color: TASK_STATUS_META[x.status].color }))} />
        </ChartCard>
        <ChartCard title="By priority" subtitle="Top-level tasks per priority, most urgent first." fileBase={name}
          csv={() => [['Priority', 'Tasks'], ...r.byPriority.map((x) => [PRIORITY_META[x.priority].label, x.count])]}>
          <BarChart ariaLabel="Tasks by priority" series={[{ key: 'count', label: 'Tasks', color: 'var(--pm-accent)' }]}
            data={[...r.byPriority].reverse().map((x) => ({ key: x.priority, label: PRIORITY_META[x.priority].label, color: PRIORITY_META[x.priority].color, values: { count: x.count } }))} />
        </ChartCard>
        <ChartCard className="pm-rp-wide" title="Completed per week" subtitle={`Tasks finished in each of the last 8 weeks (week starts Monday). ${weekTotal} in total.`} fileBase={name}
          csv={() => [['Week starting', 'Completed'], ...r.completedPerWeek.map((d) => [d.weekStart, d.count])]}>
          <BarChart ariaLabel="Tasks completed per week" orientation="vertical" height={220}
            series={[{ key: 'count', label: 'Completed', color: 'var(--pm-st-done)' }]}
            data={r.completedPerWeek.map((d) => ({ key: d.weekStart, label: dateShort(d.weekStart), values: { count: d.count } }))} />
        </ChartCard>
      </div>

      <Card title="People" className="pm-rp-people">
        <div className="pm-rp-scroll">
          <table className="pm-rp-table">
            <thead>
              <tr>
                <th scope="col">Person</th>
                <th scope="col" className="is-num">Open</th>
                <th scope="col" className="is-num">Overdue</th>
                <th scope="col" className="is-num">Done</th>
                <th scope="col" className="is-num">Estimate left</th>
                <th scope="col" className="is-num">Billable time</th>
                <th scope="col" className="is-num">Other time</th>
              </tr>
            </thead>
            <tbody>
              {r.people.map((p) => (
                <tr key={p.person?.id ?? 'none'}>
                  <th scope="row">
                    <span className="pm-rp-who"><Avatar person={p.person} size={24} /><span className="pm-truncate">{p.person?.name ?? 'Unassigned'}</span></span>
                  </th>
                  <td className="is-num pm-num">{p.open}</td>
                  <td className={cx('is-num pm-num', p.overdue > 0 && 'pm-danger-text')}>{p.overdue > 0 ? <strong>{p.overdue}</strong> : 0}</td>
                  <td className="is-num pm-num">{p.done}</td>
                  <td className="is-num pm-num">{fmtHours(p.estimateLeftMinutes)}</td>
                  <td className="is-num pm-num">{p.billableMinutes ? fmtMinutes(p.billableMinutes) : '–'}</td>
                  <td className="is-num pm-num">{p.otherMinutes ? fmtMinutes(p.otherMinutes) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: 'danger' }) {
  return (
    <div role="listitem" className={cx('pm-tile', tone && `pm-tile--${tone}`)}>
      <div className="pm-tile__value pm-num">{value}</div>
      <div className="pm-tile__label">{label}</div>
    </div>
  );
}
