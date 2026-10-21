// Strongly typed funnel graph + settings, with Zod validation for anything loaded from the DB or a file.
import { z } from "zod";
import { defaultsFor, isBlockType, type NodeParams } from "./catalog";
import type { EdgeStyle, NodeStyle } from "./style";

/* ---------------- currencies ---------------- */
export const CURRENCIES = {
  GBP: { symbol: "£", label: "£ GBP" },
  USD: { symbol: "$", label: "$ USD" },
  EUR: { symbol: "€", label: "€ EUR" },
  CAD: { symbol: "CA$", label: "CA$ CAD" },
  AUD: { symbol: "A$", label: "A$ AUD" },
  INR: { symbol: "₹", label: "₹ INR" },
  PKR: { symbol: "Rs ", label: "Rs PKR" },
  AED: { symbol: "AED ", label: "AED" },
} as const;
export type CurrencyCode = keyof typeof CURRENCIES;
export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];
export const isCurrency = (c: unknown): c is CurrencyCode => typeof c === "string" && c in CURRENCIES;
/** Map a prototype currency symbol ("£", "Rs ") to a code. */
export function currencyFromSymbol(sym: unknown): CurrencyCode {
  if (isCurrency(sym)) return sym;
  const s = String(sym ?? "").trim();
  const hit = CURRENCY_CODES.find((c) => CURRENCIES[c].symbol.trim() === s);
  return hit ?? "GBP";
}

/* ---------------- graph ---------------- */
const finite = z.number().finite();

export const checklistItemSchema = z.object({
  id: z.string(),
  text: z.string().default(""),
  done: z.boolean().default(false),
  /** Indentation level 0–3. */
  indent: z.number().int().min(0).max(3).optional(),
});
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

export const nodeSchema = z.object({
  id: z.string().min(1),
  type: z.string(),
  name: z.string().default(""),
  x: finite.default(0),
  y: finite.default(0),
  w: finite.optional(),
  h: finite.optional(),
  url: z.string().optional(),
  desc: z.string().optional(),
  /** Screenshot of the page (public Storage URL). */
  shot: z.string().optional(),
  p: z.record(z.string(), z.unknown()).default({}),
  /** Visual style (lib/style.ts NodeStyle). */
  s: z.record(z.string(), z.unknown()).optional(),
  /** Locked: can't be moved, resized or deleted until unlocked. */
  locked: z.boolean().optional(),
  /** Layer order (higher draws on top). */
  z: finite.optional(),
  /** Element-level checklist (internal: never shown on share links). */
  checklist: z.array(checklistItemSchema).optional(),
  /** Build status of a funnel step (published / completion reporting). Absent = planned. */
  status: z.enum(["planned", "building", "done"]).optional(),
});
export const STEP_STATUSES = [
  ["planned", "Planned"],
  ["building", "In progress"],
  ["done", "Live / done"],
] as const;
export type StepStatus = (typeof STEP_STATUSES)[number][0];

/** The four sides a connection can leave or enter a block by (V2 four ports). Geometry only; `port` keeps the meaning. */
export const SIDES = ["top", "right", "bottom", "left"] as const;
export type Side = (typeof SIDES)[number];

export const edgeSchema = z.object({
  id: z.string().min(1),
  from: z.string(),
  to: z.string(),
  share: finite.default(100),
  port: z.enum(["main", "alt"]).default("main"),
  /** Side it leaves the source by / enters the target by. Absent on older maps: right (or bottom for "alt") into left. */
  sh: z.enum(SIDES).optional(),
  th: z.enum(SIDES).optional(),
  /** Visual style (lib/style.ts EdgeStyle). */
  s: z.record(z.string(), z.unknown()).optional(),
});

export const viewSchema = z.object({ x: finite, y: finite, k: finite.positive() });

export const graphSchema = z.object({
  nodes: z.array(nodeSchema).default([]),
  edges: z.array(edgeSchema).default([]),
  view: viewSchema.default({ x: 60, y: 40, k: 1 }),
});

