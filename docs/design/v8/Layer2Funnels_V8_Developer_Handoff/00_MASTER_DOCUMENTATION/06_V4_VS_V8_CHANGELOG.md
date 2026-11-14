# 06 · V4 vs V8 changelog

Method: both prototypes were crawled automatically (V4 through its in-memory router, V8 through hash routes), routes were grouped into page templates, and the sets were compared. V4: `08_PROTOTYPE_AND_SOURCE/reference-prototypes/ecosystem-v4.html` (approved 23 Oct 2026); V8: `ecosystem-v8.html`.

**Totals:** V4 184 routes / 83 templates in 13 areas · V8 449 routes / 177 templates in 18 areas.

## 1. Version history

v3 concept "Signal" → **v4** full prototype (rejected: uniform layout, global header eating space) → v5 rail shell, per-app identities, universal search, inbox, Tasks app, Avatar studio (Planner/Projects/FM were wrong) → v6 rebuilt Projects, Planner, Funnel Mapper, Clients from the real apps; Office creation pages, permissions, editors, whiteboard → v7 sizing pass, launcher zoom, Clients Table default, Tasks completed-in-place, Drive category pages, Docs ruler, Strategy builder, plan → project, FM rename + shared clients → **V8 "Ledger"** complete visual/UX redesign (no structural change).

## 2. Applications

| Area | V4 templates | V8 templates | Change |
|---|---|---|---|
| Launcher | 1 | 1 | Same size |
| Sign in | 1 | 1 | Same size |
| Shared states | 1 | 1 | Same size |
| Design system page | 1 | 1 | Same size |
| Profile page | 0 | 5 | New app |
| Office | 18 | 39 | Expanded |
| Projects | 12 | 16 | Expanded |
| Clients | 19 | 34 | Expanded |
| Client Portal | 6 | 5 | Reduced |
| Drive | 9 | 13 | Expanded |
| Forms (was Form Builder) | 4 | 4 | Same size |
| Value Ladder | 3 | 3 | Same size |
| Whiteboard | 3 | 5 | Expanded |
| Social Planner | 5 | 7 | Expanded |
| Tasks | 0 | 6 | New app |
| Planner | 0 | 17 | New app |
| Funnel Mapper | 0 | 10 | New app |
| Layer 2 Agents | 0 | 9 | New app |

## 3. V4 pages not present in V8 (every one accounted for)

| V4 template | Change | Explanation | Status |
|---|---|---|---|
| `office/planner` | Removed | Locked decision: Planner is its own app; the Office menu has no Planner. | Confirmed |
| `projects/list` | Replaced | v6 rebuilt Projects from the real Projects V2 app: All projects (`projects/all`) + project tabs. | Confirmed |
| `projects/docs` | Replaced | Project › Docs & links tab and the new Projects › Files page. | Confirmed |
| `portal/files` | Removed | Locked decision: Client Portal has no Files tab (clients have their own Drive). | Confirmed |
| `portal/messages` | Removed | Locked decision: Client Portal has no Messages tab. | Confirmed |
| `drive/drives` | Replaced | "Shared drives" became **Library** (organization-owned space) next to **Personal** (v7 Drive brief). | Confirmed |
| `clients/c/:client/notes` | Renamed route | Now the "Team Notes" tab (`clients/c/:client/Team Notes`). | Confirmed |
| `office/admin/members` | Replaced | Admin › People (`office/admin/people`) + person page. | Confirmed |
| `office/admin/access` | Replaced | Admin › Teammate access + Client access (owner only). | Confirmed |
| `office/admin/effective` | Replaced | "Effective access" became the **Check access** panel on the person page + Access review. | Confirmed |
| `office/admin/history` | Replaced | Admin › Audit log (`office/admin/audit`). | Confirmed |
| `projects/p/:project/boards` | Replaced | Project Board view (`board`); whiteboards appear in Docs & links. | Confirmed |
| `projects/p/:project/activity` | Replaced | Activity is an optional view added through "+ View" (Projects brief). | Confirmed |
| `clients/c/:client/work/brand` | Renamed route | Work stages are now `clients/c/:client/Work/<stage index>` (Brand Base 0, Strategy 1, Copy 2, Build 3, Marketing 4) and Strategy sub-pages `Work/1/avatar|offers|brand|strategy`. | Confirmed |
| `clients/c/:client/work/strategy` | Renamed route | Work stages are now `clients/c/:client/Work/<stage index>` (Brand Base 0, Strategy 1, Copy 2, Build 3, Marketing 4) and Strategy sub-pages `Work/1/avatar|offers|brand|strategy`. | Confirmed |
| `clients/c/:client/work/copy` | Renamed route | Work stages are now `clients/c/:client/Work/<stage index>` (Brand Base 0, Strategy 1, Copy 2, Build 3, Marketing 4) and Strategy sub-pages `Work/1/avatar|offers|brand|strategy`. | Confirmed |
| `clients/c/:client/work/build` | Renamed route | Work stages are now `clients/c/:client/Work/<stage index>` (Brand Base 0, Strategy 1, Copy 2, Build 3, Marketing 4) and Strategy sub-pages `Work/1/avatar|offers|brand|strategy`. | Confirmed |
| `clients/c/:client/work/marketing` | Renamed route | Work stages are now `clients/c/:client/Work/<stage index>` (Brand Base 0, Strategy 1, Copy 2, Build 3, Marketing 4) and Strategy sub-pages `Work/1/avatar|offers|brand|strategy`. | Confirmed |
| `clients/c/:client/work/strategy/avatars` | Renamed route | Work stages are now `clients/c/:client/Work/<stage index>` (Brand Base 0, Strategy 1, Copy 2, Build 3, Marketing 4) and Strategy sub-pages `Work/1/avatar|offers|brand|strategy`. | Confirmed |
| `clients/c/:client/work/strategy/brandkit` | Renamed route | Work stages are now `clients/c/:client/Work/<stage index>` (Brand Base 0, Strategy 1, Copy 2, Build 3, Marketing 4) and Strategy sub-pages `Work/1/avatar|offers|brand|strategy`. | Confirmed |
| `clients/c/:client/work/strategy/doc` | Renamed route | Work stages are now `clients/c/:client/Work/<stage index>` (Brand Base 0, Strategy 1, Copy 2, Build 3, Marketing 4) and Strategy sub-pages `Work/1/avatar|offers|brand|strategy`. | Confirmed |
| `clients/c/:client/work/strategy/avatar` | Renamed route | Work stages are now `clients/c/:client/Work/<stage index>` (Brand Base 0, Strategy 1, Copy 2, Build 3, Marketing 4) and Strategy sub-pages `Work/1/avatar|offers|brand|strategy`. | Confirmed |

