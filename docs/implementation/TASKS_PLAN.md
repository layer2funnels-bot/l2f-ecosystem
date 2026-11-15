# P02 Tasks — plan

Spec: `01_APPLICATIONS/04_TASKS/*` (authoritative brief: `FEATURES_AND_FUNCTIONALITY.md` §2), prompt `07_PROMPTS/P04_TASKS.md`, prototype `tasks5.js` + `tasks6.js`.
Status in repo: **nothing exists** (no `tasks` app in the catalog, no tables, no UI). Built from scratch on branch `p02-tasks` (from `p01-office`). One PR when the whole app is done.

## Pages → code
| Page | Route | File | Notes |
|---|---|---|---|
| Today | `#/tasks/today` | `apps/web/js/modules/tasks.js` (+ `tasksmodel.js` for pure logic) | capture bar with natural language (dates, `@person`, `#list`, `!high`); "From your lists"; "From other apps" (Projects `my.work`, Planner updates due) — ticked in the source app |
| Upcoming | `#/tasks/upcoming` | same | day cards Today … Next week, counts, "+ Add" |
| Inbox | `#/tasks/inbox` | same | unsorted captures and items sent from other apps; "Move to list" |
| Teammates | `#/tasks/teammates` | same | tabs People / Tasks I gave; needs feature "See teammates’ tasks" |
| Person | `#/tasks/teammates/:person` | same | their lists, "Given by others", private count, Give a task |
| List | `#/tasks/list/:id` | same | blocks, outline rows, sub-tasks, Show/Hide completed (n), List · Board · Calendar, Manage access / Share, ⋯ |
Dialogs: Add a task, New list or folder, Assign people, Manage access. Context menus (task, list), keyboard (Enter, Tab/Shift Tab, Ctrl Enter, Alt ↑/↓, Esc).
Styles: `apps/web/pages/tasks.css` generated from the prototype by `scripts/build-page-css.mjs` (root `.v8p-tasks`), V8 values: sheet hairline/radius 8/no shadow/max 980 px, task 15.5 px, block heading 19 px, Show/Hide completed 14.5 px, sidebar 15.5 px / 42 px rows.

## Data — migration 0059 (local only until approved)
- `apps` row `tasks` (Everyday group, plates #5EEAD4 → #0EA5A4 → #08706F), app manifest `apps/tasks/app.manifest.json`, permissions:
  `tasks.use` (viewer), `tasks.team.create` (editor), `tasks.teammates.view` ("See teammates’ tasks", default admin).
- `task_folders`, `task_lists` (space personal|team, is_default "My tasks" per user, archived_at), `task_list_access` (list or folder, user, edit|view),
  `task_blocks`, `task_items` (parent_id, position, title, done_at, due_date, due_time, priority, private, notes, source_app, source_ref, project_task_id),
  `task_assignees`.
- RLS: personal lists owner only; team lists = owner + `task_list_access` (folder access inherited); private items owner only;
  `tasks_private_count(person)` security definer for the "n private tasks not shown" line. Organization scope on every table.
- **Shared timer**: extend `pm_time_entries` (Projects) with `task_item_id`, make `task_id`/`project_id` nullable with a check "exactly one of the two";
  one running entry per user (existing rule) now covers both apps; `timer.running` reads either. The app-bar pill moves to the shell so Projects and Tasks show the same one.
- Notifications through `private.notify` (0054): assigned to you, given a task.
- Send to a project: creates a Projects task (`pm.tasks.create` path, permission-checked), marks the item done with `project_task_id` link.

## API (`packages/core/tasks-operations.mjs`)
lists/folders (list, create, rename, icon/colour, duplicate, archive, access get/set multi-select), blocks (create, rename, move, collapse, delete),
items (create from capture, update, complete/uncomplete, indent/outdent, move, assign, private, delete + undo, send to project),
views (today, upcoming, inbox, teammates, person, tasks I gave), timer (start, stop, running).

## Tests
`test/tasks.test.mjs` (DB/API: the six acceptance items, isolation L2F/Aurj, private never leaks, 4th person 404, folder inheritance, one running timer across apps),
`test/web.test.mjs` (capture parser, completed-hidden logic), `scripts/e2e-ui.mjs` (pages, flows 1–5, 1440/834/390, touch sizes), V8 comparison.

## Risks / questions
- Changing `pm_time_entries` touches Projects: additive and reversible, covered by Projects tests.
- "Turn into a project" (list menu) = Send each open task to a new project? Assumption: creates a Projects project with the list's open tasks; marked "Later" if V8 shows it only as a menu item.
- Offline capture queue: browser-local queue retried on reconnect.
- Phone swipe-to-complete and long-press menu: built (touch).
