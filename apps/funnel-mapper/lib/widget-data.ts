// Widgets: live numbers on the map. A widget is a canvas element (`type: "widget"`, stored in the graph like any other
// annotation, so it needs no table). It only READS results from the engine; nothing here calculates a funnel.
//   scope   funnel (the whole result `R`), frame (the steps inside a frame) or selection (the steps it was made for)
//   display number | trend (number + Actual vs Plan) | chart (monthly projection) | path (conversion along the main path)
//   metrics up to 4 of WIDGET_METRICS
// Scoped (frame / selection) figures add up the same per-step results `compute()` adds up for the whole funnel.
import { baseOf, isAnnot, typeOf, WIDGET_SIZES, type NodeParams } from "./catalog";
import { frameMembersOf } from "./geometry";
import { money, pct, ratio, people } from "./format";
import { project, num, type ActualRow, type FunnelResult, type GraphLike } from "./funnel-math";
import { goalCurrent } from "./report-data";
import type { FunnelNode, Goal } from "./graph";

export const WIDGET_METRICS = [
  ["revenue", "Revenue", "money"],
  ["profit", "Profit", "money"],
  ["roas", "ROAS", "ratio"],
  ["leads", "Leads", "count"],
  ["customers", "Customers", "count"],
  ["conversion", "Conversion", "pct"],
  ["cpa", "CPA", "money"],
  ["mrr", "MRR", "money"],
  ["goal", "Goal progress", "pct"],
] as const;
export type WidgetMetric = (typeof WIDGET_METRICS)[number][0];
export type MetricKind = (typeof WIDGET_METRICS)[number][2];
export const MAX_WIDGET_METRICS = 4;
export type WidgetScope = "funnel" | "frame" | "selection";
export type WidgetDisplay = "number" | "trend" | "chart" | "path";
export type WidgetSize = keyof typeof WIDGET_SIZES;
export type TrendPeriod = "week" | "month" | "quarter" | "range";

export interface WidgetConfig {
  scope: WidgetScope;
  /** Frame scope: the frame's node id. */
  frameId?: string;
  /** Selection scope: the steps it covers. */
  nodeIds?: string[];
  display: WidgetDisplay;
  metrics: WidgetMetric[];
  size: WidgetSize;
  trend: TrendPeriod;
  /** Trend with a real date range (ISO dates). */
  from?: string;
  to?: string;
}

const isMetric = (m: unknown): m is WidgetMetric => WIDGET_METRICS.some(([k]) => k === m);
/** Read a widget's params defensively (they come from a saved file / share link). */
export function widgetConfig(p: NodeParams): WidgetConfig {
  const metrics = (Array.isArray(p.metrics) ? p.metrics : []).filter(isMetric).filter((m, i, a) => a.indexOf(m) === i).slice(0, MAX_WIDGET_METRICS);
  return {
    scope: p.scope === "frame" || p.scope === "selection" ? p.scope : "funnel",
    frameId: typeof p.frameId === "string" ? p.frameId : undefined,
    nodeIds: Array.isArray(p.nodeIds) ? p.nodeIds.filter((x): x is string => typeof x === "string") : undefined,
    display: p.display === "trend" || p.display === "chart" || p.display === "path" ? p.display : "number",
    metrics: metrics.length ? metrics : ["revenue"],
    size: p.wsize === "S" || p.wsize === "L" ? p.wsize : "M",
    trend: p.trend === "week" || p.trend === "quarter" || p.trend === "range" ? p.trend : "month",
    from: typeof p.from === "string" ? p.from : undefined,
    to: typeof p.to === "string" ? p.to : undefined,
  };
}

/** The steps a widget covers (null = the whole funnel). A scope whose steps are gone is "invalid". */
export function widgetMembers(c: WidgetConfig, nodes: FunnelNode[]): { members: FunnelNode[] | null; invalid: boolean } {
  if (c.scope === "funnel") return { members: null, invalid: false };
  if (c.scope === "frame") {
    const f = nodes.find((n) => n.id === c.frameId && n.type === "frame");
    if (!f) return { members: [], invalid: true };
    return { members: frameMembersOf(f, nodes).filter((n) => !isAnnot(n.type)), invalid: false };
  }
  const ids = new Set(c.nodeIds ?? []);
  const members = nodes.filter((n) => ids.has(n.id) && !isAnnot(n.type));
  return { members, invalid: members.length === 0 };
}

export interface MetricValue {
  metric: WidgetMetric;
  label: string;
  kind: MetricKind;
  /** NaN = no data yet. */
  value: number;
  /** Extra line (e.g. "before fixed costs"). */
  note?: string;
}