Unexplained removals: **0**.

## 4. Pages added after V4 (present in V8, not in V4)

- **Profile page** (5): `profile`, `profile/about`, `profile/account`, `profile/notifications`, `profile/appearance`
- **Office** (26): `office/avatar-new`, `office/avatar/:avatar/deep`, `office/avatar/:avatar/edit`, `office/avatar/:avatar/use`, `office/avatar/:avatar/evidence`, `office/offer-new`, `office/story-new`, `office/brandkits`, `office/brandkit-new`, `office/brandkit/:kit`, `office/strategy-template`, `office/team`, `office/member/:person`, `office/apps`, `office/admin/people`, `office/admin/person/:person`, `office/admin/teammates`, `office/admin/clients`, `office/admin/roles`, `office/admin/review`, `office/admin/storage`, `office/admin/branding`, `office/admin/audit`, `office/strategy/new`, `office/avatar/:avatar/profile`, `office/avatar/:avatar/edit/:chapter`
- **Projects** (8): `projects/workload`, `projects/portfolio`, `projects/files`, `projects/all`, `projects/trash`, `projects/p/:project/report`, `projects/p/:project/collection`, `projects/p/:project/files`
- **Planner** (17): `planner/home`, `planner/mywork`, `planner/plans`, `planner/plan/map`, `planner/plan/timeline`, `planner/plan/reviews`, `planner/plan/settings`, `planner/alignment`, `planner/reports`, `planner/model/map`, `planner/model/kinds`, `planner/model/kpi`, `planner/model/fa`, `planner/model/horizons`, `planner/model/tpl`, `planner/plan/:plan/builder`, `planner/model`
- **Funnel Mapper** (10): `fmp/home`, `fmp/clients`, `fmp/client/:client`, `fmp/funnels`, `fmp/funnel/:funnel`, `fmp/funnel/:funnel/reports`, `fmp/templates`, `fmp/trash`, `fmp/settings`, `fmp/help`
- **Clients** (24): `clients/c/:client/Work/0`, `clients/c/:client/Work/1`, `clients/c/:client/Work/1/avatar`, `clients/c/:client/Work/1/offers`, `clients/c/:client/Work/1/brand`, `clients/c/:client/Work/2`, `clients/c/:client/Work/3`, `clients/r/:request`, `clients/settings/stages`, `clients/pipeline`, `clients/c/:client/Requests & Approvals`, `clients/c/:client/Team Notes`, `clients/c/:client/Work/4`, `clients/c/:client/Work/1/strategy`, `clients/c/:client/Documents/Brand Base`, `clients/c/:client/Documents/Strategy`, `clients/c/:client/Documents/Copy`, `clients/c/:client/Documents/Build`, `clients/c/:client/Documents/Marketing`, `clients/c/:client/Documents/Contracts`, `clients/settings/statuses`, `clients/settings/brandbase`, `clients/settings/sections`, `clients/settings/notify`
- **Drive** (5): `drive/personal`, `drive/edit/pdf/:file`, `drive/recent`, `drive/starred`, `drive/trash`
- **Tasks** (6): `tasks/today`, `tasks/upcoming`, `tasks/inbox`, `tasks/teammates`, `tasks/list/:list`, `tasks/teammates/:person`
- **Client Portal** (1): `portal/approvals`
- **Whiteboard** (2): `whiteboard/folder/:id`, `whiteboard/starred`
- **Social Planner** (2): `social/board`, `social/campaigns`
- **Layer 2 Agents** (9): `agents/home`, `agents/meeting/new`, `agents/ask`, `agents/meetings`, `agents/settings`, `agents/meeting/:meeting`, `agents/meeting/:meeting/notes`, `agents/meeting/:meeting/transcript`, `agents/meeting/:meeting/actions`

## 5. Design changes

- V4 → V5: 68 px global header replaced by the 64 px ecosystem rail; per-app identities; Launcher kept.
- V6 → V7: one size step up on sidebars, names, editors, Funnel Mapper; "Funnel Mapper Pro" renamed.
- V7 → V8: Ledger visual language (see `V8_DESIGN_DECISIONS.md`) and 21 defect fixes (`V8_BUG_FIXES.md`).

## 6. Modified behaviour worth noting (all decided by the owner in v5–v7)

- Clients: no separate Pipeline menu (Pipeline is a view of All clients; Table default); status **Lost** added (asks reason).
- Client Portal: Messages and Files removed.
- Tasks: Table and Mind map views removed; completed tasks hidden in place.
- Drive: type chips open category pages (no "Suggested for you" there).
- Planner: Strategy builder replaces Grid/Builder; plan → project added.
- Funnel Mapper: shared clients with Clients; renamed.
- Office: many brand kits instead of one; New avatar wizard with document import; Admin restructured.
