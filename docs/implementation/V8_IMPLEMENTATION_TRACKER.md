# V8 implementation tracker

One list for everything: the V8 handoff (every page, menu, dialog, flow and cross-cutting rule) **merged with the owner's additional requirements, bug reports and final directives** (14 Nov 2026). Nothing is marked done because a screen exists; "Tested and verified" needs the test named in the row.

**Statuses:** Not started · In progress · Implemented · Tested and verified · Blocked · Requires clarification.
**Kind:** **V8** = already specified in the handoff · **V8+** = in V8, the owner adds detail · **ADD** = additional owner requirement, not in V8 · **BUG** = bug fix in the live app · **PROC** = process/quality rule.

Phases follow the handoff order: P00 shell → P01 Office → P02 Clients → P03 Projects → P04 Tasks → P05 Drive and editors → P06 Planner → P07 Funnel Mapper → P08 Client Portal → P09 Whiteboard → P10 Forms → P11 Value Ladder → P12 Social Planner → P13 Layer 2 Agents → P14 full check.

## Part A. Coverage by application

| Phase | App | V8 pages | Live today (V4 build) | V8 work | Owner additions / bug fixes | Status |
|---|---|---|---|---|---|---|
| P00 | Shell, Launcher, Profile | 9 | 68 px header, launcher with sky + weather, bell for Projects only, search disabled, profile page inside Office | [N] rail, global search + endpoint, notifications for all apps, global profile page, branding, context menus, shared states; [R] launcher | Sign out on Launcher, logos, Khushab weather effects (no snow), app-opening animation only while loading, performance, search privacy, people and pages in search | Not started |
| P01 | Office | 39 | Home, Funnels records, Strategies, Documents, Team, Apps, Admin (members, access, effective access, history) | 26 new pages: avatar wizard + edit, new offer/story, brand kits, strategy template, document sections, Admin rebuilt (people, person, teammate access, client access, roles, review, storage, branding, audit) | Client Office (own workspace per client), admin grantable "Manage client access" | Not started |
| P02 | Clients | 34 | ≈30 % (list views, client tabs, stages, requests, SOPs, tools, settings › stages, sharing, portal preview) | Table default, Lost + reason, Brand Base answers, Strategy workspace, Copy library, request detail, SOP colours, settings tabs, custom sections, Client service | App access panel inside the client record | Not started |
| P03 | Projects | 17 | Projects V2 live | Skin, Files page, personal projects, sidebar groups, timer pill | Central documents = Files page; fix known UI/function bugs; full QA | Not started |
| P04 | Tasks | 7 | Does not exist | Whole new app | — | Not started |
| P05 | Drive and editors | 13 | Drive (Library/Personal), Docs, Sheets, Slides, Image, PDF editors live | Category pages, Move/Copy Library ↔ Personal, editor frame, ruler, voice bar, Reset to original | Many editor bugs (see Part B §7–8), image attachments without duplicates, mixed Urdu/English + Roman Urdu dictation, live presence and cursors, sheets engine reliability, Dream 100 workbook | Not started |
| P06 | Planner | 17 | Planner live (React) | Design only + Strategy builder (no Grid) + plan → project + 10 s loading fix | Better Alignment layout, objective drawer scroll bug, strategy → project, preserve all V4 functions | Not started |
| P07 | Funnel Mapper | 10 | Live at /fmp (own look, own sidebar, ecosystem sign-in) | Rail inside FM, sizes up, rename check, shared clients (done in repo, verify) | Feels native: rail, org, profile, app switching | Not started |
| P08 | Client Portal | 5 | Locked preview with Home, Requests, Files, Messages, My notes | Tabs Home, Requests, Approvals, My notes; Files and Messages removed | Owner decided 14 Nov: remove Messages and Files as V8 says (C1) | Not started |
| P09 | Whiteboard | 5 | Excalidraw boards, All boards | Folders, full-page board | — | Not started |
| P10 | Forms | 4 | Builder, submissions, templates (internal only) | Responses summary, Automations "Later" | Public share link, public submission without account, spam protection, logged-out E2E test | Not started |
| P11 | Value Ladder | 3 | Live | Revenue model strip | — | Not started |
| P12 | Social Planner | 7 | Live (calendar, posts, queue, approvals, channels) | Pipeline board, Campaigns | — | Not started |
| P13 | Layer 2 Agents | 9 | Placeholder | Preview-state shell pages | — | Not started |
| P14 | Whole ecosystem | — | — | Regression, permissions matrix, responsive, a11y, design QA | 5 owner reports, zero known critical/high defects | Not started |

**Totals:** 179 V8 pages · 4,244 listed controls · 85 sidebar items · 56 dialogs · 52 app flows + 10 cross-app flows · 12 cross-cutting rules · 63 owner requirements (Part B).

## Part B. Owner requirements merged with V8

Columns: ID · App · Kind · Requirement (expected behaviour) · Where V8 covers it · Phase · Status · Test · Result · Remaining.

### B1. Global ecosystem (owner §1)

| ID | App | Kind | Requirement | V8 reference | Phase | Status | Test | Result | Remaining |
|---|---|---|---|---|---|---|---|---|---|
| OR-01 | Launcher | V8+ | Direct **Sign out** on the Launcher (profile menu on the Launcher header) | 02 §2 profile menu has Sign out; Launcher header has profile | P00 | Not started | E2E: launcher → profile menu → Sign out → sign-in page, session cookie gone | — | — |
| OR-02 | Shell | V8 | Layer2Funnels (and Aurj) logo shown correctly everywhere the organization appears, never stretched | 02 §8, 08 asset index §1 | P00 | Not started | Visual check rail, launcher, switcher, sheet, sign-in; both orgs, light/dark | — | — |
| OR-03 | All | V8 | Readable type: sidebar sizes kept; right panels, labels, tags, secondary text readable; consistent hierarchy; no blanket enlargement | 01 §3, §5; V8 design decisions | P00 → all | Not started | DOM scan: no text < 12 px except initials/badges; panel values 15 px | — | — |
| OR-04 | Projects | BUG | Find and fix known Projects UI and functional problems | V8_BUG_FIXES #5–#10 + audit | P03 | Not started | Projects e2e suite + new tests per bug found | — | Owner's exact bug list not given: audit the live app |
| OR-05 | Shell | V8 | "Pro notification" = the notification inbox (bell) for every app (owner confirmed 14 Nov) | 02 §6 notifications | P00 | Not started | See OR-11 | — | — |
| OR-06 | All apps | V8+ | App-opening animation as in V8 (zoom into app), shown **only while content is really loading**, removed when ready | 01 §7 motion, 02 §4 | P00 | Not started | Measure: animation ends ≤ 50 ms after first content paint; reduced motion = none | — | — |
| OR-07 | All apps | ADD | Performance: near-instant navigation, sub-second interactions, no repeated fetches, caching/prefetch/pagination/lazy loading, optimistic updates where safe, partial loading, clear loading/error states. Measure and document exceptions | 05 §6 only "no duplicate requests" | P00 + every app | Not started | Playwright timing per route (cold/warm), request counter (no duplicate calls), report table | — | — |

