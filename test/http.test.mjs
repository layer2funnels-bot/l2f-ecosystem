// Slice 0 edge: JWT verification and HTTP routes (no database; the pipeline behind them is covered by api.test.mjs).
import { randomUUID as id } from 'node:crypto';
import { recorder } from './lib.mjs';
import { createJwtVerifier, createJwksProvider } from '../packages/core/jwt.mjs';
import { createHttpHandler } from '../packages/core/http.mjs';

const { results, check } = recorder();
const enc = new TextEncoder();
const b64u = (b) => Buffer.from(b).toString('base64url');
const part = (o) => b64u(JSON.stringify(o));
const SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long';
let clock = 1_800_000_000_000; const now = () => clock; const sec = () => Math.floor(clock / 1000);
const U = id();
const claims = (o = {}) => ({ sub: U, email: 'a@example.com', role: 'authenticated', aud: 'authenticated', iss: 'https://p.supabase.co/auth/v1', exp: sec() + 3600, ...o });
const hs = async (header, payload, secret = SECRET) => {
  const data = `${part(header)}.${part(payload)}`;
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `${data}.${b64u(await crypto.subtle.sign('HMAC', k, enc.encode(data)))}`;
};
const ec = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const jwkPub = { ...(await crypto.subtle.exportKey('jwk', ec.publicKey)), kid: 'k1', alg: 'ES256' };
const es = async (kid, payload, key = ec.privateKey) => {
  const data = `${part({ alg: 'ES256', typ: 'JWT', kid })}.${part(payload)}`;
  return `${data}.${b64u(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(data)))}`;
};
const hsKey = [{ alg: 'HS256', secret: SECRET }];
const verify = createJwtVerifier({ keys: hsKey, issuer: 'https://p.supabase.co/auth/v1', now });
const H = { alg: 'HS256', typ: 'JWT' };

let r = await verify(await hs(H, claims()));
check('J1', 'A valid HS256 access token is accepted; identity comes from sub and email', r.ok && r.userId === U && r.email === 'a@example.com');
check('J2', 'Wrong secret is refused', !(await verify(await hs(H, claims(), 'another-secret-another-secret-another'))).ok);
check('J3', 'alg=none is refused', !(await verify(`${part({ alg: 'none', typ: 'JWT' })}.${part(claims())}.`)).ok);
check('J4', 'An unlisted algorithm (HS512) is refused', !(await verify(await hs({ alg: 'HS512', typ: 'JWT' }, claims()))).ok);
check('J5', 'Expired token is refused; one inside the 30 s skew is accepted', !(await verify(await hs(H, claims({ exp: sec() - 120 })))).ok && (await verify(await hs(H, claims({ exp: sec() - 10 })))).ok);
check('J6', 'Token that is not valid yet (nbf) is refused', !(await verify(await hs(H, claims({ nbf: sec() + 600 })))).ok);
check('J7', 'Wrong audience or issuer is refused', !(await verify(await hs(H, claims({ aud: 'other' })))).ok && !(await verify(await hs(H, claims({ iss: 'https://evil.example/auth/v1' })))).ok);
check('J8', 'The public anon key (role anon) is not a person and is refused', !(await verify(await hs(H, claims({ role: 'anon' })))).ok && !(await verify(await hs(H, claims({ role: 'service_role' })))).ok);
check('J9', 'Missing exp, or sub that is not a uuid, is refused', !(await verify(await hs(H, claims({ exp: undefined })))).ok && !(await verify(await hs(H, claims({ sub: 'admin' })))).ok);
const good = await hs(H, claims());
const [h0, p0, s0] = good.split('.');
check('J10', 'A tampered payload is refused', !(await verify(`${h0}.${part(claims({ sub: id() }))}.${s0}`)).ok);
check('J11', 'Malformed input never throws: empty, two parts, binary, oversize, non-string', (await Promise.all(['', 'a.b', 'a.b.c', '...', 'x'.repeat(5000), null, 42, `${h0}.${p0}.`].map(verify))).every((x) => x.ok === false));

const jwks = { keys: [jwkPub] }; let fetches = 0;
const mkJwks = () => createJwksProvider({ url: 'https://p.supabase.co/auth/v1/.well-known/jwks.json', fetchImpl: async () => { fetches++; return { ok: true, json: async () => jwks }; }, now });
let verifyEs = createJwtVerifier({ getKeys: mkJwks(), now });
check('J12', 'An ES256 token signed by a key in the JWKS is accepted', (await verifyEs(await es('k1', claims()))).ok);
const other = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
check('J13', 'An ES256 token signed by a different key is refused', !(await verifyEs(await es('k1', claims(), other.privateKey))).ok);
fetches = 0; verifyEs = createJwtVerifier({ getKeys: mkJwks(), now });
for (let i = 0; i < 5; i++) await verifyEs(await es('unknown', claims()));
check('J14', 'Unknown key ids cannot make the server hammer the JWKS URL (refetch at most once a minute)', fetches <= 2);
const confusion = createJwtVerifier({ keys: [{ alg: 'ES256', kid: 'k1', jwk: jwkPub }], now });
check('J15', 'Algorithm confusion: an HS256 token "signed" with the public key material is refused', !(await confusion(await hs(H, claims(), JSON.stringify(jwkPub)))).ok);

