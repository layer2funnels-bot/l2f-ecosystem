// Funnel math engine. Pure functions only: no React, no DOM, no I/O.
// compute(), trafficVals(), offerVals() and warnings() are faithful ports of the prototype;
// with default settings (no expenses, price/cost multipliers = 1) results are identical to it.
import { PER_MONTH, baseOf, isAnnot, isShareLogic, typeOf, type Interval, type NodeParams } from "./catalog";
import type { Expense, FunnelEdge, FunnelNode, FunnelSettings, WhatIf } from "./graph";

/** Same coercion as the prototype's num(): anything non-finite becomes 0. */
export const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
};

export interface GraphLike {
  nodes: FunnelNode[];
  edges: FunnelEdge[];
}
export type MathSettings = Pick<FunnelSettings, "basis" | "fixed"> & {
  whatif?: Partial<WhatIf>;
  expenses?: Expense[];
};

/* ---------------- per-block values ---------------- */
export function trafficVals(n: { p: NodeParams }, costMult = 1) {
  const p = n.p;
  let r: { vis: number; spend: number };
  if (p.model === "cpc") r = { vis: num(p.clicks), spend: num(p.clicks) * num(p.cpc) };
  else if (p.model === "cpm") r = { vis: (num(p.impr) * num(p.ctr)) / 100, spend: (num(p.impr) / 1000) * num(p.cpm) };
  else r = { vis: num(p.visitors), spend: num(p.spend) };
  if (costMult !== 1) r.spend *= costMult;
  return r;
}

export interface OfferValues {
  /** Effective price after discount. */
  eff: number;
  /** Cash collected at the moment of purchase. */
  first: number;
  /** Lifetime revenue per buyer. */
  ltv: number;
  /** Monthly recurring revenue per buyer (subscriptions). */
  mrr: number;
}
export function offerVals(n: { type: string; p: NodeParams }, priceMult = 1): OfferValues {
  const p = n.p;
  const eff = num(p.price) * (1 - num(p.disc) / 100) * priceMult;
  let first = eff,
    ltv = eff,
    mrr = 0;
  if (baseOf(n.type) === "sub") {
    const pm = PER_MONTH[p.interval as Interval] || 1,
      pays = Math.max(1, num(p.life) * pm),
      trial = num(p.trialDays) > 0;
    const setup = num(p.setup) * priceMult,
      trialPrice = num(p.trialPrice) * priceMult;
    first = setup + (trial ? trialPrice : eff);
    ltv = setup + (trial ? trialPrice : 0) + eff * pays;
    mrr = eff * pm;
  }
  if (baseOf(n.type) === "plan") {
    first = eff;
    ltv = eff * Math.max(1, num(p.pays));
  }
  return { eff, first, ltv, mrr };
}

/* ---------------- whole-funnel compute ---------------- */
export interface NodeResult {
  inflow: number;
  out: number;
  non: number;
  rev: number;
  cash: number;
  ltv: number;
  cogs: number;
  cost: number;
  spend: number;
  mrr: number;
}

export interface FunnelResult {
  N: Record<string, NodeResult>;
  flows: Record<string, number>;
  live: FunnelEdge[];
  order: string[];
  traffic: number;
  paidTraffic: number;
  spend: number;
  actCost: number;
  leads: number;
  cust: number;
  orders: number;
  rev: number;
  cash: number;
  ltv: number;
  cogs: number;
  mrr: number;
  goals: number;
  calls: number;
  subs: number;
  /** Fixed costs per period: settings.fixed + monthly expenses. */
  fixed: number;
  /** Per-sale expenses × orders. */
  perSale: number;
  /** One-time (launch) expenses; excluded from per-period profit. */
  oneTime: number;
  costs: number;
  profit: number;
  aov: number;
  cpa: number;
  cpl: number;
  roas: number;
  epc: number;
  conv: number;
  cpc: number;
  roi: number;
  ltvc: number;
  beroas: number;
  /** Most you can pay per customer without losing money. */
  becpa: number;
  leadRate: number;
  /** Months of profit needed to recover one-time expenses (NaN if not profitable). */
  payback: number;
}

