# Prompt for Claude Code (paste this)

You are implementing the Funnel Mapper Pro V2 editor redesign. The design lives in the package in `project/*.dc.html` (artboards) and in the design file "Funnel Mapper Pro — Redesign v2". Read, in this order: `EDITOR_CALM_FIX_BRIEF.md`, then `CLAUDE_CODE_IMPLEMENTATION.md`. Build to the artboards named below.

## Hard rules
- **Do not change the maths engine**, database architecture, RLS, roles, or workspace isolation. Display and input features only. Every number on screen comes from the engine.
- **Keep the existing left sidebar in the editor exactly as it is** (rail plus the Blocks panel: search, Recent, the client's products, category accordion). Do not redesign or remove it.
- **Dark is the default theme and stays unchanged; Light is an additional theme** (F13 in the instructions). Never use colour alone for meaning. Touch targets 44px.
- **Every stored image is under 100 KB.**
- **Do not build** the block redesign in `V3-block-design-proposal`. It is a proposal awaiting the owner's decision.
- Do not invent fields. Use only inputs the engine already has; skip any that it does not (for example refund rate).

## Build in this order (artboard → what to build)
1. **`V3-editor`, `V3-editor-edit`, `Light-V3-editor`**: one top bar; the original left sidebar; right panel collapsed to a rail by default; Clean / People / Money views; one number per block; line labels show the rate only (people on hover); one leak label; "Biggest leak" ring plus chip (no number); KPI strip with Traffic first and never hidden.
2. **`V3-top-controls`**: replace the scenario chip, the "vs Baseline" row and the Model/Actual toggle with one **Plan** control (`PLAN Baseline ▾ | Actual`): scenario list with summaries, "+ New scenario from Baseline", a **Compare with Baseline** switch, and the "Editing {scenario}. Baseline is untouched." banner. Replace "Per month" with the **date calendar** (presets plus any range). Confirm with the owner how the engine should scale an arbitrary range before building; do not change the maths.
3. **`V3-settings-box`** (and `V3-quick-settings`): double-click or Enter opens a tabbed box below the block: Settings, Page (pages) or Pricing (offers), Style, Notes; footer with Duplicate, Lock, Move to Trash and "Open full panel ›". Edits update the canvas live; Enter applies, Esc reverts. **No per-block status** anywhere.
4. **`V3-right-panel`**: funnel level (checks, one Biggest-leak sentence, revenue basis, funnel status, currency); block Details = inputs only; block Analytics = three whole numbers, where people go, goal, step over time. No "0.1 avg", no Cost column, no repeated totals.
5. **`V3-funnels-list`**: add the checkbox column, a "⋯" menu on every row (Open map, Open reports, Rename (F2, inline), Duplicate, Move to client…, Status ▸ Draft / Proposed / Live / Archived, Archive, Move to Trash), and a bulk bar when rows are selected (Change status, Move to client, Archive, Move to Trash). Remove the Scenario column. Trash needs a confirmation; clients ask for the name to be typed.
6. **`V3-actual-data`**: real data entry. **New feature, nothing exists today.** Data model in section F4 of the instructions. Entry points: the Plan control's Actual tab; the **Actual** tab in a block's settings box (people in, people who moved on); an **Enter numbers** grid (Month / Week / Custom) with paste; **Import CSV**. Show differences from Plan as signed chips (points for rates).
7. Everything else (templates inside the map, Trash, Home date range, image import, exports, states, themes): follow `CLAUDE_CODE_IMPLEMENTATION.md`.

## Verify before you finish
Run the app in a browser and open a funnel with 15 or more blocks. Check: Clean shows no numbers; People shows at most one number per block; no label overlaps a block title; a given total appears once outside Reports. Run the existing tests (maths, reports, scenarios, forecast, goals, sharing) and add Playwright checks for the points above. Send screenshots of the editor in Dark and Light, the settings box on each block type, the Plan control and calendar, the Funnels list menu, and the Actual entry grid. List anything in the design you could not build or had to change, and why.
