// Working together (migration 0034): comments with mentions, activity history, followers and notifications as one shared service,
// used by Projects tasks; and subtasks. Through the real database and the API layer: who may read, write and be told, and what never leaks
// (another organization, a project you cannot open, a client contact, the text of notes or comments in history).
import { randomUUID as id } from 'node:crypto';
import { openDb, migrate, session, recorder } from './lib.mjs';
import { createApi } from '../packages/core/api.mjs';
import { createPgExecutor } from '../packages/core/pg-executor.mjs';
import { createRateLimiter } from '../packages/core/rate-limit.mjs';
import { createSafeLogger } from '../packages/core/safe-log.mjs';

const db = await openDb(); await migrate(db);
const { asUser, asSuper } = session(db); const { results, check, errCode } = recorder();
const rows = async (s, p = []) => (await db.query(s, p)).rows;

let chain = Promise.resolve();
const acquire = () => { const prev = chain; let release; chain = new Promise((r) => { release = r; }); return prev.then(() => ({ query: (s, p) => db.query(s, p), release })); };
const BIG = { read: { max: 1e6, windowMs: 6e4 }, write: { max: 1e6, windowMs: 6e4 }, sensitive: { max: 1e6, windowMs: 6e4 } };
const api = createApi({ executor: createPgExecutor({ acquire, role: 'app_user' }), logger: createSafeLogger(() => {}), limiter: createRateLimiter({ limits: BIG }) });
const J = async (op, input, user, org = L) => { await asSuper(); const r = await api.handle({ operation: op, input, auth: { userId: user, email: 'x@example.com' }, headers: { 'x-org-id': org } }); return { status: r.status, data: r.body?.data, row: r.body?.data?.[0], code: r.body?.error?.code }; };

await asSuper();
const L = id(), A = id();
const U = { OWN: id(), ED: id(), ED2: id(), ED0: id(), VW: id(), AOWN: id(), BOTH: id(), CL1: id() };
await db.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','L'),($2,'aurj','A')", [L, A]);
const staff = (u, ws, r) => db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff',$3)", [ws, u, r]);
await staff(U.OWN, L, 'owner'); await staff(U.ED, L, 'editor'); await staff(U.ED2, L, 'editor'); await staff(U.ED0, L, 'editor'); await staff(U.VW, L, 'viewer');
await staff(U.AOWN, A, 'owner'); await staff(U.BOTH, L, 'owner'); await staff(U.BOTH, A, 'owner');
for (const u of [U.ED, U.ED2, U.ED0, U.VW]) await db.query("insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,'projects')", [L, u]);
const lvl = async (name) => (await rows('select id from access_levels where workspace_id=$1 and name=$2', [L, name]))[0].id;
const assign = (u, level, project = null) => db.query("insert into access_assignments (workspace_id,access_level_id,principal_type,principal_id,project_id) values ($1,$2,'user',$3,$4)", [L, level, u, project]);
const C1 = id(); await db.query("insert into clients (id,workspace_id,name) values ($1,$2,'Client One')", [C1, L]);
await db.query("insert into memberships (workspace_id,user_id,kind,client_id) values ($1,$2,'client',$3)", [L, U.CL1, C1]);
const P1 = id(), P2 = id(), PA = id();
await db.query("insert into projects (id,workspace_id,client_id,name) values ($1,$4,$5,'One'),($2,$4,null,'Two'),($3,$6,null,'Aurj project')", [P1, P2, PA, L, C1, A]);
await assign(U.ED, await lvl('All projects · edit'));
await assign(U.VW, await lvl('All projects · read'));
await assign(U.ED2, await lvl('Project member'), P1);          // ED2 sees project One only; ED0 has no level at all

// ---- subtasks
const t1r = await J('tasks.create', { project: P1, title: 'Build landing page', notes: 'secret brief text' }, U.ED);
const T1 = t1r.row.id;
const T2 = (await J('tasks.create', { project: P2, title: 'Internal task' }, U.ED)).row.id;
const S1 = await J('tasks.create', { project: P1, title: 'Write headline', parent: T1 }, U.ED);
check('CO1', 'A subtask is a real task under its task, in the same project', S1.status === 200 && S1.row?.parent_task_id === T1);
const wrongProject = await J('tasks.create', { project: P2, title: 'x', parent: T1 }, U.ED);
const nested = await J('tasks.create', { project: P1, title: 'x', parent: S1.row?.id }, U.ED);
const parentUp = await J('tasks.update', { id: T1, parent: T2 }, U.ED);
check('CO2', 'A subtask stays in its task\'s project, one level deep, and a task with subtasks cannot itself become a subtask', wrongProject.status !== 200 && nested.status !== 200 && parentUp.status !== 200);
const subs = await J('tasks.list', { project: P1, parent: T1 }, U.ED);
const tops = await J('tasks.list', { project: P1, top_only: true }, U.ED);
check('CO3', 'A task lists its subtasks, and a project can list only its top-level tasks (with a subtask count)',
  (subs.data ?? []).map((t) => t.id).join() === S1.row?.id && (tops.data ?? []).every((t) => !t.parent_task_id) && (tops.data ?? []).find((t) => t.id === T1)?.subtasks_total === 1);

