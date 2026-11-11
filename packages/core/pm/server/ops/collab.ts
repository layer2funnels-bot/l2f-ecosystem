// Collaboration: checklist, dependencies, tags, following, comments, attachments.
import { asUser } from '../db.ts';
import type { Tx } from '../db.ts';
import { ApiError } from '../errors.ts';
import { assertReadableFile, fileCols, fileJoin } from '../files.ts';
import * as V from '../validate.ts';
import type { Attachment, ChecklistItem, Comment, Ops, OpName, Tag, TaskLink } from '../../shared/api.ts';
import { actorName, activity, all, editableTask, follow, followerIds, needRole, notify, one, orgRole, person, personCols, personOrThrow, run, taskScope, type Ctx, type Row } from './util.ts';
import { uuidArray } from './tasks.ts';

async function checklistItem(tx: Tx, id: string): Promise<Row> {
  const r = await one<Row>(tx, 'select id, project_id, task_id, label, done, position from pm_checklist_items where id = $1', [id]);
  if (!r) throw new ApiError('not_found', 'Checklist item not found');
  await needRole(tx, r.project_id, 'editor');
  return r;
}
const item = (r: Row): ChecklistItem => ({ id: r.id, label: r.label, done: r.done, position: r.position });

/** Mentions are kept only for active-organization members who can open the project. */
async function visibleMentions(tx: Tx, projectId: string, ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const rows = await all<{ user_id: string }>(tx, `select m.user_id from pm_members m where m.workspace_id = pm.org() and m.user_id = any($1::uuid[])
    and pm.user_can_view($2, m.user_id)`, [ids, projectId]);
  const ok = new Set(rows.map((r) => r.user_id));
  return ids.filter((i) => ok.has(i));
}

async function commentOut(tx: Tx, ctx: Ctx, id: string): Promise<Comment> {
  const r = await one<Row>(tx, `select c.id, c.body, c.created_at, c.edited_at, c.author_id, ${personCols('u', 'u')},
    coalesce((select array_agg(m.user_id order by m.user_id) from public.comment_mentions m where m.workspace_id = c.workspace_id and m.comment_id = c.id), '{}') mentions
    from public.comments c join pm_people u on u.id = c.author_id where c.id = $1 and c.entity_type = 'pm_task'`, [id]);
  if (!r) throw new ApiError('not_found', 'Comment not found');
  return { id: r.id, author: personOrThrow(r, 'u'), body: r.body, mentions: uuidArray(r.mentions), createdAt: r.created_at, editedAt: r.edited_at, mine: r.author_id === ctx.userId };
}

