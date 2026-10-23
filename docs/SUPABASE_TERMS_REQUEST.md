# Supabase terms confirmation request (PREPARED, NOT SENT)

**Status: not sent.** The owner reviews and sends it. Until Supabase answers in writing, no external client or tester account may be given access in a live system (Client Portal gate G2 stays locked; live staff-only use is the only use that fits the published terms as written).

## Where to send it (as published by Supabase, read 23 Oct 2026)
- **Primary:** a support ticket from the Supabase dashboard (https://supabase.com/dashboard/support/new). It records the account and plan and gives a ticket number. Choose the billing/account or "other" category.
- **Also, by e-mail, for a written legal answer:** `legal@supabase.com` (the address on https://supabase.com/contact-us for "general legal inquiries"). The Terms of Service itself names `legal@supabase.io` for formal notices (section 14(b)); both are published, and nothing says which is current, so copy both if unsure.
- Sales/enterprise questions go through https://forms.supabase.com/enterprise (no e-mail is published).
- Send from the account owner's address (the one on the Supabase organization), so the answer is tied to the right account.

## Subject
Question about permitted use of the Free plan: internal staff, invited testers and client access to our own application

## Message (ready to send; fill the two bracketed items)
Hello Supabase team,

We would like written confirmation of whether our intended use of Supabase is permitted under the current Terms of Service, before we put real data on it.

**Who we are and the plan.** We are Layer2Funnels, a small marketing agency, and our sister brand Aurj. Our organization is on the **Free plan** (organization ID `csatcbleolxxavnkteuf`, plan "free"). We plan to create one new project in the `ap-south-1` (Mumbai) region for a private internal business application, and we expect to move to the Pro plan later. [Insert the contact name and role.]

**What the application is.** A private, invitation-only business application that we built ourselves. Our own web application and our own API are the only way anyone reaches the data. The browser never talks to the database directly: the public `anon` and `authenticated` roles have no privileges on our tables (we revoke them), and every request goes through our API with row-level security enforced in Postgres. We use Supabase Auth for sign-in and Postgres for data, and Cloudflare for hosting. The application separates our two organizations' data strictly.

**The people who would sign in.**
1. **Internal staff** of Layer2Funnels and Aurj (employees and contractors), who use the application for our own business.
2. **A few invited testers** (about 1 to 5 friends and acquaintances, not employees) who would use the application for a limited testing period, with access limited to the parts we choose.
3. **In the future, a small number of our clients** (initially 1 to 5 external businesses) who would sign in to a separate, limited "client portal" area of the same application. They would see only the items we deliberately share with them (for example project updates, files and approval requests), and nothing else. They would never receive access to the Supabase dashboard, the database, or the API keys.

**Our questions.**
1. Section 2 of the Terms limits use to "Customer's internal business purposes" for "Authorized Users", and section 2(c)(ii) prohibits making the Services available "to any third party". Is it permitted for a customer to build its own application on Supabase and let its own **clients and invited testers sign in to that application** (through Supabase Auth), given that they use our application and never access Supabase's services directly? If the answer differs for (a) staff, (b) invited testers who are not employees, and (c) clients, please say how.
2. Is any of this treated differently on the **Free plan** than on a paid plan? Is the Free plan permitted for a business application used by clients, or is a paid plan required for production use with external users?
3. If a paid plan is required for external users, which plan (Pro, Team or another) and from what point (for example from the first external user, or above a number of users)?
4. Does it matter that a small number of end users are outside our organization, and is there a limit on how many external end users are acceptable under each plan?
5. Are there any other terms, supplemental terms or fair-use rules we should read before relying on the Free plan for this purpose? (We found the Supplemental Terms page marked "Version 1 — TBD".)
6. Please confirm the effective date or version of the Terms your answer is based on.

We will not give any external person access until we have your written answer. A reply by e-mail that we can keep for our records is ideal. Thank you.

Kind regards,
[Name], [role]
Layer2Funnels · layer2funnels@gmail.com

## What the owner must do with the answer
1. Save the reply with the date in the company records.
2. Only if the reply clearly allows it (for testers, or for clients, on the plan that applies): set the Client Portal switch for that organization (go-live runbook, "Opening the Client Portal"), and record the date and the reference in `docs/DECISIONS.md`.
3. If the reply says a paid plan is needed: that is the Supabase Pro upgrade (about $25 a month), which needs the owner's approval before any charge. The onboarding design does not change when upgrading.
4. If the reply is unclear or refuses: keep the Portal locked and discuss alternatives (for example a separate production database for external users).
