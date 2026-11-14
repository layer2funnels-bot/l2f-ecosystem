# Whiteboard · pages and navigation

5 pages documented (every page in the v7 route list for this app, plus every page template reached by following links). 5 templates in total. Each entry gives the 11 required fields: name/purpose, access, layout, sections, buttons/actions, inputs/filters, navigation/destinations, data, permissions, states, responsive.

Labels in back-ticks are the exact text or accessible name of the control in the V8 prototype. Controls present on every page (rail, app bar, Prototype button) are documented once in `01_APPLICATIONS/00_SHELL_AND_LAUNCHER/`.

## Sidebar menu

- **All boards** → `whiteboard/home`
- **Starred** → `whiteboard/starred`
- **Templates** → `whiteboard/tpl`
- **Harry Kaye PT 2** → `whiteboard/folder/:id`
- **Funnel Challenge 3** → `whiteboard/folder/:id`
- **Team retros 1** → `whiteboard/folder/:id`

## Page templates and their instances

| Template | Instances reached in the prototype | Documented as |
|---|---|---|
| `whiteboard/home` | 1 | Boards and folders |
| `whiteboard/folder/:id` | 3 | Folder |
| `whiteboard/board/:id` | 2 | Full-page board |
| `whiteboard/starred` | 1 | All boards |
| `whiteboard/tpl` | 1 | All boards |

## Pages

### Boards and folders

- **Route (prototype):** `#/whiteboard/home` — template `whiteboard/home`
- **In the v7 route list:** yes — Boards and folders
- **How the user gets here:** sidebar item **All boards**; breadcrumb Whiteboard; linked from `clients/tools`, `drive/edit/doc/:file`, `drive/edit/image/:file`, `drive/edit/pdf/:file`, `drive/edit/sheet/:file`, `drive/edit/slides/:file`, `fmp/funnel/:funnel`, `fmp/funnel/:funnel/reports` …
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/09_WHITEBOARD/110_whiteboard_home.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/09_WHITEBOARD/110_whiteboard_home.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/09_WHITEBOARD/110_whiteboard_home.jpg)
- **Purpose and spec (from the app brief):**
  > Repo `apps/whiteboard` (Excalidraw, MIT) + `modules/whiteboard.js`. Prototype `misc6.js` routes `#/whiteboard/home`, `folder/:id`, `board/:id`.
- **Sections and headings, in order:** “All boards” · “Folders” · “Start from a template” · “Recent boards”
- **Buttons and actions (1):** `New folder` — action `wbfolder` (opens: New folder)
- **Links (navigation) (16):** `New board` → `whiteboard/board/:id`; `Harry Kaye PT 2 boards` → `whiteboard/folder/:id`; `Funnel Challenge 3 boards` → `whiteboard/folder/:id`; `Team retros 1 boards` → `whiteboard/folder/:id`; `Blank` → `whiteboard/board/:id`; `Funnel flow` → `whiteboard/board/:id`; `Brainstorm` → `whiteboard/board/:id`; `Mind map` → `whiteboard/board/:id`; `Retro` → `whiteboard/board/:id`; `Kanban` → `whiteboard/board/:id`; `Quiz funnel flow TR AR Edited 10 min ago` → `whiteboard/board/:id`; `Q4 content ideas TR AR Edited yesterday` → `whiteboard/board/:id`; `October retro TR AR Edited last week` → `whiteboard/board/:id`; `All boards` → `whiteboard/home`; `Starred` → `whiteboard/starred`; `Templates` → `whiteboard/tpl`
- **Data shown (prototype sample data — not product data):** Whiteboard All boards Every board you can open. Project and client boards also open from their own app. New folder New board Folders Harry Kaye PT 2 boards Funnel Challenge 3 boards Team retros 1 boards Start from a template Blank Funnel flow Brainstorm Mind map Retro Kanban Recent boards Quiz funnel flow TR AR Edited 10 min ago Q4 content ideas TR AR Edited yesterday October retro TR AR Edited last week All boards E…
- **Permissions and visibility:** Anyone with access to Whiteboard in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Folder

