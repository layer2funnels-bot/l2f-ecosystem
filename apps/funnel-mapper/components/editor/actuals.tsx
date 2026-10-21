"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { fmtDate, money, nf, pct } from "@/lib/format";
import { DAYS_PER_PERIOD } from "@/lib/report-data";
import { planVsActual, stepRows, type ActualRow } from "@/lib/funnel-math";
import type { ActualRowDb } from "@/lib/schemas";
import { supabaseBrowser } from "@/lib/supabase/client";
import { setActuals, useEditor } from "@/lib/editor/store";
import { actualsCsv, fileName } from "@/lib/export";
import { download } from "./exporters";
import { ActualsEntry } from "./actuals-entry";
import { MonthCalendar } from "./month-calendar";

const iso = (d: Date) => d.toISOString().slice(0, 10);
function lastMonth() {
  const n = new Date();
  const start = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 0));
  return { start: iso(start), end: iso(end) };
}
const days = (a: string, b: string) => Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1);

type Draft = Record<string, { visitors: string; conversions: string; revenue: string; spend: string }>;

/** Planned vs actual: enter real numbers per step for a date range and compare with the plan. */
export function Actuals() {
  const funnelId = useEditor((s) => s.funnelId);
  const shared = useEditor((s) => s.shared);
  const ro = useEditor((s) => s.readOnly);
  const nodes = useEditor((s) => s.nodes);
  const edges = useEditor((s) => s.edges);
  const R = useEditor((s) => s.R);
  const cur = useEditor((s) => s.settings.currency);
  const [rows, setRows] = useState<ActualRowDb[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [range, setRange] = useState(lastMonth);
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);
  const [entry, setEntry] = useState(false);
  const [cal, setCal] = useState(false);
  const dlg = useRef<HTMLDialogElement>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabaseBrowser().from("funnel_actuals").select("*").eq("funnel_id", funnelId).order("period_start", { ascending: false });
    if (error) setErr(error.message);
    setRows(data ?? []);
    // keep the map's Actual mode and Trend widgets in step with what was just saved
    if (!error) setActuals(data ?? []);
    setLoading(false);
  }, [funnelId]);
  useEffect(() => {
    if (!shared && funnelId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- loading external data
      load();
    }
  }, [load, shared, funnelId]);

  const periods = useMemo(() => {
    const m = new Map<string, { start: string; end: string; n: number }>();
    rows.forEach((r) => {
      const k = `${r.period_start}|${r.period_end}`;
      m.set(k, { start: r.period_start, end: r.period_end, n: (m.get(k)?.n ?? 0) + 1 });
    });
    return [...m.values()];
  }, [rows]);

  const inRange = rows.filter((r) => r.period_start >= range.start && r.period_end <= range.end);
  const overlapping = rows.some((r) => r.period_start <= range.end && r.period_end >= range.start && (r.period_start < range.start || r.period_end > range.end));
  const scale = days(range.start, range.end) / DAYS_PER_PERIOD;
  const cmp = planVsActual({ nodes, edges }, R, inRange.map((r) => ({ node_id: r.node_id, visitors: r.visitors, conversions: r.conversions, revenue: r.revenue, spend: r.spend }) as ActualRow), scale);
  const tot = cmp.reduce(
    (a, r) => ({ planRev: a.planRev + r.planRev, actRev: a.actRev + (r.actRev ?? 0), planSpend: a.planSpend + r.planSpend, actSpend: a.actSpend + (r.actSpend ?? 0) }),
    { planRev: 0, actRev: 0, planSpend: 0, actSpend: 0 },
  );

  if (shared) return <p className="sub">Planned vs actual numbers are available to the funnel owner.</p>;

  const openEditor = () => {
    const exact = rows.filter((r) => r.period_start === range.start && r.period_end === range.end);
    const d: Draft = {};
    stepRows({ nodes, edges }, R).forEach((s) => {
      const r = exact.find((x) => x.node_id === s.id);
      const f = (v: number | null | undefined) => (v == null ? "" : String(v));
      d[s.id] = { visitors: f(r?.visitors), conversions: f(r?.conversions), revenue: f(r?.revenue), spend: f(r?.spend) };
    });
    setDraft(d);
    dlg.current?.showModal();
  };
  const save = async () => {
    setSaving(true);
    setErr("");
    const sb = supabaseBrowser();
    const n = (s: string) => (s.trim() === "" ? null : Number(s));
    const upserts = Object.entries(draft)
      .filter(([, v]) => Object.values(v).some((x) => x.trim() !== ""))
      .map(([node_id, v]) => ({ funnel_id: funnelId, period_start: range.start, period_end: range.end, node_id, visitors: n(v.visitors), conversions: n(v.conversions), revenue: n(v.revenue), spend: n(v.spend) }));
    const empty = Object.entries(draft)
      .filter(([, v]) => Object.values(v).every((x) => x.trim() === ""))
      .map(([id]) => id);
    const r1 = upserts.length ? await sb.from("funnel_actuals").upsert(upserts, { onConflict: "funnel_id,period_start,period_end,node_id" }) : { error: null };
    const r2 = empty.length ? await sb.from("funnel_actuals").delete().eq("funnel_id", funnelId).eq("period_start", range.start).eq("period_end", range.end).in("node_id", empty) : { error: null };
    setSaving(false);
    if (r1.error || r2.error) return setErr((r1.error || r2.error)!.message);
    dlg.current?.close();
    load();
  };

  const variance = (plan: number, act: number | null) => {
    if (act == null || !plan) return null;
    const v = act / plan - 1;
    return <span className={v >= 0 ? "pos" : "neg"}>{v >= 0 ? "+" : ""}{pct(v)}</span>;
  };

  return (
    <>
      <p className="sub">Enter real numbers by month or week, or for any date range, and compare them with the plan. Planned numbers are per month and scaled to the range ({nf(scale, 2)}×).</p>
      {!ro && (
        <button type="button" className="btn primary mb-3 w-full" onClick={() => setEntry(true)}>
          <Icon name="edit" /> Type in or import CSV
        </button>
      )}
      <div className="mb-2 flex flex-wrap gap-1" role="group" aria-label="Date range">
        {(
          [
            ["Today", () => ({ start: iso(new Date()), end: iso(new Date()) })],
            ["This month", () => ({ start: iso(new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))), end: iso(new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 0))) })],
            ["Last month", lastMonth],
            ["Last 30 days", () => ({ start: iso(new Date(new Date().getTime() - 29 * 86400000)), end: iso(new Date()) })],
          ] as [string, () => { start: string; end: string }][]
        ).map(([l, f]) => {
          // eslint-disable-next-line react-hooks/purity -- presets are relative to today
          const r = f();
          return (
            <button key={l} type="button" className="btn sm" aria-pressed={r.start === range.start && r.end === range.end} onClick={() => setRange(r)}>
              {l}
            </button>
          );
        })}
        <button type="button" className="btn sm" aria-expanded={cal} onClick={() => setCal((v) => !v)}>
          <Icon name="calendar" size={14} /> Custom
        </button>
      </div>
      {cal && <MonthCalendar range={range} marked={rows.map((r) => ({ start: r.period_start, end: r.period_end }))} onPick={(r) => setRange(r)} />}
      <div className="row2">
        <div className="field">
          <label htmlFor="act-start">From</label>
          <input id="act-start" className="input" type="date" value={range.start} max={range.end} onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))} />
        </div>
        <div className="field">
          <label htmlFor="act-end">To</label>
          <input id="act-end" className="input" type="date" value={range.end} min={range.start} onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))} />
        </div>
      </div>
      {periods.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {periods.map((p) => (
            <button key={p.start + p.end} type="button" className="btn sm" aria-pressed={p.start === range.start && p.end === range.end} onClick={() => setRange({ start: p.start, end: p.end })}>
              {fmtDate(p.start)} – {fmtDate(p.end)}
            </button>
          ))}
        </div>
      )}
      {!ro && (
        <button type="button" className="btn primary mb-3" onClick={openEditor}>
          <Icon name="edit" /> Enter actuals for this range
        </button>
      )}
      <button type="button" className="btn mb-3" disabled={!inRange.length} onClick={() => download(fileName(`${useEditor.getState().name} actuals ${range.start} to ${range.end}`, "csv"), actualsCsv(inRange, Object.fromEntries(nodes.map((n) => [n.id, n.name]))), "text/csv")}>
        <Icon name="download" /> Export actuals CSV
      </button>
      {overlapping && <p className="sub" role="status">Some saved actuals cross the selected dates. They are excluded because step totals cannot be split accurately across days; select a range containing each full saved period.</p>}
      {err && (
        <p role="alert" className="text-sm text-bad">
          {err}
        </p>
      )}
      {loading ? (
        <p className="sub" role="status" aria-live="polite">Loading…</p>
      ) : (
        <>
          <div className="statbox">
            <div>
              Revenue plan<b>{money(tot.planRev, cur)}</b>
            </div>
            <div>
              Revenue actual<b>{inRange.length ? money(tot.actRev, cur) : "–"}</b>
            </div>
            <div>
              Spend plan<b>{money(tot.planSpend, cur)}</b>
            </div>
            <div>
              Spend actual<b>{inRange.length ? money(tot.actSpend, cur) : "–"}</b>
            </div>
          </div>
          <div tabIndex={0} role="region" aria-label="Table (scrolls sideways when it is wider than the screen)" className="fm-tblwrap">
            <table className="tbl">
              <caption className="sr-only">Planned vs actual by step</caption>
              <thead>
                <tr>
                  <th>Step</th>
                  <th className="r">In plan / actual</th>
                  <th className="r">Conv. plan / actual</th>
                  <th className="r">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {cmp.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td className="r">
                      {nf(r.planIn)} / <b>{r.actIn == null ? "–" : nf(r.actIn)}</b>
                      <br />
                      {variance(r.planIn, r.actIn)}
                    </td>
                    <td className="r">
                      {pct(r.planCr)} / <b>{pct(r.actCr)}</b>
                    </td>
                    <td className="r">
                      {r.cat === "offer" || r.actRev != null ? (
                        <>
                          {money(r.planRev, cur)} / <b>{r.actRev == null ? "–" : money(r.actRev, cur)}</b>
                          <br />
                          {variance(r.planRev, r.actRev)}
                        </>
                      ) : (
                        ""
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {entry && <ActualsEntry rows={rows} onSaved={load} onClose={() => setEntry(false)} />}
      {inRange.length > 0 && (
        <p className="sub mt-2">
          <span className="fm-tag actual" title="Entered or imported numbers">
            Actual
          </span>{" "}
          {fmtDate(range.start)} – {fmtDate(range.end)} · source:{" "}
          {[...new Set(inRange.map((r) => (r.source === "csv" ? `CSV (${r.source_ref ?? "file"})` : "typed")))].join(", ")}
        </p>
      )}
      <dialog ref={dlg} className="modal" style={{ maxWidth: 860 }} aria-labelledby="act-title">
        <h3 id="act-title">
          Actuals: {fmtDate(range.start)} – {fmtDate(range.end)}
        </h3>
        <p className="sub mb-3 text-sm text-muted">Visitors = people arriving at the step (traffic sources: visits). Conversions = people who moved on or bought. Leave blanks for unknowns.</p>
        <div tabIndex={0} role="region" aria-label="Table (scrolls sideways when it is wider than the screen)" className="fm-tblwrap max-h-[60vh] overflow-y-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Step</th>
                <th className="r">Plan in</th>
                <th>Visitors</th>
                <th>Conversions</th>
                <th>Revenue</th>
                <th>Spend / cost</th>
              </tr>
            </thead>
            <tbody>
              {stepRows({ nodes, edges }, R).map((s) => (
                <tr key={s.id}>
                  <td className="font-bold">{s.name}</td>
                  <td className="r text-muted">{nf(s.inn * scale)}</td>
                  {(["visitors", "conversions", "revenue", "spend"] as const).map((k) => (
                    <td key={k}>
                      <input
                        className="input min-h-[34px]! w-[110px] py-1!"
                        type="number"
                        step="any"
                        min="0"
                        aria-label={`${s.name} ${k}`}
                        value={draft[s.id]?.[k] ?? ""}
                        onChange={(e) => setDraft((d) => ({ ...d, [s.id]: { ...d[s.id], [k]: e.target.value } }))}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn" onClick={() => dlg.current?.close()}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save actuals"}
          </button>
        </div>
      </dialog>
    </>
  );
}
