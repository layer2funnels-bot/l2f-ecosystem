// Report sections for client exports (PDF). Pure assembly of results from lib/funnel-math.ts:
// nothing here recalculates the funnel; every figure comes from compute / computeScenario / project / sourceRows / targetPlan.
import { baseOf, isAnnot, typeOf } from "./catalog";
import {
  compute,
  computeScenario,
  expenseTotals,
  goalPlan,
  leaks,
  num,
  periodFactor,
  periodNumbers,
  planVsActual,
  project,
  sourceRows,
  stepRate,
  stepRows,
  targetPlan,
  withStepRate,
  type FunnelResult,
  type ActualRow,
  type GoalPlan,
  type GraphLike,
  type Leak,
  type PeriodNumbers,
  type ProjectionRow,
  type SourceRow,
} from "./funnel-math";
import type { FunnelNode, FunnelSettings, Goal, StepStatus } from "./graph";

export type ReportSettings = Pick<FunnelSettings, "basis" | "fixed" | "whatif" | "expenses" | "scenarios" | "projection" | "target"> &
  Partial<Pick<FunnelSettings, "goals" | "reinvest">>;

const NEUTRAL = { traffic: 1, conv: 1, price: 1, cost: 1 };
const isNeutral = (w: Partial<typeof NEUTRAL> | undefined) => !w || (Object.keys(NEUTRAL) as (keyof typeof NEUTRAL)[]).every((k) => (num(w[k]) || 1) === 1);

export interface ScenarioColumn {
  name: string;
  R: FunnelResult;
}

/** Periods for required numbers. The funnel models one month (as the forecast does). */
export const PERIODS: [string, number][] = [
  ["Per day", 12 / 365],
  ["Per week", 12 / 52],
  ["Per month", 1],
  ["Per year", 12],
];

export interface ReportData {
  /** Baseline (current map, no what-if), the current view if a what-if is applied, then each saved scenario. */
  scenarios: ScenarioColumn[];
  hasScenarios: boolean;
  forecast: { rows: ProjectionRow[]; months: number; growth: number; revenue: number; profit: number; mrr: number; activeSubs: number; breakEven: number | null };
  sources: SourceRow[];
  offers: { id: string; name: string; label: string; buyers: number; revenue: number; share: number }[];
  expenses: {
    lines: [string, number][];
    total: number;
    oneTime: number;
    items: { name: string; category: string; kind: string; amount: number; perPeriod: number }[];
  };
  overview: { month: PeriodNumbers; year: PeriodNumbers; keyLeak: Leak | null };
  leaks: Leak[];
  reinvest: {
    pct: number;
    months: number;
    rows: ProjectionRow[];
    /** The same months without reinvestment, for comparison. */
    plain: ProjectionRow[];
    total: { revenue: number; profit: number; traffic: number; reinvested: number };
    plainTotal: { revenue: number; profit: number; traffic: number };
    /** Reinvestment needs paid traffic (it buys more of it). */
    hasPaid: boolean;
  };
  status: StatusReport;
  goals: {
    items: GoalReport[];
    target: number;
    plan: ReturnType<typeof targetPlan> | null;
    /** [period, revenue, visitors, ad spend, customers] needed for the revenue target. */
    required: [string, number, number, number, number][];
    blocks: { name: string; people: number }[];
  };
}

export interface GoalReport {
  goal: Goal;
  /** What the goal measures, e.g. "Monthly profit" or "Conversion at Sales page". */
  label: string;
  current: number;
  /** current ÷ target (capped at 1 for display by the caller). */
  progress: number;
  /** Required monthly numbers (traffic-scaling goals). */
  plan: GoalPlan | null;
  /** [period, revenue, profit, visitors, ad spend, leads, customers] at the required traffic. */
  required: [string, number, number, number, number, number, number][];
  /** Conversion goals: results if the step converted at the target rate. */
  impact: FunnelResult | null;
  stepName?: string;
}

export interface StatusReport {
  total: number;
  done: number;
  building: number;
  planned: number;
  /** done ÷ total (0 when there are no steps). */
  pct: number;
  steps: { id: string; name: string; label: string; status: StepStatus }[];
}

const GOAL_LABEL: Record<Goal["kind"], string> = {
  revenue: "revenue",
  profit: "profit",
  traffic: "traffic",
  customers: "new customers",
  leads: "leads",
  step: "People completing",
  conversion: "Conversion at",
};