### B2. Search and notifications (owner §2)

| ID | App | Kind | Requirement | V8 reference | Phase | Status | Test | Result | Remaining |
|---|---|---|---|---|---|---|---|---|---|
| OR-08 | Shell | V8+ | One search bar for the whole ecosystem: apps, **pages and menus / navigation options**, projects, tasks, Drive files and folders, documents, **people (team members with avatars)**, clients | 02 §5 (scopes Everything, Projects & tasks, Tasks, Clients, Docs & files, Office, Planner, Funnels) | P00 + providers per app | Not started | Search test per provider | — | Pages/menus and people providers are additions |
| OR-09 | Shell, Clients, Drive | ADD (C4) | Client privacy: a client **record** may appear (and open if permitted) but **never client documents, files, private client information or confidential records** | — (V8 would include files) | P00/P02/P05 | Not started | DB test: client-scoped file with matching name is never returned, for any role | — | — |
| OR-10 | Shell | V8 | Results filtered on the server by organization, app, record permission; never trust the browser | 02 §5 backend | P00 | Not started | Two users × two orgs matrix (direct API calls) | — | — |
| OR-11 | Shell + apps | V8+ | Notifications from Projects, Tasks, Drive, Planner, Clients, Forms and others: open record, mark read, mark all read, settings; **no duplicate notifications for one event** | 02 §6 | P00 + each app | Not started | Unit: same event twice → one row (unique key); E2E: bell → open → read | — | Email digests wait for D3 (Brevo exists for invitations) |

### B3. Permissions and client application access (owner §3)

| ID | App | Kind | Requirement | V8 reference | Phase | Status | Test | Result | Remaining |
|---|---|---|---|---|---|---|---|---|---|
| OR-12 | Office › Admin | V8 | Client can be given: Office, Projects, Tasks, Client Portal, Planner, Funnel Mapper, Forms, Value Ladder, Social Planner, Whiteboard, Layer 2 Agents | 03 §2.3 | P01 | Not started | API test per app on/off for a client contact | — | — |
| OR-13 | Office | V8 (D6) | Each client gets **their own Office** (client edition), on by default, isolated from other clients and from the agency's internal Office; owner can switch it off | 03 §2.3, D6 | P01 | Not started | DB test: client A cannot read client B or internal Office rows | — | D6 content uses the documented assumption |
| OR-14 | Clients | ADD (C5) | Access management **inside the client record**: enable/disable each app, manage Office access, review apps, change later | 03 §2 (Admin matrix) | P02 | Not started | E2E: change in client record shows in Admin matrix and vice versa | — | — |
| OR-15 | All client apps | V8+ | Feature-level restrictions for clients where supported; a client never sees other clients or internal data | 03 §2.2–2.3 | P01 + apps | Not started | Permission matrix (client contact role) | — | — |
| OR-16 | Office › Admin | V8+ (C6) | Owner manages team **and** client permissions; Admin manages team only, **unless the owner grants "Manage client access"**; team members get only what is assigned | 03 §2.4 | P01 | Not started | Direct API: admin without grant → refused; with grant → allowed; audit rows | — | — |
| OR-17 | All | V8 | All checks on the backend, default deny; keep organization/workspace isolation, WCIGA and SDOR | 03, repo DECISIONS | All | Not started | P14 permission matrix | — | — |

### B4. Office (owner §4)

| ID | App | Kind | Requirement | V8 reference | Phase | Status | Test | Result | Remaining |
|---|---|---|---|---|---|---|---|---|---|
| OR-18 | Office | V8 | Every new Office page, menu, function and workflow (not a reskin) — 39 pages | Office brief | P01 | Not started | Part C P01 rows + 7 Office flows | — | — |

### B5. Projects (owner §5)

| ID | App | Kind | Requirement | V8 reference | Phase | Status | Test | Result | Remaining |
|---|---|---|---|---|---|---|---|---|---|
| OR-19 | Projects | V8 + PROC | Keep every existing Projects function; compare old build, V8 and backend before changes | Projects brief "Every V2 feature stays" | P03 | Not started | V4 preservation matrix + existing e2e suite | — | — |
| OR-20 | Projects | V8 | One place to find documents from all projects and tasks (Files page), with project/task context, permissions, no other clients' or orgs' files | Projects › Files [N] | P03 | Not started | DB test (RLS) + E2E "Find a file attached anywhere" | — | — |
| OR-21 | Projects | PROC | Test create/edit, navigation, task relations, documents, views and filters, menus, status changes, permissions, persistence | — | P03 | Not started | Listed tests | — | — |

### B6. Drive (owner §6)

| ID | App | Kind | Requirement | V8 reference | Phase | Status | Test | Result | Remaining |
|---|---|---|---|---|---|---|---|---|---|
| OR-22 | Drive | V8 | Move **and copy** files **and folders** directly Personal ↔ Library from the sidebar/menu (no download/upload); keep contents, structure, metadata, sharing where appropriate, ownership, versions; links keep working | 03 §4, Drive brief | P05 | Not started | API + E2E both directions, folder recursion, version count, link still opens | — | — |
| OR-23 | Drive | V8 | No duplicate storage on move; respect personal vs Library vs client-owned files | 03 §4 | P05 | Not started | Storage counter unchanged after move | — | — |

### B7. Document editor (owner §7)

| ID | App | Kind | Requirement | V8 reference | Phase | Status | Test | Result | Remaining |
|---|---|---|---|---|---|---|---|---|---|
| OR-24 | Docs | BUG | Correct page frame and dimensions; no layout change after refresh; font sizes and formatting kept after save and after restoring history; consistent across screen sizes | Editors brief | P05 | Not started | Save → reload → DOM/style snapshot equal; restore version → equal | — | — |
| OR-25 | Docs + all | BUG | No duplicate dialogs, panels, actions or requests on double-click | — | P05 (pattern for all) | Not started | Double-click every menu/dialog trigger → one instance, one request | — | — |
| OR-26 | Docs | BUG | Copy/paste: keyboard, context menu where the browser allows, from other apps, formatted text, images | Editors brief | P05 | Not started | Clipboard tests (HTML, plain, image) | — | — |
| OR-27 | Docs | BUG | Never lose content: Drive back button, switching tabs, shortcuts, slash command, switching views; unsaved-change guard; reliable autosave | 03 §5 autosave | P05 | Not started | Scripted sequences per trigger; content hash unchanged | — | — |
| OR-28 | Docs + Drive | BUG + ADD | Images inside a document are **document attachments**, not separate Drive files; **no new copy per save/version** (content-addressed, shared references); automatic compression with acceptable quality; old versions keep their images; nothing deleted while still referenced | 03 §5 (storage rules) | P05 | Not started | Save 10× → one stored image; restore old version → image present; delete after last reference → freed | — | Needs a migration for existing embedded images |
| OR-29 | Docs | V8+ | Voice typing: natural English from a non-native speaker; Urdu → Urdu script; English words inside Urdu kept in English; **Roman Urdu** option; mixed speech not forced into one language; user picks the mode | Drive brief voice bar (EN US/UK, Urdu) | P05 | Not started | Manual test with owner (speech); unit tests for mode handling/transliteration | — | Browser speech engines recognise one language at a time: mixed/Roman modes need a documented approach |
| OR-30 | Docs | BUG | Voice text goes in **at the cursor**, never at the top | — | P05 | Not started | Unit: insert at saved selection | — | — |
| OR-31 | Docs | BUG | Voice across editor tabs: mic state handled, no repeated stop/start, permission changes and mic failures handled, no duplicate or misplaced text | — | P05 | Not started | Simulated recogniser events across tab switch | — | — |
| OR-32 | Docs | V8 | Ruler like Google Docs (margins, first-line indent, tab stops, vertical ruler) | Drive brief Docs ruler | P05 | Not started | Drag margin → page margin changes; tab stop affects Tab | — | — |
| OR-33 | Docs | ADD (C3) | Collaboration: who is viewing/editing, their cursors, presence, no edit conflicts, reliable sync; **Share inside the editor** respecting permissions | V8 top bar Share; presence = D5 "Last edited by" | P05 | Not started | Two browsers: presence + cursor visible; concurrent edits merge | — | Realtime channel choice ($0) documented in P05 plan |

