# 10 · Shell patterns
File: `10-shell-patterns.html` · Status: delivered, awaiting owner approval

## A. "Needs design" notes
Statuses: **Needs design → Designed → Built to design → Verified**. One tracking file: `docs/DESIGN_STATUS.md` (route, status, design file, notes). When a design lands set Designed; when built set Built to design and **remove the in-screen note**; Verified needs phone check, keyboard check and passing tests. A small black "Needs design" badge may show in the screen corner in development builds only (flag `SHOW_DESIGN_STATUS`); production never renders it. A screen that must ship undesigned uses the shared states, not a placeholder note.

## B. Launcher with many apps
≤12 apps: flat grid (03). 13 or more: add **Find an app** search (focus with "/"; empty result: "No app called “…”."), a **Pinned** row (star on each tile, 44px target, `aria-pressed`), a **Recent** row (last 3 opened), then groups **Work · Create · Client-facing · Coming soon · More** with counts. Group names are fixed by the product. Tiles are identical to 03. Phone: two columns, icon and name only (descriptions hidden).

## C. Phone navigation
Under 720px the section menu becomes a **bottom bar**: up to four sections plus **More** when an app has more than five (order the menu busiest first); five or fewer show all. Bar 56px + safe area; items ≥44px, label 12px always visible; current item has an icon pill and `aria-current="page"` (More is marked if the current page is inside it). More opens a bottom sheet with the rest; Esc closes and returns focus to More. Page-level tabs stay a scrolling strip under the title. Tablet and desktop keep the top menu. The organization switcher stays in the header at every size. Short labels: Requests & Approvals → "Requests", SOPs & Tools → "SOPs", Documents → "Docs". Files 04, 05, 06 and 09 already use this; `01-switcher.html` still shows the old scrolling menu, follow this spec.

## D. Client-scoped access
A person who holds a permission on one client only sees: the organization menu row "Editor on 1 client" (never naming other clients); a Launcher with only the apps where they hold something (Clients, that client's Projects) and no Office Home (their start page is the Launcher); a Clients list with the banner "You have access to 1 client." (never "1 of 12"), no totals, no cross-client filters, no New client; a client header chip "Your access: Editor on this client"; links to any other client show the shared "We couldn't find that" screen, identical to a missing client; in Admin → Access → Effective access the scope chip "Client: Harry Kaye PT only" and a row "Other clients: No access, Not assigned".

Tokens: `--primary --tint --success --warn(-tint,-text) --line --panel`.
Open assumptions: A22, A26, A27, A28.