- **Route (prototype):** `#/whiteboard/folder/f1` — template `whiteboard/folder/:id` (3 instances in the prototype, e.g. `whiteboard/folder/f1`, `whiteboard/folder/f2`, `whiteboard/folder/f3`)
- **In the v7 route list:** yes — Folder
- **How the user gets here:** sidebar item **All boards**; breadcrumb Whiteboard › Harry Kaye PT; linked from `whiteboard/home`, `whiteboard/starred`, `whiteboard/tpl`
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/09_WHITEBOARD/111_whiteboard_folder_f1.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/09_WHITEBOARD/111_whiteboard_folder_f1.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/09_WHITEBOARD/111_whiteboard_folder_f1.jpg)
- **Purpose and spec (from the app brief):**
  > Repo `apps/whiteboard` (Excalidraw, MIT) + `modules/whiteboard.js`. Prototype `misc6.js` routes `#/whiteboard/home`, `folder/:id`, `board/:id`.
  > - Home: sidebar All boards, Starred, Templates, **Folders** list (+ New folder); page: Folders cards, template strip (Blank, Funnel flow, Brainstorm, Mind map, Retro, Kanban), Recent boards grid (thumbnail, name, editors, edited). Right-click board: Open, Rename, **Move to folder…**, Duplicate, Star, Trash.
  > - **Folders [N]**: create (name + who can open: everyone / only me / choose people), open, multiple boards inside, move boards between folders. `wb_folders(id, workspace_id, name, access)`, `whiteboards.folder_id`.
- **Sections and headings, in order:** “Harry Kaye PT”
- **Buttons and actions (1):** `New folder` — action `wbfolder` (opens: New folder)
- **Links (navigation) (7):** `Whiteboard` → `whiteboard/home`; `New board` → `whiteboard/board/:id`; `Quiz funnel flow TR AR Edited 10 min ago` → `whiteboard/board/:id`; `Kick-off workshop TR AR Edited yesterday` → `whiteboard/board/:id`; `All boards` → `whiteboard/home`; `Starred` → `whiteboard/starred`; `Templates` → `whiteboard/tpl`
- **Data shown (prototype sample data — not product data):** Whiteboard / Harry Kaye PT Harry Kaye PT Boards in this folder. New folder New board Quiz funnel flow TR AR Edited 10 min ago Kick-off workshop TR AR Edited yesterday Harry Kaye PT Boards in this folder. New folder New board Quiz funnel flow TR AR Edited 10 min ago Kick-off workshop TR AR Edited yesterday…
- **Permissions and visibility:** Anyone with access to Whiteboard in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Full-page board

- **Route (prototype):** `#/whiteboard/board/b1` — template `whiteboard/board/:id` (2 instances in the prototype, e.g. `whiteboard/board/b1`, `whiteboard/board/new`)
- **In the v7 route list:** yes — Full-page board
- **How the user gets here:** linked from `projects/p/:project/docs`, `whiteboard/folder/:id`, `whiteboard/home`, `whiteboard/starred`, `whiteboard/tpl`
- **Layout:** Focused layout (no rail/sidebar: full-height tool). Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/09_WHITEBOARD/112_whiteboard_board_b1.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/09_WHITEBOARD/112_whiteboard_board_b1.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/09_WHITEBOARD/112_whiteboard_board_b1.jpg)
- **Purpose and spec (from the app brief):**
  > Repo `apps/whiteboard` (Excalidraw, MIT) + `modules/whiteboard.js`. Prototype `misc6.js` routes `#/whiteboard/home`, `folder/:id`, `board/:id`.
  > - **Board = full page [R]**: the Excalidraw canvas fills the whole viewport (no rail, sidebar or header). Floating panels: top-left (back, apps, board name + folder + Saved), top-centre Excalidraw toolbar (lock, hand, select, rectangle, ellipse, arrow, line, draw, text, image, sticky, eraser with number keys), top-right (presence, comments, library, Share), bottom-left (zoom, undo, redo), bottom-right (present, export, help). Use Excalidraw's own UI where possible (configure `UIOptions`, custom top-left) rather than re-implementing tools.
