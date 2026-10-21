"use client";
import "./editor.css";
import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrandMark, Icon } from "@/components/icon";
import { Menu } from "@/components/menu";
import { toggleTheme } from "@/components/theme-toggle";
import { isAnnot } from "@/lib/catalog";
import { CURRENCIES, CURRENCY_CODES, exportFunnelFile, importFunnelFile, isCurrency, type FunnelGraph, type FunnelNode, type FunnelSettings } from "@/lib/graph";
import { healthChecks } from "@/lib/health";
import { fileName, paletteFor, stepsCsv } from "@/lib/export";
import { monthlyPlanVsActual, reportData } from "@/lib/report-data";
import { chartSeries, mrrDetail, type WidgetMetric } from "@/lib/widget-data";
import { elkLayout, layoutMetrics, tidyLayout } from "@/lib/layout";
import { FUNNEL_STATUSES, STATUS_LABEL } from "@/lib/schemas";
import { supabaseBrowser } from "@/lib/supabase/client";
import { clearDraft, readDraft, useAutosave, type SaveFn } from "@/lib/editor/saver";
import {
  addWidget,
  armEyedropper,
  clearSelection,
  copyStyle,
  pasteStyle,
  startRename,
  copySelection,
  deleteSelection,
  duplicateSelection,
  editorSnapshot,
  heightOf,
  widthOf,
  initEditor,
  markDirty,
  moveNodes,
  nudge,
  paste,
  redo,
  replaceContent,
  selectNodes,
  setName,
  setOpt,
  setPanel,
  setPositionsTransient,
  setReadOnly,
  setSettings,
  setTab,
  showToast,
  undo,
  useEditor, setMapView, setFunnelCtl, setSideTab, openSettingsBox, reorder, setLocked, setMode, openQuickAdd, setProducts, setSection, startSim, stopSim, leaveSim, setSimPlay, setSimWalk, type ReportSection } from "@/lib/editor/store";
import { Canvas, ZoomControls } from "./canvas";
import { kbd } from "@/lib/platform";
import { useBand } from "@/lib/use-band";
import { PhoneActionBar } from "./phone-bar";
import { SharedWidgets } from "./widget-node";
import { SimulatePanel } from "./simulate";
import { ensureActuals, loadAssets } from "./assets";
import { ContextMenu } from "./context-menu";
import { FloatingToolbar } from "./floating-toolbar";
import { TypePicker } from "./type-picker";
import { EditorRail, LayersMenu, ViewSwitch } from "./chrome";
import { EditingBanner, PlanControl } from "./plan-control";
import { ActualsHost } from "./actuals-host";
import { SettingsBox } from "./settings-box";
import { RangePicker } from "./range-picker";
import { Outline } from "./outline";
import { WorkspaceBlocks } from "./workspace-blocks";
import { CommentsPanel } from "./comments";
import { CanvasNotes } from "./canvas-notes";
import { download, downloadPng, pdfReport, renderMapSvg, svgToPng } from "./exporters";
import { HelpDialog } from "./help-dialog";
import { Inspector } from "./inspector";
import { KpiBar } from "./kpi-bar";
import { Palette, type PaletteProduct } from "./palette";
import { Presenter } from "./present";
import { QuickAdd } from "./quick-add";
import { LineMenu } from "./line-menu";
import { SimBar } from "./sim-bar";
import { MathPanel } from "./math-panel";
import { registerCommands } from "@/lib/editor/commands";
import { dataUrlToBlob, encodeUnder } from "@/lib/image-client";
import { TemplatesPanel } from "./templates-panel";
import { REPORT_SECTIONS, ReportsView } from "./reports-view";
import { ShareDialog } from "./share-dialog";
import { ExportDialog } from "./export-dialog";
import { TemplateDialog } from "./template-dialog";
import { ShareComments } from "./share-comments";
import { saveVersion, VersionsPanel } from "./versions";

export interface EditorProps {
  mode: "owner" | "share";
  userId?: string;
  /** Name (or email) shown as the avatar initials. */
  userName?: string;
  funnel: { id: string; name: string; description: string; status: string; client_id: string; graph: FunnelGraph; settings: FunnelSettings; updated_at: string };
  client: { id: string; name: string; logo_url: string | null; currency: string };
  agency: { name: string; logo_url: string | null };
  products?: PaletteProduct[];
  lastVersionAt?: number;
  share?: { token: string; canEdit: boolean; hideNumbers: boolean; allowComments: boolean; comments: ShareCommentLite[] };
  /** Workspace viewer: sees the funnel, its reports, versions and comments; changes nothing. */
  viewer?: boolean;
  unresolvedComments?: number;
}
export interface ShareCommentLite {
  id: string;
  node_id: string | null;
  author_name: string;
  body: string;
  resolved: boolean;
  created_at: string;
}

export function Editor(props: EditorProps) {
  return (
    <ReactFlowProvider>
      <EditorInner {...props} />
    </ReactFlowProvider>
  );
}

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (!!t.closest("input, textarea, select, [contenteditable=true]") || !!document.querySelector("dialog[open]"));

// 1280-1439px: the library opens as an overlay on the canvas and closes when you start working on the canvas or press Esc
function closeOverlayLibrary() {
  if (window.matchMedia("(min-width: 1280px) and (max-width: 1439px)").matches && !useEditor.getState().opts.hideSide) setOpt("hideSide", true);
}

