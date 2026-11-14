# Tasks · implementation notes

**Prompt:** `07_PROMPTS/P04_*.md` · **Depends on:** P03 (shared timer, Send to project) · **Status vs repo:** [N] whole app, built from scratch

## Baseline in the repository

Purpose: light, fast to-do lists for one person and for teams (Taskade-like). Projects is for structured client/internal projects; Tasks is for everyday lists, personal plans and team checklists. Prototype: `tasks5.js` + `tasks6.js` (+ v7 changes in build), routes `#/tasks/...`. App id `tasks`, plate colours `#5EEAD4 → #0EA5A4 → #08706F`, icon `tasks`. Build it the same way as other shell apps in `apps/web/js/modules/` (vanilla JS module) unless Claude Code proposes React like Projects/Planner with a reason. Add `apps/tasks/app.manifest.json`, migration, API operations in `packages/core`, tests.

## Rules for this app

- Preserve every existing feature. Status marks: [E] keep, [R] redesign, [N] build new, [F] future (do not build; show "Later" only where specified).
- Build real data, API, RLS and tests; the prototype's data and toasts are illustrations.
- Permissions are enforced in the database/API (default deny). Layer2Funnels and Aurj data never mix.
- Visual values come from V8 (`01_DESIGN_SYSTEM.md` + `02_DESIGN_SYSTEM/`), not from v7 numbers quoted in older docs.

## V8 visual requirements for this app

- Decorative teal/violet background wash removed.
- List "document" sheet: hairline border, radius 8, no shadow, max width 980 px.
- Task text 15.5 px; block headings 19 px; Show/Hide completed 14.5 px.

## v7 defects that must not come back

See `00_MASTER_DOCUMENTATION/V8_BUG_FIXES.md` items #16. Root cause for most: class names shared between apps. **Scope every app's component classes** (e.g. under `[data-app=…]` or a prefix).

## Acceptance (from the brief)

1. Complete 3 tasks → hidden; Show completed (3) → they reappear in their places; Hide completed (3) hides again.
2. Two assignees on one task; both see it in Today; notifications sent to both.
3. Timer started in Tasks shows the same pill in Projects; stopping logs one entry.
4. Team list access with 3 people picked at once; a fourth person gets 404 on the list API.
5. Private task never appears to a manager, only the count.
6. Send to a project creates a Projects task and links back.

## Definition of done

1. Every page in `PAGES_AND_NAVIGATION.md` exists and matches its screenshot at 1440, 834 and 390 px (light and dark, both organizations).
2. Every control listed for the page works or is marked "Later" where the brief says so.
3. Every flow in `USER_FLOWS_AND_WORKFLOWS.md` passes an end-to-end test.
4. Acceptance items above pass. 5. Report written (see the prompt).
