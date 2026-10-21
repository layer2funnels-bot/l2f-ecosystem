// Auto-layout ("Tidy up"). tidyLayout() is a pure port of the prototype's tidy(): a layered (Sugiyama-style)
// layout tuned for funnels: traffic on the left, converted paths straight across, "didn't convert" paths below.
// elkLayout() is an alternative using elkjs' layered algorithm with fixed port sides.
import { NH, NODE_W, PITCH, blockH, blockPivot, isAnnot, nodeW, picRect, typeOf } from "./catalog";
import type { FunnelEdge, FunnelNode } from "./graph";
import { sidesOf } from "./edge-geometry";

export interface LayoutOptions {
  /** Measured node heights (notes grow with text). Defaults to NH. */
  heightOf?: (n: FunnelNode) => number;
  /** Measured node widths (headings size to their text). Defaults to the catalog width. */
  widthOf?: (n: FunnelNode) => number;
  snap?: boolean;
  /** Width of a flow block by type (defaults to the canonical footprint) and the rank column width. */
  blockW?: (type: string) => number;
  colW?: number;
}

/** Fallback annotation sizes when nothing was measured (matches the editor's defaults). */
const annotW = (n: FunnelNode) => n.w ?? (n.type === "label" ? 300 : nodeW(n.type));
const defaultH = (n: FunnelNode) => n.h ?? (n.type === "label" ? 40 : isAnnot(n.type) ? NH : blockH(n.type));

const GRID = 10;
const snapper = (on: boolean) => (v: number) => (on ? Math.round(v / GRID) * GRID : Math.round(v));

/**
 * Records where notes/headings/frames sit relative to flow blocks, then re-applies that after a layout moves the blocks.
 * Frames are refitted around the blocks inside them. Notes and headings are not part of the flow: each keeps its exact
 * offset from the nearest block (so text placed above, beside or below a step stays there), and is only nudged when the
 * new layout would make it overlap a block or another annotation.
 */
