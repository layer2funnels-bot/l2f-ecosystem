set check_function_bodies = off;
-- 0031 · Social Planner v4: campaigns, two more post states (failed, cancelled), a channel capability table, per-channel versions of a post and a
-- person's own record of "posted manually". Planner still never publishes: Connect stays off, and "published" is always a person's confirmation.
-- Additive. Posts keep their permissions (social.post.*); campaigns use the same ones.

-- ---- what each channel can take (reference data, same for every organization)
create table public.social_channels (
  key text primary key,
  label text not null,
  max_text int check (max_text is null or max_text > 0),      -- characters; null = no fixed limit
  max_media int not null default 10 check (max_media between 0 and 10),
  media_types text[] not null default '{image,video}',
  can_schedule boolean not null default true,                 -- the channel supports a planned time (the post is still published by a person)
  connect_state text not null default 'off' check (connect_state in ('off'))
);
insert into public.social_channels (key, label, max_text, max_media, media_types) values
  ('facebook', 'Facebook', 63206, 10, '{image,video}'),
  ('instagram', 'Instagram', 2200, 10, '{image,video}'),
  ('linkedin', 'LinkedIn', 3000, 9, '{image,video,document}'),
  ('x', 'X', 280, 4, '{image,video}'),
  ('tiktok', 'TikTok', 2200, 1, '{video}'),
  ('youtube', 'YouTube', 5000, 1, '{video}'),
  ('pinterest', 'Pinterest', 500, 1, '{image,video}'),
  ('email', 'Email', null, 10, '{image}'),
  ('other', 'Other', null, 10, '{image,video,document}');
alter table public.social_channels enable row level security; alter table public.social_channels force row level security;
create policy social_channels_read on public.social_channels for select using (true);

-- ---- campaigns
create table public.social_campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid,
  name text not null check (length(name) between 1 and 200),
  goal text check (length(goal) <= 1000),
  status text not null default 'draft' check (status in ('draft', 'planned', 'active', 'paused', 'completed')),
  starts_on date, ends_on date,
  owner_id uuid,
  archived_at timestamptz,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on),
  unique (workspace_id, id),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id)
);
create index social_campaigns_list on public.social_campaigns (workspace_id, archived_at, starts_on);

alter table public.social_posts drop constraint social_posts_status_check;
alter table public.social_posts add constraint social_posts_status_check check (status in ('idea', 'draft', 'in_review', 'approved', 'scheduled', 'published', 'failed', 'cancelled'));
alter table public.social_posts
  add column campaign_id uuid,
  add column variant_of uuid,
  add column failure_reason text check (failure_reason is null or length(failure_reason) between 1 and 500),
  add column published_by uuid,
  add column post_url text check (post_url is null or (length(post_url) <= 500 and post_url ~ '^https?://[^ ]+$'));
alter table public.social_posts add constraint social_posts_campaign_fk foreign key (workspace_id, campaign_id) references public.social_campaigns (workspace_id, id);
alter table public.social_posts add constraint social_posts_variant_fk foreign key (workspace_id, variant_of) references public.social_posts (workspace_id, id) on delete set null (variant_of);
alter table public.social_posts add constraint social_posts_failed_has_reason check (status <> 'failed' or failure_reason is not null);
create index social_posts_campaign on public.social_posts (campaign_id) where campaign_id is not null;

create or replace function private.social_campaigns_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); open_posts int;
begin
  if tg_op = 'INSERT' then
    if uid is not null then new.created_by := uid; end if;
    new.status := 'draft'; new.archived_at := null;
  else
    if new.workspace_id is distinct from old.workspace_id or new.created_by is distinct from old.created_by then raise exception 'records do not move' using errcode = 'P0001'; end if;
    if new.client_id is distinct from old.client_id and exists (select 1 from public.social_posts p where p.campaign_id = old.id) then
      raise exception 'a campaign with posts stays with its client' using errcode = 'P0001';
    end if;
    if new.status is distinct from old.status then
      if not ((old.status, new.status) in (('draft', 'planned'), ('planned', 'draft'), ('planned', 'active'), ('draft', 'active'), ('active', 'paused'), ('paused', 'active'), ('active', 'completed'), ('paused', 'completed'), ('completed', 'active'))) then
        raise exception 'a campaign cannot go from % to %', old.status, new.status using errcode = 'P0001';
      end if;
      if new.status = 'completed' then
        select count(*) into open_posts from public.social_posts p where p.campaign_id = old.id and p.archived_at is null and p.status not in ('published', 'cancelled');
        if open_posts > 0 then raise exception 'finish or cancel the % post(s) still open before completing the campaign', open_posts using errcode = 'P0001'; end if;
      end if;
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;
create trigger social_campaigns_guard before insert or update on public.social_campaigns for each row execute function private.social_campaigns_guard();
create trigger social_campaigns_refuse_delete before delete on public.social_campaigns for each row execute function private.archive_before_delete();

