// Projects R2 (migration 0035): sections inside a project, organization tags on tasks, changing many tasks at once, and Drive files
// attached to a task (the file stays in Drive, in the project's own place; the task only points at it). Through the API and the database.
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
const J = async (op, input, user, org = L) => { await asSuper(); const r = await api.handle({ operation: op, input, auth: { userId: user, email: 'x@example.com' }, headers: { 'x-org-id': org } }); return { status: r.status, data: r.body?.data ?? [], row: r.body?.data?.[0], code: r.body?.error?.code }; };

await asSuper();
const L = id(), A = id();
const U = { OWN: id(), ED: id(), ED2: id(), VW: id(), AOWN: id() };
await db.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','L'),($2,'aurj','A')", [L, A]);
const staff = (u, ws, r) => db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff',$3)", [ws, u, r]);
await staff(U.OWN, L, 'owner'); await staff(U.ED, L, 'editor'); await staff(U.ED2, L, 'editor'); await staff(U.VW, L, 'viewer'); await staff(U.AOWN, A, 'owner');
for (const u of [U.ED, U.ED2, U.VW]) await db.query("insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,'projects'),($1,$2,'drive')", [L, u]);
const lvl = async (name) => (await rows('select id from access_levels where workspace_id=$1 and name=$2', [L, name]))[0].id;
const assign = (u, level, project = null) => db.query("insert into access_assignments (workspace_id,access_level_id,principal_type,principal_id,project_id) values ($1,$2,'user',$3,$4)", [L, level, u, project]);
const P1 = id(), P2 = id(), PA = id();
await db.query("insert into projects (id,workspace_id,name) values ($1,$4,'One'),($2,$4,'Two'),($3,$5,'Aurj')", [P1, P2, PA, L, A]);
await assign(U.ED, await lvl('All projects · edit')); await assign(U.VW, await lvl('All projects · read')); await assign(U.ED2, await lvl('Project member'), P1);
const task = async (project, title, u = U.ED, extra = {}) => (await J('tasks.create', { project, title, ...extra }, u)).row?.id;

// ---- sections
const s1 = await J('sections.create', { project: P1, name: 'Design' }, U.ED);
const s2 = await J('sections.create', { project: P1, name: 'Build' }, U.ED);
const sv = await J('sections.create', { project: P1, name: 'Viewer section' }, U.VW);
check('OR1', 'A person who edits tasks adds sections to a project, in order; a read-only viewer cannot', s1.status === 200 && s2.status === 200 && sv.status !== 200
  && (await J('sections.list', { project: P1 }, U.VW)).data.map((s) => s.name).join() === 'Design,Build');
const T1 = await task(P1, 'Wireframes', U.ED, { section: s1.row?.id });
const T2 = await task(P1, 'Homepage', U.ED, { section: s2.row?.id });
const wrongSection = await J('tasks.create', { project: P2, title: 'x', section: s1.row?.id }, U.ED);
check('OR2', 'A task is filed in a section of its own project, never of another', (await J('tasks.get', { id: T1 }, U.ED)).row?.section_id === s1.row?.id && wrongSection.status !== 200);
await J('sections.update', { id: s2.row?.id, name: 'Development', position: 0 }, U.ED);
await J('sections.update', { id: s1.row?.id, position: 1 }, U.ED);
check('OR3', 'Sections can be renamed and reordered', (await J('sections.list', { project: P1 }, U.ED)).data.map((s) => s.name).join() === 'Development,Design');
await J('sections.delete', { id: s1.row?.id }, U.ED);
check('OR4', 'Removing a section keeps its tasks (they move to "No section")', (await J('tasks.get', { id: T1 }, U.ED)).row?.section_id === null && (await J('sections.list', { project: P1 }, U.ED)).data.length === 1);
check('OR5', 'A project\'s sections are seen only by people who can open the project', (await J('sections.list', { project: P2 }, U.ED2)).data.length === 0 && (await J('sections.list', { project: P1 }, U.AOWN, A)).data.length === 0);

// ---- tags
const tg = await J('tasks.tags.add', { task: T1, name: 'Urgent client' }, U.ED);
await J('tasks.tags.add', { task: T2, name: 'urgent client' }, U.ED);       // same tag, any capitals
await J('tasks.tags.add', { task: T2, name: 'SEO' }, U.ED);
const t2 = (await J('tasks.get', { id: T2 }, U.ED)).row;
check('OR6', 'Tags are added by name; the same name (any capitals) is the same organization tag', tg.status === 200 && t2?.tags?.length === 2 && t2.tags.some((t) => t.id === tg.row?.id)
  && (await J('tags.list', {}, U.ED)).data.map((t) => t.name).sort().join() === 'SEO,Urgent client');