// ---- comments and mentions
const c1 = await J('comments.add', { type: 'project_task', id: T1, body: 'Draft is ready, @ED2 please check', mentions: [U.ED2, U.ED0, U.AOWN] }, U.ED);
check('CO4', 'A person who may comment adds a comment; only mentioned people who can open the task are mentioned (no access, or another organization: dropped)',
  c1.status === 200 && JSON.stringify(c1.row?.mentioned) === JSON.stringify([U.ED2]));
const seenBy = async (u) => (await J('comments.list', { type: 'project_task', id: T1 }, u)).data ?? [];
check('CO5', 'Comments are seen exactly by the people who may see the task', (await seenBy(U.ED2)).length === 1 && (await seenBy(U.VW)).length === 1 && (await seenBy(U.ED0)).length === 0 && (await seenBy(U.AOWN)).length === 0);
const vw = await J('comments.add', { type: 'project_task', id: T1, body: 'viewer here' }, U.VW);
const blind = await J('comments.add', { type: 'project_task', id: T1, body: 'no access' }, U.ED0);
const otherProject = await J('comments.add', { type: 'project_task', id: T2, body: 'x' }, U.ED2);
check('CO6', 'A read-only viewer cannot comment, and nobody can comment on a task they cannot open', vw.status !== 200 && blind.status !== 200 && otherProject.status !== 200);
const edited = await J('comments.edit', { id: c1.row?.id, body: 'Draft is ready (edited)' }, U.ED);
const notMine = await J('comments.edit', { id: c1.row?.id, body: 'hijack' }, U.ED2);
const notMineDel = await J('comments.delete', { id: c1.row?.id }, U.ED2);
const after = (await seenBy(U.ED))[0];
check('CO7', 'Only the author edits or removes a comment, and an edit is marked as edited', edited.status === 200 && notMine.status !== 200 && notMineDel.status !== 200 && after?.body === 'Draft is ready (edited)' && after?.edited_at);
const big = await J('comments.add', { type: 'project_task', id: T1, body: 'x'.repeat(10001) }, U.ED);
const empty = await J('comments.add', { type: 'project_task', id: T1, body: '   ' }, U.ED);
check('CO8', 'An empty comment or one over 10,000 characters is refused', big.status === 422 && empty.status === 422);

// ---- notifications
const inbox = async (u, org = L) => (await J('notifications.list', {}, u, org)).data ?? [];
const ed2 = await inbox(U.ED2);
check('CO9', 'A mention notifies the mentioned person, with the task\'s title and project read under their own access', ed2.some((n) => n.kind === 'mentioned' && n.entity_id === T1 && n.title === 'Build landing page' && n.project_name === 'One'));
check('CO10', 'Nobody is notified about a task they cannot open, and nobody by their own action', (await inbox(U.ED0)).length === 0 && (await inbox(U.AOWN, A)).length === 0 && !(await inbox(U.ED)).some((n) => n.kind === 'commented' || n.kind === 'mentioned'));
await J('tasks.update', { id: T1, assignee: U.ED2 }, U.ED);
await J('tasks.update', { id: T2, assignee: U.ED }, U.ED);      // assigning yourself tells nobody
check('CO11', 'Being assigned a task notifies the assignee (not when you assign yourself)', (await inbox(U.ED2)).some((n) => n.kind === 'assigned' && n.entity_id === T1) && !(await inbox(U.ED)).some((n) => n.kind === 'assigned'));
await J('comments.add', { type: 'project_task', id: T1, body: 'Checked, looks good' }, U.ED2);
check('CO12', 'A comment notifies the task\'s followers (its creator, assignee, earlier commenters), not its author', (await inbox(U.ED)).some((n) => n.kind === 'commented' && n.entity_id === T1) && !(await inbox(U.ED2)).some((n) => n.kind === 'commented'));
await J('tasks.update', { id: T1, status: 'done' }, U.ED2);
check('CO13', 'Completing a task notifies its followers', (await inbox(U.ED)).some((n) => n.kind === 'completed' && n.entity_id === T1));
const unread = await J('notifications.unread', {}, U.ED);
const first = (await inbox(U.ED))[0] ?? {};
await J('notifications.read', { ids: [first.id] }, U.ED);
const unread2 = await J('notifications.unread', {}, U.ED);
const steal = await J('notifications.read', { ids: [(await inbox(U.ED2))[0]?.id] }, U.ED);
check('CO14', 'The unread count drops when one is marked read; marking someone else\'s does nothing', unread.row?.n >= 2 && unread2.row?.n === unread.row?.n - 1 && steal.row?.n === 0 && (await inbox(U.ED2)).every((n) => !n.read_at));
await J('notifications.read', { all: true }, U.ED);
check('CO15', '"Mark all read" clears the unread count', (await J('notifications.unread', {}, U.ED)).row?.n === 0);
await asUser(U.ED2, { org: L });
const forged = await errCode(() => db.query("update notifications set kind='assigned', entity_id=$1 where user_id=$2", [T2, U.ED2]));
const planted = await errCode(() => db.query("insert into notifications (workspace_id,user_id,kind,entity_type,entity_id) values ($1,$2,'assigned','project_task',$3)", [L, U.ED, T1]));
check('CO16', 'A notification cannot be rewritten or planted for someone else, even with direct table access', forged !== 'no-error' && planted !== 'no-error');
// losing access to the project hides its notifications (pointers are re-checked on every read)
await asSuper(); await db.query('delete from access_assignments where principal_id=$1', [U.ED2]);
check('CO17', 'When a person loses access to a project, its notifications disappear from their list', (await inbox(U.ED2)).length === 0);
await assign(U.ED2, await lvl('Project member'), P1);

