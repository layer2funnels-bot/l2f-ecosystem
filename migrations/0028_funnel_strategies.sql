-- Office > Funnels > Funnel Strategies (Design v4, final): one written strategy per funnel. The text is a Drive document owned by the Funnels app
-- (files.managed_by = 'funnels', so it never lists in Drive on its own); this table holds what the document does not: a name, a status
-- (Draft, In review, Approved), an optional link to the funnel map in Funnel Mapper Pro (a link only, never copied or synced) and internal notes.
-- Linked assets reuse funnel_references (referrer_app 'funnels'). A client may have its own copy of a strategy (client_id set) through Clients > Strategy.
-- Additive and local-only until the owner approves the go-live package.
insert into public.permissions (key, app_key, description, floor_role, default_role, scopes, sensitive) values
  ('funnels.strategy.view',   'office', 'View funnel strategies',                                  'viewer', 'viewer', '{workspace,client}', false),
  ('funnels.strategy.create', 'office', 'Create funnel strategies',                                'editor', 'editor', '{workspace,client}', false),
  ('funnels.strategy.edit',   'office', 'Edit, approve or archive funnel strategies',              'editor', 'editor', '{workspace,client}', false),
  ('funnels.strategy.delete', 'office', 'Permanently delete an ARCHIVED funnel strategy',          'admin',  'owner',  '{workspace}', true);

insert into public.access_level_permissions (workspace_id, access_level_id, permission_key)
select l.workspace_id, l.id, k from public.access_levels l
  cross join unnest(case when l.name = 'Funnels · edit' then array['funnels.strategy.view', 'funnels.strategy.create', 'funnels.strategy.edit']
                         when l.name = 'Funnels · read' then array['funnels.strategy.view'] else array[]::text[] end) k
 where l.app_key = 'office' and l.is_template
on conflict do nothing;

create or replace function private.seed_funnel_levels(ws uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare lvl uuid;
begin
  insert into public.access_levels (workspace_id, app_key, name, description, is_template)
  values (ws, 'office', 'Funnels · edit', 'See, create and edit funnel records (not sharing with clients, not deleting)', true) returning id into lvl;
  insert into public.access_level_permissions (workspace_id, access_level_id, permission_key)
  select ws, lvl, k from unnest(array[
    'funnels.avatar.view','funnels.avatar.create','funnels.avatar.edit','funnels.offer.view','funnels.offer.create','funnels.offer.edit',
    'funnels.story.view','funnels.story.create','funnels.story.edit','funnels.brandkit.view','funnels.brandkit.create','funnels.brandkit.edit',
    'funnels.strategy.view','funnels.strategy.create','funnels.strategy.edit',
    'funnels.reference.view','funnels.reference.manage']) k;
  insert into public.access_levels (workspace_id, app_key, name, description, is_template)
  values (ws, 'office', 'Funnels · read', 'See funnel records, change nothing', true) returning id into lvl;
  insert into public.access_level_permissions (workspace_id, access_level_id, permission_key)
  select ws, lvl, k from unnest(array['funnels.avatar.view','funnels.offer.view','funnels.story.view','funnels.brandkit.view','funnels.strategy.view','funnels.reference.view']) k;
end $$;
revoke all on function private.seed_funnel_levels(uuid) from public;

create table public.funnel_strategies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid,
  name text not null check (length(name) between 1 and 200),
  status text not null default 'draft' check (status in ('draft', 'in_review', 'approved')),
  file_id uuid not null,
  map_url text check (map_url ~ '^https://[^[:space:]]+$' and length(map_url) <= 500),
  map_label text check (length(map_label) <= 200),
  notes text check (length(notes) <= 8000),
  archived_at timestamptz,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, file_id),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id),
  foreign key (workspace_id, file_id) references public.files (workspace_id, id)
);

