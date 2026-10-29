// Domain types mirroring the jsonb documents returned by migrations/0006_planner_api.sql.
export type Status = 'not_started' | 'on_track' | 'at_risk' | 'off_track' | 'on_hold' | 'completed';
export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type ProgressMode = 'manual' | 'measure' | 'children' | 'actions';
export type Confidence = 'high' | 'medium' | 'low';
export type FocusColor = 'blue' | 'coral' | 'teal' | 'amber' | 'violet' | 'green' | 'slate';
export type ActionStatus = 'todo' | 'doing' | 'on_hold' | 'done' | 'wont_do';
export type UpdateCadence = 'none' | 'weekly' | 'fortnightly' | 'monthly' | 'quarterly';
export type Cadence = 'none' | 'weekly' | 'fortnightly' | 'monthly' | 'quarterly';

export interface Member { user_id: string; name: string; role: 'owner' | 'admin' | 'editor' | 'viewer' }
export interface Workspace { id: string; slug: 'layer2funnels' | 'aurj'; name: string; /** the organization the ecosystem has active for this person (the shell's switcher); set by the API backend only */ isActive?: boolean; role?: string }
export interface Identity { id: string; name: string }

/** Which Planner actions the signed-in person may take (the database still enforces every one). */
export type Can = Record<'plan.view' | 'plan.manage' | 'goal.create' | 'goal.edit' | 'goal.archive' | 'goal.delete' | 'update.post'
  | 'measure.edit' | 'action.manage' | 'review.manage' | 'comment.create', boolean>;

export interface PlanSummary {
  id: string; name: string; description: string | null; period_start: string | null; period_end: string | null;
  review_cadence: Cadence; archived_at: string | null; updated_at: string; favorite: boolean; progress: number;
  parent_plan_id: string | null; owner_name: string | null; focus_area_count: number; open_risks: number;
  goal_count: number; status_counts: Partial<Record<Status, number>>; next_review: string | null; overdue_reviews: number; strategy_id: string | null;
}
export interface Plan {
  id: string; workspace_id: string; name: string; description: string | null; vision: string | null;
  period_start: string | null; period_end: string | null; review_cadence: Cadence; parent_plan_id: string | null; archived_at: string | null;
  created_at: string; updated_at: string; progress: number; favorite: boolean; strategy_id: string | null;
}
export interface PlanValue { id: string; plan_id: string; name: string; description: string | null; position: number }
export interface FocusArea { id: string; plan_id: string; name: string; description: string | null; color: FocusColor; position: number; start_date: string | null; end_date: string | null; archived_at: string | null; template_id?: string | null }
export interface GoalType { id: string; name: string; uses_measure: boolean; position: number }
export interface MeasureSummary { id: string; name: string; unit: string; current: number; target: number; start: number; direction: 'increase' | 'decrease' }
export interface Goal {
  id: string; workspace_id: string; plan_id: string; focus_area_id: string; parent_goal_id: string | null; goal_type_id: string; title: string; description: string | null;
  owner_id: string | null; status: Status; progress: number; progress_mode: ProgressMode; priority: Priority; weight: number;
  start_date: string | null; due_date: string | null; position: number; project_id: string | null; value_id: string | null; tags: string[];
  completed_at: string | null; archived_at: string | null; last_update_at: string | null; update_cadence: UpdateCadence; created_at: string; updated_at: string;
  owner_name: string | null; type_name: string | null; uses_measure: boolean | null; child_count: number; open_actions: number; total_actions: number;
  open_risks: number; max_risk: number | null; measure: MeasureSummary | null; project: { id: string; name: string } | null; project_restricted: boolean;
  plan_name?: string;
}
export interface Review {
  id: string; plan_id: string; title: string; due_on: string; status: 'scheduled' | 'held' | 'skipped'; held_at: string | null; held_by: string | null;
  summary: string | null; decisions: string | null; created_at: string; updated_at: string; snapshot?: ReviewSnapshot | null;
}
export interface ReviewSnapshot {
  taken_at: string; progress: number; status_counts: Partial<Record<Status, number>>;
  focus_areas: { id: string; name: string; goals: number; progress: number }[];
  goals: { id: string; title: string; status: Status; progress: number; owner_id: string | null; due_date: string | null }[];
}
export interface TypeRule { parent_type_id: string | null; child_type_id: string | null }
export interface NamedHorizon { id: string; title: string; start_date: string; end_date: string }
export interface FocusTemplate { id: string; workspace_id: string; name: string; description: string | null; color: FocusColor; position: number }
export interface Strategy { id: string; workspace_id: string; name: string; description: string | null; position: number; kind_ids: string[]; focus_ids: string[]; focus_kinds: Record<string, string[]>; items: StrategyItem[]; plan_count: number }
export interface StrategyItem {
  id: string; strategy_id: string; template_id: string; parent_id: string | null; item_kind: 'objective' | 'kpi' | 'task'; title: string;
  goal_type_id: string | null; unit: string; target: number | null; direction: 'increase' | 'decrease'; position: number;
}
export interface MeasureType { id: string; workspace_id?: string; name: string; unit: string; direction: 'increase' | 'decrease'; kind_ids: string[] }
export interface StrategyModel {
  types: (GoalType & { goal_count: number })[]; rules: { parent_type_id: string | null; child_type_id: string }[]; horizons: NamedHorizon[]; plan_count: number; focus_area_count: number;
  strategies: Strategy[]; focus_templates: FocusTemplate[]; measure_types: MeasureType[];
}
export interface PlanDetail { plan: Plan; values: PlanValue[]; focus_areas: FocusArea[]; goal_types: GoalType[]; goals: Goal[]; reviews: Review[]; rules?: { parent_type_id: string | null; child_type_id: string }[]; strategy: { id: string; name: string; kind_ids: string[]; focus_kinds: Record<string, string[]> } | null; measure_types: MeasureType[] }

