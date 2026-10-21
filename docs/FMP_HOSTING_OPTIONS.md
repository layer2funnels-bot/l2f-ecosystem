# Funnel Mapper Pro hosting options (research only, nothing deployed, no cost) (22 Oct 2026)

## What it runs on today (read-only look)
- The account that owns the Vercel projects `funnel-mapper-demo` and `application-office` is a **personal-style account** named `layer2funnels-bot` (the Vercel connection lists **no team**). `docs/INFRASTRUCTURE.md` already records the `application-office` project as **Hobby**. The same account holds `funnel-mapper-demo`, so Funnel Mapper Pro is almost certainly on the **Hobby (free) plan**.
- I could not read the plan itself: that needs the owner to authorise team access in Vercel (an access change I did not make). **Please confirm in Vercel → Settings → Billing.**
- Vercel's Hobby plan terms limit it to **personal, non-commercial use**. An agency using it to present client funnels and run client work is commercial use. So if it is Hobby, the current hosting is outside its terms even though it works. (Check Vercel's current terms; this reflects them as known on this date.)
- Database: Supabase projects `funnel-mapper-demo` (active, London) and `funnel-mapper-pro` (paused, London), both on the free plan (the Supabase terms for free projects should be checked for commercial use too).

## Options
| Option | Monthly cost (check current prices) | Commercial use | Effort | Main risks |
|---|---|---|---|---|
| A. Stay on Vercel **Hobby** | $0 | **No** (personal, non-commercial) | none | Terms breach; Vercel may suspend a commercial project; no team features |
| B. **Vercel Pro** (one seat) | about $20 per seat, usage allowances included | Yes | none: same code, same host, change of plan only | Per-seat price grows with team; fine for 1 to 3 people |
| C. **Cloudflare Workers paid** (via the adapter tested in `docs/FMP_CLOUDFLARE_SPIKE.md`) | about $5 plus usage | Yes | 2 to 4 days: Next.js bump, replace the image route, test; one vendor with the ecosystem web app | Adapter support for the sign-in redirect file is "experimental"; bundle was 3.79 MiB compressed (needs the paid plan's 10 MiB limit) |
| D. Cloudflare Workers **free** | $0 | Yes (Cloudflare's free plan allows commercial use; verify) | as C plus slimming the bundle below 3 MiB and living with the small CPU limit | May not fit; pages may time out under load |
| E. Other free tiers (Netlify free, Render free web service) | $0 | Generally yes, but verify each | 1 to 3 days (adapters differ) | Render free instances sleep when idle (slow first load); Netlify free has monthly build/bandwidth credits; both are untested here |
| F. Small VPS (for example a 4 to 6 euro a month server) running the Node build | about $5 | Yes | 3 to 5 days plus ongoing server upkeep | You become the sysadmin: updates, backups, uptime |

"Free and commercial-allowed" alternatives exist (D, E) but each carries an effort or reliability cost; none is as low-risk as paying a few dollars.

## Recommendation
1. **Now:** confirm the Vercel plan. If it is Hobby and Funnel Mapper Pro is used for client work, either upgrade to **Vercel Pro (B)** (no code change, the least risk; cancel when it moves) or accept the terms risk knowingly for a short, named period.
2. **At the data migration** (docs/FMP_MIGRATION_PLAN.md): move to **Cloudflare Workers paid (C)** if the owner wants one vendor and about $5 a month; do not change hosting and data in the same step.
3. Do not take D to E unless the budget must stay at $0, and then only after a load test.

## Decisions for the owner
(1) The Vercel plan today (one fact). (2) Upgrade to Pro now, or run Hobby until the migration. Recommended: upgrade if client work is live.
