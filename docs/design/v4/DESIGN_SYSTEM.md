# Design System v4 "Signal" (consolidated)

Put at `docs/design/v4/DESIGN_SYSTEM.md`. Source of truth for look and layout, with `APP_SPECS.md`.
**Derived from the v4 prototype CSS** (`prototype-source/base.css`, `v4.css`, `extra.css`), because the package shipped without this file and no older design-system file was supplied. Where a value is an assumption it is marked **[A]**. Behaviour, permissions and data rules come from the product specs and backend, never from this file.

Authority order: owner's latest words → backend facts → this file and APP_SPECS → older docs. Older v2 blue/white tokens are history only.

## 1. Concept
"Signal": warm paper-toned neutrals, one brand colour per organization, one action (button/focus) colour, soft layered shadows, rounded corners, spring motion. The prototype also contains `data-concept="paper|glass|blocks"` variants. **Those were rejected alternatives. Do not ship them.**

## 2. Theming model (implement as CSS variables on `<html>`)
- `data-theme="light|dark"`: neutrals. `data-org="l2f|aurj"`: brand and action. Switching the organization must swap `data-org` and keep the current page.
- Default theme follows the system setting; the user can override in profile. [A]

### Neutrals
| Token | Light | Dark |
|---|---|---|
| --bg | #F3F1EB | #0C0D10 |
| --surface | #FFFEFA | #15171C |
| --surface2 | #F8F6F1 | #111317 |
| --sunk | #ECE9E1 | #1D2026 |
| --line / --line2 | rgba(28,24,14,.09) / .18 | rgba(255,255,255,.075) / .15 |
| --text | #16171B | #EEEEEA |
| --text2 | #4A4E59 | #ABAFB9 |
| --muted | **#626674 (fixed, see §10)** | #8A8F9B |
| --warn / --warn-tint | #8A5200 / #FFF0D2 | #FFC266 / rgba(255,184,77,.12) |
| --danger / --danger-tint | #BA3126 / #FCE8E4 | #FF8577 / rgba(255,106,90,.13) |

Aurj overrides neutrals slightly warmer/rose: light bg #F6F0EB, surface #FFFCF9, surface2 #FAF5F0, sunk #EFE6DF; dark bg #110C0F, surface #1A1317, surface2 #140F12, sunk #251C21.

### Organization colours
| Token | Layer2Funnels | Aurj (**placeholder**) |
|---|---|---|
| --brand | #FFC633 (dark same) | #B0305A (dark #E0638A) |
| --brand-ink | #1C1504 | #FFF6F2 (dark #1A0A10) |
| --brand-deep | #C98F00 | #7E1C3D (dark #A83A60) |
| --action | #2B63F6 (dark #7398FF) | **#0A7388 (fixed)** (dark #4CC6DC) |
| --action-ink | #F7F9FF (dark #06132F) | #F2FCFE (dark #04262D) |
| --action-tint | rgba(43,99,246,.1) | rgba(12,127,149,.11) |

All brand/logo/Aurj colours live in **one theme file** so real assets replace placeholders in one change. Owner supplies final logo files and Aurj palette before go-live.

### Shadows
--sh1 (hairline), --sh2 (card), --sh3 (modal/drawer); values in prototype `base.css` lines 6-7.

## 3. Typography (self-host all; no Google Fonts at build or runtime)
- Display: **Bricolage Grotesque** (`--font-d`, letter-spacing -.025em) for page titles, big numbers.
- Body/UI: **Geist** (`--font`), base 15px / 1.5.
- Numbers/code/IDs: **Geist Mono** (`--mono`, tabular numbers).
- Urdu/Hindi: **Noto Nastaliq Urdu** (`--urdu`) for Aurj content; set `dir="rtl"` per element, not per page. [A]
- All four are open-licence (OFL); add a licence entry to DECISIONS like FNT-1.

## 4. Shape, motion, layout
- Radius: --r-sm 10, --r 14, --r-lg 22. Border 1px.
- Easing: --e-out `cubic-bezier(.22,1,.36,1)`, --e-spring `cubic-bezier(.34,1.56,.64,1)`. Opening an app zooms out of its icon; drawers slide; confetti only on Portal approvals.
- `prefers-reduced-motion`: all animation/transition reduced to ~0; decorative weather particles hidden.
- Breakpoints to build and test: **390, 768, 1366** (prototype also collapses at 1080 and 900). Tables become stacked rows on phones; side panels move below content; bottom bar replaces side nav on phones.
- Safe areas: pad with `env(safe-area-inset-*)`. Tap targets >= 44px. Focus ring: 3px solid --action, offset 2px, never removed.
- Prototype checked only 390 and 1366 in Chromium; add 768, Safari, Firefox, 320px and landscape to the test plan.

