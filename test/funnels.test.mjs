// Office → Funnels data foundation (migration 0006; decisions FMP-1, FMP-2).
// Allow + deny per role, client visibility, organization isolation, audit, archive-before-delete, references by ID.
import { randomUUID as id } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { openDb, migrate, session, recorder } from './lib.mjs';
const db = await openDb(); await migrate(db);
const { asUser, asSuper } = session(db); const { results, check, errCode } = recorder();
const rows = async (s, p = []) => (await db.query(s, p)).rows;
const affected = async (s, p = []) => (await db.query(s, p)).affectedRows;

await asSuper();
const L = id(), A = id();
const U = { OWN: id(), ADM: id(), ED: id(), VW: id(), NOAPP: id(), BOTH: id(), AOWN: id(), CL1: id(), CL2: id() };
await db.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','L'),($2,'aurj','A')", [L, A]);
const staff = (u, ws, r) => db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff',$3)", [ws, u, r]);
await staff(U.OWN, L, 'owner'); await staff(U.ADM, L, 'admin'); await staff(U.ED, L, 'editor'); await staff(U.VW, L, 'viewer');
await staff(U.NOAPP, L, 'editor'); await staff(U.AOWN, A, 'owner'); await staff(U.BOTH, L, 'editor'); await staff(U.BOTH, A, 'editor');
for (const [u, ws] of [[U.ED, L], [U.VW, L], [U.BOTH, L], [U.BOTH, A]])
  await db.query("insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,'office')", [ws, u]);
const C1 = id(), C2 = id(), CA = id();
await db.query("insert into clients (id,workspace_id,name) values ($1,$4,'Client 1'),($2,$4,'Client 2'),($3,$5,'Aurj client')", [C1, C2, CA, L, A]);
await db.query("insert into memberships (workspace_id,user_id,kind,client_id) values ($1,$2,'client',$3),($1,$4,'client',$5)", [L, U.CL1, C1, U.CL2, C2]);

const T = [['funnel_avatars', 'avatar', "name"], ['funnel_offers', 'offer', "name"], ['funnel_stories', 'story', "title"], ['funnel_brand_kits', 'brandkit', "name"]];
const ins = (t, col, ws, client, extra = '') => db.query(`insert into ${t} (workspace_id, client_id, ${col}${extra ? ', ' + extra.split('=')[0] : ''}) values ($1, $2, 'rec'${extra ? ', ' + extra.split('=')[1] : ''}) returning id`, [ws, client]);
const idOf = async (t, col, ws, client, extra) => (await ins(t, col, ws, client, extra)).rows[0].id;

// ---- A. allow and deny per role (organization-wide records)
await asUser(U.OWN);
const org = {}; for (const [t, , col] of T) org[t] = await idOf(t, col, L, null);
check('FN1', 'Owner creates an avatar, offer, story and brand kit', Object.keys(org).length === 4);
await asUser(U.ED);
const edIds = []; let ok = true;
for (const [t, , col] of T) { try { edIds.push(await idOf(t, col, L, null)); } catch { ok = false; } }
const edEdit = []; for (const [t, , col] of T) edEdit.push(await affected(`update ${t} set ${col}='renamed' where id=$1`, [org[t]]));
check('FN2', 'Editor (with the Office app) creates and edits all four record types', ok && edEdit.every((n) => n === 1));
await asUser(U.VW);
const vwSee = []; for (const [t] of T) vwSee.push((await rows(`select id from ${t}`)).length);
const vwWrite = []; for (const [t, , col] of T) vwWrite.push(await errCode(() => ins(t, col, L, null)));
const vwEdit = []; for (const [t, , col] of T) vwEdit.push(await affected(`update ${t} set ${col}='x' where id=$1`, [org[t]]));
check('FN3', 'Viewer reads everything but cannot create or edit any type', vwSee.every((n) => n >= 1) && vwWrite.every((c) => c === '42501') && vwEdit.every((n) => n === 0));
await asUser(U.NOAPP);
const naSee = []; for (const [t] of T) naSee.push((await rows(`select id from ${t}`)).length);
check('FN4', 'An editor without the Office app grant sees nothing and cannot create', naSee.every((n) => n === 0) && (await errCode(() => ins('funnel_avatars', 'name', L, null))) === '42501');
await asUser(U.ADM);
check('FN5', 'Admin cannot permanently delete (owner-only by default)', (await affected('delete from funnel_avatars where id=$1', [org.funnel_avatars])) === 0);

