// Projects R4 (migration 0037): time estimates on tasks, workload per person per week, the project report and the portfolio.
// Reports read through the reader's own rules: a number never includes work the reader may not see.
import { randomUUID as id } from 'node:crypto';
import { openDb, migrate, session, recorder } from './lib.mjs';
import { createApi } from '../packages/core/api.mjs';
import { createPgExecutor } from '../packages/core/pg-executor.mjs';
import { createRateLimiter } from '../packages/core/rate-limit.mjs';
import { createSafeLogger } from '../packages/core/safe-log.mjs';

const db = await openDb(); await migrate(db);
const { asSuper } = session(db); const { results, check } = recorder();
const rows = async (s, p = []) => (await db.query(s, p)).rows;
let chain = Promise.resolve();
const acquire = () => { const prev = chain; let release; chain = new Promise((r) => { release = r; }); return prev.then(() => ({ query: (s, p) => db.query(s, p), release })); };
const BIG = { read: { max: 1e6, windowMs: 6e4 }, write: { max: 1e6, windowMs: 6e4 }, sensitive: { max: 1e6, windowMs: 6e4 } };
const api = createApi({ executor: createPgExecutor({ acquire, role: 'app_user' }), logger: createSafeLogger(() => {}), limiter: createRateLimiter({ limits: BIG }) });
const J = async (op, input, user, org = L) => { await asSuper(); const r = await api.handle({ operation: op, input, auth: { userId: user, email: 'x@example.com' }, headers: { 'x-org-id': org } }); return { status: r.status, data: r.body?.data ?? [], row: r.body?.data?.[0], code: r.body?.error?.code }; };

