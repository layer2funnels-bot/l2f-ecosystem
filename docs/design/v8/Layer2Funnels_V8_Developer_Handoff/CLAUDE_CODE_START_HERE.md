# CLAUDE CODE — START HERE

You are implementing the **Layer2Funnels + Aurj ecosystem, design V8 "Ledger"** (final, approved by Tabish Riaz, 14 Nov 2026). Read this file first, then follow the reading order below. Put the whole package in the repo at `docs/design/v8/`.

## 1. Which version is authoritative
- **V8 is the primary reference** for everything: structure, pages, functions (carried unchanged from v7) and visuals (new in V8).
- **V4** is historical (`08_PROTOTYPE_AND_SOURCE/reference-prototypes/ecosystem-v4.html`); every difference is explained in `00_MASTER_DOCUMENTATION/06_V4_VS_V8_CHANGELOG.md`. Do not restore V4 decisions.
- **v7** documents and prototype are superseded; V8 keeps v7's functions and replaces its visual values. Where an older document quotes a v7 size or font, V8 wins.
- Order of authority when two sources disagree: (1) `00_MASTER_DOCUMENTATION/04_OPEN_DECISIONS.md` and locked decisions, (2) each app's `FEATURES_AND_FUNCTIONALITY.md` §2 (the brief), (3) `00_MASTER_DOCUMENTATION/*`, (4) the V8 prototype and screenshots, (5) everything else. If still unclear: ask Tabish, don't guess.

## 2. What the ZIP contains
| Folder | Contents |
|---|---|
| `00_MASTER_DOCUMENTATION/` | 00 overview · 01 design system (V8) · 02 global shell · 03 permissions, data, integrations · 04 open decisions · 05 implementation master guide · 06 V4 vs V8 changelog · 07 implementation checklist · 08 asset and icon index · V8 design decisions, bug fixes, recommendations |
| `01_APPLICATIONS/` | One folder per app (14 areas: shell + 13 apps), each with APP_OVERVIEW, PAGES_AND_NAVIGATION (179 pages in total, every page with the 11 required fields), FEATURES_AND_FUNCTIONALITY (the brief with [E]/[R]/[N]/[F] marks), USER_FLOWS_AND_WORKFLOWS, COMPONENTS_AND_INTERACTIONS, RESPONSIVE_DESIGN, IMPLEMENTATION_NOTES |
| `02_DESIGN_SYSTEM/` | V8 tokens (JSON + CSS) and the exact V8 visual layer CSS |
| `03_ASSETS/` | 145 icons (sprite, JSON, single SVGs), app icons (Launcher plate + flat mark per app), logos, self-hosted fonts |
| `04_RESPONSIVE_DESIGN/` | Desktop/tablet/mobile rules, navigation behaviour, app-specific mobile requirements, mobile-first master prompt |
| `05_STRATEGY_AND_ARCHITECTURE/` | Ecosystem map, app relationships, navigation map, page hierarchy (177 templates), user journeys, data flow, integrations, permission architecture, cross-app workflows, original strategy material |
| `06_SCREENSHOTS_AND_REFERENCES/` | Every documented page at 1440, 834 and 390 px; overlays and in-page states; the owner's annotated v7 feedback |
| `07_PROMPTS/` | Ready-to-paste prompts P00–P14 (one per app, in build order, plus the full check) and 5 master prompts |
| `08_PROTOTYPE_AND_SOURCE/` | `ecosystem-v8.html`, its full source (rebuilds byte-identical), route inventories, V4 and v7 reference prototypes |
| `09_FINAL_HANDOFF/` | Implementation sequence, completeness audit, the manager's process document, reference specs (Planner, Editors, Projects V2) |

(If you were told to look for `prompts/` and `docs/apps/`: they are `07_PROMPTS/` and `01_APPLICATIONS/<app>/FEATURES_AND_FUNCTIONALITY.md`.)

## 3. Reading order
1. `09_FINAL_HANDOFF/MANAGER_PROCESS_…docx` — **how** to work (plan first, one app at a time, test, report, wait for approval).
2. `00_MASTER_DOCUMENTATION/` documents 00 to 05 in order, then `V8_DESIGN_DECISIONS.md` and `V8_BUG_FIXES.md`.
3. `09_FINAL_HANDOFF/IMPLEMENTATION_SEQUENCE.md`.
4. `07_PROMPTS/ECOSYSTEM_IMPLEMENTATION_MASTER_PROMPT.md`, then `P00…` one at a time.

## 4. Finding things
- **An app's specification:** `01_APPLICATIONS/<NN_APP>/` — start with `APP_OVERVIEW.md` (purpose, sidebar menu with exact labels and destinations, identity).
- **A page:** `PAGES_AND_NAVIGATION.md` in the app folder; each page lists route, access path, layout, sections, every button/link/input with exact labels and destinations, data, permissions, states, and links to its three screenshots.
- **Icons and assets:** `00_MASTER_DOCUMENTATION/08_ASSET_AND_ICON_INDEX.md` → `03_ASSETS/`.
- **Strategy maps:** `05_STRATEGY_AND_ARCHITECTURE/README.md` (Mermaid diagrams + originals; two original canvases are linked, see D17).
- **Responsive behaviour:** `04_RESPONSIVE_DESIGN/` + each app's `RESPONSIVE_DESIGN.md`. Build **[Confirmed]** items; **[Proposed]** items need approval.
- **Exact CSS:** `08_PROTOTYPE_AND_SOURCE/prototype-source/v8.css` (on top of v4–v7 layers).

## 5. Unresolved decisions
`00_MASTER_DOCUMENTATION/04_OPEN_DECISIONS.md` (D1–D18). Use the documented assumption; never decide silently; list any new question in your plan.

## 6. Proving nothing was missed
- Before building an app, copy its page list from `PAGES_AND_NAVIGATION.md` into your plan.
- After building, tick `00_MASTER_DOCUMENTATION/07_IMPLEMENTATION_CHECKLIST.md` and run `07_PROMPTS/FUNCTIONAL_TESTING_MASTER_PROMPT.md` (inventory test: every listed control on every page exists).
- `09_FINAL_HANDOFF/V8_COMPLETENESS_AUDIT.md` shows how this package itself was verified (V8 vs v7: nothing removed).

## 7. Non-negotiables
Preserve every app, page, menu, tab, section, feature, button, workflow, route and permission · do not invent features · permissions on the server · organizations never mix · real links · every control works or says "Later" · V8 visuals only · scope CSS per app.
