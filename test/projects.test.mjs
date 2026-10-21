// Projects data layer and API (migration 0013): projects, tasks, checklist items, time, my work. Allow + deny per role and scope
// (organization, one client, one project), client visibility, isolation, audit without long text, archive before delete,
// server-clock timers. Through the real database, and through the API layer for the operations.
import { randomUUID as id } from 'node:crypto';
import { openDb, migrate, session, recorder } from './lib.mjs';
import { createApi } from '../packages/core/api.mjs';
import { createPgExecutor } from '../packages/core/pg-executor.mjs';
import { createRateLimiter } from '../packages/core/rate-limit.mjs';
import { createSafeLogger } from '../packages/core/safe-log.mjs';

const db = await openDb(); await migrate(db);
const rawQuery = db.query.bind(db); db.query = async (s, p) => { try { return await rawQuery(s, p); } catch (e) { e.message += `   [SQL: ${String(s).slice(0, 110).replace(/\s+/g, ' ')}]`; throw e; } };
const { asUser, asSuper } = session(db); const { results, check, errCode } = recorder();
const rows = async (s, p = []) => (await db.query(s, p)).rows;
const affected = async (s, p = []) => (await db.query(s, p)).affectedRows;

let chain = Promise.resolve();
const acquire = () => { const prev = chain; let release; chain = new Promise((r) => { release = r; }); return prev.then(() => ({ query: (s, p) => db.query(s, p), release })); };
const BIG = { read: { max: 1e6, windowMs: 6e4 }, write: { max: 1e6, windowMs: 6e4 }, sensitive: { max: 1e6, windowMs: 6e4 } };
const api = createApi({ executor: createPgExecutor({ acquire, role: 'app_user' }), logger: createSafeLogger(() => {}), limiter: createRateLimiter({ limits: BIG }) });
const call = (op, input, user, org = L) => api.handle({ operation: op, input, auth: { userId: user, email: 'x@example.com' }, headers: { 'x-org-id': org } });

await asSuper();
const L = id(), A = id();
const U = { OWN: id(), ADM: id(), ED: id(), ED2: id(), ED0: id(), VW: id(), NOAPP: id(), AOWN: id(), CL1: id(), BOTH: id() };
await db.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','L'),($2,'aurj','A')", [L, A]);
const staff = (u, ws, r) => db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff',$3)", [ws, u, r]);
await staff(U.OWN, L, 'owner'); await staff(U.ADM, L, 'admin'); await staff(U.ED, L, 'editor'); await staff(U.ED2, L, 'editor'); await staff(U.ED0, L, 'editor'); await staff(U.VW, L, 'viewer');
await staff(U.NOAPP, L, 'editor'); await staff(U.AOWN, A, 'owner'); await staff(U.BOTH, L, 'owner'); await staff(U.BOTH, A, 'owner');
for (const u of [U.ED, U.ED2, U.ED0, U.VW]) await db.query("insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,'projects')", [L, u]);
const lvl = async (name, ws = L) => (await rows('select id from access_levels where workspace_id=$1 and name=$2', [ws, name]))[0].id;
const assign = (u, level, { client = null, project = null } = {}) => db.query("insert into access_assignments (workspace_id,access_level_id,principal_type,principal_id,client_id,project_id) values ($1,$2,'user',$3,$4,$5)", [L, level, u, client, project]);
const C1 = id(), C2 = id();
await db.query("insert into clients (id,workspace_id,name) values ($1,$3,'Client One'),($2,$3,'Client Two')", [C1, C2, L]);
await db.query("insert into memberships (workspace_id,user_id,kind,client_id) values ($1,$2,'client',$3)", [L, U.CL1, C1]);
const P1 = id(), P2 = id(), P3 = id(), PA = id();
await db.query("insert into projects (id,workspace_id,client_id,name) values ($1,$5,$6,'One'),($2,$5,$7,'Two'),($3,$5,null,'Internal'),($4,$8,null,'Aurj project')", [P1, P2, P3, PA, L, C1, C2, A]);
await assign(U.ED, await lvl('All projects · edit'));
await assign(U.VW, await lvl('All projects · read'));
await assign(U.ED2, await lvl('Project member'), { project: P1 });

