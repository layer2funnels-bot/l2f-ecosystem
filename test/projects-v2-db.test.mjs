// Projects V2 (migration 0048), straight against the database as each person: the row rules hold even if the API had a bug.
// Ports the V2 package's isolation tests (V1-V9) and adds the ecosystem rules: app grant, client accounts, e-mail privacy,
// browser roles, share with client, rules (automations) and the audit trail.
import { randomUUID as id } from 'node:crypto';
import { openDb, migrate, session, recorder } from './lib.mjs';

const db = await openDb(); await migrate(db);
const { asUser, asSuper } = session(db); const { results, check, errCode } = recorder();
const rows = async (s, p = []) => (await db.query(s, p)).rows;

await asSuper();
const L = id(), A = id();
const U = { OWN: id(), ADM: id(), ED: id(), ED2: id(), VW: id(), NOAPP: id(), BOTH: id(), AED: id(), CLI: id() };
await db.query("insert into workspaces (id, slug, name) values ($1, 'layer2funnels', 'Layer2Funnels'), ($2, 'aurj', 'Aurj')", [L, A]);
const CL = id(); await db.query("insert into clients (id, workspace_id, name) values ($1, $2, 'Northwind Dental')", [CL, L]);
const staff = (u, ws, r) => db.query("insert into memberships (workspace_id, user_id, kind, role) values ($1, $2, 'staff', $3)", [ws, u, r]);
await staff(U.OWN, L, 'owner'); await staff(U.ADM, L, 'admin'); await staff(U.ED, L, 'editor'); await staff(U.ED2, L, 'editor');
await staff(U.VW, L, 'viewer'); await staff(U.NOAPP, L, 'editor'); await staff(U.BOTH, L, 'editor'); await staff(U.BOTH, A, 'owner'); await staff(U.AED, A, 'editor');
await db.query("insert into memberships (workspace_id, user_id, kind, client_id) values ($1, $2, 'client', $3)", [L, U.CLI, CL]);
for (const [u, n] of Object.entries(U)) await db.query('insert into profiles (id, display_name, email) values ($1, $2, $3) on conflict (id) do update set display_name = excluded.display_name, email = excluded.email', [n, u, `${u.toLowerCase()}@example.test`]);
for (const ws of [L, A]) await db.query("insert into workspace_apps (workspace_id, app_key, enabled) values ($1, 'projects', true) on conflict (workspace_id, app_key) do update set enabled = true", [ws]);
for (const [ws, u] of [[L, U.ED], [L, U.ED2], [L, U.VW], [L, U.BOTH], [A, U.AED], [L, U.CLI]]) await db.query("insert into app_grants (workspace_id, user_id, app_key) values ($1, $2, 'projects') on conflict do nothing", [ws, u]);

const as = (u, ws = L) => asUser(u, { org: ws });
const create = async (u, name, { client = null, template = false, personal = false, ws = L } = {}) => { await as(u, ws); const pid = id(); await db.query('select pm.create_project($1, $2, $3, $4, $5)', [pid, name, client, template, personal]); return pid; };
const visible = async (u, ws = L) => { await as(u, ws); return (await rows('select id from pm_projects')).map((r) => r.id); };
const task = async (u, pid, title, extra = {}) => { await as(u); return (await rows(`insert into pm_tasks (workspace_id, project_id, title, status, priority, section_id) values (pm.org(), $1, $2, $3, $4, $5) returning id`, [pid, title, extra.status ?? 'todo', extra.priority ?? 'none', extra.section ?? null]))[0].id; };

// ---- projects and who sees them
const P_CLIENT = await create(U.OWN, 'Patient funnel', { client: CL });
const P_INT = await create(U.ADM, 'Website refresh');
await as(U.ADM); await db.query("update pm_projects set visibility = 'organization' where id = $1", [P_INT]);
const P_OWN_PERSONAL = await create(U.OWN, 'Owner to-dos', { personal: true });
const P_ADM_PERSONAL = await create(U.ADM, 'My Q4 goals', { personal: true });
const P_AURJ = await create(U.BOTH, 'Aurj hiring', { ws: A });
const ownSees = await visible(U.OWN);
check('V1', 'An owner sees every shared project of the organization plus only their own personal one',
  [P_CLIENT, P_INT, P_OWN_PERSONAL].every((p) => ownSees.includes(p)) && !ownSees.includes(P_ADM_PERSONAL) && !ownSees.includes(P_AURJ));