-- ---- posts: the full guard again (new states, campaign and channel rules)
create or replace function private.social_posts_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); deep boolean := pg_trigger_depth() >= 2; locked boolean; cc uuid; cfound boolean; carch timestamptz; mx int;
begin
  if tg_op = 'INSERT' then
    if uid is not null then new.created_by := uid; end if;
    if new.status not in ('idea', 'draft') then raise exception 'a new post starts as an idea or a draft' using errcode = 'P0001'; end if;
    new.published_at := null; new.archived_at := null; new.failure_reason := null; new.published_by := null; new.post_url := null;
  else
    if new.workspace_id is distinct from old.workspace_id or new.client_id is distinct from old.client_id or new.created_by is distinct from old.created_by then
      raise exception 'records do not move' using errcode = 'P0001';
    end if;
    locked := old.status in ('in_review', 'approved', 'scheduled', 'published', 'failed');
    -- what was approved is what is published: content cannot change while the post is under review, approved, scheduled, failed or published
    if locked and (new.title is distinct from old.title or new.caption is distinct from old.caption or new.channel is distinct from old.channel) then
      raise exception 'send the post back to draft before changing its content' using errcode = 'P0001';
    end if;
    if new.status is distinct from old.status then
      if new.status in ('in_review', 'approved') and not deep then raise exception 'review and approval come from the approval of the post' using errcode = 'P0001'; end if;
      if old.status = 'published' then raise exception 'a published post is final (archive it)' using errcode = 'P0001'; end if;
      if old.status = 'in_review' and not deep then raise exception 'withdraw or decide the approval first' using errcode = 'P0001'; end if;
      if new.status in ('scheduled', 'published', 'failed') and uid is not null and not private.has_permission(new.workspace_id, 'social.post.schedule', new.client_id) then raise exception 'not found' using errcode = '42501'; end if;
      if new.status = 'scheduled' and old.status not in ('approved', 'failed') then raise exception 'only an approved post can be scheduled' using errcode = 'P0001'; end if;
      if new.status = 'published' and old.status not in ('approved', 'scheduled', 'failed') then raise exception 'only an approved or scheduled post can be marked published' using errcode = 'P0001'; end if;
      if new.status = 'failed' and old.status <> 'scheduled' then raise exception 'only a scheduled post can fail' using errcode = 'P0001'; end if;
      if new.status = 'cancelled' and old.status not in ('idea', 'draft', 'approved', 'scheduled', 'failed') then raise exception 'this post cannot be cancelled from here' using errcode = 'P0001'; end if;
      if old.status = 'cancelled' and new.status <> 'draft' then raise exception 'a cancelled post can only be reopened as a draft' using errcode = 'P0001'; end if;
      if old.status = 'failed' and new.status not in ('scheduled', 'draft', 'published', 'cancelled') then raise exception 'a failed post is retried, reopened as a draft, recorded as posted or cancelled' using errcode = 'P0001'; end if;
      if new.status = 'scheduled' then
        select c.max_text into mx from public.social_channels c where c.key = new.channel;
        if mx is not null and length(coalesce(new.caption, '')) > mx then raise exception 'the caption is longer than % allows (% characters)', new.channel, mx using errcode = 'P0001'; end if;
      end if;
      if new.status = 'published' then new.published_at := now(); new.published_by := uid; new.failure_reason := null; end if;
      if new.status = 'failed' and (new.failure_reason is null or new.failure_reason is not distinct from old.failure_reason) then raise exception 'say what went wrong' using errcode = 'P0001'; end if;
      if new.status <> 'failed' then new.failure_reason := null; end if;
      if new.status in ('idea', 'draft') then new.scheduled_for := case when new.status = 'idea' then null else new.scheduled_for end; end if;
    end if;
    if new.published_at is distinct from old.published_at and new.status <> 'published' then new.published_at := old.published_at; end if;
    if new.published_by is distinct from old.published_by and new.status <> 'published' then new.published_by := old.published_by; end if;
    if new.status <> 'published' then new.post_url := null; end if;
    new.updated_at := now();
  end if;
  -- campaign: same organization, not archived, and a client campaign only holds that client's posts
  if new.campaign_id is not null and (tg_op = 'INSERT' or new.campaign_id is distinct from old.campaign_id) then
    select true, c.client_id, c.archived_at into cfound, cc, carch from public.social_campaigns c where c.workspace_id = new.workspace_id and c.id = new.campaign_id;
    if cfound is not true then raise exception 'not found' using errcode = '42501'; end if;
    if carch is not null then raise exception 'this campaign is archived' using errcode = 'P0001'; end if;
    if cc is not null and cc is distinct from new.client_id then raise exception 'a campaign for a client only holds that client''s posts' using errcode = 'P0001'; end if;
  end if;
  return new;
end $$;

do $$
begin
  execute 'alter table public.social_campaigns enable row level security'; execute 'alter table public.social_campaigns force row level security';
  execute 'create policy org_scope on public.social_campaigns as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id))';
end $$;
create policy social_campaigns_select on public.social_campaigns for select using (private.has_permission(workspace_id, 'social.post.view', client_id));
create policy social_campaigns_insert on public.social_campaigns for insert with check (private.has_permission(workspace_id, 'social.post.create', client_id));
create policy social_campaigns_update on public.social_campaigns for update using (private.has_permission(workspace_id, 'social.post.edit', client_id)) with check (private.has_permission(workspace_id, 'social.post.edit', client_id));
create policy social_campaigns_delete on public.social_campaigns for delete using (private.has_permission(workspace_id, 'social.post.delete'));

create trigger audit_social_campaigns after insert or update or delete on public.social_campaigns for each row execute function private.audit_change('client_id', 'name', 'status', 'starts_on', 'ends_on', 'archived_at');

create or replace function private.refuse_delete_social_clients() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.social_posts where client_id = old.id) or exists (select 1 from public.social_campaigns where client_id = old.id) then raise exception 'archive this client instead: it still has work' using errcode = 'P0001'; end if;
  return old;
end $$;

revoke all on all functions in schema private from public;
grant select, insert, update, delete on public.social_campaigns to app_user;
grant select on public.social_channels to app_user;
