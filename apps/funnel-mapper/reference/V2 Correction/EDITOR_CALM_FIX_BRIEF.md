# Editor: calm it down — fix brief for Claude Code

Design reference: artboard **`V3-editor-calm`** (annotated screenshot of your current build, the calm target, the three views, and where each number lives). Do not change the maths engine; this is display only.

## What the build shows today (three screenshots)

The same numbers appear in up to five places, and labels collide with blocks. One cause is on the design side: the "Math made plain" spec showed a **sentence on every connection** (e.g. "15% of 63 = 9.5 avg"). That was meant for the *selected* block's explanation, not for all lines at once. **Show the rate only on the line; show the sentence on hover, on selection, and in the math panel.**

## Fixes (in priority order; numbers match the markers on the artboard)

**P0**
1. **One top bar.** Remove the second toolbar row (scenario, vs, period, Play 1×/2×/4×, Walk-through, Reset). Playback and Walk-through live inside the **Simulate** panel only. The Day / Week / Month / Year choice belongs to the People and Money views as a small "Per month ▾" control.
2. **One scenario control.** Keep the top-bar chip. The Simulate panel shows only **what changed**, not the scenario again.
3. **Edge labels = rate only** ("35%"). People on hover. The full sentence on hover or selection and in "How the math works". Labels must never overlap a block: place at the midpoint; hide when the line is shorter than label + 16 px; on collision hide the lower-priority label (leak labels win).
4. **Biggest leak marker** = dashed orange ring plus a small chip **above and to the left** of the block, never over the name, and **no number on the chip**. The number appears once in the funnel panel sentence and once on the leak line.
5. **One home per number** (table below). Remove traffic and spend from group labels (names only), remove the totals repeated in the Simulate panel and the funnel panel (link to Reports instead).
6. **Whole people, no noise.** Never show "9.5 avg", "0.2 avg" or "0 → 0" on a block or line. Round to whole people, show `<1` for tiny non-zero values, and hide the line label (or fade the line) when a step has no flow. "avg" is allowed only in tooltips.
7. **Simulate header:** give **Done** and the collapse arrow separate 44 px targets; put Done in the panel footer.
8. **Loop and skip lines** must not cross blocks: route them around with 12 px clearance, or draw them only on hover or selection. The long curve behind the Attendance row is the case to fix.
9. **Clean means no numbers.** In Clean the canvas shows names, types and lines only: no in/out text, no percentages, no edge labels. (Today Clean still shows "700 → 420 60%" and labels.)

**P1**
10. **Three views** replace the current Clean / Performance split: **Clean**, **People** (default), **Money**. People shows one people number per block and one rate per line. Money shows one money number per block (revenue on offers, spend on sources) and keeps the rates. **Layers** stays for notes, checklists and forecast badges.
11. **Inspector:** move "Flow this month" (arriving, moving on, dropping off) from the block's Details tab to its **Analytics** tab. Details holds only inputs.
12. **Floating toolbar** ("Add next step", style, lock…) should not cover the block's ports or the lines leaving it.

## Where each number lives

| Number | Lives here | Not here |
|---|---|---|
| Traffic | KPI strip, once | group labels, blocks, Simulate panel (it shows only the change) |
| Rate between steps | on the line, rate only | block text; the sentence only on hover/selection and in the math panel |
| People in a step | on the block (one number) | in/out pair on the block; that is Analytics |
| People lost | on the leak line, once | plus one sentence in the funnel panel |
| Revenue, profit, ROAS | KPI strip, once; Money view on offers | repeated totals in the panel |
| Price, rates, visits | Quick Settings and Details (inputs) | — |

## Quick Settings (double-click a block)

**Drawn in the `V3-quick-settings` artboard:** one popup per block type (page, offer, condition, traffic source, message, action), plus the editing, invalid-entry and view-only states. Build it to match.

A small popover opening **below** the block (same placement rule as the hover preview: below, then above, right, left; never over the block or its ports; never over the next step). It holds only the **two to four settings people change most**, taken from inputs the engine already has for that block. Enter applies, Esc closes, Tab moves between fields, and the numbers on the canvas update live. Fields: sliders for rates with a number box beside them, number boxes with units (AED, %, visits), a segmented control where there are two options, and a select for types. A result line under the fields states what the entry means in people. A footer link **More settings ›** opens the full inspector (Details). Single click still selects; Enter on a selected block opens Quick Settings.

| Block | In Quick Settings | Stays in the inspector |
|---|---|---|
| Page | People who continue (rate), page type, status | URL, preview image, notes, style, plan, analytics |
| Offer | Price, buy rate, and a refund rate **only if the engine models refunds**, counts as (one-time or monthly) | costs, order bump, subscription length, notes |
| Condition | Question, Yes % (No shown as the automatic remainder) | description, style |
| Traffic source | Visits per month, and spend (or cost per visit) | platform, notes |
| Message / email | People who move on (rate), wait before | content notes |
| Action (event) | Counts as (lead, customer, …) | label, style |

If a field above does not exist in the engine, omit it. Do not add fields.

## Acceptance and tests

