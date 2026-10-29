-- 0033 Planner strategy app (Cascade-style): plans, focus areas, objectives, KPIs, tasks, reviews, strategy model and strategy map.
-- Source: the standalone Planner build (local migrations 0005_planner.sql + 0006_planner_api.sql), merged here unchanged except:
--   * planner_measures -> planner_kpis and planner_reviews -> planner_plan_reviews, because 0015 already uses those names
--     for the earlier objectives/measures backend. Both sets live side by side; nothing in 0015 is dropped or altered.
--   * The app calls the public.planner_* functions below through packages/core/planner-strategy-operations.mjs.
-- Owner approval is required before this runs in any live environment.
set check_function_bodies = off;
-- 0005 · Planner (strategy planning and execution). Reference capability: strategy-planning tools such as Cascade;
-- product code, wording and identity are original (docs/planner/PLANNER_BLUEPRINT.md).
-- Rules honoured: WCIGA (every row carries workspace_id, composite FKs, forced RLS), SDOR (Planner owns strategy
-- records; projects are linked by reference), ER2 archive-before-delete (no cascading deletes), ER6 attributable writes,
-- one permission engine (private.has_permission), tamper-evident history (append-only, written by triggers).
-- Terminology: a `workspaces` row is an ORGANIZATION (Layer2Funnels, Aurj).

-- ------------------------------------------------------------------ permissions (new ones default to the stated role)
insert into public.permissions (key, app_key, description, floor_role, default_role, scopes, sensitive) values
  ('planner.plan.view',      'planner', 'View plans, goals, measures, updates, risks and reviews',                  'viewer', 'viewer', '{workspace}', false),
  ('planner.plan.manage',    'planner', 'Create, edit and archive plans; vision, values, focus areas, goal types',   'editor', 'admin',  '{workspace}', false),
  ('planner.goal.create',    'planner', 'Create goals and initiatives',                                              'editor', 'editor', '{workspace}', false),
  ('planner.goal.edit',      'planner', 'Edit, re-align and reassign any goal',                                      'editor', 'editor', '{workspace}', false),
  ('planner.goal.archive',   'planner', 'Archive and restore goals',                                                 'editor', 'editor', '{workspace}', false),
  ('planner.goal.delete',    'planner', 'Permanently delete an archived goal that holds no work or history',         'admin',  'owner',  '{workspace}', true),
  ('planner.update.post',    'planner', 'Post progress updates and record measure readings',                        'editor', 'editor', '{workspace}', false),
  ('planner.measure.edit',   'planner', 'Create and edit measures',                                                  'editor', 'editor', '{workspace}', false),
  ('planner.action.manage',  'planner', 'Create and edit actions and risks on goals',                                'editor', 'editor', '{workspace}', false),
  ('planner.review.manage',  'planner', 'Schedule and hold plan reviews',                                            'editor', 'admin',  '{workspace}', false),
  ('planner.comment.create', 'planner', 'Comment on goals',                                                          'editor', 'editor', '{workspace}', false);

create or replace function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

-- ------------------------------------------------------------------ tables
create table public.planner_plans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text check (char_length(description) <= 2000),
  vision text check (char_length(vision) <= 2000),
  period_start date, period_end date,
  review_cadence text not null default 'monthly' check (review_cadence in ('none', 'weekly', 'fortnightly', 'monthly', 'quarterly')),
  parent_plan_id uuid check (parent_plan_id is null or parent_plan_id <> id),
  archived_at timestamptz,
  created_by uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (period_end is null or period_start is null or period_end >= period_start),
  unique (workspace_id, id)
);
alter table public.planner_plans add foreign key (workspace_id, parent_plan_id) references public.planner_plans (workspace_id, id);
create unique index planner_plans_name on public.planner_plans (workspace_id, lower(name)) where archived_at is null;

create table public.planner_values (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  plan_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text check (char_length(description) <= 600),
  position int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, plan_id) references public.planner_plans (workspace_id, id)
);

create table public.planner_focus_areas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  plan_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text check (char_length(description) <= 1000),
  color text not null default 'blue' check (color in ('blue', 'coral', 'teal', 'amber', 'violet', 'green', 'slate')),
  position int not null default 0,
  start_date date,
  end_date date check (end_date is null or start_date is null or end_date >= start_date),
  archived_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, plan_id) references public.planner_plans (workspace_id, id)
);

-- Goal types are configurable per organization. uses_measure = the type is tracked by a measure (KPI-style).
create table public.planner_goal_types (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  uses_measure boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (workspace_id, id), unique (workspace_id, name)
);

create table public.planner_goals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  plan_id uuid not null,
  focus_area_id uuid not null,
  parent_goal_id uuid,
  goal_type_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text check (char_length(description) <= 4000),
  owner_id uuid,
  status text not null default 'not_started' check (status in ('not_started', 'on_track', 'at_risk', 'off_track', 'on_hold', 'completed')),
  progress numeric(5,2) not null default 0 check (progress between 0 and 100),
  progress_mode text not null default 'manual' check (progress_mode in ('manual', 'measure', 'children', 'actions')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  weight int not null default 1 check (weight between 1 and 100),
  start_date date, due_date date,
  position int not null default 0,
  project_id uuid,
  value_id uuid,
  tags text[] not null default '{}' check (cardinality(tags) <= 20),
  completed_at timestamptz,
  archived_at timestamptz,
  last_update_at timestamptz,
  update_cadence text not null default 'none' check (update_cadence in ('none', 'weekly', 'fortnightly', 'monthly', 'quarterly')),
  created_by uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (due_date is null or start_date is null or due_date >= start_date),
  check (parent_goal_id is null or parent_goal_id <> id),
  unique (workspace_id, id),
  foreign key (workspace_id, plan_id) references public.planner_plans (workspace_id, id),
  foreign key (workspace_id, focus_area_id) references public.planner_focus_areas (workspace_id, id),
  foreign key (workspace_id, parent_goal_id) references public.planner_goals (workspace_id, id),
  foreign key (workspace_id, goal_type_id) references public.planner_goal_types (workspace_id, id),
  foreign key (workspace_id, project_id) references public.projects (workspace_id, id),
  foreign key (workspace_id, value_id) references public.planner_values (workspace_id, id)
);
create index on public.planner_goals (workspace_id, plan_id, focus_area_id);
create index on public.planner_goals (workspace_id, owner_id) where archived_at is null;
create index on public.planner_goals (workspace_id, parent_goal_id);

create table public.planner_kpis (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  goal_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  unit text not null default '' check (char_length(unit) <= 20),
  direction text not null default 'increase' check (direction in ('increase', 'decrease')),
  start_value numeric not null default 0,
  target_value numeric not null,
  current_value numeric not null default 0,
  cadence text not null default 'monthly' check (cadence in ('none', 'weekly', 'monthly', 'quarterly')),
  source text not null default 'manual' check (source in ('manual')),
  archived_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (target_value <> start_value),
  unique (workspace_id, id),
  foreign key (workspace_id, goal_id) references public.planner_goals (workspace_id, id)
);

create table public.planner_measure_readings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  measure_id uuid not null,
  value numeric not null,
  note text check (char_length(note) <= 500),
  recorded_on date not null default current_date,
  recorded_by uuid not null,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, measure_id) references public.planner_kpis (workspace_id, id)
);
create index on public.planner_measure_readings (workspace_id, measure_id, recorded_on desc);

-- A progress update (check-in). Append-only: a correction is a new update.
create table public.planner_updates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  goal_id uuid not null,
  author_id uuid not null,
  status text not null check (status in ('not_started', 'on_track', 'at_risk', 'off_track', 'on_hold', 'completed')),
  progress numeric(5,2) check (progress between 0 and 100),
  confidence text check (confidence in ('high', 'medium', 'low')),
  summary text not null check (char_length(btrim(summary)) between 1 and 2000),
  risk text check (char_length(risk) <= 1000),
  next_step text check (char_length(next_step) <= 1000),
  created_at timestamptz not null default now(),
  foreign key (workspace_id, goal_id) references public.planner_goals (workspace_id, id)
);
create index on public.planner_updates (workspace_id, goal_id, created_at desc);

-- Lightweight actions on a goal. Planner-owned; project_id records a stable reference when the work is moved to Projects.
create table public.planner_actions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  goal_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  notes text check (char_length(notes) <= 2000),
  assignee_id uuid,
  status text not null default 'todo' check (status in ('todo', 'doing', 'on_hold', 'done', 'wont_do')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  due_date date,
  completed_at timestamptz,
  position int not null default 0,
  project_id uuid,
  archived_at timestamptz,
  created_by uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, goal_id) references public.planner_goals (workspace_id, id),
  foreign key (workspace_id, project_id) references public.projects (workspace_id, id)
);
create index on public.planner_actions (workspace_id, goal_id);
create index on public.planner_actions (workspace_id, assignee_id) where archived_at is null;

create table public.planner_risks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  goal_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text check (char_length(description) <= 2000),
  likelihood smallint not null default 3 check (likelihood between 1 and 5),
  impact smallint not null default 3 check (impact between 1 and 5),
  severity smallint generated always as (likelihood * impact) stored,
  mitigation text check (char_length(mitigation) <= 2000),
  owner_id uuid,
  status text not null default 'open' check (status in ('open', 'mitigating', 'closed')),
  archived_at timestamptz,
  created_by uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, goal_id) references public.planner_goals (workspace_id, id)
);
create index on public.planner_risks (workspace_id, goal_id);

create table public.planner_comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  goal_id uuid not null,
  author_id uuid not null,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now(), edited_at timestamptz,
  foreign key (workspace_id, goal_id) references public.planner_goals (workspace_id, id)
);
create index on public.planner_comments (workspace_id, goal_id, created_at);

-- A scheduled or held review. Holding a review stores a snapshot of progress so history shows what was true at the time.
create table public.planner_plan_reviews (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  plan_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  due_on date not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'held', 'skipped')),
  held_at timestamptz, held_by uuid,
  summary text check (char_length(summary) <= 4000),
  decisions text check (char_length(decisions) <= 4000),
  snapshot jsonb,
  created_by uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, plan_id) references public.planner_plans (workspace_id, id)
);
create index on public.planner_plan_reviews (workspace_id, plan_id, due_on);

create table public.planner_favorites (
  workspace_id uuid not null,
  plan_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (plan_id, user_id),
  foreign key (workspace_id, plan_id) references public.planner_plans (workspace_id, id)
);

create table public.planner_saved_views (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  plan_id uuid not null,
  owner_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  config jsonb not null check (jsonb_typeof(config) = 'object' and octet_length(config::text) <= 4000),
  created_at timestamptz not null default now(),
  unique (owner_id, plan_id, name),
  foreign key (workspace_id, plan_id) references public.planner_plans (workspace_id, id)
);

-- Append-only change history for the whole app. Written only by triggers; app roles can read, never change.
create table public.planner_history (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  plan_id uuid,
  goal_id uuid,
  actor_id uuid,
  entity text not null,
  entity_id uuid,
  action text not null check (action in ('created', 'updated', 'archived', 'restored', 'deleted')),
  detail jsonb,
  created_at timestamptz not null default now()
);
create index on public.planner_history (workspace_id, goal_id, created_at desc);
create index on public.planner_history (workspace_id, plan_id, created_at desc);

-- Strategy model: which goal types may sit under which. parent_type_id null = directly under a focus area.
-- A parent with no rules is unrestricted; once it has rules, only the listed child types may be placed under it.
create table public.planner_type_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  parent_type_id uuid,
  child_type_id uuid not null,
  foreign key (workspace_id, parent_type_id) references public.planner_goal_types (workspace_id, id) on delete cascade,
  foreign key (workspace_id, child_type_id) references public.planner_goal_types (workspace_id, id) on delete cascade
);
create unique index planner_type_rules_unique on public.planner_type_rules (workspace_id, coalesce(parent_type_id, '00000000-0000-0000-0000-000000000000'::uuid), child_type_id);

-- Named time horizons (Q4 2026, Year 2027, ...) shared by the organization.
create table public.planner_horizons (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 1 and 60),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  created_at timestamptz not null default now(),
  unique (workspace_id, id)
);
create unique index planner_horizons_title on public.planner_horizons (workspace_id, lower(title));
-- Strategies: reusable blueprints. A strategy says which kinds of objective a plan may use and which focus areas it starts with.
-- Focus templates are the reusable focus areas; measure types are reusable KPI definitions tied to the kinds that may use them.
create table public.planner_focus_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text check (char_length(description) <= 300),
  color text not null default 'blue' check (color in ('blue', 'coral', 'teal', 'amber', 'violet', 'green', 'slate')),
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (workspace_id, id)
);
create unique index planner_focus_templates_name on public.planner_focus_templates (workspace_id, lower(name));

create table public.planner_strategies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text check (char_length(description) <= 600),
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (workspace_id, id)
);
create unique index planner_strategies_name on public.planner_strategies (workspace_id, lower(name));

create table public.planner_strategy_kinds (
  workspace_id uuid not null,
  strategy_id uuid not null,
  goal_type_id uuid not null,
  primary key (strategy_id, goal_type_id),
  foreign key (workspace_id, strategy_id) references public.planner_strategies (workspace_id, id) on delete cascade,
  foreign key (workspace_id, goal_type_id) references public.planner_goal_types (workspace_id, id) on delete cascade
);
create table public.planner_strategy_focus (
  workspace_id uuid not null,
  strategy_id uuid not null,
  template_id uuid not null,
  position int not null default 0,
  primary key (strategy_id, template_id),
  unique (workspace_id, strategy_id, template_id),
  foreign key (workspace_id, strategy_id) references public.planner_strategies (workspace_id, id) on delete cascade,
  foreign key (workspace_id, template_id) references public.planner_focus_templates (workspace_id, id) on delete cascade
);