function captureAnnotations(nodes: FunnelNode[], flow: FunnelNode[], B: Record<string, FunnelNode>, nodeH: (n: FunnelNode) => number, widthOf: (n: FunnelNode) => number, bw: (type: string) => number = nodeW) {
  const W = (n: FunnelNode) => (isAnnot(n.type) ? widthOf(n) : bw(n.type));
  const center = (n: FunnelNode): [number, number] => [n.x + W(n) / 2, n.y + nodeH(n) / 2];
  const frames = nodes
    .filter((n) => n.type === "frame")
    .map((f) => ({
      f: B[f.id],
      members: flow
        .filter((n) => {
          const [cx, cy] = center(n);
          return cx > f.x && cx < f.x + (f.w ?? 0) && cy > f.y && cy < f.y + (f.h ?? 0);
        })
        .map((n) => n.id),
    }));
  const anchors = nodes
    .filter((n) => isAnnot(n.type) && n.type !== "frame")
    .sort((p, q) => p.y - q.y || p.x - q.x)
    .map((a) => {
      const [ax, ay] = center(a);
      let best: FunnelNode | null = null,
        bd = Infinity;
      for (const n of flow) {
        const [cx, cy] = center(n),
          d = (cx - ax) ** 2 + (cy - ay) ** 2;
        if (d < bd) {
          bd = d;
          best = n;
        }
      }
      return { a: B[a.id], to: best?.id, dx: best ? a.x - best.x : 0, dy: best ? a.y - best.y : 0 };
    });
  return () => {
    type Box = { x: number; y: number; w: number; h: number };
    const box = (n: FunnelNode, pad = 0): Box => ({ x: n.x - pad, y: n.y - pad, w: W(n) + 2 * pad, h: nodeH(n) + 2 * pad });
    const hits = (p: Box, q: Box) => p.x < q.x + q.w && p.x + p.w > q.x && p.y < q.y + q.h && p.y + p.h > q.y;
    const blocks = flow.map((n) => box(B[n.id], 12));
    const placed: Box[] = [];
    // annotations keep 8px apart from each other and 12px from blocks
    const free = (a: FunnelNode) => {
      const r = box(a, 8);
      return !blocks.some((q) => hits(box(a), q)) && !placed.some((q) => hits(r, q));
    };
    anchors.forEach(({ a, to, dx, dy }) => {
      if (to) {
        a.x = B[to].x + dx;
        a.y = B[to].y + dy;
      }
      if (!free(a)) {
        // nearest free spot: try small vertical shifts first (alternating down/up), then sideways
        const x0 = a.x,
          y0 = a.y;
        let found = false;
        for (let k = 1; k <= 60 && !found; k++) {
          const d = Math.ceil(k / 2) * 16 * (k % 2 ? 1 : -1);
          for (const [ox, oy] of [[0, d], [d, 0]]) {
            a.x = x0 + ox;
            a.y = y0 + oy;
            if (free(a)) {
              found = true;
              break;
            }
          }
        }
        if (!found) Object.assign(a, { x: x0, y: y0 });
      }
      placed.push(box(a));
    });
    frames.forEach(({ f, members }) => {
      const ms = members.map((i) => B[i]).filter(Boolean);
      if (!ms.length) return;
      const x0 = Math.min(...ms.map((n) => n.x)) - 30,
        y0 = Math.min(...ms.map((n) => n.y)) - 44,
        x1 = Math.max(...ms.map((n) => n.x + bw(n.type))) + 30,
        y1 = Math.max(...ms.map((n) => n.y + nodeH(n))) + 40;
      Object.assign(f, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    });
  };
}

/** Returns a new node list with flow blocks re-positioned and notes / headings / frames carried along. */
export function tidyLayout(nodes: FunnelNode[], edges: FunnelEdge[], opts: LayoutOptions = {}): FunnelNode[] {
  const nodeH = opts.heightOf ?? defaultH;
  const widthOf = opts.widthOf ?? annotW;
  const snap = snapper(opts.snap ?? true);
  const flow = nodes.filter((n) => !isAnnot(n.type));
  if (!flow.length) return nodes;
  const B: Record<string, FunnelNode> = Object.fromEntries(nodes.map((n) => [n.id, { ...n }]));
  const ids = new Set(flow.map((n) => n.id));
  const E = edges.filter((e) => ids.has(e.from) && ids.has(e.to));

  // remember annotations: frames by membership, notes/labels by their offset from the nearest block
  const bw = opts.blockW ?? nodeW;
  const carryAnnotations = captureAnnotations(nodes, flow, B, nodeH, widthOf, bw);

  // 1. break cycles (DFS, traffic first, main paths before alt)
  const out: Record<string, FunnelEdge[]> = {},
    inn: Record<string, FunnelEdge[]> = {};
  flow.forEach((n) => {
    out[n.id] = [];
    inn[n.id] = [];
  });
  const sortE = (a: FunnelEdge, b: FunnelEdge) => Number(a.port === "alt") - Number(b.port === "alt");
  E.slice()
    .sort(sortE)
    .forEach((e) => out[e.from].push(e));
  const isTraffic = (n: FunnelNode) => Number(typeOf(n.type).cat === "traffic");
  const startOrder = flow.slice().sort((a, b) => isTraffic(b) - isTraffic(a) || a.y - b.y);
  const state: Record<string, number> = {},
    back = new Set<string>(),
    dfsIdx: Record<string, number> = {};
  let k = 0;
  const visit = (id: string) => {
    state[id] = 1;
    dfsIdx[id] = k++;
    out[id].forEach((e) => {
      if (state[e.to] === 1) back.add(e.id);
      else if (!state[e.to]) visit(e.to);
    });
    state[id] = 2;
  };
  startOrder
    .filter((n) => !E.some((e) => e.to === n.id))
    .forEach((n) => {
      if (!state[n.id]) visit(n.id);
    });
  startOrder.forEach((n) => {
    if (!state[n.id]) visit(n.id);
  });
  const D = E.filter((e) => !back.has(e.id));
  D.forEach((e) => inn[e.to].push(e));

  // 2. a grid guided by the ports, so a funnel keeps the shape people draw: a line that leaves a block's right side
  // continues to the next column, one that leaves its bottom (the "didn't convert" path, or a follow-up ladder) continues
  // on the next row. Each block's subtree is laid out on its own and the subtrees are stacked without touching.
  type Cell = { id: string; c: number; r: number };
  const goesDown = (e: FunnelEdge) => sidesOf(e)[0] === "bottom";
  const placed = new Set<string>();
  const lowest = (cells: Cell[]) => Math.max(...cells.map((x) => x.r));
  const sub = (id: string): Cell[] => {
    placed.add(id);
    const cells: Cell[] = [{ id, c: 0, r: 0 }];
    const kids = out[id].filter((e) => !back.has(e.id));
    let bottom = 0,
      first = true;
    for (const e of kids.filter((k) => !goesDown(k))) {
      if (placed.has(e.to)) continue;
      const s = sub(e.to);
      const off = first ? 0 : bottom + 1;
      s.forEach((x) => cells.push({ id: x.id, c: x.c + 1, r: x.r + off }));
      bottom = Math.max(bottom, off + lowest(s));
      first = false;
    }
    for (const e of kids.filter(goesDown)) {
      if (placed.has(e.to)) continue;
      const s = sub(e.to);
      const off = bottom + 1;
      s.forEach((x) => cells.push({ id: x.id, c: x.c, r: x.r + off }));
      bottom = off + lowest(s);
    }
    return cells;
  };
  const cell: Record<string, { c: number; r: number }> = {};
  let nextRow = 0;
  const roots = startOrder.filter((n) => !E.some((e) => e.to === n.id && !back.has(e.id)));
  [...roots, ...startOrder].forEach((n) => {
    if (placed.has(n.id)) return;
    const s = sub(n.id);
    s.forEach((x) => (cell[x.id] = { c: x.c, r: x.r + nextRow }));
    nextRow += lowest(s) + 1;
  });
  const COLW = opts.colW ?? NODE_W,
    GAPX = PITCH.x - COLW;
  // each row is aligned on the picture centre (pages are taller than sources), so lines stay straight
  const ROWC = Math.max(...flow.map((n) => blockPivot(n.type)));
  flow.forEach((id) => {
    const n = B[id.id],
      g = cell[id.id];
    n.x = snap(80 + g.c * (COLW + GAPX) + (COLW - bw(n.type)) / 2);
    n.y = snap(80 + g.r * PITCH.y + ROWC - blockPivot(n.type));
  });

  // 5. carry annotations along
  carryAnnotations();

  return nodes.map((n) => B[n.id]);
}

/* ---------------- elkjs alternative ---------------- */
/**
 * ELK layered layout with ports: main output on the EAST side, alt output on the SOUTH side, input on WEST.
 * Async because elkjs runs its solver asynchronously. Annotations are carried along with the same rules as tidyLayout.
 */
export async function elkLayout(nodes: FunnelNode[], edges: FunnelEdge[], opts: LayoutOptions = {}): Promise<FunnelNode[]> {
  const nodeH = opts.heightOf ?? defaultH;
  const widthOf = opts.widthOf ?? annotW;
  const snap = snapper(opts.snap ?? true);
  const flow = nodes.filter((n) => !isAnnot(n.type));
  if (!flow.length) return nodes;
  const ids = new Set(flow.map((n) => n.id));
  const E = edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  const { default: ELK } = await import("elkjs/lib/elk.bundled.js");
  const elk = new ELK();
  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.layered.spacing.nodeNodeBetweenLayers": "120",
      "elk.spacing.nodeNode": "56",
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.portConstraints": "FIXED_SIDE",
      "elk.layered.layering.strategy": "LONGEST_PATH",
    },
    children: flow.map((n) => ({
      id: n.id,
      width: (opts.blockW ?? nodeW)(n.type),
      height: nodeH(n),
      layoutOptions: { "elk.portConstraints": "FIXED_SIDE" },
      ports: [
        { id: `${n.id}:in`, layoutOptions: { "elk.port.side": "WEST" } },
        { id: `${n.id}:main`, layoutOptions: { "elk.port.side": "EAST" } },
        { id: `${n.id}:alt`, layoutOptions: { "elk.port.side": "SOUTH" } },
      ],
    })),
    edges: E.map((e) => ({ id: e.id, sources: [`${e.from}:${e.port}`], targets: [`${e.to}:in`] })),
  };
  const res = await elk.layout(graph);
  const pos: Record<string, { x: number; y: number }> = {};
  res.children?.forEach((c) => (pos[c.id] = { x: c.x ?? 0, y: c.y ?? 0 }));

  const B: Record<string, FunnelNode> = Object.fromEntries(nodes.map((n) => [n.id, { ...n }]));
  const carryAnnotations = captureAnnotations(nodes, flow, B, nodeH, widthOf, opts.blockW ?? nodeW);
  flow.forEach((n) => {
    B[n.id].x = snap(80 + pos[n.id].x);
    B[n.id].y = snap(80 + pos[n.id].y);
  });
  carryAnnotations();
  return nodes.map((n) => B[n.id]);
}

