// Projects screen logic (projectmodel.js): grouping, the client/internal split, calendar grid, timeline, due labels, My Work groups, search text, time formatting.
import { recorder } from './lib.mjs';
import { viewTasks, groupTasks, byStatus, sortTasks, progress, splitProjects, monthGrid, shiftMonth, timeline, dueLabel, myWorkGroups, parseSearch, searchInput, duration, clock, addDays, diffDays, label, TASK_STATUS } from '../apps/web/js/modules/projectmodel.js';

const { results, check } = recorder();
const t = (id, o = {}) => ({ id, title: id, status: 'todo', position: 0, created_at: `2026-10-0${id.length}`, due_on: null, ...o });
const bs = byStatus([t('a', { status: 'doing', position: 2 }), t('b', { status: 'doing', position: 1 }), t('c'), t('d', { status: 'done' })]);
check('PM1', 'Tasks group by status in the board order and sort by position, then age', Object.keys(bs).join() === 'todo,doing,blocked,done' && bs.doing.map((x) => x.id).join() === 'b,a' && bs.blocked.length === 0 && sortTasks([t('x', { position: 1 }), t('y', { position: 1, created_at: '2026-01-01' })]).map((x) => x.id).join() === 'y,x');
check('PM2', 'Progress is the share of finished tasks, zero when there are none', progress({ tasks_total: 4, tasks_done: 1 }) === 25 && progress({ tasks_total: 0, tasks_done: 0 }) === 0 && progress({ tasks_total: 3, tasks_done: 3 }) === 100);
const sp = splitProjects([{ id: 1, name: 'B int', client_id: null }, { id: 2, name: 'A int', client_id: null }, { id: 3, name: 'Zed', client_id: 'c2' }, { id: 4, name: 'Alpha', client_id: 'c1' }, { id: 5, name: 'Beta', client_id: 'c1' }], (c) => ({ c1: 'Acme', c2: 'Zeta' }[c]), 'Aurj');
check('PM3', 'The split lists client projects grouped by client (by client name) and internal projects separately, titled with the organization name, never mixed', sp.clients.map((g) => `${g.name}:${g.projects.map((p) => p.name)}`).join('|') === 'Acme:Alpha,Beta|Zeta:Zed' && sp.internal.map((p) => p.name).join() === 'A int,B int' && sp.internalTitle === 'Aurj projects' && !sp.internal.some((p) => p.client_id) && sp.clients.every((g) => g.projects.every((p) => p.client_id)));
const g = monthGrid(2026, 10, [t('x', { due_on: '2026-10-15' }), t('y', { due_on: '2026-10-15', position: 1 }), t('z', { due_on: '2026-11-02' })], { today: '2026-10-22' });
check('PM4', 'The month grid is whole Monday-first weeks, marks days outside the month and today, and places tasks on their due day', g.every((w) => w.length === 7) && g[0][0].date === '2026-09-28' && g.at(-1)[6].date === '2026-11-01' && g.length === 5 && g.flat().find((d) => d.date === '2026-10-15').tasks.length === 2 && g.flat().find((d) => d.date === '2026-10-22').today && !g[0][0].inMonth && !g.flat().some((d) => d.date === '2026-11-02'));
check('PM5', 'Months roll over the year in both directions', JSON.stringify(shiftMonth(2026, 12, 1)) === '{"year":2027,"month":1}' && JSON.stringify(shiftMonth(2026, 1, -1)) === '{"year":2025,"month":12}' && JSON.stringify(shiftMonth(2026, 10, 14)) === '{"year":2027,"month":12}');
check('PM6', 'February in a leap year has the right length (29 days, five weeks starting on a Monday)', monthGrid(2028, 2, []).flat().filter((d) => d.inMonth).length === 29);
const tl = timeline({ start_on: '2026-10-10', due_on: '2026-10-20' }, [t('a', { due_on: '2026-10-15' }), t('b', { due_on: '2026-10-05', status: 'todo' })], '2026-10-12');
check('PM7', 'The timeline range covers every date with a margin; the project bar, the task markers and the today line sit inside 0 to 100 percent; late open tasks are flagged', tl.from === '2026-10-03' && tl.to === '2026-10-22' && tl.project.left > 0 && tl.project.left + tl.project.width <= 100.01 && tl.marks.every((m) => m.left >= 0 && m.left <= 100) && tl.today > 0 && tl.marks.find((m) => m.id === 'b').overdue === true && tl.marks.find((m) => m.id === 'a').overdue === false);
check('PM8', 'A project with no dates and no tasks has no timeline; a task-only project still has one', timeline({}, [], null) === null && timeline({}, [t('a', { due_on: '2026-10-15' })], '2026-10-12') !== null);
check('PM9', 'Due labels: overdue, today, tomorrow, within the week, then the date, and no date', dueLabel('2026-10-19', '2026-10-22') === 'Overdue 3 days' && dueLabel('2026-10-21', '2026-10-22') === 'Overdue 1 day' && dueLabel('2026-10-22', '2026-10-22') === 'Today' && dueLabel('2026-10-23', '2026-10-22') === 'Tomorrow' && dueLabel('2026-10-26', '2026-10-22') === 'In 4 days' && /Nov/.test(dueLabel('2026-11-10', '2026-10-22')) && dueLabel(null, '2026-10-22') === 'No date');
const mw = myWorkGroups([{ id: 1, due_on: '2026-10-20', status: 'todo' }, { id: 2, due_on: '2026-10-22', status: 'doing' }, { id: 3, due_on: '2026-10-25', status: 'todo' }, { id: 4, due_on: '2026-12-01', status: 'todo' }, { id: 5, due_on: null, status: 'todo' }, { id: 6, due_on: '2026-10-01', status: 'done' }], '2026-10-22');
check('PM10', 'My Work groups: Overdue, Today, This week, Later, No date, Done; empty groups are left out', mw.map(([k, , l]) => `${k}:${l.map((x) => x.id)}`).join('|') === 'overdue:1|today:2|week:3|later:4|none:5|done:6' && myWorkGroups([{ id: 1, due_on: '2026-10-22', status: 'todo' }], '2026-10-22').length === 1);
check('PM11', 'Search text turns filters into options: is:archived, @me, overdue, is:task/project/doc; the rest is the search text', JSON.stringify(parseSearch('launch is:archived')) === '{"q":"launch","kind":"all","archived":true,"mine":false,"overdue":false}' && parseSearch('@me').mine && parseSearch('@me').kind === 'tasks' && parseSearch('overdue emails').q === 'emails' && parseSearch('overdue').kind === 'tasks' && parseSearch('is:doc plan').kind === 'docs' && parseSearch('is:project @me').kind === 'projects');
check('PM12', 'Search input sent to the server leaves out options that are off, and the text is cut at 100 characters', JSON.stringify(searchInput(parseSearch('plan'))) === '{"q":"plan","kind":"all"}' && searchInput(parseSearch('x is:archived @me')).archived === true && parseSearch('a'.repeat(300)).q.length === 100 && parseSearch(null).q === '');
check('PM13', 'Durations: minutes, hours with padded minutes, never negative; the timer clock counts from the server start time', duration(0) === '0m' && duration(59) === '0m' && duration(3725) === '1h 02m' && duration(-5) === '0m' && duration('x') === '0m' && clock('2026-10-22T10:00:00Z', Date.parse('2026-10-22T11:02:05Z')) === '01:02:05' && clock('2026-10-22T10:00:00Z', Date.parse('2026-10-22T09:00:00Z')) === '00:00:00');
check('PM14', 'Date helpers: adding and subtracting days across month ends, labels for unknown keys fall back to the key', addDays('2026-10-31', 1) === '2026-11-01' && diffDays('2026-11-01', '2026-10-31') === 1 && label(TASK_STATUS, 'blocked') === 'Blocked' && label(TASK_STATUS, 'mystery') === 'mystery');
// ---- R2: what the List shows (filter, sort, group), computed in the browser from the tasks already loaded (no extra requests)
const V = [
  t('a', { title: 'Write copy', assignee_id: 'u1', priority: 'high', due_on: '2026-11-03', section_id: 's2', tags: [{ id: 'g1', name: 'SEO' }], position: 2 }),
  t('b', { title: 'Design hero', assignee_id: 'u2', priority: 'urgent', due_on: '2026-11-01', section_id: 's1', tags: [], position: 1 }),
  t('cc', { title: 'Check links', assignee_id: null, priority: 'low', due_on: null, section_id: null, tags: [{ id: 'g1', name: 'SEO' }], position: 3, status: 'done' }),
  t('ddd', { title: 'Copy review', assignee_id: 'u1', priority: 'normal', due_on: '2026-10-20', section_id: 's2', tags: [], position: 0 }),
];
const ids = (xs) => xs.map((x) => x.id).join();
check('PM15', 'Filters combine: words in the title, one person or "nobody", a tag, and hiding finished tasks',
  ids(viewTasks(V, { q: 'copy' })) === 'ddd,a' && ids(viewTasks(V, { assignee: 'u1' })) === 'ddd,a' && ids(viewTasks(V, { assignee: 'none' })) === 'cc'
  && ids(viewTasks(V, { tag: 'g1' })) === 'a,cc' && ids(viewTasks(V, { hideDone: true })) === 'ddd,b,a' && ids(viewTasks(V, { q: 'copy', assignee: 'u2' })) === '');
