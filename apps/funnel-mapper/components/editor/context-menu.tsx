"use client";
// Right-click / long-press menus: block, connection, selection and empty canvas. Every action also exists in the
// floating toolbar or the inspector; this is the complete list, with shortcuts for the platform (⌘ or Ctrl).
import { useReactFlow } from "@xyflow/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import type { IconName, UiIconName } from "@/lib/icons";
import { retypeTargets } from "@/lib/catalog";
import { QUICK_STYLES } from "@/lib/style";
import { kbd } from "@/lib/platform";
import {
  addNode,
  addWidget,
  align,
  applyQuickStyle,
  armEyedropper,
  copyStyle,
  deleteSelection,
  duplicateSelection,
  flipEdge,
  openMenu,
  openQuickAdd,
  openTypePicker,
  paste,
  pasteStyle,
  reorder,
  selectNodes,
  setInspTab,
  setLocked,
  setOpt,
  setMapView,
  setReportFocus,
  setSideTab,
  setSection,
  showToast,
  startRename,
  tidySelection,
  useEditor,
  wrapInFrame,
  setEdgeStyle,
} from "@/lib/editor/store";
import { openInsertStep } from "./quick-add";

interface Item {
  label: string;
  kbd?: string;
  icon?: IconName | UiIconName;
  run?: () => void;
  disabled?: boolean;
  danger?: boolean;
  sub?: Item[];
  /** Draw a divider before this item. */
  sep?: boolean;
}

/** Make sure the inspector is visible (it may be collapsed on desktop or closed on small screens). */
const showInspector = () => {
  setOpt("hideInsp", false);
  document.querySelector(".fm-editor")?.classList.add("show-insp");
};

