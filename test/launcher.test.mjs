// Launcher logic (Design v4 section 8 and 1): time of day, greetings, weather chip and opt-out, location handling, grouping and search.
import { recorder } from './lib.mjs';
import { partOfDay, greeting, chipText, weatherOff, setWeatherOff, getLocation, loadWeather, groupCatalog, findApps, WEATHER_KEY } from '../apps/web/js/sky.js';
import { loadManifests } from '../packages/core/manifests.mjs';

const { results, check } = recorder();
const memStore = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }; };

check('LA1', 'Time of day: morning 5-12, afternoon 12-17, evening 17-21, night 21-5, with the boundaries exact',
  [[4.9, 'night'], [5, 'morning'], [11, 'morning'], [12, 'afternoon'], [16, 'afternoon'], [17, 'evening'], [20, 'evening'], [21, 'night'], [0, 'night'], [24, 'night'], [-1, 'night']].every(([h, p]) => partOfDay(h) === p));
check('LA2', 'Greetings follow the time of day and use the first name; at night it says "Working late"', greeting('morning', 'Una Owner') === 'Good morning, Una' && greeting('evening', null) === 'Good evening' && greeting('night', 'Una Owner') === 'Working late, Una?' && greeting('night') === 'Working late?');
check('LA3', 'The chip reads "Light rain · 16° · your location" and never names a place', chipText({ label: 'Light rain', tempC: 16 }) === 'Light rain · 16° · your location');
const st = memStore();
check('LA4', 'Weather is on by default, off once switched off, on again when switched back', !weatherOff(st) && (setWeatherOff(st, true), weatherOff(st)) && st._m.get(WEATHER_KEY) === 'off' && (setWeatherOff(st, false), !weatherOff(st)));
const blocked = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
check('LA5', 'A blocked browser store never breaks the Launcher', weatherOff(blocked) === false && (setWeatherOff(blocked, true), true));
const geoOk = { getCurrentPosition: (ok) => ok({ coords: { latitude: 31.5204, longitude: 74.3587 } }) };
const geoDenied = { getCurrentPosition: (_ok, err) => err({ code: 1 }) };
const geoThrows = { getCurrentPosition: () => { throw new Error('insecure origin'); } };
const geoSlow = { getCurrentPosition: () => {} };
check('LA6', 'Location: allowed gives coordinates; denied, missing, throwing or slow gives null (time of day only)',
  (await getLocation({ geo: geoOk }))?.lat === 31.5204 && (await getLocation({ geo: geoDenied })) === null && (await getLocation({ geo: null })) === null && (await getLocation({ geo: geoThrows })) === null && (await getLocation({ geo: geoSlow, timeoutMs: 20 })) === null);
let calls = []; const api = { call: async (op, input) => { calls.push([op, input]); return { ok: true, data: [{ condition: 'rain', label: 'Light rain', tempC: 16, source: 'Data from MET Norway' }] }; } };
const session = memStore(); let clock = 1_000_000;
const w1 = await loadWeather({ api, store: memStore(), geo: geoOk, session, now: () => clock });
check('LA7', 'The page asks our server with the place rounded to two decimals', w1.label === 'Light rain' && calls.length === 1 && calls[0][0] === 'weather.get' && calls[0][1].lat === 31.52 && calls[0][1].lon === 74.36);
await loadWeather({ api, store: memStore(), geo: geoOk, session, now: () => clock + 60_000 });
check('LA8', 'A second Launcher visit within 30 minutes reuses the answer (no new call, no new location request)', calls.length === 1);
await loadWeather({ api, store: memStore(), geo: geoOk, session, now: () => clock + 31 * 60_000 });
check('LA9', 'After 30 minutes it asks again', calls.length === 2);
calls = []; const off = memStore(); setWeatherOff(off, true);
check('LA10', 'Switched off: no location request and no server call at all', (await loadWeather({ api, store: off, geo: { getCurrentPosition: () => { throw new Error('must not ask'); } }, session: memStore() })) === null && calls.length === 0);
check('LA11', 'Location denied: no server call and no weather', (await loadWeather({ api, store: memStore(), geo: geoDenied, session: memStore() })) === null && calls.length === 0);
const apiDown = { call: async () => ({ ok: false, status: 503 }) };
check('LA12', 'Server says unavailable (or throws away its answer): the sky shows time of day only', (await loadWeather({ api: apiDown, store: memStore(), geo: geoOk, session: memStore() })) === null && (await loadWeather({ api: { call: async () => ({ ok: true, data: [] }) }, store: memStore(), geo: geoOk, session: memStore() })) === null);

const manifests = new Map(loadManifests().map((m) => [m.id, m]));
const catalog = ['office', 'projects', 'clients', 'portal', 'drive', 'planner', 'forms', 'value_ladder', 'social_planner', 'whiteboard', 'layer2_agents', 'funnel_mapper_pro'].map((k) => ({ app_key: k, name: manifests.get(k).name }));
const groups = groupCatalog(catalog, manifests);
check('LA13', 'Apps are grouped Everyday then Studio, in the designed order inside each group', groups.map((g) => g[0]).join() === 'Everyday,Studio' && groups[0][1].map((a) => a.app_key).join() === 'office,projects,clients,drive,planner,portal' && groups[1][1].map((a) => a.app_key).join() === 'forms,value_ladder,social_planner,whiteboard,funnel_mapper_pro,layer2_agents');
check('LA14', 'An app with no manifest still shows (in Studio) rather than vanishing', groupCatalog([{ app_key: 'mystery', name: 'Mystery' }], manifests)[0][0] === 'Studio');
const desc = (a) => ({ forms: 'Build forms and read the answers.' }[a.app_key] ?? '');
check('LA15', 'Find an app: by name, by description, ignoring case; empty search shows all; no match shows none', findApps(catalog, 'FORM', desc)[0].app_key === 'forms' && findApps(catalog, 'answers', desc)[0].app_key === 'forms' && findApps(catalog, '  ', desc).length === 12 && findApps(catalog, 'zzz', desc).length === 0 && findApps(catalog, 'cl', desc).some((a) => a.app_key === 'clients'));
for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}`);
const pc = results.filter((x) => x.ok).length; console.log(`\n${pc}/${results.length} checks passed`);
process.exit(pc === results.length ? 0 : 1);
