# Go-live runbook (prepared, **not run**) (21 Oct 2026)

Supersedes `docs/DEVELOPER_HANDOVER.md` §6 and the go-live bullet in §12. Nothing in this repository runs any of it. **Only the owner approves go-live, in one step**; each step below says what the owner does, how to check it, and how to undo it. Stop at the first failed check.

Status of the code at hand-over: all migrations `0001` to `0015` and the API/web app are tested locally (`npm run test:all`, `npm run test:e2e`, `npm run test:e2e:ui`); CI green on the last commit. Funnel Mapper Pro (FMP) is **not part of this go-live**: it keeps running where it is until its own approval (docs/FMP_MIGRATION_PLAN.md).

## Order at a glance
| # | Step | Who | Reversible by |
|---|---|---|---|
| 0 | Pre-flight checks | assistant | n/a |
| 1 | Accounts and two-factor sign-in | owner | n/a |
| 2 | Domain and e-mail DNS | owner | remove records |
| 3 | Back up what exists, decide the Supabase slot | owner | n/a (read-only) |
| 4 | Create the Supabase project, apply migrations | owner + assistant | delete project |
| 5 | Auth settings | owner | change back |
| 6 | E-mail (Brevo) | owner | switch SMTP off |
| 7 | Google sign-in | owner | switch provider off |
| 8 | Cloudflare Pages project and variables | owner | delete project / roll back deployment |
| 9 | Smoke tests and security proof against the live site | assistant | n/a (read-only) |
| 10 | Backups and a restore test | owner + assistant | disable workflow |
| 11 | Keep-alive ping | owner | disable workflow |
| 12 | First owner sign-in, bootstrap, invite the team | owner | deactivate members |
| 13 | Announce; watch the first week | owner | see "Emergency stops" |

> **Rehearsed** on the local stack (`npm run rehearsal:local`, report in `docs/GO_LIVE_REHEARSAL.md`): steps 4, 5 (as far as a repository can), 8, 9, 10, 11 and 12 pass; the gaps it lists (dashboard-only settings, Storage files not in the backup, restoring auth users, client-tool version) are owner checklist items below.

## 0. Pre-flight (no approval needed)
- `git status` clean; CI green on the commit to be deployed; `npm run test:all` passes locally; `node scripts/fmp-copy.mjs verify` passes.
- Record the commit id here before starting: `____________`.
- CloudPing: two more tests from the team's normal connections (the first gave Mumbai 71 ms, London 169 ms). Rule (docs/INFRASTRUCTURE.md §5): **Mumbai if the new tests agree, otherwise London**.

## 1. Accounts (owner)
GitHub (repository owner), Supabase, Cloudflare, domain registrar, Brevo, Google Cloud (OAuth client): each with two-factor sign-in and the recovery codes stored offline. Use a shared company mailbox, not a personal address, as the account owner where the service allows.
*Check:* each account logs in with the second factor. *Undo:* not applicable.

## 2. Domain and DNS (owner)
Choose the address for the office (for example `office.layer2funnels.com`; the subdomain keeps the marketing site untouched). Add Brevo's SPF and DKIM records for the sending address (Brevo shows the exact records) and a DMARC record in monitoring mode (`p=none`).
*Check:* Brevo shows the domain "authenticated". *Undo:* delete the added records.

## 3. Read-only preparation (owner approves the slot)
- **`application-office`: delete at go-live with owner approval.** The owner says it is not needed. It is not exported, paused or touched before then; deleting it frees the project slot. Delete only after the owner's explicit approval in that step (deletion cannot be undone).
- Decide the project slot: a **new** project for the ecosystem (recommended), or the slot freed by deleting `application-office`.
*Undo:* nothing was changed.

## 4. Create the Supabase project and apply the database (owner + assistant)
1. Create the project in the region from step 0; strong database password into the password manager; no extra add-ons.
2. Use database client tools of **version 17** (`pg_dump`, `pg_restore`, `psql`; CI checks this with `npm run check:pg17`). Apply `migrations/0001` … `0023` **in order** through the session pooler connection (one transaction per file; stop on the first error). The same order is used by `npm run stack:migrate` locally.
3. Do **not** run `seed/bootstrap.sql` yet.
*Check (read-only):* (a) `select count(*) from public.workspaces` is 0; (b) as the publishable (anon) key, `GET {project}/rest/v1/clients` is refused and `GET {project}/rest/v1/rpc/…` of any public function is refused (migration 0010 closed the Data API; the permanent test is `test/direct-access.test.mjs`, the HTTP proof is E-series in `scripts/e2e-local.mjs`); (c) the project list shows the intended region.
*Undo:* delete the project (it is empty at this point).