check('V2', 'Personal projects are private even from the organization owner and admins', !(await visible(U.ADM)).includes(P_OWN_PERSONAL) && !(await visible(U.OWN)).includes(P_ADM_PERSONAL));
const bothL = await visible(U.BOTH, L), bothA = await visible(U.BOTH, A);
check('V3', 'A person in both organizations sees only the active one', bothA.includes(P_AURJ) && !bothA.includes(P_INT) && !bothL.includes(P_AURJ));
check('V4', 'Naming an organization you do not belong to, or a malformed one, shows nothing', (await visible(U.ED, A)).length === 0 && (await visible(U.ED, 'not-a-uuid')).length === 0);
await as(U.OWN); await db.query("insert into pm_project_members (workspace_id, project_id, user_id, role) values (pm.org(), $1, $2, 'editor'), (pm.org(), $1, $3, 'viewer')", [P_CLIENT, U.ED, U.VW]);
const edSees = await visible(U.ED);
check('V5', 'An editor sees projects they are a member of and organization-wide ones, nothing else', edSees.includes(P_CLIENT) && edSees.includes(P_INT) && !(await visible(U.ED2)).includes(P_CLIENT));
const T1 = await task(U.ED, P_CLIENT, 'Write the offer page');
await as(U.VW); const vwUpd = await errCode(() => db.query("update pm_tasks set title = 'hacked' where id = $1", [T1]));
check('V6', 'A viewer can read a task but not change it', (await rows('select id from pm_tasks where id = $1', [T1])).length === 1 && (await rows('select title from pm_tasks where id = $1', [T1]))[0].title === 'Write the offer page');
await as(U.AED, A); const crossIns = await errCode(() => db.query("insert into pm_tasks (workspace_id, project_id, title) values ($1, $2, 'x')", [L, P_CLIENT]));
check('V7', 'Nobody can insert a task into another organization', crossIns !== 'no-error');
await as(U.VW); const vwCreate = await errCode(() => db.query('select pm.create_project($1, $2, null, false, false)', [id(), 'Viewer project']));
await as(U.ED); const pidEd = id(); await db.query('select pm.create_project($1, $2, null, false, false)', [pidEd, 'Editor project']);
const edRole = (await rows('select pm.project_role($1) r', [pidEd]))[0].r;
check('V8', 'An editor creates a project and is its manager at once; a viewer cannot create one', vwCreate === '42501' && edRole === 'manager');
const Ta = await task(U.ED, P_CLIENT, 'A'), Tb = await task(U.ED, P_CLIENT, 'B');
await as(U.ED); await db.query('insert into pm_dependencies (task_id, depends_on_id) values ($1, $2)', [Ta, Tb]);
const cycle = await errCode(() => db.query('insert into pm_dependencies (task_id, depends_on_id) values ($1, $2)', [Tb, Ta]));
check('V9', 'A circular "waiting on" is refused', cycle === '23514');
// a child row (checklist item) takes its organization and project from its task, never from what the caller sends
await as(U.ED);
const spoofCk = await errCode(() => db.query("insert into pm_checklist_items (workspace_id, project_id, task_id, label) values ($1, $2, $3, 'spoofed')", [L, P_INT, T1]));
await asSuper();
const ck = (await rows("select c.project_id, t.project_id as task_project from pm_checklist_items c join pm_tasks t on t.id = c.task_id where c.label = 'spoofed'"))[0];
check('V10', 'A checklist item takes its project from its task: naming another project is ignored (or refused), never stored', spoofCk !== 'no-error' || (ck && ck.project_id === ck.task_project));

// ---- ecosystem rules
check('E1', 'Without the Projects app grant an editor sees no project at all', (await visible(U.NOAPP)).length === 0);
await as(U.NOAPP); const noAppCreate = await errCode(() => db.query('select pm.create_project($1, $2, null, false, false)', [id(), 'x']));
check('E2', 'Without the app grant nobody can create a project', noAppCreate === '42501');
check('E3', 'A client (portal) account gets nothing from Projects V2', (await visible(U.CLI)).length === 0 && (await (async () => { await as(U.CLI); return rows('select id from pm_people'); })()).length === 0);
await as(U.ED); const edPeople = await rows('select id, email from pm_people');
await as(U.ADM); const admPeople = await rows('select id, email from pm_people');
check('E4', 'E-mail addresses: an editor sees only their own, admins see everyone\'s; people from the other organization never appear',
  edPeople.filter((p) => p.email).map((p) => p.id).join() === U.ED && admPeople.every((p) => p.email) && !edPeople.some((p) => p.id === U.AED));
