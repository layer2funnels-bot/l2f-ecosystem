"use client";
import { useMemo, useState } from "react";
import { ThumbnailField } from "./thumbnail-field";
import { WaitField } from "./wait-field";
import { WidgetFields } from "./widget-fields";
import { baseOf, fourPorts, isAnnot, isShareLogic, FRAME_COLORS, INT_LABEL, LINE_DIRS, portsFor, SHAPES, typeOf, type Interval, type TrafficModel } from "@/lib/catalog";
import { money, nf, pct, people } from "@/lib/format";
import { Icon } from "@/components/icon";
import { RichTextField } from "@/components/rich-text";
import { num, offerVals, periodFactor, stepRate, withStepRate, type PeriodKey } from "@/lib/funnel-math";
import { STEP_STATUSES, type FunnelEdge, type FunnelNode, type StepStatus } from "@/lib/graph";
import { safeUrl } from "@/lib/rich-text";
import { sym } from "@/lib/format";
import { align, clearSelection, meaningOf, nid, setMeaning, setSection, tidySelection, setSettings, deleteSelection, flipEdge, selectNodes, duplicateSelection, setInspTab, setLocked, showToast, type InspTab, updateEdge, updateNode, updateParams, useEditor, viewK, viewRange, wrapInFrame } from "@/lib/editor/store";
import { edgeConversion, edgeRevenue } from "@/lib/editor/labels";
import { rangeLabel } from "@/lib/range";
import { openInsertStep } from "./quick-add";
import { MEANINGS, MeaningSwatch } from "./line-menu";
import { ArrangeBar, ChecklistEditor, EdgeStyleFields, ImageFields, StylePanel } from "./style-panel";
import { Field, NumField, NumInput, Seg, StatBox, TextField } from "./fields";
import { Report } from "./report";
import { InsightsSlot } from "@/components/finding";
import { blockFindings } from "@/lib/findings";

export function Inspector() {
  const hideAll = useEditor((s) => s.shared && s.settings.hideNumbers);
  if (hideAll) return <PublicInspector />;
  return <FullInspector />;
}

/** Share links with numbers hidden: the journey only (names, notes, page links, screenshots). */
function PublicInspector() {
  const node = useEditor((s) => (s.selNodes.length === 1 ? s.nodes.find((n) => n.id === s.selNodes[0]) : undefined));
  const order = useEditor((s) => s.R.order);
  const nodes = useEditor((s) => s.nodes);
  const steps = useMemo(() => order.map((id) => nodes.find((n) => n.id === id)).filter((n) => n && typeOf(n.type)?.cat !== "annot"), [order, nodes]);
  if (node && typeOf(node.type).cat !== "annot")
    return (
      <>
        <h3>{node.name}</h3>
        <p className="sub">{typeOf(node.type).label}</p>
        {node.url && (
          <p className="mb-3 text-sm">
            <a href={node.url} target="_blank" rel="noreferrer" className="text-brand underline">
              Open page
            </a>
          </p>
        )}
      </>
    );
  return (
    <>
      <h3>The journey</h3>
      <p className="sub">Every step in order. Select a block on the map for details.</p>
      <ol className="m-0 list-decimal pl-5 text-sm">
        {steps.map((n) => (
          <li key={n!.id} className="py-1">
            <button type="button" className="text-left hover:text-brand" onClick={() => selectNodes([n!.id])}>
              <b>{n!.name}</b> <span className="text-muted">· {typeOf(n!.type).label}</span>
            </button>
          </li>
        ))}
      </ol>
    </>
  );
}

function FullInspector() {
  const selNodes = useEditor((s) => s.selNodes);
  const selEdge = useEditor((s) => s.selEdge);
  const node = useEditor((s) => (s.selNodes.length === 1 ? s.nodes.find((n) => n.id === s.selNodes[0]) : undefined));
  const edge = useEditor((s) => (s.selEdge ? s.edges.find((e) => e.id === s.selEdge) : undefined));
  if (selNodes.length > 1) return <MultiInspector count={selNodes.length} />;
  if (node) return <NodeInspector key={node.id} n={node} />;
  if (selEdge && edge) return <EdgeInspector e={edge} />;
  return <Report />;
}

