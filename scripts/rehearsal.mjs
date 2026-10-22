// Go-live rehearsal on the LOCAL Supabase stack, following docs/GO_LIVE_RUNBOOK.md step by step (steps 4, 5, 8, 9, 10, 11, 12).
// Local only: refuses anything that is not 127.0.0.1. Creates throw-away databases (`rehearsal`, `rehearsal_restore`) and files under a temp folder.
// Output: PASS / FAIL for what must hold, GAP for what the rehearsal found that the runbook or the setup does not cover yet.
//   npm run stack:start && npm run stack:migrate && node scripts/rehearsal.mjs
import { execFile, execFileSync, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, writeFileSync, mkdtempSync, readdirSync, existsSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { migrationFiles } from '../test/lib.mjs';
import { startDevServer, LOCAL_ENV } from './dev-server.mjs';
import { startFakeS3 } from '../test/fakes/fake-s3.mjs';
import { createS3Storage } from '../packages/core/storage-adapter.mjs';
const runAsync = (cmd, args, opts = {}) => new Promise((done) => { execFile(cmd, args, { encoding: 'utf8', ...opts }, (err, stdout, stderr) => done({ status: err ? (err.code ?? 1) : 0, stdout, stderr })); });   // not spawnSync: the in-process fake server must keep answering

const ADMIN = 'postgresql://supabase_admin:postgres@127.0.0.1:54322';
const KEY = process.env.STACK_PUBLISHABLE_KEY || 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const DBC = 'supabase_db_l2f-ecosystem';
const out = []; const note = (k, id, name, d = '') => { out.push({ k, id, name, d }); console.log(`${k.padEnd(4)} ${id.padEnd(5)} ${name}${d ? `  [${d}]` : ''}`); };
const ok = (id, name, cond, d = '') => note(cond ? 'PASS' : 'FAIL', id, name, cond ? '' : d);
const gap = (id, name, d = '') => note('GAP', id, name, d);
const work = mkdtempSync(join(tmpdir(), 'rehearsal-'));
const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts });
const client = async (db) => { const c = new pg.Client({ connectionString: `${ADMIN}/${db}` }); await c.connect(); return c; };
const root = new URL('..', import.meta.url).pathname;

// ---------------------------------------------------------------- step 4: empty database, migrations 0001 to latest, in order
const a = await client('postgres');
await a.query('drop database if exists rehearsal'); await a.query('create database rehearsal template template0');
const r = await client('rehearsal');
let applied = 0, failed = null;
for (const f of migrationFiles()) { try { await r.query('begin'); await r.query(readFileSync(f, 'utf8')); await r.query('commit'); applied += 1; } catch (e) { await r.query('rollback'); failed = `${f.pathname.split('/').pop()}: ${e.message}`; break; } }
ok('R4a', `Migrations apply in order to an EMPTY database on the real Supabase Postgres (${applied} files)`, !failed && applied >= 21, failed ?? '');
ok('R4b', 'Nothing exists before the owner signs in: no organization, no member, no client', (await r.query('select (select count(*)::int from workspaces) w, (select count(*)::int from memberships) m, (select count(*)::int from clients) c')).rows.every((x) => x.w === 0 && x.m === 0 && x.c === 0));
const priv = (await r.query(`select count(*)::int n from (select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public','private') and c.relkind in ('r','v','m','S')
  and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert') or has_table_privilege('authenticated', c.oid, 'insert')
    or has_table_privilege('authenticated', c.oid, 'update') or has_table_privilege('authenticated', c.oid, 'delete'))) x`)).rows[0].n;
