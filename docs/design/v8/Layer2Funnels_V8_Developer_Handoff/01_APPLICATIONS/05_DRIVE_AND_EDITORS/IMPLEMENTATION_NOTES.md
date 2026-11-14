# Drive and editors · implementation notes

**Prompt:** `07_PROMPTS/P05_*.md` · **Depends on:** P00 · **Status vs repo:** [R] + [N] category pages, move/copy, ruler, reset-to-original

## Baseline in the repository

Repo: `modules/drive.js`, editors `docs.js` (Word), `sheets.js`, `imageeditor.js`, `pdfeditor.js`, slides (in docs/drive), CSS `drive.css docs.css sheets.css imageeditor.css pdfeditor.css`; feature lists in `docs/design/EDITORS_DESIGN_BRIEF.md` (**all those features stay**). Prototype `drive5.js` + `drive6.js` + `v7.js`, routes `#/drive/...`, `#/drive/edit/{doc|sheet|slides|image|pdf}/...`.

## Rules for this app

- Preserve every existing feature. Status marks: [E] keep, [R] redesign, [N] build new, [F] future (do not build; show "Later" only where specified).
- Build real data, API, RLS and tests; the prototype's data and toasts are illustrations.
- Permissions are enforced in the database/API (default deny). Layer2Funnels and Aurj data never mix.
- Visual values come from V8 (`01_DESIGN_SYSTEM.md` + `02_DESIGN_SYSTEM/`), not from v7 numbers quoted in older docs.

## V8 visual requirements for this app

- Suggested for you: light cards (thumbnail, type badge, file name, "You opened …"), all the same height (v7 showed dark navy cards with no names because of a leaked Funnel Mapper style).
- Folders: equal-width aligned tiles in a grid; lock icon right-aligned.
- Section titles sentence case 15 px (v7: tiny tracked uppercase).
- Storage: real 6 px meter (v7 showed a blue block from a leaked app-bar style).
- Type chips: flat, radius 6; Slides chip icon fixed.
- File table: sentence-case headers, 54 px rows, tabular numbers.
- Editor side panels (image/PDF tools, properties) use the right-panel size system.

## v7 defects that must not come back

See `00_MASTER_DOCUMENTATION/V8_BUG_FIXES.md` items #1, #2, #3, #4. Root cause for most: class names shared between apps. **Scope every app's component classes** (e.g. under `[data-app=…]` or a prefix).

## Acceptance (from the brief)

- Choosing "Docs" shows only docs + templates; no Suggested widget.
- Move from Personal to Library works without download; owner changes; shares removed on the reverse move after warning.
- Docs ruler margins change the page margins; tab stop affects Tab key; ruler hides in phone width.
- Reset to original restores byte-identical original (hash check).
- Editors keep every feature from EDITORS_DESIGN_BRIEF (checklist pass).

## Open decisions that touch this app

See `00_MASTER_DOCUMENTATION/04_OPEN_DECISIONS.md`: D5, D9. Use the documented assumption; do not decide silently.

## Definition of done

1. Every page in `PAGES_AND_NAVIGATION.md` exists and matches its screenshot at 1440, 834 and 390 px (light and dark, both organizations).
2. Every control listed for the page works or is marked "Later" where the brief says so.
3. Every flow in `USER_FLOWS_AND_WORKFLOWS.md` passes an end-to-end test.
4. Acceptance items above pass. 5. Report written (see the prompt).
