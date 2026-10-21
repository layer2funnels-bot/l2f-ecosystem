"use client";
// Simulate: change an assumption and watch the funnel answer. The panel holds the controls; the canvas overlay (node chips,
// connection ghosts) is drawn by nodes.tsx / flow-edge.tsx and the KPI strip. Every number is the engine's (`R`) next to the
// baseline run taken when simulating started — see lib/simulate.ts.
import { useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { money, nf, ratio, sym, people } from "@/lib/format";
import { num } from "@/lib/funnel-math";
import {
  assumptionChanges,
  knobsOf,
  same,
  totalsDelta,
  topMovers,
  type Knob,
  type StepDelta,
  type TotalDelta,
} from "@/lib/simulate";
import {
  nid,
  rebaseSim,
  revertSim,
  setSettings,
  stopSim,
  updateParams,
  useEditor,
  keyLeakOf, setSimBefore, setSimPlay, setSimSpeed, setSimWalk,
} from "@/lib/editor/store";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { useFocusBlock } from "./focus";
import { NumInput } from "./fields";

export const fmtTotal: Record<TotalDelta["key"], (v: number, cur: string) => string> = {
  traffic: (v) => nf(v),
  leads: (v) => people(v),
  cust: (v) => people(v),
  rev: (v, c) => money(v, c),
  spend: (v, c) => money(v, c),
  profit: (v, c) => money(v, c),
  roas: (v) => ratio(v),
  cpa: (v, c) => money(v, c),
};

/** "▲ +£1,230 · +20%": what a number did against the baseline. Colour carries good / bad, the arrow and sign carry it without colour. */
export function DeltaChip({
  t,
  cur,
  compact,
}: {
  t: TotalDelta;
  cur: string;
  compact?: boolean;
}) {
  if (t.tone === "same")
    return <span className="fm-dchip same">{compact ? "–" : "No change"}</span>;
  const abs = fmtTotal[t.key](Math.abs(t.delta), cur);
  const sign = t.delta > 0 ? "+" : "−";
  const p =
    t.pct != null
      ? ` · ${t.pct > 0 ? "+" : "−"}${nf(Math.abs(t.pct) * 100, 0)}%`
      : "";
  return (
    <span
      className={`fm-dchip ${t.tone}`}
      title={`was ${fmtTotal[t.key](t.was, cur)}`}
    >
      <span aria-hidden="true">{t.delta > 0 ? "▲" : "▼"}</span> {sign}
      {abs}
      {!compact && p}
    </span>
  );
}

function Lever({
  label,
  help,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  help: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const id = `sim-${label.replace(/\W+/g, "-").toLowerCase()}`;
  const change = value - 1;
  return (
    <div className="fm-lever">
      <div className="top">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>
          {nf(value, 2)}×
          {Math.abs(change) > 1e-9 && (
            <small className={change > 0 ? "up" : "down"}>
              {" "}
              {change > 0 ? "+" : "−"}
              {nf(Math.abs(change) * 100, 0)}%
            </small>
          )}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={0.05}
        value={value}
        onChange={(e) => onChange(num(e.target.value))}
        aria-describedby={`${id}-h`}
      />
      <p id={`${id}-h`} className="help">
        {help}
      </p>
    </div>
  );
}

function BlockKnob({ id, k, cur }: { id: string; k: Knob; cur: string }) {
  const node = useEditor((s) => s.nodes.find((n) => n.id === id));
  const was = useEditor(
    (s) => s.simBase?.nodes.find((n) => n.id === id)?.p[k.key],
  );
  if (!node) return null;
  const now = Number(node.p[k.key]) || 0;
  const wasN = was === undefined ? null : Number(was) || 0;
  const C = sym(cur).trim();
  const max = k.max ?? Infinity;
  const set = (v: number) =>
    updateParams(id, { [k.key]: Math.max(0, Math.min(max, v)) });
  const nudge = (f: number) => set(Math.round(now * f * 100) / 100);
  const label = `${k.label}${k.unit === "%" ? " (%)" : k.unit === "cur" ? ` (${C})` : ""}`;
  const uid = `sim-k-${id}-${k.key}`;
  return (
    <div className="fm-knob">
      <label htmlFor={uid}>{label}</label>
      <div className="row">
        <button
          type="button"
          className="btn sm"
          aria-label={`Lower ${k.label} by 10%`}
          title="−10%"
          onClick={() => nudge(0.9)}
        >
          −10%
        </button>
        <NumInput id={uid} value={now} min={0} max={k.max} onChange={set} />
        <button
          type="button"
          className="btn sm"
          aria-label={`Raise ${k.label} by 10%`}
          title="+10%"
          onClick={() => nudge(1.1)}
        >
          +10%
        </button>
      </div>
      {k.unit === "%" && (
        <input
          type="range"
          min={0}
          max={100}
          step={0.5}
          value={Math.min(100, now)}
          onChange={(e) => set(num(e.target.value))}
          aria-label={`${k.label} slider`}
        />
      )}
      {wasN != null && Math.abs(wasN - now) > 1e-9 && (
        <p className="was">
          was {nf(wasN, 2)}
          {k.unit === "%" ? "%" : ""} → now {nf(now, 2)}
          {k.unit === "%" ? "%" : ""}
        </p>
      )}
    </div>
  );
}

export function SimulatePanel() {
  const base = useEditor((s) => s.simBase);
  const R = useEditor((s) => s.R);
  const nodes = useEditor((s) => s.nodes);
  const settings = useEditor((s) => s.settings);
  const sel = useEditor((s) =>
    s.selNodes.length === 1
      ? s.nodes.find((n) => n.id === s.selNodes[0])
      : undefined,
  );
  const cur = settings.currency;
  const focus = useFocusBlock();
  const [name, setName] = useState("");
  const playing = useEditor((x) => x.simPlay);
  const speed = useEditor((x) => x.simSpeed);
  const walk = useEditor((x) => x.simWalk);
  const before = useEditor((x) => x.simBefore);
  const calm = useReducedMotion();
  const w = settings.whatif;
  const setLever = (k: keyof typeof w) => (v: number) =>
    setSettings({ whatif: { ...w, [k]: v } });
  const totals = useMemo(() => (base ? totalsDelta(R, base.R) : []), [R, base]);
  const movers = useMemo(
    () => (base ? topMovers(nodes, R, base.R, 5) : []),
    [nodes, R, base],
  );
  const changes = useMemo(
    () => (base ? assumptionChanges(nodes, base.nodes) : []),
    [nodes, base],
  );
  const leak = useEditor((s) => s.keyLeak);
  if (!base) return null;
  const knobs = sel ? knobsOf(sel) : [];
  const leverMoved = (["traffic", "conv", "price", "cost"] as const).some(
    (k) =>
      Math.abs((num(w[k]) || 1) - (num(base.settings.whatif[k]) || 1)) > 1e-9,
  );
  const leversSet = (["traffic", "conv", "price", "cost"] as const).some(
    (k) => Math.abs((num(w[k]) || 1) - 1) > 1e-9,
  );
  const dirty =
    leverMoved || changes.length > 0 || totals.some((t) => t.delta !== 0);
  const baseLeak = keyLeakOf(base.nodes, base.R);
  const leakNode = nodes.find((n) => n.id === leak);
  const leakNow = leak ? R.N[leak]?.non : undefined;
  const at = new Date(base.at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const save = () => {
    const n = (
      name.trim() || `Simulation ${settings.scenarios.length + 1}`
    ).slice(0, 60);
    setSettings({
      scenarios: [
        ...settings.scenarios,
        { id: nid(), name: n, kind: "custom", whatif: { ...w } },
      ],
    });
    setName("");
  };
  const blockSection = (
    <section aria-label="One block" className="fm-sim-sec">
      <h4>Change one block</h4>
      {sel && knobs.length > 0 ? (
        <>
          <p className="sub fm-sim-selname">{sel.name}</p>
          {knobs.map((k) => (
            <BlockKnob key={`${sel.id}-${k.key}`} id={sel.id} k={k} cur={cur} />
          ))}
        </>
      ) : sel ? (
        <p className="sub">
          This block has nothing to simulate. Pick a page, offer, action or
          source.
        </p>
      ) : (
        <p className="sub">
          Click a block on the map to change its own conversion rate, price or
          spend.
        </p>
      )}
    </section>
  );
  return (
    <div className="fm-sim" aria-label="Simulate">
      <div className="fm-sim-sticky">
        <div className="fm-sim-head">
          <div>
            <h3>Simulate</h3>
            <p className="sub">
              Change an assumption; the map answers. Compared with the map at{" "}
              {at}.
            </p>
          </div>
        </div>

        <div className="fm-sim-view">
          <div className="seg" role="group" aria-label="Show the map">
            <button type="button" aria-pressed={!before} onClick={() => setSimBefore(false)}>
              After
            </button>
            <button type="button" aria-pressed={before} onClick={() => setSimBefore(true)} title="See the whole map as it was when you started">
              Before
            </button>
          </div>
          <button type="button" className={`btn sm fm-playbtn${playing ? " on" : ""}`} aria-pressed={playing} disabled={calm} onClick={() => setSimPlay(!playing)} title={calm ? "Your device asks for less motion, so the flow animation is off" : "Watch people move through the funnel"}>
            <Icon name={playing ? "pause" : "play"} size={14} /> {playing ? "Pause flow" : "Play flow"}
          </button>
          <div className="seg fm-simspeed" role="group" aria-label="Flow speed">
            {([1, 2, 4] as const).map((x) => (
              <button key={x} type="button" aria-pressed={speed === x} onClick={() => setSimSpeed(x)}>
                {x}×
              </button>
            ))}
          </div>
          <button type="button" className="btn sm" aria-pressed={walk != null} onClick={() => setSimWalk(walk == null ? 0 : null)} title="Step through the funnel one stage at a time (← →)">
            Walk-through
          </button>
        </div>
        <p className="sr-only" role="status" aria-live="polite">
          {before ? "Showing the map before your changes" : "Showing the map with your changes"}
        </p>
        {before && <p className="fm-sim-note">Showing the map as it was at {at}. Switch to After to see your changes.</p>}
        {playing && !before && <p className="fm-sim-note">Each dot is a share of the people on that line, so busier lines carry more. Orange dots are people lost at a step.</p>}
      </div>

      <section aria-label="What changed" className="fm-sim-sec fm-sim-result">
        <h4>What changed</h4>
        {totals.some((t) => t.tone !== "same") ? (
          <dl className="fm-sim-tot">
            {totals
              .filter((t) => t.tone !== "same")
              .map((t) => (
                <div key={t.key}>
                  <dt>{t.label}</dt>
                  <dd>
                    <DeltaChip t={t} cur={cur} />
                  </dd>
                </div>
              ))}
          </dl>
        ) : (
          <p className="sub">Nothing yet. Move a lever or change a block and the difference shows here.</p>
        )}
        {leakNode && leakNow != null && baseLeak && baseLeak !== leak && (
          <p className="fm-sim-leak">
            The biggest leak moved to{" "}
            <button type="button" className="link" onClick={() => focus(leakNode.id)}>
              {leakNode.name}
            </button>
            .
          </p>
        )}
        <p className="sub">
          Totals stay in the strip below; Reports has the full picture.
        </p>
      </section>

      {sel ? blockSection : null}
      <section aria-label="Levers" className="fm-sim-sec">
        <h4>Change the whole funnel</h4>
        <Lever
          label="Traffic"
          help="Every source, including what you spend."
          value={num(w.traffic) || 1}
          min={0.25}
          max={5}
          onChange={setLever("traffic")}
        />
        <Lever
          label="Conversion rates"
          help="Every page, action and offer rate."
          value={num(w.conv) || 1}
          min={0.5}
          max={2}
          onChange={setLever("conv")}
        />
        <Lever
          label="Prices"
          help="Every price, setup fee and trial price."
          value={num(w.price) || 1}
          min={0.5}
          max={2}
          onChange={setLever("price")}
        />
        <Lever
          label="Traffic cost"
          help="CPC, CPM and budget per visitor."
          value={num(w.cost) || 1}
          min={0.5}
          max={2}
          onChange={setLever("cost")}
        />
        {settings.scenarios.length > 0 && (
          <div
            className="fm-sim-chips"
            role="group"
            aria-label="Start from a scenario"
          >
            <span>Try</span>
            {settings.scenarios.map((sc) => (
              <button
                key={sc.id}
                type="button"
                className="btn sm"
                onClick={() => setSettings({ whatif: { ...sc.whatif } })}
              >
                {sc.name || "Scenario"}
              </button>
            ))}
          </div>
        )}
      </section>

      {!sel ? blockSection : null}

      {movers.length > 0 && (
        <section aria-label="What moved" className="fm-sim-sec">
          <h4>What moved</h4>
          <ul className="fm-sim-movers">
            {movers.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => focus(m.id)}>
                  <span className="nm">{m.name}</span>
                  <span className="d">
                    <span className={m.d.dInflow >= 0 ? "pos" : "neg"}>
                      {m.d.dInflow >= 0 ? "+" : "−"}
                      {people(Math.abs(m.d.dInflow))} people
                    </span>
                    {Math.abs(m.d.dLost) > 1e-9 && (
                      <span className={m.d.dLost > 0 ? "neg" : "pos"}>
                        {m.d.dLost > 0 ? "+" : "−"}
                        {people(Math.abs(m.d.dLost))} lost
                      </span>
                    )}
                    {Math.abs(m.d.dRev) > 0.005 && (
                      <span className={m.d.dRev >= 0 ? "pos" : "neg"}>
                        {m.d.dRev >= 0 ? "+" : "−"}
                        {money(Math.abs(m.d.dRev), cur)}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {changes.length > 0 && (
        <section aria-label="Your changes" className="fm-sim-sec">
          <h4>Your block changes</h4>
          <ul className="fm-sim-changes">
            {changes.map((c) => (
              <li key={`${c.id}-${c.key}`}>
                <span>
                  <b>{c.name}</b> · {c.label}: {nf(c.was, 2)} → {nf(c.now, 2)}
                </span>
                <button
                  type="button"
                  className="btn icon ghost"
                  aria-label={`Undo the change to ${c.name}: ${c.label}`}
                  title="Put it back"
                  onClick={() => revertSim(c.id, c.key)}
                >
                  <Icon name="undo" size={14} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section
        aria-label="Keep or discard"
        className="fm-sim-sec fm-sim-actions"
      >
        <div className="row">
          <button
            type="button"
            className="btn"
            disabled={!dirty}
            onClick={() => revertSim()}
            title="Put the four levers and every block assumption back to how they were"
          >
            Revert all
          </button>
          <button
            type="button"
            className="btn"
            disabled={!dirty}
            onClick={rebaseSim}
            title="Compare against the map as it is now"
          >
            Use as new start
          </button>
        </div>
        <div className="row save">
          <input
            className="input"
            aria-label="Scenario name"
            placeholder="Name this scenario"
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            type="button"
            className="btn primary"
            onClick={save}
            disabled={!leversSet}
          >
            Save levers as scenario
          </button>
        </div>
        {changes.length > 0 && (
          <p className="sub">
            A scenario keeps the four levers. Block changes stay on the map.
          </p>
        )}
      </section>
      <footer className="fm-sim-foot">
        <button type="button" className="btn primary" onClick={stopSim} title="Close Simulate and keep the map as it is now">
          Done
        </button>
      </footer>
    </div>
  );
}

/** Under a block while simulating: what the change did to the people who reach it, the people it loses, and its revenue. */
export function SimChip({
  d,
  k,
  cur,
  source,
}: {
  d: StepDelta;
  k: number;
  cur: string;
  source: boolean;
}) {
  if (!d.changed) return null;
  const dp = source ? d.dOut : d.dInflow;
  const bits: { text: string; tone: "good" | "bad" | "neutral" }[] = [];
  if (!same(dp, 0))
    bits.push({
      text: `${dp > 0 ? "▲ +" : "▼ −"}${people(Math.abs(dp) * k)} ${source ? "visits" : "in"}`,
      tone: dp > 0 ? "good" : "bad",
    });
  if (!source && !same(d.dLost, 0))
    bits.push({
      text: `${d.dLost > 0 ? "+" : "−"}${people(Math.abs(d.dLost) * k)} lost`,
      tone: d.dLost > 0 ? "bad" : "good",
    });
  if (!same(d.dRev, 0))
    bits.push({
      text: `${d.dRev > 0 ? "▲ +" : "▼ −"}${money(Math.abs(d.dRev) * k, cur)}`,
      tone: d.dRev > 0 ? "good" : "bad",
    });
  if (!bits.length) return null;
  return (
    <span
      className="fm-simchip"
      role="note"
      aria-label={`Change: ${bits.map((b) => b.text).join(", ")}`}
      key={bits.map((b) => b.text).join("|")}
    >
      {bits.map((b, i) => (
        <span key={i} className={b.tone}>
          {b.text}
        </span>
      ))}
    </span>
  );
}
