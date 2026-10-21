// Simulate: compares two runs of the one engine (lib/funnel-math.ts) — the baseline taken when simulating started and the
// live map — so the canvas can show what an assumption change did. Nothing here calculates funnel numbers: every figure is a
// field of a FunnelResult, and the only arithmetic is a difference between two of them.
import { baseOf, typeOf } from "./catalog";
import type { FunnelResult } from "./funnel-math";
import type { FunnelEdge, FunnelNode, FunnelSettings } from "./graph";

/** A run is "unchanged" when the difference is below float noise relative to the size of the number. */
export function same(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Object.is(a, b) || (Number.isNaN(a) && Number.isNaN(b));
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

/* ---------------- baseline ---------------- */
export interface SimBase {
  R: FunnelResult;
  nodes: FunnelNode[];
  edges: FunnelEdge[];
  settings: FunnelSettings;
  /** When the baseline was taken (ms). */
  at: number;
  /** The view before simulating (restored on leaving). */
  prev?: { view: "clean" | "people" | "money"; nums: boolean; thick: boolean; period: "day" | "week" | "month" | "year" };
  /** What the map is compared with: the baseline (current map), or a saved scenario's id. */
  vs?: string | null;
}

/* ---------------- per step ---------------- */
export interface StepNumbers {
  inflow: number;
  out: number;
  /** People who reach the step and don't move on. */
  lost: number;
  rev: number;
  /** Share of arrivals who move on (0–1); null for sources and goals. */
  ratio: number | null;
}
export interface StepDelta {
  now: StepNumbers;
  /** null when the step didn't exist at the baseline (added since). */
  was: StepNumbers | null;
  dInflow: number;
  dOut: number;
  dLost: number;
  dRev: number;
  dRatio: number;
  changed: boolean;
}

function numbers(n: FunnelNode, R: FunnelResult): StepNumbers | null {
  const r = R.N[n.id],
    T = typeOf(n.type);
  if (!r || !T || T.cat === "annot") return null;
  const flowStep = T.cat === "page" || T.cat === "action" || T.cat === "offer";
  return { inflow: r.inflow, out: r.out, lost: r.non, rev: r.rev, ratio: flowStep && r.inflow > 0 ? Math.min(1, r.out / r.inflow) : null };
}

/** How one step moved between the baseline and now. null for annotations. */
export function stepDelta(n: FunnelNode, R: FunnelResult, B: FunnelResult): StepDelta | null {
  const now = numbers(n, R);
  if (!now) return null;
  const was = numbers(n, B);
  const d = (a: number, b: number | undefined) => (b == null ? 0 : a - b);
  const dInflow = d(now.inflow, was?.inflow),
    dOut = d(now.out, was?.out),
    dLost = d(now.lost, was?.lost),
    dRev = d(now.rev, was?.rev),
    dRatio = now.ratio != null && was?.ratio != null ? now.ratio - was.ratio : 0;
  const changed = !!was && !(same(dInflow, 0) && same(dOut, 0) && same(dLost, 0) && same(dRev, 0) && same(dRatio, 0));
  return { now, was, dInflow, dOut, dLost, dRev, dRatio, changed };
}

/* ---------------- per connection ---------------- */
export interface EdgeDelta {
  flow: number;
  was: number | null;
  delta: number;
}
export function edgeDelta(id: string, R: FunnelResult, B: FunnelResult): EdgeDelta {
  const flow = R.flows[id] ?? 0,
    was = id in B.flows ? B.flows[id] : null;
  return { flow, was, delta: was == null ? 0 : same(flow, was) ? 0 : flow - was };
}

/* ---------------- headline totals ---------------- */
export type Tone = "good" | "bad" | "neutral" | "same";
export interface TotalDelta {
  key: "traffic" | "leads" | "cust" | "rev" | "spend" | "profit" | "roas" | "cpa";
  label: string;
  value: number;
  was: number;
  delta: number;
  /** Relative change (0.2 = +20%); null when the baseline is zero or not a number. */
  pct: number | null;
  tone: Tone;
}
/** Which way is better. "neutral" numbers (ad spend) are shown without good / bad colour. */
const TOTALS: { key: TotalDelta["key"]; label: string; better: "up" | "down" | "neutral" }[] = [
  { key: "traffic", label: "Traffic", better: "up" },
  { key: "leads", label: "Leads", better: "up" },
  { key: "cust", label: "Customers", better: "up" },
  { key: "rev", label: "Revenue", better: "up" },
  { key: "spend", label: "Ad spend", better: "neutral" },
  { key: "profit", label: "Profit", better: "up" },
  { key: "roas", label: "ROAS", better: "up" },
  { key: "cpa", label: "CPA", better: "down" },
];

export function totalsDelta(R: FunnelResult, B: FunnelResult): TotalDelta[] {
  return TOTALS.map(({ key, label, better }) => {
    const value = R[key],
      was = B[key];
    const bothFinite = Number.isFinite(value) && Number.isFinite(was);
    const delta = bothFinite && !same(value, was) ? value - was : 0;
    const tone: Tone = !delta ? "same" : better === "neutral" ? "neutral" : (delta > 0) === (better === "up") ? "good" : "bad";
    return { key, label, value, was, delta, pct: bothFinite && was !== 0 && delta !== 0 ? delta / Math.abs(was) : null, tone };
  });
}

/** True when any headline number differs from the baseline. */
export const anyChange = (R: FunnelResult, B: FunnelResult) => totalsDelta(R, B).some((t) => t.delta !== 0);

/* ---------------- where it shows up ---------------- */
export interface Mover {
  id: string;
  name: string;
  label: string;
  d: StepDelta;
}
/** Steps whose people moved the most, biggest first (flow steps only). */
export function topMovers(nodes: FunnelNode[], R: FunnelResult, B: FunnelResult, limit = 5): Mover[] {
  const out: Mover[] = [];
  for (const n of nodes) {
    const T = typeOf(n.type);
    if (!T || T.cat === "annot" || T.cat === "traffic") continue;
    const d = stepDelta(n, R, B);
    if (d?.changed) out.push({ id: n.id, name: n.name, label: T.label, d });
  }
  return out.sort((a, b) => Math.abs(b.d.dInflow) + Math.abs(b.d.dRev) / 100 - (Math.abs(a.d.dInflow) + Math.abs(a.d.dRev) / 100)).slice(0, limit);
}

/* ---------------- what the user changed ---------------- */
export interface AssumptionChange {
  id: string;
  name: string;
  key: string;
  label: string;
  was: number;
  now: number;
}
export interface Knob {
  key: string;
  label: string;
  unit: "%" | "cur" | "n";
  max?: number;
}

/** The assumptions of a block worth trying "what if" on. The same params the inspector edits; nothing new is stored. */
export function knobsOf(n: FunnelNode): Knob[] {
  const T = typeOf(n.type);
  if (!T) return [];
  const b = baseOf(n.type);
  if (T.cat === "traffic") {
    const m = n.p.model;
    if (m === "cpc")
      return [
        { key: "clicks", label: "Clicks", unit: "n" },
        { key: "cpc", label: "Cost per click", unit: "cur" },
      ];
    if (m === "cpm")
      return [
        { key: "impr", label: "Impressions", unit: "n" },
        { key: "cpm", label: "CPM", unit: "cur" },
        { key: "ctr", label: "Click-through rate", unit: "%", max: 100 },
      ];
    return [
      { key: "visitors", label: "Visitors", unit: "n" },
      { key: "spend", label: "Spend", unit: "cur" },
    ];
  }
  if (b === "cond" || b === "split") return [{ key: "pct", label: `${T.ports?.[0] ?? "Yes"} share`, unit: "%", max: 100 }];
  if (n.type === "wait") return [];
  if (T.cat === "page") return [{ key: "cr", label: "Conversion rate", unit: "%", max: 100 }];
  if (T.cat === "action")
    return [
      { key: "cr", label: T.crl ?? "Conversion rate", unit: "%", max: 100 },
      { key: "costPer", label: "Cost per person", unit: "cur" },
    ];
  if (T.cat === "offer")
    return [
      { key: "cr", label: "Buy rate", unit: "%", max: 100 },
      { key: "price", label: "Price", unit: "cur" },
      { key: "disc", label: "Discount", unit: "%", max: 100 },
      { key: "refund", label: "Refund rate", unit: "%", max: 100 },
    ];
  return [];
}

const val = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

/** Every block assumption that now differs from the baseline, so the user can see (and undo) what they changed. */
export function assumptionChanges(now: FunnelNode[], base: FunnelNode[]): AssumptionChange[] {
  const was = new Map(base.map((n) => [n.id, n]));
  const out: AssumptionChange[] = [];
  for (const n of now) {
    const b = was.get(n.id);
    if (!b) continue;
    for (const k of knobsOf(n)) {
      const a = val(b.p[k.key]),
        c = val(n.p[k.key]);
      if (!same(a, c)) out.push({ id: n.id, name: n.name, key: k.key, label: k.label, was: a, now: c });
    }
  }
  return out;
}

/* ---------------- people flow (animation parameters) ---------------- */
// The animation is drawn from the engine's numbers and nothing else: how many dots travel along a connection and how fast.
// Dots are evenly staggered (no randomness), so the same numbers always look the same.

/** Dots on a connection: none without people, otherwise 1 to 8 growing with the square root of its share of the busiest line. */
export function flowDots(flow: number, maxFlow: number, crowded = false): number {
  if (!(flow > 0) || !(maxFlow > 0)) return 0;
  const cap = crowded ? 3 : 8;
  return Math.max(1, Math.min(cap, Math.round(1 + (cap - 1) * Math.sqrt(Math.min(1, flow / maxFlow)))));
}

/** Seconds for a dot to cross a connection of about `length` px at a steady walking pace. */
export function dotSeconds(length: number): number {
  return Math.max(0.9, Math.min(6, length / 150));
}

/** Dots falling away from a step that loses people nowhere: 0 to 3 by the share lost. */
export function lostDots(lost: number, inflow: number): number {
  if (!(lost > 0) || !(inflow > 0)) return 0;
  const f = lost / inflow;
  return f > 0.66 ? 3 : f > 0.33 ? 2 : 1;
}
