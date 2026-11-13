// Funnel Mapper data on the ecosystem database (migration 0053, packages/core/fmp-data-operations.mjs).
// Roles, client scope (SDOR), organizations (WCIGA), trash and permanent delete, versions/actuals/products/templates/assets,
// share links (hash only, public view/save/comment with the original privacy rules), audit. Through the API layer and the database.
import { randomUUID as id } from 'node:crypto';
import { openDb, migrate, session, recorder } from './lib.mjs';
import { createApi } from '../packages/core/api.mjs';
import { createPgExecutor } from '../packages/core/pg-executor.mjs';
import { createRateLimiter } from '../packages/core/rate-limit.mjs';
import { createSafeLogger } from '../packages/core/safe-log.mjs';
import { createMemoryStorage } from '../packages/core/storage-adapter.mjs';

const db = await openDb(); await migrate(db);
const { asUser, asSuper } = session(db); const { results, check, errCode } = recorder();
const rows = async (s, p = []) => (await db.query(s, p)).rows;
let chain = Promise.resolve();
const acquire = () => { const prev = chain; let release; chain = new Promise((r) => { release = r; }); return prev.then(() => ({ query: (s, p) => db.query(s, p), release })); };
const BIG = { read: { max: 1e6, windowMs: 6e4 }, write: { max: 1e6, windowMs: 6e4 }, sensitive: { max: 1e6, windowMs: 6e4 } };
const api = createApi({ executor: createPgExecutor({ acquire, role: 'app_user' }), logger: createSafeLogger(() => {}), limiter: createRateLimiter({ limits: BIG }), storage: createMemoryStorage() });
const call = (op, input, user, org = L) => api.handle({ operation: op, input, auth: { userId: user, email: 'x@example.com' }, headers: { 'x-org-id': org } });
const data = (r) => r.body?.data ?? [];
const pub = (action, token, body) => api.publicFmpShare({ action, token, ip: '1.2.3.4', body });

await asSuper();
const L = id(), A = id();
const U = { OWN: id(), ED: id(), VW: id(), SCOPED: id(), NOFMP: id(), AOWN: id() };
await db.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','Layer2Funnels'),($2,'aurj','Aurj')", [L, A]);
await db.query("insert into workspace_apps (workspace_id, app_key, enabled) values ($1, 'funnel_mapper_pro', true) on conflict (workspace_id, app_key) do update set enabled = true", [L]);
const staff = (u, ws, r) => db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff',$3)", [ws, u, r]);
await staff(U.OWN, L, 'owner'); await staff(U.ED, L, 'editor'); await staff(U.VW, L, 'viewer'); await staff(U.SCOPED, L, 'editor'); await staff(U.NOFMP, L, 'editor'); await staff(U.AOWN, A, 'owner');
for (const u of [U.ED, U.VW, U.SCOPED, U.NOFMP]) await db.query("insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,'clients')", [L, u]);
for (const u of [U.ED, U.VW, U.SCOPED]) await db.query("insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,'funnel_mapper_pro')", [L, u]);
const lvl = async (name) => (await rows('select id from access_levels where workspace_id=$1 and name=$2', [L, name]))[0].id;
const assign = (u, level, client = null) => db.query("insert into access_assignments (workspace_id,access_level_id,principal_type,principal_id,client_id) values ($1,$2,'user',$3,$4)", [L, level, u, client]);
const C1 = id(), C2 = id(), CA = id();
await db.query("insert into clients (id,workspace_id,name) values ($1,$4,'Sam Carter'),($2,$4,'Priya Nair'),($3,$5,'Aurj client')", [C1, C2, CA, L, A]);
await assign(U.ED, await lvl('All clients · edit')); await assign(U.VW, await lvl('All clients · read')); await assign(U.SCOPED, await lvl('Client team'), C1); await assign(U.NOFMP, await lvl('All clients · edit'));
const GRAPH = { nodes: [{ id: 'a', type: 'traffic', p: { visitors: 2500, cost: 450 }, desc: 'internal note', shot: 'x.png', checklist: [{ t: 'todo' }] }, { id: 'n', type: 'note', p: { text: 'hello' } }], edges: [], view: { x: 0, y: 0, k: 1 } };

