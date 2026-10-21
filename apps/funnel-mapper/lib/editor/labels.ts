// Text shown on blocks and edges, ported from the prototype's subLabel() / nodeStats().
// Returns plain segments (bold or not) so React, SVG and PDF exports can all render them.
import { getSmoothStepPath, getStraightPath, Position } from "@xyflow/react";
import { baseOf, INT_LABEL, typeOf, type Interval } from "../catalog";
import { money, moneyPer, nf, people as ppl, peopleExact, perSuffix } from "../format";
import { num, type FunnelResult } from "../funnel-math";
import type { FunnelNode, Side } from "../graph";
import { curveSides } from "../edge-geometry";
export { curve, curveSides, sidesOf } from "../edge-geometry";
import type { edgeLook } from "../style";
import { waitLabel } from "../wait";

export type Seg = { t: string; b?: boolean };

export function subLabel(n: FunnelNode, cur: string): string {
  const T = typeOf(n.type),
    p = n.p;
  const eff = num(p.price) * (1 - num(p.disc) / 100);
  const b = baseOf(n.type),
    [ya, yb] = T.ports ?? ["Yes", "No"];
  if (b === "sub") return `${money(eff, cur)}/${INT_LABEL[p.interval as Interval] || "month"}${num(p.trialDays) ? ` · ${p.trialDays}-day trial` : ""}`;
  if (b === "plan") return `${num(p.pays)} × ${money(eff, cur)}`;
  if (T.cat === "offer") return `${money(eff, cur)}${num(p.disc) ? ` (−${nf(num(p.disc))}%)` : ""}`;
  if (b === "cond") return `${ya} ${nf(num(p.pct), 1)}%`;
  if (b === "split") return `${ya} ${nf(num(p.pct), 1)}% · ${yb} ${nf(100 - num(p.pct), 1)}%`;
  if (n.type === "wait") return waitLabel(p);
  if (T.cat === "traffic") return p.model === "cpc" ? "Cost per click" : p.model === "cpm" ? "Cost per 1,000 views" : T.label;
  return T.label;
}

/**
 * Block stats. `k` scales people and money to another period (Forecast layer: day / week / year). People are whole
 * (V2 data trust; the exact value is in the block's hover and inspector) and money carries its period and basis.
 */
export function nodeStats(n: FunnelNode, R: FunnelResult, cur: string, k = 1, basis?: "first" | "ltv"): Seg[] {
  const T = typeOf(n.type),
    r0 = R.N[n.id];
  if (!r0 || !T) return [];
  const r = k === 1 ? r0 : { ...r0, inflow: r0.inflow * k, out: r0.out * k, non: r0.non * k, rev: r0.rev * k, spend: r0.spend * k };
  if (T.cat === "traffic") return [{ t: ppl(r.out), b: true }, { t: ` visits · ${r.spend ? moneyPer(r.spend, cur, k) : "free"}` }];
  if (T.cat === "offer") return [{ t: ppl(r.out), b: true }, { t: " buy · " }, { t: moneyPer(r.rev, cur, k, basis), b: true }];
  const b = baseOf(n.type);
  if (b === "cond" || b === "split") {
    const [ya, yb] = T.ports ?? ["Yes", "No"];
    return [{ t: `${ya} ` }, { t: ppl(r.out), b: true }, { t: ` · ${yb} ` }, { t: ppl(r.non), b: true }];
  }
  if (b === "goal" || b === "exit") return [{ t: ppl(r.inflow), b: true }, { t: " people" }];
  return [{ t: `In ${ppl(r.inflow)} → ` }, { t: ppl(r.out), b: true }, { t: ` (${nf(num(n.p.cr), 1)}%)` }];
}

const SHORT: Record<Interval, string> = { weekly: "wk", monthly: "mo", quarterly: "qtr", yearly: "yr" };

/** Price tab text for offer blocks: `$37`, `↑ $297`, `↓ $27`, `+ $9`, `$70 / mo`, `3 × $333`. */
export function priceTab(n: FunnelNode, cur: string): string {
  const p = n.p,
    eff = num(p.price) * (1 - num(p.disc) / 100),
    b = baseOf(n.type);
  if (b === "sub") return `${money(eff, cur)} / ${SHORT[p.interval as Interval] ?? "mo"}`;
  if (b === "plan") return `${num(p.pays)} × ${money(eff, cur)}`;
  const lead = n.type === "upsell" || n.type === "oto" ? "↑ " : n.type === "downsell" ? "↓ " : n.type === "bump" ? "+ " : "";
  return lead + money(eff, cur);
}

/** Second line of an offer card (the price lives in the price tab). */
export function offerSubtitle(n: FunnelNode): string {
  const p = n.p,
    parts = [typeOf(n.type).label];
  if (num(p.disc)) parts.push(`−${nf(num(p.disc))}%`);
  if (baseOf(n.type) === "sub" && num(p.trialDays)) parts.push(`${p.trialDays}-day trial`);
  return parts.join(" · ");
}


