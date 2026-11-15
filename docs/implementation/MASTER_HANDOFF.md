# Master handoff — V8 ecosystem, P00 + P01 (sessions up to 15 Nov 2026)

Short by design: it points to the original documents instead of copying them. Current verified state: `CURRENT_PROJECT_STATUS.md`. Quick start: `NEXT_SESSION_START_HERE.md`.

## 1. Project and architecture
- Repo `layer2funnels-bot/l2f-ecosystem`. Static web app `apps/web` (vanilla ES modules, hash routes `apps/web/js/routes.js`, shell `views/shell.js`),
  embedded apps (`apps/projects`, `apps/planner`, `apps/funnel-mapper`, TypeScript), API in `packages/core` (`defineOperation`, run as `app_user`
  with row-level security; Projects V2 ops in `packages/core/pm`), PostgreSQL migrations in `migrations/` (+ `migrations/rollback/`).
- Hosting: Cloudflare Pages (preview per branch). Database: Supabase project `l2f-ecosystem` (ref `dfitnxilkezepkhdmzuh`), shared by production and previews.
- Tests: `npm test` (pglite + API, `test/run.mjs`); browser suites `scripts/e2e-ui.mjs`, `e2e-onboarding.mjs`, `e2e-local.mjs` against the local
  Supabase stack (`dockerd &`, `npm run stack:start && npm run stack:migrate`); Playwright at `PLAYWRIGHT_MODULE=/opt/node22/lib/node_modules/playwright`.
  CI: `.github/workflows/ci.yml` (static checks, unit, e2e).

## 2. Authority and owner rules (mandatory)
1. **V8 is the design and product authority**: `docs/design/v8/Layer2Funnels_V8_Developer_Handoff/` — `00_MASTER_DOCUMENTATION`, `01_APPLICATIONS/<app>`,
   `02_DESIGN_SYSTEM`, `07_PROMPTS`, prototype `08_PROTOTYPE_AND_SOURCE/prototype-source/*.js|css` (the visual authority, incl. typography).
