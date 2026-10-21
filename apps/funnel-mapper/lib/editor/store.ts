"use client";
// Editor state (Zustand). Holds the funnel graph + settings, selection, undo/redo history and view options.
// All maths comes from lib/funnel-math; this file only orchestrates state.
import { create } from "zustand";
import { blockH, blockPivot, picRect, DEFAULT_SIZE, defaultsFor, fourPorts, retypeTargets, FRAME_COLORS, isAnnot, nodeW, NH, portsFor, SIZED_TYPES, typeOf, canReceive, type NodeParams } from "../catalog";
import { compute, periodFactor, warnNodeIds, type FunnelResult } from "../funnel-math";
import { monthRange, rangeLabel, rangeScale, type DateRange } from "../range";
import { NEUTRAL_WHATIF } from "../scenario-label";
import type { ActualRowDb } from "../schemas";
import type { ChecklistItem, FunnelEdge, FunnelGraph, FunnelNode, FunnelSettings, Side, Viewport } from "../graph";
import { tidyLayout } from "../layout";
import { knobsOf, type SimBase } from "../simulate";
import { actualResult, actualsInRange } from "../actual-result";
import { cleanStyle, type EdgeStyle, type NodeStyle } from "../style";

export type ReportTab = "math" | "steps" | "sources" | "plan" | "costs" | "scenarios" | "forecast" | "actuals";
export type SidePanel = "inspector" | "versions" | "comments" | "notes" | "simulate";
export type InspTab = "details" | "style" | "plan" | "analytics";
export type EditorMode = "map" | "reports";
export type ReportSection = "overview" | "data" | "sources" | "offers" | "expenses" | "scenarios" | "forecast" | "goals" | "mrr" | "monthly" | "reinvest" | "status";
export type SaveStatus = "saved" | "dirty" | "saving" | "offline" | "error" | "readonly";

/** The three map views (editor-calm brief): Clean = names, types and lines only; People (default) = one people number per block and one rate per line; Money = one money number per block (revenue on offers, spend on sources) and the same rates. */
export type MapView = "clean" | "people" | "money";

export interface ViewOpts {
  /** Which of the three views the map shows. `nums` and `thick` below follow it (kept so exports, Present and the simulation read one switch). */
  view: MapView;
  /** Numbers on blocks and connections (every view but Clean). */
  nums: boolean;
  /** Line thickness shows people (every view but Clean). */
  thick: boolean;
  /** Layers: sticky notes and internal-note badges. */
  notes: boolean;
  /** Layers: checklist elements and checklist badges. */
  checks: boolean;
  /** Older "numbers per day / week / month / year" choice. The calendar range below replaces it; kept so saved options still load. */
  period: "day" | "week" | "month" | "year";
  /** The calendar range the Plan numbers cover (null = this calendar month). Actual mode shows the real entries for the same dates. */
  range: DateRange | null;
  /** Optional layer: each block shows its build status (planned, in progress, live); several selected blocks are set together. */
  build: boolean;
  /** Compare with Baseline: when a scenario is active, blocks and the strip show the change from Baseline (off by default). */
  compare: boolean;
  /** Background of exported map images (PNG / SVG). */
  bg: "light" | "dark" | "transparent";
  snap: boolean;
  mini: boolean;
  /** Desktop: block library / details panel collapsed so the canvas gets the space. */
  hideSide: boolean;
  hideInsp: boolean;
}

interface Snapshot {
  nodes: FunnelNode[];
  edges: FunnelEdge[];
  settings: FunnelSettings;
  name: string;
}

export interface StylePreset {
  id: string;
  name: string;
  style: NodeStyle;
}
/** A saved selection (blocks and the connections between them) that can be placed again in any funnel of the workspace. */
export interface WorkspaceBlock {
  id: string;
  name: string;
  nodes: FunnelNode[];
  edges: FunnelEdge[];
}

export interface ClientProduct {
  id: string;
  name: string;
  type: string;
  params: NodeParams;
}

/** Floating Quick Add: where it opened (screen px inside the canvas) and where the block goes (flow px). */
export interface QuickAddState {
  sx: number;
  sy: number;
  fx: number;
  fy: number;
  /** `fx`/`fy` is the exact point that was clicked: the new block's picture is centred on it (otherwise it is the block's top-left). */
  centre?: boolean;
  /** Opened by dragging a connection off a port into empty space: the new block lands at `fx/fy` (its in-port at that point) and is connected. */
  from?: { id: string; port: "main" | "alt"; sh?: Side };
  /** Opened from "Insert step on line": the block goes onto this connection. */
  edge?: string;
}

/** Right-click / long-press menu. Coordinates are client px. */
export interface MenuState {
  kind: "block" | "edge" | "selection" | "pane";
  x: number;
  y: number;
  id?: string;
  /** Flow position under the pointer (pane menu: where "Add …" puts things). */
  fx?: number;
  fy?: number;
}

export interface EditorState {
  funnelId: string;
  clientId: string;
  name: string;
  nodes: FunnelNode[];
  edges: FunnelEdge[];
  view: Viewport;
  settings: FunnelSettings;
  R: FunnelResult;
  warnIds: Set<string>;
  /** The client's saved products (library "Client products" and Quick Add). */
  products: ClientProduct[];
  /** Actuals rows of this funnel (loaded on demand for Trend widgets). */
  actuals: ActualRowDb[] | null;
  /** Actual mode (F4): the map draws recorded actuals for this date range instead of the plan. */
  actualView: { start: string; end: string; label: string } | null;
  /** The recorded numbers for `actualView`, shaped like an engine result (lib/actual-result.ts). */
  actualR: FunnelResult | null;
  /** Left panel: block library, funnel outline or workspace blocks. */
  sideTab: "library" | "outline" | "blocks" | "templates" | "math";
  /** Saved style presets and blocks of this workspace (table workspace_assets). */
  stylePresets: StylePreset[];
  workspaceBlocks: WorkspaceBlock[];
  assetsStatus: "idle" | "loading" | "ready" | "error";
  /** Simulate: the map as it was when simulating started (null = not simulating). Everything shown as a change is live minus this. */
  simBase: SimBase | null;
  /** The block whose settings box is open (double-click or Enter on a selected block). */
  settingsBox: string | null;
  /** The "Enter numbers" dialog (Type it in, or Import CSV) opened from the Actual banner. */
  actualsEntry: "type" | "csv" | null;
  /** The funnel's own status (Draft / Proposed / Live / Archived) and how to change it; set can be null for viewers and share links. */
  funnelCtl: { status: string; set: ((status: string) => void) | null };
  /** The Baseline run (what-if levers at neutral) while Compare with Baseline is on and a scenario is active. */
  compareBase: SimBase | null;
  /** Simulate: the people-flow animation is running. */
  simPlay: boolean;
  /** Simulate: the map shows the baseline (before your changes) instead of now. */
  simBefore: boolean;
  /** Phone: tap blocks to add them to the selection. */
  selectMode: boolean;
  /** Presentation: the steps of the stage being shown (others dim). */
  stageIds: string[] | null;
  /** Open context menu. */
  menu: MenuState | null;
  /** Copied style (Copy style / Paste style / eyedropper). */
  styleClip: NodeStyle | null;
  /** Eyedropper armed: the next block clicked receives this block's style. */
  eyedrop: string | null;
  /** A canvas drag is in progress (the floating toolbar hides). */
  dragging: boolean;
  /** Reports → Funnel data: step to highlight ("Open in Reports"). */
  reportFocus: string | null;
  /** Change-type picker: the block it is open for. */
  typePicker: string | null;
  /** Block whose name is being edited on the canvas. */
  renaming: string | null;
  /** Block losing the most people (Performance map badge). */
  keyLeak: string | null;
  /** Measured DOM sizes (notes and headings grow with text); used by React Flow, layout and frame wrapping. */
  dims: Record<string, { width: number; height: number }>;
  selNodes: string[];
  selEdge: string | null;
  tab: ReportTab;
  panel: SidePanel;
  /** Element inspector tab, remembered across selections. */
  inspTab: InspTab;
  opts: ViewOpts;
  readOnly: boolean;
  saveStatus: SaveStatus;
  /** Bumped on every content change (not view); the saver watches it. */
  rev: number;
  viewRev: number;
  clip: { nodes: FunnelNode[]; edges: FunnelEdge[] } | null;
  past: Snapshot[];
  future: Snapshot[];
  committed: Snapshot | null;
  toast: { text: string; id: number; action?: string; run?: () => void } | null;
  /** Presentation mode: the block in focus (others dim). */
  spot: string | null;
  /** Opened through a public share link (no account features: versions, actuals, products). */
  shared: boolean;
  /** Floating quick-add: where it opened (screen px inside the canvas) and the flow position blocks go to. */
  quick: QuickAddState | null;
  /** Simulate: flow-dot speed, walk-through step, and the "keep or discard" question on leaving. */
  simSpeed: 1 | 2 | 4;
  simWalk: number | null;
  simAsk: boolean;
  /** "Connect as" menu for a line just drawn (screen px inside the canvas). */
  lineMenu: { id: string; sx: number; sy: number } | null;
  /** Workspace viewer: always read-only (the database refuses their writes too). */
  viewer: boolean;
  /** Map (canvas) or the full-width Reports view. */
  mode: EditorMode;
  section: ReportSection;
}

