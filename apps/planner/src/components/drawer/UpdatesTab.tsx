import { useState, type FormEvent } from 'react';
import type { Confidence, Status } from '../../api/types.ts';
import { usePlanner } from '../../state/PlannerContext.tsx';
import { STATUS_ORDER, STATUS_META } from '../../lib/status.ts';
import { formatDateTime, percent, relativeTime } from '../../lib/format.ts';
import { Button, EmptyState, SelectField, StatusBadge, TextArea, TextField } from '../../ui/primitives.tsx';
import { CONFIDENCE, isNum, useSave, type TabProps } from './shared.tsx';

export function UpdatesTab({ d, locked }: TabProps) {
  const { can, client, me } = usePlanner();
  const g = d.goal;
  const manual = g.progress_mode === 'manual';
  const [status, setStatus] = useState<Status | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<Confidence>('medium');
  const [summary, setSummary] = useState('');
  const [risk, setRisk] = useState('');
  const [next, setNext] = useState('');
  const [errors, setErrors] = useState<{ summary?: string; progress?: string }>({});
  const { busy, save } = useSave();
  // the database also requires edit rights or ownership of this objective (0005 updates insert policy)
  const canPost = can['update.post'] && (can['goal.edit'] || g.owner_id === me.id) && !locked;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!summary.trim()) errs.summary = 'Write a short summary of what has happened.';
    const p = progress ?? String(g.progress);
    if (manual && (!isNum(p) || Number(p) < 0 || Number(p) > 100)) errs.progress = 'Enter a number from 0 to 100.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const ok = await save(() => client.postUpdate(g.id, {
      status: status ?? g.status, ...(manual ? { progress: Number(p) } : {}), confidence,
      summary: summary.trim(), risk: risk.trim(), next_step: next.trim(),
    }), 'Update posted.');
    if (ok) { setSummary(''); setRisk(''); setNext(''); setStatus(null); setProgress(null); }
  };

  return (
    <div className="gd-stack">
      {canPost ? (
        <form className="gd-card gd-form" onSubmit={submit} noValidate aria-labelledby="gd-post-h">
          <h3 id="gd-post-h" className="gd-h">Post an update</h3>
          <div className="gd-grid">
            <SelectField label="Status" value={status ?? g.status} onChange={(e) => setStatus(e.target.value as Status)}>
              {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
            </SelectField>
            {manual ? (
              <TextField label="Progress (%)" type="number" min={0} max={100} step="any" value={progress ?? String(g.progress)} error={errors.progress}
                onChange={(e) => setProgress(e.target.value)} />
            ) : (
              <div className="field"><span className="field__label">Progress</span><p className="field__hint">Calculated automatically for this objective, so it is not typed here.</p></div>
            )}
            <SelectField label="Confidence" value={confidence} onChange={(e) => setConfidence(e.target.value as Confidence)}>
              {CONFIDENCE.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </SelectField>
          </div>
          <TextArea label="Summary" required value={summary} error={errors.summary} onChange={(e) => setSummary(e.target.value)} hint="What happened since the last update?" />
          <TextArea label="Risk" rows={2} value={risk} onChange={(e) => setRisk(e.target.value)} hint="Optional. Anything that could get in the way." />
          <TextArea label="Next step" rows={2} value={next} onChange={(e) => setNext(e.target.value)} hint="Optional. What happens next." />
          <div className="form-actions"><Button type="submit" variant="primary" busy={busy}>Post update</Button></div>
        </form>
      ) : (
        <p className="gd-note" role="note">{locked ? 'This plan is archived. Restore it to post updates.' : 'You can read updates but not post them.'}</p>
      )}

      <section aria-labelledby="gd-upd-h" className="gd-stack">
        <h3 id="gd-upd-h" className="gd-h">Updates ({d.updates.length})</h3>
        <p className="muted gd-small">Updates are permanent and cannot be edited. To correct one, post a new update.</p>
        {d.updates.length === 0 ? <EmptyState title="No updates yet">Updates will appear here as the objective owner reports progress.</EmptyState> : (
          <ol className="gd-feed">
            {d.updates.map((u) => (
              <li key={u.id} className="gd-card">
                <div className="gd-feed__head">
                  <strong>{u.author_name ?? 'Someone'}</strong>
                  <time className="muted" dateTime={u.created_at} title={formatDateTime(u.created_at)}>{relativeTime(u.created_at)}</time>
                  <StatusBadge status={u.status} />
                  {u.progress !== null && <span className="chip chip--accent">{percent(u.progress)}</span>}
                  {u.confidence && <span className="chip">Confidence: {u.confidence}</span>}
                </div>
                <p className="gd-pre">{u.summary}</p>
                {u.risk && <p className="gd-pre"><strong>Risk: </strong>{u.risk}</p>}
                {u.next_step && <p className="gd-pre"><strong>Next step: </strong>{u.next_step}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
