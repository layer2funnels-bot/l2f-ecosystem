set check_function_bodies = off;
-- 0048 · Projects V2 (owner decision 11 Nov 2026: V2 replaces the old Projects app; one project system).
-- Source: the Projects V2 package (db/schema.sql + db/migrations 0002-0005), adapted to the ecosystem:
-- * identity comes from the ecosystem, never a second user/organization/client table: pm.uid() = private.current_user_id(),
--   pm.org() = the request's organization (private.request_org(), a malformed value means "no organization"),
--   pm.org_role() = the caller's ACTIVE STAFF role in that organization, and only when the Projects app is switched on for
--   the organization and granted to the person (private.can_use_app). Client (portal) accounts never get a role here.
-- * pm_people / pm_members / pm_clients are read-only views over profiles / memberships / clients (security_invoker:
--   the ecosystem's own row rules still apply). E-mail addresses are shown to admins and owners only (team_list rule).
-- * every pm_* table carries workspace_id, has forced row security, the restrictive org_scope policy and V2's own
--   project-role policies (manager / editor / viewer; personal projects private to their owner).
-- * the API role is app_user; browser roles (anon, authenticated) get nothing.
-- This migration ADDS objects only. The old Projects tables (0013, 0034-0038) are not touched; switching data and
-- links over is the separate cutover migration.

create schema if not exists pm;
revoke all on schema pm from public;

-- ───────────── identity from the ecosystem ─────────────
create function pm.uid() returns uuid language sql stable set search_path = '' as
$$ select private.current_user_id() $$;
create function pm.org() returns uuid language sql stable set search_path = '' as $$
  select case when private.request_org() ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then private.request_org()::uuid end
$$;
create function pm.org_role() returns text language sql stable security definer set search_path = '' as $$
  select m.role from public.memberships m
  where m.workspace_id = pm.org() and m.user_id = pm.uid() and m.kind = 'staff' and m.status = 'active'
    and private.can_use_app(m.workspace_id, 'projects')
$$;

-- People who share the active organization with the caller (active staff only). Stable colour from the id.
create view public.pm_people with (security_invoker = true) as
  select p.id,
         coalesce(nullif(btrim(p.display_name), ''), 'Member ' || left(p.id::text, 4)) as name,
         case when p.id = pm.uid() or private.has_role(pm.org(), 'admin') then coalesce(p.email, '') else '' end as email,
         (array['#2b5ce6','#0e7c86','#a33b6b','#7c4dd8','#b07a00','#d9622b','#3b4a6b','#5b6b2e'])[1 + (abs(hashtext(p.id::text)) % 8)] as color
  from public.profiles p
  where pm.org_role() is not null
    and exists (select 1 from public.memberships m where m.workspace_id = pm.org() and m.user_id = p.id and m.kind = 'staff' and m.status = 'active');

create view public.pm_members with (security_invoker = true) as
  select m.workspace_id, m.user_id, m.role
  from public.memberships m
  where m.kind = 'staff' and m.status = 'active' and m.workspace_id = pm.org() and pm.org_role() is not null;

create view public.pm_clients with (security_invoker = true) as
  select c.id, c.workspace_id, c.name
  from public.clients c
  where c.workspace_id = pm.org() and pm.org_role() is not null;

-- Projects V2 schema (PostgreSQL 15+ / PGlite).
-- eco_* tables stand in for ecosystem identity (workspaces, profiles, memberships, clients) during standalone
-- development; at integration they are replaced by views over the ecosystem tables (see docs/HANDOFF.md §Integration).
-- pm_* tables are owned by Projects V2. Every pm_* row carries workspace_id; row-level security refuses anything outside
-- the request's active organization (WCIGA) and outside the caller's project access, independently of the API layer.


create function pm.role_rank(r text) returns int language sql immutable set search_path = public, pg_temp as
$$ select case r when 'manager' then 3 when 'editor' then 2 when 'viewer' then 1 else 0 end $$;

-- ───────────────────────────── projects ─────────────────────────────
create table pm_projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  client_id uuid,
  name text not null check (length(btrim(name)) between 1 and 120),
  description text not null default '' check (length(description) <= 20000),
  color text not null default '#6366f1' check (color ~ '^#[0-9a-fA-F]{6}$'),
  status text not null default 'on_track' check (status in ('on_track','at_risk','off_track','on_hold','complete')),
  visibility text not null default 'members' check (visibility in ('members','organization')),
  owner_id uuid,
  start_on date,
  due_on date,
  is_template boolean not null default false,
  is_personal boolean not null default false,       -- private to owner_id only (ER10: personal scope is owner-only)
  default_view text not null default 'list' check (default_view in ('overview','list','board','calendar','timeline')),
  archived_at timestamptz,
  deleted_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, client_id) references public.clients(workspace_id, id),
  check (due_on is null or start_on is null or due_on >= start_on),
  check (not is_personal or (client_id is null and visibility = 'members' and owner_id is not null))
);
create index pm_projects_org on pm_projects (workspace_id) where deleted_at is null;

create table pm_project_members (
  workspace_id uuid not null,
  project_id uuid not null,
  user_id uuid not null,
  role text not null check (role in ('manager','editor','viewer')),
  added_at timestamptz not null default now(),
  primary key (project_id, user_id),
  foreign key (workspace_id, project_id) references pm_projects(workspace_id, id) on delete cascade,
  foreign key (workspace_id, user_id) references public.memberships(workspace_id, user_id)
);

-- Effective role of the caller on a project inside the active organization, or null.
create function pm.project_role(p uuid) returns text language sql stable security definer set search_path = public, pg_temp as $$
  with me as (select pm.org_role() r)
  select case
    when (select r from me) is null then null
    when not exists (select 1 from pm_projects where id = p and workspace_id = pm.org()) then null
    when exists (select 1 from pm_projects where id = p and is_personal) then
      case when exists (select 1 from pm_projects where id = p and owner_id = pm.uid()) and (select r from me) <> 'viewer' then 'manager'
           when exists (select 1 from pm_projects where id = p and owner_id = pm.uid()) then 'viewer' end
    when (select r from me) in ('owner','admin') then 'manager'
    else (
      select case
        when (select r from me) = 'viewer' then case when coalesce(m.role, v.role) is null then null else 'viewer' end
        else coalesce(m.role, v.role)
      end
      from (select 1) x
      left join pm_project_members m on m.project_id = p and m.user_id = pm.uid()
      left join lateral (
        select case when (select r from me) = 'editor' then 'editor' else 'viewer' end role
        from pm_projects where id = p and visibility = 'organization'
      ) v on true
    )
  end
