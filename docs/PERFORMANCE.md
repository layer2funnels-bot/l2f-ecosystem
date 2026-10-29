# Speed and reliability (29 Oct 2026)

## Why the apps feel slow or fail to load
Every API request opens a **new database connection** from Cloudflare to the database in Mumbai and closes it again
(`functions/api/[[route]].js`: the Workers runtime does not let one request reuse another's connection). Opening one costs several
network round trips and about **5 ms of the 10 ms CPU** that Cloudflare Free allows per request (DECISIONS V4-28). A screen that makes
ten requests pays that ten times; a request that goes over the CPU limit is stopped by Cloudflare, which the person sees as an error or a
page that never finishes. Measured from this environment: even an unauthenticated request that never reaches the database takes 0.4–0.7 s.

## Fixed in code (no cost, no settings change)
- **Batching** (`POST /api/batch`, `apps/web/js/api.js`): calls a screen makes together go out as one request — one connection — with
  up to 4 operations, each still checked, rate-limited and run in its own transaction. Every app gets it automatically.
- One shared token refresh when several calls find the session expired at once (the refresh token works once; parallel refreshes
  could sign the person out).
- Planner reuses the shell's organization list instead of loading it again.

| Planner first open (local stack, `scripts/e2e-planner.mjs`) | API requests |
|---|---|
| before | 11 |
| now | **5** (2 of them batches) |

Local time is unchanged (about 1.5 s; the local database is next door). The live gain is larger and still has to be measured on the live site.

## Needs the owner (Cloudflare settings)
| Option | Cost | What it fixes | Verified? |
|---|---|---|---|
| **A. Hyperdrive** (Cloudflare's connection pool, kept warm near the database) | $0 on the free plan (100,000 queries a day) | most of the connection time per request; probably part of the CPU | no — needs the live test |
| **B. Workers Paid** | $5 a month | the CPU limit (30 ms per request and more): no more requests stopped for CPU | certain |

Recommended: **A first**, then measure the live site for a day (failed requests, time per request); **B** only if requests are still being
stopped for CPU. Neither is set up today (checked: no Hyperdrive configuration exists on the account).

## Still to do (engineering, no decision needed)
- Measure the live site signed in (time per request, failures) before and after A.
- Load Planner's plan in the same batch as the plan list when the address already names the plan.
- The same request count check for the other apps' first screens.