/* ---------------- layout quality metrics (used by tests and the comparison page) ---------------- */
export function layoutMetrics(nodes: FunnelNode[], edges: FunnelEdge[], heightOf: (n: FunnelNode) => number = (n) => blockH(n.type)) {
  const flow = nodes.filter((n) => !isAnnot(n.type));
  const B = Object.fromEntries(flow.map((n) => [n.id, n]));
  let overlaps = 0;
  for (let i = 0; i < flow.length; i++)
    for (let j = i + 1; j < flow.length; j++) {
      const a = flow[i],
        b = flow[j];
      if (a.x < b.x + nodeW(b.type) && a.x + nodeW(a.type) > b.x && a.y < b.y + heightOf(b) && a.y + heightOf(a) > b.y) overlaps++;
    }
  const segs = edges
    .filter((e) => B[e.from] && B[e.to])
    .map((e) => {
      const a = B[e.from],
        b = B[e.to];
      // lines leave and arrive at the picture, not at the name under it
      const pa = picRect(a.type),
        pb = picRect(b.type);
      const p1 = e.port === "alt" ? [a.x + pa.x + pa.w / 2, a.y + pa.y + pa.h] : [a.x + pa.x + pa.w, a.y + blockPivot(a.type)];
      const p2 = [b.x + pb.x, b.y + blockPivot(b.type)];
      return { e, p1, p2 };
    });
  const cross = (p: number[], q: number[], r: number[], s: number[]) => {
    const d = (a: number[], b: number[], c: number[]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    return d(p, q, r) * d(p, q, s) < 0 && d(r, s, p) * d(r, s, q) < 0;
  };
  let crossings = 0;
  for (let i = 0; i < segs.length; i++)
    for (let j = i + 1; j < segs.length; j++) if (cross(segs[i].p1, segs[i].p2, segs[j].p1, segs[j].p2)) crossings++;
  const backward = segs.filter((s) => s.p2[0] < s.p1[0]).length;
  const length = segs.reduce((acc, s) => acc + Math.hypot(s.p2[0] - s.p1[0], s.p2[1] - s.p1[1]), 0);
  const xs = flow.flatMap((n) => [n.x, n.x + nodeW(n.type)]),
    ys = flow.flatMap((n) => [n.y, n.y + heightOf(n)]);
  const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
  return { overlaps, crossings, backward, length: Math.round(length), area: Math.round(area) };
}
