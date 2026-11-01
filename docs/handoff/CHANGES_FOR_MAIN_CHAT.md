# What changed (for the main ecosystem chat)

Date: 29 Oct 2026. Branch `claude/quirky-fermi-7vkj1c` (draft PR #34). **Nothing here is merged into `main` yet**; `main` is at
`1e99714` ("Build Planner inside build-web…", PR #31). GitHub Actions minutes ran out, so CI cannot run until they reset. No migration
was applied anywhere except a local test database. Nothing was deployed, and no live setting, key or account was touched.

Paste this whole file into the main chat so it knows the code moved on.

## The commits, oldest first
| Commit | What it does |
|---|---|
| `89acccf` Planner inside the shell | Planner now opens inside the ecosystem (`#/planner`) with the shared header, organization switcher, theme, session and API. It is mounted in a shadow root (`/planner/embed.js`, `mount(el, host)`), so its styles and the shell's cannot clash. The standalone `/planner/` page redirects into the shell (except `?demo`). |
| `33dd8c8` Skills | `.claude/skills/app-audit` (repo-specific "finish an app" workflow), `user-stories`, `test-scenarios` (MIT, see `THIRD_PARTY_NOTICES.md`). |
| `d9ea20f` Speed | Calls that a screen makes at the same moment travel as **one** request to `/api/batch` (at most 4 calls) on one database connection. One shared token refresh. `docs/PERFORMANCE.md`. |
| `52df014` Projects R1, working together | Migration **0034**: comments with @mentions, activity history, followers and notifications as **shared services any app can reuse** (`private.collab_scope`; record type `project_task` first). Header bell with an unread count in every app. Subtasks (`parent_task_id`). |
| `c2df43c` Projects R2, organizing | Migration **0035**: sections per project, organization tags, Drive files attached to tasks. Filter, sort, group and search in a project; bulk changes. Fix: plain dates no longer come back as midnight timestamps (server and tests). |
| `b2e9aba` Projects R3, repeatable work | Migration **0036**: start dates, recurring tasks (finishing one creates the next), "waiting on" dependencies with a loop guard and an "unblocked" notification, project templates, duplicating a project. The timeline got a fixed day width, weekly ticks and a Today button. |
| `d890fb9` Projects R4, oversight | Migration **0037**: time estimates. Workload (person × week against 40 h), project Report tab, Portfolio across projects. The task panel loads in **1 request instead of 8** (`tasks.panel`). A rate-limited request now shows a toast saying so. |
| `864e292` Projects R5, rules | Migration **0038**: per-project rules. When a task is added, moves to a status or moves into a section: assign it, set its priority, set it due in N days, or add a tag. They run inside the database, so bulk changes and recurring copies follow them too. Rules tab on the project. Reads are raised to **300 a minute** (was 120): see DECISIONS V4-30. |

## New database objects (migrations 0034–0038)
Tables: `comments`, `comment_mentions`, `activity_events`, `follows`, `notifications`, `project_sections`, `project_tags`, `task_tags`,
`task_files`, `task_dependencies`, `project_rules`. New columns on `project_tasks`: `parent_task_id`, `section_id`, `start_on`, `repeat`,
`estimate_minutes`. New column on `projects`: `is_template`. Each table has the restrictive `org_scope` policy, permission policies through
`private.has_permission`, audit triggers where records change, and nothing granted to `anon` or `authenticated`.
New permission: `projects.task.comment` (Project member and All projects · edit levels).
Public functions the API calls: `comment_add`, `my_notifications`, `task_tag_add`, `project_duplicate` (in the F4c allow-list of `test/audit.test.mjs`).

## New API operations
`comments.list/add/edit/delete`, `activity.list`, `follow.get/set`, `notifications.list/unread/read`, `sections.list/create/update/delete`,
`tags.list`, `tasks.tags.add/remove`, `tasks.bulk`, `tasks.files.list/attach/detach`, `tasks.deps.list/add/remove`, `projects.duplicate`,
`projects.workload`, `projects.report`, `projects.report.people`, `projects.portfolio`, `tasks.panel`, `rules.list/add/update/delete`, and `/api/batch`.

## New screens and routes
`#/projects/workload`, `#/projects/portfolio` (and the `#/office/projects/...` forms). Inside a project: List toolbar (search, person, tag,
group, sort, hide done), bulk bar, sections, Report tab, Rules tab. Task panel: section, tags, files, start date, repeat, waiting on, estimate,
subtasks, comments, history, follow. Projects home: templates. Header: notifications bell.

## Tests (all passing locally on 29 Oct)
- `npm test`: 55 suites, including the new `collab` (24), `projects-organize` (19), `projects-repeatable` (15), `projects-oversight` (13) and `projects-automations` (15).
- Browser journeys on the local stack: `scripts/e2e-projects.mjs` 32/32 (new). `scripts/e2e-ui.mjs` 241/241, `scripts/e2e-planner.mjs` 32/32, API journey `npm run test:e2e` 71/71.
- Mutation checks: removing the organization fence on comments, the dependency loop rule, the project filter on rules, or the edit permission on rules each makes a test fail.

## Decisions taken (technical, recorded in `docs/DECISIONS.md`)
- Planner is mounted with shadow DOM instead of rewriting its CSS.
- Comments are internal only; clients never see them (an owner decision is pending on "shared with client" comments).
- Shared collaboration services live once (ARCHITECTURE ER1). Other apps add their record type to `private.collab_scope` and reuse them.
- V4-30: 300 reads a minute per person.

## Waiting on the owner
Merging PR #34 once Actions minutes reset and CI is green. Applying 0034–0038 to staging or production (needs approval). The `/planner/?demo`
page is blocked by the page policy (WebAssembly not allowed). This predates this work.
