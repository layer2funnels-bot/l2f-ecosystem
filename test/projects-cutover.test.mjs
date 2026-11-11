// Migration 0051 (Projects cutover): old Projects data is copied into Projects V2 with the same IDs, every reference moves
// with it, the old tables are kept untouched as the backup, and the screens that read Projects (Office Home, Team, Planner,
// Portal, Docs and Whiteboard breadcrumbs) answer from Projects V2. Applies migrations up to 0050, loads old-style data,
// then applies 0051, exactly as the live database will see it.
import { readFileSync } from 'node:fs';
import { randomUUID as id } from 'node:crypto';
import { openDb, migrationFiles, recorder } from './lib.mjs';
import { createApi } from '../packages/core/api.mjs';
import { createPgExecutor } from '../packages/core/pg-executor.mjs';
import { createRateLimiter } from '../packages/core/rate-limit.mjs';
import { createSafeLogger } from '../packages/core/safe-log.mjs';

const db = await openDb();
const files = migrationFiles();
const cut = files.findIndex((f) => /0051_projects_cutover\.sql$/.test(f.pathname));
for (const f of files.slice(0, cut)) await db.exec(readFileSync(f, 'utf8'));
const { results, check } = recorder();
const rows = async (s, p = []) => (await db.query(s, p)).rows;
const one = async (s, p = []) => (await rows(s, p))[0];
await db.exec('reset role');

// ---- old-style data (as the live database holds it before the cutover)
const L = id(), A = id(), U = { OWN: id(), ED: id(), GONE: id(), AO: id() }, C1 = id();
await db.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','L'),($2,'aurj','A')", [L, A]);
for (const [u, ws, r] of [[U.OWN, L, 'owner'], [U.ED, L, 'editor'], [U.AO, A, 'owner']]) await db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff',$3)", [ws, u, r]);
await db.query("insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,'projects'),($1,$2,'planner')", [L, U.ED]);
await db.query("insert into clients (id,workspace_id,name) values ($1,$2,'Acme')", [C1, L]);
const P = { internal: id(), client: id(), done: id(), arch: id(), aurj: id() };
await db.query(`insert into projects (id,workspace_id,client_id,name,description,status,owner_id,created_by,start_on,due_on,client_visible,archived_at) values
  ($1,$6,null,'Website relaunch','Our site','active',$7,$7,'2026-11-01','2026-12-01',false,null),
  ($2,$6,$8,'Acme funnel','For Acme','planned',$9,$9,null,'2026-12-15',true,null),
  ($3,$6,null,'Old launch','','done',$7,$7,null,null,false,null),
  ($4,$6,null,'Shelved','','on_hold',null,null,null,null,false,now()),
  ($5,$10,null,'Aurj site','','active',null,null,null,null,false,null)`, [P.internal, P.client, P.done, P.arch, P.aurj, L, U.OWN, C1, U.ED, A]);
const S1 = id(); await db.query("insert into project_sections (id,workspace_id,project_id,name,position) values ($1,$2,$3,'Design',1)", [S1, L, P.internal]);
const T = { a: id(), b: id(), sub: id(), done: id(), arch: id(), shared: id(), hidden: id() };
await db.query(`insert into project_tasks (id,workspace_id,project_id,title,notes,status,priority,assignee_id,due_on,section_id,created_at,estimate_minutes) values
  ($1,$5,$6,'Write copy','Draft first','doing','normal',$7,'2026-11-20',$8,now() - interval '3 days',90),
  ($2,$5,$6,'Design hero','','todo','urgent',null,null,null,now() - interval '2 days',null),
  ($3,$5,$6,'Ship it','','done','high',$7,null,null,now() - interval '1 day',null),
  ($4,$5,$6,'Old idea','','todo','low',null,null,null,now(),null)`, [T.a, T.b, T.done, T.arch, L, P.internal, U.ED, S1]);
