# Spike: can Funnel Mapper Pro run on Cloudflare? (21 Oct 2026)

**Short answer:** it builds and serves pages on Cloudflare's runtime locally, but not as-is. Four things need a decision or work before it is a real option. Nothing was deployed, no Cloudflare account was touched, nothing was added to the repository: the test ran in a scratch copy outside it, with the local emulator only (`wrangler dev --local`).

## What was done
1. Copied `apps/funnel-mapper` (without `node_modules`) to a scratch folder, `npm ci` (513 packages).
2. Added `@opennextjs/cloudflare` 1.20.13 and `wrangler` (the adapter that turns a Next.js build into a Cloudflare Worker), a two-line `open-next.config.ts` and a small `wrangler.jsonc`.
3. `opennextjs-cloudflare build`, then `wrangler deploy --dry-run` (measures the package, uploads nothing), then `wrangler dev --local` and requests against it.

## What worked
- The production build completes and produces a Worker (`.open-next/worker.js`) plus static assets.
- The local Worker answers: `/login` 200 in 0.6 s (12.9 KB page); protected pages redirect to `/login` exactly as on Node (`/` → `/login`, `/funnels` → `/login`, `/share/x` → `/login?next=…`). So the sign-in redirect layer (the app's `proxy.ts`) did run.

## What needs a decision or work
| # | Finding | Effect |
|---|---|---|
| 1 | **Version clash.** The adapter requires Next.js ≥ 16.4.1; the copy pins 16.3.8. The test forced the install (`--legacy-peer-deps`) and the build still worked. | Move Next.js to ≥ 16.4.1 first; then re-run the 279 unit tests and the browser suites. Small change, but a change to the copy's dependencies. |
| 2 | **Package size.** Dry run: 18.6 MiB total, **3.79 MiB compressed**. The free Workers plan allows 3 MiB compressed; the paid plan (about US$5 a month) allows 10 MiB. | Needs the paid plan, or a smaller bundle (the auto-layout engine `elkjs` and the PDF/image libraries are the large parts). |
| 3 | **The sign-in redirect file is "Node middleware", which the adapter calls experimental** ("not officially maintained … use at your own risk"). It worked for redirects in this test, but the real cookie refresh with Supabase was not exercised (no FMP database was connected). | Medium risk: this file decides who may see anything. It would move to the ecosystem sign-in during the migration anyway (docs/FMP_MIGRATION_PLAN.md), which removes the problem. |
| 4 | **Two server routes use the Node runtime and a native image library (`sharp`)**: `/api/image` (uploaded image processing) and `/api/capture` (thumbnails via an outside capture service). Native libraries cannot run in Workers. *Not tested here (needs sign-in); expected to fail.* | Replace image resizing with Cloudflare Images or resize in the browser; capture is only a `fetch` and probably works. Needs a small rewrite of one route. |

## Cloudflare Pages versus Workers
The owner chose "Cloudflare Pages". The adapter used here deploys to **Workers with static assets**, which is where Cloudflare now points new full-stack apps; Pages' own Next.js route (`next-on-pages`) was **not tested** and is limited to the Edge runtime, which this app's two Node routes do not use. For the ecosystem **web app** (plain static files) Pages is fine and unchanged; for Funnel Mapper Pro the realistic target is a Worker. This is a wording and account question for the go-live runbook, not a code one.

## Cost (indicative, check current prices before deciding)
Workers Paid about US$5 a month per account including generous request allowances; Pages static hosting for the ecosystem web app free. No cost was incurred.

## Verdict
Feasible with about 2–4 days of work (bump Next.js, replace the image route, re-test, set up the account) **or** keep Funnel Mapper Pro on its current host until it moves onto the ecosystem database, then decide. Recommendation: do not move hosting and data in the same step; decide hosting after the data migration.
