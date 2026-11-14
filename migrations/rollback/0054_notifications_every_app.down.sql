-- ROLLBACK of 0054 (notifications for every app). Run only with the owner's approval, in one transaction, AFTER the app code that calls
-- notifications.inbox / my_inbox has been rolled back too (otherwise the bell shows "couldn't be loaded").
-- Keeps every Projects notification (0034/0049 rows). Removes the app-event rows (Drive "shared with you"): they cannot exist under the
-- older checks. Restores the 0049 constraints exactly.
begin;
drop trigger if exists drive_share_notice on public.drive_shares;
drop function if exists private.drive_share_notice();
drop function if exists public.my_inbox(int, text, text);
drop function if exists private.notify(uuid, uuid, text, text, text, text, text, uuid);
drop table if exists public.notification_prefs;
delete from public.notifications where entity_type = 'app_event' or kind not in ('assigned', 'mentioned', 'commented', 'completed', 'unblocked', 'due_changed');
drop index if exists public.notifications_event_once;
alter table public.notifications drop constraint if exists notifications_app_event_shape;
alter table public.notifications drop constraint if exists notifications_app_check;
alter table public.notifications drop constraint if exists notifications_entity_type_check,
  add constraint notifications_entity_type_check check (entity_type in ('project_task', 'pm_task'));
alter table public.notifications drop constraint if exists notifications_kind_check,
  add constraint notifications_kind_check check (kind in ('assigned', 'mentioned', 'commented', 'completed', 'unblocked', 'due_changed'));
alter table public.notifications drop column if exists event_key, drop column if exists href, drop column if exists title, drop column if exists app;
commit;
