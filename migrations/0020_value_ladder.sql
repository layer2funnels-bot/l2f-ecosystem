set check_function_bodies = off;
-- 0020 · Value Ladder data layer (Phase 6, data and API only). A ladder is an ordered set of rungs (lead magnet, tripwire, core offer, upsell,
-- continuity, premium); each rung may point at an Office -> Funnels offer record by id (so prices live in one place) or carry its own price.
-- Internal planning only (no client-facing path). Same standards as Clients; the app is "coming soon" until the owner activates it.

insert into public.permissions (key, app_key, description, floor_role, default_role, scopes, sensitive) values
  ('valueladder.ladder.view',   'value_ladder', 'View value ladders and rungs',                   'viewer', 'viewer', '{workspace,client}', false),
  ('valueladder.ladder.create', 'value_ladder', 'Create value ladders',                           'editor', 'editor', '{workspace,client}', false),
  ('valueladder.ladder.edit',   'value_ladder', 'Edit ladders and rungs, reorder, archive',       'editor', 'editor', '{workspace,client}', false),
  ('valueladder.ladder.delete', 'value_ladder', 'Permanently delete an ARCHIVED ladder or rung',  'admin',  'owner',  '{workspace}', true);

create table public.value_ladders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid,
  name text not null check (length(name) between 1 and 200),
  description text check (length(description) <= 4000),
  archived_at timestamptz,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id)
);
create index value_ladders_ws on public.value_ladders (workspace_id) where archived_at is null;

create table public.value_ladder_rungs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  ladder_id uuid not null,
  client_id uuid,                                    -- from the ladder
  position int check (position between 1 and 12),   -- null while archived
  stage text not null check (stage in ('lead_magnet', 'tripwire', 'core', 'upsell', 'continuity', 'premium')),
  name text not null check (length(name) between 1 and 200),
  description text check (length(description) <= 4000),
  offer_id uuid,
  price_amount numeric(12, 2) check (price_amount >= 0),
  currency text check (currency ~ '^[A-Z]{3}$'),
  archived_at timestamptz,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((price_amount is null) = (currency is null)),
  check ((archived_at is null) = (position is not null)),
  unique (workspace_id, id),
  unique (ladder_id, position) deferrable initially deferred,
  foreign key (workspace_id, ladder_id) references public.value_ladders (workspace_id, id),
  foreign key (workspace_id, offer_id) references public.funnel_offers (workspace_id, id)
);

create or replace function private.value_ladders_guard() returns trigger
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
  return new;
end $$;
create trigger value_ladders_guard before insert or update on public.value_ladders for each row execute function private.value_ladders_guard();

create or replace function private.value_rungs_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); lc uuid; lfound boolean; larch timestamptz; oc uuid; ofound boolean; n int; cnt int;
begin
  select true, l.client_id, l.archived_at into lfound, lc, larch from public.value_ladders l where l.workspace_id = new.workspace_id and l.id = new.ladder_id;
  if lfound is not true then raise exception 'not found' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    if larch is not null then raise exception 'this ladder is archived' using errcode = 'P0001'; end if;
    if uid is not null then new.created_by := uid; end if;
    new.client_id := lc; new.archived_at := null;
  else
    if new.workspace_id is distinct from old.workspace_id or new.ladder_id is distinct from old.ladder_id or new.client_id is distinct from old.client_id or new.created_by is distinct from old.created_by then
      raise exception 'records do not move' using errcode = 'P0001';
    end if;
    new.updated_at := now();
  end if;
  if new.offer_id is not null then
    select true, o.client_id into ofound, oc from public.funnel_offers o where o.workspace_id = new.workspace_id and o.id = new.offer_id;
    if ofound is not true then raise exception 'not found' using errcode = '42501'; end if;
    if oc is not null and oc is distinct from lc then raise exception 'a rung can only use this client''s offers or general ones' using errcode = 'P0001'; end if;
  end if;
  if new.archived_at is not null then new.position := null;
  elsif new.position is null then                                     -- a new or restored rung goes to the end of the ladder
    select count(*), coalesce(max(r.position), 0) + 1 into cnt, n from public.value_ladder_rungs r where r.ladder_id = new.ladder_id and r.archived_at is null and r.id is distinct from new.id;
    if cnt >= 12 then raise exception 'a ladder has at most 12 rungs' using errcode = 'P0001'; end if;
    new.position := n;
  end if;
  return new;
