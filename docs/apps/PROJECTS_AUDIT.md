# Projects: audit, plan and what was built (29 Oct 2026)

## In one paragraph
At the audit, Projects had a sound base (projects tied to clients, tasks with status, priority, one assignee and a due date, checklists, timers,
"My work", search, client sharing, List/Board/Calendar/Timeline/Overview views) but nothing a team needs to *work together*: no comments,
mentions, history, notifications, subtasks, sections, tags, templates, recurring work, workload or rules. Those gaps against Asana and ClickUp
were closed in five releases (R1–R5, migrations 0034–0038), each built test-first and checked in a real browser.

## Compared with Asana / ClickUp, now
| Capability | Asana / ClickUp | Before | Now |
|---|---|---|---|
| List, Board, Calendar, Timeline views | yes | yes | yes; Board can group by section; Timeline has a fixed day width, weekly ticks and a Today button |
| Comments with @mentions | yes | no | **yes** (R1): mention picker, edit/delete own comments, internal only |
| Activity history per task | yes | admins' audit log only | **yes** (R1) |
| Notifications (assigned, mentioned, followed task changed, unblocked) | yes | placeholder bell | **yes** (R1): header bell in every app, unread count |
| Subtasks | yes | checklist only | **yes** (R1), plus checklists |
| Followers | yes | no | **yes** (R1) |
| Sections per project | yes | no | **yes** (R2) |
| Tags | yes | no | **yes** (R2), one list per organization |
| Filter, sort, group, search in a project | yes | status filter only | **yes** (R2), remembered per project on the device |
| Bulk edit | yes | no | **yes** (R2): status, priority, person, due, section, archive |
| Drive files on a task | yes | per project only | **yes** (R2): attach or upload |
| Start dates, dependencies ("waiting on") | yes | due date only | **yes** (R3), with loop protection and an "unblocked" notification |
| Project templates, duplicate a project | yes | no | **yes** (R3) |
| Recurring tasks | yes | no | **yes** (R3): daily, weekdays, weekly, every 2 weeks, monthly, yearly |
| Time estimates | yes | no | **yes** (R4) |
| Workload per person per week | yes | no | **yes** (R4), against a 40 h week |
| Project report, portfolio across projects | yes | overview only | **yes** (R4) |
| Automations | yes | no | **yes** (R5): when added / moved to a status / moved into a section → assign, set priority, set due in N days, add a tag |
| Time tracking, billable time | ClickUp | yes | yes |
| Tied to client record, portal, Planner | no | yes (our edge) | yes |

## Speed and reliability (found while testing)
- The task panel used to make 8 requests; it now makes 1 (`tasks.panel`). Opening a few tasks no longer hits the 120-reads-a-minute limit.
- When the limit is hit, the screen now says so ("too many requests, wait a moment") instead of "couldn't load".
- Calls a screen makes at the same moment travel as one batched request (one database connection).
- Real dates no longer come back as midnight timestamps (date fields showed empty).

## Still missing (ranked; none blocks daily use)
1. **Custom fields** (number, dropdown, text per project). Biggest remaining gap with ClickUp.
2. **Forms → tasks** (a Form Builder submission creates a task). Needs a decision on which forms may do it.
3. **Duplicate a single task** (projects can be duplicated; tasks cannot yet).
4. **Several assignees on one task** (followers cover "keep me informed"; one person stays responsible).
5. **Saved views shared with the team** (today the view is remembered per person per device).
6. **Custom statuses per project** (four fixed statuses + sections cover most agency boards).
7. **Email notifications** (today: in-app bell only; needs an approved email provider).
8. **Rules with conditions** ("only if priority is high") and more actions (move to section, notify someone).

## Skipped on purpose
Goals/OKRs (Planner does it), chat (not now), AI features (need an approved provider).

## Needs your decision
- Whether clients may see comments marked "shared with client" in the Portal (today every comment is internal).
- Whether a Form Builder form may create tasks, and who may set that up.
