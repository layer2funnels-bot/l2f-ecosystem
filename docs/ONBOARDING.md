# Inviting teammates and clients: how it works, and how to switch it on

Last updated: 2 Nov 2026. Code: PR #38 (profiles, merged) and the onboarding follow-up PR (branch `claude/exciting-dirac-kjybj0`). Database: migrations `0041_profiles` and `0042_invitation_onboarding`.

## 1. What was wrong (root causes, with evidence)
| # | Problem the owner saw | Real cause | Evidence |
|---|---|---|---|
| 1 | Invitees confirmed their e-mail but never got access | The invitation was remembered only by the browser tab that opened the link (`sessionStorage`). The confirmation e-mail opens a new tab, so the invitation was forgotten and the person landed on "You're not in an organization yet". | Live database, 2 Nov: 3 accounts, all confirmed; 2 open invitations (one staff Editor, one client) never accepted. |
| 2 | Nobody received an invitation e-mail | The app had no e-mail sending at all. It only showed a link for the owner to pass on. | `apps/web/js/views/admin.js` (old text "Email sending is switched on at go-live"). |
| 3 | New teammates would not see most apps | Invitations granted a fixed list of five apps (`office, projects, planner, drive, clients`). Editors and viewers need a grant per app, so Forms, Value Ladder, Social Planner, Whiteboard and Funnel Mapper Pro stayed hidden. | `migrations/0002_hardening.sql`, default `apps` column; `private.can_use_app`. |
| 4 | Someone already in an organization who opened an invitation got an error | `accept_invitation` refused any person who already had a membership. | `migrations/0032_client_access.sql`. |
| 5 | No profile page | Nobody could change their own name, photo, e-mail or password. | (built in 0041 and `apps/web/js/views/profile.js`) |
| 6 | Supabase's own e-mails (confirm e-mail, reset password) are rate-limited | On the free plan Supabase's built-in mail service is meant for testing (a few e-mails an hour). Real use needs custom SMTP. | Supabase documentation (Auth > SMTP). Owner action below. |

## 2. How it works now
1. **Invite** (Office › Admin › Members, or Admin › Client access). The database creates the invitation (single-use token, only its SHA-256 hash is stored, 7 days, bound to one e-mail). For staff, every app switched on in the organization is granted on joining (not the Client Portal).
2. **E-mail** (server side, `packages/core/mailer.mjs` and `invite-mail.mjs`). The API e-mails the link through **Brevo** with the inviter's name, the organization, the role and the steps. It only says "sent" when Brevo answers 201 with a message id. Every attempt is recorded in `invitation_deliveries` (status, provider, message id, short error code; never the token or the text). Without Brevo settings it says so and shows the link to pass on.
3. **Join**, by any of these, all checked by the database:
   - the link (any tab; the token is also kept in local storage and on the confirmation link);
   - **no link at all**: after signing in, a person with a **verified** e-mail sees "You're invited to …" (`my_invitations()`, `invitation_accept_mine(id)`). This covers another device, a later sign-in and the two invitations already waiting on the live system.
   - The database checks the e-mail matches, the e-mail is confirmed (`auth.users.email_confirmed_at`), the invitation is open (not used, cancelled or expired), and creates the membership with exactly the invited kind, role, client record and apps. Nobody can choose an organization, role or permission in a request (unknown fields are rejected).
4. **Admin status**: each invitation shows "Email sent <date> · opened", "Email not delivered (code)", "No email sent", or **Expired**. Actions: **Resend invitation** / **Send a new invitation** (fresh link; the old one stops working), **Cancel invitation**. A second open invitation for the same e-mail is refused; inviting someone already on the team is refused.
5. **Profile** (avatar › Your profile, for team and clients): photo (small JPEG made in the browser, checked in the database), name, e-mail change (Supabase Auth sends the confirmation; nothing changes until it is confirmed), password change (with the e-mailed code when Supabase asks for one), sign out of all devices.

