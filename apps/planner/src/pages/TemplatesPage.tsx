import { useState } from 'react';
import { PlannerError } from '../api/types.ts';
import { usePlanner } from '../state/PlannerContext.tsx';
import { Button, Chip, EmptyState, ProgressBar, TextField } from '../ui/primitives.tsx';
import { Dialog } from '../ui/overlay.tsx';
import { CADENCE_LABEL } from '../lib/status.ts';
import { formatNumber, plural } from '../lib/format.ts';
import { PLAN_TEMPLATES, addDays, type PlanTemplate, type TemplateGoal } from '../lib/templates.ts';

const measureCount = (t: PlanTemplate) => t.goals.filter((g) => g.measure).length;

function Structure({ t }: { t: PlanTemplate }) {
  const children = (i: number) => t.goals.map((g, idx) => ({ g, idx })).filter((x) => x.g.parent === i);
  const goalLine = (g: TemplateGoal, idx: number, depth: number): React.ReactNode => (
    <li key={idx} className="tp-goal" style={{ paddingInlineStart: `${depth * 18}px` }}>
      <Chip>{g.type}</Chip> <span>{g.title}</span>
      {g.measure && <span className="muted"> · {g.measure.name}: {formatNumber(g.measure.start, g.measure.unit)} to {formatNumber(g.measure.target, g.measure.unit)}</span>}
    </li>
  );
  const walk = (idx: number, depth: number): React.ReactNode[] => [goalLine(t.goals[idx]!, idx, depth), ...children(idx).flatMap((c) => walk(c.idx, depth + 1))];
  return (
    <div className="tp-structure">
      <h3>Values</h3>
      <ul className="tp-values">{t.values.map((v) => <li key={v.name}><strong>{v.name}</strong> <span className="muted">{v.description}</span></li>)}</ul>
      <h3>Focus areas and objectives</h3>
      {t.focusAreas.map((f, fi) => (
        <div key={f.name} className="tp-focus">
          <div className="tp-focus__head"><span className="tp-swatch" style={{ background: `var(--fa-${f.color})` }} aria-hidden="true" /><strong>{f.name}</strong></div>
          <ul className="tp-goals">{t.goals.map((g, idx) => ({ g, idx })).filter((x) => x.g.focus === fi && x.g.parent === undefined).flatMap((x) => walk(x.idx, 0))}</ul>
        </div>
      ))}
    </div>
  );
}

export default function TemplatesPage() {
  const { can } = usePlanner();
  const [chosen, setChosen] = useState<PlanTemplate | null>(null);

  if (!can['plan.manage']) {
    return <EmptyState title="Templates are not available to you">Starting a plan from a template needs permission to manage plans. Ask a plan manager to set one up.</EmptyState>;
  }
  const canGoals = can['goal.create'];

  return (
    <div className="stack">
      <div>
        <h2 className="page-title">Templates</h2>
        <p className="page-lede">Start a new plan with values, focus areas and objectives already laid out, then make it yours. Owners are left empty for you to assign.</p>
        <p className="muted">Saving your own templates is planned for later and is not available yet.</p>
      </div>
      {!canGoals && <p className="muted" role="note">You can manage plans but not create objectives, so templates are switched off for you.</p>}
      <ul className="tp-grid">
        {PLAN_TEMPLATES.map((t) => (
          <li key={t.id} className="card tp-card">
            <div>
              <h2 className="tp-card__name">{t.name}</h2>
              <p className="muted">{t.bestFor}</p>
            </div>
            <p>{t.description}</p>
            <div className="row">
              <Chip>{plural(t.focusAreas.length, 'focus area')}</Chip><Chip>{plural(t.goals.length, 'goal')}</Chip>
              <Chip>{plural(measureCount(t), 'measure')}</Chip><Chip>{CADENCE_LABEL[t.cadence]} reviews</Chip>
            </div>
            <div className="row">
              {t.focusAreas.map((f) => <span key={f.name} className="tp-pill"><span className="tp-swatch" style={{ background: `var(--fa-${f.color})` }} aria-hidden="true" />{f.name}</span>)}
            </div>
            <details>
              <summary className="tp-summary">Preview structure</summary>
              <Structure t={t} />
            </details>
            <div className="tp-card__foot">
              <Button variant="primary" disabled={!canGoals} title={canGoals ? undefined : 'Creating objectives needs extra permission.'} onClick={() => setChosen(t)}>Use this template</Button>
            </div>
          </li>
        ))}
      </ul>
      {chosen && <UseDialog t={chosen} onClose={() => setChosen(null)} />}
    </div>
  );
}