- Playwright test per view: **Clean = 0 numeric tokens on the canvas** (group names allowed); **People = at most one numeric token per block** and one per line; **Money** likewise.
- No label bounding box intersects a block's title box (assert on the real webinar funnel and on a 20-block funnel).
- A given number (e.g. total traffic) appears at most once outside Reports.
- Screenshot test for Clean, People and Money on the Webinar Funnel template; check at 100% and 50% zoom.
- Existing math, report, scenario, forecast, goals and sharing tests all still pass; no calculated number changes.
- Keyboard: Enter opens Quick Settings, Esc closes, focus returns to the block.

## What I (design) could not check

I cannot open your running app or run its tests from the design environment. These fixes come from the three screenshots; please verify each in the browser and send a screenshot of a funnel with 15 or more blocks if anything still looks busy.

## The new editor (supersedes patching the current one)

Build the editor to the **`V3-editor`** (nothing selected) and **`V3-editor-edit`** (block selected, settings box open) artboards, with **`V3-settings-box`** for every block type. Light versions: `Light-V3-editor`.

- **One top bar** (crumb, scenario chip, save state, Map/Reports, Model/Actual, undo/redo, Tidy up, comments, history, present, Share). No second toolbar row.
- **Left rail only** (Blocks, Templates, Outline, Checklists). The library opens as a drawer from the rail, so the canvas keeps the full width.
- **Right panel collapsed to a rail by default** (Checks with a count badge, Goals, Outline, History); it opens for whole-funnel work. Block editing happens in the **settings box**, not the right panel.
- **Views:** Clean / People / Money, plus a "Per month" period control. Default People.
- **Blocks:** real page and offer objects, **one number per block** (people in, or money in Money view). Lines show **rate only**; the one leak line shows people lost, once. Group frames show names only. "Biggest leak" is a dashed ring and a chip above-left, no number.
- **KPI strip:** Checks, Plan tag, Traffic, Revenue, Profit, Customers, ROAS, Leads, "+ 9 more" (Traffic first, never hidden).
- **Settings box (double-click or Enter):** a tabbed box on the block. **Settings** (first; the few numbers people change most), **Page** (pages: name, URL, preview Capture / Upload / Wireframe), **Pricing** (offers: price, setup fee, trial price), **Style** (colour, icon, show or hide the block's number), **Notes** (note and checklist). The footer holds **Duplicate, Lock, Move to Trash** and **Open full panel ›**. Only use fields the engine already has.
- Measured on the design boards: **37 numeric labels in the old default editor, 19 in the new one**, with no number repeated three or more times.

## Update: status, scenario, calendar, right panel

Artboards: **`V3-top-controls`** and **`V3-right-panel`** (plus the updated `V3-editor`, `V3-editor-edit`, `V3-settings-box`).

1. **No per-block status.** Remove the "Planned" dropdown from every block (header and settings box). A **funnel** has a status (Draft or Live), set in the funnel panel. If build progress is wanted, make it an **optional layer** (Layers menu) where several selected blocks are set together. Do not add it to the default settings box.
2. **One Plan control** replaces the scenario chip, the "vs Baseline" row and the Model/Actual toggle: `PLAN  Baseline ▾ | Actual`. The dropdown lists Baseline (current map), saved scenarios with a one-line summary of their changes, **+ New scenario from Baseline**, and a **Compare with Baseline** switch (off by default; when on, blocks and the strip show ▲ ▼ changes). When a scenario other than Baseline is active, show a slim banner: "Editing {scenario}. Baseline is untouched. Back to Baseline." Baseline is never edited by accident.
3. **One calendar** next to the Clean / People / Money views, replacing "Per month". Presets (Today, This week, This month, Last 30 days, This year, Custom range) and a two-month calendar. In **Plan**, numbers scale to the length of the chosen range (7 days = a week); in **Actual**, they are the real entries for those dates, and days with entries show a dot. The engine already scales Day / Week / Month / Year: **confirm how it should scale an arbitrary range** before building, and do not change the maths.
4. **Right panel redrawn (`V3-right-panel`).** Funnel level: Checks, the one Biggest-leak sentence with Locate and Run what-if, revenue basis, funnel status, currency, and a link to Reports. Block **Details** = inputs only (no status, no numbers). Block **Analytics** = results only: people in / moving on / dropping off as whole numbers (never "0.1 avg"; use `<1`), where people go, the goal, and the step over time (Day, Week, Month, Year; In and Out only). Remove the Cost column from the step table; cost lives on sources and offers.

## Update: left sidebar, funnels list, real data entry, block design

- **Keep the original left sidebar** (rail plus Blocks panel) exactly as designed in `Editor-default`. The new editor boards now show it. Do not replace it with a rail-only layout.
- **Funnels list (`V3-funnels-list`):** add select checkboxes, a row menu (Open map, Open reports, Rename, Duplicate, Move to client, Status, Archive, Move to Trash), inline rename and a bulk bar. Drop the Scenario column.
- **Real data entry (`V3-actual-data`):** new feature. Switch to Actual in the Plan control, type on the block (Actual tab), use the Enter numbers grid, or Import CSV.
- **Block design:** `V3-block-design-proposal` is a **proposal only**. Do not build it until the owner chooses.

See `PROMPT_FOR_CLAUDE_CODE.md` for the single prompt to give Claude Code.
