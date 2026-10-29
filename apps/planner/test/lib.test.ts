import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Goal, FocusArea, GoalType, Member } from '../src/api/types.ts';
import { expectedProgress, scheduleState, daysBetween, reviewState, barGeometry, nextUpdateDue } from '../src/lib/schedule.ts';
import { buildTree, flatten, descendantIds, ancestors, moveProblem, filterGoals, emptyFilters, sortGoals, groupGoals, summarise, activeFilterCount } from '../src/lib/tree.ts';
import { toCsv, parseCsv, goalsToCsv, parseGoalImport } from '../src/lib/csv.ts';
import { formatNumber, initials, relativeDay, plural } from '../src/lib/format.ts';
import { horizonsAround, currentQuarter, inPeriod } from '../src/lib/horizons.ts';

let n = 0;
const goal = (o: Partial<Goal> & { id: string }): Goal => ({
  workspace_id: 'w', plan_id: 'p', focus_area_id: 'f1', parent_goal_id: null, goal_type_id: 't1', title: o.id, description: null, owner_id: null, status: 'on_track', progress: 0,
  progress_mode: 'manual', priority: 'medium', weight: 1, start_date: null, due_date: null, position: n++, project_id: null, value_id: null, tags: [],
  completed_at: null, archived_at: null, last_update_at: null, update_cadence: 'none', created_at: `2026-01-01T00:00:0${n % 10}Z`, updated_at: '2026-01-01T00:00:00Z', owner_name: null,
  type_name: 'Objective', uses_measure: false, child_count: 0, open_actions: 0, total_actions: 0, open_risks: 0, max_risk: null, measure: null, project: null,
  project_restricted: false, ...o,
});
const FA: FocusArea[] = [{ id: 'f1', plan_id: 'p', name: 'Grow', description: null, color: 'coral', position: 0, start_date: null, end_date: null, archived_at: null }, { id: 'f2', plan_id: 'p', name: 'Run', description: null, color: 'slate', position: 1, start_date: null, end_date: null, archived_at: null }];
const TYPES: GoalType[] = [{ id: 't1', name: 'Objective', uses_measure: false, position: 0 }, { id: 't2', name: 'KPI', uses_measure: true, position: 1 }];
const MEMBERS: Member[] = [{ user_id: 'u1', name: 'Edith Editor', role: 'editor' }, { user_id: 'u2', name: 'Adam Admin', role: 'admin' }];

test('expected progress is linear between start and due', () => {
  assert.equal(expectedProgress({ start_date: '2026-01-01', due_date: '2026-01-11' }, '2026-01-06'), 50);
  assert.equal(expectedProgress({ start_date: '2026-01-01', due_date: '2026-01-11' }, '2025-12-01'), 0);
  assert.equal(expectedProgress({ start_date: '2026-01-01', due_date: '2026-01-11' }, '2026-03-01'), 100);
  assert.equal(expectedProgress({ start_date: null, due_date: '2026-01-11' }, '2026-01-06'), null);
});

test('schedule state: overdue, behind, on pace, ahead, completed, later, no dates', () => {
  const g = { start_date: '2026-01-01', due_date: '2026-01-11', progress: 50, status: 'on_track' as const };
  assert.equal(scheduleState(g, '2026-01-06'), 'on_pace');
  assert.equal(scheduleState({ ...g, progress: 20 }, '2026-01-06'), 'behind');
  assert.equal(scheduleState({ ...g, progress: 90 }, '2026-01-06'), 'ahead');
  assert.equal(scheduleState(g, '2026-02-01'), 'overdue');
  assert.equal(scheduleState({ ...g, status: 'completed' }, '2026-02-01'), 'completed');
  assert.equal(scheduleState(g, '2025-12-01'), 'not_started');
  assert.equal(scheduleState({ ...g, start_date: null, due_date: null }, '2026-01-06'), 'no_dates');
});

test('dates and review states', () => {
  assert.equal(daysBetween('2026-01-01', '2026-03-01'), 59);
  assert.equal(reviewState('2026-01-01', '2026-01-02'), 'overdue');
  assert.equal(reviewState('2026-01-05', '2026-01-02'), 'due_soon');
  assert.equal(reviewState('2026-02-05', '2026-01-02'), 'upcoming');
  const b = barGeometry('2026-01-11', '2026-01-20', '2026-01-01', '2026-01-31')!;
  assert.ok(b.left > 30 && b.left < 35 && b.width > 25 && b.width < 35);
  assert.equal(barGeometry(null, null, '2026-01-01', '2026-01-31'), null);
});