const emptyNode = (): NodeResult => ({ inflow: 0, out: 0, non: 0, rev: 0, cash: 0, ltv: 0, cogs: 0, cost: 0, spend: 0, mrr: 0 });

export function expenseTotals(expenses: Expense[] = []) {
  let monthly = 0,
    perSale = 0,
    oneTime = 0;
  for (const e of expenses) {
    const a = num(e.amount);
    if (e.kind === "monthly") monthly += a;
    else if (e.kind === "per_sale") perSale += a;
    else oneTime += a;
  }
  return { monthly, perSale, oneTime };
}

/** Topological order (Kahn), nodes in cycles appended in document order. Same as the prototype. */
function flowOrder(nodes: FunnelNode[], live: FunnelEdge[]) {
  const indeg: Record<string, number> = {};
  nodes.forEach((n) => (indeg[n.id] = 0));
  live.forEach((e) => indeg[e.to]++);
  const q = nodes.filter((n) => !indeg[n.id]).map((n) => n.id),
    order: string[] = [],
    seen = new Set<string>();
  while (q.length) {
    const id = q.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    order.push(id);
    live.forEach((e) => {
      if (e.from === id && --indeg[e.to] <= 0 && !seen.has(e.to)) q.push(e.to);
    });
  }
  nodes.forEach((n) => {
    if (!seen.has(n.id)) order.push(n.id);
  });
  return order;
}

export interface ComputeOptions {
  /** Only let this traffic source emit visitors (per-source breakdown). */
  only?: string;
  /** Only let these traffic sources emit visitors (paid / free split for reinvestment). */
  sources?: string[];
}