## 5. Auth settings (owner, in the Supabase dashboard)
| Setting | Value | Why |
|---|---|---|
| Site URL | the office address from step 2 | links in e-mails |
| Redirect URLs | the office address only (plus nothing for localhost) | no open redirect |
| Confirm e-mail | **on** | |
| Minimum password length | **10** | matches the approved sign-up design (`supabase/config.toml` uses 10; the old handover said 12, now superseded) |
| Sign-ups | on, because the approved sign-up screen exists; a new person has **no organization** until invited (screen "No workspace") | switch off here to make the system invitation-only |
| JWT signing | asymmetric keys on; copy the JWKS address and issuer for step 8 | the API verifies tokens without a shared secret |
| Rate limits | leave defaults, review after the first week | |
*Check:* sign up with a throw-away address: confirmation mail arrives, the app shows "No workspace", and **no data is visible**. Delete that user afterwards. *Undo:* set the values back.

## 6. E-mail through Brevo (owner)
Custom SMTP in Supabase Auth → host/port/user/key from Brevo, sender on the authenticated domain, name "Layer2Funnels Office". Brevo's free plan (300 mails a day) is enough for staff invitations. Until this is on, the invitation link shown to the inviter in the app is the only delivery route.
*Check:* send an invitation to yourself; it arrives, is not in spam, and the link works. *Undo:* turn custom SMTP off (Supabase's built-in sender then applies, with a very low hourly limit).

## 7. Google sign-in (owner)
Google Cloud → OAuth client (web); authorised redirect = the callback address Supabase shows; paste client id and secret into Supabase Auth → Google. Rebuild the web app with `GOOGLE_ENABLED=true` (step 8) so the button shows.
*Check:* sign in with Google as the owner. *Undo:* turn the provider off and rebuild without the flag.

## 8. Cloudflare Pages (owner creates the project; assistant supplies the values)
- Connect the private repository, branch `main` (or the commit recorded in step 0). Build command `node scripts/build-web.mjs`, output `dist/web`. `wrangler.toml` already carries `nodejs_compat`.
- **Build-time (browser-safe) variables:** `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (the publishable key only; the build refuses a secret or legacy JWT key), `GOOGLE_ENABLED=true`. The build rewrites the page security policy to allow only that project's address.
- **Encrypted runtime variables (API function):** `DATABASE_URL` (the **session pooler** string, role `postgres`; the API then runs every request as `app_user`), `SUPABASE_JWKS_URL`, `SUPABASE_JWT_ISSUER`, `RATE_LIMIT_STORE=postgres` (shared counters from migration 0009), optional `DB_POOL_MAX` (default 5; keep it small on the free plan).
- **Storage variables (runtime):** `STORAGE_DRIVER=supabase` with `STORAGE_URL` (the project address), `STORAGE_SERVER_KEY` (the project's server-side secret key; encrypted, never in the browser build) and `STORAGE_BUCKET` (a private bucket, e.g. `drive`). The hard application cap is 8 GB (`storage_settings`, migration 0023); at the limit uploads answer 507 `storage_limit` with a clear message. Usage is shown in Admin → Storage.
- **One server per request:** the function builds a database connection per request (Workers cannot reuse one across requests; found in the rehearsal, `docs/GO_LIVE_REHEARSAL.md`); `DB_POOL_MAX` is forced to 1 by the function.
- **Fonts:** Bricolage Grotesque, Geist, Geist Mono and Noto Nastaliq Urdu (Design v4) are self-hosted from `apps/web/fonts` (licences in `LICENSES.txt`); nothing loads from a font service, and the policy allows only the site's own files. Confirm after deploy that the page loads no request to any other host.
- Custom domain = the office address from step 2.
*Check:* `GET /api/health` answers `{"ok":true}`; the page loads with the correct fonts; the browser console shows no policy violation. *Undo:* in Pages, roll back to the previous deployment or delete the project; DNS record removal takes the site offline.

## 9. Smoke tests and security proof (assistant, read-only on live)
1. `/api/health` ok; sign-in page renders; wrong password is refused; a call with **no** sign-in answers "not found" and a call with a **bad or expired token** answers 401 `session_expired` (both checked in the rehearsal).
2. With the publishable key and **no** token, and again with a token of a test user, the direct Data API calls from step 4 (b) are refused (table reads, writes, rpc, GraphQL, the `private` schema).
3. Run the local suites against a **copy** (not live data): `npm run test:all` already covers rules; for live, only the read-only checks above and a single owner sign-in are run. Do not run the data-writing e2e suites against the live project.
4. Cross-organization check once a second organization exists: a member of one cannot read the other (use two test members; remove them afterwards).
*Undo:* not needed (read-only).

## 10. Backups (owner + assistant)
- Create the GitHub secrets `SUPABASE_DB_URL` (session pooler) and `AGE_RECIPIENT` (the public key of an age key pair; the private key stays offline with the owner).
- Rename `.github/workflows/backup.yml.disabled` to `backup.yml`; run it once by hand.
- **Restore test:** download the artifact, decrypt with the private key, restore into a local PostgreSQL with `pg_restore`, compare table row counts, run `npm run drill:restore` against it. A backup that has not been restored is not a backup.
- **Storage backup (files):** `scripts/backup-storage.mjs` (job `storage-files` in the same workflow) reads every stored object, cross-checks the database's list of files, writes a SHA-256 manifest and one `age`-encrypted archive. Same `AGE_RECIPIENT` and `SUPABASE_DB_URL` secrets plus the storage variables from step 8 (as secrets). The archive is a GitHub artifact limited by `BACKUP_MAX_BYTES` (default 400 MB). Exit codes: 0 ok · 1 failed · 3 a registered file is missing from storage (archive still written) · 4 over budget. For more than the budget, set `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` (and `BACKUP_S3_REGION`) to upload the archive to a second S3-compatible bucket instead. Restore: `scripts/restore-storage.mjs`; rehearsed in `npm run rehearsal:local` (steps R10s–R10z).
*Undo:* rename the file back.

## 10a. Switch Drive files from Supabase Storage to Cloudflare R2 (later; owner creates the account)
Nothing here is done now: no Cloudflare account or card exists. The adapter (`packages/core/storage-adapter.mjs`) already speaks S3 (SigV4), tested against a fake S3 server and real local Supabase Storage. **Unverified against real R2:** presigned PUT signs `content-length`; run the smoke test in step 5 before trusting it.
1. Owner: create the Cloudflare account and an R2 bucket (private); create an R2 API token limited to that bucket (Object Read & Write); note the account endpoint `https://<account>.r2.cloudflarestorage.com`.
2. Set runtime variables: `STORAGE_DRIVER=s3`, `S3_ENDPOINT`, `S3_REGION=auto`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`. Add the bucket's CORS rule for the office address (PUT, GET).
3. Copy existing objects (same keys) from Supabase Storage to R2 (`rclone` or a small script using the adapter's `list/get/put`); compare counts and bytes with Admin → Storage.
4. Run `node scripts/storage-smoke.mjs` with the new variables (upload, download, size check, delete). Then run the storage backup once and restore it (step 10).
5. Redeploy with the new variables; keep the old bucket read-only for 30 days, then delete with owner approval.
*Undo:* set `STORAGE_DRIVER=supabase` again (the old bucket is untouched during the 30 days).

**Cloudflare R2 usage-alert checklist (owner):** R2 free tier is 10 GB storage, 1 M Class A and 10 M Class B operations per month; the application cap is 8 GB, but a second backup copy in the same account would count too. (1) Dashboard → Notifications: add alerts for R2 usage if offered for the account; (2) check R2 → Metrics weekly for storage and operations; (3) compare with Admin → Storage (alert point 80 % of 8 GB); (4) never enable a paid plan or add a card without the owner's decision; (5) if usage approaches 10 GB, lower the cap or delete trash from Drive.

## 10b. Dashboard-only settings (cannot be set by migrations or code) — owner checklist
Menu names change; if one is not found, search the Supabase docs for the setting name.
- [ ] Authentication → Sign In / Providers → Email: **Confirm email** on; **Minimum password length 10**.
- [ ] Authentication → URL Configuration: **Site URL** = office address; **Redirect URLs** = office address only.
- [ ] Authentication → Providers → Google: enable only after step 7; client id and secret from Google.
- [ ] Authentication → Sign In / Providers: **Allow new users to sign up** per the step 5 decision.
- [ ] Authentication → Emails (SMTP settings): Brevo SMTP host, port, user, key; sender on the verified domain.
- [ ] Authentication → Rate limits: defaults.
- [ ] Project Settings → API (or JWT Keys): asymmetric signing keys on; copy JWKS address and issuer.
- [ ] Project Settings → Data API: Data API may stay on because migration 0010 revokes all grants; confirm `public` tables return nothing to the publishable key (step 4 check b).
- [ ] Storage → New bucket: private bucket named as `STORAGE_BUCKET`, **not** public; set the file size limit per file as wanted.
- [ ] Project Settings → Database: note the session pooler connection string for `DATABASE_URL` and `SUPABASE_DB_URL`; confirm the Postgres version is 17 or newer.
- [ ] Project Settings → Database → Backups: note that free projects have no managed restore; our nightly job (step 10) is the backup.
- [ ] Organization → Billing: stay on the plan the owner chose; no add-ons; spend cap on.
- [ ] Cloudflare Pages: environment variables from step 8 (encrypted ones as secrets), custom domain.
- [ ] GitHub → Settings → Secrets: `SUPABASE_DB_URL`, `AGE_RECIPIENT`, storage variables, `SITE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `FMP_READ_TOKEN` (nightly FMP job).

## 11. Keep-alive (owner)
Free Supabase projects pause after 7 idle days. Add secrets `SITE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, rename `.github/workflows/keepalive.yml.disabled` to `keepalive.yml`. **Unverified [V15]:** whether these calls count as activity; check the dashboard after a week and, if the project still shows "inactive soon", move to the paid plan (about US$25 a month) or add a database-touching health call (small API change, needs approval).
*Undo:* rename back.

## 12. First sign-in, bootstrap, team (owner)
1. The owner signs up with the owner e-mail (or Google) and confirms.
2. The owner runs `seed/bootstrap.sql` in the Supabase SQL editor with `:owner_id` replaced by that user's id (Authentication → Users). It creates the two organizations (Layer2Funnels and Aurj), makes the owner their owner, and adds the Funnel Mapper Pro Launcher tile to Layer2Funnels with **no address yet** (the tile shows "not set up here" until its live address is entered; that happens with the FMP approval). Read it before running; it is the only statement that creates organizations.
3. Owner opens Admin → Members and Access and invites each person with a role. Until e-mail is working the invitation link is shown to the inviter.
4. Verify the Launcher tiles for an Editor and a Viewer by signing in as a test member; deactivate the test members.
*Check:* an invited person sees only what their role allows (Effective access page). *Undo:* deactivate members; delete the organization row only with the owner's recovery procedure (`platform.access.review`).

## 13. Announce and watch (owner)
Tell the team the address; keep Supabase logs and Cloudflare analytics open for the first week; look daily at: failed sign-ins, API 5xx, rate-limit answers (429), the audit log for unexpected changes, the backup job result.

## Emergency stops (anytime, owner)
| Problem | Action |
|---|---|
| Bad deployment | Cloudflare Pages → Deployments → roll back to the previous one (about a minute) |
| Suspected account misuse | Supabase → Authentication → sign out all sessions of the user; deactivate the member in Admin; rotate the password |
| Suspected key leak | Rotate the publishable and JWT signing keys in Supabase; update Pages variables; redeploy |
| Data damage | Stop writes (set `RATE_LIMIT_STORE` unchanged; switch the Pages project to a "maintenance" deployment), restore the latest backup into a **new** project, compare, then switch the variables |
| Need invitation-only | Supabase → Auth → turn sign-ups off |

## Approvals needed (owner)
Each of steps 1, 3 (slot), 4, 5, 6, 7, 8, 10, 11 and 12 changes something outside this repository; the owner approves go-live **once**, after step 0, and the steps run in order with the checks above. The assistant does not create or change any live project, domain, account or key.

## Not covered here
Funnel Mapper Pro hosting and data (separate approvals: docs/FMP_MIGRATION_PLAN.md, docs/FMP_CLOUDFLARE_SPIKE.md); the independent-account sign-up path; Drive file storage buckets and their backup; the design-awaiting areas (Clients redesign, Funnel Strategies).
