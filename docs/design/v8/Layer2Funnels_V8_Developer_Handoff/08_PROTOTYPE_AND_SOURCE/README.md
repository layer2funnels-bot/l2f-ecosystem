# 08 · Prototype and source

- `ecosystem-v8.html` — **the V8 prototype** (single file, works offline except Google Fonts). Open in Chrome; start at `#/map` (all routes) or `#/launcher`. Bottom-right "Prototype" button: organization, theme, extra screens.
- `prototype-source/` — the source it is built from: vanilla JS view modules and CSS layers. **Later files override earlier ones:** `base.css → v4.css → extra.css → v5.css → v6.css → v7.css → v8.css` and JS v5 → v6 → v7 → v8. `scope.py` confines Funnel Mapper CSS to `.fmpx` at build time. Rebuild: `python3 prototype-source/build8.py` (writes `ecosystem-v8.html`; byte-identical to the shipped file).
- `routes.json` — the 122 routes of the v7 route list (labels, groups). `v8-route-inventory.json` — every route reachable in V8 (BFS crawl) grouped by page template.
- `reference-prototypes/` — `ecosystem-v4.html` (historical, approved 23 Oct 2026) and `ecosystem-v7.html` (previous version) for comparison only. V8 wins.
- The prototype's data, toasts and fake actions are illustrations, not product behaviour.