const OPTS_KEY = "fm-editor-opts";
const viewFlags = (view: MapView) => ({ view, nums: view !== "clean", thick: view !== "clean" });
const loadOpts = (): ViewOpts => {
  const d: ViewOpts = { ...viewFlags("people"), notes: true, checks: true, period: "month", range: null, compare: false, build: false, bg: "light", snap: true, mini: true, hideSide: false, hideInsp: true };
  try {
    const saved = JSON.parse(localStorage.getItem(OPTS_KEY) || "{}");
    // V2: below 1440px the library starts collapsed to the rail (it opens as an overlay); a saved choice wins
    if (saved.hideSide === undefined && window.innerWidth <= 1439) d.hideSide = true;
    // the view is the one switch: an older saved nums / thick pair (Clean / Performance) is ignored, People is the default
    const view: MapView = saved.view === "clean" || saved.view === "money" || saved.view === "people" ? saved.view : "people";
    return { ...d, ...saved, ...viewFlags(view) };
  } catch {
    return d;
  }
};

let uid = 1;
export const nid = () => "n" + Date.now().toString(36) + (uid++).toString(36);
const GRID = 10;

const blankResult = compute({ nodes: [], edges: [] }, { basis: "first", fixed: 0 });

export const useEditor = create<EditorState>(() => ({
  funnelId: "",
  clientId: "",
  name: "",
  nodes: [],
  edges: [],
  view: { x: 60, y: 40, k: 1 },
  settings: { basis: "first", fixed: 0, whatif: { traffic: 1, conv: 1, price: 1, cost: 1 }, target: 0, currency: "GBP", expenses: [], scenarios: [], projection: { months: 12, growth: 0 }, hideNumbers: false, goals: [], notes: { body: "", shared: false }, reinvest: { pct: 0, months: 12 } },
  R: blankResult,
  warnIds: new Set(),
  keyLeak: null,
  products: [],
  actuals: null,
  actualView: null,
  actualR: null,
  sideTab: "library",
  selectMode: false,
  stageIds: null,
  stylePresets: [],
  workspaceBlocks: [],
  assetsStatus: "idle",
  simBase: null,
  funnelCtl: { status: "draft", set: null },
  settingsBox: null,
  actualsEntry: null,
  compareBase: null,
  simPlay: false,
  simBefore: false,
  menu: null,
  typePicker: null,
  styleClip: null,
  eyedrop: null,
  dragging: false,
  reportFocus: null,
  renaming: null,
  dims: {},
  selNodes: [],
  selEdge: null,
  tab: "math",
  panel: "inspector",
  inspTab: "details",
  opts: { view: "people", nums: true, thick: true, notes: true, checks: true, period: "month", range: null, compare: false, build: false, bg: "light", snap: true, mini: true, hideSide: false, hideInsp: true },
  readOnly: false,
  saveStatus: "saved",
  rev: 0,
  viewRev: 0,
  clip: null,
  past: [],
  future: [],
  committed: null,
  toast: null,
  spot: null,
  shared: false,
  quick: null,
  simSpeed: 1,
  simWalk: null,
  simAsk: false,
  lineMenu: null,
  viewer: false,
  mode: "map",
  section: "overview",
}));

const get = () => useEditor.getState();
const set = useEditor.setState;

/* ---------------- internals ---------------- */
const snapshot = (s: EditorState = get()): Snapshot => ({ nodes: s.nodes, edges: s.edges, settings: s.settings, name: s.name });
/** The funnel's key leak: the page, offer or action that loses the most people (same ranking as lib/funnel-math leaks()). */
export function keyLeakOf(nodes: FunnelNode[], R: FunnelResult): string | null {
  let best: string | null = null,
    most = 0;
  for (const n of nodes) {
    if (!["page", "offer", "action"].includes(typeOf(n.type)?.cat)) continue;
    const r = R.N[n.id];
    if (r && r.inflow > 0 && r.non > most) {
      most = r.non;
      best = n.id;
    }
  }
  return best;
}
const isNeutral = (w: FunnelSettings["whatif"]) => w.traffic === 1 && w.conv === 1 && w.price === 1 && w.cost === 1;
/** Baseline run for "Compare with Baseline": the same map with the what-if levers at neutral. */
const compareOf = (nodes: FunnelNode[], edges: FunnelEdge[], settings: FunnelSettings): SimBase | null => {
  if (!get().opts.compare || isNeutral(settings.whatif)) return null;
  const base = { ...settings, whatif: { ...NEUTRAL_WHATIF } };
  return { R: compute({ nodes, edges }, base), nodes, edges, settings: base, at: Date.now() };
};
const recompute = (nodes: FunnelNode[], edges: FunnelEdge[], settings: FunnelSettings) => {
  const R = compute({ nodes, edges }, settings);
  return { R, warnIds: warnNodeIds({ nodes, edges }), keyLeak: keyLeakOf(nodes, R), compareBase: compareOf(nodes, edges, settings) };
};
export const snapV = (v: number) => (get().opts.snap ? Math.round(v / GRID) * GRID : Math.round(v));
// a funnel block always reserves its full footprint (picture + two-line name + subtype), whatever its name measures, so layouts are the same everywhere
export const heightOf = (n: FunnelNode) => (SIZED_TYPES.has(n.type) && n.h ? n.h : !isAnnot(n.type) ? blockH(n.type) : get().dims[n.id]?.height ?? (n.type === "label" ? 40 : NH));
export const widthOf = (n: FunnelNode) => n.w ?? get().dims[n.id]?.width ?? (n.type === "label" ? 300 : nodeW(n.type));

let histTimer: ReturnType<typeof setTimeout> | undefined;
function commitHistory() {
  clearTimeout(histTimer);
  histTimer = undefined;
  const s = get();
  const cur = snapshot(s);
  const c = s.committed;
  if (c && c.nodes === cur.nodes && c.edges === cur.edges && c.settings === cur.settings && c.name === cur.name) return;
  const past = c ? [...s.past, c].slice(-120) : s.past;
  set({ past, future: [], committed: cur });
}
/** Record a content change: bumps rev (autosave) and schedules a history commit (coalesces rapid edits, like typing). */
function touched() {
  set((s) => ({ rev: s.rev + 1, saveStatus: s.readOnly ? s.saveStatus : "dirty" }));
  clearTimeout(histTimer);
  histTimer = setTimeout(commitHistory, 350);
}

