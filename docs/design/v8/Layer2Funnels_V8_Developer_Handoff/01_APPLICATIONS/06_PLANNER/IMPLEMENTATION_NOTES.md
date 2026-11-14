# Planner · implementation notes

**Prompt:** `07_PROMPTS/P06_*.md` · **Depends on:** P03 (createProjectFromPlan) · **Status vs repo:** [R] design only, functions unchanged + [N] Strategy builder, plan → project

## Baseline in the repository

**Do not change Planner's functions, data or rules.** Baseline: `apps/planner/src/*` (React, shadow-root embed), spec `docs/PLANNER_PRODUCT_DESIGN_SPEC.md`, tests (`planner.test.mjs`, 277 DB checks). Everything there stays: plans, focus areas, objectives, sub-objectives, kinds and nesting, KPIs/KPI types, progress modes, update schedules, reviews with snapshots, alignment, reports, metrics, CSV import/export, saved views, filters, display, turn into work, strategy model (strategies, kinds, KPI types, reusable focus areas, time horizons, templates), permissions. Prototype `planner6.js` + `v7.js`, routes `#/planner/...`.

## Rules for this app

- Preserve every existing feature. Status marks: [E] keep, [R] redesign, [N] build new, [F] future (do not build; show "Later" only where specified).
- Build real data, API, RLS and tests; the prototype's data and toasts are illustrations.
- Permissions are enforced in the database/API (default deny). Layer2Funnels and Aurj data never mix.
- Visual values come from V8 (`01_DESIGN_SYSTEM.md` + `02_DESIGN_SYSTEM/`), not from v7 numbers quoted in older docs.
- **Do not redesign this app's functions from assumptions.** Inspect the real code first; change visuals only (Planner: Strategy builder and plan → project are the agreed exceptions; Funnel Mapper: rename, sizes, shared clients).

## V8 visual requirements for this app

- Boxes, strategy root and lanes are flat (no resting shadows).
- Strategy builder inspector and objective drawer use the right-panel size system (labels 13.5 px, inputs 38 px).
- Strategy builder "+ Sub/KPI" labels 12.5 px; keyboard list 14 px.

## Acceptance (from the brief)

- Full Planner test suite passes unchanged; no feature missing (compare against PLANNER_PRODUCT_DESIGN_SPEC §3).
- No Grid view; switching strategy takes one click; builder uses ≥80 % of viewport height on 1440×900.
- Create project from plan produces sections/tasks in Projects and a link back.
- Plan open with an expired token shows the error state within 10 s, then recovers after re-auth.

## Definition of done

1. Every page in `PAGES_AND_NAVIGATION.md` exists and matches its screenshot at 1440, 834 and 390 px (light and dark, both organizations).
2. Every control listed for the page works or is marked "Later" where the brief says so.
3. Every flow in `USER_FLOWS_AND_WORKFLOWS.md` passes an end-to-end test.
4. Acceptance items above pass. 5. Report written (see the prompt).
