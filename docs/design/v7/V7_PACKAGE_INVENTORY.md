# V7 package inventory

Source: `L2F_Design_v7_ClaudeCode_Package.zip` (received 13 Nov 2026, 8.2 MB, 214 entries = 203 files + 11 folders). Installed at `docs/design/v7/` with the original folder structure; nothing renamed, removed or added inside the package (this file and `CLAUDE_CODE_NEXT_CHAT_HANDOFF.md` are the only additions, at the top level).

**Extraction verified:** every one of the 203 files is byte-identical to the archive (SHA-256 compared file by file). No hidden files were in the archive. Nothing is missing, corrupted or unreadable. Every document, prompt and brief was read in full; the `.docx` was read through its XML text; screenshots were checked against `assets/routes.json` (122 of 122 match by number and name).

## 1. Structure

```
docs/design/v7/
├── README_START_HERE.md, NEW_CHAT_HANDOFF.md, ecosystem-v7.html (829 KB prototype)
├── docs/        00–04 core documents
│   └── apps/    8 app briefs (10_OFFICE … 17_PORTAL_…)
├── prompts/     P00_FOUNDATION … P09_REGRESSION (10 paste-ready prompts)
├── assets/      tokens.json, tokens.css, icons.svg, icons.json, routes.json, logos/ (4 PNG)
├── screens/     desktop/ (122 JPG at 1440 px, one per route), phone/ (10 JPG at 390 px)
├── prototype-source/  32 files (vanilla JS + CSS, v4 → v5 → v6 → v7; later files override earlier) + build7.py
└── reference/   manager .docx, Planner spec, Editors brief, Projects V2 brief
```

## 2. Documents, prompts, assets

