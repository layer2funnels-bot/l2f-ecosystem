# Funnel Mapper Pro V2 — Instructions for Claude Code

You are implementing the V2 design of Funnel Mapper Pro. The design is a set of artboards (`project/*.dc.html`, listed by name below). Treat them as **visual and behavioural specifications**, not code to paste. Rebuild each screen with the app's existing components.

## 0. Rules that apply to everything

1. **Do not change the funnel maths.** The deterministic engine, report calculations, forecast, scenario and goal calculations are authoritative. This work changes how numbers are *shown* and adds *input* features. No calculated number may change.
2. **Do not weaken auth, RLS, workspace isolation or roles** (Owner, Admin, Editor, Viewer). Every new table follows the existing RLS pattern. Every new route checks the workspace.
3. **Dark is the default and stays exactly as it is. Light is an additional theme** next to it (F13). Never change a dark value, and never make Light the default.
4. **Do not build Funnel Intelligence.** No chat, no "Ask" buttons, no AI badges, no generated findings. Build only the neutral components in section 16.
5. **Tokens (unchanged):** Emerald `#10B981` / hover `#059669` / pressed `#047857` / light `#34D399`; success `#22C55E`; canvas `#0B1220`; library `#0F172A`; chrome `#111827`; panels `#1E293B`; borders `#334155`; text `#E2E8F0` / `#94A3B8`. Categories: Traffic `#60A5FA`, Pages `#A78BFA`, Offers `#FB923C`, Actions `#2DD4BF`, Logic `#FBBF24`, Goals `#84CC16`, Notes `#FDE68A`. Leaks and "No" paths use orange `#F97316`; red is only for invalid structure and errors. Fonts: **Bricolage Grotesque** (titles, numbers), **DM Sans** (UI), **JetBrains Mono** (technical text).
6. **Never colour alone.** Every colour-coded meaning also has a shape, a dash pattern, a label or an icon.
7. **Touch targets are at least 44px** wherever a finger can tap (tablet and phone).
8. **Images.** Every image the app stores is **under 100 KB**. See feature F7.

## 1. Owner decisions (final)

