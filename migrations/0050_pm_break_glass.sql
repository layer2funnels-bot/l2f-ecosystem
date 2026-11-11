set check_function_bodies = off;
-- 0050 · Personal projects and the ecosystem's emergency access (owner decision 11 Nov 2026: personal projects stay private,
-- also from owners and admins, but the existing audited emergency access is preserved; no second permission system).
-- One power, one log, one notice: the permission 'drive.personal.break_glass' (owner only, sensitive) already opens a
-- person's personal space in Drive with a written reason, a permanent log row (drive_break_glass, audited) and a notice
-- to that person. A personal space now includes their personal projects, so the same power, log and notice cover them.
-- It is READ-ONLY: it returns a snapshot of the projects and tasks; it never makes anyone a member and changes nothing else.

update public.permissions
   set description = 'Open another person''s personal space: their personal Drive files and personal projects (reason, log and notice)'
 where key = 'drive.personal.break_glass';

alter table public.drive_break_glass add column scope text not null default 'drive' check (scope in ('drive', 'projects'));
alter table public.drive_notices drop constraint drive_notices_kind_check,
  add constraint drive_notices_kind_check check (kind in ('personal_space_opened', 'personal_projects_opened'));

create or replace function public.pm_break_glass_open(p_owner uuid, p_reason text)
returns table (project_id uuid, project_name text, project_status text, task_id uuid, task_number int, task_title text,
               task_status text, task_due_on date, task_parent_id uuid)
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); r text := private.request_org(); ws uuid; n int; log_id uuid;
begin
  if uid is null or r is null or r !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return; end if;
  ws := r::uuid;
  if not private.has_permission(ws, 'drive.personal.break_glass') or p_owner is null or p_owner = uid
     or not exists (select 1 from public.memberships m where m.workspace_id = ws and m.user_id = p_owner and m.kind = 'staff') then return; end if;
  if p_reason is null or length(btrim(p_reason)) < 10 or length(p_reason) > 500 then
    raise exception 'say why, in a sentence' using errcode = 'P0001';
  end if;
  select count(*) into n from public.pm_projects p where p.workspace_id = ws and p.is_personal and p.owner_id = p_owner and p.deleted_at is null;
  insert into public.drive_break_glass (workspace_id, accessed_by, owner_id, reason, files_seen, scope)
    values (ws, uid, p_owner, btrim(p_reason), n, 'projects') returning drive_break_glass.id into log_id;
  insert into public.drive_notices (workspace_id, user_id, kind, break_glass_id) values (ws, p_owner, 'personal_projects_opened', log_id);
  return query
    select p.id, p.name, p.status, t.id, t.number, t.title, t.status, t.due_on, t.parent_id
      from public.pm_projects p left join public.pm_tasks t on t.project_id = p.id and t.deleted_at is null
     where p.workspace_id = ws and p.is_personal and p.owner_id = p_owner and p.deleted_at is null
     order by p.name, p.id, t.number;
end $$;

revoke all on function public.pm_break_glass_open(uuid, text) from public;
grant execute on function public.pm_break_glass_open(uuid, text) to app_user;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on function public.pm_break_glass_open(uuid, text) from %I', r);
    end if;
  end loop;
end $$;
