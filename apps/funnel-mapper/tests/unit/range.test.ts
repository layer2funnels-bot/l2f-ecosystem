import { describe, expect, it } from "vitest";
import { monthRange, presetOf, rangeDays, rangeLabel, rangeScale, RANGE_PRESETS } from "../../lib/range";
import { periodFactor } from "../../lib/funnel-math";

describe("map calendar ranges", () => {
  it("a whole calendar month is exactly one month, whatever its length", () => {
    expect(rangeScale({ start: "2026-10-01", end: "2026-10-31" })).toBe(1);
    expect(rangeScale({ start: "2026-02-01", end: "2026-02-28" })).toBe(1);
  });
  it("whole months add up; a calendar year is twelve", () => {
    expect(rangeScale({ start: "2026-10-01", end: "2026-12-31" })).toBe(3);
    expect(rangeScale({ start: "2026-01-01", end: "2026-12-31" })).toBe(12);
  });
  it("any other range scales by its days with the engine's own convention", () => {
    expect(rangeScale({ start: "2026-10-05", end: "2026-10-11" })).toBeCloseTo(periodFactor(7), 12);
    expect(rangeScale({ start: "2026-10-05", end: "2026-10-05" })).toBeCloseTo(periodFactor(1), 12);
    expect(rangeDays({ start: "2026-10-05", end: "2026-10-11" })).toBe(7);
  });
  it("labels read the way the design writes them", () => {
    expect(rangeLabel({ start: "2026-10-01", end: "2026-10-31" })).toBe("1 – 31 Oct 2026");
    expect(rangeLabel({ start: "2026-10-05", end: "2026-10-05" })).toBe("5 Oct 2026");
    expect(rangeLabel({ start: "2026-10-28", end: "2026-11-03" })).toBe("28 Oct – 3 Nov 2026");
    expect(rangeLabel({ start: "2026-12-20", end: "2027-01-05" })).toBe("20 Dec 2026 – 5 Jan 2027");
  });
  it("presets are exact and recognised", () => {
    const today = new Date(Date.UTC(2026, 9, 9)); // Fri 9 Oct 2026
    const get = (id: string) => RANGE_PRESETS.find((p) => p.id === id)!.get(today);
    expect(get("today")).toEqual({ start: "2026-10-09", end: "2026-10-09" });
    expect(get("week")).toEqual({ start: "2026-10-05", end: "2026-10-11" });
    expect(get("month")).toEqual(monthRange(today));
    expect(get("last30")).toEqual({ start: "2026-09-10", end: "2026-10-09" });
    expect(get("year")).toEqual({ start: "2026-01-01", end: "2026-12-31" });
    expect(presetOf({ start: "2026-10-05", end: "2026-10-11" }, today)).toBe("week");
    expect(presetOf({ start: "2026-10-06", end: "2026-10-11" }, today)).toBeNull();
  });
});