/** Planned vs built steps (flow blocks only). */
export function statusReport(nodes: FunnelNode[]): StatusReport {
  const steps = nodes.filter((n) => typeOf(n.type) && !isAnnot(n.type)).map((n) => ({ id: n.id, name: n.name, label: typeOf(n.type).label, status: n.status ?? "planned" }));
  const c = (k: StepStatus) => steps.filter((x) => x.status === k).length;
  return { total: steps.length, done: c("done"), building: c("building"), planned: c("planned"), pct: steps.length ? c("done") / steps.length : 0, steps };
}

/** Where a goal stands today (monthly figure, people at the step, or the step's own rate). NaN when it has no step yet. */
export function goalCurrent(nodes: GraphLike["nodes"], R: FunnelResult, goal: Goal): number {
  const node = goal.nodeId ? nodes.find((n) => n.id === goal.nodeId) : undefined;
  if (goal.kind === "conversion") return node ? stepRate(node) : NaN;
  if (goal.kind === "revenue") return R.rev;
  if (goal.kind === "profit") return R.profit;
  if (goal.kind === "traffic") return R.traffic;
  if (goal.kind === "customers") return R.cust;
  if (goal.kind === "leads") return R.leads;
  return node ? (R.N[node.id]?.out ?? 0) : NaN;
}

/** Progress and required numbers for one named goal. */
export function goalReport(g: GraphLike, s: ReportSettings, R: FunnelResult, goal: Goal): GoalReport {
  const node = goal.nodeId ? g.nodes.find((n) => n.id === goal.nodeId) : undefined;
  const target = num(goal.value);
  const period = goal.period ?? "month";
  const periodScale = periodFactor(period);
  const periodName = { day: "daily", week: "weekly", month: "monthly", year: "yearly" }[period];
  const label = goal.kind === "conversion"
    ? `${GOAL_LABEL[goal.kind]} ${node?.name ?? "(pick a step)"}`
    : goal.kind === "step"
      ? `${GOAL_LABEL[goal.kind]} ${node?.name ?? "(pick a step)"} per ${period}`
      : goal.kind === "customers" || goal.kind === "leads" || goal.kind === "traffic"
        ? `${GOAL_LABEL[goal.kind]} per ${period}`
        : `${periodName} ${GOAL_LABEL[goal.kind]}`;
  if (goal.kind === "conversion") {
    const current = node ? stepRate(node) : NaN;
    return { goal, label, current, progress: target ? current / target : 0, plan: null, required: [], impact: node && target > 0 ? withStepRate(g, s, node.id, target) : null, stepName: node?.name };
  }
  const current = goalCurrent(g.nodes, R, goal) * periodScale;
  const monthlyTarget = periodScale > 0 ? target / periodScale : target;
  const plan = (goal.kind === "step" && !node) ? null : goalPlan(g, s, { kind: goal.kind, value: monthlyTarget, nodeId: goal.nodeId });
  const required: GoalReport["required"] =
    plan?.reachable && plan.R ? PERIODS.map(([p, k]) => [p, plan.R!.rev * k, plan.R!.profit * k, plan.R!.traffic * k, plan.R!.spend * k, plan.R!.leads * k, plan.R!.cust * k]) : [];
  return { goal, label, current, progress: target ? current / target : 0, plan, required, impact: null, stepName: node?.name };
}

const sumRows = (rows: ProjectionRow[]) => ({
  revenue: rows.reduce((a, r) => a + r.revenue, 0),
  profit: rows.reduce((a, r) => a + r.profit, 0),
  traffic: rows.reduce((a, r) => a + r.traffic, 0),
  reinvested: rows.reduce((a, r) => a + r.reinvested, 0),
});

const KIND_LABEL = { monthly: "Every month", per_sale: "Per order", one_time: "One-time" } as const;

