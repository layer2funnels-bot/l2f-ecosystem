-- The transformation (idempotent: ids come from fmp.id_map, inserts skip rows that already exist). Parameters: :org (target organization id).
-- Runs as the database owner during the spike. Personal workspaces (independent accounts) are NOT migrated: they need a decision first.
insert into fmp.id_map (kind, old_id, new_id, workspace_id)
  select 'client', c.id, gen_random_uuid(), :'org' from fmp_src.clients c join fmp_src.workspaces w on w.id = c.workspace_id and w.kind = 'team'
  union all select 'product', p.id, gen_random_uuid(), :'org' from fmp_src.products p join fmp_src.workspaces w on w.id = p.workspace_id and w.kind = 'team'
  union all select 'funnel', f.id, gen_random_uuid(), :'org' from fmp_src.funnels f join fmp_src.workspaces w on w.id = f.workspace_id and w.kind = 'team'
  union all select 'version', v.id, gen_random_uuid(), :'org' from fmp_src.funnel_versions v join fmp_src.funnels f on f.id = v.funnel_id join fmp_src.workspaces w on w.id = f.workspace_id and w.kind = 'team'
  union all select 'actual', a.id, gen_random_uuid(), :'org' from fmp_src.funnel_actuals a join fmp_src.funnels f on f.id = a.funnel_id join fmp_src.workspaces w on w.id = f.workspace_id and w.kind = 'team'
  union all select 'share_link', s.id, gen_random_uuid(), :'org' from fmp_src.share_links s join fmp_src.funnels f on f.id = s.funnel_id join fmp_src.workspaces w on w.id = f.workspace_id and w.kind = 'team'
  union all select 'comment', c.id, gen_random_uuid(), :'org' from fmp_src.share_comments c join fmp_src.funnels f on f.id = c.funnel_id join fmp_src.workspaces w on w.id = f.workspace_id and w.kind = 'team'
  union all select 'template', t.id, gen_random_uuid(), case when t.workspace_id is null then null else :'org'::uuid end from fmp_src.templates t
on conflict (kind, old_id) do nothing;

-- clients: into the ecosystem Clients tables (a profile row is created by the trigger), the FMP-only commercial fields beside them
insert into public.clients (id, workspace_id, name, archived_at)
  select m.new_id, :'org', c.name, c.archived_at from fmp_src.clients c join fmp.id_map m on m.kind = 'client' and m.old_id = c.id on conflict (id) do nothing;
update public.client_profiles p set business_name = nullif(c.business_name, ''), niche = nullif(c.niche, ''), email = nullif(c.email, ''), phone = nullif(c.phone, ''), website = case when c.website ~ '^https?://' then c.website end,
    country = nullif(c.country, ''), currency = c.currency, status = c.status, tags = c.tags[1:20]
  from fmp_src.clients c join fmp.id_map m on m.kind = 'client' and m.old_id = c.id where p.client_id = m.new_id;
insert into fmp.client_commercial (workspace_id, client_id, monthly_retainer, pricing_model, pricing_amount, logo_path, was_in_trash, trashed_at, notes)
  select :'org', m.new_id, c.monthly_retainer, c.pricing_model, c.pricing_amount, c.logo_url, c.deleted_at is not null, c.deleted_at, c.notes from fmp_src.clients c join fmp.id_map m on m.kind = 'client' and m.old_id = c.id on conflict (workspace_id, client_id) do nothing;
-- Funnel Mapper's client notes stay Funnel Mapper's own (V7 03 §3): carried in fmp.client_commercial.notes by the insert above

insert into fmp.products (id, workspace_id, client_id, name, type, params, notes, created_at)
  select mp.new_id, :'org', mc.new_id, p.name, p.type, p.params, p.notes, p.created_at from fmp_src.products p join fmp.id_map mp on mp.kind = 'product' and mp.old_id = p.id left join fmp.id_map mc on mc.kind = 'client' and mc.old_id = p.client_id on conflict (id) do nothing;
insert into fmp.funnels (id, workspace_id, client_id, name, description, status, graph, settings, summary, thumbnail_path, trashed_at, created_at, updated_at)
  select mf.new_id, :'org', mc.new_id, f.name, f.description, f.status, f.graph, f.settings, f.summary, f.thumbnail_url, f.deleted_at, f.created_at, f.updated_at
    from fmp_src.funnels f join fmp.id_map mf on mf.kind = 'funnel' and mf.old_id = f.id join fmp.id_map mc on mc.kind = 'client' and mc.old_id = f.client_id on conflict (id) do nothing;
insert into fmp.funnel_versions (id, workspace_id, funnel_id, graph, settings, label, auto, created_at)
  select mv.new_id, :'org', mf.new_id, v.graph, v.settings, v.label, v.auto, v.created_at from fmp_src.funnel_versions v join fmp.id_map mv on mv.kind = 'version' and mv.old_id = v.id join fmp.id_map mf on mf.kind = 'funnel' and mf.old_id = v.funnel_id on conflict (id) do nothing;
insert into fmp.funnel_actuals (id, workspace_id, funnel_id, period_start, period_end, node_id, visitors, conversions, revenue, spend, source)
  select ma.new_id, :'org', mf.new_id, a.period_start, a.period_end, a.node_id, a.visitors, a.conversions, a.revenue, a.spend, a.source from fmp_src.funnel_actuals a join fmp.id_map ma on ma.kind = 'actual' and ma.old_id = a.id join fmp.id_map mf on mf.kind = 'funnel' and mf.old_id = a.funnel_id on conflict (id) do nothing;
-- share links: the raw token is hashed on the way in (links already in circulation keep working: the new resolver hashes what it is given)
insert into fmp.share_links (id, workspace_id, funnel_id, token_hash, can_edit, hide_numbers, allow_comments, expires_at, created_at)
  select ms.new_id, :'org', mf.new_id, encode(sha256(convert_to(s.token, 'UTF8')), 'hex'), s.can_edit, s.hide_numbers, s.allow_comments, s.expires_at, s.created_at from fmp_src.share_links s join fmp.id_map ms on ms.kind = 'share_link' and ms.old_id = s.id join fmp.id_map mf on mf.kind = 'funnel' and mf.old_id = s.funnel_id on conflict (id) do nothing;
insert into fmp.share_comments (id, workspace_id, share_link_id, funnel_id, node_id, author_name, body, resolved, created_at)
  select mc.new_id, :'org', ms.new_id, mf.new_id, c.node_id, c.author_name, c.body, c.resolved, c.created_at from fmp_src.share_comments c join fmp.id_map mc on mc.kind = 'comment' and mc.old_id = c.id join fmp.id_map ms on ms.kind = 'share_link' and ms.old_id = c.share_link_id join fmp.id_map mf on mf.kind = 'funnel' and mf.old_id = c.funnel_id on conflict (id) do nothing;
insert into fmp.templates (id, workspace_id, builtin_key, name, category, description, graph, settings)
  select mt.new_id, mt.workspace_id, t.builtin_key, t.name, t.category, t.description, t.graph, t.settings from fmp_src.templates t join fmp.id_map mt on mt.kind = 'template' and mt.old_id = t.id on conflict (id) do nothing;
