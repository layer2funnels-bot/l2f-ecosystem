# Funnel Mapper: stage 1 report (13 Nov 2026)

Plan: `FUNNEL_MAPPER_PLAN.md`. Design decisions: `FUNNEL_MAPPER_DESIGN_DECISIONS.md`. Per-file change ledger: `../FMP_CHANGES.md`. Next chats: `../design/v7/CLAUDE_CODE_NEXT_CHAT_HANDOFF.md`.

**Status in one line:** Funnel Mapper's code is in this repository, renamed, restyled to its approved identity with larger sizes, and the shared client list with the Clients app is built and tested locally. It is **not yet live from this repository and not fully integrated**: sign-in, funnel data, storage and hosting are stage 2 and need the owner's approval.

## 1. Already present before this stage
- Exact code copy of `Funnel-Mapper@13a1e86` in `apps/funnel-mapper/` (FMP-4, tag `fmp-copy-pristine`, integrity check). The original repository has no newer commits.
- "Reshape step 1" (light ecosystem colours, header instead of sidebar), never shipped.
- Migration plan and dry run with synthetic data (`docs/FMP_MIGRATION_PLAN.md`, `scripts/fmp-dryrun/`).

## 2. Done in this stage
| Item | Files | Evidence |
|---|---|---|
| V7 package installed and inventoried | `docs/design/v7/**`, `V7_PACKAGE_INVENTORY.md` | 203/203 files byte-identical (SHA-256); 122/122 screenshots match routes |
| Rename to "Funnel Mapper" (UI, titles, sign-in, e-mails, Launcher, app catalogue, manifest) | `apps/funnel-mapper/app/**`, `supabase/templates/*`, `apps/web/js/routes.js`, `views/launcher.js`, `strategies.js`, `funnels.js`, `apps/funnel-mapper-pro/app.manifest.json`, migration 0052 | New grep test `tests/unit/branding.test.ts` passes; FM1 |
| Approved identity restored (dark navy + emerald, sidebar with pinned clients and counts, light/dark) | reshape files restored from the tag (see ledger) | Screenshots `fm-shots/after-*` vs `copy-*` |
| Sizes one step up (pages and editor panels; map blocks unchanged) | `app/globals.css`, `components/editor/editor.css`, `text-[N px]` classes | Screens checked at 1366 and 390; block labels unchanged |
| Shared clients: database | `migrations/0052_funnel_mapper_clients.sql` (number checked against `main` and all branches) | `test/fmp-clients.test.mjs` 32/32 |
| Shared clients: API | `packages/core/fmp-operations.mjs` (`fmp.clients.list/match/create/commercial.set`) | same suite, through the API layer |
| Duplicate rules (never automatic) | same | FM8–FM13 |
| Server-side authorization only (app access, client scope, organization) | 0052 policies + op checks | FM15–FM30; 3 mutation controls caught |
| Funnel Mapper side (off by default) | `lib/ecosystem/clients.ts`, `lib/ecosystem/session.ts`, `app/(app)/actions.ts`, `components/client-form.tsx`, `app/(app)/clients/page.tsx`, FM migration `20261113000000_ecosystem_client_ref.sql` | `tests/unit/ecosystem-clients.test.ts` 6/6 |
| Matching report for the later data move | `scripts/fmp-client-match.mjs` | `test/fmp-client-match.test.mjs` 6/6 |

## 3. Database and API changes
- **0052** (local only, not applied live): `apps.name` → "Funnel Mapper"; permissions `fmp.funnel.view/create/edit/delete/share`; schema `fmp` with `client_commercial` (row security: Funnel Mapper access AND the client in scope AND the organization; audited) and `id_map` (no access for the app role). No data moved, no app switched on for any organization, no funnel tables yet (they come with the stage 2 code that uses them). Rollback: `drop schema fmp cascade; delete from permissions where key like 'fmp.%'; update apps set name='Funnel Mapper Pro' where key='funnel_mapper_pro';`.
- **Funnel Mapper's own database** (local migration, not applied live): nullable `clients.ecosystem_client_id`.
- New API operations listed above; every refusal reads as "not found".

## 4. Tests (actual results, 13 Nov 2026)
| Suite | Before | After |
|---|---|---|
| Funnel Mapper unit (vitest) | 279/279 | **286/286** (+7 new) |
| Golden funnel (`compute`) | traffic 2500, spend 450, customers 89.1, revenue 6032.109, profit 5582.109, ROAS 13.4047 | **identical to the last digit** |
| Funnel Mapper lint / build / typecheck | 0 errors / pass / pass | 0 errors / pass / pass |
| Funnel Mapper database tests (RLS, roles, workspaces) | 55/55 | **55/55** |
| Ecosystem unit + database (`DRIVERS=pglite npm test`) | – | **59/59 groups** (incl. fmp-clients 32/32, fmp-client-match 6/6, design-v4 22/22) |
| Copy integrity (`check:fmp-copy`) | – | pass (0 unrecorded, 0 stale) |
| Browser suite `e2e-ui` (fresh local database, migrations 0001–0052) | – | **242/242** |
| API end-to-end `test:e2e` | – | **71/71** |
| Mutation controls (FX ×3) | – | 3/3 caught |

**Not verified yet:** Funnel Mapper creating a client in the live Clients app end to end (needs the stage 2 sign-in bridge; covered today at API level: FM6/FM7 prove a client made through the Funnel Mapper operation appears in Clients and the other way round). Funnel Mapper's full 195-test browser suite (runs monthly in CI and on demand). The real-PostgreSQL driver run happens in CI.

## 5. Remaining work (stage 2, needs owner approval)
1. Approve the matching report on real exports (V7 D1), then the client data move (`id_map` rollback, old project read-only).
2. Identity bridge: Funnel Mapper signs in with the ecosystem account; `lib/ecosystem/session.ts` returns the real session; switch `ECOSYSTEM_CLIENTS=1`.
3. Funnel tables in `fmp` + the ≈112 data calls moved onto `fmp.*` operations; storage onto Drive paths; public share links endpoint.
4. Hosting from this repository (Vercel root directory or Cloudflare), then cut-over; apply 0052 and later migrations live with guarded scripts.
5. Decisions: independent accounts; when team/workspace settings move to Office › Admin (D2).

## 6. Statement
No other application's V7 implementation was started in this stage. Live databases, production services and the original Funnel Mapper repository were not touched.
