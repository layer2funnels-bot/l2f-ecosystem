import { useMemo, useState } from 'react';
import type { Workload, WorkloadCell } from '../../shared/api.ts';
import { call } from '../api/client.ts';
import { useQuery } from '../api/store.ts';
import { useProjects } from '../lib/data.ts';
import { fmtHours } from '../lib/oversight.tsx';
import { useSession } from '../lib/session.tsx';
import { cx, fmtDate } from '../lib/util.ts';
import { Avatar } from '../ui/Badges.tsx';
import { EmptyState, ErrorState, PageHeader, SkeletonRows } from '../ui/Feedback.tsx';
import { Select } from '../ui/Menu.tsx';
import type { SelectOption } from '../ui/Menu.tsx';

const WEEK_OPTIONS: SelectOption<string>[] = ['4', '6', '8', '12'].map((w) => ({ value: w, label: `${w} weeks` }));

type Level = 'empty' | 'low' | 'mid' | 'over';
function level(minutes: number, tasks: number, cap: number): Level {
  if (tasks === 0 && minutes === 0) return 'empty';
  if (minutes > cap) return 'over';
  return minutes >= cap * 0.5 ? 'mid' : 'low';
}

export function WorkloadPage() {
  const { org } = useSession();
  const [weeks, setWeeks] = useState('6');
  const [projectId, setProjectId] = useState('');
  const projects = useProjects('active');
  const q = useQuery('workload', () => call('workload.get', { weeks: Number(weeks), projectId: projectId || null }), [weeks, projectId]);

  const projectOptions = useMemo<SelectOption<string>[]>(
    () => [{ value: '', label: 'All projects' }, ...(projects.data ?? []).map((p) => ({ value: p.id, label: p.name }))],
    [projects.data],
  );

  const data = q.data;
  const cap = data?.capacityMinutesPerWeek ?? 2400;
  const totals = useMemo(() => {
    if (!data) return null;
    const sum = (pick: (p: Workload['people'][number]) => WorkloadCell): WorkloadCell =>
      data.people.reduce((a, p) => ({ minutes: a.minutes + pick(p).minutes, tasks: a.tasks + pick(p).tasks }), { minutes: 0, tasks: 0 });
    return {
      overdue: sum((p) => p.overdue),
      noDate: sum((p) => p.noDate),
      byWeek: data.weeks.map((_, i) => sum((p) => p.byWeek[i])),
      unestimated: data.people.reduce((a, p) => a + p.unestimated, 0),
    };
  }, [data]);

  const capH = Math.round(cap / 60);

  return (
    <div className="pm-page pm-page--wide">
      <PageHeader title="Workload" subtitle={`Open assigned tasks by person and due week in ${org.name}. Capacity is ${capH} h per person per week.`} />

      <div className="pm-toolbar" role="group" aria-label="Workload options">
        <Select ariaLabel="Number of weeks" size="sm" value={weeks} options={WEEK_OPTIONS} onChange={setWeeks} matchWidth={false} className="pm-ov-select" />
        <Select ariaLabel="Filter by project" size="sm" value={projectId} options={projectOptions} onChange={setProjectId} matchWidth={false} className="pm-ov-select" />
        {projectId && <button type="button" className="pm-ov-link" onClick={() => setProjectId('')}>All projects</button>}
      </div>

      {q.loading && !data && <SkeletonRows rows={6} height={52} />}
      {q.error && !data && <ErrorState title="Couldn't load the workload" message={q.error.message} onRetry={() => void q.refetch()} />}

      {data && data.people.length === 0 && <EmptyState icon="users" title="No people to show" text="Invite teammates to your organization to plan their workload." />}

      {data && totals && data.people.length > 0 && (
        <>
          <div className="pm-wl-legend" aria-label="How to read the grid">
            <strong>Capacity {capH} h / week</strong>
            <span className="pm-wl-key"><i className="pm-wl-swatch pm-wl--low" />Under 50%</span>
            <span className="pm-wl-key"><i className="pm-wl-swatch pm-wl--mid" />50–100%</span>
            <span className="pm-wl-key"><i className="pm-wl-swatch pm-wl--over" />Over capacity</span>
            <span className="pm-faint">Hours come from task estimates; tasks without an estimate add to the task count but not the hours. “Overdue” means due before the start of this week. A task shared by several people counts in full for each of them, so the team total can be higher than the sum of the task estimates.</span>
          </div>

          <div className="pm-wl-scroll" tabIndex={0} role="region" aria-label="Workload grid, scrolls horizontally">
            <table className="pm-wl">
              <caption className="pm-sr-only">Open task hours and counts per person, grouped by due week</caption>
              <thead>
                <tr>
                  <th scope="col" className="pm-wl__person">Person</th>
                  <th scope="col"><span className="pm-wl__h">Overdue</span></th>
                  <th scope="col"><span className="pm-wl__h">No date</span></th>
                  {data.weeks.map((w, i) => (
                    <th key={w} scope="col">
                      <span className="pm-wl__h">{fmtDate(w)}</span>
                      {i === 0 && <span className="pm-wl__sub">This week</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.people.map((r) => {
                  const empty = r.overdue.tasks + r.noDate.tasks + r.byWeek.reduce((a, c) => a + c.tasks, 0) === 0;
                  return (
                    <tr key={r.person.id} className={cx(empty && 'is-idle')}>
                      <th scope="row" className="pm-wl__person">
                        <span className="pm-wl__who">
                          <Avatar person={r.person} size={26} />
                          <span className="pm-wl__name">
                            <span className="pm-truncate">{r.person.name}</span>
                            {r.unestimated > 0 && <span className="pm-wl__sub">{r.unestimated} unestimated</span>}
                          </span>
                        </span>
                      </th>
                      <Cell cell={r.overdue} kind="overdue" label={`${r.person.name}, overdue`} cap={cap} />
                      <Cell cell={r.noDate} kind="nodate" label={`${r.person.name}, no due date`} cap={cap} />
                      {r.byWeek.map((c, i) => <Cell key={data.weeks[i]} cell={c} kind="week" label={`${r.person.name}, week of ${fmtDate(data.weeks[i])}`} cap={cap} />)}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" className="pm-wl__person">
                    Team total
                    {totals.unestimated > 0 && <span className="pm-wl__sub">{totals.unestimated} unestimated</span>}
                  </th>
                  <TotalCell cell={totals.overdue} />
                  <TotalCell cell={totals.noDate} />
                  {totals.byWeek.map((c, i) => <TotalCell key={data.weeks[i]} cell={c} />)}
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Cell({ cell, kind, label, cap }: { cell: WorkloadCell; kind: 'overdue' | 'nodate' | 'week'; label: string; cap: number }) {
  if (cell.tasks === 0 && cell.minutes === 0) return <td className="pm-wl__cell"><span className="pm-faint" aria-label={`${label}: nothing`}>–</span></td>;
  const lv: Level = kind === 'week' ? level(cell.minutes, cell.tasks, cap) : 'empty';
  const pct = Math.round((cell.minutes / cap) * 100);
  const tasks = `${cell.tasks} ${cell.tasks === 1 ? 'task' : 'tasks'}`;
  const aria = `${label}: ${fmtHours(cell.minutes)}, ${tasks}${kind === 'week' ? `, ${pct}% of capacity${lv === 'over' ? ', over capacity' : ''}` : ''}`;
  return (
    <td className="pm-wl__cell">
      <div className={cx('pm-wl__box', lv !== 'empty' && `pm-wl--${lv}`, kind === 'overdue' && 'pm-wl--overdue')} aria-label={aria} role="group">
        <span className="pm-wl__hours pm-num">{fmtHours(cell.minutes)}</span>
        <span className="pm-wl__tasks pm-num">{tasks}</span>
        {kind === 'week' && <span className="pm-wl__pct pm-num">{lv === 'over' ? <strong>Over · {pct}%</strong> : `${pct}%`}</span>}
      </div>
    </td>
  );
}

function TotalCell({ cell }: { cell: WorkloadCell }) {
  return (
    <td className="pm-wl__cell pm-wl__total">
      <span className="pm-wl__hours pm-num">{fmtHours(cell.minutes)}</span>
      <span className="pm-wl__tasks pm-num">{cell.tasks} {cell.tasks === 1 ? 'task' : 'tasks'}</span>
    </td>
  );
}
