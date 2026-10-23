-- Clients > Strategy (Design v4, V4-1): a client gets its OWN copy of an organization-wide avatar, offer, story or brand kit, started once and never synced.
-- The copy is an ordinary Funnels record that belongs to the client (so every existing screen, permission and sharing rule keeps working);
-- this table only remembers which library record it was started from, so a record is copied at most once and the brand kit is one per client.
-- Additive and local-only until the owner approves the go-live package.
create table public.client_strategy_copies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null,
  kind text not null check (kind in ('avatars', 'offers', 'stories', 'brand_kits')),
  source_id uuid not null,
  copy_id uuid not null,
  created_by uuid, created_at timestamptz not null default now(),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id),
  unique (workspace_id, client_id, kind, source_id),
  unique (workspace_id, copy_id)
);
create unique index client_strategy_one_brand_kit on public.client_strategy_copies (workspace_id, client_id) where kind = 'brand_kits';

-- Same organization, the copy belongs to this client, the source is organization-wide (never another client's record).
create or replace function private.client_strategy_copy_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare ok boolean;
begin
  if tg_op = 'UPDATE' then raise exception 'copies are not edited here' using errcode = 'P0001'; end if;
  new.created_by := coalesce(private.current_user_id(), new.created_by);
  execute format('select exists (select 1 from public.%1$I c where c.workspace_id = $1 and c.id = $2 and c.client_id = $3)
                   and exists (select 1 from public.%1$I s where s.workspace_id = $1 and s.id = $4 and s.client_id is null)',
                 case new.kind when 'avatars' then 'funnel_avatars' when 'offers' then 'funnel_offers' when 'stories' then 'funnel_stories' else 'funnel_brand_kits' end)
    into ok using new.workspace_id, new.copy_id, new.client_id, new.source_id;
  if not ok then raise exception 'a copy must belong to this client and come from the organization library' using errcode = 'P0001'; end if;
  return new;
end $$;
create trigger client_strategy_copies_guard before insert or update on public.client_strategy_copies for each row execute function private.client_strategy_copy_guard();
revoke all on function private.client_strategy_copy_guard() from public;

alter table public.client_strategy_copies enable row level security;
alter table public.client_strategy_copies force row level security;
create policy org_scope on public.client_strategy_copies as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
create policy client_strategy_copies_select on public.client_strategy_copies for select using (private.has_permission(workspace_id, 'clients.client.view', client_id));
create policy client_strategy_copies_insert on public.client_strategy_copies for insert with check (private.has_permission(workspace_id, 'clients.client.edit', client_id));
create policy client_strategy_copies_delete on public.client_strategy_copies for delete using (private.has_permission(workspace_id, 'clients.client.edit', client_id));
create trigger audit_client_strategy_copies after insert or delete on public.client_strategy_copies
  for each row execute function private.audit_change('client_id', 'kind', 'source_id', 'copy_id');
create index client_strategy_copies_client on public.client_strategy_copies (workspace_id, client_id);

grant select, insert, delete on public.client_strategy_copies to app_user;
