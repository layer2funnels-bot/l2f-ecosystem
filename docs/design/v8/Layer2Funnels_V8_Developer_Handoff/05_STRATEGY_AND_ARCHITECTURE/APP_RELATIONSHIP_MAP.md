# App relationship map

```mermaid
flowchart LR
  clients["Clients\n(source of truth: client identity)"] -- "Client service: list/search/create" --> fmp["Funnel Mapper"]
  fmp -- "create client (write-through)" --> clients
  clients -- "client picker" --> projects["Projects"]
  planner["Planner"] -- "createProjectFromPlan" --> projects
  tasks["Tasks"] -- "Send to a project" --> projects
  tasks <-- "shared timer service" --> projects
  projects -- "My day items" --> office["Office Home"]
  tasks -- "My day items" --> office
  planner -- "My day items + Plans rollup" --> office
  forms["Forms"] -- "Brand Base answers" --> clients
  clients -- "requests & approvals" --> portal["Client Portal"]
  portal -- "replies, approvals" --> clients
  drive["Drive"] -. "file references" .- projects
  drive -. "file references" .- clients
  drive -. "file references (Documents sections)" .- office
  office -- "Avatars, offers, brand kits, strategies (Library)" --> clients
  agents["Layer 2 Agents (future)"] -- "notes → Drive; action items → Tasks Inbox" --> tasks
  social["Social Planner"] -- "approved posts CSV" --> ghl["GoHighLevel (external)"]
  ladder["Value Ladder"] -. "offers; rates later from FM forecasts" .- fmp
  all["Every app"] -- "notifications + search providers" --> shell["Shell"]
```

Rules: each record lives in one app; other apps hold references (ids/links), never copies — except client strategy assets, which are **client-owned copies** (locked decision). Details: `00_MASTER_DOCUMENTATION/03_PERMISSIONS_DATA_INTEGRATIONS.md` §3–6.
