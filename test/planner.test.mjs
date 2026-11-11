// Planner data layer and API (migration 0015): objectives, measures with value history, links to Projects tasks, reviews, overview.
// Allow + deny per role and client scope, isolation, audit without text, archive before delete, server-time values. Database and API.
import { randomUUID as id } from 'node:crypto';
import { openDb, migrate, session, recorder } from './lib.mjs';
import { createApi } from '../packages/core/api.mjs';
import { createPgExecutor } from '../packages/core/pg-executor.mjs';
import { createRateLimiter } from '../packages/core/rate-limit.mjs';
import { createSafeLogger } from '../packages/core/safe-log.mjs';

const db = await openDb(); await migrate(db);
const rawQuery = db.query.bind(db); db.query = async (s, p) => { try { return await rawQuery(s, p); } catch (e) { e.message += `   [SQL: ${String(s).slice(0, 110).replace(/\s+/g, ' ')}]`; throw e; } };
const S = session(db); const { asSuper } = S;
// every real request names its organization (x-org-id); Projects V2 rows are only visible inside it
const asUser = (u, o = {}) => S.asUser(u, { org: typeof L === 'undefined' ? null : L, ...o }); const { results, check, errCode } = recorder();
const rows = async (s, p = []) => (await db.query(s, p)).rows;
const affected = async (s, p = []) => (await db.query(s, p)).affectedRows;

let chain = Promise.resolve();
const acquire = () => { const prev = chain; let release; chain = new Promise((r) => { release = r; }); return prev.then(() => ({ query: (s, p) => db.query(s, p), release })); };
const BIG = { read: { max: 1e6, windowMs: 6e4 }, write: { max: 1e6, windowMs: 6e4 }, sensitive: { max: 1e6, windowMs: 6e4 } };
const api = createApi({ executor: createPgExecutor({ acquire, role: 'app_user' }), logger: createSafeLogger(() => {}), limiter: createRateLimiter({ limits: BIG }) });
const call = (op, input, user, org = L) => api.handle({ operation: op, input, auth: { userId: user, email: 'x@example.com' }, headers: { 'x-org-id': org } });
const J = async (op, input, u, org) => { const r = await call(op, input, u, org); if (process.env.DEBUG_J) console.log('J', op, r.status, JSON.stringify(r.body).slice(0, 200)); return { ...r, data: r.body?.data, row: r.body?.data?.[0], code: r.body?.error?.code }; };

await asSuper();
const L = id(), A = id();
const U = { OWN: id(), ADM: id(), ED: id(), ED2: id(), VW: id(), NOAPP: id(), AOWN: id(), CL1: id(), BOTH: id() };
await db.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','L'),($2,'aurj','A')", [L, A]);
const staff = (u, ws, r) => db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff',$3)", [ws, u, r]);
await staff(U.OWN, L, 'owner'); await staff(U.ADM, L, 'admin'); await staff(U.ED, L, 'editor'); await staff(U.ED2, L, 'editor'); await staff(U.VW, L, 'viewer'); await staff(U.NOAPP, L, 'editor');
await staff(U.AOWN, A, 'owner'); await staff(U.BOTH, L, 'owner'); await staff(U.BOTH, A, 'owner');
for (const u of [U.ED, U.ED2, U.VW]) await db.query("insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,'planner')", [L, u]);
const C1 = id(), C2 = id();
await db.query("insert into clients (id,workspace_id,name) values ($1,$3,'Client One'),($2,$3,'Client Two')", [C1, C2, L]);
await db.query("insert into memberships (workspace_id,user_id,kind,client_id) values ($1,$2,'client',$3)", [L, U.CL1, C1]);
const P1 = id(), P2 = id(), P0 = id();
await db.query("insert into pm_projects (id,workspace_id,client_id,name,visibility) values ($1,$4,$5,'P1','organization'),($2,$4,$6,'P2','organization'),($3,$4,null,'P0','organization')", [P1, P2, P0, L, C1, C2]);
const TK = { c1: id(), c2: id(), none: id() };
await db.query("insert into pm_tasks (id,workspace_id,project_id,title,number) values ($1,$4,$5,'Task C1',0),($2,$4,$6,'Task C2',0),($3,$4,$7,'Task none',0)", [TK.c1, TK.c2, TK.none, L, P1, P2, P0]);