/**
 * Apply a content change. Continuous edits (typing, dragging) coalesce into one undo step after 350 ms of quiet;
 * `discrete` actions (add, delete, paste, connect, align, layout…) always get their own undo step.
 */
function apply(patch: Partial<Pick<EditorState, "nodes" | "edges" | "settings" | "name">>, opts: { math?: boolean; discrete?: boolean } = {}) {
  if (get().readOnly) return;
  if (opts.discrete) commitHistory();
  const s = get();
  const nodes = patch.nodes ?? s.nodes,
    edges = patch.edges ?? s.edges,
    settings = patch.settings ?? s.settings;
  const math = opts.math ?? true;
  set({ ...patch, ...(math ? recompute(nodes, edges, settings) : {}) });
  // Actual mode redraws the recorded numbers on the edited map
  const av = get().actualView;
  if (av && (patch.nodes || patch.edges)) setActualView(av);
  touched();
  if (opts.discrete) commitHistory();
}

export function showToast(text: string, action?: string, run?: () => void) {
  set({ toast: { text, id: Date.now(), ...(action && run ? { action, run } : {}) } });
}

/* ---------------- lifecycle ---------------- */
export function initEditor(p: { funnelId: string; clientId: string; name: string; graph: FunnelGraph; settings: FunnelSettings; readOnly?: boolean; shared?: boolean; viewer?: boolean }) {
  clearTimeout(histTimer);
  const snap = { nodes: p.graph.nodes, edges: p.graph.edges, settings: p.settings, name: p.name };
  set({
    funnelId: p.funnelId,
    clientId: p.clientId,
    name: p.name,
    nodes: p.graph.nodes,
    edges: p.graph.edges,
    view: p.graph.view,
    settings: p.settings,
    ...recompute(p.graph.nodes, p.graph.edges, p.settings),
    selNodes: [],
    selEdge: null,
    past: [],
    future: [],
    committed: snap,
    rev: 0,
    viewRev: 0,
    readOnly: !!p.readOnly || !!p.viewer,
    shared: !!p.shared,
    viewer: !!p.viewer,
    spot: null,
    saveStatus: p.readOnly ? "readonly" : "saved",
    opts: loadOpts(),
    dims: {},
    mode: "map",
    simBase: null,
    simPlay: false,
    simBefore: false,
    panel: "inspector",
  });
  set({ compareBase: compareOf(p.graph.nodes, p.graph.edges, p.settings) }); // Compare with Baseline may have been left on
}

/** Replace the whole graph/settings (version restore, import). Undoable. */
export function replaceContent(graph: Pick<FunnelGraph, "nodes" | "edges">, settings?: FunnelSettings, name?: string) {
  commitHistory();
  apply({ nodes: graph.nodes, edges: graph.edges, settings: settings ?? get().settings, ...(name != null ? { name } : {}) }, { discrete: true });
  set({ selNodes: [], selEdge: null });
  commitHistory();
}

/* ---------------- block settings box ---------------- */
type BoxSnap = Pick<FunnelNode, "p" | "name" | "s" | "desc" | "url" | "checklist" | "type">;
let boxSnap: { id: string; snap: BoxSnap } | null = null;
/** Open the settings box of one block (not for notes, shapes or widgets). Remembers how the block was, so Esc can put it back. */
export function openSettingsBox(id: string) {
  const n = get().nodes.find((x) => x.id === id);
  if (!n || isAnnot(n.type) || n.type === "widget") return;
  boxSnap = { id, snap: { p: { ...n.p }, name: n.name, s: n.s ? { ...n.s } : undefined, desc: n.desc, url: n.url, checklist: n.checklist ? n.checklist.map((c) => ({ ...c })) : undefined, type: n.type } };
  set({ settingsBox: id, selNodes: [id], selEdge: null });
}
/** Close the settings box. `revert` puts the block back as it was when the box opened (Esc); Enter and clicking away keep the edits. */
export function closeSettingsBox(revert = false) {
  const b = boxSnap;
  boxSnap = null;
  if (revert && b && !get().readOnly) {
    // the type is never changed by a revert (a page type change is its own undo step)
    apply({ nodes: get().nodes.map((x) => (x.id === b.id ? { ...x, p: b.snap.p, name: b.snap.name, s: b.snap.s, desc: b.snap.desc, url: b.snap.url, checklist: b.snap.checklist } : x)) });
  }
  set({ settingsBox: null });
}

/* ---------------- history ---------------- */
export function undo() {
  commitHistory();
  const s = get();
  if (!s.past.length || !s.committed) return;
  const prev = s.past[s.past.length - 1];
  set({ past: s.past.slice(0, -1), future: [s.committed, ...s.future], committed: prev, nodes: prev.nodes, edges: prev.edges, settings: prev.settings, name: prev.name, ...recompute(prev.nodes, prev.edges, prev.settings), selNodes: [], selEdge: null });
  set((x) => ({ rev: x.rev + 1, saveStatus: "dirty" }));
}
export function redo() {
  commitHistory();
  const s = get();
  if (!s.future.length) return;
  const next = s.future[0];
  set({ future: s.future.slice(1), past: s.committed ? [...s.past, s.committed] : s.past, committed: next, nodes: next.nodes, edges: next.edges, settings: next.settings, name: next.name, ...recompute(next.nodes, next.edges, next.settings), selNodes: [], selEdge: null });
  set((x) => ({ rev: x.rev + 1, saveStatus: "dirty" }));
}

