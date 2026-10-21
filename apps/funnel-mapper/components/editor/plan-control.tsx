"use client";
// The Plan control (V3 "Plan control and calendar"): one place for scenarios and for real data, side by side.
//   PLAN  Baseline ▾ | Actual
// Replaces the scenario chip, the "vs Baseline" row and the Model / Actual toggle. Baseline (the current map) is always the
// reference and is never edited by accident: when a scenario is active a slim banner says so and goes back in one click.
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { nf } from "@/lib/format";
import { rangeLabel } from "@/lib/range";
import { BASELINE, BASELINE_LONG, NEUTRAL_WHATIF, scenarioLabel } from "@/lib/scenario-label";
import type { WhatIf } from "@/lib/graph";
import { openActualsEntry, setActualView, setCompare, setSettings, useEditor, viewRange } from "@/lib/editor/store";
import { actualsInRange } from "@/lib/actual-result";
import { ensureActuals } from "./assets";

const LEVERS: [keyof WhatIf, string][] = [
  ["traffic", "traffic"],
  ["conv", "conversion"],
  ["price", "price"],
  ["cost", "ad cost"],
];
/** "−20% traffic · −10% conversion": what a scenario changes against Baseline, in words. */
export function summarize(w: WhatIf): string {
  const parts = LEVERS.filter(([k]) => Math.abs((Number(w[k]) || 1) - 1) > 1e-9).map(([k, l]) => {
    const d = ((Number(w[k]) || 1) - 1) * 100;
    return `${d > 0 ? "+" : "−"}${nf(Math.abs(d))}% ${l}`;
  });
  return parts.length ? parts.join(" · ") : "No changes from Baseline";
}
const changeCount = (w: WhatIf) => LEVERS.filter(([k]) => Math.abs((Number(w[k]) || 1) - 1) > 1e-9).length;

export function PlanControl({ showActual, onNewScenario }: { showActual: boolean; onNewScenario: () => void }) {
  const w = useEditor((s) => s.settings.whatif);
  const list = useEditor((s) => s.settings.scenarios);
  const actual = useEditor((s) => s.actualView);
  const compare = useEditor((s) => s.opts.compare);
  const label = scenarioLabel({ whatif: w, scenarios: list });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && (setOpen(false), ref.current?.querySelector<HTMLElement>(".fm-plan-sel")?.focus());
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  const toActual = async () => {
    if (actual) return setActualView(null);
    await ensureActuals();
    const r = viewRange({ range: useEditor.getState().opts.range });
    setActualView({ start: r.start, end: r.end, label: rangeLabel(r) });
  };
  const pick = (whatif: WhatIf) => {
    setSettings({ whatif: { ...whatif } });
    setOpen(false);
  };
  return (
    <div className={`fm-plan${actual ? " is-actual" : ""}`} ref={ref} role="group" aria-label="Plan or actual numbers">
      <span className="fm-plan-k" aria-hidden="true">
        PLAN
      </span>
      <button type="button" className="fm-plan-sel" aria-haspopup="dialog" aria-expanded={open} aria-label={`Plan: ${label}`} title="Choose a scenario" onClick={() => setOpen((o) => !o)}>
        {label}
        <Icon name="chevronDown" size={12} />
      </button>
      {showActual && (
        <button type="button" className="fm-plan-act" aria-pressed={!!actual} onClick={toActual} title="The numbers you entered or imported for these dates">
          Actual
        </button>
      )}
      {open && (
        <div className="fm-plan-pop" role="dialog" aria-label="Plan">
          <div className="fm-plan-h">PLAN</div>
          <div role="radiogroup" aria-label="Scenario">
            <button type="button" role="radio" aria-checked={label === BASELINE} className="fm-plan-opt" onClick={() => pick(NEUTRAL_WHATIF)}>
              <i aria-hidden="true" />
              <span>
                <b>{BASELINE_LONG.replace(" (", " · ").replace(")", "")}</b>
                <small>The map as it is now. Always the reference.</small>
              </span>
            </button>
            {list.map((sc) => (
              <button key={sc.id} type="button" role="radio" aria-checked={label === sc.name} className="fm-plan-opt" onClick={() => pick(sc.whatif)}>
                <i aria-hidden="true" />
                <span>
                  <b>{sc.name}</b>
                  <small>{summarize(sc.whatif)}</small>
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="fm-plan-new"
            onClick={() => {
              setOpen(false);
              onNewScenario();
            }}
          >
            + New scenario from Baseline
          </button>
          <div className="fm-plan-cmp">
            <span>
              <b>Compare with Baseline</b>
              <small>Shows ▲ ▼ changes on blocks and the strip</small>
            </span>
            <button type="button" role="switch" aria-checked={compare} aria-label="Compare with Baseline" className="fm-switch" onClick={() => setCompare(!compare)}>
              <i aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Slim banner under the bar while a scenario other than Baseline is active: Baseline is untouched, one click back. */
export function EditingBanner() {
  const actual = useEditor((s) => s.actualView);
  const w = useEditor((s) => s.settings.whatif);
  const list = useEditor((s) => s.settings.scenarios);
  const label = scenarioLabel({ whatif: w, scenarios: list });
  if (actual) return <ActualBanner />;
  if (label === BASELINE) return null;
  const n = changeCount(w);
  return (
    <div className="fm-banner" role="status">
      <b>Editing {label}</b>
      <span>Baseline is untouched</span>
      {n > 0 && (
        <span className="fm-banner-n">
          {n} {n === 1 ? "CHANGE" : "CHANGES"}
        </span>
      )}
      <span className="flex-1" />
      <button type="button" className="fm-banner-back" onClick={() => setSettings({ whatif: { ...NEUTRAL_WHATIF } })}>
        Back to Baseline
      </button>
    </div>
  );
}

/** Actual mode: what the map is showing, and the two ways to put real numbers in (the block's Actual tab is the third). */
function ActualBanner() {
  const view = useEditor((s) => s.actualView);
  const rows = useEditor((s) => s.actuals);
  const ro = useEditor((s) => s.readOnly);
  if (!view) return null;
  const inRange = actualsInRange(rows ?? [], view.start, view.end);
  const steps = new Set(inRange.map((r) => r.node_id)).size;
  return (
    <div className="fm-banner fm-banner-actual" role="status">
      <span className="fm-banner-tag">ACTUAL</span>
      <span>{steps === 0 ? "No real numbers for these dates yet." : `Real numbers for ${view.label} · ${steps} ${steps === 1 ? "step" : "steps"} entered. A dash means nothing was entered.`}</span>
      <span className="flex-1" />
      {!ro && (
        <>
          <button type="button" className="fm-banner-cta" onClick={() => openActualsEntry("type")}>
            Enter numbers
          </button>
          <button type="button" className="fm-banner-back" onClick={() => openActualsEntry("csv")}>
            Import CSV
          </button>
        </>
      )}
    </div>
  );
}
