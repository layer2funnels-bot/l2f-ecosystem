// Visual styling for canvas elements and connections. Purely presentational: nothing here affects the maths.
import type { CSSProperties } from "react";

export const FONT_FAMILIES = {
  sans: { label: "Sans (DM Sans)", css: "var(--font-sans)" },
  display: { label: "Display (Bricolage)", css: "var(--font-display)" },
  serif: { label: "Serif", css: "Georgia, 'Times New Roman', serif" },
  mono: { label: "Mono", css: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace" },
} as const;
export type FontFamily = keyof typeof FONT_FAMILIES;

export const FONT_WEIGHTS: [number, string][] = [
  [400, "Regular"],
  [500, "Medium"],
  [600, "Semibold"],
  [700, "Bold"],
];

export type ShadowKind = "none" | "soft" | "strong";
export type BorderStyle = "solid" | "dashed" | "dotted";
export type TextAlign = "left" | "center" | "right";

/** Per-element style (stored on the node as `s`). Every field is optional; unset = the element's default look. */
export interface NodeStyle {
  fill?: string;
  border?: string;
  borderW?: number;
  borderStyle?: BorderStyle;
  radius?: number;
  opacity?: number; // 0.1–1
  shadow?: ShadowKind;
  font?: FontFamily;
  fontSize?: number;
  weight?: number;
  lh?: number; // line height multiplier
  ls?: number; // letter spacing, px
  color?: string;
  align?: TextAlign;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  pad?: number;
  /** Block icon override (key of lib/icons ICONS). */
  icon?: string;
  /** Accent colour: an optional override of the family colour (glyph, bar, disc). */
  accent?: string;
  /** Hide this block's number (People / Money views). */
  hideNum?: boolean;
}

export type EdgePath = "curve" | "straight" | "elbow";
export type EdgeDash = "solid" | "dashed" | "dotted" | "dashdot";
export type EdgeArrow = "none" | "end" | "both";
export type EdgeKind = "flow" | "skip" | "nodata";

/** Per-connection style (stored on the edge as `s`). Presentation only: share %, port and flow maths are unchanged. */
export interface EdgeStyle {
  path?: EdgePath;
  dash?: EdgeDash;
  color?: string;
  width?: number;
  arrow?: EdgeArrow;
  arrowSize?: "sm" | "md" | "lg";
  /** skip = an indirect / skipped step (drawn dashed); nodata = no tracking data (numbers hidden on the line). */
  kind?: EdgeKind;
  label?: string;
  /** Line opacity 0.1–1 (1 = solid). */
  opacity?: number;
  /** Also show the conversion % (people who move on ÷ people who arrive at the source block) / the revenue that flows through on the line label. */
  showPct?: boolean;
  showRev?: boolean;
  /** Semantic preset the line was given (Yes, No, Purchase, No thanks, Retargeting). Presentation only. */
  preset?: string;
}

/** Semantic connection presets: a label plus a look. Applying one only sets edge style; the maths is untouched. */
export const EDGE_PRESETS: Record<string, { label: string; style: Partial<EdgeStyle> }> = {
  yes: { label: "Yes", style: { label: "Yes", color: "#22C55E", preset: "yes" } },
  no: { label: "No", style: { label: "No", color: "#F97316", dash: "dashed", preset: "no" } },
  purchase: { label: "Purchase", style: { label: "Purchase", color: "#10B981", preset: "purchase" } },
  nothanks: { label: "No thanks", style: { label: "No thanks", color: "#94A3B8", dash: "dashed", preset: "nothanks" } },
  retarget: { label: "Retargeting", style: { label: "Retargeting", color: "#F97316", dash: "dotted", arrow: "end", preset: "retarget" } },
};

const SHADOWS: Record<ShadowKind, string> = {
  none: "none",
  soft: "0 1px 2px rgba(0,0,0,.25), 0 4px 12px rgba(0,0,0,.18)",
  strong: "0 2px 4px rgba(0,0,0,.3), 0 12px 28px rgba(0,0,0,.35)",
};

/** CSS for the element's box (fill, border, radius, opacity, shadow). */
export function boxCss(s: NodeStyle | undefined): CSSProperties {
  if (!s) return {};
  const c: CSSProperties = {};
  if (s.fill) c.background = s.fill;
  if (s.border || s.borderW != null || s.borderStyle) {
    if (s.border) c.borderColor = s.border;
    if (s.borderW != null) c.borderWidth = s.borderW;
    if (s.borderStyle) c.borderStyle = s.borderStyle;
  }
  if (s.radius != null) c.borderRadius = s.radius;
  if (s.opacity != null && s.opacity < 1) c.opacity = Math.max(0.1, s.opacity);
  if (s.shadow) c.boxShadow = SHADOWS[s.shadow];
  if (s.pad != null) c.padding = s.pad;
  return c;
}

/** CSS for the element's text. `defaultSize` is used when no font size is set. */
export function textCss(s: NodeStyle | undefined, size?: number): CSSProperties {
  const c: CSSProperties = {};
  const fs = s?.fontSize ?? size;
  if (fs) c.fontSize = fs;
  if (!s) return c;
  if (s.font) c.fontFamily = FONT_FAMILIES[s.font]?.css;
  if (s.weight) c.fontWeight = s.weight;
  if (s.lh) c.lineHeight = s.lh;
  if (s.ls != null) c.letterSpacing = `${s.ls}px`;
  if (s.color) c.color = s.color;
  if (s.align) c.textAlign = s.align;
  if (s.italic) c.fontStyle = "italic";
  const deco = [s.underline && "underline", s.strike && "line-through"].filter(Boolean).join(" ");
  if (deco) c.textDecoration = deco;
  return c;
}

export const DASH: Record<EdgeDash, string | undefined> = { solid: undefined, dashed: "8 6", dotted: "2 5", dashdot: "9 4 2 4" };
export const ARROW_SIZE = { sm: 6, md: 9, lg: 13 } as const;

/** Effective edge look: explicit style wins; "skip" defaults to dotted and "nodata" to dash-dot grey (V2 line meanings). */
export function edgeLook(s: EdgeStyle | undefined) {
  const kind = s?.kind ?? "flow";
  const dash = s?.dash ?? (kind === "skip" ? "dotted" : kind === "nodata" ? "dashdot" : undefined);
  return { kind, path: s?.path ?? "curve", dash, color: s?.color, width: s?.width, arrow: s?.arrow ?? "none", arrowSize: ARROW_SIZE[s?.arrowSize ?? "md"], label: s?.label?.trim() || "", opacity: s?.opacity != null && s.opacity < 1 ? Math.max(0.1, s.opacity) : undefined, showPct: !!s?.showPct, showRev: !!s?.showRev };
}

/** Drop keys whose value is undefined/empty so stored styles stay small (and "reset" really resets). */
export function cleanStyle<T extends object>(s: T): T | undefined {
  const out = Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined && v !== "" && v !== null)) as T;
  return Object.keys(out).length ? out : undefined;
}

