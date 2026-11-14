# Value Ladder · pages and navigation

3 pages documented (every page in the v7 route list for this app, plus every page template reached by following links). 3 templates in total. Each entry gives the 11 required fields: name/purpose, access, layout, sections, buttons/actions, inputs/filters, navigation/destinations, data, permissions, states, responsive.

Labels in back-ticks are the exact text or accessible name of the control in the V8 prototype. Controls present on every page (rail, app bar, Prototype button) are documented once in `01_APPLICATIONS/00_SHELL_AND_LAUNCHER/`.

## Sidebar menu

- **Ladders** → `ladder/list`
- **History** → `ladder/history`

## Page templates and their instances

| Template | Instances reached in the prototype | Documented as |
|---|---|---|
| `ladder/list` | 1 | Ladders |
| `ladder/map/:ladder` | 2 | Ladder |
| `ladder/history` | 1 | History |

## Pages

### Ladders

- **Route (prototype):** `#/ladder/list` — template `ladder/list`
- **In the v7 route list:** yes — Ladders
- **How the user gets here:** sidebar item **Ladders**; breadcrumb Value Ladder; linked from `clients/tools`, `drive/edit/doc/:file`, `drive/edit/image/:file`, `drive/edit/pdf/:file`, `drive/edit/sheet/:file`, `drive/edit/slides/:file`, `fmp/funnel/:funnel`, `fmp/funnel/:funnel/reports` …
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/11_VALUE_LADDER/116_ladder_list.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/11_VALUE_LADDER/116_ladder_list.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/11_VALUE_LADDER/116_ladder_list.jpg)
- **Sections and headings, in order:** “Value Ladders” · “Harry Kaye PT ladder” · “L2F agency ladder”
- **Links (navigation) (5):** `New ladder` → `ladder/map/:ladder`; `Harry Kaye PT ladder 5 steps · Clients` → `ladder/map/:ladder`; `L2F agency ladder 4 steps · Office` → `ladder/map/:ladder`; `Ladders` → `ladder/list`; `History` → `ladder/history`
- **Data shown (prototype sample data — not product data):** Value Ladder Value Ladders Map how customers climb from free to premium. New ladder Harry Kaye PT ladder 5 steps · Clients L2F agency ladder 4 steps · Office Value Ladders Map how customers climb from free to premium. New ladder Harry Kaye PT ladder 5 steps · Clients L2F agency ladder 4 steps · Office…
- **Permissions and visibility:** Anyone with access to Value Ladder in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Ladder

- **Route (prototype):** `#/ladder/map/hk` — template `ladder/map/:ladder` (2 instances in the prototype, e.g. `ladder/map/hk`, `ladder/map/l2f`)
- **In the v7 route list:** yes — Ladder
- **How the user gets here:** sidebar item **Ladders**; breadcrumb Value Ladder › Harry Kaye PT ladder; linked from `ladder/list`, `office/offer/:offer`
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/11_VALUE_LADDER/117_ladder_map_hk.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/11_VALUE_LADDER/117_ladder_map_hk.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/11_VALUE_LADDER/117_ladder_map_hk.jpg)
- **Sections and headings, in order:** “Harry Kaye PT ladder”
- **Buttons and actions (6):** `Add step` — prototype stand-in (shows a toast: “Add a step and link an offer.”); build the real action from the brief; `1 · LEAD MAGNET Free quiz Find out what’s holding your fitness back. Free` — action `lstep:0` (opens: drawer); `2 · FRONT-END OFFER 7-day kickstart A week of guided workouts. $27` — action `lstep:1` (opens: drawer); `3 · CORE OFFER 12-week coaching Coaching, plan and weekly check-ins. $497` — action `lstep:2` (opens: drawer); `4 · UPSELL Nutrition add-on Meal plans and macros. $97/mo` — action `lstep:3` (opens: drawer); `5 · HIGH-TICKET VIP 1:1 Private coaching with Harry. $2,000` — action `lstep:4` (opens: drawer)
- **Links (navigation) (2):** `Ladders` → `ladder/list`; `History` → `ladder/history`
- **Data shown (prototype sample data — not product data):** Value Ladder / Harry Kaye PT ladder Harry Kaye PT ladder Each step links to a real offer. Changing the ladder never changes the offer or its price. Add step 1,000 Visitors a month 30% take the free quiz 8% buy the $27 kickstart 25% join coaching $11,180 Revenue a month Change any rate to see the effect. Conversion rates can come from Funnel Mapper forecasts once linked. 1 · LEAD MAGNET Free quiz Find out what’s holdi…
- **Permissions and visibility:** Anyone with access to Value Ladder in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### History

- **Route (prototype):** `#/ladder/history` — template `ladder/history`
- **In the v7 route list:** no — reached by following links in the prototype
- **How the user gets here:** sidebar item **History**; breadcrumb Value Ladder; linked from `ladder/list`, `ladder/map/:ladder`
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/11_VALUE_LADDER/169_ladder_history.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/11_VALUE_LADDER/169_ladder_history.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/11_VALUE_LADDER/169_ladder_history.jpg)
- **Sections and headings, in order:** “History”
- **Links (navigation) (2):** `Ladders` → `ladder/list`; `History` → `ladder/history`
- **Data shown (prototype sample data — not product data):** Value Ladder History Changes to step order and linked offers. UM Usman Malik moved “Nutrition add-on” above “12-week coaching” Today TR Tabish Riaz linked “VIP 1:1” to Offers & Products Monday History Changes to step order and linked offers. UM Usman Malik moved “Nutrition add-on” above “12-week coaching” Today TR Tabish Riaz linked “VIP 1:1” to Offers & Products Monday…
- **Permissions and visibility:** Anyone with access to Value Ladder in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.