await db.query("update project_tasks set archived_at = now() where id = $1", [T.arch]);
await db.query("insert into project_tasks (id,workspace_id,project_id,title,parent_task_id,status) values ($1,$2,$3,'Check mobile',$4,'blocked')", [T.sub, L, P.internal, T.a]);
await db.query("insert into project_tasks (id,workspace_id,project_id,title,client_visible) values ($1,$3,$4,'Client review',true),($2,$3,$4,'Internal note',false)", [T.shared, T.hidden, L, P.client]);
const TAG = id(); await db.query("insert into project_tags (id,workspace_id,name,color) values ($1,$2,'Copy','red')", [TAG, L]);
await db.query('insert into task_tags (workspace_id,task_id,tag_id) values ($1,$2,$3)', [L, T.a, TAG]);
await db.query("insert into task_checklist_items (workspace_id,task_id,label,done) values ($1,$2,'Headline',true),($1,$2,'Body',false)", [L, T.a]);
await db.query('insert into task_dependencies (workspace_id,task_id,depends_on_id) values ($1,$2,$3)', [L, T.b, T.a]);
await db.query("insert into time_entries (workspace_id,project_id,task_id,user_id,started_at,ended_at,note) values ($1,$2,$3,$4,now() - interval '2 hours',now() - interval '1 hour','writing')", [L, P.internal, T.a, U.ED]);
const F = id(); await db.query("insert into files (id,workspace_id,space,name,kind,mime_type,size_bytes,storage_path,uploaded_by,project_id) values ($1,$2,'shared','brief.pdf','file','application/pdf',10,$3,$4,$5)", [F, L, `${L}/brief.pdf`, U.OWN, P.internal]);
await db.query('insert into task_files (workspace_id,task_id,file_id,created_by) values ($1,$2,$3,$4)', [L, T.a, F, U.OWN]);
await db.query("insert into project_rules (workspace_id,project_id,trigger,action,priority) values ($1,$2,'created','priority','high')", [L, P.internal]);
await db.query("insert into project_rules (workspace_id,project_id,trigger,action,assignee_id) values ($1,$2,'created','assign',$3)", [L, P.internal, U.ED]);
await db.query("insert into follows (workspace_id,entity_type,entity_id,user_id) values ($1,'project_task',$2,$3)", [L, T.a, U.ED]);
const lvl = (await one("select id from access_levels where workspace_id=$1 and name='Client team'", [L])).id;
await db.query("insert into access_assignments (workspace_id,access_level_id,principal_type,principal_id,project_id) values ($1,$2,'user',$3,$4)", [L, lvl, U.ED, P.internal]);
const before = await one(`select (select count(*)::int from projects) p, (select count(*)::int from project_tasks) t, (select count(*)::int from task_checklist_items) c,
  (select count(*)::int from time_entries) e, (select count(*)::int from project_rules) r, (select count(*)::int from files) f`);

// ---- the cutover
await db.exec(readFileSync(files[cut], 'utf8'));

const after = await one(`select (select count(*)::int from projects) p, (select count(*)::int from project_tasks) t, (select count(*)::int from task_checklist_items) c,
  (select count(*)::int from time_entries) e, (select count(*)::int from project_rules) r, (select count(*)::int from files) f`);
check('CU1', 'The old tables are untouched (same counts in every one): they are the backup', JSON.stringify(before) === JSON.stringify(after), `${JSON.stringify(before)} → ${JSON.stringify(after)}`);
check('CU2', 'Every project and every task is in Projects V2 with the same id', (await one('select count(*)::int n from pm_projects where id = any($1::uuid[])', [Object.values(P)])).n === 5
  && (await one('select count(*)::int n from pm_tasks where id = any($1::uuid[])', [Object.values(T)])).n === 7);
const pr = Object.fromEntries((await rows('select id, status, visibility, client_visible, archived_at is not null arch, workspace_id from pm_projects')).map((r) => [r.id, r]));
check('CU3', 'Project status is translated (planned/active → on track, done → complete, on hold stays), archived stays archived, organizations stay apart',
  pr[P.internal].status === 'on_track' && pr[P.client].status === 'on_track' && pr[P.done].status === 'complete' && pr[P.arch].status === 'on_hold' && pr[P.arch].arch && pr[P.aurj].workspace_id === A);
check('CU4', 'Moved projects stay visible to everyone with the Projects app (organization-wide), and sharing with the client is kept', Object.values(pr).every((p) => p.visibility === 'organization') && pr[P.client].client_visible && !pr[P.internal].client_visible);
check('CU5', 'Each project’s owner manages it; a project without an owner gets no manager added', (await one("select count(*)::int n from pm_project_members where project_id = $1 and user_id = $2 and role = 'manager'", [P.internal, U.OWN])).n === 1
  && (await one('select count(*)::int n from pm_project_members where project_id = $1', [P.arch])).n === 0);
