# Client Portal · implementation notes

**Prompt:** `07_PROMPTS/P08_*.md` · **Depends on:** P00, P02 (requests/approvals) · **Status vs repo:** [R] remove Messages/Files tabs

## Baseline in the repository

Repo `modules/portal.js`. Keep the design (journey road, approve flow, confetti on approval). Tabs: **Home · Requests · Approvals · My notes**. **Removed: Messages and Files** (clients have their own Drive; communication is not in the Portal). Requests: respond with text/files; Approvals: view version, Approve / Ask for changes (comment). My notes: private notes for the client. Header: org/agency logo, "Preview as <client>" banner for team, Exit preview → back to the client in Clients. Everything prepared while locked ("Save as prepared"); never imply it's live.

## Rules for this app

- Preserve every existing feature. Status marks: [E] keep, [R] redesign, [N] build new, [F] future (do not build; show "Later" only where specified).
- Build real data, API, RLS and tests; the prototype's data and toasts are illustrations.
- Permissions are enforced in the database/API (default deny). Layer2Funnels and Aurj data never mix.
- Visual values come from V8 (`01_DESIGN_SYSTEM.md` + `02_DESIGN_SYSTEM/`), not from v7 numbers quoted in older docs.

## V8 visual requirements for this app

- Top navigation is a row of real tabs with count badges (v7 links ran together and badges overlapped).
- Journey road, approve flow and confetti kept.

## v7 defects that must not come back

See `00_MASTER_DOCUMENTATION/V8_BUG_FIXES.md` items #19. Root cause for most: class names shared between apps. **Scope every app's component classes** (e.g. under `[data-app=…]` or a prefix).

## Open decisions that touch this app

See `00_MASTER_DOCUMENTATION/04_OPEN_DECISIONS.md`: D10. Use the documented assumption; do not decide silently.

## Definition of done

1. Every page in `PAGES_AND_NAVIGATION.md` exists and matches its screenshot at 1440, 834 and 390 px (light and dark, both organizations).
2. Every control listed for the page works or is marked "Later" where the brief says so.
3. Every flow in `USER_FLOWS_AND_WORKFLOWS.md` passes an end-to-end test.
4. Acceptance items above pass. 5. Report written (see the prompt).
