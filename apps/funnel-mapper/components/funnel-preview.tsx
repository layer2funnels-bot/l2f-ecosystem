// Live funnel preview (V2 F2): an SVG drawn from the funnel's saved canvas by ONE renderer (lib/funnel-preview.ts).
// Server-renderable (no hooks), themed through CSS variables, so Dark and Light both work. Stores no image.
import { CATCOLOR, type ColorKey } from "@/lib/catalog";
import { previewModel, type PreviewNode } from "@/lib/funnel-preview";

const r2 = (v: number) => Math.round(v * 100) / 100;

function Mini({ n, windows, names, shapes }: { n: PreviewNode; windows: boolean; names: boolean; shapes: boolean }) {
  const c = CATCOLOR[n.color as ColorKey] ?? "var(--muted)";
  const page = n.family === "page" || n.family === "offer";
  const cx = n.w / 2,
    cy = n.h / 2;
  const name = n.name.length > 18 ? `${n.name.slice(0, 17)}…` : n.name;
  // the picture or shape of the block (V4): a page is a light card with the family bar, the rest are shapes
  const body = page ? (
    shapes || !windows ? (
      <rect width={n.w} height={n.h} rx={12} style={{ fill: c, opacity: 0.9 }} />
    ) : (
      <>
        <rect width={n.w} height={n.h} rx={12} style={{ fill: "#f4f6fa", stroke: "var(--line)", strokeWidth: 2 }} />
        <rect x={10} y={14} width={n.w - 20} height={7} rx={3} style={{ fill: "#334155" }} />
        <rect x={16} y={26} width={n.w - 32} height={5} rx={2.5} style={{ fill: "#aeb7c6" }} />
        <rect x={10} y={44} width={n.w - 20} height={16} rx={4} style={{ fill: "#fff", stroke: "#cbd5e1", strokeWidth: 1.5 }} />
        <rect x={10} y={66} width={n.w - 20} height={16} rx={4} style={{ fill: "#fff", stroke: "#cbd5e1", strokeWidth: 1.5 }} />
        <rect x={10} y={88} width={n.w - 20} height={16} rx={4} style={{ fill: c }} />
        <path d={`M0 ${n.h - 4}h${n.w}v4a12 12 0 0 1-12 0h-${n.w - 24}a12 12 0 0 1-12 0z`} style={{ fill: c }} />
        <rect x={0} y={n.h - 5} width={n.w} height={5} style={{ fill: c }} />
        {n.price && <rect x={8} y={n.h - 28} width={50} height={16} rx={5} style={{ fill: c }} />}
      </>
    )
  ) : n.family === "source" || n.family === "goal" ? (
    <circle cx={cx} cy={cy} r={n.w / 2} style={{ fill: n.family === "goal" ? "var(--c-goal)" : c }} />
  ) : n.family === "logic" ? (
    <rect x={11} y={11} width={50} height={50} rx={10} transform={`rotate(45 ${cx} ${cy})`} style={{ fill: c }} />
  ) : n.family === "action" ? (
    <rect x={9} y={9} width={44} height={44} rx={8} transform={`rotate(45 ${cx} ${cy})`} style={{ fill: c }} />
  ) : (
    <rect width={n.w} height={n.h} rx={22} style={{ fill: c }} />
  );
  return (
    <g transform={`translate(${n.x} ${n.y})`}>
      {body}
      {names && !shapes && (
        <text x={cx} y={n.h + 22} textAnchor="middle" style={{ fill: "var(--ink)", fontFamily: "var(--font-dm-sans), sans-serif", fontSize: 18, fontWeight: 600 }}>
          {name}
        </text>
      )}
    </g>
  );
}

/**
 * Preview of a funnel's map. `pad` is 8px on cards and 4px in tables. `archived` draws it at 50%. The whole card that
 * holds it is the link to the map; the preview itself is an image with a text alternative.
 */
export function FunnelPreview({ graph, settings, name, width = 320, height = 150, pad = 8, archived = false, className = "" }: { graph: unknown; settings?: unknown; name?: string; width?: number; height?: number; pad?: number; archived?: boolean; className?: string }) {
  const m = previewModel(graph, settings ?? {}, width, height, pad, name);
  const small = height < 100;
  return (
    <svg className={`fm-fprev ${className}`} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={m.empty ? `Map of ${name ?? "this funnel"}: no blocks yet` : m.label} style={archived ? { opacity: 0.5 } : undefined}>
      <defs>
        <pattern id={`fpd-${width}-${height}`} width="12" height="12" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r=".8" style={{ fill: "var(--dot)" }} />
        </pattern>
      </defs>
      <rect width={width} height={height} style={{ fill: "var(--bg)" }} />
      <rect width={width} height={height} fill={`url(#fpd-${width}-${height})`} />
      {m.empty ? (
        <g>
          <rect x={width / 2 - 34} y={height / 2 - (small ? 24 : 44)} width={68} height={40} rx={8} style={{ fill: "none", stroke: "var(--edge)", strokeWidth: 1.4, strokeDasharray: "4 4" }} />
          {!small && (
            <>
              <text x={width / 2} y={height / 2 + 16} textAnchor="middle" style={{ fill: "var(--ink)", fontSize: 12, fontWeight: 600, fontFamily: "var(--font-dm-sans), sans-serif" }}>
                No blocks yet
              </text>
              <text x={width / 2} y={height / 2 + 31} textAnchor="middle" style={{ fill: "var(--muted)", fontSize: 10.5, fontFamily: "var(--font-dm-sans), sans-serif" }}>
                Add a traffic source to start
              </text>
            </>
          )}
        </g>
      ) : (
        <g transform={`translate(${r2(m.tx)} ${r2(m.ty)}) scale(${r2(m.scale * 10000) / 10000})`}>
          {m.frames.map((f, i) => (
            <rect key={i} x={f.x} y={f.y} width={f.w} height={f.h} rx={14} style={{ fill: f.color, fillOpacity: 0.05, stroke: "var(--line)", strokeWidth: 2 / m.scale > 6 ? 6 : 2, strokeDasharray: "10 8" }} />
          ))}
          {m.edges.map((e) => (
            <path
              key={e.id}
              d={e.d}
              style={{
                fill: "none",
                stroke: e.kind === "leak" ? "var(--lost)" : e.kind === "nodata" ? "var(--muted)" : "var(--edge)",
                strokeWidth: e.width,
                strokeLinecap: "round",
                strokeDasharray: e.kind === "leak" ? `${4 / m.scale} ${3 / m.scale}` : e.kind === "skip" ? `${1.5 / m.scale} ${3 / m.scale}` : e.kind === "nodata" ? `${6 / m.scale} ${3 / m.scale} ${1.5 / m.scale} ${3 / m.scale}` : undefined,
              }}
            />
          ))}
          {m.nodes.map((n) => (
            <Mini key={n.id} n={n} windows={m.windows} names={m.names} shapes={m.detail !== "full"} />
          ))}
          {m.leakId &&
            m.nodes
              .filter((n) => n.id === m.leakId)
              .map((n) => <rect key="leak" x={n.x - 10} y={n.y - 10} width={n.w + 20} height={n.h + 20} rx={16} style={{ fill: "none", stroke: "var(--lost)", strokeWidth: Math.max(3, 1.6 / m.scale), strokeDasharray: `${Math.max(14, 6 / m.scale)} ${Math.max(8, 4 / m.scale)}` }} />)}
        </g>
      )}
    </svg>
  );
}
