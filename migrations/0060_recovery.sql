-- 0060 · Quality recovery (owner brief, 15 Nov 2026). Additive except the removed Access Review (rollback: migrations/rollback/0060_recovery.down.sql).
--   1. Access Review removed (owner: "I do not want this feature"): its two functions and the reviewed_at column go. app_usage and app_touch stay —
--      People › "Last active" uses them. Normal permissions, overrides and the audit log are untouched.
--   2. Launcher order per organization: owners and admins drag apps into place; everyone in that organization sees the same order.
--   3. Organization name: owners and admins rename their own organization (logged). Branding (logo) is now owners AND admins too.
--   4. Avatar Studio settings: the sections (and which of them show on the Profile) that new avatars start with. Existing avatars never change.
--   5. Office › Documents can link a Drive file into a section (no copy, no move: the file stays where it is and keeps its own access).
-- Every table is organization-scoped (restrictive org_scope policy) and nothing is granted to the Data API roles.

-- ---- 1. Access Review
drop function if exists public.access_review_keep(uuid, text);
drop function if exists public.access_review_list();
alter table public.app_usage drop column if exists reviewed_at;

-- ---- 2. Launcher order
create table if not exists public.workspace_app_order (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  app_key text not null references public.apps(key) on delete cascade,
  position int not null check (position between 0 and 1000),
  primary key (workspace_id, app_key)
);
alter table public.workspace_app_order enable row level security;
alter table public.workspace_app_order force row level security;
drop policy if exists sel on public.workspace_app_order;
create policy sel on public.workspace_app_order for select using (private.is_staff(workspace_id));
drop policy if exists org_scope on public.workspace_app_order;
create policy org_scope on public.workspace_app_order as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
grant select on public.workspace_app_order to app_user;   -- written only by launcher_order_set()

-- the whole order at once (the keys in their new order); owners and admins of the current organization only
create or replace function public.launcher_order_set(p_keys text[]) returns int
language plpgsql security definer set search_path = '' as $$
declare ws uuid := nullif(private.request_org(), '')::uuid; n int;
begin
  if ws is null or not private.has_role(ws, 'admin') then raise exception 'not found' using errcode = '42501'; end if;
  if p_keys is null or cardinality(p_keys) > 60 or exists (select 1 from unnest(p_keys) k where not exists (select 1 from public.apps a where a.key = k)) then
    raise exception 'unknown app' using errcode = '22023'; end if;
  delete from public.workspace_app_order where workspace_id = ws;
  insert into public.workspace_app_order (workspace_id, app_key, position) select ws, k, (o - 1)::int from unnest(p_keys) with ordinality as t(k, o) on conflict do nothing;
  get diagnostics n = row_count;
  insert into public.audit_events (workspace_id, actor_id, action, subject_type, subject_id, origin, detail)
  values (ws, private.current_user_id(), 'launcher.order', 'workspace', ws, 'app', jsonb_build_object('apps', to_jsonb(p_keys)));
  return n;
end $$;

-- ---- 3. Organization name (owners and admins) and branding (now owners and admins)
create or replace function public.workspace_rename(p_name text) returns text
language plpgsql security definer set search_path = '' as $$
declare ws uuid := nullif(private.request_org(), '')::uuid; nm text := btrim(coalesce(p_name, '')); old text;
begin
  if ws is null or not private.has_role(ws, 'admin') then raise exception 'not found' using errcode = '42501'; end if;
  if length(nm) < 2 or length(nm) > 80 then raise exception 'name must be 2 to 80 characters' using errcode = '22023'; end if;
  select name into old from public.workspaces where id = ws;
  update public.workspaces set name = nm where id = ws;
  insert into public.audit_events (workspace_id, actor_id, action, subject_type, subject_id, origin, detail)
  values (ws, private.current_user_id(), 'workspace.rename', 'workspace', ws, 'app', jsonb_build_object('from', old, 'to', nm));
  return nm;
