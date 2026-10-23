set check_function_bodies = off;
-- 0032 · Client access (Door A, invite first). One registry of who may reach the Client Portal, for which client record, in which organization.
-- Door A: a staff member with `clients.access.manage` invites a client contact by e-mail. The server, in ONE all-or-nothing step, finds or creates the client
-- record (no duplicates), issues the invitation, and records the access as "invited". The contact signs in with the invited e-mail and accepts; the access
-- becomes "active" and their membership (kind client, bound to that one client record) is created by the existing accept_invitation. Suspend, restore and
-- revoke act on that membership. Nothing is granted by signing up or by submitting a form.
-- The Portal itself stays locked (gate G2): the app is "coming soon" and a workspace switch is needed, so an active client sees nothing until the owner opens it.
-- Door B (request access, approval queue) fits without redesign: statuses `requested` and `rejected` and source `request` are already allowed here, the same table
-- holds the queue, and approving is just the move requested -> invited -> active through the same functions. It is NOT implemented in this migration.
-- Additive and local-only until the owner approves the go-live package.

insert into public.permissions (key, app_key, description, floor_role, default_role, scopes, sensitive) values
  ('clients.access.manage', 'clients', 'Invite clients to the Client Portal and suspend, restore or revoke their access', 'admin', 'admin', '{workspace}', true);

create table public.client_access (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null,
  email text not null check (email = lower(email) and length(email) <= 320 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  person_name text check (person_name is null or length(person_name) <= 200),
  source text not null default 'invite' check (source in ('invite', 'request')),
  status text not null default 'invited' check (status in ('requested', 'invited', 'active', 'suspended', 'rejected', 'revoked')),
  user_id uuid,                                    -- the signed-in identity, set when the person accepts
  invitation_id uuid,
  invited_by uuid,
  decided_by uuid, decided_at timestamptz,
  note text check (note is null or length(note) <= 500),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id),
  check (status not in ('active', 'suspended') or user_id is not null)
);
-- one live access per e-mail per organization, and one per signed-in person per organization
create unique index client_access_live_email on public.client_access (workspace_id, email) where status in ('requested', 'invited', 'active', 'suspended');
create unique index client_access_live_user on public.client_access (workspace_id, user_id) where user_id is not null and status in ('active', 'suspended');
create index client_access_client on public.client_access (workspace_id, client_id);
create index client_access_invitation on public.client_access (invitation_id) where invitation_id is not null;

create table public.client_access_events (          -- append-only: no update, no delete. No e-mail or name is stored here (codes only)
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  access_id uuid,
  event text not null check (event in ('invited', 'reinvited', 'created_client', 'linked_client', 'accepted', 'suspended', 'restored', 'revoked', 'failed')),
  actor_id uuid,
  detail text check (detail is null or length(detail) <= 120),
  created_at timestamptz not null default clock_timestamp(),     -- real time, so the steps of one request keep their order
  foreign key (workspace_id, access_id) references public.client_access (workspace_id, id)
);
create index client_access_events_access on public.client_access_events (workspace_id, access_id, created_at);
create or replace function private.client_access_events_append_only() returns trigger
language plpgsql security definer set search_path = '' as $$
begin raise exception 'the access history cannot be changed' using errcode = 'P0001'; end $$;
create trigger client_access_events_no_change before update or delete on public.client_access_events for each row execute function private.client_access_events_append_only();

create or replace function private.client_access_event(ws uuid, aid uuid, ev text, d text default null) returns void
language sql security definer set search_path = '' as $$
  insert into public.client_access_events (workspace_id, access_id, event, actor_id, detail) values (ws, aid, ev, private.current_user_id(), d)
$$;

-- who may move what (the only status changes the table accepts)
create or replace function private.client_access_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status not in ('invited', 'requested') then raise exception 'a new access starts as invited or requested' using errcode = 'P0001'; end if;
    new.user_id := null; new.decided_by := null; new.decided_at := null;
    return new;
  end if;
  if new.workspace_id is distinct from old.workspace_id or new.client_id is distinct from old.client_id or new.email is distinct from old.email or new.source is distinct from old.source or new.created_at is distinct from old.created_at then
    raise exception 'access records do not move' using errcode = 'P0001';
  end if;
  if new.status is distinct from old.status and not ((old.status, new.status) in (
      ('requested', 'invited'), ('requested', 'rejected'), ('requested', 'revoked'),
      ('invited', 'active'), ('invited', 'revoked'),
      ('active', 'suspended'), ('active', 'revoked'), ('suspended', 'active'), ('suspended', 'revoked'))) then
    raise exception 'access cannot go from % to %', old.status, new.status using errcode = 'P0001';
  end if;
  if old.user_id is not null and new.user_id is distinct from old.user_id then raise exception 'access records do not move' using errcode = 'P0001'; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger client_access_guard before insert or update on public.client_access for each row execute function private.client_access_guard();
