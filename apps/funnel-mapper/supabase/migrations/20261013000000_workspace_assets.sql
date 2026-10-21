-- Workspace assets: saved style presets ("Save current" in Quick styles) and workspace blocks ("Save as workspace block").
-- One small table, scoped to the workspace like every other data table: members read, everyone but viewers writes.
-- Additive only; the share RPCs never read it, so nothing here can reach a share link.

create table if not exists public.workspace_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default public.current_workspace_id() references public.workspaces (id),
  kind text not null check (kind in ('style', 'block')),
  name text not null check (char_length(name) between 1 and 60),
  data jsonb not null check (pg_column_size(data) < 200000),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists workspace_assets_ws_kind_idx on public.workspace_assets (workspace_id, kind, created_at);

alter table public.workspace_assets enable row level security;

create policy "workspace_assets: members read" on public.workspace_assets for select to authenticated
  using (workspace_id = public.current_workspace_id());
create policy "workspace_assets: writers insert" on public.workspace_assets for insert to authenticated
  with check (workspace_id = public.current_workspace_id() and public.can_write());
create policy "workspace_assets: writers update" on public.workspace_assets for update to authenticated
  using (workspace_id = public.current_workspace_id() and public.can_write())
  with check (workspace_id = public.current_workspace_id() and public.can_write());
create policy "workspace_assets: writers remove" on public.workspace_assets for delete to authenticated
  using (workspace_id = public.current_workspace_id() and public.can_write());

grant select, insert, update, delete on public.workspace_assets to authenticated;
