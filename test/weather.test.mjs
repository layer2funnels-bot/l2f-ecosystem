// Launcher weather (V4-7): the MET Norway client against a fake server (terms: identifying User-Agent, coordinates truncated, caching with
// If-Modified-Since, no hammering), the sky conditions, and the staff-only API operation.
import { randomUUID as id } from 'node:crypto';
import { recorder, openDb, migrate } from './lib.mjs';
import { startFakeMet } from './fakes/fake-met.mjs';
import { createWeather, condition, labelFor, ATTRIBUTION, ATTRIBUTION_LINKS } from '../packages/core/weather.mjs';
import { createApi, NO_ORG } from '../packages/core/api.mjs';
import { createPgExecutor } from '../packages/core/pg-executor.mjs';
import { createRateLimiter } from '../packages/core/rate-limit.mjs';
import { createSafeLogger } from '../packages/core/safe-log.mjs';

const { results, check } = recorder();
const met = await startFakeMet();
let t = 1_000_000; const now = () => t;
const UA = 'L2FOfficeTest/1.0 test@example.com';
const wx = createWeather({ userAgent: UA, now, base: met.base, fetcher: (u, o) => fetch(u, o) });
const thrown = async (f) => { try { await f(); return null; } catch (e) { return e.code ?? String(e); } };

// ---- conditions
check('WX1', 'Symbols map to the five sky conditions: clear, cloudy, rain, cold (snow, sleet, freezing), hot (35 degrees and over)',
  condition('clearsky_day', 20) === 'clear' && condition('fair_night', 20) === 'clear' && condition('partlycloudy_day', 20) === 'cloudy' && condition('fog', 10) === 'cloudy' && condition('lightrain', 10) === 'rain' && condition('heavyrainandthunder', 20) === 'rain'
  && condition('lightsnow', -2) === 'cold' && condition('sleet', 1) === 'cold' && condition('clearsky_day', 36) === 'hot' && condition('clearsky_day', -3) === 'cold' && condition('rain', 40) === 'rain');
check('WX2', 'Labels are plain English, including thunder and unknown codes', labelFor('lightrain_day') === 'Light rain' && labelFor('clearsky_night') === 'Clear' && labelFor('heavyrainandthunder') === 'Heavy rain with thunder' && labelFor('mystery') === 'Weather');

// ---- the client
const a = await wx.get(31.5204, 74.3587);       // Lahore
check('WX3', 'A forecast comes back as condition, label, whole degrees and the attribution', a.condition === 'rain' && a.label === 'Light rain' && a.tempC === 16 && a.source === ATTRIBUTION && ATTRIBUTION === 'Data from MET Norway');
const c0 = met.calls[0];
check('WX4', 'The request carries the identifying User-Agent and uses the compact endpoint', c0.headers['user-agent'] === UA && c0.path.endsWith('/compact'));
check('WX5', 'Coordinates are rounded to two decimals before they leave (MET allows at most four)', c0.lat === '31.52' && c0.lon === '74.36');
await wx.get(31.5204, 74.3587); await wx.get(31.52, 74.36); await wx.get(31.5249, 74.3551);
check('WX6', 'Repeated and nearby requests are answered from the 30-minute cache: MET is called once', met.calls.length === 1 && wx.size() === 1);
t += 31 * 60_000; await wx.get(31.5204, 74.3587);
check('WX7', 'After 30 minutes it asks again, with If-Modified-Since, and a 304 keeps the cached answer', met.calls.length === 2 && met.calls[1].headers['if-modified-since'] === met.state.lastModified);
met.state.lastModified = 'Thu, 22 Oct 2026 11:00:00 GMT'; met.state.symbol = 'clearsky_day'; met.state.temp = 38;
t += 31 * 60_000; const hot = await wx.get(31.5204, 74.3587);
check('WX8', 'A changed forecast is picked up (clear and 38 degrees is hot)', hot.condition === 'hot' && hot.tempC === 38);
met.state.fail = 5; t += 31 * 60_000; const stale = await wx.get(31.5204, 74.3587);
check('WX9', 'If MET is down, the last answer is served for up to three hours instead of an error', stale.condition === 'hot');
t += 4 * 3_600_000;
check('WX10', 'Past three hours with MET still down, the client says unavailable (the page falls back to time of day)', (await thrown(() => wx.get(31.5204, 74.3587))) === 'weather_unavailable');
met.state.fail = 0; met.state.status = 503;
check('WX11', 'Bad places are refused before any request: NaN, out of range', (await thrown(() => wx.get(NaN, 1))) === 'bad_place' && (await thrown(() => wx.get(91, 1))) === 'bad_place' && (await thrown(() => wx.get(1, 181))) === 'bad_place');
const before = met.calls.length; await thrown(() => wx.get(95, 0));
check('WX12', 'A refused place never reaches MET', met.calls.length === before);

