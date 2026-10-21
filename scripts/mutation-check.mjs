// Negative control: re-introduce each audited defect and require the test suites to FAIL.
// A suite that still passes against a broken policy would prove nothing.
import { spawnSync } from 'node:child_process';
const mutations = {
  'F1 identity reads legacy claim only': `create or replace function private.current_user_id() returns uuid language sql stable set search_path='' as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;`,
  'F2 cross-workspace client link allowed': `alter table projects drop constraint projects_client_fk; alter table projects add foreign key (client_id) references clients(id);`,
  'F5 client sees internal items': `drop policy projects_select on projects; create policy projects_select on projects for select using (private.can_use_app(workspace_id,'projects') or private.client_of(workspace_id, client_id));`,
  'G2 portal switch ignored': `create or replace function private.client_of(ws uuid, cid uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists (select 1 from public.memberships m where m.workspace_id = ws and m.user_id = private.current_user_id() and m.kind='client' and m.status='active' and m.client_id = cid) $$;`,
  'F6 app grants ignored': `create or replace function private.can_use_app(ws uuid, app text) returns boolean language sql stable security definer set search_path='' as $$ select private.has_role(ws,'viewer') $$;`,
  'Workspace isolation broken': `drop policy clients_select on clients; create policy clients_select on clients for select using (true);`,
  'AZ deny no longer beats allow': `create or replace function private.has_permission(ws uuid, perm text, p_client uuid default null, p_project uuid default null) returns boolean language sql stable security definer set search_path='' as $$ select private.permission_decision(ws, private.current_user_id(), perm, p_client, p_project) like 'allow:%' or exists (select 1 from public.permission_overrides o where o.workspace_id = ws and o.principal_id = private.current_user_id() and o.permission_key = perm) $$;`,
  'AZ client scope ignored (one client grants all)': `drop policy clients_select on clients; create policy clients_select on clients for select using (private.can_use_app(workspace_id,'clients') and (private.has_permission(workspace_id,'clients.client.view') or exists (select 1 from access_assignments a where a.principal_id = private.current_user_id() and a.client_id is not null)));`,
  'SW org scope removed (old org leaks after switch)': `drop policy org_scope on clients;`,
  'SW switch skips membership check': `create or replace function public.resolve_org_switch(p_org uuid, p_app text, p_page text default null) returns table (outcome text, org_id uuid, org_name text, app_key text, page_key text, message text) language sql security definer set search_path = '' as $$ select 'same_page'::text, p_org, null::text, p_app, p_page, null::text $$;`,
  'F7 pre-approved requests allowed': `drop policy appr_insert on approvals; create policy appr_insert on approvals for insert with check (private.has_permission(workspace_id,'approvals.request.create'));`,
  'FN client sees internal funnel records': `drop policy funnel_avatars_select on funnel_avatars; create policy funnel_avatars_select on funnel_avatars for select using (private.has_permission(workspace_id,'funnels.avatar.view',client_id) or private.client_of(workspace_id, client_id));`,
  'FN archive-before-delete removed': `drop trigger funnel_avatars_refuse_delete on funnel_avatars;`,
  'FN sharing needs no permission': `drop trigger funnel_avatars_guard on funnel_avatars;`,
  'FN funnel request scope removed': `drop policy org_scope on funnel_offers;`,
  'FN cross-organization avatar link allowed': `alter table funnel_offers drop constraint funnel_offers_workspace_id_avatar_id_fkey; alter table funnel_offers add foreign key (avatar_id) references funnel_avatars(id);`,
  'CL team notes readable by the client': `create policy client_notes_leak on client_notes for select using (private.client_of(workspace_id, client_id));`,
  'CL internal profile readable by the client': `create policy client_profiles_leak on client_profiles for select using (private.client_of(workspace_id, client_id));`,
  'CL archive-before-delete removed on notes': `drop trigger client_notes_refuse_delete on client_notes;`,
  'CL sharing needs no permission (requests)': `drop trigger client_requests_guard on client_requests;`,
  'CL client request scope removed': `drop policy org_scope on client_profiles;`,
  'CL stage in use can be deleted': `drop trigger client_stages_in_use on client_stages;`,
  'DA signed-in role can read tables directly (API bypass)': `grant select on public.clients to authenticated;`,
  'DA signed-in role can write tables directly': `grant insert, update, delete on public.memberships to authenticated;`,
  'DA signed-in role can call our functions directly': `grant execute on function public.launcher_apps(uuid) to authenticated;`,
  'DA visitor role can read tables directly': `grant select on public.workspaces to anon;`,
  'DA private schema exposed to the signed-in role': `grant usage on schema private to authenticated;`,
  'PS permissions list ignores the decision (offers every client)': `create or replace function public.my_permissions() returns table (permission_key text, scope text, client_id uuid, project_id uuid) language sql stable security definer set search_path='' as $$ select p.key, 'client'::text, c.id, null::uuid from public.permissions p cross join public.clients c where 'client' = any (p.scopes) and private.is_staff(c.workspace_id) $$; grant execute on function public.my_permissions() to app_user;`,
  'PS permissions list shows hidden scope (organization-wide for everyone)': `create or replace function public.my_permissions() returns table (permission_key text, scope text, client_id uuid, project_id uuid) language sql stable security definer set search_path='' as $$ select p.key, 'workspace'::text, null::uuid, null::uuid from public.permissions p where private.is_staff(coalesce(nullif(private.request_org(),'')::uuid, '00000000-0000-0000-0000-000000000000')) $$; grant execute on function public.my_permissions() to app_user;`,
};
const SUITES = ['isolation', 'audit', 'authz', 'switch', 'api', 'funnels', 'funnels-api', 'clients', 'direct-access', 'permissions-scope'];
let ok = true;
for (const [name, sql] of Object.entries(mutations)) {
  const fails = SUITES.map((n) => `test/${n}.test.mjs`).map(f => {
    const r = spawnSync(process.execPath, [f], { env: { ...process.env, MUTATION_SQL: sql }, encoding: 'utf8' });
    return { n: (r.stdout.match(/^FAIL/gm) || []).length, status: r.status };
  });
  const caught = fails.some(f => f.status !== 0 && f.n > 0);
  ok &&= caught;
  console.log(`${caught ? 'CAUGHT ' : 'MISSED '} ${name}  (failing checks: ${SUITES.map((n, i) => `${n} ${fails[i].n}`).join(', ')})`);
}
process.exit(ok ? 0 : 1);
