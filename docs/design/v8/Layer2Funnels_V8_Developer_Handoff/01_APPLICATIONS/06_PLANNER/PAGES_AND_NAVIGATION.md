# Planner · pages and navigation

17 pages documented (every page in the v7 route list for this app, plus every page template reached by following links). 17 templates in total. Each entry gives the 11 required fields: name/purpose, access, layout, sections, buttons/actions, inputs/filters, navigation/destinations, data, permissions, states, responsive.

Labels in back-ticks are the exact text or accessible name of the control in the V8 prototype. Controls present on every page (rail, app bar, Prototype button) are documented once in `01_APPLICATIONS/00_SHELL_AND_LAUNCHER/`.

## Sidebar menu

- **Home** → `planner/home`
- **My work** → `planner/mywork`
- **Plans** → `planner/plans`
- **Alignment** → `planner/alignment`
- **Reports** → `planner/reports`
- **Strategy model** → `planner/model`

## Page templates and their instances

| Template | Instances reached in the prototype | Documented as |
|---|---|---|
| `planner/home` | 1 | Home |
| `planner/mywork` | 1 | My work |
| `planner/plans` | 1 | Plans |
| `planner/plan/map` | 1 | Plan: Planner view |
| `planner/plan/timeline` | 1 | Plan: Timeline |
| `planner/plan/reviews` | 1 | Plan: Reviews |
| `planner/plan/settings` | 1 | Plan: Settings |
| `planner/alignment` | 1 | Alignment |
| `planner/reports` | 1 | Reports |
| `planner/model/map` | 1 | Strategy map (redesigned) |
| `planner/model/kinds` | 1 | Objective kinds |
| `planner/model/kpi` | 1 | KPI types |
| `planner/model/fa` | 1 | Focus areas |
| `planner/model/horizons` | 1 | Time horizons |
| `planner/model/tpl` | 1 | Templates |
| `planner/plan/:plan/builder` | 1 | First 1000 Followers on Facebook |
| `planner/model` | 1 | Strategy model |

## Pages

### Home

- **Route (prototype):** `#/planner/home` — template `planner/home`
- **In the v7 route list:** yes — Home
- **How the user gets here:** sidebar item **Home**; breadcrumb Planner › Home; linked from `drive/edit/doc/:file`, `drive/edit/image/:file`, `drive/edit/pdf/:file`, `drive/edit/sheet/:file`, `drive/edit/slides/:file`, `fmp/funnel/:funnel`, `fmp/funnel/:funnel/reports`, `launcher` …
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/06_PLANNER/054_planner_home.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/06_PLANNER/054_planner_home.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/06_PLANNER/054_planner_home.jpg)
- **Purpose and spec (from the app brief):**
  > - **Home** keeps the real content: plan hero (name, description, dates, overall ring), Plan health tiles (Objectives, On track, At risk, Off track, Overdue (red), Without owner), status distribution bar + legend, Getting started checklist (5 steps with Go), Needs attention (objective, owner, reason chip), Reviews card, Focus areas (edge colour, goals count, mini distribution, %), My work card (My objectives, Open actions, Go to my objectives).
- **Sections and headings, in order:** “Home” · “First 1000 Followers on Facebook” · “Plan health” · “Getting started” · “Needs attention” · “Focus areas” · “Reviews” · “My work”
- **Buttons and actions (5):** `Create` — action `plcreate`; `Needs you 1` — action `plneeds`; `First 1000 Followers on Facebook` — prototype stand-in (shows a toast: “Switch plan”); build the real action from the brief; `Favourite`; `Write 5 Days Posts Tabish Riaz Overdue by 2 days` — action `pobj:f1-0`
- **Links (navigation) (11):** `Go` → `planner/plan/settings`; `Go` → `planner/plan/reviews`; `Social media Posts 1 goals · Current 40%` → `planner/plan/map`; `5 Days Post Challenge 3 goals · Upcoming 10%` → `planner/plan/map`; `Offers 3 goals · Upcoming 0%` → `planner/plan/map`; `Open reviews` → `planner/plan/reviews`; `Go to my objectives` → `planner/mywork`; `Home` → `planner/home`; `My work` → `planner/mywork`; `Plans` → `planner/plans`; `Alignment` → `planner/alignment`
- **Inputs, filters and selects (1):** `Search objectives ( / )`
- **Data shown (prototype sample data — not product data):** Planner / Home Home Create Needs you 1 First 1000 Followers on Facebook 10% Review overdue First 1000 Followers on Facebook This is a first step towards our Million Dollar Community. 2 Nov 2026 to 31 Dec 2026 10% Overall progress Plan health Objectives 7 ▲ On track 2 ◆ At risk 0 ▼ Off track 0 Overdue 1 Without owner 0 Not started 5 On track 2 At risk 0 Off track 0 On hold 0 Completed 0 Getting started 3 of 5 done Wri…
- **Permissions and visibility:** Anyone with access to Planner in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). Page-specific state copy present in the prototype: “Add your first goals Objectives, results and initiatives that make the vision real.” | “No review is scheduled.”.
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### My work

