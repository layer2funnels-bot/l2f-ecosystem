-- Rollback of 0058 (Admin & Access V8). App grants and permission overrides set from the screen stay (they are ordinary access rows).
drop function if exists public.workspace_branding_set(text, text);
drop function if exists public.workspace_branding();
drop function if exists private.client_app_enabled(uuid, uuid, text);
drop function if exists public.access_review_keep(uuid, text);
drop function if exists public.access_review_list();
drop function if exists public.access_feature_overrides(uuid);
drop function if exists public.access_feature_set(uuid, text, text);
drop function if exists public.access_app_set(uuid, text, boolean);
drop function if exists private.can_manage_teammate(uuid, uuid);
drop function if exists public.app_touch(text);
drop table if exists public.client_app_access;
drop table if exists public.client_app_defaults;
drop table if exists public.app_usage;
alter table public.workspaces drop column if exists brand_icon, drop column if exists brand_wordmark, drop column if exists brand_wordmark_dark, drop column if exists brand_favicon;
delete from public.permissions p where p.key = 'clients.apps.manage' and not exists (select 1 from public.access_level_permissions x where x.permission_key = p.key)
  and not exists (select 1 from public.permission_overrides o where o.permission_key = p.key);
