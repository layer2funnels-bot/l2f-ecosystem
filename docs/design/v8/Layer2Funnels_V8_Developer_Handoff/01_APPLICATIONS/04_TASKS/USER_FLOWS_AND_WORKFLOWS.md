# Tasks · user flows and workflows

Each flow names the prototype route or control. "Source" says where the rule is defined. Cross-app flows: `05_STRATEGY_AND_ARCHITECTURE/CROSS_APP_WORKFLOWS.md`.

## 1. Capture and finish today's tasks

**Who:** Any user · **Source:** Brief §1, §3

1. Today (#/tasks/today) → capture bar (natural language: dates, @person, #list, !high)
2. Tick a task → it hides in place; toast offers Show completed
3. "Show completed (n)" reveals completed tasks in their original positions; "Hide completed (n)" hides again

## 2. Run a team list

**Who:** List owner · **Source:** Brief §3–4

1. New list or folder → List | Folder, name, Personal/Team, people
2. Manage access: multi-select people/groups with Can edit / Can view; folders pass access to lists
3. Blocks inside the list; "+ Add block"; List · Board · Calendar views

## 3. Give a task to a teammate

**Who:** Teammate · **Source:** Brief §3–4

1. Teammates (#/tasks/teammates) → person → Give a task, or Add task "For" multi-select
2. Assign people dialog: everyone ticked is responsible
3. Tasks I gave tab tracks status

## 4. Time a task

**Who:** Any user · **Source:** Brief §1

1. Row timer button (hover) or right-click → Start timer
2. One running timer per user across Tasks and Projects; pill in the app bar
3. Stop or complete → one time entry logged

## 5. Send a task to a project

**Who:** Any user · **Source:** Brief §4

1. Right-click task → Send to a project
2. Projects task created, link left behind

## Navigation graph (generated from the prototype links)

Page → pages it links to (within and outside the app).

- `tasks/today` → `planner/plan/:plan/builder`, `projects/p/:project/board`, `projects/p/:project/list`, `tasks/inbox`, `tasks/list/:list`, `tasks/teammates`, `tasks/upcoming`
- `tasks/upcoming` → `tasks/inbox`, `tasks/list/:list`, `tasks/teammates`, `tasks/today`
- `tasks/inbox` → `tasks/list/:list`, `tasks/teammates`, `tasks/today`, `tasks/upcoming`
- `tasks/teammates` → `tasks/inbox`, `tasks/list/:list`, `tasks/teammates/:person`, `tasks/today`, `tasks/upcoming`
- `tasks/list/:list` → `tasks/inbox`, `tasks/teammates`, `tasks/today`, `tasks/upcoming`
- `tasks/teammates/:person` → `tasks/inbox`, `tasks/list/:list`, `tasks/teammates`, `tasks/today`, `tasks/upcoming`
