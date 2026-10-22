// Form Builder (migration 0019): forms, immutable versions of fields, submissions by signed-in staff (no public path). Allow + deny per role and scope, isolation, audit without answers.
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
const J = async (op, input, u, org) => { const r = await call(op, input, u, org); if (process.env.DEBUG_J) console.log('J', op, r.status, JSON.stringify(r.body).slice(0, 200)); return { ...r, data: r.body?.data, row: r.body?.data?.[0], code: r.body?.error?.code }; };

await asSuper();
const L = id(), A = id();
const U = { OWN: id(), ADM: id(), ED: id(), ED2: id(), VW: id(), AOWN: id(), BOTH: id() };
await db.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','L'),($2,'aurj','A')", [L, A]);
const staff = (u, ws, r) => db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff',$3)", [ws, u, r]);
await staff(U.OWN, L, 'owner'); await staff(U.ADM, L, 'admin'); await staff(U.ED, L, 'editor'); await staff(U.ED2, L, 'editor'); await staff(U.VW, L, 'viewer'); await staff(U.AOWN, A, 'owner'); await staff(U.BOTH, L, 'owner'); await staff(U.BOTH, A, 'owner');
const C1 = id(), C2 = id();
await db.query("insert into clients (id,workspace_id,name) values ($1,$3,'Client One'),($2,$3,'Client Two')", [C1, C2, L]);
for (const u of [U.ED, U.ED2, U.VW]) await db.query("insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,'forms')", [L, u]);
const FIELDS = [{ key: 'name', label: 'Your name', type: 'text', required: true }, { key: 'email', label: 'E-mail', type: 'email', required: true }, { key: 'size', label: 'Company size', type: 'select', options: ['1-5', '6-20', '21+'] },
  { key: 'topics', label: 'Topics', type: 'multi_select', options: ['ads', 'seo', 'email'] }, { key: 'budget', label: 'Budget', type: 'number' }, { key: 'start', label: 'Start date', type: 'date' }, { key: 'agree', label: 'I agree', type: 'checkbox' }];

// ---- A. the app is "coming soon" until the owner activates it
let r2; let r = await J('forms.create', { name: 'Intake' }, U.ED);
check('FM1', 'While the app is "coming soon" nobody can create a form, even an owner', r.status === 404 && (await J('forms.create', { name: 'x' }, U.OWN)).status === 404);
await asSuper(); await db.query("update apps set lifecycle = 'active' where key = 'forms'"); await db.query("update workspace_apps set enabled = true where workspace_id = $1 and app_key = 'forms'", [L]).catch(() => {});
await db.query("insert into workspace_apps (workspace_id, app_key, enabled) values ($1, 'forms', true) on conflict (workspace_id, app_key) do update set enabled = true", [L]);

// ---- B. forms and versions
r = await J('forms.create', { name: 'Intake', description: 'New client intake', client: C1 }, U.ED);
const F = r.row?.id;
check('FM2', 'An editor creates a draft form for a client; it has no version yet and is not published', r.status === 200 && r.row.status === 'draft' && r.row.current_version === 0 && r.row.fields === null && r.row.client_id === C1, JSON.stringify(r.body));
r = await J('forms.publish', { id: F }, U.ED);
check('FM3', 'A form without fields cannot be published', r.status === 404 || r.status === 422);
for (const [n, f] of [['duplicate keys', [{ key: 'a', label: 'A', type: 'text' }, { key: 'a', label: 'B', type: 'text' }]], ['an unknown type', [{ key: 'a', label: 'A', type: 'telepathy' }]], ['a choice without options', [{ key: 'a', label: 'A', type: 'select' }]],
  ['a missing label', [{ key: 'a', type: 'text' }]], ['a bad key', [{ key: 'Bad Key', label: 'A', type: 'text' }]], ['not a list', { a: 1 }], ['more than 60 fields', Array.from({ length: 61 }, (_, k) => ({ key: `f${k}`, label: 'F', type: 'text' }))]]) {
  r = await J('forms.fields.save', { id: F, fields: f }, U.ED);
  check(`FM4-${n}`, `Fields with ${n} are refused`, r.status === 422 || r.status === 404, JSON.stringify(r.body));
}
r = await J('forms.fields.save', { id: F, fields: FIELDS }, U.ED);
check('FM5', 'Saving the fields creates version 1 and returns them', r.status === 200 && r.row.current_version === 1 && r.row.fields.length === 7, JSON.stringify(r.body));
r = await J('forms.submissions.submit', { form: F, answers: { name: 'Sam', email: 'sam@example.com' } }, U.ED);
check('FM6', 'A draft form takes no submissions', r.status === 422 || r.status === 404);
r = await J('forms.publish', { id: F }, U.ED);
check('FM7', 'The form is published', r.status === 200 && r.row.status === 'published');

