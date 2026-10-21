import { describe, expect, it } from "vitest";
import { BLOCK_TYPES, typeOf, type BlockTypeKey } from "@/lib/catalog";
import { FAMILIES, hasSplitBar, visualOf, WIREFRAMES } from "@/lib/block-visuals";

const keys = Object.keys(BLOCK_TYPES) as BlockTypeKey[];

describe("block visual system", () => {
  it("defines a visual for every block type without touching its identity", () => {
    expect(keys.length).toBe(240); // 232 flow types (156 in the approved library + 76 earlier types kept for saved maps) + 8 layout types (incl. widget)
    for (const k of keys) {
      const v = visualOf(k);
      expect(FAMILIES[v.family], k).toBeTruthy();
      expect(typeOf(k).label, k).toBeTruthy();
    }
  });

  it("maps categories to families", () => {
    for (const k of keys) {
      const T = typeOf(k),
        f = visualOf(k).family;
      if (T.cat === "traffic") expect(f, k).toBe("source");
      if (T.cat === "page") expect(f, k).toBe("page");
      if (T.cat === "offer") expect(f, k).toBe("offer");
      if (T.cat === "annot") expect(f, k).toBe("note");
      if (T.cat === "logic") expect(["logic", "goal"], k).toContain(f);
      if (T.cat === "action") expect(["message", "action"], k).toContain(f);
    }
    expect(visualOf("goal").family).toBe("goal");
    expect(visualOf("exit").family).toBe("goal");
    expect(visualOf("cond").family).toBe("logic");
    expect(visualOf("wait").family).toBe("action");
    expect(visualOf("emailone").family).toBe("message");
    // Deal won sits in Sales & CRM but is an event, drawn as a diamond (Deal lost is a terminal block: a goal capsule)
    expect(visualOf("won").family).toBe("action");
    expect(visualOf("lost").family).toBe("goal");
    expect(visualOf("call").family).toBe("message");
    expect(visualOf("unknown-type").family).toBe("note");
  });

  it("gives every page and offer a drawable wireframe, and only those", () => {
    for (const k of keys) {
      const v = visualOf(k);
      if (FAMILIES[v.family].strip) expect(WIREFRAMES[v.wireframe!], k).toBeTruthy();
      else expect(v.wireframe, k).toBeUndefined();
    }
    expect(visualOf("quizp").wireframe).toBe("quiz");
    expect(visualOf("checkout").wireframe).toBe("order");
    expect(visualOf("upsell").wireframe).toBe("up");
    expect(visualOf("downsell").wireframe).toBe("down");
    expect(visualOf("membership").wireframe).toBe("sub");
    expect(visualOf("custompage").wireframe).toBe("sales");
  });

  it("shows price tabs on offers only and split bars on share logic only", () => {
    expect(FAMILIES.offer.price).toBe(true);
    expect(Object.entries(FAMILIES).filter(([, f]) => f.price).length).toBe(1);
    expect(hasSplitBar("cond")).toBe(true);
    expect(hasSplitBar("multivar")).toBe(true);
    expect(hasSplitBar("merge")).toBe(false);
    expect(hasSplitBar("goal")).toBe(false);
  });
});

describe("brand marks", () => {
  it("only platform blocks have a mark, each on its brand tint, with a valid path", async () => {
    const { BRAND_MARKS } = await import("@/lib/brand-marks");
    const { visualOf } = await import("@/lib/block-visuals");
    const { isBlockType } = await import("@/lib/catalog");
    const keys = Object.keys(BRAND_MARKS);
    expect(keys.length).toBeGreaterThan(10);
    for (const k of keys) {
      expect(isBlockType(k), k).toBe(true);
      expect(visualOf(k).brand, `${k} has a brand tint`).toBeTruthy();
      expect(BRAND_MARKS[k], k).toMatch(/^M[\d.\- ,a-zA-Z]+$/);
    }
  });
});
