# Simulation — what it should look like (instructions for Claude Code)

**Read first.** Simulation is a **way of showing** the numbers the funnel engine already produces. It must **never create numbers of its own**. Every figure on screen comes from the same engine as the map, the KPI strip, Reports and the PDF. The animation is illustration only. Do not change any maths or business logic to build this.

Design references in this package: `Funnel-tools.dc.html` (*Simulate › What-if* and *Simulate › Scenarios*), `Performance-map.dc.html`, `Blocks-and-lines.dc.html` (connection styles), `Page-block-thumbnails.dc.html` (page object, hover peek), `Present.dc.html`, `Shared-view.dc.html`.

---

## 1. What the user is doing

The user asks one question: **"If I change this, what happens to the funnel?"** Simulation must answer it in three places at once:

1. **The map**: people visibly flowing, and where they leave.
2. **The KPI strip**: before → after for the headline numbers.
3. **The inspector**: the assumption being changed, with its baseline value.

If a user can't tell **what changed, against what, and by how much** within five seconds, the screen is wrong.

## 2. Entering and leaving

| Item | Behaviour |
|---|---|
| Enter | The funnel panel's **Simulate** tab, or the top-bar **Simulate** toggle, or the <kbd>S</kbd> key. |
| On enter | The canvas switches to the Performance layer automatically. A slim **simulation bar** appears at the top of the canvas (see 3). Panels stay where they are. |
| Leave | Toggle off, <kbd>S</kbd>, or <kbd>Esc</kbd> with nothing selected. The previous layer is restored. Unsaved what-if changes ask once: *Keep as a scenario / Discard*. |
| Label | Call it **Simulate**, not "Sim On". The toggle shows its state with an emerald fill and the word, never with colour alone. |

## 3. The simulation bar (top of canvas, 40px, `#111827`, bottom border `#1E293B`)

Left to right:

- **Scenario chip**: `Scenario: Best case` with a dropdown. Never identify a scenario by date or time.
- **"vs" chip**: `vs Baseline (current map)`. Changeable to any other scenario.
- **Changed list**: `2 changes · Traffic +25% · Fitness quiz 45% → 50%`. Clicking it opens the list. Clicking an item selects that block.
- **Period**: segmented `Day · Week · Month · Year` (default Month).
- **Playback**: ▶ / ❚❚ (<kbd>Space</kbd>), speed `1× · 2× · 4×`.
- **Reset to baseline** (text button) and **Save as scenario** (primary, only when there are unsaved changes).

## 4. The map while simulating

**Connections**
- Thickness is proportional to people per selected period: minimum 1.5px, maximum 10px, square-root scale so a small branch never disappears.
- **Converted** paths are solid emerald `#10B981` and leave the object's **Y** port.
- **Leak** paths are dashed orange `#F97316` (6/5 dash) and leave the **N** port.
- **Skip / no-data** paths are dotted slate.
- The meaning is carried by colour, dash, port position and label together, never by colour alone.
- Labels sit on the path: people for the period (`1,035`), and on leak paths a minus sign: `−1,265 / mo`.

**Flow dots (the animation)**
- Small dots travel along each path in the direction of flow: 4px emerald on converted paths, 4px orange on leak paths.
- Density is proportional to volume. Cap at one dot per 24px of path and **300 dots on screen in total**. Speed is the same on every path, so speed never implies a rate.
- Pause automatically when the tab is hidden or while the user drags or pans.
- **Reduced motion:** no dots at all. The thickness and labels carry everything.
- Over 150 blocks: dots are off by default, with a hint to turn them on.

**Objects**
- Objects show the same two numbers as on the map (people in → people through, then the headline result). There is no new layout.
- **Changed by this scenario:** an amber `Δ` chip on the object's top-right corner. Hovering shows `Conversion 45% → 50% · Best case`.
- **Biggest leak:** the existing leak treatment (orange ring) stays visible during simulation.
- **Page objects** keep their screenshot window and the hover peek.

**Numbers**
- **People:** see section 7.
- **Money:** always carries its period (`$7,485 / mo`) and, when relevant, its basis (`first payment` or `lifetime value`), matching the funnel's *Count revenue as* setting.
- **Deltas:** a sign, an arrow and a colour, for example `▲ +$749 / mo` in emerald and `▼ −120 / mo` in orange. Never colour alone.

## 5. The KPI strip while simulating

Each KPI shows **scenario value**, a small **baseline value** underneath (`was $6,825`), and a **delta chip**. The strip header reads `Best case vs Baseline · per month · USD`. *+6 more* expands the same way.

