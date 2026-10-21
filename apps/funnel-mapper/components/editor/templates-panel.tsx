"use client";
// Templates inside the map (V2 F3, "V2-templates-in-canvas"): the 13 approved templates in the left panel (search, live
// mini previews, block counts read from the template data, a larger preview on hover or focus). Choosing one opens the
// customize form; "Add to map" drops it into the middle of the view as one labelled frame, as a single undo step,
// without moving or covering anything already on the map. Cancelling inserts nothing.
import { useReactFlow } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";
import { FunnelPreview } from "@/components/funnel-preview";
import { blankCustom, TemplateFields, type TemplateCustom } from "@/components/template-customize";
import { insertTemplateGraph, showToast, useEditor } from "@/lib/editor/store";
import { TEMPLATES13, template13Graph, type Template13 } from "@/lib/templates13";

export function TemplatesPanel({ onPicked }: { onPicked?: () => void }) {
  const [q, setQ] = useState("");
  const [hover, setHover] = useState<Template13 | null>(null);
  const [pick, setPick] = useState<Template13 | null>(null);
  const settings = useEditor((s) => s.settings);
  const s = q.trim().toLowerCase();
  const list = TEMPLATES13.filter((t) => !s || `${t.name} ${t.description}`.toLowerCase().includes(s));
  return (
    <>
      <h2 className="mt-1">
        Templates <small className="fm-pcount">{TEMPLATES13.length}</small>
      </h2>
      <label>
        <span className="sr-only">Search templates</span>
        <input className="fm-psearch" type="search" placeholder={`Search ${TEMPLATES13.length} templates…`} value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <ol className="fm-tpllist" aria-label="Templates">
        {list.map((t) => (
          <li key={t.key}>
            <button type="button" onClick={() => setPick(t)} onPointerEnter={() => setHover(t)} onFocus={() => setHover(t)} aria-label={`${t.n}. ${t.name}, ${t.blocks.length} blocks`}>
              <span className="n" aria-hidden="true">
                {t.n}
              </span>
              <span className="nm">{t.name}</span>
              <small aria-hidden="true">{t.blocks.length}</small>
            </button>
          </li>
        ))}
        {!list.length && <li className="hint">No templates match.</li>}
      </ol>
      {hover && (
        <div className="fm-tplhover" aria-hidden="true">
          <FunnelPreview graph={template13Graph(hover.key)} settings={settings} name={hover.name} width={232} height={130} pad={6} />
          <b>{hover.name}</b>
          <p>{hover.description}</p>
        </div>
      )}
      <p className="hint">Pick one, fill the optional form, and it lands in the middle of your view as one frame. Nothing already on the map moves.</p>
      {pick && <InsertDialog t={pick} onClose={() => setPick(null)} onDone={onPicked} />}
    </>
  );
}

function InsertDialog({ t, onClose, onDone }: { t: Template13; onClose: () => void; onDone?: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const rf = useReactFlow();
  const [custom, setCustom] = useState<TemplateCustom>(blankCustom);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  const add = (useCustom: boolean) => {
    const el = document.querySelector(".fm-stage")?.getBoundingClientRect();
    const c = el ? rf.screenToFlowPosition({ x: el.left + el.width / 2, y: el.top + el.height / 2 }) : { x: 400, y: 300 };
    const g = template13Graph(t.key, useCustom ? custom : {});
    const id = insertTemplateGraph(g, t.name, c);
    ref.current?.close();
    onClose();
    if (id) {
      showToast(`${t.name} added as one frame`);
      // bring the new frame into view
      setTimeout(() => {
        const n = useEditor.getState().nodes.find((x) => x.id === id);
        if (n) rf.fitBounds({ x: n.x, y: n.y, width: n.w ?? 600, height: n.h ?? 400 }, { padding: 0.15, duration: 250 });
      }, 30);
      onDone?.();
    }
  };
  return (
    <dialog ref={ref} className="modal fm-tpldialog" aria-labelledby="tpl-add-title" onCancel={(e) => (e.preventDefault(), ref.current?.close(), onClose())}>
      <h3 id="tpl-add-title">Add {t.name} to this map</h3>
      <p className="help -mt-2 mb-3">All optional. These pages are added to the funnel you have open. Names and URLs are optional.</p>
      <FunnelPreview graph={template13Graph(t.key, custom)} name={t.name} width={460} height={150} className="mb-3 rounded-lg border border-line" />
      <TemplateFields templateKey={t.key} value={custom} onChange={setCustom} />
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" className="btn" onClick={() => (ref.current?.close(), onClose())}>
          Cancel
        </button>
        <button type="button" className="btn" onClick={() => add(false)}>
          Skip, use defaults
        </button>
        <button type="button" className="btn primary" onClick={() => add(true)}>
          Add to map
        </button>
      </div>
    </dialog>
  );
}
