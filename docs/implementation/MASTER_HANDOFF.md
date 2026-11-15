# Master handoff — V8 ecosystem: P00 Shell, P01 Office, P03 Tasks + the quality recovery (to 15 Nov 2026)

Short by design: it points to the documents instead of copying them. Current verified state: `CURRENT_PROJECT_STATUS.md`. Quick start:
`NEXT_SESSION_START_HERE.md`. Recovery details: `recovery/RECOVERY_BRIEF.md` (the owner's brief), `recovery/AUDIT_TRACKER.md` (defects and fixes),
`recovery/PERFORMANCE_REPORT.md` (measurements).

## 1. Project and architecture
- Repo `layer2funnels-bot/l2f-ecosystem`. Static web app `apps/web` (vanilla ES modules, hash routes `apps/web/js/routes.js`, shell `views/shell.js`),
  embedded apps (`apps/projects`, `apps/planner`, `apps/funnel-mapper`, TypeScript), API in `packages/core` (`defineOperation`, run as `app_user`
  with row-level security; Projects V2 ops in `packages/core/pm`), PostgreSQL migrations in `migrations/` (+ `migrations/rollback/`).
- Hosting: Cloudflare Pages project `l2f-ecosystem` (live: `office.tabishriaz.com` and `l2f-ecosystem.pages.dev`; preview per branch). API = Pages
  Function `functions/api/[[route]].js` (one DB connection per request; uses a `HYPERDRIVE` binding automatically if the owner adds one).
- Database: Supabase project `l2f-ecosystem` (ref `dfitnxilkezepkhdmzuh`), shared by production and previews.
- **Build**: `node scripts/build-web.mjs` → `dist/web`; since the recovery it bundles the app with esbuild (`scripts/bundle-web.mjs`, devDependency):
  hashed `/assets/app-*.js`, chunks per app (lazy-loaded from `app.js` `LAZY`), one `/assets/app-*.css` from the stylesheets `index.html` lists, and
  `/assets/*` cached immutably in `_headers`. Development serves the source; `WEB_ROOT=dist/web` makes the dev server serve the build.
- Tests: `npm test` (pglite + API); browser suites against the local Supabase stack (`dockerd &`, `npm run stack:start && npm run stack:migrate`):
  `scripts/e2e-ui.mjs`, `e2e-onboarding.mjs`, `e2e-local.mjs`, `e2e-tasks.mjs`, `e2e-recovery.mjs` (Playwright `PLAYWRIGHT_MODULE=/opt/node22/lib/node_modules/playwright`).
  Performance: `node scripts/perf-measure.mjs` (throttled, before/after with `WEB_ROOT`). CI: `.github/workflows/ci.yml`.

## 2. Authority and owner rules (mandatory)
1. **V8 is the design and product authority**: `docs/design/v8/Layer2Funnels_V8_Developer_Handoff/` (`01_APPLICATIONS/<app>`, prototype `08_PROTOTYPE_AND_SOURCE/prototype-source`).
2. **V4 is the functional baseline** (`V4_FEATURE_PRESERVATION_MATRIX.md`).
3. Whole application before its PR; one consolidated PR per application; no fake buttons.
4. Organization and client isolation; authorization in the backend/database.
5. **Client Access Matrix: owners AND admins.**
6. **No merge, deploy or production data/schema change without the owner's explicit approval.** Never ask for credentials in chat. $0/month.
7. Inspect before changing; fix root causes; don't rebuild working parts; economical use of Claude.
8. **Sequence (owner, 15 Nov 2026)**: P00 Shell · P01 Office · **P02 Projects** · **P03 Tasks** · P04 Drive · P05 Planner · P06 Clients · P07 Funnel Mapper ·
   P08 Portal · P09 Whiteboard · P10 Forms · P11 Value Ladder · P12 Social Planner · P13 Agents · P14 Final Verification.
   Tasks was built under the name “P02” (branch `p02-tasks`, migration `0059_tasks`, `TASKS_PLAN.md`/`TASKS_REPORT.md` keep their names); it is P03.
   **Projects (P02) is not rebuilt to V8 and not complete.** Owner's explicit instruction: the next session starts **Drive (P04)** — a deliberate
   sequence exception; Projects stays deferred.

## 3. P00 — Foundation and Global Shell (merged, PR #56)
V8 tokens and generated cascades (`v8-ledger.css`, `check:*`), shared component layer `v8-base.css`, V8 icons; rail/sidebar/app bar/phone sheet;
Launcher (Khushab weather); global search; notifications for every app (0054); Profile (0055); variable Geist; text size (`scripts/textscale.mjs`).
Recovery: Launcher bell in V8 colours; **Arrange apps** (owners/admins drag or use arrows; per organization, `workspace_app_order`); organization
logos on the rail and menus (`org.icons`); the `[hidden]` attribute always hides (`v8-base.css`).

## 4. P01 — Office (merged, PR #57) — `OFFICE_REPORT.md`
Pages from prototype markup with generated scoped CSS (`apps/web/pages/office.css`, root `.v8p-office`). Recovery changes:
- **Avatar Studio** rebuilt on a flexible section model (`modules/avatarmodel.js`): sections = the document's top headings, parts = sub-headings,
  content blocks (sub-heading, paragraph, list item, table). Import review (`views/office-avatars.js`) shows each section, its suggested kind,
  per-part moves and a text preview; nothing is dropped unless chosen. Block editor; add/rename/retype/reorder/delete sections; Profile cards chosen
  per avatar (a section, its first table, or a sub-heading; removing a card keeps content); **Avatar settings** (defaults for new avatars only,
  `avatar_settings`). Older fixed-chapter avatars convert on read. Reference document: `recovery/Dream_Customer_Avatar_Farhat_V1.0.docx`.
- Stories, Brand Kits, Offers return to their list after saving (one save at a time; errors keep the form); Brand Kit fonts are typed freely with
  a real render check (`fontRenders`).
- Admin: Teammate access switches in the `write` rate class, re-read after every change, stale-answer guard; **Access Review removed**;
  **Organization** tab (rename, logo shrunk to 128 px, preview, default strategy template version); Client Access Matrix includes **Office**.
- Documents: **Add from Drive** links a shared Drive file into a section (`doc_links`; no copy, no move; labelled “Linked from Drive”).
- Clients and Office: a client contact sees shared Office records only while Office is on for their client (row rule + `portal.office.list`
  projection without internal notes, evidence or interviews). The Portal itself is still locked (P08).

## 5. P03 — Tasks (merged, PR #58) — `TASKS_REPORT.md`
Recovery: no duplicate tasks on slow connections (one create per place; capture box empties at once); Show/Hide completed always at the list
bottom; New list or folder with V8 people chips, per-person Can edit/Can view, Everyone, People only for team; folders as tree rows with
“+ new list here”, ⋯ menu, “Move to folder…” on lists; the task outline is never sticky/hidden on tablets (class collision with the prototype).

## 6. Database migrations
| # | File | Phase | Production |
|---|---|---|---|
| 0054–0059 | notifications, profile, office, avatar studio, admin access, tasks | P00–P03 | **applied 15 Nov** (backup schema `backup_20261115`) |
| 0060 | `0060_recovery.sql` | recovery | **not applied** — needs the owner's go. Drops Access Review functions + `app_usage.reviewed_at`; adds `workspace_app_order` + `launcher_order_set`, `workspace_rename`, branding for admins, `my_org_icons`, `avatar_settings`, `doc_links`; funnel record select rule requires Office on for client contacts; grants `client_app_enabled` to `app_user`. Rollback tested locally (down → up). |
Verify after applying: `list_migrations` ends with 0060 · the 3 new tables exist with RLS · `has_function_privilege('anon', 'public.workspace_rename(text)', 'execute')` false ·
`select count(*) from pg_proc where proname like 'access_review%'` = 0 · `get_advisors(security)` no new findings.

## 7. Tests (local stack, 15 Nov)
See `CURRENT_PROJECT_STATUS.md` › Tests for the final numbers (unit all green; browser suites run against the bundled build).

## 8. Known remaining issues
See `CURRENT_PROJECT_STATUS.md` › Remaining issues and `recovery/PERFORMANCE_REPORT.md` › Remaining bottlenecks.
