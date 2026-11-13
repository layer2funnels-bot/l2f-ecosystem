# 00 · Ecosystem overview, change register, build order

## 1. The ecosystem in one picture

Two organizations, **Layer2Funnels** (agency, brand blue logo) and **Aurj** (education, round blue-gold badge). One sign-in, one person record, separate data per organization (workspace isolation, already enforced in the repo by `workspace_id` + RLS). The user moves between apps through a **left ecosystem rail** that is the same in every app; each app then has its **own** sidebar and layout.

| App | Job | Status vs repo | Identity (how it looks different) |
|---|---|---|---|
| Launcher | Start page: time + weather sky, app tiles | [R] small changes | Dark animated sky, 3D app plates |
| Office | Organization home: my day, funnels assets, documents, team, admin | [R] + many [N] pages | Warm paper, editorial headings |
| Projects | Client / internal / personal projects and tasks (Projects V2) | [R] skin of existing V2 + [N] Files, personal-project permission | Calm, dense, light sidebar, tables |
| Tasks | Personal and team to-do lists (Taskade-like) | **[N] whole app** | Document-style card on a soft gradient |
| Clients | CRM and delivery: list/grid/pipeline, client workspace, requests | [R] + [N] Strategy workspace, Copy, sections | Coral accent, stage bar |
| Client Portal | What clients see (locked until security gate G2) | [R] remove Messages/Files tabs | Teal, journey road |
| Drive | Library + Personal files, five editors | [R] + [N] category pages, move/copy, ruler, reset-to-original | Clean white, file-type colours |
| Planner | Plans, objectives, KPIs, reviews, strategy model | [R] **design only**, functions unchanged + [N] Strategy builder page, plan → project | Green accent, map canvas |
| Funnel Mapper (was "Funnel Mapper Pro") | Visual funnel maps + funnel maths | [R] rename + sizing + shared clients | Its own dark navy + emerald |
| Forms, Value Ladder, Social Planner | As built | [E] small additions | Own accents |
| Whiteboard | Excalidraw (MIT) boards | [R] full-page canvas + [N] folders | Floating tools on full canvas |
| Layer 2 Agents | Meeting Intelligence, Ask | [F] design only | Violet |

## 2. Change register (what the repo does NOT have yet)

Read the app brief for detail. This list exists so nothing is forgotten.

### Global / shell
- [N] Left **ecosystem rail** (64 px) replacing the 68 px global header: org logo button (switcher), apps grid, pinned apps, search, notifications, profile. App sidebars move right of it. Editors and canvases hide app sidebars (focused layout).
- [N] **Global search** (Ctrl K) across apps with scope chips (Everything, Projects & tasks, Tasks, Clients, Docs & files, Office, Planner, Funnels), `in:` and `@me`/`overdue`/`is:archived` filters, keyboard navigation, "How search works" help. Per-app search boxes only filter the current page.
- [N] **Notifications inbox** for all apps: filters by kind (Mentions, Assigned, Approvals, Updates) and by app, mark all read, settings.
- [N] **Global profile page** `#/profile` (not inside Office): profile, account and sign-in, notification settings, appearance.
- [N] **Organization branding** (Office › Admin › Branding): replace icon, wordmark, favicon per organization; previews on light and dark.
- [N] Real logos everywhere (rail, launcher, switcher) inside a fitted tile; never stretched.
- [R] "Open organization in a new tab" button **removed**. All navigation uses real links so Ctrl-click, middle-click and right-click → "Open in new tab" work.
- [N] Right-click (context) menus on tasks, projects, sections, view tabs, files, list items, clients, strategy boxes.
- [R] v7 sizing: sidebars, item names, editor chrome and Funnel Mapper one step larger than v6 (see design system).

### Office
- [N] Customer Avatar: new list cards, **New avatar wizard** (import Word/PDF → read → map sections → choose one of 10 3D looks → name), **edit mode** for every chapter, add sections, Use it and Evidence explained.
- [N] Offers & Products: full **New offer** page. [N] Stories: **New story** page.
- [N] **Brand Kits** (many, not one): list, new, detail.
- [N] **Default strategy template** editor (applies to new strategy documents only).
- [N] Documents: **custom sections** with upload/new document per section.
- [N] Admin: People (teammates + clients), **Teammate access** (app on/off + level + feature switches), **Client access** matrix (owner only), Roles, **Access review** (explained), **Storage & version rules** per file type, **Branding**, Audit log; "As owner / As admin" difference.
- [N] Home "My day" across Projects, Tasks, Planner; "Waiting on you"; org pulse (built in v5, keep).

