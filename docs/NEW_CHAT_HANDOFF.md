# Handoff for the next chat (updated 2 Nov 2026, after the onboarding work)

> **14 Nov 2026: Funnel Mapper is live at office.tabishriaz.com/fmp. Design V7 is the current reference.** Start with `docs/design/v7/CLAUDE_CODE_NEXT_CHAT_HANDOFF.md` (V7 package, Funnel Mapper migration stage 1, how to build each app). This file stays as the history of the earlier rounds.

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

## 4. Database and migration status (verified read-only on the live database, 2 Nov 2026, 17:10 UTC)
- Live project `l2f-ecosystem`, ref `dfitnxilkezepkhdmzuh`. History ends at **`0040_planner_measure_cadence`** (40 rows). 0041 and 0042 are **not** applied. 4 accounts, 2 memberships, 3 open invitations.
- **Live impact now:** PR #38 (profile page, team photos) is merged and deployed, but its database part (0041) is missing, so **the live Your profile page and the Team page fail** until the script runs.
- To apply: **`scripts/golive-0041-0042.sql`**. Additive only, one transaction, guard refuses any other state or a second run. Safety, isolation and rollback: `docs/ONBOARDING.md` §7.

## 5. PR and tests
- PR [#39](https://github.com/layer2funnels-bot/l2f-ecosystem/pull/39), branch `claude/exciting-dirac-kjybj0`. CI (test, e2e, fmp-copy, Cloudflare preview) **all green on `803c29f`**. Later commit: stricter right-database guard and the waiting-invitation apps fix (see `docs/ONBOARDING.md` §7): check the PR for CI on the newest head before merging.
- Earlier CI failure (fixed): browser check G5, the invite page cleared the link before a second render (`apps/web/js/app.js`).
- Local: all 57 unit suites pass (invitations 38, profiles 14, audit 63); browser suite `scripts/e2e-ui.mjs` 248/248; `scripts/e2e-onboarding.mjs` 21/21; live-script rehearsal identical to a fresh build.
- Live (read only, 2 Nov): at 0040; browser roles hold 0 function rights; Confirm email is on.
- Not testable without the owner's accounts: real Brevo delivery and Supabase mails through Brevo SMTP (`docs/ONBOARDING.md` §4 step 5). **Not production-ready until those pass.**

## 6. What the owner must do (step-by-step in `docs/ONBOARDING.md` §3–4)
1. Say "yes" to running `scripts/golive-0041-0042.sql` (urgent: fixes the live profile and Team pages).
2. Brevo: authenticate the domain (DNS records), add the sender, create an API key and an SMTP key.
3. Cloudflare (Production and Preview): `BREVO_API_KEY` (Secret), `MAIL_FROM_EMAIL`, `MAIL_FROM_NAME`; retry the deployment.
4. Supabase: custom SMTP = Brevo; URL configuration; Confirm email and Secure email change on.
5. Say "yes" to merging PR #39 once CI is green.
6. Do the live tests in §4 step 5 with a spare mailbox; the assistant checks the database side.

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

## 10. After the go-live (2 Nov 2026, evening)
- Live database at **0042**; PR #39 and #40 merged; live mail works (Brevo API for invitations, Brevo SMTP for Supabase e-mails). Production domain in use: `office.tabishriaz.com` (Supabase URL settings must list it).
- Lesson: a sign-up with an address that already has an account gets no e-mail from Supabase (by design); the app now says "already has an account, sign in" (PR #40).
- Owner decision: the Client Portal tile is shown to **every team member**, editors and viewers included (migration `0043_portal_tile_for_all_staff`, live script `scripts/golive-0043.sql`, needs the owner's yes). The Portal stays locked for clients; only an owner switches it on.
- Fixed: the profile menu on the Launcher opened at the bottom of the page (`.swwrap` had `position:relative` only inside `.hdr`).

## 11. Editors and Drive round (5 Nov 2026) – LIVE
- PR #42 merged; live database applied `scripts/golive-0043-0046.sql` (now at 0046; data kept; browser roles 0 function rights).
- New: Word editor (tabs, voice en/ur, exports), Sheets v2, Image and PDF editors, Drive sharing / owner lock / folder passwords, editor full-window mode.
- Local stack DB port is 54332 (54322 got stuck in the cloud machine). Cloudflare build installs whiteboard, sheetjs, media and docs-io trees itself.
- OPEN (owner, dashboard only): R2 bucket `l2f-ecosystem-files` CORS must allow https://office.tabishriaz.com (PUT, GET, HEAD; header content-type).
  Until then uploads, previews and image/PDF editing fail on that domain (they work on l2f-ecosystem.pages.dev).
- Known limits: free voice cannot tell speakers apart; Word "PDF" download = browser print dialog; xlsx export without colours.

## 12. Owner feedback round (5 Nov 2026) – in progress at the time of writing
Agents working (worktrees under .claude/worktrees, merge into `claude/exciting-dirac-kjybj0`, then PR → owner merges; the owner has authorised
the assistant to take decisions and run rehearsed live SQL itself – still never without rehearsal):
- Docs (branch editors/docs-2): compact table toolbar that never covers the table; robust autosave (≈1.5 s, on blur/leave/tab switch, retry)
  so the "unsaved changes" dialog practically never shows; page uses the width well + fit-width zoom; font size − / + buttons; "space left"
  only shown above 80 %; voice: automatic speaker detection in the browser (beta, free), no manual speaker picking.
- Drive (branch drive/public-links): public share links for anyone on the internet (view-only, expiry, revoke; public viewer page; migration
  0047 + scripts/golive-0047.sql); BUG: Trash "Delete for good" fails with "Some details need fixing" (422).
- Both agents were told to do their own critical user pass and fix more bugs.
- Still owner-only: R2 CORS for https://office.tabishriaz.com (uploads fail until done; verified 403 on 5 Nov 07:30 UTC).
- Design brief for Claude Design: `docs/design/EDITORS_DESIGN_BRIEF.md`.
- Next feature after this round: Slides editor.
