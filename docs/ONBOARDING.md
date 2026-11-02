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

## 3. Settings needed (owner)
| Where | Name | Value |
|---|---|---|
| Brevo | Sender | A verified sender address. Best: an address on your own domain (for example `team@layer2funnels.com`) with the domain authenticated in Brevo (DKIM and DMARC records in your DNS). A Gmail sender is rejected or sent to spam by Gmail's DMARC rule. |
| Brevo | API key | Brevo › SMTP & API › API keys › Generate (name it `l2f-ecosystem`). |
| Cloudflare Pages › l2f-ecosystem › Settings › Variables and Secrets (**Production** and **Preview**) | `BREVO_API_KEY` (type **Secret**) | the API key |
| same | `MAIL_FROM_EMAIL` | the verified sender address |
| same | `MAIL_FROM_NAME` (optional) | `Layer2Funnels` |
| Supabase › Authentication › Emails › SMTP settings | Custom SMTP | Host `smtp-relay.brevo.com`, port `587`, user = your Brevo SMTP login, password = a Brevo **SMTP key** (SMTP & API › SMTP), sender = the same verified address. This makes "confirm your e-mail" and "reset password" e-mails reliable. |
| Supabase › Authentication › URL Configuration | Site URL / Redirect URLs | Site URL `https://l2f-ecosystem.pages.dev`; add `https://l2f-ecosystem.pages.dev/**` to Redirect URLs. |
| Supabase › Authentication › Sign In / Providers › Email | Confirm email | **On** (an unconfirmed e-mail must never be able to accept an invitation; the database also checks this). |
Brevo's free plan: 300 e-mails a day, no card needed. Cost: $0.

## 4. Production activation checklist
1. Apply the database step: `scripts/golive-0041-0042.sql` in the Supabase SQL Editor (one step, refuses to run twice). Check: migration history ends with `0042_invitation_onboarding`.
2. Merge the onboarding PR (only after step 1, and after CI is green).
3. Add the Brevo values to Cloudflare (Production and Preview) and redeploy (Cloudflare › Deployments › Retry the latest, or push any commit).
4. Set Supabase custom SMTP (Brevo) and check the URL configuration.
5. Test: Office › Admin › Members shows "Email is switched on" (mail.status); invite a spare address you own; the e-mail arrives; sign up from it on your phone; you land in Office with the right apps; the member list shows the person as Active.
6. The two invitations already waiting on the live system: those people simply sign in again after step 2; they will see "You're invited" and join with one click. If their 7 days have passed, use **Send a new invitation**.

## 5. Tests
- `test/invitations.test.mjs` (38 checks, PGlite, API as `app_user`): e-mail content and sender, failures (refused, network, not configured), status in the admin list, duplicates, already-members, editors cannot invite or resend, verified-only joining without the link, someone else's invitation, expired and cancelled, resend makes the old link useless, client joins as client with no app grants, client cannot read staff lists, no organization or role can be smuggled in a request, declining, browser roles get nothing, e-mail escapes names.
- `test/profiles.test.mjs` (14 checks): own profile only, photo rules, photos only inside the organization, clients have profiles.
- `scripts/e2e-onboarding.mjs` (real browser, real Supabase Auth on the local stack, fake Brevo): 21 checks of the whole journey (see the file).
- `scripts/e2e-ui.mjs` PR1–PR6: profile page and the invitation surviving a new tab.

## 6. Support: when someone says "I can't get in"
1. Office › Admin › Members: is the invitation there? Status Expired → **Send a new invitation**. "Email not delivered" → check the address, then Resend or pass the link on.
2. Ask them to sign in with the **exact address** the invitation was sent to and confirm their e-mail. After signing in they see the invitation (no link needed).
3. Already a member but deactivated: an owner or admin reactivates them in Members (an old invitation cannot reactivate someone).