await asSuper();
const browserGrants = await rows("select count(*)::int n from information_schema.role_table_grants where grantee in ('anon','authenticated') and (table_name like 'pm\\_%' or table_name in ('pm_people','pm_members','pm_clients'))");
const browserFns = await rows("select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'pm' and (has_function_privilege('public', p.oid, 'execute'))");
check('E5', 'Browser roles and PUBLIC have no access to any Projects V2 table, view or function', browserGrants[0].n === 0 && browserFns[0].n === 0);
const notForced = await rows("select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'pm\\_%' and (not c.relforcerowsecurity or not exists (select 1 from pg_policies p where p.tablename = c.relname and p.policyname = 'org_scope'))");
check('E6', 'Every Projects V2 table has forced row security and the organization-scope policy', notForced.length === 0, notForced.map((r) => r.relname).join());

// ---- share with client
await as(U.ED); await db.query('update pm_projects set client_visible = true where id = $1', [P_CLIENT]);   // a project editor: the row rules let nothing change
const edNoChange = (await (async () => { await as(U.OWN); return rows('select client_visible v from pm_projects where id = $1', [P_CLIENT]); })())[0].v === false;
await as(U.OWN); await db.query("update pm_project_members set role = 'manager' where project_id = $1 and user_id = $2", [P_CLIENT, U.ED]);
await as(U.ED); const edShare = await errCode(() => db.query('update pm_projects set client_visible = true where id = $1', [P_CLIENT]));   // a manager without the ecosystem share permission
await as(U.OWN); await db.query("update pm_project_members set role = 'editor' where project_id = $1 and user_id = $2", [P_CLIENT, U.ED]);
await as(U.OWN); const intShare = await errCode(() => db.query('update pm_projects set client_visible = true where id = $1', [P_INT]));
const taskFirst = await errCode(() => db.query('update pm_tasks set client_visible = true where id = $1', [T1]));
await db.query('update pm_projects set client_visible = true where id = $1', [P_CLIENT]);
await db.query('update pm_tasks set client_visible = true where id = $1', [T1]);
check('S1', 'Sharing with a client needs the share permission, a client project, and the project shared before its tasks', ((globalThis.__s1 = [edNoChange, edShare, intShare, taskFirst])) && edNoChange &&
  edShare === '42501' && intShare !== 'no-error' && taskFirst === '23514' && (await rows('select client_visible v from pm_tasks where id = $1', [T1]))[0].v === true, JSON.stringify(globalThis.__s1));
await db.query('update pm_projects set client_visible = false where id = $1', [P_CLIENT]);
check('S2', 'Unsharing a project unshares its tasks', (await rows('select client_visible v from pm_tasks where id = $1', [T1]))[0].v === false);

