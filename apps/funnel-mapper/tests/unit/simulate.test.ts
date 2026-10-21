import { describe, expect, it } from "vitest";
import { compute } from "@/lib/funnel-math";
import { anyChange, assumptionChanges, edgeDelta, knobsOf, stepDelta, topMovers, totalsDelta } from "@/lib/simulate";
import { builtinTemplate } from "@/lib/templates";

const t = builtinTemplate("quiz");
const S = { ...t.settings, basis: "first" as const };
const g = t.graph;
const base = compute(g, S);
const withLever = (w: Partial<typeof S.whatif>) => compute(g, { ...S, whatif: { ...S.whatif, ...w } });
const get = (rows: ReturnType<typeof totalsDelta>, k: string) => rows.find((r) => r.key === k)!;

describe("simulate: the baseline is the golden funnel and nothing changes until an assumption does", () => {
  it("baseline is the golden run", () => {
    expect(base.cust).toBeCloseTo(89.1, 2);
    expect(base.rev).toBeCloseTo(6032.11, 2);
    expect(base.profit).toBeCloseTo(5582.11, 2);
    expect(base.roas).toBeCloseTo(13.4, 2);
  });

  it("reports no change against itself, for totals, steps and connections", () => {
    expect(anyChange(base, base)).toBe(false);
    expect(totalsDelta(base, base).every((x) => x.tone === "same" && x.delta === 0 && x.pct === null)).toBe(true);
    for (const n of g.nodes) expect(stepDelta(n, base, base)?.changed ?? false).toBe(false);
    for (const e of g.edges) expect(edgeDelta(e.id, base, base).delta).toBe(0);
  });
});

describe("simulate: deltas are differences of the engine's own results", () => {
  it("more traffic: every headline number is the engine's number, ad spend is neutral, profit and ROAS move", () => {
    const R = withLever({ traffic: 1.2 });
    const rows = totalsDelta(R, base);
    expect(get(rows, "traffic").value).toBeCloseTo(3000, 6);
    expect(get(rows, "traffic").delta).toBeCloseTo(500, 6);
    expect(get(rows, "traffic").pct).toBeCloseTo(0.2, 6);
    expect(get(rows, "rev").value).toBe(R.rev);
    expect(get(rows, "rev").delta).toBeCloseTo(R.rev - base.rev, 8);
    expect(get(rows, "rev").tone).toBe("good");
    expect(get(rows, "spend").tone).toBe("neutral");
    expect(get(rows, "spend").delta).toBeCloseTo(90, 6);
    expect(get(rows, "profit").delta).toBeCloseTo(R.profit - base.profit, 8);
    // ROAS does not move with pure volume in this funnel (revenue and spend scale together)
    expect(get(rows, "roas").tone).toBe("same");
    expect(anyChange(R, base)).toBe(true);
  });

  it("a worse conversion rate loses people at the step and the loss shows as more people lost", () => {
    const edited = g.nodes.map((n) => (n.name === "Quiz funnel" ? { ...n, p: { ...n.p, cr: Number(n.p.cr) * 0.8 } } : n));
    const R = compute({ nodes: edited, edges: g.edges }, S);
    const quiz = edited.find((n) => n.name === "Quiz funnel")!;
    const d = stepDelta(quiz, R, base)!;
    expect(d.changed).toBe(true);
    expect(d.dInflow).toBe(0); // the same people arrive …
    expect(d.dOut).toBeCloseTo(-200, 6); // … 200 fewer move on …
    expect(d.dLost).toBeCloseTo(200, 6); // … and those 200 are lost
    expect(d.dRatio).toBeCloseTo(-0.08, 6);
    // the connection after it carries less, and revenue and profit fall
    const out = g.edges.find((e) => e.from === quiz.id)!;
    expect(edgeDelta(out.id, R, base).delta).toBeLessThan(0);
    expect(get(totalsDelta(R, base), "rev").tone).toBe("bad");
    expect(get(totalsDelta(R, base), "profit").tone).toBe("bad");
    expect(topMovers(edited, R, base)[0].d.dInflow).toBeLessThan(0);
  });

  it("prices move revenue and profit but not people", () => {
    const R = withLever({ price: 1.1 });
    const rows = totalsDelta(R, base);
    expect(get(rows, "cust").tone).toBe("same");
    expect(get(rows, "rev").delta).toBeGreaterThan(0);
    expect(get(rows, "roas").tone).toBe("good");
  });

  it("a lower CPA reads as good, a higher one as bad", () => {
    expect(get(totalsDelta(withLever({ conv: 1.2 }), base), "cpa").tone).toBe("good");
    expect(get(totalsDelta(withLever({ conv: 0.8 }), base), "cpa").tone).toBe("bad");
  });

  it("steps added after the baseline have no 'was' and are not reported as changed", () => {
    const extra = { ...g.nodes[1], id: "new-step" };
    const R = compute({ nodes: [...g.nodes, extra], edges: g.edges }, S);
    const d = stepDelta(extra, R, base)!;
    expect(d.was).toBeNull();
    expect(d.changed).toBe(false);
  });

  it("annotations have no delta", () => {
    const note = { id: "n1", type: "note", name: "", x: 0, y: 0, p: {} };
    expect(stepDelta(note as never, base, base)).toBeNull();
  });
});

