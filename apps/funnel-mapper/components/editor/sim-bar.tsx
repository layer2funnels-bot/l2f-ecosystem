"use client";
// Simulation overlays on the canvas. The toolbar row that used to sit here (scenario, vs, period, playback, walk-through, reset)
// is gone (editor-calm brief): one top bar, playback and walk-through live in the Simulate panel, the scenario in the Plan control.
// What stays: the "issues may affect these numbers" note, the empty state, the walk-through caption and the keep-or-discard question.
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { nf, people } from "@/lib/format";
import { healthChecks } from "@/lib/health";
import { discardSim, keepSimAsScenario, setSideTab, setSimPlay, setSimWalk, stopSim, useEditor } from "@/lib/editor/store";
import { typeOf } from "@/lib/catalog";

const LEVER_LABELS: [string, string][] = [
  ["traffic", "Traffic"],
  ["conv", "Conversion"],
  ["price", "Price"],
  ["cost", "Ad cost"],
];

export function SimBar({ onOpenChecks }: { onOpenChecks: () => void }) {
  const base = useEditor((s) => s.simBase);
  const settings = useEditor((s) => s.settings);
  const nodes = useEditor((s) => s.nodes);
  const edges = useEditor((s) => s.edges);
  const R = useEditor((s) => s.R);
  const walk = useEditor((s) => s.simWalk);
  const ask = useEditor((s) => s.simAsk);
  const [name, setName] = useState("");
  // pause the people-flow while the tab is hidden
  useEffect(() => {
    const vis = () => document.hidden && setSimPlay(false);
    document.addEventListener("visibilitychange", vis);
    return () => document.removeEventListener("visibilitychange", vis);
  }, []);
  if (!base) return null;
  const w = settings.whatif as unknown as Record<string, number>;
  const wb = base.settings.whatif as unknown as Record<string, number>;
  const leverChanges = LEVER_LABELS.filter(([k]) => Math.abs((Number(w[k]) || 1) - (Number(wb[k]) || 1)) > 1e-9).map(([k, l]) => {
    const d = ((Number(w[k]) || 1) / (Number(wb[k]) || 1) - 1) * 100;
    return `${l} ${d >= 0 ? "+" : "−"}${nf(Math.abs(d))}%`;
  });
  const checks = healthChecks({ nodes, edges });
  const noTraffic = !nodes.some((n) => typeOf(n.type)?.cat === "traffic");
  const order = R.order.filter((id) => nodes.some((n) => n.id === id && typeOf(n.type)?.cat !== "annot"));
  const step = walk != null ? nodes.find((n) => n.id === order[walk]) : undefined;
  const r = step ? R.N[step.id] : undefined;
  return (
    <>
      {checks.length > 0 && (
        <div className="fm-simwarn" role="status">
          <Icon name="alert" size={14} /> {checks.length} {checks.length === 1 ? "issue" : "issues"} may affect these numbers ·{" "}
          <button type="button" className="link" onClick={onOpenChecks}>
            View
          </button>
        </div>
      )}
      {noTraffic && (
        <div className="fm-simempty" role="status">
          <p>Add a traffic source to simulate.</p>
          <button type="button" className="btn primary" onClick={() => setSideTab("library")}>
            Add source
          </button>
        </div>
      )}
      {step && r && (
        <div className="fm-walkcap" role="status" aria-live="polite">
          <b>{step.name}</b> · {people(typeOf(step.type)?.cat === "traffic" ? r.out : r.inflow)} arrive · {people(r.out)} continue{r.inflow > 0 && typeOf(step.type)?.cat !== "traffic" ? ` · ${nf((r.non / r.inflow) * 100)}% leave` : ""}
          <span className="fm-walknav">
            <button type="button" className="btn icon sm" aria-label="Previous step" disabled={walk === 0} onClick={() => setSimWalk((walk ?? 0) - 1)}>
              <Icon name="chevronLeft" size={14} />
            </button>
            {walk! + 1} / {order.length}
            <button type="button" className="btn icon sm" aria-label="Next step" disabled={walk === order.length - 1} onClick={() => setSimWalk((walk ?? 0) + 1)}>
              <Icon name="chevronRight" size={14} />
            </button>
          </span>
        </div>
      )}
      {ask && <LeaveDialog name={name} setName={setName} suggestion={leverChanges.join(", ")} />}
    </>
  );
}

function LeaveDialog({ name, setName, suggestion }: { name: string; setName: (v: string) => void; suggestion: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  const cancel = () => useEditor.setState({ simAsk: false });
  return (
    <dialog ref={ref} className="modal fm-confirm" aria-labelledby="sim-leave-t" onCancel={(e) => (e.preventDefault(), cancel())}>
      <h3 id="sim-leave-t">Keep these changes?</h3>
      <p className="text-sm">You changed the what-if while simulating. Keep it as a scenario to compare later, or discard it and go back to the baseline.</p>
      <label className="field mt-3">
        <span className="lbl">Scenario name</span>
        <input className="input" value={name} placeholder={suggestion || "Simulation"} onChange={(e) => setName(e.target.value)} autoFocus />
      </label>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" className="btn" onClick={cancel}>
          Keep simulating
        </button>
        <button type="button" className="btn" onClick={discardSim}>
          Discard
        </button>
        <button type="button" className="btn primary" onClick={() => keepSimAsScenario(name || suggestion)}>
          Keep as a scenario
        </button>
      </div>
    </dialog>
  );
}

export { stopSim };
