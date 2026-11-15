// Performance measurement (owner brief Part 1): loads the sign-in page and, signed in, the Launcher → Office → Tasks, with a realistic connection
// (Chrome DevTools throttling: 150 ms round trip, 10 Mbit/s down) and an empty cache, then again with a warm cache (a returning visitor).
// Reports requests, transferred bytes and timings. Run against the source (default) or the built site (WEB_ROOT=dist/web).
//   node scripts/perf-measure.mjs            node scripts/perf-measure.mjs --json
import { createRequire } from 'node:module';
import pg from 'pg';
import { startDevServer, LOCAL_ENV } from './dev-server.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright');
const admin = new pg.Client({ connectionString: 'postgresql://supabase_admin:postgres@127.0.0.1:54332/postgres' }); await admin.connect();
const q = async (sql, a = []) => (await admin.query(sql, a)).rows;
const s = await startDevServer({ port: 0, sink: () => {}, env: { ...LOCAL_ENV, ...process.env }, limits: { read: { max: 5000, windowMs: 60_000 }, write: { max: 500, windowMs: 60_000 }, sensitive: { max: 200, windowMs: 60_000 } } });
const base = `http://127.0.0.1:${s.port}`;
const browser = await chromium.launch();
const L = (await q("select id from workspaces where slug = 'layer2funnels'"))[0].id;
const email = `perf.${Date.now()}@example.com`; const PW = 'correct-horse-battery-staple';
{ const c = await browser.newContext(); const p = await c.newPage(); await p.goto(`${base}/#/signup`); await p.fill('#nm', 'Perf Person'); await p.fill('#em', email); await p.fill('#pw', PW); await p.click('button[type=submit]'); await p.waitForTimeout(1200); await c.close(); }
const uid = (await q('select id from auth.users where email = $1', [email]))[0].id;
await q("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff','owner') on conflict do nothing", [L, uid]); await q('update profiles set active_workspace_id = $1 where id = $2', [L, uid]);

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page); await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (10 * 1024 * 1024) / 8, uploadThroughput: (5 * 1024 * 1024) / 8 });
let reqs = []; page.on('requestfinished', async (r) => { const z = await r.sizes().catch(() => ({})); reqs.push({ url: r.url(), type: r.resourceType(), bytes: (z.responseBodySize ?? 0) + (z.responseHeadersSize ?? 0), api: r.url().includes('/api/') }); });
const measure = async (label, go, ready) => {
  reqs = []; const t0 = Date.now(); await go(); await page.waitForSelector(ready, { timeout: 60000 }); const tReady = Date.now() - t0;
  await page.waitForLoadState('networkidle').catch(() => {}); const tIdle = Date.now() - t0;
  const by = (f) => reqs.filter(f); const kb = (xs) => Math.round(xs.reduce((n, x) => n + x.bytes, 0) / 1024);
  return { label, ready_ms: tReady, idle_ms: tIdle, requests: reqs.length, scripts: by((x) => x.type === 'script').length, styles: by((x) => x.type === 'stylesheet').length, api_calls: by((x) => x.api).length, kb: kb(reqs) };
};
const out = [];
out.push(await measure('Sign-in page, first visit (empty cache)', () => page.goto(`${base}/#/signin`), '#em'));
out.push(await measure('Sign-in page, returning visitor (warm cache)', () => page.reload(), '#em'));
await page.fill('#em', email); await page.fill('#pw', PW);
out.push(await measure('Sign in → Launcher', () => page.click('button[type=submit]'), '.shelf .tile'));
out.push(await measure('Launcher → Office Home (in-app)', () => page.evaluate(() => { location.hash = '#/office'; }), 'main h1'));
out.push(await measure('Office → Customer Avatars (in-app)', () => page.evaluate(() => { location.hash = '#/office/funnels/avatars'; }), '.avgrid'));
out.push(await measure('Avatars → Tasks Today (opens a new app)', () => page.evaluate(() => { location.hash = '#/tasks/today'; }), '#tcapi'));
out.push(await measure('Reload Tasks (warm cache)', () => page.reload(), '#tcapi'));
if (process.argv.includes('--json')) console.log(JSON.stringify({ root: process.env.WEB_ROOT || 'apps/web', results: out }, null, 1));
else { console.log(`site: ${process.env.WEB_ROOT || 'apps/web (source)'} · 150 ms round trip, 10 Mbit/s`); for (const r of out) console.log(`${r.label.padEnd(46)} ready ${String(r.ready_ms).padStart(5)} ms · idle ${String(r.idle_ms).padStart(5)} ms · ${String(r.requests).padStart(3)} requests (${r.scripts} js, ${r.styles} css, ${r.api_calls} api) · ${r.kb} KB`); }
await q("update memberships set status = 'deactivated' where user_id = $1", [uid]);
await browser.close(); await s.close(); await admin.end();
