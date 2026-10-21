import { describe, expect, it } from "vitest";
import { monthlyValue, normalisePricing, pricingShort, pricingSummary, pricingValue } from "@/lib/pricing";
import { clientFormSchema } from "@/lib/schemas";

describe("client pricing model", () => {
  it("existing clients (no pricing model yet) read as monthly retainers", () => {
    const legacy = { monthly_retainer: 1500 };
    expect(monthlyValue(legacy)).toBe(1500);
    expect(pricingSummary(legacy, "GBP")).toBe("£1,500/month retainer");
    expect(pricingShort({ pricing_model: "retainer", monthly_retainer: 0 }, "GBP")).toBe("–");
  });

  it("monthly value per model", () => {
    expect(monthlyValue({ pricing_model: "hourly", pricing_amount: 80, hours_per_month: 10 })).toBe(800);
    expect(monthlyValue({ pricing_model: "commission", commission_pct: 10, pricing_amount: 250 })).toBe(250);
    expect(monthlyValue({ pricing_model: "other", pricing_amount: 1200, billing_frequency: "yearly" })).toBe(100);
    expect(monthlyValue({ pricing_model: "other", pricing_amount: 300, billing_frequency: "quarterly" })).toBe(100);
    expect(monthlyValue({ pricing_model: "fixed", pricing_amount: 5000 })).toBe(0);
    expect(monthlyValue({ pricing_model: "one_time", pricing_amount: 900 })).toBe(0);
    expect(pricingValue({ pricing_model: "fixed", pricing_amount: 5000 })).toBe(5000);
  });

  it("summaries", () => {
    expect(pricingSummary({ pricing_model: "fixed", pricing_amount: 5000, project_start: "2026-01-05", project_end: "2026-03-31" }, "GBP")).toBe("£5,000 fixed project (5 Jan 2026 – 31 Mar 2026)");
    expect(pricingSummary({ pricing_model: "hourly", pricing_amount: 80, hours_per_month: 10 }, "USD")).toBe("$80.00/hour · ~10 h/month");
    expect(pricingSummary({ pricing_model: "commission", commission_pct: 10, pricing_amount: 250 }, "GBP")).toBe("10% revenue share + £250/month base");
    expect(pricingSummary({ pricing_model: "other", pricing_amount: 1200, billing_frequency: "yearly" }, "GBP")).toBe("£1,200/year");
    expect(pricingShort({ pricing_model: "commission", commission_pct: 12.5 }, "GBP")).toBe("12.5% share");
  });

  it("switching model clears the previous model's fields", () => {
    const n = normalisePricing({ pricing_model: "fixed", monthly_retainer: 1500, pricing_amount: 5000, hours_per_month: 4, commission_pct: 10, billing_frequency: "yearly", project_start: "2026-01-01", project_end: "2026-02-01" });
    expect(n).toMatchObject({ monthly_retainer: 0, pricing_amount: 5000, hours_per_month: 0, commission_pct: 0, billing_frequency: "one_time", project_start: "2026-01-01", project_end: "2026-02-01" });
    const r = normalisePricing({ pricing_model: "retainer", monthly_retainer: 900, pricing_amount: 5000, project_start: "2026-01-01" });
    expect(r).toMatchObject({ monthly_retainer: 900, pricing_amount: 0, project_start: null, billing_frequency: "monthly" });
  });

  it("form validation", () => {
    const ok = clientFormSchema.parse({ name: "A", pricing_model: "hourly", pricing_amount: "75", hours_per_month: "12", project_start: "" });
    expect(ok).toMatchObject({ pricing_model: "hourly", pricing_amount: 75, hours_per_month: 12, project_start: null });
    expect(clientFormSchema.parse({ name: "B" })).toMatchObject({ pricing_model: "retainer", monthly_retainer: 0 });
    expect(clientFormSchema.safeParse({ name: "C", pricing_model: "barter" }).success).toBe(false);
    expect(clientFormSchema.safeParse({ name: "D", pricing_model: "commission", commission_pct: "120" }).success).toBe(false);
    expect(clientFormSchema.safeParse({ name: "E", pricing_model: "fixed", project_start: "not-a-date" }).success).toBe(false);
  });
});
