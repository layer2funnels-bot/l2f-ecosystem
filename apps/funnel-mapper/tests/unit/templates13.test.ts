import { describe, expect, it } from "vitest";
import { isBlockType, typeOf } from "@/lib/catalog";
import { compute, warnings } from "@/lib/funnel-math";
import { blankSettings, parseGraph } from "@/lib/graph";
import { TEMPLATES13, template13Graph, templatePages } from "@/lib/templates13";
import { APPROVED_TEMPLATE_KEYS, builtinTemplate } from "@/lib/templates";

describe("the 13 approved templates", () => {
  it("are the owner's names in the owner's order, with the block counts of the design", () => {
    expect(TEMPLATES13.map((t) => t.name)).toEqual([
      "Lead Squeeze",
      "Survey",
      "Summit",
      "Free Challenge Funnel",
      "Book Funnel",
      "Cart Funnel",
      "Paid Challenge Funnel",
      "Video Sales Letter Funnel",
      "Webinar Funnel",
      "Product Launch Funnel",
      "Application Funnel",
      "Webinar Application Funnel",
      "Mini Class Funnel",
    ]);
    expect(TEMPLATES13.map((t) => t.blocks.length)).toEqual([7, 11, 11, 17, 6, 8, 14, 7, 14, 13, 10, 5, 12]);
    expect(APPROVED_TEMPLATE_KEYS).toHaveLength(13);
  });

  for (const t of TEMPLATES13) {
    it(`${t.n} ${t.name}: valid blocks and lines, sample numbers flow, empty numbers are valid zeros`, () => {
      const g = parseGraph(template13Graph(t.key));
      for (const n of g.nodes) expect(isBlockType(n.type), n.type).toBe(true);
      expect(g.nodes).toHaveLength(t.blocks.length + 1); // + the example traffic source
      expect(g.edges).toHaveLength(t.lines.length + 1);
      const R = compute(g, blankSettings());
      expect(R.traffic).toBeGreaterThan(0);
      expect(warnings(g).filter((w) => w.includes("no incoming connection"))).toEqual([]);
      const e = parseGraph(template13Graph(t.key, { empty: true }));
      expect(e.nodes).toHaveLength(t.blocks.length);
      const Z = compute(e, blankSettings());
      expect([Z.traffic, Z.rev, Z.spend]).toEqual([0, 0, 0]);
      expect(Number.isNaN(Z.profit)).toBe(false);
      // optional blocks are marked and drawn dashed
      for (const [id, , , , , opt] of t.blocks) if (opt) expect(g.nodes.find((n) => n.id.endsWith(`-${id}`))!.s?.borderStyle).toBe("dashed");
      expect(builtinTemplate(t.key).name).toBe(t.name);
    });
  }

  it("the customize form names each page and points it at a URL", () => {
    const pages = templatePages("v2-webinar");
    expect(pages.map((p) => p.name)).toEqual(["Opt-in", "Registration Thank You", "Webinar Live", "Webinar Replay"]);
    const g = template13Graph("v2-webinar", { names: { o: "Save my seat" }, urls: { o: "https://example.com/seat" } });
    const o = g.nodes.find((n) => n.id === "v2-webinar-o")!;
    expect([o.name, o.url]).toEqual(["Save my seat", "https://example.com/seat"]);
    for (const p of pages) expect(typeOf(p.type).cat).toBe("page");
  });
});