// ---- B. organization isolation
await asUser(U.AOWN);
const aSee = []; for (const [t] of T) aSee.push((await rows(`select id from ${t}`)).length);
check('FN6', 'Another organization sees none of these records and cannot create inside this one',
  aSee.every((n) => n === 0) && (await errCode(() => ins('funnel_avatars', 'name', L, null))) === '42501');
await asUser(U.BOTH); const aAvatar = await idOf('funnel_avatars', 'name', A, null); await asUser(U.BOTH, { org: A });
const scoped = await rows('select workspace_id from funnel_avatars'); await asUser(U.BOTH, { org: L });
const scopedL = await rows('select workspace_id from funnel_avatars');
check('FN7', 'A person in both organizations sees only the one named by x-org-id', scoped.length === 1 && scoped[0].workspace_id === A && scopedL.every((r) => r.workspace_id === L) && scopedL.length >= 1);
await asUser(U.ED);
check('FN8', 'An offer cannot point at another organization’s avatar', (await errCode(() => ins('funnel_offers', 'name', L, null, `avatar_id=$3`.replace('$3', `'${aAvatar}'`)))) === '23503');
check('FN9', 'A record cannot be attached to another organization’s client', (await errCode(() => ins('funnel_avatars', 'name', L, CA))) === '23503');

// ---- C. client visibility
await asUser(U.ED);
const priv1 = await idOf('funnel_avatars', 'name', L, C1);
await asUser(U.ADM);
check('FN10', 'client_visible needs a client: even an admin cannot show an org-wide record to clients', (await errCode(() => db.query("update funnel_avatars set client_visible=true where id=$1", [org.funnel_avatars]))) === '23514');
await asUser(U.ED);
check('FN11', 'An editor cannot make a record client-visible (sharing is its own permission)', (await errCode(() => db.query("update funnel_avatars set client_visible=true where id=$1", [priv1]))) === '42501');
await asUser(U.ADM);
const shared1 = await idOf('funnel_avatars', 'name', L, C1, 'client_visible=true');
const shared2 = await idOf('funnel_offers', 'name', L, C2, 'client_visible=true');
const sharedKit = await idOf('funnel_brand_kits', 'name', L, C1, 'client_visible=true');
const hiddenStory = await idOf('funnel_stories', 'title', L, C1);
check('FN12', 'Admin can share a client record', !!shared1 && !!shared2);
await asSuper(); await db.query("update workspace_apps set enabled=true where workspace_id=$1 and app_key='portal'", [L]);
await asUser(U.CL1);
const cl1 = Object.fromEntries(await Promise.all(T.map(async ([t]) => [t, (await rows(`select id from ${t}`)).map((r) => r.id)])));
check('FN13', 'A client sees only visible records of their own client: no internal, no other client’s, no org-wide',
  cl1.funnel_avatars.length === 1 && cl1.funnel_avatars[0] === shared1 && cl1.funnel_offers.length === 0 && cl1.funnel_brand_kits[0] === sharedKit && cl1.funnel_stories.length === 0 && !cl1.funnel_stories.includes(hiddenStory));
const clientWrites = [
  await errCode(() => ins('funnel_avatars', 'name', L, C1)),
  await affected("update funnel_avatars set name='hacked' where id=$1", [shared1]),
  await affected('delete from funnel_avatars where id=$1', [shared1]),
];
check('FN14', 'A client cannot create, edit or delete funnel records', clientWrites[0] === '42501' && clientWrites[1] === 0 && clientWrites[2] === 0);
await asUser(U.CL2);
check('FN15', 'Another client sees only their own shared record', (await rows('select id from funnel_offers')).map((r) => r.id).join() === shared2 && (await rows('select id from funnel_avatars')).length === 0);
await asSuper(); await db.query("update workspace_apps set enabled=false where workspace_id=$1 and app_key='portal'", [L]);
await asUser(U.CL1);
check('FN16', 'With the Client Portal switched off, clients see nothing', (await rows('select id from funnel_avatars')).length === 0);
await asUser(U.ADM);
await db.query("update funnel_avatars set archived_at=now() where id=$1", [shared1]);
await asSuper(); await db.query("update workspace_apps set enabled=true where workspace_id=$1 and app_key='portal'", [L]);
await asUser(U.CL1);
check('FN17', 'Archiving a shared record hides it from the client', (await rows('select id from funnel_avatars')).length === 0);
await asSuper(); await db.query("update workspace_apps set enabled=false where workspace_id=$1 and app_key='portal'", [L]);

