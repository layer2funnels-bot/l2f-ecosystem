// Strategy model, the building side: define a strategy once (its kinds of objective and its focus areas), the reusable
// focus areas and the KPI types, then pick them when you create a plan, a focus area or a KPI. Nothing has to be typed twice.
import { useState } from 'react';
import type { FocusColor, FocusTemplate, MeasureType, Strategy, StrategyModel } from '../api/types.ts';
import { usePlanner } from '../state/PlannerContext.tsx';
import { Button, Checkbox, Chip, EmptyState, SelectField, TextArea, TextField } from '../ui/primitives.tsx';
import { Dialog } from '../ui/overlay.tsx';
import { useDialogs } from '../components/Dialogs.tsx';
import { ColorPicker } from '../components/FocusAreaDialog.tsx';
import { plural } from '../lib/format.ts';

interface TabProps { model: StrategyModel; canEdit: boolean; reload: () => Promise<void> }

function Heading({ title, lede, action }: { title: string; lede: string; action: React.ReactNode }) {
  return (
    <header className="pagehead">
      <div><h2 className="page-title">{title}</h2><p className="page-lede">{lede}</p></div>
      {action}
    </header>
  );
}

// ------------------------------------------------------------------ strategies
export function StrategiesTab({ model, canEdit, reload }: TabProps) {
  const { client, run } = usePlanner();
  const dialogs = useDialogs();
  const [edit, setEdit] = useState<Strategy | 'new' | null>(null);
  const kindName = (id: string) => model.types.find((t) => t.id === id)?.name ?? '?';
  const focusOf = (id: string) => model.focus_templates.find((f) => f.id === id);

  const remove = async (s: Strategy) => {
    if (!(await dialogs.confirm({ title: `Delete “${s.name}”?`, body: <p>{s.plan_count ? `${plural(s.plan_count, 'plan')} already use it and keep working: they just stop being tied to this strategy.` : 'No plan uses it.'} Their objectives and focus areas are not touched.</p>, confirmLabel: 'Delete strategy', danger: true }))) return;
    await run(() => client.deleteStrategy(s.id), { success: 'Strategy deleted.' });
    await reload();
  };

  return (
    <div className="stack">
      <Heading title="Strategies" lede="A strategy is a plan blueprint: which kinds of objective it uses and which focus areas it starts with. Create it once, then pick it whenever you start a plan."
        action={<Button variant="primary" disabled={!canEdit} title={canEdit ? undefined : 'You need permission to manage plans'} onClick={() => setEdit('new')}>New strategy</Button>} />
      {model.strategies.length === 0
        ? <EmptyState title="No strategies yet" action={canEdit ? <Button variant="primary" onClick={() => setEdit('new')}>Create your first strategy</Button> : undefined}>
            Start with the kinds of objective you plan with (see Objective kinds) and the focus areas you always use. Then every new plan can start from it.
          </EmptyState>
        : <div className="sb-grid">
            {model.strategies.map((s) => (
              <article key={s.id} className="card sb-card">
                <header className="sb-card__head">
                  <h3 className="section__title">{s.name}</h3>
                  <span className="muted">{plural(s.plan_count, 'plan')}</span>
                </header>
                {s.description && <p className="muted">{s.description}</p>}
                <p className="over">Focus areas it starts with</p>
                <div className="sb-chips">
                  {s.focus_ids.length === 0 ? <span className="muted">None: plans start empty</span>
                    : s.focus_ids.map((id) => { const f = focusOf(id); return f ? <span key={id} className="sb-focus" style={{ ['--col-color' as string]: `var(--fa-${f.color})` }}>{f.name}</span> : null; })}
                </div>
                <p className="over">Kinds of objective</p>
                <div className="sb-chips">
                  {s.kind_ids.length === 0 ? <span className="muted">Any kind</span> : s.kind_ids.map((id) => <Chip key={id} tone="accent">{kindName(id)}</Chip>)}
                </div>
                <footer className="sb-card__foot">
                  <Button size="sm" disabled={!canEdit} onClick={() => setEdit(s)}>Edit</Button>
                  <Button size="sm" variant="ghost" disabled={!canEdit} onClick={() => remove(s)}>Delete</Button>
                </footer>
              </article>))}
          </div>}
      {edit && <StrategyDialog model={model} strategy={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={reload} />}
    </div>
  );
}

export function StrategyDialog({ model, strategy, onClose, onSaved }: { model: StrategyModel; strategy: Strategy | null; onClose: () => void; onSaved: (saved?: Strategy) => Promise<void> }) {
  const { client, workspace, run } = usePlanner();
  const [name, setName] = useState(strategy?.name ?? ''); const [desc, setDesc] = useState(strategy?.description ?? '');
  const [focus, setFocus] = useState<string[]>(strategy?.focus_ids ?? []);
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const toggle = (id: string, on: boolean) => setFocus((l) => on ? [...l, id] : l.filter((x) => x !== id));
  const move = (id: string, d: number) => setFocus((l) => { const i = l.indexOf(id), j = i + d; if (i < 0 || j < 0 || j >= l.length) return l; const n = [...l]; [n[i], n[j]] = [n[j]!, n[i]!]; return n; });

  const save = async () => {
    if (!name.trim()) { setErr('Give the strategy a name.'); return; }
    if (!workspace) return;
    setBusy(true);
    // when editing, send a list only if it changed, so edits made on the map meanwhile are not overwritten
    const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
    const data: Record<string, unknown> = { name: name.trim(), description: desc.trim() || null };
    if (!strategy || !same(focus, strategy.focus_ids)) data.focus_ids = focus;
    const ok = await run(() => client.saveStrategy(workspace.id, strategy?.id ?? null, data), { success: strategy ? 'Strategy saved.' : `Strategy “${name.trim()}” created.`, refresh: false });
    setBusy(false);
    if (ok) { await onSaved(ok); onClose(); }
  };

  return (
    <Dialog open wide title={strategy ? 'Edit strategy' : 'New strategy'} onClose={onClose}
      description="Name it and pick the focus areas plans start with. You add objectives, KPIs and tasks on the map."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={busy} onClick={save}>{strategy ? 'Save strategy' : 'Create strategy'}</Button></>}>
      <form className="stack" noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <TextField label="Name" required value={name} maxLength={80} error={err} onChange={(e) => setName(e.target.value)} placeholder="e.g. Social growth" />
        <TextArea label="Description" rows={2} maxLength={600} value={desc} onChange={(e) => setDesc(e.target.value)} />
        <fieldset className="check-group">
          <legend>Focus areas a new plan starts with</legend>
          {model.focus_templates.length === 0 && <p className="muted">No saved focus areas yet. Add some in the Focus areas tab first.</p>}
          {model.focus_templates.map((f) => (
            <div key={f.id} className="sb-pick">
              <Checkbox label={f.name} checked={focus.includes(f.id)} onChange={(on) => toggle(f.id, on)} />
              {focus.includes(f.id) && <span className="sb-pick__order">
                <Button size="sm" variant="ghost" aria-label={`Move ${f.name} earlier`} onClick={() => move(f.id, -1)}>↑</Button>
                <Button size="sm" variant="ghost" aria-label={`Move ${f.name} later`} onClick={() => move(f.id, 1)}>↓</Button>
                <span className="muted">{focus.indexOf(f.id) + 1}</span>
              </span>}
            </div>))}
        </fieldset>
      </form>
    </Dialog>
  );
}