// ---- A. projects
await asSuper();
check('PJ1', 'Every project starts planned, with a creation time, and the new columns exist', (await rows("select status, created_at is not null as ok from projects where id=$1", [P1]))[0].status === 'planned');
await asUser(U.ED);
const mine = (await db.query("insert into projects (workspace_id,client_id,name,owner_id,description) values ($1,$2,'Edited by editor',$3,'d') returning id, created_by", [L, C1, U.ED2])).rows[0];
check('PJ2', 'An editor with “All projects · edit” creates a project; the author is the signed-in person and the owner can be set', mine.created_by === U.ED && (await affected("update projects set status='active', due_on='2030-01-01' where id=$1", [mine.id])) === 1);
check('PJ3', 'The owner must be a staff member of this organization: a client contact is refused, a person from another organization cannot be named',
  (await errCode(() => db.query("update projects set owner_id=$2 where id=$1", [mine.id, U.CL1]))) === 'P0001' && (await errCode(() => db.query("update projects set owner_id=$2 where id=$1", [mine.id, U.AOWN]))) === 'P0001');
check('PJ4', 'A due date before the start date is refused; a project cannot change client or organization', (await errCode(() => db.query("update projects set start_on='2030-02-01', due_on='2030-01-01' where id=$1", [mine.id]))) === '23514'
  && (await errCode(() => db.query("update projects set client_id=$2 where id=$1", [mine.id, C2]))) === 'P0001' && (await errCode(() => db.query("update projects set workspace_id=$2 where id=$1", [mine.id, A]))) !== 'no-error');
await asUser(U.VW);
check('PJ5', 'A viewer with “All projects · read” sees every project and can change nothing', (await rows('select id from projects')).length >= 4 && (await affected("update projects set name='x' where id=$1", [P1])) === 0
  && (await errCode(() => db.query("insert into projects (workspace_id,name) values ($1,'x')", [L]))) === '42501');
await asUser(U.ED2);
check('PJ6', 'A person with “Project member” on one project sees that project and no other, and cannot create projects', (await rows('select id from projects')).map((r) => r.id).join() === P1
  && (await errCode(() => db.query("insert into projects (workspace_id,name) values ($1,'x')", [L]))) === '42501');
await asUser(U.ED0);
check('PJ7', 'An editor with no level sees no project (the starting point is the level, not the role)', (await rows('select id from projects')).length === 0);
await asUser(U.NOAPP);
check('PJ8', 'An editor without the Projects app sees nothing', (await rows('select id from projects')).length === 0);
await asUser(U.AOWN);
check('PJ9', 'Another organization sees none of it and cannot write into this one', (await rows('select id from projects where workspace_id=$1', [L])).length === 0
  && (await errCode(() => db.query("insert into project_tasks (workspace_id,project_id,title) values ($1,$2,'x')", [L, P1]))) !== 'no-error');

await asSuper();
const TA = (await db.query("insert into project_tasks (workspace_id,project_id,title) values ($1,$2,'Aurj task') returning id", [A, PA])).rows[0].id;
await db.query("insert into time_entries (workspace_id,project_id,user_id,started_at,ended_at) values ($1,$2,$3,now() - interval '2 hours', now() - interval '1 hour')", [A, PA, U.BOTH]);
await asUser(U.BOTH, { org: A });
const bothA = { p: (await rows('select id from projects')).map((r) => r.id).join(), t: (await rows('select id from project_tasks')).map((r) => r.id).join(), e: (await rows('select id from time_entries')).length };
await asUser(U.BOTH, { org: L });
const bothL = { p: (await rows('select id from projects')).map((r) => r.id), t: (await rows('select id from project_tasks')).map((r) => r.id), e: (await rows('select id from time_entries')).length };
check('PJ10', 'A person in two organizations sees only the organization the request names (x-org-id), for projects, tasks and time',
  bothA.p === PA && bothA.t === TA && bothA.e === 1 && bothL.p.length >= 3 && !bothL.p.includes(PA) && !bothL.t.includes(TA) && bothL.e === 0);

