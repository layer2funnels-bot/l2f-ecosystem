// Projects: the plain logic behind the screens (grouping, calendar grid, timeline geometry, due dates, My Work groups, search text, time formatting).
// No DOM and no clock of its own (today is passed in), so it is tested without a browser. Dates are 'YYYY-MM-DD' strings handled in UTC (no time zone drift).
export const PROJECT_STATUS = [['planned', 'Planned'], ['active', 'Active'], ['on_hold', 'On hold'], ['done', 'Done']];
export const TASK_STATUS = [['todo', 'To do'], ['doing', 'In progress'], ['blocked', 'Blocked'], ['done', 'Done']];
export const PRIORITY = [['urgent', 'Urgent'], ['high', 'High'], ['normal', 'Normal'], ['low', 'Low']];
export const label = (list, key) => (list.find(([k]) => k === key) ?? [key, String(key ?? '')])[1];
const MS = 86400000;
export const day = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d); };
export const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (s, n) => iso(day(s) + n * MS);
export const diffDays = (a, b) => Math.round((day(a) - day(b)) / MS);

/** Tasks of one status, in the order people put them (position, then oldest first). */
export const sortTasks = (tasks) => [...tasks].sort((a, b) => (a.position - b.position) || String(a.created_at).localeCompare(String(b.created_at)));
export const byStatus = (tasks) => Object.fromEntries(TASK_STATUS.map(([k]) => [k, sortTasks(tasks.filter((t) => t.status === k))]));
export const progress = (p) => (p.tasks_total ? Math.round((100 * p.tasks_done) / p.tasks_total) : 0);

/** "Client projects" grouped by client (names from the clients map) and the organization's internal projects, never mixed. */
export function splitProjects(projects, clientName = () => 'Client', orgName = 'Organization') {
  const internal = projects.filter((p) => !p.client_id).sort((a, b) => a.name.localeCompare(b.name));
  const groups = new Map();
  for (const p of projects.filter((x) => x.client_id)) { if (!groups.has(p.client_id)) groups.set(p.client_id, []); groups.get(p.client_id).push(p); }
  const clients = [...groups].map(([client_id, list]) => ({ client_id, name: clientName(client_id), projects: list.sort((a, b) => a.name.localeCompare(b.name)) })).sort((a, b) => a.name.localeCompare(b.name));
  return { clients, internal, internalTitle: `${orgName} projects` };
}

/** Month grid (weeks of 7 days, Monday first by default) with the tasks due on each day. */
export function monthGrid(year, month, tasks = [], { firstDay = 1, today = null } = {}) {
  const first = Date.UTC(year, month - 1, 1); const offset = (new Date(first).getUTCDay() - firstDay + 7) % 7;
  const start = first - offset * MS; const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const weeks = Math.ceil((offset + lastDay) / 7); const by = {};
  for (const t of tasks) if (t.due_on) (by[String(t.due_on).slice(0, 10)] ??= []).push(t);
  return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => { const date = iso(start + (w * 7 + d) * MS); return { date, inMonth: Number(date.slice(5, 7)) === month, today: date === today, tasks: sortTasks(by[date] ?? []) }; }));
}
export const monthTitle = (year, month) => new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' });
export const shiftMonth = (year, month, by) => { const m = month - 1 + by; return { year: year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 + 1 }; };

/** Timeline: the date range to draw and each bar as percentages. Tasks with only a due date draw as a marker on that day. */
export function timeline(project, tasks, today) {
  const dates = [project.start_on, project.due_on, today, ...tasks.flatMap((t) => [t.start_on, t.due_on])].filter(Boolean).map((d) => String(d).slice(0, 10)).sort();
  if (!dates.length) return null;
  const from = addDays(dates[0], -2), to = addDays(dates.at(-1), 2); const span = Math.max(1, diffDays(to, from));
  const pct = (d) => Math.max(0, Math.min(100, (100 * diffDays(d, from)) / span));
  const projectBar = project.start_on || project.due_on ? { left: pct(project.start_on ?? project.due_on), width: Math.max(1.5, pct(project.due_on ?? project.start_on) - pct(project.start_on ?? project.due_on)) } : null;
  return { from, to, days: span, today: today ? pct(today) : null, project: projectBar,
    // a task with a start and a due date is a bar; one with a single date is a point at that date
    marks: sortTasks(tasks.filter((t) => t.due_on || t.start_on)).map((t) => { const s = t.start_on ? String(t.start_on).slice(0, 10) : null, d = t.due_on ? String(t.due_on).slice(0, 10) : null;
      return { id: t.id, title: t.title, status: t.status, left: pct(s ?? d), ...(s && d && d > s ? { width: pct(d) - pct(s) } : {}), overdue: t.status !== 'done' && today && d && d < today }; }),
    // px: the drawing width. 16 px a day, at least a screen (640 px): a long plan scrolls sideways instead of squeezing its bars to slivers
    px: Math.max(640, span * 16),
    ticks: span > 40 ? Array.from({ length: Math.floor(span / 7) + 1 }, (_, i) => { const d = addDays(from, i * 7); return { date: d, left: pct(d) }; })
      : Array.from({ length: Math.min(8, span + 1) }, (_, i) => { const d = addDays(from, Math.round((i * span) / Math.min(7, span))); return { date: d, left: pct(d) }; }) };
}

