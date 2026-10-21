# Funnel Mapper Pro — V2 Complete Design Package

This is the **complete, current** Funnel Mapper Pro V2 design reference, assembled for the GitHub implementation work. It contains the previously approved V2 package **plus** the four functional-interaction flows completed in this final pass. Nothing needs to be collected from earlier chats.

## What this is

A set of `project/*.dc.html` design boards — one screen each — laid out on an infinite canvas (`project/canvas.json`). Each file is a **visual spec**, not code to paste: rebuild each screen with the app's existing Next.js + Tailwind + React Flow components, matching layout, type, colour and states. The `artifact-type/` folder is the design-canvas runtime that renders the boards; `artifact-type/reference/` holds the brand/token/craft references.

Open `index.html` to view the whole canvas. Source of truth for intent and constraints: `DESIGN_V2_HANDOFF.md`.

## What this final pass did

- **Preserved** the 28 approved V2 boards unchanged — object system, editor states, inspector scopes, context menus, floating toolbars, performance map, widgets, all pages (Home, Clients, Client, Products, Funnels, Reports, Templates, Settings), Share, Shared view, Presentation, and the six responsive boards (1280 / 1024 / 768 / phone×3).
- **Added** four boards for the interaction flows that had no home:
  - `Connection-quick-add.dc.html` — drag connection → empty space → Quick Add → created + connected, with cancel / invalid / undo states.
  - `Page-thumbnail.dc.html` — Page URL → real screenshot, all ten states, with the semantic wireframe as the first-class fallback.
  - `Change-page-type.dc.html` — transform a page in place, keeping id, position, connections, URL, thumbnail and analytics.
  - `Wait-delay.dc.html` — the Wait/Delay object: library, canvas, selected, inspector (duration + unit), and its field states. Math-neutral.
- **Redesigned:** nothing. No board was fundamentally wrong; the V2 system already reads as a purpose-built funnel tool, not an automation/node editor.

## Semantic Page system (already in V2 — preserved)

Each page type is drawn with its own miniature wireframe anatomy, so a sales page never looks like an opt-in or a checkout: opt-in, sales, VSL, webinar, quiz/survey, application, booking calendar, thank-you, members area, checkout, order form, order bump, upsell, downsell, subscription, membership. Spec lives in `project/Object-system.dc.html`.

## Semantic Icon system (already in V2 — preserved)

Every block carries a meaning-bearing icon (envelope, SMS, WhatsApp, clock-for-wait, phone-for-call, calendar, target-for-goal, branch-for-condition, etc.), and the six object families each have a distinct shape (source rounded-entry, page card + preview strip, offer card + price tab, message/action capsule, logic square + hatched body, goal capsule + progress). Same family lookup in `Object-system.dc.html`.

## Style Panel, Quick Styles, Copy/Paste Style, Multi-select

Covered in `Editor-block.dc.html`, `Editor-selection-style.dc.html` and `Context-menus.dc.html`: Style / Plan / Analytics architecture, quick-styles row, copy/paste-style (paint-bucket) + eyedropper, and the floating multi-select toolbar with align / distribute / frame / lock / duplicate / delete.

## Responsive coverage

1536 (primary) and 1440 (reference) in the main boards; dedicated boards at 1280, 1024, 768 and phone (390–430). Rules in `DESIGN_V2_HANDOFF.md` → *Responsive rules*.

## Competitor / reference rule

GERU, Funnelytics, n8n and the attached page/icon screenshots are **usability reference only**. No branding, colours, typography, layouts, icon geometry or page artwork were copied. Borrow the usability idea; the solution is Funnel Mapper Pro's own.

## Technical foundation — untouched

Design only. No change to funnel maths, the authoritative engine, data model, RLS, auth, permissions, reports architecture, scenarios, exports or autosave. No migrations.

## Zero library reduction

**Library items removed: 0. Merged/reduced: 0.** All 169 blocks, every category and every search keyword are retained.

## File map

- `README.md`, `DESIGN_V2_HANDOFF.md` — docs
- `index.html` — canvas entry
- `project/*.dc.html` — 32 screen boards; `project/canvas.json` — canvas layout
- `artifact-type/` — design-canvas runtime + `reference/` brand & craft docs

## 169-block system (final pass)

- `project/block-inventory.json` — the canonical, data-driven inventory every block renders from (name, category, family, shape, colour, page wireframe). Implementation maps blocks from this file; no block is a bespoke design.
- `project/Library-169.dc.html` — the master library board: all blocks by category, each with its family-shaped, brand-coloured tile, with per-category counts.
- Canonical dimensions and the preserved +38px page/offer rule and centre-align rule are in `DESIGN_V2_HANDOFF.md`.
- **Honest status:** inventory holds 149 blocks (Pages 19/19) labelled *target 169*; reconcile against the app's authoritative block-definitions to lock the exact count. Removed 0, merged 0.
- **Skin propagation:** done across Editor, Performance map, Presentation, Shared view and responsive boards (see handoff). Canvas nodes keep the horizontal header; logo-above tiles are used in the Library and Object system.
- **Still open:** reconcile 149 → 169 against the app's block-definitions; one visual (screenshot) check of Editor and Performance map.

## Final pass: page object, library categories, design-freeze review

