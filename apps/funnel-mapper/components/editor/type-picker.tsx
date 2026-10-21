"use client";
// Change page type / block type: a visual grid of the types this block can become without changing its numbers
// (same maths: lib/catalog.ts retypeTargets). The block keeps its id, place, connections, URL, thumbnail, status
// and every field; fields the new type doesn't show are kept hidden and come back if you switch back.
import { useEffect, useMemo, useRef, useState } from "react";
import { CATCOLOR, LIB_GROUPS, libOf, retypeTargets, typeOf } from "@/lib/catalog";
import { FAMILIES, visualOf } from "@/lib/block-visuals";
import { closeTypePickerAndRetype, openTypePicker, useEditor } from "@/lib/editor/store";
import { searchLibrary, BY_KEY } from "@/lib/library";
import { BlockTile, WireframeStrip } from "./block-visual";

export function TypePicker() {
  const id = useEditor((s) => s.typePicker);
  const n = useEditor((s) => (s.typePicker ? s.nodes.find((x) => x.id === s.typePicker) : undefined));
  const ref = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (id && n && !d.open) {
      setQ("");
      d.showModal();
    }
    if (!id && d.open) d.close();
  }, [id, n]);
  const options = useMemo(() => (n ? [n.type, ...retypeTargets(n.type)] : []), [n]);
  const items = useMemo(() => {
    const set = new Set(options);
    const found = searchLibrary(q).filter((it) => set.has(it.payload.type) && BY_KEY[it.key]).filter((it, i, a) => a.findIndex((x) => x.payload.type === it.payload.type) === i);
    // a block of an earlier (pre-V2) type still shows its own type first, so "Current" is always there
    const T = n ? typeOf(n.type) : undefined;
    if (n && T && !found.some((it) => it.payload.type === n.type) && !q.trim()) found.unshift({ key: n.type, label: T.label, icon: T.icon, group: libOf(n.type), kw: "", payload: { type: n.type } });
    return found;
  }, [options, q, n]);
  const page = n && typeOf(n.type)?.cat === "page";
  return (
    <dialog ref={ref} className="modal fm-typepick" aria-labelledby="tp-title" onClose={() => openTypePicker(null)} onCancel={() => openTypePicker(null)}>
      <h3 id="tp-title">{page ? "Change page type" : "Change block type"}</h3>
      {n && (
        <>
          <p className="hint">
            “{n.name}” keeps its place, connections, link, thumbnail, status and numbers. Only the type changes.
          </p>
          <input className="input mb-3" type="search" placeholder="Search types" aria-label="Search types" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="tp-grid" role="listbox" aria-label="Types">
            {items.map((it) => {
              const v = visualOf(it.payload.type),
                cur = it.payload.type === n.type;
              return (
                <button key={it.key} type="button" role="option" aria-selected={cur} className={`tp-tile${cur ? " cur" : ""}`} onClick={() => (cur ? openTypePicker(null) : closeTypePickerAndRetype(n.id, it.payload.type))}>
                  {FAMILIES[v.family].strip && v.wireframe ? (
                    <WireframeStrip kind={v.wireframe} accent={CATCOLOR[typeOf(it.payload.type).color ?? typeOf(it.payload.type).cat]} />
                  ) : (
                    <span className="tp-icon">
                      <BlockTile type={it.payload.type} icon={it.icon} size={18} />
                    </span>
                  )}
                  <span className="tp-name">{it.label}</span>
                  <small>{cur ? "Current" : LIB_GROUPS[libOf(it.payload.type)]}</small>
                </button>
              );
            })}
            {!items.length && <p className="hint">No types match.</p>}
          </div>
        </>
      )}
      <form method="dialog" className="mt-4 text-right">
        <button className="btn">Cancel</button>
      </form>
    </dialog>
  );
}