export interface FunnelNode {
  id: string;
  type: string;
  name: string;
  x: number;
  y: number;
  /** Frame size. */
  w?: number;
  h?: number;
  url?: string;
  desc?: string;
  shot?: string;
  p: NodeParams;
  s?: NodeStyle;
  locked?: boolean;
  z?: number;
  checklist?: ChecklistItem[];
  status?: StepStatus;
}
export interface FunnelEdge {
  id: string;
  from: string;
  to: string;
  /** Percentage (0–100) of the source group sent this way. */
  share: number;
  /** main = converted / Yes / A; alt = didn't convert / No / B. The maths read only this (never the side). */
  port: "main" | "alt";
  /** Sides of the four ports the line uses (geometry only). */
  sh?: Side;
  th?: Side;
  s?: EdgeStyle;
}
export interface Viewport {
  x: number;
  y: number;
  k: number;
}
export interface FunnelGraph {
  nodes: FunnelNode[];
  edges: FunnelEdge[];
  view: Viewport;
}

/* ---------------- settings ---------------- */
export const expenseSchema = z.object({
  id: z.string(),
  name: z.string().default(""),
  /** one_time: launch/setup cost; monthly: recurring each period; per_sale: per order. */
  kind: z.enum(["one_time", "monthly", "per_sale"]).default("monthly"),
  amount: finite.default(0),
  category: z.string().default("Other"),
});
export type Expense = z.infer<typeof expenseSchema>;

export const whatifSchema = z.object({
  traffic: finite.default(1),
  conv: finite.default(1),
  /** Multiplies every offer price (scenarios, goal seek). */
  price: finite.default(1),
  /** Multiplies the cost of paid traffic (CPC/CPM/budget per visitor). */
  cost: finite.default(1),
});
export type WhatIf = z.infer<typeof whatifSchema>;

const isNeutral = (w: WhatIf) => w.traffic === 1 && w.conv === 1 && w.price === 1 && w.cost === 1;

export const SCENARIO_KINDS = ["conservative", "expected", "best", "custom"] as const;
export const scenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Conservative / Expected / Best case, or a custom set of assumptions. */
  kind: z.enum(SCENARIO_KINDS).optional(),
  whatif: whatifSchema,
  fixed: finite.optional(),
});
export type Scenario = z.infer<typeof scenarioSchema>;

export const projectionSchema = z.object({
  months: z.number().int().min(1).max(60).default(12),
  /** Monthly traffic growth, % (can be negative). */
  growth: finite.default(0),
});

export const GOAL_KINDS = ["revenue", "profit", "traffic", "customers", "leads", "step", "conversion"] as const;
export const GOAL_PERIODS = ["day", "week", "month", "year"] as const;
export const goalSchema = z.object({
  id: z.string(),
  name: z.string().default(""),
  /** Target revenue / profit / traffic / customers / leads / step completions in the selected period, or a step's conversion rate (%). */
  kind: z.enum(GOAL_KINDS).default("revenue"),
  value: finite.default(0),
  /** Existing goals default to monthly, preserving their saved target meaning. */
  period: z.enum(GOAL_PERIODS).default("month"),
  /** The funnel step the goal belongs to (required for step and conversion goals). */
  nodeId: z.string().optional(),
});
export type Goal = z.infer<typeof goalSchema>;

/** Canvas-level notes (rich text). Internal unless `shared` is switched on. */
export const notesSchema = z.object({ body: z.string().max(100_000).default(""), shared: z.boolean().default(false) });

export const settingsSchema = z.object({
  basis: z.enum(["first", "ltv"]).default("first"),
  fixed: finite.default(0),
  whatif: whatifSchema.default({ traffic: 1, conv: 1, price: 1, cost: 1 }),
  target: finite.default(0),
  currency: z.string().default("GBP").transform((c) => currencyFromSymbol(c)),
  expenses: z.array(expenseSchema).default([]),
  // Owner decision (V2): Baseline is the current map, so an "Expected" scenario that equals the map is merged into it.
  // One with its own assumptions stays as a real scenario.
  scenarios: z
    .array(scenarioSchema)
    .default([])
    .transform((list) => list.filter((sc) => !(isNeutral(sc.whatif) && sc.fixed == null && (sc.kind === "expected" || sc.name.trim().toLowerCase() === "expected")))),
  projection: projectionSchema.default({ months: 12, growth: 0 }),
  /** Hide numbers on the public share page. */
  hideNumbers: z.boolean().default(false),
  /** Named goals (reports: required numbers, progress). */
  goals: z.array(goalSchema).default([]),
  /** Canvas-level notes. */
  notes: notesSchema.default({ body: "", shared: false }),
  /** Traffic reinvestment report: share of profit put back into ads each month. */
  reinvest: z.object({ pct: finite.min(0).max(100).default(0), months: z.number().int().min(1).max(60).default(12) }).default({ pct: 0, months: 12 }),
});
export type FunnelSettings = z.output<typeof settingsSchema>;

