// Projects, sections, links.
import { randomUUID } from 'node:crypto';
import { asUser } from '../db.ts';
import type { Tx } from '../db.ts';
import { ApiError } from '../errors.ts';
import * as V from '../validate.ts';
import type { Ops, OpName, ProjectDetail, ProjectMember, ProjectPatch, ProjectScope, ProjectRole, Section, ProjectLink } from '../../shared/api.ts';
import { PROJECT_STATUSES } from '../../shared/api.ts';
import { copyProjectFields, copyTaskFieldValuesMapped, fieldsOf } from './fields.ts';
import { activity, addDays, all, diffDays, isOrgMember, needRole, one, orgRole, person, personCols, projectSummaries, run, today, type Ctx, type Row } from './util.ts';

const VIEWS = ['overview', 'list', 'board', 'calendar', 'timeline'] as const;
const VISIBILITY = ['members', 'organization'] as const;
const SCOPE_SQL: Record<ProjectScope, string> = {
  active: 'p.archived_at is null and p.deleted_at is null and not p.is_template',
  archived: 'p.archived_at is not null and p.deleted_at is null and not p.is_template',
  trash: 'p.deleted_at is not null',
  templates: 'p.is_template and p.deleted_at is null',
};

async function projectMembers(tx: Tx, id: string): Promise<ProjectMember[]> {
  return (await all(tx, `select ${personCols('u', 'u')}, m.role from pm_project_members m join pm_people u on u.id = m.user_id
    where m.project_id = $1 order by case m.role when 'manager' then 0 when 'editor' then 1 else 2 end, lower(u.name), u.id`, [id]))
    .map((r): ProjectMember => ({ ...person(r, 'u')!, role: r.role }));
}

export async function projectDetail(tx: Tx, id: string): Promise<ProjectDetail> {
  const [summary] = await projectSummaries(tx, 'p.id = $1', [id]);
  if (!summary) throw new ApiError('not_found', 'Project not found');
  const members = await projectMembers(tx, id);
  const sections = (await all(tx, 'select id, name, position from pm_sections where project_id = $1 order by position, created_at, id', [id])) as Section[];
  const links = (await all(tx, 'select l.id, l.kind, l.title, l.url, l.created_at, u.name by_name from pm_project_links l left join pm_people u on u.id = l.created_by where l.project_id = $1 order by l.created_at, l.id', [id]))
    .map((r): ProjectLink => ({ id: r.id, kind: r.kind, title: r.title, url: r.url, createdAt: r.created_at, addedBy: r.by_name ?? null }));
  return { ...summary, members, sections, links, fields: await fieldsOf(tx, id) };
}

function parseProjectPatch(x: unknown): ProjectPatch {
  const o = V.object(x, 'patch');
  V.noUnknown(o, ['name', 'description', 'color', 'status', 'clientId', 'ownerId', 'startOn', 'dueOn', 'visibility', 'defaultView'], 'patch');
  const p: ProjectPatch = {};
  if (o.name !== undefined) p.name = V.str(o.name, 'name', { min: 1, max: 120 });
  if (o.description !== undefined) p.description = V.str(o.description, 'description', { max: 20000, trim: false });
  if (o.color !== undefined) p.color = V.color(o.color, 'color');
  if (o.status !== undefined) p.status = V.oneOf(o.status, 'status', PROJECT_STATUSES);
  if (o.clientId !== undefined) p.clientId = V.nullable(o.clientId, 'clientId', V.uuid);
  if (o.ownerId !== undefined) p.ownerId = V.nullable(o.ownerId, 'ownerId', V.uuid);
  if (o.startOn !== undefined) p.startOn = V.nullable(o.startOn, 'startOn', V.date);
  if (o.dueOn !== undefined) p.dueOn = V.nullable(o.dueOn, 'dueOn', V.date);
  if (o.visibility !== undefined) p.visibility = V.oneOf(o.visibility, 'visibility', VISIBILITY);
  if (o.defaultView !== undefined) p.defaultView = V.oneOf(o.defaultView, 'defaultView', VIEWS);
  return p;
}