/* ---------------- selection ---------------- */
export function selectNodes(ids: string[]) {
  set({ selNodes: ids, selEdge: null });
}
export function selectEdge(id: string | null) {
  set({ selEdge: id, selNodes: [] });
}
export function clearSelection() {
  set({ selNodes: [], selEdge: null });
}
export function setTab(tab: ReportTab) {
  set({ tab, panel: "inspector", mode: "map", selNodes: [], selEdge: null });
}
export function openQuickAdd(q: EditorState["quick"]) {
  if (get().readOnly) return;
  set({ quick: q });
}
export function closeQuickAdd() {
  set({ quick: null });
}
export function openLineMenu(m: EditorState["lineMenu"]) {
  if (get().readOnly) return;
  set({ lineMenu: m });
}
export function closeLineMenu() {
  set({ lineMenu: null });
}
export function setActuals(actuals: ActualRowDb[] | null) {
  set({ actuals });
  const v = get().actualView;
  if (v) setActualView(v);
}
/** Add a widget at (x, y). Scope "frame" needs the frame's id, "selection" the steps it covers. */
export function addWidget(cfg: { scope: "funnel" | "frame" | "selection"; frameId?: string; nodeIds?: string[]; display?: "number" | "trend" | "chart"; metrics?: string[]; wsize?: "S" | "M" | "L" }, x: number, y: number) {
  return addNode("widget", x, y, { p: { ...cfg, metrics: cfg.metrics ?? ["revenue", "profit"] }, name: cfg.scope === "frame" ? "Stage widget" : cfg.scope === "selection" ? "Selection widget" : "Funnel widget" });
}
export function setSideTab(sideTab: EditorState["sideTab"]) {
  set({ sideTab });
  setOpt("hideSide", false);
}
/* ---------------- simulate ---------------- */
const takeBase = (): SimBase => {
  const s = get();
  return { R: s.R, nodes: s.nodes, edges: s.edges, settings: s.settings, at: Date.now() };
};
/** Start simulating: remember the map as it is now and show it as a Performance map, so every change reads against it. */
export function startSim() {
  const s = get();
  if (s.readOnly || s.shared) return;
  if (s.actualView) set({ actualView: null, actualR: null });
  set({ simBase: { ...takeBase(), prev: { view: s.opts.view, nums: s.opts.nums, thick: s.opts.thick, period: s.opts.period }, vs: null }, simPlay: false, simBefore: false, simWalk: null, simAsk: false, panel: "simulate" });
  if (s.opts.view === "clean") setMapView("people"); // changes read against the baseline, so the numbers have to show
}
/** Stop simulating and keep whatever the map says now; the view (layers, period) goes back to what it was. */
export function stopSim() {
  const prev = get().simBase?.prev;
  set((s) => ({ simBase: null, simPlay: false, simBefore: false, simWalk: null, simAsk: false, spot: s.simWalk != null ? null : s.spot, panel: s.panel === "simulate" ? "inspector" : s.panel }));
  if (prev) {
    setMapView(prev.view);
    setOpt("period", prev.period);
  }
}
const sameWhatif = (a: FunnelSettings["whatif"], b: FunnelSettings["whatif"]) => (["traffic", "conv", "price", "cost"] as const).every((k) => Math.abs((Number(a[k]) || 1) - (Number(b[k]) || 1)) < 1e-9);
/** The what-if levers moved since simulating started and the result isn't saved as a scenario yet. */
export function simUnsaved(s: Pick<EditorState, "simBase" | "settings"> = get()) {
  const b = s.simBase;
  if (!b || sameWhatif(s.settings.whatif, b.settings.whatif)) return false;
  return !s.settings.scenarios.some((sc) => sameWhatif(sc.whatif, s.settings.whatif));
}
/** Leave Simulate (S, Esc or the toggle). Unsaved what-if changes ask once: keep as a scenario, or discard. */
export function leaveSim() {
  if (!get().simBase) return;
  if (simUnsaved()) return set({ simAsk: true });
  stopSim();
}
/** Keep the what-if as a named scenario; the map goes back to its baseline numbers. Block edits stay on the map. */
export function keepSimAsScenario(name: string) {
  const s = get(),
    b = s.simBase;
  if (!b) return;
  const n = (name.trim() || `Simulation ${s.settings.scenarios.length + 1}`).slice(0, 60);
  setSettings({ scenarios: [...s.settings.scenarios, { id: nid(), name: n, kind: "custom", whatif: { ...s.settings.whatif } }], whatif: { ...b.settings.whatif } });
  stopSim();
  showToast(`Saved as scenario “${n}”`);
}
/** Discard every change made while simulating (levers and block assumptions), then leave. One undo step. */
export function discardSim() {
  revertSim();
  stopSim();
}
/** Compare with the baseline (current map) or with a saved scenario. The comparison is the engine's own run. */
export function setSimVs(scenarioId: string | null) {
  const s = get(),
    b = s.simBase;
  if (!b) return;
  const sc = scenarioId ? s.settings.scenarios.find((x) => x.id === scenarioId) : undefined;
  const settings = sc ? { ...b.settings, whatif: { ...sc.whatif } } : b.settings;
  set({ simBase: { ...b, vs: sc ? sc.id : null, R: compute({ nodes: b.nodes, edges: b.edges }, settings) } });
}
export function setSimSpeed(simSpeed: 1 | 2 | 4) {
  set({ simSpeed });
}
/** Walk-through: step through the funnel one stage at a time (the others dim). null ends it. */
export function setSimWalk(i: number | null) {
  const s = get();
  const order = s.R.order.filter((id) => s.nodes.some((n) => n.id === id && !isAnnot(n.type)));
  if (i == null || !order.length) return set({ simWalk: null, spot: null });
  const k = Math.max(0, Math.min(order.length - 1, i));
  set({ simWalk: k, spot: order[k] });
}
export function setSimPlay(simPlay: boolean) {
  set({ simPlay });
}
export function setSimBefore(simBefore: boolean) {
  set({ simBefore: simBefore && !!get().simBase });
}
/** The results the map draws: the live run, or the baseline while "Before" is on in Simulate. */
export const shownR = (s: Pick<EditorState, "R" | "simBase" | "simBefore"> & Partial<Pick<EditorState, "actualR">>): FunnelResult => s.actualR ?? (s.simBefore && s.simBase ? s.simBase.R : s.R);
/** Model | Actual on the map. Actual draws the recorded numbers for the range (never changes the plan or the engine). */
export function setActualView(v: EditorState["actualView"]) {
  const s = get();
  if (!v) return set({ actualView: null, actualR: null });
  const rows = actualsInRange(s.actuals ?? [], v.start, v.end);
  set({ actualView: v, actualR: actualResult({ nodes: s.nodes, edges: s.edges }, s.settings, rows) });
}
/** Use the map as it is now as the new "before". */
export function rebaseSim() {
  if (get().simBase) set({ simBase: takeBase() });
}
const restoreKnobs = (n: FunnelNode, b: FunnelNode, only?: string) => {
  const p = { ...n.p };
  for (const k of [...knobsOf(n), ...knobsOf(b)]) {
    if (only && k.key !== only) continue;
    if (b.p[k.key] === undefined) delete p[k.key];
    else p[k.key] = b.p[k.key];
  }
  return { ...n, p };
};
/** Put the assumptions back as they were: the four levers and every block assumption (rates, prices, spend). Layout and new blocks stay. One undo step. */
export function revertSim(id?: string, key?: string) {
  const s = get(),
    b = s.simBase;
  if (!b || s.readOnly) return;
  const was = new Map(b.nodes.map((n) => [n.id, n]));
  const nodes = s.nodes.map((n) => (was.has(n.id) && (!id || id === n.id) ? restoreKnobs(n, was.get(n.id)!, key) : n));
  apply({ nodes, ...(id ? {} : { settings: { ...s.settings, whatif: b.settings.whatif } }) }, { discrete: true });
}
export function setAssets(a: { stylePresets?: StylePreset[]; workspaceBlocks?: WorkspaceBlock[]; assetsStatus?: EditorState["assetsStatus"] }) {
  set(a);
}
/** Place a saved group of blocks (workspace block) with fresh ids, its top-left at (x, y). One undo step; the copy is selected. */
export function insertSnippet(snip: { nodes: FunnelNode[]; edges: FunnelEdge[] }, x: number, y: number) {
  if (get().readOnly || !snip.nodes.length) return;
  const ox = Math.min(...snip.nodes.map((n) => n.x)),
    oy = Math.min(...snip.nodes.map((n) => n.y));
  const c = cloneSet(
    snip.nodes.map((n) => n.id),
    snapV(x) - ox,
    snapV(y) - oy,
    snip,
  );
  apply({ nodes: [...get().nodes, ...c.nodes], edges: [...get().edges, ...c.edges] }, { discrete: true });
  selectNodes(c.nodes.map((n) => n.id));
}
export function setProducts(products: ClientProduct[]) {
  set({ products });
}
/** Switch the block and close the picker, with a toast that offers Undo (one undo step). */
export function closeTypePickerAndRetype(id: string, type: string) {
  const ok = retypeNode(id, type);
  set({ typePicker: null });
  if (ok) showToast(`Changed to ${typeOf(type).label}`, "Undo", undo);
}
export function openTypePicker(typePicker: string | null) {
  set({ typePicker });
}
/** Tidy only the selected flow blocks among themselves; the group keeps its top-left corner. One undo step. */
export function tidySelection() {
  const s = get();
  const ids = new Set(s.selNodes);
  const sel = s.nodes.filter((n) => ids.has(n.id) && !n.locked && !isAnnot(n.type));
  if (sel.length < 2 || s.readOnly) return showToast("Select two or more blocks to tidy");
  const laid = tidyLayout(sel, s.edges.filter((e) => ids.has(e.from) && ids.has(e.to)), { heightOf, widthOf, snap: s.opts.snap });
  const ox = Math.min(...sel.map((n) => n.x)) - Math.min(...laid.map((n) => n.x));
  const oy = Math.min(...sel.map((n) => n.y)) - Math.min(...laid.map((n) => n.y));
  moveNodes(Object.fromEntries(laid.map((n) => [n.id, { x: snapV(n.x + ox), y: snapV(n.y + oy) }])), { discrete: true });
}
export function openMenu(menu: MenuState | null) {
  set({ menu });
}
export function setDragging(dragging: boolean) {
  if (get().dragging !== dragging) set({ dragging });
}
export function setReportFocus(reportFocus: string | null) {
  set({ reportFocus });
}
export function startRename(id: string | null) {
  if (id && (get().readOnly || get().nodes.find((n) => n.id === id)?.locked)) return;
  set({ renaming: id });
}
export function setMode(mode: EditorMode) {
  set({ mode });
}
export function setSection(section: ReportSection) {
  set({ section, mode: "reports" });
}
export function setPanel(panel: SidePanel) {
  set({ panel });
}
export function setInspTab(inspTab: InspTab) {
  set({ inspTab });
}

