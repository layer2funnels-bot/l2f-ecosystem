// T16 rate limiting. Fixed window per key, in memory (one free-tier server; swap the store later without changing callers).
// Classes keep cheap reads from starving sensitive actions, and sensitive actions get a very small budget.
export const DEFAULT_LIMITS = Object.freeze({
  read: { max: 120, windowMs: 60_000 },
  write: { max: 30, windowMs: 60_000 },
  sensitive: { max: 5, windowMs: 60_000 },   // invitations: creating and accepting
});

export function createRateLimiter({ limits = DEFAULT_LIMITS, now = Date.now, maxKeys = 10_000 } = {}) {
  const buckets = new Map();
  const prune = (t) => { for (const [k, b] of buckets) if (b.resetAt <= t) buckets.delete(k); };
  return {
    // -> { allowed: true } | { allowed: false, retryAfterSeconds }
    take(key, cls) {
      const rule = limits[cls];
      if (!rule) throw new Error(`unknown rate-limit class: ${cls}`);   // programming error, caught at definition time
      const t = now();
      if (buckets.size >= maxKeys) prune(t);
      const k = `${cls}|${key}`;
      let b = buckets.get(k);
      if (!b || b.resetAt <= t) { b = { count: 0, resetAt: t + rule.windowMs }; buckets.set(k, b); }
      if (b.count >= rule.max) return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((b.resetAt - t) / 1000)) };
      b.count += 1;
      return { allowed: true };
    },
    size: () => buckets.size,
  };
}