ok('R4c', 'The Data API roles (anon, authenticated) hold no privilege on any table in public or private of the fresh database', priv === 0, String(priv));
const fnPriv = (await r.query(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private') and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')`)).rows[0].n;
ok('R4d', 'No function of ours can be executed by the Data API roles', fnPriv === 0, String(fnPriv));

// ---------------------------------------------------------------- step 12: bootstrap (the only statement that creates organizations)
const OWNER = randomUUID();
const boot = sh('psql', [`${ADMIN}/rehearsal`, '-v', `owner_id=${OWNER}`, '-v', 'ON_ERROR_STOP=1', '-f', join(root, 'seed/bootstrap.sql')]);
ok('R12a', 'seed/bootstrap.sql runs with the owner id and creates both organizations with that person as owner', boot.status === 0, boot.stderr.slice(0, 200));
const bs = (await r.query(`select (select count(*)::int from workspaces) w, (select count(*)::int from memberships where user_id = $1 and role = 'owner') m,
  (select count(*)::int from workspace_apps where app_key = 'funnel_mapper_pro' and enabled and launch_url is null) t, (select count(*)::int from workspace_apps where app_key = 'portal' and enabled) p`, [OWNER])).rows[0];
ok('R12b', 'Two organizations, the owner in both, the Funnel Mapper Pro tile on with no address yet, the Client Portal OFF', bs.w === 2 && bs.m === 2 && bs.t === 1 && bs.p === 0, JSON.stringify(bs));
const boot2 = sh('psql', [`${ADMIN}/rehearsal`, '-v', `owner_id=${OWNER}`, '-f', join(root, 'seed/bootstrap.sql')]);
ok('R12c', 'Running the bootstrap twice is refused (it cannot create duplicate organizations)', boot2.status !== 0 || (await r.query('select count(*)::int n from workspaces')).rows[0].n === 2);
const pol = (await r.query("select count(*)::int n from pg_policies where schemaname = 'public'")).rows[0].n;
ok('R12d', `Row security policies are present in the fresh database (${pol})`, pol > 100, String(pol));
await r.end();

// ---------------------------------------------------------------- step 5: authentication settings (local config as the template for the live ones)
const cfg = readFileSync(join(root, 'supabase/config.toml'), 'utf8');
const val = (k) => (cfg.match(new RegExp(`^${k}\\s*=\\s*(.+)$`, 'm')) || [])[1]?.trim();
ok('R5a', 'Minimum password length is 10 (the approved sign-up design)', val('minimum_password_length') === '10', val('minimum_password_length'));
ok('R5b', 'Sign-up is on (new people land on "No workspace" until invited)', /\[auth\]\s[\s\S]*?enable_signup = true/.test(cfg));
if (/\[auth\.email\][\s\S]*?enable_confirmations = false/.test(cfg)) gap('R5c', 'Local config has e-mail confirmation OFF (needed by the automated sign-up tests). The LIVE project must turn it ON (runbook step 5): it is a dashboard setting, not part of this repository, so it cannot be rehearsed here', 'checklist item for the owner');
gap('R5d', 'JWT signing keys, redirect URLs, SMTP and Google can only be set in the live dashboard; the repository holds no file for them, so the runbook checklist is the only control', 'owner checklist; verify with the smoke tests after setting');

// ---------------------------------------------------------------- step 8: the static site build for the live project, and what it loads
const LIVE_URL = 'https://rehearsalref.supabase.co';
const build = sh('node', [join(root, 'scripts/build-web.mjs')], { env: { ...process.env, SUPABASE_URL: LIVE_URL, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_rehearsal0000000000000000', GOOGLE_ENABLED: 'true' } });
ok('R8a', 'build-web accepts a live-shaped URL and a publishable key', build.status === 0, build.stderr.slice(0, 200));
const bad = sh('node', [join(root, 'scripts/build-web.mjs')], { env: { ...process.env, SUPABASE_URL: LIVE_URL, SUPABASE_PUBLISHABLE_KEY: 'sb_secret_rehearsal0000000000000000' } });
ok('R8b', 'build-web refuses a secret key', bad.status !== 0);
const dist = join(root, 'dist/web');
const hdr = readFileSync(join(dist, '_headers'), 'utf8');
ok('R8c', 'The page policy allows only our own files and the live project (no localhost left)', hdr.includes('rehearsalref.supabase.co') && !hdr.includes('127.0.0.1') && /script-src 'self'/.test(hdr) && /frame-ancestors 'none'/.test(hdr));
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]);
const files = walk(dist).filter((f) => /\.(html|js|css|mjs)$/.test(f));
const hosts = new Set(); for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) hosts.add(m[1].toLowerCase());
const allowedHosts = new Set(['rehearsalref.supabase.co', 'www.w3.org', 'openfontlicense.org', 'scripts.sil.org', 'fonts.google.com', 'github.com', 'example.com', 'office.example', 'layer2funnels.com', 'www.layer2funnels.com']);
const stray = [...hosts].filter((h) => !allowedHosts.has(h) && !h.endsWith('.example.com'));
ok('R8d', 'The built site loads nothing from any other host (fonts, scripts, styles are our own); only licence/namespace text mentions other hosts', stray.length === 0, stray.join(','));
const cfgjs = readFileSync(join(dist, 'config.js'), 'utf8');
ok('R8e', 'config.js carries only the public URL and publishable key', cfgjs.includes('rehearsalref') && !/service_role|sb_secret|eyJ/.test(cfgjs));
ok('R8f', 'The four self-hosted v4 font families are in the build', ['bricolage-grotesque', 'geist-latin', 'geist-mono', 'noto-nastaliq-urdu'].every((n) => files.concat(walk(dist)).some((f) => f.includes(n))));
const fnSrc = readFileSync(join(root, 'functions/api/[[route]].js'), 'utf8');
ok('R8h', 'The Pages function builds a server per request (Workers cannot reuse a connection across requests: found in this rehearsal) and shares only state with no connection in it', /createSharedState/.test(fnSrc) && /createServer\(\{ \.\.\.env, DB_POOL_MAX: '1' \}/.test(fnSrc) && /waitUntil\(server\.close\(\)\)/.test(fnSrc));
ok('R8g', 'The Pages function exists and wrangler.toml carries nodejs_compat', existsSync(join(root, 'functions/api/[[route]].js')) && /nodejs_compat/.test(readFileSync(join(root, 'wrangler.toml'), 'utf8')));
rmSync(dist, { recursive: true, force: true });

// ---------------------------------------------------------------- step 9 and 11: smoke tests through the same handler Cloudflare runs, with the shared rate-limit store ON
const logs = []; const srv = await startDevServer({ port: 8799, sink: (l) => logs.push(l), env: { ...LOCAL_ENV, ...process.env, RATE_LIMIT_STORE: 'postgres', DB_POOL_MAX: '3' } });
const base = `http://127.0.0.1:8799`;
const get = async (p, h = {}) => { const x = await fetch(base + p, { headers: h }); return { status: x.status, text: await x.text(), headers: x.headers }; };
let x = await get('/api/health');
ok('R9a', '/api/health answers {"ok":true} without a database or a login', x.status === 200 && JSON.parse(x.text).ok === true);
x = await get('/');
ok('R9b', 'The page loads with the security headers (policy, nosniff, no framing)', x.status === 200 && /script-src 'self'/.test(x.headers.get('content-security-policy') ?? '') && x.headers.get('x-content-type-options') === 'nosniff');
const post = async (op, input, token, org) => { const rr = await fetch(`${base}/api/${op}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(org ? { 'x-org-id': org } : {}) }, body: JSON.stringify(input ?? {}) }); return { status: rr.status, body: await rr.json().catch(() => ({})) }; };
const NIL = '00000000-0000-0000-0000-000000000000';
let p = await post('clients.list', {}, null, randomUUID());
ok('R9c', 'A signed-out call to an operation is refused', p.status === 404 || p.status === 401, String(p.status));
p = await post('clients.list', {}, 'not.a.token', randomUUID());
ok('R9d', 'A call with a bad token answers "session expired" (the one answer that tells a caller their token is bad)', p.status === 401 && p.body.error?.code === 'session_expired', JSON.stringify(p));
const un = await fetch('http://127.0.0.1:54321/rest/v1/clients?select=*', { headers: { apikey: KEY } });
ok('R9e', 'The Data API with only the public key reads nothing', un.status >= 400 || (await un.json()).length === 0, String(un.status));
const un2 = await fetch('http://127.0.0.1:54321/rest/v1/rpc/launcher_apps', { method: 'POST', headers: { apikey: KEY, 'content-type': 'application/json' }, body: JSON.stringify({ p_org: NIL }) });
ok('R9f', 'The Data API with only the public key cannot call our functions', un2.status >= 400);
// a real sign-up, a real token, the empty-state path: "No workspace" until invited
const su = await (await fetch('http://127.0.0.1:54321/auth/v1/signup', { method: 'POST', headers: { apikey: KEY, 'content-type': 'application/json' }, body: JSON.stringify({ email: `rehearsal.${Date.now()}@example.com`, password: 'correct-horse-battery-staple' }) })).json();
p = await post('org.list', {}, su.access_token, NIL);
ok('R9g', 'A brand-new account (signed up, not invited) lists no organization and sees no data', p.status === 200 && p.body.data.length === 0);
p = await post('clients.list', {}, su.access_token, randomUUID());
ok('R9h', '…and every organization operation is "not found" for it', p.status === 404);
await post('profile.touch', { name: 'Rehearsal' }, su.access_token, NIL);   // a write-class call: the shared store counts writes and sensitive calls
const rl = new pg.Client({ connectionString: `${ADMIN}/postgres` }); await rl.connect();
const hasStore = (await rl.query("select count(*)::int n from private.api_rate_limits")).rows[0].n;
ok('R9i', 'The shared rate-limit store (RATE_LIMIT_STORE=postgres) takes counts in the database, and the server never had to fall back to per-instance counting', hasStore >= 1 && !JSON.stringify(logs).includes('rate_store_unavailable'), `${hasStore} ${JSON.stringify(logs).includes('rate_store_unavailable')}`);
await rl.end();
// keep-alive workflow commands, run against the local equivalents
const ka = await fetch(`${base}/api/health`); const kaAuth = await fetch('http://127.0.0.1:54321/auth/v1/health', { headers: { apikey: KEY } });
ok('R11', 'The keep-alive workflow\'s two calls work (site health 200, project auth health 200)', ka.status === 200 && kaAuth.status === 200, `${ka.status} ${kaAuth.status}`);
await srv.close?.();

// ---------------------------------------------------------------- step 10: backup, restore, compare
const bin = join(work, 'bin'); sh('mkdir', ['-p', bin]);
// Supabase is PostgreSQL 17. With version 17 tools on PATH the backup script runs them directly; otherwise (an older laptop) the version 17 tools inside the database container stand in
const native17 = /\b17\./.test(sh('pg_dump', ['--version']).stdout);
if (!native17) gap('R10k', 'pg_dump on this computer is not version 17: the rehearsal used the tools inside the database container. Install postgresql-client-17 (npm run check:pg17 says exactly what is missing)', 'environment');
if (!native17) writeFileSync(join(bin, 'pg_dump'), `#!/usr/bin/env bash
args=(); file=""; while [ $# -gt 0 ]; do case "$1" in -f) file="$2"; shift 2;; postgresql://*) args+=("postgresql://postgres:postgres@localhost:5432/postgres"); shift;; *) args+=("$1"); shift;; esac; done
docker exec -i ${DBC} pg_dump "\${args[@]}" > "$file"\n`);
if (!native17) chmodSync(join(bin, 'pg_dump'), 0o755);
const kg = sh('age-keygen', []); const privKey = kg.stdout; const pub = (kg.stderr.match(/Public key: (age1\S+)/) || privKey.match(/public key: (age1\S+)/) || [])[1];
writeFileSync(join(work, 'key.txt'), privKey);
const bk = sh('bash', [join(root, 'scripts/backup-supabase.sh')], { cwd: work, env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, SUPABASE_DB_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres', AGE_RECIPIENT: pub } });
const enc = readdirSync(work).find((f) => f.startsWith('l2f-backup-') && f.endsWith('.tar.age'));
ok('R10a', 'The backup script writes one encrypted file', bk.status === 0 && !!enc, (bk.stderr || bk.stdout).slice(0, 300));
if (enc) {
  ok('R10b', 'The backup is encrypted (no plain database text in it)', !readFileSync(join(work, enc)).includes('PGDMP') && readFileSync(join(work, enc)).length > 1000);
  const dec = sh('bash', ['-c', `age -d -i key.txt ${enc} | tar -xf - && ls`], { cwd: work });
  ok('R10c', 'Decrypting with the private key gives the two dumps', /app\.dump/.test(dec.stdout) && /auth\.dump/.test(dec.stdout), dec.stderr.slice(0, 200));
  const a2 = await client('postgres'); await a2.query('drop database if exists rehearsal_restore'); await a2.query('create database rehearsal_restore owner postgres template template0'); await a2.end();
  const rs = sh('bash', ['-c', `docker exec -i ${DBC} pg_restore --no-owner -d postgresql://postgres:postgres@localhost:5432/rehearsal_restore < app.dump`], { cwd: work });
  const rc = await client('rehearsal_restore'); const sc = await client('postgres');
  const tables = (await sc.query("select table_schema||'.'||table_name t from information_schema.tables where table_schema in ('public','private') and table_type = 'BASE TABLE' order by 1")).rows.map((x) => x.t);
  const diff = [];
  for (const t of tables) { const n1 = (await sc.query(`select count(*)::int n from ${t}`)).rows[0].n; let n2 = -1; try { n2 = (await rc.query(`select count(*)::int n from ${t}`)).rows[0].n; } catch { /* missing */ } if (n1 !== n2 && !t.endsWith('api_rate_limits') && !t.endsWith('audit_events')) diff.push(`${t}:${n1}/${n2}`); }
  ok('R10d', `The restored copy has the same row count in all ${tables.length} tables of public and private (rate-limit counters and the live audit tail aside)`, diff.length === 0 && tables.length > 50, diff.slice(0, 6).join(' ') + ' ' + rs.stderr.slice(0, 150));
  const pol2 = (await rc.query("select count(*)::int n from pg_policies where schemaname = 'public'")).rows[0].n, pol1 = (await sc.query("select count(*)::int n from pg_policies where schemaname = 'public'")).rows[0].n;
  ok('R10e', 'Row security policies came back with the data (a restore must not open anything up)', pol1 === pol2 && pol1 > 100, `${pol1}/${pol2}`);
  const fn = (await rc.query("select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private') and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')) and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')")).rows[0].n;
  ok('R10f', 'After restoring, the Data API roles still cannot execute our functions', fn === 0, String(fn));
  await rc.end(); await sc.end();
  gap('R10g', 'The database backup covers the database only (public and private schemas and auth users); stored FILES are covered by the separate storage backup (steps R10s to R10z), which needs its own secrets and a destination sized for the files', 'runbook step 10 lists both jobs')
  gap('R10h', 'A backup of the auth schema restores users and identities but the restore of auth.users into a NEW project needs the same auth schema version; test this once on the live project (cannot be rehearsed on the local stack)', 'part of the restore test in step 10');
}

// ---------------------------------------------------------------- step 10b: STORAGE FILES in the backup and the restore (fake S3 stands in for the file storage)
{
  const work2 = mkdtempSync(join(tmpdir(), 'rehearsal-files-'));
  const srcS3 = await startFakeS3({ pageSize: 2 }); const dstS3 = await startFakeS3({ pageSize: 2 }); const bkS3 = await startFakeS3({ bucket: 'backups' });
  const S = createS3Storage({ endpoint: srcS3.endpoint, bucket: srcS3.bucket, accessKeyId: srcS3.accessKeyId, secretAccessKey: srcS3.secretAccessKey });
  const ORG = randomUUID(), CL = randomUUID();
  const sample = { [`${ORG}/shared/${randomUUID()}/brand guide.pdf`]: Buffer.alloc(150000, 3), [`${ORG}/clients/${CL}/${randomUUID()}/logo.png`]: Buffer.from([137, 80, 78, 71, 0, 255]), [`${ORG}/personal/${randomUUID()}/${randomUUID()}/notes.txt`]: Buffer.from('private notes'), [`${ORG}/shared/${randomUUID()}/ünï.txt`.replace(/[^\x00-\x7f]/g, '_')]: Buffer.from('ascii only names are what the app creates') };
  for (const [p, b] of Object.entries(sample)) await S.put(p, b);
  const env = { ...process.env, STORAGE_DRIVER: 's3', S3_ENDPOINT: srcS3.endpoint, S3_BUCKET: srcS3.bucket, S3_ACCESS_KEY_ID: srcS3.accessKeyId, S3_SECRET_ACCESS_KEY: srcS3.secretAccessKey, AGE_RECIPIENT: pub, BACKUP_S3_ENDPOINT: bkS3.endpoint, BACKUP_S3_BUCKET: 'backups', BACKUP_S3_ACCESS_KEY_ID: bkS3.accessKeyId, BACKUP_S3_SECRET_ACCESS_KEY: bkS3.secretAccessKey };
  delete env.SUPABASE_DB_URL;
  const sm = await runAsync('node', [join(root, 'scripts/storage-smoke.mjs')], { env });
  ok('R10s', 'The storage smoke test passes against the configured storage (signed upload, measured size, signed download, listing, delete)', sm.status === 0 && (sm.stdout.match(/^PASS/gm) ?? []).length === 5, sm.stdout + sm.stderr);
  const bf = await runAsync('node', [join(root, 'scripts/backup-storage.mjs')], { cwd: work2, env });
  const arch = readdirSync(work2).find((f) => f.startsWith('l2f-storage-backup-') && f.endsWith('.tar.age'));
  ok('R10t', 'The storage backup script writes one encrypted archive of every stored file', bf.status === 0 && !!arch && /wrote .*: 4 files/.test(bf.stdout), bf.stdout + bf.stderr);
  ok('R10u', 'The archive holds no readable file content or file names (encrypted)', !!arch && !readFileSync(join(work2, arch)).includes('brand guide') && !readFileSync(join(work2, arch)).includes('private notes'));
  ok('R10v', 'The same archive was uploaded to the separate backup bucket (the destination for archives too large for the free artifact store)', [...bkS3.objects.keys()].some((k) => k.startsWith('storage-backups/l2f-storage-backup-')));
  const keyFile = join(work, 'key.txt'); writeFileSync(join(work2, 'key.txt'), privKey);
  const rs2 = await runAsync('node', [join(root, 'scripts/restore-storage.mjs'), join(work2, arch ?? 'none')], { env: { ...process.env, AGE_IDENTITY: join(work2, 'key.txt'), STORAGE_DRIVER: 's3', S3_ENDPOINT: dstS3.endpoint, S3_BUCKET: dstS3.bucket, S3_ACCESS_KEY_ID: dstS3.accessKeyId, S3_SECRET_ACCESS_KEY: dstS3.secretAccessKey } });
  ok('R10w', 'Restoring into a fresh, empty storage brings back every file', rs2.status === 0 && /restored 4 files/.test(rs2.stdout) && dstS3.objects.size === 4, rs2.stdout + rs2.stderr);
  ok('R10x', 'Every restored file is byte for byte the original', Object.entries(sample).every(([p, b]) => dstS3.objects.get(p)?.equals(b)));
  const rs3 = await runAsync('node', [join(root, 'scripts/restore-storage.mjs'), join(work2, arch ?? 'none')], { env: { ...process.env, AGE_IDENTITY: join(work2, 'nokey.txt'), STORAGE_DRIVER: 's3', S3_ENDPOINT: dstS3.endpoint, S3_BUCKET: dstS3.bucket, S3_ACCESS_KEY_ID: dstS3.accessKeyId, S3_SECRET_ACCESS_KEY: dstS3.secretAccessKey } });
  ok('R10y', 'Without the private key the archive cannot be opened', rs3.status !== 0);
  const big = await runAsync('node', [join(root, 'scripts/backup-storage.mjs')], { cwd: work2, env: { ...env, BACKUP_MAX_BYTES: '1000', BACKUP_S3_ENDPOINT: '' } });
  ok('R10z', 'A backup over its budget fails with its own exit code (4) and a pointer to the runbook, not silently', big.status === 4 && /Storage backup/.test(big.stderr), `${big.status} ${big.stderr}`);
  for (const f of [srcS3, dstS3, bkS3]) await f.close(); rmSync(work2, { recursive: true, force: true });
}
await a.query('drop database if exists rehearsal'); await a.query('drop database if exists rehearsal_restore'); await a.end();
rmSync(work, { recursive: true, force: true });
const fails = out.filter((o) => o.k === 'FAIL').length; console.log(`\n${out.filter((o) => o.k === 'PASS').length} passed, ${fails} failed, ${out.filter((o) => o.k === 'GAP').length} gaps`);
process.exit(fails ? 1 : 0);
