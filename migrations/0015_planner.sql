set check_function_bodies = off;
-- 0015 · Planner data layer (Phase 5, data and API only; the screens come with their own design).
-- Strategy, goals, measures and reviews: objectives (what we want), measures (how we know, with a value history), links to Projects tasks
-- (the actions that serve an objective) and periodic reviews. Same standards as Clients and Projects: one organization per row, the shared
-- permission engine (organization-wide or on one client), audited without long text, archive before delete, composite keys, internal only
-- (no client-facing path exists: the Client Portal is locked and Planner is not designed for it), Data API roles have no access (0010).

-- ------------------------------------------------------------------ permissions (app: planner)
insert into public.permissions (key, app_key, description, floor_role, default_role, scopes, sensitive) values
  ('planner.objective.view',   'planner', 'View objectives, measures and links',                       'viewer', 'viewer', '{workspace,client}', false),
  ('planner.objective.create', 'planner', 'Create objectives and measures',                            'editor', 'editor', '{workspace,client}', false),
  ('planner.objective.edit',   'planner', 'Edit, link and archive objectives and measures',            'editor', 'editor', '{workspace,client}', false),
  ('planner.objective.delete', 'planner', 'Permanently delete an ARCHIVED objective or measure',       'admin',  'owner',  '{workspace}', true),
  ('planner.measure.record',   'planner', 'Record a new value for a measure',                          'editor', 'editor', '{workspace,client}', false),
  ('planner.review.view',      'planner', 'View reviews',                                              'viewer', 'viewer', '{workspace,client}', false),
  ('planner.review.create',    'planner', 'Schedule and write reviews',                                'editor', 'editor', '{workspace,client}', false),
  ('planner.review.edit',      'planner', 'Edit, complete or archive reviews',                         'editor', 'editor', '{workspace,client}', false),
  ('planner.review.delete',    'planner', 'Permanently delete an ARCHIVED review',                     'admin',  'owner',  '{workspace}', true);

-- ------------------------------------------------------------------ tables
create table public.planner_objectives (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid,
  owner_id uuid,
  title text not null check (length(title) between 1 and 300),
  description text check (length(description) <= 8000),
  status text not null default 'planned' check (status in ('planned', 'active', 'achieved', 'dropped')),
  health text check (health in ('on_track', 'at_risk', 'off_track')),
  period_start date,
  period_end date,
  archived_at timestamptz,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (period_end is null or period_start is null or period_end >= period_start),
  unique (workspace_id, id),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id),
  foreign key (workspace_id, owner_id) references public.memberships (workspace_id, user_id)
);
create index planner_objectives_ws on public.planner_objectives (workspace_id, status) where archived_at is null;

create table public.planner_measures (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  objective_id uuid not null,
  client_id uuid,                                   -- copied from the objective by the guard
  name text not null check (length(name) between 1 and 200),
  unit text check (length(unit) <= 20),
  start_value numeric not null default 0 check (start_value between -1000000000000 and 1000000000000),
  target_value numeric not null check (target_value between -1000000000000 and 1000000000000),
  due_on date,
  archived_at timestamptz,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (target_value <> start_value),
  unique (workspace_id, id),
  foreign key (workspace_id, objective_id) references public.planner_objectives (workspace_id, id)
);
create index planner_measures_objective on public.planner_measures (workspace_id, objective_id) where archived_at is null;

create table public.planner_measure_values (       -- history: one row per recorded value, never edited
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  measure_id uuid not null,
  objective_id uuid,
  client_id uuid,
  value numeric not null check (value between -1000000000000 and 1000000000000),
  note text check (length(note) <= 300),
  recorded_by uuid,
  recorded_at timestamptz not null default now(),
  foreign key (workspace_id, measure_id) references public.planner_measures (workspace_id, id) on delete cascade
);
create index planner_measure_values_measure on public.planner_measure_values (workspace_id, measure_id, recorded_at desc);

