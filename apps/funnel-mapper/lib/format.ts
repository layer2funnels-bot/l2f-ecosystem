// Number formatting, same rules as the prototype (money: 2 decimals under 100, else 0).
import { CURRENCIES, type CurrencyCode } from "./graph";

/** Negative money is drawn with a true minus (U+2212) and, on screen, in the negative-money colour (class `neg`). */
export const isNeg = (v: number | null | undefined) => v != null && Number.isFinite(v) && v < 0;
export const nf = (v: number, d = 0) => (Number.isFinite(v) ? v.toLocaleString("en-GB", { maximumFractionDigits: d }) : "–");
export const sym = (c: string | undefined | null) => CURRENCIES[(c ?? "GBP") as CurrencyCode]?.symbol ?? "£";
export function money(v: number | null | undefined, cur: string = "GBP") {
  if (v == null || !Number.isFinite(v)) return "–";
  const a = Math.abs(v),
    d = a < 100 ? 2 : 0;
  return (v < 0 ? "\u2212" : "") + sym(cur) + a.toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d });
}
/** Compact money for dashboards: £12.3k */
export function moneyShort(v: number | null | undefined, cur = "GBP") {
  if (v == null || !Number.isFinite(v)) return "–";
  const a = Math.abs(v);
  if (a < 10000) return money(v, cur);
  return (v < 0 ? "\u2212" : "") + sym(cur) + (a >= 1e6 ? nf(a / 1e6, 1) + "m" : nf(a / 1e3, 1) + "k");
}
export const pct = (v: number) => (Number.isFinite(v) ? nf(v * 100, 1) + "%" : "–");
export const ratio = (v: number | null | undefined) => (v != null && Number.isFinite(v) ? nf(v, 2) + "x" : "–");
export const fmtDate = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");
export function timeAgo(s: string) {
  const t = (Date.now() - new Date(s).getTime()) / 1000;
  if (t < 60) return "just now";
  if (t < 3600) return `${Math.floor(t / 60)} min ago`;
  if (t < 86400) return `${Math.floor(t / 3600)} h ago`;
  if (t < 86400 * 30) return `${Math.floor(t / 86400)} d ago`;
  return fmtDate(s);
}

/**
 * People in the main UI (V2 data trust): whole people; under 10 one decimal with "avg" so small daily rates don't
 * read as 0. Money and percentages keep using the exact values; `peopleExact` is the hover / detail text.
 */
export function people(v: number): string {
  if (!Number.isFinite(v)) return "–";
  const a = Math.abs(v);
  // whole people everywhere on screen; a tiny value reads "<1", never "0.2 avg" (the modelled average lives in peopleExact, for tooltips)
  if (a > 0 && Math.round(a) === 0) return "<1";
  return nf(Math.round(v));
}
export function peopleExact(v: number): string {
  if (!Number.isFinite(v)) return "No data yet";
  return Math.abs(v - Math.round(v)) < 1e-9 ? nf(v) : `${nf(v, 1)} · modelled average`;
}
/** Period suffix for a figure scaled by `k` months (lib/funnel-math PERIOD_FACTORS): "/ mo", "/ day", "/ wk", "/ yr". */
export function perSuffix(k = 1): string {
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  if (near(k, 1)) return "/ mo";
  if (near(k, 12 / 365)) return "/ day";
  if (near(k, 12 / 52)) return "/ wk";
  if (near(k, 3)) return "/ qtr";
  if (near(k, 12)) return "/ yr";
  if (Number.isInteger(k) && k > 1 && k < 12) return `/ ${k} mo`;
  return `/ ${nf((k * 365) / 12)} days`;
}
/** The period in words for the strip's unit ("per month", "per week", "per 7 days"). */
export function perWord(k = 1): string {
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  if (near(k, 1)) return "per month";
  if (near(k, 12 / 365)) return "per day";
  if (near(k, 12 / 52)) return "per week";
  if (near(k, 3)) return "per quarter";
  if (near(k, 12)) return "per year";
  if (Number.isInteger(k) && k > 1 && k < 12) return `per ${k} months`;
  return `per ${nf((k * 365) / 12)} days`;
}
/** Money with its period, and the LTV tag when lifetime value is the funnel's basis: "£3,064 / mo", "£9,120 / mo LTV". */
export const moneyPer = (v: number, cur: string, k = 1, basis?: "first" | "ltv") => `${money(v, cur)} ${perSuffix(k)}${basis === "ltv" ? " LTV" : ""}`;
