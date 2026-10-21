import { describe, expect, it } from "vitest";
import { compute } from "@/lib/funnel-math";
import { builtinTemplate } from "@/lib/templates";
import { blockFindings, goalGapFinding } from "@/lib/findings";
import { performanceChecks } from "@/lib/health";
import { allCommands, registerCommands, searchCommands } from "@/lib/editor/commands";

const t = builtinTemplate("quiz");
const settings = { ...t.settings, basis: "first" as const, currency: "USD" as const };
const R = compute(t.graph, settings);
const trial = t.graph.nodes.find((n) => n.name === "7-day free trial")!;

describe("findings", () => {
  it("are deterministic facts from the engine, and empty when there is nothing to say", () => {
    const thanks = t.graph.nodes.find((n) => n.name === "Paid membership")!;
    expect(blockFindings(thanks.id, t.graph, settings, R)).toEqual([]);
    const top = performanceChecks(t.graph, settings, R)[0];
    const f = blockFindings(top.nodeId!, t.graph, settings, R);
    expect(f.some((x) => x.kind === "leak" && /largest leak/.test(x.headline))).toBe(true);
  });
  it("a goal gap names the gap and what reaching it changes", () => {
    const g = goalGapFinding({ id: "g", name: "Trial", kind: "conversion", value: 30, period: "month", nodeId: trial.id }, t.graph, settings, R)!;
    expect(g.headline).toBe("7-day free trial is 15 points below its goal");
    expect(g.impact).toMatch(/^Reaching it projects \+\$/);
    expect(goalGapFinding({ id: "g", name: "Trial", kind: "conversion", value: 10, period: "month", nodeId: trial.id }, t.graph, settings, R)).toBeNull();
  });
});

describe("command registry", () => {
  it("search matches words, skips disabled commands, and unregisters cleanly", () => {
    const off = registerCommands([
      { id: "t-a", label: "Tidy up the layout", scope: "map", words: "arrange", run: () => {} },
      { id: "t-b", label: "Hidden thing", scope: "map", run: () => {}, enabled: () => false },
    ]);
    expect(searchCommands("arrange").map((c) => c.id)).toContain("t-a");
    expect(searchCommands("hidden")).toEqual([]);
    expect(allCommands().some((c) => c.id === "undo")).toBe(true);
    off();
    expect(allCommands().some((c) => c.id === "t-a")).toBe(false);
  });
});
