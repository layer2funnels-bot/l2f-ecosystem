# Projects · features and functionality

Status marks: **[E]** existing, keep · **[R]** redesigned (same function, new design) · **[N]** new, build it · **[F]** future, do not build (show "Later" only where stated). Functions are unchanged from v7; V8 changes only the visual design (section 3).

## 1. Change register for this app (what the repo does not have yet)

- [R] Ecosystem skin of all existing pages and the task panel (fields, sections, timer, activity tabs as today).
- [R] Sidebar: segmented All · Client · Internal · Personal, groups Favourites / Clients (folder per client) / Organization / Personal ("Only you can see these").
- [N] **Files** page: all files of projects and tasks in one place (references, not copies).
- [N] **Personal projects** creation in the New project modal + Admin feature "Create personal projects".
- [R] Top bar keeps the original quick actions: search projects and tasks (Ctrl K), running timer pill, New task, New project, Start timer, My Work, Keyboard shortcuts.

## 2. Full functional brief (authoritative, carried over from v7 unchanged except the Funnel Mapper rename)

### Projects · implementation brief

**Baseline = Projects V2 in the repo** (`apps/projects/web/*`, React + Vite, mounted at `#/projects`; docs `docs/apps/PROJECTS_AUDIT.md`, `DESIGN_BRIEF_Projects.md`). Every feature listed in DESIGN_BRIEF_Projects §5–8 stays (views, task panel, shortcuts, right-click, drag alternatives, optimistic updates, states). This brief = ecosystem skin [R] + three additions [N]. Tokens: map `--pm-*` tokens to the ecosystem values in `assets/tokens.css` (keep the `pm-` class prefix). Prototype: `projects6.js`, routes `#/projects/...`.

#### Shell [R]
- Projects renders inside the ecosystem rail; its own sidebar (248 px, light `--surface2`, not dark) and app bar.
- **App bar (must keep the original quick actions)**: crumbs · `Search projects and tasks  Ctrl K` (opens global search scoped to Projects & tasks) · **running timer pill** (original design: red recording dot, task name, elapsed `0:05`, round stop button; click = stop and log) · icon buttons with tooltips: New task (Q), New project (Shift P), Start timer, My Work (G M), Keyboard shortcuts (?). Notifications and profile are in the rail. Phone: quick actions collapse to one "+" menu.

#### Sidebar [R]
Nav: Home · My Work (count) · Workload · Portfolio · **Files [N]** · All projects. Then "Projects" area: `Filter projects` input; segmented **All · Client · Internal · Personal**; groups (collapsible, + on hover creates a project of that type): **Favourites** · **Clients** (one sub-folder per client with initial avatar) · **<Organization>** (internal) · **Personal** (lock, note "Only you can see these"). Project row (36 px, **14.5 px**): colour dot, name (ellipsis), red overdue badge, open count; on hover ★ and ⋯. Right-click: Open, Favourite, Edit, Members, Duplicate, Save as template, Archive, Move to trash. Trash link at the bottom. No horizontal scrollbars ever (names ellipsize).

