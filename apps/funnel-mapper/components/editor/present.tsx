"use client";
// Presentation (V2): the funnel one stage at a time. Stages are the map's frames, or Acquire / Convert / Finish
// (lib/present-stages.ts). Stage numbers are the frame totals; click a block for its own numbers. Clean | Numbers
// switches the same layer as the Performance map. Phone: one stage per screen, swipe between stages.
import { useReactFlow } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { typeOf } from "@/lib/catalog";
import { money, nf, pct, ratio } from "@/lib/format";
import { nodeStats, subLabel } from "@/lib/editor/labels";
import { presentStages } from "@/lib/present-stages";
import { clearSelection, setMapView, setSpot, useEditor, viewK } from "@/lib/editor/store";

export function Presenter({ onExit }: { onExit: () => void }) {
  const rf = useReactFlow();
  const nodes = useEditor((s) => s.nodes);
  const R = useEditor((s) => s.R);
  const cur = useEditor((s) => s.settings.currency);
  const basis = useEditor((s) => s.settings.basis);
  const hideNums = useEditor((s) => s.settings.hideNumbers);
  const showNums = useEditor((s) => s.opts.nums);
  const k = useEditor((s) => viewK(s.opts));
  const picked = useEditor((s) => (s.selNodes.length === 1 ? s.nodes.find((n) => n.id === s.selNodes[0]) : undefined));
  const nums = showNums && !hideNums;
  const stages = useMemo(() => presentStages(nodes, R, cur, k), [nodes, R, cur, k]);
  const [i, setI] = useState(-1); // -1 = overview, stages.length = the result
  const at = useRef(-1);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const go = useCallback(
    (k: number) => {
      const j = Math.max(-1, Math.min(stages.length, k));
      at.current = j;
      setI(j);
      clearSelection();
      const st = j >= 0 && j < stages.length ? stages[j] : null;
      useEditor.setState({ stageIds: st ? st.ids : null });
      setSpot(null);
      if (st) rf.fitView({ nodes: st.ids.map((id) => ({ id })), padding: 0.35, duration: 500, maxZoom: 1.3 });
      else rf.fitView({ padding: 0.15, duration: 500, maxZoom: 1.2 });
    },
    [rf, stages],
  );

  useEffect(() => {
    rf.fitView({ padding: 0.15, duration: 400, maxZoom: 1.2 });
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        e.stopPropagation();
        go(at.current + 1);
      }
      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        e.stopPropagation();
        go(at.current - 1);
      }
      if (e.key === "Escape") onExit();
    };
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("keydown", key, true);
      useEditor.setState({ stageIds: null });
      setSpot(null);
    };
  }, [go, onExit, rf]);

  const st = i >= 0 && i < stages.length ? stages[i] : null;
  const done = i >= stages.length;
  const total = stages.length;
  const members = st ? new Set(st.ids) : null;
  const obj = picked && (!members || members.has(picked.id)) ? picked : null;
  const prevName = i - 1 >= 0 && i - 1 < total ? stages[i - 1].name : i === 0 ? "Overview" : i >= total ? stages[total - 1]?.name : "";

  return (
    <div
      className="fm-present-ui"
      role="region"
      aria-label="Presentation"
      aria-live="polite"
      onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        const s = touch.current;
        touch.current = null;
        if (!s) return;
        const dx = e.changedTouches[0].clientX - s.x,
          dy = e.changedTouches[0].clientY - s.y;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(at.current + (dx < 0 ? 1 : -1));
      }}
    >
      <header className="fp-head">
        <div>
          <div className="fp-kicker">{st ? `Stage ${i + 1} of ${total}` : done ? "The result" : "Overview"}</div>
          <h2 className="fp-title">{st ? st.name : done ? (nums ? `${money(R.rev, cur)} revenue · ${money(R.profit, cur)} profit` : "That’s the whole journey") : "The funnel at a glance"}</h2>
          <p className="fp-sub">
            {st
              ? nums
                ? st.totals.text || "No data yet"
                : `${st.ids.length} ${st.ids.length === 1 ? "step" : "steps"}`
              : done
                ? nums
                  ? `${nf(R.traffic)} visitors → ${nf(R.cust, 1)} customers (${pct(R.conv)}) · ROAS ${ratio(R.roas)}`
                  : ""
                : `${total} ${total === 1 ? "stage" : "stages"}: ${stages.map((s) => s.name).join(" → ")}. Use → / ← or swipe.`}
          </p>
        </div>
        {nums && (
          <dl className="fp-stats">
            <div>
              <dt>Customers</dt>
              <dd>{nf(R.cust)}</dd>
            </div>
            <div>
              <dt>Revenue / mo</dt>
              <dd>{money(R.rev, cur)}</dd>
            </div>
          </dl>
        )}
      </header>
      {st && obj && (
        <div className="fp-obj">
          <b>{obj.name}</b> <span className="text-muted">· {typeOf(obj.type).label}</span>
          <div className="text-muted">{subLabel(obj, cur)}</div>
          {nums && <div>{nodeStats(obj, R, cur, k, basis).map((s, k) => (s.b ? <b key={k}>{s.t}</b> : <span key={k}>{s.t}</span>))}</div>}
        </div>
      )}
      <footer className="fp-bar">
        <button type="button" className="btn" onClick={() => go(i - 1)} disabled={i < 0} aria-label="Previous stage" title="Previous stage">
          <Icon name="chevronLeft" size={14} /> <span className="fm-hide-xs">{prevName}</span>
        </button>
        <nav className="fp-progress" aria-label="Presentation stages">
          <ol>
            {stages.map((s, k) => (
              <li key={s.key}>
                <button type="button" aria-current={i === k ? "step" : undefined} className={k < i ? "done" : undefined} onClick={() => go(k)} title={s.name}>
                  <i aria-hidden="true" />
                  <span className="sr-only">{s.name}</span>
                </button>
              </li>
            ))}
          </ol>
          <span className="sr-only" role="status" aria-live="polite">
            {i < 0 ? "Overview" : `Stage ${Math.min(total, i + 1)} of ${total}: ${st?.name ?? ""}`}
          </span>
        </nav>
        {!hideNums && (
          <div className="seg" role="group" aria-label="Map detail">
            <button type="button" aria-pressed={!showNums} onClick={() => setMapView("clean")}>
              Clean
            </button>
            <button type="button" aria-pressed={showNums} onClick={() => setMapView("people")}>
              Numbers
            </button>
          </div>
        )}
        <button type="button" className="btn primary" onClick={() => (done ? onExit() : go(i + 1))} aria-label={done ? "Finish" : "Next stage"} title={done ? "Finish" : "Next stage"}>
          <span className="fm-hide-xs">{done ? "Finish" : i + 1 >= total ? "Finish" : "Next"}</span> <Icon name="chevronRight" size={14} />
        </button>
        <button type="button" className="btn icon ghost" onClick={onExit} aria-label="Exit presentation" title="Exit (Esc)">
          <Icon name="close" size={16} />
        </button>
      </footer>
    </div>
  );
}
