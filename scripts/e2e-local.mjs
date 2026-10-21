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
const cl = r.body.data?.[0]; if (!cl) console.log('DEBUG clients.create ->', r.status, JSON.stringify(r.body));
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
// scoped permissions (migration 0011): give the invited editor "Client team" on ONE client and ask what they may do
const lvlId = (await admin.query("select id from access_levels where workspace_id=$1 and name='Client team'", [L])).rows[0].id;
await admin.query("insert into access_assignments (workspace_id,access_level_id,principal_type,principal_id,client_id) values ($1,$2,'user',$3,$4)", [L, lvlId, guest.id, cl.id]);
r = await post('access.mine', {}, { token: guest.token });
const mineRows = r.body.data ?? [];
check('E29', 'Scoped permissions: the client-scoped editor is offered edit rights on that client only, and nothing organization-wide for clients', r.status === 200 && mineRows.some((x) => x.permission_key === 'clients.client.edit' && x.scope === 'client' && x.client_id === cl.id) && !mineRows.some((x) => x.permission_key.startsWith('clients.') && x.scope === 'workspace') && new Set(mineRows.filter((x) => x.client_id).map((x) => x.client_id)).size === 1);
r = await post('clients.get', { id: cl.id }, { token: guest.token });
check('E30', 'Scoped permissions: and the API then really lets them open that client', r.status === 200 && r.body.data[0].id === cl.id);
r = await post('clients.stages.list');
check('E20', 'Clients: the five default stages are there', r.status === 200 && r.body.data.length === 5);