// ---- C. submissions are checked against the version they answer
const OK = { name: 'Sam', email: 'sam@example.com', size: '6-20', topics: ['ads', 'seo'], budget: 5000, start: '2026-12-01', agree: true };
r = await J('forms.submissions.submit', { form: F, answers: OK }, U.ED);
const S1 = r.row?.id;
check('FM8', 'A valid submission is stored against version 1, by the signed-in person, for the form\'s client', r.status === 200 && r.row.form_version === 1 && r.row.submitted_by === U.ED && r.row.client_id === C1, JSON.stringify(r.body));
for (const [n, a] of [['a missing required answer', { email: 'a@b.co' }], ['an answer that is not in the form', { ...OK, extra: 'x' }], ['the wrong type', { ...OK, budget: 'lots' }], ['a choice outside the options', { ...OK, size: '1000+' }],
  ['an invalid e-mail', { ...OK, email: 'not-an-email' }], ['an option list outside the options', { ...OK, topics: ['ads', 'tv'] }], ['a bad date', { ...OK, start: 'tomorrow' }], ['a text where yes/no is expected', { ...OK, agree: 'yes' }]]) {
  r = await J('forms.submissions.submit', { form: F, answers: a }, U.ED);
  check(`FM9-${n}`, `A submission with ${n} is refused`, r.status === 422 || r.status === 404, JSON.stringify(r.body));
}
r = await J('forms.submissions.submit', { form: F, answers: { name: 'Min', email: 'min@example.com' } }, U.ED2);
check('FM10', 'Optional answers may be left out', r.status === 200);

// ---- D. editing the fields makes version 2; old answers stay on version 1
r = await J('forms.fields.save', { id: F, fields: [...FIELDS, { key: 'source', label: 'How did you find us?', type: 'text', required: true }] }, U.ED);
check('FM11', 'Changing the fields makes version 2', r.status === 200 && r.row.current_version === 2);
r = await J('forms.submissions.submit', { form: F, answers: OK }, U.ED);
check('FM12', 'New submissions answer version 2 (the new required field is enforced)', r.status === 422 || r.status === 404);
r = await J('forms.submissions.submit', { form: F, answers: { ...OK, source: 'a friend' } }, U.ED);
check('FM13', '…and are stored against version 2', r.status === 200 && r.row.form_version === 2);
r = await J('forms.submissions.get', { id: S1 }, U.OWN);
check('FM14', 'The first submission still belongs to version 1', r.row.form_version === 1);
r = await J('forms.versions.list', { form: F }, U.VW);
check('FM15', 'The version history is readable, newest first, with each version\'s fields', r.status === 200 && r.data.map((v) => v.version).join() === '2,1' && r.data[1].fields.length === 7);
await asUser(U.OWN);
check('FM16', 'Versions cannot be changed or removed, even by an owner', ['42501', 'P0001'].includes(await errCode(() => db.query("update form_versions set fields = '[]'::jsonb"))) && ['42501', 'P0001'].includes(await errCode(() => db.query('delete from form_versions'))));
check('FM17', 'The version number cannot be set by hand', (await errCode(() => db.query('update forms set current_version = 9 where id = $1', [F]))) === 'P0001');
check('FM18', 'A submission cannot be edited (only archived)', (await errCode(() => db.query("update form_submissions set answers = '{}'::jsonb where id = $1", [S1]))) === 'P0001');

