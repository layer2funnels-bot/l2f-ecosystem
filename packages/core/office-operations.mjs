// Office V8 (P01) operations: the default strategy template (versioned) and Documents sections. Row rules decide (migration 0056):
// template read = funnels.strategy.view, save = funnels.strategy.edit; sections visible to staff ('everyone') or owners/admins
// ('admins'), managed by owners/admins; each section is a folder in the shared Drive (Drive's own folder rules apply).
import { defineOperation } from './define.mjs';

// V8's starting template (prototype office6.js STPL) — used until the organization saves its first version
export const DEFAULT_TEMPLATE = [
  ['Funnel overview', 'Name, purpose and business goal.'], ['Target audience', 'Customer avatar, problems, motivations and objections.'],
  ['Offer and value', 'What you sell and why it matters.'], ['Customer journey', 'From first touch to conversion.'],
  ['Messaging direction', 'Core message, proof and calls to action.'], ['Success criteria', 'How you’ll know it worked.'],
].map(([heading, help]) => ({ heading, help }));
// V8's starting sections (prototype DOCSEC); "Approved SOPs" lists Drive's protected SOPs
export const DEFAULT_SECTIONS = [['Approved SOPs', 'everyone', true], ['Policies', 'everyone', false], ['Templates', 'everyone', false]];

const section = { name: { type: 'text', required: true, min: 1, max: 80 }, visibility: { type: 'enum', values: ['everyone', 'admins'] }, owner_protected: { type: 'bool' } };

// the section's Drive folder: an existing top-level shared folder with that name is reused (folder names are unique per place)
const folderFor = async (q, ctx, name) => (await q(`select id from drive_folders where workspace_id = $1 and space = 'shared' and client_id is null and parent_id is null and lower(name) = lower($2) and archived_at is null limit 1`, [ctx.orgId, name]))[0]
  ?? (await q("insert into drive_folders (workspace_id, space, name, created_by) values ($1, 'shared', $2, $3) returning id", [ctx.orgId, name, ctx.userId]))[0];

