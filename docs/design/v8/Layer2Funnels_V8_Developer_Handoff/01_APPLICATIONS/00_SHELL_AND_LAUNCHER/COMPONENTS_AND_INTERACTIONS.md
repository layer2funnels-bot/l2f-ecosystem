# Global shell, Launcher and Profile · components and interactions

Visual specs for every component: `00_MASTER_DOCUMENTATION/01_DESIGN_SYSTEM.md` §6. Exact CSS: `08_PROTOTYPE_AND_SOURCE/prototype-source/` (later files override earlier: base → v4 → v5 → v6 → v7 → v8).

Prototype source files for this app: `head.js`, `core5.js`, `core6.js`, `reuse.js`, `icons5.js`, `logos.js`, `v7.js`, `v8.js`.

## Shared components used

- Table (.tbl6)
- Tabs (.tabs6)
- Segmented switch (.vsw)
- Toggle
- Task status pill (.stp)
- Planner status (.kst)
- Empty state (.empty)
- Skeleton (.skel)
- Right drawer / panel
- Dialog (.dlg)
- Context menu (.ctx)
- Form field (.field)
- Input with icon (.inp)
- Alignment box
- Avatar (initials)
- Photo (circular)
- App mark / plate
- Progress bar
- Progress ring
- Toast
- Pill / tag

## Dialogs and drawers (from the prototype source)

| Opening action id | Kind | Title |
|---|---|---|
| `more` | dialog | More |
| `decline` | dialog | Decline this invitation? |
| `(inline)` | drawer | — |
| `ushelp` | dialog | How search works |

Where the same action id appears in a v5 and a v6 file, the later file wins (that is what the prototype shows).

## Captured overlay states (desktop 1440)

- notifications: [screenshot](../../06_SCREENSHOTS_AND_REFERENCES/v8/overlays-1440/00_SHELL_AND_LAUNCHER__notifications.jpg) (route `#/office/home`)
- global-search: [screenshot](../../06_SCREENSHOTS_AND_REFERENCES/v8/overlays-1440/00_SHELL_AND_LAUNCHER__global-search.jpg) (route `#/office/home`)
- apps-menu: [screenshot](../../06_SCREENSHOTS_AND_REFERENCES/v8/overlays-1440/00_SHELL_AND_LAUNCHER__apps-menu.jpg) (route `#/office/home`)
- org-switcher: [screenshot](../../06_SCREENSHOTS_AND_REFERENCES/v8/overlays-1440/00_SHELL_AND_LAUNCHER__org-switcher.jpg) (route `#/office/home`)
- profile-menu: not captured automatically — open the prototype route and use the control (route `#/office/home`)
- phone-apps-and-account-sheet: [screenshot](../../06_SCREENSHOTS_AND_REFERENCES/v8/overlays-1440/00_SHELL_AND_LAUNCHER__phone-apps-and-account-sheet.jpg) (route `#/office/home`)

## Interaction catalogue (every action id found on this app's pages)

| Action id | Control labels using it | Opens |
|---|---|---|
| `orgmenu` | Layer2Funnels | — |
| `org` | AurjOwner · education; Layer2FunnelsOwner · funnel agency | — |
| `usearch` | Search everything | — |
| `inbox` | Notifications | — |
| `railmenu` | Apps | — |
| `photoedit` | Change photo | Profile photo |
| `toast` | Change; Continue with Google; Details for support; Edit offer; New client; Save; Sign out others; System; Try again; Turn on | — |
| `auth` | Check email; Create an account; Forgot password?; Invitation; New password; No organization; Reset; Session ended; Sign in; Sign up | — |
| `pw` | Show password | — |
| `signin` | Sign in | — |
| `noop` | Approve; Cancel; Clear search; More options; New offer; Press me; Save changes | — |
| `demo-dlg` | Open dialog | — |
| `demo-spring` | (icon) | — |
| `tgl` | Compact; In app; Reduce motion | — |
| `demo` | Dark; Light | — |
| `wxtoggle` | Weather | — |

## Keyboard and right-click (from the brief)

- - **Profile menu**: photo 48, name, email, My profile (`#/profile`), Appearance (Light/Dark), Weather on the Launcher (toggle), Keyboard shortcuts, Sign out.
- ## 3. Links, new tabs, right-click
- - Every navigation element is an `<a href="#/…">` (or the app's real URL). Ctrl/Cmd-click, Shift-click, middle-click and the browser's "Open link in new tab" must work. Buttons that navigate programmatically must also honour Ctrl/middle-click (prototype: `auxclick` handler + `nav` action check).
- - Custom right-click menus (`.ctx`) on: tasks, projects, sections, view tabs, files, task list items, lists, clients, strategy boxes, whiteboard boards. Escape closes; arrow keys move; long-press opens on touch.
- ## 5. Global search [N] (Ctrl K anywhere, rail search button, phone sheet)
- - Dialog 680 px. Input; **scope row** "Search in": Everything · Projects & tasks · Tasks · Clients · Docs & files · Office · Planner · Funnels. Default scope = the current app if it is searchable, else Everything. `Tab`/`Shift Tab` in the input cycles scope; typing `in:clients`, `in:projects`, `in:drive|files|docs`, `in:planner`, `in:funnels` switches scope and removes the token.
- - Results grouped by app (max 4 per app in Everything, 12 in a scope), app plate on each row, highlighted match, "Archived" pill. ↑↓ move, Enter opens, Ctrl Enter opens in new tab. Footer: key hints + "How search works" (dialog text in prototype).

## Interaction rules that apply everywhere

- All navigation is a real link (Ctrl/middle-click open new tabs) — 02 §3.
- Right-click menus use the shared `.ctx` component: Escape closes, arrows move, long-press opens on touch.
- Every visible control works or is clearly marked "Later". The prototype's toasts and fake data are not product behaviour.
