# 02 · Design system files (V8 "Ledger")

| File | What it is |
|---|---|
| `tokens.json` | Design tokens for the four sets `l2f-light`, `l2f-dark`, `aurj-light`, `aurj-dark` plus `funnel-mapper` (its own dark theme). Values are the **computed** values of the V8 prototype, so they match the screenshots. Merge into `packages/ui/tokens.json`. |
| `tokens.css` | The same tokens as CSS custom properties on `[data-org][data-theme]`. Merge into the repo stylesheet; do not create a parallel system. |
| `v8-ledger-visual-layer.css` | The exact V8 visual layer that sits on top of v7 in the prototype (`prototype-source/v8.css`). Use it as the reference for every rule in `00_MASTER_DOCUMENTATION/01_DESIGN_SYSTEM.md`. |

Rules: no hex colours in component CSS (repo design test DV20) — use tokens. Dark-mode shadows: see open decision D12 (the file ships the v7 dark shadows).
