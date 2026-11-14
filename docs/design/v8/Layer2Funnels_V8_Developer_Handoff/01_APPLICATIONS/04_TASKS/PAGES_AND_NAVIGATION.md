# Tasks · pages and navigation

7 pages documented (every page in the v7 route list for this app, plus every page template reached by following links). 6 templates in total. Each entry gives the 11 required fields: name/purpose, access, layout, sections, buttons/actions, inputs/filters, navigation/destinations, data, permissions, states, responsive.

Labels in back-ticks are the exact text or accessible name of the control in the V8 prototype. Controls present on every page (rail, app bar, Prototype button) are documented once in `01_APPLICATIONS/00_SHELL_AND_LAUNCHER/`.

## Sidebar menu

- **Today 4** → `tasks/today`
- **Upcoming** → `tasks/upcoming`
- **Inbox 2** → `tasks/inbox`
- **Teammates** → `tasks/teammates`
- **My tasks 4** → `tasks/list/:list`
- **Funnel Challenge 3** → `tasks/list/:list`
- **Build team 2** → `tasks/list/:list`
- **Content ideas 3** → `tasks/list/:list`

## Page templates and their instances

| Template | Instances reached in the prototype | Documented as |
|---|---|---|
| `tasks/today` | 1 | Today |
| `tasks/upcoming` | 1 | Upcoming |
| `tasks/inbox` | 1 | Inbox |
| `tasks/teammates` | 1 | Teammates |
| `tasks/list/:list` | 4 | My tasks (blocks, show completed), Team list with access |
| `tasks/teammates/:person` | 5 | Ayesha Raza |

## Pages

### Today

- **Route (prototype):** `#/tasks/today` — template `tasks/today`
- **In the v7 route list:** yes — Today
- **How the user gets here:** sidebar item **Today 4**; breadcrumb Tasks › Today; linked from `drive/edit/doc/:file`, `drive/edit/image/:file`, `drive/edit/pdf/:file`, `drive/edit/sheet/:file`, `drive/edit/slides/:file`, `fmp/funnel/:funnel`, `fmp/funnel/:funnel/reports`, `launcher` …
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/04_TASKS/100_tasks_today.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/04_TASKS/100_tasks_today.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/04_TASKS/100_tasks_today.jpg)
- **Purpose and spec (from the app brief):**
  > | Today | tasks/today | Big icon + title + date line. **Capture bar** (natural language: dates "tomorrow 3pm", `@person`, `#list`, `!high`; Enter adds to My tasks for today). Card "From your lists" (today's open tasks across lists). Card "From other apps" (Projects tasks, Planner updates due) with source plate; ticking happens in the source app. |
- **Sections and headings, in order:** “Today” · “From your lists” · “From other apps”
- **Buttons and actions (7):** `Add task` — action `tcap` (opens: Add a task); `Complete` — action `tdone6:today.0.0`; `Timer` — action `ttimer:Reply to Victor about the retaine`; `Task menu` — action `tmenu:today.0.0`; `Complete` — action `tdone6:today.0.1`; `Timer` — action `ttimer:Check GHL calendar sync`; `Task menu` — action `tmenu:today.0.1`
- **Links (navigation) (8):** `Write results page copy Harry Kaye quiz funnel Today` → `projects/p/:project/list`; `Post update: 40 booked calls 2027 Growth plan Today` → `planner/plan/:plan/builder`; `Review quiz flow wireframe Harry Kaye quiz funnel Tomorrow` → `projects/p/:project/board`; `Approve email sequence v2 Mindful Money course launch Overdue` → `projects/p/:project/list`; `Today` → `tasks/today`; `Upcoming` → `tasks/upcoming`; `Inbox` → `tasks/inbox`; `Teammates` → `tasks/teammates`
- **Inputs, filters and selects (1):** `Add a task`
- **Editable regions (2):** `Reply to Victor about the retainer`; `Check GHL calendar sync`
- **Data shown (prototype sample data — not product data):** Tasks / Today Add task Today Thursday 12 November · your lists plus work assigned to you in Projects and Planner. Enter From your lists 2 Reply to Victor about the retainer Today Check GHL calendar sync TR Today From other apps Tick them where they live Write results page copy Harry Kaye quiz funnel Today Post update: 40 booked calls 2027 Growth plan Today Review quiz flow wireframe Harry Kaye quiz funnel Tomorrow Ap…
- **Permissions and visibility:** Anyone with access to Tasks in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Upcoming

- **Route (prototype):** `#/tasks/upcoming` — template `tasks/upcoming`
- **In the v7 route list:** yes — Upcoming
- **How the user gets here:** sidebar item **Upcoming**; breadcrumb Tasks › Upcoming; linked from `tasks/inbox`, `tasks/list/:list`, `tasks/teammates`, `tasks/teammates/:person`, `tasks/today`
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/04_TASKS/101_tasks_upcoming.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/04_TASKS/101_tasks_upcoming.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/04_TASKS/101_tasks_upcoming.jpg)
- **Purpose and spec (from the app brief):**
  > | Upcoming | tasks/upcoming | Day columns/cards (Today, Fri, Mon, … Next week) with counts and "+ Add". |
