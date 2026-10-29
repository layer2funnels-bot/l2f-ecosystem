import { useEffect, useState } from 'react';
import type { Cadence, Plan, PlanSummary, Strategy } from '../api/types.ts';
import { usePlanner } from '../state/PlannerContext.tsx';
import { Button, SelectField, TextArea, TextField } from '../ui/primitives.tsx';
import { Dialog } from '../ui/overlay.tsx';
import { CADENCE_LABEL } from '../lib/status.ts';

export type PlanFormMode = { kind: 'create'; strategyId?: string } | { kind: 'edit'; plan: Plan | PlanSummary };

export function PlanFormDialog({ mode, onClose }: { mode: PlanFormMode | null; onClose: () => void }) {
  const { workspace, client, run, selectPlan, plans } = usePlanner();
  const [parent, setParent] = useState('');
  const [strategies, setStrategies] = useState<Strategy[]>([]); const [strategyId, setStrategyId] = useState('');
  const [name, setName] = useState(''); const [description, setDescription] = useState(''); const [vision, setVision] = useState('');
  const [start, setStart] = useState(''); const [end, setEnd] = useState(''); const [cadence, setCadence] = useState<Cadence>('monthly');
  const [errors, setErrors] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false);
  const editing = mode?.kind === 'edit' ? mode.plan : null;

  useEffect(() => {
    if (!mode) return;
    setErrors({}); setStrategyId(mode.kind === 'create' ? mode.strategyId ?? '' : '');
    if (!editing && workspace) client.model(workspace.id).then((m) => setStrategies(m?.strategies ?? [])).catch(() => setStrategies([]));
    setName(editing?.name ?? ''); setDescription(editing?.description ?? ''); setVision((editing as Plan | null)?.vision ?? '');
    setStart(editing?.period_start ?? ''); setEnd(editing?.period_end ?? ''); setCadence(editing?.review_cadence ?? 'monthly'); setParent((editing as { parent_plan_id?: string | null } | null)?.parent_plan_id ?? '');
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!mode || !workspace) return null;

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Give the plan a name.';
    if (start && end && end < start) e.end = 'The end date is before the start date.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const data = { name: name.trim(), description: description.trim() || null, period_start: start || null, period_end: end || null, review_cadence: cadence, parent_plan_id: parent || null, ...(editing ? {} : { vision: vision.trim() || null, strategy_id: strategyId || null }) };
    const saved = await run(() => client.savePlan(workspace.id, editing?.id ?? null, data, (editing && plans.find((x) => x.id === editing.id)?.updated_at) ?? editing?.updated_at), { success: editing ? 'Plan saved.' : 'Plan created.' });
    setBusy(false);
    if (saved) { if (!editing) selectPlan(saved.id); onClose(); }
  };

  return (
    <Dialog open title={editing ? 'Edit plan' : 'Create a plan'} onClose={onClose}
      description={editing ? undefined : 'A plan holds your vision, values, focus areas and objectives for a period.'}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={busy} onClick={submit}>{editing ? 'Save plan' : 'Create plan'}</Button></>}>
      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
        <div className="span-2"><TextField label="Plan name" required value={name} maxLength={120} error={errors.name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Strategy 2027" /></div>
        {!editing && strategies.length > 0 && <div className="span-2"><SelectField label="Strategy" hint={strategyId ? 'The plan starts with this strategy’s focus areas, objectives, KPIs and tasks.' : 'Optional. Pick a strategy from the Strategy map to start with its focus areas and objectives.'} value={strategyId} onChange={(e) => setStrategyId(e.target.value)}>
          <option value="">No strategy (start empty)</option>
          {strategies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </SelectField></div>}
        <div className="span-2"><TextArea label="Description" value={description} rows={2} maxLength={2000} onChange={(e) => setDescription(e.target.value)} /></div>
        {!editing && <div className="span-2"><TextArea label="Vision" hint="One or two sentences on what success looks like. You can change it later." value={vision} rows={2} maxLength={2000} onChange={(e) => setVision(e.target.value)} /></div>}
        <TextField label="Starts" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        <TextField label="Ends" type="date" value={end} error={errors.end} onChange={(e) => setEnd(e.target.value)} />
        <div className="span-2"><SelectField label="Part of plan" hint="Optional. Connects this plan under a bigger plan; you can see the connection in Alignment." value={parent} onChange={(e) => setParent(e.target.value)}>
          <option value="">Not part of another plan</option>
          {plans.filter((p) => p.id !== editing?.id && !p.archived_at).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </SelectField></div>
        <div className="span-2"><SelectField label="Review rhythm" hint="How often the team reviews this plan together." value={cadence} onChange={(e) => setCadence(e.target.value as Cadence)}>
          {Object.entries(CADENCE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </SelectField></div>
      </form>
    </Dialog>
  );
}
