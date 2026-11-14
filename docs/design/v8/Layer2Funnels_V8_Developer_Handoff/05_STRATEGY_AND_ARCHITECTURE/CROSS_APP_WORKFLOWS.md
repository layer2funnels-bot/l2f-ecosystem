# Cross-app workflows

Flows that start in one app and finish in another. Each must have an end-to-end test (P14).

## 1. Complete from My day

1. Office Home › My day → tick
2. Item completes in Projects / Tasks / Planner (source of truth)
3. My day and the source app agree after refresh

## 2. Plan → project

1. Planner plan page → Create a project from this plan
2. Projects creates sections (focus areas) and tasks (objectives) with owner/due
3. Link stored both ways; plan keeps tracking

## 3. Task → project

1. Tasks right-click → Send to a project
2. Projects task created; Tasks item replaced by a link

## 4. Shared timer

1. Start timer in Tasks
2. Same pill shows in Projects
3. Stop anywhere → one time entry

## 5. Client created in Funnel Mapper

1. FM New client → Client service (duplicate check by email)
2. Appears in Clients › All clients
3. Same email → one record ("Link to existing")

## 6. Brand Base form → client

1. Client submits the Brand Base form (Forms)
2. Clients › Work › Brand Base shows the answers with submitted date and contact

## 7. Copy approval through the Portal

1. Clients › Work › Copy → Send for approval
2. Request created (Clients › Requests & Approvals)
3. Client approves in Portal › Approvals
4. Notification to the team; request history updated

## 8. Files referenced, not copied

1. Upload in Projects/Clients/Office Documents
2. File lives in Drive (Library or client scope)
3. Projects › Files lists it; Remove only unlinks

## 9. Meeting → tasks (future)

1. Layer 2 Agents session → action items
2. Tasks Inbox receives them with source "From Meeting Intelligence"
3. Notes saved to Drive Meetings/<date> <name>

## 10. Notifications

1. Event in any app (mention, assignment, approval, update due, file shared, invitation)
2. notifications row for the user in the current org
3. Bell badge + inbox item → real link to the destination