- **Sections and headings, in order:** “Upcoming” · “Today” · “Fri” · “Mon” · “Tue” · “Wed” · “Next week”
- **Buttons and actions (2):** `Add task` — action `tcap` (opens: Add a task); `Add` — action `tcap` (opens: Add a task)
- **Links (navigation) (4):** `Today` → `tasks/today`; `Upcoming` → `tasks/upcoming`; `Inbox` → `tasks/inbox`; `Teammates` → `tasks/teammates`
- **Data shown (prototype sample data — not product data):** Tasks / Upcoming Add task Upcoming Today 2 Reply to Victor about the retainer Check GHL calendar sync Add Fri 2 Plan next week Day 3: Draft email Add Mon 1 Renew domain for EfficusAI Add Tue 1 Book cover brief to Ayesha Add Wed 1 Set up quiz scoring in GHL Add Next week 1 Day 4: Traffic basics Add Upcoming Today 2 Reply to Victor about the retainer Check GHL calendar sync Add Fri 2 Plan next week Day 3: Draft email A…
- **Permissions and visibility:** Anyone with access to Tasks in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Inbox

- **Route (prototype):** `#/tasks/inbox` — template `tasks/inbox`
- **In the v7 route list:** yes — Inbox
- **How the user gets here:** sidebar item **Inbox 2**; breadcrumb Tasks › Inbox; linked from `tasks/list/:list`, `tasks/teammates`, `tasks/teammates/:person`, `tasks/today`, `tasks/upcoming`
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/04_TASKS/102_tasks_inbox.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/04_TASKS/102_tasks_inbox.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/04_TASKS/102_tasks_inbox.jpg)
- **Purpose and spec (from the app brief):**
  > | Inbox | tasks/inbox | Explanation line; items with source label and "Move to list". |
- **Sections and headings, in order:** “Inbox”
- **Buttons and actions (3):** `Add task` — action `tcap` (opens: Add a task); (icon) — action `chipt`; `Move to list` — prototype stand-in (shows a toast: “Moved to My tasks.”); build the real action from the brief
- **Links (navigation) (4):** `Today` → `tasks/today`; `Upcoming` → `tasks/upcoming`; `Inbox` → `tasks/inbox`; `Teammates` → `tasks/teammates`
- **Data shown (prototype sample data — not product data):** Tasks / Inbox Add task Inbox Quick captures without a list, and tasks other apps send you (from a meeting, an avatar’s next steps, an email). Sort them when you have a minute. Idea: quiz for Aurj parents Captured on phone Move to list Interview 5 real Johns From Customer Avatar Move to list Test GHL calendar sync From Meeting Intelligence Move to list Inbox Quick captures without a list, and tasks other apps send you…
- **Permissions and visibility:** Anyone with access to Tasks in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Teammates

