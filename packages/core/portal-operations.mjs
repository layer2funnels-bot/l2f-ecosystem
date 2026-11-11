// Client Portal API (migration 0018). The `portal.*` operations are the ONLY ones a client account may call (audience 'client', migration 0016):
// each is a projection that selects named columns, so no internal field can appear, and row security still limits every row to the caller's own
// client and to what staff shared. `portal.staff.*` are the staff side of the messages. OFF until the owner switches the Portal on (gate G2).
import { defineOperation } from './define.mjs';

const C = (o) => defineOperation({ audience: 'client', ...o });
const id = { id: { type: 'uuid', required: true } };
const ST = ['request', 'file', 'approval', 'project'];
const MSG = { subject_type: { type: 'enum', values: ST, required: true }, subject: { type: 'uuid', required: true } };
const MSG_COLS = 'm.id, m.subject_type, m.subject_id, m.author_kind, m.body, m.created_at';

export const portalOperations = [
  C({ name: 'portal.me', class: 'read', single: true, run: (q) => q('select c.id, c.name from clients c') }),
  C({
    name: 'portal.home', class: 'read', single: true,
    run: (q) => q(`select
      (select count(*)::int from client_requests r where r.status = 'open' and r.client_visible and r.archived_at is null) as open_requests,
      (select count(*)::int from approvals a where a.status = 'pending' and a.client_visible) as pending_approvals,
      (select count(*)::int from client_updates u where u.client_visible and u.archived_at is null) as updates,
      (select count(*)::int from files f where f.client_visible and f.archived_at is null) as files,
      (select count(*)::int from pm_projects p where p.client_visible and p.archived_at is null and p.deleted_at is null) as projects,
      (select count(*)::int from pm_tasks t where t.client_visible and t.deleted_at is null and t.status <> 'done') as open_tasks`),
  }),
  C({ name: 'portal.updates.list', class: 'read', run: (q) => q('select u.id, u.title, u.body, u.created_at from client_updates u where u.client_visible and u.archived_at is null order by u.created_at desc limit 100') }),
  C({
    name: 'portal.requests.list', class: 'read', input: { status: { type: 'enum', values: ['open', 'answered', 'closed'] } },
    run: (q, _c, i) => q(`select r.id, r.kind, r.title, r.body, r.status, r.response, r.due_on, r.created_at, r.updated_at from client_requests r
      where r.client_visible and r.archived_at is null and ($1::text is null or r.status = $1) order by (r.status = 'open') desc, r.created_at desc limit 100`, [i.status ?? null]),
  }),
  C({
    name: 'portal.requests.answer', class: 'write', single: true, input: { ...id, response: { type: 'text', required: true, max: 8000 } },
    run: (q, _c, i) => q(`update client_requests set response = $2, status = 'answered' where id = $1 and client_visible and archived_at is null and status = 'open' returning id, status, updated_at`, [i.id, i.response]),
  }),
  C({ name: 'portal.projects.list', class: 'read', run: (q) => q(`select p.id, p.name, case p.status when 'complete' then 'done' when 'on_hold' then 'on_hold' else 'active' end as status, p.start_on, p.due_on
    from pm_projects p where p.client_visible and p.archived_at is null and p.deleted_at is null order by p.due_on nulls last, p.name limit 100`) }),
  C({
    name: 'portal.tasks.list', class: 'read', input: { project: { type: 'uuid' } },
    run: (q, _c, i) => q(`select t.id, t.project_id, t.title, case t.status when 'in_progress' then 'doing' when 'in_review' then 'doing' else t.status end as status, t.due_on, t.completed_at
      from pm_tasks t where t.client_visible and t.deleted_at is null and ($1::uuid is null or t.project_id = $1) order by t.due_on nulls last, t.position, t.title limit 200`, [i.project ?? null]),
  }),
  C({ name: 'portal.files.list', class: 'read', run: (q) => q('select f.id, f.name, f.kind, f.mime_type, f.size_bytes, f.created_at from files f where f.client_visible and f.archived_at is null order by f.created_at desc limit 200') }),
  C({
    name: 'portal.approvals.list', class: 'read', input: { status: { type: 'enum', values: ['pending', 'approved', 'rejected', 'withdrawn'] } },
    run: (q, _c, i) => q(`select a.id, a.subject_type, a.title, a.note, a.status, a.version, a.due_on, a.created_at, a.decided_at, a.decision_note from approvals a
      where a.client_visible and ($1::text is null or a.status = $1) order by (a.status = 'pending') desc, a.created_at desc limit 100`, [i.status ?? null]),
  }),
  C({
    name: 'portal.approvals.decide', class: 'sensitive', single: true, input: { ...id, decision: { type: 'enum', values: ['approved', 'rejected'], required: true }, note: { type: 'text', min: 0, max: 4000 } },
    run: (q, _c, i) => q(`update approvals set status = $2, decision_note = $3 where id = $1 and client_visible and status = 'pending' returning id, status, decided_at`, [i.id, i.decision, i.note ?? null]),
  }),
  C({
    name: 'portal.messages.list', class: 'read', input: MSG,
    run: (q, _c, i) => q(`select ${MSG_COLS} from portal_messages m where m.subject_type = $1 and m.subject_id = $2 order by m.created_at, m.id limit 200`, [i.subject_type, i.subject]),
  }),
  C({
    name: 'portal.messages.send', class: 'write', single: true, input: { ...MSG, body: { type: 'text', required: true, max: 4000 } },
    run: async (q, ctx, i) => {
      const [r] = await q('insert into portal_messages (workspace_id, subject_type, subject_id, author_id, author_kind, body, client_id) values ($1, $2, $3, $4, \'client\', $5, $6) returning id',
        [ctx.orgId, i.subject_type, i.subject, ctx.userId, i.body, '00000000-0000-0000-0000-000000000000']);
      return q(`select ${MSG_COLS} from portal_messages m where m.id = $1`, [r.id]);
    },
  }),

  // staff side: read and write the same threads (requires the Portal to be ON and the portal.message.* permissions)
  defineOperation({
    name: 'portal.staff.messages.list', class: 'read', input: { ...MSG, subject_type: { ...MSG.subject_type, required: false }, subject: { type: 'uuid' }, client: { type: 'uuid' } },
    run: (q, _c, i) => q(`select ${MSG_COLS}, m.client_id, m.author_id from portal_messages m where ($1::text is null or m.subject_type = $1) and ($2::uuid is null or m.subject_id = $2) and ($3::uuid is null or m.client_id = $3)
      order by m.created_at desc, m.id limit 200`, [i.subject_type ?? null, i.subject ?? null, i.client ?? null]),
  }),
  defineOperation({
    name: 'portal.staff.messages.send', class: 'write', single: true, input: { ...MSG, body: { type: 'text', required: true, max: 4000 } },
    run: async (q, ctx, i) => {
      const [r] = await q('insert into portal_messages (workspace_id, subject_type, subject_id, author_id, author_kind, body, client_id) values ($1, $2, $3, $4, \'staff\', $5, $6) returning id',
        [ctx.orgId, i.subject_type, i.subject, ctx.userId, i.body, '00000000-0000-0000-0000-000000000000']);
      return q(`select ${MSG_COLS}, m.client_id from portal_messages m where m.id = $1`, [r.id]);
    },
  }),
];