// ---- B. tasks
await asSuper(); await db.query("update workspace_apps set enabled=true where workspace_id=$1 and app_key='portal'", [L]);   // the client's contact sees shared work only while the Portal is on
await asUser(U.ED2);
const t1 = (await db.query("insert into project_tasks (workspace_id,project_id,client_id,title,notes) values ($1,$2,$3,'First task','SECRET-NOTE') returning id, client_id, created_by", [L, P1, C2])).rows[0];
check('PT1', 'A project member adds a task; the client always comes from the project, whatever the caller sends', t1.client_id === C1 && t1.created_by === U.ED2);
check('PT2', 'The same person cannot add or read tasks in another project', (await errCode(() => db.query("insert into project_tasks (workspace_id,project_id,title) values ($1,$2,'x')", [L, P2]))) === '42501' && (await rows('select id from project_tasks')).map((r) => r.id).join() === t1.id);
await asSuper(); const t2 = (await db.query("insert into project_tasks (workspace_id,project_id,title) values ($1,$2,'Other task') returning id", [L, P2])).rows[0].id;
const t3 = (await db.query("insert into project_tasks (workspace_id,project_id,title) values ($1,$2,'Internal task') returning id", [L, P3])).rows[0].id;
await asUser(U.ED);
check('PT3', 'An editor with “All projects · edit” works on every project’s tasks', (await rows('select id from project_tasks')).length >= 3 && (await affected("update project_tasks set status='doing', priority='high' where id=$1", [t2])) === 1);
check('PT4', 'Done sets the completion time in the database, and reopening clears it', (await affected("update project_tasks set status='done' where id=$1", [t2])) === 1 && (await rows('select completed_at from project_tasks where id=$1', [t2]))[0].completed_at !== null
  && (await affected("update project_tasks set status='todo' where id=$1", [t2])) === 1 && (await rows('select completed_at from project_tasks where id=$1', [t2]))[0].completed_at === null);
check('PT5', 'The assignee must be a staff member here: a client contact is refused, a person from another organization cannot be named',
  (await errCode(() => db.query("update project_tasks set assignee_id=$2 where id=$1", [t2, U.CL1]))) === 'P0001' && (await errCode(() => db.query("update project_tasks set assignee_id=$2 where id=$1", [t2, U.AOWN]))) === 'P0001'
  && (await affected("update project_tasks set assignee_id=$2, due_on='2030-05-05' where id=$1", [t2, U.ED2])) === 1);
check('PT6', 'A task cannot move to another project or organization', (await errCode(() => db.query("update project_tasks set project_id=$2 where id=$1", [t2, P1]))) === 'P0001'
  && (await errCode(() => db.query("insert into project_tasks (workspace_id,project_id,title) values ($1,$2,'x')", [A, P1]))) !== 'no-error');
check('PT7', 'Sharing a task with the client needs projects.record.share (an editor level does not carry it); a task of a project with no client cannot be shared at all',
  (await errCode(() => db.query("update project_tasks set client_visible=true where id=$1", [t1.id]))) === '42501');
await asUser(U.ADM);
check('PT8', 'An admin shares a task; a task in a project with no client is refused', (await affected("update project_tasks set client_visible=true where id=$1", [t1.id])) === 1
  && (await errCode(() => db.query("update project_tasks set client_visible=true where id=$1", [t3]))) === 'P0001');
await asUser(U.CL1);
const seen = (await rows('select id, title from project_tasks')).map((r) => r.id); const seenT = (await rows('select id from time_entries')).length; const seenC = (await rows('select id from task_checklist_items')).length;
const hacked = await affected("update project_tasks set title='hacked' where id=$1", [t1.id]);
check('PT9', 'The client’s contact sees only shared, unarchived tasks of their own client, and no project internals (no time, no checklist), and cannot change them',
  seen.join() === t1.id && seenT === 0 && seenC === 0 && hacked === 0, JSON.stringify({ seen, seenT, seenC, hacked }));
