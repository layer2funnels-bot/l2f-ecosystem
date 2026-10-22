set check_function_bodies = off;
-- 0019 · Form Builder data layer (Phase 6, data and API only). Forms with immutable versions of their fields, and submissions recorded by
-- signed-in staff against a published version. There is NO public submission path and no client-facing path (the Portal does not offer forms yet).
-- The app is "coming soon" until the owner activates it. Same standards as Clients: one organization per row, shared permission engine
-- (organization-wide or one client), audited without answers, archive before delete, composite keys, Data API closed.

insert into public.permissions (key, app_key, description, floor_role, default_role, scopes, sensitive) values
  ('forms.form.view',         'forms', 'View forms and their versions',                       'viewer', 'viewer', '{workspace,client}', false),
  ('forms.form.create',       'forms', 'Create forms',                                        'editor', 'editor', '{workspace,client}', false),
  ('forms.form.edit',         'forms', 'Edit fields (a new version), publish, archive forms', 'editor', 'editor', '{workspace,client}', false),
  ('forms.form.delete',       'forms', 'Permanently delete an ARCHIVED form',                 'admin',  'owner',  '{workspace}', true),
  ('forms.submission.view',   'forms', 'Read submitted answers',                              'editor', 'editor', '{workspace,client}', true),
  ('forms.submission.create', 'forms', 'Record a submission on a published form',             'editor', 'editor', '{workspace,client}', false),
  ('forms.submission.delete', 'forms', 'Permanently delete an ARCHIVED submission',           'admin',  'owner',  '{workspace}', true);

create table public.forms (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid,
  name text not null check (length(name) between 1 and 200),
  description text check (length(description) <= 4000),
  status text not null default 'draft' check (status in ('draft', 'published')),
  current_version int not null default 0 check (current_version >= 0),
  archived_at timestamptz,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (status = 'draft' or current_version >= 1),
  unique (workspace_id, id),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id)
);
create index forms_ws on public.forms (workspace_id) where archived_at is null;

create table public.form_versions (                -- immutable: a change to the fields is a new version
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  form_id uuid not null,
  version int not null check (version >= 1),
  fields jsonb not null,
  created_by uuid, created_at timestamptz not null default now(),
  primary key (form_id, version),
  foreign key (workspace_id, form_id) references public.forms (workspace_id, id)
);

create table public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  form_id uuid not null,
  form_version int not null,
  client_id uuid,                                  -- from the form
  answers jsonb not null,
  submitted_by uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, form_id) references public.forms (workspace_id, id),
  foreign key (form_id, form_version) references public.form_versions (form_id, version)
);
create index form_submissions_form on public.form_submissions (workspace_id, form_id, created_at desc);