- **Route (prototype):** `#/tasks/teammates` — template `tasks/teammates`
- **In the v7 route list:** yes — Teammates
- **How the user gets here:** sidebar item **Teammates**; breadcrumb Tasks › Teammates; linked from `tasks/inbox`, `tasks/list/:list`, `tasks/teammates/:person`, `tasks/today`, `tasks/upcoming`
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/04_TASKS/103_tasks_teammates.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/04_TASKS/103_tasks_teammates.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/04_TASKS/103_tasks_teammates.jpg)
- **Purpose and spec (from the app brief):**
  > | Teammates | tasks/teammates | Tabs People / Tasks I gave. People: cards (avatar, name, role, Open, Due today). Person page: their own lists and "Given by others", private count, "Give a task". Tasks I gave: table task, to, list, due, status. |
- **Sections and headings, in order:** “Teammates”
- **Buttons and actions (3):** `Add task` — action `tcap` (opens: Add a task); `People` — action `ttab:people`; `Tasks I gave` — action `ttab:given`
- **Links (navigation) (9):** `AR Ayesha Raza Designer Open 4 Due today 0` → `tasks/teammates/:person`; `BK Bilal Khan Developer Open 5 Due today 1` → `tasks/teammates/:person`; `SN Sana Noor Copywriter Open 6 Due today 2` → `tasks/teammates/:person`; `UM Usman Malik Strategist Open 7 Due today 0` → `tasks/teammates/:person`; `AH Ahmad Hassan Ads specialist Open 8 Due today 1` → `tasks/teammates/:person`; `Today` → `tasks/today`; `Upcoming` → `tasks/upcoming`; `Inbox` → `tasks/inbox`; `Teammates` → `tasks/teammates`
- **Data shown (prototype sample data — not product data):** Tasks / Teammates Add task Teammates What each person is working on. Visible to people with “See teammates’ tasks”. People Tasks I gave AR Ayesha Raza Designer Open 4 Due today 0 BK Bilal Khan Developer Open 5 Due today 1 SN Sana Noor Copywriter Open 6 Due today 2 UM Usman Malik Strategist Open 7 Due today 0 AH Ahmad Hassan Ads specialist Open 8 Due today 1 Teammates What each person is working on. Visible to people …
- **Permissions and visibility:** Requires the feature "See teammates’ tasks"; private tasks show only as a count. [Confirmed: Tasks brief §1]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### My tasks (blocks, show completed)

