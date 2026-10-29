import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Cadence, Goal, Measure, MeasureSummary } from '../api/types.ts';
import { usePlanner } from '../state/PlannerContext.tsx';
import { buildHash } from '../state/route.ts';
import { Button, Chip, EmptyState, ProgressBar, Segmented, SelectField, Skeleton, TextArea, TextField } from '../ui/primitives.tsx';
import { Dialog } from '../ui/overlay.tsx';
import { Sparkline } from '../ui/charts.tsx';
import { daysBetween, scheduleState, type ScheduleState } from '../lib/schedule.ts';
import { CADENCE_LABEL } from '../lib/status.ts';
import { formatDate, formatNumber, plural } from '../lib/format.ts';

const BATCH = 6;
// A reading is overdue once it is older than the cadence plus a little slack.
const CADENCE_DAYS: Record<Cadence, number | null> = { none: null, weekly: 7, fortnightly: 14, monthly: 31, quarterly: 92 };

type Filter = 'all' | 'behind' | 'needs' | 'target';
type SortKey = 'name' | 'low' | 'high' | 'oldest' | 'due';
interface Entry { key: string; measure: Measure | null }
interface Change { dir: 'up' | 'down' | 'flat'; text: string; good: boolean | null }
interface Row {
  goal: Goal; m: MeasureSummary; loading: boolean; failed: boolean; detail: Measure | null; progress: number; sched: ScheduleState;
  behind: boolean; onTarget: boolean; last: string | null; daysAgo: number | null; needsReading: boolean; values: number[]; change: Change | null;
}

const entryKey = (g: Goal) => `${g.updated_at}|${g.measure?.id}|${g.measure?.current}`;

function measureProgress(m: MeasureSummary): number {
  const span = Number(m.target) - Number(m.start);
  if (!span) return Number(m.current) === Number(m.target) ? 100 : 0;
  return Math.max(0, Math.min(100, ((Number(m.current) - Number(m.start)) / span) * 100));
}

function describeChange(readings: Measure['readings'], m: MeasureSummary): Change | null {
  if (readings.length < 2) return null;
  const last = Number(readings[readings.length - 1]!.value), prev = Number(readings[readings.length - 2]!.value);
  const diff = last - prev;
  if (diff === 0) return { dir: 'flat', text: 'No change vs last reading', good: null };
  const dir = diff > 0 ? 'up' : 'down';
  const amount = prev !== 0 ? `${Math.abs((diff / prev) * 100).toFixed(1)}%` : formatNumber(Math.abs(diff), m.unit);
  const good = (m.direction === 'increase') === (diff > 0);
  return { dir, text: `${dir === 'up' ? 'Up' : 'Down'} ${amount} vs last reading`, good };
}

const ARROW = { up: '↑', down: '↓', flat: '→' } as const;

function ChangeText({ c }: { c: Change | null }) {
  if (!c) return <span className="muted">No earlier reading to compare</span>;
  return (
    <span className={`mt-change${c.good === true ? ' mt-change--good' : c.good === false ? ' mt-change--bad' : ''}`}>
      <span aria-hidden="true">{ARROW[c.dir]}</span> {c.text}{c.good === true ? ' (toward target)' : c.good === false ? ' (away from target)' : ''}
    </span>
  );
}