create or replace function private.client_access_refuse_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin raise exception 'access records are kept; revoke the access instead' using errcode = 'P0001'; end $$;
create trigger client_access_refuse_delete before delete on public.client_access for each row execute function private.client_access_refuse_delete();

-- the registry is complete whichever way a client invitation was made (this function, or the older create_invitation)
create or replace function private.client_access_from_invitation() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if new.kind <> 'client' then return new; end if;
  update public.client_access set invitation_id = new.id, status = case when status = 'requested' then 'invited' else status end, updated_at = now()
   where workspace_id = new.workspace_id and email = new.email and status in ('requested', 'invited');
  get diagnostics n = row_count;
  if n = 0 and not exists (select 1 from public.client_access a where a.workspace_id = new.workspace_id and a.email = new.email and a.status in ('active', 'suspended')) then
    insert into public.client_access (workspace_id, client_id, email, source, status, invitation_id, invited_by)
    values (new.workspace_id, new.client_id, new.email, 'invite', 'invited', new.id, new.invited_by);
  end if;
  return new;
end $$;
create trigger client_access_from_invitation after insert on public.invitations for each row execute function private.client_access_from_invitation();

create or replace function private.client_access_invitation_revoked() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.revoked_at is not null and old.revoked_at is null then
    update public.client_access set status = 'revoked', decided_by = coalesce(decided_by, private.current_user_id()), decided_at = coalesce(decided_at, now())
     where invitation_id = new.id and status = 'invited';
  end if;
  return new;
end $$;
create trigger client_access_invitation_revoked after update of revoked_at on public.invitations for each row execute function private.client_access_invitation_revoked();

-- a membership changed by any other route (for example members.remove) keeps the registry honest
create or replace function private.client_access_from_membership() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.kind = 'client' then
      update public.client_access set status = 'revoked', decided_at = coalesce(decided_at, now()) where workspace_id = old.workspace_id and user_id = old.user_id and status in ('active', 'suspended');
    end if;
    return old;
  end if;
  if new.kind = 'client' and new.status is distinct from old.status then
    update public.client_access set status = case when new.status = 'active' then 'active' else 'suspended' end
     where workspace_id = new.workspace_id and user_id = new.user_id and status in ('active', 'suspended') and status is distinct from (case when new.status = 'active' then 'active' else 'suspended' end);
  end if;
  return new;
end $$;
create trigger client_access_from_membership after update or delete on public.memberships for each row execute function private.client_access_from_membership();

-- ------------------------------------------------------------------ acceptance: the existing function, plus the registry
create or replace function public.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  inv public.invitations;
  uid uuid := private.current_user_id();
  mid uuid;
  aid uuid;
begin
  select * into inv from public.invitations
   where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
     and accepted_at is null and revoked_at is null and expires_at > now()
   for update;
  if uid is null or inv.id is null or inv.email is distinct from private.current_user_email()
     or exists (select 1 from public.memberships m where m.workspace_id = inv.workspace_id and m.user_id = uid) then
    raise exception 'invitation not valid' using errcode = 'P0002';
  end if;
  insert into public.memberships (workspace_id, user_id, kind, role, client_id)
  values (inv.workspace_id, uid, inv.kind, inv.role, inv.client_id) returning id into mid;
  if inv.kind = 'staff' then
    insert into public.app_grants (workspace_id, user_id, app_key, granted_by)
    select inv.workspace_id, uid, a, inv.invited_by from unnest(inv.apps) a
    where exists (select 1 from public.apps x where x.key = a and x.scope <> 'portal')
    on conflict do nothing;
  else
    update public.client_access set status = 'active', user_id = uid, decided_at = now()
     where invitation_id = inv.id and status in ('invited', 'requested') returning id into aid;
    if aid is null then raise exception 'invitation not valid' using errcode = 'P0002'; end if;
    perform private.client_access_event(inv.workspace_id, aid, 'accepted');
  end if;
  update public.invitations set accepted_at = now(), accepted_by = uid where id = inv.id;
  return mid;
end $$;

-- ------------------------------------------------------------------ staff functions (organization from the request; permission checked here and by row security)
create or replace function private.client_access_org() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare r text := private.request_org();
begin
  if r is null or r !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'not found' using errcode = '42501'; end if;
  if not private.has_permission(r::uuid, 'clients.access.manage') then raise exception 'not found' using errcode = '42501'; end if;
  return r::uuid;
end $$;

create or replace function public.client_access_list()
returns table (id uuid, client_id uuid, client_name text, email text, person_name text, source text, status text, invitation_expired boolean, portal_live boolean,
               created_at timestamptz, decided_at timestamptz, note text)
