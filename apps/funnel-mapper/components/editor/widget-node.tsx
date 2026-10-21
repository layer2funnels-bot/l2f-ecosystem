"use client";
// Widget: live numbers on the map (see lib/widget-data.ts). Reads engine results only. On a phone it shows as an S chip.
import { memo, useEffect, useMemo, useState } from "react";
import type { NodeProps } from "@xyflow/react";
import { WIDGET_SIZES } from "@/lib/catalog";
import { money, nf, pct, people } from "@/lib/format";
import { useEditor } from "@/lib/editor/store";
import { chartSeries, conversionPath, formatMetricValue, mrrDetail, trendRange, trendValues, widgetConfig, widgetMembers, widgetValues } from "@/lib/widget-data";
import { ensureActuals } from "./assets";

type P = NodeProps & { data: { id: string } };

const formatMetric = formatMetricValue;

function Spark({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null;
  const lo = Math.min(0, ...values),
    hi = Math.max(...values, lo + 1e-9);
  const W = 300,
    H = 70,
    x = (i: number) => (i / (values.length - 1)) * W,
    y = (v: number) => H - 4 - ((v - lo) / (hi - lo)) * (H - 8);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join("");
  return (
    <svg className="wg-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${label}, next ${values.length} months`}>
      <path d={`${d}L${W} ${H}L0 ${H}Z`} className="area" />
      <path d={d} className="line" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export const WidgetNode = memo(function WidgetNode({ id, selected }: P) {
  return <WidgetCard id={id} selected={selected} />;
});

/** The widget itself: used on the map and as a card in Reports. */
export function WidgetCard({ id, selected = false, fluid = false }: { id: string; selected?: boolean; fluid?: boolean }) {
  const n = useEditor((s) => s.nodes.find((x) => x.id === id));
  const nodes = useEditor((s) => s.nodes);
  const R = useEditor((s) => s.R);
  const settings = useEditor((s) => s.settings);
  const actuals = useEditor((s) => s.actuals);
  const shared = useEditor((s) => s.shared);
  const cfg = useMemo(() => widgetConfig(n?.p ?? {}), [n?.p]);
  useEffect(() => {
    if (cfg.display === "trend" && !shared) ensureActuals();
  }, [cfg.display, shared]);
  const values = useMemo(() => widgetValues(cfg, nodes, R, settings.goals), [cfg, nodes, R, settings.goals]);
  const { members, invalid } = useMemo(() => widgetMembers(cfg, nodes), [cfg, nodes]);
  if (!n || settings.hideNumbers) return null;
  const cur = settings.currency;
  const dims = WIDGET_SIZES[cfg.size];
  const frame = cfg.scope === "frame" ? nodes.find((x) => x.id === cfg.frameId) : undefined;
  const scopeLabel = cfg.scope === "funnel" ? "Whole funnel" : cfg.scope === "frame" ? (frame?.name ?? "Frame missing") : `${members?.length ?? 0} selected steps`;
  const shown = cfg.size === "S" ? values.slice(0, 1) : cfg.size === "M" ? values.slice(0, 2) : values;
  const trend = cfg.display === "trend" ? trendValues(cfg, nodes, R, shown, (actuals ?? []) as never) : [];
  const tr = trendRange(cfg);
  const mrr = shown.find((v) => v.metric === "mrr");
  const detail = mrr && cfg.size !== "S" ? mrrDetail({ nodes, edges: useEditor.getState().edges }, settings, R, members) : null;
  const chartMetric = shown.find((v) => ["revenue", "profit", "leads", "customers", "mrr"].includes(v.metric));
  const path = cfg.display === "path" && !invalid ? conversionPath(nodes, useEditor.getState().edges, R, members, cfg.size === "S" ? 3 : cfg.size === "M" ? 4 : 6) : [];
  const series = cfg.display === "chart" && chartMetric ? chartSeries(chartMetric.metric, { nodes, edges: useEditor.getState().edges }, settings, R, chartMetric.value) : [];
  return (
    <div className={`fm-widget w-${cfg.size}${selected ? " sel" : ""}${invalid ? " invalid" : ""}`} style={fluid ? { width: "100%" } : { width: dims.w, minHeight: dims.h }} role="group" aria-label={`Widget: ${scopeLabel}`}>
      <div className="wg-scope">{scopeLabel}</div>
      {cfg.display === "path" && !invalid ? (
        path.length > 1 ? (
          <ol className="wg-path" aria-label="Conversion along the main path">
            {path.map((st, i) => (
              <li key={st.id}>
                <span className="pn">{st.name}</span>
                <b>{i === 0 ? `${nf(st.out)} in` : Number.isFinite(st.rate) ? pct(st.rate) : "—"}</b>
              </li>
            ))}
          </ol>
        ) : (
          <p className="wg-empty">Connect a source to a step to see the path.</p>
        )
      ) : invalid ? (
        <p className="wg-empty">{cfg.scope === "frame" ? "The frame was removed. Pick another scope in the panel." : "None of its steps are left."}</p>
      ) : (
        <div className="wg-vals">
          {shown.map((v, i) => {
            const t = trend[i];
            const delta = t && t.actual != null && t.plan ? t.actual / t.plan - 1 : null;
            return (
              <div className="wm" key={v.metric}>
                <span className="ml">
                  {v.label}
                  {["revenue", "profit", "mrr", "leads", "customers"].includes(v.metric) ? " / mo" : ""}
                  {settings.basis === "ltv" && ["revenue", "profit", "roas"].includes(v.metric) && <span className="fm-ltv"> LTV</span>}
                </span>
                <b className={Number.isFinite(v.value) && v.value < 0 && v.kind === "money" ? "neg" : undefined}>{formatMetric(v, cur)}</b>
                {cfg.display === "trend" && t && (
                  <small className="wt">
                    {t.actual == null ? (
                      <>Plan for {tr.days} days · no actuals yet</>
                    ) : (
                      <>
                        Actual {formatMetric({ ...v, value: t.actual }, cur)} vs plan {formatMetric({ ...v, value: t.plan }, cur)}
                        {delta != null && <span className={delta >= 0 ? "pos" : "neg"}> {delta >= 0 ? "+" : "−"}{nf(Math.abs(delta) * 100, 1)}%</span>}
                      </>
                    )}
                  </small>
                )}
                {v.note && cfg.display !== "trend" && <small>{v.note}</small>}
              </div>
            );
          })}
        </div>
      )}
      {detail && (
        <div className="wg-mrr">
          <span>Month 12 {Number.isFinite(detail.month12) ? money(detail.month12, cur) : "—"}</span>
          <span>{people(detail.subscribers)} subscribers</span>
        </div>
      )}
      {series.length > 1 && cfg.size !== "S" && <Spark values={series} label={chartMetric!.label} />}
      {cfg.display === "chart" && cfg.size !== "S" && !series.length && !invalid && <p className="wg-empty">Charts are available for revenue, profit, leads, customers and MRR.</p>}
    </div>
  );
}

/** Shared view on a phone: the map's widgets as one full-width column (they leave the canvas, where they would be tiny chips). */
export function SharedWidgets() {
  const ids = useEditor((s) => s.nodes.filter((n) => n.type === "widget").map((n) => n.id).join(","));
  const hide = useEditor((s) => s.settings.hideNumbers);
  const [open, setOpen] = useState(false);
  const list = ids ? ids.split(",") : [];
  if (!list.length || hide) return null;
  return (
    <section className="fm-shared-wg" aria-label="Widgets">
      {open && (
        <div className="stack" id="fm-shared-wg-stack">
          {list.map((id) => (
            <WidgetCard key={id} id={id} fluid />
          ))}
        </div>
      )}
      <button type="button" aria-expanded={open} aria-controls="fm-shared-wg-stack" onClick={() => setOpen((v) => !v)}>
        Widgets · {list.length}
      </button>
    </section>
  );
}
