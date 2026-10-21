-- Funnel-level notes (settings.notes) on share links.
-- Notes are internal by default: get_shared_funnel() only sends them when the team switched "Show on client share
-- links" on (settings.notes.shared). An editable link can never change them: save_shared_funnel() keeps the
-- stored notes whatever the client sends. Functions are replaced in place (no drops).

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
  if coalesce((f.settings ->> 'hideNumbers')::boolean, false) then
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

revoke all on function public.get_shared_funnel(text) from public;
grant execute on function public.get_shared_funnel(text) to anon, authenticated;
revoke all on function public.save_shared_funnel(text, jsonb, jsonb) from public;
grant execute on function public.save_shared_funnel(text, jsonb, jsonb) to anon, authenticated;
