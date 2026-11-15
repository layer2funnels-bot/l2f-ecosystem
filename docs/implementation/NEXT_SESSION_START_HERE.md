# Next session — start here (written 15 Nov 2026, end of the quality-recovery session)

**Project:** Layer2Funnels ecosystem (`layer2funnels-bot/l2f-ecosystem`): one shell (rail, Launcher, search, notifications, profile) and many apps,
rebuilt app by app to the V8 "Ledger" design. Two organizations — Layer2Funnels and Aurj — never mix. Owner: Tabish.
Live: `office.tabishriaz.com` (Cloudflare Pages `l2f-ecosystem`, deploys `main`). Database: Supabase `l2f-ecosystem`, ref `dfitnxilkezepkhdmzuh`.

## 1. The owner's explicit instruction for this session
**Start Drive (P04 — Drive with editors).** This is a deliberate sequence exception: **Projects (P02) is not rebuilt to V8 and stays deferred**
(do not mark it complete). Tasks, built earlier as “P02”, is P03.

Before Drive, check two things are settled (ask the owner only if not):
1. **Recovery PR** (branch `claude/epic-bohr-nc9jar`, see `CURRENT_PROJECT_STATUS.md` › Git): merged? If the owner approved it, merge it.
2. **Migration 0060** on production: applied? It must be applied (with a fresh backup, as on 15 Nov: in-database snapshot schema) **before or together
   with** merging the recovery PR, because the new code calls its functions. Verify with the checklist in `MASTER_HANDOFF.md` §6.
   Also suggest the Hyperdrive binding (`recovery/PERFORMANCE_REPORT.md` › Remaining 1) — the code already uses it when present.

## 2. First task in Drive
Read `docs/design/v8/Layer2Funnels_V8_Developer_Handoff/01_APPLICATIONS/` Drive folder once (pages, features, components), audit the live
Drive module (`apps/web/js/modules/drive.js`, `docs.js`, `sheets.js`, `pdfeditor.js`, `imageeditor.js`, `whiteboard.js`, `packages/core/drive-operations.mjs`)
against it and V4, write `docs/implementation/DRIVE_PLAN.md` (page → file map, gaps, migrations from **0061**), then build the whole app on a new
branch and open one PR. Use the same method as Office/Tasks: prototype markup and class names, generated scoped CSS — and **watch for class-name
collisions** with the generated page CSS (two live bugs on 15 Nov came from that: `.fold`, `.outline`).

## 3. How things work (enough to start)
- See `MASTER_HANDOFF.md` §1 (architecture, build with esbuild bundle, tests) and §2 (owner rules).
- Every browser suite can run against the production build: `node scripts/build-web.mjs && WEB_ROOT=dist/web node scripts/e2e-ui.mjs`.
- Test on a slow connection too (Playwright route delay, as `e2e-recovery.mjs` TK1): the live API takes 0.3–0.6 s per call.
- Lazy apps: add a new app's module to `LAZY` in `apps/web/js/app.js`, not as a static import.

## 4. Never
- Never merge, deploy, or change production data/schema without the owner's explicit approval for that step.
- Never ask for credentials in chat. $0/month (free plans only).
- Never re-apply migrations already in `list_migrations`; take a verified backup before any production migration.
- Never add fake buttons; never drop V4 functionality unless V8 removes it or the owner approves.
- Never enforce permissions only in the UI. Client Access Matrix = owners AND admins.
- Never claim live is fixed without testing it signed in on live (ask the owner for a safe test account through the app, not credentials in chat).
