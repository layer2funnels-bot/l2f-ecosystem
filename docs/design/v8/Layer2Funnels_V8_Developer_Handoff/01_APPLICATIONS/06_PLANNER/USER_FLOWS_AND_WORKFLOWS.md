# Planner · user flows and workflows

Each flow names the prototype route or control. "Source" says where the rule is defined. Cross-app flows: `05_STRATEGY_AND_ARCHITECTURE/CROSS_APP_WORKFLOWS.md`.

## 1. Review plan health

**Who:** Owner/lead · **Source:** Brief: Home

1. Planner Home (#/planner/home): plan hero, health tiles, distribution, Needs attention, Reviews, Focus areas, My work
2. Needs you ▾ in the top row lists what is waiting

## 2. Add and update an objective

**Who:** Objective owner · **Source:** Brief: Plan page, drawer

1. Plan page › Planner tab (#/planner/plan/map): focus-area bands → + Add objective
2. Objective row → drawer: Overview · Updates · KPIs · Tasks · Risks · Comments · History
3. Updates tab: post status, progress/value, note; KPIs: Record reading

## 3. Build a strategy

**Who:** Owner · **Source:** Brief: Strategy builder

1. Strategy model › Strategy map (#/planner/model/map) → Strategy builder (no Grid)
2. Strategy switcher; lanes per focus area; + Objective, + KPI · + Task · + Sub; inspector edits; keyboard Tab/Enter/F2/Delete
3. Create a plan from it (existing) or Create a project from it [N]

## 4. Turn a plan into a project

**Who:** Owner · **Source:** Brief: Plan → project

1. Plan page header → "Create a project from this plan"
2. Dialog: project name, type, include objectives and tasks / objectives only
3. Projects builds sections/tasks and stores the link; plan keeps tracking

## 5. Run a review

**Who:** Owner · **Source:** Brief; PLANNER spec

1. Plan › Reviews (#/planner/plan/reviews) → Schedule a review
2. Holding a review freezes a snapshot for comparison

## Navigation graph (generated from the prototype links)

Page → pages it links to (within and outside the app).

- `planner/home` → `planner/alignment`, `planner/model`, `planner/mywork`, `planner/plan/map`, `planner/plan/reviews`, `planner/plan/settings`, `planner/plans`, `planner/reports`
- `planner/mywork` → `planner/alignment`, `planner/home`, `planner/model`, `planner/plans`, `planner/reports`
- `planner/plans` → `planner/alignment`, `planner/home`, `planner/model`, `planner/mywork`, `planner/plan/map`, `planner/reports`
- `planner/plan/map` → `planner/alignment`, `planner/home`, `planner/model`, `planner/mywork`, `planner/plan/reviews`, `planner/plan/settings`, `planner/plan/timeline`, `planner/plans`, `planner/reports`
- `planner/plan/timeline` → `planner/alignment`, `planner/home`, `planner/model`, `planner/mywork`, `planner/plan/map`, `planner/plan/reviews`, `planner/plan/settings`, `planner/plans`, `planner/reports`
- `planner/plan/reviews` → `planner/alignment`, `planner/home`, `planner/model`, `planner/mywork`, `planner/plan/map`, `planner/plan/settings`, `planner/plan/timeline`, `planner/plans`, `planner/reports`
- `planner/plan/settings` → `planner/alignment`, `planner/home`, `planner/model`, `planner/mywork`, `planner/plan/map`, `planner/plan/reviews`, `planner/plan/timeline`, `planner/plans`, `planner/reports`
- `planner/alignment` → `planner/home`, `planner/model`, `planner/mywork`, `planner/plans`, `planner/reports`
- `planner/reports` → `planner/alignment`, `planner/home`, `planner/model`, `planner/mywork`, `planner/plans`
- `planner/model/map` → `planner/alignment`, `planner/home`, `planner/model`, `planner/model/fa`, `planner/model/horizons`, `planner/model/kinds`, `planner/model/kpi`, `planner/model/tpl`, `planner/mywork`, `planner/plans`, `planner/reports`
- `planner/model/kinds` → `planner/alignment`, `planner/home`, `planner/model`, `planner/model/fa`, `planner/model/horizons`, `planner/model/kpi`, `planner/model/map`, `planner/model/tpl`, `planner/mywork`, `planner/plans`, `planner/reports`
- `planner/model/kpi` → `planner/alignment`, `planner/home`, `planner/model`, `planner/model/fa`, `planner/model/horizons`, `planner/model/kinds`, `planner/model/map`, `planner/model/tpl`, `planner/mywork`, `planner/plans`, `planner/reports`
- `planner/model/fa` → `planner/alignment`, `planner/home`, `planner/model`, `planner/model/horizons`, `planner/model/kinds`, `planner/model/kpi`, `planner/model/map`, `planner/model/tpl`, `planner/mywork`, `planner/plans`, `planner/reports`
- `planner/model/horizons` → `planner/alignment`, `planner/home`, `planner/model`, `planner/model/fa`, `planner/model/kinds`, `planner/model/kpi`, `planner/model/map`, `planner/model/tpl`, `planner/mywork`, `planner/plans`, `planner/reports`
- `planner/model/tpl` → `planner/alignment`, `planner/home`, `planner/model`, `planner/model/fa`, `planner/model/horizons`, `planner/model/kinds`, `planner/model/kpi`, `planner/model/map`, `planner/mywork`, `planner/plans`, `planner/reports`
- `planner/plan/:plan/builder` → `planner/alignment`, `planner/home`, `planner/model`, `planner/mywork`, `planner/plan/map`, `planner/plan/reviews`, `planner/plan/settings`, `planner/plan/timeline`, `planner/plans`, `planner/reports`
- `planner/model` → `planner/alignment`, `planner/home`, `planner/model/fa`, `planner/model/horizons`, `planner/model/kinds`, `planner/model/kpi`, `planner/model/map`, `planner/model/tpl`, `planner/mywork`, `planner/plans`, `planner/reports`
