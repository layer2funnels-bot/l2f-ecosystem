// Alignment tree, filters, sorting and grouping for goals. Pure functions: easy to test, no UI.
import type { FocusArea, Goal, PlanValue, Priority, Status } from '../api/types.ts';
import { PRIORITY_META, STATUS_ORDER } from './status.ts';
import { scheduleState } from './schedule.ts';
import { inPeriod, type Period } from './horizons.ts';

export interface GoalNode { goal: Goal; children: GoalNode[]; depth: number }

export const byPosition = (a: Goal, b: Goal) => a.position - b.position || a.created_at.localeCompare(b.created_at);

/** Builds the alignment tree. A goal whose parent is not in the list is treated as top-level (e.g. when filtered). */
export function buildTree(goals: Goal[]): GoalNode[] {
  const nodes = new Map<string, GoalNode>();
  for (const g of goals) nodes.set(g.id, { goal: g, children: [], depth: 0 });
  const roots: GoalNode[] = [];
  for (const g of [...goals].sort(byPosition)) {
    const n = nodes.get(g.id)!;
    const parent = g.parent_goal_id ? nodes.get(g.parent_goal_id) : undefined;
    if (parent) parent.children.push(n); else roots.push(n);
  }
  const setDepth = (n: GoalNode, d: number) => { n.depth = d; n.children.forEach((c) => setDepth(c, d + 1)); };
  roots.forEach((r) => setDepth(r, 0));
  return roots;
}

export function flatten(nodes: GoalNode[], collapsed: ReadonlySet<string> = new Set()): GoalNode[] {
  const out: GoalNode[] = [];
  const walk = (n: GoalNode) => { out.push(n); if (!collapsed.has(n.goal.id)) n.children.forEach(walk); };
  nodes.forEach(walk);
  return out;
}

export const descendantIds = (goals: Goal[], id: string): Set<string> => {
  const kids = new Map<string, string[]>();
  for (const g of goals) if (g.parent_goal_id) (kids.get(g.parent_goal_id) ?? kids.set(g.parent_goal_id, []).get(g.parent_goal_id)!).push(g.id);
  const out = new Set<string>(); const stack = [id];
  while (stack.length) for (const c of kids.get(stack.pop()!) ?? []) if (!out.has(c)) { out.add(c); stack.push(c); }
  return out;
};

export const ancestors = (goals: Goal[], id: string): Goal[] => {
  const by = new Map(goals.map((g) => [g.id, g] as const)); const out: Goal[] = [];
  for (let cur = by.get(id)?.parent_goal_id; cur; cur = by.get(cur)?.parent_goal_id) { const g = by.get(cur); if (!g) break; out.unshift(g); }
  return out;
};

export const MAX_DEPTH = 5;
/** Mirrors the database rule so the interface can explain a refusal before it happens. */
export function moveProblem(goals: Goal[], goalId: string, newParentId: string | null): string | null {
  if (!newParentId) return null;
  if (newParentId === goalId) return 'A goal cannot sit under itself.';
  if (descendantIds(goals, goalId).has(newParentId)) return 'A goal cannot sit under one of its own sub-goals.';
  const depthAbove = ancestors(goals, newParentId).length + 1;
  const depthBelow = (() => { const d = (id: string): number => 1 + Math.max(0, ...goals.filter((g) => g.parent_goal_id === id).map((g) => d(g.id))); return d(goalId); })();
  return depthAbove + depthBelow > MAX_DEPTH + 1 ? `Alignment is limited to ${MAX_DEPTH} levels.` : null;
}

export interface GoalFilters {
  query: string; statuses: Status[]; priorities: Priority[]; owners: string[]; types: string[]; focusAreas: string[]; tags: string[];
  showArchived: boolean; overdueOnly: boolean; withRisks: boolean; staleDays: number | null; unowned: boolean;
  hideCompleted: boolean; period: Period | null;
}
export const emptyFilters = (): GoalFilters => ({ query: '', statuses: [], priorities: [], owners: [], types: [], focusAreas: [], tags: [], showArchived: false, overdueOnly: false, withRisks: false, staleDays: null, unowned: false, hideCompleted: false, period: null });
export const activeFilterCount = (f: GoalFilters) =>
  (f.query.trim() ? 1 : 0) + (f.statuses.length ? 1 : 0) + (f.priorities.length ? 1 : 0) + (f.owners.length ? 1 : 0) + (f.types.length ? 1 : 0) +
  (f.focusAreas.length ? 1 : 0) + (f.tags.length ? 1 : 0) + (f.showArchived ? 1 : 0) + (f.overdueOnly ? 1 : 0) + (f.withRisks ? 1 : 0) + (f.staleDays ? 1 : 0) + (f.unowned ? 1 : 0) + (f.hideCompleted ? 1 : 0) + (f.period ? 1 : 0);

