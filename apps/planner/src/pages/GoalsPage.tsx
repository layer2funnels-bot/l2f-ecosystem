// Goals & initiatives: every goal of the plan in one filterable, sortable, groupable table with quick edits and bulk changes.
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { Goal, Priority, Status } from '../api/types.ts';
import { PlannerError } from '../api/types.ts';
import { usePlanner } from '../state/PlannerContext.tsx';
import { useDialogs } from '../components/Dialogs.tsx';
import { FilterBar, useGoalView } from '../components/FilterBar.tsx';
import ImportDialog, { downloadCsv, fileSlug } from '../components/ImportDialog.tsx';
import { MenuButton, MenuItem } from '../ui/overlay.tsx';
import { Button, EmptyState, PriorityBadge, ProgressBar, StatusBadge } from '../ui/primitives.tsx';
import { goalsToCsv } from '../lib/csv.ts';
import { formatDate, percent, plural, relativeTime } from '../lib/format.ts';
import { expectedProgress, scheduleState, SCHEDULE_LABEL } from '../lib/schedule.ts';
import { PRIORITY_META, PRIORITY_ORDER, STATUS_META, STATUS_ORDER } from '../lib/status.ts';
import { ancestors, filterGoals, groupGoals, MAX_DEPTH, sortGoals, type SortKey } from '../lib/tree.ts';

interface Row { goal: Goal; depth: number; childCount: number }
interface BulkReport { verb: string; ok: number; total: number; failed: { id: string; title: string; reason: string }[] }

const COLUMNS: { label: string; sort?: SortKey; className?: string }[] = [
  { label: 'Title', sort: 'title' }, { label: 'Type' }, { label: 'Focus area' }, { label: 'Owner', sort: 'owner' }, { label: 'Status', sort: 'status' },
  { label: 'Progress', sort: 'progress' }, { label: 'Schedule' }, { label: 'Priority', sort: 'priority' }, { label: 'Weight', className: 'num' },
  { label: 'Start' }, { label: 'Due', sort: 'due' }, { label: 'Last update', sort: 'updated' },
];

const safeGet = (k: string) => { try { return window.localStorage.getItem(k); } catch { return null; } };
const reasonOf = (e: unknown) => (e instanceof PlannerError ? e.message : 'Something went wrong.');

