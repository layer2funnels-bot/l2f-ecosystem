import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { builtinTemplate } from "../../lib/templates";
import { centre, createFunnel, drag, nodes, openEditor, waitSaved } from "./helpers";

const mod = process.platform === "darwin" ? "Meta" : "Control";
const W = (id: string, x: number, y: number, p: Record<string, unknown>) => ({ id, type: "widget", name: "Widget", x, y, p });

// The widget system (approved V2 scope): scopes, Number / Trend / Chart, up to four of nine metrics, S/M/L, MRR and Goal progress,
// on the map, in Clean, in Reports, on a phone, with its empty and error states. Every figure comes from the engine.
test.describe("Widgets", () => {
  test("lifecycle: select, move onto the grid, duplicate, delete, undo, and it survives a reload", async ({ page }) => {
    const { id, graph } = await createFunnel({ template: "quiz" });
    await openEditor(page, id);
    await page.locator(".react-flow__pane").click({ button: "right", position: { x: 420, y: 620 } });
    await page.getByRole("menuitem", { name: "Add widget" }).click();
    const widgets = page.locator(".react-flow__node-widget");
    await expect(widgets).toHaveCount(1);
    await expect(page.getByRole("tab", { name: "Details" })).toBeVisible(); // selected: its own inspector
    const total = graph.nodes.length + 1;
    await expect(nodes(page)).toHaveCount(total);

    // move: it lands on the snap grid (10px)
    const w = widgets.first();
    const from = await centre(page, w);
    await drag(page, from, { x: from.x + 83, y: from.y + 47 });
    const t = await w.evaluate((el) => (el as HTMLElement).style.transform);
    const [, x, y] = t.match(/translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)/)!.map(Number);
    expect(x % 10, "x on grid").toBe(0);
    expect(y % 10, "y on grid").toBe(0);

    // duplicate (Ctrl/Cmd+D): two widgets with the same settings
    await w.click();
    await page.keyboard.press(`${mod}+d`);
    await expect(widgets).toHaveCount(2);
    // delete the copy, undo brings it back
    await page.keyboard.press("Delete");
    await expect(widgets).toHaveCount(1);
    await page.keyboard.press(`${mod}+z`);
    await expect(widgets).toHaveCount(2);
    await waitSaved(page);

    await page.reload();
    await expect(page.locator(".react-flow__node-widget")).toHaveCount(2);
    await expect(page.locator(".react-flow__node-widget").first()).toContainText("£6,032");
  });

  test("every approved display and metric reads the engine: MRR detail, Goal progress, Trend and Chart, with their empty and error states", async ({ page }) => {
    const g = builtinTemplate("quiz").graph;
    const nodesWithWidgets = [
      ...g.nodes,
      W("wa", 0, -330, { scope: "funnel", display: "number", metrics: ["mrr", "customers", "goal", "conversion"], wsize: "L" }),
      W("wb", 420, -330, { scope: "funnel", display: "trend", metrics: ["revenue"], wsize: "M", trend: "month" }),
      W("wc", 700, -330, { scope: "funnel", display: "chart", metrics: ["revenue"], wsize: "L" }),
      W("wd", 1040, -330, { scope: "frame", frameId: "gone", display: "number", metrics: ["revenue"], wsize: "M" }),
      W("we", 1320, -330, { scope: "funnel", display: "number", metrics: ["leads", "cpa"], wsize: "M" }),
    ];
    const { id } = await createFunnel({ graph: { ...g, nodes: nodesWithWidgets } as typeof g, settings: { goals: [{ id: "g1", name: "Revenue goal", kind: "revenue", value: 10000 }] } as never });
    await openEditor(page, id);
    const get = (wid: string) => page.locator(`.react-flow__node-widget[data-id="${wid}"]`);
    // MRR widget: current MRR, month 12 and subscribers; Goal progress: 6,032 of 10,000
    await expect(get("wa")).toContainText("£6,032");
    await expect(get("wa")).toContainText("60.3%");
    await expect(get("wa")).toContainText("Month 12");
    await expect(get("wa")).toContainText("subscribers");
    await expect(get("wa")).toContainText(/Customers \/ mo\s*89/); // customers (whole people)
    await expect(get("wa")).toContainText("3.6%"); // conversion
    // Trend with no actuals says so rather than showing a made-up comparison
    await expect(get("wb")).toContainText("no actuals yet");
    // Chart draws the monthly projection
    await expect(get("wc").locator("svg.wg-chart path.line")).toBeAttached();
    // a widget whose frame was deleted explains itself and does not show numbers
    await expect(get("wd")).toContainText("frame was removed");
    await expect(get("wd")).not.toContainText("£");
    // leads and CPA
    await expect(get("we")).toContainText("1,000");
    await expect(get("we")).toContainText("£5.05");
    // Clean map keeps widgets (they are not part of the numbers layer on blocks)
    await page.getByRole("button", { name: "Clean", exact: true }).click();
    await expect(get("wa")).toBeVisible();
    // Reports: cards are as tall as their content, one column on a phone
    await page.getByRole("button", { name: "Reports", exact: true }).click();
    const cards = page.locator(".fm-rwidgets .fm-widget");
    await expect(cards).toHaveCount(5);
    const small = await cards.nth(4).boundingBox(); // leads + CPA (M)
    const big = await cards.nth(0).boundingBox(); // four metrics (L)
    expect(small!.height).toBeLessThan(big!.height);
  });

  test("widgets are one column in Reports and an S chip on the editor map on a phone", async ({ page }) => {
    const g = builtinTemplate("quiz").graph;
    const { id } = await createFunnel({ graph: { ...g, nodes: [...g.nodes, W("wa", 0, -330, { scope: "funnel", display: "number", metrics: ["revenue", "profit"], wsize: "L" })] } as typeof g });
    await page.setViewportSize({ width: 390, height: 844 });
    await openEditor(page, id);
    const chip = page.locator('.react-flow__node-widget[data-id="wa"] .fm-widget');
    await expect(chip).toBeVisible();
    expect((await chip.boundingBox())!.width).toBeLessThanOrEqual(152);
    await page.getByRole("button", { name: "Reports", exact: true }).click().catch(async () => {
      await page.getByRole("button", { name: "Reports", exact: true }).click();
    });
    const card = page.locator(".fm-rwidgets .fm-widget").first();
    await expect(card).toBeVisible();
    expect((await card.boundingBox())!.width).toBeGreaterThan(390 - 60);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });
});

