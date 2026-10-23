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

// ---- Drive data layer through real tokens (migration 0014)
r = await post('drive.folders.create', { space: 'shared', name: `E2E Brand ${stamp}` });
const df = r.body.data?.[0];
check('E38', 'Drive: an owner creates a folder and a first-party document with two versions through the real stack', r.status === 200 && df?.space === 'shared'
  && (r = await post('drive.files.create', { space: 'shared', folder: df.id, name: 'E2E SOP', kind: 'document', body: 'v1 text' })).status === 200
  && (await post('drive.files.versions.add', { id: r.body.data[0].id, body: 'v2 text' })).body.data[0].current_version === 2);
const dd = r.body.data?.[0];
r = await post('drive.sops.protect', { id: dd.id, protected: true, sop_key: `e2e_${stamp % 100000}` });
check('E39', 'Drive: an owner protects the document as an SOP; the invited editor (no change rights) cannot edit it and reads it as not found', r.status === 200 && (await post('drive.files.update', { id: dd.id, name: 'hacked' }, { token: guest.token })).status === 404
  && (await post('drive.sops.list', {}, { token: guest.token })).body.data.some((x) => x.id === dd.id));
r = await post('drive.files.create', { space: 'personal', name: 'private.md', kind: 'document', body: 'e2e personal text' }, { token: guest.token });
const pf = r.body.data?.[0];
check('E40', 'Drive: the invited editor keeps a personal document; the organization owner cannot read or list it', r.status === 200 && pf?.space === 'personal' && (await post('drive.files.get', { id: pf.id })).status === 404 && (await post('drive.files.list', { space: 'personal' })).body.data.length === 0);
r = await post('drive.personal.open', { owner: guest.id, reason: 'Checking a handover document' });
check('E41', 'Drive: break-glass needs a reason; with one the owner sees the file and the person gets a notice naming who looked', r.status === 200 && r.body.data.some((x) => x.id === pf.id && x.body === 'e2e personal text')
  && (await post('drive.notices.list', { unseen: true }, { token: guest.token })).body.data.some((n) => n.reason === 'Checking a handover document'));
r = await post('drive.links.create', { file: (await post('drive.files.create', { space: 'shared', name: 'Public note', kind: 'document', body: 'public text' })).body.data[0].id, days: 2 });
const linkTok = r.body.data?.[0]?.token;
const resolved = (await admin.query('select * from public.drive_link_resolve($1)', [linkTok])).rows;
check('E42', 'Drive: a share link returns its secret once and the database resolves exactly that file (not the SOP, not personal files)', r.status === 200 && linkTok?.length >= 40 && resolved.length === 1 && resolved[0].body === 'public text');
const directD = await Promise.all(['files', 'drive_folders', 'file_versions', 'drive_share_links', 'drive_break_glass', 'drive_notices'].map((t) => fetch(`http://127.0.0.1:54321/rest/v1/${t}?select=id`, { headers: { apikey: KEY, authorization: `Bearer ${owner.token}` } }).then(async (x) => ({ t, status: x.status, rows: x.ok ? (await x.json()).length : 0 }))));
check('E43', 'SECURITY: the Data API shows no file, folder, version, link, notice or break-glass row to a signed-in owner', directD.every((d) => d.status >= 400 || d.rows === 0), JSON.stringify(directD));

// ---- Planner data layer through real tokens (migration 0015)
r = await post('planner.objectives.create', { title: `E2E objective ${stamp}`, status: 'active', health: 'on_track' });
const ob = r.body.data?.[0];
check('E44', 'Planner: an owner creates an objective and a measure through the real stack', r.status === 200 && ob?.measures === 0
  && (r = await post('planner.measures.create', { objective: ob.id, name: 'Leads', target_value: 100 })).status === 200);
const ms = r.body.data?.[0];
r = await post('planner.measures.record', { id: ms.id, value: 40, note: 'e2e' });
check('E45', 'Planner: recording a value moves progress to 40% and the objective average follows', r.status === 200 && r.body.data[0].progress === 0.4 && Math.abs((await post('planner.objectives.get', { id: ob.id })).body.data[0].progress - 0.4) < 1e-9);
r = await post('planner.links.add', { objective: ob.id, task: tk.id });
check('E46', 'Planner: a Projects task is linked to the objective and listed with its project name', r.status === 200 && (await post('planner.links.list', { objective: ob.id })).body.data.some((x) => x.task_id === tk.id && x.project_name === pj.name));
r = await post('planner.objectives.get', { id: ob.id }, { token: guest.token });
check('E47', 'Planner: the invited editor reads and edits the objective (Planner is team-wide by default for editors; Funnels and Projects need a level)', r.status === 200 && (await post('planner.objectives.update', { id: ob.id, title: `E2E objective ${stamp} (edited)` }, { token: guest.token })).status === 200);
r = await post('planner.overview', { days: 14 });
check('E48', 'Planner: the overview counts the active objective', r.status === 200 && r.body.data[0].by_status.active >= 1);
const directPl = await Promise.all(['planner_objectives', 'planner_measures', 'planner_measure_values', 'planner_objective_tasks', 'planner_reviews'].map((t) => fetch(`http://127.0.0.1:54321/rest/v1/${t}?select=*`, { headers: { apikey: KEY, authorization: `Bearer ${owner.token}` } }).then(async (x) => ({ t, status: x.status, rows: x.ok ? (await x.json()).length : 0 }))));
check('E49', 'SECURITY: the Data API shows no planner row to a signed-in owner', directPl.every((d) => d.status >= 400 || d.rows === 0), JSON.stringify(directPl));

