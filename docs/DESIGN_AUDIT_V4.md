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
Verification used: the repeatable comparison (`scripts/_audit.mjs` computed styles, side-by-side screenshots of the prototype and the build at 1366 and 390 px) plus the browser suite (`scripts/e2e-ui.mjs`, 242 checks on a fresh database).

| ID | Pri | Where | Observed | Expected (V4) | Fix | Status |
|---|---|---|---|---|---|---|
| A1 | P0 | All screens | Primary buttons 13px/550 | 14.5px/600 | `.btn.primary`; `pri` alias dropped (RC1) | **done** (audit diff gone) |
| A2 | P0 | Header | Org label monospace, wrong logo tile | Geist 600, org tile | Switcher class renamed (RC1) | **done** |
| A3 | P1 | Header, side rail | Avatar in brand rose | V4 avatar (yellow, dark text) | V4 avatar token | **done** |
| A4 | P1 | Clients, Drive, Forms, Social | Duplicate crumb | Single app crumb | `setCrumbs` per page | **done** |
| A5 | P1 | Empty states | Flat 3-layer icon | 3D V4 stack with organization mark | V4 stack illustration in `emptyState` | **done** |
| A6 | P1 | Primary buttons | No plus icon | Plus on create actions | Icon added by the `btn` helper | **done** |
| A7 | P1 | List toolbars | Native select | V4 `.sel` | `.sel` on Drive type filter and Social channel filter; other lists unchanged | partial |
| A8 | P1 | Launcher header | No theme switch | Moon/sun toggle | Quick light/dark switch beside the profile | **done** (needs your eye) |
| A9 | P1 | Launcher hero | Heading slightly larger, no weather chip offline | V4 size, weather chip | Weather chip needs live weather (not available offline) | partial |
| B1 | P0 | Projects | Older card grid | V4 Home + menu pages | Home rebuilt (greeting, priorities, projects, recent updates); rail: Home, My Work, Projects, Docs, Whiteboards, Dashboards, AI Assist, App Center; Docs lists project documents; Dashboards and AI Assist are honest "not available yet" pages (no AI provider is connected) | **done** |
| B2 | P0 | Drive | Older library list | V4 Home | Recently edited cards, folder quick links, type filter, PDF/IMG tiles. Not built, on purpose: Shared with me, Shared drives, Starred, storage meter, People filter (no data behind them yet) | partial |
| B3 | P1 | Social | Title "Social Planner", pill buttons | "Calendar", legend, compact nav | Page title per tab, month row with channel legend, icon steppers, neutral notice with plug icon, channel-coloured posts, dark today marker | **done** |
| B4 | P2 | Value Ladder | Toolbar differs | Cards with mini bars | Card redesign | open |
| B5 | P2 | Pills | 12px | 11.5px | Token match | open |
| C1 | P1 | Interactions | Hover/press unverified | V4 timings | Needs a hover/press recording pass | open |
| C2 | P1 | Phone 390 px | Header search squeezed the page name | Search is an icon on phones | Header search collapses to an icon at 620 px and below. Calendar keeps a day list on phones (the prototype's 8 px colour bars cannot meet the 44 px touch target) | **done** for Projects, Drive, Social; other apps open |
| C3 | P2 | Office Funnels/Team/Apps/Admin, Whiteboard | Not yet compared | | Compare | open |

### Bugs found by the verification itself (not design items)
- A view that finished loading before the page was attached dropped its result and stayed on its loading skeleton (the manifest registry loaded after the view started). Fixed by loading the registry first. Seen as an intermittent failure in the browser suite on a fresh database.
- Hidden labels inside a scrolling table escaped its scroll box and widened the page at 768 px (Drive). Fixed.
- A new class `sp-bar` collided with an existing progress-bar class and `sp-prev` with the post preview: the same class-collision pattern as RC1. Renamed.