export function compute(g: GraphLike, s: MathSettings, opts: ComputeOptions = {}): FunnelResult {
  const wt = num(s.whatif?.traffic) || 1,
    wc = num(s.whatif?.conv) || 1,
    wp = num(s.whatif?.price) || 1,
    wk = num(s.whatif?.cost) || 1;
  const only = opts.only;
  const allowed = opts.sources ? new Set(opts.sources) : null;
  const B: Record<string, FunnelNode> = Object.fromEntries(g.nodes.map((n) => [n.id, n]));
  const N: Record<string, NodeResult> = {};
  g.nodes.forEach((n) => (N[n.id] = emptyNode()));
  const live = g.edges.filter((e) => B[e.from] && B[e.to] && !isAnnot(B[e.from].type) && !isAnnot(B[e.to].type));
  const order = flowOrder(g.nodes, live);
  const flows: Record<string, number> = {};

  for (const id of order) {
    const n = B[id],
      T = typeOf(n.type),
      r = N[id];
    if (!T || T.cat === "annot") continue;
    if (T.cat === "traffic") {
      const v = trafficVals(n, wk),
        on = (!only || only === id) && (!allowed || allowed.has(id));
      r.out = on ? v.vis * wt : 0;
      r.spend = on ? v.spend * wt : 0;
      r.non = 0;
    } else if (isShareLogic(n.type)) {
      r.out = (r.inflow * num(n.p.pct)) / 100;
      r.non = r.inflow - r.out;
    } else {
      const cr = Math.min(100, num(n.p.cr) * (T.cat === "logic" ? 1 : wc)) / 100;
      r.out = r.inflow * cr;
      r.non = r.inflow - r.out;
    }
    if (T.cat === "action") r.cost = r.inflow * num(n.p.costPer);
    if (T.cat === "offer") {
      const v = offerVals(n, wp),
        keep = 1 - num(n.p.refund) / 100;
      r.cash = r.out * v.first * keep;
      r.ltv = r.out * v.ltv * keep;
      r.mrr = r.out * v.mrr * keep;
      r.rev = s.basis === "ltv" ? r.ltv : r.cash;
      r.cogs = r.out * num(n.p.fulfil) + (r.rev * num(n.p.aff)) / 100;
    }
    for (const e of live) {
      if (e.from !== id) continue;
      const f = ((e.port === "alt" ? r.non : r.out) * num(e.share ?? 100)) / 100;
      flows[e.id] = f;
      N[e.to].inflow += f;
    }
  }

  const t = { traffic: 0, paidTraffic: 0, spend: 0, actCost: 0, leads: 0, cust: 0, orders: 0, rev: 0, cash: 0, ltv: 0, cogs: 0, mrr: 0, goals: 0, calls: 0, subs: 0 };
  for (const n of g.nodes) {
    const T = typeOf(n.type),
      r = N[n.id];
    if (!T) continue;
    if (T.cat === "traffic") {
      t.traffic += r.out;
      t.spend += r.spend;
      if (r.spend > 0) t.paidTraffic += r.out;
    }
    if (T.cat === "page" && n.p.lead) t.leads += r.out;
    if (T.cat === "action") {
      t.actCost += r.cost;
      if (n.type === "call") t.calls += r.out;
    }
    if (T.cat === "offer") {
      t.orders += r.out;
      t.rev += r.rev;
      t.cash += r.cash;
      t.ltv += r.ltv;
      t.cogs += r.cogs;
      t.mrr += r.mrr;
      if (n.p.newc) t.cust += r.out;
      if (baseOf(n.type) === "sub") t.subs += r.out;
    }
    if (baseOf(n.type) === "goal") t.goals += r.out;
  }

  const ex = expenseTotals(s.expenses);
  const fixed = num(s.fixed) + ex.monthly,
    perSale = ex.perSale * t.orders;
  const costs = t.spend + t.actCost + t.cogs + fixed + perSale,
    profit = t.rev - costs;
  return {
    N,
    flows,
    live,
    order,
    ...t,
    fixed,
    perSale,
    oneTime: ex.oneTime,
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
    ltvc: t.ltv / t.cust,
    beroas: costs > 0 && t.spend > 0 ? costs / t.spend : NaN,
    becpa: (t.rev - t.actCost - t.cogs - fixed - perSale) / t.cust,
    leadRate: t.leads / t.traffic,
    payback: ex.oneTime > 0 ? (profit > 0 ? ex.oneTime / profit : NaN) : 0,
  };
}

/* ---------------- reports ---------------- */
export function warnings(g: GraphLike): string[] {
  const w: string[] = [];
  for (const n of g.nodes) {
    const T = typeOf(n.type);
    if (!T || T.cat === "annot") continue;
    const outs = g.edges.filter((e) => e.from === n.id);
    if (T.cat !== "traffic" && !g.edges.some((e) => e.to === n.id)) w.push(`“${n.name}” has no incoming connection, so nobody reaches it.`);
    const [yes, no] = T.ports ?? ["Yes", "No"];
    if (baseOf(n.type) === "cond" && (!outs.some((e) => e.port !== "alt") || !outs.some((e) => e.port === "alt")))
      w.push(`Condition “${n.name}” is missing its ${!outs.some((e) => e.port !== "alt") ? yes : no} path.`);
    if (baseOf(n.type) === "split" && outs.length < 2) w.push(`Split “${n.name}” needs both a ${yes} and a ${no} path.`);
    if (baseOf(n.type) === "sub" && !num(n.p.life)) w.push(`Subscription “${n.name}” has 0 months average stay, so lifetime value equals one payment.`);
  }
  if (!g.nodes.some((n) => typeOf(n.type)?.cat === "traffic") && g.nodes.length) w.push("Add a traffic source so numbers can flow.");
  return w;
}