describe("simulate: what the user changed", () => {
  it("lists changed assumptions with before and after, and nothing for unrelated edits", () => {
    const edited = g.nodes.map((n) => (n.name === "Paid membership" ? { ...n, p: { ...n.p, price: Number(n.p.price) + 10 } } : n.name === "Quiz funnel" ? { ...n, x: n.x + 40 } : n));
    const ch = assumptionChanges(edited, g.nodes);
    expect(ch).toHaveLength(1);
    expect(ch[0]).toMatchObject({ name: "Paid membership", key: "price" });
    expect(ch[0].now - ch[0].was).toBeCloseTo(10, 8);
  });

  it("offers expose buy rate, price, discount and refund; sources expose their own cost model", () => {
    const paid = g.nodes.find((n) => n.name === "Paid membership")!;
    expect(knobsOf(paid).map((k) => k.key)).toEqual(["cr", "price", "disc", "refund"]);
    const src = g.nodes.find((n) => n.type === "igorg")!;
    expect(knobsOf(src).map((k) => k.key)).toEqual(["visitors", "spend"]);
    expect(knobsOf({ ...src, p: { ...src.p, model: "cpc" } }).map((k) => k.key)).toEqual(["clicks", "cpc"]);
  });
});

import { dotSeconds, flowDots, lostDots } from "@/lib/simulate";

describe("simulate: people-flow animation parameters", () => {
  it("dots follow the engine's flows: none without people, more on busier lines, capped", () => {
    expect(flowDots(0, 100)).toBe(0);
    expect(flowDots(10, 0)).toBe(0);
    expect(flowDots(NaN, 100)).toBe(0);
    expect(flowDots(1, 10000)).toBeGreaterThanOrEqual(1);
    const a = flowDots(100, 2500),
      b = flowDots(1000, 2500),
      c = flowDots(2500, 2500);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
    expect(c).toBe(8);
    expect(flowDots(5000, 2500)).toBe(8);
    expect(flowDots(2500, 2500, true)).toBe(3); // a crowded map keeps it light
  });

  it("is deterministic and the busiest golden connection carries the most dots", () => {
    const R = base;
    const flows = Object.values(R.flows);
    const max = Math.max(...flows);
    const dots = flows.map((f) => flowDots(f, max));
    expect(dots).toEqual(flows.map((f) => flowDots(f, max)));
    expect(Math.max(...dots)).toBe(8);
    expect(dots[flows.indexOf(max)]).toBe(8);
    expect(Math.min(...dots)).toBeGreaterThanOrEqual(1);
  });

  it("dots take longer on longer lines, within sane bounds", () => {
    expect(dotSeconds(10)).toBe(0.9);
    expect(dotSeconds(300)).toBeLessThan(dotSeconds(600));
    expect(dotSeconds(100000)).toBe(6);
  });

  it("lost-people dots grow with the share lost", () => {
    expect(lostDots(0, 100)).toBe(0);
    expect(lostDots(10, 100)).toBe(1);
    expect(lostDots(50, 100)).toBe(2);
    expect(lostDots(90, 100)).toBe(3);
    expect(lostDots(5, 0)).toBe(0);
  });
});
