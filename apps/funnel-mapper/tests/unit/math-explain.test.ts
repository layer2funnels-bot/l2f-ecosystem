import { describe, expect, it } from "vitest";
import { compute } from "@/lib/funnel-math";
import { builtinTemplate } from "@/lib/templates";
import { edgeSentence, leaveText } from "@/lib/editor/labels";
import { explainBlock, formulaFor, GLOSSARY } from "@/lib/math-explain";

// F9 is display only: every sentence reads numbers back from the engine for the golden quiz funnel.
const t = builtinTemplate("quiz");
const settings = { ...t.settings, basis: "first" as const };
const R = compute(t.graph, settings);
const byName = (n: string) => t.graph.nodes.find((x) => x.name === n)!;

describe("math made plain", () => {
  it("formulas show the engine's own figures", () => {
    expect(formulaFor("roas", R, "USD")!.sum).toMatch(/\$6,032 ÷ \$450 = 13\.4x/);
    expect(formulaFor("profit", R, "USD")!.words).toBe("Revenue − all costs");
    expect(formulaFor("profit", R, "USD")!.sum).toMatch(/= \$5,582$/);
  });
  it("line labels read as sentences and leaks are counted in whole people", () => {
    const trial = byName("7-day free trial");
    const e = t.graph.edges.find((x) => x.from === byName("Quiz funnel").id && x.port === "main")!;
    expect(edgeSentence(e.from, R.flows[e.id], R)).toBe("40% of 2,500 = 1,000");
    expect(leaveText(trial, R, false)).toBe("850 leave here");
    expect(leaveText(trial, R, true)).toBeNull();
  });
  it("a block's steps are walked through with the arithmetic", () => {
    const lines = explainBlock(byName("Joined after call?"), t.graph, R, "USD");
    expect(lines[0]).toMatch(/^54 people arrive/);
    expect(lines.join(" ")).toMatch(/19 continue: 35% of 54 = 19/);
  });
  it("glossary covers Rate, ROAS, CPA, EPC and AOV", () => {
    expect(GLOSSARY.map(([k]) => k)).toEqual(["Rate", "ROAS", "CPA", "EPC", "AOV"]);
  });
});
