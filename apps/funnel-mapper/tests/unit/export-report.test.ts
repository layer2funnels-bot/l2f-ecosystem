import { describe, expect, it } from "vitest";
import { compute, computeScenario, expenseTotals, project, sourceRows, targetPlan } from "@/lib/funnel-math";
import { blankSettings, type FunnelGraph, type FunnelNode, type FunnelSettings } from "@/lib/graph";
import { mapBounds, mapSvg, wrapText } from "@/lib/export";
import { reportData } from "@/lib/report-data";
import { builtinTemplate } from "@/lib/templates";

/** The golden quiz funnel (MASTER_HANDOFF §14) with scenarios, expenses, a forecast and a target. */
function golden(extra: Partial<FunnelSettings> = {}) {
  const t = builtinTemplate("quiz");
  const settings: FunnelSettings = {
    ...blankSettings("USD"),
    ...t.settings,
    basis: "first",
    scenarios: [
      { id: "s1", name: "Conservative", whatif: { traffic: 0.8, conv: 0.75, price: 1, cost: 1.15 } },
      { id: "s2", name: "Optimistic", whatif: { traffic: 1.25, conv: 1.2, price: 1, cost: 0.9 } },
    ],
    expenses: [
      { id: "e1", name: "Funnel software", kind: "monthly", amount: 300, category: "Software" },
      { id: "e2", name: "Payment fees", kind: "per_sale", amount: 2, category: "Other" },
      { id: "e3", name: "Launch build", kind: "one_time", amount: 1500, category: "Creative" },
    ],
    projection: { months: 6, growth: 5 },
    target: 12000,
    ...extra,
  };
  return { graph: t.graph, settings };
}

describe("PDF report data comes from the authoritative engine", () => {
  it("scenario columns are compute / computeScenario results (golden: 89.1 customers, 13.40x ROAS as mapped)", () => {
    const { graph, settings } = golden();
    const R = compute(graph, settings);
    const D = reportData(graph, settings, R);
    expect(D.scenarios.map((c) => c.name)).toEqual(["Baseline (current map)", "Conservative", "Optimistic"]);
    expect(D.scenarios[0].R.cust).toBeCloseTo(89.1, 6);
    expect(D.scenarios[0].R.rev).toBeCloseTo(6032.11, 2);
    expect(D.scenarios[0].R.roas).toBeCloseTo(13.4, 2);
    settings.scenarios.forEach((sc, i) => {
      const want = computeScenario(graph, settings, sc);
      expect(D.scenarios[i + 1].R.rev).toBe(want.rev);
      expect(D.scenarios[i + 1].R.profit).toBe(want.profit);
      expect(D.scenarios[i + 1].R.cust).toBe(want.cust);
    });
  });

  it("adds the current what-if column only when a what-if is applied, using the editor's result", () => {
    const { graph, settings } = golden({ whatif: { traffic: 2, conv: 1, price: 1, cost: 1 } });
    const R = compute(graph, settings);
    const D = reportData(graph, settings, R);
    expect(D.scenarios[1].name).toBe("Current what-if");
    expect(D.scenarios[1].R).toBe(R);
    expect(D.scenarios[0].R.traffic).toBe(2500);
    expect(R.traffic).toBe(5000);
  });

  it("forecast is project() with the funnel's months and growth", () => {
    const { graph, settings } = golden();
    const R = compute(graph, settings);
    const D = reportData(graph, settings, R);
    const rows = project(graph, settings, 6, 5);
    expect(D.forecast.rows).toEqual(rows);
    expect(D.forecast.revenue).toBeCloseTo(rows.reduce((a, r) => a + r.revenue, 0), 6);
    expect(D.forecast.profit).toBe(rows[5].cumulative);
    expect(D.forecast.mrr).toBe(rows[5].mrr);
  });

  it("offers, sources and expenses reconcile with the totals", () => {
    const { graph, settings } = golden();
    const R = compute(graph, settings);
    const D = reportData(graph, settings, R);
    const byName = Object.fromEntries(D.offers.map((o) => [o.name, o]));
    expect(byName["Paid membership"].revenue).toBeCloseTo(4199.4, 2);
    expect(byName["Membership (after call)"].revenue).toBeCloseTo(1322.81, 2);
    expect(byName["Discounted membership"].revenue).toBeCloseTo(509.9, 2);
    expect(D.offers.reduce((a, o) => a + o.revenue, 0)).toBeCloseTo(R.rev, 6);
    expect(D.offers.reduce((a, o) => a + o.share, 0)).toBeCloseTo(1, 6);
    expect(D.sources).toEqual(sourceRows(graph, settings));
    expect(D.sources.reduce((a, s) => a + s.rev, 0)).toBeCloseTo(R.rev, 6);
    // expense lines add up to the engine's total costs; one-time costs are reported separately
    expect(D.expenses.lines.reduce((a, [, v]) => a + v, 0)).toBeCloseTo(R.costs, 6);
    expect(D.expenses.total).toBe(R.costs);
    expect(D.expenses.oneTime).toBe(expenseTotals(settings.expenses).oneTime);
    expect(D.expenses.items.find((e) => e.name === "Payment fees")!.perPeriod).toBeCloseTo(2 * R.orders, 6);
    expect(R.profit).toBeCloseTo(6032.11 - 450 - 300 - 2 * R.orders, 2);
  });

  it("required numbers are targetPlan() scaled from the month to day, week and year", () => {
    const { graph, settings } = golden();
    const R = compute(graph, settings);
    const D = reportData(graph, settings, R);
    const plan = targetPlan(R, 12000);
    expect(D.goals.plan).toEqual(plan);
    const month = D.goals.required.find((r) => r[0] === "Per month")!;
    expect(month).toEqual(["Per month", 12000, plan.visitorsNeeded, plan.spendNeeded, plan.customersNeeded]);
    const year = D.goals.required.find((r) => r[0] === "Per year")!;
    expect(year[1]).toBeCloseTo(144000, 6);
    expect(year[2]).toBeCloseTo(plan.visitorsNeeded * 12, 6);
    expect(reportData(graph, { ...settings, target: 0 }, R).goals.plan).toBeNull();
  });
});

