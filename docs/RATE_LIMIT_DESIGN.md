# Shared rate-limit store: design (prepared, not deployed)

## Problem
`packages/core/rate-limit.mjs` counts in the memory of one server instance. On Cloudflare Pages Functions, requests land on many short-lived isolates that share no memory, so a person (or an attacker with one valid account) gets the budget **per isolate**, not per minute overall. This matters for the `sensitive` class (invitations: 5 per minute) and `write` (30 per minute). It does not matter much for `read`.

## Options considered
| Option | Strongly consistent | Free tier | Extra moving parts | Verdict |
|---|---|---|---|---|
| In-memory only (today) | No | Free | none | Fine locally; leaks budget on Pages |
| Cloudflare KV counters | No (eventually consistent, ~60 s) | Limited writes (1,000/day free) | binding | Too weak and too small |
| Cloudflare Rate Limiting binding | Per location, not global | Beta, plan-dependent | binding, Workers config | Good extra layer later; not global |
| Durable Object per person | Yes | Free tier exists | A separate Worker project and binding; Pages Functions cannot define them | More infrastructure than the problem needs |
| **Postgres counter table** | **Yes (one atomic upsert)** | **Free (we already have the database)** | one table, one function | **Chosen** |

## Design (built, tested, off by default)
- Migration `0009_rate_limit_store.sql`: `private.api_rate_limits (key, cls, window_start, hits)` (UNLOGGED: no write-ahead cost, may reset after a crash, which only forgives a minute of history) and `private.rate_limit_take(key, class, max, window_seconds)`: **one atomic `INSERT … ON CONFLICT DO UPDATE`** returning allowed / retry time. The count is capped at max+1 so a flood cannot grow it. About 1% of calls also delete counters older than an hour: no scheduler needed.
- Privacy: the key is `u:` + the first 40 hex characters of SHA-256 of the user id. The table never holds a user id or an e-mail.
- Not reachable from the browser: it is in the `private` schema, revoked from PUBLIC, and tested (RS7) to be uncallable by the request role. The server calls it on its own connection, not inside a user's request transaction.
- `packages/core/rate-limit-store.mjs`: `createTieredLimiter({ local, shared })`. The in-memory limiter answers first (stops a burst on one isolate at no cost). Only `write` and `sensitive` also consult the shared counter. **Reads never cost a database round trip.**
- Failure policy: if the shared store errors, the in-memory answer stands, and `rate_store_unavailable` is logged (allowlisted field). Limits never switch off; the service never blocks on the limiter.
- `packages/core/server.mjs`: `RATE_LIMIT_STORE=postgres` turns it on. **Default is off.** Nothing is deployed or enabled by this repository.

## Evidence (`test/rate-limit-store.test.mjs`, 13 checks, PGlite and real Postgres)
Allows exactly the configured count, blocks with a retry time; per person and per class; cap; window reset; hashed keys only; nonsense limits refused; browser role cannot call or read; self-cleaning; reads never touch the store; the in-memory limiter stops floods before the database is asked; store failure falls back. **RS12:** two API instances with separate memory share one budget (5 per minute in total). **RS13 (control):** the same traffic through memory-only limiters is never limited, which is the gap this closes.

## Cost on the free tier
One extra tiny statement per write or sensitive request (reads: none). At the foreseeable internal volume (a handful of people) this is negligible against the database's limits. If volume ever grows, move the shared tier to a Durable Object or the Cloudflare Rate Limiting binding behind the same two-method interface; callers do not change.

## Go-live (needs owner approval with the rest of go-live)
Apply 0009 with the other migrations, set `RATE_LIMIT_STORE=postgres` as an encrypted Pages variable, confirm `DATABASE_URL` points at the session pooler. Known limit: atomicity is guaranteed by the single-statement upsert; the test suite exercises it on one connection, so a concurrency load test belongs in the staging run.
