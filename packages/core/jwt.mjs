// Verifies Supabase access tokens with WebCrypto only (runs on Node 20+ and Cloudflare Workers/Pages Functions).
// The KEY decides the algorithm, never the token header (stops alg-confusion and alg=none).
// Accepts: HS256 with the project JWT secret (legacy keys, local stack) and ES256 / RS256 with the project's JWKS.
const enc = new TextEncoder();
const b64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
const json = (s) => JSON.parse(new TextDecoder().decode(b64u(s)));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALGS = {
  HS256: { import: { name: 'HMAC', hash: 'SHA-256' }, verify: { name: 'HMAC' } },
  ES256: { import: { name: 'ECDSA', namedCurve: 'P-256' }, verify: { name: 'ECDSA', hash: 'SHA-256' } },
  RS256: { import: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, verify: { name: 'RSASSA-PKCS1-v1_5' } },
};

// keys: [{ alg, kid?, secret? (HS256) | jwk? (ES256/RS256) }]. getKeys() may be async and may refresh a JWKS.
export function createJwtVerifier({ keys, getKeys, issuer = null, audience = 'authenticated', now = () => Date.now(), skewSeconds = 30 }) {
  const cache = new WeakMap();   // key object -> CryptoKey (callers must hand back the same key objects)
  const cryptoKey = async (k) => {
    if (!cache.has(k)) {
      const a = ALGS[k.alg];
      cache.set(k, k.alg === 'HS256'
        ? await crypto.subtle.importKey('raw', enc.encode(k.secret), a.import, false, ['verify'])
        : await crypto.subtle.importKey('jwk', k.jwk, a.import, false, ['verify']));
    }
    return cache.get(k);
  };
  const keySet = async (kid, refresh) => (getKeys ? await getKeys({ kid, refresh }) : keys) ?? [];

  // -> { ok: true, userId, email } | { ok: false }   (never says why: callers show "session expired")
  return async function verify(token) {
    try {
      if (typeof token !== 'string' || token.length > 4096) return { ok: false };
      const parts = token.split('.');
      if (parts.length !== 3 || parts.some((p) => !p)) return { ok: false };
      const header = json(parts[0]);
      if (!Object.hasOwn(ALGS, header.alg)) return { ok: false };               // rejects none, HS512, anything unlisted
      const signed = enc.encode(`${parts[0]}.${parts[1]}`), sig = b64u(parts[2]);
      const tryKeys = async (refresh) => {
        const candidates = (await keySet(header.kid, refresh)).filter((k) => k.alg === header.alg && (header.kid === undefined || k.kid === undefined || k.kid === header.kid));
        for (const k of candidates) if (await crypto.subtle.verify(ALGS[k.alg].verify, await cryptoKey(k), sig, signed)) return true;
        return false;
      };
      if (!(await tryKeys(false)) && !(getKeys && header.kid && await tryKeys(true))) return { ok: false };

      const c = json(parts[1]); const t = Math.floor(now() / 1000);
      if (typeof c.exp !== 'number' || c.exp + skewSeconds < t) return { ok: false };
      if (c.nbf !== undefined && (typeof c.nbf !== 'number' || c.nbf - skewSeconds > t)) return { ok: false };
      const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
      if (!aud.includes(audience)) return { ok: false };
      if (issuer && c.iss !== issuer) return { ok: false };
      if (c.role !== 'authenticated') return { ok: false };                      // the public anon key is not a person
      if (typeof c.sub !== 'string' || !UUID.test(c.sub)) return { ok: false };
      return { ok: true, userId: c.sub.toLowerCase(), email: typeof c.email === 'string' ? c.email : null };
    } catch { return { ok: false }; }
  };
}

// JWKS from the project's well-known URL; cached, refetched at most once a minute when an unknown kid appears.
export function createJwksProvider({ url, fetchImpl = fetch, ttlMs = 600_000, minRefreshMs = 60_000, now = () => Date.now() }) {
  let keys = [], fetchedAt = 0;
  const load = async () => {
    const r = await fetchImpl(url);
    if (!r.ok) throw new Error('jwks fetch failed');
    const { keys: jwks } = await r.json();
    keys = (jwks ?? []).filter((j) => j.kty === 'EC' || j.kty === 'RSA').map((jwk) => ({ alg: jwk.alg ?? (jwk.kty === 'EC' ? 'ES256' : 'RS256'), kid: jwk.kid, jwk }));
    fetchedAt = now();
  };
  return async ({ kid, refresh }) => {
    const age = now() - fetchedAt;
    if (!fetchedAt || age > ttlMs || (refresh && age > minRefreshMs)) { try { await load(); } catch { /* keep the old set */ } }
    return keys;
  };
}
