// P02 Tasks (migration 0059): the V8 acceptance items through the real API, as app_user under row rules. Layer2Funnels and Aurj never mix.
import { randomUUID as id } from 'node:crypto';
import { openDb, migrate, recorder } from './lib.mjs';
import { createApi } from '../packages/core/api.mjs';
import { createPgExecutor } from '../packages/core/pg-executor.mjs';
import { createRateLimiter } from '../packages/core/rate-limit.mjs';
import { createSafeLogger } from '../packages/core/safe-log.mjs';

const db = await openDb(); await migrate(db);
const { results, check } = recorder();
let chain = Promise.resolve();
const acquire = () => { const prev = chain; let release; chain = new Promise((r) => { release = r; }); return prev.then(() => ({ query: (s, p) => db.query(s, p), release })); };
const BIG = { read: { max: 1e6, windowMs: 6e4 }, write: { max: 1e6, windowMs: 6e4 }, sensitive: { max: 1e6, windowMs: 6e4 } };
const api = createApi({ executor: createPgExecutor({ acquire, role: 'app_user' }), logger: createSafeLogger(() => {}), limiter: createRateLimiter({ limits: BIG }) });
const J = async (op, input, u, org) => { const r = await api.handle({ operation: op, input, auth: { userId: u, email: 'x@example.com' }, headers: { 'x-org-id': org } }); return { status: r.status, rows: r.body?.data ?? [], row: r.body?.data?.[0] }; };

await db.exec('reset role');
const ORG = { L: id(), A: id() }; const U = { O: id(), AD: id(), E1: id(), E2: id(), E3: id(), E4: id(), AO: id() };
await db.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','L'),($2,'aurj','A')", [ORG.L, ORG.A]);
const staff = (u, ws, r) => db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff',$3)", [ws, u, r]);
await staff(U.O, ORG.L, 'owner'); await staff(U.AD, ORG.L, 'admin'); for (const u of [U.E1, U.E2, U.E3, U.E4]) await staff(u, ORG.L, 'editor'); await staff(U.AO, ORG.A, 'owner');
for (const ws of [ORG.L, ORG.A]) await db.query("insert into workspace_apps (workspace_id,app_key,enabled) values ($1,'tasks',true) on conflict (workspace_id,app_key) do update set enabled = true", [ws]);
for (const u of [U.E1, U.E2, U.E3, U.E4]) await db.query("insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,'tasks')", [ORG.L, u]);
const TODAY = new Date().toISOString().slice(0, 10);

// ---- My tasks exists for everyone, can't be deleted
const h1 = await J('tasks.home', {}, U.E1, ORG.L);
const mine = h1.row?.mine;
check('TK1', 'Everyone gets a personal "My tasks" list with two blocks on first use', h1.status === 200 && h1.row.lists.some((l) => l.id === mine && l.is_default && l.name === 'My tasks') && (await J('tasks.lists.get', { id: mine }, U.E1, ORG.L)).row.blocks.length === 2);
check('TK2', 'My tasks can’t be archived; someone else’s personal list is not found', (await J('tasks.lists.update', { id: mine, archived: true }, U.E1, ORG.L)).status >= 400 && (await J('tasks.lists.get', { id: mine }, U.E2, ORG.L)).row == null);

// ---- acceptance 1: completed tasks stay in place (the list returns them with done_at; the browser hides them)
const made = []; for (const t of ['A', 'B', 'C', 'D']) made.push((await J('tasks.items.create', { list: mine, title: t }, U.E1, ORG.L)).row);
for (const t of made.slice(0, 3)) await J('tasks.items.update', { id: t.id, done: true }, U.E1, ORG.L);
const lg = (await J('tasks.lists.get', { id: mine }, U.E1, ORG.L)).row;
check('TK3', 'Completing three tasks keeps them in their places (done, same order); one stays open', lg.items.map((x) => `${x.title}${x.done_at ? '✓' : ''}`).join() === 'A✓,B✓,C✓,D');
check('TK3b', 'Sidebar counts open tasks only', (await J('tasks.home', {}, U.E1, ORG.L)).row.lists.find((l) => l.id === mine).open === 1);

// ---- acceptance 4: team list with three people picked at once; a fourth gets nothing (404)
const team = (await J('tasks.lists.create', { name: 'Build team', space: 'team' }, U.E1, ORG.L)).row;
const acc = await J('tasks.access.set', { list: team.id, entries: [{ user: U.E2, level: 'edit' }, { user: U.E3, level: 'view' }, { user: U.AD, level: 'view' }] }, U.E1, ORG.L);
check('TK4', 'Manage access: three people at once, each Can edit or Can view', acc.rows.length === 3 && (await J('tasks.lists.get', { id: team.id }, U.E2, ORG.L)).row?.level === 'edit' && (await J('tasks.lists.get', { id: team.id }, U.E3, ORG.L)).row?.level === 'view');
check('TK5', 'A fourth person gets 404 on the list', (await J('tasks.lists.get', { id: team.id }, U.E4, ORG.L)).status === 404);
const tt = (await J('tasks.items.create', { list: team.id, title: 'Quiz scoring' }, U.E2, ORG.L)).row;
check('TK6', 'Can view cannot add or change tasks; Can edit can', !!tt && (await J('tasks.items.create', { list: team.id, title: 'x' }, U.E3, ORG.L)).status >= 400 && (await J('tasks.items.update', { id: tt.id, title: 'hack' }, U.E3, ORG.L)).row == null);
// folders pass access to lists inside
const fold = (await J('tasks.folders.create', { name: 'Clients', space: 'team' }, U.E1, ORG.L)).row;
const inF = (await J('tasks.lists.create', { name: 'Harry Kaye', space: 'team', folder: fold.id }, U.E1, ORG.L)).row;
await J('tasks.access.set', { folder: fold.id, entries: [{ user: U.E4, level: 'view' }] }, U.E1, ORG.L);
check('TK7', 'Access on a folder passes to the lists inside', (await J('tasks.lists.get', { id: inF.id }, U.E4, ORG.L)).row?.level === 'view');

