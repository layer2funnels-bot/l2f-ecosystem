import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compute } from "@/lib/funnel-math";
import { blankSettings, exportFunnelFile, importFunnelFile, parseGraph } from "@/lib/graph";
import { boxCss, cleanStyle, edgeLook, textCss } from "@/lib/style";
import { tidyLayout } from "@/lib/layout";
import { builtinTemplate } from "@/lib/templates";
import {
  addNode,
  align,
  checklistOf,
  copySelection,
  deleteSelection,
  initEditor,
  layerOf,
  newChecklistItem,
  nudge,
  paste,
  reorder,
  selectNodes,
  setChecklist,
  setEdgeStyle,
  setLocked,
  setNodeStyle,
  undo,
  useEditor,
} from "@/lib/editor/store";

const S = () => useEditor.getState();
const settle = () => vi.advanceTimersByTime(400);
const node = (id: string) => S().nodes.find((n) => n.id === id)!;

function load(key = "webinar") {
  const t = builtinTemplate(key);
  initEditor({ funnelId: "f1", clientId: "c1", name: t.name, graph: t.graph, settings: blankSettings() });
  return t;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("lock", () => {
  it("locked elements can't be deleted, nudged or aligned; unlocking restores that", () => {
    const t = load();
    const [a, b] = [t.graph.nodes[0].id, t.graph.nodes[1].id];
    selectNodes([a]);
    setLocked(true);
    expect(node(a).locked).toBe(true);
    const before = { x: node(a).x, y: node(a).y };
    nudge(11, 0);
    expect({ x: node(a).x, y: node(a).y }).toEqual(before);
    deleteSelection();
    expect(node(a)).toBeTruthy();
    selectNodes([a, b]);
    align("left");
    expect({ x: node(a).x, y: node(a).y }).toEqual(before);
    setLocked(false, [a]);
    expect(node(a).locked).toBeUndefined();
    selectNodes([a]);
    deleteSelection();
    expect(S().nodes.find((n) => n.id === a)).toBeUndefined();
  });

  it("copies start unlocked", () => {
    const t = load();
    const a = t.graph.nodes[0].id;
    setLocked(true, [a]);
    selectNodes([a]);
    copySelection();
    paste();
    const copy = S().nodes[S().nodes.length - 1];
    expect(copy.id).not.toBe(a);
    expect(copy.locked).toBeUndefined();
  });
});

describe("layer order", () => {
  it("front / back / forward / backward", () => {
    const t = load();
    const [a, b] = [t.graph.nodes[0].id, t.graph.nodes[1].id];
    reorder("front", [a]);
    expect(layerOf(node(a))).toBeGreaterThan(Math.max(...S().nodes.filter((n) => n.id !== a).map(layerOf)));
    reorder("back", [b]);
    expect(layerOf(node(b))).toBeLessThan(Math.min(...S().nodes.filter((n) => n.id !== b).map(layerOf)));
    const z = layerOf(node(a));
    reorder("backward", [a]);
    expect(layerOf(node(a))).toBe(z - 1);
    reorder("forward", [a]);
    expect(layerOf(node(a))).toBe(z);
  });

  it("frames default below blocks", () => {
    load("tripwire");
    const frame = S().nodes.find((n) => n.type === "frame")!;
    const block = S().nodes.find((n) => n.type === "checkout")!;
    expect(layerOf(frame)).toBeLessThan(layerOf(block));
  });
});

describe("styles", () => {
  it("merge, reset and undo; never touch the maths", () => {
    const t = load();
    const id = t.graph.nodes[1].id;
    const rev = S().R.rev;
    setNodeStyle(id, { fill: "#112233", weight: 700, italic: true });
    expect(node(id).s).toEqual({ fill: "#112233", weight: 700, italic: true });
    setNodeStyle(id, { italic: undefined });
    expect(node(id).s).toEqual({ fill: "#112233", weight: 700 });
    expect(S().R.rev).toBe(rev);
    settle();
    undo();
    expect(node(id).s).toBeUndefined();
  });

  it("connection styles are presentation only", () => {
    const t = load();
    const e = t.graph.edges[0].id;
    const flows = { ...S().R.flows };
    setEdgeStyle(e, { kind: "skip", path: "elbow", color: "#ff0000", arrow: "end" });
    expect(S().edges.find((x) => x.id === e)!.s).toEqual({ kind: "skip", path: "elbow", color: "#ff0000", arrow: "end" });
    expect(S().R.flows).toEqual(flows);
    setEdgeStyle(e, { kind: undefined, path: undefined, color: undefined, arrow: undefined });
    expect(S().edges.find((x) => x.id === e)!.s).toBeUndefined();
  });

  it("CSS helpers", () => {
    expect(boxCss({ fill: "#000", borderW: 2, borderStyle: "dashed", radius: 4, opacity: 0.5, shadow: "none" })).toEqual({ background: "#000", borderWidth: 2, borderStyle: "dashed", borderRadius: 4, opacity: 0.5, boxShadow: "none" });
    expect(textCss({ weight: 600, italic: true, underline: true, strike: true, ls: 1.5, lh: 1.4, align: "center" }, 20)).toEqual({ fontSize: 20, fontWeight: 600, fontStyle: "italic", textDecoration: "underline line-through", letterSpacing: "1.5px", lineHeight: 1.4, textAlign: "center" });
    expect(edgeLook({ kind: "skip" }).dash).toBe("dotted");
    expect(edgeLook({ kind: "nodata" }).dash).toBe("dashdot");
    expect(edgeLook({ kind: "skip", dash: "solid" }).dash).toBe("solid");
    expect(cleanStyle({ a: undefined, b: "" })).toBeUndefined();
  });
});

describe("checklists", () => {
  it("element checklist on a block and a canvas checklist element", () => {
    const t = load();
    const id = t.graph.nodes[1].id;
    setChecklist(id, [newChecklistItem("Write copy"), newChecklistItem("Build page")]);
    expect(checklistOf(node(id)).map((i) => i.text)).toEqual(["Write copy", "Build page"]);
    setChecklist(id, []);
    expect(node(id).checklist).toBeUndefined();
    const c = addNode("checklist", 0, 0)!;
    expect(checklistOf(node(c.id))).toHaveLength(1);
    expect(node(c.id).w).toBe(260);
  });

  it("new canvas primitives get their default sizes", () => {
    load();
    expect(addNode("shape", 0, 0)).toMatchObject({ w: 200, h: 120, p: { shape: "rounded" } });
    expect(addNode("image", 0, 0)).toMatchObject({ w: 320, h: 200, p: { src: "" } });
  });
});

describe("persistence", () => {
  it("style, lock, layer, checklists and connection styles survive load and the JSON round-trip", () => {
    const t = builtinTemplate("webinar");
    const g = structuredClone(t.graph);
    g.nodes[0] = { ...g.nodes[0], s: { fill: "#123456", font: "serif" }, locked: true, z: 3, checklist: [{ id: "c1", text: "Brief", done: true, indent: 1 }] };
    g.nodes.push({ id: "sh", type: "shape", name: "Shape", x: 0, y: 0, w: 150, h: 90, p: { shape: "diamond", text: "Hi" } });
    g.edges[0] = { ...g.edges[0], s: { kind: "nodata", dash: "dotted", width: 4 } };
    const back = parseGraph(JSON.parse(JSON.stringify(g)));
    expect(back.nodes[0]).toMatchObject({ s: { fill: "#123456", font: "serif" }, locked: true, z: 3, checklist: [{ id: "c1", text: "Brief", done: true, indent: 1 }] });
    expect(back.nodes.find((n) => n.id === "sh")).toMatchObject({ type: "shape", w: 150, h: 90, p: { shape: "diamond", text: "Hi" } });
    expect(back.edges[0].s).toEqual({ kind: "nodata", dash: "dotted", width: 4 });
    const file = importFunnelFile(JSON.parse(JSON.stringify(exportFunnelFile({ name: "x", graph: back, settings: blankSettings() }))));
    expect(file.graph).toEqual(back);
    // and the maths is identical to the unstyled funnel
    expect(compute(back, blankSettings()).rev).toBeCloseTo(compute(t.graph, blankSettings()).rev, 9);
  });

  it("Tidy up carries shapes, images and checklists like notes", () => {
    const t = builtinTemplate("quiz");
    const first = t.graph.nodes[0];
    const shape = { id: "sh", type: "shape", name: "Shape", x: first.x, y: first.y - 160, w: 160, h: 80, p: { shape: "rect" } };
    const res = tidyLayout([...t.graph.nodes, shape], t.graph.edges, { snap: false });
    const f = res.find((n) => n.id === first.id)!,
      s = res.find((n) => n.id === "sh")!;
    expect([s.x - f.x, s.y - f.y]).toEqual([0, -160]);
  });
});