- **Buttons and actions (23):** `Apps` — action `railmenu`; `Lock` — action `wtool:lock`; `Hand (H)` — action `wtool:hand`; `Select (V)` — action `wtool:cursor`; `Rectangle (R)` — action `wtool:shape`; `Ellipse (O)` — action `wtool:target`; `Arrow (A)` — action `wtool:arrow`; `Line (L)` — action `wtool:gantt`; `Draw (P)` — action `wtool:pen`; `Text (T)` — action `wtool:text`; `Image` — action `wtool:imgI`; `Sticky note (S)` — action `wtool:sticky`; `Eraser (E)` — action `wtool:x`; `Comments` — prototype stand-in (shows a toast: “Comments”); build the real action from the brief; `Library` — prototype stand-in (shows a toast: “Library”); build the real action from the brief; `Share` — prototype stand-in (shows a toast: “Share”); build the real action from the brief; `Zoom out` — action `wz:-1`; `Zoom in` — action `wz:1`; `Undo`; `Redo`; `Present` — prototype stand-in (shows a toast: “Presents each frame in order.”); build the real action from the brief; `Export` — prototype stand-in (shows a toast: “Export PNG, SVG or PDF.”); build the real action from the brief; `Help` — prototype stand-in (shows a toast: “Shortcuts”); build the real action from the brief
- **Links (navigation) (15):** `Back to boards` → `whiteboard/home`; `LauncherG L` → `launcher`; `Office` → `office/home`; `Projects` → `projects/home`; `Clients` → `clients/list`; `Drive` → `drive/home`; `Planner` → `planner/home`; `Client Portal` → `portal/home`; `Forms` → `forms/list`; `Value Ladder` → `ladder/list`; `Social Planner` → `social/calendar`; `Whiteboard` → `whiteboard/home`; `Funnel Mapper` → `fmp/home`; `Tasks` → `tasks/today`; `Layer 2 Agents` → `agents/home`
- **Editable regions (6):** `Instagram reel`; `10-question quiz`; `Personal result page`; `Book a discovery call`; `Follow-up emails × 5`; `Idea: add a “before/after” question`
- **Data shown (prototype sample data — not product data):** Quiz funnel flow Instagram reel Ayesha 10-question quiz Sana Personal result page Tabish Book a discovery call Ayesha Follow-up emails × 5 Sana Decision: price? Idea: add a “before/after” question Ayesha Quiz funnel flow Harry Kaye PT · Saved 1 2 3 4 5 6 7 8 9 TR AR SN Share 90% ?…
- **Permissions and visibility:** Anyone with access to Whiteboard in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### All boards

