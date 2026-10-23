-- Go-live step (NOT a migration; run once on the live ecosystem project, after migrations 0001-0031, with the owner's approval).
-- Switches on the four v4 apps that are "coming soon" in the catalog. Planner and Layer 2 Agents stay as they are.
update public.apps set lifecycle = 'active' where key in ('forms', 'value_ladder', 'social_planner', 'whiteboard');
insert into public.workspace_apps (workspace_id, app_key, enabled)
  select w.id, a.key, true from public.workspaces w cross join public.apps a where a.key in ('forms', 'value_ladder', 'social_planner', 'whiteboard')
  on conflict (workspace_id, app_key) do update set enabled = true;