- **Route (prototype):** `#/planner/mywork` — template `planner/mywork`
- **In the v7 route list:** yes — My work
- **How the user gets here:** sidebar item **My work**; breadcrumb Planner › My work; linked from `planner/alignment`, `planner/home`, `planner/model`, `planner/model/fa`, `planner/model/horizons`, `planner/model/kinds`, `planner/model/kpi`, `planner/model/map` …
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/06_PLANNER/055_planner_mywork.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/06_PLANNER/055_planner_mywork.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/06_PLANNER/055_planner_mywork.jpg)
- **Sections and headings, in order:** “My work” · “My objectives” · “My actions”
- **Buttons and actions (11):** `Create` — action `plcreate`; `Needs you 1` — action `plneeds`; `List` — action `plmyl:list`; `Board` — action `plmyl:board`; `Overdue` — action `chipt`; `Due this week` — action `chipt`; `Write 5 Days Posts Social media Posts 10 Nov Post update` — action `pobj:f1-0`; `Launch the challenge page 5 Days Post Challenge 1 Dec Post update` — action `pobj:f2-0`; `Daily live sessions 5 Days Post Challenge 5 Dec Post update` — action `pobj:f2-2`; `Package the DFY offer Offers 15 Dec Post update` — action `pobj:f3-0`; `Price test Offers 22 Dec Post update` — action `pobj:f3-2`
- **Links (navigation) (4):** `Home` → `planner/home`; `My work` → `planner/mywork`; `Plans` → `planner/plans`; `Alignment` → `planner/alignment`
- **Inputs, filters and selects (1):** `Search objectives ( / )`
- **Data shown (prototype sample data — not product data):** Planner / My work My work Create Needs you 1 List Board Overdue Due this week My objectives Grouped by status On track 1 Write 5 Days Posts Social media Posts 10 Nov Post update Not started 4 Launch the challenge page 5 Days Post Challenge 1 Dec Post update Daily live sessions 5 Days Post Challenge 5 Dec Post update Package the DFY offer Offers 15 Dec Post update Price test Offers 22 Dec Post update My actions To do …
- **Permissions and visibility:** Anyone with access to Planner in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Plans

- **Route (prototype):** `#/planner/plans` — template `planner/plans`
- **In the v7 route list:** yes — Plans
- **How the user gets here:** sidebar item **Plans**; breadcrumb Planner › Plans; linked from `planner/alignment`, `planner/home`, `planner/model`, `planner/model/fa`, `planner/model/horizons`, `planner/model/kinds`, `planner/model/kpi`, `planner/model/map` …
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/06_PLANNER/056_planner_plans.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/06_PLANNER/056_planner_plans.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/06_PLANNER/056_planner_plans.jpg)
- **Purpose and spec (from the app brief):**
  > **Do not change Planner's functions, data or rules.** Baseline: `apps/planner/src/*` (React, shadow-root embed), spec `docs/PLANNER_PRODUCT_DESIGN_SPEC.md`, tests (`planner.test.mjs`, 277 DB checks). Everything there stays: plans, focus areas, objectives, sub-objectives, kinds and nesting, KPIs/KPI types, progress modes, update schedules, reviews with snapshots, alignment, reports, metrics, CSV import/export, saved views, filters, display, turn into work, strategy model (strategies, kinds, KPI types, reusable focus areas, time horizons, templates), permissions. Prototype `planner6.js` + `v7.js`, routes `#/planner/...`.
  > - **Focused page** (fix for wasted space): one compact title row (Strategy model + its tabs inline: Strategy map, Objective kinds, KPI types, Focus areas, Time horizons, Templates) → one **strategy bar**: strategy switcher dropdown (lists all strategies with plan counts, + New strategy) with stats line (n focus areas · n objectives · n KPIs · n tasks · used by n plans), New strategy, **Create a plan from it** (existing), **Create a project from it** [N], ⋯ (rename, duplicate, delete). Then the builder fills the rest of the viewport (`calc(100vh − 190px)`, min 600).
  > The "plan stuck loading" report: open a plan must never spin forever. Steps UI (Checking access → Loading focus areas → Loading objectives), skeleton map, and after 10 s a clear error ("This plan didn’t open… expired sign-in or slow connection", Try again, Back to plans, reference id). Fix the real causes in code (PLANNER_INTEGRATION_STATUS items 7 and 8: token refresh, organization disagreement) and add a test.
- **Sections and headings, in order:** “Plans”
- **Buttons and actions (3):** `Create` — action `plcreate`; `Needs you 1` — action `plneeds`; `New plan` — action `plnewplan` (opens: Plan)
- **Links (navigation) (6):** `First 1000 Followers on Facebook 10% 3 TR Not scheduled` → `planner/plan/map`; `Q1 2027 Delivery 0% 2 BK 15 Jan` → `planner/plan/map`; `Home` → `planner/home`; `My work` → `planner/mywork`; `Plans` → `planner/plans`; `Alignment` → `planner/alignment`
- **Inputs, filters and selects (3):** `Search objectives ( / )`; `Search plans`; `on` (checkbox)
- **Data shown (prototype sample data — not product data):** Planner / Plans Plans Create Needs you 1 Show archived New plan Plan Progress Focus areas Owner Next review First 1000 Followers on Facebook 10% 3 TR Not scheduled Q1 2027 Delivery 0% 2 BK 15 Jan Plans Create Needs you 1 Show archived New plan Plan Progress Focus areas Owner Next review First 1000 Followers on Facebook 10% 3 TR Not scheduled Q1 2027 Delivery 0% 2 BK 15 Jan…
- **Permissions and visibility:** Anyone with access to Planner in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Plan: Planner view

