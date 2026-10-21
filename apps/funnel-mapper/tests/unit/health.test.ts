import { describe, expect, it } from "vitest";
import { compute, leaks, warnings } from "@/lib/funnel-math";
import { healthChecks, performanceChecks } from "@/lib/health";
import { builtinTemplate, BUILTIN_KEYS } from "@/lib/templates";
import type { FunnelNode } from "@/lib/graph";

describe("healthChecks", () => {
  it("reports exactly the engine's warnings on every built-in template (plus nothing invented)", () => {
    for (const key of BUILTIN_KEYS) {
      const g = builtinTemplate(key).graph;
      expect(healthChecks(g).map((c) => c.text), key).toEqual(warnings(g));
    }
  });
  it("points each block-level check at its block, and a funnel-wide check at none", () => {
    const g = builtinTemplate("quiz").graph;
    const broken = { nodes: [...g.nodes, { id: "w", type: "landing", name: "Orphan", x: 0, y: 0, p: {} } as FunnelNode], edges: g.edges };
    const c = healthChecks(broken).find((x) => x.nodeId === "w");
    expect(c?.text).toContain("Orphan");
    const empty = { nodes: [{ id: "a", type: "landing", name: "A", x: 0, y: 0, p: {} } as FunnelNode], edges: [] };
    expect(healthChecks(empty).some((x) => x.id === "no-traffic" && !x.nodeId)).toBe(true);
  });
  it("flags a Wait with no duration (it is math-neutral, so the engine does not warn)", () => {
    const w = { nodes: [{ id: "t", type: "fbads", name: "T", x: 0, y: 0, p: {} } as FunnelNode, { id: "w", type: "wait", name: "Pause", x: 0, y: 0, p: { days: 0 } } as FunnelNode], edges: [{ id: "e", from: "t", to: "w", share: 100, port: "main" as const }] };
    expect(healthChecks(w).some((c) => c.nodeId === "w" && c.text.includes("no duration"))).toBe(true);
  });
  it("reports the largest performance leak separately from valid structure and reuses the engine's lift calculation", () => {
    const t = builtinTemplate("quiz");
    const settings = { ...t.settings, basis: "first" as const };
    const quiz = t.graph.nodes.find((n) => n.name === "Quiz funnel")!;
    const condition = t.graph.nodes.find((n) => n.name === "Joined after call?")!;
    const graph = {
      nodes: [...t.graph.nodes, { id: "health-exit", type: "exit", name: "Lost", x: 0, y: 0, p: {} } as FunnelNode],
      edges: [...t.graph.edges, { id: "health-no", from: condition.id, to: "health-exit", share: 100, port: "alt" as const }],
    };
    const R = compute(graph, settings);
    const findings = performanceChecks(graph, settings, R);
    const largest = findings.find((x) => x.rank === "largest-loss")!;
    const engineLeak = leaks(graph, settings, R)[0];

    expect(healthChecks(graph)).toEqual([]);
    expect(largest.nodeId).toBe(quiz.id);
    expect(largest.inflow).toBeCloseTo(2500);
    expect(largest.lost).toBeCloseTo(1500);
    expect(largest.dropPct).toBeCloseTo(0.6);
    expect(largest.customerGain).toBeCloseTo(8.91);
    expect(largest.revenueGain).toBeCloseTo(engineLeak.revenueGain);
    expect(largest.profitGain).toBeCloseTo(engineLeak.profitGain);
  });
  it("does not call a funnel performance-healthy when there is no traffic to measure", () => {
    const emptyFlow = { nodes: [{ id: "a", type: "landing", name: "A", x: 0, y: 0, p: {} } as FunnelNode], edges: [] };
    const R = compute(emptyFlow, { basis: "first", fixed: 0 });
    expect(performanceChecks(emptyFlow, { basis: "first", fixed: 0 }, R)).toEqual([]);
  });
});
