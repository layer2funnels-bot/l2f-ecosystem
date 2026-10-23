-- Value Ladder (Design v4, final): a "downsell" step type, per-step audience / conversion % / notes / owner, a draft-or-approved status, immutable version snapshots
-- (history and compare) and client copies. A step still REFERENCES an Offers & Products record (price and name are read from it, never edited here).
-- Additive and local-only until the owner approves the go-live package.
alter table public.value_ladder_rungs drop constraint value_ladder_rungs_stage_check;
alter table public.value_ladder_rungs add constraint value_ladder_rungs_stage_check check (stage in ('lead_magnet', 'tripwire', 'core', 'upsell', 'downsell', 'continuity', 'premium'));
alter table public.value_ladder_rungs
  add column audience text check (length(audience) <= 500),
  add column conversion_pct numeric(5, 2) check (conversion_pct between 0 and 100),
  add column assumption_notes text check (length(assumption_notes) <= 2000),
  add column owner_id uuid;
alter table public.value_ladders add column status text not null default 'draft' check (status in ('draft', 'approved'));

-- immutable snapshots: saving a version never changes the ladder, and a snapshot can never be changed or removed
create table public.value_ladder_versions (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  ladder_id uuid not null,
  client_id uuid,
  version int not null check (version >= 1),
  name text not null,
  description text,
  status text not null,
  rungs jsonb not null check (jsonb_typeof(rungs) = 'array' and jsonb_array_length(rungs) <= 12),
  note text check (length(note) <= 300),
  created_by uuid, created_at timestamptz not null default now(),
  primary key (ladder_id, version),
  foreign key (workspace_id, ladder_id) references public.value_ladders (workspace_id, id)
);
create or replace function private.value_ladder_versions_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); lc uuid; lfound boolean; cur int;
begin
  if tg_op <> 'INSERT' then raise exception 'saved versions cannot be changed or removed' using errcode = 'P0001'; end if;
  select true, l.client_id into lfound, lc from public.value_ladders l where l.workspace_id = new.workspace_id and l.id = new.ladder_id;
  if lfound is not true then raise exception 'not found' using errcode = '42501'; end if;
  select coalesce(max(v.version), 0) into cur from public.value_ladder_versions v where v.ladder_id = new.ladder_id;
  new.version := cur + 1; new.client_id := lc; if uid is not null then new.created_by := uid; end if;
  return new;
end $$;
create trigger value_ladder_versions_guard before insert or update or delete on public.value_ladder_versions for each row execute function private.value_ladder_versions_guard();
revoke all on function private.value_ladder_versions_guard() from public;
alter table public.value_ladder_versions enable row level security;
alter table public.value_ladder_versions force row level security;
create policy org_scope on public.value_ladder_versions as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
create policy value_ladder_versions_select on public.value_ladder_versions for select using (private.has_permission(workspace_id, 'valueladder.ladder.view', client_id));
create policy value_ladder_versions_insert on public.value_ladder_versions for insert with check (private.has_permission(workspace_id, 'valueladder.ladder.edit', (select l.client_id from public.value_ladders l where l.workspace_id = value_ladder_versions.workspace_id and l.id = value_ladder_versions.ladder_id)));
create trigger audit_value_ladder_versions after insert on public.value_ladder_versions for each row execute function private.audit_change('ladder_id', 'version', 'status');
grant select, insert on public.value_ladder_versions to app_user;

-- a client may have its own copy of a ladder (Clients > Strategy)
alter table public.client_strategy_copies drop constraint client_strategy_copies_kind_check;
alter table public.client_strategy_copies add constraint client_strategy_copies_kind_check check (kind in ('avatars', 'offers', 'stories', 'brand_kits', 'strategies', 'ladders'));
create or replace function private.client_strategy_copy_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare ok boolean;
begin
  if tg_op = 'UPDATE' then raise exception 'copies are not edited here' using errcode = 'P0001'; end if;
  new.created_by := coalesce(private.current_user_id(), new.created_by);
  execute format('select exists (select 1 from public.%1$I c where c.workspace_id = $1 and c.id = $2 and c.client_id = $3)
                   and exists (select 1 from public.%1$I s where s.workspace_id = $1 and s.id = $4 and s.client_id is null)',
                 case new.kind when 'avatars' then 'funnel_avatars' when 'offers' then 'funnel_offers' when 'stories' then 'funnel_stories' when 'strategies' then 'funnel_strategies' when 'ladders' then 'value_ladders' else 'funnel_brand_kits' end)
    into ok using new.workspace_id, new.copy_id, new.client_id, new.source_id;
  if not ok then raise exception 'a copy must belong to this client and come from the organization library' using errcode = 'P0001'; end if;
  return new;
end $$;
revoke all on function private.client_strategy_copy_guard() from public;