/** Task links are https only (max 2000 characters, no whitespace). */
function httpsUrl(x: unknown): string {
  const url = V.str(x, 'url', { min: 1, max: 2000 });
  if (!/^https:\/\/[^\s/?#][^\s]*$/i.test(url)) throw new ApiError('invalid', 'url must start with https://', 'url');
  return url;
}

async function taskLink(tx: Tx, id: string): Promise<TaskLink> {
  const r = await one<Row>(tx, `select l.id, l.title, l.url, l.created_at, ${personCols('u', 'u')} from pm_task_links l left join pm_people u on u.id = l.created_by where l.id = $1`, [id]);
  if (!r) throw new ApiError('not_found', 'Link not found');
  return { id: r.id, title: r.title, url: r.url, createdBy: person(r, 'u'), createdAt: r.created_at };
}

// -- attachments: a Drive file linked to a task (owner decision: task files live in Drive) --
async function attachmentById(tx: Tx, id: string): Promise<Attachment> {
  const r = await one<Row>(tx, `select a.id, a.file_id, a.created_at, ${fileCols}, ${personCols('u', 'u')} from pm_attachments a ${fileJoin('a')}
    left join pm_people u on u.id = a.uploaded_by where a.id = $1`, [id]);
  if (!r) throw new ApiError('not_found', 'File not found');
  return { id: r.id, fileId: r.file_id, name: r.df_name, mime: r.df_mime, sizeBytes: r.df_size, kind: r.df_kind, uploadedBy: personOrThrow(r, 'u'), createdAt: r.created_at };
}

export const collabOps = {
  // -- checklist --
  'checklist.add': async (ctx, args) => {
    const taskId = V.uuid(args.taskId, 'taskId');
    const label = V.str(args.label, 'label', { min: 1, max: 500 });
    return asUser(ctx, async (tx) => {
      await editableTask(tx, taskId, 'editor');
      const r = await one<Row>(tx, `insert into pm_checklist_items (task_id, label, position)
        select $1, $2, coalesce(max(position), 0) + 1000 from pm_checklist_items where task_id = $1 returning id, label, done, position`, [taskId, label]);
      return item(r!);
    });
  },

  'checklist.update': async (ctx, args) => {
    const id = V.uuid(args.id, 'id');
    const label = V.opt(args, 'label', (x, f) => V.str(x, f, { min: 1, max: 500 }));
    const done = V.opt(args, 'done', V.bool);
    const position = V.opt(args, 'position', V.num);
    return asUser(ctx, async (tx) => {
      await checklistItem(tx, id);
      const r = await one<Row>(tx, `update pm_checklist_items set label = coalesce($2, label), done = coalesce($3, done), position = coalesce($4, position)
        where id = $1 returning id, label, done, position`, [id, label ?? null, done ?? null, position ?? null]);
      if (!r) throw new ApiError('not_found', 'Checklist item not found');
      return item(r);
    });
  },

  'checklist.remove': async (ctx, args) => {
    const id = V.uuid(args.id, 'id');
    return asUser(ctx, async (tx) => {
      await checklistItem(tx, id);
      if ((await run(tx, 'delete from pm_checklist_items where id = $1', [id])) === 0) throw new ApiError('not_found', 'Checklist item not found');
      return { ok: true } as const;
    });
  },

  // -- dependencies --
  'deps.add': async (ctx, args) => {
    const taskId = V.uuid(args.taskId, 'taskId');
    const dependsOnId = V.uuid(args.dependsOnId, 'dependsOnId');
    if (taskId === dependsOnId) throw new ApiError('invalid', 'A task cannot wait on itself', 'dependsOnId');
    return asUser(ctx, async (tx) => {
      const t = await editableTask(tx, taskId, 'editor');
      const d = await taskScope(tx, dependsOnId);
      if (d.project_id !== t.project_id) throw new ApiError('invalid', 'Tasks must be in the same project', 'dependsOnId');
      if (d.deleted_at) throw new ApiError('invalid', 'That task is in the trash', 'dependsOnId');
      await run(tx, 'insert into pm_dependencies (task_id, depends_on_id) values ($1, $2) on conflict do nothing', [taskId, dependsOnId]);
      return { ok: true } as const;
    });
  },

  'deps.remove': async (ctx, args) => {
    const taskId = V.uuid(args.taskId, 'taskId');
    const dependsOnId = V.uuid(args.dependsOnId, 'dependsOnId');
    return asUser(ctx, async (tx) => {
      const t = await taskScope(tx, taskId);
      await needRole(tx, t.project_id, 'editor');
      await run(tx, 'delete from pm_dependencies where task_id = $1 and depends_on_id = $2', [taskId, dependsOnId]);
      return { ok: true } as const;
    });
  },

  // -- tags --
  'tasks.setTags': async (ctx, args) => {
    const id = V.uuid(args.id, 'id');
    const tagIds = V.uuidList(args.tagIds, 'tagIds', 30);
    return asUser(ctx, async (tx) => {
      const t = await editableTask(tx, id, 'editor');
      if (tagIds.length) {
        const n = (await one<Row>(tx, 'select count(*) n from pm_tags where id = any($1::uuid[])', [tagIds]))!.n as number;
        if (n !== tagIds.length) throw new ApiError('invalid', 'One of the tags does not exist', 'tagIds');
      }
      await run(tx, 'delete from pm_task_tags where task_id = $1 and not (tag_id = any($2::uuid[]))', [id, tagIds]);
      await run(tx, 'insert into pm_task_tags (task_id, tag_id) select $1, g from unnest($2::uuid[]) g on conflict do nothing', [id, tagIds]);
      await activity(tx, t.project_id, id, 'task.tags', { count: tagIds.length });
      return (await all(tx, `select g.id, g.name, g.color from pm_task_tags tt join pm_tags g on g.id = tt.tag_id where tt.task_id = $1 order by g.name`, [id])) as Tag[];
    });
  },

  // -- following --
  'follow.set': async (ctx, args) => {
    const taskId = V.uuid(args.taskId, 'taskId');
    const on = V.bool(args.on, 'on');
    return asUser(ctx, async (tx) => {
      const t = await taskScope(tx, taskId);
      if (on) await follow(tx, t.project_id, taskId, ctx.userId);
      else await run(tx, "delete from public.follows where entity_type = 'pm_task' and entity_id = $1 and user_id = pm.uid()", [taskId]);
      return { following: on };
    });
  },

  // -- comments (the shared ecosystem comments, migration 0049: mentions, followers and the bell are handled there) --
  'comments.add': async (ctx, args) => {
    const taskId = V.uuid(args.taskId, 'taskId');
    const body = V.str(args.body, 'body', { min: 1, max: 10000 });
    const requested = args.mentions === undefined ? [] : V.uuidList(args.mentions, 'mentions', 50);
    return asUser(ctx, async (tx) => {
      const t = await taskScope(tx, taskId); // any project member (including viewers) may comment
      if (t.deleted_at) throw new ApiError('invalid', 'This task is in the trash. Restore it first.');
      const mentions = await visibleMentions(tx, t.project_id, requested);
      const r = await one<Row>(tx, "select id from public.comment_add('pm_task', $1, $2, $3::uuid[])", [taskId, body, mentions]);
      await activity(tx, t.project_id, taskId, 'task.commented', {});
      return commentOut(tx, ctx, r!.id);
    });
  },

  'comments.edit': async (ctx, args) => {
    const id = V.uuid(args.id, 'id');
    const body = V.str(args.body, 'body', { min: 1, max: 10000 });
    const requested = args.mentions === undefined ? undefined : V.uuidList(args.mentions, 'mentions', 50);
    return asUser(ctx, async (tx) => {
      const c = await one<Row>(tx, "select id, project_id, entity_id task_id, author_id from public.comments where id = $1 and entity_type = 'pm_task'", [id]);
      if (!c) throw new ApiError('not_found', 'Comment not found');
      if (c.author_id !== ctx.userId) throw new ApiError('forbidden', 'You can only edit your own comments');
      if ((await run(tx, 'update public.comments set body = $2 where id = $1', [id, body])) === 0) throw new ApiError('not_found', 'Comment not found');
      if (requested) {
        // newly mentioned people are told (the shared trigger); a mention cannot be taken back once someone was told
        const mentions = await visibleMentions(tx, c.project_id, requested);
        await run(tx, `insert into public.comment_mentions (workspace_id, comment_id, user_id) select pm.org(), $1, u from unnest($2::uuid[]) u on conflict do nothing`, [id, mentions]);
      }
      return commentOut(tx, ctx, id);
    });
  },

  'comments.remove': async (ctx, args) => {
    const id = V.uuid(args.id, 'id');
    return asUser(ctx, async (tx) => {
      const c = await one<Row>(tx, "select author_id from public.comments where id = $1 and entity_type = 'pm_task'", [id]);
      if (!c) throw new ApiError('not_found', 'Comment not found');
      if (c.author_id !== ctx.userId) throw new ApiError('forbidden', 'You can only remove your own comments');
      if ((await run(tx, 'delete from public.comments where id = $1', [id])) === 0) throw new ApiError('not_found', 'Comment not found');
      return { ok: true } as const;
    });
  },

  // -- task links --
  'links.task.add': async (ctx, args) => {
    const taskId = V.uuid(args.taskId, 'taskId');
    const title = V.str(args.title, 'title', { min: 1, max: 200 });
    const url = httpsUrl(args.url);
    return asUser(ctx, async (tx) => {
      const t = await editableTask(tx, taskId, 'editor');
      const r = await one<Row>(tx, `insert into pm_task_links (task_id, title, url, created_by) values ($1, $2, $3, pm.uid()) returning id`, [taskId, title, url]);
      await activity(tx, t.project_id, taskId, 'task.link_added', { title, url });
      return taskLink(tx, r!.id);
    });
  },

  'links.task.update': async (ctx, args) => {
    const id = V.uuid(args.id, 'id');
    const title = V.opt(args, 'title', (x, f) => V.str(x, f, { min: 1, max: 200 }));
    const url = args.url === undefined ? undefined : httpsUrl(args.url);
    return asUser(ctx, async (tx) => {
      const l = await one<Row>(tx, 'select project_id, task_id from pm_task_links where id = $1', [id]);
      if (!l) throw new ApiError('not_found', 'Link not found');
      await editableTask(tx, l.task_id, 'editor');
      if ((await run(tx, 'update pm_task_links set title = coalesce($2, title), url = coalesce($3, url) where id = $1', [id, title ?? null, url ?? null])) === 0) {
        throw new ApiError('not_found', 'Link not found');
      }
      return taskLink(tx, id);
    });
  },

  'links.task.remove': async (ctx, args) => {
    const id = V.uuid(args.id, 'id');
    return asUser(ctx, async (tx) => {
      const l = await one<Row>(tx, 'select project_id, task_id, title from pm_task_links where id = $1', [id]);
      if (!l) throw new ApiError('not_found', 'Link not found');
      await needRole(tx, l.project_id, 'editor');
      if ((await run(tx, 'delete from pm_task_links where id = $1', [id])) === 0) throw new ApiError('not_found', 'Link not found');
      await activity(tx, l.project_id, l.task_id, 'task.link_removed', { title: l.title });
      return { ok: true } as const;
    });
  },

  // -- attachments: link a Drive file (uploaded into the project through Drive, or an existing one) / unlink it --
  'attachments.add': async (ctx, args) => {
    const taskId = V.uuid(args.taskId, 'taskId'), fileId = V.uuid(args.fileId, 'fileId');
    return asUser(ctx, async (tx) => {
      const t = await editableTask(tx, taskId, 'editor');
      await assertReadableFile(tx, fileId);
      const r = await one<Row>(tx, `insert into pm_attachments (task_id, file_id, uploaded_by) values ($1, $2, pm.uid())
        on conflict (task_id, file_id) do update set deleted_at = null returning id`, [taskId, fileId]);
      const a = await attachmentById(tx, r!.id);
      await activity(tx, t.project_id, taskId, 'task.attachment', { name: a.name });
      return a;
    });
  },
  'attachments.remove': async (ctx, args) => {
    const id = V.uuid(args.id, 'id');
    return asUser(ctx, async (tx) => {
      const a = await one<Row>(tx, 'select project_id, task_id, file_id from pm_attachments where id = $1 and deleted_at is null', [id]);
      if (!a) throw new ApiError('not_found', 'File not found');
      await needRole(tx, a.project_id, 'editor');
      const name = (await one<Row>(tx, 'select name from public.files where id = $1', [a.file_id]))?.name ?? 'a file';
      if ((await run(tx, 'delete from pm_attachments where id = $1', [id])) === 0) throw new ApiError('not_found', 'File not found');
      await activity(tx, a.project_id, a.task_id, 'task.attachment_removed', { name });
      return { ok: true } as const;   // the file stays in Drive
    });
  },
} satisfies Partial<{ [K in OpName]: (ctx: Ctx, args: Ops[K][0]) => Promise<Ops[K][1]> }>;