check('PM16', 'Sorting: by due date (undated last), by priority (urgent first), by title, newest first, or the manual order',
  ids(viewTasks(V, { sort: 'due' })) === 'ddd,b,a,cc' && ids(viewTasks(V, { sort: 'priority' })) === 'b,a,ddd,cc' && ids(viewTasks(V, { sort: 'title' })) === 'cc,ddd,b,a'
  && ids(viewTasks(V, { sort: 'manual' })) === 'ddd,b,a,cc' && ids(viewTasks(V, { sort: 'newest' })) === 'ddd,cc,b,a');
const VS = viewTasks(V);   // groups keep the order the List was sorted in
const bySec = groupTasks(VS, 'section', { sections: [{ id: 's1', name: 'Design' }, { id: 's2', name: 'Build' }] });
const byWho = groupTasks(V, 'assignee', { name: (u) => ({ u1: 'Ana', u2: 'Ben' }[u]) });
const byDue = groupTasks(V, 'due', { today: '2026-11-01' });
check('PM17', 'Grouping: by section in the project\'s order with "No section" last, by person with "Unassigned" last, by priority, and by when it is due',
  bySec.map((g) => `${g.title}:${ids(g.tasks)}`).join('|') === 'Design:b|Build:ddd,a|No section:cc' && bySec[0].key === 's1' && bySec.at(-1).key === null
  && byWho.map((g) => g.title).join() === 'Ana,Ben,Unassigned' && groupTasks(V, 'priority').map((g) => g.title).join() === 'Urgent,High,Normal,Low'
  && byDue.map((g) => `${g.title}:${ids(g.tasks)}`).join('|') === 'Overdue:ddd|Today:b|Next 7 days:a|No date:cc' && groupTasks(V, 'status').map((g) => g.key).join() === 'todo,doing,blocked,done');