$$;
-- Whether another person could open a project (used to decide who to notify; reveals nothing to the caller).
create function pm.user_can_view(p uuid, u uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from pm_projects pr join pm_members om on om.workspace_id = pr.workspace_id and om.user_id = u
    where pr.id = p and pr.workspace_id = pm.org() and (not pr.is_personal or pr.owner_id = u)
      and (pr.owner_id = u and pr.is_personal or om.role in ('owner','admin') or pr.visibility = 'organization'
      or exists (select 1 from pm_project_members m where m.project_id = p and m.user_id = u)))
$$;
create function pm.can(p uuid, need text) returns boolean language sql stable set search_path = public, pg_temp as
$$ select pm.role_rank(pm.project_role(p)) >= pm.role_rank(need) $$;

create table pm_sections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 80),
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, project_id) references pm_projects(workspace_id, id) on delete cascade
);

-- ───────────────────────────── tasks ─────────────────────────────
create table pm_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  section_id uuid,
  parent_id uuid,
  number int not null,
  title text not null check (length(btrim(title)) between 1 and 300),
  description text not null default '' check (length(description) <= 50000),
  status text not null default 'todo' check (status in ('todo','in_progress','in_review','blocked','done')),
  priority text not null default 'none' check (priority in ('none','low','medium','high','urgent')),
  assignee_id uuid,
  start_on date,
  due_on date,
  estimate_minutes int check (estimate_minutes between 0 and 100000),
  repeat_rule text check (repeat_rule in ('daily','weekdays','weekly','biweekly','monthly','yearly')),
  position double precision not null default 0,
  completed_at timestamptz,
  deleted_at timestamptz,
  version int not null default 1,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (project_id, number),
  foreign key (workspace_id, project_id) references pm_projects(workspace_id, id) on delete cascade,
  foreign key (workspace_id, section_id) references pm_sections(workspace_id, id) on delete set null (section_id),
  foreign key (workspace_id, parent_id) references pm_tasks(workspace_id, id) on delete cascade,
  check (due_on is null or start_on is null or due_on >= start_on)
);
create index pm_tasks_project on pm_tasks (project_id) where deleted_at is null;
create index pm_tasks_assignee on pm_tasks (workspace_id, assignee_id) where deleted_at is null and status <> 'done';
create index pm_tasks_parent on pm_tasks (parent_id);

-- Subtasks and sections must stay inside their task's project; done tasks carry completed_at.
create function pm.tasks_guard() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.parent_id is not null and not exists (select 1 from pm_tasks where id = new.parent_id and project_id = new.project_id) then
    raise exception 'parent task belongs to another project' using errcode = '23514';
  end if;
  if new.parent_id = new.id then raise exception 'a task cannot be its own parent' using errcode = '23514'; end if;
  if new.section_id is not null and not exists (select 1 from pm_sections where id = new.section_id and project_id = new.project_id) then
    raise exception 'section belongs to another project' using errcode = '23514';
  end if;
  if new.assignee_id is not null and not exists (select 1 from pm_members where workspace_id = new.workspace_id and user_id = new.assignee_id) then
    raise exception 'assignee is not a member of this organization' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    new.number := coalesce((select max(number) from pm_tasks where project_id = new.project_id), 0) + 1;
  end if;
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then new.completed_at := now(); end if;
  if new.status <> 'done' then new.completed_at := null; end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    new.version := old.version + 1;
  end if;
  return new;
end $$;
create trigger pm_tasks_guard before insert or update on pm_tasks for each row execute function pm.tasks_guard();

create table pm_checklist_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  task_id uuid not null,
  label text not null check (length(btrim(label)) between 1 and 500),
  done boolean not null default false,
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, task_id) references pm_tasks(workspace_id, id) on delete cascade
);
create index pm_checklist_task on pm_checklist_items (task_id);

create table pm_dependencies (
  workspace_id uuid not null,
  project_id uuid not null,
  task_id uuid not null,
  depends_on_id uuid not null,
  primary key (task_id, depends_on_id),
  foreign key (workspace_id, task_id) references pm_tasks(workspace_id, id) on delete cascade,
  foreign key (workspace_id, depends_on_id) references pm_tasks(workspace_id, id) on delete cascade,
  check (task_id <> depends_on_id)
);

create table pm_tags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  name text not null check (length(btrim(name)) between 1 and 40),
  color text not null default '#64748b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  unique (workspace_id, id)
);
create unique index pm_tags_name on pm_tags (workspace_id, lower(name));

create table pm_task_tags (
  workspace_id uuid not null,
  project_id uuid not null,
  task_id uuid not null,
  tag_id uuid not null,
  primary key (task_id, tag_id),
  foreign key (workspace_id, task_id) references pm_tasks(workspace_id, id) on delete cascade,
  foreign key (workspace_id, tag_id) references pm_tags(workspace_id, id) on delete cascade
);

create table pm_followers (
  workspace_id uuid not null,
  project_id uuid not null,
  task_id uuid not null,
  user_id uuid not null,
  primary key (task_id, user_id),
  foreign key (workspace_id, task_id) references pm_tasks(workspace_id, id) on delete cascade
);

create table pm_comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  task_id uuid not null,
  author_id uuid not null,
  body text not null check (length(btrim(body)) between 1 and 10000),
  mentions uuid[] not null default '{}',
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, task_id) references pm_tasks(workspace_id, id) on delete cascade
);
create index pm_comments_task on pm_comments (task_id, created_at);

create table pm_attachments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  task_id uuid not null,
  file_id uuid not null,                     -- the Drive file (owner decision: task files live in Drive)
  uploaded_by uuid not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, task_id) references pm_tasks(workspace_id, id) on delete cascade,
  foreign key (workspace_id, file_id) references public.files(workspace_id, id) on delete cascade,
  unique (task_id, file_id)
);

create table pm_time_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  task_id uuid not null,
  user_id uuid not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  note text not null default '' check (length(note) <= 500),
  billable boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, task_id) references pm_tasks(workspace_id, id) on delete cascade,
  check (ended_at is null or ended_at >= started_at),
  check (ended_at is null or ended_at - started_at <= interval '24 hours')
);
create unique index pm_one_running_timer on pm_time_entries (workspace_id, user_id) where ended_at is null;
create index pm_time_task on pm_time_entries (task_id);

-- Links to ecosystem Docs and Whiteboards: references only, never copies (SDOR).
create table pm_project_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  kind text not null check (kind in ('doc','whiteboard','link')),
  title text not null check (length(btrim(title)) between 1 and 200),
  url text not null check (url ~ '^https?://' and length(url) <= 2000),
  created_by uuid,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, project_id) references pm_projects(workspace_id, id) on delete cascade
);

