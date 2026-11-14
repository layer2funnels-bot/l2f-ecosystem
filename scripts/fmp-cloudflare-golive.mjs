#!/usr/bin/env node
// Funnel Mapper on Cloudflare (owner approval 13-14 Nov 2026): office.tabishriaz.com/fmp. Safe to run more than once.
//   node scripts/fmp-cloudflare-golive.mjs check     what the token may do; whether main has the Funnel Mapper code; what exists already
//   node scripts/fmp-cloudflare-golive.mjs deploy    publish the Funnel Mapper Worker from main (refuses an outdated checkout)
//   node scripts/fmp-cloudflare-golive.mjs cors      add office.tabishriaz.com to the R2 bucket's upload rules (existing rules are kept)
//   node scripts/fmp-cloudflare-golive.mjs verify    live checks of /fmp (no sign-in needed)
// The token comes from CLOUDFLARE_API_TOKEN, or from this environment's network secret for api.cloudflare.com (the proxy adds it; the
// script then sends a placeholder). It is never printed or written anywhere. Nothing is deleted; no other Worker, project or rule changes.
// Minimum token permissions: Account > Workers Scripts > Edit (publish), Account > Workers R2 Storage > Edit (CORS rules).
// Not needed: Pages, DNS, zone or routes (the site reaches the Worker through the FMP service binding in wrangler.toml, from git).
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || 'd5ec27e33b46a9e645eb4d4d3b23cde6';   // the account in the Pages project's dashboard links
const BUCKET = 'l2f-ecosystem-files';
const WORKER = 'funnel-mapper';
const SITE = 'https://office.tabishriaz.com';
const root = fileURLToPath(new URL('..', import.meta.url));
const token = process.env.CLOUDFLARE_API_TOKEN || 'proxy-injected-placeholder';
const api = async (method, path, body) => {
  const r = await fetch(`https://api.cloudflare.com/client/v4${path}`, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok && j.success !== false, result: j.result, errors: (j.errors ?? []).map((e) => `${e.code} ${e.message}`) };
};
const say = (ok, msg) => console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();

async function check() {
  const v = await api('GET', '/user/tokens/verify');
  say(v.ok && v.result?.status === 'active', `token is ${v.result?.status ?? `not usable (${v.status} ${v.errors.join('; ')})`}`);
  if (!v.ok) return false;
  const w = await api('GET', `/accounts/${ACCOUNT}/workers/scripts`);
  say(w.ok, w.ok ? `Workers: can read (${w.result.length} scripts; ${w.result.some((s) => s.id === WORKER) ? `${WORKER} exists` : `${WORKER} not yet`})` : `Workers: missing "Account > Workers Scripts > Edit" (${w.errors.join('; ')})`);
  const c = await api('GET', `/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/cors`);
  const noRules = c.status === 404 && c.errors.some((e) => /10059|no cors/i.test(e));
  say(c.ok || noRules, c.ok || noRules ? `R2 ${BUCKET}: can read upload rules (${c.result?.rules?.length ?? 0} rules)` : `R2: missing "Account > Workers R2 Storage > Edit" (${c.errors.join('; ')})`);
  git('fetch', '-q', 'origin', 'main');
  const fresh = git('rev-parse', 'HEAD') === git('rev-parse', 'origin/main');
  say(fresh, fresh ? `checkout is origin/main (${git('rev-parse', '--short', 'HEAD')})` : 'checkout is not origin/main: run `git checkout main && git pull` before deploying');
  return w.ok && (c.ok || noRules) && fresh;
}

async function deploy() {
  if (!(await check())) { console.error('Not deploying: fix the FAIL lines above first.'); process.exit(1); }
  execFileSync('npm', ['ci'], { cwd: `${root}/apps/funnel-mapper`, stdio: 'inherit' });
  execFileSync('npm', ['run', 'cf:deploy'], { cwd: `${root}/apps/funnel-mapper`, stdio: 'inherit', env: { ...process.env, CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: ACCOUNT } });
  const w = await api('GET', `/accounts/${ACCOUNT}/workers/scripts`);
  say(w.ok && w.result.some((s) => s.id === WORKER), `${WORKER} is published`);
}

async function cors() {
  const c = await api('GET', `/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/cors`);
  const rules = c.ok ? (c.result?.rules ?? []) : [];
  if (!c.ok && c.status !== 404) { say(false, `cannot read the upload rules: ${c.errors.join('; ')}`); process.exit(1); }
  const covers = rules.some((r) => (r.allowed?.origins ?? []).includes(SITE) && ['GET', 'PUT', 'HEAD'].every((m) => (r.allowed?.methods ?? []).includes(m))
    && (r.allowed?.headers ?? []).some((h) => h === '*' || h.toLowerCase() === 'content-type'));
  if (covers) return say(true, `${BUCKET} already allows uploads from ${SITE}`);
  const next = [...rules, { allowed: { origins: [SITE], methods: ['GET', 'PUT', 'HEAD'], headers: ['content-type'] }, maxAgeSeconds: 3600 }];
  const p = await api('PUT', `/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/cors`, { rules: next });
  say(p.ok, p.ok ? `${BUCKET}: uploads from ${SITE} allowed (kept ${rules.length} existing rule(s))` : `could not save the upload rules: ${p.errors.join('; ')}`);
}

async function verify() {
  const get = (u) => fetch(u, { redirect: 'manual' });
  const a = await get(`${SITE}/fmp/clients`);
  const loc = a.headers.get('location') ?? '';
  say(a.status === 307 && loc.startsWith(`${SITE}/#/signin?return=`), `signed out, /fmp/clients → ecosystem sign-in (${a.status} ${loc.slice(0, 80)})`);
  const s = await get(`${SITE}/fmp/s/${'0'.repeat(48)}`);
  say(s.status < 500 && s.status !== 503, `share-link page answers (${s.status}); a made-up link opens nothing`);
  const r = await get(`${SITE}/fmp/robots.txt`);
  say(r.status === 200, `Funnel Mapper answers under /fmp (${r.status})`);
  const h = await get(`${SITE}/api/health`);
  say(h.status === 200, `the rest of the site is unaffected (/api/health ${h.status})`);
}

const cmd = process.argv[2];
const run = { check, deploy, cors, verify }[cmd];
if (!run) { console.error('usage: node scripts/fmp-cloudflare-golive.mjs check|deploy|cors|verify'); process.exit(2); }
await run();
