import { taskMenuProps } from '../../../task/taskMenu.tsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { OverviewPrefs, ProjectAnalytics, ProjectDetail, ProjectPatch, ViewPrefs } from '../../../../shared/api.ts';
import { call } from '../../../api/client.ts';
import { setQueryData, useMutation, useQuery } from '../../../api/store.ts';
import { BarChart, ChartCard, Donut, KpiTile, LineChart, dateLong, dateShort, fmtDur, fmtHrs, fmtNum, fmtShare, plural } from '../../../charts/index.ts';
import type { SparkPoint } from '../../../charts/index.ts';
import { useTasks } from '../../../lib/data.ts';
import { useAssignable } from '../../../lib/people.ts';
import { addDays, cx, fmtDate, isOverdue, parseYmd, PRIORITY_META, relTime, ROLE_LABEL, TASK_STATUS_META, todayYmd } from '../../../lib/util.ts';
import { links, navigate, openTask, parseHash, useRoute } from '../../../router.ts';
import { AssigneeStack, Avatar, PriorityFlag } from '../../../ui/Badges.tsx';
import { Button } from '../../../ui/Button.tsx';
import { Card, EmptyState, ErrorState, Skeleton } from '../../../ui/Feedback.tsx';
import { Textarea, Toggle } from '../../../ui/Form.tsx';
import { DatePicker } from '../../../ui/DatePicker.tsx';
import { PeoplePicker } from '../../../ui/PeoplePicker.tsx';
import { Icon } from '../../../ui/icons.tsx';

function describe(kind: string): string {
  const parts = kind.split(/[._]/).filter(Boolean);
  if (parts[0] === 'task' && parts.length > 1) parts.shift();
  return parts.join(' ') || 'updated';
}

// ---------------------------------------------------------------------------------------------
// Filters: URL query (?range=&from=&to=&who=&subs=) wins, then the saved per-person viewprefs "overview", then the defaults.
// ---------------------------------------------------------------------------------------------
type Preset = NonNullable<OverviewPrefs['preset']>;
const PRESETS: { id: Preset; label: string }[] = [
  { id: '7d', label: '7 days' }, { id: '30d', label: '30 days' }, { id: '90d', label: '90 days' }, { id: 'project', label: 'This project' }, { id: 'custom', label: 'Custom' },
];
const URL_KEYS = ['range', 'from', 'to', 'who', 'subs'];
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNASSIGNED = 'unassigned';

function clean(raw: Partial<Record<keyof OverviewPrefs, unknown>> | undefined): OverviewPrefs {
  const r = raw ?? {};
  const from = typeof r.from === 'string' && YMD.test(r.from) ? r.from : undefined;
  const to = typeof r.to === 'string' && YMD.test(r.to) ? r.to : undefined;
  const preset = PRESETS.some((x) => x.id === r.preset) ? (r.preset as Preset) : from || to ? 'custom' : 'project';
  const ids = Array.isArray(r.assigneeIds) ? r.assigneeIds.filter((x): x is string => typeof x === 'string' && (x === UNASSIGNED || UUID.test(x))) : [];
  return { preset, from, to, assigneeIds: [...new Set(ids)].slice(0, 60), includeSubtasks: r.includeSubtasks === true };
}
function fromParams(params: URLSearchParams): OverviewPrefs | null {
  if (!URL_KEYS.some((k) => params.has(k))) return null;
  return clean({ preset: params.get('range'), from: params.get('from'), to: params.get('to'), assigneeIds: (params.get('who') ?? '').split(',').filter(Boolean), includeSubtasks: params.get('subs') === '1' });
}
function writeUrl(p: OverviewPrefs) {
  const r = parseHash(window.location.hash);
  const params = new URLSearchParams(r.params);
  for (const k of URL_KEYS) params.delete(k);
  params.set('range', p.preset ?? 'project');
  if (p.preset === 'custom') { if (p.from) params.set('from', p.from); if (p.to) params.set('to', p.to); }
  if (p.assigneeIds?.length) params.set('who', p.assigneeIds.join(','));
  if (p.includeSubtasks) params.set('subs', '1');
  const qs = params.toString();
  navigate(`#${r.path}${qs ? `?${qs}` : ''}`, { replace: true });
}