export const blankGraph = (): FunnelGraph => ({ nodes: [], edges: [], view: { x: 60, y: 40, k: 1 } });
export const blankSettings = (currency: CurrencyCode = "GBP"): FunnelSettings => settingsSchema.parse({ currency });

/* ---------------- normalisation ---------------- */
/** Drop unknown block types, merge type defaults into params, drop dangling edges. Mirrors the prototype's openFunnel(). */
export function normalizeGraph(g: z.input<typeof graphSchema>): FunnelGraph {
  const parsed = graphSchema.parse(g);
  const nodes: FunnelNode[] = parsed.nodes
    .filter((n) => isBlockType(n.type))
    .map((n) => ({ ...n, p: { ...defaultsFor(n.type), ...(n.p as NodeParams) } }));
  const ids = new Set(nodes.map((n) => n.id));
  const edges = parsed.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  return { nodes, edges, view: parsed.view };
}

export function parseGraph(raw: unknown): FunnelGraph {
  return normalizeGraph((raw ?? {}) as z.input<typeof graphSchema>);
}
export function parseSettings(raw: unknown): FunnelSettings {
  return settingsSchema.parse(raw ?? {});
}

/* ---------------- import / export file format ---------------- */
/**
 * Accepts:
 *  - Funnel Mapper Pro exports: { app: "funnel-mapper-pro", name, graph, settings }
 *  - Prototype exports: { v:2, name, cur, basis, fixed, whatif, target, nodes, edges, view, app:"funnel-mapper" }
 *  - Prototype v1 edges using `no: true` instead of `port: "alt"`.
 */
const protoEdge = z
  .object({ id: z.string().optional(), from: z.string(), to: z.string(), share: z.number().optional(), port: z.string().optional(), no: z.boolean().optional() })
  .passthrough();

export interface ImportedFunnel {
  name: string;
  description?: string;
  graph: FunnelGraph;
  settings: FunnelSettings;
}

export function importFunnelFile(raw: unknown): ImportedFunnel {
  if (!raw || typeof raw !== "object") throw new Error("That file isn’t a Funnel Mapper .json file");
  const d = raw as Record<string, unknown>;
  if (d.graph && typeof d.graph === "object") {
    return {
      name: String(d.name ?? "Imported funnel"),
      description: typeof d.description === "string" ? d.description : undefined,
      graph: parseGraph(d.graph),
      settings: parseSettings(d.settings),
    };
  }
  if (!Array.isArray(d.nodes)) throw new Error("That file isn’t a Funnel Mapper .json file");
  let n = 0;
  const edges = z
    .array(protoEdge)
    .parse(d.edges ?? [])
    .map((e) => ({
      id: e.id ?? `e-imp-${n++}`,
      from: e.from,
      to: e.to,
      share: e.share ?? 100,
      port: (e.port === "alt" || e.no ? "alt" : "main") as "main" | "alt",
    }));
  const view = viewSchema.safeParse(d.view);
  return {
    name: String(d.name ?? "Imported funnel"),
    graph: normalizeGraph({ nodes: d.nodes as z.input<typeof nodeSchema>[], edges, view: view.success ? view.data : undefined }),
    settings: parseSettings({
      basis: d.basis,
      fixed: typeof d.fixed === "number" ? d.fixed : 0,
      whatif: d.whatif,
      target: typeof d.target === "number" ? d.target : 0,
      currency: currencyFromSymbol(d.cur),
    }),
  };
}

export function exportFunnelFile(f: { name: string; description?: string | null; graph: FunnelGraph; settings: FunnelSettings }) {
  return { app: "funnel-mapper-pro", v: 3, name: f.name, description: f.description ?? "", graph: f.graph, settings: f.settings };
}