language plpgsql stable security definer set search_path = '' as $$
declare ws uuid := private.client_access_org();
begin
  return query
    select a.id, a.client_id, c.name, a.email, a.person_name, a.source, a.status,
           (a.status = 'invited' and not exists (select 1 from public.invitations i where i.id = a.invitation_id and i.accepted_at is null and i.revoked_at is null and i.expires_at > now())),
           exists (select 1 from public.workspace_apps wa join public.apps x on x.key = wa.app_key where wa.workspace_id = ws and x.scope = 'portal' and wa.enabled and x.lifecycle = 'active'),
           a.created_at, a.decided_at, a.note
      from public.client_access a join public.clients c on c.workspace_id = a.workspace_id and c.id = a.client_id
     where a.workspace_id = ws
     order by case a.status when 'requested' then 0 when 'invited' then 1 when 'active' then 2 when 'suspended' then 3 else 4 end, a.created_at desc;
end $$;

create or replace function public.client_access_events_list(p_access uuid)
returns table (event text, actor_id uuid, detail text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare ws uuid := private.client_access_org();
begin
  return query select e.event, e.actor_id, e.detail, e.created_at from public.client_access_events e where e.workspace_id = ws and e.access_id = p_access order by e.created_at, e.id;
end $$;

-- The invite. Everything between BEGIN and EXCEPTION is one step: if any part fails, nothing is kept except one "failed" event with a code, and the caller
-- gets ok = false and the code (the screen says nothing was changed and offers a retry). Asking again with the same e-mail is safe: it finds the same
-- access and client, cancels the old link and issues a new one. A person who already has access is refused, never given a second one.
create or replace function public.client_access_invite(p_email text, p_client uuid default null, p_client_name text default null, p_person_name text default null)
returns table (ok boolean, code text, access_id uuid, client_id uuid, token text, reused boolean, client_created boolean)
language plpgsql security definer set search_path = '' as $$
declare
  ws uuid := private.client_access_org();
  v_email text := lower(btrim(coalesce(p_email, '')));
  a public.client_access; existed boolean; cid uuid; linked boolean := false; made boolean := false; tok text; inv uuid; aid uuid; n int; prev uuid; cname text;
  pname text := nullif(btrim(coalesce(p_person_name, '')), '');
begin
  -- checks that refuse the request outright: nothing is written and the caller gets a plain code (ok = false); not-found and permission failures raise as usual
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 320 then return query select false, 'bad_email'::text, null::uuid, null::uuid, null::text, false, false; return; end if;
  if length(coalesce(p_client_name, '')) > 200 or length(coalesce(pname, '')) > 200 then return query select false, 'name_too_long'::text, null::uuid, null::uuid, null::text, false, false; return; end if;
  if p_client is not null and not exists (select 1 from public.clients c where c.workspace_id = ws and c.id = p_client) then raise exception 'not found' using errcode = '42501'; end if;
  if exists (select 1 from public.memberships m join public.profiles p on p.id = m.user_id where m.workspace_id = ws and m.kind = 'staff' and lower(p.email) = v_email) then
    return query select false, 'team_member'::text, null::uuid, null::uuid, null::text, false, false; return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(ws::text || ':' || v_email, 7032));   -- two requests for the same e-mail take turns
  select * into a from public.client_access x where x.workspace_id = ws and x.email = v_email and x.status in ('requested', 'invited', 'active', 'suspended');
  existed := found;
  if existed and a.status in ('active', 'suspended') then return query select false, 'already_has_access'::text, a.id, a.client_id, null::text, false, false; return; end if;
  if existed and p_client is not null and p_client <> a.client_id then return query select false, 'pending_for_other_client'::text, a.id, a.client_id, null::text, false, false; return; end if;
  -- which client record: the pending one, the one chosen, the one this e-mail had before, the one already carrying this e-mail, or a new one
  if existed then cid := a.client_id;
  elsif p_client is not null then cid := p_client; linked := true;
  else
    select x.client_id into prev from public.client_access x where x.workspace_id = ws and x.email = v_email order by x.created_at desc limit 1;
    if prev is not null then cid := prev; linked := true;
    else
      select count(*), min(p.client_id::text)::uuid into n, cid from public.client_profiles p where p.workspace_id = ws and lower(p.email) = v_email;
      if n > 1 then return query select false, 'several_clients'::text, null::uuid, null::uuid, null::text, false, false; return; end if;
      linked := n = 1;
    end if;
  end if;
  -- everything below is one step: if any part fails nothing is kept except one "failed" event with a code, and the caller is told (ok = false)
  begin
    if cid is null then
      cname := coalesce(nullif(btrim(coalesce(p_client_name, '')), ''), pname, split_part(v_email, '@', 1));
      insert into public.clients (workspace_id, name) values (ws, cname) returning id into cid;
      update public.client_profiles cp set email = v_email, status = 'lead', stage_key = (select st.key from public.client_stages st where st.workspace_id = ws and st.key = 'onboarding')
       where cp.workspace_id = ws and cp.client_id = cid;      -- the profile row is created with the client
      made := true;
    end if;
    if existed and a.invitation_id is not null then
      update public.client_access set invitation_id = null where id = a.id;
      update public.invitations set revoked_at = now() where id = a.invitation_id and accepted_at is null and revoked_at is null;
    end if;
    tok := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    insert into public.invitations (workspace_id, email, kind, role, client_id, apps, token_hash, invited_by)
    values (ws, v_email, 'client', null, cid, '{}', encode(sha256(convert_to(tok, 'UTF8')), 'hex'), private.current_user_id()) returning id into inv;
    update public.client_access set person_name = coalesce(pname, person_name), invited_by = private.current_user_id() where invitation_id = inv returning id into aid;
    if aid is null then raise exception 'the invitation could not be recorded'; end if;
    if made then perform private.client_access_event(ws, aid, 'created_client');
    elsif linked then perform private.client_access_event(ws, aid, 'linked_client'); end if;
    perform private.client_access_event(ws, aid, case when existed then 'reinvited' else 'invited' end);
    return query select true, 'ok'::text, aid, cid, tok, existed, made;
    return;
  exception when others then
    perform private.client_access_event(ws, case when existed then a.id end, 'failed', 'invite:' || sqlstate);
    return query select false, sqlstate::text, null::uuid, null::uuid, null::text, false, false;
    return;
  end;
