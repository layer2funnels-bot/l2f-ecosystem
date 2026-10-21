// The only way in is our API (migration 0010). A signed-in person (role `authenticated`) or a visitor with the public key (role `anon`)
// talking to the database's own interface directly (PostgREST, GraphQL, SQL as those roles) must get NOTHING: no reads, no writes,
// no function calls, no private schema, no way to become the API role. Metadata checks cover every object; real calls prove it.
import { randomUUID as id } from 'node:crypto';
import { openDb, migrate, session, recorder } from './lib.mjs';
const db = await openDb(); await migrate(db);
const { results, check, errCode } = recorder();
const rows = async (s, p = []) => (await db.query(s, p)).rows;
const as = async (role, uid) => {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims', $1, false), set_config('request.headers', '', false)", [JSON.stringify(uid ? { sub: uid, role } : { role })]);
  await db.exec(`set role ${role}`);
};

await db.exec('reset role');
const L = id(), A = id(), U = id(), V = id();
await db.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','L'),($2,'aurj','A')", [L, A]);
await db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff','owner'),($3,$2,'staff','owner'),($3,$4,'staff','viewer')", [L, U, A, V]);
const C = id(); await db.query("insert into clients (id,workspace_id,name) values ($1,$2,'Secret client'),(gen_random_uuid(),$3,'Other org client')", [C, L, A]);

const tables = (await rows("select tablename t from pg_tables where schemaname in ('public','private') order by 1")).map((r) => r.t);
const fns = await rows(`select p.oid::regprocedure::text f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public','private') and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')`);
const seqs = (await rows("select sequencename s from pg_sequences where schemaname in ('public','private')")).map((r) => r.s);

for (const role of ['authenticated', 'anon']) {
  const badT = [], badF = [], badS = [];
  for (const t of (await rows("select schemaname s, tablename t from pg_tables where schemaname in ('public','private')"))) {
    const q = `${t.s}.${t.t}`;
    const r = (await rows("select has_table_privilege($1, $2, 'select') a, has_table_privilege($1, $2, 'insert') b, has_table_privilege($1, $2, 'update') c, has_table_privilege($1, $2, 'delete') d, has_table_privilege($1, $2, 'references') e, has_table_privilege($1, $2, 'trigger') f, has_table_privilege($1, $2, 'truncate') g", [role, q]))[0];
    if (Object.values(r).some(Boolean)) badT.push(q);
  }
  for (const f of fns) if ((await rows('select has_function_privilege($1, $2::regprocedure, $3) x', [role, f.f, 'execute']))[0].x) badF.push(f.f);
  for (const s of seqs) if ((await rows("select has_sequence_privilege($1, 'public.' || $2, 'usage') or has_sequence_privilege($1, 'public.' || $2, 'select') x", [role, s]))[0].x) badS.push(s);
  check(`DA-${role}-1`, `${role}: no privilege of any kind on any of the ${tables.length} tables (public and private)`, badT.length === 0, badT.slice(0, 5).join(','));
  check(`DA-${role}-2`, `${role}: cannot execute any of the ${fns.length} functions`, badF.length === 0, badF.slice(0, 5).join(','));
  check(`DA-${role}-3`, `${role}: no use of any sequence`, badS.length === 0, badS.join(','));
  check(`DA-${role}-4`, `${role}: no usage of the private schema`, (await rows("select has_schema_privilege($1, 'private', 'usage') x", [role]))[0].x === false);
}

