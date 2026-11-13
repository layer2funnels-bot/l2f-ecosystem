# Planner · implementation brief (design only + Strategy builder + plan → project)

**Do not change Planner's functions, data or rules.** Baseline: `apps/planner/src/*` (React, shadow-root embed), spec `docs/PLANNER_PRODUCT_DESIGN_SPEC.md`, tests (`planner.test.mjs`, 277 DB checks). Everything there stays: plans, focus areas, objectives, sub-objectives, kinds and nesting, KPIs/KPI types, progress modes, update schedules, reviews with snapshots, alignment, reports, metrics, CSV import/export, saved views, filters, display, turn into work, strategy model (strategies, kinds, KPI types, reusable focus areas, time horizons, templates), permissions. Prototype `planner6.js` + `v7.js`, routes `#/planner/...`.

## Visual changes [R] (all pages)
- Ecosystem shell (rail + Planner sidebar). Sidebar v7 sizes (15 px). Planner nav: Home, My work, Plans, Alignment, Reports, Strategy model.
- Page top row (all pages): page title, Search objectives ( / ), **Create ▾** (New objective, New focus area, New plan, Schedule a review, Turn strategy into work), **Needs you (n) ▾**.
- Plan bar: plan selector (16 px, 38 px tall), favourite star, progress bar + %, review-overdue pill.
- Sizes: plan hero title 34 px; band (focus area) title 19 px; objective rows 44 px / 14.5 px; drawer title 24 px, fields 14.5 px.
- **Home** keeps the real content: plan hero (name, description, dates, overall ring), Plan health tiles (Objectives, On track, At risk, Off track, Overdue (red), Without owner), status distribution bar + legend, Getting started checklist (5 steps with Go), Needs attention (objective, owner, reason chip), Reviews card, Focus areas (edge colour, goals count, mini distribution, %), My work card (My objectives, Open actions, Go to my objectives).
- **Plan page** tabs Planner · Timeline · Reviews · Settings. Planner: actions row (Add focus area, List/Board, Add objective) + find row (search, Filters, Display, Saved views, Hide completed); focus-area **bands** (colour edge, name, time chip, dates, count, average, + Add objective, Turn into work, Edit); objective rows (title→drawer, kind chip, owner, status, progress with expected-pace marker, due, + sub-objective, ⋯); "+ Add focus area" dashed. Board variant by focus area.
- **Objective drawer** (680 px; same structure as the Projects task panel): head (kind chip, prev/next, copy link, Actions ▾ (add sub-objective, KPI, task, archive, delete permanently), close); breadcrumb plan › focus area; title; chips status / owner / priority; tabs **Overview** (progress ring + expected, fields: Kind, Status, Priority, Weight, Start, Due, Update schedule, Tags, Linked project, Linked value; Description; Latest update; Sub-objectives) · **Updates** (post update: status, progress/value, note) · **KPIs** (cards with value/target/progress, Record reading; Add KPI from a KPI type) · **Tasks** (actions; Turn into work) · **Risks** · **Comments** · **History**.
- **Alignment** [R]: keep the **original behaviour** (left-to-right tree; Plans vs Objectives of one plan; expand/collapse; zoom). Design: boxes 250–300 px with colour edge, progress ring, title, sub-line, %, expand arrow; connector lines; dot-grid canvas.
- Reports (Summary / All objectives with bulk edit + CSV / Metrics with Record reading), My work (objectives by status + actions board), Plans table, Reviews, Settings (Plan details, Vision, Values, Focus areas, Review rhythm, Archive) — reskinned, same content.

## Strategy model › Strategy map → **Strategy builder** [N design, existing data]
Replaces the old Grid/Builder map UI with one **Builder** (no Grid). Data = existing strategies (`StrategyMap.tsx`, `StrategyBuilder.tsx`): strategy → focus areas → objectives (kinds) → sub-objectives, KPIs, tasks.
- **Focused page** (fix for wasted space): one compact title row (Strategy model + its tabs inline: Strategy map, Objective kinds, KPI types, Focus areas, Time horizons, Templates) → one **strategy bar**: strategy switcher dropdown (lists all strategies with plan counts, + New strategy) with stats line (n focus areas · n objectives · n KPIs · n tasks · used by n plans), New strategy, **Create a plan from it** (existing), **Create a project from it** [N], ⋯ (rename, duplicate, delete). Then the builder fills the rest of the viewport (`calc(100vh − 190px)`, min 600).
- Builder canvas (dot grid): sticky tool row (Find on the map, zoom −/%/+, fit, Collapse all/Expand all, legend Focus area / Objective / KPI·task·sub). Strategy root card (dark) on the left, then **focus-area lanes**: each lane is a tinted band containing the focus-area card (colour edge, name, count + time, eye = focus (dims other lanes), collapse, "+ Objective") and its objective cards (kind label, title, owner, status, KPI/task counts; on hover/selection the **+ KPI · + Task · + Sub** row slides in; ⋯), and leaf chips (sub-objective, KPI with value/target, task). Rounded connector lines. "+ Focus area" dashed at the end. Minimap bottom-right.
- **Inspector** (right, 290 px): nothing selected → help + keyboard list (Tab add child, Enter add sibling, arrows move, F2 rename, Delete remove). Selected box → edit title, kind, default owner, KPIs (+), tasks (+), Move to…, Remove from strategy.
- All actions call the existing strategy APIs.

## Plan → project [N]
- Plan page header: **"Create a project from this plan"** button + ⋯ plan menu (same action, Edit plan details, Duplicate, Archive).
- Strategy bar: **"Create a project from it"**.
- Dialog: project name, type (Internal/Client/Personal), include (objectives and tasks / objectives only). Calls Projects `createProjectFromPlan` (see 03 §6): focus areas → sections, objectives → tasks with owner/due, link stored; plan keeps tracking. Planner only sends; Projects builds. Permission: Projects "create projects" + Planner view.

## Loading fix [verify in code]
The "plan stuck loading" report: open a plan must never spin forever. Steps UI (Checking access → Loading focus areas → Loading objectives), skeleton map, and after 10 s a clear error ("This plan didn’t open… expired sign-in or slow connection", Try again, Back to plans, reference id). Fix the real causes in code (PLANNER_INTEGRATION_STATUS items 7 and 8: token refresh, organization disagreement) and add a test.

## Acceptance
- Full Planner test suite passes unchanged; no feature missing (compare against PLANNER_PRODUCT_DESIGN_SPEC §3).
- No Grid view; switching strategy takes one click; builder uses ≥80 % of viewport height on 1440×900.
- Create project from plan produces sections/tasks in Projects and a link back.
- Plan open with an expired token shows the error state within 10 s, then recovers after re-auth.
