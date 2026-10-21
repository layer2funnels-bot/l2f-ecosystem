# DESIGN_STATUS

One row per screen. Claude Code updates this file as it builds. Status order: **Needs design → Designed → Built to design → Verified**.
- Designed: a design file exists (see `docs/design/`). Remove nothing from the screen yet.
- Built to design: the screen matches the design. **Delete the in-screen "Needs design" note.**
- Verified: phone-width check (390px), keyboard check and tests pass.
A "Needs design" badge may show in development builds only (`SHOW_DESIGN_STATUS`). Never in production.

| Screen | Route | Status | Design file | Current build | Notes |
|---|---|---|---|---|---|
| Header and organization switcher (6 outcomes) | all | Designed | 01-switcher | Provisional build (select box + notices); data/API complete |  |
| Sign in |  | Designed | 02-auth | Provisional build |  |
| Sign up |  | Designed | 02-auth | Provisional build |  |
| Check email |  | Designed | 02-auth | Provisional build |  |
| Reset password: request |  | Designed | 02-auth | Provisional build |  |
| Reset password: set new |  | Designed | 02-auth | Provisional build |  |
| Accept invitation |  | Designed | 02-auth | Provisional build |  |
| No workspace yet |  | Designed | 02-auth | Provisional build |  |
| Session expired |  | Designed | 02-auth | Provisional build |  |
| Launcher (12 apps) |  | Designed | 03-launcher | Provisional build (flat tiles) |  |
| Launcher (13+ apps) |  | Designed | 10-shell-patterns §B | Not built |  |
| Phone navigation | all apps | Designed | 10-shell-patterns §C | Not built (wrapping link row today) |  |
| Client-scoped access views | all apps | Designed | 10-shell-patterns §D | Data rules built and tested; views not built |  |
| Office Home |  | Designed | 04-office-home | Placeholder only |  |
| Admin → Members |  | Designed | 05-admin | Not built (API: invitations only) |  |
| Admin → Access: Levels |  | Designed | 05-admin | Not built (database engine built) |  |
| Admin → Access: Assignments |  | Designed | 05-admin | Not built (database engine built) |  |
| Admin → Access: Effective access |  | Designed | 05-admin | Not built (operation access.effective exists) |  |
| Office → Funnels home |  | Designed | 06-funnels | Provisional build | Funnel maps card: link design pending |
| Funnels list (avatars, offers & products, stories, brand kits) |  | Designed | 06-funnels | Provisional build |  |
| Funnels record view |  | Designed | 06-funnels | Provisional build |  |
| Funnels edit / new |  | Designed | 06-funnels | Provisional build |  |
| Funnels share with client |  | Designed | 06-funnels | Provisional build (toggle only) |  |
| Funnels archive, restore, delete |  | Designed | 06-funnels | Provisional build |  |
| Shared states: loading, empty, error, not found, read-only |  | Designed | 07-shared-states | Partly (shared helpers in apps/web/js/views/common.js) |  |
| Funnel Mapper Pro in the ecosystem (placement, colours, screen table) |  | Designed | 08-fmp-in-ecosystem | Unedited code copy only (apps/funnel-mapper); reshaping not started | Canvas, maths, reports unchanged |
| Clients list: table, grid, pipeline |  | Designed | 09-clients | Data layer and API built and tested (migration 0008); no screens |  |
| New client |  | Designed | 09-clients | Data layer and API built and tested (migration 0008); no screens |  |
| Client record: Overview |  | Designed | 09-clients | Data layer and API built and tested (migration 0008); no screens |  |
| Client record: Work (stages, Build progress page) |  | Designed | 09-clients | Data layer and API built and tested (migration 0008); no screens |  |
| Client record: Requests & Approvals, request detail, new request |  | Designed | 09-clients | Data layer and API built and tested (migration 0008); no screens |  |
| Client record: Documents & Brand Kit |  | Designed | 09-clients | Data layer and API built and tested (migration 0008); no screens |  |
| Client record: Team Notes |  | Designed | 09-clients | Data layer and API built and tested (migration 0008); no screens |  |
| Clients: share with client, post update |  | Designed | 09-clients | Data layer and API built and tested (migration 0008); no screens |  |
| Clients: archive, restore, delete |  | Designed | 09-clients | Data layer and API built and tested (migration 0008); no screens |  |
| Clients: Requests & Approvals (all clients) |  | Designed | 09-clients | Data layer and API built and tested (migration 0008); no screens |  |
| Clients: SOPs & Tools |  | Designed | 09-clients | Data layer and API built and tested (migration 0008); no screens |  |
| Clients: Settings |  | Designed | 09-clients | Data layer and API built and tested (migration 0008); no screens |  |
| Projects, Drive, Planner, Form Builder, Value Ladder, Social Planner, Whiteboard, Layer 2 Agents, Client Portal |  | Needs design |  | Not built | Designed one app at a time |

