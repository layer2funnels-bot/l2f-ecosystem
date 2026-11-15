-- Rollback of 0059 (Tasks). Removes every Tasks table, function and the app row. Tasks data is lost: export first if needed.
drop table if exists public.task_time_entries, public.task_assignees, public.task_items, public.task_blocks, public.task_list_access, public.task_lists, public.task_folders cascade;
drop function if exists public.tasks_private_count(uuid), public.tasks_person_items(uuid), public.tasks_my_default(),
  private.task_list_level(uuid), private.task_folder_level(uuid), private.task_is_assignee(uuid), private.task_item_visible(uuid), private.task_item_editable(uuid),
  private.task_items_guard(), private.task_lists_guard(), private.task_assigned_notify();
delete from public.permissions where key in ('tasks.team.create', 'tasks.teammates.view');
delete from public.app_grants where app_key = 'tasks';
delete from public.workspace_apps where app_key = 'tasks';
delete from public.apps where key = 'tasks';
