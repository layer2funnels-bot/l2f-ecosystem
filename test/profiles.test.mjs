// Profiles (migration 0041): everybody keeps their own name and photo; nobody can change anybody else's; photos are shown only inside the same organization.
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
const ORG = { L: id(), A: id() }; const U = { LO: id(), LAD: id(), LED: id(), LVW: id(), LOFF: id(), AO: id(), CL: id() };
await db.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','L'),($2,'aurj','A')", [ORG.L, ORG.A]);
const staff = (u, ws, r, status = 'active') => db.query("insert into memberships (workspace_id,user_id,kind,role,status) values ($1,$2,'staff',$3,$4)", [ws, u, r, status]);
await staff(U.LO, ORG.L, 'owner'); await staff(U.LAD, ORG.L, 'admin'); await staff(U.LED, ORG.L, 'editor'); await staff(U.LVW, ORG.L, 'viewer'); await staff(U.LOFF, ORG.L, 'editor', 'deactivated'); await staff(U.AO, ORG.A, 'owner');
const C1 = id(); await db.query("insert into clients (id,workspace_id,name) values ($1,$2,'One')", [C1, ORG.L]);
await db.query("insert into memberships (workspace_id,user_id,kind,client_id) values ($1,$2,'client',$3)", [ORG.L, U.CL, C1]);
for (const [u, n] of [[U.LO, 'Olivia Owner'], [U.LAD, 'Adam Admin'], [U.LED, 'Edda Editor'], [U.AO, 'Aurj Owner']]) await db.query('insert into profiles (id, email, display_name) values ($1,$2,$3) on conflict (id) do update set display_name = excluded.display_name', [u, `${n.split(' ')[0].toLowerCase()}@example.com`, n]);

const T = (u, org) => J('team.list', {}, u, org);

const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ';
const G = (u, org) => J('profile.get', {}, u, org); const UP = (u, input, org) => J('profile.update', input, u, org);
check('PF1', 'Anyone signed in reads their own profile (name, e-mail, photo)', (await G(U.LED, ORG.L)).row?.display_name === 'Edda Editor');
check('PF2', 'A person changes their own name', (await UP(U.LED, { name: '  Edda Q. Editor ' }, ORG.L)).status === 200 && (await G(U.LED, ORG.L)).row.display_name === 'Edda Q. Editor');
check('PF3', 'An empty name is refused and the old name stays', (await UP(U.LED, { name: '   ' }, ORG.L)).status >= 400 && (await G(U.LED, ORG.L)).row.display_name === 'Edda Q. Editor');
check('PF4', 'A person sets a photo; it is returned with their profile', (await UP(U.LED, { photo: JPG }, ORG.L)).status === 200 && (await G(U.LED, ORG.L)).row.avatar_data === JPG);
check('PF5', 'A photo that is not a small JPEG is refused (wrong type, too long, script)', (await UP(U.LED, { photo: 'data:text/html;base64,PHNjcmlwdD4=' }, ORG.L)).status >= 400 && (await UP(U.LED, { photo: 'data:image/jpeg;base64,' + 'A'.repeat(12100) }, ORG.L)).status >= 400 && (await UP(U.LED, { photo: 'https://evil.example/x.jpg' }, ORG.L)).status >= 400);
check('PF6', 'Changing the name keeps the photo', (await UP(U.LED, { name: 'Edda Editor' }, ORG.L)).status === 200 && (await G(U.LED, ORG.L)).row.avatar_data === JPG);
check('PF7', 'Nobody can change another person: the API has no person argument, and an extra one is rejected', (await UP(U.LED, { name: 'Hacked', user: U.LO }, ORG.L)).status === 422 && (await G(U.LO, ORG.L)).row.display_name === 'Olivia Owner');
const TL = (await T(U.LVW, ORG.L)).rows;
check('PF8', 'The team directory says who has a photo, without sending the photos', TL.find((r) => r.user_id === U.LED).has_photo === true && TL.find((r) => r.user_id === U.LO).has_photo === false && TL.every((r) => !('avatar_data' in r)));
const PH = (u, user, org) => J('profile.photo', { user }, u, org);
check('PF9', 'A teammate reads a colleague’s photo in the same organization', (await PH(U.LVW, U.LED, ORG.L)).row?.photo === JPG);
check('PF10', 'Another organization cannot read it (not found or empty), even naming the person', (await PH(U.AO, U.LED, ORG.A)).row?.photo == null && [404, 403].includes((await PH(U.AO, U.LED, ORG.L)).status));
check('PF11', 'A client account cannot read team photos', [404, 403].includes((await PH(U.CL, U.LED, ORG.L)).status) || (await PH(U.CL, U.LED, ORG.L)).row?.photo == null);
check('PF12', 'A client account has its own profile too: it can set a name and photo', (await UP(U.CL, { name: 'Client Carla', photo: JPG }, ORG.L)).status === 200 && (await G(U.CL, ORG.L)).row.display_name === 'Client Carla');
check('PF13', 'Removing the photo clears it', (await UP(U.LED, { clear_photo: true }, ORG.L)).status === 200 && (await G(U.LED, ORG.L)).row.avatar_data === null);
check('PF14', 'A person with no profile row yet still gets one on first update', (await UP(U.LVW, { name: 'Vera Viewer' }, ORG.L)).status === 200 && (await G(U.LVW, ORG.L)).row.display_name === 'Vera Viewer');

for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}`);
const pc = results.filter((x) => x.ok).length; console.log(`\n${pc}/${results.length} checks passed`); await db.close(); process.exit(pc === results.length ? 0 : 1);