// ---- acceptance 2: two assignees; both see it in Today; both notified
const g = (await J('tasks.items.create', { list: team.id, title: 'Record intro video', due_date: TODAY, assignees: [U.E2, U.E3] }, U.E1, ORG.L)).row;
const t2 = (await J('tasks.today', { today: TODAY }, U.E2, ORG.L)).rows.map((x) => x.id); const t3 = (await J('tasks.today', { today: TODAY }, U.E3, ORG.L)).rows.map((x) => x.id);
const notes = (await db.query("select user_id from notifications where app = 'tasks' and title = 'Record intro video'")).rows.map((r) => r.user_id).sort();
check('TK8', 'Two assignees: both see it in Today and both get a notification', g.assignees.length === 2 && t2.includes(g.id) && t3.includes(g.id) && notes.join() === [U.E2, U.E3].sort().join());
check('TK9', 'An assignee with view-only access can still tick their task', (await J('tasks.items.update', { id: g.id, done: true }, U.E3, ORG.L)).row?.done_at != null);
const gave = await J('tasks.gave', {}, U.E1, ORG.L);
check('TK10', 'Tasks I gave lists the task once per person', gave.rows.filter((x) => x.id === g.id).length === 2);

// ---- acceptance 5: private task — never to a manager, only the count
const pv = (await J('tasks.items.create', { list: mine, title: 'Doctor appointment', private: true }, U.E1, ORG.L)).row;
const person = await J('tasks.person', { user: U.E1 }, U.AD, ORG.L);
check('TK11', 'A private task never reaches an admin with "See teammates’ tasks" — only the count', !!pv && !person.row.items.some((x) => x.title === 'Doctor appointment') && person.row.private_count === 1 && person.row.items.some((x) => x.title === 'D'));
check('TK12', 'Private is for personal lists only', (await J('tasks.items.create', { list: team.id, title: 'secret', private: true }, U.E1, ORG.L)).status >= 400);


const pe = (await J('tasks.person', { user: U.E1 }, U.E2, ORG.L)).row;
check('TK13', 'Without "See teammates’ tasks" an editor sees none of a teammate’s personal lists (only shared team lists)', (await J('tasks.teammates', {}, U.E2, ORG.L)).row.can === false
  && !pe.items.some((x) => x.list_name === 'My tasks') && pe.items.every((x) => x.list_name === 'Build team' || x.kind === 'given'));
// ---- acceptance 3 (Tasks side): one running timer; completing stops it
const s1 = await J('tasks.timer.start', { item: made[3].id }, U.E1, ORG.L);
const s2 = await J('tasks.timer.start', { item: tt.id }, U.E1, ORG.L);
check('TK14', 'Starting a second timer stops the first: one running timer per person', s1.status === 200 && s2.status === 200 && (await J('timer.running', {}, U.E1, ORG.L)).row?.title === 'Quiz scoring'
  && (await db.query('select count(*)::int n from task_time_entries where user_id = $1 and ended_at is null', [U.E1])).rows[0].n === 1);
await J('tasks.items.update', { id: tt.id, done: true }, U.E1, ORG.L);
check('TK15', 'Completing a task with a running timer stops it and logs the entry', (await J('timer.running', {}, U.E1, ORG.L)).row == null && (await db.query('select count(*)::int n from task_time_entries where user_id = $1 and ended_at is not null', [U.E1])).rows[0].n === 2);

// ---- Inbox, sub-tasks, move
const cap = (await J('tasks.items.create', { title: 'Idea: quiz for Aurj parents' }, U.E1, ORG.L)).row;
check('TK16', 'A capture without a list lands in the Inbox; "Move to list" files it', (await J('tasks.inbox', {}, U.E1, ORG.L)).rows.some((x) => x.id === cap.id) && (await J('tasks.items.update', { id: cap.id, list: mine }, U.E1, ORG.L)).row?.list_id === mine && !(await J('tasks.inbox', {}, U.E1, ORG.L)).rows.some((x) => x.id === cap.id));
const sub = (await J('tasks.items.create', { list: mine, parent: made[3].id, title: 'sub' }, U.E1, ORG.L)).row;
await J('tasks.items.update', { id: made[3].id, list: team.id }, U.E1, ORG.L);
check('TK17', 'Sub-tasks nest and move with their parent', (await db.query('select list_id from task_items where id = $1', [sub.id])).rows[0].list_id === team.id);

// ---- isolation
check('TK18', 'Aurj sees none of Layer2Funnels’ lists or tasks', !(await J('tasks.home', {}, U.AO, ORG.A)).row.lists.some((l) => [mine, team.id].includes(l.id)) && (await J('tasks.lists.get', { id: team.id }, U.AO, ORG.A)).status === 404
  && (await J('tasks.items.update', { id: tt.id, title: 'x' }, U.AO, ORG.A)).row == null);
check('TK19', 'Access can only be given to people in the same organization', (await J('tasks.access.set', { list: team.id, entries: [{ user: U.AO, level: 'edit' }] }, U.E1, ORG.L)).status >= 400);

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id.padEnd(5)} ${r.name}${r.ok ? '' : `  ${r.detail ?? ''}`}`);
const pc = results.filter((r) => r.ok).length; console.log(`\n${pc}/${results.length} checks passed`); await db.close(); process.exit(pc === results.length ? 0 : 1);
