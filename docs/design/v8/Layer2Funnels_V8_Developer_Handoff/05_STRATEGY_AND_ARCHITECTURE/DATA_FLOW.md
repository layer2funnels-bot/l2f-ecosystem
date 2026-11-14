# Data flow

```mermaid
flowchart LR
  subgraph DB["One database · every row has workspace_id · RLS default deny"]
    clientsT["clients, client_contacts (Clients)"]
    projT["projects, tasks, time_entries (Projects; timer shared with Tasks)"]
    tasksT["task_lists, task_blocks, task_items, task_assignees (Tasks)"]
    planT["plans, focus areas, objectives, KPIs, reviews, strategies (Planner)"]
    officeT["avatars, avatar_chapters, offers, stories, brand_kits, strategy_templates, doc_sections (Office; client copies carry client_id)"]
    filesT["files, versions, file_links (Drive)"]
    notifT["notifications (shell)"]
    permT["memberships, relationships, app access, feature permissions, audit log (Office › Admin)"]
  end
  fmpDB["Funnel Mapper DB (separate)"] <-- "Client service (read-only → matching → write-through → source of truth)" --> clientsT
  formsT["form responses (Forms)"] --> clientsT
  projT -. "file_links" .-> filesT
  officeT -. "file refs" .-> filesT
  clientsT -. "file refs" .-> filesT
  planT -- "createProjectFromPlan (link kept)" --> projT
```

Table names marked in the briefs ([N]) are proposals in the design; the repo's existing tables win where they already exist. Ownership and versioning rules: `00_MASTER_DOCUMENTATION/03_PERMISSIONS_DATA_INTEGRATIONS.md` §3–5.
