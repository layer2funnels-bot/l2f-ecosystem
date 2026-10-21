"use client";
// Reports / Insights: a full-width view of the funnel's numbers. Every figure comes from lib/report-data.ts, which only
// assembles lib/funnel-math.ts results for one scenario snapshot (the map as it is now, as mapped, or a saved scenario).
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { typeOf } from "@/lib/catalog";
import { money, moneyShort, nf, pct, ratio, people } from "@/lib/format";
import { compute, computeScenario, periodFactor, periodNumbers, type FunnelResult, type PeriodKey } from "@/lib/funnel-math";
import { GOAL_KINDS, GOAL_PERIODS, STEP_STATUSES, type FunnelSettings, type Goal, type StepStatus } from "@/lib/graph";
import { monthlyPlanVsActual, reportData, statusReport, type GoalReport } from "@/lib/report-data";
import { nid, setInspTab, setOpt, setSection, setSettings, setTab, showToast, updateNode, useEditor, type ReportSection } from "@/lib/editor/store";
import { useFocusBlock } from "./focus";
import { ensureActuals } from "./assets";
import { WidgetCard } from "./widget-node";
import { NumInput } from "./fields";
import { BarsChart, PairBars, TimeChart } from "./report-charts";

/** Report navigation, grouped as in the V2 design. */
export const REPORT_GROUPS: { name: string; items: [ReportSection, string][] }[] = [
  {
    name: "Summary",
    items: [
      ["overview", "Overview"],
      ["data", "Funnel data"],
      ["status", "Published status"],
    ],
  },
  {
    name: "Money",
    items: [
      ["sources", "Traffic sources"],
      ["offers", "Offers & products"],
      ["expenses", "Expenses"],
    ],
  },
  {
    name: "Planning",
    items: [
      ["scenarios", "Scenario comparison"],
      ["forecast", "Revenue & profit forecast"],
      ["goals", "Goals & required numbers"],
      ["mrr", "MRR forecast"],
      ["monthly", "Month-to-month"],
      ["reinvest", "Traffic reinvestment"],
    ],
  },
];
export const REPORT_SECTIONS: [ReportSection, string][] = REPORT_GROUPS.flatMap((g) => g.items);

const NEUTRAL = { traffic: 1, conv: 1, price: 1, cost: 1 };
const GOAL_KIND_LABEL: Record<Goal["kind"], string> = { revenue: "Revenue", profit: "Profit", traffic: "Traffic", customers: "Customers", leads: "Leads", step: "Step completions", conversion: "Conversion rate at a step (%)" };
const PERIOD_ROWS: [string, PeriodKey][] = [
  ["Per day", "day"],
  ["Per week", "week"],
  ["Per month", "month"],
  ["Per quarter", "quarter"],
  ["Per year", "year"],
];

/** Settings for one snapshot: "current" (what the map shows now), "base" (as mapped) or a saved scenario's id. */
export function snapshotSettings(s: FunnelSettings, snap: string): FunnelSettings {
  if (snap === "base") return { ...s, whatif: NEUTRAL };
  const sc = s.scenarios.find((x) => x.id === snap);
  return sc ? { ...s, whatif: sc.whatif, fixed: sc.fixed ?? s.fixed } : s;
}

