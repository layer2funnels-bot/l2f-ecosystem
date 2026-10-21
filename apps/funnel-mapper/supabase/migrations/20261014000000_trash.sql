-- Trash (V2 F6): clients and funnels are moved to Trash instead of being removed. There is no time limit and nothing
-- is removed automatically: an item stays in Trash until someone restores it or deletes it forever.
--   * deleted_at / deleted_by mark an item as being in Trash (normal lists leave such rows out).
--   * Moving a client to Trash moves its funnels with it (same deleted_at); restoring the client restores them.
--   * Share links of a funnel in Trash (or of a client in Trash) stop working until it is restored.
--   * Owner / Admin / Editor can move to Trash and restore (the existing write rule); only Owner and Admin can delete
--     forever (a restrictive row-level rule on removal, below).
-- Additive and safe on a live database: new nullable columns, indexes, one restrictive policy per table, and the
-- three share functions replaced in place with one extra condition each.

alter table public.clients add column if not exists deleted_at timestamptz;
alter table public.clients add column if not exists deleted_by uuid references auth.users (id) on delete set null;
alter table public.funnels add column if not exists deleted_at timestamptz;
alter table public.funnels add column if not exists deleted_by uuid references auth.users (id) on delete set null;
create index if not exists clients_deleted_idx on public.clients (workspace_id, deleted_at);
create index if not exists funnels_deleted_idx on public.funnels (workspace_id, deleted_at);

-- Removing a row for good is for owners and admins (moving to Trash is an update, which editors may do).
create policy "clients: owners and admins remove for good" on public.clients as restrictive for delete to authenticated using (public.is_team_admin());
create policy "funnels: owners and admins remove for good" on public.funnels as restrictive for delete to authenticated using (public.is_team_admin());

-- Share functions: the same bodies as 20261010000000_share_notes.sql / 20261001000000_init.sql, plus "the funnel and
-- its client are not in Trash".
create or replace function public.get_shared_funnel(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  l public.share_links;
  f public.funnels;
  c public.clients;
  w public.workspaces;
  hidden boolean;
  s jsonb;
begin
  select * into l from public.share_links where token = p_token;
  if not found or (l.expires_at is not null and l.expires_at < now()) then
    return null;
  end if;
  select * into f from public.funnels where id = l.funnel_id;
  select * into c from public.clients where id = f.client_id;
  if f.deleted_at is not null or c.deleted_at is not null then
    return null;
  end if;
  select * into w from public.workspaces where id = f.workspace_id;

  hidden := l.hide_numbers or coalesce((f.settings ->> 'hideNumbers')::boolean, false);
  s := case when hidden then jsonb_build_object('currency', f.settings -> 'currency', 'basis', f.settings -> 'basis', 'hideNumbers', true) else f.settings - 'notes' end;
  -- funnel-level notes are internal unless the team switched "show on client share links" on
  if coalesce((f.settings -> 'notes' ->> 'shared')::boolean, false) then
    s := s || jsonb_build_object('notes', f.settings -> 'notes');
  end if;

  return jsonb_build_object(
    'funnel', jsonb_build_object('id', f.id, 'name', f.name, 'description', f.description, 'status', f.status,
                                 'graph', public.share_safe_graph(f.graph, hidden), 'settings', s, 'updated_at', f.updated_at),
    'client', jsonb_build_object('name', c.name, 'business_name', c.business_name, 'logo_url', c.logo_url),
    'agency', jsonb_build_object('name', coalesce(w.agency_name, ''), 'logo_url', w.agency_logo_url),
    'link', jsonb_build_object('can_edit', l.can_edit and not hidden, 'hide_numbers', hidden, 'allow_comments', l.allow_comments, 'expires_at', l.expires_at),
    'comments', coalesce((select jsonb_agg(jsonb_build_object('id', sc.id, 'node_id', sc.node_id, 'author_name', sc.author_name,
                                                              'body', sc.body, 'resolved', sc.resolved, 'created_at', sc.created_at)
                                           order by sc.created_at)
                          from public.share_comments sc where sc.share_link_id = l.id and l.allow_comments), '[]'::jsonb)
  );
end $$;

create or replace function public.save_shared_funnel(p_token text, p_graph jsonb, p_settings jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  l public.share_links;
  f public.funnels;
  merged jsonb;
begin
  select * into l from public.share_links where token = p_token;
  if not found or (l.expires_at is not null and l.expires_at < now()) or not l.can_edit or l.hide_numbers then
    raise exception 'invalid share link' using errcode = '42501';
  end if;
  if jsonb_typeof(p_graph -> 'nodes') <> 'array' or jsonb_typeof(p_graph -> 'edges') <> 'array' then
    raise exception 'invalid graph' using errcode = '22023';
  end if;
  select * into f from public.funnels where id = l.funnel_id;
  if coalesce((f.settings ->> 'hideNumbers')::boolean, false) or f.deleted_at is not null
     or exists (select 1 from public.clients c where c.id = f.client_id and c.deleted_at is not null) then
    raise exception 'invalid share link' using errcode = '42501';
  end if;
  -- the client never sees internal notes, screenshots or element checklists: carry them over from the saved block
  merged := jsonb_set(p_graph, '{nodes}', coalesce((
    select jsonb_agg((n - 'desc' - 'shot' - 'checklist') || coalesce((
      select jsonb_strip_nulls(jsonb_build_object('desc', o -> 'desc', 'shot', o -> 'shot', 'checklist', o -> 'checklist'))
      from jsonb_array_elements(f.graph -> 'nodes') o where o ->> 'id' = n ->> 'id' limit 1), '{}'::jsonb))
    from jsonb_array_elements(p_graph -> 'nodes') n), '[]'::jsonb));
  update public.funnels
     set graph = merged,
         settings = case when p_settings is null then settings
                         else (p_settings - 'notes') || jsonb_build_object('hideNumbers', false)
                              || case when settings ? 'notes' then jsonb_build_object('notes', settings -> 'notes') else '{}'::jsonb end
                    end
   where id = l.funnel_id;
  return true;
end $$;

create or replace function public.add_share_comment(p_token text, p_node_id text, p_author text, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  l public.share_links;
  f public.funnels;
  new_id uuid;
begin
  select * into l from public.share_links where token = p_token;
  if not found or (l.expires_at is not null and l.expires_at < now()) or not l.allow_comments then
    raise exception 'invalid share link' using errcode = '42501';
  end if;
  select * into f from public.funnels where id = l.funnel_id;
  if f.deleted_at is not null or exists (select 1 from public.clients c where c.id = f.client_id and c.deleted_at is not null) then
    raise exception 'invalid share link' using errcode = '42501';
  end if;
  insert into public.share_comments (share_link_id, funnel_id, owner_id, node_id, author_name, body)
  values (l.id, f.id, f.owner_id, nullif(p_node_id, ''), left(coalesce(p_author, ''), 120), left(p_body, 4000))
  returning id into new_id;
  return new_id;
end $$;

revoke all on function public.get_shared_funnel(text) from public;
revoke all on function public.save_shared_funnel(text, jsonb, jsonb) from public;
revoke all on function public.add_share_comment(text, text, text, text) from public;
grant execute on function public.get_shared_funnel(text) to anon, authenticated;
grant execute on function public.save_shared_funnel(text, jsonb, jsonb) to anon, authenticated;
grant execute on function public.add_share_comment(text, text, text, text) to anon, authenticated;