export const officeOperations = [
  defineOperation({
    name: 'office.template.get', class: 'read', single: true,
    run: async (q, ctx) => {
      const [t] = await q('select version, sections, created_at from strategy_templates where workspace_id = $1 order by version desc limit 1', [ctx.orgId]);
      return [t ?? { version: 0, sections: DEFAULT_TEMPLATE, created_at: null }];
    },
  }),
  defineOperation({
    name: 'office.template.versions', class: 'read',
    run: (q, ctx) => q(`select t.version, t.created_at, coalesce(nullif(p.display_name, ''), 'Someone') as by_name from strategy_templates t left join profiles p on p.id = t.created_by
      where t.workspace_id = $1 order by t.version desc limit 50`, [ctx.orgId]),
  }),
  defineOperation({
    name: 'office.template.save', class: 'write', single: true, input: { sections: { type: 'json', required: true, max: 30000 } },
    run: async (q, ctx, i) => {
      const list = Array.isArray(i.sections) ? i.sections : [];
      const clean = list.map((s) => ({ heading: String(s?.heading ?? '').trim().slice(0, 120), help: String(s?.help ?? '').trim().slice(0, 300) })).filter((s) => s.heading);
      if (!clean.length || clean.length > 40) throw { code: '22023', message: 'a template needs 1 to 40 sections with a heading' };
      return q(`insert into strategy_templates (workspace_id, version, sections, created_by)
        values ($1, coalesce((select max(version) from strategy_templates where workspace_id = $1), 0) + 1, $2, $3) returning version, sections, created_at`, [ctx.orgId, JSON.stringify(clean), ctx.userId]);
    },
  }),
  defineOperation({
    name: 'office.sections.list', class: 'read',
    run: async (q, ctx) => {
      let rows = await q('select id, name, visibility, owner_protected, folder_id, position from doc_sections where workspace_id = $1 order by position, created_at', [ctx.orgId]);
      // first visit by an owner/admin: create V8's three starting sections (staff who cannot manage simply see none yet)
      if (!rows.length) {
        const [{ admin } = {}] = await q("select private.has_role($1, 'admin') as admin", [ctx.orgId]);
        if (admin) {
          for (const [n, [name, vis, prot]] of DEFAULT_SECTIONS.entries()) {
            const f = await folderFor(q, ctx, name);
            await q('insert into doc_sections (workspace_id, name, visibility, owner_protected, folder_id, position, created_by) values ($1, $2, $3, $4, $5, $6, $7)', [ctx.orgId, name, vis, prot, f.id, n, ctx.userId]);
          }
          rows = await q('select id, name, visibility, owner_protected, folder_id, position from doc_sections where workspace_id = $1 order by position, created_at', [ctx.orgId]);
        }
      }
      return rows;
    },
  }),
  defineOperation({
    name: 'office.sections.create', class: 'write', single: true, input: section,
    run: async (q, ctx, i) => {
      const f = await folderFor(q, ctx, i.name.trim());
      return q(`insert into doc_sections (workspace_id, name, visibility, owner_protected, folder_id, position, created_by)
        values ($1, $2, $3, $4, $5, coalesce((select max(position) + 1 from doc_sections where workspace_id = $1), 0), $6) returning id, name, visibility, owner_protected, folder_id, position`,
      [ctx.orgId, i.name.trim(), i.visibility ?? 'everyone', i.owner_protected ?? false, f.id, ctx.userId]);
    },
  }),
  defineOperation({
    name: 'office.sections.update', class: 'write', single: true, input: { id: { type: 'uuid', required: true }, ...Object.fromEntries(Object.entries(section).map(([k, f]) => [k, { ...f, required: false }])), position: { type: 'int', min: 0, max: 1000 } },
    run: async (q, _c, i) => {
      const r = await q(`update doc_sections set name = coalesce($2, name), visibility = coalesce($3, visibility), owner_protected = coalesce($4, owner_protected), position = coalesce($5, position), updated_at = now()
        where id = $1 returning id, name, visibility, owner_protected, folder_id, position`, [i.id, i.name?.trim() ?? null, i.visibility ?? null, i.owner_protected ?? null, i.position ?? null]);
      if (r.length && i.name && r[0].folder_id) await q('update drive_folders set name = $2 where id = $1', [r[0].folder_id, i.name.trim()]);
      return r;
    },
  }),
  // deleting a section removes it from Documents; its folder and files stay in Drive (nothing is lost)
  defineOperation({ name: 'office.sections.delete', class: 'write', single: true, input: { id: { type: 'uuid', required: true } }, run: (q, _c, i) => q('delete from doc_sections where id = $1 returning id', [i.id]) }),
  // ---- Team (V8 office5 `team` / `member`): what each person is working on, as far as the VIEWER may see (pm row rules; a private project never shows)
  defineOperation({
    name: 'office.team.now', class: 'read',
    run: (q, ctx) => q(`select distinct on (x.user_id) x.user_id, x.task_id, x.title, x.project_id, x.running, x.started_at from (
        select te.user_id, t.id task_id, t.title, t.project_id, true running, te.started_at, 0 pri from pm_time_entries te join pm_tasks t on t.id = te.task_id
          where te.workspace_id = $1 and te.ended_at is null and t.deleted_at is null
        union all
        select a.user_id, t.id, t.title, t.project_id, false, t.updated_at, 1 from pm_task_assignees a join pm_tasks t on t.id = a.task_id
          where t.workspace_id = $1 and t.status = 'in_progress' and t.deleted_at is null) x
      order by x.user_id, x.pri, x.started_at desc nulls last`, [ctx.orgId]),
  }),
  defineOperation({
    name: 'office.member.get', class: 'read', single: true, input: { user: { type: 'uuid', required: true } },
    run: async (q, ctx, i) => {
      const [m] = await q('select user_id, display_name, email, role, is_you, has_photo from team_list() where user_id = $1', [i.user]);
      if (!m) return [];
      const [tasks, week, projects] = await Promise.all([
        q(`select t.id, t.title, t.due_on, t.status, t.project_id, p.name project_name from pm_task_assignees a join pm_tasks t on t.id = a.task_id join pm_projects p on p.id = t.project_id
           where a.user_id = $2 and t.workspace_id = $1 and t.status <> 'done' and t.deleted_at is null and p.deleted_at is null and p.archived_at is null
           order by t.due_on nulls last, t.updated_at desc limit 20`, [ctx.orgId, i.user]),
        q(`select coalesce((select sum(t.estimate_minutes) from pm_task_assignees a join pm_tasks t on t.id = a.task_id where a.user_id = $2 and t.workspace_id = $1 and t.deleted_at is null
             and t.due_on between date_trunc('week', now())::date and (date_trunc('week', now()) + interval '6 days')::date), 0)::int planned_minutes,
           coalesce((select sum(extract(epoch from (coalesce(te.ended_at, now()) - te.started_at)) / 60) from pm_time_entries te where te.user_id = $2 and te.workspace_id = $1
             and te.started_at >= date_trunc('week', now())), 0)::int logged_minutes`, [ctx.orgId, i.user]),
        q(`select p.id, p.name, p.color from pm_project_members pm join pm_projects p on p.id = pm.project_id where pm.user_id = $2 and p.workspace_id = $1 and p.deleted_at is null
           and p.archived_at is null and not p.is_template order by p.name limit 20`, [ctx.orgId, i.user])]);
      const [now] = (await q(`select t.id task_id, t.title, t.project_id, p.name project_name, te.started_at from pm_time_entries te join pm_tasks t on t.id = te.task_id join pm_projects p on p.id = t.project_id
        where te.user_id = $2 and te.workspace_id = $1 and te.ended_at is null and t.deleted_at is null order by te.started_at desc limit 1`, [ctx.orgId, i.user]));
      return [{ ...m, now: now ?? null, tasks, week: week[0], projects }];
    },
  }),
  // ---- Customer Avatar Studio: saved versions (0057). Saving snapshots the avatar as it is now and moves it to the next version number.
  defineOperation({
    name: 'office.avatar.versions', class: 'read', input: { avatar: { type: 'uuid', required: true } },
    run: (q, _c, i) => q(`select v.id, v.version, v.note, v.created_at, coalesce(nullif(p.display_name, ''), 'Someone') as by_name, v.snapshot from avatar_versions v left join profiles p on p.id = v.created_by
      where v.avatar_id = $1 order by v.created_at desc limit 50`, [i.avatar]),
  }),
  defineOperation({
    name: 'office.avatar.versions.save', class: 'write', single: true, input: { avatar: { type: 'uuid', required: true }, note: { type: 'text', max: 300 }, major: { type: 'bool' } },
    run: async (q, ctx, i) => {
      const [a] = await q('select id, workspace_id, client_id, name, tagline, role, market, look, stage, version, profile, summary, pains, desires, objections from funnel_avatars where id = $1 and archived_at is null', [i.avatar]);
      if (!a) return [];
      await q('insert into avatar_versions (workspace_id, avatar_id, client_id, version, note, snapshot, created_by) values ($1, $2, $3, $4, $5, $6, $7)',
        [a.workspace_id, a.id, a.client_id, a.version, i.note ?? '', JSON.stringify(a), ctx.userId]);
      const m = /^v?(\d+)(?:\.(\d+))?/.exec(a.version) ?? [null, '1', '0'];
      const next = i.major ? `v${Number(m[1]) + 1}.0` : `v${m[1]}.${Number(m[2] ?? 0) + 1}`;
      return q('update funnel_avatars set version = $2 where id = $1 returning id, version', [a.id, next]);
    },
  }),
  // ---- Admin & Access V8 (0058): the database functions decide (owners/admins; never yourself or an owner; branding owners only)
  defineOperation({ name: 'access.app.touch', class: 'write', input: { app: { type: 'text', required: true, max: 40 } }, run: (q, _c, i) => q('select public.app_touch($1) as ok', [i.app]) }),
  defineOperation({ name: 'access.apps.counts', class: 'read',
    run: (q, ctx) => q(`select g.user_id, count(*)::int apps, max(u.last_used_at) last_used_at from app_grants g left join app_usage u on u.workspace_id = g.workspace_id and u.user_id = g.user_id
      where g.workspace_id = $1 group by g.user_id`, [ctx.orgId]) }),
  defineOperation({ name: 'access.apps.of', class: 'read', input: { user: { type: 'uuid', required: true } },
    run: (q, ctx, i) => q('select app_key from app_grants where workspace_id = $1 and user_id = $2 order by app_key', [ctx.orgId, i.user]) }),
  defineOperation({ name: 'access.app.set', class: 'write', single: true, input: { user: { type: 'uuid', required: true }, app: { type: 'text', required: true, max: 40 }, on: { type: 'bool', required: true } },
    run: (q, _c, i) => q('select public.access_app_set($1, $2, $3) as on', [i.user, i.app, i.on]) }),
  defineOperation({ name: 'access.features.of', class: 'read', input: { user: { type: 'uuid', required: true } }, run: (q, _c, i) => q('select permission_key, effect from public.access_feature_overrides($1)', [i.user]) }),
  defineOperation({ name: 'access.feature.set', class: 'write', single: true, input: { user: { type: 'uuid', required: true }, permission: { type: 'text', required: true, max: 80 }, effect: { type: 'enum', values: ['allow', 'deny', 'reset'], required: true } },
    run: (q, _c, i) => q('select public.access_feature_set($1, $2, $3) as effect', [i.user, i.permission, i.effect === 'reset' ? null : i.effect]) }),
  // Client Access Matrix: owners AND admins (clients.apps.manage) — row rules on both tables
  defineOperation({ name: 'clients.apps.matrix', class: 'read',
    run: async (q, ctx) => {
      const [defs, rows] = await Promise.all([q('select app_key from client_app_defaults where workspace_id = $1', [ctx.orgId]), q('select client_id, app_key, enabled from client_app_access where workspace_id = $1', [ctx.orgId])]);
      return [{ defaults: defs.map((d) => d.app_key), cells: rows }];
    } }),
  defineOperation({ name: 'clients.apps.set', class: 'write', single: true, input: { client: { type: 'uuid', required: true }, app: { type: 'text', required: true, max: 40 }, enabled: { type: 'bool', required: true } },
    run: (q, ctx, i) => q(`insert into client_app_access (workspace_id, client_id, app_key, enabled, changed_by) values ($1, $2, $3, $4, $5)
      on conflict (client_id, app_key) do update set enabled = excluded.enabled, changed_by = excluded.changed_by, changed_at = now() returning client_id, app_key, enabled`, [ctx.orgId, i.client, i.app, i.enabled, ctx.userId]) }),
  defineOperation({ name: 'clients.apps.defaults.set', class: 'write', input: { apps: { type: 'list', items: 'text', max: 30, itemMax: 40, required: true } },
    run: async (q, ctx, i) => {
      await q('delete from client_app_defaults where workspace_id = $1 and app_key <> all($2::text[])', [ctx.orgId, i.apps]);
      return q('insert into client_app_defaults (workspace_id, app_key) select $1, unnest($2::text[]) on conflict do nothing returning app_key', [ctx.orgId, i.apps]);
    } }),
  // branding: everyone on the team sees it; only owners change it
  defineOperation({ name: 'branding.get', class: 'read', single: true, run: (q) => q('select brand_icon, brand_wordmark, brand_wordmark_dark, brand_favicon from public.workspace_branding()') }),
  defineOperation({ name: 'branding.set', class: 'sensitive', single: true, input: { slot: { type: 'enum', values: ['icon', 'wordmark', 'wordmark_dark', 'favicon'], required: true }, data: { type: 'text', min: 0, max: 300000 } },
    run: (q, _c, i) => q('select public.workspace_branding_set($1, $2) as ok', [i.slot, i.data ?? '']) }),
  // ---- recovery (0060): Documents linked from Drive, organization name, Avatar Studio defaults
  defineOperation({ name: 'office.doclinks.list', class: 'read',   // only files the person can read come back (files' own row rules)
    run: (q, ctx) => q(`select l.id as link_id, l.section_id, l.created_by, f.id, f.name, f.kind, f.mime_type, f.folder_id, f.space, f.protected_sop, f.updated_at
      from doc_links l join files f on f.id = l.file_id where l.workspace_id = $1 and f.archived_at is null order by lower(f.name)`, [ctx.orgId]) }),
  defineOperation({ name: 'office.doclinks.add', class: 'write', single: true, input: { section: { type: 'uuid', required: true }, file: { type: 'uuid', required: true } },
    run: (q, ctx, i) => q(`insert into doc_links (workspace_id, section_id, file_id) values ($1, $2, $3) on conflict (section_id, file_id) do update set section_id = excluded.section_id
      returning id, section_id, file_id`, [ctx.orgId, i.section, i.file]) }),
  defineOperation({ name: 'office.doclinks.remove', class: 'write', single: true, input: { id: { type: 'uuid', required: true } }, run: (q, _c, i) => q('delete from doc_links where id = $1 returning id', [i.id]) }),
  defineOperation({ name: 'org.rename', class: 'write', single: true, input: { name: { type: 'text', required: true, min: 2, max: 80 } }, run: (q, _c, i) => q('select public.workspace_rename($1) as name', [i.name]) }),
  defineOperation({ name: 'org.icons', class: 'read', audience: 'any', run: (q) => q('select org_id, brand_icon from public.my_org_icons()') }),
  defineOperation({ name: 'launcher.order.set', class: 'write', single: true, input: { apps: { type: 'list', items: 'text', max: 60, itemMax: 40, required: true } }, run: (q, _c, i) => q('select public.launcher_order_set($1::text[]) as n', [i.apps]) }),
  defineOperation({ name: 'office.avatar.settings', class: 'read', run: (q, ctx) => q('select sections, updated_at from avatar_settings where workspace_id = $1', [ctx.orgId]) }),
  defineOperation({ name: 'office.avatar.settings.set', class: 'write', single: true, input: { sections: { type: 'json', required: true } },
    run: (q, ctx, i) => {
      const list = Array.isArray(i.sections) ? i.sections : null;
      if (!list || !list.length || list.length > 60) return [];
      const clean = list.map((d) => ({ type: /^[a-z]{2,20}$/.test(d?.type ?? '') ? d.type : 'custom', title: String(d?.title ?? '').trim().slice(0, 120) || 'Untitled section', profile: Boolean(d?.profile) }));
      return q(`insert into avatar_settings (workspace_id, sections, updated_by) values ($1, $2, $3)
        on conflict (workspace_id) do update set sections = excluded.sections, updated_by = excluded.updated_by, updated_at = now() returning sections, updated_at`, [ctx.orgId, JSON.stringify(clean), ctx.userId]);
    } }),
];