// ---- A. objectives
await asUser(U.ED);
const o1 = (await db.query("insert into planner_objectives (workspace_id,title,description,status,owner_id,period_start,period_end) values ($1,'Four funnels live','SECRET-OBJECTIVE-TEXT','active',$2,'2026-10-01','2026-12-31') returning id, created_by", [L, U.ED2])).rows[0];
check('PL1', 'An editor creates an objective; the author is the signed-in person and the owner can be set', o1.created_by === U.ED);
check('PL2', 'The owner must be a staff member here (a client contact or another organization’s person is refused); an end date before the start is refused',
  (await errCode(() => db.query("update planner_objectives set owner_id=$2 where id=$1", [o1.id, U.CL1]))) === 'P0001' && (await errCode(() => db.query("update planner_objectives set owner_id=$2 where id=$1", [o1.id, U.AOWN]))) === 'P0001'
  && (await errCode(() => db.query("update planner_objectives set period_start='2027-01-01', period_end='2026-01-01' where id=$1", [o1.id]))) === '23514');
check('PL3', 'An objective cannot change client or organization', (await errCode(() => db.query("update planner_objectives set client_id=$2 where id=$1", [o1.id, C1]))) === 'P0001');
const oc1 = (await db.query("insert into planner_objectives (workspace_id,client_id,title) values ($1,$2,'Client One launch') returning id", [L, C1])).rows[0].id;
const oc2 = (await db.query("insert into planner_objectives (workspace_id,client_id,title) values ($1,$2,'Client Two retainer') returning id", [L, C2])).rows[0].id;
await asUser(U.VW);
check('PL4', 'A viewer sees objectives and measures and can change nothing', (await rows('select id from planner_objectives')).length === 3 && (await errCode(() => db.query("insert into planner_objectives (workspace_id,title) values ($1,'x')", [L]))) === '42501'
  && (await affected("update planner_objectives set title='x' where id=$1", [o1.id])) === 0 && (await errCode(() => db.query("insert into planner_measures (workspace_id,objective_id,name,target_value) values ($1,$2,'x',1)", [L, o1.id]))) === '42501');
await asUser(U.NOAPP);
check('PL5', 'An editor without the Planner app sees nothing', (await rows('select id from planner_objectives')).length === 0);
await asUser(U.AOWN);
check('PL6', 'Another organization sees nothing and cannot write into this one', (await rows('select id from planner_objectives')).length === 0 && (await errCode(() => db.query("insert into planner_measures (workspace_id,objective_id,name,target_value) values ($1,$2,'x',1)", [L, o1.id]))) !== 'no-error');
await asUser(U.BOTH, { org: A });
check('PL7', 'A person in two organizations sees only the organization the request names', (await rows('select id from planner_objectives')).length === 0);
await asSuper();
await db.query("insert into permission_overrides (workspace_id,principal_type,principal_id,permission_key,effect,client_id,reason) values ($1,'user',$2,'planner.objective.view','deny',$3,'test'),($1,'user',$2,'planner.review.view','deny',$3,'test')", [L, U.ED2, C2]);
await asUser(U.ED2);
check('PL8', 'A restriction on one client hides that client’s objectives from that person only (scope), and the rest stay visible', (await rows('select id from planner_objectives')).map((r) => r.id).sort().join() === [o1.id, oc1].sort().join());
await asUser(U.ED);
check('PL9', 'The same restriction does not touch anyone else', (await rows('select id from planner_objectives')).length === 3);

// ---- B. measures and recorded values
const m1 = (await db.query("insert into planner_measures (workspace_id,objective_id,name,unit,start_value,target_value) values ($1,$2,'Funnels live','funnels',0,4) returning id, client_id", [L, o1.id])).rows[0];
const mc = (await db.query("insert into planner_measures (workspace_id,objective_id,client_id,name,target_value) values ($1,$2,$3,'Client leads',100) returning id, client_id", [L, oc1, C2])).rows[0];
check('PM1', 'A measure takes its client from its objective, whatever the caller sends', m1.client_id === null && mc.client_id === C1);
check('PM2', 'A measure needs a target different from its start, and cannot move to another objective', (await errCode(() => db.query("insert into planner_measures (workspace_id,objective_id,name,start_value,target_value) values ($1,$2,'x',5,5)", [L, o1.id]))) === '23514'
  && (await errCode(() => db.query("update planner_measures set objective_id=$2 where id=$1", [m1.id, oc1]))) === 'P0001');
