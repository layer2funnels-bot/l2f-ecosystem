import { useState, type FormEvent } from 'react';
import type { Risk } from '../../api/types.ts';
import { usePlanner } from '../../state/PlannerContext.tsx';
import { useDialogs } from '../Dialogs.tsx';
import { Button, Chip, EmptyState, SelectField, TextArea, TextField } from '../../ui/primitives.tsx';
import { IMPACT, LIKELIHOOD, LOCKED_REASON, RISK_STATUS, severityBand, useSave, type TabProps } from './shared.tsx';

export function Heat({ likelihood, impact }: { likelihood: number; impact: number }) {
  const cells = [];
  for (let i = 5; i >= 1; i--) for (let l = 1; l <= 5; l++) {
    const band = severityBand(l * i);
    cells.push(<span key={`${l}-${i}`} className={`gd-heat__cell gd-heat__cell--${band.label.toLowerCase()}${l === likelihood && i === impact ? ' is-here' : ''}`} />);
  }
  return <span className="gd-heat" role="img" aria-label={`Likelihood ${likelihood} of 5, impact ${impact} of 5`}>{cells}</span>;
}

function RiskForm({ goalId, risk, onDone }: { goalId: string; risk?: Risk; onDone: () => void }) {
  const { client, members } = usePlanner();
  const { busy, save } = useSave();
  const [title, setTitle] = useState(risk?.title ?? '');
  const [description, setDescription] = useState(risk?.description ?? '');
  const [likelihood, setLikelihood] = useState(risk?.likelihood ?? 3);
  const [impact, setImpact] = useState(risk?.impact ?? 3);
  const [mitigation, setMitigation] = useState(risk?.mitigation ?? '');
  const [owner, setOwner] = useState(risk?.owner_id ?? '');
  const [status, setStatus] = useState<Risk['status']>(risk?.status ?? 'open');
  const [err, setErr] = useState<string | undefined>();
  const band = severityBand(likelihood * impact);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setErr('Give the risk a short title.'); return; }
    setErr(undefined);
    const ok = await save(() => client.saveRisk(goalId, risk?.id ?? null, {
      title: title.trim(), description: description.trim(), likelihood, impact, mitigation: mitigation.trim(), owner_id: owner || null, status,
    }), risk ? 'Risk saved.' : 'Risk added.');
    if (ok) onDone();
  };

  return (
    <form className="gd-card gd-form" onSubmit={submit} noValidate aria-label={risk ? `Edit risk ${risk.title}` : 'Add a risk'}>
      <h3 className="gd-h">{risk ? 'Edit risk' : 'Add a risk'}</h3>
      <TextField label="Title" required value={title} error={err} onChange={(e) => setTitle(e.target.value)} />
      <TextArea label="Description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      <div className="gd-grid">
        <SelectField label="Likelihood" value={likelihood} onChange={(e) => setLikelihood(Number(e.target.value))}>
          {LIKELIHOOD.map((l, i) => <option key={l} value={i + 1}>{i + 1} - {l}</option>)}
        </SelectField>
        <SelectField label="Impact" value={impact} onChange={(e) => setImpact(Number(e.target.value))}>
          {IMPACT.map((l, i) => <option key={l} value={i + 1}>{i + 1} - {l}</option>)}
        </SelectField>
      </div>
      <p className="gd-row gd-small" aria-live="polite"><Heat likelihood={likelihood} impact={impact} /> Severity: <strong>{band.label} ({likelihood * impact})</strong></p>
      <TextArea label="Mitigation" rows={2} value={mitigation} onChange={(e) => setMitigation(e.target.value)} hint="What will reduce the chance or the damage?" />
      <div className="gd-grid">
        <SelectField label="Owner" value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">No owner</option>
          {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
        </SelectField>
        <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value as Risk['status'])}>
          {RISK_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </SelectField>
      </div>
      <div className="form-actions"><Button onClick={onDone}>Cancel</Button><Button type="submit" variant="primary" busy={busy}>{risk ? 'Save risk' : 'Add risk'}</Button></div>
    </form>
  );
}

function RiskCard({ r, editable, onEdit }: { r: Risk; editable: boolean; onEdit: () => void }) {
  const { client } = usePlanner();
  const dialogs = useDialogs();
  const { busy, save } = useSave();
  const band = severityBand(r.severity);
  const archive = async () => {
    const ok = await dialogs.confirm({ title: 'Archive this risk?', body: <p>“{r.title}” will be hidden from the list.</p>, confirmLabel: 'Archive risk', danger: true });
    if (ok) await save(() => client.saveRisk(r.goal_id, r.id, { archived: true }), 'Risk archived.');
  };
  return (
    <li className={`gd-card gd-risk${r.status === 'closed' ? ' is-closed' : ''}`}>
      <div className="gd-row">
        <Heat likelihood={r.likelihood} impact={r.impact} />
        <div className="gd-grow">
          <h4 className="gd-h4">{r.title}</h4>
          <p className="gd-small">
            <Chip tone={band.tone}>{band.label} ({r.severity})</Chip>{' '}
            <span className="muted">Likelihood {r.likelihood} × impact {r.impact}</span>{' '}
            <Chip>{RISK_STATUS.find((s) => s.value === r.status)?.label}</Chip>
          </p>
        </div>
        {editable && <div className="gd-action__btns"><Button size="sm" variant="ghost" onClick={onEdit} aria-label={`Edit risk “${r.title}”`}>Edit</Button><Button size="sm" variant="ghost" busy={busy} onClick={archive} aria-label={`Archive risk “${r.title}”`}>Archive</Button></div>}
      </div>
      {r.description && <p className="gd-pre">{r.description}</p>}
      {r.mitigation && <p className="gd-pre"><strong>Mitigation: </strong>{r.mitigation}</p>}
      <p className="muted gd-small">Owner: {r.owner_name ?? 'No owner'}</p>
    </li>
  );
}

export function RisksTab({ d, locked }: TabProps) {
  const { can } = usePlanner();
  const [form, setForm] = useState<'new' | string | null>(null);
  const editable = can['action.manage'] && !locked;
  const risks = d.risks.filter((r) => !r.archived_at).sort((a, b) => (a.status === 'closed' ? 1 : 0) - (b.status === 'closed' ? 1 : 0) || b.severity - a.severity);

  return (
    <div className="gd-stack">
      <div className="gd-row gd-row--between">
        <h3 className="gd-h">Risks ({risks.length})</h3>
        <Button variant="primary" size="sm" disabled={!editable} title={locked ? LOCKED_REASON : !can['action.manage'] ? 'You do not have permission to change risks.' : undefined} onClick={() => setForm('new')}>Add risk</Button>
      </div>
      {!editable && <p className="gd-note" role="note">{locked ? LOCKED_REASON : 'You do not have permission to change risks.'}</p>}
      <p className="muted gd-small">Severity is likelihood × impact, each scored 1 to 5. The highlighted square shows where the risk sits.</p>
      {form === 'new' && <RiskForm goalId={d.goal.id} onDone={() => setForm(null)} />}
      {risks.length === 0 && form !== 'new' && <EmptyState title="No risks recorded">Note anything that could stop this objective from succeeding, and how you will handle it.</EmptyState>}
      <ul className="gd-actions">
        {risks.map((r) => form === r.id
          ? <li key={r.id}><RiskForm goalId={d.goal.id} risk={r} onDone={() => setForm(null)} /></li>
          : <RiskCard key={r.id} r={r} editable={editable} onEdit={() => setForm(r.id)} />)}
      </ul>
    </div>
  );
}
