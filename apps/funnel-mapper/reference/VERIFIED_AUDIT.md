# Funnel Mapper Pro V2 — Verified audit and corrections for approval

**Scope.** I checked the 11 findings from the screenshot audit against all 37 boards in the design package, the V1 product audit in the project files, and the recorded product decisions. **I have no access to the running app or its repository**, so anything about current app behaviour is marked *needs verification*. Nothing here changes maths or business logic.

**What was done in this pass (your direct requests):** your block icons in the library and the editor sidebar; the page screenshot thumbnails and hover peek applied across the product boards; a new *Blocks sidebar* board (which answers where widgets live); and the simulation spec for Claude Code (`SIMULATION_SPEC.md`). **The corrections below are proposals.** Approve them and I will apply them.

## 1. The 11 findings, checked

| # | Finding | Status | Where | What's wrong, and why it matters | Correction | Source |
|---|---|---|---|---|---|---|
| 1 | Visual direction | **Not present** in the design; **confirmed** as a risk | All 37 boards are dark. Settings › *Appearance* exists, but its options are not designed. | The light screenshot almost certainly came from the **current live app** (light theme, red accent), not V2. The risk is the Appearance page: if it offers a light theme, nothing in the package designs it. | **Dark is authoritative** (your decision). Either remove the theme choice from Appearance, or approve a light theme as a separate project. | Package + your decision |
| 2 | Revenue and periods | **Confirmed** | Canvas objects (`$3,064`, `$3,188`, `$1,234` show no period); Forecast (`Revenue $196.2k` sits next to monthly figures); Client (`Planned revenue (live) $63,250 / mo`); *Count revenue as First payment / Lifetime value* changes every revenue figure but is shown only in the funnel panel. | A person can't tell whether `$3,188` is per month, per year or lifetime, or whether `$196.2k` is a total. Wrong decisions follow. | Every money figure carries a period: `/ mo`, `/ yr`, or `12-mo total`. When the funnel counts lifetime value, add an `LTV` tag beside revenue on the KPI strip, Reports header, widgets and PDF. Forecast totals read `12-month total`. Drop "(live)" from the Client page. | Package |
| 3 | Fractional people | **Confirmed** | Canvas `82.8 buy`, `No 53.8`, `45.7 buy`; KPI strip and Reports `Customers 128.5`; block Analytics `Day 75.6 → 34` | Half a customer reads as a bug and undermines trust in every other number. | Show whole people everywhere (`83 buy`), with the exact modelled value on hover (`82.8 · modelled average`). Under 10, show one decimal with *avg*. Money is still calculated from the exact values. **Needs your decision** (Q2). | Package |
| 4 | Simulation comparison | **Partly confirmed** | *Simulate › Scenarios* lists Baseline "Current map" **and** Expected "Same as map". The top bar shows only `Expected`. No board shows the canvas while simulating. | Two names for the same thing confuse which one is the comparison point. Without a simulation view, changed assumptions and before → after live only in a list. Timestamps are not used (good). | Rename to **Baseline (current map)** and remove the duplicate Expected, or give it real assumptions. Top bar: `Scenario: Best case · vs Baseline`. Simulation as specified in `SIMULATION_SPEC.md`: Δ chips on changed blocks, before → after on the KPI strip. | Package |
| 5 | Validation status | **Confirmed** (label) | KPI strip `4 checks`; panel `Health · 4 checks — Fix in order` | "4 checks" reads like 4 passed when it means 4 problems. "Health" sounds like performance. | Rename to **Model checks**: `4 to fix` (amber) or `All clear` (emerald). Keep it separate from performance (Biggest leak) and from data freshness (`Actuals updated 3 Oct`). | Package |
| 6 | Data provenance | **Confirmed** | *Track › Actuals* tab exists. Widgets show `Actual / Plan · −7.7% vs plan · last full month`. Canvas and Reports don't mark which numbers are modelled and which are actual. | A strategist presenting to a client must know whether a figure was measured or assumed. | One tag system: **Plan** (modelled), **Forecast** (projected), **Actual** (entered or imported, with period and source on hover). The Reports header states the basis: `Plan · Expected scenario · per month`. | Package; actuals behaviour needs verification |
| 7 | Navigation and labels | **Confirmed** (wording) | Top bar `Expected` (an unlabelled scenario name), `Tidy up`, view toggle `Clean · Performance · Layers`. "Live" means three things: block status, funnel status, and recalculated numbers. | Ambiguous words slow every new user, and "Live" can mislead a client. | `Scenario: Expected`. `Tidy up` → **Arrange**, with tooltip *Auto-arrange blocks ⇧⌘L*. "Live" only for published funnels and pages; recalculated numbers get no label. The 16 icon-only editor buttons already have accessible names, so keep them. | Package |
| 8 | Canvas connections | **Mostly working** | `Blocks-and-lines.dc.html`: converted = solid + right (Y) port; didn't convert = dashed orange + bottom (N) port; skip = dotted. People on every path. | Not colour-only (good). Gap: path labels shrink to about 7px at 60% zoom and no low-zoom rule exists. | Below 50% zoom hide path numbers but keep thickness and dashes. Keep the people count on hover. | Package |
| 9 | Product coverage | **Mostly covered** | Home, Clients, Client, Products, Funnels, Templates, Editor, Funnel tools, Performance, Widgets, Reports, Share, Shared view, Present, Settings | Missing: a new client and new workspace setup flow (buttons exist, no form board), an export preview (PDF / PNG), an Appearance page, and simulation (now specified). | Add boards for: New client form, PDF export preview, and either Appearance or its removal. | Package |
| 10 | States and devices | **Confirmed gaps** | No first-use state anywhere; few product-level empty states; loading and error only for thumbnails; `Saved` exists but not unsaved, offline or save-failed; viewer role only in Settings; phones designed at 390 only; phone controls 28–34px | Blank or unexplained screens are where people get stuck. Small targets cause mis-taps. | Design empty and first-use states for canvas, clients, funnels and reports. Add save states (*Saving… / Saved / Not saved — retry / Offline*). Add the viewer-role editor. Make phone targets 44px. Check 414 and 430. | Package |
| 11 | Intelligence readiness | **Good foundations exist** | *Biggest leak* with **Locate**; *Model checks* with *Fix in order*; goal impact (`Hitting 50% adds about $375 / mo`); Reports *Try in What-if* and *Click a bar to find it on the map* | These are deterministic, useful and already in the right places. | Unify them as one **Finding** component (headline · evidence · impact · action). Reserve an Insights slot in block Analytics. Add provenance tags (finding 6) and a command registry behind ⌘K. Build no intelligence features now. | Package |

