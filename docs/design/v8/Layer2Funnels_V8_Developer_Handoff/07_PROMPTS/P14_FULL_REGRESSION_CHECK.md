# Prompt P14 · Full ecosystem check · paste into Claude Code

You are Claude Code working in the Layer2Funnels ecosystem repository (`layer2funnels-bot/l2f-ecosystem`). The design is **V8 "Ledger"**, final and approved. Put this package at `docs/design/v8/` and read, before touching code:
- `CLAUDE_CODE_START_HERE.md` and, in `00_MASTER_DOCUMENTATION/`: `00_ECOSYSTEM_OVERVIEW.md`, `01_DESIGN_SYSTEM.md`, `02_GLOBAL_SHELL.md`, `03_PERMISSIONS_DATA_INTEGRATIONS.md`, `04_OPEN_DECISIONS.md`, `05_V8_IMPLEMENTATION_MASTER_GUIDE.md`
- `00_MASTER_DOCUMENTATION/07_IMPLEMENTATION_CHECKLIST.md` and `09_FINAL_HANDOFF/V8_COMPLETENESS_AUDIT.md`
- The manager's process document `09_FINAL_HANDOFF/MANAGER_PROCESS_Layer2Funnels_Claude_Code_Design_to_Implementation_Handoff.docx` (how to work: plan, then build, test, report, get approval).
Visual reference: `08_PROTOTYPE_AND_SOURCE/ecosystem-v8.html` (open `#/map`) and the screenshots in `06_SCREENSHOTS_AND_REFERENCES/v8/{desktop-1440,tablet-834,phone-390}/00_SHELL_AND_LAUNCHER/` plus `overlays-1440/00_SHELL_AND_LAUNCHER__*.jpg`. Exact CSS/markup: `08_PROTOTYPE_AND_SOURCE/prototype-source/` (later files override earlier: base → v4 → v5 → v6 → v7 → v8). Tokens: `02_DESIGN_SYSTEM/tokens.css` → merge into `packages/ui/tokens.json` and the repo stylesheet. Icons: `03_ASSETS/icons/`. Logos: `03_ASSETS/logos/`.

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
A. Write `docs/implementation/REGRESSION_PLAN.md`: every page in `01_APPLICATIONS/00_SHELL_AND_LAUNCHER/PAGES_AND_NAVIGATION.md` mapped to code files, what exists vs new, data/API/migration changes, permissions, tests, risks, questions. Stop and show me the plan summary; wait for my "go".
B. Build in small commits. Run the existing test suites plus new tests after each step.
C. Finish with `docs/implementation/REGRESSION_REPORT.md`: done vs planned, files changed, migrations, tests and results, **a table with every page (from PAGES_AND_NAVIGATION.md) and every control listed for it: present / works / screenshot next to the V8 screenshot**, every flow in USER_FLOWS_AND_WORKFLOWS.md tested, known issues, decisions needed.

Scope: ecosystem-wide pass after all apps are built. Walk **every page in every `01_APPLICATIONS/*/PAGES_AND_NAVIGATION.md`** (all 14 areas) against the built app with screenshots side by side at 1440, 834 and 390 px; tick `07_IMPLEMENTATION_CHECKLIST.md`; permission matrix tests (owner / admin / editor / viewer / freelancer / client contact / teammate+client, both orgs); every flow in `05_STRATEGY_AND_ARCHITECTURE/CROSS_APP_WORKFLOWS.md`; responsive and dark mode; performance (no duplicate requests, first load); accessibility (`ACCESSIBILITY_AND_USABILITY_REVIEW_PROMPT.md`); design QA (`DESIGN_QUALITY_ASSURANCE_PROMPT.md`). Produce `docs/implementation/ECOSYSTEM_RELEASE_REPORT.md` with a pass/fail line for every page and every checklist item.