/* ---------------- shape geometry (canvas + export) ---------------- */
export interface ShapeGeom {
  /** Path in the element's own box (0,0)–(w,h). */
  d: string;
  /** Open path: stroke only (lines and arrows). */
  open: boolean;
  /** Arrow head polygon points, if any. */
  head?: string;
}
/** Geometry for the SVG-drawn shapes: callouts, lines and arrows. Others are boxes / ellipses / diamonds. */
export function shapeGeom(kind: string, w: number, h: number, dir = "h", sw = 2): ShapeGeom | null {
  if (kind === "callout") {
    const r = Math.min(14, w / 4, h / 4),
      bh = h * 0.78,
      tx = Math.min(w * 0.22, 60);
    const d = `M${r} 0H${w - r}Q${w} 0 ${w} ${r}V${bh - r}Q${w} ${bh} ${w - r} ${bh}H${tx + 26}L${tx} ${h}L${tx + 8} ${bh}H${r}Q0 ${bh} 0 ${bh - r}V${r}Q0 0 ${r} 0Z`;
    return { d, open: false };
  }
  if (kind === "line" || kind === "arrow") {
    const m = sw / 2 + 1;
    const [x1, y1, x2, y2] =
      dir === "v" ? [w / 2, m, w / 2, h - m] : dir === "d1" ? [m, m, w - m, h - m] : dir === "d2" ? [m, h - m, w - m, m] : [m, h / 2, w - m, h / 2];
    if (kind === "line") return { d: `M${r2(x1)} ${r2(y1)}L${r2(x2)} ${r2(y2)}`, open: true };
    const a = Math.atan2(y2 - y1, x2 - x1),
      L = Math.max(10, sw * 4.5),
      W = L * 0.55;
    const bx = x2 - Math.cos(a) * L,
      by = y2 - Math.sin(a) * L;
    const head = [
      [x2, y2],
      [bx + Math.sin(a) * W, by - Math.cos(a) * W],
      [bx - Math.sin(a) * W, by + Math.cos(a) * W],
    ]
      .map(([x, y]) => `${r2(x)},${r2(y)}`)
      .join(" ");
    return { d: `M${r2(x1)} ${r2(y1)}L${r2(bx)} ${r2(by)}`, open: true, head };
  }
  return null;
}
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Built-in quick styles (Style tab, context menu). `style` replaces the block's style; Default clears it. */
export const QUICK_STYLES: { key: string; label: string; style: NodeStyle | null }[] = [
  { key: "default", label: "Default", style: null },
  { key: "emphasis", label: "Emphasis", style: { border: "#10B981", borderW: 2, shadow: "soft" } },
  { key: "muted", label: "Muted", style: { opacity: 0.6, color: "#94A3B8" } },
  { key: "offer", label: "Offer", style: { border: "#FB923C", borderW: 2 } },
  { key: "warning", label: "Warning", style: { border: "#FBBF24", borderW: 2, borderStyle: "dashed" } },
  { key: "ghost", label: "L2F Ghost", style: { fill: "transparent", border: "#10B981", borderW: 1, borderStyle: "dashed", opacity: 0.9 } },
];
