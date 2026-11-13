# Prompt P04 · paste into Claude Code

You are Claude Code working in the Layer2Funnels ecosystem repository (`layer2funnels-bot/l2f-ecosystem`). The design is final and approved. Read these files from `docs/design/v7/` before you touch code:
- `README_START_HERE.md`, `docs/00_ECOSYSTEM_OVERVIEW.md`, `docs/01_DESIGN_SYSTEM.md`, `docs/02_GLOBAL_SHELL.md`, `docs/03_PERMISSIONS_DATA_INTEGRATIONS.md`, `docs/04_OPEN_DECISIONS.md`
- docs/apps/12_TASKS.md
- The manager’s process document `reference/Layer2Funnels_Claude_Code_Design_to_Implementation_Handoff.docx` (how to work: plan, then build, test, report, get approval).
Visual reference: open `ecosystem-v7.html` (routes listed in `assets/routes.json`; screenshots in `screens/desktop/` and `screens/phone/`). Exact CSS/markup/animation: `prototype-source/` (later files override earlier ones: v5 → v6 → v7). Icons: `assets/icons.svg`. Tokens: `assets/tokens.css` → merge into `packages/ui/tokens.json` and `apps/web/css/v4.css`.

Rules:
1. Preserve every existing feature. Status marks in the brief: [E] keep, [R] redesign, [N] build new, [F] future (do not build; show "Later" only where the brief says).
2. The prototype's data, toasts and fake actions are not product behaviour. Build real data, API, RLS and tests.
3. Permissions are enforced in the database/API (default deny), never only in the UI. Layer2Funnels and Aurj data never mix.
4. Use the repo's stack and patterns; no broad unrelated refactors; reversible migrations; no destructive data change without Tabish's approval.
5. Navigation uses real links (Ctrl-click / middle-click / right-click open in new tab).
6. Every visible control works or is clearly marked "Later". Loading, empty, error, permission-denied, read-only states on every page; nothing spins forever (10 s → error state).
7. Check 1366, 768 and 390 px and light/dark for both organizations.

Work plan for this session:
A. Write `docs/implementation/TASKS_PLAN.md`: page/route inventory mapped to code files, what exists vs new, data/API/migration changes, permissions, tests, risks, questions. Stop and show me the plan summary; wait for my "go".
B. Build in small commits. Run the existing test suites plus new tests after each step.
C. Finish with `docs/implementation/TASKS_REPORT.md`: done vs planned, files changed, migrations, tests and results, screenshots of each page next to the prototype route, known issues, decisions needed.

Scope: build the **new Tasks app** from scratch (manifest, migration, API, RLS, UI, tests) exactly as 12_TASKS.md: Today with capture, Upcoming, Inbox, Teammates (People / Tasks I gave), Personal and Team lists and folders, blocks, completed tasks hidden in place with Show/Hide completed (n), timer per task via the shared timer service (one running timer across Tasks and Projects), multiple assignees, list/folder access with multi-select, right-click menu, List/Board/Calendar views (no Table, no Mind map), Send to a project, private tasks, notifications. Sidebar 15.5 px; list typography as the prototype (approved).
