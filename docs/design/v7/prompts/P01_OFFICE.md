# Prompt P01 · paste into Claude Code

You are Claude Code working in the Layer2Funnels ecosystem repository (`layer2funnels-bot/l2f-ecosystem`). The design is final and approved. Read these files from `docs/design/v7/` before you touch code:
- `README_START_HERE.md`, `docs/00_ECOSYSTEM_OVERVIEW.md`, `docs/01_DESIGN_SYSTEM.md`, `docs/02_GLOBAL_SHELL.md`, `docs/03_PERMISSIONS_DATA_INTEGRATIONS.md`, `docs/04_OPEN_DECISIONS.md`
- docs/apps/10_OFFICE.md
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
A. Write `docs/implementation/OFFICE_PLAN.md`: page/route inventory mapped to code files, what exists vs new, data/API/migration changes, permissions, tests, risks, questions. Stop and show me the plan summary; wait for my "go".
B. Build in small commits. Run the existing test suites plus new tests after each step.
C. Finish with `docs/implementation/OFFICE_REPORT.md`: done vs planned, files changed, migrations, tests and results, screenshots of each page next to the prototype route, known issues, decisions needed.

Scope: everything in 10_OFFICE.md, plus the permission model and server enforcement from 03 §1–2 (relationships, app access, feature permissions, client apps defaults, owner vs admin, Check access, Access review with last_used_at) and storage/version rules UI (03 §5).
New pages to build: Customer Avatar list cards, New avatar wizard with DOCX/PDF import and 10 3D looks, avatar edit mode (one data model for short and full profile), New offer, New story, Brand Kits (many), Default strategy template, Documents custom sections, Admin (People, Teammate access, Client access, Roles, Access review, Storage & versions, Branding, Audit log), notification settings.
Keep approved sizes on Office Home and Funnels; ≥18 px between stacked sections elsewhere.