-- the document must be a first-party document of the Funnels app, in the same place as the strategy (organization library space or this client's space)
create or replace function private.funnel_strategies_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); f record;
begin
  if tg_op = 'INSERT' then
    if uid is not null then new.created_by := uid; end if;
  else
    if new.workspace_id is distinct from old.workspace_id or new.client_id is distinct from old.client_id or new.file_id is distinct from old.file_id or new.created_by is distinct from old.created_by then
      raise exception 'records do not move' using errcode = 'P0001';
    end if;
    new.updated_at := now();
  end if;
  if tg_op = 'INSERT' then
    select space, client_id, kind, managed_by into f from public.files where workspace_id = new.workspace_id and id = new.file_id;
    if f.kind is distinct from 'document' or f.managed_by is distinct from 'funnels'
       or (new.client_id is null and f.space is distinct from 'shared') or (new.client_id is not null and (f.space is distinct from 'client' or f.client_id is distinct from new.client_id)) then
      raise exception 'a strategy needs its own document in the Funnels app (organization or this client)' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.funnel_strategies_guard() from public;
create trigger funnel_strategies_guard before insert or update on public.funnel_strategies for each row execute function private.funnel_strategies_guard();
create trigger funnel_strategies_refuse_delete before delete on public.funnel_strategies for each row execute function private.archive_before_delete();

alter table public.funnel_strategies enable row level security;
alter table public.funnel_strategies force row level security;
create policy org_scope on public.funnel_strategies as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
create policy funnel_strategies_select on public.funnel_strategies for select using (private.has_permission(workspace_id, 'funnels.strategy.view', client_id));
create policy funnel_strategies_insert on public.funnel_strategies for insert with check (private.has_permission(workspace_id, 'funnels.strategy.create', client_id));
create policy funnel_strategies_update on public.funnel_strategies for update using (private.has_permission(workspace_id, 'funnels.strategy.edit', client_id)) with check (private.has_permission(workspace_id, 'funnels.strategy.edit', client_id));
create policy funnel_strategies_delete on public.funnel_strategies for delete using (private.has_permission(workspace_id, 'funnels.strategy.delete'));
create trigger audit_funnel_strategies after insert or update or delete on public.funnel_strategies
  for each row execute function private.audit_change('client_id', 'name', 'status', 'file_id', 'map_url', 'archived_at');   -- never the notes
create index funnel_strategies_scope on public.funnel_strategies (workspace_id, client_id) where archived_at is null;

-- linked assets reuse the references table: a strategy points at records by ID, it never copies them
alter table public.funnel_references drop constraint funnel_references_referrer_app_check;
alter table public.funnel_references add constraint funnel_references_referrer_app_check check (referrer_app in ('clients', 'value_ladder', 'funnels'));

-- a client may have its own copy of a strategy (Clients > Strategy)
alter table public.client_strategy_copies drop constraint client_strategy_copies_kind_check;
alter table public.client_strategy_copies add constraint client_strategy_copies_kind_check check (kind in ('avatars', 'offers', 'stories', 'brand_kits', 'strategies'));
create or replace function private.client_strategy_copy_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare ok boolean;
begin
  if tg_op = 'UPDATE' then raise exception 'copies are not edited here' using errcode = 'P0001'; end if;
  new.created_by := coalesce(private.current_user_id(), new.created_by);
  execute format('select exists (select 1 from public.%1$I c where c.workspace_id = $1 and c.id = $2 and c.client_id = $3)
                   and exists (select 1 from public.%1$I s where s.workspace_id = $1 and s.id = $4 and s.client_id is null)',
                 case new.kind when 'avatars' then 'funnel_avatars' when 'offers' then 'funnel_offers' when 'stories' then 'funnel_stories' when 'strategies' then 'funnel_strategies' else 'funnel_brand_kits' end)
    into ok using new.workspace_id, new.copy_id, new.client_id, new.source_id;
  if not ok then raise exception 'a copy must belong to this client and come from the organization library' using errcode = 'P0001'; end if;
  return new;
end $$;
revoke all on function private.client_strategy_copy_guard() from public;

grant select, insert, update, delete on public.funnel_strategies to app_user;
