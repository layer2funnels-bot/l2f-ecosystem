"use client";
// Wait / Delay editor: duration + unit (Min / Hrs / Days / Wks) with a live preview of the canvas label.
// Math-neutral: the funnel maths never reads the duration. States: default, focus, saved, invalid (0 or blank).
import { useEffect, useState } from "react";
import type { FunnelNode } from "@/lib/graph";
import { updateParams, useEditor } from "@/lib/editor/store";
import { waitLabel, waitOf, waitPatch, WAIT_UNITS, type WaitUnit } from "@/lib/wait";
import { Seg } from "./fields";

export function WaitField({ n }: { n: FunnelNode }) {
  const ro = useEditor((s) => s.readOnly);
  const { n: dur, unit } = waitOf(n.p);
  const [draft, setDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 1400);
    return () => clearTimeout(t);
  }, [saved]);
  const text = draft ?? (Number.isFinite(dur) ? String(dur) : "");
  const invalid = !(Number.isFinite(dur) && dur > 0);
  const commit = (raw: string, u: WaitUnit) => {
    const v = raw.trim() === "" ? NaN : parseFloat(raw);
    updateParams(n.id, waitPatch(v, u));
    setSaved(true);
  };
  return (
    <div className="field fm-wait">
      <label htmlFor={`wait-${n.id}`}>Wait for</label>
      <div className="wait-row">
        <input
          id={`wait-${n.id}`}
          className="input"
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          disabled={ro}
          aria-invalid={invalid}
          aria-describedby={`wait-help-${n.id}`}
          value={text}
          placeholder="0"
          onFocus={() => setDraft(text)}
          onBlur={() => setDraft(null)}
          onChange={(e) => {
            setDraft(e.target.value);
            commit(e.target.value, unit);
          }}
        />
        <Seg<WaitUnit> label="Unit" value={unit} options={WAIT_UNITS.map(([k, l]) => [k, l] as [WaitUnit, string])} onChange={(u) => commit(text, u)} />
      </div>
      <div className="wait-preview" aria-live="polite">
        <span>Shows on the canvas as</span> <b>{waitLabel(n.p)}</b>
        {saved && <em> · Saved</em>}
      </div>
      <span id={`wait-help-${n.id}`} className={invalid ? "help err" : "help"}>
        {invalid ? "Enter a duration above 0. The step stays in the funnel either way." : "A pause between steps. Everyone who arrives leaves, so no totals change."}
      </span>
    </div>
  );
}
