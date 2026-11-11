// Projects V2 through the ecosystem API (pm.* operations, migration 0048): the real request path (bearer identity,
// x-org-id, one transaction as app_user), V2's own plain-language errors, Drive-owned files, and isolation.
import { randomUUID as id } from 'node:crypto';
import { openDb, migrate, recorder } from './lib.mjs';
import { createApi } from '../packages/core/api.mjs';
import { createPgExecutor } from '../packages/core/pg-executor.mjs';
import { createRateLimiter } from '../packages/core/rate-limit.mjs';
import { createSafeLogger } from '../packages/core/safe-log.mjs';
import { createMemoryStorage } from '../packages/core/storage-adapter.mjs';

const db = await openDb(); await migrate(db);
const { results, check } = recorder();
const rows = async (s, p = []) => (await db.query(s, p)).rows;
let chain = Promise.resolve();
const acquire = () => { const prev = chain; let release; chain = new Promise((r) => { release = r; }); return prev.then(() => ({ query: (s, p) => db.query(s, p), release })); };
const BIG = { read: { max: 1e6, windowMs: 6e4 }, write: { max: 1e6, windowMs: 6e4 }, sensitive: { max: 1e6, windowMs: 6e4 } };
const logs = [];
const api = createApi({ executor: createPgExecutor({ acquire, role: 'app_user' }), logger: createSafeLogger((l) => logs.push(l)), limiter: createRateLimiter({ limits: BIG }), storage: createMemoryStorage() });
const P = async (op, args, u, org) => { const r = await api.handle({ operation: `pm.${op}`, input: { args }, auth: { userId: u, email: 'x@example.com' }, headers: { 'x-org-id': org } }); return { status: r.status, body: r.body, r: r.body?.data?.[0]?.r }; };

await db.exec('reset role');
const ORG = { L: id(), A: id() }; const U = { LO: id(), LED: id(), LNO: id(), AO: id() };
await db.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','L'),($2,'aurj','A')", [ORG.L, ORG.A]);
const staff = (u, ws, r) => db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff',$3)", [ws, u, r]);
await staff(U.LO, ORG.L, 'owner'); await staff(U.LED, ORG.L, 'editor'); await staff(U.LNO, ORG.L, 'editor'); await staff(U.AO, ORG.A, 'owner');
await db.query("insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,'projects'),($1,$2,'office')", [ORG.L, U.LED]);
await db.query("insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,'office')", [ORG.L, U.LNO]);
// Eddie has no profile row on purpose: a member without one must still work everywhere (0049 pm_people).
for (const [u, n] of [[U.LO, 'Lena Owner'], [U.LNO, 'No Grant'], [U.AO, 'Aurj Owner']]) {
  await db.query('insert into profiles (id, display_name) values ($1,$2) on conflict (id) do update set display_name = excluded.display_name', [u, n])
}

