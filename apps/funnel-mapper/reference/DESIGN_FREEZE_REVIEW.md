# Funnel Mapper Pro — Design-Freeze Review

**Verdict: not frozen yet.** The page and offer object, the library structure and the object states are now in a state that can be frozen. Five P0 items still block the freeze. None of them needs new maths, a new architecture, or any intelligence feature.

**How this was reviewed.** A structural audit of all 34 boards (markup, tokens, counts, coverage) plus the changes made in this pass. **Nothing was checked by screenshot**, because no browser was available in this environment. A visual pass in a real browser is itself a P0 item (G-1).

## 0. Branding decision (recorded)

The current branding is kept. Nothing in the brief overrides it.

- **Colour (locked, unchanged):** Emerald `#10B981` / `#059669` / `#047857` / `#34D399`, success `#22C55E`, canvas `#0B1220`, library `#0F172A`, chrome `#111827`, panels `#1E293B`, borders `#334155`, text `#E2E8F0` / `#94A3B8`.
- **Categories:** Traffic `#60A5FA`, Pages `#A78BFA`, Offers `#FB923C`, Actions `#2DD4BF`, Logic `#FBBF24`, Goals `#84CC16`, Notes `#FDE68A`.
- **Typography:** **Bricolage Grotesque** for titles and numbers, **DM Sans** for UI text, **JetBrains Mono** for technical text. Inter and Instrument Serif are not used on any board (0 declarations) and the product has no editorial hero surface that would need a serif.
- **Correction to the master brief, section 2:** replace the typography lines with *"Bricolage Grotesque (titles, numbers), DM Sans (UI), JetBrains Mono (technical text)."*
- **Semantic colour rule:** emerald means continue/success, orange means leak/No path, amber means warning, red is reserved for invalid structure. The new Y and N ports follow it.

## 1. What changed in this pass

| Area | Change |
|---|---|
| Page and offer object | Redesigned from a generic card into a funnel object: a browser window of the page, name, two numbers, a dark type caption, and Y / N ports. **61 nodes on 15 boards** now use it, at one size (196 × 112), so every connection line still meets the object centre. |
| New board: Page and offer objects | Annotated anatomy, all **19 page types and 14 offer types** at true size, and the **9-state set** (default, hover, selected, multi-selected, locked, warning, error, missing data, loading). |
| Library | Added **Communities, AI Calling, AI Automation** from your app screenshots (21 blocks). Pages and offers use the same window thumbnail as the canvas. Every category carries a status against your app. |
| Object system, Page-thumbnail | Both rebuilt on the same object. The captured screenshot fills the object's page window. |

## A. Final visual audit

| # | Area | Finding | Priority |
|---|---|---|---|
| A-1 | Page object | Was a generic icon-and-strip card that read as an app builder. Now identifiable as a page before reading its label. One definition everywhere. | Done |
| A-2 | Zoom levels | The type caption is 9.5px and the result number 15px. Both are unreadable below roughly 50% zoom, and no level-of-detail rule exists. Rule to adopt: at 75% and above show everything; 40–75% show window, name, result; below 40% show the window only. | P1 |
| A-3 | Other families | Sources, messages, logic, goals and notes are consistent with each other and with the library tiles, but only pages have the 9-state matrix. The same matrix must be drawn for the other families. It is mechanical, because the state rules are shared. | P1 |
| A-4 | Library accuracy | Categories where your app's counts differ from this list: Actions (app 3 vs 19 here), Logic (app 3 vs 15), Visual Elements (app 1 vs Notes 14), Email & Communication (12 vs 12, names unverified), Communities (11 vs 8 captured). Traffic, Offers, Sales & CRM are not in your screenshots. The 169 cannot be certified until the block definitions are reconciled. | **P0** |
| A-5 | In-app library panel | The master board is a specification sheet. The panel your app shows is an accordion of categories with counts, search and recents. The editor board only shows 12 rows. The full accordion needs designing so the library works at 170+ blocks. | P1 |
| A-6 | Brand marks | Brand icons are colour plus a simplified glyph, not licensed logos. Production should use a licensed set (for example Simple Icons) and follow each brand's guidelines. Community platforms with no confirmed brand colour deliberately use the teal family colour. | P1 |
| A-7 | Small text | Many secondary labels are 10.5–11px. Captions at 9.5px are acceptable as uppercase labels. Set a floor of 11px for all other secondary text. | P2 |
| A-8 | Connections | The connection board covers solid, dashed, curved, straight, elbow, labels, skip, no-thanks and retarget. The **invalid** connection state exists only on the quick-add board and must be added to the connection board. | P1 |
| A-9 | Legacy skins | No old tinted-icon nodes remain on any board. Old strip nodes survive only as the intentional "removed → reverts" state. | Done |
| A-10 | Verification | None of this pass was verified by screenshot. | **P0** |

## B. Final UX audit

