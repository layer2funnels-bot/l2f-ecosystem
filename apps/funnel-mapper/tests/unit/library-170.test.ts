import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { BLOCK_TYPES, LIB_GROUPS, isBlockType, typeOf, type LibGroup } from "@/lib/catalog";
import { FAMILIES, FAMILY_GEOM, visualOf, WIREFRAMES } from "@/lib/block-visuals";
import { BLOCK_ART } from "@/lib/block-art";
import { BY_KEY, groupCounts, ITEMS, LIBRARY_SIZE, searchLibrary } from "@/lib/library";
import { WIDGET_PRESETS } from "@/lib/widget-presets";
import { widgetConfig } from "@/lib/widget-data";
import { addNode, initEditor, useEditor } from "@/lib/editor/store";
import { blankGraph, blankSettings } from "@/lib/graph";

// The approved V2 library (owner decision: 170 blocks + 6 widgets), from the design package's canonical inventory.
const inventory = JSON.parse(readFileSync("reference/ project/block-inventory.json", "utf8")) as { blocks: { name: string; category: string }[] };

describe("the approved 170-block library", () => {
  it("has exactly 170 blocks, never 169", () => {
    expect(LIBRARY_SIZE).toBe(170);
    expect(ITEMS.length).toBe(170);
    expect(inventory.blocks.length).toBe(170);
  });

  it("matches the approved inventory name for name, category for category, in order", () => {
    expect(ITEMS.map((i) => [LIB_GROUPS[i.group], i.label])).toEqual(inventory.blocks.map((b) => [b.category, b.name]));
  });

  it("has the 11 approved categories with computed counts", () => {
    expect(Object.keys(LIB_GROUPS).length).toBe(11);
    const c = groupCounts();
    expect(c).toEqual({ traffic: 39, page: 19, offer: 14, action: 19, comms: 12, community: 8, aicall: 4, aiauto: 9, sales: 17, logic: 15, annot: 14 });
    expect(Object.values(c).reduce((a, b) => a + b, 0)).toBe(170);
  });

  it("has no duplicate or missing keys, and every item is a real block type", () => {
    const keys = ITEMS.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(Object.keys(BY_KEY).length).toBe(170);
    for (const i of ITEMS) {
      expect(i.label.trim(), i.key).not.toBe("");
      expect(isBlockType(i.payload.type), `${i.key} -> ${i.payload.type}`).toBe(true);
      expect(LIB_GROUPS[i.group], i.key).toBeTruthy();
    }
    // flow blocks are 1:1 with a block type, so each one has its own icon and behaviour
    const flow = ITEMS.filter((i) => typeOf(i.payload.type).cat !== "annot");
    expect(new Set(flow.map((i) => i.payload.type)).size).toBe(flow.length);
    expect(flow.length).toBe(156);
  });

  it("uses the owner's artwork for the six categories that have it, and the family tile elsewhere", () => {
    const withArt = ITEMS.filter((i) => BLOCK_ART[i.key]);
    expect(withArt.length).toBe(116);
    for (const g of ["traffic", "action", "comms", "sales", "logic", "annot"] as LibGroup[]) for (const i of ITEMS.filter((x) => x.group === g)) expect(BLOCK_ART[i.key], i.key).toBeTruthy();
    for (const g of ["page", "offer", "community", "aicall", "aiauto"] as LibGroup[]) for (const i of ITEMS.filter((x) => x.group === g)) expect(BLOCK_ART[i.key], i.key).toBeFalsy();
    for (const a of Object.values(BLOCK_ART)) expect(() => readFileSync(`public/blocks/${a.file}`)).not.toThrow();
  });

  it("gives every item a visual definition (family + geometry)", () => {
    for (const i of ITEMS) {
      const v = visualOf(i.payload.type);
      expect(FAMILIES[v.family], i.key).toBeTruthy();
      expect(FAMILY_GEOM[v.family], i.key).toBeTruthy();
    }
  });

  it("draws every page and offer with a semantic wireframe", () => {
    for (const i of ITEMS) {
      const v = visualOf(i.payload.type);
      if (!FAMILIES[v.family].strip) continue;
      expect(WIREFRAMES[v.wireframe!], i.key).toBeTruthy();
    }
    expect(visualOf("optin").wireframe).toBe("optin");
    expect(visualOf("webinar").wireframe).toBe("webinar");
  });

  it("finds every item by its own label, by keyword and by category name", () => {
    for (const i of ITEMS) expect(searchLibrary(i.label).map((x) => x.key), i.key).toContain(i.key);
    expect(searchLibrary("oto").map((x) => x.key)).toContain("upsell");
    expect(searchLibrary("Sales & CRM").length).toBe(17);
    expect(searchLibrary("AI Calling").length).toBeGreaterThanOrEqual(4);
    expect(searchLibrary("zzzz-nothing")).toEqual([]);
  });

  it("keeps earlier block types working on saved maps (they are not offered as new library items)", () => {
    for (const k of ["call", "seq", "upsellp", "mql", "hightick", "coaching", "endp"]) {
      expect(isBlockType(k), k).toBe(true);
      expect(ITEMS.some((i) => i.payload.type === k), k).toBe(false);
    }
  });

  describe("placeable", () => {
    beforeEach(() => initEditor({ funnelId: "t", clientId: "c", name: "t", graph: blankGraph(), settings: blankSettings() }));
    it("every item can be added to the canvas as its block type", () => {
      for (const i of ITEMS) {
        const n = addNode(i.payload.type, 0, 0, i.payload);
        expect(n, i.key).toBeTruthy();
        expect(n!.type).toBe(i.payload.type);
      }
      expect(useEditor.getState().nodes.length).toBe(170);
      for (const k of Object.keys(BLOCK_TYPES)) expect(typeOf(k).label).toBeTruthy();
    });
  });
});

describe("the six widgets", () => {
  it("are a separate system of six, not funnel blocks", () => {
    expect(WIDGET_PRESETS.map((w) => w.label)).toEqual(["Number", "Number + trend", "Trend chart", "Goal progress", "MRR projection", "Conversion path"]);
    expect(ITEMS.some((i) => i.payload.type === "widget")).toBe(false);
    for (const w of WIDGET_PRESETS) expect(widgetConfig(w.p).display).toBe(w.p.display);
  });
});

describe("Quick Add shows every block", () => {
  it("each of the 170 is among the first results (Quick Add lists 12, 20 on a phone) when its own name is typed", () => {
    const misses: string[] = [];
    for (const i of ITEMS) {
      const top = searchLibrary(i.label).slice(0, 12).map((x) => x.key);
      if (!top.includes(i.key)) misses.push(`${i.key} (${i.label})`);
    }
    expect(misses).toEqual([]);
  });
});