// ---- rules
await as(U.OWN);
const SEC = (await rows("insert into pm_sections (workspace_id, project_id, name) values (pm.org(), $1, 'Review') returning id", [P_CLIENT]))[0].id;
const TAG = (await rows("insert into pm_tags (workspace_id, name) values (pm.org(), 'Needs review') returning id"))[0].id;
const rule = (o) => rows(`insert into pm_rules (project_id, trigger, trigger_status, trigger_section, action, assignee_id, priority, due_in_days, tag_id) values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
  [P_CLIENT, o.trigger, o.status ?? null, o.section ?? null, o.action, o.assignee ?? null, o.priority ?? null, o.days ?? null, o.tag ?? null]);
await rule({ trigger: 'created', action: 'priority', priority: 'high' });
const R_ASSIGN = (await rule({ trigger: 'status', status: 'in_progress', action: 'assign', assignee: U.ED }))[0].id;
await rule({ trigger: 'section', section: SEC, action: 'tag', tag: TAG });
await rule({ trigger: 'status', status: 'blocked', action: 'due_in', days: 2 });
await as(U.ED); const edRule = await errCode(() => db.query("insert into pm_rules (project_id, trigger, action, priority) values ($1, 'created', 'priority', 'low')", [P_CLIENT]));
check('R1', 'Only a project manager adds rules (an editor member cannot)', edRule !== 'no-error');
const RT = await task(U.ED, P_CLIENT, 'Rule target');
const rt = async () => { await as(U.OWN); return (await rows('select priority, due_on::text due, (select array_agg(user_id) from pm_task_assignees a where a.task_id = t.id) who, (select array_agg(tag_id) from pm_task_tags g where g.task_id = t.id) tags from pm_tasks t where id = $1', [RT]))[0]; };
check('R2', 'When a task is added, the rule fills its empty priority', (await rt()).priority === 'high');
const chosen = await task(U.ED, P_CLIENT, 'Chosen', { priority: 'low' });
check('R3', 'On creation a rule never overrides what the person chose', (await rows('select priority from pm_tasks where id = $1', [chosen]))[0].priority === 'low');
await as(U.ED); await db.query("update pm_tasks set status = 'in_progress' where id = $1", [RT]);
check('R4', 'Moving to a status runs its rule (assigned)', (await rt()).who?.includes(U.ED));
await as(U.ED); await db.query('update pm_tasks set section_id = $2 where id = $1', [RT, SEC]);
check('R5', 'Moving into a section runs its rule (tagged)', (await rt()).tags?.includes(TAG));
await as(U.ED); await db.query("update pm_tasks set status = 'blocked' where id = $1", [RT]);
const want = (await rows("select (current_date + 2)::text d"))[0].d;
check('R6', 'A rule sets the due date N days from today', (await rt()).due === want);
await as(U.OWN); await db.query('update pm_rules set enabled = false where id = $1', [R_ASSIGN]);
const paused = await task(U.ED, P_CLIENT, 'Paused');
await as(U.ED); await db.query("update pm_tasks set status = 'in_progress' where id = $1", [paused]);
await as(U.OWN);
check('R7', 'A paused rule does nothing', (await rows('select count(*)::int n from pm_task_assignees where task_id = $1', [paused]))[0].n === 0);
const other = await task(U.ADM, P_INT, 'Other project');
check('R8', 'Rules never touch another project\'s tasks', (await rows('select priority from pm_tasks where id = $1', [other]))[0].priority === 'none');
await as(U.OWN); await db.query("insert into pm_rules (project_id, trigger, action, assignee_id) values ($1, 'created', 'assign', $2)", [P_CLIENT, U.VW]);
await as(U.ED); await db.query('begin');
const withOwn = (await rows("insert into pm_tasks (workspace_id, project_id, title) values (pm.org(), $1, 'Has an assignee') returning id", [P_CLIENT]))[0].id;
await db.query('insert into pm_task_assignees (task_id, user_id) values ($1, $2)', [withOwn, U.ED]);
await db.query('commit');
const empty = await task(U.ED, P_CLIENT, 'Nobody chosen');
await as(U.OWN);
const whoOwn = (await rows('select array_agg(user_id) w from pm_task_assignees where task_id = $1', [withOwn]))[0].w, whoEmpty = (await rows('select array_agg(user_id) w from pm_task_assignees where task_id = $1', [empty]))[0].w;
check('R9', '"When added, assign" fills only a task nobody was assigned to (checked when the change is saved)', whoOwn.length === 1 && whoOwn[0] === U.ED && whoEmpty?.includes(U.VW));
await as(U.OWN); await db.query('delete from pm_sections where id = $1', [SEC]);
check('R10', 'Deleting a section removes the rules that watched it', (await rows("select count(*)::int n from pm_rules where trigger = 'section'"))[0].n === 0);

// ---- audit
await asSuper();
check('AU1', 'Creating a project and changing its sharing are written to the ecosystem audit trail',
  (await rows("select count(*)::int n from audit_events where subject_type = 'pm_projects' and subject_id = $1", [P_CLIENT]))[0].n >= 3);

for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}${x.ok ? '' : `  [${x.detail ?? ''}]`}`);
const p = results.filter((x) => x.ok).length; console.log(`\n${p}/${results.length} checks passed`); await db.close(); process.exit(p === results.length ? 0 : 1);
