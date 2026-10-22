set check_function_bodies = off;
-- 0017 · Approvals v2 (data and API only). A request names WHAT is to be approved (a subject of a known type, checked to exist in this
-- organization), who it is for (a client, copied from the subject), and carries a note. A decision is made once, by someone else, with a note;
-- the requester may withdraw while it is pending; a rejected request is resubmitted as a NEW request that points at the previous one
-- (version 2, 3, ...), so history is never rewritten. Every step is also written to an append-only event log. Clients may decide only the
-- requests staff marked client_visible, through the Portal (migration 0018).

insert into public.permissions (key, app_key, description, floor_role, default_role, scopes, sensitive) values
  ('approvals.request.view', 'platform', 'See approval requests and their history', 'viewer', 'viewer', '{workspace,client}', false);

alter table public.approvals
  add column client_id uuid,
  add column title text not null default '' check (length(title) <= 200),
  add column note text check (length(note) <= 4000),
  add column decision_note text check (length(decision_note) <= 4000),
  add column due_on date,
  add column client_visible boolean not null default false,
  add column previous_id uuid,
  add column updated_at timestamptz not null default now(),
  add constraint approvals_ws_id_key unique (workspace_id, id),
  add constraint approvals_client_fk foreign key (workspace_id, client_id) references public.clients (workspace_id, id),
  add constraint approvals_previous_fk foreign key (workspace_id, previous_id) references public.approvals (workspace_id, id);
alter table public.approvals drop constraint approvals_status_check;
alter table public.approvals add constraint approvals_status_check check (status in ('pending', 'approved', 'rejected', 'withdrawn'));
alter table public.approvals add constraint approvals_subject_type_check check (subject_type in
  ('deliverable', 'file', 'document', 'project', 'task', 'funnel_record', 'form', 'post', 'other'));
create index approvals_pending on public.approvals (workspace_id, created_at desc) where status = 'pending';
create index approvals_subject on public.approvals (workspace_id, subject_type, subject_id);

create table public.approval_events (                -- append-only: no update, no delete, written only by the trigger below
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  approval_id uuid not null,
  version int not null,
  event text not null check (event in ('requested', 'approved', 'rejected', 'withdrawn')),
  actor_id uuid,
  note text check (length(note) <= 4000),
  at timestamptz not null default now(),
  foreign key (workspace_id, approval_id) references public.approvals (workspace_id, id)
);
create index approval_events_approval on public.approval_events (workspace_id, approval_id, id);

