import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { blankSettings } from "@/lib/graph";
import { builtinTemplate } from "@/lib/templates";
import {
  addNode,
  align,
  canConnect,
  connect,
  copySelection,
  deleteSelection,
  duplicateSelection,
  frameMembers,
  initEditor,
  moveNodes,
  nudge,
  paste,
  redo,
  selectEdge,
  selectNodes,
  setName,
  setPositionsTransient,
  setDims,
  setReadOnly,
  undo,
  updateEdge,
  updateParams,
  useEditor,
  wrapInFrame,
} from "@/lib/editor/store";

const S = () => useEditor.getState();
const settle = () => vi.advanceTimersByTime(400); // history commits 350 ms after the last edit

function load(key = "webinar") {
  const t = builtinTemplate(key);
  initEditor({ funnelId: "f1", clientId: "c1", name: t.name, graph: t.graph, settings: blankSettings() });
  return t;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("editor store", () => {
  it("computes results on load", () => {
    load();
    expect(S().R.rev).toBeGreaterThan(0);
    expect(S().rev).toBe(0);
    expect(S().saveStatus).toBe("saved");
  });

  it("edits recompute the maths, mark dirty and are undoable", () => {
    load();
    const ck = S().nodes.find((n) => n.type === "checkout")!;
    const before = S().R.rev;
    updateParams(ck.id, { price: 1997 });
    expect(S().R.rev).toBeGreaterThan(before);
    expect(S().saveStatus).toBe("dirty");
    settle();
    undo();
    expect(S().R.rev).toBeCloseTo(before);
    redo();
    expect(S().R.rev).toBeGreaterThan(before);
  });

  it("coalesces rapid edits (typing) into one undo step", () => {
    load();
    setName("A");
    setName("AB");
    setName("ABC");
    settle();
    expect(S().past.length).toBe(1);
    undo();
    expect(S().name).toBe("Webinar funnel");
  });

  it("separate edits are separate undo steps", () => {
    load();
    setName("One");
    settle();
    setName("Two");
    settle();
    undo();
    expect(S().name).toBe("One");
    undo();
    expect(S().name).toBe("Webinar funnel");
    redo();
    redo();
    expect(S().name).toBe("Two");
  });

  it("quick discrete actions (paste, duplicate, delete) are separate undo steps", () => {
    load();
    selectNodes([S().nodes[0].id]);
    copySelection();
    paste();
    duplicateSelection();
    deleteSelection();
    expect(S().nodes.length).toBe(10);
    undo();
    expect(S().nodes.length).toBe(11);
    undo();
    expect(S().nodes.length).toBe(10);
    undo();
    expect(S().nodes.length).toBe(9);
  });

  it("moving blocks does not recompute the maths", () => {
    load();
    const R = S().R;
    const n = S().nodes[0];
    moveNodes({ [n.id]: { x: n.x + 100, y: n.y } });
    expect(S().R).toBe(R);
    expect(S().nodes[0].x).toBe(n.x + 100);
  });

  it("adds blocks snapped to the 10px grid and selects them", () => {
    load();
    const n = addNode("landing", 103, 57)!;
    expect(n.x % 10).toBe(0);
    expect(n.y % 10).toBe(0);
    expect(S().selNodes).toEqual([n.id]);
    expect(n.p.cr).toBe(30);
  });

  it("connect rules: no self, no duplicates, nothing into traffic or notes", () => {
    load();
    const a = addNode("landing", 0, 0)!;
    const b = addNode("checkout", 300, 0)!;
    const src = addNode("fbads", -300, 0)!;
    const note = addNode("note", 0, 300)!;
    expect(canConnect(a.id, a.id, "main")).toBe(false);
    expect(canConnect(a.id, src.id, "main")).toBe(false);
    expect(canConnect(a.id, note.id, "main")).toBe(false);
    connect(a.id, "main", b.id);
    expect(canConnect(a.id, b.id, "main")).toBe(false);
    expect(canConnect(a.id, b.id, "alt")).toBe(true);
    connect(src.id, "main", a.id);
    expect(S().R.N[b.id].inflow).toBeGreaterThan(0);
  });

  it("edge share and port changes flow through the maths", () => {
    load("tripwire");
    const e = S().edges.find((x) => x.port === "main" && S().nodes.find((n) => n.id === x.from)?.type === "quizp")!;
    const target = e.to;
    const full = S().R.N[target].inflow;
    updateEdge(e.id, { share: 50 });
    expect(S().R.N[target].inflow).toBeCloseTo(full / 2);
    updateEdge(e.id, { port: "alt" });
    expect(S().R.flows[e.id]).toBeCloseTo(S().R.N[e.from].non / 2);
  });

  it("deleting a block removes its edges; deleting an edge keeps blocks", () => {
    load();
    const n = S().nodes.find((x) => x.type === "checkout")!;
    selectNodes([n.id]);
    deleteSelection();
    expect(S().nodes.some((x) => x.id === n.id)).toBe(false);
    expect(S().edges.some((e) => e.from === n.id || e.to === n.id)).toBe(false);
    const e = S().edges[0];
    const count = S().nodes.length;
    selectEdge(e.id);
    deleteSelection();
    expect(S().edges.some((x) => x.id === e.id)).toBe(false);
    expect(S().nodes.length).toBe(count);
  });

  it("copy/paste and duplicate clone blocks and the edges between them", () => {
    load();
    const ids = S().nodes.slice(0, 3).map((n) => n.id);
    const innerEdges = S().edges.filter((e) => ids.includes(e.from) && ids.includes(e.to)).length;
    selectNodes(ids);
    expect(copySelection()).toBe(true);
    paste();
    expect(S().nodes.length).toBe(12);
    expect(S().selNodes.length).toBe(3);
    expect(S().selNodes.some((i) => ids.includes(i))).toBe(false);
    const pastedEdges = S().edges.filter((e) => S().selNodes.includes(e.from) && S().selNodes.includes(e.to)).length;
    expect(pastedEdges).toBe(innerEdges);
    const firstPaste = S().nodes.find((n) => n.id === S().selNodes[0])!;
    paste(); // pasting again offsets again
    const second = S().nodes.find((n) => n.id === S().selNodes[0])!;
    expect(second.x - firstPaste.x).toBe(44);
    duplicateSelection();
    expect(S().nodes.length).toBe(18);
  });

  it("nudge and align", () => {
    load();
    const [a, b, c] = S().nodes;
    selectNodes([a.id, b.id, c.id]);
    nudge(11, -33);
    expect(S().nodes[0].x).toBe(a.x + 11);
    expect(S().nodes[0].y).toBe(a.y - 33);
    align("top");
    const ys = S().nodes.slice(0, 3).map((n) => n.y);
    expect(new Set(ys).size).toBe(1);
    align("left");
    expect(new Set(S().nodes.slice(0, 3).map((n) => n.x)).size).toBe(1);
  });

  it("wraps a selection in a frame; frame members are the blocks inside it", () => {
    load();
    const ids = S().nodes.slice(0, 2).map((n) => n.id);
    selectNodes(ids);
    wrapInFrame();
    const f = S().nodes[0];
    expect(f.type).toBe("frame");
    expect(frameMembers(f.id).sort()).toEqual([...ids].sort());
  });

  it("transient positions (animation) plus a final move are one undo step", () => {
    load();
    const n = S().nodes[0];
    setName("x");
    settle();
    setPositionsTransient({ [n.id]: { x: 1, y: 1 } });
    setPositionsTransient({ [n.id]: { x: 2, y: 2 } });
    moveNodes({ [n.id]: { x: 500, y: 500 } });
    settle();
    undo();
    expect(S().nodes[0].x).toBe(n.x);
    expect(S().name).toBe("x");
  });

  it("setDims ignores unchanged sizes (no render loop)", () => {
    load();
    setDims({ a: { width: 210, height: 96 } });
    const d = S().dims;
    setDims({ a: { width: 210, height: 96 } });
    expect(S().dims).toBe(d);
    setDims({ a: { width: 210, height: 120 } });
    expect(S().dims).not.toBe(d);
  });

  it("view-only mode blocks edits", () => {
    load();
    setReadOnly(true);
    setName("nope");
    addNode("landing", 0, 0);
    expect(S().name).toBe("Webinar funnel");
    expect(S().nodes.length).toBe(9);
    expect(S().saveStatus).toBe("readonly");
  });
});