## 3. Mail setup (owner logs in; about 30 minutes; $0)
Two kinds of e-mail, both sent through Brevo:
- **Invitation e-mails**: our API calls Brevo's API with a secret key kept only in Cloudflare (never in the browser or the repository).
- **Account e-mails** (confirm your address, reset password, confirm a new e-mail address): sent by Supabase. Supabase must be told to use Brevo's SMTP server, because the built-in sender only allows a few e-mails an hour and is meant for testing.

### 3a. Brevo (brevo.com, free plan: 300 e-mails a day, no card)
1. **Sender address.** Brevo › top-right menu › *Senders, Domains & Dedicated IPs* › *Domains* › *Add a domain* → enter the domain you own (for example `layer2funnels.com`). Brevo then shows 3–4 DNS records (a Brevo code TXT, a DKIM record, a DMARC TXT `_dmarc`). Add them where your domain's DNS is managed (Cloudflare DNS, GoDaddy, Namecheap…), then click *Authenticate* in Brevo. This is the step that keeps invitations out of spam.
   - Then *Senders* › *Add a sender*: name `Layer2Funnels`, e-mail for example `team@layer2funnels.com` (the mailbox does not need to exist to send, but replies go there).
   - **No own domain yet?** You can verify a Gmail address as a sender, but Gmail's own rules (DMARC) make such e-mails go to spam or bounce at Gmail/Yahoo/Outlook. Use it only for a first test.
2. **API key** (for invitation e-mails): *SMTP & API* › *API keys* › *Generate a new API key*, name `l2f-ecosystem`. Copy it once into Cloudflare (step 3b). Do not paste it in chat or e-mail.
3. **SMTP key** (for Supabase account e-mails): *SMTP & API* › *SMTP* tab. Note the **SMTP server** (`smtp-relay.brevo.com`), **port** (`587`) and **login** (looks like `xxxx@smtp-brevo.com`), then *Generate a new SMTP key*. Copy it once into Supabase (step 3c).
4. If Brevo asks to activate transactional e-mail or confirm your account (phone/company form), complete it; it is free.

### 3b. Cloudflare (dash.cloudflare.com › Workers & Pages › `l2f-ecosystem` › Settings › Variables and Secrets)
Add each one for **Production**, then again for **Preview**:
| Name | Type | Value |
|---|---|---|
| `BREVO_API_KEY` | **Secret** (Encrypt) | the Brevo API key |
| `MAIL_FROM_EMAIL` | Text | the verified sender, e.g. `team@layer2funnels.com` |
| `MAIL_FROM_NAME` | Text | `Layer2Funnels` |
Then *Deployments* › latest Production deployment › *⋯* › *Retry deployment* (settings only apply to new deployments).
Check: Office › Admin › Members shows "Invitation emails are switched on (sent from …)".

### 3c. Supabase (supabase.com/dashboard › project `l2f-ecosystem`)
1. *Authentication* › *Emails* › *SMTP Settings* › **Enable custom SMTP**: Sender e-mail = the verified sender; Sender name `Layer2Funnels`; Host `smtp-relay.brevo.com`; Port `587`; Username = the Brevo SMTP login; Password = the Brevo **SMTP key**. Save.
2. *Authentication* › *Rate Limits*: "emails sent per hour" can be raised (for example 30) once custom SMTP is on.
3. *Authentication* › *URL Configuration*: Site URL `https://l2f-ecosystem.pages.dev`; Redirect URLs add `https://l2f-ecosystem.pages.dev/**` and `https://*.l2f-ecosystem.pages.dev/**` (previews).
4. *Authentication* › *Sign In / Providers* › *Email*: **Confirm email** on; **Secure email change** on (both addresses confirm).

### What the assistant can do vs. what needs your login
| Step | Who |
|---|---|
| Code, tests, the database script, docs | Done by the assistant |
| Run `scripts/golive-0041-0042.sql` on the live database | Assistant, after your "yes" (or you, in the SQL Editor) |
| Merge the pull request | Assistant, after your "yes" and green CI |
| Brevo domain, sender, API key, SMTP key; DNS records | You (your Brevo and domain logins) |
| Cloudflare variables; Supabase SMTP and URL settings | You (keys must never pass through chat) |
| Live test with a real mailbox | You do the clicking; the assistant checks the database results |

