# Projects · user flows and workflows

Each flow names the prototype route or control. "Source" says where the rule is defined. Cross-app flows: `05_STRATEGY_AND_ARCHITECTURE/CROSS_APP_WORKFLOWS.md`.

## 1. Create a project

**Who:** Teammate · **Source:** Brief: New / Edit project

1. New project (Shift P or top bar) → modal: Client · Internal · Personal, Name*, Client* (client type), Visibility, Colour, dates, template
2. Personal is hidden/disabled with reason unless Office › Admin feature "Create personal projects"
3. Project page opens on List (default view)

## 2. Plan and run tasks in List

**Who:** Teammate · **Source:** Brief: List, Task panel

1. Project › List (#/projects/p/:project/list): sections, "+ Add task…", "+ Add section"
2. Row: complete circle, title, subtasks/checklist/waiting indicators, tags, assignees, due, priority flag, status pill menu
3. Click title → task panel (right drawer 680 px) with all fields, subtasks, checklist, dependencies, links, attachments, time, activity

## 3. Track time

**Who:** Teammate · **Source:** Brief: App bar

1. Start timer (top bar or task panel)
2. Running timer pill visible on every Projects page (and Tasks)
3. Click pill → stop → time entry logged to the task

## 4. Check my work and workload

**Who:** Teammate/lead · **Source:** Brief

1. My Work (#/projects/mywork): Overdue · Today · This week · Later · No date
2. Workload (#/projects/workload): person × week heat map vs 40 h; click a cell → tasks

## 5. Find a file attached anywhere

**Who:** Teammate · **Source:** Brief: Files [N]

1. Files (#/projects/files): one table of all attachments the user can open
2. Row → opens the original in Drive or the link; Remove only unlinks

## 6. Archive / trash / restore

**Who:** Owner of project · **Source:** Brief

1. Project ⋯ → Archive (#/projects/p/:project/overview shows archived banner)
2. Trash (#/projects/trash) → Restore or Delete forever (typed confirmation)

## Navigation graph (generated from the prototype links)

Page → pages it links to (within and outside the app).

- `projects/home` → `projects/all`, `projects/files`, `projects/mywork`, `projects/p/:project/list`, `projects/p/:project/overview`, `projects/portfolio`, `projects/workload`
- `projects/mywork` → `projects/all`, `projects/files`, `projects/home`, `projects/p/:project/list`, `projects/portfolio`, `projects/workload`
- `projects/workload` → `projects/all`, `projects/files`, `projects/home`, `projects/mywork`, `projects/p/:project/list`, `projects/portfolio`
- `projects/portfolio` → `projects/all`, `projects/files`, `projects/home`, `projects/mywork`, `projects/p/:project/list`, `projects/p/:project/overview`, `projects/workload`
- `projects/files` → `drive/edit/doc/:file`, `drive/edit/image/:file`, `drive/edit/pdf/:file`, `drive/edit/sheet/:file`, `projects/all`, `projects/home`, `projects/mywork`, `projects/p/:project/files`, `projects/p/:project/list`, `projects/portfolio`, `projects/workload`
- `projects/all` → `projects/files`, `projects/home`, `projects/mywork`, `projects/p/:project/list`, `projects/p/:project/overview`, `projects/portfolio`, `projects/workload`
- `projects/trash` → `projects/all`, `projects/files`, `projects/home`, `projects/mywork`, `projects/p/:project/list`, `projects/portfolio`, `projects/workload`
- `projects/p/:project/overview` → `projects/all`, `projects/files`, `projects/home`, `projects/mywork`, `projects/p/:project/board`, `projects/p/:project/calendar`, `projects/p/:project/collection`, `projects/p/:project/docs`, `projects/p/:project/list`, `projects/p/:project/report`, `projects/p/:project/timeline`, `projects/portfolio`, `projects/workload`
- `projects/p/:project/list` → `projects/all`, `projects/files`, `projects/home`, `projects/mywork`, `projects/p/:project/board`, `projects/p/:project/calendar`, `projects/p/:project/collection`, `projects/p/:project/docs`, `projects/p/:project/overview`, `projects/p/:project/report`, `projects/p/:project/timeline`, `projects/portfolio`, `projects/workload`
- `projects/p/:project/board` → `projects/all`, `projects/files`, `projects/home`, `projects/mywork`, `projects/p/:project/calendar`, `projects/p/:project/collection`, `projects/p/:project/docs`, `projects/p/:project/list`, `projects/p/:project/overview`, `projects/p/:project/report`, `projects/p/:project/timeline`, `projects/portfolio`, `projects/workload`
- `projects/p/:project/calendar` → `projects/all`, `projects/files`, `projects/home`, `projects/mywork`, `projects/p/:project/board`, `projects/p/:project/collection`, `projects/p/:project/docs`, `projects/p/:project/list`, `projects/p/:project/overview`, `projects/p/:project/report`, `projects/p/:project/timeline`, `projects/portfolio`, `projects/workload`
- `projects/p/:project/timeline` → `projects/all`, `projects/files`, `projects/home`, `projects/mywork`, `projects/p/:project/board`, `projects/p/:project/calendar`, `projects/p/:project/collection`, `projects/p/:project/docs`, `projects/p/:project/list`, `projects/p/:project/overview`, `projects/p/:project/report`, `projects/portfolio`, `projects/workload`
- `projects/p/:project/report` → `projects/all`, `projects/files`, `projects/home`, `projects/mywork`, `projects/p/:project/board`, `projects/p/:project/calendar`, `projects/p/:project/collection`, `projects/p/:project/docs`, `projects/p/:project/list`, `projects/p/:project/overview`, `projects/p/:project/timeline`, `projects/portfolio`, `projects/workload`
- `projects/p/:project/docs` → `drive/edit/doc/:file`, `drive/edit/sheet/:file`, `projects/all`, `projects/files`, `projects/home`, `projects/mywork`, `projects/p/:project/board`, `projects/p/:project/calendar`, `projects/p/:project/collection`, `projects/p/:project/list`, `projects/p/:project/overview`, `projects/p/:project/report`, `projects/p/:project/timeline`, `projects/portfolio`, `projects/workload`, `whiteboard/board/:id`
- `projects/p/:project/collection` → `projects/all`, `projects/files`, `projects/home`, `projects/mywork`, `projects/p/:project/board`, `projects/p/:project/calendar`, `projects/p/:project/docs`, `projects/p/:project/list`, `projects/p/:project/overview`, `projects/p/:project/report`, `projects/p/:project/timeline`, `projects/portfolio`, `projects/workload`
- `projects/p/:project/files` → `projects/all`, `projects/files`, `projects/home`, `projects/mywork`, `projects/p/:project/board`, `projects/p/:project/calendar`, `projects/p/:project/collection`, `projects/p/:project/docs`, `projects/p/:project/list`, `projects/p/:project/overview`, `projects/p/:project/report`, `projects/p/:project/timeline`, `projects/portfolio`, `projects/workload`
