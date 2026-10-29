// Strategy map: create a strategy and draw its content on the map, left to right:
//   Strategy → each focus area as its own block → objectives → their sub-objectives, KPIs and tasks.
// Every card has Add, Edit and Delete, every change saves straight away, and a plan created from the strategy gets a
// copy of all of it. Kinds of objective stay in the background (every objective is an "Objective" unless you choose
// otherwise under More options); nesting rules for kinds live in the Objective kinds tab.
import { useMemo, useState, type ReactNode } from 'react';
import type { FocusTemplate, GoalType, Strategy, StrategyItem, StrategyModel } from '../api/types.ts';
import { usePlanner } from '../state/PlannerContext.tsx';
import { Button, Chip, EmptyState, Segmented, SelectField, TextField } from '../ui/primitives.tsx';
import { Dialog, MenuButton, MenuItem } from '../ui/overlay.tsx';
import { Icon } from '../ui/icons.tsx';
import { useDialogs } from '../components/Dialogs.tsx';
import { TreeBranch } from '../components/TreeBranch.tsx';
import { FocusTemplateDialog, StrategyDialog } from './StrategyBuilder.tsx';
import { formatNumber, plural } from '../lib/format.ts';

interface Props { model: StrategyModel; canEdit: boolean; reload: () => Promise<void> }
type ItemMode = { kind: 'create'; item_kind: StrategyItem['item_kind']; templateId: string; parent: StrategyItem | null } | { kind: 'edit'; item: StrategyItem };
type Creating = { what: 'strategy' } | { what: 'focus' } | null;