test("exports draw widgets like the canvas: numbers, MRR detail and the 12-month chart", async ({ page }) => {
  const g = builtinTemplate("quiz").graph;
  const nodesWithWidgets = [
    ...g.nodes,
    W("wa", 0, -330, { scope: "funnel", display: "number", metrics: ["mrr", "customers"], wsize: "M" }),
    W("wb", 300, -330, { scope: "funnel", display: "chart", metrics: ["revenue"], wsize: "L" }),
  ];
  const { id } = await createFunnel({ graph: { ...g, nodes: nodesWithWidgets } as typeof g });
  await openEditor(page, id);
  await page.getByRole("button", { name: "Funnel menu" }).click();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Map image (.svg)" }).click()]);
  const svg = readFileSync((await dl.path())!).toString();
  expect(svg).toContain(">Revenue<");
  expect(svg).toContain(">£6,032<");
  expect(svg).toMatch(/Month 12 £[\d,]+ · [\d.]+ subscribers/);
  // the Chart widget's line: a closed filled area plus a stroked path in the brand colour
  expect(svg).toMatch(/<path d="M[^"]+Z" fill="#[0-9A-Fa-f]{6}" fill-opacity="\.14"\/><path d="M[^"]+" fill="none" stroke="#[0-9A-Fa-f]{6}" stroke-width="2"/);
});
