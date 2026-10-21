"use client";
import "@xyflow/react/dist/base.css";
import { Background, BackgroundVariant, ConnectionMode, MiniMap, ReactFlow, SelectionMode, useReactFlow, type ConnectionLineComponentProps, type Connection, type Edge, type Node, type NodeChange, type EdgeChange, type FinalConnectionState } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { CATDARK, SIZED_TYPES, WIDTH_TYPES, fourPorts, isAnnot, portsFor, typeOf } from "@/lib/catalog";
import { SIDES, type FunnelEdge, type Side } from "@/lib/graph";
import { sidesOf } from "@/lib/editor/labels";
import { addNode, applyEyedropper, openSettingsBox, openLineMenu, openMenu, openQuickAdd, setDragging, startRename, canConnect, clearSelection, connect, reconnectEdge, frameMembers, layerOf, moveNodes, selectEdge, selectNodes, setDims, setOpt, setView, showToast, useEditor } from "@/lib/editor/store";
import { edgeTypes } from "./flow-edge";
import { nodeTypes } from "./nodes";

const OWN_TYPES = new Set(["note", "label", "frame", "shape", "image", "checklist", "link", "widget"]);
const rfType = (t: string) => (OWN_TYPES.has(t) ? t : "block");
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const isSide = (h: string | null | undefined): h is Side => !!h && (SIDES as readonly string[]).includes(h);
/** Who a new line carries, from the handle it was drawn from: the fixed No / B port, or a four-port block's bottom side (the old "didn't convert" habit); Yes otherwise. */
const portFrom = (fromType: string | undefined, handle: string | null | undefined): "main" | "alt" => {
  if (handle === "alt") return "alt";
  return handle === "bottom" && !!fromType && portsFor(fromType).hasAlt ? "alt" : "main";
};

export const DND_MIME = "application/x-funnel-block";

/** The line being dragged off a port: Emerald while it can land, amber when the block under it can't take people. */
function ConnectionLine({ fromX, fromY, toX, toY, fromPosition, connectionStatus }: ConnectionLineComponentProps) {
  const bad = connectionStatus === "invalid";
  const dx = Math.max(40, Math.abs(toX - fromX) / 2),
    dy = Math.max(40, Math.abs(toY - fromY) / 2);
  const c1 = fromPosition === "bottom" ? [fromX, fromY + Math.max(60, dy)] : fromPosition === "top" ? [fromX, fromY - Math.max(60, dy)] : fromPosition === "left" ? [fromX - dx, fromY] : [fromX + dx, fromY];
  const d = `M ${fromX} ${fromY} C ${c1[0]} ${c1[1]}, ${toX - dx} ${toY}, ${toX} ${toY}`;
  const c = bad ? "var(--attention)" : "var(--brand)";
  return (
    <g className="fm-connline" data-invalid={bad || undefined}>
      <path d={d} fill="none" stroke={c} strokeWidth={2.5} strokeDasharray="6 5" strokeLinecap="round" />
      <circle cx={toX} cy={toY} r={6} fill="var(--panel)" stroke={c} strokeWidth={2.5} />
    </g>
  );
}