function EditorInner(props: EditorProps) {
  const { mode, funnel, client, agency, share } = props;
  const owner = mode === "owner";
  // owners, admins and editors manage the funnel (versions, share links, templates, status); viewers only look
  const manage = owner && !props.viewer;
  const rf = useReactFlow();
  // the store is initialised for this funnel (set synchronously by initEditor in the effect below)
  const ready = useEditor((s) => s.funnelId === funnel.id);
  const [showSide, setShowSide] = useState(false);
  const [showInsp, setShowInsp] = useState(false);
  const [presenting, setPresenting] = useState(false);
  // a presentation shows the map as it is, without the Simulate overlay
  useEffect(() => {
    if (presenting) stopSim();
  }, [presenting]);
  const [status, setStatus] = useState(funnel.status);
  const changeStatus = useCallback(
    async (st: string) => {
      setStatus(st);
      const { error } = await supabaseBrowser().from("funnels").update({ status: st }).eq("id", funnel.id);
      if (error) showToast("Couldn’t change status");
    },
    [funnel.id],
  );
  useEffect(() => {
    setFunnelCtl(status, manage ? changeStatus : null);
  }, [status, manage, changeStatus]);
  const [commentCount, setCommentCount] = useState(props.unresolvedComments ?? 0);
  const helpRef = useRef<HTMLDialogElement>(null);
  const tipsRef = useRef<HTMLDialogElement>(null);
  const sideTab = useEditor((s) => s.sideTab);
  const selectMode = useEditor((s) => s.selectMode);
  const selNodesCount = useEditor((s) => s.selNodes.length);
  const selEdgeId = useEditor((s) => s.selEdge);
  const band = useBand();
  const sharedView = useEditor((s) => s.shared);
  const nodesForChecks = useEditor((s) => s.nodes);
  const edgesForChecks = useEditor((s) => s.edges);
  const checkCount = useMemo(() => (sharedView ? 0 : healthChecks({ nodes: nodesForChecks, edges: edgesForChecks }).length), [sharedView, nodesForChecks, edgesForChecks]);
  const hasWidgets = useEditor((s) => s.nodes.some((n) => n.type === "widget"));
  const [sheetH, setSheetH] = useState(50);
  const sheetDrag = useRef<{ y: number; h: number } | null>(null);
  const shareRef = useRef<HTMLDialogElement>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const tplRef = useRef<HTMLDialogElement>(null);

  const name = useEditor((s) => s.name);
  const readOnly = useEditor((s) => s.readOnly);
  const saveStatus = useEditor((s) => s.saveStatus);
  const opts = useEditor((s) => s.opts);
  const currency = useEditor((s) => s.settings.currency);
  const hideNumbersSetting = useEditor((s) => s.settings.hideNumbers);
  const panel = useEditor((s) => s.panel);
  const canUndo = useEditor((s) => s.past.length > 0 || (s.committed !== null && s.committed.nodes !== s.nodes));
  const canRedo = useEditor((s) => s.future.length > 0);
  const toast = useEditor((s) => s.toast);
  const hasNodes = useEditor((s) => s.nodes.length > 0);
  const notesShared = useEditor((s) => s.settings.notes.shared && !!s.settings.notes.body.trim());
  const viewMode = useEditor((s) => s.mode);
  const reports = viewMode === "reports" && !share?.hideNumbers;
  // Reports covers the map, library, details and KPI bar (they stay mounted underneath). React Flow draws its blocks with an inline
  // `visibility: visible`, which beats the hidden parent, so the covered parts are made inert: no Tab stops, nothing read aloud.
  useEffect(() => {
    if (!reports) return;
    const parts = Array.from(document.querySelectorAll<HTMLElement>(".fm-editor > .fm-rail, .fm-editor > .fm-side, .fm-editor > .fm-stage, .fm-editor > .fm-insp, .fm-editor > .fm-kpis"));
    parts.forEach((el) => el.setAttribute("inert", ""));
    return () => parts.forEach((el) => el.removeAttribute("inert"));
  }, [reports]);


  /* ---------- init ---------- */
  useEffect(() => {
    const canEdit = manage || !!share?.canEdit;
    let graph = funnel.graph,
      settings = funnel.settings,
      nm = funnel.name;
    let restored = false;
    if (owner) {
      const d = readDraft(funnel.id);
      if (d && d.at > Date.parse(funnel.updated_at)) {
        graph = d.graph;
        settings = d.settings;
        nm = d.name || nm;
        restored = true;
      } else if (d) clearDraft(funnel.id);
    }
    if (share?.hideNumbers) settings = { ...settings, hideNumbers: true };
    initEditor({ funnelId: funnel.id, clientId: funnel.client_id, name: nm, graph, settings, readOnly: !canEdit, shared: !owner, viewer: !!props.viewer });
    if (share?.hideNumbers) setMapView("clean");
    // deep link: ?view=reports[&section=goals]
    const q = new URLSearchParams(window.location.search);
    if (q.get("view") === "reports" && !share?.hideNumbers) {
      const sec = q.get("section");
      setSection(REPORT_SECTIONS.some(([k]) => k === sec) ? (sec as ReportSection) : "overview");
    }
    if (restored) {
      markDirty();
      showToast("Restored unsaved changes from this device. Syncing…");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funnel.id]);

  useEffect(() => setProducts(props.products ?? []), [props.products]);
  useEffect(() => {
    if (manage || props.viewer) loadAssets();
  }, [manage, props.viewer, funnel.id]);

  // desktop: collapse the block library / details panel so the canvas gets the space (remembered with the view options)
  // a client opening a share link sees the map full width; the panel (numbers, comments) opens from "Comments" and is never saved as a view option
  const [viewerPanel, setViewerPanel] = useState(false);
  const clientView = sharedView && !share?.canEdit;
  const picked = useEditor((s) => s.selNodes.length > 0 || !!s.selEdge);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- picking a block on the map opens its panel for the client
    if (clientView && picked) setViewerPanel(true);
  }, [clientView, picked]);
  const collapsed = { side: opts.hideSide || clientView, insp: clientView ? !viewerPanel : opts.hideInsp };
  const simOn = useEditor((s) => !!s.simBase);
  const simBefore = useEditor((s) => s.simBefore);
  const actualView = useEditor((s) => s.actualView);
  const toggleSim = () => {
    // read the store (the keyboard handler keeps an older copy of this function)
    if (useEditor.getState().simBase) return leaveSim();
    startSim();
    setMode("map");
    setShowInsp(true);
    togglePanel("insp", false);
  };
  const togglePanel = (which: "side" | "insp", value?: boolean) => setOpt(which === "side" ? "hideSide" : "hideInsp", value ?? !collapsed[which]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && closeOverlayLibrary();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);

  /* ---------- saving ---------- */
  const save: SaveFn = useCallback(
    async (p) => {
      if (owner) {
        const { error } = await supabaseBrowser()
          .from("funnels")
          .update({ name: p.name, graph: p.graph as never, settings: p.settings as never, summary: p.summary as never })
          .eq("id", funnel.id);
        if (error) throw error;
      } else if (share?.canEdit) {
        const r = await fetch(`/api/share/${share.token}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ graph: p.graph, settings: p.settings }) });
        if (!r.ok) throw new Error("save failed");
      }
    },
    [owner, funnel.id, share],
  );
  useAutosave({
    funnelId: funnel.id,
    save,
    saveVersion: manage ? async (p) => void (await supabaseBrowser().from("funnel_versions").insert({ funnel_id: funnel.id, graph: p.graph as never, settings: p.settings as never, label: "Autosave", auto: true })) : undefined,
    lastVersionAt: props.lastVersionAt,
    enabled: ready && (manage || !!share?.canEdit),
  });

  /* ---------- layout ---------- */
  const runTidy = useCallback(
    async (kind: "tidy" | "elk" = "tidy") => {
      if (useEditor.getState().readOnly) return;
      // lay out with real sizes: wait for web fonts (text wraps change note/heading heights) and one re-measure
      await document.fonts?.ready;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const s = useEditor.getState();
      if (s.readOnly) return;
      if (!s.nodes.some((n) => !isAnnot(n.type))) return showToast("Add some blocks first");
      const laid = kind === "elk" ? await elkLayout(s.nodes, s.edges, { heightOf, widthOf, snap: s.opts.snap }) : tidyLayout(s.nodes, s.edges, { heightOf, widthOf, snap: s.opts.snap });
      // locked elements keep their place
      const keep = Object.fromEntries(s.nodes.filter((n) => n.locked).map((n) => [n.id, n]));
      const next = laid.map((n) => (keep[n.id] ? { ...n, x: keep[n.id].x, y: keep[n.id].y, w: keep[n.id].w, h: keep[n.id].h } : n));
      const from = Object.fromEntries(s.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const T = reduce ? 0 : 420,
        t0 = performance.now();
      await new Promise<void>((done) => {
        const step = (now: number) => {
          const t = T ? Math.min(1, (now - t0) / T) : 1,
            e = 1 - Math.pow(1 - t, 3);
          setPositionsTransient(Object.fromEntries(next.map((n) => [n.id, { x: Math.round(from[n.id].x + (n.x - from[n.id].x) * e), y: Math.round(from[n.id].y + (n.y - from[n.id].y) * e) }])));
          if (t < 1) requestAnimationFrame(step);
          else done();
        };
        requestAnimationFrame(step);
      });
      useEditor.setState({ nodes: s.nodes.map((n) => ({ ...n, x: from[n.id].x, y: from[n.id].y })) });
      moveNodes(Object.fromEntries(next.map((n) => [n.id, { x: n.x, y: n.y, ...(n.type === "frame" ? { w: n.w, h: n.h } : {}) }])), { discrete: true });
      requestAnimationFrame(() => rf.fitView({ padding: 0.15, duration: 300, maxZoom: 1.2 }));
      showToast(`Layout tidied${kind === "elk" ? " (ELK layered)" : ""}. Ctrl Z to undo.`);
    },
    [rf],
  );

  // blocks carry their name underneath now: a funnel laid out for the old, smaller blocks may have them close together (offered once per open)
  const spaceHint = useRef(false);
  useEffect(() => {
    if (!ready || spaceHint.current || readOnly || !manage) return;
    spaceHint.current = true;
    const st = useEditor.getState();
    const flow = st.nodes.filter((n) => !isAnnot(n.type) && n.type !== "frame");
    if (flow.length > 1 && layoutMetrics(flow, st.edges).overlaps > 0) showToast("Blocks have their names underneath now, so a few sit close together.", "Tidy up", () => void runTidy());
  }, [ready, readOnly, manage, runTidy]);

  /* ---------- exports ---------- */
  const doExport = useCallback(
    async (kind: "json" | "csv" | "svg" | "png" | "pdf", omit?: string[]) => {
      const s = useEditor.getState();
      const g = { nodes: s.nodes, edges: s.edges };
      const nums = s.opts.nums && !s.settings.hideNumbers;
      try {
        if (kind === "json") download(fileName(s.name, "json"), JSON.stringify(exportFunnelFile({ ...editorSnapshot(), description: funnel.description }), null, 1), "application/json");
        if (kind === "csv") download(fileName(s.name, "csv"), stepsCsv(g, s.R, s.settings.scenarios.length ? reportData(g, s.settings, s.R).scenarios : []), "text/csv");
        const graphNow = { nodes: s.nodes, edges: s.edges };
        const widgetData = { series: (m: WidgetMetric, v: number) => chartSeries(m, graphNow, s.settings, s.R, v), mrr: (members: FunnelNode[] | null) => mrrDetail(graphNow, s.settings, s.R, members) };
        const map = { heightOf, widthOf, view: (s.settings.hideNumbers ? "clean" : s.opts.view) as "clean" | "people" | "money", thick: s.opts.thick, keyLeak: s.keyLeak, goals: s.settings.goals, widgetData };
        const img = { ...map, palette: paletteFor(s.opts.bg) };
        // the map image shows what's on screen: hidden layers (notes, checklists) stay out of it
        const shown = { nodes: s.nodes.filter((n) => (s.opts.notes || n.type !== "note") && (s.opts.checks || n.type !== "checklist")), edges: s.edges };
        if (kind === "svg") download(fileName(s.name, "svg"), await renderMapSvg(shown, s.R, { currency: s.settings.currency, basis: s.settings.basis, nums, ...img }), "image/svg+xml");
        if (kind === "png") await downloadPng(fileName(s.name, "png"), await renderMapSvg(shown, s.R, { currency: s.settings.currency, basis: s.settings.basis, nums, ...img }));
        if (kind === "pdf") {
          showToast("Building PDF…");
          if (!s.shared) await ensureActuals();
          const actualVsPlan = s.shared ? [] : monthlyPlanVsActual(g, s.R, (useEditor.getState().actuals ?? []) as never);
          const blob = await pdfReport(g, s.R, { actualVsPlan, omit, funnelName: s.name, description: funnel.description, clientName: client.name, clientLogo: client.logo_url, agencyName: agency.name, agencyLogo: agency.logo_url, currency: s.settings.currency, basis: s.settings.basis, hideNumbers: !nums, settings: s.settings, map });
          download(fileName(s.name, "pdf"), blob);
        }
      } catch (e) {
        showToast(e instanceof Error ? `Export failed: ${e.message}` : "Export failed");
      }
    },
    [funnel.description, client, agency],
  );

  const doImport = async (f: File) => {
    try {
      const d = importFunnelFile(JSON.parse(await f.text()));
      replaceContent(d.graph, d.settings, d.name);
      requestAnimationFrame(() => rf.fitView({ padding: 0.15, maxZoom: 1.2 }));
      showToast("Funnel imported. Ctrl Z to undo.");
    } catch {
      showToast("That file isn’t a Funnel Mapper .json file");
    }
  };

  const manualVersion = async () => {
    try {
      await saveVersion(funnel.id, `Saved ${new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`);
      showToast("Version saved");
      uploadThumbnail();
    } catch {
      showToast("Couldn’t save the version");
    }
  };
  /** Map snapshot for portfolio cards, kept in the private `thumbnails` bucket (path stored on the funnel). */
  const uploadThumbnail = async () => {
    try {
      const s = useEditor.getState();
      if (!s.nodes.length) return;
      const png = await svgToPng(await renderMapSvg({ nodes: s.nodes, edges: s.edges }, s.R, { currency: s.settings.currency, nums: false, heightOf, widthOf, embedFonts: false }), 0.5);
      // V2 F7: stored as WebP under 100 KB
      const img = await new Promise<HTMLImageElement>((res, rej) => Object.assign(new Image(), { onload: function (this: HTMLImageElement) { res(this); }, onerror: rej, src: png.url }));
      const blob = dataUrlToBlob(encodeUnder(Object.assign(img, { width: img.naturalWidth, height: img.naturalHeight }), 800));
      const sb = supabaseBrowser();
      const path = `${funnel.id}.png`;
      const { error } = await sb.storage.from("thumbnails").upload(path, blob, { upsert: true, contentType: "image/webp", cacheControl: "60" });
      if (!error) await sb.from("funnels").update({ thumbnail_url: path }).eq("id", funnel.id);
    } catch {}
  };

  // the editor's own commands in the shared registry (quick add lists them); a ref keeps each handler current
  const cmdRef = useRef({ runTidy, manualVersion, toggleSim, doExport });
  useEffect(() => {
    cmdRef.current = { runTidy, manualVersion, toggleSim, doExport };
  });
  useEffect(() => {
    const can = () => !useEditor.getState().readOnly;
    return registerCommands([
      { id: "tidy", label: "Tidy up the layout", scope: "map", shortcut: "Mod+Shift+L", icon: "tidy", words: "arrange layout clean", run: () => void cmdRef.current.runTidy(), enabled: can },
      { id: "fit", label: "Fit to screen", scope: "view", icon: "fit", words: "zoom show all", run: () => rf.fitView({ padding: 0.15, duration: 250, maxZoom: 1.2 }) },
      ...(manage ? [{ id: "version", label: "Save a version", scope: "map" as const, shortcut: "Mod+S", icon: "history" as const, words: "snapshot history", run: () => void cmdRef.current.manualVersion() }] : []),
      ...(owner ? [{ id: "simulate", label: "Start or leave Simulate", scope: "map" as const, shortcut: "S", icon: "play" as const, words: "simulation what-if", run: () => cmdRef.current.toggleSim(), enabled: () => can() && !useEditor.getState().shared }] : []),
      { id: "export-pdf", label: "Export PDF report", scope: "map", icon: "download", words: "download", run: () => void cmdRef.current.doExport("pdf") },
      { id: "export-png", label: "Export PNG image", scope: "map", icon: "download", words: "download picture", run: () => void cmdRef.current.doExport("png") },
      { id: "view-clean", label: "Clean view (no numbers)", scope: "view", icon: "layers", words: "numbers hide names lines", run: () => setMapView("clean") },
      { id: "view-people", label: "People view", scope: "view", icon: "users", words: "numbers people performance", run: () => setMapView("people") },
      { id: "view-money", label: "Money view", scope: "view", icon: "hash", words: "numbers revenue spend", run: () => setMapView("money") },
      { id: "panel-left", label: "Hide or show the blocks panel", scope: "view", shortcut: "[", icon: "panelLeft", run: () => setOpt("hideSide", !useEditor.getState().opts.hideSide) },
      { id: "panel-right", label: "Hide or show the details panel", scope: "view", shortcut: "]", icon: "panelRight", run: () => setOpt("hideInsp", !useEditor.getState().opts.hideInsp) },
    ]);
  }, [rf, manage, owner]);

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (presenting || isTyping(ev.target)) return;
      const mod = ev.ctrlKey || ev.metaKey,
        k = ev.key.toLowerCase();
      const ro = useEditor.getState().readOnly;
      if (ev.key === "?") {
        helpRef.current?.showModal();
        return;
      }
      if (ev.key === "Escape") {
        if (useEditor.getState().eyedrop) return armEyedropper(null);
        if (useEditor.getState().menu || useEditor.getState().quick) return;
        const st = useEditor.getState();
        if (st.simWalk != null) return setSimWalk(null);
        // Esc with nothing selected leaves Simulate (asking once about unsaved what-if changes)
        if (st.simBase && !st.selNodes.length && !st.selEdge) return leaveSim();
        clearSelection();
        return;
      }
      // F8: [ collapses / expands the left panel, ] the right one (remembered with the view options)
      if (!mod && !ev.altKey && (ev.key === "[" || ev.key === "]")) {
        ev.preventDefault();
        const o = useEditor.getState().opts;
        if (ev.key === "[") setOpt("hideSide", !o.hideSide);
        else setOpt("hideInsp", !o.hideInsp);
        return;
      }
      // Simulate: S toggles it, Space plays / pauses the people flow, ← → step the walk-through
      if (!mod && !ev.altKey && k === "s" && !useEditor.getState().readOnly && !useEditor.getState().shared && !presenting) {
        ev.preventDefault();
        toggleSim();
        return;
      }
      if (useEditor.getState().simBase && ev.key === " " && !mod) {
        ev.preventDefault();
        setSimPlay(!useEditor.getState().simPlay);
        return;
      }
      if (useEditor.getState().simWalk != null && (ev.key === "ArrowRight" || ev.key === "ArrowLeft")) {
        ev.preventDefault();
        ev.stopPropagation();
        setSimWalk((useEditor.getState().simWalk ?? 0) + (ev.key === "ArrowRight" ? 1 : -1));
        return;
      }
      // style clipboard and lock: Mod+Alt+C / V / L (key codes, because Alt changes the character on some keyboards)
      if (mod && ev.altKey && ev.code === "KeyC") {
        ev.preventDefault();
        copyStyle();
        return;
      }
      if (mod && ev.altKey && ev.code === "KeyV" && !useEditor.getState().readOnly) {
        ev.preventDefault();
        pasteStyle();
        return;
      }
      if (mod && ev.altKey && ev.code === "KeyL" && !useEditor.getState().readOnly && useEditor.getState().selNodes.length) {
        ev.preventDefault();
        setLocked();
        return;
      }
      if (ev.key === "F2" && useEditor.getState().selNodes.length === 1 && !useEditor.getState().readOnly) {
        ev.preventDefault();
        startRename(useEditor.getState().selNodes[0]);
        return;
      }
      // Enter on one selected block opens its settings box (double-click does too)
      if (ev.key === "Enter" && !mod && !ev.shiftKey && !ev.altKey && !useEditor.getState().settingsBox && useEditor.getState().selNodes.length === 1 && !useEditor.getState().shared) {
        const st = useEditor.getState();
        const sel1 = st.nodes.find((x) => x.id === st.selNodes[0]);
        if (sel1 && !isAnnot(sel1.type) && sel1.type !== "widget") {
          ev.preventDefault();
          openSettingsBox(sel1.id);
          return;
        }
      }
      if (mod && k === "a") {
        ev.preventDefault();
        selectNodes(useEditor.getState().nodes.map((n) => n.id));
        return;
      }
      if (mod && k === "c") {
        if (copySelection()) showToast("Copied");
        return;
      }
      if (ro) return;
      if (mod && k === "z") {
        ev.preventDefault();
        if (ev.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && k === "y") {
        ev.preventDefault();
        redo();
        return;
      }
      if (mod && k === "v") {
        ev.preventDefault();
        paste();
        return;
      }
      if (mod && ev.shiftKey && k === "l") {
        ev.preventDefault();
        runTidy();
        return;
      }
      if (mod && k === "d") {
        ev.preventDefault();
        duplicateSelection();
        return;
      }
      // layer order: Ctrl ] / Ctrl [ (with Shift: to front / to back); lock: Ctrl Shift K
      if (mod && (ev.code === "BracketRight" || ev.code === "BracketLeft") && useEditor.getState().selNodes.length) {
        ev.preventDefault();
        reorder(ev.code === "BracketRight" ? (ev.shiftKey ? "front" : "forward") : ev.shiftKey ? "back" : "backward");
        return;
      }
      if (mod && ev.shiftKey && k === "k" && useEditor.getState().selNodes.length) {
        ev.preventDefault();
        setLocked();
        return;
      }
      if (mod && k === "s") {
        ev.preventDefault();
        if (manage) manualVersion();
        return;
      }
      if (ev.key === "/" && !mod) {
        // quick-add at the centre of the canvas
        ev.preventDefault();
        const el = document.querySelector(".fm-stage")?.getBoundingClientRect();
        if (!el) return;
        const at = rf.screenToFlowPosition({ x: el.left + el.width / 2, y: el.top + el.height / 2 });
        openQuickAdd({ sx: el.width / 2, sy: el.height / 2, fx: at.x, fy: at.y, centre: true });
        return;
      }
      if (ev.key === "Delete" || ev.key === "Backspace") {
        ev.preventDefault();
        deleteSelection();
        return;
      }
      const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (arrows[ev.key] && useEditor.getState().selNodes.length) {
        ev.preventDefault();
        ev.stopPropagation();
        const st = ev.shiftKey ? 33 : 11;
        nudge(arrows[ev.key][0] * st, arrows[ev.key][1] * st);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presenting, runTidy, manage, rf]);

  // open the inspector sheet on small screens when something gets selected
  useEffect(
    () =>
      useEditor.subscribe((s, p) => {
        if ((s.selNodes !== p.selNodes || s.selEdge !== p.selEdge) && (s.selNodes.length || s.selEdge)) {
          setShowInsp(true);
          // picking a block while the funnel notes are open shows that block's details
          if (s.panel === "notes") setPanel("inspector");
        }
      }),
    [],
  );

  // when the details panel floats over the canvas (1024-1279) or covers the lower half (sheet), pan so the selection stays visible
  useEffect(
    () =>
      useEditor.subscribe((st, prev) => {
        if (st.selNodes === prev.selNodes || !st.selNodes.length) return;
        const w = window.innerWidth;
        if (w >= 1280) return;
        requestAnimationFrame(() => {
          const stage = document.querySelector(".fm-stage")?.getBoundingClientRect();
          if (!stage) return;
          const vp = rf.getViewport();
          const sel = st.nodes.filter((n) => st.selNodes.includes(n.id));
          if (!sel.length) return;
          const l = Math.min(...sel.map((n) => n.x)) * vp.zoom + vp.x,
            r = Math.max(...sel.map((n) => n.x + widthOf(n))) * vp.zoom + vp.x,
            t = Math.min(...sel.map((n) => n.y)) * vp.zoom + vp.y,
            b = Math.max(...sel.map((n) => n.y + heightOf(n))) * vp.zoom + vp.y;
          // free area: left of the 320px floating panel (md), or above the bottom sheet (tablet / phone)
          const freeW = w >= 1024 ? stage.width - 340 : stage.width;
          let freeH = w >= 1024 ? stage.height : stage.height * 0.5 - 8;
          if (w < 1024) {
            // the sheet's real height (it is 40-90% of the screen and can sit above the action bar), not a fixed half
            const sheet = document.querySelector(".fm-insp") as HTMLElement | null;
            if (sheet) {
              const sheetTop = window.innerHeight - (parseFloat(getComputedStyle(sheet).bottom) || 0) - sheet.getBoundingClientRect().height;
              freeH = sheetTop - stage.top - 8;
            }
          }
          let dx = 0,
            dy = 0;
          if (r > freeW - 12) dx = freeW - 12 - r;
          if (l + dx < 12) dx = 12 - l;
          if (b > freeH - 12) dy = freeH - 12 - b;
          if (t + dy < 12) dy = 12 - t;
          if (dx || dy) rf.setViewport({ x: vp.x + dx, y: vp.y + dy, zoom: vp.zoom }, { duration: 250 });
        });
      }),
    [rf],
  );

  // Simulate on a narrower screen: the panel covers part of the map, so fit the whole funnel into the part that stays visible
  useEffect(
    () =>
      useEditor.subscribe((st, prev) => {
        if (!st.simBase || prev.simBase) return;
        const w = window.innerWidth;
        if (w >= 1280) return;
        requestAnimationFrame(() => {
          const stage = document.querySelector(".fm-stage")?.getBoundingClientRect();
          const flow = st.nodes.filter((n) => !isAnnot(n.type));
          if (!stage || !flow.length) return;
          const l = Math.min(...flow.map((n) => n.x)),
            r = Math.max(...flow.map((n) => n.x + widthOf(n))),
            t = Math.min(...flow.map((n) => n.y)),
            b = Math.max(...flow.map((n) => n.y + heightOf(n)));
          const freeW = w >= 1024 ? stage.width - 340 : stage.width,
            freeH = w >= 1024 ? stage.height : stage.height * 0.5 - 8;
          const pad = 56;
          const zoom = Math.max(0.1, Math.min(1, (freeW - pad) / (r - l), (freeH - pad - 40) / (b - t)));
          rf.setViewport({ zoom, x: (freeW - (r - l) * zoom) / 2 - l * zoom, y: 52 + (freeH - 52 - (b - t) * zoom) / 2 - t * zoom }, { duration: 300 });
        });
      }),
    [rf],
  );

  // keep the address in sync with Map / Reports so the view can be bookmarked or shared with the team
  useEffect(
    () =>
      useEditor.subscribe((st, prev) => {
        if (st.mode === prev.mode && st.section === prev.section) return;
        const u = new URL(window.location.href);
        if (st.mode === "reports") {
          u.searchParams.set("view", "reports");
          u.searchParams.set("section", st.section);
        } else {
          u.searchParams.delete("view");
          u.searchParams.delete("section");
        }
        window.history.replaceState(window.history.state, "", u);
      }),
    [],
  );

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => useEditor.setState({ toast: null }), toast.action ? 6000 : 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const saveLabel: Record<string, string> = { saved: "Saved", dirty: "Unsaved", saving: "Saving…", offline: "Offline · kept on this device", error: "Couldn’t save", readonly: "View only" };
  const canEdit = manage || !!share?.canEdit;
  const cls = ["fm-editor", clientView && "fm-clientview", band !== "xl" && `fm-${band}`, band === "phone" && (selNodesCount > 0 || !!selEdgeId || selectMode) && "fm-has-bar", reports && "fm-mode-reports", showSide && "show-side", showInsp && "show-insp", collapsed.side && "fm-collapse-side", collapsed.insp && "fm-collapse-insp", !opts.nums && "fm-hide-nums", !opts.notes && "fm-hide-notes", !opts.checks && "fm-hide-checks", share?.hideNumbers && "fm-hide-all", sharedView && band === "phone" && hasWidgets && !reports && "fm-has-shared-wg", readOnly && "fm-readonly"].filter(Boolean).join(" ");

  const fileMenu = (close: () => void) => (
            <>
              {owner && (
                <>
                  {manage && (
                    <button type="button" role="menuitem" onClick={() => (close(), manualVersion())}>
                      Save version<kbd>Ctrl S</kbd>
                    </button>
                  )}
                  <button type="button" role="menuitem" onClick={() => (close(), setPanel("versions"), setShowInsp(true))}>
                    Version history
                  </button>
                  {manage && (
                    <>
                      <button type="button" role="menuitem" onClick={() => (close(), tplRef.current?.showModal())}>
                        Save as template
                      </button>
                      <hr />
                      <button type="button" role="menuitem" onClick={() => (close(), fileRef.current?.click())} disabled={readOnly}>
                        Import funnel (.json)
                      </button>
                    </>
                  )}
                </>
              )}
              <div className="ph">Export</div>
              <button type="button" role="menuitem" onClick={() => (close(), setExportOpen(true))}>
                Export options…
              </button>
              <button type="button" role="menuitem" onClick={() => (close(), doExport("pdf"))}>
                PDF report for client
              </button>
              <button type="button" role="menuitem" onClick={() => (close(), doExport("png"))}>
                Map image (.png)
              </button>
              <button type="button" role="menuitem" onClick={() => (close(), doExport("svg"))}>
                Map image (.svg)
              </button>
              <label className="fm-layer-period">
                Image background
                <select value={opts.bg} onChange={(e) => setOpt("bg", e.target.value as typeof opts.bg)} aria-label="Map image background">
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="transparent">Transparent</option>
                </select>
              </label>
              <button type="button" role="menuitem" onClick={() => (close(), doExport("csv"))}>
                Step report (.csv)
              </button>
              <button type="button" role="menuitem" onClick={() => (close(), doExport("json"))}>
                Funnel file (.json)
              </button>
              <hr />
              <button type="button" role="menuitem" onClick={() => (close(), setPresenting(true))} disabled={!hasNodes}>
                <Icon name="play" size={16} /> Present
              </button>
            </>
  );
  const viewMenu = (close: () => void) => (
            <>
              <div className="ph">Layers</div>
              {!share?.hideNumbers && (
                <div className="fm-layer-presets">
                  {(["clean", "people", "money"] as const).map((v) => (
                    <button key={v} type="button" role="menuitemcheckbox" aria-checked={opts.view === v} onClick={() => setMapView(v)}>
                      {v === "clean" ? "Clean" : v === "people" ? "People" : "Money"}
                    </button>
                  ))}
                </div>
              )}
              <label>
                <input type="checkbox" checked={opts.notes} onChange={(e) => setOpt("notes", e.target.checked)} /> Notes
              </label>
              <label>
                <input type="checkbox" checked={opts.checks} onChange={(e) => setOpt("checks", e.target.checked)} /> Checklists
              </label>
              {canEdit && (
                <label className="fm-layer-period">
                  Currency
                  <select value={currency} disabled={readOnly} aria-label="Currency" onChange={(e) => isCurrency(e.target.value) && setSettings({ currency: e.target.value })}>
                    {CURRENCY_CODES.map((c) => (
                      <option key={c} value={c}>
                        {CURRENCIES[c].label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <hr />
              <label>
                <input type="checkbox" checked={opts.snap} onChange={(e) => setOpt("snap", e.target.checked)} /> Snap to grid
              </label>
              <label>
                <input type="checkbox" checked={opts.mini} onChange={(e) => setOpt("mini", e.target.checked)} /> Mini map
              </label>
              {canEdit && (
                <label>
                  <input type="checkbox" checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} /> View only (lock editing)
                </label>
              )}
              {manage && (
                <label>
                  <input type="checkbox" checked={hideNumbersSetting} onChange={(e) => setSettings({ hideNumbers: e.target.checked })} /> Hide numbers on share links
                </label>
              )}
              <hr />
              {canEdit && (
                <>
                  <button type="button" role="menuitem" onClick={() => (close(), runTidy("tidy"))} disabled={readOnly}>
                    Tidy up layout<kbd>Ctrl Shift L</kbd>
                  </button>
                  <button type="button" role="menuitem" onClick={() => (close(), runTidy("elk"))} disabled={readOnly}>
                    Tidy up (ELK layered)
                  </button>
                </>
              )}
              <button type="button" role="menuitem" onClick={() => (close(), rf.fitView({ padding: 0.15, duration: 250, maxZoom: 1.2 }))}>
                Fit map to screen
              </button>
              <button type="button" role="menuitem" onClick={() => (close(), toggleTheme())}>
                Switch light / dark
              </button>
              <button type="button" role="menuitem" onClick={() => (close(), helpRef.current?.showModal())}>
                Keyboard shortcuts<kbd>?</kbd>
              </button>
            </>
  );

  if (presenting)
    return (
      <div className="fm-present">
        <div className="fm-stage">
          <Canvas />
        </div>
        <Presenter onExit={() => setPresenting(false)} />
      </div>
    );

  return (
    <div className={cls}>
      <header className="fm-top">
        {owner && (
          <Link href="/" className="fm-logo" aria-label="Home" title="Home">
            <Icon name="logo" size={17} strokeWidth={2.2} />
          </Link>
        )}
        {!owner && (
          <span className="flex items-center gap-2 font-display font-extrabold">
            {agency.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={agency.logo_url} alt="" className="h-7 w-7 rounded-md bg-white object-contain" />
            ) : (
              <BrandMark />
            )}
            <span className="fm-hide-sm">{agency.name}</span>
            {client.name && (
              <>
                <i className="fm-logo-x" aria-hidden="true">
                  ×
                </i>
                {client.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={client.logo_url} alt={`${client.name} logo`} className="h-7 w-7 rounded-md bg-white object-contain" />
                ) : (
                  <span className="grid h-7 w-7 place-items-center rounded-md bg-brand-soft text-xs font-bold text-brand" aria-hidden="true">
                    {client.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="fm-hide-sm font-semibold">{client.name}</span>
              </>
            )}
          </span>
        )}
        {owner && (
          <Link href={`/clients/${client.id}`} className="btn icon fm-phone-only" aria-label={`Back to ${client.name}`}>
            <Icon name="back" />
          </Link>
        )}
        <div className="fm-crumbs">
          {owner && (
            <>
              <Link href={`/clients/${client.id}`} className="fm-crumb fm-hide-phone" aria-label={`Back to ${client.name}`} title={`Back to ${client.name}`}>
                {client.name}
              </Link>
              <span className="sep fm-hide-phone" aria-hidden="true">
                /
              </span>
            </>
          )}
          <label className="sr-only" htmlFor="fm-fname">
            Funnel name
          </label>
          <input id="fm-fname" className="fm-fname" value={name} onChange={(e) => setName(e.target.value)} readOnly={readOnly || !manage} title={name} />
          <span className="fm-hide-phone">
            <Menu label="Funnel menu" className="fm-cbtn" buttonContent={<Icon name="chevronDown" size={14} />}>
              {(close) => (
                <>
                  {fileMenu(close)}
                  {manage && (
                    <>
                      <hr />
                      <div className="menu-label">Status</div>
                      {FUNNEL_STATUSES.map((st) => (
                        <button
                          key={st}
                          type="button"
                          role="menuitemradio"
                          aria-checked={status === st}
                          onClick={async () => {
                            close();
                            await changeStatus(st);
                          }}
                        >
                          {STATUS_LABEL[st]}
                          {status === st && <Icon name="check" size={14} />}
                        </button>
                      ))}
                    </>
                  )}
                  <hr />
                  <div className="menu-label">View</div>
                  {viewMenu(close)}
                </>
              )}
            </Menu>
          </span>
          <span className="fm-saved fm-hide-md" data-s={saveStatus} role="status" aria-live="polite">
            <span className="dot" aria-hidden="true" />
            {saveLabel[saveStatus]}
            {saveStatus === "error" && (
              <button type="button" className="fm-saved-retry" onClick={() => window.dispatchEvent(new Event("fm-save-retry"))}>
                Retry
              </button>
            )}
          </span>
        </div>
        <span className="flex-1" />
        {!share?.hideNumbers && (
          <div className="seg fm-modes" role="group" aria-label="View">
            <button type="button" aria-pressed={!reports} onClick={() => setMode("map")} aria-label="Map" title="Map" className={reports ? undefined : "fm-hide-phone"}>
              <Icon name="map" size={14} />
              <span className="fm-lbl">Map</span>
            </button>
            <button type="button" aria-pressed={reports} onClick={() => setMode("reports")} title="Reports and insights" aria-label="Reports" className={reports ? "fm-hide-phone" : undefined}>
              <Icon name="chart" size={14} />
              <span className="fm-lbl fm-hide-phone">Reports</span>
            </button>
          </div>
        )}
        <span className="flex-1" />
        {owner && !sharedView && !share?.hideNumbers && (
          <PlanControl
            showActual={!reports}
            onNewScenario={() => {
              if (!useEditor.getState().simBase) startSim();
              setMode("map");
              setShowInsp(true);
              togglePanel("insp", false);
              setPanel("simulate");
            }}
          />
        )}
        {canEdit && (
          <span className="fm-edit-tools fm-hide-phone">
            <button type="button" className="btn icon ghost" aria-label="Undo" title={`Undo (${kbd("Mod+Z")})`} onClick={undo} disabled={readOnly || !canUndo}>
              <Icon name="undo" size={16} />
            </button>
            <button type="button" className="btn icon ghost" aria-label="Redo" title={`Redo (${kbd("Mod+Shift+Z")})`} onClick={redo} disabled={readOnly || !canRedo}>
              <Icon name="redo" size={16} />
            </button>
            <button type="button" className="btn tidy" title={`Tidy up layout (${kbd("Mod+Shift+L")})`} aria-label="Tidy up" onClick={() => runTidy()} disabled={readOnly}>
              <Icon name="tidy" size={15} />
              <span className="fm-lbl">Tidy up</span>
            </button>
          </span>
        )}
        {owner && <span className="fm-vr fm-hide-md" aria-hidden="true" />}
        <button type="button" className="btn icon fm-mobile-only fm-hide-phone" aria-label="Show numbers and details" title="Show numbers and details" aria-expanded={showInsp} onClick={() => setShowInsp((v) => !v)}>
          <Icon name="chart" />
        </button>
        {(owner || notesShared) && (
          <button type="button" className={`btn icon ghost fm-hide-phone${clientView ? "" : " fm-mobile-only"}`} aria-label="Funnel notes" title="Funnel notes" aria-pressed={panel === "notes"} onClick={() => (setPanel(panel === "notes" ? "inspector" : "notes"), setMode("map"), setShowInsp(true), togglePanel("insp", false))}>
            <Icon name="note" />
          </button>
        )}
        {owner && (
          <>
            <button type="button" className="btn icon ghost fm-hide-md relative" aria-label={`Client comments (${commentCount} open)`} title="Client comments" onClick={() => (setPanel("comments"), setShowInsp(true), togglePanel("insp", false))}>
              <Icon name="comment" size={16} />
              {commentCount > 0 && <span className="fm-cdot">{commentCount}</span>}
            </button>
            <button type="button" className="btn icon ghost fm-hide-md" aria-label="Version history" title="Version history" onClick={() => (setPanel("versions"), setShowInsp(true), togglePanel("insp", false))}>
              <Icon name="history" size={16} />
            </button>
            <button type="button" className="btn icon ghost fm-hide-md" aria-label="Present" title="Present to the client" onClick={() => setPresenting(true)} disabled={!hasNodes}>
              <Icon name="play" size={15} />
            </button>
            {manage && (
              <button
                type="button"
                className="btn primary fm-hide-phone"
                aria-label="Share"
                title="Share"
                onClick={() => {
                  setShareOpen(true);
                  shareRef.current?.showModal();
                }}
              >
                <Icon name="share" size={15} />
                <span className="fm-lbl">Share</span>
              </button>
            )}
            {props.viewer && (
              <span className="pill bg-brand-soft text-brand" title="You have view-only access to this workspace">
                View only
              </span>
            )}
          </>
        )}
        {mode === "share" && clientView && share?.allowComments && (
          <button type="button" className="btn" aria-pressed={viewerPanel} onClick={() => (setPanel("comments"), setViewerPanel((v) => !v))}>
            <Icon name="comment" size={15} /> <span>Comments</span>
          </button>
        )}
        {mode === "share" && (
          <button type="button" className="btn" onClick={() => setPresenting(true)} disabled={!hasNodes}>
            <Icon name="play" /> <span className="fm-hide-sm">{clientView ? "Walk me through" : "Present"}</span>
          </button>
        )}
        {/* below 1280: comments, history and present move into the overflow menu; on a phone it holds most of the bar */}
        {owner && (
          <span className="fm-over">
            <Menu label="More" align="right" className="btn icon" buttonContent={<Icon name="more" />}>
              {(close) => (
                <>
                  <div className="fm-undo-over">
                    {canEdit && (
                      <>
                        <button type="button" role="menuitem" onClick={() => (close(), undo())} disabled={readOnly || !canUndo}>
                          Undo
                        </button>
                        <button type="button" role="menuitem" onClick={() => (close(), redo())} disabled={readOnly || !canRedo}>
                          Redo
                        </button>
                        <button type="button" role="menuitem" onClick={() => (close(), runTidy())} disabled={readOnly}>
                          Tidy up
                        </button>
                        <button type="button" role="menuitem" onClick={() => (close(), useEditor.setState((x) => ({ selectMode: !x.selectMode })))} disabled={readOnly}>
                          {selectMode ? "Done selecting" : "Select blocks"}
                        </button>
                        <hr />
                      </>
                    )}
                  </div>
                  {canEdit && !readOnly && hasNodes && (
                    <button type="button" role="menuitem" className="fm-phone-only" onClick={() => (close(), toggleSim())}>
                      {simOn ? "Stop simulating" : "Simulate…"}
                    </button>
                  )}
                  <button type="button" role="menuitem" onClick={() => (close(), setPanel("comments"), setShowInsp(true), togglePanel("insp", false))}>
                    Client comments{commentCount > 0 ? ` (${commentCount})` : ""}
                  </button>
                  <button type="button" role="menuitem" className="fm-hide-phone" onClick={() => (close(), setPanel("versions"), setShowInsp(true), togglePanel("insp", false))}>
                    Version history
                  </button>
                  <button type="button" role="menuitem" className="fm-hide-phone" onClick={() => (close(), setPresenting(true))} disabled={!hasNodes}>
                    Present
                  </button>
                  {manage && (
                    <button type="button" role="menuitem" className="fm-phone-only" onClick={() => (close(), setShareOpen(true), shareRef.current?.showModal())}>
                      Share…
                    </button>
                  )}
                  <div className="fm-phone-only">
                    <hr />
                    {fileMenu(close)}
                    <hr />
                    {viewMenu(close)}
                  </div>
                </>
              )}
            </Menu>
          </span>
        )}
        {owner && (
          <span className="fm-av fm-hide-phone" title={props.userName ?? ""} aria-hidden="true">
            {(props.userName ?? "")
              .replace(/@.*/, "")
              .split(/[\s._-]+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((w) => w[0]!.toUpperCase())
              .join("") || "?"}
          </span>
        )}
      </header>

      <EditorRail
        readOnly={readOnly}
        sideCollapsed={collapsed.side}
        onToggleSide={() => togglePanel("side")}
        showNotes={owner || notesShared}
        notesActive={panel === "notes"}
        onNotes={() => (setPanel(panel === "notes" ? "inspector" : "notes"), setMode("map"), setShowInsp(true), togglePanel("insp", false))}
        onHelp={() => tipsRef.current?.showModal()}
        onShortcuts={() => helpRef.current?.showModal()}
      />

      <aside className="fm-side" id="fm-side" aria-label="Building blocks">
        {readOnly ? (
          <div className="px-1 py-2">
            <h2>{client.name}</h2>
            <p className="hint">{funnel.description || "Funnel map"}</p>
            {client.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={client.logo_url} alt={`${client.name} logo`} className="mt-4 max-h-20 rounded-lg bg-white object-contain p-2" />
            )}
            {canEdit && (
              <button type="button" className="btn mt-6 w-full" onClick={() => setReadOnly(false)}>
                <Icon name="edit" /> Edit this funnel
              </button>
            )}
          </div>
        ) : (
          <>
            {sideTab === "library" && <Palette products={props.products ?? []} clientName={client.name} onCollapse={() => togglePanel("side")} onPicked={() => (setShowSide(false), closeOverlayLibrary())} />}
            {sideTab === "outline" && <Outline />}
            {sideTab === "blocks" && <WorkspaceBlocks />}
            {sideTab === "math" && <MathPanel />}
            {sideTab === "templates" && <TemplatesPanel onPicked={() => (setShowSide(false), closeOverlayLibrary())} />}
          </>
        )}
      </aside>

      <section className={`fm-stage${simOn && !reports ? " sim" : ""}`} aria-label="Funnel canvas" onClick={() => showSide && setShowSide(false)} onPointerDown={closeOverlayLibrary}>
        {ready && <Canvas />}
        {saveStatus === "offline" && !reports && (
          <div className="fm-offline" role="status">
            <b>You’re offline.</b> Changes are kept on this device and will save when you’re back.
          </div>
        )}
        {ready && !reports && owner && !share?.hideNumbers && <EditingBanner />}
        {ready && !reports && !share?.hideNumbers && (
          <div className="fm-stagebar">
            {!readOnly && (
              <button type="button" className="btn fm-libbtn" aria-expanded={showSide} onClick={() => setShowSide((v) => !v)}>
                <Icon name="panelLeft" size={15} /> Library
              </button>
            )}
            <ViewSwitch />
            <RangePicker />
            <span className="fm-vr" aria-hidden="true" />
            <LayersMenu />
          </div>
        )}
        {simOn && !reports && <SimBar onOpenChecks={() => (setTab("math"), setShowInsp(true), togglePanel("insp", false))} />}
        {simBefore && !reports && (
          <div className="fm-before-badge" role="status">
            Before your changes
          </div>
        )}
        {actualView && !reports && (
          <div className="fm-before-badge actual" role="status">
            <span className="fm-tag actual">Actual</span> {actualView.label}
          </div>
        )}
        {ready && !reports && <FloatingToolbar />}
        {ready && !hasNodes && (
          <div className="fm-canvas-empty">
            <div>
              <strong>Map your first funnel</strong>
              Add a traffic source, the pages people visit, then the offers they buy. Use a Yes/No condition for every decision.
              {!readOnly && (
                <span className="acts">
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => {
                      const el = document.querySelector(".fm-stage")?.getBoundingClientRect();
                      if (!el) return;
                      const at = rf.screenToFlowPosition({ x: el.left + el.width / 2, y: el.top + el.height / 2 });
                      openQuickAdd({ sx: el.width / 2, sy: el.height / 2, fx: at.x, fy: at.y, centre: true });
                    }}
                  >
                    Add a block
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setSideTab("templates");
                      setOpt("hideSide", false);
                      setShowSide(true);
                    }}
                  >
                    Start from a template
                  </button>
                </span>
              )}
            </div>
          </div>
        )}
        {ready && !readOnly && !reports && (
          <button type="button" className="fm-fab" aria-label="Show building blocks" title="Show building blocks" aria-expanded={showSide} onClick={() => setShowSide((v) => !v)}>
            <Icon name="plus" size={24} />
          </button>
        )}
        <ZoomControls />
        <QuickAdd />
        <SettingsBox />
        <ActualsHost />
        <LineMenu />
      </section>

      {collapsed.insp && !reports && !clientView && (
        <nav className="fm-irail" aria-label="Details panel (collapsed)">
          <button type="button" aria-label="Expand details panel" title="Show details panel (])" onClick={() => togglePanel("insp", false)}>
            <Icon name="chevronLeft" size={15} />
          </button>
          <button type="button" aria-label="Funnel" title={checkCount ? `Funnel · ${checkCount} to fix` : "Funnel"} className="fm-irail-checks" onClick={() => (setPanel("inspector"), togglePanel("insp", false))}>
            <Icon name="sliders" size={15} />
            {checkCount > 0 && <i aria-hidden="true">{checkCount}</i>}
          </button>
          {owner && !sharedView && (
            <button type="button" aria-label="Goals" title="Goals" onClick={() => setSection("goals")}>
              <Icon name="target" size={15} />
            </button>
          )}
          <button type="button" aria-label="Outline" title="Outline of the funnel" onClick={() => (setSideTab("outline"), togglePanel("side", false))}>
            <Icon name="list" size={15} />
          </button>
          {owner && !readOnly && !sharedView && (
            <button type="button" aria-label="Simulate" title="Simulate (S)" onClick={() => (simOn ? setPanel("simulate") : toggleSim(), togglePanel("insp", false))}>
              <Icon name="play" size={15} />
            </button>
          )}
          {(owner || notesShared) && (
            <button type="button" aria-label="Funnel notes" title="Funnel notes" onClick={() => (setPanel("notes"), togglePanel("insp", false))}>
              <Icon name="note" size={15} />
            </button>
          )}
          {manage && (
            <button type="button" aria-label="Version history" title="Version history" onClick={() => (setPanel("versions"), togglePanel("insp", false))}>
              <Icon name="history" size={15} />
            </button>
          )}
        </nav>
      )}
      <aside className="fm-insp" id="fm-insp" aria-label="Details" style={band === "tablet" || band === "phone" ? { height: `${sheetH}dvh` } : undefined}>
        {band !== "tablet" && band !== "phone" && !clientView && (
          <button type="button" className="fm-icollapse" aria-label="Collapse details panel" title="Hide the details panel (])" onClick={() => togglePanel("insp", true)}>
            <Icon name="chevronRight" size={15} />
          </button>
        )}
        <div
          className="fm-sheet-grab"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Drag to resize the details sheet"
          aria-valuenow={Math.round(sheetH)}
          aria-valuemin={30}
          aria-valuemax={90}
          aria-valuetext={`${Math.round(sheetH)}% of the screen`}
          tabIndex={0}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            sheetDrag.current = { y: e.clientY, h: sheetH };
          }}
          onPointerMove={(e) => {
            const d = sheetDrag.current;
            if (!d) return;
            setSheetH(Math.max(30, Math.min(90, d.h + ((d.y - e.clientY) / window.innerHeight) * 100)));
          }}
          onPointerUp={() => {
            sheetDrag.current = null;
            setSheetH((h) => (h > 70 ? 90 : 50)); // snap: half height, or nearly full
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") setSheetH(90);
            if (e.key === "ArrowDown") setSheetH(50);
          }}
        />
        <div className="fm-sheet-close">
          <button type="button" className="btn icon ghost" aria-label="Close details" title="Close details" onClick={() => setShowInsp(false)}>
            <Icon name="close" />
          </button>
        </div>
        {panel === "simulate" && simOn ? (
          <SimulatePanel />
        ) : panel === "notes" && (owner || notesShared) ? (
          <CanvasNotes />
        ) : owner && panel === "versions" ? (
          <VersionsPanel onSaved={manage ? uploadThumbnail : undefined} />
        ) : owner && panel === "comments" ? (
          <CommentsPanel onCount={setCommentCount} />
        ) : (
          <>
            <Inspector />
            {share?.allowComments && <ShareComments token={share.token} initial={share.comments} />}
          </>
        )}
      </aside>

      {sharedView && band === "phone" && !reports && !share?.hideNumbers && <SharedWidgets />}
      {!share?.hideNumbers && (band === "phone" && (selNodesCount > 0 || selEdgeId || selectMode) ? <PhoneActionBar /> : <KpiBar />)}
      {reports && <ReportsView onExportPdf={manage || share?.canEdit || mode === "share" ? () => doExport("pdf") : undefined} />}

      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) doImport(f);
        }}
      />
      <HelpDialog ref={helpRef} />
      <HelpDialog ref={tipsRef} mode="help" />
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} onPdf={(omit) => void doExport("pdf", omit)} onImage={(k) => void doExport(k)} onData={(k) => void doExport(k)} />
      {manage && <ShareDialog ref={shareRef} funnelId={funnel.id} open={shareOpen} clientName={client.name} clientLogo={client.logo_url} agencyName={agency.name} agencyLogo={agency.logo_url} />}
      {manage && props.userId && <TemplateDialog ref={tplRef} userId={props.userId} defaultName={name} description={funnel.description} />}
      {ready && (
        <ContextMenu
          onTidy={() => runTidy()}
          onFit={() => rf.fitView({ padding: 0.15, duration: 250, maxZoom: 1.2 })}
          onShortcuts={() => helpRef.current?.showModal()}
          onWidget={(scope, at) => {
            const st = useEditor.getState();
            const flowSel = st.selNodes.filter((id) => st.nodes.some((x) => x.id === id && !isAnnot(x.type)));
            const box = document.querySelector(".fm-stage")?.getBoundingClientRect();
            const centre = box ? rf.screenToFlowPosition({ x: box.left + box.width / 2, y: box.top + box.height / 3 }) : { x: 100, y: 100 };
            if (scope === "selection" && flowSel.length) {
              const ns = st.nodes.filter((x) => flowSel.includes(x.id));
              addWidget({ scope: "selection", nodeIds: flowSel }, Math.max(...ns.map((x) => x.x + widthOf(x))) + 40, Math.min(...ns.map((x) => x.y)));
            } else addWidget({ scope: "funnel" }, at?.x ?? centre.x, at?.y ?? centre.y);
          }}
        />
      )}
      {ready && <TypePicker />}
      {toast && (
        <div className="fm-toast" role="status" key={toast.id}>
          {toast.text}
          {toast.action && toast.run && (
            <button type="button" onClick={() => (toast.run!(), useEditor.setState({ toast: null }))}>
              {toast.action}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