const vwTag = await J('tasks.tags.add', { task: T1, name: 'viewer' }, U.VW);
const blindTag = await J('tasks.tags.add', { task: await task(P2, 'Other project'), name: 'x' }, U.ED2);
check('OR7', 'Tagging needs the right to edit that task (a viewer, or someone outside the project, cannot)', vwTag.status !== 200 && blindTag.status !== 200);
await J('tasks.tags.remove', { task: T2, tag: tg.row?.id }, U.ED);
check('OR8', 'A tag comes off a task without touching the others', (await J('tasks.get', { id: T2 }, U.ED)).row?.tags?.map((t) => t.name).join() === 'SEO' && (await J('tasks.get', { id: T1 }, U.ED)).row?.tags?.length === 1);
check('OR9', 'Another organization sees none of these tags', (await J('tags.list', {}, U.AOWN, A)).data.length === 0);
const bad = await J('tasks.tags.add', { task: T1, name: ' '.repeat(3) }, U.ED);
check('OR10', 'A blank tag name is refused', bad.status === 422);

// ---- many tasks at once
const T3 = await task(P1, 'Copy'); const TB = await task(P2, 'Two-only task');
const bulk = await J('tasks.bulk', { ids: [T1, T2, T3], status: 'doing', assignee: U.ED2, due_on: '2030-05-01', priority: 'high' }, U.ED);
const after = (await J('tasks.list', { project: P1 }, U.ED)).data.filter((t) => [T1, T2, T3].includes(t.id));
check('OR11', 'Several tasks change at once (status, assignee, due date, priority), and the answer says how many', bulk.row?.n === 3 && after.every((t) => t.status === 'doing' && t.assignee_id === U.ED2 && t.due_on === '2030-05-01' && t.priority === 'high'));
const mixed = await J('tasks.bulk', { ids: [T1, TB], priority: 'urgent' }, U.ED2);
check('OR12', 'A bulk change only touches the tasks the person may edit (the rest are left alone)', mixed.row?.n === 1 && (await J('tasks.get', { id: TB }, U.ED)).row?.priority === 'normal');
const arch = await J('tasks.bulk', { ids: [T3], archive: true }, U.ED);
check('OR13', 'Bulk archive works the same way', arch.row?.n === 1 && (await J('tasks.get', { id: T3 }, U.ED)).row?.archived_at);
const tooMany = await J('tasks.bulk', { ids: Array.from({ length: 201 }, () => id()), priority: 'low' }, U.ED);
check('OR14', 'At most 200 tasks change in one go', tooMany.status === 422);

// ---- Drive files attached to a task
await asSuper();
const F1 = (await rows("insert into files (workspace_id,space,name,kind,project_id,managed_by,uploaded_by,storage_path,size_bytes) values ($1,'shared','Brief.pdf','document',$2,'projects',$3,null,0) returning id", [L, P1, U.OWN]))[0].id;
const F2 = (await rows("insert into files (workspace_id,space,name,kind,project_id,managed_by,uploaded_by,storage_path,size_bytes) values ($1,'shared','Other.pdf','document',$2,'projects',$3,null,0) returning id", [L, P2, U.OWN]))[0].id;
const at = await J('tasks.files.attach', { task: T1, file: F1 }, U.ED);
const atOther = await J('tasks.files.attach', { task: T1, file: F2 }, U.ED);
check('OR15', 'A file of the task\'s own project is attached to it; a file of another project is refused', at.status === 200 && atOther.status !== 200);
const seen = (u) => J('tasks.files.list', { task: T1 }, u);
check('OR16', 'The task lists its files with names, for the people who can see both the task and the file', (await seen(U.ED)).data.map((f) => f.name).join() === 'Brief.pdf' && (await seen(U.AOWN)).data.length === 0);
const vwAttach = await J('tasks.files.attach', { task: T2, file: F1 }, U.VW);
check('OR17', 'A read-only viewer cannot attach files', vwAttach.status !== 200);
await J('tasks.files.detach', { task: T1, file: F1 }, U.ED);
check('OR18', 'Detaching removes the link, never the file (it stays in Drive)', (await seen(U.ED)).data.length === 0 && (await rows('select count(*)::int n from files where id=$1', [F1]))[0].n === 1);
await asUser(U.ED, { org: L });
const direct = await errCode(() => db.query("insert into task_files (workspace_id,task_id,file_id) values ($1,$2,$3)", [L, T2, F2]));
check('OR19', 'Even with direct table access, a task cannot point at another project\'s file', direct !== 'no-error');

for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}${x.ok ? '' : `  [${x.detail ?? ''}]`}`);
const p = results.filter((x) => x.ok).length; console.log(`\n${p}/${results.length} checks passed`); await db.close(); process.exit(p === results.length ? 0 : 1);