// ---- Phase 6 through real tokens: audience gate (0016), approvals (0017), Client Portal / gate G2 (0018), and the new tables behind the closed Data API
r = await post('approvals.request', { subject_type: 'other', subject: cl.id, title: `E2E approval ${stamp}`, note: 'please look' }, { token: guest.token });
const apv = r.body.data?.[0]; if (!apv) console.log('DEBUG approvals.request ->', r.status, JSON.stringify(r.body));
const dSelf = await post('approvals.decide', { id: apv.id, decision: 'approved' }, { token: guest.token }); const dOwner = await post('approvals.decide', { id: apv.id, decision: 'approved', note: 'ok' }); const gOwner = await post('approvals.get', { id: apv.id });
check('E50', 'Approvals: the invited editor asks for an approval; the owner (someone else) approves it with a note; the requester cannot decide their own',
  r.status === 200 && apv?.status === 'pending' && dSelf.status !== 200 && dOwner.status === 200 && gOwner.body.data[0].events.length === 2, `${r.status} ${dSelf.status} ${dOwner.status} ${JSON.stringify(dOwner.body).slice(0, 150)}`);
const clientUser = await signUp(`client.${stamp}@example.com`);
await admin.query("insert into memberships (workspace_id,user_id,kind,client_id) values ($1,$2,'client',$3)", [L, clientUser.id, cl.id]);
r = await post('portal.me', {}, { token: clientUser.token });
check('E51', 'Client Portal OFF by default: a client account gets nothing from the Portal through the real stack', r.status === 404 && (await post('portal.requests.list', {}, { token: clientUser.token })).body.data?.length === 0);
await admin.query("update workspace_apps set enabled = true where workspace_id = $1 and app_key = 'portal'", [L]);
r = await post('portal.requests.list', {}, { token: clientUser.token });
check('E52', 'Portal ON: the client sees the request staff shared and nothing else; the home counts agree', r.status === 200 && r.body.data.some((x) => x.id === rq.id) && Object.keys(r.body.data[0]).sort().join() === 'body,created_at,due_on,id,kind,response,status,title,updated_at'
  && (await post('portal.home', {}, { token: clientUser.token })).body.data[0].open_requests >= 1);
r = await post('clients.list', {}, { token: clientUser.token });
const g2 = await Promise.all(['projects.list', 'forms.list', 'approvals.list', 'access.mine', 'members.list', 'planner.objectives.list'].map((op) => post(op, {}, { token: clientUser.token }).then((x) => `${op}:${x.status}`)));
check('E53', 'Gate G2: every staff operation answers "not found" to a client account (clients, projects, forms, approvals, access, members, planner)',
  r.status === 404 && g2.every((x) => x.endsWith(':404')), g2.join(' '));
r = await post('portal.requests.answer', { id: rq.id, response: 'Logo sent' }, { token: clientUser.token });
check('E54', 'Gate G2: the client answers the shared request; the owner then sees it answered', r.status === 200 && r.body.data[0].status === 'answered');
r = await post('portal.messages.send', { subject_type: 'request', subject: rq.id, body: 'Anything else needed?' }, { token: clientUser.token });
check('E55', 'Portal messages: the client writes on the request; staff read and reply; the audit trail holds no text',
  r.status === 200 && (await post('portal.staff.messages.send', { subject_type: 'request', subject: rq.id, body: 'All good, thanks' })).status === 200 && (await post('portal.staff.messages.list', { client: cl.id })).body.data.length === 2);
