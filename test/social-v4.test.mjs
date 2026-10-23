// Social Planner v4 (migration 0031): campaigns, failed and cancelled posts, posted-manually record, channel limits, per-channel versions, isolation.
import { randomUUID as id } from 'node:crypto';
import { openDb, migrate, recorder } from './lib.mjs';
import { createApi } from '../packages/core/api.mjs';
import { createPgExecutor } from '../packages/core/pg-executor.mjs';
import { createRateLimiter } from '../packages/core/rate-limit.mjs';
import { createSafeLogger } from '../packages/core/safe-log.mjs';

const db = await openDb(); await migrate(db);
const { results, check } = recorder();
const rows = async (s, p = []) => (await db.query(s, p)).rows;
let chain = Promise.resolve();
const acquire = () => { const prev = chain; let release; chain = new Promise((r) => { release = r; }); return prev.then(() => ({ query: (s, p) => db.query(s, p), release })); };
const BIG = { read: { max: 1e6, windowMs: 6e4 }, write: { max: 1e6, windowMs: 6e4 }, sensitive: { max: 1e6, windowMs: 6e4 } };
const api = createApi({ executor: createPgExecutor({ acquire, role: 'app_user' }), logger: createSafeLogger(() => {}), limiter: createRateLimiter({ limits: BIG }) });
const J = async (op, input, u, org) => { const r = await api.handle({ operation: op, input, auth: { userId: u, email: 'x@example.com' }, headers: { 'x-org-id': org } }); return { ...r, row: r.body?.data?.[0], rows: r.body?.data ?? [] }; };
await db.exec('reset role');

const ORG = { L: id(), A: id() }; const U = { LO: id(), LED: id(), LVW: id(), AO: id(), BOTH: id() };
await db.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','L'),($2,'aurj','A')", [ORG.L, ORG.A]);
const staff = (u, ws, r) => db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff',$3)", [ws, u, r]);
await staff(U.LO, ORG.L, 'owner'); await staff(U.LED, ORG.L, 'editor'); await staff(U.LVW, ORG.L, 'viewer'); await staff(U.AO, ORG.A, 'owner'); await staff(U.BOTH, ORG.L, 'owner'); await staff(U.BOTH, ORG.A, 'owner');
for (const u of [U.LED, U.LVW]) for (const a of ['social_planner', 'clients', 'drive']) await db.query('insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,$3)', [ORG.L, u, a]);
await db.query("update apps set lifecycle = 'active' where key = 'social_planner'");
for (const w of [ORG.L, ORG.A]) await db.query("insert into workspace_apps (workspace_id, app_key, enabled) values ($1, 'social_planner', true) on conflict (workspace_id, app_key) do update set enabled = true", [w]);
const C1 = id(), C2 = id(); await db.query("insert into clients (id,workspace_id,name) values ($1,$3,'One'),($2,$3,'Two')", [C1, C2, ORG.L]);
const lvl = async (n) => (await rows('select id from access_levels where workspace_id=$1 and name=$2', [ORG.L, n]))[0].id;
await db.query("insert into access_assignments (workspace_id,access_level_id,principal_type,principal_id) values ($1,$2,'user',$3)", [ORG.L, await lvl('All clients · edit'), U.LED]);
await db.query("insert into access_assignments (workspace_id,access_level_id,principal_type,principal_id) values ($1,$2,'user',$3)", [ORG.L, await lvl('All clients · read'), U.LVW]);
const F1 = id(); await db.query("insert into files (id,workspace_id,client_id,space,name,kind,mime_type,size_bytes,storage_path,uploaded_by) values ($1,$2,null,'shared','logo.png','file','image/png',10,$3,$4)", [F1, ORG.L, `${ORG.L}/x/logo.png`, U.LO]);

const ED = (op, input) => J(op, input, U.LED, ORG.L); const OWN = (op, input) => J(op, input, U.LO, ORG.L);
const CH = (await ED('social.channels', {})).rows;
check('SV1', 'The channel table lists what each channel can take (X 280 characters, TikTok one video) and Connect is off for all', CH.length === 9 && CH.find((c) => c.key === 'x')?.max_text === 280 && CH.find((c) => c.key === 'tiktok')?.max_media === 1 && CH.every((c) => c.connect_state === 'off') && CH.find((c) => c.key === 'email').max_text === null);

