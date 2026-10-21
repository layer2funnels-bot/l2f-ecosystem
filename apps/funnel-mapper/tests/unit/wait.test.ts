import { describe, expect, it } from "vitest";
import { compute } from "@/lib/funnel-math";
import { builtinTemplate } from "@/lib/templates";
import { waitLabel, waitOf, waitPatch, waitValid } from "@/lib/wait";
import type { FunnelNode } from "@/lib/graph";

describe("Wait / Delay", () => {
  it("reads old funnels (days only) as days", () => {
    expect(waitOf({ days: 3 })).toEqual({ n: 3, unit: "day" });
    expect(waitLabel({ days: 3 })).toBe("Wait 3 days");
    expect(waitLabel({ days: 1 })).toBe("Wait 1 day");
  });
  it("stores a duration and unit and keeps `days` in sync", () => {
    expect(waitPatch(2, "wk")).toEqual({ dur: 2, unit: "wk", days: 14 });
    expect(waitPatch(12, "hr")).toEqual({ dur: 12, unit: "hr", days: 0.5 });
    expect(waitLabel({ ...waitPatch(90, "min") })).toBe("Wait 90 minutes");
    expect(waitLabel(waitPatch(1, "hr"))).toBe("Wait 1 hour");
  });
  it("treats blank and zero as invalid, with a prompt on the canvas", () => {
    expect(waitValid(waitPatch(NaN, "day"))).toBe(false);
    expect(waitValid(waitPatch(0, "day"))).toBe(false);
    expect(waitLabel(waitPatch(NaN, "day"))).toBe("Wait (set a duration)");
    expect(waitValid(waitPatch(0.5, "hr"))).toBe(true);
  });
  it("is math-neutral: changing the duration or unit changes no total", () => {
    const g = builtinTemplate("quiz");
    const base = compute(g.graph, g.settings);
    const withWait = (p: Record<string, unknown>) => {
      const nodes: FunnelNode[] = [...g.graph.nodes, { id: "w", type: "wait", name: "Pause", x: 0, y: 0, p: { cr: 100, costPer: 0, ...p } }];
      const first = g.graph.edges[0];
      // splice the wait into the first connection
      const edges = g.graph.edges.flatMap((e) => (e === first ? [{ ...e, to: "w" }, { id: "ew", from: "w", to: e.to, share: 100, port: "main" as const }] : [e]));
      return compute({ nodes, edges }, g.settings);
    };
    for (const p of [waitPatch(3, "day"), waitPatch(2, "wk"), waitPatch(30, "min"), waitPatch(NaN, "day")]) {
      const r = withWait(p);
      expect(r.rev).toBeCloseTo(base.rev, 6);
      expect(r.profit).toBeCloseTo(base.profit, 6);
      expect(r.cust).toBeCloseTo(base.cust, 6);
    }
  });
});
