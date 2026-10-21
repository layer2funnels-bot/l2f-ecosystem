"use client";
import { EdgeLabelRenderer, type EdgeProps } from "@xyflow/react";
import { memo, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { money, nf, people } from "@/lib/format";
import { blockH, isAnnot, nodeW, picRect } from "@/lib/catalog";
import { num } from "@/lib/funnel-math";
import { dotSeconds, edgeDelta, flowDots } from "@/lib/simulate";
import { edgePath, edgeRate, edgeRevenue, edgeSentence, edgeTag } from "@/lib/editor/labels";
import { selectEdge, shownR, useEditor, viewK } from "@/lib/editor/store";
import { DASH, edgeLook, type EdgeStyle } from "@/lib/style";
import type { Side } from "@/lib/graph";

type Data = { port: "main" | "alt"; fromType?: string; from?: string; to?: string; share: number; s?: EdgeStyle };

export const FlowEdge = memo(function FlowEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, data }: EdgeProps & { data: Data }) {
  const flow0 = useEditor((s) => shownR(s).flows[id] ?? 0);
  const k = useEditor((s) => viewK(s.opts));
  const flow = flow0 * k;
  const simBase = useEditor((s) => s.simBase ?? s.compareBase); // the simulation start, or Baseline while Compare with Baseline is on
  // while simulating, line weight is on one scale for "now" and "before", so a thicker or thinner line is a real change
  const maxF = useEditor((s) => Math.max(1, ...Object.values(s.R.flows), ...(s.simBase ? Object.values(s.simBase.R.flows) : [])));
  // people-flow dots: paused while dragging or panning
  const play = useEditor((s) => s.simPlay && !!s.simBase && !s.dragging);
  const speed = useEditor((s) => s.simSpeed);
  const before = useEditor((s) => s.simBefore);
  // at most 8 dots a line keeps the whole map under ~300 dots; busy maps get 3 a line
  const crowded = useEditor((s) => s.edges.length > 37);
  const calm = useReducedMotion();
  const thick = useEditor((s) => s.opts.thick);
  const view = useEditor((s) => (s.settings.hideNumbers ? "clean" : s.opts.view));
  // the one leak label: the people lost on the dashed line that leaves the biggest-leak step
  const lost = useEditor((s) => (data?.from && data.port === "alt" && s.keyLeak === data.from && view !== "clean" ? (s.R.N[data.from]?.non ?? 0) * viewK(s.opts) : 0));
  const cur = useEditor((s) => s.settings.currency);
  const R = useEditor(shownR);
  const port = data?.port ?? "main";
  const look = edgeLook(data?.s);
  const [d, mx, my] = edgePath(look, port, sourceX, sourceY, targetX, targetY, sourcePosition as Side, targetPosition as Side);
  // a label never sits on a block: it goes at the midpoint, and hides when the line is too short or the midpoint is over a block (the leak label always wins)
  const length = Math.hypot(targetX - sourceX, targetY - sourceY);
  const overBlock = useEditor((s) =>
    s.nodes.some((m) => {
      if (m.type === "frame" || isAnnot(m.type)) return false;
      const r = picRect(m.type);
      // over the picture (with a margin) or over the name under it: a label never sits on either
      const onPic = mx > m.x + r.x - 24 && mx < m.x + r.x + r.w + 24 && my > m.y - 12 && my < m.y + r.y + r.h + 12;
      const onName = mx > m.x - 30 && mx < m.x + nodeW(m.type) + 30 && my > m.y + r.y + r.h - 4 && my < m.y + blockH(m.type) + 12;
      return onPic || onName;
    }),
  );
  // a loop or skip line that runs through other blocks is drawn quietly (faded, no label) until it is hovered or one of its ends is selected
  const pathEl = useRef<SVGPathElement>(null);
  const nodesAll = useEditor((s) => s.nodes);
  const endSelected = useEditor((s) => !!data && (s.selNodes.includes(data.from ?? "") || s.selNodes.includes(data.to ?? "")));
  const [crosses, setCrosses] = useState(false);
  useEffect(() => {
    const el = pathEl.current;
    const len = el?.getTotalLength?.() ?? 0;
    if (!el || !(len > 0)) return;
    const rects = nodesAll
      .filter((m) => m.id !== data?.from && m.id !== data?.to && m.type !== "frame" && !isAnnot(m.type))
      .map((m) => {
        const r = picRect(m.type);
        return { l: m.x + r.x + 6, r: m.x + r.x + r.w - 6, t: m.y + 6, b: m.y + r.y + r.h - 6 };
      });
    let hit = false;
    for (let i = 1; i < 24 && !hit; i++) {
      const pt = el.getPointAtLength((len * i) / 24);
      hit = rects.some((r) => pt.x > r.l && pt.x < r.r && pt.y > r.t && pt.y < r.b);
    }
    setCrosses(hit); // measured from the drawn path
  }, [d, nodesAll, data?.from, data?.to]);
  const quiet = crosses && !selected && !endSelected;
  const wOf = (f: number) => look.width ?? (thick ? 2 + 6 * Math.sqrt(f / maxF) : 2);
  const w = wOf(flow0);
  const ed = simBase && thick && !before ? edgeDelta(id, R, simBase.R) : null;
  const moved = ed && ed.was != null && ed.delta !== 0 ? (ed.delta > 0 ? "up" : "down") : null;
  const tag = edgeTag(data?.fromType, port);
  const share = num(data?.share ?? 100);
  const dots = play && !calm && look.kind !== "nodata" ? flowDots(flow0, maxF, crowded) : 0;
  const dur = dotSeconds(Math.hypot(targetX - sourceX, targetY - sourceY) * 1.15) / speed;
  // zoom levels (V2): far = line thickness only, mid = the number, near = the sentence and every label
  const band = useEditor((s) => (s.view.k < 0.4 ? "far" : s.view.k <= 0.75 ? "mid" : "near"));
  const sentence = data?.from ? edgeSentence(data.from, flow0, R, k) : null;
  const rate = view !== "clean" && data?.from ? edgeRate(data.from, flow0, R) : null;
  const noFlow = view !== "clean" && look.kind !== "nodata" && !(flow0 * k >= 0.5);
  // Clean shows no labels; People and Money show the rate only (people on hover); no flow, no label
  const showLabel = selected || (!quiet && band !== "far" && view !== "clean" && (look.kind === "nodata" || lost > 0 || (rate != null && length >= 44 && !overBlock)));
  const marker = look.arrow !== "none" ? `fm-arrow-${id}` : null;
  const style: React.CSSProperties = { strokeWidth: w, ...(look.opacity != null ? { opacity: look.opacity } : {}), ...(look.color && !selected ? { stroke: look.color } : {}), ...(look.dash ? { strokeDasharray: DASH[look.dash] ?? "none" } : {}) };
  return (
    <>
      {marker && (
        <defs>
          <marker id={marker} viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth={look.arrowSize + w * 1.5} markerHeight={look.arrowSize + w * 1.5} orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" className={`fm-arrowhead${port === "alt" ? " alt" : ""}`} style={look.color ? { fill: look.color } : undefined} />
          </marker>
        </defs>
      )}
      {moved && ed && <path className="fm-edge-ghost" d={d} style={{ strokeWidth: wOf(ed.was!) + 3 }} aria-hidden="true" />}
      <path
        className={`fm-edge${port === "alt" ? " alt" : ""}${selected ? " sel" : ""}${look.kind !== "flow" ? ` ${look.kind}` : ""}${moved ? ` sim-${moved}` : ""}${noFlow ? " noflow" : ""}${quiet ? " quiet" : ""}`}
        d={d}
        ref={pathEl}
        style={style}
        markerEnd={marker ? `url(#${marker})` : undefined}
        markerStart={marker && look.arrow === "both" ? `url(#${marker})` : undefined}
      />
      {dots > 0 && (
        <g className={`fm-flowdots${port === "alt" ? " alt" : ""}`} aria-hidden="true">
          {Array.from({ length: dots }, (_, k) => (
            <circle key={k} r={port === "alt" ? 2.6 : 3}>
              <animateMotion dur={`${dur}s`} begin={`-${((k / dots) * dur).toFixed(3)}s`} repeatCount="indefinite" path={d} />
            </circle>
          ))}
        </g>
      )}
      <path className="react-flow__edge-interaction" d={d} fill="none" strokeOpacity={0} strokeWidth={16} />
      {showLabel && (
      <EdgeLabelRenderer>
        <button
          type="button"
          className={`fm-elabel nodrag nopan${sentence ? " has-sent" : ""}${selected ? " sel" : ""}${look.kind === "nodata" ? " nodata" : ""}${lost > 0 ? " leak" : ""}`}
          data-edge={id}
          style={{ left: mx, top: my }}
          onClick={() => selectEdge(id)}
          title={sentence ? `${sentence} people` : undefined}
          aria-label={look.kind === "nodata" ? "Connection without data" : sentence ? `Connection: ${sentence} people` : `Connection carrying ${people(flow)} people`}
        >
          {tag && <span className={`tag${tag.alt ? " alt" : ""}`}>{tag.text}</span>}
          {look.kind === "skip" && <span className="tag">Skip</span>}
          {look.label && <span className="tag">{look.label}</span>}
          {look.kind === "nodata" ? (
            <span className="n">No data</span>
          ) : lost > 0 && !selected ? (
            <span className="n">−{people(lost)}</span>
          ) : (
            <span className="n">
              <span className="r">{rate ?? people(flow)}</span>
              {sentence && <span className="sent">{sentence}</span>}
              {share !== 100 ? ` · ${nf(share)}%` : ""}
              {moved && ed && (
                <span className={`sd ${moved}`}>
                  {" "}
                  {ed.delta > 0 ? "+" : "−"}
                  {nf(Math.abs(ed.delta) * k)}
                </span>
              )}
            </span>
          )}
          {look.kind !== "nodata" && look.showRev && band === "near" && data?.to && edgeRevenue(data.to, flow0, R) > 0 && <span className="n rev"> · {money(edgeRevenue(data.to, flow0, R) * k, cur)}</span>}
        </button>
      </EdgeLabelRenderer>
      )}
    </>
  );
});

export const edgeTypes = { flow: FlowEdge };
