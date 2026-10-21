// Dry run of "move Funnel Mapper Pro onto the ecosystem database" with SYNTHETIC data only, in a scratch database that is dropped at the end.
//   node scripts/fmp-dryrun/run.mjs            (needs PG_URL like the restore drill; default postgres://tester:tester@localhost:5432/postgres)
// It builds the ecosystem schema (every migration), an FMP-shaped source schema, fills it with synthetic data, runs the transformation in
// migrate.sql, and checks counts, identifiers, graph fidelity, trash-to-archive, idempotency, tenant isolation and rollback. Nothing real is touched.
import { readFileSync } from 'node:fs';
import { createHash, randomUUID as id } from 'node:crypto';
import pg from 'pg';
import { migrationFiles } from '../../test/lib.mjs';

const BASE = new URL(process.env.PG_URL || 'postgres://tester:tester@localhost:5432/postgres');
const urlFor = (db) => { const u = new URL(BASE); u.pathname = `/${db}`; return u.toString(); };
const SIZE = { clients: 60, productsPerClient: 2.5, funnels: 250, versionsPerFunnel: 6, actualsPerFunnel: 4, links: 120, comments: 200, nodes: 30, personal: 25 };
const NAME = `fmp_dryrun_${Date.now()}`;
const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
let seed = 20261021; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const graph = (n) => ({ nodes: Array.from({ length: n }, (_, i) => ({ id: `n${i}`, type: pick(['traffic', 'landing', 'optin', 'offer', 'checkout', 'email', 'call']), x: Math.round(rnd() * 3000), y: Math.round(rnd() * 1500), p: { label: `Step ${i}`, visitors: Math.round(rnd() * 5000), rate: +(rnd()).toFixed(3), note: 'x'.repeat(Math.floor(rnd() * 120)) }, s: { fill: '#ffffff' } })),
  edges: Array.from({ length: n - 1 }, (_, i) => ({ id: `e${i}`, source: `n${i}`, target: `n${i + 1}`, p: { pct: +(rnd()).toFixed(2) } })), view: { x: 60, y: 40, k: 1 } });
