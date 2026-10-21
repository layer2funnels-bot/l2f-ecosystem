"use client";
// Outline: every object on the canvas, in flow order, with selection kept in sync. Click = select and zoom to it.
import { useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { isAnnot, typeOf } from "@/lib/catalog";
import { useEditor } from "@/lib/editor/store";
import type { IconName } from "@/lib/icons";
import { useFocusBlock } from "./focus";

export function Outline() {
  const nodes = useEditor((s) => s.nodes);
  const order = useEditor((s) => s.R.order);
  const sel = useEditor((s) => s.selNodes);
  const shared = useEditor((s) => s.shared);
  const [q, setQ] = useState("");
  const focus = useFocusBlock();
  const groups = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const flow = order.map((id) => byId.get(id)).filter((n) => n && !isAnnot(n.type) && typeOf(n.type)) as typeof nodes;
    const seen = new Set(flow.map((n) => n.id));
    const loose = nodes.filter((n) => !isAnnot(n.type) && typeOf(n.type) && !seen.has(n.id)); // not reached yet
    const frames = nodes.filter((n) => n.type === "frame");
    const notes = nodes.filter((n) => isAnnot(n.type) && n.type !== "frame");
    const s = q.trim().toLowerCase();
    const f = (l: typeof nodes) => (s ? l.filter((n) => `${n.name} ${typeOf(n.type).label} ${String(n.p.text ?? "")}`.toLowerCase().includes(s)) : l);
    return [
      ["Steps", f(flow)],
      ["Not connected yet", f(loose)],
      ["Frames", f(frames)],
      ["Notes & layout", f(notes)],
    ] as [string, typeof nodes][];
  }, [nodes, order, q]);
  const total = groups.reduce((a, [, l]) => a + l.length, 0);
  return (
    <div className="fm-outline">
      <label>
        <span className="sr-only">Search the outline</span>
        <input className="fm-psearch" type="search" placeholder="Find on the map" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {groups.map(([title, list]) =>
        list.length ? (
          <section key={title} aria-label={title}>
            <h2>
              {title} <small>{list.length}</small>
            </h2>
            <ul>
              {list.map((n) => {
                const T = typeOf(n.type);
                const label = n.type === "label" || n.type === "note" ? String(n.p.text ?? "").split("\n")[0].slice(0, 40) || T.label : n.type === "checklist" ? String(n.p.title ?? "Checklist") : n.name || T.label;
                return (
                  <li key={n.id}>
                    <button type="button" aria-current={sel.includes(n.id) ? "true" : undefined} onClick={() => focus(n.id)} title={`${label} · ${T.label}`}>
                      <Icon name={(n.s?.icon as IconName) || T.icon} size={14} />
                      <span className="nm">{label}</span>
                      <small>{T.label}</small>
                      {n.locked && <Icon name="lock" size={12} />}
                      {!shared && !isAnnot(n.type) && <i className={`st ${n.status ?? "planned"}`} aria-label={n.status ?? "planned"} />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null,
      )}
      {!total && <p className="hint">{nodes.length ? "Nothing matches." : "The map is empty. Add blocks from the library."}</p>}
    </div>
  );
}
