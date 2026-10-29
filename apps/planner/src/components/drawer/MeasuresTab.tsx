import { useState, type FormEvent } from 'react';
import type { Measure } from '../../api/types.ts';
import { usePlanner } from '../../state/PlannerContext.tsx';
import { useDialogs } from '../Dialogs.tsx';
import { CADENCE_LABEL, MODE_LABEL } from '../../lib/status.ts';
import { formatDate, formatNumber, percent } from '../../lib/format.ts';
import { Button, EmptyState, ProgressBar, SelectField, TextField } from '../../ui/primitives.tsx';
import { Sparkline } from '../../ui/charts.tsx';
import { LOCKED_REASON, isNum, useSave, type TabProps } from './shared.tsx';

function MeasureForm({ goalId, kindId, measure, onDone }: { goalId: string; kindId: string; measure?: Measure; onDone: () => void }) {
  const { client, plan } = usePlanner();
  const kpiTypes = (plan?.measure_types ?? []).filter((m) => m.kind_ids.length === 0 || m.kind_ids.includes(kindId));
  const [typeId, setTypeId] = useState('');
  const { busy, save } = useSave();
  const [name, setName] = useState(measure?.name ?? '');
  const [unit, setUnit] = useState(measure?.unit ?? '');
  const [start, setStart] = useState(String(measure?.start_value ?? 0));
  const [target, setTarget] = useState(measure ? String(measure.target_value) : '');
  const [direction, setDirection] = useState<'increase' | 'decrease'>(measure?.direction ?? 'increase');
  const [cadence, setCadence] = useState(measure?.cadence ?? 'monthly');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Give the measure a name.';
    if (!isNum(start)) errs.start = 'Enter a number.';
    if (!isNum(target)) errs.target = 'Enter a number.';
    else if (isNum(start) && Number(start) === Number(target)) errs.target = 'The target must differ from the starting value.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const ok = await save(() => client.saveMeasure(goalId, measure?.id ?? null, {
      ...(measure ? {} : { measure_type_id: typeId || undefined }), name: name.trim(), unit: unit.trim(), start_value: Number(start), target_value: Number(target), direction, cadence,
    }), measure ? 'KPI saved.' : 'KPI added.');
    if (ok) onDone();
  };

  return (
    <form className="gd-card gd-form" onSubmit={submit} noValidate aria-label={measure ? `Edit measure ${measure.name}` : 'Add a KPI'}>
      <h3 className="gd-h">{measure ? 'Edit KPI' : 'Add a KPI'}</h3>
      <div className="gd-grid">
        {!measure && kpiTypes.length > 0 && <SelectField label="KPI type" hint="Reuse one from Strategy model, or keep Custom." value={typeId} onChange={(e) => { const m = kpiTypes.find((x) => x.id === e.target.value); setTypeId(e.target.value); if (m) { setName(m.name); setUnit(m.unit); setDirection(m.direction); } }}>
          <option value="">Custom</option>{kpiTypes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </SelectField>}
        <TextField label="Name" required value={name} error={errors.name} onChange={(e) => setName(e.target.value)} />
        <TextField label="Unit" value={unit} hint="For example %, $, leads" onChange={(e) => setUnit(e.target.value)} />
        <TextField label="Starting value" type="number" step="any" value={start} error={errors.start} onChange={(e) => setStart(e.target.value)} />
        <TextField label="Target" type="number" step="any" required value={target} error={errors.target} onChange={(e) => setTarget(e.target.value)} />
        <SelectField label="Good direction" value={direction} onChange={(e) => setDirection(e.target.value as 'increase' | 'decrease')}>
          <option value="increase">Higher is better</option><option value="decrease">Lower is better</option>
        </SelectField>
        <SelectField label="How often to check" value={cadence} onChange={(e) => setCadence(e.target.value as Measure['cadence'])}>
          {Object.entries(CADENCE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </SelectField>
      </div>
      <div className="form-actions"><Button onClick={onDone}>Cancel</Button><Button type="submit" variant="primary" busy={busy}>{measure ? 'Save measure' : 'Add measure'}</Button></div>
    </form>
  );
}

function ReadingForm({ measure, today, onDone }: { measure: Measure; today: string; onDone: () => void }) {
  const { client } = usePlanner();
  const { busy, save } = useSave();
  const [date, setDate] = useState(today);
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!isNum(value)) errs.value = 'Enter the measured value as a number.';
    if (!date) errs.date = 'Pick the date of the reading.';
    else if (date > today) errs.date = 'A reading cannot be dated in the future.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const ok = await save(() => client.recordReading(measure.id, Number(value), date, note.trim()), 'Reading recorded.');
    if (ok) onDone();
  };
  return (
    <form className="gd-form gd-inline-form" onSubmit={submit} noValidate aria-label={`Record a reading for ${measure.name}`}>
      <div className="gd-grid">
        <TextField label="Date" type="date" required value={date} max={today} error={errors.date} onChange={(e) => setDate(e.target.value)} />
        <TextField label={`Value${measure.unit ? ` (${measure.unit})` : ''}`} type="number" step="any" required value={value} error={errors.value} onChange={(e) => setValue(e.target.value)} />
      </div>
      <TextField label="Note" value={note} hint="Optional" onChange={(e) => setNote(e.target.value)} />
      <p className="muted gd-small">Readings are permanent. If one is wrong, record a corrected reading.</p>
      <div className="form-actions"><Button onClick={onDone}>Cancel</Button><Button type="submit" variant="primary" busy={busy}>Save reading</Button></div>
    </form>
  );
}