create table public.planner_measure_types (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  unit text not null default '' check (char_length(unit) <= 20),
  direction text not null default 'increase' check (direction in ('increase', 'decrease')),
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (workspace_id, id)
);
create unique index planner_measure_types_name on public.planner_measure_types (workspace_id, lower(name));
create table public.planner_measure_type_kinds (
  workspace_id uuid not null,
  measure_type_id uuid not null,
  goal_type_id uuid not null,
  primary key (measure_type_id, goal_type_id),
  foreign key (workspace_id, measure_type_id) references public.planner_measure_types (workspace_id, id) on delete cascade,
  foreign key (workspace_id, goal_type_id) references public.planner_goal_types (workspace_id, id) on delete cascade
);

alter table public.planner_plans add column strategy_id uuid;
alter table public.planner_plans add foreign key (workspace_id, strategy_id) references public.planner_strategies (workspace_id, id) on delete set null (strategy_id);
alter table public.planner_kpis add column measure_type_id uuid;
alter table public.planner_kpis add foreign key (workspace_id, measure_type_id) references public.planner_measure_types (workspace_id, id) on delete set null (measure_type_id);
-- Per focus area: which kinds of objective sit directly in that focus area of a strategy (none listed = the strategy's kinds).
create table public.planner_strategy_focus_kinds (
  workspace_id uuid not null,
  strategy_id uuid not null,
  template_id uuid not null,
  goal_type_id uuid not null,
  primary key (strategy_id, template_id, goal_type_id),
  foreign key (workspace_id, strategy_id, template_id) references public.planner_strategy_focus (workspace_id, strategy_id, template_id) on delete cascade,
  foreign key (workspace_id, goal_type_id) references public.planner_goal_types (workspace_id, id) on delete cascade
);
-- A plan's focus area remembers which reusable focus area it came from, so the strategy's per-focus rules can apply.
alter table public.planner_focus_areas add column template_id uuid;
alter table public.planner_focus_areas add foreign key (workspace_id, template_id) references public.planner_focus_templates (workspace_id, id) on delete set null (template_id);
-- The strategy's own content: objectives (with sub-objectives), KPIs and tasks drawn under each focus area of the map.
-- A plan created from the strategy gets a copy of all of it. Removing a focus area from the strategy removes what was under it.
create table public.planner_strategy_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  strategy_id uuid not null,
  template_id uuid not null,
  parent_id uuid,
  item_kind text not null check (item_kind in ('objective', 'kpi', 'task')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  goal_type_id uuid,
  unit text not null default '' check (char_length(unit) <= 20),
  target numeric,
  direction text not null default 'increase' check (direction in ('increase', 'decrease')),
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, strategy_id) references public.planner_strategies (workspace_id, id) on delete cascade,
  foreign key (workspace_id, strategy_id, template_id) references public.planner_strategy_focus (workspace_id, strategy_id, template_id) on delete cascade,
  foreign key (workspace_id, parent_id) references public.planner_strategy_items (workspace_id, id) on delete cascade,
  foreign key (workspace_id, goal_type_id) references public.planner_goal_types (workspace_id, id) on delete set null (goal_type_id),
  check (item_kind = 'objective' or parent_id is not null)   -- KPIs and tasks always belong to an objective
);
-- ------------------------------------------------------------------ helpers
-- Writing needs the specific right AND the right to see the plan (a person denied plan.view cannot write blind).
create or replace function private.planner_can(ws uuid, perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_permission(ws, 'planner.plan.view') and private.has_permission(ws, perm)
$$;

create or replace function private.planner_is_member(ws uuid, uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select uid is null or exists (select 1 from public.memberships m
    where m.workspace_id = ws and m.user_id = uid and m.kind = 'staff' and m.status = 'active')
$$;

-- Progress of one measure, 0..100, from start to target in the chosen direction.
create or replace function private.planner_measure_progress(m public.planner_kpis) returns numeric
language sql immutable set search_path = '' as $$
  select greatest(0, least(100, round(((m.current_value - m.start_value) / (m.target_value - m.start_value)) * 100, 2)))
$$;

-- Recompute a goal whose progress is derived (from measures or from child goals), then walk up to its parent.
create or replace function private.planner_recalc(g uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare gr public.planner_goals; v numeric;
begin
  select * into gr from public.planner_goals where id = g;
  if gr.id is null then return; end if;
  if gr.progress_mode = 'measure' then
    select round(avg(private.planner_measure_progress(m)), 2) into v from public.planner_kpis m
     where m.goal_id = g and m.archived_at is null;
  elsif gr.progress_mode = 'children' then
    select round(sum(c.progress * c.weight) / nullif(sum(c.weight), 0), 2) into v from public.planner_goals c
     where c.parent_goal_id = g and c.archived_at is null;
  elsif gr.progress_mode = 'actions' then
    select round(100.0 * count(*) filter (where a.status = 'done') / nullif(count(*) filter (where a.status <> 'wont_do'), 0), 2) into v from public.planner_actions a
     where a.goal_id = g and a.archived_at is null;
  end if;
  if v is not null and v is distinct from gr.progress then
    update public.planner_goals set progress = v where id = g;   -- fires the goal triggers, which continue upward
  end if;
end $$;

-- ------------------------------------------------------------------ goal guard (alignment, ownership, field-level rights)
create or replace function private.planner_goal_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare par public.planner_goals; fa public.planner_focus_areas; pl public.planner_plans; d int := 0; below int := 0; cur uuid; ptype uuid;
        restricted text[] := array['status', 'progress', 'completed_at', 'last_update_at', 'updated_at'];
        changed text[];
begin
  select * into pl from public.planner_plans where id = new.plan_id;
  if tg_op = 'UPDATE' then
    if new.workspace_id <> old.workspace_id or new.plan_id <> old.plan_id or new.created_by <> old.created_by then
      raise exception 'goal ownership keys cannot change' using errcode = '42501';
    end if;
  end if;
  if pl.archived_at is not null and (tg_op = 'INSERT' or new.archived_at is not distinct from old.archived_at) then
    raise exception 'this plan is archived: restore it to change its goals' using errcode = 'P0001';
  end if;

  select * into fa from public.planner_focus_areas where id = new.focus_area_id;
  if fa.plan_id <> new.plan_id then raise exception 'focus area belongs to another plan' using errcode = '23503'; end if;
  if new.parent_goal_id is not null then
    select * into par from public.planner_goals where id = new.parent_goal_id;
    if par.plan_id <> new.plan_id then raise exception 'parent goal belongs to another plan' using errcode = '23503'; end if;
    new.focus_area_id := par.focus_area_id;          -- a child always sits in its parent's focus area
    cur := new.parent_goal_id;
    while cur is not null loop                       -- no cycles, bounded depth
      if cur = new.id then raise exception 'a goal cannot be aligned under itself' using errcode = 'P0001'; end if;
      d := d + 1;
      if d > 5 then raise exception 'alignment is limited to 5 levels' using errcode = 'P0001'; end if;
      select parent_goal_id into cur from public.planner_goals where id = cur;
    end loop;
    if tg_op = 'UPDATE' and new.parent_goal_id is distinct from old.parent_goal_id then   -- a moved branch must fit as a whole
      with recursive down as (select id, 1 lvl from public.planner_goals where parent_goal_id = new.id
        union all select g.id, down.lvl + 1 from public.planner_goals g join down on g.parent_goal_id = down.id)
      select coalesce(max(lvl), 0) into below from down;
      if d + below > 5 then raise exception 'alignment is limited to 5 levels' using errcode = 'P0001'; end if;
    end if;
  end if;
  if (tg_op = 'INSERT' or new.focus_area_id is distinct from old.focus_area_id) and fa.archived_at is not null then
    raise exception 'focus area is archived' using errcode = 'P0001';
  end if;
  if not private.planner_is_member(new.workspace_id, new.owner_id) then
    raise exception 'the owner must be an active member of this organization' using errcode = '23503';
  end if;

  -- Strategy model: when the parent (or the focus area level) has rules, this goal's type must be one of them.
  if tg_op = 'INSERT' or new.goal_type_id is distinct from old.goal_type_id or new.parent_goal_id is distinct from old.parent_goal_id then
    ptype := case when new.parent_goal_id is null then null else par.goal_type_id end;
    if exists (select 1 from public.planner_type_rules r where r.workspace_id = new.workspace_id and r.parent_type_id is not distinct from ptype)
       and not exists (select 1 from public.planner_type_rules r where r.workspace_id = new.workspace_id and r.parent_type_id is not distinct from ptype and r.child_type_id = new.goal_type_id) then
      raise exception 'the strategy model does not allow this type here' using errcode = 'P0001';
    end if;
  end if;
  if new.status = 'completed' then
    new.progress := 100; new.completed_at := coalesce(old.completed_at, now());
  elsif tg_op = 'UPDATE' and old.status = 'completed' then
    new.completed_at := null;
  end if;

  -- Field-level rights apply to the statement the user ran (trigger depth 1). Updates made by our own triggers
  -- (rollups, check-ins, focus moves; depth > 1) only ever write progress, status or focus area and are allowed.
  if tg_op = 'UPDATE' and pg_trigger_depth() = 1 then
    if new.archived_at is distinct from old.archived_at and not private.has_permission(new.workspace_id, 'planner.goal.archive') then
      raise exception 'not allowed to archive or restore goals' using errcode = '42501';
    end if;
    -- Without edit rights only the goal's owner may change progress-related columns; nobody else changes anything.
    if not private.has_permission(new.workspace_id, 'planner.goal.edit') then
      if old.owner_id is not distinct from private.current_user_id() and private.has_permission(new.workspace_id, 'planner.update.post') then
        null;
      else
        restricted := '{}';
      end if;
      select array_agg(k) into changed from jsonb_object_keys(to_jsonb(new)) k
       where (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k) and k not in ('archived_at', 'updated_at');
      if exists (select 1 from unnest(coalesce(changed, '{}')) c where c <> all (restricted)) then
        raise exception 'not allowed to edit this goal' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger planner_goal_guard before insert or update on public.planner_goals
  for each row execute function private.planner_goal_guard();
create trigger planner_goals_touch before update on public.planner_goals
  for each row execute function private.touch_updated_at();

create or replace function private.planner_goal_after() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('INSERT', 'UPDATE') and new.parent_goal_id is not null then perform private.planner_recalc(new.parent_goal_id); end if;
  if tg_op = 'UPDATE' and old.parent_goal_id is not null and old.parent_goal_id is distinct from new.parent_goal_id then
    perform private.planner_recalc(old.parent_goal_id);
  end if;
  if tg_op = 'UPDATE' and new.progress_mode is distinct from old.progress_mode then perform private.planner_recalc(new.id); end if;
  if tg_op = 'INSERT' and new.progress_mode <> 'manual' then perform private.planner_recalc(new.id); end if;
  return null;
end $$;
create trigger planner_goal_after after insert or update on public.planner_goals
  for each row execute function private.planner_goal_after();

-- A plan may sit under another plan (alignment); no cycles, bounded depth, same organization (composite FK).
create or replace function private.planner_plan_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare cur uuid := new.parent_plan_id; d int := 0;
begin
  if tg_op = 'UPDATE' and pg_trigger_depth() = 1 and new.strategy_id is distinct from old.strategy_id then raise exception 'a plan keeps the strategy it was created with' using errcode = 'P0001'; end if;
  while cur is not null loop
    if cur = new.id then raise exception 'a plan cannot sit under itself or one of its sub-plans' using errcode = 'P0001'; end if;
    d := d + 1;
    if d > 6 then raise exception 'plan alignment is limited to 6 levels' using errcode = 'P0001'; end if;
    select parent_plan_id into cur from public.planner_plans where id = cur;
  end loop;
  return new;
end $$;
create trigger planner_plan_guard before insert or update on public.planner_plans
  for each row execute function private.planner_plan_guard();
-- Children moving focus area with their parent chain: when a top-level goal changes focus area, move its descendants too.
create or replace function private.planner_goal_cascade_focus() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.focus_area_id is distinct from old.focus_area_id then
    update public.planner_goals set focus_area_id = new.focus_area_id where parent_goal_id = new.id and focus_area_id <> new.focus_area_id;
  end if;
  return null;
end $$;
create trigger planner_goal_cascade_focus after update on public.planner_goals
  for each row execute function private.planner_goal_cascade_focus();

-- Hard delete only for an archived goal that holds nothing (ER2).
create or replace function private.planner_goal_refuse_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.archived_at is null then raise exception 'archive this goal before deleting it' using errcode = 'P0001'; end if;
  if exists (select 1 from public.planner_goals where parent_goal_id = old.id)
     or exists (select 1 from public.planner_updates where goal_id = old.id)
     or exists (select 1 from public.planner_actions where goal_id = old.id)
     or exists (select 1 from public.planner_risks where goal_id = old.id)
     or exists (select 1 from public.planner_kpis where goal_id = old.id)
     or exists (select 1 from public.planner_comments where goal_id = old.id) then
    raise exception 'this goal still holds work: keep it archived' using errcode = 'P0001';
  end if;
  return old;
end $$;
create trigger planner_goal_refuse_delete before delete on public.planner_goals
  for each row execute function private.planner_goal_refuse_delete();

-- A focus area holding goals is archived, never deleted. Archiving requires it to be empty of active goals.
create or replace function private.planner_focus_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.planner_goals where focus_area_id = old.id) then
      raise exception 'archive this focus area instead: it holds goals' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    if new.workspace_id <> old.workspace_id or new.plan_id <> old.plan_id then
      raise exception 'focus area keys cannot change' using errcode = '42501';
    end if;
    if new.archived_at is not null and old.archived_at is null
       and exists (select 1 from public.planner_goals where focus_area_id = old.id and archived_at is null) then
      raise exception 'move or archive its active goals first' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger planner_focus_guard before update or delete on public.planner_focus_areas
  for each row execute function private.planner_focus_guard();

-- Child tables: parent keys are immutable, the owner/assignee must belong to the organization, archived plans are read-only.
create or replace function private.planner_child_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n jsonb := to_jsonb(new); o jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end; pid uuid; g uuid;
begin
  if tg_op = 'UPDATE' and (o ->> 'workspace_id' is distinct from n ->> 'workspace_id'
       or o ->> 'goal_id' is distinct from n ->> 'goal_id' or o ->> 'plan_id' is distinct from n ->> 'plan_id'
       or o ->> 'measure_id' is distinct from n ->> 'measure_id') then
    raise exception 'parent keys cannot change' using errcode = '42501';
  end if;
  if n ->> 'goal_id' is not null then
    g := (n ->> 'goal_id')::uuid;
    select plan_id into pid from public.planner_goals where id = g;
  elsif n ->> 'plan_id' is not null then
    pid := (n ->> 'plan_id')::uuid;
  end if;
  if pid is not null and exists (select 1 from public.planner_plans where id = pid and archived_at is not null) then
    raise exception 'this plan is archived: restore it to change it' using errcode = 'P0001';
  end if;
  -- Provenance is not user-editable: the server stamps time, and who created a record never changes.
  if tg_op = 'INSERT' and tg_table_name in ('planner_updates', 'planner_comments', 'planner_measure_readings') then new.created_at := now(); end if;
  if tg_op = 'UPDATE' and (o ->> 'created_by') is distinct from (n ->> 'created_by') then
    raise exception 'creator cannot change' using errcode = '42501';
  end if;
  if tg_table_name = 'planner_plan_reviews' and tg_op = 'UPDATE' and (o ->> 'status') = 'held' then
    raise exception 'a held review is permanent history' using errcode = '42501';
  end if;
  if tg_table_name = 'planner_kpis' and tg_op = 'UPDATE' and pg_trigger_depth() = 1 and (n ->> 'current_value') is distinct from (o ->> 'current_value') then
    raise exception 'record a reading instead' using errcode = '42501';   -- the value comes from dated readings only
  end if;
  if tg_table_name = 'planner_actions' then
    if not private.planner_is_member((n ->> 'workspace_id')::uuid, nullif(n ->> 'assignee_id', '')::uuid) then
      raise exception 'the assignee must be an active member of this organization' using errcode = '23503';
    end if;
  elsif tg_table_name = 'planner_risks' then
    if not private.planner_is_member((n ->> 'workspace_id')::uuid, nullif(n ->> 'owner_id', '')::uuid) then
      raise exception 'the owner must be an active member of this organization' using errcode = '23503';
    end if;
  end if;
  if tg_table_name = 'planner_actions' then
    if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then new.completed_at := now();
    elsif new.status <> 'done' then new.completed_at := null; end if;
  end if;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['planner_plans', 'planner_values', 'planner_kpis', 'planner_actions', 'planner_risks', 'planner_plan_reviews', 'planner_updates', 'planner_comments', 'planner_measure_readings', 'planner_saved_views'] loop
    execute format('create trigger %1$s_child_guard before insert or update on public.%1$I for each row execute function private.planner_child_guard()', t);
  end loop;
  foreach t in array array['planner_plans', 'planner_values', 'planner_focus_areas', 'planner_kpis', 'planner_actions', 'planner_risks', 'planner_plan_reviews'] loop
    execute format('create trigger %1$s_touch before update on public.%1$I for each row execute function private.touch_updated_at()', t);
  end loop;
end $$;

-- Measures and readings drive derived progress.
create or replace function private.planner_measure_after() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then perform private.planner_recalc(old.goal_id); else perform private.planner_recalc(new.goal_id); end if;
  return null;
end $$;
create trigger planner_measure_after after insert or update or delete on public.planner_kpis
  for each row execute function private.planner_measure_after();
create trigger planner_action_after after insert or update or delete on public.planner_actions
  for each row execute function private.planner_measure_after();   -- same body: recompute the goal this child belongs to

-- A reading becomes the measure's current value when it is the newest by date (ties: the latest entered).
create or replace function private.planner_reading_after() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.planner_kpis m set current_value = new.value
   where m.id = new.measure_id and not exists (
     select 1 from public.planner_measure_readings r
      where r.measure_id = new.measure_id and r.id <> new.id and r.recorded_on > new.recorded_on);
  return null;
end $$;
create trigger planner_reading_after after insert on public.planner_measure_readings
  for each row execute function private.planner_reading_after();

-- Posting an update moves the goal's status (and progress when it is entered by hand).
create or replace function private.planner_update_after() returns trigger
language plpgsql security definer set search_path = '' as $$
declare mode text;
begin
  select progress_mode into mode from public.planner_goals where id = new.goal_id;
  update public.planner_goals
     set status = new.status,
         progress = case when mode = 'manual' and new.progress is not null then new.progress else progress end,
         last_update_at = new.created_at
   where id = new.goal_id;
  return null;
end $$;
create trigger planner_update_after after insert on public.planner_updates
  for each row execute function private.planner_update_after();

-- Updates and readings are immutable evidence: no update or delete, even for the author.
create or replace function private.planner_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'this record is a permanent history entry' using errcode = '42501'; end $$;
create trigger planner_updates_immutable before update or delete on public.planner_updates
  for each row execute function private.planner_immutable();
create trigger planner_readings_immutable before update or delete on public.planner_measure_readings
  for each row execute function private.planner_immutable();

-- ------------------------------------------------------------------ history triggers (append-only, attributable)
create or replace function private.planner_log() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  r jsonb := coalesce(n, o);
  keep text[] := tg_argv; d jsonb := '{}'; k text; act text; pid uuid; gid uuid;
begin
  foreach k in array keep loop
    if (o -> k) is distinct from (n -> k) then d := d || jsonb_build_object(k, jsonb_build_array(o -> k, n -> k)); end if;
  end loop;
  act := case tg_op when 'INSERT' then 'created' when 'DELETE' then 'deleted'
           when 'UPDATE' then case when (o ->> 'archived_at') is null and (n ->> 'archived_at') is not null then 'archived'
                                   when (o ->> 'archived_at') is not null and (n ->> 'archived_at') is null then 'restored'
                                   else 'updated' end end;
  if tg_op = 'UPDATE' and act = 'updated' and d = '{}'::jsonb then return null; end if;
  gid := case when tg_table_name = 'planner_goals' then (r ->> 'id')::uuid else nullif(r ->> 'goal_id', '')::uuid end;
  pid := coalesce(nullif(r ->> 'plan_id', '')::uuid, (select g.plan_id from public.planner_goals g where g.id = gid),
                  case when tg_table_name = 'planner_plans' then (r ->> 'id')::uuid end);
  insert into public.planner_history (workspace_id, plan_id, goal_id, actor_id, entity, entity_id, action, detail)
  values ((r ->> 'workspace_id')::uuid, pid, gid, private.current_user_id(), substr(tg_table_name, 9),
          nullif(r ->> 'id', '')::uuid, act, d);
  return null;
end $$;
create trigger log_planner_plans after insert or update on public.planner_plans
  for each row execute function private.planner_log('name', 'vision', 'review_cadence', 'period_start', 'period_end', 'parent_plan_id', 'archived_at');
create trigger log_planner_focus_areas after insert or update on public.planner_focus_areas
  for each row execute function private.planner_log('name', 'color', 'start_date', 'end_date', 'archived_at');
create trigger log_planner_goals after insert or update or delete on public.planner_goals
  for each row execute function private.planner_log('title', 'owner_id', 'status', 'progress', 'progress_mode', 'priority', 'focus_area_id', 'parent_goal_id',
                                                   'goal_type_id', 'start_date', 'due_date', 'project_id', 'archived_at');
create trigger log_planner_measures after insert or update on public.planner_kpis
  for each row execute function private.planner_log('name', 'target_value', 'start_value', 'direction', 'archived_at');
create trigger log_planner_measure_readings after insert on public.planner_measure_readings
  for each row execute function private.planner_log('value', 'recorded_on');
create trigger log_planner_updates after insert on public.planner_updates
  for each row execute function private.planner_log('status', 'progress', 'confidence');
create trigger log_planner_actions after insert or update on public.planner_actions
  for each row execute function private.planner_log('title', 'assignee_id', 'status', 'due_date', 'archived_at');
create trigger log_planner_risks after insert or update on public.planner_risks
  for each row execute function private.planner_log('title', 'status', 'severity', 'archived_at');
create trigger log_planner_reviews after insert or update on public.planner_plan_reviews
  for each row execute function private.planner_log('title', 'status', 'due_on');

-- Sensitive changes also reach the organization audit log (ownership, archive, plan lifecycle).
create trigger audit_planner_plans after insert or update on public.planner_plans
  for each row execute function private.audit_change('name', 'archived_at');
create trigger audit_planner_goals after update or delete on public.planner_goals
  for each row execute function private.audit_change('owner_id', 'archived_at');

-- ------------------------------------------------------------------ row level security (one engine, per command)
do $$
declare t text;
begin
  foreach t in array array['planner_plans', 'planner_values', 'planner_focus_areas', 'planner_goal_types', 'planner_goals', 'planner_kpis',
    'planner_measure_readings', 'planner_updates', 'planner_actions', 'planner_risks', 'planner_comments', 'planner_plan_reviews',
    'planner_favorites', 'planner_saved_views', 'planner_history', 'planner_type_rules', 'planner_horizons', 'planner_focus_templates', 'planner_strategies', 'planner_strategy_kinds', 'planner_strategy_focus', 'planner_measure_types', 'planner_measure_type_kinds', 'planner_strategy_focus_kinds', 'planner_strategy_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    -- the active organization of the request (x-org-id) bounds every row, as on every other tenant table (0005 org_in_scope)
    execute format($f$create policy org_scope on public.%I as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id))$f$, t);
  end loop;
  -- everything readable needs planner.plan.view
  foreach t in array array['planner_plans', 'planner_values', 'planner_focus_areas', 'planner_goal_types', 'planner_goals', 'planner_kpis',
    'planner_measure_readings', 'planner_updates', 'planner_actions', 'planner_risks', 'planner_comments', 'planner_plan_reviews', 'planner_history', 'planner_type_rules', 'planner_horizons', 'planner_focus_templates', 'planner_strategies', 'planner_strategy_kinds', 'planner_strategy_focus', 'planner_measure_types', 'planner_measure_type_kinds', 'planner_strategy_focus_kinds', 'planner_strategy_items'] loop
    execute format($f$create policy %1$s_select on public.%1$I for select using (private.has_permission(workspace_id, 'planner.plan.view'))$f$, t);
  end loop;
  -- structure: plans, vision/values, focus areas, goal types
  foreach t in array array['planner_values', 'planner_focus_areas', 'planner_goal_types', 'planner_type_rules', 'planner_horizons', 'planner_focus_templates', 'planner_strategies', 'planner_strategy_kinds', 'planner_strategy_focus', 'planner_measure_types', 'planner_measure_type_kinds', 'planner_strategy_focus_kinds', 'planner_strategy_items'] loop
    execute format($f$create policy %1$s_insert on public.%1$I for insert with check (private.planner_can(workspace_id, 'planner.plan.manage'))$f$, t);
    execute format($f$create policy %1$s_update on public.%1$I for update using (private.planner_can(workspace_id, 'planner.plan.manage'))
      with check (private.planner_can(workspace_id, 'planner.plan.manage'))$f$, t);
    execute format($f$create policy %1$s_delete on public.%1$I for delete using (private.planner_can(workspace_id, 'planner.plan.manage'))$f$, t);
  end loop;
  -- children of a goal
  foreach t in array array['planner_actions', 'planner_risks'] loop
    execute format($f$create policy %1$s_insert on public.%1$I for insert with check (private.planner_can(workspace_id, 'planner.action.manage') and created_by = private.current_user_id())$f$, t);
    execute format($f$create policy %1$s_update on public.%1$I for update using (private.planner_can(workspace_id, 'planner.action.manage'))
      with check (private.planner_can(workspace_id, 'planner.action.manage'))$f$, t);
  end loop;
end $$;
create policy planner_plans_insert on public.planner_plans for insert with check (
  private.planner_can(workspace_id, 'planner.plan.manage') and created_by = private.current_user_id());
create policy planner_plans_update on public.planner_plans for update
  using (private.planner_can(workspace_id, 'planner.plan.manage'))
  with check (private.planner_can(workspace_id, 'planner.plan.manage'));
-- no plan delete policy: plans are archived (ER2)
create policy planner_goals_insert on public.planner_goals for insert with check (
  private.planner_can(workspace_id, 'planner.goal.create') and created_by = private.current_user_id());
create policy planner_goals_update on public.planner_goals for update
  using (private.planner_can(workspace_id, 'planner.goal.edit')
         or (owner_id = private.current_user_id() and private.planner_can(workspace_id, 'planner.update.post'))
         or private.planner_can(workspace_id, 'planner.goal.archive'))
  with check (private.planner_can(workspace_id, 'planner.goal.edit')
         or (owner_id = private.current_user_id() and private.planner_can(workspace_id, 'planner.update.post'))
         or private.planner_can(workspace_id, 'planner.goal.archive'));
create policy planner_goals_delete on public.planner_goals for delete using (private.planner_can(workspace_id, 'planner.goal.delete'));
create policy planner_measures_insert on public.planner_kpis for insert with check (private.planner_can(workspace_id, 'planner.measure.edit'));
create policy planner_measures_update on public.planner_kpis for update using (private.planner_can(workspace_id, 'planner.measure.edit'))
  with check (private.planner_can(workspace_id, 'planner.measure.edit'));
-- Reporting on a goal is for its owner or anyone who may edit goals / measures (others comment instead).
create policy planner_readings_insert on public.planner_measure_readings for insert with check (
  private.planner_can(workspace_id, 'planner.update.post') and recorded_by = private.current_user_id()
  and (private.has_permission(workspace_id, 'planner.measure.edit') or exists (
        select 1 from public.planner_kpis m join public.planner_goals g on g.id = m.goal_id
         where m.id = measure_id and g.owner_id = private.current_user_id())));
create policy planner_updates_insert on public.planner_updates for insert with check (
  private.planner_can(workspace_id, 'planner.update.post') and author_id = private.current_user_id()
  and (private.has_permission(workspace_id, 'planner.goal.edit') or exists (
        select 1 from public.planner_goals g where g.id = goal_id and g.owner_id = private.current_user_id())));
create policy planner_comments_insert on public.planner_comments for insert with check (
  private.planner_can(workspace_id, 'planner.comment.create') and author_id = private.current_user_id());
create policy planner_comments_update on public.planner_comments for update
  using (author_id = private.current_user_id() and private.planner_can(workspace_id, 'planner.comment.create'))
  with check (author_id = private.current_user_id() and private.planner_can(workspace_id, 'planner.comment.create'));
create policy planner_comments_delete on public.planner_comments for delete using (
  (author_id = private.current_user_id() and private.planner_can(workspace_id, 'planner.comment.create'))
  or private.planner_can(workspace_id, 'planner.plan.manage'));
create policy planner_reviews_insert on public.planner_plan_reviews for insert with check (
  private.planner_can(workspace_id, 'planner.review.manage') and created_by = private.current_user_id());
create policy planner_reviews_update on public.planner_plan_reviews for update using (private.planner_can(workspace_id, 'planner.review.manage'))
  with check (private.planner_can(workspace_id, 'planner.review.manage'));
-- per-user records
create policy planner_fav_select on public.planner_favorites for select using (
  user_id = private.current_user_id() and private.has_permission(workspace_id, 'planner.plan.view'));
create policy planner_fav_insert on public.planner_favorites for insert with check (
  user_id = private.current_user_id() and private.has_permission(workspace_id, 'planner.plan.view'));
create policy planner_fav_delete on public.planner_favorites for delete using (user_id = private.current_user_id());
create policy planner_views_select on public.planner_saved_views for select using (
  owner_id = private.current_user_id() and private.has_permission(workspace_id, 'planner.plan.view'));
create policy planner_views_insert on public.planner_saved_views for insert with check (
  owner_id = private.current_user_id() and private.has_permission(workspace_id, 'planner.plan.view'));
create policy planner_views_update on public.planner_saved_views for update using (owner_id = private.current_user_id())
  with check (owner_id = private.current_user_id() and private.has_permission(workspace_id, 'planner.plan.view'));
create policy planner_views_delete on public.planner_saved_views for delete using (owner_id = private.current_user_id());

-- ------------------------------------------------------------------ starter goal types and access levels per organization
create or replace function private.seed_planner(ws uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare lvl uuid;
begin
  insert into public.planner_goal_types (workspace_id, name, uses_measure, position) values
    (ws, 'Objective', false, 1), (ws, 'Initiative', false, 2)
  on conflict do nothing;
  insert into public.planner_horizons (workspace_id, title, start_date, end_date)
  select ws, h.title, h.s, h.e from (
    select 'Q' || q || ' ' || y as title, make_date(y, (q - 1) * 3 + 1, 1) as s, (make_date(y, q * 3, 1) + interval '1 month - 1 day')::date as e
      from generate_series(extract(year from current_date)::int - 1, extract(year from current_date)::int + 1) y, generate_series(1, 4) q
    union all select 'Year ' || y, make_date(y, 1, 1), make_date(y, 12, 31)
      from generate_series(extract(year from current_date)::int - 1, extract(year from current_date)::int + 1) y) h
  on conflict do nothing;
  insert into public.access_levels (workspace_id, app_key, name, description, is_template)
  values (ws, 'planner', 'Strategy lead', 'Run the plan: structure, goals, reviews and everything below', true) returning id into lvl;
  insert into public.access_level_permissions (workspace_id, access_level_id, permission_key)
  select ws, lvl, k from unnest(array['planner.plan.view', 'planner.plan.manage', 'planner.goal.create', 'planner.goal.edit', 'planner.goal.archive',
    'planner.update.post', 'planner.measure.edit', 'planner.action.manage', 'planner.review.manage', 'planner.comment.create']) k;
  insert into public.access_levels (workspace_id, app_key, name, description, is_template)
  values (ws, 'planner', 'Contributor', 'Add goals, post updates, manage actions and comment; cannot change plan structure', true) returning id into lvl;
  insert into public.access_level_permissions (workspace_id, access_level_id, permission_key)
  select ws, lvl, k from unnest(array['planner.plan.view', 'planner.goal.create', 'planner.update.post', 'planner.measure.edit', 'planner.action.manage', 'planner.comment.create']) k;
  insert into public.access_levels (workspace_id, app_key, name, description, is_template)
  values (ws, 'planner', 'Viewer', 'See plans, goals and reviews; change nothing', true) returning id into lvl;
  insert into public.access_level_permissions (workspace_id, access_level_id, permission_key) values (ws, lvl, 'planner.plan.view');
end $$;
create or replace function private.workspace_seed_planner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin perform private.seed_planner(new.id); return new; end $$;
create trigger workspaces_seed_planner after insert on public.workspaces
  for each row execute function private.workspace_seed_planner();
select private.seed_planner(id) from public.workspaces;

-- ------------------------------------------------------------------ grants (history and readings are never changed by app roles)
grant select, insert, update, delete on public.planner_plans, public.planner_values, public.planner_focus_areas, public.planner_goal_types,
  public.planner_goals, public.planner_kpis, public.planner_actions, public.planner_risks, public.planner_comments, public.planner_plan_reviews,
  public.planner_favorites, public.planner_saved_views, public.planner_type_rules, public.planner_horizons, public.planner_focus_templates, public.planner_strategies, public.planner_strategy_kinds, public.planner_strategy_focus, public.planner_measure_types, public.planner_measure_type_kinds, public.planner_strategy_focus_kinds, public.planner_strategy_items to app_user;
grant select, insert on public.planner_measure_readings, public.planner_updates to app_user;
grant select on public.planner_history to app_user;
revoke delete on public.planner_plans from app_user;
revoke all on all functions in schema private from public;
do $$ declare f record; begin for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname like 'planner\_%' loop execute format('grant execute on function %s to app_user', f.sig); end loop; end $$;   -- only this app's helpers (not every private function)
do $$
begin
  -- no grants to the browser roles: in this repository every call goes through the server API (migration 0010 lockdown)
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.planner_plans, public.planner_values, public.planner_focus_areas, public.planner_goal_types, public.planner_goals,
      public.planner_kpis, public.planner_measure_readings, public.planner_updates, public.planner_actions, public.planner_risks,
      public.planner_comments, public.planner_plan_reviews, public.planner_favorites, public.planner_saved_views, public.planner_history, public.planner_type_rules, public.planner_horizons, public.planner_focus_templates, public.planner_strategies, public.planner_strategy_kinds, public.planner_strategy_focus, public.planner_measure_types, public.planner_measure_type_kinds, public.planner_strategy_focus_kinds, public.planner_strategy_items from anon;
  end if;
end $$;


-- ==================================================================== API (was 0006_planner_api.sql)
set check_function_bodies = off;
-- 0006 Â· Planner API. Every function is SECURITY INVOKER: the caller's identity and row-level policies decide what is
-- visible or writable, so the Supabase client (rpc) and the local engine behave identically. A row the caller cannot see
-- or change is reported as "not found" (errcode 42501 -> public "not_found"); invalid input is P0001/23xxx -> "invalid".
-- Writes accept a jsonb document and only change the keys that are present.

create or replace function private.planner_deny() returns void language plpgsql set search_path = '' as $$
begin raise exception 'not found' using errcode = '42501'; end $$;

create or replace function private.planner_uuid(d jsonb, k text) returns uuid language sql immutable set search_path = '' as $$
  select nullif(d ->> k, '')::uuid $$;
create or replace function private.planner_date(d jsonb, k text) returns date language sql immutable set search_path = '' as $$
  select nullif(d ->> k, '')::date $$;

-- ------------------------------------------------------------------ reads
create or replace function public.planner_members(p_workspace uuid) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id,
           'name', coalesce(nullif(btrim(p.display_name), ''), 'Member ' || left(m.user_id::text, 4)), 'role', m.role)
           order by coalesce(nullif(btrim(p.display_name), ''), 'zzz'), m.user_id), '[]'::jsonb)
  from public.memberships m left join public.profiles p on p.id = m.user_id
  where m.workspace_id = p_workspace and m.kind = 'staff' and m.status = 'active'
    and private.has_permission(p_workspace, 'planner.plan.view')
    and private.permission_decision(p_workspace, m.user_id, 'planner.plan.view') like 'allow:%'   -- only people who can actually use Planner can be offered as owners
