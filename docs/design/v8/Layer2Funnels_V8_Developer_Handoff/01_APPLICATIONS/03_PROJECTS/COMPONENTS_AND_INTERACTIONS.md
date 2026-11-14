# Projects · components and interactions

Visual specs for every component: `00_MASTER_DOCUMENTATION/01_DESIGN_SYSTEM.md` §6. Exact CSS: `08_PROTOTYPE_AND_SOURCE/prototype-source/` (later files override earlier: base → v4 → v5 → v6 → v7 → v8).

Prototype source files for this app: `projects5.js`, `projects6.js`, `pdata5.js`.

## Shared components used

- Table (.tbl6)
- Card / ruled panel (.card6)
- Tabs (.tabs6)
- KPI band item (.kpi6)
- Segmented switch (.vsw)
- Filter chips
- Toggle
- Task status pill (.stp)
- Project status (.psp)
- Empty state (.empty)
- Selection bar (.selbar)
- Right drawer / panel
- Dialog (.dlg)
- Context menu (.ctx)
- Form field (.field)
- Input with icon (.inp)
- Task row (.trow6)
- Avatar (initials)
- App mark / plate
- Progress bar
- Progress ring
- Toast
- Pill / tag

## Dialogs and drawers (from the prototype source)

| Opening action id | Kind | Title |
|---|---|---|
| `quickadd` | dialog | Quick add |
| `addtask` | dialog | Add task |
| `members` | dialog | Project members |
| `newproj` | dialog | New project |
| `viewgal` | dialog | Add a view |
| `newres` | dialog | New in this project |
| `(inline)` | drawer | — |
| `logtime` | dialog | Log time |
| `addsec` | dialog | Add section |
| `pfields` | dialog | Fields |
| `ppeople` | dialog | Assignees |
| `editproj` | dialog | Edit project |
| `addlink` | dialog | Add link or embed |
| `delforever` | dialog | Delete forever? |
| `pkeys` | dialog | Keyboard shortcuts |

Where the same action id appears in a v5 and a v6 file, the later file wins (that is what the prototype shows).

## Captured overlay states (desktop 1440)

- task-panel: [screenshot](../../06_SCREENSHOTS_AND_REFERENCES/v8/overlays-1440/03_PROJECTS__task-panel.jpg) (route `#/projects/p/p1/list`)
- new-project-dialog: [screenshot](../../06_SCREENSHOTS_AND_REFERENCES/v8/overlays-1440/03_PROJECTS__new-project-dialog.jpg) (route `#/projects/home`)
- task-context-menu: [screenshot](../../06_SCREENSHOTS_AND_REFERENCES/v8/overlays-1440/03_PROJECTS__task-context-menu.jpg) (route `#/projects/p/p1/list`)
- projects-archived-tab: [screenshot](../../06_SCREENSHOTS_AND_REFERENCES/v8/overlays-1440/03_PROJECTS__projects-archived-tab.jpg) (route `#/projects/all`)

## Interaction catalogue (every action id found on this app's pages)

| Action id | Control labels using it | Opens |
|---|---|---|
| `msheet` | Apps and account | — |
| `sidetoggle` | Collapse sidebar | — |
| `usearch` | Search everything; Search projects and tasks Ctrl K | — |
| `ptimer` | Start timer; Write a Challenge funnel for Layer2Funne | — |
| `quickadd` | New task (Q) | Quick add |
| `newproj` | New project; New project (Shift P) | New project |
| `pkeys` | Keyboard shortcuts (?) | Keyboard shortcuts |
| `psel` | Select | — |
| `tdone` | Complete | — |
| `task` | Brand Brand kit from client AR 20 Oct; Brand kit from client; Build Build quiz in GoHighLevel BK 3 Nov; Build quiz in GoHighLevel; Copy Email follow-up sequence SN 5 Nov; Copy Quiz questions v2 SN UM 22 Oct; Copy Results | — |
| `pstm` | Done; In progress; Review; To do | — |
| `more` | More | More |
| `noop` | 30d; 7d; 90d; Board; Columns; Custom; Edit; List; Sort: Manual; This project | — |
| `chipt` | All; All 5; Archives; At risk; Audio; Client 2; Code; Collections; Completed today; Documents; Done; Embeds; Images; Internal 2; Links; Off track; On hold; On track; PDFs; Personal 1; Presentations; Spreadsheets; Videos | — |
| `pwk` | 12 weeks; 4 weeks; 6 weeks; 8 weeks | — |
| `toast` | 11h; 12h; 13h; 14h; 15h; 16h; 17h; 18h; 19h; 20h; 21h; 23h; 24h; 25h; 26h; 31h; 32h; 33h; 34h; 37h; 38h; 39h; 40h; 41h Over; 42h Over; 43h Over; 44h Over; 48h Over; 49h Over; 4h; 50h Over; 5h; 6h; 7h; 8h; Assignee; At ri | — |
| `pptab` | Active; Archived; Templates | — |
| `delforever` | Delete forever | Delete forever? |
| `pfav` | Favourite | — |
| `members` | AR SN BK Manage; Manage; SN BK Manage; TR SN AR UM Manage | Project members |
| `pmenu` | Project actions | — |
| `viewgal` | View | Add a view |
| `pfields` | Fields | Fields |
| `pgrp` | Group: Section | — |
| `phide` | Hide done | — |
| `sectm` | Column menu; Section menu | — |
| `addtask` | Add; Add card; Add task on 1; Add task on 10; Add task on 11; Add task on 12; Add task on 13; Add task on 14; Add task on 15; Add task on 16; Add task on 17; Add task on 18; Add task on 19; Add task on 2; Add task on 20; | Add task |
| `addsec` | Add section | Add section |
| `pboard` | By section; By status | — |
| `pcal` | Month; Week | — |
| `ptl` | Month; Quarter; Week | — |
| `addlink` | Add link; Link or embed | Add link or embed |
| `newres` | New | New in this project |
| `parch` | Restore | — |

