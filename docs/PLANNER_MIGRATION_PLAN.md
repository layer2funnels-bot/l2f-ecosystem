# Planner (strategy) — inventory and integration

Source: the standalone Planner built in `l2f-ecosystem` branch `feature/planner` (local). Integrated here following `docs/EXTERNAL_APP_ONBOARDING.md`.

## What it is
A Cascade-style strategy planner: Strategy map (strategies drawn as focus areas → objectives → sub-objectives, KPIs, tasks), plans created from a strategy, objectives with owners, status, dates and update schedules, KPIs with readings, tasks, risks, reviews, alignment of plans, reports, notifications. Product and design reference: `docs/PLANNER_PRODUCT_DESIGN_SPEC.md`.

## How it is wired (built + tested)
| Part | Where | Status |
|---|---|---|
| Database | `migrations/0033_planner_strategy.sql` — `planner_*` tables, row-level security on the shared permission engine (`planner.*` permissions, `planner` app grant), audit and history triggers, `public.planner_*` functions (security invoker) | built + tested |
| Coexistence with 0015 | 0015's `planner_measures` / `planner_reviews` keep their names; 0033 uses `planner_kpis` / `planner_plan_reviews`. Nothing in 0015 is changed or dropped | built + tested |
| Browser roles | 0033 ends with the 0010 lockdown: `anon` / `authenticated` get nothing; only `app_user` (the API) executes the functions | built + tested |
| Service layer | `packages/core/planner-strategy-operations.mjs`: one operation per function (`planner.strategy.<name>`), argument allow-list, `p_workspace` must equal `x-org-id`; registered in `operations.mjs` | built + tested (`test/planner-strategy.test.mjs`, 10 checks) |
| App | `apps/planner` (React + Vite). `src/api/apiBackend.ts` calls `/api/planner.strategy.*` with the shell's session token and `x-org-id`; `src/host/EcosystemHost.tsx` mounts it for a signed-in person; `?demo` keeps the in-browser demo | built; not run against a live stack |
| Shell | `apps/web/js/routes.js`: Planner tile opens `/planner/`; `scripts/build-web.mjs` copies `apps/planner/dist` to `dist/web/planner` | built |
| Manifest | `apps/planner/app.manifest.json`: description "Strategy, objectives and KPIs", status stays `soon` | prepared |
| Projects | KPIs/tasks live in Planner; objectives and tasks can link existing projects (`projects.list`) | built |

## Build
```
npm --prefix apps/planner ci
npm --prefix apps/planner run build      # apps/planner/dist
node scripts/build-web.mjs                # dist/web including /planner
npm test                                  # all database + API suites
npm --prefix apps/planner test            # Planner logic and app tests
```

## Not done / waived (to decide)
- Planner keeps its own Design v4 "Signal" token file (`apps/planner/src/styles/signal-v4.css`) instead of `packages/ui/tokens.css`; fonts come from Google Fonts, which the site's Content-Security-Policy may block (falls back to system fonts). Planned: switch to the shared tokens and self-hosted fonts.
- The shell's header and organization switcher are not shared yet: Planner opens as its own page with its own rail. Planned: an `embedded` mount inside the shell.
- Shared search and notifications are not registered (onboarding items 9-10).
- Not run against a live Supabase stack (`npm run test:e2e` / staging): needs the local Supabase stack or staging credentials.
- 0015's earlier Planner backend and this one overlap in purpose; once approved, retire 0015's tables in a later migration.
