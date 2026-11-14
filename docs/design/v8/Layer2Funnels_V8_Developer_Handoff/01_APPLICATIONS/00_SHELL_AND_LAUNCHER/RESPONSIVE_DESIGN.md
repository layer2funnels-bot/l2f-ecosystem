# Global shell, Launcher and Profile · responsive design

Global rules: `04_RESPONSIVE_DESIGN/DESKTOP_TABLET_MOBILE_RULES.md`. Navigation: `NAVIGATION_RESPONSIVE_BEHAVIOR.md`. This app's specifics: `APP_SPECIFIC_MOBILE_REQUIREMENTS.md`.

## Confirmed (shown by the V8 prototype at every width)

- Breakpoints: phone ≤760 px, tablet 761–1100 px, desktop >1100 px.
- Phone: rail and app sidebar hidden; bottom tab bar = the app's first 4 nav items + More; app bar shows the org mark that opens the apps-and-account sheet.
- Touch screens: every control ≥44 px (`@media (pointer:coarse)`).
- No horizontal page scroll at 390 px on any page of this app (automated check).

## Confirmed in the brief

- - **Phone ≤760**: rail and sidebar hidden; bottom tab bar with the app's first 4 nav items + More sheet; the app bar shows the org mark which opens the "apps and account" sheet (launcher, search, notifications, org switch, profile, app grid).
- ## 5. Global search [N] (Ctrl K anywhere, rail search button, phone sheet)

## Page-by-page screenshots

| Page | Desktop 1440 | Tablet 834 | Phone 390 |
|---|---|---|---|
| Launcher (`#/launcher`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/00_SHELL_AND_LAUNCHER/001_launcher.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/00_SHELL_AND_LAUNCHER/001_launcher.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/00_SHELL_AND_LAUNCHER/001_launcher.jpg) |
| Your profile (global) (`#/profile`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/00_SHELL_AND_LAUNCHER/002_profile.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/00_SHELL_AND_LAUNCHER/002_profile.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/00_SHELL_AND_LAUNCHER/002_profile.jpg) |
| Sign in screens (`#/auth`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/00_SHELL_AND_LAUNCHER/003_auth.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/00_SHELL_AND_LAUNCHER/003_auth.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/00_SHELL_AND_LAUNCHER/003_auth.jpg) |
| Shared states (`#/states`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/00_SHELL_AND_LAUNCHER/004_states.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/00_SHELL_AND_LAUNCHER/004_states.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/00_SHELL_AND_LAUNCHER/004_states.jpg) |
| Design system (`#/system`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/00_SHELL_AND_LAUNCHER/005_system.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/00_SHELL_AND_LAUNCHER/005_system.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/00_SHELL_AND_LAUNCHER/005_system.jpg) |
| Tabish Riaz (`#/profile/about`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/00_SHELL_AND_LAUNCHER/124_profile_about.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/00_SHELL_AND_LAUNCHER/124_profile_about.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/00_SHELL_AND_LAUNCHER/124_profile_about.jpg) |
| Tabish Riaz (`#/profile/account`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/00_SHELL_AND_LAUNCHER/125_profile_account.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/00_SHELL_AND_LAUNCHER/125_profile_account.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/00_SHELL_AND_LAUNCHER/125_profile_account.jpg) |
| Tabish Riaz (`#/profile/notifications`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/00_SHELL_AND_LAUNCHER/126_profile_notifications.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/00_SHELL_AND_LAUNCHER/126_profile_notifications.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/00_SHELL_AND_LAUNCHER/126_profile_notifications.jpg) |
| Tabish Riaz (`#/profile/appearance`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/00_SHELL_AND_LAUNCHER/127_profile_appearance.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/00_SHELL_AND_LAUNCHER/127_profile_appearance.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/00_SHELL_AND_LAUNCHER/127_profile_appearance.jpg) |

## Proposed (not separately approved by the owner — see D14/D15)

- Tables become stacked rows on phone (label: value) when they have more than 3 columns; first column stays the row title.
- Right-side panels/drawers open full screen on phone with a sticky header (Close, title) and pinned footer actions.
- Dialogs become bottom sheets on phone (max height 90 vh, drag handle, sticky actions).
- Multi-column dashboards collapse to one column in reading order: primary list first, side summaries after.
