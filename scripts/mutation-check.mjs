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
};
let ok = true;
for (const [name, sql] of Object.entries(mutations)) {
  const fails = ['test/isolation.test.mjs', 'test/audit.test.mjs', 'test/authz.test.mjs', 'test/switch.test.mjs'].map(f => {
    const r = spawnSync(process.execPath, [f], { env: { ...process.env, MUTATION_SQL: sql }, encoding: 'utf8' });
    return { n: (r.stdout.match(/^FAIL/gm) || []).length, status: r.status };
  });
  const caught = fails.some(f => f.status !== 0 && f.n > 0);
  ok &&= caught;
  console.log(`${caught ? 'CAUGHT ' : 'MISSED '} ${name}  (failing checks: isolation ${fails[0].n}, audit ${fails[1].n}, authz ${fails[2].n}, switch ${fails[3].n})`);
}
process.exit(ok ? 0 : 1);
