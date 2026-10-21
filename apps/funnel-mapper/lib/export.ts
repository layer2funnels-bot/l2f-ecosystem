// Pure export generators: CSV step report and SVG map (the PNG and the PDF map are rasterised from the SVG).
import { brandMarkOf } from "./brand-marks";
import { baseOf, blockPivot, CATDARK, CATHEX, NH, WIDGET_SIZES, blockH, fourPorts, isAnnot, nodeW, picRect, typeOf, type ColorKey } from "./catalog";
import { money, nf, people } from "./format";
import { num, periodFactor, stepRows, type FunnelResult } from "./funnel-math";
import type { FunnelEdge, FunnelNode, Goal, Side } from "./graph";
import { ICONS, type IconName } from "./icons";
import { blockChip, edgeConversion, edgePath, edgeRate, sidesOf, edgeRevenue, edgeTag, priceTab } from "./editor/labels";
import { typeCaption, visualOf, WF_SIZE, WIREFRAMES, windowKeyOf, type WfPaint, type Wireframe } from "./block-visuals";
import { WINDOWS } from "./design-tiles";
import { DASH, FONT_FAMILIES, edgeLook, shapeGeom } from "./style";
import { hostOf, isVideoUrl, richToPlain } from "./rich-text";
import { goalCurrent } from "./report-data";
import { conversionPath, formatMetricValue, widgetConfig, widgetMembers, widgetValues, type WidgetMetric } from "./widget-data";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const csvq = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;