- **Page and offer object redesigned** as a funnel object (browser window of the page, name and numbers, type caption, Y / N ports). 61 nodes on 15 boards. See `Pages-all.dc.html` (anatomy, 19 pages, 14 offers, 9 states) and the handoff section *Page and offer object (final)*.
- **Library** now includes Communities (8 of 11 captured), AI Calling (4/4) and AI Automation (9/9) from the app screenshots, with a status chip per category. Removed 0, merged 0. The 169 total is **not** reconciled yet.
- **Branding** unchanged: Bricolage Grotesque, DM Sans, JetBrains Mono, Emerald and category colours.
- **`DESIGN_FREEZE_REVIEW.md`**: the design-freeze review. Verdict: not frozen; five P0 items remain.
- **Not verified by screenshot.** All checks were structural. Please review Editor, Performance map and the objects board in a browser.


## This pass: your blocks, the sidebar, thumbnails everywhere, simulation, verified audit

- **Your block designs are the source.** `Library-169.dc.html` and the editor's left bar use your icons for Traffic sources, Actions & events, Email & Communication, Sales & CRM, Logic & goals and Notes & layout. The files are in `supporting-assets/block-icons/`, with a name-to-file map in `icons.json`. Pages and Offers use the page-window tile; Communities, AI Calling and AI Automation use system tiles until you design them.
- **Blocks sidebar** (`Blocks-sidebar.dc.html`): search, Recent, the client's products, then one accordion of categories with counts. Eight states: default, category open, hover, search, no results, widgets, collapsed, dragging. **Widgets live at the bottom of this sidebar.** Placed widgets are listed in the funnel panel.
- **Page thumbnails and hover peek everywhere:** 55 page objects on 13 product boards show a page screenshot, and the Editor and Shared view show the hover peek. The screenshots are design samples (`supporting-assets/sample-page-screenshots/`); in the product they come from capture or upload (`Page-block-thumbnails.dc.html`).
- **`SIMULATION_SPEC.md`** (also the *Simulation spec* board): how simulation should look and behave, for Claude Code. It does not change the engine.
- **`VERIFIED_AUDIT.md`** (also the *Verified audit* board): the 11 audit findings checked against the package, with P0 / P1 / P2 corrections **awaiting your approval**, open questions, and the freeze checklist.


## Final correction pass: live previews, data trust, states, simulation, export

**Status: not frozen.** See `DESIGN_FREEZE_REPORT.md` for what remains (zoom-levels board, Finding component, library reconciliation, owner decisions).

- **Live funnel preview** (`Live-funnel-preview.dc.html`): every funnel card is drawn from the funnel's own saved canvas by one renderer, not from a template thumbnail. The reference renderer used for the design is in `supporting-assets/preview-renderer/` (`fmprev.py`, `pgobj.py`). It shows the intended algorithm: fit to frame, miniature real objects, leak paths, line weight by people, a ring on the biggest leak. Rules and limits are in the board.
- **Data trust** (`Data-trust.dc.html`): period and basis on every money figure, the LTV rule, whole people with the exact value on hover, Plan / Forecast / Actual tags, the goal row, and the Actuals entry.
- **States** (`States.dc.html`): first use, empty, loading, error, saving, offline, viewer, permission, success.
- **Simulation** (`Simulation.dc.html`, `SIMULATION_SPEC.md`), **Export preview** (`Export-preview.dc.html`), **New client** (`New-client.dc.html`).
- **Wording and numbers changed on existing boards:** "Health · N checks" is "Model checks · N to fix"; "Tidy up" is "Tidy up" (flagged: collides with the inspector's Arrange tab); "Expected" merged into **Baseline (current map)** (flagged: confirm "Expected" is not a real saved scenario); decimals shown as whole people; "/ mo" on money; sparkle icon replaced; phone controls 44px; KPI strip shows Traffic only when the sidebar is closed.
- **Verification:** 17 boards were rendered and checked in a headless browser; the strip, sub-tabs and phone targets were measured. Other boards pass structural checks only.


## Final pass (owner decisions applied)

Read **`CLAUDE_CODE_IMPLEMENTATION.md`** first: it separates what exists from what is new, and gives data models, behaviour and acceptance checks for every feature. Read **`DESIGN_FREEZE_REPORT.md`** for the status: **not frozen**, one P0 remains (the block library needs the authoritative registry from the owner).

Owner decisions now reflected in the boards: Tidy up; Baseline = Current map (no Expected); whole people; LTV tag on every relevant figure; typed and CSV actuals; AI Calling kept; Traffic always visible on the KPI strip; Dark default and unchanged, with a Light theme added next to it; four ports shown on hover; Trash with no time limit; hover preview opens only from the thumbnail and never covers the next step.

New boards in this pass: Live funnel preview, Data trust, States, Simulation, Export preview, New client, The 13 templates, Templates inside the map, Math made plain, Page block hover preview, Collapsible panels and four ports, Canvas zoom levels, Finding component, Appearance (dark only). Older boards named *Verified audit*, *Design-freeze review* and *V2 change log* are history.

Reference code: `supporting-assets/preview-renderer/` holds the drawing code (`fmprev.py`), the page and offer anatomy (`pgobj.py`) and the 13 template definitions (`templates13.py`). Port them to TypeScript; do not run the Python in the app.


## Themes

Dark is the default and unchanged. **Light** is added next to it (Appearance). See `V2-theme-tokens`, `Light-editor`, `Light-home`, `Light-client`, `Light-funnels`, and F13 in `CLAUDE_CODE_IMPLEMENTATION.md`.
