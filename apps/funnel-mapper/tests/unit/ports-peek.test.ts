import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fourPorts } from "@/lib/catalog";
import { compute } from "@/lib/funnel-math";
import { blankSettings, parseGraph } from "@/lib/graph";
import { curve, curveSides, edgePath, sidesOf } from "@/lib/editor/labels";
import { canConnect, connect, initEditor, meaningOf, setMeaning, useEditor } from "@/lib/editor/store";
import { placePeek } from "@/lib/peek-place";
import { builtinTemplate } from "@/lib/templates";

const S = () => useEditor.getState();

describe("V2 four ports", () => {
  it("every flow block has four ports except Yes/No and A/B logic, which keep their outcome ports", () => {
    for (const t of ["landing", "checkout", "emailone", "fbads", "merge", "revgoal", "exit"]) expect(fourPorts(t), t).toBe(true);
    for (const t of ["cond", "split", "qualifier", "trafficsplit"]) expect(fourPorts(t), t).toBe(false);
    for (const t of ["note", "label", "frame", "widget"]) expect(fourPorts(t), t).toBe(false);
  });

  it("older lines without sides read as right (or bottom for No) into left, and keep their exact shape", () => {
    expect(sidesOf({ port: "main" })).toEqual(["right", "left"]);
    expect(sidesOf({ port: "alt" })).toEqual(["bottom", "left"]);
    expect(sidesOf({ port: "main", sh: "top", th: "bottom" })).toEqual(["top", "bottom"]);
    expect(curveSides(0, 0, "right", 300, 40, "left")).toEqual(curve(0, 0, "main", 300, 40));
    expect(curveSides(0, 0, "bottom", 300, 140, "left")).toEqual(curve(0, 0, "alt", 300, 140));
    expect(edgePath({ path: "curve" }, "main", 0, 0, 300, 40)).toEqual(edgePath({ path: "curve" }, "main", 0, 0, 300, 40, "right", "left"));
    // a loop back from the top leaves upwards
    const [d] = curveSides(100, 0, "top", 0, 0, "top");
    expect(d).toMatch(/^M 100 0 C 100 -/);
  });

  it("the sides a line uses never change a number (the maths read only Yes / No)", () => {
    const t = builtinTemplate("quiz");
    const s = { ...t.settings, basis: "first" as const };
    const sides = ["top", "right", "bottom", "left"] as const;
    const moved = parseGraph({ ...t.graph, edges: t.graph.edges.map((e, i) => ({ ...e, sh: sides[i % 4], th: sides[(i + 1) % 4] })) });
    const a = compute(t.graph, s),
      b = compute(moved, s);
    expect(b.rev).toBeCloseTo(a.rev, 9);
    expect(b.cust).toBeCloseTo(a.cust, 9);
    expect(b.profit).toBeCloseTo(a.profit, 9);
    expect(moved.edges[0].sh).toBe("top");
  });

  describe("line meaning", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      initEditor({ funnelId: "f", clientId: "c", name: "t", graph: { nodes: [], edges: [], view: { x: 0, y: 0, k: 1 } }, settings: blankSettings() });
      useEditor.setState({
        nodes: [
          { id: "src", type: "fbads", name: "Ads", x: 0, y: 0, p: {} },
          { id: "lp", type: "landing", name: "LP", x: 300, y: 0, p: { cr: 30 } },
          { id: "ty", type: "thanks", name: "TY", x: 600, y: 0, p: { cr: 100 } },
          { id: "out", type: "exit", name: "End", x: 600, y: 300, p: { cr: 100 } },
        ],
      });
    });
    afterEach(() => vi.useRealTimers());

    it("a connection stores the sides it was drawn between, and its meaning can be changed on the line", () => {
      const id = connect("lp", "main", "ty", { sh: "top", th: "bottom" })!;
      const e = S().edges.find((x) => x.id === id)!;
      expect([e.sh, e.th]).toEqual(["top", "bottom"]);
      expect(meaningOf(e)).toBe("yes");
      setMeaning(id, "no");
      expect(S().edges.find((x) => x.id === id)!.port).toBe("alt");
      expect(meaningOf(S().edges.find((x) => x.id === id)!)).toBe("no");
      setMeaning(id, "skip");
      const sk = S().edges.find((x) => x.id === id)!;
      expect([sk.port, sk.s?.kind, meaningOf(sk)]).toEqual(["main", "skip", "skip"]);
      setMeaning(id, "nodata");
      expect(meaningOf(S().edges.find((x) => x.id === id)!)).toBe("nodata");
      setMeaning(id, "yes");
      expect(S().edges.find((x) => x.id === id)!.s).toBeUndefined();
    });

    it("an end block can't send people on, and a source can't receive them, on any side", () => {
      expect(canConnect("out", "ty", "main")).toBe(false);
      expect(canConnect("lp", "src", "main")).toBe(false);
      expect(canConnect("src", "lp", "main")).toBe(true);
    });
  });
});

describe("page hover preview placement", () => {
  const view = { x: 0, y: 0, w: 1400, h: 900 };
  const block = { x: 300, y: 200, w: 200, h: 114 };
  const next = { x: 560, y: 200, w: 200, h: 114 }; // the next step, to the right
  const touches = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  it("opens below the block in a left-to-right funnel and never covers the next step or the block's ports", () => {
    const p = placePeek(block, [next], view);
    expect(p.side).toBe("below");
    expect(touches(p, next)).toBe(false);
    expect(p.y).toBeGreaterThanOrEqual(block.y + block.h + 12);
  });

  it("uses the next side when below is taken, choosing the side that covers the fewest blocks", () => {
    const low = { x: 300, y: 450, w: 200, h: 114 };
    const below = { x: 280, y: 600, w: 240, h: 200 };
    const right = { x: 560, y: 450, w: 200, h: 114 };
    const p = placePeek(low, [right, below], view);
    expect(p.side).toBe("above");
    expect(touches(p, low)).toBe(false);
    expect(touches(p, right)).toBe(false);
  });

  it("falls back to a compact preview when no side fits", () => {
    const tiny = { x: 0, y: 0, w: 640, h: 420 };
    const p = placePeek({ x: 220, y: 150, w: 200, h: 114 }, [], tiny);
    expect(p.side).toBe("compact");
    expect(p.w).toBe(240);
  });
});
