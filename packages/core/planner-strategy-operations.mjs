// Planner (strategy) API: one operation per public.planner_* function of migration 0033, so the app's typed client
// (apps/planner/src/api/client.ts) reaches the database through the shared, permission-checked API like every other app.
// The functions are security invoker: row policies decide, a refusal reads as "not found". An argument naming an
// organization must be the request's own organization (x-org-id), so a call can never reach into another one.
import { defineOperation } from './define.mjs';

const FUNCTIONS = [
  ['planner_members', 'read', ['p_workspace']],
  ['planner_my_access', 'read', ['p_workspace']],
  ['planner_list_plans', 'read', ['p_workspace', 'p_include_archived']],
  ['planner_get_plan', 'read', ['p_plan']],
  ['planner_get_goal', 'read', ['p_goal']],
  ['planner_my_work', 'read', ['p_workspace']],
  ['planner_search', 'read', ['p_workspace', 'p_query']],
  ['planner_get_review', 'read', ['p_review']],
  ['planner_list_views', 'read', ['p_plan']],
  ['planner_save_plan', 'write', ['p_workspace', 'p_id', 'p_data', 'p_expected']],
  ['planner_set_plan_archived', 'write', ['p_plan', 'p_archived']],
  ['planner_save_value', 'write', ['p_plan', 'p_id', 'p_data']],
  ['planner_delete_value', 'write', ['p_id']],
  ['planner_save_focus_area', 'write', ['p_plan', 'p_id', 'p_data']],
  ['planner_set_focus_archived', 'write', ['p_id', 'p_archived']],
  ['planner_reorder', 'write', ['p_entity', 'p_ids']],
  ['planner_save_goal_type', 'write', ['p_workspace', 'p_id', 'p_data']],
  ['planner_delete_goal_type', 'write', ['p_id']],
  ['planner_save_goal', 'write', ['p_plan', 'p_id', 'p_data', 'p_expected']],
  ['planner_move_goal', 'write', ['p_goal', 'p_focus', 'p_parent', 'p_siblings']],
  ['planner_set_goal_archived', 'write', ['p_goal', 'p_archived']],
  ['planner_delete_goal', 'write', ['p_goal']],
  ['planner_post_update', 'write', ['p_goal', 'p_data']],
  ['planner_save_measure', 'write', ['p_goal', 'p_id', 'p_data']],
  ['planner_record_reading', 'write', ['p_measure', 'p_value', 'p_recorded_on', 'p_note']],
  ['planner_save_action', 'write', ['p_goal', 'p_id', 'p_data']],
  ['planner_save_risk', 'write', ['p_goal', 'p_id', 'p_data']],
  ['planner_add_comment', 'write', ['p_goal', 'p_body']],
  ['planner_edit_comment', 'write', ['p_id', 'p_body']],
  ['planner_delete_comment', 'write', ['p_id']],
  ['planner_save_review', 'write', ['p_plan', 'p_id', 'p_data']],
  ['planner_hold_review', 'write', ['p_review', 'p_summary', 'p_decisions']],
  ['planner_toggle_favorite', 'write', ['p_plan', 'p_on']],
  ['planner_save_view', 'write', ['p_plan', 'p_name', 'p_config']],
  ['planner_delete_view', 'write', ['p_id']],
  ['planner_get_model', 'read', ['p_workspace']],
  ['planner_save_type_rules', 'write', ['p_workspace', 'p_rules']],
  ['planner_save_horizon', 'write', ['p_workspace', 'p_id', 'p_data']],
  ['planner_delete_horizon', 'write', ['p_id']],
  ['planner_save_focus_template', 'write', ['p_workspace', 'p_id', 'p_data']],
  ['planner_delete_focus_template', 'write', ['p_id']],
  ['planner_save_strategy', 'write', ['p_workspace', 'p_id', 'p_data']],
  ['planner_delete_strategy', 'write', ['p_id']],
  ['planner_save_measure_type', 'write', ['p_workspace', 'p_id', 'p_data']],
  ['planner_delete_measure_type', 'write', ['p_id']],
  ['planner_save_strategy_item', 'write', ['p_workspace', 'p_id', 'p_data']],
  ['planner_delete_strategy_item', 'write', ['p_id']],
];

const ORG_ARGS = new Set(['p_workspace']);
const ARRAY_ARGS = new Set(['p_ids', 'p_siblings']);   // uuid[] parameters: sent as a real array; the other objects (p_data, p_rules ...) are jsonb text
export const plannerStrategyOperations = FUNCTIONS.map(([fn, cls, params]) => defineOperation({
  name: `planner.strategy.${fn.replace(/^planner_/, '')}`,
  class: cls,
  input: { args: { type: 'json', max: 200000 } },
  run: async (q, ctx, i) => {
    const args = i.args ?? {};
    const unknown = Object.keys(args).filter((k) => !params.includes(k));
    if (unknown.length) throw { code: 'P0001', message: 'unknown argument' };   // a bad request (422), not a server error
    for (const k of Object.keys(args)) if (ORG_ARGS.has(k) && args[k] !== ctx.orgId) throw { code: '42501' };
    const names = params.filter((k) => Object.hasOwn(args, k));
    const sql = `select public.${fn}(${names.map((k, n) => `"${k}" => $${n + 1}`).join(', ')}) as r`;
    const rows = await q(sql, names.map((k) => (args[k] !== null && typeof args[k] === 'object' && !(ARRAY_ARGS.has(k) && Array.isArray(args[k])) ? JSON.stringify(args[k]) : args[k])));
    return [{ r: rows[0]?.r ?? null }];
  },
}));