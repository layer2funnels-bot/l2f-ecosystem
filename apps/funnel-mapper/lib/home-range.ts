// Home date range (V2 F5): presets and a custom month range. Plan figures are per month, so a range multiplies them by
// its number of months; recorded actuals are summed for periods that fall inside it. Money is never added across
// currencies: each currency gets its own row.
export type RangeKey = "month" | "3m" | "6m" | "year" | "lastyear" | "custom";
export const RANGE_PRESETS: [RangeKey, string][] = [
  ["month", "This month"],
  ["3m", "Last 3 months"],
  ["6m", "Last 6 months"],
  ["year", "This year"],
  ["lastyear", "Last year"],
  ["custom", "Custom range"],
];

export interface HomeRange {
  key: RangeKey;
  label: string;
  /** First month "YYYY-MM" and last month, inclusive. */
  from: string;
  to: string;
  months: number;
  /** First and last day (ISO), for actuals. */
  start: string;
  end: string;
}

const ym = (y: number, m: number) => {
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const valid = (s: string | undefined) => !!s && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

export function homeRange(key: string | undefined, from?: string, to?: string, today = new Date()): HomeRange {
  const y = today.getUTCFullYear(),
    m = today.getUTCMonth();
  let k = (RANGE_PRESETS.find(([x]) => x === key)?.[0] ?? "month") as RangeKey;
  let a = ym(y, m),
    b = ym(y, m);
  if (k === "3m") a = ym(y, m - 2);
  if (k === "6m") a = ym(y, m - 5);
  if (k === "year") a = ym(y, 0);
  if (k === "lastyear") [a, b] = [ym(y - 1, 0), ym(y - 1, 11)];
  if (k === "custom") {
    if (valid(from) && valid(to)) [a, b] = from! <= to! ? [from!, to!] : [to!, from!];
    else k = "month";
  }
  const [ay, am] = a.split("-").map(Number),
    [by, bm] = b.split("-").map(Number);
  const months = (by - ay) * 12 + (bm - am) + 1;
  const end = new Date(Date.UTC(by, bm, 0)).toISOString().slice(0, 10);
  const fmt = (s: string) => new Date(`${s}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
  const label = k === "custom" ? (a === b ? fmt(a) : `${fmt(a)} – ${fmt(b)}`) : RANGE_PRESETS.find(([x]) => x === k)![1];
  return { key: k, label, from: a, to: b, months, start: `${a}-01`, end };
}

/** Sum per currency, largest first; one row per currency (never added together). */
export function byCurrencyRows(rows: { cur: string; v: number }[]): { cur: string; v: number }[] {
  const m = new Map<string, number>();
  rows.forEach((r) => m.set(r.cur, (m.get(r.cur) ?? 0) + (Number.isFinite(r.v) ? r.v : 0)));
  return [...m.entries()].map(([cur, v]) => ({ cur, v })).sort((x, y) => Math.abs(y.v) - Math.abs(x.v));
}
