# Prompt P00 · Global shell, Launcher and Profile · paste into Claude Code

You are Claude Code working in the Layer2Funnels ecosystem repository (`layer2funnels-bot/l2f-ecosystem`). The design is **V8 "Ledger"**, final and approved. Put this package at `docs/design/v8/` and read, before touching code:
- `CLAUDE_CODE_START_HERE.md` and, in `00_MASTER_DOCUMENTATION/`: `00_ECOSYSTEM_OVERVIEW.md`, `01_DESIGN_SYSTEM.md`, `02_GLOBAL_SHELL.md`, `03_PERMISSIONS_DATA_INTEGRATIONS.md`, `04_OPEN_DECISIONS.md`, `05_V8_IMPLEMENTATION_MASTER_GUIDE.md`
- All seven files in `01_APPLICATIONS/00_SHELL_AND_LAUNCHER/` (start with `APP_OVERVIEW.md`; the authoritative brief is `FEATURES_AND_FUNCTIONALITY.md` §2)
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
A. Write `docs/implementation/SHELL_AND_LAUNCHER_PLAN.md`: every page in `01_APPLICATIONS/00_SHELL_AND_LAUNCHER/PAGES_AND_NAVIGATION.md` mapped to code files, what exists vs new, data/API/migration changes, permissions, tests, risks, questions. Stop and show me the plan summary; wait for my "go".
B. Build in small commits. Run the existing test suites plus new tests after each step.
C. Finish with `docs/implementation/SHELL_AND_LAUNCHER_REPORT.md`: done vs planned, files changed, migrations, tests and results, **a table with every page (from PAGES_AND_NAVIGATION.md) and every control listed for it: present / works / screenshot next to the V8 screenshot**, every flow in USER_FLOWS_AND_WORKFLOWS.md tested, known issues, decisions needed.

Scope: shared foundation used by every app.
- Tokens and type scale V8 (01 §2–5), app identity `--app` per `[data-app]`, touch sizes ≥44 px.
- Shell: 64 px ecosystem rail (org menu without the "open in new tab" item, apps menu, pinned apps, search, bell, profile menu), app sidebar without the profile footer, 52 px app bar, focused layout for editors/canvases, phone bottom bar + apps-and-account sheet (02 §1–3). Replace `views/shell.js` header; Planner and Projects embeds must render inside it.
- Launcher (plates 96 px, tile min 150 px in V8, title up to 76 px), Jump back in, weather toggle (02 §4).
- Global search dialog + backend search endpoint with per-app providers (start with Projects, Clients, Drive, Office records; others register later) (02 §5).
- Notifications service + inbox drawer + settings (02 §6), generalising the Projects 0034 collaboration notifications.
- Profile page `#/profile` (02 §7). Organization branding storage + Admin › Branding page + real logos (02 §8, assets/logos).
- Shared context-menu component, link behaviour, shared states (02 §9).
Acceptance: every existing app still opens; Ctrl-click opens new tabs; search returns only permitted items (test with two users and two orgs); bell count correct; logos never stretched; phone layout works.


V8 visual requirements for this app (in addition to the design system):
- Rail: same order, icons and behaviour; app marks are flat colour tiles (no gloss, no extruded edge).
- Sidebar: structure and text sizes unchanged (owner approved). Active item = neutral tint + 2 px bar in the app colour; no floating white pill.
- App bar: solid background with a bottom rule (v7 used blur glass).
- Launcher keeps its 3D plates, sky and motion (approved brand moment); grid min tile width 150 px so no app sits alone on a row.
- One typeface everywhere (Geist). Bricolage Grotesque only on the Launcher hero.
- Focus ring: 2 px action colour, 2 px offset, on every interactive element.

v7 defects that must not return: `00_MASTER_DOCUMENTATION/V8_BUG_FIXES.md` #17, #21.

Pages to deliver (9 documented pages, 9 templates): see `01_APPLICATIONS/00_SHELL_AND_LAUNCHER/PAGES_AND_NAVIGATION.md`. Flows to test: `USER_FLOWS_AND_WORKFLOWS.md`. Acceptance: `IMPLEMENTATION_NOTES.md`.