await asUser(U.ADM); await db.query("update project_tasks set archived_at=now() where id=$1", [t1.id]);
await asUser(U.CL1);
check('PT10', 'Archiving hides the task from the client at once', (await rows('select id from project_tasks')).length === 0);
await asUser(U.ADM); await db.query("update project_tasks set archived_at=null where id=$1", [t1.id]);
await asUser(U.VW);
check('PT11', 'A viewer reads tasks and cannot add or change them', (await rows('select id from project_tasks')).length >= 3 && (await errCode(() => db.query("insert into project_tasks (workspace_id,project_id,title) values ($1,$2,'x')", [L, P1]))) === '42501'
  && (await affected("update project_tasks set title='x' where id=$1", [t1.id])) === 0);

// ---- C. checklist
await asUser(U.ED2);
const c1 = (await db.query("insert into task_checklist_items (workspace_id,task_id,label) values ($1,$2,'Write copy') returning id, project_id, client_id", [L, t1.id])).rows[0];
check('CL1', 'Checklist items follow their task: added by someone who may edit it, project and client copied from the task', c1.project_id === P1 && c1.client_id === C1 && (await affected("update task_checklist_items set done=true where id=$1", [c1.id])) === 1);
check('CL2', 'An item cannot be added to a task the person cannot edit', (await errCode(() => db.query("insert into task_checklist_items (workspace_id,task_id,label) values ($1,$2,'x')", [L, t2]))) === '42501');
await asUser(U.VW);
check('CL3', 'A viewer sees items and cannot add, change or remove them', (await rows('select id from task_checklist_items')).length === 1 && (await errCode(() => db.query("insert into task_checklist_items (workspace_id,task_id,label) values ($1,$2,'x')", [L, t1.id]))) === '42501'
  && (await affected("delete from task_checklist_items where id=$1", [c1.id])) === 0);
await asUser(U.AOWN);
check('CL4', 'Another organization cannot see or add items', (await rows('select id from task_checklist_items')).length === 0 && (await errCode(() => db.query("insert into task_checklist_items (workspace_id,task_id,label) values ($1,$2,'x')", [A, t1.id]))) !== 'no-error');
await asUser(U.ED2);
check('CL5', 'Items are removed directly (they are part of the task); the removal is audited', (await affected("delete from task_checklist_items where id=$1", [c1.id])) === 1);

// ---- D. time
await asUser(U.ED2);
const r1 = (await db.query("insert into time_entries (workspace_id,project_id,task_id,user_id,started_at,note) values ($1,$2,$3,$4,'2000-01-01T00:00:00Z','SECRET-TIME-NOTE') returning id, started_at, client_id", [L, P1, t1.id, U.ED2])).rows[0];
check('TM1', 'Starting a timer uses the server clock: a start time sent by the caller is ignored; the client comes from the project', Math.abs(Date.now() - new Date(r1.started_at).getTime()) < 15000 && r1.client_id === C1);
check('TM2', 'A person can run only one timer at a time', (await errCode(() => db.query("insert into time_entries (workspace_id,project_id,user_id) values ($1,$2,$3)", [L, P1, U.ED2]))) === '23505');
await asUser(U.ED); const edTimer = (await db.query("insert into time_entries (workspace_id,project_id,user_id) values ($1,$2,$3) returning id", [L, P1, U.ED])).rows[0].id;
await asUser(U.ED2);
check('TM3', 'Nobody can stop or change someone else’s timer without projects.time.edit', (await affected("update time_entries set ended_at=now() where id=$1", [edTimer])) === 0);
const stopped = (await db.query("update time_entries set ended_at = now() + interval '5 hours' where id=$1 returning started_at, ended_at", [r1.id])).rows[0];
check('TM4', 'Stopping your own timer sets the stop time from the server clock, whatever time is sent', new Date(stopped.ended_at).getTime() <= Date.now() + 1000 && new Date(stopped.ended_at) > new Date(stopped.started_at));
check('TM5', 'A finished entry cannot be edited by its author without projects.time.edit', (await affected("update time_entries set note='x' where id=$1", [r1.id])) === 0 || (await errCode(() => db.query("update time_entries set started_at = started_at - interval '1 hour' where id=$1", [r1.id]))) !== 'no-error');
check('TM6', 'Time cannot be logged for the future, or for longer than 24 hours, or for someone else without projects.time.edit',
  (await errCode(() => db.query("insert into time_entries (workspace_id,project_id,user_id,started_at,ended_at) values ($1,$2,$3,now() + interval '2 days', now() + interval '2 days 1 hour')", [L, P1, U.ED2]))) === 'P0001'
  && (await errCode(() => db.query("insert into time_entries (workspace_id,project_id,user_id,started_at,ended_at) values ($1,$2,$3,now() - interval '3 days', now() - interval '1 day')", [L, P1, U.ED2]))) === '23514'
  && (await errCode(() => db.query("insert into time_entries (workspace_id,project_id,user_id,started_at,ended_at) values ($1,$2,$3,now() - interval '3 hours', now() - interval '2 hours')", [L, P1, U.ED]))) === '42501'
  && (await affected("insert into time_entries (workspace_id,project_id,user_id,started_at,ended_at) values ($1,$2,$3,now() - interval '3 hours', now() - interval '2 hours')", [L, P1, U.ED2])) === 1);
