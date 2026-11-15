# Owner's brief — Ecosystem Quality Recovery, Tasks Fixes & Final Handoff (15 Nov 2026, verbatim in substance)

> Given by the owner after reviewing the live site. This is the **whole assignment for the next session**. Do not start Drive (or any
> other app) until every part below is done, verified and handed off. Reference files are in this folder (see the end).

We need to change our development approach. P00 and P01 are complete and Tasks is implemented, but the live application has serious
problems. I do not want another version that looks finished but contains broken functionality, incomplete workflows, poor performance,
or design mistakes. **Audit, repair, test and stabilize the existing ecosystem before handing it back.** Do not just fix the listed
problems — proactively find problems across the entire implemented scope.

## PART 1 — Complete ecosystem performance audit
Every page loads slowly. Investigate: initial load; navigation between apps and between pages; database queries and repeated requests;
API response times; large JS bundles / unnecessary dependencies; repeated rendering; unnecessary fetching; sequential requests that could
run in parallel; authentication and permission checks; loading states/skeletons; large images/fonts/assets; client- and server-side
caching; database indexes and inefficient queries; full-page reloads; third-party integrations delaying rendering.

Requirements: 1) no unnecessary reloads when navigating; 2) load only the data the current page needs; 3) no repeated fetching of the
same data; 4) pagination / appropriate loading for large datasets; 5) optimize queries without weakening security; 6) safe caching;
7) immediate feedback on interaction; 8) don't block the whole UI when one component loads; 9) no stale or wrongly shared cached data;
10) preserve organization and client isolation.

**Measure before and after.** Write a performance report with actual measurements, problems, improvements and remaining bottlenecks.
Evidence, not claims.

## PART 2 — Global Launcher
1. **Notification icon colour** is wrong — correct to the V8 references and icon/colour system; check default, hover, active, unread.
2. **Reorder apps (drag and drop)** for admins: order saved; persists after refresh / sign-in; per organization; other users see the
   org order; unauthorized users cannot change it (backend-enforced); visual feedback while dragging; follow V8.

## PART 3 — Office
**A. Organization settings** (Office Admin): authorized admin can change org name, upload/change logo, preview, save, and see the new
name/logo throughout the ecosystem. Organization-specific; never mix Aurj and Layer2Funnels.

**B. Avatar Studio — complete editor.** Adding chapters currently doesn't work.
1. *Flexible structure*: an avatar may have 2, 5, 12, 20 or any number of sections. **Never hardcode 12.** A 5-section document imports
   as 5 sections; Full Profile shows those 5; "New section" adds more (pick an existing section type or a custom one); sections can be
   removed, renamed, edited, reorganized.
2. *Import and mapping*: read the Word/PDF; detect its real headings and sections; extract content under each; map to avatar chapters;
   **preserve unmatched content**; allow custom chapters; allow changing the mapping; review extracted content before creating. Never
   silently discard content; never force content into the wrong section.
3. *Complete editor*: edit any section, add, delete, rename, reorder, edit content, custom sections, save, preview. All persisted.
4. *Profile vs Full Profile*: Profile = clear visual avatar + **selected** sections; add sections to Profile directly; choose which Full
   Profile sections appear on Profile; remove from Profile without deleting from Full Profile; proper preview. Full Profile = all sections.
5. *Default configuration* (Avatar Studio settings): default sections, custom defaults, remove, reorder, choose default Profile sections.
   Defaults apply to **new** avatars only; never overwrite existing ones.
6. *Brand Kit fonts*: allow typing any font family name; live preview; validate it can load; don't show a font as available if it can't render.

**C. Stories** — creating/saving is unreliable. Fix and test end to end: create, choose type, save, edit, update content, permission and
consent settings, attach consent evidence, "use in" choices, back to list, refresh and confirm it persisted. Verify the database operation.

**D. Navigation after save** — Brand Kit, Story and other full-page create/edit screens: on success show feedback, return to the list/parent,
refresh data, new/updated item visible. On failure stay on the form with a useful error; never navigate away and lose work.

**E. Default Funnel Strategy template** — admin setting to choose it; used for future strategies; existing strategies unchanged.

**F. Documents — add from Drive** — browse/search eligible Drive files, select, add to the right Office Documents section, keep the
original Drive file, correct permissions, avoid duplicates, make clear whether linked or copied; respect org and client access rules.

**G. Teammate Access switches** are slow, laggy and sometimes error. Requirements: immediate feedback; reliable save; correct
loading/disabled states; clear success/error; no double submissions; correct after refresh and when switching people; concurrent
updates handled; backend authorization on every change. **The visible switch must always match the saved permission** — never show
success when the backend failed.

**H. Client access to Office apps** — clients get only the Office features explicitly granted; client data isolated; no internal org
data or internal notes visible; backend enforces everything (hiding UI is not security). Check interaction with the Client Access Matrix.

**I. Remove the Access Review feature** ("Every 90 days, owners and admins confirm that people still need the access they have…").
Remove its UI, reminders, scheduled behaviour and safe-to-remove supporting code/DB structures. Do **not** remove normal permissions,
audit log or access management.

## PART 4 — Tasks: complete repair
Tasks is unreliable on the **live** site (works on preview), and the owner dislikes how it works: functional and design mistakes; V8
features missing, e.g. **show/hide completed tasks**. Do not treat the current build as the reference — compare against the original V8
Tasks spec (`docs/design/v8/…/01_APPLICATIONS/04_TASKS`).
1. Full functional audit: Today, Upcoming, Inbox, Teammates, personal and team tasks, lists, folders, create/edit/complete/reopen/delete,
   assignment, due dates, descriptions/details, permissions and sharing, search and filters, everything else in V8.