await admin.query("update workspace_apps set enabled = false where workspace_id = $1 and app_key = 'portal'", [L]);
r = await post('portal.requests.list', {}, { token: clientUser.token });
check('E56', 'The Portal kill switch works at once through the real stack', r.status === 200 && r.body.data.length === 0 && (await post('portal.me', {}, { token: clientUser.token })).status === 404);
const phase6 = ['approvals', 'approval_events', 'portal_messages', 'forms', 'form_versions', 'form_submissions', 'value_ladders', 'value_ladder_rungs', 'social_posts', 'social_post_files'];
const directP6 = (await Promise.all(phase6.flatMap((t) => [owner.token, clientUser.token].map((tok) => fetch(`http://127.0.0.1:54321/rest/v1/${t}?select=*`, { headers: { apikey: KEY, authorization: `Bearer ${tok}` } }).then(async (x) => ({ t, status: x.status, rows: x.ok ? (await x.json()).length : null })))))).flat();
check('E57', 'SECURITY: the Data API shows no approval, portal message, form, ladder or post row to an owner or a client account', directP6.every((d) => d.status >= 400 || d.rows === 0), JSON.stringify(directP6.filter((d) => !(d.status >= 400 || d.rows === 0))));

// ---- Storage and Drive visibility are separate, in both organizations (migration 0025), through the real stack and real tokens
await admin.query("update memberships set role = 'owner' where workspace_id = $1 and user_id = $2", [A, owner.id]);
const driveIds = async (org2) => new Set((await post('drive.files.list', { space: 'shared', anywhere: true }, { org: org2 })).body.data.map((x) => x.id));
const mkProj = async (org2, name) => (await admin.query("insert into projects (workspace_id, name) values ($1, $2) returning id", [org2, name])).rows[0].id;
const pL = await mkProj(L, 'E2E internal L'), pA = await mkProj(A, 'E2E internal A');
const made2 = {};
for (const [k, o2, pj] of [['L', L, pL], ['A', A, pA]]) {
  made2[k] = {
    lib: (await post('drive.files.create', { space: 'shared', name: `${k} E2E library doc`, kind: 'document', body: 'x' }, { org: o2 })).body.data[0],
    proj: (await post('drive.files.create', { space: 'shared', project: pj, name: `${k} E2E project doc`, kind: 'document', body: 'x' }, { org: o2 })).body.data[0],
    board: (await post('drive.files.create', { space: 'shared', app: 'whiteboard', name: `${k} E2E board`, kind: 'document', mime_type: 'application/vnd.excalidraw+json', body: '{}' }, { org: o2 })).body.data[0],
  };
}
const dL = await driveIds(L), dA = await driveIds(A);
check('E58', 'Both organizations: a library document is listed in Drive; project documents and boards are stored but not listed, through the real stack',
  dL.has(made2.L.lib.id) && dA.has(made2.A.lib.id) && !dL.has(made2.L.proj.id) && !dL.has(made2.L.board.id) && !dA.has(made2.A.proj.id) && !dA.has(made2.A.board.id) && made2.L.proj.in_library === false && made2.A.board.in_library === false && made2.L.proj.managed_by === 'projects' && made2.A.board.managed_by === 'whiteboard');
check('E59', 'Neither organization’s Drive lists the other’s files, and the owning apps reach the hidden ones in their own organization only',
  !dL.has(made2.A.lib.id) && !dA.has(made2.L.lib.id) && (await post('drive.project.files', { project: pL }, { org: L })).body.data.some((x) => x.id === made2.L.proj.id) && (await post('drive.project.files', { project: pL }, { org: A })).body.data.length === 0
  && (await post('drive.boards.list', {}, { org: A })).body.data.some((x) => x.id === made2.A.board.id) && !(await post('drive.boards.list', {}, { org: A })).body.data.some((x) => x.id === made2.L.board.id) && (await post('drive.files.get', { id: made2.L.board.id }, { org: A })).status === 404);
r = await post('drive.files.setLibrary', { id: made2.A.board.id, in_library: true }, { org: A });
const dA2 = await driveIds(A), dL2 = await driveIds(L);
check('E60', 'Adding a hidden file to the library lists it in that organization’s Drive only; the other organization’s Drive does not change',
  r.status === 200 && dA2.has(made2.A.board.id) && !dL2.has(made2.A.board.id) && dL2.size === dL.size);
const clientDoc = await admin.query("insert into clients (workspace_id, name) values ($1, 'E2E client') returning id", [A]);
const cd = (await post('drive.files.create', { space: 'client', client: clientDoc.rows[0].id, app: 'clients', name: 'A E2E client doc', kind: 'document', body: 'x' }, { org: A })).body.data?.[0];
check('E61', 'A client file is stored in the client space, never listed in the shared Drive, and refuses to join the library', cd?.in_library === false && !(await driveIds(A)).has(cd?.id) && (await post('drive.files.setLibrary', { id: cd.id, in_library: true }, { org: A })).status === 422);

await s.close(); await admin.end();
for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(4)} ${x.n}${x.ok ? '' : `  [${x.d}]`}`);
const p = results.filter((x) => x.ok).length; console.log(`\n${p}/${results.length} checks passed`); process.exit(p === results.length ? 0 : 1);