- **Route (prototype):** `#/planner/plan/map` — template `planner/plan/map`
- **In the v7 route list:** yes — Plan: Planner view
- **How the user gets here:** sidebar item **Plans**; breadcrumb Planner › First 1000 Followers on Facebook; linked from `planner/home`, `planner/plan/:plan/builder`, `planner/plan/reviews`, `planner/plan/settings`, `planner/plan/timeline`, `planner/plans`
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/06_PLANNER/057_planner_plan_map.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/06_PLANNER/057_planner_plan_map.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/06_PLANNER/057_planner_plan_map.jpg)
- **Sections and headings, in order:** “First 1000 Followers on Facebook” · “Social media Posts” · “5 Days Post Challenge” · “Offers”
- **Buttons and actions (25):** `Create` — action `plcreate`; `Needs you 1` — action `plneeds`; `First 1000 Followers on Facebook` — prototype stand-in (shows a toast: “Switch plan”); build the real action from the brief; `Favourite`; `Create a project from this plan` — action `plan2proj`; `Plan actions` — action `planmenu`; `Add focus area` — action `plfa` (opens: Focus area); `List` — action `plview:list`; `Board` — action `plview:board`; `Add objective` — action `plobjnew` (opens: New objective); `Filters`; `Display`; `Saved views`; `Hide completed` — action `chipt`; `Turn into work` — action `pltw` (opens: Turn into work); `Edit` — action `plfa` (opens: Focus area); `Write 5 Days Posts` — action `pobj:f1-0`; `Add sub-objective` — prototype stand-in (shows a toast: “Add a sub-objective.”); build the real action from the brief; `Draft day 1–2 posts` — action `pobj:f1-0`; `Launch the challenge page` — action `pobj:f2-0`; `Line up 3 guest coaches` — action `pobj:f2-1`; `Daily live sessions` — action `pobj:f2-2`; `Package the DFY offer` — action `pobj:f3-0`; `Write the sales page` — action `pobj:f3-1`; `Price test` — action `pobj:f3-2`
- **Links (navigation) (9):** `Planner` → `planner/plans`; `Planner` → `planner/plan/map`; `Timeline` → `planner/plan/timeline`; `Reviews` → `planner/plan/reviews`; `Settings` → `planner/plan/settings`; `Home` → `planner/home`; `My work` → `planner/mywork`; `Plans` → `planner/plans`; `Alignment` → `planner/alignment`
- **Inputs, filters and selects (2):** `Search objectives ( / )`; `Find objectives`
- **Data shown (prototype sample data — not product data):** Planner / First 1000 Followers on Facebook First 1000 Followers on Facebook Create Needs you 1 First 1000 Followers on Facebook 10% Review overdue Create a project from this plan Planner Timeline Reviews Settings Add focus area List Board Add objective Filters Display Saved views Hide completed Social media Posts Current Nov – Dec · 1 objectives · avg 40% Add objective Turn into work Edit OBJECTIVE KIND OWNER STATUS …
- **Permissions and visibility:** Anyone with access to Planner in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Plan: Timeline

- **Route (prototype):** `#/planner/plan/timeline` — template `planner/plan/timeline`
- **In the v7 route list:** yes — Plan: Timeline
- **How the user gets here:** sidebar item **Plans**; breadcrumb Planner › First 1000 Followers on Facebook; linked from `planner/plan/:plan/builder`, `planner/plan/map`, `planner/plan/reviews`, `planner/plan/settings`
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/06_PLANNER/058_planner_plan_timeline.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/06_PLANNER/058_planner_plan_timeline.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/06_PLANNER/058_planner_plan_timeline.jpg)
- **Sections and headings, in order:** “First 1000 Followers on Facebook” · “Objective”
- **Buttons and actions (13):** `Create` — action `plcreate`; `Needs you 1` — action `plneeds`; `First 1000 Followers on Facebook` — prototype stand-in (shows a toast: “Switch plan”); build the real action from the brief; `Favourite`; `Create a project from this plan` — action `plan2proj`; `Plan actions` — action `planmenu`; `40%` — action `pobj:f1-0`; `0%` — action `pobj:f2-0`; `30%` — action `pobj:f2-1`; `0%` — action `pobj:f2-2`; `0%` — action `pobj:f3-0`; `0%` — action `pobj:f3-1`; `0%` — action `pobj:f3-2`
- **Links (navigation) (9):** `Planner` → `planner/plans`; `Planner` → `planner/plan/map`; `Timeline` → `planner/plan/timeline`; `Reviews` → `planner/plan/reviews`; `Settings` → `planner/plan/settings`; `Home` → `planner/home`; `My work` → `planner/mywork`; `Plans` → `planner/plans`; `Alignment` → `planner/alignment`
- **Inputs, filters and selects (1):** `Search objectives ( / )`
- **Data shown (prototype sample data — not product data):** Planner / First 1000 Followers on Facebook First 1000 Followers on Facebook Create Needs you 1 First 1000 Followers on Facebook 10% Review overdue Create a project from this plan Planner Timeline Reviews Settings Objective NOV DEC JAN FEB MAR APR SOCIAL MEDIA POSTS Write 5 Days Posts 40% 5 DAYS POST CHALLENGE Launch the challenge page 0% Line up 3 guest coaches 30% Daily live sessions 0% OFFERS Package the DFY offer …
- **Permissions and visibility:** Anyone with access to Planner in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Plan: Reviews

- **Route (prototype):** `#/planner/plan/reviews` — template `planner/plan/reviews`
- **In the v7 route list:** yes — Plan: Reviews
- **How the user gets here:** sidebar item **Plans**; breadcrumb Planner › First 1000 Followers on Facebook; linked from `planner/home`, `planner/plan/:plan/builder`, `planner/plan/map`, `planner/plan/settings`, `planner/plan/timeline`
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/06_PLANNER/059_planner_plan_reviews.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/06_PLANNER/059_planner_plan_reviews.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/06_PLANNER/059_planner_plan_reviews.jpg)
- **Sections and headings, in order:** “First 1000 Followers on Facebook” · “Scheduled” · “Held”
- **Buttons and actions (7):** `Create` — action `plcreate`; `Needs you 1` — action `plneeds`; `First 1000 Followers on Facebook` — prototype stand-in (shows a toast: “Switch plan”); build the real action from the brief; `Favourite`; `Create a project from this plan` — action `plan2proj`; `Plan actions` — action `planmenu`; `Schedule a review` — prototype stand-in (shows a toast: “Review scheduled.”); build the real action from the brief
- **Links (navigation) (9):** `Planner` → `planner/plans`; `Planner` → `planner/plan/map`; `Timeline` → `planner/plan/timeline`; `Reviews` → `planner/plan/reviews`; `Settings` → `planner/plan/settings`; `Home` → `planner/home`; `My work` → `planner/mywork`; `Plans` → `planner/plans`; `Alignment` → `planner/alignment`
- **Inputs, filters and selects (1):** `Search objectives ( / )`
- **Data shown (prototype sample data — not product data):** Planner / First 1000 Followers on Facebook First 1000 Followers on Facebook Create Needs you 1 First 1000 Followers on Facebook 10% Review overdue Create a project from this plan Planner Timeline Reviews Settings Holding a review freezes a snapshot of every objective, so you can compare. Schedule a review Scheduled No review is scheduled. Held Held reviews with their snapshot appear here. First 1000 Followers on Face…
- **Permissions and visibility:** Anyone with access to Planner in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). Page-specific state copy present in the prototype: “No review is scheduled.”.
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Plan: Settings

