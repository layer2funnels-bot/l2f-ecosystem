# Funnel Mapper Pro — Final design-freeze report

**Verdict: not frozen.** One P0 remains and it is outside my reach: **the block library cannot be reconciled without the authoritative block registry** (see section B). Everything else the owner decided has been applied, and the final consistency review is complete.

## A. Owner decisions applied

| # | Decision | Result |
|---|---|---|
| 1 | Name of the layout button | **Tidy up** (owner prefers it; reverted from "Auto-arrange"). Icon is a layout tree, not a sparkle. |
| 2 | Merge Expected into Baseline | One row, **Baseline (current map)**; top bar "Scenario: Baseline". No "Expected" remains. |
| 3 | Whole people | Applied; exact value on hover. |
| 4 | LTV on every relevant figure | Rule and nine-surface table drawn on **Data trust**. |
| 5 | Actuals: typed and CSV | Equal tabs; full CSV import flow drawn (file, match columns, check, import). |
| 6 | Keep AI Calling | Present in Blocks sidebar, Editor sidebar and Library. |
| 7 | Traffic never hidden | Traffic is first on every KPI strip (1440, 1280, 1024, 768, phone). Leads, Customers and ROAS move to More, in that order. Every strip measured to fit. |
| 8 | Reconcile library | **Blocked** (section B). Nothing was invented. |
| 9 | Dark default; **Light added next to it** (owner update) | Appearance offers Dark and Light. Dark is unchanged (62 existing boards verified byte-identical). Light is drawn for Editor, Home, Client and Funnels, with a tokens board and calculated contrast. |
| — | Four ports | Recommended and applied: four plain ports on every page and offer, hidden until hover, selection or connecting; line meaning chosen on the line. Reasoning: loops and vertical layouts need any side; hiding at rest keeps the map calm. |
| — | Trash | No time limit, no auto-delete. |
| — | Hover preview | Only the thumbnail opens it; it opens below the block (then above, right, left) and never covers the next step or the hovered block's ports. Removed from the default Editor so the map is calm. |

## B. Remaining P0 (blocks the freeze)

1. **Library reconciliation.** I do not have the block registry. Please send **one file or export that defines the library items** (the registry the app renders the sidebar from: id, name, category, family, icon), plus the **three Communities blocks** I have not seen. Until then the library board is labelled as the design inventory (170 blocks, 6 widgets, counted from the tiles) and the app must read the real count live.

## C. Remaining P1 (not blocking)

- `V2-responsive-checks` and its three phone mockups have not been reviewed by design. They pass the automated checks (no clipping, no overflow) but I have not read them in detail.
- Template drawings are built from the owner's written flows; the Funnelytics and Russell originals were not available to me. Please check each against its original.
- Long node names ("WhatsApp follow-up") truncate with an ellipsis on the canvas; widen the text area or allow two lines when building.
- Print-friendly (light paper) PDF style is offered but not drawn.
- Brand logos are placeholders; use licensed vector marks in production.
- Light theme is drawn on four key screens plus the token table; every other screen should be checked in Light as it is built. Dark muted text measures 3.9 : 1 (left alone, as requested).
- The earlier Verified audit, Design-freeze review and V2 change-log boards are history; this report supersedes them.

## D. Final consistency review

All **63 boards** were rendered in a headless browser and measured. After fixes: no board has content outside its frame except by intent (the canvas world inside a clipping viewport, scrolling sidebar lists, and intentional ellipsis). Fixed in this pass: Library board height (152px of content was cut), Export preview row width, Home table width, Traffic on four strips, one leftover "Expected", the Home date picker, and the ports and hover behaviour. Structural integrity (balanced markup, one component per board) is clean on every board. Wording scan across the file: no "Tidy up", "Health · N checks", "Expected", Y/N ports or light-theme option remains.

## E. Five brains to UX surfaces (unchanged, intelligence-ready only)

| Brain | Surfaces | Built now |
|---|---|---|
| Funnel | Canvas ring, Model checks, Biggest leak, block Analytics, Reports, Goals, Scenarios | **Finding component** drawn; goal row with hidden Risk and Forecast slots; leak ring on previews |
| Market | Funnel setup fields, traffic benchmark column, forecast assumptions | Nothing visible |
| Visual | Page window, hover preview, page inspector section | Window, preview, capture built |
| Product | Internal admin only | Command registry specified |
| Improvement | Inform, Suggest, Request approval | Approval dialog reserved, not drawn |

## F. Explicitly left for the future

No chat, "Ask" buttons or AI badges; no Intelligence Center; no recommendation, finding or benchmark data; no market research; no visual scoring; no auto-fix; no notification centre; no light-theme work beyond the four screens and tokens shown (the rest follow the same mapping).

## G. Freeze checklist

- [x] Money period on every figure; LTV rule on every surface
- [x] Whole people, exact on hover
- [x] One baseline; scenario in the top bar
- [x] Model checks separate from performance and freshness
- [x] Plan, Forecast, Actual distinguishable
- [x] Live funnel preview on every funnel card
- [x] Four ports, hover preview that covers nothing
- [x] Traffic always visible on the KPI strip
- [x] Dark theme unchanged and default; Light theme added next to it, contrast calculated
- [x] Typed and CSV actuals; Trash; template form and inner-map templates; 13 templates
- [x] States, New client, PDF export preview, simulation, zoom levels, Finding component
- [x] Phone touch targets 44px; all 63 boards measured
- [ ] Library reconciled to the authoritative registry (**needs the owner's file**)
- [ ] Responsive checks board reviewed in detail
- [ ] Template flows confirmed against the originals

## H. What I still need from the owner

1. The block registry file or export (section B).
2. Who may delete forever or empty Trash (proposed: Owner and Admin only).
3. Confirmation of the 13 template drawings against the originals.
4. Whether "Expected" exists as a real saved scenario in the live app.