$$;

create or replace function public.planner_my_access(p_workspace uuid) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_object_agg(replace(p.key, 'planner.', ''), private.has_permission(p_workspace, p.key)), '{}'::jsonb)
  from public.permissions p where p.app_key = 'planner'
$$;

-- Plan progress = weight-averaged progress of its active top-level goals.
create or replace function private.planner_plan_progress(p_plan uuid) returns numeric
language sql stable set search_path = '' as $$
  select coalesce(round(sum(g.progress * g.weight) / nullif(sum(g.weight), 0), 1), 0)
    from public.planner_goals g where g.plan_id = p_plan and g.parent_goal_id is null and g.archived_at is null
$$;

create or replace function public.planner_list_plans(p_workspace uuid, p_include_archived boolean default false) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(x order by (x ->> 'favorite')::boolean desc, x ->> 'name'), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', pl.id, 'name', pl.name, 'description', pl.description, 'parent_plan_id', pl.parent_plan_id,
      'owner_name', (select coalesce(nullif(btrim(p.display_name), ''), 'Member ' || left(pl.created_by::text, 4)) from public.profiles p where p.id = pl.created_by), 'period_start', pl.period_start, 'period_end', pl.period_end,
      'review_cadence', pl.review_cadence, 'archived_at', pl.archived_at, 'updated_at', pl.updated_at, 'strategy_id', pl.strategy_id,
      'favorite', exists (select 1 from public.planner_favorites f where f.plan_id = pl.id and f.user_id = private.current_user_id()),
      'progress', private.planner_plan_progress(pl.id),
      'goal_count', (select count(*) from public.planner_goals g where g.plan_id = pl.id and g.archived_at is null),
      'focus_area_count', (select count(*) from public.planner_focus_areas f where f.plan_id = pl.id and f.archived_at is null),
      'open_risks', (select count(*) from public.planner_risks r join public.planner_goals g on g.id = r.goal_id where g.plan_id = pl.id and g.archived_at is null and r.archived_at is null and r.status <> 'closed'),
      'status_counts', (select coalesce(jsonb_object_agg(s, c), '{}'::jsonb) from (
          select g.status s, count(*) c from public.planner_goals g where g.plan_id = pl.id and g.archived_at is null group by g.status) q),
      'next_review', (select min(r.due_on) from public.planner_plan_reviews r where r.plan_id = pl.id and r.status = 'scheduled'),
      'overdue_reviews', (select count(*) from public.planner_plan_reviews r where r.plan_id = pl.id and r.status = 'scheduled' and r.due_on < current_date)
    ) x
    from public.planner_plans pl
    where pl.workspace_id = p_workspace and (p_include_archived or pl.archived_at is null)
  ) t
