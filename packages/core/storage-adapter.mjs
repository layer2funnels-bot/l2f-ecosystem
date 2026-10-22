// File storage adapter. ONE interface, three drivers:
//   supabase  Supabase Storage over its REST interface (go-live default; needs the project's server key, never sent to a browser)
//   s3        any S3-compatible service through SigV4: Cloudflare R2 (later switch-over), MinIO, a fake server in tests
//   memory    in-process, for unit tests
// The application, not the provider, enforces the size cap (migration 0023); the adapter only moves bytes and signs addresses.
//   signUpload({ path, contentType, size, seconds })   -> { url, method, headers }   browser PUTs the bytes there
//   signDownload({ path, seconds, fileName })          -> { url }
//   head(path) -> { size } | null    put(path, bytes, contentType)    get(path) -> Buffer    remove(path)
//   list(prefix) -> async iterator of { path, size }   (walks every page / folder)
import { createHash, createHmac } from 'node:crypto';

const sha256hex = (d) => createHash('sha256').update(d).digest('hex');
const hmac = (k, d) => createHmac('sha256', k).update(d).digest();
// RFC 3986 percent-encoding as SigV4 wants it (everything but unreserved; "/" kept in paths only)
export const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const encPath = (p) => p.split('/').map(enc).join('/');
const amzDate = (d) => d.toISOString().replace(/[-:]|\.\d{3}/g, '');