create table public.planner_objective_tasks (      -- the actions that serve an objective: Projects tasks, by reference
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  objective_id uuid not null,
  task_id uuid not null,
  created_by uuid, created_at timestamptz not null default now(),
  primary key (objective_id, task_id),
  foreign key (workspace_id, objective_id) references public.planner_objectives (workspace_id, id) on delete cascade,
  foreign key (workspace_id, task_id) references public.project_tasks (workspace_id, id)
);
create index planner_objective_tasks_task on public.planner_objective_tasks (workspace_id, task_id);

create table public.planner_reviews (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid,
  objective_id uuid,
  title text not null check (length(title) between 1 and 200),
  period_start date,
  period_end date,
  due_on date,
  status text not null default 'scheduled' check (status in ('scheduled', 'done')),
  rating text check (rating in ('on_track', 'at_risk', 'off_track')),
  summary text check (length(summary) <= 10000),
  wins text check (length(wins) <= 10000),
  issues text check (length(issues) <= 10000),
  next_steps text check (length(next_steps) <= 10000),
  completed_at timestamptz,
  archived_at timestamptz,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (period_end is null or period_start is null or period_end >= period_start),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id),
  foreign key (workspace_id, objective_id) references public.planner_objectives (workspace_id, id)
);
create index planner_reviews_due on public.planner_reviews (workspace_id, due_on) where archived_at is null and status = 'scheduled';

-- ------------------------------------------------------------------ guards
create or replace function private.planner_objectives_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id();
begin
  if tg_op = 'INSERT' then
    if uid is not null then new.created_by := uid; end if;
  else
    if new.workspace_id is distinct from old.workspace_id or new.client_id is distinct from old.client_id or new.created_by is distinct from old.created_by then
      raise exception 'records do not move' using errcode = 'P0001';
    end if;
    new.updated_at := now();
  end if;
  if new.owner_id is not null and not exists (select 1 from public.memberships m where m.workspace_id = new.workspace_id and m.user_id = new.owner_id and m.kind = 'staff') then
    raise exception 'the owner must be a member of this organization' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger planner_objectives_guard before insert or update on public.planner_objectives for each row execute function private.planner_objectives_guard();

create or replace function private.planner_measures_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); oc uuid; found boolean;
begin
  select true, o.client_id into found, oc from public.planner_objectives o where o.workspace_id = new.workspace_id and o.id = new.objective_id;
  if found is not true then raise exception 'not found' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    if uid is not null then new.created_by := uid; end if;
    new.client_id := oc;
  else
    if new.workspace_id is distinct from old.workspace_id or new.objective_id is distinct from old.objective_id or new.client_id is distinct from old.client_id or new.created_by is distinct from old.created_by then
      raise exception 'records do not move' using errcode = 'P0001';
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;
create trigger planner_measures_guard before insert or update on public.planner_measures for each row execute function private.planner_measures_guard();

-- Values: recorded by the signed-in person at the server's time; history is never edited.
create or replace function private.planner_values_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); mo uuid; mc uuid; found boolean;
begin
  if tg_op <> 'INSERT' then raise exception 'recorded values are history and cannot change' using errcode = 'P0001'; end if;
  select true, m.objective_id, m.client_id into found, mo, mc from public.planner_measures m where m.workspace_id = new.workspace_id and m.id = new.measure_id;
  if found is not true then raise exception 'not found' using errcode = '42501'; end if;
  new.objective_id := mo; new.client_id := mc; new.recorded_at := now();
  if uid is not null then new.recorded_by := uid; end if;
  return new;
end $$;
create trigger planner_values_guard before insert or update on public.planner_measure_values for each row execute function private.planner_values_guard();

-- Links: a task from Projects can serve an objective; a client's objective only takes that client's tasks.
create or replace function private.planner_links_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); oc uuid; tc uuid; ofound boolean; tfound boolean;
begin
  select true, o.client_id into ofound, oc from public.planner_objectives o where o.workspace_id = new.workspace_id and o.id = new.objective_id;
  select true, t.client_id into tfound, tc from public.project_tasks t where t.workspace_id = new.workspace_id and t.id = new.task_id;
  if ofound is not true or tfound is not true then raise exception 'not found' using errcode = '42501'; end if;
  if oc is not null and tc is distinct from oc then raise exception 'a client''s objective can only use that client''s tasks' using errcode = 'P0001'; end if;
  if uid is not null then new.created_by := uid; end if;
  return new;