-- Append-only history (no update/delete grant).
create table pm_activity (
  id bigint generated always as identity primary key,
  workspace_id uuid not null,
  project_id uuid not null,
  task_id uuid,
  actor_id uuid,
  kind text not null,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  foreign key (workspace_id, project_id) references pm_projects(workspace_id, id) on delete cascade
);
create index pm_activity_task on pm_activity (task_id, id);
create index pm_activity_project on pm_activity (project_id, id);

create table pm_notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id uuid not null,
  project_id uuid not null,
  task_id uuid,
  actor_id uuid,
  kind text not null check (kind in ('assigned','mentioned','commented','completed','due_changed')),
  summary text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, project_id) references pm_projects(workspace_id, id) on delete cascade
);
create index pm_notifications_user on pm_notifications (workspace_id, user_id, created_at desc);

-- Per-person view preferences (pinned views, filters). Personal scope: owner-only.
create table pm_view_prefs (
  workspace_id uuid not null,
  user_id uuid not null,
  project_id uuid not null,
  prefs jsonb not null default '{}',
  primary key (user_id, project_id),
  foreign key (workspace_id, project_id) references pm_projects(workspace_id, id) on delete cascade
);

-- Child rows copy org/project from their task so policies stay one-hop and callers cannot spoof scope.
create function pm.child_scope() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare t record;
begin
  select workspace_id, project_id into t from pm_tasks where id = new.task_id;
  if t is null then raise exception 'task not found' using errcode = '23503'; end if;
  new.workspace_id := t.workspace_id; new.project_id := t.project_id;
  return new;
end $$;
create trigger s before insert or update on pm_checklist_items for each row execute function pm.child_scope();
create trigger s before insert or update on pm_dependencies for each row execute function pm.child_scope();
create trigger s before insert or update on pm_task_tags for each row execute function pm.child_scope();
create trigger s before insert or update on pm_followers for each row execute function pm.child_scope();
create trigger s before insert or update on pm_comments for each row execute function pm.child_scope();
create trigger s before insert or update on pm_attachments for each row execute function pm.child_scope();
create trigger s before insert or update on pm_time_entries for each row execute function pm.child_scope();

-- A dependency must stay inside one project and must not create a cycle.
create function pm.dependency_guard() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from pm_tasks where id = new.depends_on_id and project_id = new.project_id) then
    raise exception 'tasks must be in the same project' using errcode = '23514';
  end if;
  if exists (
    with recursive chain(id) as (
      select depends_on_id from pm_dependencies where task_id = new.depends_on_id
      union select d.depends_on_id from pm_dependencies d join chain c on d.task_id = c.id
    ) select 1 from chain where id = new.task_id
  ) then raise exception 'this would create a circular wait' using errcode = '23514'; end if;
  return new;
end $$;
create trigger t after insert on pm_dependencies for each row execute function pm.dependency_guard();

-- Creating a project and making its creator manager is one atomic step; only org owners/admins/editors may create.
create function pm.create_project(p_id uuid, p_name text, p_client uuid, p_template boolean, p_personal boolean default false) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if pm.org_role() not in ('owner','admin','editor') or pm.org_role() is null then
    raise exception 'not allowed to create projects' using errcode = '42501';
  end if;
  insert into pm_projects (id, workspace_id, client_id, name, owner_id, is_template, is_personal, created_by)
  values (p_id, pm.org(), case when coalesce(p_personal, false) then null else p_client end, p_name, pm.uid(),
          coalesce(p_template, false), coalesce(p_personal, false), pm.uid());
  insert into pm_project_members (workspace_id, project_id, user_id, role) values (pm.org(), p_id, pm.uid(), 'manager');
  return p_id;
end $$;

-- ───────────────────────────── row-level security ─────────────────────────────
grant usage on schema pm to app_user;
grant execute on all functions in schema pm to app_user;
grant select, insert, update, delete on pm_projects, pm_project_members, pm_sections, pm_tasks, pm_checklist_items,
  pm_dependencies, pm_tags, pm_task_tags, pm_followers, pm_comments, pm_attachments, pm_time_entries,
  pm_project_links, pm_notifications, pm_view_prefs to app_user;
grant select, insert on pm_activity to app_user;


alter table pm_projects enable row level security;
create policy sel on pm_projects for select using (workspace_id = pm.org() and pm.project_role(id) is not null);
create policy ins on pm_projects for insert with check (workspace_id = pm.org() and pm.org_role() in ('owner','admin','editor'));
create policy upd on pm_projects for update using (workspace_id = pm.org() and pm.can(id, 'manager')) with check (workspace_id = pm.org());
create policy del on pm_projects for delete using (workspace_id = pm.org() and pm.org_role() in ('owner','admin') and deleted_at is not null);

alter table pm_project_members enable row level security;
create policy sel on pm_project_members for select using (workspace_id = pm.org() and pm.project_role(project_id) is not null);
create policy ins on pm_project_members for insert with check (workspace_id = pm.org() and pm.can(project_id, 'manager')
  and not exists (select 1 from pm_projects p where p.id = project_id and p.is_personal and user_id <> p.owner_id));
create policy upd on pm_project_members for update using (workspace_id = pm.org() and pm.can(project_id, 'manager'));
create policy del on pm_project_members for delete using (workspace_id = pm.org() and pm.can(project_id, 'manager'));

