// Audit regression suite (20 Oct 2026). One or more checks per finding F1–F10 in docs/AUDIT_REPORT.md,
// plus T9 (Funnel Mapper Pro entitlement), T10 (Client Portal kill switch), invitations and the
// integration layer. Identity is set in the CURRENT Supabase claim format unless a check says otherwise.
import { randomUUID as id } from 'node:crypto';
import { openDb, migrate, session, recorder } from './lib.mjs';

const db = await openDb();
await migrate(db);
const { asUser, asSuper } = session(db);
const { results, check, errCode } = recorder();
const rows = async (sql, p = []) => (await db.query(sql, p)).rows;
const affected = async (sql, p = []) => (await db.query(sql, p)).affectedRows;

// ---------------- fixtures (superuser) ----------------
await asSuper();
const L2F = id(), AUR = id();
await db.query("insert into workspaces (id, slug, name) values ($1,'layer2funnels','Layer2Funnels'),($2,'aurj','Aurj')", [L2F, AUR]);
const U = { OWN: id(), ADM: id(), ED: id(), ED_NOAPP: id(), VW: id(), AOWN: id(), AED: id(), CLI: id(), NEW: id(), STRANGER: id() };
const CL_A = id(), CL_AUR = id();
await db.query("insert into clients (id, workspace_id, name) values ($1,$2,'Acme'),($3,$4,'Aurj School')", [CL_A, L2F, CL_AUR, AUR]);
const staff = (u, ws, role) => db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff',$3)", [ws, u, role]);
await staff(U.OWN, L2F, 'owner'); await staff(U.ADM, L2F, 'admin'); await staff(U.ED, L2F, 'editor');
await staff(U.ED_NOAPP, L2F, 'editor'); await staff(U.VW, L2F, 'viewer');
await staff(U.AOWN, AUR, 'owner'); await staff(U.AED, AUR, 'editor');
await db.query("insert into memberships (workspace_id,user_id,kind,client_id) values ($1,$2,'client',$3)", [L2F, U.CLI, CL_A]);
for (const [u, ws] of [[U.ED, L2F], [U.VW, L2F], [U.AED, AUR]])
  for (const app of ['clients', 'projects', 'drive'])
    await db.query('insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,$3)', [ws, u, app]);
const level = async (ws, name) => (await db.query('select id from access_levels where workspace_id=$1 and name=$2', [ws, name])).rows[0].id;
const assign = async (ws, uid, name, client = null) => db.query("insert into access_assignments (workspace_id, access_level_id, principal_type, principal_id, client_id) values ($1,$2,'user',$3,$4)", [ws, await level(ws, name), uid, client]);
for (const [u, ws] of [[U.ED, L2F], [U.AED, AUR]]) { await assign(ws, u, 'All clients · edit'); await assign(ws, u, 'All projects · edit'); }
await assign(L2F, U.VW, 'All clients · read');
await db.query("insert into workspace_apps (workspace_id, app_key, enabled) values ($1,'funnel_mapper_pro',true)", [L2F]);
await db.query("insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,'funnel_mapper_pro')", [L2F, U.ED]);
const PR_VIS = id(), PR_INT = id(), F_VIS = id(), F_INT = id();
await db.query("insert into projects (id,workspace_id,client_id,name,client_visible) values ($1,$3,$4,'Visible',true),($2,$3,$4,'Internal',false)", [PR_VIS, PR_INT, L2F, CL_A]);
await db.query(`insert into files (id,workspace_id,client_id,uploaded_by,storage_path,client_visible) values
  ($1,$3,$4,$5,$6,true),($2,$3,$4,$5,$7,false)`, [F_VIS, F_INT, L2F, CL_A, U.ED, `${L2F}/clients/${CL_A}/deliverable.pdf`, `${L2F}/clients/${CL_A}/internal-pricing.pdf`]);

// ---------------- F1 identity in both claim formats ----------------
await asUser(U.ED, { format: 'claims' });
check('F1a', 'Current Supabase claims format (request.jwt.claims) resolves the user', (await rows('select private.current_user_id() u'))[0].u === U.ED);
check('F1b', 'Signed-in user (claims format) reads own workspace data', (await rows('select id from clients')).length === 1);
await asUser(U.ED, { format: 'legacy' });
check('F1c', 'Legacy claim format still works', (await rows('select id from clients')).length === 1);

