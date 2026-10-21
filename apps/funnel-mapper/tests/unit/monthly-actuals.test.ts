import { describe, expect, it } from "vitest";
import { compute, planVsActual } from "@/lib/funnel-math";
import { DAYS_PER_PERIOD, monthlyPlanVsActual } from "@/lib/report-data";
import { builtinTemplate } from "@/lib/templates";

const t = builtinTemplate("quiz");
const R = compute(t.graph, { ...t.settings, basis: "first" });
const node = t.graph.nodes.find((n) => n.name === "Paid membership")!;
const a = (start: string, end: string, revenue: number, spend: number | null = null) => ({ node_id: node.id, period_start: start, period_end: end, visitors: null, conversions: null, revenue, spend });

describe("monthly actual vs plan", () => {
  it("has no rows without actuals", () => {
    expect(monthlyPlanVsActual(t.graph, R, [])).toEqual([]);
  });

  it("groups periods by the month they start in, in date order", () => {
    const rows = monthlyPlanVsActual(t.graph, R, [a("2026-03-01", "2026-03-31", 500), a("2026-01-01", "2026-01-31", 300), a("2026-01-01", "2026-01-31", 100, 40)]);
    expect(rows.map((r) => r.month)).toEqual(["2026-01", "2026-03"]);
    expect(rows[0].actRev).toBe(400);
    expect(rows[0].actSpend).toBe(40);
    expect(rows[1].actRev).toBe(500);
  });

  it("scales the plan like the Actuals tab (days entered / 30.44)", () => {
    const [row] = monthlyPlanVsActual(t.graph, R, [a("2026-01-01", "2026-01-31", 1)]);
    expect(row.days).toBe(31);
    const same = planVsActual(t.graph, R, [], 31 / DAYS_PER_PERIOD).reduce((x, r) => x + r.planRev, 0);
    expect(row.planRev).toBeCloseTo(same, 6);
    // a full 30.44-day month plans exactly the funnel's monthly revenue
    expect(planVsActual(t.graph, R, [], 1).reduce((x, r) => x + r.planRev, 0)).toBeCloseTo(R.rev, 2);
  });

  it("counts each date range once when several steps share it", () => {
    const other = t.graph.nodes.find((n) => n.name === "Free call")!;
    const [row] = monthlyPlanVsActual(t.graph, R, [a("2026-02-01", "2026-02-28", 10), { ...a("2026-02-01", "2026-02-28", 5), node_id: other.id }]);
    expect(row.days).toBe(28);
  });
});
