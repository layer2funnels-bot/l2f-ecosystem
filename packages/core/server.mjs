// Builds the whole server side from environment variables. Used by the local dev server and by the Cloudflare Pages Function.
//   DATABASE_URL            Postgres connection (Supabase session pooler in production, local stack in development)
//   SUPABASE_JWT_SECRET     legacy HS256 secret (local stack) — and/or —
//   SUPABASE_JWKS_URL       https://<project>.supabase.co/auth/v1/.well-known/jwks.json
//   SUPABASE_JWT_ISSUER     optional, e.g. https://<project>.supabase.co/auth/v1
import pg from 'pg';
// A plain date (due dates, start dates) stays a plain 'YYYY-MM-DD' string. Left to the driver it becomes a midnight timestamp
// ('2030-05-01T00:00:00.000Z'), which date fields in forms cannot show, and which can move a day in another time zone.
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);
import { createApi } from './api.mjs';
import { createHttpHandler } from './http.mjs';
import { createJwtVerifier, createJwksProvider } from './jwt.mjs';
import { createPgExecutor } from './pg-executor.mjs';
import { createSafeLogger } from './safe-log.mjs';
import { createRateLimiter } from './rate-limit.mjs';
import { createPgRateLimiter, createTieredLimiter } from './rate-limit-store.mjs';
import { storageFromEnv } from './storage-adapter.mjs';
import { createWeather } from './weather.mjs';

// State with no open connections in it (rate-limit counters, the cached signing keys). A runtime that forbids reusing connections between requests
// (Cloudflare Workers) builds this ONCE and a fresh server per request; everything else may ignore it.
// Weather: on unless WEATHER=off. MET Norway wants an identifying User-Agent with a contact: WEATHER_USER_AGENT (the default names the project).
export function weatherFromEnv(env, fetcher) {
  if (env.WEATHER === 'off') return null;
  return createWeather({ userAgent: env.WEATHER_USER_AGENT || 'Layer2FunnelsAurjOffice/1.0 layer2funnels@gmail.com', ...(fetcher ? { fetcher } : {}) });
}
export function createSharedState(env, { limits, weatherFetch } = {}) {
  return { weather: weatherFromEnv(env, weatherFetch), local: createRateLimiter(limits ? { limits } : {}), jwks: env.SUPABASE_JWKS_URL ? createJwksProvider({ url: env.SUPABASE_JWKS_URL }) : null };
}

export function createServer(env, { sink = (l) => console.log(JSON.stringify(l)), limits, shared, weatherFetch } = {}) {      // `limits` is for tests that load a page many times; production uses the defaults
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (!env.SUPABASE_JWT_SECRET && !env.SUPABASE_JWKS_URL) throw new Error('SUPABASE_JWT_SECRET or SUPABASE_JWKS_URL is required');
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: Number(env.DB_POOL_MAX ?? 5) });
  const executor = createPgExecutor({
    role: env.DB_ROLE ?? 'app_user',   // NOT authenticated: that role has no privileges on our tables (migration 0010)
    acquire: async () => { const c = await pool.connect(); return { query: (s, p) => c.query(s, p), simple: (s) => c.query(s), escapeLiteral: (t) => c.escapeLiteral(t), release: () => c.release() }; },
  });
  const logger = createSafeLogger(sink);
  // RATE_LIMIT_STORE=postgres shares counters across instances (migration 0009). Default: per-instance memory only.
  const local = shared?.local ?? createRateLimiter(limits ? { limits } : {});
  const limiter = env.RATE_LIMIT_STORE === 'postgres'
    ? createTieredLimiter({ local, shared: createPgRateLimiter({ query: async (sql, p) => (await pool.query(sql, p)).rows }), onError: () => logger.log({ class: 'rate_store_unavailable' }) })
    : local;
  const api = createApi({ executor, logger, limiter, storage: storageFromEnv(env), weather: shared ? shared.weather : weatherFromEnv(env, weatherFetch) });
  const jwks = shared ? shared.jwks : (env.SUPABASE_JWKS_URL ? createJwksProvider({ url: env.SUPABASE_JWKS_URL }) : null);
  const hs = env.SUPABASE_JWT_SECRET ? [{ alg: 'HS256', secret: env.SUPABASE_JWT_SECRET }] : [];   // one object: its CryptoKey is cached
  const verifyToken = createJwtVerifier({
    getKeys: async (q) => [
      ...hs,
      ...(jwks ? await jwks(q) : []),
    ],
    issuer: env.SUPABASE_JWT_ISSUER || null,
  });
  return { handle: createHttpHandler({ api, verifyToken }), close: () => pool.end() };
}