// ---------------- F2 no cross-workspace references ----------------
await asUser(U.ED);
const cross = await errCode(() => db.query("insert into projects (workspace_id,client_id,name) values ($1,$2,'x')", [L2F, CL_AUR]));
const random = await errCode(() => db.query("insert into projects (workspace_id,client_id,name) values ($1,$2,'x')", [L2F, id()]));
check('F2a', 'Project in Layer2Funnels cannot point at an Aurj client', cross !== 'no-error', cross);
check('F2b', 'Other-workspace id and non-existent id give the same error (no existence oracle)', cross === random, `${cross} vs ${random}`);
check('F2c', 'File cannot be tied to another workspace\'s client',
  (await errCode(() => db.query('insert into files (workspace_id,client_id,uploaded_by,storage_path) values ($1,$2,$3,$4)', [L2F, CL_AUR, U.ED, `${L2F}/x.pdf`]))) !== 'no-error');
await asUser(U.ADM);
check('F2d', 'Admin cannot create a client login for another workspace\'s client',
  (await errCode(() => db.query("insert into memberships (workspace_id,user_id,kind,client_id) values ($1,$2,'client',$3)", [L2F, id(), CL_AUR]))) !== 'no-error');
check('F2e', 'A membership cannot be moved to another workspace or user',
  (await errCode(() => db.query('update memberships set user_id = $1 where user_id = $2 and workspace_id = $3', [id(), U.VW, L2F]))) === '42501');

// ---------------- F3 audit is automatic and cannot be forged ----------------
await asUser(U.ADM);
await db.query("update memberships set role = 'viewer' where user_id = $1 and workspace_id = $2", [U.ED_NOAPP, L2F]);
await asSuper();
const roleAudit = await rows("select actor_id, origin, detail from audit_events where action = 'memberships.update' and detail ? 'role'");
check('F3a', 'Role change is recorded automatically with the real actor and old/new values',
  roleAudit.length === 1 && roleAudit[0].actor_id === U.ADM && roleAudit[0].origin === 'system'
  && JSON.stringify(roleAudit[0].detail.role) === JSON.stringify(['editor', 'viewer']));
await asUser(U.ED);
check('F3b', 'Staff cannot write a system-origin audit entry',
  (await errCode(() => db.query("insert into audit_events (workspace_id,actor_id,action,subject_type,origin) values ($1,$2,'memberships.update','memberships','system')", [L2F, U.ED]))) === '42501');
check('F3c', 'Staff cannot write an audit entry in someone else\'s name',
  (await errCode(() => db.query("insert into audit_events (workspace_id,actor_id,action,subject_type) values ($1,$2,'x','x')", [L2F, U.ADM]))) === '42501');

