# Planner

Strategy planning and execution for **Layer2Funnels** and **Aurj**: vision and values, focus areas, goals with sub-goals, measures, updates, actions, risks and regular reviews. It is one app and one source of truth: Office mounts the same component (`PlannerApp`) that the standalone page runs.

Design and data rules live in `../../docs/planner/PLANNER_BLUEPRINT.md`. The database layer is `../../migrations/0005_planner.sql` (tables, policies, history) and `0006_planner_api.sql` (the `planner_*` functions the app calls).

## Run it
```
cd apps/planner
npm ci
npm run dev        # http://localhost:5173  (local demo: a real PostgreSQL in your browser, synthetic data)
npm run typecheck  # TypeScript, strict
npm test           # logic tests + application tests against the real migrations and demo seed
npm run build      # production bundle in dist/
```
Repository-wide: `npm run test:planner` (database suite + app tests), `npm test` (all database suites), `npm run test:mutation` (negative controls).

## The local demo
The demo runs PostgreSQL 17 (PGlite) **inside the browser** with the repository's real migrations and row-level policies, so what you see is decided by the real rules. Data is synthetic and stays in the browser (IndexedDB); "Reset demo data" clears it. Use the banner to sign in as a different person:

| Person | Role | What to look for |
|---|---|---|
| Olive Owner | Owner of both organizations | Switch organization: different plans and different data |
| Adam Admin | Layer2Funnels admin | Manages structure, reviews, templates; cannot hard-delete |
| Edith Editor / Eli Editor | Layer2Funnels editors | Day-to-day work; no plan settings |
| Vera Viewer | Viewer | Everything readable, nothing writable |
| Noah NoAccess | Editor without Planner access | "No access" state |
| Aria Admin / Eddie Editor | Aurj | Cannot see Layer2Funnels data |

`?db=<name>` in the address opens a separate demo database (handy for parallel testing tabs).

## Using it for real
`PlannerApp` needs two things: a `PlannerBackend` and the signed-in person.
```tsx
import { PlannerApp, createSupabaseBackend } from '@l2f/planner';
<PlannerApp backend={createSupabaseBackend(signedInSupabaseClient)} me={{ id: user.id, name: profile.display_name }} embedded />
```
Sign-in, the Launcher and the organization switcher belong to Office (Phase 5 slice 0, not built yet); `embedded` hides Planner's own brand and organization switcher so Office's header is used. The Supabase adapter calls the same `planner_*` functions; **it has not been run against a live Supabase project** (none exists yet): apply migrations 0001-0006 to a staging project and run the database suites against it first (`docs/DEVELOPER_HANDOVER.md` §6).

## Structure
```
src/api        typed client (one method per SQL function), local engine + demo seed, Supabase adapter
src/state      provider (organization, plan, permissions, mutation helper) and hash routing
src/shell      frame: organization switcher, plan selector, navigation, search
src/pages      one file per screen
src/components goal drawer, goal form, filter bar, dialogs
src/ui         accessible primitives, overlays, tiny SVG charts
src/lib        pure helpers (tree, filters, schedule, csv, format) covered by node tests
```

## Rules this app keeps
Every change goes through the database (no screen holds data of its own); the database refuses what the person may not do and a refusal reads as "not found"; errors reach the screen in plain words only; goals are archived, never silently deleted; updates and readings are permanent history; Planner files and records never appear in Drive.