/* ---------------- nodes ---------------- */
export function addNode(type: string, x: number, y: number, extra: { p?: NodeParams; name?: string; desc?: string; w?: number; h?: number } = {}) {
  const T = typeOf(type);
  if (!T) return null;
  const n: FunnelNode = { id: nid(), type, name: extra.name ?? T.label, x: snapV(x), y: snapV(y), p: { ...defaultsFor(type), ...(extra.p ?? {}) }, ...(extra.desc ? { desc: extra.desc } : {}) };
  if (type === "frame") n.name = "Stage";
  const size = DEFAULT_SIZE[type];
  if (size) Object.assign(n, size);
  if (typeof extra.w === "number" && extra.w > 0) n.w = extra.w;
  if (typeof extra.h === "number" && extra.h > 0 && SIZED_TYPES.has(type)) n.h = extra.h;
  if (type === "checklist" && !extra.p?.items) n.p.items = [{ id: nid(), text: "First task", done: false }];
  // frames render below everything else
  apply({ nodes: type === "frame" ? [n, ...get().nodes] : [...get().nodes, n] }, { discrete: true });
  selectNodes([n.id]);
  return n;
}

export function updateNode(id: string, patch: Partial<Omit<FunnelNode, "id" | "p">>) {
  const isMath = "type" in patch;
  apply({ nodes: get().nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }, { math: isMath || "name" in patch });
}

export function updateParams(id: string, patch: NodeParams) {
  const node = get().nodes.find((n) => n.id === id);
  if (!node) return;
  apply({ nodes: get().nodes.map((n) => (n.id === id ? { ...n, p: { ...n.p, ...patch } } : n)) }, { math: !isAnnot(node.type) });
}

/** Move nodes (drag, nudge, align, layout). Positions don't affect the maths, so no recompute. */
export function moveNodes(pos: Record<string, { x: number; y: number; w?: number; h?: number }>, opts: { discrete?: boolean } = {}) {
  apply({ nodes: get().nodes.map((n) => (pos[n.id] ? { ...n, ...pos[n.id] } : n)) }, { math: false, discrete: opts.discrete });
}

export function setDims(d: Record<string, { width: number; height: number }>) {
  // Only store real changes: React Flow re-reports sizes on re-render, and a fresh object each time would loop.
  const cur = get().dims;
  const changed = Object.entries(d).filter(([id, v]) => cur[id]?.width !== v.width || cur[id]?.height !== v.height);
  if (!changed.length) return;
  set({ dims: { ...cur, ...Object.fromEntries(changed) } });
}

export function deleteSelection() {
  const s = get();
  if (s.selNodes.length) {
    // locked elements stay put until they're unlocked
    const ids = new Set(s.selNodes.filter((id) => !s.nodes.find((n) => n.id === id)?.locked));
    if (!ids.size) return showToast("Locked: unlock it first to delete");
    if (ids.size < s.selNodes.length) showToast("Locked items were kept");
    apply({ nodes: s.nodes.filter((n) => !ids.has(n.id)), edges: s.edges.filter((e) => !ids.has(e.from) && !ids.has(e.to)) }, { discrete: true });
  } else if (s.selEdge) {
    apply({ edges: s.edges.filter((e) => e.id !== s.selEdge) }, { discrete: true });
  } else return;
  clearSelection();
}

function cloneSet(ids: string[], dx: number, dy: number, from: { nodes: FunnelNode[]; edges: FunnelEdge[] } = get()) {
  const B = Object.fromEntries(from.nodes.map((n) => [n.id, n]));
  const map: Record<string, string> = {};
  const nodes: FunnelNode[] = [];
  ids.forEach((i) => {
    const n = B[i];
    if (!n) return;
    const c = structuredClone(n);
    c.id = nid();
    c.x += dx;
    c.y += dy;
    delete c.locked; // copies start unlocked
    map[i] = c.id;
    nodes.push(c);
  });
  const edges = from.edges.filter((e) => map[e.from] && map[e.to]).map((e) => ({ ...e, id: "e" + nid(), from: map[e.from], to: map[e.to] }));
  return { nodes, edges };
}

export function duplicateSelection() {
  const ids = get().selNodes;
  if (!ids.length) return;
  const c = cloneSet(ids, 33, 33);
  apply({ nodes: [...get().nodes, ...c.nodes], edges: [...get().edges, ...c.edges] }, { discrete: true });
  selectNodes(c.nodes.map((n) => n.id));
}

export function copySelection() {
  const ids = get().selNodes;
  if (!ids.length) return false;
  set({ clip: cloneSet(ids, 0, 0) });
  return true;
}

export function paste() {
  const clip = get().clip;
  if (!clip) return;
  const c = cloneSet(
    clip.nodes.map((n) => n.id),
    44,
    44,
    clip,
  );
  apply({ nodes: [...get().nodes, ...c.nodes], edges: [...get().edges, ...c.edges] }, { discrete: true });
  set({ clip: c });
  selectNodes(c.nodes.map((n) => n.id));
}

export function nudge(dx: number, dy: number) {
  const ids = new Set(get().selNodes);
  if (!ids.size) return;
  moveNodes(Object.fromEntries(get().nodes.filter((n) => ids.has(n.id) && !n.locked).map((n) => [n.id, { x: n.x + dx, y: n.y + dy }])));
}

/* ---------------- lock / layer order / style ---------------- */
/** Lock or unlock the selection (locked: no moving, resizing or deleting). Toggles when `on` is omitted. */
export function setLocked(on?: boolean, ids: string[] = get().selNodes) {
  const sel = new Set(ids);
  const ns = get().nodes.filter((n) => sel.has(n.id));
  if (!ns.length) return;
  const v = on ?? !ns.every((n) => n.locked);
  const lock = (n: FunnelNode): FunnelNode => {
    if (v) return { ...n, locked: true };
    const c = { ...n };
    delete c.locked;
    return c;
  };
  apply({ nodes: get().nodes.map((n) => (sel.has(n.id) ? lock(n) : n)) }, { math: false, discrete: true });
}

/** Effective layer: stored z, else frames below everything. */
export const layerOf = (n: FunnelNode) => n.z ?? (n.type === "frame" ? -1 : 0);

