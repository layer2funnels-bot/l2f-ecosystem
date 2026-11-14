# Value Ladder · user flows and workflows

Each flow names the prototype route or control. "Source" says where the rule is defined. Cross-app flows: `05_STRATEGY_AND_ARCHITECTURE/CROSS_APP_WORKFLOWS.md`.

## 1. Model a ladder

**Who:** Owner · **Source:** Brief: Value Ladder

1. Ladders (#/ladder/list) → ladder (#/ladder/map/:ladder)
2. Revenue model strip: visitors → step conversion % → revenue per month; edit any rate
3. Add step (each links to a real offer)

## Navigation graph (generated from the prototype links)

Page → pages it links to (within and outside the app).

- `ladder/list` → `ladder/history`, `ladder/map/:ladder`
- `ladder/map/:ladder` → `ladder/history`, `ladder/list`
- `ladder/history` → `ladder/list`