/** Node ids that have a warning (red border on canvas). */
export function warnNodeIds(g: GraphLike): Set<string> {
  const ids = new Set<string>();
  for (const n of g.nodes) {
    const T = typeOf(n.type);
    if (!T || T.cat === "annot") continue;
    const outs = g.edges.filter((e) => e.from === n.id);
    if (T.cat !== "traffic" && !g.edges.some((e) => e.to === n.id)) ids.add(n.id);
    if (baseOf(n.type) === "cond" && (!outs.some((e) => e.port !== "alt") || !outs.some((e) => e.port === "alt"))) ids.add(n.id);
    if (baseOf(n.type) === "split" && outs.length < 2) ids.add(n.id);
  }
  return ids;
}

export interface StepRow {
  id: string;
  name: string;
  type: string;
  label: string;
  cat: string;
  inn: number;
  out: number;
  non: number;
  dropPct: number;
  convPct: number;
  rev: number;
  cost: number;
}
/** Steps tab / CSV rows: every flow block in document order. */
export function stepRows(g: GraphLike, R: FunnelResult): StepRow[] {
  return g.nodes
    .filter((n) => typeOf(n.type) && !isAnnot(n.type))
    .map((n) => {
      const r = R.N[n.id],
        T = typeOf(n.type);
      const inn = T.cat === "traffic" ? r.out : r.inflow;
      return {
        id: n.id,
        name: n.name,
        type: n.type,
        label: T.label,
        cat: T.cat,
        inn,
        out: r.out,
        non: r.non,
        dropPct: T.cat === "traffic" ? NaN : inn ? r.non / inn : NaN,
        convPct: inn ? r.out / inn : NaN,
        rev: r.rev,
        cost: r.spend + r.cost + r.cogs,
      };
    });
}

export interface SourceRow {
  id: string;
  name: string;
  traffic: number;
  cust: number;
  rev: number;
  spend: number;
  cpa: number;
  roas: number;
}
/** Sources tab: what each traffic source brings in on its own. */
export function sourceRows(g: GraphLike, s: MathSettings): SourceRow[] {
  return g.nodes
    .filter((n) => typeOf(n.type)?.cat === "traffic")
    .map((n) => {
      const x = compute(g, s, { only: n.id });
      return { id: n.id, name: n.name, traffic: x.traffic, cust: x.cust, rev: x.rev, spend: x.spend, cpa: x.spend / x.cust, roas: x.rev / x.spend };
    });
}

/** What-if tab: what it takes to hit a revenue target at today's rates. */
export function targetPlan(R: FunnelResult, target: number) {
  const rpv = R.rev / R.traffic,
    need = target / rpv,
    cpv = R.spend / R.traffic;
  return { visitorsNeeded: need, extraVisitors: need - R.traffic, spendNeeded: need * cpv, customersNeeded: target / R.aov };
}

/* ---------------- scenarios ---------------- */
export function computeScenario(g: GraphLike, s: MathSettings, sc: { whatif: Partial<WhatIf>; fixed?: number }) {
  return compute(g, { ...s, whatif: sc.whatif, fixed: sc.fixed ?? s.fixed });
}

/* ---------------- goal seek ---------------- */
export type SeekLever = "traffic" | "conv" | "price" | "cost";
export type SeekMetric = "profit" | "rev" | "cust";

/**
 * Find the multiplier on one lever (all other what-ifs held) that makes `metric` hit `target`.
 * Bisection over [lo, hi]. Returns NaN if the target can't be reached in range.
 */