do $$ declare t text; begin
  foreach t in array array['pm_sections','pm_tasks','pm_checklist_items','pm_dependencies','pm_task_tags','pm_followers',
                           'pm_attachments','pm_time_entries','pm_project_links','pm_comments'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy sel on %I for select using (workspace_id = pm.org() and pm.project_role(project_id) is not null)', t);
    execute format('create policy ins on %I for insert with check (workspace_id = pm.org() and pm.can(project_id, %L))', t,
      case when t in ('pm_followers','pm_comments','pm_time_entries') then 'viewer' else 'editor' end);
    execute format('create policy upd on %I for update using (workspace_id = pm.org() and pm.can(project_id, %L)) with check (workspace_id = pm.org())', t,
      case when t in ('pm_comments','pm_time_entries') then 'viewer' else 'editor' end);
    execute format('create policy del on %I for delete using (workspace_id = pm.org() and pm.can(project_id, %L))', t,
      case when t in ('pm_followers','pm_time_entries') then 'viewer' else 'editor' end);
  end loop;
end $$;
-- Viewers may comment, follow and track their own time; only on their own rows.
create policy own on pm_comments as restrictive for update using (author_id = pm.uid() or pm.org_role() in ('owner','admin'));
create policy own_ins on pm_comments as restrictive for insert with check (author_id = pm.uid());
create policy own on pm_followers as restrictive for insert with check (user_id = pm.uid() or pm.can(project_id, 'editor'));
create policy own on pm_time_entries as restrictive for all using (user_id = pm.uid() or pm.can(project_id, 'manager'))
  with check (user_id = pm.uid() or pm.can(project_id, 'manager'));

alter table pm_tags enable row level security;
create policy sel on pm_tags for select using (workspace_id = pm.org() and pm.org_role() is not null);
create policy ins on pm_tags for insert with check (workspace_id = pm.org() and pm.org_role() in ('owner','admin','editor'));
create policy upd on pm_tags for update using (workspace_id = pm.org() and pm.org_role() in ('owner','admin'));
create policy del on pm_tags for delete using (workspace_id = pm.org() and pm.org_role() in ('owner','admin'));

alter table pm_activity enable row level security;
create policy sel on pm_activity for select using (workspace_id = pm.org() and pm.project_role(project_id) is not null);
create policy ins on pm_activity for insert with check (workspace_id = pm.org() and actor_id = pm.uid() and pm.project_role(project_id) is not null);

alter table pm_notifications enable row level security;
create policy sel on pm_notifications for select using (workspace_id = pm.org() and user_id = pm.uid() and pm.project_role(project_id) is not null);
create policy ins on pm_notifications for insert with check (workspace_id = pm.org() and actor_id = pm.uid() and pm.project_role(project_id) is not null);
create policy upd on pm_notifications for update using (workspace_id = pm.org() and user_id = pm.uid());
create policy del on pm_notifications for delete using (workspace_id = pm.org() and user_id = pm.uid());

alter table pm_view_prefs enable row level security;
create policy own on pm_view_prefs for all using (workspace_id = pm.org() and user_id = pm.uid() and pm.project_role(project_id) is not null)
  with check (workspace_id = pm.org() and user_id = pm.uid() and pm.project_role(project_id) is not null);


-- ======== from Projects V2 db/migrations/0002_task_links.sql ========
-- 0002: links attached to a task (https only). Applied once per database by server/db.ts (recorded in pm_meta).
create table if not exists pm_task_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  task_id uuid not null,
  title text not null check (length(btrim(title)) between 1 and 200),
  url text not null check (url ~ '^https://' and length(url) <= 2000),
  created_by uuid,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, task_id) references pm_tasks(workspace_id, id) on delete cascade
);
create index if not exists pm_task_links_task on pm_task_links (task_id);

drop trigger if exists s on pm_task_links;
create trigger s before insert or update on pm_task_links for each row execute function pm.child_scope();

grant select, insert, update, delete on pm_task_links to app_user;
alter table pm_task_links enable row level security;
drop policy if exists sel on pm_task_links;
drop policy if exists ins on pm_task_links;
drop policy if exists upd on pm_task_links;
drop policy if exists del on pm_task_links;
create policy sel on pm_task_links for select using (workspace_id = pm.org() and pm.project_role(project_id) is not null);
create policy ins on pm_task_links for insert with check (workspace_id = pm.org() and pm.can(project_id, 'editor'));
create policy upd on pm_task_links for update using (workspace_id = pm.org() and pm.can(project_id, 'editor')) with check (workspace_id = pm.org());
create policy del on pm_task_links for delete using (workspace_id = pm.org() and pm.can(project_id, 'editor'));


-- ======== from Projects V2 db/migrations/0003_task_assignees.sql ========
-- 0003: several assignees per task. Applied once per database by server/db.ts (recorded in pm_meta); written to be re-runnable anyway.
-- pm_tasks.assignee_id is replaced by pm_task_assignees (one row per task and person); existing assignments are copied first.
create table if not exists pm_task_assignees (
  workspace_id uuid not null,
  project_id uuid not null,
  task_id uuid not null,
  user_id uuid not null,
  added_at timestamptz not null default now(),
  primary key (task_id, user_id),
  foreign key (workspace_id, task_id) references pm_tasks(workspace_id, id) on delete cascade,
  foreign key (workspace_id, user_id) references public.memberships(workspace_id, user_id)
);
-- "My open tasks" and "tasks of person X": look up by person inside the organization, then join to the task.
create index if not exists pm_task_assignees_user on pm_task_assignees (workspace_id, user_id, task_id);

drop trigger if exists s on pm_task_assignees;
create trigger s before insert or update on pm_task_assignees for each row execute function pm.child_scope();

grant select, insert, delete on pm_task_assignees to app_user;
alter table pm_task_assignees enable row level security;
drop policy if exists sel on pm_task_assignees;
drop policy if exists ins on pm_task_assignees;
drop policy if exists del on pm_task_assignees;
create policy sel on pm_task_assignees for select using (workspace_id = pm.org() and pm.project_role(project_id) is not null);
create policy ins on pm_task_assignees for insert with check (workspace_id = pm.org() and pm.can(project_id, 'editor'));
create policy del on pm_task_assignees for delete using (workspace_id = pm.org() and pm.can(project_id, 'editor'));

-- The tasks guard no longer checks the assignee: the foreign key (workspace_id, user_id) of pm_task_assignees covers org membership.
create or replace function pm.tasks_guard() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.parent_id is not null and not exists (select 1 from pm_tasks where id = new.parent_id and project_id = new.project_id) then
    raise exception 'parent task belongs to another project' using errcode = '23514';
  end if;
  if new.parent_id = new.id then raise exception 'a task cannot be its own parent' using errcode = '23514'; end if;
  if new.section_id is not null and not exists (select 1 from pm_sections where id = new.section_id and project_id = new.project_id) then
    raise exception 'section belongs to another project' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    new.number := coalesce((select max(number) from pm_tasks where project_id = new.project_id), 0) + 1;
  end if;
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then new.completed_at := now(); end if;
  if new.status <> 'done' then new.completed_at := null; end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    new.version := old.version + 1;
  end if;
  return new;
end $$;

do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pm_tasks' and column_name = 'assignee_id') then
    insert into pm_task_assignees (workspace_id, project_id, task_id, user_id)
      select workspace_id, project_id, id, assignee_id from pm_tasks where assignee_id is not null
      on conflict do nothing;
    drop index if exists pm_tasks_assignee;
    alter table pm_tasks drop constraint if exists pm_tasks_assignee_id_fkey;
    alter table pm_tasks drop column assignee_id;
  end if;
end $$;

