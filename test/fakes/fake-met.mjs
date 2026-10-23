// A fake MET Norway Locationforecast server for tests: records every request (path, query, headers), answers in the real compact format,
// honours If-Modified-Since with 304, and can be told to fail. Never talks to the internet.
import http from 'node:http';
export async function startFakeMet() {
  const calls = []; const state = { symbol: 'lightrain_day', temp: 16.4, fail: 0, status: 200, lastModified: 'Thu, 22 Oct 2026 10:00:00 GMT', expires: null };
  const srv = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    calls.push({ path: url.pathname, lat: url.searchParams.get('lat'), lon: url.searchParams.get('lon'), headers: req.headers });
    if (state.fail > 0) { state.fail--; res.writeHead(state.status || 503).end('no'); return; }
    if (req.headers['if-modified-since'] === state.lastModified) { res.writeHead(304, state.expires ? { expires: state.expires } : {}).end(); return; }
    res.writeHead(200, { 'content-type': 'application/json', 'last-modified': state.lastModified, ...(state.expires ? { expires: state.expires } : {}) });
    res.end(JSON.stringify({ type: 'Feature', geometry: { type: 'Point', coordinates: [Number(url.searchParams.get('lon')), Number(url.searchParams.get('lat')), 12] },
      properties: { meta: { units: { air_temperature: 'celsius' } }, timeseries: [{ time: '2026-10-22T10:00:00Z', data: { instant: { details: { air_temperature: state.temp } }, next_1_hours: { summary: { symbol_code: state.symbol } } } }] } }));
  }).listen(0, '127.0.0.1');
  await new Promise((r) => srv.on('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}/weatherapi/locationforecast/2.0/compact`;
  return { calls, state, base, close: () => new Promise((r) => srv.close(r)) };
}
