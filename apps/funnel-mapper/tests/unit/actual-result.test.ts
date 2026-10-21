import { describe, expect, it } from "vitest";
import { actualMonths, actualResult, actualsInRange } from "@/lib/actual-result";
import { builtinTemplate } from "@/lib/templates";

describe("Actual mode on the map", () => {
  const t = builtinTemplate("quiz");
  const s = { ...t.settings, basis: "first" as const };
  const src = t.graph.nodes.find((n) => n.type === "fbads" || n.type === "igads" || n.type === "igorg")!;
  const quiz = t.graph.nodes.find((n) => n.type === "quizp")!;
  const rows = [
    { node_id: src.id, visitors: 1200, conversions: null, revenue: null, spend: 300, period_start: "2026-09-01", period_end: "2026-09-30" },
    { node_id: quiz.id, visitors: 1100, conversions: 400, revenue: null, spend: null, period_start: "2026-09-01", period_end: "2026-09-30" },
    { node_id: quiz.id, visitors: 999, conversions: 1, revenue: null, spend: null, period_start: "2026-08-25", period_end: "2026-09-05" },
  ];

  it("adds up the recorded numbers for whole periods inside the range only", () => {
    const inRange = actualsInRange(rows, "2026-09-01", "2026-09-30");
    expect(inRange).toHaveLength(2);
    const A = actualResult(t.graph, s, inRange);
    expect(A.traffic).toBe(1200);
    expect(A.spend).toBe(300);
    expect(A.N[quiz.id]).toMatchObject({ inflow: 1100, out: 400, non: 700 });
    // lines carry the recorded people of their source step
    const fromQuiz = t.graph.edges.filter((e) => e.from === quiz.id && e.port !== "alt");
    for (const e of fromQuiz) expect(A.flows[e.id]).toBe((400 * e.share) / 100);
  });

  it("steps without a recorded value read as zero, and months are listed newest first", () => {
    const A = actualResult(t.graph, s, []);
    expect(A.traffic).toBe(0);
    expect(A.rev).toBe(0);
    expect(actualMonths(rows)).toEqual(["2026-09", "2026-08"]);
  });
});