export function reorder(kind: "front" | "forward" | "backward" | "back", ids: string[] = get().selNodes) {
  const sel = new Set(ids);
  const all = get().nodes;
  if (!all.some((n) => sel.has(n.id))) return;
  const others = all.filter((n) => !sel.has(n.id)).map(layerOf);
  const hi = Math.max(0, ...others),
    lo = Math.min(0, ...others);
  const z = (n: FunnelNode) => (kind === "front" ? hi + 1 : kind === "back" ? lo - 1 : layerOf(n) + (kind === "forward" ? 1 : -1));
  apply({ nodes: all.map((n) => (sel.has(n.id) ? { ...n, z: z(n) } : n)) }, { math: false, discrete: true });
}

/* ---------------- style clipboard / quick styles ---------------- */
export function copyStyle(id: string = get().selNodes[0]) {
  const n = get().nodes.find((x) => x.id === id);
  if (!n) return false;
  set({ styleClip: n.s ? { ...n.s } : {} });
  showToast("Style copied");
  return true;
}
/** Paste the copied style onto the selection (or `ids`). One undo step; the toast offers Undo. */
export function pasteStyle(ids: string[] = get().selNodes) {
  const clip = get().styleClip;
  const sel = new Set(ids);
  const targets = get().nodes.filter((n) => sel.has(n.id) && !n.locked);
  if (!clip || !targets.length || get().readOnly) {
    if (!clip) showToast("Copy a style first");
    return false;
  }
  const st = cleanStyle({ ...clip });
  apply({ nodes: get().nodes.map((n) => (sel.has(n.id) && !n.locked ? withStyle(n, st ? { ...st } : undefined) : n)) }, { math: false, discrete: true });
  showToast(`Style pasted on ${targets.length} ${targets.length === 1 ? "block" : "blocks"}`, "Undo", undo);
  return true;
}
/** Replace the style of the selection with a quick style (null = Default). */
export function applyQuickStyle(style: NodeStyle | null, ids: string[] = get().selNodes) {
  const sel = new Set(ids);
  if (get().readOnly) return;
  apply({ nodes: get().nodes.map((n) => (sel.has(n.id) && !n.locked ? withStyle(n, style ? { ...style } : undefined) : n)) }, { math: false, discrete: true });
}
/** Eyedropper: give `targetId` the style of the armed block, then disarm. */
export function applyEyedropper(targetId: string) {
  const src = get().eyedrop;
  if (!src || src === targetId) return;
  const from = get().nodes.find((n) => n.id === src);
  set({ eyedrop: null });
  if (!from) return;
  set({ styleClip: from.s ? { ...from.s } : {} });
  pasteStyle([targetId]);
}
export function armEyedropper(id: string | null) {
  set({ eyedrop: id });
  if (id) showToast("Click a block to give it this style. Esc cancels.");
}

/** Merge into an element's style; empty values reset that property. */
export function setNodeStyle(id: string, patch: Partial<NodeStyle>, ids: string[] = [id]) {
  const sel = new Set(ids);
  apply({ nodes: get().nodes.map((n) => (sel.has(n.id) ? withStyle(n, cleanStyle({ ...n.s, ...patch })) : n)) }, { math: false });
}
const withStyle = (n: FunnelNode, st: NodeStyle | undefined): FunnelNode => {
  const c = { ...n };
  if (st) c.s = st;
  else delete c.s;
  return c;
};
export function setEdgeStyle(id: string, patch: Partial<EdgeStyle>) {
  apply(
    {
      edges: get().edges.map((e) => {
        if (e.id !== id) return e;
        const st = cleanStyle({ ...e.s, ...patch });
        const c = { ...e };
        if (st) c.s = st;
        else delete c.s;
        return c;
      }),
    },
    { math: false },
  );
}

/* ---------------- checklists ---------------- */
/** Element checklist (`node.checklist`, internal) or a canvas checklist element's items (`p.items`). */
export function checklistOf(n: FunnelNode): ChecklistItem[] {
  return n.type === "checklist" ? ((n.p.items as ChecklistItem[] | undefined) ?? []) : (n.checklist ?? []);
}
export function setChecklist(id: string, items: ChecklistItem[], opts: { discrete?: boolean } = {}) {
  apply(
    {
      nodes: get().nodes.map((n) => {
        if (n.id !== id) return n;
        if (n.type === "checklist") return { ...n, p: { ...n.p, items } };
        const c = { ...n };
        if (items.length) c.checklist = items;
        else delete c.checklist;
        return c;
      }),
    },
    { math: false, discrete: opts.discrete },
  );
}
export const newChecklistItem = (text = ""): ChecklistItem => ({ id: nid(), text, done: false });

export function align(kind: "left" | "top" | "hdist" | "vdist" | "center" | "middle") {
  const ids = new Set(get().selNodes);
  const ns = get().nodes.filter((n) => ids.has(n.id) && !n.locked);
  if (ns.length < 2) return;
  const pos: Record<string, { x: number; y: number }> = {};
  if (kind === "left") {
    const x = Math.min(...ns.map((n) => n.x));
    ns.forEach((n) => (pos[n.id] = { x, y: n.y }));
  }
  if (kind === "top") {
    const y = Math.min(...ns.map((n) => n.y));
    ns.forEach((n) => (pos[n.id] = { x: n.x, y }));
  }
  if (kind === "center") {
    const c = ns.reduce((a, n) => a + n.x + widthOf(n) / 2, 0) / ns.length;
    ns.forEach((n) => (pos[n.id] = { x: Math.round(c - widthOf(n) / 2), y: n.y }));
  }
  if (kind === "middle") {
    const c = ns.reduce((a, n) => a + n.y + heightOf(n) / 2, 0) / ns.length;
    ns.forEach((n) => (pos[n.id] = { x: n.x, y: Math.round(c - heightOf(n) / 2) }));
  }
  if (kind === "hdist" && ns.length > 2) {
    const s = [...ns].sort((a, b) => a.x - b.x),
      x0 = s[0].x,
      x1 = s[s.length - 1].x;
    s.forEach((n, i) => (pos[n.id] = { x: Math.round(x0 + ((x1 - x0) * i) / (s.length - 1)), y: n.y }));
  }
  if (kind === "vdist" && ns.length > 2) {
    const s = [...ns].sort((a, b) => a.y - b.y),
      y0 = s[0].y,
      y1 = s[s.length - 1].y;
    s.forEach((n, i) => (pos[n.id] = { x: n.x, y: Math.round(y0 + ((y1 - y0) * i) / (s.length - 1)) }));
  }
  moveNodes(pos, { discrete: true });
}

export function wrapInFrame() {
  const ids = new Set(get().selNodes);
  const ns = get().nodes.filter((n) => ids.has(n.id) && n.type !== "frame");
  if (!ns.length) return;
  const x0 = Math.min(...ns.map((n) => n.x)) - 30,
    y0 = Math.min(...ns.map((n) => n.y)) - 40,
    x1 = Math.max(...ns.map((n) => n.x + widthOf(n))) + 30,
    y1 = Math.max(...ns.map((n) => n.y + heightOf(n))) + 40;
  const f: FunnelNode = { id: nid(), type: "frame", name: "Stage", x: x0, y: y0, w: x1 - x0, h: y1 - y0, p: { color: FRAME_COLORS[0][0] } };
  apply({ nodes: [f, ...get().nodes] }, { math: false, discrete: true });
  selectNodes([f.id]);
}