test('tree: builds, nests, flattens and respects collapse', () => {
  const goals = [goal({ id: 'a' }), goal({ id: 'b', parent_goal_id: 'a' }), goal({ id: 'c', parent_goal_id: 'b' }), goal({ id: 'd' })];
  const tree = buildTree(goals);
  assert.deepEqual(tree.map((t) => t.goal.id), ['a', 'd']);
  assert.deepEqual(flatten(tree).map((x) => `${x.goal.id}:${x.depth}`), ['a:0', 'b:1', 'c:2', 'd:0']);
  assert.deepEqual(flatten(tree, new Set(['a'])).map((x) => x.goal.id), ['a', 'd']);
  assert.deepEqual([...descendantIds(goals, 'a')].sort(), ['b', 'c']);
  assert.deepEqual(ancestors(goals, 'c').map((g) => g.id), ['a', 'b']);
});

test('tree: a goal whose parent is filtered out becomes top-level', () => {
  const goals = [goal({ id: 'b', parent_goal_id: 'gone' })];
  assert.equal(buildTree(goals).length, 1);
});

test('move rules: no self, no descendant, depth limit', () => {
  const goals = [goal({ id: 'a' }), goal({ id: 'b', parent_goal_id: 'a' }), goal({ id: 'c', parent_goal_id: 'b' })];
  assert.equal(moveProblem(goals, 'a', 'a'), 'A goal cannot sit under itself.');
  assert.match(moveProblem(goals, 'a', 'c')!, /own sub-goals/);
  assert.equal(moveProblem(goals, 'c', null), null);
  assert.equal(moveProblem(goals, 'c', 'a'), null);
  const chain = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6'].map((id, i, arr) => goal({ id, parent_goal_id: i ? arr[i - 1]! : null }));
  assert.match(moveProblem([...chain, goal({ id: 'x' })], 'x', 'g6')!, /limited to 5 levels/);
});

test('filters keep the path to a match and count active filters', () => {
  const goals = [goal({ id: 'a', title: 'Revenue' }), goal({ id: 'b', parent_goal_id: 'a', title: 'Referral', owner_id: 'u1', owner_name: 'Edith Editor' }), goal({ id: 'c', title: 'Other' })];
  const f = { ...emptyFilters(), query: 'referral' };
  assert.deepEqual(filterGoals(goals, f, '2026-01-01').map((g) => g.id), ['a', 'b']);
  assert.equal(activeFilterCount(f), 1);
  assert.deepEqual(filterGoals(goals, { ...emptyFilters(), owners: ['u1'] }, '2026-01-01').map((g) => g.id), ['a', 'b']);
  assert.deepEqual(filterGoals([...goals, goal({ id: 'z', archived_at: '2026-01-01T00:00:00Z' })], emptyFilters(), '2026-01-01').map((g) => g.id), ['a', 'b', 'c']);
  assert.equal(filterGoals([goal({ id: 'z', archived_at: '2026-01-01T00:00:00Z' })], { ...emptyFilters(), showArchived: true }, '2026-01-01').length, 1);
  assert.deepEqual(filterGoals([goal({ id: 'o', due_date: '2025-01-01' }), goal({ id: 'p', due_date: '2099-01-01' })], { ...emptyFilters(), overdueOnly: true }, '2026-01-01').map((g) => g.id), ['o']);
  assert.deepEqual(filterGoals([goal({ id: 'r', open_risks: 2 }), goal({ id: 's' })], { ...emptyFilters(), withRisks: true }, '2026-01-01').map((g) => g.id), ['r']);
  assert.equal(filterGoals([goal({ id: 'x', last_update_at: '2025-11-01T00:00:00Z' }), goal({ id: 'y', last_update_at: '2025-12-30T00:00:00Z' })], { ...emptyFilters(), staleDays: 30 }, '2026-01-01').map((g) => g.id).join(), 'x');
});

test('sorting: by due date (missing last), progress, priority, title, owner', () => {
  const goals = [goal({ id: 'a', title: 'Zed', due_date: '2026-05-01', progress: 10, priority: 'low', owner_name: 'Bea' }), goal({ id: 'b', title: 'Alpha', due_date: null, progress: 90, priority: 'critical', owner_name: null }), goal({ id: 'c', title: 'Mid', due_date: '2026-02-01', progress: 50, priority: 'high', owner_name: 'Al' })];
  assert.deepEqual(sortGoals(goals, 'due').map((g) => g.id), ['c', 'a', 'b']);
  assert.deepEqual(sortGoals(goals, 'progress', 'desc').map((g) => g.id), ['b', 'c', 'a']);
  assert.deepEqual(sortGoals(goals, 'priority').map((g) => g.id), ['b', 'c', 'a']);
  assert.deepEqual(sortGoals(goals, 'title').map((g) => g.id), ['b', 'c', 'a']);
  assert.deepEqual(sortGoals(goals, 'owner').map((g) => g.id), ['c', 'a', 'b']);
});

