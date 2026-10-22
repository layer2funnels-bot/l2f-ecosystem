// Launcher sky (Design v4 section 8): time of day from the person's own clock, weather from our server (MET Norway, cached), opt-out kept
// on this device. Everything here is plain logic so it is tested without a browser; the Launcher only draws it.
export const WEATHER_KEY = 'l2f.weather';       // 'off' = the person switched weather off on this device
export const PARTS = ['morning', 'afternoon', 'evening', 'night'];
export const CONDITIONS = ['clear', 'cloudy', 'rain', 'hot', 'cold'];

/** morning 5-12, afternoon 12-17, evening 17-21, night 21-5 (local clock). */
export function partOfDay(hour) {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  return h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 17 ? 'afternoon' : h >= 17 && h < 21 ? 'evening' : 'night';
}
export function greeting(part, name) {
  const who = name ? `, ${String(name).trim().split(/\s+/)[0]}` : '';
  return ({ morning: `Good morning${who}`, afternoon: `Good afternoon${who}`, evening: `Good evening${who}`, night: name ? `Working late, ${String(name).trim().split(/\s+/)[0]}?` : 'Working late?' })[part] ?? 'Welcome';
}
/** "Light rain · 16° · your location" (the place is never named: we do not look it up). */
export const chipText = (w) => `${w.label} · ${w.tempC}° · your location`;
export function weatherOff(store) { try { return store.getItem(WEATHER_KEY) === 'off'; } catch { return false; } }
export function setWeatherOff(store, off) { try { off ? store.setItem(WEATHER_KEY, 'off') : store.removeItem(WEATHER_KEY); } catch { /* private mode: applies to this page only */ } }

/** Browser location with the person's permission; resolves to null when denied, missing, or slow. Never throws. */
export function getLocation({ geo = (typeof navigator !== 'undefined' ? navigator.geolocation : null), timeoutMs = 6000 } = {}) {
  return new Promise((resolve) => {
    if (!geo) return resolve(null);
    let done = false; const end = (v) => { if (!done) { done = true; resolve(v); } };
    const timer = setTimeout(() => end(null), timeoutMs + 500);
    try { geo.getCurrentPosition((p) => { clearTimeout(timer); end({ lat: p.coords.latitude, lon: p.coords.longitude }); }, () => { clearTimeout(timer); end(null); }, { timeout: timeoutMs, maximumAge: 30 * 60_000 }); }
    catch { clearTimeout(timer); end(null); }
  });
}
/** The weather for the sky, or null (opted out, denied, offline, server says unavailable): the sky then shows time of day only. */
export async function loadWeather({ api, store, geo, session = (typeof sessionStorage !== 'undefined' ? sessionStorage : null), now = Date.now }) {
  if (weatherOff(store)) return null;
  try { const c = JSON.parse(session?.getItem('l2f.wx') ?? 'null'); if (c && now() - c.at < 30 * 60_000) return c.w; } catch { /* no cache */ }
  const where = await getLocation({ geo }); if (!where) return null;
  const r = await api.call('weather.get', { lat: Math.round(where.lat * 100) / 100, lon: Math.round(where.lon * 100) / 100 });
  if (!r?.ok || !r.data?.[0]) return null;
  try { session?.setItem('l2f.wx', JSON.stringify({ at: now(), w: r.data[0] })); } catch { /* not cached */ }
  return r.data[0];
}
/** Launcher groups from the app manifests: Everyday then Studio, in the designed order of the catalog. */
export function groupCatalog(catalog, registry) {
  const groups = { Everyday: [], Studio: [] };
  for (const a of catalog) (groups[registry?.get(a.app_key)?.group] ?? groups.Studio).push(a);
  const pos = (a) => registry?.get(a.app_key)?.order ?? 99;
  return Object.entries(groups).map(([k, v]) => [k, [...v].sort((x, y) => pos(x) - pos(y))]).filter(([, v]) => v.length);
}
/** Find an app: name or description, case and accent tolerant; Enter opens the first. */
export function findApps(catalog, text, describe = () => '') {
  const t = String(text ?? '').trim().toLowerCase(); if (!t) return catalog;
  return catalog.filter((a) => `${a.name} ${describe(a)}`.toLowerCase().includes(t));
}