export interface Reading { id: string; value: number; recorded_on: string; note: string | null }
export interface Measure {
  id: string; goal_id: string; name: string; unit: string; direction: 'increase' | 'decrease'; start_value: number; target_value: number;
  current_value: number; cadence: Cadence; archived_at: string | null; progress: number; readings: Reading[];
}
export interface GoalUpdate {
  id: string; goal_id: string; author_id: string; author_name: string | null; status: Status; progress: number | null; confidence: Confidence | null;
  summary: string; risk: string | null; next_step: string | null; created_at: string;
}
export interface Action {
  id: string; goal_id: string; title: string; notes: string | null; assignee_id: string | null; assignee_name?: string | null; status: ActionStatus;
  priority: Priority; due_date: string | null; completed_at: string | null; position: number; project_id: string | null; archived_at: string | null;
  goal_title?: string; plan_id?: string; plan_name?: string;
}
export interface Risk {
  id: string; goal_id: string; title: string; description: string | null; likelihood: number; impact: number; severity: number; mitigation: string | null;
  owner_id: string | null; owner_name?: string | null; status: 'open' | 'mitigating' | 'closed'; archived_at: string | null;
}
export interface Comment { id: string; goal_id: string; author_id: string; author_name: string | null; body: string; created_at: string; edited_at: string | null }
export interface HistoryEntry { id: number; entity: string; action: 'created' | 'updated' | 'archived' | 'restored' | 'deleted'; detail: Record<string, [unknown, unknown]> | null; created_at: string; actor_name: string | null }
export interface GoalDetail {
  goal: Goal; plan: { id: string; name: string; archived_at: string | null }; focus_area: { id: string; name: string; color: FocusColor };
  breadcrumb: { id: string; title: string }[]; children: Goal[]; measures: Measure[]; updates: GoalUpdate[]; actions: Action[]; risks: Risk[];
  comments: Comment[]; history: HistoryEntry[];
}
export interface MyWork { goals: Goal[]; actions: Action[] }
export interface SearchHit { kind: 'goal'; id: string; title: string; plan_id: string; plan_name: string; status: Status; archived: boolean }
export interface SavedView { id: string; name: string; config: Record<string, unknown> }

/** The one thing a backend must provide: call a planner_* database function by name with named arguments. */
export interface PlannerBackend {
  readonly kind: 'local-demo' | 'supabase';
  rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T>;
  listWorkspaces(): Promise<Workspace[]>;
  setActiveWorkspace(workspaceId: string): Promise<void>;
  /** Projects the person is allowed to see (row-level security decides); used only to link a goal to a project. */
  listProjects(workspaceId: string): Promise<ProjectRef[]>;
}
export interface ProjectRef { id: string; name: string }

/** Every failure the app shows to a person; mirrors packages/core/errors.mjs (denied is reported as not found). */
export class PlannerError extends Error {
  readonly code: 'not_found' | 'conflict' | 'invalid' | 'unavailable' | 'failed';
  readonly detail?: string;
  constructor(code: PlannerError['code'], message: string, detail?: string) { super(message); this.code = code; this.detail = detail; this.name = 'PlannerError'; }
}
