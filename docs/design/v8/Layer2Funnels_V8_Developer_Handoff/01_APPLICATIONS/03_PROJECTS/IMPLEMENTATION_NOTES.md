# Projects · implementation notes

**Prompt:** `07_PROMPTS/P03_*.md` · **Depends on:** P00–P02 · **Status vs repo:** [R] skin of existing V2 + [N] Files, personal-project permission

## Baseline in the repository

**Baseline = Projects V2 in the repo** (`apps/projects/web/*`, React + Vite, mounted at `#/projects`; docs `docs/apps/PROJECTS_AUDIT.md`, `DESIGN_BRIEF_Projects.md`). Every feature listed in DESIGN_BRIEF_Projects §5–8 stays (views, task panel, shortcuts, right-click, drag alternatives, optimistic updates, states). This brief = ecosystem skin [R] + three additions [N]. Tokens: map `--pm-*` tokens to the ecosystem values in `assets/tokens.css` (keep the `pm-` class prefix). Prototype: `projects6.js`, routes `#/projects/...`.

## Rules for this app

- Preserve every existing feature. Status marks: [E] keep, [R] redesign, [N] build new, [F] future (do not build; show "Later" only where specified).
- Build real data, API, RLS and tests; the prototype's data and toasts are illustrations.
- Permissions are enforced in the database/API (default deny). Layer2Funnels and Aurj data never mix.
- Visual values come from V8 (`01_DESIGN_SYSTEM.md` + `02_DESIGN_SYSTEM/`), not from v7 numbers quoted in older docs.
- **Do not redesign this app's functions from assumptions.** Inspect the real code first; change visuals only (Planner: Strategy builder and plan → project are the agreed exceptions; Funnel Mapper: rename, sizes, shared clients).

## V8 visual requirements for this app

- KPI strip is one ruled band with dividers, not six floating boxes.
- Home "My open tasks": compact grid matches visible columns so assignee avatars never sit on dates.
- Sidebar tree constrains its children: no horizontal overflow, names ellipsize.
- Workload heat map has a real grid layout (v7 printed rows as run-on text).
- Timer pill: red recording dot (8 px) — v7 rendered a red blob from a leaked class.
- Top-bar quick actions render as an icon row (v7 collapsed them via a leaked class).
- Task panel: values 15 px, labels 14 px, section titles 16 px, field rows 44 px, label column 150 px, title 24 px; subtasks show circular assignee avatars.

## v7 defects that must not come back

See `00_MASTER_DOCUMENTATION/V8_BUG_FIXES.md` items #5, #6, #7, #8, #9, #10. Root cause for most: class names shared between apps. **Scope every app's component classes** (e.g. under `[data-app=…]` or a prefix).

## Acceptance (from the brief)

- Every V2 feature still works (run the existing e2e suite).
- Personal project: creatable only with permission; invisible to others incl. admins (DB test).
- Files page lists attachments from tasks and project docs, opens originals, never duplicates storage.
- Timer pill visible on every Projects page while running; stop logs time to the task.
- Names readable: project rows 14.5 px; task rows 14.5 px; no sidebar horizontal scroll.

## Definition of done

1. Every page in `PAGES_AND_NAVIGATION.md` exists and matches its screenshot at 1440, 834 and 390 px (light and dark, both organizations).
2. Every control listed for the page works or is marked "Later" where the brief says so.
3. Every flow in `USER_FLOWS_AND_WORKFLOWS.md` passes an end-to-end test.
4. Acceptance items above pass. 5. Report written (see the prompt).