function useOverviewFilters(projectId: string) {
  const route = useRoute();
  const prefsQ = useQuery(`viewprefs:${projectId}`, () => call('viewprefs.get', { projectId }), []);
  const fromUrl = useMemo(() => fromParams(route.params), [route.params]);
  const saved = useMemo(() => (prefsQ.data?.overview ? clean(prefsQ.data.overview as Partial<Record<keyof OverviewPrefs, unknown>>) : null), [prefsQ.data]);
  const value = fromUrl ?? saved ?? clean(undefined);
  const ready = fromUrl !== null || prefsQ.data !== undefined || prefsQ.error !== null;

  const pending = useRef<OverviewPrefs | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const flush = () => {
    window.clearTimeout(timer.current);
    const next = pending.current;
    pending.current = null;
    if (!next) return;
    void (async () => {
      try {
        const cur = await call('viewprefs.get', { projectId });
        await call('viewprefs.set', { projectId, prefs: { ...cur, overview: next } });
      } catch { /* the URL still holds the choice; the server copy is a bonus */ }
    })();
  };
  useEffect(() => () => flush(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId]);

  const set = (patch: Partial<OverviewPrefs>) => {
    const next = clean({ ...value, ...patch });
    writeUrl(next);
    setQueryData<ViewPrefs>(`viewprefs:${projectId}`, (old) => ({ ...old, overview: next }));
    pending.current = next;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 600);
  };
  const isDefault = value.preset === 'project' && !value.assigneeIds?.length && !value.includeSubtasks;
  return { value, ready, set, reset: () => set({ preset: 'project', from: undefined, to: undefined, assigneeIds: [], includeSubtasks: false }), isDefault };
}

function rangeArgs(v: OverviewPrefs): { from?: string; to?: string } {
  const t = todayYmd();
  switch (v.preset) {
    case '7d': return { from: addDays(t, -6) };
    case '30d': return { from: addDays(t, -29) };
    case '90d': return { from: addDays(t, -89) };
    case 'custom': return { from: v.from, to: v.to };
    default: return {};
  }
}

