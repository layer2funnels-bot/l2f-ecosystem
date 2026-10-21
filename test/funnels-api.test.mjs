// Office → Funnels through the API layer, end to end against the real database: org list, CRUD, sharing, archive-before-delete.
import { randomUUID as id } from 'node:crypto';
import { openDb, migrate, recorder } from './lib.mjs';
import { createApi, NO_ORG } from '../packages/core/api.mjs';
import { createPgExecutor } from '../packages/core/pg-executor.mjs';
import { createRateLimiter } from '../packages/core/rate-limit.mjs';
import { createSafeLogger } from '../packages/core/safe-log.mjs';

const db = await openDb(); await migrate(db);
const { results, check } = recorder();
let chain = Promise.resolve();
const acquire = () => { const prev = chain; let release; chain = new Promise((r) => { release = r; }); return prev.then(() => ({ query: (s, p) => db.query(s, p), release })); };
const BIG = { read: { max: 1e6, windowMs: 6e4 }, write: { max: 1e6, windowMs: 6e4 }, sensitive: { max: 1e6, windowMs: 6e4 } };
const api = createApi({ executor: createPgExecutor({ acquire, role: 'app_user' }), logger: createSafeLogger(() => {}), limiter: createRateLimiter({ limits: BIG }) });

await db.exec('reset role');
const L = id(), A = id(); const U = { OWN: id(), ADM: id(), ED: id(), VW: id(), NOAPP: id(), BOTH: id(), NONE: id() };
await db.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','Layer2Funnels'),($2,'aurj','Aurj')", [L, A]);
const staff = (u, ws, r) => db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff',$3)", [ws, u, r]);
await staff(U.OWN, L, 'owner'); await staff(U.ADM, L, 'admin'); await staff(U.ED, L, 'editor'); await staff(U.VW, L, 'viewer'); await staff(U.NOAPP, L, 'editor');
await staff(U.BOTH, L, 'editor'); await staff(U.BOTH, A, 'editor');
for (const [u, ws] of [[U.ED, L], [U.VW, L], [U.BOTH, L], [U.BOTH, A]]) await db.query("insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,'office')", [ws, u]);
const C1 = id(); await db.query("insert into clients (id,workspace_id,name) values ($1,$2,'Client 1')", [C1, L]);

const call = (op, input, user, org = L) => api.handle({ operation: op, input, auth: { userId: user, email: 'x@example.com' }, headers: { 'x-org-id': org } });
const code = (r) => r.body.error?.code;

// ---- organizations
let r = await call('org.list', {}, U.BOTH, NO_ORG);
check('FA1', 'org.list answers without an organization chosen: both organizations for a person in both', r.status === 200 && r.body.data.map((o) => o.slug).sort().join() === 'aurj,layer2funnels');
r = await call('org.list', {}, U.NONE, NO_ORG);
check('FA2', 'A person with no membership gets an empty list (the "no workspace yet" state)', r.status === 200 && r.body.data.length === 0);
await call('org.switch', { org: A, app: 'office' }, U.BOTH, L);
r = await call('org.list', {}, U.BOTH, NO_ORG);
check('FA3', 'The active organization is flagged after a switch', r.body.data.filter((o) => o.is_active).map((o) => o.slug).join() === 'aurj');
r = await call('org.list', {}, U.ED, NO_ORG);
check('FA4', 'org.list never shows organizations the person is not in', r.body.data.length === 1 && r.body.data[0].org_id === L);

// ---- create / read / update
r = await call('funnels.avatars.create', { name: 'Busy founder', pains: 'No time', summary: 'x' }, U.ED);
const av = r.body.data?.[0];
check('FA5', 'Editor creates an avatar; organization comes from the header and created_by from the token', r.status === 200 && av.workspace_id === L && av.created_by === U.ED && av.client_visible === false);
r = await call('funnels.avatars.list', {}, U.VW);
check('FA6', 'Viewer lists it', r.status === 200 && r.body.data.some((x) => x.id === av.id));
r = await call('funnels.avatars.create', { name: 'x' }, U.VW);
const denied = r;
check('FA7', 'Viewer cannot create: a plain not-found', r.status === 404 && code(r) === 'not_found');
r = await call('funnels.avatars.update', { id: id(), name: 'x' }, U.ED);
check('FA8', 'Updating a record that does not exist is byte-identical to a denied update', r.status === 404 && JSON.stringify(r.body.error) === JSON.stringify(denied.body.error));
r = await call('funnels.avatars.update', { id: av.id, name: 'Busy founder 2', desires: 'Calm' }, U.ED);
check('FA9', 'Editor updates only the fields sent', r.status === 200 && r.body.data[0].name === 'Busy founder 2' && r.body.data[0].pains === 'No time' && r.body.data[0].desires === 'Calm');
r = await call('funnels.avatars.update', { id: av.id, workspace_id: A }, U.ED);
check('FA10', 'A request cannot smuggle workspace_id (or any undeclared column)', r.status === 422 && r.body.error.fields.join() === 'workspace_id');
r = await call('funnels.avatars.get', { id: av.id }, U.BOTH, A);
check('FA11', 'Same person, other organization header: the record is not found', r.status === 404);
r = await call('funnels.avatars.get', { id: av.id }, U.NOAPP);
check('FA12', 'An editor without the Office app cannot read it', r.status === 404);
r = await call('funnels.overview', {}, U.NOAPP);
check('FA13', 'Counts never reveal hidden records: all zero for someone who cannot see any', r.status === 200 && r.body.data.every((x) => x.n === 0));
r = await call('funnels.overview', {}, U.ED);
check('FA14', 'Overview counts live records of each type', r.body.data.length === 4 && r.body.data.find((x) => x.type === 'avatars').n === 1);

