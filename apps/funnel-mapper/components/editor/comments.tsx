"use client";
import { TimeAgo } from "@/components/time-ago";
import { useReactFlow } from "@xyflow/react";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import type { ShareCommentRow } from "@/lib/schemas";
import { supabaseBrowser } from "@/lib/supabase/client";
import { selectNodes, setPanel, useEditor } from "@/lib/editor/store";

/** Client feedback left on share pages. */
export function CommentsPanel({ onCount }: { onCount?: (n: number) => void }) {
  const funnelId = useEditor((s) => s.funnelId);
  const nodes = useEditor((s) => s.nodes);
  const rf = useReactFlow();
  const [list, setList] = useState<ShareCommentRow[] | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const viewer = useEditor((s) => s.viewer);
  const load = useCallback(async () => {
    const { data } = await supabaseBrowser().from("share_comments").select("*").eq("funnel_id", funnelId).order("created_at", { ascending: false });
    setList(data ?? []);
    onCount?.((data ?? []).filter((c) => !c.resolved).length);
  }, [funnelId, onCount]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading external data
    load();
  }, [load]);
  const shown = (list ?? []).filter((c) => showResolved || !c.resolved);
  return (
    <>
      <div className="mb-3 flex items-center">
        <h3 className="flex-1">Client comments</h3>
        <button type="button" className="btn icon ghost" aria-label="Close comments" title="Close comments" onClick={() => setPanel("inspector")}>
          <Icon name="close" />
        </button>
      </div>
      <p className="sub">Feedback from people you shared this funnel with.</p>
      <label className="check">
        <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> Show resolved
      </label>
      {list === null ? (
        <p className="sub" role="status" aria-live="polite">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="sub">No comments{showResolved ? "" : " to resolve"}.</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {shown.map((c) => {
            const node = nodes.find((n) => n.id === c.node_id);
            return (
              <li key={c.id} className={`mb-2 rounded-xl border border-line p-3 ${c.resolved ? "opacity-60" : ""}`}>
                <div className="mb-1 flex items-center gap-2 text-xs text-muted">
                  <b className="text-ink">{c.author_name || "Anonymous"}</b> · <TimeAgo iso={c.created_at} />
                </div>
                {node && (
                  <button
                    type="button"
                    className="pill mb-1 bg-brand-soft text-brand"
                    onClick={() => {
                      selectNodes([node.id]);
                      rf.fitView({ nodes: [{ id: node.id }], padding: 1.5, duration: 400, maxZoom: 1.3 });
                    }}
                  >
                    On “{node.name}”
                  </button>
                )}
                <p className="m-0 text-sm whitespace-pre-wrap">{c.body}</p>
                {!viewer && (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="btn sm"
                    onClick={async () => {
                      await supabaseBrowser().from("share_comments").update({ resolved: !c.resolved }).eq("id", c.id);
                      load();
                    }}
                  >
                    {c.resolved ? "Reopen" : "Resolve"}
                  </button>
                  <button
                    type="button"
                    className="btn sm danger"
                    onClick={async () => {
                      if (!confirm("Delete this comment?")) return;
                      await supabaseBrowser().from("share_comments").delete().eq("id", c.id);
                      load();
                    }}
                  >
                    Delete
                  </button>
                </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
