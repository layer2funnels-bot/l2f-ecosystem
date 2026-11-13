"use client";
import { forwardRef, useState } from "react";
import { ecoCall } from "@/lib/eco/browser";
import { editorSnapshot, showToast } from "@/lib/editor/store";

const CATEGORIES = ["Tripwire", "Lead generation", "Webinar", "High ticket", "Subscription", "Launch", "Custom"];

/** File → Save as template: shared with the whole team. */
export const TemplateDialog = forwardRef<HTMLDialogElement, { userId: string; defaultName: string; description: string }>(function TemplateDialog({ defaultName, description }, ref) {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const close = () => (ref as React.RefObject<HTMLDialogElement | null>).current?.close();
  return (
    <dialog ref={ref} className="modal" aria-labelledby="tpl-title">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const name = String(fd.get("name") ?? "").trim();
          if (!name) return setErr("Give the template a name");
          setBusy(true);
          setErr("");
          const s = editorSnapshot();
          const r = await ecoCall("fmp.templates.create", {
            name: name.slice(0, 200),
            category: String(fd.get("category") || "Custom").slice(0, 60),
            description: String(fd.get("description") ?? "").slice(0, 4000),
            graph: { ...s.graph, view: { x: 60, y: 40, k: 1 } },
            settings: s.settings,
          });
          setBusy(false);
          if (!r.ok) return setErr(r.message);
          if (!r.data.length) return setErr("You can’t save templates here.");
          close();
          showToast("Saved to team templates");
        }}
      >
        <h3 id="tpl-title">Save as template</h3>
        <p className="mb-4 text-sm text-muted">Everyone on the team can start new funnels from it (Templates page or New funnel).</p>
        {err && (
          <p role="alert" className="mb-2 text-sm text-bad">
            {err}
          </p>
        )}
        <div className="field">
          <label htmlFor="tpl-name">Template name</label>
          <input id="tpl-name" name="name" className="input" defaultValue={defaultName} required />
        </div>
        <div className="field">
          <label htmlFor="tpl-cat">Category</label>
          <select id="tpl-cat" name="category" className="input" defaultValue="Custom">
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="tpl-desc">Description</label>
          <textarea id="tpl-desc" name="description" className="input" defaultValue={description} placeholder="When to use it, typical numbers…" />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={close}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "Saving…" : "Save template"}
          </button>
        </div>
      </form>
    </dialog>
  );
});
