import { describe, expect, it } from "vitest";
import { baseOf, BLOCK_TYPES, isShareLogic, libOf, portsFor, typeOf } from "@/lib/catalog";
import { compute, goalPlan, leaks, offerVals, periodFactor, periodNumbers, project, withStepRate } from "@/lib/funnel-math";
import { goalReport } from "@/lib/report-data";
import { parseSettings, type FunnelNode } from "@/lib/graph";
import { builtinTemplate } from "@/lib/templates";

const quiz = () => {
  const t = builtinTemplate("quiz");
  return { graph: t.graph, settings: { ...t.settings, basis: "first" as const } };
};

describe("block types reuse the existing maths", () => {
  it("every type has a known category, icon and library group", () => {
    for (const [k, t] of Object.entries(BLOCK_TYPES)) {
      expect(t.cat, k).toMatch(/^(traffic|page|offer|action|logic|annot)$/);
      expect(libOf(k), k).toBeTruthy();
    }
  });
  it("membership bills like a subscription, qualification splits like a condition", () => {
    const p = { ...typeOf("membership").d, price: 50 };
    expect(offerVals({ type: "membership", p })).toEqual(offerVals({ type: "sub", p }));
    expect(baseOf("qualifier")).toBe("cond");
    expect(isShareLogic("randsplit")).toBe(true);
    expect(portsFor("qualifier").labels).toEqual(["Qualified", "Not"]);
    expect(portsFor("endp").hasOut).toBe(false);
    expect(portsFor("lost").hasOut).toBe(false);
  });
  it("a qualification block routes people exactly like a Yes/No condition", () => {
    const { graph, settings } = quiz();
    const swapped = { ...graph, nodes: graph.nodes.map((n) => (n.type === "cond" ? { ...n, type: "qualifier" } : n)) };
    expect(compute(swapped, settings).rev).toBeCloseTo(compute(graph, settings).rev, 9);
  });
});

describe("forecast rows are itemised and reinvestment is additive", () => {
  const { graph, settings } = quiz();
  it("costs = ad spend + follow-up + delivery + expenses", () => {
    const s = { ...settings, fixed: 300, expenses: [{ id: "x", name: "Tool", kind: "one_time" as const, amount: 1000, category: "Software" }] };
    for (const r of project(graph, s, 12, 5)) expect(r.adSpend + r.followUp + r.delivery + r.expenses).toBeCloseTo(r.costs, 6);
    const rows = project(graph, s, 3);
    expect(rows[0].expenses).toBeCloseTo(1300, 6);
    expect(rows[1].expenses).toBeCloseTo(300, 6);
    expect(rows[0].leads).toBeCloseTo(compute(graph, s).leads, 6);
  });
  it("0% reinvestment is the plain forecast", () => {
    expect(project(graph, settings, 12, 3, { reinvestPct: 0 })).toEqual(project(graph, settings, 12, 3));
  });
  it("reinvesting 50% of profit buys paid traffic the next month at today's cost per visitor", () => {
    const plain = project(graph, settings, 6);
    const re = project(graph, settings, 6, 0, { reinvestPct: 50 });
    expect(re[0].reinvested).toBe(0);
    expect(re[0].revenue).toBeCloseTo(plain[0].revenue, 6);
    expect(re[1].reinvested).toBeCloseTo(re[0].profit * 0.5, 6);
    expect(re[1].adSpend).toBeCloseTo(plain[1].adSpend + re[1].reinvested, 6);
    const R = compute(graph, settings);
    expect(re[1].traffic - plain[1].traffic).toBeCloseTo(re[1].reinvested / (R.spend / R.paidTraffic), 6);
    expect(re[5].cumulative).toBeGreaterThan(plain[5].cumulative);
  });
});

describe("periods, goals and leaks come from compute()", () => {
  const { graph, settings } = quiz();
  const R = compute(graph, settings);
  it("period numbers scale a month linearly", () => {
    expect(periodFactor("year")).toBe(12);
    expect(periodFactor(30)).toBeCloseTo(30 * 12 / 365, 9);
    const y = periodNumbers(R, 12);
    expect(y.revenue).toBeCloseTo(R.rev * 12, 6);
    expect(y.profit).toBeCloseTo(R.profit * 12, 6);
    expect(y.roas).toBeCloseTo(R.roas, 9);
  });
  it("revenue, customer and profit goals solve back to the target", () => {
    const rev = goalPlan(graph, settings, { kind: "revenue", value: 12064.22 });
    expect(rev.reachable).toBe(true);
    expect(rev.multiplier).toBeCloseTo(2, 4);
    expect(rev.R!.rev).toBeCloseTo(12064.22, 2);
    const s = { ...settings, fixed: 1000 };
    const profit = goalPlan(graph, s, { kind: "profit", value: 20000 });
    expect(profit.R!.profit).toBeCloseTo(20000, 2);
    const cust = goalPlan(graph, settings, { kind: "customers", value: 178.2 });
    expect(cust.R!.cust).toBeCloseTo(178.2, 4);
    const callId = graph.nodes.find((n) => n.name === "Free call")!.id;
    const step = goalPlan(graph, settings, { kind: "step", value: 108, nodeId: callId });
    expect(step.R!.N[callId].out).toBeCloseTo(108, 4);
    expect(goalPlan(graph, settings, { kind: "revenue", value: 0 }).reachable).toBe(false);
  });
  it("traffic goals and period-based targets resolve through the same monthly engine", () => {
    const daily = goalReport(graph, settings, R, { id: "traffic", name: "Daily visitors", kind: "traffic", value: 200, period: "day" });
    expect(daily.label).toBe("traffic per day");
    expect(daily.current).toBeCloseTo(R.traffic * (12 / 365), 8);
    expect(daily.plan?.reachable).toBe(true);
    expect(daily.plan!.R!.traffic * (12 / 365)).toBeCloseTo(200, 6);

    const annualRevenue = goalReport(graph, settings, R, { id: "revenue", name: "Annual revenue", kind: "revenue", value: 120000, period: "year" });
    expect(annualRevenue.current).toBeCloseTo(R.rev * 12, 6);
    expect((annualRevenue.plan?.R?.rev ?? 0) * 12).toBeCloseTo(120000, 2);
  });
  it("step-rate impact and the key leak", () => {
    const trial = graph.nodes.find((n) => n.name === "7-day free trial")!;
    const better = withStepRate(graph, settings, trial.id, 30);
    expect(better.N[trial.id].out).toBeCloseTo(300, 6);
    const L = leaks(graph, settings, R);
    expect(L[0].name).toBe("Quiz funnel");
    expect(L[0].lost).toBeCloseTo(1500, 6);
    for (let i = 1; i < L.length; i++) expect(L[i - 1].lost).toBeGreaterThanOrEqual(L[i].lost);
    expect(L[0].revenueGain).toBeGreaterThan(0);
  });
});

describe("settings stay backward compatible", () => {
  it("old settings get empty goals, private notes and no reinvestment", () => {
    const s = parseSettings({ basis: "first", fixed: 0 });
    expect(s.goals).toEqual([]);
    expect(s.notes).toEqual({ body: "", shared: false });
    expect(s.reinvest).toEqual({ pct: 0, months: 12 });
  });
  it("step status is optional on nodes", () => {
    const n: FunnelNode = { id: "a", type: "landing", name: "", x: 0, y: 0, p: {}, status: "done" };
    expect(n.status).toBe("done");
  });
});
