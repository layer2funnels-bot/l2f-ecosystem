# DESIGN_STATUS

One row per screen. Claude Code updates this file as it builds. Status order: **Needs design → Designed → Built to design → Verified**.
- Designed: a design file exists (see `docs/design/`). Remove nothing from the screen yet.
- Built to design: the screen matches the design. **Delete the in-screen "Needs design" note.**
- Verified: phone-width check (390px), keyboard check and tests pass.
A "Needs design" badge may show in development builds only (`SHOW_DESIGN_STATUS`). Never in production.

| Screen | Route | Status | Design file | Current build | Notes |
|---|---|---|---|---|---|
| Header and organization switcher (6 outcomes) | all | Verified | 01-switcher | Built to design (all six outcomes, unsaved-changes dialog, bottom sheet on phones). Search and notifications show disabled with a reason: no search/notification service exists yet |  |
| Sign in |  | Verified | 02-auth | Built to design |  |
| Sign up |  | Verified | 02-auth | Built to design |  |
| Check email |  | Verified | 02-auth | Built to design |  |
| Reset password: request |  | Verified | 02-auth | Built to design |  |
| Reset password: set new |  | Verified | 02-auth | Built to design |  |
| Accept invitation |  | Verified | 02-auth | Built to design (preview, accept, decline, same wording for every refusal) |  |
| No workspace yet |  | Verified | 02-auth | Built to design |  |
| Session expired |  | Verified | 02-auth | Built to design (returns to the page you were on) |  |
| Launcher (12 apps) |  | Verified | 03-launcher | Built to design (tile states from the real catalog; Funnel Mapper Pro is a normal tile, same tab) |  |
| Launcher (13+ apps) |  | Designed | 10-shell-patterns §B | Not built |  |
| Phone navigation | all apps | Verified | 10-shell-patterns §C | Built to design (bottom bar plus More sheet, Office only so far) |  |
| Client-scoped access views | all apps | Designed | 10-shell-patterns §D | Data rules built and tested; views not built |  |
| Office Home |  | Verified | 04-office-home | Built to design (attention, my work, deadlines and updates show their designed empty states until Projects and Planner screens exist) |  |
| Admin → Members |  | Verified | 05-admin | Built to design (invite, manage, deactivate, reactivate, remove, cancel; last-owner and owner-only rules) |  |
| Admin → Access: Levels |  | Verified | 05-admin | Built to design (table read from the real permission catalog) |  |
| Admin → Access: Assignments |  | Verified | 05-admin | Built to design (add, remove, "Deny instead" with a reason) |  |
| Admin → Access: Effective access |  | Verified | 05-admin | Built to design (one row per area with reasons) |  |
| Office → Funnels home |  | Verified | 06-funnels | Built to design | Funnel maps card: link design pending |
| Funnels list (avatars, offers & products, stories, brand kits) |  | Verified | 06-funnels | Built to design |  |
| Funnels record view |  | Verified | 06-funnels | Built to design |  |
| Funnels edit / new |  | Verified | 06-funnels | Built to design (unsaved-changes guard on leaving and switching) |  |
| Funnels share with client |  | Verified | 06-funnels | Built to design (record must belong to a client) |  |
| Funnels archive, restore, delete |  | Verified | 06-funnels | Built to design (delete: type the name; owner only by default) |  |
| Shared states: loading, empty, error, not found, read-only |  | Verified | 07-shared-states | Built to design (apps/web/js/ui.js) |  |
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
| Funnel Strategies: list, create (blank or template), document editor, linked assets, Funnel Mapper Pro link states | | Needs design | 06-funnels.md (requirements update, 22 Oct 2026) | Not built. Awaiting owner review of the new design; the map link, status model and editor technology are open questions in the spec | Do not build until approved |
| Projects (list, project, tasks, time, My work) |  | Needs design |  | Data layer and API built and tested (migration 0013); no screens | Office Home blocks can use `my.work` and `projects.deadlines` |
| Drive (shared, personal, SOPs, trash, versions, links) |  | Needs design |  | Data layer and API built and tested (migration 0014); storage prepared, not switched on; no screens | Client files stay in Clients |
| Planner (objectives, measures, reviews, links) |  | Needs design |  | Data layer and API built and tested (migration 0015); no screens |  |
| Form Builder, Value Ladder, Social Planner, Whiteboard, Layer 2 Agents, Client Portal |  | Needs design |  | Not built | Designed one app at a time |

## How to read "Current build"
Status is about the **design**; "Current build" is what exists in the repository. The provisional screens written before the designs arrived were replaced on 21 Oct 2026; every screen marked *Verified* was built to its design, had its in-screen note removed, and passed the phone, tablet and desktop width checks, the keyboard checks and the reduced-motion check in `scripts/e2e-ui.mjs`. Under the rule in `docs/design/10-shell-patterns.md` §A a status badge shows only in development builds (`showDesignStatus` in `config.js`, set by `SHOW_DESIGN_STATUS=true` at build time); production never renders it. Screens with no design yet (Clients, Launcher at 13+ apps, client-scoped views, other apps) use the shared states, not a placeholder note.

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
| Funnels record sections (06, spec update 22 Oct) | Avatars: Who they are, Motivations, Objections, Language they use, Evidence. Offers: Promise, Price and terms, What's included, Who it's for. Stories: Type, The story, Where to use it. Brand Kit: Colours, Fonts, Voice and tone, Logo notes. Each with "Internal notes · never shared" and "Used in" | Built on the stored fields: Avatar (name, summary, pains, desires, objections), Offer (kind, promise, description, price, currency, avatar), Story (kind, title, body, avatar, offer), Brand Kit (voice, colours, fonts, notes); no internal-notes field except on Brand Kit; no "Used in" data | Owner to choose: keep the stored fields (labels follow them), or add the designed sections and internal notes as columns (small migration + data mapping). Not changed without approval |
| Brand Kit label (06 update) | Singular "Brand Kit" in the menu | Done in the screens; stored names unchanged | None |
| Clients spec rewrite (09, 22 Oct) | Strategy workspaces and a Brand Kit inside each client, in-app form builder, Copy workflow, a Documents workspace per client whose files never appear in the shared Drive, separate SOPs and Tools menus, requests with exact versions | Clients data layer built to the earlier version (0008): profile, notes, requests, updates, stages. No Strategy, forms, copy, documents or versions | Awaiting owner approval of the new design; then a gap review and migration plan before any change. The Drive layer (0014) already keeps client files out of the shared Drive |
| Password length (02, A12) | Minimum 10 characters | Applied: 10 in the browser and in the local Supabase configuration | Done; set the same value in the live project at go-live |
| Launcher pins / recents (10 §B, A26) | Per person | Not stored | Small per-person table when the Launcher is rebuilt |


Note (batch 3): Admin → Storage (usage and cap) was built on the owner's instruction without a design; it needs a design review.

## Design v4 "Signal" (23 Oct 2026)
Approved by the owner as the visual direction (`docs/design/v4/`). Apps are rebuilt on v4 tokens one by one (see `docs/SESSION_HANDOFF.md`). Screens awaiting the updated design before they are built: Office > Projects inside Office; Projects two-section home; Whiteboards in context and All boards; Social campaigns/states/channels; Form Builder versions/validation/submissions/client-linked; Value Ladder step types/offer picker/compare/client copy. Copy stage requirements are an open item. Logos and Aurj colours are placeholders in one theme file.