// ---- D. archive before delete, records do not move
await asUser(U.OWN);
check('FN18', 'Deleting an unarchived record is refused: archive it instead', (await errCode(() => db.query('delete from funnel_avatars where id=$1', [priv1]))) === 'P0001');
await db.query('update funnel_avatars set archived_at=now() where id=$1', [priv1]);
check('FN19', 'Owner can delete an archived, unreferenced record', (await affected('delete from funnel_avatars where id=$1', [priv1])) === 1);
await asUser(U.ED);
check('FN20', 'A record cannot move to another client or organization', (await errCode(() => db.query('update funnel_avatars set client_id=$1 where id=$2', [C2, shared1]))) === 'P0001'
  && (await errCode(() => db.query('update funnel_avatars set workspace_id=$1 where id=$2', [A, org.funnel_avatars]))) === 'P0001');
const forged = (await db.query("insert into funnel_avatars (workspace_id,name,created_by) values ($1,'forged',$2) returning created_by", [L, U.OWN])).rows[0].created_by;
check('FN21', 'created_by is always the signed-in person, never what the caller sends', forged === U.ED);
await asSuper();
check('FN22', 'A client holding funnel records cannot be deleted (archive it)', (await errCode(() => db.query('delete from clients where id=$1', [C1]))) === 'P0001');

// ---- E. references by ID (Clients, Value Ladder)
await asUser(U.ED);
const ref = (app, type, rid, target, client = C1, col = 'offer_id') => db.query(`insert into funnel_references (workspace_id, client_id, referrer_app, referrer_type, referrer_id, ${col}) values ($1,$2,$3,$4,$5,$6) returning id`, [L, client, app, type, rid, target]);
const offerC1 = await idOf('funnel_offers', 'name', L, C1);
const r1 = (await ref('clients', 'client', C1, offerC1)).rows[0].id;
const r2 = (await ref('value_ladder', 'stage', id(), offerC1)).rows[0].id;
check('FN23', 'Clients and Value Ladder reference a record by ID', !!r1 && !!r2);
check('FN24', 'The same link cannot be added twice', (await errCode(() => ref('clients', 'client', C1, offerC1))) === '23505');
check('FN25', 'A reference must name exactly one target', (await errCode(() => db.query("insert into funnel_references (workspace_id,referrer_app,referrer_type,referrer_id,offer_id,avatar_id) values ($1,'clients','client',$2,$3,$4)", [L, id(), offerC1, org.funnel_avatars]))) === '23514');
check('FN26', 'A reference cannot point at another organization’s record', (await errCode(() => ref('clients', 'client', C1, aAvatar, C1, 'avatar_id'))) === '23503');
check('FN27', 'Only known referrer apps are accepted', (await errCode(() => ref('funnel_mapper_pro', 'map', id(), offerC1))) === '23514');
await asUser(U.VW);
check('FN28', 'Viewer can see references but not change them', (await rows('select id from funnel_references')).length === 2 && (await errCode(() => ref('clients', 'client', id(), offerC1))) === '42501');
await asUser(U.OWN);
await db.query('update funnel_offers set archived_at=now() where id=$1', [offerC1]);
check('FN29', 'A referenced record cannot be deleted even when archived', (await errCode(() => db.query('delete from funnel_offers where id=$1', [offerC1]))) === 'P0001');
await db.query('delete from funnel_references where offer_id=$1', [offerC1]);
check('FN30', 'After the references are removed the archived record can be deleted', (await affected('delete from funnel_offers where id=$1', [offerC1])) === 1);

