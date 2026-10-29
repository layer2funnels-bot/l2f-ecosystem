# Planner integration: status (branch `feature/planner-strategy`)

Base: `main` at `b76441c` (unchanged since the package was built). Package: `planner-integration-for-l2f-ecosystem.zip` (2026-10-29), applied unchanged first, then corrected.
Labels: **verified** = run in this repository; **not run** = needs staging or live access.

## What the branch adds
- `apps/planner` (React + Vite, base `/planner/`), `migrations/0033_planner_strategy.sql` (25 tables, RLS, `planner.*` permissions), `packages/core/planner-strategy-operations.mjs` (one API operation per function, `planner.strategy.*`), tests, product docs.
- Existing files touched: `apps/web/js/routes.js` (Office menu item opens `/planner/`), `scripts/build-web.mjs` (copies the Planner build to `dist/web/planner`), `packages/core/operations.mjs` (registers the operations), `test/audit.test.mjs`, `test/run.mjs`, `scripts/dev-server.mjs` (serves `/planner/` locally), `scripts/e2e-ui.mjs`.

## Defects found and fixed during integration (all with a test that fails without the fix)
| # | Defect | Fix | Proof |
|---|---|---|---|
| 1 | **Organization isolation gap (security).** None of the 25 new tables had the restrictive `org_scope` policy that ties rows to the request's `x-org-id`. A person in both organizations could read and change both organizations' Planner data under either header (id-only operations such as `get_plan`). | `org_scope` policy on all 25 tables | PS12, PS14 fail when the policy is removed (mutation check) |
| 2 | `uuid[]` arguments (`planner_reorder`, `planner_move_goal`) were sent as JSON text, so reordering and drag-move failed | arrays passed as arrays | PS15, PS16 fail when reverted |
| 3 | An unknown argument returned HTTP 500 | now 422 | PS17 |
| 4 | An objective whose parent was skipped by the nesting rules was created at top level | skipped with its parent | code change; no dedicated test (hard to build a refused parent through the API) |
| 5 | Single-column foreign keys let a strategy item or focus kind point at another workspace (direct table writes only) | composite keys `(workspace_id, …)` | PS18 |
| 6 | Sequences were not covered by the browser-role lockdown | `revoke all on all sequences` | statement added; no dedicated test |
| 7 | **Session expiry (cause of "page needs a refresh").** Planner read the token from storage but never refreshed it; after the token's hour a call failed until the person reopened the shell | Planner refreshes through the shell's own `session.js` / `gotrue.js`, retries once on 401, and ends with a clear message when the session is gone | `apiBackend.test.ts` (3 tests); browser PB9 |
| 8 | **Wrong organization.** Planner ignored the ecosystem's active organization (own remembered choice) and its own switching never told the ecosystem | uses `org.list` `is_active`, same default rule as the shell, switches through `org.switch` | `apiBackend.test.ts`; browser PB7–PB9b |
| 9 | Planner's page loaded Google Fonts, which the site's page policy blocks (`style-src`/`font-src 'self'`) | uses the site's self-hosted `/fonts.css` | browser PB5, PB6 |

## Checks
| Check | Result |
|---|---|
| `npm --prefix apps/planner test` | verified: 37/37 pass |
| `tsc --noEmit` (apps/planner) | verified: clean |
| `npm --prefix apps/planner run build` | verified: builds |
| `DRIVERS=pglite npm test` (all repository suites with 0033) | verified: 50 suites pass, `planner-strategy` 18/18, `direct-access` 19/19, `isolation` 47/47, `audit` 63/63 |
| `node scripts/build-web.mjs`, `check:tokens`, `check:secrets` | verified: pass |
| Browser journey `scripts/e2e-planner.mjs` (local stack, real sign-ups, two organizations) | verified: 16/16 |
| Whole browser suite `scripts/e2e-ui.mjs` (local stack, includes the Whiteboard editor) | verified: 241/241 |
| GitHub Actions (test, e2e, fmp-copy) | **not run**: the jobs end in 2 s with no runner (account usage restriction), so no CI result exists |
| Staging, live | **not run** |

## Loading investigation
- Signed in, Planner downloads about 460 KB of script and no database engine or WebAssembly (verified in the browser: PB2). The demo engine (13 MB WebAssembly) is only fetched with `?demo` or when signed out.
- Every API call on first load answers 200; first load under 4 s on the local stack (PB3, PB4). **Real latency (Mumbai database, Cloudflare Pages) is not verified: it needs staging.**
- Causes found for "needs a refresh": expiring token without refresh (7) and organization disagreement (8).

## Open items and risks (not fixed here)
1. **Not yet mounted in the shell header / organization switcher.** `/planner/` opens as its own page with its own rail. The master prompt lists this as a follow-up commit (the app has an `embedded` mode). The Office menu item leaves the shell.
2. **Styling is Planner's own (`signal-v4.css`)**, not `packages/ui/tokens.css`; the theme is not synced with the shell's theme choice.
3. Search types and notifications (onboarding checklist items 9–10) are not registered.
4. Review notes not fixed: readings and saved views can still be written on an archived plan; a person with `planner.plan.manage` but without `planner.goal.create` cannot create a plan from a strategy (shown as "not found"); `private.planner_*` helper functions are granted to `app_user` wholesale (matches the repository convention); a missing required argument still returns 500 (42883).
5. The production bundle ships the 13 MB demo WebAssembly files (lazy, unused when signed in). Excluding them from production would shrink the deploy.
6. Both `0015_planner.sql` (older backend) and 0033 exist; the older one has no screens. Retire later with a separate migration.
7. **Planner is not visible to anyone until the `planner` app is switched to `active` in the database** (a data change, not part of any migration) and people hold the grant. That is part of go-live.

## Needs the owner
- Migration 0033 on staging, then on production: **not applied anywhere except the local development stack**.
- Merge: **not done**.