// ---- A. funnels: create, read, update, roles
let r = await call('fmp.funnels.create', { client: C1, name: 'PT tripwire', graph: GRAPH, settings: { currency: 'GBP', notes: { text: 'secret', shared: false } }, summary: { rev: 7485 } }, U.ED);
const F1 = data(r)[0]?.id;
check('FD1', 'An editor creates a funnel for a client; the map is stored as given', r.status === 200 && !!F1 && (await rows('select graph from fmp.funnels where id=$1', [F1]))[0].graph.nodes.length === 2);
r = await call('fmp.funnels.create', { client: C2, name: 'Webinar' }, U.ED); const F2 = data(r)[0]?.id;
check('FD2', 'A viewer reads funnels but cannot create, edit or trash them', data(await call('fmp.funnels.list', {}, U.VW)).length === 2
  && data(await call('fmp.funnels.create', { client: C1, name: 'x' }, U.VW)).length === 0
  && data(await call('fmp.funnels.update', { id: F1, name: 'Hacked' }, U.VW)).length === 0 && data(await call('fmp.funnels.trash', { id: F1 }, U.VW)).length === 0
  && (await rows('select name from fmp.funnels where id=$1', [F1]))[0].name === 'PT tripwire');
check('FD3', 'A person scoped to one client sees and edits only that client\'s funnels', data(await call('fmp.funnels.list', {}, U.SCOPED)).map((f) => f.id).join() === F1
  && data(await call('fmp.funnels.get', { id: F2 }, U.SCOPED)).length === 0 && data(await call('fmp.funnels.update', { id: F2, name: 'x' }, U.SCOPED)).length === 0
  && data(await call('fmp.funnels.create', { client: C2, name: 'x' }, U.SCOPED)).length === 0);
check('FD4', 'Without Funnel Mapper access nothing is returned, even with Clients access', data(await call('fmp.funnels.list', {}, U.NOFMP)).length === 0 && data(await call('fmp.funnels.get', { id: F1 }, U.NOFMP)).length === 0);
check('FD5', 'Aurj never sees or touches Layer2Funnels funnels, and cannot attach a funnel to another organization\'s client', data(await call('fmp.funnels.list', {}, U.AOWN, A)).length === 0
  && data(await call('fmp.funnels.get', { id: F1 }, U.AOWN, L)).length === 0 && (await call('fmp.funnels.create', { client: CA, name: 'x' }, U.ED)).status !== 200
  && (await call('fmp.funnels.update', { id: F1, client: CA }, U.ED)).status !== 200);
r = await call('fmp.funnels.update', { id: F1, graph: { ...GRAPH, nodes: [...GRAPH.nodes, { id: 'b', type: 'page', p: {} }] }, summary: { rev: 8000 } }, U.ED);
const stamp = data(r)[0]?.updated_at;
check('FD6', 'Saving a map updates it and returns the new save time', r.status === 200 && (await rows('select jsonb_array_length(graph->\'nodes\') n from fmp.funnels where id=$1', [F1]))[0].n === 3);
r = await call('fmp.funnels.update', { id: F1, name: 'Second tab', expected_updated_at: '2020-01-01T00:00:00Z' }, U.ED);
check('FD7', 'A save based on an older copy is refused (no silent overwrite of a newer save)', data(r).length === 0 && (await rows('select name from fmp.funnels where id=$1', [F1]))[0].name === 'PT tripwire'
  && data(await call('fmp.funnels.update', { id: F1, name: 'Renamed', expected_updated_at: new Date(stamp).toISOString() }, U.ED)).length === 1);

// ---- B. versions, actuals, products, templates, assets
r = await call('fmp.versions.add', { funnel: F1, graph: GRAPH, label: 'Autosave', auto: true }, U.ED);
check('FD8', 'Versions are added by editors, listed by viewers, refused for viewers to add', !!data(r)[0]?.id && data(await call('fmp.versions.list', { funnel: F1 }, U.VW)).length === 1
  && data(await call('fmp.versions.add', { funnel: F1, graph: GRAPH }, U.VW)).length === 0 && data(await call('fmp.versions.list', { funnel: F2 }, U.SCOPED)).length === 0);
r = await call('fmp.actuals.save', { funnel: F1, rows: [{ period_start: '2026-11-01', period_end: '2026-11-30', node_id: 'a', visitors: 2300, spend: 660 }] }, U.ED);
await call('fmp.actuals.save', { funnel: F1, rows: [{ period_start: '2026-11-01', period_end: '2026-11-30', node_id: 'a', visitors: 2400, spend: 700 }] }, U.ED);
await call('fmp.actuals.save', { funnel: F1, rows: [{ period_start: '2026-11-01', period_end: '2026-11-30', node_id: 'a', revenue: 90 }] }, U.ED);
check('FD9', 'Actuals save as one row per block and period (saving again updates it, a field left out keeps its value), and can be cleared', (await rows('select visitors, spend, revenue from fmp.funnel_actuals where funnel_id=$1', [F1])).map((x) => [Number(x.visitors), Number(x.spend), Number(x.revenue)].join('/')).join() === '2400/700/90'
  && data(await call('fmp.actuals.list', { funnels: [F1, F2] }, U.VW)).length === 1
  && data(await call('fmp.actuals.save', { funnel: F1, clear: { period_start: '2026-11-01', period_end: '2026-11-30', node_ids: ['a'] } }, U.ED)).length === 1
  && (await rows('select count(*)::int n from fmp.funnel_actuals'))[0].n === 0);