-- Where is the subject, and which client does it belong to? Later migrations extend this for forms and posts.
create or replace function private.approval_subject(ws uuid, t text, sid uuid, out s_found boolean, out s_client uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  s_found := null; s_client := null;
  if t in ('deliverable', 'file', 'document') then select true, f.client_id into s_found, s_client from public.files f where f.workspace_id = ws and f.id = sid;
  elsif t = 'project' then select true, p.client_id into s_found, s_client from public.projects p where p.workspace_id = ws and p.id = sid;
  elsif t = 'task' then select true, k.client_id into s_found, s_client from public.project_tasks k where k.workspace_id = ws and k.id = sid;
  else s_found := true;                                  -- funnel_record, other: no table to check yet
  end if;
end $$;

create or replace function private.approvals_insert_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id(); sf boolean; sc uuid; pv public.approvals;
begin
  select s.s_found, s.s_client into sf, sc from private.approval_subject(new.workspace_id, new.subject_type, new.subject_id) s;
  if sf is not true then raise exception 'not found' using errcode = '42501'; end if;
  if sc is not null and new.client_id is not null and new.client_id <> sc then raise exception 'the client must be the subject''s client' using errcode = 'P0001'; end if;
  new.client_id := coalesce(sc, new.client_id);
  if new.client_visible and new.client_id is null then raise exception 'only a client''s request can be shown to the client' using errcode = 'P0001'; end if;
  if new.previous_id is not null then
    select * into pv from public.approvals a where a.workspace_id = new.workspace_id and a.id = new.previous_id;
    if pv.id is null then raise exception 'not found' using errcode = '42501'; end if;
    if pv.status <> 'rejected' then raise exception 'only a rejected request can be resubmitted' using errcode = 'P0001'; end if;
    if pv.subject_type <> new.subject_type or pv.subject_id <> new.subject_id then raise exception 'a resubmission keeps the same subject' using errcode = 'P0001'; end if;
    if exists (select 1 from public.approvals a where a.workspace_id = new.workspace_id and a.previous_id = pv.id) then raise exception 'already resubmitted' using errcode = 'P0001'; end if;
    new.version := pv.version + 1;
  else new.version := 1; end if;
  if exists (select 1 from public.approvals a where a.workspace_id = new.workspace_id and a.subject_type = new.subject_type and a.subject_id = new.subject_id and a.status = 'pending') then
    raise exception 'this item already has a pending request' using errcode = 'P0001';
  end if;
  if uid is not null then new.requested_by := uid; end if;
  new.status := 'pending'; new.decided_by := null; new.decided_at := null; new.decision_note := null;
  return new;
end $$;
create trigger approvals_insert_guard before insert on public.approvals for each row execute function private.approvals_insert_guard();

create or replace function private.approvals_decide() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id();
begin
  if old.status <> 'pending' then raise exception 'approval already decided' using errcode = 'P0001'; end if;
  if new.workspace_id is distinct from old.workspace_id or new.subject_type is distinct from old.subject_type or new.subject_id is distinct from old.subject_id
     or new.requested_by is distinct from old.requested_by or new.version is distinct from old.version or new.created_at is distinct from old.created_at
     or new.client_id is distinct from old.client_id or new.title is distinct from old.title or new.note is distinct from old.note or new.due_on is distinct from old.due_on
     or new.client_visible is distinct from old.client_visible or new.previous_id is distinct from old.previous_id
     or new.status not in ('approved', 'rejected', 'withdrawn') then
    raise exception 'only the decision can change' using errcode = 'P0001';
  end if;
  if new.status = 'withdrawn' and uid is distinct from old.requested_by then raise exception 'only the requester can withdraw' using errcode = 'P0001'; end if;
  if new.status in ('approved', 'rejected') and uid is not distinct from old.requested_by then raise exception 'someone else must decide' using errcode = 'P0001'; end if;
  if new.status = 'rejected' and length(btrim(coalesce(new.decision_note, ''))) = 0 then raise exception 'a rejection needs a reason' using errcode = 'P0001'; end if;
  new.decided_by := uid; new.decided_at := now(); new.updated_at := now();
  return new;
end $$;

create or replace function private.approvals_events() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.approval_events (workspace_id, approval_id, version, event, actor_id, note)
  values (new.workspace_id, new.id, new.version, case when tg_op = 'INSERT' then 'requested' else new.status end,
          case when tg_op = 'INSERT' then new.requested_by else new.decided_by end, case when tg_op = 'INSERT' then new.note else new.decision_note end);
  return null;
end $$;
create trigger approvals_events after insert or update on public.approvals for each row execute function private.approvals_events();

-- ------------------------------------------------------------------ policies
alter table public.approval_events enable row level security; alter table public.approval_events force row level security;
create policy org_scope on public.approval_events as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
create policy approval_events_select on public.approval_events for select using (
  exists (select 1 from public.approvals a where a.workspace_id = approval_events.workspace_id and a.id = approval_events.approval_id));

drop policy appr_select on public.approvals;
create policy appr_select on public.approvals for select using (private.has_permission(workspace_id, 'approvals.request.view', client_id));
drop policy appr_insert on public.approvals;
create policy appr_insert on public.approvals for insert with check (
  private.has_permission(workspace_id, 'approvals.request.create', client_id) and requested_by = private.current_user_id()
  and status = 'pending' and decided_by is null and decided_at is null
  and case when subject_type in ('deliverable', 'file', 'document') then exists (select 1 from public.files f where f.workspace_id = approvals.workspace_id and f.id = approvals.subject_id)
           when subject_type = 'project' then exists (select 1 from public.projects p where p.workspace_id = approvals.workspace_id and p.id = approvals.subject_id)
           when subject_type = 'task' then exists (select 1 from public.project_tasks k where k.workspace_id = approvals.workspace_id and k.id = approvals.subject_id)
           else true end);                                -- the person must be able to see what they ask about
drop policy appr_decide on public.approvals;
create policy appr_decide on public.approvals for update
  using (private.has_permission(workspace_id, 'approvals.request.decide', client_id) and requested_by <> private.current_user_id())
  with check (private.has_permission(workspace_id, 'approvals.request.decide', client_id) and requested_by <> private.current_user_id());
create policy appr_withdraw on public.approvals for update
  using (requested_by = private.current_user_id() and status = 'pending') with check (requested_by = private.current_user_id() and status = 'withdrawn');

-- ------------------------------------------------------------------ audit (statuses and ids, never the notes)
drop trigger audit_approvals on public.approvals;
create trigger audit_approvals after insert or update on public.approvals
  for each row execute function private.audit_change('subject_type', 'subject_id', 'client_id', 'status', 'version', 'decided_by', 'client_visible');

revoke all on all functions in schema private from public;
grant select on public.approval_events to app_user;
