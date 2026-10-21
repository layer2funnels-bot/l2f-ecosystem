"use client";
import { TimeAgo } from "@/components/time-ago";
import { useState } from "react";
import { useEditor } from "@/lib/editor/store";
import type { ShareCommentLite } from "./editor";

/** Comment box on the public share page. Comments can be pinned to the selected block. */
export function ShareComments({ token, initial }: { token: string; initial: ShareCommentLite[] }) {
  const [list, setList] = useState(initial.filter((c) => !c.resolved));
  const [author, setAuthor] = useState(() => {
    try {
      return localStorage.getItem("fm-comment-name") ?? "";
    } catch {
      return "";
    }
  });
  const [body, setBody] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const sel = useEditor((s) => (s.selNodes.length === 1 ? s.nodes.find((n) => n.id === s.selNodes[0]) : undefined));
  const nodes = useEditor((s) => s.nodes);
  return (
    <section className="mt-6 border-t border-line pt-4" aria-labelledby="sc-h">
      <h4 id="sc-h" className="mt-0!">
        Comments
      </h4>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setErr("");
          setBusy(true);
          const r = await fetch(`/api/share/${token}/comments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ author, body, node_id: sel?.id ?? "" }) });
          setBusy(false);
          if (!r.ok) return setErr((await r.json().catch(() => ({}))).error ?? "Couldn’t post the comment");
          const { id } = await r.json();
          try {
            localStorage.setItem("fm-comment-name", author);
          } catch {}
          setList((l) => [...l, { id, node_id: sel?.id ?? null, author_name: author, body, resolved: false, created_at: new Date().toISOString() }]);
          setBody("");
        }}
      >
        <div className="field">
          <label htmlFor="sc-name">Your name</label>
          <input id="sc-name" className="input" value={author} onChange={(e) => setAuthor(e.target.value)} autoComplete="name" />
        </div>
        <div className="field">
          <label htmlFor="sc-body">{sel ? `Comment on “${sel.name}”` : "Comment on the funnel"}</label>
          <textarea id="sc-body" className="input" value={body} onChange={(e) => setBody(e.target.value)} required maxLength={4000} />
          <span className="help">Select a block on the map first to comment on that step.</span>
        </div>
        {err && (
          <p role="alert" className="mb-2 text-sm text-bad">
            {err}
          </p>
        )}
        <button className="btn primary" disabled={busy || !body.trim()}>
          {busy ? "Posting…" : "Post comment"}
        </button>
      </form>
      <ul className="m-0 mt-4 list-none p-0">
        {list.map((c) => (
          <li key={c.id} className="mb-2 rounded-xl border border-line p-3 text-sm">
            <div className="mb-1 text-xs text-muted">
              <b className="text-ink">{c.author_name || "Anonymous"}</b> · <TimeAgo iso={c.created_at} />
              {c.node_id && <> · on “{nodes.find((n) => n.id === c.node_id)?.name ?? "a removed step"}”</>}
            </div>
            <p className="m-0 whitespace-pre-wrap">{c.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
