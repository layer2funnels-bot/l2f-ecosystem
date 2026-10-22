// Fails if the database tools or the test server are not PostgreSQL 17 (production is Supabase on PostgreSQL 17; a dump or restore with older tools, or tests on an
// older server, can pass here and fail there). Checks pg_dump, pg_restore and psql on PATH, and the server behind PG_URL when set.
import { execFileSync } from 'node:child_process';
import pg from 'pg';

const bad = [];
for (const tool of ['pg_dump', 'pg_restore', 'psql']) {
  try { const v = execFileSync(tool, ['--version'], { encoding: 'utf8' }); const m = /(\d+)\.\d+/.exec(v); if (!m || m[1] !== '17') bad.push(`${tool} is version ${m?.[1] ?? '?'} (need 17)`); }
  catch { bad.push(`${tool} not found`); }
}
if (process.env.PG_URL || process.env.DB_DRIVER === 'pg' || process.env.DRIVERS?.includes('pg')) {
  const c = new pg.Client({ connectionString: process.env.PG_URL || 'postgres://tester:tester@localhost:5432/postgres' });
  try { await c.connect(); const v = (await c.query('show server_version')).rows[0].server_version; if (!v.startsWith('17.')) bad.push(`the test server is ${v} (need 17)`); } catch (e) { bad.push(`cannot reach the test server: ${e.message}`); } finally { await c.end().catch(() => {}); }
}
if (bad.length) { console.error(`FAIL PostgreSQL 17 check:\n  ${bad.join('\n  ')}\nInstall postgresql-17 / postgresql-client-17 (apt.postgresql.org) and put /usr/lib/postgresql/17/bin first on PATH.`); process.exit(1); }
console.log('PASS PostgreSQL 17: pg_dump, pg_restore, psql and the test server are all version 17');
