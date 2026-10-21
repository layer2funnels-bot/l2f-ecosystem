import { describe, expect, it } from "vitest";
import fixtures from "../fixtures/prototype-results.json";
import protoExport from "../fixtures/prototype-export-webinar.json";
import { compute } from "@/lib/funnel-math";
import { exportFunnelFile, importFunnelFile } from "@/lib/graph";
import { builtinTemplate } from "@/lib/templates";

describe("JSON import", () => {
  it("imports a file exported by the prototype, with identical numbers", () => {
    const d = importFunnelFile(protoExport);
    expect(d.name).toBe("Webinar funnel");
    expect(d.settings.currency).toBe("USD");
    expect(d.settings.basis).toBe("ltv");
    expect(d.settings.fixed).toBe(250);
    expect(d.settings.whatif).toMatchObject({ traffic: 1.2, conv: 0.9 });
    expect(d.settings.target).toBe(20000);
    expect(d.graph.edges.some((e) => e.port === "alt")).toBe(true);
    const R = compute(d.graph, d.settings);
    const fx = (fixtures as unknown as Record<string, { exportTotals: Record<string, number> }>).webinar.exportTotals;
    expect(R.rev).toBeCloseTo(fx.rev, 6);
    expect(R.profit).toBeCloseTo(fx.profit, 6);
    expect(R.cust).toBeCloseTo(fx.cust, 6);
    expect(R.spend).toBeCloseTo(fx.spend, 6);
  });
  it("round-trips this app's own export", () => {
    const t = builtinTemplate("quiz");
    const file = JSON.parse(JSON.stringify(exportFunnelFile({ name: "Q", description: "d", graph: t.graph, settings: t.settings })));
    const d = importFunnelFile(file);
    expect(d.name).toBe("Q");
    expect(d.description).toBe("d");
    expect(d.graph.nodes).toEqual(t.graph.nodes);
    expect(compute(d.graph, d.settings).rev).toBeCloseTo(compute(t.graph, t.settings).rev);
  });
  it("drops unknown block types and dangling edges, fills defaults", () => {
    const d = importFunnelFile({ nodes: [{ id: "a", type: "landing", name: "L", x: 0, y: 0, p: {} }, { id: "b", type: "spaceship", x: 0, y: 0 }], edges: [{ from: "a", to: "b" }] });
    expect(d.graph.nodes.map((n) => n.id)).toEqual(["a"]);
    expect(d.graph.nodes[0].p.cr).toBe(30);
    expect(d.graph.edges).toEqual([]);
  });
  it("rejects files that aren't funnels", () => {
    expect(() => importFunnelFile({ hello: "world" })).toThrow();
    expect(() => importFunnelFile(null)).toThrow();
  });
});
