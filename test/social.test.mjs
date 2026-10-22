// Social Planner (migration 0021): posts, calendar, status flow driven by Approvals, media from Drive, locks while under review, scope, isolation, audit.
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
for (const u of [U.ED, U.ED2, U.VW]) for (const a of ['social_planner', 'drive', 'clients']) await db.query("insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,$3)", [L, u, a]);
const lvl0 = async (n) => (await rows('select id from access_levels where workspace_id=$1 and name=$2', [L, n]))[0].id;
await db.query("insert into access_assignments (workspace_id,access_level_id,principal_type,principal_id) values ($1,$2,'user',$3)", [L, await lvl0('All clients · edit'), U.ED]);
await db.query("insert into access_assignments (workspace_id,access_level_id,principal_type,principal_id) values ($1,$2,'user',$3)", [L, await lvl0('All clients · read'), U.VW]);
const mkfile = (id_, ws, client, space, name) => db.query("insert into files (id,workspace_id,client_id,space,name,kind,mime_type,size_bytes,storage_path,uploaded_by) values ($1,$2,$3,$4,$5,'file','image/png',10,$6,$7)", [id_, ws, client, space, name, `${ws}/${client ? `clients/${client}` : 'shared'}/${name}`, U.OWN]);
const FL = { c1: id(), c2: id(), sh: id(), a: id() };
await mkfile(FL.c1, L, C1, 'client', 'one.png'); await mkfile(FL.c2, L, C2, 'client', 'two.png'); await mkfile(FL.sh, L, null, 'shared', 'logo.png'); await mkfile(FL.a, A, null, 'shared', 'aurj.png');

let r = await J('social.posts.create', { channel: 'instagram', title: 'Launch day' }, U.ED);
check('SP1', 'While the app is "coming soon" nobody can create a post', r.status === 404);
await asSuper(); await db.query("update apps set lifecycle = 'active' where key = 'social_planner'");
await db.query("insert into workspace_apps (workspace_id, app_key, enabled) values ($1, 'social_planner', true) on conflict (workspace_id, app_key) do update set enabled = true", [L]);

const mk = (over = {}, u = U.ED) => J('social.posts.create', { channel: 'instagram', title: 'Launch day', caption: 'Big news', client: C1, ...over }, u);
r = await mk();
const P1 = r.row?.id;
check('SP2', 'An editor creates a post as an idea, for a client', r.status === 200 && r.row.status === 'idea' && r.row.client_id === C1 && r.row.files.length === 0, JSON.stringify(r.body));
r = await J('social.posts.set_status', { id: P1, status: 'draft' }, U.ED);
check('SP3', 'An idea becomes a draft', r.status === 200 && r.row.status === 'draft');
for (const s of ['approved']) { r = await J('social.posts.set_status', { id: P1, status: s }, U.ED); check(`SP4-${s}`, `A person cannot set "${s}" directly: it comes from the approval of the post`, r.status !== 200); }
await asSuper(); const direct = await (async () => { await asUser(U.ED); return errCode(() => db.query("update social_posts set status = 'in_review' where id = $1", [P1])); })();
check('SP4-direct', 'Nor can they set "in review" with a direct update', direct === 'P0001');
r = await J('social.posts.set_status', { id: P1, status: 'scheduled', scheduled_for: '2026-12-01T09:00:00Z' }, U.ED);
check('SP5', 'A draft cannot be scheduled (only an approved post)', r.status !== 200);