// ---------------------------------------------------------------------------------------------
export function OverviewView({ project: p }: { project: ProjectDetail }) {
  const editable = p.myRole === 'manager' && !p.deletedAt;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(p.description);
  const save = useMutation((description: string) => call('projects.update', { id: p.id, patch: { description } satisfies ProjectPatch }), {
    onMutate: (description) => setQueryData<ProjectDetail>(`project:${p.id}`, (old) => ({ ...old, description })),
    invalidate: ['project', 'projects'],
    onSuccess: () => setEditing(false),
    success: 'Description saved',
  });

  const tasks = useTasks(p.id, false);
  const activity = useQuery(`activity:${p.id}`, () => call('activity.project', { projectId: p.id, limit: 12 }), []);

  const upcoming = (tasks.data ?? [])
    .filter((t) => !t.parentId && t.status !== 'done' && t.dueOn)
    .sort((a, b) => (a.dueOn as string).localeCompare(b.dueOn as string))
    .slice(0, 6);

  return (
    <div className="pm-ov">
      <Analytics project={p} />
      <div className="pm-overview">
        <div className="pm-overview__main">
          <Card title="About" actions={editable && !editing ? <Button size="sm" variant="ghost" icon="edit" onClick={() => { setDraft(p.description); setEditing(true); }}>Edit</Button> : undefined}>
            {editing ? (
              <form onSubmit={(e) => { e.preventDefault(); void save.mutate(draft.trim()); }}>
                <Textarea data-autofocus autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} placeholder="What is this project for? Who is it for? What does done look like?" aria-label="Project description" />
                <div className="pm-row pm-row--end">
                  <Button size="sm" onClick={() => setEditing(false)} disabled={save.loading}>Cancel</Button>
                  <Button size="sm" type="submit" variant="primary" loading={save.loading}>Save</Button>
                </div>
              </form>
            ) : p.description ? (
              <p className="pm-prose">{p.description}</p>
            ) : editable ? (
              <button type="button" className="pm-placeholderbtn" onClick={() => { setDraft(''); setEditing(true); }}>Add a description so everyone knows what this project is for…</button>
            ) : (
              <p className="pm-faint">No description yet.</p>
            )}
          </Card>

          <Card title="Upcoming deadlines">
            {tasks.loading && <div className="pm-stack"><Skeleton height={32} /><Skeleton height={32} /></div>}
            {tasks.error && !tasks.data && <ErrorState compact title="Couldn't load tasks" message={tasks.error.message} onRetry={() => void tasks.refetch()} />}
            {tasks.data && upcoming.length === 0 && <EmptyState compact icon="calendar" title="No upcoming deadlines" text="Open tasks with a due date will show up here." />}
            {upcoming.length > 0 && (
              <ul className="pm-tasklist">
                {upcoming.map((t) => (
                  <li key={t.id}>
                    <button type="button" className="pm-taskrow" onClick={() => openTask(t.id)} {...taskMenuProps(t)}>
                      <span className="pm-dot pm-dot--lg" style={{ background: TASK_STATUS_META[t.status].color }} aria-label={TASK_STATUS_META[t.status].label} />
                      <span className="pm-taskrow__title pm-truncate">{t.title}</span>
                      <PriorityFlag priority={t.priority} showLabel={false} />
                      <AssigneeStack people={t.assignees} max={3} size={20} />
                      <span className={cx('pm-taskrow__due pm-num', isOverdue(t.dueOn) && 'is-overdue')}>{fmtDate(t.dueOn)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="pm-overview__side">
          <Card title="Members">
            <ul className="pm-members pm-members--compact">
              {p.members.map((m) => (
                <li key={m.id} className="pm-member">
                  <Avatar person={m} size={24} />
                  <span className="pm-truncate">{m.name}</span>
                  <span className="pm-badge pm-badge--neutral">{ROLE_LABEL[m.role]}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Recent activity">
            {activity.loading && <div className="pm-stack"><Skeleton height={28} /><Skeleton height={28} /><Skeleton height={28} /></div>}
            {activity.error && !activity.data && <ErrorState compact title="Couldn't load activity" message={activity.error.message} onRetry={() => void activity.refetch()} />}
            {activity.data && activity.data.length === 0 && <EmptyState compact icon="clock" title="No activity yet" text="Changes to tasks and comments will be listed here." />}
            <ol className="pm-activity">
              {activity.data?.map((a) => (
                <li key={a.id} className="pm-activity__item">
                  <Avatar person={a.actor} size={22} />
                  <div className="pm-activity__text">
                    <span>
                      <strong>{a.actor?.name ?? 'Someone'}</strong> {describe(a.kind)}
                      {a.taskTitle && a.taskId && <> <button type="button" className="pm-linkbtn" onClick={() => openTask(a.taskId as string)}>{a.taskTitle}</button></>}
                    </span>
                    <span className="pm-faint">{relTime(a.createdAt)}</span>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Analytics section
// ---------------------------------------------------------------------------------------------
const C = {
  created: 'var(--pm-st-in_progress)', completed: 'var(--pm-st-done)', remaining: 'var(--pm-accent)', ideal: 'var(--pm-text-3)',
  open: 'var(--pm-st-in_progress)', done: 'var(--pm-st-done)',
};
const PRIORITY_ORDER = ['urgent', 'high', 'medium', 'low', 'none'] as const;

function Analytics({ project: p }: { project: ProjectDetail }) {
  const f = useOverviewFilters(p.id);
  const people = useAssignable(p);
  const pickerPeople = useMemo(() => [...people, { id: UNASSIGNED, name: 'Unassigned', email: '', color: '#9aa1b2' }], [people]);
  const range = rangeArgs(f.value);
  const who = f.value.assigneeIds ?? [];
  const subs = f.value.includeSubtasks === true;
  const q = useQuery(
    `analytics:${p.id}`,
    () => call('analytics.project', { projectId: p.id, ...range, assigneeIds: who.length ? who : undefined, includeSubtasks: subs }),
    [range.from ?? '', range.to ?? '', who.join(','), subs],
    { enabled: f.ready },
  );
  // Keep the last answer on screen (dimmed) while a new filter loads, instead of flashing skeletons.
  const last = useRef<ProjectAnalytics | undefined>(undefined);
  if (q.data) last.current = q.data;
  const a = q.error ? undefined : q.data ?? last.current;
  const loading = !a && !q.error;
  const busy = !!a && (!q.data || q.fetching);
  const err = q.error ? { message: q.error.message } : null;
  const retry = () => void q.refetch();
  const empty = a && a.totals.total === 0 ? 'No tasks in this range' : false;

  const setPreset = (preset: Preset) => {
    if (preset === 'custom') {
      const cur = a?.range;
      f.set({ preset, from: f.value.from ?? cur?.from ?? addDays(todayYmd(), -29), to: f.value.to ?? cur?.to ?? todayYmd() });
    } else f.set({ preset, from: undefined, to: undefined });
  };

  const pts = a?.completionSeries ?? [];
  const week = a?.range.bucket === 'week';
  const title = (i: number) => {
    const d = pts[i]?.date;
    if (!d) return '';
    if (!week) return dateLong(d);
    const end = addDays(d, 6) > (a?.range.to ?? d) ? (a?.range.to as string) : addDays(d, 6);
    return end === d ? dateLong(d) : `${dateShort(d)} – ${dateShort(end)}`;
  };
  const spark = (pick: (i: number) => number): SparkPoint[] => pts.map((_, i) => ({ label: title(i), value: pick(i) }));
  const fileBase = p.name;
  const t = a?.totals;
  const completion = t && t.total ? (t.done / t.total) * 100 : 0;

  return (
    <section className="pm-an" aria-label="Project analytics">
      <div className="pm-an__bar" role="group" aria-label="Analytics filters">
        <div className="pm-an__group">
          <span className="pm-an__lbl" id={`an-range-${p.id}`}>Range</span>
          <div className="pm-an__seg" role="group" aria-labelledby={`an-range-${p.id}`}>
            {PRESETS.map((x) => <button key={x.id} type="button" aria-pressed={f.value.preset === x.id} onClick={() => setPreset(x.id)}>{x.label}</button>)}
          </div>
        </div>
        {f.value.preset === 'custom' && (
          <div className="pm-an__group">
            <DatePicker ariaLabel="From" value={f.value.from ?? null} max={f.value.to ?? null} clearable={false} size="sm" onChange={(v) => v && f.set({ from: v })} />
            <span className="pm-faint" aria-hidden="true">to</span>
            <DatePicker ariaLabel="To" value={f.value.to ?? null} min={f.value.from ?? null} clearable={false} size="sm" onChange={(v) => v && f.set({ to: v })} />
          </div>
        )}
        <div className="pm-an__group">
          <span className="pm-an__lbl">People</span>
          <PeoplePicker people={pickerPeople} value={who} onChange={(ids) => f.set({ assigneeIds: ids })} ariaLabel="Assignees" placeholder="Everyone" size="sm" title="Filter by assignee" />
        </div>
        <label className="pm-an__toggle">
          <Toggle checked={subs} onChange={(v) => f.set({ includeSubtasks: v })} label="Include subtasks" />
          <span>Include subtasks</span>
        </label>
        <span className="pm-an__spacer" />
        {a && <span className="pm-an__range pm-num" aria-live="polite">{dateShort(a.range.from)} – {dateShort(a.range.to)} · {week ? 'weekly' : 'daily'} points</span>}
        {!f.isDefault && <Button size="sm" variant="ghost" icon="restore" onClick={f.reset}>Reset</Button>}
      </div>

      {err && !a && <ErrorState title="Couldn't load the analytics" message={err.message} onRetry={retry} />}

      <div className="pm-kpis" role="list" aria-label="Key numbers">
        {loading ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} height={112} radius={12} />) : t && (
          <>
            <div role="listitem" style={{ display: 'contents' }}><KpiTile label="Open" value={fmtNum(t.open)} hint={`of ${plural(t.total, 'task')}`} spark={{ points: spark((i) => pts[i].openAtEnd), color: C.remaining }} /></div>
            <div role="listitem" style={{ display: 'contents' }}><KpiTile label="Done" value={fmtNum(t.done)} hint="finished" tone={undefined} spark={{ points: spark((i) => pts[i].totalAtEnd - pts[i].openAtEnd), color: C.done }} /></div>
            <div role="listitem" style={{ display: 'contents' }}><KpiTile label="Overdue" value={fmtNum(t.overdue)} hint="open and past due" tone={t.overdue > 0 ? 'danger' : 'ok'} spark={{ points: spark((i) => pts[i].overdueAtEnd), color: C.remaining }} /></div>
            <div role="listitem" style={{ display: 'contents' }}><KpiTile label="Completion" value={fmtShare(completion / 100)} hint={`${fmtNum(t.done)} of ${fmtNum(t.total)}`} spark={{ points: spark((i) => (pts[i].totalAtEnd ? ((pts[i].totalAtEnd - pts[i].openAtEnd) / pts[i].totalAtEnd) * 100 : 0)), format: (v) => fmtShare(v / 100), color: C.done }} /></div>
            <div role="listitem" style={{ display: 'contents' }}><KpiTile label="Estimated left" value={fmtHrs(t.estimateMinutes - t.estimateDoneMinutes)} hint="on open tasks" spark={{ points: spark((i) => pts[i].estimateLeftAtEnd), format: fmtHrs, color: C.remaining }} /></div>
            <div role="listitem" style={{ display: 'contents' }}><KpiTile label="Time logged" value={fmtDur(t.loggedMinutes)} hint="in this range" spark={{ points: spark((i) => pts[i].loggedMinutes), format: fmtDur, color: C.created }} /></div>
          </>
        )}
      </div>

      <div className="pm-charts">
        <ChartCard
          title="Tasks by status" subtitle="How many tasks are in each status right now. Hover a slice for its share; use the legend to hide a status."
          loading={loading} error={err} onRetry={retry} empty={empty} busy={busy} fileBase={fileBase} skeletonHeight={180}
          csv={() => [['Status', 'Tasks', 'Estimate (minutes)'], ...(a?.byStatus ?? []).map((s) => [TASK_STATUS_META[s.status].label, s.count, s.estimateMinutes])]}
        >
          {a && (
            <Donut
              ariaLabel="Tasks by status"
              data={a.byStatus.map((s) => ({
                key: s.status, label: TASK_STATUS_META[s.status].label, value: s.count, color: TASK_STATUS_META[s.status].color,
                rows: s.estimateMinutes > 0 ? [{ label: 'Estimate', value: fmtHrs(s.estimateMinutes) }] : [],
              }))}
            />
          )}
        </ChartCard>

        <ChartCard
          title="Tasks by priority" subtitle="Tasks per priority level, most urgent first, in the current range."
          loading={loading} error={err} onRetry={retry} empty={empty} busy={busy} fileBase={fileBase} skeletonHeight={180}
          csv={() => [['Priority', 'Tasks', 'Estimate (minutes)'], ...(a?.byPriority ?? []).map((s) => [PRIORITY_META[s.priority].label, s.count, s.estimateMinutes])]}
        >
          {a && (
            <BarChart
              ariaLabel="Tasks by priority" orientation="horizontal" noun="tasks"
              series={[{ key: 'count', label: 'Tasks', color: 'var(--pm-accent)' }]}
              data={PRIORITY_ORDER.map((k) => {
                const s = a.byPriority.find((x) => x.priority === k) ?? { priority: k, count: 0, estimateMinutes: 0 };
                return { key: k, label: PRIORITY_META[k].label, color: PRIORITY_META[k].color, values: { count: s.count }, rows: s.estimateMinutes > 0 ? [{ label: 'Estimate', value: fmtHrs(s.estimateMinutes) }] : [] };
              })}
            />
          )}
        </ChartCard>

        <ChartCard
          className="is-wide" title="Completed vs created" subtitle={`Tasks created and tasks finished per ${week ? 'week' : 'day'}. When the blue line sits above the green one, work is arriving faster than it is done.`}
          loading={loading} error={err} onRetry={retry} empty={empty} busy={busy} fileBase={fileBase} skeletonHeight={220}
          csv={() => [['Date', 'Created', 'Completed', 'Open at end'], ...pts.map((x) => [x.date, x.created, x.completed, x.openAtEnd])]}
        >
          {a && (
            <LineChart
              ariaLabel={`Tasks created and completed per ${week ? 'week' : 'day'}`}
              xs={pts.map((x) => x.date)} xLabel={(i) => dateShort(pts[i].date)} xTitle={title}
              series={[
                { key: 'created', label: 'Created', color: C.created, values: pts.map((x) => x.created), area: true },
                { key: 'completed', label: 'Completed', color: C.completed, values: pts.map((x) => x.completed), area: true },
              ]}
            />
          )}
        </ChartCard>

        <ChartCard
          title="Remaining work vs ideal"
          subtitle={`Open tasks at the end of each ${week ? 'week' : 'day'}${a?.dueOn ? `, against a straight line to zero at the due date (${fmtDate(a.dueOn)})` : ''}.`}
          loading={loading} error={err} onRetry={retry} empty={empty} busy={busy} fileBase={fileBase} skeletonHeight={200}
          csv={() => [['Date', 'Remaining', 'Ideal'], ...pts.map((x, i) => [x.date, x.openAtEnd, a?.idealSeries[i]?.value ?? ''])]}
        >
          {a && (
            <>
              {!a.dueOn && (
                <p className="pm-chartcard__note"><Icon name="info" size={14} /><span>This project has no due date, so there is no ideal line to compare against. Set one in the project settings to see it.</span></p>
              )}
              <LineChart
                ariaLabel="Open tasks remaining compared with the ideal burndown"
                xs={pts.map((x) => x.date)} xLabel={(i) => dateShort(pts[i].date)} xTitle={title}
                format={(n) => fmtNum(Math.round(n * 10) / 10)} integer={false}
                series={[
                  { key: 'remaining', label: 'Remaining', color: C.remaining, values: a.remainingSeries.map((x) => x.value), area: true },
                  ...(a.dueOn ? [{ key: 'ideal', label: 'Ideal', color: C.ideal, values: a.idealSeries.map((x) => x.value), dashed: true }] : []),
                ]}
              />
            </>
          )}
        </ChartCard>

        <ChartCard
          title="Workload by person" subtitle="Open and finished tasks per assignee. A task with several assignees counts for each of them."
          loading={loading} error={err} onRetry={retry} empty={empty} busy={busy} fileBase={fileBase} skeletonHeight={200}
          csv={() => [['Person', 'Open', 'Done', 'Overdue', 'Estimate left (minutes)', 'Time logged (minutes)'], ...(a?.byAssignee ?? []).map((r) => [r.person?.name ?? 'Unassigned', r.open, r.done, r.overdue, r.estimateOpenMinutes, r.loggedMinutes])]}
        >
          {a && (
            <>
              <BarChart
                ariaLabel="Open and done tasks per person" orientation="horizontal" stacked noun="tasks"
                series={[{ key: 'open', label: 'Open', color: C.open }, { key: 'done', label: 'Done', color: C.done }]}
                data={a.byAssignee.map((r) => ({
                  key: r.person?.id ?? 'none', label: r.person?.name ?? 'Unassigned', values: { open: r.open, done: r.done },
                  rows: [
                    { label: 'Estimate left', value: fmtHrs(r.estimateOpenMinutes) },
                    ...(r.overdue > 0 ? [{ label: 'Overdue', value: fmtNum(r.overdue) }] : []),
                    ...(r.loggedMinutes > 0 ? [{ label: 'Time logged', value: fmtDur(r.loggedMinutes) }] : []),
                  ],
                }))}
              />
              {a.byAssignee.reduce((n, r) => n + r.open + r.done, 0) > a.distinctTasks && (
                <p className="pm-faint pm-chart__note">{plural(a.distinctTasks, 'distinct task')} in total; shared tasks appear once per assignee.</p>
              )}
            </>
          )}
        </ChartCard>

        <ChartCard
          title="Overdue tasks" subtitle="Open tasks past their due date, longest overdue first. Click one to open it."
          loading={loading} error={err} onRetry={retry} busy={busy} fileBase={fileBase} png={false} skeletonHeight={180}
          csv={() => [['Task', 'Due', 'Days overdue', 'Priority', 'Assignees'], ...(a?.overdueList ?? []).map((x) => [x.title, x.dueOn, daysLate(x.dueOn), PRIORITY_META[x.priority].label, x.assignees.map((y) => y.name).join('; ')])]}
        >
          {a && a.overdueList.length === 0 && <EmptyState compact icon="checkCircle" title="Nothing is overdue" text="Open tasks in this range are all on time." />}
          {a && a.overdueList.length > 0 && (
            <>
              <ul className="pm-tasklist pm-ovlist">
                {a.overdueList.map((x) => (
                  <li key={x.id}>
                    <button type="button" className="pm-taskrow" onClick={() => openTask(x.id)} {...taskMenuProps(x)}>
                      <span className="pm-dot pm-dot--lg" style={{ background: TASK_STATUS_META[x.status].color }} aria-label={TASK_STATUS_META[x.status].label} />
                      <span className="pm-taskrow__title pm-truncate">{x.title}</span>
                      <PriorityFlag priority={x.priority} showLabel={false} />
                      <AssigneeStack people={x.assignees} max={3} size={20} />
                      <span className="pm-taskrow__due pm-num is-overdue" title={`Due ${fmtDate(x.dueOn)}`}>{plural(daysLate(x.dueOn), 'day')} late</span>
                    </button>
                  </li>
                ))}
              </ul>
              {a.totals.overdue > a.overdueList.length && (
                <p className="pm-faint pm-ovlist__more">Showing the {a.overdueList.length} most overdue of {fmtNum(a.totals.overdue)}. <a href={links.project(p.id, 'list')}>Open the List</a> to see the rest.</p>
              )}
            </>
          )}
        </ChartCard>
      </div>
    </section>
  );
}

function daysLate(due: string | null): number {
  if (!due) return 0;
  return Math.max(1, Math.round((parseYmd(todayYmd()).getTime() - parseYmd(due).getTime()) / 86400000));
}
