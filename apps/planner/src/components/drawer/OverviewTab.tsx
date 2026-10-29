import { usePlanner } from '../../state/PlannerContext.tsx';
import { MODE_LABEL, PRIORITY_META } from '../../lib/status.ts';
import { SCHEDULE_LABEL, UPDATE_CADENCE_LABEL, expectedProgress, nextUpdateDue, scheduleState } from '../../lib/schedule.ts';
import { formatDate, percent, relativeTime } from '../../lib/format.ts';
import { Chip, ProgressBar, StatusBadge } from '../../ui/primitives.tsx';
import type { TabProps } from './shared.tsx';

export function OverviewTab({ d }: TabProps) {
  const { today, plan, openGoal } = usePlanner();
  const g = d.goal;
  const state = scheduleState(g, today);
  const expected = expectedProgress(g, today);
  const value = plan?.values.find((v) => v.id === g.value_id);
  const last = d.updates[0];
  const project = g.project ? g.project.name : g.project_restricted ? 'Linked project (no access)' : 'None';

  return (
    <div className="gd-stack">
      <section className="gd-card" aria-labelledby="gd-progress-h">
        <h3 id="gd-progress-h" className="gd-h">Progress</h3>
        <div className="gd-progress">
          <strong className="gd-progress__num">{percent(g.progress)}</strong>
          <div className="gd-progress__bar"><ProgressBar value={g.progress} status={g.status} expected={expected} label="Goal progress" /></div>
        </div>
        <p className="gd-line">
          <strong>{SCHEDULE_LABEL[state]}</strong>
          {expected !== null && state !== 'completed' && <span className="muted"> · expected about {expected}% by today (marker on the bar)</span>}
        </p>
        <p className="muted gd-line">How it is worked out: {MODE_LABEL[g.progress_mode] ?? g.progress_mode}.
          {g.progress_mode === 'manual' ? ' Post an update to change it.' : ' It updates by itself; typed progress is ignored.'}</p>
      </section>

      <section className="gd-card" aria-labelledby="gd-details-h">
        <h3 id="gd-details-h" className="gd-h">Details</h3>
        <dl className="gd-dl">
          <dt>Status</dt><dd><StatusBadge status={g.status} /></dd>
          <dt>Start date</dt><dd>{formatDate(g.start_date, { year: true })}</dd>
          <dt>Due date</dt><dd>{formatDate(g.due_date, { year: true })}</dd>
          {g.completed_at && <><dt>Completed</dt><dd>{formatDate(g.completed_at, { year: true })}</dd></>}
          <dt>Updates</dt><dd>{UPDATE_CADENCE_LABEL[g.update_cadence]}{nextUpdateDue(g) && <> · next due {formatDate(nextUpdateDue(g), { year: true })}</>}</dd>
          <dt>Priority</dt><dd>{PRIORITY_META[g.priority].label}</dd>
          <dt>Weight</dt><dd>{g.weight}</dd>
          <dt>Kind</dt><dd>{g.type_name ?? 'None'}</dd>
          <dt>Tags</dt><dd>{g.tags.length ? <span className="gd-chips">{g.tags.map((t) => <Chip key={t}>{t}</Chip>)}</span> : 'None'}</dd>
          <dt>Linked value</dt><dd>{value ? value.name : 'None'}</dd>
          <dt>Linked project</dt><dd>{project}</dd>
        </dl>
      </section>

      <section className="gd-card" aria-labelledby="gd-desc-h">
        <h3 id="gd-desc-h" className="gd-h">Description</h3>
        {g.description ? <p className="gd-pre">{g.description}</p> : <p className="muted">No description yet.</p>}
      </section>

      <section className="gd-card" aria-labelledby="gd-sub-h">
        <h3 id="gd-sub-h" className="gd-h">Sub-goals ({d.children.length})</h3>
        {d.children.length === 0 ? <p className="muted">No sub-goals. Use the Actions menu to add one.</p> : (
          <ul className="gd-list">
            {d.children.map((c) => (
              <li key={c.id}>
                <button type="button" className="gd-sub" onClick={() => openGoal(c.id)}>
                  <span className="gd-sub__title">{c.title}{c.archived_at && <Chip>Archived</Chip>}</span>
                  <StatusBadge status={c.status} />
                  <span className="gd-sub__pct mono">{percent(c.progress)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="gd-card" aria-labelledby="gd-last-h">
        <h3 id="gd-last-h" className="gd-h">Latest update</h3>
        {last ? (
          <div className="gd-line">
            <p><StatusBadge status={last.status} /> <span className="muted">{last.author_name ?? 'Someone'} · {relativeTime(last.created_at)}</span></p>
            <p className="gd-pre">{last.summary}</p>
          </div>
        ) : <p className="muted">No updates posted yet.</p>}
      </section>
    </div>
  );
}