### B8. Spreadsheet editor (owner §8)

| ID | App | Kind | Requirement | V8 reference | Phase | Status | Test | Result | Remaining |
|---|---|---|---|---|---|---|---|---|---|
| OR-34 | Sheets | BUG | "Not saved, retrying…" stuck; saved shown only when persisted | 03 §5 | P05 | Not started | Save → server row version matches; offline → honest status | — | — |
| OR-35 | Sheets | BUG | `#NAME?` for supported formulas; meaningful error for unsupported ones | Editors brief §4 | P05 | Not started | Formula suite (every function claimed) | — | — |
| OR-36 | Sheets | V8 + BUG | Reliable editor: create/open, edit, ranges, copy/paste, rows/columns, resize, formatting (font family/size, B/I/U, colours, fill, borders, alignment), number/currency/percent/date formats, formulas, sort/filter, validation + dropdowns, multiple sheets, undo/redo, autosave, history/recovery, import/export, keyboard navigation, readable columns | Editors brief §4 | P05 | Not started | Feature checklist test per item | — | — |
| OR-37 | Sheets | ADD | Test with the **Aurj Dream 100 Tracker** (Dashboard, Instructions, Prospects, Interaction Log, Scoring Guide, Target Map, Lists): dashboard calculates from data, dropdowns, priority score, follow-up counts | — | P05 | Blocked | Import real workbook → compare every formula cell with Excel/Sheets values | — | Owner will upload the .xlsx (14 Nov); only this test waits |

### B9. Tasks, Funnel Mapper (owner §9–10)

| ID | App | Kind | Requirement | V8 reference | Phase | Status | Test | Result | Remaining |
|---|---|---|---|---|---|---|---|---|---|
| OR-38 | Tasks | V8 | Build the whole new Tasks app from the V8 brief (no reduced version) | Tasks brief | P04 | Not started | 6 acceptance tests in the brief + Part C P04 | — | — |
| OR-39 | Funnel Mapper | V8 | Native in the ecosystem: universal rail, global navigation, correct org identity and profile, shared sign-in and permissions, Launcher switching; keep its editor and functions | FM brief §2 | P07 | Not started | Golden funnel numbers + visual check + org switch | — | — |

### B10. Planner (owner §11 + final directives §3–4)