## How to read "Current build"
Status is about the **design**; "Current build" is what exists in the repository. Every screen marked *Provisional build* was written **before** its design arrived (Phase 5 slice 0 and the Funnels screens), on the design tokens, and carries an always-visible "Needs design" note. Under the rule in `docs/design/10-shell-patterns.md` §A that note moves out of the screen when the screen is rebuilt to its design, and a status badge only shows in development builds (`SHOW_DESIGN_STATUS`). The provisional builds have **not** been reworked to the designs yet.

## Differences found between the designs and the data layer / catalog (21 Oct 2026)
Found while filing the designs; none changed yet. The index says the permission catalog wins where they differ.

| Topic | Design says | What is built | Suggested resolution |
|---|---|---|---|
| Permanent delete (A4, A18) | Owner **and Admin**, archived items only | Owner only (decision D18; tested) | Keep owner-only (safer, already approved earlier) or approve a change; owner to decide |
| Team note delete (A21) | Author or an admin; pin by anyone who can edit | Delete is owner-only after archive; no pin | Allow author/admin delete of **archived** notes; add a `pinned` flag; small migration |
| Client stage names (09) | Brand Base → Strategy → Copy → Build → Marketing; Build = progress only | Placeholders Onboarding, Strategy, Build, Launch, Optimise; Build progress-only is built | Re-seed to the design names (data only); answers the open question from the previous report |
| Client status (09) | Intake, Onboarding, Active, Paused, Closed (+ Archived) | lead, proposal, active, paused, past (+ archive flag) | Change the allowed values and default to Intake (small migration) |
| Client fields (09) | Main contact name, account lead, next action (with due date) | Not stored (business name, e-mail, phone, website, country, currency, tags are) | Add contact name, account lead (a member), next action + due date |
| Stage steps (09 Work) | Steps with owner, status, due date, optional client action; "Mark stage complete" updates the Portal milestone | No steps or completion records | New tables for steps and stage completion (own migration and tests) |
| Requests (09) | Exact version, revision v+1, statuses Waiting on client / Responded / Reviewed / Approved / Changes requested / Draft | Simple open/answered/closed, no versions; approvals live in the older `approvals` table | Model versions on requests and reuse the approvals service (ER4) |
| Files and Brand Kit tab (09) | Files with version and visibility; Brand Kit approved version, follow-up questions | Files are Drive (not built); Brand Base answers exist; brand kits are Funnels records | Build after Drive; keep Brand Base and brand kits separate (WEB-4) |
| Password length (02, A12) | Minimum 10 characters | Browser check and the go-live runbook use 12 | Owner to choose; one constant to change |
| Launcher pins / recents (10 §B, A26) | Per person | Not stored | Small per-person table when the Launcher is rebuilt |

## Provisional builds before the designs (appendix: states covered)
| Screen | Route | Status | States covered |
|---|---|---|---|
| Sign in | `#/signin` | Built, needs design | error (one plain line), offline, rate-limited, loading (button) |
| Create account | `#/signup` | Built, needs design | validation, existing-account (non-revealing), check-email |
| Check your email | `#/check-email` | Built, needs design | static |
| Forgot / reset password | `#/forgot`, `#/reset` | Built, needs design | non-revealing confirmation, expired link |
| Accept invitation | `#/invite` | Built, needs design | signed-out prompt, joining, failure (“can’t be used”), token stripped from URL |
| No workspace yet | `#/no-org` | Built, needs design | check again, sign out |
| Session expired | `#/expired` | Built, needs design | one token refresh attempted first |
| Launcher | `#/launcher` | Built, needs design | empty, coming soon, not built yet, Funnel Mapper Pro link tile, apps error |
| Shell (header, switcher, app menu) | all | Built, needs design | switching state, announcements, same-page / record-not-carried / page-unavailable / app-unavailable / refused / failed-retry notices |
| Office home | `#/office` | Placeholder, needs design | — |
| Funnels home | `#/office/funnels` | Built, needs design | loading, error + retry, counts of visible records only |
| Funnels lists (4) | `#/office/funnels/<type>` | Built, needs design | loading, empty (create or view-only wording), error, archived, client filter, audience chip |
| Funnels record (4) | `…/<type>/<id|new>` | Built, needs design | loading, error, not found (same as denied), saving, field errors by name, read-only (no permission / archived), share, archive, restore, delete |
| Other apps | `#/app/<key>` | “Not built yet” placeholder | coming soon |
| Clients (list, record tabs, stages, requests, updates, team notes) | — | **Data layer and API built and tested (migration 0008); no screens, waiting for approved designs** | — |
| Funnel Mapper Pro (unedited code copy in `apps/funnel-mapper`) | — | Copied for study; reshaping (header, switcher, tokens, sign-in) **not started**, waits for approved designs | — |
| Admin → Members / Access / Apps, Projects, Drive, Planner, Portal | — | **Planned**, not started | — |