| # | Area | Finding | Priority |
|---|---|---|---|
| B-1 | Navigation | Home exposes All funnels, Clients and Settings. Templates and Reports exist as boards, but a global entry for them could not be confirmed from the markup. | P1 |
| B-2 | Panel vs Reports | The funnel panel has 8 tabs and Reports has 12 sections, and several overlap (forecast, scenarios, goals, costs). Rule: the panel gives quick numbers and always ends in *Open full report →*. Reports hold the analysis. | P1 |
| B-3 | Reports | All 12 sections exist (forecast appears under a shorter title). Today they answer *what happened* and, through Key leak, *where*. There is no consistent answer to *why*, *impact* or *what next*. Do not add charts. Give every section the same three-row header: **Result · Reason · Where**, with *Show on map* links. | P1 |
| B-4 | Goals | Target and required numbers exist. The vocabulary for **gap, projected outcome and risk** does not appear on any board. A goal row needs slots for target, current, gap, progress, required, projected and risk. The risk slot stays hidden until real data exists. | P1 |
| B-5 | Forecast | Inputs exist (months, traffic growth). There is no assumptions summary and no variance. The forecast needs a visible "based on" line so explanations can attach later. | P1 |
| B-6 | **Actuals** | Period-based actual data exists in the product, but **no board designs it**. "Actual", "variance" and "period" are missing from the design. Proposal: three fixed tags (**Plan** outlined, **Forecast** dashed, **Actual** solid), a period picker (week, month, custom) with *Compare to*, and a variance chip coloured only by direction. No new maths. | **P0** |
| B-7 | First-use and empty states | **No board** shows a first-use state. "Empty" appears on only 3 boards and none is product-level. Needed: empty canvas, no funnels, no clients, report with no data. | **P0** |
| B-8 | Other states | Loading appears on 2 boards, error on 2, permission on 3 (Settings, Blocks and lines, and the locked state on the objects board). There is no viewer-role editor state and no report-level error or missing-data state. | P1 |
| B-9 | Command | Quick Add exists. There is no command palette board. Define one registry of actions with scope (global, funnel, selection) so Quick Add is its first provider. | P1 |
| B-10 | Sharing, presentation | Share, Shared view and Present all use the new object. Presentation reads as intentional, not as an editor with controls hidden. | Done |
| B-11 | Exports | No board shows an exported PDF or PNG. Exports must use the new object and the same type. An export preview board (PDF cover, map page, KPI page) is needed to confirm that. | P1 |
| B-12 | Responsive | 1536: not designed (1440 is the nearest, and behaviour above it is fluid). 1280, 1024, 768 and 390 are designed. **430 and 414 are not separate**. Treat 390–430 as one class and verify both ends. | P1 |
| B-13 | Touch targets | In the phone editor, 21 controls are 34px tall and 6 are 28px. The minimum should be 44px. | **P0** (phone) |

## C. Funnel Intelligence UX map

| Brain | Where it eventually appears | What must exist now |
|---|---|---|
| **Funnel** | Canvas (a marker on the object), Funnel health strip, block Analytics tab, Reports (Result · Reason · Where), Forecast, Goals (risk slot), Scenario comparison (explain a delta), What-if | The *Finding* component, the object marker chip, the Reports header, the Goal row |
| **Market** | Funnel setup (country, niche, audience), Traffic planning (a benchmark column), Forecast assumptions | Optional fields in funnel settings and a spare column in the traffic report. Nothing visible until data exists. |
| **Visual** | The page object's window, and the page inspector's Analytics tab (a collapsed *Page review* section) | The captured screenshot in the window (built) and an empty-by-default section slot |
| **Product** | Internal only. A separate admin area, never in the client workspace. | Stable object ids and named actions through the command registry, which also give clean usage signals |
| **Improvement** | The decision layer. Users only ever see **Inform**, **Suggest** and **Request approval**. The other outcomes (ignore, monitor, auto-fix, create task) are invisible. | An approval dialog pattern with Undo, and History entries marked as system-made, distinct from user edits |

## D. Intelligence surface audit

| Surface | Context or global | Eventually shows | User action | Component needed now | Blocks it today? |
|---|---|---|---|---|---|
| Canvas | Contextual | A finding marker on an object | Open the finding | Object marker chip (built: warning, error) | No |
| Funnel health | Contextual | Ranked findings for this funnel | Inspect step | *Finding* row, unified with "Check these" and "Key leak" | Two separate styles today |
| Selected block | Contextual | Evidence and impact for that step | View numbers, run what-if | An **Insights** slot at the top of the Analytics tab, collapsed when empty | No |
| Analytics | Contextual | Why a number moved | Show on map | Number-to-object link | No |
| Reports | Contextual | Reason and next step per section | Show on map, run what-if | Result · Reason · Where header | Sections have no common header |
| Forecast | Contextual | Assumptions, variance | Change an assumption | "Based on" line | No assumptions summary |
| Goals | Contextual | Risk, required change | Open the gap | Goal row with a risk slot | Gap, projected and risk are not designed |
| Scenario comparison | Contextual | What drove the difference | Open a scenario | Delta chips with a *why* link | No |
| Page preview, thumbnail | Contextual | Visual findings | Open page review | The window (built) and a collapsed *Page review* slot | No |
| Recommendations | Global | All suggestions | Apply, dismiss | Same *Finding* component in a list | Nothing to list yet. Do not build. |
| What-if | Contextual | Result of a change | Save as scenario | Reuse the existing scenario picker | No |
| Notifications | Global, only where justified | A change that needs a decision | Open | None. Do not build. | — |
| Intelligence Center | Global | Overview, findings, history | Browse | **None now.** See the decision below. | — |
| Command | Global | Verbs such as "find the biggest leak" | Run | The command registry (B-9) | No registry yet |

