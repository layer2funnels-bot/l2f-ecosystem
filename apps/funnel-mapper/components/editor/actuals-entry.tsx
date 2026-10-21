"use client";
// Month-to-month actuals (V2 F4, "V2-actuals-entry"): two equal ways in, "Type it in" and "Import CSV".
//   Type it in: a grid of steps × months (or weeks) for one measure at a time; paste a block straight from a sheet;
//   every change saves on its own; each cell shows its difference from the plan as a signed chip.
//   Import CSV: choose a file → match its columns → check the rows (plain-words messages) → import. A template file
//   with this map's steps is offered. Imported values are tagged Actual · CSV with the file name and date.
// Both write the existing funnel_actuals rows (one per step and period); the plan is never written to.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { checkRows, guessColumns, parseCsv, templateCsv, toUpserts, VALUE_FIELDS, type ColumnMap, type PeriodType, type ValueField } from "@/lib/actuals-csv";
import { money, nf } from "@/lib/format";
import { planVsActual, stepRows } from "@/lib/funnel-math";
import { DAYS_PER_PERIOD } from "@/lib/report-data";
import type { ActualRowDb } from "@/lib/schemas";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useEditor } from "@/lib/editor/store";
import { download } from "./exporters";

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const days = (a: string, b: string) => Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1);

/** The last 6 months (this one included) or the last 8 weeks (starting Mondays). */
export function recentPeriods(type: PeriodType, today = new Date()): { start: string; end: string; label: string }[] {
  if (type === "month")
    return Array.from({ length: 6 }, (_, i) => {
      const s = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 5 + i, 1));
      const e = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + 1, 0));
      return { start: iso(s), end: iso(e), label: s.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }) };
    });
  const t = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const monday = new Date(t.getTime() - ((t.getUTCDay() + 6) % 7) * 86400000);
  return Array.from({ length: 8 }, (_, i) => {
    const s = new Date(monday.getTime() - (7 - i) * 7 * 86400000);
    const e = new Date(s.getTime() + 6 * 86400000);
    return { start: iso(s), end: iso(e), label: s.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) };
  });
}

export function ActualsEntry({ rows, onSaved, onClose, initialTab = "type" }: { rows: ActualRowDb[]; onSaved: () => void; onClose: () => void; initialTab?: "type" | "csv" }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<"type" | "csv">(initialTab);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog ref={ref} className="modal fm-actentry" aria-labelledby="ae-title" onCancel={(e) => (e.preventDefault(), onClose())}>
      <h3 id="ae-title">Actuals</h3>
      <p className="help -mt-2 mb-3">Record what really happened, month by month or week by week, and compare it with the plan. Typed and imported numbers are treated the same.</p>
      <div className="seg fm-aetabs" role="tablist" aria-label="How to add actuals">
        <button type="button" role="tab" aria-selected={tab === "type"} onClick={() => setTab("type")}>
          Type it in
        </button>
        <button type="button" role="tab" aria-selected={tab === "csv"} onClick={() => setTab("csv")}>
          Import CSV
        </button>
      </div>
      {tab === "type" ? <TypeGrid rows={rows} onSaved={onSaved} /> : <CsvImport onSaved={onSaved} />}
      <div className="mt-4 flex justify-end">
        <button type="button" className="btn" onClick={onClose}>
          Done
        </button>
      </div>
    </dialog>
  );
}