export function goalSeek(g: GraphLike, s: MathSettings, lever: SeekLever, metric: SeekMetric, target: number, lo = 0.01, hi = 100): number {
  const f = (m: number) => {
    const R = compute(g, { ...s, whatif: { ...s.whatif, [lever]: m } });
    return R[metric] - target;
  };
  let a = lo,
    b = hi,
    fa = f(a),
    fb = f(b);
  if (!Number.isFinite(fa) || !Number.isFinite(fb)) return NaN;
  if (fa === 0) return a;
  if (fb === 0) return b;
  if (Math.sign(fa) === Math.sign(fb)) return NaN;
  for (let i = 0; i < 80; i++) {
    const m = (a + b) / 2,
      fm = f(m);
    if (Math.abs(fm) < 1e-6 || b - a < 1e-7) return m;
    if (Math.sign(fm) === Math.sign(fa)) {
      a = m;
      fa = fm;
    } else {
      b = m;
      fb = fm;
    }
  }
  return (a + b) / 2;
}

/* ---------------- month-by-month projection ---------------- */
export interface ProjectionRow {
  month: number;
  traffic: number;
  leads: number;
  newCustomers: number;
  orders: number;
  activeSubs: number;
  revenue: number;
  /** Ad spend this month. */
  adSpend: number;
  /** Follow-up costs (SMS, calls…) this month. */
  followUp: number;
  /** Delivery cost and affiliate commission this month. */
  delivery: number;
  /** Business expenses: fixed costs, monthly and per-order expenses, plus one-time costs in month 1. */
  expenses: number;
  costs: number;
  profit: number;
  cumulative: number;
  /** Revenue received to date. */
  cumulativeRevenue: number;
  mrr: number;
  /** Profit from the previous month put back into ads this month (traffic reinvestment only). */
  reinvested: number;
}

export interface ProjectOptions {
  /**
   * Share (0–100) of each month's profit spent on extra paid traffic the next month, at the funnel's current cost
   * per paid visitor. Free traffic is unaffected. 0 = no reinvestment (the plain forecast).
   */
  reinvestPct?: number;
}

/**
 * Projects cash over `months`. Each month launches a cohort: compute() with traffic scaled by (1 + growth%)^m
 * (with reinvestment, paid traffic also grows by the reinvested budget). Results are linear in traffic, so a
 * cohort is free-traffic results + paid scale × paid-traffic results.
 * One-time offers pay once; subscriptions pay `first` then `eff × per-month` each month, retained with monthly
 * churn 1/life; payment plans spread their payments over their schedule.
 * Costs: ad spend, follow-up costs, delivery (on sale), affiliate % (on cash received), fixed + monthly
 * expenses every month, per-sale expenses on each order, one-time expenses in month 1.
 */