export function ReportsView({ onExportPdf }: { onExportPdf?: () => void }) {
  const section = useEditor((s) => s.section);
  const onSection = setSection;
  const nodes = useEditor((s) => s.nodes);
  const edges = useEditor((s) => s.edges);
  const settings = useEditor((s) => s.settings);
  const Rnow = useEditor((s) => s.R);
  const [snap, setSnap] = useState("current");
  const snapOk = snap === "current" || snap === "base" || settings.scenarios.some((x) => x.id === snap) ? snap : "current";
  const s = useMemo(() => snapshotSettings(settings, snapOk), [settings, snapOk]);
  const g = useMemo(() => ({ nodes, edges }), [nodes, edges]);
  const R = useMemo(() => (snapOk === "current" ? Rnow : compute(g, s)), [snapOk, Rnow, g, s]);
  const data = useMemo(() => reportData(g, s, R), [g, s, R]);
  const hasFlow = nodes.some((n) => typeOf(n.type) && typeOf(n.type).cat !== "annot");
  const hasWhatif = !!settings.whatif && JSON.stringify(settings.whatif) !== JSON.stringify(NEUTRAL);
  const snapName = snapOk === "current" ? (hasWhatif ? "Map with what-if" : "Baseline (current map)") : snapOk === "base" ? "Baseline (current map)" : (settings.scenarios.find((x) => x.id === snapOk)?.name ?? "Scenario");
  const title = REPORT_SECTIONS.find(([k]) => k === section)?.[1] ?? "Reports";
  return (
    <div className="fm-reports">
      <nav className="fm-rnav" aria-label="Report sections">
        <h2>Reports</h2>
        {REPORT_GROUPS.map((g) => (
          <div key={g.name} className="fm-rgroup">
            <h3>{g.name}</h3>
            <ul>
              {g.items.map(([k, l]) => (
                <li key={k}>
                  <button type="button" aria-current={section === k ? "page" : undefined} onClick={() => onSection(k)}>
                    {l}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <label className="fm-rnav-sel">
          <span className="sr-only">Report section</span>
          <select className="input" value={section} onChange={(e) => onSection(e.target.value as ReportSection)}>
            {REPORT_GROUPS.map((g) => (
              <optgroup key={g.name} label={g.name}>
                {g.items.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </nav>
      <main className="fm-rmain" aria-labelledby="fm-rtitle">
        <header className="fm-rhead">
          <div>
            <h1 id="fm-rtitle">{title}</h1>
            <p className="sub">
              <span className="fm-tag plan" title="Modelled numbers from the map">
                Plan
              </span>{" "}
              Numbers for <b>{snapName}</b>, per month unless stated · {settings.currency} · Basis: {settings.basis === "ltv" ? "lifetime value" : "first payment"}. Same engine as the map, the KPI strip and the PDF report.
            </p>
          </div>
          {onExportPdf && (
            <button type="button" className="btn" onClick={onExportPdf}>
              <Icon name="download" size={15} /> Export PDF
            </button>
          )}
          {section !== "scenarios" && (
            <label className="fm-rsnap">
              <span>Scenario</span>
              <select className="input" value={snapOk} onChange={(e) => setSnap(e.target.value)} aria-label="Scenario for these numbers">
                <option value="current">{hasWhatif ? "Map with what-if" : "Baseline (current map)"}</option>
                {hasWhatif && <option value="base">Baseline (current map, no what-if)</option>}
                {settings.scenarios.map((sc) => (
                  <option key={sc.id} value={sc.id}>
                    {sc.name || "Scenario"}
                  </option>
                ))}
              </select>
            </label>
          )}
        </header>
        {!hasFlow && section !== "status" ? (
          <div className="fm-rempty">
            <b>Nothing to report yet</b>
            <p>Add a traffic source and the steps people take on the map, then come back for the numbers.</p>
          </div>
        ) : (
          <Section section={section} data={data} R={R} s={s} snapName={snapName} onSection={onSection} />
        )}
      </main>
    </div>
  );
}

type Data = ReturnType<typeof reportData>;
interface SP {
  section: ReportSection;
  data: Data;
  R: FunnelResult;
  s: FunnelSettings;
  snapName: string;
  onSection: (s: ReportSection) => void;
}

function Section(p: SP) {
  switch (p.section) {
    case "overview":
      return <Overview {...p} />;
    case "data":
      return <FunnelData {...p} />;
    case "sources":
      return <Sources {...p} />;
    case "offers":
      return <Offers {...p} />;
    case "expenses":
      return <Expenses {...p} />;
    case "scenarios":
      return <Scenarios />;
    case "forecast":
      return <Forecast {...p} />;
    case "goals":
      return <Goals {...p} />;
    case "mrr":
      return <Mrr {...p} />;
    case "monthly":
      return <Monthly {...p} />;
    case "reinvest":
      return <Reinvest {...p} />;
    case "status":
      return <Status />;
  }
}

const useMoney = () => {
  const cur = useEditor((s) => s.settings.currency);
  return { m: (v: number) => money(v, cur), ms: (v: number) => moneyShort(v, cur), cur };
};
const signed = (v: number, f: (v: number) => string) => (Number.isFinite(v) && v > 0 ? "+" : "") + f(v);
const cls = (v: number) => (v >= 0 ? "pos" : "neg");

/** KPI tiles. A caption can link to the report section that explains the number. */
function Kpis({ items, onSection }: { items: [string, React.ReactNode, string?, ReportSection?][]; onSection?: (s: ReportSection) => void }) {
  return (
    <dl className="fm-rkpis">
      {items.map(([a, b, c, to]) => (
        <div key={a}>
          <dt>{a}</dt>
          <dd>{b}</dd>
          {c && (
            <dd className="cap">
              {to && onSection ? (
                <small>
                  <button type="button" className="link" onClick={() => onSection(to)} title={`Open ${REPORT_SECTIONS.find(([k]) => k === to)?.[1]}`}>
                    {c}
                  </button>
                </small>
              ) : (
                <small>{c}</small>
              )}
            </dd>
          )}
        </div>
      ))}
    </dl>
  );
}

function Table({ caption, head, rows, foot, right = true, text = [], highlight = -1 }: { caption: string; head: React.ReactNode[]; rows: React.ReactNode[][]; foot?: React.ReactNode[]; right?: boolean; text?: number[]; highlight?: number }) {
  const r = (i: number) => (i && right && !text.includes(i) ? "r" : undefined);
  return (
    <div tabIndex={0} role="region" aria-label={`${caption} (scrolls sideways when it is wider than the screen)`} className="fm-tblwrap">
      <table className="tbl fm-rtbl">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col" className={r(i)}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i === highlight ? "hl" : undefined} ref={i === highlight ? (el) => el?.scrollIntoView({ block: "center" }) : undefined}>
              {row.map((c, k) => (k === 0 ? <th scope="row" key={k}>{c}</th> : <td key={k} className={r(k)}>{c}</td>))}
            </tr>
          ))}
        </tbody>
        {foot && (
          <tfoot>
            <tr>
              {foot.map((c, k) => (k === 0 ? <th scope="row" key={k}>{c}</th> : <td key={k} className={r(k)}>{c}</td>))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/* ---------------- overview ---------------- */
function Overview({ data, R, onSection }: SP) {
  const { m, ms } = useMoney();
  const focus = useFocusBlock();
  const nodes = useEditor((x) => x.nodes);
  const [per, setPer] = useState<"month" | "year">("month");
  const mo = data.overview.month,
    yr = data.overview.year,
    L = data.overview.keyLeak;
  const f = data.forecast;
  const A = per === "month" ? mo : yr;
  const other = per === "month" ? yr : mo;
  const otherLabel = per === "month" ? "a year" : "a month";
  const widgets = nodes.filter((n) => n.type === "widget");
  const tryWhatIf = (id: string) => {
    focus(id);
    setInspTab("analytics");
    setOpt("hideInsp", false);
    showToast("Step what-if: set a better conversion rate under “Goal for this step”");
  };
  return (
    <>
      <div className="fm-rtitle-row fm-rpersel">
        <div className="seg" role="group" aria-label="Period">
          <button type="button" aria-pressed={per === "month"} onClick={() => setPer("month")}>
            This month
          </button>
          <button type="button" aria-pressed={per === "year"} onClick={() => setPer("year")}>
            Year
          </button>
        </div>
      </div>
      <h3 className="sr-only">Project summary</h3>
      <Kpis
        items={[
          ["Traffic", nf(A.people), `${nf(other.people)} ${otherLabel}`, "sources"],
          ["Leads", people(A.leads), `${nf(other.leads)} ${otherLabel}`, "data"],
          ["Customers", people(A.customers), `${nf(other.customers)} ${otherLabel}`, "offers"],
          ["Revenue", m(A.revenue), `${ms(other.revenue)} ${otherLabel}`, "forecast"],
          ["Profit", <span key="p" className={cls(A.profit)}>{m(A.profit)}</span>, `${ms(other.profit)} ${otherLabel}`, "expenses"],
          ["ROAS", ratio(R.roas), `on ${m(R.spend)} ad spend`, "sources"],
        ]}
        onSection={onSection}
      />
      {widgets.length > 0 && (
        <>
          <h3 className="fm-rh">Widgets</h3>
          <div className="fm-rwidgets">
            {widgets.map((w) => (
              <WidgetCard key={w.id} id={w.id} fluid />
            ))}
          </div>
        </>
      )}
      {L && (
        <div className="fm-rcallout" role="note">
          <span className="ic" aria-hidden="true">
            <Icon name="target" size={18} />
          </span>
          <div>
            <b>Key leak: {L.name}</b>
            <p>
              {people(L.lost)} of {people(L.inn)} people ({pct(L.dropPct)}) don’t move on at this {L.label.toLowerCase()} each month. Converting 10% better here adds about <b>{m(L.revenueGain)}</b> revenue and{" "}
              <b>{m(L.profitGain)}</b> profit a month.
            </p>
            <div className="fm-rcallout-actions">
              <button type="button" className="btn sm" onClick={() => focus(L.id)}>
                Show on map
              </button>
              <button type="button" className="btn sm" onClick={() => tryWhatIf(L.id)}>
                Try in What-if
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="fm-rsplit">
        <div className="min-w-0 space-y-8">
        <div className="fm-rgrid fm-rstack">
        <TimeChart
          title={`Revenue and profit, ${f.months} months`}
          data={f.rows}
          series={[
            { key: "revenue", name: "Revenue", color: "var(--chart-1)" },
            { key: "profit", name: "Profit", color: "var(--chart-5)", dashed: true },
          ]}
          fmt={ms}
          zero
        />
        <BarsChart title="People lost per step (click a bar to find it on the map)" data={data.leaks.slice(0, 8).map((x) => ({ id: x.id, name: x.name, value: x.lost }))} fmt={(v) => people(v)} color="var(--chart-2)" onPick={focus} />
        </div>
        </div>
        <section aria-labelledby="ue-h" className="min-w-0">
          <h3 id="ue-h" className="fm-rh">
            Unit economics
          </h3>
          <dl className="fm-kn">
            {(
              [
                ["CPC", m(R.cpc)],
                ["CPL", m(R.cpl)],
                ["CPA", m(R.cpa)],
                ["AOV", m(R.aov)],
                ["LTV / customer", m(R.ltvc)],
                ["MRR", m(R.mrr)],
                ["ROI", pct(R.roi)],
                ["Conversion", pct(R.conv)],
              ] as [string, string][]
            ).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
      <Table
        caption="People lost per step"
        head={["Step", "Type", "People in", "Lost", "Drop-off", ""]}
        text={[1, 5]}
        rows={data.leaks.slice(0, 8).map((x) => [x.name, x.label, people(x.inn), people(x.lost), pct(x.dropPct), <button key="b" type="button" className="link" onClick={() => focus(x.id)}>Show on map</button>])}
      />
      <p className="sub">
        Forecast settings and more charts: <button type="button" className="link" onClick={() => onSection("forecast")}>Revenue & profit forecast</button> · Every step:{" "}
        <button type="button" className="link" onClick={() => onSection("data")}>Funnel data</button>
      </p>
    </>
  );
}

/* ---------------- funnel data ---------------- */
function FunnelData({ R, s }: SP) {
  const { m } = useMoney();
  const nodes = useEditor((x) => x.nodes);
  const edges = useEditor((x) => x.edges);
  const ro = useEditor((x) => x.readOnly);
  const shared = useEditor((x) => x.shared);
  const rows = useMemo(() => {
    // flow order, like the Steps tab, so the list reads as the journey
    const pos = Object.fromEntries(R.order.map((id, i) => [id, i]));
    return nodes.filter((n) => typeOf(n.type) && typeOf(n.type).cat !== "annot").sort((a, b) => (pos[a.id] ?? 0) - (pos[b.id] ?? 0));
  }, [nodes, R.order]);
  const srcOf = useMemo(() => {
    // the traffic sources feeding each step (context column)
    const inc: Record<string, string[]> = {};
    edges.forEach((e) => (inc[e.to] ??= []).push(e.from));
    const memo: Record<string, Set<string>> = {};
    const walk = (id: string, seen = new Set<string>()): Set<string> => {
      if (memo[id]) return memo[id];
      const n = nodes.find((x) => x.id === id);
      const out = new Set<string>();
      if (!n || seen.has(id)) return out;
      seen.add(id);
      if (typeOf(n.type)?.cat === "traffic") out.add(n.name);
      (inc[id] ?? []).forEach((f) => walk(f, seen).forEach((x) => out.add(x)));
      return (memo[id] = out);
    };
    return (id: string) => [...walk(id)].join(", ");
  }, [edges, nodes]);
  void s;
  const focusId = useEditor((x) => x.reportFocus);
  return (
    <>
      <p className="sub">Every step in journey order: people in, conversion, people out, revenue and costs.</p>
      <Table
        highlight={focusId ? rows.findIndex((n) => n.id === focusId) : -1}
        caption="Funnel data"
        text={[1, 7, 8]}
        head={["Step", "Type", "Visitors", "Conversion", "Customers / orders", "Revenue", "Cost", "Sources", "Status"]}
        rows={rows.map((n) => {
          const r = R.N[n.id],
            T = typeOf(n.type);
          const inn = T.cat === "traffic" ? r.out : r.inflow;
          return [
            n.name,
            T.label,
            people(inn),
            T.cat === "traffic" ? "–" : pct(inn ? r.out / inn : NaN),
            people(r.out),
            T.cat === "offer" ? m(r.rev) : "",
            r.spend + r.cost + r.cogs ? m(r.spend + r.cost + r.cogs) : "",
            <span key="s" className="text-muted">{T.cat === "traffic" ? "–" : srcOf(n.id)}</span>,
            ro || shared ? (
              STEP_STATUSES.find(([k]) => k === (n.status ?? "planned"))?.[1]
            ) : (
              <select key="st" className="input fm-rsel" aria-label={`Status of ${n.name}`} value={n.status ?? "planned"} onChange={(e) => updateNode(n.id, { status: e.target.value as StepStatus })}>
                {STEP_STATUSES.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            ),
          ];
        })}
        foot={["Total", "", nf(R.traffic), pct(R.conv), `${people(R.cust)} customers · ${people(R.orders)} orders`, m(R.rev), m(R.costs - R.fixed - R.perSale), "", ""]}
      />
      <p className="sub">The cost column is ad spend, follow-up costs, delivery and affiliate commission per step. Fixed costs and expenses are in Expenses.</p>
    </>
  );
}

/* ---------------- sources ---------------- */
function Sources({ data, R }: SP) {
  const { m, ms } = useMoney();
  const rows = data.sources;
  if (!rows.length) return <Empty text="Add a traffic source to compare sources." />;
  return (
    <>
      <PairBars
        title="Revenue and ad spend by source"
        data={rows.map((x) => ({ name: x.name, rev: x.rev, spend: x.spend }))}
        series={[
          { key: "rev", name: "Revenue", color: "var(--chart-1)" },
          { key: "spend", name: "Ad spend", color: "var(--chart-2)" },
        ]}
        fmt={ms}
      />
      <Table
        caption="Traffic sources"
        head={["Source", "Visitors", "Share of traffic", "Customers", "Revenue", "Ad spend", "CPA", "ROAS"]}
        rows={rows.map((x) => [x.name, nf(x.traffic), pct(R.traffic ? x.traffic / R.traffic : NaN), people(x.cust), m(x.rev), x.spend ? m(x.spend) : "free", x.spend ? m(x.cpa) : "–", x.spend ? ratio(x.roas) : "–"])}
        foot={["All sources", nf(R.traffic), "100%", people(R.cust), m(R.rev), m(R.spend), m(R.cpa), ratio(R.roas)]}
      />
      <p className="sub">Each row is what that source brings in on its own, through the same funnel.</p>
    </>
  );
}

/* ---------------- offers ---------------- */
function Offers({ data, R }: SP) {
  const { m, ms } = useMoney();
  const rows = data.offers;
  if (!rows.length) return <Empty text="Add an offer (checkout, product, subscription…) to see revenue by product." />;
  return (
    <>
      <BarsChart title="Revenue by offer" data={rows.map((x) => ({ name: x.name, value: x.revenue }))} fmt={ms} />
      <Table
        caption="Offer and product revenue"
        text={[1]}
        head={["Offer", "Type", "Buyers", "Revenue", "Share of revenue", "MRR"]}
        rows={rows.map((x) => [x.name, x.label, people(x.buyers), m(x.revenue), pct(x.share), R.N[x.id]?.mrr ? m(R.N[x.id].mrr) : "–"])}
        foot={["All offers", "", people(R.orders), m(R.rev), "100%", m(R.mrr)]}
      />
    </>
  );
}

/* ---------------- expenses ---------------- */
function Expenses({ data, R }: SP) {
  const { m, ms } = useMoney();
  const ex = data.expenses;
  return (
    <>
      <Kpis
        items={[
          ["All costs / month", m(ex.total)],
          ["Ad spend", m(R.spend), pct(ex.total ? R.spend / ex.total : NaN) + " of costs"],
          ["One-time costs", m(ex.oneTime), ex.oneTime ? (Number.isFinite(R.payback) ? `Paid back in ${nf(R.payback, 1)} months` : "Not paid back") : "None"],
          ["Profit after costs", <span key="p" className={cls(R.profit)}>{m(R.profit)}</span>],
        ]}
      />
      {ex.lines.length ? <BarsChart title="Costs per month by type" data={ex.lines.map(([name, value]) => ({ name, value }))} fmt={ms} color="var(--chart-2)" /> : <Empty text="No costs yet." />}
      <Table caption="Cost breakdown" head={["Cost", "Per month", "Share"]} rows={ex.lines.map(([l, v]) => [l, m(v), pct(ex.total ? v / ex.total : NaN)])} foot={["Total", m(ex.total), "100%"]} />
      {ex.items.length > 0 && (
        <>
          <h3 className="fm-rh">Itemised expenses</h3>
          <Table caption="Itemised expenses" text={[1, 2]} head={["Expense", "Category", "How often", "Amount", "Per month"]} rows={ex.items.map((x) => [x.name, x.category, x.kind, m(x.amount), x.perPeriod ? m(x.perPeriod) : "–"])} />
        </>
      )}
      <p className="sub">
        Edit costs in the map’s{" "}
        <button type="button" className="link" onClick={() => setTab("costs")}>
          Costs tab
        </button>
        .
      </p>
    </>
  );
}

/* ---------------- scenarios ---------------- */
function Scenarios() {
  const { m, ms } = useMoney();
  const nodes = useEditor((x) => x.nodes);
  const edges = useEditor((x) => x.edges);
  const settings = useEditor((x) => x.settings);
  const Rnow = useEditor((x) => x.R);
  const cols = useMemo(() => {
    const g = { nodes, edges };
    const base = compute(g, { ...settings, whatif: NEUTRAL });
    const c: { name: string; R: FunnelResult }[] = [{ name: "Baseline (current map)", R: base }];
    if (JSON.stringify(settings.whatif) !== JSON.stringify(NEUTRAL)) c.push({ name: "Current what-if", R: Rnow });
    settings.scenarios.forEach((sc) => c.push({ name: sc.name || "Scenario", R: computeScenario(g, settings, sc) }));
    return c;
  }, [nodes, edges, settings, Rnow]);
  const metrics: [string, (r: FunnelResult) => number, (v: number) => string, boolean?][] = [
    ["Traffic", (r) => r.traffic, (v) => nf(v)],
    ["Leads", (r) => r.leads, (v) => people(v)],
    ["Customers", (r) => r.cust, (v) => people(v)],
    ["Revenue", (r) => r.rev, m],
    ["Ad spend", (r) => r.spend, m, true],
    ["Profit", (r) => r.profit, m],
    ["ROAS", (r) => r.roas, ratio],
    ["ROI", (r) => r.roi, pct],
    ["CPA", (r) => r.cpa, m, true],
    ["CPL", (r) => r.cpl, m, true],
    ["AOV", (r) => r.aov, m],
    ["LTV / customer", (r) => r.ltvc, m],
    ["MRR", (r) => r.mrr, m],
  ];
  const base = cols[0].R;
  return (
    <>
      <p className="sub">The map as it is (baseline) next to every saved scenario. Differences are against the baseline.</p>
      {cols.length < 2 && (
        <div className="fm-rcallout" role="note">
          <span className="ic" aria-hidden="true">
            <Icon name="layers" size={18} />
          </span>
          <div>
            <b>No scenarios yet</b>
            <p>
              Add Conservative and Best case scenarios in the map’s{" "}
              <button type="button" className="link" onClick={() => setTab("scenarios")}>
                Scenarios tab
              </button>
              .
            </p>
          </div>
        </div>
      )}
      <BarsChart title="Profit per month by scenario" data={cols.map((c) => ({ name: c.name, value: c.R.profit }))} fmt={ms} />
      <div tabIndex={0} role="region" aria-label="Table (scrolls sideways when it is wider than the screen)" className="fm-tblwrap">
        <table className="tbl fm-rtbl">
          <caption className="sr-only">Scenario comparison</caption>
          <thead>
            <tr>
              <th scope="col">Per month</th>
              {cols.map((c, i) => (
                <th key={i} scope="col" className="r">
                  {c.name}
                  {i === 0 && <small className="block font-normal text-muted">baseline</small>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map(([label, get, f, costLike]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                {cols.map((c, i) => {
                  const v = get(c.R),
                    d = v - get(base);
                  const good = costLike ? d < 0 : d > 0;
                  return (
                    <td key={i} className="r">
                      <span className={label === "Profit" ? cls(v) : undefined}>{f(v)}</span>
                      {i > 0 && Number.isFinite(d) && Math.abs(d) > 1e-9 && <small className={`block ${good ? "pos" : "neg"}`}>{signed(d, f)}</small>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---------------- forecast ---------------- */
function Forecast({ data, R }: SP) {
  const { m, ms } = useMoney();
  const ro = useEditor((x) => x.readOnly);
  const proj = useEditor((x) => x.settings.projection);
  const [days, setDays] = useState(90);
  const f = data.forecast;
  const periods: [string, number][] = [...PERIOD_ROWS.map(([l, k]) => [l, periodFactor(k)] as [string, number]), [`Custom (${nf(days)} days)`, periodFactor(days)]];
  return (
    <>
      <fieldset disabled={ro} className="fm-rcontrols">
        <label>
          Months
          <NumInput value={proj.months} min={1} max={60} step={1} onChange={(v) => setSettings({ projection: { ...proj, months: Math.max(1, Math.min(60, Math.round(v) || 1)) } })} />
        </label>
        <label>
          Traffic growth / month (%)
          <NumInput value={proj.growth} min={-50} max={100} onChange={(v) => setSettings({ projection: { ...proj, growth: v } })} />
        </label>
      </fieldset>
      <Kpis
        items={[
          [`Revenue, ${f.months} months`, ms(f.revenue)],
          [`Profit, ${f.months} months`, <span key="p" className={cls(f.profit)}>{ms(f.profit)}</span>],
          ["Cash break-even", f.breakEven ? `Month ${f.breakEven}` : "Not within range"],
          [`MRR at month ${f.months}`, m(f.mrr)],
        ]}
      />
      <div className="fm-rgrid">
        <TimeChart
          title="Revenue and costs per month"
          data={f.rows}
          series={[
            { key: "revenue", name: "Revenue", color: "var(--chart-1)" },
            { key: "costs", name: "Costs", color: "var(--chart-2)", dashed: true },
          ]}
          fmt={ms}
        />
        <TimeChart title="Cumulative profit" data={f.rows} series={[{ key: "cumulative", name: "Cumulative profit", color: "var(--chart-1)" }]} fmt={ms} zero />
        <TimeChart title="Traffic per month" data={f.rows} series={[{ key: "traffic", name: "Visitors", color: "var(--chart-3)" }]} fmt={(v) => nf(v)} />
        <TimeChart title="Leads per month" data={f.rows} series={[{ key: "leads", name: "Leads", color: "var(--chart-5)" }]} fmt={(v) => nf(v)} />
      </div>
      <h3 className="fm-rh">By period</h3>
      <p className="sub">
        The funnel models one month; other periods scale it.{" "}
        <label className="inline-flex items-center gap-2">
          Custom period (days)
          <NumInput className="input w-24!" value={days} min={1} max={3650} step={1} onChange={(v) => setDays(Math.max(1, Math.round(v) || 1))} />
        </label>
      </p>
      <Table
        caption="Numbers by period"
        head={["Period", "People", "Leads", "Purchases", "Revenue", "Ad spend", "Other costs", "Profit", "ROI", "ROAS"]}
        rows={periods.map(([l, k]) => {
          const p = periodNumbers(R, k);
          return [l, nf(p.people), people(p.leads), people(p.orders), m(p.revenue), m(p.adSpend), m(p.expenses), <span key="p" className={cls(p.profit)}>{m(p.profit)}</span>, pct(p.roi), ratio(p.roas)];
        })}
      />
      <p className="sub">The month-by-month cash table is in Month-to-month; subscriptions in MRR forecast.</p>
    </>
  );
}

/* ---------------- goals ---------------- */
function Goals({ data }: SP) {
  const { m } = useMoney();
  const ro = useEditor((x) => x.readOnly);
  const goals = useEditor((x) => x.settings.goals);
  const nodes = useEditor((x) => x.nodes);
  const steps = nodes.filter((n) => typeOf(n.type) && !["annot", "traffic"].includes(typeOf(n.type).cat));
  const upd = (id: string, patch: Partial<Goal>) => setSettings({ goals: goals.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const t = data.goals;
  return (
    <>
      <p className="sub">Name a target and see what it takes per day, week, month and year at today’s rates (traffic scaled, everything else as mapped).</p>
      {t.target > 0 && t.plan && (
        <GoalCard
          r={{ goal: { id: "target", name: "Revenue target", kind: "revenue", value: t.target, period: "month" }, label: "Monthly revenue (What-if tab)", current: data.overview.month.revenue, progress: data.overview.month.revenue / t.target, plan: null, required: [], impact: null }}
          legacy={t.required}
        />
      )}
      {t.items.map((r) => (
        <GoalCard key={r.goal.id} r={r} />
      ))}
      <fieldset disabled={ro} className="m-0 border-0 p-0">
        <h3 className="fm-rh">{goals.length ? "Edit goals" : "Add a goal"}</h3>
        {goals.map((x) => (
          <div key={x.id} className="fm-rgoal-edit">
            <label>
              Name
              <input className="input" value={x.name} placeholder="e.g. Dream profit" onChange={(e) => upd(x.id, { name: e.target.value })} />
            </label>
            <label>
              Type
              <select className="input" value={x.kind} onChange={(e) => upd(x.id, { kind: e.target.value as Goal["kind"] })}>
                {GOAL_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {GOAL_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Target
              <NumInput value={x.value || undefined} min={0} placeholder="e.g. 20000" onChange={(v) => upd(x.id, { value: v })} />
            </label>
            {x.kind !== "conversion" && (
              <label>
                Period
                <select className="input" aria-label={`Period for ${x.name || GOAL_KIND_LABEL[x.kind]} goal`} value={x.period ?? "month"} onChange={(e) => upd(x.id, { period: e.target.value as Goal["period"] })}>
                  {GOAL_PERIODS.map((period) => <option key={period} value={period}>{period === "day" ? "Per day" : period === "week" ? "Per week" : period === "month" ? "Per month" : "Per year"}</option>)}
                </select>
              </label>
            )}
            {(x.kind === "step" || x.kind === "conversion") && (
              <label>
                Step
                <select className="input" value={x.nodeId ?? ""} onChange={(e) => upd(x.id, { nodeId: e.target.value || undefined })}>
                  <option value="">Pick a step…</option>
                  {steps.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button type="button" className="btn icon danger self-end" aria-label={`Remove goal ${x.name || GOAL_KIND_LABEL[x.kind]}`} title={`Remove goal ${x.name || GOAL_KIND_LABEL[x.kind]}`} onClick={() => setSettings({ goals: goals.filter((g) => g.id !== x.id) })}>
              <Icon name="trash" size={16} />
            </button>
          </div>
        ))}
        <button type="button" className="btn" onClick={() => setSettings({ goals: [...goals, { id: nid(), name: "", kind: "profit", value: 0, period: "month" }] })}>
          <Icon name="plus" /> Add goal
        </button>
      </fieldset>
      {t.blocks.length > 0 && (
        <>
          <h3 className="fm-rh">Goal blocks on the map</h3>
          <Table caption="Goal blocks" head={["Goal block", "People reaching it / month"]} rows={t.blocks.map((b) => [b.name, people(b.people)])} />
        </>
      )}
      <p className="sub">Revenue {m(data.overview.month.revenue)} per month today.</p>
    </>
  );
}

function GoalCard({ r, legacy }: { r: GoalReport; legacy?: [string, number, number, number, number][] }) {
  const { m } = useMoney();
  const g = r.goal;
  const isMoney = g.kind === "revenue" || g.kind === "profit";
  const fv = (v: number) => (isMoney ? m(v) : g.kind === "conversion" ? `${nf(v, 1)}%` : people(v));
  const done = r.progress >= 1;
  const prog = Math.max(0, Math.min(1, Number.isFinite(r.progress) ? r.progress : 0));
  return (
    <section className="fm-rgoal" aria-label={`Goal: ${g.name || r.label}`}>
      <header>
        <div>
          <b>{g.name || r.label}</b>
          <small>{r.label}</small>
        </div>
        <span className={done ? "pos" : undefined}>
          {fv(r.current)} of {fv(g.value)}
          {done ? " · reached" : ""}
        </span>
      </header>
      <div className="fm-rprog" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(prog * 100)} aria-label="Progress towards the goal">
        <span style={{ width: `${prog * 100}%` }} />
      </div>
      {legacy ? (
        <Table caption="Required numbers" head={["Period", "Revenue", "Visitors", "Ad spend", "Customers"]} rows={legacy.map(([p, rev, vis, spend, cust]) => [p, m(rev), nf(vis), m(spend), people(cust)])} />
      ) : g.kind === "conversion" ? (
        r.impact ? (
          <p className="sub">
            At {nf(g.value, 1)}% conversion, {r.stepName} would bring revenue to <b>{m(r.impact.rev)}</b> and profit to <b className={cls(r.impact.profit)}>{m(r.impact.profit)}</b> a month.
          </p>
        ) : (
          <p className="sub">Pick a step and a target conversion rate.</p>
        )
      ) : r.plan?.reachable ? (
        <>
          <p className="sub">Needs {nf(r.plan.multiplier, 2)}× today’s traffic, with today’s conversion rates, prices and cost per visitor.</p>
          <Table
            caption={`Required numbers for ${g.name || r.label}`}
            head={["Period", "Revenue", "Profit", "Traffic", "Traffic cost", "Leads", "Customers"]}
            rows={r.required.map(([p, rev, profit, vis, spend, leads, cust]) => [p, m(rev), <span key="p" className={cls(profit)}>{m(profit)}</span>, nf(vis), m(spend), people(leads), people(cust)])}
          />
        </>
      ) : (
        <p className="sub">{g.value > 0 ? "Can’t be reached by adding traffic alone at today’s rates (for example, every extra visitor loses money). Try the What-if goal seek on conversion or prices." : "Enter a target."}</p>
      )}
    </section>
  );
}

/* ---------------- MRR ---------------- */
function Mrr({ data }: SP) {
  const { m, ms } = useMoney();
  const rows = data.forecast.rows;
  if (!rows.some((r) => r.mrr > 0)) return <Empty text="No subscriptions on this map. Add a Subscription or Membership offer to forecast recurring revenue." />;
  const last = rows[rows.length - 1];
  return (
    <>
      <Kpis
        items={[
          [`MRR at month ${last.month}`, m(last.mrr)],
          ["Active subscriptions", people(last.activeSubs)],
          ["Cumulative revenue", ms(last.cumulativeRevenue)],
          ["Cumulative profit", <span key="p" className={cls(last.cumulative)}>{ms(last.cumulative)}</span>],
        ]}
      />
      <div className="fm-rgrid">
        <TimeChart title="MRR per month" data={rows} series={[{ key: "mrr", name: "MRR", color: "var(--chart-1)" }]} fmt={ms} />
        <TimeChart title="Active subscriptions" data={rows} series={[{ key: "activeSubs", name: "Active subscriptions", color: "var(--chart-3)" }]} fmt={(v) => people(v)} />
      </div>
      <Table
        caption="MRR forecast"
        head={["Month", "New customers", "Active subs", "MRR", "Revenue", "Cumulative revenue", "Traffic cost", "Business expenses", "Profit", "Cumulative profit"]}
        rows={rows.map((r) => [
          r.month,
          people(r.newCustomers),
          people(r.activeSubs),
          m(r.mrr),
          m(r.revenue),
          m(r.cumulativeRevenue),
          m(r.adSpend),
          m(r.expenses + r.followUp + r.delivery),
          <span key="p" className={cls(r.profit)}>{m(r.profit)}</span>,
          <span key="c" className={cls(r.cumulative)}>{m(r.cumulative)}</span>,
        ])}
      />
      <p className="sub">Subscriptions renew monthly with churn of 1 ÷ average stay; business expenses include follow-up, delivery and fixed costs.</p>
    </>
  );
}

/* ---------------- month to month ---------------- */
const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

/** Entered actuals next to the plan, month by month. Plan = the Actuals tab's planned numbers for the days entered. */
function ActualVsPlan({ R }: Pick<SP, "R">) {
  const { m, ms } = useMoney();
  const actuals = useEditor((x) => x.actuals);
  const nodes = useEditor((x) => x.nodes);
  const edges = useEditor((x) => x.edges);
  const shared = useEditor((x) => x.shared);
  const ro = useEditor((x) => x.readOnly);
  const [metric, setMetric] = useState<"rev" | "spend">("rev");
  useEffect(() => {
    if (!shared) ensureActuals();
  }, [shared]);
  const rows = useMemo(() => monthlyPlanVsActual({ nodes, edges }, R, (actuals ?? []) as never), [nodes, edges, R, actuals]);
  if (shared) return null;
  const rev = metric === "rev";
  const data = rows.map((r) => ({ label: monthLabel(r.month), plan: rev ? r.planRev : r.planSpend, actual: rev ? r.actRev : r.actSpend }));
  const v = (plan: number, act: number) => (plan ? <span className={rev === act >= plan ? "pos" : "neg"}>{signed(act / plan - 1, pct)}</span> : "–");
  return (
    <section aria-labelledby="fm-avp">
      <div className="fm-avp-head">
        <h3 id="fm-avp">Actual vs plan</h3>
        <div className="seg" role="group" aria-label="Measure">
          <button type="button" aria-pressed={rev} onClick={() => setMetric("rev")}>
            Revenue
          </button>
          <button type="button" aria-pressed={!rev} onClick={() => setMetric("spend")}>
            Ad spend
          </button>
        </div>
      </div>
      {actuals === null ? (
        <p className="sub fm-avp-state" role="status">
          Loading actuals…
        </p>
      ) : !rows.length ? (
        <div className="fm-rempty">
          <p>No actuals entered yet. Add real numbers per step and they appear here against the plan.</p>
          {!ro && (
            <button type="button" className="btn sm" onClick={() => setTab("actuals")}>
              Enter actuals
            </button>
          )}
        </div>
      ) : (
        <>
          <TimeChart
            title={`${rev ? "Revenue" : "Ad spend"}: actual vs plan`}
            data={data}
            x="label"
            xLabel={(l) => String(l)}
            series={[
              { key: "actual", name: "Actual", color: "var(--chart-1)" },
              { key: "plan", name: "Plan", color: "var(--muted)", dashed: true },
            ]}
            fmt={ms}
            zero
          />
          <Table
            caption="Actual vs plan by month"
            head={["Month", "Days entered", "Plan revenue", "Actual revenue", "vs plan", "Plan ad spend", "Actual ad spend", "vs plan"]}
            rows={rows.map((r) => [monthLabel(r.month), nf(r.days), m(r.planRev), m(r.actRev), v(r.planRev, r.actRev), m(r.planSpend), m(r.actSpend), v(r.planSpend, r.actSpend)])}
          />
          <p className="sub">Plan is the funnel’s monthly numbers scaled to the days you entered, the same as the Actuals tab. Ad spend over plan shows red.</p>
        </>
      )}
    </section>
  );
}

function Monthly({ data, R }: SP) {
  const { m, ms } = useMoney();
  const rows = data.forecast.rows;
  const ch = (a: number, b: number | undefined) => (b == null || !b ? "–" : signed((a - b) / Math.abs(b), pct));
  return (
    <>
      <ActualVsPlan R={R} />
      <TimeChart
        title="Revenue and profit per month"
        data={rows}
        series={[
          { key: "revenue", name: "Revenue", color: "var(--chart-1)" },
          { key: "profit", name: "Profit", color: "var(--chart-5)", dashed: true },
        ]}
        fmt={ms}
        zero
      />
      <Table
        caption="Month-to-month"
        head={["Month", "Traffic", "Customers", "Revenue", "Change", "Costs", "Profit", "Change", "Cumulative"]}
        rows={rows.map((r, i) => [
          r.month,
          nf(r.traffic),
          people(r.newCustomers),
          m(r.revenue),
          ch(r.revenue, rows[i - 1]?.revenue),
          m(r.costs),
          <span key="p" className={cls(r.profit)}>{m(r.profit)}</span>,
          ch(r.profit, rows[i - 1]?.profit),
          <span key="c" className={cls(r.cumulative)}>{m(r.cumulative)}</span>,
        ])}
      />
    </>
  );
}

/* ---------------- reinvestment ---------------- */
function Reinvest({ data }: SP) {
  const { m, ms } = useMoney();
  const ro = useEditor((x) => x.readOnly);
  const rv = data.reinvest;
  const set = (patch: Partial<FunnelSettings["reinvest"]>) => setSettings({ reinvest: { pct: rv.pct, months: rv.months, ...patch } });
  const rows = rv.rows.map((r, i) => ({ ...r, plainProfit: rv.plain[i]?.cumulative ?? 0 }));
  return (
    <>
      <p className="sub">Put part of each month’s profit back into ads the next month, at today’s cost per paid visitor, and see how traffic, revenue and profit grow.</p>
      <fieldset disabled={ro} className="fm-rcontrols">
        <label>
          Reinvest (% of profit)
          <NumInput value={rv.pct} min={0} max={100} onChange={(v) => set({ pct: Math.max(0, Math.min(100, v)) })} />
        </label>
        <label>
          Months
          <NumInput value={rv.months} min={1} max={60} step={1} onChange={(v) => set({ months: Math.max(1, Math.min(60, Math.round(v) || 1)) })} />
        </label>
      </fieldset>
      {!rv.hasPaid ? (
        <Empty text="Reinvestment buys more paid traffic. Add a paid traffic source (with spend) to use it." />
      ) : !rv.pct ? (
        <div className="fm-rempty">
          <b>Pick how much profit to reinvest</b>
          <p>Each month, that share of last month’s profit buys extra paid traffic at today’s cost per visitor. Growth compounds, so start small.</p>
          {!ro && (
            <div className="mt-3 flex flex-wrap gap-2">
              {[25, 50, 75].map((v) => (
                <button key={v} type="button" className="btn sm" onClick={() => set({ pct: v })}>
                  Reinvest {v}%
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <Kpis
            items={[
              [`Reinvested over ${rv.months} months`, ms(rv.total.reinvested)],
              ["Traffic", nf(rv.total.traffic), `${signed(rv.total.traffic - rv.plainTotal.traffic, (v) => nf(v))} vs no reinvestment`],
              ["Revenue", ms(rv.total.revenue), `${signed(rv.total.revenue - rv.plainTotal.revenue, ms)} vs no reinvestment`],
              ["Profit (after reinvesting)", <span key="p" className={cls(rv.total.profit)}>{ms(rv.total.profit)}</span>, `${signed(rv.total.profit - rv.plainTotal.profit, ms)} vs no reinvestment`],
            ]}
          />
          <div className="fm-rgrid">
            <TimeChart
              title="Cumulative profit"
              data={rows}
              series={[
                { key: "cumulative", name: `Reinvesting ${nf(rv.pct)}%`, color: "var(--chart-1)" },
                { key: "plainProfit", name: "No reinvestment", color: "var(--chart-2)", dashed: true },
              ]}
              fmt={ms}
              zero
            />
            <TimeChart title="Traffic per month" data={rows} series={[{ key: "traffic", name: "Visitors", color: "var(--chart-3)" }]} fmt={(v) => nf(v)} />
          </div>
          <Table
            caption="Traffic reinvestment by month"
            head={["Month", "Ad budget", "Of which reinvested", "Traffic", "Revenue", "Profit", "Cumulative profit"]}
            rows={rv.rows.map((r) => [r.month, m(r.adSpend), r.reinvested ? m(r.reinvested) : "–", nf(r.traffic), m(r.revenue), <span key="p" className={cls(r.profit)}>{m(r.profit)}</span>, <span key="c" className={cls(r.cumulative)}>{m(r.cumulative)}</span>])}
            foot={[`Year-end (${rv.months} mo)`, m(rv.rows.reduce((a, r) => a + r.adSpend, 0)), m(rv.total.reinvested), nf(rv.total.traffic), m(rv.total.revenue), m(rv.total.profit), ""]}
          />
        </>
      )}
    </>
  );
}

/* ---------------- published status ---------------- */
function Status() {
  const nodes = useEditor((x) => x.nodes);
  const ro = useEditor((x) => x.readOnly);
  const shared = useEditor((x) => x.shared);
  const st = useMemo(() => statusReport(nodes), [nodes]);
  if (!st.total) return <Empty text="No funnel steps yet." />;
  return (
    <>
      <Kpis
        items={[
          ["Complete", pct(st.pct), `${st.done} of ${st.total} steps live`],
          ["In progress", nf(st.building)],
          ["Planned", nf(st.planned)],
          ["Remaining", nf(st.total - st.done)],
        ]}
      />
      <div className="fm-rprog lg" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(st.pct * 100)} aria-label="Steps live">
        <span style={{ width: `${st.pct * 100}%` }} />
      </div>
      <Table
        caption="Step status"
        right={false}
        head={["Step", "Type", "Status"]}
        rows={[...st.steps]
          .sort((a, b) => (a.status === "done" ? 1 : 0) - (b.status === "done" ? 1 : 0))
          .map((x) => [
            x.name,
            x.label,
            ro || shared ? (
              STEP_STATUSES.find(([k]) => k === x.status)?.[1]
            ) : (
              <select key="s" className="input fm-rsel" aria-label={`Status of ${x.name}`} value={x.status} onChange={(e) => updateNode(x.id, { status: e.target.value as StepStatus })}>
                {STEP_STATUSES.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            ),
          ])}
      />
      <p className="sub">Set a step’s status here or in its Details panel on the map.</p>
    </>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="fm-rempty">
      <p>{text}</p>
    </div>
  );
}
