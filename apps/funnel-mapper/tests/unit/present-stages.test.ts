import { describe, expect, it } from "vitest";
import { compute } from "@/lib/funnel-math";
import { frameTotals } from "@/lib/editor/labels";
import { presentStages } from "@/lib/present-stages";
import { builtinTemplate } from "@/lib/templates";
import type { FunnelNode } from "@/lib/graph";

describe("presentation stages", () => {
  const t = builtinTemplate("quiz");
  const R = compute(t.graph, t.settings);

  it("without frames: Acquire / Convert / Finish from the steps' categories, every flow block in exactly one", () => {
    const flow = t.graph.nodes.filter((n) => !["frame", "note", "label"].includes(n.type));
    const noFrames = t.graph.nodes.filter((n) => n.type !== "frame");
    const stages = presentStages(noFrames, R, "GBP");
    expect(stages.map((s) => s.name)).toEqual(["Acquire", "Convert", "Finish"]);
    const all = stages.flatMap((s) => s.ids);
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBe(flow.length);
  });

  it("stage numbers equal the frame totals shown on the map", () => {
    const nodes = t.graph.nodes.filter((n) => n.type !== "frame");
    const frame: FunnelNode = { id: "f", type: "frame", name: "Everything", x: -9999, y: -9999, w: 99999, h: 99999, p: {} };
    const stages = presentStages([...nodes, frame], R, "GBP");
    expect(stages).toHaveLength(1);
    expect(stages[0].name).toBe("Everything");
    const members = nodes.filter((n) => stages[0].ids.includes(n.id));
    expect(stages[0].totals).toEqual(frameTotals(members, R, "GBP"));
    // the golden funnel's traffic and revenue are in that one stage
    expect(stages[0].totals.visits).toBeCloseTo(R.traffic, 6);
    expect(stages[0].totals.revenue).toBeCloseTo(R.rev, 6);
  });

  it("with frames, stages follow the frames left to right and carry the frame's name", () => {
    const nodes = t.graph.nodes.filter((n) => n.type !== "frame");
    const xs = nodes.map((n) => n.x);
    const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
    const left: FunnelNode = { id: "a", type: "frame", name: "Warm up", x: Math.min(...xs) - 50, y: -9999, w: mid - Math.min(...xs) + 50, h: 99999, p: {} };
    const right: FunnelNode = { id: "b", type: "frame", name: "Buy", x: mid, y: -9999, w: 99999, h: 99999, p: {} };
    const stages = presentStages([...nodes, right, left], R, "GBP");
    expect(stages.map((s) => s.name)).toEqual(["Warm up", "Buy"]);
  });
});
