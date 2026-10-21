"use client";
// Finding (V2 §16): a card, or a compact row, for one deterministic fact: headline, evidence, impact, actions.
// Used for Model checks, the Biggest leak and goal gaps. Neutral styling, no AI labels.
import { Icon } from "@/components/icon";
import type { Finding as FindingData } from "@/lib/findings";

export interface FindingAction {
  label: string;
  run: () => void;
}

export function Finding({ f, actions = [], compact = false }: { f: FindingData; actions?: FindingAction[]; compact?: boolean }) {
  return (
    <article className={`fm-finding ${f.kind}${compact ? " compact" : ""}`} aria-label={f.headline}>
      <Icon name={f.kind === "goal" ? "target" : "alert"} size={14} />
      <div>
        <h5>{f.headline}</h5>
        {f.evidence && <p className="ev">{f.evidence}</p>}
        {f.impact && <p className="im">{f.impact}</p>}
        {actions.length > 0 && (
          <div className="acts">
            {actions.map((a) => (
              <button key={a.label} type="button" className="btn sm ghost" onClick={a.run}>
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

/** The Insights slot: shows findings when there are any, and nothing at all (not even a heading) when there are none. */
export function InsightsSlot({ findings, actionsFor }: { findings: FindingData[]; actionsFor?: (f: FindingData) => FindingAction[] }) {
  if (!findings.length) return null;
  return (
    <section className="fm-insights" aria-label="Insights">
      {findings.map((f) => (
        <Finding key={f.id} f={f} compact actions={actionsFor?.(f)} />
      ))}
    </section>
  );
}
