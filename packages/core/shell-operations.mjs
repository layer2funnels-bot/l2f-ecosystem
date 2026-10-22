// API operations behind the approved shell, auth and Admin designs (migration 0012). Same conventions as the other operation files:
// column names are constants, permissions are decided in the database, a refusal reads as "not found".
import { defineOperation } from './define.mjs';

const ROLES = ['owner', 'admin', 'editor', 'viewer'];
const id = { id: { type: 'uuid', required: true } };
const reasonText = { type: 'text', max: 200 };

export const shellOperations = [
  // ---- launcher, profile, invitations (people who may not have an organization yet use the nil organization)
  defineOperation({ name: 'launcher.catalog', class: 'read', audience: 'any', run: (q) => q('select app_key, name, scope, lifecycle, sort_order, launch_url, state, other_org from launcher_catalog()') }),
  defineOperation({ name: 'profile.touch', class: 'write', allowNoOrg: true, input: { name: { type: 'text', max: 120 } }, run: (q, _c, i) => q('select profile_touch($1)', [i.name ?? null]) }),
  defineOperation({ name: 'invitation.preview', class: 'sensitive', allowNoOrg: true, single: true, input: { token: { type: 'text', required: true, max: 200 } }, run: (q, _c, i) => q('select org_name, org_slug, kind, role, inviter_name, email from invitation_preview($1)', [i.token]) }),
  defineOperation({
    name: 'invitation.decline', class: 'sensitive', allowNoOrg: true, single: true, input: { token: { type: 'text', required: true, max: 200 } },
    run: async (q, _c, i) => ((await q('select invitation_decline($1) as ok', [i.token]))[0].ok ? [{ ok: true }] : []),
  }),

  // ---- Admin → Members
  defineOperation({ name: 'members.list', class: 'read', run: (q) => q('select row_kind, user_id, invitation_id, display_name, email, role, status, since, is_you from members_list()') }),
  defineOperation({ name: 'members.setRole', class: 'write', single: true, input: { user: { type: 'uuid', required: true }, role: { type: 'enum', values: ROLES, required: true } }, run: (q, _c, i) => q('select member_set_role($1, $2) as done', [i.user, i.role]) }),
  defineOperation({ name: 'members.setStatus', class: 'write', single: true, input: { user: { type: 'uuid', required: true }, status: { type: 'enum', values: ['active', 'deactivated'], required: true } }, run: (q, _c, i) => q('select member_set_status($1, $2) as done', [i.user, i.status]) }),
  defineOperation({ name: 'members.remove', class: 'write', single: true, input: { user: { type: 'uuid', required: true } }, run: (q, _c, i) => q('select member_remove($1) as done', [i.user]) }),
  defineOperation({ name: 'invitations.cancel', class: 'write', single: true, input: id, run: (q, _c, i) => q('select invitation_cancel($1) as done', [i.id]) }),

  // ---- Admin → Access
  // Roles matrix: derived from the permission catalog (the real rules), never a hand-written table.
  defineOperation({ name: 'access.roles', class: 'read', run: (q) => q('select key, app_key, description, floor_role, default_role, scopes, sensitive from permissions order by app_key, key') }),
  defineOperation({
    name: 'access.levels.list', class: 'read', input: { retired: { type: 'bool' } },
    run: (q, _c, i) => q(`select l.id, l.app_key, l.name, l.description, l.is_template, l.retired_at,
        coalesce(array_agg(alp.permission_key order by alp.permission_key) filter (where alp.effect = 'allow'), '{}') as permissions
      from access_levels l left join access_level_permissions alp on alp.access_level_id = l.id
      where ($1 or l.retired_at is null) group by l.id order by l.app_key, l.name`, [i.retired ?? false]),
  }),
  defineOperation({
    name: 'access.levels.create', class: 'write', single: true,
    input: { app: { type: 'text', required: true, max: 40 }, name: { type: 'text', required: true, max: 80 }, description: { type: 'text', min: 0, max: 300 }, permissions: { type: 'list', items: 'text', max: 100, itemMax: 80 } },
    run: async (q, ctx, i) => {
      const [l] = await q('insert into access_levels (workspace_id, app_key, name, description) values ($1,$2,$3,$4) returning id', [ctx.orgId, i.app, i.name, i.description ?? null]);
      if (i.permissions?.length) await q('insert into access_level_permissions (workspace_id, access_level_id, permission_key) select $1, $2, unnest($3::text[])', [ctx.orgId, l.id, i.permissions]);
      return q('select id, app_key, name, description from access_levels where id = $1', [l.id]);
    },
  }),
  defineOperation({
    name: 'access.levels.update', class: 'write', single: true,
    input: { ...id, name: { type: 'text', max: 80 }, description: { type: 'text', min: 0, max: 300 }, permissions: { type: 'list', items: 'text', max: 100, itemMax: 80 } },
    run: async (q, ctx, i) => {
      const [l] = await q('update access_levels set name = coalesce($2, name), description = coalesce($3, description) where id = $1 and retired_at is null returning id', [i.id, i.name ?? null, i.description ?? null]);
      if (!l) return [];
      if (i.permissions) {
        await q('delete from access_level_permissions where access_level_id = $1', [i.id]);
        if (i.permissions.length) await q('insert into access_level_permissions (workspace_id, access_level_id, permission_key) select $1, $2, unnest($3::text[])', [ctx.orgId, i.id, i.permissions]);
      }
      return q('select id, app_key, name, description from access_levels where id = $1', [i.id]);
    },
  }),
  defineOperation({ name: 'access.levels.retire', class: 'write', single: true, input: id, run: (q, _c, i) => q('update access_levels set retired_at = now() where id = $1 and retired_at is null returning id', [i.id]) }),

  defineOperation({
    name: 'access.assignments.list', class: 'read',
    run: (q) => q(`select a.id, a.principal_type, a.principal_id, coalesce(p.display_name, p.email) as person, l.id as level_id, l.name as level, l.app_key,
        a.client_id, c.name as client_name, a.project_id, a.expires_at, a.reason
      from access_assignments a join access_levels l on l.id = a.access_level_id
      left join profiles p on a.principal_type = 'user' and p.id = a.principal_id left join clients c on c.id = a.client_id
      order by person nulls last, l.app_key, l.name`),
  }),
  defineOperation({
    name: 'access.assignments.create', class: 'write', single: true,
    input: { user: { type: 'uuid', required: true }, level: { type: 'uuid', required: true }, client: { type: 'uuid' }, project: { type: 'uuid' }, expires_at: { type: 'date' }, reason: reasonText },
    run: (q, ctx, i) => q(`insert into access_assignments (workspace_id, access_level_id, principal_type, principal_id, client_id, project_id, granted_by, expires_at, reason)
        values ($1, $2, 'user', $3, $4, $5, $6, $7::date, $8) returning id`, [ctx.orgId, i.level, i.user, i.client ?? null, i.project ?? null, ctx.userId, i.expires_at ?? null, i.reason ?? null]),
  }),
  defineOperation({ name: 'access.assignments.delete', class: 'write', single: true, input: id, run: (q, _c, i) => q('delete from access_assignments where id = $1 returning id', [i.id]) }),

  // "Deny instead" (design 05): one override per permission of the chosen level, grouped by a reason prefix so it reads as one denial.
  defineOperation({
    name: 'access.denials.list', class: 'read',
    run: (q) => q(`select o.principal_id as user_id, coalesce(p.display_name, p.email) as person, l.id as level_id, l.name as level, l.app_key, o.client_id, c.name as client_name,
        min(o.expires_at) as expires_at, min(regexp_replace(o.reason, '^deny-level:[0-9a-f-]{36}:', '')) as reason, count(*)::int as permissions
      from permission_overrides o
      join access_levels l on l.id = substring(o.reason from '^deny-level:([0-9a-f-]{36}):')::uuid
      left join profiles p on p.id = o.principal_id left join clients c on c.id = o.client_id
      where o.effect = 'deny' and o.reason like 'deny-level:%' and o.principal_type = 'user'
      group by o.principal_id, p.display_name, p.email, l.id, l.name, l.app_key, o.client_id, c.name order by person, level`),
  }),
  defineOperation({
    name: 'access.denials.create', class: 'write', single: true,
    input: { user: { type: 'uuid', required: true }, level: { type: 'uuid', required: true }, client: { type: 'uuid' }, reason: { type: 'text', required: true, max: 200 }, expires_at: { type: 'date' } },
    run: (q, ctx, i) => q(`insert into permission_overrides (workspace_id, principal_type, principal_id, permission_key, effect, client_id, granted_by, reason, expires_at)
        select $1, 'user', $2, alp.permission_key, 'deny', $3, $4, 'deny-level:' || ($5::uuid)::text || ':' || $6, $7::date from access_level_permissions alp
         where alp.access_level_id = $5::uuid and alp.effect = 'allow' returning permission_key`, [ctx.orgId, i.user, i.client ?? null, ctx.userId, i.level, i.reason, i.expires_at ?? null]),
  }),
  defineOperation({
    name: 'access.denials.delete', class: 'write', single: true, input: { user: { type: 'uuid', required: true }, level: { type: 'uuid', required: true }, client: { type: 'uuid' } },
    run: (q, _c, i) => q(`delete from permission_overrides where principal_type = 'user' and principal_id = $1 and reason like 'deny-level:' || $2::text || ':%'
        and client_id is not distinct from $3 returning permission_key`, [i.user, i.level, i.client ?? null]),
  }),
];