- **Route (prototype):** `#/planner/plan/settings` — template `planner/plan/settings`
- **In the v7 route list:** yes — Plan: Settings
- **How the user gets here:** sidebar item **Plans**; breadcrumb Planner › First 1000 Followers on Facebook; linked from `planner/home`, `planner/plan/:plan/builder`, `planner/plan/map`, `planner/plan/reviews`, `planner/plan/timeline`
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/06_PLANNER/060_planner_plan_settings.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/06_PLANNER/060_planner_plan_settings.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/06_PLANNER/060_planner_plan_settings.jpg)
- **Sections and headings, in order:** “First 1000 Followers on Facebook” · “Plan details” · “Vision” · “Values” · “Focus areas” · “Review rhythm” · “Archive”
- **Buttons and actions (14):** `Create` — action `plcreate`; `Needs you 1` — action `plneeds`; `First 1000 Followers on Facebook` — prototype stand-in (shows a toast: “Switch plan”); build the real action from the brief; `Favourite`; `Create a project from this plan` — action `plan2proj`; `Plan actions` — action `planmenu`; `Edit plan details` — action `plnewplan` (opens: Plan); `Save vision` — prototype stand-in (shows a toast: “Vision saved.”); build the real action from the brief; `Delete value`; `Add focus area` — action `plfa` (opens: Focus area); `Edit` — action `plfa` (opens: Focus area); `Archive`; `Save rhythm`; `Archive this plan`
- **Links (navigation) (9):** `Planner` → `planner/plans`; `Planner` → `planner/plan/map`; `Timeline` → `planner/plan/timeline`; `Reviews` → `planner/plan/reviews`; `Settings` → `planner/plan/settings`; `Home` → `planner/home`; `My work` → `planner/mywork`; `Plans` → `planner/plans`; `Alignment` → `planner/alignment`
- **Inputs, filters and selects (4):** `Search objectives ( / )`; `A million-dollar community of coaches who build funnels that work.`; `New value`; `Month Quarter`
- **Data shown (prototype sample data — not product data):** Planner / First 1000 Followers on Facebook First 1000 Followers on Facebook Create Needs you 1 First 1000 Followers on Facebook 10% Review overdue Create a project from this plan Planner Timeline Reviews Settings Plan details Edit plan details Name First 1000 Followers on Facebook Description This is a first step towards our Million Dollar Community. Period 2 Nov 2026 to 31 Dec 2026 Vision Save vision Values Results …
- **Permissions and visibility:** Anyone with access to Planner in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Alignment

- **Route (prototype):** `#/planner/alignment` — template `planner/alignment`
- **In the v7 route list:** yes — Alignment
- **How the user gets here:** sidebar item **Alignment**; breadcrumb Planner › Alignment; linked from `planner/home`, `planner/model`, `planner/model/fa`, `planner/model/horizons`, `planner/model/kinds`, `planner/model/kpi`, `planner/model/map`, `planner/model/tpl` …
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/06_PLANNER/061_planner_alignment.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/06_PLANNER/061_planner_alignment.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/06_PLANNER/061_planner_alignment.jpg)
- **Purpose and spec (from the app brief):**
  > **Do not change Planner's functions, data or rules.** Baseline: `apps/planner/src/*` (React, shadow-root embed), spec `docs/PLANNER_PRODUCT_DESIGN_SPEC.md`, tests (`planner.test.mjs`, 277 DB checks). Everything there stays: plans, focus areas, objectives, sub-objectives, kinds and nesting, KPIs/KPI types, progress modes, update schedules, reviews with snapshots, alignment, reports, metrics, CSV import/export, saved views, filters, display, turn into work, strategy model (strategies, kinds, KPI types, reusable focus areas, time horizons, templates), permissions. Prototype `planner6.js` + `v7.js`, routes `#/planner/...`.
  > - **Alignment** [R]: keep the **original behaviour** (left-to-right tree; Plans vs Objectives of one plan; expand/collapse; zoom). Design: boxes 250–300 px with colour edge, progress ring, title, sub-line, %, expand arrow; connector lines; dot-grid canvas.
- **Sections and headings, in order:** “Alignment”
- **Buttons and actions (12):** `Create` — action `plcreate`; `Needs you 1` — action `plneeds`; `Plans` — action `almode:plans`; `Objectives of one plan` — action `almode:objectives`; `Expand all` — action `alall`; `Zoom out` — action `alz:-1`; `Zoom in` — action `alz:1`; `Collapse` — action `altg:root`; `Collapse` — action `altg:pl1`; `Expand` — action `altg:f1`; `Expand` — action `altg:f2`; `Expand` — action `altg:f3`
- **Links (navigation) (4):** `Home` → `planner/home`; `My work` → `planner/mywork`; `Plans` → `planner/plans`; `Alignment` → `planner/alignment`
- **Inputs, filters and selects (1):** `Search objectives ( / )`
- **Data shown (prototype sample data — not product data):** Planner / Alignment Alignment Create Needs you 1 Plans Objectives of one plan Expand all Layer2Funnels vision 2 plans 10% First 1000 Followers on Facebook 3 focus areas · next review not set 10% Social media Posts 1 objectives 40% 5 Days Post Challenge 3 objectives 10% Offers 3 objectives 0% Q1 2027 Delivery2 focus areas · child plan 0% How plans roll up into each other, left to right. Click a box to open it; use the…
- **Permissions and visibility:** Anyone with access to Planner in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Reports

