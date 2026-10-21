// Where the page hover preview opens (V2 F1): below the block, then above, then right, then left, choosing the side
// that overlaps the fewest other blocks; never over the hovered block or its ports; if no side fits the screen, a
// compact 240px preview. Pure geometry in screen pixels, so it can be tested without a browser.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export type PeekSide = "below" | "above" | "right" | "left";
export interface PeekPlace extends Rect {
  side: PeekSide | "compact";
}

const overlap = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/**
 * @param block   the hovered block (screen rect)
 * @param others  every other block on screen
 * @param view    the visible area the preview must stay inside
 * @param size    preview size; `gap` keeps it clear of the block's ports (12px circles 7px outside the edge)
 */
export function placePeek(block: Rect, others: Rect[], view: Rect, size = { w: 320, h: 360 }, gap = 18, compact = { w: 240, h: 260 }): PeekPlace {
  const cand = (w: number, h: number): Record<PeekSide, Rect> => ({
    below: { x: block.x + block.w / 2 - w / 2, y: block.y + block.h + gap, w, h },
    above: { x: block.x + block.w / 2 - w / 2, y: block.y - gap - h, w, h },
    right: { x: block.x + block.w + gap, y: block.y + block.h / 2 - h / 2, w, h },
    left: { x: block.x - gap - w, y: block.y + block.h / 2 - h / 2, w, h },
  });
  // keep a centred candidate on screen along its free axis (it may slide, never onto the hovered block)
  const clampAlong = (side: PeekSide, r: Rect): Rect => {
    if (side === "below" || side === "above") return { ...r, x: Math.max(view.x + 8, Math.min(view.x + view.w - r.w - 8, r.x)) };
    return { ...r, y: Math.max(view.y + 8, Math.min(view.y + view.h - r.h - 8, r.y)) };
  };
  const fits = (r: Rect) => r.x >= view.x && r.y >= view.y && r.x + r.w <= view.x + view.w && r.y + r.h <= view.y + view.h;
  const order: PeekSide[] = ["below", "above", "right", "left"];
  for (const [w, h, isCompact] of [
    [size.w, size.h, false],
    [compact.w, compact.h, true],
  ] as const) {
    const c = cand(w, h);
    let best: { side: PeekSide; r: Rect; cost: number } | null = null;
    for (const side of order) {
      const r = clampAlong(side, c[side]);
      if (!fits(r) || overlap(r, { x: block.x - gap + 2, y: block.y - gap + 2, w: block.w + 2 * gap - 4, h: block.h + 2 * gap - 4 }) > 0) continue;
      const cost = others.reduce((a, o) => a + (overlap(r, o) > 0 ? 1 : 0), 0);
      if (!best || cost < best.cost) best = { side, r, cost };
      if (cost === 0) break; // first free side in the preferred order wins
    }
    if (best) return { ...best.r, side: isCompact ? "compact" : best.side };
  }
  // nothing fits: compact, pinned to the visible area's bottom-right corner (still never over the block)
  return { x: view.x + view.w - compact.w - 8, y: view.y + view.h - compact.h - 8, w: compact.w, h: compact.h, side: "compact" };
}