| File | Size | What it is |
|---|---|---|
| `README_START_HERE.md` | 4 KB | Package overview, how to use it, ground rules ([E]/[R]/[N]/[F] legend). |
| `NEW_CHAT_HANDOFF.md` | 5 KB | Handoff for the next DESIGN chat (history, locked decisions, owner preferences, open design work). |
| `ecosystem-v7.html` | 829 KB | The complete interactive prototype (open in Chrome, start at #/map; 122 routes). Fake data only. |
| `docs/00_ECOSYSTEM_OVERVIEW.md` | 9 KB | App map, change register (what the repo does not have yet), build order P00–P09. |
| `docs/01_DESIGN_SYSTEM.md` | 7 KB | Tokens, fonts, type scale, sizes, colour, app identities, components, motion, icons, logos. |
| `docs/02_GLOBAL_SHELL.md` | 8 KB | Left rail, Launcher, global search, notifications, profile page, branding, links/right-click, shared states. |
| `docs/03_PERMISSIONS_DATA_INTEGRATIONS.md` | 7 KB | Identity and relationships, access model (default deny), shared client record (Clients ↔ Funnel Mapper), files as references, versions/storage, cross-app links. |
| `docs/04_OPEN_DECISIONS.md` | 1 KB | D1–D10: business decisions still open, with the assumption the design uses. |
| `docs/apps/10_OFFICE.md` | 9 KB | Office brief. |
| `docs/apps/11_PROJECTS.md` | 7 KB | Projects brief (skin of Projects V2 + Files + personal projects). |
| `docs/apps/12_TASKS.md` | 7 KB | Tasks brief: NEW app built from scratch (most detailed brief). |
| `docs/apps/13_CLIENTS.md` | 5 KB | Clients brief incl. the shared client record. |
| `docs/apps/14_DRIVE_AND_EDITORS.md` | 7 KB | Drive and the five editors brief. |
| `docs/apps/15_PLANNER.md` | 7 KB | Planner brief: design only + Strategy builder + plan → project. |
| `docs/apps/16_FUNNEL_MAPPER.md` | 3 KB | Funnel Mapper brief: rename, ecosystem fit, sizes, shared clients, safe integration order. |
| `docs/apps/17_PORTAL_WHITEBOARD_FORMS_LADDER_SOCIAL_AGENTS.md` | 3 KB | Smaller apps brief (Portal, Whiteboard, Forms, Value Ladder, Social Planner, Layer 2 Agents). |
| `assets/tokens.json` | 7 KB | Design tokens: 4 sets (l2f-light, l2f-dark, aurj-light, aurj-dark). |
| `assets/tokens.css` | 6 KB | Same tokens as CSS custom properties. |
| `assets/icons.svg` | 35 KB | 145-icon SVG sprite (24 px grid, 1.6 stroke). |
| `assets/icons.json` | 17 KB | The same 145 icons as JSON (names used across the briefs). |
| `assets/routes.json` | 7 KB | The 122 prototype routes: [route, label, group]; screenshot n = route n. |
| `assets/logos/l2f-icon.png` | 4 KB | Layer2Funnels square icon. |
| `assets/logos/l2f-wordmark.png` | 34 KB | Layer2Funnels wordmark. |
| `assets/logos/aurj-badge.png` | 103 KB | Aurj round badge. |
| `assets/logos/aurj-cap.png` | 7 KB | Aurj cap mark. |
| `reference/Layer2Funnels_Claude_Code_Design_to_Implementation_Handoff.docx` | 49 KB | The manager's process document: how Claude Code must work (all briefs first, one app at a time, test, report, approval). |
| `reference/PLANNER_PRODUCT_DESIGN_SPEC.md` | 28 KB | Planner product and design specification (existing behaviour to preserve). |
| `reference/EDITORS_DESIGN_BRIEF.md` | 8 KB | Editors design brief (earlier round; current editor features). |
| `reference/DESIGN_BRIEF_Projects.md` | 14 KB | Projects V2 design brief (earlier round). |
| `prompts/P00_FOUNDATION.md` | 4 KB | Paste-ready Claude Code prompt (P00). |
| `prompts/P01_OFFICE.md` | 3 KB | Paste-ready Claude Code prompt (P01). |
| `prompts/P02_CLIENTS.md` | 3 KB | Paste-ready Claude Code prompt (P02). |
| `prompts/P03_PROJECTS.md` | 3 KB | Paste-ready Claude Code prompt (P03). |
| `prompts/P04_TASKS.md` | 3 KB | Paste-ready Claude Code prompt (P04). |
| `prompts/P05_DRIVE.md` | 3 KB | Paste-ready Claude Code prompt (P05). |
| `prompts/P06_PLANNER.md` | 3 KB | Paste-ready Claude Code prompt (P06). |
| `prompts/P07_FUNNEL_MAPPER.md` | 3 KB | Paste-ready Claude Code prompt (P07). |
| `prompts/P08_PORTAL_WHITEBOARD_OTHERS.md` | 3 KB | Paste-ready Claude Code prompt (P08). |
| `prompts/P09_REGRESSION.md` | 3 KB | Paste-ready Claude Code prompt (P09). |

### Prompts in build order

| # | Prompt | App | Depends on |
|---|---|---|---|
| P00 | `prompts/P00_FOUNDATION.md` | Tokens, rail shell, Launcher, search, notifications, profile, branding, context menus | – |
| P01 | `prompts/P01_OFFICE.md` | Office incl. Admin permissions UI + server rules | P00 |
| P02 | `prompts/P02_CLIENTS.md` | Clients incl. shared client record service | P00, P01 |
| P03 | `prompts/P03_PROJECTS.md` | Projects (skin of V2 + Files + personal projects) | P00–P02 |
| P04 | `prompts/P04_TASKS.md` | Tasks (new app) | P03 |
| P05 | `prompts/P05_DRIVE.md` | Drive + editors | P00 |
| P06 | `prompts/P06_PLANNER.md` | Planner (design only + Strategy builder + plan → project) | P03 |
| P07 | `prompts/P07_FUNNEL_MAPPER.md` | Funnel Mapper (rename, sizing, shared clients) | P02 |
| P08 | `prompts/P08_PORTAL_WHITEBOARD_OTHERS.md` | Portal, Whiteboard, Forms, Value Ladder, Social, Agents shell | P00 |
| P09 | `prompts/P09_REGRESSION.md` | Ecosystem regression pass | all |

### Prototype source (`prototype-source/`)

32 files. Load order and override rule: v4.css → v5.css → v6.css → v7.css (+ extra.css); JS modules per area with numbered generations (e.g. `projects5.js` then `projects6.js`; the higher number wins). `build7.py` rebuilds `ecosystem-v7.html` (it reads an HTML head from a path in the design sandbox, so it does not run as-is here). Files:

`avatar5.js` (18 KB), `base.css` (47 KB), `build7.py` (2 KB), `clients6.js` (34 KB), `core5.js` (31 KB), `core6.js` (7 KB), `drive5.js` (32 KB), `drive6.js` (21 KB), `extra.css` (1 KB), `fmp6.js` (22 KB), `funnels5.js` (9 KB), `head.js` (2 KB), `icons5.js` (8 KB), `logos.js` (70 KB), `misc6.js` (11 KB), `more5.js` (21 KB), `office5.js` (37 KB), `office6.js` (42 KB), `pdata5.js` (4 KB), `planner6.js` (40 KB), `portal.js` (12 KB), `projects5.js` (32 KB), `projects6.js` (52 KB), `reuse.js` (30 KB), `studio5.js` (29 KB), `tasks5.js` (16 KB), `tasks6.js` (16 KB), `v4.css` (50 KB), `v5.css` (45 KB), `v6.css` (80 KB), `v7.css` (8 KB), `v7.js` (10 KB)

## 3. Screenshots

Desktop: 122 (1440 px). Phone: 10 (390 px): `clients_list.jpg`, `drive_edit_doc_sop.jpg`, `drive_home.jpg`, `fmp_home.jpg`, `launcher.jpg`, `office_home.jpg`, `planner_home.jpg`, `portal_home.jpg`, `projects_p_p1_list.jpg`, `tasks_list_mine.jpg`.

Routes per area: Office 32, Projects 16, Planner 15, Clients 14, Funnel Mapper 9, Drive 8, Tasks 6, Ecosystem 5, Client Portal 4, Whiteboard 3, Forms 3, Layer 2 Agents 3, Value Ladder 2, Social Planner 2.

| # | Route (`ecosystem-v7.html#/…`) | Page | Area | Screenshot |
|---|---|---|---|---|
| 0 | `launcher` | Launcher | Ecosystem | `screens/desktop/000_launcher.jpg` |
| 1 | `profile` | Your profile (global) | Ecosystem | `screens/desktop/001_profile.jpg` |
| 2 | `auth` | Sign in screens | Ecosystem | `screens/desktop/002_auth.jpg` |
| 3 | `states` | Shared states | Ecosystem | `screens/desktop/003_states.jpg` |
| 4 | `system` | Design system | Ecosystem | `screens/desktop/004_system.jpg` |
| 5 | `office/home` | Home | Office | `screens/desktop/005_office_home.jpg` |
| 6 | `office/funnels` | Funnels overview | Office | `screens/desktop/006_office_funnels.jpg` |
| 7 | `office/avatars` | Customer Avatars (list) | Office | `screens/desktop/007_office_avatars.jpg` |
| 8 | `office/avatar-new` | New avatar: import or blank, choose 3D look | Office | `screens/desktop/008_office_avatar-new.jpg` |
| 9 | `office/avatar/john` | Avatar profile | Office | `screens/desktop/009_office_avatar_john.jpg` |
| 10 | `office/avatar/john/deep` | Avatar full profile | Office | `screens/desktop/010_office_avatar_john_deep.jpg` |
| 11 | `office/avatar/john/edit` | Avatar: edit chapters | Office | `screens/desktop/011_office_avatar_john_edit.jpg` |
| 12 | `office/avatar/john/use` | Avatar: use it | Office | `screens/desktop/012_office_avatar_john_use.jpg` |
| 13 | `office/avatar/john/evidence` | Avatar: evidence | Office | `screens/desktop/013_office_avatar_john_evidence.jpg` |
| 14 | `office/offers` | Offers & Products | Office | `screens/desktop/014_office_offers.jpg` |
| 15 | `office/offer-new` | New offer | Office | `screens/desktop/015_office_offer-new.jpg` |
| 16 | `office/stories` | Stories | Office | `screens/desktop/016_office_stories.jpg` |
| 17 | `office/story-new` | New story | Office | `screens/desktop/017_office_story-new.jpg` |
| 18 | `office/brandkits` | Brand Kits (many) | Office | `screens/desktop/018_office_brandkits.jpg` |
| 19 | `office/brandkit-new` | New brand kit | Office | `screens/desktop/019_office_brandkit-new.jpg` |
| 20 | `office/brandkit/l2f` | Brand kit | Office | `screens/desktop/020_office_brandkit_l2f.jpg` |
| 21 | `office/strategies` | Funnel Strategies | Office | `screens/desktop/021_office_strategies.jpg` |
| 22 | `office/strategy-template` | Default strategy template | Office | `screens/desktop/022_office_strategy-template.jpg` |
| 23 | `office/strategy/s1` | Strategy document | Office | `screens/desktop/023_office_strategy_s1.jpg` |
| 24 | `office/documents` | Documents with sections | Office | `screens/desktop/024_office_documents.jpg` |
| 25 | `office/team` | Team | Office | `screens/desktop/025_office_team.jpg` |
| 26 | `office/member/SN` | Member | Office | `screens/desktop/026_office_member_SN.jpg` |
| 27 | `office/apps` | Apps | Office | `screens/desktop/027_office_apps.jpg` |
| 28 | `office/admin/people` | Admin: people | Office | `screens/desktop/028_office_admin_people.jpg` |
| 29 | `office/admin/person/SN` | Person: relationships + app/feature access | Office | `screens/desktop/029_office_admin_person_SN.jpg` |
| 30 | `office/admin/teammates` | Teammate access | Office | `screens/desktop/030_office_admin_teammates.jpg` |
| 31 | `office/admin/clients` | Client access (owner only) | Office | `screens/desktop/031_office_admin_clients.jpg` |
| 32 | `office/admin/roles` | Roles | Office | `screens/desktop/032_office_admin_roles.jpg` |
| 33 | `office/admin/review` | Access review | Office | `screens/desktop/033_office_admin_review.jpg` |
| 34 | `office/admin/storage` | Storage & version rules | Office | `screens/desktop/034_office_admin_storage.jpg` |
| 35 | `office/admin/branding` | Organization branding | Office | `screens/desktop/035_office_admin_branding.jpg` |
| 36 | `office/admin/audit` | Audit log | Office | `screens/desktop/036_office_admin_audit.jpg` |
| 37 | `projects/home` | Home | Projects | `screens/desktop/037_projects_home.jpg` |
| 38 | `projects/mywork` | My Work | Projects | `screens/desktop/038_projects_mywork.jpg` |
| 39 | `projects/workload` | Workload | Projects | `screens/desktop/039_projects_workload.jpg` |
| 40 | `projects/portfolio` | Portfolio | Projects | `screens/desktop/040_projects_portfolio.jpg` |
| 41 | `projects/files` | Files (new) | Projects | `screens/desktop/041_projects_files.jpg` |
| 42 | `projects/all` | All projects | Projects | `screens/desktop/042_projects_all.jpg` |
| 43 | `projects/trash` | Trash | Projects | `screens/desktop/043_projects_trash.jpg` |
| 44 | `projects/p/p1/overview` | Overview | Projects | `screens/desktop/044_projects_p_p1_overview.jpg` |
| 45 | `projects/p/p1/list` | List | Projects | `screens/desktop/045_projects_p_p1_list.jpg` |
| 46 | `projects/p/p1/board` | Board | Projects | `screens/desktop/046_projects_p_p1_board.jpg` |
| 47 | `projects/p/p1/calendar` | Calendar | Projects | `screens/desktop/047_projects_p_p1_calendar.jpg` |
| 48 | `projects/p/p1/timeline` | Timeline | Projects | `screens/desktop/048_projects_p_p1_timeline.jpg` |
| 49 | `projects/p/p1/report` | Report | Projects | `screens/desktop/049_projects_p_p1_report.jpg` |
| 50 | `projects/p/p1/docs` | Docs & links | Projects | `screens/desktop/050_projects_p_p1_docs.jpg` |
| 51 | `projects/p/p1/collection` | Collection | Projects | `screens/desktop/051_projects_p_p1_collection.jpg` |
| 52 | `projects/p/p5/overview` | Archived project | Projects | `screens/desktop/052_projects_p_p5_overview.jpg` |
| 53 | `planner/home` | Home | Planner | `screens/desktop/053_planner_home.jpg` |
| 54 | `planner/mywork` | My work | Planner | `screens/desktop/054_planner_mywork.jpg` |
| 55 | `planner/plans` | Plans | Planner | `screens/desktop/055_planner_plans.jpg` |
| 56 | `planner/plan/map` | Plan: Planner view | Planner | `screens/desktop/056_planner_plan_map.jpg` |
| 57 | `planner/plan/timeline` | Plan: Timeline | Planner | `screens/desktop/057_planner_plan_timeline.jpg` |
| 58 | `planner/plan/reviews` | Plan: Reviews | Planner | `screens/desktop/058_planner_plan_reviews.jpg` |
| 59 | `planner/plan/settings` | Plan: Settings | Planner | `screens/desktop/059_planner_plan_settings.jpg` |
| 60 | `planner/alignment` | Alignment | Planner | `screens/desktop/060_planner_alignment.jpg` |
| 61 | `planner/reports` | Reports | Planner | `screens/desktop/061_planner_reports.jpg` |
| 62 | `planner/model/map` | Strategy map (redesigned) | Planner | `screens/desktop/062_planner_model_map.jpg` |
| 63 | `planner/model/kinds` | Objective kinds | Planner | `screens/desktop/063_planner_model_kinds.jpg` |
| 64 | `planner/model/kpi` | KPI types | Planner | `screens/desktop/064_planner_model_kpi.jpg` |
| 65 | `planner/model/fa` | Focus areas | Planner | `screens/desktop/065_planner_model_fa.jpg` |
| 66 | `planner/model/horizons` | Time horizons | Planner | `screens/desktop/066_planner_model_horizons.jpg` |
| 67 | `planner/model/tpl` | Templates | Planner | `screens/desktop/067_planner_model_tpl.jpg` |
| 68 | `fmp/home` | Home | Funnel Mapper | `screens/desktop/068_fmp_home.jpg` |
| 69 | `fmp/clients` | Clients | Funnel Mapper | `screens/desktop/069_fmp_clients.jpg` |
| 70 | `fmp/client/sc` | Client | Funnel Mapper | `screens/desktop/070_fmp_client_sc.jpg` |
| 71 | `fmp/funnels` | Funnels | Funnel Mapper | `screens/desktop/071_fmp_funnels.jpg` |
| 72 | `fmp/funnel/pt` | Editor | Funnel Mapper | `screens/desktop/072_fmp_funnel_pt.jpg` |
| 73 | `fmp/funnel/pt/reports` | Reports | Funnel Mapper | `screens/desktop/073_fmp_funnel_pt_reports.jpg` |
| 74 | `fmp/templates` | Templates | Funnel Mapper | `screens/desktop/074_fmp_templates.jpg` |
| 75 | `fmp/trash` | Trash | Funnel Mapper | `screens/desktop/075_fmp_trash.jpg` |
| 76 | `fmp/settings` | Settings | Funnel Mapper | `screens/desktop/076_fmp_settings.jpg` |
| 77 | `clients/list` | All clients (table · grid · pipeline) | Clients | `screens/desktop/077_clients_list.jpg` |
| 78 | `clients/c/hk/Overview` | Client overview | Clients | `screens/desktop/078_clients_c_hk_Overview.jpg` |
| 79 | `clients/c/hk/Work/0` | Work › Brand Base (submitted answers) | Clients | `screens/desktop/079_clients_c_hk_Work_0.jpg` |
| 80 | `clients/c/hk/Work/1` | Work › Strategy workspace | Clients | `screens/desktop/080_clients_c_hk_Work_1.jpg` |
| 81 | `clients/c/hk/Work/1/avatar` | Strategy › Customer Avatar | Clients | `screens/desktop/081_clients_c_hk_Work_1_avatar.jpg` |
| 82 | `clients/c/hk/Work/1/offers` | Strategy › Offers | Clients | `screens/desktop/082_clients_c_hk_Work_1_offers.jpg` |
| 83 | `clients/c/hk/Work/1/brand` | Strategy › Brand Kits | Clients | `screens/desktop/083_clients_c_hk_Work_1_brand.jpg` |
| 84 | `clients/c/hk/Work/2` | Work › Copy | Clients | `screens/desktop/084_clients_c_hk_Work_2.jpg` |
| 85 | `clients/c/hk/Work/3` | Work › Build | Clients | `screens/desktop/085_clients_c_hk_Work_3.jpg` |
| 86 | `clients/c/hk/Documents` | Documents | Clients | `screens/desktop/086_clients_c_hk_Documents.jpg` |
| 87 | `clients/requests` | Requests & Approvals | Clients | `screens/desktop/087_clients_requests.jpg` |
| 88 | `clients/r/r3` | Request detail | Clients | `screens/desktop/088_clients_r_r3.jpg` |
| 89 | `clients/sops` | SOPs | Clients | `screens/desktop/089_clients_sops.jpg` |
| 90 | `clients/settings/stages` | Settings | Clients | `screens/desktop/090_clients_settings_stages.jpg` |
| 91 | `drive/home` | Home | Drive | `screens/desktop/091_drive_home.jpg` |
| 92 | `drive/mydrive` | Library | Drive | `screens/desktop/092_drive_mydrive.jpg` |
| 93 | `drive/personal` | Personal | Drive | `screens/desktop/093_drive_personal.jpg` |
| 94 | `drive/edit/doc/sop` | Docs editor | Drive | `screens/desktop/094_drive_edit_doc_sop.jpg` |
| 95 | `drive/edit/sheet/cal` | Sheets editor | Drive | `screens/desktop/095_drive_edit_sheet_cal.jpg` |
| 96 | `drive/edit/slides/deck` | Slides editor | Drive | `screens/desktop/096_drive_edit_slides_deck.jpg` |
| 97 | `drive/edit/image/hero` | Image editor | Drive | `screens/desktop/097_drive_edit_image_hero.jpg` |
| 98 | `drive/edit/pdf/prop` | PDF editor | Drive | `screens/desktop/098_drive_edit_pdf_prop.jpg` |
| 99 | `tasks/today` | Today | Tasks | `screens/desktop/099_tasks_today.jpg` |
| 100 | `tasks/upcoming` | Upcoming | Tasks | `screens/desktop/100_tasks_upcoming.jpg` |
| 101 | `tasks/inbox` | Inbox | Tasks | `screens/desktop/101_tasks_inbox.jpg` |
| 102 | `tasks/teammates` | Teammates | Tasks | `screens/desktop/102_tasks_teammates.jpg` |
| 103 | `tasks/list/mine` | My tasks (blocks, show completed) | Tasks | `screens/desktop/103_tasks_list_mine.jpg` |
| 104 | `tasks/list/team` | Team list with access | Tasks | `screens/desktop/104_tasks_list_team.jpg` |
| 105 | `portal/home` | Home | Client Portal | `screens/desktop/105_portal_home.jpg` |
| 106 | `portal/requests` | Requests | Client Portal | `screens/desktop/106_portal_requests.jpg` |
| 107 | `portal/approvals` | Approvals | Client Portal | `screens/desktop/107_portal_approvals.jpg` |
| 108 | `portal/notes` | My notes | Client Portal | `screens/desktop/108_portal_notes.jpg` |
| 109 | `whiteboard/home` | Boards and folders | Whiteboard | `screens/desktop/109_whiteboard_home.jpg` |
| 110 | `whiteboard/folder/f1` | Folder | Whiteboard | `screens/desktop/110_whiteboard_folder_f1.jpg` |
| 111 | `whiteboard/board/b1` | Full-page board | Whiteboard | `screens/desktop/111_whiteboard_board_b1.jpg` |
| 112 | `forms/list` | Forms | Forms | `screens/desktop/112_forms_list.jpg` |
| 113 | `forms/b/quiz` | Builder | Forms | `screens/desktop/113_forms_b_quiz.jpg` |
| 114 | `forms/subs` | Responses | Forms | `screens/desktop/114_forms_subs.jpg` |
| 115 | `ladder/list` | Ladders | Value Ladder | `screens/desktop/115_ladder_list.jpg` |
| 116 | `ladder/map/hk` | Ladder | Value Ladder | `screens/desktop/116_ladder_map_hk.jpg` |
| 117 | `social/calendar` | Calendar | Social Planner | `screens/desktop/117_social_calendar.jpg` |
| 118 | `social/board` | Pipeline | Social Planner | `screens/desktop/118_social_board.jpg` |
| 119 | `agents/home` | Agents | Layer 2 Agents | `screens/desktop/119_agents_home.jpg` |
| 120 | `agents/meeting/new` | Meeting Intelligence | Layer 2 Agents | `screens/desktop/120_agents_meeting_new.jpg` |
| 121 | `agents/ask` | Ask | Layer 2 Agents | `screens/desktop/121_agents_ask.jpg` |

## 4. Inconsistencies found in the package (and how they are read)

1. **Funnel Mapper repository.** Brief 16 and P07 assume Funnel Mapper stays in its separate `Funnel-Mapper` repository. The owner's later instruction (13 Nov) moves it into this repository as `apps/funnel-mapper/`. The owner's instruction wins; the brief's design and integration content still applies. Recorded as decision FM-6.
2. **README build order.** README step 3 says "P01_OFFICE.md, then P02_PROJECTS.md". The real prompt files are P02 = Clients, P03 = Projects, matching `docs/00_ECOSYSTEM_OVERVIEW.md` §3. Read: follow the file numbers (Clients before Projects, because Funnel Mapper and Projects depend on client identity).
3. **Stylesheet path.** P00/P07 say to merge tokens into `apps/web/css/v4.css`; in the repository it is `apps/web/v4.css`, generated from `packages/ui/tokens.json` by `scripts/build-tokens.mjs`. Read: update `packages/ui/tokens.json` and regenerate; never hand-edit `v4.css`.
4. **Funnel Mapper editor in the prototype is simplified.** `fmp6.js` draws plain boxes; the real editor has rich block visuals (icons, page thumbnails, people counts, frames, leak markers). Brief 16 says not to change maps or the editor. Read: the real app is the reference for the canvas; the prototype only for chrome, sizes and layout.
5. **Client status "Lost".** The design system and the Clients brief add a Lost status; the repository's client status list is lead/proposal/active/paused/past. This belongs to P02 (Clients) and is not changed in the Funnel Mapper stage.
6. **Process document vs this stage.** The manager's document asks for implementation briefs of every app before any code. The owner limited this stage to the package, the Funnel Mapper migration and the handoff; the other apps' plans are made in their own chats from their prompts (see the handoff file).
7. **Funnel Mapper look.** The ecosystem copy had been restyled to light ecosystem blues in an earlier round (design 08). V7, `NEW_CHAT_HANDOFF.md` ("dark navy + emerald design is approved") and the manager's document ("the current Funnel Mapper design is approved overall") agree on the original identity. Read: see `docs/implementation/FUNNEL_MAPPER_DESIGN_DECISIONS.md`.

## 5. Design review (critical reading of V7, not a copy order)

| Area | V7 proposes | Issue found | Recommendation |
|---|---|---|---|
| Shell | 64 px left rail replaces the 68 px header in every app | Strong: more vertical space, consistent way between apps. Risk: two stacked sidebars (rail + app sidebar) on 1366 px laptops leave ~1000 px for content. | Keep. App sidebars must collapse to icons below ~1280 px; editors and canvases hide the app sidebar (V7 already says so for editors). |
| Sizes | One step up everywhere except approved pages | Correct reading of the owner's feedback; blanket enlargement would break dense tables. | Apply per element as listed in 01 §3; keep work surfaces at 42–48 px rows. Funnel Mapper: chrome +1 step, map blocks unchanged (layouts and exports stay identical). |
| Global search | Ctrl K across apps with scope chips and filters | Good. Needs a permission-aware index (ER7: pointers only, re-check every hit); otherwise it leaks. | Build on the existing ER7 rule; no counts of hidden hits. |
| Notifications | One inbox for every app | Good. Missing: retention and digest rules (D3 says email later). | In-app only, 90-day retention, mark-all-read per app. |
| Funnel Mapper | Rename, +1 size step, shared clients, keep navy + emerald | The theme differs from the warm-paper ecosystem; acceptable as the app's identity and approved by the owner. The prototype's simplified editor must not replace the real one. | Keep identity, keep the real editor, shared clients in the safe order with explicit duplicate decisions. |
| Clients ↔ FM duplicates | "Duplicate check by contact email + normalized name; offer Link to existing" | Linking on a name match alone would merge different people. | E-mail exact = offer link (person decides); name-only = review; ambiguous = must choose; never automatic (implemented this way). |
| Client service failure | "Show last cached list read-only and queue creation" | A queue that later creates clients can create duplicates if the person retries. | Refuse with a clear message and save nothing (implemented); add a queue only with an idempotency key. |
| Tasks app | Full new app with blocks, folders, multiple assignees | Overlaps Projects tasks; two task systems confuse users. | Keep one task store: Tasks lists are personal/team lists, "Send to a project" moves the item (as the brief says); search and My day must merge both. Decide before building P04. |
| Profile page | Global `#/profile` outside Office | Good separation of person vs organization. | Keep. |

This review is advice for the app chats; the Funnel Mapper decisions are applied in this stage.