| ID | App | Kind | Requirement | V8 reference | Phase | Status | Test | Result | Remaining |
|---|---|---|---|---|---|---|---|---|---|
| OR-40 | Planner | BUG (V8 covers) | Opening a plan sometimes fails: find the cause; repeated open/close/refresh/switch always works | Planner loading fix (10 s, token refresh, org mismatch) | P06 | Not started | Loop test 50× open/switch/refresh; expired-token test | — | — |
| OR-41 | Planner | V8 | New Strategy Builder / Strategy Map; **no Grid view**; create a plan from a strategy | Strategy builder [N] | P06 | Not started | E2E "Build a strategy" | — | — |
| OR-42 | Planner → Projects | V8 | Completed strategy → project in Projects | Strategy bar "Create a project from it" | P06 | Not started | E2E with saved data | — | — |
| OR-43 | Planner → Projects | V8+ | Plan → project keeps details, tasks, milestones, dates, owners, dependencies, relevant documents; **no duplicate project on repeated clicks**; confirmation and feedback | 03 §6 createProjectFromPlan | P03/P06 | Not started | Idempotency test (double submit → one project) + field mapping test | — | Milestones/dependencies/documents mapping beyond V8 is an addition |
| OR-44 | Planner | ADD (C7) | Alignment: keep every V4/live function; redesign the layout so it is clear and practical (better than V8's version) | Alignment keeps original behaviour | P06 | Not started | Function checklist vs live; owner review | — | — |
| OR-45 | Planner | BUG | Objective panel (task sidebar) does not scroll: fix cause; long content reachable; independent scroll; sticky header/footer don't cover content; all sizes | Objective drawer | P06 | Not started | Long-content test at 1440/834/390 | — | — |
| OR-46 | Planner | ADD | Overall Planner UI better than both live and V8 while keeping V4 functions | — | P06 | Not started | Owner review + function checklist | — | — |
| OR-47 | Planner | PROC | Preserve every V4 Planner feature (menus, alignment, strategy, task relations, workflows) | Planner "design only" | P06 | Not started | Planner suites (277 DB checks) unchanged | — | — |

### B11. Forms (owner §12)

| ID | App | Kind | Requirement | V8 reference | Phase | Status | Test | Result | Remaining |
|---|---|---|---|---|---|---|---|---|---|
| OR-48 | Forms | V8 | Complete builder: 11 field types, configuration, validation, required fields, settings, Show-if logic | Forms §4 | P10 | Not started | Builder tests | — | — |
| OR-49 | Forms | ADD (C2) | After publishing: **public share URL**, Copy link; anyone can open and submit without an account (unless set to require sign-in) | V4/V8: public publish disabled until review + approval | P10 | Not started | Logged-out browser test | — | Owner's request = approval; Turnstile key optional |
| OR-50 | Forms | V8 | Submissions stored reliably and reviewable in Forms (Responses) | Responses summary | P10 | Not started | Submit → row → visible to owner | — | — |
| OR-51 | Forms | ADD | Public route under the ecosystem domain (e.g. `office.tabishriaz.com/f/<link>`); inspect deployment; document any DNS/config need | — | P10 | Not started | Live check after merge | — | — |
| OR-52 | Forms | PROC | Full public journey test (create, fields, publish, URL, private window, submit, stored, owner sees, validation and errors) | — | P10 | Not started | E2E 9 steps | — | — |

### B12. Launcher weather (final directives §5)

| ID | App | Kind | Requirement | V8 reference | Phase | Status | Test | Result | Remaining |
|---|---|---|---|---|---|---|---|---|---|
| OR-53 | Launcher | V8+ | Atmosphere from **Khushab, Pakistan** weather and season: cool winter haze, fog/mist when foggy, clouds, rain when raining, gentle wind, warm sun, evening/night; **no snow by default**; only effects the real weather justifies | 02 §4 sky + weather | P00 | Not started | Unit: weather code → effect map (no snow); visual per effect | — | — |
| OR-54 | Launcher | V8+ | Works without the weather service (season/time fallback); subtle; good contrast; never blocks buttons/menus/search | 02 §4 | P00 | Not started | Weather API down → launcher fully usable | — | — |
| OR-55 | Launcher | V8+ | Light on CPU/battery/network; respects reduced motion; a switch to turn effects off (profile menu + Appearance) | 02 §2 "Weather on the Launcher" toggle | P00 | Not started | Reduced-motion test; toggle persists | — | — |

### B13. Process and quality (final directives §1, §2, §6; main prompt Part 8–10)

| ID | App | Kind | Requirement | Phase | Status | Test | Result | Remaining |
|---|---|---|---|---|---|---|---|---|
| OR-56 | All | PROC | **Additive only**: V4 functions + V8 additions + fixes; never remove a feature because a screenshot lacks it; feature-preservation and addition matrix per app before changing it | Every phase | In progress | `V4_FEATURE_PRESERVATION_MATRIX.md` | — | — |
| OR-57 | All | PROC | Every button/menu/tab/form/navigation works; data saves and loads; permissions enforced; loading/empty/error/success states; no dead links, content loss, duplicate actions, horizontal scroll, overlaps, missing assets, unexplained typography changes | Every phase | Not started | Inventory test (FUNCTIONAL_TESTING §1) | — | — |
| OR-58 | All | PROC | Visual QA vs V8 at desktop/tablet/phone for every page | Every phase | Not started | `V8_VISUAL_QA_REPORT.md` | — | — |
| OR-59 | All | PROC | Test matrix: unit, integration, E2E, permission, responsive, visual regression; repeat critical workflows (refresh, navigation, panels, save, restore, app switch) | Every phase | Not started | `V8_FUNCTIONAL_QA_REPORT.md`, `V8_REGRESSION_TEST_REPORT.md` | — | — |
| OR-60 | All | PROC | Zero known critical/high defects at release; every remaining issue listed honestly | P14 | Not started | Release report | — | — |
| OR-61 | All | PROC | Reports: `V8_DOCUMENTATION_REVIEW.md` (done), this tracker, `V8_CRITICAL_REQUIREMENTS_QA.md`, `V4_FEATURE_PRESERVATION_MATRIX.md`, `V8_FEATURE_IMPLEMENTATION_MATRIX.md`, `V8_VISUAL_QA_REPORT.md`, `V8_FUNCTIONAL_QA_REPORT.md`, `V8_REGRESSION_TEST_REPORT.md`, `V8_IMPLEMENTATION_COMPLETION_REPORT.md`, screenshots | Ongoing | In progress | — | — | — |
| OR-62 | All | PROC | Protect production data, secrets and live services; no merge/deploy to production without authorization | Always | In progress | — | — | — |
| OR-63 | Portal | PROC (C1) | Portal Messages and Files: owner decided 14 Nov to remove them as V8 says (the one approved removal) | P08 | Not started | Portal shows Home, Requests, Approvals, My notes only | — | — |

## Part C. Every V8 page, menu, dialog and flow

Generated from `PAGES_AND_NAVIGATION.md` (all 179 pages) and `07_IMPLEMENTATION_CHECKLIST.md`. "Controls" = buttons + links + inputs listed for that page in the V8 docs; the app report checks each one. Status for all rows: **Not started** unless stated.

### P00 · Shell, Launcher, Profile (9 pages)

| # | Page | Route | Controls | Status | Test | Result |
|---|---|---|---|---|---|---|
| P00-01 | Launcher | `#/launcher` | 23 | Not started | — | — |
| P00-02 | Your profile (global) | `#/profile` | 28 | Not started | — | — |
| P00-03 | Sign in screens | `#/auth` | 14 | Not started | — | — |
| P00-04 | Shared states | `#/states` | 9 | Not started | — | — |
| P00-05 | Design system | `#/system` | 11 | Not started | — | — |
| P00-06 | Tabish Riaz | `#/profile/about` | 28 | Not started | — | — |
| P00-07 | Tabish Riaz | `#/profile/account` | 25 | Not started | — | — |
| P00-08 | Tabish Riaz | `#/profile/notifications` | 24 | Not started | — | — |
| P00-09 | Tabish Riaz | `#/profile/appearance` | 28 | Not started | — | — |

**Dialogs** (3)

| Item | Status |
|---|---|
| Decline this invitation? | Not started |
| How search works | Not started |
| More | Not started |

**Flows (end-to-end tests)** (5)

| Item | Status |
|---|---|
| Start the day | Not started |
| Switch organization without losing place | Not started |
| Find anything | Not started |
| Act on a notification | Not started |
| Edit my profile | Not started |

### P01 · Office (39 pages)

| # | Page | Route | Controls | Status | Test | Result |
|---|---|---|---|---|---|---|
| P01-01 | Home | `#/office/home` | 45 | Not started | — | — |
| P01-02 | Funnels overview | `#/office/funnels` | 18 | Not started | — | — |
| P01-03 | Customer Avatars (list) | `#/office/avatars` | 13 | Not started | — | — |
| P01-04 | New avatar: import or blank, choose 3D look | `#/office/avatar-new` | 18 | Not started | — | — |
| P01-05 | Avatar profile | `#/office/avatar/john` | 25 | Not started | — | — |
| P01-06 | Avatar full profile | `#/office/avatar/john/deep` | 56 | Not started | — | — |
| P01-07 | Avatar: edit chapters | `#/office/avatar/john/edit` | 50 | Not started | — | — |
| P01-08 | Avatar: use it | `#/office/avatar/john/use` | 24 | Not started | — | — |
| P01-09 | Avatar: evidence | `#/office/avatar/john/evidence` | 24 | Not started | — | — |
| P01-10 | Offers & Products | `#/office/offers` | 8 | Not started | — | — |
| P01-11 | New offer | `#/office/offer-new` | 39 | Not started | — | — |
| P01-12 | Stories | `#/office/stories` | 5 | Not started | — | — |
| P01-13 | New story | `#/office/story-new` | 35 | Not started | — | — |
| P01-14 | Brand Kits (many) | `#/office/brandkits` | 8 | Not started | — | — |
| P01-15 | New brand kit | `#/office/brandkit-new` | 36 | Not started | — | — |
| P01-16 | Brand kit | `#/office/brandkit/l2f` | 8 | Not started | — | — |
| P01-17 | Funnel Strategies | `#/office/strategies` | 8 | Not started | — | — |
| P01-18 | Default strategy template | `#/office/strategy-template` | 15 | Not started | — | — |
| P01-19 | Strategy document | `#/office/strategy/s1` | 35 | Not started | — | — |
| P01-20 | Documents with sections | `#/office/documents` | 23 | Not started | — | — |
| P01-21 | Team | `#/office/team` | 11 | Not started | — | — |
| P01-22 | Member | `#/office/member/SN` | 9 | Not started | — | — |
| P01-23 | Apps | `#/office/apps` | 17 | Not started | — | — |
| P01-24 | Admin: people | `#/office/admin/people` | 27 | Not started | — | — |
| P01-25 | Person: relationships + app/feature access | `#/office/admin/person/SN` | 53 | Not started | — | — |
| P01-26 | Teammate access | `#/office/admin/teammates` | 60 | Not started | — | — |
| P01-27 | Client access (owner only) | `#/office/admin/clients` | 32 | Not started | — | — |
| P01-28 | Roles | `#/office/admin/roles` | 16 | Not started | — | — |
| P01-29 | Access review | `#/office/admin/review` | 18 | Not started | — | — |
| P01-30 | Storage & version rules | `#/office/admin/storage` | 17 | Not started | — | — |
| P01-31 | Organization branding | `#/office/admin/branding` | 18 | Not started | — | — |
| P01-32 | Audit log | `#/office/admin/audit` | 15 | Not started | — | — |
| P01-33 | Projects | `#/office/projects` | 10 | Not started | — | — |
| P01-34 | Admin | `#/office/admin` | 27 | Not started | — | — |
| P01-35 | New funnel strategy | `#/office/strategy/new` | 35 | Not started | — | — |
| P01-36 | Layer2Funnels | `#/office/brandkit` | 8 | Not started | — | — |
| P01-37 | Funnel Done-For-You | `#/office/offer/dfy` | 8 | Not started | — | — |
| P01-38 | John | `#/office/avatar/john/profile` | 25 | Not started | — | — |
| P01-39 | market | `#/office/avatar/john/edit/market` | 33 | Not started | — | — |

**Sidebar menu items** (13)

| Item | Status |
|---|---|
| Home → `office/home` | Not started |
| Projects → `office/projects` | Not started |
| Funnels → `office/funnels` | Not started |
| Documents → `office/documents` | Not started |
| Team → `office/team` | Not started |
| Apps → `office/apps` | Not started |
| Admin → `office/admin` | Not started |
| Overview → `office/funnels` | Not started |
| Customer Avatars → `office/avatars` | Not started |
| Offers & Products → `office/offers` | Not started |
| Stories → `office/stories` | Not started |
| Brand Kits → `office/brandkits` | Not started |
| Funnel Strategies → `office/strategies` | Not started |

**Dialogs** (6)

| Item | Status |
|---|---|
| Add a chapter or section | Not started |
| Add a relationship | Not started |
| Invite someone | Not started |
| New customer avatar | Not started |
| New document section | Not started |
| Profile photo | Not started |

**Flows (end-to-end tests)** (7)

| Item | Status |
|---|---|
| Work through my day | Not started |
| Create a customer avatar from a document | Not started |
| Edit an avatar chapter | Not started |
| Create an offer / story / brand kit | Not started |
| Change the default strategy template | Not started |
| Give a teammate access to an app feature | Not started |
| Set which apps clients can use | Not started |

### P02 · Clients (34 pages)

| # | Page | Route | Controls | Status | Test | Result |
|---|---|---|---|---|---|---|
| P02-01 | All clients (table · grid · pipeline) | `#/clients/list` | 17 | Not started | — | — |
| P02-02 | Client overview | `#/clients/c/hk/Overview` | 26 | Not started | — | — |
| P02-03 | Work › Brand Base (submitted answers) | `#/clients/c/hk/Work/0` | 23 | Not started | — | — |
| P02-04 | Work › Strategy workspace | `#/clients/c/hk/Work/1` | 25 | Not started | — | — |
| P02-05 | Strategy › Customer Avatar | `#/clients/c/hk/Work/1/avatar` | 24 | Not started | — | — |
| P02-06 | Strategy › Offers | `#/clients/c/hk/Work/1/offers` | 22 | Not started | — | — |
| P02-07 | Strategy › Brand Kits | `#/clients/c/hk/Work/1/brand` | 23 | Not started | — | — |
| P02-08 | Work › Copy | `#/clients/c/hk/Work/2` | 29 | Not started | — | — |
| P02-09 | Work › Build | `#/clients/c/hk/Work/3` | 23 | Not started | — | — |
| P02-10 | Documents | `#/clients/c/hk/Documents` | 24 | Not started | — | — |
| P02-11 | Requests & Approvals | `#/clients/requests` | 17 | Not started | — | — |
| P02-12 | Request detail | `#/clients/r/r3` | 15 | Not started | — | — |
| P02-13 | SOPs | `#/clients/sops` | 14 | Not started | — | — |
| P02-14 | Settings | `#/clients/settings/stages` | 20 | Not started | — | — |
| P02-15 | Harry Kaye PT | `#/clients/c/hk/requests` | 15 | Not started | — | — |
| P02-16 | All clients | `#/clients/pipeline` | 19 | Not started | — | — |
| P02-17 | Tools | `#/clients/tools` | 10 | Not started | — | — |
| P02-18 | Settings | `#/clients/settings` | 20 | Not started | — | — |
| P02-19 | Harry Kaye PT | `#/clients/c/hk/Work` | 25 | Not started | — | — |
| P02-20 | Harry Kaye PT | `#/clients/c/hk/Requests & Approvals` | 15 | Not started | — | — |
| P02-21 | Harry Kaye PT | `#/clients/c/hk/Team Notes` | 15 | Not started | — | — |
| P02-22 | Harry Kaye PT | `#/clients/c/hk/Work/4` | 21 | Not started | — | — |
| P02-23 | Harry Kaye PT | `#/clients/c/hk/Work/1/strategy` | 23 | Not started | — | — |
| P02-24 | Harry Kaye PT | `#/clients/c/hk/Documents/Brand Base` | 24 | Not started | — | — |
| P02-25 | Harry Kaye PT | `#/clients/c/hk/Documents/Strategy` | 19 | Not started | — | — |
| P02-26 | Harry Kaye PT | `#/clients/c/hk/Documents/Copy` | 19 | Not started | — | — |
| P02-27 | Harry Kaye PT | `#/clients/c/hk/Documents/Build` | 18 | Not started | — | — |
| P02-28 | Harry Kaye PT | `#/clients/c/hk/Documents/Marketing` | 18 | Not started | — | — |
| P02-29 | Harry Kaye PT | `#/clients/c/hk/Documents/Contracts` | 19 | Not started | — | — |
| P02-30 | Settings | `#/clients/settings/statuses` | 17 | Not started | — | — |
| P02-31 | Settings | `#/clients/settings/brandbase` | 12 | Not started | — | — |
| P02-32 | Settings | `#/clients/settings/sections` | 14 | Not started | — | — |
| P02-33 | Settings | `#/clients/settings/notify` | 16 | Not started | — | — |
| P02-34 | Harry Kaye PT | `#/clients/c/hk/overview` | 15 | Not started | — | — |

**Sidebar menu items** (8)

| Item | Status |
|---|---|
| All clients → `clients/list` | Not started |
| Requests & Approvals 3 → `clients/requests` | Not started |
| SOPs → `clients/sops` | Not started |
| Tools → `clients/tools` | Not started |
| Settings → `clients/settings` | Not started |
| Requests & Approvals 2 → `clients/requests` | Not started |
| Requests & Approvals 1 → `clients/requests` | Not started |
| Requests & Approvals → `clients/requests` | Not started |

**Dialogs** (7)

| Item | Status |
|---|---|
| Add a section | Not started |
| Add to Strategy | Not started |
| New SOP | Not started |
| New client | Not started |
| New folder | Not started |
| New request | Not started |
| Why was ${c.n} lost? | Not started |

**Flows (end-to-end tests)** (5)

| Item | Status |
|---|---|
| Add and qualify a client | Not started |
| Deliver through the stages | Not started |
| Ask a client to approve copy | Not started |
| Create an SOP | Not started |
| Preview what the client sees | Not started |

### P03 · Projects (17 pages)

| # | Page | Route | Controls | Status | Test | Result |
|---|---|---|---|---|---|---|
| P03-01 | Home | `#/projects/home` | 50 | Not started | — | — |
| P03-02 | My Work | `#/projects/mywork` | 42 | Not started | — | — |
| P03-03 | Workload | `#/projects/workload` | 64 | Not started | — | — |
| P03-04 | Portfolio | `#/projects/portfolio` | 17 | Not started | — | — |
| P03-05 | Files (new) | `#/projects/files` | 28 | Not started | — | — |
| P03-06 | All projects | `#/projects/all` | 30 | Not started | — | — |
| P03-07 | Trash | `#/projects/trash` | 14 | Not started | — | — |
| P03-08 | Overview | `#/projects/p/p1/overview` | 35 | Not started | — | — |
| P03-09 | List | `#/projects/p/p1/list` | 85 | Not started | — | — |
| P03-10 | Board | `#/projects/p/p1/board` | 50 | Not started | — | — |
| P03-11 | Calendar | `#/projects/p/p1/calendar` | 70 | Not started | — | — |
| P03-12 | Timeline | `#/projects/p/p1/timeline` | 39 | Not started | — | — |
| P03-13 | Report | `#/projects/p/p1/report` | 26 | Not started | — | — |
| P03-14 | Docs & links | `#/projects/p/p1/docs` | 34 | Not started | — | — |
| P03-15 | Collection | `#/projects/p/p1/collection` | 43 | Not started | — | — |
| P03-16 | Archived project | `#/projects/p/p5/overview` | 36 | Not started | — | — |
| P03-17 | Mindful Money course launch | `#/projects/p/p2/files` | 25 | Not started | — | — |

**Sidebar menu items** (11)

| Item | Status |
|---|---|
| Home → `projects/home` | Not started |
| My Work 7 → `projects/mywork` | Not started |
| Workload → `projects/workload` | Not started |
| Portfolio → `projects/portfolio` | Not started |
| Files → `projects/files` | Not started |
| All projects → `projects/all` | Not started |
| Harry Kaye quiz funnel 8 → `projects/p/:project/list` | Not started |
| Mindful Money course launch 5 → `projects/p/:project/list` | Not started |
| L2F website refresh 5 → `projects/p/:project/list` | Not started |
| Funnel Done Right Challenge 5 → `projects/p/:project/list` | Not started |
| My learning plan 1 → `projects/p/:project/list` | Not started |

**Dialogs** (14)

| Item | Status |
|---|---|
| Add a view | Not started |
| Add link or embed | Not started |
| Add section | Not started |
| Add task | Not started |
| Assignees | Not started |
| Delete forever? | Not started |
| Edit project | Not started |
| Fields | Not started |
| Keyboard shortcuts | Not started |
| Log time | Not started |
| New in this project | Not started |
| New project | Not started |
| Project members | Not started |
| Quick add | Not started |

**Flows (end-to-end tests)** (6)

| Item | Status |
|---|---|
| Create a project | Not started |
| Plan and run tasks in List | Not started |
| Track time | Not started |
| Check my work and workload | Not started |
| Find a file attached anywhere | Not started |
| Archive / trash / restore | Not started |

### P04 · Tasks (7 pages)

| # | Page | Route | Controls | Status | Test | Result |
|---|---|---|---|---|---|---|
| P04-01 | Today | `#/tasks/today` | 16 | Not started | — | — |
| P04-02 | Upcoming | `#/tasks/upcoming` | 6 | Not started | — | — |
| P04-03 | Inbox | `#/tasks/inbox` | 7 | Not started | — | — |
| P04-04 | Teammates | `#/tasks/teammates` | 12 | Not started | — | — |
| P04-05 | My tasks (blocks, show completed) | `#/tasks/list/mine` | 35 | Not started | — | — |
| P04-06 | Team list with access | `#/tasks/list/team` | 29 | Not started | — | — |
| P04-07 | Ayesha Raza | `#/tasks/teammates/AR` | 6 | Not started | — | — |

**Sidebar menu items** (8)

| Item | Status |
|---|---|
| Today 4 → `tasks/today` | Not started |
| Upcoming → `tasks/upcoming` | Not started |
| Inbox 2 → `tasks/inbox` | Not started |
| Teammates → `tasks/teammates` | Not started |
| My tasks 4 → `tasks/list/:list` | Not started |
| Funnel Challenge 3 → `tasks/list/:list` | Not started |
| Build team 2 → `tasks/list/:list` | Not started |
| Content ideas 3 → `tasks/list/:list` | Not started |

**Dialogs** (4)

| Item | Status |
|---|---|
| Add a task | Not started |
| Assign people | Not started |
| New list or folder | Not started |
| Who can open “${TL[k].n}” | Not started |

**Flows (end-to-end tests)** (5)

| Item | Status |
|---|---|
| Capture and finish today's tasks | Not started |
| Run a team list | Not started |
| Give a task to a teammate | Not started |
| Time a task | Not started |
| Send a task to a project | Not started |

### P05 · Drive and editors (13 pages)

| # | Page | Route | Controls | Status | Test | Result |
|---|---|---|---|---|---|---|
| P05-01 | Home | `#/drive/home` | 47 | Not started | — | — |
| P05-02 | Library | `#/drive/mydrive` | 43 | Not started | — | — |
| P05-03 | Personal | `#/drive/personal` | 18 | Not started | — | — |
| P05-04 | Docs editor | `#/drive/edit/doc/sop` | 64 | Not started | — | — |
| P05-05 | Sheets editor | `#/drive/edit/sheet/cal` | 265 | Not started | — | — |
| P05-06 | Slides editor | `#/drive/edit/slides/deck` | 44 | Not started | — | — |
| P05-07 | Image editor | `#/drive/edit/image/hero` | 56 | Not started | — | — |
| P05-08 | PDF editor | `#/drive/edit/pdf/prop` | 50 | Not started | — | — |
| P05-09 | Delivery My Drive Delivery | `#/drive/f/delivery` | 24 | Not started | — | — |
| P05-10 | Recent | `#/drive/recent` | 38 | Not started | — | — |
| P05-11 | Starred | `#/drive/starred` | 18 | Not started | — | — |
| P05-12 | Shared with me | `#/drive/shared` | 22 | Not started | — | — |
| P05-13 | Trash | `#/drive/trash` | 6 | Not started | — | — |

**Sidebar menu items** (7)

| Item | Status |
|---|---|
| Home → `drive/home` | Not started |
| Library → `drive/mydrive` | Not started |
| Personal → `drive/personal` | Not started |
| Recent → `drive/recent` | Not started |
| Starred → `drive/starred` | Not started |
| Shared with me 3 → `drive/shared` | Not started |
| Trash → `drive/trash` | Not started |

**Dialogs** (4)

| Item | Status |
|---|---|
| Create new | Not started |
| Move ${DRV.sel.size} item${DRV.sel.size>1?'s':''} to Trash? | Not started |
| Move to ${v}? | Not started |
| Reset to original? | Not started |

**Flows (end-to-end tests)** (5)

| Item | Status |
|---|---|
| Find and open a file | Not started |
| Move a file between Library and Personal | Not started |
| Write a document | Not started |
| Edit an image or PDF and undo everything | Not started |
| Select several files | Not started |

### P06 · Planner (17 pages)

| # | Page | Route | Controls | Status | Test | Result |
|---|---|---|---|---|---|---|
| P06-01 | Home | `#/planner/home` | 17 | Not started | — | — |
| P06-02 | My work | `#/planner/mywork` | 16 | Not started | — | — |
| P06-03 | Plans | `#/planner/plans` | 12 | Not started | — | — |
| P06-04 | Plan: Planner view | `#/planner/plan/map` | 36 | Not started | — | — |
| P06-05 | Plan: Timeline | `#/planner/plan/timeline` | 23 | Not started | — | — |
| P06-06 | Plan: Reviews | `#/planner/plan/reviews` | 17 | Not started | — | — |
| P06-07 | Plan: Settings | `#/planner/plan/settings` | 27 | Not started | — | — |
| P06-08 | Alignment | `#/planner/alignment` | 17 | Not started | — | — |
| P06-09 | Reports | `#/planner/reports` | 13 | Not started | — | — |
| P06-10 | Strategy map (redesigned) | `#/planner/model/map` | 39 | Not started | — | — |
| P06-11 | Objective kinds | `#/planner/model/kinds` | 15 | Not started | — | — |
| P06-12 | KPI types | `#/planner/model/kpi` | 15 | Not started | — | — |
| P06-13 | Focus areas | `#/planner/model/fa` | 14 | Not started | — | — |
| P06-14 | Time horizons | `#/planner/model/horizons` | 14 | Not started | — | — |
| P06-15 | Templates | `#/planner/model/tpl` | 14 | Not started | — | — |
| P06-16 | First 1000 Followers on Facebook | `#/planner/plan/p1/builder` | 16 | Not started | — | — |
| P06-17 | Strategy model | `#/planner/model` | 39 | Not started | — | — |

**Sidebar menu items** (6)

| Item | Status |
|---|---|
| Home → `planner/home` | Not started |
| My work → `planner/mywork` | Not started |
| Plans → `planner/plans` | Not started |
| Alignment → `planner/alignment` | Not started |
| Reports → `planner/reports` | Not started |
| Strategy model → `planner/model` | Not started |

**Dialogs** (7)

| Item | Status |
|---|---|
| Add KPI | Not started |
| Focus area | Not started |
| New objective | Not started |
| New strategy | Not started |
| Plan | Not started |
| Record reading | Not started |
| Turn into work | Not started |

**Flows (end-to-end tests)** (5)

| Item | Status |
|---|---|
| Review plan health | Not started |
| Add and update an objective | Not started |
| Build a strategy | Not started |
| Turn a plan into a project | Not started |
| Run a review | Not started |

### P07 · Funnel Mapper (10 pages)

| # | Page | Route | Controls | Status | Test | Result |
|---|---|---|---|---|---|---|
| P07-01 | Home | `#/fmp/home` | 26 | Not started | — | — |
| P07-02 | Clients | `#/fmp/clients` | 14 | Not started | — | — |
| P07-03 | Client | `#/fmp/client/sc` | 19 | Not started | — | — |
| P07-04 | Funnels | `#/fmp/funnels` | 23 | Not started | — | — |
| P07-05 | Editor | `#/fmp/funnel/pt` | 64 | Not started | — | — |
| P07-06 | Reports | `#/fmp/funnel/pt/reports` | 43 | Not started | — | — |
| P07-07 | Templates | `#/fmp/templates` | 15 | Not started | — | — |
| P07-08 | Trash | `#/fmp/trash` | 11 | Not started | — | — |
| P07-09 | Settings | `#/fmp/settings` | 19 | Not started | — | — |
| P07-10 | Help & shortcuts | `#/fmp/help` | 9 | Not started | — | — |

**Sidebar menu items** (10)

| Item | Status |
|---|---|
| Home → `fmp/home` | Not started |
| Clients 4 → `fmp/clients` | Not started |
| Funnels 6 → `fmp/funnels` | Not started |
| Templates → `fmp/templates` | Not started |
| Trash 3 → `fmp/trash` | Not started |
| Sam Carter → `fmp/client/:client` | Not started |
| Priya Nair → `fmp/client/:client` | Not started |
| Marcus Lee → `fmp/client/:client` | Not started |
| Settings → `fmp/settings` | Not started |
| Help & shortcuts ? → `fmp/help` | Not started |

**Dialogs** (3)

| Item | Status |
|---|---|
| New client | Not started |
| New funnel | Not started |
| Share funnel | Not started |

**Flows (end-to-end tests)** (3)

| Item | Status |
|---|---|
| Map a funnel for a client | Not started |
| Create a client once, everywhere | Not started |
| Share a funnel | Not started |

### P08 · Client Portal (5 pages)

| # | Page | Route | Controls | Status | Test | Result |
|---|---|---|---|---|---|---|
| P08-01 | Home | `#/portal/home` | 11 | Not started | — | — |
| P08-02 | Requests | `#/portal/requests` | 10 | Not started | — | — |
| P08-03 | Approvals | `#/portal/approvals` | 10 | Not started | — | — |
| P08-04 | My notes | `#/portal/notes` | 9 | Not started | — | — |
| P08-05 | Untitled note | `#/portal/note/new` | 8 | Not started | — | — |

**Dialogs** (1)

| Item | Status |
|---|---|
| Request changes | Not started |

**Flows (end-to-end tests)** (3)

| Item | Status |
|---|---|
| Client approves a version | Not started |
| Client answers a request | Not started |
| Team previews the portal | Not started |

### P09 · Whiteboard (5 pages)

| # | Page | Route | Controls | Status | Test | Result |
|---|---|---|---|---|---|---|
| P09-01 | Boards and folders | `#/whiteboard/home` | 17 | Not started | — | — |
| P09-02 | Folder | `#/whiteboard/folder/f1` | 8 | Not started | — | — |
| P09-03 | Full-page board | `#/whiteboard/board/b1` | 38 | Not started | — | — |
| P09-04 | All boards | `#/whiteboard/starred` | 17 | Not started | — | — |
| P09-05 | All boards | `#/whiteboard/tpl` | 17 | Not started | — | — |

**Sidebar menu items** (6)

| Item | Status |
|---|---|
| All boards → `whiteboard/home` | Not started |
| Starred → `whiteboard/starred` | Not started |
| Templates → `whiteboard/tpl` | Not started |
| Harry Kaye PT 2 → `whiteboard/folder/:id` | Not started |
| Funnel Challenge 3 → `whiteboard/folder/:id` | Not started |
| Team retros 1 → `whiteboard/folder/:id` | Not started |

**Dialogs** (1)

| Item | Status |
|---|---|
| New folder | Not started |

**Flows (end-to-end tests)** (2)

| Item | Status |
|---|---|
| Start a board from a template | Not started |
| Organize boards in folders | Not started |

### P10 · Forms (4 pages)

| # | Page | Route | Controls | Status | Test | Result |
|---|---|---|---|---|---|---|
| P10-01 | Forms | `#/forms/list` | 8 | Not started | — | — |
| P10-02 | Builder | `#/forms/b/quiz` | 56 | Not started | — | — |
| P10-03 | Responses | `#/forms/subs` | 6 | Not started | — | — |
| P10-04 | Templates | `#/forms/tpl` | 8 | Not started | — | — |

**Sidebar menu items** (3)

| Item | Status |
|---|---|
| Forms → `forms/list` | Not started |
| Responses 3 → `forms/subs` | Not started |
| Templates → `forms/tpl` | Not started |

**Dialogs** (2)

| Item | Status |
|---|---|
| Leave without saving? | Not started |
| Publish form | Not started |

**Flows (end-to-end tests)** (2)

| Item | Status |
|---|---|
| Build and publish a form | Not started |
| Read responses | Not started |

### P11 · Value Ladder (3 pages)

| # | Page | Route | Controls | Status | Test | Result |
|---|---|---|---|---|---|---|
| P11-01 | Ladders | `#/ladder/list` | 5 | Not started | — | — |
| P11-02 | Ladder | `#/ladder/map/hk` | 8 | Not started | — | — |
| P11-03 | History | `#/ladder/history` | 2 | Not started | — | — |

**Sidebar menu items** (2)

| Item | Status |
|---|---|
| Ladders → `ladder/list` | Not started |
| History → `ladder/history` | Not started |

**Dialogs** (2)

| Item | Status |
|---|---|
| Leave without saving? | Not started |
| Publish form | Not started |

**Flows (end-to-end tests)** (1)

| Item | Status |
|---|---|
| Model a ladder | Not started |

### P12 · Social Planner (7 pages)

| # | Page | Route | Controls | Status | Test | Result |
|---|---|---|---|---|---|---|
| P12-01 | Calendar | `#/social/calendar` | 14 | Not started | — | — |
| P12-02 | Pipeline | `#/social/board` | 12 | Not started | — | — |
| P12-03 | Approvals | `#/social/approvals` | 6 | Not started | — | — |
| P12-04 | Posts | `#/social/posts` | 14 | Not started | — | — |
| P12-05 | Campaigns | `#/social/campaigns` | 4 | Not started | — | — |
| P12-06 | Queue | `#/social/queue` | 8 | Not started | — | — |
| P12-07 | Channels | `#/social/channels` | 5 | Not started | — | — |

**Sidebar menu items** (7)

| Item | Status |
|---|---|
| Calendar → `social/calendar` | Not started |
| Pipeline → `social/board` | Not started |
| Posts → `social/posts` | Not started |
| Campaigns → `social/campaigns` | Not started |
| Queue → `social/queue` | Not started |
| Approvals 1 → `social/approvals` | Not started |
| Channels → `social/channels` | Not started |

**Dialogs** (2)

| Item | Status |
|---|---|
| Leave without saving? | Not started |
| Publish form | Not started |

**Flows (end-to-end tests)** (1)

| Item | Status |
|---|---|
| Plan and approve a post | Not started |

### P13 · Layer 2 Agents (9 pages)

| # | Page | Route | Controls | Status | Test | Result |
|---|---|---|---|---|---|---|
| P13-01 | Agents | `#/agents/home` | 7 | Not started | — | — |
| P13-02 | Meeting Intelligence | `#/agents/meeting/new` | 15 | Not started | — | — |
| P13-03 | Ask | `#/agents/ask` | 7 | Not started | — | — |
| P13-04 | Meeting Intelligence | `#/agents/meetings` | 8 | Not started | — | — |
| P13-05 | Access & settings | `#/agents/settings` | 4 | Not started | — | — |
| P13-06 | Weekly team call | `#/agents/meeting/m1` | 10 | Not started | — | — |
| P13-07 | Weekly team call | `#/agents/meeting/m1/notes` | 10 | Not started | — | — |
| P13-08 | Weekly team call | `#/agents/meeting/m1/transcript` | 11 | Not started | — | — |
| P13-09 | Weekly team call | `#/agents/meeting/m1/actions` | 12 | Not started | — | — |

**Sidebar menu items** (4)

| Item | Status |
|---|---|
| Agents → `agents/home` | Not started |
| Meeting Intelligence → `agents/meetings` | Not started |
| Ask → `agents/ask` | Not started |
| Access & settings → `agents/settings` | Not started |

**Flows (end-to-end tests)** (2)

| Item | Status |
|---|---|
| Record a meeting (preview) | Not started |
| Ask about my records (preview) | Not started |

### Cross-cutting (every app)

| Item | Status |
|---|---|
| Every navigation element is a real link (Ctrl/middle-click open new tabs) | Not started |
| Search returns only permitted items (two users × two orgs test) | Not started |
| Notifications badge counts correct per org | Not started |
| Org switch keeps the current page; no data crosses orgs | Not started |
| Every page: loading, empty, no results, error (≤10 s), permission denied, read-only, archived, offline, conflict | Not started |
| No text < 12 px (except initials/badges); right panels per 01 §5 | Not started |
| No horizontal page scroll at 390, 834, 1366, 1440 px | Not started |
| Touch targets ≥44 px on touch devices | Not started |
| Light and dark; L2F and Aurj tokens | Not started |
| Keyboard: focus visible, all actions reachable, Escape closes overlays | Not started |
| No "Funnel Mapper Pro" in any UI string (grep test) | Not started |
| No component class shared across apps unless it is a shared component (prevents v7 bugs) | Not started |

_Total pages: 179._