2. **V4 is the functional baseline**: keep every V4 function unless V8 removes it or the owner approves (`V4_FEATURE_PRESERVATION_MATRIX.md`).
3. Build a **whole application** before its PR; **one consolidated PR per application**; no fake buttons.
4. Organization and client data isolation; authorization enforced in the **backend/database**, not only the UI.
5. **Client Access Matrix: owners AND admins** (owner, 15 Nov 2026 — overrides V8's owner-only note); others only with an explicit grant.
6. V8 visual fidelity: typography, weights, spacing, sizes, colours, icons, responsive layouts, interactions.
7. **No merge, deploy or production data/schema change without explicit owner approval.** Never ask for credentials in chat. $0/month.
8. Use Claude economically: no repeated doc reviews; targeted tests while building, full suites at milestones; short reports.
9. Approved sequence (owner, 15 Nov 2026): P00 Foundation and Global Shell → P01 Office → **P02 Tasks** → P03 Drive with editors → P04 Projects → P05 Planner → P06 Clients → P07 Funnel Mapper → P08 Portal → P09 Whiteboard → P10 Forms → P11 Value Ladder → P12 Social Planner → P13 Agents → P14 Final Ecosystem Verification.

Planning documents (read once, don't redo): `V8_DOCUMENTATION_REVIEW.md`, `V8_IMPLEMENTATION_TRACKER.md` (requirements OR-01…OR-63, every page),
`ECOSYSTEM_PLAN.md`, `V8_CRITICAL_REQUIREMENTS_QA.md`, `SHELL_AND_LAUNCHER_PLAN.md`, `OFFICE_PLAN.md`, `V8_FIDELITY_REPORT.md`, `P00_NOTES.md`.

## 3. P00 — Foundation and Global Shell (branch `claude/epic-bohr-nc9jar`, PR #56)
- V8 tokens (`packages/ui/tokens.json` → css, `check:tokens`), prototype cascade `apps/web/v8-ledger.css` (generated, `check:ledger`), shared component
  layer `apps/web/v8-base.css`, V8 icons `apps/web/js/icons-v8.js` (`check:icons`).
- Shell: rail with org/apps/profile menus, collapsible sidebar, 52 px app bar, phone bottom bar + apps-and-account sheet, focused layout (`.focusbar`).
- Launcher (V8 sizes, Khushab weather effects automatic, snowfall winter visual; the two switches were removed by the owner).
- Global search (Ctrl K) with permission-checked providers; notifications for every app (migration 0054, bell drawer, per-app settings);
  Profile pages (migration 0055).
- Typography root cause fixed: **variable Geist / Geist Mono** (`apps/web/fonts/*-variable.woff2`, OFL) so V8's 550/560/620/650 weights render.

## 4. P01 — Office (branch `p01-office`, PR #57) — details in `OFFICE_REPORT.md`
- Page method: prototype markup and class names; scoped CSS generated from the prototype layers by `scripts/build-page-css.mjs` into
  `apps/web/pages/office.css` (root `.v8p-office`, `check:pages`); compare with `scripts/v8-compare.mjs <filter>`.
- Files: `views/home.js`, `funnels.js` (overview, `recordManager`, `v8head`), `office-offers.js`, `office-records.js` (Stories, Brand Kits),
  `office-avatars.js` + `modules/avatarimport.js` (Avatar Studio, Word/PDF import in the browser), `strategies.js` (+ template editor),
  `office-docs.js`, `office-team.js` (Team, member, Apps, Notification settings), `office-admin.js` (Admin; reuses V4 `admin.js` via `adminView({ parts: true })`).
- Server: `packages/core/office-operations.mjs` (template, sections, team, avatar versions, access/app/feature switches, review, client matrix, branding),
  `funnel-operations.mjs` field lists, `pm/server/ops/resources.ts` (`activity.org.feed` + `actor`), `projects-compat-operations.mjs` (`office.projects.list`).
- Unsaved work: `dirty.set(label, save)` / `dirty.clear()`; save functions return `true` and take `leaving` (no navigation when called by the guard).

## 5. Known gaps / decisions
- Deliberate differences from V8 (no fake controls): no per-app level select on teammate access; no storage thinning switches; avatar "→ Task"/"Add to strategy" omitted;
  Client Access Matrix takes effect for clients when the Portal opens; email digest waits for an approved provider.
- Projects V2 list operations are slow (RLS per row) — fix in the Projects phase.
- Planner left the Office menu (V8: its own app); old `#/office/planner` links still route to Planner.

## 6. Database migrations
| # | File | Phase | What |
|---|---|---|---|
| 0054 | `0054_notifications_every_app.sql` | P00 | notifications for every app, `private.notify`, `my_inbox`, `notification_prefs` |
| 0055 | `0055_profile_details.sql` | P00 | profile full name, job title, time zone, about |
| 0056 | `0056_office_v8.sql` | P01 | offer/story/brand-kit fields, several brand kits (one main), `strategy_templates`, `doc_sections` |
| 0057 | `0057_avatar_studio.sql` | P01 | avatar look/role/market/stage/version/profile, `avatar_versions` |
| 0058 | `0058_admin_access_v8.sql` | P01 | `app_usage`, teammate app/feature functions, access review, `client_app_defaults` / `client_app_access` (`clients.apps.manage`: owner + admin), workspace branding |
All additive, each with `migrations/rollback/<n>.down.sql`. Details of 0054/0055: `MIGRATIONS_0054_0055.md`.
**Production: at 0053; 0054–0058 NOT applied** (owner authorized 15 Nov, blocked by the backup requirement — see status file).

## 7. How to verify after applying
`list_migrations` shows 0054–0058 after 0053 · `get_advisors(security)` has no new findings · `select has_function_privilege('anon', 'public.my_inbox(int,text,text)', 'execute')` is false (same for the 0055/0058 functions) ·
policies exist on `notification_prefs`, `strategy_templates`, `doc_sections`, `avatar_versions`, `app_usage`, `client_app_defaults`, `client_app_access` ·
`select key, default_role from permissions where key = 'clients.apps.manage'` → admin · preview: bell, Profile › About, Office › Funnels/Documents/Admin load.

## 8. Testing results (local, 15 Nov)
Unit 66 suites green; office 33/33; web 56/56; e2e-ui 265/265; onboarding 22/22; e2e-local 71/71; V8 comparison of 22 Office pages.

## 9. Git
- `main` (V8 docs, PR #55 merged) · `claude/epic-bohr-nc9jar` (P00, PR #56 draft) · `p01-office` (P01, PR #57 draft, base = P00 branch).
- Merge order when approved: #56 into `main`, then retarget #57 to `main` and merge.

## 10. Next steps
1. Backup (owner) → apply 0054–0058 → verify (§7) → update the status file.
2. Owner decisions on merging #56 and #57.
3. Next application: **P02 Tasks**, then Drive with editors, Projects, Planner, Clients. Follow the same method: read its V8 app folder once, audit V4, build the whole app, one PR.
