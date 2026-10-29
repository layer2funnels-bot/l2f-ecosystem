// Strategy model: decide what you plan with (the types of objective) and what can sit under what.
// Left: the building blocks. Right: a map of the structure, or the editor for one type.
// Two tabs (chosen from the menu): "Types and structure" and "Time horizons".
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { NamedHorizon, StrategyModel } from '../api/types.ts';
import { usePlanner } from '../state/PlannerContext.tsx';
import { Button, Checkbox, EmptyState, PageLoading, TextField, Chip } from '../ui/primitives.tsx';
import { Dialog } from '../ui/overlay.tsx';
import { Icon } from '../ui/icons.tsx';
import { TreeBranch } from '../components/TreeBranch.tsx';
import { useDialogs } from '../components/Dialogs.tsx';
import { formatDate, plural } from '../lib/format.ts';
import { buildHash } from '../state/route.ts';
import { daysBetween } from '../lib/schedule.ts';
import { FocusLibraryTab, KpiTypesTab } from './StrategyBuilder.tsx';
import { StrategyMapTab } from './StrategyMap.tsx';

type TypeRow = StrategyModel['types'][number];

export default function StrategyModelPage() {
  const { workspace, client, route, can, refresh } = usePlanner();
  const [model, setModel] = useState<StrategyModel | null | undefined>(undefined);
  const load = useCallback(async () => { if (workspace) await client.model(workspace.id).then(setModel).catch(() => setModel(null)); }, [client, workspace]);
  useEffect(() => { void load(); }, [load]);
  if (model === undefined) return <PageLoading label="Loading the strategy model" />;
  if (!model) return <EmptyState title="The strategy model could not be loaded" action={<Button onClick={() => { setModel(undefined); void load(); }}>Try again</Button>}>You may not have access to it in this organization, or the connection failed.</EmptyState>;
  const reload = async () => { await Promise.all([refresh(), load()]); };   // wait for the model, so the next click builds on fresh data
  const tab = route.params.tab;
  const edit = can['plan.manage'];
  return tab === 'horizons' ? <HorizonsTab model={model} canEdit={edit} reload={reload} />
    : tab === 'kinds' ? <TypesTab model={model} canEdit={edit} reload={reload} />
    : tab === 'kpis' ? <KpiTypesTab model={model} canEdit={edit} reload={reload} />
    : tab === 'focus' ? <FocusLibraryTab model={model} canEdit={edit} reload={reload} />
    : <StrategyMapTab model={model} canEdit={edit} reload={reload} />;
}

// ------------------------------------------------------------------ types and structure
function TypesTab({ model, canEdit, reload }: { model: StrategyModel; canEdit: boolean; reload: () => Promise<void> }) {
  const { client, workspace, run, toast } = usePlanner();
  const dialogs = useDialogs();
  const [selected, setSelected] = useState<string | null>(null);   // null = the structure map
  const [adding, setAdding] = useState(false);
  const type = model.types.find((t) => t.id === selected) ?? null;

  const removeLimits = async () => {
    if (!workspace || !(await dialogs.confirm({ title: 'Remove all limits?', body: <p>Any type of objective will be allowed anywhere again. Existing objectives are not changed.</p>, confirmLabel: 'Remove limits' }))) return;
    await run(() => client.saveTypeRules(workspace.id, []), { success: 'All limits removed.' });
    await reload();
  };

  return (
    <div className="stack">
      <header className="pagehead">
        <div>
          <h2 className="page-title">Strategy model</h2>
          <p className="page-lede">This is the shape of your strategy. Pick the kinds of objective you plan with, then say which kinds can sit under which. Leave it open and anything can go anywhere.</p>
        </div>
      </header>
      <div className="sm">
        <aside className="sm__list" aria-label="Building blocks">
          <p className="over">Always there</p>
          <div className="sm__item sm__item--fixed"><span><Icon name="plans" size={18} /> Plan</span><span className="sm__count">{model.plan_count}</span></div>
          <a className="sm__item sm__item--fixed" href={buildHash('model', { tab: 'focus' })} title="Create and manage reusable focus areas"><span><Icon name="tree" size={18} /> Focus areas</span><span className="sm__count">{model.focus_templates.length}</span></a>
          <p className="over" style={{ paddingBlockStart: 12 }}>Kinds of objective</p>
          {model.types.map((t) => (
            <button key={t.id} type="button" className="sm__item" aria-current={selected === t.id} onClick={() => setSelected(t.id)}>
              <span>{t.name}{t.uses_measure && <span className="muted"> · measured</span>}</span><span className="sm__count" title={`${plural(t.goal_count, 'objective')} use this type`}>{t.goal_count}</span>
            </button>))}
          {canEdit && <Button size="sm" onClick={() => setAdding(true)}>+ Add a kind of objective</Button>}
          <p className="over" style={{ paddingBlockStart: 12 }}>Overview</p>
          <button type="button" className="sm__item" aria-current={selected === null} onClick={() => setSelected(null)}><span><Icon name="model" size={18} /> Structure map</span></button>
        </aside>
        <section className="sm__panel" aria-live="polite">
          {type
            ? <TypeEditor key={type.id} type={type} model={model} canEdit={canEdit} onDone={async () => { await reload(); }} onDeleted={async () => { setSelected(null); await reload(); }} />
            : <StructureMap model={model} canEdit={canEdit} onRemoveLimits={removeLimits} />}
        </section>
      </div>
      <AddTypeDialog open={adding} onClose={() => setAdding(false)} onSaved={async () => { toast('Added.', 'success'); await reload(); }} />
    </div>
  );
}

