# Tasks · app overview

**Purpose:** Personal and team to-do lists (Taskade-like), separate from structured projects.

**Status vs repo:** [N] whole app, built from scratch · **Build prompt:** P04 · **Launcher group:** Everyday

**Identity:** app id `tasks`, launcher description “Lists, folders and mind maps for everyday to-dos”, plate colours #5EEAD4, #0EA5A4, #08706F, glyph colour . Icons: `03_ASSETS/app-icons/tasks-launcher-plate.svg` (Launcher) and `tasks-flat-mark.svg` (rail and work screens, V8).

## Sidebar menu (exact labels and destinations)

- Today 4 → `tasks/today`
- Upcoming → `tasks/upcoming`
- Inbox 2 → `tasks/inbox`
- Teammates → `tasks/teammates`
- My tasks 4 → `tasks/list/:list`
- Funnel Challenge 3 → `tasks/list/:list`
- Build team 2 → `tasks/list/:list`
- Content ideas 3 → `tasks/list/:list`

## Size of this app in V8

- 7 documented pages (one per screenshot) covering 6 page templates.
- Full page list: `PAGES_AND_NAVIGATION.md`. Features: `FEATURES_AND_FUNCTIONALITY.md`. Flows: `USER_FLOWS_AND_WORKFLOWS.md`.

## V8 look for this app

- Decorative teal/violet background wash removed.
- List "document" sheet: hairline border, radius 8, no shadow, max width 980 px.
- Task text 15.5 px; block headings 19 px; Show/Hide completed 14.5 px.

Home screenshot: [desktop](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/04_TASKS/100_tasks_today.jpg) · [phone](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/04_TASKS/100_tasks_today.jpg)