// ---- R3: a task with a start date is a bar from start to due on the timeline; one with only a due date stays a mark
const tl3 = timeline({ start_on: '2026-10-01', due_on: '2026-10-31' }, [t('a', { start_on: '2026-10-05', due_on: '2026-10-15' }), t('b', { due_on: '2026-10-20' }), t('c', { start_on: '2026-10-25' })], '2026-10-10');
const ma = tl3.marks.find((m) => m.id === 'a'), mb = tl3.marks.find((m) => m.id === 'b'), mc = tl3.marks.find((m) => m.id === 'c');
check('PM18', 'Timeline: a task with start and due dates is a bar with a width, a due-only task a point, a start-only task a point at its start',
  ma && ma.width > 0 && Math.abs(ma.left + ma.width - (100 * (14 + 2 - 0)) / 34) < 0.01 && mb && !mb.width && mc && !mc.width && Math.abs(mc.left - (100 * 26) / 34) < 0.01);
const long = timeline({}, [t('a', { start_on: '2030-06-10', due_on: '2030-06-15' })], '2026-10-29');
check('PM19', 'A long timeline gets a fixed width per day (so it scrolls instead of squeezing bars to slivers) and a tick every week; a short one fits the screen',
  long.px === long.days * 16 && long.ticks.length > 50 && long.ticks.every((k, n) => n === 0 || k.date > long.ticks[n - 1].date) && tl.px === 640);
for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}`);
const pc = results.filter((x) => x.ok).length; console.log(`\n${pc}/${results.length} checks passed`);
process.exit(pc === results.length ? 0 : 1);
