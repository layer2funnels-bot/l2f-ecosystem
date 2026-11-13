# Projects V2: design brief for Claude Design

You are redesigning the full user interface of **Projects V2**, the project management app of the Layer2Funnels + Aurj ecosystem (inspired by ClickUp, Asana and Zoho Projects). The application is fully built and working. **Your job is the visual and interaction design, not the features.** Every screen, state and control listed here exists and must stay. The redesign will then be implemented over the existing code by Claude Code, and later applied consistently across the whole ecosystem.

## 1. Goals

- Premium, calm and fast. It should feel built by a senior product team, not like a generic SaaS template. References: Linear (polish), Asana (calm task panel), ClickUp (power and density), Zoho Projects (portfolio tables).
- Dense but readable work surfaces (lists, boards, tables), and spacious summary surfaces (Home, Overview).
- One coherent system shared by every screen, in **light and dark** themes, at **390 px (phone), 768 px (tablet) and 1366 px+ (desktop)**.
- Accessible: WCAG AA contrast, visible focus, keyboard first, reduced-motion support, and status never shown by colour alone.

## 2. Hard constraints (do not break)

1. **Keep every feature, control, state and shortcut in sections 5–8.** You may move, regroup and restyle them, but don't remove them. If you think something should go, list it as a recommendation instead.
2. **Design tokens are CSS variables** in `web/styles/tokens.css` (prefix `--pm-`: colours, type scale, spacing, radii, control heights, shadows, motion, and status/priority/project-status colours `--pm-st-*`, `--pm-pr-*`, `--pm-ps-*`). Deliver your design as **new token values plus component specs**, so it can be applied by editing tokens and the component CSS (`web/styles/*.css`), with classes prefixed `pm-`.
3. **No new paid fonts or services.** Fonts must be free and self-hosted (for example Inter, Geist or IBM Plex Sans). Today the app uses the system font stack.
4. **Icons:** a custom inline SVG set at 16 px with 1.5 stroke (`web/ui/icons.tsx`). You may restyle or replace the set, but keep one consistent family.
5. **Ecosystem fit:** it will live inside the ecosystem shell (organization switcher, app switcher). Leave room in the top bar for the ecosystem's app switcher and organization switcher.
6. **Charts are custom SVG** (no chart library): donut, bar, line/area, progress ring, KPI tile with sparkline, and tooltips.

## 3. Information architecture

- **Sidebar** (240 px; off-canvas drawer below 768 px), top to bottom:
  - Organization switcher (name and role).
  - Primary nav: Home, My Work, Workload, Portfolio.
  - Projects area with "Filter projects" and these collapsible groups:
    - **Favorites**
    - **Clients**: one collapsible folder per client
    - **<Organization name>**: internal projects
    - **Personal**: lock icon, "Only you can see these"
  - Footer: Trash, theme toggle, person with sign-out.
  - Project rows: colour dot, name, open count, red overdue badge, hover star / ⋯ / +.
- **Top bar:** breadcrumb, search box (Ctrl/⌘+K command palette), quick-action icons (New task/Create, New project, Timer start/stop, My Work, Notifications bell with unread badge, Keyboard shortcuts), and a running-timer pill. Below 768 px the quick actions collapse into one "+" menu.
- **Project page:**
  - **Header:** colour bar, name (inline rename), favourite star, status pill menu, type badge (client name / Internal / Personal · private), due date, visibility (members-only or whole organization), member avatar stack with "Manage", and a ⋯ menu.
  - **View tabs:** Overview · List · Board · Calendar · Timeline · Report · Docs & links. The default view is marked "DEFAULT".
  - **Optional tabs** added with **"+ View"** (gallery popover): Gallery, Activity, Docs, Collection.
  - Every tab can be **renamed** and has a right-click menu.

## 4. Project types