**Decision on a dedicated Intelligence area:** do not build one. Findings are most useful where the numbers already are (canvas, reports, goals). A separate area would pull attention away from the canvas and add a place for the product to look unfinished. Reserve the route and one navigation slot, show neither until real findings exist, and add an *Intelligence* entry to the workspace navigation later without restructuring anything.

## E. Components to design now

1. **Finding.** Headline, evidence number, impact value, one to three actions, a severity (info, watch, risk). It replaces today's separate "Check these" box and "Key leak" callout, which are the same idea drawn twice. Built from existing parts, with no intelligence content.
2. **Object marker.** The corner chip on page objects (warning, error, locked) extended to any family and to a finding marker.
3. **Insights slot.** A region at the top of the Analytics tab that is collapsed and invisible when empty. No placeholder.
4. **Result · Reason · Where header** for every report section, with *Show on map*.
5. **Goal row** with target, current, gap, progress, required, projected and risk slots.
6. **Plan / Forecast / Actual tags and the variance chip** (B-6).
7. **Command registry.** One list of actions with scope and keyboard binding. Quick Add is the first provider.
8. **Approval dialog with Undo, and system-made History entries.**
9. **Data-driven tab list** in the funnel panel, so a *Findings* tab can be added without redesigning the panel.

## F. Do not build now

- Any chat window, "Ask" button, robot icon or AI badge anywhere in the interface.
- A dedicated Intelligence Center, its overview, history or recommendation list.
- Recommendation, finding or benchmark **data** of any kind, including sample data on screen.
- Market benchmarks, country or niche research, trend views.
- Visual scoring of pages, or any automated reading of screenshots.
- Auto-fix, an approvals queue, task creation, a notification centre.
- Product Brain dashboards of any kind in the client workspace.
- Command verbs that imply analysis ("Explain this drop-off", "Check goal risk").
- "Coming soon" placeholders.

## G. Design-freeze checklist and priorities

### P0 — must fix before freeze

- [ ] **G-1** Visual pass in a real browser: Editor, Performance map, Page and offer objects, Library, Object system. Look for 1–3px alignment issues and clipped text.
- [ ] **G-2** Reconcile the library with the app's block definitions (A-4). Send the definitions file, or screenshots of the remaining categories and of the three Communities blocks below the fold.
- [ ] **G-3** Design Actuals: tags, period picker, variance chip (B-6).
- [ ] **G-4** Design first-use and empty states: canvas, funnels, clients, reports (B-7).
- [ ] **G-5** Raise phone touch targets to 44px (B-13).

### P1 — strongly recommended before freeze

- [ ] **G-6** Level-of-detail rule for page and offer objects (A-2).
- [ ] **G-7** The 9-state matrix for the other families (A-3).
- [ ] **G-8** The in-app library accordion with counts, search and recents (A-5).
- [ ] **G-9** Add the invalid connection state to the connection board (A-8).
- [ ] **G-10** Unify "Check these" and "Key leak" into the *Finding* component (D, E-1).
- [ ] **G-11** Result · Reason · Where header on all report sections (B-3).
- [ ] **G-12** Goal row and forecast "based on" line (B-4, B-5).
- [ ] **G-13** Panel and Reports overlap rule (B-2) and the navigation entries for Templates and Reports (B-1).
- [ ] **G-14** Command palette board (B-9).
- [ ] **G-15** Export preview board (B-11).
- [ ] **G-16** Viewer-role state, report-level error and missing-data states (B-8).
- [ ] **G-17** Confirm 430 and 414 behaviour against 390 (B-12).
- [ ] **G-18** Licensed brand marks for production (A-6).

### P2 — future enhancement

- [ ] **G-19** Secondary text floor of 11px (A-7).
- [ ] **G-20** Optional Market fields in funnel settings (C).
- [ ] **G-21** Intelligence entry in workspace navigation, only when real findings exist (D).
- [ ] **G-22** Approval dialog and system-made History entries, when the decision layer exists (C, E-8).

### Current product first

Everything above P2 makes today's product complete on its own. No P0 or P1 item depends on the future intelligence layer.
