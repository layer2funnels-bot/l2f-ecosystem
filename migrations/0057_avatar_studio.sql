-- 0057 · Office V8 (P01) Customer Avatar Studio: the look, role, market, the full profile in chapters, the source file and saved versions.
-- 01_APPLICATIONS/01_OFFICE "Customer Avatars". Additive and reversible (rollback: migrations/rollback/0057_avatar_studio.down.sql).
-- New columns follow funnel_avatars' existing row rules (funnels.avatar.view/edit, client rows). Versions are their own table with the same rules.

alter table public.funnel_avatars
  add column if not exists tagline text check (length(tagline) <= 200),                       -- "the One Comma Club chaser"
  add column if not exists role text check (length(role) <= 200),
  add column if not exists market text check (length(market) <= 80),
  add column if not exists look smallint not null default 0 check (look between 0 and 9),     -- one of V8's ten 3D looks (AVPICK)
  add column if not exists stage text not null default 'draft' check (stage in ('draft', 'validated')),
  add column if not exists version text not null default 'v1.0' check (length(version) <= 20),
  add column if not exists profile jsonb not null default '{}' check (jsonb_typeof(profile) = 'object' and pg_column_size(profile) <= 400000),
  add column if not exists source_file_id uuid;

create table if not exists public.avatar_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  avatar_id uuid not null references public.funnel_avatars(id) on delete cascade,
  client_id uuid,
  version text not null check (length(version) between 1 and 20),
  note text not null default '' check (length(note) <= 300),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object' and pg_column_size(snapshot) <= 500000),
  created_by uuid, created_at timestamptz not null default now()
);
create index if not exists avatar_versions_avatar on public.avatar_versions (avatar_id, created_at desc);
alter table public.avatar_versions enable row level security;
alter table public.avatar_versions force row level security;
drop policy if exists sel on public.avatar_versions;
create policy sel on public.avatar_versions for select using (private.has_permission(workspace_id, 'funnels.avatar.view', client_id));
drop policy if exists ins on public.avatar_versions;
create policy ins on public.avatar_versions for insert with check (private.has_permission(workspace_id, 'funnels.avatar.edit', client_id) and created_by = private.current_user_id()
  and exists (select 1 from public.funnel_avatars a where a.id = avatar_id and a.workspace_id = avatar_versions.workspace_id and a.client_id is not distinct from avatar_versions.client_id));
drop policy if exists org_scope on public.avatar_versions;
create policy org_scope on public.avatar_versions as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
grant select, insert on public.avatar_versions to app_user;   -- a saved version is never edited

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then execute format('revoke all on table public.avatar_versions from %I', r); end if;
  end loop;
end $$;