const proj = await P('projects.create', { name: 'Launch site' }, U.LO, ORG.L);
check('PA1', 'The owner creates a project through the API and gets V2’s project detail back', proj.status === 200 && proj.r?.name === 'Launch site' && typeof proj.r?.id === 'string');
const PID = proj.r.id;
const t1 = await P('tasks.create', { projectId: PID, title: 'Write copy' }, U.LO, ORG.L);
check('PA2', 'A task is created and listed', t1.status === 200 && (await P('tasks.list', { projectId: PID }, U.LO, ORG.L)).r.some((t) => t.id === t1.r.id));
const bad = await P('tasks.create', { projectId: PID, title: '' }, U.LO, ORG.L);
check('PA3', 'V2’s own plain-language validation reaches the browser (422, field named), never database text', bad.status === 422 && bad.body?.error?.code === 'invalid' && !/pm_|sql|constraint/i.test(JSON.stringify(bad.body)));
const unk = await P('tasks.create', { projectId: PID, title: 'x', workspaceId: ORG.A, createdBy: U.AO }, U.LO, ORG.L);
check('PA4', 'Fields the caller may not set (organization, creator) are ignored: the database fills them', unk.status === 200 && (await rows('select workspace_id, created_by from pm_tasks where id = $1', [unk.r.id]))[0].workspace_id === ORG.L && (await rows('select created_by from pm_tasks where id = $1', [unk.r.id]))[0].created_by === U.LO);
check('PA5', 'Another organization cannot see the project (not found, same as missing)', (await P('projects.get', { id: PID }, U.AO, ORG.A)).status === 404 && (await P('projects.get', { id: PID }, U.AO, ORG.L)).status !== 200);
check('PA6', 'Someone without the Projects app grant gets nothing', ((await P('projects.list', {}, U.LNO, ORG.L)).r?.length ?? 0) === 0);
check('PA7', 'Not an operation the ecosystem knows: old dev sign-in is gone', (await api.handle({ operation: 'pm.auth.devLogin', input: { args: { userId: U.LO } }, auth: { userId: U.LO, email: 'x@example.com' }, headers: { 'x-org-id': ORG.L } })).status === 404);

// personal projects stay private, from owners too
const mine = await P('projects.create', { name: 'My notes', personal: true }, U.LED, ORG.L);
check('PA8', 'A personal project is visible to its creator', mine.status === 200 && (await P('projects.get', { id: mine.r.id }, U.LED, ORG.L)).status === 200);
check('PA9', 'And not to the organization owner', (await P('projects.get', { id: mine.r.id }, U.LO, ORG.L)).status === 404 && !(await P('projects.list', {}, U.LO, ORG.L)).r.some((p) => p.id === mine.r.id));

