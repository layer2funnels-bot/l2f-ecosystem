# Office · implementation notes

**Prompt:** `07_PROMPTS/P01_*.md` · **Depends on:** P00 · **Status vs repo:** [R] + many [N] pages

## Baseline in the repository

Repo: `apps/web/js/views/office.js`, `funnels.js`, `strategies.js`, `admin.js`, `home.js`, `profile.js`; modules `docs.js`, `drive.js`. Prototype: `office5.js`, `office6.js`, `avatar5.js`, `funnels5.js`. Routes below are prototype hashes (`#/office/...`); keep the repo's routing scheme.

## Rules for this app

- Preserve every existing feature. Status marks: [E] keep, [R] redesign, [N] build new, [F] future (do not build; show "Later" only where specified).
- Build real data, API, RLS and tests; the prototype's data and toasts are illustrations.
- Permissions are enforced in the database/API (default deny). Layer2Funnels and Aurj data never mix.
- Visual values come from V8 (`01_DESIGN_SYSTEM.md` + `02_DESIGN_SYSTEM/`), not from v7 numbers quoted in older docs.

## V8 visual requirements for this app

- Home "My day" and "Waiting on you" are a three-column row grid (check · task + source · when) with hairline separators instead of floating rows.
- Greeting title 30 px (v7 56 px display).
- Documents: section header on its own rule; document cards one line (name + meta never wrap), min width 260 px; drop zones align with cards.
- Team: gradient cover banners removed; quiet people grid.
- Avatar studio cards: flat, sentence-case headings; Clara/Marcus sample content complete; pronouns follow the avatar ("Where she is now").
- Root-belief band: "All beliefs" is an outline button on dark (v7 was white text on white).

## v7 defects that must not come back

See `00_MASTER_DOCUMENTATION/V8_BUG_FIXES.md` items #11, #12, #14, #15. Root cause for most: class names shared between apps. **Scope every app's component classes** (e.g. under `[data-app=…]` or a prefix).

## Acceptance (from the brief)

- No "short or full" question anywhere; import → mapping → look → profile works end to end with a real DOCX.
- Editing a belief in edit mode changes it in Full profile and, if summarized, on Profile.
- Multiple brand kits; strategy template change affects only new docs.
- Admin cannot change client access; owner can; server rejects forbidden calls (test with direct API).
- Sections never touch: ≥18 px between stacked cards on every Office page; Home and Funnels font sizes unchanged.

## Open decisions that touch this app

See `00_MASTER_DOCUMENTATION/04_OPEN_DECISIONS.md`: D4, D6, D9. Use the documented assumption; do not decide silently.

## Definition of done

1. Every page in `PAGES_AND_NAVIGATION.md` exists and matches its screenshot at 1440, 834 and 390 px (light and dark, both organizations).
2. Every control listed for the page works or is marked "Later" where the brief says so.
3. Every flow in `USER_FLOWS_AND_WORKFLOWS.md` passes an end-to-end test.
4. Acceptance items above pass. 5. Report written (see the prompt).
