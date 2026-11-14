// Launcher sky (Design v4 section 8): time of day from the person's own clock, weather from our server (MET Norway, cached), opt-out kept
// on this device. Everything here is plain logic so it is tested without a browser; the Launcher only draws it.
export const WEATHER_KEY = 'l2f.weather';       // 'off' = the person switched weather off on this device
export const PARTS = ['morning', 'afternoon', 'evening', 'night'];
export const CONDITIONS = ['clear', 'cloudy', 'rain', 'hot', 'cold'];
/** Owner (14 Nov 2026): the Launcher reflects the weather and seasons of Khushab, Pakistan by default. Someone can choose their own device
 * location instead (WXPLACE_KEY = 'device'); if the browser then refuses, Khushab is used. */
export const KHUSHAB = Object.freeze({ lat: 32.3, lon: 72.35, name: 'Khushab' });
export const WXPLACE_KEY = 'l2f.wxplace';
/** Weather effects drawn from the real weather (accurate). Snowfall is NOT one of them: it is a separate, creative winter visual (below). */
export const EFFECTS = ['sun', 'cool', 'heat', 'haze', 'fog', 'cloud', 'rain'];
/** Owner (14 Nov 2026): snowfall on the Launcher is a visual winter experience, not a weather report, and has its own switch.
 * On by default; shown in winter (Dec-Feb) or on cold days (≤ 10 °C), but not while it is actually raining. */
export const SNOW_KEY = 'l2f.snow';            // 'off' = the person switched snowfall off on this device
export function snowOff(store) { try { return store.getItem(SNOW_KEY) === 'off'; } catch { return false; } }
export function setSnowOff(store, off) { try { off ? store.setItem(SNOW_KEY, 'off') : store.removeItem(SNOW_KEY); } catch { /* private mode */ } }
export function showSnow({ on = true, month, tempC, effect } = {}) {
  if (!on || effect === 'rain') return false;
  return season(month ?? new Date().getMonth()) === 'winter' || (Number.isFinite(tempC) && tempC <= 10);
}
/** Pakistan's seasons by month (0 = January): winter Dec-Feb, spring Mar-Apr, summer May-Jun, monsoon Jul-Sep, autumn Oct-Nov. */
export function season(month) { const m = ((Math.floor(month) % 12) + 12) % 12; return m === 11 || m <= 1 ? 'winter' : m <= 3 ? 'spring' : m <= 5 ? 'summer' : m <= 8 ? 'monsoon' : 'autumn'; }
/** One effect from the real weather (MET symbol, temperature, wind) plus the season. Only what the weather justifies: rain only when MET says
 * rain, fog only when it says fog. Winter clear or hazy-fair days get the soft cool haze of the Punjab winter; snow or sleet codes (which the
 * model can very rarely give) become cool haze, never snowfall. Wind (≥ 8 m/s) is a separate, additive layer. Without weather data the
 * season alone sets a calm light: cool in winter, warm otherwise; never fog, rain or wind. */
export function atmosphere({ symbol, tempC, windMs, month } = {}) {
  const s = String(symbol ?? '').replace(/_(day|night|polartwilight)$/, ''); const sea = season(month ?? new Date().getMonth());
  const wind = Number.isFinite(windMs) && windMs >= 8;
  if (!s) return { effect: sea === 'winter' ? 'cool' : 'sun', wind: false, season: sea, fromWeather: false };
  let effect;
  if (/rain|drizzle|shower|thunder|sleet/.test(s) && !/snow/.test(s)) effect = 'rain';
  else if (/snow|sleet/.test(s)) effect = 'cool';
  else if (/fog/.test(s)) effect = 'fog';
  else if (/cloudy/.test(s) && s !== 'partlycloudy') effect = 'cloud';
  else if (Number.isFinite(tempC) && tempC >= 35) effect = 'heat';
  else if (sea === 'winter' || (Number.isFinite(tempC) && tempC <= 14)) effect = (s === 'clearsky' ? 'cool' : 'haze');
  else effect = s === 'partlycloudy' ? 'cloud' : 'sun';
  return { effect, wind, season: sea, fromWeather: true };
}

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
export const chipText = (w) => `${w.label} · ${w.tempC}° · ${w.place ?? KHUSHAB.name}`;
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
/** The weather for the sky, or null (opted out, offline, server says unavailable): the sky then shows time of day and the season's light only. */
export async function loadWeather({ api, store, geo, session = (typeof sessionStorage !== 'undefined' ? sessionStorage : null), now = Date.now }) {
  if (weatherOff(store)) return null;
  try { const c = JSON.parse(session?.getItem('l2f.wx') ?? 'null'); if (c && now() - c.at < 30 * 60_000) return c.w; } catch { /* no cache */ }
  // Khushab unless this person chose their own location on this device (and the browser allows it)
  let device = false; try { device = store?.getItem(WXPLACE_KEY) === 'device'; } catch { /* blocked store: Khushab */ }
  const own = device ? await getLocation({ geo }) : null;
  const where = own ?? KHUSHAB; const place = own ? 'your location' : KHUSHAB.name;
  const r = await api.call('weather.get', { lat: Math.round(where.lat * 100) / 100, lon: Math.round(where.lon * 100) / 100 });
  if (!r?.ok || !r.data?.[0]) return null;
  const w = { ...r.data[0], place };
  try { session?.setItem('l2f.wx', JSON.stringify({ at: now(), w })); } catch { /* not cached */ }
  return w;
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
