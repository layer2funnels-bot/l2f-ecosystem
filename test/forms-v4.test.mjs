// Form Builder v4 (migration 0029): eleven field types, limits, show-if, settings, templates and duplicating. The database enforces every rule.
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
const J = async (op, input, u, org) => { const r = await api.handle({ operation: op, input, auth: { userId: u, email: 'x@example.com' }, headers: { 'x-org-id': org } }); return { ...r, row: r.body?.data?.[0], rows: r.body?.data ?? [] }; };
await db.exec('reset role');
const ORG = { L: id(), A: id() }; const U = { LO: id(), LED: id(), LVW: id(), AO: id() };
await db.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','L'),($2,'aurj','A')", [ORG.L, ORG.A]);
const staff = (u, ws, r) => db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff',$3)", [ws, u, r]);
await staff(U.LO, ORG.L, 'owner'); await staff(U.LED, ORG.L, 'editor'); await staff(U.LVW, ORG.L, 'viewer'); await staff(U.AO, ORG.A, 'owner');
for (const u of [U.LED, U.LVW]) await db.query("insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,'forms')", [ORG.L, u]);
await db.query("update apps set lifecycle = 'active' where key = 'forms'");
for (const w of [ORG.L, ORG.A]) await db.query("insert into workspace_apps (workspace_id, app_key, enabled) values ($1, 'forms', true) on conflict (workspace_id, app_key) do update set enabled = true", [w]);
const C1 = id(); await db.query("insert into clients (id,workspace_id,name) values ($1,$2,'One')", [C1, ORG.L]);

const F = (await J('forms.create', { name: 'Intake' }, U.LO, ORG.L)).row;
const FIELDS = [
  { key: 'name', type: 'text', label: 'Name', required: true, min: 2, max: 40, help: 'As on your passport' }, { key: 'email', type: 'email', label: 'Email', required: true }, { key: 'phone', type: 'phone', label: 'Phone' },
  { key: 'site', type: 'url', label: 'Website' }, { key: 'budget', type: 'number', label: 'Budget', min: 100, max: 10000 }, { key: 'kind', type: 'select', label: 'Kind', options: ['Coach', 'Other'], required: true },
  { key: 'other', type: 'text', label: 'Tell us more', required: true, show_if: { key: 'kind', op: 'eq', value: 'Other' } }, { key: 'logo', type: 'file', label: 'Logo', accept: ['png', 'svg'], max_mb: 5 }, { key: 'agree', type: 'checkbox', label: 'I agree' }];
const save = (fields, u = U.LO, org = ORG.L, form = F.id) => J('forms.fields.save', { id: form, fields }, u, org);
check('FV1', 'A form with all the new field types, limits, help text, a file field and a show-if saves as version 1', (await save(FIELDS)).row?.current_version === 1);
await J('forms.publish', { id: F.id }, U.LO, ORG.L);
const sub = (answers, u = U.LED) => J('forms.submissions.submit', { form: F.id, answers }, u, ORG.L);
const ok = { name: 'Sam', email: 'sam@example.com', kind: 'Coach', budget: 500, phone: '+44 20 7946 0958', site: 'https://sam.example', agree: true };
check('FV2', 'A valid submission is recorded against version 1', (await sub(ok)).row?.form_version === 1);
check('FV3', 'Number and text limits are enforced by the database', (await sub({ ...ok, budget: 50 })).status !== 200 && (await sub({ ...ok, budget: 20000 })).status !== 200 && (await sub({ ...ok, name: 'S' })).status !== 200 && (await sub({ ...ok, name: 'x'.repeat(41) })).status !== 200);
check('FV4', 'Phone and web address formats are enforced', (await sub({ ...ok, phone: 'abc' })).status !== 200 && (await sub({ ...ok, site: 'javascript:alert(1)' })).status !== 200 && (await sub({ ...ok, site: 'ftp://x' })).status !== 200);
check('FV5', 'A show-if question is required only when shown: hidden it may be skipped, shown it must be answered', (await sub({ ...ok, kind: 'Coach' })).status === 200 && (await sub({ ...ok, kind: 'Other' })).status !== 200 && (await sub({ ...ok, kind: 'Other', other: 'Hello' })).status === 200);
check('FV6', 'An answer to a hidden question is refused (nothing stale is stored)', (await sub({ ...ok, kind: 'Coach', other: 'stale' })).status !== 200);
check('FV7', 'File answers are lists of file ids; anything else is refused', (await sub({ ...ok, logo: [id()] })).status === 200 && (await sub({ ...ok, logo: 'a.png' })).status !== 200 && (await sub({ ...ok, logo: ['not-an-id'] })).status !== 200 && (await sub({ ...ok, logo: Array.from({ length: 11 }, () => id()) })).status !== 200);
const bad = async (fields) => (await save(fields)).status !== 200;
check('FV8', 'Bad field definitions are refused: show-if pointing forward or at nothing, min above max, limits on the wrong type, file limits on text, accept list shape', await bad([{ key: 'a', type: 'text', label: 'A', show_if: { key: 'b', op: 'filled' } }, { key: 'b', type: 'text', label: 'B' }])
  && await bad([{ key: 'a', type: 'text', label: 'A', show_if: { key: 'zz', op: 'filled' } }]) && await bad([{ key: 'a', type: 'number', label: 'A', min: 5, max: 1 }]) && await bad([{ key: 'a', type: 'email', label: 'A', min: 1 }])
  && await bad([{ key: 'a', type: 'text', label: 'A', accept: ['pdf'] }]) && await bad([{ key: 'a', type: 'file', label: 'A', accept: ['PDF!'] }]) && await bad([{ key: 'a', type: 'file', label: 'A', max_mb: 99 }]) && await bad([{ key: 'a', type: 'text', label: 'A', show_if: { key: 'a', op: 'eq' } }]));
