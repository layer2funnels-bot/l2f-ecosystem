// Projects R3 (migration 0036): start dates, dependencies ("waiting on"), recurring tasks, project templates and duplicating a project.
// Through the API and the database: the rules hold for every caller, and copying never reaches past what the person may see.
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
for (const u of [U.ED, U.ED2, U.VW]) await db.query("insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,'projects')", [L, u]);
const lvl = async (name) => (await rows('select id from access_levels where workspace_id=$1 and name=$2', [L, name]))[0].id;
const assign = (u, level, project = null) => db.query("insert into access_assignments (workspace_id,access_level_id,principal_type,principal_id,project_id) values ($1,$2,'user',$3,$4)", [L, level, u, project]);
const C1 = id(); await db.query("insert into clients (id,workspace_id,name) values ($1,$2,'Acme')", [C1, L]);
const P1 = id(), P2 = id();
await db.query("insert into projects (id,workspace_id,name,start_on) values ($1,$3,'One','2030-01-01'),($2,$3,'Two',null)", [P1, P2, L]);
await assign(U.ED, await lvl('All projects · edit')); await assign(U.VW, await lvl('All projects · read')); await assign(U.ED2, await lvl('Project member'), P1);
const task = async (project, title, extra = {}, u = U.ED) => (await J('tasks.create', { project, title, ...extra }, u)).row;

// ---- start dates
const sd = await task(P1, 'Design', { start_on: '2030-01-02', due_on: '2030-01-05' });
const backwards = await J('tasks.create', { project: P1, title: 'x', start_on: '2030-01-09', due_on: '2030-01-05' }, U.ED);
check('RP1', 'A task can have a start date as well as a due date; a start after the due date is refused', sd?.start_on === '2030-01-02' && sd?.due_on === '2030-01-05' && backwards.status === 422);

// ---- dependencies
const build = await task(P1, 'Build', { assignee: U.ED2, due_on: '2030-01-10' });
const test = await task(P1, 'Test', { due_on: '2030-01-12' });
const d1 = await J('tasks.deps.add', { task: build?.id, depends_on: sd?.id }, U.ED);
await J('tasks.deps.add', { task: test?.id, depends_on: build?.id }, U.ED);
const cycle = await J('tasks.deps.add', { task: sd?.id, depends_on: test?.id }, U.ED);
const self = await J('tasks.deps.add', { task: sd?.id, depends_on: sd?.id }, U.ED);
const other = await J('tasks.deps.add', { task: build?.id, depends_on: (await task(P2, "Elsewhere"))?.id }, U.ED);
check('RP2', 'A task can wait on another task of its project; a loop, waiting on itself or on another project\'s task is refused',
  d1.status === 200 && cycle.status !== 200 && self.status !== 200 && other.status !== 200);
const b1 = (await J('tasks.get', { id: build?.id }, U.ED)).row;
check('RP3', 'A task says how many unfinished tasks it waits on, and what it waits on', b1?.waiting_on === 1 && (await J('tasks.deps.list', { task: build?.id }, U.ED)).data.map((d) => d.title).join() === 'Design');
const vwDep = await J('tasks.deps.add', { task: test?.id, depends_on: sd?.id }, U.VW);
check('RP4', 'Only people who may edit the task change what it waits on', vwDep.status !== 200);
await J('tasks.update', { id: sd?.id, status: 'done' }, U.ED);
const b2 = (await J('tasks.get', { id: build?.id }, U.ED)).row;
const told = (await J('notifications.list', {}, U.ED2)).data.filter((n) => n.kind === 'unblocked' && n.entity_id === build?.id);
check('RP5', 'When everything a task waits on is done, it waits on nothing and its assignee is told it can start', b2?.waiting_on === 0 && told.length === 1);
await J('tasks.deps.remove', { task: test?.id, depends_on: build?.id }, U.ED);
check('RP6', 'A dependency can be removed', (await J('tasks.get', { id: test?.id }, U.ED)).row?.waiting_on === 0);

// ---- recurring tasks
const rep = await task(P1, 'Weekly report', { due_on: '2030-01-07', start_on: '2030-01-06', repeat: 'weekly', assignee: U.ED2, priority: 'high' });
await J('tasks.tags.add', { task: rep?.id, name: 'Reporting' }, U.ED);
await J('tasks.update', { id: rep?.id, status: 'done' }, U.ED2);
const next = (await J('tasks.list', { project: P1 }, U.ED)).data.filter((t) => t.title === 'Weekly report' && t.status !== 'done');
check('RP7', 'Completing a weekly task creates the next one a week later, with the same person, priority, tags and start-to-due span',
  next.length === 1 && next[0].due_on === '2030-01-14' && next[0].start_on === '2030-01-13' && next[0].assignee_id === U.ED2 && next[0].priority === 'high' && next[0].repeat === 'weekly' && next[0].tags.map((g) => g.name).join() === 'Reporting');
