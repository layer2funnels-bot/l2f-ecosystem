set check_function_bodies = off;
-- 0021 · Social Planner data layer (Phase 6, data and API only). A content calendar: posts per channel with a caption, media from Drive,
-- a planned time and a status that moves idea -> draft -> in review -> approved -> scheduled -> published. It PLANS; it never publishes
-- (publishing stays in the marketing platform; "published" is recorded by a person). Review uses Approvals (migration 0017): asking for review
-- creates an approval of the post and the decision moves the post. Internal only. "Coming soon" until the owner activates the app.

insert into public.permissions (key, app_key, description, floor_role, default_role, scopes, sensitive) values
  ('social.post.view',     'social_planner', 'View the calendar and posts',                          'viewer', 'viewer', '{workspace,client}', false),
  ('social.post.create',   'social_planner', 'Create posts',                                         'editor', 'editor', '{workspace,client}', false),
  ('social.post.edit',     'social_planner', 'Edit posts, attach media, plan and archive',           'editor', 'editor', '{workspace,client}', false),
  ('social.post.schedule', 'social_planner', 'Schedule a post and record that it was published',     'editor', 'editor', '{workspace,client}', false),
  ('social.post.delete',   'social_planner', 'Permanently delete an ARCHIVED post',                  'admin',  'owner',  '{workspace}', true);

create table public.social_posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid,
  channel text not null check (channel in ('facebook', 'instagram', 'linkedin', 'x', 'tiktok', 'youtube', 'pinterest', 'email', 'other')),
  title text not null check (length(title) between 1 and 200),
  caption text check (length(caption) <= 5000),
  scheduled_for timestamptz,
  status text not null default 'idea' check (status in ('idea', 'draft', 'in_review', 'approved', 'scheduled', 'published')),
  published_at timestamptz,
  archived_at timestamptz,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (status <> 'scheduled' or scheduled_for is not null),
  unique (workspace_id, id),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id)
);
create index social_posts_cal on public.social_posts (workspace_id, scheduled_for) where archived_at is null;

create table public.social_post_files (              -- media: files from Drive, by reference
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  post_id uuid not null,
  file_id uuid not null,
  position int not null default 1 check (position between 1 and 10),
  created_by uuid, created_at timestamptz not null default now(),
  primary key (post_id, file_id),
  foreign key (workspace_id, post_id) references public.social_posts (workspace_id, id) on delete cascade,
  foreign key (workspace_id, file_id) references public.files (workspace_id, id)
);

create or replace function private.social_posts_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); deep boolean := pg_trigger_depth() >= 2; locked boolean;
begin
  if tg_op = 'INSERT' then
    if uid is not null then new.created_by := uid; end if;
    if new.status not in ('idea', 'draft') then raise exception 'a new post starts as an idea or a draft' using errcode = 'P0001'; end if;
    new.published_at := null; new.archived_at := null;
  else
    if new.workspace_id is distinct from old.workspace_id or new.client_id is distinct from old.client_id or new.created_by is distinct from old.created_by then
      raise exception 'records do not move' using errcode = 'P0001';
    end if;
    locked := old.status in ('in_review', 'approved', 'scheduled', 'published');
    -- what was approved is what is published: content cannot change while the post is under review, approved, scheduled or published
    if locked and (new.title is distinct from old.title or new.caption is distinct from old.caption or new.channel is distinct from old.channel) then
      raise exception 'send the post back to draft before changing its content' using errcode = 'P0001';
    end if;
    if new.status is distinct from old.status then
      if new.status in ('in_review', 'approved') and not deep then raise exception 'review and approval come from the approval of the post' using errcode = 'P0001'; end if;
      if old.status = 'published' then raise exception 'a published post is final (archive it)' using errcode = 'P0001'; end if;
      if old.status = 'in_review' and not deep then raise exception 'withdraw or decide the approval first' using errcode = 'P0001'; end if;
      if new.status in ('scheduled', 'published') and uid is not null and not private.has_permission(new.workspace_id, 'social.post.schedule', new.client_id) then raise exception 'not found' using errcode = '42501'; end if;
      if new.status = 'scheduled' and old.status <> 'approved' then raise exception 'only an approved post can be scheduled' using errcode = 'P0001'; end if;
      if new.status = 'published' and old.status not in ('approved', 'scheduled') then raise exception 'only an approved or scheduled post can be marked published' using errcode = 'P0001'; end if;
      if new.status = 'published' then new.published_at := now(); end if;
      if new.status in ('idea', 'draft') then new.scheduled_for := case when new.status = 'idea' then null else new.scheduled_for end; end if;
    end if;
    if new.published_at is distinct from old.published_at and new.status <> 'published' then new.published_at := old.published_at; end if;
    new.updated_at := now();
  end if;
  return new;
end $$;
create trigger social_posts_guard before insert or update on public.social_posts for each row execute function private.social_posts_guard();

create or replace function private.social_post_files_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); pc uuid; pfound boolean; fc uuid; ffound boolean; n int;
begin
  select true, p.client_id into pfound, pc from public.social_posts p where p.workspace_id = new.workspace_id and p.id = new.post_id and p.archived_at is null;
  select true, f.client_id into ffound, fc from public.files f where f.workspace_id = new.workspace_id and f.id = new.file_id and f.archived_at is null;
  if pfound is not true or ffound is not true then raise exception 'not found' using errcode = '42501'; end if;
  if fc is not null and fc is distinct from pc then raise exception 'a post can only use this client''s files or shared ones' using errcode = 'P0001'; end if;
  select count(*) into n from public.social_post_files x where x.post_id = new.post_id;
  if n >= 10 then raise exception 'a post has at most 10 media files' using errcode = 'P0001'; end if;
  if uid is not null then new.created_by := uid; end if;
  return new;
