# Projects · app overview

**Purpose:** Client, internal and personal projects and their tasks (Projects V2 is the functional baseline).

**Status vs repo:** [R] skin of existing V2 + [N] Files, personal-project permission · **Build prompt:** P03 · **Launcher group:** Everyday

**Identity:** app id `projects`, launcher description “Client and internal projects, end to end”, plate colours #6E98FF, #2B5CF0, #1A3BAE, glyph colour . Icons: `03_ASSETS/app-icons/projects-launcher-plate.svg` (Launcher) and `projects-flat-mark.svg` (rail and work screens, V8).

## Sidebar menu (exact labels and destinations)

- Home → `projects/home`
- My Work 7 → `projects/mywork`
- Workload → `projects/workload`
- Portfolio → `projects/portfolio`
- Files → `projects/files`
- All projects → `projects/all`
- Harry Kaye quiz funnel 8 → `projects/p/:project/list`
- Mindful Money course launch 5 → `projects/p/:project/list`
- L2F website refresh 5 → `projects/p/:project/list`
- Funnel Done Right Challenge 5 → `projects/p/:project/list`
- My learning plan 1 → `projects/p/:project/list`

## Size of this app in V8

- 17 documented pages (one per screenshot) covering 16 page templates.
- Full page list: `PAGES_AND_NAVIGATION.md`. Features: `FEATURES_AND_FUNCTIONALITY.md`. Flows: `USER_FLOWS_AND_WORKFLOWS.md`.

## V8 look for this app

- KPI strip is one ruled band with dividers, not six floating boxes.
- Home "My open tasks": compact grid matches visible columns so assignee avatars never sit on dates.
- Sidebar tree constrains its children: no horizontal overflow, names ellipsize.
- Workload heat map has a real grid layout (v7 printed rows as run-on text).
- Timer pill: red recording dot (8 px) — v7 rendered a red blob from a leaked class.
- Top-bar quick actions render as an icon row (v7 collapsed them via a leaked class).
- Task panel: values 15 px, labels 14 px, section titles 16 px, field rows 44 px, label column 150 px, title 24 px; subtasks show circular assignee avatars.

Home screenshot: [desktop](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/03_PROJECTS/038_projects_home.jpg) · [phone](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/03_PROJECTS/038_projects_home.jpg)