end $$;

create or replace function public.client_access_set_status(p_access uuid, p_status text, p_note text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare ws uuid := private.client_access_org(); a public.client_access; ev text;
begin
  if p_status not in ('suspended', 'active', 'revoked') then raise exception 'invalid status' using errcode = 'P0001'; end if;
  if length(coalesce(p_note, '')) > 500 then raise exception 'that note is too long' using errcode = 'P0001'; end if;
  select * into a from public.client_access x where x.id = p_access and x.workspace_id = ws for update;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  if a.status = p_status then return a.status; end if;   -- asking twice changes nothing
  if (a.status, p_status) not in (('active', 'suspended'), ('suspended', 'active'), ('invited', 'revoked'), ('active', 'revoked'), ('suspended', 'revoked')) then
    raise exception 'access cannot go from % to %', a.status, p_status using errcode = 'P0001';
  end if;
  if p_status = 'revoked' and a.invitation_id is not null then
    update public.invitations set revoked_at = now() where id = a.invitation_id and accepted_at is null and revoked_at is null;
  end if;
  if a.user_id is not null then
    if p_status = 'revoked' then delete from public.memberships where workspace_id = ws and user_id = a.user_id and kind = 'client';
    else update public.memberships set status = case when p_status = 'active' then 'active' else 'deactivated' end where workspace_id = ws and user_id = a.user_id and kind = 'client'; end if;
  end if;
  update public.client_access set status = p_status, decided_by = private.current_user_id(), decided_at = now(), note = nullif(btrim(coalesce(p_note, '')), '') where id = a.id;
  ev := case p_status when 'suspended' then 'suspended' when 'active' then 'restored' else 'revoked' end;
  perform private.client_access_event(ws, a.id, ev);
  return p_status;
end $$;

-- ------------------------------------------------------------------ row security, grants, audit
alter table public.client_access enable row level security; alter table public.client_access force row level security;
alter table public.client_access_events enable row level security; alter table public.client_access_events force row level security;
create policy org_scope on public.client_access as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
create policy org_scope on public.client_access_events as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
create policy client_access_select on public.client_access for select using (private.has_permission(workspace_id, 'clients.access.manage'));
create policy client_access_events_select on public.client_access_events for select using (private.has_permission(workspace_id, 'clients.access.manage'));
-- no insert / update / delete policy: only the functions above (owner rights) can write

create trigger audit_client_access after insert or update or delete on public.client_access for each row execute function private.audit_change('client_id', 'status', 'source', 'user_id');

revoke all on all functions in schema private from public;
revoke all on function public.client_access_list(), public.client_access_events_list(uuid), public.client_access_invite(text, uuid, text, text), public.client_access_set_status(uuid, text, text) from public;
grant select on public.client_access, public.client_access_events to app_user;
grant execute on function public.client_access_list(), public.client_access_events_list(uuid), public.client_access_invite(text, uuid, text, text), public.client_access_set_status(uuid, text, text) to app_user;