- **Route (prototype):** `#/planner/reports` — template `planner/reports`
- **In the v7 route list:** yes — Reports
- **How the user gets here:** sidebar item **Reports**; breadcrumb Planner › Reports; direct URL / in-page action
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/06_PLANNER/062_planner_reports.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/06_PLANNER/062_planner_reports.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/06_PLANNER/062_planner_reports.jpg)
- **Purpose and spec (from the app brief):**
  > **Do not change Planner's functions, data or rules.** Baseline: `apps/planner/src/*` (React, shadow-root embed), spec `docs/PLANNER_PRODUCT_DESIGN_SPEC.md`, tests (`planner.test.mjs`, 277 DB checks). Everything there stays: plans, focus areas, objectives, sub-objectives, kinds and nesting, KPIs/KPI types, progress modes, update schedules, reviews with snapshots, alignment, reports, metrics, CSV import/export, saved views, filters, display, turn into work, strategy model (strategies, kinds, KPI types, reusable focus areas, time horizons, templates), permissions. Prototype `planner6.js` + `v7.js`, routes `#/planner/...`.
- **Sections and headings, in order:** “Reports” · “By focus area” · “By owner” · “Risks · overdue · stale”
- **Buttons and actions (8):** `Create` — action `plcreate`; `Needs you 1` — action `plneeds`; `First 1000 Followers on Facebook` — prototype stand-in (shows a toast: “Switch plan”); build the real action from the brief; `Favourite`; `Summary` — action `plrt:summary`; `All objectives` — action `plrt:all`; `Metrics` — action `plrt:metrics`; `Export` — prototype stand-in (shows a toast: “Exports CSV.”); build the real action from the brief
- **Links (navigation) (4):** `Home` → `planner/home`; `My work` → `planner/mywork`; `Plans` → `planner/plans`; `Alignment` → `planner/alignment`
- **Inputs, filters and selects (1):** `Search objectives ( / )`
- **Data shown (prototype sample data — not product data):** Planner / Reports Reports Create Needs you 1 First 1000 Followers on Facebook 10% Review overdue Summary All objectives Metrics By focus area Export Social media Posts 1 5 Days Post Challenge 3 Offers 3 By owner TR Tabish Riaz 5 UM Usman Malik 1 SN Sana Noor 1 Risks · overdue · stale Write 5 Days Posts Overdue Create Student Avatar No update in 14 days Reports Create Needs you 1 First 1000 Followers on Facebook 10% R…
- **Permissions and visibility:** Anyone with access to Planner in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Strategy map (redesigned)

- **Route (prototype):** `#/planner/model/map` — template `planner/model/map`
- **In the v7 route list:** yes — Strategy map (redesigned)
- **How the user gets here:** sidebar item **Strategy model**; breadcrumb Planner › Strategy model; linked from `planner/model`, `planner/model/fa`, `planner/model/horizons`, `planner/model/kinds`, `planner/model/kpi`, `planner/model/tpl`
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/06_PLANNER/063_planner_model_map.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/06_PLANNER/063_planner_model_map.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/06_PLANNER/063_planner_model_map.jpg)
- **Sections and headings, in order:** “Strategy model” · “Inspector” · “KEYBOARD”
- **Buttons and actions (28):** `First 1000 Followers on Facebook` — action `stratmenu`; `New strategy` — action `plnewstrat` (opens: New strategy); `Create a plan from it` — prototype stand-in (shows a toast: “Plan created with these focus areas, objectives, KPIs and tasks.”); build the real action from the brief; `Create a project from it` — action `strat2proj`; `Zoom out` — action `sbz:-1`; `Zoom in` — action `sbz:1`; `Fit` — action `sbz:0`; `Collapse all` — action `sbcollapse`; `Focus on this area` — action `sbfocus:f1`; `Collapse` — action `sbcol:f1`; `+ Objective` — prototype stand-in (shows a toast: “Add an objective under Social media Posts.”); build the real action from the brief; `GOAL Write 5 Days Posts TR On track 1 1 + KPI + Task + Sub` — action `snsel:f1-0|0`; `+ KPI` — prototype stand-in (shows a toast: “Add a KPI”); build the real action from the brief; `+ Task` — prototype stand-in (shows a toast: “Add a task.”); build the real action from the brief; `+ Sub` — prototype stand-in (shows a toast: “Add a sub-objective.”); build the real action from the brief; `Focus on this area` — action `sbfocus:f2`; `Collapse` — action `sbcol:f2`; `+ Objective` — prototype stand-in (shows a toast: “Add an objective under 5 Days Post Challenge.”); build the real action from the brief; `GOAL Launch the challenge page TR Not started 1 + KPI + Task + Sub` — action `snsel:f2-0|0`; `INITIATIVE Line up 3 guest coaches UM On track + KPI + Task + Sub` — action `snsel:f2-1|0`; `INITIATIVE Daily live sessions TR Not started + KPI + Task + Sub` — action `snsel:f2-2|0`; `Focus on this area` — action `sbfocus:f3`; `Collapse` — action `sbcol:f3`; `+ Objective` — prototype stand-in (shows a toast: “Add an objective under Offers.”); build the real action from the brief; `GOAL Package the DFY offer TR Not started 1 + KPI + Task + Sub` — action `snsel:f3-0|0`; `INITIATIVE Write the sales page SN Not started + KPI + Task + Sub` — action `snsel:f3-1|0`; `INITIATIVE Price test TR Not started + KPI + Task + Sub` — action `snsel:f3-2|0`; `Focus area` — action `plfa` (opens: Focus area)
- **Links (navigation) (10):** `Strategy map` → `planner/model/map`; `Objective kinds` → `planner/model/kinds`; `KPI types` → `planner/model/kpi`; `Focus areas` → `planner/model/fa`; `Time horizons` → `planner/model/horizons`; `Templates` → `planner/model/tpl`; `Home` → `planner/home`; `My work` → `planner/mywork`; `Plans` → `planner/plans`; `Alignment` → `planner/alignment`
- **Inputs, filters and selects (1):** `Find on the map`
- **Data shown (prototype sample data — not product data):** Planner / Strategy model Strategy model Strategy map Objective kinds KPI types Focus areas Time horizons Templates First 1000 Followers on Facebook 3 focus areas · 7 objectives · 3 KPIs · 1 tasks · used by 1 plan New strategy Create a plan from it Create a project from it 100% Collapse all Focus area Objective KPI · task · sub First 1000 Followers on Facebook 3 focus areas Social media Posts 1 objectives · Current + …
- **Permissions and visibility:** Anyone with access to Planner in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Objective kinds