function Actions({ ro, n }: { ro: boolean; n: FunnelNode }) {
  if (ro) return null;
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn" onClick={duplicateSelection}>
        Duplicate
      </button>
      <button type="button" className="btn" onClick={() => setLocked(!n.locked, [n.id])} aria-pressed={!!n.locked}>
        {n.locked ? "Unlock" : "Lock"}
      </button>
      <button type="button" className="btn danger" onClick={deleteSelection} disabled={!!n.locked}>
        Delete
      </button>
    </div>
  );
}


const STATUS_PILL: Record<StepStatus, string> = { planned: "Planned", building: "In progress", done: "Live" };

/** Scope header: "← Funnel" back link, then the block's name alone on the first line, type and the build-status select on the second. */
function ScopeHeader({ title, sub, status, locked, onStatus }: { title: string; sub: string; status?: StepStatus; locked?: boolean; onStatus?: (s: StepStatus) => void }) {
  return (
    <header className="fm-scopehead">
      <button type="button" className="fm-back" onClick={clearSelection}>
        <Icon name="chevronLeft" size={14} /> Funnel
      </button>
      <h3 title={title}>{title}</h3>
      <p className="sub">
        <span>{sub}</span>
        {status && onStatus ? (
          <label className={`fm-pillsel ${status}`} title="Build status: planned, in progress or live (shown in Reports → Published status)">
            <span className="sr-only">Build status</span>
            <i aria-hidden="true" />
            <select value={status} onChange={(e) => onStatus(e.target.value as StepStatus)}>
              {STEP_STATUSES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <Icon name="chevronDown" size={12} />
          </label>
        ) : (
          status && <span className={`fm-pill ${status}`}>{STATUS_PILL[status]}</span>
        )}
        {locked && <span className="fm-pill lock">Locked</span>}
      </p>
    </header>
  );
}

function NodeInspector({ n }: { n: FunnelNode }) {
  const T = typeOf(n.type);
  const ro = useEditor((s) => s.readOnly);
  const shared = useEditor((s) => s.shared);
  const tab = useEditor((s) => s.inspTab);
  const flow = !isAnnot(n.type);
  // Wait is math-neutral: everyone who arrives leaves, so it has nothing to analyse
  const analytics = flow && n.type !== "wait";
  const tabs: [InspTab, string][] = [
    ["details", "Details"],
    ["style", "Style"],
    ...(!shared && n.type !== "checklist" ? ([["plan", "Plan"]] as [InspTab, string][]) : []),
    ...(analytics ? ([["analytics", "Analytics"]] as [InspTab, string][]) : []),
  ];
  const cur = tabs.some(([k]) => k === tab) ? tab : "details";
  const choose = setInspTab;
  return (
    <>
      <ScopeHeader title={n.name || T.label} sub={T.label} locked={n.locked} />
      <div className="fm-insp-tabs" role="tablist" aria-label="Element panels">
        {tabs.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={cur === k} onClick={() => choose(k)}>
            {l}
          </button>
        ))}
        {flow && !analytics && (
          <button type="button" role="tab" aria-selected={false} aria-disabled="true" disabled title="Wait doesn’t change any numbers, so it has no analytics">
            Analytics
          </button>
        )}
      </div>
      <fieldset disabled={ro && cur !== "analytics"} className="m-0 min-w-0 border-0 p-0">
      {cur === "details" && <NodeDetails n={n} />}
      {cur === "style" && (
        <>
          <StylePanel n={n} />
          {!ro && <ArrangeBar ids={[n.id]} />}
        </>
      )}
      {cur === "plan" && (
        <>
          <InternalNotes n={n} />
          <ChecklistEditor n={n} />
          <p className="text-xs text-muted">The notes and checklist are internal: they never appear on client share links.</p>
        </>
      )}
      {cur === "analytics" && <NodeAnalytics n={n} />}
      </fieldset>
    </>
  );
}