- **Route (prototype):** `#/tasks/list/mine` — template `tasks/list/:list` (4 instances in the prototype, e.g. `tasks/list/mine`, `tasks/list/team`, `tasks/list/challenge`, `tasks/list/content`)
- **In the v7 route list:** yes — My tasks (blocks, show completed)
- **How the user gets here:** sidebar item **My tasks 4**; breadcrumb Tasks › Personal › My tasks; linked from `office/home`
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/04_TASKS/104_tasks_list_mine.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/04_TASKS/104_tasks_list_mine.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/04_TASKS/104_tasks_list_mine.jpg)
- **Purpose and spec (from the app brief):**
  > - **Folder**: groups lists (e.g. "Clients" folder with one list per client). Access set on a folder is inherited by its lists.
  > - **List**: a document-like page with **blocks** (named sections, e.g. "Today Tasks", "This week"). Default personal list "**My tasks**" exists for every user and can't be deleted.
  > - **Completed tasks are hidden in place.** At the bottom of each list one control: **"Show completed (n)"**; when on, completed tasks appear **in their original position** (strikethrough, checked) and the control reads **"Hide completed (n)"** (see Tabish's Taskade screenshots). Completing a task while hidden: check animation → fades out after 600 ms → toast "Done… Show completed brings it back".
- **Sections and headings, in order:** “My tasks” · “Today Tasks” · “This week”
- **Buttons and actions (31):** `Add task` — action `tcap` (opens: Add a task); `Share` — action `tshare:mine` (opens: Who can open “${TL[k].n}”); `List menu` — action `tmenul:mine`; `List` — action `tview:list`; `Board` — action `tview:board`; `Calendar` — action `tview:cal`; `Collapse`; `Block menu` — prototype stand-in (shows a toast: “Rename · Move · Delete block”); build the real action from the brief; `Collapse` — action `ttw`; `Complete` — action `tdone6:mine.0.3`; `Timer` — action `ttimer:Plan next week`; `Task menu` — action `tmenu:mine.0.3`; `Complete` — action `tdone6:mine.0.3.0`; `Timer` — action `ttimer:Review Planner objectives`; `Task menu` — action `tmenu:mine.0.3.0`; `Complete` — action `tdone6:mine.0.3.1`; `Timer` — action `ttimer:Block 2 deep-work mornings`; `Task menu` — action `tmenu:mine.0.3.1`; `Complete` — action `tdone6:mine.0.9`; `Timer` — action `ttimer:Reply to Victor about the retaine`; `Task menu` — action `tmenu:mine.0.9`; `Complete` — action `tdone6:mine.0.10`; `Timer` — action `ttimer:Renew domain for EfficusAI`; `Task menu` — action `tmenu:mine.0.10`; `Complete` — action `tdone6:mine.0.11`; `Timer` — action `ttimer:Read “$100M Leads” ch. 4`; `Task menu` — action `tmenu:mine.0.11`; `Add task` — action `tadd6:mine|0`; `Add task` — action `tadd6:mine|1`; `Add block` — action `tblock:mine`; `Show completed (49)` — action `tsd:mine`
- **Links (navigation) (4):** `Today` → `tasks/today`; `Upcoming` → `tasks/upcoming`; `Inbox` → `tasks/inbox`; `Teammates` → `tasks/teammates`
- **Editable regions (8):** `Today Tasks`; `Plan next week`; `Review Planner objectives`; `Block 2 deep-work mornings`; `Reply to Victor about the retainer`; `Renew domain for EfficusAI`; `Read “$100M Leads” ch. 4`; `This week`
- **Data shown (prototype sample data — not product data):** Tasks / Personal / My tasks Add task My tasks Only you can see this list. Share List Board Calendar Tip: right-click any task. Today Tasks 4 Plan next week Fri Review Planner objectives Block 2 deep-work mornings Reply to Victor about the retainer Today Renew domain for EfficusAI Mon Read “$100M Leads” ch. 4 Private Add task This week 0 Add task Add block Show completed (49) Created by Tabish · only you My tasks Only…
- **Permissions and visibility:** Anyone with access to Tasks in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Team list with access

- **Route (prototype):** `#/tasks/list/team` — template `tasks/list/:list` (4 instances in the prototype, e.g. `tasks/list/mine`, `tasks/list/team`, `tasks/list/challenge`, `tasks/list/content`)
- **In the v7 route list:** yes — Team list with access
- **How the user gets here:** sidebar item **Build team 2**; breadcrumb Tasks › Team › Build team; linked from `office/home`
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/04_TASKS/105_tasks_list_team.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/04_TASKS/105_tasks_list_team.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/04_TASKS/105_tasks_list_team.jpg)
- **Purpose and spec (from the app brief):**
  > - **Folder**: groups lists (e.g. "Clients" folder with one list per client). Access set on a folder is inherited by its lists.
  > - **List**: a document-like page with **blocks** (named sections, e.g. "Today Tasks", "This week"). Default personal list "**My tasks**" exists for every user and can't be deleted.
  > - **Completed tasks are hidden in place.** At the bottom of each list one control: **"Show completed (n)"**; when on, completed tasks appear **in their original position** (strikethrough, checked) and the control reads **"Hide completed (n)"** (see Tabish's Taskade screenshots). Completing a task while hidden: check animation → fades out after 600 ms → toast "Done… Show completed brings it back".
- **Sections and headings, in order:** “Build team” · “Open” · “Later”
- **Buttons and actions (25):** `Add task` — action `tcap` (opens: Add a task); `TR BK SN Manage access` — action `tshare:team` (opens: Who can open “${TL[k].n}”); `List menu` — action `tmenul:team`; `List` — action `tview:list`; `Board` — action `tview:board`; `Calendar` — action `tview:cal`; `Collapse`; `Block menu` — prototype stand-in (shows a toast: “Rename · Move · Delete block”); build the real action from the brief; `Complete` — action `tdone6:team.0.3`; `Timer` — action `ttimer:Check GHL calendar sync`; `Task menu` — action `tmenu:team.0.3`; `Collapse` — action `ttw`; `Complete` — action `tdone6:team.0.9`; `Timer` — action `ttimer:Set up quiz scoring in GHL`; `Task menu` — action `tmenu:team.0.9`; `Complete` — action `tdone6:team.0.9.0`; `Timer` — action `ttimer:Map 3 result pages`; `Task menu` — action `tmenu:team.0.9.0`; `Complete` — action `tdone6:team.0.9.1`; `Timer` — action `ttimer:Test with 5 fake leads`; `Task menu` — action `tmenu:team.0.9.1`; `Add task` — action `tadd6:team|0`; `Add task` — action `tadd6:team|1`; `Add block` — action `tblock:team`; `Show completed (13)` — action `tsd:team`
- **Links (navigation) (4):** `Today` → `tasks/today`; `Upcoming` → `tasks/upcoming`; `Inbox` → `tasks/inbox`; `Teammates` → `tasks/teammates`
- **Editable regions (6):** `Open`; `Check GHL calendar sync`; `Set up quiz scoring in GHL`; `Map 3 result pages`; `Test with 5 fake leads`; `Later`
- **Data shown (prototype sample data — not product data):** Tasks / Team / Build team Add task Build team Shared with 3 people. TR BK SN Manage access List Board Calendar Tip: right-click any task. Open 2 Check GHL calendar sync TR Today Set up quiz scoring in GHL BK Wed Map 3 result pages Test with 5 fake leads Add task Later 0 Add task Add block Show completed (13) Created by Tabish · shared with 3 people Build team Shared with 3 people. TR BK SN Manage access List Board Ca…
- **Permissions and visibility:** Anyone with access to Tasks in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Ayesha Raza

- **Route (prototype):** `#/tasks/teammates/AR` — template `tasks/teammates/:person` (5 instances in the prototype, e.g. `tasks/teammates/AR`, `tasks/teammates/BK`, `tasks/teammates/SN`, `tasks/teammates/UM`)
- **In the v7 route list:** no — reached by following links in the prototype
- **How the user gets here:** sidebar item **Teammates**; breadcrumb Tasks › Teammates › Ayesha Raza; linked from `tasks/teammates`
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/04_TASKS/163_tasks_teammates_AR.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/04_TASKS/163_tasks_teammates_AR.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/04_TASKS/163_tasks_teammates_AR.jpg)
- **Purpose and spec (from the app brief):**
  > | Teammates | tasks/teammates | Tabs People / Tasks I gave. People: cards (avatar, name, role, Open, Due today). Person page: their own lists and "Given by others", private count, "Give a task". Tasks I gave: table task, to, list, due, status. |
- **Sections and headings, in order:** “Ayesha Raza” · “My tasks” · “Given by others”
- **Buttons and actions (2):** `Add task` — action `tcap` (opens: Add a task); `Give a task` — action `tcap` (opens: Add a task)
- **Links (navigation) (4):** `Teammates` → `tasks/teammates`; `Today` → `tasks/today`; `Upcoming` → `tasks/upcoming`; `Inbox` → `tasks/inbox`
- **Data shown (prototype sample data — not product data):** Tasks / Teammates / Ayesha Raza Add task Teammates AR Ayesha Raza Lists Ayesha made for themself, and tasks others gave them. Private items show as a count. Give a task My tasks 3 Quiz questions v2 Results page copy Email 3 subject lines Given by others 1 Case study: 41 booked calls · from Tabish 3 private tasks not shown. Teammates AR Ayesha Raza Lists Ayesha made for themself, and tasks others gave them. Private it…
- **Permissions and visibility:** Requires the feature "See teammates’ tasks"; private tasks show only as a count. [Confirmed: Tasks brief §1]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.
