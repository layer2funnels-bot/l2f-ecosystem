"use client";
// How the math works (V2 F9): the selected step's numbers in words, with the arithmetic, and a short glossary.
// Display only: every figure is the engine's own (lib/math-explain reads FunnelResult).
import { useMemo } from "react";
import { perSuffix } from "@/lib/format";
import { explainBlock, GLOSSARY } from "@/lib/math-explain";
import { shownR, useEditor, viewK } from "@/lib/editor/store";

export function MathPanel() {
  const nodes = useEditor((s) => s.nodes);
  const edges = useEditor((s) => s.edges);
  const sel = useEditor((s) => s.selNodes);
  const R = useEditor(shownR);
  const cur = useEditor((s) => s.settings.currency);
  const k = useEditor((s) => viewK(s.opts));
  const hidden = useEditor((s) => s.settings.hideNumbers);
  const n = sel.length === 1 ? nodes.find((x) => x.id === sel[0]) : undefined;
  const lines = useMemo(
    () => (n ? explainBlock(n, { nodes, edges }, R, cur, k) : []),
    [n, nodes, edges, R, cur, k],
  );
  return (
    <div className="fm-mathpanel">
      <h3>How the math works</h3>
      {hidden ? (
        <p className="muted">Numbers are turned off for this funnel.</p>
      ) : n ? (
        <>
          <h4>
            {n.name} <small>{perSuffix(k)}</small>
          </h4>
          <ol>
            {lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ol>
        </>
      ) : (
        <p className="muted">
          Select one step on the map to see how its numbers are worked out.
        </p>
      )}
      <h4>Glossary</h4>
      <dl>
        {GLOSSARY.map(([t, d]) => (
          <div key={t}>
            <dt>{t}</dt>
            <dd>{d}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
