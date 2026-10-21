// Which scenario a funnel is currently showing, from its what-if multipliers (no extra state): "Baseline" (the current map), a saved
// scenario's name when the what-if matches one, else "What-if".
import type { FunnelSettings, WhatIf } from "./graph";

const same = (a: WhatIf, b: WhatIf) => a.traffic === b.traffic && a.conv === b.conv && a.price === b.price && a.cost === b.cost;
/** The one baseline: the current map with no what-if (V2 data trust; there is no separate "Expected"). */
export const BASELINE = "Baseline";
export const BASELINE_LONG = "Baseline (current map)";
export const NEUTRAL_WHATIF: WhatIf = { traffic: 1, conv: 1, price: 1, cost: 1 };

export function scenarioLabel(s: Pick<FunnelSettings, "whatif" | "scenarios">): string {
  if (same(s.whatif, NEUTRAL_WHATIF)) return BASELINE;
  return s.scenarios.find((sc) => same(sc.whatif, s.whatif))?.name ?? "What-if";
}
