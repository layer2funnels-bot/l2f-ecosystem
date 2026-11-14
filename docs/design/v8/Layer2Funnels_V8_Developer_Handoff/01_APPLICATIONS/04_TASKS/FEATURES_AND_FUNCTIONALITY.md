# Tasks · features and functionality

Status marks: **[E]** existing, keep · **[R]** redesigned (same function, new design) · **[N]** new, build it · **[F]** future, do not build (show "Later" only where stated). Functions are unchanged from v7; V8 changes only the visual design (section 3).

## 1. Change register for this app (what the repo does not have yet)

Today, Upcoming, Inbox, Teammates (with "Tasks I gave"), Personal and Team lists and folders, **blocks** inside lists, **completed tasks hidden in place** with a Show/Hide completed (n) control, **timer per task**, **multiple assignees**, **list/folder access** with multi-select, right-click menu, List/Board/Calendar views (no Table, no Mind map).

## 2. Full functional brief (authoritative, carried over from v7 unchanged except the Funnel Mapper rename)

### Tasks · implementation brief (NEW APP, build from scratch)

Purpose: light, fast to-do lists for one person and for teams (Taskade-like). Projects is for structured client/internal projects; Tasks is for everyday lists, personal plans and team checklists. Prototype: `tasks5.js` + `tasks6.js` (+ v7 changes in build), routes `#/tasks/...`. App id `tasks`, plate colours `#5EEAD4 → #0EA5A4 → #08706F`, icon `tasks`. Build it the same way as other shell apps in `apps/web/js/modules/` (vanilla JS module) unless Claude Code proposes React like Projects/Planner with a reason. Add `apps/tasks/app.manifest.json`, migration, API operations in `packages/core`, tests.