- **Route (prototype):** `#/planner/model/kinds` — template `planner/model/kinds`
- **In the v7 route list:** yes — Objective kinds
- **How the user gets here:** sidebar item **Strategy model**; breadcrumb Planner › Strategy model; linked from `planner/model`, `planner/model/fa`, `planner/model/horizons`, `planner/model/kpi`, `planner/model/map`, `planner/model/tpl`
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/06_PLANNER/064_planner_model_kinds.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/06_PLANNER/064_planner_model_kinds.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/06_PLANNER/064_planner_model_kinds.jpg)
- **Sections and headings, in order:** “Strategy model” · “Kinds of objective” · “What can sit under what”
- **Buttons and actions (4):** `Create` — action `plcreate`; `Needs you 1` — action `plneeds`; `Add` — prototype stand-in (shows a toast: “New kind.”); build the real action from the brief; `Edit`
- **Links (navigation) (10):** `Strategy map` → `planner/model/map`; `Objective kinds` → `planner/model/kinds`; `KPI types` → `planner/model/kpi`; `Focus areas` → `planner/model/fa`; `Time horizons` → `planner/model/horizons`; `Templates` → `planner/model/tpl`; `Home` → `planner/home`; `My work` → `planner/mywork`; `Plans` → `planner/plans`; `Alignment` → `planner/alignment`
- **Inputs, filters and selects (1):** `Search objectives ( / )`
- **Data shown (prototype sample data — not product data):** Planner / Strategy model Strategy model Create Needs you 1 Strategy map Objective kinds KPI types Focus areas Time horizons Templates Kinds of objective Add Goal 9 Edit Initiative 3 Edit Sub-objective 1 Edit What can sit under what Plan ↓ Focus area ↓ Goal ↓ Initiative · Sub-objective Sub-objective can hold itself (loops are marked ↺). Strategy model Create Needs you 1 Strategy map Objective kinds KPI types Focus are…
- **Permissions and visibility:** Anyone with access to Planner in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### KPI types

- **Route (prototype):** `#/planner/model/kpi` — template `planner/model/kpi`
- **In the v7 route list:** yes — KPI types
- **How the user gets here:** sidebar item **Strategy model**; breadcrumb Planner › Strategy model; linked from `planner/model`, `planner/model/fa`, `planner/model/horizons`, `planner/model/kinds`, `planner/model/map`, `planner/model/tpl`
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/06_PLANNER/065_planner_model_kpi.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/06_PLANNER/065_planner_model_kpi.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/06_PLANNER/065_planner_model_kpi.jpg)
- **Sections and headings, in order:** “Strategy model”
- **Buttons and actions (4):** `Create` — action `plcreate`; `Needs you 1` — action `plneeds`; `New KPI type` — prototype stand-in (shows a toast: “New KPI type.”); build the real action from the brief; `Edit`
- **Links (navigation) (10):** `Strategy map` → `planner/model/map`; `Objective kinds` → `planner/model/kinds`; `KPI types` → `planner/model/kpi`; `Focus areas` → `planner/model/fa`; `Time horizons` → `planner/model/horizons`; `Templates` → `planner/model/tpl`; `Home` → `planner/home`; `My work` → `planner/mywork`; `Plans` → `planner/plans`; `Alignment` → `planner/alignment`
- **Inputs, filters and selects (1):** `Search objectives ( / )`
- **Data shown (prototype sample data — not product data):** Planner / Strategy model Strategy model Create Needs you 1 Strategy map Objective kinds KPI types Focus areas Time horizons Templates Reusable KPI types appear when you add a KPI to an objective. New KPI type KPI type Unit A good result goes Available on Followers people Up Goal Edit Sign-ups people Up Any kind Edit Cost per lead $ Down Initiative Edit Strategy model Create Needs you 1 Strategy map Objective kinds KP…
- **Permissions and visibility:** Anyone with access to Planner in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Focus areas

- **Route (prototype):** `#/planner/model/fa` — template `planner/model/fa`
- **In the v7 route list:** yes — Focus areas
- **How the user gets here:** sidebar item **Strategy model**; breadcrumb Planner › Strategy model; linked from `planner/model`, `planner/model/horizons`, `planner/model/kinds`, `planner/model/kpi`, `planner/model/map`, `planner/model/tpl`
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/06_PLANNER/066_planner_model_fa.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/06_PLANNER/066_planner_model_fa.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/06_PLANNER/066_planner_model_fa.jpg)
- **Sections and headings, in order:** “Strategy model”
- **Buttons and actions (3):** `Create` — action `plcreate`; `Needs you 1` — action `plneeds`; `New reusable focus area`
- **Links (navigation) (10):** `Strategy map` → `planner/model/map`; `Objective kinds` → `planner/model/kinds`; `KPI types` → `planner/model/kpi`; `Focus areas` → `planner/model/fa`; `Time horizons` → `planner/model/horizons`; `Templates` → `planner/model/tpl`; `Home` → `planner/home`; `My work` → `planner/mywork`; `Plans` → `planner/plans`; `Alignment` → `planner/alignment`
- **Inputs, filters and selects (1):** `Search objectives ( / )`
- **Data shown (prototype sample data — not product data):** Planner / Strategy model Strategy model Create Needs you 1 Strategy map Objective kinds KPI types Focus areas Time horizons Templates Reusable focus areas you can pick when you add one to a plan. New reusable focus area Social media Posts Used in 1 plan 5 Days Post Challenge Used in 1 plan Offers Used in 1 plan Strategy model Create Needs you 1 Strategy map Objective kinds KPI types Focus areas Time horizons Template…
- **Permissions and visibility:** Anyone with access to Planner in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Time horizons