| # | Decision |
|---|---|
| 1 | The top-bar button is **Tidy up** (owner preference; it also avoids a clash with the inspector's "Arrange" align-and-order tab). Its icon is the tidy-tree layout icon, never a sparkle. |
| 2 | **Baseline = Current map.** There is no separate "Expected" scenario. If the current app has a saved scenario called "Expected" that equals the map, merge it into Baseline. |
| 3 | **Whole people** everywhere in the main UI; the exact modelled value is in the hover or detail. |
| 4 | **LTV tag on every revenue, profit and ROAS figure whenever Lifetime value is the active basis**, on every surface. |
| 5 | **Actuals: typed entry and CSV import, both first-class.** |
| 6 | **AI Calling stays** in the block library. |
| 7 | **Traffic is always visible on the KPI strip.** Lower-priority KPIs move into More. |
| 8 | The library renders from the **authoritative block registry**. Never invent or guess blocks. |
| 9 | **Four ports** on every page and offer block (see F1), shown on hover, selection or while connecting. |
| 10 | **Trash has no time limit and no auto-delete** for now. Items stay until restored or deleted forever. |
| 11 | The hover preview opens **only from the page thumbnail** and **never covers the next step** (see F1). |
| 12 | **Themes: Dark (default, untouched) and Light, side by side** in Appearance. Light is an addition, never a replacement (see F13). |

## 2. What already exists and what is new

| Feature | Status | Artboards |
|---|---|---|
| Canvas, blocks, connections, reports, scenarios, goals, forecast, sharing, presentation, exports, roles | **Exists.** Restyle and relabel only. | Editor-*, Reports, Share, Shared-view, Present, Settings |
| Page and offer object (window, name, numbers, caption) | Restyle of existing blocks | Pages-all, Object-system |
| Four ports, line meaning chosen on the line | **New behaviour** | V2-collapse-and-ports |
| Hover preview on the page thumbnail | **New** | V2-hover-preview, Page-block-thumbnails |
| Live funnel preview on cards | **New** (replaces template thumbnails) | Live-funnel-preview, Client, Funnels, Home, Templates |
| Templates inside the map, customize form, 13 templates | **New** | V2-templates-in-canvas, V2-template-form, V2-template-structures |
| Month-to-month actuals, calendar, CSV import | **New** | V2-actuals-entry, V2-month-calendar, Data-trust |
| Home date range | **New** | V2-home-date-range |
| Trash and delete confirmations | **New** | V2-trash, V2-delete-confirm |
| URL import and the 100 KB limit | **New** | V2-image-limit, Page-thumbnail |
| Collapsible right panel | **New** | V2-collapse-and-ports |
| Math made plain | **New** (display only) | V2-math-explainer |
| Money period, LTV tag, whole people, Plan/Forecast/Actual tags | **New labelling** | Data-trust |
| KPI strip priority | **Change** | Editor-default, R-editor-* |
| Blocks sidebar (search, recent, products, accordion, widgets) | **New layout** | Blocks-sidebar, Library-169 |
| Simulation | **New** (presentation of existing engine output) | Simulation, `SIMULATION_SPEC.md` |
| States, New client form, PDF export preview | **New** | States, New-client, Export-preview |
| Canvas zoom levels, Finding component | **New** (display rules, neutral component) | V2-zoom-levels, V2-finding-component |
| Appearance: Dark and Light | **New** (Dark unchanged) | V2-appearance, V2-theme-tokens, Light-editor, Light-home, Light-client, Light-funnels |

## 3. Reference code in the package

`supporting-assets/preview-renderer/` contains the Python used to draw the design: `fmprev.py` (the live preview renderer: fit to frame, miniature objects, edges, leak paths), `pgobj.py` (page and offer object anatomy and the 26 page previews), `templates13.py` (the 13 templates: block types, positions, connections, names). **Port `fmprev.py` to a TypeScript function** and use `templates13.py` as the source for the 13 template definitions. Do not call the Python from the app.

## 4. F1 — Page and offer object, four ports, hover preview

**Object (196 × 112).** Page window 68 × 76 at (8, 7): browser chrome (9px) plus a 66 × 65 preview, either a semantic wireframe by page type (26 types in `pgobj.py`) or the real screenshot. Name (13px, 600, two lines max). Line 1: people in → people through. Line 2: headline number (conversion for pages, revenue for offers, in Bricolage Grotesque 15px). A 22px dark type caption with the category colour and a status dot. Offers add a price tab (20px, top −10px, left 12px). Other blocks are 196 × 74. Rows are centre-aligned so lines stay straight.

**Four ports.**
- Every page and offer block has four connection points: top, right, bottom, left (12px circles, `#64748B` border).
- **Ports are hidden at rest.** They appear on hover, on selection, and on every block while a connection is being dragged.
- The ports are identical. The line's meaning is chosen when connecting (a small menu: **Yes** continues, **No** leaves, **Skip step**, **No data**) and can be changed by selecting the line. Style: Yes solid slate, No dashed orange, Skip dotted, No data dash-dot grey.
- Data: each edge stores `sourceHandle` and `targetHandle` in `{top, right, bottom, left}` and `kind` in `{yes, no, skip, nodata}`. React Flow: handles on all four sides, `connectionMode: loose`. Migrate existing edges: right → right/left handles; leak edges → bottom.
- Condition blocks keep their Yes and No chips.
- Recommendation recorded: four ports beat three because loops (reminder emails back to a calendar) and vertical layouts need any side, and hiding the ports at rest keeps the map calm.

**Hover preview (`V2-hover-preview`).**
- **Only the page window** (68 × 76) opens it. Title, numbers, caption, ports and the rest of the block never do.
- Opens after **400 ms**, closes **150 ms** after the pointer leaves the window, and not at all while the pointer moves onto the preview itself (so its buttons work).
- **Placement (never cover the next step):** try below the block, then above, then right, then left; choose the side that overlaps the fewest blocks; never overlap the hovered block or its ports; if no side fits, open a compact 240px preview. Funnels run left to right, so below is usually free.
- Does not open while dragging, panning, zooming or with a menu open. Touch: long-press the window. Keyboard: focusing the window opens it, Esc closes it. Respect reduced motion (120 ms fade, none when reduced).
- The preview is a screen-space popover (does not scale with canvas zoom). Content: name, type, source, a 296 × 300 top crop, buttons **Open page** and **Preview settings**.

**Acceptance:** hovering title or numbers shows nothing; the next block is never hidden by the preview in a left-to-right funnel; ports are invisible on an idle map.

## 5. F2 — Live funnel preview (new)

Every funnel card, table row and recent-funnel tile draws a preview **from the funnel's saved canvas**, not an image and not a template thumbnail.
- Input: the same saved `nodes`, `edges`, `frames` the editor opens. Implement `renderFunnelPreview(canvas, width, height)` from `fmprev.py` (SVG).
- Fit: padding 8px (4px in tables); `scale = min(w/bboxW, h/bboxH, 0.5)`; centred. **Notes and text never affect the fit.**
- Each block is a miniature of its real object. Edges: slate flow, dashed orange leaks, dotted skips; thickness = `1 + 1.7·√(people/max)`. The block with the largest leak carries a dashed orange ring (same fact as *Biggest leak*).
- Detail by scale: ≥ 0.30 names; ≥ 0.11 window, caption, price tab; below 0.11 family-coloured shapes. Limits: ≤ 60 blocks full detail; 61–200 shapes; > 200 blocks only.
- Re-draw on every save and when a list loads. **Store no image** (it cannot go stale).
- States (see `Live-funnel-preview`): populated, hover (Open map), first use (no blocks), loading skeleton, couldn't load (Retry), updating (2px sweep), archived (50%). Whole card opens the map; Reports and the status menu are separate targets.
- Alt text: "Map of {name}: N blocks, N connections".

## 6. F3 — Templates inside the map, customize form, 13 templates (new)

**Entry points.** (a) The Templates page. (b) A new **Templates** entry in the editor's left rail that opens a panel (search, 13 rows with a mini live preview, block count read from the template data, hover preview, a `Drop here` frame on the map). *This does not exist today.*

**Flow.** Choose a template → the **customize form** → add. From the Templates page it creates a new funnel; from inside the map it adds the template to the open funnel as **one labelled frame at the centre of the viewport**, without moving or covering existing blocks, as a **single undo step**.

**Customize form (`V2-template-form`).** Every field is optional. Funnel name (only when creating a funnel). For each page in the template: a name and a URL. Entering a URL starts a screenshot capture (F7) in the background, shown as "Fetching preview…" then "Preview ready · 71 KB". Buttons: **Skip, use defaults** and **Create funnel** / **Add to map**. A **"Start with empty numbers"** switch clears the sample numbers.

**Template data.** Ship as versioned static data in the repo (not a DB table): `{ id, name, description, nodes:[{id, kind, type, name, x, y, optional?}], edges:[{from, to, kind, side?}], sampleNumbers }`. Names and order (exact):
1 Lead Squeeze · 2 Survey · 3 Summit · 4 Free Challenge Funnel · 5 Book Funnel · 6 Cart Funnel · 7 Paid Challenge Funnel · 8 Video Sales Letter Funnel · 9 Webinar Funnel · 10 Product Launch Funnel · 11 Application Funnel · 12 Webinar Application Funnel · 13 Mini Class Funnel.
Flows, blocks and dashed optional offers/downsells are drawn in `V2-template-structures` and encoded in `templates13.py`. The owner will check them against the Funnelytics and Russell originals; keep the data easy to edit. Templates ship with **sample numbers**; use the existing example-number mechanism. Dashed outlines = optional blocks (`optional: true`); downsell edges are `kind: no`.

**Acceptance:** all 13 insert correctly and are editable like normal blocks; empty-numbers switch leaves valid zero numbers; cancelling inserts nothing.

## 7. F4 — Month-to-month actuals, calendar, CSV import (new)

**Purpose.** Let a strategist record real numbers per month or week and compare them with the plan.

**Data (new table, follow existing RLS):** `funnel_actuals(id, workspace_id, funnel_id, period_type text check in ('week','month'), period_start date, step_id text null, metric text, value numeric, source text check in ('manual','csv'), source_ref text null, created_by, created_at, updated_at)` with a unique key on `(funnel_id, period_type, period_start, step_id, metric)`. Metrics: people per step, ad spend, revenue. Never write to the modelled (plan) data.

**UX (`V2-actuals-entry`, `V2-month-calendar`, `Data-trust` section 5).**
- A **Type it in | Import CSV** pair of equal tabs. Typed: a grid (steps × months) with Monthly and Weekly views, paste from a sheet, autosave, difference from plan as a signed chip.
- **CSV import:** choose file → match columns (month/week, step or metric, value) → check ("13 rows ready, 1 needs attention", row-level messages in plain words) → import. Provide a downloadable template. Imported values are tagged **Actual · source: CSV** (file name and date kept).
- **Calendar:** a range picker (Today, This month, Last 30 days, Custom) with two months; days or months that have data show a dot. A **Model / Actual** toggle on the map: Actual mode draws the same map with the entered numbers and a badge naming the dates ("Actual · Nov 2026 · 30 days").
- Tags: Plan (outlined), Forecast (dashed), Actual (solid emerald) with period and source on hover.
- Differences are computed from the numbers shown; do not change the engine.

**Acceptance:** typed and CSV values are indistinguishable except for the source; duplicates update rather than add; invalid rows are reported, never silently dropped.

## 8. F5 — Home date range (new)

Replace the single month and year with a **range picker** (presets: This month, Last 3 months, Last 6 months, This year, Last year, Custom range; custom = from/to month and year with a month grid). Home figures aggregate over the range. **Money is shown one row per currency, never added together.** **Keep "Pick up where you left off"** (the most recently edited funnel, with its live preview, **Continue mapping** and **Reports**). See `V2-home-date-range`.

## 9. F6 — Trash and delete confirmations (new)

- **Soft delete:** add `deleted_at timestamptz null` and `deleted_by` to clients and funnels. Normal lists exclude deleted rows.
- **No time limit, no auto-delete.** Items stay in Trash until someone restores them or deletes them forever.
- **Trash page** (`V2-trash`, in the main nav with a count): list with name, type, client, deleted date; **Restore**, **Delete forever**, **Empty trash**. Restoring a client restores its funnels; deleting a client moves its funnels to Trash with it.
- **Confirmations (`V2-delete-confirm`):** a funnel asks plainly **"Move to Trash"** (it can be restored). A client asks the person to **type the client's name** before the button turns on. **Delete forever** and **Empty trash** ask once more and say it cannot be undone.
- Permissions (proposal, confirm with the owner): Owner/Admin/Editor can move to Trash; only Owner/Admin can delete forever or empty Trash.
- Shares and links to a trashed funnel stop working until it is restored.

## 10. F7 — URL import and the 100 KB image rule (new)

- **Page URL → screenshot:** a server route fetches the page in a headless browser (wait for network idle and embedded frames; time-limited), takes a full-page capture, and stores derivatives. Show states: no preview, URL entered, capturing, success, couldn't capture (Retry), replace, remove, fall back to the page-type wireframe. Capture is display-only.
- **Upload your own image** is a third source next to Capture and Wireframe (PNG, JPG, WebP).
- **Every stored image must be under 100 KB.** Process on the server before storing: flatten transparency on white; convert to WebP; resize to a maximum width (page screenshots 1200px, logos 512px, block icons 256px); lower quality from 80 down to 40 until under 100 KB; if still over, reduce width in steps (1200, 1000, 800, 600); if still over, **reject** with a plain message ("This image can't be made small enough. Try a simpler image."). Enforce at the upload route, with a size column and a storage policy so nothing larger can be stored. Show progress ("Optimising 7.8 MB → 61 KB"). Apply the same pipeline to client logos, workspace logos, custom block icons and template page screenshots. Provide a one-off job that re-compresses existing images.
- Derived sizes loaded by the map: window crop 132 × 130 (2×, **top-anchored**, never centre-cropped) ≈ 5 KB; hover preview 592 × 600 on demand; full page for the inspector on demand. The canvas never loads the original.
- Input limits (proposed): up to 25 MB, at least 800px wide.
See `V2-image-limit`, `Page-block-thumbnails`, `Page-thumbnail`.

## 11. F8 — Collapsible panels

The right panel collapses exactly like the left (a 28px button in the panel header; a 26px rail with icons that open the panel on that tab). Shortcuts: `[` left, `]` right. The choice is remembered per person. The save state, scenario chip and Model checks stay in the top bar. On tablet, panels are drawers; on phone, bottom sheets. See `V2-collapse-and-ports`.

## 12. F9 — Math made plain (display only)

Edge labels read as sentences: "59% of 1,500 = 885", with a leak label "615 leave here". A left panel **How the math works** walks the selected block's steps in words (with the arithmetic). Every figure in the right panel has a **?** that shows its formula in words. Glossary: Rate, ROAS, CPA, EPC, AOV. All values come from the existing engine. See `V2-math-explainer`.

## 13. F10 — Data trust (labelling rules)

1. **Money always shows its period:** `/ mo`, `a year`, `12-month total`. Card labels read "Revenue / mo". CSV and PDF headers include the period.
2. **LTV:** when Lifetime value is active, every revenue, profit and ROAS figure carries an `LTV` tag on every surface (canvas, strip, reports, widgets, forecast, scenarios, client cards, PDF); the Reports header also says "Basis: lifetime value". First payment adds no tag; the header says "Basis: first payment".
3. **People:** whole numbers; under 10 show one decimal with "avg"; exact value on hover ("82.8 · modelled average"); money and percentages use exact values.
4. **Plan / Forecast / Actual tags** with period and source on hover.
5. **Scenarios:** one baseline named **Baseline (current map)**. The top bar reads **Scenario: Baseline** (and "vs Baseline" when another scenario is active).
6. **Model checks** replaces "Health": "Model checks · 4 to fix" or "All clear". Keep model checks, performance (Biggest leak) and data freshness separate.
7. Remove "(live)" from labels; "Live" is only for published funnels and pages.
8. Change chips always carry a sign, an arrow and a colour (good for the funnel is green).
See `Data-trust`.

## 14. F11 — KPI strip

Priority order (collapse from the end into **More**): **1 Traffic, 2 Revenue, 3 Profit, 4 Customers, 5 ROAS, 6 Leads**, then ROI, AOV, CPA, CPL, EPC, Conversion rate. **Traffic never collapses.** Visible counts: 1280+ with sidebar closed up to six; sidebar open five (Leads in More); 1024 four (Traffic, Revenue, Profit, ROAS); 768 three (Traffic, Revenue, Profit); phone chips start with Traffic. The strip shows one **Plan** tag and the unit; the checks control reads "Checks · N to fix".

## 15. F12 — Simulation, library, states, other boards

- **Simulation:** follow `SIMULATION_SPEC.md` and the `Simulation` artboard. It presents existing engine output; never invent numbers.
- **Blocks sidebar** (`Blocks-sidebar`): search, Recent, the client's products, one accordion of categories with counts, Widgets as the last section. Click or drag to place. Collapses to a 52px rail. Hover shows one line.
- **Library:** render from the block registry (one source of truth). Counts are computed. **Keep AI Calling, Communities and AI Automation.** Use the owner's icon artwork in `supporting-assets/block-icons/` for the categories that have it; use the system tile for the rest. For production, replace brand marks with licensed vector logos. **If a block has no icon, show its family tile, never an invented logo.**
- **States (`States`):** first use, empty, loading, error, saving, saved, not saved (retry), offline, viewer role, permission, expired share link, success. Each says what happened, whether anything was lost, and what to do next.
- **New client form (`New-client`):** required fields first (name, status, currency, pricing model); "Add details" is collapsed; phone is a bottom sheet with 44px controls.
- **PDF / PNG / CSV (`Export-preview`):** PDF pages are cover, funnel map (the live drawing), key numbers, optionally scenarios and goals; Plan tag, scenario and unit in each footer; image background (Dark, Light, Transparent) is chosen in the export step.
- **Appearance (`V2-appearance`):** Dark (default) and Light as two options with previews; see F13.
- **Zoom levels (`V2-zoom-levels`):** far = shapes, structure, line thickness; mid = names, type, leak path (numbers on hover); near = numbers and all line labels. Never colour alone.

## 16. Intelligence-ready components (build the component only)

Build `Finding` (`V2-finding-component`): a card and a compact row with headline, evidence, impact and actions. Use it today for **Biggest leak**, **Model checks** and **goal gap** (all deterministic facts). Add an **Insights slot** at the top of block Analytics that is **collapsed and invisible when empty**. Give every list of actions a single **command registry** (id, label, scope, shortcut) that quick add uses. Add an object **marker** slot (the dashed ring). Do not add anything labelled AI.

## 17. Responsive requirements

Widths to support: 1536, 1280, 1024, 768, 430, 414, 390. Panels become drawers at 1024 and below and bottom sheets on phone. No horizontal page scrolling. Phone map: view, select and edit one block at a time through sheets; all targets 44px. See `R-editor-*`, `R-phone-*` and `V2-responsive-checks` (the last has not been fully reviewed by design; verify it as you build).

## 18. Suggested build order

1. Tokens (as CSS variables, Dark values unchanged), labels and number formatting (F10, F11), then the Light theme (F13) — safe, high impact.
2. Page and offer object, four ports, hover preview (F1).
3. Live funnel preview (F2) — replaces every card thumbnail.
4. Trash and confirmations (F6).
5. Image pipeline (F7), then URL capture.
6. Templates in the map and customize form (F3).
7. Actuals with calendar and CSV (F4); Home range (F5).
8. Right-panel collapse, math view, zoom levels (F8, F9).
9. Blocks sidebar and library from the registry (F12).
10. Simulation, states, exports, new-client form.

For each step: implement, compare against the named artboard, then check the acceptance notes and the 44px and never-colour-alone rules.

## 18b. F13 — Light theme next to Dark (new)

**Principle.** Dark is the current look and the default. Light is added as a second token set. **Do not edit any existing dark value, and do not change layout, spacing, type, object anatomy, ports or line styles between themes.**

**Implementation.**
- Define every colour as a CSS variable on `:root[data-theme="dark"]` (the current values, copied exactly) and `:root[data-theme="light"]`. Set `color-scheme` to match. Replace hard-coded hex values in components with the variables. This includes the **live preview renderer, page and offer objects, React Flow edges and labels, chart colours (Recharts), icons and tile backgrounds, SVG exports and the PNG/SVG export background**. Nothing may keep a fixed dark colour in Light.
- Preference: store `theme` (`'dark' | 'light'`, default `'dark'`) on the person's profile, mirror it to local storage, and apply it with a tiny inline script **before first paint** so there is no flash. Switching in Appearance applies instantly with no reload and applies to every device.
- Appearance page (`V2-appearance`): two options, Dark (marked Default) and Light, each with a small preview; there is no third option.
- **Print-friendly PDF** can use the Light tokens.

**Light token values (Dark values are the existing ones in the design system above).**

| Role | Dark (unchanged) | Light |
|---|---|---|
| Canvas | `#0B1220` | `#F4F6FA` |
| Panel / library | `#0F172A` | `#FFFFFF` |
| Top bar and blocks | `#111827` | `#FFFFFF` |
| Raised / hover | `#1E293B` | `#E5EAF1` |
| Border | `#334155` | `#C4CEDB` |
| Strong border / dashes | `#475569` | `#7B8AA0` |
| Primary text | `#F1F5F9` | `#0F172A` |
| Heading | `#F8FAFC` | `#0B1220` |
| Secondary text | `#94A3B8` | `#55657B` |
| Muted text | `#64748B` | `#5B6B82` |
| Emerald text | `#6EE7B7` | `#047857` |
| Amber text | `#FCD34D` | `#B45309` |
| Orange text (leaks) | `#FDBA74` | `#C2410C` |
| Red text (errors) | `#FCA5A5` | `#B91C1C` |

Unchanged in both: Emerald `#10B981` and its hover/pressed colours, the six category colours, leak orange `#F97316`, and the dark-green text on the Emerald button (`#03241A`, 6.5 : 1). Other dark-only tints (warning and leak badge backgrounds, hover and selected tints) take the matching pale tint in Light; the artboards `Light-*` show them in context.

**Accessibility.** Light text pairs are calculated at 4.6 : 1 or better (see `V2-theme-tokens`); keep that as a test. Dark muted text is 3.9 : 1; leave it as is. Never rely on colour alone in either theme.

**Acceptance.** Every screen is checked in both themes (visual test per surface, plus the contrast test); switching theme never moves or resizes anything; the Dark theme is pixel-identical to before the change.

**Reference artboards:** `V2-appearance`, `V2-theme-tokens`, `Light-editor`, `Light-home`, `Light-client`, `Light-funnels`. The other screens follow the same mapping; verify each in Light as you build it.

## 19. Open items for the owner

- **Library reconciliation:** the design lists blocks the designer could not verify. Provide the file or export that defines the library (the block registry: id, name, category, family, icon) so the design can be reconciled to the real total, plus the three Communities blocks not yet captured.
- Confirm Trash permissions (who can delete forever).
- Confirm the template flows against the Funnelytics and Russell originals.
- Confirm whether "Expected" exists as a saved scenario in the live app (if it does and differs from Baseline, keep it with its own assumptions).
