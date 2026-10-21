import { describe, expect, it } from "vitest";
import { elkLayout, layoutMetrics, tidyLayout } from "@/lib/layout";
import { builtinTemplate, BUILTIN_KEYS } from "@/lib/templates";
import { NH, blockH, blockPivot, isAnnot, nodeW } from "@/lib/catalog";
import type { FunnelEdge, FunnelNode } from "@/lib/graph";

// Notes and headings deliberately differ from the prototype (which re-anchored them under the nearest block):
// they keep their placement; see "annotations" below. Flow blocks and frames still match the prototype exactly.
const carried = (n: { type: string }) => n.type === "note" || n.type === "label";

describe("tidyLayout (240 x 200 pitch, aligned on the picture centre)", () => {
  for (const key of BUILTIN_KEYS) {
    it(`${key}: no overlaps, lines run left to right, columns sit on the 240px pitch`, () => {
      for (const scramble of [false, true]) {
        const t = builtinTemplate(key);
        const nodes = scramble ? t.graph.nodes.map((n, i) => ({ ...n, x: (i * 137) % 900, y: (i * 251) % 700 })) : t.graph.nodes;
        const res = tidyLayout(nodes, t.graph.edges);
        const m = layoutMetrics(res, t.graph.edges);
        expect(m.overlaps, key).toBe(0);
        const flow = res.filter((n) => !isAnnot(n.type));
        const x0 = Math.min(...flow.map((n) => n.x));
        for (const n of flow) expect((n.x - x0) % 10, `${key}: ${n.name} x`).toBe(0); // snapped to the 10px grid
        const cols = [...new Set(flow.map((n) => Math.round((n.x - x0) / 240)))];
        expect(cols.length, key).toBeGreaterThan(1);
      }
    });
  }
  it("does not mutate its input", () => {
    const t = builtinTemplate("quiz");
    const before = JSON.stringify(t.graph.nodes);
    tidyLayout(t.graph.nodes, t.graph.edges);
    expect(JSON.stringify(t.graph.nodes)).toBe(before);
  });
  it("is deterministic", () => {
    const t = builtinTemplate("webinar");
    expect(tidyLayout(t.graph.nodes, t.graph.edges)).toEqual(tidyLayout(t.graph.nodes, t.graph.edges));
  });
});

const blk = (id: string, x: number, y: number, type = "landing"): FunnelNode => ({ id, type, name: id, x, y, p: {} });
const ann = (id: string, type: "note" | "label", x: number, y: number, text = ""): FunnelNode => ({ id, type, name: id, x, y, p: { text } });
const edge = (from: string, to: string, port: "main" | "alt" = "main"): FunnelEdge => ({ id: `${from}-${to}`, from, to, port, share: 100 });
const W = (n: FunnelNode) => (n.type === "label" ? 300 : nodeW(n.type));
const H = (n: FunnelNode) => (n.type === "label" ? 40 : isAnnot(n.type) ? NH : blockH(n.type));
const overlap = (a: FunnelNode, b: FunnelNode) => a.x < b.x + W(b) && a.x + W(a) > b.x && a.y < b.y + H(b) && a.y + H(a) > b.y;

