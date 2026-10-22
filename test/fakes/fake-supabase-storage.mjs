// A fake of the parts of Supabase Storage's REST interface the adapter uses (sign upload/download, upload, authenticated get/head, delete, folder-by-folder list).
// Requests need the server key; signed addresses carry a token that the fake checks.
import http from 'node:http';

export async function startFakeSupabaseStorage({ serviceKey = 'server-key', bucket = 'drive' } = {}) {
  const objects = new Map(); const tokens = new Map();
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c); const body = Buffer.concat(chunks);
    const url = new URL(req.url, `http://${req.headers.host}`); const p = decodeURIComponent(url.pathname);
    const send = (s, o, h = { 'content-type': 'application/json' }) => { res.writeHead(s, h); res.end(o == null ? undefined : (Buffer.isBuffer(o) ? o : JSON.stringify(o))); };
    const authed = req.headers.authorization === `Bearer ${serviceKey}` && req.headers.apikey === serviceKey;
    const base = '/storage/v1';
    const m = (re) => p.startsWith(base) ? re.exec(p.slice(base.length)) : null;
    let r;
    if ((r = m(/^\/object\/upload\/sign\/([^/]+)\/(.+)$/))) {
      if (req.method === 'POST') { if (!authed) return send(401, { error: 'no' }); const t = `u${tokens.size}`; tokens.set(t, `up:${r[2]}`); return send(200, { url: `/object/upload/sign/${r[1]}/${encodeURI(r[2])}?token=${t}` }); }
      if (req.method === 'PUT') { if (tokens.get(url.searchParams.get('token')) !== `up:${r[2]}`) return send(403, { error: 'bad token' }); objects.set(r[2], body); return send(200, { Key: `${r[1]}/${r[2]}` }); }
    }
    if ((r = m(/^\/object\/sign\/([^/]+)\/(.+)$/))) {
      if (req.method === 'POST') { if (!authed) return send(401, { error: 'no' }); if (!objects.has(r[2])) return send(404, { error: 'not found' }); const t = `d${tokens.size}`; tokens.set(t, `down:${r[2]}`); return send(200, { signedURL: `/object/sign/${r[1]}/${encodeURI(r[2])}?token=${t}`, expiresIn: JSON.parse(body.toString()).expiresIn }); }
      if (req.method === 'GET') { if (tokens.get(url.searchParams.get('token')) !== `down:${r[2]}`) return send(403, { error: 'bad token' }); return send(200, objects.get(r[2]), { 'content-type': 'application/octet-stream' }); }
    }
    if (!authed) return send(401, { error: 'no' });
    if ((r = m(/^\/object\/authenticated\/([^/]+)\/(.+)$/))) {
      if (!objects.has(r[2])) return send(404, { error: 'not found' });
      if (req.method === 'HEAD') return send(200, null, { 'content-length': objects.get(r[2]).length });
      if (req.method === 'GET') return send(200, objects.get(r[2]), { 'content-type': 'application/octet-stream' });
    }
    if ((r = m(/^\/object\/list\/([^/]+)$/)) && req.method === 'POST') {
      const { prefix, limit, offset } = JSON.parse(body.toString()); const names = new Map();
      for (const [k, v] of objects) if (k.startsWith(prefix)) { const rest = k.slice(prefix.length); const slash = rest.indexOf('/'); if (slash >= 0) names.set(rest.slice(0, slash), { name: rest.slice(0, slash), id: null }); else names.set(rest, { name: rest, id: `id-${k}`, metadata: { size: v.length } }); }
      return send(200, [...names.values()].sort((a, b) => (a.name < b.name ? -1 : 1)).slice(offset, offset + limit));
    }
    if ((r = m(/^\/object\/([^/]+)\/(.+)$/))) {
      if (req.method === 'POST') { objects.set(r[2], body); return send(200, { Key: `${r[1]}/${r[2]}` }); }
      if (req.method === 'DELETE') { objects.delete(r[2]); return send(200, { message: 'Successfully deleted' }); }
    }
    send(404, { error: 'unknown route' });
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  return { url: `http://127.0.0.1:${server.address().port}`, serviceKey, bucket, objects, close: () => new Promise((ok) => { server.close(ok); server.closeAllConnections?.(); }) };
}
