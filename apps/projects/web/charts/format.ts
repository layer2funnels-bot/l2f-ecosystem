// Number, date and axis helpers shared by the chart kit. Everything goes through Intl so it follows the viewer's locale.
const nf = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const pf = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 0 });
const cf = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

export const fmtNum = (n: number): string => nf.format(n);
export const fmtCompact = (n: number): string => cf.format(n);
/** Fraction 0..1 -> "34%". */
export const fmtShare = (fraction: number): string => pf.format(Number.isFinite(fraction) ? fraction : 0);
/** Minutes -> "12.5 h" (hours with at most one decimal). */
export const fmtHrs = (minutes: number): string => `${nf.format(Math.round((minutes / 60) * 10) / 10)} h`;
/** Minutes -> "1 h 30 m". */
export function fmtDur(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${nf.format(m)} m`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${nf.format(h)} h ${r} m` : `${nf.format(h)} h`;
}
export const plural = (n: number, one: string, many = `${one}s`): string => `${fmtNum(n)} ${n === 1 ? one : many}`;

const parse = (s: string): Date => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const dShort = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const dLong = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
/** 'YYYY-MM-DD' -> "Nov 6". */
export const dateShort = (s: string): string => dShort.format(parse(s));
/** 'YYYY-MM-DD' -> "Fri, Nov 6, 2026". */
export const dateLong = (s: string): string => dLong.format(parse(s));

/** "Nice" axis for 0..max: steps of 1, 2, 5 x 10^k. `integer` keeps the step a whole number (counts). */
export function niceAxis(max: number, count = 4, integer = true): { ticks: number[]; max: number } {
  const top = Math.max(max, integer ? 1 : 0.0001);
  const raw = top / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  let step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
  if (integer) step = Math.max(1, Math.ceil(step));
  const n = Math.max(1, Math.ceil(top / step - 1e-9));
  return { ticks: Array.from({ length: n + 1 }, (_, i) => i * step), max: n * step };
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Cut a label to roughly `px` pixels at ~6.2 px per character. */
export function clip(label: string, px: number): string {
  const chars = Math.max(3, Math.floor(px / 6.2));
  return label.length > chars ? `${label.slice(0, chars - 1)}…` : label;
}

export const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'chart';
