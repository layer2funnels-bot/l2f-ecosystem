"use client";
// Phone: selecting a block replaces the KPI chips with a 68px action bar (Edit, Style, Next step, Duplicate, More);
// several blocks give Align, Frame, Style, Delete. Floating toolbars and right-click menus don't exist on a phone:
// "More" opens the same menu as an action sheet.
import { Icon } from "@/components/icon";
import { blockPivot, isAnnot, picRect, portsFor } from "@/lib/catalog";
import { clearSelection, deleteSelection, duplicateSelection, heightOf, openMenu, openQuickAdd, selectNodes, setInspTab, setOpt, useEditor, wrapInFrame } from "@/lib/editor/store";
import type { InspTab } from "@/lib/editor/store";

const showInspector = (tab?: InspTab) => {
  if (tab) setInspTab(tab);
  setOpt("hideInsp", false);
  document.querySelector(".fm-editor")?.classList.add("show-insp");
};

function Btn({ icon, label, onClick, disabled, danger }: { icon: React.ComponentProps<typeof Icon>["name"]; label: string; onClick: (e: React.MouseEvent) => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button type="button" className={danger ? "danger" : undefined} onClick={onClick} disabled={disabled}>
      <Icon name={icon} size={20} />
      <span>{label}</span>
    </button>
  );
}

export function PhoneActionBar() {
  const sel = useEditor((s) => s.selNodes);
  const edge = useEditor((s) => s.selEdge);
  const nodes = useEditor((s) => s.nodes);
  const ro = useEditor((s) => s.readOnly);
  const selectMode = useEditor((s) => s.selectMode);
  const n = sel.length === 1 ? nodes.find((x) => x.id === sel[0]) : undefined;
  const more = (e: React.MouseEvent, kind: "block" | "selection" | "edge", id?: string) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    openMenu({ kind, x: r.left, y: r.top, id });
  };
  const next = () => {
    if (!n || !portsFor(n.type).hasOut) return;
    const box = document.querySelector(".fm-stage")?.getBoundingClientRect();
    openQuickAdd({ sx: 8, sy: (box?.height ?? 600) / 3, fx: n.x + picRect(n.type).x + picRect(n.type).w + 80, fy: n.y + blockPivot(n.type), from: { id: n.id, port: "main" } });
  };
  return (
    <div className="fm-actionbar" role="toolbar" aria-label={n ? "Block actions" : sel.length > 1 ? "Selection actions" : edge ? "Connection actions" : "Select blocks"}>
      {n && (
        <>
          <Btn icon="edit" label="Edit" onClick={() => showInspector("details")} />
          <Btn icon="paint" label="Style" onClick={() => showInspector("style")} />
          <Btn icon="plus" label="Next step" onClick={next} disabled={ro || isAnnot(n.type) || !portsFor(n.type).hasOut} />
          <Btn icon="copy" label="Duplicate" onClick={() => (selectNodes([n.id]), duplicateSelection())} disabled={ro} />
          <Btn icon="more" label="More" onClick={(e) => more(e, "block", n.id)} />
        </>
      )}
      {!n && sel.length > 1 && (
        <>
          <Btn icon="layers" label="Align" onClick={(e) => more(e, "selection")} disabled={ro} />
          <Btn icon="panelLeft" label="Frame" onClick={wrapInFrame} disabled={ro} />
          <Btn icon="paint" label="Style" onClick={() => showInspector("style")} />
          <Btn icon="trash" label="Delete" onClick={deleteSelection} disabled={ro} danger />
          <Btn icon="close" label="Done" onClick={() => (clearSelection(), useEditor.setState({ selectMode: false }))} />
        </>
      )}
      {!n && sel.length <= 1 && edge && (
        <>
          <Btn icon="edit" label="Edit" onClick={() => showInspector()} />
          <Btn icon="more" label="More" onClick={(e) => more(e, "edge", edge)} />
          <Btn icon="trash" label="Delete" onClick={deleteSelection} disabled={ro} danger />
        </>
      )}
      {!n && sel.length === 0 && !edge && selectMode && (
        <>
          <span className="hint">Tap blocks to select them</span>
          <Btn icon="close" label="Done" onClick={() => useEditor.setState({ selectMode: false })} />
        </>
      )}
    </div>
  );
}