check('TM7', 'A task from another project cannot be attached to an entry', (await errCode(() => db.query("insert into time_entries (workspace_id,project_id,task_id,user_id,started_at,ended_at) values ($1,$2,$3,$4,now() - interval '9 hours', now() - interval '8 hours')", [L, P1, t2, U.ED2]))) === 'P0001');
check('TM8', 'You always see your own entries', (await rows('select id from time_entries')).length >= 2);
await asUser(U.ED);
check('TM9', 'An editor with projects.time.edit sees everyone’s time, logs for others, changes and archives entries', (await rows('select id from time_entries')).length >= 3
  && (await affected("insert into time_entries (workspace_id,project_id,user_id,started_at,ended_at) values ($1,$2,$3,now() - interval '6 hours', now() - interval '5 hours')", [L, P1, U.ED2])) === 1
  && (await affected("update time_entries set note='fixed', billable=false where id=$1", [r1.id])) === 1 && (await affected("update time_entries set archived_at=now() where id=$1", [r1.id])) === 1);
await asUser(U.ED0);
check('TM10', 'Someone with no level on the project sees no time at all', (await rows('select id from time_entries')).length === 0);
await asUser(U.CL1);
check('TM11', 'A client contact never sees time, whatever is shared', (await rows('select id from time_entries')).length === 0);
await asUser(U.ADM);
check('TM12', 'Time is deleted only by an owner by default: an admin removes nothing', (await affected("delete from time_entries where id=$1", [edTimer])) === 0 && (await affected("delete from time_entries where id=$1", [r1.id])) === 0);
await asUser(U.OWN);
check('TM13', 'An owner deletes an archived entry; an active one is refused', (await affected("delete from time_entries where id=$1", [r1.id])) === 1 && (await errCode(() => db.query("delete from time_entries where id=$1", [edTimer]))) === 'P0001');

// ---- E. archive before delete, deletion rules
check('DL1', 'A task is deleted only after archiving, and only by an owner by default', (await errCode(() => db.query("delete from project_tasks where id=$1", [t3]))) === 'P0001');
await db.query("update project_tasks set archived_at=now() where id=$1", [t3]);
await asUser(U.ADM);
check('DL2', 'An admin cannot delete even an archived task', (await affected("delete from project_tasks where id=$1", [t3])) === 0);
await asUser(U.OWN);
check('DL3', 'An owner deletes an archived task', (await affected("delete from project_tasks where id=$1", [t3])) === 1);
check('DL4', 'A project that holds tasks or time cannot be deleted, archived or not', (await errCode(() => db.query("delete from projects where id=$1", [P1]))) === 'P0001');
const empty = (await db.query("insert into projects (workspace_id,name) values ($1,'Empty') returning id", [L])).rows[0].id;
check('DL5', 'An empty project is deleted only after archiving', (await errCode(() => db.query("delete from projects where id=$1", [empty]))) === 'P0001' && (await affected("update projects set archived_at=now() where id=$1", [empty])) === 1 && (await affected("delete from projects where id=$1", [empty])) === 1);
await asSuper();
check('DL6', 'A client that has a project cannot be deleted either', (await errCode(() => db.query("delete from clients where id=$1", [C2]))) === 'P0001');

