# Planner integration: status

Base: `main` at `b76441c` (unchanged since the package was built). Package: `planner-integration-for-l2f-ecosystem.zip` (2026-10-29), applied unchanged first, then corrected.
Labels: **verified** = run in this repository; **not run** = needs staging or live access.

## What the branch adds
- `apps/planner` (React + Vite, base `/planner/`), `migrations/0033_planner_strategy.sql` (25 tables, RLS, `planner.*` permissions), `packages/core/planner-strategy-operations.mjs` (one API operation per function, `planner.strategy.*`), tests, product docs.
- Existing files touched: `apps/web/js/routes.js` (Office menu item opens `/planner/`), `scripts/build-web.mjs` (copies the Planner build to `dist/web/planner`), `packages/core/operations.mjs` (registers the operations), `test/audit.test.mjs`, `test/run.mjs`, `scripts/dev-server.mjs` (serves `/planner/` locally), `scripts/e2e-ui.mjs`.

## Planner inside the shell (29 Oct, branch `claude/quirky-fermi-7vkj1c`)
Planner is now part of the shell instead of a separate page. **Verified** on the local stack unless marked otherwise.

| Area | Before | Now |
|---|---|---|
| Address | `/planner/` (own page, own left menu) | `/#/planner/<page>?plan=…` inside the shell. `/planner/` and old `/planner/#/planner/…` links redirect there; `/planner/?demo` keeps the local demo |
| Header and switcher | Planner's own brand, organization picker and theme button | The shell's header, organization switcher, app switcher, profile menu (theme) and skip link. Planner's sections are in the shell's app bar (bottom bar on phones), like Office |
| Launcher, app switcher | Planner tile went to `#/app/planner` = "Planner isn't built yet" | Both open `#/planner` |
| Organization switch | Planner's own picker, then a reload | The shell's switcher: Planner unmounts at once (old data gone), remounts for the new organization, a toast "Now in Aurj · Planner"; with a plan open, "That plan belongs to Layer2Funnels" + Switch back (UIUX_HANDOFF §7b) |
| Session | Planner refreshed the token itself (a copy of the shell's logic) | Every call goes through the shell's API client: one refresh path, the shell's "session expired" screen |
| Design | Planner's own token file `signal-v4.css` (values had drifted, e.g. muted text) | `signal-v4.css` removed; the shared `packages/ui/tokens.css` drives Planner; light/dark and the Aurj palette follow the shell |
| Style isolation | n/a | Planner renders in a shadow root (`apps/planner/src/embed.tsx`): 24 class names exist in both (`.menu`, `.badge`, `.drawer`…); without isolation the shell's `.menu` would hide Planner's Create menu |
| No access | Planner's own message after loading | The shell explains before mounting (not switched on / coming soon / no grant); the database refuses anyway |
| Navigation | — | Moving between Planner pages keeps Planner mounted (no reload of the plan) and moves the menu mark |

How it fits together: `apps/web/js/modules/planner.js` imports `/planner/embed.js` (fixed name, built by `apps/planner/vite.config.ts`), calls `mount(element, { org, me, call })` and keeps it mounted per organization; `apps/web/js/app.js` routes `planner` and skips its own re-render for moves between Planner pages; `apps/planner/src/api/apiBackend.ts` has a hosted mode that uses the shell's `call` with the shell's organization only.

### Checks for this change
| Check | Result |
|---|---|
| `npm --prefix apps/planner test` | RUN AND PASSED: 40/40 (3 new: hosted calls, organization list, errors and time-out) |
| `tsc --noEmit` (apps/planner), `npm --prefix apps/planner run build` | RUN AND PASSED |
| `npm test` (all repository suites, PGlite) | RUN: every suite passes except `client-access` CA26 now and then — a pre-existing ordering bug in client access history (`created_at, id` with a random id), not related to Planner; reported separately |
| `test/web.test.mjs` | RUN AND PASSED: 35/35 (W27–W29 new: Planner routes, links, menu) |
| `node scripts/e2e-planner.mjs` (local stack, real sign-ups, two organizations) | RUN AND PASSED: 31/31 — one header, Launcher/app switcher, direct plan address, staying mounted, organization switch with the shell's switcher (both ways, record not carried), dark theme, phone bottom bar, token expiry, isolation (Aurj-only owner, owner of both, forged organization), member without the grant (screen and direct API) |
| `node scripts/e2e-ui.mjs` (whole site) | RUN AND PASSED: 241/241. Needs the Whiteboard editor built and, on a brand-new database, one existing project (Projects P1) |
| `build:web`, `check:tokens`, `check:secrets`, `check:licences` | RUN AND PASSED |
| GitHub Actions | see the pull request |
| Staging, live | NOT RUN: needs the owner |

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
1. ~~Not mounted in the shell header / organization switcher~~ — done (section above).
2. ~~Styling is Planner's own (`signal-v4.css`)~~ — done: shared tokens, the shell's theme.
3. Search and notifications: the shell's header search and bell are placeholders for every app (no shared service exists yet). Planner keeps its own objective search and its "Needs you" reminders (worked out from the open plan, nothing stored or sent). Register Planner's search types when the shared search is built (`app.manifest.json` `searchTypes`).
4. Review notes not fixed: readings and saved views can still be written on an archived plan; a person with `planner.plan.manage` but without `planner.goal.create` cannot create a plan from a strategy (shown as "not found"); `private.planner_*` helper functions are granted to `app_user` wholesale (matches the repository convention); a missing required argument still returns 500 (42883).
5. **The local demo (`/planner/?demo`) cannot start on the site** (found 29 Oct, existed before this change): the page policy's `script-src 'self'` blocks WebAssembly, which the demo database needs (browser error: "violates … 'unsafe-eval' is not an allowed source"). The bundle still ships its 13 MB of WebAssembly. Owner decision: (a) remove the demo from the production build (smaller deploy, no policy change; the demo stays for local development), or (b) add `'wasm-unsafe-eval'` to `script-src` in `apps/web/_headers` (allows WebAssembly on every page of the site). Recommended: (a).
6. Both `0015_planner.sql` (older backend, still used by Office Home's review notice via `planner.overview`) and 0033 exist. Retire 0015 later with a separate migration once Office Home reads 0033.
7. **Planner is not visible to anyone until the `planner` app is switched to `active` in the database** and switched on per organization (a data change, not part of any migration; `scripts/golive-activate-apps.sql` does not include Planner) and people below admin hold the grant. Until then the shell shows "Planner is coming soon" / "isn't available to you".
8. Planner's content is in a shadow root: browser tests read it through the shadow root (Playwright selectors pierce it). The whole-site layout check (44px targets, no sideways scroll) measures the shell's elements; Planner's own controls were checked by eye in screenshots only.

## Live finding (29 Oct)
Migration 0033 is applied on the live database (history row present, 30 tables, 30 org_scope policies, 0 browser grants). `/planner/` still served the shell page because the Cloudflare build runs only `build-web.mjs`, which copied Planner's build only if it already existed. Fixed in `scripts/build-web.mjs`: it installs and builds Planner itself (and stops the build on Cloudflare if that fails). Verified from a clean tree: `dist/web/planner/index.html` is Planner. Live effect only after merge to `main`.

## Needs the owner
- Migration 0033 on staging, then on production: **not applied anywhere except the local development stack**.
- Merge: **not done**.