check('FV9', 'Saving changed fields makes version 2 and the earlier submissions keep version 1', (await save([...FIELDS, { key: 'extra', type: 'text', label: 'Extra' }])).row?.current_version === 2 && (await J('forms.submissions.list', { form: F.id }, U.LO, ORG.L)).rows.every((r) => r.form_version === 1));
const up = (input, u = U.LO) => J('forms.update', { id: F.id, ...input }, u, ORG.L);
check('FV10', 'Settings: confirmation message, https redirect, retention note and template flag save; an empty text clears one; a non-https redirect is refused', (await up({ confirmation_message: 'Thanks!', redirect_url: 'https://example.com/thanks', retention_note: 'Kept 12 months', is_template: true })).row?.redirect_url === 'https://example.com/thanks' && (await up({ redirect_url: 'http://x.example' })).status !== 200 && (await up({ redirect_url: 'javascript:1' })).status !== 200 && (await up({ redirect_url: '' })).row?.redirect_url === null && (await up({})).row?.is_template === true);
check('FV11', 'Templates are listed on their own; the library filter shows organization forms only', (await J('forms.list', { templates: true }, U.LO, ORG.L)).rows.length === 1 && (await J('forms.list', { library: true }, U.LO, ORG.L)).rows.every((r) => r.client_id === null));
const dup = await J('forms.duplicate', { id: F.id, client: C1, name: 'Intake for One' }, U.LED, ORG.L);
check('FV12', 'Using a template makes a new draft for a client with the same questions and settings, version 1, and is not a template itself', dup.row?.client_id === C1 && dup.row.status === 'draft' && dup.row.current_version === 1 && dup.row.fields.length === FIELDS.length + 1 && dup.row.is_template === false && dup.row.confirmation_message === 'Thanks!');
check('FV13', 'A viewer cannot create, change, duplicate or submit', (await J('forms.duplicate', { id: F.id }, U.LVW, ORG.L)).rows.length === 0 && (await up({ name: 'Hacked' }, U.LVW)).rows.length === 0);
check('FV14', 'Another organization cannot see, duplicate or change these forms', (await J('forms.get', { id: F.id }, U.AO, ORG.A)).rows.length === 0 && (await J('forms.duplicate', { id: F.id }, U.AO, ORG.A)).rows.length === 0 && (await J('forms.list', {}, U.AO, ORG.A)).rows.length === 0);
const D = (await J('forms.create', { name: 'Draft only' }, U.LO, ORG.L)).row; await save([{ key: 'a', type: 'text', label: 'A' }], U.LO, ORG.L, D.id);
check('FV15', 'A draft form takes no submissions: nothing is public and nothing is recorded until staff publish it', (await J('forms.submissions.submit', { form: D.id, answers: { a: 'x' } }, U.LO, ORG.L)).status !== 200);
for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}`);
const pc = results.filter((x) => x.ok).length; console.log(`\n${pc}/${results.length} checks passed`); await db.close(); process.exit(pc === results.length ? 0 : 1);