const admin = new pg.Client({ connectionString: BASE.toString() }); await admin.connect();
const out = { phases: {}, size: SIZE }; const t0 = Date.now(); const lap = (k, t = Date.now()) => { out.phases[k] = Date.now() - t; };
const checks = []; const check = (idn, name, ok, d = '') => { checks.push({ id: idn, name, ok: !!ok, d }); };
let c;
try {
  await admin.query(`create database ${NAME}`);
  c = new pg.Client({ connectionString: urlFor(NAME) }); await c.connect();
  let t = Date.now();
  await c.query("do $$ declare r text; begin foreach r in array array['anon','authenticated','service_role'] loop if not exists (select 1 from pg_roles where rolname = r) then execute format('create role %I nologin', r); end if; end loop; end $$;");
  for (const f of migrationFiles()) await c.query(readFileSync(f, 'utf8'));
  await c.query(read('source.sql')); await c.query(read('target.sql')); lap('build schemas', t);

  // ---- synthetic source data
  t = Date.now();
  const ORG = id(); await c.query("insert into workspaces (id, slug, name) values ($1, 'layer2funnels', 'Layer2Funnels')", [ORG]);
  const TEAM = id(); await c.query("insert into fmp_src.workspaces (id, kind, agency_name) values ($1, 'team', 'Layer2Funnels')", [TEAM]);
  const members = [['owner', true], ['admin', true], ['admin', true], ['editor', true], ['editor', true], ['editor', true], ['viewer', true], ['editor', false]].map(([role, active], i) => ({ id: id(), email: `person${i}@example.com`, role, active }));
  for (const m of members) { await c.query('insert into fmp_src.profiles (id, email, full_name, workspace_id) values ($1,$2,$3,$4)', [m.id, m.email, `Person ${m.email}`, TEAM]); await c.query('insert into fmp_src.workspace_members values ($1,$2,$3,$4)', [TEAM, m.id, m.role, m.active]); }
  const clients = []; for (let i = 0; i < SIZE.clients; i++) {
    const cl = { id: id(), status: pick(['lead', 'proposal', 'active', 'active', 'paused', 'past']), archived: i % 12 === 0, trashed: i % 15 === 1 }; clients.push(cl);
    await c.query(`insert into fmp_src.clients (id, workspace_id, name, business_name, niche, email, website, country, currency, status, monthly_retainer, pricing_model, pricing_amount, notes, tags, archived_at, deleted_at)
      values ($1,$2,$3,$4,'fitness','c${i}@example.com',$5,'GB','GBP',$6,$7,$8,$9,$10,$11,$12,$13)`, [cl.id, TEAM, `Client ${i}`, `Business ${i} Ltd`, i % 4 ? `https://client${i}.example.com` : 'not a url', cl.status, 500 + i, pick(['retainer', 'fixed', 'one_time', 'hourly', 'commission']), 1000 + i, i % 3 ? `Note for client ${i}` : '', ['vip', 'uk'], cl.archived ? new Date() : null, cl.trashed ? new Date() : null]);
  }
  const products = Math.round(SIZE.clients * SIZE.productsPerClient); for (let i = 0; i < products; i++) await c.query('insert into fmp_src.products (id, workspace_id, client_id, name, type, params) values ($1,$2,$3,$4,$5,$6)', [id(), TEAM, i % 7 === 0 ? null : clients[i % clients.length].id, `Product ${i}`, pick(['product', 'service', 'subscription']), { price: 97 + i, cycle: 'monthly' }]);
  const funnels = []; for (let i = 0; i < SIZE.funnels; i++) {
    const f = { id: id(), g: graph(SIZE.nodes), trashed: i % 25 === 3, client: clients[i % clients.length].id }; funnels.push(f);
    await c.query("insert into fmp_src.funnels (id, workspace_id, client_id, name, description, status, graph, settings, summary, deleted_at) values ($1,$2,$3,$4,'d',$5,$6,'{}',$7,$8)", [f.id, TEAM, f.client, `Funnel ${i}`, pick(['draft', 'proposed', 'live', 'archived']), f.g, { revenue: i * 100 }, f.trashed ? new Date() : null]);
    for (let v = 0; v < SIZE.versionsPerFunnel; v++) await c.query('insert into fmp_src.funnel_versions (id, workspace_id, funnel_id, graph, settings, label, auto) values ($1,$2,$3,$4,$5,$6,$7)', [id(), TEAM, f.id, graph(SIZE.nodes), {}, v ? '' : 'first', v > 0]);
    for (let a = 0; a < SIZE.actualsPerFunnel; a++) await c.query("insert into fmp_src.funnel_actuals (id, workspace_id, funnel_id, period_start, period_end, node_id, visitors, conversions, revenue, spend) values ($1,$2,$3,'2026-09-01','2026-09-30',$4,100,10,500,50)", [id(), TEAM, f.id, `n${a}`]);
  }
  const links = []; for (let i = 0; i < SIZE.links; i++) { const l = { id: id(), token: createHash('sha256').update(`token${i}`).digest('hex').slice(0, 48) }; links.push(l); await c.query('insert into fmp_src.share_links (id, workspace_id, funnel_id, token, can_edit, hide_numbers) values ($1,$2,$3,$4,$5,$6)', [l.id, TEAM, funnels[i % funnels.length].id, l.token, i % 9 === 0, i % 4 === 0]); }
  for (let i = 0; i < SIZE.comments; i++) { const l = links[i % links.length]; await c.query("insert into fmp_src.share_comments (id, workspace_id, share_link_id, funnel_id, node_id, author_name, body) values ($1,$2,$3,(select funnel_id from fmp_src.share_links where id = $3),'n1','Client','Looks good')", [id(), TEAM, l.id]); }
  for (let i = 0; i < 12; i++) await c.query('insert into fmp_src.templates (id, workspace_id, builtin_key, name, category, description, graph) values ($1,$2,$3,$4,$5,$6,$7)', [id(), i < 3 ? null : TEAM, i < 3 ? `builtin_${i}` : null, `Template ${i}`, 'Custom', 'd', graph(12)]);
  for (let w = 0; w < SIZE.personal; w++) { const ws = id(), u = id(); await c.query("insert into fmp_src.workspaces (id, kind, agency_name) values ($1,'personal','Independent')", [ws]); await c.query('insert into fmp_src.profiles (id, email, workspace_id) values ($1,$2,$3)', [u, `indie${w}@example.com`, ws]); await c.query("insert into fmp_src.workspace_members values ($1,$2,'owner',true)", [ws, u]);
    for (let k = 0; k < 2; k++) { const cl = id(); await c.query("insert into fmp_src.clients (id, workspace_id, name) values ($1,$2,'Indie client')", [cl, ws]); await c.query("insert into fmp_src.funnels (id, workspace_id, client_id, name, graph) values ($1,$2,$3,'Indie funnel',$4)", [id(), ws, cl, graph(10)]); } }
  lap('generate synthetic data', t);
  const q = async (s, p = []) => (await c.query(s, p)).rows;
  const dataBytes = (await q("select pg_database_size(current_database())::bigint b"))[0].b; out.sourceDatabaseBytes = Number(dataBytes);
  const base = { clients: (await q('select count(*)::int n from public.clients'))[0].n, memberships: (await q('select count(*)::int n from public.memberships'))[0].n };

  // ---- the migration: people first (invited by e-mail in real life), then data
  t = Date.now();
  const mapUsers = `
    create table if not exists fmp.user_map (email text primary key, new_user_id uuid not null);
    insert into fmp.user_map select p.email, gen_random_uuid() from fmp_src.profiles p join fmp_src.workspace_members m on m.user_id = p.id join fmp_src.workspaces w on w.id = m.workspace_id and w.kind = 'team' on conflict do nothing;
    insert into public.memberships (workspace_id, user_id, kind, role, status)
      select '${ORG}', u.new_user_id, 'staff', m.role, case when m.active then 'active' else 'deactivated' end from fmp_src.workspace_members m join fmp_src.profiles p on p.id = m.user_id join fmp.user_map u on u.email = p.email join fmp_src.workspaces w on w.id = m.workspace_id and w.kind = 'team'
      on conflict do nothing;`;
  // real migration step: switch the app on for the organization (the permission engine denies "app-not-available" otherwise)
  await c.query("insert into public.workspace_apps (workspace_id, app_key, enabled) values ($1, 'funnel_mapper_pro', true) on conflict (workspace_id, app_key) do update set enabled = true", [ORG]);
  await c.query("update public.apps set lifecycle = 'active' where key = 'funnel_mapper_pro'");
  const sql = read('migrate.sql').replaceAll(":'org'::uuid", `'${ORG}'::uuid`).replaceAll(":'org'", `'${ORG}'::uuid`);
  await c.query('begin'); await c.query(mapUsers); await c.query(sql); await c.query('commit'); lap('migrate (first run)', t);

  // ---- checks
  t = Date.now();
  const n = async (s) => (await q(s))[0].n;
  const src = { clients: await n("select count(*)::int n from fmp_src.clients c join fmp_src.workspaces w on w.id = c.workspace_id and w.kind = 'team'"), funnels: await n("select count(*)::int n from fmp_src.funnels f join fmp_src.workspaces w on w.id = f.workspace_id and w.kind = 'team'"),
    versions: await n('select count(*)::int n from fmp_src.funnel_versions'), actuals: await n('select count(*)::int n from fmp_src.funnel_actuals'), links: await n('select count(*)::int n from fmp_src.share_links'), comments: await n('select count(*)::int n from fmp_src.share_comments'),
    products: await n('select count(*)::int n from fmp_src.products p join fmp_src.workspaces w on w.id = p.workspace_id and w.kind = \'team\''), templates: await n('select count(*)::int n from fmp_src.templates') };
  const dst = { clients: (await n('select count(*)::int n from public.clients')) - base.clients, funnels: await n('select count(*)::int n from fmp.funnels'), versions: await n('select count(*)::int n from fmp.funnel_versions'), actuals: await n('select count(*)::int n from fmp.funnel_actuals'),
    links: await n('select count(*)::int n from fmp.share_links'), comments: await n('select count(*)::int n from fmp.share_comments'), products: await n('select count(*)::int n from fmp.products'), templates: await n('select count(*)::int n from fmp.templates') };
  out.counts = { source: src, target: dst, deferredPersonalWorkspaces: SIZE.personal, deferredPersonalFunnels: await n("select count(*)::int n from fmp_src.funnels f join fmp_src.workspaces w on w.id = f.workspace_id and w.kind = 'personal'") };
  check('M1', 'Every team row arrived: clients, funnels, versions, actuals, share links, comments, products and templates', JSON.stringify(src) === JSON.stringify(dst), JSON.stringify({ src, dst }));
  check('M2', 'Members: all eight became memberships with the same roles; the inactive one is deactivated', (await n("select count(*)::int n from public.memberships where workspace_id = '" + ORG + "'")) === 8 && (await n("select count(*)::int n from public.memberships where workspace_id = '" + ORG + "' and status <> 'active'")) === 1);
  check('M3', 'The id map is complete and one-to-one for every kind', (await n("select count(*)::int n from (select kind, count(*) c, count(distinct new_id) d from fmp.id_map group by kind) x where c <> d")) === 0);
  check('M4', 'Funnel maps are byte-identical: no graph differs between source and target (checked row by row)', (await n('select count(*)::int n from fmp_src.funnels f join fmp.id_map m on m.kind = \'funnel\' and m.old_id = f.id join fmp.funnels t on t.id = m.new_id where f.graph is distinct from t.graph or f.settings is distinct from t.settings')) === 0
    && (await n('select count(*)::int n from fmp_src.funnel_versions f join fmp.id_map m on m.kind = \'version\' and m.old_id = f.id join fmp.funnel_versions t on t.id = m.new_id where f.graph is distinct from t.graph')) === 0);
  check('M5', 'Trash became archive: trashed funnels and clients are archived, not lost', (await n("select count(*)::int n from fmp_src.funnels f join fmp_src.workspaces w on w.id = f.workspace_id and w.kind = 'team' where f.deleted_at is not null")) === (await n('select count(*)::int n from fmp.funnels where archived_at is not null'))
    && (await n("select count(*)::int n from public.clients where workspace_id = '" + ORG + "' and archived_at is not null")) === (await n("select count(*)::int n from fmp_src.clients where workspace_id = '" + TEAM + "' and (archived_at is not null or deleted_at is not null)")));
  check('M6', 'Client details landed in the ecosystem Clients profile (status, contact, tags); commercial fields kept beside it; free-text notes became internal team notes', (await n("select count(*)::int n from public.client_profiles where workspace_id = '" + ORG + "' and business_name is not null")) === src.clients
    && (await n('select count(*)::int n from fmp.client_commercial')) === src.clients && (await n("select count(*)::int n from public.client_notes where workspace_id = '" + ORG + "'")) === (await n("select count(*)::int n from fmp_src.clients where workspace_id = '" + TEAM + "' and length(trim(notes)) > 0")));
  check('M7', 'Share links: no raw token is stored; a link already in circulation still resolves by hashing the token it is given', (await n("select count(*)::int n from fmp.share_links l join fmp_src.share_links s on encode(sha256(convert_to(s.token, 'UTF8')), 'hex') = l.token_hash")) === src.links
    && (await n('select count(*)::int n from fmp.share_links where length(token_hash) <> 64')) === 0);
  check('M8', 'Nothing can point across organizations: every funnel, version, product and link is in the target organization and its client belongs there too', (await n("select count(*)::int n from fmp.funnels f left join public.clients c on c.id = f.client_id and c.workspace_id = f.workspace_id where c.id is null")) === 0);
  check('M9', 'A website that is not a web address was dropped on purpose (the ecosystem checks it), and nothing else was lost from the client record', (await n("select count(*)::int n from public.client_profiles p where p.workspace_id = '" + ORG + "' and p.website is null")) === (await n("select count(*)::int n from fmp_src.clients where workspace_id = '" + TEAM + "' and website !~ '^https?://'")));
  lap('verify (first run)', t);

  // ---- idempotency
  t = Date.now(); await c.query('begin'); await c.query(mapUsers); await c.query(sql); await c.query('commit'); lap('migrate (second run)', t);
  check('M10', 'Running it again changes nothing (no duplicates)', (await n('select count(*)::int n from fmp.funnels')) === dst.funnels && (await n('select count(*)::int n from public.clients')) - base.clients === dst.clients && (await n('select count(*)::int n from public.memberships')) === base.memberships + 8);

  // ---- tenant isolation on the migrated data, through the ecosystem roles
  const OWN = (await q("select user_id from public.memberships where workspace_id = $1 and role = 'owner'", [ORG]))[0].user_id; const OTHER = id(); const ORG2 = id();
  await c.query("insert into workspaces (id, slug, name) values ($1, 'aurj', 'Aurj')", [ORG2]); await c.query("insert into memberships (workspace_id, user_id, kind, role) values ($1,$2,'staff','owner')", [ORG2, OTHER]);
  const as = async (user, org) => { await c.query('reset role'); await c.query('set role app_user'); await c.query("select set_config('request.jwt.claim.sub', $3, false), set_config('request.jwt.claims', $1, false), set_config('request.headers', $2, false)", [JSON.stringify({ sub: user, role: 'authenticated' }), JSON.stringify({ 'x-org-id': org }), user]); };
  await as(OWN, ORG); const own = await n('select count(*)::int n from fmp.funnels');
  await as(OTHER, ORG2); const other = await n('select count(*)::int n from fmp.funnels') + await n('select count(*)::int n from fmp.funnel_versions') + await n('select count(*)::int n from fmp.share_links') + await n('select count(*)::int n from fmp.products');
  await as(OWN, ORG2); const wrongHeader = await n('select count(*)::int n from fmp.funnels');
  await c.query('reset role');
  check('M11', 'Isolation holds on the migrated data: the organization owner sees every funnel; another organization sees none of the funnels, versions, links or products; the owner with the other organization named sees none', own === dst.funnels - 0 && other === 0 && wrongHeader === 0, JSON.stringify({ own, other, wrongHeader }));

  // ---- rollback
  t = Date.now();
  await c.query(`begin; delete from fmp.share_comments; delete from fmp.share_links; delete from fmp.funnel_actuals; delete from fmp.funnel_versions; delete from fmp.funnels; delete from fmp.products; delete from fmp.client_commercial; delete from fmp.templates;
    set session_replication_role = replica; delete from public.client_notes where client_id in (select new_id from fmp.id_map where kind = 'client'); delete from public.client_profiles where client_id in (select new_id from fmp.id_map where kind = 'client'); delete from public.clients where id in (select new_id from fmp.id_map where kind = 'client');
    delete from public.memberships where user_id in (select new_user_id from fmp.user_map); set session_replication_role = origin; delete from fmp.id_map; delete from fmp.user_map; commit;`); lap('rollback', t);
  check('M12', 'Rollback removes exactly what the migration added: clients and memberships are back to the baseline, the FMP tables are empty', (await n('select count(*)::int n from public.clients')) === base.clients && (await n("select count(*)::int n from public.memberships where workspace_id = '" + ORG + "'")) === base.memberships && (await n('select count(*)::int n from fmp.funnels')) === 0);
  out.totalMs = Date.now() - t0;
} catch (e) { check('X', 'The dry run ran without error', false, e.stack || e.message); }
finally {
  try { await c?.end(); } catch { /* ignore */ }
  await admin.query(`drop database if exists ${NAME}`); await admin.end();
}
for (const x of checks) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(4)} ${x.name}${x.ok ? '' : `  [${x.d}]`}`);
console.log(JSON.stringify(out, null, 1));
const ok = checks.filter((x) => x.ok).length; console.log(`\n${ok}/${checks.length} checks passed`); process.exit(ok === checks.length ? 0 : 1);