#### Pages (all [R] unless marked)
- **Home**: date + greeting; KPI row (My open tasks, Overdue, Due this week, Completed today, Active projects, At risk/off track; each links); My open tasks card; Recent projects cards (colour bar, type, due, progress, members).
- **All projects**: tabs Active / Templates / Archived; search; type chips with counts; status chips; table grouped Client / Org / Personal (colour, name, type, status pill, owner, due (red if late), progress %, open + overdue badge).
- **My Work**: groups Overdue · Today · This week · Later · No date (+ Completed today toggle); List/Board.
- **Workload**: person × week heatmap vs 40 h (Light/Steady/Busy 32 h+/Over 40 h legend), Overdue, No date, project filter, 4/6/8/12 weeks; click cell → tasks.
- **Portfolio**: tiles + sortable table ("N days late").
- **Files [N]**: every file attached to projects/tasks the user can open, in one table: type icon + name, project (dot), attached to (Project / Task: name), added by, updated, size. Search, project select, type chips (All, Documents, Images, PDFs, Spreadsheets, Links), list/grid. Row click opens the file where it lives (Drive editor or link); right-click Open, Download, Copy link, Move to…, Remove (unlinks; does not delete the Drive file unless the user chooses). Upload asks for the project (and optional task). **Data**: query over `file_links` + task attachments + project docs/links + collection items with RLS; no copies.
- **Trash**: restore; Delete forever with typed confirmation.
- **Project page**: header (6 px colour bar, inline-rename title 27 px, ★, status pill menu, type badge (users icon + client name / building + Internal / lock + Personal · private), due, visibility (globe Whole organization / people Project members / lock Only you), member stack + Manage, ⋯). Tabs with icons: Overview · List (DEFAULT mark) · Board · Calendar · Timeline · Report · Docs & links · Collection · optional Gallery/Activity/Docs via **+ View** gallery; tabs renamable, right-click (Rename, Make default, Copy link, Remove).
  - **List**: toolbar (search, Assignee, Tag, Status, Priority, Due, custom-field filters · Columns, Fields, Group: Section/Status/…, Sort: Manual, Hide done). Table header Name · Tags · Assignees · Due · flag · Status. Sections collapsible with count and ⋯ (rename, move, delete); "+ Add task…" per section; **"+ Add section"** at the end (dialog or inline). Row 42 px: drag handle, select box, complete circle, title (inline rename), indicators (subtasks n/m, checklist, waiting on), tags, up to 3 assignees +N, due (red/amber), priority flag, status pill menu. Bulk bar when selected.
  - **Board**: By status / By section; "+ Add section" column in section mode; cards: tags, title, subtask progress, assignees, due, priority; drag + "Move to…" alternative; Done muted.
  - **Calendar** (month/week, weekend shading, today, chips, "+N more", day quick add, Unscheduled tray) · **Timeline** (sections, Week/Month/Quarter, Today line, bars with resize handles, milestone diamonds) · **Overview** (date presets, assignee, include subtasks; KPI tiles with sparklines; charts: status donut, completed vs created, remaining vs ideal, by priority, workload stacked, overdue list; each chart ⋯ Download PNG / Copy CSV; description, members) · **Report** (tiles, charts, people table) · **Docs & links** (groups Docs/Whiteboards/Spreadsheets/Links, add link) · **Collection** (type tabs, toolbar, folders, source labels Uploaded file / External link / Embed, storage meter).
- **New / Edit project modal** [R + N]: subtitle "Projects hold tasks, docs and people around one outcome."; segmented **Client · Internal · Personal** with helper line; Name*; Description; Client* (client type only; from Clients service); Visibility (Project members / Whole organization; Personal = read-only "Only you"); Colour swatches (9); Start/Due date pickers; Start from template (+ hint). Validation, unsaved-changes guard. **Personal** option hidden or disabled with reason if the user lacks the feature "Create personal projects" [N] (Office › Admin). Personal projects are private to the owner (even admins can't see).
- **Task panel** [R] (right drawer 680 px; full-width mode centres at 960; full screen on phone). Header sticky: Mark complete (pill, green when done) · Follow · previous/next · copy link · full width · ⋯ (Duplicate, Create follow-up task, Convert to subtask/Make top-level, Move to trash) · close. Body: breadcrumb Project › Section › #n; title 24 px; field rows label-left 132 px (Status, Priority, Assignees chips + Add + Assign to me, Start date, Due date, Estimate, Repeat with helper, Section, Tags, custom fields); Add field; Show N empty fields / Collapse empty fields; sections separated by hairlines: Description, Subtasks, Checklist, Waiting on | Blocking, Links, Attachments (drop zone 25 MB), **Time (original layout: big logged total, entries count, Log time, Start timer button; entries list with person, duration, date, billable)**, Activity tabs Comments / All activity / Status history. Footer pinned composer with @mentions, Ctrl Enter.
- Keyboard and right-click exactly as DESIGN_BRIEF_Projects §8; help modal lists them.

#### Acceptance
- Every V2 feature still works (run the existing e2e suite).
- Personal project: creatable only with permission; invisible to others incl. admins (DB test).
- Files page lists attachments from tasks and project docs, opens originals, never duplicates storage.
- Timer pill visible on every Projects page while running; stop logs time to the task.
- Names readable: project rows 14.5 px; task rows 14.5 px; no sidebar horizontal scroll.


## 3. What V8 changes visually (no functional change)

- KPI strip is one ruled band with dividers, not six floating boxes.
- Home "My open tasks": compact grid matches visible columns so assignee avatars never sit on dates.
- Sidebar tree constrains its children: no horizontal overflow, names ellipsize.
- Workload heat map has a real grid layout (v7 printed rows as run-on text).
- Timer pill: red recording dot (8 px) — v7 rendered a red blob from a leaked class.
- Top-bar quick actions render as an icon row (v7 collapsed them via a leaked class).
- Task panel: values 15 px, labels 14 px, section titles 16 px, field rows 44 px, label column 150 px, title 24 px; subtasks show circular assignee avatars.
