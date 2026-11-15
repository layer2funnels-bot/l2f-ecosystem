# P02 Tasks — report

Built from scratch to V8 `01_APPLICATIONS/04_TASKS` (prototype `tasks6.js`), branch `p02-tasks` (stacked on `p01-office`). Not merged, not deployed.
Migration **0059 is local only** (production untouched).

## Done vs planned
| Planned (`TASKS_PLAN.md`) | Status |
|---|---|
| Today: capture bar (dates, `@person`, `#list`, `!high`), From your lists, From other apps (Projects tasks + Planner updates due) | Done |
| Upcoming: Today, next 5 days, Next week; counts; + Add | Done |
| Inbox: captures without a list, source label, Move to list | Done |
| Teammates: People (needs "See teammates’ tasks") / Tasks I gave; person page with their lists, Given by others, private count, Give a task | Done |
| Lists: Personal / Team, folders, blocks (collapse, rename, move, delete, + Add block), outline rows with sub-tasks, completed hidden in place with Show/Hide completed (n), List · Board (drag) · Calendar (2 weeks, drag, double-click to add) | Done |
| Dialogs: Add a task, New list or folder, Assign people (multi), Manage access (multi, Can edit / Can view, Select everyone), Due date, Icon and colour, Rename | Done |
| Right-click / ⋯ / long-press menus (task and list), keyboard (Enter, Tab / Shift Tab, Ctrl Enter, Alt ↑↓, Esc) | Done |
| Timer per task; one running timer across Tasks and Projects; pill in the app bar of every app | Done (own `task_time_entries`; starting either app's timer stops the other) |
| Send to a project (links back); Turn into a project | Done |
| Private tasks (personal lists only); managers see a count | Done |
| Notifications to every assignee | Done (`private.notify`, 0054) |
| Offline capture queue | Done (browser queue, sent when back online) |
| Phone: bottom bar Today · Upcoming · Inbox · Teammates · More; swipe right to complete; long-press menu | Done |

## Changed from the plan
- Timer: Projects' `pm_time_entries` was **not** altered (its rules are project-scoped). Tasks has its own table, and both apps stop each other's running timer, which still gives one running timer per person.
  The shell shows one pill in every app (`timer.running`); in Projects the shell shows only a Tasks timer, because Projects already shows its own.
- Owners and admins see every team list (by design in 0059); others see team lists only when given access on the list or its folder.
- Shared toast gained an optional action button (Undo).

## Files
- DB: `migrations/0059_tasks.sql`, `migrations/rollback/0059_tasks.down.sql`.
- API: `packages/core/tasks-operations.mjs` (registered in `operations.mjs`), `packages/core/pm/server/ops/time.ts` (stops a Tasks timer).
- UI: `apps/web/js/modules/tasks.js`, `apps/web/js/modules/tasksmodel.js`, `apps/tasks/app.manifest.json`; routes, app menu, shell (app-bar slot `__barRight`, timer pill, `phoneOnly` menu items), `ui.js` toast action.
- Styles: generated `apps/web/pages/tasks.css`, `tasks-side.css` (`scripts/build-page-css.mjs` entries `tasks`, `tasks-side`), V8 sizes in `v8-base.css` / `shell-v8.css`.
- Tests: `test/tasks.test.mjs` (20), `test/web.test.mjs` W46–W47, `scripts/e2e-tasks.mjs` (33, in CI as `test:e2e:tasks`), audit RPC allow-list, manifest count, Launcher order (V8: Tasks ends the Everyday group).

## Tests (local stack, 15 Nov)
- API: `tasks.test` 20/20 (all six acceptance items through the API, folder inheritance, view-only, isolation).
- Browser: `e2e-tasks` 33/33 — flows 1–5, acceptance 1–6, keyboard, menus, Undo, Inbox, Upcoming, layouts at 1280 (mouse), 834 and 390 (touch, 44 px), no script errors.
- Regression: `npm test` all suites green; `e2e-ui` 265/265; `e2e-onboarding` 22/22; `e2e-local` 71/71.
- V8 comparison: `scripts/v8-compare.mjs tk-` (Today, Upcoming, Inbox, Teammates, My tasks, team list × 1440/834/390); sidebar rows set to V8's 15.5 px / 42 px.

## Pages (from PAGES_AND_NAVIGATION.md)
| Page | Present | Works | Compared with V8 |
|---|---|---|---|
| Today | yes | capture, ticks, other apps | `e2e-shots/v8cmp/tk-today-*.png` |
| Upcoming | yes | columns, + Add | `tk-upcoming-*` |
| Inbox | yes | Move to list, tick | `tk-inbox-*` |
| Teammates (People / Tasks I gave) | yes | permission-gated, tabs | `tk-teammates-*` |
| My tasks (blocks, show completed) | yes | all row and block controls | `tk-mine-*` |
| Team list with access | yes | Manage access, views | `tk-team-*` |
| Person (e.g. Ayesha Raza) | yes | Give a task, private count | `e2e-shots/tk3-person.png` |

## Known issues / decisions
- Migration 0059 needs production approval (after 0054–0058).
- "Mind maps" in the Launcher description is V8's own wording; V8 removed the Mind map view (as specified).
- Attachments on a task (Drive refs) and the notes editor are not surfaced in the row UI yet (the data model has `notes`); not listed as a page control in V8.