/** Every report section, from the same results the editor shows. `R` is the editor's current result. */
export function reportData(g: GraphLike, s: ReportSettings, R: FunnelResult): ReportData {
  const base = compute(g, { ...s, whatif: NEUTRAL });
  const scenarios: ScenarioColumn[] = [{ name: "Baseline (current map)", R: base }];
  if (!isNeutral(s.whatif)) scenarios.push({ name: "Current what-if", R });
  s.scenarios.forEach((sc) => scenarios.push({ name: sc.name || "Scenario", R: computeScenario(g, s, sc) }));

  const { months, growth } = s.projection;
  const rows = project(g, s, months, growth);
  const last = rows[rows.length - 1];
  const be = rows.find((r) => r.cumulative >= 0 && r.month > 0);

  const offers = stepRows(g, R)
    .filter((r) => r.cat === "offer")
    .map((r) => ({ id: r.id, name: r.name, label: r.label, buyers: r.out, revenue: r.rev, share: R.rev ? r.rev / R.rev : 0 }));

  const ex = expenseTotals(s.expenses);
  const items = s.expenses
    .filter((e) => num(e.amount))
    .map((e) => ({ name: e.name || e.category, category: e.category, kind: KIND_LABEL[e.kind], amount: num(e.amount), perPeriod: e.kind === "monthly" ? num(e.amount) : e.kind === "per_sale" ? num(e.amount) * R.orders : 0 }));
  const lines: [string, number][] = (
    [
      ["Ad spend", R.spend],
      ["Follow-up costs", R.actCost],
      ["Delivery & affiliate", R.cogs],
      ["Fixed costs", num(s.fixed)],
      ["Monthly expenses", ex.monthly],
      ["Per-order expenses", R.perSale],
    ] as [string, number][]
  ).filter(([, v]) => v);

  const target = num(s.target);
  const plan = target > 0 ? targetPlan(R, target) : null;
  const required: ReportData["goals"]["required"] = plan ? PERIODS.map(([p, k]) => [p, target * k, plan.visitorsNeeded * k, plan.spendNeeded * k, plan.customersNeeded * k]) : [];
  const blocks = g.nodes.filter((n) => baseOf(n.type) === "goal" && !isAnnot(n.type)).map((n) => ({ name: n.name, people: R.N[n.id]?.inflow ?? 0 }));

  const L = leaks(g, s, R);
  const rv = s.reinvest ?? { pct: 0, months: 12 };
  const reRows = project(g, s, rv.months, growth, { reinvestPct: rv.pct });
  const plainRows = project(g, s, rv.months, growth);
  const hasPaid = g.nodes.some((n) => typeOf(n.type)?.cat === "traffic" && (R.N[n.id]?.spend ?? 0) > 0);

  return {
    overview: { month: periodNumbers(R, 1), year: periodNumbers(R, 12), keyLeak: L[0] ?? null },
    leaks: L,
    reinvest: { pct: rv.pct, months: rv.months, rows: reRows, plain: plainRows, total: sumRows(reRows), plainTotal: sumRows(plainRows), hasPaid },
    status: statusReport(g.nodes as FunnelNode[]),
    scenarios,
    hasScenarios: s.scenarios.length > 0,
    forecast: {
      rows,
      months,
      growth,
      revenue: rows.reduce((a, r) => a + r.revenue, 0),
      profit: last?.cumulative ?? 0,
      mrr: last?.mrr ?? 0,
      activeSubs: last?.activeSubs ?? 0,
      breakEven: be ? be.month : null,
    },
    sources: sourceRows(g, s),
    offers,
    expenses: { lines, total: R.costs, oneTime: R.oneTime, items },
    goals: { items: (s.goals ?? []).map((x) => goalReport(g, s, R, x)), target, plan, required, blocks },
  };
}

/** Days one planned month stands for (the same scale as the Actuals tab). */
export const DAYS_PER_PERIOD = 30.44;

export interface MonthlyActualRow {
  /** Calendar month, `YYYY-MM`. A period is counted in the month it starts. */
  month: string;
  days: number;
  planRev: number;
  actRev: number;
  planSpend: number;
  actSpend: number;
}
interface DatedActual extends ActualRow {
  period_start: string;
  period_end: string;
}

/**
 * Actuals next to the plan, one row per calendar month that has any. Plan numbers come from planVsActual (the same
 * function the Actuals tab uses) scaled by the days the month's entered periods cover, so the two views agree.
 */
export function monthlyPlanVsActual(g: GraphLike, R: FunnelResult, actuals: DatedActual[]): MonthlyActualRow[] {
  const byMonth = new Map<string, DatedActual[]>();
  for (const a of actuals) {
    const k = a.period_start.slice(0, 7);
    byMonth.set(k, [...(byMonth.get(k) ?? []), a]);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, rows]) => {
      const periods = new Map(rows.map((r) => [`${r.period_start}|${r.period_end}`, Math.max(1, Math.round((Date.parse(r.period_end) - Date.parse(r.period_start)) / 86400000) + 1)]));
      const days = [...periods.values()].reduce((a, b) => a + b, 0);
      const cmp = planVsActual(g, R, rows, days / DAYS_PER_PERIOD);
      const sum = (f: (r: (typeof cmp)[number]) => number | null) => cmp.reduce((a, r) => a + (f(r) ?? 0), 0);
      return { month, days, planRev: sum((r) => r.planRev), actRev: sum((r) => r.actRev), planSpend: sum((r) => r.planSpend), actSpend: sum((r) => r.actSpend) };
    });
}