-- Open work by due date (workload, portfolio, overdue counts) without scanning finished or trashed tasks.
create index if not exists pm_tasks_open_due on pm_tasks (workspace_id, due_on) where deleted_at is null and status <> 'done';


-- ======== from Projects V2 db/migrations/0004_project_views_resources.sql ========
-- 0004: optional project views (Gallery, Activity, Docs, Collection), collections of files / links / embeds, spreadsheet links.
-- Applied once per database by server/db.ts (recorded in pm_meta). Every table carries workspace_id; a trigger copies it from the
-- parent project so callers cannot spoof scope, and row-level security limits reads to project members and writes to editors.

-- Child rows of a project derive workspace_id from the project (one-hop policies, no spoofing).
create or replace function pm.project_scope() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare o uuid;
begin
  select workspace_id into o from pm_projects where id = new.project_id;
  if o is null then raise exception 'project not found' using errcode = '23503'; end if;
  new.workspace_id := o;
  return new;
end $$;

-- optional views, per project
create table if not exists pm_project_views (
  workspace_id uuid not null,
  project_id uuid not null,
  kind text not null check (kind in ('gallery','activity','docs','collection')),
  position integer not null default 0,
  added_by uuid,
  created_at timestamptz not null default now(),
  primary key (project_id, kind),
  foreign key (workspace_id, project_id) references pm_projects(workspace_id, id) on delete cascade
);

-- collections and resources
create table if not exists pm_collections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 80),
  position double precision not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, project_id) references pm_projects(workspace_id, id) on delete cascade
);
create index if not exists pm_collections_project on pm_collections (project_id, position);

create table if not exists pm_resources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  collection_id uuid references pm_collections(id) on delete set null,   -- null = Unsorted
  kind text not null check (kind in ('file','link','embed')),
  title text not null check (length(btrim(title)) between 1 and 200),
  url text check (url is null or (url ~ '^https://' and length(url) <= 2000)),
  provider text,
  embed_url text check (embed_url is null or (embed_url ~ '^https://' and length(embed_url) <= 2500)),   -- computed by the server, never by the client
  file_id uuid,                              -- kind 'file': the Drive file (name, type and size come from Drive)
  description text not null default '' check (length(description) <= 2000),
  position double precision not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (workspace_id, project_id) references pm_projects(workspace_id, id) on delete cascade,
  foreign key (workspace_id, file_id) references public.files(workspace_id, id) on delete cascade,
  check ((kind = 'file' and file_id is not null and url is null and embed_url is null)
      or (kind = 'link' and url is not null and file_id is null and embed_url is null)
      or (kind = 'embed' and url is not null and file_id is null and embed_url is not null))
);
create index if not exists pm_resources_project on pm_resources (project_id, collection_id, position) where deleted_at is null;

-- A resource may only sit in a collection of its own project.
create or replace function pm.resource_guard() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.collection_id is not null and not exists (select 1 from pm_collections where id = new.collection_id and project_id = new.project_id) then
    raise exception 'collection not found' using errcode = '23503';
  end if;
  return new;
end $$;

do $$ declare t text; begin
  foreach t in array array['pm_project_views','pm_collections','pm_resources'] loop
    execute format('drop trigger if exists s on %I', t);
    execute format('create trigger s before insert or update on %I for each row execute function pm.project_scope()', t);
  end loop;
end $$;
drop trigger if exists g on pm_resources;
create trigger g before insert or update on pm_resources for each row execute function pm.resource_guard();

grant select, insert, update, delete on pm_project_views, pm_collections, pm_resources to app_user;

do $$ declare t text; begin
  foreach t in array array['pm_project_views','pm_collections','pm_resources'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists sel on %I', t);
    execute format('drop policy if exists ins on %I', t);
    execute format('drop policy if exists upd on %I', t);
    execute format('drop policy if exists del on %I', t);
    execute format('create policy sel on %I for select using (workspace_id = pm.org() and pm.project_role(project_id) is not null)', t);
    execute format('create policy ins on %I for insert with check (workspace_id = pm.org() and pm.can(project_id, ''editor''))', t);
    execute format('create policy upd on %I for update using (workspace_id = pm.org() and pm.can(project_id, ''editor'')) with check (workspace_id = pm.org())', t);
    execute format('create policy del on %I for delete using (workspace_id = pm.org() and pm.can(project_id, ''editor''))', t);
  end loop;
end $$;

grant execute on function pm.project_scope(), pm.resource_guard() to app_user;

-- Ecosystem documents are linked by reference: project links gain the 'sheet' (spreadsheet) kind.
alter table pm_project_links drop constraint if exists pm_project_links_kind_check;
alter table pm_project_links add constraint pm_project_links_kind_check check (kind in ('doc','whiteboard','sheet','link'));


-- ======== from Projects V2 db/migrations/0005_custom_fields.sql ========
-- 0005: custom fields for tasks (project-scoped). Applied once per database by server/db.ts (recorded in pm_meta); re-runnable.
-- pm_custom_fields: the field definitions of a project (managers). pm_task_field_values: one value per task and field (editors).
-- "Deleting" a field archives it (values are kept and come back on restore); purging removes the field and its values.
-- options: select / multiselect = [{id,label,color}] (max 50); currency = {"code":"USD"}; number = {"decimals":0..4}; other types = {}.

create table if not exists pm_custom_fields (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 60),
  type text not null check (type in ('text','number','currency','select','multiselect','date','checkbox','url')),
  options jsonb not null default '{}'::jsonb,
  position double precision not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (workspace_id, id),
  foreign key (workspace_id, project_id) references pm_projects(workspace_id, id) on delete cascade,
  check (
    (type in ('select','multiselect') and jsonb_typeof(options) = 'array' and jsonb_array_length(options) <= 50)
    or (type = 'currency' and jsonb_typeof(options) = 'object' and options->>'code' ~ '^[A-Z]{3}$')
    or (type = 'number' and jsonb_typeof(options) = 'object' and options->>'decimals' ~ '^[0-4]$')
    or (type in ('text','date','checkbox','url') and jsonb_typeof(options) = 'object')
  )
);
-- Names are unique per project, ignoring case (archived fields keep their name so a restore can never collide).
create unique index if not exists pm_custom_fields_name on pm_custom_fields (project_id, lower(btrim(name)));
create index if not exists pm_custom_fields_project on pm_custom_fields (project_id, position);

create table if not exists pm_task_field_values (
  workspace_id uuid not null,
  project_id uuid not null,
  task_id uuid not null,
  field_id uuid not null,
  value jsonb not null,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key (task_id, field_id),
  foreign key (workspace_id, task_id) references pm_tasks(workspace_id, id) on delete cascade,
  foreign key (workspace_id, field_id) references pm_custom_fields(workspace_id, id) on delete cascade
);
create index if not exists pm_task_field_values_field on pm_task_field_values (field_id);
create index if not exists pm_task_field_values_project on pm_task_field_values (project_id);