## 4. Production activation sequence (in this order)
1. **CI green** on the pull request (test, e2e, fmp-copy).
2. **Database**: owner approves → run `scripts/golive-0041-0042.sql` (see §7). Check: last migration is `0042_invitation_onboarding`.
3. **Mail settings**: §3a–3c.
4. **Merge** the pull request (owner approves) → Cloudflare deploys main automatically. Check that the site loads and Office › Admin › Members shows the "switched on" note.
5. **Live tests** (use a second address you own, ideally on another device):
   1. Invite it as Editor → the e-mail arrives within a minute; Members shows "Email sent".
   2. Open the link → Create account → confirmation e-mail arrives (this proves Supabase SMTP) → confirm → you land in Office of the right organization; Members shows the person as Active; the apps are all there.
   3. Sign out and use *Forgot password* → reset e-mail arrives → set a new password → sign in.
   4. Your profile: change the name and photo; change the e-mail (confirmation e-mails arrive); sign out of all devices.
   5. Invite a client from Clients › Client access → they join as a client and see only the client screens.
   6. Resend an invitation → the old link says it can't be used; the new one works.
   7. In Brevo › *Transactional* › *Logs* you see each e-mail as Delivered.
6. **People already waiting** (3 open invitations on the live system): after step 4 they sign in and see "You're invited". Expired ones: Members › Manage › Send a new invitation.

## 5. Tests
- `test/invitations.test.mjs` (38 checks, PGlite, API as `app_user`): e-mail content and sender, failures (refused, network, not configured), status in the admin list, duplicates, already-members, editors cannot invite or resend, verified-only joining without the link, someone else's invitation, expired and cancelled, resend makes the old link useless, client joins as client with no app grants, client cannot read staff lists, no organization or role can be smuggled in a request, declining, browser roles get nothing, e-mail escapes names.
- `test/profiles.test.mjs` (14 checks): own profile only, photo rules, photos only inside the organization, clients have profiles.
- `scripts/e2e-onboarding.mjs` (real browser, real Supabase Auth on the local stack, fake Brevo): 21 checks of the whole journey (see the file).
- `scripts/e2e-ui.mjs` PR1–PR6: profile page and the invitation surviving a new tab.

## 6. Support: when someone says "I can't get in"
1. Office › Admin › Members: is the invitation there? Status Expired → **Send a new invitation**. "Email not delivered" → check the address, then Resend or pass the link on.
2. Ask them to sign in with the **exact address** the invitation was sent to and confirm their e-mail. After signing in they see the invitation (no link needed).
3. Already a member but deactivated: an owner or admin reactivates them in Members (an old invitation cannot reactivate someone).

## 7. The live database script: safety and recovery
- **Checked on the live database (read only, 2 Nov 2026):** migration history ends at `0040_planner_measure_cadence` (40 rows); 0034–0040 objects present; 0041/0042 objects absent; 4 accounts, 2 memberships, 3 open invitations; role `app_user` present. This is exactly the state the script requires.
- **What it does:** only additions: one column on `profiles`, one on `invitations`, one new table (`invitation_deliveries`, row-level security forced, organization isolation policy, read only for owners/admins, nothing granted to `anon`/`authenticated`), new functions, and new versions of `create_invitation`, `accept_invitation`, `members_list`, `client_access_list`, `team_list` (same callers, extra columns). No row is deleted or changed; no column is removed; no unique rule is added that existing rows could break.
- **Isolation (Layer2Funnels / Aurj):** every new function reads through the caller's organization (`org_scope`) or the caller's own verified e-mail; tests IV1–IV38 and the audit suite cover cross-organization reads and writes, client vs staff, and browser roles.
- **Safety net:** one transaction (`begin … commit`). A guard stops it unless the database is at 0040 without 0041/0042; any error means nothing changed; a second run is refused.
- **Rollback:** no data rollback is needed (nothing is changed or removed). If the new screens misbehave, roll back the code only: Cloudflare › Deployments › the previous Production deployment › *Rollback*; the old code works with the new database because the changes are additive. The free Supabase plan has no downloadable backup, so if you want a copy first, ask the assistant to export the tables before running the script.

