# 01 · Design system (v7 "Signal", final)

Source of truth for values: `assets/tokens.css` (exported) and `prototype-source/v6.css` + `v7.css` (component rules; v7 overrides v6). The repo already has tokens in `packages/ui/tokens.json` and the V4 stylesheet `apps/web/css/v4.css`: **update those**, don't create a parallel system. No hex colours in component CSS (repo design test DV20): use tokens.

## 1. Principles
1. One family, different rooms. Shared tokens, controls, menus, dialogs and states; each app has its own layout and density (table below).
2. Work surfaces dense, summary surfaces calm. Lists/tables 42–48 px rows; homes and profiles get air.
3. One accent per screen does the work: blue `--action` for actions and selection; the org brand colour (`--brand`) for the primary button and the "one thing that needs you".
4. Space is for content. No global header (rail instead). Editors and canvases get the whole height.
5. Every visible control works or says "Later". No fake search boxes.

## 2. Fonts (self-hosted, already in the repo)
| Role | Font | Use |
|---|---|---|
| Display | Bricolage Grotesque 600–700 | Page titles, card titles, numbers in KPI tiles |
| UI | Geist 400–650 | Everything else |
| Mono | Geist Mono | Times, counts, money in tables, shortcuts |
| Reading serif | Newsreader (italic) | Quotes, avatar beliefs, offer promises (sparingly) |
| Urdu | Noto Nastaliq Urdu | Any Urdu text; `dir="rtl"` on the element |