/** Blocks whose centre sits inside a frame (they move with it). */
export function frameMembers(frameId: string): string[] {
  const nodes = get().nodes;
  const f = nodes.find((n) => n.id === frameId);
  if (!f || f.type !== "frame") return [];
  return nodes
    .filter((m) => {
      if (m.type === "frame") return false;
      const cx = m.x + widthOf(m) / 2,
        cy = m.y + heightOf(m) / 2;
      return cx > f.x && cx < f.x + (f.w ?? 0) && cy > f.y && cy < f.y + (f.h ?? 0);
    })
    .map((m) => m.id);
}

/* ---------------- edges ---------------- */
export function canConnect(from: string, to: string, port: "main" | "alt", ignoreEdge?: string) {
  const s = get();
  if (from === to) return false;
  const fb = s.nodes.find((n) => n.id === from);
  const tb = s.nodes.find((n) => n.id === to);
  if (!fb || !portsFor(fb.type).hasOut) return false;
  if (!tb || !canReceive(tb.type)) return false;
  return !s.edges.some((e) => e.id !== ignoreEdge && e.from === from && e.to === to && (e.port || "main") === port);
}
/**
 * Move one end of a line to another port or block without deleting it (drag the line's end onto a new dot). The line keeps its
 * style, label and share; one undo step. Returns false when the new place can't take the line.
 */
export function reconnectEdge(id: string, next: { from: string; to: string; port: "main" | "alt"; sh?: Side; th?: Side }) {
  const e = get().edges.find((x) => x.id === id);
  if (!e || get().readOnly || !canConnect(next.from, next.to, next.port, id)) return false;
  const { sh: _sh, th: _th, ...rest } = e;
  void _sh;
  void _th;
  apply({ edges: get().edges.map((x) => (x.id === id ? { ...rest, from: next.from, to: next.to, port: next.port, ...(next.sh ? { sh: next.sh } : {}), ...(next.th ? { th: next.th } : {}) } : x)) }, { discrete: true });
  selectEdge(id);
  return true;
}
/** Line meanings (V2 four ports): Yes continues, No leaves, Skip step goes past a block, No data has no numbers. */
export type LineMeaning = "yes" | "no" | "skip" | "nodata";
/** The meaning a connection reads as (from its port and style kind). */
export const meaningOf = (e: Pick<FunnelEdge, "port" | "s">): LineMeaning => (e.s?.kind === "skip" ? "skip" : e.s?.kind === "nodata" ? "nodata" : e.port === "alt" ? "no" : "yes");
/** Change what a line means. Yes / No set who travels it (the maths' port); Skip / No data are drawn differently. */
export function setMeaning(id: string, m: LineMeaning) {
  const e = get().edges.find((x) => x.id === id);
  if (!e || get().readOnly) return;
  const from = get().nodes.find((n) => n.id === e.from);
  const alt = m === "no" && !!from && portsFor(from.type).hasAlt;
  const kind = m === "skip" || m === "nodata" ? m : undefined;
  const st = { ...(e.s ?? {}) };
  if (kind) st.kind = kind;
  else delete st.kind;
  apply({ edges: get().edges.map((x) => (x.id === id ? { ...x, port: alt ? "alt" : m === "no" ? x.port : "main", s: Object.keys(st).length ? st : undefined } : x)) }, { discrete: true });
}
export function connect(from: string, port: "main" | "alt", to: string, sides: { sh?: Side; th?: Side } = {}) {
  if (!canConnect(from, to, port)) return null;
  const e: FunnelEdge = { id: "e" + nid(), from, to, share: 100, port, ...(sides.sh ? { sh: sides.sh } : {}), ...(sides.th ? { th: sides.th } : {}) };
  apply({ edges: [...get().edges, e] }, { discrete: true });
  selectEdge(e.id);
  return e.id;
}
/**
 * Change a block's type in place (Change page type / block type). Keeps id, position, connections, URL, thumbnail,
 * status, notes and every parameter: values for fields the new type shares carry over, fields it doesn't show are kept
 * hidden so switching back restores them. Only types with the same maths are offered (retypeTargets), so the numbers
 * don't change. One undo step.
 */
export function retypeNode(id: string, type: string) {
  const n = get().nodes.find((x) => x.id === id);
  if (!n || get().readOnly || n.locked || !retypeTargets(n.type).includes(type)) return false;
  const was = typeOf(n.type),
    T = typeOf(type);
  const s = n.s && n.s.icon ? { ...n.s, icon: undefined } : n.s;
  apply({ nodes: get().nodes.map((x) => (x.id === id ? { ...x, type, name: x.name === was.label ? T.label : x.name, p: { ...defaultsFor(type), ...x.p }, ...(s ? { s: cleanStyle(s) } : {}) } : x)) }, { discrete: true });
  return true;
}

/**
 * Templates inside the map (V2 F3): add a template's blocks to the open funnel as ONE labelled frame, centred on
 * `centre` (the middle of the view) but moved right / down until it covers no existing element, never moving anything
 * that is already on the map. One undo step. Returns the frame's id.
 */
export function insertTemplateGraph(g: FunnelGraph, name: string, centre: { x: number; y: number }) {
  const s = get();
  if (s.readOnly || !g.nodes.length) return null;
  const map: Record<string, string> = {};
  const nodes0 = g.nodes.map((n) => {
    const id = nid();
    map[n.id] = id;
    return { ...structuredClone(n), id };
  });
  const edges = g.edges.filter((e) => map[e.from] && map[e.to]).map((e) => ({ ...structuredClone(e), id: "e" + nid(), from: map[e.from], to: map[e.to] }));
  const PAD = 40;
  const x0 = Math.min(...nodes0.map((n) => n.x)) - PAD,
    y0 = Math.min(...nodes0.map((n) => n.y)) - PAD - 10,
    x1 = Math.max(...nodes0.map((n) => n.x + nodeW(n.type))) + PAD,
    y1 = Math.max(...nodes0.map((n) => n.y + blockH(n.type))) + PAD;
  const w = x1 - x0,
    h = y1 - y0;
  const occupied = s.nodes.map((n) => ({ x: n.x, y: n.y, w: n.w ?? nodeW(n.type), h: n.h ?? heightOf(n) }));
  const free = (fx: number, fy: number) => occupied.every((o) => fx + w <= o.x - 20 || o.x + o.w + 20 <= fx || fy + h <= o.y - 20 || o.y + o.h + 20 <= fy);
  let fx = snapV(centre.x - w / 2),
    fy = snapV(centre.y - h / 2);
  // search outward: right, then down, in growing steps, until the frame lands on empty canvas
  outer: for (let ring = 0; ring < 40; ring++) {
    for (const [dx, dy] of [
      [ring, 0],
      [0, ring],
      [ring, ring],
    ]) {
      const tx = snapV(centre.x - w / 2 + dx * 220),
        ty = snapV(centre.y - h / 2 + dy * 160);
      if (free(tx, ty)) {
        fx = tx;
        fy = ty;
        break outer;
      }
    }
  }
  const dx = fx - x0,
    dy = fy - y0;
  const nodes = nodes0.map((n) => ({ ...n, x: snapV(n.x + dx), y: snapV(n.y + dy) }));
  const frame: FunnelNode = { id: nid(), type: "frame", name, x: fx, y: fy, w, h, p: { ...defaultsFor("frame") } };
  apply({ nodes: [frame, ...s.nodes, ...nodes], edges: [...s.edges, ...edges] }, { discrete: true });
  selectNodes([frame.id]);
  return frame.id;
}

/** Block types that may follow a connection (they receive people): no traffic sources, no layout elements. */
export const canFollowType = (type: string) => canReceive(type);
/** Block types that may sit in the middle of a line (receive and pass people on). */
export const canInsertType = (type: string) => canReceive(type) && portsFor(type).hasOut;

/**
 * Add a block at the end of a dragged connection and connect it, as ONE change: one undo step, one autosave.
 * The block's in-port lands on (x, y); the new block is selected so the inspector follows.
 */