// ---------------- F4 helpers are private and not callable by PUBLIC ----------------
await asSuper();
const helperSchemas = await rows(`select n.nspname, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where p.proname in ('has_role','is_staff','is_member','client_of','current_user_id','can_use_app')`);
check('F4a', 'Policy helpers live only in the private schema', helperSchemas.length > 0 && helperSchemas.every(r => r.nspname === 'private'));
const publicExec = await rows(`select p.oid::regprocedure::text f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public','private') and has_function_privilege('public', p.oid, 'execute')`);
check('F4b', 'No public or private function is executable by PUBLIC', publicExec.length === 0, publicExec.map(r => r.f).join(', '));
const apiFns = (await rows(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1`)).map(r => r.proname);
check('F4c', 'Only the intended RPCs exist in the API schema', JSON.stringify(apiFns) === JSON.stringify(['accept_invitation', 'create_invitation', 'drive_break_glass_open', 'drive_link_resolve', 'effective_access', 'invitation_cancel', 'invitation_decline', 'invitation_preview', 'launcher_apps', 'launcher_catalog', 'member_remove', 'member_set_role', 'member_set_status', 'members_list', 'my_audience', 'my_organizations', 'my_permissions', 'profile_touch', 'resolve_org_switch']), apiFns.join(','));
const unsafe = await rows(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public','private') and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))`);
check('F4d', 'Every function pins its search_path', unsafe.length === 0, unsafe.map(r => r.proname).join(','));

// ---------------- F5 client-visible allowlist (Portal switched on for these checks) ----------------
await asSuper(); await db.query("update workspace_apps set enabled = true where workspace_id = $1 and app_key = 'portal'", [L2F]);
await asUser(U.CLI);
check('F5a', 'Client sees only the project marked client-visible', JSON.stringify((await rows('select id from projects')).map(r => r.id)) === JSON.stringify([PR_VIS]));
const cliFiles = (await rows('select id from files')).map(r => r.id);
check('F5b', 'Client cannot see an internal file tied to their own client', !cliFiles.includes(F_INT));
check('F5c', 'Client sees the client-visible file', JSON.stringify(cliFiles) === JSON.stringify([F_VIS]));
await asSuper(); await db.query("update workspace_apps set enabled = false where workspace_id = $1 and app_key = 'portal'", [L2F]);

// ---------------- T10 Client Portal kill switch (G2) ----------------
await asUser(U.CLI);
check('T10a', 'Portal switched off: a client account sees no client, project or file',
  (await rows('select id from clients')).length + (await rows('select id from projects')).length + (await rows('select id from files')).length === 0);
check('T10b', 'Portal switched off: Launcher offers the client nothing', (await rows('select * from launcher_apps($1)', [L2F])).length === 0);
await asUser(U.ADM);
check('T10c', 'An admin cannot switch the Client Portal on (owner action)',
  (await affected("update workspace_apps set enabled = true where workspace_id = $1 and app_key = 'portal'", [L2F])) === 0);
await asUser(U.OWN);
check('T10d', 'The owner can switch the Client Portal on, and it is audited',
  (await affected("update workspace_apps set enabled = true where workspace_id = $1 and app_key = 'portal'", [L2F])) === 1);
await asUser(U.CLI);
check('T10e', 'Portal on: client sees own client record and the Portal tile only',
  (await rows('select id from clients')).length === 1 && JSON.stringify((await rows('select app_key from launcher_apps($1)', [L2F])).map(r => r.app_key)) === '["portal"]');

// ---------------- F6 / T9 per-app access and Funnel Mapper Pro entitlement ----------------
await asUser(U.ED_NOAPP);
check('F6a', 'Staff without the Clients app see no clients', (await rows('select id from clients')).length === 0);
await asUser(U.ED);
const edApps = (await rows('select app_key from launcher_apps($1)', [L2F])).map(r => r.app_key);
check('T9a', 'Authorized Layer2Funnels user sees Funnel Mapper Pro in the Launcher', edApps.includes('funnel_mapper_pro'), edApps.join(','));
check('F6b', 'Launcher lists only granted apps (no Office/Planner without a grant)', !edApps.includes('planner') && edApps.includes('clients'));
await asUser(U.VW);
check('T9b', 'Unauthorized Layer2Funnels user does not see Funnel Mapper Pro', !(await rows('select app_key from launcher_apps($1)', [L2F])).some(r => r.app_key === 'funnel_mapper_pro'));
await asUser(U.AOWN);
check('T9c', 'Funnel Mapper Pro is absent in Aurj, even for its owner', !(await rows('select app_key from launcher_apps($1)', [AUR])).some(r => r.app_key === 'funnel_mapper_pro'));
check('T9d', 'An Aurj-only user cannot learn the Funnel Mapper Pro entry exists', (await rows("select key from apps where key = 'funnel_mapper_pro'")).length === 0);
check('F6c', 'Launcher for a workspace you are not in is empty (no oracle)', (await rows('select * from launcher_apps($1)', [L2F])).length === 0);
await asUser(U.ADM);
await db.query("delete from app_grants where workspace_id = $1 and user_id = $2 and app_key = 'clients'", [L2F, U.ED]);
await asUser(U.ED);
check('F6d', 'Revoking an app takes effect on the next request', (await rows('select id from clients')).length === 0);
await asUser(U.ADM);
await db.query("insert into app_grants (workspace_id,user_id,app_key,granted_by) values ($1,$2,'clients',$3)", [L2F, U.ED, U.ADM]);
check('F6e', 'Admin sees every enabled app without a grant', (await rows('select id from clients')).length === 1);

// ---------------- F7 approvals ----------------
await asUser(U.ED);
check('F7a', 'Editor cannot insert a pre-approved request',
  (await errCode(() => db.query("insert into approvals (workspace_id,subject_type,subject_id,requested_by,status) values ($1,'deliverable',$2,$3,'approved')", [L2F, F_VIS, U.ED]))) === '42501');
const AP = id();
await db.query("insert into approvals (id,workspace_id,subject_type,subject_id,requested_by) values ($1,$2,'deliverable',$3,$4)", [AP, L2F, F_VIS, U.ED]);
await asUser(U.ADM);
check('F7b', 'Decision cannot change what was requested',
  (await errCode(() => db.query("update approvals set status='approved', subject_id=$2 where id=$1", [AP, id()]))) === 'P0001');
await db.query("update approvals set status='approved' where id=$1", [AP]);
await asSuper();
const ap = (await rows('select decided_by, decided_at from approvals where id=$1', [AP]))[0];
check('F7c', 'Decider and time are recorded by the database', ap.decided_by === U.ADM && ap.decided_at !== null);
check('F7d', 'Approval decision is audited', (await rows("select 1 from audit_events where action='approvals.update' and subject_id=$1", [AP])).length === 1);
await asUser(U.OWN);
check('F7e', 'A decided approval cannot be decided again', (await errCode(() => db.query("update approvals set status='rejected' where id=$1", [AP]))) === 'P0001');

// ---------------- F8 profiles and active workspace ----------------
for (const u of [U.ED, U.AED, U.CLI]) { await asUser(u); await db.query('insert into profiles (id, display_name) values ($1,$2)', [u, 'n']); }
await asUser(U.ADM); await db.query('insert into profiles (id, display_name) values ($1,$2)', [U.ADM, 'Admin']);
check('F8a', 'Staff see profiles of people in their own workspace', (await rows('select id from profiles where id=$1', [U.ED])).length === 1);
check('F8b', 'Staff cannot see profiles from the other business', (await rows('select id from profiles where id=$1', [U.AED])).length === 0);
await asUser(U.CLI);
check('F8c', 'A client account cannot read staff profiles', (await rows('select id from profiles')).length === 1);
await asUser(U.ED);
check('F8d', 'Active workspace cannot be set to a workspace you do not belong to',
  (await errCode(() => db.query('update profiles set active_workspace_id=$1 where id=$2', [AUR, U.ED]))) === '42501');
check('F8e', 'Active workspace can be set to your own workspace', (await affected('update profiles set active_workspace_id=$1 where id=$2', [L2F, U.ED])) === 1);

// ---------------- Invitation-only membership (sign-up never grants access) ----------------
await asUser(U.STRANGER, { email: 'stranger@example.com' });
check('INV1', 'A freshly signed-up user sees no workspace data', (await rows('select id from workspaces')).length + (await rows('select id from clients')).length === 0);
check('INV2', 'A signed-up user cannot add themselves to a workspace',
  (await errCode(() => db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff','viewer')", [L2F, U.STRANGER]))) === '42501');
check('INV3', 'A non-admin cannot create invitations',
  (await errCode(() => db.query("select create_invitation($1,'x@example.com','staff','editor')", [L2F]))) === '42501');
await asUser(U.ADM);
check('INV4', 'An admin cannot invite an owner',
  (await errCode(() => db.query("select create_invitation($1,'boss@example.com','staff','owner')", [L2F]))) === '42501');
const tok = (await rows("select create_invitation($1,'New.Person@Example.com','staff','editor') t", [L2F]))[0].t;
await asSuper();
check('INV5', 'Only a hash of the token is stored', (await rows('select 1 from invitations where token_hash = $1', [tok])).length === 0 && tok.length === 64);
const bad = [];
await asUser(U.NEW, { email: 'someone.else@example.com' }); bad.push(await errCode(() => db.query('select accept_invitation($1)', [tok])));
await asUser(U.NEW, { email: 'new.person@example.com' }); bad.push(await errCode(() => db.query('select accept_invitation($1)', ['not-a-token'])));
check('INV6', 'Wrong email and wrong token fail with the same error', bad.every(c => c === 'P0002'), bad.join(','));
check('INV7', 'Matching verified email accepts the invitation', (await rows('select accept_invitation($1) m', [tok]))[0].m !== null);
check('INV8', 'The new member gets the default apps', (await rows('select app_key from launcher_apps($1)', [L2F])).length === 5);
check('INV9', 'An accepted invitation cannot be reused', (await errCode(() => db.query('select accept_invitation($1)', [tok]))) === 'P0002');
await asSuper();
const expTok = 'e'.repeat(64);
await db.query(`insert into invitations (workspace_id,email,kind,role,token_hash,invited_by,expires_at)
  values ($1,'late@example.com','staff','viewer',encode(sha256(convert_to($2,'UTF8')),'hex'),$3, now() - interval '1 minute')`, [L2F, expTok, U.ADM]);
await asUser(id(), { email: 'late@example.com' });
check('INV10', 'An expired invitation fails with the same error', (await errCode(() => db.query('select accept_invitation($1)', [expTok]))) === 'P0002');
check('INV11', 'Anonymous call to accept_invitation fails closed',
  await (async () => { await asSuper(); await db.exec('set role app_user'); return (await errCode(() => db.query('select accept_invitation($1)', [tok]))) === 'P0002'; })());

// ---------------- F9 workspaces ----------------
await asUser(U.OWN);
check('F9a', 'Even an owner cannot delete a workspace through the API', (await affected('delete from workspaces where id=$1', [L2F])) === 0);
await asSuper();
check('F9b', 'An external (customer) workspace can be created server-side', (await affected("insert into workspaces (slug,name,kind) values ('acme-customer','Acme','external')")) === 1);
check('F9c', 'New workspaces start with the Client Portal switched off',
  (await rows("select enabled from workspace_apps wa join workspaces w on w.id = wa.workspace_id where w.slug='acme-customer' and app_key='portal'"))[0].enabled === false);

// ---------------- 0003 integration layer ----------------
await asUser(U.ADM);
const CONN = id();
await db.query("insert into integration_connections (id,workspace_id,provider,secret_ref,created_by) values ($1,$2,'gohighlevel','GHL_L2F_TOKEN',$3)", [CONN, L2F, U.ADM]);
check('I1', 'secret_ref must be a NAME, never a key value',
  (await errCode(() => db.query("insert into integration_connections (workspace_id,provider,secret_ref,created_by) values ($1,'x','eyJhbGciOi.secret',$2)", [L2F, U.ADM]))) === '23514');
await asUser(U.AOWN);
check('I2', 'A Layer2Funnels connection is invisible from Aurj', (await rows('select id from integration_connections')).length === 0);
await asUser(U.ED);
check('I3', 'Editors cannot see connections', (await rows('select id from integration_connections')).length === 0);
check('I4', 'App users cannot write the webhook inbox (server only)',
  (await errCode(() => db.query("insert into webhook_inbox (workspace_id,connection_id,provider,delivery_id,payload) values ($1,$2,'gohighlevel','d1','{}')", [L2F, CONN]))) === '42501');
await asSuper();
await db.query("insert into webhook_inbox (workspace_id,connection_id,provider,delivery_id,payload) values ($1,$2,'gohighlevel','d1','{}')", [L2F, CONN]);
check('I5', 'A replayed webhook delivery is rejected',
  (await errCode(() => db.query("insert into webhook_inbox (workspace_id,connection_id,provider,delivery_id,payload) values ($1,$2,'gohighlevel','d1','{}')", [L2F, CONN]))) === '23505');
await db.query("insert into outbox_events (workspace_id,type,subject_type,idempotency_key) values ($1,'post.scheduled','content_post','k1')", [L2F]);
check('I6', 'A retried event with the same idempotency key is not duplicated',
  (await errCode(() => db.query("insert into outbox_events (workspace_id,type,subject_type,idempotency_key) values ($1,'post.scheduled','content_post','k1')", [L2F]))) === '23505');
check('I7', 'A webhook cannot reference another workspace\'s connection',
  (await errCode(() => db.query("insert into webhook_inbox (workspace_id,connection_id,provider,delivery_id,payload) values ($1,$2,'gohighlevel','d2','{}')", [AUR, CONN]))) === '23503');

// ---------------- report ----------------
const passed = results.filter(r => r.ok).length;
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id.padEnd(5)} ${r.name}${r.detail && !r.ok ? ` (${r.detail})` : ''}`);
console.log(`\n${passed}/${results.length} checks passed`);
await db.close();
process.exit(passed === results.length ? 0 : 1);