// ---- F. audit: who did what, never the text
const au = JSON.stringify(await rows("select action, detail, actor_id from audit_events where action like 'project_tasks.%' or action like 'time_entries.%' or action like 'projects.%' or action like 'task_checklist_items.%'"));
check('AU1', 'Task, project, time and checklist changes are audited with the actor, and no notes or time notes appear in the trail', au.includes('project_tasks.update') && au.includes('time_entries.insert') && au.includes('projects.update') && au.includes('task_checklist_items.delete') && !/SECRET-NOTE|SECRET-TIME-NOTE/.test(au) && au.includes(U.ED2));

// ---- G. starter levels
await asSuper();
check('LV1', 'The starter levels carry the new permissions, including for organizations created later', (await rows("select count(*)::int n from access_level_permissions p join access_levels l on l.id=p.access_level_id where l.workspace_id=$1 and l.name='Project member' and p.permission_key in ('projects.task.edit','projects.time.create')", [L]))[0].n === 2
  && await (async () => { const N = id(); await db.query("insert into workspaces (id,slug,name) values ($1,'new-org','N')", [N]); return (await rows("select count(*)::int n from access_level_permissions p join access_levels l on l.id=p.access_level_id where l.workspace_id=$1 and l.name='All projects · read' and p.permission_key in ('projects.task.view','projects.time.view')", [N]))[0].n === 2; })());