- **Route (prototype):** `#/planner/model/horizons` — template `planner/model/horizons`
- **In the v7 route list:** yes — Time horizons
- **How the user gets here:** sidebar item **Strategy model**; breadcrumb Planner › Strategy model; linked from `planner/model`, `planner/model/fa`, `planner/model/kinds`, `planner/model/kpi`, `planner/model/map`, `planner/model/tpl`
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/06_PLANNER/067_planner_model_horizons.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/06_PLANNER/067_planner_model_horizons.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/06_PLANNER/067_planner_model_horizons.jpg)
- **Sections and headings, in order:** “Strategy model”
- **Buttons and actions (3):** `Create` — action `plcreate`; `Needs you 1` — action `plneeds`; `Edit`
- **Links (navigation) (10):** `Strategy map` → `planner/model/map`; `Objective kinds` → `planner/model/kinds`; `KPI types` → `planner/model/kpi`; `Focus areas` → `planner/model/fa`; `Time horizons` → `planner/model/horizons`; `Templates` → `planner/model/tpl`; `Home` → `planner/home`; `My work` → `planner/mywork`; `Plans` → `planner/plans`; `Alignment` → `planner/alignment`
- **Inputs, filters and selects (1):** `Search objectives ( / )`
- **Data shown (prototype sample data — not product data):** Planner / Strategy model Strategy model Create Needs you 1 Strategy map Objective kinds KPI types Focus areas Time horizons Templates Name From To Q4 2026 1 Oct 31 Dec Edit 2027 1 Jan 31 Dec Edit Strategy model Create Needs you 1 Strategy map Objective kinds KPI types Focus areas Time horizons Templates Name From To Q4 2026 1 Oct 31 Dec Edit 2027 1 Jan 31 Dec Edit…
- **Permissions and visibility:** Anyone with access to Planner in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Templates

- **Route (prototype):** `#/planner/model/tpl` — template `planner/model/tpl`
- **In the v7 route list:** yes — Templates
- **How the user gets here:** sidebar item **Strategy model**; breadcrumb Planner › Strategy model; linked from `planner/model`, `planner/model/fa`, `planner/model/horizons`, `planner/model/kinds`, `planner/model/kpi`, `planner/model/map`
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/06_PLANNER/068_planner_model_tpl.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/06_PLANNER/068_planner_model_tpl.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/06_PLANNER/068_planner_model_tpl.jpg)
- **Sections and headings, in order:** “Strategy model”
- **Buttons and actions (3):** `Create` — action `plcreate`; `Needs you 1` — action `plneeds`; `Create plan`
- **Links (navigation) (10):** `Strategy map` → `planner/model/map`; `Objective kinds` → `planner/model/kinds`; `KPI types` → `planner/model/kpi`; `Focus areas` → `planner/model/fa`; `Time horizons` → `planner/model/horizons`; `Templates` → `planner/model/tpl`; `Home` → `planner/home`; `My work` → `planner/mywork`; `Plans` → `planner/plans`; `Alignment` → `planner/alignment`
- **Inputs, filters and selects (1):** `Search objectives ( / )`
- **Data shown (prototype sample data — not product data):** Planner / Strategy model Strategy model Create Needs you 1 Strategy map Objective kinds KPI types Focus areas Time horizons Templates Launch plan 3 focus areas · 8 objectives Create plan Quarterly growth 3 focus areas · 8 objectives Create plan Content engine 3 focus areas · 8 objectives Create plan Strategy model Create Needs you 1 Strategy map Objective kinds KPI types Focus areas Time horizons Templates Launch pla…
- **Permissions and visibility:** Anyone with access to Planner in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### First 1000 Followers on Facebook

- **Route (prototype):** `#/planner/plan/p1/builder` — template `planner/plan/:plan/builder`
- **In the v7 route list:** no — reached by following links in the prototype
- **How the user gets here:** sidebar item **Plans**; breadcrumb Planner › First 1000 Followers on Facebook; linked from `launcher`, `office/home`, `tasks/today`
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/06_PLANNER/123_planner_plan_p1_builder.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/06_PLANNER/123_planner_plan_p1_builder.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/06_PLANNER/123_planner_plan_p1_builder.jpg)
- **Sections and headings, in order:** “First 1000 Followers on Facebook”
- **Buttons and actions (6):** `Create` — action `plcreate`; `Needs you 1` — action `plneeds`; `First 1000 Followers on Facebook` — prototype stand-in (shows a toast: “Switch plan”); build the real action from the brief; `Favourite`; `Create a project from this plan` — action `plan2proj`; `Plan actions` — action `planmenu`
- **Links (navigation) (9):** `Planner` → `planner/plans`; `Planner` → `planner/plan/map`; `Timeline` → `planner/plan/timeline`; `Reviews` → `planner/plan/reviews`; `Settings` → `planner/plan/settings`; `Home` → `planner/home`; `My work` → `planner/mywork`; `Plans` → `planner/plans`; `Alignment` → `planner/alignment`
- **Inputs, filters and selects (1):** `Search objectives ( / )`
- **Data shown (prototype sample data — not product data):** Planner / First 1000 Followers on Facebook First 1000 Followers on Facebook Create Needs you 1 First 1000 Followers on Facebook 10% Review overdue Create a project from this plan Planner Timeline Reviews Settings First 1000 Followers on Facebook Create Needs you 1 First 1000 Followers on Facebook 10% Review overdue Create a project from this plan Planner Timeline Reviews Settings…
- **Permissions and visibility:** Anyone with access to Planner in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Strategy model