end $$;
create trigger planner_links_guard before insert on public.planner_objective_tasks for each row execute function private.planner_links_guard();

create or replace function private.planner_reviews_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); oc uuid; found boolean;
begin
  if new.objective_id is not null then
    select true, o.client_id into found, oc from public.planner_objectives o where o.workspace_id = new.workspace_id and o.id = new.objective_id;
    if found is not true then raise exception 'not found' using errcode = '42501'; end if;
    new.client_id := oc;                           -- a review of an objective belongs to that objective's client
  end if;
  if tg_op = 'INSERT' then
    if uid is not null then new.created_by := uid; end if;
  else
    if new.workspace_id is distinct from old.workspace_id or new.client_id is distinct from old.client_id or new.objective_id is distinct from old.objective_id or new.created_by is distinct from old.created_by then
      raise exception 'records do not move' using errcode = 'P0001';
    end if;
    new.updated_at := now();
  end if;
  new.completed_at := case when new.status = 'done' then coalesce(new.completed_at, now()) else null end;
  return new;
end $$;
create trigger planner_reviews_guard before insert or update on public.planner_reviews for each row execute function private.planner_reviews_guard();

-- An objective that still has measures, reviews or linked tasks cannot be deleted: archive it. Measures and reviews also go through the trash first.
create or replace function private.planner_objective_in_use() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.planner_measures where objective_id = old.id) or exists (select 1 from public.planner_reviews where objective_id = old.id)
     or exists (select 1 from public.planner_objective_tasks where objective_id = old.id) then
    raise exception 'archive this objective instead: it still has measures, reviews or linked tasks' using errcode = 'P0001';
  end if;
  return old;
end $$;
create trigger planner_objectives_in_use before delete on public.planner_objectives for each row execute function private.planner_objective_in_use();
create trigger planner_objectives_refuse_delete before delete on public.planner_objectives for each row execute function private.archive_before_delete();
create trigger planner_measures_refuse_delete before delete on public.planner_measures for each row execute function private.archive_before_delete();
create trigger planner_reviews_refuse_delete before delete on public.planner_reviews for each row execute function private.archive_before_delete();

-- A project task that serves an objective cannot be deleted from under it (archive the task, or unlink first).
create or replace function private.project_task_linked() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.planner_objective_tasks where task_id = old.id) then
    raise exception 'unlink this task from its objectives first' using errcode = 'P0001';
  end if;
  return old;
end $$;
create trigger project_tasks_linked before delete on public.project_tasks for each row execute function private.project_task_linked();

-- ------------------------------------------------------------------ policies
do $$
declare t text;
begin
  foreach t in array array['planner_objectives', 'planner_measures', 'planner_measure_values', 'planner_objective_tasks', 'planner_reviews'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('create policy org_scope on public.%I as restrictive for all
      using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id))', t);
  end loop;
end $$;

create policy planner_objectives_select on public.planner_objectives for select using (private.has_permission(workspace_id, 'planner.objective.view', client_id));
create policy planner_objectives_insert on public.planner_objectives for insert with check (private.has_permission(workspace_id, 'planner.objective.create', client_id));
create policy planner_objectives_update on public.planner_objectives for update
  using (private.has_permission(workspace_id, 'planner.objective.edit', client_id)) with check (private.has_permission(workspace_id, 'planner.objective.edit', client_id));
create policy planner_objectives_delete on public.planner_objectives for delete using (private.has_permission(workspace_id, 'planner.objective.delete'));

create policy planner_measures_select on public.planner_measures for select using (private.has_permission(workspace_id, 'planner.objective.view', client_id));
create policy planner_measures_insert on public.planner_measures for insert with check (
  private.has_permission(workspace_id, 'planner.objective.create', (select o.client_id from public.planner_objectives o where o.workspace_id = planner_measures.workspace_id and o.id = planner_measures.objective_id)));
create policy planner_measures_update on public.planner_measures for update
  using (private.has_permission(workspace_id, 'planner.objective.edit', client_id)) with check (private.has_permission(workspace_id, 'planner.objective.edit', client_id));
