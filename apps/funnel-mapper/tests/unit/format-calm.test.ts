import { describe, expect, it } from "vitest";
import { people, perSuffix, perWord } from "../../lib/format";
import { blockChip, edgeRate } from "../../lib/editor/labels";
import { compute } from "../../lib/funnel-math";
import { template13Graph } from "../../lib/templates13";
import { blankSettings } from "../../lib/graph";

describe("whole people, one number per block", () => {
  it("shows whole people and <1 for tiny values, never an average", () => {
    expect(people(0.2)).toBe("<1");
    expect(people(1034.6)).toBe("1,035");
    expect(people(0)).toBe("0");
  });
  it("names the period of a scaled figure", () => {
    expect(perSuffix(1)).toBe("/ mo");
    expect(perWord(1)).toBe("per month");
    expect(perSuffix(3)).toBe("/ qtr");
    expect(perSuffix(2)).toBe("/ 2 mo");
  });
  const g = template13Graph("v2-webinar");
  const R = compute(g, blankSettings());
  it("Clean shows no chip; People and Money show at most one", () => {
    for (const n of g.nodes) {
      expect(blockChip(n, R, "GBP", 1, "clean")).toBeNull();
      for (const view of ["people", "money"] as const) {
        const c = blockChip(n, R, "GBP", 1, view);
        if (c) expect(`${c.value} ${c.unit}`.match(/\d[\d,]*(?:\.\d+)?/g)?.length ?? 0).toBeLessThanOrEqual(1);
      }
    }
  });
  it("a line label is the rate only", () => {
    const e = g.edges[0];
    const r = edgeRate(e.from, R.flows[e.id] ?? 0, R);
    if (r) expect(r).toMatch(/^\d+(\.\d)?%$/);
  });
});
