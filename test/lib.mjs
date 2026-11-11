// Shared test harness. DB_DRIVER=pglite (default, PostgreSQL 17 in WebAssembly) or DB_DRIVER=pg
// (a real PostgreSQL server at PG_URL; each run creates and drops its own database).
import { readFileSync, readdirSync } from 'node:fs';

export const migrationFiles = () => {
  const dir = new URL('../migrations/', import.meta.url);
  return readdirSync(dir).filter(f => /^\d{4}_.+\.sql$/.test(f)).sort().map(f => new URL(f, dir));
};

export async function openDb(driver = process.env.DB_DRIVER || 'pglite') {
  if (driver === 'pglite') {
    const { PGlite } = await import('@electric-sql/pglite');
    const { types } = await import('@electric-sql/pglite');
    const db = await PGlite.create({ parsers: { [types.DATE]: (v) => v } });   // plain dates stay 'YYYY-MM-DD', as the real server sends them (packages/core/server.mjs)
    return {
      driver,
      exec: (sql) => db.exec(sql),
      query: async (sql, params = []) => { const r = await db.query(sql, params); return { rows: r.rows, affectedRows: r.affectedRows ?? 0 }; },
      close: () => db.close(),
    };
  }
  const pg = (await import('pg')).default;
  pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);   // as the real server (packages/core/server.mjs)
  const base = process.env.PG_URL || 'postgres://tester:tester@localhost:5432/postgres';
  const admin = new pg.Client({ connectionString: base });
  await admin.connect();
  const name = `l2f_test_${process.pid}_${Date.now()}`;
  await admin.query(`create database ${name}`);
  const url = new URL(base); url.pathname = `/${name}`;
  const c = new pg.Client({ connectionString: url.toString() });
  await c.connect();
  return {
    driver,
    exec: (sql) => c.query(sql),
    query: async (sql, params = []) => { const r = await c.query(sql, params); return { rows: r.rows, affectedRows: r.rowCount ?? 0 }; },
    close: async () => { await c.end(); await admin.query(`drop database ${name}`); await admin.end(); },
  };
}

// Supabase creates these roles before any migration runs; emulate that so migrations' conditional grants (and the lockdown) really execute.
const SUPABASE_ROLES = "do $$ declare r text; begin foreach r in array array['anon','authenticated','service_role'] loop if not exists (select 1 from pg_roles where rolname = r) then execute format('create role %I nologin', r); end if; end loop; end $$;";
export async function migrate(db) {
  await db.exec(SUPABASE_ROLES);
  for (const f of migrationFiles()) await db.exec(readFileSync(f, 'utf8'));
  if (process.env.MUTATION_SQL) await db.exec(process.env.MUTATION_SQL);  // negative-control runs only
}

// Sets identity exactly as PostgREST does. format: 'claims' (current Supabase) or 'legacy'.
export function session(db) {
  const clear = async () => {
    await db.query("select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.email', '', false), set_config('request.jwt.claims', '', false), set_config('request.headers', '', false), set_config('app.org_id', '', false)");
  };
  return {
    asUser: async (uid, { email = null, format = 'claims', org = null } = {}) => {
      await db.exec('reset role; set role app_user;');
      await clear();
      if (org) await db.query("select set_config('request.headers', $1, false)", [JSON.stringify({ 'x-org-id': org })]);
      if (format === 'legacy') {
        await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
        if (email) await db.query("select set_config('request.jwt.claim.email', $1, false)", [email]);
      } else {
        await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: uid, email, role: 'authenticated' })]);
      }
    },
    asSuper: async () => { await db.exec('reset role;'); await clear(); },
  };
}

export function recorder() {
  const results = [];
  return {
    results,
    check: (id, name, ok, detail = '') => results.push({ id, name, ok: !!ok, detail }),
    errCode: async (fn) => { try { await fn(); return 'no-error'; } catch (e) { return e.code ?? String(e.message); } },
  };
}

// An unexpected error is a failed run, reported in one line (no minified stack dumps).
const crash = (e) => { console.log(`FAIL  CRASH ${e?.code ?? ''} ${e?.message ?? e}`); if (process.env.TEST_STACK) console.log(e?.stack); process.exit(1); };
process.on('uncaughtException', crash);
process.on('unhandledRejection', crash);