export function Canvas() {
  const nodes = useEditor((s) => s.nodes);
  const edges = useEditor((s) => s.edges);
  const selNodes = useEditor((s) => s.selNodes);
  const selEdge = useEditor((s) => s.selEdge);
  const opts = useEditor((s) => s.opts);
  const readOnly = useEditor((s) => s.readOnly);
  const view = useEditor((s) => s.view);
  const rf = useReactFlow();
  // a funnel that has never been panned/zoomed (default view) is fitted to the screen on first load
  const [fitOnInit] = useState(() => {
    const s = useEditor.getState();
    return s.nodes.length > 0 && s.view.x === 60 && s.view.y === 40 && s.view.k === 1;
  });
  // phone: a wide funnel opens at a readable zoom from its first block (R-phone-editor), not shrunk to a 25% overview where nothing can be read; Fit still shows it all
  const [phoneStart] = useState(() => {
    if (!fitOnInit || typeof window === "undefined" || window.innerWidth >= 768) return null;
    const ns = useEditor.getState().nodes;
    const minX = Math.min(...ns.map((n) => n.x)),
      maxX = Math.max(...ns.map((n) => n.x + (n.w ?? 210))),
      minY = Math.min(...ns.map((n) => n.y)),
      maxY = Math.max(...ns.map((n) => n.y + (n.h ?? 110)));
    const stageH = window.innerHeight - 56 - 64; // top bar and numbers strip
    const fit = Math.min((window.innerWidth - 32) / (maxX - minX), (stageH - 120) / (maxY - minY));
    if (fit >= 0.5) return null; // small enough to read when fitted: keep the built-in fit
    const k = 0.5;
    return { x: 16 - minX * k, y: Math.max(72, stageH / 2 - ((minY + maxY) / 2) * k - 24), k };
  });
  const dims = useEditor((s) => s.dims);
  const frameDrag = useRef<{ frame: string; start: { x: number; y: number }; members: Record<string, { x: number; y: number }> } | null>(null);

  const rfNodes: Node[] = useMemo(() => {
    const sel = new Set(selNodes);
    return nodes.map((n) => {
      const sized = SIZED_TYPES.has(n.type);
      const m = dims[n.id];
      return {
        id: n.id,
        type: rfType(n.type),
        position: { x: n.x, y: n.y },
        data: { id: n.id },
        selected: sel.has(n.id),
        zIndex: layerOf(n),
        ...(sized ? { width: n.w ?? 200, height: n.h ?? 120, style: { width: n.w ?? 200, height: n.h ?? 120 } } : {}),
        ...(!sized && WIDTH_TYPES.has(n.type) && n.w ? { style: { width: n.w } } : {}),
        ...(m && !sized ? { measured: m } : {}),
        draggable: !readOnly && !n.locked,
        deletable: !n.locked,
        connectable: !readOnly,
        ariaLabel: `${typeOf(n.type)?.label}: ${n.name}${n.locked ? " (locked)" : ""}`,
      } satisfies Node;
    });
  }, [nodes, selNodes, readOnly, dims]);

  const rfEdges: Edge[] = useMemo(() => {
    const B = Object.fromEntries(nodes.map((n) => [n.id, n]));
    return edges
      .filter((e) => B[e.from] && B[e.to])
      .map((e) => {
        // four-port blocks use the stored sides; Yes/No logic keeps its fixed main / alt ports and its left input
        const [sh, th] = sidesOf(e);
        const fromFour = fourPorts(B[e.from].type),
          toFour = fourPorts(B[e.to].type);
        return {
          id: e.id,
          source: e.from,
          target: e.to,
          sourceHandle: fromFour ? sh : e.port === "alt" ? "alt" : "main",
          targetHandle: toFour ? th : "in",
          type: "flow",
          selected: selEdge === e.id,
          data: { port: e.port, fromType: B[e.from]?.type, from: e.from, to: e.to, share: e.share, s: e.s },
        };
      });
  }, [edges, nodes, selEdge]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const pos: Record<string, { x: number; y: number }> = {};
    const sizes: Record<string, { width: number; height: number }> = {};
    // selection: React Flow asks, the store decides (fully controlled, no feedback loop)
    const sel = changes.filter((c) => c.type === "select");
    if (sel.length) {
      const st = useEditor.getState();
      const next = new Set(st.selNodes);
      sel.forEach((c) => (c.selected ? next.add(c.id) : next.delete(c.id)));
      const ids = st.nodes.map((n) => n.id).filter((id) => next.has(id));
      if (!same(ids, st.selNodes)) {
        if (ids.length) selectNodes(ids);
        else if (!st.selEdge) clearSelection();
        else useEditor.setState({ selNodes: [] });
      }
    }
    for (const c of changes) {
      if (c.type === "position" && c.position) pos[c.id] = { x: Math.round(c.position.x), y: Math.round(c.position.y) };
      if (c.type === "dimensions" && c.dimensions) {
        const node = useEditor.getState().nodes.find((n) => n.id === c.id);
        if (node && SIZED_TYPES.has(node.type)) {
          if (c.resizing) moveNodes({ [c.id]: { x: node.x, y: node.y, w: Math.round(c.dimensions.width), h: Math.round(c.dimensions.height) } });
          continue;
        }
        // width-only elements: follow the handle live; their height is measured from the content
        if (node && WIDTH_TYPES.has(node.type) && c.resizing) moveNodes({ [c.id]: { x: node.x, y: node.y, w: Math.round(c.dimensions.width) } });
        sizes[c.id] = { width: Math.round(c.dimensions.width), height: Math.round(c.dimensions.height) };
      }
    }
    if (Object.keys(sizes).length) setDims(sizes);
    if (!Object.keys(pos).length) return;
    // dragging a frame carries the blocks inside it
    const fd = frameDrag.current;
    if (fd && pos[fd.frame]) {
      const dx = pos[fd.frame].x - fd.start.x,
        dy = pos[fd.frame].y - fd.start.y;
      for (const [id, p] of Object.entries(fd.members)) if (!pos[id]) pos[id] = { x: p.x + dx, y: p.y + dy };
    }
    moveNodes(pos);
  }, []);

  const onNodeDragStart = useCallback((_: unknown, node: Node) => {
    setDragging(true);
    const s = useEditor.getState();
    const n = s.nodes.find((x) => x.id === node.id);
    if (n?.type !== "frame") {
      frameDrag.current = null;
      return;
    }
    const sel = new Set(s.selNodes);
    const members = Object.fromEntries(
      frameMembers(n.id)
        .filter((id) => !sel.has(id) && !s.nodes.find((x) => x.id === id)?.locked)
        .map((id) => {
          const m = s.nodes.find((x) => x.id === id)!;
          return [id, { x: m.x, y: m.y }];
        }),
    );
    frameDrag.current = { frame: n.id, start: { x: n.x, y: n.y }, members };
  }, []);

  // Edges are selected only by clicking them (box selection must not hand the selection to an edge);
  // React Flow's deselect changes still clear it.
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    for (const c of changes) if (c.type === "select" && !c.selected && useEditor.getState().selEdge === c.id) useEditor.setState({ selEdge: null });
  }, []);

  const typeOfId = (id: string) => useEditor.getState().nodes.find((n) => n.id === id)?.type;
  // the line whose end is being dragged to another dot: it must not count as its own duplicate
  const reconnecting = useRef<string | undefined>(undefined);
  // Pressing a dot that a line ENDS on and dragging moves that end (the line keeps its style, label and share); a dot a line starts
  // from still draws a new line. { edge, node } while such a drag is on.
  const moving = useRef<{ edge: string; node: string; handle: string } | null>(null);
  const startMove = useCallback((p: { nodeId: string | null; handleId: string | null; handleType: string | null }) => {
    moving.current = null;
    const st = useEditor.getState();
    if (st.readOnly || !p.nodeId || !p.handleId) return;
    const here = st.nodes.find((n) => n.id === p.nodeId);
    if (!here) return;
    const endsHere = (e: FunnelEdge) => e.to === here.id && (fourPorts(here.type) ? sidesOf(e)[1] === p.handleId : p.handleId === "in");
    const startsHere = (e: FunnelEdge) => e.from === here.id && (fourPorts(here.type) ? sidesOf(e)[0] === p.handleId : p.handleId === (e.port === "alt" ? "alt" : "main"));
    if (st.edges.some(startsHere)) return;
    const ends = st.edges.filter(endsHere);
    const pick = ends.find((e) => e.id === st.selEdge) ?? ends[ends.length - 1];
    if (pick) moving.current = { edge: pick.id, node: here.id, handle: p.handleId };
  }, []);
  /** Where the moved end would land for a connection RF reports (the start dot's node is one side of it). */
  const landing = (c: { source: string; target: string; sourceHandle: string | null; targetHandle: string | null }) => {
    const m = moving.current!;
    return c.source === m.node && !(c.target === m.node && c.sourceHandle === c.targetHandle) ? { id: c.target, handle: c.targetHandle } : { id: c.source, handle: c.sourceHandle };
  };
  const isValidConnection = useCallback(
    (c: Connection | Edge) => {
      if (!c.source || !c.target) return false;
      if (moving.current) {
        const e = useEditor.getState().edges.find((x) => x.id === moving.current!.edge);
        const at = landing({ source: c.source, target: c.target, sourceHandle: c.sourceHandle ?? null, targetHandle: c.targetHandle ?? null });
        const t = useEditor.getState().nodes.find((n) => n.id === at.id);
        const sameDot = !!e && at.id === e.to && (!t || !fourPorts(t.type) || !isSide(at.handle) || at.handle === sidesOf(e)[1]);
        return !!e && !sameDot && canConnect(e.from, at.id, e.port, e.id);
      }
      return canConnect(c.source, c.target, portFrom(typeOfId(c.source), c.sourceHandle), reconnecting.current);
    },
    [],
  );
  const onReconnect = useCallback((old: Edge, c: Connection) => {
    const e = useEditor.getState().edges.find((x) => x.id === old.id);
    if (!e) return;
    // an end that did not move keeps what the line already means (Yes / No)
    const port = c.source === e.from && c.sourceHandle === old.sourceHandle ? e.port : portFrom(typeOfId(c.source), c.sourceHandle);
    const [sh0, th0] = sidesOf(e);
    const sh = isSide(c.sourceHandle) ? c.sourceHandle : undefined,
      th = isSide(c.targetHandle) ? c.targetHandle : undefined;
    if (!reconnectEdge(e.id, { from: c.source, to: c.target, port, sh: sh ?? (c.source === e.from ? sh0 : undefined), th: th ?? (c.target === e.to ? th0 : undefined) })) showToast("That block can’t take this line");
  }, []);
  // the line just made by onConnect: onConnectEnd (which knows the pointer) opens its meaning menu there
  const made = useRef<string | null>(null);
  const onConnect = useCallback((c: Connection) => {
    if (moving.current) {
      const e = useEditor.getState().edges.find((x) => x.id === moving.current!.edge);
      const at = landing(c);
      const t = useEditor.getState().nodes.find((n) => n.id === at.id);
      if (e && !reconnectEdge(e.id, { from: e.from, to: at.id, port: e.port, sh: e.sh, th: t && fourPorts(t.type) && isSide(at.handle) ? at.handle : undefined })) showToast("That block can’t take this line");
      return;
    }
    const fromType = typeOfId(c.source);
    made.current = connect(c.source, portFrom(fromType, c.sourceHandle), c.target, { sh: isSide(c.sourceHandle) ? c.sourceHandle : undefined, th: isSide(c.targetHandle) ? c.targetHandle : undefined });
  }, []);
  // Like the prototype: dropping a connection anywhere on a block (not just its input dot) connects to it.
  const onConnectEnd = useCallback(
    (ev: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      const pt = "changedTouches" in ev ? ev.changedTouches[0] : ev;
      const box = (document.querySelector(".fm-stage") as HTMLElement | null)?.getBoundingClientRect();
      // a line from a block that can lead to "No": ask what the line means, right where it was released
      const lineMenu = (id: string | null) => {
        const st = useEditor.getState();
        const e = id ? st.edges.find((x) => x.id === id) : undefined;
        const from = e && st.nodes.find((n) => n.id === e.from);
        if (e && from && fourPorts(from.type) && portsFor(from.type).hasAlt && box) openLineMenu({ id: e.id, sx: pt.clientX - box.left, sy: pt.clientY - box.top });
      };
      if (moving.current) {
        // dropped on a block's body (not on a dot): the line's end moves there; on empty canvas nothing happens
        const m = moving.current;
        moving.current = null;
        if (state.isValid) return;
        const hitNode = document.elementFromPoint(pt.clientX, pt.clientY)?.closest(".react-flow__node")?.getAttribute("data-id");
        const e = useEditor.getState().edges.find((x) => x.id === m.edge);
        if (hitNode && e && hitNode !== e.to && hitNode !== m.node) {
          if (!reconnectEdge(e.id, { from: e.from, to: hitNode, port: e.port, sh: e.sh })) showToast("That block can’t take this line");
        }
        return;
      }
      if (state.isValid) {
        lineMenu(made.current);
        made.current = null;
        return;
      }
      if (!state.fromNode || state.fromHandle?.type !== "source") return;
      const fromType = typeOfId(state.fromNode.id);
      const port = portFrom(fromType, state.fromHandle.id);
      const sh = isSide(state.fromHandle.id) ? state.fromHandle.id : undefined;
      const hit = document.elementFromPoint(pt.clientX, pt.clientY);
      const target = hit?.closest(".react-flow__node")?.getAttribute("data-id");
      if (target) {
        // released on an existing block: connect directly (no Quick Add), or say why not
        if (canConnect(state.fromNode.id, target, port)) lineMenu(connect(state.fromNode.id, port, target, { sh }));
        else if (target !== state.fromNode.id) showToast("That block can’t take people from here");
        return;
      }
      // released on empty canvas: Quick Add at the endpoint, already wired to the port it came from
      if (!hit?.closest(".react-flow__pane") || useEditor.getState().readOnly) return;
      if (!box) return;
      const at = rf.screenToFlowPosition({ x: pt.clientX, y: pt.clientY });
      openQuickAdd({ sx: pt.clientX - box.left, sy: pt.clientY - box.top, fx: at.x, fy: at.y, from: { id: state.fromNode.id, port, sh } });
    },
    [rf],
  );

  const onDrop = useCallback(
    (ev: React.DragEvent) => {
      const raw = ev.dataTransfer.getData(DND_MIME);
      if (!raw) return;
      ev.preventDefault();
      const { type, p, name, w, h } = JSON.parse(raw) as { type: string; p?: Record<string, unknown>; name?: string; w?: number; h?: number };
      const at = rf.screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
      addNode(type, at.x - 105, at.y - 48, { p, name, w, h });
    },
    [rf],
  );

  // names and number chips grow a little as the map zooms out, so they stay readable (CSS vars on the stage; nothing re-renders)
  useEffect(() => {
    const set = (k: number) => {
      const el = document.querySelector<HTMLElement>(".fm-stage");
      if (!el) return;
      el.style.setProperty("--ck", String(Math.max(1, Math.min(1.3, 0.6 / k))));
      el.style.setProperty("--ckn", String(Math.max(1, Math.min(1.4, 0.55 / k))));
    };
    set(useEditor.getState().view.k);
    return useEditor.subscribe((s, p) => s.view.k !== p.view.k && set(s.view.k));
  }, []);

  // touch: a long press opens the same menus as a right-click
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".fm-stage .react-flow");
    if (!root) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let start: { x: number; y: number } | null = null;
    const cancel = () => {
      clearTimeout(timer);
      start = null;
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "touch" || e.isPrimary === false) return;
      cancel();
      start = { x: e.clientX, y: e.clientY };
      const target = e.target as Element;
      timer = setTimeout(() => {
        if (!start) return;
        target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: start.x, clientY: start.y }));
        start = null;
      }, 550);
    };
    const move = (e: PointerEvent) => start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10 && cancel();
    root.addEventListener("pointerdown", down);
    root.addEventListener("pointermove", move);
    root.addEventListener("pointerup", cancel);
    root.addEventListener("pointercancel", cancel);
    return () => {
      cancel();
      root.removeEventListener("pointerdown", down);
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerup", cancel);
      root.removeEventListener("pointercancel", cancel);
    };
  }, []);

  const miniColor = useCallback((n: Node) => {
    const node = useEditor.getState().nodes.find((x) => x.id === n.id);
    if (node?.type === "frame") return `${String(node.p.color ?? "#10B981")}26`;
    const T = node && typeOf(node.type);
    return T ? CATDARK[T.color ?? T.cat] : "#888";
  }, []);

  return (
    <ReactFlow
      proOptions={{ hideAttribution: true }}
      nodes={rfNodes}
      edges={rfEdges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onEdgeClick={(_, e) => selectEdge(e.id)}
      onNodeDragStart={onNodeDragStart}
      onNodeDragStop={() => {
        frameDrag.current = null;
        setDragging(false);
      }}
      onMoveStart={(ev) => ev && setDragging(true)}
      onNodeClick={(_, node) => {
        const st = useEditor.getState();
        if (st.eyedrop) return applyEyedropper(node.id);
        // phone "Select blocks" mode: taps add or remove blocks from the selection
        if (st.selectMode) selectNodes(st.selNodes.includes(node.id) ? st.selNodes.filter((x) => x !== node.id) : [...st.selNodes, node.id]);
      }}
      onNodeDoubleClick={(_, node) => {
        const st0 = useEditor.getState();
        const n = st0.nodes.find((x) => x.id === node.id);
        // double-click opens the block's settings box (F2 or "Rename" in the menu renames it)
        if (n && !isAnnot(n.type) && n.type !== "widget" && !st0.shared) openSettingsBox(n.id);
        else if (n && !isAnnot(n.type)) startRename(n.id);
      }}
      onNodeContextMenu={(ev, node) => {
        ev.preventDefault();
        const st = useEditor.getState();
        if (!st.selNodes.includes(node.id)) selectNodes([node.id]);
        openMenu({ kind: useEditor.getState().selNodes.length > 1 ? "selection" : "block", x: ev.clientX, y: ev.clientY, id: node.id });
      }}
      onSelectionContextMenu={(ev) => {
        ev.preventDefault();
        openMenu({ kind: "selection", x: ev.clientX, y: ev.clientY });
      }}
      onEdgeContextMenu={(ev, edge) => {
        ev.preventDefault();
        selectEdge(edge.id);
        openMenu({ kind: "edge", x: ev.clientX, y: ev.clientY, id: edge.id });
      }}
      onPaneContextMenu={(ev) => {
        ev.preventDefault();
        clearSelection();
        const at = rf.screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
        openMenu({ kind: "pane", x: ev.clientX, y: ev.clientY, fx: at.x, fy: at.y });
      }}
      onConnect={onConnect}
      edgesReconnectable={!readOnly}
      reconnectRadius={16}
      onReconnectStart={(_, e) => {
        reconnecting.current = e.id;
        document.querySelector(".fm-stage")?.classList.add("fm-connecting");
      }}
      onReconnect={onReconnect}
      onReconnectEnd={() => {
        reconnecting.current = undefined;
        document.querySelector(".fm-stage")?.classList.remove("fm-connecting");
      }}
      onConnectStart={(_, p) => {
        document.querySelector(".fm-stage")?.classList.add("fm-connecting");
        startMove(p);
      }}
      onConnectEnd={(ev, st) => {
        document.querySelector(".fm-stage")?.classList.remove("fm-connecting");
        onConnectEnd(ev, st);
      }}
      isValidConnection={isValidConnection}
      onPaneClick={() => clearSelection()}
      onDoubleClick={(e) => {
        // double-click on empty canvas: floating quick-add at that spot
        if (!(e.target instanceof Element) || !e.target.classList.contains("react-flow__pane")) return;
        const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const at = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
        openQuickAdd({ sx: e.clientX - box.left, sy: e.clientY - box.top, fx: at.x, fy: at.y, centre: true });
      }}
      onDrop={onDrop}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DND_MIME)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }
      }}
      defaultViewport={phoneStart ? { x: phoneStart.x, y: phoneStart.y, zoom: phoneStart.k } : { x: view.x, y: view.y, zoom: view.k }}
      fitView={fitOnInit && !phoneStart}
      fitViewOptions={{ padding: 0.15, maxZoom: 1.2 }}
      onMoveEnd={(_, vp) => {
        setDragging(false);
        setView({ x: Math.round(vp.x), y: Math.round(vp.y), k: Math.round(vp.zoom * 1000) / 1000 });
      }}
      minZoom={0.08} // Fit has to be able to show a wide funnel on a phone
      maxZoom={2.5}
      snapToGrid={opts.snap}
      snapGrid={[10, 10]}
      selectionKeyCode="Shift"
      multiSelectionKeyCode={["Shift", "Meta", "Control"]}
      selectionMode={SelectionMode.Partial}
      deleteKeyCode={null}
      selectNodesOnDrag={false}
      nodesDraggable={!readOnly}
      nodesConnectable={!readOnly}
      elementsSelectable
      zoomOnDoubleClick={false}
      connectionRadius={30}
      connectionMode={ConnectionMode.Loose}
      connectionLineComponent={ConnectionLine}
      attributionPosition="bottom-center"
      aria-label="Funnel canvas"
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="var(--dot)" />
      {opts.mini && <MiniMap position="bottom-left" pannable zoomable nodeColor={miniColor} nodeStrokeWidth={0} ariaLabel="Mini map" style={{ width: 190, height: 120 }} />}
    </ReactFlow>
  );
}

export function ZoomControls() {
  const rf = useReactFlow();
  const k = useEditor((s) => s.view.k);
  const mini = useEditor((s) => s.opts.mini);
  return (
    <div className="fm-zoom">
      <button type="button" className="btn icon" aria-label="Zoom out" title="Zoom out" onClick={() => rf.zoomOut({ duration: 150 })}>
        <Icon name="minus" />
      </button>
      <output aria-live="polite">{Math.round(k * 100)}%</output>
      <button type="button" className="btn icon" aria-label="Zoom in" title="Zoom in" onClick={() => rf.zoomIn({ duration: 150 })}>
        <Icon name="plus" />
      </button>
      <button type="button" className="btn" onClick={() => rf.fitView({ padding: 0.15, duration: 250, maxZoom: 1.2 })}>
        Fit
      </button>
      <button type="button" className={`btn icon${mini ? " on" : ""}`} aria-label="Toggle minimap" aria-pressed={mini} title="Minimap" onClick={() => setOpt("mini", !mini)}>
        <Icon name="grid" />
      </button>
    </div>
  );
}