function StructureMap({ model, canEdit, onRemoveLimits }: { model: StrategyModel; canEdit: boolean; onRemoveLimits: () => void }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setCollapsed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const byId = useMemo(() => new Map(model.types.map((t) => [t.id, t] as const)), [model.types]);
  const restricted = (parent: string | null) => model.rules.some((r) => r.parent_type_id === parent);
  const allowed = (parent: string | null) => model.rules.filter((r) => r.parent_type_id === parent).map((r) => r.child_type_id);
  const any = model.rules.length === 0;

  const node = (typeId: string, path: string[]): ReactNode => {
    const t = byId.get(typeId);
    if (!t) return null;
    const key = `${path.join('>')}>${typeId}`;
    if (path.includes(typeId)) return <TreeBranch key={key} id={key} collapsed={false} onToggle={toggle} box={<span className="sm-node sm-node--loop">↻ {t.name} (can repeat inside itself)</span>}>{[]}</TreeBranch>;
    const kids = restricted(typeId)
      ? allowed(typeId).map((c) => node(c, [...path, typeId]))
      : [<TreeBranch key={`${key}>any`} id={`${key}>any`} collapsed={false} onToggle={toggle} box={<span className="sm-node sm-node--any">Any kind: {model.types.map((x) => x.name).join(', ')}</span>}>{[]}</TreeBranch>];
    return <TreeBranch key={key} id={key} collapsed={collapsed.has(key)} onToggle={toggle} box={<span className="sm-node">{t.name}{t.uses_measure && <Chip>measured</Chip>}</span>}>{kids}</TreeBranch>;
  };
  const top = restricted(null)
    ? allowed(null).map((c) => node(c, []))
    : [<TreeBranch key="any" id="any" collapsed={false} onToggle={toggle} box={<span className="sm-node sm-node--any">Any kind: {model.types.map((x) => x.name).join(', ')}</span>}>{[]}</TreeBranch>];

  return (
    <div className="stack">
      <div className="row row--between">
        <div><h3 className="section__title">Structure map</h3><p className="muted">{any ? 'No limits are set, so any kind of objective can go anywhere. Pick a kind on the left to set where it can go.' : 'Read left to right: each box can hold the boxes after it.'}</p></div>
        {canEdit && !any && <Button size="sm" onClick={onRemoveLimits}>Remove all limits</Button>}
      </div>
      <div className="sm-map">
        <ul className="az-children az-children--root">
          <TreeBranch id="plan" collapsed={false} onToggle={toggle} box={<span className="sm-node"><Icon name="plans" size={18} /> Plan</span>}>
            {[<TreeBranch key="fa" id="fa" collapsed={false} onToggle={toggle} box={<span className="sm-node sm-node--focus"><span><Icon name="tree" size={18} /> Focus area</span>{model.focus_templates.length > 0 && <span className="sm-focuslist">{model.focus_templates.map((f) => <span key={f.id} className="sb-focus" style={{ ['--col-color' as string]: `var(--fa-${f.color})` }}>{f.name}</span>)}</span>}<a href={buildHash('model', { tab: 'focus' })}>{canEdit ? 'Manage focus areas' : 'See focus areas'}</a></span>}>{top}</TreeBranch>]}
          </TreeBranch>
        </ul>
      </div>
    </div>
  );
}

