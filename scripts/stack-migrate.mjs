// Applies migrations/*.sql to the LOCAL Supabase stack in order, once each (tracked in l2f_local.applied).
// Refuses any database that is not on 127.0.0.1/localhost: this script must never touch a live project.
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { migrationFiles } from '../test/lib.mjs';

const url = process.env.STACK_DB_URL || 'postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres';
if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) { console.error('Refusing: not a local database.'); process.exit(1); }
const c = new pg.Client({ connectionString: url }); await c.connect();
await c.query('create schema if not exists l2f_local; create table if not exists l2f_local.applied (name text primary key, at timestamptz default now())');
const done = new Set((await c.query('select name from l2f_local.applied')).rows.map((r) => r.name));
for (const f of migrationFiles()) {
  const name = f.pathname.split('/').pop();
  if (done.has(name)) { console.log(`skip   ${name}`); continue; }
  await c.query('begin'); await c.query(readFileSync(f, 'utf8'));
  await c.query('insert into l2f_local.applied (name) values ($1)', [name]); await c.query('commit');
  console.log(`applied ${name}`);
}
await c.end();
