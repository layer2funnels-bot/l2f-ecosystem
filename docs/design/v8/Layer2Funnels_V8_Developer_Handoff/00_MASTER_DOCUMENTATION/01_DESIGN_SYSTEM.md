# 01 · Design system — V8 "Ledger" (final)

**Authority:** this document + `02_DESIGN_SYSTEM/` (tokens) + `08_PROTOTYPE_AND_SOURCE/prototype-source/v8.css` (exact rules). V8 replaces every visual value in v7's `01_DESIGN_SYSTEM.md`; v7 functions are unchanged. The repo already has `packages/ui/tokens.json` and `apps/web/css/v4.css`: **update those**, don't create a parallel system. No hex colours in component CSS (test DV20).

## 1. Principles (why V8 looks the way it does)
1. **A working ledger, not a template.** Stone paper, ink text, hairline rules. Structure comes from alignment and rules, not from floating cards, shadows or gradients.
2. **Colour only carries meaning:** brand colour for the one primary action and the "thing that needs you"; action blue for links, selection and focus; status colours as a dot next to a word. Never decoration.
3. **One typeface (Geist).** Hierarchy by size and weight. Bricolage Grotesque appears only on the Launcher hero (the brand moment).
4. **One size system across apps,** with a text floor of 12 px (only avatar initials and file-type badges go smaller).
5. **Right panels are readable:** values 15 px, labels 13.5–14 px, controls 34–40 px. Neither v7-small nor v6-large.
6. **Each app keeps its own layout** (table, outline, file manager, canvas, map) — the shell, tokens and components are shared.
7. **Scope component classes per app.** Most v7 defects came from class names shared between apps (see `V8_BUG_FIXES.md`).
8. Kept from earlier rounds (owner approved): the rail, Launcher sky/plates/motion, sidebar structure and text sizes, Funnel Mapper's own dark theme.

## 2. Colour tokens (computed from the V8 prototype)

| Token | L2F light | L2F dark | Aurj light | Aurj dark |
|---|---|---|---|---|
| `--bg` | #F3F4F1 | #0E0F0E | #F5F2EF | #110C0F |
| `--surface` | #FDFDFC | #161816 | #FEFCFB | #1A1317 |
| `--surface2` | #F7F8F5 | #121412 | #F9F6F3 | #140F12 |
| `--sunk` | #EBEDE8 | #1E211E | #EDE7E2 | #251C21 |
| `--line` | rgba(22,26,22,.09) | rgba(255,255,255,.075) | rgba(22,26,22,.09) | rgba(255,255,255,.075) |
| `--line2` | rgba(22,26,22,.17) | rgba(255,255,255,.15) | rgba(22,26,22,.17) | rgba(255,255,255,.15) |
| `--text` | #141614 | #EEEEEA | #141614 | #EEEEEA |
| `--text2` | #454A46 | #ABAFB9 | #454A46 | #ABAFB9 |
| `--muted` | #6A706B | #8A8F9B | #6A706B | #8A8F9B |
| `--brand` | #FFC633 | #FFC633 | #B0305A | #E0638A |
| `--brand-ink` | #1C1504 | #1C1504 | #FFF6F2 | #1A0A10 |
| `--brand-deep` | #C98F00 | #C98F00 | #7E1C3D | #A83A60 |
| `--brand-soft` | rgba(255,198,51,.2) | rgba(255,198,51,.2) | rgba(176,48,90,.13) | rgba(176,48,90,.13) |
| `--action` | #2B63F6 | #7398FF | #0C7F95 | #4CC6DC |
| `--action-ink` | #F7F9FF | #06132F | #F2FCFE | #04262D |
| `--action-tint` | rgba(43,99,246,.1) | rgba(115,152,255,.15) | rgba(12,127,149,.11) | rgba(76,198,220,.14) |
| `--warn` | #8A5200 | #FFC266 | #8A5200 | #FFC266 |
| `--warn-tint` | #FFF0D2 | rgba(255,184,77,.12) | #FFF0D2 | rgba(255,184,77,.12) |
| `--danger` | #BA3126 | #FF8577 | #BA3126 | #FF8577 |
| `--danger-tint` | #FCE8E4 | rgba(255,106,90,.13) | #FCE8E4 | rgba(255,106,90,.13) |