Client (belongs to a client), Internal (organization's own work), Personal (private to its owner; nobody else sees it, not even admins). They need distinct, quiet visual markers. Today these are: building icon, client name, and a lock for personal. The **lock means only "private to you"**. "Members only" uses a people icon.

## 5. Screen inventory (every screen needs light/dark × phone/tablet/desktop)

| Screen | Content |
|---|---|
| Sign-in (development only) | Demo people cards. This screen will be replaced by ecosystem sign-in; keep it simple. |
| Home | Greeting and date; KPI tiles (My open tasks, Overdue, Due this week, Completed today, Active projects, At risk / off track; each clickable); "My open tasks" card; "Recent projects" cards. |
| Projects | Tabs Active / Templates / Archived; search; type chips All/Client/Internal/Personal with counts; status chips; grouped table (Client projects by client, <Org> projects, Personal). Row: colour, name, client/type, status pill, owner, due (red when late), progress bar %, open/overdue counts. "New project" button. |
| New / Edit project modal | Segmented Client · Internal · Personal; name; client; colour swatches; start/due dates; visibility; "Start from template"; validation; unsaved-changes guard. Also opens as the "Project" tab of the Create window. |
| Project › Overview | Analytics filter bar (date presets 7d/30d/90d/This project/Custom, assignee filter, include subtasks); KPI row with sparklines (Open, Done, Overdue, Completion %, Estimated hours left, Time logged); charts (Tasks by status donut, Completed vs created over time, Remaining vs ideal, Tasks by priority, Workload by person stacked bars, Overdue list), each card with a ⋯ menu (Download PNG, Copy CSV); description; members; upcoming deadlines; recent activity. |
| Project › List | Toolbar: search, filters (Assignee, Tag, Status, Priority, Due, custom-field filters), Group by (Section/Status/Assignee/Priority/custom select/None), Sort, Hide done, Columns menu, Fields manager. Collapsible groups with counts and "Add task…" rows; "+ Add section". Row (≈36 px): drag handle, checkbox, completion circle, title (inline rename), subtask expander, indicators (subtasks, checklist, files, links, comments, "Waiting on N", repeat), tags, **multiple assignee avatars** (max 3, "+N"), due date (red/amber), priority flag, status pill, optional custom-field columns. Sticky bottom bulk bar when rows are selected. Phone layout: title wraps to 2 lines, plus due and status only. |
| Project › Board | Columns by Status or by Section (with "+ Add section" column, rename/move/delete); cards show title, tags, subtask/checklist progress, due, priority, assignee avatars, waiting badge, up to 2 custom-field chips; drag between columns; inline add card; Done column muted. |
| Project › Calendar | Month/week grid (Monday first), today highlight, weekend shading, task chips with status border, "+N more" popover, quick add on a day, "Unscheduled" tray to drag from. Phone: agenda list. |
| Project › Timeline | Left task list grouped by section; right day grid with month/week headers; zoom Week/Month/Quarter; red Today line and Today button; bars from start to due (drag to move, drag ends to resize), milestone diamond for one-day tasks. |
| Project › Report | Tiles, charts (shared chart kit) and a people table (open, overdue, done, estimate left, billable/other time). |
| Project › Docs & links | Grouped Docs / Whiteboards / Spreadsheets / Links; add link form; remove. |
| Optional › Docs | Ecosystem documents, whiteboards and spreadsheets for the project. Create buttons appear only inside the ecosystem. |
| Optional › Collection (ClickUp style) | Type tabs (All, Collections, Images, Videos, Documents, PDFs, Spreadsheets, Presentations, Audio, Archives, Code, Links, Embeds) with result count; toolbar (search, sort, new folder, add link/embed, upload); table (checkbox, name with type icon, type, date updated, ⋯) or grid; nested folders with breadcrumb; storage meter "X MB of 10 GB"; drag-and-drop upload with progress. Preview modal for images/video/PDF. Embed viewer for YouTube/Vimeo/Loom/Google Docs-Sheets-Slides-Calendar/Figma/website, always with a provider note and "Open in new tab". **Items must be visibly labelled as Uploaded file, External link or Embed.** |
| Optional › Gallery | Image/video grid with source label; filter; lightbox with ←/→. |
| Optional › Activity | Feed grouped by day, filters (type, person, dates), load more. |
| My Work | Groups Overdue · Today · This week · Later · No date (and "Completed today" toggle); List / Board toggle (board columns change due dates by dragging, with a "Move to…" alternative). |
| Workload | Person × week heatmap against a 40 h capacity (Overdue, No date, weeks); "Over" state; legend; project filter; 4/6/8/12 weeks. |
| Portfolio | Summary tiles; sortable table of every project (progress, open, overdue, next due, "N days late"); cards on phone. |
| Search | Projects and tasks results with highlighted matches. |
| Trash | Trashed projects/tasks with Restore and Delete forever (typed confirmation). |
| Not found / no access, error boundary | Friendly states. |

## 6. Task panel (drawer), the most important surface

- **Modes:** right-side panel (≈720 px), **full-width mode** (covers the whole screen, content centred about 960 px wide), full screen on phones. It always opens at the top.
- **Header (sticky):** Mark complete toggle; breadcrumb Project › Section › #number; Follow; previous/next task; copy link; ⋯ menu (Duplicate, Create follow-up task, Convert to subtask / Make top-level, Full width, Move to trash); close.
- **Body:**
  - Title.
  - Field rows (label left, value right): Status, Priority, **Assignees (multiple chips + add)**, Start, Due, Estimate, Repeat, Section, Tags, and **custom fields** (text, number, currency, dropdown, multi-select, date, checkbox, URL).
  - **"Collapse empty fields" / "Show N empty fields"** toggle.
  - Description, Subtasks, Checklist, Waiting on / Blocking, Links, Attachments (drop zone + progress), Time (timer, log time, entries).
  - Activity with tabs Comments / All activity / Status history (time spent in each status).
- **Footer (pinned):** comment composer with @mention picker; Ctrl+Enter to send.
- **Viewer role:** read-only fields, but can comment, follow and log their own time.

## 7. Shared components to (re)design

Buttons (primary/secondary/ghost/danger, sm/md, icon-only with tooltip), split button, inputs, textarea, select/menu with search, **right-click context menu** (submenus, checkbox items, shortcuts on the right, danger items, disabled with reason), date picker, **people picker** (multi-select: search, checkbox list, selected chips, sheet on phone), avatar and avatar stack, chips/tags, status pill + menu, priority flag + menu, progress bar/ring, tabs with inline rename and "DEFAULT" mark, modal, drawer, confirm dialog (typed confirmation variant), toast (success/error/undo action), tooltip, skeletons, empty and error states, Kbd, checkbox, toggle, command palette, notifications panel, shortcuts help modal, bulk action bar, chart cards and tooltips, KPI tiles, heatmap cell, file/embed cards, lightbox, and the field-type editors.

## 8. Interaction details that must stay

- **Keyboard:**
  - **Global:** `?` help · Ctrl/⌘+K palette · `Q`/`T` quick add · `Shift+P` new project · `G` then H/M/W/P/R/T to jump between pages · `/` filter · `[` sidebar · `Shift+D` theme.
  - **Project views:** `1`–`7`.
  - **List:** `j`/`k`, `x`, Enter, Shift+Enter, Ctrl+Enter.
  - **Task panel:** Shift+S/A/D/P/T/C/L, Ctrl+Enter, J/K. Show shortcuts in tooltips and menus.
- **Right-click works everywhere:** tasks, sections, board columns, view tabs, projects, sidebar groups, links, comments and Collection items. Long-press opens it on touch screens.
- **Every drag has a non-drag alternative** (menus such as "Move to…"). Touch targets are at least 36 px.
- **Optimistic updates** with undo toasts; inline editing on click; every overlay closes with Escape and returns focus.
- **States:** loading (skeleton), empty (helpful action), no results (clear filters), error (retry), permission denied/view-only, archived and trashed banners, conflict banner ("changed elsewhere — Reload").

## 9. Deliverables expected from Claude Design

1. **Design direction** (one page): personality, type, colour, density and motion, with reasons.
2. **Token sheet:** complete new values for every `--pm-*` token in light and dark (colours with contrast ratios, the type scale, the spacing scale, radii, shadows, motion), including status, priority and project-status palettes and chart series colours.
3. **Component specs:** each component in section 7 with sizes, paddings, states (default/hover/focus/active/disabled/loading/error) and light/dark variants.
4. **Screen designs** for every screen in sections 5–6 at desktop, plus phone versions of Home, List, Board, Calendar, Task panel, Collection, Overview charts, My Work and the sidebar drawer; tablet where layout changes.
5. **Interaction notes:** menus, drag states, tooltips, transitions, empty/loading/error examples.
6. **Implementation mapping:** for each change, which token or `web/styles/*.css` area it affects, so Claude Code can apply it without guessing.
7. A short list of recommendations (things you'd change in behaviour or layout), kept separate from the core redesign for the owner to approve.

## 10. How to see the current app

Run `Start Projects V2.bat` in the project folder (or `npm run dev`), open http://localhost:5173, and pick a demo person:
- **Bilal Ahmed:** admin, with the most data.
- **Omar Farooq:** viewer.
- **Zain Raza:** member of two organizations.

The app has realistic sample data, including a personal project, custom fields "Budget" and "Channel", and multiple assignees.