- **Route (prototype):** `#/planner/model` — template `planner/model`
- **Note:** this route renders the same content as `#/planner/model/map` (alias / default sub-page).
- **In the v7 route list:** no — reached by following links in the prototype
- **How the user gets here:** sidebar item **Strategy model**; breadcrumb Planner › Strategy model; direct URL / in-page action
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/06_PLANNER/139_planner_model.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/06_PLANNER/139_planner_model.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/06_PLANNER/139_planner_model.jpg)
- **Purpose and spec (from the app brief):**
  > **Do not change Planner's functions, data or rules.** Baseline: `apps/planner/src/*` (React, shadow-root embed), spec `docs/PLANNER_PRODUCT_DESIGN_SPEC.md`, tests (`planner.test.mjs`, 277 DB checks). Everything there stays: plans, focus areas, objectives, sub-objectives, kinds and nesting, KPIs/KPI types, progress modes, update schedules, reviews with snapshots, alignment, reports, metrics, CSV import/export, saved views, filters, display, turn into work, strategy model (strategies, kinds, KPI types, reusable focus areas, time horizons, templates), permissions. Prototype `planner6.js` + `v7.js`, routes `#/planner/...`.
  > ## Strategy model › Strategy map → **Strategy builder** [N design, existing data]
  > - **Focused page** (fix for wasted space): one compact title row (Strategy model + its tabs inline: Strategy map, Objective kinds, KPI types, Focus areas, Time horizons, Templates) → one **strategy bar**: strategy switcher dropdown (lists all strategies with plan counts, + New strategy) with stats line (n focus areas · n objectives · n KPIs · n tasks · used by n plans), New strategy, **Create a plan from it** (existing), **Create a project from it** [N], ⋯ (rename, duplicate, delete). Then the builder fills the rest of the viewport (`calc(100vh − 190px)`, min 600).
- **Sections and headings, in order:** “Strategy model” · “Inspector” · “KEYBOARD”
- **Buttons and actions (28):** `First 1000 Followers on Facebook` — action `stratmenu`; `New strategy` — action `plnewstrat` (opens: New strategy); `Create a plan from it` — prototype stand-in (shows a toast: “Plan created with these focus areas, objectives, KPIs and tasks.”); build the real action from the brief; `Create a project from it` — action `strat2proj`; `Zoom out` — action `sbz:-1`; `Zoom in` — action `sbz:1`; `Fit` — action `sbz:0`; `Collapse all` — action `sbcollapse`; `Focus on this area` — action `sbfocus:f1`; `Collapse` — action `sbcol:f1`; `+ Objective` — prototype stand-in (shows a toast: “Add an objective under Social media Posts.”); build the real action from the brief; `GOAL Write 5 Days Posts TR On track 1 1 + KPI + Task + Sub` — action `snsel:f1-0|0`; `+ KPI` — prototype stand-in (shows a toast: “Add a KPI”); build the real action from the brief; `+ Task` — prototype stand-in (shows a toast: “Add a task.”); build the real action from the brief; `+ Sub` — prototype stand-in (shows a toast: “Add a sub-objective.”); build the real action from the brief; `Focus on this area` — action `sbfocus:f2`; `Collapse` — action `sbcol:f2`; `+ Objective` — prototype stand-in (shows a toast: “Add an objective under 5 Days Post Challenge.”); build the real action from the brief; `GOAL Launch the challenge page TR Not started 1 + KPI + Task + Sub` — action `snsel:f2-0|0`; `INITIATIVE Line up 3 guest coaches UM On track + KPI + Task + Sub` — action `snsel:f2-1|0`; `INITIATIVE Daily live sessions TR Not started + KPI + Task + Sub` — action `snsel:f2-2|0`; `Focus on this area` — action `sbfocus:f3`; `Collapse` — action `sbcol:f3`; `+ Objective` — prototype stand-in (shows a toast: “Add an objective under Offers.”); build the real action from the brief; `GOAL Package the DFY offer TR Not started 1 + KPI + Task + Sub` — action `snsel:f3-0|0`; `INITIATIVE Write the sales page SN Not started + KPI + Task + Sub` — action `snsel:f3-1|0`; `INITIATIVE Price test TR Not started + KPI + Task + Sub` — action `snsel:f3-2|0`; `Focus area` — action `plfa` (opens: Focus area)
- **Links (navigation) (10):** `Strategy map` → `planner/model/map`; `Objective kinds` → `planner/model/kinds`; `KPI types` → `planner/model/kpi`; `Focus areas` → `planner/model/fa`; `Time horizons` → `planner/model/horizons`; `Templates` → `planner/model/tpl`; `Home` → `planner/home`; `My work` → `planner/mywork`; `Plans` → `planner/plans`; `Alignment` → `planner/alignment`
- **Inputs, filters and selects (1):** `Find on the map`
- **Data shown (prototype sample data — not product data):** Planner / Strategy model Strategy model Strategy map Objective kinds KPI types Focus areas Time horizons Templates First 1000 Followers on Facebook 3 focus areas · 7 objectives · 3 KPIs · 1 tasks · used by 1 plan New strategy Create a plan from it Create a project from it 100% Collapse all Focus area Objective KPI · task · sub First 1000 Followers on Facebook 3 focus areas Social media Posts 1 objectives · Current + …
- **Permissions and visibility:** Anyone with access to Planner in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.
