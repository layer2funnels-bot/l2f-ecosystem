import { useEffect, useState, type ReactNode } from 'react';
import type { Cadence, FocusArea, PlanValue } from '../api/types.ts';
import { usePlanner } from '../state/PlannerContext.tsx';
import { useDialogs } from '../components/Dialogs.tsx';
import { Button, Chip, EmptyState, IconButton, SelectField, TextArea, TextField } from '../ui/primitives.tsx';
import { CADENCE_LABEL } from '../lib/status.ts';
import { formatDate, plural } from '../lib/format.ts';

function moved<T extends { id: string }>(list: T[], index: number, delta: number): string[] | null {
  const to = index + delta;
  if (to < 0 || to >= list.length) return null;
  const ids = list.map((x) => x.id);
  [ids[index], ids[to]] = [ids[to]!, ids[index]!];
  return ids;
}

function MoveButtons({ index, count, name, disabled, onMove }: { index: number; count: number; name: string; disabled?: boolean; onMove: (delta: number) => void }) {
  return (
    <>
      <IconButton label={`Move ${name} up`} disabled={disabled || index === 0} onClick={() => onMove(-1)}>{'↑'}</IconButton>
      <IconButton label={`Move ${name} down`} disabled={disabled || index === count - 1} onClick={() => onMove(1)}>{'↓'}</IconButton>
    </>
  );
}

function Panel({ title, id, children, help }: { title: string; id: string; children: ReactNode; help?: ReactNode }) {
  return (
    <section className="card ps-panel" aria-labelledby={id}>
      <div><h2 className="section__title" id={id}>{title}</h2>{help && <p className="muted">{help}</p>}</div>
      {children}
    </section>
  );
}

