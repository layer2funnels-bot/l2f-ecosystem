# Tasks · components and interactions

Visual specs for every component: `00_MASTER_DOCUMENTATION/01_DESIGN_SYSTEM.md` §6. Exact CSS: `08_PROTOTYPE_AND_SOURCE/prototype-source/` (later files override earlier: base → v4 → v5 → v6 → v7 → v8).

Prototype source files for this app: `tasks5.js`, `tasks6.js`.

## Shared components used

- Table (.tbl6)
- Card / ruled panel (.card6)
- Tabs (.tabs6)
- Segmented switch (.vsw)
- Toggle
- Dialog (.dlg)
- Context menu (.ctx)
- Form field (.field)
- Input with icon (.inp)
- Outline row (Tasks)
- Avatar (initials)
- App mark / plate
- Progress bar
- Progress ring
- Toast
- Pill / tag

## Dialogs and drawers (from the prototype source)

| Opening action id | Kind | Title |
|---|---|---|
| `tcap` | dialog | Add a task |
| `newlist` | dialog | New list or folder |
| `tpeople` | dialog | Assign people |
| `tshare` | dialog | Who can open “${TL[k].n}” |

Where the same action id appears in a v5 and a v6 file, the later file wins (that is what the prototype shows).

## Captured overlay states (desktop 1440)

- tasks-add-dialog: [screenshot](../../06_SCREENSHOTS_AND_REFERENCES/v8/overlays-1440/04_TASKS__tasks-add-dialog.jpg) (route `#/tasks/list/mine`)
- tasks-show-completed: [screenshot](../../06_SCREENSHOTS_AND_REFERENCES/v8/overlays-1440/04_TASKS__tasks-show-completed.jpg) (route `#/tasks/list/mine`)
- tasks-board-view: [screenshot](../../06_SCREENSHOTS_AND_REFERENCES/v8/overlays-1440/04_TASKS__tasks-board-view.jpg) (route `#/tasks/list/mine`)
- tasks-calendar-view: [screenshot](../../06_SCREENSHOTS_AND_REFERENCES/v8/overlays-1440/04_TASKS__tasks-calendar-view.jpg) (route `#/tasks/list/mine`)

## Interaction catalogue (every action id found on this app's pages)

| Action id | Control labels using it | Opens |
|---|---|---|
| `msheet` | Apps and account | — |
| `sidetoggle` | Collapse sidebar | — |
| `tcap` | Add; Add task; Give a task | Add a task |
| `usearch` | Search everything | — |
| `tdone6` | Complete | — |
| `ttimer` | Timer | — |
| `tmenu` | Task menu | — |
| `chipt` | (icon) | — |
| `toast` | Block menu; Move to list | — |
| `ttab` | People; Tasks I gave | — |
| `tshare` | Share; TR BK SN Manage access | Who can open “${TL[k].n}” |
| `tmenul` | List menu | — |
| `tview` | Board; Calendar; List | — |
| `ttw` | Collapse | — |
| `tadd6` | Add task | — |
| `tblock` | Add block | — |
| `tsd` | Show completed (13); Show completed (49) | — |

## Keyboard and right-click (from the brief)

- - **Task**: title (inline text), done, due (date and optional time), priority (normal/high), **assignees (many)**, private flag (personal lists only; hides even the title from managers), parent (sub-tasks, unlimited nesting, Tab/Shift Tab indent), notes, attachments (Drive refs), time entries, created_by, source (e.g. "From Meeting Intelligence").
- - **Timer per task**: start from the row's timer icon or right-click. One running timer per user across Tasks and Projects (shared timer service); running timer shows as the pill in the app bar (task name + `h:mm:ss` + stop). Stop logs a time entry. Completing a task with a running timer stops and logs it.
- Sidebar (v7: **15.5 px, 42 px rows**): Today (count) · Upcoming · Inbox (count) · Teammates. Then **Personal** (lock) lists, **Team · <Org>** lists, each list row: coloured icon tile, name, open count; right-click list menu (Rename, Icon and colour, Duplicate, Share/Access, Turn into a project, Archive). "+ New list or folder". App bar: running timer pill (when on) + "Add task".
- - Right-click task: Complete (Ctrl Enter), Start timer, Add sub-task, Assign people…, Due date…, Priority…, Make private, Move to block…, Move to list…, **Send to a project** (moves into Projects, leaves a link), Duplicate, Copy link, Delete (Undo toast).
- - Keyboard: Enter new task below, Tab/Shift Tab indent/outdent, Ctrl Enter complete, Alt ↑/↓ move, Esc leave editing.

## Interaction rules that apply everywhere

- All navigation is a real link (Ctrl/middle-click open new tabs) — 02 §3.
- Right-click menus use the shared `.ctx` component: Escape closes, arrows move, long-press opens on touch.
- Every visible control works or is clearly marked "Later". The prototype's toasts and fake data are not product behaviour.