export default function GoalsPage() {
  const { plan, planId, me, today, can, members, client, run, toast, openGoal, refresh } = usePlanner();
  const dialogs = useDialogs();
  const storeKey = `planner.view.${me.id}.${planId}.goals`;
  const initial = useMemo(() => (safeGet(storeKey) ? {} : { groupBy: 'status' as const }), [storeKey]);
  const { view, setView, reset } = useGoalView('goals', initial);
  const collapseKey = `planner.goals.collapsed.${me.id}.${planId}`;
  const [collapsed, setCollapsed] = useState<Set<string>>(() => { try { return new Set<string>(JSON.parse(safeGet(collapseKey) ?? '[]') as string[]); } catch { return new Set(); } });
  useEffect(() => { try { setCollapsed(new Set<string>(JSON.parse(safeGet(collapseKey) ?? '[]') as string[])); } catch { setCollapsed(new Set()); } }, [collapseKey]);
  const toggleCollapsed = (id: string) => setCollapsed((cur) => {
    const next = new Set(cur); if (!next.delete(id)) next.add(id);
    try { window.localStorage.setItem(collapseKey, JSON.stringify([...next])); } catch { /* not remembered */ }
    return next;
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<BulkReport | null>(null);
  const [busyBulk, setBusyBulk] = useState(false);

  const archivedPlan = !!plan?.plan.archived_at;
  const canEdit = can['goal.edit'] && !archivedPlan;
  const canArchive = can['goal.archive'] && !archivedPlan;
  const canCreate = can['goal.create'] && !archivedPlan;
  const selectable = canEdit || canArchive;

  const goals = plan?.goals ?? [];
  const focusMap = useMemo(() => new Map((plan?.focus_areas ?? []).map((f) => [f.id, f] as const)), [plan]);
  const typeNames = useMemo(() => Object.fromEntries((plan?.goal_types ?? []).map((t) => [t.id, t.name])), [plan]);
  const filtered = useMemo(() => filterGoals(goals, view.filters, today), [goals, view.filters, today]);
  const sorted = useMemo(() => sortGoals(filtered, view.sort, view.dir), [filtered, view.sort, view.dir]);
  const total = useMemo(() => goals.filter((g) => view.filters.showArchived || !g.archived_at).length, [goals, view.filters.showArchived]);

  const groups = useMemo(() => {
    const ids = new Set(sorted.map((g) => g.id));
    const kids = new Map<string, Goal[]>();
    for (const g of sorted) if (g.parent_goal_id && ids.has(g.parent_goal_id)) (kids.get(g.parent_goal_id) ?? kids.set(g.parent_goal_id, []).get(g.parent_goal_id)!).push(g);
    const base = groupGoals(sorted, view.groupBy, { focusAreas: plan?.focus_areas ?? [], values: plan?.values ?? [], typeNames });
    return base.map((gr) => {
      const rows: Row[] = [];
      const walk = (g: Goal, depth: number) => {
        const ch = kids.get(g.id) ?? [];
        rows.push({ goal: g, depth, childCount: ch.length });
        if (!collapsed.has(g.id)) ch.forEach((c) => walk(c, depth + 1));
      };
      gr.goals.forEach((g) => walk(g, 0));
      const label = view.groupBy === 'status' ? STATUS_META[gr.key as Status].label : view.groupBy === 'priority' ? PRIORITY_META[gr.key as Priority].label : gr.label;
      return { ...gr, label, rows };
    });
  }, [sorted, view.groupBy, plan, typeNames, collapsed]);

  const visibleIds = useMemo(() => groups.flatMap((g) => g.rows.map((r) => r.goal.id)), [groups]);
  // drop selections that are no longer in the table (filtered out or removed)
  useEffect(() => { setSelected((cur) => { const keep = new Set([...cur].filter((id) => goals.some((g) => g.id === id))); return keep.size === cur.size ? cur : keep; }); }, [goals]);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0 && !allSelected;
  const headBox = useRef<HTMLInputElement>(null);
  useEffect(() => { if (headBox.current) headBox.current.indeterminate = someSelected; }, [someSelected]);

  if (!plan || !planId) return null;
  const selectedGoals = goals.filter((g) => selected.has(g.id));

  const onSort = (k: SortKey) => setView((v) => (v.sort === k ? { ...v, dir: v.dir === 'asc' ? 'desc' : 'asc' } : { ...v, sort: k, dir: 'asc' }));
  const setStatus = (g: Goal, status: Status) => run(() => client.saveGoal(planId, g.id, { status }, g.updated_at), { success: `“${g.title}” is now ${STATUS_META[status].label.toLowerCase()}.` });
  const archive = async (g: Goal, to: boolean) => {
    if (to && !(await dialogs.confirm({ title: 'Archive this objective?', body: <p>“{g.title}” leaves the plan views but is not deleted. You can restore it at any time.</p>, confirmLabel: 'Archive objective' }))) return;
    await run(() => client.setGoalArchived(g.id, to), { success: to ? 'Objective archived.' : 'Objective restored.' });
  };

  const exportCsv = () => {
    downloadCsv(`${fileSlug(plan.plan.name)}-goals-${today}.csv`, goalsToCsv(sorted, { focusAreas: plan.focus_areas, typeNames }));
    toast(`Exported ${plural(sorted.length, 'goal')}.`, 'success');
  };

  // Applies one change to each selected goal in turn, so a refusal on one goal never blocks the rest.
  const bulk = async (verb: string, list: Goal[], fn: (g: Goal) => Promise<unknown>) => {
    setBusyBulk(true); setReport(null);
    const out = await run(async () => {
      const failed: BulkReport['failed'] = []; let ok = 0;
      for (const g of list) { try { await fn(g); ok++; } catch (e) { failed.push({ id: g.id, title: g.title, reason: reasonOf(e) }); } }
      return { ok, failed };
    });
    setBusyBulk(false);
    if (!out) return;
    const r: BulkReport = { verb, ok: out.ok, total: list.length, failed: out.failed };
    setReport(r);
    setSelected(new Set(out.failed.map((f) => f.id)));
    toast(out.failed.length ? `${out.ok} of ${list.length} ${verb}. ${out.failed.length} could not be changed; see the list above the table.` : `${out.ok} of ${list.length} ${verb}.`, out.failed.length ? 'error' : 'success');
  };
  const bulkSave = (verb: string, data: Record<string, unknown>) => bulk(verb, selectedGoals, (g) => client.saveGoal(planId, g.id, data));
  const bulkMove = (focusId: string) => {
    const ids = new Set(selectedGoals.map((g) => g.id));
    void bulk('moved', selectedGoals, async (g) => {
      if (g.parent_goal_id) {
        if (ancestors(goals, g.id).some((a) => ids.has(a.id))) return;                       // travels with its selected parent
        throw new PlannerError('invalid', 'It is a sub-goal, so it stays in its parent’s focus area.');
      }
      if (g.focus_area_id !== focusId) await client.moveGoal(g.id, focusId, null, []);
    });
  };
  const bulkArchive = async () => {
    const n = selectedGoals.length;
    if (!(await dialogs.confirm({ title: `Archive ${plural(n, 'goal')}?`, body: <p>The selected objectives leave the plan views but are not deleted. You can restore them at any time.</p>, confirmLabel: `Archive ${plural(n, 'goal')}` }))) return;
    void bulk('archived', selectedGoals.filter((g) => !g.archived_at), (g) => client.setGoalArchived(g.id, true));
  };

  const colCount = COLUMNS.length + 1 + (selectable ? 1 : 0);
  const sortAttr = (k?: SortKey) => (k && view.sort === k ? (view.dir === 'asc' ? 'ascending' : 'descending') : k ? 'none' : undefined);

  return (
    <div className="stack objectives">
      <div className="row row--between">
        <div>
          <h2 className="page-title">All objectives</h2>
          <p className="muted" role="status" aria-live="polite" data-testid="goal-count">{sorted.length} of {plural(total, 'goal')}{sorted.length !== total && ' match the current filters'}</p>
        </div>
        <div className="row">
          <Button onClick={exportCsv} disabled={sorted.length === 0} title="Saves the objectives shown below as a CSV file">Export CSV</Button>
          <Button onClick={() => setImporting(true)} disabled={!canCreate} title={canCreate ? 'Add many objectives from a CSV file' : archivedPlan ? 'This plan is archived and read-only.' : 'You don’t have permission to add objectives.'}>Import CSV</Button>
          <Button variant="primary" onClick={() => dialogs.newGoal()} disabled={!canCreate} title={canCreate ? undefined : archivedPlan ? 'This plan is archived and read-only.' : 'You don’t have permission to add objectives.'}>Add objective</Button>
        </div>
      </div>
      {!can['goal.edit'] && !can['goal.create'] && <p className="muted">You have read-only access: you can browse, filter and export every goal.</p>}
      {archivedPlan && <p className="muted">This plan is archived, so it is read-only. Restore it from the Plan menu to make changes.</p>}

      <FilterBar view={view} onChange={setView} onReset={reset} />

      {selectable && selected.size > 0 && (
        <div className="bulkbar" role="region" aria-label="Actions for selected goals">
          <strong>{plural(selected.size, 'goal')} selected</strong>
          {canEdit && <>
            <MenuButton size="sm" label="Set status" align="start">{() => STATUS_ORDER.map((s) => <MenuItem key={s} onClick={() => void bulkSave('updated', { status: s })}>{STATUS_META[s].glyph} {STATUS_META[s].label}</MenuItem>)}</MenuButton>
            <MenuButton size="sm" label="Set owner" align="start">{() => <>
              <MenuItem onClick={() => void bulkSave('updated', { owner_id: null })}>No owner</MenuItem>
              {members.map((m) => <MenuItem key={m.user_id} onClick={() => void bulkSave('updated', { owner_id: m.user_id })}>{m.name}</MenuItem>)}</>}</MenuButton>
            <MenuButton size="sm" label="Set priority" align="start">{() => PRIORITY_ORDER.map((p) => <MenuItem key={p} onClick={() => void bulkSave('updated', { priority: p })}>{PRIORITY_META[p].glyph} {PRIORITY_META[p].label}</MenuItem>)}</MenuButton>
            <MenuButton size="sm" label="Move to focus area" align="start">{() => plan.focus_areas.filter((f) => !f.archived_at).map((f) => <MenuItem key={f.id} onClick={() => bulkMove(f.id)}>{f.name}</MenuItem>)}</MenuButton>
          </>}
          {canArchive && <Button size="sm" variant="danger" onClick={() => void bulkArchive()}>Archive</Button>}
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear selection</Button>
          {busyBulk && <span role="status"><span className="spinner" aria-hidden="true" /> Working…</span>}
        </div>)}

      {report && (
        <div className={report.failed.length ? 'bulkreport bulkreport--bad' : 'bulkreport'} role="status">
          <div className="row row--between">
            <strong>{report.ok} of {report.total} {report.verb}.</strong>
            <Button size="sm" variant="ghost" onClick={() => setReport(null)}>Dismiss</Button>
          </div>
          {report.failed.length > 0 && <ul>{report.failed.map((f) => <li key={f.id}><strong>{f.title}</strong>: {f.reason}</li>)}</ul>}
        </div>)}

      {total === 0 ? (
        <EmptyState title="No objectives in this plan yet" action={canCreate ? <Button variant="primary" onClick={() => dialogs.newGoal()}>Add the first objective</Button> : undefined}>
          Objectives are the outcomes you want to reach.{canCreate ? ' Add one, or import a list from a CSV file.' : ' A strategy lead can add the first objectives.'}
        </EmptyState>
      ) : sorted.length === 0 ? (
        <EmptyState title="No objectives match these filters" action={<Button onClick={reset}>Clear filters</Button>}>Try fewer filters or a different search.</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table goals-table">
            <caption className="sr-only">Objectives of {plan.plan.name}. Use the column headings to sort.</caption>
            <thead>
              <tr>
                {selectable && <th scope="col" className="goals-check"><input ref={headBox} type="checkbox" aria-label="Select all goals shown" checked={allSelected}
                  onChange={(e) => setSelected(e.target.checked ? new Set(visibleIds) : new Set())} /></th>}
                {COLUMNS.map((c) => (
                  <th key={c.label} scope="col" className={c.className} aria-sort={sortAttr(c.sort)}>
                    {c.sort ? <button type="button" className="goals-sort" onClick={() => onSort(c.sort!)}>{c.label}<span aria-hidden="true">{view.sort === c.sort ? (view.dir === 'asc' ? ' ▲' : ' ▼') : ''}</span></button> : c.label}
                  </th>))}
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            {groups.map((gr) => (
              <tbody key={gr.key}>
                {view.groupBy !== 'none' && (
                  <tr className="goals-group"><th scope="rowgroup" colSpan={colCount}>{gr.label}<span className="muted"> · {plural(gr.rows.length, 'goal')}</span></th></tr>)}
                {gr.rows.map((r) => (
                  <GoalRow key={r.goal.id} row={r} today={today} canEdit={canEdit} canArchive={canArchive} canCreate={canCreate} selectable={selectable}
                    checked={selected.has(r.goal.id)} collapsed={collapsed.has(r.goal.id)} focusName={focusMap.get(r.goal.focus_area_id)?.name ?? ''}
                    deep={ancestors(goals, r.goal.id).length >= MAX_DEPTH - 1}
                    onToggle={() => toggleCollapsed(r.goal.id)} onCheck={(on) => setSelected((cur) => { const n = new Set(cur); if (on) n.add(r.goal.id); else n.delete(r.goal.id); return n; })}
                    onOpen={() => openGoal(r.goal.id)} onStatus={(s) => void setStatus(r.goal, s)} onEdit={() => dialogs.editGoal(r.goal)}
                    onSub={() => dialogs.newGoal({ parentId: r.goal.id })} onArchive={() => void archive(r.goal, !r.goal.archived_at)} />))}
              </tbody>))}
          </table>
        </div>)}
      <ImportDialog open={importing} onClose={() => { setImporting(false); void refresh(); }} />
    </div>
  );
}

function GoalRow({ row, today, canEdit, canArchive, canCreate, selectable, checked, collapsed, focusName, deep, onToggle, onCheck, onOpen, onStatus, onEdit, onSub, onArchive }: {
  row: Row; today: string; canEdit: boolean; canArchive: boolean; canCreate: boolean; selectable: boolean; checked: boolean; collapsed: boolean; focusName: string; deep: boolean;
  onToggle(): void; onCheck(on: boolean): void; onOpen(): void; onStatus(s: Status): void; onEdit(): void; onSub(): void; onArchive(): void;
}) {
  const g = row.goal;
  const state = scheduleState(g, today);
  const expected = g.status === 'completed' ? null : expectedProgress(g, today);
  const overdue = state === 'overdue';
  const interactive = (t: EventTarget | null) => t instanceof Element && !!t.closest('button, a, input, select, label, [role="menu"]');
  const onKey = (e: KeyboardEvent<HTMLTableRowElement>) => { if (e.key === 'Enter' && e.target === e.currentTarget) onOpen(); };
  const showMenu = canEdit || canArchive || canCreate;
  return (
    <tr className={g.archived_at ? 'goals-row goals-row--archived' : 'goals-row'} tabIndex={0} aria-label={`${g.title}. Press Enter to open.`} onKeyDown={onKey}
      onClick={(e) => { if (!interactive(e.target)) onOpen(); }} aria-selected={selectable ? checked : undefined}>
      {selectable && <td className="goals-check"><input type="checkbox" aria-label={`Select ${g.title}`} checked={checked} onChange={(e) => onCheck(e.target.checked)} /></td>}
      <td>
        <div className="goals-title" style={{ paddingInlineStart: `${row.depth * 20}px` }}>
          {row.childCount > 0
            ? <button type="button" className="goals-twisty" aria-expanded={!collapsed} aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${plural(row.childCount, 'sub-goal')} of ${g.title}`} onClick={onToggle}><span aria-hidden="true">{collapsed ? '▸' : '▾'}</span></button>
            : <span className="goals-twisty goals-twisty--none" aria-hidden="true" />}
          <span className="goals-title__text">{g.title}{g.archived_at && <span className="chip" style={{ marginInlineStart: 6 }}>Archived</span>}{collapsed && <span className="muted"> ({row.childCount} hidden)</span>}</span>
        </div>
      </td>
      <td>{g.type_name ?? '—'}</td>
      <td>{focusName || '—'}</td>
      <td>{g.owner_name ?? <span className="muted">No owner</span>}</td>
      <td>{canEdit && !g.archived_at
        ? <select className="input goals-status" aria-label={`Status of ${g.title}`} value={g.status} onChange={(e) => onStatus(e.target.value as Status)}>
            {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].glyph} {STATUS_META[s].label}</option>)}</select>
        : <StatusBadge status={g.status} />}</td>
      <td><div className="goals-progress"><ProgressBar value={g.progress} status={g.status} label={`Progress of ${g.title}`} thin expected={expected} /><span className="mono">{percent(g.progress)}</span></div></td>
      <td><span className={overdue ? 'goals-overdue' : undefined}>{SCHEDULE_LABEL[state]}</span>{expected !== null && <span className="muted goals-expected">Expected today {expected}%</span>}</td>
      <td><PriorityBadge priority={g.priority} /></td>
      <td className="num">{g.weight}</td>
      <td>{formatDate(g.start_date)}</td>
      <td className={overdue ? 'goals-overdue' : undefined}>{formatDate(g.due_date)}{overdue && <span className="sr-only"> (overdue)</span>}</td>
      <td className="muted">{relativeTime(g.last_update_at)}</td>
      <td className="goals-actions">{showMenu && !g.archived_at && (
        <RowMenu label={`Actions for ${g.title}`}>{(close) => <>
          <MenuItem disabled={!canEdit} onClick={() => { close(); onEdit(); }}>Edit</MenuItem>
          <MenuItem disabled={!canCreate || deep} onClick={() => { close(); onSub(); }}>{deep ? `Add sub-objective (limit of ${MAX_DEPTH} levels)` : 'Add sub-objective'}</MenuItem>
          <MenuItem danger disabled={!canArchive} onClick={() => { close(); onArchive(); }}>Archive</MenuItem></>}</RowMenu>)}
        {showMenu && g.archived_at && canArchive && <Button size="sm" onClick={onArchive}>Restore</Button>}
      </td>
    </tr>
  );
}

/** A menu that opens with fixed positioning so the scrolling table never clips it. */
function RowMenu({ label, children }: { label: string; children: (close: () => void) => ReactNode }) {
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  const close = useCallback(() => setPos(null), []);
  useEffect(() => {
    if (!pos) return;
    const onDoc = (e: MouseEvent) => { const t = e.target as Node; if (!panel.current?.contains(t) && !btn.current?.contains(t)) close(); };
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') { close(); btn.current?.focus(); } };
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey);
    window.addEventListener('resize', close); document.addEventListener('scroll', close, true);
    panel.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', close); document.removeEventListener('scroll', close, true); };
  }, [pos, close]);
  const open = () => {
    const r = btn.current!.getBoundingClientRect();
    const right = window.innerWidth - r.right;
    setPos(window.innerHeight - r.bottom < 190 ? { bottom: window.innerHeight - r.top + 4, right } : { top: r.bottom + 4, right });
  };
  return (
    <>
      <button ref={btn} type="button" className="icon-btn" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={!!pos} aria-controls={pos ? id : undefined} onClick={() => (pos ? close() : open())}><span aria-hidden="true">⋯</span></button>
      {pos && <div ref={panel} id={id} className="menu__panel goals-menu" role="menu" style={{ position: 'fixed', insetBlockStart: pos.top, insetBlockEnd: pos.bottom, insetInlineEnd: pos.right }}>{children(close)}</div>}
    </>
  );
}
