"use client";
import { useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import type { IconName, UiIconName } from "@/lib/icons";
import { money, nf, pct, perSuffix, ratio, sym, people } from "@/lib/format";
import { compute, computeScenario, goalSeek, num, project, sourceRows, stepRows, targetPlan, type SeekLever, type SeekMetric } from "@/lib/funnel-math";
import { healthChecks, performanceChecks } from "@/lib/health";
import { useFocusBlock } from "./focus";
import { CURRENCY_CODES, type CurrencyCode, type Expense, type Scenario } from "@/lib/graph";
import { nid, setSection, setSettings, setTab, startSim, useEditor, type ReportTab } from "@/lib/editor/store";
import { Actuals } from "./actuals";
import { Field, NumInput, Seg } from "./fields";
import { ForecastCharts } from "./forecast-charts";
import { formulaFor, type FigureKey } from "@/lib/math-explain";

/** Funnel scope (nothing selected): three groups, in the order of the product loop. Tab keys are unchanged. */
const GROUPS: { name: string; tabs: [ReportTab, string][] }[] = [
  {
    name: "Model",
    tabs: [
      ["math", "Overview"],
      ["steps", "Steps"],
      ["sources", "Sources"],
      ["costs", "Costs"],
    ],
  },
  {
    name: "Simulate",
    tabs: [
      ["plan", "What-if"],
      ["scenarios", "Scenarios"],
    ],
  },
  {
    name: "Track",
    tabs: [
      ["forecast", "Forecast"],
      ["actuals", "Actuals"],
    ],
  },
];

const TAB_ICON: Record<string, IconName | UiIconName> = { math: "grid", steps: "list", sources: "megaphone", costs: "wallet", plan: "sliders", scenarios: "layers", forecast: "chart", actuals: "check" };

export function Report() {
  const tab = useEditor((s) => s.tab);
  const name = useEditor((s) => s.name);
  // Planned vs actual numbers belong to the team: a share link never shows (or fetches) them
  const shared = useEditor((s) => s.shared);
  const groups = shared ? GROUPS.map((g) => ({ ...g, tabs: g.tabs.filter(([k]) => k !== "actuals") })).filter((g) => g.tabs.length) : GROUPS;
  const group = groups.find((g) => g.tabs.some(([k]) => k === tab)) ?? groups[0];
  return (
    <>
      <header className="fm-scopehead fm-fscope">
        <span className="eyebrow">Funnel</span>
        <h3 title={name}>{name}</h3>
        <p className="sub">Whole-funnel settings. Click a block to edit it.</p>
      </header>
      <div className="seg full fm-groupseg" role="tablist" aria-label="Funnel tools">
        {groups.map((g) => (
          <button key={g.name} type="button" role="tab" aria-selected={g.name === group.name} onClick={() => setTab(g.tabs[0][0])}>
            {g.name}
          </button>
        ))}
      </div>
      <div className="fm-subnav" role="tablist" aria-label={`${group.name} tools`}>
        {group.tabs.map(([k, l]) => (
          <button key={k} role="tab" id={`tab-${k}`} aria-controls="rbody" aria-selected={tab === k} onClick={() => setTab(k)}>
            <Icon name={TAB_ICON[k]} size={14} />
            {l}
          </button>
        ))}
      </div>
      <div id="rbody" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === "math" && <FunnelLevel />}
        {tab === "steps" && <StepsTab />}
        {tab === "sources" && <SourcesTab />}
        {tab === "plan" && <WhatIfTab />}
        {tab === "costs" && <CostsTab />}
        {tab === "scenarios" && <ScenariosTab />}
        {tab === "forecast" && <ForecastTab />}
        {tab === "actuals" && !shared && <Actuals />}
      </div>
    </>
  );
}

const useM = () => {
  const cur = useEditor((s) => s.settings.currency);
  return (v: number) => money(v, cur);
};

const STATUS_NAMES: Record<string, string> = { draft: "Draft", proposed: "Proposed", live: "Live", archived: "Archived" };