function TypeEditor({ type, model, canEdit, onDone, onDeleted }: { type: TypeRow; model: StrategyModel; canEdit: boolean; onDone: () => Promise<void>; onDeleted: () => Promise<void> }) {
  const { client, workspace, run, toast } = usePlanner();
  const dialogs = useDialogs();
  const initialTop = model.rules.some((r) => r.parent_type_id === null && r.child_type_id === type.id);
  const initialKids = useMemo(() => new Set(model.rules.filter((r) => r.parent_type_id === type.id).map((r) => r.child_type_id)), [model.rules, type.id]);
  const [name, setName] = useState(type.name);
  const [measured, setMeasured] = useState(type.uses_measure);
  const [top, setTop] = useState(initialTop);
  const [kids, setKids] = useState<Set<string>>(new Set(initialKids));
  const [busy, setBusy] = useState(false);
  const topRestricted = model.rules.some((r) => r.parent_type_id === null);

  const save = async () => {
    if (!workspace) return;
    if (!name.trim()) { toast('Give this kind of objective a name.', 'error'); return; }
    if (topRestricted && initialTop && !top && model.rules.filter((r) => r.parent_type_id === null).length === 1) {
      toast('At least one kind must be allowed directly under a focus area. To remove every limit, use “Remove all limits” on the Structure map.', 'error'); return;
    }
    setBusy(true);
    const rules = model.rules.filter((r) => r.parent_type_id !== type.id && !(r.parent_type_id === null && r.child_type_id === type.id)).map((r) => ({ parent: r.parent_type_id, child: r.child_type_id }));
    if (top) rules.push({ parent: null, child: type.id });
    kids.forEach((c) => rules.push({ parent: type.id, child: c }));
    const ok = await run(async () => {
      if (name.trim() !== type.name || measured !== type.uses_measure) await client.saveGoalType(workspace.id, type.id, { name: name.trim(), uses_measure: measured });
      await client.saveTypeRules(workspace.id, rules);
      return true;
    }, { success: 'Saved.' });
    setBusy(false);
    if (ok) await onDone();
  };
  const remove = async () => {
    if (!(await dialogs.confirm({ title: `Delete “${type.name}”?`, body: <p>No objective uses this kind. It is also removed from every strategy, focus area, KPI type and nesting rule that mentions it{model.strategies.some((s) => s.kind_ids.includes(type.id)) ? ` (used by: ${model.strategies.filter((s) => s.kind_ids.includes(type.id)).map((s) => s.name).join(', ')})` : ''}.</p>, confirmLabel: 'Delete', danger: true }))) return;
    const ok = await run(() => client.deleteGoalType(type.id), { success: 'Deleted.' });
    if (ok !== undefined) await onDeleted();
  };
  const toggleKid = (id: string, on: boolean) => setKids((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });

  return (
    <div className="stack">
      <div><h3 className="section__title">{type.name}</h3><p className="muted">{plural(type.goal_count, 'objective')} use this kind.</p></div>
      <TextField label="Name" value={name} maxLength={60} disabled={!canEdit} onChange={(e) => setName(e.target.value)} />
      <Checkbox label="Tracked with a measure (like a KPI: start, target, readings)" checked={measured} disabled={!canEdit} onChange={setMeasured} />
      <fieldset className="sm__checks">
        <legend className="field__label">Where it can go</legend>
        <Checkbox label="Directly under a focus area" checked={top} disabled={!canEdit} onChange={setTop} />
        <p className="muted" style={{ fontSize: 13 }}>{topRestricted ? 'Only the kinds ticked this way can be placed straight under a focus area.' : 'Nothing is limited yet. Tick this to start limiting what can go straight under a focus area.'}</p>
      </fieldset>
      <fieldset className="sm__checks">
        <legend className="field__label">What can go under it</legend>
        {model.types.map((t) => <Checkbox key={t.id} label={t.id === type.id ? `${t.name} (itself, so it can repeat inside itself)` : t.name} checked={kids.has(t.id)} disabled={!canEdit} onChange={(v) => toggleKid(t.id, v)} />)}
        <p className="muted" style={{ fontSize: 13 }}>Tick nothing and any kind can go under it.</p>
      </fieldset>
      {canEdit && (
        <div className="form-actions">
          {type.goal_count === 0 && <Button variant="danger" onClick={remove}>Delete this kind</Button>}
          <Button variant="primary" busy={busy} onClick={save}>Save changes</Button>
        </div>)}
      {!canEdit && <p className="muted">You can look but not change the strategy model.</p>}
    </div>
  );
}

function AddTypeDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const { client, workspace, run } = usePlanner();
  const [name, setName] = useState(''); const [measured, setMeasured] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setName(''); setMeasured(false); setErr(null); } }, [open]);
  const submit = async () => {
    if (!name.trim()) { setErr('Give it a name.'); return; }
    if (!workspace) return;
    setBusy(true);
    const ok = await run(() => client.saveGoalType(workspace.id, null, { name: name.trim(), uses_measure: measured }));
    setBusy(false);
    if (ok) { onClose(); await onSaved(); }
  };
  return (
    <Dialog open={open} title="Add a kind of objective" description="For example Objective, Project or KPI." onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={busy} onClick={submit}>Add</Button></>}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
        <TextField label="Name" required value={name} maxLength={60} error={err} onChange={(e) => setName(e.target.value)} />
        <Checkbox label="Tracked with a measure" checked={measured} onChange={setMeasured} />
      </form>
    </Dialog>
  );
}