await call('fmp.products.save', { name: 'Org offer', params: { price: 27 } }, U.ED);
await call('fmp.products.save', { client: C1, name: 'Kickstart', params: { price: 37 } }, U.ED);
await call('fmp.products.save', { client: C2, name: 'Course', params: { price: 497 } }, U.ED);
check('FD10', 'Products: a client sees its own plus organization-wide ones; a scoped person never sees another client\'s', data(await call('fmp.products.list', { client: C1 }, U.ED)).map((p) => p.name).sort().join() === 'Kickstart,Org offer'
  && !data(await call('fmp.products.list', { client: C2 }, U.SCOPED)).some((p) => p.name === 'Course'));
await asSuper();
await db.query("insert into fmp.templates (builtin_key, name, category, graph) values ('quiz', 'Quiz funnel', 'Lead', '{\"nodes\":[],\"edges\":[]}')");
r = await call('fmp.templates.create', { name: 'Our webinar', graph: GRAPH }, U.ED); const T1 = data(r)[0]?.id;
check('FD11', 'Templates: built-in ones are readable by everyone with the app and cannot be deleted; own ones are per organization', data(await call('fmp.templates.list', {}, U.VW)).length === 2
  && data(await call('fmp.templates.list', {}, U.AOWN, A)).length === 0 && data(await call('fmp.templates.delete', { id: (await rows("select id from fmp.templates where builtin_key='quiz'"))[0].id }, U.OWN)).length === 0
  && data(await call('fmp.templates.delete', { id: T1 }, U.ED)).length === 1);
r = await call('fmp.assets.add', { kind: 'style', name: 'Bold', data: { fill: '#000' } }, U.ED);
check('FD12', 'Saved styles and blocks belong to the organization', !!data(r)[0]?.id && data(await call('fmp.assets.list', {}, U.VW)).length === 1 && data(await call('fmp.assets.list', {}, U.AOWN, A)).length === 0);
check('FD13', 'Default currency: admins change it, editors cannot', data(await call('fmp.settings.set', { default_currency: 'USD' }, U.OWN)).length === 1
  && (await call('fmp.settings.set', { default_currency: 'EUR' }, U.ED)).status !== 200 && data(await call('fmp.settings.get', {}, U.VW))[0]?.default_currency === 'USD');

// ---- B2. clients as Funnel Mapper shows them
r = await call('fmp.clients.update', { id: C1, business_name: 'Carter Strength', email: ' SAM@X.test ', pricing_model: 'hourly', pricing_amount: 60, hours_per_month: 10, notes: 'FM note', tags: ['pt'] }, U.ED);
const full = data(await call('fmp.clients.full', { id: C1 }, U.VW))[0];
check('FD30', 'Funnel Mapper client form: identity goes to the shared client, pricing and notes to Funnel Mapper\'s own record', r.status === 200 && full.business_name === 'Carter Strength' && full.email === 'sam@x.test'
  && full.pricing_model === 'hourly' && Number(full.pricing_amount) === 60 && full.notes === 'FM note' && (await rows('select business_name from client_profiles where client_id=$1', [C1]))[0].business_name === 'Carter Strength');
check('FD31', 'Viewers and people scoped elsewhere cannot change a client from Funnel Mapper', data(await call('fmp.clients.update', { id: C1, notes: 'x' }, U.VW)).length === 0
  && data(await call('fmp.clients.update', { id: C2, notes: 'x' }, U.SCOPED)).length === 0 && data(await call('fmp.clients.full', {}, U.SCOPED)).map((c) => c.id).join() === C1
  && data(await call('fmp.clients.full', {}, U.NOFMP)).length === 0);

