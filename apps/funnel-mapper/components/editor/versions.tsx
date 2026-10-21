"use client";
import { TimeAgo } from "@/components/time-ago";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { fmtDate } from "@/lib/format";
import { parseGraph, parseSettings } from "@/lib/graph";
import type { VersionRow } from "@/lib/schemas";
import { supabaseBrowser } from "@/lib/supabase/client";
import { editorSnapshot, replaceContent, setPanel, showToast, useEditor } from "@/lib/editor/store";

export async function saveVersion(funnelId: string, label: string, auto = false) {
  const s = editorSnapshot();
  const { error } = await supabaseBrowser()
    .from("funnel_versions")
    .insert({ funnel_id: funnelId, graph: s.graph as never, settings: s.settings as never, label, auto });
  if (error) throw error;
}

export function VersionsPanel({ onSaved }: { onSaved?: () => void }) {
  const funnelId = useEditor((s) => s.funnelId);
  const ro = useEditor((s) => s.readOnly);
  const [list, setList] = useState<VersionRow[] | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    const { data, error } = await supabaseBrowser().from("funnel_versions").select("*").eq("funnel_id", funnelId).order("created_at", { ascending: false }).limit(100);
    if (error) setErr(error.message);
    setList(data ?? []);
  }, [funnelId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading external data
    load();
  }, [load]);
  return (
    <>
      <div className="mb-3 flex items-center">
        <h3 className="flex-1">Versions</h3>
        <button type="button" className="btn icon ghost" aria-label="Close versions" title="Close versions" onClick={() => setPanel("inspector")}>
          <Icon name="close" />
        </button>
      </div>
      <p className="sub">Snapshots are saved automatically every 10 minutes while you edit. Save one by hand before big changes.</p>
      {!ro && (
        <form
          className="mb-4 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr("");
            try {
              await saveVersion(funnelId, label.trim() || `Version ${fmtDate(new Date().toISOString())}`);
              setLabel("");
              showToast("Version saved");
              onSaved?.();
              load();
            } catch (x) {
              setErr(x instanceof Error ? x.message : "Couldn’t save the version");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="sr-only" htmlFor="ver-label">
            Version name
          </label>
          <input id="ver-label" className="input" placeholder="e.g. Sent to client" value={label} onChange={(e) => setLabel(e.target.value)} />
          <button className="btn primary shrink-0" disabled={busy}>
            Save
          </button>
        </form>
      )}
      {err && (
        <p role="alert" className="text-sm text-bad">
          {err}
        </p>
      )}
      {list === null ? (
        <p className="sub" role="status" aria-live="polite">Loading…</p>
      ) : list.length === 0 ? (
        <p className="sub">No versions yet.</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {list.map((v) => (
            <li key={v.id} className="flex items-center gap-2 border-b border-line py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold">{v.label || (v.auto ? "Autosave" : "Version")}</div>
                <div className="text-xs text-muted">
                  {v.auto ? "Automatic · " : ""}
                  <time dateTime={v.created_at} title={new Date(v.created_at).toLocaleString()}>
                    <TimeAgo iso={v.created_at} />
                  </time>
                </div>
              </div>
              {!ro && (
                <>
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => {
                      if (!confirm("Restore this version? Your current map is replaced (Ctrl Z undoes it).")) return;
                      const g = parseGraph(v.graph);
                      replaceContent(g, parseSettings(v.settings));
                      showToast("Version restored. Ctrl Z to undo.");
                    }}
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    className="btn sm icon danger"
                    aria-label={`Delete version ${v.label}`}
                    onClick={async () => {
                      if (!confirm("Delete this version?")) return;
                      await supabaseBrowser().from("funnel_versions").delete().eq("id", v.id);
                      load();
                    }}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