// ---- HTTP routes (stub API: records what reached it)
const seen = []; const api = { handle: async (req) => { seen.push(req); return req.operation === 'limited'
  ? { status: 429, body: { requestId: 'req_1', ok: false, error: { code: 'rate_limited', message: 'Too many requests. Wait a moment and try again.', retryAfterSeconds: 7 } } }
  : { status: 200, body: { requestId: 'req_1', ok: true, data: [{ n: 1 }] } }; } };
const handler = createHttpHandler({ api, verifyToken: verify });
const ORG = id();
const call = (path, { method = 'POST', body, headers = {} } = {}) => handler(new Request(`https://app.example.com${path}`, {
  method, headers: { 'content-type': 'application/json', authorization: `Bearer ${good}`, 'x-org-id': ORG, ...headers }, body: method === 'GET' ? undefined : (body === undefined ? '{}' : body) }));
let res = await call('/api/launcher.list');
let b = await res.json();
check('H1', 'A signed-in POST reaches the API with identity from the token and org from the header', res.status === 200 && seen[0].auth.userId === U && seen[0].headers['x-org-id'] === ORG && seen[0].operation === 'launcher.list' && b.ok);
check('H2', 'Security headers: no-store, nosniff, no CORS, request id', res.headers.get('cache-control') === 'no-store' && res.headers.get('x-content-type-options') === 'nosniff' && !res.headers.get('access-control-allow-origin') && res.headers.get('x-request-id') === 'req_1');
const n0 = seen.length;
res = await call('/api/launcher.list', { headers: { authorization: 'Bearer abc.def.ghi' } }); b = await res.json();
check('H3', 'A bad token is 401 session_expired and never reaches the API', res.status === 401 && b.error.code === 'session_expired' && seen.length === n0);
res = await call('/api/launcher.list', { headers: { authorization: '' } });
check('H4', 'No token is the same 401', res.status === 401 && (await res.json()).error.code === 'session_expired' && seen.length === n0);
res = await call('/api/launcher.list', { headers: { 'content-type': 'text/plain' } });
check('H5', 'Non-JSON content type is refused', res.status === 400 && seen.length === n0);
res = await call('/api/launcher.list', { body: '{not json' });
check('H6', 'Broken JSON is refused with a plain message', res.status === 400 && (await res.json()).error.code === 'bad_request' && seen.length === n0);
res = await call('/api/launcher.list', { body: JSON.stringify({ x: 'a'.repeat(20000) }) });
check('H7', 'Bodies over 16 KB are refused', res.status === 400 && seen.length === n0);
res = await call('/api/launcher.list', { method: 'GET' });
check('H8', 'Only POST is allowed on operations', res.status === 405 && res.headers.get('allow') === 'POST');
res = await call('/api/launcher.list', { headers: { origin: 'https://evil.example' } });
check('H9', 'A request from another origin is refused as not found', res.status === 404 && seen.length === n0);
res = await call('/api/launcher.list', { headers: { origin: 'https://app.example.com' } });
check('H10', 'The same origin is accepted', res.status === 200);
res = await call('/api/limited');
check('H11', 'A rate-limited answer carries a Retry-After header', res.status === 429 && res.headers.get('retry-after') === '7');
res = await call('/api/health', { method: 'GET', headers: { authorization: '' } });
check('H12', 'Health check needs no token and touches nothing', res.status === 200 && (await res.json()).ok === true);
res = await call('/elsewhere');
check('H13', 'Anything outside /api is not found', res.status === 404);
const boom = createHttpHandler({ api: { handle: async () => { throw new Error('secret db password in message'); } }, verifyToken: verify });
res = await boom(new Request('https://app.example.com/api/x', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${good}`, 'x-org-id': ORG }, body: '{}' }));
const t = await res.text();
check('H14', 'An unexpected exception becomes a generic 500 with no detail', res.status === 500 && !t.includes('password'));

for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(4)} ${x.name}`);
const p = results.filter((x) => x.ok).length; console.log(`\n${p}/${results.length} checks passed`); process.exit(p === results.length ? 0 : 1);
