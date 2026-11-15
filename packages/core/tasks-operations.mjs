// P02 Tasks (V8 01_APPLICATIONS/04_TASKS) operations. Row rules in migration 0059 decide who sees and changes what; every query runs as the caller.
// Shapes are small and flat for the browser module apps/web/js/modules/tasks.js.
import { defineOperation } from './define.mjs';

const ID = { type: 'uuid', required: true };
const T = (max, required = false) => ({ type: 'text', min: required ? 1 : 0, max, required });
const ITEM_COLS = `i.id, i.list_id, i.block_id, i.parent_id, i.position, i.title, i.done_at, i.due_date, i.due_time, i.priority, i.private, i.notes, i.source_app, i.source_ref,
  i.project_task_id, i.created_by, i.created_at,
  coalesce((select array_agg(a.user_id order by a.added_at) from task_assignees a where a.item_id = i.id), '{}') as assignees`;
const LIST_COLS = 'l.id, l.folder_id, l.owner_id, l.space, l.name, l.icon, l.colour, l.is_default, l.position, l.archived_at, l.created_at';
const today = (i) => i?.today ?? new Date().toISOString().slice(0, 10);

const setAssignees = async (q, ctx, item, users) => {
  const want = [...new Set(users ?? [])];
  await q('delete from task_assignees where item_id = $1 and user_id <> all($2::uuid[])', [item, want]);
  if (want.length) await q('insert into task_assignees (workspace_id, item_id, user_id) select $1, $2, unnest($3::uuid[]) on conflict do nothing', [ctx.orgId, item, want]);
};
const stopTimers = async (q) => {
  await q('update task_time_entries set ended_at = now() where user_id = private.current_user_id() and ended_at is null');
  await q("update pm_time_entries set ended_at = least(now(), started_at + interval '24 hours') where user_id = private.current_user_id() and ended_at is null");
};