// ---- review through Approvals
r = await J('social.posts.submit_for_review', { id: P1, note: 'Please check the caption' }, U.ED);
check('SP6', 'Asking for review makes an approval of the post and puts the post in review', r.status === 200 && r.row.status === 'in_review', JSON.stringify(r.body));
const ap = (await J('approvals.list', { subject_type: 'post', status: 'pending' }, U.ADM)).data;
check('SP7', 'The approval is listed for deciders, with the post as its subject and the client copied', ap.length === 1 && ap[0].subject_id === P1 && ap[0].client_id === C1);
check('SP8', 'A second review request for the same post is refused', (await J('social.posts.submit_for_review', { id: P1 }, U.ED)).status !== 200);
r = await J('social.posts.update', { id: P1, caption: 'Sneaky edit' }, U.ED);
check('SP9', 'The content cannot change while the post is in review', r.status !== 200 && (await J('social.posts.get', { id: P1 }, U.ED)).row.caption === 'Big news');
check('SP10', 'The status cannot be moved by hand while in review', (await J('social.posts.set_status', { id: P1, status: 'draft' }, U.ED)).status !== 200);
r = await J('approvals.decide', { id: ap[0].id, decision: 'rejected', note: 'Shorter caption' }, U.ADM);
check('SP11', 'A rejection sends the post back to draft', r.status === 200 && (await J('social.posts.get', { id: P1 }, U.ED)).row.status === 'draft');
r = await J('social.posts.update', { id: P1, caption: 'Shorter caption' }, U.ED);
check('SP12', 'It can be edited again', r.status === 200 && r.row.caption === 'Shorter caption');
r = await J('approvals.request', { subject_type: 'post', subject: P1, title: 'Launch day v2', previous: ap[0].id }, U.ED);
check('SP13', 'Resubmitting after a rejection is the same flow (version 2 of the approval) and puts the post back in review', r.status === 200 && r.row.version === 2 && (await J('social.posts.get', { id: P1 }, U.ED)).row.status === 'in_review');
const ap2 = r.row.id;
r = await J('approvals.withdraw', { id: ap2 }, U.ED);
check('SP14', 'Withdrawing the request sends the post back to draft', r.status === 200 && (await J('social.posts.get', { id: P1 }, U.ED)).row.status === 'draft');
r = await J('social.posts.submit_for_review', { id: P1 }, U.ED);
r = await J('approvals.list', { subject_type: 'post', status: 'pending' }, U.ADM);
r = await J('approvals.decide', { id: r.data[0].id, decision: 'approved', note: 'Go' }, U.ADM);
check('SP15', 'An approval puts the post in "approved"', r.status === 200 && (await J('social.posts.get', { id: P1 }, U.ED)).row.status === 'approved');
check('SP16', 'Approved content is locked too', (await J('social.posts.update', { id: P1, title: 'Other' }, U.ED)).status !== 200);

// ---- scheduling and publishing
r = await J('social.posts.set_status', { id: P1, status: 'scheduled' }, U.ED);
check('SP17', 'Scheduling needs a time', r.status !== 200);
r = await J('social.posts.set_status', { id: P1, status: 'scheduled', scheduled_for: '2026-12-01T09:00:00Z' }, U.VW);
check('SP18', 'A viewer cannot schedule', r.status === 404);
r = await J('social.posts.set_status', { id: P1, status: 'scheduled', scheduled_for: '2026-12-01T09:00:00Z' }, U.ED);
check('SP19', 'An editor schedules an approved post', r.status === 200 && r.row.status === 'scheduled' && new Date(r.row.scheduled_for).toISOString().startsWith('2026-12-01'));
r = await J('social.posts.set_status', { id: P1, status: 'published' }, U.ED);
check('SP20', 'Marking it published records the time; "published" is final', r.status === 200 && r.row.status === 'published' && r.row.published_at && (await J('social.posts.set_status', { id: P1, status: 'draft' }, U.ED)).status !== 200);
check('SP21', 'A published post cannot be edited', (await J('social.posts.update', { id: P1, caption: 'x' }, U.ED)).status !== 200);

// ---- media from Drive
const P2 = (await mk({ title: 'Media post', status: 'draft' })).row.id;
r = await J('social.posts.files.set', { id: P2, files: [FL.c1, FL.sh] }, U.ED);
check('SP22', 'Media: a client\'s own file and a shared file can be attached, in order', r.status === 200 && r.row.files.join() === [FL.c1, FL.sh].join());
check('SP23', 'Another client\'s file and another organization\'s file cannot', (await J('social.posts.files.set', { id: P2, files: [FL.c2] }, U.ED)).status !== 200 && (await J('social.posts.files.set', { id: P2, files: [FL.a] }, U.ED)).status !== 200
  && (await J('social.posts.get', { id: P2 }, U.ED)).row.files.join() === [FL.c1, FL.sh].join());