function NodeDetails({ n }: { n: FunnelNode }) {
  const T = typeOf(n.type);
  const cur = useEditor((s) => s.settings.currency);
  const ro = useEditor((s) => s.readOnly);
  const shared = useEditor((s) => s.shared);
  const C = sym(cur).trim();
  const p = n.p;
  const P = (k: string) => (v: number | string | boolean) => updateParams(n.id, { [k]: v });
  return (
    <>
      {n.type === "widget" ? (
        <WidgetFields n={n} />
      ) : n.type === "note" ? (
        <RichTextField label="Note" value={String(p.text ?? "")} onChange={P("text")} rows={7} disabled={ro} help="Headings, bold, italic, lists, links and images. Shown on the map (and on share links)." />
      ) : n.type === "label" ? (
        <>
          <TextField label="Text" value={String(p.text ?? "")} onChange={P("text")} multiline />
          <NumField label="Font Size" value={num(p.size)} onChange={P("size")} min={8} max={160} />
          <p className="mb-3 text-xs text-muted">Font, weight, spacing, colour and alignment are in the Style tab.</p>
        </>
      ) : n.type === "shape" ? (
        <>
          <Field label="Shape">
            {(id) => (
              <select id={id} className="input" value={String(p.shape ?? "rounded")} onChange={(e) => P("shape")(e.target.value)}>
                {SHAPES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {p.shape === "line" || p.shape === "arrow" ? (
            <Field label="Direction">
              {(id) => (
                <select id={id} className="input" value={String(p.dir ?? "h")} onChange={(e) => P("dir")(e.target.value)}>
                  {LINE_DIRS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          ) : (
            <TextField label="Text inside" value={String(p.text ?? "")} onChange={P("text")} multiline />
          )}
        </>
      ) : n.type === "image" ? (
        <ImageFields n={n} />
      ) : n.type === "link" ? (
        <>
          <TextField label="Link (page, video or file)" type="url" value={String(p.url ?? "")} placeholder="https://" onChange={(v) => P("url")(safeUrl(v))} help="YouTube, Vimeo, Loom and Wistia links show as videos. Opens in a new tab." />
          <TextField label="Title" value={String(p.title ?? "")} placeholder="e.g. Sales video walkthrough" onChange={P("title")} />
        </>
      ) : n.type === "checklist" ? (
        <>
          <TextField label="Title" value={String(p.title ?? "")} onChange={P("title")} />
          <ChecklistEditor n={n} label="Items" />
        </>
      ) : n.type === "frame" ? (
        <>
          <TextField label="Stage name" value={n.name} onChange={(v) => updateNode(n.id, { name: v })} />
          <Field label="Colour" help="Blocks inside the frame move with it.">
            {(id) => (
              <select id={id} className="input" value={String(p.color)} onChange={(e) => P("color")(e.target.value)}>
                {FRAME_COLORS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </>
      ) : (
        <>
          <TextField
            label={baseOf(n.type) === "cond" ? "Question" : "Name"}
            value={n.name}
            onChange={(v) => updateNode(n.id, { name: v })}
            help={baseOf(n.type) === "cond" ? "For example “Bought the Kickstart?” or “Opened the email?”" : undefined}
          />
          {T.cat === "traffic" && (
            <>
              <div className="field">
                <span className="lbl">Cost model</span>
                <Seg<TrafficModel>
                  label="Cost model"
                  value={(p.model as TrafficModel) || "budget"}
                  options={[
                    ["budget", "Total budget"],
                    ["cpc", "Per click"],
                    ["cpm", "Per 1,000 views"],
                  ]}
                  onChange={P("model")}
                />
              </div>
              {p.model === "cpc" ? (
                <div className="row2">
                  <NumField label="Clicks" value={num(p.clicks)} onChange={P("clicks")} min={0} />
                  <NumField label={`Cost per click (${C})`} value={num(p.cpc)} onChange={P("cpc")} min={0} />
                </div>
              ) : p.model === "cpm" ? (
                <>
                  <div className="row2">
                    <NumField label="Impressions" value={num(p.impr)} onChange={P("impr")} min={0} />
                    <NumField label={`CPM (${C})`} value={num(p.cpm)} onChange={P("cpm")} min={0} />
                  </div>
                  <NumField label="Click-through rate (%)" value={num(p.ctr)} onChange={P("ctr")} min={0} max={100} />
                </>
              ) : (
                <div className="row2">
                  <NumField label="Visitors" value={num(p.visitors)} onChange={P("visitors")} min={0} />
                  <NumField label={`Spend (${C})`} value={num(p.spend)} onChange={P("spend")} min={0} />
                </div>
              )}
            </>
          )}
          {baseOf(n.type) === "cond" && (
            <NumField label={`${T.ports?.[0] ?? "Yes"} (%)`} value={num(p.pct)} onChange={P("pct")} min={0} max={100} help={`Share of people who go the ${T.ports?.[0] ?? "Yes"} way. Everyone else follows the ${T.ports?.[1] ?? "No"} path (bottom dot).`} />
          )}
          {baseOf(n.type) === "split" && (
            <NumField label={`${T.ports?.[0] ?? "A"} (%)`} value={num(p.pct)} onChange={P("pct")} min={0} max={100} help={`${T.ports?.[1] ?? "B"} gets the rest. Connect ${T.ports?.[0] ?? "A"} from the right dot and ${T.ports?.[1] ?? "B"} from the bottom dot; split it further with the share on each connection.`} />
          )}
          {T.cat === "page" && (
            <>
              <NumField label="Conversion rate (%)" value={num(p.cr)} onChange={P("cr")} min={0} max={100} help="Share of visitors who move on. The rest follow the bottom dot." />
              <label className="check">
                <input type="checkbox" checked={!!p.lead} onChange={(e) => P("lead")(e.target.checked)} />
                People who pass this step count as leads
              </label>
            </>
          )}
          {(T.cat === "page" || T.cat === "offer") && !shared && <ThumbnailField n={n} />}
          {T.cat === "action" && (
            <>
              <NumField label={`${T.crl ?? "Conversion rate"} (%)`} value={num(p.cr)} onChange={P("cr")} min={0} max={100} />
              {n.type === "wait" && <WaitField n={n} />}
              {n.type === "seq" && <NumField label="Emails in the sequence" value={num(p.count)} onChange={P("count")} min={1} />}
              <NumField label={`Cost per person (${C})`} value={num(p.costPer)} onChange={P("costPer")} min={0} help="SMS fees, setter time per call, tool cost per contact." />
            </>
          )}
          {T.cat === "offer" && <OfferFields n={n} C={C} />}

          {baseOf(n.type) === "goal" && !shared && <TextField label="What counts as done (internal)" value={n.desc ?? ""} placeholder="e.g. Booked a call" onChange={(v) => updateNode(n.id, { desc: v })} />}
        </>
      )}
      <Actions ro={ro} n={n} />
    </>
  );
}

export function InternalNotes({ n }: { n: FunnelNode }) {
  const ro = useEditor((s) => s.readOnly);
  return (
    <RichTextField
      label="Internal notes"
      help="Team only. Never shown on client share links, presentations or PDF reports."
      value={n.desc ?? ""}
      placeholder="Copy ideas, owner, status…"
      disabled={ro}
      onChange={(v) => updateNode(n.id, { desc: v })}
    />
  );
}

/** This step's numbers per day / week / month / year (the funnel models a month). */
function PeriodForecast({ n }: { n: FunnelNode }) {
  const r = useEditor((s) => s.R.N[n.id]);
  const shared = useEditor((s) => s.shared && s.settings.hideNumbers);
  if (!r || shared) return null;
  const T = typeOf(n.type);
  const inn = T.cat === "traffic" ? r.out : r.inflow;
  return (
    <section className="fm-flowsec">
      <div className="fm-sh">
        <h4>Over time</h4>
      </div>
      <div tabIndex={0} role="region" aria-label="Table (scrolls sideways when it is wider than the screen)" className="fm-tblwrap">
        <table className="tbl">
          <caption className="sr-only">People in and moving on, by period, for {n.name}</caption>
          <thead>
            <tr>
              <th scope="col">Per</th>
              <th scope="col" className="r">In</th>
              <th scope="col" className="r">Out</th>
            </tr>
          </thead>
          <tbody>
            {(["day", "week", "month", "year"] as PeriodKey[]).map((k) => {
              const f = periodFactor(k);
              return (
                <tr key={k}>
                  <th scope="row" className="font-semibold">{k[0].toUpperCase() + k.slice(1)}</th>
                  <td className="r">{people(inn * f)}</td>
                  <td className="r">{people(r.out * f)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Analytics tab: this step's numbers, its place in the funnel and a conversion goal. */
function NodeAnalytics({ n }: { n: FunnelNode }) {
  const R = useEditor((s) => s.R);
  const nodes = useEditor((s) => s.nodes);
  const edges = useEditor((s) => s.edges);
  const settings = useEditor((s) => s.settings);
  const ro = useEditor((s) => s.readOnly);
  const shared = useEditor((s) => s.shared);
  const opts = useEditor((s) => s.opts);
  const k = viewK(opts);
  const r = R.N[n.id];
  const T = typeOf(n.type);
  const m = (v: number) => money(v, settings.currency);
  const goal = settings.goals.find((g) => g.kind === "conversion" && g.nodeId === n.id);
  const rateable = ["page", "offer", "action"].includes(T.cat) || isShareLogic(n.type);
  const impact = useMemo(() => (goal && goal.value > 0 ? withStepRate({ nodes, edges }, settings, n.id, goal.value) : null), [goal, nodes, edges, settings, n.id]);
  const findings = useMemo(() => (shared ? [] : blockFindings(n.id, { nodes, edges }, settings, R)), [shared, n.id, nodes, edges, settings, R]);
  if (!r) return null;
  const inn = T.cat === "traffic" ? r.out : r.inflow;
  const setGoal = (v: number) => {
    const rest = settings.goals.filter((g) => g !== goal);
    setSettings({ goals: v > 0 ? [...rest, { id: goal?.id ?? nid(), name: goal?.name || `${n.name} conversion`, kind: "conversion", value: v, period: "month", nodeId: n.id }] : rest });
  };
  return (
    <>
      <InsightsSlot findings={findings} />
      <p className="fm-foruse">For {rangeLabel(viewRange(opts))}</p>
      <NodeStats n={n} k={k} />
      {flowish(n) && <Paths n={n} k={k} />}
      {rateable && !(shared && settings.hideNumbers) && (
        <>
          <h4>Goal</h4>
          <fieldset disabled={ro || shared} className="m-0 border-0 p-0">
            <NumField label={`Target ${isShareLogic(n.type) ? "share" : "conversion"} (%)`} value={goal?.value || undefined} min={0} max={100} onChange={setGoal} help={`Today: ${nf(stepRate(n), 1)}%. Saved as a goal in Reports → Goals.`} />
          </fieldset>
          {impact && (
            <StatBox
              items={[
                ["Revenue at target", m(impact.rev)],
                ["Change", `${impact.rev - R.rev >= 0 ? "+" : ""}${m(impact.rev - R.rev)}`],
                ["Profit at target", m(impact.profit)],
                ["Customers at target", people(impact.cust)],
              ]}
            />
          )}
        </>
      )}
      <PeriodForecast n={n} />
      <button type="button" className="fm-linkbtn" onClick={() => setSection("data")}>
        Open reports ›
      </button>
    </>
  );
}

function OfferFields({ n, C }: { n: FunnelNode; C: string }) {
  const p = n.p;
  const P = (k: string) => (v: number | string | boolean) => updateParams(n.id, { [k]: v });
  const iv = (p.interval as Interval) || "monthly";
  return (
    <>
      <NumField label="Buy rate (%)" value={num(p.cr)} onChange={P("cr")} min={0} max={100} help="Share of people reaching this offer who buy. Non-buyers follow the bottom dot." />
      {baseOf(n.type) === "sub" ? (
        <>
          <div className="field">
            <span className="lbl">Billing</span>
            <Seg<Interval>
              label="Billing"
              value={iv}
              options={[
                ["weekly", "Weekly"],
                ["monthly", "Monthly"],
                ["quarterly", "Quarterly"],
                ["yearly", "Yearly"],
              ]}
              onChange={P("interval")}
            />
          </div>
          <div className="row2">
            <NumField label={`Price per ${INT_LABEL[iv]} (${C})`} value={num(p.price)} onChange={P("price")} min={0} />
            <NumField label={`Setup fee (${C})`} value={num(p.setup)} onChange={P("setup")} min={0} />
          </div>
          <div className="row2">
            <NumField label="Trial (days)" value={num(p.trialDays)} onChange={P("trialDays")} min={0} />
            <NumField label={`Trial price (${C})`} value={num(p.trialPrice)} onChange={P("trialPrice")} min={0} />
          </div>
          <NumField label="Average customer stays (months)" value={num(p.life)} onChange={P("life")} min={0} help="Used for lifetime value. 1 ÷ monthly churn: 10% churn ≈ 10 months." />
        </>
      ) : baseOf(n.type) === "plan" ? (
        <>
          <div className="row2">
            <NumField label="Number of payments" value={num(p.pays)} onChange={P("pays")} min={1} />
            <NumField label={`Each payment (${C})`} value={num(p.price)} onChange={P("price")} min={0} />
          </div>
          <div className="field">
            <span className="lbl">Paid every</span>
            <Seg<Interval>
              label="Paid every"
              value={iv}
              options={[
                ["weekly", "Week"],
                ["monthly", "Month"],
                ["quarterly", "Quarter"],
              ]}
              onChange={P("interval")}
            />
          </div>
        </>
      ) : (
        <NumField label={`Price (${C})`} value={num(p.price)} onChange={P("price")} min={0} />
      )}
      <div className="row2">
        <NumField label="Discount (%)" value={num(p.disc)} onChange={P("disc")} min={0} max={100} />
        <NumField label="Refund rate (%)" value={num(p.refund)} onChange={P("refund")} min={0} max={100} />
      </div>
      <div className="row2">
        <NumField label={`Delivery cost per sale (${C})`} value={num(p.fulfil)} onChange={P("fulfil")} min={0} />
        <NumField label="Affiliate commission (%)" value={num(p.aff)} onChange={P("aff")} min={0} max={100} />
      </div>
      <label className="check">
        <input type="checkbox" checked={!!p.newc} onChange={(e) => P("newc")(e.target.checked)} />
        Counts as a new customer (used for CPA and AOV)
      </label>
      <TextField label="Checkout URL" type="url" value={n.url ?? ""} placeholder="https://" onChange={(v) => updateNode(n.id, { url: v })} />
    </>
  );
}

function NodeStats({ n, k }: { n: FunnelNode; k: number }) {
  const r = useEditor((s) => s.R.N[n.id]);
  const cur = useEditor((s) => s.settings.currency);
  const wp = useEditor((s) => s.settings.whatif.price);
  if (!r) return null;
  const T = typeOf(n.type);
  const m = (v: number) => money(v * k, cur);
  if (T.cat === "traffic")
    return (
      <StatBox
        items={[
          ["Visitors", people(r.out * k)],
          ["Spend", m(r.spend)],
          ["Cost per visitor", money(r.out ? r.spend / r.out : 0, cur)],
        ]}
      />
    );
  const yes = T.cat === "offer" ? "Buying" : (T.ports?.[0] ?? "Moving on"),
    no = T.cat === "offer" ? "Not buying" : (T.ports?.[1] ?? "Dropping off");
  const share = r.inflow ? r.out / r.inflow : NaN;
  const v = T.cat === "offer" ? offerVals(n, wp) : null;
  return (
    <>
      <div className="fm-three">
        <div>
          <span>People in</span>
          <b>{people(r.inflow * k)}</b>
        </div>
        <div>
          <span>{yes}</span>
          <b>{people(r.out * k)}</b>
          <small>{pct(share)}</small>
        </div>
        <div>
          <span>{no}</span>
          <b>{people(r.non * k)}</b>
        </div>
      </div>
      <div className="fm-splitbar" role="img" aria-label={`${pct(share)} of people move on`}>
        <i style={{ width: `${Number.isFinite(share) ? Math.max(0, Math.min(100, share * 100)) : 0}%` }} />
      </div>
      {v && (
        <StatBox
          items={[
            ["Revenue", m(r.rev)],
            ["Lifetime value", m(r.ltv)],
            ...(baseOf(n.type) === "sub"
              ? ([
                  ["MRR", money(r.mrr, cur)],
                  ["LTV / subscriber", money(v.ltv, cur)],
                ] as [string, string][])
              : []),
          ]}
        />
      )}
    </>
  );
}

const flowish = (n: FunnelNode) => !isAnnot(n.type) && n.type !== "widget";

/** Where this block's people go: one line per exit ("Yes → Monthly coaching"), and the exits that aren't connected yet. */
function Paths({ n, k }: { n: FunnelNode; k: number }) {
  const T = typeOf(n.type);
  const edges = useEditor((s) => s.edges);
  const nodes = useEditor((s) => s.nodes);
  const R = useEditor((s) => s.R);
  const [yes, no] = T.ports ?? ["Yes", "No"];
  const { hasAlt } = portsFor(n.type);
  const out = edges.filter((e) => e.from === n.id);
  const to = (e: FunnelEdge) => nodes.find((x) => x.id === e.to)?.name ?? "Unknown step";
  const total = R.N[n.id]?.out ?? 0;
  const rows: { key: string; label: string; alt: boolean; targets: FunnelEdge[] }[] = [
    { key: "main", label: T.cat === "traffic" ? "Sends people to" : yes, alt: false, targets: out.filter((e) => e.port !== "alt") },
    ...(hasAlt ? [{ key: "alt", label: no, alt: true, targets: out.filter((e) => e.port === "alt") }] : []),
  ];
  return (
    <section className="fm-flowsec">
      <div className="fm-sh">
        <h4>Where they go</h4>
      </div>
      {rows.map((r) => (
        <div className="fm-path" key={r.key}>
          {(hasAlt || T.cat === "traffic") && (
            <span className={r.alt ? "no" : "yes"}>
              {r.label} <Icon name="arrow" size={12} />
            </span>
          )}
          {r.targets.length ? (
            <span className="to">
              {r.targets.map((e) => {
                const f = R.flows[e.id] ?? 0;
                return (
                  <button key={e.id} type="button" onClick={() => selectNodes([e.to])} title={`${people(f * k)} people. Select this step`}>
                    {to(e)}
                    {total > 0 && <b>{pct(f / total)}</b>}
                  </button>
                );
              })}
            </span>
          ) : (
            <span className="none">Not connected</span>
          )}
        </div>
      ))}
    </section>
  );
}

function EdgeInspector({ e }: { e: FunnelEdge }) {
  const a = useEditor((s) => s.nodes.find((n) => n.id === e.from));
  const b = useEditor((s) => s.nodes.find((n) => n.id === e.to));
  const flow = useEditor((s) => s.R.flows[e.id] ?? 0);
  const R = useEditor((s) => s.R);
  const cur = useEditor((s) => s.settings.currency);
  const ro = useEditor((s) => s.readOnly);
  const [tab, setTab] = useState<"flow" | "style">("flow");
  const labels: [string, string] = (a && typeOf(a.type).ports) || ["People who converted", "People who didn’t convert"];
  const conv = edgeConversion(e.from, flow, R);
  const rev = edgeRevenue(e.to, flow, R);
  return (
    <>
      <header className="fm-scopehead">
        <button type="button" className="fm-back" onClick={clearSelection}>
          <Icon name="chevronLeft" size={14} /> Funnel
        </button>
        <h3 className="sr-only">Connection</h3>
        <span className="eyebrow">Connection · {{ yes: "Converted", no: "Didn’t convert", skip: "Skip step", nodata: "No data" }[meaningOf(e)]}</span>
        <div className="fm-conchips">
          <span title={a?.name}>{a?.name}</span>
          <Icon name="arrow" size={13} />
          <span title={b?.name}>{b?.name}</span>
        </div>
      </header>
      <div className="fm-insp-tabs" role="tablist" aria-label="Connection panels">
        {(
          [
            ["flow", "Flow"],
            ["style", "Style"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      <fieldset disabled={ro} className="m-0 min-w-0 border-0 p-0">
        {tab === "flow" ? (
          <>
            {a && fourPorts(a.type) && (
              <div className="field">
                <span className="lbl">This line means</span>
                <div className="fm-meanings" role="radiogroup" aria-label="This line means">
                  {MEANINGS.filter(([k]) => k !== "no" || portsFor(a.type).hasAlt).map(([k, label, help]) => (
                    <button key={k} type="button" role="radio" aria-checked={meaningOf(e) === k} onClick={() => setMeaning(e.id, k)} title={help}>
                      <MeaningSwatch m={k} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {a && !fourPorts(a.type) && portsFor(a.type).hasAlt && (
              <div className="field">
                <span className="lbl">Who goes this way</span>
                <Seg<"main" | "alt">
                  label="Who goes this way"
                  value={e.port === "alt" ? "alt" : "main"}
                  options={[
                    ["main", labels[0]],
                    ["alt", labels[1]],
                  ]}
                  onChange={(v) => updateEdge(e.id, { port: v })}
                />
              </div>
            )}
            <Field label="Share of them (%)" help="Split one group between several next steps, for example 60% email and 40% retargeting.">
              {(id) => <NumInput id={id} value={num(e.share ?? 100)} min={0} max={100} onChange={(v) => updateEdge(e.id, { share: v })} />}
            </Field>
            <StatBox
              items={[
                ["People on this path", people(flow)],
                ["Conversion at the source step", conv == null ? "No data yet" : `${nf(conv * 100, 1)}%`],
                ["Revenue through this path", rev > 0 ? money(rev, cur) : "No data yet"],
              ]}
            />
            {!ro && (
              <div className="mb-3 flex flex-wrap gap-2">
                <button type="button" className="btn" onClick={() => flipEdge(e.id)}>
                  Flip direction
                </button>
                <button type="button" className="btn" onClick={() => openInsertStep(e.id) || showToast("Scroll the connection into view first")}>
                  Insert step on line
                </button>
              </div>
            )}
          </>
        ) : (
          <EdgeStyleFields e={e} />
        )}
        {!ro && (
          <button type="button" className="btn danger" onClick={deleteSelection}>
            Delete connection
          </button>
        )}
      </fieldset>
    </>
  );
}

/** The optional build-status layer: set planned / in progress / live on every selected block at once. */
function BuildStatusBar() {
  const ids = useEditor((s) => s.selNodes);
  const nodes = useEditor((s) => s.nodes);
  const flow = nodes.filter((n) => ids.includes(n.id) && !isAnnot(n.type));
  const same = flow.length > 0 && new Set(flow.map((n) => n.status ?? "planned")).size === 1 ? (flow[0].status ?? "planned") : "";
  return (
    <div className="field">
      <span className="lbl">Build status</span>
      <Seg<StepStatus> label="Build status" value={same as StepStatus} options={STEP_STATUSES.map(([v, l]) => [v, l] as [StepStatus, string])} onChange={(v) => flow.forEach((n) => updateNode(n.id, { status: v }))} />
      <p className="help">Shown on each block while the Build status layer is on, and in Reports → Published status.</p>
    </div>
  );
}

function MultiInspector({ count }: { count: number }) {
  const ro = useEditor((s) => s.readOnly);
  const build = useEditor((s) => s.opts.build);
  const first = useEditor((s) => s.nodes.find((n) => n.id === s.selNodes[0]));
  const sameType = useEditor((s) => s.selNodes.length > 1 && new Set(s.nodes.filter((n) => s.selNodes.includes(n.id)).map((n) => n.type)).size === 1);
  const [tab, setTab] = useState<"style" | "arrange" | "details">("style");
  const tabs: ["style" | "arrange" | "details", string][] = [
    ["style", "Style"],
    ["arrange", "Arrange"],
    ...(sameType && first && !isAnnot(first.type) ? ([["details", "Details"]] as ["details", string][]) : []),
  ];
  const cur = tabs.some(([k]) => k === tab) ? tab : "style";
  return (
    <>
      <ScopeHeader title={`${count} blocks`} sub="Drag any of them to move the group" />
      <div className="fm-insp-tabs" role="tablist" aria-label="Selection panels">
        {tabs.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={cur === k} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      <fieldset disabled={ro} className="m-0 min-w-0 border-0 p-0">
        {build && <BuildStatusBar />}
        {cur === "style" && first && <MultiStyle />}
        {cur === "arrange" && (
          <>
            <div className="mb-3 flex flex-wrap gap-2">
              <button type="button" className="btn" onClick={() => align("left")}>
                Align left
              </button>
              <button type="button" className="btn" onClick={() => align("top")}>
                Align top
              </button>
              <button type="button" className="btn" onClick={() => align("center")}>
                Centre
              </button>
              <button type="button" className="btn" onClick={() => align("middle")}>
                Middle
              </button>
              <button type="button" className="btn" onClick={() => align("hdist")}>
                Space across
              </button>
              <button type="button" className="btn" onClick={() => align("vdist")}>
                Space down
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn" onClick={tidySelection}>
                Tidy selection
              </button>
              <button type="button" className="btn" onClick={wrapInFrame}>
                Put in a stage frame
              </button>
            </div>
            <MultiArrange />
          </>
        )}
        {cur === "details" && first && <NodeDetails n={first} />}
      </fieldset>
    </>
  );
}

function MultiStyle() {
  const ids = useEditor((s) => s.selNodes);
  const first = useEditor((s) => s.nodes.find((n) => n.id === s.selNodes[0]));
  return first ? <StylePanel n={first} ids={ids} /> : null;
}

function MultiArrange() {
  const ids = useEditor((s) => s.selNodes);
  return <ArrangeBar ids={ids} />;
}