// ---- MET's Expires time decides when we may ask again (their terms)
const ewx2 = createWeather({ userAgent: UA, now, base: met.base, fetcher: (u, o) => fetch(u, o) }); met.state.status = 200; met.state.fail = 0; met.state.lastModified = 'Fri, 23 Oct 2026 08:00:00 GMT'; met.calls.length = 0;
t = 5_000_000_000; met.state.expires = new Date(t + 10 * 60_000).toUTCString();
await ewx2.get(24.86, 67.01); t += 9 * 60_000; await ewx2.get(24.86, 67.01);
check('WX14', 'With an Expires 10 minutes ahead MET is not asked again before then (not even at 9 minutes)', met.calls.length === 1);
t += 2 * 60_000; met.state.expires = new Date(t + 20 * 60_000).toUTCString(); await ewx2.get(24.86, 67.01);
check('WX15', 'After Expires it asks again with If-Modified-Since, and the 304\'s new Expires extends the freshness', met.calls.length === 2 && met.calls[1].headers['if-modified-since'] === met.state.lastModified && (t += 19 * 60_000, await ewx2.get(24.86, 67.01), met.calls.length === 2));
met.calls.length = 0; ewx2.size(); const ewx3 = createWeather({ userAgent: UA, now, base: met.base, fetcher: (u, o) => fetch(u, o) });
met.state.lastModified = 'Fri, 23 Oct 2026 09:00:00 GMT'; met.state.expires = new Date(t + 5_000).toUTCString(); await ewx3.get(25.0, 67.0); t += 30_000; await ewx3.get(25.0, 67.0);
check('WX16', 'An Expires only seconds away is held to a one-minute minimum (no hammering)', met.calls.length === 1);
met.calls.length = 0; met.state.lastModified = 'Fri, 23 Oct 2026 10:00:00 GMT'; met.state.expires = new Date(t + 10 * 3_600_000).toUTCString(); const ewx4 = createWeather({ userAgent: UA, now, base: met.base, fetcher: (u, o) => fetch(u, o) });
await ewx4.get(26.0, 67.0); t += 2 * 3_600_000 + 60_000; await ewx4.get(26.0, 67.0);
check('WX17', 'An Expires many hours away is capped at two hours so the Launcher never shows a stale sky for a day', met.calls.length === 2);
met.state.expires = 'not a date'; met.calls.length = 0; const ewx5 = createWeather({ userAgent: UA, now, base: met.base, fetcher: (u, o) => fetch(u, o) }); met.state.lastModified = 'Fri, 23 Oct 2026 11:00:00 GMT';
await ewx5.get(27.0, 67.0); t += 29 * 60_000; await ewx5.get(27.0, 67.0); t += 2 * 60_000; await ewx5.get(27.0, 67.0);
check('WX18', 'A missing or unreadable Expires falls back to 30 minutes', met.calls.length === 2);
const ew6 = await ewx5.get(27.0, 67.0);
check('WX19', 'The answer carries the credit, the licence link and the note that the data was changed', ew6.source === 'Data from MET Norway' && ew6.licence === ATTRIBUTION_LINKS.licence && /CC BY 4\.0|creativecommons/.test(ATTRIBUTION_LINKS.licence + ATTRIBUTION_LINKS.licenceName) && /Changed/.test(ew6.changes));
check('WX13', 'The client will not start without an identifying contact in the User-Agent (their terms)', (() => { try { createWeather({ userAgent: 'x' }); return false; } catch { return true; } })() && (() => { try { createWeather({}); return false; } catch { return true; } })());
const bad = createWeather({ userAgent: UA, now, base: met.base, fetcher: async () => new Response(JSON.stringify({ properties: { timeseries: [] } }), { status: 200 }) });
check('WX14', 'An answer in an unexpected shape is "unavailable", not a crash', (await thrown(() => bad.get(1, 1))) === 'weather_unavailable');

