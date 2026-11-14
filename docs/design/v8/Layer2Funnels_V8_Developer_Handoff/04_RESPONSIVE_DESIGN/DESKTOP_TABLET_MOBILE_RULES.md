# Desktop, tablet and mobile rules

Labels: **[Confirmed]** = shown by the V8 prototype at that width (screenshots in `06_SCREENSHOTS_AND_REFERENCES/v8/{desktop-1440,tablet-834,phone-390}/`) or written in a brief. **[Proposed]** = suggested here, needs owner approval (D14/D15).

## Breakpoints [Confirmed]
| Name | Width | Shell |
|---|---|---|
| Desktop | >1100 px | Rail 64 + app sidebar 248 + app bar 52 + content (max 1440). Right panels dock as drawers over content. |
| Tablet | 761–1100 px | Rail + sidebar remain (sidebar collapsible); side panels become overlays; two-column dashboards may drop to one (Office Home at ≤1100). |
| Phone | ≤760 px | Rail and sidebar hidden; **bottom tab bar** (first 4 nav items + More); app bar shows the org mark → apps-and-account sheet. |
| Touch | `pointer: coarse` | Every control ≥44 px. |

Tested widths in this package: 1440, 1366 (automated checks), 834, 390. No page scrolls horizontally at any of them [Confirmed, automated].

## Typography [Confirmed]
Same type scale on every device (fixed rem scale, no fluid type in product UI), except page titles 24 → 22 px and greetings 30 → 24 px on phone. Body never below 14 px on phone; labels ≥12 px.

## Tables and data-heavy layouts
- [Confirmed] Wide tables scroll inside their own container (never the page). Clients table, Projects list, file tables keep the first column readable.
- [Confirmed] Projects task rows on phone collapse to: status circle · name · due · status (drag, select box and tags hidden).
- [Proposed] Tables with >3 columns become stacked rows (label: value) on phone.

## Forms and inputs
- [Confirmed] Inputs 38–40 px (44 on touch); labels above inputs; dialogs keep labels visible.
- [Proposed] Dialogs become bottom sheets on phone (max 90 vh, sticky actions).

## Right-side panels, drawers, dialogs
- [Confirmed] Task panel: drawer 680 px on desktop, full-width option, **full screen on phone** (Projects brief).
- [Confirmed] Editors: side panel hides on narrow widths; phone menus collapse into one Menu button; Docs vertical ruler hidden <1000 px; ruler hidden in phone width (Drive brief).
- [Proposed] All right panels open full screen on phone with sticky header (Close, title) and pinned footer.

## Cards, dashboards, charts
- [Confirmed] Multi-column dashboards collapse to one column in reading order.
- [Confirmed] KPI bands wrap.
- [Proposed] Charts keep a minimum height of 160 px and show values on tap.

## Canvases (Whiteboard, Funnel Mapper editor, Strategy builder)
- [Confirmed] Full-page canvas, floating tools; Funnel Mapper editor keeps its own chrome. Strategy builder inspector hidden ≤1100 px.
- [Proposed] On phone, canvases open read-only with pan/zoom and an "Edit on a larger screen" note; editing tools stay available but are not optimized.

## Mobile-specific interactions
- [Confirmed] Tasks: swipe right to complete, long-press for the menu (Tasks brief §6). Context menus open with long-press everywhere (02 §3).
- [Confirmed] Projects quick actions collapse to one "+" menu on phone (Projects brief).
