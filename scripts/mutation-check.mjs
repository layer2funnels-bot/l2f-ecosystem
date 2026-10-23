// Negative control: re-introduce each audited defect and require the test suites to FAIL.
// A suite that still passes against a broken policy would prove nothing.
import { spawn } from 'node:child_process';
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
  'F7 pre-approved requests allowed': `drop trigger approvals_insert_guard on approvals; drop policy appr_insert on approvals; create policy appr_insert on approvals for insert with check (private.has_permission(workspace_id,'approvals.request.create'));`,
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
  'PJ guard removed: the client of a task comes from the caller': `drop trigger project_tasks_guard on project_tasks;`,
  'PJ client contact can read time entries': `create policy time_entries_leak on time_entries for select using (private.client_of(workspace_id, client_id));`,
  'PJ everyone with the app sees all time': `create policy time_entries_all on time_entries for select using (private.can_use_app(workspace_id, 'projects'));`,
  'PJ timer start time trusted from the caller': `drop trigger time_entries_guard on time_entries;`,
  'PJ archive-before-delete removed on tasks': `drop trigger project_tasks_refuse_delete on project_tasks;`,
  'PJ organization scope removed on tasks': `drop policy org_scope on project_tasks;`,
  'DR admins can read personal spaces': `create policy files_leak on files for select using (space = 'personal' and private.has_permission(workspace_id, 'drive.file.delete_any'));`,
  'DR everyone with Drive reads client files': `create policy files_leak2 on files for select using (private.has_permission(workspace_id, 'drive.file.view'));`,
  'DR protected SOPs editable by anyone who may edit': `create or replace function private.can_write_file(ws uuid, p_space text, p_client uuid, p_owner uuid, p_uploaded_by uuid, p_protected boolean) returns boolean language sql stable security definer set search_path='' as $$ select private.has_permission(ws, 'drive.file.edit') $$;`,
  'DR break-glass leaves no log and no notice': `create or replace function public.drive_break_glass_open(p_owner uuid, p_reason text) returns table (id uuid, name text, kind text, folder_id uuid, mime_type text, size_bytes bigint, current_version int, updated_at timestamptz, archived_at timestamptz, storage_path text, body text) language sql security definer set search_path='' as $$ select f.id, f.name, f.kind, f.folder_id, f.mime_type, f.size_bytes, f.current_version, f.updated_at, f.archived_at, null::text, null::text from public.files f where f.space = 'personal' and f.owner_id = p_owner and private.has_permission(f.workspace_id, 'drive.personal.break_glass') $$;`,
  'DR share links can last forever': `alter table drive_share_links drop constraint drive_share_links_check;`,
  'DR versions can be rewritten': `grant update, delete on public.file_versions to app_user;`,
  'DR storage path and space rules removed': `drop trigger files_guard on files;`,
  'DR trash step removed on files': `drop trigger files_refuse_delete on files;`,
  'PL measure client taken from the caller': `drop trigger planner_measures_guard on planner_measures;`,
  'PL recorded value time trusted from the caller': `drop trigger planner_values_guard on planner_measure_values;`,
  'PL history can be edited and removed': `grant update, delete on public.planner_measure_values to app_user;`,
  'PL objectives readable by anyone with the app': `create policy planner_objectives_all on planner_objectives for select using (private.can_use_app(workspace_id, 'planner'));`,
  'PL tasks linkable without seeing them': `drop policy planner_links_insert on planner_objective_tasks; create policy planner_links_insert on planner_objective_tasks for insert with check (private.has_permission(workspace_id, 'planner.objective.edit'));`,
  'PL organization scope removed on objectives': `drop policy org_scope on planner_objectives;`,
  'PL review client taken from the caller': `drop trigger planner_reviews_guard on planner_reviews;`,
  'PL objective with work can be deleted': `drop trigger planner_objectives_in_use on planner_objectives;`,
  'AP approval events can be edited': `grant update, delete on public.approval_events to app_user;`,
  'AP request guard removed (duplicates, versions, client copy)': `drop trigger approvals_insert_guard on public.approvals;`,
  'AP decided approvals can be decided again': `drop trigger approvals_decide on public.approvals;`,
  'AP scoped restriction ignored on approvals': `drop policy appr_select on public.approvals; create policy appr_select on public.approvals for select using (private.has_permission(workspace_id, 'approvals.request.view'));`,
  'PT portal message guard removed (any subject, spoofed client and author)': `drop trigger portal_messages_guard on public.portal_messages;`,
  'PT a client contact may change any field of a shared request': `drop trigger client_requests_contact_guard on public.client_requests;`,
  'PT a client sees approvals staff did not share': `drop policy appr_client_select on public.approvals; create policy appr_client_select on public.approvals for select using (private.client_of(workspace_id, client_id));`,
  'PT staff may message clients without the Portal permission': `drop policy portal_messages_insert on public.portal_messages; create policy portal_messages_insert on public.portal_messages for insert with check (true);`,
  'FM submissions are not checked against the form version': `drop trigger form_submissions_guard on public.form_submissions;`,
  'FM form versions can be rewritten': `grant update, delete on public.form_versions to app_user; drop trigger form_versions_guard on public.form_versions;`,
  'FM answers readable by everyone with the form': `drop policy form_submissions_select on public.form_submissions; create policy form_submissions_select on public.form_submissions for select using (private.has_permission(workspace_id, 'forms.form.view', client_id));`,
  'FM organization scope removed on submissions': `drop policy org_scope on public.form_submissions;`,
  'VL rung guard removed (another client\'s offer, positions, client copy)': `drop trigger value_rungs_guard on public.value_ladder_rungs;`,
  'VL organization scope removed on rungs': `drop policy org_scope on public.value_ladder_rungs;`,
  'SP post guard removed (review and approval set by hand, content edits while locked)': `drop trigger social_posts_guard on public.social_posts;`,
  'SP approvals no longer drive the post': `drop trigger social_post_follow_approval on public.approvals;`,
  'SP media guard removed (another client\'s files)': `drop trigger social_post_files_guard on public.social_post_files;`,
  'FC project policy removed (a document is readable through a project the person cannot open)': `drop policy files_project_context on public.files;`,
  'FC context guard removed (a client project can hold a shared-Drive document)': `drop trigger files_context_guard on public.files;`,
  'LB library guard removed (app-owned files list in Drive, client files can join the library)': `drop trigger files_library_guard on public.files;`,
  'LB library rule removed in both places (a client file may be a library file)': `alter table public.files drop constraint files_library_shape; create or replace function private.files_library_guard() returns trigger language plpgsql security definer set search_path='' as $$ begin if tg_op = 'INSERT' and new.in_library is null then new.in_library := (new.space = 'shared' and new.managed_by is null); end if; return new; end $$;`,
  'LB every file is a library file (the flag is ignored)': `create or replace function private.files_library_guard() returns trigger language plpgsql security definer set search_path='' as $$ begin new.in_library := (new.space = 'shared'); return new; end $$;`,
  'LB organization scope removed on files (a person in two organizations sees both Drives at once)': `drop policy org_scope on public.files;`,
  'TM team directory shows e-mail addresses to everyone': `create or replace function public.team_list() returns table (user_id uuid, display_name text, email text, role text, is_you boolean) language sql stable security definer set search_path='' as $$ select m.user_id, coalesce(p.display_name, 'Member'), p.email, m.role, m.user_id = private.current_user_id() from public.memberships m left join public.profiles p on p.id = m.user_id where m.workspace_id = private.request_org()::uuid and m.kind = 'staff' and m.status = 'active' and private.is_staff(m.workspace_id) $$;`,
  'TM team directory ignores the organization (both teams at once)': `create or replace function public.team_list() returns table (user_id uuid, display_name text, email text, role text, is_you boolean) language sql stable security definer set search_path='' as $$ select m.user_id, coalesce(p.display_name, 'Member'), null::text, m.role, m.user_id = private.current_user_id() from public.memberships m left join public.profiles p on p.id = m.user_id where m.kind = 'staff' and m.status = 'active' $$;`,
  'TM access history readable by every member': `drop policy audit_select on public.audit_events; create policy audit_select on public.audit_events for select using (true);`,
  'SC storage cap removed (any number of bytes can be registered)': `drop trigger file_versions_cap on public.file_versions;`,
  'SC usage counter shown to every member of the organization': `create or replace function public.storage_usage() returns table (total_bytes bigint, cap_bytes bigint, org_bytes bigint, files int, versions int, by_space jsonb) language sql stable security definer set search_path='' as $$ select private.storage_used_bytes(), 1::bigint, 0::bigint, 0, 0, '{}'::jsonb where private.request_org() is not null $$;`,
  'AU audience gate treats every caller as staff': `create or replace function public.my_audience(p_org uuid) returns text language sql stable security definer set search_path='' as $$ select 'staff'::text $$;`,
  'SH last-owner guard removed': `drop trigger memberships_last_owner on public.memberships;`,
  'SH member admin skips the owner and role checks': `create or replace function private.member_target(p_user uuid, p_new_role text) returns uuid language plpgsql stable security definer set search_path='' as $$ begin return private.request_org()::uuid; end $$;`,
  'SH invitation preview ignores whose e-mail it was sent to': `create or replace function public.invitation_preview(p_token text) returns table (org_name text, org_slug text, kind text, role text, inviter_name text, email text) language sql stable security definer set search_path='' as $$ select w.name, w.slug, i.kind, i.role, 'x', i.email from public.invitations i join public.workspaces w on w.id = i.workspace_id where i.token_hash = encode(sha256(convert_to(coalesce(p_token,''),'UTF8')),'hex') $$; grant execute on function public.invitation_preview(text) to app_user;`,
};
const SUITES = ['isolation', 'drive-context', 'drive-library', 'audit', 'authz', 'switch', 'api', 'funnels', 'funnels-api', 'clients', 'direct-access', 'permissions-scope', 'shell-admin', 'projects', 'drive', 'planner', 'audience', 'approvals', 'portal', 'forms', 'ladder', 'social', 'storage-cap', 'office-team'];
// A mutation is caught as soon as one suite fails, so each mutation tries the suite most likely to catch it first (by its name prefix) and
// stops at the first failure; several mutations run at once. A mutation nobody catches still runs every suite.
const FIRST = { PJ: 'projects', DR: 'drive', PL: 'planner', AU: 'audience', AP: 'approvals', PT: 'portal', FM: 'forms', VL: 'ladder', SP: 'social', SC: 'storage-cap', TM: 'office-team', FC: 'drive-context', LB: 'drive-library', CL: 'clients', FN: 'funnels', DA: 'direct-access', PS: 'permissions-scope', SH: 'shell-admin', SW: 'switch', AZ: 'authz' };
const run = (suite, sql) => new Promise((done) => {
  const p = spawn(process.execPath, [`test/${suite}.test.mjs`], { env: { ...process.env, MUTATION_SQL: sql } });
  let out = ''; p.stdout.on('data', (d) => { out += d; }); p.on('close', (status) => done({ n: (out.match(/^FAIL/gm) || []).length, status }));
});
async function check(name, sql) {
  const first = FIRST[name.split(' ')[0]];
  const order = first ? [first, ...SUITES.filter((s) => s !== first)] : SUITES;
  for (const s of order) { const r = await run(s, sql); if (r.status !== 0 && r.n > 0) return { name, caught: true, by: s, n: r.n }; }
  return { name, caught: false };
}
const queue = Object.entries(mutations); const done = []; let ok = true;
await Promise.all(Array.from({ length: Number(process.env.MUTATION_JOBS || 3) }, async () => {
  while (queue.length) {
    const [name, sql] = queue.shift(); const r = await check(name, sql);
    ok &&= r.caught; done.push(r);
    console.log(`${r.caught ? 'CAUGHT ' : 'MISSED '} ${name}${r.caught ? `  (by ${r.by}: ${r.n} failing check${r.n > 1 ? 's' : ''})` : '  (no suite failed)'}`);
  }
}));
console.log(`\n${done.filter((d) => d.caught).length}/${done.length} mutations caught`);
process.exit(ok ? 0 : 1);