/** Performance-map reading of a block: one headline number, a short caption and the share who move on. */
export interface PerfLine {
  headline: string;
  caption: string;
  /** Share of arriving people who move on (0–1); null when the block has no such rate (sources, goals, logic). */
  ratio: number | null;
}
export function perfLine(n: FunnelNode, R: FunnelResult, cur: string, k = 1, basis?: "first" | "ltv"): PerfLine | null {
  const T = typeOf(n.type),
    r0 = R.N[n.id];
  // a Wait has nothing to measure: its card keeps "Wait 2 days" as its second line
  if (!r0 || !T || n.type === "wait") return null;
  const inflow = r0.inflow * k,
    out = r0.out * k;
  if (T.cat === "traffic") return { headline: ppl(out), caption: r0.spend ? `visits · ${moneyPer(r0.spend * k, cur, k)}` : "visits · free", ratio: null };
  const b = baseOf(n.type);
  if (b === "goal" || b === "exit") return { headline: ppl(inflow), caption: "people", ratio: null };
  if (b === "cond" || b === "split") return { headline: ppl(inflow), caption: "people in", ratio: null };
  const ratio = inflow > 0 ? Math.min(1, out / inflow) : 0;
  if (T.cat === "offer") return { headline: moneyPer(r0.rev * k, cur, k, basis), caption: `${ppl(out)} buy · ${nf(ratio * 100)}%`, ratio };
  return { headline: ppl(out), caption: `${nf(ratio * 100)}% move on`, ratio };
}

/**
 * Totals shown in a stage frame's label (Performance map) and in Presentation stages, so the two always agree:
 * a frame with traffic sources reads "N visits · spend"; one with offers reads "N customers · revenue";
 * otherwise "N people" (the most people reaching any of its steps).
 */
export interface FrameTotals {
  text: string;
  visits: number;
  spend: number;
  buyers: number;
  revenue: number;
  people: number;
}
export function frameTotals(members: FunnelNode[], R: FunnelResult, cur: string, k = 1): FrameTotals {
  let visits = 0,
    spend = 0,
    buyers = 0,
    revenue = 0,
    people = 0;
  for (const n of members) {
    const r = R.N[n.id],
      T = typeOf(n.type);
    if (!r || !T) continue;
    if (T.cat === "traffic") {
      visits += r.out;
      spend += r.spend;
    }
    if (T.cat === "offer") buyers += r.out;
    revenue += r.rev;
    people = Math.max(people, r.inflow);
  }
  const f = { visits: visits * k, spend: spend * k, buyers: buyers * k, revenue: revenue * k, people: people * k };
  const text = visits > 0 ? `${ppl(f.visits)} visits · ${f.spend ? moneyPer(f.spend, cur, k) : "free"}` : buyers > 0 ? `${ppl(f.buyers)} customers · ${moneyPer(f.revenue, cur, k)}` : members.length ? `${ppl(f.people)} people` : "";
  return { text, ...f };
}

/** Revenue that flows through a connection: the target block's revenue in proportion to the people this line brings. */
export function edgeRevenue(toId: string, flow: number, R: FunnelResult): number {
  const t = R.N[toId];
  return t && t.inflow > 0 && t.rev > 0 ? (t.rev * flow) / t.inflow : 0;
}
/** Share of the people who arrive at the source block that take this connection (0–1), or null without data. */
export function edgeConversion(fromId: string, flow: number, R: FunnelResult): number | null {
  const f = R.N[fromId];
  return f && f.inflow > 0 ? Math.min(1, flow / f.inflow) : null;
}

/**
 * A line's number as a sentence (V2 F9): "59% of 1,500 = 885". The share is of the people who arrive at the source
 * step; traffic sources (nobody arrives, they start the flow) and lines without data give null. Display only.
 */
export function edgeSentence(fromId: string, flow: number, R: FunnelResult, k = 1): string | null {
  const f = R.N[fromId];
  if (!f || !(f.inflow > 0) || !(flow > 0)) return null;
  const pct = Math.min(1, flow / f.inflow) * 100;
  return `${nf(pct, pct < 10 && Math.abs(pct - Math.round(pct)) > 0.05 ? 1 : 0)}% of ${ppl(f.inflow * k)} = ${ppl(flow * k)}`;
}
/** People who stop at a step without a line carrying them on ("615 leave here"), or null when nobody does. */
export function leaveText(n: FunnelNode, R: FunnelResult, hasAltLine: boolean, k = 1): string | null {
  const r = R.N[n.id];
  if (!r || hasAltLine || typeOf(n.type)?.cat === "traffic" || !(r.non * k >= 0.5)) return null;
  return `${ppl(r.non * k)} leave here`;
}

/**
 * The number row of a flow block as the design draws it (V2 "Editor-default"): the left side and, when there is one, the
 * right side ("2,000 visits … $600 / mo", "Yes 29 … No 54", "952 → 381 … 40%"). Same figures as nodeStats, just laid out
 * for the card. Pages and offers have their own object and don't use this.
 */
