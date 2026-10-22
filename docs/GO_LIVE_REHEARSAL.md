# Go-live rehearsal on the local stack (22 Oct 2026)

Run: `npm run stack:start && npm run stack:migrate && npm run rehearsal:local` (also a step in CI, job `e2e`). Everything is local: throw-away databases `rehearsal` and `rehearsal_restore`, fake live-shaped build settings, no connection to any live service. It follows `docs/GO_LIVE_RUNBOOK.md`: step 4 (fresh database and migrations), 5 (auth settings), 8 (build), 9 (smoke and security), 10 (encrypted backup, restore, compare), 11 (keep-alive), 12 (bootstrap). Result: **34 checks pass, 0 fail, 4 gaps** that cannot be closed on a laptop. Two real defects were found and fixed.

## Defects found and fixed
1. **The Pages function would have failed on Cloudflare after the first request.** In Cloudflare's real runtime (run locally with wrangler, no deploy) the first call worked and later calls intermittently died with "the Worker's code had hung": the Workers runtime does not allow a request to reuse a database connection opened by an earlier one, and the function kept one pool for all requests. **Fix:** `functions/api/[[route]].js` now builds a server (one connection) per request and closes it with `waitUntil`; only state that holds no connection (rate-limit counters, cached signing keys) is shared (`createSharedState`). Checked afterwards: 6 reads and 3 writes in a row, all 200, no hang, shared rate-limit counters written. A static check in the rehearsal keeps it that way (R8h). This would have been the first thing to break on go-live day.
2. **The shared rate-limit store could silently do nothing.** The API calls `private.rate_limit_take` on its own database login (`postgres` on Supabase); where migrations are applied by another admin role (the local stack's `supabase_admin`) that login had no right to run it and the limiter quietly fell back to per-instance counting. **Fix:** migration `0022_rate_limit_grant.sql` grants it explicitly; the rehearsal now fails if the server ever logs the fallback (R9i).

## What passed
- Migrations `0001` to `0022` apply in order to an **empty database on the real Supabase Postgres**; nothing exists before the owner signs in; the Data API roles hold **no** privilege on any table or function of `public` and `private` (R4a to R4d).
- `seed/bootstrap.sql` creates both organizations with the owner in both, the Funnel Mapper Pro tile on with no address, the Client Portal OFF; a second run cannot duplicate them; 238 row-security policies are present (R12).
- Build for a live-shaped project: refuses a secret key; the page policy names only our site and that project (no localhost); the built site loads nothing from any other host; `config.js` holds only the public URL and key; the three self-hosted font families are in the build; the function and `nodejs_compat` flag are present (R8).
- Smoke tests through the same handler Cloudflare runs, shared rate-limit store ON: health answers with no login; security headers present; signed-out call refused; a bad token answers "session expired"; the Data API with only the public key reads nothing and cannot call our functions; a brand-new sign-up (not invited) lists no organization and every organization operation is "not found" (R9).
- Keep-alive workflow's two calls work (R11).
- **Backup and restore:** the backup script writes one encrypted file; it contains no plain database text; decrypting with the private key gives both dumps; restoring into a fresh database gives the **same row count in all 58 tables** of `public` and `private`, the same 238 policies, and the Data API roles still cannot run our functions (R10).

## Gaps the rehearsal cannot close (owner checklist, runbook updated)
| # | Gap | What to do |
|---|---|---|
| G1 | **Dashboard settings are not in the repository**: e-mail confirmation ON (local config has it OFF for the automated tests), redirect URLs, JWT signing keys, SMTP, Google. | Follow runbook step 5 to 7 and run the smoke tests (step 9) against the live site afterwards. |
| G2 | **Files in Storage and project settings are not in the backup** (database and auth users only). | Known; Drive file backup is planned work. Do not store real client files before that, or accept the risk knowingly. |
| G3 | **Restoring `auth.users` into a new project** needs the same auth schema version; not testable locally. | Do the restore test once on the live project right after step 4 (empty project) with a throw-away user. |
| G4 | **This sandbox's `pg_dump` is version 16, Supabase is 17.** The rehearsal ran PostgreSQL 17's own tools inside the database container; CI and the backup job install version 17 client tools. | On the owner's computer use PostgreSQL 17 client tools for `export-project.sh`. |

## Runbook corrections made from this rehearsal
- Step 9 said a signed-out call answers 401 "session expired". Actual (and intended): a call with **no** sign-in is "not found" (indistinguishable from a missing operation); only a **bad or expired token** answers 401 `session_expired`.
- Step 8 now states the one-server-per-request design and that connections to the pooler are per request.
- Step 4 now includes migration `0022`.
- Restoring a dump needs a database owned by the restoring login (`postgres` on Supabase); a fresh Supabase project already is.