// ---- SECURITY: the Data API is closed (migration 0010). Real tokens, real HTTP, straight at Supabase's own interface.
const REST = process.env.STACK_REST_URL || 'http://127.0.0.1:54321/rest/v1', API_ROOT = REST.replace('/rest/v1', '');
const direct = async (path, { method = 'GET', token, body, headers = {} } = {}) => {
  const r = await fetch(`${API_ROOT}${path}`, { method, headers: { apikey: KEY, 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch { /* not json */ }
  return { status: r.status, text, json: j };
};
const noData = (r) => !(Array.isArray(r.json) && r.json.length > 0) && !/Secret|Layer2Funnels|Aurj/.test(r.text.replace(/"message":"[^"]*"/g, ''));
const TABLES = ['clients', 'memberships', 'workspaces', 'audit_events', 'funnel_avatars', 'client_notes', 'invitations', 'permissions', 'profiles'];
let allDenied = true; const detail = [];
for (const [who, token] of [['owner (member of both organizations)', owner.token], ['guest (member of one)', guest.token], ['visitor (public key only)', undefined]]) {
  for (const t of TABLES) {
    const r = await direct(`/rest/v1/${t}?select=*`, { token });
    if (!(r.status === 401 || r.status === 403 || r.status === 404) || !noData(r)) { allDenied = false; detail.push(`${who} GET ${t}: ${r.status}`); }
  }
}
check('E21', 'SECURITY: reading any table through the Data API with an own token (or just the public key) is refused, for people in one or both organizations', allDenied, detail.slice(0, 4).join(' | '));
let writesDenied = true; const wd = [];
for (const [m, path, body] of [['POST', '/rest/v1/clients', { workspace_id: L, name: 'hacked' }], ['PATCH', '/rest/v1/clients?name=eq.x', { name: 'hacked' }], ['DELETE', '/rest/v1/memberships?role=eq.owner'], ['POST', '/rest/v1/memberships', { workspace_id: A, user_id: guest.id, kind: 'staff', role: 'owner' }], ['POST', '/rest/v1/audit_events', { workspace_id: L, action: 'x', subject_type: 'x' }]]) {
  for (const token of [owner.token, guest.token]) { const r = await direct(path, { method: m, token, body }); if (![401, 403, 404].includes(r.status)) { writesDenied = false; wd.push(`${m} ${path} ${r.status}`); } }
}
check('E22', 'SECURITY: no write (insert, update, delete) works through the Data API, including promoting oneself to owner of another organization', writesDenied, wd.join(' | '));
let rpcDenied = true; const rd = [];
for (const [fn, body] of [['launcher_apps', { p_workspace: L }], ['create_invitation', { p_workspace: L, p_email: 'x@example.com', p_kind: 'staff', p_role: 'owner' }], ['accept_invitation', { p_token: 'x' }], ['my_organizations', {}], ['effective_access', { p_workspace: L }], ['resolve_org_switch', { p_org: L, p_app: 'office' }]]) {
  for (const token of [owner.token, guest.token, undefined]) { const r = await direct(`/rest/v1/rpc/${fn}`, { method: 'POST', token, body }); if (![401, 403, 404].includes(r.status)) { rpcDenied = false; rd.push(`${fn} ${r.status}`); } }
}
check('E23', 'SECURITY: none of our functions can be called through the Data API (so rate limits, typed input and the request scope cannot be skipped)', rpcDenied, rd.slice(0, 4).join(' | '));
let r2 = await direct('/rest/v1/', { token: owner.token, headers: { 'accept-profile': 'private' } });
let r3 = await direct('/rest/v1/api_rate_limits', { token: owner.token, headers: { 'accept-profile': 'private' } });
check('E24', 'SECURITY: the private schema is not exposed (policy helpers, rate-limit counters)', [404, 406, 400].includes(r2.status) && [404, 406, 400].includes(r3.status), `${r2.status}/${r3.status}`);
const gq = await direct('/graphql/v1', { method: 'POST', token: owner.token, body: { query: '{ clientsCollection { edges { node { name } } } workspacesCollection { edges { node { name } } } }' } });
check('E25', 'SECURITY: GraphQL cannot read our tables either', !/Secret|Layer2Funnels|Aurj|E2E Client/.test(gq.text) && !(gq.json?.data && Object.values(gq.json.data).some((v) => v?.edges?.length)), gq.text.slice(0, 120));
const priv = (await admin.query(`select
  (select count(*) from pg_tables t where t.schemaname in ('public','private') and (has_table_privilege('authenticated', format('%I.%I', t.schemaname, t.tablename), 'select,insert,update,delete') or has_table_privilege('anon', format('%I.%I', t.schemaname, t.tablename), 'select,insert,update,delete')))::int tables,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private') and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute')))::int fns`)).rows[0];
check('E26', 'SECURITY: on the real Supabase stack no table or function of ours is granted to the Data API roles', priv.tables === 0 && priv.fns === 0, JSON.stringify(priv));
await admin.query('create table public.zz_probe_future (id int)');
const fut = (await admin.query("select has_table_privilege('authenticated','public.zz_probe_future','select') a, has_table_privilege('anon','public.zz_probe_future','select') b")).rows[0];
await admin.query('drop table public.zz_probe_future');
check('E27', 'SECURITY: a table created later by the platform admin role is NOT auto-exposed to the Data API roles', !fut.a && !fut.b, JSON.stringify(fut));
r = await post('launcher.list');
check('E28', 'Control: the same people still work normally through our API after the lockdown', r.status === 200 && r.body.data.length > 0);


// ---- Projects data layer through real tokens (migration 0013)
r = await post('projects.create', { name: `E2E Project ${stamp}`, client: cl.id });
const pj = r.body.data?.[0];
check('E31', 'Projects: an owner creates a project for a client, then a task with a checklist item, through the real stack', r.status === 200 && pj?.client_id === cl.id
  && (r = await post('tasks.create', { project: pj.id, title: 'E2E task', assignee: owner.id, due_on: '2026-12-01' })).status === 200 && r.body.data[0].client_id === cl.id
  && (await post('checklist.add', { task: r.body.data[0].id, label: 'step' })).status === 200);
const tk = r.body.data?.[0];
r = await post('my.work');
check('E32', 'Projects: my.work lists the task assigned to the caller, with its project name', r.status === 200 && r.body.data.some((x) => x.id === tk.id && x.project_name === pj.name));
r = await post('time.start', { project: pj.id, task: tk.id });
const t0 = Date.now(); const startedAt = new Date(r.body.data?.[0]?.started_at).getTime();
check('E33', 'Projects: a timer starts on the server clock (within seconds of now) and a second one is refused as a conflict', r.status === 200 && Math.abs(t0 - startedAt) < 20000 && (await post('time.start', { project: pj.id })).status === 409);
r = await post('time.stop', { note: 'e2e' });
check('E34', 'Projects: stopping it records the end by the server clock', r.status === 200 && new Date(r.body.data[0].ended_at) > new Date(r.body.data[0].started_at));
r = await post('tasks.get', { id: tk.id }, { token: guest.token });
check('E35', 'Projects: the invited editor (no project level) cannot read the task: a plain not-found', r.status === 404);
r = await post('projects.get', { id: pj.id }, { org: A });
check('E36', 'Projects: the other organization header cannot see the project', r.status === 404);
const directP = await Promise.all(['projects', 'project_tasks', 'task_checklist_items', 'time_entries'].map((t) => fetch(`http://127.0.0.1:54321/rest/v1/${t}?select=id`, { headers: { apikey: KEY, authorization: `Bearer ${owner.token}` } }).then(async (x) => ({ t, status: x.status, rows: x.ok ? (await x.json()).length : 0 }))));
check('E37', 'SECURITY: the Data API shows no project, task, checklist or time row to a signed-in owner (only our API can)', directP.every((d) => d.status >= 400 || d.rows === 0), JSON.stringify(directP));

await s.close(); await admin.end();
for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(4)} ${x.n}${x.ok ? '' : `  [${x.d}]`}`);
const p = results.filter((x) => x.ok).length; console.log(`\n${p}/${results.length} checks passed`); process.exit(p === results.length ? 0 : 1);
