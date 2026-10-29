// "Turn into work": pick objectives, review the tasks we would create, optionally link a project, then confirm.
// Tasks are the Planner's own actions (they appear in My work). Projects are the existing ones; none is created here.
import { useEffect, useMemo, useState } from 'react';
import type { Action, Goal, ProjectRef } from '../api/types.ts';
import { usePlanner } from '../state/PlannerContext.tsx';
import { Button, Checkbox, EmptyState, SelectField, TextField } from '../ui/primitives.tsx';
import { Dialog } from '../ui/overlay.tsx';
import { convertible, proposeFor, tasksToCreate, type Proposal } from '../lib/conversion.ts';
import { plural } from '../lib/format.ts';

export interface WorkMode { focusAreaId?: string | null; goalId?: string | null }
interface Result { goal: string; created: number; skipped: number; linked: boolean; error?: string }

export function TurnIntoWorkDialog({ mode, onClose }: { mode: WorkMode | null; onClose: () => void }) {
  const { plan, client, workspace, run, can } = usePlanner();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [proposals, setProposals] = useState<Record<string, Proposal>>({});
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [off, setOff] = useState<Set<string>>(new Set());
  const [projects, setProjects] = useState<ProjectRef[]>([]);
  const [projectId, setProjectId] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);

  const candidates = useMemo<Goal[]>(() => {
    if (!plan || !mode) return [];
    let list = convertible(plan.goals);
    if (mode.goalId) list = list.filter((g) => g.id === mode.goalId);
    else if (mode.focusAreaId) list = list.filter((g) => g.focus_area_id === mode.focusAreaId);
    return list;
  }, [plan, mode]);

  useEffect(() => {
    if (!mode || !plan || !workspace) return;
    setResults(null); setTitles({}); setOff(new Set()); setProjectId('');
    setPicked(new Set(candidates.map((g) => g.id)));
    setLoading(true);
    let live = true;
    void (async () => {
      const entries = await Promise.all(candidates.map(async (g) => {
        const d = await client.goal(g.id).catch(() => null);
        return [g.id, proposeFor(g, (d?.actions ?? []).filter((a: Action) => !a.archived_at))] as const;
      }));
      const prj = await client.projects(workspace.id);
      if (!live) return;
      setProposals(Object.fromEntries(entries)); setProjects(prj); setLoading(false);
    })();
    return () => { live = false; };
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!mode || !plan) return null;

  const chosen = candidates.filter((g) => picked.has(g.id) && proposals[g.id]);
  const plannedFor = (g: Goal) => (proposals[g.id] ? tasksToCreate(titles, off, proposals[g.id]!) : []);
  const total = chosen.reduce((n, g) => n + plannedFor(g).length, 0);
  const toLink = projectId ? chosen.filter((g) => !g.project_id) : [];
  const canWork = can['action.manage'];

  const confirm = async () => {
    setBusy(true);
    const out: Result[] = [];
    for (const g of chosen) {
      const rows = plannedFor(g);
      let created = 0; let linked = false; let error: string | undefined;
      for (const t of rows) {
        try {
          await client.saveAction(g.id, null, { title: t.title, notes: t.notes, assignee_id: g.owner_id, status: 'todo', priority: g.priority, due_date: g.due_date, project_id: projectId || null });
          created++;
        } catch { error = 'Some tasks could not be saved.'; break; }
      }
      if (!error && projectId && !g.project_id) {
        try { await client.saveGoal(plan.plan.id, g.id, { project_id: projectId }, g.updated_at); linked = true; } catch { error = 'The project link could not be saved.'; }
      }
      out.push({ goal: g.title, created, skipped: (proposals[g.id]?.tasks.length ?? 0) - rows.length, linked, error });
    }
    setBusy(false); setResults(out);
    await run(async () => undefined, { success: out.some((x) => x.error) ? undefined : `Created ${plural(out.reduce((n, x) => n + x.created, 0), 'task')}.` });
  };

  const footer = results
    ? <Button variant="primary" onClick={onClose}>Done</Button>
    : <><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={busy} disabled={!canWork || loading || (total === 0 && toLink.length === 0)} onClick={confirm}>{total ? `Create ${plural(total, 'task')}` : 'Nothing to create'}</Button></>;

  return (
    <Dialog open wide title="Turn into work" onClose={onClose} footer={footer}
      description="Choose the objectives to plan, review the tasks we would add to them, then confirm. Nothing is created until you confirm, and tasks that already exist are skipped.">
      {results ? (
        <ul className="tw-results" aria-live="polite">
          {results.map((x) => <li key={x.goal}><strong>{x.goal}</strong>: {plural(x.created, 'task')} created{x.skipped ? `, ${x.skipped} skipped` : ''}{x.linked ? ', project linked' : ''}.{x.error && <span className="field__error"> {x.error}</span>}</li>)}
        </ul>
      ) : loading ? <p className="muted">Looking at what already exists…</p>
        : candidates.length === 0 ? <EmptyState title="Nothing to plan here">Open objectives with no sub-objectives can take tasks. Add an objective first, or choose a different focus area.</EmptyState>
        : (
          <div className="stack">
            {!canWork && <p className="field__error" role="alert">You need permission to manage actions to create tasks.</p>}
            <SelectField label="Link to a project (optional)" hint="Tasks, and objectives that have no project yet, are linked to it. Projects are not created here." value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">No project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </SelectField>
            {candidates.map((g) => {
              const pr = proposals[g.id]; if (!pr) return null;
              const on = picked.has(g.id);
              return (
                <fieldset key={g.id} className="tw-goal">
                  <legend><Checkbox label={<strong>{g.title}</strong>} checked={on} onChange={(v) => setPicked((s) => { const n = new Set(s); if (v) n.add(g.id); else n.delete(g.id); return n; })} /></legend>
                  <p className="muted tw-goal__meta">{g.owner_name ?? 'No owner'} · {plural(pr.existing.length, 'existing task')}{g.project ? ` · project: ${g.project.name}` : ''}</p>
                  {on && pr.tasks.map((t) => (
                    <div key={t.key} className="tw-task">
                      <Checkbox label={<span className="sr-only">Create this task</span>} checked={!off.has(t.key) && !t.skip} disabled={!!t.skip} onChange={(v) => setOff((s) => { const n = new Set(s); if (v) n.delete(t.key); else n.add(t.key); return n; })} />
                      <TextField label="Task" value={titles[t.key] ?? t.title} disabled={!!t.skip || off.has(t.key)} onChange={(e) => setTitles((s) => ({ ...s, [t.key]: e.target.value }))} />
                      {t.skip && <span className="muted">Already exists, skipped</span>}
                    </div>))}
                </fieldset>);
            })}
            <p className="muted" aria-live="polite">{total ? `${plural(total, 'task')} will be created${toLink.length ? ` and ${plural(toLink.length, 'objective')} linked to the project` : ''}.` : 'Nothing new to create.'}</p>
          </div>)}
    </Dialog>
  );
}