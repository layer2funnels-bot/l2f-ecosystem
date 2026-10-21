import { describe, expect, it } from "vitest";
import { byCurrencyRows, homeRange } from "@/lib/home-range";

const today = new Date("2026-10-08T12:00:00Z");
describe("Home date range", () => {
  it("presets cover whole months ending this month (or last year)", () => {
    expect(homeRange("month", undefined, undefined, today)).toMatchObject({ from: "2026-10", to: "2026-10", months: 1, start: "2026-10-01", end: "2026-10-31" });
    expect(homeRange("3m", undefined, undefined, today)).toMatchObject({ from: "2026-08", months: 3 });
    expect(homeRange("6m", undefined, undefined, today)).toMatchObject({ from: "2026-05", months: 6 });
    expect(homeRange("year", undefined, undefined, today)).toMatchObject({ from: "2026-01", to: "2026-10", months: 10 });
    expect(homeRange("lastyear", undefined, undefined, today)).toMatchObject({ from: "2025-01", to: "2025-12", months: 12, end: "2025-12-31" });
  });
  it("a custom range is from / to months (either order); a bad one falls back to this month", () => {
    expect(homeRange("custom", "2026-06", "2026-03", today)).toMatchObject({ from: "2026-03", to: "2026-06", months: 4, label: "Mar 2026 – Jun 2026" });
    expect(homeRange("custom", "2026-13", "x", today).key).toBe("month");
  });
  it("money is kept per currency, never added together", () => {
    expect(byCurrencyRows([{ cur: "GBP", v: 100 }, { cur: "USD", v: 50 }, { cur: "GBP", v: 20 }])).toEqual([{ cur: "GBP", v: 120 }, { cur: "USD", v: 50 }]);
  });
});