## 3. Type scale (v7 final; px)
| Token / element | Size / weight / line | Notes |
|---|---|---|
| Body (`--fs`) | 14.5 / 400 / 1.5 | Was 14 in v6 (too small per feedback) |
| Page title `.t1` | 26 / 650 display / 1.2 | Project title 27, client title 28, Planner hero 34 |
| Section title (card header) | 16 / 650 display | |
| Table/list row text | 14–14.5 | Project and task names 14.5 |
| Secondary / hint | 13.5 | |
| Label / overline | 11.5–12.5 / 600, uppercase overline +0.1em tracking | |
| Sidebar nav item | **15 / 550**, 40 px tall, icon 19 px | Tasks sidebar 15.5 / 42 px |
| Office Home, Office Funnels, Tasks list text, Drive browsing | **unchanged from v6** (approved) | |
| Funnel Mapper base | 14.5 (one step up from the app's 13.5) | KPI numbers 30, titles 30 |

## 4. Sizes and spacing
- Controls: 36 px (`--ctl`), small 32 px (`--ctl-sm`), extra-small 26–28 px. **On touch screens every control is ≥ 44 px** (`@media (pointer:coarse)` in v6.css).
- Radii: 6 / 8 / 12 px; cards 12–16 px; pills fully rounded; app plates 28% of size.
- Spacing scale: 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 32. Between stacked sections on a page: **18–20 px** (feedback: sections must not touch). Card padding 14–18 px.
- Rail 64 px · app sidebar 248 px (Funnel Mapper 232) · app bar 52 px · editor top bar 52 px + tool row 46 px · status bar 32 px · drawers 560–680 px (task/objective panel 680, full-width mode centres content at 960).
- Breakpoints: ≤760 phone (rail and sidebar hidden; bottom tab bar; app bar shows org mark that opens an "apps and account" sheet), 761–1100 tablet (panels become overlays), >1100 desktop.

## 5. Colour
Per organization (light): L2F brand `#FFC633` (ink `#1C1504`), action `#2B63F6`; Aurj brand `#B0305A`, action `#0C7F95`. Neutrals warm paper (`--bg #F3F1EB`, `--surface #FFFEFA`). Dark theme values in tokens. Status colours: To do `#7C818D`, In progress `#D98200`, Review `#7E5BF2`, Done `#16A34A`; project status On track `#16A34A`, At risk `#D97706`, Off track `#DC2626`; Planner kinds Not started `#94A3B8`, On track `#2B63F6`, At risk `#D97706`, Off track `#DC2626`, On hold `#64748B`, Completed `#13A592`. Status is never colour-only: always a word and a dot.

## 6. App identities (`[data-app]` on the shell sets `--app`, the tab underline / active marker colour)
| App | `--app` | Layout identity |
|---|---|---|
| Office | `#C98F00` | Paper, editorial page heads, cards |
| Projects | `#2B5CF0` | Light sidebar with project tree, dense table list, task drawer |
| Tasks | `#0EA5A4` | Lists as a white "document card" (max 880 px) on a soft teal/violet gradient |
| Clients | `#EF5235` | Stage bar, coloured client avatars |
| Drive | `#6B4FF0` | Sidebar on page background, file-type colour tiles |
| Planner | `#5E9C14` | Dot-grid strategy canvas, focus-area lanes |
| Funnel Mapper | `#10B981` | Its own dark navy theme (`--fbg #0B1220`, chrome `#111827`, lines `#1E293B/#334155`, ink `#E2E8F0`, emerald `#10B981`), DM Sans + Bricolage, as the real app |
| Whiteboard | ink | Full-screen canvas, floating toolbars |
| Agents | `#7E5BF2` | Recording stage, chat |

## 7. Components (spec = prototype class in v6/v7.css)
Buttons `.btn` (primary/ink/ghost/quiet/danger; 36/32/26 px) · icon button `.iconbtn` 36/30/24 · inputs `.field` (label 12.5/550, input 36 px) · select `.sel` · segmented `.vsw` and `.seg3` · chips `.chips6` (filter) · toggle `.toggle` 36×22 · pills `.pill`, status pills `.stp` (task), `.psp` (project), `.cpill` (client), `.kst` (Planner) · KPI tile `.kpi6` (label 12, value 22–26 display, optional sparkline) · table `.tbl6` (header 36 px uppercase 11.5, rows 48 px, hover `--surface2`) · card `.card6` (header 12–16 px padding) · tabs `.tabs6` (2 px underline in `--app`) · drawer `.drawer.task6` (sticky head, scroll body, pinned composer foot) · dialog `.dlg` (520 px, 16 px radius) · context menu `.ctx` (220 px min, 36 px rows, shortcut on the right, danger red) · toast (bottom centre, 4 s, optional Undo) · empty state `.empty` (3D stack illustration with org mark) · skeletons `.skel` · document type icon `.docic` (coloured tile, colour cycles through 8 colours) · avatar `.avatar` (30 px, initials) and photo `.photo` (always circular, `object-fit: cover`).

## 8. Motion (keep exactly; reduced-motion turns all off)
- Easing: out `cubic-bezier(.22,1,.36,1)`, spring `cubic-bezier(.34,1.56,.64,1)`.
- Page change: View Transitions API crossfade (fallback: none).
- Launcher: tiles rise in (`rise` 620 ms spring, 32 ms stagger), 3D tilt follows the pointer (±16°/±18°), app plate zooms into the app on open (zoom helper), sky/sun/moon/stars by time of day, rain/snow/clouds/heat-haze by weather.
- Cards: hover lift 2–3 px with shadow `--sh2`, 220 ms out.
- Menus/popovers: `pop` 160 ms spring from 96 % scale. Drawers slide 260 ms out. Dialog scrim fade 160 ms.
- Avatar 3D figure: idle breathe 5 s, blink every 5 s, orbiting fact chips float 6 s, pointer tilt on the stage.
- Recording button: heartbeat 1.6 s while recording; waveform bars animate.
- Confetti on avatar creation only.

## 9. Icons
`assets/icons.svg` (sprite, `<use href="#i-name">`) and `icons.json`. 24 px viewBox, 1.6 px stroke, round caps and joins, `currentColor`. Default render 16–20 px. The repo's `apps/web/js/icons-v4.js` already holds most of them: add the missing names from `icons.json` (e.g. `tasks`, `mic`, `wave`, `pdfI`, `mindmap`, `folderO`, `sparkle`, `eye2`, `key`, `users`, `dollar`, `db`, `zoom`, `quote`, `compass`, `kbd`, `taskplus`, `grip`, `expand`, `building`, `megaphone`). Names used in the briefs are these names.

## 10. Logos
Files in `assets/logos/`. Rail/launcher/switcher: square icon inside a 34 px tile (L2F icon on a white tile with 12 % padding; Aurj badge as a circle). Sign-in and exports: wordmark (black version on light, white-text version on dark; generated in the prototype as `l2fWordDark`). Never stretch: `object-fit: contain`. Favicon = org icon. All replaceable in Office › Admin › Branding.
