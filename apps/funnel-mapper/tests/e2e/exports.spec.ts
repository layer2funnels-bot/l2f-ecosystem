import { expect, test, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { compute } from "../../lib/funnel-math";
import { money, nf } from "../../lib/format";
import { blankSettings, type FunnelGraph, type FunnelSettings } from "../../lib/graph";
import { monthlyPlanVsActual, reportData } from "../../lib/report-data";
import { builtinTemplate } from "../../lib/templates";
import { createFunnel, openEditor } from "./helpers";

// The golden quiz funnel with scenarios, expenses, a forecast and a revenue target, plus annotation elements.
const settings: Partial<FunnelSettings> = {
  basis: "first",
  scenarios: [
    { id: "s1", name: "Conservative", whatif: { traffic: 0.8, conv: 0.75, price: 1, cost: 1.15 } },
    { id: "s2", name: "Optimistic", whatif: { traffic: 1.25, conv: 1.2, price: 1, cost: 0.9 } },
  ],
  expenses: [
    { id: "e1", name: "Funnel software", kind: "monthly", amount: 300, category: "Software" },
    { id: "e2", name: "Launch build", kind: "one_time", amount: 1500, category: "Creative" },
  ],
  projection: { months: 12, growth: 5 },
  target: 12000,
};
function graph(): FunnelGraph {
  const g = builtinTemplate("quiz").graph;
  const maxX = Math.max(...g.nodes.map((n) => n.x)),
    maxY = Math.max(...g.nodes.map((n) => n.y));
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGNgYGD4z8DAwMDAwAAADwABRe/1oQAAAABJRU5ErkJggg==";
  return {
    ...g,
    nodes: [
      ...g.nodes,
      { id: "x-shape", type: "shape", name: "Shape", x: 0, y: maxY + 200, w: 160, h: 90, p: { shape: "ellipse", text: "Ellipse note" }, s: { fill: "#ECFDF5", border: "#10B981" } },
      { id: "x-img", type: "image", name: "Logo", x: 220, y: maxY + 200, w: 90, h: 90, p: { src: png, alt: "logo", fit: "contain" } },
      { id: "x-todo", type: "checklist", name: "Checklist", x: 360, y: maxY + 200, p: { title: "Launch tasks", items: [{ id: "t1", text: "Record VSL", done: true }, { id: "t2", text: "Book ads", done: false }] } },
      { id: "x-head", type: "label", name: "Heading", x: maxX + 300, y: -200, p: { text: "Quiz funnel plan", size: 32 }, s: { italic: true, color: "#047857" } },
    ],
    edges: g.edges.map((e, i) => (i === 0 ? { ...e, s: { path: "elbow", dash: "dashed", arrow: "end", label: "Cold traffic" } } : e)),
  } as FunnelGraph;
}

async function exportAs(page: Page, item: string) {
  await page.getByRole("button", { name: "Funnel menu" }).click();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: item }).click()]);
  return readFileSync((await dl.path())!);
}

test("client exports: PDF report sections match the maths; SVG/PNG keep the canvas elements and fonts", async ({ page }) => {
  const g = graph();
  const { id } = await createFunnel({ graph: g, settings, name: `E2E exports ${Date.now()}` });
  await openEditor(page, id);

  // expected values, from the same engine the app uses
  const full: FunnelSettings = { ...blankSettings(), ...settings };
  const R = compute(g, full);
  const D = reportData(g, full, R);
  // money is drawn as "£1,234" (or "-£1,234"); assertions match the digits up to the closing bracket of the PDF string
  const m = (v: number) => money(v, full.currency).replace("£", "");

  const pdf = await exportAs(page, "PDF report for client");
  writeFileSync("test-results/export-report.pdf", pdf);
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  const text = pdf.toString("latin1");
  const has = (t: string) => expect(text.includes(t), `PDF contains ${t}`).toBe(true);
  const pages = (text.match(/\/Type \/Page\b/g) ?? []).length;
  expect(pages).toBeGreaterThanOrEqual(2);
  for (const heading of ["Revenue & profit forecast: 12 months", "Scenario comparison", "Month by month", "Traffic source performance", "Offer & product revenue", "Expenses \\(per month\\)", "Goals & required numbers"]) has(`(${heading}`);
  // golden numbers (as mapped), each scenario, offers, forecast, expenses, required numbers
  has(`${m(D.scenarios[0].R.rev)})`);
  expect(m(D.scenarios[0].R.rev)).toBe("6,032");
  has("(13.4x)");
  for (const c of D.scenarios.slice(1)) {
    has(`(${c.name})`);
    has(`${m(c.R.rev)})`);
    has(`${m(c.R.profit)})`);
  }
  has("4,199)");
  has("1,323)");
  has("510)");
  has(`${m(D.forecast.revenue)})`);
  has(`${m(D.forecast.rows[11].cumulative)})`);
  has(`${m(R.costs)})`);
  has("(Funnel software)");
  has("144,000)");
  has(`(${nf(D.goals.required[2][2])})`);
  expect(/Page 1 of \d\)/.test(text), "page numbers").toBe(true);

  const svg = (await exportAs(page, "Map image (.svg)")).toString();
  expect(svg).toContain("@font-face");
  expect(svg).toMatch(/src:url\(data:font\/woff2;base64,/);
  expect(svg).toContain("<ellipse");
  expect(svg).toContain(">Ellipse note<");
  expect(svg).toContain('href="data:image/png;base64,');
  expect(svg).toContain(">Launch tasks<");
  expect(svg).toContain(">Record VSL<");
  expect(svg).toContain(">Cold traffic<");
  expect(svg).toContain("marker-end=");
  expect(svg).toMatch(/font-style="italic"[^>]*>Quiz funnel plan</);
  expect(svg).toContain(">1,500<"); // people on the Instagram connection
  const [, w, h] = svg.match(/^<svg[^>]+width="(\d+)" height="(\d+)"/)!.map(Number);

  const png = await exportAs(page, "Map image (.png)");
  expect(png.subarray(1, 4).toString()).toBe("PNG");
  expect(png.readUInt32BE(16)).toBe(w * 2);
  expect(png.readUInt32BE(20)).toBe(h * 2);
  writeFileSync("test-results/export-map.png", png);
  writeFileSync("test-results/export-map.svg", svg);
  await page.screenshot({ path: "test-results/export-canvas.png" });

  // the live editor still shows the same numbers after exporting
  await expect(page.locator(".fm-kpis")).toContainText(/Customers\s*89(?!\.)/);
  await page.locator(".fm-kpis").getByRole("button", { name: /more/ }).click();
  await expect(page.getByRole("dialog", { name: /numbers/i })).toContainText("13.4x");
});

