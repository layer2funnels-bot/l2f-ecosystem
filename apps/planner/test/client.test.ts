// Application-level test: the real PlannerClient, the real migrations and the real demo seed on PostgreSQL 17 (PGlite),
// acting as different people. It proves the seed loads, the client returns the shapes the screens rely on, errors are
// reported in plain words, and an organization boundary holds through the whole client path.
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { makeBackend } from '../src/api/localBackend.ts';
import { PlannerClient } from '../src/api/client.ts';
import { PlannerError } from '../src/api/types.ts';
import { DEMO_IDS as I, seedDemo } from '../src/api/demoSeed.ts';
import { scheduleState, todayIso } from '../src/lib/schedule.ts';

let db: PGlite;
const as = (id: string) => new PlannerClient(makeBackend(db, id));
const err = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return e as PlannerError; } };

before(async () => {
  db = new PGlite();
  const dir = new URL('../../../migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((x) => /^\d{4}_.+\.sql$/.test(x)).sort()) await db.exec(readFileSync(new URL(f, dir), 'utf8'));
  await seedDemo(db);
});
after(async () => { await db.close(); });

test('the demo seed builds two isolated organizations', async () => {
  const olive = as(I.OLIVE);
  assert.deepEqual((await olive.workspaces()).map((w) => w.slug).sort(), ['aurj', 'layer2funnels']);
  assert.deepEqual((await as(I.EDITH).workspaces()).map((w) => w.slug), ['layer2funnels']);
  assert.equal((await olive.plans(I.L2F)).length, 2);
  assert.equal((await olive.plans(I.AURJ)).length, 3);
  assert.equal((await olive.plans(I.AURJ)).filter((p) => p.parent_plan_id).length, 2);   // two plans aligned under the Aurj growth plan
});

test('permissions as the screens see them (can)', async () => {
  const can = (id: string, ws: string) => as(id).access(ws);
  const owner = await can(I.OLIVE, I.L2F), admin = await can(I.ADAM, I.L2F), ed = await can(I.EDITH, I.L2F), vw = await can(I.VERA, I.L2F), none = await can(I.NOAH, I.L2F);
  assert.equal(owner['goal.delete'], true); assert.equal(admin['goal.delete'], false); assert.equal(admin['plan.manage'], true);
  assert.equal(ed['goal.edit'], true); assert.equal(ed['plan.manage'], false);
  assert.equal(vw['plan.view'], true); assert.equal(vw['goal.create'], false); assert.equal(vw['update.post'], false);
  assert.ok(Object.values(none).every((v) => v === false));
  assert.deepEqual(await as(I.NOAH).plans(I.L2F), []);
});

test('plan detail carries everything a screen needs, with names resolved', async () => {
  const [plan] = (await as(I.ADAM).plans(I.L2F)).filter((p) => p.name.startsWith('Layer2Funnels Strategy'));
  assert.ok(plan); assert.ok(plan.favorite === false); assert.ok(plan.goal_count >= 15); assert.ok(plan.overdue_reviews >= 1);
  const d = (await as(I.ADAM).plan(plan.id))!;
  assert.equal(d.focus_areas.length, 4); assert.equal(d.values.length, 3); assert.deepEqual(d.goal_types.map((t) => t.name), ['Objective', 'Initiative']);   // KPIs are measures, not kinds
  assert.ok(d.plan.vision!.length > 10);
  const mrr = d.goals.find((g) => g.title.startsWith('Reach $60k'))!;
  assert.equal(mrr.owner_name, 'Edith Editor'); assert.equal(mrr.progress_mode, 'measure'); assert.equal(mrr.measure!.unit, '$'); assert.equal(Number(mrr.measure!.current), 47500);
  assert.equal(Math.round(Number(mrr.progress)), 43);   // (47500-38000)/(60000-38000)
  assert.ok(d.reviews.some((r) => r.status === 'held') && d.reviews.some((r) => r.status === 'scheduled'));
});

test('derived progress in the seed is consistent (parents equal the weighted average of children)', async () => {
  const plan = (await as(I.ADAM).plans(I.L2F)).find((p) => p.name.startsWith('Layer2Funnels Strategy'))!;
  const goals = (await as(I.ADAM).plan(plan.id))!.goals;
  for (const g of goals.filter((x) => x.progress_mode === 'children')) {
    const kids = goals.filter((c) => c.parent_goal_id === g.id && !c.archived_at);
    const expected = kids.reduce((s, c) => s + Number(c.progress) * c.weight, 0) / kids.reduce((s, c) => s + c.weight, 0);
    assert.ok(Math.abs(Number(g.progress) - expected) < 0.05, `${g.title}: ${g.progress} vs ${expected}`);
  }
  const overdue = goals.filter((g) => scheduleState(g, todayIso()) === 'overdue');
  assert.ok(overdue.some((g) => g.title.startsWith('Document the ten core SOPs')));
});

test('the project link is a reference that respects project access', async () => {
  const plan = (await as(I.ADAM).plans(I.L2F)).find((p) => p.name.startsWith('Layer2Funnels Strategy'))!;
  const link = (id: string) => as(id).plan(plan.id).then((d) => d!.goals.find((g) => g.title === 'Launch the referral programme')!);
  const forAdmin = await link(I.ADAM), forEdith = await link(I.EDITH);
  assert.equal(forAdmin.project?.name, 'Funnel rebuild · Acme');
  assert.equal(forEdith.project, null); assert.equal(forEdith.project_restricted, true);
});

test('a full working loop through the client as an editor', async () => {
  const ed = as(I.EDITH);
  const plan = (await ed.plans(I.L2F)).find((p) => p.name.startsWith('Q4 delivery'))!;
  const d = (await ed.plan(plan.id))!;
  const fa = d.focus_areas[0]!;
  const g = await ed.saveGoal(plan.id, null, { title: 'Reduce rework', focus_area_id: fa.id, owner_id: I.EDITH, due_date: '2099-01-01' });
  const sub = await ed.saveGoal(plan.id, null, { title: 'Checklist the handoff', parent_goal_id: g.id, progress: 40 });
  assert.equal(sub.focus_area_id, fa.id);
  await ed.saveGoal(plan.id, g.id, { progress_mode: 'children' });
  assert.equal(Number((await ed.goal(g.id))!.goal.progress), 40);
  await ed.postUpdate(g.id, { status: 'at_risk', summary: 'Waiting on the account team', confidence: 'low' });
  const act = await ed.saveAction(g.id, null, { title: 'Draft the checklist', assignee_id: I.EDITH });
  await ed.saveAction(g.id, act.id, { status: 'done' });
  const risk = await ed.saveRisk(g.id, null, { title: 'Team capacity', likelihood: 2, impact: 4 });
  assert.equal(risk.severity, 8);
  await ed.addComment(g.id, 'Kick-off done');
  const detail = (await ed.goal(g.id))!;
  assert.equal(detail.goal.status, 'at_risk'); assert.equal(detail.actions[0]!.completed_at !== null, true); assert.equal(detail.comments.length, 1);
  assert.ok(detail.history.some((h) => h.entity === 'updates') && detail.history.some((h) => h.action === 'created'));
  assert.deepEqual(detail.breadcrumb, []); assert.equal(detail.children.length, 1);
  assert.equal((await ed.setGoalArchived(g.id, true)).archived_at !== null, true);
  assert.equal((await ed.setGoalArchived(g.id, false)).archived_at, null);
});

test('errors reach the screens in plain words, never database text', async () => {
  const ed = as(I.EDITH), vw = as(I.VERA);
  const plan = (await ed.plans(I.L2F)).find((p) => p.name.startsWith('Layer2Funnels Strategy'))!;
  const d = (await ed.plan(plan.id))!;
  const fa = d.focus_areas[0]!;
  const denied = await err(vw.saveGoal(plan.id, null, { title: 'x', focus_area_id: fa.id }));
  assert.equal(denied?.code, 'not_found'); assert.equal(denied?.message, 'Not found.');
  const blank = await err(ed.saveGoal(plan.id, null, { title: '  ', focus_area_id: fa.id }));
  assert.equal(blank?.code, 'invalid'); assert.equal(blank?.message, 'Some details need fixing.');
  const top = d.goals.find((g) => g.title === 'Win 12 new retainer clients')!, leaf = d.goals.find((g) => g.title === 'Draft referral offer') ?? d.goals.find((g) => g.parent_goal_id === top.id)!;
  const cycle = await err(ed.moveGoal(top.id, fa.id, leaf.id, []));
  assert.equal(cycle?.code, 'invalid'); assert.match(cycle!.message, /aligned under itself|cannot|limited/i);
  for (const e of [denied, blank, cycle]) assert.doesNotMatch(String(e!.message), /violates|constraint|relation|column|permission denied|policy|42501|23514/i);
  const stale = await err(ed.saveGoal(plan.id, top.id, { description: 'x' }, '2000-01-01T00:00:00Z'));
  assert.equal(stale?.code, 'conflict');
  const proj = await err(ed.saveGoal(plan.id, top.id, { owner_id: I.ARIA }));
  assert.equal(proj?.code, 'not_found');   // a person from another organization: reported like a missing record
});

test('organization boundary holds through the whole client path', async () => {
  const l2f = (await as(I.ADAM).plans(I.L2F))[0]!;
  const aria = as(I.ARIA);
  assert.equal(await aria.plan(l2f.id), null);
  assert.deepEqual(await aria.plans(I.L2F), []);
  assert.deepEqual(await aria.search(I.L2F, 'referral'), []);
  const goalId = (await as(I.ADAM).plan(l2f.id))!.goals[0]!.id;
  assert.equal(await aria.goal(goalId), null);
  assert.equal((await err(aria.postUpdate(goalId, { status: 'on_track', summary: 'x' })))?.code, 'not_found');
  assert.equal((await err(aria.setGoalArchived(goalId, true)))?.code, 'not_found');
  assert.equal((await err(aria.savePlan(I.L2F, null, { name: 'Intrusion' })))?.code, 'not_found');
  const mine = await as(I.OLIVE).plans(I.AURJ);
  assert.ok(mine.every((p) => !/Layer2Funnels|Q4 delivery/.test(p.name)) && mine.some((p) => p.name.startsWith('Aurj')));
  assert.equal((await as(I.OLIVE).myWork(I.AURJ)).goals.every((g) => g.plan_name?.startsWith('Aurj')), true);
});

test('switching organization changes the active workspace only for members', async () => {
  const olive = as(I.OLIVE);
  await olive.setActiveWorkspace(I.AURJ);
  const row = (await db.query<{ active_workspace_id: string }>('select active_workspace_id from profiles where id = $1', [I.OLIVE])).rows[0]!;
  assert.equal(row.active_workspace_id, I.AURJ);
  await assert.rejects(() => as(I.EDITH).setActiveWorkspace(I.AURJ));
});

test('holding a review freezes a snapshot and cannot be repeated', async () => {
  const adam = as(I.ADAM);
  const plan = (await adam.plans(I.L2F)).find((p) => p.name.startsWith('Layer2Funnels Strategy'))!;
  const rv = await adam.saveReview(plan.id, null, { title: 'Test review', due_on: '2099-02-01' });
  const held = await adam.holdReview(rv.id, 'All good', 'Keep going');
  assert.equal(held.status, 'held'); assert.ok(held.snapshot!.goals.length >= 15); assert.ok(Number(held.snapshot!.progress) > 0);
  assert.equal((await err(adam.holdReview(rv.id, 'again', 'again')))?.code, 'not_found');
});

test('focus areas can be created from the Planner page path, persist, and respect permissions and organizations', async () => {
  const admin = as(I.ADAM);   // plan.manage in Layer2Funnels
  const plan = (await admin.plans(I.L2F))[0]!;
  const before = (await admin.plan(plan.id))!.focus_areas.length;
  const fa = await admin.saveFocusArea(plan.id, null, { name: 'Retention', description: 'Keep clients', color: 'teal', start_date: '2026-01-01', end_date: '2026-06-30' });
  const reopened = (await as(I.ADAM).plan(plan.id))!;
  assert.equal(reopened.focus_areas.length, before + 1);
  const saved = reopened.focus_areas.find((f) => f.id === fa.id)!;
  assert.equal(saved.name, 'Retention'); assert.equal(saved.plan_id, plan.id); assert.equal(saved.start_date, '2026-01-01');
  // edit through the same operation
  await admin.saveFocusArea(plan.id, fa.id, { name: 'Retention and referrals' });
  assert.equal((await admin.plan(plan.id))!.focus_areas.find((f) => f.id === fa.id)!.name, 'Retention and referrals');
  // an editor and a viewer may not create or edit focus areas
  assert.ok(await err(as(I.EDITH).saveFocusArea(plan.id, null, { name: 'Nope', color: 'blue' })));
  assert.ok(await err(as(I.VERA).saveFocusArea(plan.id, fa.id, { name: 'Hijack' })));
  // a person with no Planner grant, and an Aurj-only person, cannot reach an L2F plan
  assert.ok(await err(as(I.NOAH).saveFocusArea(plan.id, null, { name: 'Nope', color: 'blue' })));
  assert.ok(await err(as(I.ARIA).saveFocusArea(plan.id, null, { name: 'Cross-org', color: 'blue' })));
  assert.equal((await admin.plan(plan.id))!.focus_areas.some((f) => f.name === 'Cross-org' || f.name === 'Nope' || f.name === 'Hijack'), false);
});

test('turning an objective into work creates its tasks once, and a second pass creates none', async () => {
  const { proposeFor, tasksToCreate, convertible } = await import('../src/lib/conversion.ts');
  const ed = as(I.EDITH);
  const plan = (await ed.plans(I.L2F))[0]!;
  const detail = (await ed.plan(plan.id))!;
  const goal = convertible(detail.goals).find((g) => g.owner_id)!;
  assert.ok(goal);
  const existing = (await ed.goal(goal.id))!.actions;
  const first = proposeFor(goal, existing);
  const rows = tasksToCreate({}, new Set(), first);
  assert.ok(rows.length > 0);
  for (const t of rows) await ed.saveAction(goal.id, null, { title: t.title, notes: t.notes, assignee_id: goal.owner_id, status: 'todo', priority: goal.priority, due_date: goal.due_date });
  const after = (await ed.goal(goal.id))!.actions;
  assert.equal(after.length, existing.length + rows.length);
  const again = tasksToCreate({}, new Set(), proposeFor(goal, after));
  assert.equal(again.length, 0);   // nothing is duplicated
  // a viewer cannot create the tasks
  assert.ok(await err(as(I.VERA).saveAction(goal.id, null, { title: 'Sneaky', status: 'todo' })));
});

test('a strategy is defined once, picked when creating a plan, and shapes what the plan offers', async () => {
  const admin = as(I.ADAM);
  const model = (await admin.model(I.L2F))!;
  const objective = model.types.find((x) => x.name === 'Objective')!;
  const ft = await admin.saveFocusTemplate(I.L2F, null, { name: 'Referral theme', color: 'teal' });
  const st = await admin.saveStrategy(I.L2F, null, { name: 'Referral growth', kind_ids: [objective.id], focus_ids: [ft.id] });
  const mt = await admin.saveMeasureType(I.L2F, null, { name: 'Referral count', unit: 'people', kind_ids: [objective.id] });
  const plan = await admin.savePlan(I.L2F, null, { name: 'Get 1,000 followers', strategy_id: st.id });
  const detail = (await admin.plan(plan.id))!;
  assert.deepEqual(detail.focus_areas.map((f) => f.name), ['Referral theme']);
  assert.equal(detail.strategy?.id, st.id);
  assert.deepEqual(detail.strategy?.kind_ids, [objective.id]);
  assert.ok(detail.measure_types.some((m) => m.id === mt.id));
  // the strategy's own kind works, another kind is refused
  const goal = await admin.saveGoal(plan.id, null, { title: 'Reach 1k', goal_type_id: objective.id, focus_area_id: detail.focus_areas[0]!.id });
  assert.equal(goal.goal_type_id, objective.id);
  // kinds stay in the background: any kind can be used in a strategy plan
  const initiative = model.types.find((x) => x.name === 'Initiative')!;
  assert.ok((await admin.saveGoal(plan.id, null, { title: 'Any kind', goal_type_id: initiative.id, focus_area_id: detail.focus_areas[0]!.id })).id);
  // a KPI type tied to Objective can be used on it
  const m = await admin.saveMeasure(goal.id, null, { name: 'Referral count', unit: 'people', measure_type_id: mt.id, target_value: 1000 });
  assert.equal(m.name, 'Referral count');
  // an editor cannot define strategies; another organization cannot see them
  assert.ok(await err(as(I.EDITH).saveStrategy(I.L2F, null, { name: 'Nope' })));
  assert.equal(await as(I.ARIA).model(I.L2F), null);
  assert.equal((await as(I.ARIA).model(I.AURJ))!.strategies.length, 0);   // Aurj has defined none
});
