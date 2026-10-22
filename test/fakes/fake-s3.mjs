// A fake S3-compatible server for tests (stands in for Cloudflare R2). It VERIFIES every signature itself, written independently of the adapter, so a
// request the adapter signs wrongly is refused with 403 exactly as the real service would. Supports PUT, GET, HEAD, DELETE, ListObjectsV2 (paged) and presigned URLs.
import http from 'node:http';
import { createHash, createHmac } from 'node:crypto';

const rfc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const hex = (d) => createHash('sha256').update(d).digest('hex');
const mac = (k, d) => createHmac('sha256', k).update(d).digest();

export async function startFakeS3({ accessKeyId = 'AKIATEST', secretAccessKey = 'test-secret-key', bucket = 'drive', region = 'auto', pageSize = 2, now = () => Date.now() } = {}) {
  const objects = new Map(); const log = [];
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c); const body = Buffer.concat(chunks);
    const url = new URL(req.url, `http://${req.headers.host}`);
    const deny = (why) => { log.push({ method: req.method, path: url.pathname, denied: why }); res.writeHead(403, { 'content-type': 'application/xml' }); res.end(`<Error><Code>SignatureDoesNotMatch</Code><Message>${why}</Message></Error>`); };
    // ---- verify the signature from what actually arrived
    let given, signedHeaders, stamp, expires = null, payloadHash;
    const q = new URLSearchParams(url.search);
    if (q.has('X-Amz-Signature')) {
      given = q.get('X-Amz-Signature'); signedHeaders = q.get('X-Amz-SignedHeaders').split(';'); stamp = q.get('X-Amz-Date'); expires = Number(q.get('X-Amz-Expires')); payloadHash = 'UNSIGNED-PAYLOAD';
      q.delete('X-Amz-Signature');
    } else {
      const a = /Credential=([^/]+)\/(\d{8})\/([^/]+)\/s3\/aws4_request, SignedHeaders=([^,]+), Signature=([0-9a-f]+)/.exec(req.headers.authorization ?? '');
      if (!a) return deny('missing authorization');
      given = a[5]; signedHeaders = a[4].split(';'); stamp = req.headers['x-amz-date']; payloadHash = req.headers['x-amz-content-sha256'];
      if (payloadHash !== 'UNSIGNED-PAYLOAD' && payloadHash !== hex(body)) return deny('payload hash does not match the body');
    }
    if (expires != null) { const t = Date.UTC(+stamp.slice(0, 4), +stamp.slice(4, 6) - 1, +stamp.slice(6, 8), +stamp.slice(9, 11), +stamp.slice(11, 13), +stamp.slice(13, 15)); if (now() > t + expires * 1000) return deny('expired'); if (t > now() + 900000) return deny('from the future'); }
    const canonQuery = [...q.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${rfc(k)}=${rfc(v)}`).join('&');
    const canonHeaders = signedHeaders.map((h) => `${h}:${String(req.headers[h] ?? '').trim()}\n`).join('');
    const canonical = [req.method, url.pathname, canonQuery, canonHeaders, signedHeaders.join(';'), payloadHash].join('\n');
    const day = stamp.slice(0, 8);
    const sig = createHmac('sha256', mac(mac(mac(mac(`AWS4${secretAccessKey}`, day), region), 's3'), 'aws4_request')).update(['AWS4-HMAC-SHA256', stamp, `${day}/${region}/s3/aws4_request`, hex(canonical)].join('\n')).digest('hex');
    if (sig !== given) return deny('signature mismatch');
    // ---- the service
    const parts = decodeURIComponent(url.pathname).split('/').filter(Boolean);
    if (parts[0] !== bucket) { res.writeHead(404); res.end(); return; }
    const key = parts.slice(1).join('/');
    log.push({ method: req.method, key });
    if (req.method === 'GET' && !key) {
      const prefix = q.get('prefix') ?? ''; const all = [...objects.keys()].filter((k) => k.startsWith(prefix)).sort();
      const start = q.get('continuation-token') ? Number(Buffer.from(q.get('continuation-token'), 'base64').toString()) : 0;
      const page = all.slice(start, start + pageSize); const more = start + pageSize < all.length;
      const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      res.writeHead(200, { 'content-type': 'application/xml' });
      res.end(`<?xml version="1.0"?><ListBucketResult><IsTruncated>${more}</IsTruncated>${page.map((k) => `<Contents><Key>${esc(k)}</Key><Size>${objects.get(k).length}</Size></Contents>`).join('')}${more ? `<NextContinuationToken>${Buffer.from(String(start + pageSize)).toString('base64')}</NextContinuationToken>` : ''}</ListBucketResult>`);
      return;
    }
    if (req.method === 'PUT') { objects.set(key, body); res.writeHead(200); res.end(); return; }
    if (!objects.has(key)) { res.writeHead(404); res.end(); return; }
    if (req.method === 'HEAD') { res.writeHead(200, { 'content-length': objects.get(key).length }); res.end(); return; }
    if (req.method === 'GET') { res.writeHead(200, { 'content-length': objects.get(key).length }); res.end(objects.get(key)); return; }
    if (req.method === 'DELETE') { objects.delete(key); res.writeHead(204); res.end(); return; }
    res.writeHead(405); res.end();
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  return { endpoint: `http://127.0.0.1:${server.address().port}`, bucket, accessKeyId, secretAccessKey, region, objects, log, close: () => new Promise((ok) => { server.close(ok); server.closeAllConnections?.(); }) };
}
