# Go-live pack: what exists, what to create, what needs the owner (23 Oct 2026)

| Resource | Exists now? | What is needed | Approval / action |
|---|---|---|---|
| Supabase project `l2f-ecosystem`, Mumbai (`ap-south-1`) | **No.** The organization has `funnel-mapper-demo` (active, eu-west-2) and two paused projects (`application-office`, `funnel-mapper-pro`). | Create one new project in organization `csatcbleolxxavnkteuf`, region `ap-south-1`, name `l2f-ecosystem`, free plan (one free slot is open because only one project is active). Cost must show $0 or creation stops. | **Owner approval to create** (a live resource). Then owner copies the DB password. |
| Supabase Auth settings | n/a | Confirm e-mail ON, site URL and redirect URL = office address, custom SMTP (Brevo). Dashboard only. | Owner (dashboard) |
| Cloudflare account | **Unknown / not reachable from here** (no Cloudflare credentials or tool in this environment). | Account, a Pages project connected to the repo (build in runbook step 8), an R2 bucket `l2f-ecosystem-files` (private) with `scripts/r2-cors.json`, an R2 API token limited to that bucket. | **Owner action** (creates the account/bucket) or gives a scoped API token; R2 may ask for a payment card to enable (unconfirmed): that is the owner's call, the free tier is $0 |
| Migrations 0001-0032 on the new project | No | `scripts/golive-apply-migrations.sh --apply` (tested locally) | **Owner approval to apply** |
| First owner, both organizations | No | `seed/bootstrap.sql` | after approval, after the owner's first sign-in |
| Apps switched on; 6 GB file cap | No | `scripts/golive-activate-apps.sql` (Portal not included) | with the migrations approval |
| Client Portal | **Locked** (workspace switch off) | stays locked | Owner explicit approval only; Supabase terms question is undecided (owner chose not to contact Supabase), so use stays staff-only |
| Funnel Mapper Pro | untouched | none | none |

**Costs:** everything above is $0 on free tiers. Not bought and not to be bought without approval: Workers Paid ($5/month), Supabase Pro ($25/month). Known risk: Cloudflare Free allows 10 ms CPU per request and a database connection costs about 5 ms of CPU (DECISIONS V4-28/29); the live test decides. If requests fail with "exceeded CPU", the options are Hyperdrive (free, unverified effect) or Workers Paid (needs approval).

**Terms:** the owner decided not to contact Supabase. Consequence: the Supabase Free plan stays internal-staff use only; no testers or clients on the live project until the owner changes that decision.


## Verified status after the owner created the resources (23 Oct 2026, read-only checks)
- **Supabase `l2f-ecosystem`**: exists, ref `dfitnxilkezepkhdmzuh`, region **ap-south-1 (Mumbai)**, ACTIVE_HEALTHY, Postgres 17.11, free organization, **empty** (no tables, no migrations). The other three projects are unchanged. Auth settings read from the public endpoint: e-mail confirmation is **ON** (autoconfirm off, required), Google off, sign-up enabled, signing keys ES256 (JWKS reachable). Browser-safe publishable key: `sb_publishable_086jMHSlwdsjwrFy5eWjkA_UjuKZrox` (not secret).
- **Cloudflare**: account exists; **R2 enabled, no bucket yet**; no Workers/Pages deployed. Cloudflare tools here can read and create buckets but nothing has been created.
- A production build with the real project values succeeds (`dist/web`, page policy allows only that project).

## Cloudflare Pages: exact values for the wizard (use "Pages" > "Connect to Git", not a Worker project: `functions/` and `wrangler.toml` are a Pages setup)
- Repository `layer2funnels-bot/l2f-ecosystem`, production branch `main`, project name `l2f-ecosystem`. Framework preset **None**. Root directory `/`.
- Build command `npm ci --prefix apps/whiteboard && npm ci --prefix apps/sheetjs && node scripts/build-web.mjs`; build output directory `dist/web`.
- Build variables: `NODE_VERSION=22`, `SUPABASE_URL=https://dfitnxilkezepkhdmzuh.supabase.co`, `SUPABASE_PUBLISHABLE_KEY=sb_publishable_086jMHSlwdsjwrFy5eWjkA_UjuKZrox`, `STORAGE_CONNECT_ORIGIN=https://<your 32-character account id>.r2.cloudflarestorage.com` (the Account ID is on the R2 overview page; this lets the browser reach the bucket, and nothing else).
- One sign-in for every app (FM-10), build variables: `COOKIE_DOMAIN=.tabishriaz.com`, `APP_ORIGINS=https://fmp.tabishriaz.com` (Funnel Mapper runs at fmp.tabishriaz.com: `apps/funnel-mapper/wrangler.production.jsonc`, `npm run cf:deploy`).
- Runtime variables (encrypted; `nodejs_compat` comes from `wrangler.toml`): `SUPABASE_JWKS_URL=https://dfitnxilkezepkhdmzuh.supabase.co/auth/v1/.well-known/jwks.json`, `SUPABASE_JWT_ISSUER=https://dfitnxilkezepkhdmzuh.supabase.co/auth/v1`, `RATE_LIMIT_STORE=postgres`, `DATABASE_URL` (session pooler string, needs the database password only the owner has), `STORAGE_DRIVER=s3`, `S3_ENDPOINT=https://<account id>.r2.cloudflarestorage.com`, `S3_REGION=auto`, `S3_BUCKET=l2f-ecosystem-files`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (an R2 token limited to that bucket).
- Connecting the repository starts a build and publishes it to a `*.pages.dev` address. That is a production deployment, so it waits for the owner's approval, and the database must be migrated first or the app shows errors.

## Finishing the database (resume script)
The live project `l2f-ecosystem` holds migration 0001 and the first half of 0002 (the Supabase connector cannot run statements containing DROP). `scripts/golive-resume-0002-0032.sql` finishes 0002 and applies 0003-0032 in order, all-or-nothing, and refuses to run unless the project is empty and in exactly that half-migrated state. Run it once in the Supabase SQL Editor (confirm the editor's "destructive" warning: it only replaces policies/constraints). Validated on a throw-away Postgres 17.11: result is identical to a clean 0001-0032 run (65 tables, 262 policies, RLS forced everywhere, no grants to anon/authenticated/PUBLIC). Afterwards `scripts/golive-activate-apps.sql` activates apps (Client Portal stays off).