export function nodeRow(n: FunnelNode, R: FunnelResult, cur: string, k = 1): { l: Seg[]; r?: Seg[] } {
  const T = typeOf(n.type),
    r0 = R.N[n.id];
  if (!r0 || !T) return { l: [] };
  const r = k === 1 ? r0 : { ...r0, inflow: r0.inflow * k, out: r0.out * k, non: r0.non * k, rev: r0.rev * k, spend: r0.spend * k };
  if (T.cat === "traffic") return { l: [{ t: ppl(r.out), b: true }, { t: " visits" }], r: [{ t: r.spend ? moneyPer(r.spend, cur, k) : "free" }] };
  const b = baseOf(n.type);
  if (b === "cond" || b === "split") {
    const [ya, yb] = T.ports ?? ["Yes", "No"];
    return { l: [{ t: `${ya} ` }, { t: ppl(r.out), b: true }], r: [{ t: `${yb} ` }, { t: ppl(r.non), b: true }] };
  }
  if (b === "goal" || b === "exit") return { l: [{ t: ppl(r.inflow), b: true }, { t: " people" }] };
  const rate = r.inflow > 0 ? Math.min(1, r.out / r.inflow) : 0;
  return { l: [{ t: `${ppl(r.inflow)} → ` }, { t: ppl(r.out), b: true }], r: [{ t: `${nf(rate * 100)}%` }] };
}

export const segText = (s: Seg[]) => s.map((x) => x.t).join("");

/** Edge label tag: Yes/No, A/B, or No for a didn't-convert path. */
export function edgeTag(fromType: string | undefined, port: "main" | "alt"): { text: string; alt: boolean } | null {
  const ports = fromType ? typeOf(fromType)?.ports : undefined;
  if (ports) return port === "alt" ? { text: ports[1], alt: true } : { text: ports[0], alt: false };
  if (port === "alt") return { text: "No", alt: true };
  return null;
}

/** Path + label point for the connection's line style (curved is the prototype's own bezier). Shared by the canvas and the map export. */
const POS: Record<Side, Position> = { top: Position.Top, right: Position.Right, bottom: Position.Bottom, left: Position.Left };

export function edgePath(look: Pick<ReturnType<typeof edgeLook>, "path">, port: "main" | "alt", sx: number, sy: number, tx: number, ty: number, sp?: Side, tp?: Side): [string, number, number] {
  const s1 = sp ?? (port === "alt" ? "bottom" : "right"),
    t1 = tp ?? "left";
  if (look.path === "straight") {
    const [d, lx, ly] = getStraightPath({ sourceX: sx, sourceY: sy, targetX: tx, targetY: ty });
    return [d, lx, ly];
  }
  if (look.path === "elbow") {
    const [d, lx, ly] = getSmoothStepPath({ sourceX: sx, sourceY: sy, sourcePosition: POS[s1], targetX: tx, targetY: ty, targetPosition: POS[t1], borderRadius: 10 });
    return [d, lx, ly];
  }
  const [d, [mx, my]] = curveSides(sx, sy, s1, tx, ty, t1);
  return [d, mx, my];
}

/** The one number a block carries (editor-calm brief): its value and what it counts, plus the exact figures for the tooltip. */
export interface BlockChip {
  value: string;
  unit: string;
  title: string;
}
/**
 * People view: people in (visits on a traffic source). Money view: revenue per period on offers and spend per period on sources, nothing on
 * other blocks. Clean view and steps without data have no number. Whole people; the modelled average is only in `title`.
 */
export function blockChip(n: FunnelNode, R: FunnelResult, cur: string, k: number, view: "clean" | "people" | "money", basis?: "first" | "ltv"): BlockChip | null {
  if (view === "clean") return null;
  const T = typeOf(n.type),
    r = R.N[n.id];
  if (!T || !r) return null;
  if (T.cat === "traffic") {
    if (view === "money") return { value: r.spend > 0 ? money(r.spend * k, cur) : "free", unit: r.spend > 0 ? perSuffix(k) : "", title: r.spend > 0 ? `${money(r.spend * k, cur)} spent ${perSuffix(k)} on this source` : "No spend on this source" };
    return { value: ppl(r.out * k), unit: "visits", title: `${peopleExact(r.out * k)} visits` };
  }
  if (!(r.inflow > 0)) return null;
  if (view === "money") {
    if (T.cat !== "offer" || !(r.rev > 0)) return null;
    return { value: money(r.rev * k, cur), unit: `${perSuffix(k)}${basis === "ltv" ? " LTV" : ""}`, title: `${money(r.rev * k, cur)} revenue ${perSuffix(k)}${basis === "ltv" ? " (lifetime value basis)" : ""}` };
  }
  const pageLike = T.cat === "page" || T.cat === "offer";
  return { value: ppl(r.inflow * k), unit: pageLike ? "people in" : "people", title: `${peopleExact(r.inflow * k)} arrive · ${peopleExact(r.out * k)} continue` };
}

/** A line's rate for the label: the share of the people who arrive at its source step that take it ("35%"), or null without data. */
export function edgeRate(fromId: string, flow: number, R: FunnelResult): string | null {
  const c = edgeConversion(fromId, flow, R);
  if (c == null || !(flow > 0)) return null;
  const pct = c * 100;
  return `${nf(pct, pct < 10 && Math.abs(pct - Math.round(pct)) > 0.05 ? 1 : 0)}%`;
}
