// Date ranges for the map's calendar (V3 "Plan control and calendar"). Display scaling only: the engine models a month; a range
// scales Plan numbers by the same convention the engine already uses for days (lib/funnel-math periodFactor), so no calculated
// number changes. A whole calendar month is exactly 1 (not 31/30.4), several whole months are that many months, any other
// range is its days × 12 / 365.
import { periodFactor } from "./funnel-math";

/** Inclusive dates as "YYYY-MM-DD" (calendar days, no time zone). */
export interface DateRange {
  start: string;
  end: string;
}

const MS = 86_400_000;
const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const lastOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)); // m is 0-based

export const rangeDays = (r: DateRange) => Math.round((parse(r.end).getTime() - parse(r.start).getTime()) / MS) + 1;

export const monthRange = (d: Date = new Date()): DateRange => ({
  start: isoDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))),
  end: isoDate(lastOfMonth(d.getUTCFullYear(), d.getUTCMonth())),
});

/** How many months of Plan numbers the range stands for (see the header). */
export function rangeScale(r: DateRange): number {
  const a = parse(r.start),
    b = parse(r.end);
  const wholeMonths = a.getUTCDate() === 1 && isoDate(b) === isoDate(lastOfMonth(b.getUTCFullYear(), b.getUTCMonth()));
  if (wholeMonths) return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) + 1;
  return periodFactor(rangeDays(r));
}

const MON = (d: Date) => d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
/** "5 Oct 2026", "5 – 11 Oct 2026", "28 Oct – 3 Nov 2026", "1 Oct 2026 – 31 Mar 2027". */
export function rangeLabel(r: DateRange): string {
  const a = parse(r.start),
    b = parse(r.end);
  const ya = a.getUTCFullYear(),
    yb = b.getUTCFullYear();
  if (r.start === r.end) return `${a.getUTCDate()} ${MON(a)} ${ya}`;
  if (ya !== yb) return `${a.getUTCDate()} ${MON(a)} ${ya} – ${b.getUTCDate()} ${MON(b)} ${yb}`;
  if (a.getUTCMonth() === b.getUTCMonth()) return `${a.getUTCDate()} – ${b.getUTCDate()} ${MON(b)} ${yb}`;
  return `${a.getUTCDate()} ${MON(a)} – ${b.getUTCDate()} ${MON(b)} ${yb}`;
}

export interface RangePreset {
  id: "today" | "week" | "month" | "last30" | "year";
  label: string;
  get: (today: Date) => DateRange;
}
const day = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
export const RANGE_PRESETS: RangePreset[] = [
  { id: "today", label: "Today", get: (t) => ({ start: isoDate(day(t)), end: isoDate(day(t)) }) },
  {
    id: "week",
    label: "This week",
    get: (t) => {
      const d = day(t);
      const mon = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * MS); // weeks run Monday to Sunday
      return { start: isoDate(mon), end: isoDate(new Date(mon.getTime() + 6 * MS)) };
    },
  },
  { id: "month", label: "This month", get: (t) => monthRange(t) },
  { id: "last30", label: "Last 30 days", get: (t) => ({ start: isoDate(new Date(day(t).getTime() - 29 * MS)), end: isoDate(day(t)) }) },
  { id: "year", label: "This year", get: (t) => ({ start: `${t.getUTCFullYear()}-01-01`, end: `${t.getUTCFullYear()}-12-31` }) },
];

/** Which preset (if any) a range is exactly. */
export const presetOf = (r: DateRange, today: Date = new Date()) => RANGE_PRESETS.find((p) => p.get(today).start === r.start && p.get(today).end === r.end)?.id ?? null;