-- Fields derive workspace_id from their project; values derive workspace_id / project_id from their task and must use a field of that same project.
drop trigger if exists s on pm_custom_fields;
create trigger s before insert or update on pm_custom_fields for each row execute function pm.project_scope();

create or replace function pm.field_value_guard() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare t record;
begin
  select workspace_id, project_id into t from pm_tasks where id = new.task_id;
  if t is null then raise exception 'task not found' using errcode = '23503'; end if;
  new.workspace_id := t.workspace_id; new.project_id := t.project_id;
  if not exists (select 1 from pm_custom_fields where id = new.field_id and project_id = t.project_id) then
    raise exception 'field belongs to another project' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists s on pm_task_field_values;
create trigger s before insert or update on pm_task_field_values for each row execute function pm.field_value_guard();
grant execute on function pm.field_value_guard() to app_user;

grant select, insert, update, delete on pm_custom_fields, pm_task_field_values to app_user;
alter table pm_custom_fields enable row level security;
alter table pm_task_field_values enable row level security;
drop policy if exists sel on pm_custom_fields;
drop policy if exists ins on pm_custom_fields;
drop policy if exists upd on pm_custom_fields;
drop policy if exists del on pm_custom_fields;
create policy sel on pm_custom_fields for select using (workspace_id = pm.org() and pm.project_role(project_id) is not null);
create policy ins on pm_custom_fields for insert with check (workspace_id = pm.org() and pm.can(project_id, 'manager'));
create policy upd on pm_custom_fields for update using (workspace_id = pm.org() and pm.can(project_id, 'manager')) with check (workspace_id = pm.org() and pm.can(project_id, 'manager'));
create policy del on pm_custom_fields for delete using (workspace_id = pm.org() and pm.can(project_id, 'manager'));

drop policy if exists sel on pm_task_field_values;
drop policy if exists ins on pm_task_field_values;
drop policy if exists upd on pm_task_field_values;
drop policy if exists del on pm_task_field_values;
create policy sel on pm_task_field_values for select using (workspace_id = pm.org() and pm.project_role(project_id) is not null);
create policy ins on pm_task_field_values for insert with check (workspace_id = pm.org() and pm.can(project_id, 'editor'));
create policy upd on pm_task_field_values for update using (workspace_id = pm.org() and pm.can(project_id, 'editor')) with check (workspace_id = pm.org() and pm.can(project_id, 'editor'));
create policy del on pm_task_field_values for delete using (workspace_id = pm.org() and pm.can(project_id, 'editor'));


-- ======== from Projects V2 db/migrations/0005_view_labels_folders.sql ========
-- 0005: per-project names for view tabs, nested collections (folders), "date updated" on collections and resources.

create table if not exists pm_project_view_labels (
  workspace_id uuid not null,
  project_id uuid not null,
  view text not null check (view in ('overview','list','board','calendar','timeline','report','docs','gallery','activity','pages','collection')),
  label text not null check (length(btrim(label)) between 1 and 40),
  primary key (project_id, view),
  foreign key (workspace_id, project_id) references pm_projects(workspace_id, id) on delete cascade
);
drop trigger if exists s on pm_project_view_labels;
create trigger s before insert or update on pm_project_view_labels for each row execute function pm.project_scope();
grant select, insert, update, delete on pm_project_view_labels to app_user;
alter table pm_project_view_labels enable row level security;
drop policy if exists sel on pm_project_view_labels;
drop policy if exists ins on pm_project_view_labels;
drop policy if exists upd on pm_project_view_labels;
drop policy if exists del on pm_project_view_labels;
create policy sel on pm_project_view_labels for select using (workspace_id = pm.org() and pm.project_role(project_id) is not null);
create policy ins on pm_project_view_labels for insert with check (workspace_id = pm.org() and pm.can(project_id, 'editor'));
create policy upd on pm_project_view_labels for update using (workspace_id = pm.org() and pm.can(project_id, 'editor')) with check (workspace_id = pm.org());
create policy del on pm_project_view_labels for delete using (workspace_id = pm.org() and pm.can(project_id, 'editor'));

-- folders inside folders
alter table pm_collections add column if not exists parent_id uuid references pm_collections(id) on delete set null;
alter table pm_collections add column if not exists updated_at timestamptz not null default now();
alter table pm_resources add column if not exists updated_at timestamptz not null default now();
create index if not exists pm_collections_parent on pm_collections (parent_id);

-- A folder lives in the same project as its parent, never inside itself or one of its own subfolders, at most 6 levels deep.
create or replace function pm.collection_guard() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare cur uuid; d int := 0;
begin
  if new.parent_id is null then return new; end if;
  if new.parent_id = new.id then raise exception 'A folder cannot be moved into itself' using errcode = '23514'; end if;
  if not exists (select 1 from pm_collections where id = new.parent_id and project_id = new.project_id) then
    raise exception 'folder not found' using errcode = '23503';
  end if;
  cur := new.parent_id;
  while cur is not null loop
    d := d + 1;
    if cur = new.id then raise exception 'A folder cannot be moved into one of its own subfolders' using errcode = '23514'; end if;
    if d > 5 then raise exception 'Folders can be nested at most 6 levels deep' using errcode = '23514'; end if;
    select parent_id into cur from pm_collections where id = cur;
  end loop;
  return new;
end $$;
drop trigger if exists g on pm_collections;
create trigger g before insert or update on pm_collections for each row execute function pm.collection_guard();
grant execute on function pm.collection_guard() to app_user;

-- ───────────── Drive files linked to tasks and collections (SDOR: Drive owns the file, Projects only points at it) ─────────────
create function pm.file_link_guard() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare f record; p record;
begin
  select space, client_id, project_id, kind into f from public.files where workspace_id = new.workspace_id and id = new.file_id;
  if f.space is null then raise exception 'file not found' using errcode = '23503'; end if;
  select client_id into p from pm_projects where id = new.project_id;
  if f.kind <> 'file' and f.kind <> 'document' then raise exception 'Only files and documents can be attached' using errcode = '23514'; end if;
  if f.space = 'personal' then raise exception 'A personal file cannot be attached: move it to a shared place first' using errcode = '23514'; end if;
  if f.project_id is distinct from new.project_id and not (f.space = 'shared' and f.client_id is null)
     and not (p.client_id is not null and f.client_id = p.client_id) then
    raise exception 'Only this project''s files, this client''s files or shared Drive files can be attached' using errcode = '23514';
  end if;
  return new;
