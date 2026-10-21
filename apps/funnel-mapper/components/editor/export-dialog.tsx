"use client";
import { useEffect, useId, useRef, useState } from "react";
import { PDF_SECTIONS } from "./exporters";
import { useEditor, setOpt } from "@/lib/editor/store";

/**
 * Export step (V2 "Export preview"): one place to choose what leaves the product. PDF pages, the map image (PNG or SVG with
 * its background chosen here, for this export), and the data files. The cover, map and key numbers always print, so they are
 * shown ticked and locked; every other section can be switched off. The quick items in the File menu still export everything.
 */
export function ExportDialog({ open, onClose, onPdf, onImage, onData, canPdf = true }: { open: boolean; onClose: () => void; onPdf: (omit: string[]) => void; onImage: (kind: "png" | "svg") => void; onData: (kind: "csv" | "json") => void; canPdf?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const bg = useEditor((s) => s.opts.bg);
  const [omit, setOmit] = useState<string[]>([]);
  const [fmt, setFmt] = useState<"png" | "svg">("png");
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const toggle = (key: string) => setOmit((o) => (o.includes(key) ? o.filter((k) => k !== key) : [...o, key]));
  return (
    <dialog ref={ref} className="modal fm-exportdlg" aria-labelledby={`${id}-t`} onClose={onClose}>
      <h3 id={`${id}-t`}>Export</h3>
      <p className="mb-4 text-sm text-muted">What leaves the product looks like the product: same objects, labels and units. The choices below apply to this export only.</p>

      {canPdf && (
        <section className="fm-exp-sec" aria-labelledby={`${id}-pdf`}>
          <h4 id={`${id}-pdf`}>PDF report</h4>
          <ul className="fm-exp-list">
            {["Cover", "Funnel map", "Key numbers"].map((l) => (
              <li key={l}>
                <label>
                  <input type="checkbox" checked disabled /> {l} <span className="text-muted">(always on page 1)</span>
                </label>
              </li>
            ))}
            {PDF_SECTIONS.map((o) => (
              <li key={o.key}>
                <label>
                  <input type="checkbox" checked={!omit.includes(o.key)} onChange={() => toggle(o.key)} /> {o.label}
                </label>
              </li>
            ))}
          </ul>
          <p className="mb-2 text-xs text-muted">A4 landscape. Sections with nothing to show (no scenarios, no actuals) are left out on their own.</p>
          <button type="button" className="btn primary" onClick={() => (onPdf(omit), onClose())}>
            Export PDF
          </button>
        </section>
      )}

      <section className="fm-exp-sec" aria-labelledby={`${id}-img`}>
        <h4 id={`${id}-img`}>Map image</h4>
        <div className="fm-exp-row">
          <div className="seg" role="group" aria-label="Image format">
            <button type="button" aria-pressed={fmt === "png"} onClick={() => setFmt("png")}>
              PNG
            </button>
            <button type="button" aria-pressed={fmt === "svg"} onClick={() => setFmt("svg")}>
              SVG
            </button>
          </div>
          <div className="seg" role="group" aria-label="Image background">
            {(["dark", "light", "transparent"] as const).map((b) => (
              <button key={b} type="button" aria-pressed={bg === b} onClick={() => setOpt("bg", b)}>
                {b[0]!.toUpperCase() + b.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <button type="button" className="btn primary" onClick={() => (onImage(fmt), onClose())}>
          Export image
        </button>
      </section>

      <section className="fm-exp-sec" aria-labelledby={`${id}-data`}>
        <h4 id={`${id}-data`}>Data</h4>
        <div className="fm-exp-row">
          <button type="button" className="btn" onClick={() => (onData("csv"), onClose())}>
            Step report (.csv)
          </button>
          <button type="button" className="btn" onClick={() => (onData("json"), onClose())}>
            Funnel file (.json)
          </button>
        </div>
      </section>

      <div className="mt-4 flex justify-end">
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </dialog>
  );
}