- App identity colour `--app` per `[data-app]` (tab underline / active marker): Office `#C98F00`, Projects `#2B5CF0`, Tasks `#0EA5A4`, Clients `#EF5235`, Drive `#6B4FF0`, Planner `#5E9C14`, Funnel Mapper `#10B981`, Agents `#7E5BF2`.
- Status (always word + dot, never colour alone): task To do `#7C818D`, In progress `#D98200`, Review `#7E5BF2`, Done `#16A34A`; project On track `#16A34A`, At risk `#D97706`, Off track `#DC2626`; Planner Not started `#94A3B8`, On track `#2B63F6`, At risk `#D97706`, Off track `#DC2626`, On hold `#64748B`, Completed `#13A592`.
- Funnel Mapper scope (`.fmpx`): `--font-d` "Geist",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif, `--font` "Geist",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif, `--fs` 14.5px, `--fbg` #0B1220, `--fch` #111827, `--fp2` #1E293B, `--fln` #1E293B, `--fln2` #334155, `--fink` #E2E8F0, `--fmu` #94A3B8, `--fbr` #10B981, `--fbl` #34D399.
- Neutrals never pure `#000`/`#fff` except the white page in editors and text on brand where contrast requires it.

## 3. Typography

| Role | Font | Size / weight / line height |
|---|---|---|
| Everything in the apps | **Geist** 400–700 (`--font`) | Body 14.5 / 400 / 1.45 |
| Page title (`.t1`, Drive/Tasks/Clients headers) | Geist | 24 / 620 / 1.2, letter-spacing −0.022em |
| Greeting (Office, Portal) | Geist | 30 / 620 / 1.15 |
| Section heading (panel header, `h2` in cards) | Geist | 16 / 650 / 1.25 |
| Small section label (`.over`) | Geist | 12.5 / 600, **sentence case**, +0.02em (v7 used tracked uppercase — removed) |
| Table header | Geist | 12.5 / 600 sentence case |
| Table / list row | Geist | 14–15 (project & task names 14.5) |
| Secondary / hint | Geist | 13–13.5 |
| KPI number | Geist | 24 / 650 (Projects band 28 / 500 in the Ledger KPI strip), tabular figures |
| Sidebar item (unchanged, approved) | Geist | 15 / 550, 40 px rows (Tasks 15.5 / 42 px) |
| Shortcuts, timer clock | Geist Mono 400–500 | 11.5–13 |
| Launcher hero | Bricolage Grotesque 600–800 | up to 76 px |
| Urdu text | Noto Nastaliq Urdu, `dir="rtl"` | |