/* ---------------- map SVG ---------------- */

const n = (id: string, type: string, x: number, y: number, extra: Partial<FunnelNode> = {}): FunnelNode => ({ id, type, name: id, x, y, p: {}, ...extra }) as FunnelNode;

function canvas(): FunnelGraph {
  return {
    nodes: [
      n("ads", "fbads", 0, 0, { p: { model: "budget", visitors: 1000, spend: 200 }, s: { accent: "#10B981" } }),
      n("lp", "landing", 320, 0, { p: { cr: 40 } }),
      n("frame", "frame", -40, -60, { w: 640, h: 220, name: "Stage one", p: { color: "#10B981" } }),
      n("ell", "shape", 0, 300, { w: 120, h: 80, p: { shape: "ellipse", text: "Ellipse" } }),
      n("dia", "shape", 200, 300, { w: 120, h: 80, p: { shape: "diamond", text: "Decide" }, s: { borderStyle: "dashed" } }),
      n("img", "image", 400, 300, { w: 100, h: 60, p: { src: "data:image/png;base64,iVBORw0KGgo=", fit: "cover" } }),
      n("todo", "checklist", 600, 300, { p: { title: "Launch list", items: [{ id: "a", text: "Write ads", done: true }, { id: "b", text: "Book calls", done: false, indent: 1 }] } }),
      n("head", "label", -900, 500, { p: { text: "A very wide heading", size: 40 }, s: { underline: true, align: "center" } }),
      n("note", "note", 700, 0, { p: { text: "A sticky note with enough words to wrap over more than one line on the map" }, z: 5 }),
      n("back", "shape", 650, -20, { w: 80, h: 80, p: { shape: "rect" }, z: -1 }),
    ],
    edges: [
      { id: "e1", from: "ads", to: "lp", port: "main", share: 100, s: { path: "elbow", dash: "dashed", color: "#2563EB", width: 3, arrow: "both", label: "Cold" } },
      { id: "e2", from: "lp", to: "ads", port: "alt", share: 100, s: { kind: "nodata" } },
    ],
  } as FunnelGraph;
}

