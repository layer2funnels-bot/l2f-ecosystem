// Plans: one simple list. Open a plan to see its planner. Nothing else on this screen.
import { useMemo, useState } from 'react';
import type { PlanSummary } from '../api/types.ts';
import { usePlanner } from '../state/PlannerContext.tsx';
import { useDialogs } from '../components/Dialogs.tsx';
import { Button, Checkbox, EmptyState, IconButton, ProgressBar, SelectField, TextField, Chip } from '../ui/primitives.tsx';
import { Icon } from '../ui/icons.tsx';
import { formatDate, percent, plural } from '../lib/format.ts';

export default function PlansPage() {
  const { plans, can, showArchivedPlans, setShowArchivedPlans, selectPlan, navigate, run, client, planId } = usePlanner();
  const dialogs = useDialogs();
  const [q, setQ] = useState('');
  const [only, setOnly] = useState<'all' | 'favourites'>('all');
  const byId = useMemo(() => new Map(plans.map((p) => [p.id, p] as const)), [plans]);
  const rows = useMemo(() => plans
    .filter((p) => (only === 'all' || p.favorite) && (!q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase())))
    .sort((a, b) => Number(!!a.archived_at) - Number(!!b.archived_at) || a.name.localeCompare(b.name)), [plans, q, only]);

  const open = (p: PlanSummary) => { selectPlan(p.id); navigate('map', { plan: p.id }); };

  return (
    <div className="stack">
      <header className="pagehead">
        <div>
          <h2 className="page-title">Plans</h2>
          <p className="page-lede">A plan holds your vision, focus areas and objectives for a period. Open one to work on it.</p>
        </div>
        {can['plan.manage'] && <Button variant="primary" onClick={() => dialogs.newPlan()}>New plan</Button>}
      </header>
      <div className="toolbar">
        <div className="toolbar__grow"><TextField label="Search plans" type="search" value={q} placeholder="Type a plan name" onChange={(e) => setQ(e.target.value)} /></div>
        <SelectField label="Show" value={only} onChange={(e) => setOnly(e.target.value as 'all' | 'favourites')}>
          <option value="all">All plans</option><option value="favourites">Favourites</option>
        </SelectField>
        <Checkbox label="Include archived" checked={showArchivedPlans} onChange={setShowArchivedPlans} />
      </div>
      {rows.length === 0 ? (
        <EmptyState title={plans.length ? 'No plans match' : 'No plans yet'} action={!plans.length && can['plan.manage'] ? <Button variant="primary" onClick={() => dialogs.newPlan()}>Create your first plan</Button> : undefined}>
          {plans.length ? 'Try a different search.' : 'A plan turns your vision into focus areas and objectives.'}
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table plans-table">
            <thead><tr><th scope="col"><span className="sr-only">Favourite</span></th><th scope="col">Plan</th><th scope="col">Focus areas</th><th scope="col">Objectives</th><th scope="col">Progress</th><th scope="col">Owner</th><th scope="col">Next review</th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className={p.id === planId ? 'is-current' : undefined}>
                  <td><IconButton label={p.favorite ? `Remove ${p.name} from favourites` : `Add ${p.name} to favourites`} aria-pressed={p.favorite}
                    onClick={() => void run(() => client.toggleFavorite(p.id, !p.favorite), { refresh: true })}><Icon name="star" size={18} /></IconButton></td>
                  <td>
                    <button type="button" className="plans-link" onClick={() => open(p)}>{p.name}</button>
                    <div className="muted plans-sub">
                      {p.parent_plan_id && byId.get(p.parent_plan_id) ? <>Part of {byId.get(p.parent_plan_id)!.name}</> : p.description}
                      {p.archived_at && <> <Chip tone="warn">Archived</Chip></>}
                    </div>
                  </td>
                  <td className="num">{p.focus_area_count}</td>
                  <td className="num">{p.goal_count}</td>
                  <td><span className="plans-prog"><ProgressBar value={p.progress} thin label={`${p.name} progress`} /><span className="mono">{percent(p.progress)}</span></span></td>
                  <td>{p.owner_name ?? '—'}</td>
                  <td>{p.next_review ? formatDate(p.next_review) : '—'}{p.overdue_reviews > 0 && <> <Chip tone="bad">{plural(p.overdue_reviews, 'review')} overdue</Chip></>}</td>
                </tr>))}
            </tbody>
          </table>
        </div>)}
    </div>
  );
}
