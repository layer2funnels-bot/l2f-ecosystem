"use client";
// Template customize form (V2 F3, "V2-template-form"): every field is optional. For each page of the template: a name
// and a URL. Entering a URL starts a screenshot capture in the background ("Fetching preview…" then "Preview ready");
// a failed capture never blocks anything (the page keeps its wireframe). "Start with empty numbers" clears the sample
// numbers. Used by the New funnel dialog (Templates page, top bar) and by the Templates panel inside the map.
import { useState } from "react";
import { validateCaptureUrl } from "@/lib/capture";
import { templatePages } from "@/lib/templates13";

export interface TemplateCustom {
  empty: boolean;
  names: Record<string, string>;
  urls: Record<string, string>;
  shots: Record<string, string>;
}
export const blankCustom = (): TemplateCustom => ({ empty: false, names: {}, urls: {}, shots: {} });

type Cap = { state: "idle" | "loading" | "ready" | "error" | "unavailable"; msg?: string };
const kb = (b: number) => `${Math.max(1, Math.round(b / 1024))} KB`;

export function TemplateFields({ templateKey, value, onChange }: { templateKey: string; value: TemplateCustom; onChange: (v: TemplateCustom) => void }) {
  const pages = templatePages(templateKey);
  const [cap, setCap] = useState<Record<string, Cap>>({});
  const set = (patch: Partial<TemplateCustom>) => onChange({ ...value, ...patch });
  async function capture(id: string, url: string) {
    const check = validateCaptureUrl(url);
    if (!check.ok) return setCap((c) => ({ ...c, [id]: { state: "error", msg: check.reason } }));
    setCap((c) => ({ ...c, [id]: { state: "loading" } }));
    try {
      const r = await fetch("/api/capture", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, nodeId: `tpl-${id}` }) });
      const j = (await r.json().catch(() => ({}))) as { path?: string; bytes?: number; message?: string; error?: string };
      if (r.status === 503 || j.error === "unavailable") return setCap((c) => ({ ...c, [id]: { state: "unavailable", msg: "Automatic capture isn’t set up here. Add a screenshot later from the block." } }));
      if (!r.ok || !j.path) return setCap((c) => ({ ...c, [id]: { state: "error", msg: j.message ?? "The page couldn’t be captured. The page keeps its wireframe." } }));
      onChange({ ...value, urls: { ...value.urls, [id]: url }, shots: { ...value.shots, [id]: j.path } });
      setCap((c) => ({ ...c, [id]: { state: "ready", msg: j.bytes ? `Preview ready · ${kb(j.bytes)}` : "Preview ready" } }));
    } catch {
      setCap((c) => ({ ...c, [id]: { state: "error", msg: "You seem to be offline. The page keeps its wireframe." } }));
    }
  }
  return (
    <div className="fm-tplform">
      {pages.length > 0 && (
        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-2 text-sm font-bold">Pages in this template</legend>
          <div className="grid gap-3">
            {pages.map((p) => {
              const c = cap[p.id];
              return (
                <div key={p.id} className="grid gap-1.5 sm:grid-cols-2">
                  <label className="block">
                    <span className="sr-only">Name for {p.name}</span>
                    <input className="input" placeholder={p.name} value={value.names[p.id] ?? ""} onChange={(e) => set({ names: { ...value.names, [p.id]: e.target.value } })} aria-label={`Name for ${p.name}`} maxLength={120} />
                  </label>
                  <label className="block">
                    <span className="sr-only">URL for {p.name}</span>
                    <input
                      className="input"
                      type="url"
                      inputMode="url"
                      placeholder="URL (optional)"
                      value={value.urls[p.id] ?? ""}
                      aria-label={`URL for ${p.name}`}
                      aria-describedby={c ? `cap-${p.id}` : undefined}
                      onChange={(e) => {
                        const shots = { ...value.shots };
                        delete shots[p.id];
                        set({ urls: { ...value.urls, [p.id]: e.target.value }, shots });
                        setCap((x) => ({ ...x, [p.id]: { state: "idle" } }));
                      }}
                      onBlur={(e) => e.target.value.trim() && !value.shots[p.id] && capture(p.id, e.target.value.trim())}
                    />
                  </label>
                  {c && c.state !== "idle" && (
                    <small id={`cap-${p.id}`} className={`sm:col-span-2 ${c.state === "error" ? "text-bad" : "text-muted"}`} role="status">
                      {c.state === "loading" ? "Fetching preview…" : c.msg}
                    </small>
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>
      )}
      <label className="mt-4 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={value.empty} onChange={(e) => set({ empty: e.target.checked })} />
        Start with empty numbers
      </label>
      <p className="help mt-1">
        {value.empty ? "Every rate, price and visitor count starts at zero, and no example traffic is added." : "Sample numbers and one example traffic source are included so the funnel shows numbers straight away. Change them on the map."}
      </p>
      <p className="help mt-1">Leave anything blank. You can add names and URLs later from each block.</p>
    </div>
  );
}
