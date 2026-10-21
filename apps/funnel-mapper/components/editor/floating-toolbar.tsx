"use client";
// Floating toolbar above the selection: STYLE | PLAN | ANALYTICS | ••• for a block, Align / Frame / Style for several,
// label / path / flip / insert / delete for a connection. Hidden while dragging or panning. Stays inside the canvas:
// when a centred toolbar would overflow, it aligns to the selection's right (or left) edge.
import { useViewport } from "@xyflow/react";
import { useLayoutEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { blockPivot, CATCOLOR, isAnnot, PITCH, retypeTargets, typeOf } from "@/lib/catalog";
import { kbd } from "@/lib/platform";
import { copyStyle, deleteSelection, duplicateSelection, flipEdge, heightOf, openMenu, openTypePicker, pasteStyle, selectNodes, setEdgeStyle, setInspTab, setLocked, setOpt, showToast, updateParams, useEditor, widthOf, wrapInFrame, type InspTab } from "@/lib/editor/store";
import { openInsertStep } from "./quick-add";
import { openQuickAdd } from "@/lib/editor/store";
import { Tip } from "./tip";

const openInspector = (tab?: InspTab) => {
  if (tab) setInspTab(tab);
  setOpt("hideInsp", false);
  document.querySelector(".fm-editor")?.classList.add("show-insp");
};

export function FloatingToolbar() {
  const vp = useViewport();
  const selNodes = useEditor((s) => s.selNodes);
  const selEdge = useEditor((s) => s.selEdge);
  const nodes = useEditor((s) => s.nodes);
  const ro = useEditor((s) => s.readOnly);
  const hidden = useEditor((s) => s.dragging || !!s.quick || !!s.menu || !!s.renaming || !!s.typePicker || s.mode === "reports");
  const styleClip = useEditor((s) => !!s.styleClip);
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);

  const sel = nodes.filter((n) => selNodes.includes(n.id));
  const kind: "block" | "multi" | "edge" | null = selEdge ? "edge" : sel.length === 1 ? "block" : sel.length > 1 ? "multi" : null;

  /* eslint-disable react-hooks/set-state-in-effect -- the toolbar is positioned from DOM measurements (its own size, the stage and the connection label) */
  useLayoutEffect(() => {
    const el = ref.current,
      stage = el?.parentElement?.getBoundingClientRect();
    if (!el || !stage || !kind) return setPlace(null);
    const w = el.offsetWidth,
      h = el.offsetHeight;
    // selection box in stage px
    let l: number, t: number, r: number, b: number;
    if (kind === "edge") {
      const lb = document.querySelector(`[data-edge="${selEdge}"]`)?.getBoundingClientRect();
      if (!lb) return setPlace(null);
      [l, t, r, b] = [lb.left - stage.left, lb.top - stage.top, lb.right - stage.left, lb.bottom - stage.top];
    } else {
      l = Math.min(...sel.map((n) => n.x)) * vp.zoom + vp.x;
      t = Math.min(...sel.map((n) => n.y)) * vp.zoom + vp.y;
      r = Math.max(...sel.map((n) => n.x + widthOf(n))) * vp.zoom + vp.x;
      b = Math.max(...sel.map((n) => n.y + heightOf(n))) * vp.zoom + vp.y;
    }
    // clear of the block's top port, and of the "Biggest leak" chip when this block carries it
    const gap = 24 + (kind === "block" && sel[0] && useEditor.getState().keyLeak === sel[0].id ? 30 : 0);
    let left = (l + r) / 2 - w / 2;
    if (left + w > stage.width - 8) left = r - w; // would overflow on the right: align to the selection's right edge
    if (left < 8) left = Math.min(l, stage.width - w - 8); // overflow on the left: align to its left edge
    left = Math.max(8, Math.min(left, stage.width - w - 8));
    let top = t - h - gap;
    if (top < 8) top = Math.min(b + gap, stage.height - h - 8); // no room above: below
    setPlace({ left: Math.round(left), top: Math.round(Math.max(8, top)) });
  }, [kind, sel.map((n) => `${n.id}:${n.x}:${n.y}`).join("|"), selEdge, vp.x, vp.y, vp.zoom, hidden, ro]); // eslint-disable-line react-hooks/exhaustive-deps
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!kind || hidden) return null;
  const menuAt = (e: React.MouseEvent, k: "block" | "selection" | "edge", id?: string) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    openMenu({ kind: k, x: r.left, y: r.bottom + 6, id });
  };
  const n = sel[0];
  const flow = n && !isAnnot(n.type);
  return (
    <div ref={ref} className="fm-ftb" role="toolbar" aria-label={kind === "edge" ? "Connection tools" : kind === "multi" ? "Selection tools" : "Block tools"} style={{ left: place?.left ?? -9999, top: place?.top ?? -9999, visibility: place ? "visible" : "hidden" }} onPointerDown={(e) => e.stopPropagation()}>
      {kind === "block" && n && n.type === "widget" && (
        <>
          <button type="button" className="tab" onClick={() => openInspector("details")}>
            Edit
          </button>
          {!ro &&
            (["S", "M", "L"] as const).map((z) => (
              <button key={z} type="button" className="tab" aria-pressed={n.p.wsize === z || (!n.p.wsize && z === "M")} aria-label={`Size ${z}`} onClick={() => updateParams(n.id, { wsize: z })}>
                {z}
              </button>
            ))}
          <i className="vr" />
          {!ro && (
            <Tip label={`Duplicate (${kbd("Mod+D")})`}>
              <button type="button" aria-label="Duplicate" onClick={() => (selectNodes([n.id]), duplicateSelection())}>
                <Icon name="copy" size={16} />
              </button>
            </Tip>
          )}
          <Tip label="More actions">
            <button type="button" aria-label="More actions" aria-haspopup="menu" onClick={(e) => menuAt(e, "block", n.id)}>
              <Icon name="more" size={16} />
            </button>
          </Tip>
        </>
      )}
      {kind === "block" && n && n.type !== "widget" && (
        <>
          {/* V2 "Editor-block": colour, copy / paste style, next step, then plan, lock, duplicate, more */}
          <Tip label="Style">
            <button type="button" className="sw" aria-label="Style" onClick={() => openInspector("style")}>
              <i style={{ background: n.s?.accent || CATCOLOR[typeOf(n.type).color ?? typeOf(n.type).cat] }} aria-hidden="true" />
              <Icon name="chevronDown" size={12} />
            </button>
          </Tip>
          <Tip label={`Copy style (${kbd("Mod+Alt+C")})`}>
            <button type="button" aria-label="Copy style" onClick={() => copyStyle(n.id)}>
              <Icon name="paint" size={16} />
            </button>
          </Tip>
          {!ro && (
            <Tip label={`Paste style (${kbd("Mod+Alt+V")})`}>
              <button type="button" aria-label="Paste style" disabled={!styleClip} onClick={() => pasteStyle([n.id])}>
                <Icon name="pipette" size={16} />
              </button>
            </Tip>
          )}
          {!ro && flow && n.type !== "label" && (
            <>
              <i className="vr" />
              <button
                type="button"
                className="next"
                onClick={() => {
                  const x = n.x + PITCH.x,
                    y = n.y + blockPivot(n.type);
                  openQuickAdd({ sx: x * vp.zoom + vp.x, sy: y * vp.zoom + vp.y, fx: x, fy: y, from: { id: n.id, port: "main" } });
                }}
              >
                <Icon name="plus" size={16} /> Add next step
              </button>
            </>
          )}
          <i className="vr" />
          {!ro && flow && retypeTargets(n.type).length > 0 && (
            <Tip label="Change type">
              <button type="button" aria-label="Change type" onClick={() => openTypePicker(n.id)}>
                <Icon name="type" size={16} />
              </button>
            </Tip>
          )}
          {n.type !== "checklist" && !useEditor.getState().shared && (
            <Tip label="Plan: notes, checklist, forecast">
              <button type="button" aria-label="Plan" onClick={() => openInspector("plan")}>
                <Icon name="file" size={16} />
              </button>
            </Tip>
          )}
          {!ro && (
            <Tip label={n.locked ? `Unlock (${kbd("Mod+Alt+L")})` : `Lock (${kbd("Mod+Alt+L")})`}>
              <button type="button" aria-label={n.locked ? "Unlock" : "Lock"} onClick={() => (selectNodes([n.id]), setLocked(!n.locked))}>
                <Icon name={n.locked ? "unlock" : "lock"} size={16} />
              </button>
            </Tip>
          )}
          {!ro && (
            <Tip label={`Duplicate (${kbd("Mod+D")})`}>
              <button type="button" aria-label="Duplicate" onClick={() => (selectNodes([n.id]), duplicateSelection())}>
                <Icon name="copy" size={16} />
              </button>
            </Tip>
          )}
          <Tip label="More actions">
            <button type="button" aria-label="More actions" aria-haspopup="menu" onClick={(e) => menuAt(e, "block", n.id)}>
              <Icon name="more" size={16} />
            </button>
          </Tip>
        </>
      )}
      {kind === "multi" && (
        <>
          <button type="button" className="tab" onClick={(e) => menuAt(e, "selection")}>
            Align
          </button>
          {!ro && (
            <button type="button" className="tab" onClick={wrapInFrame}>
              Frame
            </button>
          )}
          <button type="button" className="tab" onClick={() => openInspector("style")}>
            Style
          </button>
          <i className="vr" />
          <Tip label={`Copy style (${kbd("Mod+Alt+C")})`}>
            <button type="button" aria-label="Copy style" onClick={() => copyStyle(sel[0].id)}>
              <Icon name="paint" size={16} />
            </button>
          </Tip>
          {!ro && (
            <Tip label={`Lock all (${kbd("Mod+Alt+L")})`}>
              <button type="button" aria-label="Lock all" onClick={() => setLocked(true)}>
                <Icon name="lock" size={16} />
              </button>
            </Tip>
          )}
          <Tip label="More actions">
            <button type="button" aria-label="More actions" aria-haspopup="menu" onClick={(e) => menuAt(e, "selection")}>
              <Icon name="more" size={16} />
            </button>
          </Tip>
        </>
      )}
      {kind === "edge" && selEdge && (
        <>
          <button type="button" className="tab" onClick={() => openInspector()}>
            Flow
          </button>
          <button type="button" className="tab" onClick={() => openInspector()}>
            Style
          </button>
          <i className="vr" />
          {!ro && (
            <>
              <Tip label="Flip direction">
                <button type="button" aria-label="Flip direction" onClick={() => flipEdge(selEdge)}>
                  <Icon name="swap" size={16} />
                </button>
              </Tip>
              <Tip label="Insert step on line">
                <button type="button" aria-label="Insert step on line" onClick={() => openInsertStep(selEdge) || showToast("Scroll the connection into view first")}>
                  <Icon name="plus" size={16} />
                </button>
              </Tip>
              <Tip label="Toggle dashed">
                <button type="button" aria-label="Toggle dashed" onClick={() => setEdgeStyle(selEdge, { dash: useEditor.getState().edges.find((e) => e.id === selEdge)?.s?.dash === "dashed" ? undefined : "dashed" })}>
                  <Icon name="line" size={16} />
                </button>
              </Tip>
            </>
          )}
          <Tip label="More actions">
            <button type="button" aria-label="More actions" aria-haspopup="menu" onClick={(e) => menuAt(e, "edge", selEdge)}>
              <Icon name="more" size={16} />
            </button>
          </Tip>
          {!ro && (
            <Tip label="Remove this line">
              <button type="button" aria-label="Remove this line" className="danger" onClick={deleteSelection}>
                <Icon name="trash" size={16} />
              </button>
            </Tip>
          )}
        </>
      )}
    </div>
  );
}
