// Actual mode on the map (V2 F4): the same map drawn with the numbers people entered or imported for a date range,
// instead of the plan. This adds up recorded values per step (people arriving, people continuing, revenue, spend); it
// is not a model and never feeds the engine. Lines carry the people their source step recorded as continuing (Yes
// lines) or leaving (No lines), split by the line's share, so the drawing reads like the plan's.
import { baseOf, typeOf } from "./catalog";
import { compute, type ActualRow, type FunnelResult, type GraphLike, type MathSettings } from "./funnel-math";

export interface DatedActualRow extends ActualRow {
  period_start: string;
  period_end: string;
}

/** Saved actuals whose whole period falls inside [start, end] (partly overlapping periods can't be split by day). */
export const actualsInRange = <T extends DatedActualRow>(rows: T[], start: string, end: string) => rows.filter((r) => r.period_start >= start && r.period_end <= end);

/** The months that have actuals, newest first ("2026-09"). */
export const actualMonths = (rows: DatedActualRow[]) => [...new Set(rows.map((r) => r.period_start.slice(0, 7)))].sort().reverse();

/**
 * A FunnelResult-shaped view of recorded actuals, so the canvas, KPI strip and widgets can draw them with the same
 * components. Steps without a recorded value read as zero ("No data yet" on the card).
 */
export function actualResult(g: GraphLike, s: MathSettings, rows: ActualRow[]): FunnelResult {
  // start from an empty run of the engine for the shape (every node present, ratios defined), then fill in recorded values
  const base = compute({ nodes: g.nodes, edges: [] }, { ...s, whatif: { traffic: 0, conv: 1, price: 1, cost: 1 } });
  const sum: Record<string, { v: number; c: number; r: number; sp: number; any: boolean }> = {};
  for (const a of rows) {
    const x = (sum[a.node_id] ??= { v: 0, c: 0, r: 0, sp: 0, any: false });
    if (a.visitors != null) (x.v += Number(a.visitors)), (x.any = true);
    if (a.conversions != null) (x.c += Number(a.conversions)), (x.any = true);
    if (a.revenue != null) (x.r += Number(a.revenue)), (x.any = true);
    if (a.spend != null) (x.sp += Number(a.spend)), (x.any = true);
  }
  const N: FunnelResult["N"] = {};
  const t = { traffic: 0, paidTraffic: 0, spend: 0, actCost: 0, leads: 0, cust: 0, orders: 0, rev: 0, goals: 0, subs: 0 };
  for (const n of g.nodes) {
    const T = typeOf(n.type);
    const a = sum[n.id];
    const r = { inflow: 0, out: 0, non: 0, rev: 0, cash: 0, ltv: 0, cogs: 0, cost: 0, spend: 0, mrr: 0 };
    if (T && a?.any) {
      if (T.cat === "traffic") {
        r.out = a.v;
        r.spend = a.sp;
        t.traffic += a.v;
        t.spend += a.sp;
        if (a.sp > 0) t.paidTraffic += a.v;
      } else {
        r.inflow = a.v;
        r.out = a.c;
        r.non = Math.max(0, a.v - a.c);
        if (T.cat === "action") {
          r.cost = a.sp;
          t.actCost += a.sp;
        }
      }
      if (T.cat === "offer") {
        r.rev = r.cash = a.r;
        t.rev += a.r;
        t.orders += r.out;
        if (n.p.newc) t.cust += r.out;
        if (baseOf(n.type) === "sub") t.subs += r.out;
      }
      if (T.cat === "page" && n.p.lead) t.leads += r.out;
      if (baseOf(n.type) === "goal") t.goals += r.inflow;
    }
    N[n.id] = r;
  }
  const flows: Record<string, number> = {};
  for (const e of g.edges) {
    const a = N[e.from];
    if (!a) continue;
    flows[e.id] = ((e.port === "alt" ? a.non : a.out) * Number(e.share ?? 100)) / 100;
  }
  const costs = t.spend + t.actCost;
  const profit = t.rev - costs;
  return {
    ...base,
    N,
    flows,
    ...t,
    cash: t.rev,
    ltv: t.rev,
    cogs: 0,
    mrr: 0,
    calls: 0,
    fixed: 0,
    perSale: 0,
    oneTime: 0,
    costs,
    profit,
    aov: t.rev / t.cust,
    cpa: t.spend / t.cust,
    cpl: t.spend / t.leads,
    roas: t.rev / t.spend,
    epc: t.rev / t.traffic,
    conv: t.cust / t.traffic,
    cpc: t.spend / t.paidTraffic,
    roi: profit / costs,
    ltvc: t.rev / t.cust,
    beroas: NaN,
    becpa: NaN,
    leadRate: t.leads / t.traffic,
    payback: 0,
  };
}