const COLS: Record<keyof ProjectPatch, string> = {
  name: 'name', description: 'description', color: 'color', status: 'status', clientId: 'client_id', ownerId: 'owner_id',
  startOn: 'start_on', dueOn: 'due_on', visibility: 'visibility', defaultView: 'default_view',
};

async function applyProjectPatch(tx: Tx, id: string, p: ProjectPatch, current?: { start_on: string | null; due_on: string | null }): Promise<void> {
  const keys = Object.keys(p) as (keyof ProjectPatch)[];
  if (!keys.length) return;
  const cur = current ?? (await one<Row>(tx, 'select start_on, due_on from pm_projects where id = $1', [id]));
  if (!cur) throw new ApiError('not_found', 'Project not found');
  const start = p.startOn !== undefined ? p.startOn : cur.start_on;
  const due = p.dueOn !== undefined ? p.dueOn : cur.due_on;
  if (start && due && due < start) throw new ApiError('invalid', 'The due date must be on or after the start date', 'dueOn');
  if (p.ownerId && !(await isOrgMember(tx, p.ownerId))) throw new ApiError('invalid', 'The owner must be a member of this organization', 'ownerId');
  if (p.clientId && !(await one(tx, 'select 1 x from pm_clients where id = $1', [p.clientId]))) throw new ApiError('invalid', 'Client not found', 'clientId');
  const params: unknown[] = [id];
  const sets = keys.map((k) => { params.push(p[k]); return `${COLS[k]} = $${params.length}`; });
  const n = await run(tx, `update pm_projects set ${sets.join(', ')}, updated_at = now() where id = $1`, params);
  if (n === 0) throw new ApiError('not_found', 'Project not found');
}

/** Copies sections, tasks (top-level + subtasks), checklists and tags from src into dst. Statuses are reset to todo. */
async function copyContent(tx: Tx, srcId: string, dstId: string, shiftDays: number): Promise<void> {
  const shift = (d: string | null) => (d && shiftDays ? addDays(d, shiftDays) : d);
  const secMap = new Map<string, string>();
  for (const s of await all(tx, 'select id, name, position from pm_sections where project_id = $1 order by position, id', [srcId])) {
    const r = await one<Row>(tx, 'insert into pm_sections (workspace_id, project_id, name, position) values (pm.org(), $1, $2, $3) returning id', [dstId, s.name, s.position]);
    secMap.set(s.id, r!.id);
  }
  const fieldMap = await copyProjectFields(tx, srcId, dstId); // custom fields (and below, their values) come along
  const taskMap = new Map<string, string>();
  const tasks = await all(tx, `select * from pm_tasks where project_id = $1 and deleted_at is null order by (parent_id is not null), number`, [srcId]);
  for (const t of tasks) {
    if (t.parent_id && !taskMap.has(t.parent_id)) continue;
    const r = await one<Row>(tx, `insert into pm_tasks (workspace_id, project_id, section_id, parent_id, title, description, status, priority,
        start_on, due_on, estimate_minutes, repeat_rule, position, created_by)
      values (pm.org(), $1, $2, $3, $4, $5, 'todo', $6, $7, $8, $9, $10, $11, pm.uid()) returning id`,
      [dstId, t.section_id ? secMap.get(t.section_id) ?? null : null, t.parent_id ? taskMap.get(t.parent_id) : null, t.title, t.description, t.priority,
        shift(t.start_on), shift(t.due_on), t.estimate_minutes, t.repeat_rule, t.position]);
    taskMap.set(t.id, r!.id);
    // Assignees come along when they can open the copy (a new project starts with its creator as the only member; personal copies keep the owner only).
    await run(tx, `insert into pm_task_assignees (workspace_id, project_id, task_id, user_id)
      select pm.org(), $1, $2, a.user_id from pm_task_assignees a where a.task_id = $3 and pm.user_can_view($1, a.user_id)`, [dstId, r!.id, t.id]);
    await run(tx, `insert into pm_checklist_items (task_id, label, done, position) select $1, label, false, position from pm_checklist_items where task_id = $2`, [r!.id, t.id]);
    await run(tx, `insert into pm_task_tags (task_id, tag_id) select $1, tag_id from pm_task_tags where task_id = $2`, [r!.id, t.id]);
    await copyTaskFieldValuesMapped(tx, dstId, t.id, r!.id, fieldMap);
  }
}

