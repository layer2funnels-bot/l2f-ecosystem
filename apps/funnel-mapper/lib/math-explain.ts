// Math made plain (V2 F9, display only). Turns the engine's own output into sentences with the arithmetic shown.
// Nothing here calculates a funnel: every number is read from FunnelResult (lib/funnel-math compute()), and the
// ratios shown are the ones the engine already produced, divided back out for the reader.
import { typeOf } from "./catalog";
import { money, nf, pct, people, ratio } from "./format";
import type { FunnelResult } from "./funnel-math";
import type { FunnelGraph, FunnelNode } from "./graph";

export const GLOSSARY: [string, string][] = [
  [
    "Rate",
    "The share of people who arrive at a step and continue to the next one. 40% of 1,000 people = 400 people.",
  ],
  [
    "ROAS",
    "Return on ad spend: revenue ÷ ad spend. 3.0x means every 1 spent on ads brings back 3 in revenue.",
  ],
  [
    "CPA",
    "Cost per acquisition: ad spend ÷ new customers. What one new customer costs in ads.",
  ],
  [
    "EPC",
    "Earnings per click: revenue ÷ everyone who arrived from traffic. What one visitor is worth.",
  ],
  [
    "AOV",
    "Average order value: revenue ÷ new customers, including bumps and upsells they bought.",
  ],
];

export type FigureKey =
  | "rev"
  | "spend"
  | "profit"
  | "roi"
  | "roas"
  | "cpa"
  | "aov"
  | "cpl"
  | "cpc"
  | "epc"
  | "conv"
  | "leadRate"
  | "ltvc";

/** "Revenue ÷ ad spend = $6,032 ÷ $450 = 13.40x": the formula in words, then the same with this map's numbers. */
export function formulaFor(
  key: FigureKey,
  R: FunnelResult,
  cur: string,
  k = 1,
): { words: string; sum: string } | null {
  const m = (v: number) => money(v * k, cur);
  const costs = R.costs;
  switch (key) {
    case "rev":
      return {
        words:
          "Every sale's price × the people who buy it, after refunds, added up",
        sum: `= ${m(R.rev)}`,
      };
    case "spend":
      return {
        words:
          "Every traffic source's visitors × its cost per visitor, added up",
        sum: `= ${m(R.spend)}`,
      };
    case "profit":
      return {
        words: "Revenue − all costs",
        sum: `${m(R.rev)} − ${m(costs)} = ${m(R.profit)}`,
      };
    case "roi":
      return {
        words: "Profit ÷ all costs",
        sum: `${m(R.profit)} ÷ ${m(costs)} = ${pct(R.roi)}`,
      };
    case "roas":
      return {
        words: "Revenue ÷ ad spend",
        sum: `${m(R.rev)} ÷ ${m(R.spend)} = ${ratio(R.roas)}`,
      };
    case "cpa":
      return {
        words: "Ad spend ÷ new customers",
        sum: `${m(R.spend)} ÷ ${people(R.cust * k)} = ${money(R.cpa, cur)}`,
      };
    case "aov":
      return {
        words: "Revenue ÷ new customers",
        sum: `${m(R.rev)} ÷ ${people(R.cust * k)} = ${money(R.aov, cur)}`,
      };
    case "ltvc":
      return {
        words: "Lifetime revenue ÷ new customers",
        sum: `${m(R.ltv)} ÷ ${people(R.cust * k)} = ${money(R.ltvc, cur)}`,
      };
    case "cpl":
      return {
        words: "Ad spend ÷ leads",
        sum: `${m(R.spend)} ÷ ${people(R.leads * k)} = ${money(R.cpl, cur)}`,
      };
    case "cpc":
      return {
        words: "Ad spend ÷ paid visitors",
        sum: `${m(R.spend)} ÷ ${people(R.paidTraffic * k)} = ${money(R.cpc, cur)}`,
      };
    case "epc":
      return {
        words: "Revenue ÷ all visitors",
        sum: `${m(R.rev)} ÷ ${people(R.traffic * k)} = ${money(R.epc, cur)}`,
      };
    case "conv":
      return {
        words: "New customers ÷ visitors",
        sum: `${people(R.cust * k)} ÷ ${people(R.traffic * k)} = ${pct(R.conv)}`,
      };
    case "leadRate":
      return {
        words: "Leads ÷ visitors",
        sum: `${people(R.leads * k)} ÷ ${people(R.traffic * k)} = ${pct(R.leadRate)}`,
      };
  }
}

/** The selected block's numbers as steps in words, each with its arithmetic. */
export function explainBlock(
  n: FunnelNode,
  g: Pick<FunnelGraph, "nodes" | "edges">,
  R: FunnelResult,
  cur: string,
  k = 1,
): string[] {
  const r = R.N[n.id];
  const T = typeOf(n.type);
  if (!r || !T) return [];
  if (T.cat === "annot")
    return ["Notes, text and shapes don’t carry people or money."];
  const out: string[] = [];
  const m = (v: number) => money(v * k, cur);
  const p = (v: number) => people(v * k);
  if (T.cat === "traffic") {
    out.push(`${n.name} sends ${p(r.out)} people into the funnel.`);
    if (r.spend > 0)
      out.push(
        `They cost ${m(r.spend)} in ads: ${m(r.spend)} ÷ ${p(r.out)} = ${money(r.spend / r.out, cur)} per visitor.`,
      );
    else out.push("This source has no ad cost.");
  } else {
    const ins = g.edges.filter(
      (e) => e.to === n.id && (R.flows[e.id] ?? 0) > 0,
    );
    if (!ins.length || !(r.inflow > 0)) {
      out.push(
        "Nobody arrives here yet. Connect a line into this step from one that has people.",
      );
      return out;
    }
    const parts = ins.map(
      (e) =>
        `${p(R.flows[e.id])} from ${g.nodes.find((x) => x.id === e.from)?.name ?? "a step"}`,
    );
    out.push(
      ins.length > 1
        ? `${p(r.inflow)} people arrive: ${parts.join(" + ")}.`
        : `${p(r.inflow)} people arrive from ${g.nodes.find((x) => x.id === ins[0].from)?.name ?? "the step before"}.`,
    );
    const rate = r.out / r.inflow;
    out.push(
      `${p(r.out)} continue: ${nf(rate * 100, 1)}% of ${p(r.inflow)} = ${p(r.out)}.`,
    );
    if (r.non > 0)
      out.push(
        `${p(r.non)} don’t: ${p(r.inflow)} − ${p(r.out)} = ${p(r.non)}.`,
      );
    if (r.rev > 0)
      out.push(
        `Revenue: ${p(r.out)} × ${money(r.rev / r.out, cur)} each = ${m(r.rev)}.`,
      );
    if (r.cost > 0) out.push(`This step costs ${m(r.cost)}.`);
    if (r.cogs > 0) out.push(`Delivery and fees: ${m(r.cogs)}.`);
    if (r.mrr > 0) out.push(`Adds ${m(r.mrr)} of monthly recurring revenue.`);
  }
  const outs = g.edges.filter(
    (e) => e.from === n.id && (R.flows[e.id] ?? 0) > 0,
  );
  for (const e of outs)
    out.push(
      `${p(R.flows[e.id])} go on to ${g.nodes.find((x) => x.id === e.to)?.name ?? "the next step"}${e.port === "alt" ? " (people who didn’t continue)" : ""}.`,
    );
  return out;
}
