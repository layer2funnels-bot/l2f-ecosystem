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