async function earliestDate(tx: Tx, projectId: string, p: Row): Promise<string | null> {
  const r = await one<Row>(tx, `select least(min(start_on), min(due_on)) d from pm_tasks where project_id = $1 and deleted_at is null`, [projectId]);
  const cands = [r?.d, p.start_on, p.due_on].filter((x): x is string => !!x);
  return cands.length ? cands.sort()[0] : null;
}

async function createFrom(tx: Tx, o: {
  name: string; clientId?: string | null; description?: string; color?: string; startOn?: string | null; dueOn?: string | null;
  visibility?: 'members' | 'organization'; fromId?: string | null; asTemplate: boolean; shiftToToday: boolean; mode: 'template' | 'duplicate';
  personal?: boolean;
}): Promise<ProjectDetail> {
  const role = await orgRole(tx);
  if (!role || !['owner', 'admin', 'editor'].includes(role)) throw new ApiError('forbidden', 'You need editor access to create projects');
  let src: Row | undefined;
  if (o.fromId) {
    src = await one<Row>(tx, 'select * from pm_projects where id = $1', [o.fromId]);
    if (!src || (o.mode === 'template' && (!src.is_template || src.deleted_at)) || (o.mode === 'duplicate' && src.deleted_at)) {
      throw new ApiError(o.mode === 'template' ? 'invalid' : 'not_found', o.mode === 'template' ? 'Template not found' : 'Project not found', o.mode === 'template' ? 'fromTemplateId' : 'id');
    }
  }
  const id = randomUUID();
  const personal = o.personal ?? (o.mode === 'duplicate' ? !!src?.is_personal : false);
  const clientId = personal ? null : (o.clientId !== undefined ? o.clientId : (src?.client_id ?? null));
  if (clientId && !(await one(tx, 'select 1 x from pm_clients where id = $1', [clientId]))) throw new ApiError('invalid', 'Client not found', 'clientId');
  await tx.query('select pm.create_project($1, $2, $3, $4, $5)', [id, o.name, clientId, o.asTemplate, personal]);

  let shift = 0;
  if (src && o.shiftToToday) {
    const earliest = await earliestDate(tx, src.id, src);
    if (earliest) shift = diffDays(await today(tx), earliest);
  }
  const shifted = (d: string | null) => (d && shift ? addDays(d, shift) : d);
  const patch: ProjectPatch = {
    description: o.description ?? src?.description ?? '',
    color: o.color ?? src?.color ?? '#6366f1',
    visibility: personal ? 'members' : (o.visibility ?? src?.visibility ?? 'members'),
    startOn: o.startOn !== undefined ? o.startOn : shifted(src?.start_on ?? null),
    dueOn: o.dueOn !== undefined ? o.dueOn : shifted(src?.due_on ?? null),
  };
  if (src) patch.defaultView = src.default_view;
  await applyProjectPatch(tx, id, patch, { start_on: null, due_on: null });
  if (src) await copyContent(tx, src.id, id, shift);
  await activity(tx, id, null, 'project.created', { name: o.name, ...(src ? { copiedFrom: src.id } : {}) });
  return projectDetail(tx, id);
}

async function setProjectFlag(ctx: Ctx, id: string, set: string, kind: string): Promise<{ ok: true }> {
  return asUser(ctx, async (tx) => {
    await needRole(tx, id, 'manager');
    const n = await run(tx, `update pm_projects set ${set}, updated_at = now() where id = $1`, [id]);
    if (n === 0) throw new ApiError('not_found', 'Project not found');
    await activity(tx, id, null, kind);
    return { ok: true } as const;
  });
}

