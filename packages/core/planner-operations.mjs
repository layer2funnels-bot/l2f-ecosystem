// Planner API operations (migration 0015): objectives, measures with a value history, links to Projects tasks, reviews, and an overview.
// Same conventions as the other operation files: column names are constants, permissions are decided by row policies and triggers in the
// database, a refusal reads as "not found". Data and API only: the screens come with their own design.
import { defineOperation } from './define.mjs';

const T = (max = 8000) => ({ type: 'text', min: 0, max });
const id = { id: { type: 'uuid', required: true } };
const NUM = (extra = {}) => ({ type: 'number', min: -1e12, max: 1e12, ...extra });
const like = (q) => `%${String(q).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
const HEALTH = { type: 'enum', values: ['on_track', 'at_risk', 'off_track'] };

// a measure with its latest recorded value and how far it has come (0 to 1, in whichever direction target lies from start)
const MBASE = `select m.id, m.objective_id, m.client_id, m.name, m.unit, m.start_value::float8 as start_value, m.target_value::float8 as target_value, m.due_on, m.archived_at, m.created_at, m.updated_at,
    cv.value::float8 as current_value, cv.recorded_at as last_recorded_at,
    least(1, greatest(0, (coalesce(cv.value, m.start_value) - m.start_value) / (m.target_value - m.start_value)))::float8 as progress
  from planner_measures m left join lateral (select v.value, v.recorded_at from planner_measure_values v where v.measure_id = m.id order by v.recorded_at desc, v.id desc limit 1) cv on true`;
const OSELECT = `select o.id, o.client_id, o.owner_id, o.title, o.description, o.status, o.health, o.period_start, o.period_end, o.archived_at, o.created_at, o.updated_at,
    (select count(*)::int from planner_measures m where m.objective_id = o.id and m.archived_at is null) as measures,
    (select count(*)::int from planner_objective_tasks l where l.objective_id = o.id) as tasks,
    (select avg(x.progress)::float8 from (${MBASE} where m.objective_id = o.id and m.archived_at is null) x) as progress
  from planner_objectives o`;

const OBJ = { title: { type: 'text', required: true, max: 300 }, description: T(8000), status: { type: 'enum', values: ['planned', 'active', 'achieved', 'dropped'] }, health: HEALTH, owner: { type: 'uuid' }, period_start: { type: 'date' }, period_end: { type: 'date' } };
const OCOL = { title: 'title', description: 'description', status: 'status', health: 'health', owner: 'owner_id', period_start: 'period_start', period_end: 'period_end' };

const objectiveOps = [
  defineOperation({
    name: 'planner.objectives.list', class: 'read',
    input: { client: { type: 'uuid' }, status: OBJ.status, health: HEALTH, owner: { type: 'uuid' }, archived: { type: 'bool' }, q: { type: 'text', max: 100 } },
    run: (q, _c, i) => q(`${OSELECT} where ($1::uuid is null or o.client_id = $1) and ($2::text is null or o.status = $2) and ($3::text is null or o.health = $3) and ($4::uuid is null or o.owner_id = $4)
      and ((o.archived_at is not null) = $5) and ($6::text is null or o.title ilike $6) order by o.period_end nulls last, o.title limit 200`,
    [i.client ?? null, i.status ?? null, i.health ?? null, i.owner ?? null, i.archived ?? false, i.q ? like(i.q) : null]),
  }),
  defineOperation({ name: 'planner.objectives.get', class: 'read', single: true, input: id, run: (q, _c, i) => q(`${OSELECT} where o.id = $1`, [i.id]) }),
  defineOperation({
    name: 'planner.objectives.create', class: 'write', single: true, input: { ...OBJ, client: { type: 'uuid' } },
    run: async (q, ctx, i) => {
      const used = Object.keys(OCOL).filter((k) => i[k] !== undefined);
      const [r] = await q(`insert into planner_objectives (workspace_id, client_id${used.map((k) => `, ${OCOL[k]}`).join('')}) values ($1, $2${used.map((_, n) => `, $${n + 3}`).join('')}) returning id`, [ctx.orgId, i.client ?? null, ...used.map((k) => i[k])]);
      return q(`${OSELECT} where o.id = $1`, [r.id]);
    },
  }),
  defineOperation({
    name: 'planner.objectives.update', class: 'write', single: true, input: { ...id, ...Object.fromEntries(Object.entries(OBJ).map(([k, f]) => [k, { ...f, required: false }])), clear_health: { type: 'bool' } },
    run: async (q, _c, i) => {
      const used = Object.keys(OCOL).filter((k) => i[k] !== undefined); const sets = used.map((k, n) => `${OCOL[k]} = $${n + 2}`);
      if (i.clear_health) sets.push('health = null');
      if (sets.length && !(await q(`update planner_objectives set ${sets.join(', ')} where id = $1 returning id`, [i.id, ...used.map((k) => i[k])])).length) return [];
      return q(`${OSELECT} where o.id = $1`, [i.id]);
    },
  }),
  defineOperation({ name: 'planner.objectives.archive', class: 'write', single: true, input: id, run: (q, _c, i) => q('update planner_objectives set archived_at = now() where id = $1 and archived_at is null returning id, archived_at', [i.id]) }),
  defineOperation({ name: 'planner.objectives.restore', class: 'write', single: true, input: id, run: (q, _c, i) => q('update planner_objectives set archived_at = null where id = $1 and archived_at is not null returning id, archived_at', [i.id]) }),
  defineOperation({ name: 'planner.objectives.delete', class: 'write', single: true, input: id, run: (q, _c, i) => q('delete from planner_objectives where id = $1 returning id', [i.id]) }),
];

const measureOps = [
  defineOperation({ name: 'planner.measures.list', class: 'read', input: { objective: { type: 'uuid', required: true }, archived: { type: 'bool' } }, run: (q, _c, i) => q(`${MBASE} where m.objective_id = $1 and ((m.archived_at is not null) = $2) order by m.created_at`, [i.objective, i.archived ?? false]) }),
  defineOperation({ name: 'planner.measures.get', class: 'read', single: true, input: id, run: (q, _c, i) => q(`${MBASE} where m.id = $1`, [i.id]) }),
  defineOperation({
    name: 'planner.measures.create', class: 'write', single: true,
    input: { objective: { type: 'uuid', required: true }, name: { type: 'text', required: true, max: 200 }, unit: { type: 'text', min: 0, max: 20 }, start_value: NUM(), target_value: NUM({ required: true }), due_on: { type: 'date' } },
    run: async (q, ctx, i) => {
      const [r] = await q('insert into planner_measures (workspace_id, objective_id, name, unit, start_value, target_value, due_on) values ($1,$2,$3,$4,$5,$6,$7) returning id', [ctx.orgId, i.objective, i.name, i.unit ?? null, i.start_value ?? 0, i.target_value, i.due_on ?? null]);
      return q(`${MBASE} where m.id = $1`, [r.id]);
    },
  }),
  defineOperation({
    name: 'planner.measures.update', class: 'write', single: true,
    input: { ...id, name: { type: 'text', max: 200 }, unit: { type: 'text', min: 0, max: 20 }, start_value: NUM(), target_value: NUM(), due_on: { type: 'date' }, clear_due: { type: 'bool' } },
    run: async (q, _c, i) => {
      const rows = await q(`update planner_measures set name = coalesce($2, name), unit = coalesce($3, unit), start_value = coalesce($4, start_value), target_value = coalesce($5, target_value),
        due_on = case when $7 then null else coalesce($6, due_on) end where id = $1 returning id`, [i.id, i.name ?? null, i.unit ?? null, i.start_value ?? null, i.target_value ?? null, i.due_on ?? null, i.clear_due ?? false]);
      return rows.length ? q(`${MBASE} where m.id = $1`, [i.id]) : [];
    },
  }),
  defineOperation({ name: 'planner.measures.archive', class: 'write', single: true, input: id, run: (q, _c, i) => q('update planner_measures set archived_at = now() where id = $1 and archived_at is null returning id, archived_at', [i.id]) }),
  defineOperation({ name: 'planner.measures.restore', class: 'write', single: true, input: id, run: (q, _c, i) => q('update planner_measures set archived_at = null where id = $1 and archived_at is not null returning id, archived_at', [i.id]) }),
  defineOperation({ name: 'planner.measures.delete', class: 'write', single: true, input: id, run: (q, _c, i) => q('delete from planner_measures where id = $1 returning id', [i.id]) }),
  defineOperation({
    // record a new value (the time is the server's); the measure's current value is always the latest one recorded
    name: 'planner.measures.record', class: 'write', single: true, input: { ...id, value: NUM({ required: true }), note: T(300) },
    run: async (q, ctx, i) => {
      if (!(await q('select id from planner_measures where id = $1 and archived_at is null', [i.id])).length) return [];
      await q('insert into planner_measure_values (workspace_id, measure_id, value, note) values ($1,$2,$3,$4)', [ctx.orgId, i.id, i.value, i.note ?? null]);
      return q(`${MBASE} where m.id = $1`, [i.id]);
    },
  }),
  defineOperation({
    name: 'planner.measures.history', class: 'read', input: { id: { type: 'uuid', required: true }, limit: { type: 'int', min: 1, max: 500 } },
    run: (q, _c, i) => q('select id, measure_id, value::float8 as value, note, recorded_by, recorded_at from planner_measure_values where measure_id = $1 order by recorded_at desc, id desc limit $2', [i.id, i.limit ?? 100]),
  }),
];

// actions that serve an objective: Projects tasks, by reference (the task stays where it is)
const linkOps = [
  defineOperation({
    name: 'planner.links.list', class: 'read', input: { objective: { type: 'uuid', required: true } },
    run: (q, _c, i) => q(`select l.objective_id, l.task_id, t.title, t.status, t.priority, t.due_on, t.assignee_id, t.project_id, p.name as project_name, t.archived_at
      from planner_objective_tasks l join project_tasks t on t.workspace_id = l.workspace_id and t.id = l.task_id join projects p on p.workspace_id = t.workspace_id and p.id = t.project_id
      where l.objective_id = $1 order by t.due_on nulls last, t.title`, [i.objective]),
  }),
  defineOperation({
    name: 'planner.links.add', class: 'write', single: true, input: { objective: { type: 'uuid', required: true }, task: { type: 'uuid', required: true } },
    run: (q, ctx, i) => q('insert into planner_objective_tasks (workspace_id, objective_id, task_id) values ($1,$2,$3) on conflict do nothing returning objective_id, task_id', [ctx.orgId, i.objective, i.task]),
  }),
  defineOperation({ name: 'planner.links.remove', class: 'write', single: true, input: { objective: { type: 'uuid', required: true }, task: { type: 'uuid', required: true } }, run: (q, _c, i) => q('delete from planner_objective_tasks where objective_id = $1 and task_id = $2 returning objective_id, task_id', [i.objective, i.task]) }),
];

const REV = {
  title: { type: 'text', required: true, max: 200 }, period_start: { type: 'date' }, period_end: { type: 'date' }, due_on: { type: 'date' }, rating: HEALTH,
  summary: T(10000), wins: T(10000), issues: T(10000), next_steps: T(10000),
};
const RCOL = Object.keys(REV);
const reviewOps = [
  defineOperation({
    name: 'planner.reviews.list', class: 'read',
    input: { objective: { type: 'uuid' }, client: { type: 'uuid' }, status: { type: 'enum', values: ['scheduled', 'done'] }, archived: { type: 'bool' }, due_within_days: { type: 'int', min: 0, max: 365 } },
    run: (q, _c, i) => q(`select id, client_id, objective_id, title, period_start, period_end, due_on, status, rating, completed_at, archived_at, created_at, updated_at from planner_reviews
      where ($1::uuid is null or objective_id = $1) and ($2::uuid is null or client_id = $2) and ($3::text is null or status = $3) and ((archived_at is not null) = $4)
        and ($5::int is null or (due_on is not null and due_on <= current_date + $5::int)) order by due_on nulls last, created_at desc limit 200`,
    [i.objective ?? null, i.client ?? null, i.status ?? null, i.archived ?? false, i.due_within_days ?? null]),
  }),
  defineOperation({ name: 'planner.reviews.get', class: 'read', single: true, input: id, run: (q, _c, i) => q('select * from planner_reviews where id = $1', [i.id]) }),
  defineOperation({
    name: 'planner.reviews.create', class: 'write', single: true, input: { ...REV, objective: { type: 'uuid' }, client: { type: 'uuid' } },
    run: (q, ctx, i) => {
      const used = RCOL.filter((c) => i[c] !== undefined);
      return q(`insert into planner_reviews (workspace_id, objective_id, client_id${used.map((c) => `, ${c}`).join('')}) values ($1, $2, $3${used.map((_, n) => `, $${n + 4}`).join('')}) returning *`, [ctx.orgId, i.objective ?? null, i.client ?? null, ...used.map((c) => i[c])]);
    },
  }),
  defineOperation({
    name: 'planner.reviews.update', class: 'write', single: true, input: { ...id, ...Object.fromEntries(Object.entries(REV).map(([k, f]) => [k, { ...f, required: false }])) },
    run: (q, _c, i) => {
      const used = RCOL.filter((c) => i[c] !== undefined);
      if (!used.length) return q('select * from planner_reviews where id = $1', [i.id]);
      return q(`update planner_reviews set ${used.map((c, n) => `${c} = $${n + 2}`).join(', ')} where id = $1 returning *`, [i.id, ...used.map((c) => i[c])]);
    },
  }),
  defineOperation({ name: 'planner.reviews.complete', class: 'write', single: true, input: { ...id, rating: HEALTH }, run: (q, _c, i) => q("update planner_reviews set status = 'done', rating = coalesce($2, rating) where id = $1 and status <> 'done' returning *", [i.id, i.rating ?? null]) }),
  defineOperation({ name: 'planner.reviews.archive', class: 'write', single: true, input: id, run: (q, _c, i) => q('update planner_reviews set archived_at = now() where id = $1 and archived_at is null returning id, archived_at', [i.id]) }),
  defineOperation({ name: 'planner.reviews.restore', class: 'write', single: true, input: id, run: (q, _c, i) => q('update planner_reviews set archived_at = null where id = $1 and archived_at is not null returning id, archived_at', [i.id]) }),
  defineOperation({ name: 'planner.reviews.delete', class: 'write', single: true, input: id, run: (q, _c, i) => q('delete from planner_reviews where id = $1 returning id', [i.id]) }),
];

const overviewOps = [
  defineOperation({
    // what the Planner home needs in one call: objectives by status and health, reviews coming up, and how many are overdue
    name: 'planner.overview', class: 'read', input: { days: { type: 'int', min: 1, max: 90 } },
    run: (q, _c, i) => q(`select
        (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*)::int n from planner_objectives where archived_at is null group by status) s) as by_status,
        (select coalesce(jsonb_object_agg(health, n), '{}'::jsonb) from (select health, count(*)::int n from planner_objectives where archived_at is null and status = 'active' and health is not null group by health) h) as by_health,
        (select count(*)::int from planner_reviews where archived_at is null and status = 'scheduled' and due_on is not null and due_on < current_date) as reviews_overdue,
        (select count(*)::int from planner_reviews where archived_at is null and status = 'scheduled' and due_on between current_date and current_date + $1::int) as reviews_due,
        (select min(due_on) from planner_reviews where archived_at is null and status = 'scheduled' and due_on >= current_date) as next_review_on`, [i.days ?? 14]),
  }),
];

export const plannerOperations = [...objectiveOps, ...measureOps, ...linkOps, ...reviewOps, ...overviewOps];