// ---- C. share links and the public page
r = await call('fmp.links.create', { funnel: F1, allow_comments: true }, U.ED);
check('FD14', 'Editors cannot create share links (sharing is admin by default, sensitive)', data(r).length === 0 || r.status !== 200);
r = await call('fmp.links.create', { funnel: F1, allow_comments: true, can_edit: true }, U.OWN);
const TOK = data(r)[0]?.token, LK = data(r)[0]?.id;
check('FD15', 'An owner creates a link: the token is shown once and only its SHA-256 is stored', /^[0-9a-f]{48}$/.test(TOK ?? '') && (await rows('select token_hash from fmp.share_links where id=$1', [LK]))[0].token_hash !== TOK
  && !data(await call('fmp.links.list', { funnel: F1 }, U.OWN)).some((x) => 'token' in x || 'token_hash' in x));
r = await pub('get', TOK);
const shown = r.body?.data?.[0];
check('FD16', 'A visitor with the link sees the map without internal notes, screenshots or checklists, and no internal funnel notes', r.status === 200 && shown.funnel.name === 'Renamed'
  && !JSON.stringify(shown.funnel.graph).includes('internal note') && !JSON.stringify(shown.funnel.graph).includes('x.png') && !('notes' in shown.funnel.settings) && shown.client.name === 'Sam Carter');
r = await pub('comment', TOK, { node_id: 'a', author: 'Sam', body: 'Love it' });
check('FD17', 'A visitor can comment when the link allows it; the team sees the comment', r.status === 200 && data(await call('fmp.comments.list', { funnel: F1, unresolved: true }, U.VW)).length === 1);
r = await pub('save', TOK, { graph: { nodes: [{ id: 'a', type: 'traffic', p: { visitors: 3000 } }], edges: [] }, settings: { currency: 'GBP' } });
const after = (await rows('select graph, settings from fmp.funnels where id=$1', [F1]))[0];
check('FD18', 'An editable link saves the visitor\'s map but keeps the team\'s internal note and funnel notes', r.status === 200 && after.graph.nodes[0].p.visitors === 3000 && after.graph.nodes[0].desc === 'internal note' && after.settings.notes?.text === 'secret');
await call('fmp.links.update', { id: LK, hide_numbers: true }, U.OWN);
r = await pub('get', TOK);
check('FD19', 'With "hide numbers" the visitor gets no numbers and can no longer edit', r.body?.data?.[0]?.link?.can_edit === false && r.body.data[0].funnel.graph.nodes[0].p && Object.keys(r.body.data[0].funnel.graph.nodes[0].p).length === 0
  && (await pub('save', TOK, { graph: { nodes: [], edges: [] } })).status !== 200);
check('FD20', 'A wrong or malformed token answers "not found", like every other failure', (await pub('get', 'f'.repeat(48))).status === 404 && (await pub('get', 'not-a-token')).status === 404);

// ---- D. trash, restore, permanent delete
r = await call('fmp.clients.trash', { client: C1 }, U.ED);
check('FD21', 'Trashing a client in Funnel Mapper trashes its funnels too; its share link stops working', data(r).length === 1 && (await rows('select trashed_at from fmp.funnels where id=$1', [F1]))[0].trashed_at !== null
  && (await pub('get', TOK)).status === 404 && data(await call('fmp.funnels.list', { trashed: true }, U.ED)).length === 1);
check('FD22', 'The client stays in the Clients app (Funnel Mapper\'s trash is not the Clients archive)', (await rows('select archived_at from clients where id=$1', [C1]))[0].archived_at === null);
await call('fmp.funnels.trash', { id: F2 }, U.ED);
await call('fmp.clients.restore', { client: C1 }, U.ED);
check('FD23', 'Restoring the client brings back only the funnels trashed with it', (await rows('select trashed_at from fmp.funnels where id=$1', [F1]))[0].trashed_at === null && (await rows('select trashed_at from fmp.funnels where id=$1', [F2]))[0].trashed_at !== null);
r = await call('fmp.funnels.purge', { id: F2 }, U.ED);
check('FD24', 'Delete for good: an editor cannot; the owner can, and only for trashed funnels', data(r).length === 0 && data(await call('fmp.funnels.purge', { id: F1 }, U.OWN)).length === 0
  && data(await call('fmp.funnels.purge', { id: F2 }, U.OWN)).length === 1 && (await rows('select count(*)::int n from fmp.funnels where id=$1', [F2]))[0].n === 0);
await call('fmp.clients.trash', { client: C2 }, U.ED);
check('FD32', 'Deleting a trashed client for good removes its Funnel Mapper data (owner only) but keeps the shared client in Clients', data(await call('fmp.clients.purge', { client: C2 }, U.ED)).length === 0
  && data(await call('fmp.clients.purge', { client: C2 }, U.OWN)).length === 1 && (await rows('select count(*)::int n from fmp.products where client_id=$1', [C2]))[0].n === 0
  && (await rows('select count(*)::int n from clients where id=$1', [C2]))[0].n === 1);