// ---- other types
r = await call('funnels.offers.create', { name: 'Core offer', kind: 'offer', price_amount: 497, currency: 'USD', avatar_id: av.id }, U.ED);
const offer = r.body.data?.[0];
check('FA15', 'Offer with price, currency and a linked avatar', r.status === 200 && Number(offer.price_amount) === 497 && offer.avatar_id === av.id);
r = await call('funnels.offers.create', { name: 'Odd', price_amount: 5 }, U.ED);
check('FA16', 'A price without a currency is refused as invalid (database rule), no database text shown', r.status === 422 && !JSON.stringify(r.body).match(/check|constraint|funnel_offers/));
r = await call('funnels.stories.create', { title: 'Origin', kind: 'origin', body: 'Once…', offer_id: offer.id }, U.ED);
check('FA17', 'Story linked to an offer', r.status === 200 && r.body.data[0].offer_id === offer.id);
r = await call('funnels.brand_kits.create', { name: 'Main', colors: ['#173a8f', '#ff7a59'], fonts: ['Hanken Grotesk'], voice: 'Plain' }, U.ED);
check('FA18', 'Brand kit stores colours and fonts as lists', r.status === 200 && r.body.data[0].colors.length === 2 && r.body.data[0].fonts[0] === 'Hanken Grotesk');
r = await call('funnels.brand_kits.create', { name: 'Bad', colors: ['blue'] }, U.ED);
check('FA19', 'A colour that is not #rrggbb is refused by name of field only', r.status === 422 && r.body.error.fields.join() === 'colors');

// ---- sharing, archive, delete
r = await call('funnels.avatars.create', { name: 'Client avatar', client: C1 }, U.ED);
const cav = r.body.data[0];
r = await call('funnels.avatars.share', { id: cav.id, visible: true }, U.ED);
check('FA20', 'Editor cannot share with the client', r.status === 404);
r = await call('funnels.avatars.share', { id: cav.id, visible: true }, U.ADM);
check('FA21', 'Admin shares it', r.status === 200 && r.body.data[0].client_visible === true);
r = await call('funnels.avatars.share', { id: av.id, visible: true }, U.ADM);
check('FA22', 'An organization-wide record cannot be shared with a client', r.status === 422);
r = await call('funnels.avatars.delete', { id: cav.id }, U.OWN);
check('FA23', 'Deleting an unarchived record is refused (archive first)', r.status === 422);
r = await call('funnels.avatars.archive', { id: cav.id }, U.ED);
check('FA24', 'Editor archives', r.status === 200 && r.body.data[0].archived_at);
r = await call('funnels.avatars.list', { client: C1 }, U.ED);
const live = r.body.data.length;
r = await call('funnels.avatars.list', { client: C1, archived: true }, U.ED);
check('FA25', 'Archived records leave the default list and appear in the archive view', live === 0 && r.body.data.length === 1);
r = await call('funnels.avatars.restore', { id: cav.id }, U.ED);
check('FA26', 'Restore brings it back', r.status === 200 && r.body.data[0].archived_at === null);
await call('funnels.avatars.archive', { id: cav.id }, U.ED);
r = await call('funnels.avatars.delete', { id: cav.id }, U.ADM);
check('FA27', 'An admin cannot permanently delete (owner only)', r.status === 404);
r = await call('funnels.avatars.delete', { id: cav.id }, U.OWN);
check('FA28', 'Owner deletes an archived, unreferenced record', r.status === 200);

// ---- references
r = await call('funnels.references.link', { referrer_app: 'clients', referrer_type: 'client', referrer_id: C1, target_type: 'offer', target_id: offer.id, client: C1 }, U.ED);
const ref = r.body.data?.[0];
check('FA29', 'Clients link an offer by ID', r.status === 200 && ref.offer_id === offer.id);
r = await call('funnels.references.list', { referrer_app: 'clients', referrer_id: C1 }, U.VW);
check('FA30', 'Viewer lists the link', r.status === 200 && r.body.data.length === 1);
await call('funnels.offers.archive', { id: offer.id }, U.ED);
r = await call('funnels.offers.delete', { id: offer.id }, U.OWN);
check('FA31', 'A linked offer cannot be deleted, even archived', r.status === 422);
r = await call('funnels.references.unlink', { id: ref.id }, U.ED);
check('FA32', 'Unlink works', r.status === 200);
r = await call('funnels.references.link', { referrer_app: 'clients', referrer_type: 'client', referrer_id: C1, target_type: 'offer', target_id: offer.id }, U.VW);
check('FA33', 'Viewer cannot link', r.status === 404);

for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}`);
const p = results.filter((x) => x.ok).length; console.log(`\n${p}/${results.length} checks passed`);
await db.close(); process.exit(p === results.length ? 0 : 1);