$$;

create or replace function private.planner_goal_row(g public.planner_goals) returns jsonb
language sql stable set search_path = '' as $$
  select to_jsonb(g) - 'created_by' || jsonb_build_object(
    'owner_name', (select coalesce(nullif(btrim(p.display_name), ''), 'Member ' || left(g.owner_id::text, 4)) from public.profiles p where p.id = g.owner_id),
    'type_name', (select t.name from public.planner_goal_types t where t.id = g.goal_type_id),
    'uses_measure', (select t.uses_measure from public.planner_goal_types t where t.id = g.goal_type_id),
    'child_count', (select count(*) from public.planner_goals c where c.parent_goal_id = g.id and c.archived_at is null),
    'open_actions', (select count(*) from public.planner_actions a where a.goal_id = g.id and a.archived_at is null and a.status <> 'done'),
    'total_actions', (select count(*) from public.planner_actions a where a.goal_id = g.id and a.archived_at is null),
    'open_risks', (select count(*) from public.planner_risks r where r.goal_id = g.id and r.archived_at is null and r.status <> 'closed'),
    'max_risk', (select max(r.severity) from public.planner_risks r where r.goal_id = g.id and r.archived_at is null and r.status <> 'closed'),
    'measure', (select jsonb_build_object('id', m.id, 'name', m.name, 'unit', m.unit, 'current', m.current_value, 'target', m.target_value,
                                           'start', m.start_value, 'direction', m.direction)
                  from public.planner_kpis m where m.goal_id = g.id and m.archived_at is null order by m.created_at limit 1),
    'project', (select jsonb_build_object('id', pr.id, 'name', pr.name) from public.projects pr where pr.id = g.project_id),
    'project_restricted', g.project_id is not null and not exists (select 1 from public.projects pr where pr.id = g.project_id)
  )
$$;