function UseDialog({ t, onClose }: { t: PlanTemplate; onClose: () => void }) {
  const { client, workspace, plan, run, refresh, selectPlan, navigate, today, can } = usePlanner();
  const [name, setName] = useState(`${t.name} ${today.slice(0, 4)}`);
  const [start, setStart] = useState(today);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<'form' | 'running' | 'failed'>('form');
  const [progress, setProgress] = useState({ done: 0, total: 1, label: '' });
  const [failure, setFailure] = useState<string | null>(null);
  const [partialId, setPartialId] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);

  const withMeasures = can['measure.edit'];
  const total = 1 + t.values.length + t.focusAreas.length + t.goals.length + (withMeasures ? measureCount(t) * 2 : 0);

  const go = async () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Give the plan a name.';
    if (!start) e.start = 'Choose a start date.';
    setErrors(e);
    if (Object.keys(e).length || !workspace) return;
    setPhase('running'); setFailure(null); setPartialId(null);
    let done = 0; let step = 'Creating the plan';
    const tick = (label: string) => { done++; setProgress({ done, total, label }); };
    setProgress({ done: 0, total, label: step });

    const result = await run(async () => {
      try {
        const created = await client.savePlan(workspace.id, null, {
          name: name.trim(), description: t.description, vision: t.vision, period_start: start, period_end: addDays(start, t.durationDays), review_cadence: t.cadence,
        });
        setPartialId(created.id); tick('Plan created');

        // Goal types are shared by the organization: reuse existing ones by name and add any that are missing.
        const typeIds = new Map(((await client.model(workspace.id))?.types ?? plan?.goal_types ?? []).map((g) => [g.name.toLowerCase(), g.id] as const));   // works with no plan open yet
        // KPIs are measures on an objective and "Project" belongs to the Projects app, so templates map them to plain kinds
        const plain: Record<string, string> = { kpi: 'objective', project: 'initiative' };
        const kindOf = (name: string) => { const n = name.toLowerCase(); return typeIds.has(n) ? n : plain[n] ?? n; };
        for (const name of new Set(t.goals.map((g) => kindOf(g.type)))) {
          if (typeIds.has(name)) continue;
          step = `Adding the objective kind ${name}`;
          typeIds.set(name, (await client.saveGoalType(workspace.id, null, { name: name[0]!.toUpperCase() + name.slice(1) })).id);
        }
        const valueIds: string[] = [];
        for (const v of t.values) { step = `Adding the value "${v.name}"`; valueIds.push((await client.saveValue(created.id, null, v)).id); tick(step); }
        const focusIds: string[] = [];
        for (const f of t.focusAreas) { step = `Adding the focus area "${f.name}"`; focusIds.push((await client.saveFocusArea(created.id, null, f)).id); tick(step); }

        const goalIds: string[] = [];
        for (const g of t.goals) {
          step = `Adding the objective "${g.title}"`;
          const goal = await client.saveGoal(created.id, null, {
            title: g.title, goal_type_id: typeIds.get(kindOf(g.type)), focus_area_id: focusIds[g.focus], parent_goal_id: g.parent !== undefined ? goalIds[g.parent] : undefined,
            priority: g.priority ?? 'medium', weight: 1, status: 'not_started', progress_mode: g.measure && withMeasures ? 'manual' : (g.mode ?? 'manual'),
            start_date: addDays(start, g.startDays ?? 0), due_date: addDays(start, g.dueDays), value_id: g.value !== undefined ? valueIds[g.value] : undefined,
          });
          goalIds.push(goal.id); tick(step);
          if (g.measure && withMeasures) {
            step = `Adding the measure "${g.measure.name}"`;
            await client.saveMeasure(goal.id, null, { name: g.measure.name, unit: g.measure.unit, start_value: g.measure.start, target_value: g.measure.target, direction: g.measure.direction, cadence: g.measure.cadence });
            tick(step);
            await client.saveGoal(created.id, goal.id, { progress_mode: g.mode ?? 'measure' });
            tick(step);
          }
        }
        return created.id;
      } catch (err) {
        setFailure(`${step} did not work. ${err instanceof PlannerError ? err.message : 'Something went wrong.'}`);
        setPhase('failed');
        throw err;
      }
    }, { success: 'Plan created from the template.' });

    if (result) { selectPlan(result); navigate('overview', { plan: result }); onClose(); }
    else await refresh().catch(() => {});
  };

  const archivePartial = async () => {
    if (!partialId) return;
    setArchiving(true);
    const ok = await run(() => client.setPlanArchived(partialId, true), { success: 'The unfinished plan was archived.' });
    setArchiving(false);
    if (ok) onClose();
  };

  return (
    <Dialog open title={`Use "${t.name}"`} onClose={phase === 'running' ? () => undefined : onClose}
      description="This creates a new plan. Your current plan is not changed."
      footer={phase === 'form' ? <><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={go}>Create plan</Button></>
        : phase === 'failed' ? <>{partialId && <Button variant="danger" busy={archiving} onClick={archivePartial}>Archive the unfinished plan</Button>}<Button onClick={onClose}>{partialId ? 'Keep it for now' : 'Close'}</Button></>
        : undefined}>
      {phase === 'form' && (
        <form className="form-grid" noValidate onSubmit={(e) => { e.preventDefault(); void go(); }}>
          <div className="span-2"><TextField label="Plan name" required maxLength={120} value={name} error={errors.name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="span-2"><TextField label="Start date" required type="date" value={start} error={errors.start}
            hint={`Due dates are set relative to this date, over ${plural(t.durationDays, 'day')}. Owners are left empty.`} onChange={(e) => setStart(e.target.value)} /></div>
          <p className="span-2 muted">You will get {plural(t.values.length, 'value')}, {plural(t.focusAreas.length, 'focus area')} and {plural(t.goals.length, 'goal')}{withMeasures ? `, ${plural(measureCount(t), 'with a measure', 'with measures')}` : ''}.{!withMeasures && ' Measures are skipped because you cannot edit them.'}</p>
        </form>
      )}
      {phase !== 'form' && (
        <div className="stack" aria-live="polite">
          <ProgressBar value={(progress.done / progress.total) * 100} label="Creating the plan" />
          <p>{phase === 'running' ? `Step ${Math.min(progress.done + 1, progress.total)} of ${progress.total}: ${progress.label}...` : `Stopped after ${progress.done} of ${progress.total} steps.`}</p>
          {failure && <div className="state state--error" role="alert"><p className="state__text">{failure}</p>{partialId && <p className="state__text">A partly built plan was left behind. You can archive it, or keep it and finish it by hand.</p>}</div>}
        </div>
      )}
    </Dialog>
  );
}
