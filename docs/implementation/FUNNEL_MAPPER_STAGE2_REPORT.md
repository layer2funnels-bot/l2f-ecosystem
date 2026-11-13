# Funnel Mapper: stage 2 report (13 Nov 2026)

Stage 2 makes Funnel Mapper a real ecosystem app: one sign-in, one database, one permission system. Owner decisions (13 Nov): **retire independent accounts**, **host on Cloudflare**, the owner restores access to the old database, and **only the owner's account switches first**.

## 1. Already present before this stage
Stage 1 (PR #47): code copy in `apps/funnel-mapper`, rename, original theme, migration 0052 (shared clients), `fmp.clients.*` operations, matching tool, dry run.

## 2. Done in this stage (tested)
- **Database, migration 0053** (`migrations/0053_funnel_mapper_data.sql`): funnels, versions, real numbers (actuals), products, share links (only a SHA-256 hash of the link is stored), comments, templates, saved styles/blocks, organization settings. Every table is limited to its organization; access needs the Funnel Mapper permission **and**, for client data, the right to see that client (a person limited to one client sees only that client's funnels). Public share links only through checked functions.
- **API** (`packages/core/fmp-data-operations.mjs`): every Funnel Mapper read and write is an operation (`fmp.funnels.*`, `fmp.versions.*`, `fmp.actuals.*`, `fmp.products.*`, `fmp.templates.*`, `fmp.assets.*`, `fmp.links.*`, `fmp.comments.*`, `fmp.settings.*`, `fmp.clients.trash/restore/purge`, `fmp.files.upload/url`), plus the public `/api/public/fmp-share` for share links (rate-limited).
- **The app** (`apps/funnel-mapper`): signs in with the ecosystem account; the server and the browser call the ecosystem API (browser through the same-site relay `/api/eco/[op]`, allow-listed). No direct database access is left in the app. Clients are the shared Clients-app records. Team, invitations, roles and branding are managed in **Office › Admin**; Funnel Mapper's Settings keeps profile, default currency, appearance and account. A new `/unavailable` page explains when Funnel Mapper isn't switched on for someone.
- **Independent accounts retired** in the code: private sign-up page, service key and invite code removed.
- **Images**: shrunk in the browser (WebP under 100 KB, same rule as before) and stored in the organization's files under `<org>/fmp/…`; shown through 1-hour signed addresses. The server image tool (sharp) is gone.
- **Cloudflare**: Next 16.4.6 with `@opennextjs/cloudflare`; the server bundle is **2.76 MiB compressed, under the free plan's 3 MiB limit** (was 3.79). `npm run cf:build` then `npm run cf:size` checks it. Nothing was deployed.
- **Fixes found on the way**: a person limited to one client could see other clients' funnels (fixed: client check on every table, FD3/FD10/FD11); typing one number in the real-numbers grid cleared the other numbers of that row (fixed, FD9); `org.list` needed the API's "no organization" marker (found in the browser test).

## 3. Old database (read-only look, nothing changed)
Owner reset the password; queried read-only on 13 Nov:
- 4 workspaces: **Layer2Funnels** (team) and 3 personal ("Aurj", "Live check …", "Hammad Workspave"). The 3 personal ones hold **no clients, funnels, products or templates**, so retiring them loses nothing; there is nothing to export for them.
- Layer2Funnels: 4 clients, 7 funnels, 54 versions, 28 real-number rows, 3 products, 1 saved template, 0 share links, 0 comments; 37 stored images (2 logos, 1 thumbnail, 34 page captures).
- **Matching report** (exact e-mail only; names only for review): all **4 clients are new** to the shared list (the live shared list holds 2 unrelated clients). No duplicates, nothing ambiguous. The report with names is kept outside the repository (private data).

## 4. Tests (actual results, 13 Nov 2026)
| Check | Result |
|---|---|
| Ecosystem `npm test`, PGlite | all groups pass; `fmp-data` 33/33 |
| Ecosystem `npm test`, real PostgreSQL (`DRIVERS=pg`) | all groups pass |
| Mutation check (security rules removed on purpose must be caught) | **114/114 caught** |
| Migration rehearsal (`npm run dryrun:fmp`) | 12/12 |
| Funnel Mapper unit tests (incl. golden funnel 89.1 / 6,032.11 / 5,582.11 / 13.40x) | 280/280 |
| Typecheck / lint | clean / 0 errors |
| `next build` and Cloudflare build | pass; 2.76 MiB |
| Copy ledger `check:fmp-copy` | pass |
| Browser walkthrough on the local ecosystem (sign in → home → new shared client → new funnel → editor "Saved" → funnels, clients, templates, trash, settings) | pass, no server errors; funnel stored in `fmp.funnels` on the shared client |

**Not verified yet:** the long Funnel Mapper browser suite (≈195 tests) against the ecosystem; it was written for the old database and needs updating. Share links and image upload were tested at API level, not yet clicked through in a browser.

## 5. Remaining work (each needs the owner's go-ahead)
1. **Live ecosystem database is far behind** (it has no `fmp` schema and an early `clients` table). Moving Funnel Mapper data first needs the ecosystem go-live: apply the pending migrations to the live project (or the planned new project), with the guarded scripts. This is the go-live step, not a Funnel Mapper step.
2. **Data move** (after 1): rehearsed `migrate.sql`, 4 clients created as new shared clients (matching report above), 7 funnels with versions, real numbers, products, template; 37 images copied; `id_map` for rollback; the old project kept read-only. Only the owner's account first.
3. **Cloudflare deploy**: needs a Cloudflare login on this session (or the owner's account) and the ecosystem addresses as settings. Free plan; nothing to buy.
4. Close the 3 empty personal workspaces in the old project after the move (nothing in them).
5. Update Funnel Mapper's own browser suite to the ecosystem setup.

## 6. Statement
No live database was changed, nothing was deployed, the original Funnel-Mapper repository and its live Supabase/Vercel projects were not touched. The old database was only read.
