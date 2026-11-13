# Prompt P06 · paste into Claude Code

You are Claude Code working in the Layer2Funnels ecosystem repository (`layer2funnels-bot/l2f-ecosystem`). The design is final and approved. Read these files from `docs/design/v7/` before you touch code:
- `README_START_HERE.md`, `docs/00_ECOSYSTEM_OVERVIEW.md`, `docs/01_DESIGN_SYSTEM.md`, `docs/02_GLOBAL_SHELL.md`, `docs/03_PERMISSIONS_DATA_INTEGRATIONS.md`, `docs/04_OPEN_DECISIONS.md`
- docs/apps/15_PLANNER.md and reference/PLANNER_PRODUCT_DESIGN_SPEC.md (existing features)
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
A. Write `docs/implementation/PLANNER_PLAN.md`: page/route inventory mapped to code files, what exists vs new, data/API/migration changes, permissions, tests, risks, questions. Stop and show me the plan summary; wait for my "go".
B. Build in small commits. Run the existing test suites plus new tests after each step.
C. Finish with `docs/implementation/PLANNER_REPORT.md`: done vs planned, files changed, migrations, tests and results, screenshots of each page next to the prototype route, known issues, decisions needed.

Scope: **design only for existing Planner features** (do not change functions, data or tests), plus: the focused Strategy builder page (Builder only, no Grid; strategy switcher; Create a plan from it; Create a project from it; inspector; keyboard), the plan action "Create a project from this plan" (calls the Projects endpoint you add), Alignment restyled with the original behaviour, objective drawer restyle with the original tabs, larger sidebar and labels, and the real fix for plans stuck loading (10 s error state + token refresh/org mismatch causes). Run the full Planner suites before and after.