/** Funnel level (nothing selected): the checks, the one biggest-leak sentence, and the few settings that belong to the whole funnel. Numbers live in the strip and in Reports. */
function FunnelLevel() {
  const R = useEditor((s) => s.R);
  const nodes = useEditor((s) => s.nodes);
  const edges = useEditor((s) => s.edges);
  const settings = useEditor((s) => s.settings);
  const basis = useEditor((s) => s.settings.basis);
  const cur = useEditor((s) => s.settings.currency);
  const ro = useEditor((s) => s.readOnly);
  const ctl = useEditor((s) => s.funnelCtl);
  const m = useM();
  const shared = useEditor((s) => s.shared);
  const w = useMemo(() => (shared ? [] : healthChecks({ nodes, edges })), [nodes, edges, shared]);
  const performance = useMemo(() => (shared ? [] : performanceChecks({ nodes, edges }, settings, R)), [nodes, edges, settings, R, shared]);
  const focus = useFocusBlock();
  const leak = performance[0];
  return (
    <>
      {!shared && (
        <section className="fm-sec fm-checks" aria-label="Model checks">
          <div className="fm-sh">
            <h4>Checks · {w.length === 0 ? "All clear" : `${w.length} to fix`}</h4>
            {w.some((c) => c.nodeId) && (
              <button type="button" className="fm-sa" onClick={() => focus(w.find((c) => c.nodeId)!.nodeId!)}>
                Fix in order
              </button>
            )}
          </div>
          {w.length === 0 ? (
            <p className="fm-ok">
              <Icon name="check" size={14} /> The map is connected and set up.
            </p>
          ) : (
            <ul className="fm-chklist">
              {w.map((c) => (
                <li key={c.id}>
                  {c.nodeId ? (
                    <button type="button" className="fm-chkrow" onClick={() => focus(c.nodeId!)} title="Select this block and zoom to it">
                      <i className="dot" aria-hidden="true" />
                      <span>{c.text}</span>
                      <Icon name="chevronRight" size={14} />
                    </button>
                  ) : (
                    <span className="fm-chkrow plain">
                      <i className="dot" aria-hidden="true" />
                      <span>{c.text}</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {!shared && (
        <section className="fm-sec">
          <div className="fm-sh">
            <h4>Biggest leak</h4>
          </div>
          {!leak ? (
            <p className="fm-ok">
              <Icon name="check" size={14} /> {R.traffic > 0 ? "No modeled losses at pages, offers, or actions." : "Add traffic to measure step performance."}
            </p>
          ) : (
            <>
              <p className="fm-leakp">
                <b>{leak.text}:</b> {people(leak.lost)} of {people(leak.inflow)} people ({pct(leak.dropPct)}) don’t continue. 10% better here adds about <b>{m(leak.profitGain)} / mo</b>.
              </p>
              <div className="fm-leakacts">
                {leak.nodeId && (
                  <button type="button" className="btn sm" onClick={() => focus(leak.nodeId!)}>
                    Locate
                  </button>
                )}
                {!ro && (
                  <button type="button" className="btn sm" onClick={() => (startSim(), setTab("plan"))}>
                    Run what-if
                  </button>
                )}
              </div>
            </>
          )}
        </section>
      )}
      <fieldset disabled={ro} className="m-0 min-w-0 border-0 p-0">
        <section className="fm-sec">
          <div className="fm-sh">
            <h4>Count revenue as</h4>
          </div>
          <Seg
            label="Count revenue as"
            value={basis}
            options={[
              ["first", "First payment"],
              ["ltv", "Lifetime value"],
            ]}
            onChange={(v) => setSettings({ basis: v })}
          />
        </section>
        <section className="fm-sec">
          <div className="fm-sh">
            <h4>Funnel</h4>
          </div>
          {!shared && (
            <Field label="Funnel status">
              {(id) => (
                <select id={id} className="input" value={ctl.status} disabled={!ctl.set} onChange={(e) => ctl.set?.(e.target.value)}>
                  {Object.entries(STATUS_NAMES).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}
          <Field label="Currency">
            {(id) => (
              <select id={id} className="input" value={cur} onChange={(e) => setSettings({ currency: e.target.value as CurrencyCode })}>
                {CURRENCY_CODES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </section>
      </fieldset>
      <button type="button" className="fm-linkbtn" onClick={() => setSection("overview")}>
        All numbers in Reports ›
      </button>
    </>
  );
}

function StepsTab() {
  const R = useEditor((s) => s.R);
  const nodes = useEditor((s) => s.nodes);
  const edges = useEditor((s) => s.edges);
  const m = useM();
  const rows = stepRows({ nodes, edges }, R);
  return (
    <>
      <p className="sub">Every block in flow order, with drop-off.</p>
      <div tabIndex={0} role="region" aria-label="Table (scrolls sideways when it is wider than the screen)" className="fm-tblwrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Step</th>
              <th className="r">In</th>
              <th className="r">Out</th>
              <th className="r">Drop</th>
              <th className="r">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td className="r">{nf(r.inn)}</td>
                <td className="r">{people(r.out)}</td>
                <td className="r">{r.cat === "traffic" ? "–" : pct(r.dropPct)}</td>
                <td className="r">{r.cat === "offer" ? m(r.rev) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SourcesTab() {
  const nodes = useEditor((s) => s.nodes);
  const edges = useEditor((s) => s.edges);
  const settings = useEditor((s) => s.settings);
  const m = useM();
  const rows = useMemo(() => sourceRows({ nodes, edges }, settings), [nodes, edges, settings]);
  return (
    <>
      <p className="sub">What each traffic source brings in on its own.</p>
      <div tabIndex={0} role="region" aria-label="Table (scrolls sideways when it is wider than the screen)" className="fm-tblwrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Source</th>
              <th className="r">Visits</th>
              <th className="r">Cust.</th>
              <th className="r">Revenue</th>
              <th className="r">CPA</th>
              <th className="r">ROAS</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((x) => (
                <tr key={x.id}>
                  <td>{x.name}</td>
                  <td className="r">{nf(x.traffic)}</td>
                  <td className="r">{people(x.cust)}</td>
                  <td className="r">{m(x.rev)}</td>
                  <td className="r">{x.spend ? m(x.cpa) : "free"}</td>
                  <td className="r">{x.spend ? ratio(x.roas) : "–"}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6}>Add a traffic source to compare.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Slider({ label, help, value, min, max, onChange }: { label: string; help: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <Field label={label} help={help}>
      {(id) => (
        <div className="fm-range">
          <input id={id} type="range" min={min} max={max} step={0.05} value={value} onChange={(e) => onChange(num(e.target.value))} />
          <output htmlFor={id}>{nf(value, 2)}×</output>
        </div>
      )}
    </Field>
  );
}

function WhatIfTab() {
  const s = useEditor((x) => x.settings);
  const R = useEditor((x) => x.R);
  const nodes = useEditor((x) => x.nodes);
  const edges = useEditor((x) => x.edges);
  const ro = useEditor((x) => x.readOnly);
  const m = useM();
  const w = s.whatif;
  const set = (k: keyof typeof w) => (v: number) => setSettings({ whatif: { ...w, [k]: v } });
  const tgt = num(s.target);
  const plan = targetPlan(R, tgt);
  const [lever, setLever] = useState<SeekLever>("traffic");
  const [metric, setMetric] = useState<SeekMetric>("profit");
  const [seekTarget, setSeekTarget] = useState(0);
  const seek = useMemo(() => (seekTarget ? goalSeek({ nodes, edges }, s, lever, metric, seekTarget) : NaN), [nodes, edges, s, lever, metric, seekTarget]);
  return (
    <fieldset disabled={ro} className="m-0 border-0 p-0">
      <p className="sub">Test changes without editing your map.</p>
      {!ro && (
        <button type="button" className="btn sm mb-3" onClick={startSim} title="Watch people, losses, revenue and ROAS change on the map">
          <Icon name="sliders" size={14} /> Simulate on the map
        </button>
      )}
      <Slider label="Traffic" help="Scales every traffic source, including spend." value={num(w.traffic) || 1} min={0.25} max={5} onChange={set("traffic")} />
      <Slider label="Conversion rates" help="Scales every page, action and offer conversion rate." value={num(w.conv) || 1} min={0.5} max={2} onChange={set("conv")} />
      <Slider label="Prices" help="Scales every offer price, setup fee and trial price." value={num(w.price) || 1} min={0.5} max={2} onChange={set("price")} />
      <Slider label="Traffic cost" help="Scales CPC, CPM and budgets per visitor (ad costs rising or falling)." value={num(w.cost) || 1} min={0.5} max={2} onChange={set("cost")} />
      <button type="button" className="btn mb-4" onClick={() => setSettings({ whatif: { traffic: 1, conv: 1, price: 1, cost: 1 } })}>
        Reset what-if
      </button>
      <h4>Revenue goal</h4>
      <Field label={`Target revenue (${sym(s.currency).trim()})`}>{(id) => <NumInput id={id} value={tgt || undefined} min={0} placeholder="e.g. 10000" onChange={(v) => setSettings({ target: v })} />}</Field>
      {tgt ? (
        <div className="statbox">
          <div>
            Visitors needed<b>{nf(plan.visitorsNeeded)}</b>
          </div>
          <div>
            Extra vs now<b>{nf(plan.extraVisitors)}</b>
          </div>
          <div>
            Ad spend at today’s cost<b>{m(plan.spendNeeded)}</b>
          </div>
          <div>
            Customers needed<b>{people(plan.customersNeeded)}</b>
          </div>
        </div>
      ) : (
        <p className="sub">Enter a target to see the traffic and spend it takes.</p>
      )}
      <h4>Goal seek</h4>
      <p className="sub">Find the change one lever needs to hit a number, everything else as above.</p>
      <div className="row2">
        <Field label="Hit">
          {(id) => (
            <select id={id} className="input" value={metric} onChange={(e) => setMetric(e.target.value as SeekMetric)}>
              <option value="profit">Profit</option>
              <option value="rev">Revenue</option>
              <option value="cust">Customers</option>
            </select>
          )}
        </Field>
        <Field label="Of">{(id) => <NumInput id={id} value={seekTarget || undefined} placeholder="e.g. 20000" onChange={setSeekTarget} />}</Field>
      </div>
      <Field label="By changing">
        {(id) => (
          <select id={id} className="input" value={lever} onChange={(e) => setLever(e.target.value as SeekLever)}>
            <option value="traffic">Traffic volume</option>
            <option value="conv">Conversion rates</option>
            <option value="price">Prices</option>
            <option value="cost">Traffic cost</option>
          </select>
        )}
      </Field>
      {seekTarget ? (
        Number.isFinite(seek) ? (
          <div className="statbox">
            <div>
              Multiplier needed<b>{nf(seek, 2)}×</b>
            </div>
            <div>
              Change<b>{seek >= 1 ? "+" : ""}{pct(seek - 1)}</b>
            </div>
            <div className="col-span-2">
              <button type="button" className="btn sm" onClick={() => set(lever)(seek)}>
                Apply to what-if
              </button>
            </div>
          </div>
        ) : (
          <p className="sub">Can’t reach that by changing this lever alone (tested 0.01× to 100×).</p>
        )
      ) : null}
    </fieldset>
  );
}

const EXPENSE_KINDS: [Expense["kind"], string][] = [
  ["monthly", "Every period"],
  ["per_sale", "Per order"],
  ["one_time", "One-time"],
];
const EXPENSE_CATS = ["Software", "Team", "Ads management", "Creative", "Fulfilment", "Agency fee", "Other"];

function CostsTab() {
  const s = useEditor((x) => x.settings);
  const R = useEditor((x) => x.R);
  const ro = useEditor((x) => x.readOnly);
  const m = useM();
  const list = s.expenses;
  const upd = (id: string, patch: Partial<Expense>) => setSettings({ expenses: list.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  const totals = { monthly: 0, per_sale: 0, one_time: 0 };
  list.forEach((e) => (totals[e.kind] += num(e.amount)));
  return (
    <fieldset disabled={ro} className="m-0 border-0 p-0">
      <p className="sub">Itemise the costs of running this funnel. Recurring and per-order costs reduce profit; one-time costs show a payback period.</p>
      <Field label={`Other costs per period (${sym(s.currency).trim()})`} help="Software, studio, staff. Included in profit and break-even numbers.">
        {(id) => <NumInput id={id} value={s.fixed} min={0} disabled={ro} onChange={(v) => setSettings({ fixed: v })} />}
      </Field>
      {list.map((e) => (
        <div key={e.id} className="mb-3 rounded-xl border border-line p-3">
          <div className="flex gap-2">
            <label className="sr-only" htmlFor={`ex-n-${e.id}`}>
              Expense name
            </label>
            <input id={`ex-n-${e.id}`} className="input" value={e.name} placeholder="e.g. Funnel software" onChange={(ev) => upd(e.id, { name: ev.target.value })} />
            <button type="button" className="btn icon danger shrink-0" aria-label={`Remove ${e.name || "expense"}`} title={`Remove ${e.name || "expense"}`} onClick={() => setSettings({ expenses: list.filter((x) => x.id !== e.id) })}>
              <Icon name="trash" size={16} />
            </button>
          </div>
          <div className="mt-2 grid grid-cols-[1fr_1fr_1fr] gap-2">
            <NumInput aria-label="Amount" value={e.amount} min={0} onChange={(v) => upd(e.id, { amount: v })} />
            <select className="input" aria-label="How often" value={e.kind} onChange={(ev) => upd(e.id, { kind: ev.target.value as Expense["kind"] })}>
              {EXPENSE_KINDS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
            <select className="input" aria-label="Category" value={e.category} onChange={(ev) => upd(e.id, { category: ev.target.value })}>
              {EXPENSE_CATS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      ))}
      <button type="button" className="btn mb-4" onClick={() => setSettings({ expenses: [...list, { id: nid(), name: "", kind: "monthly", amount: 0, category: "Software" }] })}>
        <Icon name="plus" /> Add expense
      </button>
      <div className="statbox">
        <div>
          Every period<b>{m(totals.monthly + num(s.fixed))}</b>
        </div>
        <div>
          Per-order costs<b>{m(R.perSale)}</b>
        </div>
        <div>
          One-time<b>{m(totals.one_time)}</b>
        </div>
        <div>
          Payback<b>{totals.one_time ? (Number.isFinite(R.payback) ? `${nf(R.payback, 1)} periods` : "Never") : "–"}</b>
        </div>
      </div>
      <p className="sub">“Every period” includes the {m(num(s.fixed))} fixed costs from the Math tab.</p>
    </fieldset>
  );
}

function ScenariosTab() {
  const s = useEditor((x) => x.settings);
  const nodes = useEditor((x) => x.nodes);
  const edges = useEditor((x) => x.edges);
  const ro = useEditor((x) => x.readOnly);
  const m = useM();
  const list = s.scenarios;
  const base = useMemo(() => compute({ nodes, edges }, { ...s, whatif: { traffic: 1, conv: 1, price: 1, cost: 1 } }), [nodes, edges, s]);
  const results = useMemo(() => list.map((sc) => computeScenario({ nodes, edges }, s, sc)), [list, nodes, edges, s]);
  const upd = (id: string, patch: Partial<Scenario>) => setSettings({ scenarios: list.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const presets = () =>
    setSettings({
      scenarios: [
        { id: nid(), name: "Conservative", kind: "conservative", whatif: { traffic: 0.8, conv: 0.75, price: 1, cost: 1.15 } },
        { id: nid(), name: "Best case", kind: "best", whatif: { traffic: 1.25, conv: 1.2, price: 1, cost: 0.9 } },
      ],
    });
  const metrics: [string, (r: typeof base) => string][] = [
    ["Traffic", (r) => nf(r.traffic)],
    ["Customers", (r) => people(r.cust)],
    ["Revenue", (r) => m(r.rev)],
    ["Ad spend", (r) => m(r.spend)],
    ["Profit", (r) => m(r.profit)],
    ["ROAS", (r) => ratio(r.roas)],
    ["CPA", (r) => m(r.cpa)],
    ["MRR", (r) => m(r.mrr)],
  ];
  return (
    <fieldset disabled={ro} className="m-0 border-0 p-0">
      <p className="sub">The Baseline is the current map. Save named sets of assumptions and compare them side by side. Multipliers apply on top of the map (1 = as mapped).</p>
      {list.length === 0 && (
        <button type="button" className="btn mb-3" onClick={presets}>
          Add conservative and best case
        </button>
      )}
      {list.map((sc) => (
        <div key={sc.id} className="mb-3 rounded-xl border border-line p-3">
          <div className="mb-2 flex gap-2">
            <label className="sr-only" htmlFor={`sc-${sc.id}`}>
              Scenario name
            </label>
            <input id={`sc-${sc.id}`} className="input" value={sc.name} onChange={(e) => upd(sc.id, { name: e.target.value })} />
            <label className="sr-only" htmlFor={`sck-${sc.id}`}>
              Scenario type
            </label>
            <select id={`sck-${sc.id}`} className="input w-auto! shrink-0" value={sc.kind ?? "custom"} onChange={(e) => upd(sc.id, { kind: e.target.value as Scenario["kind"] })}>
              <option value="conservative">Conservative</option>
              {sc.kind === "expected" && <option value="expected">Expected</option>}
              <option value="best">Best case</option>
              <option value="custom">Custom</option>
            </select>
            <button
              type="button"
              className="btn icon shrink-0"
              aria-label={`Duplicate ${sc.name}`}
              title="Duplicate"
              onClick={() => {
                const i = list.findIndex((x) => x.id === sc.id);
                const copy: Scenario = { ...structuredClone(sc), id: nid(), name: `${sc.name} (copy)`, kind: "custom" };
                setSettings({ scenarios: [...list.slice(0, i + 1), copy, ...list.slice(i + 1)] });
              }}
            >
              <Icon name="copy" size={16} />
            </button>
            <button type="button" className="btn icon danger shrink-0" aria-label={`Remove ${sc.name}`} title={`Remove ${sc.name}`} onClick={() => setSettings({ scenarios: list.filter((x) => x.id !== sc.id) })}>
              <Icon name="trash" size={16} />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2 text-xs">
            {(
              [
                ["traffic", "Traffic"],
                ["conv", "Conv."],
                ["price", "Price"],
                ["cost", "Ad cost"],
              ] as const
            ).map(([k, l]) => (
              <label key={k} className="flex flex-col gap-1 font-bold">
                {l} ×
                <NumInput className="input px-2!" value={sc.whatif[k]} min={0} step={0.05} onChange={(v) => upd(sc.id, { whatif: { ...sc.whatif, [k]: v } })} />
              </label>
            ))}
          </div>
          <button type="button" className="btn sm mt-2" onClick={() => setSettings({ whatif: { ...sc.whatif } })}>
            Show on map
          </button>
        </div>
      ))}
      <button type="button" className="btn mb-4" onClick={() => setSettings({ scenarios: [...list, { id: nid(), name: `Custom ${list.length + 1}`, kind: "custom", whatif: { ...s.whatif } }] })}>
        <Icon name="plus" /> Save current what-if as scenario
      </button>
      {list.length > 0 && (
        <p className="sub">
          Full comparison with differences, charts and every KPI:{" "}
          <button type="button" className="link" onClick={() => setSection("scenarios")}>
            Reports → Scenario comparison
          </button>
        </p>
      )}
      {list.length > 0 && (
        <div tabIndex={0} role="region" aria-label="Table (scrolls sideways when it is wider than the screen)" className="fm-tblwrap">
          <table className="tbl">
            <caption className="sr-only">Scenario comparison</caption>
            <thead>
              <tr>
                <th />
                <th className="r">Baseline (current map)</th>
                {list.map((sc) => (
                  <th key={sc.id} className="r">
                    {sc.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.map(([label, f]) => (
                <tr key={label}>
                  <td className="font-bold">{label}</td>
                  <td className="r">{f(base)}</td>
                  {results.map((r, i) => (
                    <td key={list[i].id} className={`r ${label === "Profit" ? (r.profit >= 0 ? "pos" : "neg") : ""}`}>
                      {f(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </fieldset>
  );
}

function ForecastTab() {
  const s = useEditor((x) => x.settings);
  const nodes = useEditor((x) => x.nodes);
  const edges = useEditor((x) => x.edges);
  const ro = useEditor((x) => x.readOnly);
  const m = useM();
  const { months, growth } = s.projection;
  const rows = useMemo(() => project({ nodes, edges }, s, months, growth), [nodes, edges, s, months, growth]);
  const last = rows[rows.length - 1];
  const breakEven = rows.find((r) => r.cumulative >= 0 && r.month > 0);
  const [table, setTable] = useState(false);
  return (
    <>
      <p className="sub">Month-by-month cash if you run this funnel every month: subscriptions renew (with churn), payment plans pay over time, one-time costs land in month 1.</p>
      <fieldset disabled={ro} className="m-0 border-0 p-0">
        <div className="row2">
          <Field label="Months">{(id) => <NumInput id={id} value={months} min={1} max={60} step={1} onChange={(v) => setSettings({ projection: { months: Math.max(1, Math.min(60, Math.round(v) || 1)), growth } })} />}</Field>
          <Field label="Traffic growth / month (%)">{(id) => <NumInput id={id} value={growth} min={-50} max={100} onChange={(v) => setSettings({ projection: { months, growth: v } })} />}</Field>
        </div>
      </fieldset>
      <div className="statbox">
        <div>
          Revenue ({months} mo)<b>{m(rows.reduce((a, r) => a + r.revenue, 0))}</b>
        </div>
        <div>
          Profit ({months} mo)<b className={last && last.cumulative >= 0 ? "pos" : "neg"}>{m(last?.cumulative ?? 0)}</b>
        </div>
        <div>
          MRR at month {months}
          <b>{m(last?.mrr ?? 0)}</b>
        </div>
        <div>
          Cash break-even<b>{breakEven ? `Month ${breakEven.month}` : "Not within range"}</b>
        </div>
      </div>
      <ForecastCharts rows={rows} currency={s.currency} />
      <button type="button" className="btn sm mb-2" aria-expanded={table} onClick={() => setTable((t) => !t)}>
        {table ? "Hide" : "Show"} table
      </button>
      {table && (
        <div tabIndex={0} role="region" aria-label="Table (scrolls sideways when it is wider than the screen)" className="fm-tblwrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Mo</th>
                <th className="r">Revenue</th>
                <th className="r">Costs</th>
                <th className="r">Profit</th>
                <th className="r">Cumulative</th>
                <th className="r">Active subs</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.month}>
                  <td>{r.month}</td>
                  <td className="r">{m(r.revenue)}</td>
                  <td className="r">{m(r.costs)}</td>
                  <td className={`r ${r.profit >= 0 ? "pos" : "neg"}`}>{m(r.profit)}</td>
                  <td className={`r ${r.cumulative >= 0 ? "pos" : "neg"}`}>{m(r.cumulative)}</td>
                  <td className="r">{people(r.activeSubs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
