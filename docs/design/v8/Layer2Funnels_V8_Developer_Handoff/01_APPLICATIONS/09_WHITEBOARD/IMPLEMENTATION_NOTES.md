# Whiteboard · implementation notes

**Prompt:** `07_PROMPTS/P09_*.md` · **Depends on:** P00 · **Status vs repo:** [R] full-page canvas + [N] folders

## Baseline in the repository

Repo `apps/whiteboard` (Excalidraw, MIT) + `modules/whiteboard.js`. Prototype `misc6.js` routes `#/whiteboard/home`, `folder/:id`, `board/:id`.

## Rules for this app

- Preserve every existing feature. Status marks: [E] keep, [R] redesign, [N] build new, [F] future (do not build; show "Later" only where specified).
- Build real data, API, RLS and tests; the prototype's data and toasts are illustrations.
- Permissions are enforced in the database/API (default deny). Layer2Funnels and Aurj data never mix.
- Visual values come from V8 (`01_DESIGN_SYSTEM.md` + `02_DESIGN_SYSTEM/`), not from v7 numbers quoted in older docs.

## V8 visual requirements for this app

- Board page unchanged (full-page canvas, floating tools).
- Home: ruled panels, flat cards, shared Ledger rules.

## Definition of done

1. Every page in `PAGES_AND_NAVIGATION.md` exists and matches its screenshot at 1440, 834 and 390 px (light and dark, both organizations).
2. Every control listed for the page works or is marked "Later" where the brief says so.
3. Every flow in `USER_FLOWS_AND_WORKFLOWS.md` passes an end-to-end test.
4. Acceptance items above pass. 5. Report written (see the prompt).
