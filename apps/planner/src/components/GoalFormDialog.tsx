// Create or edit a goal. Used from every screen through useDialogs(). Server rules (alignment, owner membership,
// archived plans, permissions) are enforced by the database; this form explains the common ones before they happen.
import { useEffect, useMemo, useState } from 'react';
import type { Goal, GoalType, PlanDetail, Priority, ProgressMode, ProjectRef, Status, UpdateCadence } from '../api/types.ts';
import { usePlanner } from '../state/PlannerContext.tsx';
import { Button, Checkbox, SelectField, TextArea, TextField } from '../ui/primitives.tsx';
import { Dialog } from '../ui/overlay.tsx';
import { MODE_LABEL, PRIORITY_META, PRIORITY_ORDER, STATUS_META, STATUS_ORDER } from '../lib/status.ts';
import { UPDATE_CADENCE_LABEL } from '../lib/schedule.ts';
import { descendantIds, moveProblem } from '../lib/tree.ts';

/** Kinds offered for an objective: a strategy plan offers its kinds, and a top-level objective only the kinds of its focus area. */
export function kindsFor(plan: PlanDetail, _focusAreaId: string | null, parentId: string | null): GoalType[] {
  // kinds stay in the background: only the organization's nesting rules narrow them (under a parent of kind X, or at the top)
  const parentType = parentId ? plan.goals.find((g) => g.id === parentId)?.goal_type_id ?? null : null;
  const limited = (plan.rules ?? []).filter((r) => r.parent_type_id === parentType);
  const list = limited.length ? plan.goal_types.filter((t) => limited.some((r) => r.child_type_id === t.id)) : plan.goal_types;
  // "Objective" first so it is the default everywhere
  return [...list].sort((a, b) => Number(b.name === 'Objective') - Number(a.name === 'Objective'));
}
export type GoalFormMode = { kind: 'create'; parentId?: string | null; focusAreaId?: string | null; typeId?: string | null } | { kind: 'edit'; goal: Goal };

interface Draft {
  title: string; description: string; goal_type_id: string; focus_area_id: string; parent_goal_id: string; owner_id: string; status: Status; priority: Priority;
  weight: string; start_date: string; due_date: string; progress_mode: ProgressMode; progress: string; value_id: string; project_id: string; tags: string; update_cadence: UpdateCadence;
  m_type_id: string; m_name: string; m_unit: string; m_start: string; m_target: string; m_direction: 'increase' | 'decrease'; addMeasure: boolean;
}