export default function PlanSettingsPage() {
  const { plan, planId, can, client, workspace, run, toast } = usePlanner();
  const dialogs = useDialogs();
  const [vision, setVision] = useState('');
  const [cadence, setCadence] = useState<Cadence>('monthly');
  const [busy, setBusy] = useState<string | null>(null);
  const p = plan?.plan;
  useEffect(() => { setVision(p?.vision ?? ''); setCadence(p?.review_cadence ?? 'monthly'); }, [p?.id, p?.vision, p?.review_cadence]);

  if (!plan || !planId || !p || !workspace) return null;
  if (!can['plan.manage']) {
    return <EmptyState title="Plan settings are not available to you">Changing the vision, values, focus areas and objective types needs permission to manage plans.</EmptyState>;
  }
  const archived = !!p.archived_at;
  const locked = archived;
  const ws = workspace.id;
  const live = plan.goals.filter((g) => !g.archived_at);
  const values = [...plan.values].sort((a, b) => a.position - b.position);
  const focusAll = [...plan.focus_areas].sort((a, b) => a.position - b.position);
  const focusActive = focusAll.filter((f) => !f.archived_at);
  const focusArchived = focusAll.filter((f) => f.archived_at);

  const act = async (key: string, fn: () => Promise<unknown>, success: string) => {
    setBusy(key);
    const r = await run(fn, { success });
    setBusy(null);
    return r !== undefined;
  };

  const toggleArchive = async () => {
    const to = !archived;
    const ok = await dialogs.confirm({
      title: to ? 'Archive this plan?' : 'Restore this plan?',
      body: to ? <p>"{p.name}" becomes read-only for everyone. Nothing is deleted and you can restore it at any time.</p> : <p>"{p.name}" becomes editable again.</p>,
      confirmLabel: to ? 'Archive plan' : 'Restore plan', danger: to,
    });
    if (ok) await act('archive', () => client.setPlanArchived(planId, to), to ? 'Plan archived.' : 'Plan restored.');
  };

  return (
    <div className="stack">
      <div>
        <h2 className="page-title">Plan settings</h2>
        <p className="page-lede">The vision, values, focus areas and review rhythm of this plan. Objective kinds now live in Strategy model.</p>
      </div>
      {archived && <p className="muted" role="note"><Chip tone="warn">Archived</Chip> This plan is read-only. Restore it below to make changes.</p>}

      <Panel title="Plan details" id="ps-details">
        <dl className="ps-facts">
          <div><dt>Name</dt><dd>{p.name}</dd></div>
          <div><dt>Period</dt><dd>{p.period_start || p.period_end ? `${formatDate(p.period_start, { year: true })} to ${formatDate(p.period_end, { year: true })}` : 'Not set'}</dd></div>
          <div className="ps-facts__wide"><dt>Description</dt><dd>{p.description || 'No description'}</dd></div>
        </dl>
        <div><Button disabled={locked} title={locked ? 'Restore the plan to edit it.' : undefined} onClick={() => dialogs.editPlan(p)}>Edit plan details</Button></div>
      </Panel>

      <Panel title="Vision" id="ps-vision" help="One or two sentences on what success looks like. It appears at the top of the overview.">
        <form className="stack" onSubmit={(e) => { e.preventDefault(); void act('vision', () => client.savePlan(ws, planId, { vision: vision.trim() || null }, p.updated_at), 'Vision saved.'); }}>
          <TextArea label="Vision statement" rows={3} maxLength={2000} value={vision} disabled={locked} onChange={(e) => setVision(e.target.value)} />
          <div><Button type="submit" variant="primary" busy={busy === 'vision'} disabled={locked || vision.trim() === (p.vision ?? '').trim()}>Save vision</Button></div>
        </form>
      </Panel>

      <ValuesPanel values={values} goals={plan.goals} locked={locked} planId={planId} busy={busy} act={act} />
      <FocusPanel active={focusActive} archivedList={focusArchived} goals={plan.goals} liveGoals={live} locked={locked} busy={busy} act={act} toast={toast} />

      <Panel title="Review rhythm" id="ps-rhythm" help="How often the team reviews this plan. Reviews are scheduled on the Reviews page.">
        <form className="row" onSubmit={(e) => { e.preventDefault(); void act('rhythm', () => client.savePlan(ws, planId, { review_cadence: cadence }, p.updated_at), 'Review rhythm saved.'); }}>
          <div className="ps-grow"><SelectField label="Review every" value={cadence} disabled={locked} onChange={(e) => setCadence(e.target.value as Cadence)}>
            {Object.entries(CADENCE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </SelectField></div>
          <Button type="submit" variant="primary" busy={busy === 'rhythm'} disabled={locked || cadence === p.review_cadence}>Save rhythm</Button>
        </form>
      </Panel>

      <Panel title={archived ? 'Restore this plan' : 'Archive this plan'} id="ps-archive" help={archived ? 'Restoring makes the plan editable again.' : 'Archiving makes the plan read-only. Nothing is deleted.'}>
        <div><Button variant={archived ? 'primary' : 'danger'} busy={busy === 'archive'} onClick={toggleArchive}>{archived ? 'Restore plan' : 'Archive plan'}</Button></div>
      </Panel>
    </div>
  );
}

type Act = (key: string, fn: () => Promise<unknown>, success: string) => Promise<boolean>;

function ValuesPanel({ values, goals, locked, planId, busy, act }: { values: PlanValue[]; goals: { value_id: string | null }[]; locked: boolean; planId: string; busy: string | null; act: Act }) {
  const { client } = usePlanner();
  const dialogs = useDialogs();
  const { toast } = usePlanner();
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState(''); const [desc, setDesc] = useState('');
  const [newName, setNewName] = useState(''); const [newDesc, setNewDesc] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const used = (id: string) => goals.filter((g) => g.value_id === id).length;

  const save = async (id: string | null, n: string, d: string, done: () => void) => {
    if (!n.trim()) { setErr('Give the value a name.'); return; }
    setErr(null);
    if (await act('value', () => client.saveValue(planId, id, { name: n.trim(), description: d.trim() || null }), id ? 'Value saved.' : 'Value added.')) done();
  };
  const remove = async (v: PlanValue) => {
    const n = used(v.id);
    if (n) { toast(`"${v.name}" is linked to ${plural(n, 'goal')}. Unlink those objectives first, then delete the value.`, 'error'); return; }
    if (await dialogs.confirm({ title: 'Delete this value?', body: <p>"{v.name}" will be removed from the plan.</p>, confirmLabel: 'Delete value', danger: true })) await act('value', () => client.deleteValue(v.id), 'Value deleted.');
  };

  return (
    <Panel title="Values" id="ps-values" help="The principles that guide decisions. Objectives can be linked to a value.">
      {values.length === 0 ? <p className="muted">No values yet. Add the first one below.</p> : (
        <ul className="ps-list">
          {values.map((v, i) => (
            <li key={v.id} className="ps-item">
              {editing === v.id ? (
                <form className="ps-edit" onSubmit={(e) => { e.preventDefault(); void save(v.id, name, desc, () => setEditing(null)); }}>
                  <TextField label="Value name" required value={name} error={err} maxLength={80} onChange={(e) => setName(e.target.value)} />
                  <TextField label="Description" value={desc} maxLength={300} onChange={(e) => setDesc(e.target.value)} />
                  <div className="row"><Button type="submit" variant="primary" size="sm" busy={busy === 'value'}>Save</Button><Button size="sm" onClick={() => { setEditing(null); setErr(null); }}>Cancel</Button></div>
                </form>
              ) : (
                <>
                  <div className="ps-item__main"><strong>{v.name}</strong>{v.description && <span className="muted"> {v.description}</span>}<span className="muted ps-count">{used(v.id) ? `Used by ${plural(used(v.id), 'goal')}` : 'Not used yet'}</span></div>
                  <div className="ps-item__actions">
                    <MoveButtons index={i} count={values.length} name={v.name} disabled={locked || busy === 'reorder'} onMove={(d) => { const ids = moved(values, i, d); if (ids) void act('reorder', () => client.reorder('values', ids), 'Order saved.'); }} />
                    <Button size="sm" disabled={locked} onClick={() => { setEditing(v.id); setName(v.name); setDesc(v.description ?? ''); setErr(null); }}>Edit</Button>
                    <Button size="sm" variant="ghost" disabled={locked} onClick={() => remove(v)}>Delete</Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <form className="ps-add" onSubmit={(e) => { e.preventDefault(); void save(null, newName, newDesc, () => { setNewName(''); setNewDesc(''); }); }}>
        <TextField label="New value" value={newName} maxLength={80} disabled={locked} error={editing ? null : err} onChange={(e) => setNewName(e.target.value)} />
        <TextField label="Description (optional)" value={newDesc} maxLength={300} disabled={locked} onChange={(e) => setNewDesc(e.target.value)} />
        <Button type="submit" variant="primary" busy={busy === 'value'} disabled={locked}>Add value</Button>
      </form>
    </Panel>
  );
}

function FocusPanel({ active, archivedList, goals, liveGoals, locked, busy, act, toast }: {
  active: FocusArea[]; archivedList: FocusArea[]; goals: { focus_area_id: string }[]; liveGoals: { focus_area_id: string }[]; locked: boolean; busy: string | null; act: Act; toast: (t: string, k?: 'error') => void;
}) {
  const { client } = usePlanner();
  const dialogs = useDialogs();
  const liveCount = (id: string) => liveGoals.filter((g) => g.focus_area_id === id).length;
  const allCount = (id: string) => goals.filter((g) => g.focus_area_id === id).length;
  const archive = async (f: FocusArea) => {
    const n = liveCount(f.id);
    if (n) { toast(`"${f.name}" still has ${plural(n, 'active objective')}. Move them to another focus area first (open an objective and change its focus area), then archive this one.`, 'error'); return; }
    await act('focus', () => client.setFocusArchived(f.id, true), 'Focus area archived.');
  };

  return (
    <Panel title="Focus areas" id="ps-focus" help="The few themes objectives are grouped under. Dates are optional. A focus area can be archived once it has no active objectives. You can also add one straight from the Planner page.">
      {active.length === 0 ? <p className="muted">No focus areas yet. Objectives need one, so add the first below.</p> : (
        <ul className="ps-list">
          {active.map((f, i) => (
            <li key={f.id} className="ps-item">
              <span className="ps-bar" style={{ background: `var(--fa-${f.color})` }} aria-hidden="true" />
              <div className="ps-item__main"><strong>{f.name}</strong>{(f.start_date || f.end_date) && <span className="muted"> {formatDate(f.start_date, { year: true })} to {formatDate(f.end_date, { year: true })}</span>}{f.description && <span className="muted"> {f.description}</span>}
                <span className="muted ps-count">{plural(liveCount(f.id), 'active objective')}</span></div>
              <div className="ps-item__actions">
                <MoveButtons index={i} count={active.length} name={f.name} disabled={locked || busy === 'reorder'} onMove={(d) => { const ids = moved(active, i, d); if (ids) void act('reorder', () => client.reorder('focus_areas', [...ids, ...archivedList.map((a) => a.id)]), 'Order saved.'); }} />
                <Button size="sm" disabled={locked} onClick={() => dialogs.editFocus(f)}>Edit</Button>
                <Button size="sm" variant="ghost" disabled={locked} onClick={() => archive(f)}>Archive</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div><Button variant="primary" disabled={locked} onClick={() => dialogs.newFocus()}>Add focus area</Button></div>
      {archivedList.length > 0 && (
        <div>
          <h3 className="ps-sub">Archived focus areas</h3>
          <ul className="ps-list">
            {archivedList.map((f) => (
              <li key={f.id} className="ps-item ps-item--archived">
                <span className="ps-bar" style={{ background: `var(--fa-${f.color})` }} aria-hidden="true" />
                <div className="ps-item__main"><strong>{f.name}</strong> <Chip>Archived</Chip><span className="muted ps-count">{plural(allCount(f.id), 'objective')} kept</span></div>
                <div className="ps-item__actions"><Button size="sm" disabled={locked} onClick={() => act('focus', () => client.setFocusArchived(f.id, false), 'Focus area restored.')}>Restore</Button></div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}