// Typed Planner client. Every method is one planner_* database function; permissions are decided by the database.
import { toPublicError } from '../../../../packages/core/errors.mjs';
import { PlannerError } from './types.ts';
import type {
  Action, Can, Comment, FocusArea, Goal, GoalDetail, GoalType, Member, MyWork, PlanDetail, PlanSummary, PlannerBackend, Plan, PlanValue, Reading,
  Review, Risk, SavedView, SearchHit, GoalUpdate, Measure, Workspace, ProjectRef, StrategyModel, NamedHorizon, FocusTemplate, Strategy, StrategyItem, MeasureType,
} from './types.ts';

type Doc = Record<string, unknown>;

export class PlannerClient {
  readonly backend: PlannerBackend;
  constructor(backend: PlannerBackend) { this.backend = backend; }

  private async call<T>(fn: string, args: Doc = {}): Promise<T> {
    try { return await this.backend.rpc<T>(fn, args); }
    catch (e) {
      if (e instanceof PlannerError) throw e;
      const pub = toPublicError((e ?? {}) as { code?: string }) ?? { code: 'failed', message: 'Something went wrong. Nothing was changed.' };
      throw new PlannerError(pub.code as PlannerError['code'], publicMessage(e, pub), (e as { code?: string })?.code);
    }
  }

  workspaces(): Promise<Workspace[]> { return this.backend.listWorkspaces(); }
  projects(ws: string): Promise<ProjectRef[]> { return this.backend.listProjects(ws).catch(() => []); }
  setActiveWorkspace(id: string) { return this.backend.setActiveWorkspace(id); }

  // reads
  members(ws: string) { return this.call<Member[]>('planner_members', { p_workspace: ws }); }
  access(ws: string) { return this.call<Can>('planner_my_access', { p_workspace: ws }); }
  plans(ws: string, includeArchived = false) { return this.call<PlanSummary[]>('planner_list_plans', { p_workspace: ws, p_include_archived: includeArchived }); }
  plan(id: string) { return this.call<PlanDetail | null>('planner_get_plan', { p_plan: id }); }
  goal(id: string) { return this.call<GoalDetail | null>('planner_get_goal', { p_goal: id }); }
  myWork(ws: string) { return this.call<MyWork>('planner_my_work', { p_workspace: ws }); }
  search(ws: string, q: string) { return this.call<SearchHit[]>('planner_search', { p_workspace: ws, p_query: q }); }
  views(planId: string) { return this.call<SavedView[]>('planner_list_views', { p_plan: planId }); }

  // strategy model and time horizons
  model(ws: string) { return this.call<StrategyModel | null>('planner_get_model', { p_workspace: ws }); }
  saveTypeRules(ws: string, rules: { parent: string | null; child: string }[]) { return this.call<StrategyModel['rules']>('planner_save_type_rules', { p_workspace: ws, p_rules: rules }); }
  saveHorizon(ws: string, id: string | null, data: Doc) { return this.call<NamedHorizon>('planner_save_horizon', { p_workspace: ws, p_id: id, p_data: data }); }
  deleteHorizon(id: string) { return this.call<void>('planner_delete_horizon', { p_id: id }); }
  saveFocusTemplate(ws: string, id: string | null, data: Doc) { return this.call<FocusTemplate>('planner_save_focus_template', { p_workspace: ws, p_id: id, p_data: data }); }
  deleteFocusTemplate(id: string) { return this.call<void>('planner_delete_focus_template', { p_id: id }); }
  saveStrategy(ws: string, id: string | null, data: Doc) { return this.call<Strategy>('planner_save_strategy', { p_workspace: ws, p_id: id, p_data: data }); }
  deleteStrategy(id: string) { return this.call<void>('planner_delete_strategy', { p_id: id }); }
  saveStrategyItem(ws: string, id: string | null, data: Doc) { return this.call<StrategyItem>('planner_save_strategy_item', { p_workspace: ws, p_id: id, p_data: data }); }
  deleteStrategyItem(id: string) { return this.call<void>('planner_delete_strategy_item', { p_id: id }); }
  saveMeasureType(ws: string, id: string | null, data: Doc) { return this.call<MeasureType>('planner_save_measure_type', { p_workspace: ws, p_id: id, p_data: data }); }
  deleteMeasureType(id: string) { return this.call<void>('planner_delete_measure_type', { p_id: id }); }

