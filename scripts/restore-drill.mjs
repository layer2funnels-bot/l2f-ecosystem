// T17 restore drill on a real PostgreSQL server (local or CI service container). $0, synthetic data only.
// Build -> fill -> pg_dump -> pg_restore into a new database -> compare schema, row counts and isolation.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID as id } from 'node:crypto';
import pg from 'pg';
import { migrationFiles } from '../test/lib.mjs';

const base = new URL(process.env.PG_URL || 'postgres://tester:tester@localhost:5432/postgres');
const urlFor = (db) => { const u = new URL(base); u.pathname = `/${db}`; return u.toString(); };
const admin = new pg.Client({ connectionString: base.toString() }); await admin.connect();
const SRC = `drill_src_${Date.now()}`, DST = `drill_dst_${Date.now()}`;
const results = []; const check = (id, n, ok, d = '') => results.push({ id, n, ok, d });
if (process.env.DUMP_FILE) {   // verify a REAL export (e.g. from scripts/export-project.sh) restores cleanly
  try {
    await admin.query(`create database ${DST}`);
    execFileSync('pg_restore', ['--no-owner', '--no-acl', '-d', urlFor(DST), process.env.DUMP_FILE], { stdio: 'pipe' });
    const c = new pg.Client({ connectionString: urlFor(DST) }); await c.connect();
    const t = (await c.query("select count(*)::int n from information_schema.tables where table_schema='public'")).rows[0].n;
    console.log(`restored ${t} public tables into a scratch database; compare with rowcounts.txt in the export`);
    await c.end(); check('RD', 'Real export restores without error', t > 0);
  } catch (e) { check('RD', 'Real export restores without error', false, e.message); }
  finally { await admin.query(`drop database if exists ${DST}`); await admin.end(); }
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id}  ${r.n}${r.ok ? '' : ` (${r.d})`}`);
  process.exit(results.every(r => r.ok) ? 0 : 1);
}
try {
  await admin.query(`create database ${SRC}`); await admin.query(`create database ${DST}`);
  const src = new pg.Client({ connectionString: urlFor(SRC) }); await src.connect();
  for (const f of migrationFiles()) await src.query(readFileSync(f, 'utf8'));
  const L = id(), A = id(), U1 = id(), U2 = id();
  await src.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','L'),($2,'aurj','A')", [L, A]);
  await src.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff','owner'),($3,$4,'staff','owner')", [L, U1, A, U2]);
  for (let i = 0; i < 25; i++) await src.query('insert into clients (workspace_id,name) values ($1,$2),($3,$4)', [L, `L client ${i}`, A, `A client ${i}`]);
  await src.end();

  const dump = '/tmp/l2f-drill.dump';
  execFileSync('pg_dump', ['-Fc', '--no-owner', '-f', dump, urlFor(SRC)]);
  execFileSync('pg_restore', ['--no-owner', '--exit-on-error', '-d', urlFor(DST), dump]);

  const schema = (db) => execFileSync('pg_dump', ['--schema-only', '--no-owner', urlFor(db)], { encoding: 'utf8' })
    .split('\n').filter(l => !l.startsWith('--') && !/^\\(un)?restrict /.test(l)).join('\n');
  check('R1', 'Restored schema (tables, functions, policies, triggers, grants) matches the source', schema(SRC) === schema(DST));

  const counts = async (db) => { const c = new pg.Client({ connectionString: urlFor(db) }); await c.connect();
    const r = (await c.query(`select (select count(*) from clients)::int cl, (select count(*) from memberships)::int m,
      (select count(*) from workspace_apps)::int wa, (select count(*) from audit_events)::int au,
      (select count(*) from pg_policies where schemaname='public')::int pol`)).rows[0]; await c.end(); return r; };
  const a = await counts(SRC), b = await counts(DST);
  check('R2', 'Row counts identical after restore', JSON.stringify(a) === JSON.stringify(b), JSON.stringify(b));

  const dst = new pg.Client({ connectionString: urlFor(DST) }); await dst.connect();
  await dst.query('set role app_user');
  await dst.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: U1 })]);
  const seen = (await dst.query('select distinct workspace_id from clients')).rows.map(r => r.workspace_id);
  check('R3', 'Isolation still enforced on the restored copy', seen.length === 1 && seen[0] === L);
  await dst.end();
} catch (e) { check('RX', 'Drill ran without error', false, e.message); }
finally {
  await admin.query(`drop database if exists ${SRC}`); await admin.query(`drop database if exists ${DST}`); await admin.end();
}
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id}  ${r.n}${r.ok ? '' : ` (${r.d})`}`);
const p = results.filter(r => r.ok).length; console.log(`\n${p}/${results.length} checks passed`); process.exit(p === results.length ? 0 : 1);