test('grouping by focus area keeps focus-area order; children are not grouped separately', () => {
  const goals = [goal({ id: 'a', focus_area_id: 'f2' }), goal({ id: 'b', focus_area_id: 'f1' }), goal({ id: 'c', focus_area_id: 'f1', parent_goal_id: 'b' })];
  const groups = groupGoals(goals, 'focus', { focusAreas: FA, values: [], typeNames: { t1: 'Objective' } });
  assert.deepEqual(groups.map((g) => `${g.label}:${g.goals.length}`), ['Grow:1', 'Run:1']);
  assert.equal(groupGoals(goals, 'none', { focusAreas: FA, values: [], typeNames: {} })[0]!.goals.length, 2);
  assert.equal(groupGoals(goals, 'owner', { focusAreas: FA, values: [], typeNames: {} })[0]!.label, 'No owner');
});

test('summary counts exclude archived goals', () => {
  const s = summarise([goal({ id: 'a', status: 'at_risk', due_date: '2020-01-01' }), goal({ id: 'b', status: 'completed' }), goal({ id: 'c', archived_at: 'x' }), goal({ id: 'd', owner_id: 'u', open_risks: 1 })], '2026-01-01');
  assert.equal(s.total, 3); assert.equal(s.overdue, 1); assert.equal(s.byStatus.at_risk, 1); assert.equal(s.unowned, 2); assert.equal(s.withRisks, 1);
});

test('csv: quoting, newlines and formula-injection guard round-trip', () => {
  const text = toCsv([['a', 'b,c', 'line\nbreak', 'say "hi"', '=HYPERLINK("x")', '+1', null]]);
  const back = parseCsv(text)[0]!;
  assert.equal(back[1], 'b,c'); assert.equal(back[2], 'line\nbreak'); assert.equal(back[3], 'say "hi"');
  assert.equal(back[4]!.startsWith("'="), true); assert.equal(back[5], "'+1"); assert.equal(back[6], '');
  assert.deepEqual(parseCsv('﻿x,y\r\n1,2\r\n\r\n'), [['x', 'y'], ['1', '2']]);
});

test('csv import: validates every row and resolves names', () => {
  const ctx = { focusAreas: FA, types: TYPES, members: MEMBERS };
  const good = 'Title,Type,Focus area,Owner,Status,Priority,Progress %,Weight,Start,Due,Tags\n"Win clients",KPI,Grow,Edith Editor,At risk,High,40,3,2026-01-01,2026-06-30,sales; q2\n';
  const r = parseGoalImport(good, ctx);
  assert.equal(r.fatal, null); assert.equal(r.rows[0]!.ok, true);
  assert.deepEqual(r.rows[0]!.data!.tags, ['sales', 'q2']); assert.equal(r.rows[0]!.data!.owner_id, 'u1'); assert.equal(r.rows[0]!.data!.status, 'at_risk');
  const bad = parseGoalImport('Title,Focus area,Owner,Status,Progress %,Weight,Start,Due\n,Nowhere,Nobody,wrong,150,0,2026-13-45,2026-01-01\n', ctx);
  assert.equal(bad.rows[0]!.ok, false); assert.ok(bad.rows[0]!.problems.length >= 6, bad.rows[0]!.problems.join('|'));
  assert.match(parseGoalImport('Name\nx', ctx).fatal!, /Title/);
  assert.match(parseGoalImport('Title\n', ctx).fatal!, /no rows/);
});

test('csv export then import is lossless for valid goals', () => {
  const goals = [goal({ id: 'a', title: 'Reach "40" clients, fast', owner_id: 'u1', owner_name: 'Edith Editor', status: 'at_risk', priority: 'high', progress: 40, weight: 3, start_date: '2026-01-01', due_date: '2026-06-30', tags: ['x', 'y'], description: 'line1\nline2' })];
  const csv = goalsToCsv(goals, { focusAreas: FA, typeNames: { t1: 'Objective' } });
  const r = parseGoalImport(csv, { focusAreas: FA, types: TYPES, members: MEMBERS });
  assert.equal(r.rows[0]!.ok, true, r.rows[0]!.problems.join('|'));
  assert.equal(r.rows[0]!.data!.title, 'Reach "40" clients, fast'); assert.equal(r.rows[0]!.data!.description, 'line1\nline2'); assert.equal(r.rows[0]!.data!.weight, 3);
});