/** Per-step totals, with the same rules as the totals loop in compute(). */
export function scopeTotals(members: FunnelNode[], R: FunnelResult) {
  const t = { traffic: 0, spend: 0, actCost: 0, cogs: 0, leads: 0, cust: 0, rev: 0, mrr: 0, subs: 0 };
  for (const n of members) {
    const T = typeOf(n.type),
      r = R.N[n.id];
    if (!T || !r) continue;
    if (T.cat === "traffic") {
      t.traffic += r.out;
      t.spend += r.spend;
    }
    if (T.cat === "page" && n.p.lead) t.leads += r.out;
    if (T.cat === "action") t.actCost += r.cost;
    if (T.cat === "offer") {
      t.rev += r.rev;
      t.cogs += r.cogs;
      t.mrr += r.mrr;
      if (n.p.newc) t.cust += r.out;
      if (baseOf(n.type) === "sub") t.subs += r.out;
    }
  }
  return t;
}

const labelOf = (m: WidgetMetric) => WIDGET_METRICS.find(([k]) => k === m)![1];
const kindOf = (m: WidgetMetric) => WIDGET_METRICS.find(([k]) => k === m)![2];
const ratioOrNaN = (a: number, b: number) => (b > 0 ? a / b : NaN);

export function widgetValues(c: WidgetConfig, nodes: FunnelNode[], R: FunnelResult, goals: Goal[]): MetricValue[] {
  const { members } = widgetMembers(c, nodes);
  const scoped = members ? scopeTotals(members, R) : null;
  const ids = members ? new Set(members.map((n) => n.id)) : null;
  return c.metrics.map((m) => {
    let value = NaN,
      note: string | undefined;
    if (m === "goal") {
      const g = goals.find((x) => x.value > 0 && (!ids || (x.nodeId && ids.has(x.nodeId))));
      if (g) {
        const cur = goalCurrent(nodes, R, g);
        value = Number.isFinite(cur) ? cur / g.value : NaN;
        note = g.name || undefined;
      }
    } else if (!scoped) {
      value = { revenue: R.rev, profit: R.profit, roas: R.roas, leads: R.leads, customers: R.cust, conversion: R.conv, cpa: R.cpa, mrr: R.mrr }[m];
    } else {
      value = {
        revenue: scoped.rev,
        profit: scoped.rev - scoped.spend - scoped.actCost - scoped.cogs,
        roas: ratioOrNaN(scoped.rev, scoped.spend),
        leads: scoped.leads,
        customers: scoped.cust,
        conversion: ratioOrNaN(scoped.cust, scoped.traffic),
        cpa: ratioOrNaN(scoped.spend, scoped.cust),
        mrr: scoped.mrr,
      }[m];
      if (m === "profit") note = "before fixed costs";
    }
    return { metric: m, label: labelOf(m), kind: kindOf(m), value, note };
  });
}

/** MRR widget: today, month 12 of the forecast, and subscribers (whole funnel). */
export function mrrDetail(g: GraphLike, s: Parameters<typeof project>[1], R: FunnelResult, members: FunnelNode[] | null) {
  const scoped = members ? scopeTotals(members, R) : null;
  const rows = members ? [] : project(g, s, 12, 0);
  return { now: scoped ? scoped.mrr : R.mrr, month12: rows.length ? rows[11]?.mrr : NaN, subscribers: scoped ? scoped.subs : R.subs };
}

/** Monthly projection of one metric, for the chart display (whole funnel; scoped widgets scale it by their share). */
export function chartSeries(metric: WidgetMetric, g: GraphLike, s: Parameters<typeof project>[1], R: FunnelResult, value: number): number[] {
  const rows = project(g, s, 12, 0);
  const pick: Partial<Record<WidgetMetric, (r: (typeof rows)[number]) => number>> = {
    revenue: (r) => r.revenue,
    profit: (r) => r.profit,
    leads: (r) => r.leads,
    customers: (r) => r.newCustomers,
    mrr: (r) => r.mrr,
  };
  const f = pick[metric];
  if (!f) return [];
  const series = rows.map(f);
  // a scoped widget keeps the funnel's monthly shape at its own level
  const whole = { revenue: R.rev, profit: R.profit, leads: R.leads, customers: R.cust, mrr: R.mrr }[metric as "revenue"] ?? NaN;
  const k = Number.isFinite(value) && Number.isFinite(whole) && whole !== 0 && Math.abs(whole - value) > 1e-9 ? value / whole : 1;
  return series.map((v) => v * k);
}

/**
 * Conversion path: the funnel's main path as the engine ran it. From the source that sends the most people, follow the
 * connection that carries the most people at every step (no new maths: people and flows are the engine's own).
 */
