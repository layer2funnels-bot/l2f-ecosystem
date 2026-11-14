# Projects · responsive design

Global rules: `04_RESPONSIVE_DESIGN/DESKTOP_TABLET_MOBILE_RULES.md`. Navigation: `NAVIGATION_RESPONSIVE_BEHAVIOR.md`. This app's specifics: `APP_SPECIFIC_MOBILE_REQUIREMENTS.md`.

## Confirmed (shown by the V8 prototype at every width)

- Breakpoints: phone ≤760 px, tablet 761–1100 px, desktop >1100 px.
- Phone: rail and app sidebar hidden; bottom tab bar = the app's first 4 nav items + More; app bar shows the org mark that opens the apps-and-account sheet.
- Touch screens: every control ≥44 px (`@media (pointer:coarse)`).
- No horizontal page scroll at 390 px on any page of this app (automated check).

## Confirmed in the brief

- - **App bar (must keep the original quick actions)**: crumbs · `Search projects and tasks  Ctrl K` (opens global search scoped to Projects & tasks) · **running timer pill** (original design: red recording dot, task name, elapsed `0:05`, round stop button; click = stop and log) · icon buttons with tooltips: New task (Q), New project (Shift P), Start timer, My Work (G M), Keyboard shortcuts (?). Notifications and profile are in the rail. Phone: quick actions collapse to one "+" menu.
- - **Task panel** [R] (right drawer 680 px; full-width mode centres at 960; full screen on phone). Header sticky: Mark complete (pill, green when done) · Follow · previous/next · copy link · full width · ⋯ (Duplicate, Create follow-up task, Convert to subtask/Make top-level, Move to trash) · close. Body: breadcrumb Project › Section › #n; title 24 px; field rows label-left 132 px (Status, Priority, Assignees chips + Add + Assign to me, Start date, Due date, Estimate, Repeat with helper, Section, Tags, custom fields); Add field; Show N empty fields / Collapse empty fields; sections separated by hairlines: Description, Subtasks, Checklist, Waiting on | Blocking, Links, Attachments (drop zone 25 MB), **Time (original layout: big logged total, entries count, Log time, Start timer button; entries list with person, duration, date, billable)**, Activity tabs Comments / All activity / Status hist

## Page-by-page screenshots

| Page | Desktop 1440 | Tablet 834 | Phone 390 |
|---|---|---|---|
| Home (`#/projects/home`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/03_PROJECTS/038_projects_home.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/03_PROJECTS/038_projects_home.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/03_PROJECTS/038_projects_home.jpg) |
| My Work (`#/projects/mywork`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/03_PROJECTS/039_projects_mywork.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/03_PROJECTS/039_projects_mywork.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/03_PROJECTS/039_projects_mywork.jpg) |
| Workload (`#/projects/workload`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/03_PROJECTS/040_projects_workload.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/03_PROJECTS/040_projects_workload.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/03_PROJECTS/040_projects_workload.jpg) |
| Portfolio (`#/projects/portfolio`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/03_PROJECTS/041_projects_portfolio.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/03_PROJECTS/041_projects_portfolio.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/03_PROJECTS/041_projects_portfolio.jpg) |
| Files (new) (`#/projects/files`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/03_PROJECTS/042_projects_files.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/03_PROJECTS/042_projects_files.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/03_PROJECTS/042_projects_files.jpg) |
| All projects (`#/projects/all`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/03_PROJECTS/043_projects_all.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/03_PROJECTS/043_projects_all.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/03_PROJECTS/043_projects_all.jpg) |
| Trash (`#/projects/trash`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/03_PROJECTS/044_projects_trash.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/03_PROJECTS/044_projects_trash.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/03_PROJECTS/044_projects_trash.jpg) |
| Overview (`#/projects/p/p1/overview`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/03_PROJECTS/045_projects_p_p1_overview.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/03_PROJECTS/045_projects_p_p1_overview.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/03_PROJECTS/045_projects_p_p1_overview.jpg) |
| List (`#/projects/p/p1/list`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/03_PROJECTS/046_projects_p_p1_list.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/03_PROJECTS/046_projects_p_p1_list.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/03_PROJECTS/046_projects_p_p1_list.jpg) |
| Board (`#/projects/p/p1/board`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/03_PROJECTS/047_projects_p_p1_board.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/03_PROJECTS/047_projects_p_p1_board.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/03_PROJECTS/047_projects_p_p1_board.jpg) |
| Calendar (`#/projects/p/p1/calendar`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/03_PROJECTS/048_projects_p_p1_calendar.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/03_PROJECTS/048_projects_p_p1_calendar.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/03_PROJECTS/048_projects_p_p1_calendar.jpg) |
| Timeline (`#/projects/p/p1/timeline`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/03_PROJECTS/049_projects_p_p1_timeline.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/03_PROJECTS/049_projects_p_p1_timeline.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/03_PROJECTS/049_projects_p_p1_timeline.jpg) |
| Report (`#/projects/p/p1/report`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/03_PROJECTS/050_projects_p_p1_report.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/03_PROJECTS/050_projects_p_p1_report.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/03_PROJECTS/050_projects_p_p1_report.jpg) |
| Docs & links (`#/projects/p/p1/docs`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/03_PROJECTS/051_projects_p_p1_docs.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/03_PROJECTS/051_projects_p_p1_docs.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/03_PROJECTS/051_projects_p_p1_docs.jpg) |
| Collection (`#/projects/p/p1/collection`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/03_PROJECTS/052_projects_p_p1_collection.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/03_PROJECTS/052_projects_p_p1_collection.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/03_PROJECTS/052_projects_p_p1_collection.jpg) |
| Archived project (`#/projects/p/p5/overview`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/03_PROJECTS/053_projects_p_p5_overview.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/03_PROJECTS/053_projects_p_p5_overview.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/03_PROJECTS/053_projects_p_p5_overview.jpg) |
| Mindful Money course launch (`#/projects/p/p2/files`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/03_PROJECTS/138_projects_p_p2_files.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/03_PROJECTS/138_projects_p_p2_files.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/03_PROJECTS/138_projects_p_p2_files.jpg) |

## Proposed (not separately approved by the owner — see D14/D15)

- Tables become stacked rows on phone (label: value) when they have more than 3 columns; first column stays the row title.
- Right-side panels/drawers open full screen on phone with a sticky header (Close, title) and pinned footer actions.
- Dialogs become bottom sheets on phone (max height 90 vh, drag handle, sticky actions).
- Multi-column dashboards collapse to one column in reading order: primary list first, side summaries after.