  // plans and structure
  savePlan(ws: string, id: string | null, data: Doc, expected?: string) {
    return this.call<Plan>('planner_save_plan', { p_workspace: ws, p_id: id, p_data: data, p_expected: expected ?? null });
  }
  setPlanArchived(id: string, archived: boolean) { return this.call<Plan>('planner_set_plan_archived', { p_plan: id, p_archived: archived }); }
  saveValue(plan: string, id: string | null, data: Doc) { return this.call<PlanValue>('planner_save_value', { p_plan: plan, p_id: id, p_data: data }); }
  deleteValue(id: string) { return this.call<void>('planner_delete_value', { p_id: id }); }
  saveFocusArea(plan: string, id: string | null, data: Doc) { return this.call<FocusArea>('planner_save_focus_area', { p_plan: plan, p_id: id, p_data: data }); }
  setFocusArchived(id: string, archived: boolean) { return this.call<FocusArea>('planner_set_focus_archived', { p_id: id, p_archived: archived }); }
  reorder(entity: 'focus_areas' | 'values' | 'goals' | 'actions', ids: string[]) { return this.call<void>('planner_reorder', { p_entity: entity, p_ids: ids }); }
  saveGoalType(ws: string, id: string | null, data: Doc) { return this.call<GoalType>('planner_save_goal_type', { p_workspace: ws, p_id: id, p_data: data }); }
  deleteGoalType(id: string) { return this.call<void>('planner_delete_goal_type', { p_id: id }); }

  // goals
  saveGoal(plan: string, id: string | null, data: Doc, expected?: string) {
    return this.call<Goal>('planner_save_goal', { p_plan: plan, p_id: id, p_data: data, p_expected: expected ?? null });
  }
  moveGoal(goal: string, focus: string | null, parent: string | null, siblings: string[] = []) {
    return this.call<Goal>('planner_move_goal', { p_goal: goal, p_focus: focus, p_parent: parent, p_siblings: siblings });
  }
  setGoalArchived(goal: string, archived: boolean) { return this.call<Goal>('planner_set_goal_archived', { p_goal: goal, p_archived: archived }); }
  deleteGoal(goal: string) { return this.call<void>('planner_delete_goal', { p_goal: goal }); }
  postUpdate(goal: string, data: Doc) { return this.call<GoalUpdate>('planner_post_update', { p_goal: goal, p_data: data }); }

  // measures, actions, risks, comments
  saveMeasure(goal: string, id: string | null, data: Doc) { return this.call<Measure>('planner_save_measure', { p_goal: goal, p_id: id, p_data: data }); }
  recordReading(measure: string, value: number, recordedOn?: string, note?: string) {
    return this.call<Reading>('planner_record_reading', { p_measure: measure, p_value: value, p_recorded_on: recordedOn ?? null, p_note: note ?? null });
  }
  saveAction(goal: string, id: string | null, data: Doc) { return this.call<Action>('planner_save_action', { p_goal: goal, p_id: id, p_data: data }); }
  saveRisk(goal: string, id: string | null, data: Doc) { return this.call<Risk>('planner_save_risk', { p_goal: goal, p_id: id, p_data: data }); }
  addComment(goal: string, body: string) { return this.call<Comment>('planner_add_comment', { p_goal: goal, p_body: body }); }
  editComment(id: string, body: string) { return this.call<Comment>('planner_edit_comment', { p_id: id, p_body: body }); }
  deleteComment(id: string) { return this.call<void>('planner_delete_comment', { p_id: id }); }

  // reviews, favourites, saved views
  saveReview(plan: string, id: string | null, data: Doc) { return this.call<Review>('planner_save_review', { p_plan: plan, p_id: id, p_data: data }); }
  holdReview(id: string, summary: string, decisions: string) { return this.call<Review>('planner_hold_review', { p_review: id, p_summary: summary, p_decisions: decisions }); }
  getReview(id: string) { return this.call<Review | null>('planner_get_review', { p_review: id }); }
  toggleFavorite(plan: string, on: boolean) { return this.call<boolean>('planner_toggle_favorite', { p_plan: plan, p_on: on }); }
  saveView(plan: string, name: string, config: Doc) { return this.call<SavedView>('planner_save_view', { p_plan: plan, p_name: name, p_config: config }); }
  deleteView(id: string) { return this.call<void>('planner_delete_view', { p_id: id }); }
}

/** Plain words for the person; never database text, codes or constraint names. */
function publicMessage(e: unknown, pub: { code: string; message: string }): string {
  const text = String((e as { message?: string })?.message ?? '');
  // P0001 messages are written for people in the migrations (e.g. "this plan is archived: restore it to change its goals").
  if (pub.code === 'invalid' && (e as { code?: string })?.code === 'P0001' && text.length < 140 && !/[{}\[\]]|relation|column|constraint|violates/i.test(text)) {
    return text.charAt(0).toUpperCase() + text.slice(1) + (text.endsWith('.') ? '' : '.');
  }
  return pub.message;
}
