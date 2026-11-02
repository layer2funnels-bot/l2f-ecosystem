# Handoff for the next chat (updated 2 Nov 2026, after the onboarding work)

Read this first, then `docs/ONBOARDING.md`. Facts marked **verified** were checked in the repository or on the live systems on 2 Nov 2026.

## 1. Who you work for and how
- The owner is a non-technical founder. Pronouns not stated: use "they". Reports: short, plain English, Done / Blocked / Needs approval, evidence not claims, one next action.
- They want things done for them. Ask only for approvals and for things that need their own logins (Brevo, Supabase, Cloudflare dashboards).
- Budget **$0 a month**: free plans only (Supabase free, Cloudflare free, **Brevo free account**, GitHub). Never subscribe or buy without asking.
- Never ask for passwords, keys or tokens in chat. The database password was pasted in chat once (treat as exposed; resetting is the owner's decision; if reset, `DATABASE_URL` in Cloudflare must be updated).
- Do not merge, deploy, change live settings or run live database changes without the owner's explicit "yes" for that step. Wait for green CI before any merge.

## 2. The original problem of this round and what we found (verified)
The owner invited teammates and clients from Office. Nobody got an e-mail, and people who signed up through the link got no access.
Root causes (full table in `docs/ONBOARDING.md` §1):
1. The invitation was kept only in the browser tab (`sessionStorage`); the confirmation e-mail opens a new tab, so it was lost. Live database 2 Nov: 3 confirmed accounts, 2 open invitations never accepted.
2. No e-mail sending existed at all.
3. Invitations granted a fixed list of 5 apps; editors/viewers need a grant per app, so most apps were hidden from new teammates.
4. A person already in the organization who opened an invitation got an error.
5. No profile page.
6. Supabase's built-in e-mail (confirm e-mail, reset password) is only for testing on the free plan; custom SMTP (Brevo) is needed.

## 3. What is built (profiles: PR #38, merged 2 Nov; onboarding: the follow-up PR from branch `claude/exciting-dirac-kjybj0`)
- **Migration 0041 profiles** and **0042 invitation onboarding** (`migrations/`). 0042: `private.email_verified()` (auth.users.email_confirmed_at), `invitation_deliveries` table (status, provider, message id, short error; RLS, org_scope, admin-only read), `invitation_mail_facts`, `invitation_delivery_record`, `invitation_mark_opened`, `invitation_reissue` (resend with a fresh token), `my_invitations()` / `invitation_accept_mine(id)` / `invitation_decline_mine(id)` (verified e-mail only), one joining path `private.invitation_join` (already-members are let in without any role change; deactivated members are not reactivated by an invitation), `create_invitation` refuses duplicates and existing team members and grants every switched-on app by default, `members_list` and `client_access_list` show expiry and e-mail status.
- **API** (`packages/core`): `mailer.mjs` (Brevo, server side, 8 s timeout, "sent" only on 201 + message id), `invite-mail.mjs`, ops `invitation.create` (now e-mails), `invitations.resend`, `invitations.mine`, `invitation.accept_mine`, `invitation.decline_mine`, `mail.status`, `clients.access.invite` (now e-mails), `profile.get/update/photo`. The verified-e-mail flag travels from the JWT (`jwt.mjs` → `http.mjs` → `api.mjs` → `pg-executor.mjs` claims); the database prefers `auth.users`.
- **Web app**: invitations page for the signed-in person (no link needed), invitation token kept in local storage and on the confirmation link, Admin › Members (e-mail status, Expired, Resend / Send a new invitation, Cancel, "emails switched on/not yet" note), Admin › Client access (e-mail status, results), Your profile (`#/profile`: photo, name, e-mail change, password change with e-mailed code when required, sign out of all devices), header avatar photo, Team drawer photo.
- **Docs**: `docs/ONBOARDING.md` (root causes, design, settings, activation checklist, support steps).

## 4. Database and migration status (verified with the Supabase connector on 2 Nov)
- Live project `l2f-ecosystem`, ref `dfitnxilkezepkhdmzuh`. Live history ends at **`0040_planner_measure_cadence`** (0034–0040 were applied on 1 Nov by the other chat; the old `golive-0034-0041.sql` script was therefore removed: it would have refused to run anyway).
- To apply: **`scripts/golive-0041-0042.sql`** (0041 + 0042 + history rows, one transaction, guard refuses a wrong or already-updated database). Tested from a database at 0040 with an existing invitation: result identical to the full migration chain (tables 102, functions 243, policies 417, triggers 212, columns 1000), data kept, second run refused.
- Live data facts: 2 organizations (Layer2Funnels, Aurj), the owner is the only member of each; all apps active and enabled except the Client Portal (locked on purpose) and Layer 2 Agents (coming soon).

## 5. Tests (all local, 2 Nov)
- `DRIVERS=pglite npm test`: all suites, including new `test/invitations.test.mjs` (38) and `test/profiles.test.mjs` (14); `test/audit.test.mjs` 63 (RPC allow-list updated; INV8 now expects every switched-on app).
- `scripts/e2e-onboarding.mjs` (new, real browser, real local Supabase Auth, fake Brevo): **21/21**. Added to CI (`npm run test:e2e:onboarding`).
- `scripts/e2e-ui.mjs`: see the PR for the latest run. CI runs everything (`test`, `e2e`, `fmp-copy`).
- Not testable locally: real Brevo delivery, Supabase's own confirmation e-mail (the local stack has no mail server and auto-confirms). These are the production checks in `docs/ONBOARDING.md` §4.

## 6. What the owner must do (nothing else is blocking)
1. Approve and run `scripts/golive-0041-0042.sql` (Supabase SQL Editor), or tell the assistant to run it.
2. Approve merging the onboarding PR after step 1 (PR #38 with the profile screens is already merged, so step 1 is urgent: the live Team and profile pages need 0041).
3. Brevo: verify a sender (best on your own domain with DKIM/DMARC; a Gmail sender will be rejected by Gmail), create an **API key** and an **SMTP key**.
4. Cloudflare Pages (Production and Preview): `BREVO_API_KEY` (secret), `MAIL_FROM_EMAIL`, optional `MAIL_FROM_NAME`; then redeploy.
5. Supabase: Authentication › SMTP = Brevo (`smtp-relay.brevo.com`, 587); URL configuration (Site URL and `https://l2f-ecosystem.pages.dev/**`); Confirm email **on**.
6. Live test with a spare address (checklist in `docs/ONBOARDING.md` §4).

## 7. How to work in this repository
- Plain ES modules web app (`apps/web/js`), Planner React app (`apps/planner`, mounted in a shadow root), API as Cloudflare Pages Function (`functions/api/[[route]].js`), build `node scripts/build-web.mjs`.
- Branch `claude/exciting-dirac-kjybj0`; after a merge restart it from `origin/main`. Force pushes are blocked: if the remote branch only holds merged history, `git merge -s ours origin/claude/exciting-dirac-kjybj0` then push. Never use a bare `git stash`.
- Local stack: docker (`pkill dockerd; nohup dockerd &`), `npm run stack:start`, `npm run stack:migrate`; reset with `supabase db reset` + migrate before a full `scripts/e2e-ui.mjs` run. `PLAYWRIGHT_MODULE=/opt/node22/lib/node_modules/playwright`.
- `apps/web/ui.css` must not contain hex colours (design check DV20): use tokens. Check class names against `apps/web/v4.css` before inventing one (collisions caused bugs before).
- API body limit 16 KB (profile photos are kept under 12,000 characters). Read rate limit 300/min per person.
- Local debug scripts `scripts/_*.mjs` are ignored on purpose; do not commit them.

## 8. Never repeat or overwrite
- Never weaken organization isolation (`org_scope` on every table, nothing granted to `anon`/`authenticated`, API runs as `app_user`). UI hiding is never security.
- Never let an invitation be accepted without the database checking the e-mail (and, without the link, that it is verified). Never return tokens in lists, logs or delivery records.
- Never claim an e-mail was sent unless the provider accepted it.
- Never touch the original Funnel Mapper Pro repository or other Supabase projects. The Client Portal stays locked until the owner opens it.
- Do not re-run `golive-0033`/`golive-0034-0041` (removed) or renumber migrations; live history is the record.

## 9. Other open work (unchanged by this round)
Design V4 leftovers (`docs/DESIGN_AUDIT_V4.md`), Planner follow-ups (`docs/PLANNER_INTEGRATION_STATUS.md`), go-live pack (`docs/GO_LIVE_RUNBOOK.md`), stale PR #33 to close after a check.