// ---------------------------------------------------------------- SigV4 (header or query signing)
export function signV4({ method, host, path, query = {}, headers = {}, payloadHash, accessKeyId, secretAccessKey, region, service = 's3', date = new Date(), presign = null, canonicalPathEncoded = false }) {
  const stamp = amzDate(date), day = stamp.slice(0, 8), scope = `${day}/${region}/${service}/aws4_request`;
  const h = { host, ...headers }; if (!presign) h['x-amz-date'] = stamp;
  const names = Object.keys(h).map((k) => k.toLowerCase()).sort();
  const hv = Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), String(v).trim().replace(/\s+/g, ' ')]));
  const q = { ...query };
  if (presign) Object.assign(q, { 'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': `${accessKeyId}/${scope}`, 'X-Amz-Date': stamp, 'X-Amz-Expires': String(presign.seconds), 'X-Amz-SignedHeaders': names.join(';') });
  const canonQuery = Object.keys(q).sort().map((k) => `${enc(k)}=${enc(String(q[k]))}`).join('&');
  const canonPath = canonicalPathEncoded ? path : encPath(path);
  const canonical = [method, canonPath, canonQuery, names.map((n) => `${n}:${hv[n]}\n`).join(''), names.join(';'), payloadHash].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', stamp, scope, sha256hex(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, day), region), service), 'aws4_request');
  const signature = createHmac('sha256', key).update(toSign).digest('hex');
  return { signature, signedHeaders: names.join(';'), scope, stamp, canonicalRequest: canonical, canonQuery, authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}` };
}

const xmlText = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const clampTtl = (s, max = 3600) => Math.min(Math.max(1, Math.floor(Number(s) || 300)), max);

// ---------------------------------------------------------------- s3 driver (Cloudflare R2 and any S3 API)
export function createS3Storage({ endpoint, bucket, accessKeyId, secretAccessKey, region = 'auto', fetchImpl = fetch, now = () => new Date() }) {
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) throw new Error('S3 storage needs endpoint, bucket and keys');
  const base = new URL(endpoint); const host = base.host;
  const pathOf = (key) => `/${bucket}/${key}`;
  const urlOf = (path, query = '') => `${base.origin}${encPath(path)}${query ? `?${query}` : ''}`;
  const presigned = (method, key, seconds, extraHeaders = {}) => {
    const s = signV4({ method, host, path: pathOf(key), headers: extraHeaders, payloadHash: 'UNSIGNED-PAYLOAD', accessKeyId, secretAccessKey, region, date: now(), presign: { seconds } });
    return `${urlOf(pathOf(key), `${s.canonQuery}&X-Amz-Signature=${s.signature}`)}`;
  };
  const call = async (method, path, { query = {}, body, contentType } = {}) => {
    const payload = body ?? Buffer.alloc(0); const payloadHash = sha256hex(payload);
    const headers = { 'x-amz-content-sha256': payloadHash, ...(contentType ? { 'content-type': contentType } : {}) };
    const s = signV4({ method, host, path, query, headers, payloadHash, accessKeyId, secretAccessKey, region, date: now() });
    const qs = Object.keys(query).sort().map((k) => `${enc(k)}=${enc(String(query[k]))}`).join('&');
    return fetchImpl(urlOf(path, qs), { method, headers: { ...headers, 'x-amz-date': s.stamp, authorization: s.authorization }, ...(method === 'PUT' ? { body: payload } : {}) });
  };
  return {
    driver: 's3', bucket,
    async signUpload({ path, size, seconds = 600 }) {
      const hdrs = size != null ? { 'content-length': String(size) } : {};          // the signature fixes the size: the browser cannot send more than it declared
      return { url: presigned('PUT', path, clampTtl(seconds), hdrs), method: 'PUT', headers: hdrs };
    },
    async signDownload({ path, seconds = 300 }) { return { url: presigned('GET', path, clampTtl(seconds)) }; },
    async head(path) { const r = await call('HEAD', pathOf(path)); if (r.status === 404) return null; if (!r.ok) throw new Error(`storage ${r.status}`); return { size: Number(r.headers.get('content-length') ?? 0) }; },
    async put(path, bytes, contentType = 'application/octet-stream') { const r = await call('PUT', pathOf(path), { body: Buffer.from(bytes), contentType }); if (!r.ok) throw new Error(`storage ${r.status}`); },
    async get(path) { const r = await call('GET', pathOf(path)); if (!r.ok) throw new Error(`storage ${r.status}`); return Buffer.from(await r.arrayBuffer()); },
    async remove(path) { const r = await call('DELETE', pathOf(path)); if (!r.ok && r.status !== 404) throw new Error(`storage ${r.status}`); },
    async *list(prefix = '') {
      let token;
      do {
        const r = await call('GET', `/${bucket}`, { query: { 'list-type': '2', prefix, ...(token ? { 'continuation-token': token } : {}) } });
        if (!r.ok) throw new Error(`storage ${r.status}`);
        const xml = await r.text();
        for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) yield { path: xmlText(m[1].match(/<Key>([\s\S]*?)<\/Key>/)[1]), size: Number(m[1].match(/<Size>(\d+)<\/Size>/)?.[1] ?? 0) };
        token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? xmlText(xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)[1]) : null;
      } while (token);
    },
  };
}

// ---------------------------------------------------------------- supabase driver (Storage REST; server key only)
export function createSupabaseStorage({ url, serviceKey, bucket = 'drive', fetchImpl = fetch }) {
  if (!url || !serviceKey) throw new Error('Supabase storage needs the project URL and the server key');
  const root = `${String(url).replace(/\/$/, '')}/storage/v1`;
  const auth = { apikey: serviceKey, authorization: `Bearer ${serviceKey}` };
  const obj = (path) => `${root}/object/${bucket}/${encPath(path)}`;
  const json = async (r) => { if (!r.ok) throw new Error(`storage ${r.status}`); return r.json(); };
  return {
    driver: 'supabase', bucket,
    async signUpload({ path }) {
      const r = await json(await fetchImpl(`${root}/object/upload/sign/${bucket}/${encPath(path)}`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: '{}' }));
      return { url: r.url.startsWith('http') ? r.url : `${root}${r.url}`, method: 'PUT', headers: {} };
    },
    async signDownload({ path, seconds = 300, fileName }) {
      const r = await json(await fetchImpl(`${root}/object/sign/${bucket}/${encPath(path)}`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ expiresIn: clampTtl(seconds) }) }));
      const u = r.signedURL.startsWith('http') ? r.signedURL : `${root}${r.signedURL}`;
      return { url: fileName ? `${u}${u.includes('?') ? '&' : '?'}download=${enc(fileName)}` : u };
    },
    async head(path) { const r = await fetchImpl(`${root}/object/authenticated/${bucket}/${encPath(path)}`, { method: 'HEAD', headers: auth }); if (r.status === 404 || r.status === 400) return null; if (!r.ok) throw new Error(`storage ${r.status}`); return { size: Number(r.headers.get('content-length') ?? 0) }; },
    async put(path, bytes, contentType = 'application/octet-stream') { const r = await fetchImpl(obj(path), { method: 'POST', headers: { ...auth, 'content-type': contentType, 'x-upsert': 'true' }, body: Buffer.from(bytes) }); if (!r.ok) throw new Error(`storage ${r.status}`); },
    async get(path) { const r = await fetchImpl(`${root}/object/authenticated/${bucket}/${encPath(path)}`, { headers: auth }); if (!r.ok) throw new Error(`storage ${r.status}`); return Buffer.from(await r.arrayBuffer()); },
    async remove(path) { const r = await fetchImpl(obj(path), { method: 'DELETE', headers: auth }); if (!r.ok && r.status !== 404 && r.status !== 400) throw new Error(`storage ${r.status}`); },
    async *list(prefix = '') {                                                 // the REST list is one folder at a time: walk down
      const walk = async function* (dir) {
        for (let offset = 0; ; offset += 100) {
          const items = await json(await fetchImpl(`${root}/object/list/${bucket}`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ prefix: dir, limit: 100, offset, sortBy: { column: 'name', order: 'asc' } }) }));
          for (const it of items) { if (it.id === null) yield* walk(`${dir}${it.name}/`); else yield { path: `${dir}${it.name}`, size: Number(it.metadata?.size ?? 0) }; }
          if (items.length < 100) break;
        }
      };
      const dir = prefix && !prefix.endsWith('/') ? prefix.replace(/[^/]*$/, '') : prefix;
      for await (const o of walk(dir)) if (o.path.startsWith(prefix)) yield o;
    },
  };
}

// ---------------------------------------------------------------- memory driver (tests)
export function createMemoryStorage() {
  const files = new Map();
  return {
    driver: 'memory', bucket: 'memory', files,
    async signUpload({ path }) { return { url: `memory://upload/${path}`, method: 'PUT', headers: {} }; },
    async signDownload({ path }) { return { url: `memory://download/${path}` }; },
    async head(path) { return files.has(path) ? { size: files.get(path).length } : null; },
    async put(path, bytes) { files.set(path, Buffer.from(bytes)); },
    async get(path) { if (!files.has(path)) throw new Error('storage 404'); return files.get(path); },
    async remove(path) { files.delete(path); },
    async *list(prefix = '') { for (const [path, b] of [...files].sort()) if (path.startsWith(prefix)) yield { path, size: b.length }; },
  };
}

// Chooses the driver from the environment. Returns null when no storage is configured (file operations then answer "unavailable").
//   STORAGE_DRIVER=supabase  STORAGE_URL=https://<ref>.supabase.co  STORAGE_SERVER_KEY=...  [STORAGE_BUCKET=drive]
//   STORAGE_DRIVER=s3        S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com  S3_BUCKET=...  S3_ACCESS_KEY_ID=...  S3_SECRET_ACCESS_KEY=...  [S3_REGION=auto]
export function storageFromEnv(env, fetchImpl = fetch) {
  const d = env.STORAGE_DRIVER;
  if (!d) return null;
  if (d === 'supabase') return createSupabaseStorage({ url: env.STORAGE_URL, serviceKey: env.STORAGE_SERVER_KEY, bucket: env.STORAGE_BUCKET || 'drive', fetchImpl });
  if (d === 's3') return createS3Storage({ endpoint: env.S3_ENDPOINT, bucket: env.S3_BUCKET, accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY, region: env.S3_REGION || 'auto', fetchImpl });
  if (d === 'memory') return createMemoryStorage();
  throw new Error('unknown STORAGE_DRIVER');
}