create policy planner_measures_delete on public.planner_measures for delete using (private.has_permission(workspace_id, 'planner.objective.delete'));

create policy planner_values_select on public.planner_measure_values for select using (private.has_permission(workspace_id, 'planner.objective.view', client_id));
create policy planner_values_insert on public.planner_measure_values for insert with check (
  private.has_permission(workspace_id, 'planner.measure.record', (select m.client_id from public.planner_measures m where m.workspace_id = planner_measure_values.workspace_id and m.id = planner_measure_values.measure_id)));

create policy planner_links_select on public.planner_objective_tasks for select using (
  exists (select 1 from public.planner_objectives o where o.workspace_id = planner_objective_tasks.workspace_id and o.id = planner_objective_tasks.objective_id));
create policy planner_links_insert on public.planner_objective_tasks for insert with check (
  private.has_permission(workspace_id, 'planner.objective.edit', (select o.client_id from public.planner_objectives o where o.workspace_id = planner_objective_tasks.workspace_id and o.id = planner_objective_tasks.objective_id))
  and exists (select 1 from public.project_tasks t where t.workspace_id = planner_objective_tasks.workspace_id and t.id = planner_objective_tasks.task_id));      -- the person must be able to see the task they link
create policy planner_links_delete on public.planner_objective_tasks for delete using (
  private.has_permission(workspace_id, 'planner.objective.edit', (select o.client_id from public.planner_objectives o where o.workspace_id = planner_objective_tasks.workspace_id and o.id = planner_objective_tasks.objective_id)));

create policy planner_reviews_select on public.planner_reviews for select using (private.has_permission(workspace_id, 'planner.review.view', client_id));
create policy planner_reviews_insert on public.planner_reviews for insert with check (
  private.has_permission(workspace_id, 'planner.review.create', coalesce(client_id, (select o.client_id from public.planner_objectives o where o.workspace_id = planner_reviews.workspace_id and o.id = planner_reviews.objective_id))));
create policy planner_reviews_update on public.planner_reviews for update
  using (private.has_permission(workspace_id, 'planner.review.edit', client_id)) with check (private.has_permission(workspace_id, 'planner.review.edit', client_id));
create policy planner_reviews_delete on public.planner_reviews for delete using (private.has_permission(workspace_id, 'planner.review.delete'));

-- ------------------------------------------------------------------ audit: titles, statuses and numbers; never long text
create trigger audit_planner_objectives after insert or update or delete on public.planner_objectives
  for each row execute function private.audit_change('client_id', 'owner_id', 'title', 'status', 'health', 'period_start', 'period_end', 'archived_at');
create trigger audit_planner_measures after insert or update or delete on public.planner_measures
  for each row execute function private.audit_change('objective_id', 'name', 'unit', 'start_value', 'target_value', 'due_on', 'archived_at');
create trigger audit_planner_values after insert on public.planner_measure_values
  for each row execute function private.audit_change('measure_id', 'value');
create trigger audit_planner_links after insert or delete on public.planner_objective_tasks
  for each row execute function private.audit_change('objective_id', 'task_id');
create trigger audit_planner_reviews after insert or update or delete on public.planner_reviews
  for each row execute function private.audit_change('objective_id', 'client_id', 'title', 'status', 'rating', 'due_on', 'archived_at');

-- a client that has planner work cannot be deleted (extends the check from 0008 and 0013)
create or replace function private.refuse_delete_planner_clients() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.planner_objectives where client_id = old.id) or exists (select 1 from public.planner_reviews where client_id = old.id) then
    raise exception 'archive this client instead: it still has work' using errcode = 'P0001';
  end if;
  return old;
end $$;
create trigger clients_refuse_delete_planner before delete on public.clients for each row execute function private.refuse_delete_planner_clients();

-- ------------------------------------------------------------------ grants (page registry rows were seeded in 0005)
revoke all on all functions in schema private from public;
grant select, insert, update, delete on public.planner_objectives, public.planner_measures, public.planner_reviews to app_user;
grant select, insert on public.planner_measure_values to app_user;
grant select, insert, delete on public.planner_objective_tasks to app_user;
