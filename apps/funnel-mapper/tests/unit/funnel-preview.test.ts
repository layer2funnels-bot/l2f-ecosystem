import { describe, expect, it } from "vitest";
import { compute, leaks } from "@/lib/funnel-math";
import { previewModel } from "@/lib/funnel-preview";
import { builtinTemplate } from "@/lib/templates";

describe("live funnel preview (F2)", () => {
  const t = builtinTemplate("quiz");
  const s = { ...t.settings, basis: "first" as const };

  it("is drawn from the funnel's own saved canvas, fitted at no more than half size", () => {
    const m = previewModel(t.graph, s, 320, 150, 8, t.name);
    const flow = t.graph.nodes.filter((n) => !["note", "label", "frame", "shape", "image", "checklist", "link", "widget"].includes(n.type));
    expect(m.empty).toBe(false);
    expect(m.nodes.map((n) => n.id).sort()).toEqual(flow.map((n) => n.id).sort());
    expect(m.edges.length).toBe(t.graph.edges.length);
    expect(m.scale).toBeLessThanOrEqual(0.5);
    expect(m.label).toBe(`Map of ${t.name}: ${flow.length} blocks, ${t.graph.edges.length} connections`);
  });

  it("marks the biggest leak with the same block as the engine, and weights lines by people", () => {
    const m = previewModel(t.graph, s, 320, 150);
    expect(m.leakId).toBe(leaks(t.graph, s)[0].id);
    const R = compute(t.graph, s);
    const busiest = t.graph.edges.reduce((a, e) => ((R.flows[e.id] ?? 0) > (R.flows[a.id] ?? 0) ? e : a));
    const w = (id: string) => m.edges.find((e) => e.id === id)!.width * m.scale;
    expect(w(busiest.id)).toBeCloseTo(2.7, 6); // 1 + 1.7 * sqrt(1)
    for (const e of m.edges) expect(e.width * m.scale).toBeLessThanOrEqual(2.7 + 1e-9);
    expect(m.edges.some((e) => e.kind === "leak")).toBe(t.graph.edges.some((e) => e.port === "alt"));
  });

  it("notes and text never affect the fit", () => {
    const withNote = { ...t.graph, nodes: [...t.graph.nodes, { id: "far", type: "note", name: "n", x: 9000, y: 9000, p: { text: "hi" } }] };
    expect(previewModel(withNote, s, 320, 150).scale).toBe(previewModel(t.graph, s, 320, 150).scale);
  });

  it("has a first-use state and drops detail on very large maps", () => {
    expect(previewModel({ nodes: [], edges: [] }, {}, 320, 150).empty).toBe(true);
    const many = { nodes: Array.from({ length: 220 }, (_, i) => ({ id: `n${i}`, type: "landing", name: `P${i}`, x: (i % 20) * 260, y: Math.floor(i / 20) * 160, p: {} })), edges: [] };
    const big = previewModel(many, {}, 320, 150);
    expect(big.detail).toBe("blocks");
    expect(big.names).toBe(false);
  });
});
