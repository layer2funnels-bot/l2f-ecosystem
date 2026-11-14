# Clients · implementation notes

**Prompt:** `07_PROMPTS/P02_*.md` · **Depends on:** P00, P01 · **Status vs repo:** [R] + [N] Strategy workspace, Copy, sections, request detail

## Baseline in the repository

Repo: `apps/web/js/modules/clients.js` (≈30 % built: statuses Lead/Proposal/Active/Paused/Past, Table/Grid/Pipeline, client tabs Overview/Work/Requests & Approvals/Documents/Team Notes, stages Brand Base/Strategy/Copy/Build/Marketing, "Start a copy" from Library records, requests with versions, SOPs, Tools, Settings › Stages, client sharing, portal preview, form builder). Keep all of it; apply the design and add [N]. Prototype `clients6.js`, routes `#/clients/...`.

## Rules for this app

- Preserve every existing feature. Status marks: [E] keep, [R] redesign, [N] build new, [F] future (do not build; show "Later" only where specified).
- Build real data, API, RLS and tests; the prototype's data and toasts are illustrations.
- Permissions are enforced in the database/API (default deny). Layer2Funnels and Aurj data never mix.
- Visual values come from V8 (`01_DESIGN_SYSTEM.md` + `02_DESIGN_SYSTEM/`), not from v7 numbers quoted in older docs.

## V8 visual requirements for this app

- Stage bar: one connected stepper on a single baseline (done = action colour, current = brand colour, current page = tinted).
- Checklists stack vertically (v7 jammed items on one line).
- Facts list (right column) 15 px values, 14 px labels.
- Status shown as word + dot on neutral ground.

## v7 defects that must not come back

See `00_MASTER_DOCUMENTATION/V8_BUG_FIXES.md` items #13, #20. Root cause for most: class names shared between apps. **Scope every app's component classes** (e.g. under `[data-app=…]` or a prefix).

## Acceptance (from the brief)

- Default view Table; Pipeline available; Lost asks reason.
- Brand Base answers visible under Work after a real form submission.
- Client offer/brand kit/strategy created in a client do not appear in Office lists and vice versa.
- New SOP gets a coloured document icon automatically.
- A client created via the service from Funnel Mapper appears in All clients without refresh issues; duplicate email offers linking.

## Open decisions that touch this app

See `00_MASTER_DOCUMENTATION/04_OPEN_DECISIONS.md`: D1, D8. Use the documented assumption; do not decide silently.

## Definition of done

1. Every page in `PAGES_AND_NAVIGATION.md` exists and matches its screenshot at 1440, 834 and 390 px (light and dark, both organizations).
2. Every control listed for the page works or is marked "Later" where the brief says so.
3. Every flow in `USER_FLOWS_AND_WORKFLOWS.md` passes an end-to-end test.
4. Acceptance items above pass. 5. Report written (see the prompt).