end $$;
-- named z_* so it fires after the triggers that fill workspace_id and project_id (Postgres runs same-event triggers by name)
create trigger z_file_link before insert or update of file_id on pm_attachments for each row execute function pm.file_link_guard();
create trigger z_file_link before insert or update of file_id on pm_resources for each row when (new.file_id is not null) execute function pm.file_link_guard();

-- ======== ecosystem lockdown for every Projects V2 table ========
alter table public.pm_activity enable row level security;
alter table public.pm_activity force row level security;
create policy org_scope on public.pm_activity as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
alter table public.pm_attachments enable row level security;
alter table public.pm_attachments force row level security;
create policy org_scope on public.pm_attachments as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
alter table public.pm_checklist_items enable row level security;
alter table public.pm_checklist_items force row level security;
create policy org_scope on public.pm_checklist_items as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
alter table public.pm_collections enable row level security;
alter table public.pm_collections force row level security;
create policy org_scope on public.pm_collections as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
alter table public.pm_comments enable row level security;
alter table public.pm_comments force row level security;
create policy org_scope on public.pm_comments as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
alter table public.pm_custom_fields enable row level security;
alter table public.pm_custom_fields force row level security;
create policy org_scope on public.pm_custom_fields as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
alter table public.pm_dependencies enable row level security;
alter table public.pm_dependencies force row level security;
create policy org_scope on public.pm_dependencies as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
alter table public.pm_followers enable row level security;
alter table public.pm_followers force row level security;
create policy org_scope on public.pm_followers as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
alter table public.pm_notifications enable row level security;
alter table public.pm_notifications force row level security;
create policy org_scope on public.pm_notifications as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
alter table public.pm_project_links enable row level security;
alter table public.pm_project_links force row level security;
create policy org_scope on public.pm_project_links as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
alter table public.pm_project_members enable row level security;
alter table public.pm_project_members force row level security;
create policy org_scope on public.pm_project_members as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
alter table public.pm_project_view_labels enable row level security;
alter table public.pm_project_view_labels force row level security;
create policy org_scope on public.pm_project_view_labels as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
alter table public.pm_project_views enable row level security;
alter table public.pm_project_views force row level security;
create policy org_scope on public.pm_project_views as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
alter table public.pm_projects enable row level security;
alter table public.pm_projects force row level security;
create policy org_scope on public.pm_projects as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
alter table public.pm_resources enable row level security;
alter table public.pm_resources force row level security;
create policy org_scope on public.pm_resources as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
alter table public.pm_sections enable row level security;
alter table public.pm_sections force row level security;
create policy org_scope on public.pm_sections as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
alter table public.pm_tags enable row level security;
alter table public.pm_tags force row level security;
create policy org_scope on public.pm_tags as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
alter table public.pm_task_assignees enable row level security;
alter table public.pm_task_assignees force row level security;
create policy org_scope on public.pm_task_assignees as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
alter table public.pm_task_field_values enable row level security;
alter table public.pm_task_field_values force row level security;
create policy org_scope on public.pm_task_field_values as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
alter table public.pm_task_links enable row level security;
alter table public.pm_task_links force row level security;
create policy org_scope on public.pm_task_links as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
alter table public.pm_task_tags enable row level security;
alter table public.pm_task_tags force row level security;
create policy org_scope on public.pm_task_tags as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
alter table public.pm_tasks enable row level security;
alter table public.pm_tasks force row level security;
create policy org_scope on public.pm_tasks as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
alter table public.pm_time_entries enable row level security;
alter table public.pm_time_entries force row level security;
create policy org_scope on public.pm_time_entries as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
alter table public.pm_view_prefs enable row level security;
alter table public.pm_view_prefs force row level security;
create policy org_scope on public.pm_view_prefs as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));

-- ======== ecosystem additions (owner decisions 11 Nov 2026) ========

-- ───────────── share with client (ER3: audience is a field, default internal) ─────────────
alter table public.pm_projects add column client_visible boolean not null default false,
  add constraint pm_projects_share_needs_client check (not client_visible or client_id is not null);
alter table public.pm_tasks add column client_visible boolean not null default false;

-- Changing what a client sees needs the ecosystem's share permission on that client and project; a task can only be
-- shared inside a project that is itself shared.
create function pm.share_guard() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare old_v boolean := case when tg_op = 'UPDATE' then old.client_visible else false end; c uuid; pv boolean; pid uuid;
begin
  if new.client_visible is not distinct from old_v then return new; end if;
  if tg_table_name = 'pm_projects' then c := new.client_id; pid := new.id;
  else select p.client_id, p.client_visible, p.id into c, pv, pid from pm_projects p where p.id = new.project_id;
       if new.client_visible and not coalesce(pv, false) then raise exception 'Share the project with the client first' using errcode = '23514'; end if;
  end if;
  if pm.uid() is not null and not private.has_permission(new.workspace_id, 'projects.record.share', c, pid) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger pm_share_guard before insert or update of client_visible on pm_projects for each row execute function pm.share_guard();
create trigger pm_share_guard before insert or update of client_visible on pm_tasks for each row execute function pm.share_guard();
-- A project that stops being shared takes its tasks with it.
create function pm.unshare_tasks() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.client_visible and not new.client_visible then update pm_tasks set client_visible = false where project_id = new.id and client_visible; end if;
  return null;
end $$;
create trigger pm_unshare_tasks after update of client_visible on pm_projects for each row execute function pm.unshare_tasks();

-- ───────────── rules (the old app's basic automations, 0038, on V2's vocabulary) ─────────────
create table public.pm_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  trigger text not null check (trigger in ('created', 'status', 'section')),
  trigger_status text check (trigger_status in ('todo', 'in_progress', 'in_review', 'blocked', 'done')),
  trigger_section uuid,
  action text not null check (action in ('assign', 'priority', 'due_in', 'tag')),
  assignee_id uuid,
  priority text check (priority in ('none', 'low', 'medium', 'high', 'urgent')),
  due_in_days int check (due_in_days between 0 and 365),
  tag_id uuid,
  enabled boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, project_id) references pm_projects(workspace_id, id) on delete cascade,
  foreign key (workspace_id, tag_id) references pm_tags(workspace_id, id) on delete cascade,
  foreign key (workspace_id, assignee_id) references public.memberships(workspace_id, user_id),
  constraint pm_rules_trigger_complete check (
    (trigger = 'created' and trigger_status is null and trigger_section is null)
    or (trigger = 'status' and trigger_status is not null and trigger_section is null)
    or (trigger = 'section' and trigger_section is not null and trigger_status is null)),
  constraint pm_rules_action_complete check (
    (action = 'assign' and assignee_id is not null) or (action = 'priority' and priority is not null)
    or (action = 'due_in' and due_in_days is not null) or (action = 'tag' and tag_id is not null))
);
create index pm_rules_project on public.pm_rules (project_id) where enabled;

