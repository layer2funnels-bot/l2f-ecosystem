// Weather for the Launcher sky (Design v4, V4-7). Source: MET Norway Locationforecast 2.0 (CC BY 4.0 / NLOD 2.0, free, no key).
// Their terms (api.met.no/doc/TermsOfService, read 23 Oct 2026): call from a server, not the browser; identify the application with a
// User-Agent that includes a contact; at most 4 decimals in the coordinates; do not repeat a request before it expires and use
// If-Modified-Since; credit "Data from MET Norway". We round to 2 decimals (about 1 km: enough for weather, and less personal), cache for
// 30 minutes per rounded place, send If-Modified-Since on a refresh, and keep a stale answer for 3 hours if MET is unreachable.
// Coordinates are never stored and never logged. Re-check the terms whenever this file changes.
const TTL_MS = 30 * 60_000, MIN_FRESH_MS = 60_000, MAX_FRESH_MS = 2 * 3_600_000, STALE_MS = 3 * 3_600_000, MAX_PLACES = 500;
const URL_BASE = 'https://api.met.no/weatherapi/locationforecast/2.0/compact';
export const ATTRIBUTION = 'Data from MET Norway';
export const ATTRIBUTION_LINKS = Object.freeze({ source: 'https://www.met.no/en', licence: 'https://creativecommons.org/licenses/by/4.0/', licenceName: 'CC BY 4.0', changes: 'Changed: reduced to a one-line summary.' });

const LABELS = { clearsky: 'Clear', fair: 'Mostly clear', partlycloudy: 'Partly cloudy', cloudy: 'Cloudy', fog: 'Fog', lightrain: 'Light rain', rain: 'Rain', heavyrain: 'Heavy rain',
  lightrainshowers: 'Light showers', rainshowers: 'Showers', heavyrainshowers: 'Heavy showers', sleet: 'Sleet', lightsleet: 'Light sleet', heavysleet: 'Heavy sleet', snow: 'Snow', lightsnow: 'Light snow', heavysnow: 'Heavy snow' };
/** MET symbol code (e.g. "lightrain_day", "heavyrainandthunder") to one of the five sky conditions the design has. */
export function condition(symbol, tempC) {
  const s = String(symbol ?? '').replace(/_(day|night|polartwilight)$/, '');
  let c = 'clear';
  if (/snow|sleet/.test(s)) c = 'cold'; else if (/rain|drizzle|thunder|shower/.test(s)) c = 'rain'; else if (/cloud|fog/.test(s)) c = 'cloudy';
  if (c === 'clear' || c === 'cloudy') { if (tempC >= 35) c = 'hot'; else if (tempC <= 0) c = 'cold'; }
  return c;
}
export function labelFor(symbol) {
  const s = String(symbol ?? '').replace(/_(day|night|polartwilight)$/, '');
  if (LABELS[s]) return LABELS[s];
  const base = s.replace(/andthunder$/, '');
  return s.endsWith('andthunder') ? `${LABELS[base] ?? 'Rain'} with thunder` : 'Weather';
}
const round2 = (n) => Math.round(n * 100) / 100;

export class WeatherError extends Error { constructor(code) { super(code); this.code = code; } }

/** `fetcher` is fetch-compatible (injected so tests use a fake MET server). */
export function createWeather({ fetcher = (...a) => fetch(...a), now = Date.now, userAgent, ttlMs = TTL_MS, base = URL_BASE } = {}) {
  if (!userAgent || !/[@.]/.test(userAgent)) throw new Error('WEATHER_USER_AGENT must identify the application with a contact (MET Norway terms), e.g. "L2FOffice/1.0 ops@example.com"');
  const cache = new Map();            // "lat,lon" -> { until, last, view }
  // how long an answer stays fresh: until MET's Expires time, kept between one minute and two hours; the default when MET sends no (or a bad) Expires
  const freshUntil = (headers, t) => { const exp = Date.parse(headers.get('expires') ?? ''); return t + (Number.isFinite(exp) ? Math.min(MAX_FRESH_MS, Math.max(MIN_FRESH_MS, exp - t)) : ttlMs); };
  const view = (json) => {
    const t0 = json?.properties?.timeseries?.[0]; const temp = t0?.data?.instant?.details?.air_temperature;
    const symbol = t0?.data?.next_1_hours?.summary?.symbol_code ?? t0?.data?.next_6_hours?.summary?.symbol_code ?? t0?.data?.next_12_hours?.summary?.symbol_code;
    if (typeof temp !== 'number' || !symbol) throw new WeatherError('weather_unavailable');
    return { condition: condition(symbol, temp), label: labelFor(symbol), tempC: Math.round(temp), source: ATTRIBUTION, licence: ATTRIBUTION_LINKS.licence, changes: ATTRIBUTION_LINKS.changes, updated: t0.time };
  };
  return {
    async get(lat, lon) {
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new WeatherError('bad_place');
      const la = round2(lat), lo = round2(lon), key = `${la},${lo}`; const hit = cache.get(key); const t = now();
      if (hit && t < hit.until) return hit.view;
      try {
        const r = await fetcher(`${base}?lat=${la.toFixed(2)}&lon=${lo.toFixed(2)}`, { headers: { 'user-agent': userAgent, accept: 'application/json', ...(hit?.last ? { 'if-modified-since': hit.last } : {}) } });
        if (r.status === 304 && hit) { hit.until = freshUntil(r.headers, t); hit.stale = t; return hit.view; }
        if (!r.ok) throw new WeatherError('weather_unavailable');
        const v = view(await r.json());
        if (cache.size >= MAX_PLACES) cache.delete(cache.keys().next().value);
        cache.set(key, { until: freshUntil(r.headers, t), stale: t, last: r.headers.get('last-modified') ?? null, view: v });
        return v;
      } catch (e) {
        if (hit && t - hit.stale < STALE_MS) return hit.view;
        throw e instanceof WeatherError ? e : new WeatherError('weather_unavailable');
      }
    },
    size: () => cache.size,
  };
}