export function matchesFilters(g: Goal, f: GoalFilters, today: string): boolean {
  if (!f.showArchived && g.archived_at) return false;
  const q = f.query.trim().toLowerCase();
  if (q && !(`${g.title} ${g.description ?? ''} ${g.owner_name ?? ''} ${g.tags.join(' ')}`.toLowerCase().includes(q))) return false;
  if (f.hideCompleted && g.status === 'completed') return false;
  if (!inPeriod(g, f.period)) return false;
  if (f.statuses.length && !f.statuses.includes(g.status)) return false;
  if (f.priorities.length && !f.priorities.includes(g.priority)) return false;
  if (f.owners.length && !f.owners.includes(g.owner_id ?? '')) return false;
  if (f.unowned && g.owner_id) return false;
  if (f.types.length && !f.types.includes(g.goal_type_id)) return false;
  if (f.focusAreas.length && !f.focusAreas.includes(g.focus_area_id)) return false;
  if (f.tags.length && !f.tags.some((t) => g.tags.includes(t))) return false;
  if (f.overdueOnly && scheduleState(g, today) !== 'overdue') return false;
  if (f.withRisks && !g.open_risks) return false;
  if (f.staleDays) {
    if (g.status === 'completed') return false;
    const last = (g.last_update_at ?? g.created_at).slice(0, 10);
    const age = Math.round((Date.parse(today) - Date.parse(last)) / 86_400_000);
    if (age < f.staleDays) return false;
  }
  return true;
}

/** Keeps a goal when it or any descendant matches, so a filtered tree still shows the path to each match. */
export function filterGoals(goals: Goal[], f: GoalFilters, today: string): Goal[] {
  const keep = new Set<string>();
  const by = new Map(goals.map((g) => [g.id, g] as const));
  for (const g of goals) if (matchesFilters(g, f, today)) for (let cur: Goal | undefined = g; cur && !keep.has(cur.id); cur = cur.parent_goal_id ? by.get(cur.parent_goal_id) : undefined) keep.add(cur.id);
  return goals.filter((g) => keep.has(g.id));
}

export type SortKey = 'manual' | 'title' | 'due' | 'progress' | 'status' | 'priority' | 'owner' | 'updated';
export function sortGoals(goals: Goal[], key: SortKey, dir: 'asc' | 'desc' = 'asc'): Goal[] {
  const sign = dir === 'asc' ? 1 : -1;
  const val = (g: Goal): string | number => {
    switch (key) {
      case 'title': return g.title.toLowerCase();
      case 'due': return g.due_date ?? '9999-12-31';
      case 'progress': return Number(g.progress);
      case 'status': return STATUS_ORDER.indexOf(g.status);
      case 'priority': return -PRIORITY_META[g.priority].rank;
      case 'owner': return (g.owner_name ?? '~').toLowerCase();
      case 'updated': return g.last_update_at ?? g.created_at;
      default: return g.position;
    }
  };
  return [...goals].sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : byPosition(a, b)) * sign; });
}

export type GroupKey = 'focus' | 'owner' | 'status' | 'type' | 'priority' | 'value' | 'none';
export interface GoalGroup { key: string; label: string; color?: string; goals: Goal[] }
export function groupGoals(goals: Goal[], by: GroupKey, ctx: { focusAreas: FocusArea[]; values: PlanValue[]; typeNames: Record<string, string> }): GoalGroup[] {
  const top = goals.filter((g) => !g.parent_goal_id || !goals.some((p) => p.id === g.parent_goal_id));
  if (by === 'none') return [{ key: 'all', label: 'All goals', goals: top }];
  const groups = new Map<string, GoalGroup>();
  const add = (key: string, label: string, g: Goal, color?: string) => { (groups.get(key) ?? groups.set(key, { key, label, color, goals: [] }).get(key)!).goals.push(g); };
  for (const g of top) {
    if (by === 'focus') { const fa = ctx.focusAreas.find((f) => f.id === g.focus_area_id); add(g.focus_area_id, fa?.name ?? 'Focus area', g, fa?.color); }
    else if (by === 'owner') add(g.owner_id ?? 'none', g.owner_name ?? 'No owner', g);
    else if (by === 'status') add(g.status, g.status, g);
    else if (by === 'type') add(g.goal_type_id, ctx.typeNames[g.goal_type_id] ?? 'Type', g);
    else if (by === 'priority') add(g.priority, g.priority, g);
    else { const v = ctx.values.find((x) => x.id === g.value_id); add(g.value_id ?? 'none', v?.name ?? 'Not linked to a value', g); }
  }
  const out = [...groups.values()];
  if (by === 'focus') out.sort((a, b) => ctx.focusAreas.findIndex((f) => f.id === a.key) - ctx.focusAreas.findIndex((f) => f.id === b.key));
  if (by === 'status') out.sort((a, b) => STATUS_ORDER.indexOf(a.key as Status) - STATUS_ORDER.indexOf(b.key as Status));
  return out;
}

/** Roll-up counts for dashboards: archived goals are excluded. */
export function summarise(goals: Goal[], today: string) {
  const live = goals.filter((g) => !g.archived_at);
  const byStatus = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<Status, number>;
  let overdue = 0, unowned = 0, withRisks = 0, behind = 0;
  for (const g of live) {
    byStatus[g.status]++;
    const s = scheduleState(g, today);
    if (s === 'overdue') overdue++;
    if (s === 'behind') behind++;
    if (!g.owner_id) unowned++;
    if (g.open_risks) withRisks++;
  }
  return { total: live.length, byStatus, overdue, behind, unowned, withRisks };
}
