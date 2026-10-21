import { describe, expect, it } from "vitest";
import fixtures from "../fixtures/prototype-results.json";
import { compute, goalSeek, offerVals, project, sourceRows, stepRows, trafficVals, warnings, planVsActual } from "@/lib/funnel-math";
import { builtinTemplate, BUILTIN_KEYS } from "@/lib/templates";
import { blankSettings } from "@/lib/graph";

type Fx = Record<string, { name: string; variants: Record<string, any> }>;
const FX = fixtures as Fx;

const dec = (v: unknown) => (v === "NaN" ? NaN : v === "Infinity" ? Infinity : v === "-Infinity" ? -Infinity : (v as number));
function close(actual: number, expected: unknown, label: string) {
  const e = dec(expected);
  if (Number.isNaN(e)) return expect(actual, label).toBeNaN();
  if (!Number.isFinite(e)) return expect(actual, label).toBe(e);
  expect(actual, label).toBeCloseTo(e as number, 6);
}

describe("matches the prototype on every built-in template", () => {
  for (const key of BUILTIN_KEYS) {
    for (const [vk, fx] of Object.entries(FX[key].variants)) {
      it(`${key} / ${vk}`, () => {
        const t = builtinTemplate(key);
        expect(t.name).toBe(FX[key].name);
        const s = { ...blankSettings(), basis: fx.settings.basis, fixed: fx.settings.fixed, whatif: { ...fx.settings.whatif, price: 1, cost: 1 } };
        const R = compute(t.graph, s);
        for (const [k, v] of Object.entries(fx.totals)) close((R as any)[k], v, `total ${k}`);
        t.graph.nodes.forEach((n, i) => {
          for (const [k, v] of Object.entries(fx.nodes[i])) if (k !== "type" && k !== "name") close((R.N[n.id] as any)[k], v, `${n.name}.${k}`);
        });
        t.graph.edges.forEach((e, i) => close(R.flows[e.id] ?? (null as any), fx.flows[i], `flow ${i}`));
        const src = sourceRows(t.graph, s);
        fx.sources.forEach((x: any, i: number) => {
          close(src[i].traffic, x.traffic, "src traffic");
          close(src[i].cust, x.cust, "src cust");
          close(src[i].rev, x.rev, "src rev");
          close(src[i].spend, x.spend, "src spend");
        });
        expect(warnings(t.graph)).toEqual(fx.warnings);
      });
    }
  }
});

describe("traffic cost models", () => {
  it("budget", () => expect(trafficVals({ p: { model: "budget", visitors: 1000, spend: 500 } })).toEqual({ vis: 1000, spend: 500 }));
  it("cpc", () => expect(trafficVals({ p: { model: "cpc", clicks: 800, cpc: 1.2 } })).toEqual({ vis: 800, spend: 960 }));
  it("cpm + ctr", () => {
    const v = trafficVals({ p: { model: "cpm", impr: 200000, cpm: 9, ctr: 1.2 } });
    expect(v.vis).toBeCloseTo(2400);
    expect(v.spend).toBeCloseTo(1800);
  });
  it("cost multiplier scales spend only", () => expect(trafficVals({ p: { model: "cpc", clicks: 100, cpc: 2 } }, 1.5)).toEqual({ vis: 100, spend: 300 }));
});

describe("offer values", () => {
  it("one-time with discount", () => expect(offerVals({ type: "product", p: { price: 100, disc: 20 } }).first).toBe(80));
  it("subscription with trial and setup", () => {
    const v = offerVals({ type: "sub", p: { price: 20, interval: "monthly", trialDays: 7, trialPrice: 1, setup: 10, life: 6 } });
    expect(v.first).toBe(11);
    expect(v.ltv).toBe(10 + 1 + 20 * 6);
    expect(v.mrr).toBe(20);
  });
  it("weekly subscription MRR", () => expect(offerVals({ type: "sub", p: { price: 12, interval: "weekly", life: 3 } }).mrr).toBeCloseTo((12 * 52) / 12));
  it("payment plan", () => {
    const v = offerVals({ type: "plan", p: { price: 333, pays: 3 } });
    expect(v.first).toBe(333);
    expect(v.ltv).toBe(999);
  });
});