// ---- E. permissions
r = await J('forms.list', {}, U.VW);
check('FM19', 'A viewer sees the form and its versions', r.status === 200 && r.data.length === 1);
r = await J('forms.submissions.list', { form: F }, U.VW);
check('FM20', '…but not the answers (reading answers needs its own permission)', r.status === 200 && r.data.length === 0);
r = await J('forms.submissions.list', { form: F }, U.ED);
check('FM21', 'An editor reads the answers', r.data.length === 3);
const vw = [await J('forms.create', { name: 'x' }, U.VW), await J('forms.update', { id: F, name: 'x' }, U.VW), await J('forms.fields.save', { id: F, fields: [] }, U.VW), await J('forms.submissions.submit', { form: F, answers: { ...OK, source: 'x' } }, U.VW)].map((x) => x.status).join();
check('FM22', 'A viewer cannot create, edit, publish or submit', vw === '404,404,404,404', vw);
r = await J('forms.delete', { id: F }, U.ADM);
check('FM23', 'An active form cannot be deleted', r.status !== 200);
r = await J('forms.submissions.archive', { id: S1 }, U.ED);
check('FM24', 'An editor archives a submission', r.status === 200 && r.row.archived_at);
r = await J('forms.submissions.delete', { id: S1 }, U.ED);
check('FM25', 'An editor cannot delete it (an owner right), even archived', r.status === 404);
r = await J('forms.submissions.delete', { id: S1 }, U.OWN);
check('FM26', 'An owner deletes an archived submission', r.status === 200);
r = await J('forms.archive', { id: F }, U.ED);
check('FM27', 'An archived form is unpublished and takes no submissions', r.status === 200 && (await J('forms.submissions.submit', { form: F, answers: { ...OK, source: 'x' } }, U.ED)).status !== 200);
r = await J('forms.delete', { id: F }, U.OWN);
check('FM28', 'A form with submissions can never be deleted, only archived', r.status !== 200);
const F2 = (await J('forms.create', { name: 'Empty form' }, U.ED)).row.id;
await J('forms.archive', { id: F2 }, U.ED);
check('FM29', 'An empty archived form can be deleted by an owner, not an editor', (await J('forms.delete', { id: F2 }, U.ED)).status === 404 && (await J('forms.delete', { id: F2 }, U.OWN)).status === 200);

// ---- F. scope and isolation
await asSuper();
const F3 = (await J('forms.create', { name: 'Client two form', client: C2 }, U.ADM)).row.id;
await db.query("insert into permission_overrides (workspace_id,principal_type,principal_id,permission_key,effect,client_id,reason) values ($1,'user',$2,'forms.form.view','deny',$3,'test')", [L, U.ED2, C2]);
r = await J('forms.list', {}, U.ED2);
check('FM30', 'A restriction on one client hides that client\'s forms from that person only', r.data.every((f) => f.client_id !== C2) && (await J('forms.get', { id: F3 }, U.ED2)).status === 404 && (await J('forms.get', { id: F3 }, U.ED)).status === 200);
r = await J('forms.list', {}, U.AOWN, A);
check('FM31', 'Another organization sees none of it, and cannot read by id', r.data.length === 0 && (await J('forms.get', { id: F3 }, U.AOWN, A)).status === 404 && (await J('forms.get', { id: F3 }, U.AOWN, L)).status === 404);
check('FM32', 'A form cannot be moved to another client', (await errCode(() => db.query('update forms set client_id = $2 where id = $1', [F3, C1]))) === 'P0001');
r = await J('approvals.request', { subject_type: 'form', subject: F3, title: 'Approve the form' }, U.ADM);
check('FM33', 'A form can be put up for approval; a form of another organization cannot', r.status === 200 && (await J('approvals.request', { subject_type: 'form', subject: F3, title: 'x' }, U.AOWN, A)).status === 404);
await asSuper();
r = await J('forms.submissions.list', { form: F }, U.BOTH, A);
r2 = await asUser(U.BOTH, { org: A }).then(() => rows('select id from form_submissions'));
check('FM35', 'A person in two organizations sees only the organization the request names (answers, direct and through the API)', r.data.length === 0 && r2.length === 0);
await asSuper();
const au = JSON.stringify((await rows("select detail from audit_events where action like 'form%'")).map((x) => x.detail));
check('FM34', 'The audit log records forms and submissions by id and status, never the answers or field labels', au.length > 50 && !au.includes('sam@example.com') && !au.includes('Your name') && !au.includes('a friend'));

for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(9)} ${x.name}${x.ok ? '' : `  [${x.detail ?? ''}]`}`);
const p = results.filter((x) => x.ok).length; console.log(`\n${p}/${results.length} checks passed`); await db.close(); process.exit(p === results.length ? 0 : 1);