end $$;
create trigger social_post_files_guard before insert on public.social_post_files for each row execute function private.social_post_files_guard();
create trigger social_posts_refuse_delete before delete on public.social_posts for each row execute function private.archive_before_delete();
-- a post under review or approved cannot lose its media or content; unscheduled posts only
create or replace function private.social_post_files_locked() returns trigger
language plpgsql security definer set search_path = '' as $$
declare st text;
begin
  select p.status into st from public.social_posts p where p.id = coalesce(new.post_id, old.post_id);
  if st in ('in_review', 'approved', 'scheduled', 'published') then raise exception 'send the post back to draft before changing its media' using errcode = 'P0001'; end if;
  return coalesce(new, old);
end $$;
create trigger social_post_files_locked before insert or delete on public.social_post_files for each row execute function private.social_post_files_locked();

-- the approval of a post drives its status (the only way into in_review and approved)
create or replace function private.social_post_follow_approval() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.subject_type <> 'post' then return null; end if;
  if tg_op = 'INSERT' then
    update public.social_posts set status = 'in_review' where workspace_id = new.workspace_id and id = new.subject_id and status = 'draft';
    if not found then raise exception 'only a draft post can be sent for review' using errcode = 'P0001'; end if;
  elsif new.status = 'approved' then
    update public.social_posts set status = 'approved' where workspace_id = new.workspace_id and id = new.subject_id and status = 'in_review';
  elsif new.status in ('rejected', 'withdrawn') then
    update public.social_posts set status = 'draft' where workspace_id = new.workspace_id and id = new.subject_id and status = 'in_review';
  end if;
  return null;
end $$;
create trigger social_post_follow_approval after insert or update on public.approvals for each row execute function private.social_post_follow_approval();

create or replace function private.approval_subject(ws uuid, t text, sid uuid, out s_found boolean, out s_client uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  s_found := null; s_client := null;
  if t in ('deliverable', 'file', 'document') then select true, f.client_id into s_found, s_client from public.files f where f.workspace_id = ws and f.id = sid;
  elsif t = 'project' then select true, p.client_id into s_found, s_client from public.projects p where p.workspace_id = ws and p.id = sid;
  elsif t = 'task' then select true, k.client_id into s_found, s_client from public.project_tasks k where k.workspace_id = ws and k.id = sid;
  elsif t = 'form' then select true, f.client_id into s_found, s_client from public.forms f where f.workspace_id = ws and f.id = sid;
  elsif t = 'post' then select true, p.client_id into s_found, s_client from public.social_posts p where p.workspace_id = ws and p.id = sid and p.archived_at is null;
  else s_found := true;
  end if;
end $$;

do $$
declare t text;
begin
  foreach t in array array['social_posts', 'social_post_files'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('create policy org_scope on public.%I as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id))', t);
  end loop;
end $$;
create policy social_posts_select on public.social_posts for select using (private.has_permission(workspace_id, 'social.post.view', client_id));
create policy social_posts_insert on public.social_posts for insert with check (private.has_permission(workspace_id, 'social.post.create', client_id));
create policy social_posts_update on public.social_posts for update using (private.has_permission(workspace_id, 'social.post.edit', client_id)) with check (private.has_permission(workspace_id, 'social.post.edit', client_id));
create policy social_posts_delete on public.social_posts for delete using (private.has_permission(workspace_id, 'social.post.delete'));
create policy social_files_select on public.social_post_files for select using (exists (select 1 from public.social_posts p where p.workspace_id = social_post_files.workspace_id and p.id = social_post_files.post_id));
create policy social_files_insert on public.social_post_files for insert with check (
  private.has_permission(workspace_id, 'social.post.edit', (select p.client_id from public.social_posts p where p.workspace_id = social_post_files.workspace_id and p.id = social_post_files.post_id))
  and exists (select 1 from public.files f where f.workspace_id = social_post_files.workspace_id and f.id = social_post_files.file_id));
create policy social_files_delete on public.social_post_files for delete using (
  private.has_permission(workspace_id, 'social.post.edit', (select p.client_id from public.social_posts p where p.workspace_id = social_post_files.workspace_id and p.id = social_post_files.post_id)));

create trigger audit_social_posts after insert or update or delete on public.social_posts for each row execute function private.audit_change('client_id', 'channel', 'title', 'status', 'scheduled_for', 'archived_at');
create trigger audit_social_files after insert or delete on public.social_post_files for each row execute function private.audit_change('post_id', 'file_id');

create or replace function private.refuse_delete_social_clients() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.social_posts where client_id = old.id) then raise exception 'archive this client instead: it still has work' using errcode = 'P0001'; end if;
  return old;
end $$;
create trigger clients_refuse_delete_social before delete on public.clients for each row execute function private.refuse_delete_social_clients();

revoke all on all functions in schema private from public;
grant select, insert, update, delete on public.social_posts to app_user;
grant select, insert, delete on public.social_post_files to app_user;