export function GoalFormDialog({ mode, onClose }: { mode: GoalFormMode | null; onClose: () => void }) {
  const { plan, planId, members, client, workspace, run, me, can, toast } = usePlanner();
  const [d, setD] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [projects, setProjects] = useState<ProjectRef[]>([]);
  const goals = plan?.goals ?? [];
  const editing = mode?.kind === 'edit' ? mode.goal : null;

  useEffect(() => {
    if (!mode || !plan) { setD(null); return; }
    setErrors({});
    const types = plan.goal_types;
    if (mode.kind === 'edit') {
      const g = mode.goal;
      setD({ title: g.title, description: g.description ?? '', goal_type_id: g.goal_type_id, focus_area_id: g.focus_area_id, parent_goal_id: g.parent_goal_id ?? '', owner_id: g.owner_id ?? '', status: g.status,
        priority: g.priority, weight: String(g.weight), start_date: g.start_date ?? '', due_date: g.due_date ?? '', progress_mode: g.progress_mode, progress: String(Math.round(Number(g.progress))),
        value_id: g.value_id ?? '', project_id: g.project_id ?? '', tags: g.tags.join(', '), update_cadence: g.update_cadence, m_type_id: '', m_name: '', m_unit: '', m_start: '0', m_target: '', m_direction: 'increase', addMeasure: false });
    } else {
      const parent = mode.parentId ? goals.find((g) => g.id === mode.parentId) : null;
      const offered = kindsFor(plan, parent?.focus_area_id ?? mode.focusAreaId ?? plan.focus_areas.find((f) => !f.archived_at)?.id ?? null, mode.parentId ?? null);
      const type = offered.find((t) => t.id === mode.typeId) ?? (parent ? offered.find((t) => t.name === 'Initiative') : null) ?? offered[0] ?? types[0];
      const firstFocus = plan.focus_areas.find((f) => !f.archived_at);
      const wantsMeasure = !!type?.uses_measure;
      setD({ title: '', description: '', goal_type_id: type?.id ?? '', focus_area_id: parent?.focus_area_id ?? mode.focusAreaId ?? firstFocus?.id ?? '', parent_goal_id: mode.parentId ?? '', owner_id: me.id,
        status: 'not_started', priority: 'medium', weight: '1', start_date: '', due_date: '', progress_mode: wantsMeasure ? 'measure' : 'manual', progress: '0', value_id: '', project_id: '', tags: '', update_cadence: 'none',
        m_type_id: '', m_name: '', m_unit: '', m_start: '0', m_target: '', m_direction: 'increase', addMeasure: wantsMeasure });
    }
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps -- reset only when the dialog opens, never on a background refresh

  useEffect(() => { if (mode && workspace) client.projects(workspace.id).then(setProjects); }, [mode, workspace, client]);

  const blocked = useMemo(() => editing ? descendantIds(goals, editing.id) : new Set<string>(), [goals, editing]);
  if (!mode || !d || !plan) return null;
  const offeredKinds = kindsFor(plan, d.focus_area_id || null, d.parent_goal_id || null);
  const kinds = offeredKinds.some((t) => t.id === d.goal_type_id) || !editing ? offeredKinds : [...offeredKinds, ...plan.goal_types.filter((t) => t.id === d.goal_type_id)];
  if (!editing && offeredKinds.length && !offeredKinds.some((t) => t.id === d.goal_type_id)) queueMicrotask(() => setD((x) => x ? { ...x, goal_type_id: offeredKinds[0]!.id } : x));   // focus area or parent changed: pick a kind that fits
  const kpiTypes = (plan.measure_types ?? []).filter((m) => m.kind_ids.length === 0 || m.kind_ids.includes(d.goal_type_id));
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => (x ? { ...x, [k]: v } : x));
  const type = plan.goal_types.find((t) => t.id === d.goal_type_id);
  const parentOptions = goals.filter((g) => !g.archived_at && g.id !== editing?.id && !blocked.has(g.id));
  const parentProblem = d.parent_goal_id ? moveProblem(goals, editing?.id ?? '', d.parent_goal_id) : null;
  const restrictedEditor = !!editing && !can['goal.edit'];   // an owner reporting progress: structure fields are read-only
  const readOnlyStructure = restrictedEditor;

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!d.title.trim()) e.title = 'Give the objective a title.';
    else if (d.title.length > 200) e.title = 'Keep the title under 200 characters.';
    if (!d.focus_area_id && !d.parent_goal_id) e.focus_area_id = 'Choose a focus area.';
    const w = Number(d.weight); if (!Number.isInteger(w) || w < 1 || w > 100) e.weight = 'Use a whole number from 1 to 100.';
    if (d.start_date && d.due_date && d.due_date < d.start_date) e.due_date = 'The due date is before the start date.';
    const p = Number(d.progress); if (d.progress_mode === 'manual' && (!Number.isFinite(p) || p < 0 || p > 100)) e.progress = 'Progress must be between 0 and 100.';
    if (parentProblem) e.parent_goal_id = parentProblem;
    if (!editing && d.addMeasure && can['measure.edit']) {
      if (!d.m_name.trim()) e.m_name = 'Name the measure.';
      if (d.m_target === '' || !Number.isFinite(Number(d.m_target))) e.m_target = 'Enter a target number.';
      else if (Number(d.m_target) === Number(d.m_start)) e.m_target = 'The target must differ from the starting value.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (!validate() || !planId) return;
    setBusy(true);
    const full = {
      title: d.title.trim(), description: d.description.trim() || null, goal_type_id: d.goal_type_id, owner_id: d.owner_id || null, status: d.status, priority: d.priority,
      weight: Number(d.weight), start_date: d.start_date || null, due_date: d.due_date || null, progress_mode: d.progress_mode, value_id: d.value_id || null,
      project_id: d.project_id || null, update_cadence: d.update_cadence, tags: d.tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 20),
      ...(d.progress_mode === 'manual' ? { progress: Number(d.progress) } : {}),
    };
    // a person without edit rights (the goal's owner) can only report status and progress
    const data = restrictedEditor ? { status: d.status, ...(d.progress_mode === 'manual' ? { progress: Number(d.progress) } : {}) } : full;
    const ok = await run(async () => {
      if (editing) {
        const moved = (d.parent_goal_id || null) !== editing.parent_goal_id || (!d.parent_goal_id && d.focus_area_id !== editing.focus_area_id);
        const expected = goals.find((g) => g.id === editing.id)?.updated_at ?? editing.updated_at;
        if (moved && !restrictedEditor) {
          // a kind change is checked against the destination, so move first; the move itself changes updated_at
          if (full.goal_type_id !== editing.goal_type_id) {
            const fits = kindsFor(plan, d.focus_area_id || null, d.parent_goal_id || null).some((t) => t.id === editing.goal_type_id);
            if (!fits) return await client.saveGoal(planId, editing.id, data, expected).then(async (r) => { await client.moveGoal(editing.id, d.focus_area_id || null, d.parent_goal_id || null, []); return r; });
          }
          await client.moveGoal(editing.id, d.focus_area_id || null, d.parent_goal_id || null, []);
          return await client.saveGoal(planId, editing.id, data);
        }
        return await client.saveGoal(planId, editing.id, data, expected);
      }
      const created = await client.saveGoal(planId, null, { ...full, focus_area_id: d.focus_area_id || undefined, parent_goal_id: d.parent_goal_id || undefined });
      if (d.addMeasure && can['measure.edit']) {   // the objective is saved; a failed KPI must not invite a retry that duplicates it
        await client.saveMeasure(created.id, null, { measure_type_id: d.m_type_id || undefined, name: d.m_name.trim(), unit: d.m_unit.trim(), start_value: Number(d.m_start), target_value: Number(d.m_target), direction: d.m_direction })
          .catch(() => toast('The objective was added, but its KPI could not be saved. Add it from the objective’s KPIs tab.', 'error'));
      }
      return created;
    }, { success: editing ? 'Objective saved.' : 'Objective added.' });
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Dialog open title={editing ? 'Edit objective' : d.parent_goal_id ? 'Add a sub-objective' : 'Add an objective'} wide onClose={onClose}
      description={editing ? undefined : 'Objectives sit under a focus area. Add sub-objectives to break one down.'}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={busy} onClick={submit}>{editing ? 'Save changes' : 'Add objective'}</Button></>}>
      {restrictedEditor && <p className="muted" style={{ marginBlockEnd: 'var(--space-3)' }}>You can report status and progress on objectives you own. Ask a strategy lead to change anything else.</p>}
      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
        <div className="span-2"><TextField label="Title" required value={d.title} maxLength={200} error={errors.title} disabled={readOnlyStructure} onChange={(e) => set('title', e.target.value)} /></div>
        <SelectField label="Kind" value={d.goal_type_id} disabled={readOnlyStructure} onChange={(e) => { set('goal_type_id', e.target.value); const t = plan.goal_types.find((x) => x.id === e.target.value); set('m_type_id', ''); if (!editing && t) { set('addMeasure', t.uses_measure); set('progress_mode', t.uses_measure ? 'measure' : 'manual'); } }}>
          {kinds.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </SelectField>
        <SelectField label="Owner" value={d.owner_id} disabled={readOnlyStructure} onChange={(e) => set('owner_id', e.target.value)}>
          <option value="">No owner</option>
          {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
        </SelectField>
        <SelectField label="Sits under" hint="Leave empty to place it directly in the focus area." error={errors.parent_goal_id} value={d.parent_goal_id} disabled={readOnlyStructure}
          onChange={(e) => { set('parent_goal_id', e.target.value); const p = goals.find((g) => g.id === e.target.value); if (p) set('focus_area_id', p.focus_area_id); }}>
          <option value="">— A focus area —</option>
          {parentOptions.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
        </SelectField>
        <SelectField label="Focus area" required error={errors.focus_area_id} value={d.focus_area_id} disabled={readOnlyStructure || !!d.parent_goal_id}
          hint={d.parent_goal_id ? 'A sub-objective stays in its parent’s focus area.' : undefined} onChange={(e) => set('focus_area_id', e.target.value)}>
          {plan.focus_areas.filter((f) => !f.archived_at || f.id === d.focus_area_id).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </SelectField>
        <SelectField label="Status" value={d.status} onChange={(e) => set('status', e.target.value as Status)}>
          {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </SelectField>
        <SelectField label="Priority" value={d.priority} disabled={readOnlyStructure} onChange={(e) => set('priority', e.target.value as Priority)}>
          {PRIORITY_ORDER.map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
        </SelectField>
        <TextField label="Start date" type="date" value={d.start_date} disabled={readOnlyStructure} onChange={(e) => set('start_date', e.target.value)} />
        <TextField label="Due date" type="date" value={d.due_date} error={errors.due_date} disabled={readOnlyStructure} onChange={(e) => set('due_date', e.target.value)} />
        <TextField label="Weight" type="number" min={1} max={100} value={d.weight} error={errors.weight} disabled={readOnlyStructure} hint="How much this counts when a parent averages its children." onChange={(e) => set('weight', e.target.value)} />
        <SelectField label="Progress comes from" value={d.progress_mode} disabled={readOnlyStructure} onChange={(e) => set('progress_mode', e.target.value as ProgressMode)}
          hint={d.progress_mode === 'measure' ? 'Add a measure and record readings.' : d.progress_mode === 'actions' ? 'The share of its actions that are done.' : d.progress_mode === 'children' ? 'The weighted average of its sub-goals.' : undefined}>
          {(Object.keys(MODE_LABEL) as ProgressMode[]).map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
        </SelectField>
        <SelectField label="Ask for an update" hint="Reminds the owner and shows it on the Home screen when an update is late." value={d.update_cadence} disabled={readOnlyStructure} onChange={(e) => set('update_cadence', e.target.value as UpdateCadence)}>
    {Object.entries(UPDATE_CADENCE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
  </SelectField>
  {d.progress_mode === 'manual' && <TextField label="Progress (%)" type="number" min={0} max={100} value={d.progress} error={errors.progress} onChange={(e) => set('progress', e.target.value)} />}
        {plan.values.length > 0 && (
          <SelectField label="Linked value" value={d.value_id} disabled={readOnlyStructure} onChange={(e) => set('value_id', e.target.value)}>
            <option value="">Not linked</option>{plan.values.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </SelectField>)}
        {projects.length > 0 && (
          <SelectField label="Linked project" hint="Work stays in Projects; this only links to it." value={d.project_id} disabled={readOnlyStructure} onChange={(e) => set('project_id', e.target.value)}>
            <option value="">No project</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </SelectField>)}
        <div className="span-2"><TextField label="Tags" hint="Separate with commas." value={d.tags} disabled={readOnlyStructure} onChange={(e) => set('tags', e.target.value)} /></div>
        <div className="span-2"><TextArea label="Description" value={d.description} disabled={readOnlyStructure} maxLength={4000} onChange={(e) => set('description', e.target.value)} /></div>
        {!editing && (type?.uses_measure || kpiTypes.length > 0) && can['measure.edit'] && (   // shown when the kind is measured or KPI types are tied to it
          <fieldset className="span-2 form-grid" style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' }}>
            <legend style={{ padding: '0 var(--space-2)', fontWeight: 600 }}>Measure</legend>
            <div className="span-2"><Checkbox label="Track this objective with a KPI" checked={d.addMeasure} onChange={(v) => { set('addMeasure', v); if (v) set('progress_mode', 'measure'); }} /></div>
            {d.addMeasure && <>
              {kpiTypes.length > 0 && <div className="span-2"><SelectField label="KPI type" hint="Pick a reusable one from Strategy model, or leave it as custom." value={d.m_type_id} onChange={(e) => { const m = kpiTypes.find((x) => x.id === e.target.value); set('m_type_id', e.target.value); if (m) { set('m_name', m.name); set('m_unit', m.unit); set('m_direction', m.direction); } }}>
                <option value="">Custom</option>
                {kpiTypes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </SelectField></div>}
              <TextField label="Measure name" required value={d.m_name} error={errors.m_name} onChange={(e) => set('m_name', e.target.value)} placeholder="e.g. Monthly recurring revenue" />
              <TextField label="Unit" value={d.m_unit} maxLength={20} onChange={(e) => set('m_unit', e.target.value)} placeholder="$, %, clients…" />
              <TextField label="Starting value" type="number" step="any" value={d.m_start} onChange={(e) => set('m_start', e.target.value)} />
              <TextField label="Target" type="number" step="any" required value={d.m_target} error={errors.m_target} onChange={(e) => set('m_target', e.target.value)} />
              <SelectField label="Success means" value={d.m_direction} onChange={(e) => set('m_direction', e.target.value as 'increase' | 'decrease')}>
                <option value="increase">The number goes up</option><option value="decrease">The number goes down</option>
              </SelectField>
            </>}
          </fieldset>)}
      </form>
    </Dialog>
  );
}