// ------------------------------------------------------------------ KPI types
export function KpiTypesTab({ model, canEdit, reload }: TabProps) {
  const { client, run } = usePlanner();
  const dialogs = useDialogs();
  const [edit, setEdit] = useState<MeasureType | 'new' | null>(null);
  const remove = async (m: MeasureType) => {
    if (!(await dialogs.confirm({ title: `Delete “${m.name}”?`, body: <p>KPIs already created with this type keep their numbers.</p>, confirmLabel: 'Delete KPI type', danger: true }))) return;
    await run(() => client.deleteMeasureType(m.id), { success: 'KPI type deleted.' });
    await reload();
  };
  return (
    <div className="stack">
      <Heading title="KPI types" lede="A KPI type is a measure you reuse, such as Followers or Monthly revenue, with its unit and direction, offered only to the kinds of objective you choose."
        action={<Button variant="primary" disabled={!canEdit} onClick={() => setEdit('new')}>New KPI type</Button>} />
      {model.measure_types.length === 0
        ? <EmptyState title="No KPI types yet" action={canEdit ? <Button variant="primary" onClick={() => setEdit('new')}>Create a KPI type</Button> : undefined}>Create one and it shows up in the dropdown when you add a KPI to an objective.</EmptyState>
        : <div className="table-wrap"><table className="table">
            <thead><tr><th scope="col">KPI type</th><th scope="col">Unit</th><th scope="col">Goes</th><th scope="col">Available on</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{model.measure_types.map((m) => (
              <tr key={m.id}>
                <td><strong>{m.name}</strong></td><td>{m.unit || '–'}</td><td>{m.direction === 'increase' ? 'Up' : 'Down'}</td>
                <td>{m.kind_ids.length === 0 ? <span className="muted">Any kind</span> : m.kind_ids.map((id) => <Chip key={id} tone="accent">{model.types.find((t) => t.id === id)?.name ?? '?'}</Chip>)}</td>
                <td><div className="row"><Button size="sm" disabled={!canEdit} onClick={() => setEdit(m)}>Edit</Button><Button size="sm" variant="ghost" disabled={!canEdit} onClick={() => remove(m)}>Delete</Button></div></td>
              </tr>))}</tbody>
          </table></div>}
      {edit && <KpiTypeDialog model={model} item={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={reload} />}
    </div>
  );
}

export function KpiTypeDialog({ model, item, presetKinds, onClose, onSaved }: { model: StrategyModel; item: MeasureType | null; presetKinds?: string[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const { client, workspace, run } = usePlanner();
  const [name, setName] = useState(item?.name ?? ''); const [unit, setUnit] = useState(item?.unit ?? ''); const [dir, setDir] = useState(item?.direction ?? 'increase');
  const [kinds, setKinds] = useState<Set<string>>(new Set(item?.kind_ids ?? presetKinds ?? model.types.filter((t) => t.uses_measure).map((t) => t.id)));
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim()) { setErr('Give the KPI type a name.'); return; }
    if (!workspace) return;
    setBusy(true);
    const ok = await run(() => client.saveMeasureType(workspace.id, item?.id ?? null, { name: name.trim(), unit: unit.trim(), direction: dir, kind_ids: [...kinds] }), { success: item ? 'KPI type saved.' : 'KPI type created.' });
    setBusy(false);
    if (ok) { await onSaved(); onClose(); }
  };
  return (
    <Dialog open title={item ? 'Edit KPI type' : 'New KPI type'} onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={busy} onClick={save}>{item ? 'Save KPI type' : 'Create KPI type'}</Button></>}>
      <form className="stack" noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <TextField label="Name" required value={name} maxLength={80} error={err} onChange={(e) => setName(e.target.value)} placeholder="e.g. Followers" />
        <div className="form-grid">
          <TextField label="Unit" value={unit} maxLength={20} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. people, $, %" />
          <SelectField label="A good result goes" value={dir} onChange={(e) => setDir(e.target.value as 'increase' | 'decrease')}><option value="increase">Up</option><option value="decrease">Down</option></SelectField>
        </div>
        <fieldset className="check-group">
          <legend>Available on these kinds of objective (none ticked = every kind)</legend>
          {model.types.map((t) => <Checkbox key={t.id} label={t.name} checked={kinds.has(t.id)} onChange={(on) => setKinds((s) => { const n = new Set(s); if (on) n.add(t.id); else n.delete(t.id); return n; })} />)}
        </fieldset>
      </form>
    </Dialog>
  );
}