// ---- the API operation
const db = await openDb(); await migrate(db);
let chain = Promise.resolve();
const acquire = () => { const prev = chain; let release; chain = new Promise((r) => { release = r; }); return prev.then(() => ({ query: (s, p) => db.query(s, p), release })); };
const BIG = { read: { max: 1e6, windowMs: 6e4 }, write: { max: 1e6, windowMs: 6e4 }, sensitive: { max: 1e6, windowMs: 6e4 } };
met.state.status = 200; met.state.symbol = 'lightrain_day'; met.state.temp = 16.4; met.state.lastModified = 'x';
const wx2 = createWeather({ userAgent: UA, now, base: met.base, fetcher: (u, o) => fetch(u, o) });
const mk = (weather) => createApi({ executor: createPgExecutor({ acquire, role: 'app_user' }), logger: createSafeLogger(() => {}), limiter: createRateLimiter({ limits: BIG }), weather });
const api = mk(wx2), apiOff = mk(null);
await db.exec('reset role');
const L = id(), U = { OWN: id(), VW: id(), CL: id(), OUT: id() }, C1 = id();
await db.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','Layer2Funnels')", [L]);
await db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff','owner'),($1,$3,'staff','viewer')", [L, U.OWN, U.VW]);
await db.query("insert into clients (id,workspace_id,name) values ($1,$2,'Client One')", [C1, L]);
await db.query("insert into memberships (workspace_id,user_id,kind,client_id) values ($1,$2,'client',$3)", [L, U.CL, C1]);
const call = (a_, user, input, org = L) => a_.handle({ operation: 'weather.get', input, auth: { userId: user, email: `${user.slice(0, 8)}@example.com` }, headers: { 'x-org-id': org } });
let r = await call(api, U.OWN, { lat: 31.52, lon: 74.36 });
check('WX15', 'A staff member gets the weather for a place', r.status === 200 && r.body.data[0].label === 'Light rain' && r.body.data[0].source === 'Data from MET Norway');
r = await call(api, U.VW, { lat: 31.52, lon: 74.36 });
check('WX16', 'Every staff level may ask (a viewer too): it is not organization data', r.status === 200);
r = await call(api, U.CL, { lat: 31.52, lon: 74.36 });
check('WX17', 'A client account cannot call it (staff operation): it reads as not found', r.status === 404);
r = await call(api, U.OUT, { lat: 31.52, lon: 74.36 });
check('WX18', 'A person who is in no organization is refused the same way', r.status === 404);
r = await call(api, U.OWN, { lat: 120, lon: 74.36 });
check('WX19', 'An impossible place is refused with a validation error before anything is fetched', r.status === 422 || r.status === 400);
r = await call(api, U.OWN, { lat: 'north', lon: 74.36 });
check('WX20', 'A non-number is refused', r.status === 422 || r.status === 400);
r = await call(apiOff, U.OWN, { lat: 31.52, lon: 74.36 });
check('WX21', 'With weather switched off (WEATHER=off) the answer is "not available", never a crash', r.status === 503 && r.body.error?.code === 'weather_unavailable');
met.state.fail = 9; met.state.status = 503; const wx3 = createWeather({ userAgent: UA, now, base: met.base, fetcher: (u, o) => fetch(u, o) });
r = await call(mk(wx3), U.OWN, { lat: 10.1, lon: 10.1 });
check('WX22', 'When MET is down and nothing is cached, the API answers 503 weather_unavailable', r.status === 503 && r.body.error?.code === 'weather_unavailable');
const logs = []; const apiLog = createApi({ executor: createPgExecutor({ acquire, role: 'app_user' }), logger: createSafeLogger((l) => logs.push(JSON.stringify(l))), limiter: createRateLimiter({ limits: BIG }), weather: wx2 });
await call(apiLog, U.OWN, { lat: 33.3333, lon: 44.4444 });
check('WX23', 'Coordinates never appear in the logs', logs.length > 0 && !logs.join('').includes('33.33') && !logs.join('').includes('44.44'));
await db.close(); await met.close();
for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}`);
const pc = results.filter((x) => x.ok).length; console.log(`\n${pc}/${results.length} checks passed`);
process.exit(pc === results.length ? 0 : 1);
