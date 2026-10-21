set check_function_bodies = off;
-- 0003 · Minimum integration layer (Master Blueprint v1.2 §20.8, recommendation R28).
-- Schema only. No provider is connected, no secret is stored, nothing calls out.
-- Reversible: if R28 is rejected, drop these four tables; nothing else depends on them.
--   1 connections per workspace and provider, admin-only, can be switched off
--   2 secrets are NEVER stored here; secret_ref names a server-side secret (host env var or Vault)
--   4 inbound webhooks: stored once per (provider, delivery_id) -> replay protection, processed once
--   5 external ID mapping (not used for Funnel Mapper Pro until a link is approved)
--   6 outbox events with idempotency keys for retries without duplicates

create table public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null check (provider ~ '^[a-z][a-z0-9_]{1,40}$'),
  status text not null default 'disabled' check (status in ('active', 'disabled')),
  scopes text[] not null default '{}',
  secret_ref text check (secret_ref is null or secret_ref ~ '^[A-Z][A-Z0-9_]{2,80}$'),  -- a NAME, never a key
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, provider)
);

create table public.external_refs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null,
  entity_type text not null,
  entity_id uuid not null,
  external_id text not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, provider, entity_type, external_id),
  unique (workspace_id, provider, entity_type, entity_id)
);

create table public.webhook_inbox (
  id bigint generated always as identity primary key,
  workspace_id uuid not null,
  connection_id uuid not null,
  provider text not null,
  delivery_id text not null,
  received_at timestamptz not null default now(),
  payload jsonb not null,
  status text not null default 'received' check (status in ('received', 'processed', 'failed')),
  processed_at timestamptz,
  attempts int not null default 0 check (attempts between 0 and 3),
  unique (provider, delivery_id),
  foreign key (workspace_id, connection_id)
    references public.integration_connections (workspace_id, id) on delete cascade
);

create table public.outbox_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  type text not null,
  subject_type text not null,
  subject_id uuid,
  payload jsonb not null default '{}',
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts int not null default 0 check (attempts between 0 and 3),
  unique (workspace_id, idempotency_key)
);

do $$
declare t text;
begin
  foreach t in array array['integration_connections','external_refs','webhook_inbox','outbox_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- Connections: workspace admins only. A Layer2Funnels connection is invisible from Aurj.
create policy conn_select on public.integration_connections for select using (private.has_role(workspace_id, 'admin'));
create policy conn_insert on public.integration_connections for insert
  with check (private.has_role(workspace_id, 'admin') and created_by = private.current_user_id());
create policy conn_update on public.integration_connections for update
  using (private.has_role(workspace_id, 'admin')) with check (private.has_role(workspace_id, 'admin'));
create policy conn_delete on public.integration_connections for delete using (private.has_role(workspace_id, 'admin'));

-- External IDs: staff read, editors write, inside one workspace.
create policy xref_select on public.external_refs for select using (private.is_staff(workspace_id));
create policy xref_insert on public.external_refs for insert with check (private.has_role(workspace_id, 'editor'));
create policy xref_delete on public.external_refs for delete using (private.has_role(workspace_id, 'editor'));

-- Webhook inbox and outbox: written only by server code (service role); admins can read for support.
create policy inbox_select on public.webhook_inbox for select using (private.has_role(workspace_id, 'admin'));
create policy outbox_select on public.outbox_events for select using (private.has_role(workspace_id, 'admin'));

create trigger audit_connections after insert or update or delete on public.integration_connections
  for each row execute function private.audit_change('provider', 'status', 'scopes', 'secret_ref');

grant select, insert, update, delete on public.integration_connections, public.external_refs to app_user;
grant select on public.webhook_inbox, public.outbox_events to app_user;
revoke insert, update, delete on public.webhook_inbox, public.outbox_events from app_user;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update, delete on public.integration_connections, public.external_refs to authenticated;
    grant select on public.webhook_inbox, public.outbox_events to authenticated;
    revoke insert, update, delete on public.webhook_inbox, public.outbox_events from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.integration_connections, public.external_refs, public.webhook_inbox, public.outbox_events from anon;
  end if;
end $$;