test('formatting helpers', () => {
  assert.equal(formatNumber(47500, '$'), '$47.5k'); assert.equal(formatNumber(1_250_000), '1.25M'); assert.equal(formatNumber(36, '%'), '36%'); assert.equal(formatNumber(null), '—');
  assert.equal(formatNumber(4.55), '4.55'); assert.equal(formatNumber(12, 'days'), '12 days');
  assert.equal(initials('Olive Owner'), 'OO'); assert.equal(initials(null), '?');
  assert.equal(relativeDay('2026-01-02', '2026-01-01'), 'Tomorrow'); assert.equal(relativeDay('2025-12-30', '2026-01-01'), '2 days ago');
  assert.equal(plural(1, 'goal'), '1 goal'); assert.equal(plural(3, 'goal'), '3 goals');
});

test('horizons: quarters and years around today', () => {
  const hs = horizonsAround('2026-10-28');
  assert.equal(hs.length, 15);
  const q4 = hs.find((h) => h.label === 'Q4 2026')!; assert.equal(q4.start, '2026-10-01'); assert.equal(q4.end, '2026-12-31');
  assert.equal(hs.find((h) => h.label === 'Q1 2027')!.end, '2027-03-31'); assert.equal(hs.find((h) => h.label === 'Q2 2026')!.end, '2026-06-30');
  assert.equal(hs.find((h) => h.label === 'Year 2027')!.start, '2027-01-01');
  assert.equal(currentQuarter('2026-10-28').label, 'Q4 2026'); assert.equal(currentQuarter('2026-01-01').label, 'Q1 2026');
});

test('period filter: overlap rule, undated goals stay, hide completed', () => {
  const p = { start: '2026-10-01', end: '2026-12-31' };
  assert.equal(inPeriod({ start_date: '2026-01-01', due_date: '2026-09-30' }, p), false);
  assert.equal(inPeriod({ start_date: '2026-09-01', due_date: '2026-10-01' }, p), true);
  assert.equal(inPeriod({ start_date: '2026-12-31', due_date: '2027-03-01' }, p), true);
  assert.equal(inPeriod({ start_date: null, due_date: null }, p), true);
  assert.equal(inPeriod({ start_date: '2020-01-01', due_date: '2020-02-01' }, null), true);
  const goals = [goal({ id: 'a', start_date: '2026-11-01', due_date: '2026-11-30' }), goal({ id: 'b', start_date: '2025-01-01', due_date: '2025-02-01' }), goal({ id: 'c', status: 'completed', start_date: '2026-11-01', due_date: '2026-11-30' })];
  assert.deepEqual(filterGoals(goals, { ...emptyFilters(), period: p }, '2026-10-28').map((g) => g.id), ['a', 'c']);
  assert.deepEqual(filterGoals(goals, { ...emptyFilters(), period: p, hideCompleted: true }, '2026-10-28').map((g) => g.id), ['a']);
  assert.equal(activeFilterCount({ ...emptyFilters(), period: p, hideCompleted: true }), 2);
});
test('nextUpdateDue counts from the last update, or creation, by cadence', () => {
  const base = { created_at: '2026-01-01T00:00:00Z', last_update_at: null };
  assert.equal(nextUpdateDue({ ...base, update_cadence: 'none' }), null);
  assert.equal(nextUpdateDue({ ...base, update_cadence: 'weekly' }), '2026-01-08');
  assert.equal(nextUpdateDue({ ...base, update_cadence: 'monthly', last_update_at: '2026-02-10T09:00:00Z' }), '2026-03-12');
});
test('conversion proposals skip tasks that exist, ignore blanks, and honour what the person switched off', async () => {
  const { proposeFor, tasksToCreate, convertible } = await import('../src/lib/conversion.ts');
  const g = goal({ id: 'g1', title: 'Win clients', owner_id: 'u1', measure: { id: 'm', name: 'MRR', unit: '$', current: 0, target: 100, start: 0, direction: 'increase' } });
  const p = proposeFor(g, [{ title: 'plan the first steps for Win clients', status: 'todo' }]);
  assert.equal(p.tasks.length, 2);
  assert.equal(p.tasks.filter((t) => t.skip === 'exists').length, 1);
  assert.deepEqual(tasksToCreate({}, new Set(), p).map((t) => t.title), ['Record the first reading for MRR']);
  assert.deepEqual(tasksToCreate({}, new Set([p.tasks[0]!.key]), p), []);
  assert.deepEqual(tasksToCreate({ [p.tasks[0]!.key]: '   ' }, new Set(), p), []);
  assert.deepEqual(tasksToCreate({ [p.tasks[0]!.key]: 'Plan the first steps for Win clients' }, new Set(), p), []);   // edited into an existing title
  assert.equal(convertible([g, goal({ id: 'g2', child_count: 2 }), goal({ id: 'g3', status: 'completed' })]).length, 1);
});
