// Actuals CSV import (V2 F4): choose file → match columns → check → import. Pure functions, no I/O, so every step is
// testable. Rows land in the existing funnel_actuals table (one row per step and period); a value already there for
// the same step and period is updated, never added twice. Rows that can't be read are reported in plain words and
// are never dropped silently.

export type PeriodType = "month" | "week";
export type ValueField = "visitors" | "conversions" | "revenue" | "spend";
export const VALUE_FIELDS: [ValueField, string][] = [
  ["visitors", "People arriving"],
  ["conversions", "People continuing"],
  ["revenue", "Revenue"],
  ["spend", "Ad spend"],
];

export interface ColumnMap {
  period: number;
  step: number;
  values: Partial<Record<ValueField, number>>;
}

/** RFC 4180-ish CSV: quoted fields, escaped quotes, CRLF or LF, a leading BOM. Commas or semicolons. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const delim = (src.split(/\r?\n/)[0].match(/;/g)?.length ?? 0) > (src.split(/\r?\n/)[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** Best guess of which column holds what, from the header names. */
export function guessColumns(header: string[]): ColumnMap {
  const h = header.map(norm);
  const find = (...names: string[]) => h.findIndex((x) => names.some((n) => x === n || x.startsWith(n)));
  return {
    period: find("month", "week", "period", "date", "period start", "start"),
    step: find("step", "block", "stage", "page", "name"),
    values: Object.fromEntries(
      (
        [
          ["visitors", find("people arriving", "visitors", "visits", "arriving", "people in", "in")],
          ["conversions", find("people continuing", "conversions", "continuing", "converted", "out", "customers", "leads")],
          ["revenue", find("revenue", "sales", "income")],
          ["spend", find("ad spend", "spend", "cost")],
        ] as [ValueField, number][]
      ).filter(([, i]) => i >= 0),
    ),
  };
}

export interface StepRef {
  id: string;
  name: string;
}
export interface CheckedRow {
  line: number;
  ok: boolean;
  /** Plain-words reason when not ok. */
  message?: string;
  node_id?: string;
  period_start?: string;
  period_end?: string;
  values?: Partial<Record<ValueField, number | null>>;
}

const pad = (n: number) => String(n).padStart(2, "0");
const isoDate = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "2026-09", "Sep 2026", "September 2026", "2026-09-01", "09/2026" → the month's first and last day. */
export function monthRange(raw: string): { start: string; end: string } | null {
  const s = raw.trim().toLowerCase();
  let y = NaN,
    m = NaN;
  let r = s.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
  if (r) [y, m] = [Number(r[1]), Number(r[2])];
  r = r ? r : s.match(/^(\d{1,2})[/.](\d{4})$/);
  if (r && Number.isNaN(y)) [m, y] = [Number(r[1]), Number(r[2])];
  const w = s.match(/^([a-z]{3})[a-z]*\.?\s+(\d{4})$/);
  if (w && MONTHS.includes(w[1])) [m, y] = [MONTHS.indexOf(w[1]) + 1, Number(w[2])];
  if (!(y >= 2000 && y <= 2100 && m >= 1 && m <= 12)) return null;
  return { start: isoDate(new Date(Date.UTC(y, m - 1, 1))), end: isoDate(new Date(Date.UTC(y, m, 0))) };
}
/** A week given by its first day ("2026-09-07" or "07/09/2026") → that day and six days later. */
export function weekRange(raw: string): { start: string; end: string } | null {
  const s = raw.trim();
  let d: Date | null = null;
  let r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (r) d = new Date(Date.UTC(Number(r[1]), Number(r[2]) - 1, Number(r[3])));
  r = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (r) d = new Date(Date.UTC(Number(r[3]), Number(r[2]) - 1, Number(r[1])));
  if (!d || Number.isNaN(d.getTime())) return null;
  return { start: isoDate(d), end: isoDate(new Date(d.getTime() + 6 * 86400000)) };
}