// real calls as the Data API would make them (a signed-in member of BOTH organizations: the worst case)
await as('authenticated', U);
const code = async (sql, p = []) => errCode(() => db.query(sql, p));
check('DA1', 'A signed-in owner of both organizations cannot read a table directly (42501), so cannot see two organizations at once', (await code('select * from clients')) === '42501' && (await code('select count(*) from memberships')) === '42501');
check('DA2', 'cannot write directly: insert, update, delete', (await code("insert into clients (workspace_id,name) values ($1,'x')", [L])) === '42501' && (await code("update clients set name='x'")) === '42501' && (await code('delete from clients')) === '42501');
check('DA3', 'cannot call any of our functions directly (this is how rate limits and typed input would be skipped)',
  (await code('select * from launcher_apps($1)', [L])) === '42501' && (await code("select create_invitation($1,'a@b.co','staff','viewer')", [L])) === '42501' && (await code('select * from my_organizations()')) === '42501' && (await code('select * from effective_access($1)', [L])) === '42501');
check('DA4', 'cannot reach the private schema (policy helpers, rate-limit counters, audit internals)', (await code('select private.has_permission($1, $2)', [L, 'platform.access.manage'])) === '42501' && (await code('select * from private.api_rate_limits')) === '42501');
// (SET ROLE is decided by the LOGIN role's membership, and the Data API logs in as a limited role that is a member of anon/authenticated
// only. A superuser test session can always SET ROLE, so we prove the membership instead, which is what blocks it in production.)
check('DA5', 'neither Data API role is a member of the API role or of any privileged role, so neither can become one', (await rows("select pg_has_role('authenticated','app_user','usage') a, pg_has_role('anon','app_user','usage') b, pg_has_role('authenticated','postgres','usage') c, pg_has_role('anon','postgres','usage') d, pg_has_role('authenticated','service_role','usage') e"))[0] && Object.values((await rows("select pg_has_role('authenticated','app_user','usage') a, pg_has_role('anon','app_user','usage') b, pg_has_role('authenticated','postgres','usage') c, pg_has_role('anon','postgres','usage') d, pg_has_role('authenticated','service_role','usage') e"))[0]).every((v) => v === false));
check('DA6', 'cannot read the permission catalog or audit trail either', (await code('select * from permissions')) === '42501' && (await code('select * from audit_events')) === '42501');
await as('anon');
check('DA7', 'a visitor with only the public key gets the same refusals', (await code('select * from clients')) === '42501' && (await code('select * from launcher_apps($1)', [L])) === '42501' && (await code('select * from workspaces')) === '42501');

// the positive control: the API role (what our server uses) still works, with its own row policies
const s2 = session(db);
await s2.asUser(U, { org: L });
check('DA8', 'Control: the same person through the API role sees only the organization named by x-org-id', (await rows('select name from clients')).map((r) => r.name).join() === 'Secret client');
await s2.asUser(V, { org: L });
check('DA9', 'Control: someone not in that organization sees nothing even through the API role', (await rows('select name from clients')).length === 0);

// future tables stay closed: a table created now (as migrations will) is not reachable by the Data API roles.
// (New FUNCTIONS are PUBLIC-executable in PostgreSQL by default; every migration revokes that, and audit test F4b fails the build if one does not.)
await db.exec('reset role');
await db.exec('create table public.zz_future_probe (id int)');
const fut = (await rows("select has_table_privilege('authenticated','public.zz_future_probe','select') a, has_table_privilege('anon','public.zz_future_probe','select') b, has_table_privilege('authenticated','public.zz_future_probe','insert') c"))[0];
check('DA10', 'A table added by a future migration is closed to those roles by default', !fut.a && !fut.b && !fut.c);
await db.exec('drop table public.zz_future_probe');
await db.exec('create function public.zz_leaky() returns int language sql as $$ select 1 $$');
check('DA11', 'Guard: a new function that forgets its revoke IS reachable by default, which is exactly what audit test F4b exists to catch', (await rows("select has_function_privilege('authenticated','public.zz_leaky()','execute') x"))[0].x === true);
await db.exec('drop function public.zz_leaky()');

for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(16)} ${x.name}${x.ok || !x.detail ? '' : ` (${x.detail})`}`);
const p = results.filter((x) => x.ok).length; console.log(`\n${p}/${results.length} checks passed`);
await db.close(); process.exit(p === results.length ? 0 : 1);
