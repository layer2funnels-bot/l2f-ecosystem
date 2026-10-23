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
  const dates = [project.start_on, project.due_on, today, ...tasks.map((t) => t.due_on)].filter(Boolean).map((d) => String(d).slice(0, 10)).sort();
  if (!dates.length) return null;
  const from = addDays(dates[0], -2), to = addDays(dates.at(-1), 2); const span = Math.max(1, diffDays(to, from));
  const pct = (d) => Math.max(0, Math.min(100, (100 * diffDays(d, from)) / span));
  const projectBar = project.start_on || project.due_on ? { left: pct(project.start_on ?? project.due_on), width: Math.max(1.5, pct(project.due_on ?? project.start_on) - pct(project.start_on ?? project.due_on)) } : null;
  return { from, to, days: span, today: today ? pct(today) : null, project: projectBar,
    marks: sortTasks(tasks.filter((t) => t.due_on)).map((t) => ({ id: t.id, title: t.title, status: t.status, left: pct(String(t.due_on).slice(0, 10)), overdue: t.status !== 'done' && today && String(t.due_on).slice(0, 10) < today })),
    ticks: Array.from({ length: Math.min(8, span + 1) }, (_, i) => { const d = addDays(from, Math.round((i * span) / Math.min(7, span))); return { date: d, left: pct(d) }; }) };
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
