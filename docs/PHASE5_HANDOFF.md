# Phase 5 (B1: Core Operations) handoff

Prerequisite: Phase 4 foundation (migration 0001, RLS suite passing). Do not start Phases 7–8.

## Purpose
- **Clients:** client records, contacts, status, Brand Base (6 sections, 27 questions), pipelines with stage gates, funnels (past, live, publish later).
- **Projects (PM):** projects and tasks per client; "My work" grouped by workspace (never merged).
- **Planner:** focus areas, objectives, measures, actions (a task linked to an objective), updates. Actions are Projects tasks.
- **Drive (Files):** workspace-scoped files and versions; upload, view, download, share links with expiry.
- **Office:** Today summary, Team (members, roles, app access), Settings. Non-admins see no Invite or Save.

## Source of truth
| Record | Owner table | Notes |
|---|---|---|
| Client | `clients` | Single record; others reference by id |
| Project and task | `projects`, to add `tasks` | Planner actions reference task ids, never copies |
| Plan objectives and measures | to add `plan_objectives`, `measures` | Planner only |
| Files | `files`, to add `file_versions` | Path always starts with workspace id |
| Membership and roles | `memberships` | Office Team reads this |

## Build order (smallest vertical slice first)
1. Clients list and record (read, then create/edit for editors). Test with T1, D3, D5.
2. Projects with tasks, scoped to a client. Test cross-client isolation for clients.
3. Drive upload and list with D2 delete rules. Add signed URLs and expiry (T5, T14).
4. Planner objectives linked to tasks.
5. Office Team and Settings (admin-only mutations, D1 rules).
6. My work: one query per workspace, two labelled groups.

## Rules for every new table
Copy the pattern in `migrations/0001_foundation.sql`: `workspace_id not null`, `enable` and `force` RLS, explicit policies per command, no policy means no access. Add the table to the T11 list in `test/isolation.test.mjs` and a positive and negative check.

## Acceptance
- All Phase 4 checks still pass.
- Each new table has at least one allow and one deny test per role.
- Empty, loading, error, offline and denied states implemented per the Phase 3 handoff.
- No `RETURNING` on append-only tables; no cross-workspace joins.

## Out of scope
Agents, Social Planner, Whiteboard, standalone builders, workload views, automations, reports, strategy map, dashboards (Phase 6 or later), Personal workspace (not approved).

## Gaps to resolve first
Account and profile page, notifications, app-access editing, global search: not designed. Need design before building.
