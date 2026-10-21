// Builds the whole server side from environment variables. Used by the local dev server and by the Cloudflare Pages Function.
//   DATABASE_URL            Postgres connection (Supabase session pooler in production, local stack in development)
//   SUPABASE_JWT_SECRET     legacy HS256 secret (local stack) — and/or —
//   SUPABASE_JWKS_URL       https://<project>.supabase.co/auth/v1/.well-known/jwks.json
//   SUPABASE_JWT_ISSUER     optional, e.g. https://<project>.supabase.co/auth/v1
import pg from 'pg';
import { createApi } from './api.mjs';
import { createHttpHandler } from './http.mjs';
import { createJwtVerifier, createJwksProvider } from './jwt.mjs';
import { createPgExecutor } from './pg-executor.mjs';
import { createSafeLogger } from './safe-log.mjs';
import { createRateLimiter } from './rate-limit.mjs';
import { createPgRateLimiter, createTieredLimiter } from './rate-limit-store.mjs';

export function createServer(env, { sink = (l) => console.log(JSON.stringify(l)) } = {}) {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (!env.SUPABASE_JWT_SECRET && !env.SUPABASE_JWKS_URL) throw new Error('SUPABASE_JWT_SECRET or SUPABASE_JWKS_URL is required');
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: Number(env.DB_POOL_MAX ?? 5) });
  const executor = createPgExecutor({
    role: env.DB_ROLE ?? 'app_user',   // NOT authenticated: that role has no privileges on our tables (migration 0010)
    acquire: async () => { const c = await pool.connect(); return { query: (s, p) => c.query(s, p), release: () => c.release() }; },
  });
  const logger = createSafeLogger(sink);
  // RATE_LIMIT_STORE=postgres shares counters across instances (migration 0009). Default: per-instance memory only.
  const local = createRateLimiter();
  const limiter = env.RATE_LIMIT_STORE === 'postgres'
    ? createTieredLimiter({ local, shared: createPgRateLimiter({ query: async (sql, p) => (await pool.query(sql, p)).rows }), onError: () => logger.log({ class: 'rate_store_unavailable' }) })
    : local;
  const api = createApi({ executor, logger, limiter });
  const jwks = env.SUPABASE_JWKS_URL ? createJwksProvider({ url: env.SUPABASE_JWKS_URL }) : null;
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