await db.query("insert into planner_measure_values (workspace_id,measure_id,value,note,recorded_at) values ($1,$2,1,'SECRET-VALUE-NOTE','2000-01-01')", [L, m1.id]);
await db.query("insert into planner_measure_values (workspace_id,measure_id,value) values ($1,$2,3)", [L, m1.id]);
const hist = await rows('select value, recorded_by, recorded_at, client_id, objective_id from planner_measure_values where measure_id=$1 order by recorded_at', [m1.id]);
check('PM3', 'Recording a value uses the server clock (a time sent by the caller is ignored), the person is the signed-in one, and the objective comes from the measure', hist.length === 2 && hist.every((h) => Math.abs(Date.now() - new Date(h.recorded_at).getTime()) < 15000) && hist[0].recorded_by === U.ED && hist[0].objective_id === o1.id);
check('PM4', 'History cannot be edited or removed by anyone using the app', (await errCode(() => db.query("update planner_measure_values set value=99 where measure_id=$1", [m1.id]))) === '42501' && (await errCode(() => db.query("delete from planner_measure_values where measure_id=$1", [m1.id]))) === '42501');
await asUser(U.VW);
check('PM5', 'A viewer reads values and cannot record', (await rows('select id from planner_measure_values')).length === 2 && (await errCode(() => db.query("insert into planner_measure_values (workspace_id,measure_id,value) values ($1,$2,2)", [L, m1.id]))) === '42501');
await asUser(U.ED2);
check('PM6', 'A restricted client’s measures and values are hidden too', (await rows('select id from planner_measures where objective_id=$1', [oc2])).length === 0);

// ---- C. links to Projects tasks
await asUser(U.ED);
check('LN1', 'An editor who cannot see Projects tasks cannot link them (you must see what you link)', (await errCode(() => db.query("insert into planner_objective_tasks (workspace_id,objective_id,task_id) values ($1,$2,$3)", [L, o1.id, TK.none]))) === '42501');
await asUser(U.ADM);
await db.query("insert into planner_objective_tasks (workspace_id,objective_id,task_id) values ($1,$2,$3),($1,$2,$4)", [L, o1.id, TK.c1, TK.none]);
check('LN2', 'Someone who sees the tasks and may edit the objective links them (an organization-wide objective takes any task)', (await rows('select task_id from planner_objective_tasks where objective_id=$1', [o1.id])).length === 2);
check('LN3', 'A client’s objective only takes that client’s tasks', (await errCode(() => db.query("insert into planner_objective_tasks (workspace_id,objective_id,task_id) values ($1,$2,$3)", [L, oc1, TK.c2]))) === 'P0001' && (await affected("insert into planner_objective_tasks (workspace_id,objective_id,task_id) values ($1,$2,$3)", [L, oc1, TK.c1])) === 1);
check('LN4', 'A task of another organization cannot be linked', (await errCode(() => db.query("insert into planner_objective_tasks (workspace_id,objective_id,task_id) values ($1,$2,$3)", [L, o1.id, id()]))) !== 'no-error');
check('LN5', 'A task that serves an objective cannot be deleted from under it (the link must go first)', await (async () => { await db.query("update pm_tasks set deleted_at=now() where id=$1", [TK.c1]); await asUser(U.OWN); return (await errCode(() => db.query("delete from pm_tasks where id=$1", [TK.c1]))) === '23503'; })());   // Projects V2: the link holds the task (foreign key), so the delete is refused
await asUser(U.ADM); await db.query("update pm_tasks set deleted_at=null where id=$1", [TK.c1]);
await asUser(U.VW);
check('LN6', 'A viewer sees links and cannot add or remove them', (await rows('select task_id from planner_objective_tasks')).length === 3 && (await affected("delete from planner_objective_tasks where objective_id=$1", [o1.id])) === 0);

// ---- D. reviews
await asUser(U.ED);
const rv = (await db.query("insert into planner_reviews (workspace_id,objective_id,client_id,title,due_on,summary) values ($1,$2,$3,'Q4 review','2026-11-30','SECRET-REVIEW-TEXT') returning id, client_id", [L, oc1, C2])).rows[0];
check('RV1', 'A review of a client’s objective belongs to that client, whatever the caller sends', rv.client_id === C1);
check('RV2', 'Completing a review sets the completion time in the database; reopening clears it', (await affected("update planner_reviews set status='done', rating='on_track' where id=$1", [rv.id])) === 1 && (await rows('select completed_at from planner_reviews where id=$1', [rv.id]))[0].completed_at !== null
  && (await affected("update planner_reviews set status='scheduled' where id=$1", [rv.id])) === 1 && (await rows('select completed_at from planner_reviews where id=$1', [rv.id]))[0].completed_at === null);
