set check_function_bodies = off;
-- 0035 · Projects R2, organizing work: sections inside a project, organization tags on tasks, and Drive files attached to a task.
-- Same rules as 0013: one organization per row (composite keys, org_scope), the record's project decides who may see and change it,
-- callers never set the client or project of a child row (guards copy them), Data API roles get nothing.
-- Attachments follow SDOR: the file stays in Drive in the project's own place (0024); the task only points at a file of ITS project,
-- and someone sees the link only when they may see both the task and the file.

-- ------------------------------------------------------------------ sections
create table public.project_sections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null,
  client_id uuid,                                      -- copied from the project by the guard
  name text not null check (length(btrim(name)) between 1 and 100),
  position int not null default 0 check (position between 0 and 100000),
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, project_id, id),
  foreign key (workspace_id, project_id) references public.projects (workspace_id, id)
);
create index project_sections_project on public.project_sections (workspace_id, project_id, position);

alter table public.project_tasks add column section_id uuid,
  -- the section must be in the task's own project: the key includes the project
  add constraint project_tasks_section_fk foreign key (workspace_id, project_id, section_id) references public.project_sections (workspace_id, project_id, id) on delete set null (section_id);

create or replace function private.project_sections_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); pc uuid; found boolean;
begin
  select true, p.client_id into found, pc from public.projects p where p.workspace_id = new.workspace_id and p.id = new.project_id;
  if found is not true then raise exception 'not found' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    if uid is not null then new.created_by := uid; end if;
    new.client_id := pc;
  else
    if new.workspace_id is distinct from old.workspace_id or new.project_id is distinct from old.project_id or new.client_id is distinct from old.client_id or new.created_by is distinct from old.created_by then
      raise exception 'records do not move' using errcode = 'P0001';
    end if;
    new.updated_at := now();
  end if;
  new.name := btrim(new.name);
  return new;
end $$;
create trigger project_sections_guard before insert or update on public.project_sections for each row execute function private.project_sections_guard();

-- ------------------------------------------------------------------ tags (one list per organization; a tag is reused by name, any capitals)
create table public.project_tags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 40),
  color text not null default 'slate' check (color in ('slate', 'blue', 'green', 'amber', 'red', 'violet', 'teal', 'pink')),
  created_by uuid, created_at timestamptz not null default now(),
  unique (workspace_id, id)
);
create unique index project_tags_name on public.project_tags (workspace_id, lower(btrim(name)));

create table public.task_tags (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id uuid not null,
  tag_id uuid not null,
  project_id uuid, client_id uuid,                     -- copied from the task by the guard
  created_at timestamptz not null default now(),
  primary key (workspace_id, task_id, tag_id),
  foreign key (workspace_id, task_id) references public.project_tasks (workspace_id, id) on delete cascade,
  foreign key (workspace_id, tag_id) references public.project_tags (workspace_id, id) on delete cascade
);
create index task_tags_tag on public.task_tags (workspace_id, tag_id);

-- ------------------------------------------------------------------ Drive files attached to a task
create table public.task_files (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id uuid not null,
  file_id uuid not null,
  project_id uuid, client_id uuid,                     -- copied from the task by the guard
  created_by uuid, created_at timestamptz not null default now(),
  primary key (workspace_id, task_id, file_id),
  foreign key (workspace_id, task_id) references public.project_tasks (workspace_id, id) on delete cascade,
  foreign key (workspace_id, file_id) references public.files (workspace_id, id) on delete cascade
);

-- children of a task: project and client come from the task; a file must belong to the task's own project
create or replace function private.task_children_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare tp uuid; tc uuid; found boolean; fp uuid;
begin
  select true, t.project_id, t.client_id into found, tp, tc from public.project_tasks t where t.workspace_id = new.workspace_id and t.id = new.task_id;
  if found is not true then raise exception 'not found' using errcode = '42501'; end if;
  new.project_id := tp; new.client_id := tc;
  if tg_table_name = 'task_files' then
    select f.project_id into fp from public.files f where f.workspace_id = new.workspace_id and f.id = new.file_id;
    if fp is distinct from tp then raise exception 'only a file of this task''s project can be attached' using errcode = 'P0001'; end if;
    new.created_by := private.current_user_id();
  end if;
  return new;
end $$;
create trigger task_tags_guard before insert on public.task_tags for each row execute function private.task_children_guard();
create trigger task_files_guard before insert on public.task_files for each row execute function private.task_children_guard();

-- Adds a tag to a task by name (creating the organization tag the first time). Security invoker: the caller must be able to edit the task.
create or replace function public.task_tag_add(p_task uuid, p_name text)
returns table (id uuid, name text, color text)
language plpgsql security invoker set search_path = '' as $$
declare ws uuid := private.request_org()::uuid; t record; tid uuid; nm text := btrim(coalesce(p_name, ''));
begin
  if length(nm) not between 1 and 40 then raise exception 'a tag needs a name of 1 to 40 characters' using errcode = 'P0001'; end if;
  select pt.client_id, pt.project_id into t from public.project_tasks pt where pt.workspace_id = ws and pt.id = p_task;
  if t.project_id is null or not private.has_permission(ws, 'projects.task.edit', t.client_id, t.project_id) then raise exception 'not found' using errcode = '42501'; end if;
  tid := private.project_tag_ensure(ws, nm);
  insert into public.task_tags (workspace_id, task_id, tag_id) values (ws, p_task, tid) on conflict do nothing;
  return query select g.id, g.name, g.color from public.project_tags g where g.workspace_id = ws and g.id = tid;
