// Named time horizons (quarters and years) generated around today, like Cascade's "Q4 2026" / "Year 2026" periods,
// plus the rule for whether a goal falls inside a chosen period.
export interface Horizon { id: string; label: string; start: string; end: string }
export interface Period { start: string; end: string; label?: string }

const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Quarters and calendar years for the previous, current and next year, in time order. */
export function horizonsAround(today: string): Horizon[] {
  const y = Number(today.slice(0, 4));
  const out: Horizon[] = [];
  for (const year of [y - 1, y, y + 1]) {
    for (let q = 1; q <= 4; q++) {
      const sm = (q - 1) * 3 + 1, em = sm + 2;
      out.push({ id: `q${q}-${year}`, label: `Q${q} ${year}`, start: `${year}-${pad(sm)}-01`, end: `${year}-${pad(em)}-${pad(lastDay(year, em))}` });
    }
    out.push({ id: `y-${year}`, label: `Year ${year}`, start: `${year}-01-01`, end: `${year}-12-31` });
  }
  return out;
}

/** The quarter containing today. */
export const currentQuarter = (today: string): Horizon => {
  const y = today.slice(0, 4), q = Math.floor((Number(today.slice(5, 7)) - 1) / 3) + 1;
  return horizonsAround(today).find((h) => h.id === `q${q}-${y}`)!;
};

/** A goal is in the period when its own date range overlaps it. A goal with no dates is never hidden by a period. */
export function inPeriod(g: { start_date: string | null; due_date: string | null }, p: Period | null): boolean {
  if (!p) return true;
  const a = g.start_date ?? g.due_date, b = g.due_date ?? g.start_date;
  if (!a || !b) return true;
  return a <= p.end && b >= p.start;
}
