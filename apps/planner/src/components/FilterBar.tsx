// Shared filter / sort / group controls and the hook that remembers them. Used by the Strategy map and Goals screens.
// The last-used display is a per-person convenience (browser storage, per plan); named saved views persist in the database.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SavedView } from '../api/types.ts';
import { usePlanner } from '../state/PlannerContext.tsx';
import { Button, SelectField, TextField, Checkbox } from '../ui/primitives.tsx';
import { Dialog, MenuButton, MenuItem, Popover } from '../ui/overlay.tsx';
import { useDialogs } from './Dialogs.tsx';
import { PRIORITY_META, PRIORITY_ORDER, STATUS_META, STATUS_ORDER } from '../lib/status.ts';
import { horizonsAround } from '../lib/horizons.ts';
import { activeFilterCount, emptyFilters, type GoalFilters, type GroupKey, type SortKey } from '../lib/tree.ts';

export interface ViewState { filters: GoalFilters; sort: SortKey; dir: 'asc' | 'desc'; groupBy: GroupKey; colorBy: 'status' | 'focus' | 'priority' }
export const defaultView = (): ViewState => ({ filters: emptyFilters(), sort: 'manual', dir: 'asc', groupBy: 'focus', colorBy: 'status' });

const store = (userId: string, planId: string, scope: string) => `planner.view.${userId}.${planId}.${scope}`;
function load(key: string): ViewState {
  try { const raw = window.localStorage.getItem(key); if (raw) { const v = JSON.parse(raw) as Partial<ViewState>; const d = defaultView(); return { ...d, ...v, filters: { ...d.filters, ...(v.filters ?? {}) } }; } } catch { /* fall back to defaults */ }
  return defaultView();
}

