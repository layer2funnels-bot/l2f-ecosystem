// Working together (migration 0034): comments with mentions, activity history, following and notifications. One service for every app
// (ARCHITECTURE ER1); a record type joins in the migration (private.collab_scope) and in TYPES below. Row policies and triggers decide who
// may read, write and be told; staff only (the default audience), so client contacts never reach comments.
import { defineOperation } from './define.mjs';

const TYPES = ['project_task'];
const target = { type: { type: 'enum', values: TYPES, required: true }, id: { type: 'uuid', required: true } };

export const collabOperations = [
  defineOperation({
    name: 'comments.list', class: 'read', input: target,
    run: (q, _c, i) => q(`select c.id, c.author_id, coalesce(nullif(pr.display_name, ''), 'Someone') as author_name, c.body, c.edited_at, c.created_at,
        coalesce((select array_agg(m.user_id) from comment_mentions m where m.comment_id = c.id), '{}') as mentions
      from comments c left join profiles pr on pr.id = c.author_id where c.entity_type = $1 and c.entity_id = $2 order by c.seq limit 500`, [i.type, i.id]),
  }),
  defineOperation({
    name: 'comments.add', class: 'write', single: true,
    input: { ...target, body: { type: 'text', required: true, max: 10000 }, mentions: { type: 'list', items: 'uuid', max: 20 } },
    run: (q, _c, i) => q('select id, mentioned from comment_add($1, $2, $3, $4::uuid[])', [i.type, i.id, i.body, i.mentions ?? []]),
  }),
  defineOperation({
    name: 'comments.edit', class: 'write', single: true, input: { id: { type: 'uuid', required: true }, body: { type: 'text', required: true, max: 10000 } },
    run: (q, _c, i) => q('update comments set body = $2 where id = $1 returning id, body, edited_at', [i.id, i.body]),
  }),
  defineOperation({
    name: 'comments.delete', class: 'write', single: true, input: { id: { type: 'uuid', required: true } },
    run: (q, _c, i) => q('delete from comments where id = $1 returning id', [i.id]),
  }),
  defineOperation({
    name: 'activity.list', class: 'read', input: target,
    run: (q, _c, i) => q(`select a.id, a.action, a.detail, a.actor_id, coalesce(nullif(pr.display_name, ''), 'Someone') as actor_name, a.created_at
      from activity_events a left join profiles pr on pr.id = a.actor_id where a.entity_type = $1 and a.entity_id = $2 order by a.seq limit 500`, [i.type, i.id]),
  }),
  defineOperation({
    name: 'follow.get', class: 'read', single: true, input: target,
    run: (q, ctx, i) => q('select exists (select 1 from follows where entity_type = $1 and entity_id = $2 and user_id = $3) as following', [i.type, i.id, ctx.userId]),
  }),
  defineOperation({
    name: 'follow.set', class: 'write', single: true, input: { ...target, on: { type: 'bool', required: true } },
    run: async (q, ctx, i) => {
      if (i.on) await q('insert into follows (workspace_id, entity_type, entity_id, user_id) values ($1, $2, $3, $4) on conflict do nothing', [ctx.orgId, i.type, i.id, ctx.userId]);
      else await q('delete from follows where entity_type = $1 and entity_id = $2 and user_id = $3', [i.type, i.id, ctx.userId]);
      return q('select exists (select 1 from follows where entity_type = $1 and entity_id = $2 and user_id = $3) as following', [i.type, i.id, ctx.userId]);
    },
  }),
  defineOperation({
    name: 'notifications.list', class: 'read', input: { limit: { type: 'int', min: 1, max: 100 } },
    run: (q, _c, i) => q('select * from my_notifications($1)', [i.limit ?? 30]),
  }),
  defineOperation({
    // counts what the list would show (records the reader can still open), so the badge never promises more than the list
    name: 'notifications.unread', class: 'read', single: true,
    run: (q) => q('select count(*)::int as n from my_notifications(100) where read_at is null'),
  }),
  defineOperation({
    name: 'notifications.read', class: 'write', single: true, input: { ids: { type: 'list', items: 'uuid', max: 100 }, all: { type: 'bool' } },
    run: (q, ctx, i) => q(`with done as (update notifications set read_at = now() where user_id = $1 and read_at is null and ($2 or id = any ($3::uuid[])) returning 1)
      select count(*)::int as n from done`, [ctx.userId, i.all ?? false, i.ids ?? []]),
  }),
];