/** "Overdue 3 days", "Today", "Tomorrow", "In 5 days", then the date. */
export function dueLabel(due, today) {
  if (!due) return 'No date';
  const n = diffDays(String(due).slice(0, 10), today);
  if (n < 0) return `Overdue ${-n} day${n === -1 ? '' : 's'}`;
  if (n === 0) return 'Today'; if (n === 1) return 'Tomorrow'; if (n < 7) return `In ${n} days`;
  return new Date(day(due)).toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}
/** My Work groups: Overdue, Today, This week (next 6 days), Later, No date; Done last. */
export function myWorkGroups(rows, today) {
  const g = { overdue: [], today: [], week: [], later: [], none: [], done: [] };
  for (const r of rows) {
    if (r.status === 'done') { g.done.push(r); continue; }
    if (!r.due_on) { g.none.push(r); continue; }
    const n = diffDays(String(r.due_on).slice(0, 10), today);
    (n < 0 ? g.overdue : n === 0 ? g.today : n < 7 ? g.week : g.later).push(r);
  }
  return [['overdue', 'Overdue', g.overdue], ['today', 'Today', g.today], ['week', 'This week', g.week], ['later', 'Later', g.later], ['none', 'No date', g.none], ['done', 'Done', g.done]].filter(([, , l]) => l.length);
}

/** Search box text to an operation input: "launch is:archived @me overdue is:task". Words that are not filters are the search text. */
export function parseSearch(text) {
  const out = { q: '', kind: 'all', archived: false, mine: false, overdue: false }; const words = [];
  for (const w of String(text ?? '').split(/\s+/).filter(Boolean)) {
    const l = w.toLowerCase();
    if (l === 'is:archived') out.archived = true;
    else if (l === '@me') out.mine = true;
    else if (l === 'overdue' || l === 'is:overdue') out.overdue = true;
    else if (['is:project', 'is:projects'].includes(l)) out.kind = 'projects';
    else if (['is:task', 'is:tasks'].includes(l)) out.kind = 'tasks';
    else if (['is:doc', 'is:docs'].includes(l)) out.kind = 'docs';
    else words.push(w);
  }
  out.q = words.join(' ').slice(0, 100);
  if (out.mine || out.overdue) out.kind = out.kind === 'all' ? 'tasks' : out.kind;
  return out;
}
export const searchInput = (parsed) => ({ ...(parsed.q ? { q: parsed.q } : {}), kind: parsed.kind, ...(parsed.archived ? { archived: true } : {}), ...(parsed.mine ? { mine: true } : {}), ...(parsed.overdue ? { overdue: true } : {}) });

