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
- Export the existing `application-office` project with `scripts/export-project.sh` and verify it with `DUMP_FILE=… npm run drill:restore` (docs/INFRASTRUCTURE.md); store the encrypted export offline.
- Decide the project slot: a **new** project for the ecosystem (recommended; `application-office` stays as it is).
*Undo:* nothing was changed.

## 4. Create the Supabase project and apply the database (owner + assistant)
1. Create the project in the region from step 0; strong database password into the password manager; no extra add-ons.
2. Apply `migrations/0001` … `0015` **in order** through the session pooler connection (one transaction per file; stop on the first error). The same order is used by `npm run stack:migrate` locally.
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
- **Fonts:** Hanken Grotesk, Schibsted Grotesk and Newsreader are self-hosted from `apps/web/fonts` (licences in `LICENSES.txt`); nothing loads from a font service, and the policy allows only the site's own files. Confirm after deploy that the page loads no request to any other host.
- Custom domain = the office address from step 2.
*Check:* `GET /api/health` answers `{"ok":true}`; the page loads with the correct fonts; the browser console shows no policy violation. *Undo:* in Pages, roll back to the previous deployment or delete the project; DNS record removal takes the site offline.

## 9. Smoke tests and security proof (assistant, read-only on live)
1. `/api/health` ok; sign-in page renders; wrong password is refused; a signed-out call to any `/api/*` operation answers 401 `session_expired`.
2. With the publishable key and **no** token, and again with a token of a test user, the direct Data API calls from step 4 (b) are refused (table reads, writes, rpc, GraphQL, the `private` schema).
3. Run the local suites against a **copy** (not live data): `npm run test:all` already covers rules; for live, only the read-only checks above and a single owner sign-in are run. Do not run the data-writing e2e suites against the live project.
4. Cross-organization check once a second organization exists: a member of one cannot read the other (use two test members; remove them afterwards).
*Undo:* not needed (read-only).

## 10. Backups (owner + assistant)
- Create the GitHub secrets `SUPABASE_DB_URL` (session pooler) and `AGE_RECIPIENT` (the public key of an age key pair; the private key stays offline with the owner).
- Rename `.github/workflows/backup.yml.disabled` to `backup.yml`; run it once by hand.
- **Restore test:** download the artifact, decrypt with the private key, restore into a local PostgreSQL with `pg_restore`, compare table row counts, run `npm run drill:restore` against it. A backup that has not been restored is not a backup.
*Undo:* rename the file back. Note: files in Storage are **not** in the database dump (Drive backup is planned work).

## 11. Keep-alive (owner)
Free Supabase projects pause after 7 idle days. Add secrets `SITE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, rename `.github/workflows/keepalive.yml.disabled` to `keepalive.yml`. **Unverified [V15]:** whether these calls count as activity; check the dashboard after a week and, if the project still shows "inactive soon", move to the paid plan (about US$25 a month) or add a database-touching health call (small API change, needs approval).
*Undo:* rename back.

## 12. First sign-in, bootstrap, team (owner)
1. The owner signs up with the owner e-mail (or Google) and confirms.
2. Assistant runs `seed/bootstrap.sql` for that user (creates the organization and owner membership; only the owner's address is named in it; read it before running).
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
