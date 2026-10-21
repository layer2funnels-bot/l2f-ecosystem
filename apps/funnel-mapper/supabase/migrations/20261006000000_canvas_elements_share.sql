-- Canvas elements on share links.
-- 1. Element-level checklists (`checklist` on a node) are internal planning data, like internal notes (`desc`)
--    and screenshots (`shot`): never sent to share links, and carried over when a client saves an editable link.
-- 2. "Hide numbers" links keep the content of layout elements (notes, headings, frames, shapes, images and canvas
--    checklists); only the funnel blocks' numbers are removed.
-- Functions are replaced in place (no drops), so this is safe to apply to a live database.

create or replace function public.share_safe_graph(g jsonb, hide_numbers boolean) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_set(coalesce(g, '{}'::jsonb), '{nodes}', coalesce((
    select jsonb_agg(
      case
        when hide_numbers and n ->> 'type' not in ('note', 'label', 'frame', 'shape', 'image', 'checklist')
          then (n - 'desc' - 'shot' - 'checklist' - 'p') || '{"p":{}}'::jsonb
        else n - 'desc' - 'shot' - 'checklist'
      end)
    from jsonb_array_elements(g -> 'nodes') n), '[]'::jsonb))
$$;

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
         settings = case when p_settings is null then settings else p_settings || jsonb_build_object('hideNumbers', false) end
   where id = l.funnel_id;
  return true;
end $$;

revoke all on function public.save_shared_funnel(text, jsonb, jsonb) from public;
grant execute on function public.save_shared_funnel(text, jsonb, jsonb) to anon, authenticated;