Numbers in tables and counts use `font-variant-numeric: tabular-nums` in Geist (v7 used monospace — removed). Font files: `03_ASSETS/fonts/` (self-hosted, same as the repo's `apps/web/fonts/`). Newsreader (v7 quotes) is not used in V8 (D11).

## 4. Size, spacing, radii, elevation

- Controls 38 px (`--ctl`), small 32 px, icon buttons 32/26; touch screens ≥44 px for everything (`@media (pointer:coarse)`).
- Radii: controls 6–8 px (`--r-ctl` 8), cards/panels 8–10 px (`--r-card` 10), dialogs 10 px, pills 5–6 px (not fully round), avatars and photos circular.
- Borders: 1 px `--line`; stronger `--line2` for inputs and outline buttons.
- Elevation: **no resting shadows** (`--sh1` = none). Shadows only for things that float above the page: menus/popovers (`--sh2`), dialogs and drawers (`--sh3`).
- Spacing scale 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 32, 40, 48. Between stacked sections 18–20 px (32–36 px in content pages that use rule-separated sections); panel header padding 12–14 × 18 px.
- Layout: rail 64 px · app sidebar 248 px (Funnel Mapper 232) · app bar 52 px · content padding 26 px top, max 1440 px. Drawers 520–680 px (task/objective panel 680). Editors: top bar 52 + menu/tool row 46 + status 32.
- Breakpoints: ≤760 phone, 761–1100 tablet, >1100 desktop (see `04_RESPONSIVE_DESIGN/`).

## 5. Right-side panel size system (task panel, objective drawer, file details, properties, inspectors)

| Element | V8 value |
|---|---|
| Panel title | 21–24 px / 650 |
| Breadcrumb | 13.5 px |
| Field row | 44 px tall; label column 150 px (120 px on phone) |
| Field label | 14 px, `--text2`, icon 17 px muted |
| Field value | 15 px; inline value buttons 34 px |
| Section heading | 16 px / 650, hairline above each section, 18 px padding |
| Body text (description, comments) | 15 px / 1.5–1.6 |
| Inputs / selects | 15 px, 38–40 px tall |
| Secondary text, counts | 13–13.5 px; count chip 12.5 px on `--sunk` |
| Subtask/checklist rows | 42 px, 15 px; assignee avatar 24 px circle |
| Sticky header / pinned composer | 56 px header; composer 15 px |
| Funnel Mapper inspector | 340 px wide at ≥1280 px, text 14.5 px |

## 6. Components (class = prototype reference; exact CSS in v6/v7/v8.css, v8 wins)

| Component | V8 spec |
|---|---|
| Button `.btn` | Flat, radius 6, 38/32 px; primary = brand fill + brand ink; ink = text fill; ghost = surface + 1 px `--line2`; quiet = text only; danger. No extruded bottom edge, no lift. Hover darkens/tints; active moves 0.5 px. |
| Icon button `.iconbtn` | 32 px, radius 6, hover `--sunk`. Always `aria-label`. |
| Input `.inp`, field `.field` | Label above (13.5/550), input 38–40 px, radius 6, focus ring 2 px action. |
| Segmented `.vsw` / `.seg3` | `--sunk` track, selected = surface + 1 px line. |
| Tabs `.tabs6`, `.vtabs` | Text tabs 14.5 px, 42 px tall; selected = 2 px underline in `--app` (Ledger KPI pages use ink). |
| Panel / card `.card6`, `.panel` | Surface, 1 px line, radius 8–10, **no shadow**; header on its own hairline (12–14 × 18 px), title 16 px. |
| KPI band `.kpirow` + `.kpi6` | One bordered band divided by 1 px rules; label 13 px, value 24 px tabular. |
| Table `.tbl6`, `.tbl`, `.ftab` | Header band `--surface2`, sentence case 12.5 px; rows 44–54 px; hover `--surface2`; selected `--action-tint`. |
| Status `.stp/.psp/.kst/.cpill` | Word + 7 px dot on `--sunk`, radius 5, 12.5 px. |
| Pill / tag | Radius 5, 12.5 px, neutral ground. |
| Drawer `.drawer`, `.task6` | Right side, sticky head, scrolling body, pinned foot; size system §5. Phone: full screen. |
| Dialog `.dlg` | 520 px, radius 10, `--sh3`, scrim fade 160 ms. |
| Context menu `.ctx` | ≥220 px, 36 px rows, shortcut right-aligned, danger in red. |
| Toast | Bottom centre, 4 s, optional Undo. |
| Empty state `.empty` | One illustration + one action. |
| Skeleton `.skel` | For every loading list/table. |
| Document icon `.docic` | Flat colour tile (colour cycles through 8), radius 6. |
| File-type badge `.ft` | Flat colour tile with DOC/XLS/PPT/IMG/PDF. |
| Avatar `.avatar` / photo `.photo` | Circular; initials 10.5–12.5 px bold; no inner ring. |
| App mark (`.plate` outside the Launcher) | Flat colour tile with glyph; Launcher keeps the 3D plate. |
| Selection bar `.selbar` | Ink bar, radius 8, bottom centre. |
| Stage stepper `.stagebar6` | One connected bar with 1 px dividers; 3 px progress line under each stage. |
| Heat map `.heat` (Workload) | Grid: person column 200 px+, Overdue, No date, week columns ≥78 px; cells 40 px, colours low/mid/high/over. |

## 7. Motion (unchanged; reduced motion turns all off)
Easing out `cubic-bezier(.22,1,.36,1)`, spring `cubic-bezier(.34,1.56,.64,1)`. Page change: View Transitions crossfade. Launcher: tile rise, pointer tilt, zoom into app, sky/weather. Menus `pop` 160 ms; drawers slide 260 ms; dialog scrim 160 ms. **Work surfaces do not lift on hover** (V8). Avatar 3D figure idle/blink; recording heartbeat; confetti on avatar creation and Portal approval only.

## 8. Icons and logos
145 icons (24 px grid, 1.6 stroke, round caps/joins, `currentColor`): `03_ASSETS/icons/` (sprite, JSON and one SVG per icon). App icons: `03_ASSETS/app-icons/` (Launcher plate + flat mark per app). Logos: `03_ASSETS/logos/` — icon inside a fixed tile with `object-fit: contain`, never stretched; replaceable in Office › Admin › Branding. Index: `08_ASSET_AND_ICON_INDEX.md`.

## 9. Anti-patterns (rejected by the owner; do not reintroduce)
Gradient backgrounds and banners · floating cards with resting shadows · glossy/extruded tiles in work screens · tiny tracked uppercase labels · monospace numbers in normal UI · coloured pill blobs for status · text under 12 px in panels · cards that wrap text into three lines · the same card grid for every kind of content · decorative empty space.