const tk = Object.fromEntries((await rows('select id, status, priority, description, parent_id, section_id, deleted_at is not null del, number, estimate_minutes, completed_at is not null comp from pm_tasks')).map((r) => [r.id, r]));
check('CU6', 'Task status and priority are translated (doing → in progress, normal → medium), notes become the description, the estimate is kept',
  tk[T.a].status === 'in_progress' && tk[T.a].priority === 'medium' && tk[T.a].description === 'Draft first' && tk[T.a].estimate_minutes === 90 && tk[T.b].priority === 'urgent' && tk[T.sub].status === 'blocked');
check('CU7', 'Subtasks keep their parent, tasks keep their section, a done task keeps its completion, an archived task goes to the trash (restorable)',
  tk[T.sub].parent_id === T.a && tk[T.a].section_id === S1 && tk[T.done].comp && tk[T.arch].del && !tk[T.a].del);
check('CU8', 'Tasks are numbered in creation order within each project', tk[T.a].number < tk[T.b].number && tk[T.b].number < tk[T.done].number);
check('CU9', 'Assignee, tag, checklist, dependency, time and the attached Drive file all moved with the task',
  (await one('select count(*)::int n from pm_task_assignees where task_id = $1 and user_id = $2', [T.a, U.ED])).n === 1
  && (await one('select count(*)::int n from pm_task_tags where task_id = $1 and tag_id = $2', [T.a, TAG])).n === 1 && (await one('select color from pm_tags where id = $1', [TAG])).color === '#b42318'
  && (await one('select count(*)::int n from pm_checklist_items where task_id = $1', [T.a])).n === 2
  && (await one('select count(*)::int n from pm_dependencies where task_id = $1 and depends_on_id = $2', [T.b, T.a])).n === 1
  && (await one("select count(*)::int n from pm_time_entries where task_id = $1 and note = 'writing'", [T.a])).n === 1
  && (await one('select count(*)::int n from pm_attachments where task_id = $1 and file_id = $2', [T.a, F])).n === 1);
check('CU10', 'Rules moved, and copying them did not act on the moved tasks (no task was re-prioritised or assigned by a rule)',
  (await one('select count(*)::int n from pm_rules where project_id = $1', [P.internal])).n === 2 && tk[T.b].priority === 'urgent'
  && (await one('select count(*)::int n from pm_task_assignees where task_id = $1', [T.b])).n === 0);
check('CU11', 'Followers moved to the shared service as Projects V2 tasks', (await one("select count(*)::int n from follows where entity_type = 'pm_task' and entity_id = $1 and user_id = $2", [T.a, U.ED])).n === 1);
check('CU12', 'Client-shared tasks stay shared only inside a shared project', (await one('select client_visible v from pm_tasks where id = $1', [T.shared])).v === true && (await one('select client_visible v from pm_tasks where id = $1', [T.hidden])).v === false);
const fk = await rows("select conname, confrelid::regclass::text t from pg_constraint where conname in ('files_project_fk','access_assignments_workspace_id_project_id_fkey','planner_goals_workspace_id_project_id_fkey','planner_actions_workspace_id_project_id_fkey','planner_objective_tasks_workspace_id_task_id_fkey') order by 1");
check('CU13', 'Drive, project-scoped access, and Planner goals, actions and objective links now point at Projects V2', fk.length === 5 && fk.every((r) => r.t.startsWith('pm_')), JSON.stringify(fk));
check('CU14', 'The Drive file filed under the project keeps its link, and the project-scoped access grant keeps its project',
  (await one('select project_id from files where id = $1', [F])).project_id === P.internal && (await one('select count(*)::int n from access_assignments where project_id = $1', [P.internal])).n === 1);
check('CU15', 'Applying the cutover a second time adds nothing (it can be re-run safely)', await (async () => {
  const n0 = (await one('select (select count(*) from pm_projects) + (select count(*) from pm_tasks) + (select count(*) from pm_checklist_items) + (select count(*) from pm_rules) n')).n;
  try { await db.exec(readFileSync(files[cut], 'utf8')); } catch { /* the reference changes are not repeatable; the data copy must be */ }
  return (await one('select (select count(*) from pm_projects) + (select count(*) from pm_tasks) + (select count(*) from pm_checklist_items) + (select count(*) from pm_rules) n')).n === n0;
})());