export function StrategyMapTab({ model, canEdit, reload }: Props) {
  const { client, workspace, run } = usePlanner();
  const dialogs = useDialogs();
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [creating, setCreating] = useState<Creating>(null);
  const [itemMode, setItemMode] = useState<ItemMode | null>(null);
  const [view, setView] = useState<'grid' | 'builder'>(() => { try { return localStorage.getItem('planner.smap.view') === 'builder' ? 'builder' : 'grid'; } catch { return 'grid'; } });
  const pickView = (v: 'grid' | 'builder') => { setView(v); try { localStorage.setItem('planner.smap.view', v); } catch { /* not remembered */ } };
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const fold = (id: string) => setFolded((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const [editing, setEditing] = useState<Strategy | null>(null);
  const s = model.strategies.find((x) => x.id === pickedId) ?? model.strategies[0] ?? null;
  const ws = workspace?.id ?? '';
  const items = s?.items ?? [];
  const kindName = (id: string | null) => model.types.find((t) => t.id === id)?.name ?? null;

  const save = async (fn: () => Promise<unknown>, success: string) => { const r = await run(fn, { success, refresh: false }); await reload(); return r; };
  const saveStrategy = (data: Record<string, unknown>, success = 'Strategy updated.') => s && save(() => client.saveStrategy(ws, s.id, data), success);
  const below = (id: string): number => items.filter((x) => x.parent_id === id).reduce((n, x) => n + 1 + below(x.id), 0);

  const removeItem = async (it: StrategyItem) => {
    const n = below(it.id);
    if (!(await dialogs.confirm({ title: `Delete “${it.title}”?`, body: <p>{n ? `The ${plural(n, 'item')} under it go too. ` : ''}Plans already created from this strategy are not changed.</p>, confirmLabel: 'Delete', danger: true }))) return;
    await save(() => client.deleteStrategyItem(it.id), 'Deleted.');
  };
  const removeFocus = async (f: FocusTemplate) => {
    if (!s) return;
    const n = items.filter((i) => i.template_id === f.id).length;
    if (!(await dialogs.confirm({ title: `Remove “${f.name}” from ${s.name}?`, body: <p>{n ? `Its ${plural(n, 'objective, KPI or task', 'objectives, KPIs and tasks')} in this strategy are deleted. ` : ''}Plans already built keep theirs, and the reusable focus area stays in the Focus areas tab.</p>, confirmLabel: 'Remove', danger: n > 0 }))) return;
    await saveStrategy({ focus_ids: s.focus_ids.filter((x) => x !== f.id) }, `“${f.name}” removed.`);
  };
  const removeStrategy = async () => {
    if (!s || !(await dialogs.confirm({ title: `Delete “${s.name}”?`, body: <p>{s.plan_count ? `${plural(s.plan_count, 'plan')} built from it keep working.` : 'No plan uses it.'} Its objectives, KPIs and tasks in the strategy are deleted; reusable focus areas stay.</p>, confirmLabel: 'Delete strategy', danger: true }))) return;
    setPickedId(null);
    await save(() => client.deleteStrategy(s.id), 'Strategy deleted.');
  };

  const add = (item_kind: StrategyItem['item_kind'], templateId: string, parent: StrategyItem | null) => setItemMode({ kind: 'create', item_kind, templateId, parent });
  const itemMenu = (it: StrategyItem) => canEdit && (
    <MenuButton size="sm" variant="ghost" label={<span aria-label={`Options for ${it.title}`}>⋯</span>}>
      {() => <>
        <MenuItem onClick={() => setItemMode({ kind: 'edit', item: it })}>Edit</MenuItem>
        <MenuItem danger onClick={() => void removeItem(it)}>Delete</MenuItem>
      </>}
    </MenuButton>
  );

  // one objective card: its KPIs and tasks listed inside, sub-objectives nested below, quick add buttons at the foot
  const objectiveCard = (it: StrategyItem, depth = 0): ReactNode => {
    const kids = items.filter((x) => x.parent_id === it.id).sort((a, b) => a.position - b.position);
    const kpis = kids.filter((k) => k.item_kind === 'kpi'), tasks = kids.filter((k) => k.item_kind === 'task'), subs = kids.filter((k) => k.item_kind === 'objective');
    const kind = kindName(it.goal_type_id);
    return (
      <article key={it.id} className={`sb-obj${depth ? ' sb-obj--sub' : ''}`}
        data-tip={`“${it.title}”: ${kpis.length} KPI${kpis.length === 1 ? '' : 's'}, ${tasks.length} task${tasks.length === 1 ? '' : 's'}, ${subs.length} sub-objective${subs.length === 1 ? '' : 's'}. Copied into every plan made from this strategy.`}>
        <header className="sb-obj__head">
          <Icon name="check" size={16} />
          <strong className="sb-obj__title">{it.title}</strong>
          {kind && kind !== 'Objective' && <Chip>{kind}</Chip>}
          {itemMenu(it)}
        </header>
        {kpis.length > 0 && <ul className="sb-rows" aria-label="KPIs">{kpis.map((k) => (
          <li key={k.id} className="sb-row"><Icon name="chart" size={15} /><span className="sb-row__text">{k.title}</span>
            {k.target !== null && <span className="sb-row__meta mono">{formatNumber(Number(k.target))}{k.unit && ` ${k.unit}`}</span>}{itemMenu(k)}</li>))}</ul>}
        {tasks.length > 0 && <ul className="sb-rows" aria-label="Tasks">{tasks.map((k) => (
          <li key={k.id} className="sb-row"><span className="sb-row__box" aria-hidden="true" /><span className="sb-row__text">{k.title}</span>{itemMenu(k)}</li>))}</ul>}
        {subs.length > 0 && <div className="sb-subs">{subs.map((x) => objectiveCard(x, depth + 1))}</div>}
        {canEdit && <footer className="sb-obj__foot">
          <button type="button" className="sb-add" onClick={() => add('kpi', it.template_id, it)}>+ KPI</button>
          <button type="button" className="sb-add" onClick={() => add('task', it.template_id, it)}>+ Task</button>
          {depth < 3 && <button type="button" className="sb-add" onClick={() => add('objective', it.template_id, it)}>+ Sub-objective</button>}
        </footer>}
      </article>
    );
  };

  // Builder: the same content as a left-to-right map, built in place with + buttons on every node
  const mapNode = (it: StrategyItem): ReactNode => {
    const key = `m:${it.id}`;
    if (it.item_kind !== 'objective') return (
      <TreeBranch key={key} id={key} collapsed onToggle={fold} box={
        <div className={`bm-node ${it.item_kind === 'kpi' ? 'bm-node--kpi' : 'bm-node--task'}`}>
          <Icon name={it.item_kind === 'kpi' ? 'chart' : 'check'} size={15} />
          <span className="bm-node__text">{it.title}{it.item_kind === 'kpi' && it.target !== null && <span className="muted"> · {formatNumber(Number(it.target))}{it.unit && ` ${it.unit}`}</span>}</span>
          {itemMenu(it)}
        </div>}>{[]}</TreeBranch>);
    const kids = items.filter((x) => x.parent_id === it.id).sort((a, b) => ({ objective: 0, kpi: 1, task: 2 })[a.item_kind] - ({ objective: 0, kpi: 1, task: 2 })[b.item_kind] || a.position - b.position);
    return (
      <TreeBranch key={key} id={key} collapsed={folded.has(key)} onToggle={fold} box={
        <div className="bm-node bm-node--obj">
          <div className="bm-node__row"><strong className="bm-node__text">{it.title}</strong>{itemMenu(it)}</div>
          {canEdit && <div className="bm-add">
            <button type="button" className="sb-add" onClick={() => add('kpi', it.template_id, it)}>+ KPI</button>
            <button type="button" className="sb-add" onClick={() => add('task', it.template_id, it)}>+ Task</button>
            <button type="button" className="sb-add" onClick={() => add('objective', it.template_id, it)}>+ Sub</button>
          </div>}
        </div>}>{kids.map(mapNode)}</TreeBranch>
    );
  };
  const builder = (focusList: FocusTemplate[], freeFocus: FocusTemplate[]) => (
    <div className="bm-scroll"><div className="az-canvas">
      <ul className="az-children az-children--root">
        <TreeBranch id="bm-root" collapsed={false} onToggle={fold} box={
          <div className="bm-node bm-node--strategy"><Icon name="plans" size={18} /><strong className="bm-node__text">{s!.name}</strong></div>}>
          {[
            ...focusList.map((f) => {
              const top = items.filter((i) => i.parent_id === null && i.template_id === f.id).sort((a, b) => a.position - b.position);
              return (
                <TreeBranch key={f.id} id={`bf:${f.id}`} collapsed={folded.has(`bf:${f.id}`)} onToggle={fold} box={
                  <div className="bm-node bm-node--focus" style={{ ['--col-color' as string]: `var(--fa-${f.color})` }}>
                    <div className="bm-node__row"><strong className="bm-node__text">{f.name}</strong>
                      {canEdit && <MenuButton size="sm" variant="ghost" label={<span aria-label={`Options for ${f.name}`}>⋯</span>}>{() => <MenuItem danger onClick={() => void removeFocus(f)}>Remove from this strategy</MenuItem>}</MenuButton>}</div>
                    {canEdit && <div className="bm-add"><button type="button" className="sb-add" onClick={() => add('objective', f.id, null)}>+ Objective</button></div>}
                  </div>}>{top.map(mapNode)}</TreeBranch>
              );
            }),
            ...(canEdit ? [<li key="bm-addfa" className="az-li"><div className="az-box">
              <MenuButton size="sm" variant="secondary" align="start" label="+ Focus area">
                {() => <>
                  {freeFocus.map((f) => <MenuItem key={f.id} onClick={() => void saveStrategy({ focus_ids: [...s!.focus_ids, f.id] }, `“${f.name}” added.`)}>{f.name}</MenuItem>)}
                  <MenuItem onClick={() => setCreating({ what: 'focus' })}>New focus area…</MenuItem>
                </>}
              </MenuButton></div></li>] : []),
          ]}
        </TreeBranch>
      </ul>
    </div></div>
  );
  const focusColumn = (f: FocusTemplate): ReactNode => {
    const top = items.filter((i) => i.parent_id === null && i.template_id === f.id).sort((a, b) => a.position - b.position);
    return (
      <section key={f.id} className="sb-col" style={{ ['--col-color' as string]: `var(--fa-${f.color})` }} aria-label={f.name}>
        <header className="sb-col__head">
          <div><h3 className="sb-col__name">{f.name}</h3><span className="muted sb-col__meta">{plural(top.length, 'objective')}</span></div>
          {canEdit && <MenuButton size="sm" variant="ghost" label={<span aria-label={`Options for ${f.name}`}>⋯</span>}>
            {() => <MenuItem danger onClick={() => void removeFocus(f)}>Remove from this strategy</MenuItem>}
          </MenuButton>}
        </header>
        {top.length === 0 && <p className="muted sb-col__empty">No objectives yet.</p>}
        {top.map((x) => objectiveCard(x))}
        {canEdit && <button type="button" className="sb-add sb-add--big" onClick={() => add('objective', f.id, null)}>+ Add objective</button>}
      </section>
    );
  };
  if (!s) {
    return (
      <div className="stack">
        <MapHead canEdit={canEdit} onNew={() => setCreating({ what: 'strategy' })} />
        <EmptyState title="Build your first strategy" action={canEdit ? <Button variant="primary" onClick={() => setCreating({ what: 'strategy' })}>New strategy</Button> : undefined}>
          A strategy is the blueprint of a plan: its focus areas and the objectives, KPIs and tasks under them. Draw it here once, then create plans from it.
        </EmptyState>
        {creating?.what === 'strategy' && <StrategyDialog model={model} strategy={null} onClose={() => setCreating(null)} onSaved={async (x) => { if (x) setPickedId(x.id); await reload(); }} />}
      </div>
    );
  }

  const focusList = s.focus_ids.map((id) => model.focus_templates.find((f) => f.id === id)).filter((f): f is FocusTemplate => !!f);
  const freeFocus = model.focus_templates.filter((f) => !s.focus_ids.includes(f.id));
  const counts = { objective: items.filter((i) => i.item_kind === 'objective').length, kpi: items.filter((i) => i.item_kind === 'kpi').length, task: items.filter((i) => i.item_kind === 'task').length };

  return (
    <div className="stack">
      <MapHead canEdit={canEdit} onNew={() => setCreating({ what: 'strategy' })} />
      <div className="smap-picker" role="tablist" aria-label="Strategies">
        {model.strategies.map((x) => <button key={x.id} type="button" role="tab" aria-selected={x.id === s.id} className="smap-pick" onClick={() => setPickedId(x.id)}>{x.name}<span className="muted"> · {plural(x.plan_count, 'plan')}</span></button>)}
      </div>
      <section className="sb-head card">
        <div className="sb-head__main">
          <h3 className="section__title">{s.name}</h3>
          {s.description && <p className="muted">{s.description}</p>}
          <p className="muted sb-head__counts">{plural(focusList.length, 'focus area')} · {plural(counts.objective, 'objective')} · {plural(counts.kpi, 'KPI')} · {plural(counts.task, 'task')} · used by {plural(s.plan_count, 'plan')}</p>
        </div>
        <div className="sb-head__actions">
          <Button variant="primary" disabled={!canEdit} onClick={() => dialogs.newPlan({ strategyId: s.id })}>Create a plan from it</Button>
          {canEdit && <MenuButton label="More">
            {() => <>
              <MenuItem onClick={() => setEditing(s)}>Rename or describe</MenuItem>
              <MenuItem danger onClick={() => void removeStrategy()}>Delete strategy</MenuItem>
            </>}
          </MenuButton>}
        </div>
      </section>
      <Segmented label="View" value={view} onChange={pickView} options={[{ value: 'grid', label: 'Grid' }, { value: 'builder', label: 'Builder' }]} />
      {view === 'builder' ? builder(focusList, freeFocus) : <div className="sb-board">
        {focusList.map(focusColumn)}
        {canEdit && <div className="sb-col sb-col--new">
          <MenuButton variant="secondary" align="start" label="+ Add focus area">
            {() => <>
              {freeFocus.map((f) => <MenuItem key={f.id} onClick={() => void saveStrategy({ focus_ids: [...s.focus_ids, f.id] }, `“${f.name}” added.`)}>{f.name}</MenuItem>)}
              <MenuItem onClick={() => setCreating({ what: 'focus' })}>New focus area…</MenuItem>
            </>}
          </MenuButton>
          <p className="muted">Focus areas are the big themes of the strategy, such as Growth or Customers.</p>
        </div>}
      </div>}      <p className="muted smap-note">Grid: each column is a focus area with its objectives, KPIs, tasks and sub-objectives. Builder: the same strategy as a map, read left to right; use the + buttons on any box to grow it. A plan created from this strategy starts with all of it.</p>

      {creating?.what === 'strategy' && <StrategyDialog model={model} strategy={null} onClose={() => setCreating(null)} onSaved={async (x) => { if (x) setPickedId(x.id); await reload(); }} />}
      {editing && <StrategyDialog model={model} strategy={editing} onClose={() => setEditing(null)} onSaved={async () => { await reload(); }} />}
      {creating?.what === 'focus' && <FocusTemplateDialog item={null} onClose={() => setCreating(null)} onSaved={async (f) => { if (f) await client.saveStrategy(ws, s.id, { focus_ids: [...s.focus_ids, f.id] }).catch(() => undefined); await reload(); }} />}
      {itemMode && <ItemDialog model={model} strategy={s} mode={itemMode} onClose={() => setItemMode(null)} onSaved={reload} />}
    </div>
  );
}

/** Create or edit one objective, KPI or task of the strategy. */
function ItemDialog({ model, strategy, mode, onClose, onSaved }: { model: StrategyModel; strategy: Strategy; mode: ItemMode; onClose: () => void; onSaved: () => Promise<void> }) {
  const { client, workspace, run } = usePlanner();
  const item = mode.kind === 'edit' ? mode.item : null;
  const itemKind = item?.item_kind ?? (mode.kind === 'create' ? mode.item_kind : 'objective');
  const parent = mode.kind === 'create' ? mode.parent : strategy.items.find((x) => x.id === item?.parent_id) ?? null;
  const templateId = item?.template_id ?? (mode.kind === 'create' ? mode.templateId : '');
  // kinds follow only the organization's nesting rules; "Objective" is the default
  const kindOptions: GoalType[] = useMemo(() => {
    const limited = model.rules.filter((r) => r.parent_type_id === (parent?.goal_type_id ?? null));
    const list = limited.length ? model.types.filter((t) => limited.some((r) => r.child_type_id === t.id)) : model.types;
    return [...list].sort((a, b) => Number(b.name === 'Objective') - Number(a.name === 'Objective'));
  }, [parent, model.rules, model.types]);
  const kpiTypes = model.measure_types.filter((m) => m.kind_ids.length === 0 || (parent?.goal_type_id && m.kind_ids.includes(parent.goal_type_id)));
  const [title, setTitle] = useState(item?.title ?? '');
  const [kindId, setKindId] = useState(item?.goal_type_id ?? kindOptions[0]?.id ?? '');
  const [unit, setUnit] = useState(item?.unit ?? ''); const [target, setTarget] = useState(item?.target != null ? String(item.target) : '');
  const [direction, setDirection] = useState<'increase' | 'decrease'>(item?.direction ?? 'increase');
  const [err, setErr] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false);
  const noun = itemKind === 'kpi' ? 'KPI' : itemKind === 'task' ? 'task' : parent ? 'sub-objective' : 'objective';

  const save = async () => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = `Give the ${noun} a name.`;
    if (itemKind === 'kpi' && target !== '' && !Number.isFinite(Number(target))) e.target = 'Enter a number.';
    setErr(e); if (Object.keys(e).length || !workspace) return;
    setBusy(true);
    const data: Record<string, unknown> = { title: title.trim() };
    if (itemKind === 'objective') data.goal_type_id = kindId || null;
    if (itemKind === 'kpi') Object.assign(data, { unit: unit.trim(), target: target === '' ? null : Number(target), direction });
    if (!item) Object.assign(data, { strategy_id: strategy.id, template_id: templateId, parent_id: parent?.id ?? null, item_kind: itemKind });
    const ok = await run(() => client.saveStrategyItem(workspace.id, item?.id ?? null, data), { success: item ? 'Saved.' : `${noun[0]!.toUpperCase()}${noun.slice(1)} added.`, refresh: false });
    setBusy(false);
    if (ok) { await onSaved(); onClose(); }
  };

  return (
    <Dialog open title={`${item ? 'Edit' : /^[aeiou]/i.test(noun) ? 'Add an' : 'Add a'} ${noun}`} onClose={onClose}
      description={parent ? `Under “${parent.title}”.` : `In “${model.focus_templates.find((f) => f.id === templateId)?.name ?? 'this focus area'}”.`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={busy} onClick={save}>{item ? 'Save' : `Add ${noun}`}</Button></>}>
      <form className="stack" noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
        {itemKind === 'kpi' && kpiTypes.length > 0 && !item && <SelectField label="Start from a saved KPI" hint="Optional. Fills the fields below." value="" onChange={(e) => { const m = kpiTypes.find((x) => x.id === e.target.value); if (m) { setTitle(m.name); setUnit(m.unit); setDirection(m.direction); } }}>
          <option value="">Choose…</option>{kpiTypes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </SelectField>}
        <TextField label={itemKind === 'kpi' ? 'What you measure' : itemKind === 'task' ? 'Task' : 'Objective'} required value={title} maxLength={200} error={err.title} onChange={(e) => setTitle(e.target.value)}
          placeholder={itemKind === 'kpi' ? 'e.g. Facebook followers' : itemKind === 'task' ? 'e.g. Post one video a day' : 'e.g. Get our first 1,000 followers'} />
        {itemKind === 'kpi' && <div className="form-grid">
          <TextField label="Target" type="number" step="any" value={target} error={err.target} onChange={(e) => setTarget(e.target.value)} />
          <TextField label="Unit" value={unit} maxLength={20} onChange={(e) => setUnit(e.target.value)} placeholder="people, $, %" />
          <SelectField label="A good result goes" value={direction} onChange={(e) => setDirection(e.target.value as 'increase' | 'decrease')}><option value="increase">Up</option><option value="decrease">Down</option></SelectField>
        </div>}
        {itemKind === 'objective' && kindOptions.length > 1 && <details className="smap-more">
          <summary>More options</summary>
          <SelectField label="Kind" hint="Optional. Leave it as Objective unless your team uses other kinds." value={kindId} onChange={(e) => setKindId(e.target.value)}>
            {kindOptions.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
          </SelectField>
        </details>}
      </form>
    </Dialog>
  );
}

function MapHead({ canEdit, onNew }: { canEdit: boolean; onNew: () => void }) {
  return (
    <header className="pagehead">
      <div><h2 className="page-title">Strategy map</h2><p className="page-lede">Create a strategy and draw it: focus areas, their objectives, and the sub-objectives, KPIs and tasks under each. Then create plans from it with everything already in place.</p></div>
      <Button variant="primary" disabled={!canEdit} title={canEdit ? undefined : 'You need permission to manage plans'} onClick={onNew}>New strategy</Button>
    </header>
  );
}