describe("map SVG export keeps the canvas elements and styles", () => {
  const g = canvas();
  const R = compute(g, blankSettings());
  const svg = mapSvg(g, R, { currency: "GBP", nums: true, widthOf: (x) => (x.id === "head" ? 600 : x.w ?? 210) });

  it("is a well-formed SVG with sized viewBox", () => {
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toMatch(/viewBox="0 0 \d+ \d+"/);
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("undefined");
  });

  it("draws shapes, images and checklists", () => {
    expect(svg).toContain("<ellipse");
    expect(svg).toMatch(/<polygon[^>]+stroke-dasharray="6 4"/);
    expect(svg).toContain('href="data:image/png;base64,iVBORw0KGgo="');
    expect(svg).toContain('preserveAspectRatio="xMidYMid slice"');
    expect(svg).toContain("Launch list");
    expect(svg).toContain(">1/2<");
    expect(svg).toMatch(/text-decoration="line-through"[^>]*>Write ads</);
    expect(svg).toContain(">Book calls<");
    expect(svg).toContain(">Stage one<");
  });

  it("keeps connection styles: path, dash, colour, width, arrows, labels, no-data", () => {
    expect(svg).toMatch(/<path d="[^"]+" fill="none" stroke="#2563EB" stroke-width="3" stroke-dasharray="8 6" marker-end="url\(#fm-a0\)" marker-start="url\(#fm-a0\)"/);
    expect(svg).toContain('<marker id="fm-a0"');
    expect(svg).toContain(">Cold<");
    expect(svg).toContain(">1,000<");
    expect(svg).toContain(">No data<");
    expect(svg).toMatch(/stroke-dasharray="9 4 2 4" opacity="0.7"/);
  });

  it("applies block and text styles", () => {
    // blocks are pictures now (V4): the box styles are gone, text styles still apply to headings
    expect(svg).toMatch(/text-anchor="middle"[^>]*text-decoration="underline"[^>]*>A very wide heading</);
  });

  it("wraps note text to the note width and keeps layer order", () => {
    const noteLines = svg.match(/fill="#422006"[^>]*>[^<]+</g) ?? [];
    expect(noteLines.length).toBeGreaterThan(2);
    expect(svg.indexOf('fill="#FDE68A"')).toBeGreaterThan(svg.indexOf('rx="0"'));
  });

  it("bounds cover every element, frame title, edge and the measured heading width", () => {
    const [, W, H] = svg.match(/viewBox="0 0 (\d+) (\d+)"/)!.map(Number);
    // heading spans x -900 → -300, note reaches x 910; frame title starts 14px above the frame
    expect(W).toBeGreaterThanOrEqual(910 + 900);
    expect(W).toBeLessThan(910 + 900 + 100);
    expect(H).toBeGreaterThan(500 + 40 - -74);
    const [x0, y0, x1, y1] = mapBounds([[0, 0, 10, 10]], ["M 0 0 C 0 200, 100 200, 100 0"]);
    expect([x0, y0, x1]).toEqual([0, 0, 100]);
    expect(y1).toBeCloseTo(150, 0); // the curve's lowest point, not its control points
  });

  it("hides numbers when asked", () => {
    const plain = mapSvg(g, R, { currency: "GBP", nums: false });
    expect(plain).not.toContain(">1,000<");
    expect(plain).toContain(">Cold<");
  });
});

describe("wrapText", () => {
  const measure = (t: string) => t.length * 10;
  it("breaks on words, keeps newlines and splits over-long words", () => {
    expect(wrapText("aaa bbb ccc", 75, 10, 400, "x", measure)).toEqual(["aaa bbb", "ccc"]);
    expect(wrapText("one\ntwo", 500, 10, 400, "x", measure)).toEqual(["one", "two"]);
    expect(wrapText("abcdefghij", 40, 10, 400, "x", measure)).toEqual(["abcd", "efgh", "ij"]);
  });
});