export default function MetricsPage() {
  const { plan, planId, client, can, today, openGoal, run } = usePlanner();
  const cache = useRef(new Map<string, Entry | 'error'>());
  const [version, bump] = useReducer((n: number) => n + 1, 0);
  const [view, setView] = useState<'cards' | 'list'>('cards');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<SortKey>('name');
  const [target, setTarget] = useState<Row | null>(null);

  const planGoals = plan?.goals;
  const measureGoals = useMemo(() => (planGoals ?? []).filter((g) => g.measure && !g.archived_at), [planGoals]);
  const archived = !!plan?.plan.archived_at;

  // Sparkline and cadence need each goal's full measure: load them lazily in small batches, reusing what is current.
  useEffect(() => {
    const todo = measureGoals.filter((g) => { const c = cache.current.get(g.id); return c === undefined || (c !== 'error' && c.key !== entryKey(g)); });
    if (!todo.length) return;
    let live = true;
    (async () => {
      for (let i = 0; i < todo.length && live; i += BATCH) {
        await Promise.all(todo.slice(i, i + BATCH).map(async (g) => {
          try {
            const d = await client.goal(g.id);
            const mm = d?.measures.find((x) => x.id === g.measure!.id) ?? d?.measures.find((x) => !x.archived_at) ?? null;
            cache.current.set(g.id, { key: entryKey(g), measure: mm });
          } catch { cache.current.set(g.id, 'error'); }
        }));
        if (live) bump();
      }
    })();
    return () => { live = false; };
  }, [measureGoals, client]);

  const rows = useMemo<Row[]>(() => {
    void version;
    return measureGoals.map((goal) => {
      const m = goal.measure!;
      const c = cache.current.get(goal.id);
      const failed = c === 'error';
      const detail = c && c !== 'error' ? c.measure : null;
      const loading = c === undefined;
      const readings = [...(detail?.readings ?? [])].sort((a, b) => a.recorded_on.localeCompare(b.recorded_on) || a.id.localeCompare(b.id));
      const last = readings.length ? readings[readings.length - 1]!.recorded_on : null;
      const daysAgo = last ? daysBetween(last, today) : null;
      const limit = CADENCE_DAYS[detail?.cadence ?? 'none'];
      const needsReading = !loading && !failed && limit !== null && (daysAgo === null || daysAgo > limit);
      const progress = measureProgress(m);
      const sched = scheduleState({ ...goal, progress }, today);
      return {
        goal, m, loading, failed, detail, progress, sched, last, daysAgo, needsReading,
        behind: progress < 100 && (sched === 'behind' || sched === 'overdue'),
        onTarget: progress >= 100 || sched === 'on_pace' || sched === 'ahead' || sched === 'completed',
        values: readings.slice(-12).map((r) => Number(r.value)),
        change: describeChange(readings, m),
      };
    });
  }, [measureGoals, version, today]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (q && !`${r.m.name} ${r.goal.title} ${r.m.unit}`.toLowerCase().includes(q)) return false;
      if (filter === 'behind') return r.behind;
      if (filter === 'needs') return r.needsReading;
      if (filter === 'target') return r.onTarget;
      return true;
    });
    const cmp: Record<SortKey, (a: Row, b: Row) => number> = {
      name: (a, b) => a.m.name.localeCompare(b.m.name),
      low: (a, b) => a.progress - b.progress,
      high: (a, b) => b.progress - a.progress,
      oldest: (a, b) => (a.last ?? '').localeCompare(b.last ?? ''),
      due: (a, b) => (a.goal.due_date ?? '9999').localeCompare(b.goal.due_date ?? '9999'),
    };
    return out.sort(cmp[sort]);
  }, [rows, query, filter, sort]);

  if (!plan || !planId) return null;
  const canRecord = can['update.post'] && !archived;
  const pending = rows.filter((r) => r.loading).length;
  const recordWhy = archived ? 'This plan is archived, so readings cannot be added.' : 'You do not have permission to record readings.';

  const recordButton = (r: Row) => canRecord
    ? <Button size="sm" onClick={() => setTarget(r)} aria-label={`Record reading for ${r.m.name}`}>Record reading</Button>
    : null;

  const lastText = (r: Row) => {
    if (r.loading) return <Skeleton lines={1} height={14} />;
    if (r.failed) return <span className="muted">Readings unavailable</span>;
    if (r.daysAgo === null) return <span className="muted">No readings yet</span>;
    return <span>{r.daysAgo === 0 ? 'Last reading today' : `Last reading ${plural(r.daysAgo, 'day')} ago`}</span>;
  };
  const cadenceChips = (r: Row) => (
    <>
      <Chip>{r.detail ? CADENCE_LABEL[r.detail.cadence] : r.loading ? '...' : 'Cadence unknown'}</Chip>
      {r.needsReading && <Chip tone="warn">{r.last ? 'Reading overdue' : 'Needs a first reading'}</Chip>}
      <Chip title="Readings are entered by hand">Manual</Chip>
    </>
  );
  const spark = (r: Row) => r.loading ? <Skeleton lines={1} height={28} /> : <Sparkline values={r.values} label={`Trend of ${plural(r.values.length, 'reading')} for ${r.m.name}`} target={Number(r.m.target)} direction={r.m.direction} />;

  return (
    <div className="stack">
      <div>
        <h2 className="page-title">Metrics</h2>
        <p className="page-lede">Every measure in this plan, with its latest reading and trend. Objectives of kind KPI carry the measures.</p>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No measures yet"
          action={<a className="btn btn--secondary" href={buildHash('goals', { plan: planId })}>Go to objectives</a>}>
          A measure is a number that shows whether a goal is working, such as revenue or response time. Add one to a KPI goal and it appears here with its readings.
        </EmptyState>
      ) : (
        <>
          <div className="filterbar">
            <div className="filterbar__row">
              <div className="filterbar__search"><TextField label="Search metrics" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Measure or goal" /></div>
              <div className="field"><span className="field__label" id="mt-filter">Show</span>
                <div role="group" aria-labelledby="mt-filter">
                  <Segmented<Filter> label="Filter metrics" value={filter} onChange={setFilter} options={[
                    { value: 'all', label: 'All' }, { value: 'behind', label: 'Behind schedule', title: 'Progress is behind where it should be today' },
                    { value: 'needs', label: 'Needs reading', title: 'The latest reading is older than the cadence allows' }, { value: 'target', label: 'On target', title: 'On pace, ahead or already at the target' },
                  ]} />
                </div>
              </div>
              <div className="filterbar__sel">
                <SelectField label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                  <option value="name">Measure name</option><option value="low">Progress, lowest first</option><option value="high">Progress, highest first</option>
                  <option value="oldest">Oldest reading first</option><option value="due">Objective due soonest</option>
                </SelectField>
              </div>
              <span className="filterbar__spacer" />
              <Segmented<'cards' | 'list'> label="Layout" value={view} onChange={setView} options={[{ value: 'cards', label: 'Cards' }, { value: 'list', label: 'List' }]} />
            </div>
          </div>
          <p className="muted mt-status" aria-live="polite">
            {shown.length === rows.length ? plural(rows.length, 'measure') : `${shown.length} of ${plural(rows.length, 'measure')}`}
            {pending > 0 && ` · loading readings for ${pending}`}
            {!canRecord && ` · ${recordWhy}`}
          </p>

          {shown.length === 0 ? (
            <EmptyState title="No measures match" action={<Button onClick={() => { setQuery(''); setFilter('all'); }}>Clear search and filter</Button>}>
              Try a different search or filter.
            </EmptyState>
          ) : view === 'cards' ? (
            <ul className="mt-grid">
              {shown.map((r) => (
                <li key={r.goal.id} className="card mt-card">
                  <div>
                    <h2 className="mt-card__name">{r.m.name}</h2>
                    <button type="button" className="link-btn mt-card__goal" onClick={() => openGoal(r.goal.id)}>{r.goal.title}</button>
                  </div>
                  <div className="mt-card__nums">
                    <span className="mt-card__value mono">{formatNumber(r.m.current, r.m.unit)}</span>
                    <span className="muted">target {formatNumber(r.m.target, r.m.unit)} · started at {formatNumber(r.m.start, r.m.unit)}</span>
                  </div>
                  <ProgressBar value={r.progress} label={`${r.m.name} progress`} />
                  <div className="mt-card__trend">{spark(r)}<div className="mt-card__change">{r.loading ? <Skeleton lines={1} height={14} /> : <ChangeText c={r.change} />}<span className="muted">{Math.round(r.progress)}% of the way to target</span></div></div>
                  <div className="mt-card__foot">
                    <div className="row">{cadenceChips(r)}</div>
                    <div className="mt-card__last">{lastText(r)}</div>
                    {recordButton(r)}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">Metrics</caption>
                <thead><tr><th scope="col">Measure</th><th scope="col">Objective</th><th scope="col" className="num">Latest</th><th scope="col" className="num">Target</th><th scope="col">Progress</th><th scope="col">Trend</th><th scope="col">Change</th><th scope="col">Readings</th>{canRecord && <th scope="col"><span className="sr-only">Actions</span></th>}</tr></thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.goal.id}>
                      <th scope="row" className="mt-rowhead">{r.m.name}</th>
                      <td><button type="button" className="link-btn" onClick={() => openGoal(r.goal.id)}>{r.goal.title}</button></td>
                      <td className="num">{formatNumber(r.m.current, r.m.unit)}</td>
                      <td className="num">{formatNumber(r.m.target, r.m.unit)}</td>
                      <td className="mt-prog"><ProgressBar value={r.progress} label={`${r.m.name} progress`} thin /><span className="muted">{Math.round(r.progress)}%</span></td>
                      <td>{spark(r)}</td>
                      <td>{r.loading ? <Skeleton lines={1} height={14} /> : <ChangeText c={r.change} />}</td>
                      <td><div className="mt-card__last">{lastText(r)}</div><div className="row">{cadenceChips(r)}</div></td>
                      {canRecord && <td>{recordButton(r)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {target && <ReadingDialog row={target} today={today} onClose={() => setTarget(null)} onSave={async (value, date, note) => {
        const ok = await run(() => client.recordReading(target.m.id, value, date, note || undefined), { success: 'Reading recorded.' });
        if (ok) { cache.current.delete(target.goal.id); bump(); setTarget(null); }
      }} />}
    </div>
  );
}

function ReadingDialog({ row, today, onClose, onSave }: { row: Row; today: string; onClose: () => void; onSave: (value: number, date: string, note: string) => Promise<void> }) {
  const [value, setValue] = useState('');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const e: Record<string, string> = {};
    if (value.trim() === '' || !Number.isFinite(Number(value))) e.value = 'Enter the reading as a number.';
    if (!date) e.date = 'Choose the date of the reading.';
    else if (date > today) e.date = 'A reading cannot be dated in the future.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    await onSave(Number(value), date, note.trim());
    setBusy(false);
  };

  return (
    <Dialog open title={`Record reading: ${row.m.name}`} onClose={onClose}
      description={`${row.goal.title}. Readings are permanent once saved.`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={busy} onClick={submit}>Save reading</Button></>}>
      <form className="form-grid" noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <TextField label={`Value${row.m.unit ? ` (${row.m.unit})` : ''}`} required type="number" step="any" inputMode="decimal" value={value} error={errors.value}
          hint={`Latest is ${formatNumber(row.m.current, row.m.unit)}; target ${formatNumber(row.m.target, row.m.unit)}.`} onChange={(e) => setValue(e.target.value)} />
        <TextField label="Date of reading" required type="date" max={today} value={date} error={errors.date} onChange={(e) => setDate(e.target.value)} />
        <div className="span-2"><TextArea label="Note" rows={2} maxLength={500} value={note} hint={`Optional. Last read ${row.last ? formatDate(row.last, { year: true }) : 'never'}.`} onChange={(e) => setNote(e.target.value)} /></div>
      </form>
    </Dialog>
  );
}