// ---- H. through the API
const J = async (op, input, u, org) => { const r = await call(op, input, u, org); if (process.env.DEBUG_J) console.log('J', op, r.status, JSON.stringify(r.body).slice(0, 220)); return { ...r, data: r.body?.data, row: r.body?.data?.[0], code: r.body?.error?.code }; };   // single operations answer with a one-row list: `row` is that row
let r = await J('projects.create', { name: 'API project', client: C1, owner: U.ED2, due_on: '2031-01-01' }, U.ED);
const AP = r.row?.id;
check('PA1', 'projects.create returns the project with its task counts; the organization comes from the header only', r.status === 200 && r.row.name === 'API project' && r.row.tasks_total === 0 && r.row.owner_id === U.ED2);
r = await J('tasks.create', { project: AP, title: 'API task', assignee: U.ED2, due_on: '2000-01-01', priority: 'urgent' }, U.ED);
const AT = r.row?.id;
check('PA2', 'tasks.create returns the task', r.status === 200 && r.row.priority === 'urgent' && r.row.client_id === C1);
r = await J('tasks.update', { id: AT, status: 'doing' }, U.ED);
check('PA3', 'tasks.update changes only what is sent', r.row.status === 'doing' && r.row.title === 'API task');
r = await J('tasks.update', { id: AT, clear_assignee: true, clear_due: true }, U.ED);
check('PA4', 'clear_assignee and clear_due remove the values', r.row.assignee_id === null && r.row.due_on === null);
await J('tasks.update', { id: AT, assignee: U.ED2, due_on: '2000-01-01' }, U.ED);
await J('projects.update', { id: P1, status: 'active' }, U.ED);
await asSuper(); await db.query("update project_tasks set assignee_id=$1, due_on = current_date - 1, status='todo' where id=$2", [U.ED, t1.id]); await db.query("update project_tasks set assignee_id=$1, due_on = current_date + 2 where id=$2", [U.ED, AT]);
await db.query("update projects set due_on = current_date + 5 where id=$1", [AP]);
r = await J('my.work', {}, U.ED);
check('PA5', 'my.work lists the caller’s open tasks across projects they may see, overdue ones flagged, soonest first', r.status === 200 && r.data.length === 2 && r.data[0].id === t1.id && r.data[0].overdue === true && r.data[1].overdue === false && r.data[0].project_name === 'One');
r = await J('my.work', {}, U.ED0);
check('PA6', 'my.work shows nothing for someone with no access, even if tasks are assigned to them', r.data.length === 0);
r = await J('projects.deadlines', { days: 30 }, U.ED);
check('PA7', 'projects.deadlines lists tasks and projects due soon', r.data.some((d) => d.kind === 'task' && d.id === AT) && r.data.some((d) => d.kind === 'project' && d.id === AP));
r = await J('time.start', { project: P1, task: t1.id, note: 'start' }, U.ED2);
check('PA8', 'time.start starts a timer for the caller', r.status === 200 && r.row.user_id === U.ED2 && r.row.ended_at === null);
r = await J('time.running', {}, U.ED2);
check('PA9', 'time.running returns it', r.data.length === 1 && r.data[0].project_id === P1);
r = await J('time.start', { project: P1 }, U.ED2);
check('PA10', 'a second timer is refused with the contract’s conflict answer', r.status === 409 && r.code === 'conflict');
r = await J('time.stop', { note: 'done' }, U.ED2);
check('PA11', 'time.stop stops it with the server clock and keeps the note', r.status === 200 && r.row.ended_at !== null && r.row.note === 'done');
r = await J('time.log', { project: P1, started_at: '2020-01-01T09:00:00Z', ended_at: '2020-01-01T10:30:00Z', note: 'back then' }, U.ED2);
check('PA12', 'time.log records a finished entry for yourself', r.status === 200 && r.row.user_id === U.ED2);
r = await J('time.log', { project: P1, user: U.ED, started_at: '2020-01-02T09:00:00Z', ended_at: '2020-01-02T10:00:00Z' }, U.ED2);
check('PA13', 'logging time for someone else without projects.time.edit reads as not found', r.status === 404 && r.code === 'not_found');
r = await J('time.summary', { project: P1, from: '2019-12-31', to: '2020-01-31' }, U.ED);
check('PA14', 'time.summary totals seconds per person for a period', r.data.length === 1 && r.data[0].seconds === 5400);
r = await J('time.log', { project: P1, started_at: 'tomorrow', ended_at: 'later' }, U.ED2);
check('PA15', 'a timestamp that is not ISO 8601 is refused before the database sees it', r.status === 422 && r.code === 'invalid');
r = await J('checklist.add', { task: AT, label: 'Step one' }, U.ED); const CI = r.row?.id;
await J('checklist.update', { id: CI, done: true }, U.ED); r = await J('tasks.get', { id: AT }, U.ED);
check('PA16', 'checklist items count toward the task (1 of 1 done)', r.row.checklist_total === 1 && r.row.checklist_done === 1);
r = await J('tasks.get', { id: AT }, U.AOWN, A);
check('PA17', 'another organization asking for the same id gets “not found”, not a hint', r.status === 404 && r.code === 'not_found');
r = await J('tasks.delete', { id: AT }, U.OWN);
check('PA18', 'deleting an active task is refused (archive first)', r.status !== 200);
r = await J('projects.list', { client: C1 }, U.ED); const list1 = r.data;
check('PA19', 'projects.list filters by client and shows counts', list1.every((p) => p.client_id === C1) && list1.find((p) => p.id === AP).tasks_total === 1);
r = await J('projects.share', { id: AP, visible: true }, U.ED);
check('PA20', 'sharing a project without projects.record.share reads as not found', r.status === 404);
r = await J('projects.share', { id: AP, visible: true }, U.ADM);
check('PA21', 'an admin shares the project', r.status === 200 && r.row.client_visible === true);
r = await J('projects.overview', {}, U.ED);
check('PA22', 'projects.overview counts projects by status', Array.isArray(r.data) && r.data.some((x) => x.status === 'active'));

for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}${x.ok ? '' : `  [${x.detail ?? ''}]`}`);
const p = results.filter((x) => x.ok).length; console.log(`\n${p}/${results.length} checks passed`); await db.close(); process.exit(p === results.length ? 0 : 1);
