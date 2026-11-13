# Prompt P05 · paste into Claude Code

You are Claude Code working in the Layer2Funnels ecosystem repository (`layer2funnels-bot/l2f-ecosystem`). The design is final and approved. Read these files from `docs/design/v7/` before you touch code:
- `README_START_HERE.md`, `docs/00_ECOSYSTEM_OVERVIEW.md`, `docs/01_DESIGN_SYSTEM.md`, `docs/02_GLOBAL_SHELL.md`, `docs/03_PERMISSIONS_DATA_INTEGRATIONS.md`, `docs/04_OPEN_DECISIONS.md`
- docs/apps/14_DRIVE_AND_EDITORS.md and reference/EDITORS_DESIGN_BRIEF.md (existing editor features)
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
A. Write `docs/implementation/DRIVE_PLAN.md`: page/route inventory mapped to code files, what exists vs new, data/API/migration changes, permissions, tests, risks, questions. Stop and show me the plan summary; wait for my "go".
B. Build in small commits. Run the existing test suites plus new tests after each step.
C. Finish with `docs/implementation/DRIVE_REPORT.md`: done vs planned, files changed, migrations, tests and results, screenshots of each page next to the prototype route, known issues, decisions needed.

Scope: Drive category pages (a type chip shows only that type + templates, never "Suggested for you"), server-side Move/Copy between Library and Personal (menu, dialog, drag to sidebar), sidebar v7 size; the shared editor frame for Docs, Sheets, Slides, Image, PDF; Docs ruler (horizontal + vertical, margins, first-line indent, tab stops); voice bar; History/Comments/Properties side panel; Image and PDF explicit save with original + latest edit only and **Reset to original**; storage/version rules from 03 §5. Keep every existing editor feature.
