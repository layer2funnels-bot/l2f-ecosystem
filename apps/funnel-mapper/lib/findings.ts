// Findings (V2 §16): one shape for deterministic facts the app already knows: Model checks, the Biggest leak and a
// goal gap. Headline, evidence, impact. Every figure comes from the engine (lib/health, withStepRate); nothing is
// guessed, benchmarked or "recommended", and nothing here is labelled AI.
import { money, nf, people, pct } from "./format";
import { stepRate, withStepRate, type FunnelResult, type GraphLike, type MathSettings } from "./funnel-math";
import type { Goal } from "./graph";
import { healthChecks, performanceChecks, type PerformanceCheck } from "./health";

export interface Finding {
  id: string;
  kind: "check" | "leak" | "goal";
  headline: string;
  evidence?: string;
  impact?: string;
  /** The block it is about (actions: select it, open it). */
  nodeId?: string;
}

export function leakFinding(c: PerformanceCheck, cur: string): Finding {
  return {
    id: c.id,
    kind: "leak",
    nodeId: c.nodeId,
    headline: `${c.text} is the ${c.rank === "largest-loss" ? "largest leak" : "weakest continuing step"}`,
    evidence: `${people(c.lost)} of ${people(c.inflow)} people (${pct(c.dropPct)}) do not continue.`,
    impact: `A 10% relative conversion lift projects +${people(c.customerGain)} customers, ${money(c.revenueGain, cur)} revenue, and ${money(c.profitGain, cur)} profit per month.`,
  };
}

/** A conversion goal on a step that today's rate doesn't reach, with what reaching it would change. */
export function goalGapFinding(goal: Goal, g: GraphLike, s: MathSettings & { currency: string }, R: FunnelResult): Finding | null {
  const n = g.nodes.find((x) => x.id === goal.nodeId);
  if (!n || goal.kind !== "conversion" || !(goal.value > 0)) return null;
  const now = stepRate(n);
  if (now >= goal.value) return null;
  const at = withStepRate(g, s, n.id, goal.value);
  return {
    id: `goal-${goal.id}`,
    kind: "goal",
    nodeId: n.id,
    headline: `${n.name} is ${nf(goal.value - now, 1)} points below its goal`,
    evidence: `Today ${nf(now, 1)}%, goal ${nf(goal.value, 1)}%.`,
    impact: `Reaching it projects ${at.rev - R.rev >= 0 ? "+" : "−"}${money(Math.abs(at.rev - R.rev), s.currency)} revenue and ${at.profit - R.profit >= 0 ? "+" : "−"}${money(Math.abs(at.profit - R.profit), s.currency)} profit per month.`,
  };
}

/** Findings about one block, for the Insights slot at the top of its Analytics tab (empty → the slot is not shown). */
export function blockFindings(nodeId: string, g: GraphLike, s: MathSettings & { currency: string; goals?: Goal[] }, R: FunnelResult): Finding[] {
  const out: Finding[] = healthChecks(g)
    .filter((c) => c.nodeId === nodeId)
    .map((c) => ({ id: c.id, kind: "check" as const, nodeId, headline: c.text }));
  for (const c of performanceChecks(g, s, R)) if (c.nodeId === nodeId) out.push(leakFinding(c, s.currency));
  for (const goal of s.goals ?? []) {
    const f = goal.nodeId === nodeId ? goalGapFinding(goal, g, s, R) : null;
    if (f) out.push(f);
  }
  return out;
}
