-- Share links must expose only what the owner intended. When numbers are hidden (per link or per funnel),
-- strip every block's parameters and the funnel's financial settings inside the database function itself,
-- so calling the RPC directly with the public anon key can't reveal prices, rates or costs.

create or replace function public.get_shared_funnel(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  l public.share_links;
  f public.funnels;
  c public.clients;
  p public.profiles;
  hidden boolean;
  g jsonb;
  s jsonb;
begin
  select * into l from public.share_links where token = p_token;
  if not found or (l.expires_at is not null and l.expires_at < now()) then
    return null;
  end if;
  select * into f from public.funnels where id = l.funnel_id;
  select * into c from public.clients where id = f.client_id;
  select * into p from public.profiles where id = f.owner_id;

  hidden := l.hide_numbers or coalesce((f.settings ->> 'hideNumbers')::boolean, false);
  g := f.graph;
  s := f.settings;
  if hidden then
    g := jsonb_set(f.graph, '{nodes}', coalesce((
      select jsonb_agg(case when n ->> 'type' in ('note', 'label', 'frame') then n else (n - 'p') || '{"p":{}}'::jsonb end)
      from jsonb_array_elements(f.graph -> 'nodes') n), '[]'::jsonb));
    s := jsonb_build_object('currency', f.settings -> 'currency', 'basis', f.settings -> 'basis', 'hideNumbers', true);
  end if;

  return jsonb_build_object(
    'funnel', jsonb_build_object('id', f.id, 'name', f.name, 'description', f.description, 'status', f.status,
                                 'graph', g, 'settings', s, 'updated_at', f.updated_at),
    'client', jsonb_build_object('name', c.name, 'business_name', c.business_name, 'logo_url', c.logo_url),
    'agency', jsonb_build_object('name', p.agency_name, 'logo_url', p.agency_logo_url),
    'link', jsonb_build_object('can_edit', l.can_edit, 'hide_numbers', hidden, 'allow_comments', l.allow_comments, 'expires_at', l.expires_at),
    'comments', coalesce((select jsonb_agg(jsonb_build_object('id', sc.id, 'node_id', sc.node_id, 'author_name', sc.author_name,
                                                              'body', sc.body, 'resolved', sc.resolved, 'created_at', sc.created_at)
                                           order by sc.created_at)
                          from public.share_comments sc where sc.share_link_id = l.id and l.allow_comments), '[]'::jsonb)
  );
end $$;

revoke all on function public.get_shared_funnel(text) from public;
grant execute on function public.get_shared_funnel(text) to anon, authenticated;