export function ContextMenu({ onTidy, onFit, onShortcuts, onWidget }: { onTidy: () => void; onFit: () => void; onShortcuts: () => void; onWidget?: (scope: "funnel" | "selection", at?: { x: number; y: number }) => void }) {
  const menu = useEditor((s) => s.menu);
  const rf = useReactFlow();
  const ro = useEditor((s) => s.readOnly);
  const clip = useEditor((s) => !!s.clip);
  const styleClip = useEditor((s) => !!s.styleClip);
  const nodes = useEditor((s) => s.nodes);
  const sel = useEditor((s) => s.selNodes);
  const node = menu?.id ? nodes.find((n) => n.id === menu.id) : undefined;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const [open, setOpenSub] = useState<string | null>(null);

  const items = useMemo<Item[]>(() => {
    if (!menu) return [];
    const m = (k: string) => kbd(k);
    if (menu.kind === "block" && node) {
      const flow = !["note", "label", "frame", "shape", "image", "checklist", "link"].includes(node.type);
      const canRetype = flow && retypeTargets(node.type).length > 0;
      return [
        { label: "Rename", kbd: "F2", icon: "edit", disabled: ro || !!node.locked, run: () => startRename(node.id) },
        { label: "Change block type…", icon: "type", disabled: ro || !!node.locked || !canRetype, run: () => openTypePicker(node.id) },
        { label: "Copy style", kbd: m("Mod+Alt+C"), icon: "paint", run: () => copyStyle(node.id) },
        { label: "Paste style", kbd: m("Mod+Alt+V"), icon: "paint", disabled: ro || !styleClip, run: () => pasteStyle([node.id]) },
        { label: "Eyedropper", icon: "pipette", disabled: ro, run: () => armEyedropper(node.id) },
        {
          label: "Apply quick style",
          icon: "sliders",
          disabled: ro || !!node.locked,
          sub: QUICK_STYLES.map((q) => ({ label: q.label, run: () => applyQuickStyle(q.style, [node.id]) })),
        },
        { label: "Duplicate", kbd: m("Mod+D"), icon: "copy", disabled: ro, sep: true, run: () => (selectNodes([node.id]), duplicateSelection()) },
        { label: node.locked ? "Unlock" : "Lock", kbd: m("Mod+Alt+L"), icon: node.locked ? "unlock" : "lock", disabled: ro, run: () => setLocked(!node.locked, [node.id]) },
        {
          label: "Order",
          icon: "layers",
          disabled: ro || !!node.locked,
          sub: [
            { label: "Bring to front", kbd: m("Mod+Shift+]"), run: () => reorder("front", [node.id]) },
            { label: "Bring forward", kbd: m("Mod+]"), run: () => reorder("forward", [node.id]) },
            { label: "Send backward", kbd: m("Mod+["), run: () => reorder("backward", [node.id]) },
            { label: "Send to back", kbd: m("Mod+Shift+["), run: () => reorder("back", [node.id]) },
          ],
        },
        ...(flow
          ? ([
              { label: "Analytics", icon: "chart", run: () => (selectNodes([node.id]), setInspTab("analytics"), showInspector()) },
              { label: "Add internal note", icon: "note", disabled: ro, sep: true, run: () => (selectNodes([node.id]), setInspTab("plan"), showInspector()) },
              { label: "Set as goal", icon: "target", disabled: ro, run: () => (selectNodes([node.id]), setInspTab("analytics"), showInspector(), showToast("Set the target under “Goal for this step” in Analytics")) },
              { label: "Open in Reports", icon: "chart", run: () => (setReportFocus(node.id), setSection("data")) },
            ] as Item[])
          : []),
        ...(node.type === "frame" ? ([{ label: "Add widget for this frame", icon: "chart", disabled: ro, run: () => addWidget({ scope: "frame", frameId: node.id }, node.x + (node.w ?? 400) + 40, node.y) }] as Item[]) : []),
        { label: "Delete", kbd: m("Mod+Backspace"), icon: "trash", danger: true, sep: true, disabled: ro || !!node.locked, run: () => (selectNodes([node.id]), deleteSelection()) },
      ];
    }
    if (menu.kind === "edge" && menu.id) {
      const id = menu.id;
      return [
        { label: "Edit label", icon: "edit", disabled: ro, run: () => (useEditor.setState({ selEdge: id, selNodes: [] }), showInspector(), setTimeout(() => document.getElementById("fm-edge-label")?.focus(), 80)) },
        {
          label: "Path",
          icon: "link",
          disabled: ro,
          sub: [
            { label: "Curved", run: () => setEdgeStyle(id, { path: undefined }) },
            { label: "Straight", run: () => setEdgeStyle(id, { path: "straight" }) },
            { label: "Elbow", run: () => setEdgeStyle(id, { path: "elbow" }) },
          ],
        },
        {
          label: "Type",
          icon: "sliders",
          disabled: ro,
          sub: [
            { label: "Normal", run: () => setEdgeStyle(id, { kind: undefined }) },
            { label: "Skip step", run: () => setEdgeStyle(id, { kind: "skip" }) },
            { label: "No data", run: () => setEdgeStyle(id, { kind: "nodata" }) },
          ],
        },
        { label: "Flip direction", icon: "swap", disabled: ro, run: () => flipEdge(id) },
        { label: "Insert step on line", icon: "plus", disabled: ro, run: () => (useEditor.setState({ selEdge: id, selNodes: [] }), requestAnimationFrame(() => openInsertStep(id) || showToast("Scroll the connection into view first"))) },
        { label: "Delete connection", kbd: m("Backspace"), icon: "trash", danger: true, sep: true, disabled: ro, run: () => (useEditor.setState({ selEdge: id, selNodes: [] }), deleteSelection()) },
      ];
    }
    if (menu.kind === "selection") {
      return [
        {
          label: "Align",
          icon: "layers",
          disabled: ro,
          sub: [
            { label: "Left", run: () => align("left") },
            { label: "Centre", run: () => align("center") },
            { label: "Top", run: () => align("top") },
            { label: "Middle", run: () => align("middle") },
          ],
        },
        {
          label: "Distribute",
          icon: "grid",
          disabled: ro || sel.length < 3,
          sub: [
            { label: "Horizontally", run: () => align("hdist") },
            { label: "Vertically", run: () => align("vdist") },
          ],
        },
        { label: "Tidy selection", icon: "tidy", disabled: ro, run: tidySelection },
        { label: "Wrap in frame", icon: "panelLeft", disabled: ro, run: wrapInFrame },
        { label: "Save as workspace block…", icon: "layers", disabled: ro, run: () => (setSideTab("blocks"), setTimeout(() => document.getElementById("fm-wsb-name")?.focus(), 120)) },
        ...(onWidget ? ([{ label: "Add widget for selection", icon: "chart", disabled: ro, run: () => onWidget("selection") }] as Item[]) : []),
        { label: "Paste style", kbd: m("Mod+Alt+V"), icon: "paint", sep: true, disabled: ro || !styleClip, run: () => pasteStyle() },
        { label: "Lock all", kbd: m("Mod+Alt+L"), icon: "lock", disabled: ro, run: () => setLocked(true) },
        { label: "Duplicate", kbd: m("Mod+D"), icon: "copy", disabled: ro, run: duplicateSelection },
        { label: "Delete", kbd: m("Mod+Backspace"), icon: "trash", danger: true, sep: true, disabled: ro, run: deleteSelection },
      ];
    }
    // empty canvas
    const at = { x: menu.fx ?? 0, y: menu.fy ?? 0 };
    return [
      {
        label: "Add block…",
        icon: "plus",
        disabled: ro,
        run: () => {
          const box = document.querySelector(".fm-stage")?.getBoundingClientRect();
          if (box) openQuickAdd({ sx: menu.x - box.left, sy: menu.y - box.top, fx: at.x, fy: at.y, centre: true });
        },
      },
      { label: "Add text", icon: "text", disabled: ro, run: () => addNode("label", at.x, at.y, { p: { text: "Text", size: 15 } }) },
      { label: "Add sticky note", icon: "note", disabled: ro, run: () => addNode("note", at.x, at.y) },
      { label: "Add frame", icon: "panelLeft", disabled: ro, run: () => addNode("frame", at.x, at.y) },
      ...(onWidget ? ([{ label: "Add widget", icon: "chart", disabled: ro, run: () => onWidget("funnel", at) }] as Item[]) : []),
      { label: "Paste", kbd: m("Mod+V"), icon: "copy", sep: true, disabled: ro || !clip, run: paste },
      { label: "Select all", kbd: m("Mod+A"), run: () => selectNodes(useEditor.getState().nodes.map((n) => n.id)) },
      { label: "Tidy up", kbd: m("Mod+Shift+L"), icon: "tidy", sep: true, disabled: ro, run: onTidy },
      { label: "Zoom to fit", icon: "fit", run: onFit },
      { label: "People view", icon: "chart", run: () => setMapView("people") },
      { label: "Money view", icon: "hash", run: () => setMapView("money") },
      { label: "Clean view", icon: "layers", run: () => setMapView("clean") },
      { label: "Keyboard shortcuts", kbd: "?", icon: "help", sep: true, run: onShortcuts },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu, node, ro, clip, styleClip, sel.length]);

  // close on outside press, Escape, scroll or resize
  useEffect(() => {
    if (!menu) return;
    const close = () => openMenu(null);
    const down = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && close();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", key, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  // keep the menu inside the window
  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({ left: Math.max(8, Math.min(menu.x, window.innerWidth - r.width - 8)), top: Math.max(8, Math.min(menu.y, window.innerHeight - r.height - 8)) });
    setOpenSub(null);
    ref.current.querySelector<HTMLElement>("button:not(:disabled)")?.focus();
  }, [menu, items.length]);

  if (!menu) return null;
  const title = menu.kind === "block" ? "Block" : menu.kind === "edge" ? "Connection" : menu.kind === "selection" ? `${sel.length} blocks` : "Canvas";
  const run = (it: Item) => {
    if (it.disabled) return;
    if (it.sub) return setOpenSub(open === it.label ? null : it.label);
    openMenu(null);
    it.run?.();
  };
  const nav = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const els = [...(ref.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? [])];
    const i = els.indexOf(document.activeElement as HTMLElement);
    els[(i + (e.key === "ArrowDown" ? 1 : -1) + els.length) % els.length]?.focus();
  };
  void rf;
  return (
    <div ref={ref} className="fm-ctx" role="menu" aria-label={`${title} menu`} style={pos} onKeyDown={nav} onContextMenu={(e) => e.preventDefault()}>
      {items.map((it) => (
        <div key={it.label} className={it.sep ? "sep" : undefined}>
          <button type="button" role="menuitem" aria-haspopup={it.sub ? "menu" : undefined} aria-expanded={it.sub ? open === it.label : undefined} disabled={it.disabled} className={it.danger ? "danger" : undefined} onClick={() => run(it)}>
            <span className="ic">{it.icon && <Icon name={it.icon} size={15} />}</span>
            <span className="tx">{it.label}</span>
            {it.kbd && <kbd>{it.kbd}</kbd>}
            {it.sub && <Icon name="chevronRight" size={13} />}
          </button>
          {it.sub && open === it.label && (
            <div className="subs" role="menu">
              {it.sub.map((s) => (
                <button key={s.label} type="button" role="menuitem" onClick={() => run(s)}>
                  <span className="tx">{s.label}</span>
                  {s.kbd && <kbd>{s.kbd}</kbd>}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
