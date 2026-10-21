// End-to-end on the LOCAL stack: real Supabase Auth sign-up -> real JWT -> our HTTP routes -> real Postgres with RLS.
// Needs `npm run stack:start` and `npm run stack:migrate`. Local only; creates throw-away users and data.
import pg from 'pg';
import { startDevServer } from './dev-server.mjs';

const AUTH = process.env.STACK_AUTH_URL || 'http://127.0.0.1:54321/auth/v1';
const KEY = process.env.STACK_PUBLISHABLE_KEY || 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';   // local demo key
const results = []; const check = (id, n, ok, d = '') => results.push({ id, n, ok: !!ok, d });
const admin = new pg.Client({ connectionString: 'postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres' }); await admin.connect();

const stamp = Date.now();
const signUp = async (email) => {
  const r = await fetch(`${AUTH}/signup`, { method: 'POST', headers: { apikey: KEY, 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'correct-horse-battery-staple' }) });
  const b = await r.json(); return { status: r.status, token: b.access_token, id: b.user?.id, refresh: b.refresh_token };
};
const owner = await signUp(`owner.${stamp}@example.com`);
check('E1', 'Real Supabase Auth sign-up returns a session', owner.status === 200 && !!owner.token, `status ${owner.status} (is "confirm email" off in the local stack?)`);
const alg = JSON.parse(Buffer.from(owner.token.split('.')[0], 'base64url')).alg;
console.log(`local access tokens are signed with ${alg}`);

const org = async (slug, name) => (await admin.query('insert into workspaces (slug,name) values ($1,$2) on conflict (slug) do update set name = excluded.name returning id', [slug, name])).rows[0].id;
const L = await org('layer2funnels', 'Layer2Funnels'), A = await org('aurj', 'Aurj');
await admin.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff','owner'),($3,$2,'staff','editor') on conflict do nothing", [L, owner.id, A]);

// what seed/bootstrap.sql does once at go-live: the Funnel Mapper Pro launcher entry (entitlement row only, no connection)
await admin.query("insert into workspace_apps (workspace_id,app_key,enabled,launch_url) values ($1,'funnel_mapper_pro',true,null) on conflict do nothing", [L]);
const s = await startDevServer({ port: 0, sink: () => {} });
const post = (op, body, { token = owner.token, org: o = L, headers = {} } = {}) => fetch(`http://127.0.0.1:${s.port}/api/${op}`, {
  method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(o ? { 'x-org-id': o } : {}), ...headers }, body: JSON.stringify(body ?? {}) }).then(async (r) => ({ status: r.status, body: await r.json() }));
const NIL = '00000000-0000-0000-0000-000000000000';

let r = await post('org.list', {}, { org: NIL });
check('E2', 'Our route accepts the real token and lists the two organizations', r.status === 200 && r.body.data.map((x) => x.slug).sort().join() === 'aurj,layer2funnels', JSON.stringify(r.body).slice(0, 200));
r = await post('launcher.list');
check('E3', 'Launcher lists the owner’s apps in Layer2Funnels, including Funnel Mapper Pro as a plain tile', r.status === 200 && r.body.data.some((a) => a.app_key === 'office') && r.body.data.some((a) => a.app_key === 'funnel_mapper_pro'), JSON.stringify(r.body.data?.map((a) => a.app_key)));
r = await post('funnels.avatars.create', { name: 'E2E avatar', pains: 'x' });
const av = r.body.data?.[0];
check('E4', 'An avatar is created through the real stack and belongs to the header organization', r.status === 200 && av?.workspace_id === L && av?.created_by === owner.id);
r = await post('funnels.avatars.list', {}, { org: A });
check('E5', 'The same person with the Aurj header does not see Layer2Funnels records', r.status === 200 && !r.body.data.some((x) => x.id === av.id));
r = await post('launcher.list', {}, { token: 'not.a.token' });
check('E6', 'A bad token is 401 session_expired', r.status === 401 && r.body.error.code === 'session_expired');
const anon = await fetch(`http://127.0.0.1:${s.port}/api/launcher.list`, { method: 'POST', headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json', 'x-org-id': L }, body: '{}' });
check('E7', 'The public publishable key is not accepted as a person', anon.status === 401);
r = await post('launcher.list', {}, { org: null });
check('E8', 'No x-org-id is refused with org_required', r.status === 400 && r.body.error.code === 'org_required');

// invitation round trip with a second real user
const guest = await signUp(`guest.${stamp}@example.com`);
r = await post('org.list', {}, { token: guest.token, org: NIL });
check('E9', 'A brand-new account sees no organization ("ask your admin for an invitation")', r.status === 200 && r.body.data.length === 0);
r = await post('invitation.create', { email: `guest.${stamp}@example.com`, kind: 'staff', role: 'editor' });
const inv = r.body.data?.[0]?.token;
check('E10', 'Owner creates an invitation', r.status === 200 && !!inv);
r = await post('invitation.accept', { token: inv }, { token: owner.token, org: NIL });
check('E11', 'The wrong person cannot accept it', r.status === 404);
r = await post('invitation.accept', { token: inv }, { token: guest.token, org: NIL });
check('E12', 'The invited email accepts it', r.status === 200);
r = await post('launcher.list', {}, { token: guest.token });
check('E13', 'The new member now sees their default apps', r.status === 200 && r.body.data.some((a) => a.app_key === 'office'));
r = await post('funnels.avatars.list', {}, { token: guest.token });
check('E14', 'The new editor sees the funnel records of the organization they joined', r.status === 200 && r.body.data.some((x) => x.id === av.id));

// ---- Clients data layer through real tokens (migration 0008)
r = await post('clients.create', { name: `E2E Client ${stamp}`, business_name: 'E2E Co', status: 'active', stage: 'strategy', tags: ['e2e'] });
const cl = r.body.data?.[0];
check('E15', 'Clients: create with profile and stage through the real stack', r.status === 200 && cl?.status === 'active' && cl?.stage_key === 'strategy');
r = await post('clients.notes.create', { client: cl.id, body: 'e2e note' });
check('E16', 'Clients: a team note is added (internal only)', r.status === 200 && r.body.data[0].client_id === cl.id);
r = await post('clients.requests.create', { client: cl.id, title: 'Send logo', due_on: '2026-12-01' });
const rq = r.body.data?.[0];
r = await post('clients.requests.share', { id: rq.id, visible: true });
check('E17', 'Clients: a request is created and shared by an owner', r.status === 200 && r.body.data[0].client_visible === true);
r = await post('clients.get', { id: cl.id }, { token: guest.token });
check('E18', 'Clients: the invited editor has no client access by default (a plain not-found, no leak)', r.status === 404);
r = await post('clients.get', { id: cl.id }, { org: A });
check('E19', 'Clients: the other organization header cannot see it', r.status === 404);
r = await post('clients.stages.list');
check('E20', 'Clients: the five default stages are there', r.status === 200 && r.body.data.length === 5);

await s.close(); await admin.end();
for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(4)} ${x.n}${x.ok ? '' : `  [${x.d}]`}`);
const p = results.filter((x) => x.ok).length; console.log(`\n${p}/${results.length} checks passed`); process.exit(p === results.length ? 0 : 1);
