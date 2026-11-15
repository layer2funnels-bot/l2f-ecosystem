# Performance report — quality recovery (15 Nov 2026)

## How it was measured
- **Live, before:** `office.tabishriaz.com`, Chromium from the build machine, empty cache, sign-in page; Cloudflare Analytics (Pages Functions) for the API.
- **Before / after, same conditions:** `scripts/perf-measure.mjs` — real Chromium against the local stack, throttled with Chrome DevTools to a
  **150 ms round trip and 10 Mbit/s**, a signed-in owner going sign-in → Launcher → Office → Avatars → Tasks → reload. “Before” = the source
  as the live site serves it today (unbundled; it already includes the lazy app loading below, so the true before is worse — see the live row).
  “After” = the production build (`WEB_ROOT=dist/web`). Byte counts are uncompressed (the local server does not gzip; Cloudflare does).

## What was slow, and why
| # | Problem | Evidence |
|---|---|---|
| P1 | The sign-in page and every first load fetched **every app's code** (Docs, Sheets, PDF and image editors, Drive, Clients, Portal, Forms, Social…) | live: 73 scripts + 24 stylesheets before anything showed; DOMContentLoaded 4.95 s |
| P2 | **No bundling, no minifying**: ~100 separate files, each a request, imported in a chain (module → its imports → theirs) | live: 73 script requests |
| P3 | **`Cache-Control: no-cache` on every file**: a returning visitor re-checks all ~100 files on every load | `apps/web/_headers` |
| P4 | A **154 KB Urdu font** downloaded on the sign-in page (no `unicode-range`), though no Arabic text is on it | live waterfall |
| P5 | **A new database connection for every API request** (Cloudflare Workers can't reuse one between requests): TLS + authentication to Supabase (Mumbai) each time | Cloudflare: API p50 **0.27 s**, p90 **0.58 s**, p99 0.69 s (314 production requests, 15 Nov) |
| P6 | The rate limiter adds one more query per request (shared counter in Postgres) | `RATE_LIMIT_STORE=postgres` |
| P7 | Small interaction costs: Documents fetched the SOP list once per protected section; `timer.running` answered 404 on every page | code / network log |
| P8 | **Perceived slowness from duplicates**: on a slow answer, a second Enter/click created a second task (production: 18 tasks, 5 distinct titles) | production data |

## What changed
| Fix | Files |
|---|---|
| Each app's code loads only when that app is opened (route-level lazy loading); a failed load offers “Try again” (reload) | `apps/web/js/app.js` |
| Production build bundles and minifies the app with **esbuild** (free) into content-hashed files; one stylesheet instead of 24; the first chunks are preloaded | `scripts/bundle-web.mjs`, `scripts/build-web.mjs`, `package.json` (devDependency) |
| `/assets/*` cached for a year (`immutable`; the name changes with the content); everything else still re-checked (no stale app after a deploy) | `_headers` written by the build |
| Urdu/Arabic fonts only download for Arabic-script text (`unicode-range`) | `apps/web/fonts.css` |
| One SOP request per Documents page; `timer.running` returns an empty answer | `office-docs.js`, `tasks-operations.mjs` |
| No duplicate creates (one create at a time; the capture box empties at once) | `modules/tasks.js` |
| Teammate switches no longer hit the 5/minute limit | `office-operations.mjs` |
| Dev server can serve the built site (`WEB_ROOT=dist/web`) so the browser suites test exactly what ships | `scripts/dev-server.mjs` |

## Measurements (150 ms round trip, 10 Mbit/s)
| Step | Before | After |
|---|---|---|
| Sign-in page, first visit | ready **2.61 s** · 66 requests (37 js, 24 css) · 1266 KB | ready **1.46 s** · 14 requests (8 js, 1 css) · 1015 KB |
| Sign-in page, returning visitor | 2.59 s · 66 requests | 1.43 s · 14 requests (on Cloudflare the 9 hashed files come from the browser cache: no request at all) |
| Sign in → Launcher | 0.84 s · 4 API calls | 0.85 s · 4 API calls |
| Launcher → Office Home (in-app, no reload) | 0.05 s | 0.07 s |
| Office → Customer Avatars (in-app) | 0.03 s | 0.06 s |
| Open Tasks (first time: its code + 10 data calls) | 1.32 s · 216 KB | 1.30 s · 139 KB |
| Reload on Tasks | **4.09 s** · 75 requests | **2.45 s** · 22 requests |
| Live sign-in page today (for reference) | DOMContentLoaded **4.95 s** · 73 scripts + 24 css | expected ≈ the “after” row once this is deployed — to be re-measured live after merge |

Navigation inside the app never reloads the page (hash routing); data calls made together are sent as one request (`/api/batch`, up to 4).

## Remaining bottlenecks (not fixed here)
1. **API latency (P5)** — every request still opens a new database connection (≈0.27 s median per request). The fix is **Cloudflare Hyperdrive**
   (connection pooling at the edge; included in the Workers Free plan) in front of Supabase. It needs the database connection string, which only
   the owner may enter (Cloudflare dashboard → Hyperdrive → Create → paste the Supabase *session pooler* string → bind it to the Pages project as
   `HYPERDRIVE`). The code is ready: `functions/api/[[route]].js` uses `env.HYPERDRIVE.connectionString` automatically when the binding exists (Free plan:
   100,000 queries/day; today's use is far below). Expected: 0.1–0.2 s off every API request.
2. Batch size stays **4**: the API already uses ≈9–16 ms CPU per request on the free plan's 10 ms budget (p50/p90); larger batches risk refusals.
3. The single stylesheet is 420 KB unminified-equivalent (≈60 KB gzipped). Splitting per app would shave the first paint further.
4. Tasks Today makes 10 data calls (3 batched requests); a single `tasks.today` projection could replace several.