/** 3725 seconds -> "1h 02m"; under a minute -> "0m". */
export function duration(seconds) { const s = Math.max(0, Math.floor(Number(seconds) || 0)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`; }
/** Running timer clock "01:02:05" from the server's start time and the moment to show. */
export function clock(startedAt, nowMs) { const s = Math.max(0, Math.floor((nowMs - new Date(startedAt).getTime()) / 1000)); return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':'); }

// ---- R2: what the List shows. Computed in the browser from the tasks already loaded, so filtering, sorting and grouping cost no requests.
const PRIO_RANK = { urgent: 0, high: 1, normal: 2, low: 3 };
const SORTS = {
  manual: () => 0,
  due: (a, b) => (a.due_on ? 0 : 1) - (b.due_on ? 0 : 1) || String(a.due_on ?? '').localeCompare(String(b.due_on ?? '')),
  priority: (a, b) => (PRIO_RANK[a.priority] ?? 9) - (PRIO_RANK[b.priority] ?? 9),
  title: (a, b) => String(a.title).localeCompare(String(b.title), undefined, { sensitivity: 'base' }),
  newest: (a, b) => String(b.created_at).localeCompare(String(a.created_at)),
};
/** filter: { q, assignee ('none' = nobody), tag, hideDone }, sort: manual | due | priority | title | newest (ties keep the manual order) */
export function viewTasks(tasks, { q = '', assignee = '', tag = '', hideDone = false, sort = 'manual' } = {}) {
  const words = String(q).toLowerCase().split(/\s+/).filter(Boolean);
  const kept = tasks.filter((t) => (!words.length || words.every((w) => String(t.title).toLowerCase().includes(w)))
    && (!assignee || (assignee === 'none' ? !t.assignee_id : t.assignee_id === assignee))
    && (!tag || (t.tags ?? []).some((g) => g.id === tag))
    && (!hideDone || t.status !== 'done'));
  const cmp = SORTS[sort] ?? SORTS.manual;
  return sortTasks(kept).sort(cmp);      // sort is stable: equal keys keep the manual order
}
/** by: status | section | assignee | priority | due. Returns [{ key, title, tasks }] in a fixed, meaningful order. */
export function groupTasks(tasks, by, { sections = [], name = (id) => id, today = null } = {}) {
  const pick = (key, title, test) => ({ key, title, tasks: tasks.filter(test) });   // the caller passes tasks already in the order it wants (viewTasks)
  if (by === 'section') {
    const known = new Set(sections.map((s) => s.id));
    return [...sections.map((s) => pick(s.id, s.name, (t) => t.section_id === s.id)), pick(null, 'No section', (t) => !t.section_id || !known.has(t.section_id))];
  }
  if (by === 'assignee') {
    const who = [...new Set(tasks.map((t) => t.assignee_id).filter(Boolean))].sort((a, b) => String(name(a)).localeCompare(String(name(b))));
    const groups = who.map((u) => pick(u, name(u), (t) => t.assignee_id === u));
    return tasks.some((t) => !t.assignee_id) ? [...groups, pick(null, 'Unassigned', (t) => !t.assignee_id)] : groups;
  }
  if (by === 'priority') return PRIORITY.map(([k, title]) => pick(k, title, (t) => t.priority === k));
  if (by === 'due') {
    const soon = today ? addDays(today, 7) : null;
    const when = (t) => (!t.due_on ? 'none' : t.due_on.slice(0, 10) < today ? (t.status === 'done' ? 'earlier' : 'overdue') : t.due_on.slice(0, 10) === today ? 'today' : t.due_on.slice(0, 10) <= soon ? 'week' : 'later');
    return [['overdue', 'Overdue'], ['today', 'Today'], ['week', 'Next 7 days'], ['later', 'Later'], ['earlier', 'Earlier'], ['none', 'No date']]
      .map(([k, title]) => pick(k, title, (t) => when(t) === k)).filter((g) => g.tasks.length);
  }
  return TASK_STATUS.map(([k, title]) => pick(k, title, (t) => t.status === k));
}

// ---- R4: workload grid. Weeks start on Monday; a week over 40 estimated hours is flagged as more than one person can do.
export const weekStart = (iso) => { const dow = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`).getUTCDay(); return addDays(iso, -((dow + 6) % 7)); };
export const WEEK_CAPACITY_MINUTES = 40 * 60;
export function workloadGrid(rows, from, weeks) {
  const first = weekStart(from);
  const ws = Array.from({ length: weeks }, (_, i) => addDays(first, i * 7));
  const people = new Map();
  for (const r of rows) {
    if (!people.has(r.user_id)) people.set(r.user_id, { user_id: r.user_id, name: r.name, cells: ws.map((week) => ({ week, tasks: 0, minutes: 0, overdue: 0, over: false })), undated: 0 });
    const p = people.get(r.user_id);
    if (r.week_start == null) { p.undated += r.tasks; continue; }
    const c = p.cells.find((x) => x.week === String(r.week_start).slice(0, 10)); if (!c) continue;
    c.tasks += r.tasks; c.minutes += r.minutes; c.overdue += r.overdue; c.over = c.minutes > WEEK_CAPACITY_MINUTES;
  }
  const list = [...people.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return { weeks: ws, people: list, max: Math.max(0, ...list.flatMap((p) => p.cells.map((c) => c.minutes))) };
}
