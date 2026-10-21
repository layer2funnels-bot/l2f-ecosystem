"use client";
import { useBand } from "@/lib/use-band";
import { useFocusBlock } from "./focus";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { money, pct, people, peopleExact, perSuffix, perWord, ratio } from "@/lib/format";
import { healthChecks } from "@/lib/health";
import { setTab, clearSelection, shownR, useEditor, viewK } from "@/lib/editor/store";
import { totalsDelta } from "@/lib/simulate";
import { DeltaChip, fmtTotal } from "./simulate";

/** Popover above the strip; closes on outside click and Escape. */
function Pop({ label, button, children, wide }: { label: string; button: (open: boolean) => React.ReactNode; children: (close: () => void) => React.ReactNode; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <div className="fm-kpop" ref={ref}>
      <button type="button" className="fm-kbtn" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {button(open)}
      </button>
      {open && (
        <div className={`fm-kpop-card${wide ? " wide" : ""}`} role="dialog" aria-label={label}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/**
 * Bottom strip (V2 F11): checks chip, the headline numbers in priority order, "+N more", one Plan tag and the unit.
 * Priority: Traffic, Revenue, Profit, Customers, ROAS, Leads, then ROI, AOV, CPA, CPL, EPC, Conversion rate. Traffic
 * never collapses; lower-priority figures move into More as the space shrinks. Every figure is the engine's `R`.
 */
export function KpiBar() {
  const band = useBand();
  const R = useEditor(shownR);
  const liveR = useEditor((s) => s.R);
  const before = useEditor((s) => s.simBefore);
  const cur = useEditor((s) => s.settings.currency);
  const basis = useEditor((s) => s.settings.basis);
  const nodes = useEditor((s) => s.nodes);
  const edges = useEditor((s) => s.edges);
  const warnIds = useEditor((s) => s.warnIds);
  const shared = useEditor((s) => s.shared);
  const sideOpen = useEditor((s) => !s.opts.hideSide && !s.readOnly);
  const actual = useEditor((s) => s.actualView);
  const focus = useFocusBlock();
  const simBase = useEditor((s) => s.simBase ?? s.compareBase); // the simulation baseline, or Baseline while Compare with Baseline is on
  const rangeK = useEditor((s) => viewK(s.opts));
  // the strip's real width decides how many figures fit beside the checks chip, "+N more" and the Plan label
  const bar = useRef<HTMLElement>(null);
  const [barW, setBarW] = useState(0);
  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBarW(el.clientWidth));
    ro.observe(el);
    setBarW(el.clientWidth); // eslint-disable-line react-hooks/set-state-in-effect -- measuring once on mount
    return () => ro.disconnect();
  }, []);
  const k = actual ? 1 : rangeK; // Plan numbers cover the calendar range; Actual numbers are the real totals for it
  const sfx = perSuffix(k);
  const FLOW = new Set(["traffic", "leads", "cust", "rev", "spend", "profit"]);
  const scaled = (t: ReturnType<typeof totalsDelta>[number]) => (k !== 1 && FLOW.has(t.key) ? { ...t, value: t.value * k, was: t.was * k, delta: t.delta * k } : t);
  const sim = simBase && !before ? Object.fromEntries(totalsDelta(liveR, simBase.R).map((t) => [t.key, scaled(t)])) : null;
  // checks are for the team, not for clients viewing a share link
  const checks = shared ? [] : healthChecks({ nodes, edges });
  const hasTraffic = nodes.some((n) => n.type !== "frame" && n.type !== "note" && n.type !== "label");
  const m = (v: number) => money(v, cur);
  const ltv = basis === "ltv" ? <span className="fm-ltv" title="Lifetime value is the basis for revenue, profit and ROAS">LTV</span> : null;
  const neg = (v: number, node: React.ReactNode) => <span className={v >= 0 ? "pos" : "neg"}>{node}</span>;
  type K = { id: string; /** Label in the strip, where the unit sits at the right ("per month · USD"). */ short?: React.ReactNode; label: React.ReactNode; text: string; value: React.ReactNode; title?: string; sim?: "traffic" | "leads" | "cust" | "rev" | "profit" | "roas" | "spend" | "cpa" };
  const all: K[] = [
    { id: "traffic", short: "Traffic", label: `Traffic ${sfx}`, text: "Traffic", value: people(R.traffic * k), title: peopleExact(R.traffic * k), sim: "traffic" },
    { id: "revenue", short: <>Revenue {ltv}</>, label: <>Revenue {sfx} {ltv}</>, text: "Revenue", value: m(R.rev * k), sim: "rev" },
    { id: "profit", short: <>Profit {ltv}</>, label: <>Profit {sfx} {ltv}</>, text: "Profit", value: neg(R.profit, m(R.profit * k)), sim: "profit" },
    { id: "customers", short: "Customers", label: `Customers ${sfx}`, text: "Customers", value: people(R.cust * k), title: peopleExact(R.cust * k), sim: "cust" },
    { id: "roas", label: <>ROAS {ltv}</>, text: "ROAS", value: ratio(R.roas), sim: "roas" },
    { id: "leads", short: "Leads", label: `Leads ${sfx}`, text: "Leads", value: people(R.leads * k), title: peopleExact(R.leads * k), sim: "leads" },
    { id: "roi", label: "ROI", text: "ROI", value: pct(R.roi) },
    { id: "aov", label: "AOV", text: "AOV", value: m(R.aov) },
    { id: "cpa", label: "CPA", text: "CPA", value: m(R.cpa), sim: "cpa" },
    { id: "cpl", label: "CPL", text: "CPL", value: m(R.cpl) },
    { id: "epc", label: "EPC", text: "EPC", value: m(R.epc) },
    { id: "conv", label: "Conversion rate", text: "Conversion rate", value: pct(R.conv) },
    { id: "spend", short: "Ad spend", label: `Ad spend ${sfx}`, text: "Ad spend", value: m(R.spend * k), sim: "spend" },
    { id: "mrr", label: "MRR", text: "MRR", value: m(R.mrr) },
    { id: "ltvc", label: "LTV / customer", text: "LTV / customer", value: m(R.ltvc) },
  ];
  const chip = (k: K) =>
    sim && k.sim ? (
      <>
        <DeltaChip t={sim[k.sim]} cur={cur} compact />
        {sim[k.sim].delta !== 0 && <small className="fm-kwas">was {fmtTotal[k.sim](sim[k.sim].was, cur)}</small>}
      </>
    ) : null;
  const named = nodes.filter((n) => warnIds.has(n.id));
  // visible counts per band (F11); phone shows every figure as scrolling chips, starting with Traffic
  const roomy = band === "phone" ? all.length : band === "tablet" ? 3 : band === "md" ? 4 : sideOpen ? 5 : 6;
  const visible = band === "phone" || band === "tablet" || band === "md" || !barW ? roomy : Math.max(3, Math.min(roomy, Math.floor((barW - 340) / 105)));
  const SHOW_MD = ["traffic", "revenue", "profit", "roas"];
  const strip = band === "md" ? all.filter((k) => SHOW_MD.includes(k.id)) : all.slice(0, visible);
  const rest = all.filter((k) => !strip.includes(k));
  const compactChecks = band === "md" || band === "tablet" || band === "phone";
  return (
    <footer ref={bar} className={`fm-kpis${sim ? " sim" : ""}${before ? " before" : ""}`} aria-label="Funnel numbers" tabIndex={0}>
      {hasTraffic && !shared && (
        <Pop
          label="Model checks"
          button={() =>
            checks.length > 0 ? (
              <span className="fm-chk warn">
                <Icon name="alert" size={14} />
                {compactChecks ? checks.length : `Checks · ${checks.length} to fix`}
              </span>
            ) : (
              <span className="fm-chk ok">
                <Icon name="check" size={14} />
                All clear
              </span>
            )
          }
        >
          {(close) => (
            <>
              <h3>Model checks</h3>
              {checks.length === 0 ? (
                <p>All clear: the map is connected and set up. Conversion losses are under Performance (Biggest leak) in the funnel panel.</p>
              ) : (
                <>
                  <p className="fm-kcap">
                    {checks.length} to fix. These may affect the numbers.
                  </p>
                  <ul>
                    {checks.map((c) => (
                      <li key={c.id}>{c.text}</li>
                    ))}
                  </ul>
                  {named.length > 0 && (
                    <div className="fm-kgo">
                      {named.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => {
                            close();
                            focus(n.id);
                          }}
                        >
                          Show “{n.name}”
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    className="fm-klink"
                    onClick={() => {
                      close();
                      clearSelection();
                      setTab("math");
                      document.querySelector(".fm-editor")?.classList.add("show-insp");
                    }}
                  >
                    Open the funnel panel
                  </button>
                </>
              )}
            </>
          )}
        </Pop>
      )}
      {strip.map((k) => (
        <div className="fm-kpi" key={k.id} data-kpi={k.id}>
          <div>{k.short ?? k.label}</div>
          <b title={k.title}>{k.value}</b>
          {chip(k)}
        </div>
      ))}
      {rest.length > 0 && (
        <Pop
          label="More numbers"
          wide
          button={() => (
            <>
              <span className="fm-kmore">+{rest.length}{band === "md" || band === "tablet" ? "" : " more"}</span>
            </>
          )}
        >
          {() => (
            <dl className="fm-ekgrid">
              {rest.map((k) => (
                <div key={k.id}>
                  <dt>{k.label}</dt>
                  <dd title={k.title}>
                    {k.value} {chip(k)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </Pop>
      )}
      <span className="fm-kunit">
        {actual ? (
          <>
            <span className="fm-tag actual" title="Numbers entered or imported in Actuals">
              Actual
            </span>{" "}
            {actual.label} · {cur}
          </>
        ) : (
          <>
            <span className="fm-tag plan" title="Modelled numbers from the map (the plan)">
              Plan
            </span>{" "}
            {perWord(k)} · {cur}
            {basis === "ltv" ? " · lifetime value" : ""}
          </>
        )}
      </span>
    </footer>
  );
}