export const tasksOperations = [
  // ---- sidebar: folders and lists with open counts (creates "My tasks" on first use)
  defineOperation({
    name: 'tasks.home', class: 'read',
    run: async (q, ctx) => {
      const [{ id: mine }] = await q('select public.tasks_my_default() as id');
      const [folders, lists, counts] = await Promise.all([
        q('select id, space, name, icon, colour, position, owner_id from task_folders where workspace_id = $1 and archived_at is null order by space, position, name', [ctx.orgId]),
        q(`select ${LIST_COLS}, private.task_list_level(l.id) as level from task_lists l where l.workspace_id = $1 and l.archived_at is null order by l.is_default desc, l.position, l.name`, [ctx.orgId]),
        q(`select
             (select count(*)::int from task_items i where i.workspace_id = $1 and i.done_at is null and i.due_date <= $2::date
               and (exists (select 1 from task_assignees a where a.item_id = i.id and a.user_id = private.current_user_id())
                    or (i.created_by = private.current_user_id() and not exists (select 1 from task_assignees a where a.item_id = i.id)))) as today,
             (select count(*)::int from task_items i where i.workspace_id = $1 and i.list_id is null and i.done_at is null and i.created_by = private.current_user_id()) as inbox`, [ctx.orgId, today()]),
      ]);
      const open = await q('select list_id, count(*)::int n from task_items where workspace_id = $1 and done_at is null and list_id is not null and parent_id is null group by list_id', [ctx.orgId]);
      const n = new Map(open.map((r) => [r.list_id, r.n]));
      return [{ mine, folders, lists: lists.map((l) => ({ ...l, open: n.get(l.id) ?? 0 })), counts: counts[0] }];
    },
  }),
  // ---- folders
  defineOperation({ name: 'tasks.folders.create', class: 'write', single: true, input: { name: T(120, true), space: { type: 'enum', values: ['personal', 'team'], required: true }, colour: { type: 'hex' }, icon: T(40) },
    run: (q, ctx, i) => q("insert into task_folders (workspace_id, owner_id, space, name, colour, icon) values ($1, private.current_user_id(), $2, $3, coalesce($4, '#0EA5A4'), coalesce(nullif($5, ''), 'folder')) returning *", [ctx.orgId, i.space, i.name.trim(), i.colour ?? null, i.icon ?? null]) }),
  defineOperation({ name: 'tasks.folders.update', class: 'write', single: true, input: { id: ID, name: T(120), colour: { type: 'hex' }, icon: T(40), archived: { type: 'bool' } },
    run: (q, _c, i) => q(`update task_folders set name = coalesce(nullif($2, ''), name), colour = coalesce($3, colour), icon = coalesce(nullif($4, ''), icon),
      archived_at = case when $5::boolean is null then archived_at when $5 then now() else null end where id = $1 returning *`, [i.id, i.name?.trim() ?? null, i.colour ?? null, i.icon ?? null, i.archived ?? null]) }),
  // ---- lists
  defineOperation({ name: 'tasks.lists.create', class: 'write', single: true, input: { name: T(120, true), space: { type: 'enum', values: ['personal', 'team'], required: true }, folder: { type: 'uuid' }, colour: { type: 'hex' }, icon: T(40) },
    run: async (q, ctx, i) => {
      const [l] = await q("insert into task_lists (workspace_id, owner_id, space, name, folder_id, colour, icon) values ($1, private.current_user_id(), $2, $3, $4, coalesce($5, '#0EA5A4'), coalesce(nullif($6, ''), 'tasks')) returning *",
        [ctx.orgId, i.space, i.name.trim(), i.folder ?? null, i.colour ?? null, i.icon ?? null]);
      await q("insert into task_blocks (workspace_id, list_id, name, position) values ($1, $2, 'Open', 0)", [ctx.orgId, l.id]);
      return [l];
    } }),
  defineOperation({ name: 'tasks.lists.update', class: 'write', single: true, input: { id: ID, name: T(120), colour: { type: 'hex' }, icon: T(40), folder: { type: 'uuid' }, no_folder: { type: 'bool' }, archived: { type: 'bool' } },
    run: (q, _c, i) => q(`update task_lists set name = coalesce(nullif($2, ''), name), colour = coalesce($3, colour), icon = coalesce(nullif($4, ''), icon),
      folder_id = case when $6 then null else coalesce($5, folder_id) end, archived_at = case when $7::boolean is null then archived_at when $7 then now() else null end where id = $1 returning *`,
    [i.id, i.name?.trim() ?? null, i.colour ?? null, i.icon ?? null, i.folder ?? null, i.no_folder ?? false, i.archived ?? null]) }),
  defineOperation({ name: 'tasks.lists.delete', class: 'write', single: true, input: { id: ID }, run: (q, _c, i) => q('delete from task_lists where id = $1 and archived_at is not null returning id', [i.id]) }),
  defineOperation({
    name: 'tasks.lists.duplicate', class: 'write', single: true, input: { id: ID },
    run: async (q, ctx, i) => {
      const [s] = await q('select * from task_lists where id = $1', [i.id]); if (!s) return [];
      const [l] = await q('insert into task_lists (workspace_id, owner_id, space, name, folder_id, colour, icon) values ($1, private.current_user_id(), $2, $3, $4, $5, $6) returning *', [ctx.orgId, s.space, `${s.name} (copy)`.slice(0, 120), s.space === 'team' ? s.folder_id : null, s.colour, s.icon]);
      const blocks = await q('select id, name, position from task_blocks where list_id = $1 order by position', [s.id]); const map = new Map();
      for (const b of blocks) { const [nb] = await q('insert into task_blocks (workspace_id, list_id, name, position) values ($1, $2, $3, $4) returning id', [ctx.orgId, l.id, b.name, b.position]); map.set(b.id, nb.id); }
      const items = await q('select * from task_items where list_id = $1 and done_at is null order by parent_id nulls first, position', [s.id]); const im = new Map();
      for (const it of items) { if (it.parent_id && !im.has(it.parent_id)) continue;
        const [ni] = await q('insert into task_items (workspace_id, list_id, block_id, parent_id, position, title, due_date, due_time, priority, private, notes) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id',
          [ctx.orgId, l.id, map.get(it.block_id) ?? null, it.parent_id ? im.get(it.parent_id) : null, it.position, it.title, it.due_date, it.due_time, it.priority, s.space === 'personal' && it.private, it.notes]); im.set(it.id, ni.id); }
      return [l];
    },
  }),
  // ---- one list: header, blocks, every visible task (open and completed: the browser hides completed ones in place)
  defineOperation({
    name: 'tasks.lists.get', class: 'read', single: true, input: { id: ID },
    run: async (q, ctx, i) => {
      const [l] = await q(`select ${LIST_COLS}, private.task_list_level(l.id) as level, coalesce(nullif(p.display_name, ''), 'Someone') as owner_name from task_lists l left join profiles p on p.id = l.owner_id where l.id = $1`, [i.id]);
      if (!l) return [];
      const [blocks, items, access] = await Promise.all([q('select id, name, position, collapsed from task_blocks where list_id = $1 order by position', [i.id]),
        q(`select ${ITEM_COLS} from task_items i where i.list_id = $1 order by i.position, i.created_at`, [i.id]),
        q(`select a.user_id, a.level, 'list' as via from task_list_access a where a.list_id = $1 union all select a.user_id, a.level, 'folder' from task_list_access a join task_lists l on l.folder_id = a.folder_id where l.id = $1`, [i.id])]);
      return [{ ...l, blocks, items, access }];
    },
  }),
  // ---- who can open a list or folder (multi-select at once)
  defineOperation({
    name: 'tasks.access.set', class: 'sensitive', input: { list: { type: 'uuid' }, folder: { type: 'uuid' }, entries: { type: 'json', required: true, max: 20000 } },
    run: async (q, ctx, i) => {
      if (!i.list === !i.folder) throw { code: '22023', message: 'choose a list or a folder' };
      const entries = (Array.isArray(i.entries) ? i.entries : []).filter((e) => /^[0-9a-f-]{36}$/i.test(e?.user) && ['edit', 'view'].includes(e?.level)).slice(0, 500);
      const col = i.list ? 'list_id' : 'folder_id'; const target = i.list ?? i.folder;
      await q(`delete from task_list_access where ${col} = $1 and user_id <> all($2::uuid[])`, [target, entries.map((e) => e.user)]);
      for (const e of entries) await q(`insert into task_list_access (workspace_id, ${col}, user_id, level) values ($1, $2, $3, $4) on conflict (${col}, user_id) where ${col} is not null do update set level = excluded.level`, [ctx.orgId, target, e.user, e.level]);
      return q(`select user_id, level from task_list_access where ${col} = $1`, [target]);
    },
  }),
  // ---- blocks
  defineOperation({ name: 'tasks.blocks.create', class: 'write', single: true, input: { list: ID, name: T(120, true) },
    run: (q, ctx, i) => q('insert into task_blocks (workspace_id, list_id, name, position) values ($1, $2, $3, coalesce((select max(position) + 1 from task_blocks where list_id = $2), 0)) returning *', [ctx.orgId, i.list, i.name.trim()]) }),
  defineOperation({ name: 'tasks.blocks.update', class: 'write', single: true, input: { id: ID, name: T(120), position: { type: 'number', min: -1e9, max: 1e9 }, collapsed: { type: 'bool' } },
    run: (q, _c, i) => q('update task_blocks set name = coalesce(nullif($2, \'\'), name), position = coalesce($3, position), collapsed = coalesce($4, collapsed) where id = $1 returning *', [i.id, i.name?.trim() ?? null, i.position ?? null, i.collapsed ?? null]) }),
  defineOperation({ name: 'tasks.blocks.delete', class: 'write', single: true, input: { id: ID },
    run: async (q, _c, i) => { await q('delete from task_items where block_id = $1', [i.id]); return q('delete from task_blocks where id = $1 returning id', [i.id]); } }),
  // ---- tasks
  defineOperation({
    name: 'tasks.items.create', class: 'write', single: true,
    input: { list: { type: 'uuid' }, block: { type: 'uuid' }, parent: { type: 'uuid' }, after: { type: 'uuid' }, title: T(500, true), due_date: { type: 'date' }, due_time: T(5), priority: { type: 'enum', values: ['normal', 'high'] },
      private: { type: 'bool' }, notes: T(20000), assignees: { type: 'list', items: 'uuid', max: 50 }, source_app: T(40), source_ref: T(300), id: { type: 'uuid' } },
    run: async (q, ctx, i) => {
      let block = i.block ?? null;
      if (i.list && !block && !i.parent) block = (await q('select id from task_blocks where list_id = $1 order by position limit 1', [i.list]))[0]?.id ?? null;
      const pos = i.after ? (await q('select position + 0.5 as p from task_items where id = $1', [i.after]))[0]?.p ?? 0 : (await q('select coalesce(max(position) + 1, 0) as p from task_items where list_id is not distinct from $1 and block_id is not distinct from $2 and parent_id is not distinct from $3', [i.list ?? null, block, i.parent ?? null]))[0].p;
      const time = /^\d{2}:\d{2}$/.test(i.due_time ?? '') ? i.due_time : null;
      const [it] = await q(`insert into task_items (id, workspace_id, list_id, block_id, parent_id, position, title, due_date, due_time, priority, private, notes, source_app, source_ref)
        values (coalesce($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, coalesce($10, 'normal'), coalesce($11, false), coalesce($12, ''), $13, $14) returning id`,
      [i.id ?? null, ctx.orgId, i.list ?? null, block, i.parent ?? null, pos, i.title.trim(), i.due_date ?? null, i.due_date ? time : null, i.priority ?? null, i.private ?? null, i.notes ?? null, i.source_app ?? null, i.source_ref ?? null]);
      if (i.assignees?.length) await setAssignees(q, ctx, it.id, i.assignees);
      return q(`select ${ITEM_COLS} from task_items i where i.id = $1`, [it.id]);
    },
  }),
  defineOperation({
    name: 'tasks.items.update', class: 'write', single: true,
    input: { id: ID, title: T(500), notes: T(20000), due_date: { type: 'date' }, clear_due: { type: 'bool' }, due_time: T(5), priority: { type: 'enum', values: ['normal', 'high'] }, private: { type: 'bool' },
      done: { type: 'bool' }, list: { type: 'uuid' }, to_inbox: { type: 'bool' }, block: { type: 'uuid' }, parent: { type: 'uuid' }, no_parent: { type: 'bool' }, position: { type: 'number', min: -1e9, max: 1e9 },
      assignees: { type: 'list', items: 'uuid', max: 50 }, project_task: { type: 'uuid' } },
    run: async (q, ctx, i) => {
      if (i.done === true) await q('update task_time_entries set ended_at = now() where item_id = $1 and user_id = private.current_user_id() and ended_at is null', [i.id]);   // completing stops its timer
      const moving = i.list !== undefined || i.to_inbox;
      const r = await q(`update task_items set title = coalesce(nullif($2, ''), title), notes = coalesce($3, notes),
          due_date = case when $5 then null else coalesce($4, due_date) end, due_time = case when $5 then null when $6::text = '' then null when $6 ~ '^[0-9]{2}:[0-9]{2}$' then $6::time else due_time end,
          priority = coalesce($7, priority), private = coalesce($8, private),
          done_at = case when $9::boolean is null then done_at when $9 then coalesce(done_at, now()) else null end,
          list_id = case when $11 then null when $10::uuid is not null then $10 else list_id end,
          block_id = case when $11 then null when $12::uuid is not null then $12 when $10::uuid is not null and $10 is distinct from list_id then (select id from task_blocks where list_id = $10 order by position limit 1) else block_id end,
          parent_id = case when $14 or ($10::uuid is not null and $10 is distinct from list_id) or $11 then null when $13::uuid is not null then $13 else parent_id end,
          position = coalesce($15, position), project_task_id = coalesce($16, project_task_id)
        where id = $1 returning id`,
      [i.id, i.title?.trim() ?? null, i.notes ?? null, i.due_date ?? null, i.clear_due ?? false, i.due_time ?? null, i.priority ?? null, i.private ?? null, i.done ?? null,
        i.list ?? null, i.to_inbox ?? false, i.block ?? null, i.parent ?? null, i.no_parent ?? false, i.position ?? null, i.project_task ?? null]);
      if (!r.length) return [];
      if (moving) await q('update task_items set list_id = (select list_id from task_items where id = $1), block_id = null where parent_id = $1', [i.id]);   // sub-tasks move with their parent
      if (i.assignees) await setAssignees(q, ctx, i.id, i.assignees);
      return q(`select ${ITEM_COLS} from task_items i where i.id = $1`, [i.id]);
    },
  }),
  defineOperation({ name: 'tasks.items.delete', class: 'write', single: true, input: { id: ID }, run: (q, _c, i) => q('delete from task_items where id = $1 returning id', [i.id]) }),
  // ---- Today, Upcoming, Inbox
  defineOperation({
    name: 'tasks.today', class: 'read', input: { today: { type: 'date' }, days: { type: 'int', min: 0, max: 60 } },
    run: (q, ctx, i) => q(`select ${ITEM_COLS}, l.name as list_name, l.colour as list_colour, l.icon as list_icon from task_items i left join task_lists l on l.id = i.list_id
      where i.workspace_id = $1 and i.done_at is null and i.due_date is not null and i.due_date <= $2::date + $3::int
        and (exists (select 1 from task_assignees a where a.item_id = i.id and a.user_id = private.current_user_id())
             or (i.created_by = private.current_user_id() and not exists (select 1 from task_assignees a where a.item_id = i.id)))
      order by i.due_date, i.due_time nulls last, i.position limit 300`, [ctx.orgId, today(i), i.days ?? 0]),
  }),
  defineOperation({ name: 'tasks.inbox', class: 'read',
    run: (q, ctx) => q(`select ${ITEM_COLS} from task_items i where i.workspace_id = $1 and i.list_id is null and i.done_at is null and i.created_by = private.current_user_id() order by i.created_at desc limit 300`, [ctx.orgId]) }),
  // ---- Teammates
  defineOperation({
    name: 'tasks.teammates', class: 'read',
    run: async (q, ctx) => {
      const [{ can }] = await q("select private.has_permission($1, 'tasks.teammates.view') as can", [ctx.orgId]);
      const people = await q('select user_id, display_name, email, role, is_you, has_photo from team_list() where not is_you');
      if (!can) return [{ can: false, people, stats: [] }];
      const ids = people.map((p) => p.user_id);
      const stats = ids.length ? await q(`select p.uid as user_id, (select count(*)::int from public.tasks_person_items(p.uid) x) as open,
        (select count(*)::int from public.tasks_person_items(p.uid) x where x.due_date <= current_date) as due_today from unnest($1::uuid[]) as p(uid)`, [ids]) : [];
      return [{ can: true, people, stats }];
    },
  }),
  defineOperation({
    name: 'tasks.person', class: 'read', single: true, input: { user: ID },
    run: async (q, _c, i) => {
      const [p] = await q('select user_id, display_name, email, role, has_photo from team_list() where user_id = $1', [i.user]); if (!p) return [];
      const [items, [{ n }]] = await Promise.all([q('select * from public.tasks_person_items($1)', [i.user]), q('select public.tasks_private_count($1) as n', [i.user])]);
      return [{ ...p, items, private_count: n }];
    },
  }),
  defineOperation({
    name: 'tasks.gave', class: 'read',
    run: (q, ctx) => q(`select i.id, i.title, i.due_date, i.done_at, a.user_id, l.name as list_name, l.id as list_id from task_assignees a join task_items i on i.id = a.item_id left join task_lists l on l.id = i.list_id
      where a.workspace_id = $1 and a.assigned_by = private.current_user_id() and a.user_id <> private.current_user_id() order by i.done_at nulls first, i.due_date nulls last limit 300`, [ctx.orgId]),
  }),
  // ---- timer: one per person across Tasks and Projects
  defineOperation({ name: 'tasks.timer.start', class: 'write', single: true, input: { item: ID },
    run: async (q, ctx, i) => { await stopTimers(q); await q('insert into task_time_entries (workspace_id, item_id) values ($1, $2)', [ctx.orgId, i.item]);
      return q('select e.id, e.item_id, e.started_at, i.title from task_time_entries e join task_items i on i.id = e.item_id where e.user_id = private.current_user_id() and e.ended_at is null'); } }),
  defineOperation({ name: 'tasks.timer.stop', class: 'write', single: true,
    run: (q) => q('update task_time_entries e set ended_at = now() from task_items i where i.id = e.item_id and e.user_id = private.current_user_id() and e.ended_at is null returning e.id, e.item_id, i.title, extract(epoch from (e.ended_at - e.started_at))::int as seconds') }),
  // the one running timer, whichever app started it (the shell's pill)
  defineOperation({ name: 'timer.running', class: 'read', single: true,
    run: (q) => q(`select 'tasks' as app, e.item_id as ref, i.title, e.started_at, '#/tasks/list/' || coalesce(i.list_id::text, 'inbox') as href from task_time_entries e join task_items i on i.id = e.item_id
        where e.user_id = private.current_user_id() and e.ended_at is null
      union all select 'projects', e.task_id, t.title, e.started_at, '#/projects/p/' || e.project_id::text || '/list?task=' || e.task_id::text from pm_time_entries e join pm_tasks t on t.id = e.task_id
        where e.user_id = private.current_user_id() and e.ended_at is null limit 1`) }),
  defineOperation({ name: 'timer.stop', class: 'write', run: async (q) => { await stopTimers(q); return [{ ok: true }]; } }),
];
