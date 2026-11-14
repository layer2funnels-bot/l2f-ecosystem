# V8 ecosystem implementation plan

Date: 14 Nov 2026. Inputs: the V8 handoff (`docs/design/v8/`), the owner's three instruction documents (main V8 prompt, critical requirements, final directives) and the live code on `main` (PRs #1–#53). Tracker: `V8_IMPLEMENTATION_TRACKER.md`. Review: `V8_DOCUMENTATION_REVIEW.md`.

## 1. The rule this plan follows

**Live V4 functions + V8 pages and functions + owner additions + bug fixes.** Nothing that works today is removed. Where V8 moves or replaces something, the function stays and its new place is written down in `V4_FEATURE_PRESERVATION_MATRIX.md` before the code changes.

## 2. Order (from the handoff, unchanged)

P00 shell → P01 Office → P02 Clients → P03 Projects → P04 Tasks → P05 Drive and editors → P06 Planner → P07 Funnel Mapper → P08 Client Portal → P09 Whiteboard → P10 Forms → P11 Value Ladder → P12 Social Planner → P13 Layer 2 Agents → P14 full check.

Each phase: read that app's `PAGES_AND_NAVIGATION.md` in full and its screenshots → audit the live app (V4 preservation matrix) → `<APP>_PLAN.md` → build in small commits → tests (unit/API with pglite, browser E2E on the local stack, permission tests) → design QA, accessibility, mobile → `<APP>_REPORT.md` with a control-by-control table → pull request → owner review → merge → live check.

Why this order: the shell, tokens, search, notifications and permission model (P00–P01) are used by every app; the Client service (P02) is used by Projects and Funnel Mapper; Projects provides `createProjectFromPlan` and the shared timer used by Tasks and Planner.

## 3. Shared foundation built once in P00

1. V8 tokens merged into `packages/ui/tokens.json` and the web stylesheet (no parallel system, no hex in component CSS); Geist, Geist Mono, Bricolage (Launcher hero), Noto Nastaliq Urdu from `apps/web/fonts/`.
2. Shell: 64 px rail (org menu, apps menu, pinned apps, search, bell, profile menu with **Sign out**), app sidebar (no profile footer, collapsible), 52 px app bar, focused layout for editors and canvases, phone bottom bar + apps-and-account sheet. Every navigation item a real link.
3. Launcher V8 (plates 96 px, min tile 150 px, Jump back in), **Khushab weather atmosphere** (section 5), opening animation only while the app is really loading.
4. Global search: dialog + one search endpoint that asks each app's provider **as the signed-in user** inside the current organization. Providers in P00: apps, pages and menus, people, projects and tasks, clients (record only), Drive files (**never client-scoped files**), Office records. Later apps register theirs.
5. Notifications: one `notifications` table and one service (generalising migration 0034), unique key per event so the same event never creates two rows; drawer with kind and app filters; settings in the profile.
6. Profile page `#/profile/{about|account|notifications|appearance}` (the current profile moves out of Office; its functions stay).
7. Branding columns and storage for organization logos; logos always in a fitted tile.
8. Shared components with V8 classes: context menu, dialog (one instance, double-click safe), drawer with the right-panel size system and **independent scrolling**, toast with Undo, table, tabs, segmented switch, word + dot status, KPI band, skeleton, empty/error/permission states (10 s rule), shared timer service.
9. Performance baseline: measured timings per route before and after; one request per data need (in-flight de-duplication and a short cache in `api.js`).

## 4. Permission model (P01, used everywhere)

Extends what exists (`workspace_apps`, grants, `private.has_permission`): relationships (teammate / client contact / both), app access per person (on/off + level), feature switches (list in 03 §2.2 plus **Create personal projects** and the owner-grantable **Manage client access** for admins), client app defaults (Office, Projects, Tasks, Client Portal, Planner, Funnel Mapper, Forms, Value Ladder, Social Planner, Whiteboard, Layer 2 Agents), the **client edition of Office** per client (D6 assumption), Check access, Access review with `last_used_at`, audit log. All checks in the database/API, default deny, refusals read as "not found". Client access is editable in Office › Admin and inside each client record (same data).

## 5. Technical approach for the hardest owner items

| Item | Approach | Cost |
|---|---|---|
| Khushab weather atmosphere | Existing MET Norway weather operation, default point Khushab (32.30° N, 72.35° E), cached on the server. Weather code + temperature + time of day + month → one effect: clear (warm sun / cool winter light), haze, fog/mist, clouds, rain, wind, evening, night. No snow effect in the set. CSS/canvas layers, paused when the tab is hidden, off with reduced motion or the profile switch. Season/time fallback when the service is down | $0 |
| Search | Postgres full text + `pg_trgm` prefix/trigram on titles, one query per provider through the existing permission functions | $0 |
| Editor live presence, cursors, sync | Decided in P05 plan after testing what the current editor model supports; candidates on free plans: Supabase Realtime channels (already on the project) for presence/cursors, server-ordered operations for edits. Until it works end to end, the editor shows "Last edited by" (no fake presence) | $0 target |
| Document images | Content-addressed attachments (sha-256 key) owned by the document, compressed in the browser before upload (WebP/JPEG, max side limit), referenced from every version, freed only when no version references them; not listed as Drive files; counted in the 8 GB cap | $0 |
| Voice typing | Browser speech recognition with explicit modes: English, Urdu, **Mixed** (Urdu engine, English words kept via a small transliteration fix-up list the user can extend) and **Roman Urdu** (Urdu result transliterated to Latin script locally). Always inserts at the saved cursor; survives tab switches. Limits written down honestly | $0 |
| Sheets reliability | Fix the save path first (honest status), then formula coverage: a function table with tests for every function the UI offers (COUNTIF(S), SUMIF(S), AVERAGEIF(S), IF/IFS/IFERROR, AND/OR, VLOOKUP/XLOOKUP/INDEX/MATCH, TODAY/NOW/DATE math, TEXT, ROUND, SUMPRODUCT…), `#NAME?` only for truly unknown names with a clear message; Dream 100 workbook as the acceptance test | $0 |
| Plan/strategy → project | One Projects operation `createProjectFromPlan`, idempotent (request key + unique link row), focus areas → sections, objectives → tasks with owner/due, milestones and dependencies where Planner has them, document links as references | $0 |
| Public forms | `/f/<random link>` route on the same domain, served without sign-in, submission endpoint with rate limit, hidden spam trap, size/type limits, privacy line; optional Cloudflare Turnstile if the owner creates a key | $0 |

## 6. Owner answers (14 Nov 2026)

1. Client Portal Messages and Files: removed as V8 says (the one approved removal).
2. Dream 100 workbook: the owner will upload the .xlsx; the spreadsheet acceptance test waits for it.
3. "Pro notification" = the notification inbox.
4. D6 and D9: documented assumptions used unless the owner says otherwise.

## 7. Honest scope note

This is 179 pages, a new app (Tasks), a new permission model and deep editor work. It is delivered phase by phase as reviewable pull requests, each tested before merge, rather than one large change. The tracker shows the true state at every point; nothing is marked done without its test.