describe("V1 completion: report data, CSV and map export additions", () => {
  it("exports dated actuals with original period boundaries and escaped step names", async () => {
    const { actualsCsv } = await import("@/lib/export");
    const csv = actualsCsv([{ period_start: "2026-09-01", period_end: "2026-09-30", node_id: "page", visitors: 120, conversions: 30, revenue: 600, spend: 80 }], { page: 'Page, "A"' });
    expect(csv).toContain('"Period start","Period end","Step","Visitors","Conversions","Revenue","Spend"');
    expect(csv).toContain('"2026-09-01","2026-09-30","Page, ""A""","120","30","600","80"');
  });
  it("overview, leaks, reinvestment, goals and status come from the engine", async () => {
    const { graph, settings } = golden({ goals: [{ id: "g1", name: "Dream profit", kind: "profit", value: 20000, period: "month" }, { id: "g2", name: "Trial rate", kind: "conversion", value: 25, period: "month", nodeId: "quiz-tl" }], reinvest: { pct: 40, months: 6 } });
    const R = compute(graph, settings);
    const D = reportData(graph, settings, R);
    expect(D.overview.year.revenue).toBeCloseTo(R.rev * 12, 6);
    expect(D.overview.keyLeak?.name).toBe("Quiz funnel");
    expect(D.reinvest.rows).toHaveLength(6);
    expect(D.reinvest.rows[1].reinvested).toBeCloseTo(D.reinvest.rows[0].profit > 0 ? D.reinvest.rows[0].profit * 0.4 : 0, 6);
    expect(D.reinvest.plain).toEqual(project(graph, settings, 6, 5));
    const [profitGoal, rateGoal] = D.goals.items;
    expect(profitGoal.plan?.R?.profit).toBeCloseTo(20000, 2);
    expect(profitGoal.required.find(([p]) => p === "Per month")?.[2]).toBeCloseTo(20000, 2);
    expect(rateGoal.current).toBe(15);
    expect(rateGoal.impact?.N["quiz-tl"].out).toBeCloseTo(250, 6);
    expect(D.status).toMatchObject({ total: 11, done: 0, planned: 11, pct: 0 });
  });

  it("CSV carries a scenario comparison when scenarios exist", async () => {
    const { stepsCsv } = await import("@/lib/export");
    const { graph, settings } = golden();
    const R = compute(graph, settings);
    const csv = stepsCsv(graph, R, reportData(graph, settings, R).scenarios);
    expect(csv).toContain('"Scenario comparison","Baseline (current map)","Conservative","Optimistic"');
    expect(csv).toContain(`"Revenue","${R.rev.toFixed(2)}"`);
    const cons = computeScenario(graph, settings, settings.scenarios[0]);
    expect(csv).toContain(`"Profit","${compute(graph, { ...settings, whatif: { traffic: 1, conv: 1, price: 1, cost: 1 } }).profit.toFixed(2)}","${cons.profit.toFixed(2)}"`);
    expect(stepsCsv(graph, R)).not.toContain("Scenario comparison");
  });

  it("map export draws callouts, lines, arrows, link cards and rich notes as plain text; dark and transparent backgrounds", async () => {
    const { paletteFor, DARK_PALETTE } = await import("@/lib/export");
    const n = (id: string, type: string, p: Record<string, unknown>, x = 0, w = 200, h = 100): FunnelNode => ({ id, type, name: id, x, y: 0, w, h, p });
    const g: FunnelGraph = {
      nodes: [
        n("c", "shape", { shape: "callout", text: "Hello" }),
        n("l", "shape", { shape: "arrow", dir: "d1" }, 300),
        n("k", "link", { url: "https://youtu.be/abc", title: "Sales video" }, 600, 280, 64),
        n("t", "note", { text: "## Plan\n- **bold** item" }, 1000, 210, 96),
      ],
      edges: [],
      view: { x: 0, y: 0, k: 1 },
    };
    const R = compute(g, blankSettings());
    const light = mapSvg(g, R, { currency: "GBP", nums: true });
    expect(light).toMatch(/<path transform="translate\(0,0\)" d="M/);
    expect(light).toContain("<polygon points=");
    expect(light).toContain("Sales video");
    expect(light).toContain("youtu.be");
    expect(light).toContain("• bold item");
    expect(light).not.toContain("**");
    const dark = mapSvg(g, R, { currency: "GBP", nums: true, palette: paletteFor("dark") });
    expect(dark).toContain(`fill="${DARK_PALETTE.bg}"`);
    const clear = mapSvg(g, R, { currency: "GBP", nums: true, palette: paletteFor("transparent") });
    expect(clear).toContain('<rect width="100%" height="100%" fill="none"/>');
    // an empty link card is editor-only
    expect(mapSvg({ ...g, nodes: [n("k2", "link", { url: "" })] }, R, { currency: "GBP", nums: true })).not.toContain("No link");
  });
});
