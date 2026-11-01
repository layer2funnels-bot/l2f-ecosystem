set check_function_bodies = off;
-- 0038 · Projects R5, simple rules: "when a task is created / moves to a status / moves into a section, then assign it, set its
-- priority, set its due date N days ahead, or add a tag". One rule = one trigger + one action, per project.
-- Rules run inside the database (BEFORE/AFTER triggers on project_tasks), so the screen, bulk changes and recurring copies all follow them.
-- Actions never change status or section, so a rule can never start another rule (no loops).
-- Managing rules needs projects.project.edit on the project; reading them needs projects.task.view. Same org fence as every table.

create table public.project_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null,
  client_id uuid,                                      -- copied from the project by the guard
  trigger text not null check (trigger in ('created', 'status', 'section')),
  trigger_status text check (trigger_status in ('todo', 'doing', 'blocked', 'done')),
  trigger_section uuid,
  action text not null check (action in ('assign', 'priority', 'due_in', 'tag')),
  assignee_id uuid,
  priority text check (priority in ('low', 'normal', 'high', 'urgent')),
  due_in_days int check (due_in_days between 0 and 365),
  tag_id uuid,
  enabled boolean not null default true,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, project_id) references public.projects (workspace_id, id) on delete cascade,
  -- the section must be in the rule's own project; deleting the section removes the rule
  foreign key (workspace_id, project_id, trigger_section) references public.project_sections (workspace_id, project_id, id) on delete cascade,
  foreign key (workspace_id, tag_id) references public.project_tags (workspace_id, id) on delete cascade,
  constraint project_rules_trigger_complete check (
    (trigger = 'created' and trigger_status is null and trigger_section is null)
    or (trigger = 'status' and trigger_status is not null and trigger_section is null)
    or (trigger = 'section' and trigger_section is not null and trigger_status is null)),
  constraint project_rules_action_complete check (
    (action = 'assign' and assignee_id is not null)
    or (action = 'priority' and priority is not null)
    or (action = 'due_in' and due_in_days is not null)
    or (action = 'tag' and tag_id is not null))
);
create index project_rules_project on public.project_rules (workspace_id, project_id) where enabled;

create or replace function private.project_rules_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); pc uuid; found boolean;
begin
  select true, p.client_id into found, pc from public.projects p where p.workspace_id = new.workspace_id and p.id = new.project_id;
  if found is not true then raise exception 'not found' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    if uid is not null then new.created_by := uid; end if;
    new.client_id := pc;
    if (select count(*) from public.project_rules r where r.workspace_id = new.workspace_id and r.project_id = new.project_id) >= 30 then
      raise exception 'a project can have at most 30 rules' using errcode = 'P0001';
    end if;
  else
    if new.workspace_id is distinct from old.workspace_id or new.project_id is distinct from old.project_id or new.client_id is distinct from old.client_id or new.created_by is distinct from old.created_by then
      raise exception 'records do not move' using errcode = 'P0001';
    end if;
    new.updated_at := now();
  end if;
  if new.assignee_id is not null and not exists (select 1 from public.memberships m where m.workspace_id = new.workspace_id and m.user_id = new.assignee_id and m.kind = 'staff') then
    raise exception 'the person must be a member of this organization' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger project_rules_guard before insert or update on public.project_rules for each row execute function private.project_rules_guard();

-- Does this change match the rule's trigger? On creation a task "arrives" in its status and section too.
create or replace function private.project_rule_fires(r public.project_rules, op text, n public.project_tasks, o public.project_tasks) returns boolean
language sql stable set search_path = '' as $$
  select case r.trigger
    when 'created' then op = 'INSERT'
    when 'status' then n.status = r.trigger_status and (op = 'INSERT' or o.status is distinct from n.status)
    when 'section' then n.section_id = r.trigger_section and (op = 'INSERT' or o.section_id is distinct from n.section_id)
  end
$$;

-- BEFORE: assign, priority, due date. Named to sort before project_tasks_guard, which then checks the result like any other change.
-- On creation a rule only fills what the person left empty; on a move it sets the value (that is what the rule is for).
create or replace function private.project_tasks_automate() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r public.project_rules; o public.project_tasks; ins boolean := tg_op = 'INSERT';
begin
  if not ins then o := old; end if;
  for r in select * from public.project_rules x where x.workspace_id = new.workspace_id and x.project_id = new.project_id and x.enabled and x.action <> 'tag' order by x.created_at, x.id loop
    if private.project_rule_fires(r, tg_op, new, o) then
      if r.action = 'assign' and (not ins or new.assignee_id is null) then new.assignee_id := r.assignee_id;
      elsif r.action = 'priority' and (not ins or new.priority = 'normal') then new.priority := r.priority;
      elsif r.action = 'due_in' and (not ins or new.due_on is null) then
        new.due_on := current_date + r.due_in_days;
        if new.start_on is not null and new.start_on > new.due_on then new.start_on := new.due_on; end if;
      end if;
    end if;
  end loop;
  return new;
end $$;
create trigger project_tasks_automate before insert or update of status, section_id on public.project_tasks for each row execute function private.project_tasks_automate();

-- AFTER: tags (the task must exist first)
create or replace function private.project_tasks_automate_tags() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r public.project_rules; o public.project_tasks;
begin
  if tg_op = 'UPDATE' then o := old; end if;
  for r in select * from public.project_rules x where x.workspace_id = new.workspace_id and x.project_id = new.project_id and x.enabled and x.action = 'tag' loop
    if private.project_rule_fires(r, tg_op, new, o) then
      insert into public.task_tags (workspace_id, task_id, tag_id) values (new.workspace_id, new.id, r.tag_id) on conflict do nothing;
    end if;
  end loop;
  return null;
end $$;
create trigger project_tasks_zrules_tags after insert or update of status, section_id on public.project_tasks for each row execute function private.project_tasks_automate_tags();

-- ------------------------------------------------------------------ policies
alter table public.project_rules enable row level security;
alter table public.project_rules force row level security;
create policy org_scope on public.project_rules as restrictive for all
  using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
create policy project_rules_select on public.project_rules for select using (private.has_permission(workspace_id, 'projects.task.view', client_id, project_id));
create policy project_rules_insert on public.project_rules for insert with check (
  private.has_permission(workspace_id, 'projects.project.edit', (select p.client_id from public.projects p where p.workspace_id = project_rules.workspace_id and p.id = project_rules.project_id), project_id));
create policy project_rules_update on public.project_rules for update
  using (private.has_permission(workspace_id, 'projects.project.edit', client_id, project_id)) with check (private.has_permission(workspace_id, 'projects.project.edit', client_id, project_id));
create policy project_rules_delete on public.project_rules for delete using (private.has_permission(workspace_id, 'projects.project.edit', client_id, project_id));

create trigger audit_project_rules after insert or update or delete on public.project_rules for each row execute function private.audit_change('project_id', 'trigger', 'action', 'enabled');

revoke all on all functions in schema private from public;
grant select, insert, update, delete on public.project_rules to app_user;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all tables in schema public from %I', r);
      execute format('revoke all on all functions in schema public from %I', r);
      execute format('revoke all on all tables in schema private from %I', r);
      execute format('revoke all on all functions in schema private from %I', r);
      execute format('revoke all on all sequences in schema public from %I', r);
    end if;
  end loop;
end $$;