### Projects (Projects V2 is the functional baseline)
- [R] Ecosystem skin of all existing pages and the task panel (fields, sections, timer, activity tabs as today).
- [R] Sidebar: segmented All · Client · Internal · Personal, groups Favourites / Clients (folder per client) / Organization / Personal ("Only you can see these").
- [N] **Files** page: all files of projects and tasks in one place (references, not copies).
- [N] **Personal projects** creation in the New project modal + Admin feature "Create personal projects".
- [R] Top bar keeps the original quick actions: search projects and tasks (Ctrl K), running timer pill, New task, New project, Start timer, My Work, Keyboard shortcuts.

### Tasks (whole app new)
Today, Upcoming, Inbox, Teammates (with "Tasks I gave"), Personal and Team lists and folders, **blocks** inside lists, **completed tasks hidden in place** with a Show/Hide completed (n) control, **timer per task**, **multiple assignees**, **list/folder access** with multi-select, right-click menu, List/Board/Calendar views (no Table, no Mind map).

### Clients
- [R] **All clients** with Table (default), Grid, Pipeline views. No separate Pipeline menu.
- [R] Statuses Lead, Proposal, Active, Paused, Past, **Lost** (asks for a reason).
- [N] Work › Brand Base shows the **submitted form answers**.
- [N] Work › Strategy **workspace**: client Customer Avatar (upload Word/PDF or create), Offers, Brand Kits, Funnel Strategy, custom sections. Separate client records, not links to Office files.
- [N] Work › **Copy** (sales copy library by asset with versions + approval), Build = progress only (built in GHL/ClickFunnels), Marketing = sections.
- [N] Custom **client sections** (tabs) per client and as defaults (Settings).
- [R] Requests & Approvals with a **request detail page** (conversation, actions, history). [N] SOP creation with auto-coloured document icons.

### Drive
- [N] Type chips (Docs, Sheets, Slides, PDFs, Images, Forms) open a **category page** (templates + only that type), not Home.
- [N] **Move/Copy between Library and Personal** (menu, dialog, drag to sidebar), with ownership consequences.
- [R] **Editors redesigned** on one frame (52 px top bar, 46 px menu + toolbar row, side panel, status bar); Docs gets a **ruler** and vertical ruler; voice typing bar; image/PDF **Reset to original**.

### Planner (functions unchanged)
- [R] Visual design of every page; sizes one step up.
- [N] **Strategy builder** replaces the old map drawing (Builder only, **no Grid**), on a focused page: strategy switcher, Create a plan from it, **Create a project from it**, inspector, keyboard.
- [N] **Create a project from this plan** (plan page action + menu). Projects builds the project.
- [R] Alignment keeps the original behaviour (Plans / Objectives tree, expand/collapse, zoom).
- [R] Objective drawer with original tabs: Overview, Updates, KPIs, Tasks, Risks, Comments, History.

### Funnel Mapper
- [R] Rename to **Funnel Mapper** in all user-facing text. Keep internal ids.
- [R] Sizes one step up. All pages kept as the real app.
- [N] **Shared clients** with the Clients app (one record, created in either place, duplicates detected by email).

### Client Portal / Whiteboard / others
- [R] Portal: tabs Home, Requests, Approvals, My notes (Messages and Files removed).
- [N] Whiteboard folders; [R] full-page canvas with floating tools.

## 3. Build order (one app at a time)

| # | Prompt | Why this order |
|---|---|---|
| P00 | Foundation: tokens, rail shell, launcher, search, notifications, profile, branding, context menus | Every app depends on it |
| P01 | Office (incl. Admin permissions UI + server rules) | Permissions and branding live here |
| P02 | Clients (incl. shared client record service) | Funnel Mapper and Projects depend on client identity |
| P03 | Projects | Skin of V2 + Files + personal projects |
| P04 | Tasks (new app) | Needs Projects/Planner links for My day |
| P05 | Drive + editors | Files are referenced by Projects/Clients |
| P06 | Planner | Design-only + strategy builder + plan → project (needs Projects API) |
| P07 | Funnel Mapper | Rename, sizing, shared clients (needs P02) |
| P08 | Client Portal, Whiteboard, Forms, Value Ladder, Social, Agents shell | Smaller changes |
| P09 | Ecosystem regression pass | Cross-app checks |

## 4. Where to look in the prototype
Open `ecosystem-v7.html#/map`. Each route there is the reference for the page with the same name in the briefs. `assets/routes.json` lists all 122 routes with their labels; `screens/desktop/NNN_route.jpg` is the screenshot.
