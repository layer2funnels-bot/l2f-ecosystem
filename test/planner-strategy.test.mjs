// Planner strategy app (migration 0033) through the shared API: the operations in packages/core/planner-strategy-operations.mjs
// call the planner_* functions as the signed-in person. Allow and deny per role, organization isolation, a strategy drawn and
// turned into a plan, and the browser roles kept out (the API is the only door).
import { randomUUID as id } from 'node:crypto';
import { openDb, migrate, session, recorder } from './lib.mjs';
import { createApi } from '../packages/core/api.mjs';
import { createPgExecutor } from '../packages/core/pg-executor.mjs';
import { createRateLimiter } from '../packages/core/rate-limit.mjs';
import { createSafeLogger } from '../packages/core/safe-log.mjs';

const db = await openDb(); await migrate(db);
const { asSuper } = session(db); const { results, check } = recorder();
const rows = async (s, p = []) => (await db.query(s, p)).rows;
let chain = Promise.resolve();
const acquire = () => { const prev = chain; let release; chain = new Promise((r) => { release = r; }); return prev.then(() => ({ query: (s, p) => db.query(s, p), release })); };
const BIG = { read: { max: 1e6, windowMs: 6e4 }, write: { max: 1e6, windowMs: 6e4 }, sensitive: { max: 1e6, windowMs: 6e4 } };
const api = createApi({ executor: createPgExecutor({ acquire, role: 'app_user' }), logger: createSafeLogger(() => {}), limiter: createRateLimiter({ limits: BIG }) });
const L = id(), A = id();
const call = async (fn, args, user, org = L) => {
  const r = await api.handle({ operation: `planner.strategy.${fn}`, input: { args }, auth: { userId: user, email: 'x@example.com' }, headers: { 'x-org-id': org } });
  return { status: r.status, ok: r.body?.ok, r: r.body?.data?.[0]?.r, code: r.body?.error?.code };
};

await asSuper();
const U = { OWN: id(), ADM: id(), ED: id(), VW: id(), NOAPP: id(), AOWN: id(), BOTH: id() };
await db.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','L'),($2,'aurj','A')", [L, A]);
const staff = (u, ws, r) => db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff',$3)", [ws, u, r]);
await staff(U.OWN, L, 'owner'); await staff(U.ADM, L, 'admin'); await staff(U.ED, L, 'editor'); await staff(U.VW, L, 'viewer'); await staff(U.NOAPP, L, 'editor'); await staff(U.AOWN, A, 'owner'); await staff(U.BOTH, L, 'owner'); await staff(U.BOTH, A, 'owner');
for (const u of [U.ED, U.VW]) await db.query("insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,'planner')", [L, u]);

// strategy drawn by an admin, then a plan from it
let x = await call('save_focus_template', { p_workspace: L, p_id: null, p_data: { name: 'Content creation', color: 'teal' } }, U.ADM); const ft = x.r?.id;
x = await call('save_strategy', { p_workspace: L, p_id: null, p_data: { name: 'Social growth', focus_ids: [ft] } }, U.ADM); const st = x.r?.id;
check('PS1', 'An admin creates a reusable focus area and a strategy through the API', x.status === 200 && !!ft && !!st);
x = await call('save_strategy_item', { p_workspace: L, p_id: null, p_data: { strategy_id: st, template_id: ft, item_kind: 'objective', title: 'Publish 30 videos' } }, U.ADM); const ob = x.r?.id;
await call('save_strategy_item', { p_workspace: L, p_id: null, p_data: { parent_id: ob, item_kind: 'kpi', title: 'Videos', target: 30, unit: 'videos' } }, U.ADM);
await call('save_strategy_item', { p_workspace: L, p_id: null, p_data: { parent_id: ob, item_kind: 'task', title: 'Write scripts' } }, U.ADM);
x = await call('save_plan', { p_workspace: L, p_id: null, p_data: { name: 'Q4 social', strategy_id: st } }, U.ADM); const plan = x.r?.id;
x = await call('get_plan', { p_plan: plan }, U.ED);
const g = x.r?.goals?.[0];
check('PS2', 'The plan starts with the strategy’s focus area, objective, KPI and task; an editor with the app grant reads it', x.r?.focus_areas?.length === 1 && x.r?.goals?.length === 1 && g?.title === 'Publish 30 videos' && g?.total_actions === 1 && g?.measure?.name === 'Videos');

// permissions
x = await call('save_strategy', { p_workspace: L, p_id: null, p_data: { name: 'Nope' } }, U.ED);
check('PS3', 'An editor cannot change the strategy model', !x.ok);
x = await call('save_goal', { p_plan: plan, p_id: null, p_data: { title: 'Viewer goal', focus_area_id: x.r?.id ?? null } }, U.VW);
check('PS4', 'A viewer cannot add objectives', !x.ok);
x = await call('list_plans', { p_workspace: L }, U.NOAPP);
check('PS5', 'A member without the Planner grant sees no plans', x.ok && Array.isArray(x.r) && x.r.length === 0);

