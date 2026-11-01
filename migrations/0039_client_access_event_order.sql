set check_function_bodies = off;
-- 0039 · Client access history keeps the order steps happened in. Two steps of one request (created_client, invited) can share the same
-- clock_timestamp() microsecond; the tie was broken by the random id, so the history sometimes showed them swapped (CA26 failed now and then).
-- An identity column numbers events in insertion order; existing rows are numbered in their stored order.
alter table public.client_access_events add column seq bigint generated always as identity;
create index client_access_events_order on public.client_access_events (workspace_id, access_id, seq);

create or replace function public.client_access_events_list(p_access uuid)
returns table (event text, actor_id uuid, detail text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare ws uuid := private.client_access_org();
begin
  return query select e.event, e.actor_id, e.detail, e.created_at from public.client_access_events e where e.workspace_id = ws and e.access_id = p_access order by e.seq;
end $$;
revoke all on function public.client_access_events_list(uuid) from public;
grant execute on function public.client_access_events_list(uuid) to app_user;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all tables in schema public from %I', r);
      execute format('revoke all on all functions in schema public from %I', r);
      execute format('revoke all on all sequences in schema public from %I', r);
    end if;
  end loop;
end $$;
