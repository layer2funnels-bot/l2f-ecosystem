# Funnel Mapper · app overview

**Purpose:** Visual funnel maps and funnel maths (separate repo, approved dark identity).

**Status vs repo:** [R] rename + sizing + [N] shared clients · **Build prompt:** P07 · **Launcher group:** Studio

**Identity:** app id `fmp`, launcher description “Map, model and forecast”, plate colours #5CE6B2, #10B981, #087850, glyph colour . Icons: `03_ASSETS/app-icons/fmp-launcher-plate.svg` (Launcher) and `fmp-flat-mark.svg` (rail and work screens, V8).

## Sidebar menu (exact labels and destinations)

- Home → `fmp/home`
- Clients 4 → `fmp/clients`
- Funnels 6 → `fmp/funnels`
- Templates → `fmp/templates`
- Trash 3 → `fmp/trash`
- Sam Carter → `fmp/client/:client`
- Priya Nair → `fmp/client/:client`
- Marcus Lee → `fmp/client/:client`
- Settings → `fmp/settings`
- Help & shortcuts ? → `fmp/help`

## Size of this app in V8

- 10 documented pages (one per screenshot) covering 10 page templates.
- Full page list: `PAGES_AND_NAVIGATION.md`. Features: `FEATURES_AND_FUNCTIONALITY.md`. Flows: `USER_FLOWS_AND_WORKFLOWS.md`.

## V8 look for this app

- Keeps its own dark navy + emerald identity (approved).
- All Funnel Mapper styles are confined to the app (prefix .fmpx) so they can no longer leak into other apps (root cause of the Drive bug).
- Clients page: cards are a grid (avatar · name/business · status, then funnels/retainer line); names never break word by word.
- Editor inspector 340 px at ≥1280 px; inspector text 14.5 px, tabs 13.5 px.
- Text floor 12 px for small labels.

Home screenshot: [desktop](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/07_FUNNEL_MAPPER/069_fmp_home.jpg) · [phone](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/07_FUNNEL_MAPPER/069_fmp_home.jpg)