## 6. What-if on a selected block

When a block is selected in Simulate, the inspector shows that block's assumptions as rows:

- **Label + current value field + slider**: for example Conversion `50%` with a slider from 0 to 100.
- **Baseline marker**: a small tick on the slider at the baseline value, and `baseline 45%` under the field.
- Editing recomputes immediately (debounce 150ms). The map, KPI strip and delta chips update together.
- The row shows `Reset` when it differs from baseline.
- At the bottom: **Save as scenario**. If the change came from the funnel's *Biggest leak* card, the scenario is named after it (for example *Fitness quiz +5 pts*). The user can rename it.

## 7. Fractional people (decision needed — default proposed)

The engine models averages, so it produces values like `82.8` buyers. Showing a fraction of a person reads as an error to most people.

- **Default display:** round to whole people everywhere in the UI (`83 buy`, `Customers 129`).
- **Exact value:** on hover or in the inspector: `82.8 (modelled average)`.
- **Values under 10:** show one decimal with *avg* (`4.6 avg / day`) so small daily rates don't round to 0.
- **Money and percentages:** calculated from the exact values, never from the rounded ones.

## 8. Comparing scenarios

- **Scenario list** (*Simulate › Scenarios*):
  - **Baseline** is always the current map and is called *Baseline (current map)*. There is no second scenario called "Expected — same as map": either remove it or make it a real, different set of assumptions.
  - Each scenario row shows its assumptions in words (`−20% traffic · −10% conversion`), never a timestamp.
- **Compare side by side:** opens Reports › Scenario comparison with the two scenarios as columns and a delta column. Rows are Traffic, Leads, Customers, Revenue, Profit, ROAS, MRR. Deltas use the same chip as the KPI strip.
- **Optional, phase 2:** a split map (two synced canvases). Not needed for v1.

## 9. Walk-through (for presenting)

A **Walk-through** button on the simulation bar steps through the funnel one stage at a time (<kbd>→</kbd> / <kbd>←</kbd>). The current step is highlighted, the others are dimmed to 35%, and a caption appears beside the step: `Fitness quiz · 2,300 arrive · 1,035 continue · 55% leave`. Present mode and Shared view reuse this.

## 10. States

| State | What the user sees |
|---|---|
| No traffic source | The canvas is dimmed, with one message: *Add a traffic source to simulate* and an **Add source** button that opens the blocks sidebar on Traffic sources. |
| Model checks failing | Simulation still runs. An amber line in the bar: *2 issues may affect these numbers · View*. It opens Model › Checks. |
| Computing | Under 200ms: nothing changes visually. Over 200ms: a 2px progress line under the simulation bar. Numbers never flicker to zero. |
| Unsaved changes | A dot on *Save as scenario*. Leaving asks once. |
| Viewer role / Shared view | Can play, change period and switch between shared scenarios. Cannot edit assumptions. What-if rows are read-only, with *Ask the owner to edit*. |
| Offline | Simulation keeps working from the last loaded model. Saving a scenario waits and says *Will save when you're back online*. |

## 11. Responsive

| Width | Layout |
|---|---|
| 1280 and above | As specified. |
| 1024 / 768 | The simulation bar wraps the *Changed* list into a chip. The inspector becomes a drawer. |
| Phone (390–430) | Simulation is **view-only**: play, period and scenario switch in a bottom sheet. No dot animation; thickness only. What-if editing opens a full-height sheet for one block at a time. All touch targets are 44px or more. |

## 12. Accessibility and performance

- 60fps target, using `requestAnimationFrame`.
- Every change of state is announced (`Scenario Best case: revenue up $749 per month`).
- Keyboard: <kbd>S</kbd> toggles simulate, <kbd>Space</kbd> plays or pauses, <kbd>Esc</kbd> leaves. Every control is reachable.
- Contrast is at least 4.5:1 on all numbers.

## 13. Acceptance checklist

- [ ] No number in Simulate differs from the same number in Reports or the PDF for the same scenario and period.
- [ ] Turning animation off (or reduced motion) loses no information.
- [ ] Baseline, active scenario and the changed assumptions are visible without opening anything.
- [ ] Every delta has a sign and an arrow, as well as colour.
- [ ] Every money figure states its period, and its basis where the funnel uses lifetime value.
- [ ] People are whole numbers in the UI, with exact values on hover (or the rule the owner chooses in section 7).
- [ ] Leaving simulate never loses work without asking once.
- [ ] Phone is view-only and usable with one thumb.
- [ ] No random or probabilistic simulation (Monte Carlo) unless the owner asks for it. The engine is deterministic.