/** "1,234.50", "£1,234", "12%" → number; "" → null (left empty); anything else → NaN. */
export function readNumber(raw: string): number | null {
  const s = raw.trim().replace(/[£$€₹\s]|AED|USD|GBP|EUR/gi, "").replace(/,(?=\d{3}(\D|$))/g, "");
  if (s === "") return null;
  const n = Number(s.replace(/%$/, ""));
  return Number.isFinite(n) ? n : NaN;
}

/** Check every data row against the map's steps. Matching a step by name ignores case and spacing; an id works too. */
export function checkRows(rows: string[][], map: ColumnMap, periodType: PeriodType, steps: StepRef[]): CheckedRow[] {
  const byName = new Map<string, StepRef[]>();
  for (const s of steps) byName.set(norm(s.name), [...(byName.get(norm(s.name)) ?? []), s]);
  const byId = new Map(steps.map((s) => [s.id, s]));
  return rows.map((cells, i) => {
    const line = i + 2; // the header is line 1
    const get = (c: number) => (c >= 0 ? (cells[c] ?? "").trim() : "");
    const p = periodType === "month" ? monthRange(get(map.period)) : weekRange(get(map.period));
    if (map.period < 0 || !p) return { line, ok: false, message: `Row ${line}: “${get(map.period) || "(empty)"}” isn’t a ${periodType === "month" ? "month (for example 2026-09)" : "week start date (for example 2026-09-07)"}.` };
    const stepRaw = get(map.step);
    const hit = byId.get(stepRaw) ? [byId.get(stepRaw)!] : (byName.get(norm(stepRaw)) ?? []);
    if (!stepRaw || !hit.length) return { line, ok: false, message: `Row ${line}: there is no step called “${stepRaw || "(empty)"}” on this map.` };
    if (hit.length > 1) return { line, ok: false, message: `Row ${line}: ${hit.length} steps are called “${stepRaw}”. Use the step id from the template file.` };
    const values: Partial<Record<ValueField, number | null>> = {};
    for (const [f] of VALUE_FIELDS) {
      const c = map.values[f];
      if (c == null || c < 0) continue;
      const v = readNumber(get(c));
      if (v != null && Number.isNaN(v)) return { line, ok: false, message: `Row ${line}: “${get(c)}” isn’t a number.` };
      if (v != null && v < 0) return { line, ok: false, message: `Row ${line}: ${VALUE_FIELDS.find(([k]) => k === f)![1].toLowerCase()} can’t be negative.` };
      values[f] = v;
    }
    if (!Object.values(values).some((v) => v != null)) return { line, ok: false, message: `Row ${line}: no numbers to import.` };
    return { line, ok: true, node_id: hit[0].id, period_start: p.start, period_end: p.end, values };
  });
}

/** Rows ready to upsert (later rows for the same step and period win, as in the file). */
export function toUpserts(checked: CheckedRow[], funnelId: string, sourceRef: string) {
  const out = new Map<string, Record<string, unknown>>();
  for (const r of checked) {
    if (!r.ok) continue;
    const k = `${r.node_id}|${r.period_start}|${r.period_end}`;
    const prev = out.get(k) ?? {};
    const vals = Object.fromEntries(Object.entries(r.values!).filter(([, v]) => v != null));
    out.set(k, { ...prev, funnel_id: funnelId, node_id: r.node_id, period_start: r.period_start, period_end: r.period_end, ...vals, source: "csv", source_ref: sourceRef });
  }
  return [...out.values()];
}

/** A template file for the map's steps (wide: one row per step and month). */
export function templateCsv(steps: StepRef[], periodType: PeriodType, periods: string[]): string {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const head = [periodType === "month" ? "Month" : "Week starting", "Step", "Step id", "People arriving", "People continuing", "Revenue", "Ad spend"].map(q).join(",");
  const lines = periods.flatMap((p) => steps.map((s) => [p, s.name, s.id, "", "", "", ""].map(q).join(",")));
  return [head, ...lines].join("\r\n") + "\r\n";
}
