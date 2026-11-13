// Live funnel preview (V2 F2), ported from reference/preview-renderer/fmprev.py. Every funnel card, table row and
// recent-funnel tile is drawn from the funnel's OWN saved canvas (nodes, edges, frames), never from an image or a
// template thumbnail, so it can't go stale. People on each line and the biggest leak come from the authoritative
// engine (compute), the same numbers as the map; nothing here calculates a funnel.
import { blockH, isAnnot, nodeW, fourPorts, picRect, typeOf } from "./catalog";
import { visualOf, type Family, type Wireframe } from "./block-visuals";
import { compute, type FunnelResult, type MathSettings } from "./funnel-math";
import { parseGraph, parseSettings, type FunnelEdge, type FunnelGraph, type FunnelNode, type Side } from "./graph";
import { curveSides, sidesOf } from "./edge-geometry";

export type PreviewDetail = "full" | "shapes" | "blocks";

export interface PreviewNode {
  id: string;
  family: Family;
  /** Category colour key (lib/catalog CATCOLOR). */
  color: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  wireframe?: Wireframe;
  price: boolean;
}
export interface PreviewEdge {
  id: string;
  d: string;
  kind: "flow" | "leak" | "skip" | "nodata";
  width: number;
}
export interface PreviewModel {
  empty: boolean;
  label: string;
  /** Flow-space to frame transform. */
  scale: number;
  tx: number;
  ty: number;
  detail: PreviewDetail;
  /** Names are readable at this scale (>= 0.30). */
  names: boolean;
  /** Window, caption and price tab are visible at this scale (>= 0.11). */
  windows: boolean;
  nodes: PreviewNode[];
  edges: PreviewEdge[];
  frames: { x: number; y: number; w: number; h: number; color: string }[];
  /** The block with the biggest leak (same fact as the map's Key leak): it carries a dashed orange ring. */
  leakId: string | null;
}

const sideXY = (n: { x: number; y: number; w: number; h: number }, side: Side): [number, number] =>
  side === "left" ? [n.x, n.y + n.h / 2] : side === "right" ? [n.x + n.w, n.y + n.h / 2] : side === "top" ? [n.x + n.w / 2, n.y] : [n.x + n.w / 2, n.y + n.h];

/**
 * Lay a saved funnel out in a `w` x `h` frame. `pad` 8px on cards, 4px in tables. scale = min(w/bboxW, h/bboxH, 0.5),
 * centred. Notes and text never affect the fit. Up to 60 blocks get full detail, 61-200 family shapes, more: blocks only.
 */
export function previewModel(rawGraph: unknown, rawSettings: unknown, w: number, h: number, pad = 8, name = "this funnel"): PreviewModel {
  let g: FunnelGraph;
  try {
    g = parseGraph(rawGraph);
  } catch {
    g = { nodes: [], edges: [], view: { x: 0, y: 0, k: 1 } };
  }
  let settings: MathSettings;
  try {
    settings = parseSettings(rawSettings);
  } catch {
    settings = parseSettings({});
  }
  const flow = g.nodes.filter((n) => typeOf(n.type) && !isAnnot(n.type));
  const frames = g.nodes.filter((n) => n.type === "frame");
  const label = `Map of ${name}: ${flow.length} ${flow.length === 1 ? "block" : "blocks"}, ${g.edges.length} ${g.edges.length === 1 ? "connection" : "connections"}`;
  const base = { label, scale: 1, tx: 0, ty: 0, detail: "full" as PreviewDetail, names: false, windows: false, nodes: [], edges: [], frames: [], leakId: null };
  if (!flow.length) return { ...base, empty: true };

  // lines attach to the picture, so `box` is the picture; the block with its name under it decides the fit
  const box = (n: FunnelNode) => {
    const r = picRect(n.type);
    return { x: n.x + r.x, y: n.y + r.y, w: r.w, h: r.h };
  };
  const whole = (n: FunnelNode) => ({ x: n.x, y: n.y, w: nodeW(n.type), h: blockH(n.type) });
  const rects = [...flow.map(whole), ...frames.map((f) => ({ x: f.x, y: f.y, w: f.w ?? 400, h: f.h ?? 240 }))];
  // offers carry a price tab 10px above the card
  const x0 = Math.min(...rects.map((r) => r.x)),
    y0 = Math.min(...rects.map((r) => r.y)) - 10,
    x1 = Math.max(...rects.map((r) => r.x + r.w)),
    y1 = Math.max(...rects.map((r) => r.y + r.h));
  const bw = Math.max(1, x1 - x0),
    bh = Math.max(1, y1 - y0);
  const scale = Math.min((w - 2 * pad) / bw, (h - 2 * pad) / bh, 0.5);
  const tx = (w - bw * scale) / 2 - x0 * scale,
    ty = (h - bh * scale) / 2 - y0 * scale;
  const detail: PreviewDetail = flow.length > 200 ? "blocks" : flow.length > 60 ? "shapes" : "full";

  let R: FunnelResult | null = null;
  try {
    R = compute(g, settings);
  } catch {
    R = null;
  }
  const byId = new Map(flow.map((n) => [n.id, n]));
  const live = g.edges.filter((e) => byId.has(e.from) && byId.has(e.to));
  const vmax = Math.max(1e-9, ...live.map((e) => R?.flows[e.id] ?? 0));
  const edges: PreviewEdge[] =
    detail === "blocks"
      ? []
      : live.map((e: FunnelEdge) => {
          const a = byId.get(e.from)!,
            b = byId.get(e.to)!;
          const [sp, tp] = sidesOf(e);
          const s1: Side = fourPorts(a.type) ? sp : e.port === "alt" ? "bottom" : "right",
            t1: Side = fourPorts(b.type) ? tp : "left";
          const [sx, sy] = sideXY(box(a), s1),
            [ex, ey] = sideXY(box(b), t1);
          const [d] = curveSides(sx, sy, s1, ex, ey, t1);
          const people = R?.flows[e.id] ?? 0;
          const kind = e.s?.kind === "skip" ? "skip" : e.s?.kind === "nodata" ? "nodata" : e.port === "alt" ? "leak" : "flow";
          // thickness = 1 + 1.7·√(people / max), in frame pixels (divided back into flow units by the scale)
          return { id: e.id, d, kind, width: (1 + 1.7 * Math.sqrt(Math.max(0, people) / vmax)) / scale };
        });
  // biggest leak: the page, offer or action that loses the most people (lib/funnel-math leaks()[0])
  let leakId: string | null = null,
    most = 0;
  if (R)
    for (const n of flow) {
      const r = R.N[n.id],
        c = typeOf(n.type).cat;
      if ((c === "page" || c === "offer" || c === "action") && r && r.inflow > 0 && r.non > most) {
        most = r.non;
        leakId = n.id;
      }
    }
  return {
    ...base,
    empty: false,
    scale,
    tx,
    ty,
    detail,
    names: scale >= 0.3 && detail === "full",
    windows: scale >= 0.11 && detail === "full",
    nodes: flow.map((n) => {
      const v = visualOf(n.type),
        T = typeOf(n.type);
      return { id: n.id, family: v.family, color: T.color ?? T.cat, name: n.name, ...box(n), wireframe: v.wireframe, price: v.family === "offer" };
    }),
    edges,
    frames: frames.map((f) => ({ x: f.x, y: f.y, w: f.w ?? 400, h: f.h ?? 240, color: String(f.p.color ?? "#10B981") })),
    leakId,
  };
}