await J('social.posts.submit_for_review', { id: P2 }, U.ED);
check('SP24', 'Media cannot change while the post is in review', (await J('social.posts.files.set', { id: P2, files: [] }, U.ED)).status !== 200);

// ---- calendar
const d = (n, ch) => mk({ title: `Post ${n}`, channel: ch, scheduled_for: `2026-11-${String(n).padStart(2, '0')}T10:00:00Z`, status: 'draft' });
await d(3, 'linkedin'); await d(10, 'instagram'); await d(20, 'linkedin'); await mk({ title: 'Other client', client: C2, scheduled_for: '2026-11-05T10:00:00Z', status: 'draft' });
r = await J('social.calendar', { from: '2026-11-01', to: '2026-11-15' }, U.VW);
check('SP25', 'The calendar lists posts planned between two dates, in time order', r.status === 200 && r.data.map((x) => x.title).join() === 'Post 3,Other client,Post 10', r.data.map((x) => x.title).join());
r = await J('social.calendar', { from: '2026-11-01', to: '2026-11-30', channel: 'linkedin', client: C1 }, U.VW);
check('SP26', '…and filters by channel and client', r.data.map((x) => x.title).join() === 'Post 3,Post 20');
check('SP27', 'The last day is included', (await J('social.calendar', { from: '2026-11-20', to: '2026-11-20' }, U.VW)).data.length === 1);

// ---- archive, delete, scope, isolation, audit
check('SP28', 'An active post cannot be deleted; archived, only an owner or admin by default can', (await J('social.posts.delete', { id: P2 }, U.OWN)).status !== 200);
const P3 = (await mk({ title: 'Scrap', status: 'draft' })).row.id;
await J('social.posts.archive', { id: P3 }, U.ED);
check('SP29', 'An archived post is deleted by an owner, not an editor', (await J('social.posts.delete', { id: P3 }, U.ED)).status === 404 && (await J('social.posts.delete', { id: P3 }, U.OWN)).status === 200);
await asSuper();
await db.query("insert into permission_overrides (workspace_id,principal_type,principal_id,permission_key,effect,client_id,reason) values ($1,'user',$2,'social.post.view','deny',$3,'test')", [L, U.ED2, C1]);
check('SP30', 'A restriction on one client hides that client\'s posts from that person only', (await J('social.posts.list', {}, U.ED2)).data.every((x) => x.client_id !== C1) && (await J('social.posts.get', { id: P2 }, U.ED2)).status === 404 && (await J('social.posts.get', { id: P2 }, U.ED)).status === 200);
check('SP31', 'Another organization sees nothing, and a person in both sees only the named organization', (await J('social.posts.list', {}, U.AOWN, A)).data.length === 0 && (await J('social.posts.get', { id: P2 }, U.AOWN, L)).status === 404
  && (await J('social.calendar', { from: '2026-01-01', to: '2026-12-31' }, U.BOTH, A)).data.length === 0 && (await asUser(U.BOTH, { org: A }).then(() => rows('select id from social_posts'))).length === 0);
await asSuper();
check('SP32', 'A client that has posts cannot be deleted', (await errCode(() => db.query('delete from clients where id = $1', [C1]))) === 'P0001');
const au = JSON.stringify((await rows("select detail from audit_events where action like 'social_%'")).map((x) => x.detail));
check('SP33', 'The audit log records posts by id, channel, title and status, never the captions', au.length > 50 && !au.includes('Big news') && !au.includes('Shorter caption'));

for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(9)} ${x.name}${x.ok ? '' : `  [${x.detail ?? ''}]`}`);
const p = results.filter((x) => x.ok).length; console.log(`\n${p}/${results.length} checks passed`); await db.close(); process.exit(p === results.length ? 0 : 1);