export function project(g: GraphLike, s: MathSettings, months = 12, growthPct = 0, opts: ProjectOptions = {}): ProjectionRow[] {
  const wp = num(s.whatif?.price) || 1;
  const sb: MathSettings = { ...s, basis: "first" };
  const base = compute(g, sb);
  const ex = expenseTotals(s.expenses);
  const offers = g.nodes.filter((n) => typeOf(n.type)?.cat === "offer");
  const reinvest = Math.max(0, num(opts.reinvestPct)) / 100;
  // split traffic only when reinvesting (otherwise the paid part is the whole funnel and scales the same)
  const paidIds = g.nodes.filter((n) => typeOf(n.type)?.cat === "traffic" && base.N[n.id]?.spend > 0).map((n) => n.id);
  const paid = reinvest > 0 && paidIds.length ? compute(g, sb, { sources: paidIds }) : null;
  const free = paid ? compute(g, sb, { sources: g.nodes.filter((n) => typeOf(n.type)?.cat === "traffic" && !paidIds.includes(n.id)).map((n) => n.id) }) : null;

  const revenue = new Array(months).fill(0),
    affCost = new Array(months).fill(0),
    activeSubs = new Array(months).fill(0),
    mrrArr = new Array(months).fill(0);
  const rows: ProjectionRow[] = [];
  let cum = 0,
    cumRev = 0,
    lastProfit = 0;

  for (let c = 0; c < months; c++) {
    const g0 = Math.pow(1 + num(growthPct) / 100, c);
    const reinvested = paid && c > 0 ? reinvest * Math.max(0, lastProfit) : 0;
    // paid traffic scale: the grown budget plus the reinvested budget at today's cost per paid visitor
    const kPaid = paid ? g0 + (paid.spend > 0 ? reinvested / paid.spend : 0) : g0;
    const kFree = g0;
    const out = (id: string) => (paid && free ? free.N[id].out * kFree + paid.N[id].out * kPaid : base.N[id].out * g0);
    const tot = (k: keyof FunnelResult) => (paid && free ? (free[k] as number) * kFree + (paid[k] as number) * kPaid : (base[k] as number) * g0);

    for (const n of offers) {
      const buyers = out(n.id);
      if (!buyers) continue;
      const v = offerVals(n, wp),
        keep = 1 - num(n.p.refund) / 100,
        aff = num(n.p.aff) / 100;
      const pay = (m: number, amount: number) => {
        if (m >= months) return;
        revenue[m] += amount * keep;
        affCost[m] += amount * keep * aff;
      };
      if (baseOf(n.type) === "sub") {
        const pm = PER_MONTH[n.p.interval as Interval] || 1;
        const life = num(n.p.life),
          churn = life > 0 ? Math.min(1, 1 / life) : 1;
        pay(c, buyers * v.first);
        for (let a = 1; c + a < months; a++) {
          const alive = buyers * Math.pow(1 - churn, a);
          if (alive < 1e-9) break;
          pay(c + a, alive * v.eff * pm);
        }
        for (let a = 0; c + a < months; a++) {
          const alive = buyers * Math.pow(1 - churn, a);
          activeSubs[c + a] += alive * keep;
          mrrArr[c + a] += alive * keep * v.mrr;
        }
      } else if (baseOf(n.type) === "plan") {
        const pays = Math.max(1, num(n.p.pays)),
          step = 1 / (PER_MONTH[n.p.interval as Interval] || 1);
        for (let i = 0; i < pays; i++) pay(c + Math.floor(i * step), buyers * v.eff);
      } else pay(c, buyers * v.first);
    }

    // every cohort up to this month has paid in, so this month's revenue is final
    const m = c;
    const fulfil = offers.reduce((acc, n) => acc + out(n.id) * num(n.p.fulfil), 0);
    const adSpend = tot("spend"),
      followUp = tot("actCost"),
      orders = tot("orders");
    const delivery = fulfil + affCost[m];
    const expenses = num(s.fixed) + ex.monthly + ex.perSale * orders + (m === 0 ? ex.oneTime : 0);
    const costs = adSpend + followUp + delivery + expenses;
    const profit = revenue[m] - costs;
    cum += profit;
    cumRev += revenue[m];
    lastProfit = profit;
    rows.push({
      month: m + 1,
      traffic: tot("traffic"),
      leads: tot("leads"),
      newCustomers: tot("cust"),
      orders,
      activeSubs: activeSubs[m],
      revenue: revenue[m],
      adSpend,
      followUp,
      delivery,
      expenses,
      costs,
      profit,
      cumulative: cum,
      cumulativeRevenue: cumRev,
      mrr: mrrArr[m],
      reinvested,
    });
  }
  return rows;
}

/* ---------------- periods ---------------- */
/** The funnel models one month (as the forecast does). Factors from a month to other periods. */
export const PERIOD_FACTORS = { day: 12 / 365, week: 12 / 52, month: 1, quarter: 3, year: 12 } as const;
export type PeriodKey = keyof typeof PERIOD_FACTORS;
export const periodFactor = (p: PeriodKey | number) => (typeof p === "number" ? (Math.max(0, p) * 12) / 365 : PERIOD_FACTORS[p]);

