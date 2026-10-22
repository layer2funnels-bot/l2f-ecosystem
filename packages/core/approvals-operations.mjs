// Approvals API (migration 0017): request, decide, withdraw, resubmit, list and history. Permissions and the rules (decided once, by someone else,
// subject must exist, one pending request per item) live in the database; a refusal reads as "not found". Data and API only.
import { defineOperation } from './define.mjs';

const T = (max = 4000) => ({ type: 'text', min: 0, max });
const id = { id: { type: 'uuid', required: true } };
const SUBJECTS = ['deliverable', 'file', 'document', 'project', 'task', 'funnel_record', 'form', 'post', 'other'];
const COLS = `a.id, a.subject_type, a.subject_id, a.client_id, a.title, a.note, a.status, a.version, a.requested_by, a.decided_by, a.decided_at, a.decision_note, a.due_on, a.client_visible, a.previous_id, a.created_at, a.updated_at`;
const SELECT = `select ${COLS} from approvals a`;

export const approvalsOperations = [
  defineOperation({
    name: 'approvals.list', class: 'read',
    input: { status: { type: 'enum', values: ['pending', 'approved', 'rejected', 'withdrawn'] }, subject_type: { type: 'enum', values: SUBJECTS }, subject: { type: 'uuid' }, client: { type: 'uuid' },
      mine: { type: 'enum', values: ['requested', 'to_decide'] } },
    run: (q, ctx, i) => q(`${SELECT} where ($1::text is null or a.status = $1) and ($2::text is null or a.subject_type = $2) and ($3::uuid is null or a.subject_id = $3) and ($4::uuid is null or a.client_id = $4)
      and ($5::text is null or ($5 = 'requested' and a.requested_by = $6) or ($5 = 'to_decide' and a.status = 'pending' and a.requested_by <> $6))
      order by (a.status = 'pending') desc, a.created_at desc limit 200`, [i.status ?? null, i.subject_type ?? null, i.subject ?? null, i.client ?? null, i.mine ?? null, ctx.userId]),
  }),
  defineOperation({
    name: 'approvals.get', class: 'read', single: true, input: id,
    run: (q, _c, i) => q(`select ${COLS}, coalesce((select json_agg(json_build_object('version', e.version, 'event', e.event, 'actor_id', e.actor_id, 'note', e.note, 'at', e.at) order by e.id)
      from approval_events e where e.workspace_id = a.workspace_id and e.approval_id = a.id), '[]'::json) as events from approvals a where a.id = $1`, [i.id]),
  }),
  defineOperation({
    name: 'approvals.request', class: 'write', single: true,
    input: { subject_type: { type: 'enum', values: SUBJECTS, required: true }, subject: { type: 'uuid', required: true }, title: { type: 'text', required: true, max: 200 }, note: T(), client: { type: 'uuid' },
      due_on: { type: 'date' }, client_visible: { type: 'bool' }, previous: { type: 'uuid' } },
    run: async (q, ctx, i) => {
      const [r] = await q(`insert into approvals (workspace_id, subject_type, subject_id, requested_by, title, note, client_id, due_on, client_visible, previous_id)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
      [ctx.orgId, i.subject_type, i.subject, ctx.userId, i.title, i.note ?? null, i.client ?? null, i.due_on ?? null, i.client_visible ?? false, i.previous ?? null]);
      return q(`${SELECT} where a.id = $1`, [r.id]);
    },
  }),
  defineOperation({
    name: 'approvals.decide', class: 'sensitive', single: true, input: { ...id, decision: { type: 'enum', values: ['approved', 'rejected'], required: true }, note: T() },
    run: (q, _c, i) => q(`update approvals set status = $2, decision_note = $3 where id = $1 and status = 'pending' returning id, status, decided_by, decided_at`, [i.id, i.decision, i.note ?? null]),
  }),
  defineOperation({
    name: 'approvals.withdraw', class: 'write', single: true, input: id,
    run: (q, _c, i) => q(`update approvals set status = 'withdrawn' where id = $1 and status = 'pending' returning id, status, decided_at`, [i.id]),
  }),
];
