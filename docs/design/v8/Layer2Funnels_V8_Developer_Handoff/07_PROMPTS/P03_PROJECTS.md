# Prompt P03 · Projects · paste into Claude Code

You are Claude Code working in the Layer2Funnels ecosystem repository (`layer2funnels-bot/l2f-ecosystem`). The design is **V8 "Ledger"**, final and approved. Put this package at `docs/design/v8/` and read, before touching code:
- `CLAUDE_CODE_START_HERE.md` and, in `00_MASTER_DOCUMENTATION/`: `00_ECOSYSTEM_OVERVIEW.md`, `01_DESIGN_SYSTEM.md`, `02_GLOBAL_SHELL.md`, `03_PERMISSIONS_DATA_INTEGRATIONS.md`, `04_OPEN_DECISIONS.md`, `05_V8_IMPLEMENTATION_MASTER_GUIDE.md`
- All seven files in `01_APPLICATIONS/03_PROJECTS/` (start with `APP_OVERVIEW.md`; the authoritative brief is `FEATURES_AND_FUNCTIONALITY.md` §2)
- The manager's process document `09_FINAL_HANDOFF/MANAGER_PROCESS_Layer2Funnels_Claude_Code_Design_to_Implementation_Handoff.docx` (how to work: plan, then build, test, report, get approval).
Visual reference: `08_PROTOTYPE_AND_SOURCE/ecosystem-v8.html` (open `#/map`) and the screenshots in `06_SCREENSHOTS_AND_REFERENCES/v8/{desktop-1440,tablet-834,phone-390}/03_PROJECTS/` plus `overlays-1440/03_PROJECTS__*.jpg`. Exact CSS/markup: `08_PROTOTYPE_AND_SOURCE/prototype-source/` (later files override earlier: base → v4 → v5 → v6 → v7 → v8). Tokens: `02_DESIGN_SYSTEM/tokens.css` → merge into `packages/ui/tokens.json` and the repo stylesheet. Icons: `03_ASSETS/icons/`. Logos: `03_ASSETS/logos/`.

Rules:
1. Preserve every existing feature, page, menu, tab, button, workflow, route and permission. Status marks: [E] keep, [R] redesign, [N] build new, [F] future (do not build; show "Later" only where the brief says). Never merge, simplify or hide functions.
2. The prototype's data, toasts ("prototype stand-in") and fake actions are not product behaviour. Build real data, API, RLS and tests.
3. Permissions are enforced in the database/API (default deny), never only in the UI. Layer2Funnels and Aurj data never mix.
4. Use the repo's stack and patterns; no broad unrelated refactors; reversible migrations; no destructive data change without Tabish's approval.
5. Navigation uses real links (Ctrl-click / middle-click / right-click open in new tab).
6. Every visible control works or is clearly marked "Later". Loading, empty, error, permission-denied, read-only states on every page; nothing spins forever (10 s → error state).
7. Visual values come from V8 only (Geist, ruled panels, flat buttons, word + dot status, right-panel size system, 12 px text floor). Scope this app's component classes so they cannot leak into other apps. Do not reintroduce the anti-patterns in `01_DESIGN_SYSTEM.md` §9.
8. Unclear or missing? Use the assumption in `04_OPEN_DECISIONS.md`; otherwise ask. Do not build `V8_RECOMMENDATIONS.md` items.
9. Check 1440, 1366, 834 and 390 px, light and dark, both organizations.

Work plan for this session:
A. Write `docs/implementation/PROJECTS_PLAN.md`: every page in `01_APPLICATIONS/03_PROJECTS/PAGES_AND_NAVIGATION.md` mapped to code files, what exists vs new, data/API/migration changes, permissions, tests, risks, questions. Stop and show me the plan summary; wait for my "go".
B. Build in small commits. Run the existing test suites plus new tests after each step.
C. Finish with `docs/implementation/PROJECTS_REPORT.md`: done vs planned, files changed, migrations, tests and results, **a table with every page (from PAGES_AND_NAVIGATION.md) and every control listed for it: present / works / screenshot next to the V8 screenshot**, every flow in USER_FLOWS_AND_WORKFLOWS.md tested, known issues, decisions needed.

Scope: apply the ecosystem design to Projects V2 (`apps/projects/web`) by mapping `--pm-*` tokens and component CSS; keep every V2 feature, view, shortcut, the task panel structure and the original timer pill and quick actions.
New: Files page (all project/task files, references only), personal-project creation in the New project modal + the feature permission "Create personal projects", sidebar segmented filter and groups (Favourites, Clients folders, Organization, Personal), names 14.5 px, no horizontal scroll in the sidebar. Client choice in New project reads the Client service.


V8 visual requirements for this app (in addition to the design system):
- KPI strip is one ruled band with dividers, not six floating boxes.
- Home "My open tasks": compact grid matches visible columns so assignee avatars never sit on dates.
- Sidebar tree constrains its children: no horizontal overflow, names ellipsize.
- Workload heat map has a real grid layout (v7 printed rows as run-on text).
- Timer pill: red recording dot (8 px) — v7 rendered a red blob from a leaked class.
- Top-bar quick actions render as an icon row (v7 collapsed them via a leaked class).
- Task panel: values 15 px, labels 14 px, section titles 16 px, field rows 44 px, label column 150 px, title 24 px; subtasks show circular assignee avatars.

v7 defects that must not return: `00_MASTER_DOCUMENTATION/V8_BUG_FIXES.md` #5, #6, #7, #8, #9, #10.

Pages to deliver (17 documented pages, 16 templates): see `01_APPLICATIONS/03_PROJECTS/PAGES_AND_NAVIGATION.md`. Flows to test: `USER_FLOWS_AND_WORKFLOWS.md`. Acceptance: `IMPLEMENTATION_NOTES.md`.