export interface PeriodNumbers {
  people: number;
  leads: number;
  customers: number;
  orders: number;
  revenue: number;
  adSpend: number;
  expenses: number;
  costs: number;
  profit: number;
  roi: number;
  roas: number;
  cpc: number;
  cpl: number;
  cpa: number;
}
/** One month's results scaled to another period (everything in the funnel is linear in time, so ratios hold). */
export function periodNumbers(R: FunnelResult, factor: number): PeriodNumbers {
  const k = factor;
  return {
    people: R.traffic * k,
    leads: R.leads * k,
    customers: R.cust * k,
    orders: R.orders * k,
    revenue: R.rev * k,
    adSpend: R.spend * k,
    expenses: (R.costs - R.spend) * k,
    costs: R.costs * k,
    profit: R.profit * k,
    roi: R.roi,
    roas: R.roas,
    cpc: R.cpc,
    cpl: R.cpl,
    cpa: R.cpa,
  };
}

/* ---------------- goals ---------------- */
export type GoalKind = "revenue" | "profit" | "traffic" | "customers" | "leads" | "step" | "conversion";

export interface GoalPlan {
  /** False when the goal can't be reached by changing traffic alone. */
  reachable: boolean;
  /** Traffic multiplier needed (1 = today). */
  multiplier: number;
  /** Monthly results at the required traffic (from compute()). */
  R: FunnelResult | null;
}

/**
 * What it takes to hit a monthly goal by scaling traffic at today's rates: goal seek on the traffic lever, then
 * compute() at that traffic. `step` goals count people completing a block (`nodeId`).
 */
export function goalPlan(g: GraphLike, s: MathSettings, goal: { kind: GoalKind; value: number; nodeId?: string }): GoalPlan {
  const target = num(goal.value);
  const at = (k: number) => compute(g, { ...s, whatif: { ...s.whatif, traffic: (num(s.whatif?.traffic) || 1) * k } });
  if (!(target > 0) || goal.kind === "conversion") return { reachable: false, multiplier: NaN, R: null };
  let k: number;
  if (goal.kind === "step") {
    const now = compute(g, s).N[goal.nodeId ?? ""]?.out ?? 0;
    k = now > 0 ? target / now : NaN;
  } else if (goal.kind === "traffic") {
    const now = compute(g, s).traffic;
    k = now > 0 ? target / now : NaN;
  } else {
    const metric = goal.kind === "revenue" ? "rev" : goal.kind === "customers" ? "cust" : goal.kind;
    const base = compute(g, s);
    const cur = base[metric];
    // revenue, customers and leads are proportional to traffic; profit isn't (fixed costs), so seek it
    if (metric !== "profit") k = cur > 0 ? target / cur : NaN;
    else k = goalSeekValue((m) => at(m).profit - target, 0.0001, 10000);
  }
  if (!Number.isFinite(k) || k <= 0) return { reachable: false, multiplier: NaN, R: null };
  return { reachable: true, multiplier: k, R: at(k) };
}

/** Bisection on a monotonic function; NaN when the root isn't bracketed. */
function goalSeekValue(f: (m: number) => number, lo: number, hi: number) {
  let a = lo,
    b = hi,
    fa = f(a);
  const fb = f(b);
  if (!Number.isFinite(fa) || !Number.isFinite(fb) || Math.sign(fa) === Math.sign(fb)) return fa === 0 ? a : NaN;
  for (let i = 0; i < 100; i++) {
    const m = (a + b) / 2,
      fm = f(m);
    if (Math.abs(fm) < 1e-7 || b - a < 1e-9) return m;
    if (Math.sign(fm) === Math.sign(fa)) {
      a = m;
      fa = fm;
    } else b = m;
  }
  return (a + b) / 2;
}

/** Results if one block converted at `rate` % (Yes / A share for share logic) instead of today's rate. */
export function withStepRate(g: GraphLike, s: MathSettings, nodeId: string, rate: number): FunnelResult {
  const key = (n: { type: string }) => (isShareLogic(n.type) ? "pct" : "cr");
  const nodes = g.nodes.map((n) => (n.id === nodeId ? { ...n, p: { ...n.p, [key(n)]: Math.max(0, Math.min(100, num(rate))) } } : n));
  return compute({ nodes, edges: g.edges }, s);
}
/** A block's own rate (conversion %, or Yes / A share for share logic). */
export const stepRate = (n: { type: string; p: NodeParams }) => num(isShareLogic(n.type) ? n.p.pct : n.p.cr);

