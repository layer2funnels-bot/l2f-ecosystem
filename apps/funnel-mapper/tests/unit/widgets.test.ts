import { describe, expect, it } from "vitest";
import { compute } from "@/lib/funnel-math";
import { builtinTemplate } from "@/lib/templates";
import { formatMetricValue, scopeTotals, trendRange, trendValues, widgetConfig, widgetMembers, widgetValues } from "@/lib/widget-data";
import type { FunnelNode } from "@/lib/graph";

const t = builtinTemplate("quiz");
const R = compute(t.graph, t.settings);
const nodes = t.graph.nodes;

describe("widget data", () => {
  it("reads defensively and caps at four metrics", () => {
    const c = widgetConfig({ metrics: ["revenue", "profit", "roas", "leads", "customers", "bogus", "revenue"], wsize: "L", display: "chart" });
    expect(c.metrics).toEqual(["revenue", "profit", "roas", "leads"]);
    expect(c.size).toBe("L");
    expect(widgetConfig({}).metrics).toEqual(["revenue"]);
    expect(widgetConfig({ scope: "weird" }).scope).toBe("funnel");
  });

  it("whole-funnel numbers are the engine's, on the golden funnel", () => {
    const v = Object.fromEntries(widgetValues(widgetConfig({ metrics: ["revenue", "profit", "roas", "customers"] }), nodes, R, []).map((x) => [x.metric, x.value]));
    expect(v.revenue).toBeCloseTo(6032.11, 2);
    expect(v.profit).toBeCloseTo(5582.11, 2);
    expect(v.roas).toBeCloseTo(13.4, 1);
    expect(v.customers).toBeCloseTo(89.1, 1);
  });

  it("per-step totals over every step add up to the engine's totals (guards drift from compute())", () => {
    const s = scopeTotals(nodes, R);
    expect(s.rev).toBeCloseTo(R.rev, 6);
    expect(s.cust).toBeCloseTo(R.cust, 6);
    expect(s.leads).toBeCloseTo(R.leads, 6);
    expect(s.spend).toBeCloseTo(R.spend, 6);
    expect(s.traffic).toBeCloseTo(R.traffic, 6);
    expect(s.mrr).toBeCloseTo(R.mrr, 6);
  });

  it("a selection scope covers just its steps; a missing scope is invalid", () => {
    const offers = nodes.filter((n) => n.type === "sub" || n.type === "membership").slice(0, 1);
    const c = widgetConfig({ scope: "selection", nodeIds: offers.map((o) => o.id), metrics: ["revenue"] });
    const v = widgetValues(c, nodes, R, [])[0];
    expect(v.value).toBeCloseTo(R.N[offers[0].id].rev, 6);
    expect(v.value).toBeLessThan(R.rev);
    expect(widgetMembers(widgetConfig({ scope: "selection", nodeIds: ["gone"] }), nodes).invalid).toBe(true);
    expect(widgetMembers(widgetConfig({ scope: "frame", frameId: "nope" }), nodes).invalid).toBe(true);
  });

  it("a frame scope follows the steps inside the frame", () => {
    const flow = nodes.filter((n) => n.type !== "note" && n.type !== "label" && n.type !== "frame");
    const frame: FunnelNode = { id: "f1", type: "frame", name: "All", x: -500, y: -500, w: 9999, h: 9999, p: {} };
    const c = widgetConfig({ scope: "frame", frameId: "f1", metrics: ["customers"] });
    const v = widgetValues(c, [...flow, frame], R, [])[0];
    expect(v.value).toBeCloseTo(R.cust, 6);
  });

  it("missing figures read 'No data yet' and money keeps the funnel currency", () => {
    expect(formatMetricValue({ kind: "money", value: NaN }, "GBP")).toBe("No data yet");
    expect(formatMetricValue({ kind: "money", value: -1234.5 }, "USD")).toBe("−$1,235");
    expect(formatMetricValue({ kind: "ratio", value: 13.4 }, "GBP")).toBe("13.4x");
  });

  it("trend compares the period's share of the plan with recorded actuals, or shows plan only", () => {
    const c = widgetConfig({ display: "trend", trend: "week", metrics: ["revenue"] });
    const plan = widgetValues(c, nodes, R, []);
    const none = trendValues(c, nodes, R, plan, []);
    expect(none[0].actual).toBeNull();
    expect(none[0].plan).toBeCloseTo(R.rev * (7 / 30.44), 6);
    const offer = nodes.find((n) => n.type === "sub")!;
    const { start, end } = trendRange(c);
    const got = trendValues(c, nodes, R, plan, [{ node_id: offer.id, period_start: start, period_end: end, revenue: 500, visitors: null, conversions: null, spend: null } as never]);
    expect(got[0].actual).toBe(500);
  });

  it("a real date range wins over the preset", () => {
    expect(trendRange({ trend: "range", from: "2026-01-01", to: "2026-01-31" })).toEqual({ start: "2026-01-01", end: "2026-01-31", days: 31 });
    expect(trendRange({ trend: "quarter" }).days).toBe(91);
  });
});