-- ------------------------------------------------------------------ field definitions: what a version may contain
create or replace function private.form_fields_valid(f jsonb) returns text
language plpgsql immutable set search_path = '' as $$
declare e jsonb; k text; seen text[] := '{}'; t text; o jsonb;
begin
  if jsonb_typeof(f) <> 'array' then return 'fields must be a list'; end if;
  if jsonb_array_length(f) > 60 then return 'at most 60 fields'; end if;
  if octet_length(f::text) > 60000 then return 'the form is too large'; end if;
  for e in select * from jsonb_array_elements(f) loop
    if jsonb_typeof(e) <> 'object' then return 'each field must be an object'; end if;
    k := e ->> 'key'; t := e ->> 'type';
    if k is null or k !~ '^[a-z][a-z0-9_]{0,39}$' then return 'a field key is missing or invalid'; end if;
    if k = any(seen) then return 'duplicate field key ' || k; end if;
    seen := seen || k;
    if t is null or t not in ('text', 'textarea', 'email', 'number', 'date', 'select', 'multi_select', 'checkbox') then return 'unknown field type for ' || k; end if;
    if e ->> 'label' is null or length(e ->> 'label') not between 1 and 200 then return 'a field label is missing or too long'; end if;
    if jsonb_typeof(e -> 'required') not in ('boolean') and e ? 'required' then return 'required must be true or false'; end if;
    if t in ('select', 'multi_select') then
      o := e -> 'options';
      if o is null or jsonb_typeof(o) <> 'array' or jsonb_array_length(o) not between 1 and 50 then return 'choices need 1 to 50 options (' || k || ')'; end if;
      if exists (select 1 from jsonb_array_elements(o) x where jsonb_typeof(x) <> 'string' or length(x #>> '{}') not between 1 and 100) then return 'options must be short text (' || k || ')'; end if;
    end if;
  end loop;
  return null;
end $$;

-- answers against the version they were given for: unknown keys, missing required ones and wrong types are refused
create or replace function private.form_answers_valid(f jsonb, a jsonb) returns text
language plpgsql immutable set search_path = '' as $$
declare e jsonb; k text; t text; v jsonb;
begin
  if jsonb_typeof(a) <> 'object' then return 'answers must be an object'; end if;
  if octet_length(a::text) > 100000 then return 'answers are too large'; end if;
  if exists (select 1 from jsonb_object_keys(a) ak where not exists (select 1 from jsonb_array_elements(f) fe where fe ->> 'key' = ak)) then return 'an answer does not belong to this form'; end if;
  for e in select * from jsonb_array_elements(f) loop
    k := e ->> 'key'; t := e ->> 'type'; v := a -> k;
    if v is null or v = 'null'::jsonb or v = '""'::jsonb or v = '[]'::jsonb then
      if coalesce((e ->> 'required')::boolean, false) and t <> 'checkbox' then return 'required: ' || k; end if;
      continue;
    end if;
    if t in ('text', 'textarea') and (jsonb_typeof(v) <> 'string' or length(v #>> '{}') > 10000) then return 'text expected: ' || k; end if;
    if t = 'email' and (jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^[^\s@]{1,64}@[^\s@]{1,255}$') then return 'e-mail expected: ' || k; end if;
    if t = 'number' and jsonb_typeof(v) <> 'number' then return 'number expected: ' || k; end if;
    if t = 'date' and (jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$') then return 'date expected: ' || k; end if;
    if t = 'checkbox' and jsonb_typeof(v) <> 'boolean' then return 'yes or no expected: ' || k; end if;
    if t = 'select' and not (e -> 'options') @> jsonb_build_array(v) then return 'one of the options expected: ' || k; end if;
    if t = 'multi_select' and (jsonb_typeof(v) <> 'array' or exists (select 1 from jsonb_array_elements(v) x where not (e -> 'options') @> jsonb_build_array(x))) then return 'options expected: ' || k; end if;
  end loop;
  return null;
end $$;

-- ------------------------------------------------------------------ guards
create or replace function private.forms_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id();
begin
  if tg_op = 'INSERT' then
    if uid is not null then new.created_by := uid; end if;
    new.status := 'draft'; new.current_version := 0;
  else
    if new.workspace_id is distinct from old.workspace_id or new.client_id is distinct from old.client_id or new.created_by is distinct from old.created_by then
      raise exception 'records do not move' using errcode = 'P0001';
    end if;
    if new.current_version is distinct from old.current_version and (new.current_version <> old.current_version + 1 or pg_trigger_depth() < 2) then
      raise exception 'versions are created by saving the fields' using errcode = 'P0001';
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;
create trigger forms_guard before insert or update on public.forms for each row execute function private.forms_guard();

create or replace function private.form_versions_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); cur int; found boolean; bad text;
begin
  if tg_op <> 'INSERT' then raise exception 'versions are history and cannot change' using errcode = 'P0001'; end if;
  select true, f.current_version into found, cur from public.forms f where f.workspace_id = new.workspace_id and f.id = new.form_id and f.archived_at is null;
  if found is not true then raise exception 'not found' using errcode = '42501'; end if;
  new.version := cur + 1;
  bad := private.form_fields_valid(new.fields);
  if bad is not null then raise exception '%', bad using errcode = 'P0001'; end if;
  if uid is not null then new.created_by := uid; end if;
  return new;
end $$;
create trigger form_versions_guard before insert or update or delete on public.form_versions for each row execute function private.form_versions_guard();
create or replace function private.form_versions_after() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.forms set current_version = new.version where workspace_id = new.workspace_id and id = new.form_id;
  return null;
end $$;
create trigger form_versions_after after insert on public.form_versions for each row execute function private.form_versions_after();

create or replace function private.form_submissions_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); fc uuid; st text; cur int; arch timestamptz; found boolean; fields jsonb; bad text;
begin
  if tg_op = 'UPDATE' then
    if to_jsonb(new) - 'archived_at' is distinct from to_jsonb(old) - 'archived_at' then raise exception 'a submission cannot be edited' using errcode = 'P0001'; end if;
    return new;
  end if;
  select true, f.client_id, f.status, f.current_version, f.archived_at into found, fc, st, cur, arch from public.forms f where f.workspace_id = new.workspace_id and f.id = new.form_id;
  if found is not true then raise exception 'not found' using errcode = '42501'; end if;
  if arch is not null or st <> 'published' then raise exception 'this form is not published' using errcode = 'P0001'; end if;
  new.form_version := cur; new.client_id := fc;
  select v.fields into fields from public.form_versions v where v.form_id = new.form_id and v.version = cur;
  bad := private.form_answers_valid(fields, new.answers);
  if bad is not null then raise exception '%', bad using errcode = 'P0001'; end if;
  if uid is not null then new.submitted_by := uid; end if;
  new.archived_at := null;
  return new;
end $$;
create trigger form_submissions_guard before insert or update on public.form_submissions for each row execute function private.form_submissions_guard();

create trigger forms_refuse_delete before delete on public.forms for each row execute function private.archive_before_delete();
create trigger form_submissions_refuse_delete before delete on public.form_submissions for each row execute function private.archive_before_delete();
create or replace function private.forms_in_use() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.form_submissions where form_id = old.id) then raise exception 'archive this form instead: it has submissions' using errcode = 'P0001'; end if;
  return old;
end $$;
create trigger forms_in_use before delete on public.forms for each row execute function private.forms_in_use();

-- ------------------------------------------------------------------ policies
do $$
declare t text;
begin
  foreach t in array array['forms', 'form_versions', 'form_submissions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('create policy org_scope on public.%I as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id))', t);
  end loop;
end $$;
create policy forms_select on public.forms for select using (private.has_permission(workspace_id, 'forms.form.view', client_id));
create policy forms_insert on public.forms for insert with check (private.has_permission(workspace_id, 'forms.form.create', client_id));
create policy forms_update on public.forms for update using (private.has_permission(workspace_id, 'forms.form.edit', client_id)) with check (private.has_permission(workspace_id, 'forms.form.edit', client_id));
create policy forms_delete on public.forms for delete using (private.has_permission(workspace_id, 'forms.form.delete'));
create policy form_versions_select on public.form_versions for select using (exists (select 1 from public.forms f where f.workspace_id = form_versions.workspace_id and f.id = form_versions.form_id));
create policy form_versions_insert on public.form_versions for insert with check (
  private.has_permission(workspace_id, 'forms.form.edit', (select f.client_id from public.forms f where f.workspace_id = form_versions.workspace_id and f.id = form_versions.form_id)));
create policy form_submissions_select on public.form_submissions for select using (private.has_permission(workspace_id, 'forms.submission.view', client_id));
create policy form_submissions_insert on public.form_submissions for insert with check (
  private.has_permission(workspace_id, 'forms.submission.create', (select f.client_id from public.forms f where f.workspace_id = form_submissions.workspace_id and f.id = form_submissions.form_id)));
create policy form_submissions_update on public.form_submissions for update using (private.has_permission(workspace_id, 'forms.submission.view', client_id) and private.has_permission(workspace_id, 'forms.form.edit', client_id))
  with check (private.has_permission(workspace_id, 'forms.form.edit', client_id));
create policy form_submissions_delete on public.form_submissions for delete using (private.has_permission(workspace_id, 'forms.submission.delete'));

-- ------------------------------------------------------------------ audit: names, statuses and versions; never answers
create trigger audit_forms after insert or update or delete on public.forms for each row execute function private.audit_change('client_id', 'name', 'status', 'current_version', 'archived_at');
create trigger audit_form_versions after insert on public.form_versions for each row execute function private.audit_change('form_id', 'version');
create trigger audit_form_submissions after insert or update or delete on public.form_submissions for each row execute function private.audit_change('form_id', 'form_version', 'client_id', 'archived_at');

create or replace function private.refuse_delete_forms_clients() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.forms where client_id = old.id) then raise exception 'archive this client instead: it still has work' using errcode = 'P0001'; end if;
  return old;
end $$;
create trigger clients_refuse_delete_forms before delete on public.clients for each row execute function private.refuse_delete_forms_clients();

-- approvals may ask about a form
create or replace function private.approval_subject(ws uuid, t text, sid uuid, out s_found boolean, out s_client uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  s_found := null; s_client := null;
  if t in ('deliverable', 'file', 'document') then select true, f.client_id into s_found, s_client from public.files f where f.workspace_id = ws and f.id = sid;
  elsif t = 'project' then select true, p.client_id into s_found, s_client from public.projects p where p.workspace_id = ws and p.id = sid;
  elsif t = 'task' then select true, k.client_id into s_found, s_client from public.project_tasks k where k.workspace_id = ws and k.id = sid;
  elsif t = 'form' then select true, f.client_id into s_found, s_client from public.forms f where f.workspace_id = ws and f.id = sid;
  else s_found := true;
  end if;
end $$;

revoke all on all functions in schema private from public;
grant select, insert, update, delete on public.forms to app_user;
grant select, insert on public.form_versions to app_user;
grant select, insert, update, delete on public.form_submissions to app_user;