## 2. Prioritised corrections

### P0 — must fix before design freeze

| Screen / component | Correction |
|---|---|
| Canvas, KPI strip, Reports, Widgets, PDF | Period and basis on every money figure (finding 2). |
| Same surfaces | Whole-person display rule (finding 3, after your decision). |
| Scenarios + top bar | Baseline naming, the scenario chip, the simulation view per spec (finding 4). |
| Funnel panel + KPI strip | "Model checks · 4 to fix" (finding 5). |
| Canvas, Reports, Track | Plan / Forecast / Actual tags and the Actuals period picker (finding 6). |
| Canvas, Clients, Funnels, Reports | First-use and empty states (finding 10). |
| Phone editor | 44px touch targets (finding 10). |
| Whole package | One visual check in a real browser (nothing has been verified by screenshot). |
| Library | Reconcile the 169 against the app's block definitions; send the 3 Communities blocks below the fold. |

### P1 — strongly recommended

| Screen / component | Correction |
|---|---|
| Top bar | `Scenario:` label; Tidy up → Arrange; one meaning for "Live" (finding 7). |
| Canvas | Low-zoom rule for path labels and page objects (finding 8). |
| Save indicator | Saving / Not saved — retry / Offline (finding 10). |
| Editor | Viewer-role state; report-level error and no-data states (finding 10). |
| New boards | New client form; PDF export preview; simulation board from the spec (finding 9). |
| Insights | One *Finding* component replacing three styles (finding 11). |
| Phones | 414 and 430 checked against 390. |

### P2 — future enhancement

- A split-screen scenario map.
- Light theme, only if you want one (finding 1).
- *Show page previews* switch on share links (client privacy).
- An Intelligence entry in navigation, only when real findings exist.

## 3. What already works well

- The page object: a window of the real page, two numbers, a type caption, and Y / N paths. A person recognises a page before reading it.
- Connections read without colour alone (port position, dash, labels).
- **Model / Simulate / Track** is a clear product loop, and Scenarios already say what they change in words, not timestamps.
- *Biggest leak → Locate* and goal impact are the right kind of help: deterministic, contextual and actionable.
- Reports state "Per month unless stated" and "Same engine as the map and the PDF". That is exactly the trust message.
- The dark, Emerald, editorial direction is applied consistently on all 37 boards.

## 4. Simpler, like GERU and Funnelytics

Their strength is that each screen asks one thing of you. Applied here:

- **Blocks sidebar (done):** one list instead of 9 filter chips plus sections. Search, Recent, client products, then categories.
- **Funnel panel:** 3 modes with 11 sub-tabs is the heaviest part of the product. Proposal: each mode opens on its most-used view, and the rest sit one level down.
  - Model: Overview, with Steps / Sources / Costs below.
  - Simulate: What-if, with Scenarios below.
  - Track: Forecast, with Actuals below.
- **Numbers on objects:** keep two numbers per object. Resist adding more.
- **KPI strip:** keep 6 KPIs plus *more*.

## 5. Questions that need your decision

1. **Light theme:** remove the theme choice from Appearance, or design a light theme later?
2. **People:** round to whole numbers in the UI with the exact value on hover (recommended), or show decimals with an *est.* label?
3. **Expected scenario:** delete it (it equals Baseline) or give it real assumptions?
4. **Revenue basis:** when a funnel counts lifetime value, show `LTV` beside every revenue figure (recommended), or only in Reports?
5. **Actuals:** where do actuals come from: typed in, imported (CSV), or both? This decides what the source tag says.
6. **Simulation:** v1 without a split-screen map, as in the spec? And no random (Monte Carlo) simulation?
7. **Communities:** send the 3 blocks below the fold, and the rest of the block definitions, to lock the 169.

## 6. Design-freeze checklist

- [ ] Every money figure has a period (and LTV when relevant).
- [ ] People shown by the agreed rule.
- [ ] Baseline is unambiguous; scenario chip in the top bar; simulation view built from the spec.
- [ ] "Model checks" separate from performance and from data freshness.
- [ ] Plan / Forecast / Actual tags with period and source.
- [ ] First-use and empty states for canvas, clients, funnels and reports.
- [ ] Save states including offline and failed.
- [ ] Viewer-role editor.
- [ ] Phone targets 44px; 414 and 430 checked.
- [ ] New client form and PDF export preview designed.
- [ ] Library reconciled to 169.
- [ ] One visual pass in a real browser, every board.

## 7. Gaps that prevent a firm conclusion

- **No access to the running app or its code.** Current behaviour of actuals, sharing permissions, exports and the Appearance setting is inferred from the V1 audit and the designs.
- **The screenshot audit's source image wasn't supplied.** I'm assuming it was the live app, based on the light theme.
- **The block definitions file has not been provided.** The 169 can't be certified.
- **No board has been seen rendered.** All checks were structural plus the image crops I viewed.