// ---- activity history
const act = (await J('activity.list', { type: 'project_task', id: T1 }, U.ED)).data ?? [];
const actions = act.map((a) => a.action);
check('CO18', 'The task\'s history lists each step in order (created, subtask added, commented, assigned, commented, done)',
  JSON.stringify(actions) === JSON.stringify(['created', 'subtask_added', 'commented', 'assigned', 'commented', 'status']) && act.at(-1)?.detail?.to === 'done', actions.join());
check('CO19', 'History never copies the task\'s notes or a comment\'s text', !JSON.stringify(act).includes('secret brief') && !JSON.stringify(act).includes('Checked, looks good'));
check('CO20', 'History is seen with the task and by no one else', ((await J('activity.list', { type: 'project_task', id: T1 }, U.ED0)).data ?? []).length === 0 && ((await J('activity.list', { type: 'project_task', id: T1 }, U.VW)).data ?? []).length === act.length);
await asUser(U.OWN, { org: L });
const rewrite = await errCode(() => db.query("update activity_events set action='created'"));
const wipe = await errCode(() => db.query('delete from activity_events'));
const fake = await errCode(() => db.query("insert into activity_events (workspace_id,entity_type,entity_id,action) values ($1,'project_task',$2,'created')", [L, T1]));
const again = (await J('activity.list', { type: 'project_task', id: T1 }, U.ED)).data ?? [];
check('CO21', 'History cannot be changed, removed or written by hand, even by an owner with direct table access', fake !== 'no-error' && JSON.stringify(again.map((a) => a.action)) === JSON.stringify(actions), [rewrite, wipe, fake].join());

// ---- following
const f0 = await J('follow.get', { type: 'project_task', id: T2 }, U.VW);
await J('follow.set', { type: 'project_task', id: T2, on: true }, U.VW);
const f1 = await J('follow.get', { type: 'project_task', id: T2 }, U.VW);
await J('follow.set', { type: 'project_task', id: T2, on: false }, U.VW);
const f2 = await J('follow.get', { type: 'project_task', id: T2 }, U.VW);
const blindFollow = await J('follow.set', { type: 'project_task', id: T2, on: true }, U.ED2);
check('CO22', 'You can follow and unfollow a task you can see, but not one you cannot', f0.row?.following === false && f1.row?.following === true && f2.row?.following === false && blindFollow.status !== 200);

// ---- organizations and clients stay apart
const TA = (await J('tasks.create', { project: PA, title: 'Aurj task' }, U.AOWN, A)).row?.id;
await J('comments.add', { type: 'project_task', id: TA, body: 'Aurj only', mentions: [U.BOTH] }, U.AOWN, A);
const bothL = await inbox(U.BOTH, L), bothA = await inbox(U.BOTH, A);
const crossRead = await J('comments.list', { type: 'project_task', id: TA }, U.BOTH, L);
const crossWrite = await J('comments.add', { type: 'project_task', id: TA, body: 'from L' }, U.BOTH, L);
check('CO23', 'A person in both organizations sees each organization\'s comments and notifications only while working in it', bothA.some((n) => n.entity_id === TA) && !bothL.some((n) => n.entity_id === TA)
  && (crossRead.data ?? []).length === 0 && crossWrite.status !== 200);
const client = await J('comments.list', { type: 'project_task', id: T1 }, U.CL1);
const clientInbox = await J('notifications.list', {}, U.CL1);
check('CO24', 'A client contact reaches none of it (comments are internal)', client.status !== 200 && clientInbox.status !== 200);

for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}${x.ok ? '' : `  [${x.detail ?? ''}]`}`);
const p = results.filter((x) => x.ok).length; console.log(`\n${p}/${results.length} checks passed`); await db.close(); process.exit(p === results.length ? 0 : 1);
