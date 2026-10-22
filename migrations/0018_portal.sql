set check_function_bodies = off;
-- 0018 · Client Portal data layer (Phase 6, data and API only; gate G2 applies before the owner switches the Portal on). OFF by default.
-- A client contact reaches only what staff shared on purpose (client_visible, not archived) for THEIR client, through projections that
-- never include internal fields, and may do exactly three things: answer an open shared request, decide an approval staff shared with them,
-- and write messages attached to a shared item. Everything else is refused by row security and by the API audience gate (0016).
-- Messages are immutable (no edit, no delete), attach to a shared request, file, approval or project, and carry no staff-only text.

insert into public.permissions (key, app_key, description, floor_role, default_role, scopes, sensitive) values
  ('portal.message.view', 'portal', 'Read the messages exchanged with a client in the Portal', 'viewer', 'editor', '{workspace,client}', false),
  ('portal.message.send', 'portal', 'Write to a client in the Portal',                        'editor', 'editor', '{workspace,client}', false);

create table public.portal_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null,                           -- from the subject; callers never set it
  subject_type text not null check (subject_type in ('request', 'file', 'approval', 'project')),
  subject_id uuid not null,
  author_id uuid not null,
  author_kind text not null check (author_kind in ('staff', 'client')),
  body text not null check (length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id)
);
create index portal_messages_subject on public.portal_messages (workspace_id, subject_type, subject_id, created_at);
create index portal_messages_client on public.portal_messages (workspace_id, client_id, created_at desc);

-- is this item shared with the client (exists in this organization, not archived, client_visible)? and whose is it?
create or replace function private.portal_subject(ws uuid, t text, sid uuid, out s_ok boolean, out s_client uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  s_ok := null; s_client := null;
  if t = 'request' then select true, r.client_id into s_ok, s_client from public.client_requests r where r.workspace_id = ws and r.id = sid and r.client_visible and r.archived_at is null;
  elsif t = 'file' then select true, f.client_id into s_ok, s_client from public.files f where f.workspace_id = ws and f.id = sid and f.client_visible and f.archived_at is null;
  elsif t = 'approval' then select true, a.client_id into s_ok, s_client from public.approvals a where a.workspace_id = ws and a.id = sid and a.client_visible;
  elsif t = 'project' then select true, p.client_id into s_ok, s_client from public.projects p where p.workspace_id = ws and p.id = sid and p.client_visible and p.archived_at is null;
  end if;
end $$;

create or replace function private.portal_messages_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); ok boolean; sc uuid;
begin
  if tg_op <> 'INSERT' then raise exception 'messages cannot be changed or removed' using errcode = 'P0001'; end if;
  select s.s_ok, s.s_client into ok, sc from private.portal_subject(new.workspace_id, new.subject_type, new.subject_id) s;
  if ok is not true or sc is null then raise exception 'not found' using errcode = '42501'; end if;
  new.client_id := sc;
  if uid is not null then new.author_id := uid; end if;
  new.author_kind := case when private.client_of(new.workspace_id, sc) then 'client' else 'staff' end;
  return new;
end $$;
create trigger portal_messages_guard before insert or update or delete on public.portal_messages for each row execute function private.portal_messages_guard();

-- ------------------------------------------------------------------ policies
alter table public.portal_messages enable row level security; alter table public.portal_messages force row level security;
create policy org_scope on public.portal_messages as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
create policy portal_messages_select on public.portal_messages for select using (
  private.has_permission(workspace_id, 'portal.message.view', client_id) or private.client_of(workspace_id, client_id));
create policy portal_messages_insert on public.portal_messages for insert with check (
  (author_kind = 'staff' and private.has_permission(workspace_id, 'portal.message.send', client_id))
  or (author_kind = 'client' and private.client_of(workspace_id, client_id)));

-- approvals a client may see and decide: only those staff shared (client_visible) with that client
create policy appr_client_select on public.approvals for select using (client_visible and private.client_of(workspace_id, client_id));
create policy appr_client_decide on public.approvals for update
  using (client_visible and status = 'pending' and private.client_of(workspace_id, client_id))
  with check (client_visible and private.client_of(workspace_id, client_id) and status in ('approved', 'rejected'));

-- requests: a client contact may answer an open shared request, changing only the answer and the status
create policy client_requests_answer on public.client_requests for update
  using (client_visible and archived_at is null and status = 'open' and private.client_of(workspace_id, client_id))
  with check (private.client_of(workspace_id, client_id) and status = 'answered');
create or replace function private.client_requests_contact_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.current_user_id() is null or private.is_staff(new.workspace_id) then return new; end if;   -- staff and server-side jobs are not limited here
  if old.status <> 'open' or not old.client_visible or old.archived_at is not null or new.status <> 'answered' or length(btrim(coalesce(new.response, ''))) = 0
     or (to_jsonb(new) - 'response' - 'status' - 'updated_at') is distinct from (to_jsonb(old) - 'response' - 'status' - 'updated_at') then
    raise exception 'not found' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger client_requests_contact_guard before update on public.client_requests for each row execute function private.client_requests_contact_guard();

-- the approval event log follows the approval; a client may read the events of the approvals shared with them (policy from 0017 uses approvals visibility)

-- ------------------------------------------------------------------ audit (no message text)
create trigger audit_portal_messages after insert on public.portal_messages
  for each row execute function private.audit_change('client_id', 'subject_type', 'subject_id', 'author_kind');


revoke all on all functions in schema private from public;
grant select, insert on public.portal_messages to app_user;