create function pm.rules_guard() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  select workspace_id into new.workspace_id from pm_projects where id = new.project_id;
  if new.workspace_id is null then raise exception 'project not found' using errcode = '23503'; end if;
  if new.trigger_section is not null and not exists (select 1 from pm_sections s where s.id = new.trigger_section and s.project_id = new.project_id) then
    raise exception 'section belongs to another project' using errcode = '23514';
  end if;
  if new.assignee_id is not null and not pm.user_can_view(new.project_id, new.assignee_id) then
    raise exception 'That person cannot view this project' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := pm.uid();
    if (select count(*) from pm_rules r where r.project_id = new.project_id) >= 30 then
      raise exception 'A project can have at most 30 rules' using errcode = '23514';
    end if;
  else
    if new.project_id is distinct from old.project_id then raise exception 'records do not move' using errcode = '23514'; end if;
    new.updated_at := now();
  end if;
  return new;
end $$;
create trigger pm_rules_guard before insert or update on pm_rules for each row execute function pm.rules_guard();
-- Deleting a section removes the rules that watched it.
create function pm.rules_section_gone() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin delete from pm_rules where trigger_section = old.id; return null; end $$;
create trigger pm_rules_section_gone after delete on pm_sections for each row execute function pm.rules_section_gone();

create function pm.rule_fires(r pm_rules, op text, n pm_tasks, o pm_tasks) returns boolean language sql stable set search_path = public, pg_temp as $$
  select case r.trigger
    when 'created' then op = 'INSERT'
    when 'status' then n.status = r.trigger_status and (op = 'INSERT' or o.status is distinct from n.status)
    when 'section' then n.section_id = r.trigger_section and (op = 'INSERT' or o.section_id is distinct from n.section_id)
  end
$$;

-- Priority and due date: before the row is written (named to run before pm_tasks_guard). On creation a rule only fills
-- what the person left empty; on a move it sets the value. Actions never change status or section: no rule loops.
create function pm.tasks_automate() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare r pm_rules; o pm_tasks; ins boolean := tg_op = 'INSERT';
begin
  if not ins then o := old; end if;
  if new.parent_id is not null then return new; end if;   -- rules act on tasks, not subtasks
  for r in select * from pm_rules x where x.project_id = new.project_id and x.enabled and x.action in ('priority', 'due_in') order by x.created_at, x.id loop
    if pm.rule_fires(r, tg_op, new, o) then
      if r.action = 'priority' and (not ins or new.priority = 'none') then new.priority := r.priority;
      elsif r.action = 'due_in' and (not ins or new.due_on is null) then
        new.due_on := current_date + r.due_in_days;
        if new.start_on is not null and new.start_on > new.due_on then new.start_on := new.due_on; end if;
      end if;
    end if;
  end loop;
  return new;
end $$;
create trigger pm_tasks_aautomate before insert or update of status, section_id on pm_tasks for each row execute function pm.tasks_automate();

-- Assignee and tag: once the task exists. "When added, assign" is checked at the end of the transaction, after the person's
-- own choice of assignees has been saved, so it only fills an empty task.
create function pm.tasks_automate_after() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare r pm_rules; o pm_tasks; cur pm_tasks;
begin
  select * into cur from pm_tasks where id = new.id;
  if cur.id is null or cur.parent_id is not null or cur.deleted_at is not null then return null; end if;
  if tg_op = 'UPDATE' then o := old; end if;
  for r in select * from pm_rules x where x.project_id = cur.project_id and x.enabled and x.action in ('assign', 'tag') order by x.created_at, x.id loop
    if pm.rule_fires(r, tg_op, new, o) then
      if r.action = 'tag' then
        insert into pm_task_tags (task_id, tag_id) values (cur.id, r.tag_id) on conflict do nothing;
      elsif r.action = 'assign' and (tg_op = 'UPDATE' or not exists (select 1 from pm_task_assignees a where a.task_id = cur.id))
            and pm.user_can_view(cur.project_id, r.assignee_id) then
        insert into pm_task_assignees (task_id, user_id) values (cur.id, r.assignee_id) on conflict do nothing;
        insert into pm_followers (task_id, user_id) values (cur.id, r.assignee_id) on conflict do nothing;
      end if;
    end if;
  end loop;
  return null;
end $$;
create constraint trigger pm_tasks_automate_after after insert or update of status, section_id on pm_tasks
  deferrable initially deferred for each row execute function pm.tasks_automate_after();

alter table public.pm_rules enable row level security;
alter table public.pm_rules force row level security;
create policy org_scope on public.pm_rules as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
create policy sel on pm_rules for select using (workspace_id = pm.org() and pm.project_role(project_id) is not null);
create policy ins on pm_rules for insert with check (workspace_id = pm.org() and pm.can(project_id, 'manager'));
create policy upd on pm_rules for update using (workspace_id = pm.org() and pm.can(project_id, 'manager')) with check (workspace_id = pm.org() and pm.can(project_id, 'manager'));
create policy del on pm_rules for delete using (workspace_id = pm.org() and pm.can(project_id, 'manager'));

-- ───────────── ecosystem audit trail for the sensitive changes ─────────────
create trigger audit_pm_projects after insert or update or delete on public.pm_projects
  for each row execute function private.audit_change('name', 'status', 'owner_id', 'client_id', 'visibility', 'is_personal', 'client_visible', 'archived_at', 'deleted_at');
create trigger audit_pm_project_members after insert or update or delete on public.pm_project_members
  for each row execute function private.audit_change('project_id', 'user_id', 'role');
create trigger audit_pm_rules after insert or update or delete on public.pm_rules
  for each row execute function private.audit_change('project_id', 'trigger', 'action', 'enabled');

-- ───────────── grants: the API role only; browser roles get nothing ─────────────
grant usage on schema pm to app_user;
revoke all on all functions in schema pm from public;
grant execute on all functions in schema pm to app_user;
grant select on public.pm_people, public.pm_members, public.pm_clients to app_user;
grant select, insert, update, delete on public.pm_rules to app_user;

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
      execute format('revoke all on schema pm from %I', r);
      execute format('revoke all on all functions in schema pm from %I', r);
    end if;
  end loop;
end $$;