/** Display state for one screen of one plan, remembered per person. `scope` keeps the map and the table independent. */
export function useGoalView(scope: string, overrides: Partial<ViewState> = {}) {
  const { me, planId } = usePlanner();
  const key = planId ? store(me.id, planId, scope) : null;
  const [view, setViewState] = useState<ViewState>(() => ({ ...(key ? load(key) : defaultView()), ...overrides }));
  useEffect(() => { setViewState({ ...(key ? load(key) : defaultView()), ...overrides }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [key]);
  const setView = useCallback((next: ViewState | ((v: ViewState) => ViewState)) => {
    setViewState((cur) => {
      const v = typeof next === 'function' ? next(cur) : next;
      if (key) { try { window.localStorage.setItem(key, JSON.stringify(v)); } catch { /* not remembered */ } }
      return v;
    });
  }, [key]);
  const reset = useCallback(() => setView({ ...defaultView(), ...overrides }), [setView, overrides]);
  return { view, setView, reset };
}

function CheckGroup<T extends string>({ title, options, value, onChange }: { title: string; options: { value: T; label: string }[]; value: T[]; onChange: (v: T[]) => void }) {
  return (
    <fieldset className="check-group">
      <legend>{title}</legend>
      {options.map((o) => <Checkbox key={o.value} label={o.label} checked={value.includes(o.value)} onChange={(on) => onChange(on ? [...value, o.value] : value.filter((v) => v !== o.value))} />)}
    </fieldset>
  );
}

/** Search plus two buttons: "Filters" (what to show) and "Display" (how to arrange it). Everything else lives inside them. */
export function FilterBar({ view, onChange, onReset, showSort = true, showGroup = true, showColor = false }: {
  view: ViewState; onChange: (v: ViewState) => void; onReset: () => void; showSort?: boolean; showGroup?: boolean; showColor?: boolean;
}) {
  const { plan, members, planId, client, run, toast, today, horizons: orgHorizons } = usePlanner();
  const dialogs = useDialogs();
  const horizons = useMemo(() => orgHorizons.length ? orgHorizons.map((h) => ({ id: h.id, label: h.title, start: h.start_date, end: h.end_date })) : horizonsAround(today), [orgHorizons, today]);
  const [customOpen, setCustomOpen] = useState(false);
  const [cFrom, setCFrom] = useState(''); const [cTo, setCTo] = useState('');
  const [saved, setSaved] = useState<SavedView[]>([]);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const loadViews = useCallback(() => { if (planId) client.views(planId).then(setSaved).catch(() => setSaved([])); }, [client, planId]);
  useEffect(loadViews, [loadViews]);
  const f = view.filters;
  const patch = (p: Partial<GoalFilters>) => onChange({ ...view, filters: { ...f, ...p } });
  const count = activeFilterCount(f);
  const tags = useMemo(() => [...new Set((plan?.goals ?? []).flatMap((g) => g.tags))].sort(), [plan]);
  if (!plan) return null;
  const periodValue = f.period ? (horizons.find((h) => h.start === f.period!.start && h.end === f.period!.end)?.id ?? 'custom') : '';

  return (
    <div className="filterbar" role="region" aria-label="Find and arrange">
      <div className="filterbar__row">
        <div className="filterbar__search"><TextField label="Search" type="search" value={f.query} placeholder="Search by title, owner or tag" onChange={(e) => patch({ query: e.target.value })} /></div>
        <Popover label="Filters" count={count}>
          <div className="check-grid">
            <CheckGroup title="Status" value={f.statuses} onChange={(v) => patch({ statuses: v })} options={STATUS_ORDER.map((s) => ({ value: s, label: STATUS_META[s].label }))} />
            <CheckGroup title="Owner" value={f.owners} onChange={(v) => patch({ owners: v })} options={members.map((m) => ({ value: m.user_id, label: m.name }))} />
            <CheckGroup title="Kind" value={f.types} onChange={(v) => patch({ types: v })} options={plan.goal_types.map((t) => ({ value: t.id, label: t.name }))} />
            <CheckGroup title="Priority" value={f.priorities} onChange={(v) => patch({ priorities: v })} options={PRIORITY_ORDER.map((p) => ({ value: p, label: PRIORITY_META[p].label }))} />
            <CheckGroup title="Focus area" value={f.focusAreas} onChange={(v) => patch({ focusAreas: v })} options={plan.focus_areas.filter((a) => !a.archived_at).map((a) => ({ value: a.id, label: a.name }))} />
            {tags.length > 0 && <CheckGroup title="Tag" value={f.tags} onChange={(v) => patch({ tags: v })} options={tags.map((t) => ({ value: t, label: t }))} />}
          </div>
          <SelectField label="Period" value={periodValue} onChange={(e) => {
            const v = e.target.value;
            if (v === '') patch({ period: null });
            else if (v === 'custom') { setCFrom(f.period?.start ?? ''); setCTo(f.period?.end ?? ''); setCustomOpen(true); }
            else { const h = horizons.find((x) => x.id === v); if (h) patch({ period: { start: h.start, end: h.end, label: h.label } }); }
          }}>
            <option value="">All time</option>
            {horizons.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
            <option value="custom">Choose dates…</option>
          </SelectField>
          <fieldset className="check-group">
            <legend>Show only</legend>
            <Checkbox label="Overdue" checked={f.overdueOnly} onChange={(v) => patch({ overdueOnly: v })} />
            <Checkbox label="With open risks" checked={f.withRisks} onChange={(v) => patch({ withRisks: v })} />
            <Checkbox label="No owner" checked={f.unowned} onChange={(v) => patch({ unowned: v })} />
            <Checkbox label="No update in 30 days" checked={f.staleDays === 30} onChange={(v) => patch({ staleDays: v ? 30 : null })} />
          </fieldset>
          <fieldset className="check-group">
            <legend>Hide or include</legend>
            <Checkbox label="Hide completed" checked={f.hideCompleted} onChange={(v) => patch({ hideCompleted: v })} />
            <Checkbox label="Include archived" checked={f.showArchived} onChange={(v) => patch({ showArchived: v })} />
          </fieldset>
          {count > 0 && <Button size="sm" variant="ghost" onClick={onReset}>Clear all filters</Button>}
        </Popover>
        {(showGroup || showSort || showColor) && (
          <Popover label="Display">
            {showGroup && <SelectField label="Group by" value={view.groupBy} onChange={(e) => onChange({ ...view, groupBy: e.target.value as GroupKey })}>
              <option value="focus">Focus area</option><option value="owner">Owner</option><option value="status">Status</option><option value="type">Kind</option><option value="priority">Priority</option><option value="value">Value</option><option value="none">Nothing (one list)</option>
            </SelectField>}
            {showSort && <SelectField label="Sort by" value={view.sort} onChange={(e) => onChange({ ...view, sort: e.target.value as SortKey })}>
              <option value="manual">Your own order</option><option value="title">Title</option><option value="due">Due date</option><option value="progress">Progress</option><option value="status">Status</option><option value="priority">Priority</option><option value="owner">Owner</option><option value="updated">Last update</option>
            </SelectField>}
            {showSort && view.sort !== 'manual' && <SelectField label="Order" value={view.dir} onChange={(e) => onChange({ ...view, dir: e.target.value as 'asc' | 'desc' })}>
              <option value="asc">A to Z, soonest first</option><option value="desc">Z to A, latest first</option>
            </SelectField>}
            {showColor && <SelectField label="Colour cards by" value={view.colorBy} onChange={(e) => onChange({ ...view, colorBy: e.target.value as ViewState['colorBy'] })}>
              <option value="status">Status</option><option value="focus">Focus area</option><option value="priority">Priority</option>
            </SelectField>}
          </Popover>)}
        <MenuButton size="sm" variant="ghost" label="Saved views">
          {() => <>
            {saved.length === 0 && <MenuItem disabled hint="Arrange the list the way you like, then save it here." onClick={() => {}}>No saved views yet</MenuItem>}
            {saved.map((v) => <MenuItem key={v.id} onClick={() => { const d = defaultView(); const c = v.config as Partial<ViewState>; onChange({ ...d, ...c, filters: { ...d.filters, ...(c.filters ?? {}) } }); }}>{v.name}</MenuItem>)}
            <MenuItem onClick={() => { setName(''); setSaving(true); }}>Save this arrangement…</MenuItem>
            {saved.map((v) => <MenuItem key={`del-${v.id}`} danger onClick={() => { void (async () => { if (await dialogs.confirm({ title: `Delete the view “${v.name}”?`, body: <p>Only this saved arrangement is removed. No objective changes.</p>, confirmLabel: 'Delete view', danger: true })) await run(async () => { await client.deleteView(v.id); loadViews(); }, { success: `Deleted “${v.name}”.`, refresh: false }); })(); }}>Delete “{v.name}”</MenuItem>)}
          </>}
        </MenuButton>
        {count > 0 && <Button size="sm" variant="ghost" onClick={onReset}>Clear filters</Button>}
      </div>
      <Dialog open={customOpen} title="Choose dates" onClose={() => setCustomOpen(false)} footer={<><Button onClick={() => setCustomOpen(false)}>Cancel</Button>
        <Button variant="primary" onClick={() => { if (!cFrom || !cTo || cTo < cFrom) { toast('Choose a start date and an end date that is not before it.', 'error'); return; } patch({ period: { start: cFrom, end: cTo } }); setCustomOpen(false); }}>Apply</Button></>}>
        <div className="form-grid"><TextField label="From" type="date" value={cFrom} onChange={(e) => setCFrom(e.target.value)} /><TextField label="To" type="date" value={cTo} onChange={(e) => setCTo(e.target.value)} /></div>
        <p className="muted" style={{ marginBlockStart: 'var(--space-2)' }}>Shows objectives whose dates overlap this period. Objectives without dates always stay visible.</p>
      </Dialog>
      <Dialog open={saving} title="Save this arrangement" onClose={() => setSaving(false)} footer={<><Button onClick={() => setSaving(false)}>Cancel</Button>
        <Button variant="primary" onClick={async () => {
          if (!name.trim() || !planId) { toast('Give it a name.', 'error'); return; }
          const ok = await run(() => client.saveView(planId, name.trim(), view as unknown as Record<string, unknown>), { success: 'Saved.', refresh: false });
          if (ok) { setSaving(false); loadViews(); }
        }}>Save</Button></>}>
        <TextField label="Name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        <p className="muted" style={{ marginBlockStart: 'var(--space-2)' }}>Remembers your filters, grouping and sorting. Only you can see your saved views.</p>
      </Dialog>
    </div>
  );
}