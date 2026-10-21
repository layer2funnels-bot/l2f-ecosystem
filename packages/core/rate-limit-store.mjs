// Shared (Postgres) rate limiting, PREPARED and off by default (RATE_LIMIT_STORE=postgres turns it on; see docs/RATE_LIMIT_DESIGN.md).
// Layered: the cheap in-memory limiter answers first (it stops bursts on one instance with no database cost); only write and
// sensitive classes also consult the shared counter, so reads never cost a database round trip. If the shared store is
// unreachable the in-memory answer stands (limits never switch off, service never blocks on the limiter).
import { createHash } from 'node:crypto';
import { DEFAULT_LIMITS } from './rate-limit.mjs';

// keys are hashes: the table never holds a user id
export const hashKey = (userId) => `u:${createHash('sha256').update(String(userId)).digest('hex').slice(0, 40)}`;

export function createPgRateLimiter({ query, limits = DEFAULT_LIMITS, onError = () => {} }) {
  return {
    // query(sql, params) -> rows, on the server's own connection (NOT a request role)
    async take(userId, cls) {
      const rule = limits[cls]; if (!rule) throw new Error(`unknown rate-limit class: ${cls}`);
      const [r] = await query('select allowed, retry_after_seconds from private.rate_limit_take($1, $2, $3, $4)', [hashKey(userId), cls, rule.max, Math.max(1, Math.round(rule.windowMs / 1000))]);
      return r.allowed ? { allowed: true } : { allowed: false, retryAfterSeconds: r.retry_after_seconds };
    },
  };
}

export function createTieredLimiter({ local, shared, sharedClasses = ['write', 'sensitive'], onError = () => {} }) {
  return {
    async take(userId, cls) {
      const first = local.take(userId, cls);
      if (!first.allowed || !sharedClasses.includes(cls)) return first;
      try { return await shared.take(userId, cls); } catch (e) { onError(e); return first; }   // store down: keep the local answer
    },
  };
}