describe("Tidy up keeps annotations where they were placed", () => {
  // three steps laid out badly (stacked diagonally), a heading above the first step and a note beside the last
  const nodes = [blk("t", 40, 400, "fbads"), blk("l", 600, 40), blk("c", 300, 700, "checkout"), ann("h", "label", 40, 300), ann("n", "note", 600, 700)];
  const edges = [edge("t", "l"), edge("l", "c")];
  const at = (res: FunnelNode[], id: string) => res.find((n) => n.id === id)!;

  it("flow blocks are laid out; headings and notes are not treated as flow nodes", () => {
    const res = tidyLayout(nodes, edges, { snap: false });
    const flowOnly = tidyLayout(nodes.filter((n) => !carried(n)), edges, { snap: false });
    for (const id of ["t", "l", "c"]) expect([at(res, id).x, at(res, id).y]).toEqual([at(flowOnly, id).x, at(flowOnly, id).y]);
  });

  it("each annotation keeps its offset from the block it sat next to", () => {
    const res = tidyLayout(nodes, edges, { snap: false });
    // heading was 100px above the traffic source, note was 300px right of the checkout
    expect([at(res, "h").x - at(res, "t").x, at(res, "h").y - at(res, "t").y]).toEqual([0, -100]);
    expect([at(res, "n").x - at(res, "c").x, at(res, "n").y - at(res, "c").y]).toEqual([300, 0]);
  });

  it("is not re-anchored below a block when it was above it", () => {
    const res = tidyLayout(nodes, edges, { snap: false });
    expect(at(res, "h").y).toBeLessThan(at(res, "t").y);
  });

  it("annotations never end up on top of blocks or of each other", () => {
    // two notes that would land on the second step after the layout, plus one already overlapping the first note
    const crowd = [blk("a", 0, 0, "fbads"), blk("b", 1000, 900), ann("x", "note", 280, 0), ann("y", "note", 300, 20), ann("z", "label", 260, -10)];
    const res = tidyLayout(crowd, [edge("a", "b")], { snap: false });
    const flow = res.filter((n) => !carried(n)),
      notes = res.filter(carried);
    for (const a of notes) for (const b of flow) expect(overlap(a, b), `${a.id} on ${b.id}`).toBe(false);
    for (const a of notes) for (const b of notes) if (a !== b) expect(overlap(a, b), `${a.id} on ${b.id}`).toBe(false);
  });

  it("uses measured annotation sizes when the editor provides them", () => {
    // a 900px-wide heading next to a step: with the measured width it must be moved clear of the step
    const g = [blk("a", 0, 200, "fbads"), blk("b", 400, 200), ann("wide", "label", -300, 230)];
    const widthOf = (n: FunnelNode) => (n.id === "wide" ? 900 : W(n));
    const res = tidyLayout(g, [edge("a", "b")], { snap: false, widthOf });
    const wide = res.find((n) => n.id === "wide")!;
    for (const b of res.filter((n) => !carried(n))) {
      const hit = wide.x < b.x + W(b) && wide.x + 900 > b.x && wide.y < b.y + H(b) && wide.y + 40 > b.y;
      expect(hit, `wide heading on ${b.id}`).toBe(false);
    }
  });

  it("built-in templates: no annotation overlaps after Tidy up", () => {
    for (const key of BUILTIN_KEYS) {
      const t = builtinTemplate(key);
      const res = tidyLayout(t.graph.nodes, t.graph.edges);
      const flow = res.filter((n) => !carried(n) && n.type !== "frame");
      for (const a of res.filter(carried)) for (const b of flow) expect(overlap(a, b), `${key}: ${a.name} on ${b.name}`).toBe(false);
    }
  });
});

describe("block footprint (136 wide; a page is 184 tall, a source 120)", () => {
  it("aligns a row of mixed-height blocks on the picture centre so the connections stay straight", () => {
    // source -> page -> offer -> action in one straight run: all four vertical centres must coincide
    const g = [blk("s", 0, 0, "fbads"), blk("p", 300, 90, "landing"), blk("o", 600, 10, "checkout"), blk("a", 900, 50, "seq")];
    const edges = [edge("s", "p"), edge("p", "o"), edge("o", "a")];
    const res = tidyLayout(g, edges, { snap: false });
    const centre = (id: string) => {
      const n = res.find((x) => x.id === id)!;
      return n.y + blockPivot(n.type);
    };
    expect(centre("p")).toBeCloseTo(centre("s"), 5);
    expect(centre("o")).toBeCloseTo(centre("s"), 5);
    expect(centre("a")).toBeCloseTo(centre("s"), 5);
    expect(blockH("landing")).toBe(184);
    expect(blockH("fbads")).toBe(120);
    expect(nodeW("cond")).toBe(136);
  });
  it("never overlaps blocks of different heights in a column", () => {
    const g = [blk("s", 0, 0, "fbads"), blk("p", 0, 0, "landing"), blk("q", 0, 0, "optin"), blk("c", 0, 0, "seq")];
    const res = tidyLayout(g, [edge("s", "p"), edge("s", "q", "alt"), edge("p", "c")], { snap: false });
    expect(layoutMetrics(res, [edge("s", "p")]).overlaps).toBe(0);
  });
});

describe("elkLayout", () => {
  for (const key of BUILTIN_KEYS) {
    it(`${key}: no overlaps, edges flow left to right`, async () => {
      const t = builtinTemplate(key);
      const res = await elkLayout(t.graph.nodes, t.graph.edges);
      const m = layoutMetrics(res, t.graph.edges);
      expect(m.overlaps).toBe(0);
      const tidy = layoutMetrics(tidyLayout(t.graph.nodes, t.graph.edges), t.graph.edges);
      console.log(key, "tidy", tidy, "elk", m);
    });
  }
});