test("PDF report: Actual vs plan page appears only with entered actuals and prints the same rows as Month-to-month", async ({ page }) => {
  const g = graph();
  const { id, sb } = await createFunnel({ graph: g, settings, name: `E2E pdf actuals ${Date.now()}` });
  await openEditor(page, id);
  const text0 = (await exportAs(page, "PDF report for client")).toString("latin1");
  expect(text0.includes("(Actual vs plan by month")).toBe(false);

  const paid = g.nodes.find((n) => n.name === "Paid membership")!;
  const ins = await sb.from("funnel_actuals").insert([
    { funnel_id: id, node_id: paid.id, period_start: "2026-01-01", period_end: "2026-01-31", revenue: 3000, spend: 400 },
    { funnel_id: id, node_id: paid.id, period_start: "2026-02-01", period_end: "2026-02-28", revenue: 4500, spend: 380 },
  ]);
  expect(ins.error).toBeNull();
  await page.reload();
  await expect(page.locator(".fm-saved")).toContainText(/Saved/);
  const text = (await exportAs(page, "PDF report for client")).toString("latin1");
  const has = (t: string) => expect(text.includes(t), `PDF contains ${t}`).toBe(true);
  has("(Actual vs plan by month");
  has("3,000)");
  has("4,500)");
  has("(Jan 26)");
  has("(Feb 26)");
  // plan numbers are the engine's, scaled to the days entered (same function the report uses)
  const full: FunnelSettings = { ...blankSettings(), ...settings };
  const rows = monthlyPlanVsActual(g, compute(g, full), [
    { node_id: paid.id, period_start: "2026-01-01", period_end: "2026-01-31", visitors: null, conversions: null, revenue: 3000, spend: 400 },
    { node_id: paid.id, period_start: "2026-02-01", period_end: "2026-02-28", visitors: null, conversions: null, revenue: 4500, spend: 380 },
  ]);
  has(`${money(rows[0].planRev, "GBP").replace("£", "")})`);
  has(`${money(rows[1].planRev, "GBP").replace("£", "")})`);
});

test("export step: PDF sections can be switched off, and the map image background is chosen there", async ({ page }) => {
  const g = graph();
  const { id } = await createFunnel({ graph: g, settings, name: `E2E export step ${Date.now()}` });
  await openEditor(page, id);
  await page.getByRole("button", { name: "Funnel menu" }).click();
  await page.getByRole("menuitem", { name: "Export options…" }).click();
  const dlg = page.getByRole("dialog", { name: "Export" });
  await expect(dlg).toBeVisible();
  // the first page (cover, map, key numbers) is always there
  await expect(dlg.getByRole("checkbox", { name: /Cover/ })).toBeDisabled();
  await dlg.getByRole("checkbox", { name: "Expenses" }).uncheck();
  await dlg.getByRole("checkbox", { name: "Goals and required numbers" }).uncheck();
  const [dl] = await Promise.all([page.waitForEvent("download"), dlg.getByRole("button", { name: "Export PDF" }).click()]);
  const text = readFileSync((await dl.path())!).toString("latin1");
  expect(text.includes("Scenario comparison")).toBe(true);
  expect(text.includes("Expenses (per month)")).toBe(false);
  expect(text.includes("Goals & required numbers")).toBe(false);
  // the image background is chosen in the step: SVG with a transparent background has no solid page fill
  await page.getByRole("button", { name: "Funnel menu" }).click();
  await page.getByRole("menuitem", { name: "Export options…" }).click();
  const dlg2 = page.getByRole("dialog", { name: "Export" });
  await dlg2.getByRole("button", { name: "SVG" }).click();
  await dlg2.getByRole("button", { name: "Transparent" }).click();
  await expect(dlg2.getByRole("button", { name: "Transparent" })).toHaveAttribute("aria-pressed", "true");
  const [svgDl] = await Promise.all([page.waitForEvent("download"), dlg2.getByRole("button", { name: "Export image" }).click()]);
  expect(readFileSync((await svgDl.path())!).toString().startsWith("<svg")).toBe(true);
});
