# Global shell, Launcher and Profile · implementation notes

**Prompt:** `07_PROMPTS/P00_*.md` · **Depends on:** — · **Status vs repo:** [N] rail, search, notifications, profile, branding; [R] Launcher small changes

## Baseline in the repository

Repo today: `apps/web/js/views/shell.js` renders a 68 px header (app switcher, app name, search placeholder, bell placeholder, org switcher, avatar) and a sidebar with a profile footer. Replace with the structure below. Prototype: `prototype-source/core5.js` (rail, router, menus, inbox), `core6.js` (search scopes, profile page), routes `#/launcher`, any app page, `#/profile`.

## Rules for this app

- Preserve every existing feature. Status marks: [E] keep, [R] redesign, [N] build new, [F] future (do not build; show "Later" only where specified).
- Build real data, API, RLS and tests; the prototype's data and toasts are illustrations.
- Permissions are enforced in the database/API (default deny). Layer2Funnels and Aurj data never mix.
- Visual values come from V8 (`01_DESIGN_SYSTEM.md` + `02_DESIGN_SYSTEM/`), not from v7 numbers quoted in older docs.

## V8 visual requirements for this app

- Rail: same order, icons and behaviour; app marks are flat colour tiles (no gloss, no extruded edge).
- Sidebar: structure and text sizes unchanged (owner approved). Active item = neutral tint + 2 px bar in the app colour; no floating white pill.
- App bar: solid background with a bottom rule (v7 used blur glass).
- Launcher keeps its 3D plates, sky and motion (approved brand moment); grid min tile width 150 px so no app sits alone on a row.
- One typeface everywhere (Geist). Bricolage Grotesque only on the Launcher hero.
- Focus ring: 2 px action colour, 2 px offset, on every interactive element.

## v7 defects that must not come back

See `00_MASTER_DOCUMENTATION/V8_BUG_FIXES.md` items #17, #21. Root cause for most: class names shared between apps. **Scope every app's component classes** (e.g. under `[data-app=…]` or a prefix).

## Open decisions that touch this app

See `00_MASTER_DOCUMENTATION/04_OPEN_DECISIONS.md`: D3, D11, D12. Use the documented assumption; do not decide silently.

## Definition of done

1. Every page in `PAGES_AND_NAVIGATION.md` exists and matches its screenshot at 1440, 834 and 390 px (light and dark, both organizations).
2. Every control listed for the page works or is marked "Later" where the brief says so.
3. Every flow in `USER_FLOWS_AND_WORKFLOWS.md` passes an end-to-end test.
4. Acceptance items above pass. 5. Report written (see the prompt).