function MeasureCard({ m, locked, canReading, canEdit, onEdit }: { m: Measure; locked: boolean; canReading: boolean; canEdit: boolean; onEdit: () => void }) {
  const { today, client } = usePlanner();
  const dialogs = useDialogs();
  const { busy, save } = useSave();
  const [recording, setRecording] = useState(false);
  const values = m.readings.map((r) => r.value);
  const rows = [...m.readings].reverse();

  const archive = async () => {
    const ok = await dialogs.confirm({ title: 'Archive this measure?', body: <p>“{m.name}” will be hidden. Its readings are kept.</p>, confirmLabel: 'Archive measure', danger: true });
    if (ok) await save(() => client.saveMeasure(m.goal_id, m.id, { archived: true }), 'Measure archived.');
  };

  return (
    <article className="gd-card gd-stack" aria-label={`Measure ${m.name}`}>
      <div className="gd-row">
        <div className="gd-grow">
          <h4 className="gd-h4">{m.name}</h4>
          <p className="muted gd-small">{CADENCE_LABEL[m.cadence] ?? m.cadence} · {m.direction === 'increase' ? 'higher is better' : 'lower is better'} · started at {formatNumber(m.start_value, m.unit)}</p>
        </div>
        {canEdit && <><Button size="sm" onClick={onEdit}>Edit</Button><Button size="sm" variant="ghost" busy={busy} onClick={archive}>Archive</Button></>}
      </div>
      <div className="gd-row">
        <p className="gd-big mono">{formatNumber(m.current_value, m.unit)} <span className="muted gd-small">of {formatNumber(m.target_value, m.unit)}</span></p>
        <Sparkline values={values} target={m.target_value} direction={m.direction} width={140} height={36} label={`${m.name} readings over time`} />
      </div>
      <div className="gd-progress"><strong className="mono">{percent(m.progress)}</strong><div className="gd-progress__bar"><ProgressBar value={m.progress} label={`${m.name} progress`} thin /></div></div>

      {recording ? <ReadingForm measure={m} today={today} onDone={() => setRecording(false)} /> : (
        <div><Button size="sm" disabled={!canReading || locked} title={locked ? LOCKED_REASON : !canReading ? 'You do not have permission to record readings.' : undefined} onClick={() => setRecording(true)}>Record reading</Button></div>
      )}

      {rows.length === 0 ? <p className="muted">No readings yet.</p> : (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Readings for {m.name}, newest first</caption>
            <thead><tr><th scope="col">Date</th><th scope="col" className="num">Value</th><th scope="col">Note</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.id}><td>{formatDate(r.recorded_on, { year: true })}</td><td className="num">{formatNumber(r.value, m.unit)}</td><td>{r.note ?? ''}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </article>
  );
}

export function MeasuresTab({ d, locked }: TabProps) {
  const { can } = usePlanner();
  const [form, setForm] = useState<'new' | string | null>(null);
  const measures = d.measures.filter((m) => !m.archived_at);
  const canEdit = can['measure.edit'] && !locked;
  const canReading = can['update.post'];
  const mode = d.goal.progress_mode;

  return (
    <div className="gd-stack">
      {mode !== 'measure' && (
        <p className="gd-note" role="note">This objective's progress is “{(MODE_LABEL[mode] ?? mode).toLowerCase()}”, so measures are shown for information and do not change its progress. To drive progress from a measure, change the progress mode in Edit objective.</p>
      )}
      {!canEdit && <p className="gd-note" role="note">{locked ? LOCKED_REASON : 'You do not have permission to add or edit measures.'}</p>}
      <div className="gd-row gd-row--between">
        <h3 className="gd-h">Measures ({measures.length})</h3>
        <Button variant="primary" size="sm" disabled={!canEdit} title={locked ? LOCKED_REASON : !can['measure.edit'] ? 'You do not have permission to add measures.' : undefined} onClick={() => setForm('new')}>Add measure</Button>
      </div>
      <p className="muted gd-small">Readings are permanent and cannot be edited or deleted.</p>
      {form === 'new' && <MeasureForm kindId={d.goal.goal_type_id} goalId={d.goal.id} onDone={() => setForm(null)} />}
      {measures.length === 0 && form !== 'new' && <EmptyState title="No KPIs yet">A measure tracks a number against a target, such as revenue or sign-ups.</EmptyState>}
      {measures.map((m) => form === m.id
        ? <MeasureForm key={m.id} kindId={d.goal.goal_type_id} goalId={d.goal.id} measure={m} onDone={() => setForm(null)} />
        : <MeasureCard key={m.id} m={m} locked={locked} canReading={canReading} canEdit={canEdit} onEdit={() => setForm(m.id)} />)}
    </div>
  );
}
