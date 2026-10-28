# Design V4 audit: built app vs the approved prototype

Source of truth: `docs/design/v4/ecosystem-v4.html` (+ `DESIGN_SYSTEM.md`, `APP_SPECS.md`). No Figma file exists in the repository or the session.
Compared: PR #29 build, Aurj organization, light theme, 1366 px (phone 390 px: pending), against the prototype in the same organization and theme.

## How it was measured (repeatable)
- `scripts/_audit.mjs` (local only): signs in to the built app, opens the same screen in the prototype and the build, and diffs computed styles
  (font family, size, weight, colour, radius, shadow, transition), loaded fonts, keyframes and animated elements. Output: `audit.json`.
- Side-by-side screenshots of 9 screens (Launcher, Office Home, Projects, Clients, Drive, Forms, Value Ladder, Whiteboard, Social).
- Fonts: all 11 font files are served (HTTP 200) and the same keyframes exist in the build. "Fonts missing" is **not** reproduced as a loading problem; the
  visible font errors come from class collisions (RC1, RC2).

## Root causes
| # | Cause | Effect |
|---|---|---|
| RC1 | **Class-name collisions** between app markup and prototype demo/other-purpose classes in `v4.css`. Found: `.pri` (priority label, 13px/550) vs the app's primary-button class `pri`; `.sw` (colour-swatch demo, mono 12px) vs the organization switcher `sw`. | Every primary button had the wrong size/weight; the organization switcher label rendered in a monospace font and its logo tile lost its gradient. |
| RC2 | Shared pieces were built as **aliases in `ui.css`** (older class names given a V4 look) instead of using the V4 components directly. | Drift in buttons, inputs, selects, toolbars, empty states. |
| RC3 | **Pages reskinned, not rebuilt** to the V4 page structure: Projects, Drive, Social toolbar, list pages with search/select toolbars. | Whole sections of the V4 layout are absent. |
| RC4 | **Prototype assets not carried over**: 3D empty-state stack with the organization mark, theme toggle, weather chip/clouds. | Empty states and the Launcher header look flatter than V4. |
| RC5 | **Deliberate departures** (recorded in DECISIONS): muted text `#626674` (V4-11 contrast fix), input border keeps `--control` (WCAG 1.4.11). | Not defects. |

## Status by app (PR #29)
| App | Status | Notes |
|---|---|---|
| Shell (side rail, header, bottom bar) | Partial | Structure matches. Header: org button font/logo (RC1), duplicate crumb, avatar colour, no theme toggle. |
| Launcher | Partial | Structure, shelf, tiles match. Missing: weather chip/clouds (needs weather data), theme toggle, smaller hero heading, personalised sub-line. |
| Office Home | Mostly complete | Matches closely. 3 stats instead of 4 ("Done this week"); banner is data-driven. |
| Office (Funnels, Team, Apps, Admin) | Not yet compared | Included in the next verification round. |
| Projects | **Wrong structure** | Built is the older card grid; V4 Home (greeting, priorities, project list, recent updates), Docs, Whiteboards, Dashboards, AI Assist, App Center pages are missing. |
| Clients | Partial | Title/table close. Empty state flat (RC4), duplicate crumb, button typography (RC1). |
| Drive | **Wrong structure** | V4 Home (suggested files, folders, recent files, space switcher, storage meter, star/info actions) missing; built is the older library list. |
| Forms | Partial | Rail matches; list is an empty state here (no data); toolbar uses native select (RC2). |
| Value Ladder | Partial | Toolbar and cards differ (mini bar-chart cards in V4). |
| Whiteboard | Not yet compared visually | |
| Social Planner | Partial | Page title should be "Calendar"; V4 legend chips and compact month navigation; today marker style. |
| Client Portal | Locked | Not compared (preview only). |

## Correction checklist (priority order). Status changes only after verification.
| ID | Pri | Where | Observed | Expected (V4) | Fix | Status |
|---|---|---|---|---|---|---|
| A1 | P0 | All screens | Primary buttons 13px/550 | 14.5px/600 | Use V4 `.btn.primary`; drop the `pri` alias (RC1) | verify |
| A2 | P0 | Header | Org label monospace, logo tile wrong | Geist 600, rose gradient tile | Rename switcher class (RC1) | verify |
| A3 | P1 | Header, side rail | Avatar uses brand rose, white text | V4 avatar (yellow, dark text) via `--av` | Use V4 avatar token | open |
| A4 | P1 | Clients, Drive, Forms, Social | Duplicate crumb ("Clients / Clients") | Single app crumb | `setCrumbs` per page | open |
| A5 | P1 | Empty states (all lists) | Flat 3-layer icon | 3D V4 stack with organization mark | Use V4 `.stack` illustration in `emptyState` | open |
| A6 | P1 | Primary buttons | No leading plus icon | Plus icon on create actions | Add icon to create buttons | open |
| A7 | P1 | List toolbars | Bordered search + native select | V4 `.sel` and search styling | Use `.sel` / V4 search | open |
| A8 | P1 | Launcher header | No theme toggle; avatar colour | Moon/sun toggle, V4 avatar | Add toggle | open |
| A9 | P1 | Launcher hero | Heading larger than V4; generic sub-line | V4 size; personalised line | Match size; data-driven line | open |
| B1 | P0 | Projects | Older card grid | V4 Home + pages | Rebuild Projects Home and menu pages | open |
| B2 | P0 | Drive | Older library list | V4 Home (suggested, folders, recent, storage) | Rebuild Drive Home | open |
| B3 | P1 | Social | Title "Social Planner", pill buttons | "Calendar", legend chips, compact nav | Rework page head and toolbar | open |
| B4 | P2 | Value Ladder | Toolbar differs | Cards with mini bars | Card redesign | open |
| B5 | P2 | Pills | 12px | 11.5px | Token match | open |
| C1 | P1 | Interactions | Hover/press on rebuilt buttons unverified | V4 hover, press, transition timings | Verify after A1 | open |
| C2 | P1 | All | Phone 390 px not yet compared | V4 mobile layouts | Run pair comparison | open |
| C3 | P2 | Office Funnels/Team/Apps/Admin, Whiteboard | Not yet compared | | Compare | open |