// ------------------------------------------------------------------ time horizons
function HorizonsTab({ model, canEdit, reload }: { model: StrategyModel; canEdit: boolean; reload: () => Promise<void> }) {
  const { client, workspace, run, today } = usePlanner();
  const dialogs = useDialogs();
  const [editing, setEditing] = useState<NamedHorizon | 'new' | null>(null);
  const hs = model.horizons;
  const min = hs.length ? hs.reduce((m, h) => (h.start_date < m ? h.start_date : m), hs[0]!.start_date) : today;
  const max = hs.length ? hs.reduce((m, h) => (h.end_date > m ? h.end_date : m), hs[0]!.end_date) : today;
  const span = Math.max(1, daysBetween(min, max));
  const remove = async (h: NamedHorizon) => {
    if (!(await dialogs.confirm({ title: `Delete “${h.title}”?`, body: <p>Objectives keep their own dates. Only this named period is removed from the period filter.</p>, confirmLabel: 'Delete', danger: true }))) return;
    await run(() => client.deleteHorizon(h.id), { success: 'Deleted.' });
    await reload();
  };
  return (
    <div className="stack">
      <header className="pagehead">
        <div>
          <h2 className="page-title">Time horizons</h2>
          <p className="page-lede">Named periods such as “Q4 2026” or “Year 2027”. They appear in the Period filter so everyone looks at the same time frames.</p>
        </div>
        {canEdit && <Button variant="primary" onClick={() => setEditing('new')}>New time horizon</Button>}
      </header>
      {hs.length === 0 ? <EmptyState title="No time horizons yet" action={canEdit ? <Button variant="primary" onClick={() => setEditing('new')}>Add the first one</Button> : undefined}>Add periods your team plans and reviews in.</EmptyState> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th scope="col">Name</th><th scope="col">From</th><th scope="col">To</th><th scope="col"><span className="sr-only">On a timeline</span></th>{canEdit && <th scope="col"><span className="sr-only">Actions</span></th>}</tr></thead>
            <tbody>
              {hs.map((h) => (
                <tr key={h.id}>
                  <td><strong>{h.title}</strong></td><td>{formatDate(h.start_date, { year: true })}</td><td>{formatDate(h.end_date, { year: true })}</td>
                  <td><div className="hz-bar" aria-hidden="true"><i style={{ insetInlineStart: `${(daysBetween(min, h.start_date) / span) * 100}%`, inlineSize: `${Math.max(2, ((daysBetween(h.start_date, h.end_date) + 1) / span) * 100)}%` }} /></div></td>
                  {canEdit && <td className="row"><Button size="sm" onClick={() => setEditing(h)}>Edit</Button><Button size="sm" variant="ghost" onClick={() => void remove(h)}>Delete</Button></td>}
                </tr>))}
            </tbody>
          </table>
        </div>)}
      <HorizonDialog open={editing !== null} horizon={editing && editing !== 'new' ? editing : null} onClose={() => setEditing(null)}
        onSave={async (data) => { if (!workspace) return false; const r = await run(() => client.saveHorizon(workspace.id, editing && editing !== 'new' ? editing.id : null, data), { success: 'Saved.' }); if (r) await reload(); return !!r; }} />
    </div>
  );
}

function HorizonDialog({ open, horizon, onClose, onSave }: { open: boolean; horizon: NamedHorizon | null; onClose: () => void; onSave: (d: Record<string, unknown>) => Promise<boolean> }) {
  const [title, setTitle] = useState(''); const [start, setStart] = useState(''); const [end, setEnd] = useState(''); const [errs, setErrs] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setTitle(horizon?.title ?? ''); setStart(horizon?.start_date ?? ''); setEnd(horizon?.end_date ?? ''); setErrs({}); } }, [open, horizon]);
  const submit = async () => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'Give it a name, like Q3 or Year 2028.';
    if (!start) e.start = 'Choose a start date.';
    if (!end) e.end = 'Choose an end date.'; else if (start && end < start) e.end = 'The end is before the start.';
    setErrs(e);
    if (Object.keys(e).length) return;
    setBusy(true); const ok = await onSave({ title: title.trim(), start_date: start, end_date: end }); setBusy(false); if (ok) onClose();
  };
  return (
    <Dialog open={open} title={horizon ? 'Edit time horizon' : 'New time horizon'} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={busy} onClick={submit}>{horizon ? 'Save' : 'Add'}</Button></>}>
      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
        <div className="span-2"><TextField label="Name" required value={title} maxLength={60} error={errs.title} placeholder="e.g. Q3 2028" onChange={(e) => setTitle(e.target.value)} /></div>
        <TextField label="Starts" type="date" required value={start} error={errs.start} onChange={(e) => setStart(e.target.value)} />
        <TextField label="Ends" type="date" required value={end} error={errs.end} onChange={(e) => setEnd(e.target.value)} />
      </form>
    </Dialog>
  );
}