## Keyboard and right-click (from the brief)

- **Baseline = Projects V2 in the repo** (`apps/projects/web/*`, React + Vite, mounted at `#/projects`; docs `docs/apps/PROJECTS_AUDIT.md`, `DESIGN_BRIEF_Projects.md`). Every feature listed in DESIGN_BRIEF_Projects §5–8 stays (views, task panel, shortcuts, right-click, drag alternatives, optimistic updates, states). This brief = ecosystem skin [R] + three additions [N]. Tokens: map `--pm-*` tokens to the ecosystem values in `assets/tokens.css` (keep the `pm-` class prefix). Prototype: `projects6.js`, routes `#/projects/...`.
- - **App bar (must keep the original quick actions)**: crumbs · `Search projects and tasks  Ctrl K` (opens global search scoped to Projects & tasks) · **running timer pill** (original design: red recording dot, task name, elapsed `0:05`, round stop button; click = stop and log) · icon buttons with tooltips: New task (Q), New project (Shift P), Start timer, My Work (G M), Keyboard shortcuts (?). Notifications and profile are in the rail. Phone: quick actions collapse to one "+" menu.
- Nav: Home · My Work (count) · Workload · Portfolio · **Files [N]** · All projects. Then "Projects" area: `Filter projects` input; segmented **All · Client · Internal · Personal**; groups (collapsible, + on hover creates a project of that type): **Favourites** · **Clients** (one sub-folder per client with initial avatar) · **<Organization>** (internal) · **Personal** (lock, note "Only you can see these"). Project row (36 px, **14.5 px**): colour dot, name (ellipsis), red overdue badge, open count; on hover ★ and ⋯. Right-click: Open, Favourite, Edit, Members, Duplicate, Save as template, Archive, Move to trash. Trash link at the bottom. No horizontal scrollbars ever (names ellipsize).
- - **Files [N]**: every file attached to projects/tasks the user can open, in one table: type icon + name, project (dot), attached to (Project / Task: name), added by, updated, size. Search, project select, type chips (All, Documents, Images, PDFs, Spreadsheets, Links), list/grid. Row click opens the file where it lives (Drive editor or link); right-click Open, Download, Copy link, Move to…, Remove (unlinks; does not delete the Drive file unless the user chooses). Upload asks for the project (and optional task). **Data**: query over `file_links` + task attachments + project docs/links + collection items with RLS; no copies.
- - **Project page**: header (6 px colour bar, inline-rename title 27 px, ★, status pill menu, type badge (users icon + client name / building + Internal / lock + Personal · private), due, visibility (globe Whole organization / people Project members / lock Only you), member stack + Manage, ⋯). Tabs with icons: Overview · List (DEFAULT mark) · Board · Calendar · Timeline · Report · Docs & links · Collection · optional Gallery/Activity/Docs via **+ View** gallery; tabs renamable, right-click (Rename, Make default, Copy link, Remove).
- - **Task panel** [R] (right drawer 680 px; full-width mode centres at 960; full screen on phone). Header sticky: Mark complete (pill, green when done) · Follow · previous/next · copy link · full width · ⋯ (Duplicate, Create follow-up task, Convert to subtask/Make top-level, Move to trash) · close. Body: breadcrumb Project › Section › #n; title 24 px; field rows label-left 132 px (Status, Priority, Assignees chips + Add + Assign to me, Start date, Due date, Estimate, Repeat with helper, Section, Tags, custom fields); Add field; Show N empty fields / Collapse empty fields; sections separated by hairlines: Description, Subtasks, Checklist, Waiting on | Blocking, Links, Attachments (drop zone 25 MB), **Time (original layout: big logged total, entries count, Log time, Start timer button; entries list with person, duration, date, billable)**, Activity tabs Comments / All activity / Status hist
- - Keyboard and right-click exactly as DESIGN_BRIEF_Projects §8; help modal lists them.

## Interaction rules that apply everywhere

- All navigation is a real link (Ctrl/middle-click open new tabs) — 02 §3.
- Right-click menus use the shared `.ctx` component: Escape closes, arrows move, long-press opens on touch.
- Every visible control works or is clearly marked "Later". The prototype's toasts and fake data are not product behaviour.
