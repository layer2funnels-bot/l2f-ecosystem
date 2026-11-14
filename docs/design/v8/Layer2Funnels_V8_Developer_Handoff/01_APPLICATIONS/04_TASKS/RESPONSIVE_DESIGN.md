# Tasks · responsive design

Global rules: `04_RESPONSIVE_DESIGN/DESKTOP_TABLET_MOBILE_RULES.md`. Navigation: `NAVIGATION_RESPONSIVE_BEHAVIOR.md`. This app's specifics: `APP_SPECIFIC_MOBILE_REQUIREMENTS.md`.

## Confirmed (shown by the V8 prototype at every width)

- Breakpoints: phone ≤760 px, tablet 761–1100 px, desktop >1100 px.
- Phone: rail and app sidebar hidden; bottom tab bar = the app's first 4 nav items + More; app bar shows the org mark that opens the apps-and-account sheet.
- Touch screens: every control ≥44 px (`@media (pointer:coarse)`).
- No horizontal page scroll at 390 px on any page of this app (automated check).

## Confirmed in the brief

- - Inbox = unsorted captures and tasks sent from other apps (avatar next steps, meeting action items, phone capture). This is distinct from My Work (Projects) and Today.
- Empty list ("Add your first task"), empty Today ("Nothing due today"), offline capture queue, error retry. Phone: sidebar → bottom bar (Today, Upcoming, Inbox, Teammates, More), document card full width, swipe right to complete, long-press for the menu.

## Page-by-page screenshots

| Page | Desktop 1440 | Tablet 834 | Phone 390 |
|---|---|---|---|
| Today (`#/tasks/today`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/04_TASKS/100_tasks_today.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/04_TASKS/100_tasks_today.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/04_TASKS/100_tasks_today.jpg) |
| Upcoming (`#/tasks/upcoming`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/04_TASKS/101_tasks_upcoming.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/04_TASKS/101_tasks_upcoming.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/04_TASKS/101_tasks_upcoming.jpg) |
| Inbox (`#/tasks/inbox`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/04_TASKS/102_tasks_inbox.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/04_TASKS/102_tasks_inbox.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/04_TASKS/102_tasks_inbox.jpg) |
| Teammates (`#/tasks/teammates`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/04_TASKS/103_tasks_teammates.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/04_TASKS/103_tasks_teammates.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/04_TASKS/103_tasks_teammates.jpg) |
| My tasks (blocks, show completed) (`#/tasks/list/mine`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/04_TASKS/104_tasks_list_mine.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/04_TASKS/104_tasks_list_mine.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/04_TASKS/104_tasks_list_mine.jpg) |
| Team list with access (`#/tasks/list/team`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/04_TASKS/105_tasks_list_team.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/04_TASKS/105_tasks_list_team.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/04_TASKS/105_tasks_list_team.jpg) |
| Ayesha Raza (`#/tasks/teammates/AR`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/04_TASKS/163_tasks_teammates_AR.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/04_TASKS/163_tasks_teammates_AR.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/04_TASKS/163_tasks_teammates_AR.jpg) |

## Proposed (not separately approved by the owner — see D14/D15)

- Tables become stacked rows on phone (label: value) when they have more than 3 columns; first column stays the row title.
- Right-side panels/drawers open full screen on phone with a sticky header (Close, title) and pinned footer actions.
- Dialogs become bottom sheets on phone (max height 90 vh, drag handle, sticky actions).
- Multi-column dashboards collapse to one column in reading order: primary list first, side summaries after.