describe("expenses", () => {
  it("monthly and per-sale expenses reduce profit; one-time gives payback", () => {
    const t = builtinTemplate("webinar");
    const s = blankSettings();
    const base = compute(t.graph, s);
    const R = compute(t.graph, {
      ...s,
      expenses: [
        { id: "a", name: "Software", kind: "monthly", amount: 300, category: "Software" },
        { id: "b", name: "Fulfilment", kind: "per_sale", amount: 5, category: "Other" },
        { id: "c", name: "Build", kind: "one_time", amount: 5000, category: "Team" },
      ],
    });
    expect(R.profit).toBeCloseTo(base.profit - 300 - 5 * base.orders);
    expect(R.oneTime).toBe(5000);
    expect(R.payback).toBeCloseTo(5000 / R.profit);
  });
});

describe("goal seek", () => {
  it("finds the traffic multiplier for a revenue target", () => {
    const t = builtinTemplate("tripwire");
    const s = blankSettings();
    const base = compute(t.graph, s);
    const m = goalSeek(t.graph, s, "traffic", "rev", base.rev * 2);
    expect(m).toBeCloseTo(2, 4);
  });
  it("returns NaN when unreachable", () => {
    const t = builtinTemplate("tripwire");
    expect(goalSeek(t.graph, blankSettings(), "conv", "cust", 1e12)).toBeNaN();
  });
});

describe("projection", () => {
  it("without subscriptions or growth every month equals the first-payment compute", () => {
    const t = builtinTemplate("webinar");
    const s = blankSettings();
    const R = compute(t.graph, s);
    const rows = project(t.graph, s, 6, 0);
    rows.forEach((r) => {
      expect(r.revenue).toBeCloseTo(R.cash);
      expect(r.profit).toBeCloseTo(R.profit);
    });
    expect(rows[5].cumulative).toBeCloseTo(R.profit * 6);
  });
  it("payment plans spread cash over the schedule", () => {
    const t = builtinTemplate("call");
    const rows = project(t.graph, blankSettings(), 4, 0);
    const R = compute(t.graph, blankSettings());
    expect(rows[0].revenue).toBeCloseTo(R.cash);
    expect(rows[1].revenue).toBeCloseTo(R.cash * 2);
    expect(rows[3].revenue).toBeCloseTo(R.cash * 3);
  });
  it("subscriptions accumulate MRR with churn", () => {
    const t = builtinTemplate("sub");
    const rows = project(t.graph, blankSettings(), 12, 0);
    expect(rows[11].mrr).toBeGreaterThan(rows[0].mrr);
    expect(rows[11].activeSubs).toBeGreaterThan(rows[0].activeSubs);
  });
  it("growth compounds traffic", () => {
    const rows = project(builtinTemplate("tripwire").graph, blankSettings(), 3, 10);
    expect(rows[2].traffic / rows[0].traffic).toBeCloseTo(1.21);
  });
});

describe("planned vs actual", () => {
  it("sums actuals per node and scales the plan", () => {
    const t = builtinTemplate("webinar");
    const R = compute(t.graph, blankSettings());
    const opt = t.graph.nodes.find((n) => n.type === "optin")!;
    const rows = planVsActual(t.graph, R, [
      { node_id: opt.id, visitors: 1000, conversions: 250, revenue: null, spend: null },
      { node_id: opt.id, visitors: 500, conversions: 150, revenue: null, spend: null },
    ], 0.5);
    const row = rows.find((r) => r.id === opt.id)!;
    expect(row.actIn).toBe(1500);
    expect(row.actOut).toBe(400);
    expect(row.actCr).toBeCloseTo(400 / 1500);
    expect(row.planIn).toBeCloseTo(R.N[opt.id].inflow * 0.5);
  });
});

describe("step rows", () => {
  it("skips annotations", () => {
    const t = builtinTemplate("tripwire");
    const rows = stepRows(t.graph, compute(t.graph, blankSettings()));
    expect(rows.some((r) => r.type === "frame" || r.type === "note")).toBe(false);
    expect(rows.length).toBe(8);
  });
});
