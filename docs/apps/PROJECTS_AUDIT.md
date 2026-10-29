# Projects: audit and plan (29 Oct 2026)

## In one paragraph
Projects has a sound base: projects tied to clients, tasks with status, priority, one assignee and a due date, checklists, timers and logged
time, "My work", deadlines, search, client sharing, and five views (List, Board, Calendar, Timeline, Overview) plus Docs and Whiteboards tabs.
What it lacks is everything a team needs to *work together* on that base: nobody can comment on a task, mention a colleague, see what changed,
or be told that something needs them. Work cannot be broken down below a checklist, repeated from a template, or organized beyond four fixed
statuses. Asana and ClickUp have all of that; that gap, not the views, is why it feels basic.

## Compared with Asana / ClickUp (what an agency needs to finish work)
| Capability | Asana / ClickUp | Ours | Plan |
|---|---|---|---|
| List, Board, Calendar, Timeline views | yes | **yes** | polish in R2 |
| Comments on tasks, @mentions | yes | **no** | **R1** |
| Activity history per task ("who changed what") | yes | no (audit log only, admins) | **R1** |
| Notifications / inbox (assigned, mentioned, due) | yes | **no** (the header bell is a placeholder in every app) | **R1** (shared service) |
| Subtasks (real tasks under a task) | yes | checklist only | **R1** |
| Several assignees / followers | yes | one assignee | **R1** (followers) |
| Attach files from Drive to a task | yes | Docs/Whiteboards tabs per project only | R2 |
| Sections / custom statuses per project | yes | 4 fixed statuses | R2 |
| Tags, custom fields | yes | no | R2 |
| Filter, sort, group, saved views, bulk edit | yes | filter by status only | R2 |
| Start dates, dependencies (blocked by) | yes | due date only | R3 |
| Project and task templates | yes | no | R3 |
| Recurring tasks | yes | no | R3 |
| Workload per person, reports, dashboards | yes | overview + time summary | R4 |
| Automations ("when done, move to…") | yes | no | R5 |
| Time tracking, billable time | ClickUp yes | **yes** | — |
| Tied to the client record, client portal, Planner objectives | no | **yes** — our edge | keep and deepen |

Skipped on purpose: goals/OKRs (Planner does it), chat (not now), whiteboards and docs inside tasks (Whiteboard and Drive do it), AI features (need an approved provider).

## Releases
- **R1 — Work together** (in progress). The shared services the architecture already calls for (ER1: "comments/activity, notifications … exist once and are reused"; status "Missing"), used by Projects first: comments with @mentions on tasks, an activity history, notifications in the header bell (assigned to you, mentioned, a task you follow changed), followers, subtasks.
- **R2 — Organize**: sections/custom statuses per project, tags, filters/sort/group and saved views, bulk edit, Drive attachments on tasks.
- **R3 — Repeatable work**: start dates and dependencies, project and task templates, recurring tasks.
- **R4 — Oversight**: workload per person, project and time reports.
- **R5 — Automations**: simple rules.

Every later app (Clients, Drive, Planner, Social Planner…) plugs into the R1 services instead of building its own.

## Needs your decision
Nothing yet. Later: whether clients may see comments marked "shared with client" in the Portal (R1 keeps every comment internal).