await J('tasks.update', { id: rep?.id, status: 'todo' }, U.ED2); await J('tasks.update', { id: rep?.id, status: 'done' }, U.ED2);
check('RP8', 'Reopening and finishing the old one again does not create another copy', (await J('tasks.list', { project: P1 }, U.ED)).data.filter((t) => t.title === 'Weekly report').length === 2);
const monthEnd = await task(P1, 'Month end close', { due_on: '2030-01-31', repeat: 'monthly' });
await J('tasks.update', { id: monthEnd?.id, status: 'done' }, U.ED);
const wk = await task(P1, 'Standup notes', { due_on: '2030-01-04', repeat: 'weekdays' });       // a Friday
await J('tasks.update', { id: wk?.id, status: 'done' }, U.ED);
const titled = async (t) => (await J('tasks.list', { project: P1 }, U.ED)).data.find((x) => x.title === t && x.status !== 'done');
check('RP9', 'Monthly keeps to the month\'s end (31 Jan → 28 Feb) and weekdays skip the weekend (Friday → Monday)', (await titled('Month end close'))?.due_on === '2030-02-28' && (await titled('Standup notes'))?.due_on === '2030-01-07');
const noDate = await J('tasks.create', { project: P1, title: 'x', repeat: 'daily' }, U.ED);
check('RP10', 'A repeating task needs a due date', noDate.status === 422);

// ---- templates and duplicating
const sec = (await J('sections.create', { project: P1, name: 'Launch' }, U.ED)).row;
await J('tasks.update', { id: test?.id, section: sec?.id }, U.ED);
await J('tasks.create', { project: P1, title: 'Test checklist step', parent: test?.id, due_on: '2030-01-11' }, U.ED);
await J('checklist.add', { task: test?.id, label: 'Browsers' }, U.ED);
await J('tasks.deps.add', { task: test?.id, depends_on: build?.id }, U.ED);     // Test waits on Build again: both are copied, so the link must be too
const tpl = await J('projects.duplicate', { id: P1, name: 'Launch template', template: true }, U.ED);
const listed = (await J('projects.list', { scope: 'all' }, U.ED)).data.map((p) => p.name);
const templates = (await J('projects.list', { templates: true }, U.ED)).data.map((p) => p.name);
check('RP11', 'A project is saved as a template: it stays out of the project lists and appears among templates', tpl.status === 200 && !listed.includes('Launch template') && templates.includes('Launch template'));
const fresh = await J('projects.duplicate', { id: tpl.row?.id, name: 'Acme launch', start_on: '2031-03-01', client: C1 }, U.ED);
const ft = (await J('tasks.list', { project: fresh.row?.id }, U.ED)).data;
const fTest = ft.find((t) => t.title === 'Test');
check('RP12', 'A project made from a template copies sections, open tasks, subtasks, checklists and tags, for the chosen client',
  fresh.status === 200 && (await J('sections.list', { project: fresh.row?.id }, U.ED)).data.map((s) => s.name).join() === 'Launch' && fTest?.section_id && fTest?.subtasks_total === 1 && fTest?.checklist_total === 1
  && ft.find((t) => t.title === 'Weekly report' && t.status !== 'done')?.tags?.map((g) => g.name).join() === 'Reporting' && (await J('projects.get', { id: fresh.row?.id }, U.ED)).row?.client_id === C1);
check('RP13', 'Dates move with the new start (1 Jan 2030 → 1 Mar 2031: the 12 Jan task is due 12 Mar 2031); finished tasks and their history are not copied',
  fTest?.due_on === '2031-03-12' && !ft.some((t) => t.status === 'done') && ft.find((t) => t.title === 'Build')?.waiting_on === 0 && ft.find((t) => t.title === 'Build')?.assignee_id === U.ED2);
const deps = (await J('tasks.deps.list', { task: fTest?.id }, U.ED)).data;
check('RP14', 'Dependencies between copied tasks are copied too, pointing at the new tasks (not the template\'s)', deps.length === 1 && deps[0].title === 'Build' && deps[0].id === ft.find((t) => t.title === 'Build')?.id && deps[0].id !== build?.id);
const vwDup = await J('projects.duplicate', { id: P1, name: 'x' }, U.VW);
const blindDup = await J('projects.duplicate', { id: P2, name: 'x' }, U.ED2);
const crossDup = await J('projects.duplicate', { id: P1, name: 'x' }, U.AOWN, A);
check('RP15', 'Duplicating needs the right to create projects and to see the source; another organization cannot copy it', vwDup.status !== 200 && blindDup.status !== 200 && crossDup.status !== 200);

for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}${x.ok ? '' : `  [${x.detail ?? ''}]`}`);
const p = results.filter((x) => x.ok).length; console.log(`\n${p}/${results.length} checks passed`); await db.close(); process.exit(p === results.length ? 0 : 1);
