set check_function_bodies = off;
-- 0037 · Projects R4, oversight: a time estimate on each task. Workload, the project report and the portfolio are read-only operations
-- (packages/core/project-operations.mjs) over tables that already have their row rules, so every number is computed under the reader's own access.
alter table public.project_tasks add column estimate_minutes int check (estimate_minutes between 0 and 100000);
create index project_tasks_open_due on public.project_tasks (workspace_id, assignee_id, due_on) where archived_at is null and status <> 'done';
