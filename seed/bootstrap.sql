-- PREPARED, NOT RUN. Server-side bootstrap for a NEW Supabase project, run once by the owner in the SQL editor
-- after migrations 0001-0003. Replace :owner_id with the owner's auth user id (Authentication > Users)
-- after his first sign-in. Every later member joins by invitation (create_invitation / accept_invitation).
insert into workspaces (slug, name) values ('layer2funnels', 'Layer2Funnels'), ('aurj', 'Aurj');
insert into memberships (workspace_id, user_id, kind, role)
  select id, :'owner_id'::uuid, 'staff', 'owner' from workspaces where slug in ('layer2funnels', 'aurj');
-- Funnel Mapper Pro: Launcher entry in Layer2Funnels only. Set launch_url to its live https address.
insert into workspace_apps (workspace_id, app_key, enabled, launch_url)
  select id, 'funnel_mapper_pro', true, null from workspaces where slug = 'layer2funnels';
-- Client Portal stays OFF (default) until gate G2 passes.