create or replace function public.planner_get_plan(p_plan uuid) returns jsonb
language plpgsql stable set search_path = '' as $$
declare pl public.planner_plans; res jsonb;
begin
  select * into pl from public.planner_plans where id = p_plan;
  if pl.id is null then return null; end if;
  res := jsonb_build_object(
    'plan', to_jsonb(pl) - 'created_by' || jsonb_build_object('progress', private.planner_plan_progress(pl.id),
        'favorite', exists (select 1 from public.planner_favorites f where f.plan_id = pl.id and f.user_id = private.current_user_id())),
    'values', (select coalesce(jsonb_agg(to_jsonb(v) order by v.position, v.created_at), '[]') from public.planner_values v where v.plan_id = pl.id),
    'focus_areas', (select coalesce(jsonb_agg(to_jsonb(f) order by f.position, f.created_at), '[]') from public.planner_focus_areas f where f.plan_id = pl.id),
    'goal_types', (select coalesce(jsonb_agg(to_jsonb(t) order by t.position, t.name), '[]') from public.planner_goal_types t where t.workspace_id = pl.workspace_id),
    'goals', (select coalesce(jsonb_agg(private.planner_goal_row(g) order by g.position, g.created_at), '[]') from public.planner_goals g where g.plan_id = pl.id),
    'reviews', (select coalesce(jsonb_agg(to_jsonb(r) - 'snapshot' - 'created_by' order by r.due_on desc), '[]') from public.planner_plan_reviews r where r.plan_id = pl.id),
    'rules', (select coalesce(jsonb_agg(jsonb_build_object('parent_type_id', r.parent_type_id, 'child_type_id', r.child_type_id)), '[]') from public.planner_type_rules r where r.workspace_id = pl.workspace_id),
    'strategy', (select jsonb_build_object('id', s.id, 'name', s.name, 'kind_ids', (select coalesce(jsonb_agg(k.goal_type_id), '[]') from public.planner_strategy_kinds k where k.strategy_id = s.id), 'focus_kinds', (select coalesce(jsonb_object_agg(q.template_id, q.ids), '{}') from (select fk.template_id, jsonb_agg(fk.goal_type_id) ids from public.planner_strategy_focus_kinds fk where fk.strategy_id = s.id group by fk.template_id) q))
                   from public.planner_strategies s where s.id = pl.strategy_id),
    'measure_types', (select coalesce(jsonb_agg(jsonb_build_object('id', mt.id, 'name', mt.name, 'unit', mt.unit, 'direction', mt.direction,
                        'kind_ids', (select coalesce(jsonb_agg(k.goal_type_id), '[]') from public.planner_measure_type_kinds k where k.measure_type_id = mt.id)) order by mt.position, mt.name), '[]')
                        from public.planner_measure_types mt where mt.workspace_id = pl.workspace_id));
  return res;
end $$;

create or replace function public.planner_get_goal(p_goal uuid) returns jsonb
language plpgsql stable set search_path = '' as $$
declare g public.planner_goals; res jsonb;
begin
  select * into g from public.planner_goals where id = p_goal;
  if g.id is null then return null; end if;
  res := jsonb_build_object(
    'goal', private.planner_goal_row(g),
    'plan', (select jsonb_build_object('id', pl.id, 'name', pl.name, 'archived_at', pl.archived_at) from public.planner_plans pl where pl.id = g.plan_id),
    'focus_area', (select jsonb_build_object('id', f.id, 'name', f.name, 'color', f.color) from public.planner_focus_areas f where f.id = g.focus_area_id),
    'breadcrumb', (with recursive up as (
        select id, parent_goal_id, title, 0 depth from public.planner_goals where id = g.parent_goal_id
        union all select p.id, p.parent_goal_id, p.title, up.depth + 1 from public.planner_goals p join up on p.id = up.parent_goal_id)
      select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title) order by depth desc), '[]') from up),
    'children', (select coalesce(jsonb_agg(private.planner_goal_row(c) order by c.position, c.created_at), '[]')
                   from public.planner_goals c where c.parent_goal_id = g.id),
    'measures', (select coalesce(jsonb_agg(to_jsonb(m) || jsonb_build_object('progress', private.planner_measure_progress(m),
        'readings', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'value', r.value, 'recorded_on', r.recorded_on, 'note', r.note) order by r.recorded_on, r.created_at), '[]')
                       from (select * from public.planner_measure_readings rr where rr.measure_id = m.id order by rr.recorded_on desc, rr.created_at desc limit 24) r)) order by m.created_at), '[]')
                   from public.planner_kpis m where m.goal_id = g.id),
    'updates', (select coalesce(jsonb_agg(to_jsonb(u) || jsonb_build_object('author_name',
        (select coalesce(nullif(btrim(p.display_name), ''), 'Member ' || left(u.author_id::text, 4)) from public.profiles p where p.id = u.author_id)) order by u.created_at desc), '[]')
                  from public.planner_updates u where u.goal_id = g.id),
    'actions', (select coalesce(jsonb_agg(to_jsonb(a) - 'created_by' || jsonb_build_object('assignee_name',
        (select coalesce(nullif(btrim(p.display_name), ''), 'Member ' || left(a.assignee_id::text, 4)) from public.profiles p where p.id = a.assignee_id)) order by a.position, a.created_at), '[]')
                  from public.planner_actions a where a.goal_id = g.id),
    'risks', (select coalesce(jsonb_agg(to_jsonb(r) - 'created_by' || jsonb_build_object('owner_name',
        (select coalesce(nullif(btrim(p.display_name), ''), 'Member ' || left(r.owner_id::text, 4)) from public.profiles p where p.id = r.owner_id)) order by r.severity desc, r.created_at), '[]')
                  from public.planner_risks r where r.goal_id = g.id),
    'comments', (select coalesce(jsonb_agg(to_jsonb(c) || jsonb_build_object('author_name',
        (select coalesce(nullif(btrim(p.display_name), ''), 'Member ' || left(c.author_id::text, 4)) from public.profiles p where p.id = c.author_id)) order by c.created_at), '[]')
                  from public.planner_comments c where c.goal_id = g.id),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'entity', h.entity, 'action', h.action, 'detail', h.detail,
        'created_at', h.created_at, 'actor_name', (select coalesce(nullif(btrim(p.display_name), ''), 'Member ' || left(h.actor_id::text, 4)) from public.profiles p where p.id = h.actor_id)) order by h.id desc), '[]')
                  from (select * from public.planner_history hh where hh.goal_id = g.id order by hh.id desc limit 60) h));
  return res;
end $$;

create or replace function public.planner_my_work(p_workspace uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'goals', (select coalesce(jsonb_agg(private.planner_goal_row(g) || jsonb_build_object('plan_name', pl.name) order by g.due_date nulls last, g.title), '[]')
                from public.planner_goals g join public.planner_plans pl on pl.id = g.plan_id
               where g.workspace_id = p_workspace and g.owner_id = private.current_user_id() and g.archived_at is null and pl.archived_at is null),
    'actions', (select coalesce(jsonb_agg(to_jsonb(a) - 'created_by' || jsonb_build_object('goal_title', g.title, 'goal_id', g.id, 'plan_id', pl.id, 'plan_name', pl.name)
                  order by a.due_date nulls last, a.created_at), '[]')
                from public.planner_actions a join public.planner_goals g on g.id = a.goal_id join public.planner_plans pl on pl.id = g.plan_id
               where a.workspace_id = p_workspace and a.assignee_id = private.current_user_id() and a.archived_at is null and pl.archived_at is null))
$$;

create or replace function public.planner_search(p_workspace uuid, p_query text) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(r), '[]') from (
    select jsonb_build_object('kind', 'goal', 'id', g.id, 'title', g.title, 'plan_id', g.plan_id, 'plan_name', pl.name, 'status', g.status, 'archived', g.archived_at is not null) r
      from public.planner_goals g join public.planner_plans pl on pl.id = g.plan_id
     where g.workspace_id = p_workspace and char_length(btrim(coalesce(p_query, ''))) >= 2
       and (g.title ilike '%' || replace(replace(btrim(p_query), '%', ''), '_', '') || '%' or g.description ilike '%' || replace(replace(btrim(p_query), '%', ''), '_', '') || '%')
     order by g.archived_at nulls first, g.updated_at desc limit 30) q
$$;

create or replace function public.planner_get_review(p_review uuid) returns jsonb
language sql stable set search_path = '' as $$
  select to_jsonb(r) - 'created_by' from public.planner_plan_reviews r where r.id = p_review
$$;

create or replace function public.planner_list_views(p_plan uuid) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'config', v.config) order by v.name), '[]')
    from public.planner_saved_views v where v.plan_id = p_plan and v.owner_id = private.current_user_id()
$$;

-- ------------------------------------------------------------------ writes: structure
create or replace function public.planner_save_plan(p_workspace uuid, p_id uuid, p_data jsonb, p_expected timestamptz default null) returns jsonb
language plpgsql set search_path = '' as $$
declare r jsonb; cur public.planner_plans;
begin
  if p_id is null then
    insert into public.planner_plans (workspace_id, name, description, vision, period_start, period_end, review_cadence, parent_plan_id, strategy_id, created_by)
    values (p_workspace, p_data ->> 'name', p_data ->> 'description', p_data ->> 'vision', private.planner_date(p_data, 'period_start'),
            private.planner_date(p_data, 'period_end'), coalesce(p_data ->> 'review_cadence', 'monthly'), private.planner_uuid(p_data, 'parent_plan_id'), private.planner_uuid(p_data, 'strategy_id'), private.current_user_id())
    returning to_jsonb(planner_plans) - 'created_by' into r;
    if (r ->> 'strategy_id') is not null then   -- a plan built from a strategy starts with that strategy's focus areas
      insert into public.planner_focus_areas (workspace_id, plan_id, name, description, color, position, template_id)
      select p_workspace, (r ->> 'id')::uuid, ft.name, ft.description, ft.color, (row_number() over (order by sf.position, ft.name) - 1)::int, ft.id
        from public.planner_strategy_focus sf join public.planner_focus_templates ft on ft.id = sf.template_id
       where sf.strategy_id = (r ->> 'strategy_id')::uuid;
      perform private.planner_copy_strategy_items((r ->> 'strategy_id')::uuid, (r ->> 'id')::uuid);
    end if;
  else
    select * into cur from public.planner_plans where id = p_id and workspace_id = p_workspace;
    if cur.id is null then perform private.planner_deny(); end if;
    if p_expected is not null and cur.updated_at <> p_expected then raise exception 'changed by someone else' using errcode = '40001'; end if;
    update public.planner_plans set
      name = case when p_data ? 'name' then p_data ->> 'name' else name end,
      description = case when p_data ? 'description' then p_data ->> 'description' else description end,
      vision = case when p_data ? 'vision' then p_data ->> 'vision' else vision end,
      period_start = case when p_data ? 'period_start' then private.planner_date(p_data, 'period_start') else period_start end,
      period_end = case when p_data ? 'period_end' then private.planner_date(p_data, 'period_end') else period_end end,
      review_cadence = case when p_data ? 'review_cadence' then p_data ->> 'review_cadence' else review_cadence end,
      parent_plan_id = case when p_data ? 'parent_plan_id' then private.planner_uuid(p_data, 'parent_plan_id') else parent_plan_id end
    where id = p_id returning to_jsonb(planner_plans) - 'created_by' into r;
    if r is null then perform private.planner_deny(); end if;
  end if;
  return r;
end $$;

create or replace function public.planner_set_plan_archived(p_plan uuid, p_archived boolean) returns jsonb
language plpgsql set search_path = '' as $$
declare r jsonb;
begin
  update public.planner_plans set archived_at = case when p_archived then coalesce(archived_at, now()) else null end
   where id = p_plan returning to_jsonb(planner_plans) - 'created_by' into r;
  if r is null then perform private.planner_deny(); end if;
  return r;
end $$;