2. Completed-task visibility per V8 (hiding must never delete).
3. New list or folder dialog: switch List/Folder, name, where it belongs, parent folder, people/groups, permissions, everyone; create;
   correct location; reopen and verify saved data; fix visuals and interaction to V8.
4. **Live-site failure**: investigate the real production failure — endpoints, migrations, RLS, auth, org/workspace context, permissions,
   missing production config, frontend/backend contract mismatches, production-only errors, preview vs live differences.
5. Full V8 design fidelity: layout, typography, weights, spacing, alignment, sizes, colours, icons, borders, shadows, hover/active,
   dialogs, menus, responsive, loading/empty states. No own interpretation where V8 defines it.

## PART 5 — Proactive quality audit (mandatory)
Audit P00 Shell, P01 Office and Tasks page by page against V8: pages exist; functions exist; every button works; forms save and reload;
dialogs/menus behave; feedback on every interaction; permissions enforced; data persists after refresh; navigation; responsive;
empty/loading/error/success states; no obvious visual differences. Test invalid input, permission failures, network failures, empty
data, repeated actions — not only the happy path. Keep a concise **audit tracker**: feature/page · expected · actual · defect · fix ·
verification. Rendering is not completion.

## PART 6 — Testing and release quality
Automated (existing architecture): critical workflows, DB operations, API, permissions/RLS, org isolation, avatar import and editing,
stories, brand kits, Office Documents, teammate access, Tasks, Launcher ordering, production-specific behaviour. Browser tests of real
workflows. **Production verification** with an authorized safe test organization/account; no destructive changes to real data; if
production can't be accessed, document exactly what was not verified — never claim live is fixed without testing it.
Before declaring completion: all critical/high defects fixed; core workflows work; major visual mismatches fixed; production-only
failures fixed; permission boundaries verified; no known data loss. Report remaining medium/low issues honestly. Don't claim zero bugs.

## PART 7 — Change management
Inspect before changing; preserve working functionality; don't rebuild working components; no superficial UI fixes over backend
problems; fix root causes; follow existing architecture and API contracts; strict Aurj/Layer2Funnels, organization and client isolation;
security in the backend; preserve all existing work and migrations; no unrelated migrations; don't modify production data unnecessarily;
**no merge or deploy without the owner's explicit authorization**; no incomplete application PRs; don't waste tokens re-reading docs or
re-running identical full suites. Keep concise progress notes and a defect tracker.

## PART 8 — Avatar reference document
`Dream_Customer_Avatar_Farhat_V1.0.docx` (this folder) is the reference for import and section mapping. Its sections are a reference
structure, **not a fixed schema**: any number of sections; the uploaded document decides the avatar's initial structure; custom sections
possible; defaults configurable; Profile visibility independently configurable.

## PART 9 — Update the handoff files
Update `MASTER_HANDOFF.md`, `NEXT_SESSION_START_HERE.md`, `CURRENT_PROJECT_STATUS.md` with: P00, P01 and Tasks work and repairs; key
technical decisions; performance audit and measurements; migrations and verification; defects and fixes; tests and results; remaining
issues; branches, commits, uncommitted/unpushed work, PR status; production verification status; exact next application and first task.

**Approved sequence (new numbering):** P00 Foundation and Global Shell · P01 Office · **P02 Projects** · **P03 Tasks** · P04 Drive ·
P05 Planner · P06 Clients · P07 Funnel Mapper · P08 Portal · P09 Whiteboard · P10 Forms · P11 Value Ladder · P12 Social Planner ·
P13 Agents · P14 Final Ecosystem Verification.
Tasks was built as "P02" — document it as **P03** without losing or needlessly renaming existing work (branch `p02-tasks`, migration
0059 keep their names). **Projects (P02) is NOT rebuilt to V8** — do not mark it complete. Owner's explicit instruction: **after this
recovery, the following session starts Drive (P04)** — record this as a deliberate sequence exception (Projects deferred).

## PART 10 — Final completion report
1 performance problems + measured gains · 2 Launcher · 3 Office · 4 Avatar Studio · 5 Stories and Brand Kits · 6 Documents/Drive ·
7 teammate and client permissions · 8 Access Review removal · 9 Tasks · 10 other defects found/fixed · 11 automated and browser tests ·
12 live production verification · 13 migration status · 14 remaining issues · 15 handoff file locations · 16 branches/commits/PRs ·
17 exact first task for the next session. **Do not start another application in this session.**

## Reference files (this folder)
- `Dream_Customer_Avatar_Farhat_V1.0.docx` — avatar reference document (35 Word headings).
- `screenshots/avatar-profile-live.png` — live Avatar Profile. Visible defects: the "At a glance" card shows the document's table header
  ("Attribute / Detail") and a note ("confirm with 5 real Johns before locking") as data rows, and a version line ("v1.0 DRAFT Date
  drafted…") as a field; the floating labels around the avatar overlap each other and the face; "Where they are now", "Pays for",
  "Scared of" are empty although the document has that content; "Wants" mixes notes and rules into the list.
- `screenshots/avatar-full-profile-live.webp` — live Full Profile: chapters 1, 2, 8 etc. empty ("Not filled yet") while the content sits
  in unmatched later sections (12–21); the import kept document sections but mapping is weak.
- `screenshots/avatar-load-error-live.png` — live "We couldn't load this" on a Customer avatar page (a production-only failure to reproduce first).
- `screenshots/screencapture-office-tabishriaz-*.png`, `ScreenShot Tool-*.png` — the owner's live captures of Office/Tasks with the problems above.