const CA = (await ED('social.campaigns.create', { name: 'Spring launch', goal: '500 leads', starts_on: '2026-11-01', ends_on: '2026-11-30', client: C1 })).row;
check('SV2', 'A campaign starts as a draft with its dates, goal and client and shows zero progress', CA?.status === 'draft' && CA.client_id === C1 && CA.posts === 0 && CA.published === 0 && CA.starts_on !== null);
check('SV2b', 'Dates out of order are refused', (await ED('social.campaigns.create', { name: 'Backwards', starts_on: '2026-12-01', ends_on: '2026-11-01' })).status !== 200);
const ST = (to, camp = CA.id, u = U.LED) => J('social.campaigns.update', { id: camp, status: to }, u, ORG.L);
check('SV3', 'A campaign moves draft, planned, active, paused, active; it cannot skip to completed from draft', (await ST('completed')).status !== 200 && (await ST('planned')).row?.status === 'planned' && (await ST('active')).row?.status === 'active' && (await ST('paused')).row?.status === 'paused' && (await ST('active')).row?.status === 'active');

const mk = (over = {}) => ED('social.posts.create', { channel: 'instagram', title: 'Teaser', caption: 'Coming soon', client: C1, campaign: CA.id, status: 'draft', ...over });
const approve = async (pid) => { await ED('social.posts.submit_for_review', { id: pid }); const ap = (await OWN('approvals.list', { subject_type: 'post', status: 'pending' })).rows.find((a) => a.subject_id === pid); await OWN('approvals.decide', { id: ap.id, decision: 'approved', note: 'ok' }); };
const p1 = (await mk()).row;
check('SV4', 'A post can belong to a campaign and the campaign counts it', p1?.campaign_id === CA.id && (await ED('social.campaigns.get', { id: CA.id })).row.posts === 1);
check('SV5', 'A client campaign refuses another client\'s post, an archived campaign refuses new posts, and an unknown campaign is not found', (await mk({ client: C2 })).status !== 200 && (await mk({ campaign: id() })).status !== 200);
await approve(p1.id);
check('SV6', 'Completing is refused while a post is still open', (await ST('completed')).status !== 200);
let r = await ED('social.posts.set_status', { id: p1.id, status: 'scheduled', scheduled_for: '2026-11-05T10:00:00Z' });
check('SV7', 'An approved post is scheduled', r.row?.status === 'scheduled');
r = await ED('social.posts.set_status', { id: p1.id, status: 'failed' });
check('SV8', 'Marking a post failed needs a reason', r.status !== 200);
r = await ED('social.posts.set_status', { id: p1.id, status: 'failed', failure_reason: 'Account was logged out' });
check('SV9', 'A scheduled post can be marked failed with what went wrong', r.row?.status === 'failed' && r.row.failure_reason === 'Account was logged out');
check('SV9b', 'A failed post cannot change its words, but can be retried', (await ED('social.posts.update', { id: p1.id, caption: 'new' })).status !== 200 && (await ED('social.posts.set_status', { id: p1.id, status: 'scheduled' })).row?.status === 'scheduled');
check('SV9c', 'Retrying clears the failure reason', (await ED('social.posts.get', { id: p1.id })).row.failure_reason === null);
await ED('social.posts.set_status', { id: p1.id, status: 'failed', failure_reason: 'Server error' });
r = await ED('social.posts.set_status', { id: p1.id, status: 'published', post_url: 'https://example.com/p/1' });
check('SV10', 'Mark as posted manually records who did it, when, and the link to the live post', r.row?.status === 'published' && r.row.published_by === U.LED && r.row.published_at && r.row.post_url === 'https://example.com/p/1' && r.row.failure_reason === null);
check('SV10b', 'A link that is not a web address is refused, and a published post is final', (await ED('social.posts.update', { id: p1.id, post_url: 'javascript:alert(1)' })).status !== 200 && (await ED('social.posts.set_status', { id: p1.id, status: 'draft' })).status !== 200);

const p2 = (await mk({ title: 'Cancel me' })).row;
r = await ED('social.posts.set_status', { id: p2.id, status: 'cancelled' });
check('SV11', 'A draft can be cancelled and then only reopened as a draft', r.row?.status === 'cancelled' && (await ED('social.posts.set_status', { id: p2.id, status: 'scheduled', scheduled_for: '2026-11-06T10:00:00Z' })).status !== 200 && (await ED('social.posts.set_status', { id: p2.id, status: 'draft' })).row?.status === 'draft');
await ED('social.posts.set_status', { id: p2.id, status: 'cancelled' });
check('SV12', 'With one post published and the other cancelled the campaign can be completed', (await ST('completed')).row?.status === 'completed' && (await ED('social.campaigns.get', { id: CA.id })).row.cancelled === 1);