end $$;
create or replace function private.project_tag_ensure(p_ws uuid, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare tid uuid;
begin
  if p_ws is distinct from private.request_org()::uuid or not private.can_use_app(p_ws, 'projects') then raise exception 'not found' using errcode = '42501'; end if;   -- only in the request's own organization
  select g.id into tid from public.project_tags g where g.workspace_id = p_ws and lower(btrim(g.name)) = lower(btrim(p_name));
  if tid is null then
    insert into public.project_tags (workspace_id, name, created_by) values (p_ws, btrim(p_name), private.current_user_id())
    on conflict (workspace_id, lower(btrim(name))) do nothing returning project_tags.id into tid;
    if tid is null then select g.id into tid from public.project_tags g where g.workspace_id = p_ws and lower(btrim(g.name)) = lower(btrim(p_name)); end if;
  end if;
  return tid;
end $$;

-- ------------------------------------------------------------------ policies
do $$
declare t text;
begin
  foreach t in array array['project_sections', 'project_tags', 'task_tags', 'task_files'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('create policy org_scope on public.%I as restrictive for all
      using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id))', t);
  end loop;
end $$;

create policy project_sections_select on public.project_sections for select using (private.has_permission(workspace_id, 'projects.task.view', client_id, project_id));
create policy project_sections_insert on public.project_sections for insert with check (
  private.has_permission(workspace_id, 'projects.task.edit', (select p.client_id from public.projects p where p.workspace_id = project_sections.workspace_id and p.id = project_sections.project_id), project_id));
create policy project_sections_update on public.project_sections for update
  using (private.has_permission(workspace_id, 'projects.task.edit', client_id, project_id)) with check (private.has_permission(workspace_id, 'projects.task.edit', client_id, project_id));
create policy project_sections_delete on public.project_sections for delete using (private.has_permission(workspace_id, 'projects.task.edit', client_id, project_id));

-- tag names are labels, not data: everyone who can use Projects here sees the list; tags are created only through task_tag_add
create policy project_tags_select on public.project_tags for select using (private.can_use_app(workspace_id, 'projects'));

create policy task_tags_select on public.task_tags for select using (private.has_permission(workspace_id, 'projects.task.view', client_id, project_id));
create policy task_tags_insert on public.task_tags for insert with check (
  private.has_permission(workspace_id, 'projects.task.edit',
    (select t.client_id from public.project_tasks t where t.workspace_id = task_tags.workspace_id and t.id = task_tags.task_id),
    (select t.project_id from public.project_tasks t where t.workspace_id = task_tags.workspace_id and t.id = task_tags.task_id)));
create policy task_tags_delete on public.task_tags for delete using (private.has_permission(workspace_id, 'projects.task.edit', client_id, project_id));

-- a link is seen only with BOTH the task and the file (the files subquery runs under the reader's own Drive rules)
create policy task_files_select on public.task_files for select using (
  private.has_permission(workspace_id, 'projects.task.view', client_id, project_id)
  and exists (select 1 from public.files f where f.workspace_id = task_files.workspace_id and f.id = task_files.file_id));
create policy task_files_insert on public.task_files for insert with check (
  private.has_permission(workspace_id, 'projects.task.edit',
    (select t.client_id from public.project_tasks t where t.workspace_id = task_files.workspace_id and t.id = task_files.task_id),
    (select t.project_id from public.project_tasks t where t.workspace_id = task_files.workspace_id and t.id = task_files.task_id))
  and exists (select 1 from public.files f where f.workspace_id = task_files.workspace_id and f.id = task_files.file_id));
create policy task_files_delete on public.task_files for delete using (private.has_permission(workspace_id, 'projects.task.edit', client_id, project_id));

-- ------------------------------------------------------------------ audit and grants
create trigger audit_project_sections after insert or update or delete on public.project_sections for each row execute function private.audit_change('project_id', 'name');
create trigger audit_task_files after insert or delete on public.task_files for each row execute function private.audit_change('task_id', 'file_id');

revoke all on all functions in schema private from public;
grant execute on function private.project_tag_ensure(uuid, text) to app_user;   -- called by task_tag_add after it checked the right to edit the task
revoke all on function public.task_tag_add(uuid, text) from public;
grant execute on function public.task_tag_add(uuid, text) to app_user;
grant select, insert, update, delete on public.project_sections to app_user;
grant select on public.project_tags to app_user;
grant select, insert, delete on public.task_tags, public.task_files to app_user;

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
