# Forms · implementation notes

**Prompt:** `07_PROMPTS/P10_*.md` · **Depends on:** P00, P02 (Brand Base answers) · **Status vs repo:** [E] small additions (Responses summary, Automations "Later")

## Rules for this app

- Preserve every existing feature. Status marks: [E] keep, [R] redesign, [N] build new, [F] future (do not build; show "Later" only where specified).
- Build real data, API, RLS and tests; the prototype's data and toasts are illustrations.
- Permissions are enforced in the database/API (default deny). Layer2Funnels and Aurj data never mix.
- Visual values come from V8 (`01_DESIGN_SYSTEM.md` + `02_DESIGN_SYSTEM/`), not from v7 numbers quoted in older docs.

## V8 visual requirements for this app

- Builder properties panel uses the right-panel size system (labels 13.5 px, inputs 38 px, section labels 13.5 px sentence case).
- Responses: sentence-case chart headings are a recommendation (R4), not yet applied.

## Open decisions that touch this app

See `00_MASTER_DOCUMENTATION/04_OPEN_DECISIONS.md`: D8. Use the documented assumption; do not decide silently.

## Definition of done

1. Every page in `PAGES_AND_NAVIGATION.md` exists and matches its screenshot at 1440, 834 and 390 px (light and dark, both organizations).
2. Every control listed for the page works or is marked "Later" where the brief says so.
3. Every flow in `USER_FLOWS_AND_WORKFLOWS.md` passes an end-to-end test.
4. Acceptance items above pass. 5. Report written (see the prompt).
