import { describe, expect, it } from "vitest";
import { compute, computeScenario, project, stepRows, summary } from "@/lib/funnel-math";
import { stepsCsv } from "@/lib/export";
import { exportFunnelFile, importFunnelFile } from "@/lib/graph";
import { builtinTemplate } from "@/lib/templates";
import { initEditor, useEditor } from "@/lib/editor/store";

/**
 * Golden regression: the "Quiz → trial funnel" with the literal numbers from docs/MASTER_HANDOFF.md §14.
 * Every consumer of the maths (editor store, dashboard summary, scenarios, forecast, CSV, JSON round-trip)
 * must report the same figures as lib/funnel-math.ts.
 */
const GOLDEN = { traffic: 2500, spend: 450, cust: 89.1, rev: 6032.11, profit: 5582.11, roas: 13.4 };
const STEPS: [string, number, number][] = [
  // [block name, people in, people converting]
  ["Quiz funnel", 2500, 1000],
  ["7-day free trial", 1000, 150],
  ["Converted to paid?", 150, 60],
  ["Paid membership", 60, 60],
  ["Free call", 90, 54],
  ["Joined after call?", 54, 18.9],
  ["Membership (after call)", 18.9, 18.9],
  ["Discounted membership", 170, 10.2],
];
const REVENUE: [string, number][] = [
  ["Paid membership", 4199.4],
  ["Membership (after call)", 1322.81],
  ["Discounted membership", 509.9],
];

const quiz = () => {
  const t = builtinTemplate("quiz");
  return { graph: t.graph, settings: { ...t.settings, basis: "first" as const } };
};

function expectGolden(R: { traffic: number; spend: number; cust: number; rev: number; profit: number; roas: number }, where: string) {
  expect(R.traffic, `${where} traffic`).toBe(GOLDEN.traffic);
  expect(R.spend, `${where} ad spend`).toBe(GOLDEN.spend);
  expect(R.cust, `${where} customers`).toBeCloseTo(GOLDEN.cust, 2);
  expect(R.rev, `${where} revenue`).toBeCloseTo(GOLDEN.rev, 2);
  expect(R.profit, `${where} profit`).toBeCloseTo(GOLDEN.profit, 2);
  expect(R.roas, `${where} ROAS`).toBeCloseTo(GOLDEN.roas, 2);
}

describe("golden quiz funnel (MASTER_HANDOFF §14)", () => {
  it("math engine totals", () => {
    const { graph, settings } = quiz();
    expectGolden(compute(graph, settings), "compute");
  });

  it("every step and branch, including the No path and the after-call path", () => {
    const { graph, settings } = quiz();
    const R = compute(graph, settings);
    const byName = (name: string) => R.N[graph.nodes.find((n) => n.name === name)!.id];
    for (const [name, inflow, out] of STEPS) {
      expect(byName(name).inflow, `${name} in`).toBeCloseTo(inflow, 6);
      expect(byName(name).out, `${name} out`).toBeCloseTo(out, 6);
    }
    expect(byName("Converted to paid?").non, "No path").toBeCloseTo(90, 6);
    for (const [name, rev] of REVENUE) expect(byName(name).rev, `${name} revenue`).toBeCloseTo(rev, 2);
  });

  it("editor store (canvas KPI bar) agrees", () => {
    const { graph, settings } = quiz();
    initEditor({ funnelId: "golden", clientId: "c", name: "Golden", graph, settings });
    expectGolden(useEditor.getState().R, "editor");
  });

  it("dashboard / client summary agrees", () => {
    const { graph, settings } = quiz();
    const s = summary(compute(graph, settings));
    expect(s).toMatchObject({ traffic: GOLDEN.traffic, spend: GOLDEN.spend, cust: GOLDEN.cust, rev: GOLDEN.rev, profit: GOLDEN.profit, roas: GOLDEN.roas });
  });

  it("a neutral scenario and month 1 of the forecast agree", () => {
    const { graph, settings } = quiz();
    expectGolden(computeScenario(graph, settings, { whatif: { traffic: 1, conv: 1, price: 1, cost: 1 } }), "scenario");
    const m1 = project(graph, settings, 1, 0)[0];
    expect(m1.traffic).toBe(GOLDEN.traffic);
    expect(m1.newCustomers).toBeCloseTo(GOLDEN.cust, 2);
  });

  it("CSV export and step rows agree", () => {
    const { graph, settings } = quiz();
    const R = compute(graph, settings);
    const csv = stepsCsv(graph, R);
    const value = (label: string) => Number(csv.split("\n").find((l) => l.startsWith(`${label},`) || l.startsWith(`"${label}",`))!.split(",").pop()!.replace(/"/g, ""));
    expect(value("Customers")).toBeCloseTo(GOLDEN.cust, 2);
    expect(value("Revenue")).toBeCloseTo(GOLDEN.rev, 2);
    expect(value("Profit")).toBeCloseTo(GOLDEN.profit, 2);
    expect(value("ROAS")).toBeCloseTo(GOLDEN.roas, 2);
    const rowRevenue = stepRows(graph, R).reduce((a, r) => a + r.rev, 0);
    expect(rowRevenue).toBeCloseTo(GOLDEN.rev, 2);
  });

  it("JSON export → import round-trip keeps the numbers", () => {
    const { graph, settings } = quiz();
    const back = importFunnelFile(JSON.parse(JSON.stringify(exportFunnelFile({ name: "Golden", graph, settings }))));
    expectGolden(compute(back.graph, back.settings), "round-trip");
  });
});
