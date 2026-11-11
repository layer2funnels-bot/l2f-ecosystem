// Session, people, clients, tags, notifications and view preferences. Sign-in is the ecosystem's own (no dev auth here).
import { asUser } from '../db.ts';
import { ApiError } from '../errors.ts';
import * as V from '../validate.ts';
import type { Client, Notification, Ops, OpName, Org, OrgMember, Person, Tag, ViewPrefs } from '../../shared/api.ts';
import { all, needRole, one, orgRole, person, personCols, personOrThrow, run, type Ctx, type Row } from './util.ts';

const MAX_PREFS_BYTES = 8 * 1024;

export const miscOps = {
  'session.me': async (ctx) => asUser(ctx, async (tx) => {
    const u = await one<Row>(tx, 'select id, name, email, color from pm_people where id = pm.uid()');
    if (!u) throw new ApiError('unauthenticated', 'Please sign in');
    const orgs = await all(tx, `select o.id, o.name, o.slug, m.role from public.workspaces o join pm_members m on m.workspace_id = o.id and m.user_id = pm.uid() order by o.name`);
    return { user: u as Person, orgs: orgs as Org[] };
  }),

  'people.list': async (ctx) => asUser(ctx, async (tx) => {
    if (!(await orgRole(tx))) throw new ApiError('forbidden', 'You are not a member of this organization');
    return (await all(tx, `select ${personCols('u', 'u')}, m.role from pm_members m join pm_people u on u.id = m.user_id
      where m.workspace_id = pm.org() order by lower(u.name), u.id`)).map((r): OrgMember => ({ ...personOrThrow(r, 'u'), role: r.role }));
  }),

  'clients.list': async (ctx) => asUser(ctx, async (tx) =>
    (await all(tx, 'select id, name from pm_clients where workspace_id = pm.org() order by lower(name), id')) as Client[]),

  'tags.list': async (ctx) => asUser(ctx, async (tx) =>
    (await all(tx, 'select id, name, color from pm_tags where workspace_id = pm.org() order by lower(name), id')) as Tag[]),

  'tags.create': async (ctx, args) => {
    const name = V.str(args.name, 'name', { min: 1, max: 40 });
    const color = args.color === undefined ? '#64748b' : V.color(args.color, 'color');
    return asUser(ctx, async (tx) => {
      const role = await orgRole(tx);
      if (!role || role === 'viewer') throw new ApiError('forbidden', 'You need editor access to create tags');
      if (await one(tx, 'select 1 x from pm_tags where workspace_id = pm.org() and lower(name) = lower($1)', [name])) {
        throw new ApiError('conflict', 'A tag with that name already exists', 'name');
      }
      const r = await one<Row>(tx, 'insert into pm_tags (workspace_id, name, color) values (pm.org(), $1, $2) returning id, name, color', [name, color]);
      return r as Tag;
    });
  },

  // The shared ecosystem bell (migration 0049): the same list the shell shows, Projects V2 tasks only here.
  'notifications.list': async (ctx) => asUser(ctx, async (tx) => {
    const rows = await all(tx, `select n.id, n.kind, n.entity_id, n.title, n.project_id, n.actor_id, n.actor_name, n.read_at, n.created_at
      from public.my_notifications(100) n where n.entity_type = 'pm_task'`);
    const verb: Record<string, string> = { assigned: 'assigned you', mentioned: 'mentioned you in', commented: 'commented on', completed: 'completed', due_changed: 'changed the due date of' };
    const items = rows.map((r): Notification => ({
      id: r.id, kind: r.kind, summary: `${r.actor_name} ${verb[r.kind] ?? 'updated'} “${r.title}”`, projectId: r.project_id, taskId: r.entity_id,
      actor: r.actor_id ? { id: r.actor_id, name: r.actor_name, email: '', color: '#3b4a6b' } : null, readAt: r.read_at, createdAt: r.created_at,
    }));
    return { items, unread: items.filter((i) => !i.readAt).length };
  }),

  'notifications.read': async (ctx, args) => {
    const ids = args.ids === undefined ? [] : V.uuidList(args.ids, 'ids', 200);
    const everything = args.all === undefined ? false : V.bool(args.all, 'all');
    if (!everything && !ids.length) throw new ApiError('invalid', 'Nothing to mark as read', 'ids');
    return asUser(ctx, async (tx) => {
      if (everything) await run(tx, "update public.notifications set read_at = now() where user_id = pm.uid() and entity_type = 'pm_task' and read_at is null");
      else await run(tx, "update public.notifications set read_at = now() where user_id = pm.uid() and entity_type = 'pm_task' and read_at is null and id = any($1::uuid[])", [ids]);
      return { ok: true } as const;
    });
  },

  'viewprefs.get': async (ctx, args) => {
    const projectId = V.uuid(args.projectId, 'projectId');
    return asUser(ctx, async (tx) => {
      await needRole(tx, projectId, 'viewer');
      const r = await one<Row>(tx, 'select prefs from pm_view_prefs where project_id = $1 and user_id = pm.uid()', [projectId]);
      return (r?.prefs ?? {}) as ViewPrefs;
    });
  },

  'viewprefs.set': async (ctx, args) => {
    const projectId = V.uuid(args.projectId, 'projectId');
    const prefs = V.object(args.prefs, 'prefs');
    if (JSON.stringify(prefs).length >= MAX_PREFS_BYTES) throw new ApiError('invalid', 'View preferences are too large', 'prefs');
    if (prefs.pinned !== undefined) V.arr(prefs.pinned, 'prefs.pinned', 10, (x, f) => V.oneOf(x, f, ['overview', 'list', 'board', 'calendar', 'timeline', 'report', 'docs'] as const));
    if (prefs.list !== undefined) V.object(prefs.list, 'prefs.list');
    return asUser(ctx, async (tx) => {
      await needRole(tx, projectId, 'viewer');
      await run(tx, `insert into pm_view_prefs (workspace_id, user_id, project_id, prefs) values (pm.org(), pm.uid(), $1, $2::jsonb)
        on conflict (user_id, project_id) do update set prefs = excluded.prefs`, [projectId, JSON.stringify(prefs)]);
      return prefs as ViewPrefs;
    });
  },
} satisfies Partial<{ [K in OpName]: (ctx: Ctx, args: Ops[K][0]) => Promise<Ops[K][1]> }>;