export function addConnectedNode(from: { id: string; port: "main" | "alt"; sh?: Side }, type: string, x: number, y: number, extra: { p?: NodeParams; name?: string; w?: number; h?: number } = {}) {
  const T = typeOf(type);
  const src = get().nodes.find((n) => n.id === from.id);
  if (!T || !src || !canFollowType(type) || get().readOnly) return null;
  const n: FunnelNode = { id: nid(), type, name: extra.name ?? T.label, x: snapV(x), y: snapV(y - blockPivot(type)), p: { ...defaultsFor(type), ...(extra.p ?? {}) } };
  const e: FunnelEdge = { id: "e" + nid(), from: from.id, to: n.id, share: 100, port: from.port, ...(from.sh && fourPorts(src.type) ? { sh: from.sh } : {}) };
  apply({ nodes: [...get().nodes, n], edges: [...get().edges, e] }, { discrete: true });
  selectNodes([n.id]);
  return n;
}

/** Put a new step in the middle of a connection: A→B becomes A→N→B (A→N keeps the line's port, share and style). One undo step. */
export function insertStepOnEdge(edgeId: string, type: string, extra: { p?: NodeParams; name?: string } = {}) {
  const s = get();
  const e = s.edges.find((x) => x.id === edgeId);
  const a = e && s.nodes.find((n) => n.id === e.from),
    b = e && s.nodes.find((n) => n.id === e.to);
  const T = typeOf(type);
  if (!e || !a || !b || !T || !canInsertType(type) || s.readOnly) return null;
  // lines run between the pictures: the middle of the gap between them, at the pictures' centre line
  const pa = picRect(a.type),
    pb = picRect(b.type);
  const ax = a.x + pa.x + pa.w,
    ay = a.y + blockPivot(a.type),
    by = b.y + blockPivot(b.type);
  const mx = (ax + b.x + pb.x) / 2,
    my = e.port === "alt" ? Math.max(a.y + heightOf(a) + 70, (ay + by) / 2) : (ay + by) / 2;
  const n: FunnelNode = { id: nid(), type, name: extra.name ?? T.label, x: snapV(mx - nodeW(type) / 2), y: snapV(my - blockPivot(type)), p: { ...defaultsFor(type), ...(extra.p ?? {}) } };
  const first: FunnelEdge = { ...e, to: n.id };
  const second: FunnelEdge = { id: "e" + nid(), from: n.id, to: b.id, share: 100, port: "main" };
  apply({ nodes: [...s.nodes, n], edges: [...s.edges.filter((x) => x.id !== e.id), first, second] }, { discrete: true });
  selectNodes([n.id]);
  return n;
}

/** Reverse a connection's direction (B→A). Refused when the ends can't take the new roles. */
export function flipEdge(id: string) {
  const s = get();
  const e = s.edges.find((x) => x.id === id);
  if (!e || s.readOnly) return false;
  const a = s.nodes.find((n) => n.id === e.from),
    b = s.nodes.find((n) => n.id === e.to);
  if (!a || !b) return false;
  if (!canReceive(a.type) || !portsFor(b.type).hasOut) {
    showToast("Can’t flip: that block can’t take people from the other end");
    return false;
  }
  if (s.edges.some((x) => x.from === b.id && x.to === a.id && (x.port || "main") === "main")) {
    showToast("Can’t flip: there is already a connection that way");
    return false;
  }
  apply({ edges: s.edges.map((x) => (x.id === id ? { ...x, from: b.id, to: a.id, port: "main" } : x)) }, { discrete: true });
  selectEdge(id);
  return true;
}

export function updateEdge(id: string, patch: Partial<Omit<FunnelEdge, "id">>) {
  apply({ edges: get().edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
}

/* ---------------- funnel-level ---------------- */
export function setName(name: string) {
  apply({ name }, { math: false });
}
export function setSettings(patch: Partial<FunnelSettings>) {
  apply({ settings: { ...get().settings, ...patch } });
}
export function setView(view: Viewport) {
  set((s) => ({ view, viewRev: s.viewRev + 1 }));
}
export function setOpt<K extends keyof ViewOpts>(k: K, v: ViewOpts[K]) {
  const opts = { ...get().opts, [k]: v };
  set({ opts });
  try {
    localStorage.setItem(OPTS_KEY, JSON.stringify(opts));
  } catch {}
}
/** The factor the calendar puts on Plan numbers (the funnel models one month): 1 for this month, 3 for a quarter, 7 days = 7 × 12 / 365. */
export function viewK(o: Pick<ViewOpts, "range" | "period">): number {
  return o.range ? rangeScale(o.range) : periodFactor(o.period);
}
/** The dates the calendar shows (this calendar month until a range is chosen). */
export const viewRange = (o: Pick<ViewOpts, "range">): DateRange => o.range ?? monthRange(new Date());
/** Choose the dates the numbers cover. Actual mode follows (it shows the real entries for the same dates). */
export function setRange(range: DateRange | null) {
  const opts = { ...get().opts, range, period: "month" as const };
  set({ opts });
  try {
    localStorage.setItem(OPTS_KEY, JSON.stringify(opts));
  } catch {}
  const av = get().actualView;
  if (av) setActualView({ ...av, ...viewRange(opts), label: rangeLabel(viewRange(opts)) });
}
/** Compare with Baseline on or off (the Baseline run is computed only while it is on and a scenario is active). */
export function setCompare(on: boolean) {
  const opts = { ...get().opts, compare: on };
  set({ opts });
  try {
    localStorage.setItem(OPTS_KEY, JSON.stringify(opts));
  } catch {}
  const s = get();
  set({ compareBase: compareOf(s.nodes, s.edges, s.settings) });
}
/** Switch between Clean, People and Money (sets the numbers and line-weight flags that follow the view). */
export function setMapView(view: MapView) {
  const opts = { ...get().opts, ...viewFlags(view) };
  set({ opts });
  try {
    localStorage.setItem(OPTS_KEY, JSON.stringify(opts));
  } catch {}
}
export function setReadOnly(readOnly: boolean) {
  if (!readOnly && get().viewer) return;
  set({ readOnly, saveStatus: readOnly ? "readonly" : get().rev ? "dirty" : "saved", ...(readOnly ? { simBase: null, simPlay: false, simBefore: false, panel: get().panel === "simulate" ? "inspector" : get().panel } : {}) });
}
export function setSaveStatus(saveStatus: SaveStatus) {
  if (get().readOnly && saveStatus !== "readonly") return;
  set({ saveStatus });
}
export const editorSnapshot = () => {
  const s = get();
  return { name: s.name, graph: { nodes: s.nodes, edges: s.edges, view: s.view }, settings: s.settings };
};

/** Set positions without recording history or triggering a save (animation frames). Finish with moveNodes(). */
export function setPositionsTransient(pos: Record<string, { x: number; y: number }>) {
  set((s) => ({ nodes: s.nodes.map((n) => (pos[n.id] ? { ...n, ...pos[n.id] } : n)) }));
}
export function setSpot(spot: string | null) {
  set({ spot });
}
/** Force a save of the current content (e.g. after restoring a local draft). */
export function markDirty() {
  set((s) => ({ rev: s.rev + 1, saveStatus: s.readOnly ? s.saveStatus : "dirty" }));
}

export function setFunnelCtl(status: string, set: ((status: string) => void) | null) {
  useEditor.setState({ funnelCtl: { status, set } });
}

export function openActualsEntry(tab: "type" | "csv" = "type") {
  useEditor.setState({ actualsEntry: tab });
}
export function closeActualsEntry() {
  useEditor.setState({ actualsEntry: null });
}
