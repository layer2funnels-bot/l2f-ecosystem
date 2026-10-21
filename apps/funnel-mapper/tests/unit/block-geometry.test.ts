import { describe, expect, it } from "vitest";
import { blockFamily, blockH, blockPivot, LABEL_H, NODE_W, PIC, PITCH, picRect, nodeW } from "../../lib/catalog";
import { mapSvg } from "../../lib/export";
import { compute } from "../../lib/funnel-math";
import { blankSettings } from "../../lib/graph";
import { previewModel } from "../../lib/funnel-preview";
import { builtinTemplate } from "../../lib/templates";
import { template13Graph, TEMPLATES13 } from "../../lib/templates13";
import { tidyLayout } from "../../lib/layout";

describe("picture-first block geometry (V4)", () => {
  const types = ["landing", "checkout", "fbads", "cond", "seq", "won", "goal"];
  it("pages and offers are a 104 x 128 picture; the name sits under it", () => {
    for (const t of ["landing", "quizp", "checkout", "sub"]) {
      expect(picRect(t)).toEqual({ x: (NODE_W - 104) / 2, y: 0, w: 104, h: 128 });
      expect(blockH(t)).toBe(128 + LABEL_H);
    }
  });
  it("every picture sits inside the node box and is centred in it", () => {
    for (const t of types) {
      const r = picRect(t);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(nodeW(t));
      expect(r.x + r.w / 2).toBe(NODE_W / 2);
      expect(r.y + r.h).toBeLessThanOrEqual(blockH(t));
      expect(blockPivot(t)).toBe(PIC[blockFamily(t)].h / 2);
    }
  });
  it("the pitch is 240 across and 200 down, and a page leaves room for the next row", () => {
    expect(PITCH).toEqual({ x: 240, y: 200 });
    expect(blockH("landing")).toBeLessThan(PITCH.y);
    expect(NODE_W).toBeLessThan(PITCH.x);
  });
});

describe("the 13 templates on the 240 x 200 pitch", () => {
  it("no block overlaps another, and columns are 240 apart", () => {
    for (const t of TEMPLATES13) {
      const g = template13Graph(t.key);
      const flow = g.nodes.filter((n) => n.type !== "frame" && n.type !== "note");
      for (let i = 0; i < flow.length; i++)
        for (let j = i + 1; j < flow.length; j++) {
          const a = flow[i],
            b = flow[j];
          const hit = a.x < b.x + nodeW(b.type) && a.x + nodeW(a.type) > b.x && a.y < b.y + blockH(b.type) && a.y + blockH(a.type) > b.y;
          expect(hit, `${t.key}: ${a.name} on ${b.name}`).toBe(false);
        }
      const xs = [...new Set(flow.map((n) => n.x))].sort((a, b) => a - b).filter((x) => x >= 260);
      for (const x of xs) expect((x - 260) % PITCH.x, `${t.key} column x ${x}`).toBe(0);
    }
  });
  it("Tidy up keeps the pitch", () => {
    const t = builtinTemplate("v2-webinar");
    const res = tidyLayout(t.graph.nodes, t.graph.edges, { snap: false });
    const flow = res.filter((n) => n.type !== "frame" && n.type !== "note");
    const cols = [...new Set(flow.map((n) => Math.round(n.x)))].sort((a, b) => a - b);
    for (let i = 1; i < cols.length; i++) expect(cols[i] - cols[i - 1]).toBe(PITCH.x);
  });
});

describe("map export draws pictures with the name under them and one chip", () => {
  const t = builtinTemplate("tripwire");
  const R = compute(t.graph, blankSettings());
  const svg = mapSvg(t.graph, R, { currency: "GBP", nums: true, view: "people", thick: true, keyLeak: "tripwire-qz" });
  it("shows names, one chip per block and the leak chip", () => {
    expect(svg).toContain(">Fitness quiz<");
    expect(svg).toContain(">2,300<"); // people in, the one number on the quiz
    expect(svg).toContain(">Biggest leak<");
    expect(svg).not.toContain("Key leak");
  });
  it("Clean has no chips and no numbers on lines", () => {
    const clean = mapSvg(t.graph, R, { currency: "GBP", nums: false, view: "clean", thick: false });
    expect(clean).not.toContain(">2,300<");
    expect(clean).toContain(">Fitness quiz<");
  });
  it("lines carry the rate, not the people", () => {
    expect(svg).toContain(">45%<");
  });
});

describe("live preview uses the picture as the block", () => {
  it("a node's box is its picture", () => {
    const t = builtinTemplate("tripwire");
    const m = previewModel(t.graph, t.settings, 320, 150);
    const quiz = m.nodes.find((n) => n.name === "Fitness quiz")!;
    expect([quiz.w, quiz.h]).toEqual([104, 128]);
    const src = m.nodes.find((n) => n.name === "Instagram ads")!;
    expect([src.w, src.h]).toEqual([64, 64]);
  });
});
