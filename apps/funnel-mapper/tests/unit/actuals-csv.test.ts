import { describe, expect, it } from "vitest";
import { checkRows, guessColumns, monthRange, parseCsv, readNumber, templateCsv, toUpserts, weekRange } from "@/lib/actuals-csv";

const steps = [
  { id: "src", name: "Facebook ads" },
  { id: "q", name: "Fitness quiz" },
  { id: "c", name: "6-Week Kickstart" },
];

describe("actuals CSV import", () => {
  it("reads quoted CSV, semicolons and a BOM", () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n')).toEqual([["a", "b"], ["x, y", 'say "hi"']]);
    expect(parseCsv("a;b\n1;2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("understands months, weeks and money", () => {
    expect(monthRange("2026-09")).toEqual({ start: "2026-09-01", end: "2026-09-30" });
    expect(monthRange("Feb 2028")).toEqual({ start: "2028-02-01", end: "2028-02-29" });
    expect(monthRange("13/2026")).toBeNull();
    expect(weekRange("07/09/2026")).toEqual({ start: "2026-09-07", end: "2026-09-13" });
    expect(readNumber("£1,234.50")).toBe(1234.5);
    expect(readNumber("")).toBeNull();
    expect(readNumber("abc")).toBeNaN();
  });

  it("matches columns, reports rows that need attention in plain words, and never drops them silently", () => {
    const csv = parseCsv(
      [
        "Month,Step,People arriving,People continuing,Revenue,Ad spend",
        "2026-09,Facebook ads,2400,,,610",
        "2026-09,fitness  QUIZ,2300,1050,,",
        "2026-09,6-Week Kickstart,1050,80,\"£2,960\",",
        "2026-09,Quizz,10,5,,",
        "2026-13,Fitness quiz,1,1,,",
        "2026-09,Fitness quiz,abc,1,,",
      ].join("\n"),
    );
    const map = guessColumns(csv[0]);
    expect(map.period).toBe(0);
    expect(map.step).toBe(1);
    expect(map.values).toEqual({ visitors: 2, conversions: 3, revenue: 4, spend: 5 });
    const rows = checkRows(csv.slice(1), map, "month", steps);
    expect(rows.filter((r) => r.ok)).toHaveLength(3);
    expect(rows.filter((r) => !r.ok).map((r) => r.message)).toEqual([
      "Row 5: there is no step called “Quizz” on this map.",
      "Row 6: “2026-13” isn’t a month (for example 2026-09).",
      "Row 7: “abc” isn’t a number.",
    ]);
    const up = toUpserts(rows, "f1", "sept.csv · 8 Oct 2026");
    expect(up).toHaveLength(3);
    expect(up[2]).toMatchObject({ node_id: "c", period_start: "2026-09-01", period_end: "2026-09-30", visitors: 1050, conversions: 80, revenue: 2960, source: "csv", source_ref: "sept.csv · 8 Oct 2026" });
  });

  it("the same step and period twice in a file updates one value instead of adding two", () => {
    const csv = parseCsv("Month,Step,Revenue\n2026-09,6-Week Kickstart,100\n2026-09,6-Week Kickstart,120\n");
    const up = toUpserts(checkRows(csv.slice(1), guessColumns(csv[0]), "month", steps), "f", "x");
    expect(up).toHaveLength(1);
    expect(up[0].revenue).toBe(120);
  });

  it("offers a template file with the map's steps", () => {
    const t = templateCsv(steps, "month", ["2026-09"]);
    expect(t.split("\r\n")[0]).toBe('"Month","Step","Step id","People arriving","People continuing","Revenue","Ad spend"');
    expect(t).toContain('"2026-09","Fitness quiz","q"');
    const back = parseCsv(t);
    expect(checkRows(back.slice(1), guessColumns(back[0]), "month", steps).every((r) => !r.ok && r.message?.includes("no numbers"))).toBe(true);
  });
});