// organizations
x = await call('get_plan', { p_plan: plan }, U.AOWN, A);
check('PS6', 'Another organization’s owner cannot read the plan', x.ok && x.r === null);
x = await call('list_plans', { p_workspace: L }, U.AOWN, A);
check('PS7', 'An argument naming another organization than x-org-id is refused', !x.ok);
x = await call('save_plan', { p_workspace: L, p_id: null, p_data: { name: 'Intrusion' } }, U.AOWN, L);
check('PS8', 'A non-member cannot act in the organization even with its id in x-org-id', !x.ok);
x = await api.handle({ operation: 'planner.strategy.get_plan', input: { args: { p_plan: plan, p_extra: 1 } }, auth: { userId: U.ED, email: 'x@example.com' }, headers: { 'x-org-id': L } });
check('PS9', 'Unknown arguments are refused', x.body?.ok === false);

// a person who belongs to BOTH organizations sees only the organization named by x-org-id (the restrictive org_scope policy; WCIGA)
x = await call('get_plan', { p_plan: plan }, U.BOTH, L);
check('PS11', 'A member of both organizations reads the plan when the request names its organization', x.ok && x.r?.plan?.name === 'Q4 social' || x.ok && !!x.r);
x = await call('get_plan', { p_plan: plan }, U.BOTH, A);
check('PS12', 'The same person, with the other organization named, gets nothing of it (id-only operations included)', x.ok && x.r === null);
x = await call('list_plans', { p_workspace: A }, U.BOTH, A);
check('PS13', 'And the other organization’s plan list is empty', x.ok && Array.isArray(x.r) && x.r.length === 0);
const orgScoped = await rows("select count(*)::int n from pg_policies where schemaname = 'public' and tablename like 'planner\\_%' and policyname = 'org_scope' and tablename not in ('planner_objectives', 'planner_measures', 'planner_measure_values', 'planner_objective_tasks', 'planner_reviews')");
const planTables = await rows("select count(*)::int n from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and c.relkind = 'r' and c.relname like 'planner\\_%' and c.relname not in ('planner_objectives', 'planner_measures', 'planner_measure_values', 'planner_objective_tasks', 'planner_reviews')");
check('PS14', 'Every Planner strategy table carries the org_scope policy', orgScoped[0].n === planTables[0].n && planTables[0].n >= 25);

// array arguments reach the database as arrays, and a bad request is a 422, not a server error
x = await call('get_plan', { p_plan: plan }, U.ADM);
const faIds = (x.r?.focus_areas ?? []).map((f) => f.id);
x = await call('reorder', { p_entity: 'focus_areas', p_ids: faIds }, U.ADM);
check('PS15', 'Reordering with a list of ids works (uuid[] parameter)', x.status === 200 && x.ok);
x = await call('move_goal', { p_goal: g.id, p_focus: faIds[0], p_parent: null, p_siblings: [] }, U.ADM);
check('PS16', 'Moving an objective with an empty sibling list works', x.status === 200 && x.ok);
x = await api.handle({ operation: 'planner.strategy.get_plan', input: { args: { p_plan: plan, p_extra: 1 } }, auth: { userId: U.ED, email: 'x@example.com' }, headers: { 'x-org-id': L } });
check('PS17', 'An unknown argument is a 422 (invalid), not a 500', x.status === 422);
const fkParent = await rows("select count(*)::int n from pg_constraint where conrelid = 'public.planner_strategy_items'::regclass and contype = 'f' and pg_get_constraintdef(oid) like 'FOREIGN KEY (workspace_id, parent_id)%'");
const fkFocus = await rows("select count(*)::int n from pg_constraint where conrelid in ('public.planner_strategy_items'::regclass, 'public.planner_strategy_focus_kinds'::regclass) and contype = 'f' and pg_get_constraintdef(oid) like 'FOREIGN KEY (workspace_id, strategy_id, template_id)%'");
check('PS18', 'Strategy items and focus kinds are tied to their workspace by composite keys', fkParent[0].n === 1 && fkFocus[0].n === 2);

// the API is the only door
const grants = await rows("select count(*)::int n from information_schema.role_table_grants where grantee in ('anon','authenticated') and table_name like 'planner_%'");
const fns = await rows("select count(*)::int n from information_schema.role_routine_grants where grantee in ('anon','authenticated') and routine_name like 'planner_%'");
check('PS10', 'Browser roles have no access to any Planner table or function', grants[0].n === 0 && fns[0].n === 0);

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'}  ${r.id.padEnd(5)} ${r.name}${r.ok ? '' : '  ' + r.detail}`);
console.log(`${results.length - failed.length}/${results.length} checks passed`);
await db.close();
process.exit(failed.length ? 1 : 0);
