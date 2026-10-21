import { expect, test } from "@playwright/test";
import { blankGraph } from "../../lib/graph";
import { builtinTemplate } from "../../lib/templates";
import { DEMO_CLIENT, centre, createFunnel, drag, node, nodes, openEditor, pos, startSimulate, paletteItem } from "./helpers";

const mod = process.platform === "darwin" ? "Meta" : "Control";

test.describe("V2 editor interactions", () => {
  test("floating toolbar follows the selection and opens the inspector tabs", async ({ page }) => {
    const { id } = await createFunnel({ template: "quiz" });
    await openEditor(page, id);
    await expect(page.getByRole("toolbar")).toHaveCount(0);
    await node(page, "Quiz funnel").click();
    const tb = page.getByRole("toolbar", { name: "Block tools" });
    await expect(tb).toBeVisible();
    // it stays inside the canvas
    const stage = (await page.locator(".fm-stage").boundingBox())!;
    const box = (await tb.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(stage.x);
    expect(box.x + box.width).toBeLessThanOrEqual(stage.x + stage.width + 1);
    await tb.getByRole("button", { name: "Plan", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Plan" })).toHaveAttribute("aria-selected", "true");
    await tb.getByRole("button", { name: "Style", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Style" })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "Details" }).click();
    // the inspector names its scope and has a way back to the funnel
    await expect(page.locator(".fm-insp h3")).toHaveText("Quiz funnel");
    await page.getByRole("button", { name: "Funnel", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
  });

  test("right-click menu: rename, copy and paste style, duplicate, lock", async ({ page }) => {
    const { id } = await createFunnel({ template: "quiz" });
    await openEditor(page, id);
    const total = await nodes(page).count();
    await node(page, "Quiz funnel").click({ button: "right" });
    const menu = page.getByRole("menu", { name: "Block menu" });
    await expect(menu).toBeVisible();
    for (const item of ["Rename", "Change block type…", "Copy style", "Paste style", "Duplicate", "Lock", "Order", "Add internal note", "Set as goal", "Open in Reports", "Delete"]) await expect(menu.getByRole("menuitem", { name: item, exact: false }).first()).toBeVisible();
    await menu.getByRole("menuitem", { name: "Rename" }).click();
    await page.getByLabel("Block name").fill("Fitness quiz");
    await page.keyboard.press("Enter");
    await expect(node(page, "Fitness quiz")).toBeVisible();
    // duplicate through the menu
    await node(page, "Fitness quiz").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Duplicate" }).click();
    await expect(nodes(page)).toHaveCount(total + 1);
    await page.keyboard.press("Delete"); // the copy is selected and sits on top of the original: remove it
    await expect(nodes(page)).toHaveCount(total);
    // quick style + copy / paste style
    await node(page, "Fitness quiz").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Apply quick style" }).click();
    await page.getByRole("menuitem", { name: "Emphasis" }).click();
    await node(page, "Fitness quiz").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Copy style" }).click();
    await node(page, "Instagram traffic").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Paste style" }).click();
    await expect(page.locator(".fm-toast")).toContainText("Style pasted");
    await page.locator(".fm-toast").getByRole("button", { name: "Undo" }).click();
    // lock from the menu
    await node(page, "Fitness quiz").click({ button: "right" });
    await page.getByRole("menuitem", { name: /^Lock/ }).click();
    await expect(page.locator(".fm-lock").first()).toBeVisible();
    // empty canvas menu
    await page.locator(".react-flow__pane").click({ button: "right", position: { x: 420, y: 560 } });
    const pane = page.getByRole("menu", { name: "Canvas menu" });
    for (const item of ["Add block…", "Add text", "Add sticky note", "Add frame", "Add widget", "Select all", "Tidy up", "Zoom to fit", "Keyboard shortcuts"]) await expect(pane.getByRole("menuitem", { name: item })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(pane).toBeHidden();
  });

  test("drag a connection into empty space: Quick Add places and connects the block in one undo step", async ({ page }) => {
    const { id } = await createFunnel();
    await openEditor(page, id);
    await (await paletteItem(page, "Facebook Ads")).dragTo(page.locator(".react-flow__pane"), { targetPosition: { x: 130, y: 220 } });
    await expect(nodes(page)).toHaveCount(1);
    const fb = node(page, "Facebook Ads");
    const from = await centre(page, fb.locator(".fm-port.side.right"));
    await drag(page, from, { x: from.x + 260, y: from.y + 20 });
    const quick = page.getByRole("dialog", { name: "Add the next step" });
    await expect(quick).toBeVisible();
    // only blocks that can take people are offered: no traffic sources or layout elements
    await quick.getByRole("combobox").fill("Facebook");
    await expect(quick.getByRole("option", { name: /Facebook ads/ })).toHaveCount(0);
    await quick.getByRole("combobox").fill("Landing");
    await page.keyboard.press("Enter");
    await expect(nodes(page)).toHaveCount(2);
    await expect(page.locator("path.fm-edge")).toHaveCount(1);
    await expect(page.locator(".fm-insp h3")).toHaveText("Landing page"); // selection moved to the new block
    // one atomic undo removes the block and its connection together
    await page.locator(".react-flow__pane").click({ position: { x: 420, y: 560 } });
    await page.keyboard.press(`${mod}+z`);
    await expect(nodes(page)).toHaveCount(1);
    await expect(page.locator("path.fm-edge")).toHaveCount(0);
    // Escape cancels a Quick Add without creating anything
    await drag(page, from, { x: from.x + 260, y: from.y + 20 });
    await expect(quick).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(quick).toBeHidden();
    await expect(nodes(page)).toHaveCount(1);
  });

  test("change page type keeps the block, its place, its connections and the numbers", async ({ page }) => {
    const { id } = await createFunnel({ template: "quiz" });
    await openEditor(page, id);
    const quiz = node(page, "Quiz funnel");
    const nodeId = (await quiz.getAttribute("data-id"))!;
    const before = await pos(page, nodeId);
    const labels = await page.locator("path.fm-edge").count();
    await expect(page.locator(".fm-kpis")).toContainText("£6,032");
    await quiz.click();
    await page.getByRole("toolbar", { name: "Block tools" }).getByRole("button", { name: "Change type" }).click();
    const dlg = page.getByRole("dialog", { name: "Change page type" });
    await expect(dlg).toBeVisible();
    await dlg.getByRole("option", { name: /Survey/ }).click();
    await expect(page.locator(".fm-toast")).toContainText("Changed to Survey");
    expect(await pos(page, nodeId)).toEqual(before);
    await expect(page.locator(`.react-flow__node[data-id="${nodeId}"]`)).toBeVisible();
    await expect(page.locator("path.fm-edge")).toHaveCount(labels);
    // maths is untouched (the survey's own default is not applied over the block's values)
    await expect(page.locator(".fm-kpis")).toContainText("£6,032");
    // one undo goes back to the quiz
    await page.locator(".react-flow__pane").click({ position: { x: 420, y: 600 } });
    await page.keyboard.press(`${mod}+z`);
    await expect(node(page, "Quiz funnel").locator(".fm-ntitle small").first()).not.toContainText("Survey");
  });

  test("Wait: duration + unit, live label, invalid state, no analytics", async ({ page }) => {
    const { id } = await createFunnel();
    await openEditor(page, id);
    await (await paletteItem(page, "Wait / delay")).click();
    await expect(nodes(page)).toHaveCount(1);
    await expect(page.getByRole("tab", { name: "Analytics" })).toBeDisabled();
    await page.getByLabel("Wait for").fill("2");
    await page.getByRole("group", { name: "Unit" }).getByRole("button", { name: "Wks" }).click();
    await expect(page.locator(".fm-wait .wait-preview")).toContainText("Wait 2 weeks");
    await expect(nodes(page).first()).toContainText("Wait 2 weeks");
    await page.getByLabel("Wait for").fill("0");
    await expect(page.getByLabel("Wait for")).toHaveAttribute("aria-invalid", "true");
    await expect(nodes(page).first()).toContainText("set a duration");
    await page.getByLabel("Wait for").fill("12");
    await page.getByRole("group", { name: "Unit" }).getByRole("button", { name: "Hrs" }).click();
    // persists
    await expect(page.locator(".fm-saved")).toHaveText(/Saved/, { timeout: 20_000 });
    await page.reload();
    await expect(nodes(page).first()).toContainText("Wait 12 hours");
  });

  test("widgets: add one, read the engine's numbers, change metrics, it stays on the map", async ({ page }) => {
    const { id } = await createFunnel({ template: "quiz" });
    await openEditor(page, id);
    await page.locator(".react-flow__pane").click({ button: "right", position: { x: 420, y: 620 } });
    await page.getByRole("menuitem", { name: "Add widget" }).click();
    const w = page.locator(".fm-editor .fm-widget").first();
    await expect(w).toBeVisible();
    await expect(w).toContainText("£6,032");
    await page.getByRole("button", { name: "ROAS", exact: true }).click(); // revenue + profit are on by default
    await page.getByRole("group", { name: "Widget size" }).getByRole("button", { name: "L", exact: true }).click(); // L shows up to four
    await expect(w).toContainText("£5,582");
    await expect(w).toContainText("13.4x");
    // at most four metrics
    await page.getByRole("button", { name: "Leads", exact: true }).click();
    await expect(page.getByRole("button", { name: "Customers", exact: true })).toBeDisabled();
    // it shows in Reports too
    await page.getByRole("button", { name: "Reports", exact: true }).click();
    await expect(page.locator(".fm-rwidgets")).toContainText("£5,582");
  });

  test("Reports: grouped navigation, key leak actions, Export PDF button", async ({ page }) => {
    const { id } = await createFunnel({ template: "quiz" });
    await openEditor(page, id);
    await page.getByRole("button", { name: "Reports", exact: true }).click();
    const nav = page.getByRole("navigation", { name: "Report sections" });
    for (const g of ["Summary", "Money", "Planning"]) await expect(nav.getByRole("heading", { name: g })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export PDF" })).toBeVisible();
    await page.getByRole("button", { name: "Year", exact: true }).click();
    await expect(page.locator(".fm-rmain")).toContainText("a month");
    await page.getByRole("button", { name: "Show on map" }).first().click();
    await expect(page.locator(".fm-rmain")).toBeHidden();
    await expect(page.locator(".fm-blk.sel")).toHaveCount(1);
  });
});

test.describe("V2 pages", () => {
  test("Funnels list: status views, needs attention, health", async ({ page }) => {
    await createFunnel({ template: "quiz", name: "V2 list funnel" });
    await page.goto("/funnels");
    await expect(page.getByRole("heading", { name: "Funnels", level: 1 })).toBeVisible();
    const table = page.getByRole("table");
    await expect(table).toContainText("V2 list funnel");
    for (const v of ["All", "Live", "Proposed", "Draft", "Archived"]) await expect(page.getByRole("group", { name: "Funnel status" }).getByRole("button", { name: new RegExp(`^${v}`) })).toBeVisible();
    await page.getByRole("button", { name: "Needs attention" }).click();
    await expect(table).toContainText("to fix"); // the quiz template has one open model check
    await page.getByRole("button", { name: "Needs attention" }).click();
    await page.getByRole("group", { name: "Funnel status" }).getByRole("button", { name: /^Archived/ }).click();
    await expect(page.getByRole("cell", { name: "V2 list funnel" })).toHaveCount(0);
  });

  test("Home shows the resume card and the client pipeline; Templates preview and Settings nav work", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Good (morning|afternoon|evening)/);
    await expect(page.getByText("Continue where you left off")).toBeVisible();
    await expect(page.getByRole("link", { name: /Continue mapping/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Client pipeline" })).toBeVisible();
    await page.goto("/?range=year");
    await expect(page.getByRole("region", { name: "Totals" })).toContainText("This year");
    // the range picker: presets and a custom from / to month range
    await page.getByRole("button", { name: "This year" }).click();
    await page.getByRole("dialog", { name: "Date range" }).getByRole("button", { name: "Last 3 months" }).click();
    await expect(page).toHaveURL(/range=3m/);
    await expect(page.getByRole("region", { name: "Totals" })).toContainText("3 months");
    await page.goto("/templates");
    await page.getByRole("button", { name: /^Preview / }).first().click();
    const panel = page.getByRole("complementary", { name: /^Preview:/ });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("button", { name: "Use template" })).toBeVisible();
    await expect(panel.getByLabel("Client for this template")).toBeVisible();
    await page.goto("/settings");
    const nav = page.getByRole("navigation", { name: "Settings sections" });
    await expect(nav.getByRole("link", { name: "Team" })).toBeVisible();
    await nav.getByRole("link", { name: "Appearance" }).click();
    await expect(page.getByRole("heading", { name: "Appearance" })).toBeInViewport();
  });

  test("Share V2: permission, numbers, per-link state, preview", async ({ page }) => {
    const { id } = await createFunnel({ template: "quiz" });
    await openEditor(page, id);
    await page.getByRole("button", { name: "Share", exact: true }).click();
    const dlg = page.getByRole("dialog", { name: /^Share with/ });
    await expect(dlg.getByRole("group", { name: "Permission" })).toBeVisible();
    await dlg.getByRole("group", { name: "Permission" }).getByRole("button", { name: "View", exact: true }).click();
    await dlg.getByLabel("Show numbers").uncheck();
    await expect(dlg.getByLabel("Preview of what").first()).toContainText("Journey only");
    await dlg.getByRole("button", { name: "Create link" }).click();
    const row = dlg.locator("li").filter({ has: page.getByLabel("Permission for this link") }).first();
    await expect(row.getByLabel("Permission for this link")).toHaveValue("view");
    await expect(row).toContainText("Numbers hidden");
    await row.getByLabel("Permission for this link").selectOption("comment");
    await expect(row.getByLabel("Permission for this link")).toHaveValue("comment");
    page.once("dialog", (d) => d.accept());
    await row.getByRole("button", { name: "Revoke" }).click();
    await expect(dlg.getByText("No links yet")).toBeVisible();
  });

  test("Presentation: stages with totals; the Numbers switch hides and shows them", async ({ page }) => {
    const { id } = await createFunnel({ template: "quiz" });
    await openEditor(page, id);
    await page.getByRole("button", { name: "Present", exact: true }).click();
    const card = page.getByRole("region", { name: "Presentation" });
    await card.getByRole("button", { name: "Next stage" }).click();
    await expect(card).toContainText("Acquire");
    await expect(card).toContainText("2,500 visits");
    await page.keyboard.press("ArrowRight");
    await expect(card.getByRole("heading", { name: "Convert" })).toBeVisible();
    await expect(card).toContainText("£6,032");
  });
});

test.describe("V2 finishing pass", () => {
  test("Month-to-month: actual vs plan chart, empty state, measure switch", async ({ page }) => {
    const { id, graph, sb } = await createFunnel({ template: "quiz" });
    await openEditor(page, id);
    await page.getByRole("button", { name: "Reports", exact: true }).click();
    const nav = page.getByRole("navigation", { name: "Report sections" });
    await nav.getByRole("button", { name: "Month-to-month" }).click();
    // no actuals yet: an empty state that points at the Actuals tool
    await expect(page.getByRole("heading", { name: "Actual vs plan" })).toBeVisible();
    await expect(page.locator(".fm-rmain")).toContainText("No actuals entered yet");
    await expect(page.getByRole("button", { name: "Enter actuals" })).toBeVisible();

    // enter two months of actuals through the API, as the Actuals tool would
    const paid = graph.nodes.find((n) => n.name === "Paid membership")!;
    const ins = await sb.from("funnel_actuals").insert([
      { funnel_id: id, node_id: paid.id, period_start: "2026-01-01", period_end: "2026-01-31", revenue: 3000, spend: 400 },
      { funnel_id: id, node_id: paid.id, period_start: "2026-02-01", period_end: "2026-02-28", revenue: 4500, spend: 380 },
    ]);
    expect(ins.error).toBeNull();
    await page.reload();
    await page.getByRole("button", { name: "Reports", exact: true }).click();
    await page.getByRole("navigation", { name: "Report sections" }).getByRole("button", { name: "Month-to-month" }).click();
    const fig = page.getByRole("figure", { name: /Revenue: actual vs plan/ });
    await expect(fig).toBeVisible();
    await expect(fig.getByText("Actual", { exact: true })).toBeVisible(); // legend: actual (solid) and plan (dashed)
    await expect(fig.getByText("Plan", { exact: true })).toBeVisible();
    const tbl = page.getByRole("table", { name: "Actual vs plan by month" });
    await expect(tbl.getByRole("row", { name: /Jan 2026/ })).toContainText("£3,000");
    await expect(tbl.getByRole("row", { name: /Feb 2026/ })).toContainText("£4,500");
    await page.getByRole("group", { name: "Measure" }).getByRole("button", { name: "Ad spend" }).click();
    await expect(page.getByRole("figure", { name: /Ad spend: actual vs plan/ })).toBeVisible();
  });

  test("shared view on a phone stacks widgets in one column; on desktop they stay on the map", async ({ browser }) => {
    const { id, sb } = await createFunnel({ graph: graphWithWidget() });
    const link = await sb.from("share_links").insert({ funnel_id: id }).select("token").single();
    const phone = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: { width: 390, height: 844 } });
    const p = await phone.newPage();
    await p.goto(`/s/${link.data!.token}`);
    await expect(p.locator(".react-flow__node").first()).toBeVisible();
    await expect(p.locator(".react-flow__node-widget")).toBeHidden(); // not a tiny chip on the map
    await p.getByRole("button", { name: /^Widgets · 1/ }).click();
    const card = p.locator(".fm-shared-wg .fm-widget");
    await expect(card).toBeVisible();
    await expect(card).toContainText("£6,032");
    const box = (await card.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.width).toBeGreaterThan(390 - 60); // full width: one column
    await phone.close();

    const wide = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: { width: 1440, height: 900 } });
    const d = await wide.newPage();
    await d.goto(`/s/${link.data!.token}`);
    await expect(d.locator(".react-flow__node-widget")).toBeVisible();
    await expect(d.locator(".fm-shared-wg")).toBeHidden();
    await wide.close();
  });

  test("platform blocks carry their brand mark on the map and in the library; others keep their icon", async ({ page }) => {
    const { id } = await createFunnel({ template: "quiz" });
    await openEditor(page, id);
    // V2: platform blocks use the owner's brand art on the map; pages and offers keep their window
    await expect(node(page, "Instagram traffic").locator(".fm-form svg.fm-bmark, .fm-form img")).toHaveCount(1);
    await expect(node(page, "Quiz funnel").locator(".fm-form svg.fm-bmark")).toHaveCount(0);
    await page.getByPlaceholder(/^Search( \d+)? blocks/).fill("Facebook ads");
    await expect(page.locator(".fm-sb-t svg.fm-bmark, .fm-sb-t img").first()).toBeVisible();
  });

  test("tooltips: icon-only buttons name themselves on hover; loading states announce themselves", async ({ page }) => {
    const { id } = await createFunnel({ template: "quiz" });
    await openEditor(page, id);
    await expect(page.getByRole("button", { name: "Zoom in" })).toHaveAttribute("title", "Zoom in");
    await node(page, "Quiz funnel").click();
    const tb = page.getByRole("toolbar", { name: "Block tools" });
    await tb.getByRole("button", { name: "More actions" }).hover();
    await expect(page.locator(".fm-tip[data-tip='More actions']").first()).toBeVisible();
    // the workspace-blocks panel shows its own state instead of a blank list
    await page.getByRole("button", { name: "Workspace blocks" }).click();
    await expect(page.locator(".fm-wsblocks")).toContainText(/Saved in this workspace/);
    await expect(page.locator(".fm-wsblocks")).not.toContainText("Couldn’t load");
  });
});

function graphWithWidget() {
  const g = builtinTemplate("quiz").graph;
  return { ...g, nodes: [...g.nodes, { id: "wg1", type: "widget", name: "Funnel widget", x: -300, y: -200, p: { scope: "funnel", display: "number", metrics: ["revenue", "profit"], wsize: "M" } }] } as typeof g;
}

test.describe("V2 Simulate", () => {
  test("change a lever and the map answers: people, losses, revenue, profit and ROAS move, and Revert puts them back", async ({ page }) => {
    const { id } = await createFunnel({ template: "quiz" });
    await openEditor(page, id);
    const kpis = page.getByRole("contentinfo", { name: "Funnel numbers" });
    await expect(kpis).toContainText("£6,032");
    await startSimulate(page);
    const panel = page.getByLabel("Simulate", { exact: true });
    await expect(panel).toBeVisible();
    // nothing has changed yet: no chips, no ghost lines
    await expect(panel).toContainText("Nothing yet");
    await expect(page.locator(".fm-simchip")).toHaveCount(0);
    await expect(page.locator(".fm-edge-ghost")).toHaveCount(0);

    // 20% fewer conversions
    await panel.getByLabel("Conversion rates").fill("0.8");
    // headline numbers moved against the baseline (the KPI strip and the panel agree, both from the engine)
    await expect(kpis).not.toContainText(/Revenue\s*£6,032/);
    await expect(kpis.locator(".fm-dchip.bad").first()).toBeVisible();
    const key = panel.getByRole("region", { name: "What changed" });
    await expect(key.getByText("Revenue", { exact: true })).toBeVisible(); // revenue, profit and ROAS all fell
    await expect(key.getByText("ROAS", { exact: true })).toBeVisible();
    expect(await key.locator(".fm-dchip.bad").count()).toBeGreaterThanOrEqual(3);
    // the map shows where: more people lost at steps, thinner lines with a ghost of the old weight, a lower conversion bar tick
    await expect(page.locator(".fm-simchip").first()).toBeVisible();
    await expect(page.locator(".fm-simchip", { hasText: "lost" }).first()).toBeVisible();
    await expect(page.locator(".fm-edge-ghost").first()).toBeAttached();
    await expect(panel.getByRole("heading", { name: "What moved" })).toBeVisible();

    // traffic raises people but ad spend is neutral
    await panel.getByLabel("Traffic", { exact: true }).fill("1.5");
    await expect(panel.locator(".fm-sim-tot").getByText("Ad spend")).toBeVisible();

    // revert puts every lever back and the chips go away
    await panel.getByRole("button", { name: "Revert all" }).click();
    await expect(kpis).toContainText("£6,032");
    await expect(page.locator(".fm-simchip")).toHaveCount(0);
    await expect(panel).toContainText("Nothing yet");
  });

  test("change one block: its own rate flows through the map; the change is listed and can be undone one by one", async ({ page }) => {
    const { id } = await createFunnel({ template: "quiz" });
    await openEditor(page, id);
    await startSimulate(page);
    const panel = page.getByLabel("Simulate", { exact: true });
    await node(page, "Quiz funnel").click();
    await expect(panel.getByRole("region", { name: "One block" })).toContainText("Quiz funnel");
    const rate = panel.getByLabel("Conversion rate (%)");
    const before = Number(await rate.inputValue());
    await panel.getByRole("button", { name: "Lower Conversion rate by 10%" }).click();
    await expect.poll(async () => Number(await rate.inputValue())).toBeCloseTo(before * 0.9, 1);
    await expect(panel.getByRole("region", { name: "Your changes" })).toContainText("Quiz funnel · Conversion rate");
    // fewer people reach the next step and the quiz loses more
    await expect(node(page, "Quiz funnel").locator(".fm-simchip")).toContainText("lost");
    await expect(node(page, "7-day free trial").locator(".fm-simchip")).toContainText("in");
    // undo only that change
    await panel.getByRole("button", { name: /^Undo the change to Quiz funnel/ }).click();
    await expect.poll(async () => Number(await rate.inputValue())).toBeCloseTo(before, 1);
    await expect(page.locator(".fm-simchip")).toHaveCount(0);
  });

  test("save the levers as a scenario, try a scenario, and Done keeps the map; a viewer can't simulate", async ({ page }) => {
    const { id } = await createFunnel({ template: "quiz" });
    await openEditor(page, id);
    await startSimulate(page);
    const panel = page.getByLabel("Simulate", { exact: true });
    await panel.getByLabel("Prices").fill("1.1");
    await panel.getByLabel("Scenario name").fill("Price rise");
    await panel.getByRole("button", { name: "Save levers as scenario" }).click();
    await expect(panel.getByRole("group", { name: "Start from a scenario" }).getByRole("button", { name: "Price rise" })).toBeVisible();
    await panel.getByRole("button", { name: "Revert all" }).click();
    await expect(panel).toContainText("Nothing yet");
    await panel.getByRole("group", { name: "Start from a scenario" }).getByRole("button", { name: "Price rise" }).click();
    await expect(page.getByRole("contentinfo", { name: "Funnel numbers" }).locator(".fm-dchip.good").first()).toBeVisible();
    // Done closes Simulate and keeps the map as it is
    await panel.getByRole("button", { name: "Done" }).click();
    await expect(page.getByLabel("Simulate", { exact: true })).toHaveCount(0);
    await expect(page.locator(".fm-simchip")).toHaveCount(0);
    await expect(page.getByRole("contentinfo", { name: "Funnel numbers" })).not.toContainText(/Revenue\s*£6,032/);
    // view-only editors don't get Simulate
    await page.getByRole("button", { name: "Funnel menu" }).click();
    await page.getByLabel("View only (lock editing)").check();
    await expect(page.getByRole("button", { name: "Simulate" })).toHaveCount(0);
  });
});

test.describe("V2 Simulate: watching the funnel", () => {
  test("Play flow draws people moving along the connections in proportion to the engine's flows, and Pause stops it", async ({ page }) => {
    const { id } = await createFunnel({ template: "quiz" });
    await openEditor(page, id);
    await startSimulate(page);
    const panel = page.getByLabel("Simulate", { exact: true });
    await expect(page.locator(".fm-flowdots")).toHaveCount(0);
    const play = panel.locator(".fm-playbtn");
    await play.click();
    await expect(play).toHaveAttribute("aria-pressed", "true");
    await expect(panel.getByRole("button", { name: "Pause flow" })).toBeVisible();
    // every connection that carries people has dots, the busiest has the most, and "didn't convert" lines are orange
    const dotsOn = async (edgeLabel: string) =>
      page.locator(".react-flow__edge", { has: page.locator("path.fm-edge") }).evaluateAll((els, l) => els.filter((e) => (document.querySelector(`[data-edge="${e.getAttribute("data-id")}"]`)?.textContent ?? "").replace(/\s/g, "").startsWith(l)).map((e) => e.querySelectorAll(".fm-flowdots circle").length), edgeLabel);
    await expect(page.locator(".fm-flowdots circle").first()).toBeAttached();
    const counts = await page.locator(".react-flow__edge").evaluateAll((els) => els.map((e) => e.querySelectorAll(".fm-flowdots circle").length));
    expect(Math.max(...counts)).toBe(8);
    expect(Math.min(...counts.filter((c) => c > 0))).toBeLessThan(8);
    expect(counts.filter((c) => c > 0).length).toBeGreaterThanOrEqual(8);
    expect(await dotsOn("1,500")).toBeTruthy();
    await expect(page.locator(".fm-flowdots.alt circle").first()).toBeAttached(); // lost / didn't convert
    await expect(page.locator(".fm-lostfx i").first()).toBeAttached(); // people lost where nothing follows
    // dots are SVG animations on the line itself
    await expect(page.locator(".fm-flowdots circle animateMotion").first()).toHaveAttribute("repeatCount", "indefinite");
    await panel.getByRole("button", { name: "Pause flow" }).click();
    await expect(page.locator(".fm-flowdots")).toHaveCount(0);
    await expect(page.locator(".fm-lostfx")).toHaveCount(0);
    // changing an assumption changes how many people move (fewer dots on the quiz's outgoing line)
    const quizOut = async () => page.locator(".react-flow__edge").evaluateAll((els) => els.map((e) => e.querySelectorAll(".fm-flowdots circle").length).reduce((a, b) => a + b, 0));
    await play.click();
    const all1 = await quizOut();
    await panel.getByLabel("Traffic", { exact: true }).fill("0.25");
    await expect.poll(quizOut).toBeLessThanOrEqual(all1);
  });

  test("Before / After redraws the whole map and the KPI strip from the baseline run, without touching the funnel", async ({ page }) => {
    const { id } = await createFunnel({ template: "quiz" });
    await openEditor(page, id);
    const kpis = page.getByRole("contentinfo", { name: "Funnel numbers" });
    await startSimulate(page);
    const panel = page.getByLabel("Simulate", { exact: true });
    await page.getByRole("button", { name: "Money", exact: true }).click(); // revenue sits on the offers in the Money view
    await panel.getByLabel("Conversion rates").fill("0.8");
    await expect(kpis).not.toContainText(/Revenue\s*£6,032/);
    await expect(node(page, "Paid membership")).not.toContainText("£4,199");
    await expect(page.locator(".fm-simchip").first()).toBeVisible();
    // Before: the golden numbers everywhere, no change chips, a badge on the canvas
    await panel.getByRole("button", { name: "Before", exact: true }).click();
    await expect(kpis).toContainText("£6,032");
    await kpis.getByRole("button", { name: /more/ }).click(); // ROAS sits behind "+N more" at this width
    await expect(page.getByRole("dialog", { name: "More numbers" })).toContainText("13.4x");
    await page.keyboard.press("Escape");
    await expect(node(page, "Paid membership")).toContainText("£4,199");
    await expect(page.locator(".fm-simchip")).toHaveCount(0);
    await expect(page.locator(".fm-before-badge")).toBeVisible();
    // and After brings the changes back
    await panel.getByRole("button", { name: "After", exact: true }).click();
    await expect(kpis).not.toContainText(/Revenue\s*£6,032/);
    await expect(page.locator(".fm-before-badge")).toHaveCount(0);
    await expect(page.locator(".fm-simchip").first()).toBeVisible();
    // the funnel itself was never changed by looking at Before
    await panel.getByRole("button", { name: "Revert all" }).click();
    await expect(kpis).toContainText("£6,032");
  });

  test("with reduced motion the flow animation is off and says why", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const { id } = await createFunnel({ template: "quiz" });
    await openEditor(page, id);
    await startSimulate(page);
    const play = page.getByLabel("Simulate", { exact: true }).getByRole("button", { name: "Play flow" });
    await expect(play).toBeDisabled();
    await expect(page.locator(".fm-flowdots")).toHaveCount(0);
  });
});

test.describe("V2 QA regressions", () => {
  test("list pages hydrate without React errors and keep the saved light theme", async ({ page }) => {
    await page.goto("/templates");
    await page.evaluate(() => localStorage.setItem("fm-theme", "light"));
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message.slice(0, 120)));
    // several loads each: the old "17 min ago" text could differ between server and browser and re-render the whole page
    for (const url of ["/", "/funnels", "/clients", `/clients/${DEMO_CLIENT}`, "/funnels", `/clients/${DEMO_CLIENT}`, "/funnels"]) {
      await page.goto(url);
      await page.waitForTimeout(1200);
      expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme")), `${url} keeps the light theme`).toBe("light");
    }
    expect(errors).toEqual([]);
  });

  test("a share link shows the numbers views a client can use, but never the team's Actuals", async ({ browser }) => {
    const { id, sb } = await createFunnel({ template: "quiz" });
    const link = await sb.from("share_links").insert({ funnel_id: id }).select("token").single();
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const p = await ctx.newPage();
    await p.goto(`/s/${link.data!.token}`);
    await expect(p.locator(".react-flow__node").first()).toBeVisible();
    // V2 shared view: the map and the KPI strip; the team's Actuals are never part of it
    await expect(p.getByRole("contentinfo", { name: "Funnel numbers" })).toBeVisible();
    await expect(p.getByRole("tab", { name: "Actuals" })).toHaveCount(0);
    expect(await p.locator("body").innerText()).not.toMatch(/Actuals/);
    await ctx.close();
  });

  test("phone overflow menu lists each action once and the clients list defaults to cards", async ({ browser }) => {
    const { id } = await createFunnel({ template: "quiz" });
    const ctx = await browser.newContext({ storageState: "tests/e2e/.auth/demo.json", viewport: { width: 430, height: 932 } });
    const p = await ctx.newPage();
    await p.goto(`/funnels/${id}`);
    await expect(p.locator(".fm-editor")).toBeVisible();
    await p.getByRole("button", { name: "More", exact: true }).click();
    for (const name of ["Present", "Version history", "Simulate…", "Tidy up"]) await expect(p.getByRole("menuitem", { name, exact: true }), name).toHaveCount(1);
    await p.keyboard.press("Escape");
    // a wide table does not fit a phone: cards unless the person chose otherwise
    await p.goto("/clients");
    await expect(p.getByRole("button", { name: "Card view" })).toHaveAttribute("aria-pressed", "true");
    await ctx.close();
  });

  test("a client with many funnels shows the newest ones and offers the rest", async ({ page }) => {
    // the demo client has far more than a page of funnels once the suite has run; make sure there are at least 30 anyway
    const { sb } = await createFunnel({ template: "quiz", name: "Portfolio paging 0" });
    const have = (await sb.from("funnels").select("id", { count: "exact", head: true }).eq("client_id", DEMO_CLIENT)).count ?? 0;
    for (let k = have; k < 30; k++) await createFunnel({ graph: blankGraph(), name: `Portfolio paging ${k + 1}` });
    await page.goto(`/clients/${DEMO_CLIENT}`);
    const cards = page.getByRole("list", { name: "Funnels" }).getByRole("listitem");
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeLessThanOrEqual(48);
    expect(await cards.count()).toBeGreaterThanOrEqual(24);
    await expect(page.getByText(/Showing the \d+ most recently updated of \d+ funnels/)).toBeVisible();
    await expect(page.getByRole("link", { name: /^Show all \d+$/ })).toHaveAttribute("href", /all=1/);
    // the newest funnel is on the first page
    await expect(page.getByRole("link", { name: /Open Portfolio paging 0/ })).toBeVisible();
  });
});
