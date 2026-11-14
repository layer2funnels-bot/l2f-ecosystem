# Claude Code: next-chat handoff (updated 14 Nov 2026: Funnel Mapper live)

> **14 Nov 2026: start with `docs/START_HERE_NEXT_CHAT.md`.** Design **V8** replaces V7 (V7 had many mistakes); the live software uses the **V4** design.

Read this first. It replaces the need to re-explain the project. The owner (Tabish Riaz, non-technical founder; pronouns not stated in the repo, use "they") wants short plain-English reports, evidence instead of claims, $0 extra cost, and no permission questions for routine work; anything irreversible, live or data-moving still needs their approval.

## 0. Current state (14 Nov 2026) — read this first
**Funnel Mapper is live at https://office.tabishriaz.com/fmp** (one address for every app; one ecosystem sign-in; fresh start with only the 13 built-in templates; switched on for Layer2Funnels and Aurj; app grants for owners and editors; the Launcher tile opens it).

| Piece | State | Evidence / where |
|---|---|---|
| Code | `main` at `0f214b3` (PRs #49–#53 merged) | `apps/funnel-mapper/`, change ledger `docs/FMP_CHANGES.md` (`npm run check:fmp-copy` passes) |
| Live database `dfitnxilkezepkhdmzuh` | migrations 0001–0053 applied (0052, 0053 on 13 Nov); `workspace_apps.launch_url = https://office.tabishriaz.com/fmp` for both organizations | `migrations/0052_*`, `0053_*` |
| Cloudflare | Worker `funnel-mapper` (created 14 Nov, from `main` 3429810, version `24e745b5`; no route, no workers.dev); Pages project `l2f-ecosystem` gets `/fmp` through `functions/fmp/[[path]].js` + service binding `FMP` in `wrangler.toml`; R2 `l2f-ecosystem-files` CORS already allowed the site (not modified); DNS/zone untouched | `docs/implementation/FUNNEL_MAPPER_CLOUDFLARE.md` (resources, permissions, order, undo, go-live log) |
| Live checks (signed out) | 4/4: `/fmp/clients` → ecosystem sign-in; share page answers, made-up link opens nothing; `/fmp/robots.txt` 200; `/api/health` 200 | `node scripts/fmp-cloudflare-golive.mjs verify` |
| Signed-in walkthrough on live | **not done by the assistant** (cannot sign in as the owner); asked the owner to try Launcher → Funnel Mapper, client, funnel, logo upload, share link | — |

**Redeploying the Worker** (only after Funnel Mapper code changes merge to `main`; the Pages site redeploys itself from git):
- Token: the owner saved a Cloudflare token as this cloud environment's network secret for `api.cloudflare.com` (the proxy adds it; never ask for it in chat). It is **full access and expires 21 Nov 2026**; recommended to replace with a token limited to Workers Scripts Edit + Workers R2 Storage Edit. A later session may not have it; then ask the owner to add one under the environment's Network secrets.
- Node's `fetch` ignores the proxy: run `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node scripts/fmp-cloudflare-golive.mjs check`.
- `wrangler deploy` fails at the static-file upload (401) because the proxy replaces wrangler's short-lived upload key with the API token. Working method (14 Nov): build with `npm run cf:deploy` (or `cf:build:live`) in `apps/funnel-mapper`, then run `wrangler deploy --config wrangler.production.jsonc` with all proxy variables unset and a preload dispatcher that sends only `/workers/assets/upload` requests directly and everything else through the proxy (`SPLIT_PROXY=$HTTPS_PROXY`, `NODE_OPTIONS=--import <split-dispatcher.mjs>`, undici from `apps/funnel-mapper/node_modules`). The dispatcher is `scripts/cf-split-dispatcher.mjs`; exact command in the go-live log of `FUNNEL_MAPPER_CLOUDFLARE.md`.

**Lessons from this go-live**
- On the live address Next.js shortens a same-address redirect (`https://office.tabishriaz.com/#/signin…` → `/#/signin…`); the gateway must not add `/fmp` to the web app's `/#` routes (fixed, GW3). Previews on `*.pages.dev` don't show this: always run `verify` on the live address after a merge.
- A Pages service binding to a Worker that doesn't exist fails the whole site deploy: publish the Worker first, then add the binding.

**Still open for Funnel Mapper (owner's go-ahead per item)**
1. Owner's signed-in walkthrough on live; fix what they report.
2. Client accounts (people outside the team) have no Funnel Mapper access: owner's decision.
3. Rewrite Funnel Mapper's own browser suite and old database tests (`apps/funnel-mapper/tests/e2e`, `tests/integration`) for the ecosystem setup (not in CI).
4. Funnel Mapper items in the ecosystem's shared search.
5. The old Funnel Mapper Pro project (separate repo, Supabase, Vercel): untouched; owner decides when to retire it.
6. Replace or delete the full-access Cloudflare token (expires 21 Nov).

## 1. Project overview
- **Layer2Funnels + Aurj ecosystem**: one sign-in for two strictly separate organizations (Layer2Funnels, a funnel agency; Aurj, an education business) and many apps: Launcher, Office, Projects, Tasks (new), Clients, Client Portal (locked), Drive + editors, Planner, Funnel Mapper, Forms, Value Ladder, Social Planner, Whiteboard, Layer 2 Agents (design only).
- **Repository**: `layer2funnels-bot/l2f-ecosystem`. Web app = plain ES modules (`apps/web/js`, hash routes), API = Cloudflare Pages Function (`packages/core`, typed operations in `*-operations.mjs`), database = Supabase Postgres with row security (`migrations/00NN_*.sql`), tests in `test/` (`npm test`) and browser suites in `scripts/e2e-*.mjs`. Live: https://office.tabishriaz.com (Cloudflare Pages deploys from `main` through Cloudflare's own GitHub connection).
- **Why V7**: the final approved design round. It fixes v6 feedback (sizes one step up, rail shell, per-app identity) and adds new pages and apps.
- **The package** is installed at `docs/design/v7/` (byte-identical to the zip, 203 files). Inventory, screenshot↔route map, inconsistencies and a critical design review: `docs/design/v7/V7_PACKAGE_INVENTORY.md`.

## 2. How to use V7
- V7 is the **primary reference, not a copy order**. Keep its strong ideas; when a screen or interaction is weak, improve it and record *V7 proposed / issue / decision / why* (example: `docs/implementation/FUNNEL_MAPPER_DESIGN_DECISIONS.md`).
- Never copy prototype data, toasts or fake actions. The prototype (`ecosystem-v7.html#/map`, `prototype-source/`, later files override earlier) shows layout, sizes and motion.
- Status marks in briefs: [E] keep, [R] redesign, [N] new, [F] future (show "Later" only where the brief says).
- Known package inconsistencies (read them before starting): Funnel Mapper repo location (now this repo, FM-6); README says P02 = Projects but the files say P02 = Clients (follow the files); token stylesheet is `apps/web/v4.css`, generated from `packages/ui/tokens.json` (never hand-edit it); the prototype's Funnel Mapper editor is a simplification (the real editor is the reference); client status "Lost" belongs to P02.

## 3a. Funnel Mapper stage 2 (13 Nov 2026): read `docs/implementation/FUNNEL_MAPPER_STAGE2_REPORT.md` first
Funnel Mapper uses only ecosystem API operations (migration 0053, `packages/core/fmp-data-operations.mjs`) and the ecosystem's ONE sign-in (shared session cookie, DECISIONS FM-10; it has no sign-in pages). Fresh start: no old data, only the 13 built-in templates (FM-9). Organization switching and Settings are the same as the other apps; independent accounts retired; Cloudflare build fits the free plan (2.76 MiB). Go-live migrations and the Cloudflare deploy are done (§0); the browser-suite rewrite is still open. The "stage 2" items below about moving data are cancelled (FM-9).

## 3. Funnel Mapper migration report (stage 1)
Full report: `docs/implementation/FUNNEL_MAPPER_REPORT.md`. Plan: `docs/implementation/FUNNEL_MAPPER_PLAN.md`. Changes per file: `docs/FMP_CHANGES.md`.
- **Original**: `layer2funnels-bot/Funnel-Mapper` (Next.js 16, Supabase, React Flow, Zustand), commit `13a1e86`; no new commits since the copy. Untouched, as are its live Supabase and Vercel projects.
- **New location**: `apps/funnel-mapper/` (full app: pages, editor, maths, reports, sharing, exports, its own Supabase migrations and tests). Launcher entry/manifest: `apps/funnel-mapper-pro/app.manifest.json` (app key `funnel_mapper_pro`).
- **Already present before this stage**: exact code copy (FMP-4, tag `fmp-copy-pristine`, integrity check `npm run check:fmp-copy`), reshape step 1 (rolled back now), migration dry run (`scripts/fmp-dryrun/`, `docs/FMP_MIGRATION_PLAN.md`).
- **Done in this stage** (tested): rename to "Funnel Mapper" in every user-facing place; original dark navy + emerald identity, sidebar and light/dark restored; sizes one step up (map blocks unchanged); migration **0052** (app name, `fmp.*` permissions, `fmp.client_commercial`, `fmp.id_map`); API `fmp.clients.list / match / create / commercial.set` on the shared `clients` rows; duplicate rules (e-mail exact → person decides, name only → review, ambiguous → choose; never automatic); Funnel Mapper-side shared-client module and decision step, **off** until the ecosystem sign-in exists; Funnel Mapper migration adding `clients.ecosystem_client_id`; offline matching report `scripts/fmp-client-match.mjs`.
- **Not done (stage 2, needs owner approval)**: Funnel Mapper still signs in with its own accounts and reads its own database for funnels (≈112 data calls); the ecosystem sign-in bridge; moving live data (rehearsed `migrate.sql`, matching report approved first, `id_map` rollback, old project kept read-only); storage move; hosting the Next.js app from this repo (Vercel root directory `apps/funnel-mapper` or Cloudflare per `docs/FMP_CLOUDFLARE_SPIKE.md`); independent accounts decision; applying 0052 live. (Historical: superseded by stage 2 and the 14 Nov go-live, §0.)

## 4. Ecosystem architecture (how an app connects)
| Concern | Where | Funnel Mapper status |
|---|---|---|
| Sign-in | Supabase Auth of the ecosystem project; API checks the token (`packages/core/jwt.mjs`) | Ecosystem sign-in only (shared `l2f-session` cookie, FM-10) |
| Organization context | `x-org-id` header → `ctx.orgId`; never from the body; `private.org_in_scope` restrictive policies (WCIGA) | Shared-client ops use it (built) |
| Permissions | `public.permissions` catalogue + `private.has_permission(ws, key, client, project)` (app switch ∧ app grant ∧ role floor ∧ levels/overrides with client/project scope = SDOR); default deny; a refusal reads as "not found" | `fmp.*` keys added (0052) |
| Launcher / app list | `apps` table + `apps/*/app.manifest.json`; `workspace_apps` per organization | On for Layer2Funnels and Aurj; tile opens `/fmp` |
| Clients | `clients` + `client_profiles` (Clients app owns identity); other apps key their data by `client_id` with composite foreign keys | Shared `clients` rows; fresh start, no data moved (FM-9) |
| Files | Drive storage adapter (R2), `files` with owner app and context; references, not copies | Logos/images: signed R2 uploads, counted in the storage cap (`fmp.images`, 0053) |
| Audit | `private.audit_change` triggers → `audit_events` | Pricing changes audited |

## 5. Remaining work, known issues, open decisions
- **Pending owner decisions**: Funnel Mapper items in §0; D3–D10 in `docs/design/v7/docs/04_OPEN_DECISIONS.md`.
- **Known**: Funnel Mapper browser suite is long (≈195 tests; runs monthly in CI and on demand); `workspaces.spec.ts:210` measures a panel before it opens (known flaky test, same on the original); two FMP browser tests need a sign-up code and service-role key in `.env.local` (the monthly workflow writes local values).
- **Design to watch**: the rail + app sidebar on 1366 px laptops (collapse app sidebars below ~1280 px); Tasks vs Projects tasks overlap (decide one task store before P04).
- **Dependencies**: Funnel Mapper's full integration depends on P00 (rail, sign-in), P01 (Admin people/permissions) and P02 (Clients shared record UI).

## 6. Instructions for the next chats (one app per chat)
1. Read this file, then the app's brief `docs/design/v7/docs/apps/1N_*.md` and its prompt `docs/design/v7/prompts/P0N_*.md`, plus the four core docs (`docs/00`–`04`) and the manager's process document (`reference/*.docx`).
2. Follow P00 Foundation rules and this repo's architecture: `docs/ARCHITECTURE.md`, `docs/DECISIONS.md` (WCIGA/SDOR, FMP-*, FM-6…8), `docs/DEVELOPER_HANDOVER.md`.
3. Look at the app's screenshots (`screens/desktop/NNN_<route>.jpg`), tokens (`assets/tokens.*`) and icons (`assets/icons.*`).
4. Inspect the existing app before changing it; preserve every working feature unless the brief says otherwise.
5. Improve weak V7 decisions with reasons; don't copy blindly.
6. Every permission is enforced in the database/API, default deny; Layer2Funnels and Aurj never mix; never hide-only.
7. Migrations: check the next free number on `origin/main` and open branches right before creating one; additive, reversible, local first; live only with approval (guarded `scripts/golive-*.sql`).
8. Test: `DRIVERS=pglite npm test`, the relevant `scripts/e2e-*.mjs` on the local stack (`npm run stack:start && npm run stack:migrate`, `PLAYWRIGHT_MODULE=/opt/node22/lib/node_modules/playwright`), `scripts/e2e-sweep.mjs` for editors; screenshots at 1366/768/390, light/dark, both organizations.
9. Report: done vs planned, files, migrations, tests with real results, screenshots, known issues, decisions needed. PR to `main`; the owner merges.

**Build order (from V7)**: P00 Foundation → P01 Office → P02 Clients → P03 Projects → P04 Tasks → P05 Drive → P06 Planner → P07 Funnel Mapper (stage 2 continues here) → P08 Portal/Whiteboard/Forms/Ladder/Social/Agents → P09 regression.
**Shared services each app must use**: shell rail + Launcher (P00), global search (pointer index, re-check every hit), notifications service, profile page, context menus, permission catalogue + `has_permission`, Clients' shared client record, Drive file references (`file_links`), audit triggers, storage adapter.

## 7. Confirmation
Up to 14 Nov 2026 the work covered the V7 package, Funnel Mapper (stages 1–2 and go-live) and documentation. The owner asked to work on Funnel Mapper only ("We just need funnel mapper for now"): **don't start other apps unless the owner asks.**
