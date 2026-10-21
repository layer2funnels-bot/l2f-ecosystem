// Funnel health: the same checks as warnings() in lib/funnel-math.ts, but each one knows which block it is about,
// so the inspector can select and zoom to it. The texts are asserted equal to warnings() in tests/unit/health.test.ts.
import { baseOf, typeOf } from "./catalog";
import { leaks, num, stepRate, withStepRate, type FunnelResult, type GraphLike, type MathSettings } from "./funnel-math";
import { waitValid } from "./wait";

export interface HealthCheck {
  id: string;
  text: string;
  /** The block to select and zoom to (absent for funnel-wide checks). */
  nodeId?: string;
}

export interface PerformanceCheck extends HealthCheck {
  /** Deterministic ranking; this is not a threshold-based severity. */
  rank: "largest-loss" | "highest-drop-rate";
  inflow: number;
  lost: number;
  dropPct: number;
  revenueGain: number;
  profitGain: number;
  customerGain: number;
}

export function healthChecks(g: GraphLike): HealthCheck[] {
  const out: HealthCheck[] = [];
  for (const n of g.nodes) {
    const T = typeOf(n.type);
    if (!T || T.cat === "annot") continue;
    const outs = g.edges.filter((e) => e.from === n.id);
    if (T.cat !== "traffic" && !g.edges.some((e) => e.to === n.id)) out.push({ id: `in-${n.id}`, nodeId: n.id, text: `“${n.name}” has no incoming connection, so nobody reaches it.` });
    const [yes, no] = T.ports ?? ["Yes", "No"];
    if (baseOf(n.type) === "cond" && (!outs.some((e) => e.port !== "alt") || !outs.some((e) => e.port === "alt")))
      out.push({ id: `cond-${n.id}`, nodeId: n.id, text: `Condition “${n.name}” is missing its ${!outs.some((e) => e.port !== "alt") ? yes : no} path.` });
    if (baseOf(n.type) === "split" && outs.length < 2) out.push({ id: `split-${n.id}`, nodeId: n.id, text: `Split “${n.name}” needs both a ${yes} and a ${no} path.` });
    if (baseOf(n.type) === "sub" && !num(n.p.life)) out.push({ id: `sub-${n.id}`, nodeId: n.id, text: `Subscription “${n.name}” has 0 months average stay, so lifetime value equals one payment.` });
    if (n.type === "wait" && !waitValid(n.p)) out.push({ id: `wait-${n.id}`, nodeId: n.id, text: `Wait “${n.name}” has no duration.` });
  }
  if (!g.nodes.some((n) => typeOf(n.type)?.cat === "traffic") && g.nodes.length) out.push({ id: "no-traffic", text: "Add a traffic source so numbers can flow." });
  return out;
}

/** Performance findings reuse the engine's leak model and its 10% relative lift projection. */
export function performanceChecks(g: GraphLike, s: MathSettings, R: FunnelResult): PerformanceCheck[] {
  const rows = leaks(g, s, R);
  if (!rows.length) return [];

  const largest = rows[0];
  const weakest = [...rows].sort((a, b) => b.dropPct - a.dropPct || b.lost - a.lost)[0];
  const selected: { row: (typeof rows)[number]; rank: PerformanceCheck["rank"] }[] = [{ row: largest, rank: "largest-loss" }];
  if (weakest.id !== largest.id) selected.push({ row: weakest, rank: "highest-drop-rate" as const });

  return selected.map(({ row, rank }) => {
    const node = g.nodes.find((n) => n.id === row.id)!;
    const improved = withStepRate(g, s, row.id, stepRate(node) * 1.1);
    return {
      id: `${rank}-${row.id}`,
      nodeId: row.id,
      rank,
      inflow: row.inn,
      lost: row.lost,
      dropPct: row.dropPct,
      revenueGain: row.revenueGain,
      profitGain: row.profitGain,
      customerGain: improved.cust - R.cust,
      text: row.name,
    };
  });
}
