// Projects R5 (migration 0038): simple per-project rules. "When a task is created / moves to a status / moves to a section,
// assign it, set its priority, set its due date N days ahead, or add a tag." Rules are set by people who may edit the project;
// they run inside the database, so every way of changing a task (screen, bulk change, recurring copy) follows them.
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
const U = { OWN: id(), ED: id(), MEM: id(), VW: id(), AOWN: id() };
await db.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','L'),($2,'aurj','A')", [L, A]);
const staff = (u, ws, r) => db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff',$3)", [ws, u, r]);
await staff(U.OWN, L, 'owner'); await staff(U.ED, L, 'editor'); await staff(U.MEM, L, 'editor'); await staff(U.VW, L, 'viewer'); await staff(U.AOWN, A, 'owner');
for (const u of [U.ED, U.MEM, U.VW]) await db.query("insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,'projects')", [L, u]);
const lvl = async (name) => (await rows('select id from access_levels where workspace_id=$1 and name=$2', [L, name]))[0].id;
const assign = (u, level, project = null) => db.query("insert into access_assignments (workspace_id,access_level_id,principal_type,principal_id,project_id) values ($1,$2,'user',$3,$4)", [L, level, u, project]);
const P1 = id(), P2 = id(), PA = id();
await db.query("insert into projects (id,workspace_id,name,status) values ($1,$4,'One','active'),($2,$4,'Two','active'),($3,$5,'Aurj','active')", [P1, P2, PA, L, A]);
await assign(U.ED, await lvl('All projects · edit')); await assign(U.VW, await lvl('All projects · read')); await assign(U.MEM, await lvl('Project member'), P1);
const today = new Date().toISOString().slice(0, 10);
const plus = (n) => { const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const tagsOf = async (task) => (await J('tasks.panel', { id: task }, U.ED)).row?.task?.tags?.map((g) => g.name) ?? [];
const get = async (task) => (await J('tasks.panel', { id: task }, U.ED)).row?.task;

// ---- creating rules
const review = (await J('sections.create', { project: P1, name: 'Review' }, U.ED)).row;
const r1 = await J('rules.add', { project: P1, when: 'created', action: 'priority', priority: 'high' }, U.ED);
const r2 = await J('rules.add', { project: P1, when: 'status', status: 'doing', action: 'assign', assignee: U.MEM }, U.ED);
const r3 = await J('rules.add', { project: P1, when: 'section', section: review?.id, action: 'tag', tag: 'Needs review' }, U.ED);
const r4 = await J('rules.add', { project: P1, when: 'status', status: 'blocked', action: 'due_in', due_in_days: 2 }, U.ED);
check('AU1', 'Someone who can edit the project adds rules (when created / moved to a status / moved to a section; assign, priority, due in N days, tag)',
  [r1, r2, r3, r4].every((r) => r.status === 200) && r3.row?.tag_name === 'Needs review');
const vw = await J('rules.add', { project: P1, when: 'created', action: 'priority', priority: 'low' }, U.VW);
const mem = await J('rules.add', { project: P2, when: 'created', action: 'priority', priority: 'low' }, U.MEM);
check('AU2', 'A read-only viewer cannot add rules, and a project member cannot add them to a project they are not on', vw.status === 404 && mem.status === 404, `${vw.status} ${mem.status}`);
const bad1 = await J('rules.add', { project: P1, when: 'status', action: 'priority', priority: 'high' }, U.ED);
const bad2 = await J('rules.add', { project: P1, when: 'created', action: 'assign', assignee: U.AOWN }, U.ED);
const sec2 = (await J('sections.create', { project: P2, name: 'Elsewhere' }, U.ED)).row;
const bad3 = await J('rules.add', { project: P1, when: 'section', section: sec2?.id, action: 'priority', priority: 'high' }, U.ED);
check('AU3', 'A rule must be complete and stay inside its project: no status missing, no assignee from another organization, no section of another project',
  bad1.status === 422 && bad2.status === 422 && bad3.status >= 400, `${bad1.status} ${bad2.status} ${bad3.status}`);

// ---- rules at work
const t = (await J('tasks.create', { project: P1, title: 'Landing page' }, U.ED)).row;
check('AU4', 'When a task is created, the rule fills its priority', t?.priority === 'high');
const chosen = (await J('tasks.create', { project: P1, title: 'Chosen', priority: 'low' }, U.ED)).row;
check('AU5', 'On creation a rule never overrides what the person chose themselves', chosen?.priority === 'low');
await J('tasks.update', { id: t.id, status: 'doing' }, U.ED);
check('AU6', 'Moving a task to a status runs that status\'s rule (assigned to the right person)', (await get(t.id))?.assignee_id === U.MEM);
await J('tasks.update', { id: t.id, section: review.id }, U.ED);
check('AU7', 'Moving a task into a section runs that section\'s rule (tag added, created the first time)', (await tagsOf(t.id)).includes('Needs review'));
await J('tasks.update', { id: t.id, status: 'blocked' }, U.ED);
check('AU8', 'A rule sets the due date N days from today', (await get(t.id))?.due_on === plus(2));
const other = (await J('tasks.create', { project: P2, title: 'Other project' }, U.ED)).row;
await J('tasks.update', { id: other.id, status: 'doing' }, U.ED);
check('AU9', 'Rules of one project never touch another project\'s tasks', other?.priority === 'normal' && !(await get(other.id))?.assignee_id);
const bulk = (await J('tasks.create', { project: P1, title: 'Bulk one' }, U.ED)).row;
await J('tasks.bulk', { ids: [bulk.id], status: 'doing' }, U.ED);
check('AU10', 'Bulk changes follow the rules too (they run in the database, not on the screen)', (await get(bulk.id))?.assignee_id === U.MEM);

// ---- turning off, listing, removing
await J('rules.update', { id: r2.row.id, enabled: false }, U.ED);
const off = (await J('tasks.create', { project: P1, title: 'Paused rule' }, U.ED)).row;
await J('tasks.update', { id: off.id, status: 'doing' }, U.ED);
check('AU11', 'A paused rule does nothing', !(await get(off.id))?.assignee_id);
const list = await J('rules.list', { project: P1 }, U.ED);
const vlist = await J('rules.list', { project: P1 }, U.VW);
const alist = await J('rules.list', { project: P1 }, U.AOWN, A);
check('AU12', 'Rules are listed in words for anyone who can see the project; never across organizations',
  list.data.length === 4 && list.data.some((r) => r.enabled === false) && list.data.some((r) => r.section_name === 'Review') && vlist.data.length === 4 && alist.data.length === 0);
const del = await J('rules.delete', { id: r1.row.id }, U.ED);
const after = (await J('tasks.create', { project: P1, title: 'After delete' }, U.ED)).row;
check('AU13', 'A removed rule stops', del.status === 200 && after?.priority === 'normal');
await J('sections.delete', { id: review.id }, U.ED);
check('AU14', 'Deleting a section removes the rules that watched it', (await J('rules.list', { project: P1 }, U.ED)).data.length === 2);
const crossDel = await J('rules.delete', { id: r4.row.id }, U.AOWN, A);
check('AU15', 'Another organization cannot remove or even find a rule', crossDel.status === 404);

for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}${x.ok ? '' : `  [${x.detail ?? ''}]`}`);
const p = results.filter((x) => x.ok).length; console.log(`\n${p}/${results.length} checks passed`); await db.close(); process.exit(p === results.length ? 0 : 1);