## 5. Shared shell
Header (app plate + name, org switcher, search Ctrl/Cmd-K, app switcher grid button, notifications [disabled until backend], profile), side nav (bottom bar on phones), page head with breadcrumbs, content. Org switcher keeps the current app and equivalent page; unsaved-changes dialog (save and switch / discard and switch / stay).
App switcher: "Back to Launcher" + all apps the person may open.
**App plate:** rounded-square icon tile, one colour per app (prototype `.plate`; locked/soon states desaturated). Plate colours per app are an **[A]** to be taken from `ecosystem-v4.html` and stored in the app manifest (see EXTERNAL_APP_ONBOARDING.md).

## 6. Component inventory (from prototype class names)
Build each once as a shared component; apps must not restyle them.
- Actions: button (primary/secondary/ghost/danger, disabled keeps explanation), icon button, link button, toggle, segmented control (`.seg`), tabs (`.tabs`, `.stabs`), chips/pills/badges (`.pill`, `.chip`, `.bdg`, `.tag`).
- Containers: card, panel, tile, notice (`.notice`), empty state, skeleton, toast, dialog (`.dlg`), drawer (`.drawer`), overlay page, menu/dropdown, command palette (`.cmdk`), tooltip/hint.
- Data: table that stacks on phones (`.tbl`, `.rows`), list row, key-value, stat (`.stat3`, `.kcard`), progress/bar, avatar and stack, timeline/gantt, calendar (month/week strip), kanban, steps/journey (`.mile`, `.road`).
- Forms: input, textarea, select, checkbox, radio, range, date, file drop (`.drop`), field with help/error.
- Editors: top bar with save state and undo/redo (`.ws-bar`), unsaved-change guard, outline, formatting toolbar, comment thread, presence dots.
- Special: Launcher sky and weather chip, frosted shelf (`.shelf`), Portal rocket bar and confetti, value-ladder steps, avatar-profile portrait.
Every component needs: default, hover, focus, active, disabled, loading, error, empty states; light and dark; both orgs.

## 7. Shared states (mandatory on every screen)
Loading (skeleton), empty (first-use vs no-match), error (what happened, what to do, retry), no access ("Not here" / "Locked" / "Soon" / "Next round" explain in a dialog), offline [A], unsaved changes, saving/saved, read-only (archived banner with Restore), preview-only (Portal ribbon until gate G2).
**Never fake success.** No "sent / invited / published / connected / uploaded" unless the backend confirms. Prototype-only actions stay visible, disabled, with the reason.

## 8. Launcher sky and weather
Time of day from local clock: morning 5-12, afternoon 12-17, evening 17-21, night 21-5. Weather tints the sky (clear, cloudy, rain, hot, cold). Source: browser geolocation with permission, **MET Norway Locationforecast** through our server, cached 30 min, identifying User-Agent, attribution shown, user can switch weather off; if denied or unavailable, time-of-day only. Re-verify MET terms when building. $0.

## 9. Accessibility
WCAG 2.2 AA target. Keyboard everywhere, visible focus, labelled controls, `aria-live` for toasts and save state, reduced motion honoured, no colour-only meaning (status uses text + icon), Urdu/RTL tested. Prototype was not tested with real screen readers: add that to each app's PR.

## 10. Fixes to the prototype tokens (audit, contrast measured)
| Pair | Measured | Fix |
|---|---|---|
| --muted #6F7380 on --bg #F3F1EB | 4.19 (fails AA) | use #626674 (5.06 on bg, 4.71 on --sunk) |
| Aurj action-ink on #0C7F95 | 4.49 (borderline) | action #0A7388 (5.27) |
| L2F action button text on #2B63F6 | 4.73 | ok |
| brand-ink on brand (L2F) 11.55, Aurj 5.77; warn 5.67; danger 5.01 | ok | none |
Claude Code adds an automated contrast test over all token pairs in both themes and orgs.

## 11. Open items (genuinely need owner input)
1. Real logo files and Aurj palette (placeholders now; not a blocker until go-live).
2. Copy-stage requirements (not found; build the agreed basics only, see prompt).
No other design-system decisions are open.