// ------------------------------------------------------------------ reusable focus areas
export function FocusLibraryTab({ model, canEdit, reload }: TabProps) {
  const { client, run } = usePlanner();
  const dialogs = useDialogs();
  const [edit, setEdit] = useState<FocusTemplate | 'new' | null>(null);
  const remove = async (f: FocusTemplate) => {
    if (!(await dialogs.confirm({ title: `Delete “${f.name}”?`, body: <p>It is removed from this list and from any strategy that starts with it. Focus areas already in plans stay.</p>, confirmLabel: 'Delete', danger: true }))) return;
    await run(() => client.deleteFocusTemplate(f.id), { success: 'Removed.' });
    await reload();
  };
  return (
    <div className="stack">
      <Heading title="Focus areas" lede="The themes you reuse. Add one once, then pick it when you add a focus area to any plan, or let a strategy add it for you."
        action={<Button variant="primary" disabled={!canEdit} onClick={() => setEdit('new')}>New focus area</Button>} />
      {model.focus_templates.length === 0
        ? <EmptyState title="No saved focus areas" action={canEdit ? <Button variant="primary" onClick={() => setEdit('new')}>Add your first</Button> : undefined}>You can also tick “Save for reuse” when you add a focus area inside a plan.</EmptyState>
        : <ul className="ps-list card">{model.focus_templates.map((f) => (
            <li key={f.id} className="ps-item">
              <span className="ps-bar" style={{ background: `var(--fa-${f.color})` }} aria-hidden="true" />
              <div className="ps-item__main"><strong>{f.name}</strong>{f.description && <span className="muted"> {f.description}</span>}
                <span className="muted ps-count">Used by {plural(model.strategies.filter((s) => s.focus_ids.includes(f.id)).length, 'strategy', 'strategies')}</span></div>
              <div className="ps-item__actions"><Button size="sm" disabled={!canEdit} onClick={() => setEdit(f)}>Edit</Button><Button size="sm" variant="ghost" disabled={!canEdit} onClick={() => remove(f)}>Delete</Button></div>
            </li>))}</ul>}
      {edit && <FocusTemplateDialog item={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={reload} />}
    </div>
  );
}

export function FocusTemplateDialog({ item, onClose, onSaved }: { item: FocusTemplate | null; onClose: () => void; onSaved: (saved?: FocusTemplate) => Promise<void> }) {
  const { client, workspace, run } = usePlanner();
  const [name, setName] = useState(item?.name ?? ''); const [desc, setDesc] = useState(item?.description ?? ''); const [color, setColor] = useState<FocusColor>(item?.color ?? 'blue');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim()) { setErr('Give the focus area a name.'); return; }
    if (!workspace) return;
    setBusy(true);
    const ok = await run(() => client.saveFocusTemplate(workspace.id, item?.id ?? null, { name: name.trim(), description: desc.trim() || null, color }), { success: item ? 'Saved.' : 'Focus area saved for reuse.', refresh: false });
    setBusy(false);
    if (ok) { await onSaved(ok); onClose(); }
  };
  return (
    <Dialog open title={item ? 'Edit focus area' : 'New reusable focus area'} onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={busy} onClick={save}>{item ? 'Save' : 'Add'}</Button></>}>
      <form className="stack" noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <TextField label="Name" required value={name} maxLength={80} error={err} onChange={(e) => setName(e.target.value)} />
        <TextArea label="Description" rows={2} maxLength={300} value={desc} onChange={(e) => setDesc(e.target.value)} />
        <ColorPicker value={color} onChange={setColor} />
      </form>
    </Dialog>
  );
}
