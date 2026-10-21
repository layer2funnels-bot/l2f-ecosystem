// Client pricing model: how the agency charges a client (separate from the relationship status).
import { money } from "./format";

export const PRICING_MODELS = ["retainer", "fixed", "one_time", "hourly", "commission", "other"] as const;
export type PricingModel = (typeof PRICING_MODELS)[number];
export const PRICING_LABEL: Record<PricingModel, string> = {
  retainer: "Monthly retainer",
  fixed: "Fixed project",
  one_time: "One-time",
  hourly: "Hourly",
  commission: "Commission / revenue share",
  other: "Other",
};

export const BILLING_FREQUENCIES = ["one_time", "weekly", "monthly", "quarterly", "yearly"] as const;
export type BillingFrequency = (typeof BILLING_FREQUENCIES)[number];
export const FREQUENCY_LABEL: Record<BillingFrequency, string> = {
  one_time: "One-time",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};
const PER_MONTH: Record<BillingFrequency, number> = { one_time: 0, weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 };
const SUFFIX: Record<BillingFrequency, string> = { one_time: " one-time", weekly: "/week", monthly: "/month", quarterly: "/quarter", yearly: "/year" };

export interface ClientPricing {
  pricing_model?: string | null;
  monthly_retainer?: number | string | null;
  pricing_amount?: number | string | null;
  billing_frequency?: string | null;
  hours_per_month?: number | string | null;
  commission_pct?: number | string | null;
  project_start?: string | null;
  project_end?: string | null;
}

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
export const pricingModel = (c: ClientPricing): PricingModel => (PRICING_MODELS as readonly string[]).includes(c.pricing_model ?? "") ? (c.pricing_model as PricingModel) : "retainer";
const frequency = (c: ClientPricing): BillingFrequency => ((BILLING_FREQUENCIES as readonly string[]).includes(c.billing_frequency ?? "") ? (c.billing_frequency as BillingFrequency) : "monthly");

/**
 * Predictable recurring income from the client per month (dashboard "Agency MRR").
 * Project, one-time and commission income isn't recurring-predictable, so it counts as 0
 * (a commission client's base fee does count).
 */
export function monthlyValue(c: ClientPricing): number {
  switch (pricingModel(c)) {
    case "retainer":
      return n(c.monthly_retainer);
    case "hourly":
      return n(c.pricing_amount) * n(c.hours_per_month);
    case "commission":
      return n(c.pricing_amount);
    case "other":
      return n(c.pricing_amount) * PER_MONTH[frequency(c)];
    default:
      return 0;
  }
}

/** The headline amount for sorting ("highest value"): recurring per month, or the project / one-time fee. */
export function pricingValue(c: ClientPricing): number {
  const m = pricingModel(c);
  return m === "fixed" || m === "one_time" ? n(c.pricing_amount) : monthlyValue(c);
}

const fmtDate = (d?: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");

/** One-line description, e.g. "£1,500/month retainer", "£80/hour · ~10 h/month", "10% revenue share". Empty when nothing is set. */
export function pricingSummary(c: ClientPricing, cur: string): string {
  const amt = n(c.pricing_amount);
  switch (pricingModel(c)) {
    case "retainer":
      return n(c.monthly_retainer) > 0 ? `${money(n(c.monthly_retainer), cur)}/month retainer` : "";
    case "fixed": {
      const dates = [fmtDate(c.project_start), fmtDate(c.project_end)].filter(Boolean).join(" – ");
      return amt > 0 || dates ? `${amt > 0 ? money(amt, cur) + " " : ""}fixed project${dates ? ` (${dates})` : ""}` : "";
    }
    case "one_time":
      return amt > 0 ? `${money(amt, cur)} one-time${c.project_start ? ` (${fmtDate(c.project_start)})` : ""}` : "";
    case "hourly":
      return amt > 0 ? `${money(amt, cur)}/hour${n(c.hours_per_month) > 0 ? ` · ~${n(c.hours_per_month)} h/month` : ""}` : "";
    case "commission": {
      const parts = [n(c.commission_pct) > 0 ? `${n(c.commission_pct)}% revenue share` : "", amt > 0 ? `${money(amt, cur)}/month base` : ""].filter(Boolean);
      return parts.join(" + ");
    }
    case "other":
      return amt > 0 ? `${money(amt, cur)}${SUFFIX[frequency(c)]}` : "";
  }
}

/**
 * Fields that apply to a pricing model; the rest are reset so stale values from a previous model
 * (e.g. an old retainer) never keep counting.
 */
export function normalisePricing<T extends ClientPricing>(c: T): T {
  const m = pricingModel(c);
  const out = { ...c, pricing_model: m };
  if (m !== "retainer") out.monthly_retainer = 0;
  if (m === "retainer") out.pricing_amount = 0;
  if (m !== "hourly") out.hours_per_month = 0;
  if (m !== "commission") out.commission_pct = 0;
  if (m !== "other") out.billing_frequency = m === "fixed" || m === "one_time" ? "one_time" : "monthly";
  if (m !== "fixed" && m !== "one_time") out.project_start = null;
  if (m !== "fixed") out.project_end = null;
  return out;
}

/** Compact form for list cells: "£1,500/mo", "£5,000 fixed", "£80/h", "10% share", "£2,000 once"; "–" when unset. */
export function pricingShort(c: ClientPricing, cur: string): string {
  const amt = n(c.pricing_amount);
  switch (pricingModel(c)) {
    case "retainer":
      return n(c.monthly_retainer) > 0 ? `${money(n(c.monthly_retainer), cur)}/mo` : "–";
    case "fixed":
      return amt > 0 ? `${money(amt, cur)} fixed` : "Fixed";
    case "one_time":
      return amt > 0 ? `${money(amt, cur)} once` : "One-time";
    case "hourly":
      return amt > 0 ? `${money(amt, cur)}/h` : "Hourly";
    case "commission":
      return n(c.commission_pct) > 0 ? `${n(c.commission_pct)}% share` : "Commission";
    case "other":
      return amt > 0 ? `${money(amt, cur)}${{ one_time: " once", weekly: "/wk", monthly: "/mo", quarterly: "/qtr", yearly: "/yr" }[frequency(c)]}` : "Other";
  }
}
