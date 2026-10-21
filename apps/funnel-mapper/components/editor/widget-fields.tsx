"use client";
// Widget inspector: scope, up to 4 metrics, display, size and the Trend period.
import { isAnnot } from "@/lib/catalog";
import type { FunnelNode } from "@/lib/graph";
import { updateParams, useEditor } from "@/lib/editor/store";
import { MAX_WIDGET_METRICS, WIDGET_METRICS, widgetConfig, widgetMembers, type TrendPeriod, type WidgetDisplay, type WidgetMetric, type WidgetScope, type WidgetSize } from "@/lib/widget-data";
import { Field, Seg } from "./fields";

export function WidgetFields({ n }: { n: FunnelNode }) {
  const c = widgetConfig(n.p);
  const nodes = useEditor((s) => s.nodes);
  const sel = useEditor((s) => s.selNodes);
  const shared = useEditor((s) => s.shared);
  const set = (patch: Record<string, unknown>) => updateParams(n.id, patch);
  const frames = nodes.filter((x) => x.type === "frame");
  const { members, invalid } = widgetMembers(c, nodes);
  const toggle = (m: WidgetMetric) => {
    const has = c.metrics.includes(m);
    if (has && c.metrics.length === 1) return; // at least one
    if (!has && c.metrics.length >= MAX_WIDGET_METRICS) return;
    set({ metrics: has ? c.metrics.filter((x) => x !== m) : [...c.metrics, m] });
  };
  const flowSel = sel.filter((id) => id !== n.id && nodes.some((x) => x.id === id && !isAnnot(x.type)));
  return (
    <>
      <div className="field">
        <span className="lbl">Shows numbers for</span>
        <Seg<WidgetScope>
          label="Widget scope"
          value={c.scope}
          options={[
            ["funnel", "Whole funnel"],
            ["frame", "A frame"],
            ["selection", "Selected steps"],
          ]}
          onChange={(v) => set({ scope: v, ...(v === "frame" && !c.frameId && frames[0] ? { frameId: frames[0].id } : {}) })}
        />
      </div>
      {c.scope === "frame" && (
        <Field label="Frame">
          {(id) => (
            <select id={id} className="input" value={c.frameId ?? ""} onChange={(e) => set({ frameId: e.target.value })}>
              {!frames.length && <option value="">No frames on the map</option>}
              {frames.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name || "Stage"}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      {c.scope === "selection" && (
        <div className="field">
          <span className="help">{invalid ? "None of its steps are left." : `Covers ${members?.length ?? 0} ${members?.length === 1 ? "step" : "steps"}.`}</span>
          <button type="button" className="btn sm" disabled={!flowSel.length} onClick={() => set({ nodeIds: flowSel })} title="Select steps on the map, then use them">
            Use the {flowSel.length || ""} selected {flowSel.length === 1 ? "step" : "steps"}
          </button>
          <span className="help">Shift-click steps on the map first, then press the button.</span>
        </div>
      )}
      {invalid && c.scope === "frame" && <p className="help err">That frame no longer exists. Pick another one.</p>}
      <div className="field">
        <span className="lbl">
          Metrics ({c.metrics.length}/{MAX_WIDGET_METRICS})
        </span>
        <div className="fm-chips" role="group" aria-label="Widget metrics">
          {WIDGET_METRICS.map(([k, l]) => {
            const on = c.metrics.includes(k);
            return (
              <button key={k} type="button" className="chip" aria-pressed={on} disabled={!on && c.metrics.length >= MAX_WIDGET_METRICS} onClick={() => toggle(k)}>
                {l}
              </button>
            );
          })}
        </div>
        {c.metrics.length >= MAX_WIDGET_METRICS && <span className="help">Four is the most a widget can show.</span>}
      </div>
      <div className="field">
        <span className="lbl">Display</span>
        <Seg<WidgetDisplay>
          label="Widget display"
          value={c.display}
          options={[
            ["number", "Number"],
            ["trend", "Number + trend"],
            ["chart", "Chart"],
            ["path", "Path"],
          ]}
          onChange={(v) => set({ display: v })}
        />
      </div>
      <div className="field">
        <span className="lbl">Size</span>
        <Seg<WidgetSize>
          label="Widget size"
          value={c.size}
          options={[
            ["S", "S"],
            ["M", "M"],
            ["L", "L"],
          ]}
          onChange={(v) => set({ wsize: v })}
        />
        <span className="help">S shows one number, M two, L up to four (and the chart).</span>
      </div>
      {c.display === "trend" && (
        <div className="field">
          <span className="lbl">Trend: Actual vs Plan over</span>
          <Seg<TrendPeriod>
            label="Trend period"
            value={c.trend}
            options={[
              ["week", "Week"],
              ["month", "Month"],
              ["quarter", "Quarter"],
              ["range", "Dates"],
            ]}
            onChange={(v) => set({ trend: v })}
          />
          {c.trend === "range" && (
            <div className="row2 mt-2">
              <Field label="From">{(id) => <input id={id} className="input" type="date" value={c.from ?? ""} max={c.to} onChange={(e) => set({ from: e.target.value })} />}</Field>
              <Field label="To">{(id) => <input id={id} className="input" type="date" value={c.to ?? ""} min={c.from} onChange={(e) => set({ to: e.target.value })} />}</Field>
            </div>
          )}
          <span className="help">{shared ? "Actuals are for the funnel owner." : "Compares the Actuals you recorded with this period’s share of the plan. Without Actuals it shows the plan only."}</span>
        </div>
      )}
    </>
  );
}