- **Route (prototype):** `#/whiteboard/starred` — template `whiteboard/starred`
- **Note:** this route renders the same content as `#/whiteboard/home` (alias / default sub-page).
- **In the v7 route list:** no — reached by following links in the prototype
- **How the user gets here:** sidebar item **Starred**; breadcrumb Whiteboard; linked from `whiteboard/folder/:id`, `whiteboard/home`, `whiteboard/tpl`
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/09_WHITEBOARD/166_whiteboard_starred.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/09_WHITEBOARD/166_whiteboard_starred.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/09_WHITEBOARD/166_whiteboard_starred.jpg)
- **Sections and headings, in order:** “All boards” · “Folders” · “Start from a template” · “Recent boards”
- **Buttons and actions (1):** `New folder` — action `wbfolder` (opens: New folder)
- **Links (navigation) (16):** `New board` → `whiteboard/board/:id`; `Harry Kaye PT 2 boards` → `whiteboard/folder/:id`; `Funnel Challenge 3 boards` → `whiteboard/folder/:id`; `Team retros 1 boards` → `whiteboard/folder/:id`; `Blank` → `whiteboard/board/:id`; `Funnel flow` → `whiteboard/board/:id`; `Brainstorm` → `whiteboard/board/:id`; `Mind map` → `whiteboard/board/:id`; `Retro` → `whiteboard/board/:id`; `Kanban` → `whiteboard/board/:id`; `Quiz funnel flow TR AR Edited 10 min ago` → `whiteboard/board/:id`; `Q4 content ideas TR AR Edited yesterday` → `whiteboard/board/:id`; `October retro TR AR Edited last week` → `whiteboard/board/:id`; `All boards` → `whiteboard/home`; `Starred` → `whiteboard/starred`; `Templates` → `whiteboard/tpl`
- **Data shown (prototype sample data — not product data):** Whiteboard All boards Every board you can open. Project and client boards also open from their own app. New folder New board Folders Harry Kaye PT 2 boards Funnel Challenge 3 boards Team retros 1 boards Start from a template Blank Funnel flow Brainstorm Mind map Retro Kanban Recent boards Quiz funnel flow TR AR Edited 10 min ago Q4 content ideas TR AR Edited yesterday October retro TR AR Edited last week All boards E…
- **Permissions and visibility:** Anyone with access to Whiteboard in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### All boards

- **Route (prototype):** `#/whiteboard/tpl` — template `whiteboard/tpl`
- **Note:** this route renders the same content as `#/whiteboard/home` (alias / default sub-page).
- **In the v7 route list:** no — reached by following links in the prototype
- **How the user gets here:** sidebar item **Templates**; breadcrumb Whiteboard; linked from `whiteboard/folder/:id`, `whiteboard/home`, `whiteboard/starred`
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/09_WHITEBOARD/167_whiteboard_tpl.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/09_WHITEBOARD/167_whiteboard_tpl.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/09_WHITEBOARD/167_whiteboard_tpl.jpg)
- **Sections and headings, in order:** “All boards” · “Folders” · “Start from a template” · “Recent boards”
- **Buttons and actions (1):** `New folder` — action `wbfolder` (opens: New folder)
- **Links (navigation) (16):** `New board` → `whiteboard/board/:id`; `Harry Kaye PT 2 boards` → `whiteboard/folder/:id`; `Funnel Challenge 3 boards` → `whiteboard/folder/:id`; `Team retros 1 boards` → `whiteboard/folder/:id`; `Blank` → `whiteboard/board/:id`; `Funnel flow` → `whiteboard/board/:id`; `Brainstorm` → `whiteboard/board/:id`; `Mind map` → `whiteboard/board/:id`; `Retro` → `whiteboard/board/:id`; `Kanban` → `whiteboard/board/:id`; `Quiz funnel flow TR AR Edited 10 min ago` → `whiteboard/board/:id`; `Q4 content ideas TR AR Edited yesterday` → `whiteboard/board/:id`; `October retro TR AR Edited last week` → `whiteboard/board/:id`; `All boards` → `whiteboard/home`; `Starred` → `whiteboard/starred`; `Templates` → `whiteboard/tpl`
- **Data shown (prototype sample data — not product data):** Whiteboard All boards Every board you can open. Project and client boards also open from their own app. New folder New board Folders Harry Kaye PT 2 boards Funnel Challenge 3 boards Team retros 1 boards Start from a template Blank Funnel flow Brainstorm Mind map Retro Kanban Recent boards Quiz funnel flow TR AR Edited 10 min ago Q4 content ideas TR AR Edited yesterday October retro TR AR Edited last week All boards E…
- **Permissions and visibility:** Anyone with access to Whiteboard in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.