const up = (input, u = U.ED, org = L) => call('fmp.files.upload', { size_bytes: 1000, mime_type: 'image/webp', ...input }, u, org).then(data);
const [shot] = await up({ kind: 'shot' });
const [pic] = shot ? await up({ kind: 'pic', of: shot.path }) : [];
check('FD33', 'Images go to the organization\'s Funnel Mapper folder; the block picture sits next to its capture; viewers and other organizations cannot add or sign them',
  !!shot && shot.path.startsWith(`${L}/fmp/shot/`) && pic?.path === shot.path.replace(/\.webp$/, '-pic.webp')
  && (await up({ kind: 'logo' }, U.VW)).length === 0 && (await up({ kind: 'pic', of: `${A}/fmp/shot/x.webp` })).length === 0
  && data(await call('fmp.files.url', { paths: [shot.path] }, U.VW)).length === 1 && data(await call('fmp.files.url', { paths: [shot.path] }, U.AOWN, A)).length === 0
  && data(await call('fmp.files.url', { paths: [`${L}/drive/x.pdf`] }, U.VW)).length === 0);
await asSuper();
const imgBytes = async () => Number((await rows('select coalesce(sum(size_bytes),0)::int n from fmp.images'))[0].n);
check('FD34', 'Funnel Mapper images are registered and count toward the one storage cap; a full store refuses the upload', await imgBytes() === 2000
  && Number((await rows('select private.storage_used_bytes()::int n'))[0].n) >= 2000
  && await (async () => { await db.query('update storage_settings set cap_bytes = private.storage_used_bytes() + 500'); const r = await call('fmp.files.upload', { kind: 'logo', size_bytes: 1000, mime_type: 'image/webp' }, U.ED);
    await db.query('update storage_settings set cap_bytes = 8000000000'); return r.status === 507 && r.body?.error?.code === 'storage_limit'; })()
  && await imgBytes() === 2000);
const sw = async (page, user = U.ED, org = L) => data(await call('org.switch', { org, app: 'funnel_mapper_pro', page }, user, org))[0] ?? {};
const [a1, a2, a3, a4] = [await sw('templates'), await sw('funnel'), await sw('client'), await sw('home', U.ED, A)];
check('FD35', 'Switching organization in Funnel Mapper follows the ecosystem rule: same page kept, a funnel or client never comes along, other organizations refused',
  a1.outcome === 'same_page' && a1.page_key === 'templates' && a2.outcome === 'record_not_carried' && a2.page_key === 'funnels'
  && a3.outcome === 'record_not_carried' && a3.page_key === 'clients' && a4.outcome === 'not_available');
await asSuper();
check('FD25', 'Funnel and share-link changes are in the audit log', (await rows("select count(*)::int n from audit_events where workspace_id=$1 and action like 'funnels.%'", [L]))[0].n >= 3
  && (await rows("select count(*)::int n from audit_events where workspace_id=$1 and action like 'share_links.%'", [L]))[0].n >= 1);

// ---- E. direct database access stays closed
await asUser(U.AOWN);
check('FD26', 'Aurj reads nothing of Layer2Funnels in any Funnel Mapper table', (await rows('select id from fmp.funnels union all select id from fmp.products union all select id from fmp.funnel_versions')).length === 0);
await asUser(U.ED);
check('FD27', 'A versions row cannot be moved to another funnel', ['P0001', '42501'].includes(await errCode(async () => { const [v] = await rows('select id from fmp.funnel_versions limit 1'); if (!v) throw Object.assign(new Error('none'), { code: 'P0001' }); await db.query('update fmp.funnel_versions set funnel_id = $1 where id = $2', [F2, v.id]); })));
await asUser(U.OWN);
check('FD29', 'Even the owner cannot delete a funnel straight from the database unless it is in the trash', (await db.query('delete from fmp.funnels where id = $1', [F1])).affectedRows === 0 && (await rows('select 1 from fmp.funnels where id=$1', [F1])).length === 1);
await asUser(U.ED);
check('FD28', 'The share-link hash is not readable without sharing rights', (await rows('select token_hash from fmp.share_links')).length === 0);

for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}${x.ok ? '' : `  [${x.detail}]`}`);
const p = results.filter((x) => x.ok).length; console.log(`\n${p}/${results.length} checks passed`);
await db.close(); process.exit(p === results.length ? 0 : 1);