function TypeGrid({ rows, onSaved }: { rows: ActualRowDb[]; onSaved: () => void }) {
  const funnelId = useEditor((s) => s.funnelId);
  const nodes = useEditor((s) => s.nodes);
  const edges = useEditor((s) => s.edges);
  const R = useEditor((s) => s.R);
  const cur = useEditor((s) => s.settings.currency);
  const ro = useEditor((s) => s.readOnly);
  const [ptype, setPtype] = useState<PeriodType>("month");
  const [field, setField] = useState<ValueField>("visitors");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [state, setState] = useState<{ t: string; err?: boolean } | null>(null);
  const periods = useMemo(() => recentPeriods(ptype), [ptype]);
  const steps = useMemo(() => {
    const all = stepRows({ nodes, edges }, R);
    return field === "revenue" ? all.filter((s) => s.cat === "offer") : field === "spend" ? all.filter((s) => s.cat === "traffic" || s.cat === "action") : all;
  }, [nodes, edges, R, field]);
  const key = (node: string, p: { start: string; end: string }) => `${node}|${p.start}|${p.end}|${field}`;
  const saved = useCallback((node: string, p: { start: string; end: string }) => rows.find((r) => r.node_id === node && r.period_start === p.start && r.period_end === p.end), [rows]);
  const valueOf = (node: string, p: { start: string; end: string }) => {
    const k = key(node, p);
    if (k in edits) return edits[k];
    const v = saved(node, p)?.[field];
    return v == null ? "" : String(v);
  };
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<Record<string, string>>({});
  const flush = useCallback(async () => {
    const batch = pending.current;
    pending.current = {};
    const up: Record<string, unknown>[] = [];
    for (const [k, raw] of Object.entries(batch)) {
      const [node_id, start, end, f] = k.split("|");
      const s = raw.trim().replace(/,/g, "");
      const v = s === "" ? null : Number(s);
      if (v != null && (!Number.isFinite(v) || v < 0)) {
        setState({ t: `“${raw}” isn’t a number, so it wasn’t saved.`, err: true });
        continue;
      }
      up.push({ funnel_id: funnelId, node_id, period_start: start, period_end: end, [f]: v, source: "manual", source_ref: null });
    }
    if (!up.length) return;
    setState({ t: "Saving…" });
    const { error } = await supabaseBrowser().from("funnel_actuals").upsert(up as never, { onConflict: "funnel_id,period_start,period_end,node_id" });
    if (error) return setState({ t: `Not saved: ${error.message}. Your typing is kept; try again.`, err: true });
    setState({ t: "Saved" });
    onSaved();
  }, [funnelId, onSaved]);
  const change = (k: string, v: string) => {
    setEdits((e) => ({ ...e, [k]: v }));
    pending.current[k] = v;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  // paste a block from a spreadsheet: rows go down the steps, columns across the periods
  const paste = (e: React.ClipboardEvent, si: number, pi: number) => {
    const text = e.clipboardData.getData("text/plain");
    if (!/[\t\n]/.test(text)) return;
    e.preventDefault();
    text
      .replace(/\r/g, "")
      .split("\n")
      .filter((l) => l !== "")
      .forEach((line, dr) =>
        line.split("\t").forEach((cell, dc) => {
          const s = steps[si + dr],
            p = periods[pi + dc];
          if (s && p) change(key(s.id, p), cell.trim());
        }),
      );
  };
  const plan = (stepId: string, p: { start: string; end: string }) => {
    const r = planVsActual({ nodes, edges }, R, [], days(p.start, p.end) / DAYS_PER_PERIOD).find((x) => x.id === stepId);
    if (!r) return NaN;
    return field === "visitors" ? r.planIn : field === "conversions" ? r.planOut : field === "revenue" ? r.planRev : r.planSpend;
  };
  const fmt = (v: number) => (field === "revenue" || field === "spend" ? money(v, cur) : nf(Math.round(v)));
  return (
    <div role="tabpanel" aria-label="Type it in">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="seg" role="group" aria-label="Period">
          <button type="button" aria-pressed={ptype === "month"} onClick={() => setPtype("month")}>
            Monthly
          </button>
          <button type="button" aria-pressed={ptype === "week"} onClick={() => setPtype("week")}>
            Weekly
          </button>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span>Measure</span>
          <select className="input w-auto!" value={field} onChange={(e) => setField(e.target.value as ValueField)}>
            {VALUE_FIELDS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        {state && (
          <span className={`ml-auto text-sm ${state.err ? "text-bad" : "text-muted"}`} role={state.err ? "alert" : "status"}>
            {state.t}
          </span>
        )}
      </div>
      <div className="fm-tblwrap max-h-[55vh] overflow-auto" tabIndex={0} role="region" aria-label="Actuals grid (scrolls sideways when it is wider than the screen)">
        <table className="tbl fm-aegrid">
          <thead>
            <tr>
              <th>Step</th>
              {periods.map((p) => (
                <th key={p.start} className="r">
                  {p.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {steps.map((s, si) => (
              <tr key={s.id}>
                <th scope="row">{s.name}</th>
                {periods.map((p, pi) => {
                  const v = valueOf(s.id, p);
                  const n = v.trim() === "" ? null : Number(v.replace(/,/g, ""));
                  const pl = plan(s.id, p);
                  const d = n != null && Number.isFinite(n) && pl > 0 ? n / pl - 1 : null;
                  const src = saved(s.id, p)?.source;
                  return (
                    <td key={p.start}>
                      <input className="input" inputMode="decimal" disabled={ro} aria-label={`${s.name}, ${p.label}, ${VALUE_FIELDS.find(([k]) => k === field)![1]}`} value={v} placeholder={Number.isFinite(pl) ? fmt(pl) : ""} onChange={(e) => change(key(s.id, p), e.target.value)} onPaste={(e) => paste(e, si, pi)} />
                      {d != null && (
                        <small className={`fm-dchip ${(field === "spend" ? d <= 0 : d >= 0) ? "good" : "bad"}`} title={`Plan ${fmt(pl)}`}>
                          {d >= 0 ? "▲ +" : "▼ −"}
                          {nf(Math.abs(d) * 100, 1)}%
                        </small>
                      )}
                      {src === "csv" && v !== "" && <small className="fm-src">CSV</small>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="help mt-2">The faint number in an empty cell is the plan for that period. Paste a block from a sheet into any cell. Changes save as you go.</p>
    </div>
  );
}

function CsvImport({ onSaved }: { onSaved: () => void }) {
  const funnelId = useEditor((s) => s.funnelId);
  const nodes = useEditor((s) => s.nodes);
  const edges = useEditor((s) => s.edges);
  const R = useEditor((s) => s.R);
  const name = useEditor((s) => s.name);
  const ro = useEditor((s) => s.readOnly);
  const [file, setFile] = useState<{ name: string; rows: string[][] } | null>(null);
  const [map, setMap] = useState<ColumnMap | null>(null);
  const [ptype, setPtype] = useState<PeriodType>("month");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ t: string; err?: boolean } | null>(null);
  const steps = useMemo(() => stepRows({ nodes, edges }, R).map((s) => ({ id: s.id, name: s.name })), [nodes, edges, R]);
  const header = file?.rows[0] ?? [];
  const checked = useMemo(() => (file && map ? checkRows(file.rows.slice(1), map, ptype, steps) : []), [file, map, ptype, steps]);
  const ok = checked.filter((r) => r.ok),
    bad = checked.filter((r) => !r.ok);
  const read = async (f: File) => {
    setDone(null);
    if (f.size > 2_000_000) return setDone({ t: "That file is over 2 MB. Split it into smaller files.", err: true });
    const rows = parseCsv(await f.text());
    if (rows.length < 2) return setDone({ t: "That file has no rows under its header.", err: true });
    setFile({ name: f.name, rows });
    const m = guessColumns(rows[0]);
    setMap(m);
    if (/week/i.test(rows[0][m.period] ?? "")) setPtype("week");
  };
  const run = async () => {
    if (!file) return;
    setBusy(true);
    const ref = `${file.name} · ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
    const up = toUpserts(checked, funnelId, ref);
    const { error } = await supabaseBrowser().from("funnel_actuals").upsert(up as never, { onConflict: "funnel_id,period_start,period_end,node_id" });
    setBusy(false);
    if (error) return setDone({ t: `Nothing was imported: ${error.message}`, err: true });
    setDone({ t: `${up.length} ${up.length === 1 ? "value set" : "value sets"} imported from ${file.name}.${bad.length ? ` ${bad.length} ${bad.length === 1 ? "row was" : "rows were"} not imported (listed above).` : ""}` });
    onSaved();
  };
  const col = (label: string, value: number, set: (i: number) => void) => (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-bold">{label}</span>
      <select className="input" value={value} onChange={(e) => set(Number(e.target.value))}>
        <option value={-1}>Not in this file</option>
        {header.map((h, i) => (
          <option key={i} value={i}>
            {h || `Column ${i + 1}`}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div role="tabpanel" aria-label="Import CSV">
      <ol className="fm-aesteps">
        <li className={file ? "done" : "cur"}>Choose file</li>
        <li className={file && map ? "cur" : ""}>Match columns</li>
        <li className={file && map ? "cur" : ""}>Check</li>
        <li>Import</li>
      </ol>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="btn">
          <Icon name="upload" /> Choose CSV file
          <input type="file" accept=".csv,text/csv" className="sr-only" disabled={ro} onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} aria-label="Choose CSV file" />
        </label>
        <button type="button" className="btn ghost" onClick={() => download(`${name || "funnel"} actuals template.csv`, templateCsv(steps, ptype, recentPeriods(ptype).map((p) => (ptype === "month" ? p.start.slice(0, 7) : p.start))), "text/csv")}>
          <Icon name="download" /> Download a template
        </button>
        {file && <span className="text-sm text-muted">{file.name}</span>}
      </div>
      {file && map && (
        <>
          <div className="mb-3 grid gap-3 sm:grid-cols-3">
            {col("Month or week", map.period, (i) => setMap({ ...map, period: i }))}
            {col("Step", map.step, (i) => setMap({ ...map, step: i }))}
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-bold">Period is a</span>
              <select className="input" value={ptype} onChange={(e) => setPtype(e.target.value as PeriodType)}>
                <option value="month">Month (2026-09)</option>
                <option value="week">Week starting (2026-09-07)</option>
              </select>
            </label>
            {VALUE_FIELDS.map(([f, l]) => (
              <div key={f}>{col(l, map.values[f] ?? -1, (i) => setMap({ ...map, values: { ...map.values, [f]: i } }))}</div>
            ))}
          </div>
          <p className={`text-sm font-bold ${bad.length ? "text-attention" : ""}`} role="status">
            {ok.length} {ok.length === 1 ? "row" : "rows"} ready{bad.length ? `, ${bad.length} ${bad.length === 1 ? "needs" : "need"} attention` : ""}
          </p>
          {bad.length > 0 && (
            <ul className="fm-aebad">
              {bad.slice(0, 50).map((r) => (
                <li key={r.line}>{r.message}</li>
              ))}
              {bad.length > 50 && <li>…and {bad.length - 50} more.</li>}
            </ul>
          )}
          <button type="button" className="btn primary mt-2" disabled={busy || !ok.length || ro} onClick={run}>
            {busy ? "Importing…" : `Import ${ok.length} ${ok.length === 1 ? "row" : "rows"}`}
          </button>
        </>
      )}
      {done && (
        <p className={`mt-3 text-sm ${done.err ? "text-bad" : ""}`} role={done.err ? "alert" : "status"}>
          {done.t}
        </p>
      )}
      <p className="help mt-3">Columns: a month (or a week’s first day), the step’s name as on the map, and any of people arriving, people continuing, revenue and ad spend. A value already saved for the same step and period is updated, never added twice.</p>
    </div>
  );
}