#### 1. Concepts and rules
- **Space**: Personal (only the owner) or Team (the organization).
- **Folder**: groups lists (e.g. "Clients" folder with one list per client). Access set on a folder is inherited by its lists.
- **List**: a document-like page with **blocks** (named sections, e.g. "Today Tasks", "This week"). Default personal list "**My tasks**" exists for every user and can't be deleted.
- **Task**: title (inline text), done, due (date and optional time), priority (normal/high), **assignees (many)**, private flag (personal lists only; hides even the title from managers), parent (sub-tasks, unlimited nesting, Tab/Shift Tab indent), notes, attachments (Drive refs), time entries, created_by, source (e.g. "From Meeting Intelligence").
- **Completed tasks are hidden in place.** At the bottom of each list one control: **"Show completed (n)"**; when on, completed tasks appear **in their original position** (strikethrough, checked) and the control reads **"Hide completed (n)"** (see Tabish's Taskade screenshots). Completing a task while hidden: check animation → fades out after 600 ms → toast "Done… Show completed brings it back".
- **Timer per task**: start from the row's timer icon or right-click. One running timer per user across Tasks and Projects (shared timer service); running timer shows as the pill in the app bar (task name + `h:mm:ss` + stop). Stop logs a time entry. Completing a task with a running timer stops and logs it.
- **Visibility**: Teammates page shows a person's lists only to users with the feature "See teammates’ tasks"; private tasks show as a count ("3 private tasks not shown").
- Inbox = unsorted captures and tasks sent from other apps (avatar next steps, meeting action items, phone capture). This is distinct from My Work (Projects) and Today.
- "Assigned to me" was removed as a separate menu (duplicated My Work/Today). "Tasks I gave" lives as a tab in Teammates.

#### 2. Navigation
Sidebar (v7: **15.5 px, 42 px rows**): Today (count) · Upcoming · Inbox (count) · Teammates. Then **Personal** (lock) lists, **Team · <Org>** lists, each list row: coloured icon tile, name, open count; right-click list menu (Rename, Icon and colour, Duplicate, Share/Access, Turn into a project, Archive). "+ New list or folder". App bar: running timer pill (when on) + "Add task".

#### 3. Pages
| Page | Route | Content |
|---|---|---|
| Today | tasks/today | Big icon + title + date line. **Capture bar** (natural language: dates "tomorrow 3pm", `@person`, `#list`, `!high`; Enter adds to My tasks for today). Card "From your lists" (today's open tasks across lists). Card "From other apps" (Projects tasks, Planner updates due) with source plate; ticking happens in the source app. |
| Upcoming | tasks/upcoming | Day columns/cards (Today, Fri, Mon, … Next week) with counts and "+ Add". |
| Inbox | tasks/inbox | Explanation line; items with source label and "Move to list". |
| Teammates | tasks/teammates | Tabs People / Tasks I gave. People: cards (avatar, name, role, Open, Due today). Person page: their own lists and "Given by others", private count, "Give a task". Tasks I gave: table task, to, list, due, status. |
| List | tasks/list/:id | Header: icon tile 48 px, title, privacy line, **Manage access** (team) or Share (personal), ⋯. View switch **List · Board · Calendar** (Table and Mind map removed). List view = white document card (max 880 px, radius 18, shadow) on the app's soft gradient: blocks (collapsible, editable heading, open count, ⋯ Rename/Move/Delete block), outline rows (grip, collapse arrow, round checkbox, inline-editable text, Private pill, assignee stack, priority flag, due chip, timer button (on hover; teal when running), ⋯), "+ Add task" per block, **"+ Add block"** divider, **Show/Hide completed (n)**, footer "Created by … · shared with n people". Board: To do / Today / Done columns. Calendar: 2-week grid. |

#### 4. Dialogs and menus
- Add task (app bar / Give a task): text, For (people multi-select), List select.
- **Assign people**: search + checkbox list (multi-select at once), "Everyone ticked is responsible".
- **Manage access** (list/folder): search people or group; checkbox list with Can edit / Can view per person; "Select everyone", group chips (e.g. Delivery team); note "Applies to every block and task; folders pass access to lists inside". Server enforces.
- New list or folder: List | Folder (+ explanation), name, where (Personal/Team), people chips (team).
- Right-click task: Complete (Ctrl Enter), Start timer, Add sub-task, Assign people…, Due date…, Priority…, Make private, Move to block…, Move to list…, **Send to a project** (moves into Projects, leaves a link), Duplicate, Copy link, Delete (Undo toast).
- Keyboard: Enter new task below, Tab/Shift Tab indent/outdent, Ctrl Enter complete, Alt ↑/↓ move, Esc leave editing.

#### 5. Data [N]
`task_folders(id, workspace_id, owner_id, space, name, icon, colour, position)`, `task_lists(id, workspace_id, folder_id?, owner_id, space personal|team, name, icon, colour, is_default, archived_at)`, `task_list_access(list_id|folder_id, user_id, level edit|view)`, `task_blocks(id, list_id, name, position, collapsed)`, `task_items(id, list_id, block_id, parent_id, position, title, done_at, due_date, due_time, priority, private, notes, source_app, source_ref, created_by)`, `task_assignees(item_id, user_id)`, time entries via the shared timer table used by Projects (`time_entries(user_id, app, item_ref, started_at, ended_at, seconds, billable)`). RLS: personal lists owner only; team lists by `task_list_access` or org rule; private items owner only (count exposed through a security-definer function).

#### 6. States, responsive
Empty list ("Add your first task"), empty Today ("Nothing due today"), offline capture queue, error retry. Phone: sidebar → bottom bar (Today, Upcoming, Inbox, Teammates, More), document card full width, swipe right to complete, long-press for the menu.

#### 7. Acceptance
1. Complete 3 tasks → hidden; Show completed (3) → they reappear in their places; Hide completed (3) hides again.
2. Two assignees on one task; both see it in Today; notifications sent to both.
3. Timer started in Tasks shows the same pill in Projects; stopping logs one entry.
4. Team list access with 3 people picked at once; a fourth person gets 404 on the list API.
5. Private task never appears to a manager, only the count.
6. Send to a project creates a Projects task and links back.


## 3. What V8 changes visually (no functional change)

- Decorative teal/violet background wash removed.
- List "document" sheet: hairline border, radius 8, no shadow, max width 980 px.
- Task text 15.5 px; block headings 19 px; Show/Hide completed 14.5 px.