// ---- F. owner-controlled permissions on the shared engine
await asUser(U.OWN);
await db.query("insert into permission_overrides (workspace_id,principal_type,principal_id,permission_key,effect,reason) values ($1,'user',$2,'funnels.offer.edit','deny','test restriction')", [L, U.ED]);
await asUser(U.ED);
check('FN31', 'Restricting offers for one person leaves avatars editable', (await affected("update funnel_offers set name='n' where id=$1", [org.funnel_offers])) === 0
  && (await affected("update funnel_avatars set name='n' where id=$1", [org.funnel_avatars])) === 1);
await asUser(U.ED);
const eff = await rows('select permission_key, allowed from effective_access($1)', [L]);
check('FN32', 'Effective-access review lists funnels.* permissions with the restriction shown', eff.filter((e) => e.permission_key.startsWith('funnels.')).length === 23 && eff.find((e) => e.permission_key === 'funnels.offer.edit').allowed === false);

// ---- G. audit
await asUser(U.ED);
await db.query("update funnel_avatars set pains='SECRET-LONG-TEXT-9' where id=$1", [org.funnel_avatars]);
await asUser(U.OWN);
const au = await rows("select action, detail, actor_id from audit_events where action like 'funnel_%' order by created_at");
const acts = new Set(au.map((a) => a.action));
check('FN33', 'Create, change, archive, share and delete of funnel records are audited with the actor',
  ['funnel_avatars.insert', 'funnel_avatars.update', 'funnel_avatars.delete', 'funnel_offers.insert', 'funnel_stories.insert', 'funnel_brand_kits.insert', 'funnel_references.insert', 'funnel_references.delete'].every((a) => acts.has(a)) && au.every((a) => a.actor_id));
check('FN34', 'Audit detail records archive and visibility changes, but never the long text fields (pains, body, voice, notes)',
  au.some((a) => a.detail?.archived_at) && au.some((a) => a.detail?.client_visible) && !JSON.stringify(au).includes('SECRET-LONG-TEXT-9'));

// ---- H. app structure
await asUser(U.ED);
const swEd = (await rows("select * from resolve_org_switch($1,'office','funnels.avatars')", [L]))[0];
await asUser(U.NOAPP);
const swNo = (await rows("select * from resolve_org_switch($1,'office','funnels.avatars')", [L]))[0];
check('FN35', 'Funnels pages are registered; an editor lands on Avatars, someone without Office gets the explained no-redirect outcome',
  swEd.outcome === 'same_page' && swEd.page_key === 'funnels.avatars' && swNo.outcome === 'app_unavailable');
await asSuper();
const lv = async (ws) => (await rows("select name from access_levels where workspace_id=$1 and name like 'Funnels%' order by name", [ws])).map((r) => r.name).join('|');
const N = id(); await db.query("insert into workspaces (id,slug,name) values ($1,'new-org','New')", [N]);
check('FN36', 'Starter “Funnels · edit / read” levels exist in every organization, including new ones', (await lv(L)) === 'Funnels · edit|Funnels · read' && (await lv(A)) === (await lv(L)) && (await lv(N)) === (await lv(L)));
const sql = readFileSync(new URL('../migrations/0006_funnels_foundation.sql', import.meta.url), 'utf8').split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
check('FN37', 'Migration 0006 never touches Funnel Mapper Pro (FMP-2): no reference to its app, entitlement or tables', !/funnel_mapper/i.test(sql) && !/workspace_apps/.test(sql) && !/insert into public\.apps/.test(sql));
check('FN38', 'No new table sits outside organization isolation, RLS and the request-scope policy',
  (await rows(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'funnel_%' and c.relkind='r'
     and (not c.relrowsecurity or not c.relforcerowsecurity or not exists (select 1 from pg_policies p where p.tablename=c.relname and p.policyname='org_scope'))`)).length === 0);

for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}${x.ok || !x.detail ? '' : ` (${x.detail})`}`);
const p = results.filter((x) => x.ok).length; console.log(`\n${p}/${results.length} checks passed`);
await db.close(); process.exit(p === results.length ? 0 : 1);