/* ---------------- leaks ---------------- */
export interface Leak {
  id: string;
  name: string;
  label: string;
  inn: number;
  lost: number;
  dropPct: number;
  /** Monthly revenue and profit gained if this step converted 10% better (relative). */
  revenueGain: number;
  profitGain: number;
}
/**
 * Steps ranked by people lost (pages, offers and actions; share logic isn't a leak, it routes people).
 * The top one is the funnel's key leak.
 */
export function leaks(g: GraphLike, s: MathSettings, R: FunnelResult = compute(g, s)): Leak[] {
  return g.nodes
    .filter((n) => ["page", "offer", "action"].includes(typeOf(n.type)?.cat) && R.N[n.id]?.inflow > 0 && R.N[n.id].non > 0)
    .map((n) => {
      const r = R.N[n.id];
      const better = withStepRate(g, s, n.id, stepRate(n) * 1.1);
      return { id: n.id, name: n.name, label: typeOf(n.type).label, inn: r.inflow, lost: r.non, dropPct: r.non / r.inflow, revenueGain: better.rev - R.rev, profitGain: better.profit - R.profit };
    })
    .sort((a, b) => b.lost - a.lost);
}

/* ---------------- planned vs actual ---------------- */
export interface ActualRow {
  node_id: string;
  visitors: number | null;
  conversions: number | null;
  revenue: number | null;
  spend: number | null;
}
export interface PlanVsActualRow {
  id: string;
  name: string;
  cat: string;
  planIn: number;
  planOut: number;
  planRev: number;
  planSpend: number;
  actIn: number | null;
  actOut: number | null;
  actRev: number | null;
  actSpend: number | null;
  planCr: number;
  actCr: number;
}
/** Planned numbers scaled to `periodScale` (e.g. days/30 for a date range) next to summed actuals. */
export function planVsActual(g: GraphLike, R: FunnelResult, actuals: ActualRow[], periodScale = 1): PlanVsActualRow[] {
  const byNode: Record<string, { v: number | null; c: number | null; r: number | null; s: number | null }> = {};
  const add = (a: number | null, b: number | null) => (b == null ? a : (a ?? 0) + Number(b));
  for (const a of actuals) {
    const cur = (byNode[a.node_id] ??= { v: null, c: null, r: null, s: null });
    cur.v = add(cur.v, a.visitors);
    cur.c = add(cur.c, a.conversions);
    cur.r = add(cur.r, a.revenue);
    cur.s = add(cur.s, a.spend);
  }
  return stepRows(g, R).map((row) => {
    const a = byNode[row.id];
    const planSpend = (R.N[row.id].spend + R.N[row.id].cost) * periodScale;
    return {
      id: row.id,
      name: row.name,
      cat: row.cat,
      planIn: row.inn * periodScale,
      planOut: row.out * periodScale,
      planRev: row.rev * periodScale,
      planSpend,
      actIn: a?.v ?? null,
      actOut: a?.c ?? null,
      actRev: a?.r ?? null,
      actSpend: a?.s ?? null,
      planCr: row.convPct,
      actCr: a && a.v ? (a.c ?? 0) / a.v : NaN,
    };
  });
}

/** Key numbers stored alongside a funnel for list views (client portfolio, dashboard). */
export function summary(R: FunnelResult) {
  const f = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
  return { rev: f(R.rev), profit: f(R.profit), roas: f(R.roas), cpa: f(R.cpa), mrr: f(R.mrr), spend: f(R.spend), cust: f(R.cust), traffic: f(R.traffic) };
}
export type FunnelSummary = ReturnType<typeof summary>;
