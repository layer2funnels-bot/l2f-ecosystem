// Connection geometry shared by the canvas, the map export and the live funnel preview. No React Flow import, so
// server components (funnel cards) can use it.
import type { Side } from "./graph";

/** Same bezier as the prototype's curve(): right/bottom port out, left port in. Returns path + label midpoint. */
export function curve(x1: number, y1: number, port: "main" | "alt", x2: number, y2: number): [string, [number, number]] {
  const dx = Math.max(50, Math.abs(x2 - x1) / 2);
  const c1 = port === "alt" ? [x1, y1 + Math.max(60, Math.abs(y2 - y1) / 2)] : [x1 + dx, y1];
  const c2 = [x2 - dx, y2];
  return [`M ${x1} ${y1} C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${x2} ${y2}`, [(x1 + 3 * c1[0] + 3 * c2[0] + x2) / 8, (y1 + 3 * c1[1] + 3 * c2[1] + y2) / 8]];
}

const DIR: Record<Side, [number, number]> = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] };
/** Default sides of a connection (older maps store none): right (or bottom for a "didn't convert" line) into the left. */
export const sidesOf = (e: { port: "main" | "alt"; sh?: Side; th?: Side }): [Side, Side] => [e.sh ?? (e.port === "alt" ? "bottom" : "right"), e.th ?? "left"];

/** A bezier leaving `sp` and entering `tp` (any of the four sides). The classic right→left and bottom→left shapes are kept exactly. */
export function curveSides(x1: number, y1: number, sp: Side, x2: number, y2: number, tp: Side): [string, [number, number]] {
  if (tp === "left" && (sp === "right" || sp === "bottom")) return curve(x1, y1, sp === "bottom" ? "alt" : "main", x2, y2);
  const d = Math.max(50, Math.hypot(x2 - x1, y2 - y1) / 2.5);
  const [ax, ay] = DIR[sp],
    [bx, by] = DIR[tp];
  const c1 = [x1 + ax * d, y1 + ay * d],
    c2 = [x2 + bx * d, y2 + by * d];
  return [`M ${x1} ${y1} C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${x2} ${y2}`, [(x1 + 3 * c1[0] + 3 * c2[0] + x2) / 8, (y1 + 3 * c1[1] + 3 * c2[1] + y2) / 8]];
}

