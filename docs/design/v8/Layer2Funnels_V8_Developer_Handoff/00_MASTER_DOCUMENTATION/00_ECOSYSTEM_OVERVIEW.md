# 00 · Ecosystem overview (V8 "Ledger")

## 1. What the ecosystem is
Two organizations, **Layer2Funnels** (done-for-you funnel agency; brand yellow `#FFC633`) and **Aurj** (Urdu/Hindi-first education; brand `#B0305A`). One sign-in, one person record, separate data per organization (workspace isolation via `workspace_id` + RLS, already in the repo). The user moves between apps through a **left ecosystem rail** that is the same in every app; each app has its **own** sidebar and layout. The **Launcher** is the start page. Global **search**, **notifications** and the **profile page** are shared.

## 2. Applications

| App | Docs | Job | Status vs repo | Pages documented | Prompt |
|---|---|---|---|---|---|
| Global shell, Launcher and Profile | `01_APPLICATIONS/00_SHELL_AND_LAUNCHER/` | Start page and shared shell: rail, Launcher, global search, notifications, profile, branding, shared states. | [N] rail, search, notifications, profile, branding; [R] Launcher small changes | 9 | P00 |
| Office | `01_APPLICATIONS/01_OFFICE/` | Organization home: my day, funnel assets (avatars, offers, stories, brand kits, strategies), documents, team, admin and permissions. | [R] + many [N] pages | 39 | P01 |
| Clients | `01_APPLICATIONS/02_CLIENTS/` | CRM and delivery: All clients (Table, Grid, Pipeline), client workspace with stages, requests and approvals, SOPs, settings. Source of truth for client identity. | [R] + [N] Strategy workspace, Copy, sections, request detail | 34 | P02 |
| Projects | `01_APPLICATIONS/03_PROJECTS/` | Client, internal and personal projects and their tasks (Projects V2 is the functional baseline). | [R] skin of existing V2 + [N] Files, personal-project permission | 17 | P03 |
| Tasks | `01_APPLICATIONS/04_TASKS/` | Personal and team to-do lists (Taskade-like), separate from structured projects. | [N] whole app, built from scratch | 7 | P04 |
| Drive and editors | `01_APPLICATIONS/05_DRIVE_AND_EDITORS/` | Library + Personal files and the five editors (Docs, Sheets, Slides, Image, PDF). | [R] + [N] category pages, move/copy, ruler, reset-to-original | 13 | P05 |
| Planner | `01_APPLICATIONS/06_PLANNER/` | Plans, objectives, KPIs, reviews, alignment, reports and the strategy model. | [R] design only, functions unchanged + [N] Strategy builder, plan → project | 17 | P06 |
| Funnel Mapper | `01_APPLICATIONS/07_FUNNEL_MAPPER/` | Visual funnel maps and funnel maths (separate repo, approved dark identity). | [R] rename + sizing + [N] shared clients | 10 | P07 |
| Client Portal | `01_APPLICATIONS/08_CLIENT_PORTAL/` | What clients see: home journey, requests, approvals, own notes. Locked until security gate G2. | [R] remove Messages/Files tabs | 5 | P08 |
| Whiteboard | `01_APPLICATIONS/09_WHITEBOARD/` | Excalidraw (MIT) boards in folders, full-page canvas. | [R] full-page canvas + [N] folders | 5 | P09 |
| Forms | `01_APPLICATIONS/10_FORMS/` | Forms, quizzes and intake (Brand Base form feeds Clients). | [E] small additions (Responses summary, Automations "Later") | 4 | P10 |
| Value Ladder | `01_APPLICATIONS/11_VALUE_LADDER/` | Ladders of offers from free to premium with a revenue model strip. | [E] small additions (revenue model strip) | 3 | P11 |
| Social Planner | `01_APPLICATIONS/12_SOCIAL_PLANNER/` | Plan, write and approve posts; publishing stays in GoHighLevel. | [E] small additions (Pipeline, Campaigns) | 7 | P12 |
| Layer 2 Agents | `01_APPLICATIONS/13_LAYER_2_AGENTS/` | Meeting Intelligence and Ask (design only, preview state). | [F] design only; build shell pages in Preview state | 9 | P13 |

Launcher groups: **Everyday** — Office, Projects, Tasks, Clients, Drive, Planner, Client Portal · **Studio** — Funnel Mapper, Forms, Value Ladder, Social Planner, Whiteboard, Layer 2 Agents.

Prototype inventory (automated crawl of `ecosystem-v8.html`): **449 reachable routes**, grouped into **177 page templates**, documented as **179 pages** (every route in the v7 list of 122 plus one representative per extra template), each with desktop, tablet and phone screenshots.

## 3. How the apps relate (summary — diagrams in `05_STRATEGY_AND_ARCHITECTURE/`)
- **Clients** is the source of truth for client identity; **Funnel Mapper** and **Projects** read/create clients through the Client service (03 §3).
- **Office Home › My day** shows one list from Projects, Tasks and Planner; ticking completes the item in its source app.
- **Planner** sends "create a project from this plan" to **Projects** (Projects builds it).
- **Tasks** and **Projects** share one running timer; Tasks can "Send to a project".
- **Drive** holds the files; Office Documents, Projects Files and Clients Documents reference them (no copies).
- **Forms** answers (Brand Base form) appear in **Clients › Work › Brand Base**.
- **Client Portal** shows a client their requests and approvals created in **Clients** (locked until gate G2).
- **Layer 2 Agents** (future) write meeting notes to Drive and action items to the Tasks Inbox.
- **Notifications** and **search** collect from every app, filtered by what the user may open.

## 4. What V8 changed
V8 is a **visual and UX redesign of v7. No app, page, menu, tab, button, route, workflow or permission was added, removed, merged or renamed** (verified: `09_FINAL_HANDOFF/V8_COMPLETENESS_AUDIT.md` §1). The only text change is the locked rename "Funnel Mapper Pro" → "Funnel Mapper". Visual decisions: `V8_DESIGN_DECISIONS.md`; defects fixed: `V8_BUG_FIXES.md`; not-approved ideas: `V8_RECOMMENDATIONS.md`.

## 5. Change register (functional; what the repo does NOT have yet — carried from v7)

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


### V8 visual layer (all apps)
- [R] Apply the V8 "Ledger" design system (`01_DESIGN_SYSTEM.md`, `02_DESIGN_SYSTEM/`): tokens, Geist-only type, ruled panels, flat buttons and marks, word + dot status, right-panel size system, 12 px text floor.
- [R] Scope component classes per app (prevents the v7 leak bugs).

## 6. Build order
See `09_FINAL_HANDOFF/IMPLEMENTATION_SEQUENCE.md`. Short version: P00 Foundation → P01 Office → P02 Clients → P03 Projects → P04 Tasks → P05 Drive → P06 Planner → P07 Funnel Mapper → P08 Client Portal → P09 Whiteboard → P10 Forms → P11 Value Ladder → P12 Social Planner → P13 Layer 2 Agents → P14 full regression.
