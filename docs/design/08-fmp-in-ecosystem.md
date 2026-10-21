# 08 · Funnel Mapper Pro in the ecosystem
File: `08-fmp-in-ecosystem.html` · Status: approved with changes, applied

**Funnel Mapper Pro is a regular ecosystem app**, built from a clone of the original repo (the original is never edited). It is not a "connected product".

## Placement
- Launcher: normal tile (see 03). Same tab, same header, same switcher.
- Same global header as every app. In the editor the header is compact (search = icon) to protect canvas height.
- FMP's own menu under the header: Dashboard, Clients, Reports (+ the editor). Old top bar, sign-in, team/roles/workspace settings are removed.

## Switcher inside FMP (same rules as every app)
- Stay in FMP; land on the equivalent page of the other organization; clear the old organization's funnels, canvas, undo history and drafts.
- **A funnel that exists only in the other organization**: land on the FMP Dashboard of the new organization with "That funnel belongs to Layer2Funnels, so it isn't here. We've taken you to the Funnel Mapper Pro Dashboard in Aurj." + "Switch back to Layer2Funnels". Nothing is copied.
- FMP not turned on in the new organization: outcome 3 panel (see 01).
- Unsynced draft: Save and switch / Discard and switch / Stay here (Save and switch syncs the draft first).
- Empty destination ("No funnels in Aurj yet", New funnel).

## Colour mapping (Emerald retired in the ecosystem copy only; light by default, dark later)
Brand/buttons → `--primary` · success/continue → `--success` blue + ✓ + % · leak/lost → dashed `--warn-text` + ▲ + "% lost"; bars use `--warn` fill with `--warn-text` outline and printed numbers · warning chip → `--warn-text` on `--warn-tint` · broken → `--danger` + ✗ · no data → dotted `--muted` · node border `--control-border` · node categories: stripe + icon, no green (blue, coral, violet, amber, slate, sky, magenta, brown). Contrast is computed in the page.

## Screens (final): KEEP / RESHAPE / REPLACE
KEEP: editor canvas, library, inspector, KPI bar and maths, Tidy Up/File/exports/versions/templates, **reports, forecast, scenarios, goals**, presentation mode.
RESHAPE: dashboard, share modal, clients and client-products screens (Phase 1: own data, restyle only).
REPLACE: sign-in, top bar, profile and appearance, workspace/team/roles/independent accounts (by Admin → Members and Access from day one).
**Phase 2 (later, not designed):** clients move to ecosystem Clients and offers to Office → Funnels, one item at a time.

Do not redesign the canvas, maths or reports.

Open assumptions: A16.
