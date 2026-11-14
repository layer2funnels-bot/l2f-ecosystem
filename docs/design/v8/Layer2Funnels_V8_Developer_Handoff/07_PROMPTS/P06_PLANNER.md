# Prompt P06 · Planner · paste into Claude Code

You are Claude Code working in the Layer2Funnels ecosystem repository (`layer2funnels-bot/l2f-ecosystem`). The design is **V8 "Ledger"**, final and approved. Put this package at `docs/design/v8/` and read, before touching code:
- `CLAUDE_CODE_START_HERE.md` and, in `00_MASTER_DOCUMENTATION/`: `00_ECOSYSTEM_OVERVIEW.md`, `01_DESIGN_SYSTEM.md`, `02_GLOBAL_SHELL.md`, `03_PERMISSIONS_DATA_INTEGRATIONS.md`, `04_OPEN_DECISIONS.md`, `05_V8_IMPLEMENTATION_MASTER_GUIDE.md`
- All seven files in `01_APPLICATIONS/06_PLANNER/` (start with `APP_OVERVIEW.md`; the authoritative brief is `FEATURES_AND_FUNCTIONALITY.md` §2)
- The manager's process document `09_FINAL_HANDOFF/MANAGER_PROCESS_Layer2Funnels_Claude_Code_Design_to_Implementation_Handoff.docx` (how to work: plan, then build, test, report, get approval).
Visual reference: `08_PROTOTYPE_AND_SOURCE/ecosystem-v8.html` (open `#/map`) and the screenshots in `06_SCREENSHOTS_AND_REFERENCES/v8/{desktop-1440,tablet-834,phone-390}/06_PLANNER/` plus `overlays-1440/06_PLANNER__*.jpg`. Exact CSS/markup: `08_PROTOTYPE_AND_SOURCE/prototype-source/` (later files override earlier: base → v4 → v5 → v6 → v7 → v8). Tokens: `02_DESIGN_SYSTEM/tokens.css` → merge into `packages/ui/tokens.json` and the repo stylesheet. Icons: `03_ASSETS/icons/`. Logos: `03_ASSETS/logos/`.

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
A. Write `docs/implementation/PLANNER_PLAN.md`: every page in `01_APPLICATIONS/06_PLANNER/PAGES_AND_NAVIGATION.md` mapped to code files, what exists vs new, data/API/migration changes, permissions, tests, risks, questions. Stop and show me the plan summary; wait for my "go".
B. Build in small commits. Run the existing test suites plus new tests after each step.
C. Finish with `docs/implementation/PLANNER_REPORT.md`: done vs planned, files changed, migrations, tests and results, **a table with every page (from PAGES_AND_NAVIGATION.md) and every control listed for it: present / works / screenshot next to the V8 screenshot**, every flow in USER_FLOWS_AND_WORKFLOWS.md tested, known issues, decisions needed.

Scope: **design only for existing Planner features** (do not change functions, data or tests), plus: the focused Strategy builder page (Builder only, no Grid; strategy switcher; Create a plan from it; Create a project from it; inspector; keyboard), the plan action "Create a project from this plan" (calls the Projects endpoint you add), Alignment restyled with the original behaviour, objective drawer restyle with the original tabs, larger sidebar and labels, and the real fix for plans stuck loading (10 s error state + token refresh/org mismatch causes). Run the full Planner suites before and after.


V8 visual requirements for this app (in addition to the design system):
- Boxes, strategy root and lanes are flat (no resting shadows).
- Strategy builder inspector and objective drawer use the right-panel size system (labels 13.5 px, inputs 38 px).
- Strategy builder "+ Sub/KPI" labels 12.5 px; keyboard list 14 px.

Pages to deliver (17 documented pages, 17 templates): see `01_APPLICATIONS/06_PLANNER/PAGES_AND_NAVIGATION.md`. Flows to test: `USER_FLOWS_AND_WORKFLOWS.md`. Acceptance: `IMPLEMENTATION_NOTES.md`.