create or replace function public.planner_save_value(p_plan uuid, p_id uuid, p_data jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare r jsonb; ws uuid;
begin
  if p_id is null then
    select workspace_id into ws from public.planner_plans where id = p_plan;
    if ws is null then perform private.planner_deny(); end if;
    insert into public.planner_values (workspace_id, plan_id, name, description, position)
    values (ws, p_plan, p_data ->> 'name', p_data ->> 'description',
            coalesce((select max(position) + 1 from public.planner_values where plan_id = p_plan), 0)) returning to_jsonb(planner_values) into r;
  else
    update public.planner_values set name = case when p_data ? 'name' then p_data ->> 'name' else name end,
      description = case when p_data ? 'description' then p_data ->> 'description' else description end
     where id = p_id returning to_jsonb(planner_values) into r;
    if r is null then perform private.planner_deny(); end if;
  end if;
  return r;
end $$;

create or replace function public.planner_delete_value(p_id uuid) returns void
language plpgsql set search_path = '' as $$
declare n int;
begin
  if exists (select 1 from public.planner_goals where value_id = p_id) then
    raise exception 'this value is linked to goals: unlink them first' using errcode = 'P0001';
  end if;
  delete from public.planner_values where id = p_id; get diagnostics n = row_count;
  if n = 0 then perform private.planner_deny(); end if;
end $$;

create or replace function public.planner_save_focus_area(p_plan uuid, p_id uuid, p_data jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare r jsonb; ws uuid;
begin
  if p_id is null then
    select workspace_id into ws from public.planner_plans where id = p_plan;
    if ws is null then perform private.planner_deny(); end if;
    insert into public.planner_focus_areas (workspace_id, plan_id, name, description, color, start_date, end_date, template_id, position)
    values (ws, p_plan, p_data ->> 'name', p_data ->> 'description', coalesce(p_data ->> 'color', 'blue'), private.planner_date(p_data, 'start_date'), private.planner_date(p_data, 'end_date'), private.planner_uuid(p_data, 'template_id'),
            coalesce((select max(position) + 1 from public.planner_focus_areas where plan_id = p_plan), 0)) returning to_jsonb(planner_focus_areas) into r;
  else
    update public.planner_focus_areas set
      name = case when p_data ? 'name' then p_data ->> 'name' else name end,
      description = case when p_data ? 'description' then p_data ->> 'description' else description end,
      color = case when p_data ? 'color' then p_data ->> 'color' else color end,
      start_date = case when p_data ? 'start_date' then private.planner_date(p_data, 'start_date') else start_date end,
      end_date = case when p_data ? 'end_date' then private.planner_date(p_data, 'end_date') else end_date end
     where id = p_id returning to_jsonb(planner_focus_areas) into r;
    if r is null then perform private.planner_deny(); end if;
  end if;
  return r;
end $$;

create or replace function public.planner_set_focus_archived(p_id uuid, p_archived boolean) returns jsonb
language plpgsql set search_path = '' as $$
declare r jsonb;
begin
  update public.planner_focus_areas set archived_at = case when p_archived then coalesce(archived_at, now()) else null end
   where id = p_id returning to_jsonb(planner_focus_areas) into r;
  if r is null then perform private.planner_deny(); end if;
  return r;
end $$;

-- Reorders focus areas, values or goals to match the given id order.
create or replace function public.planner_reorder(p_entity text, p_ids uuid[]) returns void
language plpgsql set search_path = '' as $$
declare i int := 0; v_id uuid; n int; total int := 0;
begin
  if p_entity not in ('focus_areas', 'values', 'goals', 'actions') then raise exception 'unknown list' using errcode = 'P0001'; end if;
  foreach v_id in array coalesce(p_ids, '{}') loop
    if p_entity = 'focus_areas' then update public.planner_focus_areas set position = i where planner_focus_areas.id = v_id;
    elsif p_entity = 'values' then update public.planner_values set position = i where planner_values.id = v_id;
    elsif p_entity = 'goals' then update public.planner_goals set position = i where planner_goals.id = v_id;
    else update public.planner_actions set position = i where planner_actions.id = v_id; end if;
    get diagnostics n = row_count; total := total + n; i := i + 1;
  end loop;
  if total <> coalesce(cardinality(p_ids), 0) then perform private.planner_deny(); end if;
end $$;

create or replace function public.planner_save_goal_type(p_workspace uuid, p_id uuid, p_data jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare r jsonb;
begin
  if p_id is null then
    insert into public.planner_goal_types (workspace_id, name, uses_measure, position)
    values (p_workspace, p_data ->> 'name', coalesce((p_data ->> 'uses_measure')::boolean, false),
            coalesce((select max(position) + 1 from public.planner_goal_types where workspace_id = p_workspace), 0)) returning to_jsonb(planner_goal_types) into r;
  else
    update public.planner_goal_types set name = case when p_data ? 'name' then p_data ->> 'name' else name end,
      uses_measure = case when p_data ? 'uses_measure' then (p_data ->> 'uses_measure')::boolean else uses_measure end
     where id = p_id and workspace_id = p_workspace returning to_jsonb(planner_goal_types) into r;
    if r is null then perform private.planner_deny(); end if;
  end if;
  return r;
end $$;

create or replace function public.planner_delete_goal_type(p_id uuid) returns void
language plpgsql set search_path = '' as $$
declare n int;
begin
  if exists (select 1 from public.planner_goals where goal_type_id = p_id) then
    raise exception 'this type is in use: it cannot be deleted' using errcode = 'P0001';
  end if;
  delete from public.planner_goal_types where id = p_id; get diagnostics n = row_count;
  if n = 0 then perform private.planner_deny(); end if;
end $$;

-- ------------------------------------------------------------------ writes: goals
create or replace function public.planner_save_goal(p_plan uuid, p_id uuid, p_data jsonb, p_expected timestamptz default null) returns jsonb
language plpgsql set search_path = '' as $$
declare r public.planner_goals; ws uuid; fa uuid; ty uuid; par uuid; cur public.planner_goals; arch timestamptz;
begin
  if p_id is null then
    select workspace_id, archived_at into ws, arch from public.planner_plans where id = p_plan;
    if ws is null then perform private.planner_deny(); end if;
    par := private.planner_uuid(p_data, 'parent_goal_id');
    fa := private.planner_uuid(p_data, 'focus_area_id');
    if par is not null then select focus_area_id into fa from public.planner_goals where id = par; end if;
    if fa is null then select id into fa from public.planner_focus_areas where plan_id = p_plan and archived_at is null order by position, created_at limit 1; end if;
    if fa is null then raise exception 'add a focus area first' using errcode = 'P0001'; end if;
    ty := private.planner_uuid(p_data, 'goal_type_id');
    if ty is null then select id into ty from public.planner_goal_types where workspace_id = ws order by position, name limit 1; end if;
    insert into public.planner_goals (workspace_id, plan_id, focus_area_id, parent_goal_id, goal_type_id, title, description, owner_id, status, progress,
        progress_mode, priority, weight, start_date, due_date, project_id, value_id, tags, update_cadence, position, created_by)
    values (ws, p_plan, fa, par, ty, p_data ->> 'title', p_data ->> 'description', private.planner_uuid(p_data, 'owner_id'),
        coalesce(p_data ->> 'status', 'not_started'), coalesce((p_data ->> 'progress')::numeric, 0), coalesce(p_data ->> 'progress_mode', 'manual'),
        coalesce(p_data ->> 'priority', 'medium'), coalesce((p_data ->> 'weight')::int, 1), private.planner_date(p_data, 'start_date'),
        private.planner_date(p_data, 'due_date'), private.planner_uuid(p_data, 'project_id'), private.planner_uuid(p_data, 'value_id'),
        coalesce(array(select jsonb_array_elements_text(p_data -> 'tags')), '{}'), coalesce(p_data ->> 'update_cadence', 'none'),
        coalesce((select max(position) + 1 from public.planner_goals where plan_id = p_plan and parent_goal_id is not distinct from par and focus_area_id = fa), 0),
        private.current_user_id())
    returning * into r;
  else
    select * into cur from public.planner_goals where id = p_id;
    if cur.id is null then perform private.planner_deny(); end if;
    if p_expected is not null and cur.updated_at <> p_expected then raise exception 'changed by someone else' using errcode = '40001'; end if;
    update public.planner_goals set
      title = case when p_data ? 'title' then p_data ->> 'title' else title end,
      description = case when p_data ? 'description' then p_data ->> 'description' else description end,
      goal_type_id = case when p_data ? 'goal_type_id' then private.planner_uuid(p_data, 'goal_type_id') else goal_type_id end,
      owner_id = case when p_data ? 'owner_id' then private.planner_uuid(p_data, 'owner_id') else owner_id end,
      status = case when p_data ? 'status' then p_data ->> 'status' else status end,
      progress = case when p_data ? 'progress' then (p_data ->> 'progress')::numeric else progress end,
      progress_mode = case when p_data ? 'progress_mode' then p_data ->> 'progress_mode' else progress_mode end,
      priority = case when p_data ? 'priority' then p_data ->> 'priority' else priority end,
      weight = case when p_data ? 'weight' then (p_data ->> 'weight')::int else weight end,
      start_date = case when p_data ? 'start_date' then private.planner_date(p_data, 'start_date') else start_date end,
      due_date = case when p_data ? 'due_date' then private.planner_date(p_data, 'due_date') else due_date end,
      project_id = case when p_data ? 'project_id' then private.planner_uuid(p_data, 'project_id') else project_id end,
      value_id = case when p_data ? 'value_id' then private.planner_uuid(p_data, 'value_id') else value_id end,
      tags = case when p_data ? 'tags' then coalesce(array(select jsonb_array_elements_text(p_data -> 'tags')), '{}') else tags end,
      update_cadence = case when p_data ? 'update_cadence' then p_data ->> 'update_cadence' else update_cadence end
     where id = p_id returning * into r;
    if r.id is null then perform private.planner_deny(); end if;
  end if;
  return private.planner_goal_row(r);
end $$;

-- Re-align a goal: new focus area and/or parent, then set the order of its new siblings (drag and drop).
create or replace function public.planner_move_goal(p_goal uuid, p_focus uuid, p_parent uuid, p_siblings uuid[] default '{}') returns jsonb
language plpgsql set search_path = '' as $$
declare r public.planner_goals; fa uuid := p_focus;
begin
  if p_parent is not null then select focus_area_id into fa from public.planner_goals where id = p_parent; end if;
  if fa is null then perform private.planner_deny(); end if;
  update public.planner_goals set focus_area_id = fa, parent_goal_id = p_parent where id = p_goal returning * into r;
  if r.id is null then perform private.planner_deny(); end if;
  if cardinality(p_siblings) > 0 then perform public.planner_reorder('goals', p_siblings); end if;
  return private.planner_goal_row(r);
end $$;

create or replace function public.planner_set_goal_archived(p_goal uuid, p_archived boolean) returns jsonb
language plpgsql set search_path = '' as $$
declare r public.planner_goals;
begin
  update public.planner_goals set archived_at = case when p_archived then coalesce(archived_at, now()) else null end
   where id = p_goal returning * into r;
  if r.id is null then perform private.planner_deny(); end if;
  return private.planner_goal_row(r);
end $$;

create or replace function public.planner_delete_goal(p_goal uuid) returns void
language plpgsql set search_path = '' as $$
declare n int;
begin
  delete from public.planner_goals where id = p_goal; get diagnostics n = row_count;
  if n = 0 then perform private.planner_deny(); end if;
end $$;

create or replace function public.planner_post_update(p_goal uuid, p_data jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare ws uuid; r jsonb;
begin
  select workspace_id into ws from public.planner_goals where id = p_goal;
  if ws is null then perform private.planner_deny(); end if;
  insert into public.planner_updates (workspace_id, goal_id, author_id, status, progress, confidence, summary, risk, next_step)
  values (ws, p_goal, private.current_user_id(), p_data ->> 'status', (p_data ->> 'progress')::numeric, nullif(p_data ->> 'confidence', ''),
          p_data ->> 'summary', nullif(p_data ->> 'risk', ''), nullif(p_data ->> 'next_step', '')) returning to_jsonb(planner_updates) into r;
  return r;
end $$;

-- ------------------------------------------------------------------ writes: measures, actions, risks, comments
create or replace function public.planner_save_measure(p_goal uuid, p_id uuid, p_data jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare r jsonb; ws uuid;
begin
  if p_id is null then
    select workspace_id into ws from public.planner_goals where id = p_goal;
    if ws is null then perform private.planner_deny(); end if;
    if private.planner_uuid(p_data, 'measure_type_id') is not null and exists (select 1 from public.planner_measure_type_kinds k where k.measure_type_id = private.planner_uuid(p_data, 'measure_type_id'))
       and not exists (select 1 from public.planner_measure_type_kinds k join public.planner_goals g on g.goal_type_id = k.goal_type_id
                        where k.measure_type_id = private.planner_uuid(p_data, 'measure_type_id') and g.id = p_goal) then
      raise exception 'this KPI type is not available for that kind of objective' using errcode = 'P0001';
    end if;
    insert into public.planner_kpis (workspace_id, goal_id, measure_type_id, name, unit, direction, start_value, target_value, current_value, cadence)
    values (ws, p_goal, private.planner_uuid(p_data, 'measure_type_id'), p_data ->> 'name', coalesce(p_data ->> 'unit', ''), coalesce(p_data ->> 'direction', 'increase'),
            coalesce((p_data ->> 'start_value')::numeric, 0), (p_data ->> 'target_value')::numeric,
            coalesce((p_data ->> 'current_value')::numeric, (p_data ->> 'start_value')::numeric, 0), coalesce(p_data ->> 'cadence', 'monthly'))
    returning to_jsonb(planner_kpis) into r;
  else
    update public.planner_kpis set
      name = case when p_data ? 'name' then p_data ->> 'name' else name end,
      unit = case when p_data ? 'unit' then coalesce(p_data ->> 'unit', '') else unit end,
      direction = case when p_data ? 'direction' then p_data ->> 'direction' else direction end,
      start_value = case when p_data ? 'start_value' then (p_data ->> 'start_value')::numeric else start_value end,
      target_value = case when p_data ? 'target_value' then (p_data ->> 'target_value')::numeric else target_value end,
      cadence = case when p_data ? 'cadence' then p_data ->> 'cadence' else cadence end,
      archived_at = case when p_data ? 'archived' then case when (p_data ->> 'archived')::boolean then coalesce(archived_at, now()) else null end else archived_at end
     where id = p_id returning to_jsonb(planner_kpis) into r;
    if r is null then perform private.planner_deny(); end if;
  end if;
  return r;
end $$;

create or replace function public.planner_record_reading(p_measure uuid, p_value numeric, p_recorded_on date default null, p_note text default null) returns jsonb
language plpgsql set search_path = '' as $$
declare ws uuid; r jsonb;
begin
  select workspace_id into ws from public.planner_kpis where id = p_measure;
  if ws is null then perform private.planner_deny(); end if;
  insert into public.planner_measure_readings (workspace_id, measure_id, value, note, recorded_on, recorded_by)
  values (ws, p_measure, p_value, nullif(p_note, ''), coalesce(p_recorded_on, current_date), private.current_user_id())
  returning to_jsonb(planner_measure_readings) into r;
  return r;
end $$;

create or replace function public.planner_save_action(p_goal uuid, p_id uuid, p_data jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare r jsonb; ws uuid;
begin
  if p_id is null then
    select workspace_id into ws from public.planner_goals where id = p_goal;
    if ws is null then perform private.planner_deny(); end if;
    insert into public.planner_actions (workspace_id, goal_id, title, notes, assignee_id, status, priority, due_date, project_id, position, created_by)
    values (ws, p_goal, p_data ->> 'title', p_data ->> 'notes', private.planner_uuid(p_data, 'assignee_id'), coalesce(p_data ->> 'status', 'todo'),
            coalesce(p_data ->> 'priority', 'medium'), private.planner_date(p_data, 'due_date'), private.planner_uuid(p_data, 'project_id'),
            coalesce((select max(position) + 1 from public.planner_actions where goal_id = p_goal), 0), private.current_user_id())
    returning to_jsonb(planner_actions) - 'created_by' into r;
  else
    update public.planner_actions set
      title = case when p_data ? 'title' then p_data ->> 'title' else title end,
      notes = case when p_data ? 'notes' then p_data ->> 'notes' else notes end,
      assignee_id = case when p_data ? 'assignee_id' then private.planner_uuid(p_data, 'assignee_id') else assignee_id end,
      status = case when p_data ? 'status' then p_data ->> 'status' else status end,
      priority = case when p_data ? 'priority' then p_data ->> 'priority' else priority end,
      due_date = case when p_data ? 'due_date' then private.planner_date(p_data, 'due_date') else due_date end,
      project_id = case when p_data ? 'project_id' then private.planner_uuid(p_data, 'project_id') else project_id end,
      archived_at = case when p_data ? 'archived' then case when (p_data ->> 'archived')::boolean then coalesce(archived_at, now()) else null end else archived_at end
     where id = p_id returning to_jsonb(planner_actions) - 'created_by' into r;
    if r is null then perform private.planner_deny(); end if;
  end if;
  return r;
end $$;

create or replace function public.planner_save_risk(p_goal uuid, p_id uuid, p_data jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare r jsonb; ws uuid;
begin
  if p_id is null then
    select workspace_id into ws from public.planner_goals where id = p_goal;
    if ws is null then perform private.planner_deny(); end if;
    insert into public.planner_risks (workspace_id, goal_id, title, description, likelihood, impact, mitigation, owner_id, status, created_by)
    values (ws, p_goal, p_data ->> 'title', p_data ->> 'description', coalesce((p_data ->> 'likelihood')::smallint, 3), coalesce((p_data ->> 'impact')::smallint, 3),
            p_data ->> 'mitigation', private.planner_uuid(p_data, 'owner_id'), coalesce(p_data ->> 'status', 'open'), private.current_user_id())
    returning to_jsonb(planner_risks) - 'created_by' into r;
  else
    update public.planner_risks set
      title = case when p_data ? 'title' then p_data ->> 'title' else title end,
      description = case when p_data ? 'description' then p_data ->> 'description' else description end,
      likelihood = case when p_data ? 'likelihood' then (p_data ->> 'likelihood')::smallint else likelihood end,
      impact = case when p_data ? 'impact' then (p_data ->> 'impact')::smallint else impact end,
      mitigation = case when p_data ? 'mitigation' then p_data ->> 'mitigation' else mitigation end,
      owner_id = case when p_data ? 'owner_id' then private.planner_uuid(p_data, 'owner_id') else owner_id end,
      status = case when p_data ? 'status' then p_data ->> 'status' else status end,
      archived_at = case when p_data ? 'archived' then case when (p_data ->> 'archived')::boolean then coalesce(archived_at, now()) else null end else archived_at end
     where id = p_id returning to_jsonb(planner_risks) - 'created_by' into r;
    if r is null then perform private.planner_deny(); end if;
  end if;
  return r;
end $$;

create or replace function public.planner_add_comment(p_goal uuid, p_body text) returns jsonb
language plpgsql set search_path = '' as $$
declare ws uuid; r jsonb;
begin
  select workspace_id into ws from public.planner_goals where id = p_goal;
  if ws is null then perform private.planner_deny(); end if;
  insert into public.planner_comments (workspace_id, goal_id, author_id, body) values (ws, p_goal, private.current_user_id(), p_body)
  returning to_jsonb(planner_comments) into r;
  return r;
end $$;

create or replace function public.planner_edit_comment(p_id uuid, p_body text) returns jsonb
language plpgsql set search_path = '' as $$
declare r jsonb;
begin
  update public.planner_comments set body = p_body, edited_at = now() where id = p_id returning to_jsonb(planner_comments) into r;
  if r is null then perform private.planner_deny(); end if;
  return r;
end $$;

create or replace function public.planner_delete_comment(p_id uuid) returns void
language plpgsql set search_path = '' as $$
declare n int;
begin
  delete from public.planner_comments where id = p_id; get diagnostics n = row_count;
  if n = 0 then perform private.planner_deny(); end if;
end $$;

-- ------------------------------------------------------------------ writes: reviews, favourites, saved views
create or replace function public.planner_save_review(p_plan uuid, p_id uuid, p_data jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare r jsonb; ws uuid;
begin
  if p_id is null then
    select workspace_id into ws from public.planner_plans where id = p_plan;
    if ws is null then perform private.planner_deny(); end if;
    insert into public.planner_plan_reviews (workspace_id, plan_id, title, due_on, created_by)
    values (ws, p_plan, p_data ->> 'title', private.planner_date(p_data, 'due_on'), private.current_user_id())
    returning to_jsonb(planner_plan_reviews) - 'created_by' into r;
  else
    update public.planner_plan_reviews set
      title = case when p_data ? 'title' then p_data ->> 'title' else title end,
      due_on = case when p_data ? 'due_on' then private.planner_date(p_data, 'due_on') else due_on end,
      status = case when p_data ? 'status' and p_data ->> 'status' in ('scheduled', 'skipped') and status <> 'held' then p_data ->> 'status' else status end
     where id = p_id and status <> 'held' returning to_jsonb(planner_plan_reviews) - 'created_by' into r;
    if r is null then perform private.planner_deny(); end if;
  end if;
  return r;
end $$;

-- Holding a review freezes a snapshot of the plan so its history shows what was true on the day.
create or replace function public.planner_hold_review(p_review uuid, p_summary text, p_decisions text) returns jsonb
language plpgsql set search_path = '' as $$
declare rv public.planner_plan_reviews; snap jsonb; r jsonb;
begin
  select * into rv from public.planner_plan_reviews where id = p_review and status = 'scheduled';
  if rv.id is null then perform private.planner_deny(); end if;
  snap := jsonb_build_object('taken_at', now(), 'progress', private.planner_plan_progress(rv.plan_id),
    'status_counts', (select coalesce(jsonb_object_agg(s, c), '{}'::jsonb) from (select g.status s, count(*) c from public.planner_goals g
                        where g.plan_id = rv.plan_id and g.archived_at is null group by g.status) q),
    'focus_areas', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name,
        'goals', (select count(*) from public.planner_goals g where g.focus_area_id = f.id and g.parent_goal_id is null and g.archived_at is null),
        'progress', (select coalesce(round(sum(g.progress * g.weight) / nullif(sum(g.weight), 0), 1), 0) from public.planner_goals g
                      where g.focus_area_id = f.id and g.parent_goal_id is null and g.archived_at is null)) order by f.position), '[]')
        from public.planner_focus_areas f where f.plan_id = rv.plan_id and f.archived_at is null),
    'goals', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'title', g.title, 'status', g.status, 'progress', g.progress, 'owner_id', g.owner_id,
                'due_date', g.due_date) order by g.title), '[]') from public.planner_goals g where g.plan_id = rv.plan_id and g.archived_at is null));
  update public.planner_plan_reviews set status = 'held', held_at = now(), held_by = private.current_user_id(),
         summary = p_summary, decisions = p_decisions, snapshot = snap where id = p_review returning to_jsonb(planner_plan_reviews) - 'created_by' into r;
  if r is null then perform private.planner_deny(); end if;
  return r;