await asUser(U.VW);
check('RV3', 'A viewer reads reviews and cannot write them', (await rows('select id from planner_reviews')).length === 1 && (await errCode(() => db.query("insert into planner_reviews (workspace_id,title) values ($1,'x')", [L]))) === '42501');
await asUser(U.ED2);
check('RV4', 'A review of a restricted client’s work is hidden from the restricted person only', await (async () => { const r2 = (await db.query("insert into planner_reviews (workspace_id,objective_id,title) values ($1,$2,'x')", [L, oc2]).catch((e) => e.code)); return r2 === '42501' || (await rows('select id from planner_reviews where objective_id=$1', [oc2])).length === 0; })());

// ---- E. deleting
await asUser(U.OWN);
check('DL1', 'An objective with measures, reviews or links cannot be deleted, archived or not', (await affected("update planner_objectives set archived_at=now() where id=$1", [o1.id])) === 1 && (await errCode(() => db.query("delete from planner_objectives where id=$1", [o1.id]))) === 'P0001');
check('DL2', 'A measure is deleted only after archiving, and only by an owner by default; its history goes with it', (await errCode(() => db.query("delete from planner_measures where id=$1", [m1.id]))) === 'P0001' && (await affected("update planner_measures set archived_at=now() where id=$1", [m1.id])) === 1
  && await (async () => { await asUser(U.ADM); const none = await affected("delete from planner_measures where id=$1", [m1.id]); await asUser(U.OWN); return none === 0 && (await affected("delete from planner_measures where id=$1", [m1.id])) === 1 && (await rows('select id from planner_measure_values where measure_id=$1', [m1.id])).length === 0; })());
check('DL3', 'A review is deleted only after archiving; an editor cannot', (await errCode(() => db.query("delete from planner_reviews where id=$1", [rv.id]))) === 'P0001' && (await affected("update planner_reviews set archived_at=now() where id=$1", [rv.id])) === 1 && (await affected("delete from planner_reviews where id=$1", [rv.id])) === 1);
check('DL4', 'A client with planner work cannot be deleted', (await errCode(() => db.query("delete from clients where id=$1", [C1]))) === 'P0001');
await asSuper();
check('DL5', 'An empty archived objective is deleted by an owner', await (async () => { const e = (await db.query("insert into planner_objectives (workspace_id,title) values ($1,'Empty') returning id", [L])).rows[0].id; await asUser(U.OWN); return (await affected("update planner_objectives set archived_at=now() where id=$1", [e])) === 1 && (await affected("delete from planner_objectives where id=$1", [e])) === 1; })());

// ---- F. audit and exposure
await asSuper();
const au = JSON.stringify(await rows("select action, detail, actor_id from audit_events where action like 'planner_%'"));
check('AU1', 'Objective, measure, value, link and review changes are audited with the actor; no description, summary or value note appears', au.includes('planner_objectives.insert') && au.includes('planner_measures.insert') && au.includes('planner_measure_values.insert') && au.includes('planner_objective_tasks.insert') && au.includes('planner_reviews.update')
  && !/SECRET-OBJECTIVE-TEXT|SECRET-REVIEW-TEXT|SECRET-VALUE-NOTE/.test(au) && au.includes(U.ED));
check('IN1', 'The Data API roles have no access to any Planner table', (await rows("select count(*)::int n from information_schema.role_table_grants where grantee in ('anon','authenticated') and table_name like 'planner_%'"))[0].n === 0);