end $$;
create or replace function public.workspace_branding_set(p_slot text, p_data text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare ws uuid := nullif(private.request_org(), '')::uuid;
begin
  if ws is null or not private.has_role(ws, 'admin') then raise exception 'not found' using errcode = '42501'; end if;
  if p_slot not in ('icon', 'wordmark', 'wordmark_dark', 'favicon') then raise exception 'unknown slot' using errcode = '22023'; end if;
  execute format('update public.workspaces set %I = $1 where id = $2', 'brand_' || p_slot) using nullif(p_data, ''), ws;
  insert into public.audit_events (workspace_id, actor_id, action, subject_type, subject_id, origin, detail)
  values (ws, private.current_user_id(), 'branding.' || case when coalesce(p_data, '') = '' then 'remove' else 'replace' end, 'workspace', ws, 'app', jsonb_build_object('slot', p_slot));
  return true;
end $$;
-- the small square logo of every organization this person belongs to (shown on the rail and the organization menus); nothing of anyone else's
create or replace function public.my_org_icons() returns table (org_id uuid, brand_icon text)
language sql stable security definer set search_path = '' as $$
  select w.id, w.brand_icon from public.workspaces w join public.memberships m on m.workspace_id = w.id
  where m.user_id = private.current_user_id() and m.status = 'active' and w.brand_icon is not null
$$;

-- ---- 4. Avatar Studio settings (defaults for NEW avatars only)
create table if not exists public.avatar_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  sections jsonb not null check (jsonb_typeof(sections) = 'array' and jsonb_array_length(sections) between 1 and 60 and pg_column_size(sections) <= 60000),
  updated_by uuid, updated_at timestamptz not null default now()
);
alter table public.avatar_settings enable row level security;
alter table public.avatar_settings force row level security;
drop policy if exists sel on public.avatar_settings;
create policy sel on public.avatar_settings for select using (private.has_permission(workspace_id, 'funnels.avatar.view'));
drop policy if exists mng on public.avatar_settings;
create policy mng on public.avatar_settings for all using (private.has_role(workspace_id, 'admin')) with check (private.has_role(workspace_id, 'admin') and updated_by = private.current_user_id());
drop policy if exists org_scope on public.avatar_settings;
create policy org_scope on public.avatar_settings as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
grant select, insert, update, delete on public.avatar_settings to app_user;

-- ---- 5. Documents: a Drive file linked into a section (the file is not copied or moved)
create table if not exists public.doc_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  section_id uuid not null,
  file_id uuid not null,
  created_by uuid not null default private.current_user_id(), created_at timestamptz not null default now(),
  unique (section_id, file_id),
  foreign key (workspace_id, section_id) references public.doc_sections (workspace_id, id) on delete cascade,
  foreign key (file_id) references public.files (id) on delete cascade
);
alter table public.doc_links enable row level security;
alter table public.doc_links force row level security;
-- seen with its section (the section's own rule decides; the file itself is only listed when the person can also read it — see office.doclinks.list)
drop policy if exists sel on public.doc_links;
create policy sel on public.doc_links for select using (exists (select 1 from public.doc_sections s where s.id = section_id and s.workspace_id = doc_links.workspace_id));
-- linking: someone who may add documents (drive.file.upload), into a section that is not owner-protected (or by an owner), a file they can read that
-- belongs to the organization's shared Drive (never a client's file or someone's personal file)
drop policy if exists ins on public.doc_links;
create policy ins on public.doc_links for insert with check (created_by = private.current_user_id() and private.has_permission(workspace_id, 'drive.file.upload')
  and exists (select 1 from public.doc_sections s where s.id = section_id and s.workspace_id = doc_links.workspace_id and (not s.owner_protected or private.has_role(s.workspace_id, 'owner')))
  and exists (select 1 from public.files f where f.id = file_id and f.workspace_id = doc_links.workspace_id and f.space = 'shared' and f.client_id is null and f.archived_at is null));
drop policy if exists del on public.doc_links;
create policy del on public.doc_links for delete using (created_by = private.current_user_id() or private.has_role(workspace_id, 'admin'));
drop policy if exists org_scope on public.doc_links;
create policy org_scope on public.doc_links as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
grant select, insert, delete on public.doc_links to app_user;

revoke all on function public.launcher_order_set(text[]), public.workspace_rename(text), public.my_org_icons() from public;
grant execute on function public.launcher_order_set(text[]), public.workspace_rename(text), public.workspace_branding_set(text, text), public.my_org_icons() to app_user;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on table public.workspace_app_order, public.avatar_settings, public.doc_links from %I', r);
      execute format('revoke all on function public.launcher_order_set(text[]), public.workspace_rename(text), public.workspace_branding_set(text, text), public.my_org_icons() from %I', r);
    end if;
  end loop;
end $$;

-- ---- 6. Clients and Office (owner brief Part 3-H): a client contact sees a shared Office record (avatar, offer, story, brand kit) only when Office is
-- switched on for THEIR client in the Client Access Matrix (owners and admins decide). Staff access is unchanged. Clients reach these rows only through
-- the portal.office.* projections, which never include internal notes, evidence or interview notes.
grant execute on function private.client_app_enabled(uuid, uuid, text) to app_user;   -- used inside row rules, which run as the caller
do $$
declare pair text[]; t text; o text;
begin
  foreach pair slice 1 in array array[['funnel_avatars', 'avatar'], ['funnel_offers', 'offer'], ['funnel_stories', 'story'], ['funnel_brand_kits', 'brandkit']] loop
    t := pair[1]; o := pair[2];
    execute format('drop policy if exists %1$s_select on public.%1$I', t);
    execute format('create policy %1$s_select on public.%1$I for select using (
      private.has_permission(workspace_id, %2$L, client_id)
      or (client_visible and archived_at is null and client_id is not null and private.client_of(workspace_id, client_id) and private.client_app_enabled(workspace_id, client_id, %3$L)))', t, 'funnels.' || o || '.view', 'office');
  end loop;
end $$;