await asSuper();
const L = id(), A = id();
const U = { OWN: id(), ED: id(), ED2: id(), VW: id(), AOWN: id() };
await db.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','L'),($2,'aurj','A')", [L, A]);
const staff = (u, ws, r) => db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff',$3)", [ws, u, r]);
await staff(U.OWN, L, 'owner'); await staff(U.ED, L, 'editor'); await staff(U.ED2, L, 'editor'); await staff(U.VW, L, 'viewer'); await staff(U.AOWN, A, 'owner');
await db.query("insert into profiles (id, display_name) values ($1,'Ed'),($2,'Eve')", [U.ED, U.ED2]);
for (const u of [U.ED, U.ED2, U.VW]) await db.query("insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,'projects')", [L, u]);
const lvl = async (name) => (await rows('select id from access_levels where workspace_id=$1 and name=$2', [L, name]))[0].id;
const assign = (u, level, project = null) => db.query("insert into access_assignments (workspace_id,access_level_id,principal_type,principal_id,project_id) values ($1,$2,'user',$3,$4)", [L, level, u, project]);
const P1 = id(), P2 = id(), PA = id();
await db.query("insert into projects (id,workspace_id,name,status) values ($1,$4,'One','active'),($2,$4,'Two','active'),($3,$5,'Aurj','active')", [P1, P2, PA, L, A]);
await assign(U.ED, await lvl('All projects · edit')); await assign(U.VW, await lvl('All projects · read')); await assign(U.ED2, await lvl('Project member'), P1);
const today = new Date().toISOString().slice(0, 10);
const plus = (n) => { const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const task = async (project, title, extra = {}) => (await J('tasks.create', { project, title, ...extra }, U.ED)).row;

// ---- estimates
const t1 = await task(P1, 'Write copy', { assignee: U.ED2, due_on: plus(1), estimate_minutes: 240 });
const neg = await J('tasks.create', { project: P1, title: 'x', estimate_minutes: -5 }, U.ED);
check('OV1', 'A task carries an estimate in minutes; a negative estimate is refused', t1?.estimate_minutes === 240 && neg.status === 422);
await task(P1, 'Design', { assignee: U.ED2, due_on: plus(2), estimate_minutes: 600 });
await task(P1, 'Late thing', { assignee: U.ED, due_on: plus(-3), estimate_minutes: 60 });
await task(P1, 'Done thing', { assignee: U.ED2, due_on: plus(-1), status: 'done' });
await task(P1, 'Someday', { assignee: U.ED2 });
await task(P2, 'Other project work', { assignee: U.ED2, due_on: plus(8), estimate_minutes: 120 });
await J('tasks.create', { project: PA, title: 'Aurj work', assignee: U.AOWN, due_on: plus(1), estimate_minutes: 999 }, U.AOWN, A);

// ---- workload
const wl = await J('projects.workload', { from: today, weeks: 4 }, U.ED);
const eve = wl.data.filter((r) => r.user_id === U.ED2);
const eveWeek0 = eve.filter((r) => r.week_start <= plus(2) && r.week_start > plus(-7)).reduce((a, r) => a + r.tasks, 0);
check('OV2', 'Workload counts each person\'s open tasks and estimated hours per week (finished work is left out; undated work is counted separately)',
  wl.status === 200 && eve.reduce((a, r) => a + r.minutes, 0) === 240 + 600 + 120 && eveWeek0 >= 2 && eve.some((r) => r.week_start === null && r.tasks === 1) && !eve.some((r) => r.tasks_titles?.includes?.('Done thing')));
const late = wl.data.find((r) => r.user_id === U.ED && r.overdue > 0);
check('OV3', 'Overdue open work shows in the current week with how much of it is late', late?.overdue === 1);
const wlEve = await J('projects.workload', { from: today, weeks: 4 }, U.ED2);
check('OV4', 'Someone who can see only one project sees workload from that project only', wlEve.data.filter((r) => r.user_id === U.ED2).reduce((a, r) => a + r.minutes, 0) === 840);
check('OV5', 'Workload never includes another organization\'s work', !wl.data.some((r) => r.user_id === U.AOWN));
const wlP = await J('projects.workload', { from: today, weeks: 4, project: P2 }, U.ED);
check('OV6', 'Workload can be narrowed to one project', wlP.data.reduce((a, r) => a + r.minutes, 0) === 120);

// ---- project report
const rep = (await J('projects.report', { project: P1 }, U.ED)).row;
check('OV7', 'The project report counts open, done, overdue, done in the last 30 days and estimated hours left',
  rep?.open === 4 && rep?.done === 1 && rep?.overdue === 1 && rep?.done_30 === 1 && rep?.estimate_open_minutes === 900);
await asSuper();
await db.query("insert into time_entries (workspace_id,project_id,task_id,user_id,started_at,ended_at,billable) values ($1,$2,$3,$4,now()-interval '3 hours',now()-interval '1 hour',true),($1,$2,$3,$5,now()-interval '1 hour',now()-interval '30 minutes',false)", [L, P1, t1?.id ?? null, U.ED2, U.ED]);
const people = (await J('projects.report.people', { project: P1 }, U.ED)).data;
const evr = people.find((r) => r.user_id === U.ED2), edr = people.find((r) => r.user_id === U.ED);
check('OV8', 'Per person: open, overdue and finished tasks, and time logged (billable and not)',
  evr?.open === 3 && evr?.done === 1 && evr?.billable_seconds === 7200 && edr?.overdue === 1 && edr?.other_seconds === 1800 && evr?.name === 'Eve');
const vwPeople = (await J('projects.report.people', { project: P1 }, U.VW)).data;
check('OV9', 'A read-only viewer (who may see the project\'s time) gets the same per-person report', vwPeople.length === people.length);

// ---- portfolio
const pf = (await J('projects.portfolio', {}, U.ED)).data;
const one = pf.find((r) => r.id === P1);
check('OV10', 'The portfolio lists every project the person can open with its progress, overdue count and next due date', one?.open === 4 && one?.overdue === 1 && one?.next_due === plus(1) && one?.progress === 20 && pf.some((r) => r.id === P2) && !pf.some((r) => r.id === PA));
const pfEve = (await J('projects.portfolio', {}, U.ED2)).data;
check('OV11', 'Someone with access to one project sees only that one', pfEve.map((r) => r.id).join() === P1);

// ---- the task panel in ONE request (each request counts against the person's rate limit; the panel used to make eight)
await J('checklist.add', { task: t1.id, label: 'Proofread' }, U.ED);
await J('tasks.create', { project: P1, title: 'Sub step', parent: t1.id }, U.ED);
await J('tasks.tags.add', { task: t1.id, name: 'Copy' }, U.ED);
await J('comments.add', { type: 'project_task', id: t1.id, body: 'Draft attached' }, U.ED);
const panel = await J('tasks.panel', { id: t1.id }, U.ED);
const pn = panel.row;
check('OV12', 'One request returns everything the task panel shows: the task, checklist, subtasks, tags, files, what it waits on, comments, following and time',
  panel.status === 200 && pn?.task?.id === t1.id && pn.checklist.length === 1 && pn.subtasks.length === 1 && pn.tags_all.some((g) => g.name === 'Copy') && Array.isArray(pn.files) && Array.isArray(pn.deps)
  && pn.comments.length === 1 && pn.following === true && pn.time_seconds === 9000);
const blindPanel = await J('tasks.panel', { id: t1.id }, U.AOWN, A);
const otherPanel = await J('tasks.panel', { id: (await task(P2, 'Two-only'))?.id }, U.ED2);
check('OV13', 'The panel is refused for a task the person cannot see (another organization, another project)', blindPanel.status === 404 && otherPanel.status === 404);
for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}${x.ok ? '' : `  [${x.detail ?? ''}]`}`);
const p = results.filter((x) => x.ok).length; console.log(`\n${p}/${results.length} checks passed`); await db.close(); process.exit(p === results.length ? 0 : 1);