export const projectOps = {
  'projects.list': async (ctx, args) => {
    const scope = args.scope === undefined ? 'active' : V.oneOf(args.scope, 'scope', ['active', 'archived', 'trash', 'templates'] as const);
    return asUser(ctx, (tx) => projectSummaries(tx, SCOPE_SQL[scope], [], scope === 'trash' ? 'order by p.deleted_at desc, p.id' : undefined));
  },

  'projects.get': async (ctx, args) => {
    const id = V.uuid(args.id, 'id');
    return asUser(ctx, (tx) => projectDetail(tx, id));
  },

  'projects.create': async (ctx, args) => {
    const name = V.str(args.name, 'name', { min: 1, max: 120 });
    const clientId = V.optNull(args, 'clientId', V.uuid);
    const description = V.opt(args, 'description', (x, f) => V.str(x, f, { max: 20000, trim: false }));
    const color = V.opt(args, 'color', V.color);
    const startOn = V.optNull(args, 'startOn', V.date);
    const dueOn = V.optNull(args, 'dueOn', V.date);
    const visibility = V.opt(args, 'visibility', (x, f) => V.oneOf(x, f, VISIBILITY));
    const fromTemplateId = V.optNull(args, 'fromTemplateId', V.uuid);
    const personal = V.opt(args, 'personal', V.bool) ?? false;
    if (personal && clientId) throw new ApiError('invalid', 'A personal project cannot belong to a client', 'clientId');
    if (personal && visibility === 'organization') throw new ApiError('invalid', 'A personal project is only visible to you', 'visibility');
    if (startOn && dueOn && dueOn < startOn) throw new ApiError('invalid', 'The due date must be on or after the start date', 'dueOn');
    return asUser(ctx, (tx) => createFrom(tx, { name, clientId, description, color, startOn, dueOn, visibility, personal, fromId: fromTemplateId, asTemplate: false, shiftToToday: true, mode: 'template' }));
  },

  'projects.update': async (ctx, args) => {
    const id = V.uuid(args.id, 'id');
    const patch = parseProjectPatch(args.patch);
    return asUser(ctx, async (tx) => {
      await needRole(tx, id, 'manager');
      const cur = await one<Row>(tx, 'select is_personal from pm_projects where id = $1', [id]);
      if (cur?.is_personal && (patch.clientId || patch.visibility === 'organization' || (patch.ownerId !== undefined))) {
        throw new ApiError('invalid', 'A personal project stays private to you: it cannot get a client, an owner change or organization visibility');
      }
      await applyProjectPatch(tx, id, patch);
      if (Object.keys(patch).length) await activity(tx, id, null, 'project.updated', { fields: Object.keys(patch) });
      return projectDetail(tx, id);
    });
  },

  'projects.duplicate': async (ctx, args) => {
    const id = V.uuid(args.id, 'id');
    const name = V.str(args.name, 'name', { min: 1, max: 120 });
    const asTemplate = args.asTemplate === undefined ? false : V.bool(args.asTemplate, 'asTemplate');
    return asUser(ctx, async (tx) => {
      await needRole(tx, id, 'viewer');
      return createFrom(tx, { name, fromId: id, asTemplate, shiftToToday: false, mode: 'duplicate' });
    });
  },

  'projects.archive': (ctx, args) => setProjectFlag(ctx, V.uuid(args.id, 'id'), 'archived_at = coalesce(archived_at, now())', 'project.archived'),
  'projects.unarchive': (ctx, args) => setProjectFlag(ctx, V.uuid(args.id, 'id'), 'archived_at = null', 'project.unarchived'),
  'projects.trash': (ctx, args) => setProjectFlag(ctx, V.uuid(args.id, 'id'), 'deleted_at = coalesce(deleted_at, now())', 'project.trashed'),
  'projects.restore': (ctx, args) => setProjectFlag(ctx, V.uuid(args.id, 'id'), 'deleted_at = null', 'project.restored'),

  'projects.purge': async (ctx, args) => {
    const id = V.uuid(args.id, 'id');
    return asUser(ctx, async (tx) => {
      const p = await one<Row>(tx, 'select deleted_at from pm_projects where id = $1', [id]);
      if (!p) throw new ApiError('not_found', 'Project not found');
      const role = await orgRole(tx);
      if (role !== 'owner' && role !== 'admin') throw new ApiError('forbidden', 'Only organization owners and admins can permanently delete a project');
      if (!p.deleted_at) throw new ApiError('invalid', 'Move the project to the trash before deleting it permanently');
      const n = await run(tx, 'delete from pm_projects where id = $1 and deleted_at is not null', [id]);
      if (n === 0) throw new ApiError('not_found', 'Project not found');
      return { ok: true } as const;   // the project's Drive files stay in Drive (Drive's own trash rules)
    });
  },

  'projects.setMember': async (ctx, args) => {
    const id = V.uuid(args.id, 'id');
    const userId = V.uuid(args.userId, 'userId');
    const role: ProjectRole | null = V.nullable(args.role, 'role', (x, f) => V.oneOf(x, f, ['manager', 'editor', 'viewer'] as const));
    return asUser(ctx, async (tx) => {
      await needRole(tx, id, 'manager');
      if ((await one<Row>(tx, 'select is_personal from pm_projects where id = $1', [id]))?.is_personal) {
        throw new ApiError('invalid', 'Personal projects are private: they cannot be shared with other people');
      }
      if (!(await isOrgMember(tx, userId))) throw new ApiError('invalid', 'That person is not a member of this organization', 'userId');
      const cur = await one<Row>(tx, 'select role from pm_project_members where project_id = $1 and user_id = $2', [id, userId]);
      if (cur?.role === 'manager' && role !== 'manager') {
        const others = await one<Row>(tx, `select count(*) n from pm_project_members where project_id = $1 and role = 'manager' and user_id <> $2`, [id, userId]);
        if (!others || others.n === 0) throw new ApiError('conflict', 'A project needs at least one manager');
      }
      await activity(tx, id, null, 'project.member', { userId, role }); // before the change: the caller may lose access with it
      if (role === null) {
        if (cur) await run(tx, 'delete from pm_project_members where project_id = $1 and user_id = $2', [id, userId]);
      } else {
        await run(tx, `insert into pm_project_members (workspace_id, project_id, user_id, role) values (pm.org(), $1, $2, $3)
          on conflict (project_id, user_id) do update set role = excluded.role`, [id, userId, role]);
      }
      return projectMembers(tx, id); // empty when the caller just removed their own access
    });
  },

  'projects.addMembers': async (ctx, args) => {
    const id = V.uuid(args.id, 'id');
    const userIds = V.uuidList(args.userIds, 'userIds', 50, 1);
    const role = V.oneOf(args.role, 'role', ['manager', 'editor', 'viewer'] as const);
    return asUser(ctx, async (tx) => {
      await needRole(tx, id, 'manager');
      if ((await one<Row>(tx, 'select is_personal from pm_projects where id = $1', [id]))?.is_personal) {
        throw new ApiError('invalid', 'Personal projects are private: they cannot be shared with other people');
      }
      const org = await all<{ user_id: string }>(tx, 'select user_id from pm_members where workspace_id = pm.org() and user_id = any($1::uuid[])', [userIds]);
      if (org.length !== userIds.length) throw new ApiError('invalid', 'Some of these people are not members of this organization', 'userIds');
      const existing = new Set((await all<{ user_id: string }>(tx, 'select user_id from pm_project_members where project_id = $1 and user_id = any($2::uuid[])', [id, userIds])).map((r) => r.user_id));
      const fresh = userIds.filter((u) => !existing.has(u));
      for (const u of fresh) await activity(tx, id, null, 'project.member', { userId: u, role });
      if (fresh.length) {
        await run(tx, `insert into pm_project_members (workspace_id, project_id, user_id, role) select pm.org(), $1, u, $3 from unnest($2::uuid[]) u`, [id, fresh, role]);
      }
      return { members: await projectMembers(tx, id), added: fresh.length, skipped: userIds.length - fresh.length };
    });
  },

  // -- sections --
  'sections.create': async (ctx, args) => {
    const projectId = V.uuid(args.projectId, 'projectId');
    const name = V.str(args.name, 'name', { min: 1, max: 80 });
    return asUser(ctx, async (tx) => {
      await needRole(tx, projectId, 'editor');
      const r = await one<Row>(tx, `insert into pm_sections (workspace_id, project_id, name, position)
        select pm.org(), $1, $2, coalesce(max(position), 0) + 1000 from pm_sections where project_id = $1 returning id, name, position`, [projectId, name]);
      return r as Section;
    });
  },

  'sections.update': async (ctx, args) => {
    const id = V.uuid(args.id, 'id');
    const name = V.opt(args, 'name', (x, f) => V.str(x, f, { min: 1, max: 80 }));
    const position = V.opt(args, 'position', V.num);
    return asUser(ctx, async (tx) => {
      const s = await one<Row>(tx, 'select project_id from pm_sections where id = $1', [id]);
      if (!s) throw new ApiError('not_found', 'Section not found');
      await needRole(tx, s.project_id, 'editor');
      const r = await one<Row>(tx, 'update pm_sections set name = coalesce($2, name), position = coalesce($3, position) where id = $1 returning id, name, position',
        [id, name ?? null, position ?? null]);
      if (!r) throw new ApiError('not_found', 'Section not found');
      return r as Section;
    });
  },

  'sections.delete': async (ctx, args) => {
    const id = V.uuid(args.id, 'id');
    return asUser(ctx, async (tx) => {
      const s = await one<Row>(tx, 'select project_id from pm_sections where id = $1', [id]);
      if (!s) throw new ApiError('not_found', 'Section not found');
      await needRole(tx, s.project_id, 'editor');
      if ((await run(tx, 'delete from pm_sections where id = $1', [id])) === 0) throw new ApiError('not_found', 'Section not found');
      return { ok: true } as const;
    });
  },

  // -- links --
  'links.add': async (ctx, args) => {
    const projectId = V.uuid(args.projectId, 'projectId');
    const kind = V.oneOf(args.kind, 'kind', ['doc', 'whiteboard', 'sheet', 'link'] as const);
    const title = V.str(args.title, 'title', { min: 1, max: 200 });
    const url = V.str(args.url, 'url', { min: 1, max: 2000 });
    if (!/^https?:\/\/[^\s]+$/i.test(url)) throw new ApiError('invalid', 'url must start with http:// or https://', 'url');
    return asUser(ctx, async (tx) => {
      await needRole(tx, projectId, 'editor');
      const r = await one<Row>(tx, `insert into pm_project_links (workspace_id, project_id, kind, title, url, created_by) values (pm.org(), $1, $2, $3, $4, pm.uid())
        returning id, kind, title, url, created_at`, [projectId, kind, title, url]);
      return { id: r!.id, kind: r!.kind, title: r!.title, url: r!.url, createdAt: r!.created_at } as ProjectLink;
    });
  },

  'links.update': async (ctx, args) => {
    const id = V.uuid(args.id, 'id');
    const title = V.opt(args, 'title', (x, f) => V.str(x, f, { min: 1, max: 200 }));
    const url = V.opt(args, 'url', (x, f) => V.str(x, f, { min: 1, max: 2000 }));
    if (url !== undefined && !/^https?:\/\/[^\s]+$/i.test(url)) throw new ApiError('invalid', 'url must start with http:// or https://', 'url');
    return asUser(ctx, async (tx) => {
      const l = await one<Row>(tx, 'select project_id from pm_project_links where id = $1', [id]);
      if (!l) throw new ApiError('not_found', 'Link not found');
      await needRole(tx, l.project_id, 'editor');
      const r = await one<Row>(tx, `update pm_project_links set title = coalesce($2, title), url = coalesce($3, url) where id = $1
        returning id, kind, title, url, created_at`, [id, title ?? null, url ?? null]);
      if (!r) throw new ApiError('not_found', 'Link not found');
      return { id: r.id, kind: r.kind, title: r.title, url: r.url, createdAt: r.created_at } as ProjectLink;
    });
  },

  'links.remove': async (ctx, args) => {
    const id = V.uuid(args.id, 'id');
    return asUser(ctx, async (tx) => {
      const l = await one<Row>(tx, 'select project_id from pm_project_links where id = $1', [id]);
      if (!l) throw new ApiError('not_found', 'Link not found');
      await needRole(tx, l.project_id, 'editor');
      if ((await run(tx, 'delete from pm_project_links where id = $1', [id])) === 0) throw new ApiError('not_found', 'Link not found');
      return { ok: true } as const;
    });
  },
} satisfies Partial<{ [K in OpName]: (ctx: Ctx, args: Ops[K][0]) => Promise<Ops[K][1]> }>;

