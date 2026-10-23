// What one weather request costs a Cloudflare Worker on the FREE plan (10 ms of CPU per request, 50 outside calls, 100,000 requests a day).
// Measured here in Node/V8 (the same engine; workerd adds little CPU of its own), against a realistic MET compact answer (9 days of hourly data, about 150 KB:
// larger than a typical answer, so this is a pessimistic case) and a real ES256 sign-in token check. No network is used and nothing is deployed.
// Prints the mean and the 99th percentile of CPU milliseconds per request and the number of outside calls. Run: node scripts/weather-cost.mjs
import { webcrypto } from 'node:crypto';
import { createWeather } from '../packages/core/weather.mjs';
import { createJwtVerifier } from '../packages/core/jwt.mjs';

const ENTRIES = 240;   // ~10 days of hourly points
const body = JSON.stringify({ type: 'Feature', geometry: { type: 'Point', coordinates: [74.36, 31.52, 217] }, properties: { meta: { updated_at: '2026-10-23T08:00:00Z', units: { air_temperature: 'celsius' } },
  timeseries: Array.from({ length: ENTRIES }, (_, i) => ({ time: `2026-10-23T${String(i % 24).padStart(2, '0')}:00:00Z`, data: { instant: { details: { air_pressure_at_sea_level: 1012.3, air_temperature: 18.4 + (i % 7), cloud_area_fraction: 62.5, relative_humidity: 55.1, wind_from_direction: 211.8, wind_speed: 3.4 } },
    next_1_hours: { summary: { symbol_code: 'partlycloudy_day' }, details: { precipitation_amount: 0 } }, next_6_hours: { summary: { symbol_code: 'cloudy' }, details: { precipitation_amount: 0.2 } }, next_12_hours: { summary: { symbol_code: 'rain' } } } })) } });
let outsideCalls = 0;
const fetcher = async () => { outsideCalls += 1; return new Response(body, { status: 200, headers: { 'content-type': 'application/json', 'last-modified': 'Fri, 23 Oct 2026 08:00:00 GMT', expires: new Date(Date.now() + 1_800_000).toUTCString() } }); };
const wx = createWeather({ userAgent: 'Layer2FunnelsAurjOffice/1.0 layer2funnels@gmail.com', fetcher });

// a real ES256 token and its key set
const kp = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const jwk = { ...(await webcrypto.subtle.exportKey('jwk', kp.publicKey)), kid: 'k1', alg: 'ES256' };
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
const head = b64({ alg: 'ES256', kid: 'k1', typ: 'JWT' }), pay = b64({ sub: '3f0c2f5e-0000-4000-8000-000000000001', email: 'a@b.test', role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 });
const sig = Buffer.from(await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, Buffer.from(`${head}.${pay}`))).toString('base64url');
const token = `${head}.${pay}.${sig}`;
const keys = [{ alg: 'ES256', kid: 'k1', jwk }];
const verify = createJwtVerifier({ getKeys: async () => keys, issuer: null });

const cpuMs = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };
const samples = (n, fn) => { const out = []; return (async () => { for (let i = 0; i < n; i += 1) { const a = cpuMs(); await fn(i); out.push(cpuMs() - a); } return out; })(); };
const stat = (xs) => { const s = [...xs].sort((a, b) => a - b); return { mean: +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2), p99: +s[Math.floor(s.length * 0.99)].toFixed(2), max: +s.at(-1).toFixed(2) }; };
for (let i = 0; i < 50; i += 1) { await verify(token); await wx.get(10 + i * 0.01, 20); }   // warm up the engine, as a real instance would be
const jwtOnly = stat(await samples(300, () => verify(token)));
outsideCalls = 0; const miss = stat(await samples(300, (i) => wx.get(30 + i * 0.01, 70)));   // every call a new place = a cache miss
const missCalls = outsideCalls; outsideCalls = 0;
const hit = stat(await samples(300, () => wx.get(30, 70)));
console.log(JSON.stringify({ note: 'CPU milliseconds per request on this machine (Cloudflare Free allows 10)', payloadKB: Math.round(body.length / 1024), signInCheck: jwtOnly, weatherCacheMiss_parseAndShrink: miss, weatherCacheHit: hit,
  outsideCallsPerMiss: missCalls / 300, outsideCallsPerHit: outsideCalls / 300 }, null, 2));
// optional: the database part of a request, the way the Pages function does it (a new one-connection pool per request: connect, password handshake, the
// transaction as app_user, close). Needs COST_DATABASE_URL (for example the local stack). TLS to the real database is done natively by Cloudflare's runtime.
let dbPart = null;
if (process.env.COST_DATABASE_URL) {
  const pg = (await import('pg')).default; const { createPgExecutor } = await import('../packages/core/pg-executor.mjs');
  const one = async () => { const pool = new pg.Pool({ connectionString: process.env.COST_DATABASE_URL, max: 1 }); const ex = createPgExecutor({ acquire: async () => { const c = await pool.connect(); return { query: (q, p) => c.query(q, p), release: () => c.release() }; } });
    try { await ex.withRequest({ userId: '3f0c2f5e-0000-4000-8000-000000000001', email: 'a@b.test', orgId: '00000000-0000-0000-0000-000000000000' }, async (q) => q('select 1 as one')); } finally { await pool.end(); } };
  for (let i = 0; i < 5; i += 1) await one();
  dbPart = stat(await samples(40, one));
  console.log(JSON.stringify({ databaseConnectAndTransaction: dbPart, note: 'CPU only; time spent waiting for the database is not counted by Cloudflare' }, null, 2));
}
const worst = jwtOnly.p99 + miss.p99 + (dbPart?.p99 ?? 0);
console.log(`worst case a weather request that misses the cache: sign-in check p99 ${jwtOnly.p99} + weather p99 ${miss.p99} = ${worst.toFixed(2)} ms (including the database part when COST_DATABASE_URL is set) of the 10 ms budget`);
process.exit(worst < 10 ? 0 : 1);