export interface PathStep {
  id: string;
  name: string;
  /** People reaching the step (visits for a source). */
  inn: number;
  /** People continuing from the step. */
  out: number;
  /** Share of the people reaching it who continue (NaN for a source). */
  rate: number;
}
export function conversionPath(nodes: FunnelNode[], edges: { id: string; from: string; to: string }[], R: FunnelResult, members: FunnelNode[] | null, max = 6): PathStep[] {
  const allowed = members ? new Set(members.map((n) => n.id)) : null;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const ok = (id: string) => !!byId.get(id) && !isAnnot(byId.get(id)!.type) && (!allowed || allowed.has(id));
  const starts = nodes.filter((n) => ok(n.id) && (typeOf(n.type)?.cat === "traffic" || (allowed && !edges.some((e) => e.to === n.id && allowed.has(e.from)))));
  let cur: FunnelNode | undefined = starts.sort((a, b) => (R.N[b.id]?.out ?? 0) - (R.N[a.id]?.out ?? 0))[0];
  const out: PathStep[] = [];
  const seen = new Set<string>();
  while (cur && out.length < max && !seen.has(cur.id)) {
    seen.add(cur.id);
    const r = R.N[cur.id];
    const src = typeOf(cur.type)?.cat === "traffic";
    const inn = src ? (r?.out ?? 0) : (r?.inflow ?? 0);
    out.push({ id: cur.id, name: cur.name, inn, out: r?.out ?? 0, rate: src || !inn ? NaN : (r?.out ?? 0) / inn });
    const next = edges
      .filter((e) => e.from === cur!.id && ok(e.to))
      .sort((a, b) => (R.flows[b.id] ?? 0) - (R.flows[a.id] ?? 0))[0];
    cur = next && (R.flows[next.id] ?? 0) > 0 ? byId.get(next.to) : undefined;
  }
  return out;
}

/* ---------------- trends: Actual vs Plan ---------------- */
export const DAYS_PER_MONTH = 30.44; // planned numbers are per month

export interface TrendValue {
  metric: WidgetMetric;
  plan: number;
  actual: number | null;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
/** Date range a trend covers, ending today (or the chosen range). */
export function trendRange(c: Pick<WidgetConfig, "trend" | "from" | "to">, today = new Date()): { start: string; end: string; days: number } {
  if (c.trend === "range" && c.from && c.to && c.from <= c.to) return { start: c.from, end: c.to, days: Math.max(1, Math.round((Date.parse(c.to) - Date.parse(c.from)) / 86400000) + 1) };
  const days = c.trend === "week" ? 7 : c.trend === "quarter" ? 91 : 30;
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const start = new Date(end.getTime() - (days - 1) * 86400000);
  return { start: iso(start), end: iso(end), days };
}

/**
 * Plan (this period's share of the monthly plan) next to what Actuals recorded in the range. Actuals are per step:
 * visitors at sources, conversions, revenue and spend; a metric with nothing recorded has `actual: null`.
 */
export function trendValues(c: WidgetConfig, nodes: FunnelNode[], R: FunnelResult, plan: MetricValue[], actuals: (ActualRow & { period_start: string; period_end: string })[]): TrendValue[] {
  const { start, end, days } = trendRange(c);
  const { members } = widgetMembers(c, nodes);
  const ids = members ? new Set(members.map((n) => n.id)) : null;
  const k = days / DAYS_PER_MONTH;
  const rows = actuals.filter((a) => a.period_start >= start && a.period_end <= end && (!ids || ids.has(a.node_id)));
  const byType = (cat: string, key: "conversions" | "revenue" | "spend" | "visitors") => {
    let any = false,
      sum = 0;
    for (const a of rows) {
      const n = nodes.find((x) => x.id === a.node_id);
      if (!n || typeOf(n.type)?.cat !== cat) continue;
      const v = a[key];
      if (v != null) {
        any = true;
        sum += Number(v);
      }
    }
    return any ? sum : null;
  };
  const rev = byType("offer", "revenue");
  const spend = byType("traffic", "spend");
  const cust = (() => {
    let any = false,
      sum = 0;
    for (const a of rows) {
      const n = nodes.find((x) => x.id === a.node_id);
      if (!n || typeOf(n.type)?.cat !== "offer" || !n.p.newc || a.conversions == null) continue;
      any = true;
      sum += Number(a.conversions);
    }
    return any ? sum : null;
  })();
  const leads = (() => {
    let any = false,
      sum = 0;
    for (const a of rows) {
      const n = nodes.find((x) => x.id === a.node_id);
      if (!n || typeOf(n.type)?.cat !== "page" || !n.p.lead || a.conversions == null) continue;
      any = true;
      sum += Number(a.conversions);
    }
    return any ? sum : null;
  })();
  const visitors = byType("traffic", "visitors");
  const act: Partial<Record<WidgetMetric, number | null>> = {
    revenue: rev,
    profit: rev != null && spend != null ? rev - spend : null,
    roas: rev != null && spend ? rev / spend : null,
    leads,
    customers: cust,
    conversion: cust != null && visitors ? cust / visitors : null,
    cpa: cust && spend != null ? spend / cust : null,
  };
  void R;
  return plan.map((p) => {
    const rate = p.kind === "ratio" || p.kind === "pct" || p.metric === "cpa";
    return { metric: p.metric, plan: rate ? p.value : p.value * k, actual: act[p.metric] ?? null };
  });
}
/** "£1,234", "13.40x", "40.0%", "89.1"; "No data yet" when the figure doesn't exist. */
export function formatMetricValue(v: Pick<MetricValue, "kind" | "value">, cur: string): string {
  if (!Number.isFinite(v.value)) return "No data yet";
  if (v.kind === "money") return money(v.value, cur);
  if (v.kind === "ratio") return ratio(v.value);
  if (v.kind === "pct") return pct(v.value);
  return people(v.value);
}
export { num };