export const fileName = (name: string, ext: string) =>
  (name || "funnel")
    .replace(/[^\w\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase() + `.${ext}`;

/**
 * Step report CSV: every step, the funnel totals, then (optional) a scenario comparison with one column per
 * scenario. `scenarios` are results from compute / computeScenario (lib/report-data.ts `scenarios`).
 */
export function stepsCsv(g: { nodes: FunnelNode[]; edges: FunnelEdge[] }, R: FunnelResult, scenarios: { name: string; R: FunnelResult }[] = []): string {
  const rows: unknown[][] = [["Step", "Type", "In", "Out", "Not converting", "Conversion %", "Revenue", "Cost"]];
  stepRows(g, R).forEach((r) => rows.push([r.name, r.label, r.inn.toFixed(1), r.out.toFixed(1), r.non.toFixed(1), r.inn ? ((r.out / r.inn) * 100).toFixed(1) : "", r.rev.toFixed(2), r.cost.toFixed(2)]));
  rows.push([]);
  (
    [
      ["Traffic", R.traffic],
      ["Ad spend", R.spend],
      ["Leads", R.leads],
      ["Customers", R.cust],
      ["Revenue", R.rev],
      ["Profit", R.profit],
      ["ROI", R.roi],
      ["AOV", R.aov],
      ["CPA", R.cpa],
      ["CPL", R.cpl],
      ["CPC", R.cpc],
      ["ROAS", R.roas],
      ["Break-even ROAS", R.beroas],
      ["Break-even CPA", R.becpa],
      ["EPC", R.epc],
      ["Conversion rate", R.conv],
      ["MRR", R.mrr],
      ["LTV per customer", R.ltvc],
    ] as [string, number][]
  ).forEach(([a, b]) => rows.push([a, Number.isFinite(b) ? b.toFixed(2) : ""]));
  if (scenarios.length) {
    rows.push([]);
    rows.push(["Scenario comparison", ...scenarios.map((x) => x.name)]);
    const f = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : "");
    (
      [
        ["Traffic", (r) => r.traffic],
        ["Leads", (r) => r.leads],
        ["Customers", (r) => r.cust],
        ["Revenue", (r) => r.rev],
        ["Ad spend", (r) => r.spend],
        ["Profit", (r) => r.profit],
        ["ROAS", (r) => r.roas],
        ["ROI", (r) => r.roi],
        ["CPA", (r) => r.cpa],
        ["CPL", (r) => r.cpl],
        ["AOV", (r) => r.aov],
        ["LTV per customer", (r) => r.ltvc],
        ["MRR", (r) => r.mrr],
      ] as [string, (r: FunnelResult) => number][]
    ).forEach(([label, get]) => rows.push([label, ...scenarios.map((x) => f(get(x.R)))]));
  }
  return rows.map((r) => r.map(csvq).join(",")).join("\n");
}

/** Dated actuals export. Each row keeps its original aggregation period so partial periods are never implied. */
export function actualsCsv(rows: { period_start: string; period_end: string; node_id: string; visitors: number | null; conversions: number | null; revenue: number | null; spend: number | null }[], names: Record<string, string> = {}): string {
  const values: unknown[][] = [["Period start", "Period end", "Step", "Visitors", "Conversions", "Revenue", "Spend"]];
  for (const row of rows) values.push([row.period_start, row.period_end, names[row.node_id] ?? row.node_id, row.visitors, row.conversions, row.revenue, row.spend]);
  return values.map((r) => r.map(csvq).join(",")).join("\n");
}


/* ---------------- map image (SVG; PNG and the PDF map are rasterised from it) ---------------- */

export interface SvgPalette {
  bg: string;
  panel: string;
  panel2: string;
  line: string;
  ink: string;
  muted: string;
  edge: string;
  alt: string;
  good: string;
  brand: string;
  catInk: string;
  cat: Record<ColorKey, string>;
}
/** Light theme tokens (app/globals.css [data-theme="light"]): client exports are printed on white. */
export const LIGHT_PALETTE: SvgPalette = { bg: "#F8FAFC", panel: "#FFFFFF", panel2: "#F1F5F9", line: "#DBE2EA", ink: "#0F172A", muted: "#475569", edge: "#94A3B8", alt: "#C2410C", good: "#15803D", brand: "#047857", catInk: "#FFFFFF", cat: CATHEX };

/** Dark theme tokens (the locked dark-first palette): for slides and dark documents. */
export const DARK_PALETTE: SvgPalette = { bg: "#0B1220", panel: "#111827", panel2: "#1E293B", line: "#334155", ink: "#E2E8F0", muted: "#94A3B8", edge: "#64748B", alt: "#FB923C", good: "#22C55E", brand: "#34D399", catInk: "#0B1220", cat: CATDARK };
export type ImageBackground = "light" | "dark" | "transparent";
/** Palette for a map image background ("transparent" = light elements on no background). */
export const paletteFor = (bg: ImageBackground): SvgPalette => (bg === "dark" ? DARK_PALETTE : bg === "transparent" ? { ...LIGHT_PALETTE, bg: "none" } : LIGHT_PALETTE);

/** Text width in px. The browser passes a canvas-based measure with the real fonts; this fallback approximates. */
export type Measure = (text: string, size: number, weight: number, family: string) => number;
const approxMeasure: Measure = (t, size, weight) => t.length * size * (weight >= 700 ? 0.58 : 0.54);

export interface MapSvgOptions {
  currency: string;
  /** Revenue basis: money on blocks carries the LTV tag when it is "ltv". */
  basis?: "first" | "ltv";
  nums: boolean;
  /** What the one number on each block shows (Clean none, People people in, Money revenue / spend). Defaults to People when `nums` is on. */
  view?: "clean" | "people" | "money";
  palette?: SvgPalette;
  /** Rendered height/width of an element (the editor passes its measured sizes). */
  heightOf?: (n: FunnelNode) => number;
  widthOf?: (n: FunnelNode) => number;
  /** Line thickness follows traffic (View menu option). */
  thick?: boolean;
  /** Font families used on the canvas, plus @font-face CSS to embed (so PNG/PDF don't fall back to Arial). */
  fonts?: { sans: string; display: string; css?: string };
  measure?: Measure;
  /** Key-leak block (Performance map badge). */
  keyLeak?: string | null;
  /** Funnel goals: goal blocks draw their progress bar. */
  goals?: Goal[];
  /** Page screenshots as data URLs, by node id (drawn instead of the semantic wireframe). */
  shots?: Record<string, string>;
  /** Owner block artwork as data URLs, by block type (lib/block-art.ts): drawn in place of the family tile. */
  art?: Record<string, string>;
  /** Engine-backed extras for widgets (the 12-month series for Chart widgets, MRR detail); the editor passes them, nothing is calculated here. */
  widgetData?: {
    series: (metric: WidgetMetric, value: number) => number[];
    mrr: (members: FunnelNode[] | null) => { month12: number; subscribers: number };
  };
}

const DEFAULT_FONTS = { sans: "'DM Sans', Arial, sans-serif", display: "'Bricolage Grotesque', 'DM Sans', Arial, sans-serif" };
const BORDER_DASH = { solid: undefined, dashed: "6 4", dotted: "1.5 3" } as const;
const n2 = (v: number) => Math.round(v * 100) / 100;

/** Page wireframe (lib/block-visuals.ts data) as SVG at (x, y); `paint` maps the wireframe paints to colours. */
export function wireframeSvg(kind: Wireframe, x: number, y: number, paint: Record<WfPaint, string>): string {
  const fill = (k: WfPaint) => (k === "o" || k === "ao" ? "none" : paint[k]);
  const stroke = (k: WfPaint) => (k === "o" || k === "ao" ? ` stroke="${paint[k]}" stroke-width="1"` : "");
  const body = WIREFRAMES[kind]
    .map((sh) => {
      if (sh[0] === "r") return `<rect x="${sh[1]}" y="${sh[2]}" width="${sh[3]}" height="${sh[4]}" rx="${sh[5]}" fill="${fill(sh[6])}"${stroke(sh[6])}/>`;
      if (sh[0] === "c") return `<circle cx="${sh[1]}" cy="${sh[2]}" r="${sh[3]}" fill="${fill(sh[4])}"${stroke(sh[4])}/>`;
      return `<path d="${sh[1]}" fill="none" stroke="${paint[sh[2]]}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    })
    .join("");
  return `<g transform="translate(${n2(x)},${n2(y)})">${body}</g>`;
}

/** Greedy word wrap (explicit newlines kept); words longer than the line are broken by character. */
export function wrapText(text: string, maxW: number, size: number, weight: number, family: string, measure: Measure = approxMeasure): string[] {
  const out: string[] = [];
  const fits = (t: string) => measure(t, size, weight, family) <= maxW + 0.5;
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/(?<=\s)/)) {
      if (fits(line + word.trimEnd()) || !line) {
        if (!fits(word.trimEnd()) && !line) {
          // a single over-long word: break it
          let w = word;
          while (w && !fits(w.trimEnd())) {
            let k = w.length - 1;
            while (k > 1 && !fits(w.slice(0, k))) k--;
            out.push(w.slice(0, k));
            w = w.slice(k);
          }
          line = w;
        } else line += word;
      } else {
        out.push(line.trimEnd());
        line = word;
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

/** Cut a single line to fit, with an ellipsis (CSS text-overflow). */
function ellipsis(t: string, maxW: number, size: number, weight: number, family: string, measure: Measure) {
  if (measure(t, size, weight, family) <= maxW) return t;
  let k = t.length;
  while (k > 0 && measure(t.slice(0, k) + "…", size, weight, family) > maxW) k--;
  return t.slice(0, k).trimEnd() + "…";
}

interface TextLook {
  size: number;
  /** line height in px */
  lh: number;
  weight: number;
  family: string;
  color: string;
  align: "left" | "center" | "right";
  italic?: boolean;
  deco?: string;
  ls?: number;
}
/** Baseline inside a CSS line box (ascent ≈ 0.99em, descent ≈ 0.31em for the app fonts). */
const baseline = (top: number, t: TextLook) => top + (t.lh - 1.3 * t.size) / 2 + 0.99 * t.size;

function textAttrs(t: TextLook) {
  return `font-size="${t.size}" font-weight="${t.weight}" font-family="${esc(t.family)}" fill="${esc(t.color)}"${t.italic ? ' font-style="italic"' : ""}${t.deco ? ` text-decoration="${t.deco}"` : ""}${t.ls ? ` letter-spacing="${t.ls}"` : ""}`;
}
/** Lines of text in a box [x, x+w], first line box at `top`. */
function textBlock(lines: string[], x: number, w: number, top: number, t: TextLook) {
  const ax = t.align === "center" ? x + w / 2 : t.align === "right" ? x + w : x;
  const anchor = t.align === "center" ? "middle" : t.align === "right" ? "end" : "start";
  return lines.map((l, i) => `<text x="${n2(ax)}" y="${n2(baseline(top + i * t.lh, t))}" text-anchor="${anchor}" ${textAttrs(t)} xml:space="preserve">${esc(l)}</text>`).join("");
}

/** Union of everything drawn: element boxes, frame titles, connection paths and labels. */
export function mapBounds(boxes: [number, number, number, number][], paths: string[]): [number, number, number, number] {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  const add = (x: number, y: number) => {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  };
  boxes.forEach(([x, y, w, h]) => {
    add(x, y);
    add(x + w, y + h);
  });
  paths.forEach((d) => {
    const v = (d.match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number);
    if (/C/.test(d) && v.length === 8) {
      // cubic bezier: sample the curve (control points overshoot it)
      for (let i = 0; i <= 16; i++) {
        const t = i / 16,
          u = 1 - t;
        add(u * u * u * v[0] + 3 * u * u * t * v[2] + 3 * u * t * t * v[4] + t * t * t * v[6], u * u * u * v[1] + 3 * u * u * t * v[3] + 3 * u * t * t * v[5] + t * t * t * v[7]);
      }
    } else for (let i = 0; i + 1 < v.length; i += 2) add(v[i], v[i + 1]);
  });
  return Number.isFinite(x0) ? [x0, y0, x1, y1] : [0, 0, 400, 300];
}

/** Legacy helper: element boxes only. */
export function bounds(nodes: FunnelNode[], heightOf: (n: FunnelNode) => number = (n) => (isAnnot(n.type) ? NH : blockH(n.type))) {
  return mapBounds(
    nodes.map((n) => [n.x, n.y, n.w ?? nodeW(n.type), n.h ?? heightOf(n)]),
    [],
  );
}

/**
 * Vector map of the funnel, drawn to match the canvas: element styles (fill, border, radius, opacity, fonts, text
 * styling), wrapped text, shapes, images, checklists, frames, connection styles (path, dash, colour, width, arrows,
 * skip / no-data, labels) and layer order. `nums` = show traffic counts and block stats.
 */
export function mapSvg(g: { nodes: FunnelNode[]; edges: FunnelEdge[] }, R: FunnelResult, opts: MapSvgOptions): string {
  const P = opts.palette ?? LIGHT_PALETTE;
  const H0 = opts.heightOf ?? ((n: FunnelNode) => (n.type === "label" ? 40 : isAnnot(n.type) ? NH : blockH(n.type)));
  const W0 = opts.widthOf ?? ((n: FunnelNode) => n.w ?? (n.type === "label" ? 300 : nodeW(n.type)));
  const F = { ...DEFAULT_FONTS, ...opts.fonts };
  const measure = opts.measure ?? approxMeasure;
  const fam = (s: FunnelNode["s"], fallback: string) => (s?.font === "sans" ? F.sans : s?.font === "display" ? F.display : s?.font ? FONT_FAMILIES[s.font].css : fallback);
  /** `rel`: the CSS line height is relative (1.15 / normal) rather than a fixed px value. */
  const look = (s: FunnelNode["s"], d: Partial<TextLook> & { size: number; lh: number; rel?: boolean }): TextLook => {
    const size = s?.fontSize ?? d.size;
    return {
      size,
      lh: s?.lh ? size * s.lh : d.rel ? d.lh * (size / d.size) : d.lh,
      weight: s?.weight ?? d.weight ?? 400,
      family: fam(s, d.family ?? F.sans),
      color: s?.color ?? d.color ?? P.ink,
      align: s?.align ?? d.align ?? "left",
      italic: s?.italic,
      deco: [s?.underline && "underline", s?.strike && "line-through"].filter(Boolean).join(" ") || d.deco,
      ls: s?.ls,
    };
  };
  const box = (x: number, y: number, w: number, h: number, s: FunnelNode["s"], d: { fill: string; stroke: string; sw: number; r: number; dash?: string }) => {
    const sw = s?.borderW ?? d.sw;
    const dash = s?.borderStyle ? BORDER_DASH[s.borderStyle] : d.dash;
    // CSS borders sit inside the box; SVG strokes are centred on the path
    return `<rect x="${n2(x + sw / 2)}" y="${n2(y + sw / 2)}" width="${n2(Math.max(0, w - sw))}" height="${n2(Math.max(0, h - sw))}" rx="${Math.max(0, (s?.radius ?? d.r) - sw / 2)}" fill="${esc(s?.fill ?? d.fill)}"${sw ? ` stroke="${esc(s?.border ?? d.stroke)}" stroke-width="${sw}"` : ""}${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
  };
  const group = (s: FunnelNode["s"], body: string) => (s?.opacity != null && s.opacity < 1 ? `<g opacity="${Math.max(0.1, s.opacity)}">${body}</g>` : body);

  const B = Object.fromEntries(g.nodes.map((n) => [n.id, n]));
  const boxes: [number, number, number, number][] = [];
  const paths: string[] = [];
  let defs = "";

  /* frames: always behind everything (as on the canvas) */
  let frames = "";
  g.nodes
    .filter((f) => f.type === "frame")
    .forEach((f) => {
      const c = String(f.p.color ?? "#10B981");
      const w = f.w ?? 400,
        h = f.h ?? 300;
      const t = look(f.s, { size: 13, lh: 17, weight: 700, rel: true });
      const tw = measure(f.name, t.size, t.weight, t.family) + 20 + 3;
      const th = t.lh + 4 + 3;
      frames += group(
        f.s,
        box(f.x, f.y, w, h, f.s, { fill: c, stroke: c, sw: 2, r: 18, dash: "8 6" }).replace(/fill="([^"]+)"/, f.s?.fill ? 'fill="$1"' : 'fill="$1" fill-opacity=".07"') +
          `<rect x="${f.x + 14.75}" y="${f.y - 13.25}" width="${n2(tw - 1.5)}" height="${n2(th - 1.5)}" rx="8" fill="${P.panel}" stroke="${esc(f.s?.border ?? c)}" stroke-width="1.5"/>` +
          textBlock([f.name], f.x + 14 + 11.5, tw - 23, f.y - 14 + 3.5, { ...t, align: "left" }),
      );
      boxes.push([f.x, f.y - 14, Math.max(w, tw + 14), h + 14]);
    });

  /* connections (React Flow draws them under the elements) */
  const maxF = Math.max(1, ...Object.values(R.flows));
  const PORT_OUT = 1;
  const sideXY = (n: FunnelNode, side: Side): [number, number] => {
    // lines attach to the picture or shape; handle centres sit just outside its edge (editor.css .fm-port)
    const r = picRect(n.type),
      cy = n.y + blockPivot(n.type),
      cx = n.x + r.x + r.w / 2;
    if (side === "left") return [n.x + r.x - PORT_OUT, cy];
    if (side === "bottom") return [cx, n.y + r.y + r.h + PORT_OUT];
    if (side === "top") return [cx, n.y + r.y - PORT_OUT];
    return [n.x + r.x + r.w + PORT_OUT, cy];
  };
  let edges = "",
    labels = "";
  g.edges.forEach((e, i) => {
    const a = B[e.from],
      b = B[e.to];
    if (!a || !b) return;
    const port = e.port === "alt" ? "alt" : "main";
    // Yes/No logic keeps its fixed ports; every other block uses the side the line was drawn from / to
    const [sp, tp] = sidesOf(e);
    const s1: Side = fourPorts(a.type) ? sp : port === "alt" ? "bottom" : "right",
      t1: Side = fourPorts(b.type) ? tp : "left";
    const [sx, sy] = sideXY(a, s1),
      [tx, ty] = sideXY(b, t1);
    const L = edgeLook(e.s);
    const [d, mx, my] = edgePath(L, port, sx, sy, tx, ty, s1, t1);
    const flow = R.flows[e.id] || 0;
    const w = L.width ?? (opts.thick ? 2 + 6 * Math.sqrt(flow / maxF) : 2);
    const color = L.color ?? (L.kind === "nodata" ? P.muted : port === "alt" ? P.alt : P.edge);
    const dash = L.dash ? DASH[L.dash] : port === "alt" ? "7 6" : undefined;
    const op = L.kind === "nodata" ? 0.7 : port === "alt" ? 0.9 : 1;
    let marker = "";
    if (L.arrow !== "none") {
      const ms = L.arrowSize + w * 1.5;
      defs += `<marker id="fm-a${i}" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth="${n2(ms)}" markerHeight="${n2(ms)}" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${esc(color)}"/></marker>`;
      marker = ` marker-end="url(#fm-a${i})"${L.arrow === "both" ? ` marker-start="url(#fm-a${i})"` : ""}`;
    }
    const opacity = L.opacity != null ? L.opacity : op;
    edges += `<path d="${d}" fill="none" stroke="${esc(color)}" stroke-width="${n2(w)}"${dash ? ` stroke-dasharray="${dash}"` : ""}${opacity < 1 ? ` opacity="${opacity}"` : ""}${marker}/>`;
    paths.push(d);

    // label pill: tags (Yes/No, A/B, Skip, custom) + people (· share %) or "No data"
    const tag = edgeTag(a.type, port);
    const segs: { t: string; c: string; w: number }[] = [];
    if (tag) segs.push({ t: tag.text, c: tag.alt ? P.alt : P.good, w: 700 });
    if (L.kind === "skip") segs.push({ t: "Skip", c: P.good, w: 700 });
    if (L.label) segs.push({ t: L.label, c: P.good, w: 700 });
    if (L.kind === "nodata") segs.push({ t: "No data", c: P.muted, w: 600 });
    else if (opts.nums) {
      const share = num(e.share ?? 100);
      segs.push({ t: `${edgeRate(e.from, flow, R) ?? nf(flow)}${share !== 100 ? ` · ${nf(share)}%` : ""}`, c: P.ink, w: 700 });
      const conv = L.showPct ? edgeConversion(e.from, flow, R) : null;
      if (conv != null) segs.push({ t: `${nf(conv * 100, 1)}% convert`, c: P.muted, w: 600 });
      const rv = L.showRev ? edgeRevenue(e.to, flow, R) : 0;
      if (rv > 0) segs.push({ t: money(rv, opts.currency), c: P.muted, w: 600 });
    }
    if (!segs.length) return;
    const t = { size: 12, lh: 16, family: F.sans };
    const widths = segs.map((s) => measure(s.t, t.size, s.w, t.family));
    const pw = widths.reduce((acc, x) => acc + x, 0) + (segs.length - 1) * 5 + 18 + 2,
      ph = t.lh + 4 + 2;
    const px = mx - pw / 2,
      py = my - ph / 2;
    labels += `<rect x="${n2(px + 0.5)}" y="${n2(py + 0.5)}" width="${n2(pw - 1)}" height="${n2(ph - 1)}" rx="${n2(ph / 2)}" fill="${P.panel}" stroke="${P.line}"/>`;
    let cx = px + 10;
    segs.forEach((s, k) => {
      labels += `<text x="${n2(cx)}" y="${n2(baseline(py + 3, { ...t, weight: s.w, color: s.c, align: "left" }))}" font-size="12" font-weight="${s.w}" font-family="${esc(F.sans)}" fill="${esc(s.c)}">${esc(s.t)}</text>`;
      cx += widths[k] + 5;
    });
    boxes.push([px, py, pw, ph]);
  });

  /* elements, in layer order (z), as React Flow stacks them */
  let body = "";
  const order = g.nodes
    .map((n, i) => ({ n, i }))
    .filter(({ n }) => n.type !== "frame" && typeOf(n.type))
    .sort((a, b) => (a.n.z ?? 0) - (b.n.z ?? 0) || a.i - b.i)
    .map(({ n }) => n);
  order.forEach((n, idx) => {
    const T = typeOf(n.type);
    const s = n.s;
    if (n.type === "shape") {
      const w = n.w ?? 160,
        h = n.h ?? 100,
        shape = String(n.p.shape ?? "rounded");
      const fill = esc(s?.fill ?? P.panel2),
        stroke = esc(s?.border ?? P.line),
        sw = s?.borderW ?? 1.5,
        dash = s?.borderStyle ? BORDER_DASH[s.borderStyle] : undefined;
      const st = `fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ""}`;
      const geom = shapeGeom(shape, w, h, String(n.p.dir ?? "h"), s?.borderW ?? 2);
      let o = geom
        ? geom.open
          ? `<g transform="translate(${n2(n.x)},${n2(n.y)})"><path d="${geom.d}" fill="none" stroke="${esc(s?.border ?? P.muted)}" stroke-width="${s?.borderW ?? 2}" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ""}/>${geom.head ? `<polygon points="${geom.head}" fill="${esc(s?.border ?? P.muted)}"/>` : ""}</g>`
          : `<path transform="translate(${n2(n.x)},${n2(n.y)})" d="${geom.d}" ${st}/>`
        : shape === "ellipse" || shape === "circle"
          ? `<ellipse cx="${n.x + w / 2}" cy="${n.y + h / 2}" rx="${n2(w / 2 - sw / 2)}" ry="${n2(h / 2 - sw / 2)}" ${st}/>`
          : shape === "diamond"
            ? `<polygon points="${n2(n.x + w / 2)},${n2(n.y + h * 0.01)} ${n2(n.x + w * 0.99)},${n2(n.y + h / 2)} ${n2(n.x + w / 2)},${n2(n.y + h * 0.99)} ${n2(n.x + w * 0.01)},${n2(n.y + h / 2)}" ${st}/>`
            : box(n.x, n.y, w, h, s, { fill: P.panel2, stroke: P.line, sw: 1.5, r: shape === "rect" ? 0 : 16 });
      const text = String(n.p.text ?? "");
      if (text && !geom?.open) {
        const t = look(s, { size: 14, lh: 18.2, weight: 600, align: "center", rel: true });
        const pad = s?.pad ?? 0;
        const th = shape === "callout" ? h * 0.78 : h;
        const lines = wrapText(text, w - 24 - pad * 2, t.size, t.weight, t.family, measure);
        o += textBlock(lines, n.x + 12 + pad, w - 24 - pad * 2, n.y + (th - lines.length * t.lh) / 2, t);
      }
      body += group(s, o);
      boxes.push([n.x, n.y, w, h]);
      return;
    }
    if (n.type === "image") {
      const src = String(n.p.src ?? "");
      const w = n.w ?? 200,
        h = n.h ?? 140;
      if (!src) return; // the empty placeholder is editor-only
      const r = s?.radius ?? 10;
      defs += `<clipPath id="fm-c${idx}"><rect x="${n.x}" y="${n.y}" width="${w}" height="${h}" rx="${r}"/></clipPath>`;
      let o = s?.fill ? `<rect x="${n.x}" y="${n.y}" width="${w}" height="${h}" rx="${r}" fill="${esc(s.fill)}"/>` : "";
      o += `<image href="${esc(src)}" x="${n.x}" y="${n.y}" width="${w}" height="${h}" preserveAspectRatio="${n.p.fit === "cover" ? "xMidYMid slice" : "xMidYMid meet"}" clip-path="url(#fm-c${idx})"/>`;
      if (s?.border || s?.borderW) o += box(n.x, n.y, w, h, { ...s, fill: "none" }, { fill: "none", stroke: P.line, sw: 1.5, r });
      body += group(s, o);
      boxes.push([n.x, n.y, w, h]);
      return;
    }
    if (n.type === "checklist") {
      const items = (n.p.items as { text: string; done: boolean; indent?: number }[] | undefined) ?? [];
      const w = W0(n);
      const px = (s?.pad ?? 12) + 1.5,
        py = (s?.pad ?? 10) + 1.5;
      const tt = look(s, { size: 14, lh: 18.2, weight: 700, rel: true });
      const it = look(s, { size: 13, lh: 18, weight: 400 });
      let y = n.y + py;
      let inner = textBlock([ellipsis(String(n.p.title ?? "Checklist"), w - px * 2 - 40, tt.size, tt.weight, tt.family, measure)], n.x + px, w - px * 2, y, { ...tt, align: "left" });
      inner += `<text x="${n2(n.x + w - px)}" y="${n2(baseline(y, tt))}" text-anchor="end" font-size="12" font-weight="600" font-family="${esc(F.sans)}" fill="${P.muted}">${items.filter((x) => x.done).length}/${items.length}</text>`;
      y += tt.lh + 6;
      items.forEach((x, k) => {
        const ix = n.x + px + (x.indent ?? 0) * 16;
        const lines = wrapText(x.text, n.x + w - px - (ix + 22), it.size, it.weight, it.family, measure);
        inner += x.done
          ? `<rect x="${n2(ix + 0.5)}" y="${n2(y + 2.5)}" width="14" height="14" rx="3" fill="${P.brand}"/><path d="M${n2(ix + 4)} ${n2(y + 9.5)} l3 3 l5 -6" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
          : `<rect x="${n2(ix + 0.5)}" y="${n2(y + 2.5)}" width="14" height="14" rx="3" fill="${P.panel}" stroke="${P.muted}"/>`;
        inner += textBlock(lines, ix + 22, w, y, { ...it, align: "left", color: x.done ? P.muted : it.color, deco: x.done ? "line-through" : it.deco });
        y += lines.length * it.lh + (k < items.length - 1 ? 3 : 0);
      });
      const h = Math.max(H0(n), y + py - n.y);
      body += group(s, box(n.x, n.y, w, h, s, { fill: P.panel, stroke: P.line, sw: 1.5, r: 14 }) + inner);
      boxes.push([n.x, n.y, w, h]);
      return;
    }
    if (n.type === "note") {
      const w = n.w ?? 210;
      const px = (s?.pad ?? 12) + 1.5,
        py = (s?.pad ?? 10) + 1.5;
      const t = look(s, { size: 13, lh: 18, weight: 400, color: "#422006" });
      const lines = wrapText(richToPlain(String(n.p.text ?? "")), w - px * 2, t.size, t.weight, t.family, measure);
      const h = Math.max(96, H0(n), lines.length * t.lh + py * 2);
      body += group(s, box(n.x, n.y, w, h, s, { fill: "#FDE68A", stroke: "#FCD34D", sw: 1.5, r: 14 }) + textBlock(lines, n.x + px, w - px * 2, n.y + py, t));
      boxes.push([n.x, n.y, w, h]);
      return;
    }
    if (n.type === "link") {
      const url = String(n.p.url ?? "");
      if (!url) return; // an empty link card is editor-only
      const w = W0(n),
        h = Math.max(60, H0(n));
      const video = isVideoUrl(url);
      const tt = look(s, { size: 13.5, lh: 18, weight: 700 });
      const title = ellipsis(String(n.p.title ?? "") || hostOf(url), w - 76, tt.size, tt.weight, tt.family, measure);
      let o = box(n.x, n.y, w, h, s, { fill: P.panel, stroke: P.line, sw: 1.5, r: 14 });
      o += `<rect x="${n2(n.x + 12)}" y="${n2(n.y + (h - 40) / 2)}" width="40" height="40" rx="9" fill="${video ? "#FEE2E2" : P.panel2}"/>`;
      o += video
        ? `<path d="M${n2(n.x + 28)} ${n2(n.y + h / 2 - 7)} l10 7 l-10 7z" fill="#DC2626"/>`
        : `<g transform="translate(${n2(n.x + 23)},${n2(n.y + h / 2 - 9)}) scale(0.75)" fill="none" stroke="${P.muted}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS.link}</g>`;
      o += textBlock([title], n.x + 62, w - 74, n.y + h / 2 - 18, { ...tt, align: "left" });
      o += `<text x="${n2(n.x + 62)}" y="${n2(n.y + h / 2 + 14)}" font-size="12" font-family="${esc(F.sans)}" fill="${P.brand}">${esc(hostOf(url))}</text>`;
      body += group(s, o);
      boxes.push([n.x, n.y, w, h]);
      return;
    }
    if (n.type === "label") {
      const w = W0(n);
      const px = (s?.pad ?? 8) + 1,
        py = (s?.pad ?? 4) + 1;
      const size = s?.fontSize ?? (Number(n.p.size) || 28);
      const t = look(s, { size, lh: size * 1.15, weight: 800, family: F.display, rel: true });
      const lines = wrapText(String(n.p.text ?? ""), w - px * 2, t.size, t.weight, t.family, measure);
      const h = Math.max(H0(n), lines.length * t.lh + py * 2);
      const frame = s?.fill || s?.border || s?.borderW ? box(n.x, n.y, w, h, s, { fill: "none", stroke: "none", sw: 0, r: 0 }) : "";
      body += group(s, frame + textBlock(lines, n.x + px, w - px * 2, n.y + py, t));
      boxes.push([n.x, n.y, w, h]);
      return;
    }
    if (n.type === "widget") {
      // widgets are drawn with the plan's numbers (Actuals are not part of an image)
      if (!opts.nums) return;
      const cfg = widgetConfig(n.p);
      const dims = WIDGET_SIZES[cfg.size];
      const vals = widgetValues(cfg, g.nodes, R, opts.goals ?? []);
      const { members, invalid } = widgetMembers(cfg, g.nodes);
      const path = cfg.display === "path" && !invalid ? conversionPath(g.nodes, g.edges, R, members, cfg.size === "S" ? 3 : cfg.size === "M" ? 4 : 6) : [];
      const shown = path.length ? [] : cfg.size === "S" ? vals.slice(0, 1) : cfg.size === "M" ? vals.slice(0, 2) : vals;
      const rows = path.length ? Math.ceil((path.length * 20) / 44) : Math.ceil(shown.length / (cfg.size === "S" ? 1 : 2));
      // the same extras as the card on the canvas: MRR detail and, for the Chart display, the 12-month line
      const mrrV = shown.find((v) => v.metric === "mrr");
      const mrrLine = mrrV && cfg.size !== "S" && opts.widgetData ? opts.widgetData.mrr(members) : null;
      const chartV = cfg.display === "chart" && cfg.size !== "S" ? shown.find((v) => ["revenue", "profit", "leads", "customers", "mrr"].includes(v.metric)) : undefined;
      const series = chartV && opts.widgetData ? opts.widgetData.series(chartV.metric, chartV.value) : [];
      const h = Math.max(dims.h, 30 + rows * 44 + (mrrLine ? 18 : 0) + (series.length > 1 ? 66 : 0));
      const w = dims.w;
      const scope = cfg.scope === "funnel" ? "WHOLE FUNNEL" : cfg.scope === "frame" ? (g.nodes.find((x) => x.id === cfg.frameId)?.name ?? "FRAME").toUpperCase() : `${members?.length ?? 0} SELECTED STEPS`;
      let o = box(n.x, n.y, w, h, s, { fill: P.panel, stroke: invalid ? P.alt : P.line, sw: 1, r: 12 });
      o += `<text x="${n2(n.x + 12)}" y="${n2(n.y + 20)}" font-size="10.5" font-weight="700" letter-spacing=".7" font-family="${esc(F.sans)}" fill="${P.muted}">${esc(ellipsis(scope, w - 24, 10.5, 700, F.sans, measure))}</text>`;
      shown.forEach((v, i) => {
        const col = cfg.size === "S" ? 0 : i % 2,
          row = cfg.size === "S" ? i : Math.floor(i / 2);
        const cw = cfg.size === "S" ? w - 24 : (w - 24 - 14) / 2;
        const x = n.x + 12 + col * (cw + 14),
          y = n.y + 28 + row * 44;
        o += `<text x="${n2(x)}" y="${n2(y + 10)}" font-size="11.5" font-family="${esc(F.sans)}" fill="${P.muted}">${esc(v.label)}</text>`;
        o += `<text x="${n2(x)}" y="${n2(y + 32)}" font-size="${cfg.size === "L" ? 22 : 20}" font-weight="700" font-family="${esc(F.display)}" fill="${P.ink}">${esc(ellipsis(formatMetricValue(v, opts.currency), cw, 20, 700, F.display, measure))}</text>`;
      });
      path.forEach((st, i) => {
        const y = n.y + 42 + i * 20;
        const v = i === 0 ? `${nf(st.out)} in` : Number.isFinite(st.rate) ? `${nf(st.rate * 100, 1)}%` : "–";
        const vw = measure(v, 12, 700, F.display);
        o += `<text x="${n2(n.x + 12)}" y="${n2(y)}" font-size="12" font-family="${esc(F.sans)}" fill="${P.muted}">${esc(ellipsis(st.name, w - 36 - vw, 12, 400, F.sans, measure))}</text>`;
        o += `<text x="${n2(n.x + w - 12)}" y="${n2(y)}" text-anchor="end" font-size="12" font-weight="700" font-family="${esc(F.display)}" fill="${P.ink}">${esc(v)}</text>`;
      });
      const below = n.y + 28 + rows * 44;
      if (mrrLine) o += `<text x="${n2(n.x + 12)}" y="${n2(below + 4)}" font-size="11" font-family="${esc(F.sans)}" fill="${P.muted}">${esc(`Month 12 ${Number.isFinite(mrrLine.month12) ? money(mrrLine.month12, opts.currency) : "n/a"} · ${people(mrrLine.subscribers)} subscribers`)}</text>`;
      if (series.length > 1) {
        const x0 = n.x + 12,
          x1 = n.x + w - 12,
          y1 = n.y + h - 10,
          y0 = y1 - 48;
        const lo = Math.min(0, ...series),
          hi = Math.max(...series, lo + 1e-9);
        const pts = series.map((v, i) => [x0 + (i / (series.length - 1)) * (x1 - x0), y1 - 3 - ((v - lo) / (hi - lo)) * (y1 - y0 - 6)] as const);
        const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${n2(x)} ${n2(y)}`).join("");
        o += `<path d="${d}L${n2(x1)} ${n2(y1)}L${n2(x0)} ${n2(y1)}Z" fill="${P.brand}" fill-opacity=".14"/><path d="${d}" fill="none" stroke="${P.brand}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      }
      body += group(s, o);
      boxes.push([n.x, n.y, w, h]);
      return;
    }
    if (!T || isAnnot(n.type)) return;

    /* flow block (V4): a picture or shape with its name under it and one number chip, drawn like the canvas */
    const V = visualOf(n.type);
    const pr = picRect(n.type),
      px = n.x + pr.x,
      py = n.y + pr.y,
      pw = pr.w,
      ph = pr.h,
      pcx = px + pw / 2,
      pcy = py + ph / 2;
    const c = n.s?.accent && /^#[0-9a-f]{6}$/i.test(n.s.accent) ? n.s.accent : P.cat[T.color ?? T.cat];
    const view = opts.view ?? (opts.nums ? "people" : "clean");
    const perf = view !== "clean";
    const leak = perf && opts.keyLeak === n.id;
    const edgeCol = P.panel === "#FFFFFF" || P.bg === "#FFFFFF" ? "#D3DBE6" : "#2A3648";
    const tint = V.brand ?? c;
    const ink = V.brand ? "#FFFFFF" : P.catInk;
    const artUrl = s?.icon ? undefined : opts.art?.[n.type];
    const mark = s?.icon ? undefined : brandMarkOf(n.type);
    const glyphAt = (cx: number, cy: number, size: number, color: string) => {
      if (mark) return `<svg x="${n2(cx - size / 2)}" y="${n2(cy - size / 2)}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}"><path d="${mark}"/></svg>`;
      const icon = ICONS[(s?.icon as IconName) || T.icon] ?? ICONS.page;
      return `<svg x="${n2(cx - size / 2)}" y="${n2(cy - size / 2)}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>`;
    };
    let o = "";
    if (V.family === "page" || V.family === "offer") {
      const win = WINDOWS[windowKeyOf(n.type)];
      defs += `<clipPath id="fm-p${idx}"><rect x="${n2(px)}" y="${n2(py)}" width="${pw}" height="${ph}" rx="12"/></clipPath>`;
      o += `<rect x="${n2(px)}" y="${n2(py)}" width="${pw}" height="${ph}" rx="12" fill="#F4F6FA"/>`;
      o += `<g clip-path="url(#fm-p${idx})">`;
      if (win) o += `<svg x="${n2(px)}" y="${n2(py)}" width="${pw}" height="${ph}" viewBox="0 0 66 65" preserveAspectRatio="xMidYMin slice">${win}</svg>`;
      const shot = opts.shots?.[n.id];
      if (shot) o += `<image href="${esc(shot)}" x="${n2(px)}" y="${n2(py)}" width="${pw}" height="${ph}" preserveAspectRatio="xMidYMin slice"/>`;
      o += `<rect x="${n2(px)}" y="${n2(py + ph - 4)}" width="${pw}" height="4" fill="${c}"/></g>`;
      o += `<rect x="${n2(px + 0.5)}" y="${n2(py + 0.5)}" width="${pw - 1}" height="${ph - 1}" rx="11.5" fill="none" stroke="${edgeCol}"/>`;
      o += `<rect x="${n2(px + 6)}" y="${n2(py + 6)}" width="20" height="20" rx="6" fill="${c}"/>` + glyphAt(px + 16, py + 16, 12, P.catInk);
      if (V.family === "offer" && perf) {
        const pt = priceTab(n, opts.currency);
        const rw = measure(pt, 11, 700, F.sans) + 14;
        o += `<rect x="${n2(px + 6)}" y="${n2(py + ph - 10 - 18)}" width="${n2(rw)}" height="18" rx="6" fill="${c}"/><text x="${n2(px + 6 + rw / 2)}" y="${n2(py + ph - 10 - 5.5)}" text-anchor="middle" font-size="11" font-weight="700" font-family="${esc(F.sans)}" fill="${P.catInk}">${esc(pt)}</text>`;
      }
    } else if (artUrl) {
      o += `<image href="${esc(artUrl)}" x="${n2(px)}" y="${n2(py)}" width="${pw}" height="${ph}" preserveAspectRatio="xMidYMid meet"/>`;
    } else if (V.family === "source" || V.family === "goal") {
      o += `<circle cx="${n2(pcx)}" cy="${n2(pcy)}" r="${pw / 2}" fill="${V.family === "goal" ? P.cat.goal : tint}"/>` + glyphAt(pcx, pcy, 28, ink);
    } else if (V.family === "message") {
      o += `<path d="M${n2(px + 22)} ${n2(py)}H${n2(px + pw - 22)}a22 22 0 0 1 22 22v${ph - 44}a22 22 0 0 1-22 22H${n2(px + 6)}a6 6 0 0 1-6-6V${n2(py + 22)}a22 22 0 0 1 22-22z" fill="${tint}"/>` + glyphAt(pcx, pcy, 22, ink);
    } else {
      const side = V.family === "logic" ? 50 : 44;
      o += `<rect x="${n2(pcx - side / 2)}" y="${n2(pcy - side / 2)}" width="${side}" height="${side}" rx="${V.family === "logic" ? 10 : 8}" fill="${tint}" transform="rotate(45 ${n2(pcx)} ${n2(pcy)})"/>` + glyphAt(pcx, pcy, 22, ink);
    }
    if (leak) {
      const lw = measure("Biggest leak", 11, 700, F.sans) + 18;
      o += `<rect x="${n2(px - 6)}" y="${n2(py - 32)}" width="${n2(lw)}" height="22" rx="6" fill="${P.alt}" fill-opacity=".16" stroke="${P.alt}"/><text x="${n2(px - 6 + lw / 2)}" y="${n2(py - 17)}" text-anchor="middle" font-size="11" font-weight="600" font-family="${esc(F.sans)}" fill="${P.alt}">Biggest leak</text>`;
      o += V.family === "page" || V.family === "offer" ? `<rect x="${n2(px - 5)}" y="${n2(py - 5)}" width="${pw + 10}" height="${ph + 10}" rx="17" fill="none" stroke="${P.alt}" stroke-width="2" stroke-dasharray="7 5"/>` : `<circle cx="${n2(pcx)}" cy="${n2(pcy)}" r="${n2(Math.max(pw, ph) / 2 + 6)}" fill="none" stroke="${P.alt}" stroke-width="2" stroke-dasharray="7 5"/>`;
    }
    // the one number: a chip top-right (People: people in; Money: revenue on offers, spend on sources)
    const chip = n.s?.hideNum ? null : blockChip(n, R, opts.currency, 1, view, opts.basis);
    if (chip) {
      const cw = measure(chip.value, 11.5, 700, F.sans) + 16;
      o += `<rect x="${n2(px + pw + 12 - cw + 0.5)}" y="${n2(py - 10 + 0.5)}" width="${n2(cw - 1)}" height="21" rx="10.5" fill="${P.panel2}" stroke="${P.line}"/><text x="${n2(px + pw + 12 - cw / 2)}" y="${n2(py - 10 + 14.5)}" text-anchor="middle" font-size="11.5" font-weight="700" font-family="${esc(F.sans)}" fill="${P.ink}">${esc(chip.value)}</text>`;
    }
    // name under it: two lines at most, centred; then the subtype
    const nameW = nodeW(n.type) - 4;
    const tl: TextLook = { size: 13, lh: 17, weight: 600, family: F.sans, color: P.ink, align: "center" };
    let lines = wrapText(n.name, nameW, tl.size, tl.weight, tl.family, measure);
    if (lines.length > 2) lines = [lines[0], ellipsis(lines.slice(1).join(" "), nameW, tl.size, tl.weight, tl.family, measure)];
    o += textBlock(lines, n.x + 2, nameW, py + ph + 6, tl);
    const subY = py + ph + 6 + lines.length * tl.lh + 2;
    const st: TextLook = { size: 11, lh: 14, weight: 400, family: F.sans, color: P.muted, align: "center" };
    o += textBlock([ellipsis(V.family === "page" || V.family === "offer" ? typeCaption(n.type) : T.label, nameW, st.size, st.weight, st.family, measure)], n.x + 2, nameW, subY, st);
    body += group(undefined, o);
    boxes.push([n.x, n.y - (leak ? 32 : 10), nodeW(n.type) + 12, blockH(n.type) + (leak ? 32 : 10)]);
  });

  const [x0, y0, x1, y1] = mapBounds(boxes, paths);
  const pad = 32,
    W = Math.ceil(x1 - x0 + pad * 2),
    H = Math.ceil(y1 - y0 + pad * 2);
  const style = opts.fonts?.css ? `<style>${opts.fonts.css}</style>` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${esc(F.sans)}">` +
    `<defs>${style}${defs}</defs><rect width="100%" height="100%" fill="${P.bg}"/>` +
    `<g transform="translate(${n2(pad - x0)},${n2(pad - y0)})">${frames}${edges}${body}${labels}</g></svg>`
  );
}