// Drive files
const F1 = id(), FA = id();
await db.query("insert into files (id,workspace_id,space,name,kind,mime_type,size_bytes,storage_path,uploaded_by) values ($1,$2,'shared','brief.pdf','file','application/pdf',1234,$3,$4)", [F1, ORG.L, `${ORG.L}/brief.pdf`, U.LO]);
await db.query("insert into files (id,workspace_id,space,name,kind,mime_type,size_bytes,storage_path,uploaded_by) values ($1,$2,'shared','aurj.pdf','file','application/pdf',9,$3,$4)", [FA, ORG.A, `${ORG.A}/aurj.pdf`, U.AO]);
const att = await P('attachments.add', { taskId: t1.r.id, fileId: F1 }, U.LO, ORG.L);
check('PA10', 'A shared Drive file is attached to a task; name, type and size come from Drive', att.status === 200 && att.r?.name === 'brief.pdf' && att.r?.sizeBytes === 1234 && att.r?.fileId === F1);
check('PA11', 'The task detail lists it', (await P('tasks.get', { id: t1.r.id }, U.LO, ORG.L)).r?.attachments?.some((a) => a.fileId === F1));
const url = await P('attachments.fileUrl', { id: att.r.id }, U.LO, ORG.L);
check('PA12', 'A short-lived download address comes from Drive storage', url.status === 200 && /^memory:\/\/download\//.test(url.r?.url ?? ''));
check('PA13', 'Another organization’s file cannot be attached', (await P('attachments.add', { taskId: t1.r.id, fileId: FA }, U.LO, ORG.L)).status !== 200);
const rem = await P('attachments.remove', { id: att.r.id }, U.LO, ORG.L);
check('PA14', 'Removing the attachment only unlinks it: the Drive file stays', rem.status === 200 && (await rows('select count(*)::int n from files where id = $1', [F1]))[0].n === 1);
const res = await P('resources.addFile', { projectId: PID, fileId: F1 }, U.LO, ORG.L);
check('PA15', 'A Drive file goes into the project’s collection', res.status === 200 && res.r?.fileName === 'brief.pdf' && res.r?.kind === 'file');
const usage = await P('storage.usage', {}, U.LO, ORG.L);
check('PA16', 'Storage usage is Drive’s own organization-wide number', usage.status === 200 && usage.r.limitBytes > 0);

// shared comments, mentions and the ecosystem bell (migration 0049)
await P('projects.update', { id: PID, patch: { visibility: 'organization' } }, U.LO, ORG.L);
const cm = await P('comments.add', { taskId: t1.r.id, body: 'Please review @Eddie', mentions: [U.LED, U.LNO] }, U.LO, ORG.L);
check('PA18', 'A comment goes into the shared comments service and comes back with only the mention who can open the task', cm.status === 200 && cm.r?.body === 'Please review @Eddie' && JSON.stringify(cm.r?.mentions) === JSON.stringify([U.LED]) && (await rows("select count(*)::int n from comments where entity_type = 'pm_task' and entity_id = $1", [t1.r.id]))[0].n === 1);
const bell = await api.handle({ operation: 'notifications.list', input: {}, auth: { userId: U.LED, email: 'x@example.com' }, headers: { 'x-org-id': ORG.L } });
check('PA19', 'The mentioned person sees it in the ecosystem bell, with the task title and project', bell.status === 200 && bell.body.data.some((n) => n.kind === 'mentioned' && n.entity_type === 'pm_task' && n.title === 'Write copy' && n.project_name === 'Launch site'));
check('PA20', 'Someone without the Projects app is not told', (await rows('select count(*)::int n from notifications where user_id = $1', [U.LNO]))[0].n === 0);
const pmBell = await P('notifications.list', {}, U.LED, ORG.L);
check('PA21', 'Projects’ own notification list reads the same shared notifications', pmBell.status === 200 && pmBell.r.items.some((n) => n.kind === 'mentioned' && n.taskId === t1.r.id) && pmBell.r.unread >= 1);
check('PA22', 'The task detail shows the comment and the commenter as a follower', (await P('tasks.get', { id: t1.r.id }, U.LED, ORG.L)).r?.comments?.length === 1 && (await P('tasks.get', { id: t1.r.id }, U.LO, ORG.L)).r?.followers?.some((f) => f.id === U.LO));
const mineTask = await P('tasks.create', { projectId: mine.r.id, title: 'Private thought' }, U.LED, ORG.L);
await P('comments.add', { taskId: mineTask.r.id, body: 'note to self', mentions: [U.LO] }, U.LED, ORG.L);
check('PA23', 'A personal project stays private: mentioning the organization owner tells them nothing and they cannot read the comment', (await rows("select count(*)::int n from notifications where user_id = $1 and entity_id = $2", [U.LO, mineTask.r.id]))[0].n === 0 && (await api.handle({ operation: 'comments.list', input: { type: 'project_task', id: mineTask.r.id }, auth: { userId: U.LO, email: 'x@example.com' }, headers: { 'x-org-id': ORG.L } })).body?.data?.length !== 1);
const other = await P('comments.remove', { id: cm.r.id }, U.LED, ORG.L);
check('PA24', 'Only the author removes a comment', other.status !== 200 && (await P('comments.remove', { id: cm.r.id }, U.LO, ORG.L)).status === 200);
await P('tasks.update', { id: t1.r.id, patch: { status: 'done' } }, U.LO, ORG.L);
check('PA25', 'Completing a task tells its followers (not the person who completed it)', (await rows("select count(*)::int n from notifications where kind = 'completed' and entity_id = $1 and user_id = $2", [t1.r.id, U.LO]))[0].n === 0);
check('PA17', 'No database text in any log line', logs.length > 0 && !logs.some((l) => /select |insert |update |delete |constraint|relation|column/i.test(JSON.stringify(l))));

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'}  ${r.id.padEnd(5)} ${r.name}${r.ok ? '' : '  ' + r.detail}`);
console.log(`${results.length - failed.length}/${results.length} checks passed`);
await db.close?.();
process.exit(failed.length ? 1 : 0);
