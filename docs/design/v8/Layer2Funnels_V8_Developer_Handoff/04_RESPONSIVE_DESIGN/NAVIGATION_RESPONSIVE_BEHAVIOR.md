# Navigation — responsive behaviour

| Element | Desktop (>1100) | Tablet (761–1100) | Phone (≤760) | Status |
|---|---|---|---|---|
| Ecosystem rail | 64 px, always visible | visible | hidden; its functions move to the apps-and-account sheet | Confirmed |
| App sidebar | 248 px, collapsible ("Collapse sidebar", remembered per device) | collapsible | hidden; replaced by the bottom tab bar | Confirmed |
| Bottom tab bar `.bbar` | — | — | first 4 items of the app's sidebar + **More** (sheet with the rest) | Confirmed (prototype) |
| App bar | crumbs + app actions | same; long crumbs truncate | org mark (opens apps-and-account sheet) + page title + primary action | Confirmed |
| Apps-and-account sheet | — | — | Launcher, search, notifications, org switch, profile, app grid | Confirmed (02 §1; screenshot `overlays-1440/00_SHELL_AND_LAUNCHER__phone-apps-and-account-sheet.jpg`, captured at 390 px) |
| Launcher | grid min 150 px tiles | same | 3-column grid | Confirmed |
| Global search | 680 px dialog | dialog | full-screen sheet | Confirmed (02 §5 "phone sheet") |
| Notifications | 520 px drawer | drawer | full screen | Proposed (drawer fills width at 390 in prototype) |
| Focused layouts (editors, canvases, avatar studio) | one top bar, no rail/sidebar | same | same; overflow actions in ⋯ | Confirmed |
| Org switching | rail org menu | same | inside the sheet | Confirmed |