// ---- G. through the API
let r = await J('planner.objectives.create', { title: 'API objective', owner: U.ED2, status: 'active', health: 'at_risk', period_start: '2026-10-01', period_end: '2026-12-31' }, U.ED); const AO = r.row?.id;
check('PA1', 'planner.objectives.create returns the objective with measure and task counts and no progress yet', r.status === 200 && r.row.measures === 0 && r.row.tasks === 0 && r.row.progress === null && r.row.health === 'at_risk');
r = await J('planner.measures.create', { objective: AO, name: 'Leads', unit: 'leads', target_value: 200 }, U.ED); const AM = r.row?.id;
check('PA2', 'planner.measures.create starts at 0 with no value recorded and progress 0', r.status === 200 && r.row.start_value === 0 && r.row.current_value === null && r.row.progress === 0);
r = await J('planner.measures.record', { id: AM, value: 50, note: 'first week' }, U.ED);
check('PA3', 'planner.measures.record returns the measure at its new value: 25% of the way', r.row.current_value === 50 && r.row.progress === 0.25);
r = await J('planner.measures.create', { objective: AO, name: 'Cost per lead', unit: 'USD', start_value: 100, target_value: 50 }, U.ED); const AM2 = r.row?.id;
await J('planner.measures.record', { id: AM2, value: 75 }, U.ED);
r = await J('planner.objectives.get', { id: AO }, U.ED);
check('PA4', 'a measure that must go down (100 to 50) counts as half done at 75; the objective’s progress is the average of its measures', r.row.measures === 2 && Math.abs(r.row.progress - 0.375) < 1e-9);
r = await J('planner.measures.record', { id: AM, value: 120, note: 'second' }, U.ED); r = await J('planner.measures.record', { id: AM, value: 300 }, U.ED);
check('PA5', 'progress never goes past 100%', r.row.progress === 1 && r.row.current_value === 300);
r = await J('planner.measures.history', { id: AM }, U.ED);
check('PA6', 'planner.measures.history lists newest first', r.data.length === 3 && r.data[0].value === 300 && r.data[2].value === 50);
r = await J('planner.measures.record', { id: AM, value: 1e15 }, U.ED);
check('PA7', 'a value out of range is refused before the database sees it', r.status === 422 && r.code === 'invalid');
r = await J('planner.measures.record', { id: AM, value: 5 }, U.VW);
check('PA8', 'a viewer cannot record: not found', r.status === 404);
await J('planner.measures.archive', { id: AM2 }, U.ED);
r = await J('planner.measures.record', { id: AM2, value: 60 }, U.ED);
check('PA9', 'an archived measure takes no new value: not found', r.status === 404);
r = await J('planner.links.add', { objective: AO, task: TK.c1 }, U.ADM);
check('PA10', 'planner.links.add links a Projects task to the objective', r.status === 200 && (await J('planner.objectives.get', { id: AO }, U.ED)).row.tasks === 1);
r = await J('planner.links.list', { objective: AO }, U.ADM);
check('PA11', 'planner.links.list shows the task with its project name to someone who may see it', r.data.length === 1 && r.data[0].title === 'Task C1' && r.data[0].project_name === 'P1');
r = await J('planner.links.list', { objective: AO }, U.ED);
check('PA12', 'and shows nothing of a task the caller cannot see in Projects (no title leaks through the link)', r.data.length === 0 && !JSON.stringify(r.body).includes('Task C1'));
r = await J('planner.links.add', { objective: AO, task: TK.c1 }, U.ED);
check('PA13', 'an editor who cannot see the task cannot link it: not found', r.status === 404);
r = await J('planner.reviews.create', { objective: AO, title: 'Weekly review', due_on: new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10), summary: 'API-SECRET' }, U.ED); const AR = r.row?.id;
check('PA14', 'planner.reviews.create schedules a review', r.status === 200 && r.row.status === 'scheduled');
await J('planner.reviews.create', { title: 'Overdue review', due_on: '2020-01-01' }, U.ED);
r = await J('planner.overview', { days: 14 }, U.ED);
check('PA15', 'planner.overview counts objectives by status and health, and reviews due and overdue', r.status === 200 && r.row.by_status.active >= 1 && r.row.by_health.at_risk === 1 && r.row.reviews_due >= 1 && r.row.reviews_overdue === 1);
r = await J('planner.reviews.list', { due_within_days: 7 }, U.ED);
check('PA16', 'planner.reviews.list can ask for reviews due soon (the overdue one too), without the text', r.data.length === 2 && !JSON.stringify(r.data).includes('API-SECRET'));
r = await J('planner.reviews.complete', { id: AR, rating: 'on_track' }, U.ED);
check('PA17', 'planner.reviews.complete marks it done with a rating and time', r.status === 200 && r.row.status === 'done' && r.row.completed_at !== null && r.row.rating === 'on_track');
r = await J('planner.objectives.list', { status: 'active', q: 'api' }, U.VW);
check('PA18', 'planner.objectives.list filters by status and name for a viewer', r.data.length === 1 && r.data[0].id === AO);
r = await J('planner.objectives.get', { id: AO }, U.AOWN, A);
check('PA19', 'another organization asking for the same id gets not found', r.status === 404 && r.code === 'not_found');
r = await J('planner.objectives.delete', { id: AO }, U.OWN);
check('PA20', 'deleting an active objective is refused', r.status !== 200);

for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}${x.ok ? '' : `  [${x.detail ?? ''}]`}`);
const p = results.filter((x) => x.ok).length; console.log(`\n${p}/${results.length} checks passed`); await db.close(); process.exit(p === results.length ? 0 : 1);
