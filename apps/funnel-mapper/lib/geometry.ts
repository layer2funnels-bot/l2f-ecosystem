// Canvas geometry that doesn't need the editor store: which steps sit inside a frame.
import { isAnnot, nodeW, blockPivot } from "./catalog";
import type { FunnelNode } from "./graph";

/** Steps whose centre sits inside the frame (they move with it; stage totals and frame widgets read them). */
export function frameMembersOf(frame: FunnelNode, nodes: FunnelNode[]): FunnelNode[] {
  if (frame.type !== "frame") return [];
  return nodes.filter((m) => {
    if (m.type === "frame" || isAnnot(m.type)) return false;
    const cx = m.x + nodeW(m.type) / 2,
      cy = m.y + blockPivot(m.type);
    return cx > frame.x && cx < frame.x + (frame.w ?? 0) && cy > frame.y && cy < frame.y + (frame.h ?? 0);
  });
}