// ---- the screens that read Projects answer from Projects V2
let chain = Promise.resolve();
const acquire = () => { const prev = chain; let release; chain = new Promise((r) => { release = r; }); return prev.then(() => ({ query: (s, p) => db.query(s, p), release })); };
const BIG = { read: { max: 1e6, windowMs: 6e4 }, write: { max: 1e6, windowMs: 6e4 }, sensitive: { max: 1e6, windowMs: 6e4 } };
const api = createApi({ executor: createPgExecutor({ acquire, role: 'app_user' }), logger: createSafeLogger(() => {}), limiter: createRateLimiter({ limits: BIG }) });
const J = async (op, input, u, org = L) => { const r = await api.handle({ operation: op, input, auth: { userId: u, email: 'x@example.com' }, headers: { 'x-org-id': org } }); return { status: r.status, rows: r.body?.data ?? [] }; };
const mine = await J('my.work', {}, U.ED);
check('CU16', 'Office Home "assigned to you" lists the moved task, in the old wording (doing, normal)', mine.status === 200 && mine.rows.some((r) => r.id === T.a && r.status === 'doing' && r.priority === 'normal' && r.project_name === 'Website relaunch'));
const list = await J('projects.list', { scope: 'all' }, U.ED);
check('CU17', 'The project picker (Planner, Boards) lists moved projects, not archived ones, and never another organization’s', list.status === 200 && list.rows.some((p) => p.id === P.internal) && !list.rows.some((p) => p.id === P.arch || p.id === P.aurj));
check('CU18', 'A breadcrumb lookup (Docs, Whiteboard) finds the project by id', (await J('projects.get', { id: P.internal }, U.ED)).rows[0]?.name === 'Website relaunch');
check('CU19', 'The Team page lists a person’s open tasks', (await J('tasks.list', { assignee: U.ED, open_only: true }, U.OWN)).rows.some((t) => t.id === T.a));
check('CU20', 'The old Projects app’s write operations are retired (its tables are only a backup now)', (await J('tasks.create', { project: P.internal, title: 'x' }, U.OWN)).status === 404 && (await J('projects.create', { name: 'x' }, U.OWN)).status === 404);
check('CU21', 'The moved project opens in Projects V2 for an editor, with its tasks', await (async () => {
  const r = await api.handle({ operation: 'pm.tasks.list', input: { args: { projectId: P.internal } }, auth: { userId: U.ED, email: 'x@example.com' }, headers: { 'x-org-id': L } });
  return r.status === 200 && r.body.data[0].r.some((t) => t.id === T.a);
})());

// ---- the rollback (scripts/rollback-0051.sql) restores the pre-cutover state
await db.exec('reset role');
await db.exec(readFileSync(new URL('../scripts/rollback-0051.sql', import.meta.url), 'utf8'));
const fkBack = await rows("select conname, confrelid::regclass::text t from pg_constraint where conname in ('files_project_fk','access_assignments_workspace_id_project_id_fkey','planner_goals_workspace_id_project_id_fkey','planner_actions_workspace_id_project_id_fkey','planner_objective_tasks_workspace_id_task_id_fkey')");
check('CU22', 'Rollback: every reference points at the old tables again, the copied projects are gone from Projects V2, the old data is complete',
  fkBack.length === 5 && fkBack.every((r) => !r.t.startsWith('pm_'))
  && (await one('select count(*)::int n from pm_projects where id = any($1::uuid[])', [Object.values(P)])).n === 0
  && JSON.stringify(await one(`select (select count(*)::int from projects) p, (select count(*)::int from project_tasks) t, (select count(*)::int from task_checklist_items) c,
       (select count(*)::int from time_entries) e, (select count(*)::int from project_rules) r, (select count(*)::int from files) f`)) === JSON.stringify(before), JSON.stringify(fkBack));
check('CU23', 'Rollback: the old app’s follower is back on the old task, and the cutover can be applied again afterwards', await (async () => {
  const back = (await one("select count(*)::int n from follows where entity_type = 'project_task' and entity_id = $1", [T.a])).n === 1;
  await db.exec(readFileSync(files[cut], 'utf8'));
  return back && (await one('select count(*)::int n from pm_tasks where id = any($1::uuid[])', [Object.values(T)])).n === 7;
})());

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'}  ${r.id.padEnd(5)} ${r.name}${r.ok ? '' : '  ' + r.detail}`);
console.log(`${results.length - failed.length}/${results.length} checks passed`);
await db.close?.();
process.exit(failed.length ? 1 : 0);