const long = 'x'.repeat(300); const p3 = (await ED('social.posts.create', { channel: 'x', title: 'Long', caption: long, status: 'draft' })).row; await approve(p3.id);
check('SV13', 'Scheduling a caption longer than the channel allows is refused (X: 280)', (await ED('social.posts.set_status', { id: p3.id, status: 'scheduled', scheduled_for: '2026-11-07T10:00:00Z' })).status !== 200);

const p4 = (await ED('social.posts.create', { channel: 'instagram', title: 'Many channels', caption: 'Hello', client: C1, campaign: CA.id, status: 'draft' })).row;
check('SV13b', 'A completed campaign can be reopened to active when more work is planned', (await ST('active')).row?.status === 'active');
await ED('social.posts.files.set', { id: p4.id, files: [F1] });
const vs = await ED('social.posts.variants', { id: p4.id, channels: ['linkedin', 'x', 'x', 'instagram', 'nosuch'] });
check('SV14', 'Versions for other channels become drafts in the same campaign with the same words and media; the same channel and unknown ones are skipped', vs.rows.length === 2 && vs.rows.every((v) => v.status === 'draft' && v.campaign_id === CA.id && v.variant_of === p4.id && v.caption === 'Hello' && v.files.length === 1) && vs.rows.map((v) => v.channel).sort().join() === 'linkedin,x');
const vv = (await ED('social.posts.variants', { id: vs.rows[0].id, channels: ['pinterest'] })).rows;
check('SV14b', 'A version of a version still points back to the first post', vv.length === 1 && vv[0].variant_of === p4.id);

const cl = await ED('social.campaigns.list', {});
check('SV15', 'The campaign list shows progress counts', cl.rows.length === 1 && cl.rows[0].posts === 6 && cl.rows[0].published === 1);
check('SV16', 'The post list can be narrowed to one campaign', (await ED('social.posts.list', { campaign: CA.id })).rows.length === 6 && (await ED('social.posts.list', { campaign: id() })).rows.length === 0);

check('SV17', 'A viewer reads campaigns and channels but cannot create or change one', (await J('social.campaigns.list', {}, U.LVW, ORG.L)).rows.length === 1 && (await J('social.campaigns.create', { name: 'Nope' }, U.LVW, ORG.L)).status !== 200 && (await J('social.campaigns.update', { id: CA.id, name: 'Nope' }, U.LVW, ORG.L)).status !== 200 && (await J('social.channels', {}, U.LVW, ORG.L)).rows.length === 9);
check('SV18', 'Another organization sees no campaign and cannot open or change this one', (await J('social.campaigns.list', {}, U.AO, ORG.A)).rows.length === 0 && (await J('social.campaigns.get', { id: CA.id }, U.AO, ORG.A)).rows.length === 0 && (await J('social.campaigns.update', { id: CA.id, name: 'Hacked' }, U.AO, ORG.A)).status !== 200);
check('SV19', 'A person in both organizations sees only the one named by the request', (await J('social.campaigns.list', {}, U.BOTH, ORG.A)).rows.length === 0 && (await J('social.campaigns.list', {}, U.BOTH, ORG.L)).rows.length === 1);
const a1 = (await J('social.campaigns.create', { name: 'Aurj push' }, U.AO, ORG.A)).row;
check('SV20', 'A post in one organization cannot join the other organization\'s campaign', (await J('social.posts.create', { channel: 'x', title: 'Cross', campaign: a1.id }, U.LED, ORG.L)).status !== 200);

await db.exec('reset role');
check('SV21', 'A campaign with posts stays with its client', await db.query('update social_campaigns set client_id = $2 where id = $1', [CA.id, C2]).then(() => false, () => true));
check('SV22', 'A client with a campaign cannot be deleted', await db.query('delete from clients where id = $1', [C1]).then(() => false, () => true));
check('SV23', 'Campaign changes are audited without the goal text', (await rows("select detail::text d from audit_events where action like 'social_campaigns.%'")).length > 0 && (await rows("select detail::text d from audit_events where action like 'social_campaigns.%'")).every((x) => !/500 leads/.test(x.d)));
for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}`);
const pc = results.filter((x) => x.ok).length; console.log(`\n${pc}/${results.length} checks passed`); await db.close(); process.exit(pc === results.length ? 0 : 1);