end $$;

create or replace function public.planner_toggle_favorite(p_plan uuid, p_on boolean) returns boolean
language plpgsql set search_path = '' as $$
declare ws uuid;
begin
  select workspace_id into ws from public.planner_plans where id = p_plan;
  if ws is null then perform private.planner_deny(); end if;
  if p_on then
    insert into public.planner_favorites (workspace_id, plan_id, user_id) values (ws, p_plan, private.current_user_id()) on conflict do nothing;
  else
    delete from public.planner_favorites where plan_id = p_plan and user_id = private.current_user_id();
  end if;
  return p_on;
end $$;

create or replace function public.planner_save_view(p_plan uuid, p_name text, p_config jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare ws uuid; r jsonb;
begin
  select workspace_id into ws from public.planner_plans where id = p_plan;
  if ws is null then perform private.planner_deny(); end if;
  insert into public.planner_saved_views (workspace_id, plan_id, owner_id, name, config)
  values (ws, p_plan, private.current_user_id(), p_name, p_config)
  on conflict (owner_id, plan_id, name) do update set config = excluded.config
  returning jsonb_build_object('id', id, 'name', name, 'config', config) into r;
  return r;
end $$;

create or replace function public.planner_delete_view(p_id uuid) returns void
language plpgsql set search_path = '' as $$
begin delete from public.planner_saved_views where id = p_id and owner_id = private.current_user_id(); end $$;

-- ------------------------------------------------------------------ strategy model and time horizons
create or replace function public.planner_get_model(p_workspace uuid) returns jsonb
language sql stable set search_path = '' as $$
  select case when not private.has_permission(p_workspace, 'planner.plan.view') then null else jsonb_build_object(
    'types', (select coalesce(jsonb_agg(to_jsonb(t) || jsonb_build_object('goal_count', (select count(*) from public.planner_goals g where g.goal_type_id = t.id)) order by t.position, t.name), '[]')
                from public.planner_goal_types t where t.workspace_id = p_workspace),
    'rules', (select coalesce(jsonb_agg(jsonb_build_object('parent_type_id', r.parent_type_id, 'child_type_id', r.child_type_id)), '[]')
                from public.planner_type_rules r where r.workspace_id = p_workspace),
    'horizons', (select coalesce(jsonb_agg(to_jsonb(h) - 'created_at' order by h.start_date, h.end_date desc, h.title), '[]') from public.planner_horizons h where h.workspace_id = p_workspace),
    'focus_templates', (select coalesce(jsonb_agg(to_jsonb(ft) - 'created_at' order by ft.position, ft.name), '[]') from public.planner_focus_templates ft where ft.workspace_id = p_workspace),
    'strategies', (select coalesce(jsonb_agg(to_jsonb(s) - 'created_at' || jsonb_build_object(
                     'kind_ids', (select coalesce(jsonb_agg(k.goal_type_id), '[]') from public.planner_strategy_kinds k where k.strategy_id = s.id),
                     'focus_ids', (select coalesce(jsonb_agg(sf.template_id order by sf.position), '[]') from public.planner_strategy_focus sf where sf.strategy_id = s.id),
                     'focus_kinds', (select coalesce(jsonb_object_agg(q.template_id, q.ids), '{}') from (select fk.template_id, jsonb_agg(fk.goal_type_id) ids from public.planner_strategy_focus_kinds fk where fk.strategy_id = s.id group by fk.template_id) q),
                     'items', (select coalesce(jsonb_agg(to_jsonb(i) - 'created_at' - 'workspace_id' order by i.position, i.created_at), '[]') from public.planner_strategy_items i where i.strategy_id = s.id),
                     'plan_count', (select count(*) from public.planner_plans pl where pl.strategy_id = s.id and pl.archived_at is null)) order by s.position, s.name), '[]')
                     from public.planner_strategies s where s.workspace_id = p_workspace),
    'measure_types', (select coalesce(jsonb_agg(to_jsonb(mt) - 'created_at' || jsonb_build_object(
                     'kind_ids', (select coalesce(jsonb_agg(k.goal_type_id), '[]') from public.planner_measure_type_kinds k where k.measure_type_id = mt.id)) order by mt.position, mt.name), '[]')
                     from public.planner_measure_types mt where mt.workspace_id = p_workspace),
    'plan_count', (select count(*) from public.planner_plans pl where pl.workspace_id = p_workspace and pl.archived_at is null),
    'focus_area_count', (select count(*) from public.planner_focus_areas f where f.workspace_id = p_workspace and f.archived_at is null)) end
$$;

-- Replaces every nesting rule of the organization with the given list: [{ "parent": <type id or null>, "child": <type id> }].
create or replace function public.planner_save_type_rules(p_workspace uuid, p_rules jsonb) returns jsonb
language plpgsql set search_path = '' as $$
begin
  if not private.planner_can(p_workspace, 'planner.plan.manage') then perform private.planner_deny(); end if;
  if jsonb_typeof(p_rules) <> 'array' then raise exception 'rules must be a list' using errcode = 'P0001'; end if;
  delete from public.planner_type_rules where workspace_id = p_workspace;
  insert into public.planner_type_rules (workspace_id, parent_type_id, child_type_id)
  select distinct p_workspace, private.planner_uuid(x, 'parent'), private.planner_uuid(x, 'child') from jsonb_array_elements(p_rules) x;
  return (select coalesce(jsonb_agg(jsonb_build_object('parent_type_id', parent_type_id, 'child_type_id', child_type_id)), '[]') from public.planner_type_rules where workspace_id = p_workspace);
end $$;

create or replace function public.planner_save_horizon(p_workspace uuid, p_id uuid, p_data jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare r jsonb;
begin
  if p_id is null then
    insert into public.planner_horizons (workspace_id, title, start_date, end_date)
    values (p_workspace, p_data ->> 'title', private.planner_date(p_data, 'start_date'), private.planner_date(p_data, 'end_date')) returning to_jsonb(planner_horizons) - 'created_at' into r;
  else
    update public.planner_horizons set title = case when p_data ? 'title' then p_data ->> 'title' else title end,
      start_date = case when p_data ? 'start_date' then private.planner_date(p_data, 'start_date') else start_date end,
      end_date = case when p_data ? 'end_date' then private.planner_date(p_data, 'end_date') else end_date end
     where id = p_id and workspace_id = p_workspace returning to_jsonb(planner_horizons) - 'created_at' into r;
    if r is null then perform private.planner_deny(); end if;
  end if;
  return r;
end $$;

create or replace function public.planner_delete_horizon(p_id uuid) returns void
language plpgsql set search_path = '' as $$
declare n int;
begin
  delete from public.planner_horizons where id = p_id; get diagnostics n = row_count;
  if n = 0 then perform private.planner_deny(); end if;
end $$;

-- ------------------------------------------------------------------ strategies, reusable focus areas, KPI types
create or replace function public.planner_save_focus_template(p_workspace uuid, p_id uuid, p_data jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare r jsonb;
begin
  if p_id is null then
    insert into public.planner_focus_templates (workspace_id, name, description, color, position)
    values (p_workspace, p_data ->> 'name', p_data ->> 'description', coalesce(p_data ->> 'color', 'blue'),
            coalesce((select max(position) + 1 from public.planner_focus_templates where workspace_id = p_workspace), 0))
    returning to_jsonb(planner_focus_templates) - 'created_at' into r;
  else
    update public.planner_focus_templates set
      name = case when p_data ? 'name' then p_data ->> 'name' else name end,
      description = case when p_data ? 'description' then p_data ->> 'description' else description end,
      color = case when p_data ? 'color' then p_data ->> 'color' else color end
     where id = p_id and workspace_id = p_workspace returning to_jsonb(planner_focus_templates) - 'created_at' into r;
    if r is null then perform private.planner_deny(); end if;
  end if;
  return r;
end $$;

create or replace function public.planner_delete_focus_template(p_id uuid) returns void
language plpgsql set search_path = '' as $$
declare n int;
begin
  delete from public.planner_focus_templates where id = p_id; get diagnostics n = row_count;
  if n = 0 then perform private.planner_deny(); end if;
end $$;

-- data: { name, description, kind_ids: [goal type ids], focus_ids: [focus template ids in order] }. A list that is present replaces the stored list.
create or replace function public.planner_save_strategy(p_workspace uuid, p_id uuid, p_data jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare sid uuid := p_id; r jsonb;
begin
  if sid is null then
    insert into public.planner_strategies (workspace_id, name, description, position)
    values (p_workspace, p_data ->> 'name', p_data ->> 'description', coalesce((select max(position) + 1 from public.planner_strategies where workspace_id = p_workspace), 0))
    returning id into sid;
  else
    update public.planner_strategies set
      name = case when p_data ? 'name' then p_data ->> 'name' else name end,
      description = case when p_data ? 'description' then p_data ->> 'description' else description end
     where id = sid and workspace_id = p_workspace returning id into sid;
    if sid is null then perform private.planner_deny(); end if;
  end if;
  if p_data ? 'kind_ids' then
    delete from public.planner_strategy_kinds where strategy_id = sid;
    insert into public.planner_strategy_kinds (workspace_id, strategy_id, goal_type_id)
    select distinct p_workspace, sid, x::uuid from jsonb_array_elements_text(p_data -> 'kind_ids') x;
    -- a focus area cannot keep a kind the strategy no longer has (an empty pool means every kind)
    if jsonb_array_length(p_data -> 'kind_ids') > 0 then
      delete from public.planner_strategy_focus_kinds fk where fk.strategy_id = sid
         and fk.goal_type_id not in (select x::uuid from jsonb_array_elements_text(p_data -> 'kind_ids') x);
    end if;
  end if;
  if p_data ? 'focus_ids' then
    delete from public.planner_strategy_focus where strategy_id = sid
       and template_id not in (select x::uuid from jsonb_array_elements_text(p_data -> 'focus_ids') x);   -- removed ones only, so per-focus kinds survive a reorder
    insert into public.planner_strategy_focus (workspace_id, strategy_id, template_id, position)
    select p_workspace, sid, x.v::uuid, (x.n - 1)::int from jsonb_array_elements_text(p_data -> 'focus_ids') with ordinality as x(v, n)
    on conflict (strategy_id, template_id) do update set position = excluded.position;
  end if;
  if p_data ? 'focus_kinds' then   -- { template_id: [kind ids] }; an empty list clears that focus area back to the strategy's kinds
    delete from public.planner_strategy_focus_kinds where strategy_id = sid and template_id in (select k::uuid from jsonb_object_keys(p_data -> 'focus_kinds') k);
    insert into public.planner_strategy_focus_kinds (workspace_id, strategy_id, template_id, goal_type_id)
    select distinct p_workspace, sid, e.key::uuid, v::uuid from jsonb_each(p_data -> 'focus_kinds') e, jsonb_array_elements_text(e.value) v;
  end if;
  select to_jsonb(s) - 'created_at' || jsonb_build_object(
           'kind_ids', (select coalesce(jsonb_agg(k.goal_type_id), '[]') from public.planner_strategy_kinds k where k.strategy_id = s.id),
           'focus_ids', (select coalesce(jsonb_agg(sf.template_id order by sf.position), '[]') from public.planner_strategy_focus sf where sf.strategy_id = s.id),
           'focus_kinds', (select coalesce(jsonb_object_agg(q.template_id, q.ids), '{}') from (select fk.template_id, jsonb_agg(fk.goal_type_id) ids from public.planner_strategy_focus_kinds fk where fk.strategy_id = s.id group by fk.template_id) q))
    into r from public.planner_strategies s where s.id = sid;
  return r;
end $$;

create or replace function public.planner_delete_strategy(p_id uuid) returns void
language plpgsql set search_path = '' as $$
declare n int;
begin
  delete from public.planner_strategies where id = p_id; get diagnostics n = row_count;
  if n = 0 then perform private.planner_deny(); end if;
end $$;

create or replace function public.planner_save_measure_type(p_workspace uuid, p_id uuid, p_data jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare mid uuid := p_id; r jsonb;
begin
  if mid is null then
    insert into public.planner_measure_types (workspace_id, name, unit, direction, position)
    values (p_workspace, p_data ->> 'name', coalesce(p_data ->> 'unit', ''), coalesce(p_data ->> 'direction', 'increase'),
            coalesce((select max(position) + 1 from public.planner_measure_types where workspace_id = p_workspace), 0))
    returning id into mid;
  else
    update public.planner_measure_types set
      name = case when p_data ? 'name' then p_data ->> 'name' else name end,
      unit = case when p_data ? 'unit' then coalesce(p_data ->> 'unit', '') else unit end,
      direction = case when p_data ? 'direction' then p_data ->> 'direction' else direction end
     where id = mid and workspace_id = p_workspace returning id into mid;
    if mid is null then perform private.planner_deny(); end if;
  end if;
  if p_data ? 'kind_ids' then
    delete from public.planner_measure_type_kinds where measure_type_id = mid;
    insert into public.planner_measure_type_kinds (workspace_id, measure_type_id, goal_type_id)
    select distinct p_workspace, mid, x::uuid from jsonb_array_elements_text(p_data -> 'kind_ids') x;
  end if;
  select to_jsonb(mt) - 'created_at' || jsonb_build_object(
           'kind_ids', (select coalesce(jsonb_agg(k.goal_type_id), '[]') from public.planner_measure_type_kinds k where k.measure_type_id = mt.id))
    into r from public.planner_measure_types mt where mt.id = mid;
  return r;
end $$;

create or replace function public.planner_delete_measure_type(p_id uuid) returns void
language plpgsql set search_path = '' as $$
declare n int;
begin
  delete from public.planner_measure_types where id = p_id; get diagnostics n = row_count;
  if n = 0 then perform private.planner_deny(); end if;
end $$;
-- ------------------------------------------------------------------ strategy content: objectives, KPIs, tasks on the map
-- data: { strategy_id, template_id, parent_id, item_kind, title, goal_type_id, unit, target, direction }
create or replace function public.planner_save_strategy_item(p_workspace uuid, p_id uuid, p_data jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare r jsonb; par public.planner_strategy_items;
begin
  if not private.planner_can(p_workspace, 'planner.plan.manage') then perform private.planner_deny(); end if;
  if p_id is null then
    if private.planner_uuid(p_data, 'parent_id') is not null then
      select * into par from public.planner_strategy_items where id = private.planner_uuid(p_data, 'parent_id') and workspace_id = p_workspace;
      if par.id is null or par.item_kind <> 'objective' then raise exception 'KPIs, tasks and sub-objectives go under an objective' using errcode = 'P0001'; end if;
    end if;
    insert into public.planner_strategy_items (workspace_id, strategy_id, template_id, parent_id, item_kind, title, goal_type_id, unit, target, direction, position)
    values (p_workspace, coalesce(par.strategy_id, private.planner_uuid(p_data, 'strategy_id')), coalesce(par.template_id, private.planner_uuid(p_data, 'template_id')), par.id,
            coalesce(p_data ->> 'item_kind', 'objective'), p_data ->> 'title', private.planner_uuid(p_data, 'goal_type_id'), coalesce(p_data ->> 'unit', ''),
            (p_data ->> 'target')::numeric, coalesce(p_data ->> 'direction', 'increase'),
            coalesce((select max(position) + 1 from public.planner_strategy_items where strategy_id = coalesce(par.strategy_id, private.planner_uuid(p_data, 'strategy_id'))), 0))
    returning to_jsonb(planner_strategy_items) - 'created_at' - 'workspace_id' into r;
  else
    update public.planner_strategy_items set
      title = case when p_data ? 'title' then p_data ->> 'title' else title end,
      goal_type_id = case when p_data ? 'goal_type_id' then private.planner_uuid(p_data, 'goal_type_id') else goal_type_id end,
      unit = case when p_data ? 'unit' then coalesce(p_data ->> 'unit', '') else unit end,
      target = case when p_data ? 'target' then (p_data ->> 'target')::numeric else target end,
      direction = case when p_data ? 'direction' then p_data ->> 'direction' else direction end
     where id = p_id and workspace_id = p_workspace returning to_jsonb(planner_strategy_items) - 'created_at' - 'workspace_id' into r;
    if r is null then perform private.planner_deny(); end if;
  end if;
  return r;
end $$;

create or replace function public.planner_delete_strategy_item(p_id uuid) returns void
language plpgsql set search_path = '' as $$
declare n int; ws uuid;
begin
  select workspace_id into ws from public.planner_strategy_items where id = p_id;
  if ws is null or not private.planner_can(ws, 'planner.plan.manage') then perform private.planner_deny(); end if;
  delete from public.planner_strategy_items where id = p_id; get diagnostics n = row_count;   -- what sits under it goes too
  if n = 0 then perform private.planner_deny(); end if;
end $$;

-- Copies the strategy's objectives, KPIs and tasks into a new plan, through the normal save functions (so every rule applies).
create or replace function private.planner_copy_strategy_items(p_strategy uuid, p_plan uuid) returns void
language plpgsql set search_path = '' as $$
declare it record; ids jsonb := '{}'::jsonb; g jsonb; fa uuid; kind uuid; fallback uuid; ws uuid; t numeric;
begin
  select workspace_id into ws from public.planner_plans where id = p_plan;
  for it in
    with recursive tree as (
      select i.*, 0 as depth from public.planner_strategy_items i where i.strategy_id = p_strategy and i.parent_id is null
      union all select c.*, tree.depth + 1 from public.planner_strategy_items c join tree on c.parent_id = tree.id)
    select * from tree order by depth, position, created_at
  loop
    if it.item_kind = 'objective' then
      if it.parent_id is not null and not (ids ? it.parent_id::text) then continue; end if;   -- its parent was skipped: so is it
      select f.id into fa from public.planner_focus_areas f where f.plan_id = p_plan and f.template_id = it.template_id limit 1;
      -- a kind left empty is "Objective" (or the organization's first kind)
      select coalesce((select gt.id from public.planner_goal_types gt where gt.workspace_id = ws and gt.name = 'Objective' limit 1),
                      (select gt.id from public.planner_goal_types gt where gt.workspace_id = ws order by gt.position limit 1)) into fallback;
      kind := coalesce(it.goal_type_id, fallback);
      begin   -- one objective the nesting rules refuse is skipped (with what sits under it) instead of failing the whole plan
        g := public.planner_save_goal(p_plan, null, jsonb_build_object('title', it.title, 'goal_type_id', kind, 'owner_id', private.current_user_id(),
               'focus_area_id', case when it.parent_id is null then fa end, 'parent_goal_id', ids ->> it.parent_id::text));
        ids := ids || jsonb_build_object(it.id::text, g ->> 'id');
      exception when sqlstate 'P0001' then null;
      end;
    elsif it.item_kind = 'kpi' and ids ? it.parent_id::text then
      t := coalesce(it.target, 100); if t = 0 then t := 100; end if;
      perform public.planner_save_measure((ids ->> it.parent_id::text)::uuid, null, jsonb_build_object('name', it.title, 'unit', it.unit, 'direction', it.direction, 'start_value', 0, 'target_value', t));
      -- an objective with a KPI is measured by it, as in Cascade (its first KPI drives progress)
      update public.planner_goals set progress_mode = 'measure' where id = (ids ->> it.parent_id::text)::uuid and progress_mode = 'manual';
    elsif it.item_kind = 'task' and ids ? it.parent_id::text then
      perform public.planner_save_action((ids ->> it.parent_id::text)::uuid, null, jsonb_build_object('title', it.title, 'status', 'todo'));
    end if;
  end loop;
end $$;
-- ------------------------------------------------------------------ grants (only the planner_* functions)
do $$
declare f record; has_auth boolean := exists (select 1 from pg_roles where rolname = 'authenticated'); has_anon boolean := exists (select 1 from pg_roles where rolname = 'anon');
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'planner\_%' loop
    execute format('revoke all on function %s from public', f.sig);
    execute format('grant execute on function %s to app_user', f.sig);
    if has_auth then execute format('revoke all on function %s from authenticated', f.sig); end if;
    if has_anon then execute format('revoke all on function %s from anon', f.sig); end if;
  end loop;
end $$;
do $$ declare f record; begin for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname like 'planner\_%' loop execute format('grant execute on function %s to app_user', f.sig); end loop; end $$;   -- only this app's helpers (not every private function)
revoke all on all functions in schema private from public;   -- helpers created above (re-asserts the foundation rule F4b)
do $$ declare f record; begin for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname like 'planner\_%' loop execute format('grant execute on function %s to app_user', f.sig); end loop; end $$;   -- only this app's helpers (not every private function)

-- ------------------------------------------------------------------ API role lockdown (as migration 0010): browser roles get nothing
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