end $$;
create trigger value_rungs_guard before insert or update on public.value_ladder_rungs for each row execute function private.value_rungs_guard();

create trigger value_ladders_refuse_delete before delete on public.value_ladders for each row execute function private.archive_before_delete();
create trigger value_rungs_refuse_delete before delete on public.value_ladder_rungs for each row execute function private.archive_before_delete();
create or replace function private.value_ladder_in_use() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.value_ladder_rungs where ladder_id = old.id) then raise exception 'archive this ladder instead: it has rungs' using errcode = 'P0001'; end if;
  return old;
end $$;
create trigger value_ladders_in_use before delete on public.value_ladders for each row execute function private.value_ladder_in_use();
-- an offer that is on a ladder cannot be deleted from under it
create or replace function private.offer_on_ladder() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.value_ladder_rungs where offer_id = old.id) then raise exception 'take this offer off its value ladders first' using errcode = 'P0001'; end if;
  return old;
end $$;
create trigger funnel_offers_on_ladder before delete on public.funnel_offers for each row execute function private.offer_on_ladder();

do $$
declare t text;
begin
  foreach t in array array['value_ladders', 'value_ladder_rungs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('create policy org_scope on public.%I as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id))', t);
  end loop;
end $$;
create policy value_ladders_select on public.value_ladders for select using (private.has_permission(workspace_id, 'valueladder.ladder.view', client_id));
create policy value_ladders_insert on public.value_ladders for insert with check (private.has_permission(workspace_id, 'valueladder.ladder.create', client_id));
create policy value_ladders_update on public.value_ladders for update using (private.has_permission(workspace_id, 'valueladder.ladder.edit', client_id)) with check (private.has_permission(workspace_id, 'valueladder.ladder.edit', client_id));
create policy value_ladders_delete on public.value_ladders for delete using (private.has_permission(workspace_id, 'valueladder.ladder.delete'));
create policy value_rungs_select on public.value_ladder_rungs for select using (private.has_permission(workspace_id, 'valueladder.ladder.view', client_id));
create policy value_rungs_insert on public.value_ladder_rungs for insert with check (
  private.has_permission(workspace_id, 'valueladder.ladder.edit', (select l.client_id from public.value_ladders l where l.workspace_id = value_ladder_rungs.workspace_id and l.id = value_ladder_rungs.ladder_id))
  and (offer_id is null or exists (select 1 from public.funnel_offers o where o.workspace_id = value_ladder_rungs.workspace_id and o.id = value_ladder_rungs.offer_id)));   -- the person must be able to see the offer they attach
create policy value_rungs_update on public.value_ladder_rungs for update using (private.has_permission(workspace_id, 'valueladder.ladder.edit', client_id))
  with check (private.has_permission(workspace_id, 'valueladder.ladder.edit', client_id) and (offer_id is null or exists (select 1 from public.funnel_offers o where o.workspace_id = value_ladder_rungs.workspace_id and o.id = value_ladder_rungs.offer_id)));
create policy value_rungs_delete on public.value_ladder_rungs for delete using (private.has_permission(workspace_id, 'valueladder.ladder.delete'));

create trigger audit_value_ladders after insert or update or delete on public.value_ladders for each row execute function private.audit_change('client_id', 'name', 'archived_at');
create trigger audit_value_rungs after insert or update or delete on public.value_ladder_rungs for each row execute function private.audit_change('ladder_id', 'stage', 'name', 'position', 'offer_id', 'price_amount', 'currency', 'archived_at');

create or replace function private.refuse_delete_ladder_clients() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.value_ladders where client_id = old.id) then raise exception 'archive this client instead: it still has work' using errcode = 'P0001'; end if;
  return old;
end $$;
create trigger clients_refuse_delete_ladders before delete on public.clients for each row execute function private.refuse_delete_ladder_clients();

revoke all on all functions in schema private from public;
grant select, insert, update, delete on public.value_ladders, public.value_ladder_rungs to app_user;
